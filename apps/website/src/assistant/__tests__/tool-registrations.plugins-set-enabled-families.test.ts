import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ToolInputError, type SurfaceEmitter, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import { InMemoryExternalMcpServerRepo, MCP_UI_MIME_TYPE, type UIResource } from "#src/assistant/index";
import { InMemoryChangeSetRepo } from "../../contracts/core/commands/index.js";
import {
  SURFACE_EXCHANGE_ID_PARAM,
  createSurfaceExchangeStore,
  type SurfaceExchangeStore,
} from "../../contracts/core/tool-surface-exchanges.js";
import { readAgentPluginActivations } from "../../features/agent-plugins/activation.js";
import { installAgentPlugin, type AgentPluginArchiveEntry, type AgentPluginArchiveReaderPort } from "../../features/agent-plugins/install.js";
import { resolveAgentPluginLayout } from "../../features/agent-plugins/layout.js";
import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { forceRemove } from "../../features/agent-plugins/__tests__/fixtures/force-remove.js";
import type { PluginDiscoveryRecord } from "../../features/plugin-runtime/discovery.js";
import { pluginAgentToolCatalog } from "../../features/plugin-runtime/agent-tools.js";
import { InMemoryPluginActivationRepo } from "../../features/plugin-runtime/repo.memory.js";
import {
  buildPluginsRegistrations,
  contributePluginsTools,
  pluginsDerivedRisk,
  type PluginsToolDeps,
} from "../../features/plugin-runtime/tool-registrations.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { registerToolContributor, resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { MCP_UI_REDEEMABLE_TOOL_IDS } from "../mcp-ui-tool-calls.js";

/**
 * @file `plugins_set_enabled` as ONE tool across BOTH plugin families — the RED/GREEN proof for the
 * 2026-09-09 dispatch's Job 1.
 *
 * Before this, the assistant could enable/disable a `.tovu-plugin` site/runtime plugin and nothing
 * else: a disabled Agent Plugin (`features/agent-plugins/`) got no `agent_plugin_*` tool at all
 * (`agent-plugins/tool-registrations.ts`'s `filterActiveAgentPlugins` gate), and no tool anywhere
 * wrapped `setAgentPluginActivation`, so the ONLY way to turn one on was the admin UI. The user
 * journey "find the Higgsfield plugin, then use it" dead-ended in chat.
 *
 * This suite pins four things a smaller change could not deliver:
 *
 * 1. ONE tool id handles both families, and the family is an EXPLICIT required argument — never
 *    inferred. Conflating the two systems has already caused real, wrong-directory work.
 * 2. Enabling raises a real human confirmation (the held-open MCP-UI exchange
 *    `content_post_delete` uses), because enabling changes what the assistant itself can do next.
 *    Disabling does not — it only ever removes capability.
 * 3. Enabling an Agent Plugin reports `restartRequired: true`, honestly: `activations.json` is
 *    re-read per run for prompt injection, but the plugin's own `agent_plugin_<id>` tool is
 *    registered once at daemon boot (`agent-daemon-server.ts`) and folded into a one-shot
 *    `search_tools` snapshot right after, so it is NOT callable until the daemon restarts.
 * 4. The tool is genuinely in the BUILT registration list reached through the real contributor
 *    seam — not merely compiling.
 */

const WORKSPACE_ID = "55555555-5555-4555-8555-555555555555";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-09T00:00:00.000Z";
const SET_ENABLED = "plugins_set_enabled";
const AGENT_PLUGIN_ID = "higgsfield-media";

