import { buildPermanentDeleteDeps } from "#src/server/runtime/composition/permanent-delete-deps";
import assert from "node:assert/strict";
import test from "node:test";
import type { Express, Request, Response } from "express";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { saveExternalMcpServer } from "#src/assistant/external-mcp-store";
import { registerAdminExternalMcpListRoute } from "../list.js";
import { registerAdminExternalMcpDeleteRoute } from "../delete.js";

function response() {
  return { locals: { principal: { id: "owner" } }, statusCode: 200, body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
}

test("runtime provenance marks arbitrary connection names built-in and refuses removal", async () => {
  const base = createRouteDeps();
  const deps = { ...base, builtInExternalMcpServerIds: ["host-tools"], authorize: async () => ({ allowed: true, reason: "matched" }) };
  await saveExternalMcpServer({ repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock }, { workspaceId: deps.workspaceId, serverId: "host-tools", label: "Renamed host", transport: "stdio", command: "host-launcher", args: "", authMode: "none", enabled: true, allowedToolNames: "host_tool", writeAllowedToolNames: "", principalId: "owner" });
  await saveExternalMcpServer({ repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock }, { workspaceId: deps.workspaceId, serverId: "tovu-desktop", label: "Name alone is not ownership", transport: "stdio", command: "user-command", args: "", authMode: "none", enabled: true, allowedToolNames: "user_tool", writeAllowedToolNames: "", principalId: "owner" });
  const handlers = new Map<string, (req: Request, res: Response) => Promise<void>>();
  const app = { get: (path: string, handler: never) => handlers.set(`GET ${path}`, handler), delete: (path: string, handler: never) => handlers.set(`DELETE ${path}`, handler) } as unknown as Express;
  registerAdminExternalMcpListRoute(app, deps);
  registerAdminExternalMcpDeleteRoute(app, deps);
  await assert.rejects(buildPermanentDeleteDeps(deps).prepare("external_mcp_delete", "host-tools", "owner"), { message: "built-in MCP connections cannot be removed" });
  const listed = response();
  await handlers.get("GET /api/admin/v1/workspaces/:workspaceId/mcp-servers")!({ params: { workspaceId: deps.workspaceId } } as unknown as Request, listed as unknown as Response);
  const servers = (listed.body as { servers: { serverId: string; builtIn?: boolean }[] }).servers;
  assert.equal(servers.find(row => row.serverId === "host-tools")?.builtIn, true);
  assert.equal(servers.find(row => row.serverId === "tovu-desktop")?.builtIn, false);
  const removed = response();
  await handlers.get("DELETE /api/admin/v1/workspaces/:workspaceId/mcp-servers/:serverId")!({ params: { workspaceId: deps.workspaceId, serverId: "host-tools" } } as unknown as Request, removed as unknown as Response);
  assert.equal(removed.statusCode, 409);
  assert.equal((removed.body as { code: string }).code, "BUILT_IN_CONNECTION");
  assert.ok(await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId: "host-tools" }));
});
