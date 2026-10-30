import assert from "node:assert/strict";
import test from "node:test";

import type { ContentTypeFieldDef, ContentTypeRecord } from "#src/features/content-types/index";

import { SYSTEM_CONTENT_TYPES } from "../../../../contracts/core/system-content-types.js";
import { entryPublicHref, humanizeFieldName, isCollectionListLayout, parseCollectionListConfig } from "../../public-list.js";

/**
 * @file Collections plan C1 — unit tier for the collection-list embed config parser, the system
 * content-type list, and the (currently seamed-off, D1) entry public href helper. No I/O: every
 * case here is a pure function over an in-memory `ContentTypeRecord` fixture.
 */

function field(name: string, kind: ContentTypeFieldDef["kind"]): ContentTypeFieldDef {
  return { name, kind, required: false, queryable: false };
}

const RECIPE_CONTENT_TYPE: ContentTypeRecord = {
  workspaceId: "ws-1",
  key: "recipe",
  label: "Recipe",
  status: "active",
  version: 1,
  fields: [
    field("prep_time", "integer"),
    field("serves", "integer"),
    field("vegetarian", "boolean"),
    field("published_note", "text"),
    field("author", "relation"),
    field("extra", "json"),
  ],
};

const TOMBSTONED_CONTENT_TYPE: ContentTypeRecord = {
  ...RECIPE_CONTENT_TYPE,
  key: "old_recipe",
  tombstonedAt: "2026-01-01T00:00:00.000Z",
};

function widgetContentType(key: string): ContentTypeRecord {
  return { ...RECIPE_CONTENT_TYPE, key };
}

// --- defaults ---------------------------------------------------------

test("parseCollectionListConfig: empty config uses every documented default", () => {
  const result = parseCollectionListConfig({}, RECIPE_CONTENT_TYPE);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.query.type, "recipe");
  assert.deepEqual(result.query.where, []);
  assert.deepEqual(result.query.sort, { by: "published", dir: "desc" });
  assert.equal(result.query.limit, 6);

  assert.equal(result.display.columns, 3);
  assert.equal(result.display.layout, "cards");
  assert.deepEqual(
    result.display.fields.map((f) => f.name),
    ["prep_time", "serves", "vegetarian", "published_note"],
    "relation/json fields are never shown by default, and declared order is preserved",
  );
});

// --- clamps -------------------------------------------------------------

test("parseCollectionListConfig: limit clamps into [1, 24], non-number falls back to the default", () => {
  const tooHigh = parseCollectionListConfig({ limit: 999 }, RECIPE_CONTENT_TYPE);
  const tooLow = parseCollectionListConfig({ limit: 0 }, RECIPE_CONTENT_TYPE);
  const negative = parseCollectionListConfig({ limit: -5 }, RECIPE_CONTENT_TYPE);
  const fractional = parseCollectionListConfig({ limit: 12.7 }, RECIPE_CONTENT_TYPE);
  const notANumber = parseCollectionListConfig({ limit: "lots" }, RECIPE_CONTENT_TYPE);

  assert.equal(tooHigh.ok && tooHigh.query.limit, 24);
  assert.equal(tooLow.ok && tooLow.query.limit, 1);
  assert.equal(negative.ok && negative.query.limit, 1);
  assert.equal(fractional.ok && fractional.query.limit, 12);
  assert.equal(notANumber.ok && notANumber.query.limit, 6);
});

test("parseCollectionListConfig: columns clamps into [1, 6], non-number falls back to the default", () => {
  const tooHigh = parseCollectionListConfig({ columns: 40 }, RECIPE_CONTENT_TYPE);
  const tooLow = parseCollectionListConfig({ columns: 0 }, RECIPE_CONTENT_TYPE);
  const notANumber = parseCollectionListConfig({ columns: "wide" }, RECIPE_CONTENT_TYPE);

  assert.equal(tooHigh.ok && tooHigh.display.columns, 6);
  assert.equal(tooLow.ok && tooLow.display.columns, 1);
  assert.equal(notANumber.ok && notANumber.display.columns, 3);
});

