import type { ComponentProps, ReactNode } from "react";
import type { ChatPane } from "@jini-ai/chat/react";

import { PushToTalkMicButton } from "../../features/voice-input/PushToTalkMicButton";
import type { UseNativeFolderPicker } from "../../features/fs-files/hooks/use-native-folder-picker.hooks";
import { FolderPathButton } from "./FolderPathButton";
import type { UseAssistantChats } from "../../hooks/use-assistant-chats.hooks";

/**
 * @file Pure prop builders `AssistantDock.tsx` hands to `ChatPane` and its header. Each one is a
 * decision the dock used to make inline in its JSX; living here they are testable on every branch
 * without rendering the whole dock.
 */

type ChatPaneProps = ComponentProps<typeof ChatPane>;

export interface OptionalChatPanePropsInput {
  /** The picker's agent list (placeholder while `listAgents` is in flight); absent when unknown. */
  readonly agents: ChatPaneProps["agents"];
  /** The active conversation's id; `null` before the first conversation exists. */
  readonly conversationId: string | null;
  /** `useConversationRefreshSignal`'s signal; absent without an active conversation. */
  readonly refreshSignal: ChatPaneProps["refreshSignal"];
  /** Recent prompt recall is local to this signed-in admin, including in a new chat. */
  readonly composerHistoryScope: string | undefined;
}

/**
 * The `ChatPane` props the dock passes only when they hold a value: an empty one is omitted
 * entirely rather than passed as `undefined`/`null`, so the pane keeps its own default.
 *
 * @param input The four optional values; each is passed on only when truthy.
 * @returns An object with exactly the keys whose values are truthy.
 * @complexity O(1).
 */
export function optionalChatPaneProps(input: OptionalChatPanePropsInput) {
  return {
    ...(input.agents ? { agents: input.agents } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.refreshSignal ? { refreshSignal: input.refreshSignal } : {}),
    ...(input.composerHistoryScope ? { composerHistoryScope: input.composerHistoryScope } : {}),
  };
}

/**
 * The composer footer's push-to-talk slot. `undefined` when voice input is switched off, which
 * omits the slot entirely rather than rendering a disabled/hidden button — see the
 * `footerLeadingAccessory` comment in `AssistantDock.tsx` and `voice-input-config.ts`.
 *
 * @param input.enabled `VOICE_INPUT_ENABLED` at the call site.
 * @param input.onTranscript Where a finished transcript is appended (`useComposerVoiceInput`).
 * @returns The mic button, or `undefined` when disabled.
 * @complexity O(1).
 */
export function voiceFooterAccessory(input: { readonly enabled: boolean; readonly onTranscript: (text: string) => void }) {
  return input.enabled ? <PushToTalkMicButton onTranscript={input.onTranscript} /> : undefined;
}

/**
 * Everything in the composer footer's `footerLeadingAccessory` slot, right after "+": the folder
 * button (only once the server confirmed it can open a folder dialog here), the picked-folder chip
 * (`PickedFolderChip`, while a folder is picked), then the mic. `undefined`
 * when neither shows, so the slot is omitted rather than rendered empty.
 *
 * @param input.folderPicker `useNativeFolderPicker`'s result.
 * @param input.voice `voiceFooterAccessory`'s result.
 * @param input.pickedFolder The rendered `PickedFolderChip`, if any.
 * @complexity O(1).
 */
export function composerFooterLeading(input: { readonly folderPicker: UseNativeFolderPicker; readonly voice: ReactNode | undefined; readonly pickedFolder?: ReactNode }) {
  if (!input.folderPicker.available && !input.pickedFolder) return input.voice;
  return (
    <>
      {input.folderPicker.available && <FolderPathButton picking={input.folderPicker.picking} onPick={input.folderPicker.pickFolder} />}
      {input.pickedFolder}
      {input.voice}
    </>
  );
}

/**
 * The header title editor's rename handler. Renames the active conversation; with no active
 * conversation there is nothing to rename (the editor is disabled then too), so it does nothing.
 *
 * @param chats The dock's conversation state; `activeId` is read when the handler runs.
 * @returns A handler taking the new title.
 * @complexity O(1).
 */
export function renameActiveConversation(chats: Pick<UseAssistantChats, "activeId" | "rename">) {
  return (title: string) => chats.activeId ? chats.rename(chats.activeId, title) : undefined;
}
