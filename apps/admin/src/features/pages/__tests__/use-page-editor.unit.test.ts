import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWiredPageEditor, usePageEditor } from "../hooks/use-page-editor.hooks";
import { createFakePageEditorPort } from "../hooks/page-editor-dependencies.hooks";
import { createFakeThemeCanvasPort } from "../hooks/theme-canvas-dependencies.hooks";

/**
 * @file `usePageEditor` — regression coverage for a real data-loss bug found by external audit
 * (`TM-20260810-01-F01`): `save()` used to call the bespoke-HTML writer unconditionally, even for a
 * `doc`-format Page (Privacy Policy/ToS-style pages authored as a Tiptap document). That writer's
 * FIRST call on a still-`doc`-format Page converts it to `html` and drops `body_json`
 * (`routes/admin/pages/update-html.ts`'s own doc comment) — and since this editor always loads
 * `html` as `""` for a doc-format Page (it has no way to render that body), an ordinary Save or
 * Publish silently blanked the page's real content. Fixed by gating the HTML write on
 * `page.bodyFormat === "html"`.
 *
 * Two styles, same split `use-assistant-chats.unit.test.ts` uses. The original suite below still
 * drives `useWiredPageEditor` with `fetch` stubbed (`use-pages.unit.test.ts`'s established harness),
 * so it keeps covering the real client and `useAdminLocale()`'s racing fetch. `usePageEditor` also
 * calls `useAdminLocale()`, which fires its own fetch on mount racing `getPage`'s, and (Task 4,
 * 2026-08-11) `getPresentation()` for the template picker's `activeThemeTemplates` (unified
 * 2026-08-11, was `activeThemePageTemplates`) — the mount helper below queues the page response
 * THREE times so whichever of the three fires first (and second, and third) still gets a valid
 * `Response` (both the locale hook and the presentation-shaped consumer are tolerant of the wrong
 * shape: the locale hook only reads a `values` key that won't be present and falls back, and
 * `availableTemplates` simply ends up `undefined` rather than `[]`, which nothing in these hook-level
 * tests reads `.length` off of).
 *
 * The `describe("injected port …")` block further down at the end of this file injects
 * `createFakePageEditorPort` directly into `usePageEditor` — no `fetch` stub, no `useAdminLocale()`
 * race to absorb — added by the `useWiredX` dependency-injection conversion (see
 * `page-editor-port.hooks.ts`'s file header).
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const DOC_PAGE = {
  id: "pg-doc",
  workspaceId: "workspace-local",
  kind: "page" as const,
  title: "Privacy Policy",
  slug: "privacy-policy",
  bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
  bodyFormat: "doc" as const,
  bodyHtml: null,
  status: "published" as const,
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 3,
};

const HTML_PAGE = {
  id: "pg-html",
  workspaceId: "workspace-local",
  kind: "page" as const,
  title: "Landing",
  slug: "landing",
  bodyJson: {},
  bodyFormat: "html" as const,
  bodyHtml: "<p>hello</p>",
  status: "published" as const,
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 2,
};

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function urlsCalled(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

function callsTo(pathFragment: string): unknown[] {
  return fetchMock.mock.calls.filter((call) => String(call[0]).includes(pathFragment));
}

/** Mounts `usePageEditor` and waits for `page` to load, absorbing the locale-hook's racing fetch. */
async function mountLoaded(routeSlug: string, page: unknown) {
  // One merged body per queued response rather than three page-only ones: the three calls racing
  // here are the page load, the presentation load, and the locale hook's own, in no fixed order, and
  // the presentation reader now dereferences `settings.activeThemeId` (for the Interactive tab's
  // canvas styling) rather than only picking one optional field off the top level. A body that
  // satisfies every shape keeps this helper order-independent, which is the property it was written
  // for.
  const body = { post: page, activeThemeTemplates: [], settings: { activeThemeId: "basic" }, availableThemes: [] };
  fetchMock.mockResolvedValueOnce(jsonResponse(body));
  fetchMock.mockResolvedValueOnce(jsonResponse(body));
  fetchMock.mockResolvedValueOnce(jsonResponse(body));
  const view = renderHook(() => useWiredPageEditor(routeSlug));
  await waitFor(() => expect(view.result.current.page).not.toBeNull());
  return view;
}