const SITE_PLUGIN: PluginDiscoveryRecord = {
  id: "word-count",
  name: "Word Count",
  version: "1.0.0",
  source: "built-in",
  tier: "tier-3",
  status: "valid",
  errors: [],
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

/** Installs one REAL Agent Plugin through the production pipeline, against a temp
 *  `TOVU_AGENT_PLUGINS_DIR`, so the activation write this suite asserts on lands exactly where
 *  production writes it rather than in a stub. `extraEntries` lets a test add an `mcp.json` (or any
 *  other archive member) to the same real package. */
async function withInstalledAgentPlugin<T>(
  fn: (workspaceRoot: string) => Promise<T>,
  extraEntries: readonly AgentPluginArchiveEntry[] = [],
): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-plugin-family-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    const archive = new Uint8Array(Buffer.from("plugins-set-enabled-families-fixture"));
    await installAgentPlugin({
      archive,
      expectedSha256: createHash("sha256").update(archive).digest("hex"),
      archiveReader: reader([
        fileEntry(
          "plugin.json",
          JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: AGENT_PLUGIN_ID, version: "1.0.0" }),
        ),
        fileEntry(`skills/${AGENT_PLUGIN_ID}/SKILL.md`, `---\nname: ${AGENT_PLUGIN_ID}\ndescription: test\n---\n\nguidance\n`),
        ...extraEntries,
      ]),
      layout: resolveAgentPluginLayout(),
      workspaceId: WORKSPACE_ID,
    });
    return await fn(resolveAgentPluginLayout().forWorkspace(WORKSPACE_ID).root);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const authorizeCalls: Array<Record<string, unknown>> = [];
  const pluginActivationRepo = new InMemoryPluginActivationRepo();
  const externalMcpServerRepo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  let counter = 0;

  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: { enqueue: async () => undefined },
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
    pluginActivationRepo,
    discoverPlugins: async () => [SITE_PLUGIN],
    onPluginEnabled: async () => undefined,
    onPluginDisabled: () => undefined,
    removePlugin: async () => ({ ok: true, version: null }),
    externalMcpServerRepo,
    siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring,
  };

  return { deps: deps as unknown as PluginsToolDeps, authorizeCalls, pluginActivationRepo, externalMcpServerRepo };
}

function setEnabledTool(deps: PluginsToolDeps, surfaceExchanges: SurfaceExchangeStore): ToolRegistration {
  const found = buildPluginsRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === SET_ENABLED);
  assert.ok(found, `expected '${SET_ENABLED}' to be wired`);
  return found;
}

function call(registration: ToolRegistration, input: unknown, emitSurface?: SurfaceEmitter): Promise<unknown> {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
    ...(emitSurface ? { emitSurface } : {}),
  };
  return registration.handler(ctx);
}

/** Pulls the exchange id out of the emitted mcp-ui surface's HTML — the way the rendered iframe
 *  would. Copied from `features/post/__tests__/agent-tools.delete-confirmation.test.ts`, the file
 *  that established this mechanism's test idiom. */
function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1] ?? "";
}

/** Raises the dialog, answers it the way the browser callback endpoint does, and returns the
 *  parked call's real result. Waits for the dialog itself rather than one tick: an Agent Plugin enable
 *  reads activations.json before raising it (t91 §7.2). */
async function answerDialog(
  tool: ToolRegistration,
  surfaceExchanges: SurfaceExchangeStore,
  input: Record<string, unknown>,
  decision: "confirm" | "cancel",
): Promise<{ result: unknown; emitted: unknown[] }> {
  const emitted: unknown[] = [];
  let dialogRaised: () => void = () => undefined;
  const dialog = new Promise<"dialog">((resolve) => {
    dialogRaised = () => resolve("dialog");
  });
  const pending = call(tool, input, async (surface) => {
    emitted.push(surface);
    dialogRaised();
  });
  const first = await Promise.race([dialog, pending.then((result) => JSON.stringify(result), (error: unknown) => String(error))]);
  assert.equal(first, "dialog", "the dialog must be emitted before the call parks");
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const delivery = surfaceExchanges.deliver({
    exchangeId: exchangeIdFromSurface(emitted[0]),
    params: { decision },
    principalId: PRINCIPAL_ID,
    toolId: SET_ENABLED,
  });
  assert.equal(delivery.ok, true, `the human's answer did not reach the parked call: ${JSON.stringify(delivery)}`);
  return { result: await pending, emitted };
}

// ---------------------------------------------------------------------------
// 1. The tool is genuinely registered, and its risk band is declared
// ---------------------------------------------------------------------------

test("plugins_set_enabled is present in the BUILT registration list, reached through the real contributor seam", () => {
  resetToolContributorsForTests();
  registerToolContributor(contributePluginsTools());
  const { deps } = fakeRouteDeps();
  const ids = buildAssistantToolRegistrations(deps as unknown as RouteDeps).map((r) => r.descriptor.id);
  assert.ok(ids.includes(SET_ENABLED), `built catalog is missing '${SET_ENABLED}' — it would be silently uncallable`);
});

test("plugins_set_enabled has a DERIVED_RISK_BY_TOOL_ID entry — the wiring gate fails closed without one", () => {
  assert.equal(pluginsDerivedRisk.get(SET_ENABLED), "mutates-durable-state");
});

