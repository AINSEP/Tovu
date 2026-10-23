/**
 * @file Asks Jini's purpose gate (`wrapMailerWithPurposeGate`, SPEC-022 C-005 / U-001) whether it
 * would let a send through, without sending: the gate wraps a mailer that never delivers, and the
 * probe reports whether the gate refused. The Email page's use readiness (email phase 4) reads the
 * real gate this way instead of restating its lane/mode rules, so the two cannot drift.
 *
 * It is given the same `mode` and `durableOutboxReady` the composition root hands the live mailer's
 * gate (`server/runtime/composition/deps.ts`); this file never decides readiness itself.
 */
import { wrapMailerWithPurposeGate, type MailerPort } from "@jini-ai/platform/mail";
import type { RuntimeMode } from "#src/contracts/core/runtime-mode";

export type MailPurposeGateProbe = (required: { capabilityName: string; lane: "interactive" | "notification" }) => Promise<boolean>;

const REFUSED = "MAILER_SEND_REFUSED_NO_DURABLE_PATH";
const PROBE_MESSAGE = { workspaceId: "probe", to: { email: "probe@invalid" }, from: { email: "probe@invalid" }, subject: "probe", text: "probe" };

/** A mailer that accepts and discards: the gate decides before it is reached, and it sends nothing.
 *  Exported so its never-delivering contract is pinned by a test, not only by this comment. */
export const DISCARDING_MAILER: MailerPort = {
  capabilities: () => ({ driver: "memory", supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
  send: async () => ({ ok: true, providerMessageId: "probe", acceptedAt: new Date(0).toISOString() }),
  sendBatch: async () => [],
};

/**
 * @returns `true` when the gate would pass a send for that capability and lane, `false` when it refuses.
 * @throws Anything else the gate throws (an unexpected failure is the caller's `unknown`, not a refusal).
 * @complexity O(1); no I/O.
 * @example await createMailPurposeGateProbe({ mode: "production", durableOutboxReady: () => false })({ capabilityName: "forms", lane: "notification" })
 */
export function createMailPurposeGateProbe(required: { mode: RuntimeMode; durableOutboxReady: (capabilityName: string) => boolean }): MailPurposeGateProbe {
  const gated = wrapMailerWithPurposeGate({ inner: DISCARDING_MAILER, mode: required.mode, readiness: { isReady: ({ capabilityName }) => required.durableOutboxReady(capabilityName) } });
  return async ({ capabilityName, lane }) => {
    try {
      await gated.send({ message: PROBE_MESSAGE, idempotencyKey: "probe", workspaceId: "probe", sourceContext: { module: capabilityName } }, { lane });
      return true;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith(REFUSED)) return false;
      throw err;
    }
  };
}
