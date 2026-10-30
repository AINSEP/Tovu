import { redactUserText } from "@jini-ai/chat/core";

/** Parse Tovu's durable envelope without echoing malformed input. @complexity O(contextRef length). */
function parseAdminRunEnvelope({ contextRef }: { contextRef: string }, _options = {}): Record<string, unknown> {
  let envelope: unknown;
  try { envelope = JSON.parse(contextRef); } catch { throw new Error("The run context must be a JSON object."); }
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) throw new Error("The run context must be a JSON object.");
  return { ...envelope } as Record<string, unknown>;
}

/** Tovu's prompt envelope is durable before daemon parsing; sanitize it before lifecycle acceptance.
 * Only the current user text contributes a new paste signal; prior ingress signals survive retries.
 * @returns A sanitized JSON envelope without mutating the input.
 * @throws When contextRef is not a JSON object.
 * @complexity Redaction cost across the three text fields; no I/O.
 */
export function redactAdminRunContextRef({ contextRef }: { contextRef: string }, _optional = {}): string {
  const safe = parseAdminRunEnvelope({ contextRef }, {});
  // Stateless CLI prompts include history; userPrompt identifies what the human sent THIS turn.
  const currentText = typeof safe.userPrompt === "string" ? safe.userPrompt : safe.prompt;
  const currentRedacted = typeof currentText === "string" && redactUserText({ text: currentText }, {}).secretRedacted;
  for (const field of ['prompt', 'coldStartContext', 'userPrompt'] as const) {
    const text = safe[field];
    if (typeof text !== "string") continue;
    const redaction = redactUserText({ text }, {});
    safe[field] = redaction.text;
  }
  // Lifecycle acceptance may sanitize this envelope again before model dispatch. Preserve the
  // signal without inferring a paste from placeholder prose. Only the CURRENT user's redaction
  // is a paste signal: history (e.g. a DKIM record from an earlier turn) is still sanitized above,
  // but flagging it put "The user tried to share a credential" on an unrelated message like
  // "https://example.com/ I really like it".
  if (currentRedacted) safe.secretRedacted = true;
  return JSON.stringify(safe);
}
