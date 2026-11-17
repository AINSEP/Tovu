/**
 * @file The members and newsletter mounts of `createApp`: the shared magic-link limiters, the members module (admin + public deps)
 * and the newsletter module (admin + public deps). Registration order is behaviour. Moved verbatim out of `app.ts`.
 */

import { createInMemoryCredentialLifecycle } from "#src/features/members/index";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import { createNewsletterModule } from "../modules/newsletter.js";
import type { NewsletterPublicRouteDeps } from "../../../inbound/public-http/routes/site/newsletter-deps.js";
import { createMembersModule } from "../modules/members.js";
import type { MembersRouteDeps } from "../../../inbound/admin-http/routes/members/deps.js";
import type { MemberPublicRouteDeps } from "../../../inbound/public-http/routes/members/deps.js";
import { createRateLimiter, MAGIC_LINK_COMPLETE_ATTEMPT, MAGIC_LINK_PER_EMAIL, LOGIN_STRICT, MAGIC_LINK_PER_IP } from "#src/contracts/core/rate-limit/rate-limit";
import { mountRoutes } from "./module-handles.js";
import type { MountInput } from "./module-handles.js";

/** The members and newsletter modules, each with its admin and public deps objects, in registration order. */
export function mountMembersNewsletter({ app, routeDeps }: MountInput, _optional = {}): void {
  // ADR-PIPE-013 Decision §2-3 (FEAT-013 Phase 2) — one shared
  // MAGIC_LINK_PER_EMAIL limiter instance consulted by BOTH the admin
  // request-magic-link route and the new public sign-in route (C-015: one
  // counter per email, not two). Per-boot-scoped, mirroring
  // `registerAuthRoutes`'s own `loginRateLimiter` construction.
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });
  const magicLinkPerIpLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_IP, clock: routeDeps.clock });
  const magicLinkCompleteAttemptLimiter = createRateLimiter({ profile: MAGIC_LINK_COMPLETE_ATTEMPT, clock: routeDeps.clock });
  const membersDeps: MembersRouteDeps = { ...routeDeps, magicLinkPerEmailLimiter };

  // NEW public (non-admin) member route family (ADR-PIPE-013 Decision §2-3) —
  // mounted OUTSIDE /api/admin's `requireAdminSession` middleware (this
  // family is unauthenticated by design), alongside the existing
  // `registerContentPostGetRoute`-style public mount above. The member repos
  // are whatever `routeDeps` carries: in-memory from `createRouteDeps()` (this
  // file, the hermetic test composition), durable SQL from `deps.ts`'s
  // `createSiteRouteDeps()` (the real site, ADR-046 Phase 1).
  const memberPublicDeps = memberPublicDepsFor({ routeDeps, magicLinkPerEmailLimiter, magicLinkPerIpLimiter, magicLinkCompleteAttemptLimiter });
  // ADR-046 Phase 3 (SPEC-038): the `members` server module — 4 admin CRUD/list routes + 2 public
  // sign-in routes, genuinely two deps objects (see `modules/members.ts`'s file header).
  mountRoutes(app, createMembersModule({ admin: membersDeps, public: memberPublicDeps }));

  // SPEC-011 (Newsletter, ADR-PIPE-011) Stage 5 — the `newsletter` server module: 19 admin routes
  // (inside the `/api/admin` gate mounted by `createCoreModule` above) + 2 public, cookie-less,
  // token-only routes (`newsletter-confirm.ts`/`newsletter-unsubscribe.ts`), genuinely two deps
  // objects, same rationale as `members` immediately above (see `modules/newsletter.ts`'s header).
  // `routeDeps` is cast to `NewsletterRouteDeps` here (not widened) — mirrors every admin
  // newsletter route file's own `routeDeps as NewsletterRouteDeps` cast (`routes/admin/newsletter/
  // deps.ts`'s file header); `createRouteDeps()`'s actual return type already IS
  // `NewsletterRouteDeps`, this parameter's own `RouteDeps` annotation is just narrower.
  const newsletterAdminDeps = routeDeps as NewsletterRouteDeps;
  const newsletterPublicDeps = newsletterPublicDepsFor({ routeDeps, newsletterAdminDeps });
  mountRoutes(app, createNewsletterModule({ admin: newsletterAdminDeps, public: newsletterPublicDeps }));
}

