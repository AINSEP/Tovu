import assert from "node:assert/strict";
import test from "node:test";

import Ajv from "ajv";

import { buildTrashAgentToolCatalog, TRASH_TOOL_ENTITY_TYPES, trashToolEntityTypes } from "../agent-tools.js";
import type { TrashRegistry } from "../registry.js";

/**
 * @file Inline contract for the Trash listing/restoration catalog (Stryker lane L14: 60 %, AP5): the
 * per-call kind enum, entry-gate permission, limits and closed schemas, plus `trashToolEntityTypes`'
 * union/de-duplication. The handler-side per-kind restore permission is pinned elsewhere
 * (`tool-registrations.test.ts`); this pins only the declared floor.
 */

function stripDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDescriptions);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([k]) => k !== "description").map(([k, v]) => [k, stripDescriptions(v)]));
  }
  return value;
}

test("TRASH_TOOL_ENTITY_TYPES is the four phase-1 kinds, in order", () => {
  assert.deepEqual([...TRASH_TOOL_ENTITY_TYPES], ["post", "comment", "media", "redirect"]);
});

test("buildTrashAgentToolCatalog publishes exactly the kinds it is given, in the given order, in both schemas", () => {
  const kind = { type: "string", enum: ["form", "post", "menu"] };
  assert.deepEqual(stripDescriptions(buildTrashAgentToolCatalog(["form", "post", "menu"])), [
    { name: "trash_list_items", sideEffects: "none", authorization: { permission: "content.read" },
      inputSchema: { type: "object", additionalProperties: false, properties: {
        entityTypes: { type: "array", items: kind, minItems: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        cursor: { type: "string", minLength: 1 },
      } } },
    { name: "trash_restore_item", sideEffects: "mutates-durable-state", authorization: { permission: "content.read" },
      inputSchema: { type: "object", additionalProperties: false, required: ["entityType", "entityId"], properties: { entityType: kind, entityId: { type: "string", minLength: 1 } } } },
  ]);
});

test("trash schemas: limit 1..100, non-empty filter/cursor/id, enum-only kinds, no extra keys", () => {
  const ajv = new Ajv();
  const [list, restore] = buildTrashAgentToolCatalog(["post", "form"]).map((t) => ajv.compile(t.inputSchema!));
  assert.deepEqual([0, 1, 100, 101].map((limit) => list!({ limit })), [false, true, true, false]);
  assert.deepEqual(
    [{}, { entityTypes: ["form", "post"] }, { entityTypes: [] }, { entityTypes: ["user"] }, { cursor: "" }, { cursor: "c" }, { extra: 1 }].map((i) => list!(i)),
    [true, true, false, false, false, true, false],
  );
  assert.deepEqual(
    [{ entityType: "form", entityId: "f" }, { entityType: "user", entityId: "u" }, { entityType: "form", entityId: "" }, { entityType: "form" }, { entityType: "form", entityId: "f", x: 1 }].map((i) => restore!(i)),
    [true, false, false, false, false],
  );
});

test("trashToolEntityTypes: bespoke kinds first, then registry kinds, de-duplicated; no registry → the bespoke kinds", () => {
  // The source doc comment says "the bespoke six"; `theme` was added since, so it is seven today.
  const bespoke = ["post", "comment", "media", "redirect", "plugin", "theme", "user"];
  assert.deepEqual(trashToolEntityTypes(), bespoke);
  assert.deepEqual(trashToolEntityTypes(new Map() as TrashRegistry), bespoke);
  const registry = new Map([["form", {}], ["post", {}], ["menu", {}]]) as unknown as TrashRegistry;
  assert.deepEqual(trashToolEntityTypes(registry), [...bespoke, "form", "menu"]);
});
