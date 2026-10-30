import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { usePickedFolder } from "../use-picked-folder.hooks";

/** @file The composer's attached-folders state: read on mount and after each confirmed pick; × removes it on the server. */

it("reads the picked folder on mount and again after a new pick is confirmed", async () => {
  const get = vi.fn().mockResolvedValueOnce({ path: "/Users/la/Desktop/a" }).mockResolvedValueOnce({ path: "/Users/la/Desktop/b" });
  const hook = renderHook(({ confirmedPath }) => usePickedFolder({ confirmedPath }, { get, clear: vi.fn() }), { initialProps: { confirmedPath: null as string | null } });
  await waitFor(() => expect(hook.result.current.folders).toEqual(["/Users/la/Desktop/a"]));
  hook.rerender({ confirmedPath: "/Users/la/Desktop/b" });
  await waitFor(() => expect(hook.result.current.folders).toEqual(["/Users/la/Desktop/b"]));
  expect(get).toHaveBeenCalledTimes(2);
});

it("× removes the folder on the server, and keeps it listed when that fails", async () => {
  const get = vi.fn().mockResolvedValue({ path: "/Users/la/Desktop/a" });
  const clear = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ path: null });
  const hook = renderHook(() => usePickedFolder({ confirmedPath: null }, { get, clear }));
  await waitFor(() => expect(hook.result.current.folders).toEqual(["/Users/la/Desktop/a"]));
  await act(async () => { hook.result.current.remove("/Users/la/Desktop/a"); });
  expect(hook.result.current.folders).toEqual(["/Users/la/Desktop/a"]);
  await act(async () => { hook.result.current.remove("/Users/la/Desktop/a"); });
  expect(clear).toHaveBeenCalledTimes(2);
  expect(hook.result.current.folders).toEqual([]);
});
