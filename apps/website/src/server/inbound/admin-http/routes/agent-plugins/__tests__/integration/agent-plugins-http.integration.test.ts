import { resolveSiteRoot } from "#src/platform/site-dir/index";
import "../../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import { testSiteLayoutContext } from "#src/__tests__/fixtures/site-layout-context";

// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
import { agentPluginActivations } from "../../../../../../../features/agent-plugins/activation-effects.js";
const { setAgentPluginActivation } = agentPluginActivations;
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { registerAuthRoutes, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated, createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";

import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import {
  installAgentPlugin,
  type AgentPluginArchiveEntry,
  type AgentPluginArchiveReaderPort,
} from "../../../../../../../features/agent-plugins/lifecycle.js";
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

function manifestJson(name: string, fields: { version?: string; description?: string; keywords?: readonly string[]; extensions?: unknown } = {}): string {
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
  return installAgentPlugin({ archive, expectedSha256: digest, archiveReader: reader(entries), layout: resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }), workspaceId });
}

function buildTestApp(): { app: express.Express; agentPluginsDeps: AgentPluginsRouteDeps } {
  // ONE `createRouteDeps()` call, reused for both the auth stack and the route's own deps — a
  // second independent call stands up a SEPARATE in-memory identity/policy store, which is what
  // made an earlier version of this test 403 (the owner login from `baseDeps` was never granted
  // anything against a second, disconnected `authorize` closure). Mirrors `plugins-http.integration
  // .test.ts`'s own `buildTestApp`, which threads `baseDeps.authorize` through for exactly this
  // reason.
  const baseDeps = createRouteDeps();
  const agentPluginsDeps: AgentPluginsRouteDeps = testSiteLayoutContext({
    tracker: createNoopTracker({}),
    // Pin the port so failure injection and the request use the same layout object.
    agentPluginLayout: resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }),
    workspaceId: baseDeps.workspaceId,
    authorize: baseDeps.authorize,
    clock: baseDeps.clock,
    externalMcpServerRepo: baseDeps.externalMcpServerRepo,
    siteAssistantSecretSealer: baseDeps.siteAssistantSecretSealer,
    siteAssistantSecretKeyring: baseDeps.siteAssistantSecretKeyring,
  });

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
      "example-host-deploy",
      {
        "plugin.json": manifestJson("example-host-deploy", { version: "1.0.0", description: "Deploys to example-host.io.", extensions: { tovu: { displayName: "  Deploy Online  ", summary: "\n Puts your site online.\n\nOne click.  " } } }),
        "skills/example-host-deploy/SKILL.md": "---\nname: example-host-deploy\n---\n# Deploy to example-host.io\nReal skill body.",
      },
      "seed-example-host-deploy",
    );
    // Real activation state — one explicitly enabled, one explicitly disabled — so the response's
    // `enabled` field is proven to reflect this workspace's OWN record, not a constant. Both are
    // recorded explicitly rather than relying on `example-host-deploy` falling back to
    // `isAgentPluginActive`'s "absent means active" default: that default exists to keep an
    // OPERATOR-installed plugin usable without an extra step, which is a different case from the
    // one this test needs (a plugin whose activation record explicitly says disabled).
    const workspaceRoot = resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }).forWorkspace(WORKSPACE_A).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "site-compliance", enabled: true, actor: "test" });
    await setAgentPluginActivation({ workspaceRoot, pluginId: "example-host-deploy", enabled: false, actor: "test" });

    const { app, agentPluginsDeps } = buildTestApp();
    const { baseUrl, cookie } = await bootAuthenticated(app, t);

    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_A}/agent-plugins`, { headers: { cookie } });
    assert.equal(response.status, 200);

    const body = (await response.json()) as {
      agentPlugins: Array<{
        pluginId: string;
        displayName: string | null;
        summary: string | null;
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
    assert.equal(byId.get("example-host-deploy")?.enabled, false, "an explicitly disabled plugin reports enabled:false, not omitted");
    assert.equal(byId.get("site-compliance")?.version, "1.0.0");
    assert.deepEqual(byId.get("site-compliance")?.keywords, ["compliance", "gdpr"]);
    assert.equal(byId.get("example-host-deploy")?.displayName, "Deploy Online", "extensions.tovu.displayName reaches the wire, trimmed");
    assert.equal(byId.get("site-compliance")?.displayName, null, "no display name sends null so the admin title-cases the id");
    assert.equal(byId.get("example-host-deploy")?.summary, "Puts your site online.\n\nOne click.", "extensions.tovu.summary reaches the wire, trimmed, paragraph breaks kept");
    assert.equal(byId.get("example-host-deploy")?.description, "Deploys to example-host.io.", "the agent-facing description is untouched by the summary");
    assert.equal(byId.get("site-compliance")?.summary, null, "no summary sends null so the admin shows the description");
    assert.ok(byId.get("site-compliance")?.skills.some((s) => s.name === "site-compliance"));
    agentPluginsDeps.authorize = async () => ({ allowed: false, reason: "no_grant" });
    const denied = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_A}/agent-plugins`, { headers: { cookie } });
    assert.equal(denied.status, 403);
    const denial = await denied.json();
    assert.equal(denial.code, "FORBIDDEN");
    assert.deepEqual(denial.details, { permission: "admin.plugins.read", reason: "no_grant" });
    assert.equal(denial.agentPlugins, undefined);
    assert.ok(!JSON.stringify(denial).includes("site-compliance"));

  });
});

