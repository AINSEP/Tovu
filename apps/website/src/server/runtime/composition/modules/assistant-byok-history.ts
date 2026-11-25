import { guardUserText } from "@jini-ai/chat/core";
import type { ProviderChatMessage } from "@jini-ai/agent-runtime/providers/tool-turn";
import { CREDENTIAL_PASTE_MODEL_NOTE } from "#src/assistant/credential-guidance";

/** Bounds one BYOK turn's history the same way `assistant-transport.ts`'s `MAX_TRANSCRIPT_TURNS`
 *  bounds the daemon path's flattened prompt — each turn is a fresh provider request billed for its
 *  whole input, so an unbounded history would make every later message in a long chat more
 *  expensive than the last. */
const MAX_HISTORY_MESSAGES = 40;

function isPlainMessage(value: unknown): value is { role: unknown; content: unknown; secretRedacted?: unknown } {
  return typeof value === "object" && value !== null;
}

/** Validate the BYOK wire entry before either current-turn selection or redaction. @complexity O(1). */
function readByokHistoryMessage({ entry }: { entry: unknown }, _options = {}): (ProviderChatMessage & { secretRedacted: unknown }) | null {
  if (!isPlainMessage(entry)) return null;
  const role = entry.role === "user" || entry.role === "assistant" ? entry.role : null;
  if (role === null) return null;
  if (typeof entry.content !== "string" || entry.content.length === 0) return null;
  return { role, content: entry.content, secretRedacted: entry.secretRedacted };
}

/** ES2022-compatible reverse scan; malformed user entries never claim the current turn. @complexity O(n). */
function lastUserMessageIndex({ entries }: { entries: readonly unknown[] }, _options = {}): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = readByokHistoryMessage({ entry: entries[index] }, {});
    if (entry && entry.role === "user") return index;
  }
  return -1;
}

/** One raw history entry -> a valid {@link ProviderChatMessage}, or `null` if it isn't one — the single
 *  per-entry validation `resolveMessages` below loops over. Always redacts user text; only the
 *  current user turn receives a notice. Does not mutate the entry or perform I/O.
 *  @complexity Redaction cost in the message content; constant validation work. */
function toByokChatMessage({ entry, currentUserTurn }: { entry: unknown; currentUserTurn: boolean }, _optional = {}): ProviderChatMessage | null {
  const message = readByokHistoryMessage({ entry }, {});
  if (message === null) return null;
  const { role, content, secretRedacted } = message;
  const modelContent = role === "user" ? guardUserText({ text: content }, {
    modelNote: currentUserTurn ? CREDENTIAL_PASTE_MODEL_NOTE : "", secretRedacted: secretRedacted === true,
  }) : content;
  return { role, content: modelContent };
}

/** Validates and bounds the client-supplied history. Fail-soft on individual malformed entries
 *  (dropped, not rejected) — mirrors `site-assistant.ts`'s own `resolveBoundedHistory` posture for
 *  the sibling visitor-assistant route: history is passive background context the caller did not
 *  just author this instant, so a malformed entry degrades the turn's context rather than the whole
 *  request.
 *  @complexity O(n) entries plus per-message redaction cost; O(n) output space, no I/O. */
export function resolveMessages({ raw }: { raw: unknown }, _optional = {}): ProviderChatMessage[] {
  if (!Array.isArray(raw)) return [];
  // Redact every user turn, but notify only for the latest valid user message. Historical flags
  // and raw historical secrets must not turn an unrelated request into another rotation warning.
  const currentUserIndex = lastUserMessageIndex({ entries: raw }, {});
  const messages: ProviderChatMessage[] = [];
  for (const [index, entry] of raw.entries()) {
    const message = toByokChatMessage({ entry, currentUserTurn: index === currentUserIndex }, {});
    if (message) messages.push(message);
  }
  return messages.slice(-MAX_HISTORY_MESSAGES);
}
