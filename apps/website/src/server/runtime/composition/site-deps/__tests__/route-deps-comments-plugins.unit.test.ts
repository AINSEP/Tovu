import assert from "node:assert/strict";
import test from "node:test";
import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteSettingsRepo } from "#src/features/settings/repo.sqlite";
import { routeDepsPluginsSiteApp } from "../route-deps-comments-plugins.js";

/**
 * @file The closures `routeDepsPluginsSiteApp` hands the routes: `onPluginEnabled` (runtime first,
 * then the provider-plugin re-apply for the same id), `chartProviderSnapshot` (the site's chart
 * provider over the real settings ledger plus the runtime's admitted browser providers), and the
 * nullary late-bound readers `resolveStorefrontProducts` / `resolveActiveThemeId`, which must read
 * `routeDeps()` at CALL time. Only the plugin runtime, provider plugins and route deps are faked.
 */

type Required = Parameters<typeof routeDepsPluginsSiteApp>[0];
type Deps = Record<string, unknown>;

function rig() {
  const calls: string[] = [];
  const kernel = contentKernel({ store: openContentDb(":memory:") });
  let current: Deps = {};
  const pluginRuntime = {
    onPluginEnabled: async (id: string) => { calls.push(`runtime:${id}`); },
    browserProviders: () => ({ generation: 3, providers: [] }),
  };
  const deps = routeDepsPluginsSiteApp({
    resolvedSiteBinding: { name: "Bakery", dir: "/nonexistent/bakery" },
    workspaceId: "site-7",
    pluginRuntime,
    settingsRepo: new SqliteSettingsRepo({ store: kernel }),
    commentsCapability: { providers: {} },
    providerPlugins: { reapply: async (input: { pluginId: string }) => { calls.push(`reapply:${input.pluginId}`); } },
    routeDeps: () => current,
  } as unknown as Required);
  return { deps, calls, setRouteDeps: (next: Deps) => { current = next; } };
}

test("onPluginEnabled enables in the plugin runtime, then re-applies provider plugins for that id", async () => {
  const { deps, calls } = rig();
  await deps.onPluginEnabled?.("plugin.word-count");
  assert.deepEqual(calls, ["runtime:plugin.word-count", "reapply:plugin.word-count"]);
});

test("chartProviderSnapshot falls back to the Recharts provider with the runtime's generation", async () => {
  const { deps } = rig();
  assert.deepEqual(await deps.chartProviderSnapshot?.(), {
    generation: JSON.stringify([3, "plugin.recharts", []]),
    siteProvider: "plugin.recharts",
    providers: [],
  });
});

test("resolveStorefrontProducts lists through the commerce catalog read at call time, bound to it", async () => {
  const { deps, setRouteDeps } = rig();
  assert.deepEqual(await deps.resolveStorefrontProducts?.(), [], "no catalog yet: no products");
  const catalog = {
    products: [{ id: "prod-1" }],
    async listProducts(this: { products: unknown[] }, required: unknown) { return required && typeof required === "object" ? this.products : []; },
  };
  setRouteDeps({ commerceCatalog: catalog });
  assert.deepEqual(await deps.resolveStorefrontProducts?.(), [{ id: "prod-1" }]);
});

test("resolveActiveThemeId reads the presentation repo of the route deps current at call time", async () => {
  const { deps, setRouteDeps } = rig();
  const lookups: unknown[] = [];
  setRouteDeps({ workspaceId: "site-7", presentationRepo: { findByWorkspaceId: async (input: unknown) => { lookups.push(input); return null; } } });
  assert.equal(await deps.resolveActiveThemeId?.(), "", "no presentation row: no active theme");
  setRouteDeps({ workspaceId: "site-8", presentationRepo: { findByWorkspaceId: async (input: unknown) => { lookups.push(input); return { workspaceId: "site-8", activeThemeId: "theme-dawn" }; } } });
  assert.equal(await deps.resolveActiveThemeId?.(), "theme-dawn");
  assert.deepEqual(lookups, [{ workspaceId: "site-7" }, { workspaceId: "site-8" }]);
});
