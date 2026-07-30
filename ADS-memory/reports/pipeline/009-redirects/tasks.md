# Tasks: redirects

- Spec: SPEC-009 v1.0.0 (hash: sha256:666f3726f38eda3cc6274ebb3bfd1ee5642bcfeffb2eb80bc3f48e89fc3986ef)
- ADR: ADR-PIPE-009 (Redirects — Implementation Architecture; ACCEPTED 2026-07-13, human approval: Leona Burime, blanket approval across ADR-PIPE-008..015)
- Outline: ADS-memory/reports/pipeline/009-redirects/implementation-outline.md (Status: PRODUCED)
- Date: 2026-07-13
- Author: Coordinator

## ⚠ Coordinator Audit (2026-07-13, post-session-limit termination) — UPDATED after a Coordinator correction

The implementation agent was killed by an API session limit mid-run, not by a task failure. Audited by direct file inspection + scoped test runs. **Individual task checkboxes below are NOT updated** — verified at phase/module level, not task-by-task.

**Correction:** the first pass of this audit wrongly claimed `registerRedirectsPhaseHandlers()` was never called at boot — that was a Coordinator search-pattern error (searched for `redirectPhaseHandler`, not the real exported name `registerRedirectsPhaseHandlers`), not a real gap. Re-verified directly: it IS called in both `app.ts` and `deps.ts`.

