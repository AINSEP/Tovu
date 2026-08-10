import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePageEditor } from "../hooks/use-page-editor.hooks";

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
 * Follows the fetch-mocking harness `use-pages.unit.test.ts` established for this package (mock
 * global `fetch`, not the `api` module). `usePageEditor` also calls `useAdminLocale()`, which fires
 * its own fetch on mount racing `getPage`'s — the mount helper below queues the page response
 * TWICE so whichever of the two fires first still gets a valid `Response` (the locale hook is
 * tolerant of the shape; it only reads a `values` key that won't be present and falls back).
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
  const view = renderHook(() => usePageEditor(routeSlug));
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
    expect(JSON.parse(String(init.body))).toMatchObject({ status: "draft" });
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
