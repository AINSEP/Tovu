import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useStandingDraftAutosave,
  type StandingDraftAutosaveInput,
  type StandingDraftAutosavePort,
  type StandingDraftAutosaveSnapshot,
} from "../use-standing-draft-autosave.hooks";

/**
 * @file Standing-draft autosave hook — the load-bearing property under test is the ORDERING
 * guarantee `clearStandingDraft`'s own doc names, not merely "a write eventually happens": a
 * pending (not yet fired) autosave must never fire after a clear, and an ALREADY in-flight one
 * must reach the server before the clear does. A test that only checks "putAutosave was called"
 * would still pass under a version with no ordering guarantee at all — every test below asserts on
 * the actual sequence, or on a call that provably never happened.
 */

const DOC_DRAFT: StandingDraftAutosaveInput = {
  bodyFormat: "doc",
  bodyJson: { type: "doc", content: [] },
  title: "Hello",
  slug: "hello",
  baseVersion: 1,
};

function fakeSnapshot(overrides: Partial<StandingDraftAutosaveSnapshot> = {}): StandingDraftAutosaveSnapshot {
  return {
    bodyFormat: "doc",
    bodyJson: { type: "doc", content: [] },
    title: "Hello",
    slug: "hello",
    baseVersion: 1,
    savedAt: "2026-09-06T00:00:00.000Z",
    savedByPrincipalId: "user-local",
    ...overrides,
  };
}

function createFakePort(overrides: Partial<StandingDraftAutosavePort> = {}): StandingDraftAutosavePort & {
  putAutosaveCalls: StandingDraftAutosaveInput[];
  discardAutosaveCalls: number;
} {
  const putAutosaveCalls: StandingDraftAutosaveInput[] = [];
  let discardAutosaveCalls = 0;
  return {
    getAutosave: vi.fn(async () => ({ autosave: null })),
    putAutosave: vi.fn(async (_id: string, draft: StandingDraftAutosaveInput) => {
      putAutosaveCalls.push(draft);
      return { applied: true };
    }),
    discardAutosave: vi.fn(async () => {
      discardAutosaveCalls += 1;
      return { ok: true };
    }),
    ...overrides,
    get putAutosaveCalls() {
      return putAutosaveCalls;
    },
    get discardAutosaveCalls() {
      return discardAutosaveCalls;
    },
  };
}

