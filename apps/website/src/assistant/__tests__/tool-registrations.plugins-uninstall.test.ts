import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import type { UIResource } from "#src/assistant/index";
import { InMemoryExternalMcpServerRepo } from "#src/assistant/index";
import { InMemoryChangeSetRepo } from "../../contracts/core/commands/index.js";
import {
  createSurfaceExchangeStore,
  SURFACE_EXCHANGE_ID_PARAM,
  type SurfaceExchangeStore,
} from "../../contracts/core/tool-surface-exchanges.js";
import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import type { PluginDiscoveryRecord } from "../../features/plugin-runtime/discovery.js";
import { pluginAgentToolCatalog, type AgentToolDefinition as PluginsAgentToolDefinition } from "../../features/plugin-runtime/agent-tools.js";
import { InMemoryPluginActivationRepo } from "../../features/plugin-runtime/repo.memory.js";
import { buildPluginsRegistrations, type PluginsToolDeps } from "../../features/plugin-runtime/tool-registrations.js";
// S4 (2026-09-24) fixtures — case (a) below installs a REAL Agent Plugin on disk to prove the
// 'agent-plugin' family branch, the same way `mcp-ui-tool-calls-route.agent-plugins-uninstall.
// integration.test.ts` (now retargeted to this same tool) already did for the deleted standalone tool.
import { forceRemove } from "../../features/agent-plugins/__tests__/fixtures/force-remove.js";
import { installAgentPlugin, type AgentPluginArchiveEntry } from "../../features/agent-plugins/install.js";
import { resolveAgentPluginLayout } from "../../features/agent-plugins/layout.js";

/**
 * @file `plugins_uninstall` — the RED/GREEN proof for `ADS-memory/reports/2026-09-07-
 * assistant-tool-coverage-audit.md`'s Gap #4: the real admin route
 * (`DELETE .../plugins/:pluginId`, `routes/admin/plugins/uninstall.ts`, Milestone 2, 2026-08-20)
 * exists and is wired, but `plugin-runtime/agent-tools.ts`'s own catalog header FALSELY claimed
 * "features/plugin-runtime has no admin ROUTE for [uninstall] at all" — the exact reason the tool
 * was never built. Before this dispatch, `pluginAgentToolCatalog` held only `plugins_list`/
 * `plugins_set_enabled` (2 entries); this suite pins the 3rd.
 *
 * Sibling of `tool-registrations.plugins.test.ts`, which this domain's OTHER two tools already have
 * full coverage in — kept as its own file rather than appended there, since it exercises a materially
 * different mechanism (`uninstallPlugin`, not `executeCommand`).
 */

const WORKSPACE_ID = "ws-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-07T00:00:00.000Z";

const BUILT_IN: PluginDiscoveryRecord = {
  id: "word-count",
  name: "Word Count",
  version: "1.0.0",
  source: "built-in",
  tier: "tier-3",
  status: "valid",
  errors: [],
};

const SITE_PLUGIN: PluginDiscoveryRecord = {
  id: "my-plugin",
  name: "My Plugin",
  version: "1.0.0",
  source: "site",
  tier: "tier-3",
  status: "valid",
  errors: [],
};

