import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "@/lib/api";
import { createFakeThemeExplorePort } from "../hooks/theme-explore-dependencies.hooks";
import {
  lockedPublishReason,
  readOnlyReason,
  selectedFileLabel,
  selectedFilePublishState,
  useThemeExplore,
  useWiredThemeExplore,
  type ThemeExploreFile,
} from "../hooks/use-theme-explore.hooks";

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

  /**
   * Owner-reported bug (verbatim URL: `?theme=basic&page=signin.html` opened the theme's `404`
   * page instead of `signin`, with no indication anything was wrong). Root cause:  `?page=`'s old
   * matcher compared the raw value straight against a page's LABEL and nothing else, so a value
   * that still carries the `.html` extension a bare `?page=` link never has matched nothing at all.
   * The shared resolver's third form — a page label with `.html` appended back on — is the fix.
   */
  it("resolves a pageId that still carries its .html extension against the bare page label (owner-reported bug)", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }, { pageId: "404.html" }));
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    expect(result.current.selected).toBe("render/pages/404.html");
    expect(result.current.error).toBeNull();
  });

  /**
   * 2026-08-31 owner-reported bug fix: a `pageId` that names nothing this theme has used to fall
   * back to the default with NO indication anything was wrong — the exact silent-mismatch shape the
   * owner's own `?page=about.html` report was about (see `theme-explore-url.hooks.ts`'s file header
   * for the full trace). It still falls back to the default selection (never "nothing"), but now
   * surfaces an explicit miss instead of pretending the requested page was found.
   */
  it("falls back to the default selection when pageId names a page this theme does not have, and surfaces the miss", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }, { pageId: "nope" }));
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    expect(result.current.selected).toBe("render/pages/index.html");
    expect(result.current.error).toBe('"nope" isn\'t a page or file in this theme.');
  });

  it("never resolves a pageId onto a non-page file, so ?page=theme.css cannot open a stylesheet — and surfaces the miss, since a bare label cannot address it", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }, { pageId: "theme.css" }));
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    expect(result.current.selected).toBe("render/pages/index.html");
    expect(result.current.error).toBe('"theme.css" isn\'t a page or file in this theme.');
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

/**
 * `defaultSelectedPath`'s own apiVersion fix (2026-08-31, verified live against the real `basic`
 * theme at `http://localhost:5173/admin/themes/explore?theme=basic`). The server
 * (`listThemeFiles`, `theme-files.ts`) returns a theme's files ALPHABETICALLY SORTED, so a v2
 * theme's page files arrive in an order where `"404.html"` sorts before every other page,
 * `"index.html"` included. `defaultSelectedPath` used to look for the literal v1 path
 * `pages/index.html` only, so on a v2 theme that check always missed and fell through to "the
 * first page in file order" — silently landing on 404 for every bare `?theme=basic` visit, not
 * just a mismatched `?page=`/`?file=`. `FILES` below is deliberately declared in that same
 * (404-before-index) order, matching production, so a regression here reproduces the real bug
 * instead of being masked by a fixture that happens to list `index` first.
 */
describe("useThemeExplore — default selection resolves the v2 index page regardless of file order", () => {
  const FILES = [
    { path: "render/pages/404.html", group: "page" as const, readable: true, editable: true, resettable: true },
    { path: "render/pages/about.html", group: "page" as const, readable: true, editable: true, resettable: true },
    { path: "render/pages/index.html", group: "page" as const, readable: true, editable: true, resettable: true },
  ];
  const CONTENTS = {
    "render/pages/404.html": "<h1>Not found</h1>",
    "render/pages/about.html": "<h1>About</h1>",
    "render/pages/index.html": "<h1>Home</h1>",
  };

  it("opens the index page, not the alphabetically-first page, for a v2 theme with no page/file param", async () => {
    const port = createFakeThemeExplorePort({
      detail: { id: "basic", name: "Basic", tier: "static", status: "valid", errors: [], lineage: null, hasOriginal: true, apiVersion: 2 },
      files: FILES,
      contents: CONTENTS,
    });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    expect(result.current.selected).toBe("render/pages/index.html");
    expect(result.current.error).toBeNull();
  });
});

/**
 * `?file=` (2026-08-30, owner ask) — the general, full-relative-path deep link that supersedes
 * `?page=`'s bare-id-only, pages-only mechanism: `theme.json`/`tokens.json`/CSS/JS all live in the
 * same file list, and a bare id has no way to address any of those. Matched on the exact PATH, not a
 * label, so filenames repeating across directories (a partial and a page sharing a name) never
 * collide.
 */
describe("useThemeExplore — ?file= preselection", () => {
  const FILES = [
    { path: "render/pages/index.html", group: "page" as const, readable: true, editable: true, resettable: true },
    { path: "render/pages/404.html", group: "page" as const, readable: true, editable: true, resettable: true },
    { path: "theme.json", group: "config" as const, readable: true, editable: true, resettable: true },
  ];
  const CONTENTS = {
    "render/pages/index.html": "<h1>Home</h1>",
    "render/pages/404.html": "<h1>Not found</h1>",
    "theme.json": "{}",
  };

  it("opens the exact file named by fileId, extension and all", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() =>
      useThemeExplore("basic", { port, t: (k) => k }, { fileId: "render/pages/404.html" })
    );
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    expect(result.current.selected).toBe("render/pages/404.html");
  });

  it("can address a non-page file — something ?page= structurally cannot do", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }, { fileId: "theme.json" }));
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    expect(result.current.selected).toBe("theme.json");
  });

  it("takes priority over pageId when both are present", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() =>
      useThemeExplore("basic", { port, t: (k) => k }, { pageId: "index", fileId: "render/pages/404.html" })
    );
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    expect(result.current.selected).toBe("render/pages/404.html");
  });

  it("falls back through pageId, then the ordinary default, when fileId names nothing this theme has", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() =>
      useThemeExplore("basic", { port, t: (k) => k }, { fileId: "does/not-exist.html", pageId: "404" })
    );
    await waitFor(() => expect(result.current.selected).not.toBeNull());
    expect(result.current.selected).toBe("render/pages/404.html");
  });
});

/**
 * `select` mirrors the selection into the address bar (2026-08-30 owner ask, refined 2026-08-31 per
 * the owner's own "these URLs are ugly ... they should just be `?theme=basic&page=signin`" report)
 * — `?page=<label>` for an ordinary page, `?file=<path>` for anything else, bookmarkable, shareable,
 * and agent-addressable either way. `history.replaceState`, not this app's `navigate()` — see
 * `writeThemeExploreSelectionToUrl`'s own doc (`theme-explore-url.hooks.ts`) for why routing this
 * through `navigate()` would make every sidebar click re-trigger the initial-load effect and refetch
 * the whole theme.
 */
