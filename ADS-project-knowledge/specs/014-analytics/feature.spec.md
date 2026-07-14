# Feature Spec: analytics

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-014 |
| version | 1.0.0 |
| status | APPROVED |
| content_hash | sha256:c3a7c5b1c25acfc4d4c7e13a520a5f5b7a14003319eeebf70d40cbd603a7732a |
| feature_name | FEAT-014-analytics |
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

**This is as-built documentation of a shipped feature, written retroactively.** `analytics`
was implemented directly from ADR-035 without a preceding SPEC-NNN package; this spec
documents what the code in `src/analytics/`, `src/server/routes/site/analytics-ingest.ts`,
`src/server/routes/admin/analytics/recent-hits.ts`, and `apps/admin/src/sections/Analytics.tsx`
actually does today, not what the ADR aspires to build next. Analytics today is the
**ingest half only**: a privacy-first, cookie-less first-party beacon (`POST /_analytics/e`)
that normalizes hits and PII-death-boundaries them into an in-process, non-durable buffer
(`LocalBufferSink`), plus an admin screen that reads that buffer as a raw "recent hits" list.
There is no rollup, no aggregate/time-series storage, no dashboards, no goals registry, and
no export — those are explicitly unbuilt (see Scope and Known Deviations below).

---

## Problem Statement

**Current state (as documented here):** A site visitor's page view triggers a
`navigator.sendBeacon` POST to `/_analytics/e`. The server normalizes the request
(workspace resolution, policy checks, PII-death, salted `visitorHash` derivation) and
appends the resulting `NormalizedHit` to an in-memory array (`LocalBufferSink`) with no
disk/DB persistence. A workspace admin can view the most recent hits currently sitting in
that array through `GET /api/admin/v1/workspaces/:workspaceId/analytics/recent-hits` and the
`Analytics.tsx` admin screen — a raw list, not a dashboard. Restarting the server discards
all buffered hits; there are no totals, trends, breakdowns, goals, or exports anywhere in
the running system.

**Desired state (per ADR-035, not yet built):** A durable, aggregate/time-series storage
layer (`analytics_events`/`analytics_aggregate`/`analytics_session`/`analytics_goal_def`),
a rollup job, a query surface (time-series + breakdown + realtime), a goals registry, CSV/JSON
export, and full admin dashboards. ADR-035's Round-2 fold further says this later layer
should ship as a **bundled Tier-3 plugin**, re-homed at the ADR-023 `dataModule`
reconciliation-engine milestone, while the beacon-normalization seam (`AnalyticsSinkPort`)
stays a frozen, core-owned Tier-2 boundary.

**Why now:** This spec exists to give the already-shipped ingest slice a durable,
traceable requirements record — so future work (the storage/rollup/dashboard build-out)
has an accurate baseline of what exists today instead of conflating it with ADR-035's full
target design. No external deadline; this is a documentation debt closure, not new
feature work.

**Success signal:** A developer who has never touched this codebase can read this spec
package and correctly predict, without reading `src/analytics/*`, that (a) the beacon
always returns `204` regardless of outcome, (b) nothing survives a server restart, and (c)
the admin "Analytics" screen shows a flat recent-hits list with no charts — confirmed by
this spec's traceability rows citing the real test files that assert exactly that behavior.

---

## User Journey

**Trigger:** A visitor loads a page on a Tovu-hosted site whose theme includes the
first-party analytics beacon script; or a workspace admin opens the admin **Analytics**
section.

**Steps (ingest path):**
1. The visitor's browser calls `navigator.sendBeacon("/_analytics/e", payload)` on page
   load (and again for a declared custom/goal event).
2. The server (`registerAnalyticsIngestRoute`) parses the untrusted JSON body into a
   bounded `IngestBeacon`, builds a transient `IngestContext` from the request's IP /
   User-Agent / Accept-Language, and calls `ingestHit`.
3. `ingestHit` resolves the host to a workspace, checks the per-site config (enabled,
   DNT/GPC, exclusions), validates/rejects PII-shaped event properties, derives the daily
   salted `visitorHash` and coarse device/browser/os classes, derives a bounded session id,
   and — if nothing dropped the hit — hands the resulting `NormalizedHit` to the injected
   `AnalyticsSinkPort` (`LocalBufferSink`, which appends it to an in-memory array).