test("parseCollectionListConfig: layout accepts only 'cards'/'list'/'accordion'/'carousel' (AW-7), else falls back to 'cards'", () => {
  for (const layout of ["list", "accordion", "carousel"]) {
    const parsed = parseCollectionListConfig({ layout }, RECIPE_CONTENT_TYPE);
    assert.equal(parsed.ok && parsed.display.layout, layout);
  }
  const unknown = parseCollectionListConfig({ layout: "grid-of-doom" }, RECIPE_CONTENT_TYPE);
  assert.equal(unknown.ok && unknown.display.layout, "cards");
});

test("parseCollectionListConfig: structuredData passes only 'faq-page' (AW-7); anything else is absent, never a guess", () => {
  const faq = parseCollectionListConfig({ layout: "accordion", structuredData: "faq-page" }, RECIPE_CONTENT_TYPE);
  assert.equal(faq.ok && faq.display.structuredData, "faq-page");
  for (const structuredData of [undefined, "howto", 1]) {
    const parsed = parseCollectionListConfig({ structuredData }, RECIPE_CONTENT_TYPE);
    assert.ok(parsed.ok);
    if (parsed.ok) assert.equal("structuredData" in parsed.display, false);
  }
});

// --- sort grammar ---------------------------------------------------------

test("parseCollectionListConfig: sort keywords map to the documented (by, dir) pairs", () => {
  const cases: Array<[string, { by: unknown; dir: "asc" | "desc" }]> = [
    ["newest", { by: "published", dir: "desc" }],
    ["oldest", { by: "published", dir: "asc" }],
    ["updated", { by: "updated", dir: "desc" }],
    ["title", { by: "title", dir: "asc" }],
    ["-title", { by: "title", dir: "desc" }],
    ["-updated", { by: "updated", dir: "asc" }],
  ];
  for (const [sort, expected] of cases) {
    const result = parseCollectionListConfig({ sort }, RECIPE_CONTENT_TYPE);
    assert.equal(result.ok, true, `sort="${sort}" should be accepted`);
    if (result.ok) assert.deepEqual(result.query.sort, expected);
  }
});

test("parseCollectionListConfig: '-<field>' sorts by that field, descending", () => {
  const result = parseCollectionListConfig({ sort: "-serves" }, RECIPE_CONTENT_TYPE);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.query.sort, { by: { field: "serves" }, dir: "desc" });
});

test("parseCollectionListConfig: a bare '<field>' sorts by that field, ascending", () => {
  const result = parseCollectionListConfig({ sort: "prep_time" }, RECIPE_CONTENT_TYPE);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.query.sort, { by: { field: "prep_time" }, dir: "asc" });
});

// --- widget alias (limitKey / defaultSort) ---------------------------------

test("parseCollectionListConfig: the widget's maxItems/defaultSort aliases override the marker defaults", () => {
  const result = parseCollectionListConfig(
    { maxItems: 10 },
    RECIPE_CONTENT_TYPE,
    { limitKey: "maxItems", defaultSort: "updated" },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.query.limit, 10);
  assert.deepEqual(result.query.sort, { by: "updated", dir: "desc" });
});

// --- where clause -----------------------------------------------------------

test("parseCollectionListConfig: where accepts equality on known fields with scalar values", () => {
  const result = parseCollectionListConfig(
    { where: { vegetarian: true, serves: 4 } },
    RECIPE_CONTENT_TYPE,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.query.where, [
      { field: "vegetarian", value: true },
      { field: "serves", value: 4 },
    ]);
  }
});

// --- rejections -----------------------------------------------------------

test("parseCollectionListConfig: rejects an unknown field in where", () => {
  const result = parseCollectionListConfig({ where: { nope: 1 } }, RECIPE_CONTENT_TYPE);
  assert.equal(result.ok, false);
  assert.deepEqual(result, { ok: false, reason: "unknown field in where: \"nope\"" });
});

