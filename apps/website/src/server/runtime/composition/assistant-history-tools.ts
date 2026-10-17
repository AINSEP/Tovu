import { ToolInputError, type ToolRegistration } from '@jini-ai/core';
import { buildAssistantHistoryRegistrations, assistantHistoryDerivedRisk } from '@jini-ai/chat/store/runtime';
import type { ToolContributor } from '#src/assistant/index';
import type { RouteDeps } from '#src/server/routes/types';

export type AssistantHistoryHostDeps = Pick<RouteDeps, 'workspaceId' | 'authorize' | 'chatHistory' | 'ownerPrincipalId' | 'siteChatHistory'>;

/** Bind execution identity to local history and owner-only registered-site history.
 * @returns Jini registrations; site authorization always precedes registry access.
 * @throws ToolInputError for denied assistant use or cross-site reads by a non-owner.
 * @complexity O(1) wiring; registry discovery and scoped reads belong to the host port.
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
  /** Require the seeded installation owner, never an admin role or model identity. @throws ToolInputError on refusal. @complexity O(1). */
  const authorizeSiteHistory = async ({ principalId }: { principalId: string }, _optional = {}) => {
    await authorize({ principalId }, {});
    if (principalId !== await deps.ownerPrincipalId) throw new ToolInputError({ message: "Only this installation's owner can read other sites' chats." });
  };
  const host = deps.siteChatHistory;
  const siteHistory = {
    /** Authorize before discovering names. @throws ToolInputError on refusal. @complexity O(n) host registry discovery. */
    listSiteNames: async ({ principalId }: { principalId: string }, _optional = {}) => {
      await authorizeSiteHistory({ principalId }, {});
      return host!.listSiteNames({ principalId }, {});
    },
    /** Authorize before any registry/disk read; a current-site name retains local scope/lifetime.
     * @throws ToolInputError on refusal. @complexity O(n) host name resolution plus scoped reads.
     */
    openStore: async ({ principalId, siteName }: { principalId: string; siteName: string }, _optional = {}) => {
      await authorizeSiteHistory({ principalId }, {});
      if (host!.isCurrentSite({ siteName }, {})) return { store: await getStore({ principalId }, {}), close: () => {} };
      return host!.openStore({ principalId, siteName }, {});
    },
  };
  const ports = { getStore, ...(deps.siteChatHistory ? { siteHistory } : {}) };
  return buildRegistrations({ ports }, {});
}

/** Both daemon and BYOK install the same contribution via the first-party manifest. */
export function contributeAssistantHistoryTools(_input: Record<string, never>, _options = {}): ToolContributor {
  return { domain: 'assistant-history', risk: assistantHistoryDerivedRisk, build: deps => buildAssistantHistoryTools({ deps }, {}) };
}
