import { PERMANENT_DELETE_TOOLS, type AssistantPermanentDeletesPolicy } from '../contracts/headless/index.js';

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
