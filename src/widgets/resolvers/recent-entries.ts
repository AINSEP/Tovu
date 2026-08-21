import type { EntryListPort } from "../../features/entries/index.js";
import { getWidgetTypeRegistration } from "../registry.js";
import type { WidgetResolveResult, WidgetResolver } from "../types.js";

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
 * Bounded query (fixed 2026-07-21, audit-confirmed gap): the query passed to `listByWorkspace` is
 * `status: 'published'`, `orderBy: 'updatedAt' desc`, `limit: registryMax` — pushed down to the
 * query itself, not a full unbounded workspace scan sorted/sliced in JS after the fact (the
 * original implementation's bug — REQ-25 requires "one bounded query, no unbounded scans").
 * `registryMax` (the registered clamp, always ≤ the widest instance-configured `maxItems`) is used
 * as the query limit itself, so no instance can pull more rows from storage than the clamp allows,
 * regardless of how many widget instances of this type are being resolved in the same batch call.
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
      // `?.`/`?? 20` are type-required, not dead defensive code: `getWidgetTypeRegistration` returns
      // `WidgetTypeRegistration | undefined` (registry.ts), so `tsc` rejects a direct `.clamps` read
      // even though this specific call, against the closed `WidgetTypeKey` union and the fixed
      // 5-entry `WIDGET_TYPE_REGISTRATIONS` array (no dynamic add/remove path exists), can never
      // actually see `undefined` at runtime. Confirmed zero-hit in coverage (BRDA) for exactly this
      // reason — do not delete on that basis alone; the guard is load-bearing for the wider type.
      const registryMax = registration?.clamps.maxItems ?? 20;

      // One batched query for the whole call (REQ-24) — EntryListPort has no `findByIds` batch
      // primitive, so a single `listByWorkspace` call (scoped to `status: 'published'`, across
      // every content type — a "recent entries" widget is intentionally not narrowed to one type;
      // see EC-03's `categoryTermId` note below for the one dimension it does NOT filter on)
      // stands in for the outline's literal "WHERE id IN (...)" shape without a second
      // entries-listing path. Bounded at the query itself (REQ-25) — `limit: registryMax` is the
      // widest any instance in this batch is allowed to request, so no instance's own config can
      // force a larger scan.
      const published = await deps.entryList.listByWorkspace({
        workspaceId: context.workspaceId,
        status: "published",
        orderBy: "updatedAt",
        orderDirection: "desc",
        limit: registryMax,
      });

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
