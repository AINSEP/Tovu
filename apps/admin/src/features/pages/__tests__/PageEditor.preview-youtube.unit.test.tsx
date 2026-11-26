/**
 * @file P1-T3.T — Page Preview's "Watch on YouTube" links for videos only the theme template renders.
 * The sandboxed preview document cannot be read by the admin frame, so the editor asks the embed
 * inspection port; these tests drive the real `PageEditor` + `usePageEditor` over the fake page port
 * and the real `usePreviewEmbedIds` over a fake `load`.
 */
import { useEffect, useState } from "react";
import { useTabBarKeyboard } from "@jini-ai/ui/tab-strip";
import { useThemePreviewFrame } from "@/features/themes/hooks/use-theme-preview-refresh.hooks";
import { cleanup, render, renderHook, screen, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PageEditor } from "../PageEditor";
import { usePageEditor } from "../hooks/use-page-editor.hooks";
import { createFakePageEditorPort } from "../hooks/page-editor-dependencies.hooks";
import { createFakeThemeCanvasPort } from "../hooks/theme-canvas-dependencies.hooks";
import { createPreviewEmbedIdsLoader, previewEmbedIdsPath, usePreviewEmbedIds, type LoadPreviewEmbedIds, type PreviewEmbedIdsArgs } from "@jini-ai/cms/react/pages/hooks/use-preview-embed-ids.hooks";
import { PAGE_PREVIEW_IFRAME_SANDBOX } from "@jini-ai/admin/pages/page-editor-rules";
import type { AdminPost } from "@jini-ai/admin/posts/api/posts-api.types";

vi.mock("@jini-ai/admin/screens/taxonomy/TermPicker", () => ({
  TermPicker: () => <div data-testid="term-picker" />,
}));

const PAGE: AdminPost = {
  id: "pg1", workspaceId: "w1", kind: "page", title: "Contact", slug: "contact", bodyJson: {}, bodyFormat: "html",
  bodyHtml: "<h1>Contact us</h1>", status: "draft", updatedAt: "2026-08-01T00:00:00.000Z", version: 1,
};
const OWN = "ownVideo001";
const TEMPLATE = "tmplVideo01";

beforeEach(() => { vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function renderEditor({ load, page = PAGE }: { load: LoadPreviewEmbedIds; page?: AdminPost }) {
  const port = createFakePageEditorPort({ page, activeThemeTemplates: ["pages-default.html"] });
  const deps = { port, themeCanvasPort: createFakeThemeCanvasPort(), navigate: vi.fn(), t: ({ key }: { locale: string; key: string }) => key, locale: "en" };
  return render(<PageEditor useTabBarKeyboardHook={useTabBarKeyboard} useThemePreviewFrameHook={useThemePreviewFrame} slug={page.slug} usePageEditorHook={({ routeSlug }) => usePageEditor({ routeSlug, deps })} usePreviewEmbedIds={(args) => usePreviewEmbedIds({ ...args, load, useEffect, useState })} />);
}

const links = () => screen.queryAllByText("Watch on YouTube").map((a) => a as HTMLAnchorElement);

/** A load whose answers the test settles by hand, in any order. */
function deferredLoad() {
  const pending: Array<{ args: unknown; resolve: (v: { youtubeIds: string[] }) => void }> = [];
  const load = vi.fn<LoadPreviewEmbedIds>((args) => new Promise((resolve) => { pending.push({ args, resolve }); }));
  return { load, pending };
}

describe("Page Preview — template-rendered video links", () => {
  it("a template-only video shows Watch on YouTube", async () => {
    const load = vi.fn<LoadPreviewEmbedIds>(async () => ({ youtubeIds: [TEMPLATE] }));
    renderEditor({ load });
    await waitFor(() => expect(links()).toHaveLength(1), { timeout: 3000 });
    expect(links()[0]!.href).toBe(`https://www.youtube.com/watch?v=${TEMPLATE}`);
    expect(links()[0]!.rel).toBe("noopener noreferrer");
    // A draft previews through the hidden-form POST, so the lookup carries the same bodyHtml.
    expect(load.mock.calls.at(-1)![0]).toEqual({ id: "pg1", templateChoice: null, pendingHtml: "<h1>Contact us</h1>" });
  });

  it("embed inspection failure leaves the page-owned link available", async () => {
    const load = vi.fn<LoadPreviewEmbedIds>(async () => { throw new Error("offline"); });
    renderEditor({ load, page: { ...PAGE, bodyHtml: `<iframe src="https://www.youtube.com/embed/${OWN}"></iframe>` } });
    await waitFor(() => expect(load).toHaveBeenCalled(), { timeout: 3000 });
    await waitFor(() => expect(links().map((a) => a.href)).toEqual([`https://www.youtube.com/watch?v=${OWN}`]));
  });

  it("a theme refresh rechecks links without changing the iframe sandbox", async () => {
    const load = vi.fn<LoadPreviewEmbedIds>(async () => ({ youtubeIds: [] }));
    const args: PreviewEmbedIdsArgs = { id: "pg1", templateChoice: null, version: 1, previewRevision: "r1", pendingHtml: null, load, useEffect, useState };
    const { rerender } = renderHook((p: PreviewEmbedIdsArgs) => usePreviewEmbedIds(p), { initialProps: args });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1), { timeout: 3000 });
    rerender({ ...args, previewRevision: "r2" });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2), { timeout: 3000 });
    cleanup();
    renderEditor({ load });
    await waitFor(() => expect(screen.getByTitle("Page preview").getAttribute("sandbox")).toBe(PAGE_PREVIEW_IFRAME_SANDBOX));
  });
});

