import { createRouteIncidentReporter } from "./helpers/route-incident-reporter.js";
import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";

import { createApp, createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import { registerAdminMediaOriginalRoute } from "../inbound/admin-http/routes/media/original.js";
import { bootAuthenticated } from "./helpers/http-test-server.js";
import { registerTransform, uploadMedia } from "../../features/media/index.js";

/**
 * @file Wire pins for the media byte-serving responses (status, headers, body bytes) of the admin
 * original route, the public `/m/:id/original` route and the public rendition route: full GET, HEAD,
 * Range 206, bad range 416, If-None-Match 304 (Express's own freshness check), and missing 404. Written GREEN against the Express code
 * BEFORE the framework-neutral decision core moved into `@jini-ai/cms/media`, so a move cannot
 * silently change a status, a header or a byte.
 */

const WORKSPACE_ID = "workspace-local";
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x41, 0x42]); // 20 bytes
const WIRE_HEADERS = ["x-content-type-options", "content-security-policy", "cross-origin-resource-policy", "cache-control", "content-type", "accept-ranges", "content-disposition", "content-range", "content-length"] as const;

function wireOf(res: Response): Record<string, string | null> {
  return Object.fromEntries(WIRE_HEADERS.map(name => [name, res.headers.get(name)]));
}

const SAFE_HEADERS = {
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; sandbox",
  "cross-origin-resource-policy": "same-origin",
  "cache-control": "private, no-store",
  "content-type": "image/png",
  "accept-ranges": "bytes",
  "content-disposition": null,
  "content-range": null,
  "content-length": "20",
} as const;

async function pinOriginalResponses({ url, headers }: { url: string; headers: Record<string, string> }, _optional = {}): Promise<void> {
  const full = await fetch(url, { headers });
  assert.equal(full.status, 200);
  assert.deepEqual(wireOf(full), SAFE_HEADERS);
  assert.deepEqual(new Uint8Array(await full.arrayBuffer()), PNG_BYTES);
  // (`cache: "no-cache"` below: fetch's default cache mode would add `Cache-Control: no-cache`, which defeats Express's freshness check.)
  // Express `res.send(Buffer)` adds a weak ETag and answers a matching If-None-Match with 304 itself.
  const etag = full.headers.get("etag");
  assert.match(etag ?? "", /^W\/"/);

  const head = await fetch(url, { method: "HEAD", headers });
  assert.equal(head.status, 200);
  assert.deepEqual(wireOf(head), SAFE_HEADERS);
  assert.equal(head.headers.get("etag"), etag);
  assert.equal((await head.arrayBuffer()).byteLength, 0, "HEAD carries no body");

  const partial = await fetch(url, { headers: { ...headers, Range: "bytes=8-11" } });
  assert.equal(partial.status, 206);
  assert.deepEqual(wireOf(partial), { ...SAFE_HEADERS, "content-range": "bytes 8-11/20", "content-length": "4" });
  assert.deepEqual(new Uint8Array(await partial.arrayBuffer()), PNG_BYTES.subarray(8, 12));

  const lastByte = await fetch(url, { headers: { ...headers, Range: "bytes=19-19" } });
  assert.equal(lastByte.status, 206);
  assert.equal(lastByte.headers.get("content-range"), "bytes 19-19/20");
  assert.deepEqual(new Uint8Array(await lastByte.arrayBuffer()), PNG_BYTES.subarray(19, 20));

  const bad = await fetch(url, { headers: { ...headers, Range: "bytes=20-30" } });
  assert.equal(bad.status, 416);
  assert.deepEqual(wireOf(bad), { ...SAFE_HEADERS, "content-range": "bytes */20", "content-length": "0" });
  assert.equal((await bad.arrayBuffer()).byteLength, 0);

  const notModified = await fetch(url, { cache: "no-cache", headers: { ...headers, "If-None-Match": etag ?? "" } });
  assert.equal(notModified.status, 304);
  assert.deepEqual({ ...wireOf(notModified), "content-length": null, "content-type": null }, { ...Object.fromEntries(WIRE_HEADERS.map(n => [n, null])), "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox", "cross-origin-resource-policy": "same-origin", "cache-control": "private, no-store", "accept-ranges": "bytes" });
  assert.equal(notModified.headers.get("etag"), etag);
  assert.equal((await notModified.arrayBuffer()).byteLength, 0);
  const stale = await fetch(url, { cache: "no-cache", headers: { ...headers, "If-None-Match": '"other"' } });
  assert.equal(stale.status, 200);
}

test("wire pin: admin media original — full GET, HEAD, Range 206, bad range 416, If-None-Match, missing 404", async (t) => {
  const deps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes({ app, deps, errors: createRouteIncidentReporter().errors });
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminMediaOriginalRoute({ errors: createRouteIncidentReporter().errors, app, deps });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const { media } = await uploadOne(deps, PNG_BYTES, "pin.png", "image/png");
  const base = `${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/media`;

  await pinOriginalResponses({ url: `${base}/${media.id}/original`, headers: { cookie } });

  const missing = await fetch(`${base}/no-such-media/original`, { headers: { cookie } });
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "media 'no-such-media' was not found" });
  assert.equal(missing.headers.get("cache-control"), null);
});

