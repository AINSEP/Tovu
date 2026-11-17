# U2-members-auth-domain — machine-verified facts (generated; do not hand-edit)

Source: Tovu tree at `LANE_ROOT` (ref `integ/merge-final-2026-11-16`) @ `232764af5`. Regenerate: `LANE_ROOT=<tovu clone> python3 scripts/inv-su.py && LANE_ROOT=<tovu clone> python3 scripts/rep.py && LANE_ROOT=<tovu clone> python3 scripts/facts.py [<out dir>]`. Blobs are `git hash-object` of that tree; a sheet executor re-checks every blob (COMMON STOP-on-mismatch).

Files: 15, 3469 lines (tests not counted).

## Files
| path (under apps/website/src) | lines | blob | CLASSIFY label | audit row | existing sheet/design mention | prod importers | test importers |
|---|---|---|---|---|---|---|---|
| features/members/access-resolver.ts | 237 | 00941106f75fb68a0102d3a8547114e45f8148cd | MOVE-AFTER | - | - | 10 | 5 |
| features/members/agent-tools.ts | 157 | f0f22c026b2fc85b402c91081e03cc3a251b4489 | - | audit2:A07 | audit2-sheets-a3:split-a07-members-server-domain.md;w1-sheets-c:dedupe-admin-members.md | 1 | 3 |
| features/members/auth-mail.ts | 25 | 1f3578a9650cb69ff147d1a3dee38e5175d9857c | MOVE-AFTER | - | - | 1 | 0 |
| features/members/capability-card.ts | 29 | 370d296ce9612c4a155f7c39fcc996a312f15321 | - | - | w1-sheets-d:delete-site-guide.gen.md | 1 | 0 |
| features/members/consent-service.ts | 261 | 8fc2d60b80d018c4cdae854c876fe1123c573b6a | DELETE | - | - | 1 | 1 |
| features/members/index.ts | 134 | baba94f173833f504710ba5c0dd5bd965b22d4e7 | - | - | - | 44 | 26 |
| features/members/mailer.console.ts | 93 | 04c24d36b96f92f0d69ed4d5f1e900c1ca73d549 | MOVE | - | - | 1 | 2 |
| features/members/password-auth.ts | 204 | 784c43d36923ecba69e870bbdd55de0014d97804 | MOVE-AFTER | - | - | 1 | 2 |
| features/members/ports.ts | 329 | de4363a1a6f7a23a2270deedede16fd94d0bf537 | - | audit2:A07 | audit2-sheets-a3:split-a07-members-server-domain.md | 10 | 10 |
| features/members/repo.memory.ts | 508 | e9c47e01cc3a3c82d1d3aa2f1dd53d8b521ffbd7 | - | audit2:A07 | audit2-sheets-a3:split-a07-members-server-domain.md | 1 | 23 |
| features/members/subscriber-directory.ts | 133 | f427192a652a591cc3240a46e7262f523d5d408d | - | audit2:A07 | audit2-sheets-a3:split-a07-members-server-domain.md | 1 | 1 |
| features/members/tool-registrations.ts | 332 | c0f2f3735168c8f6ce9405c6b2de32a23c85e4d8 | - | audit2:A07 | audit2-sheets-a3:split-a07-members-server-domain.md;error-system-design-2026-11-16:CODEX-JUDGE.md | 3 | 4 |
| features/members/trash-member.ts | 24 | d5e0b93dd00e589a3df51fe7de447cfed1def707 | MOVE-AFTER | - | - | 2 | 1 |
| features/members/types.ts | 326 | d2736f906190684631540dcb8f148448f0055c91 | - | audit2:A07 | audit2-sheets-a3:split-a07-members-server-domain.md;error-system-design-2026-11-16:CODEX-JUDGE.md | 13 | 17 |
| features/members/write-service.ts | 677 | a149c07c12d9b0365ccafa2998cba72b1e7af9bd | MIXED | - | error-system-design-2026-11-16:CODEX-JUDGE.md | 3 | 10 |

## Per file: exports, tables, lock keys, imports that leave the folder, importers

