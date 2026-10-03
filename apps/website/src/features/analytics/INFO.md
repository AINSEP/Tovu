# analytics (ingest half) Overview

Owns the ingest seam for Tovu's privacy-first, cookie-less analytics library (ADR-035): the
beacon-facing normalization path, the PII-death-at-the-sink-boundary guarantee, and daily salt
custody. **Storage, rollup, dashboards, goals, and export are a separate, later concern** (ADR-035
Round-2 fold) and are NOT implemented in this module yet.

The former `ingest.ts` and `repo.memory.ts` forks were deleted in favor of `@jini-ai/analytics`
(see `development/DELETED-CODE.md`). Tovu owns its privacy/HKDF presets and port converters in
`jini-adapters.ts`; the Jini package owns normalization, policy enforcement and the local buffer.

## Responsibilities

- Derive the daily-rotating, per-workspace analytics salt on demand, never persisting it (`salt.ts`).
- Normalize raw per-request signals (IP, User-Agent) into a salted `visitorHash` plus coarse
  device/browser/os classes, and discard the raw inputs at that boundary — they never reach any
  returned object (`@jini-ai/analytics#normalizeIngestContext`).
- Validate bounded custom event properties and reject PII-shaped values (`@jini-ai/analytics#validateEventProps`,
  `AnalyticsPiiRejectedError`).
- Compose workspace resolution, DNT/GPC/exclusion policy checks, PII rejection, and sink hand-off
  into a single ingest entry point (`@jini-ai/analytics#ingestHit`).
- Provide a minimal in-memory `AnalyticsSinkPort` adapter for tests/dev (`jini-adapters.ts#createLocalAnalyticsSink`, backed by `@jini-ai/analytics#LocalBufferSink`)
  and a durable SQLite adapter for real composition (`platform/db/sqlite/analytics-sink.sqlite.ts#SqliteBufferSink`,
  ADR-046 Phase 1, final capability slice — the raw hit buffer now survives a restart).

## Rules

- Only the fully normalized `NormalizedHit` may cross `AnalyticsSinkPort` — nothing upstream of
  that boundary (raw IP, raw User-Agent) may ever be attached to a persisted or returned object.
- The daily salt is derived, never stored. No file, table, or cache in this module holds the salt
  itself — every call re-derives it from `rootKeySeed` + `workspaceId` + `utcDate`.
- `ingestHit` does not throw for expected/policy outcomes (unresolved workspace, disabled site,
  DNT/GPC, exclusions, PII rejection) — it reports them via `{ accepted: false, reason }`, because
  the beacon this feeds is a public, unauthenticated, fire-and-forget endpoint that must not turn
  policy outcomes into request failures.
- Real host→workspace routing, rate-limiting, and geo-IP lookup are intentionally out of scope for
  this slice; `resolveWorkspaceForHost` is accepted as an injected function, and `country`/`region`
  are emitted as `null` pending a `GeoIpPort` that does not exist yet.

## Known open items (carried from ADR-035)

- **`KeyringPort` mismatch (Round-2 audit blocker).** `src/webhooks/ports.ts`'s `KeyringPort`
  is signing-specific (`deriveSigningSecret`) and cannot serve generic salt derivation yet.
  `salt.ts#deriveDailySalt` therefore takes a raw `rootKeySeed` string instead of calling
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
