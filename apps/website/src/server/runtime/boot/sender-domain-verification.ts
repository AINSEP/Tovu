import type { MailAdapterCredential, MailProviderCallContext, MailProviderModule } from "@jini-ai/platform/mail";

import type { HttpClientPort } from "#src/platform/http/index";
import type { SenderDomainVerification, SenderDomainVerificationPort } from "#src/platform/mail/sender-domain-verification";
import { isDomainReadPermissionRefused, readMailDomain, type MailDomainReadCredentialPort } from "./mail-domain-read.js";

/**
 * @file The sender domain's state at the active transactional provider (its own `domainStatus`),
 * for the Email page's **Sender and DNS** section and `mail_dns_status`. Kept apart from the DNS
 * check on purpose: a provider can report `pending` after every record resolves, and DNS can match
 * while the provider was never asked. Each reason the provider cannot be asked is named apart, so
 * "DNS verification unavailable for this provider" is a state of its own, not a failure.
 */
export interface SenderDomainVerificationDeps {
  workspaceId: string;
  /** Tovu's guarded outbound-HTTP seam, handed to the provider as in `resolve-mailer.ts`. */
  httpClient: HttpClientPort;
  /** The installed providers, read fresh (`loadMailProviderCatalog`). */
  findProvider: (required: { id: string }) => Promise<MailProviderModule | undefined>;
  /** The provider's saved key, or `null` when none is saved (`resolveMailCredential`). */
  resolveCredential: (required: { id: string }) => Promise<MailAdapterCredential | null>;
  resolveDomainReadCredential?: MailDomainReadCredentialPort;
  /** `core.mail.provider`'s transactional lane. */
  readProviderId: () => Promise<string | null>;
  /** `core.mail.senderEmail`. */
  readSenderEmail: () => Promise<string | undefined>;
}

/** The configured sender's domain, lower-cased; undefined when unset or unreadable. */
async function senderDomain(deps: SenderDomainVerificationDeps): Promise<string | undefined> {
  const email = await deps.readSenderEmail().catch(() => undefined);
  return email?.split("@")[1]?.trim().toLowerCase() || undefined;
}

/** Read domain status, trying the plugin's account on permission refusal; failures stay `unknown`. */
async function askProvider(required: { deps: SenderDomainVerificationDeps; provider: MailProviderModule; providerId: string; domain: string }): Promise<SenderDomainVerification> {
  const { deps, provider, providerId, domain } = required;
  const credential = await deps.resolveCredential({ id: providerId }).catch(() => null);
  if (!credential) return { state: "unknown", domain, providerId, reason: "the provider's key is not saved" };
  // Same call context `resolve-mailer.ts` builds for a provider call: this workspace, live, its key.
  const ctx: MailProviderCallContext = { workspaceId: deps.workspaceId, mode: "live", credential, httpClient: deps.httpClient as unknown as MailProviderCallContext["httpClient"] };
  const result = await readMailDomain({ ctx, providerId, read: context => provider.domainStatus!(context, { domain }), resolveDomainReadCredential: deps.resolveDomainReadCredential }).catch(() => null);
  if (result?.status === "ok") return { state: result.value.state, domain, providerId };
  const reason = result && isDomainReadPermissionRefused({ result })
    ? "the sending key can't check domains, and no connected account could check it either"
    : "the provider did not answer the domain check";
  return { state: "unknown", domain, providerId, reason };
}

/**
 * The sender domain's state at the transactional provider: `null` = no sender configured
 * (`sender_unknown`); undefined = the provider cannot verify domains or the check failed.
 * @complexity At most two provider calls, with the account fallback.
 */

/**
 * Build the never-throwing port.
 * @complexity Per call: two settings reads, one catalog load, at most two key lookups and two provider calls.
 * @example createSenderDomainVerification(deps)()
 */
export function createSenderDomainVerification(required: SenderDomainVerificationDeps, options: { timeoutMs?: number } = {}): SenderDomainVerificationPort {
  const deps = required;
  const check = async (): Promise<SenderDomainVerification> => {
    const [providerId, domain] = await Promise.all([deps.readProviderId().catch(() => null), senderDomain(deps)]);
    if (!domain) return { state: "no_sender", providerId };
    const provider = providerId === null ? undefined : await deps.findProvider({ id: providerId }).catch(() => undefined);
    if (!provider) return { state: "no_provider", domain, providerId };
    const id = providerId!;
    if (!provider.domainStatus) return { state: "unsupported", domain, providerId: id };
    return askProvider({ deps, provider, providerId: id, domain });
  };
  return async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<SenderDomainVerification>(resolve => {
      timer = setTimeout(() => resolve({ state: "unknown", providerId: null, reason: "provider_domain_check_timed_out" }), options.timeoutMs ?? 5_000);
    });
    try { return await Promise.race([check(), timeout]); } finally { clearTimeout(timer); }
  };
}
