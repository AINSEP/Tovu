import "../../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import { createTracker } from "@jini-ai/diagnostics/observability/node";
import { testSiteLayoutContext } from "#src/__tests__/fixtures/site-layout-context";

// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
import { agentPluginActivations } from "../../../../../../../features/agent-plugins/activation-effects.js";
const { readAgentPluginActivations, setAgentPluginActivation } = agentPluginActivations;
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import { saveExternalMcpServer } from "#src/assistant/index";
import { AgentPluginUpdateError } from "@jini-ai/agent-plugins/lifecycle";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { registerAuthRoutes, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated, createCapturingResponse, extractRouteHandler, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";

import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { resolveAgentPluginRefs } from "../../../../../../../features/agent-plugins/lifecycle.js";
import {
  installAgentPlugin,
  type AgentPluginArchiveEntry,
  type AgentPluginArchiveReaderPort,
} from "../../../../../../../features/agent-plugins/lifecycle.js";
import { forceRemove } from "#src/features/agent-plugins/__tests__/fixtures/force-remove";
import { registerAgentPluginSetEnabledRoute } from "../../set-enabled.js";
import type { AgentPluginsRouteDeps } from "../../deps.js";

/**
 * @file `AGENT_PLUGIN_SET_ENABLED` — `PATCH /api/admin/v1/workspaces/:workspaceId/agent-plugins/:pluginId`
 * (2026-09-09). Same real-install-under-a-temp-`TOVU_AGENT_PLUGINS_DIR` idiom as this folder's
 * `agent-plugins-http.integration.test.ts`, so neither test races another agent's writes to the
 * shared `sites/tovu-com` tree.
 *
 * The load-bearing assertion is the LAST one: a toggle is only worth shipping if the enable/disable
 * decision actually reaches the assistant. That test drives the production
 * `resolveAgentPluginRefs()` gate — the function the real run path calls — across a PATCH, and
 * proves the run's answer flips. A test that only re-read the JSON file would pass just as happily
 * against a toggle that wrote to a file nothing consumes.
 */

const WORKSPACE_A = "workspace-local";

function reader(entries: readonly AgentPluginArchiveEntry[]): AgentPluginArchiveReaderPort {
  return {
    async *entries() {
      yield* entries;
    },
  };
}

function fileEntry(entryPath: string, content: string): AgentPluginArchiveEntry {
  const bytes = Buffer.from(content, "utf8");
  return {
    kind: "file",
    entryPath,
    declaredSize: bytes.byteLength,
    executable: false,
    async *openReadStream() {
      yield bytes;
    },
  };
}

function manifestJson(name: string, fields: { version?: string; description?: string; keywords?: readonly string[]; extensions?: unknown } = {}): string {
  return JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name, ...fields });
}

async function withAgentPluginsDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-set-enabled-test-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    // A successful install freezes its published package root read-only (`install.ts`'s
    // `freezeTree`), so a plain recursive `rm` fails EACCES — see `forceRemove`'s own header.
    await forceRemove(dir);
  }
}

async function installReal(
  pluginId: string,
  archiveSeed: string,
  fields: Parameters<typeof manifestJson>[1] = { version: "1.0.0", description: `The ${pluginId} package.`, keywords: ["demo"] },
) {
  const entries: AgentPluginArchiveEntry[] = [
    fileEntry("plugin.json", manifestJson(pluginId, fields)),
    fileEntry(`skills/${pluginId}/SKILL.md`, `---\nname: ${pluginId}\n---\n# ${pluginId}\nReal skill body.`),
  ];
  const archive = new Uint8Array(Buffer.from(archiveSeed));
  const digest = createHash("sha256").update(archive).digest("hex");
  return installAgentPlugin({
    archive,
    expectedSha256: digest,
    archiveReader: reader(entries),
    layout: resolveAgentPluginLayout(),
    workspaceId: WORKSPACE_A,
  });
}

/** @returns The test app, plus the SAME `baseDeps` the route was wired with — 2026-09-10's MCP
 *  federation tests below read `baseDeps.externalMcpServerRepo` directly to assert on what the
 *  route actually wrote, the same way this file's other tests re-read `readAgentPluginActivations`
 *  rather than trusting the response body alone. */
