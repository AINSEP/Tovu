import assert from "node:assert/strict";
import test from "node:test";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { SqlMemberSessionRepo } from "../repo.js";
import type { MemberSessionRecord } from "../types.js";

/**
 * @file A member session save must never undo a revocation (security: lost update on a session row).
 * `save` is an upsert by id; a record built from a read made before the member's sessions were
 * revoked carries no `revokedAt`, so a whole-row conflict update restored a revoked session to live.
 * Revocation is one-way: the stored `revoked_at` survives any later save of the same id.
 */

const WS = "ws-session-revocation";
const T0 = "2026-11-17T00:00:00.000Z";
const REVOKED = "2026-11-17T01:00:00.000Z";

function session(overrides: Partial<MemberSessionRecord> = {}): MemberSessionRecord {
  return { id: "s1", workspaceId: WS, memberId: "m1", tokenHash: "hash-s1", createdAt: T0, expiresAt: "2026-12-17T00:00:00.000Z", revokedAt: undefined, lastSeenAt: T0, userAgent: "UA/1.0", ip: "203.0.113.9", ...overrides };
}

describeEachDialect("member session revocation", { tables: ["members", "member_sessions"], make: (kernel: ContentKernel) => new SqlMemberSessionRepo(kernel) }, (makeRepo) => {
  test("a save of the same session after it was revoked does not restore it", async () => {
    const sessions = makeRepo();
    const loaded = session();
    await sessions.save(loaded);
    await sessions.revoke({ workspaceId: WS, id: "s1", revokedAt: REVOKED });
    await sessions.save({ ...loaded, lastSeenAt: REVOKED, userAgent: "UA/2.0" });
    const stored = await sessions.findByTokenHash({ workspaceId: WS, tokenHash: "hash-s1" });
    assert.equal(stored?.revokedAt, REVOKED, "a stale whole-row save un-revoked the session");
    assert.equal(stored?.userAgent, "UA/2.0", "the other columns are still saved");
  });

  test("a save that carries its own revokedAt still revokes", async () => {
    const sessions = makeRepo();
    await sessions.save(session());
    await sessions.save(session({ revokedAt: REVOKED }));
    assert.equal((await sessions.findByTokenHash({ workspaceId: WS, tokenHash: "hash-s1" }))?.revokedAt, REVOKED);
  });
});
