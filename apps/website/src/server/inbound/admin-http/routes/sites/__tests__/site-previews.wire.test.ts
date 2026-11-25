import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from "node:assert/strict";
import { request } from "node:http";
import { test } from "node:test";
import express from "express";
import type { SitePreviewService } from "#src/features/sites/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerSitePreviewRoutes } from "#src/server/runtime/composition/modules/site-previews-route";

/**
 * Wire pin for `GET …/system/sites/:name/preview`: the hand-written Express route answered the capture with
 * `res.status(200).set(h).send(buffer)` and every refusal with `res.json`, so each answer carried
 * `Content-Length` and Express's default weak ETag, and a fresh GET/HEAD (`If-None-Match`) got a bodiless 304.
 * The expected values below were captured from that handler before it became a Jini raw spec (w4-routes);
 * the spec's buffered reply and the admin raw mount must keep them exactly, gate order included:
 * workspace 404, then the session principal (a missing one is the redacted 500), then `system.read`, then the read.
 */

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x41]);
const JPEG_ETAG = 'W/"5-jTbFWSUywzIM6jK/y3ooZfXyXG4"';
const IGNORED = new Set(["date", "connection", "keep-alive"]);
const ID = /ERR(-[0-9A-F]{4}){4}/g;
const TIME = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g;

interface Wire { status: number; headers: Record<string, string>; body: string }

/** One request over plain `node:http` (not `fetch`, which adds `Cache-Control: no-cache` to a conditional
 * request, and Express never calls such a request fresh). The body is read as latin1 so bytes compare exactly;
 * error ids and timestamps are normalized, never dropped; a 500's ETag hashes its fresh error id, so only its
 * hash part is normalized (the weak prefix and the length stay pinned). */
