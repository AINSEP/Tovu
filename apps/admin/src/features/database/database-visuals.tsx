/**
 * @file This screen's own small icon set — two inline SVGs for its tab row, no icon dependency.
 * Same rationale `source-control-visuals.tsx` and `deployment/deployment-visuals.tsx` give for
 * theirs: this app ships no icon component library to `features/`, and importing a glyph across a
 * feature boundary would tie this screen's rendering to a sibling feature another agent owns.
 *
 * All `aria-hidden` — each sits directly beside the tab label that already says the same thing
 * (`frontend-accessibility`: an icon that duplicates its own visible label is noise to a screen
 * reader, not information).
 */

/** Shared attributes for a decorative line icon — same 24px grid, 1.5 stroke, round joins as the
 *  other `*-visuals.tsx` sets and `Roles.hooks.tsx`, so every tab row in this admin reads as one
 *  family. */
const LINE_ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** Timeline — a ledger: three entries down the page, each with its marker. */
export function TimelineIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <circle cx="6" cy="6.5" r="1.25" />
      <path d="M10 6.5h9" />
      <circle cx="6" cy="12" r="1.25" />
      <path d="M10 12h9" />
      <circle cx="6" cy="17.5" r="1.25" />
      <path d="M10 17.5h9" />
    </svg>
  );
}

/** Migrate forward — an arrow carried up to a stop: apply what is pending, up to the edge. */
export function MigrateForwardIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M4 12h11" />
      <path d="m11 8 4 4-4 4" />
      <path d="M19 5.5v13" />
    </svg>
  );
}
