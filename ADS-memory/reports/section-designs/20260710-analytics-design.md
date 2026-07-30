# Analytics — Section Design (Admin Section Spec Sweep)

- Date: 2026-07-10
- Author: autonomous Opus 4.8 sweep agent (design-only; **no peer debate, no external audit**)
- Companion ADR: `reports/architecture/ADR-035-analytics.md` (PROPOSED)
- Typed interfaces: `src/analytics/types.ts`, `src/analytics/ports.ts` (compile-checked against the repo)
- Brief: privacy-first traffic/usage surface (Plausible/Fathom as the "who did it best" references);
  event-ingest seam, aggregate/time-series storage, dashboards, cookie-less/no-PII/no-cross-site stance.

---

## 1. Competitor-lite orientation (who did it best, and why)

Analytics is the **one sweep item with no WordPress-core analog** — WP has no built-in analytics; the
market is Jetpack Stats (phone-home), Google Analytics (cookie + cross-site + PII-heavy), and the
privacy-first cohort. So the reference set is deliberately the privacy-first tools, not the WP corpus.

| Product | Model | What they got right | What we take |
|---|---|---|---|
| **Plausible** | Cookie-less, aggregate-only, open-source, first-party script | No cookies/consent-banner; daily-rotating salted hash for uniques; tiny script; aggregate tables not per-visitor logs; goals as declared events | **The whole spine:** cookie-less rotating-salt visitor hash, aggregate-first storage, small first-party beacon, declared goals |
| **Fathom** | Cookie-less, no PII, GDPR/CCPA-safe by design | "No PII, ever" as a *structural* claim; bounce/duration from ephemeral session state, not tracking | **PII dies at the seam** as a type-level guarantee; ephemeral PII-free session table |
| **GA4** | Cookie/id-based, cross-site, ML funnels | Depth (funnels, cohorts) | **Rejected model** (cookies, cross-site, consent burden); depth features (funnels) are deferred seams only |
| **Jetpack Stats** | Phone-home to WP.com | Zero-config dashboards | Dashboard ergonomics; **rejected** phone-home (data leaves the site) |

**Verdict:** Plausible/Fathom did it best by making privacy a property of the *architecture* (cookie-
less + aggregate-only + no per-visitor rows), not a policy toggle. Tovu adopts that spine wholesale and
adds the platform-native pieces the standalone tools lack: workspace scoping (ADR-007), the outbox
scheduler for rollups (ADR-009), core-owned recoverable storage (ADR-012/027), and an AI-tool surface.

Depth/structure benchmark: **ADR-027 (media)** and **ADR-022 (content model)** — style bar only.

## 2. Tier placement rationale (§3.5)

**Decision: Tier-2 core library `analytics`, minimal + hard-disable-able. Not a Tier-3 bundled plugin.**

The §3.5 placement rule has two clauses that pull opposite ways here:

- *"anything a meaningful fraction of sites disable or replace ⇒ start Tier-3."* Analytics reads Tier-3:
  many sites run external Plausible/GA or nothing.
- *"promotion to core is easy; demotion is a breaking change" ⇒ place in core when the seam is hard to
  move later.* This tie-breaker wins, because **two v1 constraints make a Tier-3 plugin impossible now**:
  1. **Own tables required, plugins can't own tables in v1.** ADR-023 ships *seams only* (§12) — the
     `dataModule` key is rejected until the reconciliation engine exists. Core libs own sidecar tables
     today (ADR-027 `media`). Time-series counters can't live in ADR-022's ext-bag (that's editorial
     content with a revision per write; a pageview is neither).
  2. **The ingest beacon is a trust-boundary primitive.** An unauthenticated, high-volume, cross-origin
     public write path with rate-limiting + workspace resolution + PII rejection + a rotating salt is not
     plugin-safe code — it's the ingest analogue of ADR-027's core-owned `MediaIngressPolicy`.

