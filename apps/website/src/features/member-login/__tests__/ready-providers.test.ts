import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createPluginContributionLoader } from "@jini-ai/agent-plugins/lifecycle";
import { InMemoryCustomCredentialSetRepo } from "../../custom-credentials/repo.memory.js";
import { createCustomCredential } from "../../custom-credentials/store.js";
import { loadBundledLoginProviders } from "../providers.js";
import { createReadyLoginProviderList } from "../ready-providers.js";
import { cryptoFixture } from "./fixtures.js";

/**
 * @file The shared "which login buttons are ready" list (L7 Stryker: 0 %, no test ran it). A provider
 * is listed only when it is the bundled, unchanged preset AND this workspace holds its client card
 * bound to the provider's own token URL; it is re-read on every call (never cached).
 */

const sourceRoot = fileURLToPath(new URL("../../../../../../content/agent-plugins/", import.meta.url));

async function fixture(options: { installedPluginId?: string } = {}) {
  const [google] = (await loadBundledLoginProviders({ sourceRoot })).filter(pin => pin.id === "google");
  assert.ok(google, "the google-login bundled preset must exist");
  let sequence = 0;
  const credentials = { ...cryptoFixture(), repo: new InMemoryCustomCredentialSetRepo(), idGen: { newId: () => `credential-${++sequence}` } };
  const loadContributions = createPluginContributionLoader({
    findPackages: async () => [{ trusted: { pluginId: options.installedPluginId ?? "google-login", packageRoot: "/unused" } }],
    readFile: async () => JSON.stringify({ schemaVersion: 1, providers: [google] }),
    importModule: async () => { throw new Error("data contributions must never execute plugin code"); },
  }).loadPluginContributions;
  const list = createReadyLoginProviderList({ sourceRoot, loadContributions, credentials });
  const save = (workspaceId: string, baseUrl = google.tokenEndpoint) => createCustomCredential(credentials,
    { workspaceId, label: google.credentialLabel, category: "general", baseUrl, connection: { token: "client-secret", username: "client-id" } });
  return { google, list, save };
}

test("an admitted provider without a client card is not ready; saving one makes it ready on the next call", async () => {
  const f = await fixture();
  assert.deepEqual(await f.list({ workspaceId: "ws" }), []);
  await f.save("ws");
  assert.deepEqual((await f.list({ workspaceId: "ws" })).map(provider => provider.id), ["google"]);
});

test("a client card in another workspace does not make this workspace's provider ready", async () => {
  const f = await fixture();
  await f.save("other-ws");
  assert.deepEqual(await f.list({ workspaceId: "ws" }), []);
});

test("a client card bound to a foreign token URL is not ready", async () => {
  const f = await fixture();
  await f.save("ws", "https://attacker.example/token");
  assert.deepEqual(await f.list({ workspaceId: "ws" }), []);
});

test("a configured card cannot ready a provider shipped by a non-bundled plugin", async () => {
  const f = await fixture({ installedPluginId: "rogue" });
  await f.save("ws");
  assert.deepEqual(await f.list({ workspaceId: "ws" }), []);
});
