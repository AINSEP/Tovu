import { describe, expect, it, vi } from "vitest";

import type { ThemePagesFileEntry } from "@jini-ai/admin/pages/hooks/theme-pages-port.hooks";

/**
 * @file Coverage for `theme-pages-dependencies.hooks.ts`'s remaining gaps:
 * - `defaultThemePagesPort.getThemeDetail` and `.setPagePublished` — every existing suite
 *   (`use-theme-pages.unit.test.ts`) only ever renders `useThemePages` against
 *   `createFakeThemePagesPort`; nothing renders the zero-arg `useWiredThemePages()` that wires the
 *   real port's `getThemeDetail`/`setPagePublished` in (only `getPresentation` is exercised, via a
 *   route elsewhere in this feature).
 */

const { getThemeDetail, setThemePagePublished } = vi.hoisted(() => ({
  getThemeDetail: vi.fn(),
  setThemePagePublished: vi.fn(),
}));

vi.mock("../../../themes/api/themes-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../themes/api/themes-api")>();
  return { ...actual, themesApi: { ...actual.themesApi, getThemeDetail, setThemePagePublished } };
});

const { defaultThemePagesPort } = await import("../theme-pages-dependencies.hooks");

const ABOUT: ThemePagesFileEntry = { path: "render/pages/about.html", group: "page", published: false, resettable: true };

describe("defaultThemePagesPort", () => {
  it("getThemeDetail forwards themeId to api.getThemeDetail, returning the files unchanged", async () => {
    const response = { files: [ABOUT] };
    getThemeDetail.mockResolvedValue(response);
    await expect(defaultThemePagesPort.getThemeDetail({ themeId: "basic" })).resolves.toEqual(response);
    expect(getThemeDetail).toHaveBeenCalledWith({ themeId: "basic" });
  });

  it("setPagePublished forwards themeId/page/published to api.setThemePagePublished", async () => {
    const response = { page: "about", published: true };
    setThemePagePublished.mockResolvedValue(response);
    await expect(defaultThemePagesPort.setPagePublished({ themeId: "basic", page: "about", published: true })).resolves.toEqual(response);
    expect(setThemePagePublished).toHaveBeenCalledWith({ themeId: "basic", page: "about", published: true });
  });
});
