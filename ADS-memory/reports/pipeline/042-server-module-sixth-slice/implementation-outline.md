# Implementation Outline: Server Module Convention — Sixth Slice (storage-recovery, content-types/entries, SEO) — FINAL

- Spec: SPEC-042 v1.0.0
- Status: PRODUCED (retroactive, backfilled after implementation per explicit user request)
- Trigger result: System Wiring only — same established ADR-046/SPEC-031 pattern, final application. This is the LAST slice of the route-registration sweep; after this, `app.ts` has zero remaining inline domain registrar blocks (the 3 gated-mutation ceremonies excepted, by design).
- Date: 2026-07-17T00:00:00Z (backfilled)
- Author: Software Architect (in-session, direct — Claude Code host, per explicit user request)

> One domain in this slice (storage-recovery) carried an explicit "extra scrutiny" Scope Note in the spec itself, inherited from this session's own 7-round external audit history on this exact code (`TM-adr041-043-044-045-audit-001`). This outline treats that domain's verification with the same weight SPEC-039's outline gave the auth-ordering invariant — real evidence, not a read-through.

## Trigger Decision Matrix

| Trigger | Applies? | Evidence |
|---|---:|---|
| Boundary Cross | yes | 25 registrars across 3 domains, moved into 3 new module files |
| Contract Change | no | Zero registrar function bodies changed — pure re-typing + relocation |
| System Wiring | yes | `app.ts`'s composition-root call sites changed (25 imports removed, 3 module-factory calls added) |
| Critical Cross-Boundary Invariant | marginal | Two pre-existing invariants had to be re-proven, not re-designed: (1) `status.ts`'s `operationInFlight` live-lock read (ADR-041/043/044/045 Finding 3), (2) SEO's 2 public routes registering before the `/:slug` catch-all |
| Parallelization Ambiguity | no | 3 independent domains, done sequentially, committed incrementally after each |

## Module/File Map

| File | Domain | Notes |
|---|---|---|
| `routes/admin/storage-recovery/deps.ts` (new) + `modules/storage-recovery.ts` (new) | storage-recovery | `StorageRecoveryRouteDeps = Pick<RouteDeps, "workspaceId"\|"authorize"\|"clock"\|"storageLedgerRepo"\|"restorePointsRepo"\|"dbOps"\|"siteStatusRepo"\|"disclosureWatermarkSource"\|"deepLinkRestorePointLookup">`. `core/operation-lock`'s `isOperationInFlight` stays a direct module-level import inside `status.ts`, never added to this Pick — it was never a `RouteDeps` field in the first place. Covers 7 registrars, not the 6 the spec's own requirement text initially named (see Non-Obvious Finding). |
| `routes/admin/content-types/deps.ts` (new) + `modules/content-types.ts` (new) | content-types/entries (ADR-043 Collections backend) | `ContentTypesRouteDeps = Pick<RouteDeps, "workspaceId"\|"authorize"\|"clock"\|"idGen"\|"outbox"\|"contentTypeRepo"\|"contentTypeIndexProvisioner"\|"entryRepo">` — one combined type covering both sub-domains (design choice, disclosed in the file header: entries' write routes also read `contentTypeRepo` to validate the parent type is active, so a split would produce near-total field overlap). Filename deliberately `content-types.ts`, not `content.ts` — that name was already taken by SPEC-038's posts/pages module; confirmed untouched. |
| `routes/admin/seo/deps.ts` (new) + `modules/seo.ts` (new) | SEO (SPEC-008) | `SeoRouteDeps` covers 8 admin registrars plus the 2 public registrars (`registerSeoSitemapRoute`/`registerSeoRobotsRoute`, living outside `routes/admin/seo/` in `routes/site/{sitemap,robots}.ts`) — mirrors the pre-existing `media.ts` module's precedent of bundling a public route into an otherwise-admin module. |
| `src/server/app.ts` | — | 25 inline calls replaced by 3 module-factory calls. storage-recovery's 7 registrars were NOT contiguous in the original file (content-types sat between two of its registration blocks) — consolidated into one call site since none of the paths overlap; this consolidation is documented in both `modules/storage-recovery.ts`'s file header and inline comments at the `app.ts` call site. The critical SEO public-route-before-catch-all ordering constraint is preserved unchanged (see Critical Invariants). |

## Non-Obvious Finding

The spec's own requirement text named 6 storage-recovery registrars but stated "7 registrations" in its summary count — a real internal inconsistency in the spec, not a typo to silently resolve either direction. The implementer read `app.ts` directly, found the actual 7th registrar (`registerAdminRecoveryRestorePointsListRoute` in `recovery/restore-points.ts`, distinct from `storage/restore-points.ts`'s create/list pair), confirmed it was a live production registration, and included it. Omitting it would have silently dropped a working admin route from `app.ts` — a regression that neither `tsc` nor most of the test suite would have caught, since dropping a registrar call is not a type error. This is the same class of finding SPEC-038's outline flagged for its own missed `bus`/`settingsRepo`/`themes` fields: a spec's own guessed inventory is a starting point, never ground truth — the registrar list must be re-derived from `app.ts` itself, not copied from the spec.

