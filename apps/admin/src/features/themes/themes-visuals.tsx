import { Icon } from "@jini-ai/ui";
/**
 * @file The Themes screen's card-action glyphs (owner 2026-10-08: the card's text buttons became
 * icons). Copy is Jini UI's shared `copy` shape; Jini has no compass, so Explore's glyph stays local
 * here — the same split `plugins-visuals.tsx` uses (shared shapes from Jini, unique artwork local).
 * Both are decorative: the button around each one carries the accessible name.
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

/** Duplicate — two overlapping pages, the copy-button glyph. */
export function DuplicateIcon({ size = 18 }: IconProps) {
  return <Icon name="copy" size={size} focusable={undefined} {...LINE_ICON} />;
}
