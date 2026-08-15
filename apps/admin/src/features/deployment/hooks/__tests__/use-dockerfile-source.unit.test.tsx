import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../../lib/fetch-query";
import { useDockerfileSource } from "../use-dockerfile-source.hooks";
import { createFakeDockerfileSourcePort } from "../dockerfile-source-dependencies.hooks";

/**
 * @file `useDockerfileSource` — the Dockerfile tab's read, edit, save, and copy-to-clipboard
 * interaction. Same injected-port shape as `use-deployment-overview.unit.test.tsx`; the clipboard
 * assertions follow `use-edit-media-panel.hooks.ts`'s own `copyHash`/`copyUrl` precedent (stub
 * `navigator.clipboard.writeText`, assert the transient flag flips and resets on a timer).
 *
 * 2026-08-15: gained the "save" describe blocks below for the tab's read-only -> editable change.
 * Pins the property the brief called out explicitly: a successful save updates `snapshot`/`draft`
 * from the mutation's OWN response, with no second `getDockerfileSource()` call — proven directly by
 * counting the fake port's own call, not by inference from the UI.
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
    // The editable draft is seeded from the load, matching the last-saved contents exactly.
    expect(result.current.draft).toBe("FROM node:22\n");
    expect(result.current.isDirty).toBe(false);
    expect(result.current.error).toBeNull();
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("loads the honest 'does not exist' shape without treating it as an error, and seeds an empty draft", async () => {
    const port = createFakeDockerfileSourcePort({ exists: false, contents: null });
    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });

    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());
    expect(result.current.snapshot).toEqual({ exists: false, contents: null });
    expect(result.current.draft).toBe("");
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

describe("useDockerfileSource — draft and dirty tracking", () => {
  it("setDraft updates the draft and flips isDirty once it differs from the loaded contents", async () => {
    const port = createFakeDockerfileSourcePort({ exists: true, contents: "FROM node:22\n" });
    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    act(() => result.current.setDraft("FROM node:22\nRUN echo hi\n"));
    expect(result.current.draft).toBe("FROM node:22\nRUN echo hi\n");
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.setDraft("FROM node:22\n"));
    expect(result.current.isDirty).toBe(false);
  });
});

describe("useDockerfileSource — save", () => {
  it("persists the draft, updates snapshot/draft from the response, and issues no second GET", async () => {
    const getDockerfileSource = vi.fn().mockResolvedValue({ exists: true, contents: "FROM node:22\n" });
    const setDockerfileSource = vi.fn().mockResolvedValue({ exists: true, contents: "FROM node:22\nRUN echo hi\n" });
    const port = { getDockerfileSource, setDockerfileSource };

    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());
    expect(getDockerfileSource).toHaveBeenCalledTimes(1);

    act(() => result.current.setDraft("FROM node:22\nRUN echo hi\n"));
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await result.current.save();
    });

    expect(setDockerfileSource).toHaveBeenCalledWith("FROM node:22\nRUN echo hi\n");
    expect(result.current.snapshot).toEqual({ exists: true, contents: "FROM node:22\nRUN echo hi\n" });
    expect(result.current.draft).toBe("FROM node:22\nRUN echo hi\n");
    expect(result.current.isDirty).toBe(false);
    expect(result.current.saving).toBe(false);
    expect(result.current.saveError).toBeNull();
    // The whole point of setting state from the mutation's own response: no redundant re-read.
    expect(getDockerfileSource).toHaveBeenCalledTimes(1);
  });

  it("creates the file from the 'does not exist' state — snapshot.exists flips true after a successful save", async () => {
    const port = createFakeDockerfileSourcePort({ exists: false, contents: null });
    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    act(() => result.current.setDraft("FROM node:22\n"));
    await act(async () => {
      await result.current.save();
    });

    expect(result.current.snapshot).toEqual({ exists: true, contents: "FROM node:22\n" });
    expect(result.current.draft).toBe("FROM node:22\n");
  });

  it("sets saving true while the write is in flight, then false once it settles", async () => {
    let resolveWrite!: (value: { exists: boolean; contents: string }) => void;
    const port = createFakeDockerfileSourcePort(
      { exists: true, contents: "FROM node:22\n" },
      { setDockerfileSource: () => new Promise((resolve) => (resolveWrite = resolve)) },
    );
    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    let savePromise!: Promise<void>;
    act(() => {
      savePromise = result.current.save();
    });
    await waitFor(() => expect(result.current.saving).toBe(true));

    await act(async () => {
      resolveWrite({ exists: true, contents: "FROM node:22\n" });
      await savePromise;
    });
    expect(result.current.saving).toBe(false);
  });

  it("surfaces a rejected write as a translated, formatted SAVE error — distinct from the load error — and leaves the draft untouched so the operator's edit isn't discarded", async () => {
    const port = createFakeDockerfileSourcePort(
      { exists: true, contents: "FROM node:22\n" },
      { setDockerfileSource: () => Promise.reject(new Error("disk full")) },
    );
    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    act(() => result.current.setDraft("FROM node:22\nRUN echo hi\n"));
    await act(async () => {
      await result.current.save();
    });
    // `useFetchMutation`'s own `error` settles through TanStack's async state machine, one tick
    // after the awaited `mutateAsync` rejection this hook's `save()` already caught — `waitFor`
    // rather than a bare synchronous assertion, same as the load-error test above.
    await waitFor(() => expect(result.current.saveError).not.toBeNull());

    expect(result.current.saveError).toContain("Could not save the Dockerfile");
    expect(result.current.saveError).toContain("disk full");
    expect(result.current.error).toBeNull();
    // The failed write must not have clobbered the in-progress edit.
    expect(result.current.draft).toBe("FROM node:22\nRUN echo hi\n");
    expect(result.current.isDirty).toBe(true);
    expect(result.current.saving).toBe(false);
  });

  it("flips saved true right after a successful save, then false after the reset window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const port = createFakeDockerfileSourcePort({ exists: true, contents: "FROM node:22\n" });
    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    act(() => result.current.setDraft("FROM node:22\nRUN echo hi\n"));
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.saved).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.saved).toBe(false);
  });
});

describe("useDockerfileSource — copy", () => {
  it("writes the current draft to the clipboard and flips copied true, then false after the reset window", async () => {
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

  it("copies the unsaved DRAFT, not the last-saved snapshot, once the operator has edited it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...window.navigator, clipboard: { writeText } });
    const port = createFakeDockerfileSourcePort({ exists: true, contents: "FROM node:22\n" });

    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    act(() => result.current.setDraft("FROM node:22\nRUN echo hi\n"));
    await act(async () => {
      await result.current.copy();
    });
    expect(writeText).toHaveBeenCalledWith("FROM node:22\nRUN echo hi\n");
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

  it("is a no-op for the 'does not exist' shape — draft seeds to an empty string, nothing to copy", async () => {
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
