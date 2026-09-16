import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";

import { readAgentPluginActivations, recordBundledAgentPluginIfAbsent, setAgentPluginActivation } from "../../activation.js";
import { forceRemove } from "../fixtures/force-remove.js";
import { installAgentPlugin, type AgentPluginArchiveEntry, type AgentPluginArchiveReaderPort } from "../../install.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import {
  agentPluginUninstallAgentToolCatalog,
  buildAgentPluginUninstallRegistrations,
  type AgentPluginUninstallToolDeps,
} from "../../tool-registrations.js";

/**
 * @file `agent_plugins_uninstall`'s tool-boundary behavior: authorization, the held-open human
 * confirmation every delete sibling uses (`content_post_delete`, `media_trash_asset`), `ToolInputError`
 * re-classification of `uninstall.ts`'s own domain errors, and the actual on-disk effect — against
 * real installs through the production `installAgentPlugin` pipeline, the same idiom
 * `agent-plugin-search-tool.integration.test.ts` establishes for its own sibling tool. Complements
 * `__tests__/unit/uninstall.unit.test.ts`, which proves the domain function itself; this file proves
 * the SEAM around it. The route-level proof that a real Confirm/Cancel click is admitted lives in
 * `assistant/__tests__/mcp-ui-tool-calls-route.agent-plugins-uninstall.integration.test.ts`.
 */

const WORKSPACE_A = "77777777-7777-4777-8777-777777777777";
const TOOL_ID = "agent_plugins_uninstall";
const PRINCIPAL_ID = "principal-1";

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

async function withAgentPluginsDir<T>(fn: (agentPluginsDir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-uninstall-tool-test-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

async function installReal(workspaceId: string, pluginId: string, archiveSeed: string) {
  const manifest = JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, version: "1.0.0" });
  const archive = new Uint8Array(Buffer.from(archiveSeed));
  const digest = createHash("sha256").update(archive).digest("hex");
  const entries = [fileEntry("plugin.json", manifest), fileEntry(`skills/${pluginId}/SKILL.md`, `# ${pluginId}\n`)];
  return installAgentPlugin({ archive, expectedSha256: digest, archiveReader: reader(entries), layout: resolveAgentPluginLayout(), workspaceId });
}

