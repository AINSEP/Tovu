import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultThemeCanvasPort } from "../theme-canvas-dependencies.hooks";

/**
 * @file Coverage for `theme-canvas-dependencies.hooks.ts`'s `defaultThemeCanvasPort` — neither
 * method was ever invoked by any existing suite (`use-theme-canvas-styling.unit.test.ts` only ever
 * constructs `createFakeThemeCanvasPort`; nothing renders `useWiredThemeCanvasStyling()`, the entry
 * point that wires this real-`fetch` port in). This covers both the success and the
 * `!res.ok`-throws path for each method directly against a stubbed global `fetch`.
 */

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("defaultThemeCanvasPort.fetchThemeTokens", () => {
  it("resolves the parsed JSON body when the response is ok", async () => {
    const tokens = { colors: { primary: "#111" } };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(tokens) }) as typeof fetch;
    await expect(defaultThemeCanvasPort.fetchThemeTokens("/theme-assets/basic/tokens.json")).resolves.toEqual(tokens);
    expect(global.fetch).toHaveBeenCalledWith("/theme-assets/basic/tokens.json");
  });

  it("throws naming the status when the response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as typeof fetch;
    await expect(defaultThemeCanvasPort.fetchThemeTokens("/theme-assets/basic/tokens.light.json")).rejects.toThrow(
      "the theme server responded with 404",
    );
  });
});

describe("defaultThemeCanvasPort.fetchTemplateMarkup", () => {
  it("resolves the response text when the response is ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("<main></main>") }) as typeof fetch;
    await expect(defaultThemeCanvasPort.fetchTemplateMarkup("/theme-assets/basic/pages/page-shell.html")).resolves.toBe(
      "<main></main>",
    );
    expect(global.fetch).toHaveBeenCalledWith("/theme-assets/basic/pages/page-shell.html");
  });

  it("throws naming the status when the response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as typeof fetch;
    await expect(defaultThemeCanvasPort.fetchTemplateMarkup("/theme-assets/basic/pages/missing.html")).rejects.toThrow(
      "the theme server responded with 500",
    );
  });
});
