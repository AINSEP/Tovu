import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Media } from "../Media";
import type { MediaController } from "../hooks/use-media.hooks";
import type { AdminMedia } from "@/lib/api";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";

/**
 * @file `Media`'s screen states driven by an injected controller (no fetch): a first-load failure
 * replaces the whole screen, a later failure sits above the still-visible grid, the Videos tab's
 * own empty state, card metadata when the upload date or size is unknown, and the edit modal's
 * Cancel clearing the editing target.
 */

function item(overrides: Partial<AdminMedia> = {}): AdminMedia {
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
  } as AdminMedia;
}

function mediaController(overrides: Partial<MediaController> = {}): MediaController {
  return {
    media: [],
    error: null,
    uploading: false,
    uploadOpen: false,
    openUpload: vi.fn(),
    closeUpload: vi.fn(),
    uploadError: null,
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
    ...overrides,
  };
}

function renderMedia(overrides: Partial<MediaController> = {}, tabId: string | null = null) {
  const controller = mediaController(overrides);
  const view = render(
    <FetchQueryProvider>
      <Media useMediaHook={() => controller} tabId={tabId} />
    </FetchQueryProvider>,
  );
  return { controller, ...view };
}

describe("Media screen states", () => {
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
    renderMedia({ media: [item()] }, "videos");
    expect(screen.getByText("No videos yet.")).toBeInTheDocument();
    expect(screen.getByText("Uploaded videos appear here once you add them.")).toBeInTheDocument();
  });

  it("shows the Images tab's own empty state", () => {
    renderMedia({ media: [item({ contentType: "video/mp4" })] }, "images");
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
