/**
 * @file The `list` bound shared between `PublishHistoryStore`'s two implementations —
 * `InMemoryPublishHistoryStore` (`features/deployments/static-publish/publish-history.ts`) and
 * `SqlitePublishHistoryStore` (`db/sqlite/publish-history-repo.sqlite.ts`). Lives here, in `core/`,
 * not in either implementation's module tree: it is dialect-neutral policy, not storage logic.
 * `contracts/core` is the neutral layer both features and DB adapters may depend on without
 * depending on each other. `core-no-server-or-app-imports` keeps that direction one-way.
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
