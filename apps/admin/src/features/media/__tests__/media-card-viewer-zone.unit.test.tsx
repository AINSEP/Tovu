import { render } from "@/__tests__/render-with-jini-kits";
import { expect, it, vi } from "vitest";
import type { AdminMedia } from "@jini-ai/core/contracts/site/cms-admin-media";

import { Media } from "../Media";
import type { MediaController } from "@jini-ai/admin/screens/media/hooks/use-media.hooks";
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
import { useMediaProviderCatalog } from "@jini-ai/cms/react/media/use-media-provider-catalog.hooks";

// Every screen hook is a required prop; the test overrides only the controller.
const requiredMediaHooks = {
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
  useMediaProviderCatalogHook: useMediaProviderCatalog,
};

const item: AdminMedia = {
  id: "media-1",
  workspaceId: "workspace-local",
  title: "Evening upload",
  slug: "evening-upload",
  alt: "Evening upload",
  caption: "",
  credit: "",
  sha256: "abc123",
  contentType: "image/png",
  status: "active",
  createdAt: "2026-11-25T07:30:00.000Z",
  updatedAt: "2026-11-25T07:30:00.000Z",
  version: 1,
  width: null,
  height: null,
  cssClass: null,
  htmlAttributes: null,
  publicUrl: null,
};

it("Media shows the owner's calendar date and preserves the upload instant", () => {
  const controller: MediaController = {
    media: [item],
    lookupMedia: [item],
    counts: null,
    hasUntypedActive: false,
    hasMore: false,
    loadingMore: false,
    loadMoreError: null,
    loadMore: vi.fn(async () => {}),
    error: null,
    uploading: false,
    uploadOpen: false,
    openUpload: vi.fn(),
    closeUpload: vi.fn(),
    uploadError: null,
    conversionNotice: null,
    canUpload: false,
    altDraft: "",
    setAltDraft: vi.fn(),
    fileInputRef: { current: null },
    selectedFileName: "",
    onFileChange: vi.fn(),
    upload: vi.fn(async () => {}),
    editingId: null,
    setEditingId: vi.fn(),
    editingItem: null,
    toggleEditing: vi.fn(),
    onMetadataSaved: vi.fn(),
    trash: vi.fn(async () => {}),
    restore: vi.fn(async () => {}),
    pendingPurge: null,
    setPendingPurge: vi.fn(),
    rowSavingId: null,
    purge: vi.fn(async () => {}),
    lightboxIndex: null,
    setLightboxIndex: vi.fn(),
    orderBy: "created",
    setOrderBy: vi.fn(),
    t: (key: string) => key,
    locale: "en-US",
  };
  const { container } = render(
    <Media {...requiredMediaHooks} useMediaHook={() => controller} viewerTimeZone="America/Los_Angeles" />,
  );
  const time = container.querySelector(".media-card time");
  expect(time).toHaveTextContent("Nov 24, 2026");
  expect(time).toHaveAttribute("datetime", "2026-11-25T07:30:00.000Z");
});
