import { DockHeader, type DockConversationTools, type DockHeaderProps } from "@jini-ai/admin/shell/components/AssistantDock/DockHeader";

import { ChatCleanupPanel } from "./ChatCleanupPanel";
import type { DockTranslate } from "./chat-cleanup-copy";
import type { WiredChatCleanup } from "./hooks/chat-cleanup.hooks";

export interface DockCleanupHeaderProps extends Omit<DockHeaderProps, "conversationTools"> {
  /** Required, no default: the switcher's list hooks, pins, selection and cleanup (`useDockChatCleanup` in the app). */
  readonly useChatCleanup: (required: { t: DockTranslate; locale: string; untitled: string }) => WiredChatCleanup;
}

/**
 * The dock header `DockChatPane` mounts: `@jini-ai/admin`'s `DockHeader` with the P11 chat cleanup
 * fed through its `conversationTools` slot — the switcher gets the cleanup's list hooks, pinning and
 * row ticking, and `ChatCleanupPanel` sits beside it. Delete-selected waits on the same admin
 * confirm dialog as the switcher's own delete.
 *
 * @returns The Jini header with the cleanup mounted.
 * @complexity O(1) beyond `DockHeader`'s own render.
 */
export function DockCleanupHeader({ useChatCleanup, ...header }: DockCleanupHeaderProps) {
  const chatCleanup = useChatCleanup({ t: header.t, locale: header.locale, untitled: header.chatI18n.t("Untitled") });
  const conversationTools: DockConversationTools = {
    listProps: {
      hooks: chatCleanup.listHooks,
      onTogglePin: chatCleanup.togglePin,
      selectable: chatCleanup.open,
      selectedIds: chatCleanup.selectedIds,
      onSelectionChange: chatCleanup.select,
    },
    visibleConversations: chatCleanup.visibleConversations,
    accessory: <ChatCleanupPanel cleanup={chatCleanup} confirm={header.conversationDelete.confirm} />,
  };
  return <DockHeader {...header} conversationTools={conversationTools} />;
}