4. The route always responds `204 No Content` with an empty body, regardless of whether the
   hit was accepted, dropped for a policy reason, or the handler threw.

**Steps (admin read path):**
1. Admin opens the **Analytics** section of the admin SPA.
2. `Analytics.tsx` calls `GET /api/admin/v1/workspaces/:workspaceId/analytics/recent-hits`
   (session-gated by the blanket `/api/admin` `requireAdminSession` middleware — see Known
   Deviations for why this is *not* additionally permission-gated).
3. The server returns the most recent (default 50, caller-clamped up to 500) hits from the
   same in-memory buffer, newest-first, projected to seven honest raw-ingest fields.

**Outcome:** The visitor's browser never observes a state change (fire-and-forget beacon).
The admin sees a flat table of recent path/referrer/device+browser/kind/time rows with an
explicit on-screen notice that there is no aggregation layer yet.

**Alternate paths:** Beacon requests are silently dropped (still `204`) for: unresolved
host, disabled site, DNT/GPC, excluded path/IP, or PII-shaped event properties — the
public endpoint never turns a policy outcome into a distinguishable HTTP response (see
INV-05). The admin screen shows an explicit error notice on fetch failure and an explicit
empty-state notice when the buffer is empty (e.g., right after a server restart, or before
any traffic has arrived).

Note: This section owns the high-level user-visible flow. Deterministic ordering,
clamping, and validation-bound detail live in `behavior.spec.md`.

---

## Scope

**In scope (what is actually implemented and documented by this spec):**
- The public, unauthenticated ingest beacon route `POST /_analytics/e`
  (`src/server/routes/site/analytics-ingest.ts`).
- The ingest application service `ingestHit` and its normalization helpers
  (`src/analytics/ingest.ts`): workspace resolution, per-site config checks (enabled,
  DNT/GPC, path/IP exclusion), PII-shaped event-property rejection, salted `visitorHash`
  derivation, coarse UA classification, session-id derivation, referrer/UTM extraction,
  the optional `beforeIngest` hook.
- Daily salt derivation (`src/analytics/salt.ts`), including its documented, disclosed
  `rootKeySeed`-string simplification (not yet wired to a real `KeyringPort`).
- The in-memory `AnalyticsSinkPort` adapter, `LocalBufferSink` (`src/analytics/repo.memory.ts`),
  including its bounded `list()` read accessor.
- The admin read route `GET /api/admin/v1/workspaces/:workspaceId/analytics/recent-hits`
  (`src/server/routes/admin/analytics/recent-hits.ts`).
- The admin UI screen `Analytics.tsx` (`apps/admin/src/sections/Analytics.tsx`) and its
  `api.listRecentAnalyticsHits` client call (`apps/admin/src/lib/api.ts`).
- The type/port surface (`src/analytics/types.ts`, `src/analytics/ports.ts`) as currently
  declared, including the parts (aggregate storage types, query types, goal types, the
  `AnalyticsRepoPort`) that exist as **types/interfaces only**, with zero implementing code.

**Out of scope (named in ADR-035 as later work, and confirmed absent from the codebase by
this spec's research — none of the following has any implementation, adapter, table, or
route in this repo today):**
- Durable aggregate/time-series storage (`analytics_events`, `analytics_aggregate`,
  `analytics_session`, `analytics_goal_def` tables) — no SQL schema, no SQLite adapter, no
  DDL of any kind exists.
- The rollup job, retention/pruning job, and any wiring to the ADR-009 outbox/scheduler
  spine — `AnalyticsRepoPort.rollup`/`pruneExpired` are declared types with no
  implementation; nothing calls them.
- The read/query surface (`queryTimeSeries`, `queryBreakdown`, `realtime`) and any
  dashboard beyond the raw recent-hits list — `StatsQuery`/`StatsResult`/`RealtimeSnapshot`
  are types only.
- The goals registry (`AnalyticsGoalDef`) and any goal-matching/triggering logic.
- CSV/JSON export.
- The `ForwardingSink` external-collector adapter (ADR-006 rule-of-two "named-next"
  adapter) — only `LocalBufferSink` exists.
- GeoIP country/region resolution — `NormalizedHit.country`/`region` are hard-coded `null`
  in `ingestHit` pending a `GeoIpPort` that does not exist.
