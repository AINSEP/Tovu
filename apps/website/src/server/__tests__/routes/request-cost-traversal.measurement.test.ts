import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import express from "express";

import { InMemoryPostRepo } from "#src/features/post/index";
import { renderDocNode } from "../../inbound/public-http/http/site/render.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerSiteRoutes } from "../../inbound/public-http/routes/site/pages.js";
import { startTestServer } from "../helpers/http-test-server.js";

/**
 * @file Measurement instrument — deliverable C of the public-site request-cost audit: the
 * unbounded traversal (worklist #5, agreed round 1, never done). `renderDocNode` walks a TipTap-
 * shaped document tree synchronously, with a depth bound but no node-count bound, before emitting HTML. On a
 * deployed server this runs on the request thread — a pathological document blocks the event loop
 * for every concurrent visitor, not just the one requesting it. Measurements also assert successful
 * bounded-depth rendering. Run with:
 * `node --import tsx --test apps/website/src/server/__tests__/routes/request-cost-traversal.measurement.test.ts`
 *
 * `renderDocNode` is a plain, synchronous, exported function (`render.ts:606`) — calling it directly
 * with a synthetic document isolates the traversal's own cost from everything else a real request
 * does (DB reads, theme resolution, HTTP overhead), which is exactly what's needed to find where the
 * traversal itself becomes pathological, independent of B's per-render work counts.
 */

/** A `depth`-deep chain of nested bulletList > listItem, bottoming out in one paragraph of text —
 *  the shape a real editor could produce by indenting a list item repeatedly, not an artificial
 *  malformed doc. Recursion depth in `renderDocNode` is exactly proportional to this document's own
 *  nesting depth, since each level's `content` array holds exactly one child. */
function deepDoc(depth: number) {
  let node: unknown = { type: "paragraph", content: [{ type: "text", text: "leaf" }] };
  for (let i = 0; i < depth; i++) {
    node = { type: "bulletList", content: [{ type: "listItem", content: [node] }] };
  }
  return { type: "doc", content: [node] };
}

/** `count` sibling paragraphs at the top level — tests breadth/node-count cost independent of
 *  recursion depth (this shape never recurses more than 2 levels deep regardless of `count`). */
function wideDoc(count: number) {
  const content = Array.from({ length: count }, (_, i) => ({
    type: "paragraph",
    content: [{ type: "text", text: `paragraph number ${i}` }],
  }));
  return { type: "doc", content };
}

