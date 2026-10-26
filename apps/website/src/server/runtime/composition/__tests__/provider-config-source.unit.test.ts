import { fakeAttachments } from "#src/features/project-keys/__tests__/helpers";
import assert from "node:assert/strict";
import test from "node:test";

import type { AgentPluginStateStore } from "#src/features/api-connections/plugin-state";

import { SECRET_OPEN_FAILED } from "#src/features/webhooks/secret-sealer.aesgcm";

import { ProviderConfigUnreadableError, ProviderStoreUnavailableError, createVaultProviderConfigSource, withAttachedProject, withUnavailableProject, type ProviderConfigSource } from "../provider-config-source.js";
import { saveProviderSettings } from "../provider-settings-save.js";

/**
 * @file The provider-settings port with DI fakes: a Map-backed plugin-state store stands in for the
 * sealed vault rows (the real vault path is proven by `deps-provider-plugin-boot.integration.test.ts`).
 */

/** What Tovu's sealer throws when a sealed value can't be opened (the message is the runtime's own). */
const openFailure = (message: string) => Object.assign(new Error(message), { code: SECRET_OPEN_FAILED });

function fakeState(): { state: AgentPluginStateStore; rows: Map<string, unknown>; gets: string[] } {
  const rows = new Map<string, unknown>();
  const gets: string[] = [];
  const view = ({ workspaceId, pluginId }: { workspaceId: string; pluginId: string }) => ({
    get: async ({ key }: { key: string }) => { gets.push(key); return (rows.get(`${workspaceId}/${pluginId}/${key}`) ?? null) as never; },
    set: async ({ key, value }: { key: string; value: unknown }) => { rows.set(`${workspaceId}/${pluginId}/${key}`, value); },
    delete: async () => {},
  });
  return { rows, gets, state: { forPlugin: view, readerFor: view, describe: async () => ({ keys: [] }) } as unknown as AgentPluginStateStore };
}

test("vault adapter: nothing saved reads as null; a write is read back as one row; the public read returns secret names only", async () => {
  const { state, gets, rows } = fakeState();
  const source = createVaultProviderConfigSource({ state, workspaceId: "ws", scope: "site" });
  assert.equal(source.scope, "site");
  assert.equal(await source.read({ pluginId: "obs" }), null);
  assert.equal(await source.readSettings({ pluginId: "obs" }), null);
  await source.write({ pluginId: "obs", config: { settings: { endpoint: "https://c" }, secrets: { headers: "a=b", unused: "" } } });
  assert.deepEqual(await source.read({ pluginId: "obs" }), { settings: { endpoint: "https://c" }, secrets: { headers: "a=b", unused: "" } });
  gets.length = 0;
  assert.deepEqual(await source.readSettings({ pluginId: "obs" }), { settings: { endpoint: "https://c" }, secretNames: ["headers"] });
  assert.deepEqual(gets, ["provider.config"], "one snapshot read");
  assert.deepEqual([...rows.keys()], ["ws/obs/provider.config"], "settings and secrets are one row");
});

test("vault adapter: malformed rows read as empty, never as values", async () => {
  const { state, rows } = fakeState();
  const source = createVaultProviderConfigSource({ state, workspaceId: "ws", scope: "project" });
  rows.set("ws/obs/provider.config", { settings: ["x"], secrets: "headers" });
  assert.deepEqual(await source.readSettings({ pluginId: "obs" }), { settings: {}, secretNames: [] });
  assert.deepEqual(await source.read({ pluginId: "obs" }), { settings: {}, secrets: {} });
  rows.set("ws/obs/provider.config", { settings: { a: "1", b: 2 }, secrets: { s: "v", n: 3 } });
  assert.deepEqual(await source.readSettings({ pluginId: "obs" }), { settings: { a: "1" }, secretNames: ["s"] });
  assert.deepEqual(await source.read({ pluginId: "obs" }), { settings: { a: "1" }, secrets: { s: "v" } });
  rows.set("ws/obs/provider.config", "text");
  assert.equal(await source.read({ pluginId: "obs" }), null);
});

function memorySource(scope: ProviderConfigSource["scope"]): ProviderConfigSource & { writes: string[] } {
  const saved = new Map<string, { settings: Record<string, string>; secrets: Record<string, string> }>();
  const writes: string[] = [];
  return {
    scope, writes,
    read: async ({ pluginId }) => saved.get(pluginId) ?? null,
    readSettings: async ({ pluginId }) => { const found = saved.get(pluginId); return found ? { settings: found.settings, secretNames: Object.keys(found.secrets) } : null; },
    write: async ({ pluginId, config }) => { writes.push(pluginId); saved.set(pluginId, { settings: { ...config.settings }, secrets: { ...config.secrets } }); },
  };
}

test("precedence: without a project store the site vault is the source", () => {
  const site = memorySource("site");
  assert.equal(site.scope, "site");
});

