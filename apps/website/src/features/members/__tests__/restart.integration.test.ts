import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteMemberRepo, SqliteMemberSessionRepo } from "../repo.sqlite.js";
import { SqliteMemberSubscriptionRepo, SqliteMemberTierRepo } from "../repo.sqlite.js";
import { DefaultMemberAccessResolver } from "../access-resolver.js";

/**
 * @file ADR-046 Phase 1's own required production gate for the Members row: "Restart +
 * expiration + auth integration tests." Mirrors `core/commands/__tests__/
 * change-sets-restart.integration.test.ts`'s restart-survival pattern.
 */

test("SqliteMemberRepo + SqliteMemberSessionRepo: a member and its session survive a simulated process restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-members-restart-test-"));
  const dbPath = join(dir, "content.db");
  const handles: ReturnType<typeof openContentDb>[] = [];
  const tokenHash = createHash("sha256").update("restart-token").digest("hex");
  try {
    const workspaceId = "workspace-restart-test";

    // "First boot": create a member and a live session.
    const db1 = openContentDb(dbPath);
    handles.push(db1);
    const memberRepo1 = new SqliteMemberRepo(db1);
    const sessionRepo1 = new SqliteMemberSessionRepo(db1);

    await memberRepo1.save({
      id: "member-restart-1",
      workspaceId,
      email: "restart-test@example.com",
      status: "active",
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
      version: 1,
    });
    await sessionRepo1.save({
      id: "session-restart-1",
      workspaceId,
      memberId: "member-restart-1",
      tokenHash,
      createdAt: "2026-07-16T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    // "Restart": brand-new content.db handles against the SAME on-disk file — the in-memory
    // adapters this replaces would have lost both rows entirely.
    db1.$client.close();
    const db2 = openContentDb(dbPath);
    handles.push(db2);
    const memberRepo2 = new SqliteMemberRepo(db2);
    const sessionRepo2 = new SqliteMemberSessionRepo(db2);

    const member = await memberRepo2.findByEmail({ workspaceId, email: "restart-test@example.com" });
    assert.ok(member, "the member must survive a restart");
    assert.equal(member?.id, "member-restart-1");

    const session = await sessionRepo2.findByTokenHash({ workspaceId, tokenHash });
    assert.ok(session, "the session must survive a restart");
    assert.equal(session?.memberId, "member-restart-1");
    assert.equal(session?.revokedAt, undefined, "an unrevoked session must still read as unrevoked after a restart");
    const resolver = new DefaultMemberAccessResolver({ sessions: sessionRepo2, subscriptions: new SqliteMemberSubscriptionRepo(db2), tiers: new SqliteMemberTierRepo(db2) });
    assert.deepEqual(await resolver.resolveContext({ workspaceId, sessionToken: "restart-token", nowIso: "2098-12-31T23:59:59.999Z" }),
      { isAuthenticated: true, memberId: "member-restart-1", activeTierIds: [], isPaid: false });
    assert.deepEqual(await resolver.resolveContext({ workspaceId, sessionToken: "restart-token", nowIso: "2099-01-01T00:00:00.000Z" }),
      { isAuthenticated: false, activeTierIds: [], isPaid: false });

    // Revoke, then confirm a THIRD restart still reflects the revocation (auth integration).
    await sessionRepo2.revoke({ workspaceId, id: "session-restart-1", revokedAt: "2026-07-16T01:00:00.000Z" });

    db2.$client.close();
    const db3 = openContentDb(dbPath);
    handles.push(db3);
    const sessionRepo3 = new SqliteMemberSessionRepo(db3);
    const afterRevoke = await sessionRepo3.findByTokenHash({ workspaceId, tokenHash });
    assert.ok(afterRevoke?.revokedAt, "revocation must survive a restart (auth integration gate)");
  } finally {
    for (const db of handles) if (db.$client.open) db.$client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
