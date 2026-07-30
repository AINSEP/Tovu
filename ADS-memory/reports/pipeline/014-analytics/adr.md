# ADR-PIPE-014: Analytics Remediation — Close the `recent-hits` Authorization Gap; Defer Tier-3 Storage/Dashboard Build-Out

- Status: ACCEPTED 2026-07-13 (human approval: Leona Burime, blanket approval across ADR-PIPE-008..015; Planning Preflight/Red-Team were skipped for this urgent-dispatch remediation — accepted with that acknowledged gap; this is a live, unguarded admin route today, so TDD should certify the failing 403 test as the first priority across all 8 ADRs)
- Date: 2026-07-13
- Spec: SPEC-014 v1.0.0 (hash: sha256:c3a7c5b1c25acfc4d4c7e13a520a5f5b7a14003319eeebf70d40cbd603a7732a)
- Author: Software Architect Agent

## Constitution Check

*Complete this before writing any other section. An unjustified violation is a blocking escalation.*

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new library. Reuses `node:crypto`-backed `authorize()` (already shipped, `src/identity`) and the existing `PermissionDescriptor` registration mechanism — the identical mechanism `settings`/`navigation`/`integrations` already use. |
| II — Test-First | COMPLIES (remediation-scoped) | The authz fix is new behavior (a route that currently allows all authenticated admins must now reject non-`analytics.read` holders) — TDD Agent must certify a failing 403 test **before** the `authorize()` call is added to `recent-hits.ts`, exactly per Article II. The existing passing tests for REQ-01..REQ-13/15/16 are unaffected and remain ground truth for everything except REQ-14. |
| III — Simplicity Gate | COMPLIES | The fix traces to REQ-14 (as amended below) and Known Deviations item 2. No speculative generality: the Tier-2/Tier-3 storage split is explicitly **deferred**, not spuriously scaffolded, so this ADR adds exactly one new permission string and one new `authorize()` call — nothing else. |
| IV — Anti-Abstraction Gate | COMPLIES / N/A | No new port. `authorize()` is ordinary core code (ADR-021 §2), not a port — adding a call site does not create or need a second adapter. |
| V — Integration-First Testing | COMPLIES | The P1 AC this ADR adds (403 for a caller lacking `analytics.read`) has an HTTP-route boundary and must be certified as an integration test against the real route, mirroring `admin-integrations-routes.test.ts`'s pattern (real `createRouteDeps()` + `requireAdminSession` + a real login), not a unit-level mock. |
| VI — Security-by-Default | **EXCEPTION today → remediated by this ADR's Decision.** This is the headline finding: `GET /api/admin/v1/workspaces/:workspaceId/analytics/recent-hits` is live, unauthenticated-beyond-session, and performs **zero per-action `authorize()` call**, unlike every other admin route in this codebase (`settings`, `integrations`, `menus`, `members`). The Constitution's standing Art. VI exception window (SPEC-014's own Constitution Compliance table) covers "no named-action authz has landed for this route yet" — this ADR is the design that lands it, closing the exception rather than re-stating it. |
| VII — Spec Integrity | COMPLIES | This ADR cites SPEC-014 v1.0.0, hash `sha256:c3a7c5b1c25acfc4d4c7e13a520a5f5b7a14003319eeebf70d40cbd603a7732a`, matching `pipeline-state.md`. |
| VIII — Observability | EXCEPTION (unchanged, not this ADR's scope) | SPEC-014 already records an Art. VIII exception for the ingest path (no structured error codes/correlation ids on policy drops) — orthogonal to the authz fix and not touched here. The new 403 response follows the existing `FORBIDDEN` envelope shape (`error`, `code`, `details`) used by `settings`/`integrations`, which already carries `permission`/`reason` — no new observability gap is introduced. |

Any EXCEPTION must have a row in the Complexity Justification table below. See Complexity Justification: the only EXCEPTION with a required row is Art. VI (current-state, not this decision's fault — the row documents why the fix is scoped as it is and not larger).

## Research Summary

- Research artifact: N/A — no library, framework, or persistence-mechanism choice is required for the authz fix (reuses `authorize()`/`PermissionCatalog`, already shipped). The storage/dashboard scope decision (see below) is **deferred**, so no rollup/query-engine technology evaluation is performed in this pass either — that research is explicitly the next SPEC's job, not invented here to fill space.
- Key decision: N/A for research; see Decision section for the two real decisions this ADR does make (permission string; storage/dashboard scope).

## Planning Preflight Evidence

- Coordinator Planning Preflight: **NOT RUN for this dispatch** — `pipeline-state.md` records `planning_preflight_status: NOT STARTED` and `red_team_status: NOT STARTED`. This Software Architect pass was directly dispatched by the Coordinator as an urgent, narrowly-scoped security remediation (explicit dispatch directive), which is a deliberate deviation from the standard gate order (skills.md workflow step 0 normally requires Planning Preflight = PASS before ADR work starts). **This deviation is flagged here, not silently absorbed**: recommend the Coordinator run Planning Preflight and Red-Team retroactively against this ADR + the amended spec before treating this ADR as ACCEPTED, per the standard gate, even though the urgency of a live, unauthorized admin route justified starting the design immediately.
- Spec hash verified at: 2026-07-13 (provider-local validator, `--phase spec --update-hash`, exit 0 — per `pipeline-state.md`)
- Red-Team status and artifact: NOT STARTED (see above)
- System Blueprint status and artifact: Not produced — no macro-topology change; this is a same-module permission-gating fix plus an explicit scope deferral, not a new service/deployment boundary
- CodeBase Analyzer reports consumed: None formal. Direct source inspection performed: `src/analytics/{index.ts,ingest.ts,ports.ts,repo.memory.ts,salt.ts,types.ts,INFO.md}`, `src/server/routes/admin/analytics/recent-hits.ts`, `src/server/routes/admin/settings/get-effective.ts`, `src/server/routes/admin/integrations/list.ts`, `src/identity/permissions.ts`, `src/identity/seed.ts`, `src/server/routes/types.ts`, `src/server/app.ts`, `src/server/middleware/dev-auth.ts`, `src/server/__tests__/routes/analytics-recent-hits.test.ts`, `src/server/__tests__/admin-integrations-routes.test.ts`, `apps/admin/src/sections/Analytics.tsx`.
- Reverse-spec artifacts consumed: None — SPEC-014 is a brownfield as-built spec (spec-manifest.md Brownfield References), not a formal reverse-spec extraction.
- Validator result or waiver: SPEC-014's own validator run PASSed (`--phase spec --update-hash`, exit 0, per `pipeline-state.md`). This pass does not re-run the validator (no spec file is edited by this ADR); Coordinator Planning Preflight should re-run `--phase preflight` per the standard gate before this ADR is treated as ACCEPTED (see deviation note above).

## Context

`src/server/routes/admin/analytics/recent-hits.ts` registers `GET /api/admin/v1/workspaces/:workspaceId/analytics/recent-hits` — a live, wired-into-`createApp()` route that returns the raw in-memory analytics buffer to any authenticated admin session. It performs **zero `authorize()` calls**. Every comparable admin route in this codebase (`settings/get-effective.ts`, `integrations/list.ts`, and by the same pattern `menus`, `members`) does the identical "resolve principal → `authorize({principalId, permission, workspaceId, entityType})` → 403 on denial → proceed" dance before touching data. Analytics is the one exception, and it is not a theoretical gap — the route is shipped and reachable today.

Two other findings are traced from the same spec/ADR-035 review, both explicitly disclosed rather than silently absorbed:

1. **No `analytics.*` or `admin.analytics.*` permission string is registered anywhere.** ADR-035 §6 (original) names flat `analytics.read`/`analytics.manage`/etc.; ADR-035's Round-2 sweep-crosscutting fold instead names `admin.analytics.view`, following a namespace convention (`admin.<section>.<action>`) that `reports/architecture/sweep-crosscutting-decisions-20260710.md` §E records as "DECIDED." **Neither string exists in `src/identity/permissions.ts`'s registered catalog, and the actual shipped code for the two other sections that convention was supposed to govern (`navigation`/ADR-029, `integrations`/ADR-036) does not use it either** — `permissions.ts` registers flat `navigation.manage` and `integration.manage` instead, with an explicit code comment stating the `admin.<section>.<action>` convention "has no implementation behind it anywhere in this codebase" and was deliberately not followed. This ADR must pick a real string, and the honest choice is between the ADR-level convention (never implemented, twice already bypassed) and the actually-shipped convention (implemented twice, zero exceptions until now would be a third). See Decision §1 and Rationale.
2. **ADR-035's Tier-2 ingest / Tier-3 storage-dashboard split (and its Round-2 "D4" fold, binding the storage/rollup/dashboards/goals/export surface to a future bundled plugin) is real only as a stated intent and a frozen seam (`AnalyticsSinkPort`).** No plugin package, manifest, module, DDL, rollup job, query surface, or goals registry exists in any form. The dispatching Coordinator directive gives this ADR latitude to decide whether to build that side now or defer it further, since nothing exists yet on that side (no brownfield risk either way). See Decision §2.

**What happens if we do nothing:** The recent-hits route stays reachable by any authenticated admin principal regardless of role/permission grant — a genuine, live over-broad-access defect, not a hypothetical one. Any future admin principal created with a narrower role (e.g. a support/read-only role that should not see traffic data) would silently have full analytics read access today with no code path to deny it.

## Decision

**§1 — Close the authorization gap now, as the #1 priority of this pass.** Add an `authorize()` call to `registerAdminAnalyticsRecentHitsRoute`, gated on a newly registered permission string **`analytics.read`** (owner: `"analytics"`), following exactly the same authorize-then-serve pattern already used by `settings/get-effective.ts` and `integrations/list.ts`. `RouteDeps` already carries `authorize: AuthorizeFn` and `analyticsSink`, so `AdminAnalyticsRecentHitsDeps` widens from `Pick<RouteDeps, "workspaceId">` to `Pick<RouteDeps, "workspaceId" | "authorize">` — **no change to `server/app.ts`'s wiring is needed** (it already passes the full `routeDeps` object into this registrar).

**Why `analytics.read` and not `admin.analytics.view`:** the permission-namespace question has a real, already-litigated answer inside this codebase, not just in ADR prose. `admin.<section>.<action>` is the ADR/sweep-doc-level convention, but it has **zero live implementations** — `navigation`/ADR-029 and `integrations`/ADR-036, the two sections that convention was supposed to govern first, both shipped flat `domain.verb` strings (`navigation.manage`, `integration.manage`) instead, with `permissions.ts` explicitly documenting why. Registering a third, different-shaped string (`admin.analytics.view`) here would create a codebase with three permission-naming conventions instead of resolving to one. Matching the two real precedents is lower-risk, requires no new pattern for Code Review to reason about, and is honestly what "coordinate with the Menus/Members/Integrations sibling ADRs" means in practice: those sections' actual code already made this call, twice. **This is flagged as a live governance conflict, not silently resolved by ignoring the ADR text** — see Rationale and the recommended follow-up in Consequences.

**§2 — Defer the Tier-2/Tier-3 storage+dashboard build-out; do not scope it into this pass.** No aggregate/time-series tables, rollup job, query surface, or goals registry are designed or built here. This is a deliberate scope decision (see Rationale), recorded as a real ADR position, not a silent omission — and it does not block the authz fix, which is fully self-contained to the existing ingest-only surface.

**Pattern(s) selected:** No new architectural pattern. This ADR is a targeted application of the existing "hexagonal ports + `authorize()`-gated admin routes" pattern already governing every other admin section (ADR-021, applied identically here) — see Default Heuristic Alignment.

## Default Heuristic Alignment

- Default heuristic: modular monolith at the macro level, vertical slices for feature ownership, and hexagonal boundaries only where external I/O or business-critical logic justify them. Frontend applications use Feature-Sliced Design. Small or simple features should avoid unnecessary architecture ceremony.
- Alignment: FOLLOWS
- Notes: This fix adds zero new modules, zero new ports, and zero new abstractions — it wires an existing cross-cutting seam (`authorize()`) into an existing route, exactly as `settings` and `integrations` already do. Deferring the storage/dashboard build-out (§2) is itself an instance of "avoid unnecessary architecture ceremony" — building a rollup/query engine now, inside a security-remediation pass, would be the ceremony this heuristic warns against.

## Rationale

Map the decision to the system drivers:
- **Driver: a live admin route has no per-action authorization check, unlike every sibling admin route** → addressed by §1's `authorize()` retrofit, using the identical mechanism (`AuthorizeFn`, `PermissionCatalog`) every other section already relies on — no new mechanism, so no new attack surface or review burden.
- **Driver: the permission-namespace convention is contested between ADR prose (`admin.<section>.<action>`) and actual shipped code (`domain.verb`)** → addressed by following the shipped precedent (`analytics.read`), because a third convention is strictly worse than either existing one, and the shipped one has zero migration cost (nothing currently depends on `admin.analytics.view` — it was never registered or checked).
- **Driver: this pass is dispatched as an urgent, narrow security fix, running in parallel with 5 sibling agents on disjoint files** → addressed by keeping the change surface to exactly one new permission string + one new `authorize()` call + the test migration it requires (see Migration Safety) — no shared file beyond `src/identity/permissions.ts` is touched in a way that would collide with sibling agents' work (each section registers its own permission entries additively).
- **Driver: nothing exists yet on the Tier-3 storage/dashboard side, so there is no brownfield risk either way in deferring it** → addressed by §2's explicit deferral, justified in detail below rather than silently dropped.

### Why defer the Tier-2/Tier-3 storage/dashboard split (§2), in detail

1. **No current requirement demands it.** Every REQ/AC in SPEC-014 describes the ingest-only slice; nothing in the approved spec calls for durable storage, rollup, or dashboards. Building it now would violate Article III (Simplicity Gate: every module traces to a present requirement) — there is no present requirement.
2. **ADR-035's own binding re-home clause isn't triggerable yet.** The Round-2 fold's storage/dashboard plugin is explicitly gated on "the ADR-023 third-party-`dataModule` reconciliation/backfill engine milestone" — and ADR-023 §12 still rejects third-party `dataModule` manifest keys today. Building the Tier-3 side now would either (a) violate that binding clause by shipping ungated, or (b) require inventing the exact reconciliation engine ADR-023 explicitly defers — a much larger, unrelated architecture decision that does not belong inside a security-remediation ADR.
3. **The urgency asymmetry is real, not assumed.** The authz gap is an active, exploitable-by-any-authenticated-admin defect *today*. The absence of storage/dashboards is a missing feature, not a vulnerability — nothing is at elevated risk by it staying unbuilt one more cycle. Conflating the two would dilute the #1 priority this dispatch names explicitly.
4. **A storage/dashboard build is a real technology decision that deserves its own research pass.** HLL sketch libraries/parameters (ADR-035 OQ-3), a rollup job design, and a query evaluator are exactly the kind of choice this Architect persona's workflow step 1 reserves a `research.md` artifact for — bolting that onto this ADR as an afterthought would produce a shallower decision than the choice deserves.
5. **Sweep §A.2 already names the interim path if the owner later decides to accelerate:** a bundled Tier-3 plugin can ship "first-party / core-run through the snapshot-before-DDL path" *before* ADR-023's engine exists — that option remains open and is not foreclosed by deferring here; it is simply not exercised in this pass.

## Pattern Evaluation

The only genuinely open implementation-level choice in this pass is **how to gate `recent-hits`** (the storage/dashboard question is a scope decision, evaluated in Rationale above, not a pattern choice — there is no candidate architecture to compare because nothing is being built there).

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|----------------|------|------|---------------|---------|
| Reuse existing `authorize()` + registered permission string (mirrors `settings`/`integrations`) | Strong fit | High | measured (read the actual route files and `permissions.ts`) | Zero new mechanism; identical shape to every other admin route; Code Review already knows how to audit this pattern; wildcard `"*"` owner grant (identity/seed.ts) means the seeded owner needs no grant migration | None significant | None — this is the established, load-bearing pattern | **SELECTED** |
| New route-level middleware (`requireAnalyticsPermission`) applied before the handler | Viable fit | Medium | analogical | Slightly more declarative at the registration call site | Introduces a second authorization-checking shape alongside the inline `authorize()`-then-403 pattern every other route uses; no other admin route uses per-route middleware for this — would be a novel convention for one route | Splits how "is this call authorized" is expressed across the codebase for no functional gain | Not selected — Article III/consistency: adds a second pattern where the existing one already fits |
| Blanket role check (e.g. "must be `owner` role") instead of a registered permission | Rejected | Low | analogical | Simplest to write | Bypasses the entire `PermissionCatalog`/`authorize()` fine-grained model this codebase deliberately built (SPEC-006/ADR-021); reintroduces exactly the coarse, unauditable check this fix exists to replace | Defeats the purpose of REQ-03's catalog-validated permission model | Not selected — contradicts the very security model this fix is meant to align analytics with |

## Quality Attribute Scorecard

| Axis | Definition | Score (1-5) | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | Ease of changing analytics authz behavior later | 5 | measured | One string, one call site; changing the permission later is a one-line registration + one-line `authorize()` call edit | None new | Matches the simplest possible shape for this kind of change | — | always-on | — | — | — |
| modularity | Cross-module coupling | 4 | measured | `analytics` gains a read dependency on `identity`'s `authorize()`/`PermissionCatalog` — the same dependency every other feature already has | New edge in the module graph (identity ← analytics), though this is the universal pattern, not a special case | Same coupling shape as `settings`/`integrations`/`menus` | — | always-on | — | — | — |
| scalability | Read/write volume headroom | 5 | measured | `authorize()` is an in-memory/DB-cached check already exercised on every other admin request; adding one more call site has no measurable throughput effect | None | No new scaling concern | — | always-on | — | — | — |
| reliability | Never-brick / correctness under failure | 4 | measured | `authorize()` fails closed (denies on any error/uncertainty, per ADR-021 INV-07-style discipline used elsewhere); a bug here can only over-deny, never accidentally widen access, given the additive nature of the change | If `authorize()` itself has a latent bug, this route now inherits it — but that risk already exists for every other gated route today, not newly introduced | Fail-closed by inherited design | — | always-on | — | — | — |
| **security** | Authorization correctness — the headline axis for this ADR | **2 → 5 after remediation** | measured | **Current state (2):** zero per-action authz on a live admin route — the exact defect this ADR exists to fix. **Post-remediation (5):** matches the established, audited pattern every sibling admin route uses; the owner's wildcard grant needs no migration; narrowing-only change (see Migration Safety) | Before the fix: any authenticated admin, regardless of role, can read all buffered traffic data — a real information-disclosure risk to a workspace's traffic patterns for any principal who should not have that visibility | This is precisely the gap Constitution Article VI names and this ADR is written to close | The `authorize()` mechanism itself (ADR-021) is already trusted/audited elsewhere; this ADR does not re-verify that mechanism, only its application here | always-on | **Mitigation: this ADR's own Decision §1.** Owner: Software Architect (design) → TDD Agent (certifies the failing 403 test) → Programmer (wires the call). Enforcement: Code Review must confirm the route now matches the `settings`/`integrations` authorize-then-403 shape exactly. Deadline: next TDD/Programmer dispatch for this feature. | If a future admin route ships without an `authorize()` call again, treat it as a repeat of this exact finding — escalate immediately rather than re-deriving the analysis | +3 vs "no fix" (this axis is the reason this ADR exists) |
| operability | Ops/debugging surface | 4 | measured | The new 403 response reuses the existing `FORBIDDEN` envelope (`error`, `code`, `details: {permission, reason}`) already used by `settings`/`integrations` — no new error shape for operators to learn | None new | Consistent with existing conventions | — | always-on | — | — | — |
| cost | Build/run cost | 5 | measured | No new infrastructure, no new table, no new service; one permission registration + one call site | None | Minimal-cost fix by design | — | always-on | — | — | — |
| testability | Ease of certifying behavior | 4 | measured | The exact test-migration pattern already exists (`admin-integrations-routes.test.ts`: `createRouteDeps()` + `requireAdminSession` + real login) to copy for analytics | The current `analytics-recent-hits.test.ts` is a bare standalone app with no auth middleware at all — it must be rewritten, not just extended, to exercise the new check (see Migration Safety) | Real precedent exists to follow; this is not a novel test-harness problem | — | always-on | Owner: TDD Agent; rewrite `analytics-recent-hits.test.ts` to the `createRouteDeps()`+`requireAdminSession` pattern before certifying the new 403 case | If the rewrite reveals other analytics-route tests relying on the no-auth standalone-app shape, flag for a broader test-harness cleanup pass | — |

No axis scored ≤2 in its **post-remediation** state; the security axis's pre-remediation score of 2 is the documented current-state defect this ADR's Decision closes — see Mitigations Required.

## Overall Strengths

- The fix is maximally boring: it copies an already-audited, already-shipped pattern used by two other admin sections, with zero new abstractions.
- The wildcard owner grant (`identity/seed.ts`) means the fix requires no data/grant migration — the only principal that exists in a fresh deployment already passes the new check.
- The storage/dashboard deferral is argued explicitly, with named triggers (ADR-023's engine milestone, or the sweep §A.2 interim path), not left as silent scope creep either way.

## Overall Weaknesses

- The permission-namespace choice (`analytics.read` over `admin.analytics.view`) resolves this feature's instance of a codebase-wide inconsistency but does not resolve the inconsistency itself — see Consequences/Risks for the recommended follow-up.
- Deferring storage/dashboards means the admin "Analytics" screen remains a raw recent-hits list indefinitely until a follow-up spec is actually dispatched — an acceptable but real product-completeness gap this ADR does not attempt to close.

## Tradeoff Tension

We are trading "settle the permission-namespace question once and for all, right now" for "match the two real precedents that already exist, and flag the ADR-level convention as unimplemented/contested rather than silently ratifying either side."

## Why This Won

Matching `navigation.manage`/`integration.manage`'s already-shipped, already-reviewed convention costs nothing and creates no new inconsistency; inventing a third shape (or retroactively "fixing" the other two sections, which are out of this ADR's scope and being worked by sibling agents right now) would either widen this pass's blast radius past its narrow security mandate or leave the codebase with three different permission-string shapes instead of two. The narrow, urgent scope of this dispatch is itself a reason to pick the option with zero side effects on files outside `src/identity/permissions.ts` and the one route.

## Runner-Up Comparison

- Runner-up: register `admin.analytics.view`, following ADR-035's Round-2 fold and the sweep-crosscutting "DECIDED" convention literally.
- Why it lost: it is textually "the decided convention," but it has never actually been implemented anywhere in this codebase — both prior sections the convention was meant to prove out (`navigation`, `integrations`) deliberately bypassed it in favor of the flat shape this ADR also selects. Following the never-implemented convention here would make analytics the *only* section honoring ADR prose that the actual code has twice rejected — worse for consistency, not better.

## Consequences

**Positive:**
- The recent-hits route now enforces the same fine-grained authorization discipline as every other admin section — closing the Constitution Article VI EXCEPTION this spec/ADR names.
- Adding the check is provably safe to roll out: it can only narrow who can call the route, never widen it (see Migration Safety).
- The Tier-3 storage/dashboard deferral is now a recorded architectural decision with named re-evaluation triggers, replacing an open-ended "eventually" with an explicit "not yet, and here's exactly what unblocks it."

**Negative / Tradeoffs:**
- The permission-namespace inconsistency (`admin.<section>.<action>` in ADR/index prose vs. flat `domain.verb` in three shipped catalogs — `navigation`, `integrations`, now `analytics`) is not resolved by this ADR; it is followed, documented, and escalated as a governance item (see Risks).
- `analytics-recent-hits.test.ts` must be rewritten (not just extended) to use the real-session test harness, a small but real test-infrastructure cost this pass incurs.

**Risks:**
- Risk: A future reader treats ADR-035's `admin.analytics.view` text (or the ADR-INDEX.md one-line summary, which still says "perms `admin.analytics.view`") as the live permission string, since this ADR changes the *implementation* but does not edit ADR-035's or ADR-INDEX.md's prose → plan: this ADR is the authoritative record of the actual registered string (`analytics.read`); flag ADR-035/ADR-INDEX.md's permission-name text as stale in a follow-up documentation pass, mirroring how this ADR itself had to reconcile prose vs. shipped code.
- Risk: with three sections (`navigation`, `integrations`, `analytics`) now all using the flat convention against an ADR-level convention that says otherwise, the mismatch has crossed the "3+ exceptions against the same rule" re-evaluation trigger the `adr-governance` skill defines for MANDATORY/DEFAULT rules → plan: **recommend the Coordinator schedule a governance-level re-decision**: either formally amend the `admin.<section>.<action>` convention in `sweep-crosscutting-decisions-20260710.md`/ADR-INDEX.md to match the flat shape actually in production, or schedule the rename migration (a breaking, role-grant-touching change per that document's own reasoning) as deliberate future work — not silently accumulate a fourth, fifth exception in Members/Menus' own in-flight sibling ADRs.
- Risk: the storage/dashboard deferral could be read as "analytics is done" by a future planner → plan: SPEC-014's own Open Questions (OQ-01, OQ-03) plus this ADR's Rationale §2 stay the canonical pointer to the real remaining work; recommend the next command explicitly names a follow-up SPEC rather than assuming this ADR's scope was the whole feature.

## Mitigations Required

- Weak axis: security (pre-remediation state, scored 2)
- Mitigation: This ADR's Decision §1 (add `authorize()` + register `analytics.read`)
- Owner: TDD Agent (certify failing 403 test) → Programmer (implement) → Code Review (verify pattern match)
- Enforcement: Code Review confirms the route matches the `settings`/`integrations` authorize-then-403 shape exactly; no partial/alternate implementation
- Deadline or trigger: Immediately following this ADR (next dispatch in this feature's pipeline)

## Migration Safety (required for brownfield, reverse-spec, or migration work)

| Safety Item | Decision / Evidence | Owner |
|---|---|---|
| Expand/contract shape | **Expand only, no contract.** This is not a data migration — it is adding a request-time authorization check to an existing route. No table, no schema, no stored data changes shape. The "expand" is: (1) register `analytics.read` in `permissions.ts`'s `BASE_CATALOG`-adjacent registration block (mirrors the `navigation.manage`/`integration.manage` registration pattern, not the `BASE_CATALOG` array itself), (2) widen `AdminAnalyticsRecentHitsDeps` to include `authorize`, (3) add the authorize-then-403 block to the handler. There is no old code path to contract/remove — the route had no prior authorization logic to retire. | Software Architect (this decision), Programmer (execution) |
| Dual-write or read-routing plan | N/A — no data is written or dual-written by this change. The change is purely a read-time gate on an existing GET route. | N/A |
| Backfill plan | **None needed.** `src/identity/seed.ts` confirms the seeded owner principal already holds the wildcard `permission: "*"` grant, which `authorize()` treats as matching any registered permission string, including a brand-new one. No existing principal needs a grant backfilled for the fix to be non-breaking for the one seeded operator account. Any *other* principal that exists in a real deployment and lacks an explicit `analytics.read` (or wildcard) grant will — correctly — be newly denied; that is the intended security-narrowing effect of this ADR, not a defect to backfill around. | Programmer (verify seed-time wildcard still covers it in the failing/passing test pair) |
| Reconciliation checks | TDD Agent certifies: (a) the seeded owner (wildcard grant) still gets `200` from recent-hits after the fix — a regression check proving the change is non-breaking for the only principal that exists today; (b) a principal with no `analytics.read` grant and no wildcard gets `403` with the standard `FORBIDDEN` envelope — the new behavior this ADR exists to add. | TDD Agent |
| Observability proving phase health | The new 403 response reuses the existing `FORBIDDEN` error envelope (`error`, `code: "FORBIDDEN"`, `details: {permission, reason}`) already emitted by `settings`/`integrations` — no new telemetry surface is needed; a denied call is now visible in the same place every other denied admin call already is. | Programmer |
| Rollback test | Because this is additive (a new `authorize()` call, not a removed one), rollback is simply reverting the one commit that adds the call — no data, schema, or grant state needs to be restored, since nothing was deleted or migrated. | Software Architect (this decision), Programmer (execution) |
| Cutover approval and timing | This can land as a single, self-contained commit/PR (permission registration + route change + test rewrite) — no phased rollout needed given the additive, narrowing-only nature of the change. Given this pass's own urgency framing (the #1 priority security gap), recommend landing it ahead of, not alongside, any Tier-3 storage/dashboard follow-up work. | Coordinator / Code Review |
| Point of no return | None — there is no destructive step in this change. Nothing is deleted; the old (no-authz) behavior is only ever reachable by reverting the commit. | N/A |
| Post-cutover verification | TDD's reconciliation-check pair (above) plus a manual `/verify`-style pass: log in as the seeded owner, confirm `recent-hits` still returns `200`; construct a second principal/role with no `analytics.read` grant, confirm `403`. | TDD Agent, then human/`/verify` |

## Re-evaluation Triggers

- Calendar trigger: None forced — this is a narrow, self-contained fix; no scheduled revisit.
- Scale trigger: N/A — no volume-sensitive surface is added.
- Topology trigger: Re-evaluate this ADR's scope decision (§2, defer storage/dashboards) the moment ADR-023's third-party-`dataModule` reconciliation/backfill engine actually ships, or the moment the sweep §A.2 first-party/core-run interim path is deliberately exercised for analytics — either event is this ADR's own named trigger for a follow-up SPEC/ADR.
- Dependency trigger: If `identity`'s `AuthorizeFn`/`PermissionCatalog` signature changes, Code Review should flag `src/identity/permissions.ts` and `src/server/routes/admin/analytics/recent-hits.ts` together, since this ADR's fix is a direct, ordinary consumer of that surface — no special-case handling exists that could silently drift.

## Module / Service Boundaries

```
src/identity/permissions.ts                         # MODIFIED: register `analytics.read`
                                                      #   (owner: "analytics"), following the
                                                      #   existing `navigation.manage`/
                                                      #   `integration.manage` registration-block
                                                      #   convention, not the BASE_CATALOG array

src/server/routes/admin/analytics/recent-hits.ts     # MODIFIED: widen `AdminAnalyticsRecentHitsDeps`
                                                      #   to Pick<RouteDeps, "workspaceId" | "authorize">;
                                                      #   add getAuthedPrincipal(res) + authorize()
                                                      #   call before serving hits, mirroring
                                                      #   get-effective.ts / integrations/list.ts

src/server/__tests__/routes/analytics-recent-hits.test.ts
                                                      # MODIFIED: rewritten to the real-session
                                                      #   test harness (createRouteDeps() +
                                                      #   registerAuthRoutes + requireAdminSession +
                                                      #   real login), mirroring
                                                      #   admin-integrations-routes.test.ts; adds
                                                      #   the two new AC cases (owner=200,
                                                      #   ungranted principal=403)

src/server/app.ts                                    # UNCHANGED — routeDeps already carries
                                                      #   `authorize`; the existing
                                                      #   registerAdminAnalyticsRecentHitsRoute(app,
                                                      #   routeDeps) call already passes the field
                                                      #   this fix needs, no wiring edit required

(No changes anywhere under a Tier-3 storage/dashboard surface — none exists; §2 defers its
 creation entirely, so there is no module boundary to declare for it in this ADR.)
```

## API / Event Contract Summary

What interfaces does this decision define that other agents must respect?

- `analytics.read` — new permission string, owner `"analytics"`, registered via `registerPermission()` in `src/identity/permissions.ts`. TDD/Programmer must use this exact string; Code Review must reject any route or test that introduces `admin.analytics.view` or `analytics.manage`-family strings for this feature without a fresh ADR revisiting §1's Rationale.
- `AdminAnalyticsRecentHitsDeps` (`recent-hits.ts`) — widened to `Pick<RouteDeps, "workspaceId" | "authorize"> & { analyticsSink: LocalBufferSink }`. Any future analytics admin route added to this module should follow the same `Pick<RouteDeps, ...>` narrowing convention already established by this file.
- The `FORBIDDEN` 403 envelope shape (`{ error, code: "FORBIDDEN", details: { permission, reason } }`) — unchanged, reused verbatim from `settings`/`integrations`; Programmer must not invent a new error shape for this route.
- No new event, no new table, no new query surface — explicitly none, per §2's deferral.

## Enforcement

How do we prevent violations?
- Code Review Agent verifies `recent-hits.ts`'s new authorize block byte-for-byte matches the shape used in `get-effective.ts`/`list.ts` (principal resolution → `authorize()` → 403-on-denial → proceed) — no bespoke variant.
- Code Review Agent verifies no second permission string (`admin.analytics.view`, `analytics.manage`, etc.) is introduced anywhere in this feature's diff without a fresh ADR section addressing this ADR's Rationale.
- Code Review Agent verifies `analytics-recent-hits.test.ts` no longer builds a bare no-auth Express app — it must exercise the real `requireAdminSession` + `authorize()` path, matching `admin-integrations-routes.test.ts`'s harness.
- Code Review Agent verifies no file under a would-be Tier-3 storage/dashboard surface is introduced by this feature's diff — §2's deferral is a hard scope boundary for this pass, not a soft suggestion.

## Complexity Justification

*Fill only if Constitution Check has EXCEPTION entries. Empty = no violations.*

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|-----------------|-------------------------------|-------------------------------|------------------------------------------|
| VI — Security-by-Default (current-state finding, not introduced by this ADR) | The gap pre-exists this ADR; documenting it precisely (rather than glossing over it as "already covered by the standing local-dev exception") is required so the fix's scope and urgency are traceable. No complexity is *added* by closing it — the row exists to satisfy the template's rule that any EXCEPTION status needs a Complexity Justification entry, even a current-state one being remediated. | Silently marking Art. VI COMPLIES because "a session gate exists" | Insufficient: the Constitution's own text requires *per-action* authz, not just authentication — a session gate is not a substitute, and papering over the distinction is exactly the kind of unjustified violation the Constitution treats as a blocking escalation. |

## Related Decisions

- Extends: ADR-035 (Analytics — Privacy-First, Cookie-Less Traffic/Usage Surface, ACCEPTED 2026-07-10) — this ADR implements the authorization half of ADR-035 §6 that shipped code omitted, and formally defers ADR-035's Tier-2/Tier-3 storage split (§2 here responds to ADR-035's own OQ-1).
- Relates to: `sweep-crosscutting-decisions-20260710.md` §E (permission-namespace convention — flagged as contested against actual shipped code, see Risks); ADR-021 (`authorize()`, `PermissionCatalog`, ADR-006 rule-of-two reasoning re: no `PolicyPort`); ADR-023 (the `dataModule` reconciliation engine milestone this ADR's §2 deferral is keyed to); ADR-029 (Menus/navigation — the sibling ADR whose shipped `navigation.manage` precedent this ADR follows); ADR-036 (Integrations — the sibling ADR whose shipped `integration.manage` precedent this ADR follows); ADR-PIPE-007 (Settings — the closest prior pipeline-ADR shape/depth reference used for this document).