/** The members module's public deps: the root's member repos plus the shared magic-link limiters and password-sign-in limiters of this app. */
function memberPublicDepsFor(required: {
  routeDeps: MountInput["routeDeps"];
  magicLinkPerEmailLimiter: MembersRouteDeps["magicLinkPerEmailLimiter"];
  magicLinkPerIpLimiter: MemberPublicRouteDeps["magicLinkPerIpLimiter"];
  magicLinkCompleteAttemptLimiter: MemberPublicRouteDeps["magicLinkCompleteAttemptLimiter"];
}, _optional = {}): MemberPublicRouteDeps {
  const { routeDeps, magicLinkPerEmailLimiter, magicLinkPerIpLimiter, magicLinkCompleteAttemptLimiter } = required;
  return {
    visitorAnalyticsProof: routeDeps.visitorAnalyticsProof,
    visitorAnalyticsDeliveryAllowed: routeDeps.visitorAnalyticsDeliveryAllowed,
    visitorTracker: routeDeps.visitorTracker,
    tracker: routeDeps.tracker,
    // Password writes need the SAME store as the member repos: the durable kernel, or (memory-only
    // composition, no kernel) an in-process mutex. Never mix kernel transactions with memory repos.
    credentialLifecycle: routeDeps.contentKernel ?? createInMemoryCredentialLifecycle(),
    workspaceId: routeDeps.workspaceId,
    memberRepo: routeDeps.memberRepo,
    memberTierRepo: routeDeps.memberTierRepo,
    memberSubscriptionRepo: routeDeps.memberSubscriptionRepo,
    memberSessionRepo: routeDeps.memberSessionRepo,
    magicLinkRepo: routeDeps.magicLinkRepo,
    mailer: routeDeps.mailer,
    mailStatus: routeDeps.mailStatus,
    origin: routeDeps.originRegistry,
    clock: routeDeps.clock,
    idGen: routeDeps.idGen,
    principalRepo: routeDeps.principalRepo,
    mailSenderIdentity: routeDeps.mailSenderIdentity,
    magicLinkPerEmailLimiter,
    magicLinkPerIpLimiter,
    magicLinkCompleteAttemptLimiter,
    passwordHasher: routeDeps.passwordHasher,
    passwordSignInPerEmailLimiter: createRateLimiter({ profile: LOGIN_STRICT, clock: routeDeps.clock }),
    passwordSignInPerIpLimiter: createRateLimiter({ profile: LOGIN_STRICT, clock: routeDeps.clock }),
    passwordSetPerMemberLimiter: createRateLimiter({ profile: LOGIN_STRICT, clock: routeDeps.clock }),
  };
}

/** The newsletter module's public (cookie-less, token-only) deps, read from the admin deps view of the root. */
function newsletterPublicDepsFor(required: { routeDeps: MountInput["routeDeps"]; newsletterAdminDeps: NewsletterRouteDeps }, _optional = {}): NewsletterPublicRouteDeps {
  const { routeDeps, newsletterAdminDeps } = required;
  return {
    visitorAnalyticsProof: routeDeps.visitorAnalyticsProof,
    visitorAnalyticsDeliveryAllowed: routeDeps.visitorAnalyticsDeliveryAllowed,
    visitorTracker: routeDeps.visitorTracker,
    tracker: routeDeps.tracker,
    workspaceId: newsletterAdminDeps.workspaceId,
    newsletterReady: newsletterAdminDeps.newsletterReady,
    newsletterConfirmationTokenRepo: newsletterAdminDeps.newsletterConfirmationTokenRepo,
    newsletterSubscriptionRepo: newsletterAdminDeps.newsletterSubscriptionRepo,
    newsletterKeyring: newsletterAdminDeps.newsletterKeyring,
    mailer: newsletterAdminDeps.mailer,
    membersConsentCapability: newsletterAdminDeps.membersConsentCapability,
    originRegistry: newsletterAdminDeps.originRegistry,
    clock: newsletterAdminDeps.clock,
    idGen: newsletterAdminDeps.idGen,
    mailSenderIdentity: newsletterAdminDeps.mailSenderIdentity,
  };
}
