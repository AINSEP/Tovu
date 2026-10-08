import { createRunAcceptance as createAcceptance, type RunAcceptancePorts as JiniAcceptancePorts } from "@jini-ai/chat/server/durable-runs";
import { redactAdminRunContextRef } from "../credential-chat-intake.js";
export type RunAcceptancePorts = Omit<JiniAcceptancePorts, "sanitizeContextRef">;
/** Host prompt-envelope policy; durable acceptance belongs to Jini. */
export function createRunAcceptance(ports: RunAcceptancePorts, options = {}) {
  return createAcceptance({ ...ports, sanitizeContextRef: redactAdminRunContextRef }, options);
}