function fakeRouteDeps(options: { allow?: boolean; discovery?: PluginDiscoveryRecord[] } = {}) {
  const allow = options.allow ?? true;
  const discovery = options.discovery ?? [BUILT_IN, SITE_PLUGIN];
  const authorizeCalls: Array<Record<string, unknown>> = [];
  const uninstallCalls: string[] = [];
  const pluginActivationRepo = new InMemoryPluginActivationRepo();
  // `PluginsToolDeps` grew an external-MCP slice when `plugins_set_enabled` started provisioning an
  // Agent Plugin's declared remote servers. `plugins_uninstall` never touches it, but this literal is
  // typed as the whole interface on purpose — a real one, not a cast, so this suite keeps failing to
  // compile the day the tool under test needs a dependency nobody wired here.
  const keyring = new InMemoryKeyring();

  const deps: PluginsToolDeps = {
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => "id-1" },
    changeSets: new InMemoryChangeSetRepo(),
    // The delivery half is never exercised here (`plugins_uninstall` enqueues nothing) but is
    // supplied for real, same shape `contracts/core/commands/__tests__/repo.memory.unit.test.ts`
    // uses — the literal is typed as the whole port, so it has to satisfy the whole port.
    outbox: { enqueue: async () => undefined, claimPending: async () => [], markDelivered: async () => {}, markFailed: async () => {} },
    pluginActivationRepo,
    discoverPlugins: async () => discovery,
    onPluginEnabled: async () => undefined,
    onPluginDisabled: () => undefined,
    removePlugin: async (required) => {
      uninstallCalls.push(required.id);
      return { ok: true, version: null };
    },
    externalMcpServerRepo: new InMemoryExternalMcpServerRepo(),
    siteAssistantSecretSealer: new AesGcmSecretSealer(keyring),
    siteAssistantSecretKeyring: keyring,
  };

  return { deps, authorizeCalls, uninstallCalls, pluginActivationRepo };
}

function registrations(deps: PluginsToolDeps): Map<string, ToolRegistration> {
  // `plugins_set_enabled` grew a confirmation-surface dependency (2026-09-09), so the builder now
  // takes the assistant's surface machinery too. This file's own tool (`plugins_uninstall`) raises no
  // surface, so a store nobody opens an exchange on is exactly the right fixture here.
  return new Map(buildPluginsRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore() }).map((r) => [r.descriptor.id, r]));
}

function wired(deps: PluginsToolDeps, id: string): ToolRegistration {
  const found = registrations(deps).get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

function catalogEntry(toolId: string): PluginsAgentToolDefinition {
  const entry = pluginAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

/**
 * Drives `plugins_uninstall` end to end, answering its confirmation dialog the way
 * `mcp-ui-tool-calls-route.ts` does for a real human click. Mirrors
 * `tool-registrations.plugins.test.ts`'s own `enableWithDecision` exactly, one tool over.
 *
 * Built through `buildPluginsRegistrations` directly (not the assistant-level builder) so this test
 * can `deliver()` into its own exchange store.
 */
async function uninstallWithDecision(
  deps: PluginsToolDeps,
  input: Record<string, unknown>,
  decision: "confirm" | "cancel",
): Promise<unknown> {
  const surfaceExchanges: SurfaceExchangeStore = createSurfaceExchangeStore();
  const registration = buildPluginsRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === "plugins_uninstall");
  assert.ok(registration, "expected 'plugins_uninstall' to be wired");

  const emitted: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (surface) => void emitted.push(surface);
  const pending = registration.handler({
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
    emitSurface,
  } as ToolExecutionContext);

  await new Promise((resolve) => setImmediate(resolve));
  if (emitted.length === 0) return pending; // refused before the dialog — let the caller assert on it

  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text ?? "";
  assert.match(html, /Move My Plugin to trash\?/);
  assert.match(html, /all workspaces on this site/);
  assert.match(html, /60 days/);
  assert.match(html, /Move to trash/);
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the dialog must carry its exchange id");
  surfaceExchanges.deliver({ exchangeId: match[1] ?? "", params: { decision }, principalId: PRINCIPAL_ID, toolId: "plugins_uninstall" });
  return pending;
}

// ---------------------------------------------------------------------------
// 1. The catalog now has 3 entries, and all 3 are wired
// ---------------------------------------------------------------------------

test("plugins_uninstall is wired alongside plugins_list/plugins_set_enabled — 3 wired tools, catalog has exactly 3 entries", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...registrations(deps).keys()].sort(), ["plugins_list", "plugins_set_enabled", "plugins_uninstall"]);
  assert.equal(pluginAgentToolCatalog.length, 3, "no unwired plugins entry — the whole catalog is wired");
});

test("plugins_uninstall's catalog says the plugin moves to the 60-day Trash", () => {
  assert.match(catalogEntry("plugins_uninstall").description, /Trash/);
  assert.match(catalogEntry("plugins_uninstall").description, /60 days/);
  assert.match(catalogEntry("plugins_uninstall").description, /all workspaces on this site/);
});

