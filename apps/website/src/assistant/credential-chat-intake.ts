import { redactUserText } from "@jini-ai/chat/core";

/** Tovu's prompt envelope is durable before daemon parsing; sanitize it before lifecycle acceptance. */
export function redactAdminRunContextRef({ contextRef }: { contextRef: string }, _optional = {}): string {
  let envelope: unknown;
  try { envelope = JSON.parse(contextRef); } catch { throw new Error("The run context must be a JSON object."); }
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) throw new Error("The run context must be a JSON object.");
  const safe = { ...envelope } as Record<string, unknown>;
  if (typeof safe.prompt === "string") safe.prompt = redactUserText({ text: safe.prompt }).text;
  return JSON.stringify(safe);
}
