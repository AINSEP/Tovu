import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { computeBlobStorageKey } from "@jini-ai/cms/media";
import { LocalFsBlobStore } from "@jini-ai/cms/media/node";
import { createObjectStoreRegistry, type ObjectStore, type ObjectStoreCreateInput } from "@jini-ai/core/object-store";
import { providerOk, providerRejected } from "@jini-ai/core/provider-registry";

import { createMediaBlobStore, MEDIA_OBJECT_STORE_ENV, readMediaStoreEnv, S3_OBJECT_STORE_ID, type MediaObjectStorePorts } from "../media-store.js";
import type { LoadedObjectStoreRegistry, ObjectStoreHost, TovuObjectStoreProvider } from "../registry.js";

/**
 * @file The media blob-store seam: env override precedence and its loud boot errors, the site
 * setting path resolved lazily through late-bound ports, and the rule that an unusable remote choice
 * rejects every media call instead of quietly writing to local disk. Ports are plain fakes; the local
 * path runs against a real temp directory so byte-compatibility with `LocalFsBlobStore` is proven,
 * not assumed.
 */

const WORKSPACE_ID = "11111111-2222-4333-8444-555555555555";
const BYTES = new TextEncoder().encode("media bytes");
const SHA = createHash("sha256").update(BYTES).digest("hex");
const KEY = computeBlobStorageKey({ workspaceId: WORKSPACE_ID, sha256: SHA });

const FULL_S3_ENV = {
  [MEDIA_OBJECT_STORE_ENV]: "s3",
  TOVU_S3_BUCKET: "media-bucket",
  TOVU_S3_REGION: "eu-west-1",
  TOVU_S3_ACCESS_KEY_ID: "AKIDEXAMPLE",
  TOVU_S3_SECRET_ACCESS_KEY: "secret-value",
  TOVU_S3_ENDPOINT: "https://r2.example.test",
  TOVU_S3_KEY_PREFIX: "site-a/",
} as const;

const REQUIRED_LIST = "TOVU_S3_BUCKET, TOVU_S3_REGION, TOVU_S3_ACCESS_KEY_ID, TOVU_S3_SECRET_ACCESS_KEY";

const HOST: ObjectStoreHost = {
  createSigV4Client: () => {
    throw new Error("the fake providers never sign");
  },
};

async function tempUploadsDir(t: TestContext): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-object-storage-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/** Every file under `dir`, relative, sorted — to prove nothing was written. */
async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name))).sort();
}

/** A Map-backed `ObjectStore` that records the keys it was asked for. */
function memoryStore(): ObjectStore & { readonly objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async put({ key, bytes }, options = {}) {
      if (options.ifAbsent && objects.has(key)) return { written: false };
      objects.set(key, bytes);
      return { written: true };
    },
    async get({ key }) {
      return objects.get(key) ?? null;
    },
    async head({ key }) {
      const bytes = objects.get(key);
      return bytes ? { size: bytes.byteLength } : null;
    },
    async delete({ key }) {
      objects.delete(key);
    },
  };
}

/** A provider that hands back `store` and records every create input. */
function recordingProvider(store: ObjectStore): TovuObjectStoreProvider & { readonly inputs: ObjectStoreCreateInput<ObjectStoreHost>[] } {
  const inputs: ObjectStoreCreateInput<ObjectStoreHost>[] = [];
  return {
    inputs,
    create(input) {
      inputs.push(input);
      return providerOk({ value: store });
    },
  };
}

function registryWith(entries: Array<{ id: string; provider: TovuObjectStoreProvider }>, refusals: string[] = []): LoadedObjectStoreRegistry {
  return { registry: createObjectStoreRegistry<ObjectStoreHost>({}, { seed: entries }), refusals };
}

interface PortCalls {
  factory: number;
  bundled: number;
  site: number;
  setting: number;
  credential: Array<{ providerId: string }>;
}

/** Fake ports; any port a test does not supply fails the call it is used in, loudly. */
function fakePorts(overrides: Partial<Omit<MediaObjectStorePorts, "host">> = {}): { ports: () => MediaObjectStorePorts; calls: PortCalls } {
  const calls: PortCalls = { factory: 0, bundled: 0, site: 0, setting: 0, credential: [] };
  const unexpected = (name: string) => () => Promise.reject(new Error(`unexpected port call: ${name}`));
  const value: MediaObjectStorePorts = {
    host: HOST,
    loadBundledRegistry: () => {
      calls.bundled++;
      return (overrides.loadBundledRegistry ?? unexpected("loadBundledRegistry"))();
    },
    loadSiteRegistry: () => {
      calls.site++;
      return (overrides.loadSiteRegistry ?? unexpected("loadSiteRegistry"))();
    },
    readSetting: () => {
      calls.setting++;
      return (overrides.readSetting ?? unexpected("readSetting"))();
    },
    resolveSharedCredential: (required) => {
      calls.credential.push({ providerId: required.providerId });
      return (overrides.resolveSharedCredential ?? unexpected("resolveSharedCredential"))(required);
    },
  };
  return {
    calls,
    ports: () => {
      calls.factory++;
      return value;
    },
  };
}