- Real host→workspace routing and rate-limiting on the beacon — `resolveWorkspaceForHost`
  is a single-workspace stub in `server/app.ts` (`async () => routeDeps.workspaceId`), and
  there is no rate-limiter wired onto `/_analytics/e`.
- Per-site configuration persistence via the ADR-028 settings ledger — `server/app.ts`
  wires a hard-coded, always-`enabled: true` config stub instead of reading real settings.
- Any `analytics.*` or `admin.analytics.*` permission enforcement (see Known Deviations).
- The Tier-2/Tier-3 plugin split itself (see Known Deviations) — everything that exists
  today runs as core code; there is no separate plugin package.

---

## Known Deviations From ADR-035 (flagged, not silently resolved)

This spec's job includes reporting where the shipped code diverges from ADR-035's text.
Two concrete deviations were found:

1. **The Tier-2/Tier-3 split described in ADR-035 (and its Round-2 "D4" fold) is
   NOT REAL in the code today — it is a purely aspirational grouping, not an implemented
   boundary.** ADR-035 Round-2 says storage/rollup/dashboards/goals/export "become a bundled
   Tier-3 plugin." There is no plugin package, no `manifest.json`, no separate module
   directory, and no `dataModule` wiring for any of that surface anywhere in this repo —
   because none of that surface is implemented at all (see Scope: Out of scope, above). What
   *is* real is a much simpler fact: only the ingest normalization half of ADR-035 has been
   built (`src/analytics/ingest.ts`, `salt.ts`, `repo.memory.ts`, the two HTTP routes, and the
   admin screen). The module's own `INFO.md` and every ingest file's header comment are
   explicit and consistent about this ("Storage, rollup, dashboards, goals, and export are a
   separate, later concern... and are NOT implemented in this module yet"). So: the *split*
   is real as a stated intent and as a frozen seam (`AnalyticsSinkPort`), but the *Tier-3
   plugin side of the split does not exist in any form* — there is nothing to classify as
   Tier-2-vs-Tier-3 on the unbuilt side; it is simply unbuilt.
2. **No `admin.analytics.view` (or any `analytics.*`) permission is registered or checked
   anywhere.** ADR-035's original Decision §6 specifies flat permissions
   (`analytics.read`, `analytics.read.realtime`, `analytics.manage`, `analytics.goals.manage`,
   `analytics.export`); its Round-2 fold instead specifies `admin.analytics.view`
   (the `admin.{section}.{action}` convention frozen in
   `reports/architecture/sweep-crosscutting-decisions-20260710.md` §E). **Neither string
   appears in `src/identity/permissions.ts`'s registered catalog, and neither is checked by
   any analytics route.** `GET /api/admin/v1/workspaces/:workspaceId/analytics/recent-hits`
   calls no `authorize()` at all — unlike the `settings`/`integrations` admin routes, which
   do call `authorize()` with a registered permission string. The route is reachable by any
   authenticated admin session (gated only by the blanket `requireAdminSession` middleware
   `server/app.ts` applies ahead of every `/api/admin/*` route), with no per-action
   permission distinction. This is a genuine implementation gap against ADR-035 §6 — not a
   naming-convention nuance like the Redirects spec's `admin.redirects.manage` finding
   (SPEC-009), because there Redirects hadn't shipped any route yet; here the route is
   live and unguarded. Recorded as REQ-14's stated absence below (Constitution Article VI is
   marked EXCEPTION for this reason) rather than invented as if it were enforced.

Both are stated here as the honest as-built record; neither blocks this spec's own
Implementation Readiness Gate, because this spec documents current behavior rather than
prescribing new behavior — but both should inform whatever spec eventually covers the
Tier-3 storage/dashboard build-out and the permission-hardening follow-up.

---

## Requirements

- REQ-01: The system shall accept anonymous `POST /_analytics/e` beacon requests and always
  respond `204 No Content` with an empty body, regardless of the beacon's accept/reject
  outcome or any handler error.
- REQ-02: The system shall resolve the beacon's `host` field to a workspace id via an
  injected resolution function, and drop (not store) the hit when resolution returns `null`.
- REQ-03: The system shall read the resolved workspace's `AnalyticsSiteConfig.enabled` flag
  and drop the hit when it is `false`.
- REQ-04: The system shall drop the hit when the beacon's `dnt`/`gpc` flag is set and the
  site config's corresponding `honorDoNotTrack`/`honorGlobalPrivacyControl` flag is `true`.
