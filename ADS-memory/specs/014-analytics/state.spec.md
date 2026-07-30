# State Contract Spec: analytics

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-014`
- Feature: `FEAT-014-analytics`
- Version: `1.0.0`
- Content Hash: `sha256:PENDING`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
Documents the state that actually exists in the running system today: the server-side
in-memory hit buffer (`LocalBufferSink`) and the admin UI's local fetch state
(`Analytics.tsx`). **There is no durable/DB-backed state** — no `analytics_events` table,
no `analytics_aggregate` table, no session table, no goal-definition table. This file
documents the real state shape, not ADR-035's target schema.

## 1) Server State Shape — `LocalBufferSink` (`src/analytics/repo.memory.ts`)

| Field | Type | Nullable | Initial Value | Description |
|---|---|---|---|---|
| `hits` (private) | `NormalizedHit[]` | no | `[]` | Process-local, unbounded-growth in-memory array of every accepted hit since process start. No TTL, no eviction, no persistence. |

This is the entirety of durable-feeling state in the running server for analytics. It is
**not durable**: a process restart resets it to `[]`. There is no size cap on the
underlying array itself (unbounded growth risk over a long-running process) — only the
**read** accessor (`list()`) is bounded (see `behavior.spec.md` §4). This asymmetry (write
side unbounded, read side capped) is a disclosed, accepted property of the ingest-only
slice per the file's own header comment, not an oversight this spec silently corrects.

## 2) Entity Contracts

```yaml
NormalizedHit:
  workspaceId: string (uuid)
  occurredAt: string (date-time)
  kind: enum[pageview, event]
  path: string
  referrerHost: string|null
  utm:
    source: string|null
    medium: string|null
    campaign: string|null
    term: string|null
    content: string|null
  country: string|null           # always null today — no GeoIpPort exists
  region: string|null            # always null today — no GeoIpPort exists
  deviceClass: enum[desktop, mobile, tablet, bot, unknown]
  browserFamily: string|null
  osFamily: string|null
  visitorHash: string            # 64-char sha256 hex digest; never the raw IP/UA
  sessionId: string              # 64-char sha256 hex digest
  eventName: string|null
  eventProps: object|null        # bounded, PII-checked; null when absent/rejected

AdminAnalyticsHit:               # the narrow admin-facing projection (see api.spec.md §5)
  occurredAt: string (date-time)
  kind: enum[pageview, event]
  path: string
  referrerHost: string|null
  deviceClass: enum[desktop, mobile, tablet, bot, unknown]
  browserFamily: string|null
  eventName: string|null
```

## 3) Action Catalog — Server Buffer

| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `accept(hit)` | one `NormalizedHit` | none | appends `hit` to the end of `hits` | none — the method cannot fail (no I/O) |
| `acceptBatch(hits)` | `NormalizedHit[]` | none | appends all given hits, preserving order | none — the method cannot fail (no I/O) |
| `all()` | none | none | no state change; returns a defensive copy of the full buffer | none |
| `list({ limit? })` | optional `limit` | none | no state change; returns the newest `clampListLimit(limit)` hits, newest-first, as a defensive copy | none — invalid `limit` input is clamped, never thrown (see behavior.spec.md §4) |

There is no `delete`/`prune`/`rollup` action implemented — `AnalyticsRepoPort.pruneExpired`
and `.rollup` are declared types with zero implementing code (see `feature.spec.md` Scope:
Out of scope).

## 4) Client State Shape — `Analytics.tsx` (admin UI)

| Field | Type | Nullable | Initial Value | Description |
|---|---|---|---|---|
| `hits` | `AdminAnalyticsHit[] \| null` | yes | `null` | `null` means "not yet loaded"; distinguishes first-load loading state from a genuinely empty buffer (`[]`). |
| `error` | `string \| null` | yes | `null` | Set from a caught fetch rejection's `message`, or a fixed fallback string. |

This is plain `useState`, not a reducer/store — there is no action catalog beyond the one
`useEffect`-driven fetch on mount (`api.listRecentAnalyticsHits()`). There is no
create/update/delete on the client side; this screen is read-only.

## 5) Selector Contracts

| Selector (inline render logic) | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| loading check | `hits === null` | renders `"Loading recent hits…"` notice | — |
| error check | `error !== null` | renders the error notice (takes precedence over loading/table) | — |
| empty check | `hits !== null && hits.length === 0` | renders `"No hits recorded yet..."` notice | distinct from the `null`/loading case |
| table render | `hits !== null && hits.length > 0` | renders one table row per hit | `referrerHost === null` renders literal text `"(direct)"`; `eventName` present renders `"event: <name>"` in place of `kind` |

## 6) State Invariants
- [x] `hits === null` and `error !== null` cannot both meaningfully drive the render at
      once — the component's early-return order checks `error` first, then the `!hits`
      loading check, so an error always wins visually over a stale `null` hits state.
- [x] The server buffer (`LocalBufferSink.hits`) only ever grows via `accept`/`acceptBatch`
      — there is no method that removes an entry, so `hits.length` is monotonically
      non-decreasing for the life of the process.
- [x] `list()`'s returned array length never exceeds `MAX_LIST_LIMIT` (500), regardless of
      the underlying buffer's actual size or the caller's requested limit.
- [x] `all()` and `list()` both return a **new** array on every call — mutating the
      returned array (e.g. `.pop()`) never affects the sink's internal `hits` array.

## 7) Acceptance Checklist
- [x] All actions have explicit before/after behavior.
- [x] Selectors (render-branch conditions) are deterministic and side-effect free.
- [x] Entity fields and enums align with `api.spec.md` and `ui.spec.md`.
- [x] The absence of any durable/DB-backed state is stated explicitly, not implied by
      omission — this file documents zero tables because zero tables exist.