describe("save() on a doc-format Page (the F01 regression)", () => {
  it("never calls the HTML writer, and preserves the page's real bodyFormat/bodyJson", async () => {
    const { result } = await mountLoaded("privacy-policy", DOC_PAGE);
    expect(result.current.html).toBe(""); // the documented "no way to render doc format" load behavior

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ post: { ...DOC_PAGE, title: "Privacy Policy (updated)" } })
    );

    act(() => {
      result.current.setTitle("Privacy Policy (updated)");
    });
    await act(async () => {
      await result.current.save();
    });

    expect(callsTo("/pages/pg-doc/html")).toHaveLength(0);

    const metadataCalls = fetchMock.mock.calls.filter(
      (call) => String(call[0]).includes("/posts/pg-doc") && (call[1] as RequestInit | undefined)?.method === "PUT"
    );
    expect(metadataCalls).toHaveLength(1);

    // Regression: the server's real updatePost (features/post/post.ts) requires bodyJson to be a
    // JSON object for any Page not already in html format — omitting it throws "bodyJson must be a
    // JSON object" and leaves a doc-format Page's title/slug/status permanently un-editable. This
    // was missed by an earlier version of this test because a mocked fetch succeeds regardless of
    // what was sent; asserting the actual request body is what catches it.
    const [, sentInit] = metadataCalls[0] as [string, RequestInit];
    expect(JSON.parse(String(sentInit.body))).toMatchObject({ bodyJson: DOC_PAGE.bodyJson });

    expect(result.current.error).toBeNull();
    expect(result.current.message).toMatch(/document editor/i);
  });

  it("still saves title/slug/status even though the body can't be edited here", async () => {
    const { result } = await mountLoaded("privacy-policy", DOC_PAGE);

    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...DOC_PAGE, status: "draft" } }));
    await act(async () => {
      await result.current.save("draft");
    });

    const [, init] = fetchMock.mock.calls.find((call) => String(call[0]).includes("/posts/pg-doc")) as [
      string,
      RequestInit,
    ];
    // bodyJson must round-trip the EXISTING value unchanged — this editor has no way to edit it, so
    // sending anything else (or omitting it, see the test above) would be wrong.
    expect(JSON.parse(String(init.body))).toMatchObject({ status: "draft", bodyJson: DOC_PAGE.bodyJson });
  });

  it("does not send bodyJson at all for an html-format Page (would be meaningless)", async () => {
    const { result } = await mountLoaded("landing", HTML_PAGE);

    fetchMock.mockResolvedValueOnce(jsonResponse({ post: HTML_PAGE }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: HTML_PAGE }));
    await act(async () => {
      await result.current.save();
    });

    const [, init] = fetchMock.mock.calls.find(
      (call) => String(call[0]).includes("/posts/pg-html") && (call[1] as RequestInit | undefined)?.method === "PUT"
    ) as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty("bodyJson");
  });
});

describe("save() on an html-format Page (existing behavior, must not regress)", () => {
  it("still calls the HTML writer before the metadata write", async () => {
    const { result } = await mountLoaded("landing", HTML_PAGE);
    expect(result.current.html).toBe("<p>hello</p>");

    act(() => {
      result.current.setHtml("<p>hello, edited</p>");
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({ post: HTML_PAGE }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: HTML_PAGE }));
    await act(async () => {
      await result.current.save();
    });

    const calls = urlsCalled();
    const htmlIndex = calls.findIndex((u) => u.includes("/pages/pg-html/html"));
    const metaIndex = calls.findIndex((u) => u.includes("/posts/pg-html"));
    expect(htmlIndex).toBeGreaterThanOrEqual(0);
    expect(metaIndex).toBeGreaterThan(htmlIndex);
    expect(result.current.message).toBe("Saved");
  });
});

