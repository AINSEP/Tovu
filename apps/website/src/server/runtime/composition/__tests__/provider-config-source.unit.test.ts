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

test("vault adapter: nothing saved reads as null; a write is read back; the public read never opens the secret row", async () => {
  const { state, gets, rows } = fakeState();
  const source = createVaultProviderConfigSource({ state, workspaceId: "ws", scope: "site" });
  assert.equal(source.scope, "site");
  assert.equal(await source.read({ pluginId: "obs" }), null);
  assert.equal(await source.readSettings({ pluginId: "obs" }), null);
  await source.write({ pluginId: "obs", config: { settings: { endpoint: "https://c" }, secrets: { headers: "a=b", unused: "" } } });
  assert.deepEqual(await source.read({ pluginId: "obs" }), { settings: { endpoint: "https://c" }, secrets: { headers: "a=b", unused: "" } });
  gets.length = 0;
  assert.deepEqual(await source.readSettings({ pluginId: "obs" }), { settings: { endpoint: "https://c" }, secretNames: ["headers"] });
  assert.deepEqual(gets, ["provider.settings"]);
  assert.deepEqual([...rows.keys()], ["ws/obs/provider.secrets", "ws/obs/provider.settings"], "secrets are written first");
});

test("vault adapter: malformed rows read as empty, never as values", async () => {
  const { state, rows } = fakeState();
  const source = createVaultProviderConfigSource({ state, workspaceId: "ws", scope: "project" });
  rows.set("ws/obs/provider.settings", { settings: ["x"], secretNames: "headers" });
  assert.deepEqual(await source.readSettings({ pluginId: "obs" }), { settings: {}, secretNames: [] });
  assert.deepEqual(await source.read({ pluginId: "obs" }), { settings: {}, secrets: {} });
  rows.set("ws/obs/provider.settings", { settings: { a: "1", b: 2 }, secretNames: ["s", 3] });
  rows.set("ws/obs/provider.secrets", "not-an-object");
  assert.deepEqual(await source.readSettings({ pluginId: "obs" }), { settings: { a: "1" }, secretNames: ["s"] });
  assert.deepEqual(await source.read({ pluginId: "obs" }), { settings: { a: "1" }, secrets: {} });
  rows.set("ws/obs/provider.settings", "text");
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