So the *foundation* goes in core **now**, and the Tier-3 spirit is honored two ways: a **per-site hard
disable switch**, and the **`ForwardingSink`** ("bring your own external analytics") so a site can keep
Tovu's cookie-less beacon but ship hits to its own collector — replaceability without a repaint. The
residual tension (should ingest/rollup re-home to a plugin once ADR-023's engine lands?) is logged as
ADR-035 OQ-1 for the audit, not silently resolved.

This is exactly the ADR-027 shape: a core lib + core-owned sidecars + a Tier-5 admin surface + AI tools.

## 3. The design in prose

**Flow.** A tiny first-party, cookie-less script fires `navigator.sendBeacon` on pageview/goal to
`POST /_analytics/e` on the *site* origin. The core ingest handler: resolves host→workspace; checks
enabled/DNT/GPC/exclusions/rate-limit; uses the request IP transiently for country/region then discards
it, and the UA transiently for device/browser/os class then discards it; computes a **daily-rotating,
per-site, salted, non-reversible `visitorHash`** (never storing its inputs); assembles a **PII-free
`NormalizedHit`**; runs the async `analytics.beforeIngest` hook (may drop/annotate); and hands it to
`AnalyticsSinkPort.accept()` — fire-and-forget, the beacon response never waits on aggregation.

**Storage.** The local sink appends a PII-free, hard-TTL'd row to `analytics_events` and updates
`analytics_session`. A **rollup job on the ADR-009 scheduler/outbox spine** folds the raw buffer into the
durable **`analytics_aggregate`** fact table: counters per `(workspace, granularity, bucket, dimension,
value)` plus a **mergeable HLL `visitors_sketch`** so distinct-visitor counts compose across any date
range **without per-visitor rows**. Dimension-value cardinality is capped **top-N + `(other)`**. A prune
job deletes expired raw/session rows. Per-hit events never touch the durable outbox; only the low-volume
`analytics.rollup.completed` / `analytics.goal.triggered` events do.

**Reads.** Dashboards and AI tools call ordinary core query code over `AnalyticsRepoPort` (in-memory +
SQLite, ADR-015). Time-series (`queryTimeSeries`), breakdowns (`queryBreakdown`), and a realtime
last-N-minutes view off the raw buffer. `authorize()`-gated with flat `analytics.*` strings; the public
ingest endpoint is intentionally permission-less. Same handlers back the admin screen and the AI tools —
no back door (§3.5 dogfood rule).

**Privacy is structural.** PII dies at the `AnalyticsSinkPort` boundary — the `IngestContext` (ip/ua)
is `readonly` and never reaches a row; uniqueness is a rotating salted hash + HLL sketch; the salt is
per-site + per-day, so nothing is cross-site or cross-day linkable; DNT/GPC honored by default.

## 4. Alternatives considered

- **Tier-3 bundled plugin (the §3.5 default).** *Rejected for v1:* ADR-023 defers the plugin data-tier
  engine, so a plugin cannot own the time-series tables, and the privileged ingest path can't be plugin
  code. Kept as the *future* target via OQ-1 + the named re-home seam.
- **Store aggregates in ADR-022 `entries` ext-bag.** *Rejected:* editorial model, revision-per-write,
  wrong access surface (`content.write` reaches agents — the same argument that killed settings-as-entries
  in ADR-028). Counters aren't content.
- **Per-hit domain events on the durable outbox.** *Rejected:* pageview volume would swamp the SQLite
  outbox. Ingest is a cheap append; only bounded rollup/goal events ride the outbox (ADR-009 lane
  discipline).
- **Server-side-only counting at the routing layer (no beacon).** *Deferred, not chosen:* misses
  client-only signals and can't honor client DNT/GPC as cleanly; kept as a named fallback seam for
  JS-less/headless clients.
- **`StatsQueryPort` for reads.** *Rejected:* one query evaluator ⇒ a query port is the speculative
  second adapter ADR-006 forbids (exactly ADR-021's "no `PolicyPort`"). Reads are ordinary core code.
- **Cookie/id-based uniqueness (GA model) or exact `COUNT(DISTINCT visitor)`.** *Rejected:* violates
  cookie-less/no-PII; retained per-visitor rows are a re-identification surface. HLL sketches give
  mergeable uniques with nothing to re-identify.
- **Unbounded/free-form dimensions.** *Rejected:* cardinality explosion = storage DoS + re-identification
  vector. Closed dimension enum + top-N/`(other)` cap.

## 5. Implementation Proposal

### 5.1 Modules to add (under `src/analytics/`, mirroring `src/features/*`)

```
src/analytics/
  types.ts            # DONE — core types + row/schema/query/event types
  ports.ts            # DONE — AnalyticsSinkPort, AnalyticsRepoPort, deps, errors
  index.ts            # barrel: public surface (ADR-009 typed-call boundary)
  ingest.ts           # normalize beacon → NormalizedHit; PII-strip; visitorHash; hook; sink.accept
  visitor-hash.ts     # daily-rotating salted per-site hash (salt store + rotation)
  rollup.ts           # raw buffer → AggregateDelta[]; watermark; emits rollup.completed
  query.ts            # queryTimeSeries / queryBreakdown / realtime (ordinary core code)
  goals.ts            # goals registry read + match (bounded expression, ADR-022 §2)
  hll.ts              # HyperLogLog sketch encode/merge/estimate (mergeable uniques)
  sink.local.ts       # LocalBufferSink adapter (built now)
  sink.forwarding.ts  # ForwardingSink adapter over HttpClientPort (DEFERRED seam)
  repo.memory.ts      # in-memory AnalyticsRepoPort (rule-of-two + tests)
  repo.sqlite.ts      # Drizzle/SQLite AnalyticsRepoPort (ADR-015)
  INFO.md
  __specs__/analytics.spec.md
  __tests__/…
```
Server wiring (new, small): `src/server/routes/analytics/collect.ts` (public beacon, unauthenticated,
rate-limited) + `src/server/routes/admin/analytics/*` (gated read/manage). Client beacon asset: a tiny
core-owned first-party script served from the site origin.

### 5.2 Schema / DDL sketch (core-executed; per-site `content.db`)

```sql
-- Raw hit buffer — PII-FREE, hard-TTL'd. Single-writer (analytics/repo). Narrows ADR-022 INV-3.
CREATE TABLE analytics_events (
  id                 TEXT PRIMARY KEY,               -- ULID
  workspace_id       TEXT NOT NULL,
  occurred_at        TEXT NOT NULL,                  -- ISO
  kind               TEXT NOT NULL,                  -- 'pageview' | 'event'
  path               TEXT NOT NULL,
  referrer_host      TEXT,
  utm_source         TEXT, utm_medium TEXT, utm_campaign TEXT,
  country            TEXT, region TEXT,              -- derived; IP discarded
  device_class       TEXT, browser_family TEXT, os_family TEXT,
  visitor_hash       TEXT NOT NULL,                  -- daily-rotating, per-site, salted
  session_id         TEXT NOT NULL,
  event_name         TEXT, event_props TEXT,         -- JSON, bounded/validated, non-PII
  created_by_plugin_id TEXT,                         -- attribution (ADR-027 §2)
  expires_at         TEXT NOT NULL                   -- prune boundary
);
CREATE INDEX ix_evt_ws_time    ON analytics_events(workspace_id, occurred_at);
CREATE INDEX ix_evt_ws_expires ON analytics_events(workspace_id, expires_at);

-- Durable, PRIMARY time-series fact table. Composite workspace-scoped PK (ADR-007).
CREATE TABLE analytics_aggregate (
  workspace_id     TEXT NOT NULL,
  granularity      TEXT NOT NULL,                    -- 'hour' | 'day' | 'month'
  bucket_start     TEXT NOT NULL,
  dimension        TEXT NOT NULL,                    -- closed enum; 'total' | 'path' | ...
  dimension_value  TEXT NOT NULL,                    -- '(other)' overflow bucket
  pageviews        INTEGER NOT NULL DEFAULT 0,
  events           INTEGER NOT NULL DEFAULT 0,
  visitors_sketch  BLOB    NOT NULL,                 -- mergeable HLL
  bounces          INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  updated_at       TEXT NOT NULL,
  PRIMARY KEY (workspace_id, granularity, bucket_start, dimension, dimension_value)
);

-- Ephemeral PII-free session state (bounce/duration/entry/exit). Bounded retention.
CREATE TABLE analytics_session (
  workspace_id   TEXT NOT NULL,
  session_id     TEXT NOT NULL,
  started_at     TEXT NOT NULL, last_seen_at TEXT NOT NULL,
  entry_path     TEXT NOT NULL, exit_path TEXT NOT NULL,
  pageview_count INTEGER NOT NULL DEFAULT 1,
  is_bounce      INTEGER NOT NULL DEFAULT 1,
  expires_at     TEXT NOT NULL,
  PRIMARY KEY (workspace_id, session_id)
);

-- Declarative goals/custom-events registry (schemas-as-data; ADR-022/028 pattern).
CREATE TABLE analytics_goal_def (
  id            TEXT NOT NULL,
  workspace_id  TEXT NOT NULL,
  name          TEXT NOT NULL,                       -- stable key; rename = alias
  display_name  TEXT NOT NULL,
  match_kind    TEXT NOT NULL,                       -- 'pageview_path' | 'custom_event'
  match_value   TEXT NOT NULL,                       -- bounded/total expr (ADR-022 §2)
  created_at    TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, name)
);
```
Per-site config (enabled / DNT / GPC / retention_days / excluded_paths / excluded_ip_ranges / sink)
lives in the **ADR-028 settings ledger** under `analytics.*` keys — not a new table. Visitor-hash salt
rotation state is a core secret (not in these tables; ADR-028 secret-gate applies).

### 5.3 Permission strings (ADR-021 flat catalog)

`analytics.read`, `analytics.read.realtime`, `analytics.manage`, `analytics.goals.manage`,
`analytics.export`. Ingest endpoint = **no permission** (public visitor write). AI tools reuse the same
gated read handlers.

### 5.4 Hooks + events (ADR-009)

- Hook (lane 3): `analytics.beforeIngest(hit) → hit | null` — async + serializable-only (ADR-024 §3
  ABI); receives a normalized (PII-free) hit; may drop or annotate.
- Events emitted (lane 2, outbox): `analytics.rollup.completed`, `analytics.goal.triggered`.
- Jobs on the ADR-009 scheduler/outbox spine: `analytics.rollup` (resumable, watermarked),
  `analytics.prune` (TTL enforcement).

### 5.5 Phased plan

- **Phase A — Storage + rollup core (no UI).** `types`/`ports` (done) → `hll` → `repo.memory` +
  `repo.sqlite` + DDL → `rollup` + `AggregateDelta` path → in-memory query. Canary: import-graph lint
  that only `analytics/repo` writes the four tables. *Exit:* aggregates queryable in tests.
- **Phase B — Ingest seam.** `visitor-hash` (salt store + daily rotation) → `ingest` (normalize +
  PII-strip + hook) → `sink.local` → public `/_analytics/e` route (rate-limited, host→workspace) →
  first-party beacon script. *Exit:* real beacon → aggregate, PII-free, verified.
- **Phase C — Surfaces.** Admin dashboards (time-series, top pages/referrers, UTM, geo, devices, bounce,
  realtime) + AI tools + export, all `authorize()`-gated over shared handlers; goals CRUD. *Exit:* Tier-5
  screen usable; AI `analytics.query` works.
- **Phase D — Replaceability + hardening.** `ForwardingSink` adapter; bot filtering (OQ-5); retention
  wiring to the Storage/Backups primitive (OQ-4); privacy review of hash inputs (OQ-2) + HLL tuning
  (OQ-3).

### 5.6 v1 scope cut + named deferred seams

**IN:** everything in Phases A–C (see ADR-035 §8). **DEFERRED (each a typed seam already present):**
`ForwardingSink` external collector · server-side/JS-less counting fallback · funnels/multi-step goals ·
per-visitor journeys (**never** — privacy) · warehouse `StatsQueryPort` reader · re-home to ADR-023
plugin data-module · long-horizon retention/compaction (Storage/Backups) · AEO/answer-impression surface
(`todos.md` §22).

## 6. Status / what this design owes

Solo, design-only — **no peer debate, no external audit** (unlike ADR-027/022). Typed interfaces compile
clean in-tree (`npm run typecheck` green). Before ACCEPTED, ADR-035 owes a debate + external audit; the
six Open questions (placement re-home, visitor-hash inputs, HLL params, retention ownership, bot
filtering, beacon origin) are the intended audit entry points.