describe("useThemeExplore — select writes the selection back to the address bar", () => {
  const FILES = [
    { path: "render/pages/index.html", group: "page" as const, readable: true, editable: true, resettable: true },
    { path: "render/pages/about.html", group: "page" as const, readable: true, editable: true, resettable: true },
    { path: "css/theme.css", group: "style" as const, readable: true, editable: true, resettable: true },
  ];
  const CONTENTS = {
    "render/pages/index.html": "<h1>Home</h1>",
    "render/pages/about.html": "<h1>About</h1>",
    "css/theme.css": "body{}",
  };

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("selecting a page writes the short ?page=<label> form — the owner's own ask", async () => {
    window.history.replaceState(null, "", "/admin/themes/explore?theme=basic");
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.selected).not.toBeNull());

    act(() => result.current.select("render/pages/about.html"));

    const params = new URLSearchParams(window.location.search);
    expect(params.get("page")).toBe("about");
    expect(params.get("file")).toBeNull();
    expect(result.current.selected).toBe("render/pages/about.html");
  });

  it("selecting a non-page file writes the full ?file=<path> form — a bare label cannot address it", async () => {
    window.history.replaceState(null, "", "/admin/themes/explore?theme=basic");
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.selected).not.toBeNull());

    act(() => result.current.select("css/theme.css"));

    const params = new URLSearchParams(window.location.search);
    expect(params.get("file")).toBe("css/theme.css");
    expect(params.get("page")).toBeNull();
  });

  it("clears a stale ?file= when selecting a page, so the two links in the URL can never disagree", async () => {
    window.history.replaceState(null, "", "/admin/themes/explore?theme=basic&file=render/pages/index.html");
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.selected).not.toBeNull());

    act(() => result.current.select("render/pages/about.html"));

    const params = new URLSearchParams(window.location.search);
    expect(params.get("file")).toBeNull();
    expect(params.get("page")).toBe("about");
  });

  it("clears a stale ?page= when selecting a non-page file, so the two links in the URL can never disagree", async () => {
    window.history.replaceState(null, "", "/admin/themes/explore?theme=basic&page=index");
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.selected).not.toBeNull());

    act(() => result.current.select("css/theme.css"));

    const params = new URLSearchParams(window.location.search);
    expect(params.get("page")).toBeNull();
    expect(params.get("file")).toBe("css/theme.css");
  });

  it("does not add a new history entry — replaceState, not pushState", async () => {
    window.history.replaceState(null, "", "/admin/themes/explore?theme=basic");
    const lengthBefore = window.history.length;
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.selected).not.toBeNull());

    act(() => result.current.select("render/pages/about.html"));

    expect(window.history.length).toBe(lengthBefore);
  });
});

/**
 * `setPagePublished` (2026-08-30 owner ask) — the real publish/unpublish mechanism. Acts on the
 * SELECTED file's page implicitly, matching `save`/`reset`'s own shape, and patches `files` locally
 * from the response rather than refetching the whole theme (see the hook's own doc comment for why a
 * refetch would learn nothing a full theme reload doesn't already guarantee).
 */
describe("useThemeExplore — setPagePublished", () => {
  const FILES = [
    { path: "render/pages/index.html", group: "page" as const, readable: true, editable: true, resettable: true, published: null },
    { path: "render/pages/pricing.html", group: "page" as const, readable: true, editable: true, resettable: true, published: true },
    { path: "css/theme.css", group: "style" as const, readable: true, editable: true, resettable: true, published: null },
  ];
  const CONTENTS = {
    "render/pages/index.html": "<h1>Home</h1>",
    "render/pages/pricing.html": "<h1>Pricing</h1>",
    "css/theme.css": "body{}",
  };

  it("unpublishes the selected page through the port and patches its own file entry", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const setPagePublishedSpy = vi.spyOn(port, "setPagePublished");
    const { result } = renderHook(() =>
      useThemeExplore("basic", { port, t: (k) => k }, { fileId: "render/pages/pricing.html" })
    );
    await waitFor(() => expect(result.current.selected).toBe("render/pages/pricing.html"));

    await act(async () => {
      await result.current.setPagePublished(false);
    });

    expect(setPagePublishedSpy).toHaveBeenCalledWith("basic", "pricing", false);
    const pricing = result.current.files.find((f) => f.path === "render/pages/pricing.html");
    expect(pricing?.published).toBe(false);
    expect(result.current.notice).toBe("Unpublished pricing");
    // No other file's own state is disturbed.
    const index = result.current.files.find((f) => f.path === "render/pages/index.html");
    expect(index?.published).toBeNull();
  });

  it("is a no-op for a selected file with no publish state at all (not a candidate page)", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const setPagePublishedSpy = vi.spyOn(port, "setPagePublished");
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }, { fileId: "css/theme.css" }));
    await waitFor(() => expect(result.current.selected).toBe("css/theme.css"));

    await act(async () => {
      await result.current.setPagePublished(true);
    });

    expect(setPagePublishedSpy).not.toHaveBeenCalled();
  });

  it("surfaces a port failure as error and leaves the file's state unchanged", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    port.setPagePublished = () => Promise.reject(new Error("theme is tier 'declarative'"));
    const { result } = renderHook(() =>
      useThemeExplore("basic", { port, t: (k) => k }, { fileId: "render/pages/pricing.html" })
    );
    await waitFor(() => expect(result.current.selected).toBe("render/pages/pricing.html"));

    await act(async () => {
      await result.current.setPagePublished(false);
    });

    expect(result.current.error).toBe("theme is tier 'declarative'");
    expect(result.current.files.find((f) => f.path === "render/pages/pricing.html")?.published).toBe(true);
  });
});

/**
 * `collidingContent` (2026-08-30) — the slug-collision signal `describeThemeFile` reports
 * alongside `published`, mapped through the exact same absent/undefined-normalizes-to-null idiom
 * `mapDetailFiles` already applies to `published` (see that function's own doc comment).
 */
describe("useThemeExplore — collidingContent mapping", () => {
  it("passes through a wire-provided collidingContent unchanged", async () => {
    const port = createFakeThemeExplorePort({
      files: [
        {
          path: "pages/about.html",
          group: "page" as const,
          readable: true,
          editable: true,
          resettable: true,
          published: true,
          collidingContent: { id: "post-1", slug: "about", title: "What Is Tovu?", kind: "post" },
        },
      ],
    });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(1));

    expect(result.current.files[0].collidingContent).toEqual({
      id: "post-1",
      slug: "about",
      title: "What Is Tovu?",
      kind: "post",
    });
  });

  it("normalizes an absent collidingContent to null, same as published", async () => {
    const port = createFakeThemeExplorePort({
      files: [
        { path: "pages/signin.html", group: "page" as const, readable: true, editable: true, resettable: true, published: true },
      ],
    });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(1));

    expect(result.current.files[0].collidingContent).toBeNull();
  });

  it("normalizes an absent published to null too — the same ?? null idiom, its own call site", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "css/theme.css", group: "style" as const, readable: true, editable: true, resettable: true }],
    });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(1));

    // Strict `toBeNull()`, not merely falsy — `mapDetailFiles`'s contract is `boolean | null`, never
    // `undefined`, and only a strict check can tell "normalized to null" apart from "the ?? was
    // silently dropped and this is still undefined".
    expect(result.current.files[0].published).toBeNull();
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
    // Exact match, not a loose /can't be renamed/ regex — the index page gets its OWN "exact page"
    // wording (`lockedIdentityChangeReason`'s first branch), distinct from the generic "exact file"
    // message every OTHER required file gets. A loose regex can't tell the two apart, which is
    // exactly what let this branch go untested before (mutation-sweep flagged it).
    expect(result.current.error).toBe(
      "pages/index.html can't be renamed — every theme requires this exact page to load at all."
    );

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
    expect(result.current.error).toBe(
      "render/pages/index.html can't be renamed — every theme requires this exact page to load at all."
    );

    act(() => result.current.startRename("render/pages/about.html"));
    // A v2 theme's ordinary page must still be renamable — only its required index page is locked.
    expect(result.current.renamingPath).toBe("render/pages/about.html");
  });
});

