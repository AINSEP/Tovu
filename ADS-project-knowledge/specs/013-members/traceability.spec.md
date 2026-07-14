# Traceability Matrix: Members (As-Built)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-013 |
| feature_name | FEAT-013-members |
| version | 1.0.0 |
| content_hash | anchored in feature.spec.md |
| last_edited | 2026-07-13T00:00:00Z |
| traceability_status | IN PROGRESS |

**Purpose:** Because this is reverse-spec/as-built documentation, this matrix is filled with the
*real* implementation and test references that already exist, not "pending" placeholders. Rows
without a real test are marked `IMPLEMENTED` (not `TESTED`) and listed again in §6.2 as an untested
gap — this file does not claim coverage that does not exist.

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Member represented by `MemberRecord`, disable-only | — | `src/members/types.ts`, `write-service.ts` | `MemberRecord`, `disableMember` | `src/members/__tests__/write-service.test.ts` | "disableMember is disable-only (idempotent, never hard-deleted) and revokes live sessions" | TESTED |
| AC-01 (REQ-01) | disableMember sets status='disabled' | P1 | `write-service.ts` | `disableMember` | `write-service.test.ts` | "disableMember is disable-only..." | TESTED |
| AC-02 (REQ-01) | disableMember idempotent on already-disabled | P1 | `write-service.ts` | `disableMember` | `write-service.test.ts` | "disableMember is disable-only..." | TESTED |
| REQ-02 | requestSignInLink mints hashed 15-min token, pre-creates pending member, constant response | — | `write-service.ts` | `requestSignInLink` | `write-service.test.ts` | "requestSignInLink -> completeSignIn happy path...", "requestSignInLink for a disabled member is a silent no-op..." | TESTED |
| AC-03 (REQ-02) | New member row created on first request | P1 | `write-service.ts` | `requestSignInLink` | `write-service.test.ts` | "requestSignInLink -> completeSignIn happy path..." | TESTED |
| AC-04 (REQ-02) | Disabled member: constant response, no token/mail | P1 | `write-service.ts` | `requestSignInLink` | `write-service.test.ts` | "requestSignInLink for a disabled member is a silent no-op..." | TESTED |
| AC-05 (REQ-02) | Token expiresAt = nowIso + 15min | P2 | `write-service.ts` | `requestSignInLink` (`MAGIC_LINK_TTL_MS`) | — | — | IMPLEMENTED (no dedicated assertion on the exact TTL delta found in `write-service.test.ts`) |
| REQ-03 | completeSignIn: consume once, promote pending->active, mint session | — | `write-service.ts` | `completeSignIn` | `write-service.test.ts` | "requestSignInLink -> completeSignIn happy path...", "completeSignIn rejects an expired...", "...already-consumed...", "...unknown token" | TESTED |
| AC-06 (REQ-03) | Already-consumed token rejected | P1 | `write-service.ts` | `completeSignIn` | `write-service.test.ts` | "completeSignIn rejects an already-consumed magic-link token (single-use)" | TESTED |
| AC-07 (REQ-03) | Expired token rejected | P1 | `write-service.ts` | `completeSignIn` | `write-service.test.ts` | "completeSignIn rejects an expired magic-link token" | TESTED |
| AC-08 (REQ-03) | Successful sign-in: active + emailVerifiedAt + session hash match | P1 | `write-service.ts` | `completeSignIn` | `write-service.test.ts` | "requestSignInLink -> completeSignIn happy path: hashes both tokens at rest and activates a pending member" | TESTED |
| REQ-04 | disableMember idempotent + revokes all sessions | — | `write-service.ts` | `disableMember` | `write-service.test.ts` | "disableMember is disable-only (idempotent, never hard-deleted) and revokes live sessions" | TESTED |
| AC-09 (REQ-04) | Two live sessions both revoked | P1 | `write-service.ts` | `disableMember` | `write-service.test.ts` | "disableMember is disable-only..." | TESTED |
| REQ-05 | compSubscription rejects archived tier + duplicate | — | `write-service.ts` | `compSubscription` | `write-service.test.ts` | "compSubscription rejects an archived tier and a duplicate active subscription" | TESTED |
| AC-10 (REQ-05) | Archived tier rejected | P1 | `write-service.ts` | `compSubscription` | `write-service.test.ts` | "compSubscription rejects an archived tier and a duplicate active subscription" | TESTED |
| AC-11 (REQ-05) | Duplicate active subscription rejected | P1 | `write-service.ts` | `compSubscription` | `write-service.test.ts` | same test | TESTED |
| REQ-06 | setSubscriptionStatus updates status, stamps canceledAt | — | `write-service.ts` | `setSubscriptionStatus` | `write-service.test.ts` | "setSubscriptionStatus updates status, stamps canceledAt on cancel, and rejects unknown ids/values" | TESTED |
| AC-12 (REQ-06) | canceledAt stamped on cancel | P1 | `write-service.ts` | `setSubscriptionStatus` | `write-service.test.ts` | same test | TESTED |
| REQ-07 | decide() fail-closed on 4 visibility values | — | `access-resolver.ts` | `DefaultMemberAccessResolver.decide` | `access-resolver.test.ts` | "decide: public visibility...", "decide: members visibility...", "decide: paid visibility...", "decide: tiers visibility...", "decide: an unknown/unparseable visibility value fails closed with no teaser" | TESTED |
| AC-13 (REQ-07) | public always allowed | P1 | `access-resolver.ts` | `decide` | `access-resolver.test.ts` | "decide: public visibility always allows, authenticated or not" | TESTED |
| AC-14 (REQ-07) | members + anonymous denied w/ teaser | P1 | `access-resolver.ts` | `decide` | `access-resolver.test.ts` | "decide: members visibility requires isAuthenticated, offers a teaser when denied" | TESTED |
| AC-15 (REQ-07) | paid + authenticated-non-paid denied, upgrade_required | P1 | `access-resolver.ts` | `decide` | `access-resolver.test.ts` | "decide: paid visibility requires isAuthenticated AND isPaid" | TESTED |
| AC-16 (REQ-07) | unknown visibility denied, no teaser | P1 | `access-resolver.ts` | `decide` | `access-resolver.test.ts` | "decide: an unknown/unparseable visibility value fails closed with no teaser" | TESTED |
| REQ-08 | resolveContext derives context only from a validated session | — | `access-resolver.ts` | `DefaultMemberAccessResolver.resolveContext` | `access-resolver.test.ts` | "resolveContext returns the anonymous context when no session token is supplied", "...for an unknown token", "...for a revoked or expired session", "...returns an authenticated context..." | TESTED |
| AC-17 (REQ-08) | Revoked session -> anonymous | P1 | `access-resolver.ts` | `resolveContext` | `access-resolver.test.ts` | "resolveContext returns the anonymous context for a revoked or expired session" | TESTED |
| AC-18 (REQ-08) | Expired session -> anonymous | P1 | `access-resolver.ts` | `resolveContext` | `access-resolver.test.ts` | same test | TESTED |
| REQ-09 | Four admin routes registered under requireAdminSession | — | `src/server/routes/admin/members/*.ts`, `src/server/app.ts` | `registerAdminMember{List,Get,Disable,RequestMagicLink}Route` | `src/server/__tests__/routes/members-auth.test.ts` | (all tests in file) | TESTED (FEAT-013 Phase 1 — route-level integration tests added, closing the Article V EXCEPTION for these 4 routes specifically) |
| AC-19 (REQ-09) | No session -> rejected before handler | P1 | `src/server/middleware/dev-auth.ts` | `requireAdminSession` | `members-auth.test.ts` | (uses `requireAdminSession` via `buildTestApp`) | TESTED |
| REQ-10 | **SUPERSEDED by FEAT-013 (ADR-PIPE-013 Decision §1)** — all four admin routes now uniformly check `authorize({permission:'member.manage',...})`, not disable-only | — | `src/server/routes/admin/members/{list,get-by-id,disable,request-magic-link}.ts` | route handlers | `members-auth.test.ts` | (all tests in file) | TESTED |
| AC-20 (REQ-10) | Missing member.manage -> 403 FORBIDDEN (disable.ts, pre-existing, re-confirmed no regression) | P1 | `disable.ts` | route handler | `members-auth.test.ts` | "AC-20 (pre-existing, re-confirmed): POST disable still denied 403 FORBIDDEN without member.manage" | TESTED |
| AC-21 (REQ-10) | **SUPERSEDED 2026-07-13 (FEAT-013 Phase 1, the one deliberate breaking change this remediation makes)** — `list.ts` (and `get-by-id.ts`, `request-magic-link.ts`) previously had no permission check; a caller with a valid admin session but no `member.manage` now gets `403` instead of `200`. Original row retained below for history. | P2 | `list.ts`, `get-by-id.ts`, `request-magic-link.ts` | route handlers | `members-auth.test.ts` | "T003: GET members list denied 403 FORBIDDEN without member.manage...", "T004: GET member-by-id denied 403...", "T005: POST request-magic-link denied 403..." | TESTED — supersedes the original "IMPLEMENTED (no permission check)" finding |
| REQ-11 | Members.tsx read-only 4-column table, no controls | — | `apps/admin/src/sections/Members.tsx` | `Members` | — | — | IMPLEMENTED (no frontend test file found for this component) |
| AC-22 (REQ-11) | Empty array -> empty table | P1 | `Members.tsx` | `Members` | — | — | IMPLEMENTED (no test) |
| AC-23 (REQ-11) | Fetch rejection -> error notice, no table | P1 | `Members.tsx` | `Members` | — | — | IMPLEMENTED (no test) |
| REQ-12 | toAdminMemberResponse excludes note/fields/session | — | `src/server/http/admin/members.ts` | `toAdminMemberResponse` | — | — | IMPLEMENTED (no dedicated serializer test found) |
| AC-24 (REQ-12) | note/fields excluded from response | P1 | `admin/members.ts` | `toAdminMemberResponse` | — | — | IMPLEMENTED (no test) |
| REQ-13 | MembersSubscriberDirectory projects {subscriberId,email,emailDeliverable} | — | `src/members/subscriber-directory.ts` | `MembersSubscriberDirectory.getContact/getContacts` | `subscriber-directory.test.ts` | "getContact: an active + verified member is emailDeliverable, subscriberId = memberId", "getContact: an unverified member is not emailDeliverable", "getContact: a disabled member (even if previously verified) is not emailDeliverable" | TESTED |
| AC-25 (REQ-13) | active+unverified -> not deliverable | P1 | `subscriber-directory.ts` | `isEmailDeliverable` | `subscriber-directory.test.ts` | "getContact: an unverified member is not emailDeliverable" | TESTED |
| AC-26 (REQ-13) | Unknown id omitted from getContacts | P2 | `subscriber-directory.ts` | `getContacts` | `subscriber-directory.test.ts` | "getContacts: unknown ids are silently omitted from the result, not errored or null-padded" | TESTED |
| REQ-14 | member.manage is the sole registered permission string | — | `src/identity/permissions.ts` | `BASE_CATALOG` | — | — | IMPLEMENTED (no catalog-content test cited; verified by direct source read) |
| REQ-15 | **SUPERSEDED 2026-07-13 (FEAT-013 Phase 2)** — `completeSignIn` now has a real public HTTP caller (`registerPublicMemberCompleteSignInRoute`); a coupled public `requestSignInLink` route was also added (a gap the original ADR-030 dispatch brief did not name) | — | `src/server/routes/members/{sign-in,complete-sign-in}.ts` | `registerPublicMemberSignInRequestRoute`, `registerPublicMemberCompleteSignInRoute` | `src/server/__tests__/routes/members-public-sign-in.test.ts`, `members-public-complete-sign-in.test.ts` | (all tests in both files) | TESTED |
| AC-27 (REQ-15) | **SUPERSEDED** — `completeSignIn` now has a real HTTP call site (see REQ-15 row) | P1 | `routes/members/complete-sign-in.ts` | `registerPublicMemberCompleteSignInRoute` | `members-public-complete-sign-in.test.ts` | "T016/INV-NEW-01: complete-sign-in sets ONLY tovu_member_session, never tovu_session" | TESTED |
| REQ-16 | **SUPERSEDED 2026-07-13 (FEAT-013 Phase 3, D1c)** — `member_consents` + `consent-service.ts` now exist (`requestConsent`/`confirmConsent`/`revokeConsent`/`checkConsent`) | — | `src/members/consent-service.ts`, `types.ts`, `ports.ts`, `repo.memory.ts` | `requestConsent`, `confirmConsent`, `revokeConsent`, `checkConsent` | `src/members/__tests__/consent-service.test.ts` | (all tests in file) | TESTED |
| REQ-17 | **SUPERSEDED 2026-07-13 (FEAT-013 Phase 2, ADR-030 OQ-8's hard pre-launch precondition)** — `MAGIC_LINK_PER_EMAIL`/`MAGIC_LINK_PER_IP`/`MAGIC_LINK_COMPLETE_ATTEMPT` rate-limit profiles now exist and are wired into both the admin and public routes | — | `src/server/middleware/rate-limit.ts` | `MAGIC_LINK_PER_EMAIL`, `MAGIC_LINK_PER_IP`, `MAGIC_LINK_COMPLETE_ATTEMPT` | `rate-limit.test.ts`, `members-public-sign-in.test.ts`, `members-public-complete-sign-in.test.ts`, `members-auth.test.ts` | "T010/T011/T012...", "T015/W-002...", "T016/W-004...", "T017/INV-NEW-03..." | TESTED |
| AC-28 (REQ-16) | **SUPERSEDED** — consent code now exists (see REQ-16 row); INV-NEW-02 (no path to `granted` except via `requestConsent` then `confirmConsent`) is the load-bearing invariant this remediation certifies | P1 | `consent-service.ts` | `confirmConsent` | `consent-service.test.ts` | "T029/INV-NEW-02: confirmConsent with no prior requestConsent throws MemberNotFoundError and creates no row" | TESTED |
| REQ-18 | **SUPERSEDED 2026-07-13 (FEAT-013 Phase 4, Article IV rule-of-two)** — `src/members/repo.sqlite.ts` now implements all 6 ports (5 pre-existing + `MemberConsentRepoPort`); NOT wired into `server/app.ts`'s boot path (ADR-PIPE-013 Decision §5 — deliberate, matches `SqlitePostRepo`'s own still-unwired precedent) | — | `src/members/repo.sqlite.ts`, `src/infra/db/schema.ts` | `SqliteMemberRepo`, `SqliteMemberTierRepo`, `SqliteMemberSubscriptionRepo`, `SqliteMemberSessionRepo`, `SqliteMagicLinkTokenRepo`, `SqliteMemberConsentRepo` | `src/members/__tests__/repo.contract.test.ts` | (all tests in file, run against both `repo.memory.ts` and `repo.sqlite.ts`) | TESTED |
| AC-29 (REQ-18) | **SUPERSEDED** — 7 member-prefixed tables now exist in `schema.ts` (`members`, `member_tiers`, `member_subscriptions`, `member_sessions`, `member_magic_tokens`, `member_consents`, `member_revisions`) | P1 | `src/infra/db/schema.ts` | (table definitions) | `repo.contract.test.ts` | (all `[Sqlite*]`-prefixed tests) | TESTED |