function buildTestApp(overrides: Partial<Pick<AgentPluginsRouteDeps, "setAgentPluginEnabled" | "tracker">> = {}): { app: express.Express; baseDeps: ReturnType<typeof createRouteDeps> } {
  // ONE `createRouteDeps()` call for both the auth stack and the route's deps — a second call
  // stands up a separate identity/policy store and the owner login would 403 against it. Same
  // reason `agent-plugins-http.integration.test.ts` threads `baseDeps.authorize` through.
  const baseDeps = createRouteDeps();
  const routeDeps: AgentPluginsRouteDeps = testSiteLayoutContext({
    tracker: createNoopTracker({}),
    // Pin the port so failure injection and the request use the same layout object.
    agentPluginLayout: resolveAgentPluginLayout(),
    workspaceId: baseDeps.workspaceId,
    authorize: baseDeps.authorize,
    clock: baseDeps.clock,
    externalMcpServerRepo: baseDeps.externalMcpServerRepo,
    siteAssistantSecretSealer: baseDeps.siteAssistantSecretSealer,
    siteAssistantSecretKeyring: baseDeps.siteAssistantSecretKeyring,
    ...overrides,
  });

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, baseDeps);
  app.use("/api/admin", requireAdminSession(baseDeps));
  registerAgentPluginSetEnabledRoute(app, routeDeps);
  return { app, baseDeps };
}

/** Same shape as {@link installReal}, plus a real `mcp.json` declaring the given servers — for the
 *  2026-09-10 MCP-federation tests below, which need a plugin the route can actually federate. */
async function installRealWithMcp(pluginId: string, archiveSeed: string, mcpServers: Record<string, unknown>) {
  const entries: AgentPluginArchiveEntry[] = [
    fileEntry("plugin.json", manifestJson(pluginId, { version: "1.0.0", description: `The ${pluginId} package.` })),
    fileEntry(
      "mcp.json",
      JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", mcpServers }),
    ),
  ];
  const archive = new Uint8Array(Buffer.from(archiveSeed));
  const digest = createHash("sha256").update(archive).digest("hex");
  return installAgentPlugin({
    archive,
    expectedSha256: digest,
    archiveReader: reader(entries),
    layout: resolveAgentPluginLayout(),
    workspaceId: WORKSPACE_A,
  });
}

function patch(baseUrl: string, cookie: string, pluginId: string, body: unknown) {
  return fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_A}/agent-plugins/${encodeURIComponent(pluginId)}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("AGENT_PLUGIN_SET_ENABLED: enabling writes a real activation record and returns the updated row", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("site-compliance", "seed-set-enabled-a", { version: "1.0.0", extensions: { tovu: { id: "tovu/site-compliance", provides: ["outbound-mail"], displayName: "Example Mail", summary: "Send site mail." } } });
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "site-compliance", enabled: false, actor: "test" });

    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp().app, t);
    const response = await patch(baseUrl, cookie, "site-compliance", { enabled: true });

    assert.equal(response.status, 200);
    const body = (await response.json()) as { agentPlugin: { pluginId: string; id: string; provides: string[]; displayName: string; summary: string; enabled: boolean; version: string | null; skills: Array<{ name: string }> } };
    assert.equal(body.agentPlugin.pluginId, "site-compliance");
    assert.equal(body.agentPlugin.id, "tovu/site-compliance");
    assert.deepEqual(body.agentPlugin.provides, ["outbound-mail"]);
    assert.equal(body.agentPlugin.displayName, "Example Mail");
    assert.equal(body.agentPlugin.summary, "Send site mail.");
    assert.equal(body.agentPlugin.enabled, true, "the response reports the state just written, not the pre-write state");
    assert.equal(body.agentPlugin.version, "1.0.0", "the row is the same shape AGENT_PLUGINS_LIST returns, so the client can replace in place");
    assert.ok(body.agentPlugin.skills.some((skill) => skill.name === "site-compliance"));

    const persisted = await readAgentPluginActivations({ workspaceRoot: workspaceRoot });
    assert.equal(persisted.plugins["site-compliance"]?.enabled, true, "the decision survives on disk");
  });
});

test("AGENT_PLUGIN_SET_ENABLED: enabling captures one agent_plugin_enabled product event with the plugin id only; disabling captures none", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("site-compliance", "seed-set-enabled-events");
    const events: unknown[] = [];
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp({ tracker: createTracker({ productAnalytics: { capture: (event) => { events.push(event); }, identify: () => {} } }) }).app, t);
    assert.equal((await patch(baseUrl, cookie, "site-compliance", { enabled: false })).status, 200);
    assert.equal((await patch(baseUrl, cookie, "site-compliance", { enabled: true })).status, 200);
    assert.equal(events.length, 1);
    assert.deepEqual((events[0] as { name: string; properties: unknown }).properties, { pluginId: "site-compliance" });
    assert.equal((events[0] as { name: string }).name, "agent_plugin_enabled");
  });
});