/**
 * `commitRename` funnels into `performRename` with no guard against a second rename (on a
 * different file) starting before the first settles — network completion order does not have to
 * match click/start order. Same bug class `use-sites.hooks.ts`'s `activate` and
 * `use-themes.hooks.ts`'s `activate`/`download` were fixed for; see `performRename`'s
 * `renameSettlement` doc comment.
 */
describe("useThemeExplore — rename race safety", () => {
  const FILES = [
    { path: "pages/index.html", group: "page" as const, readable: true, editable: true, resettable: true },
    { path: "css/a.css", group: "style" as const, readable: true, editable: true, resettable: true },
    { path: "css/b.css", group: "style" as const, readable: true, editable: true, resettable: true },
  ];

  it("the LAST-started rename wins even when an earlier rename's response arrives after it", async () => {
    const deferred: Record<string, { resolve: (value: { path: string }) => void }> = {};
    const port = createFakeThemeExplorePort({
      files: FILES,
      contents: { "pages/index.html": "<html></html>" },
    });
    port.renameThemeFile = vi.fn((_themeId: string, _sourcePath: string, name: string) => {
      return new Promise<{ path: string }>((resolve) => {
        deferred[name] = { resolve };
      });
    });

    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(3));

    // Two renames started back to back, before the first settles: a.css -> a2.css first,
    // b.css -> b2.css second — b2 is the operator's actual, final action.
    act(() => result.current.startRename("css/a.css"));
    act(() => result.current.setRenameDraft("a2.css"));
    act(() => result.current.commitRename());

    act(() => result.current.startRename("css/b.css"));
    act(() => result.current.setRenameDraft("b2.css"));
    act(() => result.current.commitRename());

    await waitFor(() => expect(port.renameThemeFile).toHaveBeenCalledTimes(2));

    // Network settles OUT of start order: b2 (started LAST) resolves first; a2 (started first)
    // resolves after it.
    await act(async () => {
      deferred["b2.css"].resolve({ path: "css/b2.css" });
    });
    await waitFor(() => expect(result.current.notice).toBe("Renamed to css/b2.css"));

    await act(async () => {
      deferred["a2.css"].resolve({ path: "css/a2.css" });
    });
    // Give a2.css's now-stale settlement a chance to land before asserting nothing changed.
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The operator's LAST-started rename (b2) must still be what is shown — a2's late-arriving
    // response must not overwrite it just because it settled second.
    expect(result.current.notice).toBe("Renamed to css/b2.css");
    expect(result.current.renaming).toBe(false);
  });

  it("a stale FAILED rename settling after a newer, successful rename must not resurrect a stale error", async () => {
    const deferred: Record<string, { reject: (reason: unknown) => void; resolveOk: (value: { path: string }) => void }> = {};
    const port = createFakeThemeExplorePort({
      files: FILES,
      contents: { "pages/index.html": "<html></html>" },
    });
    port.renameThemeFile = vi.fn((_themeId: string, _sourcePath: string, name: string) => {
      return new Promise<{ path: string }>((resolve, reject) => {
        deferred[name] = { reject, resolveOk: resolve };
      });
    });

    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(3));

    act(() => result.current.startRename("css/a.css"));
    act(() => result.current.setRenameDraft("a2.css"));
    act(() => result.current.commitRename());

    act(() => result.current.startRename("css/b.css"));
    act(() => result.current.setRenameDraft("b2.css"));
    act(() => result.current.commitRename());

    await waitFor(() => expect(port.renameThemeFile).toHaveBeenCalledTimes(2));

    // The LAST-started rename (b2) succeeds first.
    await act(async () => {
      deferred["b2.css"]!.resolveOk({ path: "css/b2.css" });
    });
    await waitFor(() => expect(result.current.notice).toBe("Renamed to css/b2.css"));
    expect(result.current.error).toBeNull();

    // The stale, superseded a2 rename now fails — its error must not resurrect over b2's
    // already-successful, already-displayed outcome.
    await act(async () => {
      deferred["a2.css"]!.reject(new Error("failed to rename file"));
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.error).toBeNull();
    expect(result.current.notice).toBe("Renamed to css/b2.css");
  });

  /**
   * The `finally` block's own stale-settlement guard is a THIRD, independent check from the
   * success/catch guards above (same shape `use-themes.hooks.ts`'s `activate`/`download` finally
   * guards document) — a test that only checks the FINAL `renaming` value can't tell whether this
   * guard fired, since both outcomes converge to the same end state. It only diverges from a no-op
   * when the stale call settles WHILE the newer one is still in flight.
   */
  it("a stale rename settling while a newer rename is still pending must not clear renaming early", async () => {
    const deferred: Record<string, { resolve: (value: { path: string }) => void }> = {};
    const port = createFakeThemeExplorePort({
      files: FILES,
      contents: { "pages/index.html": "<html></html>" },
    });
    port.renameThemeFile = vi.fn((_themeId: string, _sourcePath: string, name: string) => {
      return new Promise<{ path: string }>((resolve) => {
        deferred[name] = { resolve };
      });
    });

    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(3));

    act(() => result.current.startRename("css/a.css"));
    act(() => result.current.setRenameDraft("a2.css"));
    act(() => result.current.commitRename());

    act(() => result.current.startRename("css/b.css"));
    act(() => result.current.setRenameDraft("b2.css"));
    act(() => result.current.commitRename());

    await waitFor(() => expect(port.renameThemeFile).toHaveBeenCalledTimes(2));
    expect(result.current.renaming).toBe(true);

    // a2 (stale) settles now, while b2's own call is STILL pending.
    await act(async () => {
      deferred["a2.css"]!.resolve({ path: "css/a2.css" });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    // b2's rename has not settled yet — renaming must still read true, not be cleared by a2's
    // stale settlement.
    expect(result.current.renaming).toBe(true);

    await act(async () => {
      deferred["b2.css"]!.resolve({ path: "css/b2.css" });
    });
    await waitFor(() => expect(result.current.renaming).toBe(false));
  });
});

/**
 * `copyFile`'s OLD in-flight guard (`copyingPath !== null`) was state-based, so a genuine
 * same-tick double-fire (two calls landing in the same synchronous tick, before React re-renders
 * with `copyingPath` reflecting the first call) could still slip both past it — the same narrower
 * weakness `use-sites.hooks.ts`'s `createSite` had before `bac64077`. See `copyFile`'s
 * `copyingRef` doc comment.
 */
describe("useThemeExplore — copyFile same-tick double-fire safety", () => {
  it("two synchronous copyFile calls on the same path in ONE tick must not both reach the port", async () => {
    const FILES = [
      { path: "pages/index.html", group: "page" as const, readable: true, editable: true, resettable: true },
      { path: "css/a.css", group: "style" as const, readable: true, editable: true, resettable: true },
    ];
    const port = createFakeThemeExplorePort({ files: FILES, contents: { "pages/index.html": "<html></html>" } });
    const copyThemeFile = vi.fn(port.copyThemeFile.bind(port));
    port.copyThemeFile = copyThemeFile;

    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(2));

    // Both calls fire synchronously in the SAME callback, before React re-renders with
    // `copyingPath` reflecting the first call — genuinely the same tick, not two `act()`s.
    act(() => {
      void result.current.copyFile("css/a.css");
      void result.current.copyFile("css/a.css");
    });

    await waitFor(() => expect(result.current.copyingPath).toBeNull());

    expect(copyThemeFile).toHaveBeenCalledTimes(1);
  });
});

