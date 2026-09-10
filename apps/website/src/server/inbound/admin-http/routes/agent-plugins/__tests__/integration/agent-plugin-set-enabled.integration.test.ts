import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { registerAuthRoutes, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { readAgentPluginActivations, setAgentPluginActivation } from "#src/features/agent-plugins/activation";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { resolveAgentPluginRefs } from "#src/features/agent-plugins/resolve-agent-plugin-refs";
import {
  installAgentPlugin,
  type AgentPluginArchiveEntry,
  type AgentPluginArchiveReaderPort,
} from "#src/features/agent-plugins/install";
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

function manifestJson(name: string, fields: { version?: string; description?: string; keywords?: readonly string[] } = {}): string {
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

async function installReal(pluginId: string, archiveSeed: string) {
  const entries: AgentPluginArchiveEntry[] = [
    fileEntry("plugin.json", manifestJson(pluginId, { version: "1.0.0", description: `The ${pluginId} package.`, keywords: ["demo"] })),
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

function buildTestApp(): express.Express {
  // ONE `createRouteDeps()` call for both the auth stack and the route's deps — a second call
  // stands up a separate identity/policy store and the owner login would 403 against it. Same
  // reason `agent-plugins-http.integration.test.ts` threads `baseDeps.authorize` through.
  const baseDeps = createRouteDeps();
  const routeDeps: AgentPluginsRouteDeps = { workspaceId: baseDeps.workspaceId, authorize: baseDeps.authorize };

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, baseDeps);
  app.use("/api/admin", requireAdminSession(baseDeps));
  registerAgentPluginSetEnabledRoute(app, routeDeps);
  return app;
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
    await installReal("site-compliance", "seed-set-enabled-a");
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "site-compliance", enabled: false, actor: "test" });

    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
    const response = await patch(baseUrl, cookie, "site-compliance", { enabled: true });

    assert.equal(response.status, 200);
    const body = (await response.json()) as { agentPlugin: { pluginId: string; enabled: boolean; version: string | null; skills: Array<{ name: string }> } };
    assert.equal(body.agentPlugin.pluginId, "site-compliance");
    assert.equal(body.agentPlugin.enabled, true, "the response reports the state just written, not the pre-write state");
    assert.equal(body.agentPlugin.version, "1.0.0", "the row is the same shape AGENT_PLUGINS_LIST returns, so the client can replace in place");
    assert.ok(body.agentPlugin.skills.some((skill) => skill.name === "site-compliance"));

    const persisted = await readAgentPluginActivations(workspaceRoot);
    assert.equal(persisted.plugins["site-compliance"]?.enabled, true, "the decision survives on disk");
  });
});

test("AGENT_PLUGIN_SET_ENABLED: the toggle actually gates an assistant run — resolveAgentPluginRefs flips across a PATCH", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("site-compliance", "seed-set-enabled-b");
    const workspaceLayout = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A);
    await setAgentPluginActivation({ workspaceRoot: workspaceLayout.root, pluginId: "site-compliance", enabled: false, actor: "test" });

    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);

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

    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
    assert.equal((await patch(baseUrl, cookie, "site-compliance", { enabled: true })).status, 200);

    const persisted = await readAgentPluginActivations(workspaceRoot);
    assert.equal(persisted.plugins["site-compliance"]?.origin, "bundled", "a bundled plugin does not become operator-installed by being toggled");
    assert.notEqual(persisted.plugins["site-compliance"]?.updatedBy, "system:seed", "the toggling operator, not the seeder, is recorded as the actor");
  });
});

test("AGENT_PLUGIN_SET_ENABLED: an id that is not installed in this workspace is 404, and writes nothing", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("site-compliance", "seed-set-enabled-d");
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;

    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);
    const response = await patch(baseUrl, cookie, "never-installed", { enabled: true });

    assert.equal(response.status, 404);
    assert.equal(((await response.json()) as { code?: string }).code, "AGENT_PLUGIN_NOT_FOUND");

    const persisted = await readAgentPluginActivations(workspaceRoot);
    assert.equal(persisted.plugins["never-installed"], undefined, "no activation record is minted for a plugin that does not exist");
  });
});

test("AGENT_PLUGIN_SET_ENABLED: a non-boolean `enabled` is 400 VALIDATION_ERROR, not a silent disable", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("site-compliance", "seed-set-enabled-e");
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "site-compliance", enabled: true, actor: "test" });

    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);

    for (const body of [{}, { enabled: "false" }, { enabled: 0 }]) {
      const response = await patch(baseUrl, cookie, "site-compliance", body);
      assert.equal(response.status, 400, `body ${JSON.stringify(body)} is rejected`);
      assert.equal(((await response.json()) as { code?: string }).code, "VALIDATION_ERROR");
    }

    const persisted = await readAgentPluginActivations(workspaceRoot);
    assert.equal(persisted.plugins["site-compliance"]?.enabled, true, "an enabled plugin was NOT silently disabled by a malformed body");
  });
});

test("AGENT_PLUGIN_SET_ENABLED: requires an authenticated session", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("site-compliance", "seed-set-enabled-f");
    const { baseUrl } = await bootAuthenticated(buildTestApp(), t);

    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_A}/agent-plugins/site-compliance`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(response.status, 401);
  });
});

test("AGENT_PLUGIN_SET_ENABLED: a workspace id that does not match the route's own workspace is 404", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal("site-compliance", "seed-set-enabled-g");
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);

    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/agent-plugins/site-compliance`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(response.status, 404);
  });
});
