import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { templateAssetUrl, useTemplateSource } from "../use-template-source.hooks";
import { createFakeTemplateSourcePort } from "../template-source-dependencies.hooks";

/**
 * @file `useTemplateSource`/`templateAssetUrl` — the template-source fetch extracted out of
 * `TemplateSourceModal.tsx` (moved here from `features/posts/__tests__/
 * use-post-template-source.hooks.unit.test.ts`, 2026-09-24, alongside the hook itself — see
 * `use-template-source.hooks.ts`'s own file header). `TemplateSourceModal.unit.test.tsx` already
 * covers the same four outcomes end-to-end through the rendered component (stubbing global
 * `fetch`), so this file's job is to pin the hook's own contract in isolation against a
 * `TemplateSourcePort` fake instead: it never fetches for a non-static/`null` tier, starts
 * `loading`, and resolves to `loaded`/`error`.
 */

describe("templateAssetUrl", () => {
  it("builds /theme-assets/{themeId}/pages/{templateFilename} for a v1 theme (apiVersion undefined), URL-encoding both segments", () => {
    expect(templateAssetUrl("basic", "blog-post.html", undefined)).toBe("/theme-assets/basic/pages/blog-post.html");
    expect(templateAssetUrl("my theme", "a b.html", undefined)).toBe("/theme-assets/my%20theme/pages/a%20b.html");
  });

  // 2026-08-19 architecture audit finding 1: every current static theme (`src/themes/static/basic`,
  // and its six siblings) is apiVersion 2, whose page templates live under `render/pages/`, not
  // `pages/` — the unconditional v1 path this test used to be the ONLY coverage for. Regression for
  // "View Template" 404ing on every real built-in theme today.
  it("builds /theme-assets/{themeId}/render/pages/{templateFilename} for a v2 theme (apiVersion: 2)", () => {
    expect(templateAssetUrl("basic", "blog-post.html", 2)).toBe("/theme-assets/basic/render/pages/blog-post.html");
    expect(templateAssetUrl("my theme", "a b.html", 2)).toBe("/theme-assets/my%20theme/render/pages/a%20b.html");
  });
});

describe("useTemplateSource", () => {
  it("never calls the port for a non-static theme tier", () => {
    const port = createFakeTemplateSourcePort({ html: "<p>x</p>" });
    const fetchSpy = vi.spyOn(port, "fetchTemplateSource");
    const { result } = renderHook(() => useTemplateSource("t1", "handlebars", 2, "post.html", port));

    expect(result.current).toEqual({ status: "loading" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never calls the port when the tier is null (undetermined)", () => {
    const port = createFakeTemplateSourcePort({ html: "<p>x</p>" });
    const fetchSpy = vi.spyOn(port, "fetchTemplateSource");
    renderHook(() => useTemplateSource("t1", null, undefined, "post.html", port));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("starts loading, then resolves to loaded with the fetched html for a static theme", async () => {
    const port = createFakeTemplateSourcePort({ html: "<h1>Hello template</h1>" });
    const { result } = renderHook(() => useTemplateSource("basic", "static", 2, "blog-post.html", port));

    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current).toEqual({ status: "loaded", html: "<h1>Hello template</h1>" }));
  });

  it("resolves to error with the rejection's message on a port failure", async () => {
    const port = createFakeTemplateSourcePort({ fetchTemplateSourceError: new Error("network down") });
    const { result } = renderHook(() => useTemplateSource("basic", "static", 2, "x.html", port));

    await waitFor(() => expect(result.current).toEqual({ status: "error", message: "network down" }));
  });

  it("fetches the v1 URL built by templateAssetUrl for a v1 (apiVersion undefined) theme", async () => {
    const port = createFakeTemplateSourcePort({ html: "ok" });
    const fetchSpy = vi.spyOn(port, "fetchTemplateSource");
    renderHook(() => useTemplateSource("basic", "static", undefined, "blog-post.html", port));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/theme-assets/basic/pages/blog-post.html"));
  });

  it("fetches the v2 render/pages/ URL built by templateAssetUrl for an apiVersion: 2 theme", async () => {
    const port = createFakeTemplateSourcePort({ html: "ok" });
    const fetchSpy = vi.spyOn(port, "fetchTemplateSource");
    renderHook(() => useTemplateSource("basic", "static", 2, "blog-post.html", port));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/theme-assets/basic/render/pages/blog-post.html"));
  });
});
