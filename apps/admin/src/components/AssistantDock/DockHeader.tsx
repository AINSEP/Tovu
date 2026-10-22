import type { ComponentProps } from "react";
import type { useConfirmRequest } from "@jini-ai/admin/react";
import { ConversationList, ConversationTitle, type I18nAdapter } from "@jini-ai/chat/react";

import { t as translateAiAssistant } from "@/features/ai-assistant/ai-assistant-i18n";
import type { UseAssistantChats } from "../../hooks/use-assistant-chats.hooks";
import { SubagentsIndicator } from "./SubagentsIndicator";
import { DockHeaderTip } from "./DockHeaderTip";
import { DockSettingsMenu } from "./DockSettingsMenu";
import { dockSettingsMenuSections, type DockRuntimeSwitches } from "./dock-header-rules";
import { renameActiveConversation } from "./assistant-dock-props";
import type { ChatDisplayPreferencesController } from "./hooks/use-chat-display-preferences.hooks";
import type { ChatAgentPluginsController } from "./hooks/use-chat-agent-plugins.hooks";

type SubagentsIndicatorProps = ComponentProps<typeof SubagentsIndicator>;

export interface DockHeaderProps {
  /** The dock's conversation state; the switcher and the title editor drive it directly. */
  readonly chats: Pick<UseAssistantChats, "conversations" | "activeId" | "select" | "create" | "remove" | "rename">;
  /** The resolved display title (`resolveAssistantConversationTitle`), also the hover tooltip. */
  readonly activeTitle: string;
  /** The persisted execution mode and picked agent, for the subagents indicator. */
  readonly mode: SubagentsIndicatorProps["mode"];
  readonly agentId: SubagentsIndicatorProps["agentId"];
  readonly locale: string;
  /** The dock chrome's own translator (`useAssistantDockChrome().t`). */
  readonly t: (key: string) => string;
  /** `@jini-ai/chat/react`'s translator, for the delete-confirmation copy. */
  readonly chatI18n: I18nAdapter;
  /** The admin confirm-dialog request the dock renders as `<ConfirmDialog>`. */
  readonly conversationDelete: Pick<ReturnType<typeof useConfirmRequest>, "confirm">;
  readonly chatDisplay: ChatDisplayPreferencesController;
  readonly agentPlugins: ChatAgentPluginsController;
  /** The gear's Use Claude in Chrome / Prefer subagents switches, each shown only where the runtime supports it. */
  readonly runtime?: DockRuntimeSwitches & { saveFailed: boolean };
  /** Opens the advanced chat settings; absent when this admin may not open them. */
  readonly onMoreSettings: (() => void) | undefined;
  /** Whether the transcript is empty, which shows the greeting under the header row. */
  readonly empty: boolean;
}

/**
 * The dock's replacement for `ChatPane`'s default header: title, subagents indicator, conversation
 * switcher and gear in one row, plus the empty-transcript greeting. See the `header` prop's doc in
 * `AssistantDock.tsx` for why the default header is replaced at all.
 *
 * @returns The header fragment (no wrapper node of its own beyond what it always rendered).
 * @complexity O(c) in the number of conversations (one `find` for the active title).
 */
export function DockHeader({
  chats, activeTitle, mode, agentId, locale, t, chatI18n, conversationDelete, chatDisplay, agentPlugins, runtime, onMoreSettings, empty,
}: DockHeaderProps) {
  return (
    <>
      <div className="jini-chat-pane__header">
        <div className="jini-chat-pane__heading">
          {/* The "Workspace chat" eyebrow was removed (owner, 2026-10-06): title, switcher and
              close now share one row so the transcript gets that height back. */}
          {/* Was an `<h1>` — the dock mounts on every route (ADR-049, one conversation for
              the whole session), so every admin screen had two `<h1>`s: its own page title
              and this one, with no signal to a screen-reader user navigating by heading which
              was the real page title. `<h2>` inside this `aria-label="Assistant"` complementary
              region (see `App.tsx`'s `<aside>`) reads correctly as a subsection heading
              instead of competing with the page's own `<h1>`. Class names, not the element
              type, drive this component's styling (`styles/assistant.css`), so the tag change
              is visually inert. */}
          <h2 className="jini-chat-pane__title" title={activeTitle} aria-label={activeTitle}>
            <ConversationTitle
              key={chats.activeId ?? 'new'}
              title={chats.conversations.find((chat) => chat.id === chats.activeId)?.title ?? null}
              displayTitle={activeTitle}
              disabled={!chats.activeId}
              onRename={renameActiveConversation(chats)}
            />
          </h2>
        </div>
        {/* Beside the conversation switcher, not under the title (owner, 2026-10-10). */}
        <SubagentsIndicator mode={mode} agentId={agentId}
          t={(key) => translateAiAssistant({ locale, key })} />
        {/* Each header button gets the subagents icon's white tip, under it (owner, 2026-10-11). */}
        <DockHeaderTip label={t("Chats")}>
          <ConversationList
            conversations={chats.conversations}
            activeConversationId={chats.activeId}
            onSelect={chats.select}
            onCreate={chats.create}
            onDelete={chats.remove}
            // Keep the permanent-delete gate, using the admin dialog's shared focus lifecycle.
            confirmDelete={(item) => conversationDelete.confirm({ dialog: {
              title: chatI18n.t("Delete conversation"),
              body: chatI18n.t('Delete "{title}"? This cannot be undone.', { title: item.title ?? chatI18n.t("Untitled") }),
              confirmLabel: chatI18n.t("Delete conversation"),
              tone: "danger",
            } })}
            onRename={chats.rename}
            // The white "Chats" tip above replaces the browser's dark native one, so the
            // switcher drops its own `title` and takes the same name for screen readers.
            triggerLabel={t("Chats")}
            nativeTitle={false}
          />
        </DockHeaderTip>
        {/* Right of the switcher; the bar's ✕ (App.tsx) sits to its right. */}
        <DockHeaderTip label={t("Settings")}>
          <DockSettingsMenu label={t("Settings")} sections={dockSettingsMenuSections({ t }, { display: chatDisplay, agentPlugins, runtime, onMoreSettings })}
            notice={chatDisplay.saveFailed || agentPlugins.saveFailed || runtime?.saveFailed ? t("Couldn't save. This choice lasts until you reload.") : undefined} />
        </DockHeaderTip>
      </div>
      {empty ? (
        <div className="assistant-empty-state" role="status">
          <p>{t("Hello! Ask me to help with your site.")}</p>
        </div>
      ) : null}
    </>
  );
}
