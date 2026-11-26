import { t as translateMediaCopy } from "../media-i18n";
import { useFetchMutation, useFetchQuery, useInvalidate } from "@jini-ai/ui/fetch-query";
import { useContentRefreshSubscription } from "@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks";
import { readFileAsBase64 } from "@jini-ai/admin/screens/media/rules";
import { sizeRefusalFromError } from "../upload-size-copy";
import { describeApiError } from "@/lib/admin-http/request";
import { render, screen, waitFor } from "@/__tests__/render-with-jini-kits";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { Media } from "../Media";
import { useMedia } from "@jini-ai/admin/screens/media/hooks/use-media.hooks";
import { createFakeMediaPort } from "../hooks/media-dependencies.hooks";
import { MEDIA_DICT, t as translate } from "../media-i18n";
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
import { useGridPages } from "@jini-ai/cms/react/media/hooks/use-grid-pages.hooks";
import { useMediaWrites } from "@jini-ai/cms/react/media/hooks/use-media-writes.hooks";

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

/**
 * @file B-VIDEO-NOTE.T: the server answers a stored-but-not-converted video with the fixed
 * `conversionNotice` code. The upload still succeeded, so the dialog closes and the list refreshes; the
 * localized, non-error status stays on the page (outside the closed dialog) until the next upload
 * that carries no notice.
 */

const NOTICE_COPY = "The video was saved as uploaded. A web-playable copy could not be made.";

function renderWithPort(port: ReturnType<typeof createFakeMediaPort>) {
  const t = (key: string) => translate({ locale: "en", key });
  return render(
    <FetchQueryProvider>
      <Media {...requiredMediaHooks} useMediaHook={() => useMedia({ port, hooks: { useGridPages, useMediaWrites, useFetchMutation, useFetchQuery, useInvalidate, useContentRefreshSubscription }, deps: { readFileAsBase64, translate: translateMediaCopy, describeApiError, sizeRefusalFromError }, tab: "all", locale: "en", t })} />
    </FetchQueryProvider>,
  );
}

async function uploadVideo(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: "Upload image or video" }));
  await user.upload(screen.getByLabelText("File to upload"), new File([new Uint8Array([0, 0, 0, 24])], name, { type: "video/mp4" }));
  await user.click(screen.getByRole("button", { name: "Upload" }));
}

describe("conversion notice after a successful upload", () => {
  it("Media shows a saved-without-playable-copy status after a successful upload", async () => {
    const user = userEvent.setup();
    const port = createFakeMediaPort();
    const store = port.uploadMedia;
    let withNotice = true;
    port.uploadMedia = async (input, options) => {
      const result = await store(input, options);
      return withNotice ? { ...result, conversionNotice: "web-copy-unavailable" as const } : result;
    };
    // The paged grid (P10-M4.T) reads through `listMediaGrid`; each upload must refresh it once.
    const listMediaGrid = vi.spyOn(port, "listMediaGrid");
    renderWithPort(port);
    await waitFor(() => expect(listMediaGrid).toHaveBeenCalledTimes(1));

    await uploadVideo(user, "holiday.mp4");

    const notice = await screen.findByText(NOTICE_COPY);
    expect(notice.closest('[role="status"]')).not.toBeNull();
    expect(notice.closest(".media-upload-dialog")).toBeNull();
    expect(notice.closest(".notice.error, [role='alert']")).toBeNull();
    expect(document.querySelector(".media-upload-dialog")).not.toHaveAttribute("open");
    await waitFor(() => expect(listMediaGrid).toHaveBeenCalledTimes(2));

    withNotice = false;
    await uploadVideo(user, "second.mp4");
    await waitFor(() => expect(listMediaGrid).toHaveBeenCalledTimes(3));
    expect(screen.queryByText(NOTICE_COPY)).toBeNull();
    expect(port.items).toHaveLength(2);
  });

  it("localizes the notice for every existing locale", () => {
    expect(Object.keys(MEDIA_DICT)).toHaveLength(21);
    for (const [locale, dictionary] of Object.entries(MEDIA_DICT)) {
      expect(dictionary[NOTICE_COPY], locale).toBeTruthy();
      expect(dictionary[NOTICE_COPY], locale).not.toBe(NOTICE_COPY);
    }
  });
});
