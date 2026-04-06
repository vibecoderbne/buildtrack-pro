# ProgressBuild — Product Specification v1.0

## Construction Programme Management for Residential Builders (Australia)

---

## 1. Product Vision

ProgressBuild is a web-based construction programme management app built for Australian residential builders and the consultants who support them. It replaces fragmented Excel spreadsheets, WhatsApp updates, and manual payment claim calculations with a single, interconnected platform.

**Core promise:** A builder opens the app, sees exactly where every project stands, updates progress in under 2 minutes, and the system automatically generates payment claims, client updates, and delay documentation.

**Target users (V1):**

- **Consultant (you):** Oversees multiple builders' projects, generates payment claims, monitors progress across all clients
- **Builder / Project Manager:** Manages day-to-day programme, updates task progress, manages subcontractors
- **Subcontractor:** Views assigned tasks, updates completion percentage, leaves notes
- **Homeowner (client):** Read-only view of project timeline, progress photos, and milestone updates

---

## 2. User Roles & Permissions

### 2.1 Role Hierarchy

```
CONSULTANT (Developer Layer)
  └── sees ALL projects across ALL builders
  └── can edit anything, generate reports, manage billing

BUILDER / PROJECT MANAGER
  └── sees only THEIR projects
  └── full edit access to their projects
  └── invites subcontractors and homeowners

SUBCONTRACTOR
  └── sees only tasks assigned to their trade
  └── can update progress % and leave notes
  └── cannot see costs, contract values, or other trades

HOMEOWNER
  └── read-only timeline and progress view
  └── sees milestones, photos, and general updates
  └── cannot see costs, margins, subcontractor details, or internal notes
```

### 2.2 Permission Matrix

| Action | Consultant | Builder | Subcontractor | Homeowner |
|--------|-----------|---------|---------------|-----------|
| Create/delete projects | Yes | Yes (own) | No | No |
| Edit Gantt chart | Yes | Yes | No | No |
| Update task progress | Yes | Yes | Own tasks only | No |
| View contract values | Yes | Yes | No | No |
| View all costs | Yes | Yes | No | No |
| Generate payment claims | Yes | Yes | No | No |
| View progress report | Yes | Yes | Summary only | Timeline only |
| Add delay records | Yes | Yes | No | No |
| Upload photos | Yes | Yes | Own tasks | No |
| Leave notes | Yes | Yes | Own tasks | No |
| View homeowner dashboard | Yes | Yes | No | Yes |
| Invite users | Yes | Yes (own projects) | No | No |

---

## 3. Information Architecture

### 3.1 Navigation Structure

```
CONSULTANT VIEW:
┌─────────────────────────────────────┐
│  Dashboard (all projects overview)  │
│  ├── Project A                      │
│  │   ├── Programme (Gantt)          │
│  │   ├── Progress Report            │
│  │   ├── Homeowner Updates          │
│  │   ├── Delay Register             │
│  │   ├── Contract & Payments        │
│  │   └── Subcontractor Portal       │
│  ├── Project B                      │
│  │   └── (same structure)           │
│  └── Settings & Templates           │
└─────────────────────────────────────┘

BUILDER VIEW:
┌─────────────────────────────────────┐
│  My Projects                        │
│  ├── Project A                      │
│  │   ├── Programme (Gantt)          │
│  │   ├── Progress Report            │
│  │   ├── Homeowner Updates          │
│  │   ├── Delay Register             │
│  │   ├── Contract & Payments        │
│  │   └── Subcontractors             │
│  └── Project B                      │
└─────────────────────────────────────┘

SUBCONTRACTOR VIEW:
┌─────────────────────────────────────┐
│  My Tasks                           │
│  ├── Project A — Plumbing Rough-in  │
│  ├── Project A — Plumbing Fit-off   │
│  └── Project B — Plumbing Rough-in  │
└─────────────────────────────────────┘

HOMEOWNER VIEW:
┌─────────────────────────────────────┐
│  My Home — 42 Smith St, Richmond    │
│  ├── Timeline (visual progress)     │
│  ├── Recent Updates                 │
│  ├── Photos                         │
│  └── Next Milestones                │
└─────────────────────────────────────┘
```

---