test("AGENT_PLUGIN_SET_ENABLED: omitted version and description are returned as explicit nulls", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("minimal-metadata", "seed-minimal-metadata", {});
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp().app, t);
    const response = await patch(baseUrl, cookie, "minimal-metadata", { enabled: false });

    assert.equal(response.status, 200);
    const { agentPlugin } = await response.json();
    assert.equal(agentPlugin.pluginId, "minimal-metadata");
    assert.equal(agentPlugin.version, null);
    assert.equal(agentPlugin.description, null);
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    assert.equal((await readAgentPluginActivations({ workspaceRoot })).plugins["minimal-metadata"]?.enabled, false);
  });
});

test("AGENT_PLUGIN_SET_ENABLED: an uninstalled plugin is 404 even when the activation service is unavailable", async (t) => {
  await withAgentPluginsDir(async () => {
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    const before = await readAgentPluginActivations({ workspaceRoot });
    const { app } = buildTestApp({
      setAgentPluginEnabled: async () => { throw new Error("activation service unavailable"); },
    });
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const response = await patch(baseUrl, cookie, "never-installed", { enabled: false });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: "agent plugin 'never-installed' is not installed in this workspace",
      code: "AGENT_PLUGIN_NOT_FOUND",
    });
    assert.deepEqual(await readAgentPluginActivations({ workspaceRoot }), before);
  });
});

test("AGENT_PLUGIN_SET_ENABLED: a corrupt activations file is 409 AGENT_PLUGIN_ACTIVATIONS_UNREADABLE — nothing is written, no host path leaks", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("site-compliance", "seed-set-enabled-corrupt");
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    const activationsPath = path.join(workspaceRoot, "activations.json");
    await writeFile(activationsPath, "{ not json", "utf8");

    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp().app, t);
    const response = await patch(baseUrl, cookie, "site-compliance", { enabled: false });

    assert.equal(response.status, 409);
    const body = (await response.json()) as { error: string; code: string };
    assert.equal(body.code, "AGENT_PLUGIN_ACTIVATIONS_UNREADABLE");
    assert.equal(
      body.error,
      "This workspace's Agent Plugin activation record (activations.json) could not be read, so nothing was changed. " +
        "No Agent Plugin can be enabled or disabled until it is repaired — the server log names the file and the fault.",
    );
    assert.equal(JSON.stringify(body).includes(workspaceRoot), false, "the 409 body must carry no host path");

    assert.equal(await readFile(activationsPath, "utf8"), "{ not json", "a refused write must leave the corrupt file exactly as it was");
  });
});

test("AGENT_PLUGIN_SET_ENABLED: the toggle actually gates an assistant run — resolveAgentPluginRefs flips across a PATCH", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("site-compliance", "seed-set-enabled-b");
    const workspaceLayout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A);
    await setAgentPluginActivation({ workspaceRoot: workspaceLayout.root, pluginId: "site-compliance", enabled: false, actor: "test" });

    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp().app, t);

    const beforeEnable = await resolveAgentPluginRefs(["site-compliance"], workspaceLayout);
    assert.equal(beforeEnable.ok, false, "a disabled plugin refuses the run before the toggle");
    assert.match(
      beforeEnable.ok ? "" : beforeEnable.reason,
      /is installed in this workspace but is not enabled/,
      "and refuses it with the enable-it remedy, not an install-it one",
    );

    assert.equal((await patch(baseUrl, cookie, "site-compliance", { enabled: true })).status, 200);

    const afterEnable = await resolveAgentPluginRefs(["site-compliance"], workspaceLayout);
    assert.equal(afterEnable.ok, true, "the same run resolves once the operator enables the plugin");
    assert.match(afterEnable.ok ? afterEnable.promptPrefix : "", /Real skill body/, "and the SKILL.md body really is injected into the run prompt");

    assert.equal((await patch(baseUrl, cookie, "site-compliance", { enabled: false })).status, 200);
    assert.equal((await resolveAgentPluginRefs(["site-compliance"], workspaceLayout)).ok, false, "disabling refuses the run again");
  });
});

test("AGENT_PLUGIN_SET_ENABLED: a toggle preserves the package's `origin` provenance", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("site-compliance", "seed-set-enabled-c");
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "site-compliance", enabled: false, actor: "system:seed" }, { origin: "bundled" });

    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp().app, t);
    assert.equal((await patch(baseUrl, cookie, "site-compliance", { enabled: true })).status, 200);

    const persisted = await readAgentPluginActivations({ workspaceRoot: workspaceRoot });
    assert.equal(persisted.plugins["site-compliance"]?.origin, "bundled", "a bundled plugin does not become operator-installed by being toggled");
    assert.notEqual(persisted.plugins["site-compliance"]?.updatedBy, "system:seed", "the toggling operator, not the seeder, is recorded as the actor");
  });
});

