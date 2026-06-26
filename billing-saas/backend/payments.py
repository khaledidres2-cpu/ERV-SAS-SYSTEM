"""payments.py — online invoice payment via Stripe Checkout + webhook.

Flow:
  1) POST /payments/checkout  -> creates a Stripe Checkout Session for the
     invoice's outstanding balance and returns a hosted payment URL.
  2) Stripe redirects the payer through checkout.
  3) Stripe calls POST /payments/webhook -> we verify the signature, then
     insert a `payments` row inside the correct tenant context. That insert
     fires the DB trigger which marks the invoice paid / partially paid.

Provider-agnostic by design: to add Ziina, mirror create_checkout_session()
and handle its webhook event the same way (insert a payments row).

Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, APP_BASE_URL
"""

import os
from decimal import Decimal

import stripe

from db import raw_tx, tenant_tx
from money import q2

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:5173")

# Currencies Stripe treats as 2-decimal (AED, USD, SAR, EUR ... are 2dp)
MINOR_UNIT = Decimal("100")


async def create_checkout_session(conn, *, company_id: str, invoice: dict) -> str:
    """Create a Stripe Checkout Session for the invoice balance.
    `conn` is the tenant transaction (RLS already bound)."""
    if not stripe.api_key:
        raise RuntimeError("Stripe is not configured (set STRIPE_SECRET_KEY)")

    amount_due = q2(invoice["amount_due"])
    if amount_due <= 0:
        raise ValueError("Invoice has no outstanding balance")

    currency = (invoice.get("currency") or "AED").lower()
    amount_minor = int(amount_due * MINOR_UNIT)

    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": currency,
                "product_data": {"name": f"Invoice {invoice['invoice_number']} — balance"},
                "unit_amount": amount_minor,
            },
            "quantity": 1,
        }],
        success_url=f"{APP_BASE_URL}/invoices/{invoice['id']}?paid=1",
        cancel_url=f"{APP_BASE_URL}/invoices/{invoice['id']}?paid=0",
        metadata={
            "company_id": str(company_id),
            "invoice_id": str(invoice["id"]),
            "invoice_number": invoice["invoice_number"],
        },
    )

    # Track the intent so the webhook can be idempotent.
    await conn.execute(
        """
        INSERT INTO payment_intents
            (company_id, invoice_id, provider, external_id, status, amount, currency)
        VALUES ($1, $2, 'stripe', $3, 'pending', $4, $5)
        ON CONFLICT (provider, external_id) DO NOTHING
        """,
        company_id, invoice["id"], session.id, amount_due, invoice.get("currency", "AED"),
    )
    return session.url


def verify_event(payload: bytes, signature: str):
    if not WEBHOOK_SECRET:
        raise RuntimeError("Stripe webhook secret not configured")
    return stripe.Webhook.construct_event(payload, signature, WEBHOOK_SECRET)


async def handle_event(event) -> None:
    """Process a verified Stripe event. Idempotent."""
    if event["type"] != "checkout.session.completed":
        return

    session = event["data"]["object"]
    if session.get("payment_status") != "paid":
        return

    meta = session.get("metadata") or {}
    company_id = meta.get("company_id")
    invoice_id = meta.get("invoice_id")
    external_id = session["id"]
    if not company_id or not invoice_id:
        return

    amount = q2(Decimal(session.get("amount_total", 0)) / MINOR_UNIT)

    async with tenant_tx(company_id) as conn:
        # Idempotency: only proceed if this intent is still pending.
        row = await conn.fetchrow(
            "SELECT status FROM payment_intents WHERE provider='stripe' AND external_id=$1 FOR UPDATE",
            external_id,
        )
        if row and row["status"] == "paid":
            return  # already recorded

        await conn.execute(
            """
            INSERT INTO payments
                (company_id, invoice_id, amount, method, reference, notes)
            VALUES ($1, $2, $3, 'online', $4, 'Stripe Checkout')
            """,
            company_id, invoice_id, amount, external_id,
        )
        await conn.execute(
            "UPDATE payment_intents SET status='paid' WHERE provider='stripe' AND external_id=$1",
            external_id,
        )