function fakeCtx(input: unknown, options: { emitSurface?: SurfaceEmitter; signal?: AbortSignal } = {}): ToolExecutionContext {
  return {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input,
    signal: options.signal ?? new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
}

function fakeDeps(options: { allow?: boolean } = {}): { deps: AgentPluginUninstallToolDeps; authorizeCalls: Record<string, unknown>[] } {
  const allow = options.allow ?? true;
  const authorizeCalls: Record<string, unknown>[] = [];
  return {
    deps: {
      workspaceId: WORKSPACE_A,
      authorize: async (params: Record<string, unknown>) => {
        authorizeCalls.push(params);
        return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
      },
    },
    authorizeCalls,
  };
}

function findRegistration(deps: AgentPluginUninstallToolDeps, surfaceExchanges: SurfaceExchangeStore = createSurfaceExchangeStore()): ToolRegistration {
  const [registration] = buildAgentPluginUninstallRegistrations(deps, { surfaceExchanges });
  assert.ok(registration, "agent_plugins_uninstall must be registered");
  return registration;
}

/** Records every surface the handler emits. `first` resolves on the first one — the handler reads
 *  the disk before raising its dialog, so waiting one tick is not enough. */
function surfaceRecorder() {
  const emitted: unknown[] = [];
  let resolveFirst: (surface: unknown) => void = () => undefined;
  const first = new Promise<unknown>((resolve) => {
    resolveFirst = resolve;
  });
  const emitSurface: SurfaceEmitter = async (surface) => {
    emitted.push(surface);
    resolveFirst(surface);
  };
  return { emitted, first, emitSurface };
}

function surfaceHtml(surface: unknown): string {
  return (surface as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
}

function exchangeIdFromSurface(surface: unknown): string {
  const match = surfaceHtml(surface).match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1] ?? "";
}

/** Waits for the dialog, or fails naming what the call did instead. Never rejects on its own, so a
 *  call that resolves later (after the answer) cannot surface as an unhandled rejection. */
async function waitForDialog(first: Promise<unknown>, pending: Promise<unknown>): Promise<unknown> {
  const settled = pending.then(
    (result) => ({ dialog: false as const, outcome: JSON.stringify(result) }),
    (error: unknown) => ({ dialog: false as const, outcome: String(error) }),
  );
  const winner = await Promise.race([first.then((surface) => ({ dialog: true as const, surface })), settled]);
  if (!winner.dialog) assert.fail(`the call settled without raising a confirmation dialog: ${winner.outcome}`);
  return winner.surface;
}

/** Raises the dialog, answers it the way the browser callback endpoint does, and returns the parked
 *  call's real result. */
async function answerDialog(
  registration: ToolRegistration,
  surfaceExchanges: SurfaceExchangeStore,
  pluginId: string,
  decision: "confirm" | "cancel",
): Promise<{ result: unknown; surface: unknown }> {
  const recorder = surfaceRecorder();
  const pending = registration.handler(fakeCtx({ pluginId }, { emitSurface: recorder.emitSurface }));
  const surface = await waitForDialog(recorder.first, pending);
  const delivery = surfaceExchanges.deliver({
    exchangeId: exchangeIdFromSurface(surface),
    params: { decision },
    principalId: PRINCIPAL_ID,
    toolId: TOOL_ID,
  });
  assert.equal(delivery.ok, true, `the human's answer did not reach the parked call: ${JSON.stringify(delivery)}`);
  return { result: await pending, surface };
}

interface UninstallToolOutput {
  readonly uninstalled: boolean;
  readonly cancelled: boolean;
  readonly pluginId: string;
  readonly removedDigests?: readonly string[];
  readonly restartRequired: boolean;
  readonly reason?: string;
  readonly note: string;
}

test("the catalog carries exactly one tool, agent_plugins_uninstall, requiring 'pluginId', classified deletes-durable-state, and says it asks the human", () => {
  assert.equal(agentPluginUninstallAgentToolCatalog.length, 1);
  const [entry] = agentPluginUninstallAgentToolCatalog;
  assert.ok(entry);
  assert.equal(entry.name, TOOL_ID);
  assert.equal(entry.sideEffects, "deletes-durable-state");
  assert.equal(entry.authorization.permission, "admin.plugins.enable");
  assert.match(entry.description, /not reversible|NOT reversible|permanent/i);
  assert.match(entry.description, /ASKS THE HUMAN FIRST/);
  assert.doesNotMatch(entry.description, /does not raise its own confirmation dialog/);
  const schema = entry.inputSchema as { required: readonly string[] };
  assert.deepEqual(schema.required, ["pluginId"]);
});

test("checks admin.plugins.enable for this run's principal, scoped to this workspace", async () => {
  await withAgentPluginsDir(async () => {
    await installReal(WORKSPACE_A, "my-plugin", "archive-authz-check");
    const { deps, authorizeCalls } = fakeDeps();
    const surfaceExchanges = createSurfaceExchangeStore();

    await answerDialog(findRegistration(deps, surfaceExchanges), surfaceExchanges, "my-plugin", "cancel");

    assert.ok(authorizeCalls.length >= 1);
    assert.equal(authorizeCalls[0]!.principalId, PRINCIPAL_ID);
    assert.equal(authorizeCalls[0]!.permission, "admin.plugins.enable");
    assert.equal(authorizeCalls[0]!.workspaceId, WORKSPACE_A);
  });
});

test("a denied principal is rejected before any dialog is raised, and nothing is removed from disk", async () => {
  await withAgentPluginsDir(async () => {
    const installed = await installReal(WORKSPACE_A, "my-plugin", "archive-denied");
    const { deps } = fakeDeps({ allow: false });
    const recorder = surfaceRecorder();

    await assert.rejects(() => findRegistration(deps).handler(fakeCtx({ pluginId: "my-plugin" }, { emitSurface: recorder.emitSurface })));

    assert.equal(recorder.emitted.length, 0, "a denied principal must never have a dialog raised for them");
    assert.equal((await stat(installed.packageRoot)).isDirectory(), true);
  });
});

test("an unknown pluginId is reclassified as ToolInputError before any dialog, not a redacted internal error", async () => {
  await withAgentPluginsDir(async () => {
    const { deps } = fakeDeps();
    const recorder = surfaceRecorder();
    await assert.rejects(
      () => findRegistration(deps).handler(fakeCtx({ pluginId: "does-not-exist" }, { emitSurface: recorder.emitSurface })),
      (error: unknown) => error instanceof Error && error.constructor.name === "ToolInputError" && /not installed/.test(error.message),
    );
    assert.equal(recorder.emitted.length, 0, "a refusal must not ask the human to confirm something that cannot happen");
  });
});

test("a bundled plugin is refused as ToolInputError before any dialog, naming plugins_set_enabled as the way to turn it off — and nothing is removed", async () => {
  await withAgentPluginsDir(async () => {
    const installed = await installReal(WORKSPACE_A, "site-compliance", "archive-bundled-tool");
    const workspaceLayout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A);
    await recordBundledAgentPluginIfAbsent({ workspaceRoot: workspaceLayout.root, pluginId: "site-compliance" });
    const { deps } = fakeDeps();
    const recorder = surfaceRecorder();

    await assert.rejects(
      () => findRegistration(deps).handler(fakeCtx({ pluginId: "site-compliance" }, { emitSurface: recorder.emitSurface })),
      (error: unknown) =>
        error instanceof Error &&
        error.constructor.name === "ToolInputError" &&
        /bundled/i.test(error.message) &&
        /plugins_set_enabled with family 'agent-plugin'/.test(error.message),
    );

    assert.equal(recorder.emitted.length, 0);
    assert.equal((await stat(installed.packageRoot)).isDirectory(), true);
  });
});

