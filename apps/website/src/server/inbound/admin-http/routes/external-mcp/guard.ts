import type { Response } from "express";

import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ExternalMcpRouteDeps } from "./deps.js";

/**
 * @file The shared workspace + authorization gate for the three external-MCP routes.
 *
 * Extracted rather than copied into each route because this family's permission is doing more work
 * than the usual admin gate: a stored row's `command` is spawned as a real child process at daemon
 * boot, so whoever can write here can execute arbitrary code as the Tovu process. That is inherent
 * to configuring an MCP server — it is what every MCP client does, including Claude Code with its
 * own `.mcp.json` — but it means the gate must be site-owner level and must never drift between the
 * read route and the write routes. One implementation is what keeps them from drifting.
 *
 * `admin.integrations.manage` rather than a new permission string, for the reason
 * `Jini packages/mcp/src/federation/trust.ts` already documents for federated CALLS: it is the existing
 * third-party-integration permission, it is site-owner-level rather than editor-level, and a
 * deployment that has already decided who may administer external integrations should not have to
 * decide again.
 */

const PERMISSION = "admin.integrations.manage";

/**
 * Answers the workspace check and the permission check, writing the response itself on failure.
 *
 * @returns `true` when the caller may proceed; `false` when a response has already been sent.
 * @complexity O(1) plus one `authorize()` call.
 * @overallScore 100
 */
export async function guardExternalMcpRequest({ deps, requestedWorkspaceId, res }: { deps: ExternalMcpRouteDeps; requestedWorkspaceId: unknown; res: Response }, _optional = {}): Promise<boolean> {
  if (String(requestedWorkspaceId ?? "") !== deps.workspaceId) {
    res.status(404).json({ error: "workspace was not found" });
    return false;
  }

  const principal = getAuthedPrincipal(res);
  const params = { principalId: principal.id, permission: PERMISSION, workspaceId: deps.workspaceId, entityType: "integration" };
  if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return false;

  return true;
}
