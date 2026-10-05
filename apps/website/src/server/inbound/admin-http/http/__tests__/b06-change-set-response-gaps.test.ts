import assert from "node:assert/strict";
import test from "node:test";

import { toChangeSetHeaderResponse, toChangeSetItemResponse } from "../change-sets.js";

// F4.1/F4.3/F6.2: independent literals distinguish absent values from populated ones.
// Author Checklist: each test calls the real pure projection, has fresh state and unconditional
// assertions; persistence, timing, fakes and retries do not apply. Name mutations below instead
// of editing source, which this batch expressly prohibits.
test("unapplied change-set headers expose absent actor, intent and lifecycle dates as null", () => {
  // Mutation rejected: remove any nullable field's `?? null` fallback.
  assert.deepEqual(toChangeSetHeaderResponse({
    id: "proposed-3", workspaceId: "ws-8", status: "proposed", summary: "Create banner",
    createdAt: "2026-10-01T01:02:03Z", idempotencyKey: "private-request-key",
  }), {
    id: "proposed-3", workspaceId: "ws-8", actorId: null, status: "proposed", summary: "Create banner",
    intentRef: null, createdAt: "2026-10-01T01:02:03Z", appliedAt: null, revertedAt: null,
  });
});

test("reverted change-set headers retain the actor, intent and distinct lifecycle dates", () => {
  // Mutation rejected: always serialize revertedAt as null, or use appliedAt in its place.
  assert.deepEqual(toChangeSetHeaderResponse({
    id: "reverted-4", workspaceId: "ws-8", actorId: "editor-2", status: "reverted",
    summary: "Undo banner", intentRef: "intent-6", createdAt: "2026-10-01T01:02:03Z",
    appliedAt: "2026-10-02T02:03:04Z", revertedAt: "2026-10-03T03:04:05Z",
  }), {
    id: "reverted-4", workspaceId: "ws-8", actorId: "editor-2", status: "reverted",
    summary: "Undo banner", intentRef: "intent-6", createdAt: "2026-10-01T01:02:03Z",
    appliedAt: "2026-10-02T02:03:04Z", revertedAt: "2026-10-03T03:04:05Z",
  });
});

test("change-set items preserve a zero entity version and hide inverse content while signaling revertibility", () => {
  // Mutations rejected: replace `?? null` with `|| null`, or spread the item into the response.
  const item = {
    id: "item-5", changeSetId: "reverted-4", entityType: "widget", entityId: "banner-9",
    operation: "update" as const, inversePayload: { privateMarkup: "<p>Original</p>" },
    entityVersionAtApply: 0, position: 7,
  };
  assert.deepEqual(toChangeSetItemResponse(item), {
    id: "item-5", entityType: "widget", entityId: "banner-9", operation: "update",
    revertible: true, entityVersionAtApply: 0, position: 7,
  });
  assert.deepEqual(toChangeSetItemResponse({ ...item, inversePayload: undefined, entityVersionAtApply: undefined }), {
    id: "item-5", entityType: "widget", entityId: "banner-9", operation: "update",
    revertible: false, entityVersionAtApply: null, position: 7,
  });
});
