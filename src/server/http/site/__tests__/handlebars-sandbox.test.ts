import assert from "node:assert/strict";
import test from "node:test";

import type { PostRecord } from "../../../../features/post";
import { renderHandlebarsInSandbox } from "../handlebars-sandbox";
import type { SiteRenderContext } from "../render";

/**
 * @file ADR-020 §3 (C6), Handlebars tier — certifies `renderHandlebarsInSandbox`'s isolation
 * guarantees, mirroring `liquid-sandbox.test.ts` case for case: a normal template renders
 * correctly, the `render_block` seam reaches the real component registry from inside the worker,
 * the defensive re-lint still fires there, and a runaway CPU-bound template is force-terminated
 * within the configured wall-clock budget instead of hanging.
 *
 * This is the test that proves render isolation actually works at runtime for this tier — not just
 * that the sandbox code compiles. It matters more here than the "Handlebars seems safer than
 * Liquid" intuition suggests: the constructs below are all fully allowlisted, so nothing static can
 * refuse them, and the worker is the only thing standing between them and the server process.
 */

function posts(count: number): PostRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    workspaceId: "w1",
    title: `Post ${i}`,
    slug: `post-${i}`,
    bodyJson: { type: "doc", content: [] },
    status: "published" as const,
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  }));
}

function baseCtx(overrides: Partial<SiteRenderContext> = {}): SiteRenderContext {
  return {
    siteTitle: "Test Site",
    route: "home",
    posts: posts(1),
    themeName: "test",
    // Every required field of `SiteRenderContext` is set explicitly rather than left to the
    // trailing `...overrides` spread — TS's object-literal completeness check is unsound across a
    // partial spread, so an omission here would type-check and then be `undefined` at runtime
    // inside the worker. (That exact defect is what silently disabled three cases in
    // `liquid-sandbox.test.ts`; see its `baseCtx` comment.)
    products: [],
    widgetRegions: {},
    widgetInlineResolved: new Map(),
    ...overrides,
  };
}

test("renders a well-behaved template and resolves with the rendered HTML", async () => {
  const html = await renderHandlebarsInSandbox({ source: "<h1>{{site.title}}</h1>", ctx: baseCtx() });
  assert.equal(html, "<h1>Test Site</h1>");
});

test("the render_block seam resolves against the real component registry inside the worker", async () => {
  const html = await renderHandlebarsInSandbox({
    source: '{{render_block component="tovu/site-header"}}',
    ctx: baseCtx(),
  });
  assert.match(html, /site-header/);
  assert.match(html, /Test Site/);
  // The helper returns a SafeString, so its markup is emitted as HTML rather than escaped —
  // without that, the seam would render visible &lt;header&gt; text.
  assert.doesNotMatch(html, /&lt;header/);
});

test("output escaping is ON inside the worker — a hostile value is escaped, mirroring Liquid's outputEscape", async () => {
  const html = await renderHandlebarsInSandbox({
    source: "{{#each posts}}<i>{{title}}</i>{{/each}}",
    ctx: baseCtx({ posts: [{ ...posts(1)[0], title: '<script>alert(1)</script>' }] }),
  });
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("a disallowed construct is rejected by the worker's defensive re-lint even when it bypassed loadTheme's lint (e.g. hot-edited on disk)", async () => {
  await assert.rejects(
    renderHandlebarsInSandbox({ source: "{{> leak}}", ctx: baseCtx() }),
    /disallowed Handlebars usage.*disallowed partial "leak"/
  );
  await assert.rejects(
    renderHandlebarsInSandbox({ source: "{{{post.title}}}", ctx: baseCtx() }),
    /disallowed Handlebars usage.*disallowed raw output/
  );
});

test("a syntax error surfaces as a rejection, not a thrown exception on the caller's thread", async () => {
  await assert.rejects(renderHandlebarsInSandbox({ source: "{{#if x}}", ctx: baseCtx() }), /Handlebars syntax error/);
});

test("an unregistered helper name resolves as an ordinary (empty) data path rather than invoking anything — knownHelpersOnly", async () => {
  // `{{someUnknownName}}` with no arguments is lint-clean (it is indistinguishable from a data
  // path at parse time). The worker compiles with `knownHelpersOnly: true`, so even if a helper by
  // that name somehow existed it would not be called — the expression is a context lookup that
  // finds nothing and renders empty.
  const html = await renderHandlebarsInSandbox({ source: "[{{someUnknownName}}]", ctx: baseCtx() });
  assert.equal(html, "[]");
});

test("a runaway CPU-bound template (deeply nested each over a real collection) is force-terminated within the timeout, not hung", async () => {
  const start = Date.now();
  await assert.rejects(
    renderHandlebarsInSandbox(
      {
        // Every construct here is allowlisted — `each` and `../` parent paths — so nothing static
        // refuses it. Four nested loops over 300 posts is ~8.1e9 iterations: genuinely CPU-bound
        // with no disallowed syntax and no oversized literal anywhere. This is the realistic
        // adversarial shape for a tier with no numeric-range literal to cap.
        source: "{{#each posts}}{{#each ../posts}}{{#each ../../posts}}{{#each ../../../posts}}{{title}}{{/each}}{{/each}}{{/each}}{{/each}}",
        ctx: baseCtx({ posts: posts(300) }),
      },
      { timeoutMs: 500 }
    ),
    /exceeded 500ms timeout/
  );
  const elapsed = Date.now() - start;
  // Generous upper bound: proves the call actually returned promptly instead of hanging for the
  // test runner's default timeout.
  assert.ok(elapsed < 5000, `expected termination well under 5s, took ${elapsed}ms`);
});

test("malformed workerData is reported as a clean error rather than crashing the worker", async () => {
  await assert.rejects(
    renderHandlebarsInSandbox({ source: undefined as unknown as string, ctx: baseCtx() }),
    /malformed workerData/
  );
});
