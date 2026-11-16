import type { VisitorAnalyticsDeps } from "../../visitor-analytics.js";
/**
 * @file Deps bundle for the 2 PUBLIC (unauthenticated) newsletter routes — `newsletter-confirm.ts`/
 * `newsletter-unsubscribe.ts` (api.spec.md §1a). Mirrors `routes/members/deps.ts`'s
 * `MemberPublicRouteDeps` split rationale exactly: deliberately narrower than the admin
 * `NewsletterRouteDeps` (`apps/website/src/server/inbound/admin-http/routes/newsletter/deps.ts`) — no `authorize`, no session/principal
 * field at all. These two routes must never touch a session cookie (REQ-30/AC-39/INV-09) — a
 * visitor clicking an email link has no admin session, and must never be required to have one.
 *
 * Architectural role:
 * Composition-boundary glue only — no business logic. Mirrors `apps/website/src/server/inbound/admin-http/routes/newsletter/deps.ts`'s
 * `toConfirmationDeps`/`toUnsubscribeDeps` helpers, over this narrower deps shape.
 */
import type { UUID } from "@jini-ai/core/primitives";
import type { KeyringPort } from "#src/features/webhooks/index";
import type { MailerPort, MailSenderIdentityPort } from "#src/platform/mail/index";
import type { OriginRegistryPort } from "@jini-ai/core/contracts/server/verified-origin";
import type { ConfirmationDeps } from "#src/features/newsletter/confirmation";
import { buildConfirmationDeps } from "#src/features/newsletter/deps-builders";
import type {
  MembersConsentCapability,
  NewsletterConfirmationTokenRepoPort,
  NewsletterSubscriptionRepoPort,
} from "#src/features/newsletter/index";
import type { UnsubscribeDeps } from "#src/features/newsletter/unsubscribe";

export interface NewsletterPublicRouteDeps extends VisitorAnalyticsDeps {
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
  /** The site's system-email From resolver — see `ConfirmationDeps.senderIdentity`. */
  mailSenderIdentity?: MailSenderIdentityPort;
}

/** Assemble `confirmation.ts`'s deps bundle from the narrower public deps shape. */
export function toPublicConfirmationDeps(deps: NewsletterPublicRouteDeps): ConfirmationDeps {
  return buildConfirmationDeps({ deps });
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
