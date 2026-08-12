import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../../../lib/api";
import { createFakeThemeExplorePort } from "../hooks/theme-explore-dependencies.hooks";
import { useThemeExplore } from "../hooks/use-theme-explore.hooks";

/**
 * @file `useThemeExplore` driven against the injected `ThemeExplorePort`, no `fetch` stub and no
 * `api` spy. `ThemeExplore.unit.test.tsx` covers the component's own rendering entirely through a
 * full-controller fake on `useThemeExploreHook` (never the real hook), so this is the first test
 * to exercise `useThemeExplore` itself.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useThemeExplore — injected port (no fetch stub, no api spy)", () => {
  it("loads detail/files from the injected port and never touches the real api client", async () => {
    const getDetailSpy = vi.spyOn(api, "getThemeDetail");
    const port = createFakeThemeExplorePort({
      detail: { id: "basic", name: "Basic", tier: "declarative", status: "active", errors: [], lineage: null, hasOriginal: true },
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Home</h1>" },
    });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));

    await waitFor(() => expect(result.current.detail?.name).toBe("Basic"));
    await waitFor(() => expect(result.current.source).toBe("<h1>Home</h1>"));
    expect(result.current.selected).toBe("pages/index.html");
    expect(getDetailSpy).not.toHaveBeenCalled();
  });

  it("routes save through the injected port and clears dirty", async () => {
    const putSpy = vi.spyOn(api, "putThemeFile");
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Home</h1>" },
    });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.source).toBe("<h1>Home</h1>"));

    act(() => result.current.setSource("<h1>Changed</h1>"));
    expect(result.current.dirty).toBe(true);

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.dirty).toBe(false);
    expect(result.current.notice).toBe("Saved pages/index.html");
    expect(putSpy).not.toHaveBeenCalled();
  });

  /**
   * Negative verification (per this refactor's own required check): temporarily replacing
   * `port.getThemeDetail(...)`/`port.putThemeFile(...)` in `use-theme-explore.hooks.ts` with direct
   * calls to the real `api` import and re-running this suite fails both assertions above (no real
   * network in this test env) — see this feature's commit/handoff report for the recorded run.
   */
  it("stays with detail null while the injected port's detail call is still pending", () => {
    const port = createFakeThemeExplorePort();
    port.getThemeDetail = () => new Promise(() => {});
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    expect(result.current.detail).toBeNull();
    expect(result.current.files).toEqual([]);
  });

  /**
   * Regression (owner-reported, 2026-08-12): clicking a `.liquid` template in Explore downloaded the
   * file instead of previewing it. Root cause traced to the server's theme-detail listing route
   * (`explore.ts`'s `TEXT_READABLE_EXTENSIONS`), which does not include `.liquid` and so reports
   * `readable: false` for every templated-tier `.liquid` file — sending `ThemeExplore.tsx`'s
   * `previewSrcFor` down the "not readable" branch that points an iframe straight at the raw,
   * `application/octet-stream`-served `/theme-assets/...` URL (see that function's own doc comment).
   *
   * `mapDetailFiles` (this hook) is the fix: it overrides `readable` to `true` for any `.liquid`
   * path regardless of what the listing route reported, because the GET-file route
   * (`readThemeFile`) already returns ANY file's content as UTF-8 text unconditionally — only the
   * LISTING's classification was stale. This is what makes the effect below actually fetch the
   * source instead of leaving it blank.
   */
  it("treats a .liquid template as readable even when the server's listing reports readable: false, and fetches its source", async () => {
    const port = createFakeThemeExplorePort({
      files: [
        { path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true },
        // Mirrors exactly what `explore.ts`'s `describeThemeFile` returns for a templated-tier
        // `.liquid` file today: `other` group (no `pages/`/`.css`/`.m?js`/`.c?js`/config-json/root-
        // html match), `readable: false` (extension absent from `TEXT_READABLE_EXTENSIONS`),
        // `editable: false` (same absence, `isThemeFileWritable`'s first half).
        { path: "templates/entry.liquid", group: "other", readable: false, editable: false, resettable: true },
      ],
      contents: {
        "pages/index.html": "<h1>Home</h1>",
        "templates/entry.liquid": "{% render_block component: \"tovu/site-header\" %}",
      },
    });
    const { result } = renderHook(() => useThemeExplore("storefront", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(2));

    const liquidFile = result.current.files.find((f) => f.path === "templates/entry.liquid");
    expect(liquidFile?.readable).toBe(true);
    // `editable` is untouched — the server's write gate (`isThemeFileWritable`) still refuses a PUT
    // for `.liquid`, so this stays a read-only preview, not a new edit surface.
    expect(liquidFile?.editable).toBe(false);

    act(() => result.current.select("templates/entry.liquid"));
    await waitFor(() => expect(result.current.source).toBe('{% render_block component: "tovu/site-header" %}'));
  });
});
