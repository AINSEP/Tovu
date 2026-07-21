import type { EntryListPort } from "../../features/entries/list";
import { getWidgetTypeRegistration } from "../registry";
import type { WidgetResolveResult, WidgetResolver } from "../types";

/**
 * @file `recent-entries` widget resolver (SPEC-043 REQ-25, ADR-047 §9).
 *
 * Purpose:
 * A bounded, clamped read over `entries`, reusing `features/entries/list.ts`'s existing
 * `EntryListPort.listByWorkspace` read-query shape (per the Coordinator's integration-points
 * guidance) rather than writing a second entries-listing code path. Not wired into `CORE_RESOLVERS`
 * at module load (needs an injected `EntryListPort` — see `create-core-resolvers.ts`'s
 * `wireCoreResolvers` for how a future boot pass populates it) and has no dedicated test in this
 * TDD slice — `resolver-service.integration.test.ts` exercises the `recent-entries` DISPATCH path
 * via a test-double resolver, not this real implementation; this file is nonetheless a real,
 * working resolver, not a placeholder.
 *
 * `categoryTermId` (REQ-32/EC-03) is a documented soft reference — this resolver does not filter by
 * it (no taxonomy dependency wired here), matching EC-03's explicit "may render as if the filter is
 * empty/unset" allowance.
 */
export interface RecentEntriesResolverDeps {
  entryList: EntryListPort;
}

export function createRecentEntriesResolver(deps: RecentEntriesResolverDeps): WidgetResolver {
  return {
    async resolveMany(instances, context) {
      const registration = getWidgetTypeRegistration("recent-entries");
      const registryMax = registration?.clamps.maxItems ?? 20;

      // One batched query for the whole call (REQ-24) — EntryListPort has no `findByIds` batch
      // primitive, so a single `listByWorkspace` scoped to the widget content type stands in for
      // the outline's literal "WHERE id IN (...)" shape without a second entries-listing path.
      const allEntries = await deps.entryList.listByWorkspace({ workspaceId: context.workspaceId });
      const published = allEntries
        .filter((entry) => entry.status === "published")
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));

      const results = new Map<string, WidgetResolveResult>();
      for (const instance of instances) {
        const configuredMax = typeof instance.config.maxItems === "number" ? instance.config.maxItems : registryMax;
        // REQ-25: the registered clamp always wins, regardless of the instance's own config.
        const max = Math.max(0, Math.min(configuredMax, registryMax));
        const items = published.slice(0, max).map((entry) => ({ id: entry.id, title: entry.title, slug: entry.slug }));

        results.set(instance.id, {
          ok: true,
          ir: {
            componentId: "recent-entries",
            props: {},
            children: items.map((item) => ({ componentId: "entry-summary", props: item })),
          },
          dependencyKeys: items.map((item) => item.id),
        });
      }
      return results;
    },
  };
}
