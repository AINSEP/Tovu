import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError, type AdminMedia } from "../../lib/api";
import { useMediaPickerDialog, useMediaPickerItems } from "../MediaPickerDialog/MediaPickerDialog.hooks";

/**
 * @file `useMediaPickerItems`/`useMediaPickerDialog` — the data-fetch and Escape-to-cancel state
 * `MediaPickerDialog.tsx` delegates to, driven directly here with `renderHook` rather than through
 * a full component render. First test file for this logic — `MediaPickerDialog.tsx` had none before
 * this refactor pass. Spies on `api.listMedia` directly (`vi.spyOn`), the same pattern
 * `WidgetConfigFields.unit.test.tsx` uses for `api.listMenus`/`api.listForms`, rather than stubbing
 * `fetch` — nothing else in this file touches the network.
 */

function media(overrides: Partial<AdminMedia> = {}): AdminMedia {
  return {
    id: "m1",
    workspaceId: "w1",
    title: "Photo",
    alt: "",
    caption: "",
    credit: "",
    sha256: "abc",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMediaPickerItems", () => {
  it("starts with items null and no error before the fetch resolves", () => {
    vi.spyOn(api, "listMedia").mockReturnValue(new Promise(() => {})); // never resolves — pins the loading shape
    const { result } = renderHook(() => useMediaPickerItems());
    expect(result.current).toEqual({ items: null, error: null });
  });

  it("filters trashed assets out, keeping only active ones", async () => {
    vi.spyOn(api, "listMedia").mockResolvedValue({
      media: [media({ id: "a", status: "active" }), media({ id: "b", status: "trashed" })],
    });
    const { result } = renderHook(() => useMediaPickerItems());

    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(result.current.items).toEqual([media({ id: "a", status: "active" })]);
    expect(result.current.error).toBeNull();
  });

  it("describes a failed fetch instead of leaving items stuck loading", async () => {
    vi.spyOn(api, "listMedia").mockRejectedValue(new ApiError("media table locked", 500));
    const { result } = renderHook(() => useMediaPickerItems());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("media table locked");
    expect(result.current.items).toBeNull();
  });

  it("falls back to the given default when the rejection carries no usable message", async () => {
    // An empty-message ApiError, not a plain Error — `describeApiError` only falls back to the
    // default on the ApiError branch's `e.message || fallback`; a plain `Error` with `message: ""`
    // would return that empty string as-is (see `describeApiError`'s own two branches).
    vi.spyOn(api, "listMedia").mockRejectedValue(new ApiError("", 500));
    const { result } = renderHook(() => useMediaPickerItems());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("failed to load media");
  });
});

describe("useMediaPickerDialog", () => {
  it("exposes select bound to the onSelect callback it was given", async () => {
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [media()] });
    const onSelect = vi.fn();
    const { result } = renderHook(() => useMediaPickerDialog(onSelect, vi.fn()));

    await waitFor(() => expect(result.current.items).not.toBeNull());
    const item = result.current.items![0];
    result.current.select(item);
    expect(onSelect).toHaveBeenCalledWith(item);
  });

  it("calls onCancel when Escape is pressed anywhere in the document", () => {
    vi.spyOn(api, "listMedia").mockReturnValue(new Promise(() => {}));
    const onCancel = vi.fn();
    renderHook(() => useMediaPickerDialog(vi.fn(), onCancel));

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("ignores non-Escape keys", () => {
    vi.spyOn(api, "listMedia").mockReturnValue(new Promise(() => {}));
    const onCancel = vi.fn();
    renderHook(() => useMediaPickerDialog(vi.fn(), onCancel));

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("removes its keydown listener on unmount, so a stray Escape afterward is a no-op", () => {
    vi.spyOn(api, "listMedia").mockReturnValue(new Promise(() => {}));
    const onCancel = vi.fn();
    const { unmount } = renderHook(() => useMediaPickerDialog(vi.fn(), onCancel));

    unmount();
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
