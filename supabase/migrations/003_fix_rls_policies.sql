-- ============================================================
-- ProgressBuild — Fix RLS policies for signup → setup → dashboard flow
-- Run this in the Supabase SQL Editor
-- ============================================================

-- ── organisations ────────────────────────────────────────────
-- Allow any authenticated user to INSERT their first org.
-- (New users have organisation_id = NULL so org-scoped policies won't match.)
drop policy if exists "authenticated users can create an organisation" on organisations;
create policy "authenticated users can create an organisation"
  on organisations for insert
  with check (auth.uid() is not null);

-- Allow org members to read their org (existing policy — recreate cleanly)
drop policy if exists "org members can read their org" on organisations;
create policy "org members can read their org"
  on organisations for select
  using (id = my_organisation_id());

-- Allow org admin (consultant/builder) to update their org
drop policy if exists "org members can update their org" on organisations;
create policy "org members can update their org"
  on organisations for update
  using (id = my_organisation_id() and my_role() in ('consultant', 'builder'));

-- ── users ─────────────────────────────────────────────────────
-- Allow a user to insert their own profile row (created during signup).
drop policy if exists "users can insert their own profile" on users;
create policy "users can insert their own profile"
  on users for insert
  with check (id = auth.uid());

-- Allow users to read their own row AND other members of their org.
-- The `id = auth.uid()` clause is essential for new users with no org yet.
drop policy if exists "users can read org members" on users;
create policy "users can read org members"
  on users for select
  using (id = auth.uid() or organisation_id = my_organisation_id());

-- Allow users to update their own profile row (sets organisation_id + role during setup).
drop policy if exists "users can update own profile" on users;
create policy "users can update own profile"
  on users for update
  using (id = auth.uid())
  with check (id = auth.uid());
