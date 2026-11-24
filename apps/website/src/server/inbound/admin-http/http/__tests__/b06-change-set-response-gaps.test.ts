import assert from "node:assert/strict";
import test from "node:test";

import { toChangeSetView } from "@jini-ai/cms/change-sets/tool-registrations";

// F4.1/F4.3/F6.2: independent literals distinguish absent values from populated ones.
// Author Checklist: each test calls the real pure projection, has fresh state and unconditional
// assertions; persistence, timing, fakes and retries do not apply. Name mutations below instead
// of editing source, which this batch expressly prohibits.
test("unapplied change-set headers expose absent actor, intent and lifecycle dates as null", () => {
  // Mutation rejected: remove any nullable field's `?? null` fallback.
  assert.deepEqual(toChangeSetView({ changeSet: {
    id: "proposed-3", workspaceId: "ws-8", status: "proposed", summary: "Create banner",
    createdAt: "2026-10-01T01:02:03Z", idempotencyKey: "private-request-key",
  } }), {
    id: "proposed-3", workspaceId: "ws-8", actorId: null, status: "proposed", summary: "Create banner",
    intentRef: null, createdAt: "2026-10-01T01:02:03Z", appliedAt: null, revertedAt: null,
  });
});

test("reverted change-set headers retain the actor, intent and distinct lifecycle dates", () => {
  // Mutation rejected: always serialize revertedAt as null, or use appliedAt in its place.
  assert.deepEqual(toChangeSetView({ changeSet: {
    id: "reverted-4", workspaceId: "ws-8", actorId: "editor-2", status: "reverted",
    summary: "Undo banner", intentRef: "intent-6", createdAt: "2026-10-01T01:02:03Z",
    appliedAt: "2026-10-02T02:03:04Z", revertedAt: "2026-10-03T03:04:05Z",
  } }), {
    id: "reverted-4", workspaceId: "ws-8", actorId: "editor-2", status: "reverted",
    summary: "Undo banner", intentRef: "intent-6", createdAt: "2026-10-01T01:02:03Z",
    appliedAt: "2026-10-02T02:03:04Z", revertedAt: "2026-10-03T03:04:05Z",
  });
});