function send(url: string, { method = "GET", headers = {} }: { method?: string; headers?: Record<string, string> } = {}): Promise<Wire> {
  return new Promise((resolve, reject) => {
    const outgoing = request(url, { method, headers }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => {
        const status = incoming.statusCode ?? 0;
        const kept = Object.entries(incoming.headers).filter(([name]) => !IGNORED.has(name))
          .map(([name, value]) => [name, name === "etag" && status === 500 ? String(value).replace(/-[^-"]+"$/, '-HASH"') : String(value)]);
        resolve({ status, headers: Object.fromEntries(kept), body: Buffer.concat(chunks).toString("latin1").replace(ID, "ERR-ID").replace(TIME, "TIME") });
      });
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

function service(reads: string[]): SitePreviewService {
  return {
    versions: () => ({}),
    read: ({ name }) => {
      reads.push(name);
      if (name === "boom") throw new Error("/secret/path EACCES");
      return name === "alpha" ? JPEG : null;
    },
    idle: async () => {},
  };
}

/** The route behind a stand-in session layer: `x-principal` names the principal; `operator` is allowed. */
async function serve(t: import("node:test").TestContext, { withService = true }: { withService?: boolean } = {}) {
  const routeErrors = createRouteIncidentReporter().errors;
  const app = express();
  const reads: string[] = [];
  app.use((req, res, next) => { if (req.get("x-principal")) res.locals.principal = { id: req.get("x-principal") }; next(); });
  registerSitePreviewRoutes({ errors: routeErrors, app, deps: {
    workspaceId: "ws",
    authorize: async ({ principalId }) => ({ allowed: principalId === "operator", reason: "test" }),
    ...(withService ? { sitePreviews: service(reads) } : {}),
  } });
  return { base: `${await startTestServer(app, t)}/api/admin/v1/workspaces`, reads };
}

const OPERATOR = { "x-principal": "operator" };
const X_POWERED = { "x-powered-by": "Express" };
const IMAGE_HEADERS = { ...X_POWERED, "content-type": "image/jpeg", "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-length": "5", etag: JPEG_ETAG };
const json = (length: number, etag: string) => ({ ...X_POWERED, "content-type": "application/json; charset=utf-8", "content-length": String(length), etag });
const NOT_FOUND = { status: 404, headers: json(54, 'W/"36-HbRzjz40C4qCNNum5Kcb5yFDWWo"'), body: '{"code":"SITE_PREVIEW_NOT_FOUND","error":"no preview"}' };
const FOREIGN = { status: 404, headers: json(35, 'W/"23-/DVjqsKg1w233TI9sFJj9WaL+M4"'), body: '{"error":"workspace was not found"}' };
const NO_PRINCIPAL_BODY = '{"code":"INTERNAL_ERROR","errorId":"ERR-ID","error":"The sites could not be loaded. Try loading them again. If it still fails, Report this error ID. (error ERR-ID)"}';

test("200: the capture's exact bytes, Content-Length and Express's weak ETag; HEAD has the same head and no body", async (t) => {
  const { base, reads } = await serve(t);
  assert.deepEqual(await send(`${base}/ws/system/sites/alpha/preview?v=1`, { headers: OPERATOR }), { status: 200, headers: IMAGE_HEADERS, body: JPEG.toString("latin1") });
  assert.deepEqual(await send(`${base}/ws/system/sites/alpha/preview`, { method: "HEAD", headers: OPERATOR }), { status: 200, headers: IMAGE_HEADERS, body: "" });
  assert.deepEqual(reads, ["alpha", "alpha"]);
});

test("a fresh conditional GET/HEAD is a bodiless 304; a stale one gets the bytes", async (t) => {
  const { base } = await serve(t);
  const url = `${base}/ws/system/sites/alpha/preview?v=1`;
  const notModified = { status: 304, headers: { ...X_POWERED, "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff", etag: JPEG_ETAG }, body: "" };
  assert.deepEqual(await send(url, { headers: { ...OPERATOR, "if-none-match": JPEG_ETAG } }), notModified);
  assert.deepEqual(await send(url, { method: "HEAD", headers: { ...OPERATOR, "if-none-match": JPEG_ETAG } }), notModified);
  assert.deepEqual(await send(url, { headers: { ...OPERATOR, "if-none-match": 'W/"5-stale"' } }), { status: 200, headers: IMAGE_HEADERS, body: JPEG.toString("latin1") });
});

test("404 for a site without a capture, and for every site on a host without a preview service", async (t) => {
  const { base, reads } = await serve(t);
  assert.deepEqual(await send(`${base}/ws/system/sites/beta/preview`, { headers: OPERATOR }), NOT_FOUND);
  assert.deepEqual(reads, ["beta"]);
  const bare = await serve(t, { withService: false });
  assert.deepEqual(await send(`${bare.base}/ws/system/sites/alpha/preview`, { headers: OPERATOR }), NOT_FOUND);
});

test("refusal order: foreign workspace 404 before the session, missing session 500 before authorization, 403 before any read", async (t) => {
  const { base, reads } = await serve(t);
  const original = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await send(`${base}/other/system/sites/alpha/preview`), FOREIGN);
    assert.deepEqual(await send(`${base}/other/system/sites/alpha/preview`, { headers: { "x-principal": "eve" } }), FOREIGN);
    assert.deepEqual(await send(`${base}/ws/system/sites/alpha/preview`), { status: 500, headers: json(199, 'W/"c7-HASH"'), body: NO_PRINCIPAL_BODY });
  } finally {
    console.error = original;
  }
  assert.deepEqual(await send(`${base}/ws/system/sites/alpha/preview`, { headers: { "x-principal": "eve" } }), {
    status: 403,
    headers: json(144, 'W/"90-qTzzUb+U3elvSqABEsjHadbq17Y"'),
    body: `{"error":"principal 'eve' is not authorized for 'system.read' (test)","code":"FORBIDDEN","details":{"permission":"system.read","reason":"test"}}`,
  });
  assert.deepEqual(reads, []);
});

test("a read that throws is the redacted 500: route-derived copy, no error text", async (t) => {
  const { base } = await serve(t);
  const original = console.error;
  console.error = () => {};
  let answer: Wire;
  try {
    answer = await send(`${base}/ws/system/sites/boom/preview`, { headers: OPERATOR });
  } finally {
    console.error = original;
  }
  assert.equal(answer.status, 500);
  assert.deepEqual(answer.headers, json(801, 'W/"321-HASH"'));
  assert.doesNotMatch(answer.body, /secret|EACCES/);
  const message = "The sites could not be loaded.";
  const action = "Try loading them again. If it still fails, copy details and report this problem.";
  assert.deepEqual(JSON.parse(answer.body), {
    code: "INTERNAL_ERROR",
    errorId: "ERR-ID",
    details: { failure: {
      message, action, step: "Load sites", cause: "The error ID identifies the server report.", errorId: "ERR-ID", time: "TIME",
      copyText: `Message: ${message}\nNext action: ${action}\nError ID: ERR-ID\nStep: Load sites\nCause: The error ID identifies the server report.\nTime: TIME`,
    } },
    error: `${message} ${action} (error ERR-ID)`,
  });
  assert.deepEqual(Object.keys(JSON.parse(answer.body)), ["code", "errorId", "details", "error"]);
});
