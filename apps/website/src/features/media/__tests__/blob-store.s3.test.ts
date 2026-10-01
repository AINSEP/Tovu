import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import sharp from "sharp";

import { computeBlobStorageKey } from "@jini-ai/cms/media";

import { createApp, createRouteDeps } from "../../../server/runtime/composition/app.js";
import { S3BlobStore } from "../blob-store.s3.js";
import { registerTransform, SharpImageTransformer, uploadMedia } from "../index.js";

/**
 * @file Proves `S3BlobStore` (the new S3-compatible `BlobStorePort` adapter, deferred until now
 * per `blob-store.fs.ts`'s own file header) end to end, without Docker and without any real cloud
 * account — Docker is off-limits for this task, and creating a real bucket/using real credentials
 * was explicitly out of scope.
 *
 * {@link startFakeS3} is a minimal, in-process S3-compatible HTTP server (path-style routing:
 * `PUT`/`GET`/`HEAD`/`DELETE /{bucket}/{key...}`, bytes kept in a `Map`, an S3-shaped quoted-MD5
 * `ETag` on write) — enough surface for `aws4fetch`'s `AwsClient` to sign real requests against
 * and for every `BlobStorePort` method to round-trip through. The fake trusts the Authorization
 * header; the signing test independently recomputes its SigV4 signature from the captured request
 * using Node's HMAC implementation and the fixture credentials.
 *
 * PROVEN here: `put`/`get`/`exists`/`remove` against this fake server, AND the real
 * `uploadMedia()` -> real `/m/{assetId}/{transform}.v{version}/{file}` HTTP route (the exact same
 * route `media-rendition-route.test.ts` exercises against the in-memory/local-disk adapters)
 * serving bytes that came from THIS adapter — "upload, then serve, then render on a page" for
 * every read path that route covers.
 *
 * NOT proven (disclosed, not silently assumed): behavior against a REAL provider (AWS S3, R2,
 * Tigris, MinIO, ...) — real-world specifics this fake server cannot exercise, such as a
 * provider's actual auth rejection of a bad signature, real network latency/timeouts, provider-
 * specific quirks (path-style vs. virtual-hosted addressing some providers deprecate, `x-amz-*`
 * response headers some omit), or IAM policy enforcement. Those require a real bucket, which this
 * task was told not to create.
 */

interface FakeS3Server {
  readonly baseUrl: string;
  readonly objectCount: () => number;
  readonly lastAuthorizationHeader: () => string | undefined;
  readonly lastRequest: () => { method: string; path: string; headers: IncomingMessage["headers"]; body: Buffer } | undefined;
  /** Overrides a method/key response before changing stored objects. */
  readonly setForcedStatus: (method: string, key: string, status: number | undefined, body?: string) => void;
  readonly close: () => Promise<void>;
}

