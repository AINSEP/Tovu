import { redactUserText } from "@jini-ai/chat/core";

/** Tovu's prompt envelope is durable before daemon parsing; sanitize it before lifecycle acceptance. */
export function redactAdminRunContextRef({ contextRef }: { contextRef: string }, _optional = {}): string {
  let envelope: unknown;
  try { envelope = JSON.parse(contextRef); } catch { throw new Error("The run context must be a JSON object."); }
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) throw new Error("The run context must be a JSON object.");
  const safe = { ...envelope } as Record<string, unknown>;
  for (const field of ['prompt', 'coldStartContext'] as const) {
    const text = safe[field];
    if (typeof text !== "string") continue;
    const redaction = redactUserText({ text }, {});
    safe[field] = redaction.text;
    // Lifecycle acceptance may sanitize this envelope again before model dispatch. Preserve the
    // signal so the model can offer the card without inferring a paste from placeholder prose.
    // Only the CURRENT prompt's redaction is a paste signal: history (e.g. a DKIM record from an
    // earlier turn) is still sanitized above, but flagging it put "The user tried to share a
    // credential" on an unrelated message like "https://resend.com/ I really like it".
    if (redaction.secretRedacted && field === "prompt") safe.secretRedacted = true;
  }
  return JSON.stringify(safe);
}
