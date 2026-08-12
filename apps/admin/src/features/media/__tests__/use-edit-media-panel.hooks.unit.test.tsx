import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type AdminMedia } from "../../../lib/api";
import { FetchQueryProvider } from "../../../lib/fetch-query";
import { createFakeMediaPort } from "../hooks/media-dependencies.hooks";
import { useEditMediaPanel } from "../hooks/use-edit-media-panel.hooks";

/**
 * @file `useEditMediaPanel` — the metadata-edit panel's `save()`, driven against the injected
 * `MediaPort` shared with `use-media.hooks.ts` (see `media-port.hooks.ts`). `Media.unit.test.tsx`
 * already covers the real-client path; this is the "injected port" half.
 *
 * `fetch-query` migration (2026-08-12): every `renderHook` now needs `wrapper: FetchQueryProvider`
 * — see `redirects/__tests__/use-redirects.hooks.unit.test.tsx`'s identical wrapper for the pilot
 * precedent.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const ITEM: AdminMedia = {
  id: "m1",
  workspaceId: "ws1",
  title: "Old title",
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
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useEditMediaPanel — injected port (no fetch stub)", () => {
  it("saves a changed title through the injected port and calls onSaved, never touching the real api client", async () => {
    const updateSpy = vi.spyOn(api, "updateMedia");
    const port = createFakeMediaPort({ media: [ITEM] });
    const onSaved = vi.fn();
    const { result } = renderHook(
      () => useEditMediaPanel({ item: ITEM, onSaved, onCancel: vi.fn() }, { port, locale: "en" }),
      { wrapper }
    );

    act(() => result.current.setTitle("New title"));
    await act(async () => {
      await result.current.save();
    });

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(port.items[0]?.title).toBe("New title");
    expect(updateSpy).not.toHaveBeenCalled();
  });

  /**
   * Negative verification (per this refactor's own required check): confirms the assertions above
   * are not vacuous. Temporarily replacing `port.updateMedia` in `use-edit-media-panel.hooks.ts`'s
   * `save()` with a direct call to the real `api.updateMedia` and re-running this suite fails both
   * assertions (`onSaved` never fires because there's no real network in this test environment,
   * and `port.items[0]?.title` stays `"Old title"` since the fake was never written to) — see this
   * feature's commit / handoff report for the recorded run.
   */
  it("surfaces a save failure via error, and does not call onSaved", async () => {
    const port = createFakeMediaPort({ media: [ITEM] });
    port.updateMedia = () => Promise.reject(new Error("save route down"));
    const onSaved = vi.fn();
    const { result } = renderHook(
      () => useEditMediaPanel({ item: ITEM, onSaved, onCancel: vi.fn() }, { port, locale: "en" }),
      { wrapper }
    );

    act(() => result.current.setTitle("New title"));
    await act(async () => {
      await result.current.save();
    });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(onSaved).not.toHaveBeenCalled();
  });
});
