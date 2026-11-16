import { afterEach, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { api } from "@/lib/api";
import { useExternalMcpSharedChoice } from "../ExternalMcpSharedChoice.hooks";

afterEach(() => vi.restoreAllMocks());

const view = { available: true, connections: [{ credentialId: "c1", label: "Work" }], current: null };

it("loads the saved connections for the server", async () => {
  const list = vi.spyOn(api, "listSharedMcpConnections").mockResolvedValue(view);
  const { result } = renderHook(() => useExternalMcpSharedChoice({ serverId: "s1", onChanged: vi.fn() }));
  expect(result.current.view).toBeUndefined();
  await act(async () => { await result.current.load(); });
  expect(list).toHaveBeenCalledWith({ serverId: "s1" });
  expect(result.current.view).toEqual(view);
  expect(result.current.pending).toBe(false);
  expect(result.current.error).toBe("");
});

it("says the saved connections could not be opened in plain words when the load fails", async () => {
  vi.spyOn(api, "listSharedMcpConnections").mockRejectedValue(new Error("offline"));
  const { result } = renderHook(() => useExternalMcpSharedChoice({ serverId: "s1", onChanged: vi.fn() }));
  await act(async () => { await result.current.load(); });
  expect(result.current.error).not.toBe("");
  expect(result.current.view).toBeUndefined();
  expect(result.current.pending).toBe(false);
});

it("grants a saved connection, reloads the list and tells the parent; an empty id does nothing", async () => {
  const use = vi.spyOn(api, "useSharedMcpConnection").mockResolvedValue({ connected: true });
  vi.spyOn(api, "listSharedMcpConnections").mockResolvedValue(view);
  const onChanged = vi.fn();
  const { result } = renderHook(() => useExternalMcpSharedChoice({ serverId: "s1", onChanged }));
  await act(async () => { await result.current.useSaved({ credentialId: "" }); });
  expect(use).not.toHaveBeenCalled();
  await act(async () => { await result.current.useSaved({ credentialId: "c1" }); });
  expect(use).toHaveBeenCalledExactlyOnceWith({ serverId: "s1", credentialId: "c1" });
  expect(result.current.view).toEqual(view);
  expect(onChanged).toHaveBeenCalledTimes(1);
});

it("stops sharing here and switches to the local connection, each reloading and notifying", async () => {
  const stop = vi.spyOn(api, "stopSharedMcpConnection").mockResolvedValue(undefined);
  const local = vi.spyOn(api, "useLocalMcpConnection").mockResolvedValue(undefined);
  const list = vi.spyOn(api, "listSharedMcpConnections").mockResolvedValue(view);
  const onChanged = vi.fn();
  const { result } = renderHook(() => useExternalMcpSharedChoice({ serverId: "s1", onChanged }));
  await act(async () => { await result.current.stopHere(); });
  await act(async () => { await result.current.useLocal(); });
  expect(stop).toHaveBeenCalledWith({ serverId: "s1" });
  expect(local).toHaveBeenCalledWith({ serverId: "s1" });
  expect(list).toHaveBeenCalledTimes(2);
  expect(onChanged).toHaveBeenCalledTimes(2);
});

it("keeps each failure in its own plain-words message and does not notify the parent", async () => {
  const onChanged = vi.fn();
  const { result } = renderHook(() => useExternalMcpSharedChoice({ serverId: "s1", onChanged }));
  vi.spyOn(api, "useSharedMcpConnection").mockRejectedValue("refused");
  await act(async () => { await result.current.useSaved({ credentialId: "c1" }); });
  const granted = result.current.error;
  expect(granted).toMatch(/saved connection/i);
  vi.spyOn(api, "stopSharedMcpConnection").mockRejectedValue("refused");
  await act(async () => { await result.current.stopHere(); });
  const stopped = result.current.error;
  expect(stopped).toMatch(/stopped/i);
  vi.spyOn(api, "useLocalMcpConnection").mockRejectedValue("refused");
  await act(async () => { await result.current.useLocal(); });
  expect(result.current.error).toMatch(/local connection/i);
  expect(new Set([granted, stopped, result.current.error]).size).toBe(3);
  expect(onChanged).not.toHaveBeenCalled();
  expect(result.current.pending).toBe(false);
});
