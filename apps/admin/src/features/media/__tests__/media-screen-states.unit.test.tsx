import { MEDIA_JSON_UPLOAD_MAX_BYTES } from "@tovu/contracts/upload-limits";
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
import { cleanup, fireEvent, render, screen, waitFor, within } from "@/__tests__/render-with-jini-kits";
import { describe, expect, it, vi } from "vitest";

import { cloneElement, Suspense } from "react";
import { renderMediaPanel } from "@/media-panel";
import type { PanelRouteContext } from "@/panel-contracts";
import { Media } from "@jini-ai/admin/screens/media/Media";
import { MEDIA_PROPS } from "@/media-panel";
import { useMedia, type MediaController } from "@jini-ai/admin/screens/media/hooks/use-media.hooks";
import type { MediaGridPage } from "@jini-ai/core/contracts/site/cms-admin-media";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { useWiredMediaProviderCatalog } from "@/features/media/hooks/media-dependencies.hooks";
import { useGridPages } from "@jini-ai/cms/react/media/hooks/use-grid-pages.hooks";
import { useMediaWrites } from "@jini-ai/cms/react/media/hooks/use-media-writes.hooks";
import { useFetchMutation, useFetchQuery, useInvalidate } from "@jini-ai/ui/fetch-query";
import { useContentRefreshSubscription } from "@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks";
import { readFileAsBase64 } from "@jini-ai/admin/screens/media/rules";
import { describeApiError } from "@/lib/admin-http/request";
import { sizeRefusalFromError } from "../upload-size-copy";
import { t as translateMediaCopy } from "../media-i18n";
import { createFakeMediaPort } from "../hooks/media-dependencies.hooks";

const requiredMediaHooks = {
  ...MEDIA_PROPS.hooks,
  useMediaTabsHook: useMediaTabs,
  useMediaPreviewHook: useWiredMediaPreview,
  useEditMediaPanelHook: useWiredEditMediaPanel,
  useEditMediaModalHook: useEditMediaModal,
  useAdminKitValuesHook: useAdminKitValues,
  useMediaCardMetadataHook: useMediaCardMetadata,
  useMediaCardDetailsHook: useMediaCardDetails,
  useMediaGridSizeHook: useMediaGridSize,
  useAdminThemeBoundaryHook: useAdminThemeBoundary,
  useMediaItemLinkHook: useMediaItemLink, useMediaProviderCatalogHook: useWiredMediaProviderCatalog,
};

/**
 * @file `Media`'s screen states driven by an injected controller (no fetch): a first-load failure
 * replaces the whole screen, a later failure sits above the still-visible grid, the Videos tab's
 * own empty state, card metadata when the upload date or size is unknown, and the edit modal's
 * Cancel clearing the editing target.
 */

function item(overrides: Partial<MediaGridPage["media"][number]> = {}): MediaGridPage["media"][number] {
  return {
    id: "media-1",
    workspaceId: "workspace-local",
    title: "Sunset Photo",
    slug: "sunset-photo",
    alt: "A sunset over the ocean",
    caption: "",
    credit: "",
    sha256: "abc123",
    contentType: "image/png",
    status: "active",
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    htmlAttributes: null,
    ...overrides,
  } as MediaGridPage["media"][number];
}

function mediaController(overrides: Partial<MediaController> = {}): MediaController {
  return {
    media: [],
    counts: null,
    retentionDays: null,
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
    locale: "en",
    lookupMedia: overrides.media ?? [],
    ...overrides,
  };
}

function renderMedia(overrides: Partial<MediaController> = {}, tabId: string | null = null) {
  const controller = mediaController(overrides);
  const view = render(
    <FetchQueryProvider>
      <Media {...MEDIA_PROPS} hooks={{ ...requiredMediaHooks, useMediaHook: () => controller }} tabId={tabId} />
    </FetchQueryProvider>,
  );
  return { controller, ...view };
}

