/**
 * @file The `list` bound shared between `PublishHistoryStore`'s two implementations —
 * `InMemoryPublishHistoryStore` (`features/deployments/static-publish/publish-history.ts`) and
 * `SqlitePublishHistoryStore` (`db/sqlite/publish-history-repo.sqlite.ts`). Lives here, in `core/`,
 * not in either implementation's own file or module tree: it originally sat in `publish-history.ts`
 * and was imported as a runtime value by the sqlite adapter — an adapter reaching UP into the feature
 * module for business logic, the wrong direction, and the sole cause of a
 * `db <-> features/deployments` module cycle (2026-08-17 architecture audit, Candidate 3). Moving it
 * to `db/sqlite/` "solved" that cycle but only by trading it for a different rule's warning
 * (`only-composition-constructs-concrete-adapters`, `.dependency-cruiser.mjs`): a `list` bound is a
 * policy constant, not a storage concern, and `publish-history.ts`'s own value-import of it from
 * `src/platform/db/**` read as a feature reaching into a concrete adapter's home even though this file itself
 * has never held a Drizzle import.  Neither implementation's own file, nor `src/platform/db/sqlite/`, nor
 * `features/deployments/` is a valid neutral home — the first two ask the pure in-memory test double
 * to depend on the SQLite adapter's directory, and the third recreates the original `db <->
 * features/deployments` cycle this file was moved out of feature code to avoid. `src/contracts/core/` is the
 * one layer both `src/platform/db/**` (precedent: `db/sqlite/watermark.ts`, `db/sqlite/db-ops.ts`,
 * `db/sqlite/entry-refs-repo.sqlite.ts` already import from `src/contracts/core/**`) and `src/features/**` may
 * depend on without creating an edge either rule polices — `core-no-server-or-app-imports` keeps the
 * dependency one-directional (`src/contracts/core` itself may never import `src/platform/db`/`src/features` back). This
 * file is dialect-agnostic (no Drizzle import) and dependency-free, so both implementations can depend
 * on it without depending on each other or on any particular storage layer.
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
