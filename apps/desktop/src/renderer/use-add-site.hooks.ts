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

/** The refusal shown when the IPC bridge itself is absent — a renderer running outside Electron
 *  (a plain `vite preview`, a test harness). Stated rather than silent: a button that does nothing
 *  at all is indistinguishable from a broken one. */
const NO_BRIDGE_MESSAGE = "This build can't open a folder picker — run the desktop app.";

/** The operator dismissing the folder picker. Main rejects with this exact sentence
 *  (`project-ipc.js`'s `handleAddSite`), and it is the one refusal that is not worth showing:
 *  they know they cancelled. */
const CANCELLED_MESSAGE = 'No folder was chosen.';

/**
 * Drive the "Add Tovu Website" button.
 *
 * **The error text is surfaced VERBATIM, and that is the load-bearing choice here.** Main's
 * refusals already name the fix — "use Create website to make a new site in an empty folder", "if
 * your site lives in a subfolder, point at that subfolder instead", "it may be on an unmounted
 * volume" — and they are written once, in `add-site-pointer.js`, so the CLI, the assistant and this
 * button all say the same thing about the same folder. Paraphrasing here (the way
 * `useSiteRescan` flattens every failure into "Couldn't scan for sites.") would re-create
 * exactly the three-way drift that one shared implementation exists to prevent, and would replace
 * an actionable sentence with a dead end.
 *
 * A cancelled picker is the single exception: it is a refusal, but showing it would report the
 * operator's own decision back to them as an error.
 *
 * @param setProjects the Projects screen's list setter. The new record is PREPENDED rather than
 *   triggering a re-list: `handleAddSite` already returns the record, and a second `listSites`
 *   round trip would let the card appear a poll-interval late.
 * @returns `adding` for the pending state, `addError` for the message to show (`null` when there is
 *   none), `addSite` to invoke, and `clearAddError` for a dismiss affordance.
 * @complexity O(n) in the current project count, for the duplicate check.
 */
export function useAddSite(setProjects: Dispatch<SetStateAction<readonly SiteRecord[]>>): {
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
      setProjects((current) => mergeAddedSite(current, added));
    } catch (error) {
      setAddError(describeAddFailure(error));
    } finally {
      setAdding(false);
    }
  }, [setProjects]);

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
  const message = raw.replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^Error:\s*/, '').trim();
  if (message === '' ) return "Couldn't add that website.";
  // Their own choice, not a failure to report back at them.
  return message === CANCELLED_MESSAGE ? null : message;
}

export { CANCELLED_MESSAGE, NO_BRIDGE_MESSAGE, describeAddFailure, mergeAddedSite };
