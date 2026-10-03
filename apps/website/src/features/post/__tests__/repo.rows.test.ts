import assert from "node:assert/strict";
import test from "node:test";
import { toRevisionRow } from "../repo.rows.js";
import type { PostRecord } from "../post.js";

const state: PostRecord = { id: "p1", workspaceId: "ws", title: "Café", slug: "cafe", bodyJson: { type: "doc", content: [] },
  bodyFormat: "doc", bodyHtml: null, status: "published", kind: "post", updatedAt: "2026-10-01T12:00:00.000Z", version: 7 };
const text = '{"id":"p1","workspaceId":"ws","title":"Café","slug":"cafe","bodyJson":{"type":"doc","content":[]},"bodyFormat":"doc","bodyHtml":null,"status":"published","kind":"post","updatedAt":"2026-10-01T12:00:00.000Z","version":7}';

test("revision hash is SHA-256 of the exact compact UTF-8 JSON persisted, with delegation and restore attribution", () => {
  // F1.2/F4.1: literal oracle computed independently from the documented bytes, not a nonempty hash.
  assert.deepEqual(toRevisionRow({ postId: "p1", workspaceId: "ws", seq: 8, op: "restore", stateJson: state,
    actorId: "agent", delegatedByWorkspaceId: "delegator-ws", delegatedById: "human", restoredFrom: "revision-3", recordedAt: "2026-10-01T13:00:00.000Z" }, "revision-8"), {
    id: "revision-8", post_id: "p1", workspace_id: "ws", seq: 8, op: "restore", state_json: text,
    content_hash: "7cba7e85e6ced31f0687826260dd572d4749ed3386d7765f3c380011d41d2ba1", actor_id: "agent",
    delegated_by_workspace_id: "delegator-ws", delegated_by_id: "human", restored_from: "revision-3", recorded_at: "2026-10-01T13:00:00.000Z",
  });
});
test("ordinary revision writes NULL for every omitted delegation and restore marker", () => {
  const row = toRevisionRow({ postId: "p1", workspaceId: "ws", seq: 1, op: "create", stateJson: state, actorId: "human", recordedAt: "2026-10-01T13:00:00.000Z" }, "revision-1");
  assert.deepEqual([row.delegated_by_workspace_id, row.delegated_by_id, row.restored_from], [null, null, null]);
});
