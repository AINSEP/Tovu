# Traceability Matrix: integrations

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-015 |
| feature_name | FEAT-015-integrations |
| version | 1.0.0 |
| content_hash | anchored in feature.spec.md |
| last_edited | 2026-07-13T00:00:00Z |
| traceability_status | AS-BUILT — IMPLEMENTED |

**Purpose:** Traces every REQ/AC/INV/EC/error code/behavior rule to the REAL implementation file/function and REAL test file/test id that already exist — this is a backfill, not a pre-implementation matrix, so rows are marked `IMPLEMENTED`/`TESTED` (or `NOT_BUILT` for the named gaps), never `PENDING`.

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Create subscription, starts active/secretVersion 1 | — | `src/integrations/subscriptions.ts` | `createSubscription` | `src/integrations/__tests__/subscriptions.test.ts` | `createSubscription trims label, de-dupes topics, and starts active at secretVersion 1` | TESTED |
| AC-01 (REQ-01) | Create returns active/v1 defaults | P1 | same | same | same | same | TESTED |
| REQ-02 | Reject blank label | — | `subscriptions.ts` | `createSubscription`/`updateSubscription` | — | (asserted implicitly; no dedicated blank-label test found) | IMPLEMENTED, PARTIALLY TESTED |
| REQ-03 | Reject non-https / disallowed target | — | `subscriptions.ts` | `validateTargetUrl` | `subscriptions.test.ts` | `createSubscription rejects a non-https target_url`; `createSubscription rejects a target the injected allowlist check disallows` | TESTED |
| AC-02 (REQ-03) | Non-https rejected | P1 | same | same | same | same | TESTED |
| AC-03 (REQ-03) | Disallowed target rejected | P1 | same | same | same | same | TESTED |
| REQ-04 | Reject empty topics after normalization | — | `subscriptions.ts` | `normalizeTopics` + `createSubscription` | `subscriptions.test.ts` | `createSubscription rejects an empty topic list after normalization` | TESTED |
| AC-04 (REQ-04) | Blank-only topics rejected | P1 | same | same | same | same | TESTED |
| REQ-05 | Update label/targetUrl/topics | — | `subscriptions.ts` | `updateSubscription` | `subscriptions.test.ts` | `updateSubscription overwrites label/targetUrl/topics and bumps updatedAt` | TESTED |
| AC-05 (REQ-05) | Update overwrites fields + bumps updatedAt | P1 | same | same | same | same | TESTED |
| AC-06 (REQ-05) | Update on unknown id throws | P1 | same | same | same | `updateSubscription on an unknown id throws WebhookSubscriptionNotFoundError` | TESTED |
| REQ-06 | Pause/resume single function | — | `subscriptions.ts` | `pauseSubscription` | `subscriptions.test.ts` | `pauseSubscription toggles active <-> paused`; `pauseSubscription rejects a disabled subscription` | TESTED |
| AC-07 (REQ-06) | Toggle active<->paused | P1 | same | same | same | same | TESTED |
| AC-08 (REQ-06) | Disabled subscription rejects pause | P1 | same | same | same | same | TESTED |
| REQ-07 | Soft-delete never row-deletes | — | `subscriptions.ts` | `deleteSubscription` | `subscriptions.test.ts` | `deleteSubscription soft-disables rather than removing the row` | TESTED |
| AC-09 (REQ-07) | Delete soft-disables | P1 | same | same | same | same | TESTED |
| REQ-08 | Topic-match semantics (exact/entity-wildcard/owner-wildcard/fail-closed-empty) | — | `src/integrations/repo.memory.ts` | `topicMatches`, `InMemoryWebhookSubscriptionRepo.findMatching` | `src/integrations/__tests__/repo.memory.test.ts` | `findMatching matches exact topic, entity wildcard, and owner wildcard, but not other workspaces or inactive rows`; `findMatching treats an empty topic list as fail-closed (never matches)` | TESTED |
| AC-10 (REQ-08) | Match forms + fail-closed empty | P1 | same | same | same | same | TESTED |
| REQ-09 | Fan-out enqueue, idempotent per (event, subscription) | — | `src/integrations/delivery.ts` | `enqueueDelivery`, `isAlreadyEnqueued` | `src/integrations/__tests__/delivery.test.ts` | `enqueueDelivery enqueues one row per matching active subscription and is idempotent per (event, subscription)` | TESTED |
| AC-11 (REQ-09) | Idempotent double-enqueue | P1 | same | same | same | same | TESTED |
| REQ-10 | Claim/hook/sign/POST orchestration | — | `delivery.ts` | `processDueDeliveries`, `attemptOneDelivery` | `delivery.test.ts` | `processDueDeliveries signs, POSTs, and marks a successful attempt delivered` | TESTED |
| AC-12 (REQ-10) | Success marks delivered | P1 | same | same | same | same | TESTED |
| AC-17 (REQ-10) | Hook priority order + envelope threading | P2 | same | `runBeforeDispatchHooks` | same | `hooks run in priority order and a later hook sees an earlier hook's redacted envelope` | TESTED |
| AC-18 (REQ-10) | Paused-after-enqueue fails without dispatch | P1 | same | `attemptOneDelivery` | same | `a subscription paused after enqueue fails the attempt without dispatching` | TESTED |
| REQ-11 | Fail-closed beforeDispatch (throw/reject/veto) | — | `delivery.ts` | `runBeforeDispatchHooks`, `attemptOneDelivery` | `delivery.test.ts` | `a throwing beforeDispatch hook fails the attempt (retry) and never reaches the HTTP client`; `an explicit beforeDispatch veto (send: false) also fails closed without dispatching` | TESTED |
| AC-15 (REQ-11) | Throwing hook fails closed | P1 | same | same | same | same | TESTED |
| AC-16 (REQ-11) | Explicit veto fails closed | P1 | same | same | same | same | TESTED |
| REQ-12 | 2xx=delivered, else failed | — | `delivery.ts` | `attemptOneDelivery` | `delivery.test.ts` | `a non-2xx response schedules a backoff retry rather than dead-lettering immediately` | TESTED |
| AC-13 (REQ-12/REQ-13) | Non-2xx schedules retry, not immediate dead | P1 | same | `processDueDeliveries` | same | same | TESTED |
| REQ-13 | Exponential backoff + jitter, cap 8 attempts | — | `delivery.ts` | `computeBackoffMs`, `processDueDeliveries` | `delivery.test.ts` | `repeated failures exhaust maxAttempts and transition the delivery to dead`; `MAX_DELIVERY_ATTEMPTS default is 8 per ADR-036 §4`; `computeBackoffMs stays within [half, full] of the exponential step and respects the cap` | TESTED |
| AC-14 (REQ-13) | Exhaustion transitions to dead | P1 | same | same | same | same | TESTED |
| REQ-14 | Tovu-Signature computation over exact raw bytes | — | `src/integrations/signing.ts` | `signPayload` | `src/integrations/__tests__/signing.test.ts` | `signPayload then verifySignature round-trips for the same secret and body` | TESTED |
| AC-19 (REQ-14) | Round-trip sign/verify | P1 | same | same | same | same | TESTED |
| AC-20 (REQ-14/REQ-15) | Tampered body / wrong secret rejected | P1 | `signing.ts` | `verifySignature` | `signing.test.ts` | `verifySignature rejects a tampered body`; `verifySignature rejects a signature made with a different secret` | TESTED |
| REQ-15 | Verify accepts multi-generation header (rotation overlap) | — | `signing.ts` | `verifySignature`, `parseSignatureHeader` | `signing.test.ts` | `verifySignature accepts a header carrying two v1 values (rotation overlap) if either matches`; `verifySignature rejects a timestamp outside the tolerance window`; `verifySignature rejects a malformed header` | TESTED |
| AC-21 (REQ-15) | Timestamp tolerance rejection | P1 | same | same | same | same | TESTED |
| AC-22 (REQ-15) | Multi-v1 rotation overlap accepted | P2 | same | same | same | same | TESTED |
| REQ-16 | `WebhookSigner` DI seam; `createFixedSecretSigner` dev stand-in | — | `signing.ts` | `createFixedSecretSigner` | `delivery.test.ts` (used as the injected signer throughout) | (used as fixture in every `processDueDeliveries` test) | TESTED (as a test fixture; NOT wired to a real signer in production — see GAP-02) |
| REQ-17 | `KeyringPort`/`SecretSealerPort` typed seams, no implementation | — | `src/integrations/ports.ts` | (interfaces only) | — | — | TYPES ONLY, NOT_BUILT (interfaces compile-checked; no runtime implementation exists — GAP-02/GAP-03) |
| REQ-18 | List route + lastDelivery annotation | — | `src/server/routes/admin/integrations/list.ts` | `registerAdminIntegrationsListRoute`, `mostRecentDelivery` | `src/server/__tests__/admin-integrations-routes.test.ts` | `integrations routes: list is empty before any subscription exists`; `integrations routes: list's lastDelivery picks the newest row by createdAt, not insertion order` | TESTED |
| AC-23 (REQ-18) | Empty list | P1 | same | same | same | same | TESTED |
| AC-27 (REQ-18) | lastDelivery picks newest by createdAt | P2 | same | same | same | same | TESTED |
| REQ-19 | Create route | — | `src/server/routes/admin/integrations/create.ts` | `registerAdminIntegrationsCreateRoute` | `admin-integrations-routes.test.ts` | `integrations routes: create validates https:// and never leaks secret material in the response` | TESTED |
| AC-24 (REQ-19) | No secret leakage in response | P1 | same | same | same | same | TESTED |
| REQ-20 | Pause route | — | `src/server/routes/admin/integrations/pause.ts` | `registerAdminIntegrationsPauseRoute` | `admin-integrations-routes.test.ts` | `integrations routes: pause toggles active <-> paused, and a disabled subscription rejects pause`; `integrations routes: pause/delete on an unknown subscription id returns 404` | TESTED |
| AC-25 (REQ-20) | Pause/resume toggle + disabled rejection | P1 | same | same | same | same | TESTED |
| AC-26 (REQ-20/REQ-21) | Unknown id 404 on pause/delete | P1 | pause.ts + delete.ts | same | same | same | TESTED |
| REQ-21 | Delete route (soft-disable) | — | `src/server/routes/admin/integrations/delete.ts` | `registerAdminIntegrationsDeleteRoute` | `admin-integrations-routes.test.ts` | `integrations routes: pause/delete on an unknown subscription id returns 404` | TESTED |
| REQ-22 | Deliveries route, paginated, newest-first | — | `src/server/routes/admin/integrations/deliveries.ts` | `registerAdminIntegrationsDeliveriesRoute`, `resolvePageSize` | `admin-integrations-routes.test.ts` | `integrations routes: deliveries endpoint returns the log newest-first and 404s for an unknown subscription` | TESTED |
| AC-28 (REQ-22) | Newest-first + 404 on unknown subscription | P1 | same | same | same | same | TESTED |
| REQ-23 | workspaceId mismatch -> 404 before authz | — | every route file | (leading `if` in each registrar) | `admin-integrations-routes.test.ts` | `integrations routes: list rejects a workspaceId that doesn't match the seeded workspace` | TESTED |
| AC-30 (REQ-23) | Workspace mismatch 404 | P1 | same | same | same | same | TESTED |
| REQ-24 | `integration.manage` gates every route | — | `src/identity/permissions.ts` (registration) + every route (`authorize()` call) | `registerPermission({ id: "integration.manage", ... })` | `admin-integrations-routes.test.ts` | `integrations routes: SPEC-006 REQ-05 — a principal without integration.manage is denied 403 on every route, and a grant restores access` | TESTED |
| AC-29 (REQ-24) | Denied without grant, restored with grant | P1 | same | same | same | same | TESTED |
| REQ-25 | Integrations admin screen (list/create/pause/delete UI) | — | `apps/admin/src/sections/Integrations.tsx` | `Integrations` component | — | No dedicated frontend test file found for this component in this pass | IMPLEMENTED, NOT UNIT-TESTED (covered indirectly only insofar as it calls the tested API client/routes) |
| REQ-26 | Delivery-log admin screen | — | `apps/admin/src/sections/IntegrationDeliveries.tsx` | `IntegrationDeliveries` component | — | Same as REQ-25 | IMPLEMENTED, NOT UNIT-TESTED |

