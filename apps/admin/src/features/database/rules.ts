import type { QueryKey } from "../../lib/fetch-query";

/**
 * @file Pure logic for the `database` feature — everything that computes a value rather than
 * rendering one. New file: this feature had no `rules.ts` before this migration, since none of its
 * three sections had computed logic worth extracting until `KEYS` needed a shared home.
 *
 * `KEYS` (fetch-query migration, 2026-08-12): `restorePoints` and `timeline` are two independent
 * resources — `use-restore-points-section.hooks.ts`'s create action never reloaded the timeline in
 * the pre-migration code either (each section owns its own load, no cross-invalidation), so they
 * get two entirely separate top-level namespaces rather than a shared grandparent, same shape
 * `forms/rules.ts`'s `KEYS` uses for `forms` vs `form-submissions`.
 *
 * `timeline(filters)` keys on the four filter fields together, not on a separate "applied" flag —
 * `use-timeline-section.hooks.ts` keeps a `kind`/`outcome`/`fromDate`/`toDate` DRAFT (bound to the
 * filter form's own inputs) separate from the `appliedFilters` state this key is built from, so
 * typing into a filter field does not itself trigger a reload — only `applyFilters` committing the
 * draft into `appliedFilters` does, matching the pre-migration `applyFilters`'s explicit
 * `load(true)` call. `useFetchMutation`'s `no invalidates` case: this feature also has
 * `use-migrate-forward-section.hooks.ts`'s plan/confirm/execute ceremony, which has no read of its
 * own to cache (no `KEYS` entry needed for it) — see that hook's own doc comment.
 */
export const KEYS = {
  restorePoints: ["database", "restore-points"] as QueryKey,
  timeline: (filters: { kind: string; outcome: string; fromDate: string; toDate: string }): QueryKey => [
    "database",
    "timeline",
    filters.kind,
    filters.outcome,
    filters.fromDate,
    filters.toDate,
  ],
};
