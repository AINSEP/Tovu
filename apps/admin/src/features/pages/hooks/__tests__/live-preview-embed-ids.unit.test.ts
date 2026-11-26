import { renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { useLivePreviewEmbedIds } from "../page-editor-dependencies.hooks";

/**
 * @file `useLivePreviewEmbedIds` as `PageEditor` calls it: only the preview inputs, no React hooks.
 * The cms `usePreviewEmbedIds` takes `useEffect`/`useState` as required injected props, so the live
 * binding must supply them; without them every Page Editor render threw "useState is not a function"
 * (regression: merge-27, 2026-11-26).
 */

it("the live binding renders with no links until its debounced lookup returns an ID", async () => {
  const path = /\/posts\/pg1\/template-preview\/embeds$/;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST" && path.test(url)) return Response.json({ youtubeIds: ["AAAAAAAAAAA"] });
    throw new Error(`Unexpected request: ${init?.method} ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  try {
    const { result } = renderHook(() => useLivePreviewEmbedIds({ id: "pg1", templateChoice: null, version: 1, previewRevision: 0, pendingHtml: null }));
    expect(result.current).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current).toEqual(["AAAAAAAAAAA"]), { timeout: 3000 });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(path), expect.objectContaining({ method: "POST" }));
  } finally {
    vi.unstubAllGlobals();
  }
});
