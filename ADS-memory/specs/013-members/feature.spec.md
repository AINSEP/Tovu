# Feature Spec: Members (Front-End Membership — As-Built)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-013 |
| version | 1.0.0 |
| status | APPROVED |
| content_hash | sha256:4223c9dd7808b2a49977075b897ed237e979ce83b611ac6b4a963dd6b82eb5b1 |
| feature_name | FEAT-013-members |
| last_edited | 2026-07-13T00:00:00Z |
| owner | Leona Burime |
| spec_agent | Spec Agent |
| spec_mode | reverse_spec |

> **[NEEDS CLARIFICATION] vs Open Questions:** inline `[NEEDS CLARIFICATION]` markers block Software
> Architect dispatch; Open Questions carry an owner + date and do not block. This spec has zero
> inline clarification markers — every requirement below is sourced directly from committed code.

---

## Overview

**This is as-built documentation of a shipped (but partial) feature.** Members was implemented
directly from ADR-030 (ACCEPTED 2026-07-10) without a formal SPEC-NNN package; this spec captures
what the code actually does today, not a new design. It documents `src/members/` (the domain
library — magic-link sign-in, tiers, subscriptions, sessions, the fail-closed content-access
decision), the four wired admin HTTP routes, and the 51-line read-only admin Members table. Several
things ADR-030 decided are **not** implemented in code; each is called out explicitly below rather
than assumed present.

---

## Problem Statement

**Current state:** Members shipped as real code (`src/members/`, `src/server/routes/admin/members/`,
`apps/admin/src/sections/Members.tsx`) governed only by ADR-030's prose. No spec package exists, so
there is no testable, hash-anchored source of truth for what Members actually does — downstream
changes (fixing the D1c consent gap, wiring `completeSignIn` to a public route, adding a
SQLite/Drizzle adapter) have nothing precise to diff against or extend.

**Desired state:** A standard spec package — REQs/ACs/INVs/ECs sourced from the real code — that
lets future Members work (Red-Team, `/plan`, TDD) proceed against a spec instead of re-reading the
ADR and guessing what landed.

**Why now:** Coordinator-directed backfill sweep of ADR-030-derived features that shipped without a
spec package (mirrors the SPEC-007 Settings backfill pattern). No external deadline.

**Success signal:** A developer unfamiliar with `src/members/` can read this package and know, without
reading the ADR or the source, exactly which of ADR-030's decisions are implemented, partially
implemented, or not implemented at all — confirmed by the traceability matrix citing real files and
tests.

---

## User Journey

Two journeys exist in the code today; only one is reachable end-to-end via HTTP.

**Journey A — Operator manages members from the admin panel (reachable today):**
1. **Trigger:** An operator with an authenticated admin session opens Admin → Members.
2. **Steps:**
   1. `Members.tsx` calls `GET /api/admin/v1/workspaces/:workspaceId/members` on mount.
   2. The screen renders a table of every member's email, name, status, and created-at.
   3. There is no row action in the UI — no disable button, no resend-magic-link button, no
      tier/subscription control.
3. **Outcome:** The operator sees a read-only roster. To disable a member, view one member's detail,
   or resend a sign-in link, an operator must call the underlying HTTP API directly (`POST
   .../members/:id/disable`, `GET .../members/:id`, `POST .../members/request-magic-link`) — none of
   these are reachable from the UI.
4. **Alternate paths:** If the list fetch fails, the screen shows an inline error notice instead of
   the table (`error instanceof Error ? e.message : "failed to load members"`).

**Journey B — A visitor signs in as a member (NOT reachable today):**
1. **Trigger:** ADR-030 describes a visitor requesting a passwordless magic-link sign-in on a public
   member origin.
2. **Steps (as coded, not as wired):** `requestSignInLink(email)` mints a hashed, 15-minute token and
   mails a relative link (`/auth/magic?token=...`, no origin prefix — REQ-14). `completeSignIn(token)`
   would consume the token, promote the member to `active`, and mint a session.
