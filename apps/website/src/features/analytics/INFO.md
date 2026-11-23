# analytics (ingest half) Overview

Owns the ingest seam for Tovu's privacy-first, cookie-less analytics library (ADR-035): the
beacon-facing normalization path, the PII-death-at-the-sink-boundary guarantee, and daily salt
custody. **Storage, rollup, dashboards, goals, and export are a separate, later concern** (ADR-035
Round-2 fold) and are NOT implemented in this module yet.

The former `ingest.ts` and `repo.memory.ts` forks were deleted in favor of `@jini-ai/analytics`
(see `development/DELETED-CODE.md`). The port converters and privacy preset moved to
`@jini-ai/analytics/site/jini-adapters`; Tovu keeps its HKDF wire context (`salt-context.ts`, a
hash input that must stay byte-identical) and its forward-failure console line
(`warn.ts#reportAnalyticsForwardFailure`), both injected as REQUIRED `AnalyticsIngestRouteDeps` fields
(`saltContext`, `reportForwardFailure`) at `server/runtime/composition/http-app/visitor-submit.ts`.
The Jini package owns normalization, policy enforcement and the local buffer.

## Responsibilities

- Derive the daily-rotating, per-workspace analytics salt on demand, never persisting it (`@jini-ai/analytics/site/salt`, with
  the host's `salt-context.ts#analyticsSaltContext` injected).
- Normalize raw per-request signals (IP, User-Agent) into a salted `visitorHash` plus coarse
  device/browser/os classes, and discard the raw inputs at that boundary — they never reach any
  returned object (`@jini-ai/analytics#normalizeIngestContext`).
- Validate bounded custom event properties and reject PII-shaped values (`@jini-ai/analytics#validateEventProps`,
  `AnalyticsPiiRejectedError`).
- Compose workspace resolution, DNT/GPC/exclusion policy checks, PII rejection, and sink hand-off
  into a single ingest entry point (`@jini-ai/analytics#ingestHit`).
- Provide a minimal in-memory `AnalyticsSinkPort` adapter for tests/dev (`@jini-ai/analytics/site/jini-adapters#createLocalAnalyticsSink`, backed by `@jini-ai/analytics#LocalBufferSink`)
  and a durable SQLite adapter for real composition (`platform/db/sqlite/analytics-sink.sqlite.ts#SqliteBufferSink`,
  ADR-046 Phase 1, final capability slice — the raw hit buffer now survives a restart).

- Route hits to the built-in sink plus, optionally, ONE vendor forwarder per site
  (`core.analytics.sink`, default `"local"` = built-in only). Vendors are Agent Plugin
  contributions (`tovu-analytics-forwarders.json`, `features/agent-plugins/analytics-provider-registry.ts`)
  on the shared `@jini-ai/core/provider-registry`; `@jini-ai/analytics/site/forwarding` picks the vendor per request
  (its warnings go through the host's `warn.ts#warnAnalytics`, which keeps the `[analytics]` console prefix),
  only when the visitor's cookie consent allows `analytics` (the consent engine's own
  `readRequestConsentChoices`, not a second gate), and binds its credential. Vendors receive a
  minimised hit (no region, no session id) after the built-in sink accepts, detached from the
  beacon response; their failures are logged, never propagated.
- Chain plugin `beforeIngest` hooks (`tovu-analytics-hooks.json`) into ingest; a throwing hook
  is skipped and logged, `null` drops the hit for every sink.

## Rules

- Only the fully normalized `NormalizedHit` may cross `AnalyticsSinkPort` — nothing upstream of
  that boundary (raw IP, raw User-Agent) may ever be attached to a persisted or returned object.
- The daily salt is derived, never stored. No file, table, or cache in this module holds the salt
  itself — every call re-derives it from `analyticsSeed` + `workspaceId` + `utcDate`.
- `ingestHit` does not throw for expected/policy outcomes (unresolved workspace, disabled site,
  DNT/GPC, exclusions, PII rejection) — it reports them via `{ accepted: false, reason }`, because
  the beacon this feeds is a public, unauthenticated, fire-and-forget endpoint that must not turn
  policy outcomes into request failures.
- Real host→workspace routing, rate-limiting, and geo-IP lookup are intentionally out of scope for
  this slice; `resolveWorkspaceForHost` is accepted as an injected function, and `country`/`region`
  are emitted as `null` pending a `GeoIpPort` that does not exist yet.

## Type model and the removed barrel

`contracts.ts` (`VisitorAnalyticsDeps`, `BrowserAnalyticsSource`) moved to
`@jini-ai/analytics/site/contracts`; the `index.ts` barrel that re-exported it beside
`jini-adapters.ts` was deleted, so callers import `@jini-ai/analytics/site/jini-adapters` and
the Jini specifier directly. The barrel's type-model notes are kept here:

The type model behind these ports lives in `@jini-ai/analytics`; this host persists it as follows.

Purpose: declares the privacy-first, cookie-less traffic/usage model — the shapes that flow
from the ingest beacon through server-side normalization into aggregate/time-series
storage, and back out through dashboards and AI tools. Types only — no feature logic.

How it relates to the project:

- Reuses core primitives from `src/contracts/core/ports.ts` (UUID/ISODateTime/JsonObject) — this
  file introduces no new primitive kinds, staying inside ADR-007's workspace-scoping and
  the frozen serializable ABI (ADR-024 §3 / ADR-005).
- Row types below are **core-owned single-writer sidecars** in the per-site `content.db`
  (ADR-012), mirroring the media sidecar precedent (ADR-027 §2): high-volume operational
  counters that deliberately narrow ADR-022's revision-per-write discipline (INV-3) and
  carry their own attribution, rather than generating an entry revision per hit.

Design invariant — NO PII AT REST:
Nothing persisted here is personal data. IP and User-Agent are consumed transiently at
ingest (IP → country, UA → device class) and then discarded; the only visitor identifier
is `visitorHash`, a daily-rotating, per-site, salted, non-reversible digest (cookie-less,
not cross-site, not cross-day). This is the Plausible/Fathom mechanism.

## Known open items (carried from ADR-035)

- **`KeyringPort` mismatch (Round-2 audit blocker).** `src/webhooks/ports.ts`'s `KeyringPort`
  is signing-specific (`deriveSigningSecret`) and cannot serve generic salt derivation yet.
  `@jini-ai/analytics/site/salt#deriveDailySalt` therefore takes a raw `analyticsSeed` string instead of calling
  `KeyringPort` — see the `TODO` in that file. Rewire once a corrected, generic
  `KeyringPort.derive()` ships.
- **Session-id v1 simplification.** The Jini engine buckets by a fixed 30-minute
  same-day window; true cross-window session stitching belongs to the later rollup/session-table
  logic, not this ingest-only slice.
- **UTM extraction fallback.** `IngestBeacon.path` is documented as already query-stripped upstream
  (UTMs "extracted server-side"); Jini ingestion is a defensive fallback in case a query
  string is still present, not the primary extraction point.

## Future direction

The next slices (per ADR-035 Round-2 fold) are the Tier-3 bundled-plugin storage/rollup/dashboard
surface: `analytics_events` / `analytics_aggregate` / `analytics_session` / `analytics_goal_def`
tables, the rollup job, the query surface, and the admin/AI-tool handlers. This module's
`AnalyticsSinkPort` is the frozen seam that surface will be built behind.