const throwingPorts = (): MediaObjectStorePorts => {
  throw new Error("ports() must not be called");
};

// ---------------------------------------------------------------------------
// readMediaStoreEnv
// ---------------------------------------------------------------------------

test("readMediaStoreEnv: no override is 'unset'", () => {
  assert.deepEqual(readMediaStoreEnv({ env: {} }), { kind: "unset" });
});

test("readMediaStoreEnv: 'local' is the local choice, regardless of stray S3 vars", () => {
  assert.deepEqual(readMediaStoreEnv({ env: { ...FULL_S3_ENV, [MEDIA_OBJECT_STORE_ENV]: "local" } }), { kind: "local" });
});

test("readMediaStoreEnv: a complete s3 config maps vars to settings and credential, endpoint and key prefix included", () => {
  assert.deepEqual(readMediaStoreEnv({ env: FULL_S3_ENV }), {
    kind: "s3",
    settings: { bucket: "media-bucket", keyPrefix: "site-a/" },
    credential: { fields: { accessKeyId: "AKIDEXAMPLE", region: "eu-west-1", endpoint: "https://r2.example.test" }, secret: "secret-value" },
  });
});

test("readMediaStoreEnv: optional endpoint and key prefix stay undefined when unset", () => {
  const { TOVU_S3_ENDPOINT: _endpoint, TOVU_S3_KEY_PREFIX: _prefix, ...env } = FULL_S3_ENV;
  assert.deepEqual(readMediaStoreEnv({ env }), {
    kind: "s3",
    settings: { bucket: "media-bucket", keyPrefix: undefined },
    credential: { fields: { accessKeyId: "AKIDEXAMPLE", region: "eu-west-1", endpoint: undefined }, secret: "secret-value" },
  });
});

test("readMediaStoreEnv: an unknown backend throws the operator-facing message (case-sensitive)", () => {
  assert.throws(() => readMediaStoreEnv({ env: { [MEDIA_OBJECT_STORE_ENV]: "S3" } }), {
    message: "Unknown TOVU_MEDIA_BLOB_STORE 'S3' — expected 'local' or 's3'.",
  });
  assert.throws(() => readMediaStoreEnv({ env: { [MEDIA_OBJECT_STORE_ENV]: "" } }), {
    message: "Unknown TOVU_MEDIA_BLOB_STORE '' — expected 'local' or 's3'.",
  });
});

test("readMediaStoreEnv: s3 with no variables names every missing one", () => {
  assert.throws(() => readMediaStoreEnv({ env: { [MEDIA_OBJECT_STORE_ENV]: "s3" } }), {
    message: `TOVU_MEDIA_BLOB_STORE=s3 requires ${REQUIRED_LIST} — missing: ${REQUIRED_LIST}.`,
  });
});

test("readMediaStoreEnv: an empty-string variable counts as missing, and only the missing ones are named", () => {
  assert.throws(() => readMediaStoreEnv({ env: { ...FULL_S3_ENV, TOVU_S3_REGION: "", TOVU_S3_SECRET_ACCESS_KEY: undefined } }), {
    message: `TOVU_MEDIA_BLOB_STORE=s3 requires ${REQUIRED_LIST} — missing: TOVU_S3_REGION, TOVU_S3_SECRET_ACCESS_KEY.`,
  });
});

// ---------------------------------------------------------------------------
// createMediaBlobStore — env override
// ---------------------------------------------------------------------------

test("createMediaBlobStore: an invalid env throws synchronously at boot without touching ports", () => {
  assert.throws(() => createMediaBlobStore({ uploadsDir: "/nonexistent", env: { [MEDIA_OBJECT_STORE_ENV]: "s3" }, ports: throwingPorts }), {
    message: /TOVU_MEDIA_BLOB_STORE=s3 requires/,
  });
});

