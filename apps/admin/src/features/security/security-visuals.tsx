/**
 * @file This page's own small icon set — no icon dependency, same rationale
 * `source-control/source-control-visuals.tsx`'s header gives for its own set. This page owns no code
 * dependency on `deployment/`/`source-control/` beyond their shared `rules.ts` data tables (see
 * `rules.ts`'s own header), so its icons are redrawn locally rather than imported cross-feature too.
 *
 * No brand marks anywhere in this file — GitHub/GitLab/Bitbucket/Vercel/Netlify/Cloudflare Pages all
 * render as plain `translate="no"` text with a generic connection/checkmark glyph beside them, same
 * treatment every provider name in this app gets.
 */

const LINE_ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** The search field's leading icon — always `aria-hidden`, the field has its own visually-hidden
 *  `<label>` carrying the accessible name (`AccessTokensTab.tsx`'s `AccessTokensSearch`). */
export function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.3-4.3" />
    </svg>
  );
}

/** A connected row's marker glyph — same check-glyph path `source-control-visuals.tsx`'s
 *  `ConnectedMarkIcon` uses, redrawn locally for the same "no cross-feature dependency" reason. */
export function ConnectedMarkIcon({ size = 12 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size} strokeWidth={2.5} aria-hidden="true">
      <path d="m5 13 4.5 4.5L19 6.5" />
    </svg>
  );
}

/** The disclosure chevron beside a connected row's "Replace token" affordance, rotated 180° by CSS
 *  when its `<details>` is open — same path `source-control-visuals.tsx`'s `DisclosureChevronIcon`
 *  uses. Always paired with a visible text label, never alone (that file's own header explains why:
 *  a bare chevron on a settled row was owner-reported as undiscoverable on the Static Site tab). */
export function DisclosureChevronIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
