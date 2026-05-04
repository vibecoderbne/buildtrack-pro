-- ── 009_fix_rls_update_policies.sql ──────────────────────────────────────────
-- Splits the broad FOR ALL policies on labour_entries and cost_invoices into
-- explicit per-operation policies with correct WITH CHECK clauses.
-- FOR ALL with only USING can silently block UPDATE from server actions in
-- some PostgREST configurations because the implicit WITH CHECK rejects rows
-- where the generated columns change their expression result.

-- ── labour_entries ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "builders can manage labour_entries" ON labour_entries;

CREATE POLICY "labour_entries_select"
  ON labour_entries FOR SELECT TO authenticated
  USING (
    project_id IN (SELECT id FROM projects WHERE organisation_id = my_organisation_id())
  );

CREATE POLICY "labour_entries_insert"
  ON labour_entries FOR INSERT TO authenticated
  WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE organisation_id = my_organisation_id())
    AND my_role() IN ('consultant', 'builder')
  );

CREATE POLICY "labour_entries_update"
  ON labour_entries FOR UPDATE TO authenticated
  USING (
    project_id IN (SELECT id FROM projects WHERE organisation_id = my_organisation_id())
    AND my_role() IN ('consultant', 'builder')
  )
  WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE organisation_id = my_organisation_id())
    AND my_role() IN ('consultant', 'builder')
  );

CREATE POLICY "labour_entries_delete"
  ON labour_entries FOR DELETE TO authenticated
  USING (
    project_id IN (SELECT id FROM projects WHERE organisation_id = my_organisation_id())
    AND my_role() IN ('consultant', 'builder')
  );

-- ── cost_invoices ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "builders can manage cost_invoices" ON cost_invoices;

CREATE POLICY "cost_invoices_select"
  ON cost_invoices FOR SELECT TO authenticated
  USING (
    project_id IN (SELECT id FROM projects WHERE organisation_id = my_organisation_id())
  );

CREATE POLICY "cost_invoices_insert"
  ON cost_invoices FOR INSERT TO authenticated
  WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE organisation_id = my_organisation_id())
    AND my_role() IN ('consultant', 'builder')
  );

CREATE POLICY "cost_invoices_update"
  ON cost_invoices FOR UPDATE TO authenticated
  USING (
    project_id IN (SELECT id FROM projects WHERE organisation_id = my_organisation_id())
    AND my_role() IN ('consultant', 'builder')
  )
  WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE organisation_id = my_organisation_id())
    AND my_role() IN ('consultant', 'builder')
  );

CREATE POLICY "cost_invoices_delete"
  ON cost_invoices FOR DELETE TO authenticated
  USING (
    project_id IN (SELECT id FROM projects WHERE organisation_id = my_organisation_id())
    AND my_role() IN ('consultant', 'builder')
  );