### features/members/access-resolver.ts (237 lines)
- exports (5): resolvePostMemberAccess, resolveMemberSession, MemberAccessResolverDeps, DefaultMemberAccessResolver, createMemberAccessResolver
- tables touched: -
- lock keys: -
- flags: node:
- npm/@jini-ai imports: node:crypto
- same-folder imports: features/members/ports.ts, features/members/types.ts
- imports leaving the folder: -
- prod importers (10): features/members/index.ts, features/members/password-auth.ts, server/inbound/public-http/routes/commerce/purchase.ts, server/inbound/public-http/routes/content/posts/get-by-slug.ts, server/inbound/public-http/routes/plugin-contributions.ts, server/inbound/public-http/routes/site/media-rendition.ts, server/inbound/public-http/routes/site/member-pages.ts, server/inbound/public-http/routes/site/pages/handlers/home.ts, server/inbound/public-http/routes/site/pages/handlers/slug-routes.ts, server/inbound/public-http/routes/site/pages/render-context/member-access.ts
- test importers (5): features/members/__tests__/access-resolver.test.ts, features/members/__tests__/restart.integration.test.ts, features/members/__tests__/write-service.test.ts, server/inbound/admin-http/routes/members/__tests__/disable.test.ts, server/inbound/public-http/routes/site/__tests__/pages.response-matrix.characterization.test.ts

### features/members/agent-tools.ts (157 lines)
- exports (3): AgentToolSideEffect, AgentToolDefinition, membersAgentToolCatalog
- re-exports: {AgentToolActorClassRule} from @jini-ai/core
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core
- same-folder imports: -
- imports leaving the folder: -
- prod importers (1): features/members/tool-registrations.ts
- test importers (3): assistant/__tests__/tool-registrations.contracts.test.ts, assistant/__tests__/tool-registrations.members.test.ts, features/members/__tests__/agent-tools.contract.test.ts

### features/members/auth-mail.ts (25 lines)
- exports (1): renderMemberAuthMail
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/platform/mail/email-template
- same-folder imports: -
- imports leaving the folder: -
- prod importers (1): features/members/write-service.ts
- test importers (0): -

### features/members/capability-card.ts (29 lines)
- exports (1): capabilityCard
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/agentic/core
- same-folder imports: -
- imports leaving the folder: -
- prod importers (1): server/runtime/composition/site-guide.ts
- test importers (0): -

### features/members/consent-service.ts (261 lines)
- exports (5): ConsentServiceDeps, requestConsent, confirmConsent, revokeConsent, checkConsent
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/primitives
- same-folder imports: features/members/ports.ts, features/members/types.ts
- imports leaving the folder: -
- prod importers (1): features/members/index.ts
- test importers (1): features/members/__tests__/consent-service.test.ts

### features/members/index.ts (134 lines)
- exports (0): -
- re-exports: {MemberPrincipalKind,
  MemberStatus,
  MemberRecord,
  MemberExternalIdentityRecord,
  MemberTierType,
  MemberTierStatus,
  MemberTierRecord,
  MemberSubscriptionStatus,
  MemberSubscriptionSource,
  MemberSubscriptionRecord,
  MemberSessionRecord,
  MagicLinkTokenRecord,
  MemberContentVisibility,
  MemberContentAccess,
  MemberContext,
  MemberAccessDecision,
  ConsentPurpose,
  ConsentStatus,
  ConsentEvidence,
  ConsentRevisionOp,
  MemberConsentRecord,
  MemberConsentRevisionRecord,} from ./types.js; {MemberAuthError,
  MemberReauthenticationRequiredError,
  MemberSignInUnavailableError,
  MemberValidationError,
  MemberConflictError,
  MemberNotFoundError,} from ./types.js; {MemberRepoPort,
  MemberExternalIdentityRepoPort,
  MemberTierRepoPort,
  MemberSubscriptionRepoPort,
  MemberSessionRepoPort,
  MagicLinkTokenRepoPort,
  MemberConsentRepoPort,
  MemberAccessResolver,
  MembersWriteServiceDeps,
  MembersWriteService,
  MemberSignInInput,
  MemberSignInResult,} from ./ports.js; {MailerPort, OutboundEmail} from ../../platform/mail/index.js; {createInMemoryCredentialLifecycle,
  InMemoryMagicLinkTokenRepo,
  InMemoryMemberConsentRepo,
  InMemoryMemberRepo,
  InMemoryMemberExternalIdentityRepo,
  InMemoryMemberSessionRepo,
  InMemoryMemberSubscriptionRepo,
  InMemoryMemberTierRepo,} from ./repo.memory.js; {SqliteMagicLinkTokenRepo,
  SqliteMemberConsentRepo,
  SqliteMemberRepo,
  SqliteMemberExternalIdentityRepo,
  SqliteMemberSessionRepo,
  SqliteMemberSubscriptionRepo,
  SqliteMemberTierRepo,} from ./repo.sqlite.js; {SqlMemberExternalIdentityRepo} from ./repo.js; {ConsoleMailerAdapter, type ConsoleMailerAdapterDeps} from ./mailer.console.js; {DefaultMemberAccessResolver, createMemberAccessResolver,
  resolvePostMemberAccess,
  type MemberAccessResolverDeps,} from ./access-resolver.js; {compSubscription,
  createMember,
  completeSignIn,
  issueMemberSession,
  notifyMemberCreated,
  disableMember,
  membersWriteService,
  requestSignInLink,
  prepareMemberChallenge,
  setSubscriptionStatus,
  updateProfile,} from ./write-service.js; {checkConsent,
  confirmConsent,
  requestConsent,
  revokeConsent,
  type ConsentServiceDeps,} from ./consent-service.js; {MembersSubscriberDirectory,
  type MembersSubscriberDirectoryDeps,} from ./subscriber-directory.js; {trashMember} from ./trash-member.js; {signInWithPassword, requestPasswordReset, resetPassword, setMemberPassword} from ./password-auth.js; {resolveMemberSession} from ./access-resolver.js
