import assert from "node:assert/strict";
import test from "node:test";

import { buildToolCatalogQuery } from "../tool-catalog-query";

/**
 * @file Tests this module's OWN contract — seeding a `ToolCatalogQuery` from a `ToolRegistry`-shaped
 * input and delegating to `@jini-ai/sqlite`'s `searchToolCatalog`/`getToolCatalogEntry`. Ranking
 * internals (BM25 scoring, tie-breaking, FTS5 tokenization) are `@jini-ai/sqlite`'s own tested
 * contract (`packages/sqlite/src/db/tool-catalog/__tests__/tool-catalog.test.ts`) and are not
 * re-asserted here — this file only checks that the wiring between the two is correct.
 */

const DESCRIPTORS = [
  { id: "forms_create_definition", description: "Creates a new form definition from a name, a URL slug, and fields.", inputSchema: { type: "object" } },
  { id: "forms_update_definition", description: "Updates an existing form definition's name, field list, or notify config." },
  { id: "identity_user_create", description: "Creates a new human operator user." },
];

function fakeRegistry() {
  return { list: () => DESCRIPTORS };
}

test("search finds a tool by an id-term match", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  const hits = catalog.search("form").map((hit) => hit.id);
  assert.deepEqual(hits.sort(), ["forms_create_definition", "forms_update_definition"]);
});

test("search ranks a tool matching more query terms above one matching fewer", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  const hits = catalog.search("form create");
  assert.equal(hits[0]?.id, "forms_create_definition", "the tool matching both terms must rank first");
});

test("search returns an empty array, not an error, for no matches", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  assert.deepEqual(catalog.search("nonexistent-keyword-xyz"), []);
});

test("search respects the limit parameter", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  assert.ok(catalog.search("a", 1).length <= 1);
});

test("search derives 'source' from the id's domain prefix", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  const hit = catalog.search("identity")[0];
  assert.equal(hit?.source, "identity");
});

test("every hit carries a positive score", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  for (const hit of catalog.search("form create user")) assert.ok(hit.score > 0);
});

test("describe returns the full entry including inputSchema for a known id", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  const entry = catalog.describe("forms_create_definition");
  assert.ok(entry);
  assert.equal(entry.id, "forms_create_definition");
  assert.deepEqual(entry.inputSchema, { type: "object" });
  assert.equal(entry.source, "forms");
});

test("describe returns null, not throws, for an unknown id", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  assert.equal(catalog.describe("nonexistent_tool"), null);
});

test("describe omits inputSchema for a descriptor that declared none", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  const entry = catalog.describe("identity_user_create");
  assert.ok(entry);
  assert.equal("inputSchema" in entry, false);
  assert.equal(entry.description, "Creates a new human operator user.");
});

test("an empty registry seeds an empty, non-throwing catalog", () => {
  const catalog = buildToolCatalogQuery({ list: () => [] });
  assert.deepEqual(catalog.search("anything"), []);
  assert.equal(catalog.describe("anything"), null);
});