3. **Outcome today:** `requestSignInLink` is reachable only as an **operator-triggered admin action**
   (`POST /api/admin/v1/.../members/request-magic-link`, e.g. an admin's "resend sign-in link"
   button that does not exist in the UI either). `completeSignIn` has **no HTTP route anywhere in
   this codebase** — a visitor who clicks the mailed link has nowhere to submit the token. No member
   session can be created, and no member-facing page can ever authenticate, through any route that
   exists today.
4. **Alternate paths:** N/A — the flow cannot be started by an unauthenticated visitor at all; the
   admin-only trigger is the only reachable entry point.

Note: deterministic default values (magic-link TTL, session TTL), the fail-closed access-decision
precedence, and the anti-enumeration constant-response rule are specified in `behavior.spec.md`.

---

## Scope

**In scope (documents what exists today):**
- `MemberRecord`/`MemberTierRecord`/`MemberSubscriptionRecord`/`MemberSessionRecord`/
  `MagicLinkTokenRecord` domain types and in-memory repo adapters (`src/members/types.ts`,
  `repo.memory.ts`).
- `MembersWriteService`: `requestSignInLink`, `completeSignIn`, `updateProfile`, `disableMember`,
  `compSubscription`, `setSubscriptionStatus` (`src/members/write-service.ts`).
- `DefaultMemberAccessResolver`: `resolveContext` + fail-closed `decide` (`src/members/access-resolver.ts`).
- `ConsoleMailerAdapter` (dev-mode `MailerPort` adapter, `src/members/mailer.console.ts`).
- `MembersSubscriberDirectory` (Newsletter's `SubscriberDirectoryPort` implementation,
  `src/members/subscriber-directory.ts`).
- Four wired admin HTTP routes: list, get-by-id, disable, request-magic-link
  (`src/server/routes/admin/members/*.ts`), including their actual auth/permission gating.
- The admin Members screen (`apps/admin/src/sections/Members.tsx`) exactly as it renders today.
- The registered `member.manage` permission string (`src/identity/permissions.ts`).
- Explicit documentation of what ADR-030 decided but the code does not implement: `member_consents`
  (D1c), the magic-link rate limiter (OQ-8), a SQLite/Drizzle repo adapter, the `completeSignIn`
  public route, and the `MemberAccessResolver` read-chokepoint wiring.

**Out of scope:**
- Designing or implementing any of the not-yet-built pieces above — this spec documents the gap, it
  does not close it. Closing any gap is a future spec.
- Billing/payments (ADR-030 §6 defers this to a Tier-3 plugin; nothing in `src/members/` references
  a payment provider).
- Password/2FA auth, drip content release, member-portal richness, bulk member import (all named
  ADR-030 deferrals with no code today).
- The `AudienceDirectoryPort`/`getContacts(query:{consentPurpose?})` extension from the ADR-030
  Round-2 fold — not implemented (see REQ-15).

---

## Requirements

- REQ-01: A front-end member is represented by a `MemberRecord` with `status ∈ {pending, active,
  disabled}`; the write service never hard-deletes a member — `disableMember` only ever sets
  `status='disabled'`.
- REQ-02: `requestSignInLink(email)` mints a single-use, SHA-256-hashed, 15-minute-TTL magic-link
  token for the given email; if no `MemberRecord` exists for that email, it first creates one with
  `status='pending'` so the token's `memberId` foreign key is always valid; it always resolves
  `{ delivered: true }` regardless of whether the email is registered, the account is disabled, or
  the mailer send fails.
- REQ-03: `completeSignIn(token)` rejects a token that is not found, already consumed, or expired,
  each with a distinct message on `MemberAuthError`; on success it marks the token consumed, promotes
  a `pending` member to `active` and stamps `emailVerifiedAt` (a non-pending member's status is left
  unchanged), and mints a `MemberSessionRecord` whose `tokenHash` is a SHA-256 digest of a freshly
  generated raw token with a 30-day expiry from the current time.