test("agent-tools.ts's header no longer claims uninstall has no admin route — the stale comment is fixed", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("../../features/plugin-runtime/agent-tools.ts", import.meta.url), "utf8");
  assert.doesNotMatch(
    source,
    /There is no install\/uninstall\/upload tool\. `features\/plugin-runtime` has no admin ROUTE for\s*\n\s*\* +either operation at all/,
    "the false 'no uninstall route exists' claim must not still be asserted as current fact",
  );
});

// ---------------------------------------------------------------------------
// 2. Authorization (ADR-021 §2) — same permission as plugins_set_enabled, no new grant
// ---------------------------------------------------------------------------

test("plugins_uninstall requires admin.plugins.enable — the SAME permission plugins_set_enabled uses, no new grant introduced", () => {
  assert.equal(catalogEntry("plugins_uninstall").authorization.permission, "admin.plugins.enable");
  assert.equal(catalogEntry("plugins_uninstall").authorization.permission, catalogEntry("plugins_set_enabled").authorization.permission);
});

test("plugins_uninstall: calls authorize() with admin.plugins.enable and the run's principal before touching anything", async () => {
  const { deps, authorizeCalls, pluginActivationRepo } = fakeRouteDeps({ discovery: [SITE_PLUGIN] });
  await pluginActivationRepo.save({ pluginId: SITE_PLUGIN.id, workspaceId: WORKSPACE_ID, version: "1.0.0", enabled: false, updatedAt: NOW });

  await uninstallWithDecision(deps, { family: "site-runtime", pluginId: SITE_PLUGIN.id }, "confirm");

  assert.ok(authorizeCalls.length >= 1);
  assert.equal(authorizeCalls[0]!.principalId, PRINCIPAL_ID);
  assert.equal(authorizeCalls[0]!.permission, "admin.plugins.enable");
  assert.equal(authorizeCalls[0]!.workspaceId, WORKSPACE_ID);
});

// ---------------------------------------------------------------------------
// 2a. Confirmation (2026-09-16) — the human must approve before anything is removed
// ---------------------------------------------------------------------------

test("plugins_uninstall: with no interactive confirmation channel, the call fails closed and nothing is removed", async () => {
  const { deps, uninstallCalls, pluginActivationRepo } = fakeRouteDeps({ discovery: [SITE_PLUGIN] });
  await pluginActivationRepo.save({ pluginId: SITE_PLUGIN.id, workspaceId: WORKSPACE_ID, version: "1.0.0", enabled: false, updatedAt: NOW });

  await assert.rejects(
    () => wired(deps, "plugins_uninstall").handler(executionContext({ family: "site-runtime", pluginId: SITE_PLUGIN.id })),
    /confirmation|cannot be gated/i,
  );
  assert.deepEqual(uninstallCalls, [], "the filesystem mechanism must never be reached without a way to ask a human first");
});

test("plugins_uninstall: a cancelled confirmation removes nothing and reports cancelled:true, not an error", async () => {
  const { deps, uninstallCalls, pluginActivationRepo } = fakeRouteDeps({ discovery: [SITE_PLUGIN] });
  await pluginActivationRepo.save({ pluginId: SITE_PLUGIN.id, workspaceId: WORKSPACE_ID, version: "1.0.0", enabled: false, updatedAt: NOW });

  const out = (await uninstallWithDecision(deps, { family: "site-runtime", pluginId: SITE_PLUGIN.id }, "cancel")) as {
    pluginId: string;
    uninstalled: boolean;
    cancelled: boolean;
  };

  assert.equal(out.pluginId, SITE_PLUGIN.id);
  assert.equal(out.uninstalled, false);
  assert.equal(out.cancelled, true);
  assert.deepEqual(uninstallCalls, [], "the filesystem mechanism must never be reached when the human declines");

  const remaining = await pluginActivationRepo.listAll();
  assert.equal(remaining.filter((a) => a.pluginId === SITE_PLUGIN.id).length, 1, "the activation row must still exist — nothing changed");
});

