# members Overview

Owns the front-end membership slice: a distinct `member` principal (never an
operator), passwordless magic-link sign-in, membership tiers, subscriptions
(free/comp v1; billing deferred), member sessions isolated from the admin
session, and the fail-closed content-gating decision (ADR-030).

## Responsibilities

- Mint and consume single-use, short-TTL, hashed magic-link sign-in tokens.
- Mint and validate hashed member sessions, distinct from the admin session.
- Own the member/tier/subscription write chokepoint (validated CRUD, disable-only
  lifecycle, comp entitlements).
- Resolve a request's `MemberContext` from a session token and decide content
  visibility (`public`/`members`/`paid`/`tiers`) fail-closed.
- Deliver magic-link + lifecycle email through the shared `MailerPort` (`../mail`).

## Rules

- A member is never hard-deleted — disable-only (ADR-021 §5 lineage). See
  `disableMember` in `write-service.ts`.
- Raw magic-link tokens and raw session tokens are **never stored** — only a
  SHA-256 hash is persisted (`MagicLinkTokenRecord.tokenHash`,
  `MemberSessionRecord.tokenHash`). See `hashToken` in `write-service.ts` /
  `access-resolver.ts`.
- `MemberAccessResolver.decide` fails closed: any visibility value outside the
  known `public | members | paid | tiers` union denies, with no teaser.
- A member holds no operator RBAC role or permission — it is governed by the
  entitlement axis only (active tier ids), never `authorize()`. Nothing in this
  library imports or references an operator permission string.
- Repositories stay behind the feature-owned ports (`ports.ts`); the write
  service is the only writer of member/tier/subscription/session/token rows.

## Known gaps flagged, not silently papered over

1. **`MagicLinkTokenRecord.memberId` vs "upsert-on-first-use" contradiction**
   (ADR-030 Round-2 fold). `types.ts` requires a non-optional `memberId` FK on
   the token, but a brand-new signup has no member row yet at request time.
   Resolution taken in `requestSignInLink` (`write-service.ts`): eagerly create
   a `pending` `MemberRecord` if none exists for the email, so the token always
   has a valid FK; `completeSignIn` promotes `pending -> active` and stamps
   `emailVerifiedAt` rather than literally creating the row. This satisfies the
   port as written, but the ADR's literal "upsert on first use" wording assumed
   creation happens at completion, not request, time — worth resolving formally
   in a future ADR-030 amendment.
2. **`completeSignIn`'s raw session token has no home in `MembersWriteService`'s
   declared return shape** (`{ member, session }` only — `session.tokenHash` is
   a hash, never the bearer value a caller needs to set as a cookie). This
   implementation's `completeSignIn` returns an additional `rawSessionToken`
   field (a structural superset, so it still satisfies `MembersWriteService`),
   but callers that need the cookie value must import the concrete function
   from `write-service.ts`, not just the `MembersWriteService` port type. Flag
   for a port-signature amendment.
3. **No `core/origin` port exists yet** in this repo (ADR-030 Round-2 fold names
   it, ADR-040). `requestSignInLink` builds a relative link path
   (`/auth/magic?token=...`); a caller must prepend the correct member-origin
   base URL until that primitive lands.
4. **Session TTL (30 days) is an unpinned default**, not specified anywhere in
   ADR-030 — chosen as a reasonable "remember me" duration. Revisit if a real
   value is pinned later.
5. **Magic-link rate-limiting / email-enumeration resistance is only partially
   addressed.** `requestSignInLink` always returns `{ delivered: true }`
   regardless of whether the email is registered/disabled/mail-accepted (the
   constant-response half of OQ-8's anti-enumeration mitigation). No
   rate-limiter exists yet — OQ-8 names this a hard pre-launch precondition,
   not built in this slice.
6. **No operator-permission/RBAC code exists yet in this repo** to test the
   "member-kind principal rejected by `authorize()`" invariant against directly
   (ADR-021's `principals`/`principal_roles` tables aren't implemented). See
   `__tests__/invariants.test.ts` for the structural placeholder test and a note
   on what to replace it with once that lands.

## Future direction

- SQLite/Drizzle adapters for all 5 repo ports (the rule-of-two second adapter).
- `MemberAccessResolver` wired into the actual site read chokepoint (currently
  callable, but nothing in the server yet invokes it against `entries`).
- A real origin-aware link builder once `core/origin` (ADR-040) lands.
- Tier-3 `plugins/billing` writing `source='billing'` subscription rows through
  the core chokepoint under a capability (ADR-030 §6) — no `PaymentProcessorPort`
  in this library, by design.
- Operator admin-gateway wiring for `members.*` permissions (ADR-018), including
  a rate-limiter for magic-link requests before public sign-up is enabled.

## Wiring

Sign-in and reset mail bodies render in Jini: `@jini-ai/user-management/members/auth-mail` `renderMemberAuthMail({ purpose, link, code?, renderEmailForSend })`. `member-challenge-request.ts` injects `renderEmailForSend` from `@jini-ai/platform/mail/email-template`; Jini never imports the renderer or host code. The feature's records, ports, in-memory repos, access resolver, consent service, admin writes, credentials, challenge store, sign-in, password auth, Trash bridge, agent tool catalog and capability card now live in `@jini-ai/user-management/members/<module>` (one leaf subpath each: `types`, `ports`, `repo.memory`, `access-resolver`, `consent-service`, `member-admin-writes`, `member-credentials`, `member-challenge`, `member-sign-in`, `member-validation`, `password-auth`, `trash-member`, `agent-tools`, `capability-card`). There is no barrel: import each leaf directly.

What stays here, and what Tovu binds:
- `repo.ts`, `repo.rows.ts`, `repo.sqlite.ts`: the SQL adapters. They type against the host's Kysely `ContentDatabase`/`ContentKernel` and call `keepStoredRevocation`, and `@jini-ai/user-management` carries no SQL storage seam yet.
- `member-challenge-request.ts`: binds the host mail transport (`isMailDeliveryAvailable`, `mailSenderIdentityFor` from `platform/mail`) and the Jini renderer into the challenge flow.
- `write-service.ts`: composes `membersWriteService` from the Jini functions plus `member-challenge-request.ts`.
- `subscriber-directory.ts`: implements the newsletter feature's `SubscriberDirectoryPort`, which has no Jini owner yet.
- `tool-registrations.ts`: the assistant tool contributor. It binds `@jini-ai/cms/core` permission/error helpers and the host tool metadata.
- Every composition passes `MembersWriteServiceDeps` (`buildMembersWriteServiceDeps`): repos, clock, ids, the positional mailer, optional `mailStatus`, `origin`, `senderIdentity`, `principals`, and `credentialLifecycle` (the content kernel, typed as core `StorageKernel`'s `transaction`/`lockKey`).

```ts
import { renderMemberAuthMail } from "@jini-ai/user-management/members/auth-mail";
import { renderEmailForSend } from "@jini-ai/platform/mail/email-template";
const body = renderMemberAuthMail({ purpose: "signin", link, code: secrets.code, renderEmailForSend });
```

Why the split: Jini `docs/decisions/DR-005-portable-package-boundaries.md`.
