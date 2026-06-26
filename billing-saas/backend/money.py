"""money.py — Decimal VAT engine and race-safe document numbering."""

from datetime import date
from decimal import Decimal, ROUND_HALF_UP

import asyncpg

TWO = Decimal("0.01")


def q2(value) -> Decimal:
    return Decimal(str(value)).quantize(TWO, rounding=ROUND_HALF_UP)


def compute_line(quantity, unit_price, vat_rate):
    line_subtotal = q2(Decimal(str(quantity)) * Decimal(str(unit_price)))
    line_vat = q2(line_subtotal * Decimal(str(vat_rate)) / Decimal("100"))
    line_total = q2(line_subtotal + line_vat)
    return line_subtotal, line_vat, line_total


def compute_document(items: list) -> dict:
    subtotal = Decimal("0.00")
    vat_total = Decimal("0.00")
    computed = []
    for it in items:
        ls, lv, lt = compute_line(it.quantity, it.unit_price, it.vat_rate)
        subtotal += ls
        vat_total += lv
        computed.append({
            "description": it.description,
            "quantity": Decimal(str(it.quantity)),
            "unit_price": q2(it.unit_price),
            "vat_rate": Decimal(str(it.vat_rate)),
            "line_subtotal": ls,
            "line_vat": lv,
            "line_total": lt,
        })
    return {
        "items": computed,
        "subtotal": q2(subtotal),
        "vat_amount": q2(vat_total),
        "total": q2(subtotal + vat_total),
    }


async def next_document_number(conn: asyncpg.Connection, company_id: str,
                               doc_type: str, prefix: str) -> str:
    """Atomic per-company counter — collision-free under concurrency.
    Must run inside the surrounding write transaction."""
    year = date.today().year
    row = await conn.fetchrow(
        """
        INSERT INTO document_sequences (company_id, doc_type, year, last_number)
        VALUES ($1, $2, $3, 1)
        ON CONFLICT (company_id, doc_type, year)
        DO UPDATE SET last_number = document_sequences.last_number + 1
        RETURNING last_number
        """,
        company_id, doc_type, year,
    )
    return f"{prefix}-{year}-{row['last_number']:05d}"
