import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createFakeThemeCanvasPort } from "../hooks/theme-canvas-dependencies.hooks";
import {
  templateMarkupUrl,
  themeLightTokensUrl,
  themeStylesheetUrl,
  themeTokensUrl,
  tokensToCanvasCss,
  useThemeCanvasStyling,
} from "../hooks/use-theme-canvas-styling.hooks";

/**
 * @file The Interactive tab used to edit every page against browser defaults — Times on white —
 * because its GrapesJS canvas loaded no stylesheet at all. This covers what now resolves the CSS it
 * renders against: the active theme's own stylesheet URL, plus the `:root` token block that
 * stylesheet's `var(--x)` references need to mean anything.
 */

const DARK = { "--bg": "oklch(9% 0.004 250)", "--fg": "oklch(96% 0.003 250)" };
const LIGHT = { "--bg": "#f6f9f8", "--fg": "#09140f" };

describe("themeStylesheetUrl", () => {
  it("points at the v2 stylesheet for an apiVersion: 2 theme", () => {
    expect(themeStylesheetUrl("basic", 2)).toBe("/theme-assets/basic/css/theme.css");
  });

  it("points at the v1 stylesheet when the theme's apiVersion is unknown", () => {
    expect(themeStylesheetUrl("basic", undefined)).toBe("/theme-assets/basic/css/styles.css");
  });

  it("encodes the theme id, but not the path separators inside the layout's own path", () => {
    expect(themeStylesheetUrl("my theme", 2)).toBe("/theme-assets/my%20theme/css/theme.css");
  });
});

describe("themeTokensUrl / themeLightTokensUrl", () => {
  it("builds the two token-file URLs the static-asset mount serves", () => {
    expect(themeTokensUrl("basic")).toBe("/theme-assets/basic/tokens.json");
    expect(themeLightTokensUrl("basic")).toBe("/theme-assets/basic/tokens.light.json");
  });
});

describe("templateMarkupUrl", () => {
  it("points at the v2 render/pages folder for an apiVersion: 2 theme", () => {
    expect(templateMarkupUrl("basic", 2, "blog-post.html")).toBe("/theme-assets/basic/render/pages/blog-post.html");
  });

  it("points at the v1 pages folder when apiVersion is unknown", () => {
    expect(templateMarkupUrl("basic", undefined, "blog-post.html")).toBe("/theme-assets/basic/pages/blog-post.html");
  });

  it("encodes the template filename, unlike pagesDir's own real / separator", () => {
    expect(templateMarkupUrl("basic", 2, "my template.html")).toBe("/theme-assets/basic/render/pages/my%20template.html");
  });
});

describe("tokensToCanvasCss", () => {
  it("puts default-mode tokens on :root and light-mode tokens behind [data-theme=\"light\"]", () => {
    expect(tokensToCanvasCss(DARK, LIGHT)).toBe(
      ':root{--bg:oklch(9% 0.004 250);--fg:oklch(96% 0.003 250);}:root[data-theme="light"]{--bg:#f6f9f8;--fg:#09140f;}',
    );
  });

  it("emits only the :root block for a theme that ships no light variant", () => {
    expect(tokensToCanvasCss(DARK, undefined)).toBe(":root{--bg:oklch(9% 0.004 250);--fg:oklch(96% 0.003 250);}");
  });

  it("returns nothing at all when the theme has no usable tokens", () => {
    expect(tokensToCanvasCss({}, LIGHT)).toBe("");
  });

  // GrapesJS injects this CSS by concatenating it into a `<style>…</style>` string and parsing that
  // as HTML, so a token value carrying `</style>` would escape into markup — and themes are
  // downloadable from a marketplace, so token files are not fully trusted input.
  it("drops a token whose value could break out of the <style> element", () => {
    const css = tokensToCanvasCss({ ...DARK, "--evil": "red</style><script>alert(1)</script>" }, undefined);
    expect(css).not.toContain("<script>");
    expect(css).not.toContain("</style>");
    expect(css).toContain("--bg:oklch(9% 0.004 250);");
  });

  it("drops a token whose value could close the rule and start a new one", () => {
    expect(tokensToCanvasCss({ ...DARK, "--evil": "red}body{display:none" }, undefined)).not.toContain("display:none");
  });

  it("drops a key that is not a plain custom property name", () => {
    expect(tokensToCanvasCss({ ...DARK, "body { color": "red" }, undefined)).not.toContain("body {");
  });
});