/**
 * Delete (2026-08-29 owner ask, alongside Copy/Rename). `openDeleteConfirm` mirrors `startRename`'s
 * own client-side pre-check shape almost exactly — same `lockedIdentityPaths`/`IDENTITY_LOCKED_GROUPS`
 * gate, same "refuse inline with a toast instead of opening the UI" behavior for a locked file — so
 * this suite mirrors the rename-lock suite above, plus `confirmDelete`'s own round trip.
 */
describe("useThemeExplore — delete", () => {
  const FILES = [
    { path: "pages/index.html", group: "page" as const, readable: true, editable: true, resettable: true },
    { path: "pages/about.html", group: "page" as const, readable: true, editable: true, resettable: true },
    { path: "js/main.js", group: "script" as const, readable: true, editable: true, resettable: true },
  ];
  const CONTENTS = {
    "pages/index.html": "<h1>Home</h1>",
    "pages/about.html": "<h1>About</h1>",
    "js/main.js": "console.log(1);",
  };

  it("openDeleteConfirm sets deleteTarget for an eligible file, with no server call yet", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(3));

    act(() => result.current.openDeleteConfirm("pages/about.html"));
    expect(result.current.deleteTarget).toBe("pages/about.html");
    expect(result.current.error).toBeNull();
  });

  it("refuses inline (error set, deleteTarget stays null) for a REQUIRED file, same as startRename's own lock", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(3));

    act(() => result.current.openDeleteConfirm("pages/index.html"));
    expect(result.current.deleteTarget).toBeNull();
    expect(result.current.error).toMatch(/can't be deleted/);
  });

  it("refuses inline for an IDENTITY_LOCKED_GROUPS member (script) even though its CONTENT is editable", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(3));

    act(() => result.current.openDeleteConfirm("js/main.js"));
    expect(result.current.deleteTarget).toBeNull();
    expect(result.current.error).toMatch(/can't be deleted/);
  });

  it("closeDeleteConfirm clears the target without calling the port", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const deleteSpy = vi.spyOn(port, "deleteThemeFile");
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(3));

    act(() => result.current.openDeleteConfirm("pages/about.html"));
    act(() => result.current.closeDeleteConfirm());
    expect(result.current.deleteTarget).toBeNull();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("confirmDelete removes the file via the port and refetches the file list", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(3));

    act(() => result.current.openDeleteConfirm("pages/about.html"));
    expect(result.current.deleteTarget).toBe("pages/about.html");

    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(result.current.deleteTarget).toBeNull();
    expect(result.current.deleting).toBe(false);
    expect(result.current.notice).toBe("Deleted pages/about.html");
    expect(result.current.files.some((f) => f.path === "pages/about.html")).toBe(false);
  });

  it("confirmDelete falls back the SELECTED file's own selection when the deleted file was open", async () => {
    const port = createFakeThemeExplorePort({
      files: [
        { path: "pages/index.html", group: "page" as const, readable: true, editable: true, resettable: true },
        { path: "pages/about.html", group: "page" as const, readable: true, editable: true, resettable: true },
      ],
      contents: { "pages/index.html": "<h1>Home</h1>", "pages/about.html": "<h1>About</h1>" },
    });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.selected).toBe("pages/index.html"));

    act(() => result.current.select("pages/about.html"));
    await waitFor(() => expect(result.current.selected).toBe("pages/about.html"));

    act(() => result.current.openDeleteConfirm("pages/about.html"));
    await act(async () => {
      await result.current.confirmDelete();
    });

    // The open file was deleted — selection falls back to the theme's default page rather than
    // continuing to point at a path that no longer exists.
    expect(result.current.selected).toBe("pages/index.html");
  });

  it("confirmDelete surfaces a port failure as error and leaves the dialog open with deleting reset", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    port.deleteThemeFile = () => Promise.reject(new Error("boom"));
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(3));

    act(() => result.current.openDeleteConfirm("pages/about.html"));
    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(result.current.error).toBe("boom");
    expect(result.current.deleting).toBe(false);
    // The confirmation stays open on failure — the operator has not been told it's safe to walk away.
    expect(result.current.deleteTarget).toBe("pages/about.html");
  });
});

describe("useThemeExplore — initial load failure", () => {
  it("surfaces an Error rejection from getThemeDetail as error", async () => {
    const port = createFakeThemeExplorePort();
    port.getThemeDetail = () => Promise.reject(new Error("theme not found"));
    const { result } = renderHook(() => useThemeExplore("ghost", { port, t: (k) => k }));

    await waitFor(() => expect(result.current.error).toBe("theme not found"));
    expect(result.current.detail).toBeNull();
  });

  it("falls back to a generic message when the rejection is not an Error instance", async () => {
    const port = createFakeThemeExplorePort();
    port.getThemeDetail = () => Promise.reject("nope");
    const { result } = renderHook(() => useThemeExplore("ghost", { port, t: (k) => k }));

    await waitFor(() => expect(result.current.error).toBe("failed to load theme"));
  });

  it("surfaces a 'not a page or file' toast when a requested ?page=/?file= misses, without failing the load", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Home</h1>" },
    });
    const { result } = renderHook(() =>
      useThemeExplore("basic", { port, t: (k) => k }, { pageId: "does-not-exist" })
    );

    await waitFor(() => expect(result.current.error).toBe('"does-not-exist" isn\'t a page or file in this theme.'));
    // Still lands on the ordinary default selection — a bad param degrades, it does not block the load.
    expect(result.current.selected).toBe("pages/index.html");
  });
});

