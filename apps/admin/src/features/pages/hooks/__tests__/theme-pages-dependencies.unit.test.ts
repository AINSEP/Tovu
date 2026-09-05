import { describe, expect, it, vi } from "vitest";

import type { ThemePagesFileEntry } from "../theme-pages-port.hooks";

/**
 * @file Coverage for `theme-pages-dependencies.hooks.ts`'s remaining gaps:
 * - `defaultThemePagesPort.getThemeDetail` and `.setPagePublished` — every existing suite
 *   (`use-theme-pages.unit.test.ts`) only ever renders `useThemePages` against
 *   `createFakeThemePagesPort`; nothing renders the zero-arg `useWiredThemePages()` that wires the
 *   real port's `getThemeDetail`/`setPagePublished` in (only `getPresentation` is exercised, via a
 *   route elsewhere in this feature).
 * - `createFakeThemePagesPort(...).setPagePublished`'s "page not found" guard — unreachable through
 *   `useThemePages` itself (the hook only ever calls `setPagePublished` with a page id it already
 *   resolved from `pageFiles`), so it's exercised here by direct invocation with a page id absent
 *   from the seed.
 */

const { getThemeDetail, setThemePagePublished } = vi.hoisted(() => ({
  getThemeDetail: vi.fn(),
  setThemePagePublished: vi.fn(),
}));

vi.mock("../../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/api")>();
  return { ...actual, api: { ...actual.api, getThemeDetail, setThemePagePublished } };
});

const { createFakeThemePagesPort, defaultThemePagesPort } = await import("../theme-pages-dependencies.hooks");

const ABOUT: ThemePagesFileEntry = { path: "render/pages/about.html", group: "page", published: false, resettable: true };

describe("defaultThemePagesPort", () => {
  it("getThemeDetail forwards themeId to api.getThemeDetail, returning the files unchanged", async () => {
    const response = { files: [ABOUT] };
    getThemeDetail.mockResolvedValue(response);
    await expect(defaultThemePagesPort.getThemeDetail("basic")).resolves.toEqual(response);
    expect(getThemeDetail).toHaveBeenCalledWith("basic");
  });

  it("setPagePublished forwards themeId/page/published to api.setThemePagePublished", async () => {
    const response = { page: "about", published: true };
    setThemePagePublished.mockResolvedValue(response);
    await expect(defaultThemePagesPort.setPagePublished("basic", "about", true)).resolves.toEqual(response);
    expect(setThemePagePublished).toHaveBeenCalledWith("basic", "about", true);
  });
});

describe("createFakeThemePagesPort — setPagePublished not-found guard", () => {
  it("throws 'fake theme page not found' for a page absent from pageFiles", async () => {
    const port = createFakeThemePagesPort({ pageFiles: [ABOUT] });
    await expect(port.setPagePublished("basic", "missing-page", true)).rejects.toThrow(
      "fake theme page not found: missing-page",
    );
  });
});
