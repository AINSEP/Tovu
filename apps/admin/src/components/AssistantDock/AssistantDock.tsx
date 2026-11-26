import "@jini-ai/chat/react/styles/chat-settings.css";
import { bindAssistantDock } from "@jini-ai/admin/shell/components/AssistantDock/AssistantDock";
import { bindAssistantDockState } from "@jini-ai/admin/shell/components/AssistantDock/AssistantDock.state.hooks";
import { bindDockChatPane } from "@jini-ai/admin/shell/components/AssistantDock/DockChatPane";
import { ChatPane, ChatSettingsDialog, ConversationTitle, JiniChatProvider, createMidRunMessagePoster, useChatSettingsDialog, useT } from "@jini-ai/chat/react";
import { isTerminalRunStatus, type ChatMessage } from "@jini-ai/chat/core";
import { ConfirmDialog, useConfirmRequest } from "@jini-ai/admin/react";
import { publishContentRefresh } from "@jini-ai/admin/shell/lib/content-refresh-bus";
import { publishSettingsRefresh } from "@jini-ai/admin/shell/lib/settings-refresh-bus";
import { subscribeToAdminPageSurfaces } from "@jini-ai/admin/shell/lib/admin-frontend-session";
import { useNativeFolderPicker } from "@jini-ai/admin/screens/fs-files/use-native-folder-picker.hooks";
import { useConversationRefreshSignal } from "@jini-ai/admin/shell/components/AssistantDock/hooks/conversation-refresh.hooks";
import { replaceBrowserQuery } from "@jini-ai/admin/shell/hooks/use-conversation-deep-link";
import { useSelectedSkills, useComposerDiscoveryDraft, useSkillOnlySend } from "@jini-ai/admin/screens/plugins/composer-skills.hooks";
import { useAssistantEmptyState } from "@jini-ai/admin/shell/components/AssistantDock/hooks/use-assistant-empty-state.hooks";
import { useSelectedAgentAuthWarning } from "@jini-ai/admin/shell/components/AssistantDock/hooks/use-selected-agent-auth-warning.hooks";
import { useComposerSendStopGuard } from "@jini-ai/admin/shell/components/AssistantDock/hooks/use-composer-send-stop-guard.hooks";
import { useAgentFailureSurface } from "@jini-ai/admin/shell/components/AssistantDock/AgentFailureCard.hooks";
import { selectedLocalCliReasoning, hasUsableAdminKey } from "@jini-ai/admin/shell/lib/execution-settings-ledger";
import { useMessagesChangeHandler } from "@jini-ai/admin/shell/components/AssistantDock/hooks/messages-change.hooks";
import { useRunContext } from "@jini-ai/admin/shell/components/AssistantDock/hooks/run-context.hooks";
import { useSkillAwareAttachmentUploader } from "@jini-ai/admin/shell/components/AssistantDock/hooks/composer-files.hooks";
import { useSelectedAgentPlugins, useSelectedPluginChips } from "@jini-ai/admin/shell/components/AssistantDock/hooks/selected-agent-plugins.hooks";
import { useLocalCliDaemonPrewarm } from "@jini-ai/admin/shell/components/AssistantDock/hooks/assistant-transport.hooks";
import { DockCleanupHeader } from "@jini-ai/admin/shell/components/AssistantDock/DockCleanupHeader";
import { SkillInstallConfirmation } from "@jini-ai/admin/screens/skills/SkillInstallConfirmation";
import { VOICE_INPUT_ENABLED } from "@jini-ai/admin/screens/voice-input/voice-input-config";
import { useAssistantPromptRequests } from "@jini-ai/admin/shell/lib/assistant-prompt-bus";
import { ChatCleanupPanel } from "@jini-ai/chat/react/chat-cleanup/ChatCleanupPanel";
import { nativeFolderPickerDeps } from "../../features/fs-files/api/fs-files-api";
import { useChatDisplayPreferences } from "./chat-display-preferences.adapter";
import { useChatAgentPluginsPreference } from "./chat-agent-plugin-preferences.adapter";
import { useAssistantRuntimePreferencesPreference } from "./assistant-runtime-preferences.adapter";
import { useDockAgentPermissions, useWiredAssistantSubagentsSettings } from "../../features/ai-assistant/hooks/use-admin-subagents.hooks";
import { lookupOwnedConversation } from "../../features/routines/use-conversation-deep-link";
import { defaultAssistantChatsPort, useDockChatCleanup } from "../../hooks/assistant-chats-dependencies.hooks";
import { useDockRendererRegistry } from "./hooks/use-dock-renderer-registry.hooks";
import { agUiApprovalPoster } from "../../lib/assistant-transport-ag-ui";
import { useTovuDockExecution } from "../../hooks/use-tovu-execution-adapters.hooks";
import { selectedAgentWarning, isDesktopAdmin } from "../../features/settings/ai-agent-presentation";
import { useAdminBrowserAgentSettings } from "../../features/webmcp/browser-agent-settings.hooks";
import { useSkillInstall } from "../../features/skills/skills-host.hooks";
import { useComposerVoiceInput } from "../../features/voice-input/hooks/use-composer-voice-input.hooks";
import { createExecutionPort } from "../../lib/execution-settings";
import { useAssistantDockChrome, resolveAssistantConversationTitle, useChatsSeam } from "./hooks/dock-chrome.hooks";
import { useAttachmentUploaderSeam, useAttachmentValidatorSeam, useFolderDropBridge, TOVU_LEGACY_MANIFEST_NAMES } from "./hooks/composer-files.hooks";
import { useComposerCapabilitiesSeam, useComposerDiscoverySelect } from "./hooks/composer-discovery.hooks";
import { useTovuAssistantTransport } from "./hooks/assistant-transport.binding";
import { useAgentsPlaceholder, useRuntimeAccess } from "./hooks/runtime-access.hooks";
import { useByokRuntimeSeam } from "./hooks/byok-runtime.hooks";
import { useExecutionConfig } from "./hooks/execution-config.hooks";
import { useLocalCliSelectionSeam } from "./hooks/local-cli-selection.hooks";
import { t as translateMedia } from "../../features/media/media-i18n";
import { t as translateAiAssistant } from "../../features/ai-assistant/ai-assistant-i18n";
import { PushToTalkMicButton } from "../../features/voice-input/PushToTalkMicButton";
import { createAdminTypedAnswerPoster, onTovuSecretRedacted } from "../../lib/shell-collaborators";
import { SKILL_INSTALL_CONFIRMATION_HOST } from "../../features/skills/skill-install-confirmation-host";
import "../../styles/assistant.css";
// The runtime picker's BYOK model row renders `@jini-ai/ui`'s `SearchableModelSelect`, whose
// styles (including the body-portaled `.jini-select-menu`) live in this sheet. The settings
// screens import it too, but the dock is mounted on every admin route — relying on a screen the
// operator may never open would leave the dropdown unstyled exactly when it is used most.
import "@jini-ai/ui/settings-dialog.css";

