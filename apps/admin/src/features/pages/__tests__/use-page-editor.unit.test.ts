import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWiredPageEditor, usePageEditor, type PageEditorController } from "../hooks/use-page-editor.hooks";
import { createFakePageEditorPort } from "../hooks/page-editor-dependencies.hooks";
import { createFakeThemeCanvasPort } from "../hooks/theme-canvas-dependencies.hooks";
import { publishContentRefresh, resetContentRefreshBus } from "@/lib/content-refresh-bus";
import { readStandingDraftLocalBackup } from "@/lib/standing-draft-local-backup";
import { PAGES_RESOURCE } from "../rules";

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
  // A REFUSED autosave mirrors the operator's text into `localStorage`
  // (`lib/standing-draft-local-backup.ts`), and jsdom keeps one storage for the whole file — so
  // without this, one test's refused draft becomes the NEXT test's mount-time `recoverableDraft`
  // for the same page id. Refusals are reachable from any test here now that
  // `createFakePageEditorPort` models the server's real version guard.
  localStorage.clear();
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
  // Standing-draft autosave's own mount-time recovery check (`useStandingDraftAutosave`'s
  // `getAutosave` call) only fires once `page` is set — i.e. strictly after the three racing loads
  // above settle — so it consumes this 4th queued response, never one of the three. Queued as a real
  // `{autosave: null}` shape (not the shape-tolerant merged `body` above) so a test that doesn't
  // care about autosave still gets a clean, valid response instead of `undefined`.
  fetchMock.mockResolvedValueOnce(jsonResponse({ autosave: null }));
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

    // Method-filtered, not just a URL substring: `/posts/pg-doc` now also matches the standing-draft
    // autosave GET (mount-time recovery check) and DELETE (fired after this save succeeds) — only
    // the metadata write itself is a PUT.
    const [, init] = fetchMock.mock.calls.find(
      (call) => String(call[0]).includes("/posts/pg-doc") && (call[1] as RequestInit | undefined)?.method === "PUT"
    ) as [string, RequestInit];
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

describe("save() on an html-format Page", () => {
  /**
   * ORDER REVERSED 2026-09-07 (audit claim #1), and this assertion reversed with it. It used to
   * read "still calls the HTML writer BEFORE the metadata write", pinning an ordering chosen so a
   * slug-conflict failure would leave the body already safe.
   *
   * That ordering is what made a concurrency guard impossible. `PUT /pages/:id/html` reads the row
   * and writes it back inside one request and bumps `version` on the way through, so writing it
   * first both clobbered a concurrent editor's body and invalidated the basis the metadata write
   * was about to claim. Only `updatePost` accepts a client-supplied `expectedVersion`, so it has to
   * go first for its 409 to mean anything — see `writePage`'s own doc in `use-page-editor.hooks.ts`
   * and the `save() guards against a concurrent save` block at the end of this file.
   */
  it("calls the metadata writer before the HTML writer, so the version guard runs first", async () => {
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
    // Method-filtered, not just a URL substring: `/posts/pg-html` now also matches the standing-
    // draft autosave GET (mount-time recovery check) and DELETE (fired after this save succeeds) —
    // only the metadata write itself is a PUT, and it is the one this assertion cares about.
    const metaIndex = fetchMock.mock.calls.findIndex(
      (call) => String(call[0]).includes("/posts/pg-html") && (call[1] as RequestInit | undefined)?.method === "PUT"
    );
    expect(metaIndex).toBeGreaterThanOrEqual(0);
    expect(htmlIndex).toBeGreaterThan(metaIndex);
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

  // Characterization (complexity-ceiling pass): the per-render values `usePageEditor` derives from
  // `page` directly, pinned on both sides of the load so moving them into pure helpers cannot drift.
  it("before the page loads, previewFormTarget and templatePreviewUrl are both empty", () => {
    const deps = fakeDeps({ page: HTML_PAGE });
    deps.port.getPage = () => new Promise(() => {});
    const { result } = renderHook(() => usePageEditor("landing", deps));

    expect(result.current.page).toBeNull();
    expect(result.current.previewFormTarget).toBe("");
    expect(result.current.templatePreviewUrl).toBe("");
  });

  it("once the page loads, previewFormTarget names that page's id", async () => {
    const deps = fakeDeps({ page: HTML_PAGE });
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());

    expect(result.current.previewFormTarget).toBe("page-preview-pending-pg-html");
  });

  it("before the page loads, confirmLeave never prompts, even with an edited working copy (no baseline yet)", () => {
    const deps = fakeDeps({ page: HTML_PAGE });
    deps.port.getPage = () => new Promise(() => {});
    const { result } = renderHook(() => usePageEditor("landing", deps));
    act(() => result.current.setTitle("typed before load"));

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      expect(result.current.confirmLeave()).toBe(true);
      expect(confirmSpy).not.toHaveBeenCalled();
    } finally {
      confirmSpy.mockRestore();
    }
  });
});

/**
 * Standing-draft autosave (2026-09-06) + the unsaved-work guard added alongside it — this screen
 * had NEITHER before this dispatch (audit finding: `use-dirty-guard.hooks.ts`'s own file header).
 * Debounce/ordering mechanics themselves are proven once, generically, in
 * `use-standing-draft-autosave.unit.test.ts`; these tests prove WIRING — that `usePageEditor` feeds
 * the hook the right shape and reacts to it correctly — via the injected fake port, no `fetch` stub.
 */
