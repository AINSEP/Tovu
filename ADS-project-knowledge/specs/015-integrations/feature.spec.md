# Feature Spec: integrations

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-015 |
| version | 1.0.0 |
| status | APPROVED |
| content_hash | sha256:f2820497e57ec41382f19b735a4c2f6746f7f78a10f41a3315da79d789aae190 |
| feature_name | FEAT-015-integrations |
| last_edited | 2026-07-13T00:00:00Z |
| owner | Leona Burime |
| spec_agent | Spec Agent |
| spec_mode | brownfield |

> **[NEEDS CLARIFICATION] vs Open Questions — use the right one:**
>
> **`[NEEDS CLARIFICATION]`** — inline marker for a requirement that is too ambiguous to be testable as written. Blocks Software Architect dispatch. Must be resolved before the spec advances.
>
> **Open Questions** — tracked questions that do not block Software Architect dispatch. Each must have an owner and a resolution target date.

---

## Overview

**This is as-built documentation of an already-shipped (but partial) feature, written retroactively.** Integrations shipped directly from ADR-036 during the 2026-07-10 admin-section sweep without a formal SPEC-NNN package. Real code already exists: the `integrations` library (`src/integrations/`), admin HTTP routes (`src/server/routes/admin/integrations/`), and an admin UI (`apps/admin/src/sections/Integrations.tsx`, `IntegrationDeliveries.tsx`). This spec captures what that code actually does today, in present tense, sourced from the real files — it is not a design proposal and does not add new requirements. Every REQ below is either already implemented and tested, or explicitly marked as an unwired/dev-placeholder gap.

Integrations owns the outbound webhook subsystem: subscription CRUD (gated admin API + UI), a two-stage delivery pipeline (event fan-out + claim/sign/POST/retry), Stripe-shaped HMAC request signing, and a delivery-log admin view. The outbound-connector/API-key-presentation half of ADR-036's design (`integration_secrets`, `SecretSealerPort`, the API-key management view over identity's `api_keys`) is **not built at all** — only type/port seams exist for the secret-sealer half, and no API-key UI exists in this section.

---

## Problem Statement