- REQ-04: `disableMember(memberId)` is idempotent — disabling an already-`disabled` member returns
  the unchanged record without error — and on a live member it sets `status='disabled'` and revokes
  every session for that member via `MemberSessionRepoPort.revokeAllForMember`.
- REQ-05: `compSubscription(memberId, tierId)` rejects a tier that does not exist
  (`MemberNotFoundError`), rejects a tier whose `status !== 'active'` (`MemberValidationError`), and
  rejects a duplicate active/comped subscription to the same tier for the same member
  (`MemberConflictError`); otherwise it creates a `MemberSubscriptionRecord` with `status='comped'`,
  `source='comp'`.
- REQ-06: `setSubscriptionStatus(subscriptionId, status)` rejects a `status` value outside
  `{active, canceled, expired, comped}` (`MemberValidationError`) and a subscription id that does not
  resolve (`MemberNotFoundError`); on success it updates the subscription's `status`, optionally its
  `externalRef`, and stamps `canceledAt` only when the new status is `canceled`.
- REQ-07: `DefaultMemberAccessResolver.decide({access, context})` returns `allowed=true` for
  `visibility='public'` unconditionally; for `'members'` it allows only when
  `context.isAuthenticated`; for `'paid'` it allows only when `context.isAuthenticated &&
  context.isPaid`; for `'tiers'` it allows only when `context.isAuthenticated` and at least one of
  `access.tierIds` is present in `context.activeTierIds`; any `visibility` value outside this set is
  denied with `reason='unknown_visibility'` and `teaser=false`.
- REQ-08: `DefaultMemberAccessResolver.resolveContext({sessionToken})` returns the anonymous context
  (`isAuthenticated=false, activeTierIds=[], isPaid=false`) when `sessionToken` is absent, when no
  session matches its SHA-256 hash, when the matched session has `revokedAt` set, or when the
  matched session's `expiresAt` is at or before the provided `nowIso`; only a session that passes all
  four checks resolves an authenticated context, whose `activeTierIds` comes from
  `listActiveByMember` and whose `isPaid` is true iff any active tier's `type === 'paid'`.
- REQ-09: The admin HTTP surface registers exactly four member routes, all mounted under
  `/api/admin/v1/workspaces/:workspaceId/members` and all behind the `/api/admin` prefix's
  `requireAdminSession` middleware: `GET /` (list), `GET /:memberId` (get by id), `POST
  /:memberId/disable`, and `POST /request-magic-link`.
- REQ-10: Of the four admin member routes, only `POST /:memberId/disable` calls `authorize()` (with
  permission `member.manage`) before acting; `GET /`, `GET /:memberId`, and `POST
  /request-magic-link` perform no additional per-action permission check beyond the shared
  `requireAdminSession` session check.
- REQ-11: The admin Members screen (`apps/admin/src/sections/Members.tsx`) fetches the member list
  once on mount and renders a table with exactly four columns — Email, Name (`"—"` when absent),
  Status, Created (`createdAt` truncated to `YYYY-MM-DD HH:MM`) — and contains no interactive control
  (no disable action, no resend-link action, no tier/subscription UI, no session/detail view).
- REQ-12: `toAdminMemberResponse` serializes a `MemberRecord` to an `AdminMemberResponse` that
  excludes `note` and `fields`, and structurally cannot include any session/token field because
  `MemberRecord` carries none.
- REQ-13: `MembersSubscriberDirectory.getContact`/`getContacts` implement Newsletter's
  `SubscriberDirectoryPort`, projecting each resolved member as `{subscriberId: member.id, email:
  member.email, emailDeliverable}` where `emailDeliverable = (member.status === 'active' &&
  Boolean(member.emailVerifiedAt))`; unknown subscriber ids are silently omitted from
  `getContacts`'s result rather than erroring.
- REQ-14: The registered operator permission catalog (`src/identity/permissions.ts`) contains exactly
  one Members-related string, `member.manage` (owner `core`), governing "Manage front-end members and
  subscriptions" — there is no `members.*` bundle and no `admin.members.*` string in the catalog.
