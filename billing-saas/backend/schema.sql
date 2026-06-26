-- ============================================================================
--  UAE SaaS Billing / ERP — Full PostgreSQL Schema
--  Multi-tenant (company_id on every row + Row-Level Security)
--  UAE localized: AED, TRN, VAT 5%
--  PostgreSQL 14+  |  run:  psql "$DATABASE_URL" -f schema.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email

-- ----------------------------------------------------------------------------
--  Helper: generic updated_at stamper
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
--  1. COMPANIES  (the tenant root — NOT protected by RLS, looked up by id)
-- ============================================================================
CREATE TABLE companies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT        NOT NULL,
    legal_name      TEXT,
    trn             VARCHAR(15),                       -- UAE Tax Registration Number (15 digits)
    currency        CHAR(3)     NOT NULL DEFAULT 'AED',
    vat_rate        NUMERIC(5,2) NOT NULL DEFAULT 5.00,
    invoice_prefix  TEXT        NOT NULL DEFAULT 'INV',
    quote_prefix    TEXT        NOT NULL DEFAULT 'QUO',
    email           CITEXT,
    phone           TEXT,
    address         TEXT,
    logo_url        TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT trn_format CHECK (trn IS NULL OR trn ~ '^[0-9]{15}$')
);
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
--  2. USERS  (auth principals — one company per user; app-level lookup)
-- ============================================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email           CITEXT      NOT NULL UNIQUE,
    full_name       TEXT        NOT NULL,
    password_hash   TEXT        NOT NULL,
    role            TEXT        NOT NULL DEFAULT 'admin'
                    CHECK (role IN ('admin','accountant','staff','viewer')),
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_company ON users(company_id);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
--  3. CUSTOMERS
-- ============================================================================
CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    trn             VARCHAR(15),
    email           CITEXT,
    phone           TEXT,
    address         TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cust_trn_format CHECK (trn IS NULL OR trn ~ '^[0-9]{15}$')
);
CREATE INDEX idx_customers_company ON customers(company_id);
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
--  4. PER-TENANT DOCUMENT SEQUENCES (race-safe numbering source of truth)
-- ============================================================================
CREATE TABLE document_sequences (
    company_id  UUID  NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    doc_type    TEXT  NOT NULL CHECK (doc_type IN ('invoice','quotation')),
    year        INT   NOT NULL,
    last_number BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (company_id, doc_type, year)
);

-- ============================================================================
--  5. QUOTATIONS
-- ============================================================================
CREATE TABLE quotations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    customer_id     UUID        NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    quote_number    TEXT        NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','accepted','rejected','expired')),
    currency        CHAR(3)     NOT NULL DEFAULT 'AED',
    issue_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
    expiry_date     DATE,
    subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
    vat_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    total           NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, quote_number)
);
CREATE INDEX idx_quotations_company  ON quotations(company_id);
CREATE INDEX idx_quotations_customer ON quotations(customer_id);
CREATE TRIGGER trg_quotations_updated BEFORE UPDATE ON quotations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE quotation_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    quotation_id    UUID        NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    description     TEXT        NOT NULL,
    quantity        NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
    vat_rate        NUMERIC(5,2)  NOT NULL DEFAULT 5.00,
    line_subtotal   NUMERIC(14,2) NOT NULL,
    line_vat        NUMERIC(14,2) NOT NULL,
    line_total      NUMERIC(14,2) NOT NULL,
    position        INT          NOT NULL DEFAULT 0
);
CREATE INDEX idx_quotation_items_q ON quotation_items(quotation_id);

-- ============================================================================
--  6. INVOICES
-- ============================================================================
CREATE TABLE invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    customer_id     UUID        NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    quotation_id    UUID        REFERENCES quotations(id) ON DELETE SET NULL,
    invoice_number  TEXT        NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'unpaid'
                    CHECK (status IN ('unpaid','partially_paid','paid','cancelled')),
    currency        CHAR(3)     NOT NULL DEFAULT 'AED',
    issue_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
    due_date        DATE        NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 day'),
    subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
    vat_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    total           NUMERIC(14,2) NOT NULL DEFAULT 0,
    amount_paid     NUMERIC(14,2) NOT NULL DEFAULT 0,
    amount_due      NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, invoice_number)
);
CREATE INDEX idx_invoices_company  ON invoices(company_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status   ON invoices(company_id, status);
CREATE INDEX idx_invoices_issue    ON invoices(company_id, issue_date);
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE invoice_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    invoice_id      UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description     TEXT        NOT NULL,
    quantity        NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
    vat_rate        NUMERIC(5,2)  NOT NULL DEFAULT 5.00,
    line_subtotal   NUMERIC(14,2) NOT NULL,
    line_vat        NUMERIC(14,2) NOT NULL,
    line_total      NUMERIC(14,2) NOT NULL,
    position        INT          NOT NULL DEFAULT 0
);
CREATE INDEX idx_invoice_items_inv ON invoice_items(invoice_id);

