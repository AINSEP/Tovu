/**
 * @file The sender domain's state AT THE MAIL PROVIDER (the provider's own "domain verified" flag),
 * kept apart from what authoritative DNS answers: a provider can still say `pending` after every
 * record resolves, and DNS can match while the provider was never asked. Built by
 * `server/runtime/boot/resolve-mailer.ts`; declared here so features need no boot import.
 */

export type { ProviderDomainState, SenderDomainVerification, SenderDomainVerificationPort } from "@jini-ai/platform/mail";