describe("useThemeExplore — initial load effect cleanup (cancelled)", () => {
  it("drops a stale successful getThemeDetail response after unmount", async () => {
    let resolveDetail!: (value: { id: string; name: string; tier: string; status: string; errors: string[]; pages: string[]; partials: string[]; lineage: null; hasOriginal: boolean; files: never[] }) => void;
    const port = createFakeThemeExplorePort();
    port.getThemeDetail = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveDetail = resolve as never;
        })
    );
    const { result, unmount } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(port.getThemeDetail).toHaveBeenCalledTimes(1));

    unmount();

    // The now-cancelled effect's response lands after unmount — must not throw, and (since the
    // hook is gone) there is nothing left to assert on except that this settles cleanly.
    expect(() => {
      resolveDetail({
        id: "basic",
        name: "Basic",
        tier: "declarative",
        status: "active",
        errors: [],
        pages: [],
        partials: [],
        lineage: null,
        hasOriginal: true,
        files: [],
      });
    }).not.toThrow();
    expect(result.current.error).toBeNull();
  });

  it("drops a stale FAILED getThemeDetail response after unmount", async () => {
    let rejectDetail!: (reason: unknown) => void;
    const port = createFakeThemeExplorePort();
    port.getThemeDetail = vi.fn(
      () =>
        new Promise((_resolve, reject) => {
          rejectDetail = reject;
        })
    );
    const { result, unmount } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(port.getThemeDetail).toHaveBeenCalledTimes(1));

    unmount();

    expect(() => rejectDetail(new Error("too late"))).not.toThrow();
    expect(result.current.error).toBeNull();
  });

  /**
   * The two tests above prove the guard doesn't THROW post-unmount, but `result.current` is frozen
   * at the last render once unmounted — they can't observe whether a write was actually skipped.
   * This one keeps the hook MOUNTED throughout by changing `themeId` instead (the same dependency
   * change that runs this effect's cleanup for real), so `result.current` stays live and can prove
   * the stale response's content never lands.
   */
  it("a stale successful response for an OLD themeId does not overwrite state the NEW themeId already loaded", async () => {
    let resolveStale!: (value: {
      id: string;
      name: string;
      tier: string;
      status: string;
      errors: string[];
      pages: string[];
      partials: string[];
      lineage: null;
      hasOriginal: boolean;
      files: never[];
    }) => void;
    const port = createFakeThemeExplorePort({
      detail: { id: "b", name: "Theme B", tier: "static", status: "valid", errors: [], lineage: null, hasOriginal: true },
      files: [],
    });
    const realGetThemeDetail = port.getThemeDetail.bind(port);
    port.getThemeDetail = vi.fn((themeId: string) => {
      if (themeId === "a") return new Promise((resolve) => (resolveStale = resolve as never));
      return realGetThemeDetail(themeId);
    });

    const { result, rerender } = renderHook(
      ({ themeId }: { themeId: string }) => useThemeExplore(themeId, { port, t: (k) => k }),
      { initialProps: { themeId: "a" } }
    );
    await waitFor(() => expect(port.getThemeDetail).toHaveBeenCalledWith("a"));

    // Navigate to a different theme before "a"'s load ever resolves — this runs the OLD effect's
    // cleanup (`cancelled = true`) and starts a fresh one for "b", which resolves normally.
    rerender({ themeId: "b" });
    await waitFor(() => expect(result.current.detail?.id).toBe("b"));

    // "a"'s stale response lands now, well after "b" is already showing.
    await act(async () => {
      resolveStale({
        id: "STALE-A",
        name: "Stale A",
        tier: "static",
        status: "valid",
        errors: [],
        pages: [],
        partials: [],
        lineage: null,
        hasOriginal: true,
        files: [],
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.detail?.id).toBe("b");
  });
});

describe("useThemeExplore — file-content effect failure", () => {
  it("surfaces an Error rejection from getThemeFile as error", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Home</h1>" },
    });
    port.getThemeFile = () => Promise.reject(new Error("read failed"));
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));

    await waitFor(() => expect(result.current.error).toBe("read failed"));
  });

  it("falls back to a generic message when the rejection is not an Error instance", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Home</h1>" },
    });
    port.getThemeFile = () => Promise.reject("nope");
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));

    await waitFor(() => expect(result.current.error).toBe("failed to read file"));
  });

  it("drops a stale FAILED getThemeFile response for a selection the operator has already navigated away from", async () => {
    const deferred: Record<string, { reject: (reason: unknown) => void }> = {};
    const port = createFakeThemeExplorePort({
      files: [
        { path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true },
        { path: "pages/about.html", group: "page", readable: true, editable: true, resettable: true },
      ],
      contents: { "pages/index.html": "<h1>Home</h1>", "pages/about.html": "<h1>About</h1>" },
    });
    port.getThemeFile = vi.fn(
      (_themeId: string, path: string) =>
        new Promise((_resolve, reject) => {
          deferred[path] = { reject };
        })
    );
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(port.getThemeFile).toHaveBeenCalledTimes(1));

    act(() => result.current.select("pages/about.html"));
    await waitFor(() => expect(port.getThemeFile).toHaveBeenCalledTimes(2));

    await act(async () => {
      deferred["pages/index.html"]!.reject(new Error("too late"));
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The stale rejection must not surface as an error for the file the operator has since moved on
    // from.
    expect(result.current.error).toBeNull();
  });

  it("drops a stale getThemeFile response for a selection the operator has already navigated away from", async () => {
    const deferred: Record<string, { resolve: (value: { content: string }) => void }> = {};
    const port = createFakeThemeExplorePort({
      files: [
        { path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true },
        { path: "pages/about.html", group: "page", readable: true, editable: true, resettable: true },
      ],
      contents: { "pages/index.html": "<h1>Home</h1>", "pages/about.html": "<h1>About</h1>" },
    });
    port.getThemeFile = vi.fn(
      (_themeId: string, path: string) =>
        new Promise((resolve) => {
          deferred[path] = { resolve };
        })
    );
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(port.getThemeFile).toHaveBeenCalledTimes(1));

    // Navigate away before the first file's content ever arrives.
    act(() => result.current.select("pages/about.html"));
    await waitFor(() => expect(port.getThemeFile).toHaveBeenCalledTimes(2));

    // The stale index.html response now lands — it must not clobber the about.html source that's
    // still pending, nor the currently-selected file.
    await act(async () => {
      deferred["pages/index.html"]!.resolve({ content: "<h1>Home</h1>" });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.selected).toBe("pages/about.html");
    expect(result.current.source).toBe("");

    await act(async () => {
      deferred["pages/about.html"]!.resolve({ content: "<h1>About</h1>" });
    });
    await waitFor(() => expect(result.current.source).toBe("<h1>About</h1>"));
  });
});

describe("useThemeExplore — save", () => {
  it("is a no-op when nothing is selected", async () => {
    const port = createFakeThemeExplorePort({ files: [] });
    const putSpy = vi.spyOn(port, "putThemeFile");
    const { result } = renderHook(() => useThemeExplore("empty", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    expect(result.current.selected).toBeNull();

    await act(async () => {
      await result.current.save();
    });

    expect(putSpy).not.toHaveBeenCalled();
    expect(result.current.saving).toBe(false);
  });

  it("surfaces an Error rejection from putThemeFile as error and stops saving", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Home</h1>" },
    });
    port.putThemeFile = () => Promise.reject(new Error("write failed"));
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.source).toBe("<h1>Home</h1>"));
    act(() => result.current.setSource("<h1>Changed</h1>"));

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error).toBe("write failed");
    expect(result.current.saving).toBe(false);
    // The failed save left the working copy dirty — nothing was actually persisted.
    expect(result.current.dirty).toBe(true);
  });

  it("falls back to a generic message when the rejection is not an Error instance", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Home</h1>" },
    });
    port.putThemeFile = () => Promise.reject("nope");
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.source).toBe("<h1>Home</h1>"));
    act(() => result.current.setSource("<h1>Changed</h1>"));

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error).toBe("failed to save file");
  });
});

/**
 * `reset` — restore the open file to its catalog original. No existing suite ever called it before
 * this describe block: `resetConfirmOpen`'s own guard is a UI dialog concern (`ThemeExplore.tsx`),
 * not something this hook enforces itself, so this drives `reset()` directly.
 */
describe("useThemeExplore — reset", () => {
  it("is a no-op when nothing is selected", async () => {
    const port = createFakeThemeExplorePort({ files: [] });
    const resetSpy = vi.spyOn(port, "resetThemeFile");
    const { result } = renderHook(() => useThemeExplore("empty", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.detail).not.toBeNull());

    await act(async () => {
      await result.current.reset();
    });

    expect(resetSpy).not.toHaveBeenCalled();
    expect(result.current.resetting).toBe(false);
  });

  it("adopts the server's returned content, bumps previewNonce, and closes the confirm dialog", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Changed</h1>" },
    });
    port.resetThemeFile = () => Promise.resolve({ content: "<h1>Original</h1>" });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.source).toBe("<h1>Changed</h1>"));
    act(() => result.current.setSource("<h1>Edited</h1>"));
    act(() => result.current.openResetConfirm());
    const nonceBefore = result.current.previewNonce;

    await act(async () => {
      await result.current.reset();
    });

    expect(result.current.source).toBe("<h1>Original</h1>");
    expect(result.current.dirty).toBe(false);
    expect(result.current.notice).toBe("Reset pages/index.html to the original");
    expect(result.current.previewNonce).toBe(nonceBefore + 1);
    expect(result.current.resetConfirmOpen).toBe(false);
    expect(result.current.resetting).toBe(false);
  });

  it("surfaces an Error rejection from resetThemeFile as error and leaves the confirm dialog open", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Home</h1>" },
    });
    port.resetThemeFile = () => Promise.reject(new Error("reset failed"));
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.source).toBe("<h1>Home</h1>"));
    act(() => result.current.openResetConfirm());

    await act(async () => {
      await result.current.reset();
    });

    expect(result.current.error).toBe("reset failed");
    expect(result.current.resetting).toBe(false);
    // Failure never reaches the "close the dialog" line — the operator is still looking at it.
    expect(result.current.resetConfirmOpen).toBe(true);
  });

  it("falls back to a generic message when the rejection is not an Error instance", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Home</h1>" },
    });
    port.resetThemeFile = () => Promise.reject("nope");
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.source).toBe("<h1>Home</h1>"));

    await act(async () => {
      await result.current.reset();
    });

    expect(result.current.error).toBe("failed to reset file");
  });
});

