import { bindPageEditorHooks } from "@jini-ai/admin/pages/hooks/use-page-editor.hooks";
import { readVersionConflict } from "../../../lib/shell-collaborators";
import { isUnexpectedServerFailure } from "@jini-ai/admin/shell/lib/server-failure";
import { useFetchMutation, useCachedLoader, useInvalidate } from "@jini-ai/ui/fetch-query";
import { useDevicePreviewDevice, usePreviewPaneWidth } from "@jini-ai/admin/shell/components/DevicePreview/DevicePreview.hooks";
import { navigate as defaultNavigate } from "@jini-ai/admin/shell/lib/router";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks";
import { useDirtyGuard, useSettlementGeneration } from "@jini-ai/ui/panel-kit";
import { useAgentScreenEntry } from "@jini-ai/admin/shell/hooks/use-agent-screen-context.hooks";
import { useExternalEntryRefresh } from "@jini-ai/admin/shell/hooks/use-external-entry-refresh.hooks";
import { useStandingDraftAutosave } from "@/hooks/use-standing-draft-autosave.hooks";
import { t as defaultT } from "../page-editor-i18n";
import { embedMarkerTarget, parseEmbedMarkerConfig } from "@jini-ai/cms/widgets/markers";
import { useWiredEditorHtmlJump, useWiredInteractiveEditorFlush } from "./page-editor-wiring.hooks";
import { HOME_PAGE_HANDLE, pageAdminPath, PAGES_RESOURCE } from "../rules";
import { applySavedPage, applySaveFailure, PageBodyWriteError, writePage } from "@jini-ai/cms/react/pages/hooks/page-editor-save";
import { defaultPageEditorPort } from "./page-editor-dependencies.hooks";
import { defaultThemeCanvasPort } from "./theme-canvas-dependencies.hooks";
import { resolveCanvasTemplateChoice, useThemeCanvasStyling } from "./use-theme-canvas-styling.hooks";

export const { usePageEditor, useWiredPageEditor } = bindPageEditorHooks({
  hooks: {
    useCachedLoader,
    useInvalidate,
    useFetchMutation,
    useLocaleHook: useAdminLocale,
    useDevicePreviewDevice,
    usePreviewPaneWidth,
    useDirtyGuard,
    useSettlementGeneration,
    useAgentScreenEntry,
    useExternalEntryRefresh,
    useContentRefreshSubscription,
    useStandingDraftAutosave,
    useWiredInteractiveEditorFlush,
    useWiredEditorHtmlJump,
    useThemeCanvasStyling,
  },
  deps: {
    port: defaultPageEditorPort,
    themeCanvasPort: defaultThemeCanvasPort,
    navigate: (routePath, options) => options === undefined ? defaultNavigate({ routePath }) : defaultNavigate({ routePath }, options),
    t: defaultT,
    HOME_PAGE_HANDLE,
    PAGES_RESOURCE,
    pageAdminPath,
    resolveCanvasTemplateChoice,
    writePage,
    PageBodyWriteError,
    applySavedPage,
    applySaveFailure,
    readVersionConflict,
    isUnexpectedServerFailure,
    embedMarkerTarget,
    parseEmbedMarkerConfig,
    setTimeout,
    clearTimeout,
    document,
    window,
  },
});
