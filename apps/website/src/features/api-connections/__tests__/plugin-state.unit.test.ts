/**
 * @file Phase-C unit tests for `plugin-state.ts` write and delete paths: a concurrent save is an
 * actionable "changed while saving" error (keeping its cause), other storage faults propagate as
 * they are, a value JSON cannot represent is refused, a delete of a missing key is a no-op and a
 * delete that loses a race to another writer is not an error. In-memory vault; no network.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { InMemoryVaultRepo, VaultError, type SecretsVaultService } from "@jini-ai/platform/secrets/credential-sets";
import type { AdminSurfaceStateValue } from "@jini-ai/agent-plugins/admin-surfaces";

import { createAgentPluginStateStore, PLUGIN_STATE_UNAVAILABLE_MESSAGE } from "../plugin-state.js";
import { createApiConnectionVault } from "../vault-stores.js";

const SCOPE = { workspaceId: "ws-1", pluginId: "acme-office" };

function storeOver() {
  const keyring = new InMemoryKeyring({ hkdfSalt: "plugin-state-c3" });
  const vault = createApiConnectionVault({ repo: new InMemoryVaultRepo({}), keyring, sealer: new AesGcmSecretSealer({ keyring }), clock: { nowMs: () => Date.now() }, workspaceId: "ws-1" });
  return { vault, state: createAgentPluginStateStore({ vault, workspaceId: "ws-1" }).forPlugin(SCOPE) };
}

/** Replaces one vault method with a fault (an instance property with the method's own type). */
function failing<K extends "put" | "delete">(vault: SecretsVaultService, method: K, error: Error): void {
  (vault as Pick<SecretsVaultService, K>)[method] = (async () => { throw error; }) as SecretsVaultService[K];
}

test("set: a save that lost a race to another save says to reload and retry, keeping the cause", async () => {
  const { vault, state } = storeOver();
  const conflict = new VaultError({ code: "conflict" });
  failing(vault, "put", conflict);
  await assert.rejects(state.set({ key: "products", value: ["tables"] }), (error: unknown) => {
    assert.equal((error as Error).message, "This setting changed while it was being saved. Reload the plugin's settings and retry.");
    assert.equal((error as Error).cause, conflict);
    return true;
  });
});

test("set: a storage fault that is not a conflict propagates unchanged", async () => {
  const { vault, state } = storeOver();
  failing(vault, "put", new Error("vault storage write failed"));
  await assert.rejects(state.set({ key: "products", value: ["tables"] }), { message: "vault storage write failed" });
});

test("set: a value JSON cannot represent is refused before anything is stored", async () => {
  const { state } = storeOver();
  // Malformed input on purpose: `undefined` is outside the value type, as a buggy handler could send.
  await assert.rejects(state.set({ key: "products", value: undefined as unknown as AdminSurfaceStateValue }), { message: /A plugin setting may be at most \d+ bytes of JSON\./ });
  assert.equal(await state.get({ key: "products" }), null);
});

test("delete: a key that was never saved is a no-op", async () => {
  const { state } = storeOver();
  await state.delete({ key: "never-saved" });
  assert.equal(await state.get({ key: "never-saved" }), null);
});

test("delete: a delete another writer raced (conflict) is not an error", async () => {
  const { vault, state } = storeOver();
  await state.set({ key: "products", value: ["tables"] });
  failing(vault, "delete", new VaultError({ code: "conflict" }));
  await assert.doesNotReject(state.delete({ key: "products" }));
});

test("delete: a storage fault that is not a conflict propagates", async () => {
  const { vault, state } = storeOver();
  await state.set({ key: "products", value: ["tables"] });
  failing(vault, "delete", new Error("vault storage write failed"));
  await assert.rejects(state.delete({ key: "products" }), { message: "vault storage write failed" });
});

test("delete: a saved key is gone after delete", async () => {
  const { state } = storeOver();
  await state.set({ key: "products", value: ["tables"] });
  await state.delete({ key: "products" });
  assert.equal(await state.get({ key: "products" }), null);
});

function storeAndVault() {
  const keyring = new InMemoryKeyring({ hkdfSalt: "plugin-state-describe" });
  const vault = createApiConnectionVault({ repo: new InMemoryVaultRepo({}), keyring, sealer: new AesGcmSecretSealer({ keyring }), clock: { nowMs: () => Date.now() }, workspaceId: "ws-1" });
  return { vault, store: createAgentPluginStateStore({ vault, workspaceId: "ws-1" }) };
}

test("describe: lists only this plugin's keys with their revisions, sorted, and never a value", async () => {
  const { store } = storeAndVault();
  const mine = store.forPlugin(SCOPE);
  await mine.set({ key: "resource", value: "secret-looking-value" });
  await mine.set({ key: "products", value: ["tables"] });
  await mine.set({ key: "products", value: ["tables", "files"] });
  // A plugin whose id shares the prefix text must not leak into this plugin's summary.
  await store.forPlugin({ workspaceId: "ws-1", pluginId: "acme-office-extra" }).set({ key: "other", value: 1 });

  const summary = await store.describe(SCOPE);
  assert.deepEqual(summary, { keys: [{ key: "products", revision: 2 }, { key: "resource", revision: 1 }] });
  assert.equal(JSON.stringify(summary).includes("secret-looking-value"), false);
});

test("describe: a plugin with no saved settings has an empty summary", async () => {
  const { store } = storeAndVault();
  assert.deepEqual(await store.describe(SCOPE), { keys: [] });
});

test("describe: a foreign workspace or malformed plugin id is refused before the vault is read", async () => {
  const { vault, store } = storeAndVault();
  let listed = 0;
  const list = vault.list.bind(vault);
  vault.list = (async (...args: Parameters<typeof list>) => { listed += 1; return list(...args); }) as typeof vault.list;
  await assert.rejects(store.describe({ workspaceId: "ws-2", pluginId: "acme-office" }), { message: PLUGIN_STATE_UNAVAILABLE_MESSAGE });
  await assert.rejects(store.describe({ workspaceId: "ws-1", pluginId: "Acme_Office" }), { message: PLUGIN_STATE_UNAVAILABLE_MESSAGE });
  assert.equal(listed, 0);
});

test("get: a malformed setting key is refused before the vault is read", async () => {
  const { store } = storeAndVault();
  await assert.rejects(store.readerFor(SCOPE).get({ key: "../escape" }), { message: /A plugin setting key must be 1-128 letters/ });
});