test("plugins_set_enabled is redeemable from the MCP-UI callback endpoint — its confirmation dialog posts back through it", () => {
  assert.ok(
    MCP_UI_REDEEMABLE_TOOL_IDS.has(SET_ENABLED),
    "a confirmation dialog whose tool id is not on the allowlist can never resolve — the call would park until it expires",
  );
});

// ---------------------------------------------------------------------------
// 2. The family is explicit, never inferred
// ---------------------------------------------------------------------------

test("the catalog schema requires 'family' and enumerates exactly the two real plugin systems", () => {
  const entry = pluginAgentToolCatalog.find((tool) => tool.name === SET_ENABLED);
  assert.ok(entry);
  const schema = entry.inputSchema as { required?: string[]; properties?: Record<string, { enum?: string[] }> };
  assert.ok(schema.required?.includes("family"), "'family' must be required — guessing between the two systems is the documented failure");
  assert.deepEqual(schema.properties?.family?.enum?.slice().sort(), ["agent-plugin", "site-runtime"]);
});

test("plugins_set_enabled: a missing 'family' is a ToolInputError, not an opaque 500", async () => {
  const { deps } = fakeRouteDeps();
  const tool = setEnabledTool(deps, createSurfaceExchangeStore());
  await assert.rejects(
    () => call(tool, { pluginId: SITE_PLUGIN.id, enabled: false }),
    (error: unknown) => {
      assert.ok(error instanceof ToolInputError, `expected ToolInputError, got ${String(error)}`);
      assert.match((error as Error).message, /family/);
      return true;
    },
  );
});

