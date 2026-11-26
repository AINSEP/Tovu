import { bindPageEditor } from "@jini-ai/admin/pages/PageEditor";
import { standingDraftRecoveryMessage } from "@jini-ai/ui/panel-kit";
import { WiredThemePreviewReloadButton } from "../themes/ThemePreviewReloadButton";
import { useThemePreviewFrame } from "../themes/hooks/use-theme-preview-refresh.hooks";
import { ConfirmDialog } from "@jini-ai/admin/react";
import { Icon } from "@jini-ai/ui";
import { PageExternalChangeBanner } from "@jini-ai/cms/react/pages/PageExternalChangeBanner";
import { pageExternalChangeBindings } from "./page-external-change-bindings";
import { InteractiveHtmlEditor } from "@jini-ai/ui/html-editor";
import { resolveTabBarTabIndex, useTabBarKeyboard } from "@jini-ai/ui/tab-strip";
import { DevicePreviewFrame } from "@jini-ai/admin/shell/components/DevicePreview/DevicePreviewFrame";
import { DevicePreviewToggle } from "@jini-ai/admin/shell/components/DevicePreview/DevicePreviewToggle";
import { siteUrl } from "../../lib/site-url";
import { useWiredPageEditor } from "./hooks/use-page-editor.hooks";
import { useLivePreviewEmbedIds } from "./hooks/page-editor-dependencies.hooks";
import { TemplateSourceModal } from "../../components/TemplateSource/TemplateSourceModal";
import { ViewTemplateButton } from "@jini-ai/admin/shell/components/TemplateSource/ViewTemplateButton";
import { TermPicker } from "@jini-ai/admin/screens/taxonomy/TermPicker";
import { useTermListReveal } from "@jini-ai/admin/screens/taxonomy/hooks/use-term-list-reveal.hooks";
import { SuggestInput } from "@jini-ai/ui/admin-widgets";
import { useWiredTermPicker } from "../taxonomy/taxonomy-wired.hooks";
import { postPublicPath as pagePublicPath } from "@jini-ai/cms/routing/public-path";
import { pagePickerValue } from "./rules";
import { pageEditorSurface } from "@jini-ai/cms/react/pages/page-editor-rules";

export const PageEditor = bindPageEditor({
  hooks: {
    usePageEditorHook: useWiredPageEditor,
    useTabBarKeyboardHook: useTabBarKeyboard,
    useThemePreviewFrameHook: useThemePreviewFrame,
    usePreviewEmbedIds: useLivePreviewEmbedIds,
    useWiredTermPicker,
    useTermListReveal,
  },
  kit: {
    Icon,
    ConfirmDialog,
    InteractiveHtmlEditor,
    DevicePreviewFrame,
    DevicePreviewToggle,
    ViewTemplateButton,
    WiredThemePreviewReloadButton,
    TermPicker,
    SuggestInput,
    TemplateSourceModal,
    PageExternalChangeBanner,
  },
  deps: {
    siteUrl,
    pagePublicPath,
    pagePickerValue,
    resolveTabBarTabIndex,
    standingDraftRecoveryMessage,
    pageExternalChangeBindings,
    pageEditorSurface,
    videoLink: ({ id }) => `https://www.youtube.com/watch?v=${id}`,
    isDevMode: import.meta.env.DEV,
  },
});