declare global {
  interface Window {
    /**
     * Debug-only live transcript mirror, driven by `ChatPane`'s `onMessagesChange` — lets a test
     * driver (Playwright, etc.) read exactly what the pane rendered (including every
     * `tool_use`/`tool_result` event) without scraping the DOM. Not a security surface: it only
     * ever holds the current admin's own already-visible conversation.
     */
    __tovuAssistantMessages?: ChatMessage[];
  }
}

const useAssistantDockState = bindAssistantDockState({
  kit: { ChatPane },
  hooks: {
    useDockRendererRegistry,
    useAdminBrowserAgentSettings,
    useChrome: useAssistantDockChrome,
    useConfirmRequest,
    useChatDisplayPreferences,
    useChatAgentPlugins: useChatAgentPluginsPreference,
    useAssistantRuntimePreferences: useAssistantRuntimePreferencesPreference,
    useChatSettingsDialog,
    useDockAgentPermissions,
    useExecutionConfig,
    useDockExecutionPolicy: useTovuDockExecution,
    usePrewarm: useLocalCliDaemonPrewarm,
    useByokRuntimeSeam,
    useLocalCliSelectionSeam,
    useChatsSeam,
    useAssistantTransport: useTovuAssistantTransport,
    useAttachmentUploaderSeam,
    useAttachmentValidatorSeam,
    useSkillInstall,
    useSkillUploader: useSkillAwareAttachmentUploader,
    useRuntimeAccess,
    useAgentsPlaceholder,
    useSelectedAgentAuthWarning,
    useComposerCapabilitiesSeam,
    usePins: useSelectedAgentPlugins,
    useSelectedSkills,
    useComposerDiscoveryDraft,
    useComposerSendStopGuard,
    useDiscoverySelect: useComposerDiscoverySelect,
    useChips: useSelectedPluginChips,
    useComposerVoiceInput,
    useAssistantPromptRequests,
    useSkillOnlySend,
    useDropBridge: useFolderDropBridge,
    useNativeFolderPicker,
    useMessages: useMessagesChangeHandler,
    useContext: useRunContext,
    useAgentFailureSurface,
    useAssistantEmptyState,
    useConversationRefreshSignal,
  },
  deps: {
    agUiApprovals: agUiApprovalPoster,
    translateMedia,
    legacyManifestNames: TOVU_LEGACY_MANIFEST_NAMES,
    createExecutionPort,
    selectedAgentWarning,
    nativeFolderPickerDeps,
    selectedLocalCliReasoning,
    MESSAGE_CHANGE_DEPS: { isTerminalRunStatus },
    publishMessages: (messages) => window.__tovuAssistantMessages = messages,
    publishSettingsRefresh,
    publishContentRefresh,
    resolveAssistantConversationTitle,
    defaultAssistantChatsPort,
    lookupOwnedConversation,
    replaceBrowserQuery,
    assistantTitleKey: "Tovu assistant",
  },
});

const DockChatPane = bindDockChatPane({
  kit: {
    JiniChatProvider,
    ChatSettingsDialog,
    ConversationTitle,
    DockCleanupHeader,
    ChatCleanupPanel: (props) => <ChatCleanupPanel {...props} cleanup={props.cleanup as ReturnType<typeof useDockChatCleanup>} />,
    SkillInstallConfirmation,
    ConfirmDialog,
    PushToTalkMicButton,
    chat: { useT },
  },
  hooks: { useDockChatCleanup, useWiredAssistantSubagentsSettings },
  deps: {
    createAdminTypedAnswerPoster,
    createMidRunMessagePoster,
    fetch,
    baseUrl: "",
    onSecretRedacted: onTovuSecretRedacted,
    subscribeToAdminPageSurfaces,
    translateAiAssistant,
    skillInstallConfirmationHost: SKILL_INSTALL_CONFIRMATION_HOST,
    voiceInputEnabled: VOICE_INPUT_ENABLED,
    isDesktopAdmin,
    hasUsableAdminKey,
    assistantTitleKey: "Tovu assistant",
    folderWindowNoteKey: "Folder window opened on the computer running Tovu",
    localCliDataAttribute: "data-tovu-local-cli",
  },
});

export const AssistantDock = bindAssistantDock({
  hooks: { useAssistantDockStateHook: useAssistantDockState },
  kit: { DockChatPane },
});
