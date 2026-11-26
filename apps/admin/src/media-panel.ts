import { useWiredMedia } from "@/features/media/hooks/use-media.hooks";
import { useMediaTabs } from "@jini-ai/admin/screens/media/hooks/use-media-tabs.hooks";
import { useWiredMediaPreview } from "@/features/media/hooks/use-media-preview.hooks";
import { useWiredEditMediaPanel } from "@/features/media/hooks/use-edit-media-panel.hooks";
import { useEditMediaModal } from "@jini-ai/admin/screens/media/hooks/use-edit-media-modal.hooks";
import { useAdminKitValues } from "@jini-ai/admin/react/kit";
import { useMediaCardMetadata } from "@jini-ai/admin/screens/media/hooks/use-media-card-metadata.hooks";
import { useMediaCardDetails } from "@jini-ai/admin/screens/media/hooks/use-media-card-details.hooks";
import { useMediaGridSize } from "@jini-ai/admin/screens/media/hooks/use-media-grid-size.hooks";
import { useAdminThemeBoundary } from "@/admin-themes/use-admin-theme.hooks";
import { useMediaItemLink } from "@jini-ai/admin/screens/media/hooks/use-media-item-link.hooks";
import { createElement, type ComponentProps } from "react";
import { Media } from "./panel-pages";
import type { MediaProps } from "@jini-ai/admin/screens/media/Media";
import { VIEWER_TIME_ZONE } from "@jini-ai/admin/shell/lib/viewer-time-zone";
// PARKED 2026-10-03 (owner): Jini media at parity; re-enable to switch over
// import { ModulePanel } from "./integrations/jini-admin/ModulePanel";
import type { PanelRouteContext } from "./panel-contracts";
import { useWiredMediaProviderCatalog } from "@/features/media/hooks/media-dependencies.hooks";
import { MAX_UPLOAD_BYTES } from "@tovu/contracts/upload-limits";
import { mediaProvidersPort, mediaProviderCatalogPort } from "./features/media/media-providers-port";
import { mediaProviderCatalogPolicy } from "@jini-ai/integrations/media-providers/catalog";
import { PINNED_MEDIA_PROVIDER_IDS } from "@jini-ai/admin/screens/media/pinned-media-providers";
import { ChromePlaybackNote } from "@jini-ai/cms/react/media/chrome-playback-note";
import { EyeIcon, ExpandIcon, PlaceholderIcon, PlayIcon, UploadIcon } from "@jini-ai/cms/react/media/media-icons";
import { ServerLabel } from "@/components/status-labels";
import { RowMenu, ConfirmDialog } from "@jini-ai/admin/react";
import { Icon, I18nProvider, MediaProvidersTab, SETTINGS_DIALOG_DICTIONARIES, useMediaProvidersTab } from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { MediaLoadMore } from "@jini-ai/cms/react/media/MediaLoadMore";
import { t as mediaTranslate, VIDEO_CONVERSION_NOTICE_KEY } from "./features/media/media-i18n";
import { DockHeaderTip } from "@jini-ai/admin/shell/components/AssistantDock/DockHeaderTip";
import { ExternalProvidersPanel } from "@jini-ai/cms/react/media/ExternalProvidersPanel";
import { TabBar } from "@jini-ai/ui/tab-strip";
import { InfoTip, Lightbox, MiddleTruncate } from "@jini-ai/ui/admin-widgets";
import { PublishSectionButton } from "./features/publish-content/publish-section-button-binding";
import { RemoteImageImport, useRemoteImageImport } from "@jini-ai/cms/react/media";
import { useFetchMutation } from "@jini-ai/ui/fetch-query";
import { describeApiError } from "@/lib/admin-http/request";
import { defaultMediaImportPort } from "./features/media/hooks/media-import-dependencies.hooks";
import { Button, Dialog, TextField } from "@jini-ai/ui-kit/react";
import "./styles/native-domain-dialogs.css";

