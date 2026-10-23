import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";

import { computeBlobStorageKey } from "@jini-ai/cms/media";

import { createDeployHostKit } from "#src/features/deployments/deploy-targets/host-kit";
import { createMediaBlobStore, loadBundledObjectStoreRegistry } from "#src/features/object-storage/index";
import { trackFetch } from "#src/platform/observability/index";
import { assertSpanOmits, createInMemoryOtel } from "#src/platform/observability/__tests__/fixtures/in-memory-otel";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { registerTransform, SharpImageTransformer, uploadMedia } from "#src/features/media/index";

/**
 * @file Proves the S3 media path as production wires it, end to end, without Docker and without any
 * real cloud account: `TOVU_MEDIA_BLOB_STORE=s3` + `TOVU_S3_*` env → `createMediaBlobStore` → the
 * bundled s3-compatible Agent Plugin's `s3_compatible` object-store provider, loaded from this repo's
 * own `content/agent-plugins` source through `loadBundledObjectStoreRegistry`, signing with the
 * deploy host kit's SigV4 client and traced by `trackFetch` — the same ports `deps.ts` hands it.
 *
 * The provider's own request semantics (status handling, error texts, key encoding, SigV4 signature
 * shape, `If-None-Match` on create-only writes) are proven in the plugin's suite,
 * `content/agent-plugins/s3-compatible/__tests__/object-store.test.mjs`. This file covers only
 * the Tovu wiring around it: env → provider settings, the late-bound host ports, the
 * `blobStoreFromObjectStore` view, and the real `uploadMedia()` → `/m/...` route on top.
 *
 * {@link startFakeS3} is a minimal, in-process S3-compatible HTTP server (path-style routing:
 * `PUT`/`GET`/`HEAD`/`DELETE /{bucket}/{key...}`, bytes kept in a `Map`, an S3-shaped quoted-MD5
 * `ETag` on write, `Content-Length` on `HEAD` as S3 sends it).
 *
 * NOT proven (disclosed, not silently assumed): behavior against a REAL provider (AWS S3, R2,
 * Tigris, MinIO, ...) — a provider's actual auth rejection of a bad signature, real network
 * latency/timeouts, provider-specific quirks, or IAM policy enforcement. Those need a real bucket.
 */

const BUCKET = "tovu-media-test";
const KEY_PREFIX = "tenant/";
const ACCESS_KEY_ID = "test-access-key-id";
const SECRET_ACCESS_KEY = "test-secret-access-key";



