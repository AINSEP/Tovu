import {
  createMailDeliveryPolicy,
  createMailLaneLimiter,
  type MailCapturePort,
  type MailLaneLimiter,
  type MailProviderModule,
  type MailResendPolicy,
  type MailSendLedgerPort,
  type MailSuppressionRepoPort,
  type MailTestMode,
} from "@jini-ai/platform/mail";

import type { MailTestModeSetting } from "#src/features/settings/mail-provider";
import type { MailerPort, MailerSendOptions, MailerSendResult, OutboundEmail } from "#src/platform/mail/index";

/**
 * @file Tovu decorator that puts Jini's delivery policy (`createMailDeliveryPolicy`: attachments,
 * bulk unsubscribe headers, suppression, test mode, rate limit, reserve → send → mark ledger) in
 * front of each resolved provider mailer. Tovu's `MailerPort` keeps its positional
 * `send(message, options)` shape, so the policy's `send` callback re-enters it that way.
 *
 * One token bucket per provider id (only when the provider declares `capabilities.rateLimit`), held
 * for the life of the process. Test mode is read per send, so switching `core.mail.testMode` applies
 * to the next message. The purpose gate (`platform/mail/purpose-scoped-mailer.ts`) still wraps the
 * whole mailer at composition; this sits inside it.
 */

export interface MailPolicyWrapperDeps {
  ledger: MailSendLedgerPort;
  suppression: MailSuppressionRepoPort;
  /** Fresh `core.mail.testMode` read (`features/settings/mail-provider.ts`). */
  readTestMode: () => Promise<MailTestModeSetting>;
}

export interface MailPolicyWrapperOptions {
  /** Capture sink for `testMode: capture`; absent, capture mode refuses rather than sending. */
  capture?: MailCapturePort;
  /** Limiter clock in ms; defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Sign-in links are never re-sent after an unknown outcome (the member just asks again; two live
 * links are worse than none); everything else, e.g. a subscription confirmation, may be re-sent once.
 * Purpose alone cannot tell them apart (both are `transactional`), so the module decides.
 * @complexity O(1).
 */
export function resendPolicyFor(required: { options: Pick<MailerSendOptions, "purpose" | "sourceContext"> }, _optional: Record<string, never> = {}): MailResendPolicy {
  const { purpose, sourceContext } = required.options;
  if (sourceContext.module === "members") return "never";
  return typeof purpose === "string" && /login|signin|magic/.test(purpose) ? "never" : "on_unknown";
}

/** `core.mail.testMode` → Jini test mode; `null` = capture requested but no sink (refuse). */
function toTestMode(required: { setting: MailTestModeSetting; capture?: MailCapturePort }): MailTestMode | undefined | null {
  const { setting, capture } = required;
  if (setting.mode === "redirect") return { kind: "redirect", to: { email: setting.to } };
  if (setting.mode === "capture") return capture ? { kind: "capture", sink: capture } : null;
  return undefined;
}

const CAPTURE_UNAVAILABLE: MailerSendResult = { ok: false, retryable: false, errorCode: "MAIL_TEST_CAPTURE_UNAVAILABLE", message: "mail test mode is set to capture, but no capture store is available; nothing was sent" };

/**
 * Builds the per-provider wrapper `resolve-mailer.ts` applies to every resolved mailer.
 * @complexity Per send: one test-mode read plus the policy's ledger round-trips.
 */
export function createMailPolicyWrapper(required: MailPolicyWrapperDeps, optional: MailPolicyWrapperOptions = {}) {
  const limiters = new Map<string, MailLaneLimiter>();
  const limiterFor = (provider: MailProviderModule, providerId: string): MailLaneLimiter | undefined => {
    const limit = provider.capabilities.rateLimit;
    if (!limit) return undefined;
    const existing = limiters.get(providerId);
    if (existing) return existing;
    const created = createMailLaneLimiter({ limit }, optional.now ? { now: optional.now } : {});
    limiters.set(providerId, created);
    return created;
  };

  return ({ providerId, provider, mailer }: { providerId: string; provider: MailProviderModule; mailer: MailerPort }): MailerPort => {
    const deliverOne = async (message: OutboundEmail, options: MailerSendOptions): Promise<MailerSendResult> => {
      const testMode = toTestMode({ setting: await required.readTestMode(), ...(optional.capture ? { capture: optional.capture } : {}) });
      if (testMode === null) return CAPTURE_UNAVAILABLE;
      const limiter = limiterFor(provider, providerId);
      const policy = createMailDeliveryPolicy(
        { providerId, ledger: required.ledger, suppression: required.suppression, supportsAttachments: mailer.capabilities().supportsAttachments },
        { ...(limiter ? { limiter } : {}), ...(testMode ? { testMode } : {}), resendPolicy: () => resendPolicyFor({ options }) },
      );
      return policy.deliver({ message, options, send: (call) => mailer.send(call.message, options) });
    };
    return {
      capabilities: () => mailer.capabilities(),
      send: deliverOne,
      async sendBatch(messages, options) {
        // Per-recipient ledger rows need per-recipient dispatch. One key per message (`:index`, as the
        // bundled hosted adapter always did): a shared key would make messages 2..n look like retries of 1.
        const results: MailerSendResult[] = [];
        for (const [index, message] of messages.entries()) results.push(await deliverOne(message, { ...options, idempotencyKey: `${options.idempotencyKey}:${index}` }));
        return results;
      },
    };
  };
}
