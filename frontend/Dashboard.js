import React, { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, FileText, Receipt, CreditCard, Users, Wrench,
  ClipboardList, Download, BarChart3, Wallet, UserCog, LifeBuoy,
  Settings, Plus, X, Moon, Sun, TrendingUp, ArrowUpRight, Trash2,
} from "lucide-react";
import { t as translate, dirOf, LanguageSwitcher } from "./i18n";

/**
 * Dashboard.jsx — UAE Billing SaaS control panel (EN / AR / UR, RTL-aware).
 * Pass apiBase + authToken. Language is internal state by default, or control
 * it from the parent via the optional `lang` / `onLangChange` props.
 */

const VAT_RATE = 5;

const NAV = [
  { gkey: "g_overview", items: [{ key: "dashboard", tkey: "nav_dashboard", icon: LayoutDashboard }] },
  { gkey: "g_sales", items: [
      { key: "quotations", tkey: "nav_quotations", icon: FileText },
      { key: "invoices", tkey: "nav_invoices", icon: Receipt },
      { key: "payments", tkey: "nav_payments", icon: CreditCard },
      { key: "customers", tkey: "nav_customers", icon: Users },
  ]},
  { gkey: "g_operations", items: [
      { key: "services", tkey: "nav_services", icon: Wrench },
      { key: "work-orders", tkey: "nav_work_orders", icon: ClipboardList },
      { key: "export", tkey: "nav_export", icon: Download },
  ]},
  { gkey: "g_insights", items: [
      { key: "reports", tkey: "nav_reports", icon: BarChart3 },
      { key: "expenses", tkey: "nav_expenses", icon: Wallet },
  ]},
  { gkey: "g_administration", items: [
      { key: "team", tkey: "nav_team", icon: UserCog },
      { key: "support", tkey: "nav_support", icon: LifeBuoy },
      { key: "settings", tkey: "nav_settings", icon: Settings },
  ]},
];

const CURRENCIES = [
  { code: "AED", tag: "AE" }, { code: "USD", tag: "US" }, { code: "SAR", tag: "SA" },
];

const SAMPLE_STATS = { invoiced: "184250.00", collected: "131400.00", outstanding: "52850.00" };
const SAMPLE_CUSTOMERS = [
  { id: "c1", name: "Gulf Trading LLC" }, { id: "c2", name: "Marina Tech FZ" }, { id: "c3", name: "Desert Logistics" },
];

