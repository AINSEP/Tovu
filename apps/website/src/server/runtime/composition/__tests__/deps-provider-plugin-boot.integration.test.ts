import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { installSitePlugin, previewSitePluginInstall } from "@jini-ai/plugins/host/node";
import { InMemoryPluginActivationRepo } from "@jini-ai/plugins/host";
import { isNoopObservabilityPort } from "#src/platform/observability/index";
import { pluginHostBinding } from "#src/features/plugin-runtime/host-binding";
import { sqlitePluginActivationRepoFor } from "#src/features/plugin-runtime/repo.sqlite";
import { openProjectStore, projectIdFor } from "#src/server/runtime/composition/project-store";
import { createSiteRouteDeps, siteIdentityFor } from "#src/server/runtime/composition/deps";

/**
 * @file Codex wave-2 HIGH #1: a configured provider plugin must really boot through the REAL composition
 * root (`deps.ts`), not fall back to its noop. The provider boot runs before `const routeDeps` exists,
 * and the plugin SDK's construction asks for the plugin host — a lookup that used to read `routeDeps`
 * in its temporal dead zone (ReferenceError → noop). Here a fake provider plugin (no vendor) is
 * installed on disk in the site's plugin directory, enabled in content.db, and its declared settings saved
 * through the real settings port (sealed in the site vault); the second boot must hand its port (not the
 * noop) to RouteDeps, and its factory must have received the saved values.
 */

const PLUGIN_ID = "obs-boot-fake";
const ENTRY = `
const noop = { end() {} };
export default { definition: { setup(sdk) {
  sdk.providers.register({ contract: "observability", id: "boot_fake", contractVersion: 1, factory(required) {
    globalThis.__providerBootFake = required.endpoint + "|" + required.token + "|" + required.serviceName;
    globalThis.__providerBootAttribution = required.attribution;
    const port = { trackRequest: () => noop, trackDbQuery: () => noop, trackOutboundCall: () => noop, trackAgentRun: () => noop,
      trackOperation: () => noop, reportError() {}, bootFake: true };
    return { port, dispose() { globalThis.__providerBootFake = "disposed"; } };
  } });
} } };
`;

async function installFakeProvider({ siteDir }: { siteDir: string }): Promise<string> {
  const sourceDir = path.join(siteDir, "..", `fake-source-${path.basename(siteDir)}`);
  fs.mkdirSync(path.join(sourceDir, "server"), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "server/index.mjs"), ENTRY);
  const manifest = { id: PLUGIN_ID, name: "Boot fake", version: "1.0.0", sdkRange: "*", engine: 1, tier: "tier-3",
    extensions: { tovu: { id: `test/${PLUGIN_ID}` } }, capabilities: ["providers.register"],
    contributes: { providers: [{ contract: "observability", id: "boot_fake", contractVersion: 1,
      settings: [{ name: "endpoint", label: "Endpoint", required: true }, { name: "token", label: "Token", secret: true }] }] }, hooks: [], fields: [],
    integrity: { "server/index.mjs": `sha256-${createHash("sha256").update(ENTRY).digest("hex")}` } };
  fs.writeFileSync(path.join(sourceDir, "tovu.plugin.json"), JSON.stringify(manifest));
  const deps = { ...pluginHostBinding, installDir: path.join(siteDir, "plugins"), builtInIds: [], repo: new InMemoryPluginActivationRepo(), conflicts: async () => [] };
  const preview = await previewSitePluginInstall({ sourceDir, deps });
  await installSitePlugin({ sourceDir, expectedDigest: preview.digest, deps });
  return manifest.version;
}