describe("useThemeExplore — performRename failure and the non-selected-file ternary", () => {
  const FILES = [
    { path: "pages/index.html", group: "page" as const, readable: true, editable: true, resettable: true },
    { path: "css/a.css", group: "style" as const, readable: true, editable: true, resettable: true },
  ];
  const CONTENTS = { "pages/index.html": "<h1>Home</h1>", "css/a.css": "body{}" };

  it("reports a NAME_TAKEN ApiError with its own dedicated message", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    port.renameThemeFile = () => Promise.reject(new ApiError("conflict", 409, "NAME_TAKEN"));
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(2));

    act(() => result.current.startRename("css/a.css"));
    act(() => result.current.setRenameDraft("b.css"));
    await act(async () => {
      result.current.commitRename();
    });

    await waitFor(() => expect(result.current.error).toBe("'b.css' already exists in this theme"));
    expect(result.current.renaming).toBe(false);
  });

  it("reports a generic Error's own message when it isn't a NAME_TAKEN ApiError", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    port.renameThemeFile = () => Promise.reject(new Error("server exploded"));
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(2));

    act(() => result.current.startRename("css/a.css"));
    act(() => result.current.setRenameDraft("b.css"));
    await act(async () => {
      result.current.commitRename();
    });

    await waitFor(() => expect(result.current.error).toBe("server exploded"));
  });

  it("falls back to a generic rename-failed message when the rejection is not an Error instance", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    port.renameThemeFile = () => Promise.reject("nope");
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(2));

    act(() => result.current.startRename("css/a.css"));
    act(() => result.current.setRenameDraft("b.css"));
    await act(async () => {
      result.current.commitRename();
    });

    await waitFor(() => expect(result.current.error).toBe("failed to rename file"));
  });

  it("updates selection to the new path when the renamed file WAS the one open", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.selected).toBe("pages/index.html"));

    act(() => result.current.select("css/a.css"));
    await waitFor(() => expect(result.current.selected).toBe("css/a.css"));

    act(() => result.current.startRename("css/a.css"));
    act(() => result.current.setRenameDraft("b.css"));
    await act(async () => {
      result.current.commitRename();
    });

    await waitFor(() => expect(result.current.notice).toBe("Renamed to css/b.css"));
    expect(result.current.selected).toBe("css/b.css");
  });

  it("keeps the existing selection unchanged when the renamed file was not the one open", async () => {
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.selected).toBe("pages/index.html"));

    act(() => result.current.startRename("css/a.css"));
    act(() => result.current.setRenameDraft("b.css"));
    await act(async () => {
      result.current.commitRename();
    });

    await waitFor(() => expect(result.current.notice).toBe("Renamed to css/b.css"));
    // The rename targeted css/a.css, not the currently-open pages/index.html — selection must not
    // have been dragged along with it.
    expect(result.current.selected).toBe("pages/index.html");
  });
});

describe("useThemeExplore — startRename's generic read-only-group message names the RENAME action", () => {
  it("says 'renaming' (not 'deleting') when locking an IDENTITY_LOCKED_GROUPS member for rename", async () => {
    const port = createFakeThemeExplorePort({
      files: [
        { path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true },
        { path: "js/main.js", group: "script", readable: true, editable: true, resettable: true },
      ],
    });
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(2));

    act(() => result.current.startRename("js/main.js"));

    expect(result.current.renamingPath).toBeNull();
    expect(result.current.error).toMatch(/renaming it could break/);
  });
});

describe("useThemeExplore — commitRename validation", () => {
  const FILES = [
    { path: "pages/index.html", group: "page" as const, readable: true, editable: true, resettable: true },
    { path: "pages/about.html", group: "page" as const, readable: true, editable: true, resettable: true },
    { path: "css/a.css", group: "style" as const, readable: true, editable: true, resettable: true },
  ];

  it("is a no-op when nothing is being renamed", async () => {
    const port = createFakeThemeExplorePort({ files: FILES });
    const renameSpy = vi.spyOn(port, "renameThemeFile");
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(3));

    act(() => result.current.commitRename());

    expect(renameSpy).not.toHaveBeenCalled();
  });

  it("refuses an empty (whitespace-only) name without calling the port", async () => {
    const port = createFakeThemeExplorePort({ files: FILES });
    const renameSpy = vi.spyOn(port, "renameThemeFile");
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(3));

    act(() => result.current.startRename("css/a.css"));
    act(() => result.current.setRenameDraft("   "));
    act(() => result.current.commitRename());

    expect(result.current.error).toBe("Name cannot be empty");
    expect(renameSpy).not.toHaveBeenCalled();
    // Stays in rename-edit mode — the operator can fix the draft in place.
    expect(result.current.renamingPath).toBe("css/a.css");
  });

  it("refuses a name containing a path separator without calling the port", async () => {
    const port = createFakeThemeExplorePort({ files: FILES });
    const renameSpy = vi.spyOn(port, "renameThemeFile");
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(3));

    act(() => result.current.startRename("css/a.css"));
    act(() => result.current.setRenameDraft("sub/b.css"));
    act(() => result.current.commitRename());

    expect(result.current.error).toBe("Name cannot contain a path separator");
    expect(renameSpy).not.toHaveBeenCalled();
  });

  it("refuses a backslash the same way as a forward slash", async () => {
    const port = createFakeThemeExplorePort({ files: FILES });
    const renameSpy = vi.spyOn(port, "renameThemeFile");
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(3));

    act(() => result.current.startRename("css/a.css"));
    act(() => result.current.setRenameDraft("sub\\b.css"));
    act(() => result.current.commitRename());

    expect(result.current.error).toBe("Name cannot contain a path separator");
    expect(renameSpy).not.toHaveBeenCalled();
  });

  it("silently closes rename-edit mode on a same-name draft, with no port call", async () => {
    const port = createFakeThemeExplorePort({ files: FILES });
    const renameSpy = vi.spyOn(port, "renameThemeFile");
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(3));

    act(() => result.current.startRename("css/a.css"));
    // Draft starts equal to the current basename already (startRename seeds it that way) — commit
    // immediately without editing it.
    act(() => result.current.commitRename());

    expect(result.current.renamingPath).toBeNull();
    expect(result.current.error).toBeNull();
    expect(renameSpy).not.toHaveBeenCalled();
  });

  it("diverts a PAGE rename into pageRenameWarning instead of renaming immediately", async () => {
    const port = createFakeThemeExplorePort({ files: FILES });
    const renameSpy = vi.spyOn(port, "renameThemeFile");
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(3));

    act(() => result.current.startRename("pages/about.html"));
    act(() => result.current.setRenameDraft("contact.html"));
    act(() => result.current.commitRename());

    expect(result.current.pageRenameWarning).toEqual({ path: "pages/about.html", name: "contact.html" });
    expect(result.current.renamingPath).toBeNull();
    expect(renameSpy).not.toHaveBeenCalled();
  });
});

