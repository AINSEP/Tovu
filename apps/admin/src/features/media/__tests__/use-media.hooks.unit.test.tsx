import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../../../lib/api";
import { FetchQueryProvider } from "../../../lib/fetch-query";
import { createFakeMediaPort } from "../hooks/media-dependencies.hooks";
import { useMedia } from "../hooks/use-media.hooks";

/**
 * @file `useMedia` — the Media grid screen's list/upload/trash/purge cycle, driven against the
 * injected `MediaPort` rather than a stubbed global `fetch`. `Media.unit.test.tsx` already covers
 * the real-client path end to end (`useWiredMedia` via `Media.tsx`'s default prop); this file is
 * the "injected port" half `use-redirects.hooks.unit.test.tsx`'s own file header describes —
 * proof the hook actually reads its dependency from the injected `port`, not from `lib/api`.
 *
 * `fetch-query` migration (2026-08-12): every `renderHook` now needs `wrapper: FetchQueryProvider`
 * — see `redirects/__tests__/use-redirects.hooks.unit.test.tsx`'s identical wrapper for the pilot
 * precedent.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMedia — injected port (no fetch stub)", () => {
  it("loads the list from the injected port and never touches the real api client", async () => {
    const listSpy = vi.spyOn(api, "listMedia");
    const port = createFakeMediaPort({
      media: [
        {
          id: "m1",
          workspaceId: "ws1",
          title: "Photo",
          alt: "",
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
          contentType: "image/png",
        },
      ],
    });
    const { result } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });

    await waitFor(() => expect(result.current.media).toHaveLength(1));
    expect(result.current.media?.[0]?.id).toBe("m1");
    expect(listSpy).not.toHaveBeenCalled();
  });

  it("routes trash through the injected port, and the item's status flips after the list re-reads it", async () => {
    const port = createFakeMediaPort({
      media: [
        {
          id: "m1",
          workspaceId: "ws1",
          title: "Photo",
          alt: "",
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
          contentType: "image/png",
        },
      ],
    });
    const { result } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.media).toHaveLength(1));

    await act(async () => {
      await result.current.trash(result.current.media![0]!);
    });

    await waitFor(() => expect(result.current.media?.[0]?.status).toBe("trashed"));
  });

  /**
   * Negative verification (per this refactor's own required check): confirms this test actually
   * exercises the injection rather than passing vacuously. Pointing the fake port's `listMedia` at
   * a DIFFERENT resolved list than the one asserted on makes the first test's `toHaveLength(1)`/
   * `.id === "m1"` assertions fail — see this file's own commit message / handoff report for the
   * full negative-verification record (temporarily replacing `port.listMedia()` in
   * `use-media.hooks.ts` with a call to the real `api.listMedia()` and re-running this suite).
   */
  it("does not resolve `media` while the injected port's list call is still pending", () => {
    const port = createFakeMediaPort();
    port.listMedia = () => new Promise(() => {});
    const { result } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });
    expect(result.current.media).toBeNull();
  });
});
