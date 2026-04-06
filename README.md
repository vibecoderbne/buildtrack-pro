# ProgressBuild

Construction programme management for Australian residential builders.

## What it does

ProgressBuild replaces fragmented Excel spreadsheets, WhatsApp updates, and manual payment claim calculations with a single platform. Builders update task progress in under 2 minutes — the system automatically generates payment claims, client updates, and delay documentation.

## Tech stack

- **Frontend:** Next.js 16 + TypeScript + Tailwind CSS v4
- **Database / Auth / Storage:** Supabase (PostgreSQL + Row Level Security)
- **Hosting:** Vercel
- **Gantt chart:** DHTMLX Gantt (Stage 2)

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials (or use the existing `.env.local` if already configured).

## Build stages

| Stage | Description | Status |
|-------|-------------|--------|
| 1 | Foundation — auth, DB, project CRUD | In progress |
| 2 | Gantt chart — DHTMLX, dependencies, critical path | Not started |
| 3 | Progress & payments — claim generation, PDF export | Not started |
| 4 | Delays & homeowner — delay register, homeowner dashboard | Not started |
| 5 | Subcontractor portal | Not started |
| 6 | Polish & launch | Not started |

See `PRODUCT_SPEC.md` for the full specification and `CLAUDE.md` for development context.