describe("useStandingDraftAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("checks for a recoverable draft exactly once on mount, and never auto-applies it", async () => {
    const port = createFakePort({ getAutosave: vi.fn(async () => ({ autosave: fakeSnapshot() })) });
    const { result } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(result.current.recoverableDraft).toEqual(fakeSnapshot());
    expect(port.getAutosave).toHaveBeenCalledTimes(1);
    expect(port.getAutosave).toHaveBeenCalledWith("post-1");
    // Nothing calls putAutosave/discardAutosave just from a recoverable draft existing — recovery
    // is inert until the caller explicitly acts on it.
    expect(port.putAutosave).not.toHaveBeenCalled();
    expect(port.discardAutosave).not.toHaveBeenCalled();
  });

  it("does not check for a recoverable draft when disabled or before an entryId exists", () => {
    const port = createFakePort();
    renderHook(() => useStandingDraftAutosave({ port, entryId: null, enabled: true }));
    renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: false }));
    expect(port.getAutosave).not.toHaveBeenCalled();
  });

  it("debounces: several scheduleAutosave calls inside the idle window produce exactly one PUT, after the idle delay from the LAST call", async () => {
    const port = createFakePort();
    const { result } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    act(() => result.current.scheduleAutosave(DOC_DRAFT));
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    act(() => result.current.scheduleAutosave(DOC_DRAFT)); // resets the idle window
    await act(async () => vi.advanceTimersByTimeAsync(2999));
    expect(port.putAutosave).not.toHaveBeenCalled(); // still inside the reset window

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(port.putAutosave).toHaveBeenCalledTimes(1);
  });

  it("fires once the 15s hard ceiling is reached even under continuous typing, without waiting for a further idle gap", async () => {
    const port = createFakePort();
    const { result } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    // A keystroke every 2s, well inside the 3s idle window each time, so the debounce alone would
    // never fire — only the 15s ceiling should force a PUT.
    for (let i = 0; i < 8; i += 1) {
      act(() => result.current.scheduleAutosave(DOC_DRAFT));
      await act(async () => vi.advanceTimersByTimeAsync(2000));
    }
    expect(port.putAutosave).toHaveBeenCalled();
  });

  it("clearStandingDraft cancels a still-pending (not yet fired) autosave — the timer never fires at all", async () => {
    const port = createFakePort();
    const { result } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    act(() => result.current.scheduleAutosave(DOC_DRAFT));
    await act(async () => result.current.clearStandingDraft());
    await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN));

    expect(port.putAutosave).not.toHaveBeenCalled();
    expect(port.discardAutosave).toHaveBeenCalledTimes(1);
  });

  it("clearStandingDraft waits for an ALREADY in-flight autosave to reach the server before discarding — the exact race the feature exists to prevent", async () => {
    let resolvePut!: () => void;
    const putOrder: string[] = [];
    const discardOrder: string[] = [];
    const port = createFakePort({
      putAutosave: vi.fn(async () => {
        putOrder.push("start");
        await new Promise<void>((resolve) => {
          resolvePut = resolve;
        });
        putOrder.push("end");
        return { applied: true };
      }),
      discardAutosave: vi.fn(async () => {
        discardOrder.push("start");
        return { ok: true };
      }),
    });
    const { result } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    act(() => result.current.scheduleAutosave(DOC_DRAFT));
    await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN)); // the autosave PUT is now in flight
    expect(putOrder).toEqual(["start"]);
    expect(port.discardAutosave).not.toHaveBeenCalled();

    const clearPromise = result.current.clearStandingDraft();
    // Give the microtask queue a chance to run anything that ISN'T waiting on the in-flight PUT —
    // discardAutosave must still not have run, because it is queued behind the PUT, not racing it.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(port.discardAutosave).not.toHaveBeenCalled();

    resolvePut();
    await act(async () => clearPromise);

    expect(putOrder).toEqual(["start", "end"]);
    expect(discardOrder).toEqual(["start"]);
    expect(port.discardAutosave).toHaveBeenCalledTimes(1);
  });

  it("dismissRecoverable clears local state without telling the server", async () => {
    const port = createFakePort({ getAutosave: vi.fn(async () => ({ autosave: fakeSnapshot() })) });
    const { result } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(result.current.recoverableDraft).not.toBeNull();

    act(() => result.current.dismissRecoverable());

    expect(result.current.recoverableDraft).toBeNull();
    expect(port.discardAutosave).not.toHaveBeenCalled();
  });

  /**
   * The "don't lose the last seconds of typing" half of the cadence. The debounce means there is
   * always a window (up to `IDLE_DEBOUNCE_MS`) in which the operator's newest edit exists ONLY in
   * React state — if the editor unmounts or the tab goes away inside that window and the pending
   * tick is merely CANCELLED, that work is gone. Proven in a real browser on 2026-09-06: typed
   * into the Pages editor, clicked the in-app "Pages" link one second later, and no PUT was ever
   * issued (`autosave_json` stayed NULL). Every test below asserts the draft actually REACHED the
   * port, not just that some timer was cleared.
   */
  it("flushes a pending autosave on unmount instead of cancelling it — the in-app-navigation case", async () => {
    const port = createFakePort();
    const { result, unmount } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    act(() => result.current.scheduleAutosave(DOC_DRAFT));
    // Unmount INSIDE the idle window, before the debounce could ever have fired on its own.
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(port.putAutosaveCalls).toEqual([DOC_DRAFT]);
  });

  it("flushes a pending autosave on pagehide — the tab-close / reload case", async () => {
    const port = createFakePort();
    const { result } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    act(() => result.current.scheduleAutosave(DOC_DRAFT));
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(port.putAutosaveCalls).toEqual([DOC_DRAFT]);
  });

  it("flushes a pending autosave when the document becomes hidden — the tab-switch / app-background case", async () => {
    const port = createFakePort();
    const { result } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    act(() => result.current.scheduleAutosave(DOC_DRAFT));
    const restore = hideDocument();
    try {
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(port.putAutosaveCalls).toEqual([DOC_DRAFT]);
    } finally {
      restore();
    }
  });

  it("does NOT flush on a visibilitychange that leaves the document visible", async () => {
    const port = createFakePort();
    const { result } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    act(() => result.current.scheduleAutosave(DOC_DRAFT));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange")); // jsdom default: "visible"
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(port.putAutosave).not.toHaveBeenCalled();
  });

  it("flushes a pending autosave when the window loses focus — the switched-to-another-app case", async () => {
    const port = createFakePort();
    const { result } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    act(() => result.current.scheduleAutosave(DOC_DRAFT));
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(port.putAutosaveCalls).toEqual([DOC_DRAFT]);
  });

  it("a flush writes the NEWEST scheduled draft, not the first one of the debounce window", async () => {
    const port = createFakePort();
    const newest: StandingDraftAutosaveInput = { ...DOC_DRAFT, title: "Newest" };
    const { result } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    act(() => result.current.scheduleAutosave(DOC_DRAFT));
    act(() => result.current.scheduleAutosave({ ...DOC_DRAFT, title: "Middle" }));
    act(() => result.current.scheduleAutosave(newest));
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(port.putAutosaveCalls).toEqual([newest]);
  });

  it("a flush fires exactly ONE write even when several exit events land, and the debounce never fires a second one afterwards", async () => {
    const port = createFakePort();
    const { result } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    act(() => result.current.scheduleAutosave(DOC_DRAFT));
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("pagehide"));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN));

    expect(port.putAutosaveCalls).toHaveLength(1);
  });

  it("a flush after clearStandingDraft writes NOTHING — a real Save must never be undone by an exit event", async () => {
    const port = createFakePort();
    const { result, unmount } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    act(() => result.current.scheduleAutosave(DOC_DRAFT));
    await act(async () => result.current.clearStandingDraft()); // the real Save landed
    // Every exit route the flush is wired to, after the clear — none may resurrect the draft.
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("pagehide"));
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN));

    expect(port.putAutosave).not.toHaveBeenCalled();
    expect(port.discardAutosaveCalls).toBe(1);
  });

  it("nothing pending means an exit event is a no-op — no empty or stale write on every tab switch", async () => {
    const port = createFakePort();
    renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      window.dispatchEvent(new Event("blur"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(port.putAutosave).not.toHaveBeenCalled();
  });

  it("a failed autosave PUT does not permanently wedge the chain — the next tick still reaches the server", async () => {
    const port = createFakePort({
      putAutosave: vi
        .fn()
        .mockRejectedValueOnce(new Error("network blip"))
        .mockResolvedValue({ applied: true }),
    });
    const { result } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    act(() => result.current.scheduleAutosave(DOC_DRAFT));
    await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN));
    expect(port.putAutosave).toHaveBeenCalledTimes(1);

    act(() => result.current.scheduleAutosave(DOC_DRAFT));
    await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN));
    expect(port.putAutosave).toHaveBeenCalledTimes(2);
  });
});

/** One millisecond past the hook's own `IDLE_DEBOUNCE_MS` — kept local to the test (not imported)
 *  so this suite pins observable behavior, not the module's internal constant. */
const IDLE_MS_PLUS_MARGIN = 3001;

/** Forces `document.visibilityState` to `"hidden"` for one assertion — jsdom hard-codes it to
 *  `"visible"` and offers no setter, so the property is redefined and restored around the test
 *  rather than mutated globally. Returns the restore function. */
function hideDocument(): () => void {
  const original = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  return () => {
    delete (document as unknown as Record<string, unknown>).visibilityState;
    if (original) Object.defineProperty(Document.prototype, "visibilityState", original);
  };
}