function money(value, currency) {
  return new Intl.NumberFormat("en-AE", { style: "currency", currency: currency || "AED", minimumFractionDigits: 2 }).format(Number(value || 0));
}
function lineTotals(items) {
  let subtotal = 0;
  for (const it of items) subtotal += (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
  const vat = +(subtotal * (VAT_RATE / 100)).toFixed(2);
  subtotal = +subtotal.toFixed(2);
  return { subtotal, vat, total: +(subtotal + vat).toFixed(2) };
}

export default function Dashboard({
  apiBase = "", authToken = "",
  company = { name: "بندر المطيري لتخليص المعاملات", trn: "100123456700003" },
  lang: langProp, onLangChange,
}) {
  const [langState, setLangState] = useState("ar");
  const lang = langProp ?? langState;
  const setLang = onLangChange ?? setLangState;
  const dir = dirOf(lang);
  const tr = (k, v) => translate(lang, k, v);

  const [theme, setTheme] = useState("light");
  const [currency, setCurrency] = useState("AED");
  const [active, setActive] = useState("dashboard");
  const [stats, setStats] = useState(SAMPLE_STATS);
  const [customers, setCustomers] = useState(SAMPLE_CUSTOMERS);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const dark = theme === "dark";

  async function api(path, options = {}) {
    const res = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}), ...(options.headers || {}) },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }
  async function loadStats(cur) {
    setLoading(true);
    try { setStats(await api(`/dashboard/stats?currency=${cur}&days=30`)); }
    catch { setStats(SAMPLE_STATS); }
    finally { setLoading(false); }
  }
  async function loadCustomers() {
    try { const d = await api("/customers"); if (Array.isArray(d) && d.length) setCustomers(d); } catch {}
  }
  useEffect(() => { loadStats(currency); }, [currency]);
  useEffect(() => { loadCustomers(); }, []);
  function notify(msg) { setToast(msg); setTimeout(() => setToast(""), 2600); }

  const shell = dark ? "bg-slate-950 text-slate-100" : "bg-[#F6F7F9] text-slate-800";
  const card = dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";
  const header = dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";

  return (
    <div dir={dir} lang={lang} className={`min-h-screen w-full ${shell} flex font-sans`}>
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-[#0B1220] text-slate-300">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-white/5">
          <div className="grid place-items-center h-9 w-9 rounded-lg bg-[#C8A24A] text-[#0B1220] font-bold">ب</div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">{tr("billing_suite")}</div>
            <div className="text-[11px] text-slate-500">{tr("uae_edition")}</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          {NAV.map((section) => (
            <div key={section.gkey} className="px-3 mb-5">
              <div className="px-2 mb-2 text-[10px] font-semibold tracking-[0.12em] uppercase text-slate-600">{tr(section.gkey)}</div>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon; const on = active === item.key;
                  return (
                    <li key={item.key}>
                      <button onClick={() => setActive(item.key)}
                        className={`group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition
                          ${on ? "bg-white/[0.06] text-white" : "text-slate-400 hover:text-white hover:bg-white/[0.04]"}`}>
                        <Icon size={18} className={on ? "text-[#C8A24A]" : ""} />
                        <span>{tr(item.tkey)}</span>
                        {on && <span className="ms-auto h-4 w-[3px] rounded-full bg-[#C8A24A]" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/5 text-[11px] text-slate-600">v1.0 · {company.name}</div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className={`h-16 shrink-0 border-b ${header} flex items-center gap-3 px-4 sm:px-6`}>
          <div className="min-w-0">
            <div className="font-semibold truncate">{company.name}</div>
            <div className="text-xs text-slate-500">{tr("trn")}: {company.trn}</div>
          </div>
          <div className="ms-auto flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher lang={lang} setLang={setLang} dark={dark} />
            <div className={`relative flex items-center rounded-lg border px-2.5 py-1.5 text-sm ${dark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"}`}>
              <span className="me-2 inline-grid place-items-center h-5 w-7 rounded bg-slate-200 text-[10px] font-bold text-slate-700">
                {CURRENCIES.find((c) => c.code === currency)?.tag}
              </span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="bg-transparent outline-none pe-1 cursor-pointer">
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
            <button onClick={() => setTheme(dark ? "light" : "dark")}
              className={`grid place-items-center h-9 w-9 rounded-lg border ${dark ? "border-slate-700 bg-slate-800 text-amber-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}
              aria-label="Toggle theme">
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div>
              <h1 className="text-xl font-semibold">{tr("g_overview")}</h1>
              <p className="text-sm text-slate-500">{tr("last_30_days")} · {currency}</p>
            </div>
            <div className="ms-auto flex flex-wrap gap-2">
              <button onClick={() => setModal("invoice")} className="flex items-center gap-2 rounded-lg bg-[#0B1220] text-white px-3.5 py-2 text-sm font-medium hover:bg-[#16213a]">
                <Plus size={16} /> {tr("qa_new_invoice")}
              </button>
              <button onClick={() => setModal("payment")} className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium border ${dark ? "border-slate-700 hover:bg-slate-800" : "border-slate-300 hover:bg-slate-100"}`}>
                <CreditCard size={16} /> {tr("qa_record_payment")}
              </button>
              <button onClick={() => setModal("customer")} className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium border ${dark ? "border-slate-700 hover:bg-slate-800" : "border-slate-300 hover:bg-slate-100"}`}>
                <Users size={16} /> {tr("qa_add_customer")}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard card={card} loading={loading} label={tr("stat_invoiced")} value={money(stats.invoiced, currency)} accent="indigo" icon={Receipt} hint={tr("stat_issued")} />
            <StatCard card={card} loading={loading} label={tr("stat_collected")} value={money(stats.collected, currency)} accent="emerald" icon={TrendingUp} hint={tr("stat_received")} />
            <StatCard card={card} loading={loading} label={tr("stat_outstanding")} value={money(stats.outstanding, currency)} accent="amber" icon={ArrowUpRight} hint={tr("stat_awaiting")} />
          </div>

          <div className={`mt-6 rounded-xl border ${card} p-6 text-sm text-slate-500`}>{tr("section_hint")}</div>
        </main>
      </div>

      {modal === "invoice" && (
        <InvoiceModal tr={tr} dir={dir} dark={dark} currency={currency} customers={customers} onClose={() => setModal(null)}
          onSubmit={async (payload) => {
            try { await api("/invoices", { method: "POST", body: JSON.stringify(payload) }); notify(tr("toast_invoice_created")); loadStats(currency); }
            catch { notify(tr("toast_saved_demo")); }
            setModal(null);
          }} />
      )}
      {modal === "payment" && (
        <PaymentModal tr={tr} dir={dir} dark={dark} currency={currency} onClose={() => setModal(null)}
          onSubmit={async (payload) => {
            try { await api("/payments", { method: "POST", body: JSON.stringify(payload) }); notify(tr("toast_payment_recorded")); loadStats(currency); }
            catch { notify(tr("toast_saved_demo")); }
            setModal(null);
          }} />
      )}
      {modal === "customer" && (
        <CustomerModal tr={tr} dir={dir} dark={dark} onClose={() => setModal(null)}
          onSubmit={async (payload) => {
            try { await api("/customers", { method: "POST", body: JSON.stringify(payload) }); notify(tr("toast_customer_added")); loadCustomers(); }
            catch { notify(tr("toast_saved_demo")); }
            setModal(null);
          }} />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-[#0B1220] text-white text-sm px-4 py-2 shadow-lg">{toast}</div>
      )}
    </div>
  );
}

function StatCard({ card, label, value, accent, icon: Icon, hint, loading }) {
  const accents = { indigo: "bg-indigo-50 text-indigo-600", emerald: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600" };
  return (
    <div className={`rounded-xl border ${card} p-5`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        <span className={`grid place-items-center h-8 w-8 rounded-lg ${accents[accent]}`}><Icon size={16} /></span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{loading ? <span className="text-slate-400">…</span> : value}</div>
      <div className="mt-1 text-xs text-slate-400">{hint}</div>
    </div>
  );
}

function ModalShell({ tr, dir, dark, title, onClose, children, footer, wide }) {
  const panel = dark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-800";
  return (
    <div dir={dir} className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-2xl ${panel} shadow-xl max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-black/5">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-black/5">{footer}</div>}
      </div>
    </div>
  );
}

function Field({ dark, label, ...props }) {
  const input = dark ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500" : "bg-white border-slate-300 text-slate-800 placeholder-slate-400";
  return (
    <label className="block">
      {label && <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>}
      <input className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#C8A24A]/40 ${input}`} {...props} />
    </label>
  );
}

function InvoiceModal({ tr, dir, dark, currency, customers, onClose, onSubmit }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id || "");
  const [lines, setLines] = useState([{ description: "", quantity: 1, unit_price: 0 }]);
  const totals = useMemo(() => lineTotals(lines), [lines]);
  const upd = (i, k, v) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const select = dark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-white border-slate-300";
  return (
    <ModalShell tr={tr} dir={dir} dark={dark} wide title={tr("modal_new_invoice")} onClose={onClose}
      footer={
        <div className="flex items-center justify-between">
          <div className="text-sm"><span className="text-slate-500">{tr("f_total_incl")} </span><span className="font-semibold tabular-nums">{money(totals.total, currency)}</span></div>
          <button onClick={() => onSubmit({ customer_id: customerId, currency, items: lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unit_price: Number(l.unit_price), vat_rate: VAT_RATE })) })}
            disabled={!customerId || lines.some((l) => !l.description)} className="rounded-lg bg-[#0B1220] text-white px-4 py-2 text-sm font-medium disabled:opacity-40">
            {tr("btn_create_invoice")}
          </button>
        </div>
      }>
      <label className="block mb-4">
        <span className="block text-xs font-medium text-slate-500 mb-1">{tr("f_customer")}</span>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${select}`}>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-12 gap-2 text-[11px] font-medium text-slate-400 px-1 mb-1">
        <div className="col-span-6">{tr("f_description")}</div><div className="col-span-2 text-end">{tr("f_qty")}</div>
        <div className="col-span-3 text-end">{tr("f_unit_price")}</div><div className="col-span-1" />
      </div>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input className={`col-span-6 rounded-lg border px-2.5 py-2 text-sm outline-none ${select}`} placeholder={tr("f_description")} value={l.description} onChange={(e) => upd(i, "description", e.target.value)} />
            <input type="number" min="0" className={`col-span-2 rounded-lg border px-2 py-2 text-sm text-end outline-none ${select}`} value={l.quantity} onChange={(e) => upd(i, "quantity", e.target.value)} />
            <input type="number" min="0" step="0.01" className={`col-span-3 rounded-lg border px-2 py-2 text-sm text-end outline-none ${select}`} value={l.unit_price} onChange={(e) => upd(i, "unit_price", e.target.value)} />
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
    </ModalShell>
  );
}

function Row({ label, value, bold }) {
  return (<div className="flex justify-between"><span className="text-slate-500">{label}</span><span className={`tabular-nums ${bold ? "font-semibold" : ""}`}>{value}</span></div>);
}

function PaymentModal({ tr, dir, dark, currency, onClose, onSubmit }) {
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const select = dark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-white border-slate-300";
  return (
    <ModalShell tr={tr} dir={dir} dark={dark} title={tr("modal_payment")} onClose={onClose}
      footer={<button onClick={() => onSubmit({ invoice_id: invoiceId, amount: Number(amount), method })} disabled={!invoiceId || !amount} className="w-full rounded-lg bg-[#0B1220] text-white px-4 py-2 text-sm font-medium disabled:opacity-40">{tr("btn_save_payment")}</button>}>
      <div className="space-y-4">
        <Field dark={dark} label={tr("f_invoice_id")} placeholder="invoice uuid" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} />
        <Field dark={dark} label={`${tr("f_amount")} (${currency})`} type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">{tr("f_method")}</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${select}`}>
            <option value="bank_transfer">{tr("m_bank_transfer")}</option><option value="cash">{tr("m_cash")}</option>
            <option value="card">{tr("m_card")}</option><option value="cheque">{tr("m_cheque")}</option><option value="online">{tr("m_online")}</option>
          </select>
        </label>
      </div>
    </ModalShell>
  );
}

function CustomerModal({ tr, dir, dark, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: "", trn: "", email: "", phone: "" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <ModalShell tr={tr} dir={dir} dark={dark} title={tr("modal_customer")} onClose={onClose}
      footer={<button onClick={() => onSubmit(form)} disabled={!form.name} className="w-full rounded-lg bg-[#0B1220] text-white px-4 py-2 text-sm font-medium disabled:opacity-40">{tr("btn_save_customer")}</button>}>
      <div className="space-y-4">
        <Field dark={dark} label={tr("f_name")} value={form.name} onChange={set("name")} />
        <Field dark={dark} label={tr("f_trn_optional")} value={form.trn} onChange={set("trn")} />
        <Field dark={dark} label={tr("f_email")} type="email" value={form.email} onChange={set("email")} />
        <Field dark={dark} label={tr("f_phone")} value={form.phone} onChange={set("phone")} />
      </div>
    </ModalShell>
  );
}
