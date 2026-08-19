import type { Response } from "express";

import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
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
 * `mcp-federation/trust.ts` already documents for federated CALLS: it is the existing
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
export async function guardExternalMcpRequest(
  deps: ExternalMcpRouteDeps,
  requestedWorkspaceId: unknown,
  res: Response,
): Promise<boolean> {
  if (String(requestedWorkspaceId ?? "") !== deps.workspaceId) {
    res.status(404).json({ error: "workspace was not found" });
    return false;
  }

  const principal = getAuthedPrincipal(res);
  const authResult = await deps.authorize({
    principalId: principal.id,
    permission: PERMISSION,
    workspaceId: deps.workspaceId,
    entityType: "integration",
  });
  if (!authResult.allowed) {
    res.status(403).json({
      error: `principal '${principal.id}' is not authorized for '${PERMISSION}' (${authResult.reason})`,
      code: "FORBIDDEN",
      details: { permission: PERMISSION, reason: authResult.reason },
    });
    return false;
  }

  return true;
}
