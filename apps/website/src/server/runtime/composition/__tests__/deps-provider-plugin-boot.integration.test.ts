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
import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";

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
    const port = { trackRequest: () => noop, trackDbQuery: () => noop, trackOutboundCall: () => noop, trackAgentRun: () => noop,
      trackOperation: () => noop, reportError() {}, bootFake: true };
    return { port, dispose() { globalThis.__providerBootFake = "disposed"; } };
  } });
} } };
`;

async function installFakeProvider({ siteDir }: { siteDir: string }): Promise<string> {
  const sourceDir = path.join(siteDir, "..", "fake-source");
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
