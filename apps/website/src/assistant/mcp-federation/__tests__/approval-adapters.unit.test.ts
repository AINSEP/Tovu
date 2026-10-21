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

test("the workspace adapter's upsert and listByScope stay inside the bound workspace", async () => {
  const repo = new InMemoryExternalMcpToolApprovalRepo();
  const scoped = toJiniToolApprovalRepo({ repo, workspaceId: "workspace-a" });
  const shared = { serverId: "service", toolName: "send", fingerprint: "a", grantedByPrincipalId: "person", grantedAt: "2026-01-01T00:00:00.000Z" };
  await scoped.upsert(shared as Parameters<typeof scoped.upsert>[0]);
  await repo.upsert({ ...shared, workspaceId: "workspace-b", toolName: "other" });
  assert.deepEqual(await scoped.listByScope({}), [{ ...shared, workspaceId: "workspace-a" }]);
});

test("the conversation adapter forwards identity grants only when the host store supports them", async () => {
  const host = createInMemoryConversationToolApprovalStore();
  const withIdentity = toJiniConversationApprovalStore({ store: host });
  const key = { conversationId: "chat-a", principalId: "person", connectionId: "service", toolName: "send", fingerprint: "v1" };
  const { conversationId: _chat, ...identity } = key;
  assert.equal(typeof withIdentity.hasIdentity, "function");
  assert.equal(await withIdentity.hasIdentity!(identity), false);
  await withIdentity.grant({ key, grantedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(await withIdentity.hasIdentity!(identity), await host.hasIdentity!(identity));

  // A host store with no identity grants yields an adapter with no hasIdentity at all, not a stub.
  const withoutIdentity = toJiniConversationApprovalStore({ store: { has: host.has, grant: host.grant } });
  assert.equal(Object.hasOwn(withoutIdentity, "hasIdentity"), false);
  assert.equal(await withoutIdentity.has(key), true);
});