test("site values win; unattached project values stay hidden; a different key on B leaves A unchanged", async () => {
  const project = memorySource("project"), site = memorySource("site"); const attachments = fakeAttachments();
  const keyId = "plugin-state:obs:provider.config";
  const a = withAttachedProject({ site }, { project, attachments, siteId: "a" });
  const bSite = memorySource("site");
  const b = withAttachedProject({ site: bSite }, { project, attachments, siteId: "b" });
  const first = { settings: { endpoint: "https://a.example.test" }, secrets: { token: ["fake", "a"].join("_") } };
  assert.deepEqual(await a.write({ pluginId: "obs", config: first }), { keyId, store: "project", usedByThisSite: false, usedBy: [] });
  assert.equal(await a.read({ pluginId: "obs" }), null);
  assert.equal(await b.readSettings({ pluginId: "obs" }), null);
  await attachments.attach({ siteId: "a", keyId, siteName: "A" });
  assert.deepEqual(await a.read({ pluginId: "obs" }), first);
  const second = { settings: { endpoint: "https://b.example.test" }, secrets: { token: ["fake", "b"].join("_") } };
  assert.deepEqual(await b.write({ pluginId: "obs", config: second }), { keyId, store: "site", usedByThisSite: true, usedBy: [] });
  assert.deepEqual(await a.read({ pluginId: "obs" }), first);
  assert.deepEqual(await b.read({ pluginId: "obs" }), second);
  await attachments.attach({ siteId: "b", keyId, siteName: "B" });
  assert.deepEqual(await b.read({ pluginId: "obs" }), second, "the site row wins even when a project row is attached");
  await attachments.detach({ siteId: "a", keyId });
  assert.equal(await a.read({ pluginId: "obs" }), null);
  const missing = withAttachedProject({ site: memorySource("site") }, { project, attachments });
  assert.equal(await missing.read({ pluginId: "obs" }), null);
});

test("a project store that failed to open: reads fall back to the site vault, a save is refused (never written to the site vault)", async () => {
  const site = memorySource("site");
  await site.write({ pluginId: "a", config: { settings: { from: "site" }, secrets: {} } });
  const source = withUnavailableProject({ site, reason: "EACCES: permission denied" });
  assert.equal(source.scope, "project");
  assert.deepEqual(await source.read({ pluginId: "a" }), { settings: { from: "site" }, secrets: {} });
  assert.deepEqual(await source.readSettings({ pluginId: "a" }), { settings: { from: "site" }, secretNames: [] });
  await assert.rejects(source.write({ pluginId: "b", config: { settings: {}, secrets: {} } }), ProviderStoreUnavailableError);
  // Both cards share this save rule: the refusal names the cause instead of a bare internal error.
  const saved = await saveProviderSettings({ config: source, pluginId: "b", fields: [{ name: "host", label: "Host" }], values: { host: "https://h" } });
  assert.deepEqual(saved, { refusal: { code: "PROVIDER_SETTINGS_UNAVAILABLE", error: "Project settings can't be saved right now: EACCES: permission denied" } });
  assert.deepEqual(site.writes, ["a"], "nothing reached the site vault");
});

const PAIR_A = { settings: { endpoint: "https://old.example" }, secrets: { headers: "old=1" } };
const PAIR_B = { settings: { endpoint: "https://new.example" }, secrets: { headers: "new=2" } };
const isWholePair = (found: unknown) => [PAIR_A, PAIR_B].some((pair) => JSON.stringify(found) === JSON.stringify(pair));

test("vault adapter: a save that fails part-way leaves the previous settings + secrets pair whole (Codex fix-lane HIGH)", async () => {
  const { state } = fakeState();
  const source = createVaultProviderConfigSource({ state, workspaceId: "ws", scope: "site" });
  await source.write({ pluginId: "obs", config: PAIR_A });
  // Every store write after the first one of the next save fails: whatever that save committed must
  // be a whole pair or nothing.
  const view = state.forPlugin({ workspaceId: "ws", pluginId: "obs" });
  let sets = 0;
  const failing = { ...state, forPlugin: () => ({ ...view, set: async (input: { key: string; value: unknown }) => { sets += 1; if (sets > 1) throw new Error("disk full"); await view.set(input as never); } }) } as unknown as AgentPluginStateStore;
  await createVaultProviderConfigSource({ state: failing, workspaceId: "ws", scope: "site" }).write({ pluginId: "obs", config: PAIR_B }).catch(() => undefined);
  assert.ok(isWholePair(await source.read({ pluginId: "obs" })), "never the new secret with the old endpoint");
});

test("vault adapter: a read racing a rotation never pairs the old endpoint with the new secret (Codex fix-lane HIGH)", async () => {
  const { state } = fakeState();
  const source = createVaultProviderConfigSource({ state, workspaceId: "ws", scope: "site" });
  await source.write({ pluginId: "obs", config: PAIR_A });
  // The rotation commits completely between the reader's store reads (another site booting).
  const view = state.forPlugin({ workspaceId: "ws", pluginId: "obs" });
  let rotated = false;
  const racing = { ...state, forPlugin: () => ({ ...view, get: async (input: { key: string }) => {
    const value = await view.get(input as never);
    if (!rotated) { rotated = true; await source.write({ pluginId: "obs", config: PAIR_B }); }
    return value;
  } }) } as unknown as AgentPluginStateStore;
  const found = await createVaultProviderConfigSource({ state: racing, workspaceId: "ws", scope: "site" }).read({ pluginId: "obs" });
  assert.ok(isWholePair(found), `read a mixed pair: ${JSON.stringify(found)}`);
  assert.ok(isWholePair(await source.read({ pluginId: "obs" })));
});

