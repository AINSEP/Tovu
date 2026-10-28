import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { ApiError } from "../../../../lib/api";
import { useNativeFolderPicker } from "../use-native-folder-picker.hooks";

/**
 * @file The composer folder button's logic: shown only once the server confirms it can open a folder
 * dialog on this machine, one pick at a time, a cancel is a no-op, and a failure hides the button.
 */

function setup(deps: Parameters<typeof useNativeFolderPicker>[1]) {
  const onPicked = vi.fn();
  const onFailed = vi.fn();
  const hook = renderHook(() => useNativeFolderPicker({ onPicked, onFailed }, deps));
  return { ...hook, onPicked, onFailed };
}

it("stays hidden until the server confirms, and hidden for good when it refuses", async () => {
  const shown = setup({ probe: async () => ({ available: true }), pick: vi.fn() });
  expect(shown.result.current.available).toBe(false);
  await waitFor(() => expect(shown.result.current.available).toBe(true));

  const refused = setup({ probe: async () => { throw new ApiError("not found", 404); }, pick: vi.fn() });
  await act(async () => { await Promise.resolve(); });
  expect(refused.result.current.available).toBe(false);
});

it("hands a picked path on, and treats a cancel as nothing at all", async () => {
  const pick = vi.fn().mockResolvedValueOnce({ path: "/Users/la/My Project" }).mockResolvedValueOnce({ path: null });
  const { result, onPicked, onFailed } = setup({ probe: async () => ({ available: true }), pick });
  await waitFor(() => expect(result.current.available).toBe(true));
  await act(async () => { result.current.pickFolder(); });
  expect(onPicked).toHaveBeenCalledWith("/Users/la/My Project");
  await act(async () => { result.current.pickFolder(); });
  expect(onPicked).toHaveBeenCalledOnce();
  expect(onFailed).not.toHaveBeenCalled();
  expect(result.current.available).toBe(true);
});

it("ignores a second click while the dialog is open", async () => {
  let release!: (value: { path: string | null }) => void;
  const pick = vi.fn(() => new Promise<{ path: string | null }>((resolve) => { release = resolve; }));
  const { result, onPicked } = setup({ probe: async () => ({ available: true }), pick });
  await waitFor(() => expect(result.current.available).toBe(true));
  act(() => { result.current.pickFolder(); });
  expect(result.current.picking).toBe(true);
  act(() => { result.current.pickFolder(); });
  expect(pick).toHaveBeenCalledOnce();
  await act(async () => { release({ path: "/a" }); });
  expect(result.current.picking).toBe(false);
  expect(onPicked).toHaveBeenCalledWith("/a");
});

it("a failed dialog hides the button and reports it; a busy answer (another tab) does neither", async () => {
  const pick = vi.fn().mockRejectedValueOnce(new ApiError("busy", 409)).mockRejectedValueOnce(new ApiError("picker-failed", 500));
  const { result, onFailed } = setup({ probe: async () => ({ available: true }), pick });
  await waitFor(() => expect(result.current.available).toBe(true));
  await act(async () => { result.current.pickFolder(); });
  expect([result.current.available, onFailed.mock.calls.length]).toEqual([true, 0]);
  await act(async () => { result.current.pickFolder(); });
  expect([result.current.available, onFailed.mock.calls.length]).toEqual([false, 1]);
});
