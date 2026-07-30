# Behavior Rules Spec: Members (As-Built)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-013 |
| feature_name | FEAT-013-members |
| version | 1.0.0 |
| content_hash | anchored in feature.spec.md |
| last_edited | 2026-07-13T00:00:00Z |

**Purpose:** Documents Members' deterministic ordering/precedence/default-value/tie-break rules
exactly as coded — the fail-closed content-access decision, the anti-enumeration constant response,
and the unpinned TTL defaults `src/members/INFO.md` itself flags as not specified anywhere in
ADR-030.

---

## 1. Precedence Rules

### 1.1 Content-Access Visibility Decision (`DefaultMemberAccessResolver.decide`)

**Situation:** Applies whenever a `MemberContentAccess.visibility` value is evaluated against a
`MemberContext` to decide whether a request may read gated content.

**Evaluation order (a `switch` on `access.visibility`, in source order):**
1. `'public'` — always allowed, unconditionally, regardless of `context`.
2. `'members'` — allowed iff `context.isAuthenticated`.
3. `'paid'` — allowed iff `context.isAuthenticated && context.isPaid`.
4. `'tiers'` — allowed iff `context.isAuthenticated` and `access.tierIds` intersects
   `context.activeTierIds`.
5. Any other value (the `default` switch branch) — always denied, `reason='unknown_visibility'`,
   `teaser=false`. This is the fail-closed default and wins over every other branch when the input
   value does not match one of the four known strings — there is no precedence *conflict* between
   branches because `visibility` is a single scalar field, not multiple competing sources.

**Example:**
- Scenario: An anonymous request reads an entry with `visibility='paid'`.
- Result: `allowed=false`, `reason='sign_in_required'` (not `'upgrade_required'` — the resolver
  distinguishes "never signed in" from "signed in but lacks the paid tier").

**Test requirement:** `access-resolver.test.ts` must cover all four known visibility values crossed
with {anonymous, authenticated-free, authenticated-paid, authenticated-wrong-tier} contexts, plus at
least one unknown-value case.

### 1.2 Member Status on `requestSignInLink` Re-Request

**Situation:** A second `requestSignInLink` call for an email that already has a `MemberRecord`.

**Sources in precedence order:**
1. `member.status === 'disabled'` — short-circuits to `{delivered:true}` with no token minted and no
   mail sent, regardless of anything else.
2. An existing (non-disabled) member — reused as-is; no new `MemberRecord` is created.
3. No existing member — a new `pending` `MemberRecord` is created.

**Test requirement:** One test per branch (disabled short-circuit, existing-member reuse, new-pending-creation).

---

## 2. Ordering Rules

### 2.1 Member List Default Order

**Field used for sorting:** `id` (a ULID, so lexicographic order is also creation order).

**Direction:** Ascending.

**Stability:** Deterministic — ULIDs are unique, so no secondary sort key is needed.

**When overridden:** Never — `MemberRepoPort.list` exposes no sort parameter; the admin UI issues no
sort request either.

