import { ToolInputError, type RememberedApprovalPort } from '@jini-ai/core';
import type { Clock } from '@jini-ai/core/primitives';
import type { ConversationToolApprovalStore } from '../../assistant/external-mcp-tool-approval-ports.js';

/** Adapt native escalation grants to the existing external-MCP remembered approval store.
 * Real conversations remain the persistence/revocation parents; the content store's server FK
 * cannot hold a native plugin. Identity keys are host-generated and never taken from callback input.
 * @param required.store The existing durable chat grant repository (or its shared memory fake).
 * @returns A core grant port scoped to workspace, delegating human, plugin and version/digest.
 * @throws ToolInputError if the host cannot bind a real conversation or store identity lookups.
 * @complexity One bounded SQL lookup/write; the memory adapter scans its grant rows.
 * @example createNativeApprovalMemory({ store, workspaceId, conversationIdForRun, clock });
 */
export function createNativeApprovalMemory(
  { store, workspaceId, conversationIdForRun, clock }: {
    store: ConversationToolApprovalStore; workspaceId: string; clock: Clock;
    conversationIdForRun: (required: { runId: string; principalId: string }) => string | undefined;
  }, _optional = {},
): RememberedApprovalPort {
  const coordinates = (key: string, principalId: string) => ({
    principalId, connectionId: JSON.stringify(['native-escalation', workspaceId]),
    toolName: key, fingerprint: key,
  });
  return {
    has: async ({ ctx, key }) => {
      if (!store.hasIdentity) throw new ToolInputError({ message: 'NATIVE_APPROVAL_MEMORY_UNAVAILABLE: The approval store cannot reuse identity grants. Nothing was changed.' });
      return store.hasIdentity(coordinates(key, ctx.principal.id));
    },
    grant: async ({ ctx, key, confirmer }) => {
      if (confirmer.id !== ctx.principal.id) throw new ToolInputError({ message: "NATIVE_APPROVAL_ACTOR_MISMATCH: The approval actor does not match this call. Nothing was changed." });
      const conversationId = conversationIdForRun({ runId: ctx.run.id, principalId: confirmer.id });
      if (!conversationId) throw new ToolInputError({ message: 'NATIVE_APPROVAL_CONVERSATION_REQUIRED: The human approval could not be saved to this conversation. Nothing was changed.' });
      await store.grant({ ...coordinates(key, confirmer.id), conversationId }, new Date(clock.nowMs()).toISOString());
    },
  };
}
