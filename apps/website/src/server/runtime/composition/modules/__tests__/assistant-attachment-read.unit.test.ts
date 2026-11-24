import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import test from "node:test";

import express from "express";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminChatAttachmentReadRoute } from "../assistant-attachment-read.js";

/**
 * @file The attachment read route is a bridged Jini route; Express's `res.send` used to add an ETag
 * to every finished body and answer a matching `If-None-Match` with 304. These pins hold the exact
 * values the hand-written Express route sent (captured from it before the conversion).
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const PNG_ETAG = 'W/"10-r4SYYu5Go1HfNbojGP6SICn0Jt8"';

/** A raw request: `fetch` adds `Cache-Control: no-cache` whenever `If-None-Match` is set, which no 304 survives. */
function rawGet(url: string, headers: Record<string, string>, method = "GET"): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; length: number; text: string }> {
  return new Promise((resolve, reject) => {
    httpRequest(url, { headers, method }, (res) => {
      let length = 0;
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => { length += chunk.byteLength; chunks.push(chunk); });
      res.on("end", () => { resolve({ status: res.statusCode ?? 0, headers: res.headers, length, text: Buffer.concat(chunks).toString("utf8") }); });
    }).on("error", reject).end();
  });
}

interface RouterLayer { name: string; route?: { path: unknown; methods: Record<string, boolean> } }

function buildApp(): express.Express {
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner-1" }; next(); });
  registerAdminChatAttachmentReadRoute({ app, deps: { uploadDirectory: "/unused", readChatAttachmentForOwner: async (_deps, { ref }) => (
    ref === "png" ? { ok: true, bytes: PNG } : { ok: false, reason: "not-found" }
  ) as Awaited<ReturnType<NonNullable<Parameters<typeof registerAdminChatAttachmentReadRoute>[0]["deps"]["readChatAttachmentForOwner"]>>> } });
  return app;
}

async function serve(t: test.TestContext): Promise<string> {
  return `${await startTestServer(buildApp(), t)}/api/attachments`;
}

test("attachment read keeps Express's weak ETag on every finished body", async (t) => {
  const base = await serve(t);
  const full = await fetch(`${base}/png`);
  assert.equal(full.headers.get("etag"), PNG_ETAG);
  assert.equal(full.headers.get("content-length"), "16");
  const partial = await fetch(`${base}/png`, { headers: { range: "bytes=2-5" } });
  assert.equal(partial.headers.get("etag"), 'W/"4-V5MAilUGfipydU8hNOD+wRCgnpU"');
  const missing = await fetch(`${base}/nope`);
  assert.equal(missing.headers.get("etag"), 'W/"37-JW7WQy07V2B7vfnZ8YMDJsY0G1I"');
  const unsatisfiable = await fetch(`${base}/png`, { headers: { range: "bytes=100-200" } });
  assert.equal(unsatisfiable.status, 416);
  assert.equal(unsatisfiable.headers.get("etag"), null, "a bodiless 416 never carried one");
});

test("attachment read answers a matching If-None-Match with Express's bodiless 304", async (t) => {
  const base = await serve(t);
  const cached = await rawGet(`${base}/png`, { "if-none-match": PNG_ETAG });
  assert.equal(cached.status, 304);
  assert.equal(cached.headers.etag, PNG_ETAG);
  assert.equal(cached.headers["content-type"], undefined);
  assert.equal(cached.headers["cache-control"], "private, no-store");
  assert.equal(cached.length, 0);
  const noCache = await rawGet(`${base}/png`, { "if-none-match": PNG_ETAG, "cache-control": "no-cache" });
  assert.equal(noCache.status, 200, "a no-cache request is never fresh");
  const stale = await rawGet(`${base}/png`, { "if-none-match": 'W/"other"' });
  assert.equal(stale.status, 200);
  const notFound = await rawGet(`${base}/nope`, { "if-none-match": 'W/"37-JW7WQy07V2B7vfnZ8YMDJsY0G1I"' });
  assert.equal(notFound.status, 404, "only a 2xx can be fresh");
});

test("attachment read is a GET method route at its own path, never an app.use dispatcher layer", () => {
  const stack = (buildApp() as unknown as { _router: { stack: RouterLayer[] } })._router.stack;
  const last = stack[stack.length - 1];
  assert.equal(last?.route?.path, "/api/attachments/:ref", "the registered layer is a route row, as the route-table pin records it");
  assert.deepEqual(last?.route?.methods, { get: true });
});

test("attachment read: an authenticated OPTIONS gets Express's own Allow answer for a GET route", async (t) => {
  const base = await serve(t);
  const options = await rawGet(`${base}/png`, {}, "OPTIONS");
  assert.equal(options.status, 200);
  assert.equal(options.headers.allow, "GET,HEAD");
  assert.equal(options.headers["content-type"], "text/html; charset=utf-8");
  assert.equal(options.text, "GET,HEAD");
});

test("attachment read: a HEAD answers with the GET's validators and no body, and is 304 when fresh", async (t) => {
  const base = await serve(t);
  const head = await rawGet(`${base}/png`, {}, "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.headers.etag, PNG_ETAG);
  assert.equal(head.headers["content-length"], "16");
  assert.equal(head.length, 0);
  const cached = await rawGet(`${base}/png`, { "if-none-match": PNG_ETAG }, "HEAD");
  assert.equal(cached.status, 304);
  assert.equal(cached.headers.etag, PNG_ETAG);
  assert.equal(cached.headers["content-type"], undefined);
  const stale = await rawGet(`${base}/png`, { "if-none-match": 'W/"other"' }, "HEAD");
  assert.equal(stale.status, 200);
});
