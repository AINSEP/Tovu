import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type AdminMedia } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";
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
  slug: "old-title",
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
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useEditMediaPanel — injected port (no fetch stub)", () => {
  // Proof this landed on the injection seam, not just on matching URL shape — same pattern as
  // `PageEditor.unit.test.tsx`'s "not one this component computed itself" test for
  // `templatePreviewUrl`. `use-edit-media-panel.hooks.ts` no longer imports `lib/api`'s `api` value
  // at all (see `media-port.hooks.ts`'s `mediaOriginalUrl`, added 2026-08-14); `originalUrl` is
  // whatever the injected port hands back. A `fake://` URL the real `api.mediaOriginalUrl` could
  // never produce still ends up as `originalUrl` verbatim, which is only possible if the hook reads
  // it off `port` rather than calling `api.mediaOriginalUrl` itself.
  it("originalUrl is exactly the injected port's mediaOriginalUrl, not one this hook computed itself", () => {
    const mediaOriginalUrlSpy = vi.spyOn(api, "mediaOriginalUrl");
    const port = createFakeMediaPort({ media: [ITEM] });
    const { result } = renderHook(() => useEditMediaPanel({ item: ITEM, onSaved: vi.fn(), onCancel: vi.fn() }, { port, locale: "en" }), {
      wrapper,
    });

    expect(result.current.originalUrl).toBe(`fake://media-original/${ITEM.id}`);
    expect(mediaOriginalUrlSpy).not.toHaveBeenCalled();
  });

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

describe("htmlAttributes — live hint must never gate save() (regression pin for a7cce060)", () => {
  it("htmlAttributesError reflects the live draft (null when empty/valid, a specific message when rejected)", () => {
    const port = createFakeMediaPort({ media: [ITEM] });
    const { result } = renderHook(
      () => useEditMediaPanel({ item: ITEM, onSaved: vi.fn(), onCancel: vi.fn() }, { port, locale: "en" }),
      { wrapper }
    );

    expect(result.current.htmlAttributesError).toBeNull();
    act(() => result.current.setHtmlAttributes('onerror="alert(1)"'));
    expect(result.current.htmlAttributesError).toMatch(/onerror/i);
    act(() => result.current.setHtmlAttributes(""));
    expect(result.current.htmlAttributesError).toBeNull();
  });

  /**
   * The exact shape of the reverted bug (`a7cce060`): `save()` used to check
   * `if (htmlAttributesError) return;` BEFORE `diffMediaMetadata` ever ran, so a changed title never
   * reached the port while the attributes draft was invalid. This calls `save()` directly (not
   * through `Media.tsx`'s Save button — that DOM-level path is covered in `Media.unit.test.tsx`) to
   * pin the hook's own contract independently of how any future UI wires the button.
   */
  it("save() still calls the port and completes while htmlAttributes is invalid — proves save() has no early-return gate on it (the exact shape of a7cce060: `if (htmlAttributesError) return;` BEFORE anything was ever sent)", async () => {
    const port = createFakeMediaPort({ media: [ITEM] });
    const onSaved = vi.fn();
    const { result } = renderHook(
      () => useEditMediaPanel({ item: ITEM, onSaved, onCancel: vi.fn() }, { port, locale: "en" }),
      { wrapper }
    );

    act(() => result.current.setHtmlAttributes('onerror="alert(1)"'));
    expect(result.current.htmlAttributesError).toBeTruthy();
    act(() => result.current.setTitle("New title"));

    await act(async () => {
      await result.current.save();
    });

    // `diffMediaMetadata` is a diff, not a validator — it has no opinion on whether a changed value
    // is ALLOWED, only on whether it changed (see `rules.ts`'s own doc). So a genuinely dirty,
    // genuinely invalid `htmlAttributes` legitimately rides along in the same atomic patch as the
    // title change; a REAL server would then reject the whole call (see Jini's `updateMediaMetadata`
    // write-nothing-on-rejection test). What this proves is narrower and load-bearing on its own:
    // `save()` actually reached the port at all — the old bug never got this far.
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(port.items[0]?.title).toBe("New title");
    expect(port.items[0]?.htmlAttributes).toBe('onerror="alert(1)"');
  });

  it("a valid htmlAttributes change reaches the port, matching cssClass's identical trim-to-null convention", async () => {
    const port = createFakeMediaPort({ media: [ITEM] });
    const onSaved = vi.fn();
    const { result } = renderHook(
      () => useEditMediaPanel({ item: ITEM, onSaved, onCancel: vi.fn() }, { port, locale: "en" }),
      { wrapper }
    );

    act(() => result.current.setHtmlAttributes('data-motion="fade-in"'));
    await act(async () => {
      await result.current.save();
    });

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(port.items[0]?.htmlAttributes).toBe('data-motion="fade-in"');
  });
});

describe("save() diffs against a frozen baseline, not the live `item` prop", () => {
  /**
   * Regression for TM-TOVU-2026-08-12-A round 2 (media's instance of the Comments lost-update
   * defect): `Media.tsx`'s `key={editingItem.id}` only remounts this panel on an ID change — a
   * background refetch of `KEYS.list` that changes the SAME item's OTHER fields (e.g. a different
   * operator concurrently editing `alt` while this panel is open, editing `title`) just re-renders
   * with a fresh `item` prop, exactly like `rerender` below simulates. Before the fix, `save()`
   * diffed `draft` against that live `item`, so `draft.alt`'s stale original value (never touched
   * by this operator) read as "changed" against the NEW live `alt` and got wrongly included in the
   * patch — silently reverting the other operator's committed write.
   */
  it("does not revert a field changed elsewhere while the panel stays open, when only a different field was edited here", async () => {
    const port = createFakeMediaPort({ media: [ITEM] });
    const onSaved = vi.fn();
    const { result, rerender } = renderHook(
      ({ item }: { item: AdminMedia }) => useEditMediaPanel({ item, onSaved, onCancel: vi.fn() }, { port, locale: "en" }),
      { initialProps: { item: ITEM }, wrapper }
    );

    // Operator A edits ONLY the title — never touches alt.
    act(() => result.current.setTitle("New title"));

    // Concurrently, a DIFFERENT write changes this same asset's `alt` on the server (another
    // operator, or any other invalidating action in this session). `Media.tsx` never remounts this
    // panel for a same-id update — it just passes a fresh `item` prop down, which this `rerender`
    // stands in for.
    await port.updateMedia({ id: ITEM.id }, { alt: "Changed by operator B" });
    rerender({ item: port.items[0]! });

    await act(async () => {
      await result.current.save();
    });

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(port.items[0]?.title).toBe("New title");
    // The field this operator never touched must survive the concurrent write, not get silently
    // reverted to its stale pre-edit value.
    expect(port.items[0]?.alt).toBe("Changed by operator B");
  });
});
