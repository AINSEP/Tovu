// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SAVE_DEBOUNCE_MS, mergeSaveStates, useSettingsSlice, type SaveState } from "../use-settings-slice.hooks";

/**
 * @file `useSettingsSlice` — the load/debounce/save lifecycle shared by every
 * settings-dialog tab. An external audit found two distinct data-loss bugs here
 * (see the source file's own header); this suite specifically pins both, plus
 * `mergeSaveStates`' precedence and the diff-base (`persisted`) semantics that
 * make the rest of it correct.
 *
 * 1. `saveTicket` — only the NEWEST save may write `saveState`. Without it, an
 *    older save that happens to settle after a newer one has already been
 *    scheduled paints a stale status (e.g. "Saved") over the newer save's real,
 *    still-pending outcome.
 * 2. `hasUnsavedEdits` — unmount must FLUSH a pending debounced edit (fire the
 *    save) rather than just clearing the timer and dropping it.
 */

afterEach(() => {
  vi.useRealTimers();
});

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("initial load", () => {
  it("starts with value=null, then resolves to the loaded value", async () => {
    let resolveLoad: ((v: string) => void) | undefined;
    const load = vi.fn(() => new Promise<string>((resolve) => (resolveLoad = resolve)));
    const { result } = renderHook(() => useSettingsSlice({ load, save: vi.fn(), defaultValue: "default" }));

    expect(result.current.value).toBeNull();
    expect(result.current.loadError).toBeNull();

    await act(async () => {
      resolveLoad?.("loaded value");
      await Promise.resolve();
    });
    expect(result.current.value).toBe("loaded value");
  });

  it("falls back to defaultValue and sets loadError when load rejects", async () => {
    const load = vi.fn(() => Promise.reject(new Error("network down")));
    const { result } = renderHook(() => useSettingsSlice({ load, save: vi.fn(), defaultValue: "default" }));

    await settle();
    expect(result.current.value).toBe("default");
    expect(result.current.loadError).toBe("network down");
  });

  it("stringifies a non-Error rejection", async () => {
    const load = vi.fn(() => Promise.reject("just a string"));
    const { result } = renderHook(() => useSettingsSlice({ load, save: vi.fn(), defaultValue: "default" }));
    await settle();
    expect(result.current.loadError).toBe("just a string");
  });

  it("does not touch state after unmount once a slow load finally settles", async () => {
    let resolveLoad: ((v: string) => void) | undefined;
    const load = vi.fn(() => new Promise<string>((resolve) => (resolveLoad = resolve)));
    const { unmount } = renderHook(() => useSettingsSlice({ load, save: vi.fn(), defaultValue: "default" }));

    unmount();
    // Resolving after unmount must not throw or trigger a React
    // setState-after-unmount warning; nothing else to assert on (the
    // component is gone), so this test's job is just "does not throw".
    await expect(
      act(async () => {
        resolveLoad?.("late");
        await Promise.resolve();
      }),
    ).resolves.toBeUndefined();
  });

  it("does not touch state after unmount once a slow load finally REJECTS either", async () => {
    // Same guard, the other branch of the load effect's settle handler.
    let rejectLoad: ((e: unknown) => void) | undefined;
    const load = vi.fn(() => new Promise<string>((_resolve, reject) => (rejectLoad = reject)));
    const { unmount } = renderHook(() => useSettingsSlice({ load, save: vi.fn(), defaultValue: "default" }));

    unmount();
    await expect(
      act(async () => {
        rejectLoad?.(new Error("too late"));
        await Promise.resolve();
      }),
    ).resolves.toBeUndefined();
  });
});