## 4. Data Model

### 4.1 Entity Relationship Overview

This is the blueprint for your database. Every table below becomes a Supabase table. The relationships between them are what make the app powerful — they're what Excel couldn't do.

```
ORGANISATIONS (a building company or consultancy)
  │
  ├── has many USERS (with roles)
  │
  ├── has many PROJECTS
  │     │
  │     ├── has one CONTRACT (values, retention, payment terms)
  │     │
  │     ├── has many PHASES (ordered)
  │     │     │
  │     │     └── has many TASKS (ordered within phase)
  │     │           │
  │     │           ├── has many TASK_ASSIGNMENTS (links to subcontractors)
  │     │           ├── has many TASK_PROGRESS_LOGS (history of % updates)
  │     │           ├── has many TASK_PHOTOS
  │     │           └── has many TASK_NOTES
  │     │
  │     ├── has many DELAYS
  │     │     └── links to affected TASKS
  │     │
  │     ├── has many PAYMENT_CLAIMS (monthly snapshots)
  │     │     └── has many CLAIM_LINE_ITEMS (per task)
  │     │
  │     └── has many HOMEOWNER_UPDATES (curated messages)
  │
  └── has many TEMPLATES (reusable phase/task structures)
```

### 4.2 Detailed Table Schemas

#### organisations
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| name | text | "Smith Building Co" |
| abn | text | Australian Business Number |
| address | text | Business address |
| logo_url | text | For branded reports |
| created_at | timestamp | |

#### users
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key (Supabase Auth) |
| organisation_id | uuid | FK → organisations |
| email | text | Login identifier |
| full_name | text | |
| phone | text | For notifications |
| role | enum | consultant, builder, subcontractor, homeowner |
| trade | text | Nullable — only for subcontractors (e.g. "Plumber") |
| is_active | boolean | Soft delete |
| created_at | timestamp | |

#### projects
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| organisation_id | uuid | FK → organisations |
| name | text | "42 Smith St, Richmond" |
| address | text | Site address |
| status | enum | draft, active, on_hold, complete |
| start_date | date | Programme start |
| target_completion | date | Contractual completion |
| current_completion | date | Recalculated when delays added |
| homeowner_id | uuid | FK → users (nullable) |
| builder_id | uuid | FK → users |
| created_by | uuid | FK → users |
| created_at | timestamp | |
| updated_at | timestamp | |

#### phases
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| project_id | uuid | FK → projects |
| name | text | "Site Establishment", "Demolition", etc. |
| sort_order | integer | Display order (0, 1, 2...) |
| color | text | Hex color for Gantt chart grouping |
| created_at | timestamp | |

#### tasks
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| phase_id | uuid | FK → phases |
| project_id | uuid | FK → projects (denormalised for query speed) |
| name | text | "Strip topsoil", "Pour slab", etc. |
| sort_order | integer | Order within phase |
| planned_start | date | Original programme date |
| planned_end | date | Original programme date |
| actual_start | date | Nullable — filled when work begins |
| actual_end | date | Nullable — filled when complete |
| current_start | date | Adjusted for delays (= planned_start + delay offsets) |
| current_end | date | Adjusted for delays |
| duration_days | integer | Working days |
| progress_pct | integer | 0–100, updated by builder or sub |
| depends_on | uuid[] | Array of task IDs this task depends on |
| trade | text | Which trade performs this ("Carpenter", "Plumber") |
| contract_value | decimal | What this task is worth in the contract |
| is_milestone | boolean | Inspection points, payment triggers |
| notes | text | Internal notes |
| created_at | timestamp | |
| updated_at | timestamp | |

**Why both planned and current dates?** This is critical. The planned dates are your baseline — the original programme. The current dates reflect reality after delays. The gap between them is what you show in progress reports and what drives payment claim calculations. Never overwrite planned dates.

#### task_dependencies
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| task_id | uuid | FK → tasks (the dependent task) |
| depends_on_task_id | uuid | FK → tasks (the prerequisite) |
| dependency_type | enum | finish_to_start, start_to_start, finish_to_finish |
| lag_days | integer | Buffer days between tasks (can be 0) |