test("AGENT_PLUGIN_SET_ENABLED: an id that is not installed in this workspace is 404, and writes nothing", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("site-compliance", "seed-set-enabled-d");
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;

    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp().app, t);
    const response = await patch(baseUrl, cookie, "never-installed", { enabled: true });

    assert.equal(response.status, 404);
    assert.equal(((await response.json()) as { code?: string }).code, "AGENT_PLUGIN_NOT_FOUND");

    const persisted = await readAgentPluginActivations({ workspaceRoot: workspaceRoot });
    assert.equal(persisted.plugins["never-installed"], undefined, "no activation record is minted for a plugin that does not exist");
  });
});

test("AGENT_PLUGIN_SET_ENABLED: a non-boolean `enabled` is 400 VALIDATION_ERROR, not a silent disable", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("site-compliance", "seed-set-enabled-e");
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "site-compliance", enabled: true, actor: "test" });

    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp().app, t);

    for (const body of [{}, { enabled: "false" }, { enabled: 0 }]) {
      const response = await patch(baseUrl, cookie, "site-compliance", body);
      assert.equal(response.status, 400, `body ${JSON.stringify(body)} is rejected`);
      assert.equal(((await response.json()) as { code?: string }).code, "VALIDATION_ERROR");
    }

    const persisted = await readAgentPluginActivations({ workspaceRoot: workspaceRoot });
    assert.equal(persisted.plugins["site-compliance"]?.enabled, true, "an enabled plugin was NOT silently disabled by a malformed body");
  });
});

