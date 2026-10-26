/**
 * @file Pins `object-stores/vercel-blob.mjs`, the Vercel plugin's share-link artifact store, through a
 * fake Vercel Blob HTTP port (no live Vercel call): upload/verify/delete, revoke, fail-closed verify,
 * selection as the only artifact-capable provider, and that no token reaches an error or a log.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createObjectStoreRegistry } from "@jini-ai/core/object-store";

import { createDeployHostKit } from "../../../../apps/website/src/features/deployments/deploy-targets/host-kit.ts";
import { selectArtifactStoreProvider } from "../../../../apps/website/src/features/object-storage/artifact-provider.ts";
import { parseObjectStoresFile } from "../../../../apps/website/src/features/object-storage/registry.ts";
import { resolveShareDelivery } from "../../../../apps/website/src/features/site-backup/share-hosting.ts";
import { SiteShareRegistry } from "../../../../apps/website/src/features/site-backup/share-registry.ts";
import { createSiteShare, revokeSiteShare, SHARE_DOWNLOAD_HEADERS } from "../../../../apps/website/src/features/site-backup/share-service.ts";
import provider from "../object-stores/vercel-blob.mjs";

// Built at runtime: gitleaks runs on main and must never see a token-shaped literal.
const blobToken = ["vercel_blob_rw_", "StoreAbc123", "_", "x".repeat(20)].join("");
const STORE_ORIGIN = "https://storeabc123.public.blob.vercel-storage.com";
const shareToken = "a".repeat(16);
const key = `_share/${shareToken}/site.tovu.zip`;
const bytes = Buffer.from("PK vercel blob artifact");

/** A fake Vercel Blob: the authenticated API (PUT, POST /delete) and the anonymous public host. */
function blobFake(options = {}) {
  const blobs = new Map();
  const calls = [];
  const fetchFn = async (input, init = {}) => {
    const url = new URL(input);
    const headers = new Headers(init.headers);
    const method = init.method ?? "GET";
    calls.push({ method, url: url.href, authorization: headers.get("authorization") });
    if (url.origin === "https://vercel.com" && url.pathname.startsWith("/api/blob")) {
      if (options.apiStatus) return new Response(`denied for ${headers.get("authorization")}`, { status: options.apiStatus });
      if (headers.get("authorization") !== `Bearer ${blobToken}`) return new Response(null, { status: 403 });
      if (method === "PUT" && url.pathname === "/api/blob/") {
        const pathname = url.searchParams.get("pathname");
        blobs.set(pathname, { bytes: Buffer.from(init.body), contentType: headers.get("x-content-type") });
        const publicUrl = `${options.returnedOrigin ?? STORE_ORIGIN}/${pathname}`;
        return Response.json({ url: publicUrl, downloadUrl: `${publicUrl}?download=1`, pathname });
      }
      if (method === "POST" && url.pathname === "/api/blob/delete") {
        for (const blobUrl of JSON.parse(init.body).urls) blobs.delete(new URL(blobUrl).pathname.slice(1));
        return Response.json({});
      }
    }
    if (url.origin === STORE_ORIGIN && method === "HEAD") {
      const blob = blobs.get(url.pathname.slice(1));
      if (!blob) return new Response(null, { status: 404 });
      return new Response(null, { status: 200, headers: { "content-length": String(blob.bytes.length + (options.lengthDelta ?? 0)), "content-type": options.servedType ?? blob.contentType } });
    }
    return new Response(null, { status: 418 });
  };
  const kit = createDeployHostKit({ fetchFn });
  const store = (credential = { token: "vercel-api-token-unused", blobToken }) => provider.createArtifactStore({ credential, config: {}, kit });
  return { blobs, calls, kit, store };
}

test("upload/verify/delete: unsuffixed key in the token's store, anonymous verify, idempotent delete", async () => {
  const fake = blobFake();
  const store = fake.store();
  const { url } = await store.upload({ key, bytes, headers: SHARE_DOWNLOAD_HEADERS });
  assert.equal(url, `${STORE_ORIGIN}/${key}?download=1`);
  assert.equal(fake.blobs.get(key)?.bytes.toString(), bytes.toString());
  assert.equal(await store.verify({ key, url, present: true, bytes: bytes.length }), true);
  assert.equal(fake.calls.filter(call => call.method === "HEAD").every(call => call.authorization === null), true, "verify never sends a token");
  assert.equal(fake.calls.filter(call => call.authorization !== null).every(call => call.url.startsWith("https://vercel.com/api/blob")), true, "the token only goes to the Blob API");
  await store.delete({ key });
  assert.equal(fake.blobs.has(key), false);
  assert.equal(await store.verify({ key, url, present: false }), true);
  await store.delete({ key });
  await assert.rejects(store.upload({ key: "unrelated.txt", bytes, headers: {} }), /Invalid share/i);
  await assert.rejects(store.delete({ key: "unrelated.txt" }), /Invalid share/i);
});

