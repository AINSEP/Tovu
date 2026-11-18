import assert from "node:assert/strict";
import test from "node:test";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { SqlPrincipalRepo, SqlSessionRepo } from "../repo.js";

/**
 * @file A session save must never undo a revocation (security: lost update on a session row).
 * `save` is an upsert by id; a record built before the session was revoked carries no `revokedAt`,
 * so a whole-row conflict update restored a revoked session to live (logout, password reset and
 * principal-disable revoke through `revoke`). Revocation is one-way: the stored `revoked_at` survives
 * any later save of the same id.
 */

const WS = "ws-session-revocation";
const T0 = "2026-11-17T00:00:00.000Z";
const REVOKED = "2026-11-17T01:00:00.000Z";
const session = (overrides = {}) => ({ id: "s1", workspaceId: WS, principalId: "p1", tokenHash: "hash-s1", createdAt: T0, expiresAt: "2026-12-17T00:00:00.000Z", ...overrides });

describeEachDialect("identity session revocation", { tables: ["workspaces", "principals", "sessions"], make: (kernel: ContentKernel) => ({ kernel, principals: new SqlPrincipalRepo(kernel), sessions: new SqlSessionRepo(kernel) }) }, (makeRepos) => {
  async function seeded() {
    const repos = makeRepos();
    await repos.kernel.run(db => db.insertInto("workspaces").values({ id: WS, name: WS, slug: WS, created_at: T0 }).onConflict(oc => oc.column("id").doNothing()).execute());
    await repos.principals.save({ id: "p1", workspaceId: WS, kind: "user", displayName: "P1", status: "active", createdAt: T0 });
    return repos.sessions;
  }

  test("a save of the same session after it was revoked does not restore it", async () => {
    const sessions = await seeded();
    const loaded = session();
    await sessions.save(loaded);
    await sessions.revoke({ workspaceId: WS, id: "s1", revokedAt: REVOKED });
    await sessions.save({ ...loaded, ip: "203.0.113.7" });
    const stored = await sessions.findById({ workspaceId: WS, id: "s1" });
    assert.equal(stored?.revokedAt, REVOKED, "a stale whole-row save un-revoked the session");
    assert.equal(stored?.ip, "203.0.113.7", "the other columns are still saved");
  });

  test("a save that carries its own revokedAt still revokes", async () => {
    const sessions = await seeded();
    await sessions.save(session());
    await sessions.save(session({ revokedAt: REVOKED }));
    assert.equal((await sessions.findById({ workspaceId: WS, id: "s1" }))?.revokedAt, REVOKED);
  });
});
