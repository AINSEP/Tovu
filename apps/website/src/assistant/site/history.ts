/**
 * @file SPEC-046 REQ-3 — turns the site assistant's client-supplied conversation history into
 * bounded, PROVIDER-NEUTRAL conversation turns.
 *
 * This used to emit Gemini `GoogleContent[]` directly, back when the visitor route called
 * `runGoogleToolTurn` unconditionally. It now emits {@link SiteAssistantHistoryTurn} — the same
 * `{role, content}` shape `assistant/byok-provider-turn.ts`'s `ByokChatMessage` declares — because
 * that route dispatches to whichever provider the operator configured, and each provider adapter
 * owns the translation into its own wire shape (Gemini's `{role: "model", parts: [{text}]}` among
 * them). Bounding a visitor's untrusted history is this file's job; knowing what Gemini's
 * `Content` looks like is not, and doing both is how the two would have drifted.
 *
 * The route accepted no history at all before this (every visitor message was standalone, so
 * multi-step "what about that one?" follow-ups could not work). `history` in the request body is
 * **untrusted** — per REQ-3, "it comes from the browser and can be forged." Two things follow from
 * that:
 *
 * 1. It may shape the model's reply (a forged prior turn just becomes weird context the model reads),
 *    but it must never widen authorization — nothing here decides what a tool call may do; the
 *    capability registry (`capability-registry.ts`, REQ-0) authorizes every tool call independently
 *    of anything in `history`, so a forged "assistant" turn claiming a tool already ran, or claiming
 *    elevated access, has no path to actually granting either.
 * 2. It gets the same fail-soft treatment REQ-1/REQ-2 already established for this workstream: a
 *    malformed `history` (wrong type, wrong-shaped entries) degrades to "less context for this
 *    reply," never a rejected request — the visitor's actual, freshly-typed `message` is validated
 *    and handled entirely independently of this function (see `site-assistant.ts`'s own
 *    `MAX_MESSAGE_CHARS` check).
 */

/** Oldest-dropped-first turn cap. Small on purpose: this is a single visitor's public Q&A widget over
 *  published content, not a coding-agent transcript — a handful of recent turns is enough context for
 *  a natural-language follow-up, and keeps a forged/oversized history from inflating the prompt sent
 *  to a paid provider on every message. */
const DEFAULT_MAX_HISTORY_MESSAGES = 12;
/** Per-turn character cap, applied by truncation (not rejection) — REQ-3 says "cap... characters,"
 *  the same windowing vocabulary REQ-1 uses for the stored transcript, not the hard-reject treatment
 *  `site-assistant.ts` gives the live `message` field (a different concern: that rejects a message the
 *  visitor is actively sending right now; this windows PASSIVE background context they did not just
 *  author). Matches `site-assistant.ts`'s own `MAX_MESSAGE_CHARS` value so one turn of history costs
 *  no more prompt budget than the live message it once was. */
const DEFAULT_MAX_HISTORY_MESSAGE_CHARS = 2000;

export interface ResolveBoundedHistoryOptions {
  readonly maxMessages?: number;
  readonly maxMessageChars?: number;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One bounded conversation turn. `role` is `ChatMessage.role`'s own vocabulary
 *  (`"user" | "assistant"`, `@jini-ai/chat/core`) carried through unchanged — deliberately NOT a
 *  provider's: every `run*ToolTurn` adapter already maps this pair into its own wire roles. */
export interface SiteAssistantHistoryTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/** Any role value other than the two this type recognizes (a forged `"system"`, a typo, a
 *  non-string) makes the caller skip that one turn — see the module doc for why a bad entry costs
 *  only itself, not the whole history. */
function toHistoryRole(role: unknown): SiteAssistantHistoryTurn["role"] | null {
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  return null;
}

/**
 * Bounds and converts client-supplied, untrusted `history` into {@link SiteAssistantHistoryTurn}s
 * ready to prepend to the live message in `runByokProviderTurn`'s `messages`. Never throws: any
 * input shape that is not a usable history (not an array, wrong-shaped entries throughout) simply
 * produces `[]`.
 *
 * @complexity O(`maxMessages`) — bounded to the most recent RAW entries BEFORE validating any of
 *   them (see the `recent` slice below), so this function's cost never scales with an attacker-
 *   supplied `history` array's true length, only with the cap. `express.json()`'s own 15MB body limit
 *   (`server/app.ts`) is the outer bound on how big `rawHistory` can even arrive as; this is a second,
 *   narrower bound specific to this function's own surface.
 * @overallScore 100
 */
/** Converts one raw history entry into a {@link SiteAssistantHistoryTurn}, or `null` for any shape
 *  this function does not recognize — see this file's module doc for why a bad entry costs only itself.
 *  Split out of {@link resolveBoundedHistory} purely to keep that function's complexity under the
 *  shop ceiling; behavior is unchanged. */
function toBoundedHistoryTurn(entry: unknown, maxMessageChars: number): SiteAssistantHistoryTurn | null {
  if (!isPlainRecord(entry)) return null;
  const role = toHistoryRole(entry.role);
  if (role === null) return null;
  if (typeof entry.content !== "string") return null;
  const trimmed = entry.content.trim();
  if (trimmed.length === 0) return null;
  const bounded = trimmed.length > maxMessageChars ? `${trimmed.slice(0, maxMessageChars)}…` : trimmed;
  return { role, content: bounded };
}

export function resolveBoundedHistory(rawHistory: unknown, options: ResolveBoundedHistoryOptions = {}): SiteAssistantHistoryTurn[] {
  const maxMessages = options.maxMessages ?? DEFAULT_MAX_HISTORY_MESSAGES;
  const maxMessageChars = options.maxMessageChars ?? DEFAULT_MAX_HISTORY_MESSAGE_CHARS;

  if (!Array.isArray(rawHistory)) return [];

  const recent = rawHistory.length > maxMessages ? rawHistory.slice(rawHistory.length - maxMessages) : rawHistory;

  const turns: SiteAssistantHistoryTurn[] = [];
  for (const entry of recent) {
    const turn = toBoundedHistoryTurn(entry, maxMessageChars);
    if (turn) turns.push(turn);
  }
  return turns;
}