- tables touched: -
- lock keys: -
- flags: tovu-text
- npm/@jini-ai imports: -
- same-folder imports: features/members/access-resolver.ts, features/members/consent-service.ts, features/members/mailer.console.ts, features/members/password-auth.ts, features/members/ports.ts, features/members/repo.memory.ts, features/members/repo.sqlite.ts, features/members/repo.ts, features/members/subscriber-directory.ts, features/members/trash-member.ts, features/members/types.ts, features/members/write-service.ts
- imports leaving the folder: platform/mail/index.ts
- prod importers (44): assistant/site/public-content.ts, features/member-login/link-policy.ts, features/member-login/link-service.ts, features/seo/index.ts, features/site-search/access.ts, features/site-search/cms-document-source.ts, server/inbound/admin-http/http/members.ts, server/inbound/admin-http/routes/members/delete.ts, server/inbound/admin-http/routes/members/deps.ts, server/inbound/admin-http/routes/members/disable.ts, server/inbound/admin-http/routes/members/get-by-id.ts, server/inbound/admin-http/routes/members/request-magic-link.ts, server/inbound/admin-http/routes/posts/template-preview-render.ts, server/inbound/public-http/http/members.ts, server/inbound/public-http/routes/content/posts/get-by-slug.ts, server/inbound/public-http/routes/members/analytics.ts, server/inbound/public-http/routes/members/complete-sign-in.ts, server/inbound/public-http/routes/members/deps.ts, server/inbound/public-http/routes/members/forgot-password.ts, server/inbound/public-http/routes/members/me.ts, server/inbound/public-http/routes/members/oidc-deps.ts, server/inbound/public-http/routes/members/password-sign-in.ts, server/inbound/public-http/routes/members/reset-password.ts, server/inbound/public-http/routes/members/set-password.ts, server/inbound/public-http/routes/members/sign-in.ts, server/inbound/public-http/routes/members/unlink-identity.ts, server/inbound/public-http/routes/site/media-rendition.ts, server/inbound/public-http/routes/site/pages/handlers/home.ts, server/inbound/public-http/routes/site/pages/handlers/marketing.ts, server/inbound/public-http/routes/site/pages/handlers/post.ts, server/inbound/public-http/routes/site/pages/render-context/deps.ts, server/inbound/public-http/routes/site/pages/render-context/member-access.ts, server/inbound/public-http/routes/site/pages/render-context/post-previews.ts, server/inbound/public-http/routes/site/pages/static-tier.ts, server/inbound/public-http/routes/site/pages/template-render.ts, server/routes/types.ts, server/runtime/composition/app.ts, server/runtime/composition/deps.ts, server/runtime/composition/http-app/mount-members-newsletter.ts, server/runtime/composition/memory-deps/slices/member-secrets.ts, server/runtime/composition/modules/members.ts, server/runtime/composition/modules/site-assistant.ts, server/runtime/composition/peer-site-reads.ts, server/runtime/composition/visitor-page-targets.ts
- test importers (26): assistant/__tests__/tool-registrations.members.test.ts, assistant/site/__tests__/member-access.fixture.ts, features/mail-status/__tests__/mail-status-tool.test.ts, features/mail-status/__tests__/provider-tools.unit.test.ts, features/site-backup/__tests__/library-share.integration.test.ts, server/__tests__/media-original-video-route.test.ts, server/__tests__/media-rendition-gating-bypass.test.ts, server/__tests__/media-rendition-route.test.ts, server/__tests__/routes/bare-page-site-serving.test.ts, server/__tests__/routes/content-post-get-by-slug.test.ts, server/__tests__/routes/member-oidc-auth.test.ts, server/__tests__/routes/member-oidc-callback.unit.test.ts, server/__tests__/routes/member-password-auth.test.ts, server/__tests__/routes/members-auth.test.ts, server/__tests__/routes/members-public-complete-sign-in.test.ts, server/__tests__/routes/members-public-sign-in.test.ts, server/__tests__/unit/server-modules.unit.test.ts, server/inbound/admin-http/routes/members/__tests__/disable.test.ts, server/inbound/admin-http/routes/members/__tests__/disable.unit.test.ts, server/inbound/admin-http/routes/members/__tests__/unit/h4-magic-link.unit.test.ts, server/inbound/public-http/routes/members/__tests__/unit/h4-oidc.unit.test.ts, server/inbound/public-http/routes/site/__tests__/integration/media-replace-cache.integration.test.ts, server/inbound/public-http/routes/site/__tests__/member-pages.route.test.ts, server/inbound/public-http/routes/site/__tests__/pages.member-access.route.test.ts, server/inbound/public-http/routes/site/__tests__/pages.response-matrix.characterization.test.ts, server/inbound/public-http/routes/site/__tests__/static-post-previews-resolution.test.ts