test("AGENT_PLUGIN_SET_ENABLED: requires an authenticated session", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("site-compliance", "seed-set-enabled-f");
    const { baseUrl } = await bootAuthenticated(buildTestApp().app, t);

    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_A}/agent-plugins/site-compliance`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(response.status, 401);
  });
});

test("AGENT_PLUGIN_SET_ENABLED: enabling a plugin with a declared remote MCP server federates it into the external-MCP store", async (t) => {
  await withAgentPluginsDir(async () => {
    await installRealWithMcp("higgsfield-fixture", "seed-set-enabled-mcp-a", {
      higgsfield: { type: "streamable-http", url: "https://mcp.higgsfield.ai/mcp", tovuAuthMode: "oauth" },
    });
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "higgsfield-fixture", enabled: false, actor: "test" });

    const { app, baseDeps } = buildTestApp();
    const { baseUrl, cookie } = await bootAuthenticated(app, t);

    assert.equal((await patch(baseUrl, cookie, "higgsfield-fixture", { enabled: true })).status, 200);

    const rows = await baseDeps.externalMcpServerRepo.listByWorkspaceId(WORKSPACE_A);
    const federated = rows.find((row) => row.label?.startsWith("higgsfield-fixture"));
    assert.ok(federated, "activating the plugin must have created a federated row for its remote server — no hand-typed URL required");
    assert.equal(federated?.transport, "streamable_http");
    assert.equal(federated?.url, "https://mcp.higgsfield.ai/mcp");
    assert.equal(federated?.authMode, "oauth");
    // Rule 2 (`federate-mcp.ts`'s header): a newly provisioned row is never auto-enabled. An operator
    // must explicitly turn it on in Settings — the same reason `recordBundledAgentPluginIfAbsent`
    // seeds bundled plugins disabled.
    assert.equal(federated?.enabled, false, "a freshly provisioned row must start disabled, not auto-enabled by the plugin toggle");
    assert.equal(federated?.provisionedByPluginId, "higgsfield-fixture");
  });
});

test("AGENT_PLUGIN_SET_ENABLED: disabling a plugin never touches its already-federated MCP row", async (t) => {
  await withAgentPluginsDir(async () => {
    await installRealWithMcp("higgsfield-fixture", "seed-set-enabled-mcp-b", {
      higgsfield: { type: "streamable-http", url: "https://mcp.higgsfield.ai/mcp", tovuAuthMode: "oauth" },
    });
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "higgsfield-fixture", enabled: false, actor: "test" });

    const { app, baseDeps } = buildTestApp();
    const { baseUrl, cookie } = await bootAuthenticated(app, t);

    assert.equal((await patch(baseUrl, cookie, "higgsfield-fixture", { enabled: true })).status, 200);
    const rowsBeforeDisable = await baseDeps.externalMcpServerRepo.listByWorkspaceId(WORKSPACE_A);
    const rowBeforeDisable = rowsBeforeDisable.find((row) => row.label?.startsWith("higgsfield-fixture"));
    assert.ok(rowBeforeDisable, "the row must exist after enabling, before this test's own disable");

    assert.equal((await patch(baseUrl, cookie, "higgsfield-fixture", { enabled: false })).status, 200);

    // `set-enabled.ts`'s own header states disabling calls no federation code at all — this asserts
    // that directly, rather than merely re-checking `enabled`, which would stay green even if a
    // future change resurrected a disable-time write that happened to also leave enabled=false.
    const rowsAfterDisable = await baseDeps.externalMcpServerRepo.listByWorkspaceId(WORKSPACE_A);
    const rowAfterDisable = rowsAfterDisable.find((row) => row.label?.startsWith("higgsfield-fixture"));
    assert.ok(rowAfterDisable, "the row must still exist — disabling a plugin never deletes its federated row");
    assert.deepEqual(rowAfterDisable, rowBeforeDisable, "disabling must leave the row byte-identical, not merely still present");
  });
});

test("AGENT_PLUGIN_SET_ENABLED: a plugin declaring only a stdio MCP server federates nothing", async (t) => {
  await withAgentPluginsDir(async () => {
    await installRealWithMcp("stdio-fixture", "seed-set-enabled-mcp-c", {
      local: { type: "stdio", command: "./server/index.js" },
    });
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "stdio-fixture", enabled: false, actor: "test" });

    const { app, baseDeps } = buildTestApp();
    const { baseUrl, cookie } = await bootAuthenticated(app, t);

    assert.equal((await patch(baseUrl, cookie, "stdio-fixture", { enabled: true })).status, 200);

    const rows = await baseDeps.externalMcpServerRepo.listByWorkspaceId(WORKSPACE_A);
    assert.equal(
      rows.some((row) => row.label?.startsWith("stdio-fixture")),
      false,
      "a stdio server must never be auto-wired from a plugin activation",
    );
  });
});

test("AGENT_PLUGIN_SET_ENABLED: enabling adopts an operator's pre-existing row at the same server id rather than clobbering it", async (t) => {
  await withAgentPluginsDir(async () => {
    await installRealWithMcp("higgsfield-fixture", "seed-set-enabled-mcp-d", {
      higgsfield: { type: "streamable-http", url: "https://mcp.higgsfield.ai/mcp", tovuAuthMode: "oauth" },
    });
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "higgsfield-fixture", enabled: false, actor: "test" });

    const { app, baseDeps } = buildTestApp();

    // The operator hand-configured this connection BEFORE the plugin's own auto-provisioning ever
    // ran — the same real store the route itself writes through, with the allowlist and write-grant
    // shape `federate-mcp.ts`'s header names as exactly what adoption must protect.
    await saveExternalMcpServer(
      {
        repo: baseDeps.externalMcpServerRepo,
        sealer: baseDeps.siteAssistantSecretSealer,
        keyring: baseDeps.siteAssistantSecretKeyring,
        clock: baseDeps.clock,
      },
      {
        workspaceId: WORKSPACE_A,
        serverId: "higgsfield",
        label: "My Own Higgsfield Connection",
        transport: "streamable_http",
        authMode: "static_env",
        enabled: true,
        command: "",
        url: "https://operator-configured.example.com/mcp",
        args: "",
        allowedToolNames: "generate_image",
        writeAllowedToolNames: "generate_image",
        accessToken: "fixture-operator-access-token",
        principalId: "operator-1",
      },
    );

    const before = await baseDeps.externalMcpServerRepo.findByServerId({ workspaceId: WORKSPACE_A, serverId: "higgsfield" });
    assert.ok(before?.sealedOAuth, "the operator's credential must be sealed before adoption");

    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    assert.equal((await patch(baseUrl, cookie, "higgsfield-fixture", { enabled: true })).status, 200);

    const rows = await baseDeps.externalMcpServerRepo.listByWorkspaceId(WORKSPACE_A);
    const row = rows.find((r) => r.serverId === "higgsfield");
    assert.ok(row, "the operator's row must still exist");
    assert.equal(row?.url, "https://operator-configured.example.com/mcp", "the plugin's own declared URL must never override the operator's");
    assert.equal(row?.enabled, true, "an operator-enabled row must not be forced back to disabled");
    assert.deepEqual(JSON.parse(row?.allowedToolNames ?? "[]"), ["generate_image"]);
    assert.deepEqual(JSON.parse(row?.writeAllowedToolNames ?? "[]"), ["generate_image"]);
    assert.equal(row?.provisionedByPluginId, "higgsfield-fixture", "the association is recorded even though the row itself was untouched");
    assert.deepEqual({ ...row, provisionedByPluginId: before.provisionedByPluginId }, before);
  });
});

test("AGENT_PLUGIN_SET_ENABLED: a workspace id that does not match the route's own workspace is 404", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("site-compliance", "seed-set-enabled-g");
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp().app, t);

    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/agent-plugins/site-compliance`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(response.status, 404);
  });
});

