import assert from "node:assert/strict";
import test from "node:test";
import { isTrashedRecord, notTrashed } from "../not-trashed.js";
import { buildTrashRegistry } from "../registry.js";

// F4.3: non-default timestamps and independent status distinguish marker kinds.
test("flat records use the registry's camelCase timestamp or exact status marker", () => {
  const registry = buildTrashRegistry();
  assert.equal(isTrashedRecord({ entityType: "form", record: { deletedAt: "2026-09-29T00:00:00Z" } }, { registry }), true);
  assert.equal(isTrashedRecord({ entityType: "form", record: { deletedAt: null, status: "trash" } }, { registry }), false);
  assert.equal(isTrashedRecord({ entityType: "form", record: {} }, { registry }), false);
  assert.equal(isTrashedRecord({ entityType: "menu", record: { status: "trash", deletedAt: null } }, { registry }), true);
  assert.equal(isTrashedRecord({ entityType: "menu", record: { status: "draft", deletedAt: "timestamp" } }, { registry }), false);
  assert.equal(isTrashedRecord({ entityType: "term", record: { status: "active", taxonomyId: "trashed-parent" } }, { registry }), false, "flat records deliberately report their own marker only");
});

test("an unregistered entity is a composition error for both SQL conditions and flat records", () => {
  const registry = new Map();
  const expected = { message: "trash: 'form' has no TRASHABLE registry entry — register it in registry.ts first." };
  assert.throws(() => notTrashed({ entityType: "form" }, { registry }), expected);
  assert.throws(() => isTrashedRecord({ entityType: "form", record: {} }, { registry }), expected);
});
