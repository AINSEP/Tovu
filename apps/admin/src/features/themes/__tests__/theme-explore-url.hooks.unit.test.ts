import { afterEach, describe, expect, it } from "vitest";

import {
  resolveRequestedThemeExploreSelection,
  resolveThemeExploreSelectionValue,
  writeThemeExploreSelectionToUrl,
  type ThemeExploreSelectableFile,
} from "../hooks/theme-explore-url.hooks";

/**
 * @file `theme-explore-url.hooks.ts` in isolation — no React, no port, no `useThemeExplore` at all.
 * `use-theme-explore.hooks.unit.test.ts` covers this module wired into the hook (initial-selection
 * fallback, the miss toast, the write-back on a real `select()` call); this file is the resolver's
 * own direct unit tests, split out for the same complexity-drift reason the module itself was.
 */

const FILES: ThemeExploreSelectableFile[] = [
  { path: "render/pages/index.html", label: "index", kind: "page" },
  { path: "render/pages/404.html", label: "404", kind: "page" },
  { path: "render/pages/about.html", label: "about", kind: "page" },
  { path: "css/theme.css", label: "theme.css", kind: "style" },
  { path: "theme.json", label: "theme.json", kind: "config" },
];

describe("resolveThemeExploreSelectionValue", () => {
  it("matches an exact theme-relative path, including a non-page file", () => {
    expect(resolveThemeExploreSelectionValue(FILES, "render/pages/about.html")).toBe("render/pages/about.html");
    expect(resolveThemeExploreSelectionValue(FILES, "theme.json")).toBe("theme.json");
  });

  it("matches a bare page label", () => {
    expect(resolveThemeExploreSelectionValue(FILES, "about")).toBe("render/pages/about.html");
  });

  /**
   * Owner-reported bug (2026-08-31): `?page=about.html` — a value that names a real page but keeps
   * the extension a bare `?page=` link never carries — used to match nothing at all. This is form 3.
   */
  it("matches a page label with .html appended back on", () => {
    expect(resolveThemeExploreSelectionValue(FILES, "about.html")).toBe("render/pages/about.html");
    expect(resolveThemeExploreSelectionValue(FILES, "404.html")).toBe("render/pages/404.html");
  });

  it("does not resolve a bare label or label+.html against a non-page file — only the exact path can address it", () => {
    expect(resolveThemeExploreSelectionValue(FILES, "theme.css")).toBeNull();
    expect(resolveThemeExploreSelectionValue(FILES, "theme")).toBeNull();
  });

  it("returns null for a value naming nothing in the theme at all", () => {
    expect(resolveThemeExploreSelectionValue(FILES, "does-not-exist")).toBeNull();
    expect(resolveThemeExploreSelectionValue(FILES, "does-not-exist.html")).toBeNull();
  });

  it("prefers the exact-path form even when a value could also be read as a label — no real ambiguity in practice", () => {
    // No file in `basic` (or this fixture) has a label that collides with another file's own full
    // path, but the resolution order itself is what would arbitrate it if one ever did: form 1 runs
    // first, so an exact path match always wins before a label match is even attempted.
    expect(resolveThemeExploreSelectionValue(FILES, "render/pages/index.html")).toBe("render/pages/index.html");
  });
});

describe("resolveRequestedThemeExploreSelection", () => {
  it("resolves fileId when present, regardless of pageId", () => {
    const result = resolveRequestedThemeExploreSelection(FILES, { fileId: "theme.json", pageId: "about" });
    expect(result).toEqual({ path: "theme.json", missed: null });
  });

  it("falls over to pageId when fileId is absent", () => {
    const result = resolveRequestedThemeExploreSelection(FILES, { pageId: "404" });
    expect(result).toEqual({ path: "render/pages/404.html", missed: null });
  });

  it("falls over to pageId when fileId names nothing this theme has — an intentional layered fallback, not a miss", () => {
    const result = resolveRequestedThemeExploreSelection(FILES, { fileId: "does/not-exist.html", pageId: "404" });
    expect(result).toEqual({ path: "render/pages/404.html", missed: null });
  });

  it("reports a miss (preferring fileId's own raw value) when neither param resolves to anything", () => {
    const result = resolveRequestedThemeExploreSelection(FILES, { fileId: "nope.html", pageId: "also-nope" });
    expect(result).toEqual({ path: null, missed: "nope.html" });
  });

  it("reports a miss off pageId alone when only pageId was supplied and it did not resolve", () => {
    const result = resolveRequestedThemeExploreSelection(FILES, { pageId: "nope" });
    expect(result).toEqual({ path: null, missed: "nope" });
  });

  it("returns no path and no miss when neither param was supplied at all", () => {
    expect(resolveRequestedThemeExploreSelection(FILES, {})).toEqual({ path: null, missed: null });
  });

  it("treats an empty-string param the same as absent, not as a value to look up", () => {
    expect(resolveRequestedThemeExploreSelection(FILES, { fileId: "", pageId: "" })).toEqual({ path: null, missed: null });
  });
});

describe("writeThemeExploreSelectionToUrl", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("writes the short ?page=<label> form for a page, and clears ?file=", () => {
    window.history.replaceState(null, "", "/admin/themes/explore?theme=basic&file=render/pages/index.html");
    writeThemeExploreSelectionToUrl({ path: "render/pages/about.html", label: "about", kind: "page" });

    const params = new URLSearchParams(window.location.search);
    expect(params.get("page")).toBe("about");
    expect(params.get("file")).toBeNull();
  });

  it("writes the full ?file=<path> form for a non-page file, and clears ?page=", () => {
    window.history.replaceState(null, "", "/admin/themes/explore?theme=basic&page=index");
    writeThemeExploreSelectionToUrl({ path: "css/theme.css", label: "theme.css", kind: "style" });

    const params = new URLSearchParams(window.location.search);
    expect(params.get("file")).toBe("css/theme.css");
    expect(params.get("page")).toBeNull();
  });

  it("uses replaceState, not pushState — no new history entry", () => {
    window.history.replaceState(null, "", "/admin/themes/explore?theme=basic");
    const lengthBefore = window.history.length;
    writeThemeExploreSelectionToUrl({ path: "render/pages/about.html", label: "about", kind: "page" });
    expect(window.history.length).toBe(lengthBefore);
  });
});