async function startFakeS3(): Promise<FakeS3Server> {
  const objects = new Map<string, Buffer>();
  const forcedResponses = new Map<string, { status: number; body: string }>();
  let lastAuthorizationHeader: string | undefined;
  let lastRequest: ReturnType<FakeS3Server["lastRequest"]>;

  function readBody(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  function objectKeyFromPath(url: string): string | undefined {
    // Only the fixture bucket exists: silently discarding this segment hides wrong-bucket writes.
    const decoded = decodeURIComponent(url.replace(/^\//, ""));
    const firstSlash = decoded.indexOf("/");
    if (decoded.slice(0, firstSlash) !== "tovu-media-test") return undefined;
    return decoded.slice(firstSlash + 1);
  }

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      lastAuthorizationHeader = req.headers.authorization;
      const key = objectKeyFromPath(req.url ?? "/");
      const body = await readBody(req);
      lastRequest = { method: req.method ?? "GET", path: req.url ?? "/", headers: req.headers, body };
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
        // Minimal conditional-write support — enough to prove `S3BlobStore.putIfAbsent()` sends
        // `If-None-Match: *` and correctly interprets a real S3-compatible provider's 412 refusal,
        // without depending on a real bucket (out of scope per this file's own header).
        if (req.headers["if-none-match"] === "*" && objects.has(key)) {
          res.writeHead(412);
          res.end();
          return;
        }
        objects.set(key, body);
        const etag = `"${createHash("md5").update(body).digest("hex")}"`;
        res.writeHead(200, { etag });
        res.end();
        return;
      }
      if (req.method === "GET") {
        const body = objects.get(key);
        if (!body) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { etag: `"${createHash("md5").update(body).digest("hex")}"` });
        res.end(body);
        return;
      }
      if (req.method === "HEAD") {
        const body = objects.get(key);
        if (!body) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { etag: `"${createHash("md5").update(body).digest("hex")}"` });
        res.end();
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
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    objectCount: () => objects.size,
    lastAuthorizationHeader: () => lastAuthorizationHeader,
    lastRequest: () => lastRequest,
    setForcedStatus: (method: string, key: string, status: number | undefined, body = "") => {
      if (status === undefined) forcedResponses.delete(`${method}:${key}`);
      else forcedResponses.set(`${method}:${key}`, { status, body });
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function makeStore(baseUrl: string): S3BlobStore {
  return new S3BlobStore({
    bucket: "tovu-media-test",
    region: "us-east-1",
    accessKeyId: "test-access-key-id",
    secretAccessKey: "test-secret-access-key",
    endpoint: baseUrl,
  });
}

test("S3BlobStore.put() writes under the same computeBlobStorageKey() shape LocalFsBlobStore/InMemoryBlobStore use", async () => {
  const fakeS3 = await startFakeS3();
  try {
    const store = makeStore(fakeS3.baseUrl);
    const bytes = new TextEncoder().encode("hello from S3BlobStore");
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    const { storageKey } = await store.put({ workspaceId: "ws-1", sha256, bytes });

    assert.equal(storageKey, computeBlobStorageKey({ workspaceId: "ws-1", sha256 }));
    assert.equal(fakeS3.lastRequest()?.path, `/tovu-media-test/ws/ws-1/blobs/${sha256.slice(0, 2)}/${sha256}`);
    assert.equal(fakeS3.objectCount(), 1);
  } finally {
    await fakeS3.close();
  }
});

test("S3BlobStore derives omitted/blank endpoints and applies the configured namespace to every operation", async (t) => {
  const requests: Request[] = [];
  const bytes = new Uint8Array([1, 2, 3]);
  t.mock.method(globalThis, "fetch", async (request: Request) => {
    requests.push(request);
    return request.method === "DELETE" ? new Response(null, { status: 204 }) : new Response(bytes);
  });
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const expectedKey = computeBlobStorageKey({ workspaceId: "ws-1", sha256 });

  for (const endpoint of [undefined, "", "   ", "https://objects.example.test///"]) {
    requests.length = 0;
    const store = new S3BlobStore({
      bucket: "media bucket",
      region: "eu-west-2",
      accessKeyId: "test-access-key-id",
      secretAccessKey: "test-secret-access-key",
      endpoint,
      keyPrefix: "tenant media/",
    });
    const { storageKey } = await store.put({ workspaceId: "ws-1", sha256, bytes });
    assert.equal(storageKey, expectedKey, "the namespace belongs to the object URL, not the persisted storage key");
    await store.putIfAbsent({ workspaceId: "ws-1", sha256, bytes });
    assert.deepEqual(await store.get({ storageKey }), bytes);
    assert.equal(await store.exists({ storageKey }), true);
    await store.remove({ storageKey });

    const host = endpoint?.startsWith("https://") ? "https://objects.example.test" : "https://s3.eu-west-2.amazonaws.com";
    assert.deepEqual(requests.map((request) => [request.method, request.url]),
      ["PUT", "PUT", "GET", "HEAD", "DELETE"].map((method) => [method, `${host}/media%20bucket/tenant%20media/${expectedKey}`]));
  }
});

test("S3BlobStore.put() sends a real SigV4-signed request (AWS4-HMAC-SHA256), not a bare unauthenticated PUT", async () => {
  const fakeS3 = await startFakeS3();
  try {
    const store = makeStore(fakeS3.baseUrl);
    await store.put({ workspaceId: "ws-1", sha256: "a".repeat(64), bytes: new Uint8Array([1, 2, 3]) });

    const authHeader = fakeS3.lastAuthorizationHeader();
    assert.ok(authHeader, "expected an Authorization header on the signed PUT");
    assert.match(authHeader as string, /^AWS4-HMAC-SHA256 /);

    const request = fakeS3.lastRequest();
    assert.ok(request);
    assert.deepEqual(request.body, Buffer.from([1, 2, 3]));
    // Independent SigV4 verification: no use of aws4fetch's signer or credential cache.
    const match = authHeader.match(/^AWS4-HMAC-SHA256 Credential=([^/]+)\/([^,]+), SignedHeaders=([^,]+), Signature=([a-f0-9]{64})$/);
    assert.ok(match);
    const [, accessKey, scope, signedHeaders, signature] = match;
    const datetime = request.headers["x-amz-date"];
    assert.equal(typeof datetime, "string");
    const date = (datetime as string).slice(0, 8);
    assert.equal(accessKey, "test-access-key-id");
    assert.equal(scope, `${date}/us-east-1/s3/aws4_request`);
    assert.equal(signedHeaders, "host;x-amz-content-sha256;x-amz-date");
    const payloadHash = request.headers["x-amz-content-sha256"];
    assert.equal(typeof payloadHash, "string");
    if (payloadHash !== "UNSIGNED-PAYLOAD") {
      assert.equal(payloadHash, createHash("sha256").update(request.body).digest("hex"));
    }
    const canonicalHeaders = signedHeaders.split(";").map((name) => {
      const value = request.headers[name];
      assert.equal(typeof value, "string");
      return `${name}:${(value as string).trim().replace(/\s+/g, " ")}\n`;
    }).join("");
    const canonicalRequest = [request.method, request.path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", datetime, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
    const dateKey = createHmac("sha256", "AWS4test-secret-access-key").update(date).digest();
    const regionKey = createHmac("sha256", dateKey).update("us-east-1").digest();
    const serviceKey = createHmac("sha256", regionKey).update("s3").digest();
    const signingKey = createHmac("sha256", serviceKey).update("aws4_request").digest();
    assert.equal(signature, createHmac("sha256", signingKey).update(stringToSign).digest("hex"));
  } finally {
    await fakeS3.close();
  }
});

test("S3BlobStore: put() then get() round-trips the exact bytes written", async () => {
  const fakeS3 = await startFakeS3();
  try {
    const store = makeStore(fakeS3.baseUrl);
    const bytes = new TextEncoder().encode("round-trip-me");
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    const { storageKey } = await store.put({ workspaceId: "ws-1", sha256, bytes });
    const readBack = await store.get({ storageKey });

    assert.deepEqual(Buffer.from(readBack), Buffer.from(bytes));
  } finally {
    await fakeS3.close();
  }
});

test("S3BlobStore.exists() is true right after put() and false after remove()", async () => {
  const fakeS3 = await startFakeS3();
  try {
    const store = makeStore(fakeS3.baseUrl);
    const bytes = new TextEncoder().encode("exists-probe");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const { storageKey } = await store.put({ workspaceId: "ws-1", sha256, bytes });

    assert.equal(await store.exists({ storageKey }), true);
    await store.remove({ storageKey });
    assert.equal(await store.exists({ storageKey }), false);
  } finally {
    await fakeS3.close();
  }
});

test("S3BlobStore.exists() distinguishes a genuine 404 from 403/429/5xx instead of collapsing every non-ok response into false", async () => {
  const fakeS3 = await startFakeS3();
  try {
    const store = makeStore(fakeS3.baseUrl);
    const bytes = new TextEncoder().encode("auth-and-outage-probe");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const { storageKey } = await store.put({ workspaceId: "ws-1", sha256, bytes });

    // A genuinely missing key still resolves to `false`, not an error.
    assert.equal(await store.exists({ storageKey: "ws/ws-1/blobs/zz/never-existed" }), false);

    fakeS3.setForcedStatus("HEAD", storageKey, 403);
    await assert.rejects(() => store.exists({ storageKey }), {
      message: `S3BlobStore.exists: failed to check '${storageKey}' — HTTP 403`,
    });

    fakeS3.setForcedStatus("HEAD", storageKey, 429);
    await assert.rejects(() => store.exists({ storageKey }), {
      message: `S3BlobStore.exists: failed to check '${storageKey}' — HTTP 429`,
    });

    fakeS3.setForcedStatus("HEAD", storageKey, 500);
    await assert.rejects(() => store.exists({ storageKey }), {
      message: `S3BlobStore.exists: failed to check '${storageKey}' — HTTP 500`,
    });
  } finally {
    await fakeS3.close();
  }
});

test("S3BlobStore rejects provider failures for writes, reads and deletes without changing stored objects", async (t) => {
  // Keep aws4fetch's retry jitter at zero for the deliberately persistent 500 responses.
  t.mock.method(Math, "random", () => 0);
  const fakeS3 = await startFakeS3();
  try {
    const store = makeStore(fakeS3.baseUrl);
    const bytes = new TextEncoder().encode("preserve-on-failure");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const input = { workspaceId: "ws-1", sha256, bytes };
    const storageKey = computeBlobStorageKey(input);
    const errorBody = "provider denied write";
    for (const status of [403, 500]) {
      fakeS3.setForcedStatus("PUT", storageKey, status, errorBody);
      await assert.rejects(() => store.put(input), {
        message: `S3BlobStore.put: failed to write '${storageKey}' — HTTP ${status} — ${errorBody}`,
      });
      await assert.rejects(() => store.putIfAbsent(input), {
        message: `S3BlobStore.putIfAbsent: failed to write '${storageKey}' — HTTP ${status} — ${errorBody}`,
      });
      assert.equal(fakeS3.objectCount(), 0, "a failed write must not create an object");
    }

    // Seed a separate key using the real successful PUT path.
    const existing = await store.put({ ...input, sha256: "b".repeat(64) });
    for (const status of [403, 500]) {
      fakeS3.setForcedStatus("PUT", existing.storageKey, status, errorBody);
      await assert.rejects(() => store.putIfAbsent({ ...input, sha256: "b".repeat(64), bytes: new Uint8Array([9]) }), {
        message: `S3BlobStore.putIfAbsent: failed to write '${existing.storageKey}' — HTTP ${status} — ${errorBody}`,
      });
      assert.deepEqual(Buffer.from(await store.get(existing)), Buffer.from(bytes));
      fakeS3.setForcedStatus("GET", existing.storageKey, status);
      await assert.rejects(() => store.get(existing), {
        message: `S3BlobStore.get: failed to read '${existing.storageKey}' — HTTP ${status}`,
      });
      fakeS3.setForcedStatus("DELETE", existing.storageKey, status);
      await assert.rejects(() => store.remove(existing), {
        message: `S3BlobStore.remove: failed to delete '${existing.storageKey}' — HTTP ${status}`,
      });
      assert.equal(fakeS3.objectCount(), 1);
      fakeS3.setForcedStatus("GET", existing.storageKey, undefined);
      assert.deepEqual(Buffer.from(await store.get(existing)), Buffer.from(bytes));
    }
  } finally {
    await fakeS3.close();
  }
});

test("S3BlobStore write failures bound provider error bodies and preserve the HTTP error when the body is unreadable", async (t) => {
  const input = { workspaceId: "ws-1", sha256: "a".repeat(64), bytes: new Uint8Array([1]) };
  const storageKey = computeBlobStorageKey(input);
  for (const unreadable of [false, true]) {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(
      unreadable ? new ReadableStream({ start(controller) { controller.error(new Error("body unreadable")); } }) : "x".repeat(250),
      { status: 403 },
    ));
    try {
      const store = makeStore("https://objects.example.test");
      for (const method of ["put", "putIfAbsent"] as const) {
        await assert.rejects(() => store[method](input), {
          message: `S3BlobStore.${method}: failed to write '${storageKey}' — HTTP 403${unreadable ? "" : ` — ${"x".repeat(200)}`}`,
        });
      }
    } finally {
      fetchMock.mock.restore();
    }
  }
});

test("S3BlobStore.putIfAbsent() writes a fresh key and reports written: true", async () => {
  const fakeS3 = await startFakeS3();
  try {
    const store = makeStore(fakeS3.baseUrl);
    const bytes = new TextEncoder().encode("first writer");
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    const result = await store.putIfAbsent({ workspaceId: "ws-1", sha256, bytes });

    assert.equal(result.written, true);
    assert.deepEqual(Buffer.from(await store.get({ storageKey: result.storageKey })), Buffer.from(bytes));
  } finally {
    await fakeS3.close();
  }
});

test("S3BlobStore.putIfAbsent() on an already-occupied key reports written: false and leaves the existing object untouched", async () => {
  const fakeS3 = await startFakeS3();
  try {
    const store = makeStore(fakeS3.baseUrl);
    const sha256 = createHash("sha256").update("shared key").digest("hex");
    const firstBytes = new TextEncoder().encode("real production bytes, written first");
    const secondBytes = new TextEncoder().encode("stock seed bytes — must not win");

    const first = await store.putIfAbsent({ workspaceId: "ws-1", sha256, bytes: firstBytes });
    assert.equal(first.written, true);

    const second = await store.putIfAbsent({ workspaceId: "ws-1", sha256, bytes: secondBytes });
    assert.equal(second.written, false, "a second putIfAbsent for the same key must not report a write");

    assert.deepEqual(
      Buffer.from(await store.get({ storageKey: first.storageKey })),
      Buffer.from(firstBytes),
      "the first writer's bytes must survive — the fake server's 412 must stop the second PUT from landing"
    );
  } finally {
    await fakeS3.close();
  }
});

test("S3BlobStore.remove() is idempotent — removing an already-absent key is not an error (BlobStorePort's documented contract)", async () => {
  const fakeS3 = await startFakeS3();
  try {
    const store = makeStore(fakeS3.baseUrl);
    await store.remove({ storageKey: "ws/ws-1/blobs/zz/never-existed" });
    assert.equal(await store.exists({ storageKey: "ws/ws-1/blobs/zz/never-existed" }), false);
  } finally {
    await fakeS3.close();
  }
});

test("S3BlobStore.get() on a missing key throws the exact same message shape InMemoryBlobStore.get() uses", async () => {
  const fakeS3 = await startFakeS3();
  try {
    const store = makeStore(fakeS3.baseUrl);
    await assert.rejects(() => store.get({ storageKey: "ws/ws-1/blobs/zz/does-not-exist" }), (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal((err as Error).message, "blob 'ws/ws-1/blobs/zz/does-not-exist' was not found");
      return true;
    });
  } finally {
    await fakeS3.close();
  }
});

/**
 * End-to-end: real `uploadMedia()` write, through the real `createApp()` HTTP route, entirely
 * backed by `S3BlobStore` instead of `InMemoryBlobStore`/`LocalFsBlobStore` — the same harness
 * shape `media-rendition-route.test.ts` uses, with only the `blobStore` swapped. This is the
 * "upload, then serve, then render on a page" proof: every byte the route sends back came from a
 * signed round trip through the fake S3-compatible server above, not from disk or memory.
 */
test("S3BlobStore end to end: uploadMedia() writes to S3-compatible storage, and the real /m/... route serves the rendition back", async () => {
  const fakeS3 = await startFakeS3();
  try {
    const baseDeps = createRouteDeps();
    const deps = { ...baseDeps, blobStore: makeStore(fakeS3.baseUrl), imageTransformer: new SharpImageTransformer() };
    const sourcePng = await sharp({
      create: { width: 20, height: 10, channels: 3, background: { r: 220, g: 30, b: 60 } },
    }).png().toBuffer();

    const { media } = await uploadMedia({
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

    // Prove the bytes really landed in the fake bucket, not merely in an in-process fallback.
    assert.ok(fakeS3.objectCount() > 0, "expected uploadMedia() to have written at least one object to S3-compatible storage");

    const server = createServer(createApp(deps));
    server.listen(0);
    await once(server, "listening");
    try {
      const address = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${address.port}/m/${media.id}/${definition.name}.v${definition.version}/hero.webp`);

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
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    await fakeS3.close();
  }
});
