import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mock } from "node:test";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import type { SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import type { AgentPluginArchiveEntry, AgentPluginArchiveReaderPort } from "#src/features/agent-plugins/install";
import type { PluginsToolDeps } from "#src/features/plugin-runtime/tool-registrations";

/**
 * @file C2 busy-mapping proof for `plugins_set_enabled`'s Agent Plugin branch (t91 R2, 2026-09-16):
 * when the cross-process activations.json write lock is busy, the tool must return
 * `{changed:false, reason:"activations-busy", ...}` — a RESULT the model can relay (ADR-055
 * Decision 6), never a raw thrown error. Mirrors this directory's sibling
 * `tool-registrations.plugins-set-enabled-families.test.ts`'s UNREADABLE tests, but forces the
 * failure by mocking `exclusive-file-lock.ts` rather than corrupting the file, per this repo's
 * proven `activation-lock-busy.unit.test.ts` idiom: `mock.module()` is registered, spreading the
 * real module's own exports through it, before `activation.js`/`tool-registrations.js` are ever
 * imported, and each is imported only once, dynamically.
 *
 * The enable case also proves the pre-flight ordering (t91 §7.2, extended to R2): a busy lock is
 * caught BEFORE the confirmation dialog is raised, because `unwritableAgentPluginActivationsResult`
 * runs ahead of `confirmEnable` — see `plugin-runtime/tool-registrations.ts`'s `plugins_set_enabled`
 * handler, "Order is load-bearing".
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
const { readAgentPluginActivations } = await import("#src/features/agent-plugins/activation");
const { forceRemove } = await import("#src/features/agent-plugins/__tests__/fixtures/force-remove");
const { buildPluginsRegistrations } = await import("#src/features/plugin-runtime/tool-registrations");
const { InMemoryExternalMcpServerRepo } = await import("#src/assistant/index");
const { createSurfaceExchangeStore } = await import("#src/contracts/core/tool-surface-exchanges");
const { InMemoryChangeSetRepo } = await import("#src/contracts/core/commands/index");
const { InMemoryKeyring } = await import("#src/features/webhooks/keyring.memory");
const { AesGcmSecretSealer } = await import("#src/features/webhooks/secret-sealer.aesgcm");
const { InMemoryPluginActivationRepo } = await import("#src/features/plugin-runtime/repo.memory");

const WORKSPACE_ID = "66666666-6666-4666-8666-666666666666";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-09T00:00:00.000Z";
const SET_ENABLED = "plugins_set_enabled";
const AGENT_PLUGIN_ID = "higgsfield-media-busy";

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
  } as AgentPluginArchiveEntry;
}

async function withInstalledAgentPlugin<T>(fn: (workspaceRoot: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-plugin-family-busy-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    const archive = new Uint8Array(Buffer.from("plugins-set-enabled-busy-fixture"));
    await installAgentPlugin({
      archive,
      expectedSha256: createHash("sha256").update(archive).digest("hex"),
      archiveReader: reader([
        fileEntry(
          "plugin.json",
          JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: AGENT_PLUGIN_ID, version: "1.0.0" }),
        ),
        fileEntry(`skills/${AGENT_PLUGIN_ID}/SKILL.md`, `---\nname: ${AGENT_PLUGIN_ID}\ndescription: test\n---\n\nguidance\n`),
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

function fakeRouteDeps(): { deps: PluginsToolDeps } {
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
    authorize: async () => ({ allowed: true, reason: "matched" }),
    pluginActivationRepo: new InMemoryPluginActivationRepo(),
    discoverPlugins: async () => [],
    onPluginEnabled: async () => undefined,
    onPluginDisabled: () => undefined,
    removePlugin: async () => ({ ok: true, version: null }),
    externalMcpServerRepo,
    siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring,
  };

  return { deps: deps as unknown as PluginsToolDeps };
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

function timeoutBehavior(pid: number): typeof behavior {
  return async (lockPath) => {
    const holder = { pid, hostname: "otherhost", token: "t", acquiredAt: new Date().toISOString() };
    throw new real.FileLockTimeoutError(lockPath, holder, 15_000);
  };
}

function busyNoteFor(pluginId: string, enabled: boolean): string {
  return (
    `Nothing changed: another Tovu process was writing this workspace's Agent Plugin activation record at the same ` +
    `moment, so '${pluginId}' was NOT ${enabled ? "enabled" : "disabled"}. Tell the user nothing was changed and to ` +
    "try again in a moment; if it keeps happening, the server log names the lock file."
  );
}

test("plugins_set_enabled: a busy lock on ENABLE returns changed:false/reason:activations-busy WITHOUT raising the confirmation dialog", async () => {
  await withInstalledAgentPlugin(async (workspaceRoot) => {
    behavior = timeoutBehavior(9201);
    const { deps } = fakeRouteDeps();
    const tool = setEnabledTool(deps, createSurfaceExchangeStore());
    const emitted: unknown[] = [];

    const result = await call(tool, { pluginId: AGENT_PLUGIN_ID, enabled: true, family: "agent-plugin" }, async (surface) => void emitted.push(surface));

    assert.deepEqual(result, {
      changed: false,
      cancelled: false,
      family: "agent-plugin",
      pluginId: AGENT_PLUGIN_ID,
      restartRequired: false,
      reason: "activations-busy",
      note: busyNoteFor(AGENT_PLUGIN_ID, true),
    });
    assert.equal(emitted.length, 0, "a busy pre-flight must refuse before any confirmation dialog is raised");
    const activations = await readAgentPluginActivations(workspaceRoot);
    assert.equal(activations.plugins[AGENT_PLUGIN_ID]?.enabled, undefined, "nothing may be written when the lock is busy");
  });
});

test("plugins_set_enabled: a busy lock on DISABLE returns the same changed:false/reason:activations-busy result", async () => {
  await withInstalledAgentPlugin(async (workspaceRoot) => {
    behavior = timeoutBehavior(9202);
    const { deps } = fakeRouteDeps();
    const tool = setEnabledTool(deps, createSurfaceExchangeStore());

    const result = await call(tool, { pluginId: AGENT_PLUGIN_ID, enabled: false, family: "agent-plugin" });

    assert.deepEqual(result, {
      changed: false,
      cancelled: false,
      family: "agent-plugin",
      pluginId: AGENT_PLUGIN_ID,
      restartRequired: false,
      reason: "activations-busy",
      note: busyNoteFor(AGENT_PLUGIN_ID, false),
    });
    const activations = await readAgentPluginActivations(workspaceRoot);
    assert.equal(activations.plugins[AGENT_PLUGIN_ID]?.enabled, undefined, "nothing may be written when the lock is busy");
  });
});