test("AGENT_PLUGIN_SET_ENABLED: a signed-in principal without enable permission changes neither activation nor MCP records", async (t) => {
  await withAgentPluginsDir(async () => {
    await installRealWithMcp("enable-denied-fixture", "seed-enable-denied", { remote: { type: "streamable-http", url: "https://mcp.example.com/mcp" } });
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "enable-denied-fixture", enabled: false, actor: "test" });
    const { app, baseDeps } = buildTestApp();
    const { baseUrl } = await bootAuthenticated(app, t);
    const cookie = await loginAsBarePrincipal(baseDeps, baseUrl);
    const before = await readAgentPluginActivations({ workspaceRoot: workspaceRoot });
    const mcpBefore = await baseDeps.externalMcpServerRepo.listByWorkspaceId(WORKSPACE_A);
    const res = await patch(baseUrl, cookie, "enable-denied-fixture", { enabled: true });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, "FORBIDDEN");
    assert.equal(body.details.permission, "admin.plugins.enable");
    assert.deepEqual(await readAgentPluginActivations({ workspaceRoot: workspaceRoot }), before);
    assert.deepEqual(await baseDeps.externalMcpServerRepo.listByWorkspaceId(WORKSPACE_A), mcpBefore);
  });
});

test("AGENT_PLUGIN_SET_ENABLED: an MCP-store failure preserves the successful activation without a partial MCP row", async (t) => {
  await withAgentPluginsDir(async () => {
    await installRealWithMcp("mcp-failure-fixture", "seed-mcp-failure", { remote: { type: "streamable-http", url: "https://mcp.example.com/mcp" } });
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "mcp-failure-fixture", enabled: false, actor: "test" });
    const { app, baseDeps } = buildTestApp();
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const before = await baseDeps.externalMcpServerRepo.listByWorkspaceId(WORKSPACE_A);
    let attempts = 0;
    t.mock.method(baseDeps.externalMcpServerRepo, "findByServerId", async () => { attempts += 1; throw new Error("MCP store unavailable"); });
    const res = await patch(baseUrl, cookie, "mcp-failure-fixture", { enabled: true });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).agentPlugin.enabled, true);
    assert.equal(attempts, 1, "the declared server must reach the failing provisioning boundary");
    assert.equal((await readAgentPluginActivations({ workspaceRoot: workspaceRoot })).plugins["mcp-failure-fixture"]?.enabled, true);
    assert.deepEqual(await baseDeps.externalMcpServerRepo.listByWorkspaceId(WORKSPACE_A), before);
  });
});


for (const failure of [new Error("private activation failure"), "private activation failure"]) {
  test(`AGENT_PLUGIN_SET_ENABLED: unexpected lifecycle failure is redacted (${typeof failure})`, async (t) => {
    await withAgentPluginsDir(async () => {
      await installReal("site-compliance", "seed-route-failure");
      let writes = 0;
      const { app } = buildTestApp({ setAgentPluginEnabled: async () => { writes++; throw failure; } });
      const { baseUrl, cookie } = await bootAuthenticated(app, t);
      const response = await patch(baseUrl, cookie, "site-compliance", { enabled: false });
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: "internal error", code: "INTERNAL_ERROR" });
      assert.equal(writes, 1);
    });
  });
}


test("AGENT_PLUGIN_SET_ENABLED: a package removed after discovery is still a 404", async (t) => {
  await withAgentPluginsDir(async () => {
    const { AgentPluginNotInstalledError } = await import("#src/features/agent-plugins/set-enabled");
    await installReal("site-compliance", "seed-disappearing-plugin");
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    const before = await readAgentPluginActivations({ workspaceRoot });
    const { app } = buildTestApp({ setAgentPluginEnabled: async ({ pluginId }) => { throw new AgentPluginNotInstalledError({ pluginId }); } });
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const response = await patch(baseUrl, cookie, "site-compliance", { enabled: false });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "agent plugin 'site-compliance' is not installed in this workspace", code: "AGENT_PLUGIN_NOT_FOUND" });
    assert.deepEqual(await readAgentPluginActivations({ workspaceRoot }), before);
  });
});

