# analytics (ingest half) Overview

Owns the ingest seam for Tovu's privacy-first, cookie-less analytics library (ADR-035): the
beacon-facing normalization path, the PII-death-at-the-sink-boundary guarantee, and daily salt
custody. **Storage, rollup, dashboards, goals, and export are a separate, later concern** (ADR-035
Round-2 fold) and are NOT implemented in this module yet.

## Responsibilities

- Derive the daily-rotating, per-workspace analytics salt on demand, never persisting it (`salt.ts`).
- Normalize raw per-request signals (IP, User-Agent) into a salted `visitorHash` plus coarse
  device/browser/os classes, and discard the raw inputs at that boundary — they never reach any
  returned object (`ingest.ts#normalizeIngestContext`).
- Validate bounded custom event properties and reject PII-shaped values (`ingest.ts#validateEventProps`,
  `AnalyticsPiiRejectedError`).
- Compose workspace resolution, DNT/GPC/exclusion policy checks, PII rejection, and sink hand-off
  into a single ingest entry point (`ingest.ts#ingestHit`).
- Provide a minimal in-memory `AnalyticsSinkPort` adapter for tests/dev (`repo.memory.ts#LocalBufferSink`)
  and a durable SQLite adapter for real composition (`infra/sqlite/analytics-sink.sqlite.ts#SqliteBufferSink`,
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

- **`KeyringPort` mismatch (Round-2 audit blocker).** `src/integrations/ports.ts`'s `KeyringPort`
  is signing-specific (`deriveSigningSecret`) and cannot serve generic salt derivation yet.
  `salt.ts#deriveDailySalt` therefore takes a raw `rootKeySeed` string instead of calling
  `KeyringPort` — see the `TODO` in that file. Rewire once a corrected, generic
  `KeyringPort.derive()` ships.
- **Session-id v1 simplification.** `ingest.ts#deriveSessionId` buckets by a fixed 30-minute
  same-day window; true cross-window session stitching belongs to the later rollup/session-table
  logic, not this ingest-only slice.
- **UTM extraction fallback.** `IngestBeacon.path` is documented as already query-stripped upstream
  (UTMs "extracted server-side"); `ingest.ts#extractUtm` is a defensive fallback in case a query
  string is still present, not the primary extraction point.

## Future direction

The next slices (per ADR-035 Round-2 fold) are the Tier-3 bundled-plugin storage/rollup/dashboard
surface: `analytics_events` / `analytics_aggregate` / `analytics_session` / `analytics_goal_def`
tables, the rollup job, the query surface, and the admin/AI-tool handlers. This module's
`AnalyticsSinkPort` is the frozen seam that surface will be built behind.
