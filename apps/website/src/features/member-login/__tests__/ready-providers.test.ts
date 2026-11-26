import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createPluginContributionLoader } from "@jini-ai/agent-plugins/lifecycle";
import { InMemoryCustomCredentialSetRepo } from "../../custom-credentials/repo.memory.js";
import { createCustomCredential } from "../../custom-credentials/store.js";
import { loadBundledLoginProviders } from "#src/features/member-login/bindings";
import { createTovuReadyLoginProviderList } from "../bindings.js";
import { cryptoFixture } from "./fixtures.js";
import { agentPluginSourceDir } from "../../../../../../development/test-support/agent-plugin-source.mjs";

/**
 * @file The shared "which login buttons are ready" list (L7 Stryker: 0 %, no test ran it). A provider
 * is listed only when it is the bundled, unchanged preset AND this workspace holds its client card
 * bound to the provider's own token URL; it is re-read on every call (never cached).
 */

// google-login ships as `@jini-ai/agent-plugins/google-login` (D-W5): read bundled pins from the folder holding it.
const defaultSourceRoot = path.dirname(agentPluginSourceDir({ pluginId: "google-login" }));

async function fixture(options: { installedPluginId?: string; root?: string } = {}) {
  const sourceRoot = options.root ?? defaultSourceRoot;
  const state = { installedPluginId: options.installedPluginId ?? "google-login" };
  const [google] = (await loadBundledLoginProviders({ sourceRoot })).filter(pin => pin.id === "google");
  assert.ok(google, "the google-login bundled preset must exist");
  let sequence = 0;
  const credentials = { ...cryptoFixture(), repo: new InMemoryCustomCredentialSetRepo(), idGen: { newId: () => `credential-${++sequence}` } };
  const loadContributions = createPluginContributionLoader({
    findPackages: async () => [{ trusted: { pluginId: state.installedPluginId, packageRoot: "/unused" } }],
    readFile: async () => JSON.stringify({ schemaVersion: 1, providers: [google] }),
    importModule: async () => { throw new Error("data contributions must never execute plugin code"); },
  }).loadPluginContributions;
  const list = createTovuReadyLoginProviderList({ sourceRoot, loadContributions, credentials });
  const save = (workspaceId: string, baseUrl = google.tokenEndpoint) => createCustomCredential(credentials,
    { workspaceId, label: google.credentialLabel, category: "general", baseUrl, connection: { token: "client-secret", username: "client-id" } });
  return { google, list, save, state };
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

/** A shipped catalog whose manifest carries the host's bundled namespace, so this witness exercises the
 * re-admission itself instead of the namespace gate that the folder's other tests share. */
async function bundledRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ready-providers-"));
  await cp(agentPluginSourceDir({ pluginId: "google-login" }), path.join(root, "google-login"), { recursive: true });
  const manifestPath = path.join(root, "google-login", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.extensions.jini.id = "tovu/google-login";
  await writeFile(manifestPath, JSON.stringify(manifest));
  return root;
}

test("a second host readiness call re-admits the installed provider", async () => {
  const f = await fixture({ root: await bundledRoot() });
  await f.save("ws");
  assert.deepEqual((await f.list({ workspaceId: "ws" })).map(provider => provider.id), ["google"]);
  // The installed package is replaced by an untrusted one between calls: the next call must refuse it, not replay the first projection.
  f.state.installedPluginId = "rogue";
  assert.deepEqual(await f.list({ workspaceId: "ws" }), []);
});
