# Behavior Rules Spec: integrations

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
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

**Purpose:** Captures the deterministic, rule-based behavior in the shipped `integrations` code — topic-match semantics, hook ordering, retry/backoff, and numeric limits — sourced from `src/integrations/{delivery,repo.memory,signing}.ts` and their tests, not invented.

---

## 1. Precedence Rules

### 1.1 Topic-Match Precedence

**Situation:** A delivered event's topic (e.g. `post.published`) is checked against a subscription's `topics` array (`InMemoryWebhookSubscriptionRepo.findMatching`'s `topicMatches` helper).

**Match forms, in the order the code checks them (`topicMatches`):**
1. `pattern === "*"` — owner-scoped "all topics" wildcard. Matches immediately, short-circuiting the remaining checks.
2. `pattern === topic` — exact match.
3. `pattern.endsWith(".*")` — entity wildcard; matches if `topic` starts with the pattern's prefix (including the trailing `.`).
4. None of the above — no match for this pattern.

A subscription matches an event if ANY of its `topics` entries matches by any of the three forms above — there is no precedence between multiple matching patterns within one subscription (it's an OR, not "highest wins"); the subscription simply matches or doesn't.

**Example:**
- Scenario: a subscription has `topics: ["post.published", "media.*"]`.
- Input: event topic `media.uploaded`.
- Result: matches via the `media.*` entry (form 3); the `post.published` entry is irrelevant to this event.

**Test requirement:** Covered by `repo.memory.test.ts`'s `"findMatching matches exact topic, entity wildcard, and owner wildcard, but not other workspaces or inactive rows"`.

---

### 1.2 Fail-Closed Empty Topic Set

**Situation:** A subscription with `topics: []`.

**Rule:** An empty topic array NEVER matches any event, regardless of the event's topic — there is no "empty means all" fallback. This is stated explicitly in `WebhookSubscriptionRecord.topics`'s own doc comment ("Empty = matches nothing (fail-closed)") and is exactly what `createSubscription`/`updateSubscription` already prevent by rejecting an empty-after-normalization topic list at write time — so in practice this rule guards against a row that somehow reached that state by another path (e.g. a future admin edit route not yet built).

**Test requirement:** Covered by `repo.memory.test.ts`'s `"findMatching treats an empty topic list as fail-closed (never matches)"`.

---

## 2. Ordering Rules

### 2.1 `beforeDispatch` Hook Execution Order

**Field used for ordering:** `WebhookBeforeDispatchHook.priority` (a plain number).

**Direction:** Ascending — lower `priority` values run first (`runBeforeDispatchHooks`: `[...hooks].sort((a, b) => a.priority - b.priority)`).

**Stability:** JavaScript's `Array.prototype.sort` is stable as of the engines this repo targets, so two hooks with identical `priority` run in the order they were passed in the `hooks` array — this is incidental engine behavior, not a rule the code enforces itself (no explicit secondary sort key exists).

**Threading:** Each hook receives the (possibly already-replaced) envelope from the previous hook — a later hook always sees an earlier hook's redacted/transformed `envelope`, never the original.

**Invariant:** Hook order is deterministic given a fixed `priority` assignment; a throw or veto by any hook stops the chain immediately (no subsequent hook runs).

**Test requirement:** Covered by `delivery.test.ts`'s `"hooks run in priority order and a later hook sees an earlier hook's redacted envelope"`.

---

### 2.2 Delivery Claim Order

**Context:** `WebhookDeliveryRepoPort.claimPending` selects due rows for one delivery-worker pass.

**Order:** Ascending `nextAttemptAt` (the in-memory adapter: `.sort((a, b) => a.nextAttemptAt.localeCompare(b.nextAttemptAt))`) — the longest-overdue row is claimed first.

**Cap:** At most `batchSize` rows per call (default 20, per `ProcessDueDeliveriesOptional.batchSize`).

**Invariant:** A row is never claimed unless `status === 'pending'` AND `nextAttemptAt <= nowIso`; claiming increments `attempts` and flips `status` to `delivering` as part of the same call (not a separate step) — a caller cannot observe a "claimed but not yet counted" state.

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| `secretVersion` | New `WebhookSubscriptionRecord` | `1` | First generation; rotation (not yet built, GAP-10) would mint `version + 1` |
| `previousSecretVersion` | New `WebhookSubscriptionRecord` | `null` | No rotation is in progress at creation time |
| `status` | New `WebhookSubscriptionRecord` | `"active"` | A newly created subscription should immediately be eligible for fan-out matching — there is no "draft"/"pending approval" intermediate state in this pass |
| `paused` (optional param) | `PauseSubscriptionOptional` | `true` | `pauseSubscription`'s single-function, both-directions design defaults to the "pause" direction — calling it with no options is read as "pause this" |
| `batchSize` | `ProcessDueDeliveriesOptional` | `20` | Matches the outbox worker's own convention (`src/core/events/outbox-worker.ts`'s `processOutbox`), which this module mirrors by design |
| `requestTimeoutMs` | `ProcessDueDeliveriesOptional` | `10_000` (10s) | A conservative per-attempt HTTP timeout; the caller (not the transport) owns retry, so this only bounds one attempt |
| `maxAttempts` | `ProcessDueDeliveriesOptional` | `MAX_DELIVERY_ATTEMPTS` (8) | ADR-036 §4's "default 8 over ~ a day" target |
| `?limit=` | `INTEGRATIONS_DELIVERIES` query param | `50` | `DEFAULT_DELIVERIES_PAGE_SIZE` — a reasonable single-screen page size for a log view |
| `hooks` | `ProcessDueDeliveriesOptional` | `[]` | No `beforeDispatch` contributor is registered in this pass (GAP-07); an empty array means every delivery is dispatched unfiltered whenever the worker itself is eventually invoked |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| `MAX_DELIVERY_ATTEMPTS` | `8` | `processDueDeliveries` (compares `row.attempts >= maxAttempts`) | Exceeding this transitions the delivery to `dead`, never silently retries forever |
| Backoff base step | `5 minutes` (`BASE_BACKOFF_MS`) | `computeBackoffMs` | The first retry's un-jittered midpoint |
| Backoff cap per step | `6 hours` (`MAX_BACKOFF_STEP_MS`) | `computeBackoffMs` | No single retry step waits longer than this however high `attempts` climbs |
| Backoff jitter | "equal jitter": `half + random() * half`, where `half = min(cap, base * 2^(attempts-1)) / 2` | `computeBackoffMs` | Always waits at least `half` of the exponential step, at most the full step — never zero delay, never unbounded drift |
| Delivery-log page size default | `50` | `resolvePageSize` in `deliveries.ts` | Applied when `?limit=` is absent, non-numeric, or `<= 0` |
| Delivery-log page size max | `200` (`MAX_DELIVERIES_PAGE_SIZE`) | `resolvePageSize` | Any requested `?limit=` above 200 is silently clamped down, never rejected with an error |
| Idempotency-check scan cost | O(a subscription's full delivery history) | `isAlreadyEnqueued` (calls `listBySubscription` with `limit: Number.MAX_SAFE_INTEGER`) | Explicitly flagged in `delivery.ts`'s own doc comment as acceptable for dev/test volumes only — a production (SQLite) adapter must back this with a unique index on `(workspace_id, subscription_id, event_id)`, not a scan; this is a real, disclosed scaling gap, not a hidden one |
| HTTP per-attempt timeout | `10_000 ms` default | `attemptOneDelivery` via `deps.requestTimeoutMs` | Caller-configurable per `processDueDeliveries` call; no retry/backoff logic lives inside this timeout itself |

---

## 5. Deduplication Rules

### 5.1 What Counts as a Duplicate (delivery fan-out)

A delivery is considered a duplicate of an existing one if both of the following hold:
1. Same `workspaceId` (implicit — fan-out only ever runs within one event's workspace).
2. Same `(eventId, subscriptionId)` pair as an existing `webhook_deliveries` row for that subscription.

**Not checked as a duplicate:** two DIFFERENT subscriptions matching the SAME event — that is the intended one-event-to-N-subscriptions fan-out, not a duplicate.

### 5.2 How Duplicates Are Handled

**At fan-out time:** `enqueueDelivery` calls `isAlreadyEnqueued` before inserting; if a matching `(eventId, subscriptionId)` delivery already exists, the subscription is silently skipped for this call — no error, no second row, no updated `attempts`. This makes `enqueueDelivery` safe to call more than once for the same event (the ADR-036 §4 requirement: "an outbox re-delivery cannot double-enqueue").

**No dedup at the subscription-creation level:** `createSubscription` does not check for an existing subscription with the same `label`/`targetUrl`/`topics` — a workspace can have multiple subscriptions with identical fields; nothing in the shipped code rejects this as a conflict.

---

## 6. Tie-Break Logic

### 6.1 "Most Recent Delivery" for the List Route's `lastDelivery` Field

**When does this apply:** `list.ts`'s `mostRecentDelivery` helper, computing which of a subscription's (bounded, most-recent-50) deliveries to show as its summary.

**Tie-break rule:** Whichever delivery has the lexicographically greatest `createdAt` string wins (`candidate.createdAt > latest.createdAt`); string comparison, not a numeric timestamp — this works because `createdAt` is always an ISO-8601 UTC string, which sorts identically lexicographically and chronologically. No secondary tie-break exists for two deliveries with an identical `createdAt` millisecond — whichever `reduce` encounters second in that exact case would win arbitrarily (JS's `>` comparison on equal strings is `false`, so `reduce` keeps `latest`, i.e. the first-encountered of the tied pair wins). This is an unlikely, undocumented-in-ADR edge case, disclosed here rather than silently assumed impossible.

**Rationale:** The route's own doc comment states explicitly that `WebhookDeliveryRepoPort.listBySubscription` makes no ordering guarantee, so the route computes "most recent" itself rather than trusting repo return order.

**Invariant:** Given the same set of deliveries, `mostRecentDelivery` always returns the same result (deterministic for non-tied `createdAt` values).

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| `attempts` passed to `computeBackoffMs` is `1` (first failure) | Un-jittered midpoint ≈ 2.5 minutes (`half = 5min/2`); actual delay is `half..step` | Yes — covered by `"computeBackoffMs stays within [half, full] of the exponential step and respects the cap"` |
| `attempts` is large enough that the exponential step would exceed 6 hours | Step is capped at `MAX_BACKOFF_STEP_MS` (6h) — never grows unbounded | Yes — same test as above |
| Two `beforeDispatch` hooks share an identical `priority` | Order falls back to array-insertion order (stable sort); not specified as an error case, since the code never validates for priority collisions | No dedicated test found for the exact-tie case; documented as a real gap in test coverage, not asserted as untested-and-fine |
| A subscription is disabled/paused AFTER a delivery for it was already claimed (`delivering`) | The in-flight attempt still runs to completion (no cancellation mechanism exists) using the subscription snapshot re-fetched inside `attemptOneDelivery`; if the subscription is no longer `active` at that re-fetch, the attempt fails with `"is '<status>', not active"` | Yes — covered by `"a subscription paused after enqueue fails the attempt without dispatching"` |
| `?limit=` query param is a non-numeric string (e.g. `"abc"`) | `Number("abc")` is `NaN`, which is not finite, so `resolvePageSize` falls back to the 50 default rather than erroring | No dedicated test found for this exact input; behavior is directly derivable from `resolvePageSize`'s `Number.isFinite` guard, documented here for completeness |
| `enqueueDelivery` called for an event whose topic matches ZERO subscriptions | Returns `{ enqueued: [] }`; no error, no side effect | Implicit in `"enqueueDelivery enqueues one row per matching active subscription..."` (the zero-match case is the trivial subset of that test's setup, not separately asserted) |
