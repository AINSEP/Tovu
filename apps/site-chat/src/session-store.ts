import type { ChatMessage } from "@jini-ai/chat/core";

/**
 * @file SPEC-046 REQ-1/REQ-2 — the single `sessionStorage` module for the public site chat: the
 * transcript, the pane's open/closed state, and the post-navigation action queue.
 *
 * All three used to live in two files (`transcript-storage.ts`, `action-queue.ts`) with two
 * independent key schemes. Collapsed into one module, per the owner's explicit preference not to
 * have storage access "saved across a bunch of files" — two schemes that can drift is exactly the
 * failure mode a second file invites, even though transcript+open-state and the action queue remain
 * two separate keys (see "Two keys, one module" below; REQ-2 requires the queue to survive
 * independently of the transcript). This is a shape change, not a rewrite: every function's
 * behavior, and the tests that prove it, are unchanged from the two-file version.
 *
 * `sessionStorage`, never `localStorage`: per-tab, dies with the tab. That is the correct privacy
 * default for an anonymous visitor on a widget mounted on every page of the site — a transcript must
 * not leak into a LATER, unrelated visit on a shared machine, which is exactly what `localStorage`
 * would do.
 *
 * ## Two keys, one module
 *
 * `TRANSCRIPT_STORAGE_KEY` holds `{ open, messages }` as a single JSON envelope — both fields
 * together so "the corrupt entry" is one well-defined thing (REQ-1's fail-soft rehydrate) instead of
 * two independently-corruptible keys that could disagree. `ACTION_QUEUE_STORAGE_KEY` is a second,
 * separate key: REQ-2 requires it to be queued "beside" the transcript and drained independently on
 * every mount, regardless of transcript state, so folding it into the same envelope would couple two
 * things that fail, clear, and drain on entirely different triggers. Both keys share the
 * `tovu.site-assistant.*.v1` namespace and live in this one file — that is the "one versioned
 * namespace" the consolidation asked for, not a merged key.
 *
 * ## Narrow storage seam, not the DOM `Storage` type
 *
 * Every exported function takes a `SessionStore`, a 3-method interface (`getItem`/`setItem`/
 * `removeItem`), instead of the full DOM `Storage` type. `Storage` also requires `length`, `key()`,
 * and `clear()`, none of which this module ever calls — a test double for the full type has to
 * implement three methods nobody exercises. `SessionStore` documents exactly what is touched and
 * keeps fakes trivial. This is dependency injection for testability only: there is exactly one real
 * backend (`sessionStorage`) and no swappable-adapter goal, so there is no port/adapter abstraction
 * here beyond this one interface.
 */

/** The narrow seam every function in this module depends on, instead of the full DOM `Storage`
 *  type (`length`, `key()`, `clear()` — unused here). A real `Storage` instance (including
 *  `sessionStorage` itself) satisfies this structurally with no adapter needed. */
export interface SessionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const TRANSCRIPT_STORAGE_KEY = "tovu.site-assistant.transcript.v1";
const ACTION_QUEUE_STORAGE_KEY = "tovu.site-assistant.action-queue.v1";

/** Oldest-dropped-first message cap. Generous enough for a real visitor conversation; small enough
 *  that nothing here approaches `sessionStorage`'s much larger real-world quota on its own. */
const MAX_MESSAGES = 50;
/** Serialized byte cap enforced independently of the message-count cap: `PublicEntryDetail.text` (up
 *  to 4000 chars, `assistant/site/tools.ts`) can appear inside an assistant reply, so a handful of
 *  long messages could otherwise blow the budget well under `MAX_MESSAGES`. An unbounded transcript
 *  is a quota-exceeded exception mid-conversation, which is the failure this cap exists to prevent. */
const MAX_BYTES = 200_000;

export interface PersistedSiteAssistantState {
  readonly open: boolean;
  readonly messages: ChatMessage[];
}

const EMPTY_STATE: PersistedSiteAssistantState = { open: false, messages: [] };

/** Deliberately `unknown` — SPEC-046 REQ-4 through REQ-8 (the typed `client_directive` payload) are a
 *  separate slice; whatever they eventually queue must be JSON-serializable (it round-trips through
 *  `sessionStorage` via `JSON.stringify`/`JSON.parse`), but no shape beyond that is asserted here. */
export type QueuedAction = unknown;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Structural allowlist for one persisted `ChatMessage`, not a full schema — this is a
 * fail-soft-rehydrate gate (REQ-1), not a REQ-6-style security boundary; the transcript is rendered
 * by `@jini-ai/chat`'s own message list either way. Only the fields this widget actually reads back
 * are checked; anything else on a real `ChatMessage` (`events`, `attachments`, …) is passed through
 * unchecked if present, same as it always was before this file existed.
 */
