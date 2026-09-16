import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createToolRegistry, type Principal, type ToolRegistry } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { setAgentPluginActivation } from "../../activation.js";
import { forceRemove } from "../fixtures/force-remove.js";
import {
  installAgentPlugin,
  type AgentPluginArchiveEntry,
  type AgentPluginArchiveReaderPort,
  type InstalledAgentPlugin,
} from "../../install.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { setAgentPluginEnabled } from "../../set-enabled.js";
import { registerInstalledAgentPluginTools } from "../../tool-registrations.js";
import { uninstallAgentPlugin } from "../../uninstall.js";

/**
 * @file REVOCATION: disabling an installed Agent Plugin must make its already-registered
 * `agent_plugin_<id>` tool stop answering — in the daemon that is already running, with no restart.
 *
 * The gap this file exists for (sol finding 5-1, 2026-09-16): `registerInstalledAgentPluginTools`
 * runs ONCE, inside `agent-daemon-server.ts`'s `start()`, and `@jini-ai/core`'s `ToolRegistry` is
 * append-only by design — there is no `unregister`. So the activation gate inside
 * `loadInstalledAgentPluginToolSources` only ever ran at boot, and every per-plugin handler is a
 * closure over the snapshot it took. An operator who revoked a plugin afterwards kept a live,
 * callable tool serving that plugin's guidance for the rest of the daemon's lifetime.
 *
 * Asserted through the REAL invocation path — `@jini-ai/daemon`'s `ToolExecutor.execute`, the only
 * way a tool can run at all (`@jini-ai/core`'s `authorizeToolInvocation` never hands back a handler
 * that has not passed the registration's own policy). A test that called `registration.handler`
 * directly would prove nothing about revocation, because that is precisely the gate it would skip.
 *
 * Both inbound adapters that can disable an Agent Plugin — the admin toggle
 * (`server/inbound/admin-http/routes/agent-plugins/set-enabled.ts`) and the assistant's own
 * `plugins_set_enabled` (`features/plugin-runtime/tool-registrations.ts`) — funnel through
 * `set-enabled.ts`'s `setAgentPluginEnabled`, so the first case below covers both. The second case
 * writes the record through the bare writer instead, which is what makes the gate independent of
 * WHICH caller flipped it: a future third writer inherits revocation rather than having to
 * remember to call something.
 */

const WORKSPACE_ID = "91919191-9191-4191-8191-919191919191";
const PLUGIN_ID = "coffee-roastery";
const TOOL_ID = "agent_plugin_coffee_roastery";
const PRINCIPAL: Principal = { id: "principal-1" };
const SKILL_MARKDOWN = "# Coffee Roastery\n\nRoast at 210C for eleven minutes.\n";

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

async function withAgentPluginsDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-revocation-test-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

async function installReal(archiveSeed: string): Promise<InstalledAgentPlugin> {
  const manifest = JSON.stringify({
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: PLUGIN_ID,
    version: "1.0.0",
  });
  const archive = new Uint8Array(Buffer.from(archiveSeed));
  const digest = createHash("sha256").update(archive).digest("hex");
  return installAgentPlugin({
    archive,
    expectedSha256: digest,
    archiveReader: reader(entries(manifest)),
    layout: resolveAgentPluginLayout(),
    workspaceId: WORKSPACE_ID,
  });
}

function entries(manifest: string): readonly AgentPluginArchiveEntry[] {
  return [fileEntry("plugin.json", manifest), fileEntry(`skills/${PLUGIN_ID}/SKILL.md`, SKILL_MARKDOWN)];
}

/** Boots the tool surface the way `agent-daemon-server.ts` does: register once, then keep the same
 *  registry for the rest of the process's life. */
async function bootDaemonToolSurface(): Promise<ToolRegistry> {
  const registry = createToolRegistry();
  await registerInstalledAgentPluginTools(registry, { workspaceId: WORKSPACE_ID });
  assert.equal(registry.has(TOOL_ID), true, "precondition: an enabled plugin must register its tool at boot");
  return registry;
}

/** The one real invocation path — the same `ToolExecutor` `assistant/tool-executor-stack.ts` wraps. */
async function callPluginTool(registry: ToolRegistry) {
  const executor = createToolExecutor({ registry });
  return executor.execute(PRINCIPAL, { id: "run-1" }, TOOL_ID, {});
}

