import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getImportHandoffPort, type ImportHandoffPort } from "../import-handoff-port";
import { useDesktopImport } from "../hooks/use-desktop-import.hooks";

/**
 * @file Inside the desktop app the web admin can't make a site, so "From a live website" hands off
 * to the app's own Import tab (owner, 2026-11-10) through `window.tovuImport`, which the desktop's
 * admin preload exposes. Its presence is the capability signal, as with `tovuFiles`.
 */

const t = (key: string): string => key;

function port(open: ImportHandoffPort["open"] = vi.fn(async () => ({ opened: true }))): ImportHandoffPort {
  return { open };
}

describe("getImportHandoffPort", () => {
  it("is the desktop's bridge when present, null in a plain browser", () => {
    const bridge = port();
    expect(getImportHandoffPort({ tovuImport: bridge } as unknown as Window)).toBe(bridge);
    expect(getImportHandoffPort({} as Window)).toBeNull();
    expect(getImportHandoffPort(undefined)).toBeNull();
  });
});

describe("useDesktopImport", () => {
  it("is unavailable without the desktop bridge, so a hosted install keeps its own message", () => {
    const { result } = renderHook(() => useDesktopImport({ t }, { port: null }));
    expect(result.current.available).toBe(false);
  });

  it("asks the desktop app to open Import with the typed address, or with none", async () => {
    const open = vi.fn(async () => ({ opened: true }));
    const { result } = renderHook(() => useDesktopImport({ t }, { port: port(open) }));
    expect(result.current.available).toBe(true);
    await act(async () => { await result.current.open("  https://example.com/about  "); });
    await act(async () => { await result.current.open(""); });
    expect(open.mock.calls).toEqual([[{ address: "https://example.com/about" }], [{}]]);
    expect(result.current.error).toBeNull();
    expect(result.current.opening).toBe(false);
  });

  it("says in plain words when the app has no Import tab to open", async () => {
    const { result } = renderHook(() => useDesktopImport({ t }, { port: port(async () => ({ opened: false })) }));
    await act(async () => { await result.current.open("https://example.com"); });
    expect(result.current.error).toBe("Couldn't open Tovu's Import tab. Open Tovu's home window, then try again.");
  });

  it("shows a refused hand-off's reason, pasteable, and clears it on the next try", async () => {
    let refuse = true;
    const open = vi.fn(async () => {
      if (refuse) throw new Error("Error invoking remote method 'tovu:import:open': Error: This page isn't part of Tovu.");
      return { opened: true };
    });
    const { result } = renderHook(() => useDesktopImport({ t }, { port: port(open) }));
    await act(async () => { await result.current.open("https://example.com"); });
    expect(result.current.error).toBe("Couldn't open Tovu's Import tab: Error invoking remote method 'tovu:import:open': Error: This page isn't part of Tovu.");
    refuse = false;
    await act(async () => { await result.current.open("https://example.com"); });
    expect(result.current.error).toBeNull();
  });

  it("is busy while the hand-off is in flight and ignores a second press", async () => {
    let finish!: (value: { opened: boolean }) => void;
    const open = vi.fn(() => new Promise<{ opened: boolean }>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useDesktopImport({ t }, { port: port(open) }));
    let first!: Promise<void>;
    act(() => { first = result.current.open("https://example.com"); });
    expect(result.current.opening).toBe(true);
    await act(async () => { await result.current.open("https://example.com"); });
    expect(open).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ opened: true }); await first; });
    expect(result.current.opening).toBe(false);
  });
});
