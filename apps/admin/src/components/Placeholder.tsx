import { getNav, type AdminNavItem } from "../nav";

/**
 * @file Fallback screen for a section with no dedicated component yet — reached either directly
 * (`App.tsx`'s `SECTIONS` map, e.g. `newsletter`) or via the legacy `/section/:id` route's
 * fallback for any id `parseRoute` accepts without checking it against a known section.
 *
 * Previously looked up `props.sectionId` in a separate, legacy admin-shell registry (a shared,
 * framework-agnostic shell package, since removed as dead code) that only carried 12 of the ~26
 * current sections and never had `newsletter` added. A legitimate `soon: true` nav item therefore
 * fell through to the exact same "Unknown section" error banner as an actual typo'd/bogus id —
 * audit finding (`ADS-memory/reports/audits/20260801-admin-adversarial-ux-audit.md`, Newsletter
 * section + exec summary #3): "any future `soon` nav item is one omission away from the same bug,"
 * confirmed live via `/admin/newsletter` and the `/section/:id` fallback both rendering the
 * identical banner.
 *
 * Fixed at the root rather than by adding `newsletter` to the legacy registry (which would leave
 * the same trap for the next `soon` item): looks up `props.sectionId` in `nav.ts`'s own `getNav()`
 * instead, which already carries every current section's `label` (`soon` included) and cannot
 * drift out of sync with itself the way a second parallel list can. `Unknown section` stays
 * reserved for an id that matches nothing in `getNav()` at all — a genuine bogus id, not a
 * known-but-unbuilt section (see `nav.ts`'s own file header: presence in the nav is about sidebar
 * visibility, not reachability, so this only needs `getNav()` to know a section is real).
 */

/**
 * @complexity O(n) in the total nav item count across all groups (currently ~26) — a linear scan,
 * acceptable for a lookup that runs once per Placeholder render against a small, static list.
 * @overallScore 100
 */
function findNavItem(sectionId: string): AdminNavItem | undefined {
  for (const group of getNav()) {
    const item = group.items.find((entry) => entry.id === sectionId);
    if (item) return item;
  }
  return undefined;
}

/** The nav group this item lives in, for the page header's kicker — "Overview" for the ungrouped
 *  top row (matches how `AiAssistant.unit.test.tsx` itself describes that row), otherwise the
 *  group's own `label`. Real IA, not an invented word: every kicker in this pass reuses a `nav.ts`
 *  group label rather than a per-screen ad hoc string. */
function findNavGroupLabel(sectionId: string): string {
  for (const group of getNav()) {
    if (group.items.some((entry) => entry.id === sectionId)) return group.label ?? "Overview";
  }
  return "Overview";
}

export function Placeholder(props: { sectionId: string }) {
  const item = findNavItem(props.sectionId);
  if (!item) return <div className="notice error">Unknown section: {props.sectionId}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{findNavGroupLabel(props.sectionId)}</p>
          <h1 className="page-title">{item.label}</h1>
          <p className="page-description">{item.label} is coming soon.</p>
        </div>
      </div>
    </div>
  );
}
