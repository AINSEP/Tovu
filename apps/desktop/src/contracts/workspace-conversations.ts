/**
 * Browser-safe contract for the fleet chat's persisted conversation threads.
 *
 * Backed by Runner's own `runner_conversations`/`runner_conversation_messages` tables
 * (`main/fleet-conversation-store.ts`), layered onto the already-open `@jini-ai/sqlite` handle
 * `project-registry.ts`'s header documents — never a second `openDatabase` call. Channel constants
 * and DTOs only, no logic.
 *
 * **Deliberately separate from `fleet-chat.ts`'s run-streaming channels, and from `RunLifecycle`
 * entirely.** A conversation here is Runner's own durable record of what was said in the fleet
 * chat; it is not the live run that produced it. `runner-daemon.ts` keeps every turn grouped under
 * one constant `FLEET_CHAT_CONTEXT_REF` regardless of which conversation is active in the renderer
 * — `RunLifecycle.start()` is never handed a conversation id, and this feature does not change
 * that. Two reasons: `RunLifecycle` keys on an opaque `contextRef` and, per that module's own doc,
 * must not be handed a product-record identifier; and a conversation row can legitimately outlive
 * every run that ever wrote to it (a reopened pane, a renamed thread), so tying run grouping to it
 * would make deleting old runs and deleting a conversation two operations that have to agree on
 * more than they need to. Conversation identity is a renderer-and-main-process-only concern, kept
 * entirely in the tables this contract describes.
 */
import type { ChatMessage } from '@jini-ai/chat/core';

export const RUNNER_CONVERSATION_CHANNELS = {
  /** Most-recently-active first. */
  list: 'runner:conversations:list',
  create: 'runner:conversations:create',
  rename: 'runner:conversations:rename',
  /** Drops the conversation row and every message in it. Irreversible. */
  delete: 'runner:conversations:delete',
  loadMessages: 'runner:conversations:load-messages',
  /** Upserts one message by id into a conversation's transcript. */
  saveMessage: 'runner:conversations:save-message',
} as const;

export interface RunnerConversationSummary {
  id: string;
  /** `null` until a first user turn auto-titles it, or the operator renames it. */
  title: string | null;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface RenameConversationInput {
  id: string;
  title: string;
}

export interface SaveConversationMessageInput {
  conversationId: string;
  message: ChatMessage;
}
