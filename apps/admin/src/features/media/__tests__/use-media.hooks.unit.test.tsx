import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError, type AdminMedia } from "@/lib/api";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { publishContentRefresh, resetContentRefreshBus } from "@/lib/content-refresh-bus";
import { createFakeMediaPort } from "../hooks/media-dependencies.hooks";
import { useMedia } from "../hooks/use-media.hooks";
import { MEDIA_RESOURCE, describeApiError, visibleMediaError } from "../rules";

/**
 * @file `useMedia` — the Media grid screen's list/upload/trash/purge cycle, driven against the
 * injected `MediaPort` rather than a stubbed global `fetch`. `Media.unit.test.tsx` already covers
 * the real-client path end to end (`useWiredMedia` via `Media.tsx`'s default prop); this file is
 * the "injected port" half `Jini redirects/react/__tests__/use-redirects.hooks.unit.test.tsx`'s own file header describes —
 * proof the hook actually reads its dependency from the injected `port`, not from `lib/api`.
 *
 * `fetch-query` migration (2026-08-12): every `renderHook` now needs `wrapper: FetchQueryProvider`
 * — see `Jini redirects/react/__tests__/use-redirects.hooks.unit.test.tsx`'s identical wrapper for the pilot
 * precedent.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("media error presentation", () => {
  it("uses the supplied fallback for empty API errors and non-Error failures", () => {
    expect(describeApiError(new ApiError("", 503, "UNAVAILABLE"), "Try again")).toBe("Try again");
    expect(describeApiError("unstructured failure", "Try again")).toBe("Try again");
    expect(describeApiError(new Error("network unavailable"), "Try again")).toBe("network unavailable");
  });

  it("prioritizes trash over purge and list failures even after media has loaded", () => {
    expect(visibleMediaError({ trashError: new Error("Trash refused"), purgeError: new Error("Purge refused"), restoreError: null, restoreFallback: "Restore failed",
      listError: new Error("Refresh failed"), hasMedia: true, deleteFallback: "Delete failed", listFallback: "Load failed" })).toBe("Trash refused");
  });

  it("shows the purge fallback ahead of the list error when trash succeeded", () => {
    expect(visibleMediaError({ trashError: null, purgeError: new ApiError("", 503, "UNAVAILABLE"), restoreError: new Error("Restore refused"), restoreFallback: "Restore failed",
      listError: new Error("Refresh failed"), hasMedia: true, deleteFallback: "Delete failed", listFallback: "Load failed" })).toBe("Delete failed");
  });

  it("shows an initial list failure but keeps a background refresh failure off loaded media", () => {
    const input = { trashError: null, purgeError: null, restoreError: null, restoreFallback: "Restore failed", listError: new Error("Offline"), deleteFallback: "Delete failed", listFallback: "Load failed" };
    expect(visibleMediaError({ ...input, hasMedia: false })).toBe("Offline");
    expect(visibleMediaError({ ...input, hasMedia: true })).toBeNull();
    expect(visibleMediaError({ ...input, listError: null, hasMedia: false })).toBeNull();
  });

  it("shows a restore failure (fallback when empty) ahead of a loaded list's refresh error", () => {
    const input = { trashError: null, purgeError: null, restoreFallback: "Restore failed", listError: new Error("Offline"), deleteFallback: "Delete failed", listFallback: "Load failed", hasMedia: true };
    expect(visibleMediaError({ ...input, restoreError: new ApiError("", 409, "CONFLICT") })).toBe("Restore failed");
    expect(visibleMediaError({ ...input, restoreError: new Error("Restore refused") })).toBe("Restore refused");
  });
});

describe("useMedia — injected port (no fetch stub)", () => {
  it("closing the upload dialog preserves the chosen file and alt for reopening", async () => {
    const port = createFakeMediaPort();
    const { result } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.media).toEqual([]));
    const input = document.createElement("input");
    Object.defineProperty(input, "files", { value: [new File(["pixel"], "chosen.png", { type: "image/png" })] });
    result.current.fileInputRef.current = input;
    const opener = document.createElement("button");
    act(() => {
      result.current.onFileChange({ currentTarget: input } as React.ChangeEvent<HTMLInputElement>);
      result.current.setAltDraft("Keep my description");
      result.current.openUpload({ currentTarget: opener });
    });
    expect(result.current.uploadOpen).toBe(true);
    expect(result.current.canUpload).toBe(true);
    act(() => result.current.closeUpload());
    expect(result.current.uploadOpen).toBe(false);
    expect(result.current.selectedFileName).toBe("chosen.png");
    expect(result.current.altDraft).toBe("Keep my description");
    act(() => result.current.openUpload({ currentTarget: opener }));
    expect(result.current.uploadOpen).toBe(true);
    expect(result.current.selectedFileName).toBe("chosen.png");
    expect(result.current.altDraft).toBe("Keep my description");
  });

  it("clears a previous filename when the chooser supplies no files or an empty list", async () => {
    const port = createFakeMediaPort();
    const { result } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.media).toEqual([]));
    const chosen = document.createElement("input");
    Object.defineProperty(chosen, "files", { value: [new File(["pixel"], "chosen.png")] });
    const empty = document.createElement("input");
    empty.type = "file";
    const absent = document.createElement("input");
    for (const cleared of [empty, absent]) {
      act(() => result.current.onFileChange({ currentTarget: chosen } as React.ChangeEvent<HTMLInputElement>));
      expect(result.current.canUpload).toBe(true);
      act(() => result.current.onFileChange({ currentTarget: cleared } as React.ChangeEvent<HTMLInputElement>));
      expect(result.current.selectedFileName).toBe("");
      expect(result.current.canUpload).toBe(false);
    }
  });

  it("prevents form submission but sends no upload when the input or chosen file is missing", async () => {
    const port = createFakeMediaPort();
    const upload = vi.spyOn(port, "uploadMedia");
    const { result } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.media).toEqual([]));
    const preventDefault = vi.fn();
    await act(async () => { await result.current.upload({ preventDefault }); });
    const input = document.createElement("input");
    result.current.fileInputRef.current = input;
    await act(async () => { await result.current.upload(); });
    input.type = "file";
    await act(async () => { await result.current.upload(); });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(upload).not.toHaveBeenCalled();
    expect(port.items).toEqual([]);
    expect(result.current.uploading).toBe(false);
    expect(result.current.uploadError).toBeNull();
  });

  it("finishes a successful upload even if its file input was removed while the request was pending", async () => {
    const port = createFakeMediaPort();
    const uploadFile = port.uploadMedia;
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let received = false;
    port.uploadMedia = async (input, options) => { received = true; await pending; return uploadFile(input, options); };
    const { result } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.media).toEqual([]));
    const input = document.createElement("input");
    Object.defineProperty(input, "files", { value: [new File(["pixel"], "chosen.png", { type: "image/png" })] });
    result.current.fileInputRef.current = input;
    act(() => result.current.onFileChange({ currentTarget: input } as React.ChangeEvent<HTMLInputElement>));
    let uploading!: Promise<void>;
    act(() => { uploading = result.current.upload(); });
    await waitFor(() => expect(received).toBe(true));
    expect(result.current.uploading).toBe(true);
    expect(result.current.canUpload).toBe(false);
    result.current.fileInputRef.current = null;
    await act(async () => { release(); await uploading; });
    await waitFor(() => expect(result.current.media?.map(item => item.title)).toEqual(["chosen.png"]));
    expect(result.current.selectedFileName).toBe("");
    expect(result.current.uploading).toBe(false);
    expect(result.current.uploadError).toBeNull();
  });

  it("ignores purge when no item is selected for confirmation", async () => {
    const port = createFakeMediaPort({ media: [fakeMedia()] });
    const remove = vi.spyOn(port, "deleteMedia");
    const { result } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.media).toHaveLength(1));
    await act(async () => { await result.current.purge(); });
    expect(remove).not.toHaveBeenCalled();
    expect(result.current.rowSavingId).toBeNull();
    expect(port.items).toEqual([fakeMedia()]);
  });

  it("guards Upload before file reading and while the POST is pending, then allows another upload", async () => {
    const port = createFakeMediaPort();
    const uploadFile = port.uploadMedia;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const calls: string[] = [];
    port.uploadMedia = async (input, options) => {
      calls.push(input.filename);
      await pending;
      return uploadFile(input, options);
    };
    const { result } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.media).toEqual([]));
    const input = document.createElement("input");
    Object.defineProperty(input, "files", { value: [new File(["pixel"], "pixel.png", { type: "image/png" })] });
    result.current.fileInputRef.current = input;
    const upload = result.current.upload;
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => { first = upload(); second = upload(); });
    // Busy must cover FileReader, before the mutation has even started.
    expect(result.current.uploading).toBe(true);
    await waitFor(() => expect(calls).toEqual(["pixel.png"]));
    await act(async () => { await upload(); });
    expect(calls).toEqual(["pixel.png"]);
    await act(async () => { release(); await Promise.all([first, second]); });
    expect(result.current.uploading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(port.items).toHaveLength(1);
    await act(async () => { await result.current.upload(); });
    expect(calls).toEqual(["pixel.png", "pixel.png"]);
    expect(port.items).toHaveLength(2);
  });

  it("releases the Upload guard after a failed POST so the same file can be retried", async () => {
    const port = createFakeMediaPort();
    const uploadFile = port.uploadMedia;
    let attempts = 0;
    port.uploadMedia = async (input, options) => {
      if (++attempts === 1) throw new Error("Upload unavailable");
      return uploadFile(input, options);
    };
    const { result } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.media).toEqual([]));
    const input = document.createElement("input");
    Object.defineProperty(input, "files", { value: [new File(["pixel"], "pixel.png", { type: "image/png" })] });
    result.current.fileInputRef.current = input;
    const opener = document.createElement("button");
    act(() => { result.current.openUpload({ currentTarget: opener }); });
    await act(async () => { await result.current.upload(); });
    expect(result.current.uploading).toBe(false);
    // Upload failures show in the upload dialog, which stays open; the page banner stays clear.
    expect(result.current.uploadError).toBe("Upload unavailable");
    expect(result.current.error).toBeNull();
    expect(result.current.uploadOpen).toBe(true);
    await act(async () => { await result.current.upload(); });
    expect(attempts).toBe(2);
    expect(result.current.uploadError).toBeNull();
    expect(result.current.uploadOpen).toBe(false);
    expect(port.items).toHaveLength(1);
  });

  it("shows a file that could not be read as an upload error without calling the port", async () => {
    const port = createFakeMediaPort();
    const uploadSpy = vi.spyOn(port, "uploadMedia");
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader) {
      // A plain Error: jsdom's DOMException is not `instanceof Error` (a browser's is).
      Object.defineProperty(this, "error", { value: new Error("File could not be read") });
      this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>);
    });
    const { result } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.media).toEqual([]));
    const input = document.createElement("input");
    Object.defineProperty(input, "files", { value: [new File(["pixel"], "pixel.png", { type: "image/png" })] });
    result.current.fileInputRef.current = input;
    await act(async () => { await result.current.upload(); });
    expect(result.current.uploadError).toBe("File could not be read");
    expect(result.current.uploading).toBe(false);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("loads the list from the injected port and never touches the real api client", async () => {
    const listSpy = vi.spyOn(api, "listMedia");
    const port = createFakeMediaPort({
      media: [
        {
          id: "m1",
          workspaceId: "ws1",
          title: "Photo",
          slug: "photo",
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
          htmlAttributes: null,
          contentType: "image/png",
          publicUrl: null,
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
          slug: "photo",
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
          htmlAttributes: null,
          contentType: "image/png",
          publicUrl: null,
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

  it("restores a trashed item through the injected port, and the re-read list shows it active", async () => {
    const port = createFakeMediaPort({ media: [fakeMedia({ id: "m1", status: "trashed" })] });
    const { result } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.media).toHaveLength(1));

    await act(async () => {
      await result.current.restore(result.current.media![0]!);
    });

    await waitFor(() => expect(result.current.media?.[0]?.status).toBe("active"));
    expect(result.current.rowSavingId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("shows the restore fallback when the Trash refuses the restore, and frees the row", async () => {
    const port = createFakeMediaPort({ media: [fakeMedia({ id: "m1", status: "trashed" })] });
    port.restoreMedia = async () => ({ restored: false });
    const { result } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.media).toHaveLength(1));

    await act(async () => {
      await result.current.restore(result.current.media![0]!);
    });

    await waitFor(() => expect(result.current.error).toBe("failed to restore"));
    expect(result.current.rowSavingId).toBeNull();
    expect(result.current.media?.[0]?.status).toBe("trashed");
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
describe("useMedia — edit toggle", () => {
  it("opens a row's editor, moves it to another row, closes it on a re-click, and closes it after a save", () => {
    const port = createFakeMediaPort();
    const { result } = renderHook(() => useMedia({ port, locale: "en", t: (k) => k }), { wrapper });
    const a = { id: "a" } as AdminMedia;
    const b = { id: "b" } as AdminMedia;

    act(() => result.current.toggleEditing(a));
    expect(result.current.editingId).toBe("a");
    act(() => result.current.toggleEditing(b));
    expect(result.current.editingId).toBe("b");
    act(() => result.current.toggleEditing(b));
    expect(result.current.editingId).toBeNull();
    act(() => result.current.toggleEditing(a));
    act(() => result.current.onMetadataSaved());
    expect(result.current.editingId).toBeNull();
  });
});

describe("useMedia — trash/purge shared rowSavingId race safety", () => {
  it.each(["replacement", "dismissed"] as const)("a finished purge preserves a newer row action and a %s confirmation", async (confirmation) => {
    const trashed = fakeMedia({ id: "old-purge", status: "trashed" });
    const active = fakeMedia({ id: "new-trash" });
    const replacement = fakeMedia({ id: "next-purge", status: "trashed" });
    const port = createFakeMediaPort({ media: [trashed, active, replacement] });
    const deleteMedia = port.deleteMedia;
    const trashMedia = port.trashMedia;
    let releasePurge!: () => void;
    let releaseTrash!: () => void;
    const deleting = new Promise<void>(resolve => { releasePurge = resolve; });
    const trashing = new Promise<void>(resolve => { releaseTrash = resolve; });
    let purgeStarted = false;
    let trashStarted = false;
    port.deleteMedia = async id => { purgeStarted = true; await deleting; return deleteMedia(id); };
    port.trashMedia = async id => { trashStarted = true; await trashing; return trashMedia(id); };
    const { result } = renderHook(() => useMedia({ port, locale: "en", t: k => k }), { wrapper });
    await waitFor(() => expect(result.current.media).toHaveLength(3));
    act(() => result.current.setPendingPurge(trashed));
    let purging!: Promise<void>;
    let movingToTrash!: Promise<void>;
    act(() => { purging = result.current.purge(); });
    await waitFor(() => expect(purgeStarted).toBe(true));
    act(() => { movingToTrash = result.current.trash(active); });
    await waitFor(() => expect(trashStarted).toBe(true));
    const nextConfirmation = confirmation === "replacement" ? replacement : null;
    act(() => result.current.setPendingPurge(nextConfirmation));
    await act(async () => { releasePurge(); await purging; });
    expect(result.current.rowSavingId).toBe("new-trash");
    expect(result.current.pendingPurge).toEqual(nextConfirmation);
    expect(port.items.map(item => item.id)).toEqual(["new-trash", "next-purge"]);
    await act(async () => { releaseTrash(); await movingToTrash; });
    await waitFor(() => expect(result.current.media?.find(item => item.id === "new-trash")?.status).toBe("trashed"));
    expect(result.current.rowSavingId).toBeNull();
    expect(result.current.pendingPurge).toEqual(nextConfirmation);
  });

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
    slug: "photo",
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
    htmlAttributes: null,
    contentType: "image/png",
    publicUrl: null,
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
