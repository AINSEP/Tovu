import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryMagicLinkTokenRepo,
  InMemoryMemberRepo,
  InMemoryMemberSessionRepo,
} from "../repo.memory.js";

const WORKSPACE_ID = "ws-1";

test("InMemoryMemberRepo.list paginates by id cursor within a workspace", async () => {
  const repo = new InMemoryMemberRepo([
    { id: "m-1", workspaceId: WORKSPACE_ID, email: "a@example.com", status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", version: 1 },
    { id: "m-2", workspaceId: WORKSPACE_ID, email: "b@example.com", status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", version: 1 },
    { id: "m-3", workspaceId: WORKSPACE_ID, email: "c@example.com", status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", version: 1 },
    { id: "m-1-other-ws", workspaceId: "ws-2", email: "d@example.com", status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", version: 1 },
  ]);

  const firstPage = await repo.list({ workspaceId: WORKSPACE_ID, limit: 2 });
  assert.deepEqual(firstPage.map((m) => m.id), ["m-1", "m-2"]);

  const secondPage = await repo.list({ workspaceId: WORKSPACE_ID, afterId: "m-2", limit: 2 });
  assert.deepEqual(secondPage.map((m) => m.id), ["m-3"]);

  const otherWorkspace = await repo.list({ workspaceId: "ws-2" });
  assert.deepEqual(otherWorkspace.map((m) => m.id), ["m-1-other-ws"]);
});

test("InMemoryMagicLinkTokenRepo.consume enforces single-use and rejects an unknown id", async () => {
  const repo = new InMemoryMagicLinkTokenRepo([
    {
      id: "token-1",
      workspaceId: WORKSPACE_ID,
      memberId: "member-1",
      tokenHash: "hash-1",
      purpose: "signin",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:15:00.000Z",
    },
  ]);

  await repo.consume({ workspaceId: WORKSPACE_ID, id: "token-1", consumedAt: "2026-01-01T00:05:00.000Z" });
  const consumed = await repo.findByTokenHash({ workspaceId: WORKSPACE_ID, tokenHash: "hash-1" });
  assert.ok(consumed!.consumedAt);

  await assert.rejects(() =>
    repo.consume({ workspaceId: WORKSPACE_ID, id: "token-1", consumedAt: "2026-01-01T00:06:00.000Z" })
  );

  await assert.rejects(() =>
    repo.consume({ workspaceId: WORKSPACE_ID, id: "no-such-token", consumedAt: "2026-01-01T00:06:00.000Z" })
  );
});

test("InMemoryMemberSessionRepo.revoke and revokeAllForMember only affect the targeted rows", async () => {
  const repo = new InMemoryMemberSessionRepo([
    { id: "session-1", workspaceId: WORKSPACE_ID, memberId: "member-1", tokenHash: "hash-a", createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2027-01-01T00:00:00.000Z" },
    { id: "session-2", workspaceId: WORKSPACE_ID, memberId: "member-1", tokenHash: "hash-b", createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2027-01-01T00:00:00.000Z" },
    { id: "session-3", workspaceId: WORKSPACE_ID, memberId: "member-2", tokenHash: "hash-c", createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2027-01-01T00:00:00.000Z" },
  ]);

  await repo.revoke({ workspaceId: WORKSPACE_ID, id: "session-1", revokedAt: "2026-02-01T00:00:00.000Z" });
  const sessionsForMember1 = await repo.listByMember({ workspaceId: WORKSPACE_ID, memberId: "member-1" });
  assert.equal(sessionsForMember1.find((s) => s.id === "session-1")!.revokedAt, "2026-02-01T00:00:00.000Z");
  assert.equal(sessionsForMember1.find((s) => s.id === "session-2")!.revokedAt, undefined);

  await repo.revokeAllForMember({ workspaceId: WORKSPACE_ID, memberId: "member-1", revokedAt: "2026-03-01T00:00:00.000Z" });
  const afterRevokeAll = await repo.listByMember({ workspaceId: WORKSPACE_ID, memberId: "member-1" });
  assert.ok(afterRevokeAll.every((s) => s.revokedAt));

  const otherMemberSessions = await repo.listByMember({ workspaceId: WORKSPACE_ID, memberId: "member-2" });
  assert.equal(otherMemberSessions[0].revokedAt, undefined, "revokeAllForMember must not touch other members' sessions");
});