test("AGENT_PLUGINS_LIST: absent version and description are explicit nulls", async (t) => {
  await withAgentPluginsDir(async () => {
    await installReal(WORKSPACE_A, "minimal-plugin", { "plugin.json": manifestJson("minimal-plugin") }, "seed-minimal-plugin");
    const { app } = buildTestApp();
    const { baseUrl, cookie } = await bootAuthenticated(app, t);

    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_A}/agent-plugins`, { headers: { cookie } });

    assert.equal(response.status, 200);
    const { agentPlugins } = await response.json() as { agentPlugins: Array<{ pluginId: string; version: string | null; description: string | null }> };
    const plugin = agentPlugins.find(({ pluginId }) => pluginId === "minimal-plugin");
    assert.ok(plugin, "the installed plugin must be listed");
    assert.equal(plugin.version, null);
    assert.equal(plugin.description, null);
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


test("AGENT_PLUGINS_LIST: discovery failure is redacted", async (t) => {
  const { app, agentPluginsDeps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const fault = t.mock.method(agentPluginsDeps.agentPluginLayout, "forWorkspace", () => { throw new Error("private /secret/packages"); });
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_A}/agent-plugins`, { headers: { cookie } });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "internal error", code: "INTERNAL_ERROR" });
  assert.equal(fault.mock.callCount(), 1);
});

test("AGENT_PLUGINS_LIST: rows carry origin, host compatibility, unmet and dependent capabilities, and the installed digest", async (t) => {
  await withAgentPluginsDir(async () => {
    const tovu = (extension: Record<string, unknown>) => ({ version: "1.0.0", extensions: { tovu: extension } });
    const future = await installReal(WORKSPACE_A, "future-only", { "plugin.json": manifestJson("future-only", tovu({ hostRange: ">=99" })) }, "seed-list-future");
    await installReal(WORKSPACE_A, "needs-db", { "plugin.json": manifestJson("needs-db", tovu({ requires: ["db:query"] })) }, "seed-list-needs");
    await installReal(WORKSPACE_A, "consumer", { "plugin.json": manifestJson("consumer", tovu({ requires: ["mail:send"] })) }, "seed-list-consumer");
    await installReal(WORKSPACE_A, "mailer", { "plugin.json": manifestJson("mailer", tovu({ provides: ["mail:send"] })) }, "seed-list-mailer");

    const { app } = buildTestApp();
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_A}/agent-plugins`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const { agentPlugins } = (await response.json()) as { agentPlugins: Array<{ pluginId: string; origin: string; hostOk: boolean; missingRequires: string[]; requiredBy: string[]; archiveDigest: string }> };
    const row = (id: string) => agentPlugins.find((plugin) => plugin.pluginId === id)!;

    assert.equal(row("future-only").hostOk, false);
    assert.equal(row("future-only").origin, "operator-installed");
    assert.equal(row("future-only").archiveDigest, future.archiveDigest);
    assert.equal(row("needs-db").hostOk, true);
    assert.deepEqual(row("needs-db").missingRequires, ["db:query"]);
    assert.deepEqual(row("consumer").missingRequires, [], "an enabled provider satisfies the requirement");
    assert.deepEqual(row("mailer").requiredBy, ["consumer needs mail:send"]);
    assert.deepEqual(row("needs-db").requiredBy, []);
  });
});

/**
 * `String(req.params.workspaceId ?? "")` (extractRouteHandler's own doc, `helpers/http-test-server.ts`):
 * Express guarantees a matched `:workspaceId` is always populated, so the right side of that `??` is
 * unreachable through any real HTTP request. Restored 2026-09-03 after being wrongly deleted as
 * "unreachable dead code" -- the repo's established answer is to KEEP the guard and exercise it with a
 * hand-built `req` that deliberately violates that contract.
 */
test("AGENT_PLUGINS_LIST: `req.params.workspaceId ?? \"\"` fallback, forced via a direct handler call, is the workspace 404", async () => {
  const { app } = buildTestApp();
  const handler = extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/agent-plugins");
  const { res, capture } = createCapturingResponse();

  await handler({ params: {} }, res);

  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "workspace was not found" } });
});
