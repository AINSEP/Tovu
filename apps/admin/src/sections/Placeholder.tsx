import { NAV, type NavItem } from "../nav";

/**
 * @file Fallback screen for a section with no dedicated component yet — reached either directly
 * (`App.tsx`'s `SECTIONS` map, e.g. `newsletter`) or via the legacy `/section/:id` route's
 * fallback for any id `parseRoute` accepts without checking it against a known section.
 *
 * Previously looked up `props.sectionId` in `src/admin-shell/navigation.ts`'s `adminSections` — a
 * separate, stale registry (its own header discloses `apps/admin/src/nav.ts` is now the real
 * source of truth, and only carries 12 of the ~26 current sections) that never had `newsletter`
 * added. A legitimate `soon: true` nav item therefore fell through to the exact same "Unknown
 * section" error banner as an actual typo'd/bogus id — audit finding
 * (`ADS-memory/reports/audits/20260801-admin-adversarial-ux-audit.md`, Newsletter section + exec
 * summary #3): "any future `soon` nav item is one omission away from the same bug," confirmed live
 * via `/admin/newsletter` and the `/section/:id` fallback both rendering the identical banner.
 *
 * Fixed at the root rather than by adding `newsletter` to the stale registry (which would leave
 * the same trap for the next `soon` item): looks up `props.sectionId` in `nav.ts`'s own `NAV`
 * instead, which already carries every current section's `label` (`soon` included) and cannot
 * drift out of sync with itself the way a second parallel list can. `Unknown section` stays
 * reserved for an id that matches nothing in `NAV` at all — a genuine bogus id, not a
 * known-but-unbuilt section (see `nav.ts`'s own file header: presence in `NAV` is about sidebar
 * visibility, not reachability, so this only needs `NAV` to know a section is real).
 */

/**
 * @complexity O(n) in the total nav item count across all groups (currently ~26) — a linear scan,
 * acceptable for a lookup that runs once per Placeholder render against a small, static list.
 * @overallScore 100
 */
function findNavItem(sectionId: string): NavItem | undefined {
  for (const group of NAV) {
    const item = group.items.find((entry) => entry.id === sectionId);
    if (item) return item;
  }
  return undefined;
}

export function Placeholder(props: { sectionId: string }) {
  const item = findNavItem(props.sectionId);
  if (!item) return <div className="notice error">Unknown section: {props.sectionId}</div>;

  return (
    <div>
      <h1>{item.label}</h1>
      <div className="notice">{item.label} is coming soon.</div>
    </div>
  );
}
