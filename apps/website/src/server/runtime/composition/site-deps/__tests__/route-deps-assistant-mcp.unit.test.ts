import assert from "node:assert/strict";
import { basename, dirname } from "node:path";
import test, { mock } from "node:test";
import { createFormCollectionRegistry } from "@jini-ai/cms/forms";
import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { publicPageSecurityHeaders } from "#src/features/theme/public-page-security-headers";
import { SITE_TEMP_PREFIXES } from "#src/platform/temp/site-temp-roots";
import { assistantVaultContext } from "#src/assistant/assistant-vault";

/** The settings chokepoint `set` and the connect-defaults factory are recorders (see the `set` / applyAccess tests below). */
const settingsWrites: Array<{ required: unknown; optional: Record<string, unknown> }> = [];
const settingsIndex = await import("#src/features/settings/index");
mock.module("#src/features/settings/index", { namedExports: { ...settingsIndex,
  set: (required: unknown, optional: Record<string, unknown>) => { settingsWrites.push({ required, optional }); return Promise.resolve({ value: "written", revisionSeq: 9 }); },
} });
const connectDefaults: Array<{ applyAccess: (input: unknown) => unknown }> = [];
const applyConnect = await import("#src/features/agent-plugins/apply-connect-defaults");
mock.module("#src/features/agent-plugins/apply-connect-defaults", { namedExports: { ...applyConnect,
  createApplyConnectDefaults: (required: (typeof connectDefaults)[number]) => { connectDefaults.push(required); return async () => undefined; },
} });
const { routeDepsAssistantSettings, routeDepsExecutionPlugins, routeDepsExternalMcpOAuth } = await import("../route-deps-assistant-mcp.js");

/**
 * @file The late-bound closures of the assistant/MCP route-deps slices: the agent-plugin preference
 * writer (must go through `routeDeps().set` read at call time, not the module-level settings `set`),
 * the public page security headers (built from the form collection providers read per call), and
 * the plugin export hosts (this workspace's declared hosts from the composed export runtime), the
 * `set` options (preview-switcher policy over the installed themes and active theme, the public
 * assistant credential gate), the chat transfer snapshot and the OAuth connect defaults' applyAccess.
 */

function kernelWithWorkspace() {
  const db = openContentDb(":memory:");
  db.$client.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)").run("site-7", "site-7", "site-7", "2031-01-01T00:00:00.000Z");
  return contentKernel({ store: db });
}

test("preferences.saveAuto writes through the route deps' own set, read at call time", async () => {
  const writes: Array<{ input: unknown; optional: unknown; via: string }> = [];
  let via = "early";
  const deps = routeDepsAssistantSettings({
    agentPluginLayout: { forWorkspace: () => ({ root: "/roots/site-7" }) },
    kernel: kernelWithWorkspace(),
    workspaceId: "site-7",
    clock: { nowMs: () => Date.parse("2031-02-03T04:05:06.000Z"), nowIso: () => "2031-02-03T04:05:06.000Z" },
    idGen: { newId: () => "id-1" },
    identity: { authorize: async () => ({ allowed: true }) },
    settingsPrincipals: {},
    assistantSettingsReady: new Promise(() => {}),
    routeDeps: () => ({ set: async (required: { input: unknown }, optional: unknown) => { writes.push({ input: required.input, optional, via }); } }),
  } as unknown as Parameters<typeof routeDepsAssistantSettings>[0]);
  via = "late";
  await deps.preferences?.saveAuto({ workspaceId: "site-7", principalId: "owner-1", expectedRevisionSeq: 4 });
  assert.deepEqual(writes, [{
    via: "late",
    optional: { expectedRevisionSeq: 4 },
    input: { namespace: "core.interface", key: "chatAgentPlugins", value: "auto", scope: "user", workspaceId: "site-7",
      principalId: "owner-1", callerPrincipalId: "owner-1", authWorkspaceId: "site-7" },
  }]);
});

