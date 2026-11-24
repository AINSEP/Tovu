/**
 * @file Host binding of `@jini-ai/chat/react/conversations`' `useStoredConversations` for the fleet
 * chat: its persisted threads live in Runner's own `runner_conversations`/`runner_conversation_messages`
 * tables, reached over IPC through the preload bridge (`fleet-conversation-store.ts` on the main
 * side). Every rule and race guard — and the reasoning behind each — lives in Jini's
 * `createConversationController`; this module only supplies the bridge lookup and the log label.
 */
import { useStoredConversations, type UseStoredConversations } from '@jini-ai/chat/react/conversations';
import { runnerInventoryBridge, type BridgeLookup } from './runner-api.js';
import type { WorkspaceConversationSummary } from '../contracts/workspace-conversations.js';

/** What `useRunnerConversations` returns: Jini's shape over this app's conversation summary DTO. */
export type UseRunnerConversations = UseStoredConversations<WorkspaceConversationSummary>;

/** Module-level (stable identity) so the controller is never rebuilt by a new log function. Looks
 *  `console.error` up at call time, so a test spying on it sees each failure. */
function logFleetChatFailure(...args: unknown[]): void {
  console.error('tovu-runner: fleet chat —', ...args);
}

/** The fleet chat's persisted conversation threads, bound to the desktop bridge. */
export function useRunnerConversations(
  _required: Record<string, never> = {},
  { getBridge = runnerInventoryBridge }: {
    getBridge?: BridgeLookup<'listConversations' | 'loadConversationMessages' | 'createConversation'
      | 'deleteConversation' | 'renameConversation' | 'saveConversationMessage'>;
  } = {},
): UseRunnerConversations {
  return useStoredConversations({ getStore: getBridge }, { log: logFleetChatFailure });
}
