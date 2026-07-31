import { useCallback, useEffect, useRef, useState } from "react";

/**
 * @file One settings-dialog tab's load/edit/debounced-save lifecycle,
 * generic over the tab's own config type.
 *
 * This was `SettingsUi.tsx`'s inline machinery when exactly one tab (Execution
 * mode) was mounted. It is extracted rather than copied because the logic is
 * subtle out of proportion to its size — a `gpt-5.6-terra` audit found two
 * distinct data-loss bugs in it (see `saveTicket` and `hasUnsavedEdits` below),
 * and every one of those hazards is identical for every tab. Duplicating it
 * per tab would mean re-introducing both bugs three more times, and fixing
 * them in three more places.
 *
 * Each mounted tab owns one instance. They are independent by construction:
 * separate debounce timers, separate save chains, separate diff bases. The
 * only shared surface is the merged status the page chrome renders, which
 * `SettingsUi.tsx` derives.
 */

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

/** Debounce for text fields: tabs are controlled and fire on every keystroke,
 *  and each ledger write is an append-only revision. Without this, typing into
 *  a textarea would write one revision per character. */
export const SAVE_DEBOUNCE_MS = 600;

export interface SettingsSliceOptions<T> {
  /** Reads the persisted value. A rejection surfaces as `loadError` and the
   *  slice falls back to `defaultValue` — an unreadable setting shows defaults
   *  with a visible warning rather than blocking the whole dialog. */
  load: () => Promise<T>;
  /** Writes whatever changed between `next` and `previous`, returning the keys
   *  actually written (an empty array means "nothing to do", which the status
   *  indicator renders as idle rather than a misleading "Saved"). */
  save: (next: T, previous: T) => Promise<readonly string[]>;
  defaultValue: T;
}

export interface SettingsSlice<T> {
  /** `null` until the initial load settles — the caller renders a loading state. */
  value: T | null;
  loadError: string | null;
  saveState: SaveState;
  onChange: (next: T) => void;
}

/**
 * @complexity O(1) per edit — one debounce timer reset plus one link appended
 * to the save chain.
 */
export function useSettingsSlice<T>(options: SettingsSliceOptions<T>): SettingsSlice<T> {
  const { defaultValue } = options;
  const [value, setValue] = useState<T | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  /** `load`/`save` are usually inline arrows at the call site, so a new
   *  identity arrives on every render. Holding them in a ref keeps the effect
   *  and callback below from re-running (and re-loading, and dropping pending
   *  timers) once per render. */
  const io = useRef(options);
  io.current = options;

  /** Last value known to be persisted — the diff base handed to `save`. */
  const persisted = useRef<T>(defaultValue);

  /** The newest value the operator has produced, saved or not. A queued save
   *  writes THIS rather than whatever was current when it was scheduled, so a
   *  save that waited behind another still persists the latest state instead
   *  of resurrecting an intermediate one. */
  const latest = useRef<T>(defaultValue);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Saves run strictly one at a time, chained off this promise.
   *
   * The debounce alone does NOT prevent overlap: it only cancels a save that
   * has not STARTED. Once one is in flight, the next edit schedules a fresh
   * timer that can fire while the first is still running, and then two saves
   * race — their per-key writes interleave (so the ledger can end on the older
   * value), and both diff against the same `persisted` base, which the slower
   * one then overwrites on completion. That leaves the diff base claiming a
   * value was persisted that never was, so the next edit skips writing the
   * fields it thinks are already saved.
   */
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  /** Monotonic ticket, so only the newest save may write the status
   *  indicator. Without it a slow earlier save resolving last would paint
   *  "Saved" over a newer save's error, or vice versa. */
  const saveTicket = useRef(0);

  /**
   * True whenever `latest` has moved ahead of `persisted` — i.e. the operator
   * has edited something no save has committed yet.
   *
   * The ticket alone does NOT cover this. A ticket is only taken when a
   * DEBOUNCE TIMER FIRES, so an edit made while an earlier save is still in
   * flight has no ticket yet: the in-flight save still owns the newest one,
   * completes, and paints "Saved" over changes that are not saved at all. If
   * the operator then navigates away, unmount clears the pending timer and
   * those edits are gone — with the UI's last word having been "Saved".
   */
  const hasUnsavedEdits = useRef(false);

  useEffect(() => {
    let alive = true;
    io.current
      .load()
      .then((loaded) => {
        if (!alive) return;
        persisted.current = loaded;
        latest.current = loaded;
        setValue(loaded);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setLoadError(error instanceof Error ? error.message : String(error));
        setValue(defaultValue);
      });
    return () => {
      alive = false;
    };
    // `defaultValue` is a module-level constant at every call site; re-running
    // this on a new identity would re-issue the load and clobber live edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On unmount, don't just drop a debounced edit — run it. Cancelling the
  // timer silently discards whatever the operator typed in the last 600ms.
  useEffect(
    () => () => {
      if (!timer.current) return;
      clearTimeout(timer.current);
      if (!hasUnsavedEdits.current) return;
      const target = latest.current;
      const base = persisted.current;
      // Fire-and-forget: the component is going away, so there is no status
      // left to paint. The write itself still has to happen.
      saveChain.current = saveChain.current.then(() =>
        io.current.save(target, base).then(
          () => {},
          () => {},
        ),
      );
    },
    [],
  );

  const onChange = useCallback((next: T) => {
    setValue(next);
    latest.current = next;
    hasUnsavedEdits.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const ticket = ++saveTicket.current;
      setSaveState({ status: "saving" });
      saveChain.current = saveChain.current.then(async () => {
        // Read both the target and the diff base at RUN time, not at schedule
        // time: by the time this link runs, an earlier save may have already
        // advanced `persisted`, and the operator may have edited further.
        const target = latest.current;
        try {
          const written = await io.current.save(target, persisted.current);
          persisted.current = target;
          // Only clear the flag if nothing was edited WHILE this save ran.
          if (latest.current === target) hasUnsavedEdits.current = false;
          if (saveTicket.current !== ticket) return;
          // A newer edit is already queued behind this one, so "Saved" would
          // be a claim about state that is not saved. Stay in "saving".
          if (hasUnsavedEdits.current) return;
          setSaveState(written.length > 0 ? { status: "saved" } : { status: "idle" });
        } catch (error: unknown) {
          // `persisted` is deliberately NOT advanced on failure, so the next
          // save re-attempts the fields this one could not write.
          if (saveTicket.current !== ticket) return;
          setSaveState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }, SAVE_DEBOUNCE_MS);
  }, []);

  return { value, loadError, saveState, onChange };
}

/**
 * Collapses several slices' save states into the single one the page chrome
 * renders.
 *
 * Precedence is error > saving > saved > idle, and it is deliberate: an error
 * is the only state the operator must act on, so it must not be hidden by
 * another tab's cheerful "Saved". "Saving" outranks "saved" for the same
 * reason in miniature — while anything is still in flight, claiming everything
 * is saved is false.
 */
export function mergeSaveStates(states: readonly SaveState[]): SaveState {
  const failed = states.find((state) => state.status === "error");
  if (failed) return failed;
  if (states.some((state) => state.status === "saving")) return { status: "saving" };
  if (states.some((state) => state.status === "saved")) return { status: "saved" };
  return { status: "idle" };
}
