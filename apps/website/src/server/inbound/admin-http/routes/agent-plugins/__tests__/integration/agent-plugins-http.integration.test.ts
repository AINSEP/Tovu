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
import { setAgentPluginActivation } from "#src/features/agent-plugins/activation";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import {
  installAgentPlugin,
  type AgentPluginArchiveEntry,
  type AgentPluginArchiveReaderPort,
} from "#src/features/agent-plugins/install";
import { forceRemove } from "#src/features/agent-plugins/__tests__/fixtures/force-remove";
import { registerAgentPluginsListRoute } from "../../list.js";
import type { AgentPluginsRouteDeps } from "../../deps.js";

/**
 * @file `AGENT_PLUGINS_LIST` — `GET /api/admin/v1/workspaces/:workspaceId/agent-plugins`
 * (2026-09-09). Real installs through the production `installAgentPlugin` pipeline, isolated under
 * a temp `TOVU_AGENT_PLUGINS_DIR` — the same idiom
 * `agent-plugins/__tests__/integration/agent-plugin-search-tool.integration.test.ts` already
 * establishes for this identical read model, reused here rather than pointed at the real
 * `sites/tovu-com` fixture tree so this test cannot race another agent's concurrent writes to that
 * shared tree.
 *
 * Proves the wiring gap this route closes: before this route existed, the admin's Agent Plugins
 * screen had no way to read real installed-plugin state at all — `AgentPlugins.tsx` rendered a
 * hardcoded catalog instead. This test is the HTTP-level certification `list.ts` satisfies.
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

async function withAgentPluginsDir<T>(fn: (agentPluginsDir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugins-http-test-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    // A successful install freezes its published package root read-only (`install.ts`'s
    // `freezeTree`), so a plain recursive `rm` fails EACCES — see `forceRemove`'s own header.
    await forceRemove(dir);
  }
}

async function installReal(workspaceId: string, pluginId: string, files: Readonly<Record<string, string>>, archiveSeed: string) {
  const entries: AgentPluginArchiveEntry[] = Object.entries(files).map(([entryPath, content]) => fileEntry(entryPath, content));
  const archive = new Uint8Array(Buffer.from(archiveSeed));
  const digest = createHash("sha256").update(archive).digest("hex");
  return installAgentPlugin({ archive, expectedSha256: digest, archiveReader: reader(entries), layout: resolveAgentPluginLayout(), workspaceId });
}

function buildTestApp(): { app: express.Express; agentPluginsDeps: AgentPluginsRouteDeps } {
  // ONE `createRouteDeps()` call, reused for both the auth stack and the route's own deps — a
  // second independent call stands up a SEPARATE in-memory identity/policy store, which is what
  // made an earlier version of this test 403 (the owner login from `baseDeps` was never granted
  // anything against a second, disconnected `authorize` closure). Mirrors `plugins-http.integration
  // .test.ts`'s own `buildTestApp`, which threads `baseDeps.authorize` through for exactly this
  // reason.
  const baseDeps = createRouteDeps();
  const agentPluginsDeps: AgentPluginsRouteDeps = { workspaceId: baseDeps.workspaceId, authorize: baseDeps.authorize };

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, baseDeps);
  app.use("/api/admin", requireAdminSession(baseDeps));
  registerAgentPluginsListRoute(app, agentPluginsDeps);
  return { app, agentPluginsDeps };
}

test("AGENT_PLUGINS_LIST: returns real installed Agent Plugins with skills, keywords, and per-workspace enabled state", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal(
      WORKSPACE_A,
      "site-compliance",
      {
        "plugin.json": manifestJson("site-compliance", { version: "1.0.0", description: "Evidence-based compliance screening.", keywords: ["compliance", "gdpr"] }),
        "skills/site-compliance/SKILL.md": "---\nname: site-compliance\n---\n# Site Compliance\nReal skill body.",
      },
      "seed-site-compliance",
    );
    await installReal(
      WORKSPACE_A,
      "tovu-deploy-fly",
      {
        "plugin.json": manifestJson("tovu-deploy-fly", { version: "1.0.0", description: "Deploys to fly.io." }),
        "skills/tovu-deploy-fly/SKILL.md": "---\nname: tovu-deploy-fly\n---\n# Deploy to fly.io\nReal skill body.",
      },
      "seed-tovu-deploy-fly",
    );
    // Real activation state — one explicitly enabled, one explicitly disabled — so the response's
    // `enabled` field is proven to reflect this workspace's OWN record, not a constant. Both are
    // recorded explicitly rather than relying on `tovu-deploy-fly` falling back to
    // `isAgentPluginActive`'s "absent means active" default: that default exists to keep an
    // OPERATOR-installed plugin usable without an extra step, which is a different case from the
    // one this test needs (a plugin whose activation record explicitly says disabled).
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE_A).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "site-compliance", enabled: true, actor: "test" });
    await setAgentPluginActivation({ workspaceRoot, pluginId: "tovu-deploy-fly", enabled: false, actor: "test" });

    const { app } = buildTestApp();
    const { baseUrl, cookie } = await bootAuthenticated(app, t);

    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_A}/agent-plugins`, { headers: { cookie } });
    assert.equal(response.status, 200);

    const body = (await response.json()) as {
      agentPlugins: Array<{
        pluginId: string;
        version: string | null;
        description: string | null;
        keywords: string[];
        enabled: boolean;
        skills: Array<{ name: string; summary: string }>;
        mcpServerIds: string[];
      }>;
    };
    const byId = new Map(body.agentPlugins.map((p) => [p.pluginId, p]));

    assert.equal(byId.size, 2, "both real installed plugins are reported");
    assert.equal(byId.get("site-compliance")?.enabled, true);
    assert.equal(byId.get("tovu-deploy-fly")?.enabled, false, "an explicitly disabled plugin reports enabled:false, not omitted");
    assert.equal(byId.get("site-compliance")?.version, "1.0.0");
    assert.deepEqual(byId.get("site-compliance")?.keywords, ["compliance", "gdpr"]);
    assert.ok(byId.get("site-compliance")?.skills.some((s) => s.name === "site-compliance"));
  });
});

test("AGENT_PLUGINS_LIST: requires an authenticated session", async (t) => {
  await withAgentPluginsDir(async () => {
    const { app } = buildTestApp();
    const { baseUrl } = await bootAuthenticated(app, t);

    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_A}/agent-plugins`);
    assert.equal(response.status, 401);
  });
});

test("AGENT_PLUGINS_LIST: a workspace id that does not match the route's own workspace is 404", async (t) => {
  await withAgentPluginsDir(async () => {
    const { app } = buildTestApp();
    const { baseUrl, cookie } = await bootAuthenticated(app, t);

    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/agent-plugins`, { headers: { cookie } });
    assert.equal(response.status, 404);
  });
});
