import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";

/**
 * @file Characterization pin (design 02 step 5): the ordered key list of the in-memory root's
 * `routeDeps`, each with the kind of value it carries (function / promise / null / class name / typeof).
 * The 530-line literal is cut into ordered fragments that are spread back together; this pin fails if
 * a key is dropped, renamed, duplicated into another kind, or lands in a different position (a later
 * spread overriding an earlier one is only safe while the order is the literal's own). Regenerate with
 * `UPDATE_MEMORY_ROOT_SHAPE_PIN=1` only for a deliberate change to the root's surface.
 */

const { createRouteDeps } = await import("../app.js");

const FIXTURE = new URL("./fixtures/memory-root-route-deps-shape.snapshot.json", import.meta.url);
/** Environment-dependent values: the key is pinned, the kind is not. */
const KIND_FREE = new Set(["passkeyOrigin"]);

function kindOf(key: string, value: unknown): string {
  if (KIND_FREE.has(key)) return "*";
  if (value === null) return "null";
  if (value instanceof Promise) return "promise";
  if (typeof value === "object") return (value as object).constructor?.name ?? "object";
  return typeof value;
}

test("memory root: routeDeps keeps its ordered key list and value kinds", () => {
  const deps = createRouteDeps() as unknown as Record<string, unknown>;
  const shape = Object.keys(deps).map((key) => `${key}:${kindOf(key, deps[key])}`);
  if (process.env.UPDATE_MEMORY_ROOT_SHAPE_PIN === "1") writeFileSync(FIXTURE, `${JSON.stringify(shape, null, 2)}\n`);
  assert.deepEqual(shape, JSON.parse(readFileSync(FIXTURE, "utf8")));
});

test("memory root: two roots never share a mutable instance (every call builds its own)", () => {
  const first = createRouteDeps() as unknown as Record<string, unknown>;
  const second = createRouteDeps() as unknown as Record<string, unknown>;
  for (const key of ["postRepo", "settingsRepo", "outbox", "bus", "trash", "mediaRepo", "memberRepo", "formDefinitionRepo", "pluginHost"]) {
    assert.notEqual(first[key], second[key], `${key} must be per-root`);
  }
});
