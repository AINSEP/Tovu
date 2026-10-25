import assert from "node:assert/strict";
import test from "node:test";

import Ajv from "ajv";

import { pagesAgentToolCatalog } from "../agent-tools.js";

/**
 * @file Inline contract for the pages agent-tool catalog (Stryker lane L14: 34.1 %, declarative
 * survivors — AP5): name, side effect, permission and input schema per tool (descriptions stripped),
 * then one good input and an extra-key input per schema.
 */

function stripDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDescriptions);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([k]) => k !== "description").map(([k, v]) => [k, stripDescriptions(v)]));
  }
  return value;
}

const ID = { type: "string", minLength: 1 };
const VERSION = { type: "integer", minimum: 0 };
const EDIT = { permission: "pages.edit_html" };

test("pages catalog matches the inline contract, in order", () => {
  assert.deepEqual(stripDescriptions(pagesAgentToolCatalog), [
    { name: "pages_read_html", sideEffects: "none", authorization: { permission: "content.read" },
      inputSchema: { type: "object", additionalProperties: false, properties: { id: ID, slug: ID, regionId: ID } } },
    { name: "pages_write_html", sideEffects: "mutates-durable-state", authorization: EDIT,
      inputSchema: { type: "object", additionalProperties: false, required: ["id", "html"], properties: { id: ID, html: { type: "string" }, expectedVersion: VERSION } } },
    { name: "pages_write_region", sideEffects: "mutates-durable-state", authorization: EDIT,
      inputSchema: { type: "object", additionalProperties: false, required: ["id", "regionId", "html"], properties: { id: ID, regionId: ID, html: { type: "string" }, expectedVersion: VERSION } } },
    { name: "pages_move_region", sideEffects: "mutates-durable-state", authorization: EDIT,
      inputSchema: { type: "object", additionalProperties: false, required: ["id", "regionId"], properties: { id: ID, regionId: ID, before: ID, after: ID, expectedVersion: VERSION } } },
  ]);
  for (const tool of pagesAgentToolCatalog) assert.ok(tool.description.trim().length > 20, tool.name);
});

test("pages schemas accept a good input, refuse an extra key, an empty id and a negative/non-integer version", () => {
  const ajv = new Ajv();
  const good: Record<string, Record<string, unknown>> = {
    pages_read_html: { slug: "about" },
    pages_write_html: { id: "p1", html: "", expectedVersion: 0 },
    pages_write_region: { id: "p1", regionId: "hero", html: "<p>x</p>" },
    pages_move_region: { id: "p1", regionId: "hero", before: "footer" },
  };
  assert.deepEqual(Object.keys(good), pagesAgentToolCatalog.map((t) => t.name));
  for (const tool of pagesAgentToolCatalog) {
    const validate = ajv.compile(tool.inputSchema!);
    assert.equal(validate(good[tool.name]), true, `${tool.name}: ${JSON.stringify(validate.errors)}`);
    assert.equal(validate({ ...good[tool.name], extra: 1 }), false, tool.name);
  }
  const write = ajv.compile(pagesAgentToolCatalog[1]!.inputSchema!);
  assert.deepEqual(
    [{ id: "", html: "" }, { id: "p", html: "", expectedVersion: -1 }, { id: "p", html: "", expectedVersion: 1.5 }, { id: "p" }, { html: "" }].map((i) => write(i)),
    [false, false, false, false, false],
  );
});
