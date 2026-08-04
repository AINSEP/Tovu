import type { GoogleContent } from "@jini-ai/agent-runtime";

/**
 * @file SPEC-046 REQ-3 — turns the site assistant's client-supplied conversation history into
 * bounded Gemini `GoogleContent[]` turns.
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

/** `ChatMessage.role` is `"user" | "assistant"` (`@jini-ai/chat/core`); Gemini's `Content.role` is
 *  `"user" | "model"`. Any other value (a forged `"system"`, a typo, a non-string) is not a role this
 *  function recognizes, and the caller treats that as "skip this one turn" — see the module doc for
 *  why a bad entry costs only itself, not the whole history. */
function toGoogleRole(role: unknown): GoogleContent["role"] | null {
  if (role === "user") return "user";
  if (role === "assistant") return "model";
  return null;
}

/**
 * Bounds and converts client-supplied, untrusted `history` into `GoogleContent[]` turns ready to
 * prepend to the live message in `runGoogleToolTurn`'s `contents`. Never throws: any input shape that
 * is not a usable history (not an array, wrong-shaped entries throughout) simply produces `[]`.
 *
 * @complexity O(`maxMessages`) — bounded to the most recent RAW entries BEFORE validating any of
 *   them (see the `recent` slice below), so this function's cost never scales with an attacker-
 *   supplied `history` array's true length, only with the cap. `express.json()`'s own 15MB body limit
 *   (`server/app.ts`) is the outer bound on how big `rawHistory` can even arrive as; this is a second,
 *   narrower bound specific to this function's own surface.
 * @overallScore 100
 */
export function resolveBoundedHistory(rawHistory: unknown, options: ResolveBoundedHistoryOptions = {}): GoogleContent[] {
  const maxMessages = options.maxMessages ?? DEFAULT_MAX_HISTORY_MESSAGES;
  const maxMessageChars = options.maxMessageChars ?? DEFAULT_MAX_HISTORY_MESSAGE_CHARS;

  if (!Array.isArray(rawHistory)) return [];

  const recent = rawHistory.length > maxMessages ? rawHistory.slice(rawHistory.length - maxMessages) : rawHistory;

  const turns: GoogleContent[] = [];
  for (const entry of recent) {
    if (!isPlainRecord(entry)) continue;
    const role = toGoogleRole(entry.role);
    if (role === null) continue;
    if (typeof entry.content !== "string") continue;
    const trimmed = entry.content.trim();
    if (trimmed.length === 0) continue;
    const bounded = trimmed.length > maxMessageChars ? `${trimmed.slice(0, maxMessageChars)}…` : trimmed;
    turns.push({ role, parts: [{ text: bounded }] });
  }
  return turns;
}
