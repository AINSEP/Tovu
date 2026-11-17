import { useConfirmRequest } from "@jini-ai/admin/react";
import { useNativeFolderPicker } from "../../features/fs-files/hooks/use-native-folder-picker.hooks";
import { useChatDisplayPreferences } from "./chat-display-preferences.adapter";
import { useChatAgentPluginsPreference } from "./chat-agent-plugin-preferences.adapter";
import { useAssistantRuntimePreferencesPreference } from "./assistant-runtime-preferences.adapter";
import { visibleAssistantRuntimePreferences, type AgentRuntimePreferenceSupport } from "./assistant-runtime-preferences";
import { useDockAgentPermissions } from "@/features/ai-assistant/hooks/use-admin-subagents.hooks";
import { useConversationRefreshSignal } from "./hooks/conversation-refresh.hooks";
import { useDockRendererRegistry } from "./hooks/use-dock-renderer-registry.hooks";
import { useTovuDockExecution } from '../../hooks/use-tovu-execution-adapters.hooks';
import { useSelectedSkills, useComposerDiscoveryDraft, useSkillOnlySend } from "./hooks/composer-skills.hooks";
import { useAssistantEmptyState } from "./hooks/use-assistant-empty-state.hooks";
import { useSelectedAgentAuthWarning } from "./hooks/use-selected-agent-auth-warning.hooks";
import { useComposerSendStopGuard } from "./hooks/use-composer-send-stop-guard.hooks";
import { useBrowserAgentSettings } from "../../features/webmcp/browser-agent-settings.hooks";
import { useSkillInstall } from "../../features/skills/use-skill-install.hooks";
import {
  ChatPane,
  useChatSettingsDialog,
} from "@jini-ai/chat/react";
import type { ChatMessage } from "@jini-ai/chat/core";

import { useAgentFailureSurface } from "./AgentFailureCard.hooks";
import { useComposerVoiceInput } from "../../features/voice-input/hooks/use-composer-voice-input.hooks";
import { selectedLocalCliReasoning } from "../../lib/execution-settings";
import {
  // Every call below goes through the `useXSeam` wrappers rather than the bare hooks — see
  // `AssistantDock.hooks.tsx`'s "Seam layer" doc for why.
  useAssistantDockChrome,
  resolveAssistantConversationTitle,
  useAssistantTransportSeam,
  useAttachmentUploaderSeam,
  useSkillAwareAttachmentUploader,
  resolveSkillsAvailable,
  useAttachmentValidatorSeam,
  useByokRuntimeSeam,
  useChatsSeam,
  useComposerCapabilitiesSeam,
  useComposerDiscoverySelect,
  useExecutionConfigSeam,
  useLocalCliDaemonPrewarm,
  useLocalCliSelectionSeam,
  useMessagesChangeHandler,
  useRunContext,
  useAgentsPlaceholderSeam,
  useRuntimeAccessSeam,
  useSelectedAgentPlugins,
  useSelectedPluginChips,
  useFolderDropBridge,
} from "./hooks/AssistantDock.hooks";
import { useCallback } from "react";
import { useAssistantPromptRequests } from "../../lib/assistant-prompt-bus";
import type { AssistantDockProps } from "./AssistantDock";

type DockProps = AssistantDockProps;
type DockTranslate = ReturnType<typeof useAssistantDockChrome>["t"];

function selectedDockAgent({ mode, agents, agentId }: {
  mode: string;
  agents: readonly (AgentRuntimePreferenceSupport & { id: string })[] | undefined;
  agentId: string;
}, _options = {}) {
  // Only a Local CLI run spawns the picked agent, so only then do its `supports*` flags apply. Each
  // `/api/agents` entry carries them; `ChatPaneAgent` just does not declare them.
  return mode === "local-cli" ? agents?.find((agent) => agent.id === agentId) : undefined;
}


