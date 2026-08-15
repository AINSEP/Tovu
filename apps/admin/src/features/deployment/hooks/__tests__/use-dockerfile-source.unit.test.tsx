import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../../lib/fetch-query";
import { useDockerfileSource } from "../use-dockerfile-source.hooks";
import { createFakeDockerfileSourcePort } from "../dockerfile-source-dependencies.hooks";

/**
 * @file `useDockerfileSource` — the Dockerfile tab's read plus its copy-to-clipboard interaction.
 * Same injected-port shape as `use-deployment-overview.unit.test.tsx`; the clipboard assertions
 * follow `use-edit-media-panel.hooks.ts`'s own `copyHash`/`copyUrl` precedent (stub
 * `navigator.clipboard.writeText`, assert the transient flag flips and resets on a timer).
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const fakeT = (key: string): string => key;
const fakeLocale = "en";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useDockerfileSource — load", () => {
  it("loads an existing Dockerfile's contents from the fake port, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeDockerfileSourcePort({ exists: true, contents: "FROM node:22\n" });

    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });

    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());
    expect(result.current.snapshot).toEqual({ exists: true, contents: "FROM node:22\n" });
    expect(result.current.error).toBeNull();
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("loads the honest 'does not exist' shape without treating it as an error", async () => {
    const port = createFakeDockerfileSourcePort({ exists: false, contents: null });
    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });

    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());
    expect(result.current.snapshot).toEqual({ exists: false, contents: null });
    expect(result.current.error).toBeNull();
  });

  it("surfaces a rejected port as a translated, formatted error message", async () => {
    const port = createFakeDockerfileSourcePort(() => Promise.reject(new Error("disk error")));
    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toContain("Could not load the Dockerfile");
    expect(result.current.error).toContain("disk error");
  });
});

describe("useDockerfileSource — copy", () => {
  it("writes the loaded contents to the clipboard and flips copied true, then false after the reset window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...window.navigator, clipboard: { writeText } });
    const port = createFakeDockerfileSourcePort({ exists: true, contents: "FROM node:22\n" });

    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());
    expect(result.current.copied).toBe(false);

    await act(async () => {
      await result.current.copy();
    });
    expect(writeText).toHaveBeenCalledWith("FROM node:22\n");
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.copied).toBe(false);
  });

  it("is a no-op when there is nothing loaded yet — never calls the clipboard with undefined", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { ...window.navigator, clipboard: { writeText } });
    // A port whose promise never resolves within this test — `snapshot` stays `undefined`.
    const port = createFakeDockerfileSourcePort(() => new Promise(() => {}));

    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });

    await act(async () => {
      await result.current.copy();
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("is a no-op for the 'does not exist' shape — contents is null, not an empty string to copy", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { ...window.navigator, clipboard: { writeText } });
    const port = createFakeDockerfileSourcePort({ exists: false, contents: null });

    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    await act(async () => {
      await result.current.copy();
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("degrades silently when the clipboard write is denied — the source stays visible either way", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("permission denied"));
    vi.stubGlobal("navigator", { ...window.navigator, clipboard: { writeText } });
    const port = createFakeDockerfileSourcePort({ exists: true, contents: "FROM node:22\n" });

    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    await act(async () => {
      await expect(result.current.copy()).resolves.toBeUndefined();
    });
    expect(result.current.copied).toBe(false);
  });
});
