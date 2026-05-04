-- ── 007_cost_plus.sql ─────────────────────────────────────────────────────────
-- Adds Cost Plus job type to projects + labour_entries / cost_invoices tables.
-- All changes are additive — no existing data is modified.

-- ── 1. Extend projects ────────────────────────────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'fixed_price'
    CHECK (job_type IN ('fixed_price', 'cost_plus')),
  ADD COLUMN IF NOT EXISTS labour_markup_percent    NUMERIC(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS materials_markup_percent NUMERIC(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_hourly_rate      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS default_daily_rate       NUMERIC(10,2);

-- ── 2. labour_entries ─────────────────────────────────────────────────────────
CREATE TABLE labour_entries (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entry_date      DATE          NOT NULL,
  worker_name     TEXT          NOT NULL,
  description     TEXT,
  rate_type       TEXT          NOT NULL CHECK (rate_type IN ('hourly', 'daily')),
  units           NUMERIC(8,2)  NOT NULL,
  rate            NUMERIC(10,2) NOT NULL,
  amount          NUMERIC(12,2) GENERATED ALWAYS AS (units * rate) STORED,
  claim_period_id UUID          REFERENCES payment_claims(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_by      UUID          REFERENCES auth.users(id)
);

CREATE INDEX idx_labour_entries_project_date ON labour_entries(project_id, entry_date);
CREATE INDEX idx_labour_entries_claim_period ON labour_entries(claim_period_id);

-- ── 3. cost_invoices ──────────────────────────────────────────────────────────
CREATE TABLE cost_invoices (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  invoice_date    DATE          NOT NULL,
  supplier_name   TEXT          NOT NULL,
  category        TEXT          NOT NULL CHECK (category IN ('trade', 'materials', 'other')),
  trade_category  TEXT,
  invoice_number  TEXT,
  description     TEXT,
  amount_ex_gst   NUMERIC(12,2) NOT NULL,
  gst_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_inc_gst  NUMERIC(12,2) GENERATED ALWAYS AS (amount_ex_gst + gst_amount) STORED,
  file_url        TEXT,
  file_name       TEXT,
  claim_period_id UUID          REFERENCES payment_claims(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_by      UUID          REFERENCES auth.users(id)
);

CREATE INDEX idx_cost_invoices_project_date ON cost_invoices(project_id, invoice_date);
CREATE INDEX idx_cost_invoices_claim_period ON cost_invoices(claim_period_id);

-- ── 4. updated_at triggers — reuse existing set_updated_at() function ─────────
CREATE TRIGGER labour_entries_updated_at
  BEFORE UPDATE ON labour_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER cost_invoices_updated_at
  BEFORE UPDATE ON cost_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 5. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE labour_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_invoices  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "builders can manage labour_entries"
  ON labour_entries FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organisation_id = my_organisation_id()
    )
    AND my_role() IN ('consultant', 'builder')
  );

CREATE POLICY "builders can manage cost_invoices"
  ON cost_invoices FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organisation_id = my_organisation_id()
    )
    AND my_role() IN ('consultant', 'builder')
  );

-- ── 6. Table-level GRANTs ─────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON labour_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cost_invoices  TO authenticated;
