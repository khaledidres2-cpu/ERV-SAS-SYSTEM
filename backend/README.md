# UAE Billing SaaS — نظام فوترة وعروض أسعار سحابي

نظام SaaS متعدد الشركات للفوترة وعروض الأسعار، موجّه للسوق الإماراتي
(الدرهم AED، الرقم الضريبي TRN، ضريبة القيمة المضافة 5%).

## المكدّس التقني
- **Backend:** FastAPI + asyncpg + PostgreSQL
- **Frontend:** React + Tailwind + lucide-react
- **PDF:** ReportLab (فاتورة ضريبية ثنائية اللغة)
- **Payments:** Stripe Checkout + Webhook
- **Email:** SMTP

## الميزات
- عزل صارم بين الشركات عبر **Row-Level Security** (لا تسريب حتى مع خطأ برمجي)
- حساب VAT بدقة `Decimal` داخل معاملات **ACID**
- ترقيم فواتير متسلسل آمن من التضارب (`INV-2026-00001`)
- تريجر يحدّث حالة الفاتورة تلقائياً عند كل دفعة
- صلاحيات أدوار (admin / accountant / staff / viewer) + **سجل تدقيق**
- فاتورة ضريبية PDF + إرسال بالبريد
- دفع إلكتروني عبر Stripe، يسجّل الدفعة تلقائياً عبر الـ webhook
- تحويل عرض السعر إلى فاتورة، إلغاء فاتورة

## ملفات الـ Backend
| الملف | الوظيفة |
|------|---------|
| `schema.sql` | مخطط قاعدة البيانات + التريجرات + RLS |
| `main.py` | تطبيق FastAPI وكل المسارات |
| `db.py` | اتصال القاعدة وسياق المستأجر |
| `auth.py` | JWT + كلمات المرور + الصلاحيات RBAC |
| `money.py` | محرك VAT بدقة Decimal + الترقيم |
| `schemas.py` | نماذج الطلبات (Pydantic) |
| `pdf.py` | مولّد الفاتورة الضريبية PDF |
| `emailer.py` | إرسال الفاتورة بالبريد |
| `payments.py` | تكامل Stripe + webhook |
| `audit.py` | سجل التدقيق |
| `fonts/` | خط Cairo العربي (مطلوب للـ PDF) |

## التشغيل المحلي
```bash
pip install -r requirements.txt
cp .env.example .env          # ثم عدّل القيم
psql "$DATABASE_URL" -f schema.sql
uvicorn main:app --reload
```

## النشر على Railway
1. ارفع مجلد `backend/` (بما فيه `fonts/`) إلى ريبو GitHub.
2. أضف إضافة **PostgreSQL** — يظهر `DATABASE_URL` تلقائياً.
3. شغّل `schema.sql` مرة واحدة من تبويب **Query** في إضافة Postgres.
4. أضف المتغيرات من `.env.example` (خاصة `JWT_SECRET`).
5. أمر التشغيل موجود في `Procfile`.
6. أضف مسار الـ webhook في Stripe: `https://<app>.up.railway.app/payments/webhook`.

## أهم المسارات
```
POST /auth/register-company     إنشاء شركة + مدير
POST /auth/login                تسجيل الدخول (JWT)
GET  /company                   بيانات الشركة (الاسم، الرقم الضريبي…)
PUT  /company                   تعديل ملف الشركة (admin) — يظهر في رأس الفاتورة
POST /customers                 إضافة عميل
POST /quotations                إنشاء عرض سعر
POST /quotations/{id}/convert   تحويل عرض إلى فاتورة
POST /invoices                  إنشاء فاتورة (VAT تلقائي)
GET  /invoices/{id}/pdf         تنزيل/عرض الفاتورة الضريبية PDF
POST /invoices/{id}/send        إرسال الفاتورة بالبريد
POST /invoices/{id}/cancel      إلغاء فاتورة
POST /payments                  تسجيل دفعة يدوية
POST /payments/checkout         رابط دفع إلكتروني (Stripe)
POST /payments/webhook          استقبال تأكيد الدفع
GET  /dashboard/stats           إحصائيات آخر 30 يوماً
GET  /audit                     سجل التدقيق (admin)
```

التوثيق التفاعلي الكامل متاح على `/docs` بعد التشغيل.