### features/members/mailer.console.ts (93 lines)
- exports (2): ConsoleMailerAdapterDeps, ConsoleMailerAdapter
- tables touched: -
- lock keys: -
- flags: console, node:
- npm/@jini-ai imports: @jini-ai/core/primitives, node:crypto
- same-folder imports: -
- imports leaving the folder: platform/mail/index.ts
- prod importers (1): features/members/index.ts
- test importers (2): features/members/__tests__/magic-link-mail-off.test.ts, features/members/__tests__/mailer.console.test.ts

### features/members/password-auth.ts (204 lines)
- exports (4): signInWithPassword, requestPasswordReset, resetPassword, setMemberPassword
- tables touched: -
- lock keys: 125: await lifecycle.lockKey(`trash:member:${workspaceId}:${memberId}`);
- flags: -
- npm/@jini-ai imports: @jini-ai/core/primitives, @jini-ai/user-management/server
- same-folder imports: features/members/access-resolver.ts, features/members/ports.ts, features/members/types.ts, features/members/write-service.ts
- imports leaving the folder: -
- prod importers (1): features/members/index.ts
- test importers (2): features/members/__tests__/password-auth.test.ts, features/members/__tests__/password-lifecycle.dialects.test.ts

### features/members/ports.ts (329 lines)
- exports (12): MemberRepoPort, MemberExternalIdentityRepoPort, MemberTierRepoPort, MemberSubscriptionRepoPort, MemberSessionRepoPort, MagicLinkTokenRepoPort, MemberConsentRepoPort, MemberAccessResolver, MembersWriteServiceDeps, MemberSignInInput, MemberSignInResult, MembersWriteService
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/contracts/server/verified-origin, @jini-ai/core/list-page, @jini-ai/core/primitives, @jini-ai/db/kernel, @jini-ai/platform/mail, @jini-ai/user-management
- same-folder imports: features/members/types.ts
- imports leaving the folder: platform/mail/index.ts
- prod importers (10): features/members/access-resolver.ts, features/members/consent-service.ts, features/members/index.ts, features/members/password-auth.ts, features/members/repo.memory.ts, features/members/repo.ts, features/members/subscriber-directory.ts, features/members/tool-registrations.ts, features/members/trash-member.ts, features/members/write-service.ts
- test importers (10): features/members/__tests__/credentials-revocation.dialects.test.ts, features/members/__tests__/member-auth-repo.dialects.test.ts, features/members/__tests__/member-external-identities.contract.ts, features/members/__tests__/member-repo.list-cursor.test.ts, features/members/__tests__/password-auth.test.ts, features/members/__tests__/password-lifecycle.dialects.test.ts, features/members/__tests__/repo.contract.test.ts, features/members/__tests__/tier-repo.lost-update.test.ts, features/members/__tests__/write-service.test.ts, features/trash/__tests__/member-adapter.test.ts