- REQ-15: No route in this codebase calls `completeSignIn`, and no route in this codebase constructs
  a `DefaultMemberAccessResolver` or calls `resolveContext`/`decide` against an `entries` read — both
  functions are exported and unit-tested but have zero HTTP callers in `src/server/`.
- REQ-16: No file under `src/members/` defines or references a `member_consents` table, a consent
  purpose, or a `members.consent.request/confirm/revoke` call — ADR-030's D1c consent-ledger decision
  has no corresponding code.
- REQ-17: No rate limiter, throttle, or per-email/per-IP request counter exists anywhere in
  `src/members/` or `src/server/routes/admin/members/`; the only anti-enumeration mitigation present
  is `requestSignInLink`'s constant `{ delivered: true }` response (REQ-02).
- REQ-18: All five members repo ports (`Member`, `MemberTier`, `MemberSubscription`,
  `MemberSession`, `MagicLinkToken`) have exactly one implementation each — an in-memory adapter
  (`src/members/repo.memory.ts`) — and `src/infra/db/schema.ts` defines no member-related table; no
  SQLite/Drizzle adapter exists for any of the five ports.

<!-- Add more as needed. Numbers must not be reused, even if a requirement is removed. -->

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given a member with `status='active'`, when `disableMember` is called, then
  the returned record has `status='disabled'` and an incremented `version`.
- AC-02 (REQ-01) [P1]: Given a member with `status='disabled'`, when `disableMember` is called again,
  then the same record is returned unchanged (no error, no version bump).
- AC-03 (REQ-02) [P1]: Given no `MemberRecord` exists for an email, when `requestSignInLink` is
  called with that email, then a new `MemberRecord` with `status='pending'` is created and a
  `MagicLinkTokenRecord` referencing its id is saved.
- AC-04 (REQ-02) [P1]: Given a member with `status='disabled'`, when `requestSignInLink` is called
  for their email, then the result is `{ delivered: true }` and no `MagicLinkTokenRecord` is saved and
  no mail is sent.
- AC-05 (REQ-02) [P2]: Given a registered, non-disabled member, when `requestSignInLink` is called,
  then the saved token's `expiresAt` is exactly 15 minutes after the clock's `nowIso`.
- AC-06 (REQ-03) [P1]: Given a token that has already been consumed, when `completeSignIn` is called
  with it, then a `MemberAuthError` with message `"sign-in link was already used"` is thrown and no
  session is created.
- AC-07 (REQ-03) [P1]: Given a token past its `expiresAt`, when `completeSignIn` is called with it,
  then a `MemberAuthError` with message `"sign-in link has expired"` is thrown.
- AC-08 (REQ-03) [P1]: Given a valid, unconsumed, unexpired token for a `pending` member, when
  `completeSignIn` is called, then the member's `status` becomes `active`, `emailVerifiedAt` is set,
  a `MemberSessionRecord` is saved with `expiresAt` 30 days after `nowIso`, and the returned
  `rawSessionToken`'s SHA-256 hash equals the saved session's `tokenHash`.
- AC-09 (REQ-04) [P1]: Given a member with two live (unrevoked) sessions, when `disableMember` is
  called, then both sessions have `revokedAt` set afterward.
- AC-10 (REQ-05) [P1]: Given a tier with `status='archived'`, when `compSubscription` is called for
  it, then a `MemberValidationError` is thrown and no subscription row is saved.
- AC-11 (REQ-05) [P1]: Given a member already holding an active subscription to tier T, when
  `compSubscription` is called again for the same member and tier, then a `MemberConflictError` is
  thrown.
- AC-12 (REQ-06) [P1]: Given a subscription status change to `'canceled'`, when
  `setSubscriptionStatus` is called, then the returned record has `canceledAt` set to the current
  clock time.
- AC-13 (REQ-07) [P1]: Given `access.visibility='public'`, when `decide` is called with an anonymous
  context, then `allowed=true` and `teaser=false`.
