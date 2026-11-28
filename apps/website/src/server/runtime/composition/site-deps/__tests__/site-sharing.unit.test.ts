import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { configureSiteSharing } from "../site-sharing.js";

/**
 * @file `configureSiteSharing`'s own glue, driven through the share backend it installs on the route deps:
 * the static exporter ports (render, themes, context), and the delivery ports (connected peer, runtime own folder,
 * object store) that `resolveShareDelivery` walks. Everything below the glue is real; the route deps are fakes.
 */

const WORKSPACE = "ws-share-unit";
const PEER = { workspaceId: WORKSPACE, id: "peer-one", label: "Live site", baseUrl: "https://peer.example", remoteWorkspaceId: "ws-remote", sealed: null, masked: null, aadVersion: 1, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-02T00:00:00.000Z" };
const SHARE_ENV = ["TOVU_SHARE_PUBLIC_ORIGIN", "TOVU_SHARE_PERSISTENT_STORAGE"] as const;

type Call = [string, unknown];

function restoreShareEnv(t: TestContext) {
  const previous = SHARE_ENV.map(name => [name, process.env[name]] as const);
  for (const name of SHARE_ENV) delete process.env[name];
  t.after(() => { for (const [name, value] of previous) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
}

type RigOptions = { peers?: readonly object[]; sources?: boolean; onPeerList?: () => void; sealedPeer?: object; guardedSend?: (input: unknown) => Promise<unknown> };

/** The peer repo's vault half: a saved key opens to `key-peer-1` for the peer's own credential kind only. */
const PEER_VAULT_BINDING = { kind: "publish-peer", ownerKey: "tovu", createService: () => ({ get: async () => ({ payload: { apiKey: "key-peer-1" } }) }) };

async function rig(t: TestContext, { peers = [], sources = true, onPeerList, sealedPeer, guardedSend }: RigOptions = {}) {
  restoreShareEnv(t);
  const root = await mkdtemp(path.join(tmpdir(), "site-sharing-unit-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const siteDir = path.join(root, "site"), themesDir = path.join(siteDir, "themes"), uploadsDir = path.join(siteDir, "uploads");
  await mkdir(themesDir, { recursive: true });
  await mkdir(uploadsDir, { recursive: true });
  const calls: Call[] = [];
  const preset = { preset: true };
  const routeDeps: Record<string, unknown> = {
    siteBackupSources: sources ? { siteDir, tovuVersion: "0.0.0-unit" } : undefined,
    siteShareBackend: preset,
    clock: { nowMs: () => Date.parse("2026-11-20T10:00:00.000Z") },
    publishExecutionMode: "local",
    vendorCredentialSetRepo: {},
    loadDeployTargets: async () => { throw new Error("no deploy targets in this rig"); },
    themes: [
      { status: "valid", manifest: { id: "alpha", name: "Alpha" } },
      { status: "invalid", manifest: { id: "broken", name: "Broken" } },
      { status: "valid", manifest: { id: "beta", name: "Beta" } },
    ],
    staticSiteContext: async () => ({ name: "Unit Site", slug: "unit-site", theme: "Alpha", themeId: "alpha" }),
    exportSiteBound: async (input: unknown) => { calls.push(["render", input]); throw new Error("render-stop"); },
    publishContentPeerRepo: {
      listByWorkspace: async (input: unknown) => { calls.push(["peers", input]); onPeerList?.(); return peers; },
      findById: async (input: unknown) => { calls.push(["peer", input]); return sealedPeer ?? null; },
      binding: PEER_VAULT_BINDING,
      vault: {},
    },
  };
  const dbPath = path.join(root, "db", "content.db");
  const required = {
    dbPath, resolvedSiteBinding: { dir: siteDir },
    agentPluginLayout: { root: path.join(siteDir, "agent-plugins") }, skillLayout: { root: path.join(siteDir, "skills") },
    resolvedThemesDir: themesDir, resolvedUploadsDir: uploadsDir,
    mediaStorePorts: () => ({ loadSiteRegistry: async () => { calls.push(["objectStore", null]); return { registry: { list: () => [] }, refusals: [] }; } }),
    blobStore: {}, workspaceId: WORKSPACE, identity: { ownerPrincipalId: "owner" },
    settingsRepo: { findActiveDefinition: async () => null },
    siteAssistantSecretKeyring: {}, siteAssistantSecretSealer: {},
    publishContentPeerHttpClient: { send: async (input: unknown) => { calls.push(["peerHttp", input]); return { status: 204, headers: {}, bodyText: "" }; } },
    guardedOutboundHttpClient: { send: guardedSend ?? (async () => { throw new Error("no network in this rig"); }) },
    routeDeps, savedKeys: {},
  } as unknown as Parameters<typeof configureSiteSharing>[0];
  configureSiteSharing(required);
  const backend = routeDeps.siteShareBackend as { registry: { put(input: { record: object }): Promise<void> }; staticOptions(input: Record<string, never>): Promise<unknown>; expiryChoices(input: Record<string, never>): Promise<readonly number[]>; create(input: object, options?: { waitMs?: number }): Promise<unknown>; revoke(input: { shareId: string }): Promise<unknown> };
  return { calls, preset, routeDeps, backend, dbPath };
}

test("without backup sources the route deps keep their share backend and no share catalog is created", async t => {
  const { routeDeps, preset, dbPath } = await rig(t, { sources: false });
  assert.equal(routeDeps.siteShareBackend, preset);
  assert.equal(existsSync(path.join(path.dirname(dbPath), "ops", "shares")), false);
});

test("static export options list only the valid themes, by manifest id and name, with the context's theme active", async t => {
  const { backend } = await rig(t);
  assert.deepEqual(await backend.staticOptions({}), { activeThemeId: "alpha", themes: [{ themeId: "alpha", name: "Alpha" }, { themeId: "beta", name: "Beta" }] });
});

test("a static share renders the active theme through the site exporter with theme previews switched off", async t => {
  const { backend, calls } = await rig(t);
  await assert.rejects(backend.create({ principalId: "owner", signal: new AbortController().signal, format: "static" }, { waitMs: 5_000 }), { code: "UNAVAILABLE", message: "alpha: Error: render-stop" });
  const renders = calls.filter(([kind]) => kind === "render").map(([, input]) => input as Record<string, unknown>);
  assert.equal(renders.length, 1);
  assert.deepEqual({ ...renders[0], outputDir: typeof renders[0]?.outputDir }, { outputDir: "string", clean: true, themeId: "alpha", includeThemePreviews: false });
});

test("expiry choices are offered only when a persistent public share origin is configured", async t => {
  const { backend, calls } = await rig(t);
  assert.deepEqual(await backend.expiryChoices({}), [], "no origin: object store or ZIP only");
  process.env.TOVU_SHARE_PUBLIC_ORIGIN = "https://share.example";
  assert.deepEqual(await backend.expiryChoices({}), [], "an origin without persistent storage is not offered");
  process.env.TOVU_SHARE_PERSISTENT_STORAGE = "1";
  assert.deepEqual(await backend.expiryChoices({}), [7, 30, 90]);
  assert.deepEqual(calls, [["peers", { workspaceId: WORKSPACE }], ["objectStore", null], ["peers", { workspaceId: WORKSPACE }], ["objectStore", null], ["peers", { workspaceId: WORKSPACE }]]);
});

test("an origin withdrawn while the peer lookup is in flight falls back with a warning, never a link without an origin", async t => {
  const warnings: string[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args.map(value => typeof value === "string" ? value : JSON.stringify(value)).join(" ")); });
  const { backend } = await rig(t, { onPeerList: () => { delete process.env.TOVU_SHARE_PUBLIC_ORIGIN; } });
  process.env.TOVU_SHARE_PUBLIC_ORIGIN = "https://share.example";
  process.env.TOVU_SHARE_PERSISTENT_STORAGE = "1";
  assert.deepEqual(await backend.expiryChoices({}), []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /\[site-share\] runtime share delivery is misconfigured/);
  assert.match(warnings[0] ?? "", /UNEXPECTED/, "the composition's own guard refuses, before the origin parser sees undefined");
});

test("a new share resolves the connected peer's credential by its id", async t => {
  const { backend, calls } = await rig(t, { peers: [PEER] });
  assert.deepEqual(await backend.expiryChoices({}), []);
  assert.deepEqual(calls.slice(0, 2), [["peers", { workspaceId: WORKSPACE }], ["peer", { workspaceId: WORKSPACE, id: "peer-one" }]]);
});

test("a revoke saved against another base URL never resolves the connected peer's credential", async t => {
  const { backend, calls } = await rig(t, { peers: [PEER] });
  const shareId = "0b0c4d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e", token = "B".repeat(16);
  await backend.registry.put({ record: { shareId, token, site: WORKSPACE, file: "site.tovu.zip", bytes: 1, sha256: "0".repeat(64), url: `https://other.example/_share/${token}/site.tovu.zip`, status: "active",
    createdAt: "2026-11-20T00:00:00.000Z", revokedAt: null, storage: { provider: "tovu-server", binding: "https://other.example", key: `_share/${token}/site.tovu.zip` } } });
  // No delivery for a binding the connected peer does not own: the share is disabled here and the remote copy is left alone.
  await assert.rejects(backend.revoke({ shareId }), { code: "DELETE_FAILED", message: "Share is disabled locally; configure its original storage to delete the remote artifact." });
  assert.deepEqual(calls, [["peers", { workspaceId: WORKSPACE }]]);
});

const LIVE_SHARE = (token: string, expiresAt: string) => ({ shareId: "1b0c4d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e", token, site: WORKSPACE, file: "site.tovu.zip", bytes: 1, sha256: "0".repeat(64),
  url: `https://share.example/_share/${token}/site.tovu.zip`, status: "active", createdAt: "2026-11-19T00:00:00.000Z", revokedAt: null, expiresAt });

// Mutation: l.78 the catalog ignores the site clock (`now: () => Date.now()`; the run date is past both expiries).
test("the share catalog judges a public link's expiry by the site clock", async t => {
  const { backend } = await rig(t);
  const registry = backend.registry as unknown as { put(input: { record: object }): Promise<void>; findToken(input: { token: string; file: string }): Promise<{ shareId: string } | null> };
  await registry.put({ record: LIVE_SHARE("C".repeat(16), "2026-11-20T09:59:59.000Z") });
  assert.equal(await registry.findToken({ token: "C".repeat(16), file: "site.tovu.zip" }), null, "expired one second before the site clock's 10:00");
  await registry.put({ record: { ...LIVE_SHARE("D".repeat(16), "2026-11-20T10:00:01.000Z"), shareId: "2b0c4d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e" } });
  assert.equal((await registry.findToken({ token: "D".repeat(16), file: "site.tovu.zip" }))?.shareId, "2b0c4d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e");
});

// Mutation: l.131 hands the peer the guarded client (`httpClient: guardedOutboundHttpClient`), or drops the opened key.
test("revoking a share on the connected peer deletes it there with the peer's saved key, over the publish client", async t => {
  const { backend, calls } = await rig(t, { peers: [PEER], sealedPeer: { ...PEER, sealed: { v: 1 } }, guardedSend: async () => ({ status: 404, headers: {} }) });
  const shareId = "3b0c4d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e", token = "E".repeat(16), key = `_share/${token}/site.tovu.zip`;
  await backend.registry.put({ record: { shareId, token, site: WORKSPACE, file: "site.tovu.zip", bytes: 1, sha256: "0".repeat(64), url: `https://peer.example/${key}`, status: "active",
    createdAt: "2026-11-20T00:00:00.000Z", revokedAt: null, storage: { provider: "tovu-server", binding: "https://peer.example", key } } });
  const revoked = await backend.revoke({ shareId }) as { status: string };
  assert.equal(revoked.status, "revoked");
  const sends = calls.filter(([kind]) => kind === "peerHttp").map(([, input]) => input as { method: string; url: string; headers: Record<string, string> });
  assert.deepEqual(sends.map(send => [send.method, send.url, send.headers.authorization]), [
    ["DELETE", `https://peer.example/api/admin/v1/workspaces/ws-remote/site-shares/artifacts/${token}/site.tovu.zip`, "Bearer key-peer-1"],
  ]);
});