**Invariant:** `InMemoryMemberRepo.list` must always return rows in ascending `id` order before
applying the `afterId`/`limit` keyset window.

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| `MAGIC_LINK_TTL_MS` | `requestSignInLink` token expiry | `15 * 60 * 1000` (15 minutes) | Matches Ghost's reference passwordless-link TTL cited by ADR-030; short enough to bound the enumeration/replay window. |
| `SESSION_TTL_MS` | `completeSignIn` session expiry | `30 * 24 * 60 * 60 * 1000` (30 days) | **Not specified anywhere in ADR-030** — `write-service.ts`'s own comment calls this "a reasonable default 'remember me' duration," explicitly flagged as unpinned and revisit-later. |
| `DEFAULT_LIST_LIMIT` | `InMemoryMemberRepo.list` page size cap | `100` | A resource-bounds pre-check added defensively so an omitted `limit` can never fan out to the whole in-memory table, even though member lists are expected to stay small. |
| `status` (new member via `requestSignInLink`) | `MemberRecord.status` | `'pending'` | A brand-new signup has no member row yet at link-request time (the `MagicLinkTokenRecord.memberId` FK must be valid immediately) — resolved by eager pre-creation rather than deferring creation to `completeSignIn`. |
| `redirectPath` link construction | `requestSignInLink`'s minted URL | relative path `/auth/magic?token=...` with no origin | No `core/origin` port exists in this repo yet (ADR-040 names the eventual seam); the caller must prepend a base URL until then. |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| Magic-link token TTL | 15 minutes | Domain (`completeSignIn` compares `expiresAt <= nowIso`) | Not configurable; a hardcoded constant. |
| Member session TTL | 30 days | Domain (mint-time `expiresAt` computation only) | `resolveContext` compares `session.expiresAt <= nowIso` at read time — expiry is enforced on read, not by any background sweep/cleanup job (none exists). |
| Member list page size | 100 (in-memory adapter hard cap) | Repo adapter (`Math.min(required.limit ?? DEFAULT_LIST_LIMIT, DEFAULT_LIST_LIMIT)`) | A caller-requested `limit` above 100 is silently clamped to 100, not rejected — differs from SPEC-007's reject-don't-clamp convention for out-of-range pagination values. |
| Email format | `EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` | Domain (`assertValidEmail` in `write-service.ts`) | A minimal regex, not a full RFC 5322 validator; case-folded and trimmed before the check. |
| Rate limit: `requestSignInLink` | none | n/a | No limiter exists (`feature.spec.md` REQ-17); ADR-030 OQ-8 names this a hard pre-launch precondition, unmet in code. |

---

## 5. Deduplication Rules

### 5.1 What Counts as a Duplicate Subscription

A member cannot hold two simultaneous entitlements to the same tier: `compSubscription` is a
duplicate if all of the following hold:
1. Same `memberId`.
2. Same `tierId`.
3. The existing subscription's `status` is in the active/comped entitlement set
   (`listActiveByMember`: `status ∈ {active, comped}` and not past `currentPeriodEnd`).

**Not a duplicate if:** The existing subscription to that tier is `canceled` or `expired` — a new
`compSubscription` call for the same member/tier succeeds in that case (not exercised by
`write-service.test.ts` today — a coverage gap noted in `traceability.spec.md`).

### 5.2 How Duplicates Are Handled

**At comp-grant time:** `MemberConflictError` is thrown; no subscription row is created.

**Member email uniqueness:** `MemberRecord.email` is documented as "unique per workspace" in
`types.ts`, but **no code enforces this** — `InMemoryMemberRepo` has no uniqueness check on `save()`,
and `requestSignInLink`'s own `findByEmail`-then-create is not transactional, so a race between two
concurrent first-time requests for the same email could create two `pending` `MemberRecord`s. This is
a real, undocumented-in-ADR-030 gap this spec discloses rather than assumes away.

### 5.3 Idempotency vs. Deduplication

Not applicable — no endpoint in this feature accepts an `Idempotency-Key`. `disableMember`'s
idempotency (same result whether called once or twice on an already-disabled member) is a domain
idempotency guarantee, not a header-keyed idempotency mechanism.

---

## 6. Tie-Break Logic

N/A — no scenario in this feature has two records competing for the same "winner" role. Member list
ordering is a strict, collision-free ULID sort (Section 2.1); subscription entitlement is a set
membership check, not a single-winner selection.

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| `access.visibility` is `undefined`/missing entirely | Falls into the `default` switch branch — denied, `reason='unknown_visibility'`, `teaser=false`. | Yes |
| Two concurrent `requestSignInLink` calls for the same new email | Not exercised — the in-memory `findByEmail`-then-`save` sequence is not atomic; a race could create two `pending` members for one email (§5.2). | Yes (currently untested — coverage gap) |
| `limit` query param requested above 100 | Silently clamped to 100, not rejected (differs from SPEC-007's settings-ledger convention). | Yes |
| A member's only active subscription's `currentPeriodEnd` has just passed but `status` is still `'active'` | `listActiveByMember` excludes it from the entitlement set anyway (defense-in-depth); `MemberAccessResolver.resolveContext`'s `activeTierIds` will not include that tier. | Yes |
| `requestSignInLink` called for a syntactically valid but never-registered email | Behaves identically to a registered email at the response level (`{delivered:true}`), but internally creates a new `pending` member — this is intentional (anti-enumeration), not a bug. | Yes |