describe("standing-draft autosave + unsaved-work guard, wired into usePageEditor", () => {
  function fakeDepsWithAutosave(overrides: {
    page: unknown;
    autosave?: Parameters<typeof createFakePageEditorPort>[0]["autosave"];
  }) {
    const port = createFakePageEditorPort({
      page: overrides.page as Parameters<typeof createFakePageEditorPort>[0]["page"],
      autosave: overrides.autosave,
    });
    const navigate = vi.fn();
    const t = (locale: string, key: string) => `${locale}:${key}`;
    const themeCanvasPort = createFakeThemeCanvasPort();
    return { port, themeCanvasPort, navigate, t, locale: "en" };
  }

  it("a seeded standing draft is exposed as recoverableDraft on load, and never silently applied to the working copy", async () => {
    const seeded = {
      bodyFormat: "html" as const,
      bodyHtml: "<p>recovered</p>",
      title: "Recovered title",
      slug: "landing",
      baseVersion: HTML_PAGE.version,
      savedAt: "2026-09-06T00:00:00.000Z",
      savedByPrincipalId: "user-local",
    };
    const deps = fakeDepsWithAutosave({ page: HTML_PAGE, autosave: seeded });
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());
    await waitFor(() => expect(result.current.recoverableDraft).not.toBeNull());

    expect(result.current.recoverableDraft).toEqual(seeded);
    // The banner is offered, not applied — the loaded page's own title/html are still what's shown.
    expect(result.current.title).toBe(HTML_PAGE.title);
    expect(result.current.html).toBe(HTML_PAGE.bodyHtml);
  });

  it("restoreRecoveredDraft applies the draft into the working copy and dismisses the banner, without telling the server", async () => {
    const seeded = {
      bodyFormat: "html" as const,
      bodyHtml: "<p>recovered</p>",
      title: "Recovered title",
      slug: "recovered-slug",
      baseVersion: HTML_PAGE.version,
      savedAt: "2026-09-06T00:00:00.000Z",
      savedByPrincipalId: "user-local",
    };
    const deps = fakeDepsWithAutosave({ page: HTML_PAGE, autosave: seeded });
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.recoverableDraft).not.toBeNull());

    act(() => result.current.restoreRecoveredDraft());

    expect(result.current.title).toBe("Recovered title");
    expect(result.current.slug).toBe("recovered-slug");
    expect(result.current.html).toBe("<p>recovered</p>");
    expect(result.current.recoverableDraft).toBeNull();
    expect(deps.port.discardAutosaveCalled).toBe(false);
  });

  it("discardRecoveredDraft clears the standing draft server-side and dismisses the banner", async () => {
    const seeded = {
      bodyFormat: "html" as const,
      bodyHtml: "<p>recovered</p>",
      title: "Recovered title",
      slug: "landing",
      baseVersion: HTML_PAGE.version,
      savedAt: "2026-09-06T00:00:00.000Z",
      savedByPrincipalId: "user-local",
    };
    const deps = fakeDepsWithAutosave({ page: HTML_PAGE, autosave: seeded });
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.recoverableDraft).not.toBeNull());

    await act(async () => result.current.discardRecoveredDraft());

    expect(deps.port.discardAutosaveCalled).toBe(true);
    expect(result.current.recoverableDraft).toBeNull();
    // Discarding must not silently apply the draft it just threw away.
    expect(result.current.title).toBe(HTML_PAGE.title);
  });

  it("editing schedules a debounced autosave PUT matching buildPageAutosaveDraft's own shape", async () => {
    vi.useFakeTimers();
    try {
      const deps = fakeDepsWithAutosave({ page: HTML_PAGE });
      const { result } = renderHook(() => usePageEditor("landing", deps));
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(result.current.page).not.toBeNull();

      act(() => result.current.setTitle("Edited via autosave"));
      await act(async () => vi.advanceTimersByTimeAsync(3001));

      expect(deps.port.putAutosaveCalls).toEqual([
        {
          bodyFormat: "html",
          bodyHtml: HTML_PAGE.bodyHtml,
          title: "Edited via autosave",
          slug: HTML_PAGE.slug,
          baseVersion: HTML_PAGE.version,
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a successful save clears the standing draft, even when nothing was ever recovered", async () => {
    const deps = fakeDepsWithAutosave({ page: HTML_PAGE });
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());

    act(() => result.current.setTitle("Saved for real"));
    await act(async () => {
      await result.current.save();
    });

    expect(deps.port.discardAutosaveCalled).toBe(true);
  });

  /**
   * The save-vs-in-flight-autosave race, asserted at the COMPOSED level rather than only on the
   * shared hook — the Pages half of the same pair `use-post-editor.hooks.unit.test.tsx` covers for
   * Posts. `discardAutosaveCalled` alone (the assertion directly above) would still be `true` under
   * an implementation where the discard raced the in-flight PUT and lost, leaving a stale crumb the
   * next editor load would offer back over content the save already superseded. This asserts the
   * observable SEQUENCE the port actually saw.
   */
  it("a Save issued while an autosave PUT is still in flight leaves the DISCARD as the last write the server sees", async () => {
    const ops: string[] = [];
    let releasePut!: () => void;
    const deps = fakeDepsWithAutosave({ page: HTML_PAGE });
    const base = deps.port;
    const port: typeof base = {
      ...base,
      get putAutosaveCalls() {
        return base.putAutosaveCalls;
      },
      get discardAutosaveCalled() {
        return base.discardAutosaveCalled;
      },
      async putAutosave(id, draft) {
        ops.push("put:start");
        await new Promise<void>((resolve) => {
          releasePut = resolve;
        });
        ops.push("put:end");
        return base.putAutosave(id, draft);
      },
      async discardAutosave(id) {
        ops.push("discard");
        return base.discardAutosave(id);
      },
    };

    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => usePageEditor("landing", { ...deps, port }));
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(result.current.page).not.toBeNull();

      act(() => result.current.setTitle("Typed then saved fast"));
      await act(async () => vi.advanceTimersByTimeAsync(3001));
      expect(ops).toEqual(["put:start"]);

      let saveSettled = false;
      act(() => {
        void result.current.save().then(() => {
          saveSettled = true;
        });
      });
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(ops).toEqual(["put:start"]);

      releasePut();
      await act(async () => vi.advanceTimersByTimeAsync(0));
      await act(async () => vi.advanceTimersByTimeAsync(3001));

      expect(saveSettled).toBe(true);
      expect(ops).toEqual(["put:start", "put:end", "discard"]);
      expect(ops[ops.length - 1]).toBe("discard");
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * The "reload the page on accident or exit out of the page" case in the owner's own words, at the
   * composed level. Proven broken in a real browser on 2026-09-06 against THIS editor: typed into
   * the HTML pane, clicked the in-app "Pages" link one second later, and no PUT was ever issued.
   */
  it("navigating away mid-edit parks the pending draft instead of dropping it", async () => {
    vi.useFakeTimers();
    try {
      const deps = fakeDepsWithAutosave({ page: HTML_PAGE });
      const { result, unmount } = renderHook(() => usePageEditor("landing", deps));
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(result.current.page).not.toBeNull();

      act(() => result.current.setHtml("<p>half-typed, then left the screen</p>"));
      // Well inside the 3s idle window — the debounce has provably not fired yet.
      await act(async () => vi.advanceTimersByTimeAsync(500));
      expect(deps.port.putAutosaveCalls).toHaveLength(0);

      unmount();
      await act(async () => vi.advanceTimersByTimeAsync(0));

      expect(deps.port.putAutosaveCalls).toHaveLength(1);
      expect(deps.port.putAutosaveCalls[0]).toMatchObject({
        bodyFormat: "html",
        bodyHtml: "<p>half-typed, then left the screen</p>",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * STALE BASIS (2026-09-06) — the Pages half of the two-tab case
   * `use-post-editor.hooks.unit.test.tsx` covers for Posts, and the reason this hook has to consume
   * `staleBasis` at all: both editors share `useStandingDraftAutosave`, so a fix landing in only one
   * of them leaves the other silently dropping an operator's work.
   *
   * `simulateConcurrentSave` moves the stored row under this editor exactly as another operator's
   * save would, so the tick is refused by the fake's own version guard rather than a stubbed answer.
   * Asserting only that `putAutosave` was called would pass under the silent bug; asserting only the
   * notice without the text would pass under a "fix" that reported the conflict by discarding the
   * work.
   */
  it("a refused autosave surfaces autosaveStaleBasis carrying the refused text, and leaves the working copy untouched", async () => {
    vi.useFakeTimers();
    try {
      const deps = fakeDepsWithAutosave({ page: HTML_PAGE });
      const { result } = renderHook(() => usePageEditor("landing", deps));
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(result.current.page).not.toBeNull();
      expect(result.current.autosaveStaleBasis).toBeNull();

      // Another operator saves. This editor is not told, and still believes it is on HTML_PAGE.version.
      deps.port.simulateConcurrentSave();

      act(() => result.current.setHtml("<p>typed while the other tab was saving</p>"));
      await act(async () => vi.advanceTimersByTimeAsync(3001));

      expect(deps.port.putAutosaveCalls).toHaveLength(1);
      expect(result.current.autosaveStaleBasis).toEqual({
        baseVersion: HTML_PAGE.version,
        draft: expect.objectContaining({
          bodyHtml: "<p>typed while the other tab was saving</p>",
          baseVersion: HTML_PAGE.version,
        }),
      });
      // The single most important property of this whole path.
      expect(result.current.html).toBe("<p>typed while the other tab was saving</p>");
    } finally {
      vi.useRealTimers();
    }
  });

  /** The notice must not linger once autosaving actually works again — an operator staring at a
   *  false "autosaving has paused" would stop trusting the true one. A save that lands re-bases this
   *  editor onto the row the server hands back, and the next tick is accepted on that basis.
   *
   *  It goes through `saveOverwritingConflict` rather than a plain `save()` as of 2026-09-07: this
   *  editor is stale by construction here, so a plain Save is now REFUSED (`saveConflict`) instead
   *  of silently overwriting — which is the whole point of audit claim #1's fix. The explicit
   *  overwrite is the path that still lands, and re-basing is the property this test owns. */
  it("autosaveStaleBasis clears once a write is accepted again, rather than sticking for the session", async () => {
    vi.useFakeTimers();
    try {
      const deps = fakeDepsWithAutosave({ page: HTML_PAGE });
      const { result } = renderHook(() => usePageEditor("landing", deps));
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(result.current.page).not.toBeNull();

      deps.port.simulateConcurrentSave();
      act(() => result.current.setHtml("<p>typed while the other tab was saving</p>"));
      await act(async () => vi.advanceTimersByTimeAsync(3001));
      expect(result.current.autosaveStaleBasis).not.toBeNull();

      await act(async () => {
        await result.current.save();
      });
      // The plain Save was refused, exactly as intended — nothing was written over the other
      // operator's row, and the operator is told so rather than left believing it saved.
      expect(result.current.saveConflict).not.toBeNull();

      await act(async () => {
        await result.current.saveOverwritingConflict();
      });
      act(() => result.current.setHtml("<p>typed again, now on the current version</p>"));
      await act(async () => vi.advanceTimersByTimeAsync(3001));

      expect(result.current.autosaveStaleBasis).toBeNull();
      expect(result.current.html).toBe("<p>typed again, now on the current version</p>");
    } finally {
      vi.useRealTimers();
    }
  });

  it("confirmLeave is true when nothing is dirty, and defers to window.confirm once the operator has edited something", async () => {
    const deps = fakeDepsWithAutosave({ page: HTML_PAGE });
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());

    expect(result.current.confirmLeave()).toBe(true);

    act(() => result.current.setTitle("Now dirty"));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      expect(result.current.confirmLeave()).toBe(false);
      expect(confirmSpy).toHaveBeenCalledTimes(1);
    } finally {
      confirmSpy.mockRestore();
    }
  });
});

/**
 * `save()`'s stale-settlement guard (2026-09-05 sweep) — `saving` (state) already disables both the
 * Save and Publish buttons, but that alone cannot stop a slower call from applying its own stale
 * response after a faster, more-recent call already settled: whichever `port.updatePost()` resolved
 * LAST used to win, regardless of which one was issued last. Reproduced here by holding the first
 * `save()` call's write open past the second's completion — the exact "last-to-settle beats
 * last-clicked" shape `use-post-editor.hooks.ts`'s own `settlement` fix (commit `42c6a534`)
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

/**
 * A page created by `New Page` (`use-pages.hooks.ts`'s `createPage` -> `POST .../pages` ->
 * `createPost`) is born `bodyFormat: "doc"` with `DEFAULT_BODY_JSON` (`{type:"doc",content:[]}`) as
 * its body — `createPost` forces `resolveBodyFields()`'s `("doc", null)` by construction and
 * `CreatePostInput` has no `bodyFormat` field to override it (`features/post/post.ts`, ADR-056
 * CIC-3). The Pages editor offers that page an HTML textarea and a GrapesJS canvas regardless of
 * format (`PageEditor.tsx`'s main pane is gated on `view`, never on `bodyFormat`), so an operator
 * can type real markup into a brand-new page — and until this suite landed, `buildPageSavePlan`'s
 * `canSaveHtml = page.bodyFormat === "html"` silently threw all of it away on Save, which is why two
 * agents had to bypass the editor and PUT `/pages/:id/html` by hand.
 *
 * The F01 guard the block at the top of this file pins is NOT relaxed by this: the danger there is
 * `updatePageHtml`'s conversion dropping a REAL Tiptap `body_json`, and the new rule fires only for
 * a doc-format page whose document is empty AND into which the operator actually authored non-empty
 * HTML. `DOC_PAGE` above carries a real paragraph, so it stays on the old path.
 */
describe("HTML authoring into a newly created (doc-format, empty-document) Page", () => {
  /** Exactly what `createPost` produces for `New Page` — `DEFAULT_BODY_JSON`, doc format, draft. */
  const NEW_PAGE = {
    id: "pg-new",
    workspaceId: "workspace-local",
    kind: "page" as const,
    title: "Untitled",
    slug: "untitled",
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc" as const,
    bodyHtml: null,
    status: "draft" as const,
    updatedAt: "2026-09-06T00:00:00.000Z",
    version: 1,
  };

  function depsFor(page: unknown) {
    const port = createFakePageEditorPort({
      page: page as Parameters<typeof createFakePageEditorPort>[0]["page"],
    });
    return { port, themeCanvasPort: createFakeThemeCanvasPort(), navigate: vi.fn(), t: (l: string, k: string) => `${l}:${k}`, locale: "en" };
  }

  async function mount(page: unknown) {
    const deps = depsFor(page);
    const view = renderHook(() => usePageEditor("untitled", deps));
    await waitFor(() => expect(view.result.current.page).not.toBeNull());
    return { deps, result: view.result };
  }

  it("sends the authored HTML to updatePageHtml on Save", async () => {
    const { deps, result } = await mount(NEW_PAGE);
    expect(result.current.html).toBe("");

    act(() => {
      result.current.setHtml("<h1>Hand-authored</h1>");
    });
    await act(async () => {
      await result.current.save();
    });

    expect(deps.port.updatePageHtmlCalls).toEqual(["<h1>Hand-authored</h1>"]);
    // The body reached the row, not just the writer — the fake stores what it was handed.
    expect(deps.port.current.bodyHtml).toBe("<h1>Hand-authored</h1>");
    // `updatePageHtml` converts the row to html format before `updatePost` runs, so the server's
    // `existing.bodyFormat !== "html" && !isJsonObject(input.bodyJson)` check no longer applies and
    // the round-tripped placeholder must NOT be sent (see `buildPageSavePlan`'s own doc).
    expect(deps.port.updatePostCalls).toHaveLength(1);
    expect(deps.port.updatePostCalls[0]).not.toHaveProperty("bodyJson");
    // Not the "this page's body uses the document editor and can't be edited here yet" apology.
    expect(result.current.message).toBe("en:Saved");
  });

  it("sends the authored HTML on Publish too, and publishes in the same action", async () => {
    const { deps, result } = await mount(NEW_PAGE);

    act(() => {
      result.current.setHtml("<section>Launch</section>");
    });
    await act(async () => {
      await result.current.save("published");
    });

    expect(deps.port.updatePageHtmlCalls).toEqual(["<section>Launch</section>"]);
    expect(deps.port.updatePostCalls[0]).toMatchObject({ status: "published" });
  });

  it("marks the editor dirty as soon as HTML is typed, so the Save dot and the leave guard both see it", async () => {
    const { result } = await mount(NEW_PAGE);
    expect(result.current.dirty).toBe(false);
    expect(result.current.contentDirty).toBe(false);

    act(() => {
      result.current.setHtml("<p>typed</p>");
    });

    expect(result.current.contentDirty).toBe(true);
    expect(result.current.dirty).toBe(true);
  });

  it("parks an html-format standing draft carrying the typed markup", async () => {
    // Fake timers for the 3s autosave debounce, same harness the autosave block above uses.
    vi.useFakeTimers();
    try {
      const deps = depsFor(NEW_PAGE);
      const { result } = renderHook(() => usePageEditor("untitled", deps));
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(result.current.page).not.toBeNull();

      act(() => result.current.setHtml("<p>typed</p>"));
      await act(async () => vi.advanceTimersByTimeAsync(3001));

      // A `doc`-format draft round-tripping the empty document would lose the typed markup outright,
      // and `restoreRecoveredDraft` only reads `bodyHtml` off an `html`-format draft — so a
      // navigate-away inside the debounce window would give back nothing the banner promised.
      expect(deps.port.putAutosaveCalls).toEqual([
        {
          bodyFormat: "html",
          bodyHtml: "<p>typed</p>",
          title: NEW_PAGE.title,
          slug: NEW_PAGE.slug,
          baseVersion: NEW_PAGE.version,
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still writes no HTML when the operator saves a new page without authoring any", async () => {
    const { deps, result } = await mount(NEW_PAGE);

    act(() => {
      result.current.setTitle("Renamed, body untouched");
    });
    await act(async () => {
      await result.current.save();
    });

    // Nothing authored -> no premature conversion, and nothing to blank.
    expect(deps.port.updatePageHtmlCalls).toEqual([]);
    expect(deps.port.updatePostCalls[0]).toMatchObject({ bodyJson: NEW_PAGE.bodyJson });
  });

  it("refuses to convert a doc-format Page that carries a real Tiptap document (the F01 guard)", async () => {
    const { deps, result } = await mount(DOC_PAGE);

    act(() => {
      result.current.setHtml("<p>typed over a real document</p>");
    });
    await act(async () => {
      await result.current.save();
    });

    expect(deps.port.updatePageHtmlCalls).toEqual([]);
    expect(deps.port.updatePostCalls[0]).toMatchObject({ bodyJson: DOC_PAGE.bodyJson });
    // And the operator is told, rather than watching the typed markup vanish silently.
    expect(result.current.message).toBe(
      "en:Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet."
    );
  });
});

/**
 * REGRESSION (2026-09-07 audit claim #1): a Page save must not silently overwrite another
 * operator's save.
 *
 * Before this, `save` issued two unguarded writes — `PUT /pages/:id/html` then `PUT /posts/:id` —
 * with no `expectedVersion` on either. `features/posts` gained that guard on 2026-09-06 and Pages
 * did not, and the body route cannot supply one on its own: `routes/admin/pages/update-html.ts`
 * reads the row and writes it back inside ONE request, so the version its compare-and-set conditions
 * on is one it captured microseconds earlier — never the version this editor loaded. Two editors
 * open on the same page therefore each wrote whatever they had, last one wins, no error either way.
 *
 * The fake port models both halves of the real server (`page-editor-dependencies.hooks.ts`): the
 * body write bumps `version` exactly as `PagesHtmlDocumentStore.write` does, and the metadata write
 * honours `expectedVersion` with the same `409 VERSION_CONFLICT` `ApiError` shape.
 */
describe("save() guards against a concurrent save", () => {
  function conflictDeps(page: unknown) {
    const port = createFakePageEditorPort({ page: page as Parameters<typeof createFakePageEditorPort>[0]["page"] });
    return { port, themeCanvasPort: createFakeThemeCanvasPort(), navigate: vi.fn(), t: (l: string, k: string) => `${l}:${k}`, locale: "en" };
  }

  it("sends the loaded version as the basis of the metadata write", async () => {
    const deps = conflictDeps(HTML_PAGE);
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());

    act(() => result.current.setTitle("Renamed"));
    await act(async () => {
      await result.current.save();
    });

    expect(deps.port.updatePostCalls).toEqual([
      expect.objectContaining({ title: "Renamed", expectedVersion: HTML_PAGE.version }),
    ]);
  });

  it("refuses the whole save — body included — once another operator has saved", async () => {
    const deps = conflictDeps(HTML_PAGE);
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());

    act(() => result.current.setHtml("<p>mine</p>"));
    // Another operator's save lands while this editor sits on the version it loaded.
    deps.port.simulateConcurrentSave();

    await act(async () => {
      await result.current.save();
    });

    // The heart of it: their body survives. Writing the HTML before discovering the conflict is
    // exactly the silent overwrite this guard exists to prevent.
    expect(deps.port.updatePageHtmlCalls).toEqual([]);
    expect(result.current.saveConflict).not.toBeNull();
    expect(result.current.saveConflict?.currentVersion).toBe(HTML_PAGE.version + 1);
    // Not folded into the generic error line — the two need opposite reactions from the operator.
    expect(result.current.error).toBeNull();
    // The operator's own text is untouched and still in front of them.
    expect(result.current.html).toBe("<p>mine</p>");
  });

  it("saveOverwritingConflict() replays the original intent against the fresh version", async () => {
    const deps = conflictDeps(HTML_PAGE);
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());

    act(() => result.current.setHtml("<p>mine</p>"));
    deps.port.simulateConcurrentSave();
    await act(async () => {
      await result.current.save("published");
    });
    expect(result.current.saveConflict?.attemptedStatus).toBe("published");

    await act(async () => {
      await result.current.saveOverwritingConflict();
    });

    expect(result.current.saveConflict).toBeNull();
    expect(deps.port.updatePageHtmlCalls).toEqual(["<p>mine</p>"]);
    // The replay keeps the Publish intent rather than quietly downgrading it to a draft save.
    expect(deps.port.current.status).toBe("published");
  });

  it("dismissSaveConflict() hides the banner without writing anything", async () => {
    const deps = conflictDeps(HTML_PAGE);
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());

    act(() => result.current.setHtml("<p>mine</p>"));
    deps.port.simulateConcurrentSave();
    await act(async () => {
      await result.current.save();
    });

    act(() => result.current.dismissSaveConflict());

    expect(result.current.saveConflict).toBeNull();
    expect(deps.port.updatePageHtmlCalls).toEqual([]);
  });
});

describe("usePageEditor — pending-html preview debounce (2026-09-09)", () => {
  // Same fake-timer discipline `use-post-editor.hooks.unit.test.tsx`'s equivalent block uses:
  // installed only after the editor has mounted, torn down regardless of how the test exits.
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Stands in for the `<form ref={previewFormRef}>` DOM node `PagePreviewFrame` would attach — these
   *  tests drive the hook in isolation with no view rendered. Cast through `unknown` because
   *  `.current` is `readonly` at the `RefObject` type level by design. */
  function attachFakeForm(ref: PageEditorController["previewFormRef"]): { submit: ReturnType<typeof vi.fn<(...args: any[]) => any>> } {
    const fakeForm = { submit: vi.fn() };
    (ref as unknown as { current: typeof fakeForm | null }).current = fakeForm;
    return fakeForm;
  }

  const DRAFT_HTML_PAGE = { ...HTML_PAGE, status: "draft" as const };

  function draftDeps() {
    return {
      port: createFakePageEditorPort({
        page: DRAFT_HTML_PAGE as Parameters<typeof createFakePageEditorPort>[0]["page"],
        activeThemeTemplates: ["pages-default.html", "page-shell.html"],
      }),
      themeCanvasPort: createFakeThemeCanvasPort(),
      navigate: vi.fn(),
      t: (locale: string, key: string) => `${locale}:${key}`,
      locale: "en",
    };
  }

  /**
   * `view` already defaults to `"preview"` (the hook's own `useState`), so unlike the Posts suite
   * there is no "switch to the Preview tab" step that can arm the debounce under fake timers — the
   * mount-time arming happens during `waitFor`, on REAL timers, and is unreachable afterwards.
   * Every test below therefore arms the effect with a dependency change made AFTER the fake clock
   * is installed: a return trip through the HTML tab, or a template pick. Returning through the
   * HTML tab is a faithful vehicle rather than a workaround — it re-evaluates the exact same
   * `active` expression, so a `active` that excluded clean drafts (the pre-widening behavior) would
   * still arm nothing here.
   */
  function returnToPreviewTab(controller: PageEditorController): void {
    // Display-only: the HTML tab reformats a LOCAL `draftHtml` and never calls `setHtml`, so this
    // round trip cannot make the page look content-dirty and fake the arming.
    act(() => controller.setView("html"));
    act(() => controller.setView("preview"));
  }

  it("submits an untouched DRAFT's pending html on returning to Preview — the widened branch that replaced the raw fallback", async () => {
    const deps = draftDeps();
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());
    const form = attachFakeForm(result.current.previewFormRef);

    vi.useFakeTimers();
    // Nothing edited and nothing re-templated: before the widening this state showed the raw
    // unstyled fallback instead, so a clean draft never POSTed anything at all.
    expect(result.current.contentDirty).toBe(false);
    returnToPreviewTab(result.current);

    vi.advanceTimersByTime(499);
    expect(form.submit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(form.submit).toHaveBeenCalledTimes(1);
  });

  it("re-submits when only the TEMPLATE changes, against the newly chosen template's URL", async () => {
    const deps = draftDeps();
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());
    const form = attachFakeForm(result.current.previewFormRef);

    vi.useFakeTimers();
    // The operator picks a different template from the dropdown and touches nothing else — no
    // keystroke, no tab change, no save. `templateChoice` is in the effect's dependency list for
    // exactly this: the preview must re-render through the newly picked template rather than sit on
    // the old one.
    act(() => result.current.setTemplateChoice("page-shell.html"));
    expect(result.current.contentDirty).toBe(false);

    vi.advanceTimersByTime(499);
    expect(form.submit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(form.submit).toHaveBeenCalledTimes(1);
    // Where that submit lands, which the hidden form carries as its `action`: the POST body is the
    // pending html, but the template rides the URL's own query string.
    expect(result.current.templatePreviewUrl).toBe("fake://template-preview/pg-html?templateChoice=page-shell.html");

    // A SECOND pick re-arms again rather than settling on the first — switching templates twice in
    // a row must not leave the operator looking at the template they just navigated away from.
    act(() => result.current.setTemplateChoice("pages-default.html"));
    vi.advanceTimersByTime(500);
    expect(form.submit).toHaveBeenCalledTimes(2);
    expect(result.current.templatePreviewUrl).toBe("fake://template-preview/pg-html?templateChoice=pages-default.html");
  });

  it("cancels the pending submit when the operator leaves Preview before it fires", async () => {
    const deps = draftDeps();
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());
    const form = attachFakeForm(result.current.previewFormRef);

    vi.useFakeTimers();
    act(() => result.current.setTemplateChoice("page-shell.html"));
    vi.advanceTimersByTime(300);
    act(() => result.current.setView("html"));
    vi.advanceTimersByTime(1000);

    expect(form.submit).not.toHaveBeenCalled();
  });

  it("leaves a CLEAN PUBLISHED page alone — that branch shows the real live site, not a POSTed preview", async () => {
    const deps = { ...draftDeps(), port: createFakePageEditorPort({ page: HTML_PAGE as Parameters<typeof createFakePageEditorPort>[0]["page"] }) };
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());
    const form = attachFakeForm(result.current.previewFormRef);

    vi.useFakeTimers();
    returnToPreviewTab(result.current);
    vi.advanceTimersByTime(1000);

    expect(form.submit).not.toHaveBeenCalled();
  });
});

/**
 * `usePageEditor` wired into the REAL `lib/content-refresh-bus` (2026-09-16) — the owner bug fix:
 * an assistant tool (`pages_write_html` / `pages_write_region`) writes this page while the editor is
 * open, and nothing updates until a manual reload. Uses the injected-port `fakeDeps` shape (same
 * convention as "injected port — usePageEditor with no fetch stub" above), driven through the real
 * bus rather than a stub `checkForExternalChange`, since the wiring between `usePageEditor` and the
 * bus is exactly what's under test. `resetContentRefreshBus()` in `afterEach` keeps a publish in one
 * test from leaking a listener into the next.
 */
describe("usePageEditor — content refresh bus (assistant writes while the editor is open)", () => {
  afterEach(() => resetContentRefreshBus());

  function refreshDeps(page: typeof HTML_PAGE = HTML_PAGE) {
    const port = createFakePageEditorPort({ page: page as Parameters<typeof createFakePageEditorPort>[0]["page"] });
    const themeCanvasPort = createFakeThemeCanvasPort();
    return {
      port,
      themeCanvasPort,
      navigate: vi.fn(),
      t: (locale: string, key: string) => `${locale}:${key}`,
      locale: "en",
    };
  }

  it("clean editor: an assistant write replaces the working copy and preview baseline without a reload", async () => {
    const deps = refreshDeps();
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());
    const startingVersion = result.current.page!.version;

    act(() => {
      deps.port.simulateExternalWrite({ bodyHtml: "<p>new hero</p>", title: "Landing v2" });
      publishContentRefresh([PAGES_RESOURCE]);
    });

    await waitFor(() => expect(result.current.html).toBe("<p>new hero</p>"));
    expect(result.current.title).toBe("Landing v2");
    expect(result.current.page!.version).toBe(startingVersion + 1);
    expect(result.current.dirty).toBe(false);
    expect(result.current.pendingExternalVersion).toBeNull();
  });

  it("clean editor: contentRevision moves on an applied refresh and NOT on the editor's own save", async () => {
    const deps = refreshDeps();
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());
    const startingRevision = result.current.contentRevision;

    await act(async () => {
      await result.current.save();
    });
    expect(result.current.contentRevision).toBe(startingRevision);

    act(() => {
      deps.port.simulateExternalWrite({ title: "Landing v2" });
      publishContentRefresh([PAGES_RESOURCE]);
    });
    await waitFor(() => expect(result.current.contentRevision).toBe(startingRevision + 1));
  });

  it("clean editor on the HTML tab: draftHtml shows the new body", async () => {
    const deps = refreshDeps();
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());
    act(() => result.current.setView("html"));

    act(() => {
      deps.port.simulateExternalWrite({ bodyHtml: "<p>new hero</p>" });
      publishContentRefresh([PAGES_RESOURCE]);
    });

    await waitFor(() => expect(result.current.draftHtml).toContain("new hero"));
  });

  it("a refresh that finds no newer version changes nothing", async () => {
    const deps = refreshDeps();
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());
    const startingRevision = result.current.contentRevision;

    await act(async () => {
      publishContentRefresh([PAGES_RESOURCE]);
      // Flushes the fetch's own promise chain (`fetchLatest` chains TWO `.then`s onto
      // `port.getPage`) so the "nothing happened" assertion below observes the settled state,
      // not a check still in flight.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.contentRevision).toBe(startingRevision);
  });

  it("a notification naming only other resources costs no fetch", async () => {
    const deps = refreshDeps();
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());
    const callsAfterLoad = deps.port.getPageCalls;

    await act(async () => {
      publishContentRefresh(["taxonomy"]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(deps.port.getPageCalls).toBe(callsAfterLoad);

    deps.port.simulateExternalWrite({ title: "Landing v2" });
    act(() => publishContentRefresh([PAGES_RESOURCE]));
    await waitFor(() => expect(result.current.title).toBe("Landing v2"));
  });

  // Owner-reported shape, reproduced live 2026-09-16: text typed into the Interactive canvas reaches
  // `html` only when the operator leaves that text element (GrapesJS syncs its inline editor on
  // blur-out, and its `update` event is deferred), so `dirty` read false while typed text sat in the
  // canvas, the refresh applied silently, and the `key={contentRevision}` remount destroyed it.
  it("clean-looking editor on the Interactive tab: a refresh asks instead of remounting the canvas", async () => {
    const deps = refreshDeps();
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());
    act(() => result.current.setView("interactive"));
    expect(result.current.dirty).toBe(false);
    const startingRevision = result.current.contentRevision;

    act(() => {
      deps.port.simulateExternalWrite({ bodyHtml: "<p>new hero</p>" });
      publishContentRefresh([PAGES_RESOURCE]);
    });

    await waitFor(() => expect(result.current.pendingExternalVersion).toBe(deps.port.current.version));
    expect(result.current.contentRevision).toBe(startingRevision);
    expect(result.current.html).toBe(HTML_PAGE.bodyHtml);

    // Load latest is the explicit discard, so it DOES remount the canvas with the new body.
    await act(async () => {
      await result.current.loadExternalChange();
    });
    expect(result.current.html).toBe("<p>new hero</p>");
    expect(result.current.contentRevision).toBe(startingRevision + 1);
    expect(result.current.pendingExternalVersion).toBeNull();
  });

  it("typing that lands while the re-read is in flight is kept: dirty is judged when the fetch settles", async () => {
    const deps = refreshDeps();
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());

    let settle!: (value: { post: typeof deps.port.current }) => void;
    const loaded = deps.port.current;
    deps.port.getPage = () =>
      new Promise((resolve) => {
        settle = resolve;
      });

    act(() => publishContentRefresh([PAGES_RESOURCE]));
    act(() => result.current.setHtml("<p>typed mid-fetch</p>"));
    await act(async () => {
      settle({ post: { ...loaded, bodyHtml: "<p>agent</p>", version: loaded.version + 1 } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.html).toBe("<p>typed mid-fetch</p>");
    expect(result.current.pendingExternalVersion).toBe(loaded.version + 1);
  });

  it("dirty editor: a refresh never touches the working copy and raises pendingExternalVersion", async () => {
    const deps = refreshDeps();
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());

    act(() => result.current.setHtml("<p>mine</p>"));
    expect(result.current.dirty).toBe(true);

    act(() => {
      deps.port.simulateExternalWrite({ title: "Landing v2" });
      publishContentRefresh([PAGES_RESOURCE]);
    });

    await waitFor(() => expect(result.current.pendingExternalVersion).toBe(deps.port.current.version));
    expect(result.current.html).toBe("<p>mine</p>");
    expect(result.current.title).toBe(HTML_PAGE.title);
  });

  it("loadExternalChange replaces the working copy, discards the standing draft, and clears the notice", async () => {
    const deps = refreshDeps();
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());

    act(() => result.current.setHtml("<p>mine</p>"));
    act(() => {
      deps.port.simulateExternalWrite({ bodyHtml: "<p>new hero</p>" });
      publishContentRefresh([PAGES_RESOURCE]);
    });
    await waitFor(() => expect(result.current.pendingExternalVersion).not.toBeNull());

    await act(async () => {
      await result.current.loadExternalChange();
    });

    expect(result.current.html).toBe("<p>new hero</p>");
    expect(result.current.dirty).toBe(false);
    expect(result.current.pendingExternalVersion).toBeNull();
    expect(deps.port.discardAutosaveCalled).toBe(true);
  });

  it("dismissExternalChange keeps edits, stays quiet on the next agent write, and an explicit Save still hits the version conflict", async () => {
    const deps = refreshDeps();
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());

    act(() => result.current.setHtml("<p>mine</p>"));
    act(() => {
      deps.port.simulateExternalWrite({ title: "Landing v2" });
      publishContentRefresh([PAGES_RESOURCE]);
    });
    await waitFor(() => expect(result.current.pendingExternalVersion).not.toBeNull());

    act(() => result.current.dismissExternalChange());
    expect(result.current.pendingExternalVersion).toBeNull();

    // A second agent write on the SAME (dismissed) basis stays quiet. The check's fetch is settled
    // inside `act` before asserting, and the call count proves a check actually ran: waiting on
    // `getPageCalls > 0` passed on its first poll (the mount load already counted), so it only
    // worked because `waitFor`'s own internal awaits happened to let the fetch settle.
    const callsBeforeSecondWrite = deps.port.getPageCalls;
    await act(async () => {
      deps.port.simulateExternalWrite({ title: "Landing v3" });
      publishContentRefresh([PAGES_RESOURCE]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(deps.port.getPageCalls).toBe(callsBeforeSecondWrite + 1);
    expect(result.current.pendingExternalVersion).toBeNull();
    expect(result.current.html).toBe("<p>mine</p>");

    // The existing safety net survives: an explicit Save against the now-stale loaded basis still
    // raises the version-conflict banner rather than silently overwriting.
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.saveConflict).not.toBeNull();
  });

  it("Save anyway after a notice hides the notice", async () => {
    const deps = refreshDeps();
    const { result } = renderHook(() => usePageEditor("landing", deps));
    await waitFor(() => expect(result.current.page).not.toBeNull());

    act(() => result.current.setHtml("<p>mine</p>"));
    act(() => {
      deps.port.simulateExternalWrite({ title: "Landing v2" });
      publishContentRefresh([PAGES_RESOURCE]);
    });
    await waitFor(() => expect(result.current.pendingExternalVersion).not.toBeNull());

    await act(async () => {
      await result.current.saveOverwritingConflict();
    });

    expect(result.current.pendingExternalVersion).toBeNull();
  });

  // Reviewer finding 2 (2026-09-16), seen live as "you were working from version N, so autosaving
  // has paused" right after Load latest, plus a recovery banner on the next reload. The
  // deterministic shape: an autosave is still queued on the old version when an assistant write is
  // applied, then fires against a row that has moved on, is refused, and the refusal pauses
  // autosaving and mirrors the text into browser storage — for a version this editor already left.
  it("an applied refresh supersedes an autosave still queued on the replaced version: nothing is refused, paused, or mirrored", async () => {
    vi.useFakeTimers();
    try {
      localStorage.clear();
      const deps = refreshDeps();
      const { result } = renderHook(() => usePageEditor("landing", deps));
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(result.current.page).not.toBeNull();

      // Typed, then reverted inside the 3s idle window: clean again, but the typed draft is queued.
      act(() => result.current.setHtml("<p>typed</p>"));
      act(() => result.current.setHtml(HTML_PAGE.bodyHtml));
      expect(result.current.dirty).toBe(false);

      await act(async () => {
        deps.port.simulateExternalWrite({ bodyHtml: "<p>new hero</p>" });
        publishContentRefresh([PAGES_RESOURCE]);
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.html).toBe("<p>new hero</p>");

      await act(async () => vi.advanceTimersByTimeAsync(3001));

      expect(deps.port.putAutosaveCalls).toEqual([]);
      expect(result.current.autosaveStaleBasis).toBeNull();
      expect(readStandingDraftLocalBackup(HTML_PAGE.id)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
