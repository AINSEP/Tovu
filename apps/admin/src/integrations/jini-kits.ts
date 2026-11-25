import { Badge, Button, ConfirmDialog, Dialog, IconButton, Menu, Notice, Select, Spinner, Switch, Tabs, TextArea, TextField, useConfirmController, SecretInput as KitSecretInput, useOverlayContainer, useSecretReveal } from '@jini-ai/ui-kit/react';
import { useNativeDialog } from '@jini-ai/ui-kit/react/native';
import { SecretInput, useAgentHandle, useMediaProvidersTab, sortProvidersByConfigured, isEntryPresent, isMarkerOnlyEntry, maskedKeyLabel,
  isProviderBaseUrlInvalid, invalidBaseUrlProviderIds, Icon, useT, SETTINGS_DIALOG_DICTIONARIES, DEFAULT_NOTIFICATIONS_PREFERENCES,
  RemixIcon, Toast, I18nProvider, SettingsDialogShell, CodeWithLines, CodeWrapToggle, useCodeWrap,
  useTabbedDialog, useCopyToClipboard, findActiveTab, resolveInitialActiveTabId, readableTextColor,
  nextConfigForAgentSelect, nextConfigForAgentModel, nextConfigForAgentReasoning, resolveSelectedPreset, createExecutionHttpAdapter, requireExecutionResponseData,
  useExecutionCredential, useWiredCopyToClipboard, createBrowserViewerClipboard, folderPathsFromDataTransfer, useI18n, resolveAccentColor, normalizeAccentColor,
  sourceDisplayLabel, SearchableModelSelect } from '@jini-ai/ui';
import { startVisibleInterval } from '@jini-ai/ui/visible-interval';
import { useAgentPluginFileTree } from '@jini-ai/admin/agent-plugins/react';
import { ErrorNotice, useAsyncAction, useDirtyGuard, useFocusTrap, useSettlementGeneration, UNREACHABLE_RETRY_DELAYS_MS,
  LOCAL_BACKUP_PRINCIPAL_ID, useSerialWrites, hasPermission, standingDraftRecoveryMessage, createStandingDraftLocalBackup,
  createFailureChannel, canAcceptRefresh, mergeSaveStates, SAVE_DEBOUNCE_MS, useSettingsSlice, useStandingDraftAutosave, retryWhileUnreachable } from '@jini-ai/ui/panel-kit';
import { useCursorPages } from '@jini-ai/ui/fetch-query';
import { findEditorBlockOpening, isEditorSourceError } from '@jini-ai/ui/html-editor';
import { renderMarkdownToSafeHtml } from '@jini-ai/ui/renderers';
import { InfoTip, Lightbox, Select as WidgetSelect, useInfoTip, usePanelPosition, useSelectDropdown, openLightboxDialog,
  closeLightboxDialog, SeeMore, useDebouncedHtmlPreview, resolveSelectTriggerLabel, infoTipBubbleStyle } from '@jini-ai/ui/admin-widgets';
import { TabBar, useTabBarKeyboard, resolveTabBarTabIndex } from '@jini-ai/ui/tab-strip';
import { buildSandboxProxyDataUrl } from '@jini-ai/ui/mcp-ui/surfaces';
import { PreviewModalShell } from '@jini-ai/ui/preview-modal-shell';
import { InteractiveHtmlEditor } from '@jini-ai/ui/html-editor';
import { applyAdminTheme, defaultAdminTheme, resolveColorScheme } from '@jini-ai/ui/theme';
import { useCachedLoader, useFetchMutation, useFetchQuery, useFetchQueryScope, useInvalidate } from '@jini-ai/ui/fetch-query';
import { ConfirmDialog as AdminConfirmDialog, RowMenu } from '@jini-ai/admin/react';
import { ChatPane, ChatSettingsDialog, JiniChatProvider, ConversationList, ChatSettingsSegmented, McpUiSurfaceCard, A2uiSurfaceCard, createDaemonAttachmentUploader,
  useT as useChatT, createExtEventRendererRegistry, createLastConversationStore, createAssistantChatsClient, createMidRunMessagePoster, createTypedAnswerPoster, useFabPosition, resolveChatPaneSelection,
  mcpUiSurfaceSlotKey, midRunUserMessageSlotKey, MCP_UI_EXT_EVENT_NAME, MID_RUN_USER_MESSAGE_EXT_EVENT_NAME } from '@jini-ai/chat/react';
