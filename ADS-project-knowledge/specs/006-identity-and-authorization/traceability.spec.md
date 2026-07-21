# Traceability Matrix: Identity & Authorization

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->
<!-- Part of the spec-system package. Bound to feature.spec.md v0.5.6 (SPEC-006). -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-006 |
| feature_name | FEAT-006-identity-and-authorization |
| version | 0.6.0 |
| content_hash | not-tracked — feature.spec.md is the speckit hash anchor for this package |
| last_edited | 2026-07-21T00:00:00Z |
| traceability_status | PENDING IMPLEMENTATION |

**Purpose:** Traces every REQ/AC/INV/EC from `feature.spec.md` v0.6.0 to its implementation and
test. At spec stage (pre-TDD) every implementation/test cell is `pending` and every row status is
`PENDING`; the TDD and Programmer agents fill these during their stages. **0.6.0 note:** rows for
REQ-01..14/AC-01..26/INV-01..08/EC-01..13 were seeded `PENDING` at spec stage and were never
revisited after those transitions actually shipped (the pre-existing 8 users/roles/policies routes
+ core identity surface) — that backfill is out of scope for this amendment; only the new REQ-15..19/
AC-27..32/INV-09/EC-14..17 rows below are this amendment's responsibility.

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | `principals` root + `users` (argon2id); change_sets carries workspace_id | — | pending | pending | pending | pending | PENDING |
| REQ-02 | RBAC tables + direct `principal_policies` machine path | — | pending | pending | pending | pending | PENDING |
| REQ-03 | Code-registered permission catalog; unknown → PERMISSION_UNKNOWN | — | pending | pending | pending | pending | PENDING |
| REQ-04 | `authorize()` core fn; matcher; owner `*`; fail-closed | — | pending | pending | pending | pending | PENDING |
| REQ-05 | Gateway calls authorize() before idempotency; stamps actorId | — | pending | pending | pending | pending | PENDING |
| REQ-06 | Login/logout/session lifecycle; HttpOnly SameSite cookie | — | pending | pending | pending | pending | PENDING |
| REQ-07 | `GET auth/me` effective-permission introspection | — | pending | pending | pending | pending | PENDING |
| REQ-08 | API-key issuance/verify/revoke; principal-bound; INV-07 clamp | — | pending | pending | pending | pending | PENDING |
| REQ-09 | First-boot seed: system + disabled user-local + 4 built-ins + owner | — | pending | pending | pending | pending | PENDING |
| REQ-10 | Composite `(workspace_id, id)` FKs on every scoped join | — | pending | pending | pending | pending | PENDING |
| REQ-11 | Disable-only principals; no hard delete | — | pending | pending | pending | pending | PENDING |
| REQ-12 | `tovu permissions list` catalog enumeration | — | pending | pending | pending | pending | PENDING |
| REQ-13 | Non-HTTP (CLI/core) callers resolve to seeded owner principal; local-shell==owner | — | pending | pending | pending | pending | PENDING |
| REQ-14 | Rate limiting (LOGIN_STRICT/WRITE/READ); trusted-proxy client-IP rule | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-09) | Seed present; built-ins delete/edit/attach all fail; disabled user-local present | P1 | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-06) | Correct creds → session+cookie; wrong creds → 401, no session | P1 | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-05) | Editor PUT post → allowed; change-set actorId = editor principal | P1 | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-05) | Editor revert → not-allowed → 403 FORBIDDEN; no change | P1 | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-06) | Disable principal → existing session 401 on next request | P1 | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-08) | Raw key authenticates; revoke → 401 immediately; only hash stored | P1 | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-10) | Every cross-workspace link rejected by composite FK | P1 | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-11) | Hard delete refused; disable keeps actorId resolvable | P1 | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-04) | Uninterpretable constraint_json → allowed=false (fail-closed) | P1 | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-03) | Unknown permission → PERMISSION_UNKNOWN; list enumerates catalog | P1 | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-07) | `auth/me` returns editor effective set with content.write, not changeset.revert | P2 | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-09) | owner ⊇ admin ⊇ editor on content axis; viewer = *.read only | P2 | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-08/REQ-02) | Key with only direct content.write policy: allowed content.write, denied role.manage/apikey.manage | P1 | pending | pending | pending | pending | PENDING |
| AC-14 (REQ-04) | resource_type='post' grant allowed for post, denied for page/no-type | P1 | pending | pending | pending | pending | PENDING |
| AC-15 (REQ-08/INV-07) | Issuance clamp: admin owner-policy reject; scoped-widen reject; valid attach ok; owner `*` ok | P1 | pending | pending | pending | pending | PENDING |
| AC-16 (REQ-09/REQ-04) | New registered permission: owner `*` allows; editor denied unless granted | P1 | pending | pending | pending | pending | PENDING |
| AC-17 (REQ-13) | CLI mutation w/ no session → authorize() as owner; actorId = owner principal | P1 | pending | pending | pending | pending | PENDING |
| AC-18 (REQ-14) | 11th login/60s per client IP → 429 RATE_LIMIT_EXCEEDED; untrusted XFF ignored | P1 | pending | pending | pending | pending | PENDING |
| AC-19 (REQ-01/REQ-02) | Duplicate username per workspace → RESOURCE_CONFLICT; same username other workspace ok | P1 | pending | pending | pending | pending | PENDING |
| AC-20 (REQ-06) | Session past expires_at → 401, treated as revoked, no authorize() | P2 | pending | pending | pending | pending | PENDING |
| AC-21 (REQ-11/INV-08) | Last owner-`*` + seeded owner cannot be disabled (OWNER_REQUIRED); disable needs user.manage else 403 | P1 | pending | pending | pending | pending | PENDING |
| AC-22 (REQ-01) | CREATE_USER mints a fresh kind='user' principal; cannot bind a credential to an existing principal; member.manage can onboard | P1 | pending | pending | pending | pending | PENDING |
| AC-23 (REQ-08/REQ-01) | ISSUE_API_KEY may bind only to a fresh kind='api_key' principal; user/system/owner target → VALIDATION_ERROR (api_key twin of AC-22, F1) | P1 | pending | pending | pending | pending | PENDING |
| AC-24 (INV-07/REQ-02) | Grant-authority clamp bounds ASSIGN_ROLE/ATTACH_POLICY/WRITE_POLICY_PERMISSION on **human** targets; a non-owner role.manage holder cannot assign/attach owner or widen beyond its authority → GRANT_EXCEEDS_ISSUER; owner succeeds (v0.5.3) | P1 | pending | pending | pending | pending | PENDING |
| AC-25 (REQ-08/REQ-02/INV-07) | Machine authority isolated to one clamped issuance: (a) ISSUE_API_KEY to a non-grantless api_key principal → VALIDATION_ERROR; (b) ASSIGN_ROLE/ATTACH_POLICY targeting an api_key/system principal → VALIDATION_ERROR (v0.5.4, F-053-01) | P1 | pending | pending | pending | pending | PENDING |
| AC-26 (REQ-08/INV-07) | Issuance snapshot immutability: key snapshots source policy P into an is_frozen copy; later WRITE_POLICY_PERMISSION widening P does NOT grow the key (authorize stays denied); WRITE_POLICY_PERMISSION on a frozen policy is refused (v0.5.5, F-054-01) | P1 | pending | pending | pending | pending | PENDING |
| REQ-15 (0.6.0) | ENABLE_PRINCIPAL: re-activate a disabled kind='user' principal; human-only | — | pending | pending | pending | pending | PENDING |
| REQ-16 (0.6.0) | UPDATE_USER: edit email only; username/password out of scope | — | pending | pending | pending | pending | PENDING |
| REQ-17 (0.6.0) | RESET_USER_PASSWORD: admin override, owner-only gate, revokes active sessions | — | pending | pending | pending | pending | PENDING |
| REQ-18 (0.6.0) | UPDATE_ROLE/UPDATE_POLICY: rename/re-describe non-built-in, non-frozen targets | — | pending | pending | pending | pending | PENDING |
| REQ-19 (0.6.0) | DELETE_ROLE/DELETE_POLICY: hard-delete non-built-in, non-frozen, zero-reference targets | — | pending | pending | pending | pending | PENDING |
| AC-27 (REQ-15) (0.6.0) | ENABLE_PRINCIPAL reactivates; non-user target VALIDATION_ERROR; missing gate 403 | P1 | pending | pending | pending | pending | PENDING |
| AC-28 (REQ-16) (0.6.0) | UPDATE_USER succeeds under member.manage; username/password fields ignored | P1 | pending | pending | pending | pending | PENDING |
| AC-29 (REQ-17) (0.6.0) | RESET_USER_PASSWORD changes hash + revokes all sessions; member.manage insufficient | P1 | pending | pending | pending | pending | PENDING |
| AC-30 (REQ-18/INV-06) (0.6.0) | UPDATE_ROLE/UPDATE_POLICY refuse built-in/frozen targets; rename persists otherwise | P1 | pending | pending | pending | pending | PENDING |
| AC-31 (REQ-19/INV-09) (0.6.0) | DELETE_ROLE/DELETE_POLICY: unused deletes, in-use RESOURCE_CONFLICT, built-in/frozen precedence | P1 | pending | pending | pending | pending | PENDING |
| AC-32 (REQ-11/INV-07 route parity) (0.6.0) | DISABLE_PRINCIPAL/WRITE_POLICY_PERMISSION HTTP routes preserve existing certified behavior | P1 | pending | pending | pending | pending | PENDING |

