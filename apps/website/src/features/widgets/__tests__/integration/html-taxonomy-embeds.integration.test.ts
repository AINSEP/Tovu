import { buildWidgetHostPorts } from "#src/features/widgets/deps";
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import type { Taxonomy, Term } from "#src/features/taxonomy/index";
import { renderHtmlPageBody } from "#src/server/inbound/public-http/http/site/render";
import { checkMarkupFile } from "#src/features/theme/validation/markup";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { finishStaticTierDocument } from "#src/server/inbound/public-http/routes/site/pages";
import { resolveHtmlPageEmbeds } from "@jini-ai/cms/widgets/html";

const taxonomy: Taxonomy = { id: "tax-1", name: "Categories", hierarchical: true, status: "active", version: 1, updatedAt: "2026-10-04" };
const term = (id: string, overrides: Partial<Term> = {}): Term => ({ id, name: id, taxonomyId: taxonomy.id, parentId: null, status: "active", version: 1, updatedAt: "2026-10-04", ...overrides });
function deps(taxonomies = [taxonomy], terms = [term("parent"), term("child", { parentId: "parent", name: "A < B & C" }), term("trashed", { status: "trash" })]) {
  return { entryRepo: new InMemoryEntryRepo(), taxonomyRepo: { list: async () => taxonomies }, termRepo: { listByTaxonomy: async ({ taxonomyId }: { taxonomyId: string }) => terms.filter((row) => row.taxonomyId === taxonomyId) } };
}
const marker = (id: string) => `<div data-embed-config='${JSON.stringify({ type: "taxonomy", id, mode: "html" })}'></div>`;

test("category taxonomy embeds resolve saved names and ids through the shared resolver and validator", async () => {
  const html = marker("Categories") + marker("tax-1");
  const resolved = await resolveHtmlPageEmbeds({ deps: { host: buildWidgetHostPorts({}, {}), ...deps() }, input: { workspaceId: "ws", html } });
  assert.equal(resolved.get("taxonomy")?.get("Categories")?.componentId, "taxonomy-list");
  const rendered = renderHtmlPageBody(html, resolved);
  assert.equal((rendered.match(/<section /g) ?? []).length, 2);
  assert.match(rendered, /data-tovu-taxonomy="tax-1" aria-label="Categories"/);
  assert.match(rendered, /<li data-tovu-term="parent"[^>]*><span data-tovu-term-label>parent<\/span><ul/);
  assert.match(rendered, /A &lt; B &amp; C/);
  assert.doesNotMatch(rendered, /trashed|class=|style=|data-embed-config|<a /);
  assert.deepEqual(checkMarkupFile({ relativePath: "categories.html", content: html }), []);
});

test("flat tags ignore parent metadata, and orphaned live categories stay visible", async () => {
  const tags = { ...taxonomy, name: "Tags", hierarchical: false };
  const html = marker("Tags");
  const rendered = renderHtmlPageBody(html, await resolveHtmlPageEmbeds({ deps: { host: buildWidgetHostPorts({}, {}), ...deps([tags]) }, input: { workspaceId: "ws", html } }));
  assert.equal((rendered.match(/<ul /g) ?? []).length, 1);
  assert.equal((rendered.match(/data-depth="0"/g) ?? []).length, 3);
  const orphanHtml = marker("Categories");
  const orphan = renderHtmlPageBody(orphanHtml, await resolveHtmlPageEmbeds({ deps: { host: buildWidgetHostPorts({}, {}), ...deps([taxonomy], [term("child", { parentId: "missing" })]) }, input: { workspaceId: "ws", html: orphanHtml } }));
  assert.match(orphan, /data-tovu-term="child"/);
});

test("missing ports, missing/trashed taxonomies and ambiguous names degrade to an isolated placeholder", async () => {
  const html = marker("Categories");
  for (const dependencies of [
    { entryRepo: new InMemoryEntryRepo() }, deps([]), deps([{ ...taxonomy, status: "trash" }]),
    deps([taxonomy, { ...taxonomy, id: "other" }]),
  ]) {
    const resolved = await resolveHtmlPageEmbeds({ deps: { host: buildWidgetHostPorts({}, {}), ...dependencies }, input: { workspaceId: "ws", html } });
    assert.equal(resolved.get("taxonomy")?.size, 0);
    assert.match(renderHtmlPageBody(html, resolved), /widget-placeholder/);
  }
});