test("publicPageSecurityHeaders reads the form collection providers on every call", () => {
  let reads = 0;
  const declaredHostCalls: unknown[] = [];
  const deps = routeDepsExecutionPlugins({
    kernel: kernelWithWorkspace(),
    workspaceId: "site-7",
    formCollectionProviders: () => { reads += 1; return createFormCollectionRegistry({}); },
    pluginExports: { declaredHosts: (input: unknown) => { declaredHostCalls.push(input); return Promise.resolve({ scripts: ["https://cdn.example.test"] }); } },
  } as unknown as Parameters<typeof routeDepsExecutionPlugins>[0]);
  assert.equal(reads, 0, "providers are not read at composition time");
  const headers = deps.publicPageSecurityHeaders?.();
  assert.deepEqual(headers, publicPageSecurityHeaders({}), "no available provider adds no frame origin");
  deps.publicPageSecurityHeaders?.();
  assert.equal(reads, 2);
  assert.deepEqual(declaredHostCalls, []);
});

test("pluginExportHosts asks the export runtime for this workspace's declared hosts", async () => {
  const declaredHostCalls: unknown[] = [];
  const deps = routeDepsExecutionPlugins({
    kernel: kernelWithWorkspace(),
    workspaceId: "site-7",
    formCollectionProviders: () => createFormCollectionRegistry({}),
    pluginExports: { declaredHosts: (input: unknown) => { declaredHostCalls.push(input); return Promise.resolve({ scripts: ["https://cdn.example.test"] }); } },
  } as unknown as Parameters<typeof routeDepsExecutionPlugins>[0]);
  assert.deepEqual(await deps.pluginExportHosts?.(), { scripts: ["https://cdn.example.test"] });
  assert.deepEqual(declaredHostCalls, [{ workspaceId: "site-7" }]);
});

type SettingsRequired = Parameters<typeof routeDepsAssistantSettings>[0];

/** The assistant settings slice over fakes for the theme roster, presentation and credential repos. */
function assistantSettings(overrides: Partial<Record<keyof SettingsRequired, unknown>>) {
  return routeDepsAssistantSettings({
    agentPluginLayout: { forWorkspace: () => ({ root: "/roots/site-7" }) },
    kernel: kernelWithWorkspace(),
    workspaceId: "site-7",
    clock: { nowMs: () => Date.parse("2031-02-03T04:05:06.000Z"), nowIso: () => "2031-02-03T04:05:06.000Z" },
    idGen: { newId: () => "id-1" },
    identity: { authorize: async () => ({ allowed: true }) },
    settingsPrincipals: {},
    assistantSettingsReady: new Promise(() => {}),
    routeDeps: () => ({}),
    ...overrides,
  } as unknown as SettingsRequired);
}

const theme = (id: string) => ({ manifest: { id, name: id, version: "1.0.0", tier: "static" }, status: "valid" });

test("set keeps the caller's options and binds the preview switcher policy to the installed themes and active theme", async () => {
  const lookups: unknown[] = [];
  const deps = assistantSettings({
    siteThemes: [theme("theme-dawn"), theme("theme-dusk")],
    presentationRepo: { findByWorkspaceId: async (input: unknown) => { lookups.push(input); return { workspaceId: "site-7", activeThemeId: "theme-dawn" }; } },
  });
  settingsWrites.length = 0;
  const required = { input: { namespace: "core.theme", key: "previewSwitcher" } };
  assert.deepEqual(await deps.set?.(required as never, { expectedRevisionSeq: 4 } as never), { value: "written", revisionSeq: 9 });
  const [write] = settingsWrites;
  assert.equal(write?.required, required);
  assert.equal(write?.optional.expectedRevisionSeq, 4);
  const prepare = write?.optional.preparePreviewSwitcherWrite as (write: unknown) => Promise<{ input: Record<string, unknown> }>;
  const authorize = async () => ({ allowed: true });
  const input = { namespace: "core.theme", key: "previewSwitcher", scope: "workspace", workspaceId: "site-7", callerPrincipalId: "owner-1",
    value: { enabled: true, position: "top", themes: [{ themeId: "theme-dawn", label: "Dawn" }, { themeId: "theme-dusk", label: "Dusk" }] } };
  const prepared = await prepare({ input, deps: { authorize } });
  assert.equal(prepared.input.requiredPermissionOverride, "theme.set");
  assert.deepEqual((prepared.input.value as { themes: unknown }).themes, [{ themeId: "theme-dawn", label: "Dawn" }, { themeId: "theme-dusk", label: "Dusk" }]);
  assert.deepEqual(lookups, [{ workspaceId: "site-7" }], "the active theme is read from the presentation repo");
  await assert.rejects(prepare({ input: { ...input, value: { ...input.value, themes: [{ themeId: "theme-dawn", label: "Dawn" }, { themeId: "theme-absent", label: "No" }] } }, deps: { authorize } }), /installed themes/);
  await assert.rejects(prepare({ input: { ...input, value: { ...input.value, themes: [{ themeId: "theme-dusk", label: "Dusk" }, { themeId: "theme-dusk-2", label: "Dusk 2" }] } }, deps: { authorize } }), /including the active theme/);
  await assert.rejects(prepare({ input: { ...input, workspaceId: "site-8" }, deps: { authorize } }), /^Error: Theme preview requires/, "another workspace's write is refused");
});

