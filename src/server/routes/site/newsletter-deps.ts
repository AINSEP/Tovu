/**
 * @file Deps bundle for the 2 PUBLIC (unauthenticated) newsletter routes — `newsletter-confirm.ts`/
 * `newsletter-unsubscribe.ts` (api.spec.md §1a). Mirrors `routes/members/deps.ts`'s
 * `MemberPublicRouteDeps` split rationale exactly: deliberately narrower than the admin
 * `NewsletterRouteDeps` (`routes/admin/newsletter/deps.ts`) — no `authorize`, no session/principal
 * field at all. These two routes must never touch a session cookie (REQ-30/AC-39/INV-09) — a
 * visitor clicking an email link has no admin session, and must never be required to have one.
 *
 * Architectural role:
 * Composition-boundary glue only — no business logic. Mirrors `routes/admin/newsletter/deps.ts`'s
 * `toConfirmationDeps`/`toUnsubscribeDeps` helpers, over this narrower deps shape.
 */
import type { UUID } from "#src/core/ports";
import type { KeyringPort } from "#src/integrations/ports";
import type { MailerPort } from "#src/mail/index";
import type { OriginRegistryPort } from "#src/origin/index";
import type { ConfirmationDeps } from "#src/newsletter/confirmation";
import type {
  MembersConsentCapability,
  NewsletterConfirmationTokenRepoPort,
  NewsletterSubscriptionRepoPort,
} from "#src/newsletter/ports";
import type { UnsubscribeDeps } from "#src/newsletter/unsubscribe";

export interface NewsletterPublicRouteDeps {
  workspaceId: UUID;
  newsletterReady: Promise<void>;
  newsletterConfirmationTokenRepo: NewsletterConfirmationTokenRepoPort;
  newsletterSubscriptionRepo: NewsletterSubscriptionRepoPort;
  newsletterKeyring: KeyringPort;
  mailer: MailerPort;
  membersConsentCapability: MembersConsentCapability | null;
  originRegistry: OriginRegistryPort;
  clock: { nowIso(): string };
  idGen: { newId(): string };
}

/** Assemble `confirmation.ts`'s deps bundle from the narrower public deps shape. */
export function toPublicConfirmationDeps(deps: NewsletterPublicRouteDeps): ConfirmationDeps {
  return {
    tokenRepo: deps.newsletterConfirmationTokenRepo,
    subscriptionRepo: deps.newsletterSubscriptionRepo,
    mailer: deps.mailer,
    consentCapability: deps.membersConsentCapability,
    originRegistry: deps.originRegistry,
    clock: deps.clock,
    ids: deps.idGen,
  };
}

/** Assemble `unsubscribe.ts`'s deps bundle from the narrower public deps shape. */
export function toPublicUnsubscribeDeps(deps: NewsletterPublicRouteDeps): UnsubscribeDeps {
  return {
    subscriptionRepo: deps.newsletterSubscriptionRepo,
    keyring: deps.newsletterKeyring,
    originRegistry: deps.originRegistry,
    consentCapability: deps.membersConsentCapability,
    clock: deps.clock,
  };
}
