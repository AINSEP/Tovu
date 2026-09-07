import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type AdminMedia } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";
import { publishContentRefresh, resetContentRefreshBus } from "@/lib/content-refresh-bus";
import { createFakeMediaPort } from "../hooks/media-dependencies.hooks";
import { useMedia } from "../hooks/use-media.hooks";
import { MEDIA_RESOURCE } from "../rules";

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

/**
 * `trash` and `purge` share ONE `rowSavingId` field with no per-call guard. `purge` only runs while
 * `pendingPurge` is set (the confirm dialog is open, and `ConfirmDialog`'s own `pending` prop —
 * `rowSavingId === pendingPurge.id` — blocks Escape/backdrop dismissal for exactly as long as that
 * holds), but `trash` has NO confirm step at all and is reachable on a DIFFERENT row at any time. An
 * unrelated `trash` call that happens to settle WHILE a purge confirmation is genuinely still
 * in-flight unconditionally resets `rowSavingId` to `null` in its own `finally` — which flips the
 * open purge dialog's `pending` prop to `false` mid-request, re-enabling Confirm/Cancel and
 * Escape/backdrop dismissal for a destructive delete that has not actually settled yet.
 */
describe("useMedia — trash/purge shared rowSavingId race safety", () => {
  it("an unrelated trash settling mid-flight must not clear rowSavingId for an in-flight purge on a different item", async () => {
    const ITEM_B = fakeMedia({ id: "mB", title: "B", status: "active" });
    const ITEM_C = fakeMedia({ id: "mC", title: "C", status: "trashed" });
    const port = createFakeMediaPort({ media: [ITEM_B, ITEM_C] });

    const deferredTrash: { resolve?: (v: { media: AdminMedia }) => void } = {};
    port.trashMedia = vi.fn(
      (_id: string) =>
        new Promise<{ media: AdminMedia }>((resolve) => {
          deferredTrash.resolve = resolve;
        })
    );
    const deferredPurge: { resolve?: (v: { purged: true }) => void } = {};
    port.deleteMedia = vi.fn(
      (_id: string) =>
        new Promise<{ purged: true }>((resolve) => {
          deferredPurge.resolve = resolve;
        })
    );

    const { result } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.media).toHaveLength(2));

    // Trash B (no confirm step — reachable at any time, in flight, slow).
    act(() => {
      void result.current.trash(ITEM_B);
    });
    await waitFor(() => expect(port.trashMedia).toHaveBeenCalledTimes(1));

    // Independently, open and confirm the purge dialog for C — genuinely in flight now too.
    act(() => result.current.setPendingPurge(ITEM_C));
    act(() => {
      void result.current.purge();
    });
    await waitFor(() => expect(port.deleteMedia).toHaveBeenCalledTimes(1));
    expect(result.current.rowSavingId).toBe(ITEM_C.id);

    // B's unrelated trash settles first — must NOT touch C's still-in-flight purge state.
    await act(async () => {
      deferredTrash.resolve!({ media: { ...ITEM_B, status: "trashed" } });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    // C's purge dialog must still read as pending (rowSavingId still names C) — otherwise
    // `ConfirmDialog`'s `pending` prop flips false mid-request, unlocking a second confirm click or
    // an Escape/backdrop dismissal while the destructive delete is still in flight.
    expect(result.current.rowSavingId).toBe(ITEM_C.id);
    expect(result.current.pendingPurge?.id).toBe(ITEM_C.id);

    // Let C's purge settle too, and confirm it cleans up correctly on its own.
    await act(async () => {
      deferredPurge.resolve!({ purged: true });
    });
    await waitFor(() => expect(result.current.rowSavingId).toBeNull());
    expect(result.current.pendingPurge).toBeNull();
  });
});

function fakeMedia(overrides: Partial<AdminMedia> = {}): AdminMedia {
  return {
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
    ...overrides,
  };
}

/**
 * Regression coverage for the same class of bug `use-taxonomy.hooks.ts`'s own content-refresh suite
 * fixed first (see that file's header): today no agent tool writes media directly, but this grid
 * subscribes anyway (`rules.ts`'s `MEDIA_RESOURCE` doc explains why) — and the bus's own "unknown
 * scope" default means every finished assistant run reaches this subscription regardless.
 *
 * Driven through the REAL `lib/content-refresh-bus`, same choice `use-taxonomy.hooks.ts` makes and
 * for the same reason: the thing worth asserting is the wiring between this hook and the bus.
 */
describe("useMedia — content refresh bus", () => {
  afterEach(() => resetContentRefreshBus());

  it("re-reads the list when a content refresh fires", async () => {
    const port = createFakeMediaPort({ media: [fakeMedia()] });
    const { result } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.media).toHaveLength(1));

    // A write landing server-side outside this hook — the screen has no other way to know it happened.
    port.items.push(fakeMedia({ id: "m2", title: "Second photo" }));
    expect(result.current.media).toHaveLength(1);

    act(() => publishContentRefresh());

    await waitFor(() => expect(result.current.media).toHaveLength(2));
  });

  it("refreshes on a notification that names media, and ignores one that names only other resources", async () => {
    const port = createFakeMediaPort({ media: [fakeMedia()] });
    const { result } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.media).toHaveLength(1));

    port.items.push(fakeMedia({ id: "m2", title: "Second photo" }));

    act(() => publishContentRefresh(["taxonomy"]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.media).toHaveLength(1);

    act(() => publishContentRefresh([MEDIA_RESOURCE]));
    await waitFor(() => expect(result.current.media).toHaveLength(2));
  });

  it("stops re-reading once unmounted", async () => {
    const port = createFakeMediaPort({ media: [fakeMedia()] });
    const listSpy = vi.spyOn(port, "listMedia");
    const { result, unmount } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.media).toHaveLength(1));

    const callsWhileMounted = listSpy.mock.calls.length;
    unmount();
    act(() => publishContentRefresh());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(listSpy).toHaveBeenCalledTimes(callsWhileMounted);
  });
});