## Test Expectations (mapped to spec ACs)

| AC | Verified by |
|---|---|
| AC-01 (storage-recovery unchanged) | `storage-migration-reconciliation-boot.integration.test.ts` (5 tests) + `recovery-routes.test.ts` (5 tests) — I independently re-ran both files directly (not just trusted the implementer), 10/10 pass |
| **AC-02 (operationInFlight live spot-check — the one this domain's Scope Note specifically demanded)** | `recovery-routes.test.ts`'s own dedicated test ("status reflects a REAL held operation lock as the 'operation-in-flight' banner, and clears once released") — I re-ran this specific test myself and confirmed it passes against the real post-relocation `createApp()` composition. The implementer additionally ran a standalone script-level spot-check (acquire lock → hit `/api/admin/v1/recovery/status` → `operation-in-flight` → release → back to baseline) as a second independent proof; I did not re-run that script myself but the equivalent assertion is what the test file (which I did re-run) checks. |
| AC-03 (content-types/entries unchanged) | ADR-043 Collections backend test suites re-run unmodified — pass (part of full-suite count below; no domain-specific file name surfaced as needing individual re-verification beyond the aggregate count) |
| AC-04 (SEO unchanged, public-route ordering preserved) | `route-class-precedence.unit.test.ts` — I independently re-ran this myself, both assertions pass (`/:slug` still registers after every other route; no other route shares the literal path) |
| AC-05 (full suite unchanged) | 1700/1698/2 before and after — I independently re-ran the full suite myself; the 2 failures are confirmed by name to be the same pre-existing `T041/INV-03` and `T045` failures every prior slice's outline has recorded, not new regressions |
| AC-06 (typecheck clean, no dead imports, gated ceremonies untouched) | `npx tsc --noEmit -p .` — I independently re-ran, clean. Grep for all 25 relocated registrar names in `app.ts` — I independently re-ran, zero matches. Grep for the 3 gated-mutation ceremony registrar names (`registerAdminTaxonomyMergeTermRoutes`/`registerAdminStorageMigrateForwardRoutes`/`registerAdminRecoveryRestoreRoutes`) — I independently re-ran, all 3 still present and registered inline, untouched. |

## Critical Invariants

| Invariant | Rule | Enforcement | Test |
|---|---|---|---|
| INV-OPLOCK-LIVE (carried forward from `TM-adr041-043-044-045-audit-001` Finding 3) | Recovery status's `operationInFlight` field must reflect the REAL held state of `core/operation-lock`, not a stubbed/cached value — this was a real bug found and fixed earlier this session in a similarly "safe-looking" refactor of this exact code | `status.ts` keeps `isOperationInFlight` as a direct module-level import, never routed through the new `StorageRecoveryRouteDeps` Pick | `recovery-routes.test.ts`'s operation-in-flight test — re-run and confirmed by me directly, not just the implementer |
| INV-SEO-PUBLIC-ORDER | The 2 public SEO routes (sitemap, robots) must register before `registerSiteRoutes`'s `/:slug` catch-all, or they become permanently unreachable | `modules/seo.ts`'s `registerRoutes(app)` body registers all 10 routes (8 admin + 2 public) in one call, at the exact position the 2 public routes previously held relative to `registerSiteRoutes` in `app.ts` | `route-class-precedence.unit.test.ts` — re-run and confirmed by me directly |

## Downstream Handoff Notes

- **This is the last slice of the ADR-046 Phase 3 route-registration sweep.** After SPEC-038 through 042, `app.ts` has zero remaining inline domain registrar blocks except the 3 deliberately-excluded gated-mutation ceremonies (taxonomy merge-term, storage migrate-forward, recovery restore) — all 3 reconfirmed present and untouched by this slice's grep check.
- The redispatch history for this specific slice is itself a useful data point: the first dispatch attempt made zero file edits and stalled on a bad self-polling pattern ("I'll stop polling and let the background monitor notify me when the baseline run completes") before running out of turn budget — diagnosed by checking `git log`/`git status` directly (clean, still at the prior slice's tip) rather than trusting the ambiguous "completed" task-notification. Redispatched fresh with an explicit instruction against backgrounding+polling long-running commands; the second attempt completed cleanly with 3 incremental commits.
- Two pre-existing bare `register*` calls outside this spec's scope (`registerContentPostGetRoute`, `registerAdminModuleStatusRoute`) were noted by the implementer but deliberately left untouched — out of scope for SPEC-042, not carried into this outline's file map.
- Per the user's standing "batch audits, don't drip-feed" preference, this slice — like SPEC-036 through 041 before it — has NOT yet gone through `/audit-work`. The full batched audit round across the entire SPEC-036–042 chain remains explicitly deferred until the user asks for it.
