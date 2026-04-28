/**
 * ProgressBuild Logo — React/TSX
 *
 * Renders the locked stacked-bars mark plus the two-weight wordmark.
 * Stand-alone — no external imports beyond React.
 *
 * <Mark />            → mark only, sized by `size`, color via currentColor
 * <Wordmark />        → mark + "progressbuild" wordmark
 *
 * Colors come from CSS variables defined in tokens.css:
 *   --ink     (text)
 *   --accent  ("build" word + accent overrides)
 * If you render this in a context without those vars, pass `color` / `accent`.
 */

import * as React from 'react';

type MarkProps = {
  /** Pixel height of the mark. Width is ~1.1 × this. */
  size?: number;
  /** Override stroke + fill. Defaults to currentColor. */
  color?: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
};

export const Mark: React.FC<MarkProps> = ({
  size = 16,
  color = 'currentColor',
  className,
  style,
  title = 'ProgressBuild',
}) => (
  <svg
    width={size * 1.1}
    height={size}
    viewBox="0 0 22 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label={title}
    className={className}
    style={{ flex: 'none', ...style }}
  >
    <title>{title}</title>
    <rect x="1" y="1"  width="20" height="4" rx="1" stroke={color} strokeWidth="1.4" />
    <rect x="1" y="1"  width="14" height="4" rx="1" fill={color} />
    <rect x="1" y="8"  width="20" height="4" rx="1" stroke={color} strokeWidth="1.4" />
    <rect x="1" y="8"  width="9"  height="4" rx="1" fill={color} />
    <rect x="1" y="15" width="20" height="4" rx="1" stroke={color} strokeWidth="1.4" />
    <rect x="1" y="15" width="4"  height="4" rx="1" fill={color} />
  </svg>
);

type WordmarkProps = {
  /** Type size in px (mark scales with it). */
  size?: number;
  /** Weight of "progress". "build" is rendered one stop heavier. */
  weight?: 400 | 500 | 600 | 700;
  /** Override main text color (defaults to var(--ink)). */
  color?: string;
  /** Override accent color used for "build" (defaults to var(--accent)). */
  accent?: string;
  /** Show " / construction programmes" tagline. */
  showTagline?: boolean;
  /** Show middot separator before tagline / pages. */
  showSlash?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export const Wordmark: React.FC<WordmarkProps> = ({
  size = 16,
  weight = 600,
  color,
  accent,
  showTagline = false,
  showSlash = false,
  className,
  style,
}) => {
  const heavy = (Math.min(weight + 100, 700)) as 500 | 600 | 700;
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        color: color ?? 'var(--ink)',
        fontFamily: 'var(--font-display, "Inter Tight", "Inter", system-ui, sans-serif)',
        fontSize: size,
        fontWeight: weight,
        letterSpacing: '-0.01em',
        lineHeight: 1,
        ...style,
      }}
    >
      <Mark size={size * 1.05} color={color ?? 'currentColor'} />
      <span>
        progress
        <span style={{ fontWeight: heavy, color: accent ?? 'var(--accent)' }}>build</span>
      </span>
      {showSlash && (
        <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>/</span>
      )}
      {showTagline && (
        <span
          style={{
            color: 'var(--ink-3)',
            fontWeight: 400,
            fontSize: size * 0.78,
            letterSpacing: 0,
          }}
        >
          construction programmes
        </span>
      )}
    </span>
  );
};

export default Wordmark;
