import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteSettingsRepo } from "#src/features/settings/repo.sqlite";

/** The site app factory and the export engine are recorders (see the createSiteApp / runExportSite tests below). */
const appsCreated: unknown[][] = [];
mock.module(new URL("../../app.js", import.meta.url).href, { namedExports: {
  createApp: (...args: unknown[]) => { appsCreated.push(args); return { app: appsCreated.length }; },
} });
const siteExport = await import("#src/features/site-export/index");
const exports: unknown[] = [];
mock.module("#src/features/site-export/index", { namedExports: { ...siteExport,
  exportSite: (options: unknown) => { exports.push(options); return Promise.resolve({ exported: 3 }); },
} });
const { routeDepsPluginsSiteApp, routeDepsTaxonomyComments } = await import("../route-deps-comments-plugins.js");

/**
 * @file The closures `routeDepsPluginsSiteApp` hands the routes: `onPluginEnabled` (runtime first,
 * then the provider-plugin re-apply for the same id), `chartProviderSnapshot` (the site's chart
 * provider over the real settings ledger plus the runtime's admitted browser providers), and the
 * nullary late-bound readers `resolveStorefrontProducts` / `resolveActiveThemeId`, which must read
 * `routeDeps()` at CALL time, plus `createSiteApp`/`runExportSite` (recorded factories) and the
 * tool-attempt audit sink's failure report. Only the plugin runtime, provider plugins and route deps are faked.
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
  assert.deepEqual(await deps.chartProviderSnapshot?.({}), {
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

test("createSiteApp builds the site app over the route deps current at call time, passing only the options given", () => {
  const { deps, setRouteDeps } = rig();
  const first = { routeDeps: 1 };
  const second = { routeDeps: 2 };
  appsCreated.length = 0;
  setRouteDeps(first);
  assert.deepEqual(deps.createSiteApp?.(), { app: 1 });
  setRouteDeps(second);
  deps.createSiteApp?.({ themeId: "theme-dawn", consentAudit: true });
  deps.createSiteApp?.({ themeId: "" });
  assert.deepEqual(appsCreated, [[first, {}], [second, { themeIdOverride: "theme-dawn", consentAudit: true }], [second, { themeIdOverride: "" }]]);
  assert.equal(appsCreated[0]?.[0], first, "the deps object itself, not a copy");
});

test("runExportSite hands its options to the export engine and returns its result", async () => {
  const { deps } = rig();
  exports.length = 0;
  const options = { outDir: "/exports/bakery", themeId: "theme-dawn" };
  assert.deepEqual(await deps.runExportSite?.(options as never), { exported: 3 });
  assert.deepEqual(exports, [options]);
  assert.equal(exports[0], options);
});

test("a tool-attempt audit write that fails is reported as a tool_audit error and records no tool-use event", async () => {
  const db = openContentDb(":memory:");
  const kernel = contentKernel({ store: db });
  const reports: unknown[] = [];
  const captured: unknown[] = [];
  const deps = routeDepsTaxonomyComments({
    kernel, workspaceId: "site-7", clock: { nowMs: () => 7, nowIso: () => "2031-02-03T04:05:06.000Z" }, idGen: { newId: () => "id-1" },
    reportToolAuditError: (input: unknown) => { reports.push(input); },
    identity: {}, trash: {}, databaseLedgerRepo: {}, migrationRunsRepo: {}, restorePointsRepo: {}, dbOps: {}, databaseIntrospection: {},
    entryRepo: {}, sqliteEntryTermRepo: {}, taxonomyRepo: {}, termRepo: {}, taxonomyRevisionRepo: {}, stampWatermark: {},
    contentTypeRepo: {}, contentTypeIndexProvisioner: {}, commentsModule: {}, commentsCapability: {}, observability: undefined,
    tracker: { capture: (event: unknown) => { captured.push(event); } },
  } as unknown as Parameters<typeof routeDepsTaxonomyComments>[0]);
  db.$client.close();
  await deps.toolAttemptAuditSink?.append({ attemptId: "att-1", executionId: null, workspaceId: "site-7", runId: "run-1", toolId: "content.list", principalId: "owner-1", phase: "started", at: "2031-02-03T04:05:06.000Z" });
  assert.equal(reports.length, 1);
  const [report] = reports as Array<{ code: string; diagnostic: unknown }>;
  assert.equal(report?.code, "tool_audit");
  const diagnostic = report?.diagnostic as Error;
  assert.deepEqual({ name: diagnostic.name, message: diagnostic.message }, { name: "TypeError", message: "The database connection is not open" }, "the write's own error is the diagnostic");
  assert.deepEqual(captured, []);
});
