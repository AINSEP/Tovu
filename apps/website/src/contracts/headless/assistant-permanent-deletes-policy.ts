/** Per-site chat grant; these labels and destinations are shared by server, UI and tests.
 * A null path means Tovu has no human admin screen for this operation. */
export const PERMANENT_DELETE_TOOLS = [
  { id: "trash_empty", group: "Content purges", label: "Delete every item in Trash forever", adminPath: "/admin/trash" },
  { id: "trash_purge_item", group: "Content purges", label: "Delete one item in Trash forever", adminPath: "/admin/trash" },
  { id: "media_purge_asset", group: "Content purges", label: "Delete a trashed media file forever", adminPath: "/admin/trash" },
  { id: "comments_purge_comment", group: "Content purges", label: "Delete a comment forever", adminPath: "/admin/trash" },
  { id: "identity_user_delete", group: "Content purges", label: "Delete a trashed user account forever", adminPath: "/admin/trash" },
  { id: "deployment_ops_unset_secret", group: "Settings deletes", label: "Remove a deployment environment secret", adminPath: null },
  { id: "external_mcp_delete", group: "Settings deletes", label: "Delete an external MCP connection and its authentication", adminPath: "/admin/providers?tab=external-mcp" },
  { id: "custom_credential_delete", group: "Settings deletes", label: "Delete a saved custom provider credential", adminPath: "/admin/access-tokens?tab=access-tokens" },
  { id: "deployment_delete_provider_credential", group: "Settings deletes", label: "Delete a saved deployment provider credential", adminPath: "/admin/access-tokens?tab=access-tokens" },
  { id: "source_control_delete_credential", group: "Settings deletes", label: "Delete a saved source control credential", adminPath: "/admin/access-tokens?tab=access-tokens" },
  { id: "webhooks_delete_subscription", group: "Settings deletes", label: "Delete a webhook subscription", adminPath: "/admin/providers?tab=webhooks" },
  { id: "identity_role_delete", group: "Settings deletes", label: "Delete a custom role", adminPath: "/admin/roles" },
  { id: "identity_policy_delete", group: "Settings deletes", label: "Delete a custom policy and its permissions", adminPath: "/admin/roles" },
] as const;
export type ChatPermanentDeleteToolId = typeof PERMANENT_DELETE_TOOLS[number]["id"];
export interface AssistantPermanentDeletesPolicy { enabled: boolean; allowedToolIds: string[] }
export const ASSISTANT_PERMANENT_DELETES_NAMESPACE = "core.assistant-permanent-deletes";
export const ASSISTANT_PERMANENT_DELETES_KEY = "policy";
export const ASSISTANT_PERMANENT_DELETES_WRITE_REASON = "Only the owner can change permanent delete access through the Admin AI Assistant danger confirmation.";
export const PERMANENT_DELETE_DANGERS = [
  "Permanent deletes cannot be undone.",
  "The assistant may misjudge what you mean.",
  "You may not see everything included, such as the whole Trash. Review every row in each confirmation card.",
  "Prefer moving items to Trash so they can be restored.",
] as const;
export const DEFAULT_PERMANENT_DELETES_POLICY: AssistantPermanentDeletesPolicy = { enabled: false, allowedToolIds: [] };
/** Ordinary tools pass through; eligible permanent deletes need both switches, and forbidden tools never pass.
 * Stored grants are validated separately by the ledger reader; this pure predicate has no effects.
 * @param required - Tool id and the validated current policy.
 * @returns Whether the id belongs in this run's visible catalog.
 * @example isChatToolAllowed({ toolId: "trash_empty", policy: { enabled: false, allowedToolIds: [] } });
 * @complexity O(13) time, O(1) space. */
export function isChatToolAllowed(required: { toolId: string; policy: AssistantPermanentDeletesPolicy }, _optional = {}): boolean {
  if (required.toolId === "workspace_delete" || required.toolId === "collections_execute_cleanup") return false;
  if (!PERMANENT_DELETE_TOOLS.some(tool => tool.id === required.toolId)) return true;
  return required.policy.enabled && required.policy.allowedToolIds.includes(required.toolId);
}
/** One destination map owns disabled-tool guidance; credentials and MCP do not have Trash. */
export const PERMANENT_DELETE_GUIDANCE = "Prefer recoverable Trash. Use a permanent-delete tool only if it is available to you; each call requires a human confirmation of the exact targets. If it is unavailable, reply with a direct link to its human admin screen: " +
  PERMANENT_DELETE_TOOLS.map(tool => `${tool.id}: ${tool.adminPath ?? "there is no Tovu admin screen for this operation; say so"}`).join("; ") +
  ". Never change the owner's chat-delete setting yourself. workspace_delete and collections_execute_cleanup are never available from chat. Secrets, credentials and MCP connections have no Trash screen.";
