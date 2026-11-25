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
import { render, screen, waitFor, within } from "@/__tests__/render-with-jini-kits";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Icon } from "@jini-ai/ui";
import { Media } from "../Media";
import { resolveMediaTabs } from "@jini-ai/admin/screens/media/media-tabs.hooks";
import { mediaContentTabCounts } from "@jini-ai/admin/screens/media/rules";

/** The host's live provider catalog, as `GET .../media/providers/catalog` answers it. */
const LIVE_CATALOG = {
  providers: [
    { id: "nanobanana", label: "Nano Banana" },
    { id: "xai-grok-imagine", label: "xAI Grok Imagine", models: ["grok-imagine-image", "grok-imagine-video"] },
    { id: "openai", label: "OpenAI" },
  ],
};
import type { AdminMedia } from "@jini-ai/core/contracts/site/cms-admin-media";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { gridResponseBody, isGridUrl } from "./media-grid-fetch.test-helper";
import { useMediaProviderCatalog } from "../use-media-provider-catalog.hooks";

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

/**
 * @file Owner ask (2026-09-26): a count next to each Media tab — "All 42 · Images 30 · Videos 12 ·
 * External Providers N". Covers the three layers that ask touches:
 *
 * 1. `rules.ts`'s `mediaContentTabCounts` — the pure derivation, same shape as
 *    `media-type-filter.unit.test.tsx`'s coverage of its sibling `filterMediaByTab`.
 * 2. `Media.hooks.tsx`'s `resolveMediaTabs` — wiring those counts onto `TabBarTab.count` by id.
 * 3. `Media.tsx` end to end — the tab bar actually shows the right numbers, and they follow the
 *    grid when an item is added or removed (owner requirement, not just a static snapshot).
 *
 * A tab's count renders as visible text immediately after its label with no separating DOM text
 * node (`TabBar.tsx`'s own `count` span has none), so `screen.getByRole("tab", { name: "Videos" })`
 * cannot exact-match once a badge is present — `TabBar.unit.test.tsx`'s own count test already
 * documents this ("Tab A3") and matches by substring for the same reason; this file's render tests
 * do too, then read the actual number back out of the tab's own `.tab-bar-count` child rather than
 * parsing it back out of the concatenated accessible name.
 */

function makeItem(overrides: Partial<AdminMedia> & { id: string }): AdminMedia {
  return {
    workspaceId: "workspace-local",
    title: overrides.id,
    slug: overrides.id,
    alt: "",
    caption: "",
    credit: "",
    sha256: `sha-${overrides.id}`,
    status: "active",
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    htmlAttributes: null,
    contentType: null,
    publicUrl: null,
    ...overrides,
  };
}

const IMAGE_A = makeItem({ id: "img-a", title: "Image A", contentType: "image/png" });
const IMAGE_B = makeItem({ id: "img-b", title: "Image B", contentType: "image/webp" });
const VIDEO_A = makeItem({ id: "vid-a", title: "Video A", contentType: "video/mp4" });
const UNTYPED = makeItem({ id: "untyped-a", title: "Untyped Asset", contentType: null });

describe("mediaContentTabCounts", () => {
  it("returns {} — no key at all — while media is still loading (null), so no tab shows a badge", () => {
    expect(mediaContentTabCounts({ media: null })).toEqual({});
  });

  it("counts all/images/videos correctly for a mixed set, matching filterMediaByTab exactly", () => {
    const media = [IMAGE_A, IMAGE_B, VIDEO_A, UNTYPED];
    expect(mediaContentTabCounts({ media })).toEqual({ all: 4, images: 2, videos: 1, trash: 0 });
  });

  it("updates when an item is added", () => {
    const before = mediaContentTabCounts({ media: [IMAGE_A, VIDEO_A] });
    const after = mediaContentTabCounts({ media: [IMAGE_A, VIDEO_A, IMAGE_B] });
    expect(before).toEqual({ all: 2, images: 1, videos: 1, trash: 0 });
    expect(after).toEqual({ all: 3, images: 2, videos: 1, trash: 0 });
  });

  it("updates when an item is removed", () => {
    const before = mediaContentTabCounts({ media: [IMAGE_A, IMAGE_B, VIDEO_A] });
    const after = mediaContentTabCounts({ media: [IMAGE_A, VIDEO_A] });
    expect(before).toEqual({ all: 3, images: 2, videos: 1, trash: 0 });
    expect(after).toEqual({ all: 2, images: 1, videos: 1, trash: 0 });
  });

  it("has no count of its own for a tab with zero matching items — 0 is still a real count, not an absence", () => {
    // Zero is a legitimate, correct answer here ("Videos 0"), distinct from the {} loading state
    // above (no key at all). `TabBar`'s own `count !== undefined` check renders a "0" badge for
    // this case, which is correct: unlike the loading state, this IS a known count.
    expect(mediaContentTabCounts({ media: [IMAGE_A] }).videos).toBe(0);
  });

  it("counts a trashed item only on Trash, never on All/Images/Videos", () => {
    const media = [IMAGE_A, { ...IMAGE_B, status: "trashed" as const }, { ...VIDEO_A, status: "trashed" as const }];
    expect(mediaContentTabCounts({ media })).toEqual({ all: 1, images: 1, videos: 0, trash: 2 });
  });
});