test("createMediaBlobStore: env local writes ws/{ws}/blobs/{sh}/{sha} under uploadsDir, byte-identical to LocalFsBlobStore both ways", async (t) => {
  const uploadsDir = await tempUploadsDir(t);
  const { blobStore, mediaIsRemoteByEnv } = createMediaBlobStore({ uploadsDir, env: { [MEDIA_OBJECT_STORE_ENV]: "local" }, ports: throwingPorts });
  assert.equal(mediaIsRemoteByEnv, false);

  const legacy = new LocalFsBlobStore({ rootDir: uploadsDir });

  // Written via the new store, read via the legacy class.
  assert.deepEqual(await blobStore.put({ workspaceId: WORKSPACE_ID, sha256: SHA, bytes: BYTES }), { storageKey: KEY });
  assert.equal(KEY, `ws/${WORKSPACE_ID}/blobs/${SHA.slice(0, 2)}/${SHA}`);
  assert.deepEqual(await filesUnder(uploadsDir), [KEY]);
  assert.deepEqual(new Uint8Array(await readFile(path.join(uploadsDir, KEY))), BYTES);
  assert.deepEqual(new Uint8Array(await legacy.get({ storageKey: KEY })), BYTES);
  assert.equal(await legacy.exists({ storageKey: KEY }), true);

  // Written via the legacy class, read via the new store.
  const otherBytes = new TextEncoder().encode("legacy upload");
  const otherSha = createHash("sha256").update(otherBytes).digest("hex");
  const { storageKey: legacyKey } = await legacy.put({ workspaceId: WORKSPACE_ID, sha256: otherSha, bytes: otherBytes });
  assert.deepEqual(await blobStore.get({ storageKey: legacyKey }), otherBytes);
  assert.equal(await blobStore.sizeOf?.({ storageKey: legacyKey }), otherBytes.byteLength);
  assert.equal(await blobStore.exists({ storageKey: legacyKey }), true);

  assert.deepEqual(await blobStore.putIfAbsent({ workspaceId: WORKSPACE_ID, sha256: SHA, bytes: BYTES }), { storageKey: KEY, written: false });
  await blobStore.remove({ storageKey: KEY });
  assert.equal(await legacy.exists({ storageKey: KEY }), false);
});

test("createMediaBlobStore: env s3 resolves s3_compatible from the bundled registry with the env credential, never the site ports", async () => {
  const store = memoryStore();
  const provider = recordingProvider(store);
  const { ports, calls } = fakePorts({ loadBundledRegistry: async () => registryWith([{ id: S3_OBJECT_STORE_ID, provider }]) });
  const { blobStore, mediaIsRemoteByEnv } = createMediaBlobStore({ uploadsDir: "/nonexistent", env: FULL_S3_ENV, ports });
  assert.equal(mediaIsRemoteByEnv, true);

  assert.deepEqual(await blobStore.put({ workspaceId: WORKSPACE_ID, sha256: SHA, bytes: BYTES }), { storageKey: KEY });
  assert.deepEqual([...store.objects.keys()], [KEY]);
  assert.deepEqual(await blobStore.get({ storageKey: KEY }), BYTES);

  assert.equal(provider.inputs.length, 1);
  const [input] = provider.inputs;
  assert.deepEqual(input!.settings, { bucket: "media-bucket", keyPrefix: "site-a/" });
  assert.deepEqual(input!.credential, { fields: { accessKeyId: "AKIDEXAMPLE", region: "eu-west-1", endpoint: "https://r2.example.test" }, secret: "secret-value" });
  assert.equal(input!.host, HOST);
  assert.deepEqual({ ...calls, credential: calls.credential.length }, { factory: 1, bundled: 1, site: 0, setting: 0, credential: 0 });
});

test("createMediaBlobStore: env s3 without s3_compatible in the bundled registry rejects, listing the registry's refusals", async (t) => {
  const uploadsDir = await tempUploadsDir(t);
  const { ports } = fakePorts({ loadBundledRegistry: async () => registryWith([], ["bad manifest in 'x'", "import failed in 'y'"]) });
  const { blobStore } = createMediaBlobStore({ uploadsDir, env: FULL_S3_ENV, ports });
  await assert.rejects(blobStore.exists({ storageKey: KEY }), {
    message: "Media storage provider 's3_compatible' is not available (bad manifest in 'x'; import failed in 'y').",
  });
  assert.deepEqual(await filesUnder(uploadsDir), []);
});

test("createMediaBlobStore: an unavailable provider with no refusals says so without an empty parenthesis", async () => {
  const { ports } = fakePorts({ loadBundledRegistry: async () => registryWith([]) });
  const { blobStore } = createMediaBlobStore({ uploadsDir: "/nonexistent", env: FULL_S3_ENV, ports });
  await assert.rejects(blobStore.exists({ storageKey: KEY }), { message: "Media storage provider 's3_compatible' is not available." });
});

