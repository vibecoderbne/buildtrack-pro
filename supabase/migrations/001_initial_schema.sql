-- ============================================================
-- ProgressBuild — Initial Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Enums
create type user_role as enum ('consultant', 'builder', 'subcontractor', 'homeowner');
create type project_status as enum ('draft', 'active', 'on_hold', 'complete');
create type dependency_type as enum ('finish_to_start', 'start_to_start', 'finish_to_finish');
create type delay_cause as enum (
  'weather', 'client_variation', 'site_conditions',
  'subcontractor', 'material_supply', 'authority_approval', 'other'
);
create type claim_status as enum ('draft', 'submitted', 'approved', 'paid');
create type contract_type as enum ('fixed_price', 'cost_plus', 'hia_standard');

-- ============================================================
-- 1. organisations
-- ============================================================
create table organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  abn         text,
  address     text,
  logo_url    text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 2. users (mirrors auth.users — one row per authenticated user)
-- ============================================================
create table users (
  id               uuid primary key references auth.users(id) on delete cascade,
  organisation_id  uuid references organisations(id) on delete set null,
  email            text not null,
  full_name        text not null,
  phone            text,
  role             user_role not null default 'builder',
  trade            text,           -- nullable; only for subcontractors
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ============================================================
-- 3. projects
-- ============================================================
create table projects (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references organisations(id) on delete cascade,
  name                text not null,
  address             text not null,
  status              project_status not null default 'draft',
  start_date          date not null,
  target_completion   date,
  current_completion  date,        -- recalculated when delays are added
  homeowner_id        uuid references users(id) on delete set null,
  builder_id          uuid not null references users(id),
  created_by          uuid not null references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ============================================================
-- 4. phases
-- ============================================================
create table phases (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  color       text not null default '#6366f1',
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 5. tasks
-- NOTE: planned_start / planned_end are the contractual baseline —
--       NEVER overwrite them. current_start / current_end move with delays.
-- ============================================================
create table tasks (
  id              uuid primary key default gen_random_uuid(),
  phase_id        uuid not null references phases(id) on delete cascade,
  project_id      uuid not null references projects(id) on delete cascade,
  name            text not null,
  sort_order      integer not null default 0,
  planned_start   date,
  planned_end     date,
  actual_start    date,
  actual_end      date,
  current_start   date,
  current_end     date,
  duration_days   integer not null default 1,
  progress_pct    integer not null default 0 check (progress_pct between 0 and 100),
  depends_on      uuid[] not null default '{}',    -- quick-read array of prerequisite task IDs
  trade           text,
  contract_value  decimal(12,2) not null default 0,
  is_milestone    boolean not null default false,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- 6. task_dependencies (full dependency detail for Gantt rendering)
-- ============================================================
create table task_dependencies (
  id                  uuid primary key default gen_random_uuid(),
  task_id             uuid not null references tasks(id) on delete cascade,
  depends_on_task_id  uuid not null references tasks(id) on delete cascade,
  dependency_type     dependency_type not null default 'finish_to_start',
  lag_days            integer not null default 0
);

-- ============================================================
-- 7. task_progress_logs (audit trail — every % change recorded)
-- ============================================================
create table task_progress_logs (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references tasks(id) on delete cascade,
  progress_pct  integer not null check (progress_pct between 0 and 100),
  previous_pct  integer not null check (previous_pct between 0 and 100),
  updated_by    uuid not null references users(id),
  note          text,
  logged_at     timestamptz not null default now()
);

-- ============================================================
-- 8. task_photos
-- ============================================================
create table task_photos (
  id                       uuid primary key default gen_random_uuid(),
  task_id                  uuid not null references tasks(id) on delete cascade,
  uploaded_by              uuid not null references users(id),
  storage_path             text not null,
  thumbnail_path           text,
  caption                  text,
  is_visible_to_homeowner  boolean not null default false,
  uploaded_at              timestamptz not null default now()
);

-- ============================================================
-- 9. contracts (one per project)
-- ============================================================
create table contracts (
  id                       uuid primary key default gen_random_uuid(),
  project_id               uuid not null unique references projects(id) on delete cascade,
  contract_sum             decimal(12,2) not null,
  current_contract_sum     decimal(12,2) not null,
  retention_pct            decimal(5,2) not null default 5.00,
  retention_cap            decimal(12,2),
  defects_liability_months integer not null default 6,
  payment_terms_days       integer not null default 10,   -- business days under SOP Act
  contract_type            contract_type not null default 'fixed_price',
  created_at               timestamptz not null default now()
);

-- ============================================================
-- 10. delays
-- ============================================================
create table delays (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references projects(id) on delete cascade,
  cause                delay_cause not null,
  description          text not null,
  delay_days           integer not null,
  date_from            date not null,
  date_to              date,             -- nullable if ongoing
  is_excusable         boolean not null default true,  -- true = builder gets EOT
  supporting_evidence  text,
  recorded_by          uuid not null references users(id),
  created_at           timestamptz not null default now()
);

-- ============================================================
-- 11. delay_affected_tasks
-- ============================================================
create table delay_affected_tasks (
  id          uuid primary key default gen_random_uuid(),
  delay_id    uuid not null references delays(id) on delete cascade,
  task_id     uuid not null references tasks(id) on delete cascade,
  days_impact integer not null
);

-- ============================================================
-- 12. payment_claims (point-in-time snapshots — never retroactively changed)
-- ============================================================
create table payment_claims (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references projects(id) on delete cascade,
  claim_number         integer not null,
  claim_period_start   date not null,
  claim_period_end     date not null,
  status               claim_status not null default 'draft',
  gross_claim_amount   decimal(12,2) not null default 0,
  less_previous_claims decimal(12,2) not null default 0,
  this_claim_amount    decimal(12,2) not null default 0,
  less_retention       decimal(12,2) not null default 0,
  net_claim_amount     decimal(12,2) not null default 0,
  generated_by         uuid not null references users(id),
  submitted_at         timestamptz,
  created_at           timestamptz not null default now(),
  unique (project_id, claim_number)
);

-- ============================================================
-- 13. claim_line_items
-- ============================================================
create table claim_line_items (
  id                    uuid primary key default gen_random_uuid(),
  claim_id              uuid not null references payment_claims(id) on delete cascade,
  task_id               uuid not null references tasks(id),
  contract_value        decimal(12,2) not null,   -- snapshot at time of claim
  progress_pct_current  integer not null,
  progress_pct_previous integer not null,
  value_to_date         decimal(12,2) not null,   -- contract_value × current_pct
  value_previous        decimal(12,2) not null,   -- contract_value × previous_pct
  this_claim_value      decimal(12,2) not null    -- value_to_date - value_previous
);

-- ============================================================
-- 14. homeowner_updates
-- ============================================================
create table homeowner_updates (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  title               text not null,
  body                text not null,
  is_published        boolean not null default false,
  photos              uuid[] not null default '{}',              -- task_photo IDs
  milestones_reached  uuid[] not null default '{}',             -- task IDs
  created_by          uuid not null references users(id),
  published_at        timestamptz,
  created_at          timestamptz not null default now()
);

-- ============================================================
-- 15. templates
-- ============================================================
create table templates (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references organisations(id) on delete cascade,
  name             text not null,
  description      text,
  phases_data      jsonb not null default '[]',  -- full phase/task structure
  is_default       boolean not null default false,
  created_at       timestamptz not null default now()
);

-- ============================================================
-- updated_at trigger (applied to projects and tasks)
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_updated_at
  before update on projects
  for each row execute function set_updated_at();

create trigger tasks_updated_at
  before update on tasks
  for each row execute function set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table organisations      enable row level security;
alter table users              enable row level security;
alter table projects           enable row level security;
alter table phases             enable row level security;
alter table tasks              enable row level security;
alter table task_dependencies  enable row level security;
alter table task_progress_logs enable row level security;
alter table task_photos        enable row level security;
alter table contracts          enable row level security;
alter table delays             enable row level security;
alter table delay_affected_tasks enable row level security;
alter table payment_claims     enable row level security;
alter table claim_line_items   enable row level security;
alter table homeowner_updates  enable row level security;
alter table templates          enable row level security;

-- Helper: get the current user's organisation_id
create or replace function my_organisation_id()
returns uuid language sql stable security definer as $$
  select organisation_id from users where id = auth.uid()
$$;

-- Helper: get the current user's role
create or replace function my_role()
returns user_role language sql stable security definer as $$
  select role from users where id = auth.uid()
$$;

-- organisations: members of the org can read; only consultants/builders can update
create policy "org members can read their org"
  on organisations for select
  using (id = my_organisation_id());

create policy "org members can update their org"
  on organisations for update
  using (id = my_organisation_id() and my_role() in ('consultant', 'builder'));

-- users: users can read others in their org; can update their own row
create policy "users can read org members"
  on users for select
  using (organisation_id = my_organisation_id() or id = auth.uid());

create policy "users can update own profile"
  on users for update
  using (id = auth.uid());

create policy "users can insert their own profile"
  on users for insert
  with check (id = auth.uid());

-- projects: org members can read; builders/consultants can insert/update
create policy "org members can read projects"
  on projects for select
  using (organisation_id = my_organisation_id());

create policy "builders can create projects"
  on projects for insert
  with check (organisation_id = my_organisation_id() and my_role() in ('consultant', 'builder'));

create policy "builders can update their projects"
  on projects for update
  using (organisation_id = my_organisation_id() and my_role() in ('consultant', 'builder'));

-- phases: follow project access
create policy "org members can read phases"
  on phases for select
  using (project_id in (select id from projects where organisation_id = my_organisation_id()));

create policy "builders can manage phases"
  on phases for all
  using (project_id in (select id from projects where organisation_id = my_organisation_id())
         and my_role() in ('consultant', 'builder'));

-- tasks: org members can read; subcontractors can update their own trade tasks
create policy "org members can read tasks"
  on tasks for select
  using (project_id in (select id from projects where organisation_id = my_organisation_id()));

create policy "builders can manage tasks"
  on tasks for all
  using (project_id in (select id from projects where organisation_id = my_organisation_id())
         and my_role() in ('consultant', 'builder'));

create policy "subcontractors can update assigned tasks"
  on tasks for update
  using (
    my_role() = 'subcontractor'
    and trade = (select trade from users where id = auth.uid())
    and project_id in (select id from projects where organisation_id = my_organisation_id())
  );

-- task_dependencies, task_progress_logs, task_photos: follow task access
create policy "org members can read task_dependencies"
  on task_dependencies for select
  using (task_id in (select id from tasks where project_id in
         (select id from projects where organisation_id = my_organisation_id())));

create policy "builders can manage task_dependencies"
  on task_dependencies for all
  using (task_id in (select id from tasks where project_id in
         (select id from projects where organisation_id = my_organisation_id()))
         and my_role() in ('consultant', 'builder'));

create policy "org members can read progress logs"
  on task_progress_logs for select
  using (task_id in (select id from tasks where project_id in
         (select id from projects where organisation_id = my_organisation_id())));

create policy "builders and subs can insert progress logs"
  on task_progress_logs for insert
  with check (task_id in (select id from tasks where project_id in
              (select id from projects where organisation_id = my_organisation_id()))
              and my_role() in ('consultant', 'builder', 'subcontractor'));

create policy "org members can read task photos"
  on task_photos for select
  using (task_id in (select id from tasks where project_id in
         (select id from projects where organisation_id = my_organisation_id())));

create policy "builders and subs can upload task photos"
  on task_photos for insert
  with check (task_id in (select id from tasks where project_id in
              (select id from projects where organisation_id = my_organisation_id()))
              and my_role() in ('consultant', 'builder', 'subcontractor'));

-- contracts, delays, payment_claims: builders/consultants only
create policy "builders can manage contracts"
  on contracts for all
  using (project_id in (select id from projects where organisation_id = my_organisation_id())
         and my_role() in ('consultant', 'builder'));

create policy "builders can manage delays"
  on delays for all
  using (project_id in (select id from projects where organisation_id = my_organisation_id())
         and my_role() in ('consultant', 'builder'));

create policy "builders can read delay_affected_tasks"
  on delay_affected_tasks for select
  using (delay_id in (select id from delays where project_id in
         (select id from projects where organisation_id = my_organisation_id())));

create policy "builders can manage delay_affected_tasks"
  on delay_affected_tasks for all
  using (delay_id in (select id from delays where project_id in
         (select id from projects where organisation_id = my_organisation_id()))
         and my_role() in ('consultant', 'builder'));

create policy "builders can manage payment_claims"
  on payment_claims for all
  using (project_id in (select id from projects where organisation_id = my_organisation_id())
         and my_role() in ('consultant', 'builder'));

create policy "builders can manage claim_line_items"
  on claim_line_items for all
  using (claim_id in (select id from payment_claims where project_id in
         (select id from projects where organisation_id = my_organisation_id()))
         and my_role() in ('consultant', 'builder'));

-- homeowner_updates: builders write, homeowners read published only
create policy "builders can manage homeowner_updates"
  on homeowner_updates for all
  using (project_id in (select id from projects where organisation_id = my_organisation_id())
         and my_role() in ('consultant', 'builder'));

create policy "homeowners can read published updates"
  on homeowner_updates for select
  using (
    is_published = true
    and project_id in (select id from projects where homeowner_id = auth.uid())
  );

-- templates: org members can read; builders/consultants can manage
create policy "org members can read templates"
  on templates for select
  using (organisation_id = my_organisation_id());

create policy "builders can manage templates"
  on templates for all
  using (organisation_id = my_organisation_id() and my_role() in ('consultant', 'builder'));