describe("Media screen states", () => {
  it("Media Trash explains retention and displays each supplied countdown", async () => {
    const policy = "Items moved to Trash now are permanently deleted after 30 days. Items trashed earlier keep the date shown on their row.";
    for (const scenario of [
      { tab: "trash", media: [] },
      { tab: "trash", media: [
        item({ id: "old", title: "Old photo", status: "trashed", trashDaysRemaining: 44 }),
        item({ id: "older", title: "Older photo", status: "trashed", trashDaysRemaining: 12 }),
      ] },
      { tab: "images", media: [item({ trashDaysRemaining: 44 })] },
    ]) {
      const port = createFakeMediaPort({ media: scenario.media });
      const listMediaGrid = port.listMediaGrid;
      port.listMediaGrid = async (view, page) => ({
        ...await listMediaGrid(view, page), ...(view.tab === "trash" ? { retentionDays: 30 } : {}),
      });
      const { container } = render(<FetchQueryProvider><Media {...MEDIA_PROPS} tabId={scenario.tab} hooks={{ ...requiredMediaHooks,
        useMediaHook: ({ tab, itemId }) => useMedia({ port, hooks: { useGridPages, useMediaWrites, useFetchMutation, useFetchQuery, useInvalidate, useContentRefreshSubscription },
          deps: { maxJsonUploadBytes: MEDIA_JSON_UPLOAD_MAX_BYTES, readFileAsBase64, translate: translateMediaCopy, describeApiError, sizeRefusalFromError }, tab, itemId, locale: "en", t: key => translateMediaCopy({ locale: "en", key }) }),
      }} /></FetchQueryProvider>);
      if (scenario.media.length === 0) await screen.findByText("Trash is empty.");
      else await waitFor(() => expect(container.querySelector(".media-card")).not.toBeNull());
      if (scenario.tab === "trash") expect(screen.getByText(policy)).toBeInTheDocument();
      else expect(screen.queryByText(policy)).not.toBeInTheDocument();
      if (scenario.tab === "trash" && scenario.media.length > 0) {
        const old = screen.getByRole("button", { name: "Old photo.png" }).closest<HTMLElement>(".media-card")!;
        const older = screen.getByRole("button", { name: "Older photo.png" }).closest<HTMLElement>(".media-card")!;
        expect(within(old).getByText("44 days left")).toBeInTheDocument();
        expect(within(older).getByText("12 days left")).toBeInTheDocument();
      } else expect(screen.queryByText("44 days left")).not.toBeInTheDocument();
      cleanup();
    }
  });

  it("replaces the whole screen with the error when the first load failed", () => {
    const { container } = renderMedia({ media: null, error: "Media is unavailable." });
    expect(container.textContent).toBe("Media is unavailable.");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("keeps the grid visible under a later failure's notice", () => {
    const { container } = renderMedia({ media: [item()], error: "Move to Trash failed." });
    expect(container.querySelector(".notice.error")).toHaveTextContent("Move to Trash failed.");
    expect(container.querySelector(".media-card")).not.toBeNull();
  });

  it("shows the Videos tab's own empty state", () => {
    // The server answered the Videos tab with no rows while the workspace holds one image: the screen
    // shows the tab's own empty state rather than the image, because it no longer filters by itself.
    renderMedia({ media: [], counts: { all: 1, images: 1, videos: 0, trash: 0 } }, "videos");
    expect(screen.getByText("No videos yet.")).toBeInTheDocument();
    expect(screen.getByText("Uploaded videos appear here once you add them.")).toBeInTheDocument();
  });

  it("shows the Images tab's own empty state", () => {
    renderMedia({ media: [], counts: { all: 1, images: 0, videos: 1, trash: 0 } }, "images");
    expect(screen.getByText("No images yet.")).toBeInTheDocument();
    expect(screen.getByText("Uploaded images appear here once you add them.")).toBeInTheDocument();
  });

  it("shows only the size when the upload date is unreadable, and no metadata line when both are unknown", () => {
    const { container } = renderMedia({
      media: [
        item({ id: "sized", title: "Sized", byteSize: 2048, createdAt: "not-a-date" }),
        item({ id: "bare", title: "Bare", byteSize: null, createdAt: "not-a-date" }),
      ],
    });
    const lines = container.querySelectorAll(".media-card-size");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.querySelector("time")).toBeNull();
    expect(lines[0]?.textContent).toMatch(/KB/);
  });

  it("gives each trashed card a named Restore button that restores that item", () => {
    const trashed = item({ id: "gone", title: "Old photo", status: "trashed" });
    const { controller } = renderMedia({ media: [trashed] }, "trash");
    fireEvent.click(screen.getByRole("button", { name: "Restore: Old photo" }));
    expect(controller.restore).toHaveBeenCalledWith(trashed);
  });

  it("disables Restore while that row is saving, and shows none on active cards", () => {
    const trashed = item({ id: "gone", title: "Old photo", status: "trashed" });
    renderMedia({ media: [trashed], rowSavingId: "gone" }, "trash");
    expect(screen.getByRole("button", { name: "Restore: Old photo" })).toBeDisabled();
    cleanup();
    renderMedia({ media: [item()] });
    expect(screen.queryByRole("button", { name: /^Restore/ })).not.toBeInTheDocument();
  });

  it("Cancel in the edit modal clears the editing target", () => {
    const editing = item();
    const { controller, container } = renderMedia({ media: [editing], editingId: editing.id, editingItem: editing });
    const dialog = container.querySelector("dialog.media-edit-dialog") as HTMLElement;
    fireEvent.click(within(dialog).getByText("Cancel"));
    expect(controller.setEditingId).toHaveBeenCalledWith(null);
  });
});

it("the admin media mount passes a distinct injected hook state to the screen", async () => {
  const mount = renderMediaPanel({ query: new URLSearchParams() } as PanelRouteContext);
  const useMediaHook = vi.fn(() => mediaController({ media: null, error: "Injected mount state 731" }));
  const { container } = render(<FetchQueryProvider><Suspense fallback={null}>{cloneElement(mount, { hooks: { ...mount.props.hooks, useMediaHook } })}</Suspense></FetchQueryProvider>);
  await screen.findByText("Injected mount state 731");
  expect(useMediaHook).toHaveBeenCalled();
  expect(container.textContent).toBe("Injected mount state 731");
});