describe("dirty (the F07 regression: metadata-only edits used to be invisible)", () => {
  it("is true when only the title changes, even though html is untouched", async () => {
    const { result } = await mountLoaded("landing", HTML_PAGE);
    expect(result.current.dirty).toBe(false);

    act(() => {
      result.current.setTitle("Landing (renamed)");
    });
    expect(result.current.dirty).toBe(true);
  });

  it("on a doc-format Page, does not go dirty just because the unusable html field is poked", async () => {
    const { result } = await mountLoaded("privacy-policy", DOC_PAGE);

    act(() => {
      result.current.setHtml("typed into a field that can't be saved");
    });
    expect(result.current.dirty).toBe(false);

    act(() => {
      result.current.setSlug("privacy-policy-v2");
    });
    expect(result.current.dirty).toBe(true);
  });

  // Complexity-ceiling pass (2026-08-11) moved `draftHtml`/`paneWidth` from `PageEditor.tsx` into this
  // hook — this is the regression net for the invariant that move had to preserve exactly: merely
  // looking at the HTML tab must never mark the page as having unsaved changes. See `draftHtml`'s own
  // doc on `PageEditorController` for the full "why".
  it("switching to the HTML tab reformats draftHtml but never marks the page dirty", async () => {
    // A body with a zero-gap block boundary (`</h2><p>`) so `prettifyHtml` actually inserts
    // whitespace — this proves the reformat really ran, rather than happening to be a no-op that
    // would pass even if the effect never fired.
    const page = { ...HTML_PAGE, bodyHtml: "<h2>A</h2><p>B</p>" };
    const { result } = await mountLoaded("landing", page);
    expect(result.current.dirty).toBe(false);
    expect(result.current.view).toBe("preview");

    act(() => {
      result.current.setView("html");
    });

    // The reformat actually happened (rules out a vacuously-passing assertion below).
    expect(result.current.draftHtml).toBe("<h2>A</h2>\n<p>B</p>");
    expect(result.current.draftHtml).not.toBe(result.current.html);
    // ...but it never touched `dirty` — a display-only reformat of the HTML tab is not an edit.
    expect(result.current.dirty).toBe(false);
  });
});

describe("contentDirty (template-preview fix, 2026-08-11)", () => {
  // The bug this field exists to fix: picking a different template correctly marks `dirty` (it IS an
  // unsaved change), but `PagePreview` needs to tell that apart from an actual content edit so it can
  // still show a real templated render instead of falling back to the raw, unstyled body — see
  // `ADS-memory/reports/implementation/2026-08-11-template-preview-render-bug.md`.
  it("stays false when only templateChoice changes, even though dirty goes true", async () => {
    const { result } = await mountLoaded("landing", HTML_PAGE);
    expect(result.current.dirty).toBe(false);
    expect(result.current.contentDirty).toBe(false);

    act(() => {
      result.current.setTemplateChoice("blog-post.html");
    });

    expect(result.current.dirty).toBe(true);
    expect(result.current.contentDirty).toBe(false);
  });

  it("goes true when the title changes, same as dirty", async () => {
    const { result } = await mountLoaded("landing", HTML_PAGE);

    act(() => {
      result.current.setTitle("Landing (renamed)");
    });

    expect(result.current.dirty).toBe(true);
    expect(result.current.contentDirty).toBe(true);
  });

  it("goes true when the html body changes on an html-format Page", async () => {
    const { result } = await mountLoaded("landing", HTML_PAGE);

    act(() => {
      result.current.setHtml("<p>hello, edited</p>");
    });

    expect(result.current.dirty).toBe(true);
    expect(result.current.contentDirty).toBe(true);
  });

  it("stays false when both templateChoice and html change on a doc-format Page (html isn't real content there)", async () => {
    const { result } = await mountLoaded("privacy-policy", DOC_PAGE);

    act(() => {
      result.current.setTemplateChoice("blog-post.html");
      result.current.setHtml("typed into a field that can't be saved");
    });

    expect(result.current.dirty).toBe(true);
    expect(result.current.contentDirty).toBe(false);
  });
});