test("FAILS CLOSED: with no interactive confirmation channel (no emitSurface) nothing is removed", async () => {
  await withAgentPluginsDir(async () => {
    const installed = await installReal(WORKSPACE_A, "operator-plugin", "archive-no-channel");
    const workspaceLayout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A);
    await setAgentPluginActivation({ workspaceRoot: workspaceLayout.root, pluginId: "operator-plugin", enabled: true, actor: "op-1" });
    const { deps } = fakeDeps();

    await assert.rejects(() => findRegistration(deps).handler(fakeCtx({ pluginId: "operator-plugin" })), /no interactive confirmation channel/);

    assert.equal((await stat(installed.packageRoot)).isDirectory(), true, "an unconfirmable call must not delete anything");
    const activations = await readAgentPluginActivations(workspaceLayout.root);
    assert.equal(activations.plugins["operator-plugin"]?.enabled, true, "the activation record must be untouched");
  });
});

test("the dialog names the plugin and its version, targets agent_plugins_uninstall, and carries no host path", async () => {
  await withAgentPluginsDir(async (dir) => {
    const installed = await installReal(WORKSPACE_A, "operator-plugin", "archive-dialog-content");
    const { deps } = fakeDeps();
    const surfaceExchanges = createSurfaceExchangeStore();

    const { surface } = await answerDialog(findRegistration(deps, surfaceExchanges), surfaceExchanges, "operator-plugin", "cancel");

    const html = surfaceHtml(surface);
    assert.match(html, /operator-plugin/);
    assert.match(html, /1\.0\.0/);
    assert.match(html, /agent_plugins_uninstall/);
    assert.equal(html.includes(installed.packageRoot), false, "the package root is a host path");
    assert.equal(html.includes(dir), false, "the agent-plugins directory is a host path");
  });
});

test("confirm: uninstalls — package root gone, activation record deleted, and the result says a restart is needed", async () => {
  await withAgentPluginsDir(async () => {
    const installed = await installReal(WORKSPACE_A, "operator-plugin", "archive-happy-path");
    const workspaceLayout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A);
    await setAgentPluginActivation({ workspaceRoot: workspaceLayout.root, pluginId: "operator-plugin", enabled: true, actor: "op-1" });
    const { deps } = fakeDeps();
    const surfaceExchanges = createSurfaceExchangeStore();

    const { result } = await answerDialog(findRegistration(deps, surfaceExchanges), surfaceExchanges, "operator-plugin", "confirm");
    const out = result as UninstallToolOutput;

    assert.equal(out.uninstalled, true);
    assert.equal(out.cancelled, false);
    assert.equal(out.pluginId, "operator-plugin");
    assert.deepEqual(out.removedDigests, [installed.archiveDigest]);
    // The plugin's own agent_plugin_<id> tool is registered once at daemon boot with its guidance in
    // memory, so it keeps answering until a restart — "uninstalled" alone would mislead.
    assert.equal(out.restartRequired, true);
    assert.match(out.note, /restart/i);
    await assert.rejects(() => stat(installed.packageRoot));

    const activations = await readAgentPluginActivations(workspaceLayout.root);
    assert.equal("operator-plugin" in activations.plugins, false, "the activation record must be deleted, not tombstoned");
  });
});