/** Renderer registry, WebMCP setting and the pane's translated chrome. */
function useDockChrome({ props }: { props: DockProps }, _options = {}) {
  const { useAdminLocale } = props;
  const renderers = useDockRendererRegistry();
  const { mcpUiToolCaller } = renderers;
  const { enabled: webMcpEnabled } = useBrowserAgentSettings({});
  // Translates this component's own pane chrome (eyebrow, title fallback, composer placeholder)
  // and — via `chatI18n` — the `ConversationList` switcher mounted in `header` below. See
  // {@link useAssistantDockChrome}'s own doc for why `locale`/`t`/`chatI18n` are one hook rather
  // than three separate calls.
  const { locale, t, chatI18n } = useAssistantDockChrome({ useAdminLocaleOverride: useAdminLocale });
  return { renderers, mcpUiToolCaller, webMcpEnabled, locale, t, chatI18n };
}

/** Per-operator display, plugin and runtime preferences, the settings dialog and the delete confirmation. */
function useDockPreferences({ props, t }: { props: DockProps; t: DockTranslate }, _options = {}) {
  const {
    useChatDisplayPreferences: useChatDisplayPreferencesOverride,
    useChatAgentPlugins = useChatAgentPluginsPreference,
    useAssistantRuntimePreferences = useAssistantRuntimePreferencesPreference,
  } = props;
  const conversationDelete = useConfirmRequest({});
  // Gear menu: per-operator transcript display, applied to the pane at once.
  const chatDisplay = useDockDisplayPreferences(useChatDisplayPreferencesOverride);
  // Gear menu: per-person Agent plugins mode; Off hides the pane's "Using" chip at once.
  const agentPlugins = useChatAgentPlugins();
  // Gear menu: per-person runtime switches; the server reads them when it starts the next run.
  const runtimePreferences = useAssistantRuntimePreferences();
  const chatSettings = useChatSettingsDialog({});
  const agentPermissions = useDockAgentPermissions({ t: (key) => t({ key }), openSettings: chatSettings.show });

  return { conversationDelete, chatDisplay, agentPlugins, runtimePreferences, chatSettings, agentPermissions };
}

/** The execution policy and everything derived from the stored execution config and CLI selection. */
function useDockExecution({ props, locale }: { props: DockProps; locale: string }, _options = {}) {
  const {
    agentBridge = null,
    useExecutionConfig: useExecutionConfigOverride,
    useByokRuntime: useByokRuntimeOverride,
    useLocalCliSelection: useLocalCliSelectionOverride,
    useExecutionPolicy,
  } = props;
  const executionPolicy = useTovuDockExecution({ controller: useExecutionConfigSeam({ override: useExecutionConfigOverride }), locale }, { usePolicy: useExecutionPolicy });
  const { executionConfig, executionConfigRef, setExecutionConfig, handleExecutionModeChange, hasStoredAdminKey, configLoaded, readExecutionConfigForSend } = executionPolicy;
  // The dock, not the layout, owns the pre-warm: only it knows the chat's execution mode.
  const pageActivationError = useLocalCliDaemonPrewarm({ mode: executionConfig.mode, configLoaded, agentBridge });
  const { byokRuntime, handleByokModelChange } = useByokRuntimeSeam({ override: useByokRuntimeOverride, input: { executionConfig, setExecutionConfig } });
  const { localCliSelection, handleLocalCliSelectionChange, readLocalCliSelectionForSend } = useLocalCliSelectionSeam({
    override: useLocalCliSelectionOverride,
    input: { executionConfig, setExecutionConfig, configLoaded },
  });

  return {
    executionPolicy, executionConfig, executionConfigRef, setExecutionConfig, handleExecutionModeChange, hasStoredAdminKey, configLoaded,
    readExecutionConfigForSend, pageActivationError, byokRuntime, handleByokModelChange, localCliSelection, handleLocalCliSelectionChange,
    readLocalCliSelectionForSend,
  };
}

type DockExecution = ReturnType<typeof useDockExecution>;