test("parseCollectionListConfig: rejects an unknown field in sort", () => {
  const result = parseCollectionListConfig({ sort: "nonexistent_field" }, RECIPE_CONTENT_TYPE);
  assert.equal(result.ok, false);
  assert.deepEqual(result, { ok: false, reason: "unknown field in sort: \"nonexistent_field\"" });
});

test("parseCollectionListConfig: rejects an unknown field in fields", () => {
  const result = parseCollectionListConfig({ fields: ["nonexistent_field"] }, RECIPE_CONTENT_TYPE);
  assert.equal(result.ok, false);
  assert.deepEqual(result, { ok: false, reason: "unknown field in fields: \"nonexistent_field\"" });
});

test("parseCollectionListConfig: rejects a non-scalar where value", () => {
  const result = parseCollectionListConfig(
    { where: { vegetarian: { nested: true } } },
    RECIPE_CONTENT_TYPE,
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result, { ok: false, reason: "non-scalar value for where.vegetarian" });
});

test("parseCollectionListConfig: rejects a where value that is an array", () => {
  const result = parseCollectionListConfig({ where: { serves: [4] } }, RECIPE_CONTENT_TYPE);
  assert.equal(result.ok, false);
  assert.deepEqual(result, { ok: false, reason: "non-scalar value for where.serves" });
});

test("parseCollectionListConfig: rejects every system content type, never returning an unfiltered query", () => {
  for (const key of new Set([...SYSTEM_CONTENT_TYPES, "widget", "widget_area", "menu"])) {
    assert.ok(SYSTEM_CONTENT_TYPES.includes(key), `required system type "${key}" is listed`);
    const result = parseCollectionListConfig({}, widgetContentType(key));
    assert.equal(result.ok, false, `system type "${key}" must be rejected`);
    assert.deepEqual(result, { ok: false, reason: `system content type: "${key}"` });
  }
});

test("parseCollectionListConfig: rejects a tombstoned content type", () => {
  const result = parseCollectionListConfig({}, TOMBSTONED_CONTENT_TYPE);
  assert.equal(result.ok, false);
  assert.deepEqual(result, { ok: false, reason: "content type is tombstoned: \"old_recipe\"" });
});

// --- explicit fields list ---------------------------------------------------

test("parseCollectionListConfig: an explicit fields list overrides the declared-order default", () => {
  const result = parseCollectionListConfig(
    { fields: ["serves", "prep_time"] },
    RECIPE_CONTENT_TYPE,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.display.fields.map((f) => f.name), ["serves", "prep_time"]);
  }
});

// --- entryPublicHref seam (D1) ---------------------------------------------

test("entryPublicHref: always returns null in Phase 1 (D1 seam, filled by G1)", () => {
  assert.equal(entryPublicHref("recipe", "some-slug"), null);
  assert.equal(entryPublicHref("", ""), null);
});

// --- humanizeFieldName --------------------------------------------------

test("humanizeFieldName: converts snake_case field names into a capitalized label", () => {
  assert.equal(humanizeFieldName("docs_page"), "Docs page");
  assert.equal(humanizeFieldName("prep_time"), "Prep time");
  assert.equal(humanizeFieldName("serves"), "Serves");
  assert.equal(humanizeFieldName("vegetarian"), "Vegetarian");
});

test("parseCollectionListConfig: a where that is present but not a {field: value} object is rejected, never read as 'no filter'", () => {
  // The list-of-clauses shape an author (or agent) might copy from CollectionListQuery.where must not
  // silently turn a filtered list into an unfiltered one.
  const asClauseList = parseCollectionListConfig({ where: [{ field: "vegetarian", value: true }] }, RECIPE_CONTENT_TYPE);
  const asString = parseCollectionListConfig({ where: "vegetarian=true" }, RECIPE_CONTENT_TYPE);

  assert.deepEqual(asClauseList, { ok: false, reason: "where must be an object of {field: value} pairs" });
  assert.deepEqual(asString, { ok: false, reason: "where must be an object of {field: value} pairs" });
});