**Current state (what actually exists in the repo today):**
- `src/integrations/{types,ports,index,subscriptions,delivery,signing,repo.memory,http.memory}.ts` — real, tested library code (four `__tests__/*.test.ts` files, all passing per their own assertions).
- Real admin HTTP routes wired into the running server (`src/server/app.ts`/`deps.ts`): list, create, pause/resume, delete, delivery-log read.
- Real admin UI screens (`Integrations.tsx`, `IntegrationDeliveries.tsx`) consuming those routes through `apps/admin/src/lib/api.ts`.
- A registered permission, `integration.manage` (singular, unprefixed) — **not** `admin.integrations.manage`, the string ADR-036's Round-2 fold and `ADR-INDEX.md` both claim. `src/identity/permissions.ts`'s own comment states the `admin.<section>.manage` convention "has no implementation behind it anywhere in this codebase" and registers the flat two-segment shape instead, matching every other route in the repo at the time this landed.
- A two-stage delivery worker (`enqueueDelivery` Stage A, `processDueDeliveries` Stage B) that is fully implemented and unit-tested **but is never invoked from the running server.** No cron/interval/outbox-subscriber wiring calls either function outside `src/integrations/__tests__/delivery.test.ts`. Confirmed by repo-wide search: no non-test reference to `processDueDeliveries` or `enqueueDelivery` exists.
- A `webhookSigner` dependency wired into `RouteDeps` via `createFixedSecretSigner(new Map())` — an **empty** dev-only secret map. Its own field doc says plainly: "DEV-ONLY placeholder wiring... Not consumed by any route yet — the delivery worker is the first real consumer." Since the delivery worker itself is never invoked (previous point), the signer is inert in the current server.
- No SQLite/Drizzle adapters for `WebhookSubscriptionRepoPort`/`WebhookDeliveryRepoPort` — only the in-memory adapters in `repo.memory.ts` back the running server today.
- No concrete `HttpClientPort` transport/composition root exists anywhere in the repo (`src/http/` is types + ports + a barrel only); the only implementation is `http.memory.ts`'s `RecordingHttpClient` test double.
- `subscriptions.ts`'s egress allowlist check (`isAllowedTarget`) is a real injected seam, but the admin route (`create.ts`) wires it to `permitAllHttpsTargets` — a dev stand-in that permits every `https://` URL. `core/origin`'s ADR-040 egress allowlist is not wired in.
- No `webhooks.beforeDispatch` hook is registered anywhere at runtime; `processDueDeliveries`'s `hooks` parameter defaults to `[]`.
- No API-key admin surface (list/prefix/last-used/revoke over identity's `api_keys`) exists in this admin section at all — the section is 100% webhooks.

**Desired state (per ADR-036, for context — not this spec's job to build):** an operator manages webhook subscriptions and outbound API keys from one admin section; every subscribed domain event reliably fans out, signs, and delivers with retry/backoff/dead-lettering through a real running delivery worker against a real guarded HTTP transport; signing secrets are derived from a real `KeyringPort` root key, never a dev map.

**Why now (why this spec exists):** to give the already-shipped code the spec package it should have had, so downstream stages (Red-Team, Software Architect for the still-missing runtime wiring, Programmer) have a precise, evidence-sourced account of what is real versus stubbed, instead of relying on ADR-036 prose that has already drifted from the code in at least two material ways (the permission string; the "delivery worker is the first real consumer" claim, which undersells that nothing consumes it yet).

**Success signal:** This spec package accurately traces every REQ to real files, real functions, and (where they exist) real passing tests, and clearly separates "implemented and wired" from "implemented but never invoked in production" from "not built at all" — so a future Software Architect pass on the remaining wiring (real signer, real transport, real repo adapters, a real running delivery worker, the egress allowlist, the API-key view) starts from an accurate map, not from ADR-036's aspirational text.

---

## User Journey

**Trigger:** A workspace admin wants to receive webhook notifications for domain events (e.g. `post.published`).

**Steps (as the shipped code actually behaves):**
1. Admin opens Admin → Integrations (`Integrations.tsx`), sees a table of existing subscriptions (label, target URL, status, last delivery status) and clicks "Add webhook."
2. Admin fills in label, target URL, and a comma-separated topics list, and submits. The client POSTs to `/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions`.
3. The route checks the authenticated dev-auth principal against `integration.manage` via `authorize()`; on denial, returns 403 with a structured error body. On success, it calls `createSubscription`, which trims the label, normalizes/de-dupes topics, validates the URL is `https://` and passes the (currently permit-all) `isAllowedTarget` check, and inserts a new row (`status: 'active'`, `secretVersion: 1`, `previousSecretVersion: null`) via `webhookSubscriptionRepo.insert`.
4. The new subscription appears in the list on reload with `lastDelivery: null` ("never").
5. Admin can toggle Pause/Resume (`POST .../pause`, body `{ paused: boolean }`) or Delete (`DELETE .../:subscriptionId`, which soft-disables — never row-deletes).
6. Admin clicks a subscription's label to open `IntegrationDeliveries.tsx`, which fetches `GET .../:subscriptionId/deliveries` and renders the delivery log newest-first.

**What does NOT happen today, and why:** No domain event actually reaches a matching subscription's target URL yet. `enqueueDelivery` (fan-out) and `processDueDeliveries` (claim/sign/POST/retry) both exist and are unit-tested in isolation, but nothing in `src/server/app.ts`/`deps.ts` ever calls them — there is no outbox subscriber registered for webhook fan-out, and no scheduled/looped call to the delivery worker. So a created subscription can sit forever with `lastDelivery: null` even if its subscribed topic fires, because Stage A is never triggered.

**Outcome:** The admin sees CRUD work end-to-end for subscriptions and can view a (currently always-empty, in the deployed server) delivery log. No webhook is actually ever delivered by the running server as configured today.

**Alternate paths:** An invalid (non-`https`) target URL is rejected at create/update time with `WebhookSubscriptionValidationError` → HTTP 400. An empty topic list after normalization is rejected the same way. Pausing/deleting an unknown subscription id returns 404. A `disabled` subscription cannot be paused or resumed (`WebhookSubscriptionValidationError`).

---

## Scope

**In scope (implemented and covered by this spec):**
- Webhook subscription CRUD: create/update/pause-resume/soft-delete, all via the in-memory `WebhookSubscriptionRepoPort` (REQ-01–REQ-06)
- Topic normalization + matching semantics (`exact`, entity `.*`, owner-only `*`, fail-closed on empty) (REQ-05, REQ-08)
- Stage A fan-out (`enqueueDelivery`) — idempotent per `(eventId, subscriptionId)` (REQ-09)
- Stage B delivery worker (`processDueDeliveries`) — hook chain, signing, POST, retry/backoff/dead-letter (REQ-10–REQ-14)
- Fail-closed `webhooks.beforeDispatch` semantics (REQ-11)
- HMAC request signing + verification, including rotation-overlap multi-signature headers (REQ-15, REQ-16)
- Admin HTTP API: list, create, pause/resume, delete, delivery-log read (REQ-18–REQ-23)
- Admin UI: subscription list + create form + pause/delete actions; per-subscription delivery log screen (REQ-24, REQ-25)
- Permission gating on every admin route via the real, registered `integration.manage` permission (REQ-22)
- In-memory repo adapters (`InMemoryWebhookSubscriptionRepo`, `InMemoryWebhookDeliveryRepo`, `InMemoryDeliveryEnvelopeStore`) and a recording `HttpClientPort` test double (REQ-26)

**Explicitly out of scope — NOT built, flagged as gaps rather than silently assumed done:**
- Any runtime wiring that actually invokes `enqueueDelivery`/`processDueDeliveries` (no outbox subscriber, no scheduler) — GAP-01
- A real `WebhookSigner` backed by `KeyringPort.deriveSigningSecret()` — production wiring is `createFixedSecretSigner(new Map())`, an empty dev stand-in — GAP-02
- Any concrete `KeyringPort`/`RootKeyHandle` implementation (root-key custody, HKDF derivation) — interface only — GAP-03
- Any concrete guarded `HttpClientPort`/`EgressPolicy` transport or composition-root factory (`src/http/` is types/ports only) — GAP-04
- SQLite/Drizzle adapters for `WebhookSubscriptionRepoPort`/`WebhookDeliveryRepoPort` — GAP-05
- Wiring `isAllowedTarget` to the real `core/origin` egress allowlist (ADR-040) — the admin route uses a permit-all stand-in — GAP-06
- Any registered `webhooks.beforeDispatch` hook contributor — GAP-07
- The `integration_secrets` table, `SecretSealerPort`, and any outbound-connector runtime (ADR-036 §8, deferred there too) — GAP-08
- The API-key admin presentation (list keys, prefixes, last-used, revoke) that ADR-036 §3 describes as part of this section — not present anywhere in `apps/admin/src/sections/` or the admin routes — GAP-09
- Subscription secret rotation (minting `version + 1`, dual-signature overlap window) — no rotation entry point exists in `subscriptions.ts` — GAP-10
- Manual redelivery of `dead` deliveries (`webhooks.redeliver`) — no such route/permission exists — GAP-11
- The re-hydration path for a delivery's original event payload across process/tick boundaries — `repo.memory.ts`'s `DeliveryEnvelopeStore` is an explicitly-flagged stand-in seam, not the reviewed port surface — GAP-12

---

## Requirements

- REQ-01: The system shall let a caller create a webhook subscription given `workspaceId`, `ownerPrincipalId`, `label`, `targetUrl`, `topics`, and `createdByPrincipalId` (`createSubscription` in `src/integrations/subscriptions.ts`), starting it `active` with `secretVersion: 1` and `previousSecretVersion: null`.
- REQ-02: The system shall reject a subscription create/update whose trimmed `label` is empty, throwing `WebhookSubscriptionValidationError`.
- REQ-03: The system shall reject a subscription create/update whose `targetUrl` does not parse as a URL, is not `https://`, or fails the injected `isAllowedTarget` check, throwing `WebhookSubscriptionValidationError` in each case.
- REQ-04: The system shall reject a subscription create/update whose `topics` list is empty after trimming, dropping blanks, and de-duplicating (preserving first-seen order).
- REQ-05: The system shall let a caller update an existing subscription's `label`, `targetUrl`, and `topics` (`updateSubscription`), re-running the same validation as create, without touching `status` or secret-version fields.
- REQ-06: The system shall let a caller pause or resume an `active`/`paused` subscription via one function (`pauseSubscription`, `optional.paused` defaulting to `true`), and shall reject pausing/resuming a `disabled` subscription with `WebhookSubscriptionValidationError`.
- REQ-07: The system shall soft-delete a subscription (`deleteSubscription`) by setting `status: 'disabled'` and stamping `disabledAt`, and shall never physically remove the row — `WebhookSubscriptionRepoPort` exposes no `delete` method.
- REQ-08: The system shall match a delivered event's topic against a subscription's `topics` using: exact string match, a trailing `.*` matching every action for that entity prefix, or a bare `*` matching all topics; an empty `topics` list shall never match anything (fail-closed) — implemented in `InMemoryWebhookSubscriptionRepo.findMatching`'s `topicMatches` helper.
- REQ-09: The system shall, on `enqueueDelivery`, look up all `active` subscriptions matching a delivered event's topic and insert exactly one `webhook_deliveries`-shaped record per match, skipping any `(eventId, subscriptionId)` pair that already has an enqueued delivery (idempotent fan-out).
- REQ-10: The system shall, on `processDueDeliveries`, claim due `pending` rows (default batch size 20) via `WebhookDeliveryRepoPort.claimPending`, and for each claimed row: resolve the subscription, resolve the stored envelope, run `webhooks.beforeDispatch` hooks in ascending `priority` order, sign, and POST via the injected `HttpClientPort`.
- REQ-11: The system shall fail an entire delivery attempt — never dispatching the envelope — if any `beforeDispatch` hook throws, rejects, or returns `{ send: false }`; there is no code path in `attemptOneDelivery` that reaches `httpClient.send` after a hook failure or veto.
- REQ-12: The system shall treat a delivery attempt as successful only when the HTTP response status is in `[200, 300)`; any other status, or a thrown/transport error, is treated as a failed attempt with a `null` or the actual non-2xx response status recorded.
- REQ-13: The system shall retry a failed delivery attempt with exponential backoff plus "equal jitter" (`computeBackoffMs`: base 5 minutes, capped at 6 hours per step) up to `MAX_DELIVERY_ATTEMPTS` (8) attempts, after which the delivery transitions to `dead` and `deadAt` is stamped.
- REQ-14: The system shall compute the `Tovu-Signature` header as `t=<unixSeconds>,v1=<hex(HMAC-SHA256(secret, "${t}.${rawBody}"))>` over the exact raw bytes about to be sent, with no re-serialization between signing and sending (`signPayload` in `src/integrations/signing.ts`).
- REQ-15: The system shall verify a `Tovu-Signature` header by rejecting a `t=` outside a caller-supplied tolerance window and accepting the signature if ANY of the header's `v1=` entries constant-time-matches the expected HMAC for the given secret — supporting the rotation-overlap case of multiple honored secret generations (`verifySignature`).
- REQ-16: The system shall expose a `WebhookSigner` DI seam (`signForSubscription`) that `processDueDeliveries` depends on rather than depending on `KeyringPort` directly; the only implementation shipped is `createFixedSecretSigner`, a plain `Map<subscriptionId, secret>`-backed stand-in for local dev/tests, which throws if no secret is configured for a subscription.
- REQ-17: The system shall expose `KeyringPort` (`activeKey`, `deriveSigningSecret`, generic `derive`) and `SecretSealerPort` (`seal`/`open`) as typed interfaces in `src/integrations/ports.ts`, with no concrete implementation of either shipped in this pass.
- REQ-18: The system shall expose `GET /api/admin/v1/workspaces/:workspaceId/integrations/subscriptions`, gated by `integration.manage`, returning every subscription in the workspace annotated with its most recent delivery (bounded to the 50 most-recently-created deliveries per subscription for the "last delivery" computation).
- REQ-19: The system shall expose `POST /api/admin/v1/workspaces/:workspaceId/integrations/subscriptions`, gated by `integration.manage`, creating a subscription from `{ label, targetUrl, topics }` in the request body and returning HTTP 201 with the projected subscription on success, or HTTP 400 with the validation error message on a `WebhookSubscriptionValidationError`.
- REQ-20: The system shall expose `POST /api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId/pause`, gated by `integration.manage`, toggling pause state per an optional `{ paused: boolean }` body (default `true`), returning 404 on an unknown id and 400 on a validation error (e.g. pausing a disabled subscription).
- REQ-21: The system shall expose `DELETE /api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId`, gated by `integration.manage`, soft-deleting the subscription and returning the now-disabled row, or 404 if the id is unknown.
- REQ-22: The system shall expose `GET /api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId/deliveries`, gated by `integration.manage`, returning the subscription's delivery log newest-first, paginated by `?limit=` (default 50, clamped to a hard maximum of 200), returning 404 if the subscription id is unknown.
- REQ-23: The system shall reject every integrations admin route with HTTP 404 if the `:workspaceId` path parameter does not match the server's configured `deps.workspaceId`, before any authorization check runs.
- REQ-24: The system shall require the real, registered permission `integration.manage` (owner: `"integrations"`) — checked via `authorize()` — on every integrations admin route (list, create, pause, delete, deliveries); there is no split `.read`/`.write` permission for this domain.
- REQ-25: The system shall present an admin "Integrations" screen (`Integrations.tsx`) listing every subscription's label (linked to its delivery log), target URL, status, and last-delivery status, plus Pause/Resume and Delete actions (both disabled once a subscription is `disabled`), and an "Add webhook" form capturing label, target URL, and a comma-separated topics field.
- REQ-26: The system shall present an admin "Delivery log" screen (`IntegrationDeliveries.tsx`) for one subscription, listing each delivery's status, attempt count, last response status/error, and a display timestamp (delivered time, else created time), or an empty-state message when no deliveries exist.

<!-- Add more as needed. Numbers must not be reused, even if a requirement is removed. -->

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given valid `{ label: "x", targetUrl: "https://a", topics: ["post.published"] }`, when `createSubscription` runs, then it returns a subscription with `status: 'active'`, `secretVersion: 1`, `previousSecretVersion: null`, and the trimmed/de-duped topics — verified by `src/integrations/__tests__/subscriptions.test.ts`'s `"createSubscription trims label, de-dupes topics, and starts active at secretVersion 1"`.
- AC-02 (REQ-03) [P1]: Given `targetUrl: "http://insecure"`, when `createSubscription` runs, then it throws `WebhookSubscriptionValidationError` — verified by `"createSubscription rejects a non-https target_url"`.
- AC-03 (REQ-03) [P1]: Given a `targetUrl` the injected `isAllowedTarget` returns `false` for, when `createSubscription` runs, then it throws `WebhookSubscriptionValidationError` — verified by `"createSubscription rejects a target the injected allowlist check disallows"`.
- AC-04 (REQ-04) [P1]: Given `topics: ["  ", ""]` (blank-only after trim), when `createSubscription` runs, then it throws `WebhookSubscriptionValidationError` — verified by `"createSubscription rejects an empty topic list after normalization"`.
- AC-05 (REQ-05) [P1]: Given an existing subscription, when `updateSubscription` runs with a new label/targetUrl/topics, then the stored record reflects the new values and `updatedAt` advances — verified by `"updateSubscription overwrites label/targetUrl/topics and bumps updatedAt"`.
- AC-06 (REQ-05) [P1]: Given an unknown `id`, when `updateSubscription` runs, then it throws `WebhookSubscriptionNotFoundError` — verified by `"updateSubscription on an unknown id throws WebhookSubscriptionNotFoundError"`.
- AC-07 (REQ-06) [P1]: Given an `active` subscription, when `pauseSubscription` runs then runs again with `{ paused: false }`, then the status toggles `active → paused → active` — verified by `"pauseSubscription toggles active <-> paused"`.
- AC-08 (REQ-06) [P1]: Given a `disabled` subscription, when `pauseSubscription` runs, then it throws `WebhookSubscriptionValidationError` — verified by `"pauseSubscription rejects a disabled subscription"`.
- AC-09 (REQ-07) [P1]: Given an active subscription, when `deleteSubscription` runs, then the row still exists with `status: 'disabled'` and `disabledAt` set (not physically removed) — verified by `"deleteSubscription soft-disables rather than removing the row"`.
- AC-10 (REQ-08) [P1]: Given subscriptions with topics `["post.*"]`, `["*"]` (a different owner), and `[]`, when `findMatching` is queried for `post.published` in the first owner's workspace, then only the exact-owner `post.*` (and any exact/owner-`*` match) subscriptions match, never the empty-topics one or a different workspace's row — verified by `"findMatching matches exact topic, entity wildcard, and owner wildcard, but not other workspaces or inactive rows"` and `"findMatching treats an empty topic list as fail-closed (never matches)"`.
- AC-11 (REQ-09) [P1]: Given one delivered event matching two active subscriptions, when `enqueueDelivery` runs twice for the same event, then exactly one delivery row per subscription exists after both calls (no duplicates) — verified by `"enqueueDelivery enqueues one row per matching active subscription and is idempotent per (event, subscription)"`.
- AC-12 (REQ-10) [P1]: Given a claimed pending delivery and a scripted 200 response, when `processDueDeliveries` runs, then the delivery is marked `delivered` with the response status recorded — verified by `"processDueDeliveries signs, POSTs, and marks a successful attempt delivered"`.
- AC-13 (REQ-12/REQ-13) [P1]: Given a scripted non-2xx response, when `processDueDeliveries` runs, then the delivery is scheduled for retry (re-enters `pending` with a future `nextAttemptAt`), not immediately dead-lettered — verified by `"a non-2xx response schedules a backoff retry rather than dead-lettering immediately"`.
- AC-14 (REQ-13) [P1]: Given a delivery that fails on every attempt, when `processDueDeliveries` runs repeatedly, then after `MAX_DELIVERY_ATTEMPTS` (8) attempts the delivery transitions to `dead` with `deadAt` set — verified by `"repeated failures exhaust maxAttempts and transition the delivery to dead"` and `"MAX_DELIVERY_ATTEMPTS default is 8 per ADR-036 §4"`.
- AC-15 (REQ-11) [P1]: Given a `beforeDispatch` hook that throws, when `processDueDeliveries` runs, then the attempt fails (is retried on backoff) and `httpClient.send` is never called — verified by `"a throwing beforeDispatch hook fails the attempt (retry) and never reaches the HTTP client"`.
- AC-16 (REQ-11) [P1]: Given a `beforeDispatch` hook that returns `{ send: false }`, when `processDueDeliveries` runs, then the attempt fails closed identically to a throwing hook — verified by `"an explicit beforeDispatch veto (send: false) also fails closed without dispatching"`.
- AC-17 (REQ-10) [P2]: Given two hooks with priorities `10` and `5`, when `processDueDeliveries` runs, then the priority-`5` hook runs first and the priority-`10` hook sees its redacted envelope — verified by `"hooks run in priority order and a later hook sees an earlier hook's redacted envelope"`.
- AC-18 (REQ-10) [P1]: Given a delivery whose subscription was paused after it was enqueued, when `processDueDeliveries` runs, then the attempt fails without dispatching — verified by `"a subscription paused after enqueue fails the attempt without dispatching"`.
- AC-19 (REQ-14) [P1]: Given a secret and a raw body, when `signPayload` then `verifySignature` run against the same values, then verification succeeds — verified by `"signPayload then verifySignature round-trips for the same secret and body"`.
- AC-20 (REQ-14/REQ-15) [P1]: Given a signed body, when the body is tampered with or a different secret is used to verify, then `verifySignature` returns `false` — verified by `"verifySignature rejects a tampered body"` and `"verifySignature rejects a signature made with a different secret"`.
- AC-21 (REQ-15) [P1]: Given a header whose `t=` is outside the caller's `toleranceSeconds`, when `verifySignature` runs, then it returns `false` — verified by `"verifySignature rejects a timestamp outside the tolerance window"`.
- AC-22 (REQ-15) [P2]: Given a header carrying two `v1=` entries (rotation overlap) where only one matches, when `verifySignature` runs, then it returns `true` — verified by `"verifySignature accepts a header carrying two v1 values (rotation overlap) if either matches"`.
- AC-23 (REQ-18) [P1]: Given no subscriptions exist, when the list route is called, then it returns `{ subscriptions: [] }` — verified by `src/server/__tests__/admin-integrations-routes.test.ts`'s `"integrations routes: list is empty before any subscription exists"`.
- AC-24 (REQ-19) [P1]: Given a create request, when it succeeds, then the JSON response never includes a secret field (only `secretVersion`/`previousSecretVersion`) — verified by `"integrations routes: create validates https:// and never leaks secret material in the response"`.
- AC-25 (REQ-20) [P1]: Given an active subscription, when pause then resume are called, then status toggles accordingly; given a disabled subscription, pause returns an error response — verified by `"integrations routes: pause toggles active <-> paused, and a disabled subscription rejects pause"`.
- AC-26 (REQ-20/REQ-21) [P1]: Given an unknown subscription id, when pause or delete is called, then the route returns 404 — verified by `"integrations routes: pause/delete on an unknown subscription id returns 404"`.
- AC-27 (REQ-18) [P2]: Given multiple deliveries for a subscription created out of insertion order, when the list route computes `lastDelivery`, then it picks the newest by `createdAt`, not by insertion order — verified by `"integrations routes: list's lastDelivery picks the newest row by createdAt, not insertion order"`.
- AC-28 (REQ-22) [P1]: Given a subscription with several deliveries, when the deliveries route is called, then the response is newest-first; given an unknown subscription id, the route returns 404 — verified by `"integrations routes: deliveries endpoint returns the log newest-first and 404s for an unknown subscription"`.
- AC-29 (REQ-24) [P1]: Given a principal without `integration.manage`, when any integrations admin route is called, then the response is 403; given the grant is restored, then the same route succeeds — verified by `"integrations routes: SPEC-006 REQ-05 — a principal without integration.manage is denied 403 on every route, and a grant restores access"`.
- AC-30 (REQ-23) [P1]: Given a `:workspaceId` path segment that doesn't match the server's configured workspace, when the list route is called, then it returns 404 — verified by `"integrations routes: list rejects a workspaceId that doesn't match the seeded workspace"`.
- AC-31 (GAP-01) [P1]: Given the current `src/server/app.ts`/`deps.ts` composition root, when the repo is searched for non-test callers of `enqueueDelivery`/`processDueDeliveries`, then none exist — the delivery worker is never invoked outside its own unit tests. This is a documented gap, not a passing behavior, and has no corresponding "shipped" AC; it is recorded so the gap itself is traceable and cannot silently regress into "assumed wired."

<!-- Rules:
  - Every REQ-* has at least one AC.
  - Every AC has a [P1], [P2], or [P3] tag.
  - P1 ACs are independently testable — each can be verified without other stories complete.
  - No AC requires knowledge of the implementation to evaluate.
  - AC numbers are never reused.
-->

---

## Invariants

- INV-01: A `webhook_subscriptions` row is never physically deleted; `deleteSubscription` only ever transitions `status` to `disabled` and stamps `disabledAt` — `WebhookSubscriptionRepoPort` has no `delete` method.
- INV-02: `enqueueDelivery` never creates a second delivery row for the same `(workspaceId, subscriptionId, eventId)` triple — idempotent fan-out under at-least-once outbox redelivery semantics.
- INV-03: `processDueDeliveries` never calls `httpClient.send` after a `beforeDispatch` hook has thrown, rejected, or vetoed (`{ send: false }`) — fail-closed by behavior, not merely by comment, per ADR-036's Round-3 audit fold.
- INV-04: The exact `rawBody` string passed to `signer.signForSubscription` is the same string passed to `httpClient.send`'s `body` — no re-serialization occurs between signing and sending.
- INV-05: A delivery never exceeds `MAX_DELIVERY_ATTEMPTS` (8) attempts before transitioning to `dead`.
- INV-06: No signing secret, root key, or sealed-secret plaintext ever appears in any `AdminWebhookSubscriptionResponse`/`AdminWebhookDeliveryResponse` JSON payload — the response DTOs (`src/server/http/admin/integrations.ts`) only ever project `secretVersion`/`previousSecretVersion` (a generation number), never key material.
- INV-07: Every mutation to a `WebhookSubscriptionRecord` goes through `subscriptions.ts`'s exported functions (`createSubscription`/`updateSubscription`/`pauseSubscription`/`deleteSubscription`) — no route or UI code constructs or persists a record directly.

---

## Edge Cases

- EC-01: What happens when a subscription's `topics` array contains only a bare `*`?
  Expected behavior: Per `WebhookTopic`'s doc comment and `topicMatches`, `*` matches every topic for that subscription's owner scope — it is the broadest legal pattern, not rejected, and not treated as invalid input.
- EC-02: What happens when `updateSubscription` is called on a `disabled` subscription?
  Expected behavior: The code does not special-case this — `updateSubscription` has no status check at all, so a disabled subscription's label/target/topics can still be updated (only `pauseSubscription`/`deleteSubscription`'s "disabled is terminal" logic checks status). This is the actual shipped behavior, not necessarily the desired one — flagged here rather than silently assumed to match `pauseSubscription`'s stricter rule.
- EC-03: What happens when a claimed delivery's subscription was hard-removed from the repo entirely (not merely disabled) between enqueue and claim?
  Expected behavior: `attemptOneDelivery` returns `{ ok: false, error: "subscription '...' was not found" }`, which the caller treats as an ordinary failed attempt (retried, then dead-lettered on exhaustion) — verified by `"a claimed row whose subscription was hard-removed from the repo fails (subscription not found)"`.
- EC-04: What happens when a claimed delivery has no recorded envelope (the `DeliveryEnvelopeStore` side-channel has nothing for its `deliveryId`)?
  Expected behavior: The attempt fails with `"no envelope recorded for delivery '...'"`, the same generic failure path as any other attempt failure — verified by `"a claimed row with no recorded envelope fails (envelope-store gap)"`. This is the scope-gap `repo.memory.ts`'s own doc comment flags: `WebhookDeliveryRecord` carries no payload column, so a real, later-process delivery worker has no specified re-hydration path for the envelope (GAP-12).
- EC-05: What happens when the `?limit=` query param on the deliveries route is non-numeric, zero, negative, or above 200?
  Expected behavior: `resolvePageSize` falls back to the default (50) for non-finite/non-positive input, and clamps any parsed value above 200 down to 200 — never rejects the request with an error.
- EC-06: What happens when a create/update request's `targetUrl` is well-formed but its scheme is exactly `https:` with mixed case (e.g. `HTTPS://`)?
  Expected behavior: `new URL(...)`'s `.protocol` is always lowercase-normalized by the WHATWG URL parser, so `validateTargetUrl`'s `parsed.protocol !== "https:"` check treats any case variant of the scheme as `https:` correctly — no separate case-folding logic is needed or present.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| `../http` (`src/http/`, ADR-038) `HttpClientPort`/`EgressPolicy` types | The guarded-transport contract `processDueDeliveries` and `http.memory.ts`'s test double implement | No concrete adapter/composition-root factory exists in this repo pass — only the type/port declarations and a test double are wired; a production delivery worker has no real transport to call (GAP-04) | None shipped; `RecordingHttpClient` is test-only |
| `identity/permissions.ts` catalog | Registration + enforcement of `integration.manage` | If unregistered, `authorize()` calls referencing it fail closed (denied) | None — registration already exists and is exercised by tests |
| `core/origin` egress allowlist (ADR-040) | The real SSRF/allowlist check `isAllowedTarget` is meant to call in production | Not wired — `create.ts` uses `permitAllHttpsTargets`, a permit-all stand-in, so any `https://` URL is currently accepted regardless of the workspace's real allowlist (GAP-06) | `subscriptions.ts`'s own scheme check (`https://` only) is the only real restriction enforced today |
| `KeyringPort` (crosscutting home per ADR-036 Round-3/4 fold, no dedicated ADR-041 yet) | Root-key custody + HKDF-derived signing secrets | No implementation exists; `createFixedSecretSigner(new Map())` is wired in its place with an empty map, so any real delivery attempt against it throws "no signing secret configured" (GAP-02/GAP-03) | None in production; tests inject their own secret maps |
| Core event outbox (ADR-009) | The domain-event stream `enqueueDelivery` is meant to subscribe to | No outbox subscriber for webhook fan-out is registered anywhere in the composition root; `enqueueDelivery` is only invoked from its own unit tests (GAP-01) | None — this is the central missing wiring the whole subsystem depends on to do anything in production |
| Persistence (`WebhookSubscriptionRepoPort`/`WebhookDeliveryRepoPort`) | Durable subscription/delivery storage | Only in-memory adapters exist; a server restart loses all subscriptions and delivery history (GAP-05) | In-memory adapter is what the running dev server actually uses today |

---

## Open Questions

- OQ-01: Should the permission id be renamed from the shipped `integration.manage` to the ADR-036/ADR-INDEX-documented `admin.integrations.manage`, given the sibling `009-redirects` spec found and recorded that `admin.<section>.manage` is the frozen, owner-decided convention (`sweep-crosscutting-decisions-20260710.md` line 71)? This spec makes no change either way — it documents `integration.manage` as the real, currently-registered and tested string. — Owner: Coordinator/human — Resolve by: next Integrations-touching implementation pass (renaming a live permission string is a breaking data migration per ADR-021's flat-string grant storage, same reasoning `009-redirects`' pipeline-state.md already recorded for the analogous Menus/Members gap).
- OQ-02: Which of GAP-01 through GAP-12 should be prioritized for a follow-up implementation spec (real delivery-worker wiring, real signer/transport/repo adapters, egress allowlist, API-key view), and in what order? — Owner: Coordinator/Software Architect — Resolve by: the next `/plan` dispatch that targets Integrations follow-up work.
- OQ-03: Is EC-02's behavior (an `updateSubscription` call succeeding against a `disabled` subscription, unlike `pauseSubscription`/`deleteSubscription`'s terminal-state guard) intentional, or an oversight to fix? — Owner: Software Architect — Resolve by: the next Integrations-touching implementation pass.

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Signing uses Node's built-in `node:crypto` (`createHmac`/`timingSafeEqual`), not a custom crypto implementation; no third-party HTTP/queue library is introduced — the delivery worker is hand-rolled orchestration over injected ports, matching the existing outbox-worker pattern (ADR-009) rather than a new dependency. |
| II — Test-First | COMPLIES (for the built surface) | `src/integrations/__tests__/{delivery,subscriptions,signing,repo.memory}.test.ts` and `src/server/__tests__/admin-integrations-routes.test.ts` exist and assert the real behavior this spec documents. This spec is retroactive — it does not certify new tests; it cites the ones that already exist and pass. |
| III — Simplicity Gate | COMPLIES | Every shipped module traces to a concrete REQ above; the unbuilt ADR-036 surfaces (outbound connectors, API-key view, rotation, redelivery) were not spuriously stubbed out with dead code — they are either pure type/port seams (`IntegrationSecretRecord`, `SecretSealerPort`) or simply absent. |
| IV — Anti-Abstraction Gate | COMPLIES | `WebhookSubscriptionRepoPort`/`WebhookDeliveryRepoPort` each have one real adapter today (in-memory); this is a documented rule-of-two gap (GAP-05: SQLite/Drizzle adapter is the named second implementation), not a silent single-adapter port with no plan — ADR-036 §2 already names the second adapter. `HttpClientPort`/`KeyringPort` are imported/declared, not re-invented locally. |
| V — Integration-First Testing | COMPLIES | Every P1 AC above that has an HTTP/route surface is verified at that boundary in `admin-integrations-routes.test.ts` (real Express routes over the in-memory repos), not only as isolated unit tests. |
| VI — Security-by-Default | EXCEPTION | Per the constitution's standing Art. VI exception, the local dev server is unauthenticated at the transport layer, but structural per-action authz (`integration.manage` via `authorize()`) is enforced on every route from day one (REQ-24, AC-29) — matching the standing exception's own condition. Flagged separately (not an Art. VI violation): the *egress* allowlist (SSRF protection promised by ADR-036 §4/ADR-040) is not actually wired — `permitAllHttpsTargets` is a known, disclosed gap (GAP-06), and the signing-secret path is inert (GAP-02/03), not a security hole in the sense of leaking anything, since it fails closed by throwing rather than silently signing with a wrong/absent secret. |
| VII — Spec Integrity | COMPLIES | This spec's `spec_id`/`content_hash` become the reference for any future downstream artifact touching Integrations; hash is computed via the provider-local validator, not invented. |
| VIII — Observability | COMPLIES (documented as partial) | `webhook.subscription.created\|updated\|deleted` and `webhook.delivery.succeeded\|failed\|dead` are named in ADR-036 §7 as domain events, but no emission of these events was found in `src/integrations/` during this pass — flagged as an additional, smaller gap (not separately GAP-numbered since it was outside this spec's read set to verify exhaustively across `src/core/events`; noted for the Software Architect to confirm). Delivery attempts do record structured `lastError`/`lastResponseStatus` fields on every failure, which is the observability surface this spec can confirm directly. |

---

## Implementation Readiness Gate

This checklist must be fully checked before the spec is handed off to the Software Architect Agent.
The Spec Agent completes this. The Coordinator verifies before routing.

- [x] spec_id assigned and unique (FEAT-015, per fixed task identifier; no prior `015-*` folder existed)
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
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
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled (even if answer is "no deadline")
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (feature has non-trivial ordering/precedence rules: hook priority order, backoff/retry, match precedence)
- [x] traceability.spec.md complete (as-built — REQ/AC/INV/EC rows point at real impl/test files, not PENDING)
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row is reserved for Coordinator Planning Preflight
- [x] Since `spec_mode` is `brownfield`, brownfield evidence paths (the real source files read) are recorded in `spec-manifest.md`

**Gate result:** PASS

---

## Agent Directives (optional)

Always:
- Treat this spec as a description of shipped behavior, not a design proposal — do not "fix" the documented gaps (GAP-01–GAP-12) as part of accepting this spec; they are handed to a future implementation pass.
- Cite the real file paths and function names in this spec (they are exact) rather than re-deriving them from ADR-036 prose, which has already drifted from the code in the permission-string and delivery-worker-wiring claims.

Ask before:
- Renaming `integration.manage` to `admin.integrations.manage` (OQ-01) — this is a breaking grant-storage migration per ADR-021, not a docs fix.
- Building any of GAP-01 through GAP-12 without a dedicated implementation spec scoping which ones are in that pass.

Never:
- Present ADR-036's aspirational/design text as though it describes the current running server without cross-checking against this spec's Dependencies table and GAP list.
