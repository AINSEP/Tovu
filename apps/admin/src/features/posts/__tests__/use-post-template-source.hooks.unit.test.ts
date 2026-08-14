import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { templateAssetUrl, useTemplateSource } from "../hooks/use-post-template-source.hooks";
import { createFakePostTemplatePort } from "../hooks/post-template-dependencies.hooks";

/**
 * @file `useTemplateSource`/`templateAssetUrl` — the template-source fetch extracted out of
 * `PostTemplateModal.tsx`. `PostTemplateModal.unit.test.tsx` already covers the same four outcomes
 * end-to-end through the rendered component (stubbing global `fetch`), so this file's job is to
 * pin the hook's own contract in isolation against a `PostTemplatePort` fake instead: it never
 * fetches for a non-static/`null` tier, starts `loading`, and resolves to `loaded`/`error`.
 */

describe("templateAssetUrl", () => {
  it("builds /theme-assets/{themeId}/pages/{templateFilename}, URL-encoding both segments", () => {
    expect(templateAssetUrl("basic", "blog-post.html")).toBe("/theme-assets/basic/pages/blog-post.html");
    expect(templateAssetUrl("my theme", "a b.html")).toBe("/theme-assets/my%20theme/pages/a%20b.html");
  });
});

describe("useTemplateSource", () => {
  it("never calls the port for a non-static theme tier", () => {
    const port = createFakePostTemplatePort({ html: "<p>x</p>" });
    const fetchSpy = vi.spyOn(port, "fetchTemplateSource");
    const { result } = renderHook(() => useTemplateSource("t1", "handlebars", "post.html", port));

    expect(result.current).toEqual({ status: "loading" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never calls the port when the tier is null (undetermined)", () => {
    const port = createFakePostTemplatePort({ html: "<p>x</p>" });
    const fetchSpy = vi.spyOn(port, "fetchTemplateSource");
    renderHook(() => useTemplateSource("t1", null, "post.html", port));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("starts loading, then resolves to loaded with the fetched html for a static theme", async () => {
    const port = createFakePostTemplatePort({ html: "<h1>Hello template</h1>" });
    const { result } = renderHook(() => useTemplateSource("basic", "static", "blog-post.html", port));

    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current).toEqual({ status: "loaded", html: "<h1>Hello template</h1>" }));
  });

  it("resolves to error with the rejection's message on a port failure", async () => {
    const port = createFakePostTemplatePort({ fetchTemplateSourceError: new Error("network down") });
    const { result } = renderHook(() => useTemplateSource("basic", "static", "x.html", port));

    await waitFor(() => expect(result.current).toEqual({ status: "error", message: "network down" }));
  });

  it("fetches the URL built by templateAssetUrl", async () => {
    const port = createFakePostTemplatePort({ html: "ok" });
    const fetchSpy = vi.spyOn(port, "fetchTemplateSource");
    renderHook(() => useTemplateSource("basic", "static", "blog-post.html", port));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/theme-assets/basic/pages/blog-post.html"));
  });
});
