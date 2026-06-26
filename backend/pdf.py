"""
pdf.py — Bilingual (AR/EN) UAE FTA-style Tax Invoice generator.

Produces a clean A4 "Tax Invoice / فاتورة ضريبية" with TRN, per-line VAT
breakdown, totals, and paid/due balances. Arabic text is shaped (joined) and
bidi-ordered so it renders correctly.

Drop an Arabic TTF into ./fonts (Cairo-Regular.ttf / Cairo-Bold.ttf recommended).
If the font is missing it falls back to Helvetica (Latin only).
"""

import os
from decimal import Decimal
from io import BytesIO

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
)

FONT_DIR = os.path.join(os.path.dirname(__file__), "fonts")
INK = colors.HexColor("#0B1220")
GOLD = colors.HexColor("#C8A24A")
MUTED = colors.HexColor("#6B7280")
LINE = colors.HexColor("#E5E7EB")
LIGHT = colors.HexColor("#F6F7F9")

_REG = "Body"
_BOLD = "BodyBold"
_registered = False

# Cairo lacks a few ISOLATED presentation-form glyphs (reh, alef, teh marbuta…)
# but has the base letters. This config falls back to the base character for
# isolated letters so nothing renders as an empty box.
_reshaper = arabic_reshaper.ArabicReshaper(configuration={
    "delete_harakat": False,
    "use_unshaped_instead_of_isolated": True,
})


def _ensure_fonts():
    global _registered, _REG, _BOLD
    if _registered:
        return
    reg = os.path.join(FONT_DIR, "Cairo-Regular.ttf")
    bold = os.path.join(FONT_DIR, "Cairo-Bold.ttf")
    if os.path.exists(reg):
        pdfmetrics.registerFont(TTFont("Body", reg))
        pdfmetrics.registerFont(TTFont("BodyBold", bold if os.path.exists(bold) else reg))
        _REG, _BOLD = "Body", "BodyBold"
    else:  # graceful fallback — Latin only
        _REG, _BOLD = "Helvetica", "Helvetica-Bold"
    _registered = True


def shape(text) -> str:
    """Reshape + bidi-order any string that may contain Arabic."""
    if text is None:
        return ""
    return get_display(_reshaper.reshape(str(text)))


def _p(text, size=9, bold=False, color=INK, align=0, leading=None):
    style = ParagraphStyle(
        "c", fontName=_BOLD if bold else _REG, fontSize=size,
        textColor=color, alignment=align, leading=leading or size + 3,
    )
    return Paragraph(shape(text), style)


def _money(v, currency="AED"):
    return f"{currency} {Decimal(str(v or 0)):,.2f}"