describe("onChange debouncing", () => {
  it("does not save until SAVE_DEBOUNCE_MS has elapsed", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => ["k"]);
    const { result } = renderHook(() => useSettingsSlice({ load: () => Promise.resolve("v0"), save, defaultValue: "default" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.onChange("v1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 1);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("resets the timer on every edit — rapid edits produce exactly one save, with the LATEST value", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => ["k"]);
    const { result } = renderHook(() => useSettingsSlice({ load: () => Promise.resolve("v0"), save, defaultValue: "default" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.onChange("v1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 100);
    });
    act(() => result.current.onChange("v2"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 100);
    });
    // Still short of a full debounce window since the LAST edit — the first
    // edit's timer must have been cancelled, or this would already have fired.
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("v2", "v0");
  });

  it("moves saveState idle -> saving -> saved, and reports idle (not saved) when nothing was actually written", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => [] as readonly string[]);
    const { result } = renderHook(() => useSettingsSlice({ load: () => Promise.resolve("v0"), save, defaultValue: "default" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.saveState).toEqual({ status: "idle" });

    act(() => result.current.onChange("v1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(result.current.saveState).toEqual({ status: "idle" });
  });

  it("reports saved when the save actually wrote something", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => ["k"]);
    const { result } = renderHook(() => useSettingsSlice({ load: () => Promise.resolve("v0"), save, defaultValue: "default" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.onChange("v1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(result.current.saveState).toEqual({ status: "saved" });
  });

  it("reports an error, carrying the message, when save rejects", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => {
      throw new Error("write failed");
    });
    const { result } = renderHook(() => useSettingsSlice({ load: () => Promise.resolve("v0"), save, defaultValue: "default" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.onChange("v1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(result.current.saveState).toEqual({ status: "error", message: "write failed" });
  });

  it("stringifies a non-Error rejection from save too", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "just a string";
    });
    const { result } = renderHook(() => useSettingsSlice({ load: () => Promise.resolve("v0"), save, defaultValue: "default" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.onChange("v1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(result.current.saveState).toEqual({ status: "error", message: "just a string" });
  });
});

describe("diff base (persisted) semantics", () => {
  it("advances the diff base only on a SUCCESSFUL save", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (next: string) => (next === "v1" ? ["k"] : ["k"]));
    const { result } = renderHook(() => useSettingsSlice({ load: () => Promise.resolve("v0"), save, defaultValue: "default" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.onChange("v1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(save).toHaveBeenLastCalledWith("v1", "v0");

    act(() => result.current.onChange("v2"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    // Base moved to v1 because the first save succeeded.
    expect(save).toHaveBeenLastCalledWith("v2", "v1");
  });

  it("does NOT advance the diff base after a FAILED save, so the next save re-attempts against the old base", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (next: string) => {
      if (next === "v1") throw new Error("boom");
      return ["k"];
    });
    const { result } = renderHook(() => useSettingsSlice({ load: () => Promise.resolve("v0"), save, defaultValue: "default" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.onChange("v1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(result.current.saveState).toEqual({ status: "error", message: "boom" });

    act(() => result.current.onChange("v2"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    // Base is still v0 — v1's failed write never advanced it.
    expect(save).toHaveBeenLastCalledWith("v2", "v0");
  });
});

describe("saveTicket — a stale save must not paint over a newer save's outcome", () => {
  it("an earlier save resolving success AFTER a newer save has been scheduled must not flash 'saved'", async () => {
    vi.useFakeTimers();
    let releaseV1: (() => void) | undefined;
    const gateV1 = new Promise<void>((resolve) => (releaseV1 = resolve));
    let releaseV2: (() => void) | undefined;
    const gateV2 = new Promise<void>((resolve) => (releaseV2 = resolve));

    const save = vi.fn(async (next: string) => {
      if (next === "v1") {
        await gateV1;
        return ["k"];
      }
      if (next === "v2") {
        await gateV2;
        throw new Error("v2 failed");
      }
      return [];
    });

    const { result } = renderHook(() => useSettingsSlice({ load: () => Promise.resolve("v0"), save, defaultValue: "default" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Edit 1: its debounce fires, its save call starts and blocks on gateV1.
    act(() => result.current.onChange("v1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(result.current.saveState).toEqual({ status: "saving" });

    // Edit 2: its debounce ALSO fires (ticket becomes newest) while v1's save
    // is still in flight. v2's own save call is chained behind v1's and has
    // not started yet.
    act(() => result.current.onChange("v2"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(save).toHaveBeenCalledTimes(1); // v2's save() has not been called yet — still queued
    expect(result.current.saveState).toEqual({ status: "saving" });

    // v1 now resolves (successfully). Without the ticket guard this would
    // paint "saved" here — a stale claim, since v2's edit is not saved yet
    // and is about to fail.
    await act(async () => {
      releaseV1?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.saveState).toEqual({ status: "saving" });
    expect(save).toHaveBeenCalledTimes(2); // v2's save() has now started

    // v2 now fails. This IS the current ticket, so it is the one allowed to
    // write status.
    await act(async () => {
      releaseV2?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.saveState).toEqual({ status: "error", message: "v2 failed" });
  });

  it("an earlier save resolving FAILURE after a newer save was scheduled must not flash 'error' over the newer save's success", async () => {
    vi.useFakeTimers();
    let releaseV1: (() => void) | undefined;
    const gateV1 = new Promise<void>((resolve) => (releaseV1 = resolve));
    let releaseV2: (() => void) | undefined;
    const gateV2 = new Promise<void>((resolve) => (releaseV2 = resolve));

    const save = vi.fn(async (next: string) => {
      if (next === "v1") {
        await gateV1;
        throw new Error("v1 failed");
      }
      if (next === "v2") {
        await gateV2;
        return ["k"];
      }
      return [];
    });

    const { result } = renderHook(() => useSettingsSlice({ load: () => Promise.resolve("v0"), save, defaultValue: "default" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.onChange("v1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    act(() => result.current.onChange("v2"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });

    // v1 fails, but it is no longer the current ticket — must not surface as an error.
    await act(async () => {
      releaseV1?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.saveState).toEqual({ status: "saving" });

    // v2 succeeds and IS the current ticket.
    await act(async () => {
      releaseV2?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.saveState).toEqual({ status: "saved" });
  });

  it("a same-value re-edit while a save is in flight still leaves a queued newer ticket that must not be papered over", async () => {
    // Isolates the success-path ticket check from the `hasUnsavedEdits` guard
    // next to it: re-editing to the IDENTICAL value clears `hasUnsavedEdits`
    // (latest.current === target holds), so that guard alone would let this
    // through — only the ticket check still knows a second, distinct save is
    // queued and has not run yet.
    vi.useFakeTimers();
    let releaseV1: (() => void) | undefined;
    const gateV1 = new Promise<void>((resolve) => (releaseV1 = resolve));
    let releaseV2: (() => void) | undefined;
    const gateV2 = new Promise<void>((resolve) => (releaseV2 = resolve));
    let callCount = 0;
    const save = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        await gateV1;
        return ["k"];
      }
      await gateV2;
      return ["k"];
    });

    const { result } = renderHook(() => useSettingsSlice({ load: () => Promise.resolve("v0"), save, defaultValue: "default" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.onChange("v1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    // Re-edit to the SAME value while the first save is still in flight.
    act(() => result.current.onChange("v1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(save).toHaveBeenCalledTimes(1); // second save call still queued behind the first

    await act(async () => {
      releaseV1?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    // The first save just succeeded and, since the re-edit was the same
    // value, `hasUnsavedEdits` is now false — but a second, distinct save
    // call is already running. Status must stay 'saving', not flash 'saved'.
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.saveState).toEqual({ status: "saving" });

    await act(async () => {
      releaseV2?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.saveState).toEqual({ status: "saved" });
  });

  it("an edit made WHILE a save is in flight keeps hasUnsavedEdits true after that save succeeds, and stays in 'saving'", async () => {
    vi.useFakeTimers();
    let releaseV1: (() => void) | undefined;
    const gateV1 = new Promise<void>((resolve) => (releaseV1 = resolve));
    const save = vi.fn(async (next: string) => {
      if (next === "v1") {
        await gateV1;
        return ["k"];
      }
      return ["k"];
    });

    const { result } = renderHook(() => useSettingsSlice({ load: () => Promise.resolve("v0"), save, defaultValue: "default" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.onChange("v1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    // Edit made while v1's save is still in flight — no new debounce fired yet.
    act(() => result.current.onChange("v2"));

    await act(async () => {
      releaseV1?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    // v1 succeeded, but latest.current ('v2') !== target ('v1'), so this must
    // stay 'saving' rather than falsely claiming 'saved' for the unsaved v2 edit.
    expect(result.current.saveState).toEqual({ status: "saving" });

    // v2's own debounce now fires and saves against the base v1 left behind.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(save).toHaveBeenLastCalledWith("v2", "v1");
    expect(result.current.saveState).toEqual({ status: "saved" });
  });
});

describe("hasUnsavedEdits — unmount flushes a pending debounced edit instead of dropping it", () => {
  it("flushes the pending edit on unmount when the debounce timer had not fired yet", async () => {
    const save = vi.fn(async () => ["k"]);
    const { result, unmount } = renderHook(() => useSettingsSlice({ load: () => Promise.resolve("v0"), save, defaultValue: "default" }));
    await settle();

    act(() => result.current.onChange("edited but never saved"));
    expect(save).not.toHaveBeenCalled();

    unmount();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledWith("edited but never saved", "v0");
  });

  it("does not re-flush on unmount once the pending edit has already been saved", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => ["k"]);
    const { result, unmount } = renderHook(() => useSettingsSlice({ load: () => Promise.resolve("v0"), save, defaultValue: "default" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.onChange("saved already"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(save).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // No second call — the earlier save already committed this exact edit,
    // so hasUnsavedEdits was correctly cleared and there is nothing to flush.
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flushes a revert made WHILE a save was in flight, diffing against the base that save left behind", async () => {
    // The audit finding both auditors reported independently. Edit A->B, its
    // save starts; the operator reverts B->A and navigates away before the
    // second debounce fires. The flush is correctly CHAINED behind the in-flight
    // save, but if it captures its diff base when it is QUEUED rather than when
    // it RUNS, it diffs A against the pre-save base A, computes "unchanged", and
    // silently drops the revert — the store keeps B forever.
    let releaseFirst: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => (releaseFirst = resolve));
    const save = vi.fn(async (next: string) => {
      if (next === "B") await gate;
      return ["k"];
    });

    const { result, unmount } = renderHook(() =>
      useSettingsSlice({ load: () => Promise.resolve("A"), save, defaultValue: "default" }),
    );
    await settle();

    // Edit A->B and let its debounce fire; the save blocks on the gate.
    act(() => result.current.onChange("B"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SAVE_DEBOUNCE_MS + 10));
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith("B", "A");

    // Revert B->A while that save is still in flight, then unmount before the
    // revert's own debounce fires.
    act(() => result.current.onChange("A"));
    unmount();

    await act(async () => {
      releaseFirst?.();
      await settle();
      await settle();
    });

    // By the time the flush runs, the first save has committed, so the base is
    // B. Diffing the revert against B is what actually writes A back.
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("A", "B");
  });

  it("does nothing on unmount when no edit was ever made", async () => {
    const save = vi.fn(async () => ["k"]);
    const { unmount } = renderHook(() => useSettingsSlice({ load: () => Promise.resolve("v0"), save, defaultValue: "default" }));
    await settle();
    unmount();
    await settle();
    expect(save).not.toHaveBeenCalled();
  });

  it("swallows a rejection from the fire-and-forget unmount flush without throwing", async () => {
    const save = vi.fn(async () => {
      throw new Error("flush failed");
    });
    const { result, unmount } = renderHook(() => useSettingsSlice({ load: () => Promise.resolve("v0"), save, defaultValue: "default" }));
    await settle();

    act(() => result.current.onChange("edited"));
    expect(() => unmount()).not.toThrow();
    await expect(
      act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      }),
    ).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledWith("edited", "v0");
  });
});

describe("refresh — external notification re-reads the persisted value", () => {
  /**
   * @file Pins the mechanism behind the 2026-08-05 autosave key-wipe defect: `refresh()` fires on
   * ANY out-of-band notification (`subscribeToSettingsRefresh` — a same-tab echo of this slice's OWN
   * write over the settings-changed SSE feed, another tab, another operator), and by default it
   * REPLACES `value` outright with whatever `load()` returns. That is correct for every field
   * `save()`/`load()` actually round-trip, and wrong for a field they deliberately never touch (the
   * Execution slice's `byok.apiKey` — see `execution-settings.ts`'s `reconcileExecutionConfigRefresh`):
   * a same-tab echo of the slice's OWN save arrives to find no pending timer and no unsaved edit
   * (the save already settled), passes every guard, and overwrites a typed-but-not-yet-explicitly-
   * saved value with the reload's empty one. `reconcileRefresh` is the fix; the last two cases below
   * demonstrate the bug it closes and the fix closing it, side by side, against the identical
   * sequence of edits.
   */
  it("replaces value with the reload by default when no reconcileRefresh is supplied", async () => {
    const load = vi.fn(async () => "v0");
    const { result } = renderHook(() => useSettingsSlice({ load, save: vi.fn(), defaultValue: "default" }));
    await settle();
    expect(result.current.value).toBe("v0");

    load.mockResolvedValueOnce("v0-from-elsewhere");
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.value).toBe("v0-from-elsewhere");
  });

  it("refuses to refresh while an edit is unsaved, matching the doc's data-loss guard", async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => "v0");
    const save = vi.fn(async () => ["k"]);
    const { result } = renderHook(() => useSettingsSlice({ load, save, defaultValue: "default" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.onChange("typed but not yet saved"));
    load.mockResolvedValueOnce("v0-from-elsewhere");
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.value).toBe("typed but not yet saved");
  });

  it("without reconcileRefresh, a reload arriving right after a settled save WIPES a field save() never persists — the bug reconcileRefresh exists to close", async () => {
    vi.useFakeTimers();
    type Form = { field: string; secret: string };
    // `load` never returns `secret` — the write-only-server-store shape `loadExecutionConfig` has
    // for `byok.apiKey`.
    const load = vi.fn(async (): Promise<Form> => ({ field: "server-field", secret: "" }));
    const save = vi.fn(async () => ["field"]);

    const { result } = renderHook(() => useSettingsSlice<Form>({ load, save, defaultValue: { field: "", secret: "" } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Operator types a secret AND changes `field` inside the same debounce window — mirrors typing
    // an API key alongside a model change on the real Execution tab.
    act(() => result.current.onChange({ field: "operator-field", secret: "typed-secret" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(save).toHaveBeenCalledTimes(1);

    // The settled edit is fully saved and nothing is pending, so refresh()'s unsaved-edit guards do
    // not block it — exactly the state a same-tab SSE echo of the save above arrives to find.
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.value).toEqual({ field: "server-field", secret: "" });
  });

  it("with reconcileRefresh supplied, the identical sequence preserves the operator's unsaved secret instead of wiping it", async () => {
    vi.useFakeTimers();
    type Form = { field: string; secret: string };
    const load = vi.fn(async (): Promise<Form> => ({ field: "server-field", secret: "" }));
    const save = vi.fn(async () => ["field"]);
    const reconcileRefresh = vi.fn((current: Form, loaded: Form): Form => ({ ...loaded, secret: current.secret }));

    const { result } = renderHook(() =>
      useSettingsSlice<Form>({ load, save, defaultValue: { field: "", secret: "" }, reconcileRefresh }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => result.current.onChange({ field: "operator-field", secret: "typed-secret" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });

    expect(reconcileRefresh).toHaveBeenCalledWith(
      { field: "operator-field", secret: "typed-secret" },
      { field: "server-field", secret: "" },
    );
    // The reload's own field wins (server truth for everything reconcileRefresh doesn't override) —
    // only the never-round-tripped secret survives instead of being wiped to "".
    expect(result.current.value).toEqual({ field: "server-field", secret: "typed-secret" });
  });

  it("does not let a stale-commit reload through reconcileRefresh either — the existing commits guard still applies", async () => {
    vi.useFakeTimers();
    type Form = { field: string; secret: string };
    let resolveLoad: ((v: Form) => void) | undefined;
    const load = vi
      .fn()
      .mockResolvedValueOnce({ field: "v0", secret: "" })
      .mockImplementationOnce(() => new Promise<Form>((resolve) => (resolveLoad = resolve)));
    const save = vi.fn(async () => ["field"]);
    const reconcileRefresh = vi.fn((current: Form, loaded: Form): Form => ({ ...loaded, secret: current.secret }));

    const { result } = renderHook(() =>
      useSettingsSlice<Form>({ load, save, defaultValue: { field: "", secret: "" }, reconcileRefresh }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const refreshPromise = result.current.refresh();

    // A save commits WHILE the refresh's own load() is in flight.
    act(() => result.current.onChange({ field: "v1", secret: "typed-secret" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveLoad?.({ field: "stale-reload", secret: "" });
      await refreshPromise;
    });

    // The stale reload must be discarded entirely — reconcileRefresh must not even be consulted for
    // a response that predates a write that landed while it was in flight.
    expect(reconcileRefresh).not.toHaveBeenCalled();
    expect(result.current.value).toEqual({ field: "v1", secret: "typed-secret" });
  });
});

describe("mergeSaveStates", () => {
  const idle: SaveState = { status: "idle" };
  const saving: SaveState = { status: "saving" };
  const saved: SaveState = { status: "saved" };
  const errorA: SaveState = { status: "error", message: "A failed" };
  const errorB: SaveState = { status: "error", message: "B failed" };

  it("is idle for an empty list and for all-idle", () => {
    expect(mergeSaveStates([])).toEqual(idle);
    expect(mergeSaveStates([idle, idle])).toEqual(idle);
  });

  it("prefers saved over idle", () => {
    expect(mergeSaveStates([idle, saved])).toEqual(saved);
  });

  it("prefers saving over saved and idle", () => {
    expect(mergeSaveStates([saved, saving, idle])).toEqual(saving);
  });

  it("prefers error over saving, saved, and idle", () => {
    expect(mergeSaveStates([saved, saving, idle, errorA])).toEqual(errorA);
    expect(mergeSaveStates([errorA, saving])).toEqual(errorA);
    expect(mergeSaveStates([saved, errorA])).toEqual(errorA);
  });

  it("returns the FIRST error when multiple are present, not the last", () => {
    expect(mergeSaveStates([errorA, errorB])).toEqual(errorA);
    expect(mergeSaveStates([errorB, errorA])).toEqual(errorB);
  });
});
