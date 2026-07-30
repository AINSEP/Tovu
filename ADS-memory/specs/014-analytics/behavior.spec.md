# Behavior Rules Spec: analytics

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-014 |
| feature_name | FEAT-014-analytics |
| version | 1.0.0 |
| content_hash | sha256:PENDING |
| last_edited | 2026-07-13T00:00:00Z |

**Purpose:** This feature has multiple real precedence, ordering, bounds, and drop-priority
rules baked into `ingestHit` and `LocalBufferSink.list()`. This file documents them as
they exist in the shipped code (`src/analytics/ingest.ts`, `src/analytics/repo.memory.ts`),
using EARS syntax per the template's requirement.

---

## 1. Precedence Rules

### 1.1 Drop-Reason Precedence (which reason "wins" when multiple policy conditions apply to one hit)

**Situation:** A single beacon hit may simultaneously satisfy more than one drop
condition (e.g. an unresolvable host that is also DNT-flagged). `ingestHit` returns exactly
one `reason`, so an evaluation order is load-bearing.

**Sources in precedence order (highest to lowest, per `ingestHit`'s literal statement
order in `src/analytics/ingest.ts`):**
1. `workspace_unresolved` — checked first; nothing downstream can even run without a
   resolved workspace (the site config itself is workspace-scoped).
2. `analytics_disabled` — checked second, against the resolved workspace's config.
3. Exclusion reasons (`dnt` → `gpc` → `excluded_path` → `excluded_ip`, in that literal
   order inside `findExclusionReason`) — checked third, as a single grouped step.
4. `pii_rejected` — checked fourth, only after exclusion checks pass.
5. `dropped_by_hook` — checked last, after the hit has been fully normalized; this is the
   only drop reason that can see a *normalized* hit (all earlier reasons short-circuit
   before normalization runs).

**Example:**
- Scenario: a beacon whose host does not resolve AND whose `dnt` flag is set.
- Input: `resolveWorkspaceForHost` returns `null`; `beacon.dnt = true`.
- Result: `reason: "workspace_unresolved"` — the DNT check never runs, because the function
  returns before `findExclusionReason` is ever called.

**EARS statement:** WHEN a hit satisfies more than one drop condition, the system shall
report only the first-checked condition's reason, in the fixed order: workspace
resolution, site-enabled check, DNT, GPC, path exclusion, IP exclusion, PII rejection,
hook drop.

**Test requirement:** Each pairwise precedence is not separately unit-tested today — the
existing test suite (`src/analytics/__tests__/ingest.test.ts`) exercises each reason in
isolation (one drop condition at a time), not two simultaneously. This is a disclosed
coverage gap (see `traceability.spec.md` §6.2), not a claim that pairwise ordering is
currently verified by an automated test.

---

### 1.2 Config-Source Precedence

**Situation:** DNT/GPC honoring is conditional on the site's config, not just the
beacon's own flag.

**Sources in precedence order (highest to lowest):**
1. `config.honorDoNotTrack === false` (or `honorGlobalPrivacyControl === false`) — if the
   site has opted out of honoring the signal, the beacon's own `dnt`/`gpc` flag is ignored
   entirely; the hit is not dropped for that reason no matter what the client sent.
2. `beacon.dnt`/`beacon.gpc === true` — only consulted when the config says to honor it.

**Example:**
- Scenario: `config.honorDoNotTrack = false`, `beacon.dnt = true`.
- Result: the hit is **not** dropped for DNT — `findExclusionReason` requires both
  `config.honorDoNotTrack && beacon.dnt` to be true.

**EARS statement:** WHILE a site's config has `honorDoNotTrack`/`honorGlobalPrivacyControl`
set to `false`, the system shall not drop hits for the corresponding client-declared
`dnt`/`gpc` flag, regardless of that flag's value.

---

## 2. Ordering Rules

### 2.1 Recent-Hits Read Order

