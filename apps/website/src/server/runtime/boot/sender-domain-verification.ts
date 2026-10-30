import {
  createSenderDomainVerification as createJiniSenderDomainVerification,
  type MailProviderCallContext,
  type SenderDomainVerificationDeps as JiniSenderDomainVerificationDeps,
} from "@jini-ai/platform/mail";
import type { HttpClientPort } from "#src/platform/http/index";
import type { SenderDomainVerificationPort } from "#src/platform/mail/index";

/**
 * @file The sender domain's state at the active transactional provider (its own `domainStatus`),
 * for the Email page's **Sender and DNS** section and `mail_dns_status`. Kept apart from the DNS
 * check on purpose: a provider can report `pending` after every record resolves, and DNS can match
 * while the provider was never asked. Each reason the provider cannot be asked is named apart, so
 * "DNS verification unavailable for this provider" is a state of its own, not a failure.
 */
export interface SenderDomainVerificationDeps extends Omit<JiniSenderDomainVerificationDeps, "httpClient"> {
  /** Tovu's guarded outbound-HTTP seam, handed to the provider as in resolve-mailer.ts. */
  httpClient: HttpClientPort;
}

/** Keep the plugin's positional HTTP ABI; Jini owns the verdict, redaction and deadline.
 * Same call context resolve-mailer.ts builds: this workspace, live, the provider's saved key.
 * @complexity O(1) binding; at most two provider calls in Jini.
 * @example await createSenderDomainVerification(deps)()
 */
export function createSenderDomainVerification(deps: SenderDomainVerificationDeps, options: { timeoutMs?: number } = {}): SenderDomainVerificationPort {
  return createJiniSenderDomainVerification({ ...deps, httpClient: deps.httpClient as unknown as MailProviderCallContext["httpClient"] }, options);
}