- AC-14 (REQ-07) [P1]: Given `access.visibility='members'` and an anonymous context, when `decide` is
  called, then `allowed=false`, `reason='sign_in_required'`, `teaser=true`.
- AC-15 (REQ-07) [P1]: Given `access.visibility='paid'` and an authenticated non-paid context, when
  `decide` is called, then `allowed=false`, `reason='upgrade_required'`, `teaser=true`.
- AC-16 (REQ-07) [P1]: Given `access.visibility` is a value outside `{public, members, paid, tiers}`,
  when `decide` is called with any context, then `allowed=false`, `reason='unknown_visibility'`,
  `teaser=false`.
- AC-17 (REQ-08) [P1]: Given a session whose `revokedAt` is set, when `resolveContext` is called with
  its raw token, then the anonymous context is returned.
- AC-18 (REQ-08) [P1]: Given a session whose `expiresAt` is before `nowIso`, when `resolveContext` is
  called with its raw token, then the anonymous context is returned.
- AC-19 (REQ-09) [P1]: Given no admin session cookie, when any
  `/api/admin/v1/workspaces/:workspaceId/members*` route is called, then the request is rejected by
  `requireAdminSession` before the route handler runs.
- AC-20 (REQ-10) [P1]: Given an authenticated admin session lacking `member.manage`, when `POST
  /members/:id/disable` is called, then the response is `403` with `code='FORBIDDEN'`.
- AC-21 (REQ-10) [P2]: Given an authenticated admin session lacking `member.manage`, when `GET
  /members` is called, then the response is `200` with the member list (no permission check blocks
  it).
- AC-22 (REQ-11) [P1]: Given the members API returns an empty array, when `Members.tsx` renders, then
  the table renders with zero body rows and no empty-state message beyond the empty table.
- AC-23 (REQ-11) [P1]: Given the members API call rejects, when `Members.tsx` renders, then a
  `div.notice.error` is shown instead of the table, and no partial table is rendered.
- AC-24 (REQ-12) [P1]: Given a `MemberRecord` with a `note` and `fields` set, when
  `toAdminMemberResponse` serializes it, then the returned object has no `note` and no `fields` key.
- AC-25 (REQ-13) [P1]: Given a member with `status='active'` and no `emailVerifiedAt`, when
  `MembersSubscriberDirectory.getContact` resolves it, then `emailDeliverable=false`.
- AC-26 (REQ-13) [P2]: Given a `subscriberIds` array containing an id with no matching member, when
  `getContacts` is called, then the returned array omits that id with no error thrown.
- AC-27 (REQ-15) [P1]: Given the full `src/server/` route tree, when searched for a call site of
  `completeSignIn`, then zero call sites exist outside `src/members/__tests__/`.
- AC-28 (REQ-16) [P1]: Given `src/members/` searched for the string `consent` (case-insensitive),
  when the search runs, then zero matches exist outside comments describing the gap.
- AC-29 (REQ-18) [P1]: Given `src/infra/db/schema.ts`, when searched for a table definition whose
  name starts with `member`, then zero matches exist.

<!-- Rules:
  - Every REQ-* has at least one AC.
  - Every AC has a [P1], [P2], or [P3] tag.
  - P1 ACs are independently testable — each can be verified without other stories complete.
  - No AC requires knowledge of the implementation to evaluate.
  - AC numbers are never reused.
-->

---

## Invariants

- INV-01: A `MemberRecord` must never be hard-deleted by any code path in `src/members/` — the only
  lifecycle-removal operation is `disableMember`, which sets `status='disabled'`.
- INV-02: A `MagicLinkTokenRecord` must never be consumable twice — `completeSignIn` must always
  reject a token whose `consumedAt` is already set.
- INV-03: A raw magic-link token and a raw member-session token must never be persisted — only their
  SHA-256 hash may be stored in `MagicLinkTokenRecord.tokenHash` / `MemberSessionRecord.tokenHash`.
- INV-04: `DefaultMemberAccessResolver.decide` must never return `allowed=true` for a `visibility`
  value outside `{public, members, paid, tiers}` — an unrecognized value must always deny.
