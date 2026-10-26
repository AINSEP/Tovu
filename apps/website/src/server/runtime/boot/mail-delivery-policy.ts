import {
  createMailPolicyWrapper as createJiniMailPolicyWrapper,
  type MailCapturePort,
  type MailProviderModule,
  type MailResendPolicy,
  type MailSendLedgerPort,
  type MailSuppressionRepoPort,
} from "@jini-ai/platform/mail";
import type { MailAttemptObserver } from "#src/features/mail/attempts.repo";
import type { MailTestModeSetting } from "#src/features/settings/mail-provider";
import type { MailerPort, MailerSendOptions } from "#src/platform/mail/index";
import { toJiniMailer, toTovuMailer } from "#src/platform/mail/purpose-scoped-mailer";

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
  observe?: MailAttemptObserver;
}

export interface MailPolicyWrapperOptions {
  /** Capture sink for `testMode: capture`; absent, capture mode refuses rather than sending. */
  capture?: MailCapturePort;
  /** Limiter clock in ms; defaults to `Date.now`. */
  now?: () => number;
  /** Fixed observation-failure diagnostic; faults in the logger never affect delivery. */
  warn?: (line: string) => void;
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

/**
 * Bind Tovu's mail ABI and sign-in resend rule to Jini's per-provider delivery wrapper.
 * Delivery has already happened when observation runs: storage and diagnostics never alter it
 * (ADR-024: diagnostics cannot reject a send).
 * Per-recipient ledger rows keep indexed keys; Jini awaits each recipient in order.
 * @complexity O(1) binding; one fresh test-mode read plus policy round-trips per recipient.
 * @example createMailPolicyWrapper({ ledger, suppression, readTestMode })({ providerId, provider, mailer })
 */
export function createMailPolicyWrapper(required: MailPolicyWrapperDeps, optional: MailPolicyWrapperOptions = {}) {
  const wrap = createJiniMailPolicyWrapper({ ...required, resendPolicy: resendPolicyFor }, optional);
  return (input: { providerId: string; provider: MailProviderModule; mailer: MailerPort }): MailerPort =>
    toTovuMailer({ mailer: wrap({ ...input, mailer: toJiniMailer({ mailer: input.mailer }) }) });
}
