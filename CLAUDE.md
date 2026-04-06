@AGENTS.md

---

# ProgressBuild — Project Memory

Read this file at the start of every conversation. Update it when anything is completed or decided.

---

## 1. PROJECT OVERVIEW

ProgressBuild is a web-based construction programme management app for Australian residential builders. It replaces fragmented Excel spreadsheets, WhatsApp updates, and manual payment claim calculations with a single platform.

**Core promise:** A builder opens the app, sees exactly where every project stands, updates progress in under 2 minutes, and the system automatically generates payment claims, client updates, and delay documentation.

**Target users (V1):** Consultant, Builder/PM, Subcontractor, Homeowner

**Spec document:** `PRODUCT_SPEC.md` — read this for full feature detail, data model, and user role permissions.

---

## 2. TECH STACK

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (React) + TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| File storage | Supabase Storage |
| Hosting | Vercel |
| Gantt chart | DHTMLX Gantt |
| PDF generation | React-PDF or Puppeteer |
| Notifications | Resend or SendGrid (email) |
| Repo | GitHub |

---

## 3. SUPABASE CREDENTIALS

> **DO NOT commit real credentials to git.** Store in `.env.local` only.

```
NEXT_PUBLIC_SUPABASE_URL=https://hywowvxppnqnlmtpnabz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[stored in .env.local only — do not commit]
```

---

## 4. BUILD STAGES

| Stage | Description | Status |
|-------|-------------|--------|
| Stage 1 | Foundation — Supabase setup, Next.js scaffold, auth, project CRUD, templates | Complete |
| Stage 2 | Gantt Chart — DHTMLX integration, dependencies, baseline vs current, critical path | Complete |
| Stage 3 | Progress & Payments — progress logging, contract values, claim generation, PDF export | Current |
| Stage 4 | Delays & Homeowner — delay register, Gantt cascade, homeowner dashboard, photo upload | Not started |
| Stage 5 | Subcontractor Portal — invite flow, filtered task view, progress updates from sub side | Not started |
| Stage 6 | Polish & Launch — consultant dashboard, PDF branding, mobile, onboarding, production deploy | Not started |

**Stage 6 additional task:** Review and tighten all RLS policies before launch. The current `organisations` SELECT policy is loosened for development purposes. Audit every policy against the permission matrix in `PRODUCT_SPEC.md` Section 2.2 before going live.

---

## 5. CURRENT STAGE

**Stage 3 — Progress & Payments** (Stages 1 & 2 complete)

### Stage 1 — Complete
- [x] Supabase clients (`@supabase/supabase-js`, `@supabase/ssr`, browser + server clients)
- [x] `lib/types.ts` — full TypeScript types for all 15 DB tables
- [x] `proxy.ts` — edge auth guard
- [x] Database schema — all 15 tables with RLS (migrations 001–003 run in Supabase)
- [x] Login / signup pages
- [x] Organisation setup flow (`/setup` → creates org, sets role to consultant)
- [x] Dashboard layout with role-aware sidebar
- [x] Project list dashboard
- [x] New project form (`/projects/new`)
- [x] Project detail page with placeholder sections (`/projects/[id]`)
- [x] Template system (16-phase, 98-task default) — `lib/template-data.ts` + `app/actions/templates.ts`

### Stage 2 — Complete
- [x] Install DHTMLX Gantt (free trial, dynamic import for SSR safety)
- [x] Default template — 16 phases, ~98 tasks seeded on new project creation
- [x] Gantt chart page (`/projects/[id]/programme`) displaying phases and tasks
- [x] Two-bar display: grey baseline bar + coloured current bar via `addTaskLayer`
- [x] Drag-to-reschedule (`onAfterTaskDrag` → `updateTaskDates` server action)
- [x] Task dependencies (finish-to-start links rendered as arrows)
- [x] Progress percentage on each task bar (`onProgressDragEnd` → `updateTaskProgress`)
- [x] Milestone diamonds for milestone tasks (`is_milestone` → `gantt.config.types.milestone`)
- [x] Today marker (vertical red line via `today_marker` plugin)
- [x] Zoom controls (day / week / month toolbar buttons)
- [x] Critical path highlighting (`critical_path` plugin)
- [x] Phase parent rows (project type) with child task rows coloured by phase

### Stage 3 — Progress & Payments (Current)
- [ ] Progress logging UI — update task progress_pct from Gantt or progress page
- [ ] Contract values — set contract amount per project
- [ ] Payment claim generation — calculate claim based on completed task %
- [ ] PDF export of payment claim
- [ ] Progress report page (`/projects/[id]/progress`)

---

## 6. KEY DECISIONS

_Updated as decisions are made._

