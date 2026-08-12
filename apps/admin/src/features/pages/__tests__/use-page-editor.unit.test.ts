import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWiredPageEditor, usePageEditor } from "../hooks/use-page-editor.hooks";
import { createFakePageEditorPort } from "../hooks/page-editor-dependencies.hooks";

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

let fetchMock: ReturnType<typeof vi.fn>;

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
  fetchMock.mockResolvedValueOnce(jsonResponse({ post: page }));
  fetchMock.mockResolvedValueOnce(jsonResponse({ post: page }));
  fetchMock.mockResolvedValueOnce(jsonResponse({ post: page }));
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
    return { port, navigate, t, locale: "en" };
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
