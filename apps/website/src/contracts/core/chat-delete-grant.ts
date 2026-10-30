import { ToolInputError } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { PERMANENT_DELETE_TOOLS } from "../headless/index.js";
/** Host port carried alongside the existing authenticated human exchange. */
export type ChatDeleteSurfaceDeps = AssistantSurfaceDeps & {
  assertChatDeleteAllowed?: (required: { toolId: string; principalId?: string }, optional?: Record<string, never>) => Promise<void>;
};
/** Construct the same refusal for raw and assembled execution without another destination map.
 * @returns A safe ToolInputError containing only the tool id and canonical admin path.
 * @example throw chatDeleteRefusal({ toolId: "trash_empty" });
 * @complexity O(13) time, O(1) space; no effects. */
export function chatDeleteRefusal(required: { toolId: string }, _optional = {}): ToolInputError {
  const tool = PERMANENT_DELETE_TOOLS.find(tool => tool.id === required.toolId);
  const destination = tool?.adminPath ? `Open ${tool.adminPath} to delete it as a human.` : "There is no Tovu admin screen for this operation.";
  return new ToolInputError({ message: `${required.toolId}: permanent deletes from chat are disabled. ${destination} Nothing was deleted.` });
}
/** Freshly authorize an eligible permanent delete through the injected site port.
 * @throws ToolInputError if a required reader is missing; read/policy errors propagate.
 * @example await requireChatDeleteGrant({ surfaces, toolId: "trash_empty" });
 * @complexity O(13) lookup and one injected read, O(1) local space. */
export async function requireChatDeleteGrant(required: { surfaces: ChatDeleteSurfaceDeps; toolId: string; principalId?: string }, _optional = {}): Promise<void> {
  const tool = PERMANENT_DELETE_TOOLS.find(tool => tool.id === required.toolId);
  if (!tool) return;
  if (!required.surfaces.assertChatDeleteAllowed) throw chatDeleteRefusal({ toolId: tool.id });
  await required.surfaces.assertChatDeleteAllowed({ toolId: tool.id,
    ...(required.principalId === undefined ? {} : { principalId: required.principalId }) });
}