describe("resolveMediaTabs — count wiring", () => {
  const t = (key: string) => key;

  it("attaches each tab's count from the given map, by id", () => {
    const tabs = resolveMediaTabs({ t, Icon }, { counts: { all: 4, images: 2, videos: 1, "external-providers": 9, trash: 3 } });
    expect(tabs.find((tab) => tab.id === "all")?.count).toBe(4);
    expect(tabs.find((tab) => tab.id === "images")?.count).toBe(2);
    expect(tabs.find((tab) => tab.id === "videos")?.count).toBe(1);
    expect(tabs.find((tab) => tab.id === "external-providers")?.count).toBe(9);
    expect(tabs.find((tab) => tab.id === "trash")?.count).toBe(3);
  });

  it("leaves a tab's count undefined (no badge) when the map has no entry for it", () => {
    const tabs = resolveMediaTabs({ t, Icon }, { counts: { all: 4 } });
    expect(tabs.find((tab) => tab.id === "images")?.count).toBeUndefined();
  });

  it("defaults to an empty map when called with no counts at all, unchanged from before this feature", () => {
    const tabs = resolveMediaTabs({ t, Icon });
    expect(tabs.every((tab) => tab.count === undefined)).toBe(true);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function renderScreen(props: Partial<React.ComponentProps<typeof Media>> = {}) {
  return render(
    <FetchQueryProvider>
      <Media {...requiredMediaHooks} {...props} />
    </FetchQueryProvider>
  );
}

/** Reads the number shown on one tab's own count badge, or `null` if it has none. Scopes to the
 *  tab by a substring match on its label ({@link TabBar.unit.test.tsx}'s own documented reason: the
 *  badge concatenates onto the accessible name with no separator), then reads the badge's OWN text
 *  rather than parsing the run-together name back apart. */
function tabCount(labelSubstring: string): string | null {
  const tab = screen.getByRole("tab", { name: new RegExp(`^${labelSubstring}`) });
  return tab.querySelector(".tab-bar-count")?.textContent ?? null;
}

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("Media screen — tab counts", () => {
  it("opens the real provider tab with catalog policy and recognizes legacy provider ids", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/locale")) return Promise.resolve(jsonResponse({ locale: "en" }));
      if (url.includes("/media/providers/catalog")) return Promise.resolve(jsonResponse(LIVE_CATALOG));
      if (url.includes("/media/providers")) return Promise.resolve(jsonResponse({ "nano-banana": { apiKeyConfigured: true, apiKeyTail: "4321" } }));
      if (isGridUrl({ url })) return Promise.resolve(jsonResponse(gridResponseBody({ url, media: [] })));
      return Promise.resolve(jsonResponse({ media: [] }));
    });
    renderScreen({ tabId: "external-providers" });
    const key = await screen.findByLabelText("Nano Banana API key");
    await waitFor(() => expect(key).toHaveAttribute("placeholder", expect.stringContaining("4321")));
    expect(key).toHaveValue("");
  });

  it("shows each content tab's real item count, and External Providers' count from the live catalog", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/locale")) return Promise.resolve(jsonResponse({ locale: "en" }));
      if (url.includes("/media/providers/catalog")) return Promise.resolve(jsonResponse(LIVE_CATALOG));
      if (isGridUrl({ url })) return Promise.resolve(jsonResponse(gridResponseBody({ url, media: [IMAGE_A, IMAGE_B, VIDEO_A] })));
      return Promise.resolve(jsonResponse({ media: [IMAGE_A, IMAGE_B, VIDEO_A] }));
    });
    renderScreen();
    // why: the card title is now the file name with its extension, split by MiddleTruncate into head/tail spans; its full name is the InfoTip trigger's accessible name.
    await screen.findByRole("button", { name: "Image A.png" });

    expect(tabCount("All")).toBe("3");
    expect(tabCount("Images")).toBe("2");
    expect(tabCount("Videos")).toBe("1");
    // Not media-derived — the host's live catalog, the same array `ExternalProvidersPanel` maps cards from.
    await waitFor(() => expect(tabCount("External Providers")).toBe(String(LIVE_CATALOG.providers.length)));
  });

  it("renders one xAI card (with its configured-key marker) and counts it once", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/locale")) return Promise.resolve(jsonResponse({ locale: "en" }));
      if (url.includes("/media/providers/catalog")) return Promise.resolve(jsonResponse(LIVE_CATALOG));
      if (url.includes("/media/providers")) return Promise.resolve(jsonResponse({ "xai-grok-imagine": { apiKeyConfigured: true, apiKeyTail: "9876" } }));
      if (isGridUrl({ url })) return Promise.resolve(jsonResponse(gridResponseBody({ url, media: [] })));
      return Promise.resolve(jsonResponse({ media: [] }));
    });
    renderScreen({ tabId: "external-providers" });
    const key = await screen.findByLabelText("xAI Grok Imagine API key");
    await waitFor(() => expect(key).toHaveAttribute("placeholder", expect.stringContaining("9876")));
    expect(screen.getAllByLabelText("xAI Grok Imagine API key")).toHaveLength(1);
    expect(tabCount("External Providers")).toBe("3");
  });

  it("shows no External Providers badge when the host catalog cannot be read", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/locale")) return Promise.resolve(jsonResponse({ locale: "en" }));
      if (url.includes("/media/providers/catalog")) return Promise.resolve(jsonResponse({ error: "unavailable" }, 503));
      if (isGridUrl({ url })) return Promise.resolve(jsonResponse(gridResponseBody({ url, media: [IMAGE_A] })));
      return Promise.resolve(jsonResponse({ media: [IMAGE_A] }));
    });
    renderScreen();
    await screen.findByRole("button", { name: "Image A.png" });
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/media/providers/catalog"))).toBe(true));
    expect(tabCount("External Providers")).toBeNull();
  });

  it("hides every badge during the initial load, before media has ever resolved", () => {
    // Never resolves within this test — pins the loading state itself, not what it settles into.
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    renderScreen();

    expect(screen.getByText(/Loading media/i)).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("lists a trashed item on Trash only and updates the Trash count after it is permanently deleted", async () => {
    const user = userEvent.setup();
    let items: AdminMedia[] = [IMAGE_A, { ...VIDEO_A, status: "trashed" }];
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/locale")) return Promise.resolve(jsonResponse({ locale: "en" }));
      if (method === "DELETE" && url.includes(`/media/${VIDEO_A.id}`)) {
        items = items.filter((item) => item.id !== VIDEO_A.id);
        return Promise.resolve(jsonResponse({ purged: true }));
      }
      if (isGridUrl({ url })) return Promise.resolve(jsonResponse(gridResponseBody({ url, media: items })));
      if (url.includes("/media")) return Promise.resolve(jsonResponse({ media: items }));
      return Promise.reject(new Error(`media-tab-counts test: no mocked route for ${method} ${url}`));
    });
    renderScreen({ tabId: "trash" });
    // why: the card title is now the file name with its extension, split by MiddleTruncate into head/tail spans; its full name is the InfoTip trigger's accessible name.
    await screen.findByRole("button", { name: "Video A.mp4" });
    expect(screen.queryByRole("button", { name: /^Image A/ })).not.toBeInTheDocument();
    expect(tabCount("All")).toBe("1");
    expect(tabCount("Videos")).toBe("0");
    expect(tabCount("Trash")).toBe("1");

    const card = screen.getByRole("button", { name: "Video A.mp4" }).closest(".media-card") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: /actions for "video a"/i }));
    await user.click(screen.getByRole("menuitem", { name: /delete permanently/i }));
    await screen.findByText("Delete permanently?");
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => expect(tabCount("Trash")).toBe("0"));
    expect(tabCount("All")).toBe("1");
    expect(await screen.findByText("Trash is empty.")).toBeInTheDocument();
  });
});