import { SECRET_REDACTED_NOTICE, CREDENTIAL_CARD_GUIDANCE, conversationTitleForDisplay, deriveConversationTitle, isTerminalRunStatus } from '@jini-ai/chat/core';
import { createA2uiActionPoster, createConditionalHistoryRead, createChatAttachmentValidator } from '@jini-ai/chat/transports/http';
import { createAgentInventorySnapshot } from '@jini-ai/chat/browser/agent-inventory';
import { adminSurfaceFrameAttributes, readAdminSurfaceTheme, adminSurfaceThemeMessage, adminSurfaceInitMessage, adminSurfaceActionResponse, createAdminSurfaceMount,
  openAdminSurfaceLink, readAdminSurfaceResize, validateAdminSurfaceMessage } from '@jini-ai/agent-plugins/admin-surfaces';
import { isProviderSettingRequired } from '@jini-ai/plugins/host';
import type { AdminKit } from '@jini-ai/admin/react/kit';
import { useHostAdminLocale } from '../hooks/admin-locale-dependencies.hooks';
import type { UserManagementKit } from '@jini-ai/user-management/react/kit';
import type { UiKit } from '@jini-ai/ui/react-kit';

/** Tovu picks the implementations; @jini-ai/admin only states what it renders. ui-kit facades (not
 *  raw native parts) so Tovu's <KitProvider> still supplies agent attrs, overlay container and guards.
 *  A ui/ui-kit prop change that breaks admin fails typecheck HERE, at `satisfies`. */
