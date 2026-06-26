import React from "react";
import { Languages } from "lucide-react";

/**
 * i18n.js — shared translations for English / Arabic / Urdu.
 * Pure helpers (no context needed):
 *   t(lang, key, vars?)   -> translated string with {var} interpolation
 *   dirOf(lang)           -> "ltr" | "rtl"
 *   <LanguageSwitcher lang setLang />
 *
 * Screens keep a `lang` state (or receive lang/onLangChange props) and set
 * dir={dirOf(lang)} on their root element. Arabic and Urdu render right-to-left.
 */

export const LANGS = [
  { code: "en", label: "English", native: "English", dir: "ltr", tag: "EN" },
  { code: "ar", label: "Arabic",  native: "العربية", dir: "rtl", tag: "ع" },
  { code: "ur", label: "Urdu",    native: "اردو",    dir: "rtl", tag: "اُ" },
];

export function dirOf(lang) {
  return (LANGS.find((l) => l.code === lang) || LANGS[0]).dir;
}

const STRINGS = {
  en: {
    billing_suite: "Billing Suite", uae_edition: "UAE Edition",
    g_overview: "Overview", g_sales: "Sales", g_operations: "Operations",
    g_insights: "Insights", g_administration: "Administration",
    nav_dashboard: "Dashboard", nav_quotations: "Quotations", nav_invoices: "Invoices",
    nav_payments: "Payments", nav_customers: "Customers", nav_services: "Services",
    nav_work_orders: "Work Orders", nav_export: "Export", nav_reports: "Reports",
    nav_expenses: "Expenses", nav_team: "Team", nav_support: "Support", nav_settings: "Settings",
    trn: "TRN", last_30_days: "Last 30 days",
    qa_new_invoice: "New invoice", qa_record_payment: "Record payment", qa_add_customer: "Add customer",
    stat_invoiced: "Invoiced", stat_collected: "Collected", stat_outstanding: "Outstanding",
    stat_issued: "Issued this period", stat_received: "Payments received", stat_awaiting: "Awaiting payment",
    section_hint: "Open this section to manage its records.",
    modal_new_invoice: "New invoice", modal_customer: "Add customer", modal_payment: "Record payment",
    f_customer: "Customer", f_description: "Description", f_qty: "Qty", f_unit_price: "Unit price",
    f_add_line: "Add line", f_subtotal: "Subtotal", f_vat: "VAT (5%)", f_total: "Total",
    f_total_incl: "Total incl. VAT", f_invoice_id: "Invoice ID", f_amount: "Amount", f_method: "Method",
    f_name: "Name", f_trn_optional: "TRN (optional)", f_email: "Email", f_phone: "Phone",
    f_balance_due: "Balance due",
    btn_create_invoice: "Create invoice", btn_save_payment: "Save payment", btn_save_customer: "Save customer",
    m_bank_transfer: "Bank transfer", m_cash: "Cash", m_card: "Card", m_cheque: "Cheque", m_online: "Online",
    toast_invoice_created: "Invoice created", toast_payment_recorded: "Payment recorded",
    toast_customer_added: "Customer added", toast_saved_demo: "Saved (demo)",
    toast_sent: "Sent to {x}", toast_sent_demo: "Email sent (demo)", toast_cancelled: "Invoice cancelled",
    toast_pdf_warn: "PDF available once connected to the API",
    toast_paylink_warn: "Payment link ready once Stripe is connected",
    inv_shown: "{n} shown", inv_outstanding: "{v} outstanding",
    inv_search: "Search by number or customer…",
    flt_all: "All", flt_unpaid: "Unpaid", flt_partial: "Partial", flt_overdue: "Overdue",
    flt_paid: "Paid", flt_cancelled: "Cancelled",
    demo_mode: "Demo mode — showing sample data. Pass apiBase and authToken to go live.",
    col_invoice: "Invoice", col_customer: "Customer", col_issued: "Issued", col_due: "Due",
    col_status: "Status", col_total: "Total", col_balance: "Balance",
    empty_invoices: "No invoices match your filter.", loading: "Loading…",
    st_paid: "Paid", st_partial: "Partial", st_unpaid: "Unpaid", st_overdue: "Overdue", st_cancelled: "Cancelled",
    d_payments: "Payments", d_amount_due: "Amount due", d_paid: "Paid",
    a_pay_now: "Pay now · {v}", a_record_payment: "Record payment", a_pdf: "PDF",
    a_send_email: "Send email", a_cancel: "Cancel",
  },
  ar: {
    billing_suite: "نظام الفوترة", uae_edition: "النسخة الإماراتية",
    g_overview: "نظرة عامة", g_sales: "المبيعات", g_operations: "العمليات",
    g_insights: "التحليلات", g_administration: "الإدارة",
    nav_dashboard: "لوحة التحكم", nav_quotations: "عروض الأسعار", nav_invoices: "الفواتير",
    nav_payments: "المدفوعات", nav_customers: "العملاء", nav_services: "الخدمات",
    nav_work_orders: "أوامر العمل", nav_export: "تصدير", nav_reports: "التقارير",
    nav_expenses: "المصروفات", nav_team: "الفريق", nav_support: "الدعم", nav_settings: "الإعدادات",
    trn: "الرقم الضريبي", last_30_days: "آخر ٣٠ يوماً",
    qa_new_invoice: "فاتورة جديدة", qa_record_payment: "تسجيل دفعة", qa_add_customer: "إضافة عميل",
    stat_invoiced: "الفواتير الصادرة", stat_collected: "المبالغ المحصّلة", stat_outstanding: "المستحقات",
    stat_issued: "الصادر خلال الفترة", stat_received: "المدفوعات المستلمة", stat_awaiting: "بانتظار السداد",
    section_hint: "افتح هذا القسم لإدارة سجلاته.",
    modal_new_invoice: "فاتورة جديدة", modal_customer: "إضافة عميل", modal_payment: "تسجيل دفعة",
    f_customer: "العميل", f_description: "الوصف", f_qty: "الكمية", f_unit_price: "سعر الوحدة",
    f_add_line: "إضافة سطر", f_subtotal: "المجموع", f_vat: "ضريبة القيمة المضافة (٥٪)", f_total: "الإجمالي",
    f_total_incl: "الإجمالي شامل الضريبة", f_invoice_id: "رقم الفاتورة", f_amount: "المبلغ", f_method: "طريقة الدفع",
    f_name: "الاسم", f_trn_optional: "الرقم الضريبي (اختياري)", f_email: "البريد", f_phone: "الهاتف",
    f_balance_due: "المبلغ المتبقي",
    btn_create_invoice: "إنشاء الفاتورة", btn_save_payment: "حفظ الدفعة", btn_save_customer: "حفظ العميل",
    m_bank_transfer: "تحويل بنكي", m_cash: "نقداً", m_card: "بطاقة", m_cheque: "شيك", m_online: "إلكتروني",
    toast_invoice_created: "تم إنشاء الفاتورة", toast_payment_recorded: "تم تسجيل الدفعة",
    toast_customer_added: "تمت إضافة العميل", toast_saved_demo: "تم الحفظ (تجريبي)",
    toast_sent: "أُرسلت إلى {x}", toast_sent_demo: "تم إرسال البريد (تجريبي)", toast_cancelled: "تم إلغاء الفاتورة",
    toast_pdf_warn: "ملف PDF متاح بعد الاتصال بالـ API",
    toast_paylink_warn: "رابط الدفع جاهز بعد ربط Stripe",
    inv_shown: "{n} معروضة", inv_outstanding: "{v} مستحقة",
    inv_search: "ابحث بالرقم أو اسم العميل…",
    flt_all: "الكل", flt_unpaid: "غير مدفوعة", flt_partial: "جزئية", flt_overdue: "متأخرة",
    flt_paid: "مدفوعة", flt_cancelled: "ملغاة",
    demo_mode: "وضع تجريبي — بيانات نموذجية. مرّر apiBase و authToken للتشغيل الفعلي.",
    col_invoice: "الفاتورة", col_customer: "العميل", col_issued: "تاريخ الإصدار", col_due: "الاستحقاق",
    col_status: "الحالة", col_total: "الإجمالي", col_balance: "المتبقي",
    empty_invoices: "لا توجد فواتير مطابقة للفلتر.", loading: "جارٍ التحميل…",
    st_paid: "مدفوعة", st_partial: "جزئية", st_unpaid: "غير مدفوعة", st_overdue: "متأخرة", st_cancelled: "ملغاة",
    d_payments: "المدفوعات", d_amount_due: "المبلغ المتبقي", d_paid: "المدفوع",
    a_pay_now: "ادفع الآن · {v}", a_record_payment: "تسجيل دفعة", a_pdf: "PDF",
    a_send_email: "إرسال بالبريد", a_cancel: "إلغاء",
  },
  ur: {
    billing_suite: "بلنگ سویٹ", uae_edition: "یو اے ای ایڈیشن",
    g_overview: "جائزہ", g_sales: "سیلز", g_operations: "آپریشنز",
    g_insights: "تجزیات", g_administration: "انتظامیہ",
    nav_dashboard: "ڈیش بورڈ", nav_quotations: "کوٹیشنز", nav_invoices: "انوائسز",
    nav_payments: "ادائیگیاں", nav_customers: "گاہک", nav_services: "خدمات",
    nav_work_orders: "ورک آرڈرز", nav_export: "ایکسپورٹ", nav_reports: "رپورٹس",
    nav_expenses: "اخراجات", nav_team: "ٹیم", nav_support: "سپورٹ", nav_settings: "ترتیبات",
    trn: "ٹیکس نمبر", last_30_days: "پچھلے ۳۰ دن",
    qa_new_invoice: "نیا انوائس", qa_record_payment: "ادائیگی درج کریں", qa_add_customer: "گاہک شامل کریں",
    stat_invoiced: "جاری کردہ انوائسز", stat_collected: "وصول شدہ رقم", stat_outstanding: "واجب الادا",
    stat_issued: "اس مدت میں جاری", stat_received: "موصولہ ادائیگیاں", stat_awaiting: "ادائیگی کے منتظر",
    section_hint: "ریکارڈز کے انتظام کے لیے یہ سیکشن کھولیں۔",
    modal_new_invoice: "نیا انوائس", modal_customer: "گاہک شامل کریں", modal_payment: "ادائیگی درج کریں",
    f_customer: "گاہک", f_description: "تفصیل", f_qty: "مقدار", f_unit_price: "فی یونٹ قیمت",
    f_add_line: "لائن شامل کریں", f_subtotal: "ذیلی میزان", f_vat: "ویٹ (۵٪)", f_total: "کل",
    f_total_incl: "کل بمع ویٹ", f_invoice_id: "انوائس آئی ڈی", f_amount: "رقم", f_method: "طریقہ",
    f_name: "نام", f_trn_optional: "ٹیکس نمبر (اختیاری)", f_email: "ای میل", f_phone: "فون",
    f_balance_due: "واجب الادا رقم",
    btn_create_invoice: "انوائس بنائیں", btn_save_payment: "ادائیگی محفوظ کریں", btn_save_customer: "گاہک محفوظ کریں",
    m_bank_transfer: "بینک ٹرانسفر", m_cash: "نقد", m_card: "کارڈ", m_cheque: "چیک", m_online: "آن لائن",
    toast_invoice_created: "انوائس بن گیا", toast_payment_recorded: "ادائیگی درج ہو گئی",
    toast_customer_added: "گاہک شامل ہو گیا", toast_saved_demo: "محفوظ ہو گیا (ڈیمو)",
    toast_sent: "{x} کو بھیج دیا گیا", toast_sent_demo: "ای میل بھیج دی گئی (ڈیمو)", toast_cancelled: "انوائس منسوخ ہو گیا",
    toast_pdf_warn: "API سے منسلک ہونے پر PDF دستیاب ہوگا",
    toast_paylink_warn: "Stripe منسلک ہونے پر ادائیگی لنک تیار ہوگا",
    inv_shown: "{n} دکھائے گئے", inv_outstanding: "{v} واجب الادا",
    inv_search: "نمبر یا گاہک سے تلاش کریں…",
    flt_all: "تمام", flt_unpaid: "غیر ادا شدہ", flt_partial: "جزوی", flt_overdue: "زائد المیعاد",
    flt_paid: "ادا شدہ", flt_cancelled: "منسوخ",
    demo_mode: "ڈیمو موڈ — نمونہ ڈیٹا۔ لائیو کے لیے apiBase اور authToken دیں۔",
    col_invoice: "انوائس", col_customer: "گاہک", col_issued: "جاری شدہ", col_due: "مقررہ تاریخ",
    col_status: "حالت", col_total: "کل", col_balance: "بقایا",
    empty_invoices: "کوئی انوائس فلٹر سے مطابقت نہیں رکھتا۔", loading: "لوڈ ہو رہا ہے…",
    st_paid: "ادا شدہ", st_partial: "جزوی", st_unpaid: "غیر ادا شدہ", st_overdue: "زائد المیعاد", st_cancelled: "منسوخ",
    d_payments: "ادائیگیاں", d_amount_due: "واجب الادا رقم", d_paid: "ادا شدہ",
    a_pay_now: "ابھی ادائیگی کریں · {v}", a_record_payment: "ادائیگی درج کریں", a_pdf: "PDF",
    a_send_email: "ای میل بھیجیں", a_cancel: "منسوخ کریں",
  },
};

export function t(lang, key, vars) {
  const dict = STRINGS[lang] || STRINGS.en;
  let s = dict[key] != null ? dict[key] : (STRINGS.en[key] != null ? STRINGS.en[key] : key);
  if (vars) for (const k of Object.keys(vars)) s = s.replace(`{${k}}`, vars[k]);
  return s;
}

export function LanguageSwitcher({ lang, setLang, dark = false }) {
  return (
    <div className={`relative flex items-center rounded-lg border px-2 py-1.5 text-sm
      ${dark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"}`}>
      <Languages size={16} className="text-slate-400 mx-1" />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        className="bg-transparent outline-none cursor-pointer pr-1"
        aria-label="Language"
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>{l.native}</option>
        ))}
      </select>
    </div>
  );
}
