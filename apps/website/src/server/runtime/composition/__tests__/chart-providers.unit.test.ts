import assert from "node:assert/strict";
import test from "node:test";

import { InMemorySettingsRepo, set } from "@jini-ai/core/settings";
import { ensureChartProviderSetting } from "#src/features/settings/chart-provider";
import { chartProviderAssetUrl, readAdminChartProviderSnapshot } from "../chart-providers.js";

/** The admin chart-provider projection: asset addresses are workspace-scoped and path-free, the
 * stylesheet is optional, and the site preference is: a stored setting, else the host-injected
 * default, else the core table. */

const provider = (overrides: { stylesheet?: string } = {}) => ({
  pluginId: "acme/charts",
  version: "1.0.0",
  declaration: { id: "acme.charts", kinds: ["bar"], javascript: "dist/chart.js", ...overrides },
  assets: [
    { path: "dist/chart.js", digest: "sha-js" },
    { path: "dist/nested/chart.css", digest: "sha-css" },
  ],
}) as never;

test("asset URLs carry plugin, version, digest and file name only — each segment encoded", () => {
  assert.equal(
    chartProviderAssetUrl({ workspaceId: "ws 1", provider: provider(), asset: { path: "dist/deep/a b.js", digest: "d" } as never }),
    "/api/admin/v1/workspaces/ws%201/chart-providers/assets/acme%2Fcharts/1.0.0/d/a%20b.js",
  );
});

test("snapshot projects admitted providers with an optional stylesheet and the default site provider", async () => {
  const snapshot = await readAdminChartProviderSnapshot({
    workspaceId: "ws",
    settingsRepo: new InMemorySettingsRepo(),
    browserProviders: () => ({ generation: 3, providers: [provider(), provider({ stylesheet: "dist/nested/chart.css" })] }),
    defaultProvider: "plugin.recharts",
  });
  const base = "/api/admin/v1/workspaces/ws/chart-providers/assets/acme%2Fcharts/1.0.0";
  const providers = [
    { id: "acme.charts", kinds: ["bar"], javascript: `${base}/sha-js/chart.js` },
    { id: "acme.charts", kinds: ["bar"], javascript: `${base}/sha-js/chart.js`, stylesheet: `${base}/sha-css/chart.css` },
  ];
  assert.deepEqual(snapshot, { siteProvider: "plugin.recharts", providers, generation: JSON.stringify([3, "plugin.recharts", providers]) });
});

/** The real registrar (whose definition carries its own default) plus an optional stored value. */
async function chartSettings({ stored }: { stored?: string } = {}) {
  let nextId = 0;
  const settingsRepo = new InMemorySettingsRepo();
  const deps = { settingsRepo, clock: { nowMs: () => 0 }, ids: { newId: () => `chart-setting-${++nextId}` },
    principals: { findActiveById: async ({ id }: { id: string }) => ({ id }) } };
  await ensureChartProviderSetting({ deps, systemPrincipalId: "boot" });
  if (stored !== undefined) await set({ deps: { ...deps, repo: settingsRepo, authorize: async () => ({ allowed: true, reason: "fixture" }) }, input: {
    namespace: "core.charts", key: "provider", scope: "workspace", workspaceId: "ws", value: stored, callerPrincipalId: "owner", authWorkspaceId: "ws",
  } });
  return settingsRepo;
}

const siteProviderOf = async ({ settingsRepo, defaultProvider }: { settingsRepo: InMemorySettingsRepo; defaultProvider: string | undefined }) =>
  (await readAdminChartProviderSnapshot({ workspaceId: "ws", settingsRepo, browserProviders: () => ({ generation: 1, providers: [] }), defaultProvider })).siteProvider;

test("the host-injected default is the site provider when nothing is stored, even over the definition's own default", async () => {
  assert.equal(await siteProviderOf({ settingsRepo: await chartSettings(), defaultProvider: "plugin.injected" }), "plugin.injected");
});

test("a stored workspace setting wins over the injected default", async () => {
  assert.equal(await siteProviderOf({ settingsRepo: await chartSettings({ stored: "plugin.echarts" }), defaultProvider: "plugin.recharts" }), "plugin.echarts");
});

test("no stored setting and no injected default is the core table, never a vendor name", async () => {
  assert.equal(await siteProviderOf({ settingsRepo: await chartSettings(), defaultProvider: undefined }), "core.table");
  assert.equal(await siteProviderOf({ settingsRepo: new InMemorySettingsRepo(), defaultProvider: undefined }), "core.table");
});

test("the generation changes when the injected default changes, so the admin refetches", async () => {
  const settingsRepo = await chartSettings();
  const read = (defaultProvider: string | undefined) => readAdminChartProviderSnapshot({ workspaceId: "ws", settingsRepo, browserProviders: () => ({ generation: 1, providers: [] }), defaultProvider });
  assert.notEqual((await read("plugin.a")).generation, (await read("plugin.b")).generation);
});
