import { describe, expect, it } from "vitest";
import type { AdminMedia } from "../../lib/api";
import {
  appendMediaSlugs,
  hasModeContent,
  htmlAttributesToRows,
  inactiveTabWillBeDropped,
  insertAtSelection,
  isDroppedAttributeRow,
  legacyImagesToItems,
  lineCount,
  MAX_MEDIA_ITEMS,
  mediaKindOf,
  mediaLayoutsFor,
  mediaSlugProblem,
  mediaSnippetFor,
  moveMediaItem,
  readMediaContent,
  rowsToHtmlAttributes,
  slugCanShowEnd,
  switchMediaContentMode,
  toMediaConfig,
  viewedMediaContent,
  type MediaItem,
} from "../WidgetConfigFields/media-content-rules";

/** @file Direct coverage for `media-content-rules.ts` — the pure half of `MediaContentEditor`. */

const asset = (id: string, slug: string, contentType: string | null = "image/png"): AdminMedia => ({
  id, slug, workspaceId: "ws", title: slug, alt: `${slug} alt`, caption: "", credit: "", sha256: id, status: "active",
  contentType, createdAt: "", updatedAt: "", version: 1, width: null, height: null, cssClass: null, htmlAttributes: null, publicUrl: null,
} as AdminMedia);

const items = (...slugs: string[]): MediaItem[] => slugs.map((slug) => ({ slug }));

describe("HTML attribute rows", () => {
  it("round-trips rows -> string -> rows, including quotes and a boolean attribute", () => {
    const rows = [
      { name: "data-kui", value: "carousel target:'img'" },
      { name: "aria-label", value: 'Say "hi"' },
      { name: "data-both", value: `it's "x"` },
      { name: "hidden", value: "" },
    ];
    const text = rowsToHtmlAttributes(rows);
    expect(text).toBe(`data-kui="carousel target:'img'" aria-label='Say "hi"' data-both="it's &quot;x&quot;" hidden`);
    expect(htmlAttributesToRows(text)).toEqual(rows);
  });

  it("parses the contract's stored string and every quoting style", () => {
    expect(htmlAttributesToRows('data-kui="scroll-snap-x" aria-label="Selected media"')).toEqual([
      { name: "data-kui", value: "scroll-snap-x" },
      { name: "aria-label", value: "Selected media" },
    ]);
    expect(htmlAttributesToRows("id='hero' class=wide")).toEqual([{ name: "id", value: "hero" }, { name: "class", value: "wide" }]);
    expect(htmlAttributesToRows(undefined)).toEqual([]);
    expect(htmlAttributesToRows("   ")).toEqual([]);
  });

  it("keeps an unparseable fragment as a row instead of losing what was typed", () => {
    expect(htmlAttributesToRows('data-a="1" " data-b=2')).toEqual([
      { name: "data-a", value: "1" }, { name: '"', value: "" }, { name: "data-b", value: "2" },
    ]);
    expect(htmlAttributesToRows('data-a="1" "')).toEqual([{ name: "data-a", value: "1" }, { name: '"', value: "" }]);
  });

  it("skips nameless rows when serializing (a half-typed row saves nothing)", () => {
    expect(rowsToHtmlAttributes([{ name: "  ", value: "x" }, { name: " data-x ", value: "1" }])).toBe('data-x="1"');
    expect(rowsToHtmlAttributes([])).toBe("");
  });

  it("flags rows the renderer will drop, reusing the media attribute allowlist", () => {
    expect(isDroppedAttributeRow({ name: "onclick", value: "alert(1)" })).toBe(true);
    expect(isDroppedAttributeRow({ name: "data-kui", value: "fade" })).toBe(false);
    expect(isDroppedAttributeRow({ name: "", value: "anything" })).toBe(false);
  });
});

describe("slug add / validate", () => {
  const library = [asset("1", "sl-1"), asset("2", "sl-2")];
  it("names each problem, and accepts a known new slug", () => {
    expect(mediaSlugProblem({ slug: "  ", items: [], library })).toBe("empty");
    expect(mediaSlugProblem({ slug: "a b", items: [], library })).toBe("invalid");
    expect(mediaSlugProblem({ slug: "a/b", items: [], library })).toBe("invalid");
    expect(mediaSlugProblem({ slug: "x".repeat(201), items: [], library })).toBe("invalid");
    expect(mediaSlugProblem({ slug: "sl-1", items: items("sl-1"), library })).toBe("duplicate");
    expect(mediaSlugProblem({ slug: "nope", items: [], library })).toBe("unknown");
    expect(mediaSlugProblem({ slug: " sl-2 ", items: items("sl-1"), library })).toBeNull();
  });

  it("does not call a slug unknown before the library has loaded (unknown is a render diagnostic, not a save error)", () => {
    expect(mediaSlugProblem({ slug: "anything", items: [], library: null })).toBeNull();
  });

  it("refuses the 51st item", () => {
    const full = items(...Array.from({ length: MAX_MEDIA_ITEMS }, (_, i) => `s${i}`));
    expect(mediaSlugProblem({ slug: "sl-1", items: full, library })).toBe("full");
  });

  it("appends picks in order, skipping repeats (within the picks too) and stopping at the cap", () => {
    expect(appendMediaSlugs({ items: items("a"), slugs: ["b", "a", "c", "b"] })).toEqual(items("a", "b", "c"));
    const almost = items(...Array.from({ length: MAX_MEDIA_ITEMS - 1 }, (_, i) => `s${i}`));
    const next = appendMediaSlugs({ items: almost, slugs: ["x", "y", "z"] });
    expect(next).toHaveLength(MAX_MEDIA_ITEMS);
    expect(next.at(-1)).toEqual({ slug: "x" });
    expect(almost).toHaveLength(MAX_MEDIA_ITEMS - 1);
  });
});