test("cancel: nothing is removed and the result reports the cancellation, not an error", async () => {
  await withAgentPluginsDir(async () => {
    const installed = await installReal(WORKSPACE_A, "operator-plugin", "archive-cancel");
    const workspaceLayout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A);
    await setAgentPluginActivation({ workspaceRoot: workspaceLayout.root, pluginId: "operator-plugin", enabled: true, actor: "op-1" });
    const { deps } = fakeDeps();
    const surfaceExchanges = createSurfaceExchangeStore();

    const { result } = await answerDialog(findRegistration(deps, surfaceExchanges), surfaceExchanges, "operator-plugin", "cancel");
    const out = result as UninstallToolOutput;

    assert.equal(out.uninstalled, false);
    assert.equal(out.cancelled, true);
    assert.equal(out.restartRequired, false);
    assert.equal((await stat(installed.packageRoot)).isDirectory(), true);
    const activations = await readAgentPluginActivations(workspaceLayout.root);
    assert.equal(activations.plugins["operator-plugin"]?.enabled, true);
  });
});

test("an archive installed for the same id while the dialog is open: confirm removes NOTHING and the result says it changed", async () => {
  await withAgentPluginsDir(async () => {
    const first = await installReal(WORKSPACE_A, "operator-plugin", "archive-changed-a");
    const { deps } = fakeDeps();
    const surfaceExchanges = createSurfaceExchangeStore();
    const recorder = surfaceRecorder();

    const pending = findRegistration(deps, surfaceExchanges).handler(fakeCtx({ pluginId: "operator-plugin" }, { emitSurface: recorder.emitSurface }));
    const surface = await waitForDialog(recorder.first, pending);
    const second = await installReal(WORKSPACE_A, "operator-plugin", "archive-changed-b");
    const delivery = surfaceExchanges.deliver({
      exchangeId: exchangeIdFromSurface(surface),
      params: { decision: "confirm" },
      principalId: PRINCIPAL_ID,
      toolId: TOOL_ID,
    });
    assert.equal(delivery.ok, true);
    const out = (await pending) as UninstallToolOutput;

    assert.deepEqual(out, {
      uninstalled: false,
      cancelled: false,
      pluginId: "operator-plugin",
      restartRequired: false,
      reason: "changed-since-confirmation",
      note:
        "'operator-plugin' changed after the user was asked: the installed archives are no longer the ones the confirmation showed. " +
        "Nothing was removed. Call agent_plugins_uninstall again so the user can review and confirm what is installed now.",
    });
    assert.equal((await stat(first.packageRoot)).isDirectory(), true);
    assert.equal((await stat(second.packageRoot)).isDirectory(), true);
  });
});

test("a run that ends while the dialog is open closes it, reports 'abandoned', and removes nothing", async () => {
  await withAgentPluginsDir(async () => {
    const installed = await installReal(WORKSPACE_A, "operator-plugin", "archive-abandoned");
    const { deps } = fakeDeps();
    const controller = new AbortController();
    const recorder = surfaceRecorder();

    const pending = findRegistration(deps).handler(fakeCtx({ pluginId: "operator-plugin" }, { emitSurface: recorder.emitSurface, signal: controller.signal }));
    await waitForDialog(recorder.first, pending);
    controller.abort();
    const out = (await pending) as UninstallToolOutput;

    assert.equal(out.uninstalled, false);
    assert.equal(out.cancelled, false);
    assert.equal(out.reason, "abandoned");
    assert.equal((await stat(installed.packageRoot)).isDirectory(), true);
  });
});
