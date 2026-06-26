import React, { useEffect, useMemo, useState } from "react";
import {
  Plus, Search, Download, Send, CreditCard, X, Trash2,
  CheckCircle2, Clock, AlertTriangle, Ban, ChevronRight, Loader2,
  Receipt, ExternalLink, Inbox,
} from "lucide-react";
import { t as translate, dirOf, LanguageSwitcher } from "./i18n";

/**
 * Invoices.jsx — full invoice screen (EN / AR / UR, RTL-aware).
 * Pass apiBase + authToken. Language via internal state or lang/onLangChange props.
 */

const VAT_RATE = 5;

const STATUS_META = {
  paid:           { tkey: "st_paid",      cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: CheckCircle2 },
  partially_paid: { tkey: "st_partial",   cls: "bg-blue-50 text-blue-700 ring-blue-200",          Icon: Clock },
  unpaid:         { tkey: "st_unpaid",    cls: "bg-slate-100 text-slate-600 ring-slate-200",      Icon: Clock },
  overdue:        { tkey: "st_overdue",   cls: "bg-rose-50 text-rose-700 ring-rose-200",          Icon: AlertTriangle },
  cancelled:      { tkey: "st_cancelled", cls: "bg-slate-100 text-slate-400 ring-slate-200",      Icon: Ban },
};
function effectiveStatus(inv) {
  if (inv.status === "cancelled" || inv.status === "paid") return inv.status;
  if (inv.is_overdue) return "overdue";
  return inv.status;
}
function money(v, currency = "AED") {
  return new Intl.NumberFormat("en-AE", { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(v || 0));
}
function fmtDate(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return String(d); }
}
function lineTotals(items) {
  let subtotal = 0;
  for (const it of items) subtotal += (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
  subtotal = +subtotal.toFixed(2);
  const vat = +(subtotal * (VAT_RATE / 100)).toFixed(2);
  return { subtotal, vat, total: +(subtotal + vat).toFixed(2) };
}

const SAMPLE_CUSTOMERS = [
  { id: "c1", name: "Gulf Trading LLC", email: "ap@gulftrading.ae" },
  { id: "c2", name: "Marina Tech FZ", email: "finance@marinatech.ae" },
  { id: "c3", name: "Desert Logistics", email: "" },
];
const SAMPLE = [
  { id: "i1", invoice_number: "INV-2026-00042", customer_name: "Gulf Trading LLC", currency: "AED", issue_date: "2026-06-20", due_date: "2026-07-20", status: "partially_paid", total: "1522.47", amount_paid: "500.00", amount_due: "1022.47", is_overdue: false },
  { id: "i2", invoice_number: "INV-2026-00041", customer_name: "Marina Tech FZ", currency: "AED", issue_date: "2026-05-02", due_date: "2026-06-01", status: "unpaid", total: "8400.00", amount_paid: "0.00", amount_due: "8400.00", is_overdue: true },
  { id: "i3", invoice_number: "INV-2026-00040", customer_name: "Desert Logistics", currency: "AED", issue_date: "2026-06-18", due_date: "2026-07-18", status: "paid", total: "2310.00", amount_paid: "2310.00", amount_due: "0.00", is_overdue: false },
  { id: "i4", invoice_number: "INV-2026-00039", customer_name: "Gulf Trading LLC", currency: "AED", issue_date: "2026-06-10", due_date: "2026-07-10", status: "unpaid", total: "525.00", amount_paid: "0.00", amount_due: "525.00", is_overdue: false },
  { id: "i5", invoice_number: "INV-2026-00038", customer_name: "Marina Tech FZ", currency: "AED", issue_date: "2026-04-15", due_date: "2026-05-15", status: "cancelled", total: "1200.00", amount_paid: "0.00", amount_due: "0.00", is_overdue: false },
];
function sampleBundle(inv) {
  return {
    invoice: { ...inv, customer_trn: "100987654300003", subtotal: (Number(inv.total) / 1.05).toFixed(2), vat_amount: (Number(inv.total) - Number(inv.total) / 1.05).toFixed(2), notes: "" },
    items: [
      { id: "x1", description: "Processing service", quantity: 3, unit_price: "149.99", vat_rate: 5, line_total: "472.47" },
      { id: "x2", description: "Annual fee", quantity: 1, unit_price: (Number(inv.total) / 1.05 - 449.97).toFixed(2), vat_rate: 5, line_total: (Number(inv.total) - 472.47).toFixed(2) },
    ],
    payments: Number(inv.amount_paid) > 0 ? [{ id: "p1", payment_date: "2026-06-22", method: "bank_transfer", amount: inv.amount_paid, reference: "TT-99182" }] : [],
  };
}
const FILTERS = ["all", "unpaid", "partially_paid", "overdue", "paid", "cancelled"];
const FILTER_TKEY = { all: "flt_all", unpaid: "flt_unpaid", partially_paid: "flt_partial", overdue: "flt_overdue", paid: "flt_paid", cancelled: "flt_cancelled" };

export default function Invoices({ apiBase = "", authToken = "", currency = "AED", lang: langProp, onLangChange }) {
  const [langState, setLangState] = useState("ar");
  const lang = langProp ?? langState;
  const setLang = onLangChange ?? setLangState;
  const dir = dirOf(lang);
  const tr = (k, v) => translate(lang, k, v);

  const [invoices, setInvoices] = useState(SAMPLE);
  const [customers, setCustomers] = useState(SAMPLE_CUSTOMERS);
  const [loading, setLoading] = useState(false);
  const [demo, setDemo] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [detailId, setDetailId] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);

  function notify(msg, kind = "ok") { setToast({ msg, kind }); setTimeout(() => setToast(null), 2800); }
  async function api(path, options = {}) {
    const res = await fetch(`${apiBase}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}), ...(options.headers || {}) } });
    if (!res.ok) throw new Error(String(res.status));
    return res;
  }
  async function loadInvoices() {
    setLoading(true);
    try { const data = await (await api("/invoices")).json(); setInvoices(Array.isArray(data) ? data : []); setDemo(false); }
    catch { setInvoices(SAMPLE); setDemo(true); }
    finally { setLoading(false); }
  }
  async function loadCustomers() {
    try { const d = await (await api("/customers")).json(); if (Array.isArray(d) && d.length) setCustomers(d); } catch {}
  }
  useEffect(() => { loadInvoices(); loadCustomers(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((inv) => {
      const eff = effectiveStatus(inv);
      if (filter !== "all" && eff !== filter) return false;
      if (!q) return true;
      return (inv.invoice_number || "").toLowerCase().includes(q) || (inv.customer_name || "").toLowerCase().includes(q);
    });
  }, [invoices, query, filter]);
  const outstanding = useMemo(() => filtered.reduce((s, i) => s + (i.status === "cancelled" ? 0 : Number(i.amount_due || 0)), 0), [filtered]);

  function applyPayment(invId, amount) {
    setInvoices((prev) => prev.map((i) => {
      if (i.id !== invId) return i;
      const paid = +(Number(i.amount_paid) + Number(amount)).toFixed(2);
      const due = +Math.max(Number(i.total) - paid, 0).toFixed(2);
      const status = due <= 0 ? "paid" : paid > 0 ? "partially_paid" : "unpaid";
      return { ...i, amount_paid: paid.toFixed(2), amount_due: due.toFixed(2), status };
    }));
  }
  function applyCancel(invId) { setInvoices((prev) => prev.map((i) => (i.id === invId ? { ...i, status: "cancelled", amount_due: "0.00" } : i))); }

  async function downloadPdf(inv) {
    try { const res = await api(`/invoices/${inv.id}/pdf`); const url = URL.createObjectURL(await res.blob()); window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 30000); }
    catch { notify(tr("toast_pdf_warn"), "warn"); }
  }
  async function sendInvoice(inv) {
    try { const res = await (await api(`/invoices/${inv.id}/send`, { method: "POST", body: JSON.stringify({}) })).json(); notify(tr("toast_sent", { x: res.sent_to || "customer" })); }
    catch { notify(tr("toast_sent_demo")); }
  }
  async function payNow(inv) {
    try { const res = await (await api("/payments/checkout", { method: "POST", body: JSON.stringify({ invoice_id: inv.id }) })).json(); if (res.checkout_url) window.open(res.checkout_url, "_blank"); else notify(tr("toast_paylink_warn"), "warn"); }
    catch { notify(tr("toast_paylink_warn"), "warn"); }
  }
  async function cancelInvoice(inv) {
    try { await api(`/invoices/${inv.id}/cancel`, { method: "POST", body: JSON.stringify({}) }); } catch {}
    applyCancel(inv.id); notify(tr("toast_cancelled")); setDetailId(null);
  }

  return (
    <div dir={dir} lang={lang} className="min-h-screen w-full bg-[#F6F7F9] text-slate-800 font-sans">
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center h-10 w-10 rounded-xl bg-[#0B1220] text-[#C8A24A]"><Receipt size={20} /></span>
            <div>
              <h1 className="text-xl font-semibold leading-tight">{tr("nav_invoices")}</h1>
              <p className="text-sm text-slate-500">{tr("inv_shown", { n: filtered.length })} · <span className="font-medium text-slate-700">{tr("inv_outstanding", { v: money(outstanding, currency) })}</span></p>
            </div>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <LanguageSwitcher lang={lang} setLang={setLang} />
            <button onClick={() => setModal("create")} className="flex items-center gap-2 rounded-lg bg-[#0B1220] text-white px-4 py-2.5 text-sm font-medium hover:bg-[#16213a]">
              <Plus size={16} /> {tr("qa_new_invoice")}
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("inv_search")}
              className="w-full rounded-lg border border-slate-200 bg-white ps-9 pe-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#C8A24A]/40" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm border transition ${filter === f ? "bg-[#0B1220] text-white border-[#0B1220]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                {tr(FILTER_TKEY[f])}
              </button>
            ))}
          </div>
        </div>

        {demo && <div className="mb-3 rounded-lg bg-amber-50 text-amber-800 text-xs px-3 py-2 ring-1 ring-amber-200">{tr("demo_mode")}</div>}

        {/* Desktop table */}
        <div className="hidden md:block rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-4 py-3 font-medium text-start">{tr("col_invoice")}</th>
                <th className="px-4 py-3 font-medium text-start">{tr("col_customer")}</th>
                <th className="px-4 py-3 font-medium text-start">{tr("col_issued")}</th>
                <th className="px-4 py-3 font-medium text-start">{tr("col_due")}</th>
                <th className="px-4 py-3 font-medium text-start">{tr("col_status")}</th>
                <th className="px-4 py-3 font-medium text-end">{tr("col_total")}</th>
                <th className="px-4 py-3 font-medium text-end">{tr("col_balance")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400"><Loader2 className="inline animate-spin me-2" size={16} />{tr("loading")}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400"><Inbox className="inline mb-2" size={22} /><div>{tr("empty_invoices")}</div></td></tr>
              ) : filtered.map((inv) => (
                <tr key={inv.id} onClick={() => setDetailId(inv.id)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer">
                  <td className="px-4 py-3 font-medium tabular-nums">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-slate-600">{inv.customer_name}</td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(inv.issue_date)}</td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(inv.due_date)}</td>
                  <td className="px-4 py-3"><StatusBadge tr={tr} status={effectiveStatus(inv)} /></td>
                  <td className="px-4 py-3 text-end tabular-nums">{money(inv.total, inv.currency)}</td>
                  <td className="px-4 py-3 text-end tabular-nums font-medium">{money(inv.amount_due, inv.currency)}</td>
                  <td className="px-4 py-3 text-end text-slate-300"><ChevronRight size={16} className="rtl:rotate-180 inline" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="py-10 text-center text-slate-400"><Loader2 className="inline animate-spin me-2" size={16} />{tr("loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400"><Inbox className="inline mb-2" size={22} /><div>{tr("empty_invoices")}</div></div>
          ) : filtered.map((inv) => (
            <button key={inv.id} onClick={() => setDetailId(inv.id)} className="w-full text-start rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between"><span className="font-medium tabular-nums">{inv.invoice_number}</span><StatusBadge tr={tr} status={effectiveStatus(inv)} /></div>
              <div className="mt-1 text-sm text-slate-600">{inv.customer_name}</div>
              <div className="mt-2 flex items-center justify-between text-sm"><span className="text-slate-400">{tr("col_due")} {fmtDate(inv.due_date)}</span><span className="tabular-nums font-semibold">{money(inv.amount_due, inv.currency)}</span></div>
            </button>
          ))}
        </div>
      </div>

      {detailId && (
        <DetailDrawer tr={tr} dir={dir} id={detailId} apiBase={apiBase} authToken={authToken}
          baseInvoice={invoices.find((i) => i.id === detailId)} onClose={() => setDetailId(null)}
          onDownload={downloadPdf} onSend={sendInvoice} onPayNow={payNow} onCancel={cancelInvoice}
          onRecordPayment={(inv) => setModal({ type: "pay", invoice: inv })} />
      )}

      {modal === "create" && (
        <CreateInvoiceModal tr={tr} dir={dir} customers={customers} currency={currency} onClose={() => setModal(null)}
          onSubmit={async (payload, totals) => {
            try { const inv = await (await api("/invoices", { method: "POST", body: JSON.stringify(payload) })).json(); setInvoices((p) => [inv, ...p]); notify(tr("toast_invoice_created")); }
            catch {
              const cust = customers.find((c) => c.id === payload.customer_id);
              setInvoices((p) => [{ id: "new" + Date.now(), invoice_number: "INV-2026-DRAFT", customer_name: cust?.name || "—", currency, issue_date: new Date().toISOString(), due_date: new Date(Date.now() + 30 * 864e5).toISOString(), status: "unpaid", total: totals.total.toFixed(2), amount_paid: "0.00", amount_due: totals.total.toFixed(2), is_overdue: false }, ...p]);
              notify(tr("toast_invoice_created") + " (demo)");
            }
            setModal(null);
          }} />
      )}
      {modal?.type === "pay" && (
        <RecordPaymentModal tr={tr} dir={dir} invoice={modal.invoice} currency={currency} onClose={() => setModal(null)}
          onSubmit={async ({ amount, method }) => {
            try { await api("/payments", { method: "POST", body: JSON.stringify({ invoice_id: modal.invoice.id, amount, method }) }); } catch {}
            applyPayment(modal.invoice.id, amount); notify(tr("toast_payment_recorded")); setModal(null); setDetailId(null);
          }} />
      )}

      {toast && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] rounded-lg px-4 py-2 text-sm shadow-lg ${toast.kind === "warn" ? "bg-amber-600 text-white" : "bg-[#0B1220] text-white"}`}>{toast.msg}</div>
      )}
    </div>
  );
}