- REQ-05: The system shall drop the hit when its path matches a configured excluded-path
  glob, or when the request IP matches a configured excluded IP (exact address or IPv4
  CIDR range).
- REQ-06: The system shall derive a `visitorHash` as
  `sha256(dailySalt ‖ siteHost ‖ coarseRequestSignal)`, where `dailySalt` is a 32-byte
  HKDF-SHA256 output derived on demand from `(rootKeySeed, workspaceId, utcDate)` and never
  persisted, and `coarseRequestSignal` is a truncated IP prefix plus coarse device/browser
  class — never the raw IP address or the raw User-Agent string.
- REQ-07: The system shall classify the request's User-Agent into a coarse `deviceClass`
  (`desktop`/`mobile`/`tablet`/`bot`/`unknown`) and coarse `browserFamily`/`osFamily`
  strings, and shall never place the raw User-Agent string on any returned or stored object.
- REQ-08: The system shall validate custom event properties, rejecting the entire hit
  (via `AnalyticsPiiRejectedError`, surfaced as `reason: "pii_rejected"`) when the property
  bag exceeds 20 keys, any string value exceeds 200 characters, any key name matches a
  PII-suggestive pattern, or any string value is shaped like an email address.
- REQ-09: The system shall derive a deterministic `sessionId` from the visitor hash and a
  bounded, fixed 30-minute same-UTC-day time window.
- REQ-10: The system shall extract a `referrerHost` from the beacon's full `referrer` URL
  (or `null` on a missing/unparsable referrer) and extract allowlisted UTM parameters
  (`utm_source`/`utm_medium`/`utm_campaign`/`utm_term`/`utm_content`) as a defensive
  fallback when a query string is present on `path`.
- REQ-11: The system shall invoke an optional injected `beforeIngest` hook with the
  normalized hit; if the hook returns `null`, the system shall drop the hit
  (`reason: "dropped_by_hook"`) instead of storing it.
- REQ-12: The system shall hand every accepted, fully normalized hit to an injected
  `AnalyticsSinkPort`; the only adapter implemented today (`LocalBufferSink`) appends the
  hit to a process-local in-memory array with no disk/DB durability and no data surviving a
  process restart.
- REQ-13: The system shall expose `GET /api/admin/v1/workspaces/:workspaceId/analytics/recent-hits`,
  returning the most recent hits from the in-memory buffer, newest-first, projected to
  exactly seven fields (`occurredAt`, `kind`, `path`, `referrerHost`, `deviceClass`,
  `browserFamily`, `eventName`) — never `workspaceId`, `visitorHash`, `sessionId`, or `utm`.
- REQ-14: The recent-hits route shall validate the `:workspaceId` path parameter against
  the single deployed workspace id and respond `404` when it does not match; the route
  shall perform no additional permission check beyond the blanket
  `/api/admin` session-authentication middleware (see Known Deviations item 2 — this is the
  as-built state, not a prescription).
- REQ-15: The recent-hits route shall accept an optional `?limit=` query parameter, parse
  it defensively (non-numeric or absent values are ignored), and clamp the effective limit
  into `[1, 500]`, defaulting to `50` when no valid limit is supplied.
- REQ-16: The admin UI shall render the recent-hits list as a table with explicit
  loading, error, and empty states, and shall display a fixed notice stating that the
  screen shows raw ingest data only with no aggregation/rollup layer.

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given a well-formed beacon body, when `POST /_analytics/e` is
  called, then the response is `204` with an empty body and one normalized hit is stored.
- AC-02 (REQ-01) [P1]: Given a beacon `host` that resolves to no workspace, when
  `POST /_analytics/e` is called, then the response is still `204` with an empty body and
  nothing is stored.
- AC-03 (REQ-01) [P1]: Given PII-shaped `eventProps`, when `POST /_analytics/e` is called,
  then the response is `204` (not a distinguishable error status) and nothing is stored.
- AC-04 (REQ-01) [P2]: Given a malformed/empty JSON request body, when
  `POST /_analytics/e` is called, then the handler does not throw and the response is `204`.
- AC-05 (REQ-01) [P2]: Given `eventProps` sent as a JSON array instead of an object, when
  `POST /_analytics/e` is called, then the response is `204` and the stored hit's
  `eventProps` is `null` (the array is rejected, not stored as-is).
