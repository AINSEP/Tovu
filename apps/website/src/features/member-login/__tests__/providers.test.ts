import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createPluginContributionLoader } from "@jini-ai/agent-plugins/lifecycle";
import { loadBundledLoginProviders, loadLoginProviders, parseLoginProviders } from "../providers.js";
import { provider } from "./fixtures.js";

const sourceRoot = fileURLToPath(new URL("../../../../../../content/agent-plugins/", import.meta.url));
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
