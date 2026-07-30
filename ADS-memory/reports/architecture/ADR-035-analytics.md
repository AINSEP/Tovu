# ADR-035: Analytics — Privacy-First, Cookie-Less Traffic/Usage Surface (Core-Owned Ingest Seam + Aggregate Time-Series Storage)

- Status: ACCEPTED 2026-07-10 (autonomous Opus 4.8 sweep agent, design-only draft → cleared `/audit-work` gate: 3-round audit under `TM-admin-sweep-001`, Codex + Gemini/agy + Fable internal verifier; round 1 FAIL → Round-3 fold → round 2 FAIL (1 converged blocker) → Round-4 fold → round 3 unanimous PASS, scores 9.1-10.0, zero blockers)
- Author: autonomous Opus 4.8 sweep agent
- Extends: **ADR-027** (media precedent — core-owned single-writer sidecars that deliberately narrow ADR-022 INV-3, cookie-less origin isolation for a public byte/beacon path), **ADR-009** (the outbox/scheduler spine carries rollup + retention jobs, not per-hit events)
- Relates: ADR-007 (workspace-scoped rows + composite keys), ADR-022 (revision chokepoint that these operational tables narrow; goals registry reuses content-types-as-data + the total/bounded expression-language amendment), ADR-023 (v1 = core-executed DDL / seams-only; plugin-ownable data tier deferred), ADR-024 (Tier model; frozen async serializable ABI for hooks), ADR-025 (cookie-less origin lineage the beacon inherits), ADR-021 (`authorize()` + flat `analytics.*` strings; the read/manage path is gated, the public ingest path is not), ADR-015 (Drizzle repo behind ports — in-memory + SQLite rule-of-two), ADR-006 (`AnalyticsSinkPort` rule-of-two; no `StatsQueryPort`), ADR-012 (per-site `content.db` storage + retention job), ADR-028 (per-site config lives in the settings ledger)
- Sources: brief (Admin Section Spec Sweep — Analytics, `todos.md` §Blocker); §3.5 placement rule (`tovu-v2-design.md`); depth benchmark ADR-027 / ADR-022. Design report: `reports/section-designs/20260710-analytics-design.md`. Competitor references: Plausible, Fathom (privacy-first, cookie-less, aggregate-only).

## Context

Tovu needs a built-in analytics surface: which pages get traffic, from where, on what
devices, how many distinct visitors, bounce/duration, and custom goals — the WordPress-Jetpack /
Google-Analytics job, done the way Plausible and Fathom proved is *right*: **cookie-less, no PII,
no cross-site tracking, aggregate-first**. Analytics is the one Admin-Section-Sweep item with **no
WordPress-core analog** (§3.5 has no `analytics` row) — it is a net-new subsystem, so both its
placement and its internal architecture are open.

Two hard constraints shape the design and are the reason this is an ADR and not a plugin spike:

1. **It must own aggregate/time-series tables now.** Traffic data is high-volume counters bucketed
   by time and dimension — it does not fit ADR-022's `entries` ext-bag (that is editorial content
   with a revision per write; a pageview is neither). Only **core** may execute DDL today: ADR-023
   ships **seams only** in v1 (the `dataModule` manifest key is *rejected* until the reconciliation
   engine exists, §12), so a Tier-3 bundled plugin literally cannot own tables yet. Core libraries
   can — ADR-027's `media` owns `asset_blobs`/`asset_renditions` sidecars today by exactly this route.
2. **The ingest beacon is a privileged, unauthenticated, high-volume, cross-origin write path.**
   Rate-limiting, workspace resolution, PII rejection, and the cookie-less visitor-hash salt are a
   **trust-boundary primitive**, not plugin-safe code. This mirrors ADR-027's core-owned
   `MediaIngressPolicy` (one gate for every byte entry point) and ADR-025's cookie-less origin rule.

Both constraints point the *foundation* into core **now**. This ADR records that decision and the
privacy-first architecture, staying inside the accepted ADRs; where a real tension exists (the §3.5
"disable/replace ⇒ Tier-3" heuristic), it is flagged Open, not resolved by reopening an accepted ADR.