describe("useThemeCanvasStyling", () => {
  it("stays pending until the active theme id is known", () => {
    const port = createFakeThemeCanvasPort({ tokensByUrl: { "/theme-assets/basic/tokens.json": DARK } });
    const { result } = renderHook(() => useThemeCanvasStyling(null, 2, port));
    expect(result.current).toEqual({ status: "pending" });
  });

  it("resolves to the theme's stylesheet plus its token CSS", async () => {
    const port = createFakeThemeCanvasPort({
      tokensByUrl: {
        "/theme-assets/basic/tokens.json": DARK,
        "/theme-assets/basic/tokens.light.json": LIGHT,
      },
    });
    const { result } = renderHook(() => useThemeCanvasStyling("basic", 2, port));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      styling: {
        stylesheets: ["/theme-assets/basic/css/theme.css"],
        css: tokensToCanvasCss(DARK, LIGHT),
      },
    });
  });

  it("still resolves for a theme that ships no light token file", async () => {
    const port = createFakeThemeCanvasPort({ tokensByUrl: { "/theme-assets/basic/tokens.json": DARK } });
    const { result } = renderHook(() => useThemeCanvasStyling("basic", 2, port));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      styling: { stylesheets: ["/theme-assets/basic/css/theme.css"], css: tokensToCanvasCss(DARK, undefined) },
    });
  });

  // Deliberately NOT "ship the stylesheet anyway": a v2 theme's stylesheet reads `var(--x)`
  // exclusively, so without tokens it styles nothing while still displacing GrapesJS's own white
  // canvas background. Falling all the way back is the only outcome that reproduces exactly what the
  // tab did before canvas styling existed.
  it("falls back to no canvas styling at all when the required token file cannot be read", async () => {
    const port = createFakeThemeCanvasPort();
    const { result } = renderHook(() => useThemeCanvasStyling("basic", 2, port));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({ status: "ready", styling: {} });
  });

  it("reads the tokens through the injected port, never through fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const port = createFakeThemeCanvasPort({ tokensByUrl: { "/theme-assets/basic/tokens.json": DARK } });
      const { result } = renderHook(() => useThemeCanvasStyling("basic", 2, port));

      await waitFor(() => expect(result.current.status).toBe("ready"));
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("useThemeCanvasStyling — content wrapper (templateChoice)", () => {
  const PAGE_SHELL = `<body>
    <main>
      <article class="post-detail wrap" data-reveal>
        <div data-embed-config='{"type":"content"}'></div>
      </article>
    </main>
  </body>`;

  it("includes the derived content wrapper when a template is chosen and its markup carries a content marker", async () => {
    const port = createFakeThemeCanvasPort({
      tokensByUrl: { "/theme-assets/basic/tokens.json": DARK },
      templatesByUrl: { "/theme-assets/basic/render/pages/page-shell.html": PAGE_SHELL },
    });
    const { result } = renderHook(() => useThemeCanvasStyling("basic", 2, port, "page-shell.html"));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      styling: {
        stylesheets: ["/theme-assets/basic/css/theme.css"],
        css: tokensToCanvasCss(DARK, undefined),
        contentWrapper: [
          { tagName: "main", attributes: {} },
          { tagName: "article", attributes: { class: "post-detail wrap", "data-reveal": "" } },
          { tagName: "div", attributes: {} },
        ],
      },
    });
  });

  it("has no content wrapper when templateChoice is null — the default, pre-existing call shape", async () => {
    const port = createFakeThemeCanvasPort({ tokensByUrl: { "/theme-assets/basic/tokens.json": DARK } });
    const { result } = renderHook(() => useThemeCanvasStyling("basic", 2, port));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.status === "ready" && result.current.styling.contentWrapper).toBeUndefined();
  });

  it('has no content wrapper when templateChoice is "" (explicit "no template chosen")', async () => {
    const port = createFakeThemeCanvasPort({ tokensByUrl: { "/theme-assets/basic/tokens.json": DARK } });
    const { result } = renderHook(() => useThemeCanvasStyling("basic", 2, port, ""));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.status === "ready" && result.current.styling.contentWrapper).toBeUndefined();
  });

  it("falls back to no content wrapper when the template markup fetch fails, without failing the whole canvas", async () => {
    // No entry seeded for the template URL — createFakeThemeCanvasPort rejects, same as a real 404.
    const port = createFakeThemeCanvasPort({ tokensByUrl: { "/theme-assets/basic/tokens.json": DARK } });
    const { result } = renderHook(() => useThemeCanvasStyling("basic", 2, port, "missing.html"));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toEqual({
      status: "ready",
      styling: { stylesheets: ["/theme-assets/basic/css/theme.css"], css: tokensToCanvasCss(DARK, undefined) },
    });
  });

  it("falls back to no content wrapper when the template's markup has no content marker", async () => {
    const port = createFakeThemeCanvasPort({
      tokensByUrl: { "/theme-assets/basic/tokens.json": DARK },
      templatesByUrl: { "/theme-assets/basic/render/pages/no-marker.html": "<body><p>static</p></body>" },
    });
    const { result } = renderHook(() => useThemeCanvasStyling("basic", 2, port, "no-marker.html"));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.status === "ready" && result.current.styling.contentWrapper).toBeUndefined();
  });

  it("reads template markup through the injected port, never through fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const port = createFakeThemeCanvasPort({
        tokensByUrl: { "/theme-assets/basic/tokens.json": DARK },
        templatesByUrl: { "/theme-assets/basic/render/pages/page-shell.html": PAGE_SHELL },
      });
      const { result } = renderHook(() => useThemeCanvasStyling("basic", 2, port, "page-shell.html"));

      await waitFor(() => expect(result.current.status).toBe("ready"));
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
