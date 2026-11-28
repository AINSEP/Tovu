import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mock, test } from "node:test";
import { readOutboxTraceParent } from "../../../../../contracts/core/events/outbox-trace-parent.js";
import { TELEMETRY_TEST_ERROR_MESSAGE } from "../../../../../features/observability/test-error-message.js";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { contentKernel } from "#src/platform/db/content-kernel";
import { closeSqliteConnection } from "#src/platform/db/kernel/drivers/sqlite";

/**
 * @file The ports `routeDepsSiteThemesTelemetry` and `routeDepsProviderAnalytics` build for `RouteDeps`: each
 * forwards to the injected provider plugins, kernel, plugin runtime or credential repo with the exact input, and
 * the backup sources take the media folder and product version from where the site actually serves them.
 * Boundary constructors (mail feedback route, change-set repo, analytics providers, product root) are recorders.
 */

const captured: Record<string, unknown> = {};
const capture = (name: string) => (input: unknown, options?: unknown) => { captured[name] = { input, options }; return { built: name }; };
const credentialCalls: unknown[][] = [];
let productRoot = "";

const productRootModule = await import("../../../../../platform/site-dir/product-root.js");
mock.module(new URL("../../../../../platform/site-dir/product-root.js", import.meta.url).href, { namedExports: { ...productRootModule, resolveProductRoot: () => productRoot } });
const mailSql = await import("@jini-ai/platform/mail/sql");
mock.module("@jini-ai/platform/mail/sql", { namedExports: { ...mailSql, createSiteMailFeedbackRoute: capture("mailFeedbackRoute") } });
mock.module(new URL("../../../../../features/agent-plugins/mail-adapter-registry.js", import.meta.url).href, { namedExports: { loadMailAdapterRegistry: async (input: unknown, options: unknown) => ({ registry: [input, options] }) } });
const credentials = await import("../../../../../features/custom-credentials/index.js");
mock.module(new URL("../../../../../features/custom-credentials/index.js", import.meta.url).href, { namedExports: { ...credentials,
  listCustomCredentials: async (deps: unknown, input: unknown) => { credentialCalls.push(["list", deps, input]); return [{ label: "plugin:mail-x" }]; },
  resolveCustomCredentialByLabel: async (deps: unknown, input: unknown) => { credentialCalls.push(["resolve", deps, input]); return { id: "cred-1" }; } } });
mock.module(new URL("../../../../../platform/db/sqlite/change-set-repo.sqlite.js", import.meta.url).href, { namedExports: { SqliteChangeSetRepo: class { constructor(input: unknown, options: unknown) { captured.changeSets = { input, options }; } } } });
mock.module(new URL("../../analytics-providers.js", import.meta.url).href, { namedExports: { buildAnalyticsProviders: capture("analyticsProviders") } });

const { routeDepsSiteThemesTelemetry, routeDepsProviderAnalytics } = await import("../route-deps-site-providers.js");
type Themes = Parameters<typeof routeDepsSiteThemesTelemetry>[0];
type Analytics = Parameters<typeof routeDepsProviderAnalytics>[0];
const TRACEPARENT = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
const capturedInput = (name: string) => (captured[name] as { input: Record<string, unknown> }).input;

function providerPlugins(calls: unknown[][]) {
  const record = (name: string) => async (input: unknown) => { calls.push([name, input]); return `${name}-done`; };
  return { dispose: record("dispose"), reapply: record("reapply"), appliesAt: record("appliesAt"), sendTelemetryTest: record("sendTelemetryTest") };
}