## Decision

### 1. Placement — Tier-2 core library `analytics` (minimal + hard-disable-able), NOT a Tier-3 bundled plugin

`analytics` is a **Tier-2 core library** (§3.5), on the ADR-027 `media` template: a core lib that
owns operational sidecar tables, exposes a Tier-5 admin surface and an AI-tool surface, and declares
its seams as ports. It is deliberately **minimal and optional** — a per-site `enabled=false` hard
switch turns the whole subsystem (beacon, storage, rollup) off.

**Why core and not a bundled plugin, despite the §3.5 placement rule.** The placement rule says
"anything a meaningful fraction of sites disable or replace" starts as Tier-3, and analytics *reads*
Tier-3 by that heuristic (many sites use external Plausible/GA or nothing). But the same rule's tie-
breaker is decisive here: **"promotion to core is easy; demotion is a breaking change"** — you place
a subsystem in core when its *seam* is hard to move later. Both hard constraints above are v1-blocking
for a plugin: ADR-023's plugin data-tier engine is deferred, and the privileged ingest path can't be
plugin code. Putting the foundation in core now, with a clean disable switch and the forwarding-sink
replaceability (§3), **honors the Tier-3 spirit** (you can turn Tovu analytics off and point a beacon
at your own collector) **without paying the demotion tax** if the storage/ingest seam ever had to move.
The residual placement tension is logged Open (OQ-1).

The library owns: the ingest seam + `AnalyticsSinkPort`, the aggregate/time-series data model, the
rollup + retention jobs, the goals registry, the query surface, and the admin + AI handlers. The
**client beacon JS is core, first-party, and cookie-less by construction** — so it is *not* subject to
ADR-025's cross-origin iframe isolation (that rule exists to stop *untrusted plugin/theme JS* from
riding the operator cookie); the analytics beacon carries no credentials and calls no admin API, so it
reintroduces none of the ambient-authority risk ADR-025 guards.

### 2. Data model — core-owned single-writer sidecars in the per-site `content.db`

Four core-owned tables in `content.db` (ADR-012), all workspace-scoped with composite keys (ADR-007),
all **single-writer through `analytics/repo`** and enforced by a CI import-graph canary (the ADR-027 §2
mechanism). These are **operational counters, not editorial content**, so they **deliberately narrow
ADR-022's revision-per-write discipline (INV-3)** — a pageview does not generate an entry revision —
and carry their own attribution (`created_by_plugin_id`, nullable) instead:

- **`analytics_events`** — raw hit buffer, **PII-free by construction**, HARD-TTL'd. Drives the rollup
  job and the realtime view, then pruned. Not durable storage.
- **`analytics_aggregate`** — the **durable, primary time-series fact table**: per
  `(workspace_id, granularity, bucket_start, dimension, dimension_value)` counters
  (`pageviews`, `events`, `bounces`, `total_duration_ms`) **plus a mergeable HyperLogLog
  `visitors_sketch` blob** so distinct-visitor counts compose across arbitrary ranges **without any
  per-visitor rows** (§4). Composite PK is the full tuple above.
- **`analytics_session`** — ephemeral, PII-free session state (entry/exit path, pageview count, bounce
  flag) keyed on the cookie-less `session_id`; bounded retention.
- **`analytics_goal_def`** — declarative goals/custom-events **schemas-as-data** registry (mirrors
  ADR-022 content-types-as-data and ADR-028 setting-definitions); `match_value` is evaluated only by the
  **total/bounded, side-effect-free expression language** (ADR-022 amendment §2 — a trust primitive).

Per-site *configuration* (enabled, DNT/GPC honoring, retention days, exclusions, sink choice) is **not**
a new table — it lives in the **ADR-028 settings ledger** under `analytics.*` keys.

### 3. Ports — one write seam (rule-of-two), no query port

Per ADR-006 ("two plausible adapters, one built now"):