- AC-06 (REQ-02) [P1]: Given `resolveWorkspaceForHost` returns `null`, when `ingestHit` is
  called, then `result.accepted === false`, `result.reason === "workspace_unresolved"`, and
  the sink receives no hit.
- AC-07 (REQ-03) [P1]: Given the resolved site's config has `enabled: false`, when
  `ingestHit` is called, then `result.accepted === false`,
  `result.reason === "analytics_disabled"`, and nothing is stored.
- AC-08 (REQ-04) [P1]: Given the beacon sets `dnt: true` and the config honors DNT, when
  `ingestHit` is called, then the hit is dropped with `reason: "dnt"`.
- AC-09 (REQ-04) [P1]: Given the beacon sets `gpc: true` and the config honors GPC, when
  `ingestHit` is called, then the hit is dropped with `reason: "gpc"`.
- AC-10 (REQ-05) [P1]: Given the beacon's path matches a configured excluded-path glob
  (e.g. `/admin/*`), when `ingestHit` is called, then the hit is dropped with
  `reason: "excluded_path"`.
- AC-11 (REQ-05) [P1]: Given the request IP falls inside a configured excluded CIDR range
  (e.g. `10.0.0.0/24`), when `ingestHit` is called, then the hit is dropped with
  `reason: "excluded_ip"`.
- AC-12 (REQ-06) [P1]: Given the same `(dailySalt, ip, userAgent, siteHost)` input twice,
  when `normalizeIngestContext` is called both times, then both calls produce an identical
  `visitorHash`.
- AC-13 (REQ-06) [P1]: Given the same visitor's IP/UA/host but a `dailySalt` derived for a
  different UTC calendar date, when `normalizeIngestContext`/`ingestHit` is called, then the
  resulting `visitorHash` differs (verified at both the pure-function and full `ingestHit`
  level, across two full UTC days).
- AC-14 (REQ-06) [P1]: Given any raw IP and User-Agent, when `normalizeIngestContext`,
  `ingestHit`, or the `POST /_analytics/e` route runs, then neither the raw IP string nor
  the raw User-Agent string appears anywhere in the returned/stored object or its JSON
  serialization, and neither an `ip` nor a `userAgent` key exists on that object (asserted
  at the unit, service, and HTTP-route levels).
- AC-15 (REQ-06) [P2]: Given two different `workspaceId` values and the same `utcDate` and
  `rootKeySeed`, when `deriveDailySalt` is called for each, then the two derived salts
  differ.
- AC-16 (REQ-06) [P2]: Given an empty `workspaceId` or an empty `utcDate`, when
  `deriveDailySalt` is called, then it throws `RangeError`.
- AC-17 (REQ-07) [P2]: Given a known desktop-Chrome-on-Windows User-Agent string, when
  `normalizeIngestContext` is called, then `deviceClass === "desktop"`,
  `browserFamily === "chrome"`, `osFamily === "windows"`.
- AC-18 (REQ-08) [P1]: Given a clean property bag (no PII shape), when
  `validateEventProps` is called, then it returns the same object unchanged.
- AC-19 (REQ-08) [P1]: Given `null` or `undefined` event properties, when
  `validateEventProps` is called, then it returns `null`.
- AC-20 (REQ-08) [P1]: Given a property value shaped like an email address, when
  `validateEventProps` is called, then it throws `AnalyticsPiiRejectedError`.
- AC-21 (REQ-08) [P1]: Given a property key name matching a PII-suggestive pattern (e.g.
  `email`, `phone`, `ssn`), when `validateEventProps` is called, then it throws
  `AnalyticsPiiRejectedError` regardless of the value.
- AC-22 (REQ-08) [P2]: Given a property bag with more than 20 keys, when
  `validateEventProps` is called, then it throws `AnalyticsPiiRejectedError`.
- AC-23 (REQ-08) [P2]: Given a string property value longer than 200 characters, when
  `validateEventProps` is called, then it throws `AnalyticsPiiRejectedError`.
- AC-37 (REQ-09) [P3]: Given two hits from the same visitor within the same fixed
  30-minute UTC window on the same day, when `ingestHit` runs for both, then both stored
  hits receive the same `sessionId` (deterministic function of `visitorHash` + window
  index) — noted as a coverage gap in `traceability.spec.md` §6.2: today's tests assert
  only that `sessionId` is a string, not this specific same-window-equality property.