test("plugins_set_enabled: an unrecognized 'family' is a ToolInputError naming both valid values", async () => {
  const { deps } = fakeRouteDeps();
  const tool = setEnabledTool(deps, createSurfaceExchangeStore());
  await assert.rejects(
    () => call(tool, { pluginId: SITE_PLUGIN.id, enabled: false, family: "wordpress" }),
    (error: unknown) => {
      assert.ok(error instanceof ToolInputError, `expected ToolInputError, got ${String(error)}`);
      assert.match((error as Error).message, /site-runtime/);
      assert.match((error as Error).message, /agent-plugin/);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// 3. Enabling is human-confirmed; disabling is not
// ---------------------------------------------------------------------------

test("plugins_set_enabled: enabling refuses outright when the execution context has no confirmation channel", async () => {
  await withInstalledAgentPlugin(async (workspaceRoot) => {
    const { deps } = fakeRouteDeps();
    const tool = setEnabledTool(deps, createSurfaceExchangeStore());
    await assert.rejects(() => call(tool, { pluginId: AGENT_PLUGIN_ID, enabled: true, family: "agent-plugin" }), /confirmation/i);

    const activations = await readAgentPluginActivations(workspaceRoot);
    assert.equal(activations.plugins[AGENT_PLUGIN_ID]?.enabled, undefined, "nothing may be written when the gate cannot be raised");
  });
});

test("plugins_set_enabled: disabling an Agent Plugin needs no confirmation — it only ever removes capability", async () => {
  await withInstalledAgentPlugin(async (workspaceRoot) => {
    const { deps } = fakeRouteDeps();
    const tool = setEnabledTool(deps, createSurfaceExchangeStore());
    const out = (await call(tool, { pluginId: AGENT_PLUGIN_ID, enabled: false, family: "agent-plugin" })) as {
      agentPlugin: { enabled: boolean };
    };

    assert.equal(out.agentPlugin.enabled, false);
    const activations = await readAgentPluginActivations(workspaceRoot);
    assert.equal(activations.plugins[AGENT_PLUGIN_ID]?.enabled, false, "the disable must reach activations.json, not just the response");
  });
});

test("plugins_set_enabled: a corrupt activations file returns changed:false with an activations-unreadable reason — no confirmation, no throw", async () => {
  await withInstalledAgentPlugin(async (workspaceRoot) => {
    const activationsPath = path.join(workspaceRoot, "activations.json");
    await writeFile(activationsPath, "{ not json", "utf8");

    const { deps } = fakeRouteDeps();
    const tool = setEnabledTool(deps, createSurfaceExchangeStore());
    const out = (await call(tool, { pluginId: AGENT_PLUGIN_ID, enabled: false, family: "agent-plugin" })) as {
      changed: boolean;
      cancelled: boolean;
      reason?: string;
      restartRequired: boolean;
      note?: string;
    };

    assert.deepEqual(
      { changed: out.changed, cancelled: out.cancelled, reason: out.reason, restartRequired: out.restartRequired },
      { changed: false, cancelled: false, reason: "activations-unreadable", restartRequired: false },
    );
    assert.equal(
      out.note,
      "Nothing changed: this workspace's Agent Plugin activation record could not be read, so " +
        "'higgsfield-media' was NOT disabled. Tell the user an operator has to repair activations.json first " +
        "(the server log names the file and the fault); until then every Agent Plugin tool call in this workspace is refused.",
    );
    assert.equal(await readFile(activationsPath, "utf8"), "{ not json", "a refused write must leave the corrupt file exactly as it was");
  });
});

test("t91 §7.2: ENABLING on a corrupt activations file returns activations-unreadable WITHOUT raising the confirmation dialog", async (t) => {
  await withInstalledAgentPlugin(async (workspaceRoot) => {
    const activationsPath = path.join(workspaceRoot, "activations.json");
    await writeFile(activationsPath, "{ not json", "utf8");
    const warnings: string[] = [];
    t.mock.method(console, "warn", (...args: unknown[]) => warnings.push(args.map(String).join(" ")));

    const { deps } = fakeRouteDeps();
    const surfaceExchanges = createSurfaceExchangeStore();
    const tool = setEnabledTool(deps, surfaceExchanges);
    const emitted: unknown[] = [];
    let dialogRaised: (surface: unknown) => void = () => undefined;
    const dialog = new Promise<unknown>((resolve) => {
      dialogRaised = resolve;
    });
    const pending = call(tool, { pluginId: AGENT_PLUGIN_ID, enabled: true, family: "agent-plugin" }, async (surface) => {
      emitted.push(surface);
      dialogRaised(surface);
    });

    const first = await Promise.race([
      pending.then((result) => ({ kind: "result" as const, result })),
      dialog.then((surface) => ({ kind: "dialog" as const, surface })),
    ]);
    if (first.kind === "dialog") {
      surfaceExchanges.deliver({ exchangeId: exchangeIdFromSurface(first.surface), params: { decision: "confirm" }, principalId: PRINCIPAL_ID, toolId: SET_ENABLED });
      assert.fail(`a confirmation dialog was raised for a write that must refuse; after the human confirmed, the tool returned ${JSON.stringify(await pending)}`);
    }

    assert.deepEqual(first.result, {
      changed: false,
      cancelled: false,
      family: "agent-plugin",
      pluginId: AGENT_PLUGIN_ID,
      restartRequired: false,
      reason: "activations-unreadable",
      note:
        "Nothing changed: this workspace's Agent Plugin activation record could not be read, so " +
        "'higgsfield-media' was NOT enabled. Tell the user an operator has to repair activations.json first " +
        "(the server log names the file and the fault); until then every Agent Plugin tool call in this workspace is refused.",
    });
    assert.equal(emitted.length, 0);
    assert.equal(warnings.length, 1);
    assert.ok((warnings[0] ?? "").includes(activationsPath), "the server log must name the file");
    assert.equal(await readFile(activationsPath, "utf8"), "{ not json");
  });
});

test("plugins_set_enabled: a confirmed enable writes the Agent Plugin's activation record", async () => {
  await withInstalledAgentPlugin(async (workspaceRoot) => {
    const { deps } = fakeRouteDeps();
    const surfaceExchanges = createSurfaceExchangeStore();
    const tool = setEnabledTool(deps, surfaceExchanges);

    const { result } = await answerDialog(tool, surfaceExchanges, { pluginId: AGENT_PLUGIN_ID, enabled: true, family: "agent-plugin" }, "confirm");
    assert.equal((result as { agentPlugin: { enabled: boolean } }).agentPlugin.enabled, true);

    const activations = await readAgentPluginActivations(workspaceRoot);
    assert.equal(activations.plugins[AGENT_PLUGIN_ID]?.enabled, true);
    assert.equal(activations.plugins[AGENT_PLUGIN_ID]?.updatedBy, PRINCIPAL_ID, "the confirming operator is the recorded actor");
  });
});

test("plugins_set_enabled: a confirmed in-chat enable also provisions the plugin's declared remote MCP server, exactly like the admin toggle", async () => {
  await withInstalledAgentPlugin(
    async () => {
      const { deps, externalMcpServerRepo } = fakeRouteDeps();
      const surfaceExchanges = createSurfaceExchangeStore();
      const tool = setEnabledTool(deps, surfaceExchanges);

      await answerDialog(tool, surfaceExchanges, { pluginId: AGENT_PLUGIN_ID, enabled: true, family: "agent-plugin" }, "confirm");

      const rows = await externalMcpServerRepo.listByWorkspaceId(WORKSPACE_ID);
      const federated = rows.find((row) => row.label?.startsWith(AGENT_PLUGIN_ID));
      assert.ok(federated, "enabling an Agent Plugin in chat must provision its remote MCP servers, not only write activations.json");
      assert.equal(federated?.url, "https://mcp.example.com/mcp");
      assert.equal(federated?.provisionedByPluginId, AGENT_PLUGIN_ID);
      // Rule 2 (`federate-mcp.ts`'s header): a freshly provisioned row starts disabled — the same
      // guarantee the admin route's enable branch already makes.
      assert.equal(federated?.enabled, false, "a freshly provisioned row must start disabled, not auto-enabled by the plugin toggle");
    },
    [
      fileEntry(
        "mcp.json",
        JSON.stringify({
          $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
          mcpServers: { remote: { type: "streamable-http", url: "https://mcp.example.com/mcp" } },
        }),
      ),
    ],
  );
});

test("plugins_set_enabled: a declined enable writes nothing and says so", async () => {
  await withInstalledAgentPlugin(async (workspaceRoot) => {
    const { deps } = fakeRouteDeps();
    const surfaceExchanges = createSurfaceExchangeStore();
    const tool = setEnabledTool(deps, surfaceExchanges);

    const { result } = await answerDialog(tool, surfaceExchanges, { pluginId: AGENT_PLUGIN_ID, enabled: true, family: "agent-plugin" }, "cancel");
    assert.deepEqual(
      { changed: (result as { changed: boolean }).changed, cancelled: (result as { cancelled: boolean }).cancelled },
      { changed: false, cancelled: true },
    );

    const activations = await readAgentPluginActivations(workspaceRoot);
    assert.equal(activations.plugins[AGENT_PLUGIN_ID]?.enabled, undefined, "a declined confirmation must leave the record untouched");
  });
});

test("the confirmation dialog is a real MCP-UI resource naming the plugin, and calls back into THIS tool id", async () => {
  await withInstalledAgentPlugin(async () => {
    const { deps } = fakeRouteDeps();
    const surfaceExchanges = createSurfaceExchangeStore();
    const tool = setEnabledTool(deps, surfaceExchanges);

    const { emitted } = await answerDialog(tool, surfaceExchanges, { pluginId: AGENT_PLUGIN_ID, enabled: true, family: "agent-plugin" }, "confirm");
    const ui = (emitted[0] as { payload: { resource: UIResource } }).payload.resource;
    assert.equal(ui.resource.mimeType, MCP_UI_MIME_TYPE);
    const html = ui.resource.text ?? "";
    assert.match(html, new RegExp(SET_ENABLED));
    assert.match(html, new RegExp(AGENT_PLUGIN_ID), "a dialog that does not name the plugin is not real consent");
  });
});

// ---------------------------------------------------------------------------
// 4. The restart answer is reported, not assumed
// ---------------------------------------------------------------------------

test("enabling an Agent Plugin reports restartRequired:true and says why — its tool is registered only at daemon boot", async () => {
  await withInstalledAgentPlugin(async () => {
    const { deps } = fakeRouteDeps();
    const surfaceExchanges = createSurfaceExchangeStore();
    const tool = setEnabledTool(deps, surfaceExchanges);

    const { result } = await answerDialog(tool, surfaceExchanges, { pluginId: AGENT_PLUGIN_ID, enabled: true, family: "agent-plugin" }, "confirm");
    const out = result as { restartRequired: boolean; note: string };
    assert.equal(out.restartRequired, true);
    assert.match(out.note, /restart/i, "reporting success without the restart caveat is what left operators confused");
  });
});

test("disabling reports restartRequired:false — the activation gate is re-read per run, so an off switch lands immediately", async () => {
  await withInstalledAgentPlugin(async () => {
    const { deps } = fakeRouteDeps();
    const tool = setEnabledTool(deps, createSurfaceExchangeStore());
    const out = (await call(tool, { pluginId: AGENT_PLUGIN_ID, enabled: false, family: "agent-plugin" })) as { restartRequired: boolean };
    assert.equal(out.restartRequired, false);
  });
});

// ---------------------------------------------------------------------------
// 5. An id that is not installed is refused before anything is written
// ---------------------------------------------------------------------------

test("plugins_set_enabled: an Agent Plugin id that is not installed in this workspace is a ToolInputError", async () => {
  await withInstalledAgentPlugin(async () => {
    const { deps } = fakeRouteDeps();
    const tool = setEnabledTool(deps, createSurfaceExchangeStore());
    await assert.rejects(
      () => call(tool, { pluginId: "not-installed", enabled: false, family: "agent-plugin" }),
      (error: unknown) => {
        assert.ok(error instanceof ToolInputError, `expected ToolInputError, got ${String(error)}`);
        assert.match((error as Error).message, /not installed/i);
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// 6. The site-runtime family still works, through its own executeCommand composition
// ---------------------------------------------------------------------------

test("plugins_set_enabled: family 'site-runtime' still enables a .tovu-plugin through executeCommand, behind the same confirmation", async () => {
  const { deps, pluginActivationRepo } = fakeRouteDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const tool = setEnabledTool(deps, surfaceExchanges);

  const { result } = await answerDialog(tool, surfaceExchanges, { pluginId: SITE_PLUGIN.id, enabled: true, family: "site-runtime" }, "confirm");
  assert.equal((result as { plugin: { enabled: boolean } }).plugin.enabled, true);

  const saved = await pluginActivationRepo.getActivation({ workspaceId: WORKSPACE_ID, pluginId: SITE_PLUGIN.id });
  assert.equal(saved?.enabled, true, "the site-runtime path must still reach its own activation repo");
});

test("plugins_set_enabled: disabling a site-runtime plugin says its tool is refused from now on, not merely that it stays listed", async () => {
  const { deps, pluginActivationRepo } = fakeRouteDeps();
  await pluginActivationRepo.save({ pluginId: SITE_PLUGIN.id, workspaceId: WORKSPACE_ID, version: SITE_PLUGIN.version, enabled: true, updatedAt: NOW });
  const tool = setEnabledTool(deps, createSurfaceExchangeStore());

  const out = (await call(tool, { pluginId: SITE_PLUGIN.id, enabled: false, family: "site-runtime" })) as { restartRequired: boolean; note: string };

  assert.equal(out.restartRequired, false);
  assert.equal(
    out.note,
    "Disabled and saved. This takes effect immediately, with no restart: any tool this plugin contributed stays listed in the running daemon until Tovu restarts, but every call to it is refused from now on.",
  );
});

test("disabling an Agent Plugin says exactly what stopped — and that its provisioned external MCP connections did NOT", async () => {
  await withInstalledAgentPlugin(async () => {
    const { deps } = fakeRouteDeps();
    const tool = setEnabledTool(deps, createSurfaceExchangeStore());
    const out = (await call(tool, { pluginId: AGENT_PLUGIN_ID, enabled: false, family: "agent-plugin" })) as { note: string };

    assert.equal(
      out.note,
      `Disabled and saved. This takes effect immediately, with no restart: the activation record is re-read at ` +
        `the start of every run AND again before every agent_plugin_${AGENT_PLUGIN_ID} call, so the plugin's own ` +
        `tool stops answering at once rather than lingering until Tovu restarts. This does NOT change any external ` +
        `MCP server connection the plugin set up: if an operator turned one on, its mcp__<server>__* tools keep ` +
        `working until that connection is disabled under Integrations → External MCP.`,
    );
  });
});

test("plugins_set_enabled: authorize() runs before any confirmation dialog is raised", async () => {
  const { deps, authorizeCalls } = fakeRouteDeps({ allow: false });
  const tool = setEnabledTool(deps, createSurfaceExchangeStore());
  const emitted: unknown[] = [];

  await assert.rejects(
    () => call(tool, { pluginId: SITE_PLUGIN.id, enabled: true, family: "site-runtime" }, async (s) => void emitted.push(s)),
    /not authorized for/,
  );

  assert.ok(authorizeCalls.length >= 1);
  assert.equal(emitted.length, 0, "a denied principal must never cause a dialog to be shown");
});
