import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryExternalMcpToolApprovalRepo, createInMemoryConversationToolApprovalStore,
  toJiniToolApprovalRepo, toJiniConversationApprovalStore } from "../../external-mcp-tool-approval-adapters.js";

// PARITY: identical remote keys in separate workspaces must never share an approval.
test("workspace adapters keep partitions and host record shape exact", async () => {
  const repo = new InMemoryExternalMcpToolApprovalRepo();
  const record = { workspaceId: "workspace-a", serverId: "service", toolName: "send", fingerprint: "a",
    grantedByPrincipalId: "person", grantedAt: "2026-01-01T00:00:00.000Z" };
  await repo.upsert(record);
  await repo.upsert({ ...record, workspaceId: "workspace-b", fingerprint: "b" });
  const scoped = toJiniToolApprovalRepo({ repo, workspaceId: "workspace-a" });
  // A shared caller's options cannot move a workspace-bound SQL adapter into another partition.
  assert.deepEqual(await scoped.find({ serverId: "service", toolName: "send" }, { scope: "workspace-b" }), record);
  assert.deepEqual(await repo.listByWorkspaceId("workspace-a"), [record]);
  await scoped.delete({ serverId: "service", toolName: "send" });
  assert.equal(await scoped.find({ serverId: "service", toolName: "send" }), null);
  assert.equal((await repo.find({ workspaceId: "workspace-b", serverId: "service", toolName: "send" }))?.fingerprint, "b");
});

// PARITY: adapting the SQL grant ABI preserves principal/conversation/fingerprint isolation.
test("conversation adapters keep grants bound to the person and chat", async () => {
  const host = createInMemoryConversationToolApprovalStore();
  const store = toJiniConversationApprovalStore({ store: host });
  const key = { conversationId: "chat-a", principalId: "person", connectionId: "service", toolName: "send", fingerprint: "v2" };
  await store.grant({ key, grantedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(await host.has(key), true);
  for (const changed of [{ ...key, principalId: "other" }, { ...key, conversationId: "chat-b" }, { ...key, fingerprint: "drifted" }]) {
    assert.equal(await store.has(changed), false);
  }
});
