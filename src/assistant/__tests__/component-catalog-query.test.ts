import assert from "node:assert/strict";
import test from "node:test";

import { buildComponentCatalogQuery } from "../component-catalog-query";

/**
 * @file Tests this module's own wiring — scoring/ranking over `ALL_MANIFESTS` and converting a
 * matched manifest's `propsSchema` to JSON Schema. Which manifests actually exist is
 * `@jini-ai/ui/interactive-ui`'s own contract, not re-asserted here; this only checks the query
 * built on top of it behaves correctly against the real, current manifest set.
 */

test("search finds the data-table providers by a capability-term match", () => {
  const catalog = buildComponentCatalogQuery();
  const hits = catalog.search("data table").map((hit) => hit.id);
  assert.ok(hits.includes("native.data-table"));
  assert.ok(hits.includes("shadcn.data-table"));
});

test("search returns an empty array, not an error, for no matches", () => {
  const catalog = buildComponentCatalogQuery();
  assert.deepEqual(catalog.search("nonexistent-keyword-xyz"), []);
});

test("search respects the limit argument", () => {
  const catalog = buildComponentCatalogQuery();
  const hits = catalog.search("data table", 1);
  assert.equal(hits.length, 1);
});

test("describe returns null for an unknown id", () => {
  const catalog = buildComponentCatalogQuery();
  assert.equal(catalog.describe("no.such.component"), null);
});

test("describe returns the full entry, including a JSON-Schema propsSchema, for a known id", () => {
  const catalog = buildComponentCatalogQuery();
  const entry = catalog.describe("native.data-table");
  assert.ok(entry);
  assert.equal(entry.id, "native.data-table");
  assert.equal(entry.provider, "native");
  assert.ok(entry.capabilities.includes("data-table"));
  // A JSON Schema object, not a live zod schema — the whole point of converting it here.
  assert.equal(typeof entry.propsSchema, "object");
  assert.ok(entry.propsSchema !== null);
});
