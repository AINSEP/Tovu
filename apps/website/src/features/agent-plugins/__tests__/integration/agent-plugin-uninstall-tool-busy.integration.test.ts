import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mock } from "node:test";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import type { SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";

/**
 * @file C2 busy-mapping proof for `agent_plugins_uninstall` (t91 R2, 2026-09-16): when the
 * cross-process activations.json write lock is busy, the tool must return
 * `{uninstalled:false, reason:"activations-busy", ...}` — the same ADR-055 Decision 6 RESULT shape
 * `plugins_set_enabled` returns for the sibling family, never an opaque thrown error. Mirrors this
 * directory's sibling `agent-plugin-uninstall-tool.integration.test.ts`'s UNREADABLE tests, but
 * forces the failure by mocking `exclusive-file-lock.ts` rather than corrupting the file, per this
 * repo's proven `activation-lock-busy.unit.test.ts` idiom: `mock.module()` is registered, spreading
 * the real module's own exports through it, before `activation.js`/`tool-registrations.js` are ever
 * imported, and each is imported only once, dynamically.
 *
 * The package is confirmed STILL installed afterwards, and `uninstall.ts`'s `restoreStagedTrees`
 * leaves no staged/quarantined leftovers — a busy lock is a refused delete, not a partial one.
 */

const real = await import("#src/features/agent-plugins/exclusive-file-lock");

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately loose: this file swaps
// `behavior` per test to cover the lock-failure shape without re-deriving the generic signature.
let behavior: (lockPath: string, run: (lock: any) => Promise<any>, options?: any) => Promise<any> = real.withExclusiveFileLock;

mock.module("#src/features/agent-plugins/exclusive-file-lock", {
  namedExports: {
    ...real,
    withExclusiveFileLock: (lockPath: string, run: (lock: unknown) => Promise<unknown>, options?: unknown) => behavior(lockPath, run, options),
  },
});

const { installAgentPlugin } = await import("#src/features/agent-plugins/install");
const { resolveAgentPluginLayout } = await import("#src/features/agent-plugins/layout");
const { setAgentPluginActivation } = await import("#src/features/agent-plugins/activation");
const { forceRemove } = await import("../fixtures/force-remove.js");
const { buildAgentPluginUninstallRegistrations } = await import("../../tool-registrations.js");
const { createSurfaceExchangeStore } = await import("#src/contracts/core/tool-surface-exchanges");

type AgentPluginArchiveEntry = Parameters<typeof reader>[0][number];
type AgentPluginUninstallToolDeps = Parameters<typeof buildAgentPluginUninstallRegistrations>[0];

const WORKSPACE_A = "88888888-8888-4888-8888-888888888888";
const TOOL_ID = "agent_plugins_uninstall";
const PRINCIPAL_ID = "principal-1";

function reader(entries: readonly { kind: "file"; entryPath: string; declaredSize: number; executable: boolean; openReadStream(): AsyncGenerator<Uint8Array> }[]) {
  return {
    async *entries() {
      yield* entries;
    },
  };
}

function fileEntry(entryPath: string, content: string) {
  const bytes = Buffer.from(content, "utf8");
  return {
    kind: "file" as const,
    entryPath,
    declaredSize: bytes.byteLength,
    executable: false,
    async *openReadStream() {
      yield bytes;
    },
  };
}

async function withAgentPluginsDir<T>(fn: (agentPluginsDir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-uninstall-busy-test-"));
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
  const entries: AgentPluginArchiveEntry[] = [fileEntry("plugin.json", manifest), fileEntry(`skills/${pluginId}/SKILL.md`, `# ${pluginId}\n`)];
  return installAgentPlugin({ archive, expectedSha256: digest, archiveReader: reader(entries), layout: resolveAgentPluginLayout(), workspaceId });
}

function fakeCtx(input: unknown, options: { emitSurface?: SurfaceEmitter } = {}): ToolExecutionContext {
  return {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
}

function fakeDeps(): { deps: AgentPluginUninstallToolDeps } {
  return {
    deps: {
      workspaceId: WORKSPACE_A,
      authorize: async () => ({ allowed: true, reason: "matched" }),
    },
  };
}

function findRegistration(deps: AgentPluginUninstallToolDeps, surfaceExchanges: SurfaceExchangeStore = createSurfaceExchangeStore()): ToolRegistration {
  const [registration] = buildAgentPluginUninstallRegistrations(deps, { surfaceExchanges });
  assert.ok(registration, "agent_plugins_uninstall must be registered");
  return registration;
}

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

const SURFACE_EXCHANGE_ID_PARAM = "exchangeId";

function exchangeIdFromSurface(surface: unknown): string {
  const match = surfaceHtml(surface).match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1] ?? "";
}

async function waitForDialog(first: Promise<unknown>, pending: Promise<unknown>): Promise<unknown> {
  const settled = pending.then(
    (result) => ({ dialog: false as const, outcome: JSON.stringify(result) }),
    (error: unknown) => ({ dialog: false as const, outcome: String(error) }),
  );
  const winner = await Promise.race([first.then((surface) => ({ dialog: true as const, surface })), settled]);
  if (!winner.dialog) assert.fail(`the call settled without raising a confirmation dialog: ${winner.outcome}`);
  return winner.surface;
}

function timeoutBehavior(pid: number): typeof behavior {
  return async (lockPath) => {
    const holder = { pid, hostname: "otherhost", token: "t", acquiredAt: new Date().toISOString() };
    throw new real.FileLockTimeoutError(lockPath, holder, 15_000);
  };
}

function busyOutput(pluginId: string) {
  return {
    uninstalled: false,
    cancelled: false,
    pluginId,
    restartRequired: false,
    reason: "activations-busy",
    note:
      `Nothing was removed: another Tovu process was writing this workspace's Agent Plugin activation record at the ` +
      `same moment, so '${pluginId}' was NOT uninstalled. Tell the user nothing was changed and to try again in a ` +
      "moment; if it keeps happening, the server log names the lock file.",
  };
}

test("t91 R2: a lock already busy before the call still raises the confirmation dialog — preview takes no lock — and only refuses the actual delete on confirm", async () => {
  await withAgentPluginsDir(async () => {
    const installed = await installReal(WORKSPACE_A, "operator-plugin", "archive-busy-preview");
    try {
      behavior = timeoutBehavior(9301);
      const { deps } = fakeDeps();
      const surfaceExchanges = createSurfaceExchangeStore();
      const recorder = surfaceRecorder();

      const pending = findRegistration(deps, surfaceExchanges).handler(fakeCtx({ pluginId: "operator-plugin" }, { emitSurface: recorder.emitSurface }));
      const surface = await waitForDialog(recorder.first, pending);
      const delivery = surfaceExchanges.deliver({
        exchangeId: exchangeIdFromSurface(surface),
        params: { decision: "confirm" },
        principalId: PRINCIPAL_ID,
        toolId: TOOL_ID,
      });
      assert.equal(delivery.ok, true);

      const result = await pending;
      assert.deepEqual(result, busyOutput("operator-plugin"));
      assert.equal((await stat(installed.packageRoot)).isDirectory(), true, "the package must still be installed");
    } finally {
      behavior = real.withExclusiveFileLock;
    }
  });
});

test("t91 R2: a lock that goes busy while the dialog is open removes nothing on confirm, and the package survives", async () => {
  await withAgentPluginsDir(async () => {
    const installed = await installReal(WORKSPACE_A, "operator-plugin", "archive-busy-confirm");
    const workspaceLayout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A);
    await setAgentPluginActivation({ workspaceRoot: workspaceLayout.root, pluginId: "operator-plugin", enabled: true, actor: "op-1" });
    try {
      const { deps } = fakeDeps();
      const surfaceExchanges = createSurfaceExchangeStore();
      const recorder = surfaceRecorder();

      const pending = findRegistration(deps, surfaceExchanges).handler(fakeCtx({ pluginId: "operator-plugin" }, { emitSurface: recorder.emitSurface }));
      const surface = await waitForDialog(recorder.first, pending);
      behavior = timeoutBehavior(9302);
      const delivery = surfaceExchanges.deliver({
        exchangeId: exchangeIdFromSurface(surface),
        params: { decision: "confirm" },
        principalId: PRINCIPAL_ID,
        toolId: TOOL_ID,
      });
      assert.equal(delivery.ok, true);

      const result = await pending;
      assert.deepEqual(result, busyOutput("operator-plugin"));
      assert.equal((await stat(installed.packageRoot)).isDirectory(), true, "a busy delete must leave the package installed, with no staged/quarantined leftovers");
    } finally {
      behavior = real.withExclusiveFileLock;
    }
  });
});