**Note:** While tasks.depends_on stores a simple array for quick reads, this table stores the full dependency detail needed for Gantt chart rendering and critical path calculation.

#### task_progress_logs
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| task_id | uuid | FK → tasks |
| progress_pct | integer | The new percentage |
| previous_pct | integer | What it was before |
| updated_by | uuid | FK → users |
| note | text | Optional comment |
| logged_at | timestamp | When this update happened |

**Why log every change?** This is your audit trail. When a builder says "we were at 60% last month and 85% this month", the progress report and payment claim need to calculate the *movement*. Without history, you can't generate claims.

#### task_photos
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| task_id | uuid | FK → tasks |
| uploaded_by | uuid | FK → users |
| storage_path | text | Supabase Storage path |
| thumbnail_path | text | Compressed version for lists |
| caption | text | Optional description |
| is_visible_to_homeowner | boolean | Controls what homeowner sees |
| uploaded_at | timestamp | |

#### contracts
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| project_id | uuid | FK → projects (one per project) |
| contract_sum | decimal | Original contract value |
| current_contract_sum | decimal | Adjusted for approved variations |
| retention_pct | decimal | Typically 5% in Australia |
| retention_cap | decimal | Max retention amount if applicable |
| defects_liability_months | integer | Usually 6–12 months |
| payment_terms_days | integer | Days after claim for payment (typically 10–15 business days under the SOP Act) |
| contract_type | enum | fixed_price, cost_plus, hia_standard |
| created_at | timestamp | |

#### delays
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| project_id | uuid | FK → projects |
| cause | enum | weather, client_variation, site_conditions, subcontractor, material_supply, authority_approval, other |
| description | text | Detailed description |
| delay_days | integer | Working days lost |
| date_from | date | When delay started |
| date_to | date | When delay ended (nullable if ongoing) |
| is_excusable | boolean | True = builder gets time extension; False = builder's risk |
| supporting_evidence | text | Notes, references to photos, BOM data |
| recorded_by | uuid | FK → users |
| created_at | timestamp | |

#### delay_affected_tasks
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| delay_id | uuid | FK → delays |
| task_id | uuid | FK → tasks |
| days_impact | integer | How many days this specific task was pushed |

**How delays update the Gantt:** When a delay is recorded, the app looks at which tasks are affected and cascades the impact through dependencies. If "Pour slab" is delayed 5 days and "Framing" depends on it (finish_to_start), framing's current_start also shifts by 5 days. The project's current_completion date recalculates automatically.

#### payment_claims
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| project_id | uuid | FK → projects |
| claim_number | integer | Sequential (1, 2, 3...) |
| claim_period_start | date | First day of claim period |
| claim_period_end | date | Last day of claim period |
| status | enum | draft, submitted, approved, paid |
| gross_claim_amount | decimal | Total value of work done to date |
| less_previous_claims | decimal | Sum of all prior claims |
| this_claim_amount | decimal | gross - previous |
| less_retention | decimal | Retention withheld |
| net_claim_amount | decimal | What's actually payable |
| generated_by | uuid | FK → users |
| submitted_at | timestamp | |
| created_at | timestamp | |

#### claim_line_items
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| claim_id | uuid | FK → payment_claims |
| task_id | uuid | FK → tasks |
| contract_value | decimal | Snapshot of task value at time of claim |
| progress_pct_current | integer | Progress at end of this claim period |
| progress_pct_previous | integer | Progress at end of last claim period |
| value_to_date | decimal | contract_value × current_pct |
| value_previous | decimal | contract_value × previous_pct |
| this_claim_value | decimal | value_to_date - value_previous |

**This is the heart of payment claim generation.** Each line item calculates automatically from task progress. The builder just updates progress percentages — the system does all the maths.

#### homeowner_updates
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| project_id | uuid | FK → projects |
| title | text | "Week 6 Update — Framing Complete" |
| body | text | Rich text / markdown content |
| is_published | boolean | Draft vs visible to homeowner |
| photos | uuid[] | Array of task_photo IDs to include |
| milestones_reached | uuid[] | Array of task IDs (milestones hit) |
| created_by | uuid | FK → users |
| published_at | timestamp | |
| created_at | timestamp | |

