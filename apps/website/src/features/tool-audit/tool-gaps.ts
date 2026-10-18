import type { ToolGapEntry } from '@jini-ai/daemon/tool-audit';

/** Read port shared by the owner HTTP surface and assistant catalog adapter. */
export interface ToolGapReadPort {
  list(required: { workspaceId: string; principalId: string }, optional?: { limit?: number }): Promise<readonly ToolGapEntry[]>;
}