for (const failure of [new Error("layout unavailable"), "layout unavailable"]) {
  test(`AGENT_PLUGIN_SET_ENABLED: post-activation discovery failure preserves the successful toggle (${typeof failure})`, async (t) => {
    await withAgentPluginsDir(async () => {
      const { setAgentPluginEnabled } = await import("#src/features/agent-plugins/set-enabled");
      // A qualified identity avoids unrelated legacy-manifest warnings during discovery.
      await installReal("site-compliance", "seed-discovery-failure", { extensions: { tovu: { id: "test/site-compliance" } } });
      const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
      const warnings = t.mock.method(console, "warn", () => {});
      const { app } = buildTestApp({ setAgentPluginEnabled: async (input) => {
        const written = await setAgentPluginEnabled(input);
        t.mock.method(input.agentPluginLayout, "forWorkspace", () => { throw failure; });
        return written;
      } });
      const { baseUrl, cookie } = await bootAuthenticated(app, t);
      const response = await patch(baseUrl, cookie, "site-compliance", { enabled: true });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).agentPlugin.enabled, true);
      assert.equal((await readAgentPluginActivations({ workspaceRoot })).plugins["site-compliance"]?.enabled, true);
      assert.deepEqual(warnings.mock.calls.map(call => call.arguments), [["[agent-plugins] 'site-compliance': MCP provisioning could not run — layout unavailable"]]);
    });
  });
}

test("AGENT_PLUGIN_SET_ENABLED: enabling a plugin this host cannot run is 409 PLUGIN_HOST_INCOMPATIBLE and writes nothing", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("future-only", "seed-host-incompatible", { version: "1.0.0", extensions: { tovu: { hostRange: ">=99" } } });
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "future-only", enabled: false, actor: "test" });

    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp().app, t);
    const response = await patch(baseUrl, cookie, "future-only", { enabled: true });

    assert.equal(response.status, 409);
    const body = (await response.json()) as { code: string; error: string };
    assert.equal(body.code, "PLUGIN_HOST_INCOMPATIBLE");
    assert.equal(body.error.includes(workspaceRoot), false, "no host path leaks");
    assert.equal((await readAgentPluginActivations({ workspaceRoot })).plugins["future-only"]?.enabled, false);
  });
});

test("AGENT_PLUGIN_SET_ENABLED: a requirement no enabled plugin provides still enables, with a warning", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("needs-xy", "seed-missing-requires", { version: "1.0.0", extensions: { tovu: { requires: ["x:y"] } } });
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "needs-xy", enabled: false, actor: "test" });

    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp().app, t);
    const response = await patch(baseUrl, cookie, "needs-xy", { enabled: true });

    assert.equal(response.status, 200);
    const body = (await response.json()) as { warnings: string[]; agentPlugin: { enabled: boolean; hostOk: boolean; missingRequires: string[] } };
    assert.deepEqual(body.warnings, ["Needs x:y"]);
    assert.equal(body.agentPlugin.enabled, true);
    assert.equal(body.agentPlugin.hostOk, true);
    assert.deepEqual(body.agentPlugin.missingRequires, ["x:y"]);
    assert.equal((await readAgentPluginActivations({ workspaceRoot })).plugins["needs-xy"]?.enabled, true);
  });
});

test("AGENT_PLUGIN_SET_ENABLED: disabling a provider another enabled plugin needs warns, and still disables", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("mailer", "seed-provider", { version: "1.0.0", extensions: { tovu: { provides: ["mail:send"] } } });
    await installReal("consumer", "seed-consumer", { version: "1.0.0", extensions: { tovu: { requires: ["mail:send"] } } });
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;

    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp().app, t);
    const response = await patch(baseUrl, cookie, "mailer", { enabled: false });

    assert.equal(response.status, 200);
    const body = (await response.json()) as { warnings: string[]; agentPlugin: { enabled: boolean; requiredBy: string[] } };
    assert.deepEqual(body.warnings, ["consumer needs mail:send"]);
    assert.deepEqual(body.agentPlugin.requiredBy, ["consumer needs mail:send"]);
    assert.equal(body.agentPlugin.enabled, false);
    assert.equal((await readAgentPluginActivations({ workspaceRoot })).plugins.mailer?.enabled, false);
  });
});

