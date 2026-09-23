import assert from "node:assert/strict";
import test from "node:test";

import { collectionMarkerKey, renderStaticPage, splitCollectionMarkerInner } from "../static-render.js";
import { markersOfType, COLLECTION_MARKER_TYPE } from "#src/contracts/core/embeds/marker";
import type { DiscoveredTheme } from "../static-render.js";

/**
 * @file Certifies the collection marker (2026-09-23) — `renderStaticPage`'s own
 * `{"type":"collection"}` substitution (`injectCollectionEmbeds`, private to `static-render.ts`,
 * exercised here only through `renderStaticPage`'s public surface — the same convention
 * `static-render-post-previews.test.ts` follows for `injectPostPreviewsEmbeds`) plus the exported
 * `splitCollectionMarkerInner` helper.
 *
 * This file is I/O-free by design (matches `static-render.ts`'s own header): every test hands in an
 * already-rendered `collectionLists` map, never a repo or a live query. The route-layer wiring that
 * resolves real entries into that map is covered separately (C5, `resolveCollectionListsForRender`).
 */

function minimalTheme(pages: Record<string, string>): DiscoveredTheme {
  return {
    manifest: { id: "collection-test-theme", name: "Collection Test Theme", version: "1.0.0", tier: "static", engine: 1, templates: [] },
    dir: "/nonexistent/collection-test-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages,
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

test("renderStaticPage: a page WITHOUT the marker renders byte-identically whether or not collectionLists is supplied", () => {
  const theme = minimalTheme({ index: "<html><body><main>home, no marker</main></body></html>" });
  const withoutLists = renderStaticPage({ theme, pageId: "index" });
  const withUnusedLists = renderStaticPage({
    theme,
    pageId: "index",
    collectionLists: new Map([['{"type":"collection","typeKey":"recipe"}', "<div>unused</div>"]]),
  });
  assert.equal(withoutLists, withUnusedLists, "a page carrying no marker must be unaffected by collectionLists being supplied");
  assert.ok(withoutLists?.includes("home, no marker"));
});

test("renderStaticPage: a miss (no map entry) leaves the marker's authored fallback untouched", () => {
  const html =
    '<div class="grid" data-embed-config=\'{"type":"collection","typeKey":"recipe"}\'>' +
    "<p>no recipes yet</p>" +
    "</div>";
  const theme = minimalTheme({ recipes: html });

  const omitted = renderStaticPage({ theme, pageId: "recipes" });
  assert.ok(omitted?.includes("no recipes yet"), "no collectionLists at all -> fallback content survives");
  assert.ok(omitted?.includes("data-embed-config"), "a miss must not strip the marker's own config attribute");

  const emptyMap = renderStaticPage({ theme, pageId: "recipes", collectionLists: new Map() });
  assert.ok(emptyMap?.includes("no recipes yet"), "an empty collectionLists map -> fallback content survives");

  const explicitMiss = renderStaticPage({
    theme,
    pageId: "recipes",
    collectionLists: new Map([['{"type":"collection","typeKey":"recipe"}', undefined]]),
  });
  assert.ok(explicitMiss?.includes("no recipes yet"), "an explicit undefined entry for this key -> fallback content survives");
});

test("renderStaticPage: a hit replaces inner content, keeps the marker's own class/style/id/aria, and strips data-embed-config", () => {
  const key = '{"type":"collection","typeKey":"recipe"}';
  const html =
    `<section id="recipe-list" class="grid" style="color:red" aria-label="Recipes" data-embed-config='${key}'>` +
    "<p>no recipes yet</p>" +
    "</section>";
  const theme = minimalTheme({ recipes: html });

  const rendered = renderStaticPage({
    theme,
    pageId: "recipes",
    collectionLists: new Map([[key, '<div class="entry-list" data-tovu-entry-list><h3>Chili</h3></div>']]),
  });

  assert.ok(rendered?.includes('id="recipe-list"'), "id survives");
  assert.ok(rendered?.includes('class="grid"'), "class survives");
  assert.ok(rendered?.includes('style="color:red"'), "style survives");
  assert.ok(rendered?.includes('aria-label="Recipes"'), "aria-* survives");
  assert.ok(!rendered?.includes("data-embed-config"), "data-embed-config is stripped on a hit so a later re-scan cannot rediscover it");
  assert.ok(rendered?.includes("Chili"), "the resolved HTML replaces the marker's inner content");
  assert.ok(!rendered?.includes("no recipes yet"), "real data replaces the authored fallback");
});

test("renderStaticPage: multiple differently-keyed collection markers resolve independently", () => {
  const recipeKey = '{"type":"collection","typeKey":"recipe"}';
  const featureKey = '{"type":"collection","typeKey":"tovu_feature"}';
  const html =
    `<div data-embed-config='${recipeKey}'>no recipes</div>` +
    `<div data-embed-config='${featureKey}'>no features</div>`;
  const theme = minimalTheme({ home: html });

  const rendered = renderStaticPage({
    theme,
    pageId: "home",
    collectionLists: new Map([[recipeKey, '<div class="entry-list" data-tovu-entry-list>Chili</div>']]),
  });

  assert.ok(rendered?.includes("Chili"), "the matching key resolves");
  assert.ok(rendered?.includes("no features"), "the un-matched key's fallback survives");
});

test("renderStaticPage: the entry-list style is injected exactly once even with multiple resolved collection markers", () => {
  const keyA = '{"type":"collection","typeKey":"recipe"}';
  const keyB = '{"type":"collection","typeKey":"tovu_feature"}';
  const html =
    "<html><head></head><body>" +
    `<div data-embed-config='${keyA}'>a</div>` +
    `<div data-embed-config='${keyB}'>b</div>` +
    "</body></html>";
  const theme = minimalTheme({ home: html });

  const rendered = renderStaticPage({
    theme,
    pageId: "home",
    collectionLists: new Map([
      [keyA, '<div class="entry-list" data-tovu-entry-list>Chili</div>'],
      [keyB, '<div class="entry-list" data-tovu-entry-list>Widgets</div>'],
    ]),
  });

  const styleTagOccurrences = rendered?.split("<style data-tovu-entry-list>").length ?? 0;
  assert.equal(styleTagOccurrences, 2, "the style tag must appear exactly once (one split -> two segments)");
});

test("renderStaticPage: no style is injected when no collection marker resolves to entry-list markup", () => {
  const html = "<html><head></head><body><main>plain page</main></body></html>";
  const theme = minimalTheme({ home: html });
  const rendered = renderStaticPage({ theme, pageId: "home" });
  assert.ok(!rendered?.includes("data-tovu-entry-list"), "a page with no resolved entry-list must not carry the style block");
});

test("splitCollectionMarkerInner: no <template> -> whole inner content is the fallback, no template returned", () => {
  const result = splitCollectionMarkerInner("<p>empty state</p>");
  assert.equal(result.template, undefined);
  assert.equal(result.fallback, "<p>empty state</p>");
});

test("splitCollectionMarkerInner: a <template> block is pulled out, remaining markup becomes the fallback", () => {
  const result = splitCollectionMarkerInner('<template><h3>{{title}}</h3></template><p>empty state</p>');
  assert.equal(result.template, "<h3>{{title}}</h3>");
  assert.equal(result.fallback, "<p>empty state</p>");
});

test("splitCollectionMarkerInner: only the FIRST <template> block is extracted", () => {
  const result = splitCollectionMarkerInner("<template>one</template><template>two</template>");
  assert.equal(result.template, "one");
  assert.equal(result.fallback, "<template>two</template>");
});

test("splitCollectionMarkerInner: an unterminated <template> is treated as no template at all", () => {
  const result = splitCollectionMarkerInner("<template>never closed");
  assert.equal(result.template, undefined);
  assert.equal(result.fallback, "<template>never closed");
});

test("collectionMarkerKey: two markers with the SAME config but different <template>s get different keys", () => {
  const config = '{"type":"collection","typeKey":"recipe"}';
  const html =
    `<div data-embed-config='${config}'><template><b>{{title}}</b></template>none</div>` +
    `<div data-embed-config='${config}'><template><i>{{title}}</i></template>none</div>`;
  const [bold, italic] = markersOfType(html, COLLECTION_MARKER_TYPE);
  assert.ok(bold !== undefined && italic !== undefined);
  assert.notEqual(collectionMarkerKey(bold), collectionMarkerKey(italic));
});

test("collectionMarkerKey: a template-less marker keeps its plain config-JSON key; the same config with a template does not share it", () => {
  const config = '{"type":"collection","typeKey":"recipe"}';
  const html =
    `<div data-embed-config='${config}'>none</div>` + `<div data-embed-config='${config}'><template>{{title}}</template>none</div>`;
  const [bare, templated] = markersOfType(html, COLLECTION_MARKER_TYPE);
  assert.ok(bare !== undefined && templated !== undefined);
  assert.equal(collectionMarkerKey(bare), config);
  assert.notEqual(collectionMarkerKey(templated), config);
});

test("renderStaticPage: same-config markers with different templates each receive their own rendered list", () => {
  const config = '{"type":"collection","typeKey":"recipe"}';
  const html =
    `<div data-embed-config='${config}'><template><b>{{title}}</b></template>none</div>` +
    `<div data-embed-config='${config}'><template><i>{{title}}</i></template>none</div>`;
  const [bold, italic] = markersOfType(html, COLLECTION_MARKER_TYPE);
  assert.ok(bold !== undefined && italic !== undefined);
  const rendered = renderStaticPage({
    theme: minimalTheme({ home: html }),
    pageId: "home",
    collectionLists: new Map([
      [collectionMarkerKey(bold), "<b>Chili</b>"],
      [collectionMarkerKey(italic), "<i>Chili</i>"],
    ]),
  });
  assert.ok(rendered?.includes("<b>Chili</b>"), "the bold-template marker gets the bold rendering");
  assert.ok(rendered?.includes("<i>Chili</i>"), "the italic-template marker gets the italic rendering");
});