- INV-05: `resolveContext` must never derive `MemberContext` from any input other than a session
  lookup keyed by the hash of a caller-supplied token — it must never trust a client-asserted
  `memberId` or tier list.
- INV-06: `requestSignInLink` must always return the same `{ delivered: true }` shape regardless of
  whether the target email is registered, disabled, or the mail send failed.
- INV-07: A member principal record (`MemberRecord`) must never carry a `role` or `permissions`
  field, and the `members` public barrel (`src/members/index.ts`) must never export a symbol whose
  name matches `/role|permission|rbac|authorize/i`.

---

## Edge Cases

- EC-01: What happens when `requestSignInLink` is called for an email with an existing `pending`
  member (a repeat request before the first link is ever used)? Expected behavior: no second
  `MemberRecord` is created (the existing `pending` row is reused); a new token is minted and saved.
- EC-02: What happens when `completeSignIn` is called with a token whose `memberId` does not resolve
  to any `MemberRecord`? Expected behavior: `MemberNotFoundError` is thrown (documented in
  `write-service.ts` as a defensive case that "should not happen" given `requestSignInLink` always
  pre-creates the member).
- EC-03: What happens when `disableMember` is called for a member id that does not exist? Expected
  behavior: `MemberNotFoundError` is thrown; no session revocation is attempted.
- EC-04: What happens when `updateProfile` is called with `name` set to a whitespace-only string?
  Expected behavior: `MemberValidationError` is thrown ("name must not be blank when provided"); no
  write occurs.
