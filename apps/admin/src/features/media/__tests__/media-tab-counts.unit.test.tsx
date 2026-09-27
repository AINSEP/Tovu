import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Media } from "../Media";
import { resolveMediaTabs } from "../Media.hooks";
import { mediaContentTabCounts } from "../rules";
import { MEDIA_PROVIDER_CATALOG } from "../media-provider-catalog";
import type { AdminMedia } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";

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
    expect(mediaContentTabCounts(null)).toEqual({});
  });

  it("counts all/images/videos correctly for a mixed set, matching filterMediaByTab exactly", () => {
    const media = [IMAGE_A, IMAGE_B, VIDEO_A, UNTYPED];
    expect(mediaContentTabCounts(media)).toEqual({ all: 4, images: 2, videos: 1 });
  });

  it("updates when an item is added", () => {
    const before = mediaContentTabCounts([IMAGE_A, VIDEO_A]);
    const after = mediaContentTabCounts([IMAGE_A, VIDEO_A, IMAGE_B]);
    expect(before).toEqual({ all: 2, images: 1, videos: 1 });
    expect(after).toEqual({ all: 3, images: 2, videos: 1 });
  });

  it("updates when an item is removed", () => {
    const before = mediaContentTabCounts([IMAGE_A, IMAGE_B, VIDEO_A]);
    const after = mediaContentTabCounts([IMAGE_A, VIDEO_A]);
    expect(before).toEqual({ all: 3, images: 2, videos: 1 });
    expect(after).toEqual({ all: 2, images: 1, videos: 1 });
  });

  it("has no count of its own for a tab with zero matching items — 0 is still a real count, not an absence", () => {
    // Zero is a legitimate, correct answer here ("Videos 0"), distinct from the {} loading state
    // above (no key at all). `TabBar`'s own `count !== undefined` check renders a "0" badge for
    // this case, which is correct: unlike the loading state, this IS a known count.
    expect(mediaContentTabCounts([IMAGE_A]).videos).toBe(0);
  });
});

describe("resolveMediaTabs — count wiring", () => {
  const t = (key: string) => key;

  it("attaches each tab's count from the given map, by id", () => {
    const tabs = resolveMediaTabs(t, { all: 4, images: 2, videos: 1, "external-providers": 9 });
    expect(tabs.find((tab) => tab.id === "all")?.count).toBe(4);
    expect(tabs.find((tab) => tab.id === "images")?.count).toBe(2);
    expect(tabs.find((tab) => tab.id === "videos")?.count).toBe(1);
    expect(tabs.find((tab) => tab.id === "external-providers")?.count).toBe(9);
  });

  it("leaves a tab's count undefined (no badge) when the map has no entry for it", () => {
    const tabs = resolveMediaTabs(t, { all: 4 });
    expect(tabs.find((tab) => tab.id === "images")?.count).toBeUndefined();
  });

  it("defaults to an empty map when called with no counts at all, unchanged from before this feature", () => {
    const tabs = resolveMediaTabs(t);
    expect(tabs.every((tab) => tab.count === undefined)).toBe(true);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function renderScreen(props: React.ComponentProps<typeof Media> = {}) {
  return render(
    <FetchQueryProvider>
      <Media {...props} />
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
  it("shows each content tab's real item count, and External Providers' fixed catalog size", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/locale")) return Promise.resolve(jsonResponse({ locale: "en" }));
      return Promise.resolve(jsonResponse({ media: [IMAGE_A, IMAGE_B, VIDEO_A] }));
    });
    renderScreen();
    await screen.findByText("Image A");

    expect(tabCount("All")).toBe("3");
    expect(tabCount("Images")).toBe("2");
    expect(tabCount("Videos")).toBe("1");
    // Not fetched, not media-derived — the same fixed roster `ExternalProvidersPanel`'s own
    // `MediaProvidersTab` renders one card per entry from (`Media.tsx`'s own comment on this).
    expect(tabCount("External Providers")).toBe(String(MEDIA_PROVIDER_CATALOG.length));
  });

  it("hides every badge during the initial load, before media has ever resolved", () => {
    // Never resolves within this test — pins the loading state itself, not what it settles into.
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    renderScreen();

    expect(screen.getByText(/Loading media/i)).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("updates the All/Videos counts after an item is permanently deleted from the grid", async () => {
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
      if (url.includes("/media")) return Promise.resolve(jsonResponse({ media: items }));
      return Promise.reject(new Error(`media-tab-counts test: no mocked route for ${method} ${url}`));
    });
    renderScreen();
    await screen.findByText("Image A");
    expect(tabCount("All")).toBe("2");
    expect(tabCount("Videos")).toBe("1");

    const card = screen.getByText("Video A").closest(".media-card") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: /actions for "video a"/i }));
    await user.click(screen.getByRole("menuitem", { name: /delete permanently/i }));
    await screen.findByText("Delete permanently?");
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => expect(tabCount("All")).toBe("1"));
    expect(tabCount("Videos")).toBe("0");
  });
});
