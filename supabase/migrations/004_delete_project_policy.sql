-- ============================================================
-- Allow consultants to delete projects in their organisation.
-- All child tables (phases, tasks, dependencies, contracts,
-- delays, payment_claims, homeowner_updates, etc.) are covered
-- by ON DELETE CASCADE on the FK to projects — cascades bypass
-- RLS, so only this one policy is needed.
-- ============================================================

create policy "consultants can delete org projects"
  on projects for delete
  using (
    organisation_id = my_organisation_id()
    and my_role() = 'consultant'
  );
