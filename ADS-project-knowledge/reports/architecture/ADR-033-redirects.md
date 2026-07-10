# ADR-033: Redirects — Tier-2 Rules Over Routing, Core-Owned Tables, Bounded Matching Seam, In-Transaction Auto-Redirect on Slug Change

- Status: PROPOSED 2026-07-10 (autonomous Opus 4.8 sweep agent — design-only, no peer audit; owes debate+audit before ACCEPTED)
- Author: autonomous Opus 4.8 sweep agent
- Extends: **ADR-022** (redirect rules reuse the content model's *discipline* — single write chokepoint + append-only revisions + ULIDs + bounded/total validation + CI canary — on **dedicated core-owned tables**, NOT on `entries`; consumes the content chokepoint's slug-change extension point), **ADR-027** (applies the media-sidecar precedent: high-write operational state that would violate the revision-per-write rule lives in a core-owned sidecar that *explicitly narrows* INV-3)
- Relates: ADR-009 (typed calls for in-tx capture; outbox events for async hit counts; sync filter hook for resolution extensibility), ADR-021 (flat `redirects.*` permission strings + gated `redirects.use_regex`; composite workspace scoping), ADR-007 (`workspaceId` on every row + composite FKs), ADR-006 (`RedirectRepoPort` passes rule-of-two; matcher/hit-sink stay internal seams), ADR-015 (repo behind a port, in-memory + Drizzle/SQLite), ADR-012 (rows in the per-site `content.db`; redirect table travels with the install-dir), ADR-023 (own-tables lineage — but redirects is a **core library**, so it owns core tables directly, NOT via the plugin core-mediated path), ADR-028 (same "own tables reusing ADR-022 discipline" call as settings)
- Depends-on (not yet decided): the **`routing` Tier-2 library ADR** (§3.5) — the resolver-chain registration contract in §4 is co-designed here and OWED confirmation by that future ADR (Open Q-1).
- Sources: repo-root `AGENTS.md`; `tovu-v2-design.md` §3.5 (tier placement rule); `todos.md` Admin Section Spec Sweep (Redirects → "redirect rules over routing"); benchmark ADR-027 (media) + ADR-022 (content model) for depth/shape; competitor `other-repos-specs/wordpress_specs/wp-includes/rewrite-and-routing.md`.

## Context

Tovu needs a Redirects subsystem: operator- and AI-authored 301/302 rules layered over the
routing subsystem, a wildcard/regex matching seam, **automatic** redirect creation when an
entry's routable slug changes, and hit counts per rule. WordPress ships this as a userland
plugin (Redirection) while handling only *canonical* redirects in core; Tovu's differentiator
is the opposite instinct — **never-break-links is a data-integrity guarantee, a sibling of the
never-brick promise (ADR-022/023)**, not an optional add-on. A renamed page that starts
404-ing is exactly the silent breakage the platform exists to prevent.

The design must stay inside accepted ADRs. Two real tensions surfaced and are handled as
decisions or flagged as open questions, not by reopening anything:

1. **The `routing` library has no ADR yet** (it is Tier-2 backlog in §3.5). Redirects cannot
   define the whole request-resolution contract unilaterally. This ADR designs the *redirects
   side* of the seam and flags the routing-owned half as Open Q-1.
2. **Hit counts are high-write telemetry.** Putting them on `entries` (ADR-022) or on the
   audited rule ledger would generate a revision per hit — the exact INV-3 violation ADR-027
   solved for `asset_renditions`. Redirects therefore reuse ADR-022's *discipline* on their
   own tables and split telemetry into a non-revisioned sidecar.

## Decision

### 1. Tier placement — Tier-2 core library `redirects`

Redirects is a **Tier-2 core library** (`packages/core/src/lib/redirects/`), not a Tier-3
bundled plugin. The §3.5 placement rule — "tier 2 is anything ≥80% of sites need **and plugins
must build on**" — is met on three independent axes:

- **Cross-cutting need.** Every site that ever migrates, renames a page, or imports from
  another CMS needs redirects; it is not a disable-and-replace subsystem like comments or feeds.
