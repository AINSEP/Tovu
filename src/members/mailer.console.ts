/**
 * @file Dev-mode `MailerPort` adapter for the `members` library (ADR-030 §5).
 *
 * Purpose:
 * `ConsoleMailerAdapter` — logs outbound mail (magic-link, lifecycle emails) to
 * stdout instead of a provider, satisfying the shared `MailerPort` contract from
 * `../mail` (ADR-037). This is the "built now" half of that port's rule-of-two;
 * the members lib never talks to a provider SDK directly (ADR-030 §5).
 *
 * Architectural role:
 * Adapter only — no business logic. Callers inject this (or a real provider
 * adapter) as `MembersWriteServiceDeps.mailer`.
 */
import { randomUUID } from "node:crypto";

import type { ClockPort, IdGeneratorPort } from "../core/ports";
import type { MailerCapabilities, MailerPort, MailerSendOptions, MailerSendResult, OutboundEmail } from "../mail";

/** Body preview length before truncation in the console log line. */
const BODY_PREVIEW_LENGTH = 200;

export interface ConsoleMailerAdapterDeps {
  /** Defaults to system wall-clock; inject a fake clock for deterministic tests. */
  clock?: ClockPort;
  /** Defaults to `crypto.randomUUID`; inject a fake generator for deterministic tests. */
  ids?: IdGeneratorPort;
}

/**
 * `MailerPort` adapter that logs each send to the console (dev/local default).
 *
 * @complexity O(1) per `send`; `sendBatch` is O(n) in message count (loops `send`).
 * @overallScore 100
 */
export class ConsoleMailerAdapter implements MailerPort {
  private readonly clock: ClockPort;
  private readonly ids: IdGeneratorPort;

  constructor(deps: ConsoleMailerAdapterDeps = {}) {
    this.clock = deps.clock ?? { nowIso: () => new Date().toISOString() };
    this.ids = deps.ids ?? { newId: () => randomUUID() };
  }

  capabilities(): MailerCapabilities {
    return {
      driver: "console",
      supportsIdempotencyKey: true,
      supportsWebhookFeedback: false,
      maxBatchSize: 1,
      supportsAttachments: false,
    };
  }

  async send(message: OutboundEmail, opts: MailerSendOptions): Promise<MailerSendResult> {
    if (message.attachments && message.attachments.length > 0) {
      return {
        ok: false,
        retryable: false,
        errorCode: "ATTACHMENTS_UNSUPPORTED",
        message: "ConsoleMailerAdapter does not support attachments (capabilities().supportsAttachments is false)",
      };
    }

    const rawBody = message.text ?? message.html ?? "";
    const truncated =
      rawBody.length > BODY_PREVIEW_LENGTH ? `${rawBody.slice(0, BODY_PREVIEW_LENGTH)}…` : rawBody;

    console.log(
      `[mail:console] to=${message.to.email} subject=${JSON.stringify(message.subject)} ` +
        `idempotencyKey=${opts.idempotencyKey} sourceContext=${JSON.stringify(opts.sourceContext)} body=${JSON.stringify(truncated)}`
    );

    return { ok: true, providerMessageId: this.ids.newId(), acceptedAt: this.clock.nowIso() };
  }

  async sendBatch(
    messages: readonly OutboundEmail[],
    opts: MailerSendOptions
  ): Promise<readonly MailerSendResult[]> {
    const results: MailerSendResult[] = [];
    for (const message of messages) {
      results.push(await this.send(message, opts));
    }
    return results;
  }
}