function StatusBadge({ tr, status }) {
  const s = STATUS_META[status] || STATUS_META.unpaid; const { Icon } = s;
  return (<span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${s.cls}`}><Icon size={13} /> {tr(s.tkey)}</span>);
}

function DetailDrawer({ tr, dir, id, apiBase, authToken, baseInvoice, onClose, onDownload, onSend, onPayNow, onCancel, onRecordPayment }) {
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}/invoices/${id}`, { headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) } });
        if (!res.ok) throw new Error();
        const data = await res.json(); if (alive) setBundle(data);
      } catch { if (alive && baseInvoice) setBundle(sampleBundle(baseInvoice)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [id]);

  const inv = bundle?.invoice || baseInvoice || {};
  const items = bundle?.items || [];
  const payments = bundle?.payments || [];
  const cur = inv.currency || "AED";
  const due = Number(inv.amount_due || 0);
  const canPay = due > 0 && inv.status !== "cancelled";
  const canCancel = inv.status !== "paid" && inv.status !== "cancelled";

  return (
    <div dir={dir} className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-y-0 end-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-100">
          <div><div className="font-semibold tabular-nums">{inv.invoice_number || "…"}</div><div className="mt-0.5"><StatusBadge tr={tr} status={effectiveStatus(inv)} /></div></div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (<div className="py-12 text-center text-slate-400"><Loader2 className="inline animate-spin me-2" size={16} />{tr("loading")}</div>) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Meta label={tr("col_customer")} value={inv.customer_name} />
                <Meta label={tr("trn")} value={inv.customer_trn || "—"} />
                <Meta label={tr("col_issued")} value={fmtDate(inv.issue_date)} />
                <Meta label={tr("col_due")} value={fmtDate(inv.due_date)} />
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-12 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50">
                  <div className="col-span-7">{tr("f_description")}</div><div className="col-span-2 text-center">{tr("f_qty")}</div><div className="col-span-3 text-end">{tr("f_total")}</div>
                </div>
                {items.map((it) => (
                  <div key={it.id} className="grid grid-cols-12 px-3 py-2 text-sm border-t border-slate-50">
                    <div className="col-span-7 text-slate-700">{it.description}</div>
                    <div className="col-span-2 text-center tabular-nums text-slate-500">{Number(it.quantity)}</div>
                    <div className="col-span-3 text-end tabular-nums">{money(it.line_total, cur)}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl bg-slate-50 p-4 text-sm space-y-1.5">
                <Row label={tr("f_subtotal")} value={money(inv.subtotal, cur)} />
                <Row label={tr("f_vat")} value={money(inv.vat_amount, cur)} />
                <Row label={tr("f_total")} value={money(inv.total, cur)} bold />
                <Row label={tr("d_paid")} value={money(inv.amount_paid, cur)} />
                <div className="pt-2 mt-1 border-t border-slate-200 flex justify-between items-center">
                  <span className="font-medium">{tr("d_amount_due")}</span>
                  <span className={`text-lg font-semibold tabular-nums ${due > 0 ? "text-[#0B1220]" : "text-emerald-600"}`}>{money(due, cur)}</span>
                </div>
              </div>
              {payments.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">{tr("d_payments")}</div>
                  <div className="space-y-2">
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-sm rounded-lg border border-slate-100 px-3 py-2">
                        <div><div className="text-slate-700">{money(p.amount, cur)}</div><div className="text-xs text-slate-400">{fmtDate(p.payment_date)} · {String(p.method).replace("_", " ")}</div></div>
                        {p.reference && <span className="text-xs text-slate-400">{p.reference}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="border-t border-slate-100 p-4 space-y-2">
          {canPay && (<button onClick={() => onPayNow(inv)} className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#C8A24A] text-[#0B1220] px-4 py-2.5 text-sm font-semibold hover:brightness-95"><ExternalLink size={16} /> {tr("a_pay_now", { v: money(due, cur) })}</button>)}
          <div className="grid grid-cols-2 gap-2">
            <ActionBtn onClick={() => onRecordPayment(inv)} disabled={!canPay} icon={CreditCard} label={tr("a_record_payment")} />
            <ActionBtn onClick={() => onDownload(inv)} icon={Download} label={tr("a_pdf")} />
            <ActionBtn onClick={() => onSend(inv)} icon={Send} label={tr("a_send_email")} />
            <ActionBtn onClick={() => onCancel(inv)} disabled={!canCancel} icon={Trash2} label={tr("a_cancel")} danger />
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ onClick, icon: Icon, label, disabled, danger }) {
  return (<button onClick={onClick} disabled={disabled} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${disabled ? "border-slate-100 text-slate-300 cursor-not-allowed" : danger ? "border-rose-200 text-rose-600 hover:bg-rose-50" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}><Icon size={16} /> {label}</button>);
}
function Meta({ label, value }) { return (<div><div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div><div className="text-slate-700">{value || "—"}</div></div>); }
function Row({ label, value, bold }) { return (<div className="flex justify-between"><span className="text-slate-500">{label}</span><span className={`tabular-nums ${bold ? "font-semibold" : ""}`}>{value}</span></div>); }

function Shell({ dir, title, onClose, children, footer, wide }) {
  return (
    <div dir={dir} className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-slate-100"><h3 className="font-semibold">{title}</h3><button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button></div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-100">{footer}</div>}
      </div>
    </div>
  );
}

function CreateInvoiceModal({ tr, dir, customers, currency, onClose, onSubmit }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id || "");
  const [lines, setLines] = useState([{ description: "", quantity: 1, unit_price: 0 }]);
  const totals = useMemo(() => lineTotals(lines), [lines]);
  const upd = (i, k, v) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  return (
    <Shell dir={dir} title={tr("modal_new_invoice")} wide onClose={onClose}
      footer={
        <div className="flex items-center justify-between">
          <div className="text-sm"><span className="text-slate-500">{tr("f_total")} </span><span className="font-semibold tabular-nums">{money(totals.total, currency)}</span></div>
          <button disabled={!customerId || lines.some((l) => !l.description)} onClick={() => onSubmit({ customer_id: customerId, currency, items: lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unit_price: Number(l.unit_price), vat_rate: VAT_RATE })) }, totals)} className="rounded-lg bg-[#0B1220] text-white px-4 py-2 text-sm font-medium disabled:opacity-40">{tr("btn_create_invoice")}</button>
        </div>
      }>
      <label className="block mb-4"><span className="block text-xs font-medium text-slate-500 mb-1">{tr("f_customer")}</span>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none">{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </label>
      <div className="grid grid-cols-12 gap-2 text-[11px] font-medium text-slate-400 px-1 mb-1"><div className="col-span-6">{tr("f_description")}</div><div className="col-span-2 text-end">{tr("f_qty")}</div><div className="col-span-3 text-end">{tr("f_unit_price")}</div><div className="col-span-1" /></div>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input className="col-span-6 rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none" placeholder={tr("f_description")} value={l.description} onChange={(e) => upd(i, "description", e.target.value)} />
            <input type="number" min="0" className="col-span-2 rounded-lg border border-slate-300 px-2 py-2 text-sm text-end outline-none" value={l.quantity} onChange={(e) => upd(i, "quantity", e.target.value)} />
            <input type="number" min="0" step="0.01" className="col-span-3 rounded-lg border border-slate-300 px-2 py-2 text-sm text-end outline-none" value={l.unit_price} onChange={(e) => upd(i, "unit_price", e.target.value)} />
            <button onClick={() => setLines((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p))} className="col-span-1 grid place-items-center text-slate-400 hover:text-rose-500"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      <button onClick={() => setLines((p) => [...p, { description: "", quantity: 1, unit_price: 0 }])} className="mt-3 flex items-center gap-1.5 text-sm text-[#0B1220] font-medium hover:underline"><Plus size={15} /> {tr("f_add_line")}</button>
      <div className="mt-5 rounded-lg bg-slate-50 p-3 text-sm space-y-1">
        <Row label={tr("f_subtotal")} value={money(totals.subtotal, currency)} />
        <Row label={tr("f_vat")} value={money(totals.vat, currency)} />
        <Row label={tr("f_total")} value={money(totals.total, currency)} bold />
      </div>
    </Shell>
  );
}

function RecordPaymentModal({ tr, dir, invoice, currency, onClose, onSubmit }) {
  const cur = invoice.currency || currency;
  const [amount, setAmount] = useState(invoice.amount_due || "");
  const [method, setMethod] = useState("bank_transfer");
  return (
    <Shell dir={dir} title={`${tr("modal_payment")} · ${invoice.invoice_number}`} onClose={onClose}
      footer={<button disabled={!amount || Number(amount) <= 0} onClick={() => onSubmit({ amount: Number(amount), method })} className="w-full rounded-lg bg-[#0B1220] text-white px-4 py-2 text-sm font-medium disabled:opacity-40">{tr("btn_save_payment")}</button>}>
      <div className="rounded-lg bg-slate-50 p-3 mb-4 text-sm flex justify-between"><span className="text-slate-500">{tr("f_balance_due")}</span><span className="font-semibold tabular-nums">{money(invoice.amount_due, cur)}</span></div>
      <label className="block mb-4"><span className="block text-xs font-medium text-slate-500 mb-1">{tr("f_amount")} ({cur})</span>
        <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#C8A24A]/40" /></label>
      <label className="block"><span className="block text-xs font-medium text-slate-500 mb-1">{tr("f_method")}</span>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none">
          <option value="bank_transfer">{tr("m_bank_transfer")}</option><option value="cash">{tr("m_cash")}</option><option value="card">{tr("m_card")}</option><option value="cheque">{tr("m_cheque")}</option><option value="online">{tr("m_online")}</option>
        </select></label>
    </Shell>
  );
}
