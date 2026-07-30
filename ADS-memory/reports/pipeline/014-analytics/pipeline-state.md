# Pipeline State: FEAT-014 Analytics

| Field | Value |
|---|---|
| feat_id | FEAT-014-analytics |
| spec_id | SPEC-014 |
| stage | architecture (ADR-PIPE-014 + implementation-outline PRODUCED 2026-07-13 — remediation pass; closes the recent-hits `authorize()` gap, defers Tier-3 storage/dashboard build-out) |
| spec_provider | speckit |
| provider_version_ref | github/spec-kit @ 2c2fea8783f33085652b8c87e839bae84a6eb78d |
| provider_native_root | specs/ |
| provider_output_root | ADS-memory/specs/014-analytics |
| spec_path | ADS-memory/specs/014-analytics |
| spec_entrypoint_path | ADS-memory/specs/014-analytics/feature.spec.md |
| spec_readiness_artifact | ADS-memory/specs/014-analytics/spec-dod.md |
| spec_support_paths | api.spec.md, state.spec.md, ui.spec.md, errors.spec.md, behavior.spec.md, traceability.spec.md, spec-manifest.md |
| spec_naming | standard |
| spec_mode | brownfield |
| spec_hash | sha256:c3a7c5b1c25acfc4d4c7e13a520a5f5b7a14003319eeebf70d40cbd603a7732a |
| spec_hash_verified_at | 2026-07-13 (provider-local validator, `--phase spec --update-hash`, exit 0) |
| planning_preflight_status | NOT STARTED |
| planning_preflight_checked_at | |
| validator_result | PASS (`--phase spec`, exit 0, after fixing two `<action>`-literal placeholder false-positives — see Notes). Coordinator must rerun `--phase preflight` after filling the Coordinator Sign-Off row in `spec-dod.md`. |
| red_team_status | NOT STARTED |
| red_team_spec_hash | |
| governing_adr | ADR-035 (Analytics — privacy-first, cookie-less traffic/usage surface; core-owned ingest seam + aggregate time-series storage split), ACCEPTED 2026-07-10 (autonomous sweep agent, cleared 3-round `/audit-work` under `TM-admin-sweep-001`) |
| pipeline_adr | `ADS-memory/reports/pipeline/014-analytics/adr.md` — **ADR-PIPE-014**, PROPOSED 2026-07-13 (Software Architect remediation dispatch). Implements the authorization half of ADR-035 §6 that shipped code omitted (registers `analytics.read`, wires `authorize()` into `recent-hits.ts`) and formally defers ADR-035's Tier-2/Tier-3 storage/dashboard split with named re-evaluation triggers. **Planning Preflight/Red-Team were NOT run before this ADR was written** — see below. |
| implementation_outline_path | `ADS-memory/reports/pipeline/014-analytics/implementation-outline.md` — PRODUCED (triggers: Boundary Cross, Contract Change, Critical Cross-Boundary Invariant) |
| governance_adr_promotion | Not promoted this run. ADR-PIPE-014 documents a real cross-cutting conflict (the `admin.<section>.<action>` convention in `sweep-crosscutting-decisions-20260710.md` §E vs. the flat `domain.verb` strings actually shipped for `navigation.manage`/`integration.manage`, and now `analytics.read`) but resolves it as a feature-scoped choice (follow existing precedent), not a new durable rule — recommend the Coordinator route this conflict to a governance-level re-decision separately (see ADR-PIPE-014 Consequences/Risks), rather than promoting this pipeline ADR's local choice as if it settled the codebase-wide question. |
| research_artifact | N/A — no new library/technology/persistence choice is introduced; the authz fix reuses shipped `authorize()`/`PermissionCatalog` mechanics, and the Tier-3 storage/dashboard technology choice (rollup/query engine, HLL parameters) is explicitly deferred to a future SPEC, not researched in this pass |
| tasks_path | Not generated — out of scope for this dispatch (Software Architect stops after ADR + implementation outline, per instruction) |
| implementation_progress | **Already substantially implemented** (unusual for a fresh SPEC-NNN): the entire ingest half (`src/analytics/ingest.ts`, `salt.ts`, `repo.memory.ts`, `types.ts`, `ports.ts`, `index.ts`), both HTTP routes (`src/server/routes/site/analytics-ingest.ts`, `src/server/routes/admin/analytics/recent-hits.ts`, both wired into `createApp()`), and the admin UI (`apps/admin/src/sections/Analytics.tsx`) exist and are covered by passing unit + route-level tests. Storage/rollup/dashboards/goals/export are genuinely unimplemented (types only) — see `feature.spec.md` Scope: Out of scope. |