---

## 2. Invariant Traceability

| INV ID | Invariant (from feature.spec.md) | Test File | Test ID | Status |
|--------|-----------------------------------|-----------|---------|--------|
| INV-01 | No workspace-crossing attachment is representable (composite FK) | pending | pending | PENDING |
| INV-02 | A change-set-referenced principal is never hard-deleted; actorId always resolves | pending | pending | PENDING |
| INV-03 | `authorize()` is fail-closed (absence/disabled/scope-mismatch/uninterpretable constraint → deny) | pending | pending | PENDING |
| INV-04 | Exactly one authorize() before idempotency short-circuit; one change-set stamped on success | pending | pending | PENDING |
| INV-05 | Passwords and API keys stored only as hashes; raw secrets never persisted/logged | pending | pending | PENDING |
| INV-06 | Built-in roles/policies undeletable, immutable, un-attachable-to | pending | pending | PENDING |
| INV-07 | Grant-authority clamp over all four grant writers; issued credential never exceeds issuer's unconstrained hold; ISSUE_API_KEY binds only a grantless principal + snapshots perms into an is_frozen policy (un-widenable); ASSIGN_ROLE/ATTACH_POLICY human-only | pending | pending | PENDING |
| INV-08 | At least one active owner-`*` principal always exists; no disable locks out ownership | pending | pending | PENDING |
| INV-09 (0.6.0) | Non-built-in/non-frozen role/policy hard-delete requires an atomic zero-reference check | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (from feature.spec.md) | Test File | Test ID | Status |
|-------|-----------------------------------|-----------|---------|--------|
| EC-01 | First-boot seed write attributed to `system`, not `user-local` | pending | pending | PENDING |
| EC-02 | Session whose principal is disabled mid-session → next request 401 | pending | pending | PENDING |
| EC-03 | API key whose bound principal is disabled → 401 | pending | pending | PENDING |
| EC-04 | Permission in catalog but held by no policy → no_grant → 403 | pending | pending | PENDING |
| EC-05 | Concurrent sessions coexist; per-session revoke ≠ per-principal disable | pending | pending | PENDING |
| EC-06 | resource_type set / constraint_json null → coarse scope; mismatch fail-closed | pending | pending | PENDING |
| EC-07 | Admin demoted after issuing key → key retains power until revoked (documented asymmetry) | pending | pending | PENDING |
| EC-08 | Demoted/revoked caller replays command id → 403 before idempotency; no leak | pending | pending | PENDING |
| EC-09 | Migrated site with `user-local` change_sets → disabled principal seeded; history not rewritten | pending | pending | PENDING |
| EC-10 | Admin mints key with owner-only powers → GRANT_EXCEEDS_ISSUER | pending | pending | PENDING |
| EC-11 | Conditional (scoped) hold cannot be delegated/widened → GRANT_EXCEEDS_ISSUER | pending | pending | PENDING |
| EC-12 | CLI/core mutation w/ no session/key → resolves owner principal; never unauth/ungated | pending | pending | PENDING |
| EC-13 | Session past absolute expires_at → 401, treated as revoked, no authorize() | pending | pending | PENDING |
| EC-14 (0.6.0) | ENABLE_PRINCIPAL on disabled legacy user-local (kind='system') → VALIDATION_ERROR | pending | pending | PENDING |
| EC-15 (0.6.0) | DELETE_ROLE/DELETE_POLICY races a concurrent ASSIGN_ROLE/ATTACH_POLICY → exactly one wins | pending | pending | PENDING |
| EC-16 (0.6.0) | RESET_USER_PASSWORD on a user with zero active sessions → idempotent no-op revoke | pending | pending | PENDING |
| EC-17 (0.6.0) | UPDATE_USER with empty/absent email → stored as null, not empty string | pending | pending | PENDING |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| UNAUTHENTICATED | pending | pending | pending | PENDING |
| FORBIDDEN | pending | pending | pending | PENDING |
| GRANT_EXCEEDS_ISSUER | pending | pending | pending | PENDING |
| PERMISSION_UNKNOWN | pending | pending | pending | PENDING |
| VALIDATION_ERROR | pending | pending | pending | PENDING |
| RESOURCE_NOT_FOUND | pending | pending | pending | PENDING |
| RESOURCE_CONFLICT | pending | pending | pending | PENDING |
| RATE_LIMIT_EXCEEDED | pending | pending | pending | PENDING |
| OWNER_REQUIRED | pending | pending | pending | PENDING |
| INTERNAL_ERROR | pending | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| Permission match resolution (matcher precedence) | § 1.1 | pending | pending | PENDING |
| Effective-set composition (roles ∪ direct policies) | § 1.2 | pending | pending | PENDING |
| Issuance authority clamp (unconstrained-hold rule) | § 1.3 | pending | pending | PENDING |
| Gateway pipeline order (authorize before idempotency) | § 2.1 | pending | pending | PENDING |
| Actor stamping (system on seed, principal id otherwise) | § 2.2 | pending | pending | PENDING |
| Default column values (status/resource_type/constraint_json/…) | § 3 | pending | pending | PENDING |
| Security limits (argon2id, rate limits, `*` owner-only) | § 4 | pending | pending | PENDING |
| Username deduplication (unique per workspace) | § 5.1 | pending | pending | PENDING |
| Tie-break: OR semantics across matching rows | § 6.1 | pending | pending | PENDING |
| Concurrent sessions independence | § 6.2 | pending | pending | PENDING |
| Reference-check-and-delete atomicity (0.6.0) | § 6.3 | pending | pending | PENDING |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements

| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| all REQ/AC | Spec stage — implementation has not started (pre-TDD) | Programmer stage | Programmer Agent |

### 6.2 Untested Requirements

| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|----------------|-------------------|-------|
| all REQ/AC | Spec stage — tests not yet written (pre-TDD) | TDD stage | TDD Agent |

### 6.3 Untested Error Codes

| Error Code | Reason Untested | Target Completion | Owner |
|------------|----------------|-------------------|-------|
| all codes | Spec stage — tests not yet written (pre-TDD) | TDD stage | TDD Agent |

### 6.4 Deferred Items

| REQ/AC ID | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| Agent principals / agent_grants | OQ-01 (AI phase, ADR-013/014/016) | Delegated-grant evaluation is a later phase | feature.spec v0.4.0 Scope |
| Live delegator-clamp on direct grants | OQ-02 (EC-07) | v1 applies issuance-time clamp only; demotion asymmetry documented | feature.spec v0.4.0 Scope |
| ABAC `constraint_json` engine | OQ-03 | v1 is fail-closed seam; field/row rules deferred | feature.spec v0.4.0 Scope |
| Password reset / MFA / OAuth / SSO | OQ-04 | Out of v1 auth surface | feature.spec v0.4.0 Scope |
| Tovu-Runner identity federation | OQ-05 (ADR-011) | Shell owns operator auth | feature.spec v0.4.0 Scope |
| ~~Admin UI for user/role management~~ | ~~OQ-06~~ | **RESOLVED 0.6.0** — Users.tsx/Roles.tsx exist; this amendment completes their backend | feature.spec v0.6.0 |
| ADR-014 tool-registry auth-axis | OQ-07 | Lands with assistant spec | feature.spec v0.4.0 Scope |
| Username change | OQ-09 (0.6.0) | Login-identity edit has audit/session/lookup implications not worth reopening for v1 | feature.spec v0.6.0 Scope |
| Remove a single permission from a policy | OQ-10 (0.6.0) | No inverse of WRITE_POLICY_PERMISSION; v1 path is DELETE_POLICY (unused only) + recreate | feature.spec v0.6.0 Scope |

