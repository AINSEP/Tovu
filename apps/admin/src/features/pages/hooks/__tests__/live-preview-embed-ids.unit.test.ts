import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";

import { useLivePreviewEmbedIds } from "../page-editor-dependencies.hooks";

/**
 * @file `useLivePreviewEmbedIds` as `PageEditor` calls it: only the preview inputs, no React hooks.
 * The cms `usePreviewEmbedIds` takes `useEffect`/`useState` as required injected props, so the live
 * binding must supply them; without them every Page Editor render threw "useState is not a function"
 * (regression: merge-27, 2026-11-26).
 */

it("the live binding renders with no links before its debounced lookup", () => {
  const { result, unmount } = renderHook(() => useLivePreviewEmbedIds({ id: "pg1", templateChoice: null, version: 1, previewRevision: 0, pendingHtml: null }));
  expect(result.current).toEqual([]);
  unmount();
});