## Notes

- **Scope of this run:** Spec Agent dispatch only, per Coordinator directive: a lightweight
  as-built backfill for an already-shipped feature, explicitly skipping the full 5-pass
  reverse-spec pipeline. Read `AI-Dev-Shop/agents/spec/skills.md` in full first, per
  AGENTS.md's Delegated Agent Bootstrap instruction, before any other work — confirmed.
- **Read order followed:** `framework/spec-providers/core/provider-contract.md` →
  `speckit/provider.md` → `speckit/compatibility.md` → `ADS-memory/governance/constitution.md`
  → `ADR-035-analytics.md` (in full) → `src/analytics/*` (in full, every file) →
  `src/server/routes/admin/analytics/recent-hits.ts` (in full) →
  `apps/admin/src/sections/Analytics.tsx` (in full) → `src/identity/permissions.ts`. Also
  read `src/server/routes/site/analytics-ingest.ts`, `src/server/app.ts`'s wiring, all four
  existing test files (`src/analytics/__tests__/*`,
  `src/server/__tests__/routes/analytics-*.test.ts`), and
  `reports/architecture/sweep-crosscutting-decisions-20260710.md` + `ADR-INDEX.md` to
  confirm the frozen permission-namespace convention and ADR-035's accepted status.
- **The central finding: the ingest/storage Tier-2/Tier-3 split described in ADR-035 is
  real only as an intent and a frozen seam (`AnalyticsSinkPort`) — the Tier-3 side of the
  split does not exist in any form.** There is no plugin package, no separate module, no
  `dataModule` manifest entry, no DDL, no rollup job, no query surface, no goals registry,
  no export. Only the ingest-normalization half is built, and it runs as ordinary core code
  (not inside any plugin boundary) — so "Tier-2 vs Tier-3" cannot even be evaluated on the
  unbuilt side; it is simply unbuilt. This matches `src/analytics/INFO.md`'s own header,
  which independently and consistently discloses the identical scope boundary. Recorded in
  `feature.spec.md`'s "Known Deviations From ADR-035" section, not folded silently into the
  Overview as if the full ADR-035 design were live.
- **Second finding: no `admin.analytics.view` (or any `analytics.*`) permission exists.**
  `src/identity/permissions.ts`'s registered catalog (`BASE_CATALOG` plus the two
  feature-registered permissions, `navigation.manage` and `integration.manage`) contains
  zero analytics entries. `GET /api/admin/v1/workspaces/:workspaceId/analytics/recent-hits`
  calls no `authorize()` — it is gated only by the blanket `/api/admin`
  `requireAdminSession` middleware, unlike `settings`/`integrations` admin routes, which do
  call `authorize()` against a registered permission string. This is a genuine
  implementation gap against ADR-035 §6 (both the original `analytics.read` and the
  Round-2-fold `admin.analytics.view` naming), not merely a naming-convention question like
  SPEC-009 (Redirects)'s finding — Redirects hadn't shipped a route yet when that spec was
  written; this route is live and unguarded today. Recorded as REQ-14 and Constitution
  Article VI EXCEPTION in `feature.spec.md`, and as `api.spec.md`'s `AUTH_ADMIN_SESSION`
  profile note.
