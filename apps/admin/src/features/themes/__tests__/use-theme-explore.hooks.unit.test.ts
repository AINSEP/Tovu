import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
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
   * (`explore.ts`'s `TEXT_READABLE_EXTENSIONS`), which did not include `.liquid` and so reported
   * `readable: false` for every templated-tier `.liquid` file — sending `ThemeExplore.tsx`'s
   * `previewSrcFor` down the "not readable" branch that points an iframe straight at the raw,
   * `application/octet-stream`-served `/theme-assets/...` URL (see that function's own doc comment).
   *
   * First fixed with a client-side override in `mapDetailFiles` (this hook); moved server-side
   * 2026-08-12 once `.liquid` joined `TEXT_READABLE_EXTENSIONS`, so this hook is back to a plain
   * passthrough and the fixture below mirrors what the server now ACTUALLY returns
   * (`readable: true`) rather than a value this hook has to correct. Kept as its own test (not
   * folded into the generic passthrough case) because a `.liquid` template's read-only-preview
   * round trip is exactly the behavior the owner reported broken — a regression here should read as
   * "the liquid preview bug is back", not as an anonymous passthrough failure.
   */
  it("fetches a .liquid template's source once the server reports it readable (server is the source of truth, not a client override)", async () => {
    const port = createFakeThemeExplorePort({
      files: [
        { path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true },
        // Mirrors exactly what `explore.ts`'s `describeThemeFile` returns for a templated-tier
        // `.liquid` file today: `other` group (no `pages/`/`.css`/`.m?js`/`.c?js`/config-json/root-
        // html match), `readable: true` (extension now IN `TEXT_READABLE_EXTENSIONS`), `editable:
        // false` (`other` is one of `READ_ONLY_GROUPS` — readability changed, writability did not).
        { path: "templates/entry.liquid", group: "other", readable: true, editable: false, resettable: true },
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

  /**
   * Negative companion to the test above: if the server ever regresses `.liquid` back to
   * `readable: false` (e.g. someone reverts the `TEXT_READABLE_EXTENSIONS` entry), this hook must
   * NOT silently paper over it anymore — the client-side override was removed on purpose, so the
   * source fetch effect (gated on `readable`) must skip the request, matching how it already
   * behaves for any other non-readable file.
   */
  it("does NOT override a .liquid file back to readable if the server reports readable: false (override was removed, not relocated)", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "templates/entry.liquid", group: "other", readable: false, editable: false, resettable: true }],
      contents: { "templates/entry.liquid": "{% render_block component: \"tovu/site-header\" %}" },
    });
    const { result } = renderHook(() => useThemeExplore("storefront", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(1));

    const liquidFile = result.current.files.find((f) => f.path === "templates/entry.liquid");
    expect(liquidFile?.readable).toBe(false);

    act(() => result.current.select("templates/entry.liquid"));
    // No override left to fetch the source — stays blank, same as any other non-readable file.
    await waitFor(() => expect(result.current.selected).toBe("templates/entry.liquid"));
    expect(result.current.source).toBe("");
  });
});

/**
 * 2026-08-19 architecture audit findings 1 & 2: `startRename`'s client-side pre-check
 * (`LOCKED_RENAME_PATHS`) used to hardcode v1's `pages/index.html` unconditionally — no test in this
 * file exercised it before this addition. Now derived from `resolveThemeLayout` (the same
 * `@tovu/theme-layout` resolver the server route uses), keyed off `detail.apiVersion` from the port's
 * own response, so a v2 theme's `render/pages/index.html` is locked too instead of silently allowing
 * an inline rename the server would then refuse with a round trip.
 */
/**
 * `?page=` preselection (2026-08-27, owner request) — the Theme Pages tab's URL cell now links here
 * with the page it names, so Explore has to open ON that page instead of always on the theme's
 * index. Matched on the file's LABEL (basename minus `.html`), which is exactly the key
 * `presentation/get.ts` builds `activeThemeStaticPageIds` from (`Object.keys(theme.pages)`, and
 * `theme.ts` keys that map by `file.slice(0, -".html".length)`) — so the same id round-trips through
 * the URL for a v1 theme's `pages/x.html` and a v2 theme's `render/pages/x.html` alike, without this
 * hook having to know which layout it is looking at.
 */
describe("useThemeExplore — ?page= preselection", () => {
  const FILES = [
    { path: "render/pages/index.html", group: "page" as const, readable: true, editable: true, resettable: true },
    { path: "render/pages/404.html", group: "page" as const, readable: true, editable: true, resettable: true },
    { path: "css/theme.css", group: "style" as const, readable: true, editable: true, resettable: true },
  ];
  const CONTENTS = {
    "render/pages/index.html": "<h1>Home</h1>",
    "render/pages/404.html": "<h1>Not found</h1>",
    "css/theme.css": "body{}",
  };

  it("opens the page named by pageId, resolving the bare id against a v2 render/pages/ layout", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }, { pageId: "404" }));
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    expect(result.current.selected).toBe("render/pages/404.html");
    await waitFor(() => expect(result.current.source).toBe("<h1>Not found</h1>"));
  });

  it("falls back to the default selection when pageId names a page this theme does not have", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }, { pageId: "nope" }));
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    expect(result.current.selected).toBe("render/pages/index.html");
    expect(result.current.error).toBeNull();
  });

  it("never resolves a pageId onto a non-page file, so ?page=theme.css cannot open a stylesheet", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }, { pageId: "theme.css" }));
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    expect(result.current.selected).toBe("render/pages/index.html");
  });

  it("keeps the pre-existing default selection when no pageId is supplied at all", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    expect(result.current.selected).toBe("render/pages/index.html");
  });

  it("resolves pageId 'index' to the theme's own index page — the one id that is not its own site route", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }, { pageId: "index" }));
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    expect(result.current.selected).toBe("render/pages/index.html");
  });
});

describe("useThemeExplore — startRename's client-side lock mirrors the server's apiVersion-aware required files", () => {
  it("v1 (apiVersion undefined): locks pages/index.html, allows an ordinary page", async () => {
    const port = createFakeThemeExplorePort({
      detail: { id: "t", name: "T", tier: "static", status: "valid", errors: [], lineage: null, hasOriginal: true },
      files: [
        { path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true },
        { path: "pages/about.html", group: "page", readable: true, editable: true, resettable: true },
      ],
    });
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(2));

    act(() => result.current.startRename("pages/index.html"));
    expect(result.current.renamingPath).toBeNull();
    expect(result.current.error).toMatch(/can't be renamed/);

    act(() => result.current.startRename("pages/about.html"));
    expect(result.current.renamingPath).toBe("pages/about.html");
  });

  it("v2 (apiVersion: 2): locks render/pages/index.html, allows an ordinary render/pages page", async () => {
    const port = createFakeThemeExplorePort({
      detail: {
        id: "basic",
        name: "Basic",
        tier: "static",
        status: "valid",
        errors: [],
        lineage: null,
        hasOriginal: true,
        apiVersion: 2,
      },
      files: [
        { path: "render/pages/index.html", group: "page", readable: true, editable: true, resettable: true },
        { path: "render/pages/about.html", group: "page", readable: true, editable: true, resettable: true },
      ],
    });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(2));

    act(() => result.current.startRename("render/pages/index.html"));
    expect(result.current.renamingPath).toBeNull();
    expect(result.current.error).toMatch(/can't be renamed/);

    act(() => result.current.startRename("render/pages/about.html"));
    // A v2 theme's ordinary page must still be renamable — only its required index page is locked.
    expect(result.current.renamingPath).toBe("render/pages/about.html");
  });
});