**Field used for ordering:** insertion order into `LocalBufferSink.hits` (i.e., ingest
arrival order — there is no separate `occurredAt`-based sort; the buffer's array order
*is* the ordering key).

**Direction:** `list()` returns newest-first (`this.hits.slice(-limit).reverse()`) — the
most recently `accept`ed hit is `hits[0]` in the response.

**Stability:** Stable in the trivial sense that array insertion order is deterministic;
there is no secondary tie-break because there is no scenario where two hits can occupy the
same array position.

**When overridden:** Never — there is no caller-supplied sort parameter on the recent-hits
route or the `list()` method.

**Invariant:** The order returned by `list()` must always be the reverse of buffer
insertion order for the last N entries; out-of-order results are a bug.

**EARS statement:** WHEN `list()` is called, the system shall return hits ordered by
reverse insertion order (most recently accepted first), truncated to the effective limit
from §4 below.

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| `kind` | `IngestBeacon` (parsed at the HTTP boundary) | `"pageview"` | Any beacon value other than the literal string `"event"` becomes `"pageview"` — a safe, permissive default for the overwhelmingly common hit type. |
| `host` | `IngestBeacon` (parsed at the HTTP boundary) | request's own `hostname` | Lets a beacon that omits `host` still resolve to *some* value rather than an empty string, even though that fallback will typically fail workspace resolution in production. |
| `dnt` / `gpc` | `IngestBeacon` | `false` | Strict-boolean coercion (`raw.dnt === true`) — any non-`true` value, including a truthy non-boolean, is treated as not-set. Opt-in tracking-respect signals should never be accidentally triggered by a malformed payload. |
| `country` / `region` | `NormalizedHit` | `null` | No `GeoIpPort` exists yet (see `feature.spec.md` Scope: Out of scope); hard-coded `null` rather than a guess. |
| `limit` (recent-hits `list()`) | `LocalBufferSink.list()` | `50` (`DEFAULT_LIST_LIMIT`) | Enough rows for a useful "recent activity" glance without a heavy response for an admin screen with no pagination control. |
| `config.enabled` (dev stub) | `server/app.ts`'s hard-coded `AnalyticsConfigPort` | `true` | Dev/walking-skeleton convenience — there is no real per-site settings-backed config yet (see Dependencies in `feature.spec.md`); every site behaves as "analytics on" until that wiring exists. |
| `rootKeySeed` (dev stub) | `server/app.ts` | `"dev-only-insecure-seed"` (via `process.env.ANALYTICS_ROOT_KEY_SEED ?? ...`) | Disclosed insecure fallback so the ingest path is runnable in dev without configuring a real secret; a real deployment must set the env var. |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| Max custom event properties per hit | 20 keys (`MAX_EVENT_PROP_COUNT`) | service (`validateEventProps`) | Exceeding this throws `AnalyticsPiiRejectedError`, surfaced as `reason: "pii_rejected"` — not silently truncated. |
| Max string length per event property value | 200 chars (`MAX_EVENT_PROP_STRING_LENGTH`) | service (`validateEventProps`) | Same reject-not-truncate behavior. |
| Max beacon `host` length | 253 chars (DNS hostname max) | HTTP boundary (`boundedString`) | Silently truncated (not rejected) — the HTTP parsing layer clips untrusted input rather than erroring. |
| Max beacon `path` length | 2048 chars | HTTP boundary | Silently truncated. |
| Max beacon `referrer` length | 2048 chars | HTTP boundary | Silently truncated. |
| Max beacon `eventName` length | 200 chars | HTTP boundary | Silently truncated. |
| Recent-hits `list()` default limit | 50 (`DEFAULT_LIST_LIMIT`) | service (`LocalBufferSink.list`) | Applied when no valid `limit` is supplied. |
| Recent-hits `list()` hard ceiling | 500 (`MAX_LIST_LIMIT`) | service (`clampListLimit`) | A caller-requested limit above 500 is silently clamped down to 500 — never rejected with an error, never honored above the ceiling. |
| Recent-hits `list()` floor | 1 | service (`clampListLimit`) | `limit <= 0` (including `0` and negative values) clamps up to `1`, not rejected and not treated as "no limit." |
| Session window width | 30 minutes (`SESSION_WINDOW_MINUTES`) | service (`deriveSessionId`) | Fixed bucket width bounding session-id granularity; not configurable per site today. |
| Daily salt output length | 32 bytes (`DAILY_SALT_LENGTH_BYTES`) | service (`deriveDailySalt`) | Fixed HKDF output length; not configurable. |
| IP truncation | IPv4 → `/24` (zero last octet); IPv6 → first 3 hextets + `::` | service (`truncateIp`) | Applied before the truncated prefix is folded into `visitorHash`'s `coarseRequestSignal` — the raw IP itself is never used in the hash input. |
| Path-exclusion glob syntax | `*` wildcard only | service (`pathMatchesGlob`) | No `?`, character classes, or regex metacharacters beyond literal-escape + `*` → `.*`; deliberately simple for v1. |
| IP-exclusion range syntax | exact match or IPv4 CIDR only | service (`ipMatchesRange`) | IPv6 CIDR ranges are never matched (`ipMatchesRange` returns `false` whenever either side contains `:`) — an IPv6 exclusion range in config would silently never match anything. |

