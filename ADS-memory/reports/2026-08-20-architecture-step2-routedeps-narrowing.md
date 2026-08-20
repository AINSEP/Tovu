# Architecture plan step 2 (retry) — `RouteDeps` narrowing in `source-control`/`deployments`

**Date:** 2026-08-20
**Branch:** `general-work`
**Baseline HEAD:** `b6144774` (supersedes this commit — see below)
**Author:** Programmer (Execution)

## Task

`b6144774` closed the `feature-no-express-or-admin-imports` dependency-cruiser rule's 9 violations by
widening its `from` and exempting type-only edges (`dependencyTypesNot: ["type-only"]`). The owner
reviewed that and rejected it: the rule's blindness to `RouteDeps`-typed edges was not the problem —
the coupling it was flagging was. This dispatch's job was the real fix: make `src/features/source-control/`
and `src/features/deployments/` genuinely stop naming `RouteDeps`, then re-tighten the rule.

## The design: a composition-root-bound `exportSiteBound` field

`RouteDeps.runExportSite: ExportEngine<RouteDeps>` is contravariant in its parameter — confirmed
independently by both this dispatch and `b6144774`'s — so it can only ever be assigned to a slot
expecting the FULL `RouteDeps`, never a narrower stand-in. Two call sites
(`commitSiteToSourceControl`, `publishStaticSite`) genuinely need to run a real `exportSite` pass, which
means they genuinely need the full `RouteDeps` bag *somewhere* in the call chain. That fact was real;
the conclusion "so the domain must name `RouteDeps`" was not.

The fix: add one new field to `RouteDeps` itself (`server/routes/types.ts`), bound via closure at both
composition roots (`server/app.ts`'s `createRouteDeps()`, `server/deps.ts`'s `createSqliteRouteDeps()`):

```ts
exportSiteBound: (options: { outputDir: string; clean?: boolean; basePath?: string }) => Promise<ExportReport>;
```

Bound as `(opts) => exportSite({ ...opts, routeDeps })`, where `routeDeps` is the closure-captured
composition-root object. The function takes **no `routeDeps` parameter of its own** — it is already
closed over. Each of the 3 consuming files declares its own tiny, locally-typed copy of this shape
(`ExportSiteBoundFn`, duplicated per file, never imported across features — matching this codebase's
established "duplicate the tiny type" convention already used for `exportSiteLazily`/`OWNER_PATTERN`),
so nothing downstream ever imports `RouteDeps` to describe it.

### Rejected alternative: parameterize `ExportEngine<T>` narrower at the call site

Tried to make `deployment_trigger_export`'s existing `startExportRun`/`ExportEngine<TRouteDeps>`
machinery absorb a narrow type directly, with no new field. Re-derived the variance explicitly:
`ExportEngine<RouteDeps>` (the only real function value that exists) is not assignable to
`ExportEngine<Narrow>` for any proper subtype `Narrow`, because that direction requires `Narrow`
assignable to `RouteDeps` — which a narrower interface never is (missing fields). Same contravariance
fact `b6144774` found for `runExportSite` itself; it also rules out narrowing `ExportEngine` directly at
these 3 call sites. This is why a pre-bound, zero-`routeDeps`-parameter function was necessary rather
than a generic-type trick.

## Owner-required changes to the checkpoint-1 design (all applied)

**1. A real runtime bug in the first draft of the composition-root closure.** `ExportEngine<T>`'s own
options object always carries a `routeDeps` field. The first draft closed with `{ routeDeps, ...opts }`
(closed-over value FIRST) — so a caller who forwards that whole `ExportEngine`-shaped bag into
`exportSiteBound` (rather than destructuring `{outputDir, clean, basePath}` explicitly) would have its
own narrow `routeDeps` key silently overwrite the real one, and the real `exportSite` would receive a
half-populated tool-deps object in place of `RouteDeps`. `tsc` cannot catch this: `exportSiteBound`'s
declared parameter has no `routeDeps` field at all, so an excess one on a non-literal argument passes
silently. Closed twice: composition root now spreads `{ ...opts, routeDeps }` (closed-over value LAST,
always wins), and `deployment_trigger_export`'s own adapter explicitly destructures
`{outputDir, clean, basePath}` rather than forwarding the bag, so the narrow deps never travel at all
even if the root ordering ever regressed. Regression test below.

