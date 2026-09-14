import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import { createToolRegistry, type SurfaceEmission } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { forceRemove } from "../../features/agent-plugins/__tests__/fixtures/force-remove.js";
import { installAgentPlugin, type AgentPluginArchiveEntry, type InstalledAgentPlugin } from "../../features/agent-plugins/install.js";
import { resolveAgentPluginLayout } from "../../features/agent-plugins/layout.js";
import { buildAgentPluginUninstallRegistrations } from "../../features/agent-plugins/tool-registrations.js";
import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";

/**
 * @file Route-level allowlist proof for `agent_plugins_uninstall`'s confirmation dialog, modeled on
 * `mcp-ui-tool-calls-route.media-trash-asset.integration.test.ts`. Only the real
 * `MCP_UI_TOOL_CALLS_PATH` route consults `isMcpUiToolCallAllowed`, so a tool can register, render a
 * correct dialog and pass every handler-level test while every real Confirm/Cancel click 403s — the
 * way `media_trash_asset` and `external_mcp_save` both shipped once. One named test per decision, so
 * a broken allowlist entry fails by name.
 */

const WORKSPACE_ID = "88888888-8888-4888-8888-888888888888";
const PRINCIPAL = "principal-admin-1";
const PLUGIN_ID = "operator-plugin";
const TOOL_ID = "agent_plugins_uninstall";

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

/** Installs one real operator plugin under a temp `TOVU_AGENT_PLUGINS_DIR` — the directory the
 *  handler resolves at call time. */
async function withInstalledPlugin<T>(fn: (installed: InstalledAgentPlugin) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-mcp-ui-agent-plugins-uninstall-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    const archive = new Uint8Array(Buffer.from("mcp-ui-agent-plugins-uninstall-route"));
    const entries = [
      fileEntry("plugin.json", JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: PLUGIN_ID, version: "1.0.0" })),
      fileEntry(`skills/${PLUGIN_ID}/SKILL.md`, `# ${PLUGIN_ID}\n`),
    ];
    const installed = await installAgentPlugin({
      archive,
      expectedSha256: createHash("sha256").update(archive).digest("hex"),
      archiveReader: {
        async *entries() {
          yield* entries;
        },
      },
      layout: resolveAgentPluginLayout(),
      workspaceId: WORKSPACE_ID,
    });
    return await fn(installed);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

function buildToolExecutor(surfaceExchanges: SurfaceExchangeStore) {
  const deps = { workspaceId: WORKSPACE_ID, authorize: async () => ({ allowed: true, reason: "matched" }) };
  const registry = createToolRegistry();
  for (const registration of buildAgentPluginUninstallRegistrations(deps, { surfaceExchanges })) {
    registry.register(registration);
  }
  return createToolExecutor({ registry });
}

/** Pulls the exchange id out of the emitted mcp-ui surface's HTML — the way the rendered iframe would. */
function exchangeIdFromEmission(emission: SurfaceEmission): string {
  const resource = (emission.payload as { resource?: { resource?: { text?: string } } }).resource;
  const html = resource?.resource?.text ?? "";
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

const DECISIONS = [
  { decision: "confirm", expectUninstalled: true },
  { decision: "cancel", expectUninstalled: false },
] as const;

for (const { decision, expectUninstalled } of DECISIONS) {
  test(`real round trip: a browser '${decision}' click for agent_plugins_uninstall is admitted by the allowlist (202, not 403) and resolves the parked call`, async (t) => {
    await withInstalledPlugin(async (installed) => {
      const surfaceExchanges = createSurfaceExchangeStore();
      const toolExecutor = buildToolExecutor(surfaceExchanges);

      let resolveEmission: (emission: SurfaceEmission) => void = () => undefined;
      const firstEmission = new Promise<SurfaceEmission>((resolve) => {
        resolveEmission = resolve;
      });
      const pending = toolExecutor.execute({ id: PRINCIPAL }, { id: "run-1" }, TOOL_ID, { pluginId: PLUGIN_ID }, undefined, async (emission: SurfaceEmission) => {
        resolveEmission(emission);
      });
      // The handler reads the disk before it raises the dialog; `execute` never rejects for a handler
      // failure, so racing it against the emission cannot leak an unhandled rejection.
      const first = await Promise.race([firstEmission.then((emission) => ({ emission })), pending.then((settled) => ({ settled }))]);
      assert.ok("emission" in first, `the call settled without raising a dialog: ${JSON.stringify(first)}`);

      const app = express();
      app.use(express.json());
      registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
      const baseUrl = await startTestServer(app, t);

      const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
        body: JSON.stringify({ toolName: TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeIdFromEmission(first.emission), decision } }),
      });
      const body = (await res.json()) as { delivered?: boolean };

      // Load-bearing: without the id in MCP_UI_REDEEMABLE_TOOL_IDS the route refuses with 403
      // TOOL_NOT_ALLOWLISTED before it ever touches the exchange.
      assert.equal(res.status, 202, `expected the allowlist to accept this delivery: ${JSON.stringify(body)}`);
      assert.equal(body.delivered, true);

      const executed = await pending;
      assert.equal(executed.status, "completed", `the parked call must resolve completed: ${JSON.stringify(executed)}`);
      const output = executed.output as { uninstalled: boolean; cancelled: boolean };
      assert.equal(output.uninstalled, expectUninstalled);
      assert.equal(output.cancelled, !expectUninstalled);
      if (expectUninstalled) {
        await assert.rejects(() => stat(installed.packageRoot), "a confirmed uninstall must remove the package");
      } else {
        assert.equal((await stat(installed.packageRoot)).isDirectory(), true, "a cancelled uninstall must leave the package");
      }
    });
  });
}
