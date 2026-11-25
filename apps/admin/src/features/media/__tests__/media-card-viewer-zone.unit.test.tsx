import { render } from "@/__tests__/render-with-jini-kits";
import { expect, it, vi } from "vitest";
import type { AdminMedia } from "@jini-ai/core/contracts/site/cms-admin-media";

import { Media } from "../Media";
import type { MediaController } from "../hooks/use-media.hooks";

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
    locale: "en-US",
  };
  const { container } = render(
    <Media useMediaHook={() => controller} viewerTimeZone="America/Los_Angeles" />,
  );
  const time = container.querySelector(".media-card time");
  expect(time).toHaveTextContent("Nov 24, 2026");
  expect(time).toHaveAttribute("datetime", "2026-11-25T07:30:00.000Z");
});
