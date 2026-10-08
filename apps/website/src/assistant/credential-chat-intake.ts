import { redactUserText } from "@jini-ai/chat/core";

/** Tovu's prompt envelope is durable before daemon parsing; sanitize it before lifecycle acceptance. */
export function redactAdminRunContextRef({ contextRef }: { contextRef: string }, _optional = {}): string {
  let envelope: unknown;
  try { envelope = JSON.parse(contextRef); } catch { throw new Error("The run context must be a JSON object."); }
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) throw new Error("The run context must be a JSON object.");
  const safe = { ...envelope } as Record<string, unknown>;
  if (typeof safe.prompt === "string") {
    const redaction = redactUserText({ text: safe.prompt }, {});
    safe.prompt = redaction.text;
    // Lifecycle acceptance may sanitize this envelope again before model dispatch. Preserve the
    // signal so the model can offer the card without inferring a paste from placeholder prose.
    if (redaction.secretRedacted) safe.secretRedacted = true;
  }
  return JSON.stringify(safe);
}