/** Conversation history, the run transport and the attachment upload/validation ports. */
function useDockTransport({ props, execution }: { props: DockProps; execution: DockExecution }, _options = {}) {
  const {
    agentBridge = null,
    useChats,
    principalId,
    useAssistantTransport: useAssistantTransportOverride,
    useAttachmentUploader: useAttachmentUploaderOverride,
    useAttachmentValidator: useAttachmentValidatorOverride,
  } = props;
  const { executionConfigRef, readExecutionConfigForSend, readLocalCliSelectionForSend } = execution;
  // Resolved BEFORE the transport, which now takes `chats.ensureConversationId`: turn 1's run must
  // be able to adopt this pane's conversation before it is dispatched, because the lazy adoption
  // driven by `onMessagesChange` starts too late for the run to carry the id. See
  // `CreateTovuAssistantTransportOptions.ensureConversationId` for the full mechanism.
  const chats = useChatsSeam({ override: useChats }, { principalId });
  const persistUserTurn = useCallback((conversationId: string, message: ChatMessage) =>
    chats.persistUserTurn({ conversationId, message }), [chats.persistUserTurn]);
  const { transport, daemonStarting } = useAssistantTransportSeam({
    agentBridge,
    executionConfigRef,
    readExecutionConfigForSend,
    readLocalCliSelectionForSend,
    ensureConversationId: chats.ensureConversationId,
    // Defect 2 (2026-09-11): the same reasoning one line up, for the message rather than the
    // conversation. `startRun` awaits this before dispatching, so the user's turn is durable before
    // a run that may fail to deliver it exists at all — see `persistUserTurn`'s own doc in
    // `use-assistant-chats.hooks.ts`.
    persistUserTurn,
  }, { useTransport: useAssistantTransportOverride });
  const uploadOrdinaryAttachments = useAttachmentUploaderSeam({ override: useAttachmentUploaderOverride });
  const skillInstall = useSkillInstall();
  const uploadAttachments = useSkillAwareAttachmentUploader({ uploadAttachments: uploadOrdinaryAttachments, proposeFiles: skillInstall.proposeFiles });
  const validateAttachments = useAttachmentValidatorSeam({ override: useAttachmentValidatorOverride });
  return { chats, transport, daemonStarting, skillInstall, uploadAttachments, validateAttachments };
}

/** The selected agent, its sign-in warning, runtime access and the runtime switches that apply to it. */
function useDockAgent({ props, execution, locale, runtimePreferences }: { props: DockProps; execution: DockExecution; locale: string; runtimePreferences: ReturnType<typeof useDockPreferences>["runtimePreferences"] }, _options = {}) {
  const { useRuntimeAccess: useRuntimeAccessOverride } = props;
  const { executionConfig, executionPolicy, localCliSelection } = execution;
  // D-21(b): the picker's inventory has no auth status, so the sign-in warning reads Settings'
  // detection; its wrapped runtimeAccess re-probes auth on the picker's own Rescan.
  const pickerRuntimeAccess = useRuntimeAccessSeam({ override: useRuntimeAccessOverride });
  const selectedAgentAuth = useSelectedAgentAuthWarning({ mode: executionConfig.mode, agentId: localCliSelection.agentId, locale, runtimeAccess: pickerRuntimeAccess });
  const runtimeAccess = executionPolicy.runtimeAccess(selectedAgentAuth.runtimeAccess);
  // The picker's instant list while `listAgents` is still in flight — see `useAgentsPlaceholder`.
  const agentsPlaceholder = executionPolicy.agents({ agents: useAgentsPlaceholderSeam({ runtimeAccessOverride: useRuntimeAccessOverride }) });
  const selectedAgent = selectedDockAgent({ mode: executionConfig.mode, agents: agentsPlaceholder, agentId: localCliSelection.agentId });
  const runtime = { ...runtimePreferences, visible: visibleAssistantRuntimePreferences({ agent: selectedAgent }) };
  return { selectedAgentAuth, runtimeAccess, agentsPlaceholder, runtime };
}

type DockAgent = ReturnType<typeof useDockAgent>;
type DockTransport = ReturnType<typeof useDockTransport>;