### features/members/repo.memory.ts (508 lines)
- exports (8): createInMemoryCredentialLifecycle, InMemoryMemberExternalIdentityRepo, InMemoryMemberRepo, InMemoryMemberTierRepo, InMemoryMemberSubscriptionRepo, InMemoryMemberSessionRepo, InMemoryMagicLinkTokenRepo, InMemoryMemberConsentRepo
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/list-page, @jini-ai/core/optimistic-concurrency, @jini-ai/core/records
- same-folder imports: features/members/ports.ts, features/members/types.ts
- imports leaving the folder: -
- prod importers (1): features/members/index.ts
- test importers (23): features/member-login/__tests__/link-service.dialects.test.ts, features/member-login/__tests__/link-service.test.ts, features/members/__tests__/access-resolver.test.ts, features/members/__tests__/consent-service.test.ts, features/members/__tests__/credentials-revocation.dialects.test.ts, features/members/__tests__/magic-link-mail-off.test.ts, features/members/__tests__/member-auth-repo.dialects.test.ts, features/members/__tests__/member-external-identities.dialects.test.ts, features/members/__tests__/member-repo.list-cursor.test.ts, features/members/__tests__/password-auth.test.ts, features/members/__tests__/password-lifecycle.dialects.test.ts, features/members/__tests__/repo.contract.test.ts, features/members/__tests__/repo.memory.test.ts, features/members/__tests__/subscriber-directory.test.ts, features/members/__tests__/tier-repo.lost-update.test.ts, features/members/__tests__/tool-registrations.model-facing-errors.test.ts, features/members/__tests__/write-service.guards.test.ts, features/members/__tests__/write-service.test.ts, features/trash/__tests__/member-adapter.test.ts, platform/mail/__tests__/integration/purpose-scoped-mailer-call-sites.integration.test.ts, server/inbound/public-http/routes/commerce/__tests__/purchase.integration.test.ts, server/inbound/public-http/routes/commerce/__tests__/settlement.integration.test.ts, server/inbound/public-http/routes/members/__tests__/unit/h4-oidc.unit.test.ts

### features/members/subscriber-directory.ts (133 lines)
- exports (2): MembersSubscriberDirectoryDeps, MembersSubscriberDirectory
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: features/members/ports.ts, features/members/types.ts
- imports leaving the folder: features/newsletter/index.ts
- prod importers (1): features/members/index.ts
- test importers (1): features/members/__tests__/subscriber-directory.test.ts

### features/members/tool-registrations.ts (332 lines)
- exports (7): MagicLinkRateLimiter, MembersToolDeps, MembersWriteServiceSourceDeps, buildMembersWriteServiceDeps, membersDerivedRisk, buildMembersRegistrations, contributeMembersTools
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/core, @jini-ai/cms/trash, @jini-ai/core, @jini-ai/core/contracts/events, @jini-ai/core/list-page, @jini-ai/core/model-facing-tool-errors, @jini-ai/core/primitives, @jini-ai/diagnostics/observability
- same-folder imports: features/members/agent-tools.ts, features/members/ports.ts, features/members/trash-member.ts, features/members/types.ts, features/members/write-service.ts
- imports leaving the folder: contracts/core/tool-metadata/members.ts
- prod importers (3): assistant/tool-registrations.ts, server/inbound/admin-http/routes/members/deps.ts, server/runtime/composition/tool-catalog-manifest.ts
- test importers (4): assistant/__tests__/tool-registrations.members.test.ts, features/members/__tests__/magic-link-mail-off.test.ts, features/members/__tests__/tool-registrations.model-facing-errors.test.ts, features/trash/__tests__/member-adapter.test.ts

### features/members/trash-member.ts (24 lines)
- exports (1): trashMember
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/trash
- same-folder imports: features/members/ports.ts, features/members/types.ts
- imports leaving the folder: -
- prod importers (2): features/members/index.ts, features/members/tool-registrations.ts
- test importers (1): features/trash/__tests__/member-adapter.test.ts

### features/members/types.ts (326 lines)
- exports (28): MemberPrincipalKind, MemberStatus, MemberExternalIdentityRecord, MemberRecord, MemberTierType, MemberTierStatus, MemberTierRecord, MemberSubscriptionStatus, MemberSubscriptionSource, MemberSubscriptionRecord, MemberSessionRecord, MagicLinkTokenRecord, MemberContentVisibility, MemberContentAccess, MemberContext, MemberAccessDecision, MemberAuthError, MemberReauthenticationRequiredError, MemberSignInUnavailableError, MemberValidationError, MemberConflictError, MemberNotFoundError, ConsentPurpose, ConsentStatus, ConsentEvidence, MemberConsentRecord, ConsentRevisionOp, MemberConsentRevisionRecord
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/core/primitives, @jini-ai/user-management
- same-folder imports: -
- imports leaving the folder: -
- prod importers (13): features/members/access-resolver.ts, features/members/consent-service.ts, features/members/index.ts, features/members/password-auth.ts, features/members/ports.ts, features/members/repo.memory.ts, features/members/repo.rows.ts, features/members/repo.ts, features/members/subscriber-directory.ts, features/members/tool-registrations.ts, features/members/trash-member.ts, features/members/write-service.ts, server/runtime/composition/modules/site-search.ts
- test importers (17): features/member-login/__tests__/link-policy.test.ts, features/member-login/__tests__/link-service.test.ts, features/members/__tests__/access-resolver.test.ts, features/members/__tests__/consent-service.test.ts, features/members/__tests__/invariants.test.ts, features/members/__tests__/member-auth-repo.dialects.test.ts, features/members/__tests__/member-external-identities.contract.ts, features/members/__tests__/member-repo.list-cursor.test.ts, features/members/__tests__/password-auth.test.ts, features/members/__tests__/password-lifecycle.dialects.test.ts, features/members/__tests__/repo.dialects.test.ts, features/members/__tests__/repo.memory.test.ts, features/members/__tests__/subscriber-directory.test.ts, features/members/__tests__/tier-repo.lost-update.test.ts, features/members/__tests__/tool-registrations.model-facing-errors.test.ts, features/members/__tests__/write-service.guards.test.ts, features/members/__tests__/write-service.test.ts

