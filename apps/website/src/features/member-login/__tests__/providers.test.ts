import path from "node:path";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import test from "node:test";
import { createPluginContributionLoader } from "@jini-ai/agent-plugins/lifecycle";
import { loadBundledLoginProviders, loadLoginProviders, parseLoginProviders } from "../providers.js";
import { provider } from "./fixtures.js";
import { agentPluginSourceDir } from "../../../../../../development/test-support/agent-plugin-source.mjs";

// google-login ships as `@jini-ai/agent-plugins/google-login` (D-W5): read bundled pins from the folder holding it.
const sourceRoot = path.dirname(agentPluginSourceDir({ pluginId: "google-login" }));
const file = (value = provider) => JSON.stringify({ schemaVersion: 1, providers: [value] });

function installed(raw: string, pluginId = "google-login") {
  return createPluginContributionLoader({
    findPackages: async input => {
      assert.equal(input.requireActive, true, "login data must explicitly require activation");
      return [{ trusted: { pluginId, packageRoot: "/unused" } }];
    },
    readFile: async () => raw,
    importModule: async () => { throw new Error("data contributions must never execute plugin code"); },
  }).loadPluginContributions;
}

test("bundled preset admits the active, unchanged installed contribution", async () => {
  const pins = await loadBundledLoginProviders({ sourceRoot });
  const google = pins.find(pin => pin.id === "google");
  assert.ok(google);
  const loaded = await loadLoginProviders({ workspaceId: "ws", bundledProviders: pins, loadContributions: installed(file(google)) });
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].issuer, "https://accounts.google.com");
});
test("a non-bundled plugin is ignored even if it copies the shipped provider", async () => {
  const pins = await loadBundledLoginProviders({ sourceRoot });
  assert.deepEqual(await loadLoginProviders({ workspaceId: "ws", bundledProviders: pins,
    loadContributions: installed(file(provider), "rogue") }), []);
});
for (const field of ["issuer", "jwksUri", "authorizationEndpoint", "tokenEndpoint"] as const) {
  test(`bundled id cannot replace pinned ${field}`, async () => {
    const pins = await loadBundledLoginProviders({ sourceRoot });
    assert.deepEqual(await loadLoginProviders({ workspaceId: "ws", bundledProviders: pins,
      loadContributions: installed(file({ ...provider, [field]: "https://attacker.example" })) }), []);
  });
}
test("disabled package contributes no provider", async () => {
  const loader = createPluginContributionLoader({ findPackages: async () => [], readFile: async () => file(), importModule: async () => ({ exported: null }) });
  assert.deepEqual(await loadLoginProviders({ workspaceId: "ws", bundledProviders: [provider], loadContributions: loader.loadPluginContributions }), []);
});
test("duplicate provider ids are refused in full", async () => {
  const pins = await loadBundledLoginProviders({ sourceRoot });
  const pin = pins.find(row => row.id === "google")!;
  assert.deepEqual(await loadLoginProviders({ workspaceId: "ws", bundledProviders: pins,
    loadContributions: installed(JSON.stringify({ schemaVersion: 1, providers: [pin, pin] })) }), []);
});
for (const invalid of [{ pkce: "plain" }, { signingAlgorithm: "HS256" }, { clientAuthentication: "none" },
  { scopes: ["openid", "email", "offline_access"] }, { jwksUri: "http://attacker.example" }]) {
  test(`invalid preset rejected: ${Object.keys(invalid)[0]}`, () => {
    assert.equal(parseLoginProviders({ raw: file({ ...provider, ...invalid } as typeof provider) }).ok, false);
  });
}

for (const namespace of ["jini", "tovu"]) {
  test(`bundled login presets retain stable identity through ${namespace} metadata`, async t => {
    const root = await mkdtemp(path.join(tmpdir(), "portable-login-provider-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const pluginRoot = path.join(root, "google-login");
    await mkdir(pluginRoot);
    await writeFile(path.join(pluginRoot, "plugin.json"), JSON.stringify({ extensions: { [namespace]: { id: "tovu/google-login" } } }));
    await writeFile(path.join(pluginRoot, "tovu-login-providers.json"), file());
    const pins = await loadBundledLoginProviders({ sourceRoot: root });
    assert.equal(pins.length, 1);
    assert.equal(pins[0]?.issuer, provider.issuer);
    assert.equal(pins[0]?.pluginId, "google-login");
  });
}

test("portable identity takes precedence over an unrelated legacy login identity", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "portable-login-precedence-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pluginRoot = path.join(root, "google-login");
  await mkdir(pluginRoot);
  await writeFile(path.join(pluginRoot, "plugin.json"), JSON.stringify({ extensions: { jini: { id: "another/google-login" }, tovu: { id: "tovu/google-login" } } }));
  await writeFile(path.join(pluginRoot, "tovu-login-providers.json"), file());
  assert.deepEqual(await loadBundledLoginProviders({ sourceRoot: root }), []);
});