- **Two core seams a plugin can only reach indirectly.** The subsystem must (a) intercept the
  **routing** resolution chain on the hot path and (b) mint a redirect **inside the content
  write transaction** on slug change (§5). A Tier-3 plugin could only observe these via
  after-commit hooks, opening a window where the old URL 404s before the redirect exists —
  unacceptable for a never-break guarantee.
- **It is a substrate.** SEO (sitemaps/canonicals), the importer (WXR permalink mapping,
  already noted in `todos.md`), and i18n all *build on* redirect resolution via the §6 hook.

The honest counter-argument (WordPress models manual rules as the *Redirection* plugin) is
answered by the split in §2/§6: the **resolver + storage + auto-capture** are core; the
**manual-rule admin surface and any conditional (geo/device) logic** are thin clients / a
deferred hook extension. Per the placement rule ("demotion is a breaking change"), the
never-break machinery is placed in core deliberately. See §Open for the residual question of
whether the manual-CRUD surface alone could later be re-homed.

### 2. Data model — core-owned tables reusing ADR-022 discipline (NOT `entries`)

Redirect rules are operational routing state, not editorial content. They are modelled as
**three dedicated, core-owned tables in the per-site `content.db`** (ADR-012), reusing ADR-022's
never-brick discipline exactly as ADR-028 (settings) and ADR-027 (media sidecars) did — **not**
as `entries`, and **not** via ADR-023's plugin core-mediated path (that path is for *plugins*;
`redirects` is a core library and owns core tables directly, like `principals` or
`setting_values`):

- **`redirects`** — the rule rows (see `src/redirects/types.ts` `RedirectRecord`): ULID `id`,
  `workspaceId`, `matchType`, normalized `fromPattern`, `toTarget`, `statusCode`, `status`,
  `override`, `priority`, `source`, `sourceEntryId?` + `from/toPathAtCapture?` (auto-rule
  provenance), `createdByPrincipal`, `createdByPluginId?` (ADR-022 attribution), timestamps,
  monotonic `version`.
- **`redirect_revisions`** — append-only ledger (ADR-022 §4b): full post-state snapshot +
  actor + `pluginId` + monotonic `seq` + `tombstoned` flag, written **in the same transaction**
  as every rule mutation. Deletes tombstone; the ledger is never rewritten.
- **`redirect_hits`** — operational sidecar (`RedirectHitStats`): `hitCount` + `lastHitAt` per
  rule. **Deliberately excluded from the revision discipline** — this *explicitly narrows
  ADR-022 INV-3*, the same stated-not-silent move ADR-027 makes for renditions. Counters are
  best-effort telemetry, non-critical to never-break, and updated off the hot path (§7).

Chokepoint + CI canary (ADR-022 §4a, ADR-027 precedent): only `redirects/repo` writes these
three tables; an import-graph lint asserts no side-door writer, and asserts every `redirects` /
`redirect_revisions` change carries a same-transaction revision.

**Indexing (ADR-022 mechanism, native columns not JSON):** unique `(workspace_id, from_pattern)`
partial index on `matchType='exact'` for O(1) exact lookup; a `(workspace_id, from_pattern)`
index serving longest-prefix range scans for `prefix`; `wildcard`/`regex` rows are the bounded
"dynamic" set, scanned in order (§3). All FKs composite on `(workspace_id, id)` (ADR-021 §4).

### 3. Matching — exact/prefix indexed, wildcard/regex as a bounded seam

Four `matchType`s (`src/redirects/types.ts`):

- **`exact`** — full normalized-path equality; index-backed O(1).
- **`prefix`** — longest-prefix match; index/trie-backed, with optional tail pass-through
  (`/old` → `/new` maps `/old/x` → `/new/x`).
- **`wildcard`** — glob with `*` capture segments, interpolated into the target via `$1..$n`.
- **`regex`** — anchored, **bounded** regular expression with capture interpolation.

`wildcard` + `regex` form the **dynamic seam**: after an exact/prefix miss, the resolver
evaluates the *ordered, count-capped* dynamic set through the `RedirectMatcher`
(`src/redirects/ports.ts`). The matcher is an **internal seam, NOT an ADR-006 port** (§ ADR-006
accounting below), and is **normatively total and bounded-cost** — linear-time / RE2 semantics,
anchored patterns, a per-request evaluation cap, and no backtracking engine. This is the direct
application of **ADR-022's amendment** (§2) that any hot-path expression evaluator is a
*trust-boundary primitive*: an unbounded regex here is a ReDoS DoS vector reachable by anyone who
can author a rule. `RedirectMatcher.validatePattern()` runs at the **write** chokepoint, so an
unsafe pattern is rejected before it can ever reach the request path.

