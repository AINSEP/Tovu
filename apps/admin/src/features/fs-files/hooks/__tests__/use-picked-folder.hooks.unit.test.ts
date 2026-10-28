import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { usePickedFolder } from "../use-picked-folder.hooks";

/** @file The composer's picked-folder chip state: read on mount and after each confirmed pick; × clears it on the server. */

it("reads the picked folder on mount and again after a new pick is confirmed", async () => {
  const get = vi.fn().mockResolvedValueOnce({ path: "/Users/la/Desktop/a" }).mockResolvedValueOnce({ path: "/Users/la/Desktop/b" });
  const hook = renderHook(({ confirmedPath }) => usePickedFolder({ confirmedPath }, { get, clear: vi.fn() }), { initialProps: { confirmedPath: null as string | null } });
  await waitFor(() => expect(hook.result.current.path).toBe("/Users/la/Desktop/a"));
  hook.rerender({ confirmedPath: "/Users/la/Desktop/b" });
  await waitFor(() => expect(hook.result.current.path).toBe("/Users/la/Desktop/b"));
  expect(get).toHaveBeenCalledTimes(2);
});

it("× clears the folder on the server, and keeps the chip when that fails", async () => {
  const get = vi.fn().mockResolvedValue({ path: "/Users/la/Desktop/a" });
  const clear = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ path: null });
  const hook = renderHook(() => usePickedFolder({ confirmedPath: null }, { get, clear }));
  await waitFor(() => expect(hook.result.current.path).toBe("/Users/la/Desktop/a"));
  await act(async () => { hook.result.current.clear(); });
  expect(hook.result.current.path).toBe("/Users/la/Desktop/a");
  await act(async () => { hook.result.current.clear(); });
  expect(clear).toHaveBeenCalledTimes(2);
  expect(hook.result.current.path).toBeNull();
});