---

## 2. Invariant Traceability

| INV ID | Invariant | Impl File | Test File | Test ID | Status |
|--------|-----------|-----------|-----------|---------|--------|
| INV-01 | No physical delete of `WebhookSubscriptionRecord` | `subscriptions.ts` (`deleteSubscription`); `ports.ts` (no `delete` method on `WebhookSubscriptionRepoPort`) | `subscriptions.test.ts` | `deleteSubscription soft-disables rather than removing the row` | TESTED |
| INV-02 | No duplicate `(workspaceId, subscriptionId, eventId)` delivery | `delivery.ts` (`isAlreadyEnqueued`) | `delivery.test.ts` | `enqueueDelivery enqueues one row per matching active subscription and is idempotent per (event, subscription)` | TESTED |
| INV-03 | No dispatch after a hook throw/veto | `delivery.ts` (`attemptOneDelivery`, `runBeforeDispatchHooks`) | `delivery.test.ts` | `a throwing beforeDispatch hook fails...`; `an explicit beforeDispatch veto...` | TESTED |
| INV-04 | Signed `rawBody` === sent `body`, no re-serialization | `delivery.ts` (`attemptOneDelivery`: `rawBody` passed to both `signer.signForSubscription` and `httpClient.send`) | `delivery.test.ts` | `processDueDeliveries signs, POSTs, and marks a successful attempt delivered` (asserts the recorded request body) | TESTED |
| INV-05 | Never exceeds `MAX_DELIVERY_ATTEMPTS` before `dead` | `delivery.ts` (`processDueDeliveries`) | `delivery.test.ts` | `repeated failures exhaust maxAttempts and transition the delivery to dead` | TESTED |
| INV-06 | No secret material in any admin response DTO | `src/server/http/admin/integrations.ts` (DTO projections have no secret field) | `admin-integrations-routes.test.ts` | `integrations routes: create validates https:// and never leaks secret material in the response` | TESTED |
| INV-07 | All subscription mutation goes through `subscriptions.ts` | `subscriptions.ts` (exclusive exported mutators); routes never construct records directly | `admin-integrations-routes.test.ts` (routes call only `createSubscription`/`pauseSubscription`/`deleteSubscription`) | (implicit — verified by code-reading the route files, no dedicated "no side-door write" canary test exists, unlike ADR-022's CI canary pattern for other core-owned tables) | IMPLEMENTED, NOT CANARY-TESTED |

---

## 3. Edge Case Traceability

| EC ID | Edge Case | Impl File | Test File | Test ID | Status |
|-------|-----------|-----------|-----------|---------|--------|
| EC-01 | Bare `*` topic matches everything for the owner | `repo.memory.ts` (`topicMatches`) | `repo.memory.test.ts` | `findMatching matches exact topic, entity wildcard, and owner wildcard, but not other workspaces or inactive rows` | TESTED |
| EC-02 | `updateSubscription` has no disabled-status guard (unlike pause/delete) | `subscriptions.ts` (`updateSubscription`, no status check) | — | No dedicated test found asserting an update against a disabled subscription succeeds | IMPLEMENTED, NOT EXPLICITLY TESTED (behavior is a direct read of the source — the absence of a status guard — not verified by a targeted test case) |
| EC-03 | Claimed delivery's subscription hard-removed | `delivery.ts` (`attemptOneDelivery`) | `delivery.test.ts` | `a claimed row whose subscription was hard-removed from the repo fails (subscription not found)` | TESTED |
| EC-04 | Claimed delivery has no recorded envelope | `delivery.ts` (`attemptOneDelivery`) | `delivery.test.ts` | `a claimed row with no recorded envelope fails (envelope-store gap)` | TESTED |
| EC-05 | Non-numeric/out-of-range `?limit=` | `deliveries.ts` (`resolvePageSize`) | — | No dedicated test found for this exact query-param edge case | IMPLEMENTED, NOT EXPLICITLY TESTED |
| EC-06 | Mixed-case `HTTPS://` scheme | `subscriptions.ts` (`validateTargetUrl`, relies on WHATWG `URL.protocol` normalization) | — | No dedicated test found for mixed-case scheme input | IMPLEMENTED, NOT EXPLICITLY TESTED (relies on documented, standard `URL` parser behavior) |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| `WORKSPACE_NOT_FOUND` | Every route's leading workspaceId check | `admin-integrations-routes.test.ts` | `integrations routes: list rejects a workspaceId that doesn't match the seeded workspace` | TESTED |
| `INTEGRATIONS_SUBSCRIPTION_NOT_FOUND` | `pause.ts`/`delete.ts` (`WebhookSubscriptionNotFoundError`), `deliveries.ts` | `admin-integrations-routes.test.ts` | `integrations routes: pause/delete on an unknown subscription id returns 404`; `integrations routes: deliveries endpoint returns the log newest-first and 404s for an unknown subscription` | TESTED |
| `INTEGRATIONS_VALIDATION_ERROR` | `create.ts`/`pause.ts` (`WebhookSubscriptionValidationError`) | `admin-integrations-routes.test.ts` | `integrations routes: create validates https:// and never leaks secret material in the response`; `integrations routes: pause toggles active <-> paused, and a disabled subscription rejects pause` | TESTED |
| `FORBIDDEN` | Every route's `authorize()` check | `admin-integrations-routes.test.ts` | `integrations routes: SPEC-006 REQ-05 — a principal without integration.manage is denied 403 on every route, and a grant restores access` | TESTED |
| `INTERNAL_ERROR` | Every route's catch-all | — | No dedicated test found forcing an unexpected internal error | NOT EXPLICITLY TESTED (a standard catch-all; not independently exercised) |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| Topic-match precedence (owner-* / exact / entity-.*) | § 1.1 | `repo.memory.test.ts` | `findMatching matches exact topic, entity wildcard, and owner wildcard, but not other workspaces or inactive rows` | TESTED |
| Fail-closed empty topic set | § 1.2 | `repo.memory.test.ts` | `findMatching treats an empty topic list as fail-closed (never matches)` | TESTED |
| `beforeDispatch` hook priority ordering | § 2.1 | `delivery.test.ts` | `hooks run in priority order and a later hook sees an earlier hook's redacted envelope` | TESTED |
| Delivery claim order (ascending nextAttemptAt, capped batchSize) | § 2.2 | `repo.memory.test.ts` | `claimPending only returns pending rows due at or before nowIso, and increments attempts` | TESTED |
| Default values (secretVersion/status/paused/batchSize/timeout/maxAttempts/limit/hooks) | § 3 | (spread across the above test files) | (spread) | TESTED (each default individually exercised by its associated test above) |
| Limits and bounds (8 attempts, backoff base/cap/jitter, page size 50/200, O(n) idempotency scan) | § 4 | `delivery.test.ts` | `computeBackoffMs stays within [half, full] of the exponential step and respects the cap`; `MAX_DELIVERY_ATTEMPTS default is 8 per ADR-036 §4` | TESTED (page-size clamp bounds are NOT explicitly tested — see EC-05) |
| Deduplication: (eventId, subscriptionId) idempotency | § 5 | `delivery.test.ts` | `enqueueDelivery enqueues one row per matching active subscription and is idempotent per (event, subscription)` | TESTED |
| Tie-break: most-recent-delivery by lexicographic createdAt | § 6.1 | `admin-integrations-routes.test.ts` | `integrations routes: list's lastDelivery picks the newest row by createdAt, not insertion order` | TESTED |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements (design-only, no runtime code)

| REQ/AC ID | Reason Unimplemented | Owner |
|-----------|---------------------|-------|
| REQ-17 (`KeyringPort`/`SecretSealerPort` implementations) | Interfaces only — ADR-036 Round-3/4 fold defers the crosscutting home to a future ADR-041 | Future implementation spec (GAP-02/GAP-03) |
| Delivery-worker runtime wiring (no REQ number — a composition-root gap, not a library requirement) | No outbox subscriber or scheduler invokes `enqueueDelivery`/`processDueDeliveries` outside their own tests | Future implementation spec (GAP-01) |
| `integration_secrets` / outbound-connector runtime | ADR-036 §8 explicit v1 deferral, seam-only | Future FEAT (GAP-08) |
| API-key admin presentation | Not present anywhere in `apps/admin/src/sections/` or the admin routes | Future implementation spec (GAP-09) |
| Secret rotation, manual redelivery | No entry points exist in `subscriptions.ts`/routes | Future implementation spec (GAP-10/GAP-11) |

### 6.2 Untested Requirements (code exists, no dedicated test)

| REQ/AC ID | Reason Untested | Owner |
|-----------|----------------|-------|
| REQ-02 (blank-label rejection) | No test isolates a blank (vs. whitespace-only) label case separately from the happy-path create test | Future test-hardening pass |
| REQ-25/REQ-26 (UI components) | No frontend test file exists for either `.tsx` component in this pass | Future test-hardening pass |
| EC-02, EC-05, EC-06 | Each is a direct read of the source's actual (non-)behavior, not independently asserted by a test | Future test-hardening pass |
| `INTERNAL_ERROR` catch-all | Standard catch-all; not independently forced/exercised | Future test-hardening pass |

### 6.3 Untested Error Codes

None beyond `INTERNAL_ERROR` (see § 6.2) — every other registered error code has at least one passing test exercising it.

### 6.4 Deferred Items (per ADR-036, unchanged by this spec)

| Item | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| Outbound integration connectors (`integration_secrets`) | Future FEAT | ADR-036 §8 explicit DEFERRED item | ADR-036 (already accepted) |
| Inbound webhooks (receiving) | Future FEAT | ADR-036 §8 explicit DEFERRED item — different trust surface | ADR-036 |
| Delivery-log retention/GC | Future FEAT, owned by the pending Storage/Backups primitive | ADR-036 §8 explicit DEFERRED item | ADR-036 |
| Per-subscription rate limiting/circuit breaking | Future FEAT | ADR-036 §8 explicit DEFERRED item | ADR-036 |
| Secret-egress on export (`--secrets=strip/rewrap`) | Future FEAT | ADR-036 §8 explicit DEFERRED item | ADR-036 |

---

## 7. Untraced Requirements

| REQ/AC ID | Reason Not In Matrix |
|-----------|---------------------|
| — | — |

---

## 8. Traceability Completeness Checklist

- [x] All REQ-* from feature.spec.md appear in the Section 1 matrix
- [x] All AC-* from feature.spec.md appear in the Section 1 matrix
- [x] All INV-* from feature.spec.md appear in the Section 2 matrix
- [x] All EC-* from feature.spec.md appear in the Section 3 matrix
- [x] All error codes from errors.spec.md appear in the Section 4 matrix
- [x] All behavior rules from behavior.spec.md appear in the Section 5 matrix
- [x] Section 6.1 (unimplemented) entries are all named GAPs from feature.spec.md's Scope section, not silently new
- [x] Section 6.2 (untested) is populated honestly — several rows exist because this is as-built documentation of real, sometimes-imperfect test coverage, not a pre-implementation ideal
- [x] Section 6.3 (untested error codes) reasoned individually
- [x] Section 7 (untraced) is empty

**[x] TRACEABILITY COMPLETE** — as an as-built package: every REQ/AC/INV/EC/error/behavior-rule row is resolved to either a real implementation+test, a real implementation without a dedicated test (disclosed), or a named, ADR-linked gap. Nothing is `PENDING`.

---

## Sign-Off

| Role | Name / Agent | Date (ISO-8601) | Notes |
|------|--------------|-----------------|-------|
| Spec Agent | Spec Agent | 2026-07-13 | Backfilled from real `src/integrations/`, `src/server/routes/admin/integrations/`, and `apps/admin/src/sections/` code + their existing tests |
| TDD Agent | | | N/A for this backfill — no new tests certified by this pass |
| Programmer Agent | | | N/A — no new implementation by this pass |
| Code Review Agent | | | |
| Coordinator | | | |
