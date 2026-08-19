import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import express from "express";

import { InMemoryPostRepo } from "../../../features/post/index.js";
import { renderDocNode } from "../../http/site/render.js";
import { createRouteDeps } from "../../app.js";
import { registerSiteRoutes } from "../../routes/site/pages.js";
import { startTestServer } from "../helpers/http-test-server.js";

/**
 * @file Measurement instrument — deliverable C of the public-site request-cost audit: the
 * unbounded traversal (worklist #5, agreed round 1, never done). `renderDocNode` walks a TipTap-
 * shaped document tree synchronously, with no depth or node-count bound, before emitting HTML. On a
 * deployed server this runs on the request thread — a pathological document blocks the event loop
 * for every concurrent visitor, not just the one requesting it. MEASUREMENT-ONLY. Run with:
 * `node --import tsx --test src/server/__tests__/routes/request-cost-traversal.measurement.test.ts`
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

function timeRender(doc: unknown): { ms: number; ok: boolean; error?: string; htmlLength?: number } {
  const start = performance.now();
  try {
    const html = renderDocNode(doc as never);
    const ms = performance.now() - start;
    return { ms, ok: true, htmlLength: html.length };
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
    if (!r.ok) break; // no point measuring deeper once it's already crashing
  }
  // eslint-disable-next-line no-console
  console.log(`TRAVERSAL\tdepth curve summary\t${JSON.stringify(results)}`);
  assert.ok(results.length > 0);
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
    if (!r.ok) break;
  }
  // eslint-disable-next-line no-console
  console.log(`TRAVERSAL\tbreadth curve summary\t${JSON.stringify(results)}`);
  assert.ok(results.length > 0);
});

test("C: does a pathological render actually block the event loop, or does Node's I/O keep moving?", async () => {
  // The real question behind worklist #5: does ONE bad document degrade EVERY concurrent visitor.
  // A synchronous CPU-bound call blocks the event loop by definition, but proving it concretely:
  // schedule a timer for 5ms out, then run a large synchronous render, and see how late the timer
  // actually fires. If the render takes T ms and the timer fires at T ms (not 5ms), that IS the
  // "every other in-flight request waits" cost, measured directly rather than inferred from "it's
  // synchronous JS" reasoning alone.
  //
  // Deliberately WIDE, not deep: the depth curve above already crashes past ~1000 (a RangeError
  // unwinds fast, which would convolve "the render's own duration" with "GC pressure from the
  // discarded object graph" and muddy this specific probe). `wideDoc(100000)` is a large document
  // that completes SUCCESSFULLY (measured ~300ms in the breadth curve above) — a clean, isolated
  // case of "a real, non-crashing render is just slow," which is the more common real-world shape
  // (a long post/page, not a maliciously-deep list) and ties the timer delay directly to render time.
  const doc = wideDoc(100000);
  let timerFiredAt = -1;
  const scheduledAt = performance.now();
  setTimeout(() => {
    timerFiredAt = performance.now();
  }, 5);

  const renderResult = timeRender(doc);
  // Let the already-scheduled timer actually fire (it was due at +5ms; the render itself likely
  // already blew past that while running synchronously).
  await new Promise((resolve) => setTimeout(resolve, 20));
  const timerDelayMs = timerFiredAt - scheduledAt;

  // eslint-disable-next-line no-console
  console.log(
    `TRAVERSAL\tevent-loop-block probe\trender_ms=${renderResult.ms.toFixed(3)}\ttimer_due_at=5ms\ttimer_actually_fired_at=${timerDelayMs.toFixed(3)}ms\t` +
      `${timerDelayMs > renderResult.ms * 0.5 ? "CONFIRMED: the timer was held up by the synchronous render" : "timer fired close to schedule — render may not have blocked long enough to observe at this depth"}`
  );
});

test("C: end-to-end — does a real HTTP request for a 1000-deep post crash the SERVER, or just that one response?", async (t) => {
  // The isolated-function test above proved `renderDocNode` throws RangeError at depth 1000. The
  // question that actually matters for the audit: does that exception stay contained to the one
  // request (pages.ts's own try/catch -> 500), or does it escape and take the whole process down —
  // which would mean one pathological post/comment/import degrades EVERY concurrent visitor, not
  // just whoever requested it. Proven by hitting a REAL server over REAL HTTP, not inferred from
  // "pages.ts has a try/catch" alone — a stack-overflow exception is exactly the class of error that
  // sometimes behaves unexpectedly around catch blocks.
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
  assert.equal(res.status, 500, "the stack overflow should be caught by pages.ts's own try/catch and degrade to a 500, not crash the process");

  // Prove the SERVER ITSELF is still alive and can serve a DIFFERENT, normal request right after —
  // the actual "does this take down every concurrent visitor" question.
  const followUp = await fetch(`${baseUrl}/`);
  // eslint-disable-next-line no-console
  console.log(`TRAVERSAL\tfollow-up normal request after the crash\tstatus=${followUp.status}`);
  assert.equal(followUp.status, 200, "the server must still serve normal requests after one pathological document");
});