export const adminKit = {
  components: { Button, IconButton, TextField, TextArea, Select, Switch, Dialog, ConfirmDialog, Tabs, Menu, Notice, Spinner, Badge,
    InfoTip, Lightbox, WidgetSelect, TabBar, HtmlEditor: InteractiveHtmlEditor, ErrorNotice, Icon, SecretInput,
    RemixIcon, Toast, I18nProvider, SettingsDialogShell, CodeWithLines, CodeWrapToggle, PreviewModalShell,
    SeeMore, SearchableModelSelect },
  // `useT` is ui's translator (Settings-dialog and panel copy). Chat's `useT` from `@jini-ai/chat/react`
  // reads a different dictionary and stays a separate binding; swapping them would mistranslate silently.
  // The host's one locale hook; App's required `useAdminLocaleHook` prop references the same function.
  hooks: { useAdminLocale: useHostAdminLocale, useAgentHandle, useFocusTrap, useDirtyGuard, useSettlementGeneration, useConfirmController, useNativeDialog, useT,
    useTabBarKeyboard, useSerialWrites, useCodeWrap, useAgentPluginFileTree, useInfoTip, usePanelPosition, useSelectDropdown, useTabbedDialog, useCopyToClipboard,
    useExecutionCredential, useSettingsSlice, useStandingDraftAutosave, useWiredCopyToClipboard, useCursorPages, useI18n, useDebouncedHtmlPreview },
  query: { useFetchQuery, useFetchMutation, useInvalidate, useCachedLoader, useFetchQueryScope },
  mediaProviders: { useMediaProvidersTab, rules: { sortProvidersByConfigured, isEntryPresent, isMarkerOnlyEntry, maskedKeyLabel,
    isProviderBaseUrlInvalid, invalidBaseUrlProviderIds } },
  theme: { applyAdminTheme, resolveColorScheme, defaultAdminTheme },
  // Passed through by identity, never copied: the dock's dictionary lookup
  // (`app-i18n.ts`'s `CHAT_I18N_HOST_FIELDS`, passed to the Jini dock adapter) still reads `SETTINGS_DIALOG_DICTIONARIES` at call time.
  values: { SETTINGS_DIALOG_DICTIONARIES, DEFAULT_NOTIFICATIONS_PREFERENCES, UNREACHABLE_RETRY_DELAYS_MS, LOCAL_BACKUP_PRINCIPAL_ID,
    buildSandboxProxyDataUrl, openLightboxDialog, closeLightboxDialog, resolveTabBarTabIndex, hasPermission, standingDraftRecoveryMessage,
    createStandingDraftLocalBackup, createFailureChannel, resolveInitialActiveTabId, findActiveTab,
    adminSurfaceFrameAttributes, readAdminSurfaceTheme, adminSurfaceThemeMessage, adminSurfaceInitMessage, adminSurfaceActionResponse, createAdminSurfaceMount,
    openAdminSurfaceLink, readAdminSurfaceResize, validateAdminSurfaceMessage, isProviderSettingRequired,
    readableTextColor, canAcceptRefresh, mergeSaveStates, SAVE_DEBOUNCE_MS, startVisibleInterval, nextConfigForAgentSelect, nextConfigForAgentModel,
    nextConfigForAgentReasoning, resolveSelectedPreset, createExecutionHttpAdapter, requireExecutionResponseData, retryWhileUnreachable, createBrowserViewerClipboard,
    folderPathsFromDataTransfer, findEditorBlockOpening, isEditorSourceError, resolveAccentColor, normalizeAccentColor, resolveSelectTriggerLabel,
    infoTipBubbleStyle, renderMarkdownToSafeHtml, sourceDisplayLabel },
  // The chat library's own translator (its locale context, not ui's) and its run posters; callers keep
  // passing the host route, cookie fetch, tool id and redaction callback in the factories' two arg objects.
  chat: { useT: useChatT, createMidRunMessagePoster, createTypedAnswerPoster, createA2uiActionPoster,
    useFabPosition, resolveChatPaneSelection, conversationTitleForDisplay, deriveConversationTitle, mcpUiSurfaceSlotKey, isTerminalRunStatus,
    createExtEventRendererRegistry, createLastConversationStore, createAssistantChatsClient, createAgentInventorySnapshot, createConditionalHistoryRead,
    createChatAttachmentValidator, ChatPane, ChatSettingsDialog, JiniChatProvider, ConversationList, ChatSettingsSegmented, McpUiSurfaceCard, A2uiSurfaceCard,
    createDaemonAttachmentUploader,
    midRunUserMessageSlotKey, MCP_UI_EXT_EVENT_NAME, MID_RUN_USER_MESSAGE_EXT_EVENT_NAME, SECRET_REDACTED_NOTICE, CREDENTIAL_CARD_GUIDANCE },
} satisfies AdminKit;

/** ui's own kit (selects and secret inputs): ui-kit's real implementations. The alias keeps ui-kit's
 *  `SecretInput` apart from ui's own component of the same name. ui-kit's `useOverlayContainer` keeps
 *  the `document.body` fallback, so behaviour inside the provider matches the old direct import. */
export const uiKit = {
  components: { SecretInput: KitSecretInput },
  hooks: { useOverlayContainer, useSecretReveal },
} satisfies UiKit;

/** user-management's own kit. Its screens used to import these straight from `ui` and `admin`; the real
 *  implementations are unchanged. `ConfirmDialog` is admin's (body, confirmLabel, tone), not the ui-kit one in
 *  `adminKit`, and `SecretInput` is `ui`'s i18n-aware wrapper, not the ui-kit one in `uiKit`. A prop change that
 *  breaks user-management fails typecheck HERE, at `satisfies`. */
export const userManagementKit = {
  components: { SecretInput, InfoTip, RowMenu, ConfirmDialog: AdminConfirmDialog },
  hooks: { useFetchQuery, useFetchMutation, useAsyncAction, useCachedLoader, useInvalidate },
} satisfies UserManagementKit;
