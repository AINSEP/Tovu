/**
 * @file This page's own small icon set — three inline SVGs, no icon dependency. Same rationale
 * `deployment/deployment-visuals.tsx`'s header gives for its own set: this app ships no icon
 * component library to `features/`, and importing icons cross-feature (from `deployment/`, which
 * this page deliberately avoids depending on — see `SourceControl.tsx`'s header) would tie this
 * page's rendering to a sibling feature another agent owns.
 *
 * No brand marks anywhere in this file, on purpose. This app draws zero brand logos anywhere —
 * every proper noun on screen (`STATIC_HOSTS` in `deployment/rules.ts`, this page's own provider
 * labels) renders as plain `translate="no"` text, never a mark — so GitHub/GitLab/Bitbucket get the
 * same treatment here: their names are text, and the marker beside each row is a generic
 * connection/checkmark glyph, not an octocat, fox, or Atlassian mark.
 *
 * All `aria-hidden` — every icon here sits next to text that already says the same thing, matching
 * `frontend-accessibility`: an icon that duplicates its own visible label is noise to a screen
 * reader, not information.
 */

/** Shared attributes for a decorative line icon — same 24px grid, 1.5 stroke, round joins as
 *  `deployment-visuals.tsx`'s `LINE_ICON`, so this page's marks read as the same family as the rest
 *  of this admin even though the two files share no code. */
const LINE_ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** The card header's own icon — two nodes joined by a line, the generic shape of "a connection,"
 *  not any one host's mark. Distinct from `deployment-visuals.tsx`'s `StaticSiteIcon`/`FullSiteIcon`
 *  (a document, a server rack) — this page connects an ACCOUNT, not a deploy target. */
export function SourceControlIcon({ size = 20 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8 7.5 16 16.5" />
    </svg>
  );
}

/** A connected row's marker glyph — the same check-glyph path `deployment-visuals.tsx`'s
 *  `StepDoneIcon` uses, redrawn locally rather than imported (this page owns no dependency on the
 *  `deployment` feature — see `SourceControl.tsx`'s header) so the two "this step is done" marks
 *  still read as the same symbol meaning the same thing across the admin. Always `aria-hidden`: the
 *  row's own summary text already states "connected" in words. */
export function ConnectedMarkIcon({ size = 12 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size} stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path d="m5 13 4.5 4.5L19 6.5" />
    </svg>
  );
}

/**
 * The disclosure chevron beside a connected row's "Replace token" affordance, rotated 180° by CSS
 * when its `<details>` is open. Redrawn locally for the same reason {@link ConnectedMarkIcon} is —
 * same path `deployment-visuals.tsx`'s `DisclosureChevron` uses.
 *
 * Always paired with a VISIBLE text label ("Replace token"), never alone: a bare chevron on a
 * clickable row with no text was the exact defect this page was briefed not to inherit from the
 * Static Site tab's credential rows (owner-reported there: a settled row read as inert with no way
 * to discover it could be reopened). The chevron here is reinforcement of a label that already says
 * what opening does, not the only signifier.
 */
export function DisclosureChevronIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