describe("useThemeExplore — confirmPageRename / cancelPageRenameWarning", () => {
  const FILES = [
    { path: "pages/index.html", group: "page" as const, readable: true, editable: true, resettable: true },
    { path: "pages/about.html", group: "page" as const, readable: true, editable: true, resettable: true },
  ];

  it("is a no-op when there is no pending page-rename warning", async () => {
    const port = createFakeThemeExplorePort({ files: FILES });
    const renameSpy = vi.spyOn(port, "renameThemeFile");
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(2));

    await act(async () => {
      await result.current.confirmPageRename();
    });

    expect(renameSpy).not.toHaveBeenCalled();
  });

  it("performs the rename and clears the warning once confirmed", async () => {
    const port = createFakeThemeExplorePort({ files: FILES });
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(2));

    act(() => result.current.startRename("pages/about.html"));
    act(() => result.current.setRenameDraft("contact.html"));
    act(() => result.current.commitRename());
    expect(result.current.pageRenameWarning).not.toBeNull();

    await act(async () => {
      await result.current.confirmPageRename();
    });

    expect(result.current.pageRenameWarning).toBeNull();
    expect(result.current.notice).toBe("Renamed to pages/contact.html");
  });

  it("cancelPageRenameWarning discards the pending warning with no server call", async () => {
    const port = createFakeThemeExplorePort({ files: FILES });
    const renameSpy = vi.spyOn(port, "renameThemeFile");
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(2));

    act(() => result.current.startRename("pages/about.html"));
    act(() => result.current.setRenameDraft("contact.html"));
    act(() => result.current.commitRename());

    act(() => result.current.cancelPageRenameWarning());

    expect(result.current.pageRenameWarning).toBeNull();
    expect(renameSpy).not.toHaveBeenCalled();
  });
});

describe("useThemeExplore — copyFile failure", () => {
  it("surfaces an Error rejection as error", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/about.html", group: "page", readable: true, editable: true, resettable: true }],
    });
    port.copyThemeFile = () => Promise.reject(new Error("copy failed"));
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(1));

    await act(async () => {
      await result.current.copyFile("pages/about.html");
    });

    expect(result.current.error).toBe("copy failed");
    expect(result.current.copyingPath).toBeNull();
  });

  it("falls back to a generic message when the rejection is not an Error instance", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/about.html", group: "page", readable: true, editable: true, resettable: true }],
    });
    port.copyThemeFile = () => Promise.reject("nope");
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(1));

    await act(async () => {
      await result.current.copyFile("pages/about.html");
    });

    expect(result.current.error).toBe("failed to copy file");
  });
});

describe("useThemeExplore — confirmDelete no-target guard, and the empty-theme fallback", () => {
  it("is a no-op when nothing is pending delete", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/about.html", group: "page", readable: true, editable: true, resettable: true }],
    });
    const deleteSpy = vi.spyOn(port, "deleteThemeFile");
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(1));

    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("falls back to null selection when deleting the theme's last remaining file", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/only.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/only.html": "<h1>Only</h1>" },
    });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.selected).toBe("pages/only.html"));

    act(() => result.current.openDeleteConfirm("pages/only.html"));
    await act(async () => {
      await result.current.confirmDelete();
    });

    // No index page, no other page, no other file left at all — the fallback bottoms out at null
    // rather than pointing at a path that no longer exists.
    expect(result.current.files).toEqual([]);
    expect(result.current.selected).toBeNull();
  });
});

describe("useThemeExplore — confirmDelete failure, non-Error rejection", () => {
  it("falls back to a generic message when the rejection is not an Error instance", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/about.html", group: "page", readable: true, editable: true, resettable: true }],
    });
    port.deleteThemeFile = () => Promise.reject("nope");
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(1));

    act(() => result.current.openDeleteConfirm("pages/about.html"));
    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(result.current.error).toBe("failed to delete file");
  });
});

describe("useThemeExplore — select on a path this theme doesn't have", () => {
  it("still updates selected, but skips the address-bar write (nothing valid to link to)", async () => {
    window.history.replaceState(null, "", "/admin/themes/explore?theme=basic");
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Home</h1>" },
    });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.selected).toBe("pages/index.html"));
    const searchBefore = window.location.search;

    act(() => result.current.select("pages/ghost.html"));

    expect(result.current.selected).toBe("pages/ghost.html");
    expect(window.location.search).toBe(searchBefore);
  });
});

describe("useThemeExplore — setPagePublished, the remaining notice/error branches", () => {
  it("reports the Published notice on the true (publish) direction", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "render/pages/pricing.html", group: "page", readable: true, editable: true, resettable: true, published: false }],
      contents: { "render/pages/pricing.html": "<h1>Pricing</h1>" },
    });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.selected).toBe("render/pages/pricing.html"));

    await act(async () => {
      await result.current.setPagePublished(true);
    });

    expect(result.current.notice).toBe("Published pricing");
  });

  it("falls back to a generic message when a setPagePublished rejection is not an Error instance", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "render/pages/pricing.html", group: "page", readable: true, editable: true, resettable: true, published: true }],
      contents: { "render/pages/pricing.html": "<h1>Pricing</h1>" },
    });
    port.setPagePublished = () => Promise.reject("nope");
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.selected).toBe("render/pages/pricing.html"));

    await act(async () => {
      await result.current.setPagePublished(false);
    });

    expect(result.current.error).toBe("failed to update publish state");
  });
});

/**
 * The ⌘S / Ctrl+S save shortcut — bound to `window`, not the textarea, so it works from anywhere on
 * the screen. No existing suite dispatches a `keydown` at all.
 */
describe("useThemeExplore — onKeyDown save shortcut", () => {
  function dispatchKey(init: KeyboardEventInit) {
    window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  }

  it("ignores a key that isn't s, even with a modifier held", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Home</h1>" },
    });
    const putSpy = vi.spyOn(port, "putThemeFile");
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.source).toBe("<h1>Home</h1>"));
    act(() => result.current.setSource("<h1>Changed</h1>"));

    act(() => dispatchKey({ key: "a", metaKey: true }));

    expect(putSpy).not.toHaveBeenCalled();
  });

  it("ignores s with no modifier at all", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Home</h1>" },
    });
    const putSpy = vi.spyOn(port, "putThemeFile");
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.source).toBe("<h1>Home</h1>"));
    act(() => result.current.setSource("<h1>Changed</h1>"));

    act(() => dispatchKey({ key: "s" }));

    expect(putSpy).not.toHaveBeenCalled();
  });

  it("swallows the browser's Save-Page-As dialog (preventDefault) even when there is nothing to save", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Home</h1>" },
    });
    const putSpy = vi.spyOn(port, "putThemeFile");
    renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));

    const event = new KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    act(() => {
      window.dispatchEvent(event);
    });

    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    // Not dirty yet — swallowed, but nothing was actually saved.
    expect(putSpy).not.toHaveBeenCalled();
  });

  it("triggers save on Cmd+S when dirty", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Home</h1>" },
    });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.source).toBe("<h1>Home</h1>"));
    act(() => result.current.setSource("<h1>Changed</h1>"));

    await act(async () => {
      dispatchKey({ key: "s", metaKey: true });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.dirty).toBe(false));
    expect(result.current.notice).toBe("Saved pages/index.html");
  });

  it("triggers save on Ctrl+S too", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Home</h1>" },
    });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.source).toBe("<h1>Home</h1>"));
    act(() => result.current.setSource("<h1>Changed</h1>"));

    await act(async () => {
      dispatchKey({ key: "S", ctrlKey: true }); // uppercase — toLowerCase() must normalize it
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.dirty).toBe(false));
  });

  it("does not save again while a save is already in flight", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Home</h1>" },
    });
    port.putThemeFile = vi.fn(() => new Promise(() => {}));
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.source).toBe("<h1>Home</h1>"));
    act(() => result.current.setSource("<h1>Changed</h1>"));

    act(() => {
      dispatchKey({ key: "s", metaKey: true });
    });
    await waitFor(() => expect(result.current.saving).toBe(true));

    act(() => {
      dispatchKey({ key: "s", metaKey: true });
    });

    expect(port.putThemeFile).toHaveBeenCalledTimes(1);
  });

  it("does not save when nothing is selected", async () => {
    const port = createFakeThemeExplorePort({ files: [] });
    const putSpy = vi.spyOn(port, "putThemeFile");
    const { result } = renderHook(() => useThemeExplore("empty", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    expect(result.current.selected).toBeNull();

    act(() => dispatchKey({ key: "s", metaKey: true }));

    expect(putSpy).not.toHaveBeenCalled();
  });
});