- **Planned dates never change.** Only `current_start` / `current_end` move when delays are added. Planned dates are the contractual baseline.
- **Payment claims are point-in-time snapshots.** Once submitted, claim amounts don't change retroactively.
- **Organisation-level ownership.** Projects belong to organisations, not individual users. Multiple users can share access to the same projects.
- **Homeowner view is deliberately limited.** No costs, no subcontractor detail, no internal notes. Builder curates all homeowner-facing content.
- **Auth uses `@supabase/ssr`** (not just `@supabase/supabase-js`) for proper cookie-based session handling in the Next.js App Router. Always use `lib/supabase/server.ts` in Server Components and Actions; `lib/supabase/client.ts` in Client Components.
- **Route groups:** `(auth)` for login/signup (no sidebar), `(dashboard)` for all authenticated pages (with sidebar). Middleware enforces auth at the edge.
- **params/searchParams are Promises in Next.js 16** — always `await props.params` and `await props.searchParams` in page components. `PageProps<'/route'>` and `LayoutProps<'/route'>` are global helpers (no import needed).
- **`refresh()` from `next/cache`** — use instead of `router.refresh()` to refresh server-rendered data after mutations.
- **`middleware.ts` is deprecated in Next.js 16** — use `proxy.ts` at the project root instead. The export must be named `proxy` (not `middleware`). See `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
- **Supabase GRANTs must be re-applied after any schema drop/recreate.** RLS policies alone are not enough — Supabase requires `GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon` and `GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon` for the API to work. Dropping the public schema wipes these grants. Always re-run them after any destructive schema operation.

---

## 7. FILE STRUCTURE

_Updated as files are created._

```
buildtrack-pro/
├── CLAUDE.md
├── AGENTS.md                              ← Next.js version guidance — read before ANY Next.js code
├── PRODUCT_SPEC.md
├── proxy.ts                               ← Edge auth guard (replaces middleware.ts in Next.js 16)
├── lib/
│   ├── template-data.ts                   ← DEFAULT_TEMPLATE: 16 phases, ~98 tasks with durations
│   ├── supabase/
│   │   ├── client.ts                      ← Browser Supabase client (Client Components)
│   │   └── server.ts                      ← Server Supabase client (Server Components/Actions)
│   └── types.ts                           ← All DB TypeScript types + convenience row types
├── app/
│   ├── layout.tsx                         ← Root layout (html/body, fonts, global CSS)
│   ├── page.tsx                           ← Redirects / → /dashboard
│   ├── globals.css                        ← Tailwind v4 import
│   ├── actions/
│   │   ├── auth.ts                        ← login(), signup(), logout() server actions
│   │   ├── organisations.ts               ← createOrganisation() server action
│   │   ├── projects.ts                    ← createProject() server action (seeds template on create)
│   │   ├── templates.ts                   ← applyDefaultTemplate() + addWorkingDays() helper
│   │   └── gantt.ts                       ← updateTaskDates(), updateTaskProgress() server actions
│   ├── (auth)/                            ← Route group: no sidebar, centred layout
│   │   ├── layout.tsx
│   │   ├── AuthForm.tsx                   ← Shared login/signup form (Client Component)
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── setup/
│   │       ├── page.tsx               ← Org setup (redirects away if already has org)
│   │       └── SetupForm.tsx
│   └── (dashboard)/                       ← Route group: authenticated, with sidebar
│       ├── layout.tsx                     ← Fetches user profile, renders Sidebar
│       ├── Sidebar.tsx                    ← Role-aware nav (Client Component)
│       ├── dashboard/page.tsx             ← Project list
│       └── projects/
│           ├── page.tsx                   ← Redirects /projects → /dashboard
│           ├── new/
│           │   ├── page.tsx               ← New project page
│           │   └── NewProjectForm.tsx     ← New project form (Client Component)
│           └── [id]/
│               ├── layout.tsx            ← Nested layout: fetches project, renders ProjectNav
│               ├── page.tsx              ← Redirects → /programme
│               ├── ProjectNav.tsx        ← Horizontal tab nav (Client Component)
│               ├── programme/
│               │   ├── page.tsx          ← Fetches phases/tasks/deps, renders GanttChart
│               │   └── GanttChart.tsx    ← DHTMLX Gantt (Client Component, dynamic import)
│               ├── progress/page.tsx     ← Placeholder
│               ├── delays/page.tsx       ← Placeholder
│               ├── payments/page.tsx     ← Placeholder
│               ├── homeowner/page.tsx    ← Placeholder
│               └── subcontractors/page.tsx ← Placeholder
└── supabase/
    └── migrations/
        ├── 001_initial_schema.sql         ← All 15 tables + RLS + triggers (run ✓)
        ├── 002_org_creation_policy.sql    ← INSERT policy for new org (superseded by 003)
        └── 003_fix_rls_policies.sql       ← Definitive users + organisations policies (run ✓)
```

---

## WORKING CONVENTIONS

- Always read `PRODUCT_SPEC.md` for feature detail before implementing anything new.
- Before writing any Next.js code, read the relevant guide in `node_modules/next/dist/docs/` (per AGENTS.md — this version may have breaking changes).
- Update the Stage 5 task checklist and File Structure section as work is completed.
- Never overwrite planned dates on tasks — only current dates change.
- Keep `.env.local` out of git (confirm `.gitignore` covers it).