#### templates
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| organisation_id | uuid | FK → organisations |
| name | text | "Standard Residential Build" |
| description | text | |
| phases_data | jsonb | Full phase/task structure as JSON |
| is_default | boolean | Used when creating new projects |
| created_at | timestamp | |

**Your 16-phase, 95-task Excel structure becomes the default template.** When a builder creates a new project, they pick a template, and the system generates all phases and tasks automatically. They then adjust dates and remove tasks that don't apply to their specific build.

---

## 5. Feature Specifications

### 5.1 Programme (Gantt Chart) — DHTMLX Gantt

**What the builder sees:**
- Left panel: task list grouped by phase, with progress % shown
- Right panel: horizontal timeline with bars for each task
- Task bars colour-coded by phase
- Dependency arrows between tasks (finish-to-start, etc.)
- Two-bar comparison: grey bar = planned (baseline), coloured bar = current
- Milestone diamonds for inspections, payment triggers
- Drag to reschedule: moving one task automatically cascades dependents
- Zoom controls: day, week, month views
- Today marker: vertical red line showing current date

**Critical path highlighting:** Tasks where any delay would push out the completion date should be visually distinct (bold outline or different colour). This is a feature DHTMLX supports and most residential tools don't show — it's very valuable for builders.

**Editing behaviour:**
- Builder drags a task bar → updates current_start and current_end
- Builder adjusts progress slider → updates progress_pct, creates a task_progress_log entry
- System recalculates downstream tasks based on dependencies
- Planned dates never change (only current dates move)

### 5.2 Progress Report

**Purpose:** Shows the movement in progress since the last reporting period (typically monthly), which directly drives the payment claim amount.

**Layout:**
```
PROGRESS REPORT — Claim Period #3 (1 Mar – 31 Mar 2026)
Project: 42 Smith St, Richmond

OVERALL PROGRESS: 47% ──────────●───────── Target: 52%

PHASE SUMMARY:
┌──────────────────────┬──────────┬──────────┬──────────┐
│ Phase                │ Last Mth │ This Mth │ Movement │
├──────────────────────┼──────────┼──────────┼──────────┤
│ Site Establishment   │ 100%     │ 100%     │ —        │
│ Demolition           │ 100%     │ 100%     │ —        │
│ Earthworks           │ 80%      │ 100%     │ +20%     │
│ Slab                 │ 50%      │ 90%      │ +40%     │
│ Framing              │ 0%       │ 30%      │ +30%     │
│ ...                  │          │          │          │
└──────────────────────┴──────────┴──────────┴──────────┘

TASK DETAIL (tasks with movement this period):
┌──────────────────────┬──────┬──────┬──────┬───────────┐
│ Task                 │ Prev │ Curr │ Move │ Claim $   │
├──────────────────────┼──────┼──────┼──────┼───────────┤
│ Pour slab section 2  │ 50%  │ 90%  │ +40% │ $12,800   │
│ Wall framing         │ 0%   │ 30%  │ +30% │ $9,600    │
│ ...                  │      │      │      │           │
└──────────────────────┴──────┴──────┴──────┴───────────┘

DELAYS THIS PERIOD:
- 3 working days lost (weather — heavy rain 12-14 Mar)
- Completion date adjusted from 15 Nov to 20 Nov

CLAIM SUMMARY:
  Value of work to date:       $187,400
  Less previous claims:        -$142,000
  This claim (gross):          $45,400
  Less retention (5%):         -$2,270
  Net payable:                 $43,130
```

**Key feature:** This entire report auto-generates from the data. The builder's only job is keeping progress percentages up to date. The system pulls movement from task_progress_logs, delays from the delay register, and calculates claim amounts from contract values.

### 5.3 Homeowner Updates & Timeline

**What the homeowner sees (their dashboard):**

```
MY HOME — 42 Smith St, Richmond
Builder: Smith Building Co  |  Started: 6 Jan 2026

TIMELINE ─────────────────────────────────────────
Jan        Feb        Mar        Apr        May
●──────────●──────────●──────────○──────────○
Site Prep   Slab      Framing    Lock-up    Fit-out
 ✓ Done     ✓ Done    ◐ In Progress

CURRENT STATUS: Framing — 30% complete
Expected completion: 20 November 2026

LATEST UPDATE (posted 28 Mar):
"Week 12 — Framing Progress"
Wall frames are going up well. The carpenter has
completed the ground floor and is starting on the
first floor next week. We lost 3 days to rain
mid-month but this is accounted for in the timeline.

[Photo grid: 3 site photos]

UPCOMING MILESTONES:
• Frame inspection — est. 14 April
• Lock-up stage — est. 8 May
• Next payment milestone — est. 8 May
```