test("set's public-assistant gate asks the credential repo for the caller's workspace and refuses without a usable key", async () => {
  const credentialLookups: unknown[] = [];
  const repo = { vault: { findOne: async (context: unknown) => { credentialLookups.push(context); return null; } } };
  const deps = assistantSettings({ siteAssistantCredentialRepo: repo, siteAssistantSecretSealer: {} });
  settingsWrites.length = 0;
  await deps.set?.({ input: {} } as never, {} as never);
  const canEnable = settingsWrites[0]?.optional.canEnablePublicAssistant as (required: { workspaceId: string }) => Promise<boolean>;
  assert.equal(await canEnable({ workspaceId: "site-9" }), false);
  assert.deepEqual(credentialLookups, [assistantVaultContext({ workspaceId: "site-9", kind: "site-assistant" })], "one lookup, for the caller's workspace");
});

test("databaseTransferChatSnapshot backs the composed chat store up into a locked site transfer temp root and returns those bytes", async () => {
  const destinations: string[] = [];
  const lockedDuringBackup: boolean[] = [];
  const { writeFile } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  // The owned site temp root holds `<root>.lock` while work runs, so the temp sweeper never removes it mid-backup.
  const chat = { backupTo: async (destPath: string) => { destinations.push(destPath); lockedDuringBackup.push(existsSync(`${dirname(destPath)}.lock`)); await writeFile(destPath, "chat-snapshot-7"); } };
  const deps = assistantSettings({ chat });
  const bytes = await deps.databaseTransferChatSnapshot?.();
  assert.equal(bytes?.toString("utf8"), "chat-snapshot-7");
  assert.equal(destinations.length, 1);
  assert.equal(basename(destinations[0] ?? ""), "chat.db");
  assert.equal(basename(dirname(destinations[0] ?? "")).startsWith(SITE_TEMP_PREFIXES.transferChat), true, `temp root ${destinations[0]}`);
  assert.deepEqual(lockedDuringBackup, [true]);
  assert.equal(existsSync(dirname(destinations[0] ?? "")), false, "the temp root is removed afterwards");
});

test("the OAuth connect defaults apply MCP access through the route deps' mcp read at call time", async () => {
  const applied: unknown[] = [];
  let mcp: unknown = { applyAccess: () => { throw new Error("early mcp"); } };
  connectDefaults.length = 0;
  routeDepsExternalMcpOAuth({
    resolvedSiteBinding: { name: "Bakery", dir: "/nonexistent/bakery" }, agentPluginLayout: { forWorkspace: () => ({ root: "/roots/site-7" }) },
    workspaceId: "site-7", clock: { nowMs: () => 7, nowIso: () => "2031-02-03T04:05:06.000Z" }, identity: { ownerPrincipalId: "owner-1" },
    siteAssistantSecretKeyring: {}, siteAssistantSecretSealer: {}, externalMcpServerRepo: {}, externalMcpOAuthDevices: {}, siteReferenceRepo: {},
    projectSiteId: undefined, projectStore: undefined, externalMcpOAuthHttpPorts: {}, derivedPublicOrigin: undefined,
    agentPluginMcp: { projections: {}, classifyError: () => "unknown" }, routeDeps: () => ({ mcp }),
  } as unknown as Parameters<typeof routeDepsExternalMcpOAuth>[0]);
  assert.equal(connectDefaults.length, 1);
  mcp = { applyAccess: async (input: unknown) => { applied.push(input); return { applied: true }; } };
  assert.deepEqual(await connectDefaults[0]?.applyAccess({ serverId: "mcp-1", access: "all" }), { applied: true });
  assert.deepEqual(applied, [{ serverId: "mcp-1", access: "all" }]);
});