describe("reorder", () => {
  it("moves up/down, clamps at the ends, and returns the same array for a no-op", () => {
    const list = items("a", "b", "c");
    expect(moveMediaItem({ items: list, from: 2, to: 1 }).map((i) => i.slug)).toEqual(["a", "c", "b"]);
    expect(moveMediaItem({ items: list, from: 0, to: 1 }).map((i) => i.slug)).toEqual(["b", "a", "c"]);
    expect(moveMediaItem({ items: list, from: 1, to: 9 }).map((i) => i.slug)).toEqual(["a", "c", "b"]);
    expect(moveMediaItem({ items: list, from: 0, to: -1 })).toBe(list);
    expect(moveMediaItem({ items: list, from: 5, to: 0 })).toBe(list);
    expect(list.map((i) => i.slug)).toEqual(["a", "b", "c"]);
  });
});

describe("reading and writing config", () => {
  it("reads media mode, html mode and mode-less configs", () => {
    const media = readMediaContent({ config: { mode: "media", items: [{ slug: "a", alt: "", caption: "c", src: "x" }], layout: "grid", columns: 4, aspectRatio: "16/9", cssClass: "photos", htmlAttributes: 'data-kui="x"' }, widgetType: "media" });
    expect(media).toEqual({ mode: "media", html: "", media: { items: [{ slug: "a", alt: "", caption: "c" }], layout: "grid", columns: 4, aspectRatio: "16/9", cssClass: "photos", htmlAttributes: 'data-kui="x"' } });
    expect(readMediaContent({ config: { html: "<img>" }, widgetType: "media" })).toMatchObject({ mode: "html", html: "<img>" });
    expect(readMediaContent({ config: { mode: "html" }, widgetType: "media" })).toMatchObject({ mode: "html", html: "" });
    expect(readMediaContent({ config: {}, widgetType: "media" })).toMatchObject({ mode: "media", media: { items: [], layout: "single" } });
  });

  it("gives Gallery no Single layout (its saved schema has none)", () => {
    expect(mediaLayoutsFor("gallery")).toEqual(["grid", "carousel", "masonry"]);
    expect(readMediaContent({ config: { layout: "single" }, widgetType: "gallery" }).media.layout).toBe("grid");
    expect(readMediaContent({ config: { layout: "bogus" }, widgetType: "media" }).media.layout).toBe("single");
  });

  it("maps legacy gallery images to library slugs, keeping an unknown id visible", () => {
    const library = [asset("id-1", "first")];
    expect(legacyImagesToItems({ images: [{ mediaId: "id-1", alt: "A", caption: "C" }, { mediaId: "gone" }, "junk"], library })).toEqual([
      { slug: "first", alt: "A", caption: "C" }, { slug: "gone" },
    ]);
    expect(readMediaContent({ config: { images: [{ mediaId: "id-1" }], layout: "carousel" }, widgetType: "gallery" }, { library }).media).toMatchObject({ items: [{ slug: "first" }], layout: "carousel" });
  });

  it("writes only the active tab, omitting blank optionals and columns for Single", () => {
    const state = readMediaContent({ config: { items: [{ slug: "a" }], layout: "single", columns: 3, cssClass: "  ", aspectRatio: "4/3" }, widgetType: "media" });
    expect(toMediaConfig({ state })).toEqual({ mode: "media", items: [{ slug: "a" }], layout: "single", aspectRatio: "4/3" });
    expect(toMediaConfig({ state: { ...state, media: { ...state.media, layout: "grid" } } })).toMatchObject({ layout: "grid", columns: 3 });
    expect(toMediaConfig({ state: { ...state, mode: "html", html: "<p>x</p>" } })).toEqual({ mode: "html", html: "<p>x</p>" });
  });

  it("knows whether a tab holds content another tab's save would drop", () => {
    const state = readMediaContent({ config: { items: [{ slug: "a" }] }, widgetType: "media" });
    expect(hasModeContent({ state, mode: "media" })).toBe(true);
    expect(hasModeContent({ state, mode: "html" })).toBe(false);
    expect(hasModeContent({ state: { ...state, html: " <b/> " }, mode: "html" })).toBe(true);
  });
});

