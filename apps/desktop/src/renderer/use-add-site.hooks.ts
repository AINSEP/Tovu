/**
 * @file "Add Tovu Website" — the header button's state, kept out of `App.tsx` because this repo
 * forbids logic in `.tsx`.
 *
 * The whole hook is three facts (pending, the refusal to show, and the adder itself) over one IPC
 * call, and the only interesting decision in it is what happens to the error text — see
 * {@link useAddSite}.
 *
 * Mirrors `useSiteRescan`'s shape on purpose (same file's neighbour): both are "press a button,
 * get a refreshed project list or a message", and two different shapes for one interaction would
 * make the header's two quiet buttons behave differently for no reason the operator can see.
 */
import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { SiteRecord } from '../contracts/project.js';
import { runnerInventoryBridge } from './runner-api.js';
import { humanSiteError, addedSiteMessage } from './site-shell-policy.js';

/** The refusal shown when the IPC bridge itself is absent — a renderer running outside Electron
 *  (a plain `vite preview`, a test harness). Stated rather than silent: a button that does nothing
 *  at all is indistinguishable from a broken one. */
const NO_BRIDGE_MESSAGE = "This build can't open a folder picker — run the desktop app.";

/** Compatibility with an older preload/main pair that rejected cancellation instead of returning
 * null. A cancellation must stay quiet even while the shell is being upgraded. */
const CANCELLED_MESSAGE = 'No folder was chosen.';

/**
 * Drive the "Add Tovu Website" button.
 *
 * Main's actionable refusal survives, with Electron and Error class prefixes removed.
 * Cancellation resolves with null; a duplicate reports its existing name and opens that tab.
 *
 * @param setProjects the Projects screen's list setter. The new record is PREPENDED rather than
 *   triggering a re-list: `handleAddSite` already returns the record, and a second `listSites`
 *   round trip would let the card appear a poll-interval late.
 * @returns `adding` for the pending state, `addError` for the message to show (`null` when there is
 *   none), `addSite` to invoke, and `clearAddError` for a dismiss affordance.
 * @complexity O(n) in the current project count, for the duplicate check.
 */
export function useAddSite({ setProjects }: { setProjects: Dispatch<SetStateAction<readonly SiteRecord[]>> },
  { onAlreadyTracked }: { onAlreadyTracked?: (id: string) => void } = {},
): {
  adding: boolean;
  addError: string | null;
  addSite: () => Promise<void>;
  clearAddError: () => void;
} {
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const clearAddError = useCallback(() => setAddError(null), []);

  const addSite = useCallback(async () => {
    const bridge = runnerInventoryBridge();
    if (bridge === undefined) {
      setAddError(NO_BRIDGE_MESSAGE);
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const added = await bridge.addSite();
      if (added === null) return;
      setProjects((current) => mergeAddedSite(current, added));
      const message = addedSiteMessage({ added });
      setAddError(message);
      if (message) onAlreadyTracked?.(added.id);
    } catch (error) {
      setAddError(describeAddFailure(error));
    } finally {
      setAdding(false);
    }
  }, [setProjects, onAlreadyTracked]);

  return { adding, addError, addSite, clearAddError };
}

/**
 * Put `added` into the list, replacing the row for the same site rather than appending a second one.
 *
 * The duplicate case is REAL, not defensive: adding a folder that is already tracked succeeds
 * (`addSitePointer` is idempotent) and returns its existing record, so a plain append would show
 * the operator two identical cards for one website until the next poll quietly removed one.
 *
 * Newest first, matching where a freshly added card is most likely to be looked for.
 *
 * @complexity O(n) in the current project count.
 */
function mergeAddedSite(
  current: readonly SiteRecord[],
  added: SiteRecord
): readonly SiteRecord[] {
  return [added, ...current.filter((project) => project.id !== added.id)];
}

/**
 * The message to show for a rejected add — main's own sentence wherever there is one.
 *
 * Electron wraps a main-process rejection, so `error.message` arrives prefixed with
 * `Error: Error invoking remote method '...':`. That prefix is noise to an operator, so it is
 * stripped — but only the prefix: everything after it is main's text, kept intact.
 *
 * @complexity O(n) in the message length.
 */
function describeAddFailure(error: unknown): string | null {
  const raw = error instanceof Error ? error.message : String(error);
  const message = humanSiteError({ error: raw, fallback: "Couldn't add that website." });
  // Their own choice, not a failure to report back at them.
  return message === CANCELLED_MESSAGE ? null : message;
}

export { CANCELLED_MESSAGE, NO_BRIDGE_MESSAGE, describeAddFailure, mergeAddedSite };