Because arbitrary regex is the sharpest expressiveness/safety hazard, **`regex` authoring is
gated behind `redirects.use_regex` (default-deny, §7)** — the same default-off-behind-permission
posture ADR-027 gives `media.upload_svg`. `wildcard` covers the common "move a whole section"
case without raw regex.

### 4. Routing-layer integration — a two-phase resolver in the routing chain

Redirects registers a **`RedirectResolver`** into the (future) `routing` library's resolution
chain, consulted twice per request:

- **`pre_content`** — only rules with `override: true` are eligible. This is how an operator
  *retires a live URL* (301 an existing page elsewhere). `override` requires `redirects.manage`.
- **`post_content`** — the default **404-fill** pass: all active rules. Because live content
  wins by default, **reusing an old slug for new content transparently reclaims it** and the
  stale `auto_slug_change` rule simply stops matching (it is superseded, not deleted).

On a match the resolver returns `{ location, statusCode }`; the routing layer emits the HTTP
redirect. Permanent codes get `Cache-Control` per §7. **Precedence** within a phase:
`exact` > `prefix` (longest) > `wildcard`/`regex`, then explicit `priority`, then recency.

> **Open Q-1 (flagged, not resolved):** the exact registration API (resolver-chain ordering,
> whether the chain is a routing-owned array or an ADR-009 hook, how `pre_content` composes with
> canonicalization) is **owed by the routing-library ADR**, which does not yet exist. This ADR
> fixes the redirects-side contract (`RedirectResolver`, the two phases, the precedence rule) and
> declares the routing half co-dependent. Do not treat §4 as final until routing is decided.

### 5. Auto-redirect on slug change — synchronous, in the same transaction

When an entry's routable slug/path changes, core mints an `active`, `source='auto_slug_change'`
**exact** redirect old→new. Correctness requirement: **no request may observe the moved entry
without its redirect already existing.** An after-commit outbox event (ADR-009 lane 2) cannot
guarantee this — it leaves a 404 window. Therefore auto-capture is **synchronous, in the SAME
content write transaction** as the rename:

The content chokepoint (ADR-022 §4a) exposes a **synchronous, in-transaction, core-only**
extension point (`onEntrySlugChange`); `redirects` attaches `captureSlugChange(SlugChangeCapture)`
(`src/redirects/types.ts`), which inserts the rule + its revision in that same transaction. This
keeps `content` **decoupled from** `redirects` (content declares the extension point; redirects
opts in — ADR-009 lane 3 shape) while making capture atomic with the rename. An async
`redirect.created` event still fires post-commit for downstream consumers (cache warm, SEO).

> **Open Q-2 (flagged):** ADR-009 §3 hooks are synchronous+ordered but not specified to run
> *inside a DB transaction* (third-party code in a tx is risky). §5 needs a **core-only,
> in-transaction** variant of that extension point on the content chokepoint. Whether that is a
> new hook class, a typed call (ADR-009 lane 1, accepting a content→redirects dependency), or a
> content-chokepoint capability is a real design question owed to the content-lib owner. The
> *guarantee* (atomic capture, no 404 window) is fixed; the *mechanism* is open.

**Loop/chain hygiene (normative):** rules are collapsed to **at most one hop** at *write* time,
never chased at request time. On insert of A→B when B→C exists, store A→C (and keep B→C);
direct/transitive cycles are rejected with `RedirectLoopError`. `RedirectRepoPort.findByFromPattern`
+ `save` implement this at the chokepoint. This makes resolution O(1)-hops and immune to redirect
loops by construction.

### 6. Extensibility — one sync filter hook (ADR-009 lane 3)

A single declared-before-attached, priority-ordered **`redirect.resolve` filter hook**
(`RedirectResolveHook`, `src/redirects/ports.ts`) lets plugins transform or short-circuit a
resolution: i18n rewriting the target per locale, SEO adding canonicalization, or the deferred
**conditional-redirect** feature (geo/device/auth) landing ON this hook rather than in core.
Plus `redirect.created`/`redirect.updated`/`redirect.tombstoned` outbox events for async
consumers. No hook-soup: one filter, three notification events, all typed.

