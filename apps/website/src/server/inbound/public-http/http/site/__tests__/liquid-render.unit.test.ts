import assert from "node:assert/strict";
import test from "node:test";

import { NO_ACCESS_FS, runLiquidRender } from "../liquid-render.js";
import type { SiteRenderContext } from "../render.js";

/**
 * @file In-process tests of the Liquid worker's render logic (`liquid-render.ts`). The sandbox
 * tests (`liquid-sandbox.test.ts`) prove the isolation; the worker thread's own V8 coverage is
 * suppressed by design, so the input validation, defensive re-lint, error reply and the
 * `render_block` tag's context guard are pinned here, against the real engine and real allowlist.
 */

const ctx: SiteRenderContext = {
  siteTitle: "Render Site", route: "home", posts: [], products: [], themeName: "test",
  widgetRegions: {}, widgetInlineResolved: new Map(),
};

test("a well-formed payload renders with the shared data contract, HTML-escaped", () => {
  const result = runLiquidRender({ workerData: { source: "<h1>{{ site.title }}</h1>{{ evil }}", ctx: { ...ctx, siteTitle: "A & B" } } });
  assert.deepEqual(result, { ok: true, html: "<h1>A &amp; B</h1>" });
});

test("malformed workerData is refused without rendering, for every shape the guard checks", () => {
  const malformed = { ok: false, error: "liquid-worker received malformed workerData" };
  for (const workerData of [undefined, null, "source", { ctx }, { source: 1, ctx }, { source: "x" }, { source: "x", ctx: "ctx" }]) {
    assert.deepEqual(runLiquidRender({ workerData }), malformed, JSON.stringify(workerData));
  }
});

test("the defensive re-lint refuses a disallowed tag before the engine sees it", () => {
  const result = runLiquidRender({ workerData: { source: "{% include 'secrets' %}", ctx } });
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /^disallowed Liquid usage: .*include/);
});

test("with the theme's allowlist opt-out, an include still fails closed on the no-access filesystem", () => {
  const result = runLiquidRender({ workerData: { source: "{% include 'secrets' %}", ctx, skipLiquidAllowlist: true } });
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /secrets/);
  assert.doesNotMatch((result as { error: string }).error, /^disallowed Liquid usage/);
});

test("an engine error becomes a controlled error reply instead of a throw", () => {
  const result = runLiquidRender({ workerData: { source: "{% if site.title %}open", ctx } });
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /not closed/);
});

test("render_block resolves a registered component through the site context", () => {
  const result = runLiquidRender({ workerData: { source: '{% render_block component: "tovu/site-header" %}', ctx } });
  assert.equal(result.ok, true);
  assert.match((result as { html: string }).html, /site-header/);
  assert.match((result as { html: string }).html, /Render Site/);
});

test("render_block refuses to render when the template has shadowed the site context", () => {
  const result = runLiquidRender({
    workerData: { source: '{% assign __siteCtx = false %}{% render_block component: "tovu/site-header" %}', ctx, skipLiquidAllowlist: true },
  });
  assert.deepEqual(result, { ok: true, html: "<!-- render_block: no site context -->" });
});

test("the no-access filesystem reports every path absent and refuses every read", async () => {
  assert.equal(await NO_ACCESS_FS.exists("/etc/passwd"), false);
  assert.equal(NO_ACCESS_FS.existsSync!("/etc/passwd"), false);
  await assert.rejects(NO_ACCESS_FS.readFile("/etc/passwd"), { message: "filesystem access disabled for theme templates: /etc/passwd" });
  assert.throws(() => NO_ACCESS_FS.readFileSync!("/etc/passwd"), { message: "filesystem access disabled for theme templates: /etc/passwd" });
  assert.equal(NO_ACCESS_FS.resolve("/root", "file.liquid", ".liquid"), "file.liquid");
  assert.equal(NO_ACCESS_FS.dirname!("/root/file.liquid"), "");
  assert.equal(NO_ACCESS_FS.sep, "/");
});