---

## 1a. FEAT-013 Remediation — New Contract Traceability (C-001..C-016)

Added 2026-07-13 (T041, ADR-PIPE-013 / tasks.md). Every contract ID from the implementation
outline's Contract Map now has a real file + test reference — none are placeholders.

| Contract ID | Description | Impl File | Test File | Status |
|---|---|---|---|---|
| C-001 | `MemberConsentRecord`, `ConsentPurpose`, `ConsentStatus`, `ConsentEvidence` types | `src/members/types.ts` | (type-only; exercised by C-002..C-006's tests) | TESTED (via consumers) |
| C-002 | `MemberConsentRepoPort` (rule-of-two seam) | `src/members/ports.ts` | `src/members/__tests__/repo.contract.test.ts` | TESTED |
| C-003 | `requestConsent` | `src/members/consent-service.ts` | `consent-service.test.ts` | TESTED |
| C-004 | `confirmConsent` (the ONLY path to `granted`, INV-NEW-02) | `consent-service.ts` | `consent-service.test.ts` | TESTED |
| C-005 | `revokeConsent` (idempotent) | `consent-service.ts` | `consent-service.test.ts` | TESTED |
| C-006 | `checkConsent` (total function) | `consent-service.ts` | `consent-service.test.ts` | TESTED |
| C-007 | `requestSignInLink` (modified — origin-fallback) | `src/members/write-service.ts` | `write-service.test.ts` | TESTED |
| C-008/009/010 | `MAGIC_LINK_PER_EMAIL`/`_PER_IP`/`COMPLETE_ATTEMPT` | `src/server/middleware/rate-limit.ts` | `rate-limit.test.ts` | TESTED |
| C-011 | `request-magic-link.ts` (modified — authz + rate limit) | `src/server/routes/admin/members/request-magic-link.ts` | `members-auth.test.ts` | TESTED |
| C-012 | `registerPublicMemberSignInRequestRoute` | `src/server/routes/members/sign-in.ts` | `members-public-sign-in.test.ts` | TESTED |
| C-013 | `registerPublicMemberCompleteSignInRoute` | `src/server/routes/members/complete-sign-in.ts` | `members-public-complete-sign-in.test.ts` | TESTED |
| C-014 | `PublicMemberResponse` serializer | `src/server/http/members.ts` | `members-public-complete-sign-in.test.ts` | TESTED |
| C-015 | Rate-limit wiring (shared instance, admin + public) | `src/server/app.ts`, `routes/admin/members/deps.ts`, `routes/members/deps.ts` | `members-auth.test.ts` ("T017/INV-NEW-03...") | TESTED |
| C-016 | `Members.tsx` row actions (disable, resend-link, detail-expand) | `apps/admin/src/sections/Members.tsx` | — (no frontend test runner; manual `/verify` pass, T040) | IMPLEMENTED (manual verification only, matches `Settings.tsx` precedent) |

---

## 2. Invariant Traceability

| INV ID | Invariant | Test File | Test ID | Status |
|--------|-----------|-----------|---------|--------|
| INV-01 | Member never hard-deleted, disable-only | `write-service.test.ts` | "disableMember is disable-only (idempotent, never hard-deleted) and revokes live sessions" | TESTED |
| INV-02 | Magic-link token never consumable twice | `write-service.test.ts` | "completeSignIn rejects an already-consumed magic-link token (single-use)" | TESTED |
| INV-03 | Raw tokens never persisted, only SHA-256 hash | `write-service.test.ts` | "requestSignInLink -> completeSignIn happy path: hashes both tokens at rest and activates a pending member" | TESTED |
| INV-04 | decide() never allows unknown visibility | `access-resolver.test.ts` | "decide: an unknown/unparseable visibility value fails closed with no teaser" | TESTED |
| INV-05 | resolveContext never trusts a client claim | `access-resolver.test.ts` | "resolveContext returns the anonymous context for an unknown token" | TESTED |
| INV-06 | requestSignInLink always constant-shaped response — **EXTENDED 2026-07-13 (FEAT-013 Phase 2)** to also hold across the new rate-limit and origin-fallback code paths: a `429` is a volume signal, never an existence signal | `write-service.test.ts`, `members-public-sign-in.test.ts` | "requestSignInLink for a disabled member is a silent no-op...", "T013: requestSignInLink falls back to a relative link...", "INV-06: a registered and an unregistered email both get {delivered:true}...", "INV-06: a registered and an unregistered email both get 429 identically once exceeded" | TESTED |
| INV-07 | MemberRecord/barrel carry no role/permission symbol | `invariants.test.ts` | "members barrel exports no RBAC role/permission symbol (ADR-030 §2, structural check)", "MemberRecord and MemberContext carry no role/permission field..." | TESTED (structural placeholder — see file header noting this replaces a real authorize()-rejection test once ADR-021's principal-kind extension lands) |
| INV-NEW-01 `[internal-invariant]` | Cookie-family isolation — the public member-route family never sets/reads `tovu_session`; the admin route family never sets/reads `tovu_member_session` (ADR-030 §3, added FEAT-013 Phase 2) | `members-public-complete-sign-in.test.ts` | "T016/INV-NEW-01: complete-sign-in sets ONLY tovu_member_session, never tovu_session", "INV-NEW-01: a request carrying only a tovu_session (admin) cookie, no token, is rejected..." | TESTED |
| INV-NEW-02 `[internal-invariant]` | Consent grant path — `member_consents.status` may only become `'granted'` via `confirmConsent`, only from an existing `'pending'` row (crosscutting sweep §B, added FEAT-013 Phase 3) | `consent-service.test.ts` | "T028/INV-NEW-02...", "T029/INV-NEW-02: confirmConsent with no prior requestConsent throws MemberNotFoundError and creates no row", "confirmConsent on an already-granted purpose... throws MemberNotFoundError, never re-grants" | TESTED |
| INV-NEW-03 `[internal-invariant]` | Authz-before-rate-limit ordering — `authorize()` must run before the `MAGIC_LINK_PER_EMAIL` check on the admin request-magic-link route, so an unauthorized caller cannot consume rate-limit budget as a side channel (added FEAT-013 Phase 1-2) | `members-auth.test.ts` | "T017/INV-NEW-03: an unauthorized caller's 403 on request-magic-link does not consume the MAGIC_LINK_PER_EMAIL window for that email" | TESTED |

---

## 3. Edge Case Traceability

| EC ID | Edge Case | Test File | Test ID | Status |
|-------|-----------|-----------|---------|--------|
| EC-01 | Repeat requestSignInLink reuses pending member | — | — | IMPLEMENTED (no dedicated test isolating "no second row created"; implied by the happy-path test's single-call structure) |
| EC-02 | completeSignIn with dangling memberId -> MemberNotFoundError | — | — | IMPLEMENTED (no test — documented in source as "should not happen," defensive-only) |
| EC-03 | disableMember on unknown id -> MemberNotFoundError | `write-service.test.ts` | "disableMember rejects an unknown member id" | TESTED |
| EC-04 | updateProfile blank name -> MemberValidationError | `write-service.test.ts` | "updateProfile rejects a blank name and a missing member" | TESTED |
| EC-05 | Mismatched workspaceId path param -> 404 | — | — | IMPLEMENTED (no route-level test) |
| EC-06 | Malformed email on request-magic-link -> 400 | `write-service.test.ts` | "requestSignInLink rejects a malformed email" | TESTED (at the write-service level; no route-level HTTP test) |
| EC-07 | listActiveByMember excludes past-currentPeriodEnd rows | — | — | IMPLEMENTED (no dedicated test found in `repo.memory.test.ts` for this specific defensive filter) |
| EC-08 | No route exists to consume a mailed magic-link token | (absence) | n/a | IMPLEMENTED (verified by repo-wide grep for `completeSignIn` callers) |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| `WORKSPACE_NOT_FOUND` | Inline check in all 4 route files | — | — | IMPLEMENTED (no test) |
| `MEMBER_NOT_FOUND` | `types.ts` `MemberNotFoundError`; `get-by-id.ts`, `disable.ts` | `write-service.test.ts` | "disableMember rejects an unknown member id", "updateProfile rejects a blank name and a missing member" | TESTED (domain layer only; no route-level test) |
| `MEMBER_VALIDATION_ERROR` | `types.ts` `MemberValidationError`; `disable.ts`, `request-magic-link.ts` | `write-service.test.ts` | "requestSignInLink rejects a malformed email", "compSubscription rejects an archived tier..." | TESTED (domain layer only) |
| `MEMBER_CONFLICT` | `types.ts` `MemberConflictError` | `write-service.test.ts` | "compSubscription rejects an archived tier and a duplicate active subscription" | TESTED (unreachable via HTTP — see errors.spec.md) |
| `MEMBER_AUTH_ERROR` | `types.ts` `MemberAuthError` | `write-service.test.ts` | "completeSignIn rejects an expired...", "...already-consumed...", "...unknown token" | TESTED (unreachable via HTTP — see errors.spec.md) |
| `FORBIDDEN` | `disable.ts` inline `authorize()` branch | — | — | IMPLEMENTED (no test) |
| `INTERNAL_ERROR` | Generic `catch` in all 4 routes | — | — | IMPLEMENTED (no test) |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| decide() visibility evaluation order | § 1.1 | `access-resolver.test.ts` | (all `decide:` tests) | TESTED |
| requestSignInLink re-request precedence (disabled/existing/new) | § 1.2 | `write-service.test.ts` | "requestSignInLink -> completeSignIn happy path...", "requestSignInLink for a disabled member..." | TESTED (partial — new-pending branch covered by happy path; explicit "existing non-disabled member reused" branch not isolated in its own test) |
| Member list default id-ascending order | § 2.1 | `repo.memory.test.ts` | "InMemoryMemberRepo.list paginates by id cursor within a workspace" | TESTED |
| MAGIC_LINK_TTL_MS / SESSION_TTL_MS defaults | § 3 | — | — | IMPLEMENTED (no test asserts the exact TTL constants) |
| DEFAULT_LIST_LIMIT clamp (not reject) | § 4 | `repo.memory.test.ts` | "InMemoryMemberRepo.list paginates by id cursor within a workspace" | TESTED (paginates; explicit >100 clamp case not isolated) |
| Duplicate comp-subscription dedup rule | § 5.1 | `write-service.test.ts` | "compSubscription rejects an archived tier and a duplicate active subscription" | TESTED |
| Email-uniqueness race (undocumented gap) | § 5.2 | — | — | IMPLEMENTED (disclosed gap; no test exists because no fix exists) |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements

| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| — | — | — | — |

None — every REQ in this package describes code that already exists (this is as-built documentation,
not forward design). Items that describe an *absence* (REQ-15/16/17/18) are fully "implemented" in
the sense that the absence is verified, not pending.

### 6.2 Untested Requirements

| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|----------------|-------------------|-------|
| ~~REQ-09/AC-19~~ | **CLOSED 2026-07-13 (FEAT-013 Phase 1)** — `members-auth.test.ts` now provides route-level integration tests for all 4 admin member routes | 2026-07-13 | Leona Burime |
| ~~REQ-10/AC-20/AC-21~~ | **CLOSED 2026-07-13 (FEAT-013 Phase 1)** — all 4 routes' permission gating (including the newly-added checks) is route-level tested; see the Section 1 rows for AC-20/AC-21 | 2026-07-13 | Leona Burime |
| REQ-11/AC-22/AC-23 | `Members.tsx` gained 3 new row actions (FEAT-013 Phase 5, T039) but still has no frontend test file — `apps/admin` has no test runner configured at all (confirmed no `vitest`/`jest`); matches the `Settings.tsx` precedent (SPEC-007 T045). Manual `/verify` pass substitutes (T040). | N/A — no frontend test infra exists in this repo | Leona Burime |
| REQ-12/AC-24 | No dedicated test for `toAdminMemberResponse`'s field exclusion (unchanged by this remediation — `PublicMemberResponse`'s NEW, stricter serializer IS tested, see `members-public-complete-sign-in.test.ts`'s "PublicMemberResponse excludes..." test) | 2026-08-01 | Leona Burime |
| EC-05 | No route-level test for the workspaceId-mismatch 404 branch **on the pre-existing 4 admin routes' original EC-05 framing** — note the new public routes' equivalent 404 branch IS tested (`members-public-sign-in.test.ts`/`members-public-complete-sign-in.test.ts`'s "404s on a workspace id that does not match..." tests), and `members-auth.test.ts`'s "mismatched :workspaceId 404s before authorize() runs" partially closes this for `list.ts` | 2026-08-01 | Leona Burime |
| EC-07 | No repo-level test isolating the past-`currentPeriodEnd` exclusion in `listActiveByMember` — **now covered** by `repo.contract.test.ts`'s "MemberSubscriptionRepoPort: listActiveByMember excludes a lapsed currentPeriodEnd" (FEAT-013 Phase 4) | CLOSED 2026-07-13 | Leona Burime |

### 6.3 Untested Error Codes

| Error Code | Reason Untested | Target Completion | Owner |
|------------|----------------|-------------------|-------|
| ~~`WORKSPACE_NOT_FOUND`~~ | **CLOSED 2026-07-13** — covered by `members-auth.test.ts`, `members-public-sign-in.test.ts`, `members-public-complete-sign-in.test.ts`'s 404 tests | 2026-07-13 | Leona Burime |
| ~~`FORBIDDEN`~~ | **CLOSED 2026-07-13 (FEAT-013 Phase 1)** — covered by `members-auth.test.ts` (all 4 routes, plus the AC-20 regression re-confirmation) | 2026-07-13 | Leona Burime |
| `INTERNAL_ERROR` | No route-level HTTP test exercises the generic catch branch (unchanged by this remediation — none of the new tests force an unexpected-error path) | 2026-08-01 | Leona Burime |
| `RATE_LIMIT_EXCEEDED` (NEW, FEAT-013 Phase 2) | N/A — tested | CLOSED 2026-07-13 | Leona Burime |
| `MEMBER_AUTH_ERROR` (now HTTP-reachable via the public complete-sign-in route, FEAT-013 Phase 2) | N/A — tested at the route level for the first time | CLOSED 2026-07-13 | Leona Burime |

### 6.4 Deferred Items

| REQ/AC ID | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| ~~OQ-01 (public completeSignIn route)~~ | **RESOLVED 2026-07-13** | ADR-PIPE-013 §2-3: built alongside a coupled public `requestSignInLink` route + rate limiting; `core/origin` (ADR-040) landed in the interim, unblocking this | Software Architect Agent (ADR-PIPE-013) |
| ~~OQ-02 (permission-gate list/get/request-magic-link)~~ | **RESOLVED 2026-07-13** | ADR-PIPE-013 §1: all 3 routes now require `member.manage` (coarse, single-permission — no `member.read` split; see ADR-PIPE-013 Pattern Evaluation) | Software Architect Agent (ADR-PIPE-013) |
| OQ-03 (rename member.manage to admin.members.*) | Not deferred — **RESOLVED as "no rename"** | ADR-PIPE-013 §6: `member.manage` stays exactly as registered, matching the actual landed flat `domain.verb` precedent Menus/Integrations already established (contradicts ADR-030/ADR-INDEX's stale `admin.members.*` prose — a separate governance-doc correction is owed, not this feature's job) | Software Architect Agent (ADR-PIPE-013) |
| Pagination (`afterId`/`limit` UI wiring) | Future Members UI spec | `apps/admin/src/lib/api.ts`'s `listMembers()` doesn't accept query params yet — a small client-contract change, deliberately out of FEAT-013's narrowly-scoped UI slice (ADR-PIPE-013 Decision §7) | Leona Burime (ADR-PIPE-013) |
| Full physical member/admin origin separation | Repo-wide, cross-cutting (no feature-specific owner yet) | No multi-origin serving infrastructure exists anywhere in this repo; FEAT-013 ships the achievable logical isolation instead (distinct cookie name, distinct route family) — see ADR-PIPE-013 Tradeoff Tension | Leona Burime (ADR-PIPE-013 Re-evaluation Trigger) |
| Flipping `app.ts`'s SQLite boot wiring for members | Repo-wide, cross-cutting (no feature has done this yet) | `SqlitePostRepo` exists too but `app.ts` still boots `InMemoryPostRepo` — making Members the first would be a unilateral infrastructure decision (ADR-PIPE-013 Decision §5) | Leona Burime (ADR-PIPE-013 Re-evaluation Trigger) |

---

## 7. Untraced Requirements

| REQ/AC ID | Reason Not In Matrix |
|-----------|---------------------|
| — | — |

Every REQ-* and AC-* from `feature.spec.md` appears in Section 1.

---

## 8. Traceability Completeness Checklist

- [x] All REQ-* from feature.spec.md appear in the Section 1 matrix
- [x] All AC-* from feature.spec.md appear in the Section 1 matrix
- [x] All INV-* from feature.spec.md appear in the Section 2 matrix
- [x] All EC-* from feature.spec.md appear in the Section 3 matrix
- [x] All error codes from errors.spec.md appear in the Section 4 matrix
- [x] All behavior rules from behavior.spec.md appear in the Section 5 matrix
- [x] Section 6.1 (unimplemented) is empty — this package documents only shipped behavior
- [ ] Section 6.2 (untested) is non-empty — 6 route/UI-level gaps remain untested; NOT blocking for
      an as-built spec (these are real coverage gaps in the shipped code, disclosed rather than
      fixed by this spec pass)
- [x] Section 6.3 (untested error codes) entries are listed with target dates
- [x] Section 7 (untraced) is empty
- [ ] All VERIFIED rows have been reviewed and signed off by the Code Review Agent — not run in this
      pass (spec-only backfill; no Code Review Agent dispatch occurred)

**[ ] TRACEABILITY COMPLETE** — not fully complete: §6.2/§6.3 list real, disclosed test gaps in
already-shipped code. This is expected for an as-built backfill and does not block the spec-dod gate
(see spec-dod.md Section E notes) — it is a punch list for a follow-up test-hardening pass, not a
spec defect.

---

## Sign-Off

| Role | Name / Agent | Date (ISO-8601) | Notes |
|------|--------------|-----------------|-------|
| Spec Agent | Spec Agent | 2026-07-13 | As-built package; all rows sourced from real files/tests as of this date. |
| TDD Agent | — | — | Not dispatched (backfill pass; no new tests commissioned by this spec). |
| Programmer Agent | — | — | Not dispatched (feature already shipped). |
| Code Review Agent | — | — | Not dispatched. |
| Coordinator | | | |