async function startFakeS3() {
  const objects = new Map();
  const forcedResponses = new Map();
  let lastAuthorizationHeader;

  function readBody(req) {
    const chunks = [];
    return new Promise((resolve, reject) => {
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  function objectKeyFromPath(url) {
    // Only the fixture bucket exists: silently discarding this segment hides wrong-bucket writes.
    const decoded = decodeURIComponent(url.replace(/^\//, ""));
    const firstSlash = decoded.indexOf("/");
    if (decoded.slice(0, firstSlash) !== BUCKET) return undefined;
    return decoded.slice(firstSlash + 1);
  }

  const etagOf = (body) => `"${createHash("md5").update(body).digest("hex")}"`;

  const server = createServer((req, res) => {
    void (async () => {
      lastAuthorizationHeader = req.headers.authorization;
      const key = objectKeyFromPath(req.url ?? "/");
      const body = await readBody(req);
      if (key === undefined) {
        res.writeHead(404);
        res.end("NoSuchBucket");
        return;
      }
      const forced = forcedResponses.get(`${req.method}:${key}`);
      if (forced) {
        res.writeHead(forced.status);
        res.end(forced.body);
        return;
      }

      if (req.method === "PUT") {
        // Minimal conditional-write support, so a create-only write (`If-None-Match: *`) on an
        // occupied key gets the 412 a real S3-compatible provider sends.
        if (req.headers["if-none-match"] === "*" && objects.has(key)) {
          res.writeHead(412);
          res.end();
          return;
        }
        objects.set(key, body);
        res.writeHead(200, { etag: etagOf(body) });
        res.end();
        return;
      }
      if (req.method === "GET" || req.method === "HEAD") {
        const stored = objects.get(key);
        if (!stored) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { etag: etagOf(stored), "content-length": stored.length });
        res.end(req.method === "GET" ? stored : undefined);
        return;
      }
      if (req.method === "DELETE") {
        objects.delete(key);
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(405);
      res.end();
    })();
  });

  server.listen(0);
  await once(server, "listening");
  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    objectKeys: () => [...objects.keys()],
    lastAuthorizationHeader: () => lastAuthorizationHeader,
    /** Overrides a method/key response before changing stored objects. */
    setForcedStatus: (method, key, status, body = "") => {
      if (status === undefined) forcedResponses.delete(`${method}:${key}`);
      else forcedResponses.set(`${method}:${key}`, { status, body });
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** An empty uploads folder, removed after the test: a correctly wired S3 store never writes into it. */
function uploadsDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-media-s3-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Files under `dir`, recursively — the proof that nothing fell back to local disk. */
function filesUnder(dir) {
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
}

/**
 * The media store exactly as `deps.ts` builds it for `TOVU_MEDIA_BLOB_STORE=s3`. The site-setting
 * ports throw: the env override must never consult them.
 */
function buildEnvS3MediaStore(required) {
  const notOnEnvPath = (name) => async () => {
    throw new Error(`${name} must not be called when TOVU_MEDIA_BLOB_STORE=s3`);
  };
  return createMediaBlobStore({
    uploadsDir: required.uploadsDir,
    env: {
      TOVU_MEDIA_BLOB_STORE: "s3",
      TOVU_S3_BUCKET: BUCKET,
      TOVU_S3_REGION: "us-east-1",
      TOVU_S3_ACCESS_KEY_ID: ACCESS_KEY_ID,
      TOVU_S3_SECRET_ACCESS_KEY: SECRET_ACCESS_KEY,
      TOVU_S3_ENDPOINT: required.endpoint,
      TOVU_S3_KEY_PREFIX: KEY_PREFIX,
    },
    ports: () => ({
      host: {
        createSigV4Client: createDeployHostKit({}).createSigV4Client,
        wrapFetch: (fetchFn) => trackFetch({ fetch: fetchFn, observability: required.observability }),
      },
      loadBundledRegistry: () =>
        loadBundledObjectStoreRegistry({ uploadsDir: required.uploadsDir, sourceRoot: path.resolve(import.meta.dirname, "../..") }),
      loadSiteRegistry: notOnEnvPath("loadSiteRegistry"),
      readSetting: notOnEnvPath("readSetting"),
      resolveSharedCredential: notOnEnvPath("resolveSharedCredential"),
    }),
  });
}

/**
 * End-to-end: real `uploadMedia()` write, through the real `createApp()` HTTP route, entirely
 * backed by the env-selected S3 media store instead of `InMemoryBlobStore`/the local store — the
 * same harness shape `media-rendition-route.test.ts` uses, with only the `blobStore` swapped. This
 * is the "upload, then serve, then render on a page" proof: every byte the route sends back came
 * from a signed round trip through the fake S3-compatible server above, not from disk or memory.
 */
test("env-selected S3 media store end to end: uploadMedia() writes to S3-compatible storage, and the real /m/... route serves the rendition back", async (t) => {
  const fakeS3 = await startFakeS3();
  t.after(() => fakeS3.close());
  const dir = uploadsDir(t);
  const media = buildEnvS3MediaStore({ uploadsDir: dir, endpoint: fakeS3.baseUrl, observability: createInMemoryOtel().port });
  assert.equal(media.mediaIsRemoteByEnv, true, "an env S3 store tells the site backup that uploads are not local");

  const baseDeps = createRouteDeps();
  const deps = { ...baseDeps, blobStore: media.blobStore, imageTransformer: new SharpImageTransformer() };
  const sourcePng = await sharp({
    create: { width: 20, height: 10, channels: 3, background: { r: 220, g: 30, b: 60 } },
  }).png().toBuffer();

  const { media: uploaded } = await uploadMedia({
    deps: {
      clock: deps.clock,
      idGen: deps.idGen,
      mediaRepo: deps.mediaRepo,
      blobRepo: deps.assetBlobRepo,
      renditionRepo: deps.assetRenditionRepo,
      blobStore: deps.blobStore,
    },
    input: {
      workspaceId: deps.workspaceId,
      bytes: sourcePng,
      filename: "hero.png",
      contentType: "image/png",
      createdByPrincipal: "user-1",
    },
  });
  const { definition } = await registerTransform({
    deps: { clock: deps.clock, idGen: deps.idGen, transformRepo: deps.transformDefinitionRepo },
    input: { workspaceId: deps.workspaceId, name: `thumb-${randomUUID()}`, params: { width: 100, height: 100, format: "webp" }, owner: "core" },
  });

  // The bytes really landed in the fake bucket, under TOVU_S3_KEY_PREFIX + the unchanged storage key,
  // signed with the env credential — not in an in-process or on-disk fallback.
  const sourceKey = computeBlobStorageKey({ workspaceId: deps.workspaceId, sha256: createHash("sha256").update(sourcePng).digest("hex") });
  assert.ok(fakeS3.objectKeys().includes(`${KEY_PREFIX}${sourceKey}`), `expected the original under '${KEY_PREFIX}${sourceKey}', got ${JSON.stringify(fakeS3.objectKeys())}`);
  assert.ok(fakeS3.objectKeys().every((key) => key.startsWith(`${KEY_PREFIX}ws/`)), "every object is namespaced by the env key prefix");
  assert.match(fakeS3.lastAuthorizationHeader() ?? "", new RegExp(`^AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/\\d{8}/us-east-1/s3/aws4_request, `));
  assert.deepEqual(filesUnder(dir), [], "nothing was written to the local uploads folder");

  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  try {
    const address = server.address();
    const res = await fetch(`http://127.0.0.1:${address.port}/m/${uploaded.id}/${definition.name}.v${definition.version}/hero.webp`);

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/webp");
    const body = new Uint8Array(await res.arrayBuffer());
    assert.ok(body.byteLength > 0, "expected the served rendition to have real bytes");
    const expectedBytes = await sharp(sourcePng).resize(100, 100, { fit: "cover" }).webp().toBuffer();
    assert.deepEqual(Buffer.from(body), expectedBytes, "the route must serve the expected rendition bytes from S3");
    const metadata = await sharp(body).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 100);
    assert.equal(metadata.height, 100);
    const { data, info } = await sharp(body).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 3);
    const expectedPixel = [220, 30, 60];
    assert.ok(data.every((value, index) => Math.abs(value - expectedPixel[index % 3]) <= 3),
      "the decoded rendition must retain the source color (allowing WebP compression rounding)");
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
  assert.deepEqual(filesUnder(dir), [], "serving read from S3 without caching anything into the uploads folder");
});

test("env-selected S3 media store exports one CLIENT span per object call through the host's wrapFetch: status, never bucket, key or signature", async (t) => {
  const fakeS3 = await startFakeS3();
  t.after(() => fakeS3.close());
  const { exporter, port } = createInMemoryOtel();
  const { blobStore } = buildEnvS3MediaStore({ uploadsDir: uploadsDir(t), endpoint: fakeS3.baseUrl, observability: port });
  const bytes = new TextEncoder().encode("traced");
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const { storageKey } = await blobStore.put({ workspaceId: "ws-otel", sha256, bytes });
  fakeS3.setForcedStatus("HEAD", `${KEY_PREFIX}${storageKey}`, 403);
  await assert.rejects(blobStore.exists({ storageKey }), { message: `S3ObjectStore.head: failed to check '${storageKey}' — HTTP 403` });

  const spans = exporter.getFinishedSpans();
  assert.deepEqual(spans.map((span) => [span.name, span.kind, span.attributes["http.response.status_code"], span.status.code]), [
    ["PUT 127.0.0.1", SpanKind.CLIENT, 200, SpanStatusCode.UNSET],
    ["HEAD 127.0.0.1", SpanKind.CLIENT, 403, SpanStatusCode.ERROR],
  ]);
  for (const span of spans) assertSpanOmits(span, [BUCKET, KEY_PREFIX, "ws-otel", sha256, ACCESS_KEY_ID, SECRET_ACCESS_KEY, "AWS4"]);
});

test("env-selected S3 media store records a transport failure on its span by error type", async (t) => {
  const fakeS3 = await startFakeS3();
  const baseUrl = fakeS3.baseUrl;
  await fakeS3.close();
  const { exporter, port } = createInMemoryOtel();
  const { blobStore } = buildEnvS3MediaStore({ uploadsDir: uploadsDir(t), endpoint: baseUrl, observability: port });

  await assert.rejects(blobStore.remove({ storageKey: "ws/x/blobs/ab/abc" }), /S3ObjectStore\.delete: request failed for 'ws\/x\/blobs\/ab\/abc'/);

  const spans = exporter.getFinishedSpans();
  assert.equal(spans.length, 1, "exactly one traced request");
  const [span] = spans;
  assert.equal(span.name, "DELETE 127.0.0.1");
  assert.equal(span.kind, SpanKind.CLIENT);
  assert.equal(span.status.code, SpanStatusCode.ERROR);
  assert.equal(typeof span.attributes["error.type"], "string");
  assertSpanOmits(span, [BUCKET, KEY_PREFIX, ACCESS_KEY_ID, SECRET_ACCESS_KEY, "AWS4"]);
});
