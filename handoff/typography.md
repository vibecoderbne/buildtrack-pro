# Typography

## Families
| Token | Family | Use |
|---|---|---|
| `--font-ui` | **Inter** (400/500/600/700) | All UI body, controls, tables |
| `--font-display` | **Inter Tight** (500/600/700) | Headings, wordmark, marketing |
| `--font-mono` | **JetBrains Mono** (400/500/600) | Code, IDs, kbd shortcuts, file paths |

## Loading

### HTML
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" />
```

### Next.js (`next/font`)
```ts
import { Inter, Inter_Tight, JetBrains_Mono } from 'next/font/google';

export const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ui',
});
export const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});
export const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});
```
Then on `<html>`: `className={`${inter.variable} ${interTight.variable} ${jetBrainsMono.variable}`}`.

## Inter feature settings

Always apply on `body`:
```css
font-feature-settings: "cv11", "ss01", "ss03";
```
- `cv11` — single-storey `a` (cleaner at small sizes)
- `ss01` — alt 1 (no flag, reads better in tabular columns)
- `ss03` — alt `g` (single-storey)

## Scale (compact baseline)

| Token | Size | Line-height | Weight | Use |
|---|---|---|---|---|
| `--text-xs`   | 11px | 1.4 | 500 | Chip labels, table meta |
| `--text-sm`   | 12px | 1.4 | 400 | Secondary text, captions |
| `--text-base` | 13px | 1.45 | 400 | **App body default** |
| `--text-md`   | 14px | 1.4 | 500 | Primary buttons, form labels |
| `--text-lg`   | 16px | 1.35 | 600 | Card titles |
| `--text-xl`   | 20px | 1.3 | 600 | Section heads |
| `--text-2xl`  | 24px | 1.25 | 600 | Page titles |
| `--text-3xl`  | 28px | 1.2 | 600 | Display, marketing H2 |
| `--text-4xl`  | 36px | 1.1 | 600 | Marketing H1 |
| `--text-5xl`  | 48px | 1.05 | 600 | Hero |

Display sizes (≥ `--text-xl`) should use `var(--font-display)` and `letter-spacing: -0.02em`.

## Tabular numerics

Any column of numbers (dates, money, durations, %s) **must** use:
```css
font-variant-numeric: tabular-nums;
```
There's a `.tabular` utility in `tokens.css`.

## Wordmark rule

`progress` is regular weight (500–600), `build` is one weight heavier and uses `var(--accent)`. See `logo/Logo.tsx`. The mark sits left of the wordmark with 8px gap.
