import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Media } from "../Media";
import { filterMediaByTab, hasUntypedMedia } from "../rules";
import type { AdminMedia } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";

/**
 * @file The Media screen's "Images"/"Videos" type filter — the UI half of the `contentType` field
 * the admin list response now carries (`server/http/admin/media.ts`).
 *
 * Both tabs used to render a "Filtering by type isn't wired up yet." placeholder because
 * `AdminMedia` had no type to filter on at all. The load-bearing behavior now is not just that
 * filtering happens, but WHERE an untyped row goes: `contentType: null` means "this blob's bytes
 * could not be read", and such a row must stay visible in All with an explicit note on the
 * filtered tabs, never silently vanish from the screen entirely.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function makeItem(overrides: Partial<AdminMedia> & { id: string }): AdminMedia {
  return {
    workspaceId: "workspace-local",
    title: overrides.id,
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
    contentType: null,
    ...overrides,
  };
}

const PNG = makeItem({ id: "png-1", title: "Sunset Photo", contentType: "image/png" });
const WEBP = makeItem({ id: "webp-1", title: "Banner Art", contentType: "image/webp" });
const MP4 = makeItem({ id: "mp4-1", title: "Launch Clip", contentType: "video/mp4" });
const BINARY = makeItem({ id: "bin-1", title: "Mystery Blob", contentType: "application/octet-stream" });
const UNTYPED = makeItem({ id: "untyped-1", title: "Unreadable Asset", contentType: null });

const ALL_ITEMS = [PNG, WEBP, MP4, BINARY, UNTYPED];

describe("filterMediaByTab", () => {
  it("returns every item for the All tab, including untyped and unrecognized ones", () => {
    expect(filterMediaByTab(ALL_ITEMS, "all")).toEqual(ALL_ITEMS);
  });

  it("returns only image/* items for the Images tab", () => {
    expect(filterMediaByTab(ALL_ITEMS, "images").map((m) => m.id)).toEqual(["png-1", "webp-1"]);
  });

  it("returns only video/* items for the Videos tab", () => {
    expect(filterMediaByTab(ALL_ITEMS, "videos").map((m) => m.id)).toEqual(["mp4-1"]);
  });

  it("excludes a recognized-but-unpreviewable type from both filtered tabs rather than guessing", () => {
    // `application/octet-stream` is a REAL sniffer answer, not a missing one — it is neither an
    // image nor a video, so it belongs in All only.
    expect(filterMediaByTab(ALL_ITEMS, "images").some((m) => m.id === "bin-1")).toBe(false);
    expect(filterMediaByTab(ALL_ITEMS, "videos").some((m) => m.id === "bin-1")).toBe(false);
    expect(filterMediaByTab(ALL_ITEMS, "all").some((m) => m.id === "bin-1")).toBe(true);
  });

  it("never drops an untyped item from the All tab", () => {
    expect(filterMediaByTab(ALL_ITEMS, "all").some((m) => m.id === "untyped-1")).toBe(true);
  });
});

describe("hasUntypedMedia", () => {
  it("is true when any item has no recorded content type", () => {
    expect(hasUntypedMedia(ALL_ITEMS)).toBe(true);
  });

  it("is false once every item is typed, so the disclosure note stays off the normal screen", () => {
    expect(hasUntypedMedia([PNG, WEBP, MP4, BINARY])).toBe(false);
  });
});

function renderScreen(props: React.ComponentProps<typeof Media> = {}) {
  return render(
    <FetchQueryProvider>
      <Media {...props} />
    </FetchQueryProvider>
  );
}

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

function mockList(items: AdminMedia[]) {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/locale")) return Promise.resolve(jsonResponse({ locale: "en" }));
    return Promise.resolve(jsonResponse({ media: items }));
  });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Media screen type tabs", () => {
  it("shows only images on the Images tab", async () => {
    mockList(ALL_ITEMS);
    renderScreen({ tabId: "images" });

    expect(await screen.findByText("Sunset Photo")).toBeInTheDocument();
    expect(screen.getByText("Banner Art")).toBeInTheDocument();
    expect(screen.queryByText("Launch Clip")).not.toBeInTheDocument();
    expect(screen.queryByText("Mystery Blob")).not.toBeInTheDocument();
  });

  it("shows only videos on the Videos tab", async () => {
    mockList(ALL_ITEMS);
    renderScreen({ tabId: "videos" });

    expect(await screen.findByText("Launch Clip")).toBeInTheDocument();
    expect(screen.queryByText("Sunset Photo")).not.toBeInTheDocument();
  });

  it("explains where untyped items went instead of silently hiding them", async () => {
    mockList(ALL_ITEMS);
    renderScreen({ tabId: "images" });

    await screen.findByText("Sunset Photo");
    expect(screen.getByText(/no detected type/i)).toBeInTheDocument();
  });

  it("omits the untyped note entirely when every item is typed", async () => {
    mockList([PNG, WEBP, MP4]);
    renderScreen({ tabId: "images" });

    await screen.findByText("Sunset Photo");
    expect(screen.queryByText(/no detected type/i)).not.toBeInTheDocument();
  });

  it("keeps an untyped item visible on the All tab", async () => {
    mockList(ALL_ITEMS);
    renderScreen({ tabId: "all" });

    expect(await screen.findByText("Unreadable Asset")).toBeInTheDocument();
  });

  it("shows a type-specific empty state rather than the generic no-media one", async () => {
    mockList([PNG]);
    renderScreen({ tabId: "videos" });

    expect(await screen.findByText("No videos yet.")).toBeInTheDocument();
    expect(screen.queryByText("No media uploaded yet.")).not.toBeInTheDocument();
    // Regression (2026-09-07, alongside the upload picker's accept-list fix): this used to read
    // "Only image uploads are supported right now.", which became false the moment the file picker
    // and the server both accept video — see `MediaTypeEmptyState`'s own doc comment for the history.
    expect(screen.queryByText("Only image uploads are supported right now.")).not.toBeInTheDocument();
    expect(screen.getByText("Uploaded videos appear here once you add them.")).toBeInTheDocument();
  });
});
