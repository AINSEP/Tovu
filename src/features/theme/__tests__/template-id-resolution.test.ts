import assert from "node:assert/strict";
import test from "node:test";

import { resolveHandlebarsTemplateId, resolveLiquidTemplateId, resolveTemplateId } from "../theme.js";

/**
 * @file Characterization tests for `resolveTemplateId`/`resolveLiquidTemplateId`/
 * `resolveHandlebarsTemplateId` (theme.ts) — the REQ-03 route→template-id fallthrough, one
 * per source-map shape (declarative block trees, raw `.liquid` source, raw `.hbs` source).
 *
 * Written ahead of a complexity-reduction refactor (all three sat at cyclomatic 10 / cognitive
 * 11) that collapses their near-identical bodies onto one shared resolver. None of the three had
 * any direct test in this suite before this file — `template-resolution.test.ts` covers a
 * same-named-sounding but unrelated function (`resolveTemplate` in `static-render.ts`, the static
 * `templateChoice` picker). These pin the pre-refactor behavior for every route × presence
 * combination so the shared-core extraction can be verified behavior-preserving.
 */

test("resolveTemplateId: route 'home' resolves to 'home' when templates.home exists", () => {
  assert.equal(resolveTemplateId({ route: "home", templates: { home: {} } }), "home");
});

test("resolveTemplateId: route 'home' resolves to null when templates.home is absent — no fallthrough", () => {
  assert.equal(resolveTemplateId({ route: "home", templates: { post: {}, entry: {} } }), null);
});

test("resolveTemplateId: route 'products' resolves to 'products' when present, own-named only", () => {
  assert.equal(resolveTemplateId({ route: "products", templates: { products: {} } }), "products");
});

test("resolveTemplateId: route 'products' resolves to null when absent — no fallthrough to entry", () => {
  assert.equal(resolveTemplateId({ route: "products", templates: { entry: {} } }), null);
});

test("resolveTemplateId: route 'product' resolves to 'product' when present, own-named only", () => {
  assert.equal(resolveTemplateId({ route: "product", templates: { product: {} } }), "product");
});

test("resolveTemplateId: route 'product' resolves to null when absent — no fallthrough to entry", () => {
  assert.equal(resolveTemplateId({ route: "product", templates: { entry: {} } }), null);
});

test("resolveTemplateId: route 'post' resolves to 'post' when templates.post exists", () => {
  assert.equal(resolveTemplateId({ route: "post", templates: { post: {}, entry: {} } }), "post");
});

test("resolveTemplateId: route 'post' falls through to 'entry' when templates.post is absent", () => {
  assert.equal(resolveTemplateId({ route: "post", templates: { entry: {} } }), "entry");
});

test("resolveTemplateId: route 'post' resolves to null when neither post nor entry exists", () => {
  assert.equal(resolveTemplateId({ route: "post", templates: {} }), null);
});

test("resolveLiquidTemplateId: route 'home' resolves to 'home' when liquidTemplates.home exists", () => {
  assert.equal(resolveLiquidTemplateId({ route: "home", liquidTemplates: { home: "{{x}}" } }), "home");
});

test("resolveLiquidTemplateId: route 'home' resolves to null when absent", () => {
  assert.equal(resolveLiquidTemplateId({ route: "home", liquidTemplates: { post: "{{x}}" } }), null);
});

test("resolveLiquidTemplateId: route 'products' own-named only, no fallthrough", () => {
  assert.equal(resolveLiquidTemplateId({ route: "products", liquidTemplates: { entry: "{{x}}" } }), null);
  assert.equal(resolveLiquidTemplateId({ route: "products", liquidTemplates: { products: "{{x}}" } }), "products");
});

test("resolveLiquidTemplateId: route 'product' own-named only, no fallthrough", () => {
  assert.equal(resolveLiquidTemplateId({ route: "product", liquidTemplates: { entry: "{{x}}" } }), null);
  assert.equal(resolveLiquidTemplateId({ route: "product", liquidTemplates: { product: "{{x}}" } }), "product");
});

test("resolveLiquidTemplateId: route 'post' resolves to 'post' when present", () => {
  assert.equal(resolveLiquidTemplateId({ route: "post", liquidTemplates: { post: "{{x}}", entry: "{{y}}" } }), "post");
});

test("resolveLiquidTemplateId: route 'post' falls through to 'entry' when post is absent", () => {
  assert.equal(resolveLiquidTemplateId({ route: "post", liquidTemplates: { entry: "{{y}}" } }), "entry");
});

test("resolveLiquidTemplateId: route 'post' resolves to null when neither post nor entry exists", () => {
  assert.equal(resolveLiquidTemplateId({ route: "post", liquidTemplates: {} }), null);
});

test("resolveHandlebarsTemplateId: route 'home' resolves to 'home' when handlebarsTemplates.home exists", () => {
  assert.equal(resolveHandlebarsTemplateId({ route: "home", handlebarsTemplates: { home: "{{x}}" } }), "home");
});

test("resolveHandlebarsTemplateId: route 'home' resolves to null when absent", () => {
  assert.equal(resolveHandlebarsTemplateId({ route: "home", handlebarsTemplates: { post: "{{x}}" } }), null);
});

test("resolveHandlebarsTemplateId: route 'products' own-named only, no fallthrough", () => {
  assert.equal(resolveHandlebarsTemplateId({ route: "products", handlebarsTemplates: { entry: "{{x}}" } }), null);
  assert.equal(
    resolveHandlebarsTemplateId({ route: "products", handlebarsTemplates: { products: "{{x}}" } }),
    "products"
  );
});

test("resolveHandlebarsTemplateId: route 'product' own-named only, no fallthrough", () => {
  assert.equal(resolveHandlebarsTemplateId({ route: "product", handlebarsTemplates: { entry: "{{x}}" } }), null);
  assert.equal(
    resolveHandlebarsTemplateId({ route: "product", handlebarsTemplates: { product: "{{x}}" } }),
    "product"
  );
});

test("resolveHandlebarsTemplateId: route 'post' resolves to 'post' when present", () => {
  assert.equal(
    resolveHandlebarsTemplateId({ route: "post", handlebarsTemplates: { post: "{{x}}", entry: "{{y}}" } }),
    "post"
  );
});

test("resolveHandlebarsTemplateId: route 'post' falls through to 'entry' when post is absent", () => {
  assert.equal(resolveHandlebarsTemplateId({ route: "post", handlebarsTemplates: { entry: "{{y}}" } }), "entry");
});

test("resolveHandlebarsTemplateId: route 'post' resolves to null when neither post nor entry exists", () => {
  assert.equal(resolveHandlebarsTemplateId({ route: "post", handlebarsTemplates: {} }), null);
});