- **Minor, non-blocking finding:** both `src/server/__tests__/routes/analytics-ingest.test.ts`
  and `analytics-recent-hits.test.ts` carry file-header comments claiming their routes are
  "not wired into `createApp()` yet" — but `server/app.ts` does wire both
  (`registerAdminAnalyticsRecentHitsRoute` in the `/api/admin` block,
  `registerAnalyticsIngestRoute` ahead of the site catch-all). Recorded in
  `spec-manifest.md`'s Brownfield References and Validation Notes as a stale-comment
  cleanup item for a future pass, not a functional defect or a spec blocker.
- **A real spec-completeness gap was caught and fixed during this pass:** REQ-09 (session-id
  derivation) initially had no corresponding AC. Added `AC-37 (REQ-09) [P3]` and the matching
  `traceability.spec.md` row, honestly marked `UNTESTED` (existing tests assert `sessionId`
  is a string, not the specific same-window-equality property) rather than fabricating test
  coverage that doesn't exist.
- **`traceability.spec.md` intentionally uses `UNTESTED`/`DEFERRED` rather than `PENDING`**
  for 7 disclosed coverage gaps against already-shipped code (session-id window behavior, the
  `Analytics.tsx` UI having no component test, two precedence-rule combinations, a malformed
  referrer, a throwing `beforeIngest` hook, and several exact numeric boundaries) — each has
  an owner and a 2026-08-01 target date in §6.2. `traceability_status` is recorded as
  `IN PROGRESS`, not `COMPLETE`, honestly reflecting that these gaps are real and open.
- **Validator run:** `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/014-analytics --phase spec --update-hash` —
  first run surfaced two false-positive placeholder-marker hits (the literal substring
  `<action>` inside the prose phrase `admin.<section>.<action>`, describing the
  frozen permission-namespace convention, not a template placeholder); reworded to
  `admin.{section}.{action}` in both `feature.spec.md` and `spec-manifest.md` and rerun —
  **PASS, exit 0**, `content_hash` recomputed and rewritten as
  `sha256:c3a7c5b1c25acfc4d4c7e13a520a5f5b7a14003319eeebf70d40cbd603a7732a`.
- **Spec Agent sign-off completed** in `spec-dod.md`'s Sign-Off Block. **Coordinator row
  left blank**, per instruction — this dispatch stops at the spec-dod readiness gate and
  does not run Coordinator Planning Preflight, dispatch Red-Team, or generate `tasks.md`.
- Next steps (not run in this dispatch): Coordinator Planning Preflight (fill/verify the
  Coordinator sign-off row, rerun the validator with `--phase preflight`), then route to
  Red-Team, then bring the package to the human for the approval checkpoint before any
  Software Architect dispatch — which, given how much of this feature is already
  implemented, would likely scope narrowly to the two disclosed deviations (permission
  gating; whether/how to formalize the Tier-3 build-out) rather than the ingest slice
  itself.

## Software Architect remediation pass (2026-07-13)

- **Scope of this run:** Software Architect Agent dispatch, per Coordinator directive: an urgent,
  narrowly-scoped security remediation (the recent-hits authz gap), running in parallel with 5
  sibling agents on disjoint files (Forms, Newsletter, Menus, Members, Integrations). Read
  `AI-Dev-Shop/agents/software-architect/skills.md` in full first, per AGENTS.md's Delegated Agent
  Bootstrap instruction, before any other work — confirmed.
- **Gate deviation, flagged explicitly:** `planning_preflight_status` and `red_team_status` were
  still `NOT STARTED` when this dispatch began — the standard workflow (skills.md step 0) requires
  Planning Preflight = PASS before ADR work starts. This ADR was written anyway, on direct Coordinator
  instruction, because of the live security gap's urgency. **This is a real deviation, not silently
  absorbed** — ADR-PIPE-014's own Planning Preflight Evidence section records it and recommends the
  Coordinator run Planning Preflight and Red-Team retroactively against this ADR before treating it
  as ACCEPTED.