test("verify fails closed: wrong size, wrong type, foreign URL, still-present after delete", async () => {
  for (const options of [{ lengthDelta: 1 }, { servedType: "text/html" }]) {
    const store = blobFake(options).store();
    const { url } = await store.upload({ key, bytes, headers: SHARE_DOWNLOAD_HEADERS });
    assert.equal(await store.verify({ key, url, present: true, bytes: bytes.length }), false, JSON.stringify(options));
  }
  const store = blobFake().store();
  const { url } = await store.upload({ key, bytes, headers: SHARE_DOWNLOAD_HEADERS });
  assert.equal(await store.verify({ key, url: `https://evil.example/${key}`, present: true, bytes: bytes.length }), false);
  assert.equal(await store.verify({ key, url, present: false }), false, "a live blob is not absence");
  await assert.rejects(blobFake({ returnedOrigin: "https://other.public.blob.vercel-storage.com" }).store().upload({ key, bytes, headers: {} }), /unexpected address/);
});

test("no token in errors or logs; a missing or malformed Blob token refuses before any request", async () => {
  const logged = [];
  const originals = { log: console.log, warn: console.warn, error: console.error };
  for (const name of Object.keys(originals)) console[name] = (...args) => { logged.push(args.map(String).join(" ")); };
  try {
    const fake = blobFake({ apiStatus: 403 });
    const errors = [];
    for (const call of [() => fake.store().upload({ key, bytes, headers: {} }), () => fake.store().delete({ key })]) {
      await call().then(() => assert.fail("expected a refusal"), error => errors.push(error));
    }
    for (const credential of [{ token: "vercel-api-token-unused" }, { token: "vercel-api-token-unused", blobToken: `${blobToken}!` }]) {
      assert.throws(() => fake.store(credential), error => { errors.push(error); return /Blob read-write token/.test(error.message); });
    }
    const text = [...errors.map(error => `${error.message} ${JSON.stringify(error)}`), ...logged].join("\n");
    assert.match(errors[0].message, /HTTP 403/);
    for (const secret of [blobToken, shareToken, "vercel-api-token-unused"]) assert.equal(text.includes(secret), false, `leaked ${secret.slice(0, 12)}`);
  } finally {
    Object.assign(console, originals);
  }
});

test("the manifest registers provider `vercel`; it is chosen and delivered when it is the only artifact store", async () => {
  const manifest = parseObjectStoresFile({ raw: await readFile(new URL("../tovu-object-stores.json", import.meta.url), "utf8") });
  assert.equal(manifest.ok, true);
  assert.deepEqual(manifest.descriptors.map(({ id, module }) => ({ id, module })), [{ id: "vercel", module: "object-stores/vercel-blob.mjs" }]);
  assert.equal(provider.create({ settings: {}, host: {} }).status, "rejected", "Blob holds share links only, never site media");
  const registry = createObjectStoreRegistry({}, { seed: [
    { id: "local", label: "This server's disk", provider: { create: () => ({ status: "rejected", error: { code: "not_configured", message: "unused" } }) } },
    { id: "vercel", label: "Vercel Blob", provider },
  ] });
  const chosen = selectArtifactStoreProvider({ loaded: { registry, refusals: [] }, preferredId: "" });
  assert.equal(chosen?.id, "vercel");
  const fake = blobFake();
  const delivery = await resolveShareDelivery({
    http: { send: async () => assert.fail("no server delivery is configured") },
    peer: async () => undefined,
    objectStore: async () => ({ provider: chosen.id, binding: "vercel-binding", store: chosen.provider.createArtifactStore({ credential: { token: "vercel-api-token-unused", blobToken }, config: {}, kit: fake.kit }) }),
  });
  assert.equal(delivery?.provider, "vercel");
});

test("create, then revoke deletes the blob and verifies it is gone", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "vercel-blob-share-"));
  try {
    const fake = blobFake();
    const registry = new SiteShareRegistry({ directory });
    const delivery = { provider: "vercel", binding: "vercel-binding", store: fake.store() };
    const row = await createSiteShare({ registry, site: "site", name: "My Site", archive: bytes }, { delivery });
    assert.match(row.url ?? "", /^https:\/\/storeabc123\.public\.blob\.vercel-storage\.com\/_share\/[A-Za-z]{16}\/my-site\.tovu\.zip\?download=1$/);
    assert.equal(fake.blobs.size, 1);
    await revokeSiteShare({ registry, site: "site", shareId: row.shareId }, { delivery });
    assert.equal(fake.blobs.size, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
