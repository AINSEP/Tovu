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

/** The Access Tokens tab's own icon — a key, i.e. the shape a credential is. Added for the Security
 *  page's tab row (owner request, the same pass that added Deployment's five and Source Control's
 *  Providers tab their own icons); this page's two real tabs are this one and {@link SiteTokenIcon}. */
export function AccessTokensIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <circle cx="8" cy="8" r="4.5" />
      <path d="m11.2 11.2 8.3 8.3M16.5 16.5l2.3-2.3M19 19l2-2" />
    </svg>
  );
}

/** The Site Token tab's own icon — a shield, distinct from {@link AccessTokensIcon}'s plain key:
 *  this tab is about the ONE key that protects every OTHER credential, not a credential itself. */
export function SiteTokenIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M12 3.5 4.5 6.2v5.3c0 4.4 3.1 7.4 7.5 8.9 4.4-1.5 7.5-4.5 7.5-8.9V6.2L12 3.5Z" />
      <path d="M9.4 12.2l1.8 1.8 3.6-3.8" />
    </svg>
  );
}

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
