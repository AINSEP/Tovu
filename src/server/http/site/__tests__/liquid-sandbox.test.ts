import assert from "node:assert/strict";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import { renderLiquidInSandbox } from "../liquid-sandbox.js";
import type { SiteRenderContext } from "../render.js";

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
    // `products` is required on `SiteRenderContext` for exactly the same reason and with exactly
    // the same TS blind spot the comment above describes — the trailing spread suppresses the
    // object-literal completeness check, so omitting it type-checked while leaving `ctx.products`
    // genuinely `undefined`, which threw inside the worker's render-data shaping on every call.
    products: [],
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
    // Exact text, not just a substring match: the message is built from a shared template
    // (`worker-sandbox.ts`'s `renderInWorkerSandbox`) parameterized by an `errorLabel` string this
    // wrapper passes in — a future swap of that literal between the Liquid/Handlebars wrappers would
    // still produce a message matching a looser `/exceeded 500ms timeout/` regex, so it must be
    // checked exactly to catch that class of bug.
    (err: Error) => {
      assert.equal(err.message, "Liquid render exceeded 500ms timeout");
      return true;
    }
  );
  const elapsed = Date.now() - start;
  // Generous upper bound: proves the call actually returned promptly instead
  // of hanging for the test runner's default timeout (which would be a
  // vastly larger number and a flaky/slow test on its own).
  assert.ok(elapsed < 5000, `expected termination well under 5s, took ${elapsed}ms`);
});

test("a memory-blowup template (range within the lint cap, accumulating retained allocations) is force-terminated by the worker's memory guards", async () => {
  // A range well under `MAX_FOR_RANGE_SPAN` that RETAINS what it allocates —
  // each iteration appends to a variable that stays live — so heap pressure
  // actually accumulates instead of streaming straight out. This is the shape
  // the worker's memory guards catch, and it is caught by LiquidJS's own
  // `memoryLimit` (`liquid-worker.ts`) before V8's `resourceLimits` ceiling is
  // ever reached, which is the intended defense-in-depth ordering: the cheaper,
  // more precise limit fires first and reports a clean error rather than
  // killing the worker.
  //
  // KNOWN GAP, deliberately not asserted here because it is not currently true:
  // the same loop STREAMING its output instead of retaining it
  // (`{% for i in (1..999999) %}<64 literal bytes>{% endfor %}`) is bounded by
  // neither `memoryLimit` nor `resourceLimits` — it completes in ~1.2s and
  // returns ~64MB of HTML. Verified empirically. Neither guard is wrong: the
  // output is a rope/large-object string rather than retained young-generation
  // heap, and `renderLimit` is a time budget the render finishes well inside.
  // Bounding total output size is a separate mitigation this layer does not yet
  // have; it applies identically to the Handlebars tier, which mirrors this
  // sandbox. Recorded here rather than silently passed over — an earlier
  // revision of this test appeared to cover the streaming case but was in fact
  // passing because its `baseCtx()` fixture omitted the required `products`
  // field, so the worker threw before rendering anything at all.
  await assert.rejects(
    renderLiquidInSandbox(
      {
        source:
          '{% assign s = "" %}{% for i in (1..200000) %}{% assign s = s | append: "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF" %}{% endfor %}{{ s }}',
        ctx: baseCtx(),
      },
      // maxOldGenerationSizeMb: 32, not 16 — empirically, a worker this codebase's current module
      // graph spins up (render.ts + the theme feature + LiquidJS itself) already needs ~20-24MB of
      // old-gen heap just to BOOT, before any template runs at all; verified live by rendering the
      // trivial template "hello {{ site.title }}" through this same sandbox at maxOldGenerationSizeMb
      // 16/20 (ERR_WORKER_OUT_OF_MEMORY on both) vs. 24/28/32 (renders fine). 16MB made this test
      // assert on the wrong guard — V8's OWN ceiling was tripping on baseline boot cost, before the
      // adversarial template ever got a chance to run, let alone before LiquidJS's cheaper
      // `memoryLimit` guard could catch it. 32MB leaves real headroom above that boot floor while
      // staying well under `DEFAULT_RESOURCE_LIMITS`'s 64MB — confirmed the memory-blowup template
      // below still throws `memory alloc limit exceeded` (LiquidJS's own guard, not V8's) at 32/40/48MB.
      { timeoutMs: 15000, resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8 } }
    ),
    /memory alloc limit exceeded/
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