test("installed + enabled + configured provider plugin boots through the real composition root (no TDZ fallback to noop)", async (t) => {
  // Secret settings are sealed with the site key; this test supplies one (never a real key).
  const previousKey = process.env.TOVU_SITE_KEY;
  process.env.TOVU_SITE_KEY = "ab".repeat(32);
  t.after(() => { if (previousKey === undefined) delete process.env.TOVU_SITE_KEY; else process.env.TOVU_SITE_KEY = previousKey; });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-provider-boot-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const siteDir = path.join(root, "site");
  fs.mkdirSync(siteDir);
  const dbPath = path.join(siteDir, "content.db");
  const version = await installFakeProvider({ siteDir });

  let closeFirst = async () => {};
  const siteBinding = { dir: siteDir, name: "site", dirOverridden: true, switcherCompatible: false };
  const first = await createSiteRouteDeps(dbPath, { siteBinding, onStoreOpened: (store) => { closeFirst = () => store.close(); } });
  await first.identityReady;
  await sqlitePluginActivationRepoFor({ store: first.contentKernel! }).save({ workspaceId: first.workspaceId, pluginId: PLUGIN_ID, version, enabled: true, updatedAt: "2026-10-26" });
  // The retired-key check runs over the real credential listing (nothing saved the old way here).
  assert.equal(await first.legacyProviderCredential!({ pluginId: PLUGIN_ID }), false);
  // Saved through the same port the admin settings card writes: sealed rows in this site's vault.
  await first.providerConfig!.write({ pluginId: PLUGIN_ID, config: { settings: { endpoint: "https://collector.example.test" }, secrets: { token: "sealed-token" } } });
  assert.deepEqual(await first.providerConfig!.readSettings({ pluginId: PLUGIN_ID }), { settings: { endpoint: "https://collector.example.test" }, secretNames: ["token"] });
  await first.pluginRuntimeReady;
  await closeFirst();

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args.join(" ")); };
  let closeSecond = async () => {};
  try {
    const deps = await createSiteRouteDeps(dbPath, { siteBinding, onStoreOpened: (store) => { closeSecond = () => store.close(); } });
    await deps.identityReady;
    assert.deepEqual(warnings.filter((line) => line.includes("provider")), []);
    assert.equal(isNoopObservabilityPort(deps.observability), false);
    assert.equal((globalThis as { __providerBootFake?: string }).__providerBootFake, "https://collector.example.test|sealed-token|tovu");
    await deps.pluginRuntimeReady;
  } finally {
    console.warn = originalWarn;
    await closeSecond();
  }
  assert.equal((globalThis as { __providerBootFake?: string }).__providerBootFake, "disposed");
});

test("two sites of one project: settings saved from site A land in project.db and configure site B's provider", async (t) => {
  const previousKey = process.env.TOVU_SITE_KEY;
  process.env.TOVU_SITE_KEY = "cd".repeat(32);
  t.after(() => { if (previousKey === undefined) delete process.env.TOVU_SITE_KEY; else process.env.TOVU_SITE_KEY = previousKey; });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-provider-project-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sitesHome = path.join(root, "Tovu");
  // Both apps resolve the same sites root, so both open ~/.tovu/projects/<projectId>/project.db.
  const projectStore = () => openProjectStore({ sitesHome, home: path.join(root, "home") });
  const boot = async (name: string, { install = true }: { install?: boolean } = {}) => {
    const siteDir = path.join(sitesHome, name);
    fs.mkdirSync(siteDir, { recursive: true });
    // Each site's own id (init-site mints a randomUUID); both sites share the starter workspace id.
    if (!fs.existsSync(path.join(siteDir, ".site-meta.json"))) fs.writeFileSync(path.join(siteDir, ".site-meta.json"), JSON.stringify({ siteId: `uuid-of-${name}` }));
    const version = install ? await installFakeProvider({ siteDir }) : "1.0.0";
    let close = async () => {};
    const deps = await createSiteRouteDeps(path.join(siteDir, "content.db"), { openProjectStore: projectStore,
      siteBinding: { dir: siteDir, name, dirOverridden: true, switcherCompatible: false }, onStoreOpened: (store) => { close = () => store.close(); } });
    await deps.identityReady;
    return { deps, version, close: () => close() };
  };
  const a = await boot("site-a");
  await a.deps.providerConfig!.write({ pluginId: PLUGIN_ID, config: { settings: { endpoint: "https://project-collector.example.test" }, secrets: {} } });
  await a.close();
  const b1 = await boot("site-b");
  assert.equal(isNoopObservabilityPort(b1.deps.observability), true, "site B has not enabled the plugin yet");
  await sqlitePluginActivationRepoFor({ store: b1.deps.contentKernel! }).save({ workspaceId: b1.deps.workspaceId, pluginId: PLUGIN_ID, version: b1.version, enabled: true, updatedAt: "2026-10-26" });
  await b1.deps.pluginRuntimeReady;
  await b1.close();
  const b2 = await boot("site-b", { install: false });
  try {
    assert.equal(isNoopObservabilityPort(b2.deps.observability), false);
    assert.match(String((globalThis as { __providerBootFake?: string }).__providerBootFake), /^https:\/\/project-collector\.example\.test\|/);
    // Site attribution reaches the provider factory: which site, which project, which environment.
    assert.deepEqual((globalThis as { __providerBootAttribution?: unknown }).__providerBootAttribution, { attributes: {
      "tovu.site.id": "uuid-of-site-b", "tovu.site.slug": "site-b", "deployment.environment": "local", "tovu.project.id": projectIdFor({ sitesHome }) } });
    await b2.deps.pluginRuntimeReady;
  } finally { await b2.close(); }
});

