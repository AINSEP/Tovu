import assert from "node:assert/strict";
import test from "node:test";

import type { ContentTypeFieldDef, ContentTypeRecord } from "#src/features/content-types/index";

import {
  SYSTEM_CONTENT_TYPES,
  entryPublicHref,
  humanizeFieldName,
  parseCollectionListConfig,
} from "../../public-list.js";

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