### 7. Permissions, hit counts, and open-redirect safety

**Permissions (ADR-021 flat strings, feature-registered catalog):** `redirects.read`,
`redirects.create`, `redirects.update`, `redirects.delete`, `redirects.manage` (bulk /
import-export / reorder / `override`), `redirects.use_regex` (gated regex authoring,
default-deny). `auto_slug_change` rows are minted by core attributed to the editing principal —
they require no `redirects.create` (automatic) but can be suppressed by an operator with
`redirects.manage`. Admin screen and AI tools are clients of the **same gateway handlers** (no
back door — §3.5 dogfood rule).

**Hit counts (off the hot path).** The resolver emits a `redirect.hit` outbox event (ADR-009
lane 2); an **idempotent** handler folds it into `redirect_hits` via the `RedirectHitSink` seam.
Counting NEVER adds a synchronous write to the redirect response. Dropped increment = lost
statistic, never a lost redirect. v1 = aggregate counters only (`hitCount` + `lastHitAt`);
per-hit timeseries is deferred (§8).

**Open-redirect safety (normative).** `toTarget` defaults to a **site-relative path**. An
absolute/off-site URL target is an open-redirect vector and requires `redirects.manage` **plus a
host allowlist**, enforced at the write chokepoint (mirrors ADR-027's SSRF posture for external
input). Wildcard/regex capture interpolation into an absolute target is denied unless the host is
allowlisted (prevents `*`-into-`//evil.com` injection).

### 8. v1 scope

**IN v1:** `exact` + `prefix` + `wildcard` rules; 301/302/307/308; manual CRUD + admin surface +
AI tools (`redirects.search`/`get`/`create`/`update`/`delete`, HITL on destructive); **in-tx
auto-redirect on slug change** (§5); one-hop chain collapse + loop rejection; `override`
pre-content pass; async aggregate hit counts; import/export (batched through the chokepoint);
workspace-scoped rows in `content.db`; open-redirect allowlist.

**DEFERRED (each a named seam already in the types):**
- **Raw/bounded `regex` authoring** — seam present (`matchType:'regex'`, `redirects.use_regex`),
  OFF by default; flip-on requires the bounded matcher engine to be in place (§3).
- **Edge/CDN redirect compilation** — the plausible *second* `RedirectMatcher` adapter (emit an
  nginx `map` / Cloudflare ruleset); when built, the matcher **promotes from internal seam to an
  ADR-006 port** (§ accounting).
- **Per-hit analytics timeseries** — v1 is aggregate counters; the `redirect.hit` event stream is
  the seam a future analytics store subscribes to.
- **Conditional redirects** (geo/device/auth/time) — land on the §6 `redirect.resolve` hook, not
  in core.
- **Query-string / matrix-param matching** — v1 matches on normalized path only.

### ADR-006 accounting (rule-of-two)

- **`RedirectRepoPort` IS a port** — two adapters built now (`InMemoryRedirectRepo` for tests +
  `DrizzleRedirectRepo`/SQLite), exactly the ADR-015 seam every `src/features/*` module rides.
- **`RedirectMatcher` and `RedirectHitSink` are NOT ports** — declared as ordinary internal
  seams. Each has a *plausible* second adapter (matcher → edge/CDN compiler; hit sink → external
  analytics) but **none is being built now**, so per ADR-006 they stay ordinary code, typed as
  interfaces only for testability, and are promoted to ports the day the second adapter is real.
  Introducing them as ports today would be the speculative abstraction ADR-006 exists to prevent.

## Consequences

- **Never-break-links is structural, not best-effort:** auto-capture is atomic with the rename
  (§5), so the guarantee holds even under crash between rename and event delivery — the failure
  mode an outbox-only design would carry.
- **The revision discipline is reused, not reinvented:** rule config gets ADR-022's chokepoint +
  append-only ledger + attribution + CI canary for free; the high-write telemetry that would
  break that discipline is quarantined in a sidecar that *explicitly* narrows INV-3 (stated, per
  the ADR-027 precedent).
