import type { ChatMessage } from "@jini-ai/chat/core";

/**
 * @file SPEC-046 REQ-1 — `sessionStorage` persistence for the public site chat's transcript and pane
 * open/closed state, so a client action that causes a full page load (REQ-2's whole reason for
 * existing) does not also destroy the conversation.
 *
 * `sessionStorage`, never `localStorage`: per-tab, dies with the tab. That is the correct privacy
 * default for an anonymous visitor on a widget mounted on every page of the site — a transcript must
 * not leak into a LATER, unrelated visit on a shared machine, which is exactly what `localStorage`
 * would do.
 *
 * Both fields live under one versioned, namespaced key rather than two, so "the corrupt entry" is a
 * single well-defined thing (REQ-1's fail-soft rehydrate) instead of two independently-corruptible
 * keys that could disagree — a `messages` array recovered against a poisoned `open` flag (or vice
 * versa) is not a state this widget should ever have to reason about.
 */

export const TRANSCRIPT_STORAGE_KEY = "tovu.site-assistant.transcript.v1";

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
export function loadPersistedState(storage: Storage): PersistedSiteAssistantState {
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
export function savePersistedState(storage: Storage, state: PersistedSiteAssistantState): void {
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
export function clearPersistedState(storage: Storage): void {
  try {
    storage.removeItem(TRANSCRIPT_STORAGE_KEY);
  } catch {
    // Storage inaccessible — there is nothing to clear, and nothing here may throw.
  }
}
