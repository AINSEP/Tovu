import { useRef } from "react";

/**
 * @file `useSerialWrites` — the "run this write only after every write already queued on the
 * same lane has settled" chain, hand-rolled six times across `apps/admin` (2026-09-20 sweep):
 * `use-other-credentials.hooks.ts`'s `writeChainRef`, `use-visitor-credential-form.hooks.ts`'s
 * `writeChainRef`, `use-sites.hooks.ts`'s `activateChainRef`, `use-settings-slice.hooks.ts`'s
 * `saveChain`, `use-external-mcp.hooks.ts`'s keyed `updateChain`, and `use-standing-draft-
 * autosave.hooks.ts`'s `chainRef`. Each one appends a `.then(task, task)`/`.catch(...)` link onto
 * a ref-held tail promise so a second write can never race a first one to the server; none of the
 * six wants a failed write to block later ones (no poisoning), none skips a queued task (no
 * dropping), and two of the six deliberately enqueue a final write from their own unmount cleanup
 * (closing data-loss bugs — see those two files' own docs). This hook is a strict re-spelling of
 * that shared shape, plus an optional `key` for the one call site (`use-external-mcp.hooks.ts`)
 * that needs independent lanes per server row instead of one lane per mounted controller.
 *
 * **What this does NOT do.** It does not cancel, skip, or dedupe. "The newest call wins" is a UI
 * rule, not a transport rule, and stays where it already lives: `useSettlementGeneration`. A call
 * site that wants both — every write reaches the server in order, but only the latest result may
 * paint the UI — composes the two, minting the generation *before* calling `run` (minting inside
 * the task would make every queued call "current" by the time it starts, since by then no newer
 * call exists yet):
 *
 * @example
 * const settlement = useSettlementGeneration();
 * const writes = useSerialWrites();
 * function activate(id: string) {
 *   const generation = settlement.next(); // synchronous, BEFORE run — see above
 *   setBusy(id);
 *   return writes.run(async () => {
 *     try {
 *       const result = await port.write(id);
 *       if (!settlement.isCurrent(generation)) return; // a newer call owns the UI now
 *       setResult(result);
 *     } catch (e) {
 *       if (!settlement.isCurrent(generation)) return;
 *       setError(describeApiError(e));
 *     } finally {
 *       if (settlement.isCurrent(generation)) setBusy(null);
 *     }
 *   });
 * }
 *
 * A task never starts inside the `run` call itself, even on an idle lane — it starts one
 * microtask later, matching every one of the six copies, whose callers all do their synchronous
 * bookkeeping (mint a generation, set a busy flag, reset a sibling error) before calling. A
 * rejected task — or one that throws synchronously — still releases its lane, so the next queued
 * task runs; `run` resolves or rejects with that task's own outcome, never the lane's tail, and
 * the lane's internal bookkeeping does NOT attach a handler to the promise it returns — a
 * discarded, rejecting `run(...)` surfaces as an unhandled rejection instead of silently
 * vanishing, unlike all six copies it replaces. Re-entrant calls on the same lane (a task that
 * calls `run` again without awaiting it) queue correctly; awaiting the inner call from inside the
 * outer one deadlocks by construction, same as any single-lane queue.
 */

export interface SerialWrites {
  /** Queue `task` behind every task already queued on the same lane (default lane when `key` is
   *  omitted). Resolves or rejects with `task`'s own outcome. */
  run<T>(task: () => Promise<T>, options?: { key?: string }): Promise<T>;
}

const DEFAULT_LANE = Symbol("useSerialWrites default lane");
const IDLE: Promise<void> = Promise.resolve();

function createSerialWrites(): SerialWrites {
  // Each lane's tail is the promise the NEXT queued task waits on; a lane is dropped from the
  // map once its own tail settles and nothing newer has replaced it, so a keyed caller (only
  // `use-external-mcp.hooks.ts` today) cannot grow this map without bound.
  const tails = new Map<string | symbol, Promise<void>>();
  return {
    run<T>(task: () => Promise<T>, options?: { key?: string }): Promise<T> {
      const lane = options?.key ?? DEFAULT_LANE;
      const prior = tails.get(lane) ?? IDLE;
      let release!: () => void;
      const tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      tails.set(lane, tail);
      return prior.then(async () => {
        try {
          return await task();
        } finally {
          if (tails.get(lane) === tail) tails.delete(lane);
          release();
        }
      });
    },
  };
}

export function useSerialWrites(): SerialWrites {
  // Stable identity over a mutable ref, same reason as `useSettlementGeneration`: several
  // adopting call sites put this in a `useCallback`/`useMemo` dependency list.
  const ref = useRef<SerialWrites | undefined>(undefined);
  if (!ref.current) ref.current = createSerialWrites();
  return ref.current;
}
