# Logo

The ProgressBuild mark is **stacked bars** — three programme rows filling left-to-right (100%, ~45%, ~20%). It mirrors the Gantt UI it leads into. **This is the only approved mark** — `block`, `diamond`, and `chevron` variants from the exploration were rejected.

## When to use which file

| File | When to use |
|---|---|
| `Logo.tsx` | Anywhere in the React app. Preferred. |
| `mark.svg` | `<img>` / `<Image>` reference. Mono, inherits color. |
| `mark-ink.svg` | Static placement on light backgrounds (PDF exports, emails). |
| `mark-accent.svg` | Brand moments — auth screens, accent surfaces. |
| `wordmark.svg` | Marketing pages, email signatures, social. Baked colors. |
| `wordmark-mono.svg` | Single-color contexts — print, dark surfaces, partner co-brand. |
| `favicon.svg` | `<link rel="icon">`. Square mark on accent. |

## React usage

```tsx
import { Mark, Wordmark } from '@/components/brand/Logo';

// App nav — wordmark, default sizing
<Wordmark size={16} weight={600} />

// App icon spot — mark only
<Mark size={20} />

// On a dark surface — pass color through
<Wordmark size={20} color="var(--bg)" accent="var(--accent-ink)" />

// With tagline (marketing footer etc.)
<Wordmark size={14} weight={500} showSlash showTagline />
```

## Sizing

- **App nav:** `size={16}`, `weight={600}`
- **Auth / hero:** `size={28–36}`, `weight={500–600}`
- **Inline / chip:** `size={11}`, `weight={600}`
- **Favicon:** use `favicon.svg` directly

## Clear space

Minimum padding around the mark = the height of one bar (~`size / 5`). Don't crop, recolor outside `var(--ink)` / `var(--accent)`, or rotate.

## Two-weight wordmark rule

`progress` renders at the requested weight. `build` renders one weight stop heavier and uses `var(--accent)`. The split reads as "what you measure / what you build" — keep it. Don't use a single uniform weight.