// ---------------------------------------------------------------------------
// createMediaBlobStore — site setting
// ---------------------------------------------------------------------------

test("createMediaBlobStore: ports() is not called at boot, only on first media use, and a good load is reused", async (t) => {
  const uploadsDir = await tempUploadsDir(t);
  const { ports, calls } = fakePorts({ readSetting: async () => "" });
  const { blobStore, mediaIsRemoteByEnv } = createMediaBlobStore({ uploadsDir, env: {}, ports });
  assert.equal(mediaIsRemoteByEnv, false);
  assert.equal(calls.factory, 0);

  assert.equal(await blobStore.exists({ storageKey: KEY }), false);
  assert.equal(calls.factory, 1);
  await blobStore.put({ workspaceId: WORKSPACE_ID, sha256: SHA, bytes: BYTES });
  assert.deepEqual({ factory: calls.factory, setting: calls.setting }, { factory: 1, setting: 1 });
});

test("createMediaBlobStore: an unset setting stores locally without loading any registry or credential", async (t) => {
  const uploadsDir = await tempUploadsDir(t);
  const { ports, calls } = fakePorts({ readSetting: async () => "" });
  const { blobStore } = createMediaBlobStore({ uploadsDir, env: {}, ports });

  await blobStore.put({ workspaceId: WORKSPACE_ID, sha256: SHA, bytes: BYTES });
  assert.deepEqual(await filesUnder(uploadsDir), [KEY]);
  assert.deepEqual(new Uint8Array(await new LocalFsBlobStore({ rootDir: uploadsDir }).get({ storageKey: KEY })), BYTES);
  assert.deepEqual({ bundled: calls.bundled, site: calls.site, credential: calls.credential }, { bundled: 0, site: 0, credential: [] });
});

test("createMediaBlobStore: an explicit 'local' setting is the same local store", async (t) => {
  const uploadsDir = await tempUploadsDir(t);
  const { ports, calls } = fakePorts({ readSetting: async () => "local" });
  const { blobStore } = createMediaBlobStore({ uploadsDir, env: {}, ports });
  await blobStore.put({ workspaceId: WORKSPACE_ID, sha256: SHA, bytes: BYTES });
  assert.deepEqual(await filesUnder(uploadsDir), [KEY]);
  assert.deepEqual({ site: calls.site, credential: calls.credential.length }, { site: 0, credential: 0 });
});

const MEDIA_CALLS: Array<[name: string, call: (store: ReturnType<typeof createMediaBlobStore>["blobStore"]) => Promise<unknown>]> = [
  ["put", (s) => s.put({ workspaceId: WORKSPACE_ID, sha256: SHA, bytes: BYTES })],
  ["putIfAbsent", (s) => s.putIfAbsent({ workspaceId: WORKSPACE_ID, sha256: SHA, bytes: BYTES })],
  ["get", (s) => s.get({ storageKey: KEY })],
  ["sizeOf", (s) => s.sizeOf!({ storageKey: KEY })],
  ["exists", (s) => s.exists({ storageKey: KEY })],
  ["remove", (s) => s.remove({ storageKey: KEY })],
];

/** Every media call rejects with `message` and the uploads folder stays empty (no local fallback). */
async function assertEveryCallRejects(uploadsDir: string, blobStore: ReturnType<typeof createMediaBlobStore>["blobStore"], message: string): Promise<void> {
  for (const [name, call] of MEDIA_CALLS) {
    await assert.rejects(call(blobStore), { message }, `${name} must reject`);
  }
  assert.deepEqual(await filesUnder(uploadsDir), [], "nothing may fall back to local disk");
}

test("createMediaBlobStore: a remote setting with no saved connection rejects every call and never falls back to local", async (t) => {
  const uploadsDir = await tempUploadsDir(t);
  const { ports, calls } = fakePorts({ readSetting: async () => "s3_compatible", resolveSharedCredential: async () => undefined });
  const { blobStore } = createMediaBlobStore({ uploadsDir, env: {}, ports });
  await assertEveryCallRejects(uploadsDir, blobStore, "Media storage 's3_compatible' has no saved connection — connect it first, or clear core.storage.mediaObjectStore.");
  // A failed resolution is retried per call, so connecting later takes effect without a restart of the view.
  assert.equal(calls.credential.length, MEDIA_CALLS.length);
  assert.deepEqual(calls.credential[0], { providerId: "s3_compatible" });
  assert.equal(calls.site, 0);
});