/** The composer: discovery catalog, pinned plugins and skills, voice input and folder drop/pick. */
function useDockComposer({ props, renderers, execution, agent, transportState }: { props: DockProps; renderers: ReturnType<typeof useDockChrome>["renderers"]; execution: DockExecution; agent: DockAgent; transportState: DockTransport }, _options = {}) {
  const { onFolderDropCaptureReady } = props;
  const { mcpUiToolCaller } = renderers;
  const { executionConfig, localCliSelection } = execution;
  const { agentsPlaceholder } = agent;
  const { skillInstall } = transportState;
  const { useComposerCapabilities: useComposerCapabilitiesOverride } = props;
  /**
   * The composer's discovery catalog, projected asynchronously (debate 2, "Composer slash
   * commands") — replaces the pre-2026-08-12 static `TOVU_COMPOSER_DISCOVERY_GROUPS` import. See
   * `useComposerCapabilities`'s own doc (`AssistantDock.hooks.tsx`) for why it starts empty and how
   * a failed projection degrades.
   */
  const { composerCapabilities } = useComposerCapabilitiesSeam({ override: useComposerCapabilitiesOverride });
  /**
   * The composer's pinned-Agent-Plugin chips (2026-08-21) — see {@link useSelectedAgentPlugins}'s
   * own doc for why this is host state rather than part of `@jini-ai/chat`'s own composer state,
   * and `SelectedAgentPluginTray`'s doc for how it renders.
   */
  const { selectedPluginRefIds, addPluginRef, removePluginRef } = useSelectedAgentPlugins();
  const selectedSkills = useSelectedSkills();
  const discoveryDraft = useComposerDiscoveryDraft(composerCapabilities.groups);
  const captureComposerClick = useComposerSendStopGuard();
  const handleComposerDiscoverySelect = useComposerDiscoverySelect({
    composerCapabilities,
    callAllowlistedTool: mcpUiToolCaller,
    skillsAvailable: resolveSkillsAvailable({ executionMode: executionConfig.mode, agents: agentsPlaceholder, selectedAgentId: localCliSelection.agentId }),
    addPluginRef,
    addSkill: selectedSkills.addSkill,
    readDraft: discoveryDraft.readDraft,
  });
  // See `useSelectedPluginChips`'s own doc for the projection and its label-fallback reasoning.
  const selectedPluginChips = useSelectedPluginChips(selectedPluginRefIds, composerCapabilities);

  /**
   * Owns the `ChatPaneComposerHandle` a voice transcript is delivered through. No Jini change was
   * needed: `composerHandle` and its append-don't-replace `insertText` already existed — see
   * `use-composer-voice-input.hooks.ts`.
   */
  const voiceInput = useComposerVoiceInput();
  // A screen's drafted request (e.g. Sites' "From a live website") lands in the composer here.
  useAssistantPromptRequests(voiceInput.composerHandle);
  const skillOnlySend = useSkillOnlySend({ prompt: selectedSkills.skillOnlyPrompt, composerHandle: voiceInput.composerHandle, discovery: discoveryDraft });
  // SPEC-053: folder-drop-to-path + fs-files `custom` root wiring — reuses `voiceInput`'s own
  // `composerHandle` (the same "insert text into the composer" seam a voice transcript already goes
  // through) rather than owning a second ref to the same `ChatPaneComposerHandle`.
  const folderDrop = useFolderDropBridge({ input: { composerHandle: voiceInput.composerHandle }, onReady: onFolderDropCaptureReady }, { proposeSkillFiles: skillInstall.proposeFiles, onSkillDropError: skillInstall.fail });
  // The composer's folder button: a picked path is handled exactly like a desktop folder drop; a
  // dialog that fails to open hides the button and falls back to the paste hint.
  const folderPicker = useNativeFolderPicker({ onPicked: folderDrop.insertFolderPath, onFailed: folderDrop.showPathHint });

  return {
    composerCapabilities, selectedPluginRefIds, removePluginRef, selectedSkills, discoveryDraft, captureComposerClick,
    handleComposerDiscoverySelect, selectedPluginChips, voiceInput, skillOnlySend, folderDrop, folderPicker,
  };
}

type DockComposer = ReturnType<typeof useDockComposer>;

