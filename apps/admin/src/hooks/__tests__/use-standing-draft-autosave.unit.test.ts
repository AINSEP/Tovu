import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useStandingDraftAutosave,
  type StandingDraftAutosaveInput,
  type StandingDraftAutosavePort,
  type StandingDraftAutosaveSnapshot,
} from "../use-standing-draft-autosave.hooks";
import { readStandingDraftLocalBackup } from "../../lib/standing-draft-local-backup";

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
    // The stale-basis local backup below is real `localStorage` under jsdom — shared across every
    // test in this file, so it is wiped here rather than leaking a previous test's parked text.
    localStorage.clear();
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

  /**
   * Stale basis — the server answered `applied: false` (another save moved the row's `version`, so
   * this tab's whole in-memory edit is built on a superseded basis). Before 2026-09-06 the hook
   * threw that flag away: every later tick was refused too, nothing was ever parked, and the
   * operator was told nothing — an hour of typing could evaporate with no banner on reload. Each
   * test below asserts on a request that provably did NOT happen, or on the operator's text still
   * being reachable afterwards; asserting only "putAutosave was called" would pass under the bug.
   */
  it("stops scheduling further autosaves once the server reports applied:false", async () => {
    const port = createFakePort({ putAutosave: vi.fn(async () => ({ applied: false })) });
    const { result } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    act(() => result.current.scheduleAutosave(DOC_DRAFT));
    await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN));
    expect(port.putAutosave).toHaveBeenCalledTimes(1); // the one tick that discovered the stale basis

    // An hour of further typing against that same superseded basis. Every one of these would be
    // refused by the server's version guard, so none of them may be sent at all.
    for (let i = 0; i < 5; i += 1) {
      act(() => result.current.scheduleAutosave({ ...DOC_DRAFT, title: `Kept typing ${i}` }));
      await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN));
    }

    expect(port.putAutosave).toHaveBeenCalledTimes(1);
  });

  it("surfaces staleBasis carrying the refused draft, so the editor can say something true", async () => {
    const port = createFakePort({ putAutosave: vi.fn(async () => ({ applied: false })) });
    const { result } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));
    expect(result.current.staleBasis).toBeNull();

    const typed = { ...DOC_DRAFT, title: "An hour of work" };
    act(() => result.current.scheduleAutosave(typed));
    await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN));

    // The refused text itself is carried, not merely a boolean — losing the operator's work while
    // telling them about a conflict would be worse than the silent drop this fixes.
    expect(result.current.staleBasis).toEqual({ baseVersion: 1, draft: typed });
  });

  it("resumes autosaving on its own once the caller supplies a fresh basis — a reload needs no manual reset", async () => {
    const port = createFakePort({
      putAutosave: vi.fn(async (_id: string, draft: StandingDraftAutosaveInput) => ({ applied: draft.baseVersion !== 1 })),
    });
    const { result } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    act(() => result.current.scheduleAutosave(DOC_DRAFT));
    await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN));
    // Exact, not `.not.toBeNull()` — an absent property is `undefined`, which passes that check
    // while proving nothing about the state this test is here to pin.
    expect(result.current.staleBasis).toEqual({ baseVersion: 1, draft: DOC_DRAFT });

    // The editor reloaded the row and now edits version 2 — the gate must lift by itself.
    const fresh = { ...DOC_DRAFT, baseVersion: 2, title: "After the reload" };
    act(() => result.current.scheduleAutosave(fresh));
    await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN));

    expect(result.current.staleBasis).toBeNull();
    // Read off the mock, not `putAutosaveCalls` — this test supplies its OWN `putAutosave`, which
    // does not feed the fake's recorder.
    expect(port.putAutosave).toHaveBeenCalledTimes(2);
    expect(vi.mocked(port.putAutosave).mock.calls.map(([, draft]) => draft)).toEqual([DOC_DRAFT, fresh]);
  });

  it("keeps the refused text in a per-tab local backup, and offers it as a recoverable draft after a reload the server has nothing parked for", async () => {
    const port = createFakePort({ putAutosave: vi.fn(async () => ({ applied: false })) });
    const typed = { ...DOC_DRAFT, title: "An hour of work" };
    const first = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    act(() => first.result.current.scheduleAutosave(typed));
    await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN));
    first.unmount();

    // The reload. The other tab's real save already cleared the server-side draft, so the mount
    // check finds nothing there — without the local backup this operator gets no banner at all.
    const second = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(second.result.current.recoverableDraft).toMatchObject({ title: "An hour of work", baseVersion: 1 });
  });

  it("clearStandingDraft drops the stale-basis state and the local backup — a real save must not leave a ghost banner behind", async () => {
    const port = createFakePort({ putAutosave: vi.fn(async () => ({ applied: false })) });
    const first = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    act(() => first.result.current.scheduleAutosave(DOC_DRAFT));
    await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN));
    expect(first.result.current.staleBasis).toEqual({ baseVersion: 1, draft: DOC_DRAFT });

    await act(async () => first.result.current.clearStandingDraft());
    expect(first.result.current.staleBasis).toBeNull();
    first.unmount();

    const second = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(second.result.current.recoverableDraft).toBeNull();
  });

  it("clears a local backup the operator discarded on a LATER mount — the gate that wrote it is long gone by then", async () => {
    const port = createFakePort({ putAutosave: vi.fn(async () => ({ applied: false })) });
    const first = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));
    act(() => first.result.current.scheduleAutosave(DOC_DRAFT));
    await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN));
    first.unmount();

    // The reload the operator actually performs. The banner offers the mirrored text; they discard.
    const second = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(second.result.current.recoverableDraft).not.toBeNull();
    await act(async () => second.result.current.clearStandingDraft());
    second.unmount();

    // A discarded draft must stay discarded. Asserting on a THIRD mount, not on `localStorage`
    // directly, because the ghost the operator would actually see is the banner, not the key.
    const third = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(third.result.current.recoverableDraft).toBeNull();
  });

  it("keeps the local backup while the gate lifts — editing on a fresh basis has persisted nothing yet", async () => {
    const port = createFakePort({ putAutosave: vi.fn(async () => ({ applied: false })) });
    const { result, unmount } = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));

    act(() => result.current.scheduleAutosave({ ...DOC_DRAFT, title: "An hour of work" }));
    await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN));
    // The editor reloads the row: the gate lifts and a retry is merely SCHEDULED (timers are not
    // advanced). At this exact instant nothing has been written anywhere — so a version that
    // dropped the mirror alongside the gate has just thrown the operator's only durable copy away,
    // and this asserts on the mirror itself rather than on a later mount, which a refused retry
    // would silently repopulate.
    act(() => result.current.scheduleAutosave({ ...DOC_DRAFT, baseVersion: 2, title: "After the reload" }));

    expect(readStandingDraftLocalBackup("post-1")).toMatchObject({ title: "An hour of work", baseVersion: 1 });
    unmount();
  });

  it("does not carry a stale basis across an entryId change — a gate for one entry must not silence another", async () => {
    const port = createFakePort({
      putAutosave: vi.fn(async (_id: string, _draft: StandingDraftAutosaveInput) => ({ applied: _id === "post-1" ? false : true })),
    });
    const { result, rerender } = renderHook(
      ({ entryId }: { entryId: string }) => useStandingDraftAutosave({ port, entryId, enabled: true }),
      { initialProps: { entryId: "post-1" } }
    );

    act(() => result.current.scheduleAutosave(DOC_DRAFT));
    await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN));
    expect(result.current.staleBasis).toEqual({ baseVersion: 1, draft: DOC_DRAFT });

    // A different entry that happens to be on version 1 too — the overwhelmingly common case.
    rerender({ entryId: "post-2" });
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(result.current.staleBasis).toBeNull();

    act(() => result.current.scheduleAutosave(DOC_DRAFT));
    await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN));
    expect(vi.mocked(port.putAutosave).mock.calls.map(([id]) => id)).toEqual(["post-1", "post-2"]);
  });

  it("prefers the server's parked draft over a local backup when both exist", async () => {
    const port = createFakePort({
      putAutosave: vi.fn(async () => ({ applied: false })),
      getAutosave: vi.fn(async () => ({ autosave: fakeSnapshot({ title: "From the server" }) })),
    });
    const first = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    act(() => first.result.current.scheduleAutosave({ ...DOC_DRAFT, title: "From this tab" }));
    await act(async () => vi.advanceTimersByTimeAsync(IDLE_MS_PLUS_MARGIN));
    first.unmount();

    const second = renderHook(() => useStandingDraftAutosave({ port, entryId: "post-1", enabled: true }));
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(second.result.current.recoverableDraft).toMatchObject({ title: "From the server" });
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
