import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from "node:assert/strict";
import { request } from "node:http";
import { test } from "node:test";
import express from "express";
import type { AdminSurfaceSource } from "#src/features/agent-plugins/admin-surfaces/surfaces";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminSurfaceFilesRoute } from "#src/server/runtime/composition/modules/agent-plugin-surface-files-route";

/**
 * Wire pin for `AGENT_PLUGIN_SURFACE_FILE`: the hand-written Express route answered with `res.send`, so every
 * answer carried `Content-Length` and Express's default weak ETag, and a GET/HEAD whose `If-None-Match` /
 * `If-Modified-Since` made it fresh got a bodiless 304. The expected values below were captured from that
 * handler before it became a Jini raw spec (w4-routes); the spec's buffered reply must keep them exactly.
 */

const FILES: Readonly<Record<string, string>> = {
  "index.html": "<!doctype html><title>Surface ✓</title><script type=\"module\" src=\"app.mjs\"></script>",
  "app.mjs": "export const ready = true;\n",
  "data.bin": "opaque ✓ text",
};

const SOURCE: AdminSurfaceSource = {
  list: async () => [{
    plugin: { pluginId: "p1" },
    descriptor: { id: "settings", title: "Settings", entry: "index.html", files: ["app.mjs", "data.bin"], actions: [], csp: {} },
  }] as never,
  readFile: async ({ filename }) => FILES[filename] ?? "",
};

const IGNORED = new Set(["date", "connection", "keep-alive"]);

async function wire(response: Response): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const headers = Object.fromEntries([...response.headers].filter(([name]) => !IGNORED.has(name)));
  return { status: response.status, headers, body: await response.text() };
}

/**
 * A conditional request over plain `node:http`, as a browser revalidation sends it. Not `fetch`: undici adds
 * `Cache-Control: no-cache` to any request carrying `If-None-Match`, and Express never calls such a request fresh.
 */
function conditional(url: string, { method = "GET", headers = {} }: { method?: string; headers?: Record<string, string> } = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const outgoing = request(url, { method, headers }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => {
        const head = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) for (const item of [value ?? []].flat()) head.append(name, item);
        const status = incoming.statusCode ?? 0;
        resolve(new Response(status === 304 ? null : Buffer.concat(chunks), { status, headers: head }));
      });
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

async function serve(t: import("node:test").TestContext, limiter?: { check: () => Promise<{ allowed: false; retryAfterSeconds: number }> }): Promise<string> {
  const routeErrors = createRouteIncidentReporter().errors;
  const app = express();
  registerAdminSurfaceFilesRoute({ errors: routeErrors, app, deps: {
    workspaceId: "ws-1", clock: { nowMs: () => 0 },
    agentPluginLifecycle: { loadPluginContributions: async () => { throw new Error("the source seam is used"); }, readTrustedPluginFile: async () => "unused" },
    adminSurfaceSource: SOURCE,
  } }, limiter ? { limiter: limiter as never } : {});
  return `${await startTestServer(app, t)}/api/agent-plugin-surfaces/v1/p1/settings`;
}

const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; sandbox allow-scripts";
const ISOLATION = { "cache-control": "no-cache", "content-security-policy": CSP, "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "x-powered-by": "Express" };
const ENTRY_ETAG = 'W/"56-cbAxhXede3gFXAw/BOvBpq1ISEw"';

test("surface files: 200 carries Content-Length and Express's weak ETag; unknown extensions keep the utf-8 charset", async (t) => {
  const base = await serve(t);
  assert.deepEqual(await wire(await fetch(`${base}/index.html`)), {
    status: 200,
    headers: { ...ISOLATION, "content-length": "86", "content-type": "text/html; charset=utf-8", etag: ENTRY_ETAG },
    body: FILES["index.html"],
  });
  assert.deepEqual(await wire(await fetch(`${base}/app.mjs`)), {
    status: 200,
    headers: { ...ISOLATION, "access-control-allow-origin": "*", "content-length": "27", "content-type": "text/javascript; charset=utf-8", etag: 'W/"1b-hoAKgFuO5q6M3IZIQYTyZ7hJTGs"' },
    body: FILES["app.mjs"],
  });
  assert.deepEqual(await wire(await fetch(`${base}/data.bin`)), {
    status: 200,
    headers: { ...ISOLATION, "content-length": "15", "content-type": "application/octet-stream; charset=utf-8", etag: 'W/"f-VYk3HEdzqMkKRNlGk1tSftecoYk"' },
    body: FILES["data.bin"],
  });
});

test("surface files: a matching If-None-Match answers 304 with no body; HEAD answers the head only", async (t) => {
  const base = await serve(t);
  assert.deepEqual(await wire(await conditional(`${base}/index.html`, { headers: { "if-none-match": ENTRY_ETAG } })), {
    status: 304, headers: { ...ISOLATION, etag: ENTRY_ETAG }, body: "",
  });
  const modified = { "last-modified": "Tue, 01 Sep 2026 00:00:00 GMT" };
  assert.equal((await conditional(`${base}/index.html`, { headers: { "if-modified-since": modified["last-modified"] } })).status, 200, "no Last-Modified is sent, so a date alone never makes it fresh");
  assert.equal((await conditional(`${base}/index.html`, { headers: { "if-none-match": 'W/"stale"' } })).status, 200);
  assert.deepEqual(await wire(await fetch(`${base}/index.html`, { method: "HEAD" })), {
    status: 200,
    headers: { ...ISOLATION, "content-length": "86", "content-type": "text/html; charset=utf-8", etag: ENTRY_ETAG },
    body: "",
  });
});

test("surface files: the 404 and 429 refusals keep their plain-text bodies, length and ETag", async (t) => {
  const base = await serve(t);
  assert.deepEqual(await wire(await conditional(`${base}/undeclared.js`, { headers: { "if-none-match": 'W/"9-R1yEhnOj95+nePAcK9WnIdTEFwc"' } })), {
    status: 404,
    headers: { "cache-control": "no-store", "content-length": "9", "content-type": "text/plain; charset=utf-8", etag: 'W/"9-R1yEhnOj95+nePAcK9WnIdTEFwc"', "x-content-type-options": "nosniff", "x-powered-by": "Express" },
    body: "Not found",
  });
  const limited = await serve(t, { check: async () => ({ allowed: false, retryAfterSeconds: 7 }) });
  assert.deepEqual(await wire(await fetch(`${limited}/index.html`)), {
    status: 429,
    headers: { "cache-control": "no-store", "content-length": "17", "content-type": "text/plain; charset=utf-8", etag: 'W/"11-H1XJDVzmHGRH6SNEPUlrE3vjXGM"', "retry-after": "7", "x-content-type-options": "nosniff", "x-powered-by": "Express" },
    body: "Too many requests",
  });
});