describe("usePreviewEmbedIds", () => {
  it("a late embed response for the previous template cannot replace the active links", async () => {
    const { load, pending } = deferredLoad();
    const args: PreviewEmbedIdsArgs = { id: "pg1", templateChoice: "a.html", version: 1, previewRevision: 0, pendingHtml: null, load, useEffect, useState };
    const { result, rerender } = renderHook((p: PreviewEmbedIdsArgs) => usePreviewEmbedIds(p), { initialProps: args });
    await waitFor(() => expect(pending).toHaveLength(1), { timeout: 3000 });
    pending[0]!.resolve({ youtubeIds: ["AAAAAAAAAAA"] });
    await waitFor(() => expect(result.current).toEqual(["AAAAAAAAAAA"]));
    rerender({ ...args, templateChoice: "b.html" });
    expect(result.current).toEqual([]); // never the previous template's ids while the next is pending
    await waitFor(() => expect(pending).toHaveLength(2), { timeout: 3000 });
    rerender({ ...args, templateChoice: "c.html" });
    await waitFor(() => expect(pending).toHaveLength(3), { timeout: 3000 });
    pending[2]!.resolve({ youtubeIds: ["CCCCCCCCCCC"] });
    await waitFor(() => expect(result.current).toEqual(["CCCCCCCCCCC"]));
    pending[1]!.resolve({ youtubeIds: ["BBBBBBBBBBB"] }); // superseded: must be dropped
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toEqual(["CCCCCCCCCCC"]);
  });

  it("the authenticated port sends clean and pending HTML requests on the workspace-relative path", async () => {
    const request = vi.fn(async () => ({ youtubeIds: [] })) as unknown as Parameters<typeof createPreviewEmbedIdsLoader>[0]["request"];
    const load = createPreviewEmbedIdsLoader({ path: previewEmbedIdsPath, workspaceId: "w1", request });
    const signal = new AbortController().signal;
    await load({ id: "a/b", templateChoice: null, pendingHtml: null });
    await load({ id: "pg1", templateChoice: "", pendingHtml: "<p>draft</p>" }, { signal });
    await load({ id: "pg1", templateChoice: "x y.html", pendingHtml: null });
    expect(vi.mocked(request).mock.calls).toEqual([
      [{ path: "/workspaces/w1/posts/a%2Fb/template-preview/embeds", method: "POST", body: {} }, {}],
      [{ path: "/workspaces/w1/posts/pg1/template-preview/embeds?templateChoice=", method: "POST", body: { bodyHtml: "<p>draft</p>" } }, { signal }],
      [{ path: "/workspaces/w1/posts/pg1/template-preview/embeds?templateChoice=x%20y.html", method: "POST", body: {} }, {}],
    ]);
  });
});
