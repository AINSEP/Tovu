import assert from "node:assert/strict";
import test from "node:test";

import { ALL_MANIFESTS } from "@jini-ai/ui/interactive-ui/manifests";

import { buildComponentCatalogQuery, chartCatalogManifests, serverSideChartProviders } from "../component-catalog-query.js";

/**
 * @file Tests this module's own wiring — scoring/ranking over `ALL_MANIFESTS` and converting a
 * matched manifest's `propsSchema` to JSON Schema. Which manifests actually exist is
 * `@jini-ai/ui/interactive-ui`'s own contract, not re-asserted here; this only checks the query
 * built on top of it behaves correctly against the real, current manifest set.
 */

test("search finds the data-table providers by a capability-term match", () => {
  const catalog = buildComponentCatalogQuery();
  const hits = catalog.search({ query: "data table" }).map((hit) => hit.id);
  assert.ok(hits.includes("native.data-table"));
  assert.ok(hits.includes("shadcn.data-table"));
});

test("step 5: live catalog preserves wire IDs and resolves each specific capability, then falls back after disable", () => {
  let manifests = chartCatalogManifests({ snapshot: { generation: "1", siteProvider: "plugin.recharts", providers: [
    { id: "plugin.pie", kinds: ["pie"], javascript: "/pie.js" },
    { id: "plugin.recharts", kinds: ["bar", "line", "pie"], javascript: "/recharts.js" },
  ] } });
  const catalog = buildComponentCatalogQuery({ getManifests: () => manifests });
  assert.equal(catalog.describe({ id: "recharts.bar-chart" })?.provider, "plugin.recharts");
  assert.equal(catalog.describe({ id: "recharts.line-chart" })?.provider, "plugin.recharts");
  // The site default wins over registration order for every kind it declares.
  assert.equal(catalog.describe({ id: "recharts.pie-chart" })?.provider, "plugin.recharts");
  assert.ok(catalog.search({ query: "bar chart" }).some(({ id }) => id === "recharts.bar-chart"));
  manifests = chartCatalogManifests({ snapshot: { generation: "2", siteProvider: "plugin.recharts", providers: [
    { id: "plugin.pie", kinds: ["pie"], javascript: "/pie.js" },
  ] } });
  assert.equal(catalog.describe({ id: "recharts.pie-chart" })?.provider, "plugin.pie");
  manifests = chartCatalogManifests({ snapshot: { generation: "3", siteProvider: "plugin.recharts", providers: [] } });
  for (const kind of ["bar", "line", "pie"]) assert.equal(catalog.describe({ id: `recharts.${kind}-chart` })?.provider, "core.table");
});

test("search returns an empty array, not an error, for no matches", () => {
  const catalog = buildComponentCatalogQuery();
  assert.deepEqual(catalog.search({ query: "nonexistent-keyword-xyz" }), []);
});

test("search respects the limit argument", () => {
  const catalog = buildComponentCatalogQuery();
  const hits = catalog.search({ query: "data table" }, { limit: 1 });
  assert.equal(hits.length, 1);
});

test("tabular searches prefer the styled table and retain the native fallback", () => {
  const catalog = buildComponentCatalogQuery();
  for (const query of ["table", "tabular data", "spreadsheet", "list of records"]) {
    const hits = catalog.search({ query });
    assert.equal(hits[0]?.id, "shadcn.data-table", query);
    assert.ok(hits.some((hit) => hit.id === "native.data-table"), query);
    assert.equal(catalog.search({ query }, { limit: 1 })[0]?.id, "shadcn.data-table", query);
  }
  assert.equal(catalog.search({ query: "native" }, { limit: 1 })[0]?.id, "native.data-table");
});

test("describe steers tabular data to shadcn and documents native as the styled fallback", () => {
  const catalog = buildComponentCatalogQuery();
  assert.match(catalog.describe({ id: "shadcn.data-table" })?.description ?? "", /Preferred styled table/);
  assert.match(catalog.describe({ id: "native.data-table" })?.description ?? "", /Styled HTML table fallback/);
});

test("describe returns null for an unknown id", () => {
  const catalog = buildComponentCatalogQuery();
  assert.equal(catalog.describe({ id: "no.such.component" }), null);
});

test("describe returns the full entry, including a JSON-Schema propsSchema, for a known id", () => {
  const catalog = buildComponentCatalogQuery();
  const entry = catalog.describe({ id: "native.data-table" });
  assert.ok(entry);
  assert.equal(entry.id, "native.data-table");
  assert.equal(entry.provider, "native");
  assert.ok(entry.capabilities.includes("data-table"));
  // A JSON Schema object, not a live zod schema — the whole point of converting it here.
  assert.equal(typeof entry.propsSchema, "object");
  assert.ok(entry.propsSchema !== null);
});

test("server-side chart providers keep each id/kind but refuse to load provider code", async () => {
  const providers = serverSideChartProviders({ snapshot: { generation: "1", siteProvider: "plugin.pie", providers: [
    { id: "plugin.pie", kinds: ["pie"], javascript: "/pie.js" },
  ] } });
  assert.deepEqual(providers.map(({ id, kinds, enabled }) => ({ id, kinds, enabled })), [{ id: "plugin.pie", kinds: ["pie"], enabled: true }]);
  await assert.rejects(providers[0]!.load(), /chart providers load in the browser only/);
});

test("a manifest with no description is searchable by its other fields and is projected without a description key", () => {
  const base = ALL_MANIFESTS[0];
  assert.ok(base);
  const { description: _dropped, ...withoutDescription } = base;
  const catalog = buildComponentCatalogQuery({ getManifests: () => [{ ...withoutDescription, id: "fixture.undescribed" }] });
  const [hit] = catalog.search({ query: "undescribed" });
  assert.equal(hit?.id, "fixture.undescribed");
  assert.equal(Object.hasOwn(hit ?? {}, "description"), false);
  const entry = catalog.describe({ id: "fixture.undescribed" });
  assert.equal(entry?.id, "fixture.undescribed");
  assert.equal(Object.hasOwn(entry ?? {}, "description"), false);
});
