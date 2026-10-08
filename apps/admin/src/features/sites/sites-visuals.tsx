import { ICON_PATH_DATA } from "@jini-ai/ui";
/**
 * @file This screen's own small icon set — one inline SVG, no icon dependency. Same rationale
 * `source-control-visuals.tsx` and `deployment/deployment-visuals.tsx` give for theirs: this app
 * avoids importing a sibling feature's actively edited file. Exact repeated outlines now come
 * from Jini UI's icon owner; feature-specific inner marks stay here.
 *
 * `aria-hidden` — the icon sits directly beside the text that already says the same thing
 * (`frontend-accessibility`: an icon that duplicates its own visible label is noise to a screen
 * reader, not information).
 */

/** Shared attributes for a decorative line icon — same 24px grid, 1.5 stroke, round joins as the
 *  other `*-visuals.tsx` sets, so this glyph reads as the same family as the rest of the admin. */
const LINE_ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** All sites — a folder: every site here is a directory under `sites/`, which is also the
 *  identifier every card leads with. Tab-row icon (2026-09-06, the same icon-beside-label idiom
 *  every other `TabBar` row carries). */
export function AllSitesIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d={ICON_PATH_DATA["folder-outline-compact"]} />
    </svg>
  );
}

/** New site — the same folder with a plus in it: a directory that does not exist yet. */
export function NewSiteIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d={ICON_PATH_DATA["folder-outline-compact"]} />
      <path d="M12 10.5v5M9.5 13h5" />
    </svg>
  );
}

/** The registration footnote's glyph (`resolveSiteRegistrationBadge` → `.site-card-flag`): a
 *  triangle with a mark, the generic "take note" shape. It is what makes that line read as a note
 *  about the folder rather than a second state badge competing with the one in the card's head —
 *  see `styles.css`'s "Sites — the card's status strip" block (2026-09-06). */
export function SiteFlagIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M12 4.5 3.5 19h17z" />
      <path d="M12 10v4M12 16.5h.01" />
    </svg>
  );
}