**2. Field renamed `runSiteExport` → `exportSiteBound`.** `RouteDeps.runExportSite` already exists and
stays (still used by `export-site.ts`'s POST route and `export-run.ts`'s `startExportRun`, both
correctly generic). `runSiteExport`/`runExportSite` differ only by word order — a typo-grade distinction
between two genuinely incompatible call shapes, and per finding 1 the compiler would not have caught a
mix-up. Documented at the field (`routes/types.ts`) exactly why both exist and how they differ.

**3. Tried the real `VendorCredentialSetRepoPort` type import in `publish-agent-tools.ts` before
hand-mirroring it.** `check-architecture.ts`'s module-cycle/SCC metric is explicitly computed on the
**runtime-only** graph (`dependencyTypes` excluding `"type-only"` — see that script's own
`Baseline.moduleCycles` doc, added 2026-08-17 for exactly this reason: a type-only edge is erased at
compile time and cannot deadlock a `require`/ESM load). The file's own header warned against ANY import
from `../vendor-credentials/**`, but that warning was about the VALUE imports an earlier revision made
(`createVendorCredential`/etc.), which closed a real cycle — a type-only import of one interface is a
different, unrelated risk profile. Verified empirically, not assumed: added the import, ran
`check:architecture --list` — 0 module cycles / largest SCC 0, unchanged from baseline. Kept the real
import; no mirror needed. (`VendorCredentialSummaryLike`, a separate, pre-existing local mirror for a
type with no safe real counterpart to import, is unchanged.)

## The 6 coupling sites and what each narrowed to

A 6th site beyond the brief's cited line numbers: `publish-agent-tools.ts`'s `StaticPublishToolDeps
extends RouteDeps` (its own header actively argued "no honest narrower type exists" — the same
file-defends-itself pattern the brief warned about; that argument is now false).

| File | Was | Now |
|---|---|---|
| `source-control/commit-site.ts` | `CommitSiteInput.routeDeps: RouteDeps` | `{sourceControlExportRootDir, idGen, exportSiteBound}` |
| `source-control/tool-registrations.ts` | `SourceControlToolDeps extends RouteDeps` | `{authorize, workspaceId, sourceControlCredentialSetRepo, siteAssistantSecretSealer, sourceControlExportRootDir, idGen, exportSiteBound, gitAdapter?}` |
| `deployments/tool-registrations.ts` | `DeploymentsToolDeps = RouteDeps` | `{authorize, workspaceId, clock, exportOutputRootDir, deploymentsReadRepo, exportSiteBound}` |
| `deployments/static-publish/adapter.ts` | `StaticPublishInput.workspaceId: RouteDeps["workspaceId"]`, `.routeDeps: RouteDeps` | `{workspaceId: string, publishOutputRootDir, idGen, exportSiteBound}` |
| `deployments/publish-agent-tools.ts` (indexed access) | `VendorCredentialReadDepsLike`/`WriteDepsLike` used `RouteDeps["..."]` | Direct port types: `VendorCredentialSetRepoPort` (real import, CHANGE 3), `SecretSealerPort`, `KeyringPort`, plain `clock`/`idGen` |
| `deployments/publish-agent-tools.ts` (6th site) | `StaticPublishToolDeps extends RouteDeps` | `{authorize, workspaceId, clock, idGen, publishCredentialSetRepo, siteAssistantSecretSealer, siteAssistantSecretKeyring, publishExecutionMode, publishHistoryStore, publishCredentialVerificationCache, vendorCredentialSetRepo, publishOutputRootDir, exportSiteBound}` plus existing test-only optionals |

Nothing could not be closed — no single-file carve-out was needed.

`features/deployments/export-run.ts` needed **zero changes**: its own `ExportEngine<TRouteDeps>` was
already generic and never named `RouteDeps` by value or type — it was already the target shape every
other call site is now aimed at. `publish-run.ts` also needed zero changes: it only imports `type
StaticPublishInput` from `adapter.ts` and forwards it opaquely to `publishStaticSite`, so it inherited
the narrower shape automatically once `adapter.ts` changed.

## A real test-fixture gotcha this design introduces (found and fixed, not just documented)

