import { useMemo } from "react";
import { defaultAssistantChatsPort } from "@/hooks/assistant-chats-dependencies.hooks";
import type { AssistantChatsPort } from "@/hooks/assistant-chats-port.hooks";

/** Binds the selected admin chat's existing loader and browser event ports; Jini owns refresh and disposal. */
export function useConversationRefreshSignal(
  { conversationId, port = defaultAssistantChatsPort }: { conversationId: string | null; port?: Pick<AssistantChatsPort, "loadMessages"> },
  { visibility = document, focus = window }: { visibility?: EventTarget & { readonly visibilityState: string }; focus?: EventTarget } = {},
) {
  return useMemo(() => conversationId ? { loadMessages: () => port.loadMessages(conversationId), visibility, focus } : undefined, [conversationId, port, visibility, focus]);
}
