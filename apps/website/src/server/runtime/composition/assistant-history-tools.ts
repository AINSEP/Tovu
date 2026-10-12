import { ToolInputError, type ToolRegistration } from '@jini-ai/core';
import { buildAssistantHistoryRegistrations, assistantHistoryDerivedRisk } from '@jini-ai/chat/store/runtime';
import type { ToolContributor } from '#src/assistant/index';
import type { RouteDeps } from '#src/server/routes/types';

export type AssistantHistoryHostDeps = Pick<RouteDeps, 'workspaceId' | 'authorize' | 'chatHistory'>;

/** Bind execution identity to the existing tenant-scope owner; an owner sees their own chats too.
 * No owner override or model-supplied principal is accepted. The same user may own different
 * sites, so workspaceId always comes from this site's composition rather than tool input.
 * @returns Generic Jini registrations over the host's authenticated history factory.
 * @throws ToolInputError when assistant use is denied. @complexity O(1) wiring.
 */
export function buildAssistantHistoryTools({ deps }: { deps: AssistantHistoryHostDeps }, _options = {}): ToolRegistration[] {
  return buildAssistantHistoryRegistrations({ ports: {
    getStore: async ({ principalId }, _optional = {}) => {
      const decision = await deps.authorize({ principalId, workspaceId: deps.workspaceId, permission: 'admin.assistant.use' });
      if (!decision.allowed) throw new ToolInputError({ message: 'Chat history is unavailable to this caller.' });
      return deps.chatHistory({ kind: 'user', workspaceId: deps.workspaceId, userId: principalId });
    },
  } }, {});
}

/** Both daemon and BYOK install the same contribution via the first-party manifest. */
export function contributeAssistantHistoryTools(_input: Record<string, never>, _options = {}): ToolContributor {
  return { domain: 'assistant-history', risk: assistantHistoryDerivedRisk, build: deps => buildAssistantHistoryTools({ deps }, {}) };
}
