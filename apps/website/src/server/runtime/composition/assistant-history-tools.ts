import { ToolInputError, type ToolRegistration } from '@jini-ai/core';
import { buildAssistantHistoryRegistrations, assistantHistoryDerivedRisk } from '@jini-ai/chat/store/runtime';
import type { ToolContributor } from '#src/assistant/index';
import type { AssistantHistoryHostDeps } from '#src/assistant/host-contracts';
export type { AssistantHistoryHostDeps } from '#src/assistant/host-contracts';

/** Bind history to the execution principal in the supplied site's dependencies.
 * @returns Jini registrations; generic target scoping supplies peer deps/principals.
 * @throws ToolInputError for denied assistant use.
 * @complexity O(1) wiring; scoped reads belong to the supplied store factory.
 */
export function buildAssistantHistoryTools({ deps }: { deps: AssistantHistoryHostDeps }, {
  buildRegistrations = buildAssistantHistoryRegistrations,
}: { buildRegistrations?: typeof buildAssistantHistoryRegistrations } = {}): ToolRegistration[] {
  /** Authorize every store acquisition using this site's permission scope. @throws ToolInputError on denial. @complexity O(1) authorization. */
  const authorize = async ({ principalId }: { principalId: string }, _optional = {}) => {
    const decision = await deps.authorize({ principalId, workspaceId: deps.workspaceId, permission: 'admin.assistant.use' });
    if (!decision.allowed) throw new ToolInputError({ message: 'Chat history is unavailable to this caller.' });
  };
  /** Keep local history scoped to the execution principal. @throws ToolInputError on denial. @complexity O(1) store binding. */
  const getStore = async ({ principalId }: { principalId: string }, _optional = {}) => {
    await authorize({ principalId }, {});
    return deps.chatHistory({ kind: 'user', workspaceId: deps.workspaceId, userId: principalId });
  };
  return buildRegistrations({ ports: { getStore } }, {});
}

/** Both daemon and BYOK install the same contribution via the first-party manifest. */
export function contributeAssistantHistoryTools(_input: Record<string, never>, _options = {}): ToolContributor {
  return { domain: 'assistant-history', risk: assistantHistoryDerivedRisk, build: deps => buildAssistantHistoryTools({ deps }, {}) };
}