def build_invoice_pdf(data: dict) -> bytes:
    """
    data = {
      "company":  {name, trn, address, email, phone, logo_text},
      "customer": {name, trn, address, email, phone},
      "invoice":  {invoice_number, issue_date, due_date, currency, status,
                   subtotal, vat_amount, total, amount_paid, amount_due, notes},
      "items":    [{description, quantity, unit_price, vat_rate, line_vat, line_total}, ...],
    }
    """
    _ensure_fonts()
    company = data["company"]
    customer = data["customer"]
    inv = data["invoice"]
    items = data["items"]
    cur = inv.get("currency", "AED")

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm,
        topMargin=16 * mm, bottomMargin=16 * mm,
        title=f"Tax Invoice {inv.get('invoice_number','')}",
    )
    flow = []

    # ---- Header band: title + company identity --------------------------- #
    header = Table(
        [[
            [
                _p("TAX INVOICE", size=18, bold=True, color=INK),
                _p("فاتورة ضريبية", size=12, bold=True, color=GOLD),
            ],
            [
                _p(company.get("name", ""), size=12, bold=True, align=2),
                _p(f"TRN: {company.get('trn','—')}", size=9, color=MUTED, align=2),
                _p(company.get("address", ""), size=8, color=MUTED, align=2),
                _p(" · ".join(filter(None, [company.get("phone"), company.get("email")])),
                   size=8, color=MUTED, align=2),
            ],
        ]],
        colWidths=[85 * mm, 93 * mm],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    flow += [header, Spacer(1, 6), _hr(), Spacer(1, 10)]

    # ---- Bill-to + invoice meta ------------------------------------------ #
    meta = Table(
        [[
            [
                _p("BILL TO · فاتورة إلى", size=8, bold=True, color=MUTED),
                _p(customer.get("name", ""), size=11, bold=True),
                _p(f"TRN: {customer.get('trn','—')}", size=9, color=MUTED),
                _p(customer.get("address", ""), size=8, color=MUTED),
            ],
            _meta_box(inv, cur),
        ]],
        colWidths=[100 * mm, 78 * mm],
    )
    meta.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    flow += [meta, Spacer(1, 14)]

    # ---- Items table ----------------------------------------------------- #
    head = [
        _p("#", 8, True, colors.white, 1),
        _p("Description · الوصف", 8, True, colors.white, 0),
        _p("Qty", 8, True, colors.white, 1),
        _p("Unit", 8, True, colors.white, 2),
        _p("VAT%", 8, True, colors.white, 1),
        _p("VAT", 8, True, colors.white, 2),
        _p("Total", 8, True, colors.white, 2),
    ]
    rows = [head]
    for i, it in enumerate(items, 1):
        rows.append([
            _p(str(i), 8, align=1),
            _p(it.get("description", ""), 8, align=0),
            _p(f"{Decimal(str(it.get('quantity',0))):g}", 8, align=1),
            _p(_money(it.get("unit_price"), cur), 8, align=2),
            _p(f"{Decimal(str(it.get('vat_rate',5))):g}%", 8, align=1),
            _p(_money(it.get("line_vat"), cur), 8, align=2),
            _p(_money(it.get("line_total"), cur), 8, align=2),
        ])
    table = Table(rows, colWidths=[8*mm, 74*mm, 14*mm, 28*mm, 14*mm, 18*mm, 22*mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    flow += [table, Spacer(1, 12)]

    # ---- Totals + notes -------------------------------------------------- #
    totals = Table(
        [
            ["", _p("Subtotal · المجموع", 9, color=MUTED, align=0), _p(_money(inv.get("subtotal"), cur), 9, align=2)],
            ["", _p("VAT (5%) · ضريبة القيمة المضافة", 9, color=MUTED, align=0), _p(_money(inv.get("vat_amount"), cur), 9, align=2)],
            ["", _p("Total · الإجمالي", 11, True, INK, 0), _p(_money(inv.get("total"), cur), 11, True, INK, 2)],
            ["", _p("Paid · المدفوع", 9, color=MUTED, align=0), _p(_money(inv.get("amount_paid"), cur), 9, align=2)],
            ["", _p("Amount due · المتبقي", 10, True, GOLD if Decimal(str(inv.get("amount_due") or 0)) > 0 else colors.HexColor("#16A34A"), 0),
                 _p(_money(inv.get("amount_due"), cur), 10, True, INK, 2)],
        ],
        colWidths=[70 * mm, 70 * mm, 38 * mm],
    )
    totals.setStyle(TableStyle([
        ("LINEABOVE", (1, 2), (2, 2), 0.6, INK),
        ("LINEABOVE", (1, 4), (2, 4), 0.4, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    flow += [totals, Spacer(1, 16)]

    if inv.get("notes"):
        flow += [_p("Notes · ملاحظات", 8, True, MUTED), _p(inv["notes"], 8, color=MUTED), Spacer(1, 8)]

    flow += [
        _hr(),
        Spacer(1, 4),
        _p("This is a computer-generated tax invoice · هذه فاتورة ضريبية صادرة آلياً ولا تحتاج إلى توقيع",
           7.5, color=MUTED, align=1),
    ]

    doc.build(flow)
    return buf.getvalue()


def _hr():
    t = Table([[""]], colWidths=[178 * mm], rowHeights=[0.6])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), LINE)]))
    return t


def _meta_box(inv, cur):
    box = Table(
        [
            [_p("Invoice No · رقم الفاتورة", 8, color=MUTED), _p(inv.get("invoice_number", ""), 9, True, align=2)],
            [_p("Issue date · التاريخ", 8, color=MUTED), _p(str(inv.get("issue_date", "")), 9, align=2)],
            [_p("Due date · الاستحقاق", 8, color=MUTED), _p(str(inv.get("due_date", "")), 9, align=2)],
            [_p("Currency · العملة", 8, color=MUTED), _p(cur, 9, align=2)],
            [_p("Status · الحالة", 8, color=MUTED), _p(str(inv.get("status", "")).upper(), 9, True, GOLD, 2)],
        ],
        colWidths=[42 * mm, 36 * mm],
    )
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.white),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return box
