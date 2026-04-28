# ProgressBuild — Design Handoff

> Everything in this folder is locked design intent. Implement it as-is. Do **not** invent new colors, fonts, spacing, or logo variants. If something seems missing, ask.

## Locked decisions

| Choice | Value | Notes |
|---|---|---|
| **Theme** | Light only (for now) | Dark mode is a phase-2 concern. Don't ship a toggle yet. |
| **Palette** | Clay (Australian earth, slightly warm) | Not slate, not hi-vis. |
| **Density** | Compact | 32px row height, 13px base font. |
| **Logo** | Stacked bars (`stack` variant) | Three filling programme rows. This is the only mark. |
| **Type** | Inter (UI) · Inter Tight (display) · JetBrains Mono | Loaded from Google Fonts. |
| **Two-weight wordmark** | `progress` (regular) + `build` (heavier, accent color) | Reads as "measure / build". |

## Files in this folder

```
handoff/
├── CLAUDE.md                 ← this file (read first)
├── tokens.css                ← CSS variables — drop into globals.css / app.css
├── tokens.ts                 ← TS constants mirror — for JS-side access
├── typography.md             ← type scale, weights, font-feature-settings
├── README-logo.md            ← how to use the logo files
├── logo/
│   ├── mark.svg              ← mark only, currentColor (24×22 viewBox)
│   ├── mark-ink.svg          ← mark on ink, baked colors
│   ├── mark-accent.svg       ← mark in clay accent, baked
│   ├── wordmark.svg          ← wordmark + mark, baked colors, light bg
│   ├── wordmark-mono.svg     ← wordmark single-color (currentColor)
│   ├── favicon.svg           ← square mark on accent, for browser tab
│   └── Logo.tsx              ← React component (mark + wordmark)
└── preview.html              ← visual proof — open this to verify it all renders
```

## Step-by-step for the implementing agent

1. **Tokens.** Copy `tokens.css` into the app's global stylesheet (e.g. `src/styles/globals.css` or `app/globals.css`). It defines the full token set as CSS custom properties. Use the variables (`var(--ink)`, `var(--accent)`, etc.) — never hard-code hex.
2. **Fonts.** Add the Google Fonts `<link>` from `typography.md` to `<head>`, or use `next/font` if Next.js. Don't substitute fonts.
3. **Logo.** Drop `logo/` somewhere static (`public/brand/` for Next.js, `src/assets/brand/` for Vite). Use `Logo.tsx` for inline rendering, or reference the SVG files directly.
4. **Density.** The compact density tokens (`--row-h: 32px`, `--pad-x: 12px`, `--pad-y: 6px`, `--gap: 12px`, base font 13px) are already the defaults in `tokens.css`. No class needed.
5. **Verify.** Open `preview.html` in a browser. The implementation should match.

## Component contracts (what tokens map to what)

- **Buttons** — height `var(--row-h)`, padding `0 var(--pad-x)`, radius `var(--radius)` (6px). Primary uses `--ink` bg / `--bg` text. Accent uses `--accent` bg / white text.
- **Inputs** — same height/padding as buttons. Focus ring: `border-color: var(--accent)` + `box-shadow: 0 0 0 3px var(--accent-soft)`.
- **Cards** — `--surface` bg, `1px solid var(--border)`, `--radius-lg` (10px). Use `--shadow-sm` sparingly.
- **Chips** — 11px font, 999px radius, status variants use `--ok-soft` / `--warn-soft` / `--bad-soft` / `--info-soft` paired with their solid color for text.
- **Gantt rows** — use `--phase-1` through `--phase-6` for phase coloring. `--critical` (`#b91c1c`) marks critical path.
- **Tables** — row height `var(--row-h)`, borders `var(--border)`, hover `var(--surface-2)`.

## Voice & vocabulary
- "Programme" not "schedule" (Australian).
- "Payment claim" not "invoice" (NSW SOP Act terminology).
- Plain-spoken, no exclamation marks, no emoji.

## What NOT to do
- ❌ Don't add gradient backgrounds.
- ❌ Don't substitute Inter for "Geist" / "Satoshi" / system stacks.
- ❌ Don't use other logo variants — `block`, `diamond`, `chevron` were rejected.
- ❌ Don't add a dark-mode toggle yet.
- ❌ Don't pad UI with decorative SVG illustrations.
