import assert from "node:assert/strict";
import test from "node:test";

import { buildToolCatalogQuery } from "../tool-catalog-query.js";

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

/**
 * The fold/strip split. Keywords exist to be RANKED on, never to be READ — a tool's description is a
 * contract the model reasons about, so padding it with synonyms to fix search would trade one
 * problem for a worse one. `identity_user_create` is used below because it carries an entry in
 * `TOOL_SEARCH_KEYWORDS` while its authored description ("Creates a new human operator user.")
 * contains none of that vocabulary.
 */
test("search vocabulary makes a tool findable by a word its authored description never contains", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  // "invite" and "staff" appear nowhere in the authored description above.
  for (const term of ["invite", "staff", "account"]) {
    const hits = catalog.search(term, 10).map((hit) => hit.id);
    assert.ok(hits.includes("identity_user_create"), `expected identity_user_create to rank for "${term}"; got ${hits.join(", ") || "(none)"}`);
  }
});

test("no caller ever sees the folded vocabulary — describe and search both return the AUTHORED description", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  const authored = "Creates a new human operator user.";

  assert.equal(catalog.describe("identity_user_create")?.description, authored, "describe must return authored text, not indexed text");
  for (const hit of catalog.search("invite", 10)) {
    assert.doesNotMatch(hit.description, /also known as:/, `${hit.id}'s search hit leaked its search vocabulary`);
  }
});

test("a tool with no keyword entry is untouched, and the seam can disable folding entirely", () => {
  const withKeywords = buildToolCatalogQuery(fakeRegistry());
  const without = buildToolCatalogQuery(fakeRegistry(), { includeSearchKeywords: false });

  // `forms_update_definition` has no entry in TOOL_SEARCH_KEYWORDS — identical either way.
  assert.equal(withKeywords.describe("forms_update_definition")?.description, without.describe("forms_update_definition")?.description);

  // And with folding off, the keyword-bearing tool is no longer findable by its vocabulary — which
  // is what proves the earlier assertions are measuring the fold rather than a coincidence.
  assert.equal(without.search("invite", 10).length, 0);
});