/** Browser-storage key for the Media grid's card size (owner default, 2026-11-01). The sizes, their parser and
 *  `useMediaGridSize` live in `@jini-ai/admin/screens/media`; this product key is passed in at the call site. */
const MEDIA_GRID_SIZE_STORAGE_KEY = "tovu.admin.media.cardSize";

function BoundMediaProvidersTab(required: ComponentProps<ComponentProps<typeof ExternalProvidersPanel>["kit"]["MediaProvidersTab"]>, _optional = {}) {
  return createElement(MediaProvidersTab, { ...required, useMediaProvidersTabHook: useMediaProvidersTab });
}

export const MEDIA_PROPS = {
  hooks: {
    useMediaHook: useWiredMedia,
    useMediaTabsHook: useMediaTabs,
    useMediaPreviewHook: useWiredMediaPreview,
    useEditMediaPanelHook: useWiredEditMediaPanel,
    useEditMediaModalHook: useEditMediaModal,
    useAdminKitValuesHook: useAdminKitValues,
    useMediaCardMetadataHook: useMediaCardMetadata,
    useMediaCardDetailsHook: useMediaCardDetails,
    useMediaGridSizeHook: useMediaGridSize,
    useAdminThemeBoundaryHook: useAdminThemeBoundary,
    useMediaItemLinkHook: useMediaItemLink,
    useMediaProviderCatalogHook: useWiredMediaProviderCatalog,
    useRemoteImageImport,
    useFetchMutation,
  },
  kit: {
    Button, Dialog, TextField, Icon, RowMenu, ConfirmDialog, TabBar, InfoTip, Lightbox,
    MiddleTruncate, ServerLabel, EyeIcon, ExpandIcon, PlaceholderIcon, PlayIcon, UploadIcon,
    MediaLoadMore, DockHeaderTip, PublishSectionButton, RemoteImageImport,
    ChromePlaybackNote: (props) => createElement(ChromePlaybackNote, { maxUploadBytes: MAX_UPLOAD_BYTES, ...props }),
    ExternalProvidersPanel: (props) => createElement(ExternalProvidersPanel, { ...props, kit: { I18nProvider, MediaProvidersTab: BoundMediaProvidersTab, SETTINGS_DIALOG_DICTIONARIES }, mediaProvidersPort, mediaProviderCatalogPolicy, pinnedProviderIds: PINNED_MEDIA_PROVIDER_IDS }),
  },
  deps: {
    mediaProviderCatalogPort, VIEWER_TIME_ZONE, MEDIA_GRID_SIZE_STORAGE_KEY, mediaTranslate,
    VIDEO_CONVERSION_NOTICE_KEY, defaultMediaImportPort, describeApiError,
  },
} satisfies MediaProps;

// Keep render dispatch outside the JSX-only panel registry. Both screens use App's host chrome.
// PARKED 2026-10-03 (owner): Jini media at parity; re-enable to switch over, as the branch
// taken when ctx.view === "jini-media":
//   // `?tab=<id>` picks the initially-active tab and stays in sync as the operator switches tabs
//   // (via `ModulePanel`'s route query) — same `?tab=` deep-linking convention as `deployment`'s and
//   // `settings`'s own entries elsewhere in the panel registry.
//   return createElement(ModulePanel, { moduleId: "media", pageId: "library", route: ctx });
// Legacy Media owns `/admin/media` in every build until owner visual-parity sign-off.
// Pass its existing tab prop through so direct links and its tab buttons use the same URL.
// `?id=` names one item whose detail dialog opens (use-media-item-link.hooks.ts).
export const renderMediaPanel = (ctx: PanelRouteContext, _optional: Record<string, never> = {}) =>
  createElement(Media, { ...MEDIA_PROPS, viewerTimeZone: VIEWER_TIME_ZONE, tabId: ctx.query.get("tab"), itemId: ctx.query.get("id") });