describe("useThemeExplore — trivial dismiss/open/close closures", () => {
  it("dismissError clears a standing error", async () => {
    const port = createFakeThemeExplorePort();
    port.getThemeDetail = () => Promise.reject(new Error("boom"));
    const { result } = renderHook(() => useThemeExplore("ghost", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.error).toBe("boom"));

    act(() => result.current.dismissError());
    expect(result.current.error).toBeNull();
  });

  it("dismissNotice clears a standing notice", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/index.html": "<h1>Home</h1>" },
    });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.source).toBe("<h1>Home</h1>"));
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.notice).not.toBeNull();

    act(() => result.current.dismissNotice());
    expect(result.current.notice).toBeNull();
  });

  it("openResetConfirm/closeResetConfirm toggle resetConfirmOpen with no server call", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
    });
    const resetSpy = vi.spyOn(port, "resetThemeFile");
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(1));

    act(() => result.current.openResetConfirm());
    expect(result.current.resetConfirmOpen).toBe(true);

    act(() => result.current.closeResetConfirm());
    expect(result.current.resetConfirmOpen).toBe(false);
    expect(resetSpy).not.toHaveBeenCalled();
  });
});

/**
 * `startRename`/`openDeleteConfirm`'s client-side lock check for a required file that ISN'T
 * `pages/index.html` itself (`theme.json`/`tokens.json`) — every existing lock test above only ever
 * exercises the INDEX page's own dedicated message. Also exercises `lockedIdentityChangeReason`'s
 * `kind ?? "config"` fallback: `theme.json` is intentionally left OUT of the `files` fixture below
 * (the lock is a path-based check, independent of whether the file even appears in the listing), so
 * `files.find(...)?.kind` is `undefined` here.
 */
describe("useThemeExplore — locked-identity message for a non-index required file", () => {
  it("startRename reports the FILE-worded message (not the index page's own wording) for theme.json", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
    });
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(1));

    act(() => result.current.startRename("theme.json"));

    expect(result.current.renamingPath).toBeNull();
    expect(result.current.error).toBe(
      "theme.json can't be renamed — every theme requires this exact file to load at all."
    );
  });

  it("openDeleteConfirm reports the same FILE-worded message for tokens.json", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/index.html", group: "page", readable: true, editable: true, resettable: true }],
    });
    const { result } = renderHook(() => useThemeExplore("t", { port, t: (k) => k }));
    await waitFor(() => expect(result.current.files.length).toBe(1));

    act(() => result.current.openDeleteConfirm("tokens.json"));

    expect(result.current.deleteTarget).toBeNull();
    expect(result.current.error).toBe(
      "tokens.json can't be deleted — every theme requires this exact file to load at all."
    );
  });
});

describe("useWiredThemeExplore", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wires the real api-backed port and a themes-i18n-bound translator", async () => {
    const getDetailSpy = vi.spyOn(api, "getThemeDetail").mockResolvedValue({
      id: "basic",
      name: "Basic",
      tier: "declarative",
      status: "active",
      errors: [],
      pages: [],
      partials: [],
      lineage: null,
      hasOriginal: true,
      files: [],
    } as never);

    const { result } = renderHook(() => useWiredThemeExplore("basic"));

    // Bound translator falls back to the English source string with no override in play — same
    // proof `useWiredThemes`'s own test uses that `t` is `themes-i18n.ts`'s dictionary translator,
    // not the raw identity function every `useThemeExplore({ port, t })` unit test above passes.
    expect(result.current.t("Themes")).toBe("Themes");

    await waitFor(() => expect(result.current.detail?.name).toBe("Basic"));
    expect(getDetailSpy).toHaveBeenCalledTimes(1);
  });
});

// `readOnlyReason`/`lockedPublishReason`/`selectedFilePublishState`/`selectedFileLabel` used to be
// top-level functions inline in `ThemeExplore.tsx`, reachable only through a full component render
// (`ThemeExplore.unit.test.tsx` drives a full-controller fake, never these directly). Moved here
// (2026-09-03 relocation pass, moving derived-logic computations out of `.tsx` files and into their
// hooks) alongside this hook's other pure per-file derivations (`fileLabel`, `mapDetailFiles`).
const t = (key: string) => key;

function file(overrides: Partial<ThemeExploreFile> = {}): ThemeExploreFile {
  return {
    path: "pages/about.html",
    label: "about",
    kind: "page",
    readable: true,
    editable: true,
    resettable: true,
    published: null,
    collidingContent: null,
    ...overrides,
  };
}

describe("readOnlyReason", () => {
  it("returns the untranslated reason string — the caller applies t()", () => {
    expect(readOnlyReason()).toBe("This file type is read-only in Explore.");
  });
});

describe("lockedPublishReason", () => {
  it("reports index as always-on", () => {
    expect(lockedPublishReason("index", t)).toEqual({ on: true, reason: "Always published — theme home page" });
  });

  it("reports 404 as always-on", () => {
    expect(lockedPublishReason("404", t)).toEqual({ on: true, reason: "Always published — error page" });
  });

  it("reports any other page label as a locked-off template shell", () => {
    expect(lockedPublishReason("blog-post", t)).toEqual({
      on: false,
      reason: "Not a standalone page — used as a content template",
    });
  });
});

describe("selectedFilePublishState", () => {
  it("returns null when no file is selected", () => {
    expect(selectedFilePublishState(undefined, t)).toBeNull();
  });

  it("returns a toggle state for a real candidate page", () => {
    expect(selectedFilePublishState(file({ published: true }), t)).toEqual({ kind: "toggle", published: true });
  });

  it("returns null for a non-page file with no publish state", () => {
    expect(selectedFilePublishState(file({ kind: "style", published: null }), t)).toBeNull();
  });

  it("returns a locked state for index/404/a declared template shell", () => {
    expect(selectedFilePublishState(file({ label: "index", published: null }), t)).toEqual({
      kind: "locked",
      on: true,
      reason: "Always published — theme home page",
    });
  });
});

describe("selectedFileLabel", () => {
  it("returns the file's label", () => {
    expect(selectedFileLabel(file({ label: "about" }))).toBe("about");
  });

  it("returns '' when no file is selected", () => {
    expect(selectedFileLabel(undefined)).toBe("");
  });
});