- AC-24 (REQ-10) [P1]: Given a beacon `referrer` of `"https://google.com/search?q=hello"`,
  when `ingestHit` runs, then the stored/returned hit's `referrerHost === "google.com"`.
- AC-25 (REQ-11) [P1]: Given an injected `beforeIngest` hook that returns `null`, when
  `ingestHit` is called, then `result.accepted === false`,
  `result.reason === "dropped_by_hook"`, and nothing is stored.
- AC-26 (REQ-12) [P1]: Given a `LocalBufferSink` instance, when `accept(hit)` is called,
  then the hit is appended to the in-memory buffer and is retrievable via `all()`/`list()`.
- AC-27 (REQ-13) [P1]: Given no hits have been ingested, when
  `GET /api/admin/v1/workspaces/:workspaceId/analytics/recent-hits` is called, then the
  response is `200` with `{ "hits": [] }`.
- AC-28 (REQ-13) [P1]: Given hits have been ingested in order, when the recent-hits route
  is called, then the response body's `hits` array is ordered newest-first and each hit
  object has exactly the seven allowlisted keys — no `workspaceId`, `visitorHash`,
  `sessionId`, or `utm` field is present.
- AC-29 (REQ-14) [P1]: Given a `:workspaceId` path parameter that does not match the
  deployed workspace id, when the recent-hits route is called, then the response is `404`.
- AC-30 (REQ-15) [P1]: Given `?limit=1` with three hits buffered, when the recent-hits
  route is called, then exactly one hit (the most recent) is returned.
- AC-31 (REQ-15) [P1]: Given `?limit=100000` with 600 hits buffered, when `list()` is
  called (directly or via the route), then exactly 500 hits are returned (the hard cap),
  not 100000 and not all 600.
- AC-32 (REQ-15) [P2]: Given `?limit=not-a-number`, when the recent-hits route is called,
  then the request does not error and the response uses the sink's default limit (50,
  capped by actual buffer size) instead.
- AC-33 (REQ-15) [P2]: Given `limit: NaN`, `limit: -10`, or `limit: 0` passed directly to
  `list()`, when the sink resolves the effective limit, then it falls back to the default
  (for `NaN`) or clamps up to the floor of `1` (for `-10` and `0`) rather than throwing or
  returning zero/unbounded rows.
- AC-34 (REQ-16) [P1]: Given zero hits are loaded, when the `Analytics.tsx` screen renders,
  then it shows the explicit "No hits recorded yet" empty-state notice.
- AC-35 (REQ-16) [P1]: Given one or more hits are loaded, when the `Analytics.tsx` screen
  renders, then it shows a table row per hit with path, referrer (or `"(direct)"` when
  `referrerHost` is `null`), device/browser, kind-or-event-name, and a truncated timestamp.
- AC-36 (REQ-16) [P2]: Given the initial fetch is in flight, when the screen renders, then
  it shows a "Loading recent hits…" notice; given the fetch rejects, it shows the error
  message instead of the table.

---

## Invariants

- INV-01: A raw IP address or a raw User-Agent string must never appear as a field, or
  anywhere in the JSON serialization, of a `NormalizedHit` or any object derived from one.
- INV-02: `deriveDailySalt`'s output must never be written to any file, table, cache, or
  returned/stored object — it is recomputed on every call from `(rootKeySeed, workspaceId,
  utcDate)` and exists only for the duration of that call.
- INV-03: The `POST /_analytics/e` route must always respond `204 No Content` with an
  empty body — no accept/reject outcome, validation failure, or unexpected internal error
  may ever change the HTTP status code or body observable to the calling browser.
- INV-04: `LocalBufferSink.list()` must never return more than 500 rows in a single call,
  regardless of what limit value a caller supplies.
- INV-05: `ingestHit` must never throw for an expected/policy drop reason (unresolved
  workspace, disabled site, DNT/GPC, exclusion, PII rejection, hook-drop) — those always
  surface as `{ accepted: false, reason }`; only a genuinely unexpected failure (e.g. the
  injected sink itself throwing) may propagate as a thrown error.
- INV-06: The admin recent-hits response must never include `workspaceId`, `visitorHash`,
  `sessionId`, or `utm` fields on any returned hit object.

---

## Edge Cases