- **Decision 1 (the #1 priority): close the `recent-hits` authorization gap.** Register a new
  permission `analytics.read` (owner: `"analytics"`) and add an `authorize()` call to
  `recent-hits.ts`, mirroring `settings/get-effective.ts` and `integrations/list.ts`'s exact
  pattern. `RouteDeps` already carries `authorize`; `server/app.ts`'s wiring is unchanged.
- **Naming call: `analytics.read`, not `admin.analytics.view`.** ADR-035's Round-2 fold and
  `sweep-crosscutting-decisions-20260710.md` §E name `admin.<section>.<action>` as "DECIDED," but
  `src/identity/permissions.ts` shows that convention has **zero live implementations** —
  `navigation`/ADR-029 and `integrations`/ADR-036 both shipped flat `domain.verb` strings instead
  (`navigation.manage`, `integration.manage`), with an explicit code comment disclosing the
  deliberate deviation. Following the ADR-level convention here would make analytics the *only*
  section honoring prose the actual code has twice rejected. Chose the real precedent
  (`analytics.read`) instead — flagged in ADR-PIPE-014 as a live governance conflict (now 3
  instances of the same deviation), with a recommendation that the Coordinator schedule a
  governance-level re-decision (formally amend the convention doc, or schedule the breaking
  rename migration) rather than let a 4th/5th exception accumulate silently in the Menus/Members
  sibling ADRs.
- **Decision 2: defer the Tier-2/Tier-3 storage/dashboard build-out.** No aggregate/time-series
  tables, rollup job, query surface, or goals registry are designed in this pass. Justified in
  ADR-PIPE-014 Rationale: no current REQ/AC demands it (Article III); ADR-035's own binding
  re-home trigger (ADR-023's `dataModule` reconciliation engine) hasn't fired; the authz gap is a
  live exploitable defect while the storage gap is merely a missing feature; the storage build is
  a real technology decision (HLL sketches, rollup design, query evaluator) that deserves its own
  research pass and SPEC, not a rider on a security-remediation ADR. Named re-evaluation triggers
  recorded in ADR-PIPE-014's Re-evaluation Triggers section.
- **Migration Safety is expand-only, no contract/backfill needed:** the fix is additive (a new
  `authorize()` call, not a replaced one) and can only narrow access, never widen it. The seeded
  owner principal already holds a wildcard `"*"` grant (`identity/seed.ts`), so zero grant
  migration is required for the only principal that exists in a fresh deployment.
- **Test-infrastructure cost surfaced:** `analytics-recent-hits.test.ts` currently builds a bare,
  no-auth standalone Express app (its own header comment says auth is "intentionally NOT
  re-tested here") — after this fix, that is no longer accurate. The implementation outline
  specifies rewriting it to the real-session harness already proven by
  `admin-integrations-routes.test.ts` (`createRouteDeps()` + `registerAuthRoutes` +
  `requireAdminSession` + real login).
- **Risk flagged, not resolved:** ADR-035's own text and `ADR-INDEX.md`'s one-line summary still
  say "perms `admin.analytics.view`" — now stale relative to the actually-registered
  `analytics.read`. Recommended as a follow-up documentation correction, not fixed in this pass
  (out of scope — those are governance-tier documents, not this feature's pipeline artifacts).
- **Stopped after ADR + implementation outline, per instruction** — no `tasks.md`, no TDD/Programmer
  dispatch, no governance ADR promotion performed this run.
- **Recommended next command:** Coordinator Planning Preflight + Red-Team (retroactive, given the
  gate deviation above), then `/tasks` scoped to ADR-PIPE-014's single non-parallelizable slice
  (permission registration + route change + test rewrite, must land together per the
  implementation outline's Downstream Handoff Notes), then TDD Agent to certify the failing 403
  test before Programmer implements. Separately, recommend the Coordinator schedule the
  permission-namespace governance re-decision named above, independent of this feature's own
  task list.
