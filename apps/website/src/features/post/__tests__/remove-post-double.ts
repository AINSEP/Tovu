/**
 * @file Test double for `DeletePostDeps.remove`.
 *
 * The real binding (`features/trash`) stamps the marker with column SQL against `content.db` AND
 * writes the Trash index row in one transaction. A test running against `InMemoryPostRepo` has no
 * `content.db`, so it binds `remove` to the port's own narrow marker write instead — the same three
 * columns, same version bump, same workspace scoping, just without the index half.
 *
 * Tests that care about the index half use the real service (`features/trash/__tests__/`), against
 * real SQLite. Keeping the two apart is deliberate: this double must not grow a second, drifting
 * implementation of the Trash.
 */
import type { PostRepoPort, RemovePostFn } from "../post.js";

/**
 * Binds `remove` to `repo.softDelete`.
 *
 * @param repo the same repo the test hands `deletePost`.
 * @param optional.calls when supplied, every request is pushed onto it so a test can assert on the
 *        `display` snapshot the domain passed without reaching into the repo.
 * @complexity O(1) per call.
 */
export function removeVia(
  repo: PostRepoPort,
  optional: { calls?: Parameters<RemovePostFn>[0][] } = {}
): RemovePostFn {
  return async (required) => {
    optional.calls?.push(required);
    const existing = await repo.findById({ workspaceId: required.workspaceId, id: required.id });
    if (!existing) return { ok: false, reason: "not-found" };
    if (required.expectedVersion !== null && existing.version !== required.expectedVersion) {
      return { ok: false, reason: "version-changed" };
    }
    const version = existing.version + 1;
    await repo.softDelete({
      workspaceId: required.workspaceId,
      id: required.id,
      deletedAt: required.at,
      updatedAt: required.at,
      version,
    });
    return { ok: true, version };
  };
}