`exportSiteBound` is a closure bound to **one object identity**, at construction time, inside
`createRouteDeps()`/`createSqliteRouteDeps()`. Several existing tests built their fixture via
`{ ...createRouteDeps(), someField: override }` — a spread produces a logically-overridden but
DIFFERENT object; the closure still points at the original. `source-control/__tests__/commit-site.unit.test.ts`'s
"an asset that fails to export blocks the commit" test failed this way: its `createSiteApp` override
(forcing one asset route to 500) was silently invisible to `exportSiteBound`, so the real export
succeeded and the (supposed-to-never-fire) fake git adapter fired. `static-publish/__tests__/adapter.unit.test.ts`
had the identical pattern and would have hit the identical bug had its own equivalent test been
exercised with the pre-fix ordering. Fixed by mutating the object `createRouteDeps()` returns in place
instead of spreading a copy (`deps.createSiteApp = fake`, not `{...deps, createSiteApp: fake}`) —
property reads inside a closure happen at call time against whatever object identity it captured, so an
in-place mutation on that SAME reference is visible; a spread's new identity is not. Documented at
`RouteDeps.exportSiteBound`'s own doc (`routes/types.ts`) as a generalized "TEST GOTCHA" note, and at
each fixture that needed the fix (`commit-site.unit.test.ts`, `adapter.unit.test.ts`,
`publish-run.unit.test.ts`). No production code is affected — production never spreads-and-overrides a
constructed `RouteDeps`; only test fixtures do.

## Regression test for the spread-ordering bug (CHANGE 1)