test("createMediaBlobStore: a connection without mediaBucket is refused — the public publish bucket is never used", async (t) => {
  const uploadsDir = await tempUploadsDir(t);
  const { ports, calls } = fakePorts({
    readSetting: async () => "s3_compatible",
    resolveSharedCredential: async () => ({ fields: { accessKeyId: "AK", region: "us-east-1", bucket: "public-site" }, secret: "s" }),
  });
  const { blobStore } = createMediaBlobStore({ uploadsDir, env: {}, ports });
  await assertEveryCallRejects(uploadsDir, blobStore, "Media storage 's3_compatible' needs the connection's 'mediaBucket' field (a private bucket) — the publish bucket is public and is never used for media.");
  assert.equal(calls.site, 0);
});

test("createMediaBlobStore: a whitespace-only mediaBucket counts as absent", async (t) => {
  const uploadsDir = await tempUploadsDir(t);
  const { ports } = fakePorts({
    readSetting: async () => "s3_compatible",
    resolveSharedCredential: async () => ({ fields: { mediaBucket: "   " }, secret: "s" }),
  });
  const { blobStore } = createMediaBlobStore({ uploadsDir, env: {}, ports });
  await assert.rejects(blobStore.exists({ storageKey: KEY }), { message: /needs the connection's 'mediaBucket' field/ });
});

test("createMediaBlobStore: a setting naming a provider the site does not have rejects with the registry's refusals", async (t) => {
  const uploadsDir = await tempUploadsDir(t);
  const { ports } = fakePorts({
    readSetting: async () => "gcs_bucket",
    resolveSharedCredential: async () => ({ fields: { mediaBucket: "private-media" }, secret: "s" }),
    loadSiteRegistry: async () => registryWith([], ["object_store provider 'gcs_bucket' from 'gcs' was not loaded: plugin is not active"]),
  });
  const { blobStore } = createMediaBlobStore({ uploadsDir, env: {}, ports });
  await assertEveryCallRejects(uploadsDir, blobStore, "Media storage provider 'gcs_bucket' is not available (object_store provider 'gcs_bucket' from 'gcs' was not loaded: plugin is not active).");
});

test("createMediaBlobStore: a provider refusing its configuration rejects every call with the provider's reason", async (t) => {
  const uploadsDir = await tempUploadsDir(t);
  const refusing: TovuObjectStoreProvider = { create: () => providerRejected({ code: "not_configured", message: "missing: credential.fields.region" }) };
  const { ports } = fakePorts({
    readSetting: async () => "s3_compatible",
    resolveSharedCredential: async () => ({ fields: { mediaBucket: "private-media" }, secret: "s" }),
    loadSiteRegistry: async () => registryWith([{ id: "s3_compatible", provider: refusing }]),
  });
  const { blobStore } = createMediaBlobStore({ uploadsDir, env: {}, ports });
  await assertEveryCallRejects(uploadsDir, blobStore, "Media storage provider 's3_compatible' refused its configuration: missing: credential.fields.region");
});

test("createMediaBlobStore: a usable remote setting passes {bucket: mediaBucket (trimmed), keyPrefix: mediaKeyPrefix} plus the whole credential", async (t) => {
  const uploadsDir = await tempUploadsDir(t);
  const store = memoryStore();
  const provider = recordingProvider(store);
  const credential = { fields: { accessKeyId: "AK", region: "us-east-1", bucket: "public-site", mediaBucket: " private-media ", mediaKeyPrefix: "media/" }, secret: "s3cr3t" };
  const { ports, calls } = fakePorts({
    readSetting: async () => "s3_compatible",
    resolveSharedCredential: async () => credential,
    loadSiteRegistry: async () => registryWith([{ id: "s3_compatible", provider }]),
  });
  const { blobStore, mediaIsRemoteByEnv } = createMediaBlobStore({ uploadsDir, env: {}, ports });
  assert.equal(mediaIsRemoteByEnv, false, "only the env override marks media remote at boot");

  assert.deepEqual(await blobStore.putIfAbsent({ workspaceId: WORKSPACE_ID, sha256: SHA, bytes: BYTES }), { storageKey: KEY, written: true });
  assert.equal(await blobStore.sizeOf?.({ storageKey: KEY }), BYTES.byteLength);
  assert.deepEqual([...store.objects.keys()], [KEY]);
  assert.deepEqual(await filesUnder(uploadsDir), []);

  assert.equal(provider.inputs.length, 1);
  assert.deepEqual(provider.inputs[0]!.settings, { bucket: "private-media", keyPrefix: "media/" });
  assert.equal(provider.inputs[0]!.credential, credential);
  assert.equal(provider.inputs[0]!.host, HOST);
  assert.deepEqual({ bundled: calls.bundled, site: calls.site }, { bundled: 0, site: 1 });
});
