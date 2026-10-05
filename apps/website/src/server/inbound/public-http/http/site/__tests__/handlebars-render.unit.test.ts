import assert from "node:assert/strict";
import test from "node:test";

import { NO_ACCESS_PARTIALS, runHandlebarsRender } from "../handlebars-render.js";
import type { SiteRenderContext } from "../render.js";

/**
 * @file In-process tests of the Handlebars worker's render logic (`handlebars-render.ts`). The
 * sandbox tests prove the isolation; the worker thread's own V8 coverage is suppressed by design,
 * so input validation, the defensive re-lint, the error reply, the `render_block` helper and the
 * hardenings that must hold even with the lint switched off (via its `lint` port) are pinned here.
 */

const ctx: SiteRenderContext = {
  siteTitle: "Render Site", route: "home", posts: [], products: [], themeName: "test",
  widgetRegions: {}, widgetInlineResolved: new Map(),
};
const noLint = () => [];
const errorOf = (result: ReturnType<typeof runHandlebarsRender>) => (assert.equal(result.ok, false), (result as { error: string }).error);

test("a well-formed payload renders with the shared data contract, HTML-escaped", () => {
  assert.deepEqual(runHandlebarsRender({ workerData: { source: "<h1>{{site.title}}</h1>", ctx: { ...ctx, siteTitle: "A & B" } } }), { ok: true, html: "<h1>A &amp; B</h1>" });
});

test("malformed workerData is refused without rendering, for every shape the guard checks", () => {
  const malformed = { ok: false, error: "handlebars-worker received malformed workerData" };
  for (const workerData of [undefined, null, "source", { ctx }, { source: 1, ctx }, { source: "x" }, { source: "x", ctx: "ctx" }]) {
    assert.deepEqual(runHandlebarsRender({ workerData }), malformed, JSON.stringify(workerData));
  }
});

test("the default re-lint refuses a disallowed construct before compiling", () => {
  assert.match(errorOf(runHandlebarsRender({ workerData: { source: "{{> header}}", ctx } })), /^disallowed Handlebars usage: /);
});

test("the lint port decides: its violations are joined into the refusal", () => {
  const result = runHandlebarsRender({ workerData: { source: "<p>ok</p>", ctx } }, { lint: () => ["one", "two"] });
  assert.deepEqual(result, { ok: false, error: "disallowed Handlebars usage: one; two" });
});

test("with the lint off, a partial still fails closed on the throwing partial registry", () => {
  assert.equal(errorOf(runHandlebarsRender({ workerData: { source: "{{> header}}", ctx } }, { lint: noLint })), "partials are disabled for theme templates: header");
});

test("with the lint off, the removed log/lookup built-ins and unknown helpers cannot be invoked", () => {
  for (const name of ["log", "lookup", "someUnknownName"]) {
    assert.match(errorOf(runHandlebarsRender({ workerData: { source: `{{${name} site "title"}}`, ctx } }, { lint: noLint })), /knownHelpersOnly/, name);
  }
});

test("with the lint off, prototype properties stay unreachable at runtime", () => {
  assert.deepEqual(runHandlebarsRender({ workerData: { source: "[{{site.constructor.name}}]", ctx } }, { lint: noLint }), { ok: true, html: "[]" });
});

test("a compile error becomes a controlled error reply instead of a throw", () => {
  assert.match(errorOf(runHandlebarsRender({ workerData: { source: "{{#if site.title}}open", ctx } })), /Parse error|Expecting/);
});

test("render_block resolves a registered component against this render's context, unescaped", () => {
  const result = runHandlebarsRender({ workerData: { source: '{{render_block component="tovu/site-header"}}', ctx } });
  assert.equal(result.ok, true);
  assert.match((result as { html: string }).html, /<header[^>]*site-header/);
  assert.match((result as { html: string }).html, /Render Site/);
  assert.deepEqual(runHandlebarsRender({ workerData: { source: "{{render_block}}", ctx } }), { ok: true, html: "<!-- unknown component:  -->" });
});

test("the partial registry throws on every lookup and exposes no names", () => {
  assert.throws(() => NO_ACCESS_PARTIALS.constructor, { message: "partials are disabled for theme templates: constructor" });
  assert.equal("header" in NO_ACCESS_PARTIALS, false);
  assert.deepEqual(Reflect.ownKeys(NO_ACCESS_PARTIALS), []);
});