test("vault adapter: only a failure to OPEN a listed row is unreadable; a store failure (SQLITE_BUSY) surfaces, so a save never drops a valid key", async () => {
  const listedState = (failure: Error) => ({
    forPlugin: () => ({ get: async () => { throw failure; }, set: async () => {}, delete: async () => {} }),
    describe: async () => ({ keys: [{ key: "provider.config", revision: 3 }] }),
  }) as unknown as AgentPluginStateStore;
  const sourceFailingWith = (failure: Error) => createVaultProviderConfigSource({ state: listedState(failure), workspaceId: "ws", scope: "project" });
  // A transient lock or a driver/DB failure is the store failing, not a lost key: it surfaces as itself
  // (the card's GET/PUT answer 500) instead of reading as "not configured" and saving secrets {}.
  // An uncoded error that merely reads like an open failure is classified by its (missing) code, never its wording.
  for (const failure of [Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" }), new Error("Connection terminated unexpectedly"),
    Object.assign(new Error("Secrets vault: context"), { name: "VaultError", code: "context" }), new Error("Unsupported state or unable to authenticate data")]) {
    await assert.rejects(sourceFailingWith(failure).read({ pluginId: "obs" }), (caught) => caught === failure, failure.message);
    await assert.rejects(sourceFailingWith(failure).readSettings({ pluginId: "obs" }), (caught) => caught === failure, failure.message);
  }
  // Opening failures: a wrong/re-minted key (GCM auth tag), a damaged envelope, a payload that opened but is not a record.
  for (const failure of [openFailure("Unsupported state or unable to authenticate data"), openFailure("error:1C800064:Provider routines::bad decrypt"),
    openFailure("AesGcmSecretSealer cannot open alg 'x' (expected 'aes-256-gcm')"), Object.assign(new Error("Secrets vault: invalid-record"), { name: "VaultError", code: "invalid-record" })]) {
    await assert.rejects(sourceFailingWith(failure).read({ pluginId: "obs" }), ProviderConfigUnreadableError, failure.message);
    assert.deepEqual(await sourceFailingWith(failure).readSettings({ pluginId: "obs" }), { settings: {}, secretNames: [], unreadable: true }, failure.message);
  }
});

test("vault adapter: a row this machine cannot open reads as unreadable (listed but not openable); any other failure surfaces as itself", async () => {
  const sealed = openFailure("Unsupported state or unable to authenticate data");
  const stateWith = (keys: { key: string; revision: number }[] | Error) => ({
    forPlugin: () => ({ get: async () => { throw sealed; }, set: async () => {}, delete: async () => {} }),
    describe: async () => { if (keys instanceof Error) throw keys; return { keys }; },
  }) as unknown as AgentPluginStateStore;
  const unreadable = createVaultProviderConfigSource({ state: stateWith([{ key: "provider.config", revision: 3 }]), workspaceId: "ws", scope: "project" });
  const error = await unreadable.read({ pluginId: "obs" }).catch((caught: unknown) => caught);
  assert.ok(error instanceof ProviderConfigUnreadableError);
  assert.equal((error as Error).cause, sealed);
  assert.deepEqual(await unreadable.readSettings({ pluginId: "obs" }), { settings: {}, secretNames: [], unreadable: true });
  // Not listed (or the listing fails too): the store itself is failing, so the original error surfaces.
  const missing = createVaultProviderConfigSource({ state: stateWith([{ key: "other", revision: 1 }]), workspaceId: "ws", scope: "project" });
  await assert.rejects(missing.read({ pluginId: "obs" }), (caught) => caught === sealed);
  await assert.rejects(missing.readSettings({ pluginId: "obs" }), (caught) => caught === sealed);
  const down = createVaultProviderConfigSource({ state: stateWith(new Error("db down")), workspaceId: "ws", scope: "project" });
  await assert.rejects(down.read({ pluginId: "obs" }), (caught) => caught === sealed);
  // Site precedence also applies when the project row is unreadable.
  const site: ProviderConfigSource = { scope: "site", read: async () => ({ settings: { endpoint: "https://site" }, secrets: {} }),
    readSettings: async () => ({ settings: { endpoint: "https://site" }, secretNames: [] }), write: async () => {} };
  const both = withAttachedProject({ site }, { project: unreadable, attachments: fakeAttachments(), siteId: "a" });
  assert.deepEqual(await both.read({ pluginId: "obs" }), { settings: { endpoint: "https://site" }, secrets: {} });
  assert.deepEqual(await both.readSettings({ pluginId: "obs" }), { settings: { endpoint: "https://site" }, secretNames: [] });
});
