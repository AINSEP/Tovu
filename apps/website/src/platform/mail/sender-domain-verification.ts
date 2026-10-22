/**
 * @file The sender domain's state AT THE MAIL PROVIDER (the provider's own "domain verified" flag),
 * kept apart from what authoritative DNS answers: a provider can still say `pending` after every
 * record resolves, and DNS can match while the provider was never asked. Built by
 * `server/runtime/boot/resolve-mailer.ts`; declared here so features need no boot import.
 */

/** What the provider says about the sender domain, when it can say anything. */
export type ProviderDomainState = "verified" | "pending" | "failed" | "not_found";

export type SenderDomainVerification =
  /** The provider answered. */
  | { state: ProviderDomainState; domain: string; providerId: string }
  /** No sender address is configured, so there is no domain to verify. */
  | { state: "no_sender"; providerId: string | null }
  /** No transactional provider is selected (or the selected one is not installed). */
  | { state: "no_provider"; domain: string; providerId: string | null }
  /** The provider has no domain-verification API: "DNS verification unavailable for this provider". */
  | { state: "unsupported"; domain: string; providerId: string }
  /** The provider could not be asked (missing key) or its answer failed; never read as a failure. */
  | { state: "unknown"; domain: string; providerId: string; reason: string };

/** Fresh read of the provider-side sender-domain state; never throws. */
export type SenderDomainVerificationPort = () => Promise<SenderDomainVerification>;