function timeRender(doc: unknown): { ms: number; ok: boolean; error?: string; htmlLength?: number; html?: string } {
  const start = performance.now();
  try {
    const html = renderDocNode(doc as never);
    const ms = performance.now() - start;
    return { ms, ok: true, htmlLength: html.length, html };
  } catch (err) {
    const ms = performance.now() - start;
    return { ms, ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
  }
}

test("C: depth curve — nested bulletList/listItem chains, where does it become pathological or crash?", () => {
  const depths = [10, 50, 100, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  const results: { depth: number; ms: number; ok: boolean; error?: string }[] = [];
  for (const depth of depths) {
    const doc = deepDoc(depth);
    const r = timeRender(doc);
    results.push({ depth, ms: r.ms, ok: r.ok, error: r.error });
    // eslint-disable-next-line no-console
    console.log(`TRAVERSAL\tdepth=${depth}\tok=${r.ok}\tms=${r.ms.toFixed(3)}\t${r.error ?? ""}`);
    assert.equal(r.ok, true, `depth=${depth}: ${r.error ?? "render must succeed"}`);
    if (depth >= 100) assert.match(r.html!, /Content too deeply nested to render/);
    else assert.match(r.html!, /<p>leaf<\/p>/);
  }
  // eslint-disable-next-line no-console
  console.log(`TRAVERSAL\tdepth curve summary\t${JSON.stringify(results)}`);
  assert.equal(results.length, depths.length);
});

test("C: breadth curve — many sibling paragraphs, does node COUNT alone cost anything at scale?", () => {
  const counts = [10, 100, 1000, 10000, 50000, 100000];
  const results: { count: number; ms: number; ok: boolean; error?: string }[] = [];
  for (const count of counts) {
    const doc = wideDoc(count);
    const r = timeRender(doc);
    results.push({ count, ms: r.ms, ok: r.ok, error: r.error });
    // eslint-disable-next-line no-console
    console.log(`TRAVERSAL\tbreadth=${count}\tok=${r.ok}\tms=${r.ms.toFixed(3)}\t${r.error ?? ""}`);
    assert.equal(r.ok, true, `breadth=${count}: ${r.error ?? "render must succeed"}`);
    assert.match(r.html!, /<p>paragraph number 0<\/p>/);
    assert.ok(r.html!.includes(`<p>paragraph number ${count - 1}</p>`));
  }
  // eslint-disable-next-line no-console
  console.log(`TRAVERSAL\tbreadth curve summary\t${JSON.stringify(results)}`);
  assert.equal(results.length, counts.length);
});

test("C: does a pathological render actually block the event loop, or does Node's I/O keep moving?", async () => {
  // The real question behind worklist #5: does ONE bad document degrade EVERY concurrent visitor.
  // A synchronous CPU-bound call blocks the event loop by definition, but proving it concretely:
  // schedule a timer for 5ms out, then run a large synchronous render, and see how late the timer
  // actually fires. If the render takes T ms and the timer fires at T ms (not 5ms), that IS the
  // "every other in-flight request waits" cost, measured directly rather than inferred from "it's
  // synchronous JS" reasoning alone.
  //
  // Deliberately WIDE, not deep. This probe was written when the depth curve above crashed past
  // ~1000 (a RangeError unwinds fast, which would convolve "the render's own duration" with "GC
  // pressure from the discarded object graph" and muddy this specific probe); `render.ts` now stops
  // at MAX_RENDER_DEPTH and emits a placeholder, so a deep document's render cost is capped and
  // still says nothing about how long a real render takes. `wideDoc(100000)` is a large document
  // that completes SUCCESSFULLY (measured ~300ms in the breadth curve above) — a clean, isolated
  // case of "a real, non-crashing render is just slow," which is the more common real-world shape
  // (a long post/page, not a maliciously-deep list) and ties the timer delay directly to render time.
  const doc = wideDoc(100000);
  let timerFiredAt = -1;
  const scheduledAt = performance.now();
  const timer = new Promise<void>((resolve) => setTimeout(() => {
    timerFiredAt = performance.now();
    resolve();
  }, 5));

  const renderResult = timeRender(doc);
  assert.equal(renderResult.ok, true, renderResult.error);
  assert.ok(renderResult.html!.includes("<p>paragraph number 99999</p>"));
  // Let the already-scheduled timer actually fire (it was due at +5ms; the render itself likely
  // already blew past that while running synchronously).
  await timer;
  assert.ok(Number.isFinite(timerFiredAt) && timerFiredAt >= scheduledAt);
  assert.ok(timerFiredAt >= scheduledAt + renderResult.ms, "the timer executes after synchronous rendering finishes");
  const timerDelayMs = timerFiredAt - scheduledAt;

  // eslint-disable-next-line no-console
  console.log(
    `TRAVERSAL\tevent-loop-block probe\trender_ms=${renderResult.ms.toFixed(3)}\ttimer_due_at=5ms\ttimer_actually_fired_at=${timerDelayMs.toFixed(3)}ms\t` +
      `${timerDelayMs > renderResult.ms * 0.5 ? "CONFIRMED: the timer was held up by the synchronous render" : "timer fired close to schedule — render may not have blocked long enough to observe at this depth"}`
  );
});

test("C: end-to-end — a real HTTP request for a 5000-deep post serves bounded content and the server keeps serving", async (t) => {
  // The isolated-function tests above prove `renderDocNode` itself bounds depth. The question that
  // actually matters for the audit is the whole request path: `pages.ts` and the widget/media
  // resolvers walk the SAME document before `renderDocNode` ever sees it, and any one of those
  // walks overflowing the stack turns the request into a 500 (this test caught exactly that in
  // `resolver-service.ts`'s `collectMediaRefAssetIds`, 2026-10-03). It also proves the failure, if
  // any, stays contained to the one request rather than taking the whole process down — which would
  // mean one pathological post/comment/import degrades EVERY concurrent visitor, not just whoever
  // requested it. Proven by hitting a REAL server over REAL HTTP, not inferred from "pages.ts has a
  // try/catch" alone — a stack-overflow exception is exactly the class of error that sometimes
  // behaves unexpectedly around catch blocks.
  const deps = createRouteDeps();
  const CRASH_POST = {
    id: "crash-test-post",
    workspaceId: deps.workspaceId,
    title: "Deeply Nested",
    slug: "crash-test",
    bodyJson: deepDoc(5000),
    bodyFormat: "doc" as const,
    bodyHtml: null,
    status: "published" as const,
    kind: "post" as const,
    updatedAt: "2026-08-12T00:00:00.000Z",
    version: 1,
  };
  deps.postRepo = new InMemoryPostRepo([CRASH_POST]);
  const app = express();
  registerSiteRoutes(app, deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/crash-test`);
  // eslint-disable-next-line no-console
  console.log(`TRAVERSAL\tend-to-end 5000-deep post request\tstatus=${res.status}\tserver process still alive: yes (this assertion is running)`);
  assert.equal(res.status, 200, "deep content must be bounded and serve successfully");
  const html = await res.text();
  assert.match(html, /class="content-ph"/);
  assert.match(html, /Content too deeply nested to render/);
  assert.doesNotMatch(html, /<p>leaf<\/p>/);

  // Prove the SERVER ITSELF is still alive and can serve a DIFFERENT, normal request right after —
  // the actual "does this take down every concurrent visitor" question.
  const followUp = await fetch(`${baseUrl}/`);
  // eslint-disable-next-line no-console
  console.log(`TRAVERSAL\tfollow-up normal request after the deep document\tstatus=${followUp.status}`);
  assert.equal(followUp.status, 200, "the server must still serve normal requests after one pathological document");
});