- **`AnalyticsSinkPort` (WRITE seam) — a real port.** The ingest handler hands each normalized,
  PII-free `NormalizedHit` to the sink. Adapters: **`LocalBufferSink`** (writes `analytics_events` +
  schedules rollup) **built now**; **`ForwardingSink`** (normalizes + forwards to an external collector
  via `HttpClientPort`) **named-next / plausible**. The forwarding adapter is the honest analogue of
  ADR-027's `BlobStorePort` (local now, S3 named-next) and is *also* the "bring-your-own-external-
  analytics" replaceability that the §3.5 Tier-3 spirit wants — you keep Tovu's cookie-less beacon and
  ship hits to your own warehouse, no repaint. Only the local adapter ships in v1; the forwarding shape
  is frozen-minimal and marked not-yet-validated.
- **No `StatsQueryPort`.** Reads (dashboards, AI tools) are **ordinary core code** over the standard
  `AnalyticsRepoPort` (in-memory + SQLite = ADR-015 rule-of-two, same as every feature repo). There is
  exactly one query evaluator, so a query *port* would be the speculative-second-adapter ADR-006 exists
  to prevent — this is precisely ADR-021 §2's "no `PolicyPort`" reasoning applied again. Refactor into a
  port the day a second evaluator (a warehouse reader) is actually built.

### 4. Privacy-first / cookie-less stance (the core of the brief)

- **Cookie-less, no persistent client id.** No cookie, no `localStorage` id, no fingerprint. Visitor
  uniqueness is a **daily-rotating, per-site, salted, non-reversible `visitorHash`** = digest of
  `(daily_server_salt ‖ site_host ‖ coarse request signal)`, **computed server-side at ingest and never
  stored with its inputs**. The salt rotates every 24h (not cross-day linkable) and is per-site (not
  cross-site) — the Plausible/Fathom mechanism.
- **No PII at rest — enforced at the seam.** IP and User-Agent are consumed **transiently** during
  normalization (IP → country/region then discarded; UA → device/browser/os class then discarded) and
  **never placed on a row**. The `IngestContext` type carries them as `readonly` and they die at the
  `AnalyticsSinkPort` boundary — the single line past which the design guarantees no PII. Event
  properties are bounded, validated, and PII-shape-rejected (`AnalyticsPiiRejectedError`).
- **No cross-site tracking.** Salt is per-site + per-day; there is no shared identifier across
  workspaces or across days. Workspaces are relationally isolated (ADR-007 composite keys).
- **Respect signals.** Do-Not-Track and Global-Privacy-Control are honored per-site (default on); an
  exclusion list (paths, IP ranges) drops hits at ingest before any write.
- **Mergeable uniques without per-visitor storage.** Unique counts use a per-bucket **HLL sketch**, so
  "distinct visitors over any date range" is a sketch-union — never a `COUNT(DISTINCT visitor)` over
  retained rows. This is simultaneously the privacy lever (nothing to re-identify) and the storage lever
  (bounded bytes per bucket).
- **Bounded cardinality.** The dimension set is a **closed enum** (path, referrer host, UTM, country,
  region, device/browser/os, entry/exit path, goal); per-bucket dimension-value cardinality is capped
  **top-N with an `(other)` overflow bucket**. Unbounded dimensions are both a storage DoS and a
  re-identification vector — the cap closes both, and keeps the surface inside ADR-022's bounded-cost
  discipline.

### 5. The ingest beacon seam

- **Transport.** A tiny first-party endpoint (e.g. `POST /_analytics/e`) served from the **site origin**
  (first-party ⇒ no third-party-cookie problem; cookie-less anyway). The client uses
  `navigator.sendBeacon`; the script is minimal, does no fingerprinting, and sends the small
  `IngestBeacon` payload only.
