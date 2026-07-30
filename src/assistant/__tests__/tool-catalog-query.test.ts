import assert from "node:assert/strict";
import test from "node:test";

import { buildToolCatalogQuery } from "../tool-catalog-query";

const DESCRIPTORS = [
  { id: "forms_create_definition", description: "Creates a new form definition from a name, a URL slug, and fields.", inputSchema: { type: "object" } },
  { id: "forms_update_definition", description: "Updates an existing form definition's name, field list, or notify config." },
  { id: "identity_user_create", description: "Creates a new human operator user." },
];

function fakeRegistry() {
  return { list: () => DESCRIPTORS };
}

test("search matches by id and by description, case-insensitively", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  const hits = catalog.search("FORM").map((hit) => hit.id);
  assert.deepEqual(hits.sort(), ["forms_create_definition", "forms_update_definition"]);
});

test("search scores a hit higher when more query terms match", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  const hits = catalog.search("form create");
  assert.equal(hits[0]?.id, "forms_create_definition", "the tool matching both terms must rank first");
  assert.ok((hits[0]?.score ?? 0) > (hits[1]?.score ?? 0));
});

test("search returns an empty array, not an error, for no matches", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  assert.deepEqual(catalog.search("nonexistent-keyword-xyz"), []);
});

test("search respects the limit parameter", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  assert.equal(catalog.search("a", 1).length, 1);
});

test("search derives 'source' from the id's domain prefix", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  const hit = catalog.search("identity")[0];
  assert.equal(hit?.source, "identity");
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

test("describe defaults description to an empty string when the descriptor omits one", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  const entry = catalog.describe("identity_user_create");
  assert.equal(entry?.description, "Creates a new human operator user.");
});