function themesTelemetry(t: test.TestContext, { mediaIsRemoteByEnv, observability, version }: { mediaIsRemoteByEnv: boolean; observability: Record<string, unknown>; version?: string }) {
  const env = { stock: process.env.TOVU_STOCK_THEMES_DIR, plugins: process.env.TOVU_PLUGINS_DIR };
  process.env.TOVU_STOCK_THEMES_DIR = "/stock-themes";
  delete process.env.TOVU_PLUGINS_DIR;
  t.after(() => { for (const [key, value] of [["TOVU_STOCK_THEMES_DIR", env.stock], ["TOVU_PLUGINS_DIR", env.plugins]] as const) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  productRoot = fs.mkdtempSync(path.join(os.tmpdir(), "product-"));
  t.after(() => fs.rmSync(productRoot, { recursive: true, force: true }));
  if (version !== undefined) fs.writeFileSync(path.join(productRoot, "package.json"), version);
  const calls: unknown[][] = [];
  const loadPluginContributions = async () => [];
  const deps = routeDepsSiteThemesTelemetry({
    dbPath: "/site/content.db", resolvedSiteBinding: { dir: "/site", name: "Site" }, agentPluginLayout: { layout: 1 }, agentPluginLifecycle: { loadPluginContributions },
    federatedMcpPresetRegistry: {}, skillLayout: { root: "/site/skills" }, resolvedThemesDir: "/site/themes",
    kernel: { transaction: async (work: unknown) => { calls.push(["transaction", work]); return "tx"; } },
    resolvedUploadsDir: "/site/uploads", isMediaRemote: async () => true, mediaIsRemoteByEnv, workspaceId: "ws-3",
    clock: {}, idGen: {}, pluginRuntime: { discoverActivePlugins: async () => [{ id: "plugin-a" }] },
    siteTitlePreservationStore: {}, siteDisplayName: {}, siteTimeZone: {}, menuRepo: {}, outbox: {}, bus: {}, trashRepo: {},
    siteAssistantSecretSealer: { sealer: 1 }, providerConfigSource: {}, customCredentialSetRepo: { repo: 1 }, providerPlugins: providerPlugins(calls),
    aiTraceSink: {}, observability, tracker: {}, postRepo: {}, siteThemes: {},
  } as unknown as Themes);
  return { deps, calls, loadPluginContributions };
}

test("the mail feedback route loads this workspace's mail adapters through the agent plugins and resolves secrets with the site sealer", async t => {
  const { loadPluginContributions } = themesTelemetry(t, { mediaIsRemoteByEnv: false, observability: {} });
  const route = capturedInput("mailFeedbackRoute");
  assert.deepEqual(await (route.loadAdapters as () => Promise<unknown>)(), { registry: [{ workspaceId: "ws-3" }, { loadContributions: loadPluginContributions }] });
  assert.deepEqual([route.workspaceId, route.credentials], ["ws-3", { repo: { repo: 1 }, sealer: { sealer: 1 } }]);
  credentialCalls.length = 0;
  const resolveByLabel = route.resolveByLabel as (deps: unknown, input: unknown) => Promise<unknown>;
  assert.deepEqual(await resolveByLabel({ deps: "d" }, { label: "mail-webhook:x" }), { id: "cred-1" });
  assert.deepEqual(credentialCalls, [["resolve", { deps: "d" }, { label: "mail-webhook:x" }]]);
});

test("change sets stamp the active trace parent on their co-persisted events, and none when observability has no reader", t => {
  const event = { id: "evt-1", type: "post.updated", payload: {} };
  const prepare = () => (captured.changeSets as { options: { prepareOutboxEvent: (input: { event: unknown }) => Parameters<typeof readOutboxTraceParent>[0]["event"] } }).options.prepareOutboxEvent({ event });
  themesTelemetry(t, { mediaIsRemoteByEnv: false, observability: { activeTraceparent: () => TRACEPARENT } });
  assert.equal(readOutboxTraceParent({ event: prepare() }), TRACEPARENT);
  themesTelemetry(t, { mediaIsRemoteByEnv: false, observability: {} });
  assert.deepEqual(prepare(), event);
});

test("revert transaction, telemetry flush and test, and provider reapply forward to the kernel and the provider plugins", async t => {
  const { deps, calls } = themesTelemetry(t, { mediaIsRemoteByEnv: false, observability: {} });
  const work = async () => "work";
  assert.equal(await deps.revertTransaction({ work }), "tx");
  assert.equal(await deps.flushTelemetry(), "dispose-done");
  assert.equal(await deps.sendTelemetryTest(), "sendTelemetryTest-done");
  assert.equal(await deps.reapplyProvider({ pluginId: "p-2" } as unknown as Parameters<typeof deps.reapplyProvider>[0]), "reapply-done");
  const [transaction, dispose, telemetryTest, reapply] = calls;
  assert.deepEqual([transaction, dispose, reapply], [["transaction", work], ["dispose", {}], ["reapply", { pluginId: "p-2" }]]);
  const { error } = telemetryTest[1] as { error: Error };
  assert.deepEqual([telemetryTest[0], error instanceof Error, error.message], ["sendTelemetryTest", true, TELEMETRY_TEST_ERROR_MESSAGE]);
});

test("backup sources list the local uploads folder, the active site plugins and the product version", async t => {
  const { deps } = themesTelemetry(t, { mediaIsRemoteByEnv: false, observability: {}, version: JSON.stringify({ version: "4.5.6" }) });
  const sources = deps.siteBackupSources;
  assert.deepEqual([sources.siteDir, sources.mediaUploadsDir, sources.themesDir, sources.skillsDir, sources.tovuVersion], ["/site", "/site/uploads", "/site/themes", "/site/skills", "4.5.6"]);
  assert.deepEqual(await sources.sitePlugins?.(), { installDir: path.join("/site", "plugins"), records: [{ id: "plugin-a" }] });
  assert.equal(deps.packageThemesDir, "/stock-themes");
});

test("backup sources name no media folder when media lives in object storage by environment", t => {
  const { deps } = themesTelemetry(t, { mediaIsRemoteByEnv: true, observability: {}, version: JSON.stringify({ version: "4.5.6" }) });
  assert.equal(deps.siteBackupSources.mediaUploadsDir, null);
});

test("the backup's product version is \"unknown\" when package.json has no string version or cannot be read", t => {
  assert.equal(themesTelemetry(t, { mediaIsRemoteByEnv: false, observability: {}, version: JSON.stringify({ version: 7 }) }).deps.siteBackupSources.tovuVersion, "unknown");
  assert.equal(themesTelemetry(t, { mediaIsRemoteByEnv: false, observability: {} }).deps.siteBackupSources.tovuVersion, "unknown");
});

test("provider analytics: applies-at forwards to provider plugins, legacy keys are found by label, analytics credentials resolve with the site sealer", async t => {
  const db = openContentDb(":memory:");
  t.after(() => closeSqliteConnection({ source: db }));
  const calls: unknown[][] = [];
  credentialCalls.length = 0;
  const repo = { repo: 2 };
  const sealer = { sealer: 2 };
  const deps = routeDepsProviderAnalytics({
    agentPluginLifecycle: { loadPluginContributions: async () => [] }, kernel: contentKernel({ store: db }), workspaceId: "ws-8", publishTrustRevocations: {}, clock: {}, idGen: {},
    settingsRepo: {}, siteAssistantSecretSealer: sealer, customCredentialSetRepo: repo, providerPlugins: providerPlugins(calls), projectKeys: {}, observability: {},
  } as unknown as Analytics);
  assert.equal(await deps.providerAppliesAt({ pluginId: "p-3" } as unknown as Parameters<typeof deps.providerAppliesAt>[0]), "appliesAt-done");
  assert.deepEqual(calls, [["appliesAt", { pluginId: "p-3" }]]);
  assert.deepEqual([await deps.legacyProviderCredential({ pluginId: "mail-x" }), await deps.legacyProviderCredential({ pluginId: "other" })], [true, false]);
  const findCredential = capturedInput("analyticsProviders").findCredential as (input: unknown) => Promise<unknown>;
  assert.deepEqual(await findCredential({ workspaceId: "ws-8", label: "vendor" }), { id: "cred-1" });
  assert.deepEqual(credentialCalls, [["list", { repo }, { workspaceId: "ws-8" }], ["list", { repo }, { workspaceId: "ws-8" }], ["resolve", { repo, sealer }, { workspaceId: "ws-8", label: "vendor" }]]);
});
