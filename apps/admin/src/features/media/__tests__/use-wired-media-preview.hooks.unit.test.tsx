import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminMedia } from "@jini-ai/core/contracts/site/cms-admin-media";
import { mediaApi } from "@/features/media/api/media-api";
import { useWiredMediaPreview } from "../hooks/use-media-preview.hooks";

/**
 * @file The host binding half of the media preview hook: the fallback-chain logic is tested in
 * `@jini-ai/admin` against a fake port, so this suite proves only what the binding owns — that the
 * `src` it hands `MediaPreview` is built by this host's `mediaApi.mediaOriginalUrl`, not by a URL
 * template re-derived in the binding.
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

describe("useWiredMediaPreview — host media api binding", () => {
  it("builds src through the host media api's mediaOriginalUrl, not a locally computed URL", () => {
    const spy = vi.spyOn(mediaApi, "mediaOriginalUrl").mockReturnValue("spied://media/m1");
    const { result } = renderHook(() => useWiredMediaPreview(ITEM));
    expect(spy).toHaveBeenCalledWith({ id: "m1" });
    expect(result.current.src).toBe("spied://media/m1");
  });

  it("falls back to the real url shape when nothing is spied", () => {
    const { result } = renderHook(() => useWiredMediaPreview(ITEM));
    expect(result.current.src).toBe(mediaApi.mediaOriginalUrl({ id: "m1" }));
  });
});
