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

/** Adapts Jini's required delivery fields and optional controls to a Tovu mailer. */
export function toJiniMailer({ mailer }: { mailer: MailerPort }): JiniMailerPort {
  return {
    capabilities: () => mailer.capabilities(),
    send: ({ message, ...required }, optional = {}) => mailer.send(message, { ...required, ...optional }),
    sendBatch: ({ messages, ...required }, optional = {}) => mailer.sendBatch(messages, { ...required, ...optional }),
  };
}

/** Adapts a Jini mailer for current Tovu consumers, preserving all delivery controls. */
export function toTovuMailer({ mailer }: { mailer: JiniMailerPort }): MailerPort {
  return {
    capabilities: () => mailer.capabilities({}),
    send: (message, { idempotencyKey, workspaceId, sourceContext, ...optional }) =>
      mailer.send({ message, idempotencyKey, workspaceId, sourceContext }, optional),
    sendBatch: (messages, { idempotencyKey, workspaceId, sourceContext, ...optional }) =>
      mailer.sendBatch({ messages, idempotencyKey, workspaceId, sourceContext }, optional),
  };
}

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
