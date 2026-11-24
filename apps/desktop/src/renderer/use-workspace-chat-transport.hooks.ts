/**
 * @file Host binding of `@jini-ai/chat/react/bridged-chat`'s `useBridgedChatTransport` for the
 * fleet chat pane: the desktop preload bridge lookup plus this app's IPC run transport
 * (`workspace-chat-transport.ts`). Runner has no HTTP server (`AGENTS.md`), so the pane's
 * attachments go through the bridge's staging uploader rather than the daemon-backed one.
 */
import { useBridgedChatTransport, type BridgedChatTransport } from '@jini-ai/chat/react/bridged-chat';
import { runnerInventoryBridge, type RunnerInventoryBridge } from './runner-api.js';
import { createWorkspaceChatTransport, type WorkspaceChatTransport } from './workspace-chat-transport.js';

/** Connects `WorkspaceChatPane` to the fleet chat transport and its bridge-backed surfaces. */
export function useWorkspaceChatTransport(
  _required: Record<string, never> = {},
  { getBridge = runnerInventoryBridge }: { getBridge?: () => RunnerInventoryBridge | undefined } = {},
): BridgedChatTransport<WorkspaceChatTransport> {
  return useBridgedChatTransport({ getBridge, createTransport: createWorkspaceChatTransport });
}
