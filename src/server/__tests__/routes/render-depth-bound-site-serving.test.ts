import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { InMemoryPostRepo } from "../../../features/post/index.js";
import { createRouteDeps } from "../../app.js";
import { registerSiteRoutes } from "../../routes/site/pages.js";
import { startTestServer } from "../helpers/http-test-server.js";

/**
 * @file Worklist #5 regression (TM-TOVU-2026-08-12-A request-cost audit) — end-to-end half.
 * `src/server/http/site/__tests__/render.test.ts` pins the isolated `renderDocNode` behavior; this
 * file pins the thing that actually changed for a real visitor: BEFORE this fix, a real GET request
 * for a too-deep post 500'd (the `RangeError` escaping `renderSite`, caught by `pages.ts`'s own
 * try/catch). AFTER, the SAME request must serve 200 with the bounded content plus a placeholder —
 * containment behavior, not just the isolated function's return value, which is why this needs the
 * real HTTP path (same harness as `request-cost-*.measurement.test.ts`, `createRouteDeps()`'s
 * in-memory repos + `startTestServer`'s real `node:http` server).
 */

function deepBulletChain(depth: number) {
  let node: unknown = { type: "paragraph", content: [{ type: "text", text: "leaf-marker" }] };
  for (let i = 0; i < depth; i++) {
    node = { type: "bulletList", content: [{ type: "listItem", content: [node] }] };
  }
  return { type: "doc", content: [node] };
}

test("worklist #5 regression: a real HTTP request for a too-deep post serves 200 with a placeholder, not a 500", async (t) => {
  const deps = createRouteDeps();
  const post = {
    id: "too-deep",
    workspaceId: deps.workspaceId,
    title: "Too Deep",
    slug: "too-deep",
    // Comfortably past both the measured crash boundary (depth ~500-560, see
    // request-cost-traversal.measurement.test.ts) and MAX_RENDER_DEPTH (200) — this is testing the
    // fix, not a value that happens to sit below either.
    bodyJson: deepBulletChain(600) as never,
    bodyFormat: "doc" as const,
    bodyHtml: null,
    status: "published" as const,
    kind: "post" as const,
    updatedAt: "2026-08-12T00:00:00.000Z",
    version: 1,
  };
  deps.postRepo = new InMemoryPostRepo([post]);
  const app = express();
  registerSiteRoutes(app, deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/too-deep`);
  const html = await res.text();

  assert.equal(res.status, 200, "the page must serve successfully, not 500, once the render is bounded");
  assert.ok(html.includes("content-ph"), "the bounded page must show the depth placeholder somewhere in the body");
  assert.ok(!html.includes("leaf-marker"), "content past the bound was never reached, not truncated mid-render");
});

test("worklist #5 regression: an ordinary post (well within the bound) is completely unaffected", async (t) => {
  const deps = createRouteDeps();
  const post = {
    id: "ordinary",
    workspaceId: deps.workspaceId,
    title: "An Ordinary Post",
    slug: "ordinary-post",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello world" }] }] } as never,
    bodyFormat: "doc" as const,
    bodyHtml: null,
    status: "published" as const,
    kind: "post" as const,
    updatedAt: "2026-08-12T00:00:00.000Z",
    version: 1,
  };
  deps.postRepo = new InMemoryPostRepo([post]);
  const app = express();
  registerSiteRoutes(app, deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/ordinary-post`);
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.ok(html.includes("hello world"), "ordinary content must render exactly as before this change");
  assert.ok(!html.includes("content-ph"), "an ordinary post must never show the depth placeholder");
});