test("plugins_uninstall: a denied principal is rejected and nothing is removed", async () => {
  const { deps, uninstallCalls } = fakeRouteDeps({ allow: false, discovery: [SITE_PLUGIN] });
  await assert.rejects(() => wired(deps, "plugins_uninstall").handler(executionContext({ family: "site-runtime", pluginId: SITE_PLUGIN.id })));
  assert.deepEqual(uninstallCalls, []);
});

// ---------------------------------------------------------------------------
// 3. Business rules — mirrors uninstall.ts's own two preconditions exactly
// ---------------------------------------------------------------------------

test("plugins_uninstall: refuses a built-in plugin — nothing to remove", async () => {
  const { deps, uninstallCalls } = fakeRouteDeps();
  await assert.rejects(() => wired(deps, "plugins_uninstall").handler(executionContext({ family: "site-runtime", pluginId: BUILT_IN.id })), /built-in/);
  assert.deepEqual(uninstallCalls, []);
});

test("plugins_uninstall: refuses a plugin still enabled in a workspace", async () => {
  const { deps, uninstallCalls, pluginActivationRepo } = fakeRouteDeps({ discovery: [SITE_PLUGIN] });
  await pluginActivationRepo.save({ pluginId: SITE_PLUGIN.id, workspaceId: WORKSPACE_ID, version: "1.0.0", enabled: true, updatedAt: NOW });

  await assert.rejects(() => wired(deps, "plugins_uninstall").handler(executionContext({ family: "site-runtime", pluginId: SITE_PLUGIN.id })), /enabled/);
  assert.deepEqual(uninstallCalls, [], "the filesystem mechanism must never be reached while still enabled somewhere");
});

test("plugins_uninstall: refuses an unknown plugin id", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(() => wired(deps, "plugins_uninstall").handler(executionContext({ family: "site-runtime", pluginId: "does-not-exist" })), /was not found/);
});

// ---------------------------------------------------------------------------
// 4. Happy path — files moved to Trash, activation rows retained until purge
// ---------------------------------------------------------------------------

test("plugins_uninstall: moves the on-disk artifact to Trash and retains activation rows", async () => {
  const { deps, uninstallCalls, pluginActivationRepo } = fakeRouteDeps({ discovery: [SITE_PLUGIN] });
  await pluginActivationRepo.save({ pluginId: SITE_PLUGIN.id, workspaceId: WORKSPACE_ID, version: "1.0.0", enabled: false, updatedAt: NOW });
  await pluginActivationRepo.save({ pluginId: SITE_PLUGIN.id, workspaceId: "other-ws", version: "1.0.0", enabled: false, updatedAt: NOW });

  const out = (await uninstallWithDecision(deps, { family: "site-runtime", pluginId: SITE_PLUGIN.id }, "confirm")) as {
    pluginId: string;
    trashed: true;
  };

  assert.deepEqual(uninstallCalls, [SITE_PLUGIN.id]);
  assert.equal(out.pluginId, SITE_PLUGIN.id);
  assert.equal(out.trashed, true);

  const remaining = await pluginActivationRepo.listAll();
  assert.equal(remaining.filter((a) => a.pluginId === SITE_PLUGIN.id).length, 2, "activation rows remain until permanent purge");
});

test("plugins_uninstall: a plugin never activated anywhere moves to Trash cleanly", async () => {
  const { deps, uninstallCalls } = fakeRouteDeps({ discovery: [SITE_PLUGIN] });
  const out = (await uninstallWithDecision(deps, { family: "site-runtime", pluginId: SITE_PLUGIN.id }, "confirm")) as { trashed: true };
  assert.deepEqual(uninstallCalls, [SITE_PLUGIN.id]);
  assert.equal(out.trashed, true);
});

// ---------------------------------------------------------------------------
// 5. t91 F2.2 — the post-confirmation write re-discovers and refuses on a change
// ---------------------------------------------------------------------------