- EC-01: What happens when the beacon's JSON body is empty (`{}`)?
  Expected behavior: every field defensively coerces to its default (`host` falls back to
  the request's own hostname, `path`/`referrer` become empty/`null`, `kind` becomes
  `"pageview"`); the request still returns `204`, and typically resolves to no workspace
  (since a bare hostname is unlikely to match a configured site host), so nothing is stored.
- EC-02: What happens when `eventProps` is sent as a JSON array instead of an object?
  Expected behavior: `isJsonObject` rejects it, the parsed beacon's `eventProps` becomes
  `undefined`, and the stored hit's `eventProps` is `null` — the array is never persisted
  or validated as if it were a property bag.
- EC-03: What happens when the requested `?limit=` on the recent-hits route is a
  non-numeric string (e.g. `"abc"`)?
  Expected behavior: `parseLimitParam` returns `undefined`, and `LocalBufferSink.list()`
  substitutes its default of 50 (capped by however many hits actually exist) — the request
  never errors.
- EC-04: What happens when a caller requests more hits than the hard ceiling (e.g.
  `?limit=100000`) and more than 500 hits are buffered?
  Expected behavior: exactly 500 hits are returned (the `MAX_LIST_LIMIT` ceiling), never the
  full requested count and never the full buffer.
- EC-05: What happens when the same visitor sends hits on two different UTC calendar days?
  Expected behavior: the two hits receive different `visitorHash` values (the daily salt
  rotates), so the visitor cannot be correlated across the day boundary from stored data
  alone.
- EC-06: What happens when the process restarts while hits are buffered in
  `LocalBufferSink`?
  Expected behavior: all buffered hits are lost — there is no persistence layer backing
  this adapter; this is a documented, accepted property of the current ingest-only slice,
  not a bug.
- EC-07: What happens when an admin requests `GET .../analytics/recent-hits` for a
  workspace id other than the single deployed workspace?
  Expected behavior: `404 { "error": "workspace was not found" }` — the route does not leak
  any other workspace's buffered hits.
