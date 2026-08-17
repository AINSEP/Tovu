/**
 * @file The `list` bound shared between `PublishHistoryStore`'s two implementations —
 * `InMemoryPublishHistoryStore` (`features/deployments/static-publish/publish-history.ts`) and
 * `SqlitePublishHistoryStore` (`./publish-history-repo.sqlite.ts`, this directory). Lives here, not
 * in either implementation's own file: it previously sat in `publish-history.ts` and was imported
 * as a runtime value by the sqlite adapter — an adapter reaching UP into the feature module for
 * business logic, the wrong direction, and the sole cause of a `db <-> features/deployments` module
 * cycle (2026-08-17 architecture audit, Candidate 3). Neither implementation's own file is a valid
 * neutral home: putting it in `db/sqlite/` specifically would ask the pure in-memory test double to
 * depend on the SQLite adapter's directory, and leaving it in `features/deployments/` is what
 * created the cycle in the first place. This file is dialect-agnostic (no Drizzle import) and
 * dependency-free, so both implementations can depend on it without depending on each other.
 */

/** Default `limit` for {@link PublishHistoryStore.list} when a caller does not specify one. */
export const DEFAULT_PUBLISH_HISTORY_LIST_LIMIT = 50;
/** Hard ceiling on {@link PublishHistoryStore.list}'s `limit` — see that method's own doc for why an
 *  append-only, unbounded-growth table needs one regardless of what a caller requests. */
export const MAX_PUBLISH_HISTORY_LIST_LIMIT = 200;

/** Clamps a caller-requested `list` limit into `[1, MAX_PUBLISH_HISTORY_LIST_LIMIT]`, defaulting to
 *  {@link DEFAULT_PUBLISH_HISTORY_LIST_LIMIT} when omitted — the one place both {@link
 *  InMemoryPublishHistoryStore} and `SqlitePublishHistoryStore` apply the same bound, so the two
 *  implementations can never silently disagree on what "too many" means.
 *  @complexity O(1). */
export function resolvePublishHistoryListLimit(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_PUBLISH_HISTORY_LIST_LIMIT;
  return Math.max(1, Math.min(Math.trunc(requested), MAX_PUBLISH_HISTORY_LIST_LIMIT));
}