test("siteIdentityFor: Fly (production) is its own project; desktop is detected from the Electron child env; else local", () => {
  const base = { workspaceId: "ws-1", binding: { name: "blog", dir: path.join(os.tmpdir(), "tovu-no-such-site-dir") } };
  assert.deepEqual(siteIdentityFor({ ...base, runtimeMode: "production", projectId: undefined }, { env: {} }), { siteId: "ws-1", siteSlug: "blog", environment: "fly", projectId: "ws-1" });
  assert.deepEqual(siteIdentityFor({ ...base, runtimeMode: "local", projectId: "project-x" }, { env: { ELECTRON_RUN_AS_NODE: "1" } }), { siteId: "ws-1", siteSlug: "blog", environment: "desktop", projectId: "project-x" });
  assert.equal(siteIdentityFor({ ...base, runtimeMode: "local", projectId: "project-x" }).environment, process.env.ELECTRON_RUN_AS_NODE === "1" ? "desktop" : "local");
});

test("siteIdentityFor: each site is named by its own .site-meta.json siteId, not the shared starter workspace id", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-site-identity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const siteWith = (name: string, meta: unknown) => {
    const dir = path.join(root, name);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, ".site-meta.json"), typeof meta === "string" ? meta : JSON.stringify(meta));
    return { name, dir };
  };
  // Every starter-template site seeds the same workspace id; two sites must still be told apart.
  const shared = { workspaceId: "workspace-local", runtimeMode: "local" as const, projectId: "project-x" };
  const a = siteIdentityFor({ ...shared, binding: siteWith("a", { siteId: "site-uuid-a", siteKeyId: "key-a" }) }, { env: {} });
  const b = siteIdentityFor({ ...shared, binding: siteWith("b", { siteId: "site-uuid-b" }) }, { env: {} });
  assert.equal(a.siteId, "site-uuid-a");
  assert.equal(b.siteId, "site-uuid-b");
  // A first-boot meta holds only the minted siteKeyId; it becomes the siteId once completed, so it names the site now.
  assert.equal(siteIdentityFor({ ...shared, binding: siteWith("c", { siteKeyId: "key-c" }) }, { env: {} }).siteId, "key-c");
  // Missing or unreadable meta: the workspace id is the last resort.
  assert.equal(siteIdentityFor({ ...shared, binding: siteWith("d", "{not json") }, { env: {} }).siteId, "workspace-local");
  // Fly has no project store: the project is the site itself, by its siteId (never the shared workspace id).
  const fly = siteIdentityFor({ ...shared, runtimeMode: "production", projectId: undefined, binding: siteWith("e", { siteId: "site-uuid-e" }) }, { env: {} });
  assert.deepEqual(fly, { siteId: "site-uuid-e", siteSlug: "e", environment: "fly", projectId: "site-uuid-e" });
});