- EC-08: What happens when a beacon's referrer URL is present but malformed (fails `new
  URL()` parsing)?
  Expected behavior: `extractReferrerHost` catches the parse error and returns `null`
  rather than throwing or storing the malformed string.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| `node:crypto` (`hkdfSync`, `createHash`) | HKDF-SHA256 daily salt derivation and SHA-256 `visitorHash`/`sessionId` hashing | Node runtime absence — not a real risk in this deployment target | none — blocks the entire ingest path; this is a core Node built-in, not an optional dependency |
| Injected `resolveWorkspaceForHost` (currently `server/app.ts`'s single-workspace stub) | Host → workspace id resolution | Always resolves to the single deployed workspace today; a real multi-tenant deployment has no host-routing implementation yet | none — real host-based routing is an explicitly named future seam (ADR-035 §5), not built |
| Injected `AnalyticsConfigPort` (currently `server/app.ts`'s hard-coded stub) | Per-site enabled/DNT/GPC/exclusion/retention config | The stub always returns `enabled: true` with empty exclusion lists; there is no way to actually disable analytics or configure exclusions in the running app today | none — real config is meant to come from the ADR-028 settings ledger, not yet wired |
| `process.env.ANALYTICS_ROOT_KEY_SEED` | Root key material for daily salt derivation | Falls back to the literal string `"dev-only-insecure-seed"` when unset | Documented dev-only fallback; production deployment must set this env var, or (once available) source it from a corrected `KeyringPort.derive()` |
| `requireAdminSession` (`src/server/middleware/dev-auth.ts`) | Session-level gating for all `/api/admin/*` routes, including recent-hits | If session validation fails, the request is rejected before reaching the analytics route | none needed — this is the only gate the recent-hits route currently has (see Known Deviations item 2) |

---

## Open Questions

- OQ-01: Should the recent-hits admin route be retrofitted with an `authorize()` call
  against a registered `admin.analytics.view` permission now, or deferred until the
  storage/dashboard build-out lands? — Owner: Analytics section owner — Resolve by:
  2026-08-15.
- OQ-02: Is the single-workspace `resolveWorkspaceForHost` stub in `server/app.ts`
  acceptable to keep as-is until real multi-tenant host routing is built, or does it need
  an interim hardening pass? — Owner: Software Architect (next analytics-storage spec) —
  Resolve by: 2026-08-15.
- OQ-03: When the Tier-3 storage/dashboard slice is eventually specced, should this
  ingest-only spec (SPEC-014) be superseded wholesale, or extended in place with new
  REQ-*/AC-* ranges? — Owner: Spec Agent (next dispatch) — Resolve by: 2026-09-01.

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Uses Node's built-in `node:crypto` (`hkdfSync`, `createHash`) rather than a third-party crypto/HLL library; no aggregate/HLL storage exists yet to evaluate a library choice against. |
| II — Test-First | EXCEPTION | This spec is written retroactively against already-shipped code (`src/analytics/__tests__/*`, `src/server/__tests__/routes/analytics-*.test.ts` already exist and pass). Per the Constitution's Article II text, pre-pipeline draft code is normally reconciled against certified tests derived from a spec; here the tests already exist and this spec's traceability matrix reconciles *against* them, closing the gap after the fact rather than before implementation. Documented, not silently waived. |
| III — Simplicity Gate | COMPLIES | Every REQ-* in this spec traces to code that exists today; no speculative module is introduced by this spec. |
| IV — Anti-Abstraction Gate | COMPLIES | `AnalyticsSinkPort` has one real adapter (`LocalBufferSink`) plus a concrete, named second adapter on the roadmap (`ForwardingSink`, ADR-035 §3) — satisfies the rule-of-two plan. `AnalyticsRepoPort` exists as a type only, with zero adapters; it is not yet "introduced" as a used seam (see Scope: Out of scope), so it is not evaluated against Art. IV by this spec. |
| V — Integration-First Testing | COMPLIES | Every P1 AC in this spec has a corresponding integration-level test at the HTTP-route boundary (`src/server/__tests__/routes/analytics-ingest.test.ts`, `analytics-recent-hits.test.ts`), in addition to the unit-level tests in `src/analytics/__tests__/*`. |
| VI — Security-by-Default | EXCEPTION | The recent-hits admin route performs no per-action `authorize()` check (see Known Deviations item 2); it relies solely on the blanket `/api/admin` session gate. This is the Constitution's standing Article VI exception window (no named-action authz has landed for this route yet) — recorded here rather than silently assumed compliant. The public ingest beacon is intentionally unauthenticated by design (ADR-035 §5), which is a distinct, deliberate exception (public write path), not an oversight. |
| VII — Spec Integrity | COMPLIES | This spec cites `governing_adr: ADR-035` and records its own `spec_id`/`content_hash` for downstream reference. |
| VIII — Observability | EXCEPTION | No structured error codes or correlation ids are emitted on the ingest path — `ingestHit` reports policy drops via a plain `{ accepted, reason }` union (no error registry entry, no correlation id), and the beacon route swallows all thrown errors silently by design (INV-03/AC-04). This is intentional for the public fire-and-forget beacon (a distinguishable error would be an oracle, per the file's own documented reasoning) but is still a real observability gap: an operator has no signal when hits are being silently dropped or when `ingestHit` throws. Deferred to the storage/rollup build-out, which is expected to add the `analytics.rollup.completed`/`analytics.goal.triggered` outbox events ADR-035 §7 already names. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (verified against existing `ADS-project-knowledge/reports/pipeline/` folders — 001 through 009 exist; 014 is new)
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
- [x] behavior.spec.md complete (feature has non-trivial bounds/clamping/precedence rules)
- [x] traceability.spec.md complete (against already-shipped implementation and tests)
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row is reserved for Coordinator Planning Preflight before `/plan`
- [x] Since `spec_mode` is `brownfield`, brownfield evidence paths are recorded in `spec-manifest.md`

**Gate result:** PASS

---

## Agent Directives (optional)

Always:
- Treat `src/analytics/*`, the two HTTP route files, and `Analytics.tsx` as ground truth
  over ADR-035's prose wherever the two disagree on what is *currently implemented*
  (ADR-035 remains ground truth for *intended future* architecture).
- Preserve the Known Deviations section verbatim in any future revision of this spec —
  it is the record that the Tier-3 split and the `admin.analytics.view` permission are not
  yet real, and that record must survive until both are actually built.

Ask before:
- Removing or narrowing the Known Deviations section, even after the storage/dashboard
  build-out lands (fold in an update noting resolution instead of deleting the history).

Never:
- Describe the storage/rollup/dashboard/goals/export surface as implemented in this spec —
  it is not, as of this writing (2026-07-13).