test("a plugin disabled through setAgentPluginEnabled — the composition BOTH the admin toggle and plugins_set_enabled call — stops answering in the already-running daemon, with no restart", async () => {
  await withAgentPluginsDir(async () => {
    await installReal("archive-revoke-shared-composition");
    const registry = await bootDaemonToolSurface();

    const before = await callPluginTool(registry);
    assert.equal(before.status, "completed", "precondition: while enabled, the tool answers");
    assert.match(JSON.stringify(before.output), /Roast at 210C/, "precondition: it really serves the plugin's guidance");

    await setAgentPluginEnabled({ workspaceId: WORKSPACE_ID, pluginId: PLUGIN_ID, enabled: false, actor: "operator-1" });

    const after = await callPluginTool(registry);
    assert.notEqual(
      after.status,
      "completed",
      `a disabled Agent Plugin's tool must not execute — an operator who revoked '${PLUGIN_ID}' believes its capabilities are gone`,
    );
    assert.equal(after.status, "denied", "revocation is an authorization outcome, so the execution must be recorded as denied");
    assert.doesNotMatch(
      JSON.stringify(after.output ?? null),
      /Roast at 210C/,
      "no part of a revoked plugin's guidance may still reach the model",
    );
  });
});

test("revocation follows the activation RECORD, not the caller: a bare setAgentPluginActivation write revokes the live tool too", async () => {
  await withAgentPluginsDir(async () => {
    await installReal("archive-revoke-bare-writer");
    const registry = await bootDaemonToolSurface();
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_ID).root;

    await setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: false, actor: "operator-1" });
    assert.equal((await callPluginTool(registry)).status, "denied", "any writer of the activation record revokes the tool");

    // ...and the same gate re-admits it, so revocation is reversible from the admin without the
    // restart an enable still needs for a plugin that was NOT registered at boot.
    await setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: true, actor: "operator-1" });
    assert.equal((await callPluginTool(registry)).status, "completed", "re-enabling must restore the already-registered tool");
  });
});

/**
 * ---------------------------------------------------------------------------
 * UNINSTALL — the stronger operation must not weaken what the weaker one granted
 * ---------------------------------------------------------------------------
 * `uninstall.ts` DELETES the activation record (a settled decision, recorded in its own header), and
 * `activation.ts`'s `isAgentPluginActive` reads an ABSENT record as ACTIVE. Gating a live tool on
 * that pair alone meant *disable -> uninstall* flipped the gate from deny straight back to allow:
 * the operator removed the plugin entirely and got its revoked capability back. Absence is not
 * consent, and these three cases are what say so.
 */

test("uninstalling a DISABLED plugin must not re-admit its revoked tool — deleting the activation record is not consent", async () => {
  await withAgentPluginsDir(async () => {
    await installReal("archive-uninstall-after-disable");
    const registry = await bootDaemonToolSurface();
    assert.equal((await callPluginTool(registry)).status, "completed", "precondition: while enabled and installed, the tool answers");

    await setAgentPluginEnabled({ workspaceId: WORKSPACE_ID, pluginId: PLUGIN_ID, enabled: false, actor: "operator-1" });
    assert.equal((await callPluginTool(registry)).status, "denied", "precondition: the disable itself revokes the tool");

    await uninstallAgentPlugin({ layout: resolveAgentPluginLayout(), workspaceId: WORKSPACE_ID, pluginId: PLUGIN_ID });

    const after = await callPluginTool(registry);
    assert.equal(
      after.status,
      "denied",
      "an operator who disabled a plugin and THEN uninstalled it must not have its tool handed back — the record's absence records that the bytes are gone, never that the capability was re-granted",
    );
    assert.doesNotMatch(
      JSON.stringify(after.output ?? null),
      /Roast at 210C/,
      "no part of an uninstalled plugin's guidance may still reach the model",
    );
  });
});

test("uninstalling an ENABLED plugin revokes its live tool too — uninstall alone is a revocation, not just a disk operation", async () => {
  await withAgentPluginsDir(async () => {
    await installReal("archive-uninstall-while-enabled");
    const registry = await bootDaemonToolSurface();
    assert.equal((await callPluginTool(registry)).status, "completed", "precondition: while enabled and installed, the tool answers");

    await uninstallAgentPlugin({ layout: resolveAgentPluginLayout(), workspaceId: WORKSPACE_ID, pluginId: PLUGIN_ID });

    const after = await callPluginTool(registry);
    assert.equal(after.status, "denied", "a plugin whose package is gone must not keep serving from the registration built at boot");
    assert.doesNotMatch(JSON.stringify(after.output ?? null), /Roast at 210C/, "no part of an uninstalled plugin's guidance may still reach the model");
  });
});

test("the gate's INSTALLED half stands on its own: the package bytes disappearing revokes the tool even while the record still says enabled", async () => {
  await withAgentPluginsDir(async () => {
    const installed = await installReal("archive-uninstall-bytes-only");
    const registry = await bootDaemonToolSurface();
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_ID).root;

    // An explicit enabled:true record, so the activation half of the gate cannot be what denies.
    await setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: true, actor: "operator-1" });
    assert.equal((await callPluginTool(registry)).status, "completed", "precondition: an explicitly enabled, installed plugin answers");

    await forceRemove(installed.packageRoot);

    assert.equal(
      (await callPluginTool(registry)).status,
      "denied",
      "the installed-package signal must be checked independently of the activation record — a registration whose bytes are gone cannot be authorized by a record that outlived them",
    );
  });
});