-- ============================================================================
--  7. PAYMENTS
-- ============================================================================
CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    invoice_id      UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    method          TEXT        NOT NULL DEFAULT 'bank_transfer'
                    CHECK (method IN ('cash','bank_transfer','card','cheque','online')),
    payment_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
    reference       TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_company ON payments(company_id);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);

-- ============================================================================
--  8. SMART TRIGGER — auto-update invoice status & balances on any payment
-- ============================================================================
CREATE OR REPLACE FUNCTION recompute_invoice_totals(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total          NUMERIC(14,2);
    v_paid           NUMERIC(14,2);
    v_current_status TEXT;
    v_new_status     TEXT;
BEGIN
    -- Lock the invoice row to serialize concurrent payment writes
    SELECT total, status
      INTO v_total, v_current_status
      FROM invoices
     WHERE id = p_invoice_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(amount), 0)
      INTO v_paid
      FROM payments
     WHERE invoice_id = p_invoice_id;

    IF v_current_status = 'cancelled' THEN
        v_new_status := 'cancelled';                 -- never auto-revive a cancelled invoice
    ELSIF v_paid <= 0 THEN
        v_new_status := 'unpaid';
    ELSIF v_paid >= v_total THEN
        v_new_status := 'paid';
    ELSE
        v_new_status := 'partially_paid';
    END IF;

    UPDATE invoices
       SET amount_paid = v_paid,
           amount_due  = GREATEST(v_total - v_paid, 0),
           status      = v_new_status,
           updated_at  = now()
     WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_payments_sync()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        PERFORM recompute_invoice_totals(OLD.invoice_id);
        RETURN OLD;
    END IF;

    PERFORM recompute_invoice_totals(NEW.invoice_id);

    -- If a payment was moved to a different invoice, refresh the old one too
    IF (TG_OP = 'UPDATE' AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id) THEN
        PERFORM recompute_invoice_totals(OLD.invoice_id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_sync_invoice
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION trg_payments_sync();

-- ============================================================================
--  8b. PAYMENT INTENTS (online checkout tracking — Stripe/Ziina)
-- ============================================================================
CREATE TABLE payment_intents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    invoice_id  UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    provider    TEXT        NOT NULL,                       -- 'stripe' | 'ziina'
    external_id TEXT        NOT NULL,                       -- checkout session id
    status      TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid','failed','cancelled')),
    amount      NUMERIC(14,2) NOT NULL,
    currency    CHAR(3)     NOT NULL DEFAULT 'AED',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, external_id)
);
CREATE INDEX idx_payment_intents_company ON payment_intents(company_id);
CREATE INDEX idx_payment_intents_invoice ON payment_intents(invoice_id);

-- ============================================================================
--  8c. AUDIT LOG (append-only — who did what, when)
-- ============================================================================
CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT        NOT NULL,                       -- e.g. 'invoice.create'
    entity      TEXT        NOT NULL,                       -- e.g. 'invoice'
    entity_id   TEXT,
    meta        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_company ON audit_log(company_id, created_at DESC);

-- ============================================================================
--  9. ROW-LEVEL SECURITY — hard tenant isolation at the database layer
--     The API sets:  SELECT set_config('app.current_company_id', '<uuid>', true)
--     inside every request transaction. A bug that forgets the company filter
--     still cannot leak another tenant's rows.
-- ============================================================================
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'customers','quotations','quotation_items',
        'invoices','invoice_items','payments','document_sequences',
        'payment_intents','audit_log'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY;', t);
        EXECUTE format($f$
            CREATE POLICY tenant_isolation ON %I
            USING (company_id = current_setting('app.current_company_id', true)::uuid)
            WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);
        $f$, t);
    END LOOP;
END $$;

-- ============================================================================
--  Done.
-- ============================================================================
