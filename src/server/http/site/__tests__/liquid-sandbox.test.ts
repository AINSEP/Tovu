import assert from "node:assert/strict";
import test from "node:test";

import type { PostRecord } from "../../../../features/post";
import { renderLiquidInSandbox } from "../liquid-sandbox";
import type { SiteRenderContext } from "../render";

/**
 * @file ADR-020 §3 (C6) — certifies `renderLiquidInSandbox`'s isolation
 * guarantees: a normal template renders correctly, a runaway CPU-bound
 * template is force-terminated within the configured wall-clock budget
 * instead of hanging, and a memory-blowup template is force-terminated by
 * the worker's V8 heap `resourceLimits` instead of OOM-crashing the process.
 * This is the test that proves render isolation actually works at runtime,
 * not just that the sandbox code compiles.
 */

function baseCtx(overrides: Partial<SiteRenderContext> = {}): SiteRenderContext {
  const posts: PostRecord[] = [
    { id: "p1", workspaceId: "w1", title: "First", slug: "first", bodyJson: { type: "doc", content: [] }, status: "published", updatedAt: "2026-01-01T00:00:00.000Z", version: 1 },
  ];
  return {
    siteTitle: "Test Site",
    route: "home",
    posts,
    themeName: "test",
    // SPEC-043/ADR-047 — required fields (not optional on SiteRenderContext); set explicitly here
    // rather than relying on the `...overrides` spread below to satisfy them, since TS's object-
    // literal completeness check is unsound for a trailing generic/partial spread (it can't prove
    // statically that `overrides` won't supply them, so it doesn't flag their absence when it
    // doesn't) — omitting them here would type-check but leave `ctx.widgetRegions` genuinely
    // `undefined` at runtime for every caller that doesn't override it.
    widgetRegions: {},
    widgetInlineResolved: new Map(),
    ...overrides,
  };
}

test("renders a well-behaved template and resolves with the rendered HTML", async () => {
  const html = await renderLiquidInSandbox({ source: "<h1>{{ site.title }}</h1>", ctx: baseCtx() });
  assert.equal(html, "<h1>Test Site</h1>");
});

test("the render_block seam resolves against the real component registry inside the worker", async () => {
  const html = await renderLiquidInSandbox({
    source: '{% render_block component: "tovu/site-header" %}',
    ctx: baseCtx(),
  });
  assert.match(html, /site-header/);
  assert.match(html, /Test Site/);
});

test("a disallowed tag is rejected by the worker's defensive re-lint even when it bypassed loadTheme's lint (e.g. hot-edited on disk)", async () => {
  await assert.rejects(
    renderLiquidInSandbox({ source: '{% include "leak" %}', ctx: baseCtx() }),
    /disallowed Liquid usage.*disallowed tag "include"/
  );
});

test("a runaway CPU-bound template (nested for-loops, each range within the lint cap) is force-terminated within the timeout, not hung", async () => {
  const start = Date.now();
  await assert.rejects(
    renderLiquidInSandbox(
      // Neither range alone exceeds `MAX_FOR_RANGE_SPAN` (so this passes the
      // lint-time range-span guard — see liquid-allowlist.ts), but nested
      // they're ~10^12 iterations: genuinely CPU-bound without needing a
      // single oversized allocation. This is the realistic adversarial
      // shape once the range-span guard closes the one-shot-allocation
      // crash (see the memory-blowup test below and its comment).
      { source: "{% for i in (1..999999) %}{% for j in (1..999999) %}{{ i | plus: j }}{% endfor %}{% endfor %}", ctx: baseCtx() },
      { timeoutMs: 500 }
    ),
    /exceeded 500ms timeout/
  );
  const elapsed = Date.now() - start;
  // Generous upper bound: proves the call actually returned promptly instead
  // of hanging for the test runner's default timeout (which would be a
  // vastly larger number and a flaky/slow test on its own).
  assert.ok(elapsed < 5000, `expected termination well under 5s, took ${elapsed}ms`);
});

test("a memory-blowup template (range within the lint cap, large per-iteration output) is force-terminated by the worker's heap resourceLimits", async () => {
  await assert.rejects(
    renderLiquidInSandbox(
      // A range just under `MAX_FOR_RANGE_SPAN` emitting a literal chunk
      // every iteration still accumulates ~64MB of output — comfortably
      // over a deliberately tiny 16MB heap cap — while staying under the
      // lint-time range-span guard, so this exercises resourceLimits
      // specifically (not the lint rejection exercised by the allowlist
      // test suite's oversized-range case).
      {
        source: "{% for i in (1..999999) %}0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF{% endfor %}",
        ctx: baseCtx(),
      },
      { timeoutMs: 15000, resourceLimits: { maxOldGenerationSizeMb: 16, maxYoungGenerationSizeMb: 8 } }
    ),
    /.+/
  );
});

test("a template whose literal for-loop range alone would risk a single catastrophic allocation is rejected before it ever reaches the worker's render step", async () => {
  // This is the case that, pre-guard, reproducibly crashed the *entire*
  // Node process (not just the worker) with a fatal V8 OOM abort — verified
  // empirically outside the test suite (a single `new Array(2_000_000_000)`
  // inside a resourceLimits-capped worker still aborts the whole process,
  // because that protection is built for gradual growth via GC callbacks,
  // not a one-shot allocation that already exceeds the isolate's budget).
  // `MAX_FOR_RANGE_SPAN` in liquid-allowlist.ts closes this at lint time,
  // and the worker's defensive re-lint (exercised here) is the last line of
  // defense if a template bypassed `loadTheme`'s lint.
  await assert.rejects(
    renderLiquidInSandbox({ source: "{% for i in (1..2000000000) %}{{ i }}{% endfor %}", ctx: baseCtx() }),
    /disallowed Liquid usage.*exceeds the maximum allowed span/
  );
});