### features/members/write-service.ts (677 lines)
- exports (10): memberPasswordHasher, dummyPasswordHash, createMember, memberChallengeStore, prepareMemberChallenge, requestMemberChallenge, consumeMemberChallenge, issueMemberSession, membersWriteService, notifyMemberCreated
- tables touched: -
- lock keys: -
- flags: node:
- npm/@jini-ai imports: @jini-ai/core/contracts/server/verified-origin, @jini-ai/core/primitives, @jini-ai/user-management, @jini-ai/user-management/server, node:crypto
- same-folder imports: features/members/auth-mail.ts, features/members/ports.ts, features/members/types.ts
- imports leaving the folder: platform/mail/index.ts
- prod importers (3): features/members/index.ts, features/members/password-auth.ts, features/members/tool-registrations.ts
- test importers (10): features/member-login/__tests__/link-service.test.ts, features/members/__tests__/credentials-revocation.dialects.test.ts, features/members/__tests__/password-auth.test.ts, features/members/__tests__/password-lifecycle.dialects.test.ts, features/members/__tests__/write-service.guards.test.ts, features/members/__tests__/write-service.test.ts, features/trash/__tests__/member-adapter.test.ts, platform/mail/__tests__/integration/purpose-scoped-mailer-call-sites.integration.test.ts, server/__tests__/routes/member-oidc-auth.test.ts, server/__tests__/routes/member-password-auth.test.ts