test("wire pin: public media original (/m/:id/original) — full GET, HEAD, Range 206, bad range 416, If-None-Match, missing 404", async () => {
  await withServer(async (baseUrl, deps) => {
    const mp4 = new Uint8Array(20);
    mp4.set(new TextEncoder().encode("ftyp"), 4);
    mp4.set(new TextEncoder().encode("isom"), 8);
    const { media } = await uploadOne(deps, mp4, "pin.mp4", "video/mp4");
    const url = `${baseUrl}/m/${media.id}/original`;

    const full = await fetch(url);
    assert.equal(full.status, 200);
    assert.deepEqual(wireOf(full), { ...SAFE_HEADERS, "content-type": "video/mp4" });
    assert.deepEqual(new Uint8Array(await full.arrayBuffer()), mp4);
    const head = await fetch(url, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.deepEqual(wireOf(head), { ...SAFE_HEADERS, "content-type": "video/mp4" });
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    const partial = await fetch(url, { headers: { Range: "bytes=4-7" } });
    assert.equal(partial.status, 206);
    assert.deepEqual(wireOf(partial), { ...SAFE_HEADERS, "content-type": "video/mp4", "content-range": "bytes 4-7/20", "content-length": "4" });
    assert.deepEqual(new Uint8Array(await partial.arrayBuffer()), mp4.subarray(4, 8));
    const bad = await fetch(url, { headers: { Range: "bytes=99-100" } });
    assert.equal(bad.status, 416);
    assert.equal(bad.headers.get("content-range"), "bytes */20");
    const etag = full.headers.get("etag");
    assert.match(etag ?? "", /^W\/"/);
    assert.equal((await fetch(url, { cache: "no-cache", headers: { "If-None-Match": etag ?? "" } })).status, 304);

    const missing = await fetch(`${baseUrl}/m/no-such-media/original`);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await missing.json(), { error: "video rendition not found" });
  });
});

test("wire pin: public media rendition — full GET, HEAD, If-None-Match 304, missing 404", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, PNG_BYTES, "pin.png", "image/png");
    const { definition } = await registerTransform({
      deps: { clock: deps.clock, idGen: deps.idGen, transformRepo: deps.transformDefinitionRepo },
      input: { workspaceId: deps.workspaceId, name: "thumb", params: { width: 10, height: 10, format: "webp" }, owner: "core" },
    });
    const rendition = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const { storageKey } = await deps.blobStore.put({ workspaceId: deps.workspaceId, sha256: createHash("sha256").update(rendition).digest("hex"), bytes: rendition });
    await deps.assetRenditionRepo.save({ id: "pin-rendition", workspaceId: deps.workspaceId, assetId: media.id, transformName: definition.name, version: definition.version, storageKey, createdAt: deps.clock.nowIso() });
    const url = `${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/pin.webp`;

    const full = await fetch(url);
    assert.equal(full.status, 200);
    const etag = full.headers.get("etag");
    assert.ok(etag, "an ungated 200 rendition carries a validator");
    assert.deepEqual({ ...wireOf(full), "content-length": null }, { ...Object.fromEntries(WIRE_HEADERS.map(n => [n, null])), "x-content-type-options": "nosniff", "cache-control": "public, max-age=60", "content-type": "image/webp" });
    assert.deepEqual(new Uint8Array(await full.arrayBuffer()), rendition);

    const head = await fetch(url, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("etag"), etag);
    assert.equal(head.headers.get("cache-control"), "public, max-age=60");
    assert.equal(head.headers.get("content-type"), "image/webp");
    assert.equal((await head.arrayBuffer()).byteLength, 0);

    for (const validator of [etag, `W/${etag}`, `"other", ${etag}`, "*"]) {
      const notModified = await fetch(url, { cache: "no-cache", headers: { "If-None-Match": validator } });
      assert.equal(notModified.status, 304, validator);
      assert.equal(notModified.headers.get("etag"), etag);
      assert.equal(notModified.headers.get("cache-control"), "public, max-age=60");
      assert.equal((await notModified.arrayBuffer()).byteLength, 0);
    }
    const stale = await fetch(url, { cache: "no-cache", headers: { "If-None-Match": '"other"' } });
    assert.equal(stale.status, 200);

    const missing = await fetch(`${baseUrl}/m/no-such-media/thumb.v1/a.webp`);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await missing.json(), { error: "rendition not found" });
  });
});

async function withServer(run: (baseUrl: string, deps: ReturnType<typeof createRouteDeps>) => Promise<void>): Promise<void> {
  const deps = createRouteDeps();
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, deps);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function uploadOne(deps: ReturnType<typeof createRouteDeps>, bytes: Uint8Array, filename: string, contentType: string) {
  return uploadMedia({
    deps: { clock: deps.clock, idGen: deps.idGen, mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore },
    input: { workspaceId: deps.workspaceId, bytes, filename, contentType, createdByPrincipal: "user-1" },
  });
}
