/** Tovu host adapters for Jini mail and the SPEC-022 durable notification gate.
 * Jini preserves U-001: only explicit interactive sends bypass production readiness;
 * local mode proceeds, and the supplied mode is never re-read from the environment.
 */
import {
  wrapMailerWithPurposeGate as wrapJiniMailerWithPurposeGate,
  type MailerPort as JiniMailerPort,
} from "@jini-ai/platform/mail";
import type { MailerPort } from "./ports.js";
import type { RuntimeMode } from "#src/contracts/core/runtime-mode";

// Lane/readiness rationale: Jini/packages/platform/src/mail/purpose-scoped-mailer.ts (SPEC-022 C-005 / U-001).
export interface WrapMailerWithPurposeGateOptions {
  inner: MailerPort;
  mode: RuntimeMode;
  durableOutboxReady: (capabilityName: string) => boolean;
}

export { fromPositionalMailer as toJiniMailer, toPositionalMailer as toTovuMailer } from "@jini-ai/platform/mail";
import { fromPositionalMailer as toJiniMailer, toPositionalMailer as toTovuMailer } from "@jini-ai/platform/mail";

/** Injects Tovu's durable-outbox readiness into Jini's fail-closed purpose gate.
 * @example wrapMailerWithPurposeGate({ inner, mode, durableOutboxReady })
 */
export function wrapMailerWithPurposeGate({ inner, mode, durableOutboxReady }: WrapMailerWithPurposeGateOptions): MailerPort {
  const mailer = wrapJiniMailerWithPurposeGate({
    inner: toJiniMailer({ mailer: inner }),
    mode,
    readiness: { isReady: ({ capabilityName }) => durableOutboxReady(capabilityName) },
  });
  return toTovuMailer({ mailer });
}
