import { describe, expect, it } from "vitest";

import { themeExplorePreviewMode } from "../hooks/use-theme-explore-preview.hooks";
import type { ThemeExploreFile } from "../hooks/use-theme-explore.hooks";

/**
 * @file `themeExplorePreviewMode` — which files the Explore Preview tab renders in the device-scaled
 * iframe and which it shows as read-only code. Owner screenshot 2026-10-10: `theme.json` in Preview
 * was Chrome's raw JSON viewer shrunk into a 1280px frame, too small to read.
 */

function file(overrides: Partial<ThemeExploreFile> & Pick<ThemeExploreFile, "path" | "kind">): ThemeExploreFile {
  return {
    label: overrides.path.split("/").pop() ?? overrides.path,
    readable: true,
    editable: true,
    resettable: true,
    modified: false,
    published: null,
    collidingContent: null,
    ...overrides,
  };
}

describe("themeExplorePreviewMode", () => {
  it("renders nothing-selected through the existing notice path", () => {
    expect(themeExplorePreviewMode(undefined)).toBe("render");
  });

  it.each([
    file({ path: "render/pages/home.html", label: "home", kind: "page" }),
    file({ path: "render/partials/nav.html", label: "nav", kind: "partial" }),
    file({ path: "render/pages/entry.liquid", kind: "page", editable: false }),
    // A v1 `.liquid` template lands in the generic `other` group, but still renders.
    file({ path: "templates/home.liquid", kind: "other", editable: false }),
    file({ path: "templates/HOME.LIQUID", kind: "other", editable: false }),
  ])("renders the page-like file $path in the device frame", (entry) => {
    expect(themeExplorePreviewMode(entry)).toBe("render");
  });

  it.each([
    file({ path: "screenshots/index.png", kind: "asset", readable: false, editable: false }),
    file({ path: "vendor.bin", kind: "other", readable: false, editable: false }),
    // `.svg` is readable text server-side, but it is an image: it renders, not code.
    file({ path: "assets/icon.svg", kind: "asset" }),
  ])("renders the image/binary file $path as itself", (entry) => {
    expect(themeExplorePreviewMode(entry)).toBe("render");
  });

  it.each([
    file({ path: "theme.json", kind: "config" }),
    file({ path: "styles/main.css", kind: "style" }),
    file({ path: "scripts/main.js", kind: "script" }),
    file({ path: "NOTICE.md", kind: "other", editable: false }),
  ])("shows the readable non-page file $path as code", (entry) => {
    expect(themeExplorePreviewMode(entry)).toBe("code");
  });
});