test("plugins_uninstall: a plugin whose version changed while the dialog was open is NOT removed, and the result says so", async () => {
  const { deps, uninstallCalls, pluginActivationRepo } = fakeRouteDeps({ discovery: [SITE_PLUGIN] });
  await pluginActivationRepo.save({ pluginId: SITE_PLUGIN.id, workspaceId: WORKSPACE_ID, version: "1.0.0", enabled: false, updatedAt: NOW });
  let discoveryCalls = 0;
  const changing: PluginsToolDeps = { ...deps, discoverPlugins: async () => (discoveryCalls++ === 0 ? [SITE_PLUGIN] : [{ ...SITE_PLUGIN, version: "2.0.0" }]) };

  const out = await uninstallWithDecision(changing, { family: "site-runtime", pluginId: SITE_PLUGIN.id }, "confirm");

  assert.deepEqual(out, {
    pluginId: "my-plugin",
    uninstalled: false,
    cancelled: false,
    reason: "changed-since-confirmation",
    note:
      "'my-plugin' changed after the user was asked: the confirmation showed My Plugin version 1.0.0, and that is no longer what is " +
      "installed. Nothing was removed. Call plugins_uninstall again so the user can review and confirm what is installed now.",
  });
  assert.deepEqual(uninstallCalls, []);
  const remaining = await pluginActivationRepo.listAll();
  assert.equal(remaining.filter((a) => a.pluginId === "my-plugin").length, 1);
});

test("plugins_uninstall: a plugin that disappeared from discovery while the dialog was open is refused on the fresh read, and nothing is removed", async () => {
  const { deps, uninstallCalls, pluginActivationRepo } = fakeRouteDeps({ discovery: [SITE_PLUGIN] });
  await pluginActivationRepo.save({ pluginId: SITE_PLUGIN.id, workspaceId: WORKSPACE_ID, version: "1.0.0", enabled: false, updatedAt: NOW });
  let discoveryCalls = 0;
  const changing: PluginsToolDeps = { ...deps, discoverPlugins: async () => (discoveryCalls++ === 0 ? [SITE_PLUGIN] : []) };

  await assert.rejects(
    () => uninstallWithDecision(changing, { family: "site-runtime", pluginId: SITE_PLUGIN.id }, "confirm"),
    /plugin 'my-plugin' was not found in the current discovery snapshot/,
  );
  assert.deepEqual(uninstallCalls, []);
});

// ---------------------------------------------------------------------------
// 6. S4 (2026-09-24) — plugins_uninstall is now ONE tool for BOTH plugin families, the deleted
//    standalone agent_plugins_uninstall's Agent Plugin branch folded in behind a required 'family'
//    argument (same merge plugins_set_enabled already got, 2026-09-09).
// ---------------------------------------------------------------------------

const AGENT_PLUGIN_ID = "operator-plugin";

/** Installs one real, minimal Agent Plugin under a temp `TOVU_AGENT_PLUGINS_DIR` — the directory
 *  `runAgentPluginUninstall` (via `resolveAgentPluginLayout()`) resolves at call time — and runs `fn`
 *  with the installed record, cleaning up the temp dir and env var override afterward regardless of
 *  outcome. Mirrors `mcp-ui-tool-calls-route.agent-plugins-uninstall.integration.test.ts`'s own
 *  `withInstalledPlugin` (that file is retargeted onto this same `plugins_uninstall` tool). */