## Test files that import a file of this sheet (blob-guard each before editing)
| test | lines | blob |
|---|---|---|
| features/members/__tests__/access-resolver.test.ts | 418 | 89e4f85aa3e91612793805b4051959b5c29ac4db |
| features/members/__tests__/restart.integration.test.ts | 86 | 523fedf1b32a1edb481f8c0661abe3008330ffd2 |
| features/members/__tests__/write-service.test.ts | 1137 | 08702037e2e5d7d783a2ad7397b4dafaea1f6a32 |
| server/inbound/admin-http/routes/members/__tests__/disable.test.ts | 217 | 0224ac4bcb1fa8a476f38bdfecd2b218045c4eee |
| server/inbound/public-http/routes/site/__tests__/pages.response-matrix.characterization.test.ts | 376 | 8d05b7d6699ed210aacd3f51e112f25c0a632342 |
| assistant/__tests__/tool-registrations.contracts.test.ts | 897 | ad6d976fa9a8f9ff9a7a6f4a75642af3147a570a |
| assistant/__tests__/tool-registrations.members.test.ts | 451 | 1a77afccedd7b45e61c009a92a0ebc673bed157b |
| features/members/__tests__/agent-tools.contract.test.ts | 35 | edd24b618ba280a7daedc5c59455d27f632b75ed |
| features/members/__tests__/consent-service.test.ts | 292 | 2af33b12ed4b39b50a8996b458881341ba815e19 |
| assistant/site/__tests__/member-access.fixture.ts | 14 | f1c85de9c73586cd36c1f93fd6f50af59a2c1b65 |
| features/mail-status/__tests__/mail-status-tool.test.ts | 206 | 5a1abb071141aefe7d81a7759d89af31bcf68c4e |
| features/mail-status/__tests__/provider-tools.unit.test.ts | 159 | d6a25d8cb737a7365a388cb4511a15a6ae2ee1ff |
| features/site-backup/__tests__/library-share.integration.test.ts | 358 | fc14314bfc4bb7915cc7370365ff7b58dc7a69b4 |
| server/__tests__/media-original-video-route.test.ts | 312 | d183e39a6b26a540136d6fa98998850b05ad305c |
| server/__tests__/media-rendition-gating-bypass.test.ts | 798 | 7f956fb282ffcc32bcc93f61175b7ea4573a8bbc |
| server/__tests__/media-rendition-route.test.ts | 548 | da3683ba803db4096be131038dd9a00ba9cadd42 |
| server/__tests__/routes/bare-page-site-serving.test.ts | 266 | 35519a538f421cd77864fd47350db05d05b4e5c2 |
| server/__tests__/routes/content-post-get-by-slug.test.ts | 282 | be5e182c0ac5504e99fb788b7bff5fbb7fd17456 |
| server/__tests__/routes/member-oidc-auth.test.ts | 460 | a906a521aa885e64e4920f56fe7c53f7e2155f3e |
| server/__tests__/routes/member-oidc-callback.unit.test.ts | 83 | 75d2b948ebd57cf019f57c41f254a7922e2e1bac |
| server/__tests__/routes/member-password-auth.test.ts | 587 | ccba41091ae080d745d4aae3e3228c6fb632d09a |
| server/__tests__/routes/members-auth.test.ts | 430 | 49f84315cb52975238ae4263dd14d6443ed4b58a |
| server/__tests__/routes/members-public-complete-sign-in.test.ts | 337 | 413b8bd41a8e1be568d4af8defd615c44b4837a8 |
| server/__tests__/routes/members-public-sign-in.test.ts | 365 | beb42193d7602326a4d6c1e9b14605d01a2e9e4f |
| server/__tests__/unit/server-modules.unit.test.ts | 99 | 655ed4065ffbdf81911ac0fafb0c85d05814ba9d |
| server/inbound/admin-http/routes/members/__tests__/disable.unit.test.ts | 40 | 0e3827946573099e858e058f9b5acb6ec8f97c78 |
| server/inbound/admin-http/routes/members/__tests__/unit/h4-magic-link.unit.test.ts | 56 | deeba1a69ab48a2453bc633ebf50e847550b6ba1 |
| server/inbound/public-http/routes/members/__tests__/unit/h4-oidc.unit.test.ts | 135 | fd0bcca830b4d840dbc4d3924fb03924e796229e |
| server/inbound/public-http/routes/site/__tests__/integration/media-replace-cache.integration.test.ts | 148 | 9c2eae529d7089a78d77733b7bce80f03e81c6d9 |
| server/inbound/public-http/routes/site/__tests__/member-pages.route.test.ts | 259 | 89766672c3de2f14be94d36d88ff82f2f7b60973 |
| server/inbound/public-http/routes/site/__tests__/pages.member-access.route.test.ts | 216 | a8d7073243c64975dd1290ef7e30b4b46c005cc2 |
| server/inbound/public-http/routes/site/__tests__/static-post-previews-resolution.test.ts | 393 | 011928a79010bc21b8ad22e447c7de27bdb13ac7 |
| features/members/__tests__/magic-link-mail-off.test.ts | 96 | 62bc6bd59f2487a73cd8a809a32a52afa219fc72 |
| features/members/__tests__/mailer.console.test.ts | 239 | e3cb39095b96eb9574694f419d8d5cc498f9060f |
| features/members/__tests__/password-auth.test.ts | 401 | d5a42e3ecf837ae4adc2ab55cf681f3edf4af814 |
| features/members/__tests__/password-lifecycle.dialects.test.ts | 240 | 9d0aeee1cdffa7e1b6921fbbabea2dc335afb3b0 |
| features/members/__tests__/credentials-revocation.dialects.test.ts | 135 | 9805806144f6df1d35ffdc2847f58b3998447b8e |
| features/members/__tests__/member-auth-repo.dialects.test.ts | 140 | a82c96d9b38e99fe4303557180031620b702980a |
| features/members/__tests__/member-external-identities.contract.ts | 116 | e16b5deaf44d088788c8727c4c8b4c23c44e166e |
| features/members/__tests__/member-repo.list-cursor.test.ts | 74 | e50d6485a037c59cda79a05d8c4d51f3bcd6407f |
| features/members/__tests__/repo.contract.test.ts | 464 | a7438828cc2390a151a08a9de87abd7cafae177b |
| features/members/__tests__/tier-repo.lost-update.test.ts | 64 | f19e2cb3cb15f3aac479a5ff598e37e536a5fbce |
| features/trash/__tests__/member-adapter.test.ts | 369 | f2658334970b73a7790ffe38f1f7967fdebbf336 |
| features/member-login/__tests__/link-service.dialects.test.ts | 55 | 6b9a5b54d58d5fcb933b28ba13d6d6e21c2ad872 |
| features/member-login/__tests__/link-service.test.ts | 280 | 6a208ebe6552551e9286c60f187338818e6dcdd3 |
| features/members/__tests__/member-external-identities.dialects.test.ts | 35 | d2b3c6f0ec9f59bb55dd73fb63f633751a350245 |
| features/members/__tests__/repo.memory.test.ts | 129 | b1842d90c930a26109301a3a14bff35430c6f658 |
| features/members/__tests__/subscriber-directory.test.ts | 146 | 2d8654448af675efa977ca2a11980dc300a8a91c |
| features/members/__tests__/tool-registrations.model-facing-errors.test.ts | 380 | 99a97b1fd7d0af9b0c74ce8901aa43b4d6d80690 |
| features/members/__tests__/write-service.guards.test.ts | 42 | 874a172fa137869c18d937b108a7d7e4be299199 |
| platform/mail/__tests__/integration/purpose-scoped-mailer-call-sites.integration.test.ts | 131 | c62c73438071c5bef139b8f9065f1545c31a2d74 |
| server/inbound/public-http/routes/commerce/__tests__/purchase.integration.test.ts | 214 | 6e537bccff5aa8db329a00f3ead22079f995234a |
| server/inbound/public-http/routes/commerce/__tests__/settlement.integration.test.ts | 234 | e4271dfaddd2d34c53ad69595da8e2dc4fa2a5e6 |
| features/member-login/__tests__/link-policy.test.ts | 41 | 47d6544eddf462edc2c4856b97d3e0699073ab77 |
| features/members/__tests__/invariants.test.ts | 159 | 1b3f0488c6e6a24fe997f7e4402745de2dbed598 |
| features/members/__tests__/repo.dialects.test.ts | 603 | f114d078a47484db4c2f027c58226d23fbcba23b |

