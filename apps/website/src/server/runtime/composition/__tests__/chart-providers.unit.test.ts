import assert from "node:assert/strict";
import test from "node:test";

import { InMemorySettingsRepo } from "@jini-ai/core/settings";
import { chartProviderAssetUrl, readAdminChartProviderSnapshot } from "../chart-providers.js";

/** The admin chart-provider projection: asset addresses are workspace-scoped and path-free, the
 * stylesheet is optional, and the site preference falls back to the bundled recharts provider. */

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
  });
  const base = "/api/admin/v1/workspaces/ws/chart-providers/assets/acme%2Fcharts/1.0.0";
  const providers = [
    { id: "acme.charts", kinds: ["bar"], javascript: `${base}/sha-js/chart.js` },
    { id: "acme.charts", kinds: ["bar"], javascript: `${base}/sha-js/chart.js`, stylesheet: `${base}/sha-css/chart.css` },
  ];
  assert.deepEqual(snapshot, { siteProvider: "plugin.recharts", providers, generation: JSON.stringify([3, "plugin.recharts", providers]) });
});