async function withInstalledAgentPlugin<T>(fn: (packageRoot: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-plugins-uninstall-agent-plugin-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    const manifest = Buffer.from(
      JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: AGENT_PLUGIN_ID, version: "1.0.0" }),
      "utf8",
    );
    const skill = Buffer.from(`# ${AGENT_PLUGIN_ID}\n`, "utf8");
    function fileEntry(entryPath: string, bytes: Buffer): AgentPluginArchiveEntry {
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
    const archive = new Uint8Array(Buffer.from("plugins-uninstall-agent-plugin-family-fixture"));
    const installed = await installAgentPlugin({
      archive,
      expectedSha256: createHash("sha256").update(archive).digest("hex"),
      archiveReader: {
        async *entries() {
          yield fileEntry("plugin.json", manifest);
          yield fileEntry(`skills/${AGENT_PLUGIN_ID}/SKILL.md`, skill);
        },
      },
      layout: resolveAgentPluginLayout(),
      workspaceId: WORKSPACE_ID,
    });
    return await fn(installed.packageRoot);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

test("plugins_uninstall with family:'agent-plugin' opens a dialog whose confirm toolName is plugins_uninstall, and confirming removes the package dir", async () => {
  await withInstalledAgentPlugin(async (packageRoot) => {
    const { deps } = fakeRouteDeps();
    const surfaceExchanges = createSurfaceExchangeStore();
    const registration = buildPluginsRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === "plugins_uninstall");
    assert.ok(registration, "expected 'plugins_uninstall' to be wired");

    const emitted: unknown[] = [];
    let resolveEmitted: () => void = () => undefined;
    const firstEmitted = new Promise<void>((resolve) => {
      resolveEmitted = resolve;
    });
    const emitSurface: SurfaceEmitter = async (surface) => {
      emitted.push(surface);
      resolveEmitted();
    };
    const pending = registration.handler({
      executionId: "exec-1",
      principal: { id: PRINCIPAL_ID },
      run: { id: "run-1" },
      input: { family: "agent-plugin", pluginId: AGENT_PLUGIN_ID },
      signal: new AbortController().signal,
      emitSurface,
    } as ToolExecutionContext);

    // Real disk I/O (`previewAgentPluginUninstall`) precedes the dialog here, unlike the site-runtime
    // branch's in-memory preview — so this races the emission against the call settling, rather than
    // assuming one microtask tick is enough.
    const first = await Promise.race([firstEmitted.then(() => "emitted" as const), pending.then(() => "settled" as const)]);
    assert.equal(first, "emitted", `expected the agent-plugin uninstall dialog to open before the call settled: ${JSON.stringify(emitted)}`);
    assert.equal(emitted.length, 1, "expected the agent-plugin uninstall dialog to open");
    const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text ?? "";
    assert.match(html, new RegExp(`Uninstall ${AGENT_PLUGIN_ID}\\?`));

    const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
    assert.ok(match, "the dialog must carry its exchange id");
    // Load-bearing: `deliver` only resolves this call when its `toolId` matches the id the exchange was
    // opened with (`tool-surface-exchanges.ts`'s `toolMismatch` guard) — so a successful delivery here
    // through "plugins_uninstall" IS the proof the dialog's confirm redeems through that one id, not
    // the deleted family-specific `agent_plugins_uninstall`.
    surfaceExchanges.deliver({ exchangeId: match[1] ?? "", params: { decision: "confirm" }, principalId: PRINCIPAL_ID, toolId: "plugins_uninstall" });

    const out = (await pending) as { uninstalled: boolean; cancelled: boolean; pluginId: string };
    assert.equal(out.uninstalled, true);
    assert.equal(out.cancelled, false);
    assert.equal(out.pluginId, AGENT_PLUGIN_ID);
    await assert.rejects(() => stat(packageRoot), "a confirmed uninstall must remove the package");
  });
});

test("plugins_uninstall: a call with no 'family' is rejected before any dialog, for either family's id", async () => {
  const { deps } = fakeRouteDeps({ discovery: [SITE_PLUGIN] });
  await assert.rejects(
    () => wired(deps, "plugins_uninstall").handler(executionContext({ pluginId: SITE_PLUGIN.id })),
    /'family' is required and must be exactly one of: 'site-runtime'/,
  );
});

test("the registry this file builds has no agent_plugins_uninstall id — the standalone tool was deleted; both families redeem through plugins_uninstall now", () => {
  const { deps } = fakeRouteDeps();
  assert.equal(registrations(deps).has("agent_plugins_uninstall"), false);
  assert.equal(pluginAgentToolCatalog.some((tool) => tool.name === "agent_plugins_uninstall"), false);
});