## vi.mock / vi.doMock / importActual sites that name a file of this sheet (lesson 2: mock factories are consumers)
- none found by pattern (re-check with the census at execution)

## Path-keyed baselines / configs that name a file of this sheet (lesson 10: debt does not follow moved code silently)
- development/scripts/write-path-inventory.baseline.json: `src/features/members/consent-service.ts` at lines 2120, 2129, 2138, 2147, 2156, 2165, 2174, 2183, 2192, 2201, 2210, 2219, 2228, 2237, 2246, 2255, 2264, 2273 (18 hits)
- development/scripts/write-path-inventory.baseline.json: `src/features/members/mailer.console.ts` at lines 2282, 2291 (2 hits)
- development/scripts/write-path-inventory.baseline.json: `src/features/members/repo.memory.ts` at lines 2300, 2309 (2 hits)
- development/scripts/write-path-inventory.baseline.json: `src/features/members/write-service.ts` at lines 2416, 2425, 2434, 2443, 2452, 2461, 2470, 2479, 2488, 2497, 2506, 2515, 2524, 2533, 2542, 2551, 2560, 2569, 2578, 2587, 2596, 2605 (22 hits)
- development/scripts/check-architecture.baseline.json: `src/features/members/access-resolver.ts` at lines 370 (1 hits)
- development/scripts/check-architecture.baseline.json: `src/features/members/auth-mail.ts` at lines 217 (1 hits)
- development/scripts/check-architecture.baseline.json: `src/features/members/index.ts` at lines 305 (1 hits)
- development/scripts/check-architecture.baseline.json: `src/features/members/ports.ts` at lines 209 (1 hits)
- development/scripts/check-architecture.baseline.json: `src/features/members/subscriber-directory.ts` at lines 218 (1 hits)
- development/scripts/check-architecture.baseline.json: `src/features/members/types.ts` at lines 208, 210, 368 (3 hits)
- development/scripts/check-architecture.baseline.json: `src/features/members/write-service.ts` at lines 211 (1 hits)
- development/scripts/size-debt.json: `src/features/members/tool-registrations.ts` at lines 887 (1 hits)

## Census command (run from the Tovu clone root; every hit must be listed above)
```
rg -n --no-heading -e 'access\-resolver|agent\-tools|auth\-mail|capability\-card|consent\-service|index|mailer\.console|password\-auth|ports|repo\.memory|subscriber\-directory|tool\-registrations|trash\-member|types|write\-service' apps development scripts --glob '!**/node_modules/**' -g '*.ts' -g '*.tsx' -g '*.json' -g '*.mjs' -g '*.cjs' | rg 'members'
```
