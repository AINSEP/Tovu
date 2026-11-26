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
import { fireEvent, render, screen, waitFor, within } from "@/__tests__/render-with-jini-kits";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Media } from "../Media";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { useMediaProviderCatalog } from "@jini-ai/cms/react/media/use-media-provider-catalog.hooks";

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
  useMediaItemLinkHook: useMediaItemLink, useMediaProviderCatalogHook: useMediaProviderCatalog,
};

/** Clicking a card's picture opens the shared lightbox at that item; prev/next cycle. */

function item(id: string, title: string, createdAt: string) {
  return {
    id, workspaceId: "workspace-local", title, slug: id, alt: `${title} alt`, caption: "", credit: "",
    sha256: id, contentType: "image/png", status: "active", createdAt, updatedAt: createdAt, version: 1,
    width: null, height: null, cssClass: null, htmlAttributes: null,
  };
}
const ITEMS = [
  item("m-a", "Alpha", "2026-07-03T00:00:00.000Z"),
  item("m-b", "Beta", "2026-07-02T00:00:00.000Z"),
  item("m-c", "Gamma", "2026-07-01T00:00:00.000Z"),
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = String(url).includes("/settings/effective") ? { data: [] } : { media: ITEMS };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("media preview click opens lightbox", () => {
  it("clicking the picture itself opens the lightbox at that item, and next/prev cycle", async () => {
    const user = userEvent.setup();
    render(<FetchQueryProvider><Media {...requiredMediaHooks} /></FetchQueryProvider>);
    // why: the card title is now the file name with its extension, split by MiddleTruncate into head/tail spans; its full name is the InfoTip trigger's accessible name.
    const card = (await screen.findByRole("button", { name: "Beta.png" })).closest(".media-card") as HTMLElement;

    await user.click(card.querySelector(".media-card-preview img")!);

    const dialog = document.querySelector("dialog.media-lightbox") as HTMLElement;
    await waitFor(() => expect(within(dialog).getByRole("heading", { name: "Beta" })).toBeInTheDocument());
    await user.click(within(dialog).getByRole("button", { name: /next asset/i }));
    expect(within(dialog).getByRole("heading", { name: "Gamma" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /previous asset/i }));
    await user.click(within(dialog).getByRole("button", { name: /previous asset/i }));
    expect(within(dialog).getByRole("heading", { name: "Alpha" })).toBeInTheDocument();
  });

  // why: until 2026-10-29 a card's video carried native controls, so a click on it had to stay
  // with the player. The owner's grid design made the card a still frame (no controls) that opens
  // the lightbox, where the video plays at its real shape.
  it("video cards: the still frame (no controls) opens the lightbox, which plays it with controls", async () => {
    const user = userEvent.setup();
    render(<FetchQueryProvider><Media {...requiredMediaHooks} /></FetchQueryProvider>);
    // why: the card title is now the file name with its extension, split by MiddleTruncate into head/tail spans; its full name is the InfoTip trigger's accessible name.
    const card = (await screen.findByRole("button", { name: "Beta.png" })).closest(".media-card") as HTMLElement;
    fireEvent.error(card.querySelector(".media-card-preview img")!);
    const video = await waitFor(() => {
      const v = card.querySelector(".media-card-preview video");
      expect(v).not.toBeNull();
      return v as HTMLElement;
    });
    expect(video.hasAttribute("controls")).toBe(false);
    expect(video.closest("button")).toBe(within(card).getByRole("button", { name: /view "beta" larger/i }));

    await user.click(video);
    const dialog = document.querySelector("dialog.media-lightbox") as HTMLElement;
    expect(within(dialog).getByRole("heading", { name: "Beta" })).toBeInTheDocument();
    // The lightbox runs the same image-then-video fallback; its player keeps native controls.
    fireEvent.error(dialog.querySelector("img")!);
    await waitFor(() => expect(dialog.querySelector("video")).toHaveAttribute("controls"));
  });
});