**The real (now-fixed) gap:** the real site route (`src/server/routes/site/pages.ts`) never called `runPreContentPhase`/`runPostContentPhase` — so a redirect rule could be created via the admin API but visiting the matching URL did nothing. **Fixed directly by the Coordinator 2026-07-13**: wired both phases into `pages.ts` (`pre_content` before content lookup on both `/` and `/:slug`; `post_content` in the 404 catch path), plus a genuine end-to-end test proving it (`src/server/__tests__/routes/redirects-site-serving.test.ts` — the exact test tasks.md's own Phase-1 note calls "the single most important test in this feature"). **980/980 full-suite passing, `tsc` clean.**

- **Done and verified:** full domain layer, all 7 admin routes wired, `SlugChangeCapture` registered at boot, phase-handler registration at boot, AND now the actual live redirect-serving path through the real site route.
- **NOT done:** Admin UI — no Redirects section exists in `apps/admin/src/sections/`.
- **This feature is now functionally complete except the admin UI.**

## Format

`[ID] [P?] [Story ref] Description` — [P] = parallel-safe (different files, no shared mutable state within the phase). Phases + order derived from the implementation outline's Module Map, Wiring Map, Contract Map, and Downstream Handoff Notes.

Task checkboxes are **Coordinator-owned state**. TDD, Programmer, TestRunner, and Code Review treat this file as **read-only** unless the Coordinator explicitly delegates a task-list update.

---

## Known Scope Boundary — Read Before Implementing

**`src/features/post/post.ts`'s `updatePost` does not call the `SlugChangeCapture` slot, and has no transaction bracket of its own to call it inside.** This is confirmed by direct source read (ADR-PIPE-009 Migration Safety), not inferred. Wiring content's chokepoint to call `getSlugChangeCapture()` is **explicitly out of this feature's scope** — it is owed to the content-lib owner as a follow-up feature, and the Coordinator must schedule it as a named next feature (ADR-PIPE-009 Consequences/Risks).

Practical consequence for this tasks.md: REQ-15/16/17 and AC-18/19/20 are fully buildable and testable **against the `SlugChangeCapture` interface directly** — Phase 1 (T005) certifies `capture.ts`'s `onSlugChange()` by calling it inside a manufactured open transaction, not by renaming a real page through the real admin UI. The feature's own stated "Success signal" (rename a page, immediately get a 301 on the old URL) is **not** fully achievable end-to-end from this tasks.md alone. T041 (manual `/verify` pass) seeds an `auto_slug_change` row via a direct `capture.ts` call for UI-viewing purposes, not via a real rename — this is a deliberate substitution, named here so nobody discovers the gap mid-implementation. Do not treat a failing real-rename-to-301 manual test as a bug in this feature; it is the known, accepted, ADR-recorded gap.

---

## Constraints

### Coverage Profile

- Unit minimums: defaults `98/98/98/98` (lines/branches/functions/statements).
- Integration minimums: defaults `90/90/90/90`.
- E2E minimums: N/A — no browser E2E suite for this backend+admin-screen feature (mirrors SPEC-007 precedent); the Redirects screen gets a manual `/verify` pass (T041) instead of an automated E2E suite.
- Convergence threshold before Code Review: default `100%` of P1 acceptance tests (AC-01,03,04,05,06,07,08,09,10,12,13,14,15,16,17,18,19,21,22,23,27,28,29) and all invariants (INV-01…07) passing. No lower threshold requested.
- **Contract Tests** (from outline): `RedirectRepoPort` shared contract-test suite run against both `repo.memory.ts` and `repo.sqlite.ts` (T007).

### Required Suites

- Unit: **required** — `matcher.ts` precedence/tie-break/bounds, `ports.internal.ts` insert-helper, `capture.ts` ambient-tx discipline, `deriveRequiredPermission`-equivalent gating checks.
- Integration: **required** — 7 admin HTTP endpoints via the existing `src/server/__tests__/routes/` harness; the real `GET /:slug` site route (pre_content/post_content interleaving); the read-path open-redirect oracle gate at both the phase-handler boundary and the real HTTP boundary.
- E2E: **not applicable** — no browser/CLI end-to-end automated suite in this slice; the Redirects screen is manually `/verify`-checked (T041).

### Coverage Tool

- Tool: node:test built-in coverage — `node --import tsx --test --experimental-test-coverage` via the existing `npm run test:cov` script (wired in SPEC-007; no new tooling needed for this feature).
- Machine-readable output path: `coverage/lcov.info`.
- Cleanup paths before run: `coverage/`.
- Per-suite output: unit + integration share the node:test run (co-located `*.test.ts`).

### Performance (optional)

- N/A — SPEC-009 has no latency/throughput NFRs beyond the existing `WRITE_STANDARD`/`READ_STANDARD` rate-limit profiles (api.spec.md §3), enforced at the existing rate-limit middleware (not yet implemented anywhere in this repo — same gap as every other admin route), not a new performance target for this feature.

---

## Phase 0 — Setup

No story dependencies.

- [ ] T001 [P] Create directory structure: `src/redirects/__specs__/`, `src/redirects/__tests__/`, `src/server/routes/admin/redirects/` (`src/redirects/{ports.ts,types.ts}` already exist as ADR-033-governed stubs — extended, not created, by this feature)
- [ ] T002 [P] Add the 3 Drizzle table definitions from ADR-033 §2 DDL to `src/infra/db/schema.ts`: `redirects`, `redirect_revisions`, `redirect_hits`
- [ ] T003 [P] Confirm the existing `npm run test:cov` script (node:test `--experimental-test-coverage`, wired in SPEC-007) covers `src/redirects/**` — no new coverage tooling required

---

## Phase 1 — Foundational (blocks all story phases)

Schema, chokepoint, matcher, capture, and routing-wiring — the highest-risk, most load-bearing code in this feature (INV-01/02/03/04/07 all live here). Per ADR-PIPE-009's Parallel Delivery Plan, this phase is deliberately **sequential**, not internally parallelized against the risk-ordered certification sequence below. **No story phase (2/3/4) begins until this checkpoint passes.**

TDD focus order (from implementation-outline.md's Downstream Handoff Notes): certify C-011-internal + C-005 first (highest aggregate-risk for INV-01/INV-02) → then C-006/C-013 together (the read-path oracle gate, INV-03, this feature's single highest-priority contract) → then C-001-004 (the write chokepoint) → route-layer and UI tests last.

- [ ] T004 [INV-01] Write failing unit test: `insertRedirectAndRevision` (fake `db` handle) — exactly 1 record write + 1 revision write per call, in call order; a second call inside one manufactured outer transaction (simulating the chokepoint then the capture slot sharing a connection) asserts both persist together — `src/redirects/__tests__/ports.internal.test.ts`
- [ ] T005 [AC-18, AC-20, INV-01, INV-02, EC-05] Write failing unit test: `RedirectSlugChangeCapture.onSlugChange` called directly inside a manufactured open transaction — the redirect row + revision are queryable via the SAME transaction handle before commit (AC-18); retrying the same `changeSetId` does not duplicate the rule (AC-20); an unexpected throw propagates uncaught, and the test asserts the implementation issues NO `BEGIN`/`COMMIT` of its own (EC-05, Decision A's correctness property) — `src/redirects/__tests__/capture.test.ts`
- [ ] T006 [INV-03, AC-12, AC-13, AC-14, REQ-09, REQ-10] **Dedicated highest-aggregate-risk task — the open-redirect write+read dual-path check.** Write failing integration test at the `phase-handler.ts` component boundary: `RedirectResolver.resolve` must call `OriginRegistryPort.isAllowedRedirectTarget` against the fully-interpolated `location` in every code path before ever returning `matched:true`; a wildcard capture crafted to interpolate a disallowed cross-origin location resolves to `{ matched:false }`, never a match; a same-origin relative target passes — `src/redirects/__tests__/phase-handler.oracle.test.ts`. This gets the same dedicated, non-folded treatment SPEC-007 gave its write chokepoint (T008 there) — do not fold this into a general "write tests for phase-handler" task.
- [ ] T007 [P] [C-007 contract test] Write failing `RedirectRepoPort` shared contract-test suite (rule CRUD + `lookupExact`/`lookupLongestPrefix`/`listDynamic` + revisions) — `src/redirects/__tests__/repo.contract.test.ts` — runs against **both** adapters (T013, T014)
- [ ] T008 [AC-01, AC-02, AC-03, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-16, AC-17, AC-27, AC-31, INV-01, INV-04, INV-05, INV-07] Write failing tests: `redirects.ts` chokepoint — `createRedirect`/`updateRedirect`/`tombstoneRedirect`/`importRedirects`: validate-before-write ordering, write-path open-redirect rejection, one-hop collapse (A→B→C ⇒ A→C, AC-16) + cycle rejection (B→A rejected when A→B exists, AC-17), `matchType:'regex'` always rejected (AC-27), partial-success import batch (AC-31) — `src/redirects/__tests__/redirects.test.ts`
- [ ] T009 [P] [behavior.spec.md §1.1, §2.1, §4, §7] Write failing unit tests: `matcher.ts` — one test per precedence pair (exact > prefix (longest) > wildcard), the full tie-break chain (priority → recency → lexicographic id), every Limits-table boundary (`fromPattern` 2048/2049 chars, `priority` 1000/1001), and EC-04 (prefix rule matched at exactly its `fromPattern`, no tail) — `src/redirects/__tests__/matcher.test.ts`
- [ ] T010 [P] [AC-26, REQ-21] Write failing tests: `hit-sink.ts` — `record`/`getStats`/`listStats`; a forced throw in `record()` does not affect an already-returned redirect response (AC-26) — `src/redirects/__tests__/hit-sink.test.ts`
- [ ] T011 [P] [C-012, C-013, ADR-PIPE-009 Decision B] Write failing unit test in `routing`'s own suite: `runPreContentPhase`/`runPostContentPhase` each return the same outcome `resolve()` would for their own phase; calling `runPreContentPhase` alone does NOT also run `post_content` (the property `resolve()` cannot offer); the existing `routing/__tests__/routing.test.ts` suite remains green and unmodified after the additive change — `src/routing/__tests__/routing.phase-runners.test.ts`
- [ ] T012 [C-011-internal] Implement the package-private, non-tx-opening `insertRedirectAndRevision` — `src/redirects/ports.internal.ts` (depends T004; NOT exported from `index.ts`; imported only by `redirects.ts` and `capture.ts`)
- [ ] T013 [P] [C-007] Implement `RedirectRepoPort` in-memory adapter — `src/redirects/repo.memory.ts` (depends T007, T012)
- [ ] T014 [P] [C-007] Implement `RedirectRepoPort` SQLite/Drizzle adapter — `src/redirects/repo.sqlite.ts` (depends T002, T007, T012). Manual `BEGIN IMMEDIATE`/`COMMIT` for its own writes (matches `settings/repo.sqlite.ts` precedent); does NOT wrap `ports.internal.ts`'s shared helper in its own transaction; enforces the `(workspace_id, from_pattern)` exact-match uniqueness at the application layer.
- [ ] T015 [P] [behavior.spec.md §1.1, §2.1, §4] Implement `matcher.ts` — `match`/`validatePattern`, pure, no I/O; hard-reject `matchType:'regex'` always (REQ-22/INV-05) — `src/redirects/matcher.ts` (depends T009)
- [ ] T016 [Migration Safety — same-PR/same-task bundle, no partial cutover] Delete the stale, pre-ADR-039 `SlugChangeCapture` interface from `src/redirects/types.ts`; add `RedirectTargetNotAllowedError`; create `src/redirects/capture.ts` implementing the routing-owned `SlugChangeCapture` (imported from `src/routing`, performs NO transaction control of its own — calls `ports.internal.ts`'s shared insert helper directly against the ambient connection); register it via `registerSlugChangeCapture()` at composition-root boot. **All three land in this one task** — deleting the stale type without shipping `capture.ts` + registration would leave the slot unbound while link-preservation defaults could be enabled; shipping `capture.ts` without the deletion would leave two `SlugChangeCapture` names resolvable from `src/redirects/` (depends T005, T012)
- [ ] T017 [P] [C-012, C-013] Add `runPreContentPhase(path, ctx)`/`runPostContentPhase(path, ctx)` to `src/routing/routing.ts` as thin wrappers around the existing module-private `runPhase()`; barrel-export both from `src/routing/index.ts`. `resolve()` itself is UNCHANGED (depends T011)
- [ ] T018 [First-time composition-root wiring] Wire `src/origin`'s `OriginRegistry` (`InMemoryOriginSettingRepo` + a seeded dev-capability verified origin, mirroring `server/seed.ts`'s existing dev-mode fixture pattern) and `src/routing`'s registration functions into the composition root for the first time; wire the `redirects` repo/matcher/hitSink dependencies — `src/server/deps.ts`, `src/server/app.ts` (depends T013, T014, T017). **Must land before any test exercising `phase-handler.ts` end-to-end** (ADR-PIPE-009 Downstream Handoff Notes).
- [ ] T019 [C-001, C-002, C-003, C-004; AC-01,02,03,06,07,08,09,10,11,16,17,27,31; INV-01,04,05,07] Implement `redirects.ts` write chokepoint: `createRedirect`/`updateRedirect`/`tombstoneRedirect`/`importRedirects` — validate pattern + write-path oracle check, one-hop collapse/cycle rejection, same-tx write via `ports.internal.ts` — `src/redirects/redirects.ts` (depends T008, T012, T013, T014, T015, T018)
- [ ] T020 [C-006, C-007; INV-03 — highest-risk contract] Implement `phase-handler.ts`: `RedirectResolver.resolve` (impl) + `registerRedirectsPhaseHandlers` — owns the read-path open-redirect oracle call; must call `isAllowedRedirectTarget` on the fully-interpolated location in every code path before returning any `matched:true` outcome — `src/redirects/phase-handler.ts` (depends T006, T018, T019)
- [ ] T021 [P] [REQ-12] Register `admin.redirects.manage` permission — `src/identity/permissions.ts`. Flagged deviation (per spec-manifest.md): this is the first `admin.`-prefixed permission in the catalog, inconsistent with every other currently-registered flat-string permission — used as directed, not silently normalized.
- [ ] T022 [P] [C-009, C-010; AC-26, REQ-21] Implement `hit-sink.ts`: `RedirectHitSink` impl (`record`/`getStats`/`listStats`) + `registerRedirectHitOutboxHandler` subscribing to the `redirect.hit` outbox event — `src/redirects/hit-sink.ts` (depends T010, T018)
- [ ] T023 [P] Create `src/redirects/index.ts` public barrel (mirrors `routing`/`origin` barrel shape — `ports.internal.ts` deliberately NOT re-exported); create `src/redirects/INFO.md` documenting module purpose
- [ ] T024 Run Phase 1 tests to convergence — assert `tsc --noEmit` clean for the whole project (no duplicate `SlugChangeCapture` symbol collision anywhere importing `src/redirects/types.ts`); assert `src/routing/__tests__/routing.test.ts` still passes unmodified after T017's additive change

**Checkpoint**: Domain layer certified — INV-01/02/03/04/05/07 green; `origin`/`routing` composition-root wiring live for the first time. Admin API (Phase 2), site-route wiring (Phase 3), and the admin UI (Phase 4) may now begin **in parallel** — each depends on this checkpoint only, not on each other.

---

## Phase 2 — [Story: AC-16 equivalent] Admin HTTP API surface (P1) — [P] with Phase 3, Phase 4

**Goal**: The 7 admin endpoints (list/get/create/update/tombstone/import/hits) are each gated by `admin.redirects.manage` and map every domain error to its api.spec.md §6 HTTP code.
**Independent test**: call each endpoint without the permission → 403; create a rule with a disallowed absolute target → 400 `REDIRECT_TARGET_NOT_ALLOWED`; import a 3-item batch with one invalid pattern → 207 with 2 created + 1 failed.

- [ ] T025 [P] [REQ-12] Write failing integration tests: each of the 7 admin endpoints without `admin.redirects.manage` → 403 `FORBIDDEN` — `src/server/__tests__/routes/redirects-auth.test.ts`
- [ ] T026 [P] [AC-01, AC-02, AC-09, AC-10, AC-11, AC-16, AC-17, AC-27] Write failing integration tests: `CREATE_REDIRECT`/`UPDATE_REDIRECT` success + every error mapping (`REDIRECT_VALIDATION_ERROR`, `REDIRECT_TARGET_NOT_ALLOWED`, `REDIRECT_CONFLICT`, `REDIRECT_LOOP_DETECTED`) via the real SQLite adapter — `src/server/__tests__/routes/redirects-create-update.test.ts`
- [ ] T027 [P] [AC-04, AC-05, AC-07] Write failing integration tests: `LIST_REDIRECTS` filters (status/source/matchType), `GET_REDIRECT` found/missing, `TOMBSTONE_REDIRECT` → still listable but no longer matched — `src/server/__tests__/routes/redirects-list-get-tombstone.test.ts`
- [ ] T028 [P] [AC-31, EC-08] Write failing integration test: `IMPORT_REDIRECTS` partial-batch (one invalid pattern, one duplicate exact `fromPattern`) → 207 with per-item success/failure matching a manual create's own error per item — `src/server/__tests__/routes/redirects-import.test.ts`
- [ ] T029 [P] [REQ-21] Write failing integration test: `LIST_REDIRECT_HITS` reads `RedirectHitSink.getStats` — `src/server/__tests__/routes/redirects-hits.test.ts`
- [ ] T030 [P] Implement `src/server/http/admin/redirects.ts` — DTOs + `RedirectRouteDeps`/registrar type, mirrors `http/admin/menus.ts` (depends T019, T022)
- [ ] T031 [P] [C-014a] Implement `registerAdminRedirectListRoute` — `src/server/routes/admin/redirects/list.ts` (depends T030)
- [ ] T032 [P] [C-014b] Implement `registerAdminRedirectGetRoute` — `src/server/routes/admin/redirects/get-by-id.ts` (depends T030)
- [ ] T033 [P] [C-014c] Implement `registerAdminRedirectCreateRoute` — `src/server/routes/admin/redirects/create.ts` (depends T030)
- [ ] T034 [P] [C-014d] Implement `registerAdminRedirectUpdateRoute` — `src/server/routes/admin/redirects/update.ts` (depends T030)
- [ ] T035 [P] [C-014e] Implement `registerAdminRedirectTombstoneRoute` — `src/server/routes/admin/redirects/tombstone.ts` (depends T030)
- [ ] T036 [P] [C-014f] Implement `registerAdminRedirectImportRoute` — `src/server/routes/admin/redirects/import.ts` (depends T030)
- [ ] T037 [P] [C-014g] Implement `registerAdminRedirectHitsRoute` — `src/server/routes/admin/redirects/hits.ts` (depends T030)
- [ ] T038 Wire all 7 route registrars into the app — `src/server/app.ts` (depends T031–T037)
- [ ] T039 Run Phase 2 tests to convergence

**Checkpoint**: Admin API independently testable end-to-end against the real SQLite adapter.

---

## Phase 3 — [Story: AC-21/AC-22/AC-23/AC-24, INV-03] Site-route wiring — Decision B (P1) — [P] with Phase 2, Phase 4

**Goal**: The real `GET /:slug` handler interleaves `runPreContentPhase()` before its content lookup and `runPostContentPhase()` inside its existing `PostNotFoundError` catch branch, exactly per ADR-039 §1's pipeline order.
**Independent test**: an `override:true` rule wins over live content at the same path (pre_content); an `override:false` rule never wins over live content; a wildcard rule crafted to interpolate a disallowed cross-origin location never emits a 30x, even when a `post_content` rule would otherwise match.

- [ ] T040 [AC-21, AC-22, INV-03] Write failing integration test: real `GET /:slug` — an `override:false` rule never wins over live content at the same path (AC-21); an `override:true` rule always wins, evaluated in `pre_content` before the content lookup runs (AC-22) — `src/server/__tests__/routes/site-pages-redirects-precontent.test.ts`
- [ ] T041 [AC-23, AC-24, EC-06, INV-03 — the single most important test in this feature] Write failing integration test: real `GET /:slug`, seeded with a `post_content` (404-fill) rule AND a wildcard rule crafted so its capture interpolates a disallowed cross-origin location — asserts a 404/fallthrough is returned, **never** a 30x to the disallowed target (AC-12/AC-14 proven at the real HTTP boundary, not just the phase-handler unit boundary from T006); a reused-slug case where live content now resolves wins over a stale `post_content` rule (EC-06) — `src/server/__tests__/routes/site-pages-redirects-postcontent.test.ts`
- [ ] T042 [REQ-18] Wire `GET /:slug` to call `runPreContentPhase()` before its existing `getPublishedPostBySlug` call, and `runPostContentPhase()` inside its existing `PostNotFoundError` catch branch — `src/server/routes/site/pages.ts` (depends T017, T018, T020, T040, T041)
- [ ] T043 Run Phase 3 tests to convergence

**Checkpoint**: Site-route forward-resolution wiring independently testable; INV-03's guarantee proven at the real HTTP boundary, not only at the phase-handler component boundary.

---

## Phase 4 — [Story: REQ-23/24/25] Admin UI (P1/P2) — [P] with Phase 2, Phase 3

**Goal**: The Redirects screen (list + create/edit form) renders required fields, offers only `exact`/`prefix`/`wildcard` as creatable match types, and treats `auto_slug_change` rows as viewable/tombstonable but not creatable.
**Independent test**: open the list screen and confirm required fields render (AC-28); open the editor and confirm the match-type select has exactly 3 options, never `regex` (AC-29); confirm an `auto_slug_change`-sourced row is tombstonable from the list but has no equivalent path in the create form (AC-30).

- [ ] T044 [P] [REQ-23] Add `Redirect` types + client methods (`listRedirects`/`getRedirect`/`createRedirect`/`updateRedirect`/`tombstoneRedirect`/`importRedirects`/`getRedirectHits`) — `apps/admin/src/lib/api.ts` (mirrors the existing `Menu` block)
- [ ] T045 [P] [REQ-23, AC-28] Implement `Redirects.tsx` — list screen: `RedirectRow`, `RedirectHitBadge`, `RedirectImportDialog`, `ErrorBanner` per ui.spec.md §1–§6 — `apps/admin/src/sections/Redirects.tsx` (depends T044)
- [ ] T046 [P] [REQ-24, REQ-25, AC-29, AC-30] Implement `RedirectEditor.tsx` — create/edit form; match-type select renders exactly `exact`/`prefix`/`wildcard`, never `regex` (AC-29); `source` is read-only display; `auto_slug_change`/`import`-sourced rows are viewable/tombstonable but never creatable via this form (AC-30) — `apps/admin/src/sections/RedirectEditor.tsx` (depends T044)
- [ ] T047 Mount `<Redirects />`/`<RedirectEditor />` at `#/redirects`, `#/redirects/new`, `#/redirects/:id` — `apps/admin/src/App.tsx` (depends T045, T046)
- [ ] T048 Manual `/verify` pass: golden path (list → create one rule per allowed matchType → edit → tombstone → import a small batch); confirm no `regex` option renders anywhere; confirm an `auto_slug_change`-sourced row (seeded via a **direct `capture.ts` call**, since no real end-to-end rename path exists yet — see "Known Scope Boundary" above) is viewable/tombstonable but absent from the create form

**Checkpoint**: REQ-23/24/25 passing (automated) + T048 manual verification — screen complete.

---

## Phase N — Polish

Cross-cutting improvements after all required stories pass.

- [ ] T049 [P] Additional unit tests for pure-logic gaps not yet covered by Phase 1–4 (EC-01 bare-relative `toTarget` normalization, EC-03 dangling target, EC-07 raw forbidden characters in the interpolated location, behavior.spec.md §3 defaults, §5.1/§5.2 dedup rules) — fold into `matcher.test.ts`/`redirects.test.ts` or a dedicated `edge-cases.test.ts`
- [ ] T050 [P] Add the `warn`-level log line for a rejected read-path oracle candidate (normalized host only, never the full raw candidate) — `src/redirects/phase-handler.ts` (named as a future operability improvement in implementation-outline.md's Observability table; not required by any AC, cheap to land now)
- [ ] T051 Full `npm run test:cov` pass — confirm coverage minimums (98/98/98/98 unit, 90/90/90/90 integration) or file a human-approved override with TestRunner's actual measured numbers
- [ ] T052 Update `ADS-memory/reports/pipeline/009-redirects/traceability.spec.md` impl/test columns from `pending` to real file/function/test references; flip `traceability_status` and the Section 8 completeness checklist's final line

---

## Parallelization Rules

- Tasks marked [P] in the same phase can be dispatched simultaneously
- Modules must have no shared mutable state during parallel execution
- No Programmer instance writes to a file another instance reads
- If a shared utility needs changes, serialize — do not parallelize writes to shared code
- Phase 1 is a deliberately **sequential** foundation per ADR-PIPE-009's Parallel Delivery Plan (schema → chokepoint → matcher → capture → routing-wiring) — internal [P] markers only apply to genuinely disjoint files (contract test, matcher, hit-sink, routing additive-export test/impl, permission registration, barrel/INFO.md); the risk-ordered certification sequence (T004→T005→T006→T008) is not parallelized even though the test files are technically disjoint, because the ordering itself is the risk-mitigation the ADR calls for
- Phase 2, Phase 3, and Phase 4 are parallelizable with each other (disjoint files: `routes/admin/redirects/*.ts` vs. `routes/site/pages.ts` vs. `apps/admin/src/sections/*.tsx`) but each individually depends on the Phase 1 checkpoint only, not on each other
- T016 (the Migration Safety bundle: stale-type deletion + `capture.ts` + registration) must remain one indivisible task — do not split it across parallel dispatches or partial PRs

## Execution Strategies

**Sequential (single agent):** Phase 0 → Phase 1 checkpoint → Phase 2 → Phase 3 → Phase 4 → Phase N

**Parallel (multiple Programmer instances):** Phase 0 → Phase 1 checkpoint → {Phase 2, Phase 3, Phase 4} simultaneously → TestRunner aggregates → Phase N

---

## Coverage Summary Against SPEC-009 v1.0.0

Every P1 AC, invariant, and edge case has explicit task coverage. One cross-feature gap is flagged (not a coverage gap of this feature's own scope): see "Known Scope Boundary" above.

| Spec Item | Priority | Task Coverage |
|---|---|---|
| REQ-01 / AC-01, AC-02, AC-03 | P1/P2/P1 | T008, T019, T026 |
| REQ-02 / AC-04 | P1 | T007, T027 |
| REQ-03 / AC-05 | P1 | T007, T027 |
| REQ-04 / AC-06 | P1 | T008, T019, T026 |
| REQ-05 / AC-07 | P1 | T008, T019, T027 |
| REQ-06 / AC-08 | P1 | T004, T008, T012, T019 |
| REQ-07 / AC-09 | P1 | T008, T009, T015, T019, T026 |
| REQ-08 / AC-10, AC-11 | P1/P2 | T008, T018, T019, T026 |
| REQ-09 / AC-12, AC-13 | P1 | T006, T020, T041 |
| REQ-10 / AC-14 | P1 | T006, T020, T041 |
| REQ-11 / AC-15 | P1 | T021 (single v1 permission gates `override:true` same as every other write) |
| REQ-12 (no dedicated AC) | — | T021, T025 |
| REQ-13 / AC-16 | P1 | T008, T019 |
| REQ-14 / AC-17 | P1 | T008, T019 |
| REQ-15 / AC-18 | P1 | T005, T016 (see Known Scope Boundary — certified against direct `onSlugChange()` call, not the real content rename) |
| REQ-16 / AC-19 | P1 | T005, T016 (EC-05: unbound/throwing capture aborts the caller's transaction — proven by the manufactured-tx unit test, since the real caller doesn't exist yet) |
| REQ-17 / AC-20 | P2 | T005, T016 |
| REQ-18 / AC-21, AC-22 | P1 | T011, T017, T040, T042 |
| REQ-19 / AC-23, AC-24 | P1/P2 | T009, T015, T041 |
| REQ-20 / AC-25 | P2 | T007, T013, T014 (dynamic-set cap enforced at the repo/write-chokepoint boundary; no dedicated AC-25 test task beyond the contract suite and T019's cap-rejection case) |
| REQ-21 / AC-26 | P2 | T010, T022, T029 |
| REQ-22 / AC-27 | P1 | T008, T009, T015, T019 |
| REQ-23 / AC-28 | P1 | T044, T045, T048 |
| REQ-24 / AC-29 | P1 | T046, T048 |
| REQ-25 / AC-30 | P2 | T046, T048 |
| REQ-26 / AC-31 | P2 | T008, T019, T028 |
| INV-01…INV-07 | — | INV-01: T004, T005, T008, T012, T016, T019 · INV-02: T005, T016 (manufactured-tx proof; real end-to-end proof owed to the post.ts follow-up) · INV-03: T006, T020, T040, T041 (both component- and HTTP-boundary tests) · INV-04: T008, T019 · INV-05: T008, T009, T015, T019 · INV-06: T010, T022 · INV-07: T012, T019, T023 (Code Review import-boundary check, no CI canary this pass) |
| EC-01…EC-08 | — | EC-01, EC-03, EC-07 → T049 (Polish, if not already covered incidentally by T008/T009) · EC-02 → T009 (tie-break lexicographic-id fallback) · EC-04 → T009 · EC-05 → T005 · EC-06 → T041 · EC-08 → T028 |
| errors.spec.md codes | — | `REDIRECT_NOT_FOUND`/`REDIRECT_VALIDATION_ERROR`/`REDIRECT_CONFLICT`/`REDIRECT_LOOP_DETECTED`/`FORBIDDEN`/`VALIDATION_ERROR`/`INTERNAL_ERROR` → T008, T019, T025–T028 · `REDIRECT_TARGET_NOT_ALLOWED` (write) → T008, T019, T026 · `REDIRECT_TARGET_NOT_ALLOWED` (read, never an HTTP body) → T006, T020, T041 · `LINK_PRESERVATION_UNAVAILABLE` → **not produced by any task in this list** — raised by the content rename endpoint (outside this feature's own API surface), per errors.spec.md §4; Redirects only owns the capture implementation whose absence triggers it (T016), consistent with the Known Scope Boundary note above, not a coverage gap of this feature |
| behavior.spec.md §1.1, §1.2, §2.1, §2.2, §3, §4, §5.1/§5.2, §6.1, §7 | — | §1.1/§2.1/§4/§7(most rows) → T009 · §1.2 → T011, T017, T040 · §2.2 → T007/T013/T014 (repo ordering contract) · §3 (defaults) → T008/T019 or T049 if a gap is found · §5.1/§5.2 (dedup) → T008/T019, T028 (EC-08) · §6.1 → T009 (same as §2.1's tie-break chain) |

---

## Deferred (ADR-backed, not a coverage gap)

- `matchType:'regex'` authoring and `redirects.use_regex` enablement — ADR-033 §8 explicit DEFERRED item (post-v1 FEAT); REQ-22/AC-27 only cover the v1 reject behavior, already fully tasked (T008/T009/T015/T019).
- Edge/CDN redirect compilation (a second `RedirectMatcher` adapter) — ADR-033 §8 DEFERRED, future FEAT.
- Per-hit analytics timeseries — ADR-033 §8 DEFERRED; v1 ships aggregate counters only (T010/T022/T029).
- Conditional redirects (geo/device/auth/time) — ADR-033 §8 DEFERRED, lands on a future `redirect.resolve` hook.
- Query-string/matrix-param matching — ADR-033 §8 DEFERRED, future FEAT.
- CSV import/export UI wizard — ADR-PIPE-009 explicitly out-of-scope; `RedirectImportDialog` (T045) accepts a parsed rule array only, no file-format wizard.
- **The `post.ts`/content-chokepoint follow-up wiring `updatePost` to `getSlugChangeCapture()`** — see "Known Scope Boundary" at the top of this file. Not tracked as a task here by design; Coordinator must schedule it as a named next feature per ADR-PIPE-009 Migration Safety and Re-evaluation Triggers.