test("parseCollectionListConfig: a null where means no filter, like an absent one", () => {
  const result = parseCollectionListConfig({ where: null }, RECIPE_CONTENT_TYPE);

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.query.where, []);
});

test("non-object collection configs use the same complete defaults as an empty object", () => {
  const expected = parseCollectionListConfig({}, RECIPE_CONTENT_TYPE);
  for (const config of [undefined, null, [], "recipe", 42, false]) {
    assert.deepEqual(parseCollectionListConfig(config, RECIPE_CONTENT_TYPE), expected);
  }
});

test("non-finite limits and columns fall back instead of reaching the query", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    const parsed = parseCollectionListConfig({ limit: value, columns: value }, RECIPE_CONTENT_TYPE);
    assert.ok(parsed.ok);
    assert.equal(parsed.query.limit, 6);
    assert.equal(parsed.display.columns, 3);
  }
});

test("empty and non-string sorts use the caller default while an authored sort wins", () => {
  for (const sort of ["", null, 1]) {
    const parsed = parseCollectionListConfig({ sort }, RECIPE_CONTENT_TYPE, { defaultSort: "title" });
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.query.sort, { by: "title", dir: "asc" });
  }
  const authored = parseCollectionListConfig({ sort: "oldest", limit: 2, maxItems: 9 }, RECIPE_CONTENT_TYPE,
    { defaultSort: "updated", limitKey: "maxItems" });
  assert.ok(authored.ok);
  assert.deepEqual(authored.query.sort, { by: "published", dir: "asc" });
  assert.equal(authored.query.limit, 9);
});

test("a direction prefix without a sort field is refused", () => {
  assert.deepEqual(parseCollectionListConfig({ sort: "-" }, RECIPE_CONTENT_TYPE), {
    ok: false, reason: 'unknown field in sort: "-"',
  });
});

test("string equality values are preserved in collection filters", () => {
  const parsed = parseCollectionListConfig({ where: { published_note: "Ada's recipe" } }, RECIPE_CONTENT_TYPE);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.query.where, [{ field: "published_note", value: "Ada's recipe" }]);
});

test("malformed fields fall back to displayable fields while an empty list deliberately displays none", () => {
  for (const fields of [null, "serves", ["serves", 1]]) {
    const parsed = parseCollectionListConfig({ fields }, RECIPE_CONTENT_TYPE);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.display.fields.map(f => f.name), ["prep_time", "serves", "vegetarian", "published_note"]);
  }
  const empty = parseCollectionListConfig({ fields: [] }, RECIPE_CONTENT_TYPE);
  assert.ok(empty.ok);
  assert.deepEqual(empty.display.fields, []);
  const explicit = parseCollectionListConfig({ fields: ["author", "extra"] }, RECIPE_CONTENT_TYPE);
  assert.ok(explicit.ok);
  assert.deepEqual(explicit.display.fields, RECIPE_CONTENT_TYPE.fields.slice(4));
});

test("a null tombstone leaves a content type available", () => {
  assert.deepEqual(parseCollectionListConfig({}, { ...RECIPE_CONTENT_TYPE, tombstonedAt: null }),
    parseCollectionListConfig({}, RECIPE_CONTENT_TYPE));
});

test("layout membership rejects values outside the closed presentation vocabulary", () => {
  for (const layout of ["cards", "list", "accordion", "carousel"]) assert.equal(isCollectionListLayout(layout), true);
  for (const layout of [undefined, null, 1, {}, "grid"]) assert.equal(isCollectionListLayout(layout), false);
});

test("field labels handle empty words, hyphens, camel case and whitespace", () => {
  assert.equal(humanizeFieldName(""), "");
  assert.equal(humanizeFieldName(" _-  "), "");
  assert.equal(humanizeFieldName("__prepTime-2Minutes  total__"), "Prep time 2 minutes total");
});