/** Per-run wiring: message persistence, run context, the failure surface, the empty state and the refresh signal. */
function useDockRun({ props, t, execution, agent, transportState, composer }: { props: DockProps; t: DockTranslate; execution: DockExecution; agent: DockAgent; transportState: DockTransport; composer: DockComposer }, _options = {}) {
  const { agentBridge = null } = props;
  const { executionPolicy, executionConfig, localCliSelection, handleLocalCliSelectionChange, handleExecutionModeChange } = execution;
  const { runtimeAccess } = agent;
  const { chats, transport } = transportState;
  const { selectedPluginRefIds, selectedSkills } = composer;
  const handleMessagesChange = useMessagesChangeHandler({ chats });
  const runContext = useRunContext({
    agentBridge,
    model: localCliSelection.model,
    // The Execution tab owns the "Reasoning effort" control, so this comes from the persisted
    // ledger rather than from the dock's own picker (which has no effort axis). Reading it here is
    // what turns a stored level into real CLI argv — see `useRunContext`'s own doc.
    reasoning: selectedLocalCliReasoning(executionConfig),
    pluginRefIds: selectedPluginRefIds,
    selectedSkills: selectedSkills.selectedSkills,
    // Same id already passed to `<ChatPane conversationId={...}>` below — see `useRunContext`'s
    // own doc for why the daemon needs it too (per-conversation agent-CLI session resume).
    conversationId: chats.activeId,
  });
  // Shown on one ellipsized line, so the full name rides along as the hover tooltip.
  const activeTitle = resolveAssistantConversationTitle({ chats, fallback: t({ key: "Tovu assistant" }) });
  // One policy-gated selection handler for both the failure card and the picker.
  const handleSelectionChange = executionPolicy.selectionChange({ change: handleLocalCliSelectionChange });
  const failureSurface = useAgentFailureSurface({ transport, runtimeAccess, initialMessages: chats.initialMessages,
    onSelectionChange: handleSelectionChange, onExecutionModeChange: handleExecutionModeChange }, {});
  const emptyState = useAssistantEmptyState({ paneKey: chats.paneKey, initialMessages: failureSurface.initialMessages, onMessagesChange: handleMessagesChange });
  const refreshSignal = useConversationRefreshSignal({ conversationId: chats.activeId });

  return { runContext, activeTitle, handleSelectionChange, failureSurface, emptyState, refreshSignal };
}

/** Resolve the injectable preference owner with the same unconditional hook call as the dock. */
function useDockDisplayPreferences(override: AssistantDockProps["useChatDisplayPreferences"]) {
  const usePreferences = override ?? useChatDisplayPreferences;
  return usePreferences();
}

/**
 * Destructured rather than read as `props.x` throughout the body — every seam below is passed
 * straight to its matching `useXSeam` (or, for `agentBridge`, defaulted to `null` in place), so
 * there is nothing left to gain from keeping a `props` object around. Renamed to `...Override`
 * where the prop name would otherwise collide with the imported real hook it defaults to (same
 * "rename the local binding, not the prop" rule `INFO.md`'s Components section states) — `useChats`
 * needs no rename since only its `Seam` counterpart, not the bare hook, is imported here.
 */
export function useAssistantDockState(props: AssistantDockProps) {
  const { ChatPane: ChatPaneView = ChatPane, principalId, agentBridge = null } = props;
  const chrome = useDockChrome({ props });
  const preferences = useDockPreferences({ props, t: chrome.t });
  const execution = useDockExecution({ props, locale: chrome.locale });
  const transport = useDockTransport({ props, execution });
  const agent = useDockAgent({ props, execution, locale: chrome.locale, runtimePreferences: preferences.runtimePreferences });
  const composer = useDockComposer({ props, renderers: chrome.renderers, execution, agent, transportState: transport });
  const run = useDockRun({ props, t: chrome.t, execution, agent, transportState: transport, composer });
  return { ChatPaneView, agentBridge, principalId, ...chrome, ...preferences, ...execution, ...transport, ...agent, ...composer, ...run };
}

