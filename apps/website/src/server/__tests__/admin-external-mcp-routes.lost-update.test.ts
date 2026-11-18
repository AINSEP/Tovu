import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import { createExternalMcpModule } from "../runtime/composition/modules/external-mcp.js";
import type { RouteDeps } from "../routes/types.js";
import { bootAuthenticated, startTestServer } from "./helpers/http-test-server.js";

/**
 * @file Lost updates on `PUT /mcp-servers/:serverId` (design S1, rule M6): the body may carry the
 * `version` the admin tab loaded; a save from an older screen is a 409 with the shared body, a
 * malformed one a 400 (never read as "no basis"), and the list returns `version` for every server.
 */

const BASE = "/api/admin/v1/workspaces/workspace-local/mcp-servers";
const body = { label: "GitHub", transport: "stdio", enabled: true, command: "npx", args: "-y server", allowedToolNames: "search" };

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = express();
  app.use(express.json());
  registerAuthRoutes({ app, deps });
  app.use("/api/admin", requireAdminSession(deps));
  createExternalMcpModule(deps).registerRoutes?.({ app });
  return { app, deps };
}
const put = (baseUrl: string, cookie: string, payload: unknown) => fetch(`${baseUrl}${BASE}/github`, { method: "PUT", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(payload) });

test("a PUT from an old screen is a 409 with both versions and the first save stays; the list carries version", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const created = await put(baseUrl, cookie, body);
  assert.equal(created.status, 200);
  assert.equal(((await created.json()) as { server: { version: number } }).server.version, 1);

  assert.equal((await put(baseUrl, cookie, { ...body, label: "Writer 1", expectedVersion: 1 })).status, 200);
  const stale = await put(baseUrl, cookie, { ...body, label: "Writer 2", expectedVersion: 1 });
  assert.equal(stale.status, 409);
  const conflict = await stale.json() as { code: string; details: { recordKind: string; recordId: string; expectedVersion: number; currentVersion: number } };
  assert.equal(conflict.code, "VERSION_CONFLICT");
  assert.deepEqual(conflict.details, { recordKind: "MCP server", recordId: "github", expectedVersion: 1, currentVersion: 2 });

  const list = await (await fetch(`${baseUrl}${BASE}`, { headers: { cookie } })).json() as { servers: { label: string; version: number }[] };
  assert.deepEqual(list.servers.map(s => [s.label, s.version]), [["Writer 1", 2]]);
});

test("a malformed expectedVersion is a 400, never read as no basis", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await put(baseUrl, cookie, body);
  const response = await put(baseUrl, cookie, { ...body, label: "Changed", expectedVersion: "1" });
  assert.equal(response.status, 400);
  assert.equal(((await response.json()) as { code: string }).code, "VALIDATION_ERROR");
  const list = await (await fetch(`${baseUrl}${BASE}`, { headers: { cookie } })).json() as { servers: { label: string }[] };
  assert.equal(list.servers[0]?.label, "GitHub");
});