test("AGENT_PLUGIN_SET_ENABLED: a plain toggle carries no warnings", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("plain", "seed-plain");
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp().app, t);
    const response = await patch(baseUrl, cookie, "plain", { enabled: true });
    assert.equal(response.status, 200);
    assert.deepEqual(((await response.json()) as { warnings: string[] }).warnings, []);
  });
});

test("AGENT_PLUGIN_SET_ENABLED: an interrupted update waiting for boot recovery is 409 PLUGIN_UPDATE_PENDING, not a 500", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("pending-plugin", "seed-update-pending");
    const pending = new AgentPluginUpdateError({ code: "PLUGIN_UPDATE_PENDING", message: "Restart the host to recover the interrupted update." });
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp({ setAgentPluginEnabled: async () => { throw pending; } }).app, t);
    const response = await patch(baseUrl, cookie, "pending-plugin", { enabled: false });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { code: "PLUGIN_UPDATE_PENDING", error: "Restart the host to recover the interrupted update." });
  });
});

/**
 * `String(req.params.workspaceId ?? "")` / `String(req.params.pluginId ?? "")` (extractRouteHandler's own
 * doc, `helpers/http-test-server.ts`): Express guarantees a matched `:param` is always populated, so the
 * right side of every `??` below is unreachable through any real HTTP request. Restored 2026-09-03 after
 * being wrongly deleted as "unreachable dead code" -- the repo's established answer is to KEEP the guard
 * and exercise it with a hand-built `req` that deliberately violates that contract.
 */
const SET_ENABLED_ROUTE = "/api/admin/v1/workspaces/:workspaceId/agent-plugins/:pluginId";

test("AGENT_PLUGIN_SET_ENABLED: `req.params.workspaceId ?? \"\"` fallback, forced via a direct handler call, is the workspace 404", async () => {
  const { app } = buildTestApp();
  const handler = extractRouteHandler(app, "patch", SET_ENABLED_ROUTE);
  const { res, capture } = createCapturingResponse();

  await handler({ params: { pluginId: "supabase" }, body: { enabled: true } }, res);

  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "workspace was not found" } });
});

test("AGENT_PLUGIN_SET_ENABLED: `req.params.pluginId ?? \"\"` fallback, forced via a direct handler call past auth, matches no installed plugin and writes nothing", async () => {
  await withAgentPluginsDir(async () => {
    await installReal("site-compliance", "seed-set-enabled-guard");
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    const { app, baseDeps } = buildTestApp();
    await baseDeps.identityReady;
    const ownerUser = await baseDeps.userRepo.findByUsername({ workspaceId: baseDeps.workspaceId, username: "admin" });
    assert.ok(ownerUser, "expected the seeded admin user");
    const ownerPrincipal = await baseDeps.principalRepo.findById({ workspaceId: baseDeps.workspaceId, id: ownerUser.principalId });
    assert.ok(ownerPrincipal, "expected the seeded admin principal");
    const handler = extractRouteHandler(app, "patch", SET_ENABLED_ROUTE);
    const { res, capture } = createCapturingResponse();
    res.locals.principal = ownerPrincipal;

    await handler({ params: { workspaceId: WORKSPACE_A }, body: { enabled: true } }, res);

    assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "agent plugin '' is not installed in this workspace", code: "AGENT_PLUGIN_NOT_FOUND" } });
    const persisted = await readAgentPluginActivations({ workspaceRoot });
    assert.deepEqual(Object.keys(persisted.plugins), [], "the empty id mints no activation record");
  });
});

test("AGENT_PLUGIN_SET_ENABLED: a provider plugin's assistant face has no switch of its own (409, nothing written)", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("metrics", "seed-linked-face", { version: "1.0.0", extensions: { tovu: { id: "tovu/metrics", providerPlugin: "metrics-provider" } } });
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "metrics", enabled: true, actor: "system:provider-plugin" });
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp().app, t);
    for (const enabled of [false, true]) {
      const response = await patch(baseUrl, cookie, "metrics", { enabled });
      assert.equal(response.status, 409);
      const body = await response.json();
      assert.equal(body.code, "AGENT_PLUGIN_LINKED");
      assert.equal(body.providerPluginId, "metrics-provider");
      assert.match(body.error, /'metrics' is part of the 'metrics-provider' plugin/);
    }
    const record = (await readAgentPluginActivations({ workspaceRoot })).plugins.metrics;
    assert.deepEqual([record?.enabled, record?.updatedBy], [true, "system:provider-plugin"], "the face still follows its provider plugin");
  });
});
