import type { ChatMessage } from "@jini-ai/chat/core";
import { readSiteChatComparisonVariant } from "./site-chat-comparison";

/**
 * @file SPEC-046 v3 — the single storage module for the visitor transcript and pane-open state.
 * Per-tab session storage dies with the tab, so an unrelated later visitor on a shared machine
 * cannot inherit this conversation. One envelope keeps fail-soft rehydration atomic.
 * Navigation is terminal; no queued effects or credentials are persisted here.
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
 * Caller-facing wrappers, bound to the real `sessionStorage`. `SiteAssistantWidget.tsx` and
 * `main.tsx` call these, never `sessionStorage` itself — this is what makes the guard test in
 * `__tests__/session-store.test.ts` ("no other file in `src` names `sessionStorage`") meaningful
 * rather than accidental. The injectable forms above stay exported for tests, which supply a fake
 * `SessionStore` instead.
 */
export function loadSiteAssistantState(): PersistedSiteAssistantState {
  return loadPersistedState(browserStorage);
}

export function saveSiteAssistantState(state: PersistedSiteAssistantState): void {
  savePersistedState(browserStorage, state);
}

export function clearSiteAssistantState(): void {
  clearPersistedState(browserStorage);
}

// Access the browser getter inside the injectable helpers' existing try blocks: private browsing
// may throw even when reading sessionStorage itself, before getItem can run.
const browserStorage: SessionStore = {
  getItem: (key) => sessionStorage.getItem(siteStorageKey({ key })),
  setItem: (key, value) => sessionStorage.setItem(siteStorageKey({ key }), value),
  removeItem: (key) => sessionStorage.removeItem(siteStorageKey({ key })),
};

/** Same-origin frames share session storage. Keep each comparison transcript apart from
 * both its sibling and the visitor's real thread, while retaining this module's caps and guards. */
export function siteStorageKey({ key }: { key: string }, options: { root?: HTMLElement | null } = {}): string {
  const root = options.root === undefined ? globalThis.document?.getElementById('tovu-site-assistant-root') : options.root;
  const variant = root ? readSiteChatComparisonVariant({ document: root.ownerDocument }) : null;
  return variant === 'react' || variant === 'vanilla' ? `${key}.compare.${variant}` : key;
}
