import { getWorkspaceAgentToolCatalog as sharedCatalog } from "@jini-ai/cms/workspace";
import type { AgentToolDefinition } from "@jini-ai/core";

/**
 * Extends Jini's catalog with the host's list of boot-addressable workspaces (one in v1).
 * @returns Shared tools plus the host read projection; performs no I/O.
 * @example getWorkspaceAgentToolCatalog({}, {})
 */
export function getWorkspaceAgentToolCatalog(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): AgentToolDefinition[] {
  return [...sharedCatalog().map(tool => tool.name === "workspace_get" ? { ...tool,
    inputSchema: { type: "object", additionalProperties: false, properties: { workspaceId: { type: "string", minLength: 1, description: "The current workspace id; v1 cannot address another workspace." } } },
  } : tool), {
    name: "workspace_list",
    description: "Lists the workspace addressable by this server. Returns {workspaces:[workspace]}; v1 exposes exactly the current workspace, even if other database rows exist. Requires workspace.manage. Call to discover its id before reading or renaming it; does not switch workspaces. Missing boot-bound workspace or denied permission is refused.",
    sideEffects: "none", authorization: { permission: "workspace.manage" },
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  }];
}
