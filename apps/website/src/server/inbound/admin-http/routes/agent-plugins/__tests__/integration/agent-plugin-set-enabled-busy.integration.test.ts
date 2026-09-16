import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mock } from "node:test";
import test from "node:test";

import express from "express";

import type { AgentPluginArchiveEntry, AgentPluginArchiveReaderPort } from "#src/features/agent-plugins/install";
import type { AgentPluginsRouteDeps } from "../../deps.js";

/**
 * @file C2 busy-mapping proof for `AGENT_PLUGIN_SET_ENABLED` (t91 R2, 2026-09-16): when another
 * Tovu process holds the cross-process `activations.json` write lock and the wait times out, the
 * PATCH must return 409 `AGENT_PLUGIN_ACTIVATIONS_BUSY` — the same 409 shape the sibling
 * `agent-plugin-set-enabled.integration.test.ts` already proves for the UNREADABLE case — never an
 * opaque 500, and nothing is written.
 *
 * Mocks `exclusive-file-lock.ts`'s `withExclusiveFileLock` to throw a real `FileLockTimeoutError`
 * instantly rather than forcing real cross-process contention: the real lock's own correctness is
 * `activation-cross-process-writes.integration.test.ts`'s job; this file only proves the mapping
 * from that failure to this route's response. Same mock-before-any-real-import idiom as
 * `activation-lock-busy.unit.test.ts` — `mock.module()` is registered, with the real module's own
 * exports spread through it, before `activation.js`/`set-enabled.js`/the route module are ever
 * imported, and each is imported only once, dynamically, because `mock.module()` cannot
 * retroactively rebind a specifier a module already resolved at its first load.
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
const { createRouteDeps } = await import("#src/server/runtime/composition/app");
const { registerAuthRoutes, requireAdminSession } = await import("#src/server/inbound/admin-http/dev-auth");
const { bootAuthenticated } = await import("#src/server/__tests__/helpers/http-test-server");
const { registerAgentPluginSetEnabledRoute } = await import("../../set-enabled.js");

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
  } as AgentPluginArchiveEntry;
}

function manifestJson(name: string): string {
  return JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name, version: "1.0.0" });
}

async function withAgentPluginsDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-set-enabled-busy-test-"));
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

async function installReal(pluginId: string, archiveSeed: string) {
  const entries: AgentPluginArchiveEntry[] = [
    fileEntry("plugin.json", manifestJson(pluginId)),
    fileEntry(`skills/${pluginId}/SKILL.md`, `# ${pluginId}\n`),
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

function buildTestApp(): { app: express.Express } {
  const baseDeps = createRouteDeps();
  const routeDeps: AgentPluginsRouteDeps = {
    workspaceId: baseDeps.workspaceId,
    authorize: baseDeps.authorize,
    clock: baseDeps.clock,
    externalMcpServerRepo: baseDeps.externalMcpServerRepo,
    siteAssistantSecretSealer: baseDeps.siteAssistantSecretSealer,
    siteAssistantSecretKeyring: baseDeps.siteAssistantSecretKeyring,
  };

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, baseDeps);
  app.use("/api/admin", requireAdminSession(baseDeps));
  registerAgentPluginSetEnabledRoute(app, routeDeps);
  return { app };
}

function patch(baseUrl: string, cookie: string, pluginId: string, body: unknown) {
  return fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_A}/agent-plugins/${encodeURIComponent(pluginId)}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function timeoutBehavior(pid: number): typeof behavior {
  return async (lockPath) => {
    const holder = { pid, hostname: "otherhost", token: "t", acquiredAt: new Date().toISOString() };
    throw new real.FileLockTimeoutError(lockPath, holder, 15_000);
  };
}

test("AGENT_PLUGIN_SET_ENABLED: another process holding the write lock is 409 AGENT_PLUGIN_ACTIVATIONS_BUSY — nothing is written, no host or lock path leaks", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("site-compliance", "seed-set-enabled-busy-a");
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    behavior = timeoutBehavior(9101);

    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp().app, t);
    const response = await patch(baseUrl, cookie, "site-compliance", { enabled: true });

    assert.equal(response.status, 409);
    const body = (await response.json()) as { error: string; code: string };
    assert.equal(body.code, "AGENT_PLUGIN_ACTIVATIONS_BUSY");
    assert.equal(
      body.error,
      "Another Tovu process was changing this workspace's Agent Plugin activation record at the same moment, so " +
        "nothing was changed. Try again; if this keeps happening, the server log names the lock file.",
    );
    assert.equal(JSON.stringify(body).includes(workspaceRoot), false, "the 409 body must carry no host path");
    assert.equal(JSON.stringify(body).includes("activations.json.lock"), false, "the 409 body must not name the lock file");

    const persisted = await readAgentPluginActivations(workspaceRoot);
    assert.equal(persisted.plugins["site-compliance"], undefined, "a busy write must leave no activation record behind");
  });
});

test("AGENT_PLUGIN_SET_ENABLED: a lock lost right before commit is also 409 AGENT_PLUGIN_ACTIVATIONS_BUSY, not a 500", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("site-compliance", "seed-set-enabled-busy-b");
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    behavior = async (lockPath, run) =>
      run({
        lockPath,
        assertHeld: async () => {
          throw new real.FileLockLostError(lockPath);
        },
      });

    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp().app, t);
    const response = await patch(baseUrl, cookie, "site-compliance", { enabled: false });

    assert.equal(response.status, 409);
    assert.equal(((await response.json()) as { code: string }).code, "AGENT_PLUGIN_ACTIVATIONS_BUSY");
  });
});