Added to `deployments/__tests__/integration/tool-registrations.integration.test.ts` (the existing
harness covering `deployment_trigger_export`'s wiring, per instruction — no new test file). It targets
`RouteDeps.exportSiteBound` directly rather than going through the tool handler: calls it with a `const`
options object that itself carries a bogus `routeDeps` key (simulating exactly what an
`ExportEngine`-shaped caller forwards), and asserts the resulting export actually ran using the real,
closed-over `RouteDeps` (non-empty `routes.succeeded`, zero `routes.failed`) rather than the bogus
marker. Verified directly, not just written: temporarily reverted the composition-root spread order to
`{ routeDeps, ...opts }` and re-ran — the test failed with exactly the predicted
`TypeError: Cannot read properties of undefined (reading 'list')` three frames inside the real
`exportSite`, while the sibling `deployment_trigger_export` test (which never forwards `routeDeps`, per
finding 1's second fix) still passed, isolating the failure to the ordering bug specifically. Reverted
back to the fix; all 9 tests in that file pass.

## The concurrent-agent incident

Partway through this dispatch, `adapter.ts` and `.dependency-cruiser.cjs` acquired uncommitted changes I
had not made. Investigation (before touching either file further) found a second agent
(`arch-step2-boundaries`, the one that had landed `b6144774`) had come back from idle with a stale
message still queued and resumed work on the same brief. The coordinator stood it down; nothing from it
was ever committed. `adapter.ts`'s inherited content was reviewed line-by-line as untrusted input
against what I would have written myself — it matched the approved design (including CHANGE 2's naming)
closely enough to keep verbatim, since it predates CHANGE 1/3 but never exercised either failure mode
(no options-bag forwarding, no vendor-credentials import). `publish-agent-tools.ts` also turned out to
have partial inherited edits (missed in the coordinator's first attribution pass) — reviewed the same
way; one comment block was stale (still claimed "Deliberately NO import of any kind... from
`../vendor-credentials/**`" after the file had already gained CHANGE 3's real type-only import) and was
rewritten to describe what actually landed and why it's safe. `.dependency-cruiser.cjs`'s structural
edit (the actual rule change) was correct and kept; its comment referenced names (`runSiteExport`,
`export-run.ts`'s `BoundExportEngine`) that never existed in the final design and was rewritten.
One useful datum: the other agent, working independently and never receiving CHANGE 1 or CHANGE 3,
arrived at the identical core design — a bound function, closed over `RouteDeps` at the composition
root, the same `const routeDeps = {...}; return routeDeps;` self-referencing-closure restructuring — as
this dispatch's own checkpoint-1 proposal. Two independent derivations converging is reasonable evidence
the design was the right shape for this problem.

## Config change

`.dependency-cruiser.cjs`, `feature-no-express-or-admin-imports` rule:
- Removed `dependencyTypesNot: ["type-only"]` — type-only edges are visible again.
- Reverted `from` to `^src/features` (the `assistant`/`widgets`/`export` widening from `b6144774` is
  reverted; `src/assistant`'s own genuine Express route files, e.g. `a2ui-actions-route.ts`, would be
  incorrectly flagged by that widening — recorded as deliberate follow-up scope, not silently dropped).
- Kept `pathNot: ".*/__tests__/.*"` (a contract/integration test constructing a real `createRouteDeps()`
  + throwaway Express app to exercise route/tool wiring end-to-end is legitimate).
- `severity: "error"` kept — production violations verified at 0 under the reverted `from`/`to`.
- Rewrote the rule's comment block to describe the actual fix (see the file itself).

## Testing

- `tsc -p tsconfig.json --noEmit`: 0 errors, project-wide, after every source change.
- Scoped unit/integration tests (`TEST_CONCURRENCY=2`, never the full suite): 139 tests across
  `source-control/__tests__/{commit-site,tool-registrations}.unit.test.ts`,
  `deployments/static-publish/__tests__/{adapter,publish-run}.unit.test.ts`,
  `deployments/__tests__/publish-agent-tools.unit.test.ts`,
  `deployments/__tests__/integration/tool-registrations.integration.test.ts`,
  `assistant/__tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts` — all pass.
  The last two files needed no fixture changes (verified by running before editing anything in them);
  the rest needed the `routeDeps: RouteDeps` → narrow-fields fixture update, and 3 of them additionally
  needed the spread→mutate fix above.
- `check:architecture --list`: 0 module cycles / largest strongly-connected component 0, both before and
  after CHANGE 3's real type import. One pre-existing ratchet warning (propagation cost 12.2→12.22)
  attributable to another concurrent session's uncommitted files, unchanged by this work — confirmed
  present at baseline before any edit in this dispatch.
- `npm run ci:local`: 8/8 PASS (typecheck root, check:boundaries, check:architecture, check:inventory,
  check:src-complexity-drift, complexity/eslint, typecheck admin, admin:build).

## Things in the brief that turned out to need correction

- The brief's line-number citation for `publish-agent-tools.ts` (397-402, indexed-access types) did not
  mention the file's own `StaticPublishToolDeps extends RouteDeps` (a 6th coupling site) — flagged at
  checkpoint 1 and confirmed in scope by the coordinator.
- Nothing else in the brief's facts turned out to be wrong; the contravariance claim, the `export-run.ts`
  generic-shape precedent, the `pathNot` test carve-out, and the `GUARDED_MODULES` warning were all
  confirmed as stated.

## Complete file list

**Source (10):**
- `src/server/routes/types.ts` — authored
- `src/server/app.ts` — authored
- `src/server/deps.ts` — authored
- `src/features/source-control/commit-site.ts` — authored
- `src/features/source-control/tool-registrations.ts` — authored
- `src/features/deployments/tool-registrations.ts` — authored
- `src/features/deployments/static-publish/adapter.ts` — **inherited** from the stood-down concurrent
  agent, reviewed line-by-line against the approved design and kept verbatim (see incident notes above)
- `src/features/deployments/publish-agent-tools.ts` — **inherited** (partial) from the same agent,
  reviewed and one stale comment block rewritten; every other hunk verified and kept

**Test (5):**
- `src/features/source-control/__tests__/commit-site.unit.test.ts` — authored (fixture narrowing +
  spread→mutate fix)
- `src/features/deployments/static-publish/__tests__/adapter.unit.test.ts` — authored (same)
- `src/features/deployments/static-publish/__tests__/publish-run.unit.test.ts` — authored (same)
- `src/features/deployments/__tests__/integration/tool-registrations.integration.test.ts` — authored
  (CHANGE 1 regression test added; no fixture changes needed beyond that)
- (`publish-agent-tools.unit.test.ts` and `assistant/__tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts`
  needed no changes — verified by running before touching them; not listed as changed)

**Config (1):**
- `.dependency-cruiser.cjs` — structural edit **inherited** and verified correct; comment block
  rewritten (authored)

**Docs (2):**
- `ADS-memory/reports/2026-08-20-architecture-step2-routedeps-narrowing.md` — this report (new)
- `ADS-memory/reports/2026-08-19-architecture-step2-boundary-closure.md` — superseding note added at top
