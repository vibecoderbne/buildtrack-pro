-- ── 008_cost_plus_claim_markup.sql ───────────────────────────────────────────
-- Adds applied markup snapshot columns to payment_claims for Cost Plus projects.
-- Stored at claim-generation time so historical claims are unaffected by later
-- changes to the project's markup percentages.

ALTER TABLE payment_claims
  ADD COLUMN IF NOT EXISTS applied_labour_markup_percent    NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS applied_materials_markup_percent NUMERIC(5,2);
