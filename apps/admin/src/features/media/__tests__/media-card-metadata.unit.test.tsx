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
import { render, screen } from "@/__tests__/render-with-jini-kits";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { Media } from "@jini-ai/admin/screens/media/Media";
import { MEDIA_PROPS } from "@/media-panel";
import { useMediaProviderCatalog } from "@jini-ai/cms/react/media/use-media-provider-catalog.hooks";

const requiredMediaHooks = {
  ...MEDIA_PROPS.hooks,
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

afterEach(() => vi.unstubAllGlobals());

describe("legacy media cards", () => {
  it("renders size and upload date beneath status with the original timestamp on time", async () => {
    const createdAt = "2026-10-03T23:30:00-02:00";
    const item = {
      id: "metadata-card", workspaceId: "workspace-local", title: "Metadata photo", slug: "metadata-photo",
      alt: "", caption: "", credit: "", sha256: "hash", status: "active", createdAt, updatedAt: createdAt,
      version: 1, width: null, height: null, cssClass: null, htmlAttributes: null,
      contentType: "image/png", publicUrl: null, byteSize: 9_961_472,
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.includes("/settings/effective") ? { data: [] }
        : url.includes("/users") ? { users: [] } : { media: [item] };
      return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
    }));
    render(<FetchQueryProvider><Media {...MEDIA_PROPS} hooks={requiredMediaHooks} /></FetchQueryProvider>);
    // why: the card title is now the file name with its extension, split by MiddleTruncate into head/tail spans; its full name is the InfoTip trigger's accessible name.
    const title = await screen.findByRole("button", { name: "Metadata photo.png" });
    const card = title.closest(".media-card")!;
    const line = card.querySelector(".media-card-size")!;
    // The date sits alone on the row's right edge; the specs stay left.
    expect(line.querySelector(".media-card-specs")).toHaveTextContent("9.5 MB");
    expect(line.querySelector("time")).toHaveTextContent("Oct 4, 2026");
    expect(line.querySelector("time")).toHaveAttribute("datetime", createdAt);
    expect(card.querySelector(".status-active")).toBeInTheDocument();
  });
});