- **Unauthenticated but guarded.** Public visitors hit it, so it is **not** behind `authorize()` — the
  read/manage path is (§6). It is guarded instead by: per-workspace **rate-limiting**, **host→workspace
  resolution** (unresolvable ⇒ `AnalyticsWorkspaceUnresolvedError`, dropped), **payload validation**,
  **exclusion/DNT/GPC checks**, and PII rejection — the ingest analogue of ADR-027's one-gate
  `MediaIngressPolicy`. This is the same public-write / gated-read asymmetry ADR-027 uses (public `/m/`
  URL vs `authorize()`-gated mutation).
- **Async by shape (ADR-009 lane 2, applied with care).** Ingest is fire-and-forget: the handler
  normalizes and hands off to the sink, which does a cheap append; the beacon response never blocks on
  aggregation. **Per-hit events do NOT ride the durable outbox** (pageview volume would swamp it) — the
  outbox carries only the **low-volume rollup + goal-triggered** domain events. The **rollup and
  retention jobs run on the ADR-009 scheduler/outbox spine** (like media's GC/transform jobs), rolling
  `analytics_events` → `analytics_aggregate` deltas on a bounded, resumable watermark, then pruning
  expired raw/session rows.
- **Server-side fallback (deferred seam).** Counting at the routing layer (no client JS) is a named
  alternative for JS-less/headless clients; v1 ships the beacon, the fallback is a later adapter, not a
  repaint.

### 6. Surfaces + permissions (ADR-021 flat strings)

One capability registry; the Tier-5 admin dashboards and the AI tools are **both clients of the same
gateway handlers** (no back door — the §3.5 dogfood rule, ADR-027 INV-6). Flat `analytics.*` strings:

- `analytics.read` — view dashboards / run stats queries.
- `analytics.read.realtime` — the live last-N-minutes view.
- `analytics.manage` — enable/disable, retention, exclusions, sink choice.
- `analytics.goals.manage` — create/edit goal definitions.
- `analytics.export` — export aggregates (CSV/JSON).

The **ingest endpoint is intentionally permission-less** (public visitor writes). AI tools:
`analytics.query` (time-series/breakdown), `analytics.summary`, `analytics.realtime` — all over the
same handlers, `authorize()`-gated; agents are delegated principals (`grant ∩ delegator`, ADR-021 §6).

### 7. Hooks + events (ADR-009)

- **Hook (lane 3, extension):** `analytics.beforeIngest(hit) → hit | null` — annotate or **drop** a hit
  (exclude internal traffic, add a declared custom dimension). **Async + serializable-only** to stay
  inside the frozen ABI (ADR-024 §3), since a plugin hook may run out-of-process; it only ever receives
  an already-**normalized** hit, so a hook can never observe PII.
- **Events emitted (lane 2, outbox, low volume):** `analytics.rollup.completed`,
  `analytics.goal.triggered` — for webhooks/alerting/AI-memory, never per pageview.
- **Events consumed:** none required in v1 (ingest is beacon-driven). Consuming `content.published` for
  auto-annotations is a deferred nicety.

### 8. v1 scope

**IN v1:** cookie-less first-party beacon + `navigator.sendBeacon` client; core-owned four-table model;
PII-free ingest with transient IP/UA use + daily-rotating per-site visitor hash; DNT/GPC + exclusions;
`AnalyticsSinkPort` with the local adapter; rollup + retention jobs on the ADR-009 spine; HLL mergeable
uniques; bounded/top-N dimensions; time-series + breakdown + realtime queries; goals registry; pageviews
/ visitors / bounce / avg-duration / top-paths / top-referrers / UTM / geo(country) / device dashboards;
`analytics.*` permissions; AI query tools; CSV/JSON export; hard per-site disable switch.

**DEFERRED (each a named seam, already typed):** the `ForwardingSink` external-collector adapter;
server-side (JS-less) counting fallback; funnels / multi-step goals; per-visitor journeys (deliberately
never — privacy); a warehouse `StatsQueryPort` reader; re-homing ingest/rollup onto ADR-023's
plugin-ownable data-module path once that engine ships; long-horizon retention/rollup-compaction (owned
by the pending Storage/Backups primitive, cf. ADR-027's retention deferral); the AEO/answer-impression
analytics surface (`todos.md` §22).

## Consequences

- **Analytics ships in v1 without waiting on ADR-023's engine** — because the storage is core-owned
  (ADR-027's proven route), not plugin-owned. The plugin data-tier is a *future re-home*, named as a
  seam, not a v1 blocker.
- **Privacy-first is structural, not a setting:** PII dies at the `AnalyticsSinkPort` boundary by type
  and by the transient-only `IngestContext`; uniqueness is a rotating salted hash + HLL sketch, so there
  is nothing at rest to re-identify. "No PII / no cross-site / cookie-less" are guarantees of the shape,
  not promises in a privacy policy.
- **Rule-of-two is honest:** one real port (`AnalyticsSinkPort`) with a genuine second adapter named and
  motivated (forwarding = replaceability); reads stay ordinary core code, avoiding a fake `StatsQueryPort`
  exactly as ADR-021 avoided a fake `PolicyPort`.
- **The outbox is protected:** per-hit volume never touches the durable spine; only bounded rollup/goal
  events do — the ADR-009 lane discipline applied at high write rates.
- **The §3.5 heuristic is bent, transparently:** analytics lands in core against the "disable/replace ⇒
  Tier-3" reading, justified by the v1 storage + privileged-ingest constraints and the demotion-cost
  tie-breaker, and mitigated by a hard disable switch + forwarding replaceability. The residual tension is
  logged (OQ-1), not buried.
- **Narrowing INV-3 is stated, not silent** (ADR-027 §2 precedent): analytics tables generate no entry
  revisions; a CI import-graph canary + `created_by_plugin_id` attribution replace the revision guarantee
  for these operational rows.

## Open

- **OQ-1 (placement).** The Tier-2 call bends the §3.5 "disable/replace ⇒ Tier-3" heuristic. Re-decide at
  the ADR-023 engine milestone: once plugins can own tables and a privileged-ingest capability exists,
  should ingest/rollup **re-home to a bundled plugin**, leaving only the beacon-seam primitive in core?
  The design keeps that door open (named seam); the debate+audit this ADR owes should settle it.
- **OQ-2 (visitor-hash inputs).** The exact "coarse request signal" folded into `visitorHash` (IP+UA vs
  IP+UA+accept-language) trades uniqueness accuracy against re-identification risk; needs a privacy review
  and possibly a documented false-merge rate. Salt rotation cadence (24h assumed) is tunable.
- **OQ-3 (HLL parameters).** Sketch precision (bytes/bucket vs error %) and whether month-granularity
  aggregates store their own sketch or union from days — a storage/accuracy tuning, not a contract.
- **OQ-4 (retention ownership).** Raw-buffer/session TTL is owned here (default assumed ~30–90d), but
  long-horizon aggregate retention + rollup compaction belong to the pending **Storage/Backups snapshot
  primitive** (cf. ADR-027 grace≥retention) — sequence after that ADR.
- **OQ-5 (bot filtering).** A bot/spam-hit heuristic (UA list, behavioral) is unspecified; without it,
  counts inflate. Needs a bounded, updateable ruleset that stays inside ADR-022 §2 totality.
- **OQ-6 (beacon-origin vs media-origin).** The beacon is first-party same-site by design; confirm this
  doesn't collide with the ADR-020/025/027 cookie-less media/theme origin question (shared "which origin"
  open item) — the *rule* (cookie-less, credential-free) is fixed here regardless.

## Record

Design-only, produced by a single autonomous Opus 4.8 sweep agent — **no peer debate and no external
audit** (unlike ADR-027's 2-round swarm + audit or ADR-022's 3-round debate). It is grounded in the
accepted ADRs listed above and matched to the ADR-027/ADR-022 depth benchmark for structure and
specificity only. Typed interfaces (`src/analytics/types.ts`, `src/analytics/ports.ts`) were written and
**compile clean against the real repo types** (full `npm run typecheck` green, no isolation caveat). This
ADR **owes a debate + external audit before it may move to ACCEPTED**; the six Open questions above are
the intended entry points for that audit.

---

## Round-2 sweep-crosscutting fold (2026-07-10)
Folds `sweep-crosscutting-decisions-20260710.md` §C-035 (D4 split) + round-2. PROPOSED; owes per-ADR audit.
- **Split:** `analytics-ingest` (beacon endpoint + normalization + rate-limit + PII-death-at-`AnalyticsSinkPort` + salt custody) stays **Tier-2 core**; **storage + rollup + dashboards + goals + export become a bundled Tier-3 plugin.**
- **Binding re-home clause (named trigger + owner):** the plugin re-homes at the ADR-023 third-party-`dataModule` reconciliation/backfill engine milestone; owner = Analytics section owner; until then it runs first-party/core-run via snapshot-before-DDL. **Freeze `AnalyticsSinkPort`** as the seam.
- **Import ADR-038** for the `ForwardingSink` (guarded egress; no unfiltered outbound).
- Analytics store PII → `principal.erasure.requested` handler.
- **Permission namespace:** `admin.analytics.view`.
- **Wave 2** (least-blocking).

---

## Round-3 audit fold (TM-admin-sweep-001, 2026-07-10)
External audit (`/audit-work`: Codex + Gemini/agy + internal Fable verifier) found the PII-death claim as literally worded is contradicted by the persisted schema, plus an unpinned salt-custody mechanism and a self-contradicting erasure clause. Folded:

1. **PII claim corrected (Codex AS-001 — BLOCKER fix).** `visitorHash` and `sessionId` are **pseudonymous personal data, not PII-free data** — they deliberately link an individual's hits within a day/session, which is exactly what makes uniques/sessions work. The Consequences claim "no PII at rest" is corrected to: **no *directly-identifying* PII at rest** (no IP, no UA string, no fingerprint, no persistent cross-day/cross-site identifier). `visitorHash`/`sessionId` are retained, rotating (24h), per-site pseudonymous identifiers — a materially weaker but still accurate and still strong privacy property (the Plausible/Fathom precedent this ADR cites makes the identical claim under the identical mechanism). State this precisely rather than the stronger, false claim.
2. **Salt custody pinned (Fable F3).** `daily_server_salt` is **derived, never stored**: `HKDF(rootKey, "analytics-salt:" + workspaceId + ":" + utcDate)` over the `KeyringPort` root key (ADR-036 §5, which already lives outside `content.db`). Nothing persists; rotation is free; a copied/backed-up `content.db` alone cannot reconstruct the salt, closing the dictionary-attack risk.
3. **Erasure clause reconciled (Fable F8).** The Round-2 fold's `principal.erasure.requested` handler scope is corrected to: analytics holds no directly-identifying data to erase per-principal; the handler's actual job is dropping/anonymizing any **goal-event properties** that happen to carry a member-supplied value (rare, bounded, closed-enum per §4) and honoring raw-buffer TTL. Aggregate HLL sketches are **structurally non-erasable by design** (you cannot remove one visitor from a sketch) and are explicitly out of erasure scope — a stated privacy/architecture tradeoff, not an oversight.

---

## Round-4 audit fold (TM-admin-sweep-001, 2026-07-10)
Round-2 re-audit — three independent auditors converged on a gap in item 2 above: `KeyringPort`'s only declared method (`deriveSigningSecret`) is hardwired to a webhook-subscription info string and can't actually express `"analytics-salt:" + workspaceId + ":" + utcDate`. Folded:

1. **Salt derivation cites the corrected `KeyringPort` shape.** Item 2's `HKDF(rootKey, ...)` call is now `KeyringPort.derive({ workspaceId, purpose: 'analytics-salt', info: "analytics-salt:" + workspaceId + ":" + utcDate })` — the generic method added to `KeyringPort` in ADR-036's Round-4 fold, not `deriveSigningSecret`. No change to the actual salt-custody guarantee (still derived, never stored); only the method name/shape is corrected to something that actually compiles against the canonical primitive.
