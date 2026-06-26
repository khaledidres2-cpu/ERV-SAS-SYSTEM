"""
UAE SaaS Billing / ERP — FastAPI application (main.py)

Wires together: auth + RBAC, multi-tenant data isolation (PostgreSQL RLS),
Decimal VAT engine, race-safe numbering, bilingual tax-invoice PDF, email
delivery, Stripe online payments + webhook, and an append-only audit log.

Run:  uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
"""

from __future__ import annotations

import os

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

import payments as pay
from audit import write_audit
from auth import (
    CurrentUser, create_access_token, get_current_user, hash_password,
    require_role, verify_password,
)
from db import close_pool, init_pool, raw_tx, tenant_tx
from emailer import send_invoice_email
from money import compute_document, next_document_number, q2
from pdf import build_invoice_pdf
from schemas import (
    CheckoutIn, CompanyRegister, CompanyUpdate, CustomerIn, InvoiceIn, LoginIn,
    PaymentIn, QuotationIn, SendInvoiceIn, TokenOut, UserInviteIn,
)

CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(title="UAE Billing SaaS API", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
#  Tenant-bound connection dependency (one ACID transaction per request)
# --------------------------------------------------------------------------- #
async def tdb(current: CurrentUser = Depends(get_current_user)):
    async with tenant_tx(current.company_id) as conn:
        yield conn


# ============================ AUTH ========================================== #
@app.post("/auth/register-company", response_model=TokenOut, status_code=201)
async def register_company(body: CompanyRegister):
    async with raw_tx() as conn:
        async with conn.transaction():
            if await conn.fetchval("SELECT 1 FROM users WHERE email=$1", body.email):
                raise HTTPException(409, "Email already registered")
            company = await conn.fetchrow(
                "INSERT INTO companies (name, trn) VALUES ($1,$2) RETURNING id",
                body.company_name, body.trn,
            )
            user = await conn.fetchrow(
                """INSERT INTO users (company_id, email, full_name, password_hash, role)
                   VALUES ($1,$2,$3,$4,'admin') RETURNING id""",
                company["id"], body.email, body.admin_name, hash_password(body.password),
            )
    token = create_access_token(user["id"], company["id"], "admin")
    return TokenOut(access_token=token, company_id=str(company["id"]),
                    user_id=str(user["id"]), role="admin")


@app.post("/auth/login", response_model=TokenOut)
async def login(body: LoginIn):
    async with raw_tx() as conn:
        user = await conn.fetchrow(
            "SELECT id, company_id, role, password_hash, is_active FROM users WHERE email=$1",
            body.email,
        )
    if not user or not user["is_active"] or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token = create_access_token(user["id"], user["company_id"], user["role"])
    return TokenOut(access_token=token, company_id=str(user["company_id"]),
                    user_id=str(user["id"]), role=user["role"])


@app.get("/me")
async def me(current: CurrentUser = Depends(get_current_user)):
    async with raw_tx() as conn:
        row = await conn.fetchrow(
            """SELECT u.id, u.full_name, u.email, u.role,
                      c.id AS company_id, c.name AS company_name, c.trn, c.currency, c.vat_rate
               FROM users u JOIN companies c ON c.id=u.company_id WHERE u.id=$1""",
            current.user_id,
        )
    if not row:
        raise HTTPException(404, "User not found")
    return dict(row)


# ============================ COMPANY PROFILE ============================== #
@app.get("/company")
async def get_company(conn=Depends(tdb), current: CurrentUser = Depends(get_current_user)):
    row = await conn.fetchrow(
        """SELECT id, name, legal_name, trn, address, email, phone, currency,
                  vat_rate, invoice_prefix, quote_prefix, logo_url
           FROM companies WHERE id=$1""", current.company_id)
    return dict(row)


@app.put("/company")
async def update_company(body: CompanyUpdate, conn=Depends(tdb),
                         current: CurrentUser = Depends(require_role("admin"))):
    fields = body.model_dump(exclude_unset=True, exclude_none=True)
    if not fields:
        raise HTTPException(400, "No fields to update")
    cols = list(fields.keys())
    sets = ", ".join(f"{c}=${i+2}" for i, c in enumerate(cols))
    row = await conn.fetchrow(
        f"UPDATE companies SET {sets}, updated_at=now() WHERE id=$1 RETURNING *",
        current.company_id, *[fields[c] for c in cols],
    )
    await write_audit(conn, company_id=current.company_id, user_id=current.user_id,
                      action="company.update", entity="company",
                      entity_id=str(current.company_id), meta={"fields": cols})
    return dict(row)


# ============================ USERS / RBAC ================================== #
@app.get("/users")
async def list_users(conn=Depends(tdb), current: CurrentUser = Depends(require_role("admin"))):
    rows = await conn.fetch(
        "SELECT id, full_name, email, role, is_active, created_at FROM users WHERE company_id=$1 ORDER BY created_at",
        current.company_id,
    )
    return [dict(r) for r in rows]


@app.post("/users", status_code=201)
async def invite_user(body: UserInviteIn, conn=Depends(tdb),
                      current: CurrentUser = Depends(require_role("admin"))):
    if body.role not in ("admin", "accountant", "staff", "viewer"):
        raise HTTPException(400, "Invalid role")
    async with raw_tx() as raw:  # users table is not under RLS
        if await raw.fetchval("SELECT 1 FROM users WHERE email=$1", body.email):
            raise HTTPException(409, "Email already registered")
        user = await raw.fetchrow(
            """INSERT INTO users (company_id, email, full_name, password_hash, role)
               VALUES ($1,$2,$3,$4,$5) RETURNING id, full_name, email, role""",
            current.company_id, body.email, body.full_name,
            hash_password(body.password), body.role,
        )
    await write_audit(conn, company_id=current.company_id, user_id=current.user_id,
                      action="user.invite", entity="user", entity_id=str(user["id"]),
                      meta={"email": body.email, "role": body.role})
    return dict(user)


# ============================ CUSTOMERS ===================================== #
@app.get("/customers")
async def list_customers(conn=Depends(tdb), current: CurrentUser = Depends(get_current_user)):
    rows = await conn.fetch(
        "SELECT * FROM customers WHERE company_id=$1 ORDER BY created_at DESC", current.company_id)
    return [dict(r) for r in rows]


@app.post("/customers", status_code=201)
async def create_customer(body: CustomerIn, conn=Depends(tdb),
                          current: CurrentUser = Depends(require_role("staff"))):
    row = await conn.fetchrow(
        """INSERT INTO customers (company_id, name, trn, email, phone, address, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *""",
        current.company_id, body.name, body.trn, body.email, body.phone, body.address, body.notes,
    )
    await write_audit(conn, company_id=current.company_id, user_id=current.user_id,
                      action="customer.create", entity="customer", entity_id=str(row["id"]),
                      meta={"name": body.name})
    return dict(row)


# ============================ QUOTATIONS ==================================== #
@app.get("/quotations")
async def list_quotations(conn=Depends(tdb), current: CurrentUser = Depends(get_current_user)):
    rows = await conn.fetch(
        """SELECT q.*, c.name AS customer_name FROM quotations q
           JOIN customers c ON c.id=q.customer_id
           WHERE q.company_id=$1 ORDER BY q.created_at DESC""", current.company_id)
    return [dict(r) for r in rows]


@app.post("/quotations", status_code=201)
async def create_quotation(body: QuotationIn, conn=Depends(tdb),
                           current: CurrentUser = Depends(require_role("staff"))):
    doc = compute_document(body.items)
    prefix = await conn.fetchval("SELECT quote_prefix FROM companies WHERE id=$1", current.company_id)
    number = await next_document_number(conn, current.company_id, "quotation", prefix or "QUO")
    quote = await conn.fetchrow(
        """INSERT INTO quotations
             (company_id, customer_id, quote_number, currency, issue_date, expiry_date,
              subtotal, vat_amount, total, notes)
           VALUES ($1,$2,$3,$4,COALESCE($5,CURRENT_DATE),$6,$7,$8,$9,$10) RETURNING *""",
        current.company_id, body.customer_id, number, body.currency, body.issue_date,
        body.expiry_date, doc["subtotal"], doc["vat_amount"], doc["total"], body.notes,
    )
    for pos, it in enumerate(doc["items"]):
        await conn.execute(
            """INSERT INTO quotation_items
                 (company_id, quotation_id, description, quantity, unit_price, vat_rate,
                  line_subtotal, line_vat, line_total, position)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)""",
            current.company_id, quote["id"], it["description"], it["quantity"], it["unit_price"],
            it["vat_rate"], it["line_subtotal"], it["line_vat"], it["line_total"], pos,
        )
    await write_audit(conn, company_id=current.company_id, user_id=current.user_id,
                      action="quotation.create", entity="quotation", entity_id=str(quote["id"]),
                      meta={"number": number, "total": str(doc["total"])})
    return dict(quote)


@app.post("/quotations/{quote_id}/convert", status_code=201)
async def convert_quotation(quote_id: str, conn=Depends(tdb),
                            current: CurrentUser = Depends(require_role("accountant"))):
    quote = await conn.fetchrow(
        "SELECT * FROM quotations WHERE id=$1 AND company_id=$2", quote_id, current.company_id)
    if not quote:
        raise HTTPException(404, "Quotation not found")
    items = await conn.fetch(
        "SELECT * FROM quotation_items WHERE quotation_id=$1 ORDER BY position", quote_id)

    prefix = await conn.fetchval("SELECT invoice_prefix FROM companies WHERE id=$1", current.company_id)
    number = await next_document_number(conn, current.company_id, "invoice", prefix or "INV")
    inv = await conn.fetchrow(
        """INSERT INTO invoices
             (company_id, customer_id, quotation_id, invoice_number, currency,
              subtotal, vat_amount, total, amount_paid, amount_due, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$8,$9) RETURNING *""",
        current.company_id, quote["customer_id"], quote_id, number, quote["currency"],
        quote["subtotal"], quote["vat_amount"], quote["total"], quote["notes"],
    )
    for it in items:
        await conn.execute(
            """INSERT INTO invoice_items
                 (company_id, invoice_id, description, quantity, unit_price, vat_rate,
                  line_subtotal, line_vat, line_total, position)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)""",
            current.company_id, inv["id"], it["description"], it["quantity"], it["unit_price"],
            it["vat_rate"], it["line_subtotal"], it["line_vat"], it["line_total"], it["position"],
        )
    await conn.execute("UPDATE quotations SET status='accepted' WHERE id=$1", quote_id)
    await write_audit(conn, company_id=current.company_id, user_id=current.user_id,
                      action="quotation.convert", entity="invoice", entity_id=str(inv["id"]),
                      meta={"from_quote": quote["quote_number"], "invoice": number})
    return dict(inv)


# ============================ INVOICES ====================================== #
@app.get("/invoices")
async def list_invoices(conn=Depends(tdb), current: CurrentUser = Depends(get_current_user)):
    rows = await conn.fetch(
        """SELECT i.*, c.name AS customer_name,
                  (i.status NOT IN ('paid','cancelled') AND i.due_date < CURRENT_DATE) AS is_overdue
           FROM invoices i JOIN customers c ON c.id=i.customer_id
           WHERE i.company_id=$1 ORDER BY i.created_at DESC""", current.company_id)
    return [dict(r) for r in rows]


async def _load_invoice_bundle(conn, invoice_id, company_id):
    inv = await conn.fetchrow(
        """SELECT i.*, c.name AS customer_name, c.trn AS customer_trn,
                  c.address AS customer_address, c.email AS customer_email
           FROM invoices i JOIN customers c ON c.id=i.customer_id
           WHERE i.id=$1 AND i.company_id=$2""", invoice_id, company_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    items = await conn.fetch(
        "SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY position", invoice_id)
    company = await conn.fetchrow(
        "SELECT name, trn, address, email, phone FROM companies WHERE id=$1", company_id)
    return inv, items, company


@app.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, conn=Depends(tdb),
                      current: CurrentUser = Depends(get_current_user)):
    inv, items, _ = await _load_invoice_bundle(conn, invoice_id, current.company_id)
    pmts = await conn.fetch(
        "SELECT * FROM payments WHERE invoice_id=$1 ORDER BY payment_date", invoice_id)
    return {"invoice": dict(inv), "items": [dict(i) for i in items],
            "payments": [dict(p) for p in pmts]}


@app.post("/invoices", status_code=201)
async def create_invoice(body: InvoiceIn, conn=Depends(tdb),
                         current: CurrentUser = Depends(require_role("staff"))):
    doc = compute_document(body.items)
    prefix = await conn.fetchval("SELECT invoice_prefix FROM companies WHERE id=$1", current.company_id)
    number = await next_document_number(conn, current.company_id, "invoice", prefix or "INV")
    inv = await conn.fetchrow(
        """INSERT INTO invoices
             (company_id, customer_id, invoice_number, currency, issue_date, due_date,
              subtotal, vat_amount, total, amount_paid, amount_due, notes)
           VALUES ($1,$2,$3,$4,COALESCE($5,CURRENT_DATE),
                   COALESCE($6,CURRENT_DATE + INTERVAL '30 day'),$7,$8,$9,0,$9,$10) RETURNING *""",
        current.company_id, body.customer_id, number, body.currency, body.issue_date,
        body.due_date, doc["subtotal"], doc["vat_amount"], doc["total"], body.notes,
    )
    for pos, it in enumerate(doc["items"]):
        await conn.execute(
            """INSERT INTO invoice_items
                 (company_id, invoice_id, description, quantity, unit_price, vat_rate,
                  line_subtotal, line_vat, line_total, position)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)""",
            current.company_id, inv["id"], it["description"], it["quantity"], it["unit_price"],
            it["vat_rate"], it["line_subtotal"], it["line_vat"], it["line_total"], pos,
        )
    await write_audit(conn, company_id=current.company_id, user_id=current.user_id,
                      action="invoice.create", entity="invoice", entity_id=str(inv["id"]),
                      meta={"number": number, "total": str(doc["total"])})
    return dict(inv)


@app.post("/invoices/{invoice_id}/cancel")
async def cancel_invoice(invoice_id: str, conn=Depends(tdb),
                         current: CurrentUser = Depends(require_role("accountant"))):
    inv = await conn.fetchrow(
        "SELECT id, status FROM invoices WHERE id=$1 AND company_id=$2", invoice_id, current.company_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv["status"] == "paid":
        raise HTTPException(400, "Cannot cancel a fully paid invoice")
    await conn.execute("UPDATE invoices SET status='cancelled' WHERE id=$1", invoice_id)
    await write_audit(conn, company_id=current.company_id, user_id=current.user_id,
                      action="invoice.cancel", entity="invoice", entity_id=invoice_id, meta={})
    return {"status": "cancelled"}


def _pdf_payload(inv, items, company):
    return {
        "company": dict(company),
        "customer": {"name": inv["customer_name"], "trn": inv["customer_trn"],
                     "address": inv["customer_address"], "email": inv["customer_email"]},
        "invoice": {k: inv[k] for k in (
            "id", "invoice_number", "issue_date", "due_date", "currency", "status",
            "subtotal", "vat_amount", "total", "amount_paid", "amount_due", "notes")},
        "items": [dict(i) for i in items],
    }


@app.get("/invoices/{invoice_id}/pdf")
async def invoice_pdf(invoice_id: str, conn=Depends(tdb),
                      current: CurrentUser = Depends(get_current_user)):
    inv, items, company = await _load_invoice_bundle(conn, invoice_id, current.company_id)
    pdf_bytes = build_invoice_pdf(_pdf_payload(inv, items, company))
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{inv["invoice_number"]}.pdf"'},
    )


@app.post("/invoices/{invoice_id}/send")
async def send_invoice(invoice_id: str, body: SendInvoiceIn, conn=Depends(tdb),
                       current: CurrentUser = Depends(require_role("staff"))):
    inv, items, company = await _load_invoice_bundle(conn, invoice_id, current.company_id)
    to = body.to or inv["customer_email"]
    if not to:
        raise HTTPException(400, "No recipient email (customer has none on file)")
    pdf_bytes = build_invoice_pdf(_pdf_payload(inv, items, company))
    send_invoice_email(
        to=to,
        subject=f"Tax Invoice {inv['invoice_number']} — {company['name']}",
        body=f"Dear {inv['customer_name']},\n\nPlease find attached tax invoice "
             f"{inv['invoice_number']} for {inv['currency']} {q2(inv['total'])}.\n\n"
             f"Thank you,\n{company['name']}",
        pdf_bytes=pdf_bytes, filename=f"{inv['invoice_number']}.pdf",
    )
    await write_audit(conn, company_id=current.company_id, user_id=current.user_id,
                      action="invoice.send", entity="invoice", entity_id=invoice_id, meta={"to": to})
    return {"sent_to": to}


# ============================ PAYMENTS ====================================== #
@app.get("/payments")
async def list_payments(conn=Depends(tdb), current: CurrentUser = Depends(get_current_user)):
    rows = await conn.fetch(
        """SELECT p.*, i.invoice_number FROM payments p
           JOIN invoices i ON i.id=p.invoice_id
           WHERE p.company_id=$1 ORDER BY p.payment_date DESC, p.created_at DESC""",
        current.company_id)
    return [dict(r) for r in rows]


@app.post("/payments", status_code=201)
async def create_payment(body: PaymentIn, conn=Depends(tdb),
                         current: CurrentUser = Depends(require_role("accountant"))):
    inv = await conn.fetchrow(
        "SELECT id, status FROM invoices WHERE id=$1 AND company_id=$2",
        body.invoice_id, current.company_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv["status"] == "cancelled":
        raise HTTPException(400, "Cannot pay a cancelled invoice")
    payment = await conn.fetchrow(
        """INSERT INTO payments (company_id, invoice_id, amount, method, payment_date, reference, notes)
           VALUES ($1,$2,$3,$4,COALESCE($5,CURRENT_DATE),$6,$7) RETURNING *""",
        current.company_id, body.invoice_id, body.amount, body.method,
        body.payment_date, body.reference, body.notes,
    )
    updated = await conn.fetchrow(
        "SELECT status, amount_paid, amount_due FROM invoices WHERE id=$1", body.invoice_id)
    await write_audit(conn, company_id=current.company_id, user_id=current.user_id,
                      action="payment.create", entity="payment", entity_id=str(payment["id"]),
                      meta={"invoice_id": body.invoice_id, "amount": str(body.amount)})
    return {"payment": dict(payment), "invoice": dict(updated)}


@app.post("/payments/checkout")
async def payment_checkout(body: CheckoutIn, conn=Depends(tdb),
                           current: CurrentUser = Depends(require_role("staff"))):
    inv = await conn.fetchrow(
        "SELECT id, invoice_number, currency, amount_due, status FROM invoices WHERE id=$1 AND company_id=$2",
        body.invoice_id, current.company_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv["status"] in ("paid", "cancelled"):
        raise HTTPException(400, "Invoice is not payable")
    try:
        url = await pay.create_checkout_session(conn, company_id=current.company_id, invoice=dict(inv))
    except (RuntimeError, ValueError) as e:
        raise HTTPException(400, str(e))
    return {"checkout_url": url}


@app.post("/payments/webhook")
async def payment_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    try:
        event = pay.verify_event(payload, sig)
    except Exception:
        raise HTTPException(400, "Invalid webhook signature")
    await pay.handle_event(event)
    return {"received": True}


# ============================ DASHBOARD ===================================== #
@app.get("/dashboard/stats")
async def dashboard_stats(currency: str = "AED", days: int = 30, conn=Depends(tdb),
                          current: CurrentUser = Depends(get_current_user)):
    invoiced = await conn.fetchval(
        """SELECT COALESCE(SUM(total),0) FROM invoices
           WHERE company_id=$1 AND currency=$2 AND status<>'cancelled'
             AND issue_date >= CURRENT_DATE - ($3||' day')::interval""",
        current.company_id, currency, days)
    collected = await conn.fetchval(
        """SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN invoices i ON i.id=p.invoice_id
           WHERE p.company_id=$1 AND i.currency=$2
             AND p.payment_date >= CURRENT_DATE - ($3||' day')::interval""",
        current.company_id, currency, days)
    outstanding = await conn.fetchval(
        """SELECT COALESCE(SUM(amount_due),0) FROM invoices
           WHERE company_id=$1 AND currency=$2 AND status IN ('unpaid','partially_paid')""",
        current.company_id, currency)
    return {"currency": currency, "days": days,
            "invoiced": str(q2(invoiced)), "collected": str(q2(collected)),
            "outstanding": str(q2(outstanding))}


@app.get("/audit")
async def list_audit(limit: int = 100, conn=Depends(tdb),
                     current: CurrentUser = Depends(require_role("admin"))):
    rows = await conn.fetch(
        """SELECT a.*, u.full_name AS user_name FROM audit_log a
           LEFT JOIN users u ON u.id=a.user_id
           WHERE a.company_id=$1 ORDER BY a.created_at DESC LIMIT $2""",
        current.company_id, min(limit, 500))
    return [dict(r) for r in rows]


@app.get("/health")
async def health():
    return {"status": "ok"}
