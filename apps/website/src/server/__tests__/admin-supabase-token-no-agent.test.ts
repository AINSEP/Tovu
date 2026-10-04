import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import express from "express";

import { readEnabledExternalMcpConfigs } from "../../assistant/index.js";

import { provisionAgentPluginMcpServers } from "../../features/agent-plugins/federate-mcp.js";
import { parseAgentPluginMcpConfig } from "../../features/agent-plugins/mcp-metadata.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import { createExternalMcpModule } from "../runtime/composition/modules/external-mcp.js";
import { bootAuthenticated } from "./helpers/http-test-server.js";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

/**
 * @file Supabase works from the admin UI with NO AI agent involved (owner requirement, 2026-09-29,
 * when `features/supabase-connect/` left core for the `supabase` agent plugin).
 *
 * The admin's Settings → External MCP panel pastes an access token through the generic
 * `PUT /mcp-servers/:serverId` route. This drives that route over real HTTP with a real admin
 * session against the row the bundled `supabase` plugin provisions from its own `mcp.json` — with
 * no tool registry, no daemon, and no assistant tool contributors installed — and proves the saved
 * token reaches Supabase's hosted server as a Bearer header.
 */

const WORKSPACE_ID = "workspace-local";
const TOKEN = "sbp_no_agent_token_must_never_echo";
const SUPABASE_MCP_JSON = path.resolve(import.meta.dirname, "../../../../../content/agent-plugins/supabase/mcp.json");

async function buildAdminOnlyApp() {
  const deps = createRouteDeps();
  await deps.identityReady;
  const parsed = parseAgentPluginMcpConfig({ value: JSON.parse(await readFile(SUPABASE_MCP_JSON, "utf8")) });
  assert.ok(parsed.ok);
  // Exactly what enabling the bundled plugin does at boot (`federate-mcp.ts`), no agent involved.
  await provisionAgentPluginMcpServers(
    { repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
    { workspaceId: deps.workspaceId, pluginId: "supabase", servers: parsed.config.servers, principalId: "system:test" },
  );

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createExternalMcpModule(deps).registerRoutes?.(app);
  const supabase = parsed.config.servers.supabase;
  assert.ok(supabase && supabase.type !== "stdio");
  return { app, deps, pluginUrl: supabase.url };
}

test("with no agent running, an admin pastes a Supabase access token in Settings and the connection uses it", async (t) => {
  const { app, deps, pluginUrl } = await buildAdminOnlyApp();
  assert.equal(contributions.contributors.list({}).length, 0, "no assistant tool is installed in this process");
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/mcp-servers`;

  const before = await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId: "supabase" });
  assert.equal(before?.provisionedByPluginId, "supabase", "the plugin provisions the row the Settings panel edits");

  const put = await fetch(`${base}/supabase`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      transport: "streamable_http",
      url: pluginUrl,
      authMode: "static_env",
      accessToken: TOKEN,
      enabled: true,
      allowedToolNames: "list_projects,list_tables,execute_sql",
      writeAllowedToolNames: "",
    }),
  });
  const putText = await put.text();
  assert.equal(put.status, 200, putText);
  assert.ok(!putText.includes(TOKEN), "the token never comes back in the save response");

  const list = await fetch(base, { headers: { cookie } });
  const listText = await list.text();
  assert.equal(list.status, 200);
  assert.ok(!listText.includes(TOKEN), "the token never comes back in the Settings list");
  const row = (JSON.parse(listText) as { servers: { serverId: string; authMode: string; enabled: boolean }[] }).servers.find((s) => s.serverId === "supabase");
  assert.deepEqual({ authMode: row?.authMode, enabled: row?.enabled }, { authMode: "static_env", enabled: true });

  const { configs } = await readEnabledExternalMcpConfigs({ repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer }, deps.workspaceId);
  const target = configs.find((c) => c.serverId === "supabase")?.target;
  assert.ok(target && target.kind === "streamable_http");
  assert.equal(target.url, pluginUrl);
  assert.deepEqual(target.headers, { authorization: `Bearer ${TOKEN}` });
});

test("the Settings token route refuses a request with no admin session", async (t) => {
  const { app } = await buildAdminOnlyApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const put = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/mcp-servers/supabase`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transport: "streamable_http", authMode: "static_env", accessToken: TOKEN }),
  });
  assert.equal(put.status, 401);
});
