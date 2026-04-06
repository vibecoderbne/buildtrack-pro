-- Allow any authenticated user to create an organisation.
-- This is needed for the initial setup flow: a brand-new user has no
-- organisation_id yet, so the existing org-scoped policies return nothing.
create policy "authenticated users can create an organisation"
  on organisations for insert
  with check (auth.uid() is not null);
