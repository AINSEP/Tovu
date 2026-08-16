import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../../lib/api";
import { FetchQueryProvider } from "../../../../lib/fetch-query";
import { useDockerfileSource } from "../use-dockerfile-source.hooks";
import { createFakeDockerfileSourcePort, FAKE_DOCKERFILE_ETAG } from "../dockerfile-source-dependencies.hooks";

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
 *
 * Same day, later: `AdminDockerfileSource` gained a required `etag`, and `save` now sends it back as
 * `ifMatch` (Terra audit finding C5) — every fixture below carries one, and the new "conflict"
 * describe block pins the 412 path: `saveConflict` gets populated (not `saveError` — see
 * `use-dockerfile-source.hooks.ts`'s own header for why those are kept distinct), `draft` survives
 * untouched, and `reloadAfterConflict` refreshes `snapshot`/its etag without touching `draft` either.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const fakeT = (key: string): string => key;
const fakeLocale = "en";

/** The etag `createFakeDockerfileSourcePort`'s caller-supplied snapshot carries in most tests below
 *  — distinct from {@link FAKE_DOCKERFILE_ETAG} (the DEFAULT write-echo's own etag), so a test that
 *  checks which etag ended up where can tell "the loaded value" apart from "the value a save's
 *  default echo produced" instead of one constant doing double duty and masking a wiring mistake. */
const INITIAL_ETAG = '"initial-etag"';
/** Mirrors the real server's `dockerfile.ts` missing-file sentinel shape (`W/"missing"`) — not load-
 *  bearing for these fakes (which never compare etags themselves), but keeps fixtures here
 *  recognizable against the real wire contract instead of an arbitrary unrelated string. */
const MISSING_ETAG = 'W/"missing"';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useDockerfileSource — load", () => {
  it("loads an existing Dockerfile's contents from the fake port, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeDockerfileSourcePort({ exists: true, contents: "FROM node:22\n", etag: INITIAL_ETAG });

    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });

    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());
    expect(result.current.snapshot).toEqual({ exists: true, contents: "FROM node:22\n", etag: INITIAL_ETAG });
    // The editable draft is seeded from the load, matching the last-saved contents exactly.
    expect(result.current.draft).toBe("FROM node:22\n");
    expect(result.current.isDirty).toBe(false);
    expect(result.current.error).toBeNull();
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("loads the honest 'does not exist' shape without treating it as an error, and seeds an empty draft", async () => {
    const port = createFakeDockerfileSourcePort({ exists: false, contents: null, etag: MISSING_ETAG });
    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });

    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());
    expect(result.current.snapshot).toEqual({ exists: false, contents: null, etag: MISSING_ETAG });
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
    const port = createFakeDockerfileSourcePort({ exists: true, contents: "FROM node:22\n", etag: INITIAL_ETAG });
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
    const getDockerfileSource = vi.fn().mockResolvedValue({ exists: true, contents: "FROM node:22\n", etag: INITIAL_ETAG });
    const setDockerfileSource = vi.fn().mockResolvedValue({ exists: true, contents: "FROM node:22\nRUN echo hi\n", etag: '"after-save-etag"' });
    const port = { getDockerfileSource, setDockerfileSource };

    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());
    expect(getDockerfileSource).toHaveBeenCalledTimes(1);

    act(() => result.current.setDraft("FROM node:22\nRUN echo hi\n"));
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await result.current.save();
    });

    // The etag sent as `ifMatch` must be the one THIS hook actually loaded, proving `save()` reads
    // it off `snapshot`, not a hand-carried or default value.
    expect(setDockerfileSource).toHaveBeenCalledWith("FROM node:22\nRUN echo hi\n", INITIAL_ETAG);
    expect(result.current.snapshot).toEqual({ exists: true, contents: "FROM node:22\nRUN echo hi\n", etag: '"after-save-etag"' });
    expect(result.current.draft).toBe("FROM node:22\nRUN echo hi\n");
    expect(result.current.isDirty).toBe(false);
    expect(result.current.saving).toBe(false);
    expect(result.current.saveError).toBeNull();
    expect(result.current.saveConflict).toBeNull();
    // The whole point of setting state from the mutation's own response: no redundant re-read.
    expect(getDockerfileSource).toHaveBeenCalledTimes(1);
  });

  it("creates the file from the 'does not exist' state — snapshot.exists flips true after a successful save", async () => {
    const port = createFakeDockerfileSourcePort({ exists: false, contents: null, etag: MISSING_ETAG });
    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    act(() => result.current.setDraft("FROM node:22\n"));
    await act(async () => {
      await result.current.save();
    });

    // The default fake port's write echo — see `dockerfile-source-dependencies.hooks.ts`.
    expect(result.current.snapshot).toEqual({ exists: true, contents: "FROM node:22\n", etag: FAKE_DOCKERFILE_ETAG });
    expect(result.current.draft).toBe("FROM node:22\n");
  });

  it("sets saving true while the write is in flight, then false once it settles", async () => {
    let resolveWrite!: (value: { exists: boolean; contents: string; etag: string }) => void;
    const port = createFakeDockerfileSourcePort(
      { exists: true, contents: "FROM node:22\n", etag: INITIAL_ETAG },
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
      resolveWrite({ exists: true, contents: "FROM node:22\n", etag: '"after-save-etag"' });
      await savePromise;
    });
    expect(result.current.saving).toBe(false);
  });

  it("does nothing when called before the initial load has resolved — nothing to compare If-Match against yet", async () => {
    const setDockerfileSource = vi.fn();
    // A port whose GET never resolves within this test — `snapshot` stays `undefined` throughout.
    const port = { getDockerfileSource: () => new Promise<never>(() => {}), setDockerfileSource };
    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });

    await act(async () => {
      await result.current.save();
    });
    expect(setDockerfileSource).not.toHaveBeenCalled();
  });

  it("surfaces a rejected write as a translated, formatted SAVE error — distinct from the load error — and leaves the draft untouched so the operator's edit isn't discarded", async () => {
    const port = createFakeDockerfileSourcePort(
      { exists: true, contents: "FROM node:22\n", etag: INITIAL_ETAG },
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
    expect(result.current.saveConflict).toBeNull();
    // The failed write must not have clobbered the in-progress edit.
    expect(result.current.draft).toBe("FROM node:22\nRUN echo hi\n");
    expect(result.current.isDirty).toBe(true);
    expect(result.current.saving).toBe(false);
  });

  it("flips saved true right after a successful save, then false after the reset window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const port = createFakeDockerfileSourcePort({ exists: true, contents: "FROM node:22\n", etag: INITIAL_ETAG });
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

describe("useDockerfileSource — save conflict (412, Terra audit finding C5)", () => {
  /** Builds a 412 rejection shaped exactly like the real transport's — `ApiError` with `status: 412`
   *  and a `body.current` carrying the real current `{exists, contents}` — so this suite proves the
   *  hook's OWN discrimination logic (`err instanceof ApiError && err.status === 412`), not just that
   *  some rejection was thrown. */
  function conflictError(current: { exists: boolean; contents: string | null }): ApiError {
    return new ApiError("the Dockerfile changed on the server", 412, "DOCKERFILE_CONFLICT", { current });
  }

  it("populates saveConflict (not saveError) on a 412, and leaves draft completely untouched", async () => {
    const concurrentContents = "FROM node:22\n# a concurrent human edit\n";
    const port = createFakeDockerfileSourcePort(
      { exists: true, contents: "FROM node:22\n", etag: INITIAL_ETAG },
      { setDockerfileSource: () => Promise.reject(conflictError({ exists: true, contents: concurrentContents })) },
    );
    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    act(() => result.current.setDraft("FROM node:22\nRUN my own edit\n"));
    await act(async () => {
      await result.current.save();
    });

    await waitFor(() => expect(result.current.saveConflict).not.toBeNull());
    expect(result.current.saveConflict).toEqual({ exists: true, contents: concurrentContents });
    // The defining property this brief called out: NOT a generic save error.
    expect(result.current.saveError).toBeNull();
    // The operator's own typing must survive completely untouched.
    expect(result.current.draft).toBe("FROM node:22\nRUN my own edit\n");
    expect(result.current.isDirty).toBe(true);
    expect(result.current.saving).toBe(false);
    // `snapshot` itself is untouched too — only `reloadAfterConflict` (below) is allowed to move it.
    expect(result.current.snapshot).toEqual({ exists: true, contents: "FROM node:22\n", etag: INITIAL_ETAG });
  });

  it("reports exists:false in saveConflict when the concurrent change was a deletion", async () => {
    const port = createFakeDockerfileSourcePort(
      { exists: true, contents: "FROM node:22\n", etag: INITIAL_ETAG },
      { setDockerfileSource: () => Promise.reject(conflictError({ exists: false, contents: null })) },
    );
    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    await act(async () => {
      await result.current.save();
    });
    await waitFor(() => expect(result.current.saveConflict).not.toBeNull());
    expect(result.current.saveConflict).toEqual({ exists: false, contents: null });
  });

  it("reloadAfterConflict refreshes snapshot (and its etag) from a fresh GET, clears saveConflict, and still does not touch draft", async () => {
    const concurrentContents = "FROM node:22\n# a concurrent human edit\n";
    let getCallCount = 0;
    const port = createFakeDockerfileSourcePort(
      () => {
        getCallCount += 1;
        // First GET (the initial load) reports the ORIGINAL contents; every GET after that (i.e.
        // `reloadAfterConflict`'s own) reports what the concurrent writer actually saved — proving
        // `reloadAfterConflict` performs a REAL fresh read rather than reusing the conflict's own
        // cached body.
        return Promise.resolve(
          getCallCount === 1
            ? { exists: true, contents: "FROM node:22\n", etag: INITIAL_ETAG }
            : { exists: true, contents: concurrentContents, etag: '"after-reload-etag"' },
        );
      },
      { setDockerfileSource: () => Promise.reject(conflictError({ exists: true, contents: concurrentContents })) },
    );
    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    act(() => result.current.setDraft("FROM node:22\nRUN my own edit\n"));
    await act(async () => {
      await result.current.save();
    });
    await waitFor(() => expect(result.current.saveConflict).not.toBeNull());

    await act(async () => {
      await result.current.reloadAfterConflict();
    });

    expect(result.current.saveConflict).toBeNull();
    expect(result.current.snapshot).toEqual({ exists: true, contents: concurrentContents, etag: '"after-reload-etag"' });
    // The operator's draft is STILL untouched after the reload — they reconcile it by hand.
    expect(result.current.draft).toBe("FROM node:22\nRUN my own edit\n");
    expect(result.current.isDirty).toBe(true);
    expect(getCallCount).toBe(2);
  });

  it("a save AFTER reloadAfterConflict sends the FRESH etag as ifMatch, not the stale one from before the conflict", async () => {
    const concurrentContents = "FROM node:22\n# a concurrent human edit\n";
    let getCallCount = 0;
    const setDockerfileSource = vi.fn((_contents: string, ifMatch: string) => {
      if (ifMatch === INITIAL_ETAG) return Promise.reject(conflictError({ exists: true, contents: concurrentContents }));
      return Promise.resolve({ exists: true, contents: "FROM node:22\nRUN reconciled\n", etag: '"final-etag"' });
    });
    const port = createFakeDockerfileSourcePort(
      () => {
        getCallCount += 1;
        return Promise.resolve(
          getCallCount === 1
            ? { exists: true, contents: "FROM node:22\n", etag: INITIAL_ETAG }
            : { exists: true, contents: concurrentContents, etag: '"after-reload-etag"' },
        );
      },
      { setDockerfileSource },
    );
    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    act(() => result.current.setDraft("FROM node:22\nRUN reconciled\n"));
    await act(async () => {
      await result.current.save();
    });
    await waitFor(() => expect(result.current.saveConflict).not.toBeNull());

    await act(async () => {
      await result.current.reloadAfterConflict();
    });
    await act(async () => {
      await result.current.save();
    });

    expect(setDockerfileSource).toHaveBeenNthCalledWith(1, "FROM node:22\nRUN reconciled\n", INITIAL_ETAG);
    expect(setDockerfileSource).toHaveBeenNthCalledWith(2, "FROM node:22\nRUN reconciled\n", '"after-reload-etag"');
    expect(result.current.saveConflict).toBeNull();
    expect(result.current.snapshot).toEqual({ exists: true, contents: "FROM node:22\nRUN reconciled\n", etag: '"final-etag"' });
  });

  it("a fresh save() attempt clears a stale saveConflict left over from a previous attempt", async () => {
    let firstAttempt = true;
    const port = createFakeDockerfileSourcePort(
      { exists: true, contents: "FROM node:22\n", etag: INITIAL_ETAG },
      {
        setDockerfileSource: () => {
          if (firstAttempt) {
            firstAttempt = false;
            return Promise.reject(conflictError({ exists: true, contents: "FROM node:22\n# concurrent\n" }));
          }
          return Promise.resolve({ exists: true, contents: "FROM node:22\nRUN two\n", etag: '"second-attempt-etag"' });
        },
      },
    );
    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    await act(async () => {
      await result.current.save();
    });
    await waitFor(() => expect(result.current.saveConflict).not.toBeNull());

    // Retrying WITHOUT reloading first (the fake's second call succeeds regardless of ifMatch) —
    // the point under test is only that starting a new attempt clears the stale banner.
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.saveConflict).toBeNull();
  });
});

describe("useDockerfileSource — copy", () => {
  it("writes the current draft to the clipboard and flips copied true, then false after the reset window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...window.navigator, clipboard: { writeText } });
    const port = createFakeDockerfileSourcePort({ exists: true, contents: "FROM node:22\n", etag: INITIAL_ETAG });

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
    const port = createFakeDockerfileSourcePort({ exists: true, contents: "FROM node:22\n", etag: INITIAL_ETAG });

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
    const port = createFakeDockerfileSourcePort({ exists: false, contents: null, etag: MISSING_ETAG });

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
    const port = createFakeDockerfileSourcePort({ exists: true, contents: "FROM node:22\n", etag: INITIAL_ETAG });

    const { result } = renderHook(() => useDockerfileSource(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    await act(async () => {
      await expect(result.current.copy()).resolves.toBeUndefined();
    });
    expect(result.current.copied).toBe(false);
  });
});
