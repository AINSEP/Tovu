import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import type { UUID } from "@jini-ai/cms/core";

import { InMemoryExternalMcpToolApprovalRepo } from "../../assistant/external-mcp-tool-approvals.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import { createExternalMcpModule } from "../runtime/composition/modules/external-mcp.js";
import type { RouteDeps } from "../routes/types.js";
import { bootAuthenticated, loginAsBarePrincipal } from "./helpers/http-test-server.js";

/**
 * @file Route-level tests for the Integrations "Always allow" list: `GET .../mcp-servers/
 * tool-approvals` and `DELETE .../mcp-servers/:serverId/tool-approvals/:toolName` — real Express
 * app, real session auth, real HTTP.
 *
 * The properties that matter: the list shows every saved "Always allow" for this site and never the
 * stored fingerprint; a revoke removes exactly one row (so that tool asks again) and 404s on one
 * that was never saved; both sit behind the same site-owner gate as the rest of the roster.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/mcp-servers`;

function buildTestApp(): { app: express.Express; deps: RouteDeps; repo: InMemoryExternalMcpToolApprovalRepo } {
  const repo = new InMemoryExternalMcpToolApprovalRepo();
  const deps: RouteDeps = { ...createRouteDeps(), externalMcpToolApprovalRepo: repo };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createExternalMcpModule(deps).registerRoutes?.(app);
  return { app, deps, repo };
}

async function seed(repo: InMemoryExternalMcpToolApprovalRepo, serverId: string, toolName: string, workspaceId = WORKSPACE_ID) {
  await repo.upsert({
    workspaceId: workspaceId as UUID,
    serverId,
    toolName,
    fingerprint: `fp-${serverId}-${toolName}`,
    grantedByPrincipalId: "owner",
    grantedAt: "2026-09-28T10:00:00.000Z",
  });
}

function req(baseUrl: string, path: string, cookie: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", cookie } });
}

test("the list returns this site's Always-allow tools, sorted, without fingerprints", async (t) => {
  const { app, repo } = buildTestApp();
  await seed(repo, "linear", "list_issues");
  await seed(repo, "github", "search_repositories");
  await seed(repo, "github", "get_file");
  await seed(repo, "github", "other_site_tool", "some-other-site");
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await req(baseUrl, `${BASE}/tool-approvals`, cookie);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.equal(text.includes("fp-"), false, "the stored fingerprint is never sent");
  assert.deepEqual(JSON.parse(text), {
    approvals: [
      { serverId: "github", toolName: "get_file", grantedByPrincipalId: "owner", grantedAt: "2026-09-28T10:00:00.000Z" },
      { serverId: "github", toolName: "search_repositories", grantedByPrincipalId: "owner", grantedAt: "2026-09-28T10:00:00.000Z" },
      { serverId: "linear", toolName: "list_issues", grantedByPrincipalId: "owner", grantedAt: "2026-09-28T10:00:00.000Z" },
    ],
  });
});

test("revoking removes exactly that tool's Always allow, and a second revoke is 404", async (t) => {
  const { app, repo } = buildTestApp();
  await seed(repo, "github", "search_repositories");
  await seed(repo, "github", "get_file");
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const del = await req(baseUrl, `${BASE}/github/tool-approvals/search_repositories`, cookie, { method: "DELETE" });
  assert.equal(del.status, 200);
  assert.deepEqual(await del.json(), { removed: true });
  assert.equal(await repo.find({ workspaceId: WORKSPACE_ID as UUID, serverId: "github", toolName: "search_repositories" }), null);
  assert.notEqual(await repo.find({ workspaceId: WORKSPACE_ID as UUID, serverId: "github", toolName: "get_file" }), null);

  const again = await req(baseUrl, `${BASE}/github/tool-approvals/search_repositories`, cookie, { method: "DELETE" });
  assert.equal(again.status, 404);
  assert.deepEqual(await again.json(), { error: "no Always allow is saved for that tool", code: "NOT_FOUND" });
});

test("a tool name with URL-reserved characters round-trips through the revoke path", async (t) => {
  const { app, repo } = buildTestApp();
  await seed(repo, "github", "repo/search tool");
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const del = await req(baseUrl, `${BASE}/github/tool-approvals/${encodeURIComponent("repo/search tool")}`, cookie, { method: "DELETE" });
  assert.equal(del.status, 200);
  assert.deepEqual((await repo.listByWorkspaceId(WORKSPACE_ID as UUID)).length, 0);
});

test("both routes need a session, this site's workspace id, and the integrations permission", async (t) => {
  const { app, deps, repo } = buildTestApp();
  await seed(repo, "github", "get_file");
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  assert.equal((await req(baseUrl, `${BASE}/tool-approvals`, "")).status, 401);
  assert.equal((await req(baseUrl, `${BASE}/github/tool-approvals/get_file`, "", { method: "DELETE" })).status, 401);

  const other = "/api/admin/v1/workspaces/not-this-site/mcp-servers";
  assert.equal((await req(baseUrl, `${other}/tool-approvals`, cookie)).status, 404);
  assert.equal((await req(baseUrl, `${other}/github/tool-approvals/get_file`, cookie, { method: "DELETE" })).status, 404);

  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  assert.equal((await req(baseUrl, `${BASE}/tool-approvals`, bareCookie)).status, 403);
  assert.equal((await req(baseUrl, `${BASE}/github/tool-approvals/get_file`, bareCookie, { method: "DELETE" })).status, 403);
  assert.notEqual(await repo.find({ workspaceId: WORKSPACE_ID as UUID, serverId: "github", toolName: "get_file" }), null);
});

test("a composition with no Always-allow store lists nothing and revokes nothing", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps(), externalMcpToolApprovalRepo: undefined };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createExternalMcpModule(deps).registerRoutes?.(app);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const list = await req(baseUrl, `${BASE}/tool-approvals`, cookie);
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), { approvals: [] });
  assert.equal((await req(baseUrl, `${BASE}/github/tool-approvals/get_file`, cookie, { method: "DELETE" })).status, 404);
});
