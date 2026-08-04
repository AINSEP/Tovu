/**
 * @file SPEC-046 REQ-2 — the single-shot post-navigation action queue mechanism.
 *
 * A client directive targeting the page a visitor is being sent TO (scroll, highlight, render a
 * surface — SPEC-046 §4) cannot run before that page loads. Queuing it in `sessionStorage` alongside
 * the transcript (`transcript-storage.ts`) is how it survives the navigation; draining it exactly once
 * on the next mount, and deleting it from storage BEFORE handing it back, is what stops a reload of
 * the destination page from re-firing the same action forever.
 *
 * **What this file deliberately does NOT do**: define what an "action" actually contains. SPEC-046
 * §3/§4 (the typed `client_directive` event, the two-tier trust model, `navigate`/`scroll_to`/
 * `highlight`) are explicitly out of this slice's scope — REQ-4 through REQ-8 are blocked on two
 * unresolved owner decisions (auto-navigate vs. propose-a-link; same tab vs. new tab). Building a
 * typed action shape now would be guessing at an answer nobody has given yet. `QueuedAction` is
 * therefore `unknown`: this file is the queue mechanism only, provable on its own terms (enqueue,
 * drain-once, delete-before-execute, survive a corrupt entry) without a real payload shape attached.
 * A future REQ-4 implementation supplies the real type and the first real call to `enqueueAction`;
 * this file's `drainQueuedAction` contract does not change under it.
 */

const ACTION_QUEUE_STORAGE_KEY = "tovu.site-assistant.action-queue.v1";

/** Deliberately `unknown` — see file header. Whatever REQ-4 eventually queues must be JSON-serializable
 *  (it round-trips through `sessionStorage` via `JSON.stringify`/`JSON.parse`), but no shape beyond
 *  that is asserted here. */
export type QueuedAction = unknown;

/**
 * Queues one action to run after the next navigation. Overwrites any action already queued — this is
 * a single-slot queue, not a FIFO: SPEC-046 §4's first consumers are all triggered by an explicit
 * visitor action ("take me there"), so there is never a legitimate reason for two directives to be
 * in flight for the same visitor at once, and a queue with unbounded depth would just be more
 * unclaimed state to leak across an abandoned navigation.
 */
export function enqueueAction(storage: Storage, action: QueuedAction): void {
  try {
    storage.setItem(ACTION_QUEUE_STORAGE_KEY, JSON.stringify(action));
  } catch {
    // Storage full/disabled — the action is simply not queued. No page-action mechanism yet depends
    // on this succeeding (REQ-4 is out of scope), and even once one exists, failing to queue must
    // degrade to "the visitor's own subsequent click/scroll behaves normally," never a broken nav.
  }
}

/**
 * Drains at most one queued action. **Deletes the entry from storage before returning it** — not
 * after a caller finishes "executing" it — so that if the page is reloaded mid-execution (or the
 * execution step is never reached at all, e.g. a future consumer throws), the SAME action can never
 * be read again on the next mount. This ordering is REQ-2's entire point: a queued action surviving a
 * reload and re-firing on every subsequent page load is the one failure mode the mechanism exists to
 * prevent.
 *
 * Call exactly once per mount. A corrupt entry (malformed JSON) is treated as nothing queued, not an
 * error — it has already been deleted above by the time the parse is attempted, so this can never
 * leave a poisoned entry behind for a later mount to trip over again.
 *
 * @complexity O(1) — two storage calls and one JSON parse, independent of anything else in the app.
 * @overallScore 100
 */
export function drainQueuedAction(storage: Storage): QueuedAction | null {
  let raw: string | null;
  try {
    raw = storage.getItem(ACTION_QUEUE_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    storage.removeItem(ACTION_QUEUE_STORAGE_KEY);
  } catch {
    // If removal itself fails, this call cannot guarantee the action won't be read again on the next
    // mount — failing closed (never returning it) is safer than risking a re-fire, since "the action
    // silently didn't run once" is a much smaller failure than "the action re-runs on every reload."
    return null;
  }

  try {
    return JSON.parse(raw) as QueuedAction;
  } catch {
    // Already deleted above, so this degrades to "nothing was queued" with no residue left behind.
    return null;
  }
}