**Design principles for the homeowner view:**
- Radically simple — no construction jargon
- Visual timeline, not a Gantt chart (homeowners don't need task-level detail)
- Milestone-driven: show the big stages, not individual tasks
- Photo-forward: latest site photos prominently displayed
- Honest about delays: if the timeline has shifted, show the new date without burying it
- No costs visible (ever)

**How updates get created:**
The builder or consultant creates a homeowner_update, selects which photos to include, writes a short narrative, and publishes it. This is deliberately manual — you don't want raw task updates going to homeowners because they'd see things like "Plumber didn't show up" which creates unnecessary anxiety.

### 5.4 Delay Register

**Purpose:** Documents every delay event, links it to affected tasks, provides evidence for Extension of Time (EOT) claims under Australian construction law, and automatically adjusts the Gantt chart.

**Layout:**
```
DELAY REGISTER — 42 Smith St, Richmond

┌────┬────────────┬──────────────────────┬──────┬───────────┬──────────┐
│ #  │ Dates      │ Cause                │ Days │ Excusable │ Tasks    │
├────┼────────────┼──────────────────────┼──────┼───────────┼──────────┤
│ 1  │ 12-14 Mar  │ Weather (heavy rain) │ 3    │ Yes       │ Framing  │
│ 2  │ 22 Mar     │ Material supply      │ 1    │ Yes       │ Framing  │
│ 3  │ 5 Apr      │ Client variation     │ 2    │ Yes       │ Fit-out  │
└────┴────────────┴──────────────────────┴──────┴───────────┴──────────┘

Total excusable delays: 6 days
Total non-excusable delays: 0 days
Original completion: 15 Nov 2026
Adjusted completion: 25 Nov 2026
```

**Automatic Gantt adjustment logic:**
1. Builder adds a delay, selects affected tasks and number of days
2. System shifts current_start and current_end of those tasks
3. System cascades through dependencies (if framing is delayed 3 days, everything after framing shifts too)
4. Project current_completion recalculates
5. If the completion date has changed, a flag appears suggesting the builder update the homeowner

**Weather integration (V2):** Auto-populate weather delays from Bureau of Meteorology data. The app checks daily rainfall/wind at the project postcode and flags days that likely prevented work, pre-filling the delay register for the builder to confirm.

### 5.5 Contract & Payments

**Contract values screen:**
```
CONTRACT SUMMARY — 42 Smith St, Richmond

Original contract sum:          $485,000
Approved variations:            +$12,500
Current contract sum:           $497,500
Retention rate:                 5%

PHASE VALUES:
┌──────────────────────────┬───────────┬──────────┬───────────┐
│ Phase                    │ Contract  │ Progress │ Earned    │
├──────────────────────────┼───────────┼──────────┼───────────┤
│ Site Establishment       │ $8,500    │ 100%     │ $8,500    │
│ Demolition               │ $15,000   │ 100%     │ $15,000   │
│ Earthworks               │ $22,000   │ 100%     │ $22,000   │
│ Slab                     │ $65,000   │ 90%      │ $58,500   │
│ Framing                  │ $48,000   │ 30%      │ $14,400   │
│ ...                      │           │          │           │
├──────────────────────────┼───────────┼──────────┼───────────┤
│ TOTAL                    │ $497,500  │ 47%      │ $187,400  │
└──────────────────────────┴───────────┴──────────┴───────────┘
```

**For V1, builders manually enter the contract value per task.** Estimating (labour rates, material costs, your Excel trade rate lookups) is a future feature. The contract values are what drives payment claim calculations, so they need to be in place.

### 5.6 Payment Claim Generator

**How it works:**
1. Builder ensures all task progress percentages are up to date
2. Builder clicks "Generate Claim" and selects the claim period dates
3. System automatically creates claim_line_items for every task that has had progress movement since the last claim
4. System calculates gross amount, deducts previous claims, applies retention
5. Generates a formatted PDF payment claim (branded with builder's logo)
6. Builder reviews the draft, can adjust if needed, then marks as "submitted"

**Payment claim PDF should comply with Australian Security of Payment (SOP) Act requirements:**
- Reference date
- Construction work or related goods/services performed
- Amount claimed
- Supporting statement (statutory declaration)

**Claim history:**
Every claim is stored with a full snapshot of progress at that point in time. This means you can always reconstruct what was claimed and when — essential for dispute resolution.

### 5.7 Subcontractor Portal

**V1 scope (intentionally minimal):**

What a subcontractor sees when they log in:
```
MY TASKS — John's Plumbing

42 Smith St, Richmond:
┌──────────────────────┬──────────┬───────────────┬──────────┐
│ Task                 │ Status   │ Scheduled     │ Progress │
├──────────────────────┼──────────┼───────────────┼──────────┤
│ Plumbing rough-in    │ Active   │ 14-18 Apr     │ [====60%]│
│ Plumbing fit-off     │ Upcoming │ 12-14 Jun     │ [0%     ]│
└──────────────────────┴──────────┴───────────────┴──────────┘

15 Acacia Ave, Hawthorn:
┌──────────────────────┬──────────┬───────────────┬──────────┐
│ Plumbing rough-in    │ Upcoming │ 22-26 Apr     │ [0%     ]│
└──────────────────────┴──────────┴───────────────┴──────────┘
```

**What subs can do (V1):**
- View their assigned tasks across all projects they're invited to
- Update progress percentage (slider: 0–100%)
- Leave a note on any task (e.g. "Waiting on fixtures delivery")
- See scheduled dates so they know when they're expected on site

**What subs cannot see:**
- Contract values or any cost information
- Other trades' tasks or progress
- Homeowner details
- Internal builder notes

**V2 additions (later):**
- Upload completion photos
- Confirm availability / accept task assignments
- Submit invoices
- In-app messaging with builder

---

## 6. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js (React) | Best for SEO, fast loads, Claude Code handles it well |
| Database | Supabase (PostgreSQL) | Auth, database, storage, real-time — all in one |
| Hosting | Vercel | Auto-deploys from GitHub, free tier to start |
| Code repo | GitHub | Version control, backup, connects to Vercel |
| Gantt chart | DHTMLX Gantt | Purpose-built, handles dependencies and critical path |
| PDF generation | React-PDF or Puppeteer | For payment claim documents |
| Auth | Supabase Auth | Email/password, magic links for subcontractors |
| File storage | Supabase Storage | Site photos, generated PDFs |
| Notifications | Email (Resend or SendGrid) | V1: email only. V2: push notifications |

---

## 7. Build Stages

### Stage 1 — Foundation (Weeks 1–3)
- Supabase project setup (database tables, auth, storage bucket)
- Next.js project scaffold with routing
- User authentication (login, signup, role assignment)
- Project CRUD (create, edit, delete projects)
- Template system (your 16-phase, 95-task structure as default template)
- Basic project list / dashboard

### Stage 2 — Gantt Chart (Weeks 3–5)
- DHTMLX Gantt integration
- Display phases and tasks from database
- Drag-to-edit task dates
- Task dependencies (finish-to-start)
- Progress bar on each task
- Baseline vs current date comparison
- Critical path highlighting

### Stage 3 — Progress & Payments (Weeks 5–7)
- Progress update interface (click task → update %)
- Progress logging (audit trail)
- Contract values entry per task
- Payment claim generation logic
- Payment claim PDF export
- Progress report view
- Claim history

### Stage 4 — Delays & Homeowner (Weeks 7–9)
- Delay register (add, edit, view delays)
- Delay-to-Gantt cascade logic (auto-adjust dates)
- Delay impact on completion date
- Homeowner dashboard (read-only timeline view)
- Homeowner update composer (builder writes updates, selects photos)
- Photo upload (attached to tasks)

### Stage 5 — Subcontractor Portal (Weeks 9–10)
- Subcontractor invitation system (magic link via email)
- Sub-specific task view (filtered by trade)
- Progress update from sub side
- Notes from sub side
- Notification to builder when sub updates progress

### Stage 6 — Polish & Launch (Weeks 10–12)
- Consultant dashboard (multi-project overview)
- PDF branding (builder's logo on claims/reports)
- Mobile responsiveness (builders use phones on site)
- Error handling and edge cases
- Basic onboarding flow for new users
- Deploy to production

---

## 8. Key Design Decisions & Rationale

**Why separate planned and current dates on tasks?**
This is non-negotiable for construction. The baseline programme is a contractual document. If you overwrite dates when things change, you lose the ability to prove what was originally agreed. Every construction dispute involves comparing "what was planned" to "what actually happened."

**Why a dedicated delay register instead of just adjusting the Gantt?**
Under Australian construction law (Security of Payment Acts, HIA contracts, etc.), delays need to be formally documented with cause, duration, and whether they're excusable. A Gantt chart that just shows a task moved doesn't tell you why. The delay register is your legal evidence trail.

**Why snapshot payment claims instead of calculating them live?**
A payment claim is a point-in-time document. Once submitted, the amounts shouldn't change retroactively. If a builder later corrects a progress percentage, it affects the *next* claim, not the already-submitted one. Snapshots preserve this integrity.

**Why is the homeowner view so limited?**
Homeowners with too much information become anxious and micromanage. They don't need to know that the plumber was 2 days late — they need to know "we're on track for lock-up in May." The builder curates what the homeowner sees, which keeps the relationship healthy.

**Why organisation-level rather than individual-level?**
A building company might have a director, a project manager, and a site supervisor all using the app. They need to share access to the same projects. The organisation is the ownership boundary, not the individual user.

---

## 9. Innovations for V2+

These are parked for now but worth keeping in mind as the product matures:

**AI schedule intelligence:** When a delay is logged, AI analyses dependencies and suggests the most efficient recovery plan (e.g. "overlap framing and plumbing rough-in to recover 2 days").

**Photo-to-progress:** AI vision analyses site photos and suggests task completion percentages. Reduces manual data entry for builders.

**Automated weather delays:** Bureau of Meteorology API integration. App checks daily conditions at the project postcode and pre-populates delay entries for builder confirmation.

**Estimating engine:** Your Excel labour rate lookups and material costing become a built-in estimating tool. Builders input quantities, the system calculates costs using stored trade rates.

**Variation management:** Formal variation register with cost impact tracking, client approval workflow, and automatic contract sum adjustment.

**Subcontractor invoicing:** Subs submit invoices through the app, builder approves, system tracks subcontractor vs contract margin.

**Client approval portal:** Homeowner can approve selections (tiles, fixtures, colours) through the app with photo references.

**Multi-project resource planning:** See which subcontractors are booked across all projects, identify scheduling conflicts.

**Template marketplace:** Builders share or sell their customised programme templates to other builders.

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Builders won't update progress regularly | Payment claims become inaccurate | Make progress updates extremely fast (< 2 mins). Subcontractors updating their own tasks reduces builder's workload |
| DHTMLX Gantt licensing costs at scale | Unexpected expense | Free tier supports V1. Evaluate at 50+ users whether cost is justified or build custom |
| Offline usage on construction sites | App unusable without signal | V2 priority: service worker for offline mode with sync when back online |
| Data loss / corruption | Loss of trust | Supabase handles backups. Add manual "export to PDF" for all critical data |
| Payment claim calculations incorrect | Legal / financial risk | Build comprehensive unit tests for claim calculations. Have a builder manually verify first 10 claims |
| Scope creep during build | Never launches | Strict adherence to build stages. V1 = minimum viable product, everything else is V2 |

---

## 11. Success Metrics

**V1 launch target:** One real builder using it on one real project within 12 weeks of starting development.

**Key metrics to track:**
- Time from login to progress update complete (target: < 2 minutes)
- Payment claims generated per month
- Homeowner update frequency (target: weekly during active construction)
- Subcontractor adoption rate (% of subs who actually log in and update)
- Builder retention (do they use it on their next project?)

---

*Document version: 1.0*
*Created: April 2026*
*Next review: After Stage 2 completion*