- EC-05: What happens when the admin `GET /members` route receives a `workspaceId` path param that
  does not match the server's configured `deps.workspaceId`? Expected behavior: `404` with `{error:
  "workspace was not found"}`; the member repo is never queried.
- EC-06: What happens when the admin `POST /request-magic-link` route receives a syntactically
  invalid `email` in the body? Expected behavior: `400` with the `MemberValidationError` message; no
  token is minted.
- EC-07: What happens when `InMemoryMemberSubscriptionRepo.listActiveByMember` is asked for
  subscriptions where `currentPeriodEnd` is set and in the past? Expected behavior: that subscription
  is excluded from the active/entitlement set even if its `status` is still `'active'` or `'comped'`
  (defense-in-depth against a missed expiry transition).
- EC-08: What happens when a visitor obtains a raw magic-link token from the mailed link today (given
  REQ-15)? Expected behavior: there is no route to submit it — the token can only ever be consumed by
  a test harness calling `completeSignIn` directly; a real visitor cannot complete sign-in through any
  running HTTP endpoint.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| `../mail` (`MailerPort`, ADR-037) | The shared mailer contract `ConsoleMailerAdapter` implements and `requestSignInLink` sends through | Magic-link email cannot be delivered | Console-logged send (dev adapter) is the only implementation in v1 |
| `src/server/middleware/dev-auth.ts` (`requireAdminSession`, `getAuthedPrincipal`) | Admin session gating for all four member routes; `getAuthedPrincipal` supplies the calling principal to `disable.ts`'s `authorize()` call | No admin route would be reachable at all | none — blocks every admin member route |
| `src/identity` (`AuthorizeFn`, `member.manage` catalog entry) | The single permission check `disable.ts` performs | Disable action could not be gated | none — blocks REQ-10's permission check |
| `../newsletter/ports` (`SubscriberDirectoryPort`) | The interface `MembersSubscriberDirectory` implements for Newsletter's audience materialization | Newsletter could not resolve subscriber contacts from Members | none — Newsletter has no other subscriber source today |
| `src/server/routes/types.ts` (`RouteDeps`) | Declares `memberRepo`/`memberTierRepo`/`memberSubscriptionRepo`/`memberSessionRepo`/`magicLinkRepo`/`mailer` directly (already landed, contrary to the stale comment in `src/server/routes/admin/members/deps.ts` claiming it is not yet declared) | N/A — already satisfied | N/A |

---

## Open Questions

- OQ-01: Should `completeSignIn` get a public (non-admin) HTTP route in the next Members iteration,
  and on which origin, given no `core/origin` (ADR-040) primitive exists yet to build an
  origin-aware link? — Owner: Leona Burime — Resolve by: 2026-08-01.
- OQ-02: Should `GET /members` and `GET /members/:id` be gated behind an explicit `member.manage` (or
  a new `member.read`) permission, closing the REQ-10 gap where only `disable` is permission-checked?
  — Owner: Leona Burime — Resolve by: 2026-08-01.
- OQ-03: Does the `member.manage` permission string get renamed to fit the frozen
  `admin.{section}.{action}` convention (`sweep-crosscutting-decisions-20260710.md` line 71) in a
  dedicated migration spec, given renaming is a breaking grant-data migration? — Owner: Leona
  Burime — Resolve by: 2026-08-01.

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No custom crypto/session library; uses `node:crypto` `createHash`/`randomBytes` directly for hashing/tokens, consistent with the rest of the codebase's session handling. |
| II — Test-First | EXCEPTION | This spec documents already-shipped code written before a spec package existed (ADR-030 direct-to-code, per the dispatch brief); Article II's certified-tests-before-code discipline was not followed historically. Going forward, any change to this feature must re-derive certified tests from this spec first. |
| III — Simplicity Gate | COMPLIES | Every module traces to an ADR-030 decision (repo ports, write service, resolver, mailer adapter, subscriber-directory seam); no speculative abstraction beyond the rule-of-two repo shape. |
| IV — Anti-Abstraction Gate | COMPLIES | Repo ports have two adapters on the roadmap (in-memory now; SQLite next, REQ-18 documents it is not yet built) — a documented rule-of-two plan, not yet fulfilled; `MemberAccessResolver` and `MembersWriteService` are deliberately NOT ports (single evaluator, ADR-006 "no PolicyPort" reasoning), matching Article IV's intent. |
| V — Integration-First Testing | EXCEPTION | The write-service and resolver are unit-tested against in-memory repos (`__tests__/*.test.ts`); the four admin HTTP routes have no integration-level test in this codebase today — traceability.spec.md marks this gap explicitly per route. |
| VI — Security-by-Default | EXCEPTION | Per the Article VI standing v1 exception, all four member routes sit behind `requireAdminSession`, but only `disable` performs a per-action `authorize()` check (REQ-10) — `list`, `get-by-id`, and `request-magic-link` do not. This is flagged as OQ-02, not silently accepted. |
| VII — Spec Integrity | COMPLIES | This package carries `spec_id: SPEC-013` and a hash anchor; the validator computes and verifies `content_hash`. |
| VIII — Observability | EXCEPTION | No structured error codes or correlation ids are emitted by the members write paths today (errors are typed JS Error subclasses only); `errors.spec.md` documents the current unstructured state and what a future pass would need to add. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (verified against existing `ADS-memory/reports/pipeline/` folders — 001…009 exist; 013 matches the fixed FEAT number in the dispatch directive)
- [x] version set to correct semver
- [x] status set to APPROVED (documents already-shipped code, not a pending design)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete
- [x] traceability.spec.md complete (rows populated from real files/tests — this is as-built, not pending)
- [x] spec-manifest.md complete — all 10 logical files listed with PRESENT or OMITTED and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row reserved for Planning Preflight
- [x] spec_mode is reverse_spec; brownfield evidence paths recorded in spec-manifest.md

**Gate result:** PASS

---

## Agent Directives (optional)

Always:
- Treat every REQ/AC in this file as a description of current behavior, not a target — a future
  change to Members must bump `version` and update the affected REQ/AC, not silently drift from it.

Ask before:
- Wiring `completeSignIn` or `MemberAccessResolver` to any new public route — OQ-01 is unresolved and
  the origin/link-building primitive (ADR-040) this needs does not exist yet.

Never:
- Treat this spec's EXCEPTION rows (Article II/V/VI/VIII) as resolved without a human decision — they
  are disclosed gaps, not accepted permanent state.
