/**
 * @file The Themes screen's card-action glyphs (owner 2026-10-08: the card's text buttons became
 * icons). Jini has no compass, so Explore's glyph stays local here — the same split
 * `plugins-visuals.tsx` uses (shared shapes from Jini, unique artwork local). The Duplicate (copy)
 * glyph went with its button when Copy moved into the card's ⋮ menu (owner 2026-10-10). Decorative:
 * the button around it carries the accessible name.
 */

/** The 24px grid, 1.5 stroke and round joins every admin line icon shares (`plugins-visuals.tsx`). */
const LINE_ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export interface IconProps {
  size?: number;
}

/** Explore — a compass: look around a theme's files without changing anything. */
export function CompassIcon({ size = 18 }: IconProps) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.4 8.6-2.1 4.7-4.7 2.1 2.1-4.7z" />
    </svg>
  );
}

