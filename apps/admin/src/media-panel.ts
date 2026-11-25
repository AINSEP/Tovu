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
import { createElement } from "react";
import { Media } from "./panel-pages";
// PARKED 2026-10-03 (owner): Jini media at parity; re-enable to switch over
// import { ModulePanel } from "./integrations/jini-admin/ModulePanel";
import type { PanelRouteContext } from "./panel-contracts";
import { useMediaProviderCatalog } from "./features/media/use-media-provider-catalog.hooks";

// Keep render dispatch outside the JSX-only panel registry. Both screens use App's host chrome.
export function renderMediaPanel(ctx: PanelRouteContext, _optional: Record<string, never> = {}) {
  // PARKED 2026-10-03 (owner): Jini media at parity; re-enable to switch over, as the branch
  // taken when ctx.view === "jini-media":
  //   // `?tab=<id>` picks the initially-active tab and stays in sync as the operator switches tabs
  //   // (via `ModulePanel`'s route query) — same `?tab=` deep-linking convention as `deployment`'s and
  //   // `settings`'s own entries elsewhere in the panel registry.
  //   return createElement(ModulePanel, { moduleId: "media", pageId: "library", route: ctx });
  // Legacy Media owns `/admin/media` in every build until owner visual-parity sign-off.
  // Pass its existing tab prop through so direct links and its tab buttons use the same URL.
  // `?id=` names one item whose detail dialog opens (use-media-item-link.hooks.ts).
  return createElement(Media, { useMediaHook: useWiredMedia, useMediaTabsHook: useMediaTabs, useMediaPreviewHook: useWiredMediaPreview, useEditMediaPanelHook: useWiredEditMediaPanel, useEditMediaModalHook: useEditMediaModal, useAdminKitValuesHook: useAdminKitValues, useMediaCardMetadataHook: useMediaCardMetadata, useMediaCardDetailsHook: useMediaCardDetails, useMediaGridSizeHook: useMediaGridSize, useAdminThemeBoundaryHook: useAdminThemeBoundary, useMediaItemLinkHook: useMediaItemLink, useMediaProviderCatalogHook: useMediaProviderCatalog, tabId: ctx.query.get("tab"), itemId: ctx.query.get("id") });
}