---

## 7. Untraced Requirements

| REQ/AC ID | Reason Not In Matrix |
|-----------|---------------------|
| — | — |

All REQ-01..19, AC-01..32, INV-01..09, and EC-01..17 from feature.spec.md appear in Sections 1–3.

---

## 8. Traceability Completeness Checklist

This checklist is completed before the feature ships (post-implementation).

- [x] All REQ-* from feature.spec.md appear in the Section 1 matrix
- [x] All AC-* from feature.spec.md appear in the Section 1 matrix
- [x] All INV-* from feature.spec.md appear in the Section 2 matrix
- [x] All EC-* from feature.spec.md appear in the Section 3 matrix
- [x] All error codes from errors.spec.md appear in the Section 4 matrix
- [x] All behavior rules from behavior.spec.md appear in the Section 5 matrix
- [ ] Section 6.1 (unimplemented) is empty or all entries are DEFERRED with approval — pending TDD/Programmer
- [ ] Section 6.2 (untested) is empty or all entries are DEFERRED with approval — pending TDD
- [ ] Section 6.3 (untested error codes) is empty or all entries are DEFERRED with approval — pending TDD
- [x] Section 7 (untraced) is empty
- [ ] All VERIFIED rows have been reviewed and signed off by the Code Review Agent — pending

**[ ] TRACEABILITY COMPLETE** — pending implementation and test stages.

---

## Sign-Off

| Role | Name / Agent | Date (ISO-8601) | Notes |
|------|--------------|-----------------|-------|
| Spec Agent | Coordinator (Primary) | 2026-07-08 | Matrix seeded from feature.spec v0.4.0; extended for v0.5.0 Red-Team additions (REQ-13/14, AC-17..21, INV-08, EC-12/13); all rows PENDING pre-TDD |
| Spec Agent | Coordinator (dispatched slice) | 2026-07-21 | Extended for v0.6.0 users/roles/policies CRUD-completion amendment (REQ-15..19, AC-27..32, INV-09, EC-14..17, behavior §6.3); all new rows PENDING pre-TDD; owes Red-Team + owner DRAFT→APPROVED checkpoint before Software Architect dispatch |
| TDD Agent | | | |
| Programmer Agent | | | |
| Code Review Agent | | | |
| Coordinator | | | |