/**
 * `useWiredX` dependency-injection conversion — `usePageEditor` driven directly against
 * `createFakePageEditorPort`, a fake `navigate`, and a fake `t`, with NO `fetch` stub and no
 * `useAdminLocale()` race to absorb (`locale` is passed straight in). Mirrors
 * `use-redirects.hooks.unit.test.tsx`'s injected-port block, the reference this conversion follows.
 */
describe("injected port — usePageEditor with no fetch stub", () => {
  function fakeDeps(overrides: { page: unknown; activeThemeTemplates?: string[] }) {
    const port = createFakePageEditorPort({
      page: overrides.page as Parameters<typeof createFakePageEditorPort>[0]["page"],
      activeThemeTemplates: overrides.activeThemeTemplates,
    });
    const navigate = vi.fn();
    const t = (locale: string, key: string) => `${locale}:${key}`;
    // Seeded empty, so every token fetch rejects and `canvasStyling` settles on "no styling" —
    // the point of this block is that NOTHING here touches `fetch`, and an unseeded fake port is
    // still a port.
    const themeCanvasPort = createFakeThemeCanvasPort();
    return { port, themeCanvasPort, navigate, t, locale: "en" };
  }

  it("loads the seeded page with zero fetch calls", async () => {
    const deps = fakeDeps({ page: HTML_PAGE, activeThemeTemplates: ["blog-post.html"] });
    const { result } = renderHook(() => usePageEditor("landing", deps));

    await waitFor(() => expect(result.current.page).not.toBeNull());
    expect(result.current.title).toBe(HTML_PAGE.title);
    expect(result.current.availableTemplates).toEqual(["blog-post.html"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("save() writes through the injected port, not lib/api", async () => {
    const deps = fakeDeps({ page: HTML_PAGE });
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());

    act(() => {
      result.current.setTitle("Landing (via fake port)");
      result.current.setHtml("<p>edited</p>");
    });
    await act(async () => {
      await result.current.save();
    });

    expect(deps.port.updatePageHtmlCalls).toEqual(["<p>edited</p>"]);
    expect(deps.port.updatePostCalls).toEqual([
      expect.objectContaining({ title: "Landing (via fake port)" }),
    ]);
    expect(result.current.message).toBe("en:Saved");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("remove() calls port.deletePage then the injected navigate", async () => {
    const deps = fakeDeps({ page: HTML_PAGE });
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());

    await act(async () => {
      await result.current.remove();
    });

    expect(deps.port.deleteCalled).toBe(true);
    expect(deps.navigate).toHaveBeenCalledWith("/pages");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a save failure surfaces the injected t()'s message and never calls navigate", async () => {
    const deps = fakeDeps({ page: HTML_PAGE });
    deps.port.updatePageHtml = async () => {
      throw new Error("boom");
    };
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());

    act(() => {
      result.current.setHtml("<p>will fail</p>");
    });
    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error).toBe("boom");
    expect(deps.navigate).not.toHaveBeenCalled();
  });
});

/**
 * `save()`'s stale-settlement guard (2026-09-05 sweep) — `saving` (state) already disables both the
 * Save and Publish buttons, but that alone cannot stop a slower call from applying its own stale
 * response after a faster, more-recent call already settled: whichever `port.updatePost()` resolved
 * LAST used to win, regardless of which one was issued last. Reproduced here by holding the first
 * `save()` call's write open past the second's completion — the exact "last-to-settle beats
 * last-clicked" shape `use-post-editor.hooks.ts`'s own `saveGenerationRef` fix (commit `42c6a534`)
 * regression-tests, mirrored onto this hook's own `save(nextStatus?)` signature.
 */
describe("save() stale-settlement guard (2026-09-05 sweep)", () => {
  it("a slower Save settling after a faster Publish must not revert the just-published status", async () => {
    const page = { ...DOC_PAGE, status: "draft" as const };
    const port = createFakePageEditorPort({ page });
    let resolveSlowSave!: (value: { post: typeof page }) => void;
    const slowSave = new Promise<{ post: typeof page }>((resolve) => {
      resolveSlowSave = resolve;
    });
    const realUpdatePost = port.updatePost.bind(port);
    let callCount = 0;
    port.updatePost = (async (target, patch) => {
      callCount += 1;
      // The FIRST call (plain "Save", captured before Publish is clicked) is held open — it must not
      // settle until after the second call ("Publish") already has, so its own eventual response is
      // demonstrably stale by the time it arrives.
      if (callCount === 1) return slowSave;
      return realUpdatePost(target, patch);
    }) as typeof port.updatePost;

    const deps = {
      port,
      themeCanvasPort: createFakeThemeCanvasPort(),
      navigate: vi.fn(),
      t: (_locale: string, key: string) => key,
      locale: "en",
    };
    const { result } = renderHook(() => usePageEditor("privacy-policy", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());
    expect(result.current.status).toBe("draft");

    // Click "Save" (no status override) — this is the call whose write we hold open above.
    let saveDone!: Promise<void>;
    act(() => {
      saveDone = result.current.save();
    });

    // Click "Publish" while the Save above is still in flight — this one resolves immediately.
    await act(async () => {
      await result.current.save("published");
    });
    expect(result.current.status).toBe("published");

    // NOW let the slow Save settle, echoing the OLD (pre-Publish) status it was sent with — its
    // response must be discarded as stale rather than reverting the status Publish already set.
    await act(async () => {
      resolveSlowSave({ post: { ...page, status: "draft" } });
      await saveDone;
    });

    expect(result.current.status).toBe("published");
    expect(result.current.saving).toBe(false);
  });
});

/**
 * `canvasStyling`'s page-shell fallback (the Interactive-tab bug, 2026-09-02) —
 * `/admin/pages/passeios-noroeste-do-pacifico` (kind:page, bodyFormat:html, templateChoice:NULL, the
 * state every Page starts in) rendered the Interactive canvas full-bleed with no container, while
 * Preview rendered it correctly through the active theme's own `page-shell.html` (the same fallback
 * `resolveStaticTierPageShellFallback` in `apps/website/src/features/theme/static-render.ts` applies
 * on the real render path — see `resolveCanvasTemplateChoice`'s own doc, `use-theme-canvas-styling.
 * hooks.ts`, for the browser-side twin). This exercises the whole wiring through `usePageEditor`
 * itself, not just the pure resolver, so it proves the ACTUAL hook the Interactive tab mounts produces
 * the wrapper — not just that the helper function returns the right filename in isolation.
 */
describe("canvasStyling (Interactive-tab page-shell fallback, 2026-09-02)", () => {
  const DARK_TOKENS = { "--bg": "oklch(9% 0.004 250)", "--fg": "oklch(96% 0.003 250)" };
  // `basic`'s real `page-shell.html` wraps `{"type":"content"}` in `<main><article class="wrap">` —
  // shape only, not copied verbatim from the theme, matching how `theme-canvas-wrapper.unit.test.ts`
  // fixtures its own markup.
  const PAGE_SHELL_MARKUP = `<body>
    <main>
      <article class="wrap" data-reveal>
        <div data-embed-config='{"type":"content"}'></div>
      </article>
    </main>
  </body>`;
  const EXPECTED_WRAPPER = [
    { tagName: "main", attributes: {} },
    { tagName: "article", attributes: { class: "wrap", "data-reveal": "" } },
    { tagName: "div", attributes: {} },
  ];

  it("derives the page-shell content wrapper for an untemplated (null) html Page", async () => {
    const port = createFakePageEditorPort({ page: HTML_PAGE, activeThemeId: "basic" });
    const themeCanvasPort = createFakeThemeCanvasPort({
      tokensByUrl: { "/theme-assets/basic/tokens.json": DARK_TOKENS },
      templatesByUrl: { "/theme-assets/basic/pages/page-shell.html": PAGE_SHELL_MARKUP },
    });
    const deps = { port, themeCanvasPort, navigate: vi.fn(), t: (l: string, k: string) => `${l}:${k}`, locale: "en" };

    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());
    expect(result.current.templateChoice).toBeNull(); // confirms this is the "never chosen" state, not a seeded choice

    await waitFor(() => expect(result.current.canvasStyling.status).toBe("ready"));
    expect(
      result.current.canvasStyling.status === "ready" ? result.current.canvasStyling.styling.contentWrapper : undefined
    ).toEqual(EXPECTED_WRAPPER);
  });

  it("still degrades to no wrapper when the theme ships no page-shell.html (pre-existing no-op preserved)", async () => {
    const port = createFakePageEditorPort({ page: HTML_PAGE, activeThemeId: "basic" });
    // No `templatesByUrl` entry at all — `fetchTemplateMarkup` rejects, same as a real 404.
    const themeCanvasPort = createFakeThemeCanvasPort({
      tokensByUrl: { "/theme-assets/basic/tokens.json": DARK_TOKENS },
    });
    const deps = { port, themeCanvasPort, navigate: vi.fn(), t: (l: string, k: string) => `${l}:${k}`, locale: "en" };

    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());

    await waitFor(() => expect(result.current.canvasStyling.status).toBe("ready"));
    expect(
      result.current.canvasStyling.status === "ready" ? result.current.canvasStyling.styling.contentWrapper : "unset"
    ).toBeUndefined();
  });

  it("does not fall back for a doc-format Page, even when the theme ships a page-shell.html", async () => {
    const port = createFakePageEditorPort({ page: DOC_PAGE, activeThemeId: "basic" });
    const themeCanvasPort = createFakeThemeCanvasPort({
      tokensByUrl: { "/theme-assets/basic/tokens.json": DARK_TOKENS },
      templatesByUrl: { "/theme-assets/basic/pages/page-shell.html": PAGE_SHELL_MARKUP },
    });
    const deps = { port, themeCanvasPort, navigate: vi.fn(), t: (l: string, k: string) => `${l}:${k}`, locale: "en" };

    const { result } = renderHook(() => usePageEditor("privacy-policy", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());

    await waitFor(() => expect(result.current.canvasStyling.status).toBe("ready"));
    expect(
      result.current.canvasStyling.status === "ready" ? result.current.canvasStyling.styling.contentWrapper : "unset"
    ).toBeUndefined();
  });

  it("an explicit templateChoice still wins over the page-shell fallback", async () => {
    const port = createFakePageEditorPort({
      page: HTML_PAGE,
      activeThemeId: "basic",
      activeThemeTemplates: ["blog-post.html"],
    });
    const BLOG_POST_MARKUP = `<body><section class="post"><div data-embed-config='{"type":"content"}'></div></section></body>`;
    const themeCanvasPort = createFakeThemeCanvasPort({
      tokensByUrl: { "/theme-assets/basic/tokens.json": DARK_TOKENS },
      templatesByUrl: {
        "/theme-assets/basic/pages/page-shell.html": PAGE_SHELL_MARKUP,
        "/theme-assets/basic/pages/blog-post.html": BLOG_POST_MARKUP,
      },
    });
    const deps = { port, themeCanvasPort, navigate: vi.fn(), t: (l: string, k: string) => `${l}:${k}`, locale: "en" };

    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());
    act(() => {
      result.current.setTemplateChoice("blog-post.html");
    });

    await waitFor(() =>
      expect(
        result.current.canvasStyling.status === "ready" ? result.current.canvasStyling.styling.contentWrapper : undefined
      ).toEqual([{ tagName: "section", attributes: { class: "post" } }, { tagName: "div", attributes: {} }])
    );
  });
});

/**
 * `frameRef`/`paneWidth` — regression coverage for a real bug found by live measurement in Chrome
 * (`http://localhost:5173/admin/pages/contact`, Preview tab): the preview scale was frozen at the
 * `880` pre-measurement default (`.page-preview-scaler`'s `transform: scale(0.6875)` === `880/1280`)
 * instead of the pane's real `1131px` width (`1131/1280` ≈ `0.8836`), leaving a large dead gutter next
 * to every preview.
 *
 * Root cause: the measuring effect used to be `useRef` + a `[view]` dependency array. On an ordinary
 * page load, `page` starts `null` and `PageEditor.tsx` renders only a loading notice — so
 * `PagePreview` (and the frame div `frameRef` attaches to) does not exist on this hook's FIRST render.
 * The `[view]`-keyed effect ran once at that render, found `frameRef.current` still `null`, and
 * bailed — and since `view` never changes across the loading-to-loaded transition, it never got a
 * second chance to attach. Fixed by converting `frameRef` to a callback ref and keying the effect off
 * the node itself, so it fires exactly when React attaches the frame div, however late that is. See
 * `use-page-editor.hooks.ts`'s measuring-effect comment for the full reasoning.
 */
describe("frameRef / paneWidth (preview-scale regression — frame mounts after the first render)", () => {
  /**
   * Minimal `ResizeObserver` stand-in. jsdom implements none at all (`__tests__/setup.ts`'s own
   * comment says so, deliberately unstubbed everywhere else in this app so a test can't pass without
   * the real measurement running) — this is the one test under `features/pages` that actually needs
   * to drive a resize callback, so it stubs `ResizeObserver` locally rather than touching the shared
   * setup file every other suite relies on staying unstubbed.
   */
  class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    readonly observed: Element[] = [];
    constructor(readonly callback: ResizeObserverCallback) {
      FakeResizeObserver.instances.push(this);
    }
    observe(el: Element) {
      this.observed.push(el);
    }
    unobserve() {
      /* not exercised by this test */
    }
    disconnect() {
      /* not exercised by this test */
    }
  }

  beforeEach(() => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });

  it("measures the frame once it mounts, even though it did not exist yet on the hook's first render", async () => {
    // Models the real ordering that hid the bug: `getPage` is deliberately held open so `page` stays
    // `null` past the hook's first render, the same window during which a real page load has nothing
    // for `PagePreview` to render — the frame div `frameRef` would attach to simply doesn't exist yet.
    let resolveGetPage!: () => void;
    const pageLoaded = new Promise<void>((resolve) => {
      resolveGetPage = resolve;
    });
    const port = createFakePageEditorPort({ page: HTML_PAGE });
    const realGetPage = port.getPage;
    port.getPage = async (routeSlug: string) => {
      await pageLoaded;
      return realGetPage(routeSlug);
    };
    const deps = {
      port,
      themeCanvasPort: createFakeThemeCanvasPort(),
      navigate: vi.fn(),
      t: (locale: string, key: string) => `${locale}:${key}`,
      locale: "en",
    };

    const { result } = renderHook(() => usePageEditor("landing", deps));

    // First render: `page` hasn't loaded, so nothing has rendered a frame node for React to attach —
    // `paneWidth` is still the pre-measurement default, and no observer exists yet.
    expect(result.current.page).toBeNull();
    expect(result.current.paneWidth).toBe(880);
    expect(FakeResizeObserver.instances).toHaveLength(0);

    // The load settles. This is exactly the moment the OLD `[view]`-keyed effect would have needed to
    // re-run to have any chance of observing a frame that didn't exist a moment ago — but nothing
    // here changes `view`, so under the old code it never got that chance.
    await act(async () => {
      resolveGetPage();
      await pageLoaded;
    });
    await waitFor(() => expect(result.current.page).not.toBeNull());

    // NOW the frame mounts for the first time. In the real app `PagePreview` renders once `page` is
    // loaded and React calls the ref callback with the live DOM node; simulated directly here (this
    // is a hook-level test with no `PagePreview` rendered around it) by invoking `frameRef` the same
    // way React's own commit phase would.
    const frameEl = document.createElement("div");
    act(() => {
      result.current.frameRef(frameEl);
    });

    expect(FakeResizeObserver.instances).toHaveLength(1);
    expect(FakeResizeObserver.instances[0].observed).toContain(frameEl);

    // The observer reports the frame's real measured width — 1131 is the live-measured value from
    // the original bug report (`.page-preview-frame`'s real width on `/admin/pages/contact`), not a
    // round number chosen to look right.
    act(() => {
      FakeResizeObserver.instances[0].callback(
        [{ contentRect: { width: 1131 } } as ResizeObserverEntry],
        FakeResizeObserver.instances[0] as unknown as ResizeObserver
      );
    });

    expect(result.current.paneWidth).toBe(1131);
  });
});