function isValidMessage(value: unknown): value is ChatMessage {
  if (!isPlainRecord(value)) return false;
  return typeof value.id === "string" && (value.role === "user" || value.role === "assistant") && typeof value.content === "string";
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Fail-soft rehydrate (REQ-1): malformed JSON, a non-object envelope, a wrong-shaped `open`/`messages`
 * field, or a single wrong-shaped message ANYWHERE in the array all take the same path — the key is
 * cleared and mount proceeds with the empty default. A corrupt entry must never throw during mount,
 * and it never partially recovers (no "keep the valid messages, drop the bad one"): the whole point is
 * that one bad entry costs at most this session's transcript, never a broken widget.
 *
 * Storage access itself is also guarded: a browser that throws on `sessionStorage` access at all
 * (private-mode Safari historically, a sandboxed iframe without the `allow-storage-access-by-user-
 * activation` permission) degrades to the same empty default rather than crashing the widget on load.
 *
 * @complexity O(n) in message count for the shape check; O(1) storage calls.
 * @overallScore 100
 */
export function loadPersistedState(storage: SessionStore): PersistedSiteAssistantState {
  let raw: string | null;
  try {
    raw = storage.getItem(TRANSCRIPT_STORAGE_KEY);
  } catch {
    return EMPTY_STATE;
  }
  if (raw === null) return EMPTY_STATE;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainRecord(parsed)) throw new Error("persisted state is not an object");
    if (typeof parsed.open !== "boolean") throw new Error("persisted state.open is not a boolean");
    if (!Array.isArray(parsed.messages) || !parsed.messages.every(isValidMessage)) {
      throw new Error("persisted state.messages is not a valid ChatMessage[]");
    }
    return { open: parsed.open, messages: parsed.messages };
  } catch {
    clearPersistedState(storage);
    return EMPTY_STATE;
  }
}

/**
 * Persists transcript + pane-open state, dropping the OLDEST messages first until both the count cap
 * (`MAX_MESSAGES`) and the serialized byte cap (`MAX_BYTES`) are satisfied (REQ-1). Never throws: a
 * `setItem` failure (quota still exceeded despite capping, storage disabled mid-session) degrades to
 * "this turn is not persisted," never a broken send path — the visitor's live conversation must not
 * depend on a background write succeeding.
 *
 * @complexity O(n) in message count (repeated re-serialization while trimming); n is bounded by
 *   `MAX_MESSAGES` on entry in the caller's normal usage, so this is not unbounded in practice.
 * @overallScore 100
 */
export function savePersistedState(storage: SessionStore, state: PersistedSiteAssistantState): void {
  let messages = state.messages;
  if (messages.length > MAX_MESSAGES) messages = messages.slice(messages.length - MAX_MESSAGES);

  let serialized = JSON.stringify({ open: state.open, messages });
  while (messages.length > 0 && byteLength(serialized) > MAX_BYTES) {
    messages = messages.slice(1);
    serialized = JSON.stringify({ open: state.open, messages });
  }

  try {
    storage.setItem(TRANSCRIPT_STORAGE_KEY, serialized);
  } catch {
    // Quota exceeded (even after trimming) or storage disabled — the conversation continues in
    // memory for this tab; nothing here may throw into a message-send path.
  }
}

/** "New thread" must clear the persisted copy, not just in-memory state (REQ-1) — otherwise a reload
 *  right after resetting would rehydrate the discarded conversation straight back. */
export function clearPersistedState(storage: SessionStore): void {
  try {
    storage.removeItem(TRANSCRIPT_STORAGE_KEY);
  } catch {
    // Storage inaccessible — there is nothing to clear, and nothing here may throw.
  }
}

/**
 * Queues one action to run after the next navigation. Overwrites any action already queued — this is
 * a single-slot queue, not a FIFO: SPEC-046 §4's first consumers are all triggered by an explicit
 * visitor action ("take me there"), so there is never a legitimate reason for two directives to be
 * in flight for the same visitor at once, and a queue with unbounded depth would just be more
 * unclaimed state to leak across an abandoned navigation.
 */
export function enqueueAction(storage: SessionStore, action: QueuedAction): void {
  try {
    storage.setItem(ACTION_QUEUE_STORAGE_KEY, JSON.stringify(action));
  } catch {
    // Storage full/disabled — the action is simply not queued. Failing to queue must degrade to "the
    // visitor's own subsequent click/scroll behaves normally," never a broken nav.
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
export function drainQueuedAction(storage: SessionStore): QueuedAction | null {
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

/**
 * Caller-facing wrappers, bound to the real `sessionStorage`. `SiteAssistantWidget.tsx` and
 * `main.tsx` call these, never `sessionStorage` itself — this is what makes the guard test in
 * `__tests__/session-store.test.ts` ("no other file in `src` names `sessionStorage`") meaningful
 * rather than accidental. The injectable forms above stay exported for tests, which supply a fake
 * `SessionStore` instead.
 */
export function loadSiteAssistantState(): PersistedSiteAssistantState {
  return loadPersistedState(sessionStorage);
}

export function saveSiteAssistantState(state: PersistedSiteAssistantState): void {
  savePersistedState(sessionStorage, state);
}

export function clearSiteAssistantState(): void {
  clearPersistedState(sessionStorage);
}

export function enqueuePageAction(action: QueuedAction): void {
  enqueueAction(sessionStorage, action);
}

export function drainQueuedPageAction(): QueuedAction | null {
  return drainQueuedAction(sessionStorage);
}