- **Matching is a trust boundary, honestly bounded:** the hot-path evaluator is total/bounded by
  construction and validated at write time, closing the ReDoS vector that a naive
  "just support regex" redirect feature would open — the direct payoff of ADR-022's amendment.
- **Rule-of-two stays honest:** exactly one new port (the repo, with two real adapters); the two
  tempting-but-premature ports stay seams with their promotion trigger named.
- **The routing coupling is surfaced, not buried:** §4/§5 depend on a routing-lib contract and a
  content-chokepoint in-tx extension point that do not yet exist; both are flagged as open
  questions rather than silently assumed.
- **DX/perf cost, accepted:** every rule write flows through the chokepoint + revision + pattern
  validation; every request pays an exact/prefix index probe (O(1)) and, only on miss, a capped
  dynamic scan. The dynamic-set cap is a real limit on wildcard/regex rule count (documented, not
  silent).

## Open

- **Q-1 — Routing resolver-chain contract (blocking a final §4).** Owed by the `routing`
  Tier-2 ADR: chain ordering, hook-vs-array shape, composition with canonicalization, and where
  the `pre_content`/`post_content` split actually attaches. Redirects cannot ratify §4 alone.
- **Q-2 — In-transaction, core-only slug-change extension point (blocking a final §5).** ADR-009
  hooks are not specified to run inside a DB tx. The atomic-capture guarantee needs a core-only
  in-tx variant (new hook class vs typed call vs chokepoint capability) — owed to the content-lib
  owner. A real design question, not a re-opening of ADR-009/022.
- **Q-3 — Tier boundary of the manual-CRUD surface.** The resolver + storage + auto-capture are
  unambiguously core; whether the *manual rule management admin screen* alone could later be a
  Tier-3 client without demoting the never-break machinery is worth an explicit ruling.
- **Q-4 — Dynamic-set cap value + eviction.** The per-workspace cap on `wildcard`+`regex` rules
  (perf vs expressiveness) needs a number and an over-cap policy (reject vs. lowest-priority
  eviction). A tuning question, not a contract.
- **Q-5 — `307/308` default exposure.** Whether non-GET method preservation (307/308) is exposed
  in the v1 admin UI or kept API-only until a non-GET routable surface exists.

## Debate + audit record

**None yet.** This ADR is a **design-only, single-agent draft** produced by the autonomous
Opus 4.8 admin-section sweep — no peer debate, no external audit. It is deliberately written to
the depth of ADR-027/ADR-022 as a *quality bar*, but it has **not** cleared the debate→audit gate
those ADRs cleared. Before ACCEPTED it owes: (1) a multi-peer debate on the tier call (§1) and the
Q-1/Q-2 seam mechanisms; (2) an external audit of the never-break-links atomicity claim (§5), the
bounded-matcher totality claim (§3), and the open-redirect posture (§7). Typed interfaces backing
this design (`src/redirects/types.ts`, `src/redirects/ports.ts`) were written and **compile clean
against the real repo types** (`tsc -p tsconfig.json --noEmit`, exit 0, whole project).

---

## Round-2 sweep-crosscutting fold (2026-07-10)
Folds `sweep-crosscutting-decisions-20260710.md` §C-033 + round-2. PROPOSED; owes per-ADR audit.
- **Gate ACCEPTED on ADR-039** (forward resolver chain + the D2b in-tx slug-capture slot).
- **ADR-026 tx-handle fix (ADR-039 amendment 1):** the `SlugChangeCapture` implementer is **core-resident Tier-2** — even if Redirects is packaged Tier-3, the in-tx capture (rule insert + `redirect_revision` + one-hop loop-collapse) stays in core `lib/routing/`; the plugin owns only rule-admin UI + read surfaces. No plugin holds the `tx` handle.
- **Fail-closed:** a slug-changing rename with no bound capture while preservation is enabled MUST fail `LINK_PRESERVATION_UNAVAILABLE` (ADR-039 amendment 3) — never silently skip the redirect.
- **Read-path open-redirect:** re-validate hook-supplied `location` against `core/origin` `isAllowedRedirectTarget` (ADR-040) on the **read** path — write-time-only today.
- **Permission namespace:** `admin.redirects.manage`.
- **Wave 2.**
