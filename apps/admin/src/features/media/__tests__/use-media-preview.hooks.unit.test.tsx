import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type AdminMedia } from "@/lib/api";
import { createFakeMediaPort } from "../hooks/media-dependencies.hooks";
import { useMediaPreview } from "../hooks/use-media-preview.hooks";

/**
 * @file `useMediaPreview` — the fallback-chain hook `MediaPreview` renders from (`Media.tsx`),
 * driven against the injected `MediaPort` rather than a stubbed global `fetch`/`api` spy.
 * `Media.unit.test.tsx`'s "preview fallback chain" describe block already covers the real-client
 * path through the full component tree; this is the "injected port" half, the same split
 * `use-edit-media-panel.hooks.unit.test.tsx` uses for its sibling hook in this same `MediaPort`.
 *
 * Added 2026-08-14 alongside `useMediaPreview` itself gaining a `deps.port` parameter — before
 * that date this hook had no injectable dependency at all (its only `api` touch was the pure
 * `mediaOriginalUrl` URL template, then excluded from `MediaPort` — see `media-port.hooks.ts`'s
 * header for the full history), so there was nothing here for a fake to intercept.
 */

const ITEM: AdminMedia = {
  id: "m1",
  workspaceId: "ws1",
  title: "Sunset",
  slug: "sunset",
  alt: "A sunset over water",
  caption: "",
  credit: "",
  sha256: "sha1",
  status: "active",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
  width: null,
  height: null,
  cssClass: null,
  htmlAttributes: null,
  contentType: "image/png",
  publicUrl: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMediaPreview — injected port (no fetch stub)", () => {
  // Proof this landed on the injection seam, not just on matching URL shape — same pattern as
  // `PageEditor.unit.test.tsx`'s "not one this component computed itself" test for
  // `templatePreviewUrl`, and this feature's own `use-edit-media-panel.hooks.unit.test.tsx`
  // equivalent for `originalUrl`. `use-media-preview.hooks.ts` no longer imports `lib/api`'s `api`
  // value at all; `src` is whatever the injected port hands back. A `fake://` URL the real
  // `api.mediaOriginalUrl` could never produce still ends up as `src` verbatim, which is only
  // possible if the hook reads it off `port` rather than calling `api.mediaOriginalUrl` itself.
  it("src is exactly the injected port's mediaOriginalUrl, not one this hook computed itself", () => {
    const mediaOriginalUrlSpy = vi.spyOn(api, "mediaOriginalUrl");
    const port = createFakeMediaPort({ media: [ITEM] });
    const { result } = renderHook(() => useMediaPreview(ITEM, { port }));

    expect(result.current.src).toBe(`fake://media-original/${ITEM.id}`);
    expect(mediaOriginalUrlSpy).not.toHaveBeenCalled();
  });

  it("still resolves alt text and starts at the image stage, unaffected by the port injection", () => {
    const port = createFakeMediaPort({ media: [ITEM] });
    const { result } = renderHook(() => useMediaPreview(ITEM, { port }));

    expect(result.current.stage).toBe("image");
    expect(result.current.altText).toBe("A sunset over water");
  });

  it("advances image -> video -> unsupported on successive probe failures, same as before the port injection", () => {
    const port = createFakeMediaPort({ media: [ITEM] });
    const { result } = renderHook(() => useMediaPreview(ITEM, { port }));

    act(() => result.current.handleImageError());
    expect(result.current.stage).toBe("video");

    act(() => result.current.handleVideoError());
    expect(result.current.stage).toBe("unsupported");
  });
});