test("the public static-page pipeline wires taxonomy read ports and resolves markers expanded from partials", async () => {
  const dependencies = createRouteDeps();
  await dependencies.taxonomyRepo.insert(taxonomy);
  await dependencies.termRepo.insert(term("from-the-public-pipeline"));
  const source = `<div data-embed-config='{"type":"partial","id":"nav"}'></div>`;
  const theme: DiscoveredTheme = {
    manifest: { id: "plain-taxonomy", name: "Plain Taxonomy", version: "1.0.0", tier: "static", engine: 1 },
    dir: "/fake", tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {},
    pages: { index: source }, partials: { nav: marker("tax-1") },
    css: "", source: "site", status: "valid", errors: [],
  };
  const rendered = await finishStaticTierDocument(dependencies, { theme, pageId: "index", html: source, currentPath: "/", staticMenus: undefined });
  assert.match(rendered, /data-tovu-term="from-the-public-pipeline"/);
  assert.doesNotMatch(rendered, /class=|style=|data-embed-config|widget-placeholder/);
});

test("purged taxonomies and purged terms never render", async () => {
  const html = marker("Categories");
  const purgedTaxonomy = await resolveHtmlPageEmbeds({ deps: { host: buildWidgetHostPorts({}, {}), ...deps([{ ...taxonomy, status: "purged" }]) }, input: { workspaceId: "ws", html } });
  assert.equal(purgedTaxonomy.get("taxonomy")?.size, 0);
  const rendered = renderHtmlPageBody(html, await resolveHtmlPageEmbeds({ deps: { host: buildWidgetHostPorts({}, {}), ...deps([taxonomy], [term("kept"), term("gone", { status: "purged" })]) }, input: { workspaceId: "ws", html } }));
  assert.match(rendered, /data-tovu-term="kept"/);
  assert.doesNotMatch(rendered, /gone/);
});

test("a marker without a target id resolves nothing and the taxonomy's terms are listed once per page", async () => {
  const dependencies = deps(); const listed: string[] = [];
  const termRepo = { listByTaxonomy: async (input: { taxonomyId: string }) => { listed.push(input.taxonomyId); return dependencies.termRepo.listByTaxonomy(input); } };
  const idless = `<div data-embed-config='${JSON.stringify({ type: "taxonomy", mode: "html" })}'></div>`;
  const resolved = await resolveHtmlPageEmbeds({ deps: { host: buildWidgetHostPorts({}, {}), ...dependencies, termRepo }, input: { workspaceId: "ws", html: idless + marker("Categories") + marker("tax-1") } });
  assert.deepEqual([...resolved.get("taxonomy")!.keys()].sort(), ["Categories", "tax-1"]);
  assert.deepEqual(listed, ["tax-1"]);
});

test("self, two-term and three-term parent cycles render every term exactly once", async () => {
  const html = marker("Categories");
  const terms = [term("self", { parentId: "self" }), term("a", { parentId: "b" }), term("b", { parentId: "a" }),
    term("x", { parentId: "z" }), term("y", { parentId: "x" }), term("z", { parentId: "y" })];
  const rendered = renderHtmlPageBody(html, await resolveHtmlPageEmbeds({ deps: { host: buildWidgetHostPorts({}, {}), ...deps([taxonomy], terms) }, input: { workspaceId: "ws", html } }));
  for (const id of ["self", "a", "b", "x", "y", "z"]) assert.equal((rendered.match(new RegExp(`data-tovu-term="${id}"`, "g")) ?? []).length, 1, id);
  assert.match(rendered, /<li data-tovu-term="self" data-depth="0">/);
  // With no root, the cycle members surface from the first one, nested in parent order.
  assert.match(rendered, /data-tovu-term="a" data-depth="0">.*data-tovu-term="b" data-depth="1"/);
  const rootless = renderHtmlPageBody(html, await resolveHtmlPageEmbeds({ deps: { host: buildWidgetHostPorts({}, {}), ...deps([taxonomy], terms.slice(1, 3)) }, input: { workspaceId: "ws", html } }));
  assert.match(rootless, /^<section [^>]*><ul data-tovu-taxonomy-list data-depth="0"><li data-tovu-term="a" data-depth="0">.*data-tovu-term="b" data-depth="1".*<\/section>$/);
});
