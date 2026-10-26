import assert from "node:assert/strict";
import test from "node:test";

import type { AgentPluginStateStore } from "#src/features/api-connections/plugin-state";

import { createVaultProviderConfigSource, withProjectPrecedence, type ProviderConfigSource } from "../provider-config-source.js";

/**
 * @file The provider-settings port with DI fakes: a Map-backed plugin-state store stands in for the
 * sealed vault rows (the real vault path is proven by `deps-provider-plugin-boot.integration.test.ts`).
 */

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
  assert.equal(withProjectPrecedence({ site }), site);
});

test("precedence: the project store answers first, the site vault per plugin otherwise; writes go to the project store", async () => {
  const site = memorySource("site");
  const project = memorySource("project");
  await site.write({ pluginId: "a", config: { settings: { from: "site" }, secrets: {} } });
  await site.write({ pluginId: "b", config: { settings: { from: "site" }, secrets: {} } });
  await project.write({ pluginId: "b", config: { settings: { from: "project" }, secrets: { k: "v" } } });
  const source = withProjectPrecedence({ site }, { project });
  assert.equal(source.scope, "project");
  assert.deepEqual(await source.read({ pluginId: "a" }), { settings: { from: "site" }, secrets: {} });
  assert.deepEqual(await source.read({ pluginId: "b" }), { settings: { from: "project" }, secrets: { k: "v" } });
  assert.deepEqual(await source.readSettings({ pluginId: "a" }), { settings: { from: "site" }, secretNames: [] });
  assert.deepEqual(await source.readSettings({ pluginId: "b" }), { settings: { from: "project" }, secretNames: ["k"] });
  await source.write({ pluginId: "c", config: { settings: {}, secrets: {} } });
  assert.deepEqual([project.writes, site.writes], [["b", "c"], ["a", "b"]]);
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