test("TW2 sort pins: keywords take precedence over identically named declared fields", () => {
  const contentType = { ...RECIPE_CONTENT_TYPE, fields: [
    ...RECIPE_CONTENT_TYPE.fields, field("newest", "text"), field("updated", "text"), field("title", "text"),
  ] };
  const cases = [
    ["newest", "published", "desc"], ["oldest", "published", "asc"],
    ["updated", "updated", "desc"], ["-updated", "updated", "asc"],
    ["title", "title", "asc"], ["-title", "title", "desc"],
  ] as const;
  for (const [sort, by, dir] of cases) {
    const parsed = parseCollectionListConfig({ sort }, contentType);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.query.sort, { by, dir });
  }
});

test("TW2 sort pins: declared fields preserve direction and invalid references preserve the authored error", () => {
  for (const [sort, dir] of [["serves", "asc"], ["-serves", "desc"]] as const) {
    const parsed = parseCollectionListConfig({ sort }, RECIPE_CONTENT_TYPE);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.query.sort, { by: { field: "serves" }, dir });
  }
  for (const sort of ["-", "unknown", "-unknown", "-oldest", "constructor", "toString", " serves "]) {
    assert.deepEqual(parseCollectionListConfig({ sort }, RECIPE_CONTENT_TYPE), {
      ok: false, reason: `unknown field in sort: "${sort}"`,
    });
  }
});

test("TW2 sort pins: missing, empty and non-string sorts honor defaults and authored strings are never trimmed", () => {
  for (const sort of [undefined, "", null, false, 0, [], {}]) {
    const marker = parseCollectionListConfig({ sort }, RECIPE_CONTENT_TYPE);
    assert.ok(marker.ok);
    assert.deepEqual(marker.query.sort, { by: "published", dir: "desc" });
    const widget = parseCollectionListConfig({ sort }, RECIPE_CONTENT_TYPE, { defaultSort: "updated" });
    assert.ok(widget.ok);
    assert.deepEqual(widget.query.sort, { by: "updated", dir: "desc" });
  }
  assert.deepEqual(parseCollectionListConfig({ sort: " " }, RECIPE_CONTENT_TYPE, { defaultSort: "title" }), {
    ok: false, reason: 'unknown field in sort: " "',
  });
  assert.deepEqual(parseCollectionListConfig({}, RECIPE_CONTENT_TYPE, { defaultSort: "" }), {
    ok: false, reason: 'unknown field in sort: ""',
  });
  const authored = parseCollectionListConfig({ sort: "-serves" }, RECIPE_CONTENT_TYPE, { defaultSort: "unknown" });
  assert.ok(authored.ok);
  assert.deepEqual(authored.query.sort, { by: { field: "serves" }, dir: "desc" });
});

test("TW2 parser pins: rejection precedence remains system, tombstone, where, sort, fields", () => {
  const invalid = { where: { nope: 1 }, sort: "unknown", fields: ["missing"] };
  assert.deepEqual(parseCollectionListConfig(invalid, { ...TOMBSTONED_CONTENT_TYPE, key: "widget" }), {
    ok: false, reason: 'system content type: "widget"',
  });
  assert.deepEqual(parseCollectionListConfig(invalid, TOMBSTONED_CONTENT_TYPE), {
    ok: false, reason: 'content type is tombstoned: "old_recipe"',
  });
  assert.deepEqual(parseCollectionListConfig(invalid, RECIPE_CONTENT_TYPE), {
    ok: false, reason: 'unknown field in where: "nope"',
  });
  assert.deepEqual(parseCollectionListConfig({ ...invalid, where: null }, RECIPE_CONTENT_TYPE), {
    ok: false, reason: 'unknown field in sort: "unknown"',
  });
  assert.deepEqual(parseCollectionListConfig({ ...invalid, where: null, sort: "newest" }, RECIPE_CONTENT_TYPE), {
    ok: false, reason: 'unknown field in fields: "missing"',
  });
});
