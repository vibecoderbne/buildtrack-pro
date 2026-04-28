/**
 * ProgressBuild — Design Tokens (TypeScript mirror of tokens.css)
 * Locked: clay palette · light theme · compact density
 *
 * Use these when you need raw values in JS (charts, Canvas, JSON exports).
 * For component styling, prefer CSS variables from tokens.css.
 */

export const fonts = {
  ui:      `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`,
  display: `"Inter Tight", "Inter", system-ui, sans-serif`,
  mono:    `"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`,
} as const;

export const text = {
  xs:   11,
  sm:   12,
  base: 13,
  md:   14,
  lg:   16,
  xl:   20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 36,
  '5xl': 48,
} as const;

export const density = {
  rowH:    32,
  padX:    12,
  padY:    6,
  gap:     12,
  radius:  6,
  radiusLg: 10,
} as const;

export const colors = {
  // Surface
  bg:            '#faf8f5',
  surface:       '#ffffff',
  surface2:      '#f3efe9',
  border:        '#e6e0d6',
  borderStrong:  '#d3ccbe',

  // Ink (text)
  ink:    '#1c1917',
  ink2:   '#44403c',
  ink3:   '#78716c',
  ink4:   '#a8a29e',

  // Accent
  accent:     '#b45309',
  accentSoft: '#fef3c7',
  accentInk:  '#78350f',

  // Status
  ok:       '#15803d',
  okSoft:   '#dcfce7',
  warn:     '#b45309',
  warnSoft: '#fef3c7',
  bad:      '#b91c1c',
  badSoft:  '#fee2e2',
  info:     '#1d4ed8',
  infoSoft: '#dbeafe',

  // Critical path
  critical: '#b91c1c',
} as const;

/** Phase colors for Gantt rows — use in order. */
export const phases = [
  '#b45309', // 1
  '#78716c', // 2
  '#4d7c0f', // 3
  '#0369a1', // 4
  '#7c2d12', // 5
  '#6d28d9', // 6
] as const;

export const shadows = {
  sm: '0 1px 2px rgba(28, 25, 23, 0.04), 0 1px 1px rgba(28, 25, 23, 0.06)',
  md: '0 4px 12px rgba(28, 25, 23, 0.06), 0 2px 4px rgba(28, 25, 23, 0.04)',
  lg: '0 12px 32px rgba(28, 25, 23, 0.08), 0 4px 8px rgba(28, 25, 23, 0.04)',
} as const;

export const motion = {
  ease:    'cubic-bezier(0.2, 0.6, 0.2, 1)',
  durFast: 120,
  durMed:  220,
} as const;

export type Tokens = {
  fonts:   typeof fonts;
  text:    typeof text;
  density: typeof density;
  colors:  typeof colors;
  phases:  typeof phases;
  shadows: typeof shadows;
  motion:  typeof motion;
};

const tokens: Tokens = { fonts, text, density, colors, phases, shadows, motion };
export default tokens;
