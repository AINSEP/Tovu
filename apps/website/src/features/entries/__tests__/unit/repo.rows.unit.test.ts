import assert from "node:assert/strict";
import test from "node:test";

import { toRecord, toRevisionRow, toRow } from "../../repo.rows.js";

test("revision rows retain delegated attribution and the complete non-empty state", () => {
  // F1.2/F4.3: dropping delegation or serializing {} must fail independently.
  const state = { id: "entry-a", workspaceId: "ws-a", type: "recipe", slug: "cake", status: "draft" as const, title: "Revised", bodyJson: null, fieldsJson: { servings: 4 }, publishedAt: null, createdAt: "2026-09-30T09:00:00Z", updatedAt: "2026-10-01T09:00:00Z", version: 2 };
  assert.deepEqual(toRevisionRow({ entryId: "entry-a", workspaceId: "ws-a", op: "update", stateJson: state, actorId: "agent", delegatedByWorkspaceId: "ws-owner", delegatedById: "owner", recordedAt: "2026-10-01T09:00:00Z" }), {
    entry_id: "entry-a", workspace_id: "ws-a", op: "update", state_json: '{"id":"entry-a","workspaceId":"ws-a","type":"recipe","slug":"cake","status":"draft","title":"Revised","bodyJson":null,"fieldsJson":{"servings":4},"publishedAt":null,"createdAt":"2026-09-30T09:00:00Z","updatedAt":"2026-10-01T09:00:00Z","version":2}', actor_id: "agent", delegated_by_workspace_id: "ws-owner", delegated_by_id: "owner", recorded_at: "2026-10-01T09:00:00Z",
  });
});

test("entry row mapping preserves JSON false and zero rather than treating them as absent", () => {
  const record = { id: "e", workspaceId: "ws", type: "recipe", slug: "cake", status: "draft" as const, title: "Cake", bodyJson: false, fieldsJson: { servings: 0 }, publishedAt: null, createdAt: "created", updatedAt: "updated", version: 8 };
  const row = { id: "e", workspace_id: "ws", type: "recipe", slug: "cake", status: "draft", title: "Cake", body_json: "false", fields_json: '{"servings":0}', published_at: null, created_at: "created", updated_at: "updated", version: 8 };
  assert.deepEqual(toRow(record), row);
  assert.deepEqual(toRecord({ ...row, deleted_at: null }), record);
  assert.equal(toRow({ ...record, bodyJson: null }).body_json, null);
  assert.equal(toRecord({ ...row, body_json: null, deleted_at: null }).bodyJson, null);
});
