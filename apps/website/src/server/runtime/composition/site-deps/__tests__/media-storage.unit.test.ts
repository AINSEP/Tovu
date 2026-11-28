import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { composeMediaStorage } from "../media-storage.js";

/**
 * @file `composeMediaStorage`'s late-bound shared-credential port: media reads the site's saved bucket
 * connection through the publish credential source, which only exists once `routeDeps` is built, so
 * `resolveSharedCredential` waits on `provideMediaCredentials` and maps the provider id (underscores)
 * onto the deploy target id (hyphens) before projecting the resolved connection to `{ fields, secret }`.
 */

type Required = Parameters<typeof composeMediaStorage>[0];
type CredentialSource = Parameters<ReturnType<typeof composeMediaStorage>["provideMediaCredentials"]>[0];

const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-media-storage-"));
after(() => fs.rmSync(uploadsDir, { recursive: true, force: true }));

function compose(over: Partial<Record<"observability" | "agentPluginLifecycle" | "settingsRepo", unknown>> = {}) {
  return composeMediaStorage({
    overrides: { uploadsDir },
    resolvedSiteBinding: { dir: uploadsDir, name: "bakery" },
    observability: () => undefined,
    workspaceId: () => "ws-media-9",
    agentPluginLifecycle: {},
    settingsRepo: () => ({}),
    ...over,
    store: { sqliteDb: openContentDb(":memory:") },
    dbPath: ":memory:",
  } as unknown as Required);
}

test("resolveSharedCredential waits for the credential source, asks for the hyphenated target, and splits off the token as the secret", async () => {
  const { mediaStorePorts, provideMediaCredentials } = compose();
  const seen: unknown[] = [];
  const pending = mediaStorePorts().resolveSharedCredential({ providerId: "cloudflare_r2_eu" });
  provideMediaCredentials({ resolve: async (input: unknown) => { seen.push(input); return { ok: true, token: "tok-a", accountId: "acct-1", bucket: "pics", credentialId: "cred-1" }; } } as unknown as CredentialSource);
  assert.deepEqual(await pending, { fields: { accountId: "acct-1", bucket: "pics" }, secret: "tok-a" });
  assert.deepEqual(seen, [{ workspaceId: "ws-media-9", target: "cloudflare-r2-eu" }]);
});

test("resolveSharedCredential answers undefined when the site has no usable saved connection", async () => {
  const { mediaStorePorts, provideMediaCredentials } = compose();
  provideMediaCredentials({ resolve: async () => ({ ok: false, reason: "missing" }) } as unknown as CredentialSource);
  assert.equal(await mediaStorePorts().resolveSharedCredential({ providerId: "s3" }), undefined);
});

test("host.wrapFetch reports each outbound call to the provider plugins' observability port", async () => {
  const calls: unknown[] = [];
  const observability = { trackOutboundCall: (target: unknown) => ({ run: (fn: () => unknown) => fn(), end: (outcome: unknown) => calls.push({ target, outcome }) }) };
  const { host } = compose({ observability: () => observability }).mediaStorePorts();
  const { wrapFetch } = host;
  assert.ok(wrapFetch, "the composed media host supplies wrapFetch");
  const wrapped = wrapFetch((async () => ({ status: 207 })) as unknown as typeof fetch);
  assert.equal((await wrapped("https://bucket.example/obj-1", { method: "PUT" })).status, 207);
  assert.deepEqual(calls, [{ target: { method: "PUT", url: "https://bucket.example/obj-1" }, outcome: { statusCode: 207 } }]);
});

test("loadSiteRegistry asks the site's plugin lifecycle for this workspace's object-store contributions, seeded with local disk", async () => {
  const seen: unknown[] = [];
  const agentPluginLifecycle = { loadPluginContributions: async (input: { workspaceId: string }, optional: unknown) => { seen.push([input.workspaceId, optional]); return { items: [], refusals: ["plug-b: no module"] }; } };
  const { registry, refusals } = await compose({ agentPluginLifecycle }).mediaStorePorts().loadSiteRegistry();
  assert.deepEqual(seen, [["ws-media-9", { orderByPluginId: true }]]);
  assert.deepEqual(refusals, ["plug-b: no module"]);
  assert.deepEqual(registry.list().map((entry) => entry.id), ["local"]);
});

test("loadBundledRegistry loads the bundled object-store plugins on top of local disk", async () => {
  const { registry, refusals } = await compose().mediaStorePorts().loadBundledRegistry();
  assert.deepEqual(refusals, []);
  assert.deepEqual(registry.list().map((entry) => entry.id).sort(), ["local", "s3_compatible", "vercel"]);
});

test("readSetting reads core.storage.mediaObjectStore for this workspace from the site's settings repo", async () => {
  const reads: unknown[] = [];
  const definition = { settingId: "def-media", namespace: "core.storage", key: "mediaObjectStore", version: 1, status: "active", defaultValue: "", coercionTag: null };
  const settingsRepo = {
    findActiveDefinition: async (cursor: { namespace: string; key: string }) => (cursor.namespace === "core.storage" && cursor.key === "mediaObjectStore" ? definition : null),
    getWorkspaceValue: async (input: unknown) => { reads.push(input); return { state: "set", valueJson: " s3_compatible ", defVersion: 1 }; },
    getGlobalValue: async () => null,
  };
  assert.equal(await compose({ settingsRepo: () => settingsRepo }).mediaStorePorts().readSetting(), "s3_compatible");
  assert.deepEqual(reads, [{ workspaceId: "ws-media-9", settingId: "def-media" }]);
});