---

## 5. Deduplication Rules

N/A — this feature does not deduplicate inputs. Every accepted beacon call produces
exactly one appended `NormalizedHit`; there is no duplicate-hit detection, no idempotency
key, and no equivalent-request collapsing anywhere in the ingest path.

---

## 6. Tie-Break Logic

N/A — this feature has no scenario where multiple items compete for the same role. The
recent-hits ordering (§2.1) is a pure insertion-order reversal with no possibility of a
tie (array positions are always distinct), and there is no "current/active" record concept
anywhere in this slice.

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| `eventProps` has exactly 20 keys | Accepted (boundary is `> 20`, not `>= 20`). | Yes — not currently covered by an existing test (coverage gap; see traceability §6.2). |
| `eventProps` has exactly 21 keys | Rejected with `pii_rejected`. | Yes — covered (`validateEventProps rejects a property bag over the key-count bound`, 25 keys used, which is `> 20`; the exact boundary of 21 is not separately tested). |
| A string property value is exactly 200 characters | Accepted (boundary is `> 200`). | Yes — not currently covered (coverage gap). |
| A string property value is exactly 201 characters | Rejected. | Yes — covered indirectly (`x".repeat(500)`, well over the boundary; the exact 201 boundary is not separately tested). |
| `?limit=` requests exactly 500 | Returned in full (boundary is clamp-to-500, inclusive). | Yes — not currently covered (only `>500` requests are tested, via `limit: 100000`). |
| `?limit=` requests exactly 501 | Clamped down to 500. | Yes — covered (`limit: 100000` exercises the same clamp path, but the exact 501 boundary is not separately tested). |
| Two hits arrive in the same UTC millisecond | No special handling — both are appended in call order; `list()`'s reverse-insertion-order guarantee still holds because it is order-of-append, not a timestamp sort. | No — this is a structural guarantee of the array-based buffer, not a race condition to test. |
| A `beforeIngest` hook throws (rather than returning `null` or a hit) | Propagates as an unhandled rejection out of `ingestHit` — the beacon route's outer `try/catch` swallows it (still `204`), but a hook that reliably throws would silently and permanently stop all ingestion for that call. | Yes — not currently covered by an existing test (coverage gap; a hook exception is a distinct scenario from a hook returning `null`, which *is* tested). |
| `resolveWorkspaceForHost` itself throws | Propagates out of `ingestHit` before any drop-reason logic runs; caught by the route's outer `try/catch` (still `204`). | No dedicated test exists; same disclosed gap as the hook-throw case above. |

---