describe("tab switching without a config change", () => {
  const stored = readMediaContent({ config: { mode: "media", items: [{ slug: "a" }], layout: "grid" }, widgetType: "media" });

  it("shows an empty target tab without emitting, stashing the stored tab", () => {
    const next = switchMediaContentMode({ stored, stash: {}, mode: "html" });
    expect(next).toEqual({ stash: { media: stored.media }, viewMode: "html", emit: null });
    const view = viewedMediaContent({ stored, viewMode: next.viewMode, stash: next.stash });
    expect(view).toEqual({ ...stored, mode: "html", html: "" });
    // The first edit emits the view, so only then does the saved config become Raw HTML.
    expect(toMediaConfig({ state: { ...view, html: "<p/>" } })).toEqual({ mode: "html", html: "<p/>" });
    expect(inactiveTabWillBeDropped({ stored, viewMode: next.viewMode, stash: next.stash })).toBe(false);
  });

  it("goes back to the stored tab by view only", () => {
    expect(switchMediaContentMode({ stored, stash: { media: stored.media }, mode: "media" })).toEqual({ stash: { media: stored.media }, viewMode: null, emit: null });
    expect(viewedMediaContent({ stored, viewMode: null, stash: { html: "<p/>" } })).toBe(stored);
    expect(viewedMediaContent({ stored, viewMode: "media", stash: { html: "<p/>" } })).toBe(stored);
  });

  it("emits when the target tab holds content (saving would really change the config)", () => {
    const html = readMediaContent({ config: { mode: "html", html: "<p/>" }, widgetType: "media" });
    const next = switchMediaContentMode({ stored: html, stash: { media: stored.media }, mode: "media" });
    expect(next.viewMode).toBeNull();
    expect(next.stash).toEqual({ media: stored.media, html: "<p/>" });
    expect(toMediaConfig({ state: next.emit! })).toEqual({ mode: "media", items: [{ slug: "a" }], layout: "grid" });
    expect(inactiveTabWillBeDropped({ stored: html, viewMode: null, stash: { media: stored.media } })).toBe(true);
    expect(inactiveTabWillBeDropped({ stored: html, viewMode: "html", stash: {} })).toBe(false);
  });

  it("shows a stashed media draft that has no items yet (layout kept) without emitting", () => {
    const html = readMediaContent({ config: { mode: "html", html: "<p/>" }, widgetType: "media" });
    const draft = { items: [], layout: "masonry" as const };
    const next = switchMediaContentMode({ stored: html, stash: { media: draft }, mode: "media" });
    expect(next).toMatchObject({ viewMode: "media", emit: null });
    expect(viewedMediaContent({ stored: html, viewMode: "media", stash: next.stash }).media).toBe(draft);
    expect(viewedMediaContent({ stored: html, viewMode: "media", stash: {} }).media).toBe(html.media);
  });
});

describe("slugCanShowEnd", () => {
  it("allows RTL end-first display only when no character would be reordered", () => {
    expect(slugCanShowEnd("peach-and-lily-body-scrub")).toBe(true);
    expect(slugCanShowEnd("photo-2")).toBe(true);
    expect(slugCanShowEnd("a")).toBe(true);
    expect(slugCanShowEnd("2024-gala")).toBe(false);
    expect(slugCanShowEnd("photo-")).toBe(false);
    expect(slugCanShowEnd("_photo")).toBe(false);
    expect(slugCanShowEnd("")).toBe(false);
  });
});

describe("raw HTML helpers", () => {
  it("builds slug-first snippets per media kind, escaping attribute values", () => {
    expect(mediaSnippetFor({ slug: "sl-1", alt: 'A "b" & c', contentType: "image/png" })).toBe('<img data-media-slug="sl-1" alt="A &quot;b&quot; &amp; c">');
    expect(mediaSnippetFor({ slug: "clip", contentType: "video/mp4" })).toBe('<video data-media-slug="clip" controls></video>');
    expect(mediaSnippetFor({ slug: "song", contentType: "audio/mpeg" })).toBe('<audio data-media-slug="song" controls></audio>');
    expect(mediaSnippetFor({ slug: "x" })).toBe('<img data-media-slug="x" alt="">');
  });

  it("inserts at the selection, replacing it, and clamps out-of-range positions", () => {
    expect(insertAtSelection({ text: "ab", start: 1, end: 1, insert: "X" })).toEqual({ text: "aXb", caret: 2 });
    expect(insertAtSelection({ text: "abcd", start: 1, end: 3, insert: "X" })).toEqual({ text: "aXd", caret: 2 });
    expect(insertAtSelection({ text: "ab", start: 9, end: 2, insert: "X" })).toEqual({ text: "abX", caret: 3 });
    expect(insertAtSelection({ text: "ab", start: -4, end: -1, insert: "X" })).toEqual({ text: "Xab", caret: 1 });
  });

  it("counts lines and classifies media kinds", () => {
    expect(lineCount("")).toBe(1);
    expect(lineCount("a\nb\n")).toBe(3);
    expect(["image/webp", "video/mp4", "audio/flac", "application/pdf", null].map(mediaKindOf)).toEqual(["image", "video", "audio", "unknown", "unknown"]);
  });
});
