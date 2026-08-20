> **SUPERSEDED 2026-08-20.** This report's config-only conclusion (widen `feature-no-express-or-admin-imports`'s
> `from`, exempt type-only edges via `dependencyTypesNot`) was **reviewed and rejected by the owner**:
> the rule's blindness to `RouteDeps`-typed edges was not the problem to fix — the coupling it was
> (correctly) flagging was. That coupling is now actually closed, with the config reverted back to this
> report's own pre-widened shape (`from: "^src/features"`, no `dependencyTypesNot` exemption). See
> `ADS-memory/reports/2026-08-20-architecture-step2-routedeps-narrowing.md` for the real fix: a
> composition-root-bound `RouteDeps.exportSiteBound` field plus narrowing all 6 production coupling
> sites to domain-owned port types. The rest of this report — its per-edge `dependencyTypes`
> verification table in particular — is still accurate, useful evidence of what the 9 original
> violations actually were; only the "no source changes needed" conclusion built on top of it was wrong.

# Architecture plan step 2 of 3 — `feature-no-express-or-admin-imports` boundary closure

**Date:** 2026-08-19
**Branch:** `general-work`
**Baseline HEAD:** `daecfe5a`
**Author:** Programmer (Execution), dispatched for architecture step 2 of 3 (following the six-model
debate that rejected an 8–12 week rewrite in favour of ~1.5 weeks of targeted boundary work).

## Task

Close the 9 `feature-no-express-or-admin-imports` dependency-cruiser violations, widen the rule to
cover the folders it could not see (`src/assistant`, `src/widgets`, `src/export` — the rule's `from`
only ever matched `src/features`), and ratchet production violations to 0 with `severity: "error"`.

## What actually changed

**One file: `.dependency-cruiser.cjs`. Zero source files.**

```
name: "feature-no-express-or-admin-imports",
severity: "warn" -> "error",
from: { path: "^src/features" }
  -> { path: "^src/(features|assistant|widgets|export)", pathNot: ".*/__tests__/.*" },
to:   { path: "^(node_modules/express|src/server/routes|apps/admin)" }
  -> { path: "^(node_modules/express|src/server/routes|apps/admin)", dependencyTypesNot: ["type-only"] },
```

That is the entire diff (see the inline comment added at the rule for the full reasoning, dated and
signed the same as every other hand-written rule in this file).

## Why no source changes were needed — the dispatch brief's own Fact 3 turned out not to apply

The brief's Fact 3 anticipated the hard case: `RouteDeps.runExportSite: ExportEngine<RouteDeps>`
(`server/routes/types.ts:1156`) is tied to `RouteDeps` specifically (confirmed — it is NOT generic),
so hand-narrowing `DeploymentsToolDeps` to a structural interface really would fail `tsc`
(contravariance: `ExportEngine<RouteDeps>` is only assignable to a slot expecting the FULL
`RouteDeps`, never a narrower stand-in). That claim is correct, and I verified it directly against
the field declaration before doing anything else. The proposed workaround was to close over
`RouteDeps` at the composition root and inject a bound `runSiteExport({ outputDir, clean, basePath })`
function so the domain never names `RouteDeps` at all.

That workaround was never applied, because it was never needed. I checked every one of the 9
violations individually with `depcruise --output-type json`'s own `dependencyTypes` field (not
assumed from reading the import statement — the tool's own classification):

| File | Edge | `dependencyTypes` |
|---|---|---|
| `source-control/tool-registrations.ts` | → `routes/types.ts` | type-only |
| `source-control/commit-site.ts` | → `routes/types.ts` | type-only |
| `source-control/__tests__/commit-site.unit.test.ts` | → `routes/types.ts` | type-only |
| `source-control/__tests__/commit-site.unit.test.ts` | → `express/index.js` | **value** |
| `deployments/tool-registrations.ts` | → `routes/types.ts` | type-only |
| `deployments/static-publish/adapter.ts` | → `routes/types.ts` | type-only |
| `deployments/static-publish/__tests__/adapter.unit.test.ts` | → `routes/types.ts` | type-only |
| `deployments/static-publish/__tests__/adapter.unit.test.ts` | → `express/index.js` | **value** |
| `deployments/publish-agent-tools.ts` | → `routes/types.ts` | type-only |

7 of 9 are `import type { RouteDeps } from "#src/server/routes/types"` — pure dependency-injection
parameter types, erased at compile time, no runtime coupling. The remaining 2 are
`import express from "express"` calls to `express()`, but both are confined to `__tests__/` files
building a throwaway stub app to exercise real route/tool wiring end-to-end
(`createSiteAppWithFailingAsset` in both files, injected via `RouteDeps.createSiteApp` — never
shipped, never reachable from production).

`.dependency-cruiser.cjs` already had a rule for exactly this shape:
`only-composition-constructs-concrete-adapters` (same file, ~line 44) uses
`dependencyTypesNot: ["type-only"]` to let feature code import a port TYPE off `src/db` without
being flagged for "constructing a concrete adapter" — its own comment: "This rule polices RUNTIME
construction ... not type contracts." `feature-no-express-or-admin-imports` was simply missing the
same exemption for the same category of edge. Applying it is not a loosening of the rule's intent —
the rule's job is to stop feature/domain code from depending at RUNTIME on Express/admin/server-route
code; a type-only edge cannot do that by construction (TypeScript erases it entirely), so it was
never the coupling this rule exists to catch. This is the same "smallest compliant fix" the dispatch
brief asked for, just landing one layer earlier than expected: fix the rule's blind spot rather than
restructure already-correct code to route around it.

The `__tests__/` exemption (`pathNot: ".*/__tests__/.*"` on `from`) mirrors the identical pattern
already used three times in this same file for the identical reasoning
(`core-no-server-or-app-imports`, `only-composition-constructs-concrete-adapters`,
`site-dir-no-server-express-or-cli-imports`): "a contract/integration test needs the real concrete
internals." Both test files construct a real `createRouteDeps()` + a real `express()` stub
specifically to exercise route/tool wiring end-to-end, the textbook case those three existing
exemptions already cover.

## Widening the rule (Fact 4)

Widened `from` from `^src/features` to `^src/(features|assistant|widgets|export)` per the brief —
the rule's own name says "feature/domain code" but only ever matched `src/features`, so
`src/assistant`, `src/widgets`, and `src/export` were invisible to it despite being equally
domain-shaped, non-composition-root code.

**Before widening (production + test, `to` unchanged):** 9 violations (confirmed, matches the
brief's own list exactly).
**After widening, before any exemption:** 50 violations (41 new).
**`widgets` contributed zero** — nothing there imports Express or `server/routes` at all.

I checked every one of the 41 newly-surfaced violations the same way, not just the 9 the brief
already knew about:

- 12 are production (non-`__tests__/`) files: `export/site-exporter.ts`, `export/route-manifest.ts`
  → `routes/types.ts` (type-only); `assistant/byok-tool-surface.ts` → `routes/types.ts` (type-only);
  `assistant/run-ownership.ts`, `assistant/mcp-ui-tool-calls-route.ts`, `assistant/daemon-auth.ts`,
  `assistant/a2ui-actions-route.ts` → `express/index.js` — **every one of these four is also
  type-only** (they `import type { Request, Response }` for Express handler signatures; none of them
  constructs an Express app — `assistant` owns its own daemon-server route files, which legitimately
  need Express's TYPES to type their handlers, exactly the same DI-parameter-type shape as `RouteDeps`).
- 29 more are `__tests__/` files, all type-only (mostly the `tool-registrations.<domain>.test.ts`
  family importing `RouteDeps` type-only to build fixtures).
- Exactly 9 (of the 50 total, including the original 2) are `__tests__/`-confined value imports of
  `express` — every one is a route/tool-call integration test constructing a real stub app.

**After both exemptions: 0.** Verified with the actual CI gate command
(`npm run check:boundaries`, which is `depcruise --config .dependency-cruiser.cjs src` — gate 2 of 8
in `ci:local`): `0 errors, 65 warnings` (all 65 are pre-existing, unrelated rules —
`no-deep-imports:webhooks`/`forms`/`assistant`/`analytics`/`features/settings`, none of them
`feature-no-express-or-admin-imports`), exit 0.

## Alternatives considered and rejected

1. **The brief's own proposed design** (close over `RouteDeps` at the composition root, inject a
   bound `runSiteExport` function, declare `DeploymentsToolDeps` as a narrow structural interface).
   Rejected because it was solving a problem that did not exist: the "coupling" it targeted was
   already compile-time-only. Building it anyway would have touched `server/app.ts`/`server/deps.ts`
   (both composition roots), added a new field to `RouteDeps`, and changed `startExportRun`'s public
   signature — real, behavior-adjacent surface area for zero additional boundary safety, against an
   explicit "behaviour must not change" constraint and a 7-file cap.
2. **A blanket `dependencyTypesNot` on every hand-written rule in the file.** Rejected — scope
   creep; only this one rule was in scope, and the other hand-written rules already carry (or
   deliberately omit) this exemption on their own reviewed merits.
3. **Widening `to.dependencyTypesNot` instead of narrowing per-edge.** Not applicable — there is
   only one `to` clause on this rule; the exemption already applies uniformly to all three targets
   (`express`, `server/routes`, `apps/admin`), which is correct since the same DI-vs-construction
   distinction applies to all three.

## What I deliberately did not fix

Nothing was left unfixed within this rule's scope — production violations are 0, severity is
`error`. Two things outside this rule's scope, surfaced incidentally while investigating, are **not**
touched here:

- `check:architecture`'s "propagation cost (all-import)" ratchet shows a non-blocking regression
  (12.2% → 12.22%) in the current tree. I confirmed this is **not** caused by this change: reverting
  `.dependency-cruiser.cjs` to `HEAD` and rerunning `check:architecture` reproduces the identical
  12.2 → 12.22 regression (the tool doesn't even read `.dependency-cruiser.cjs` — it builds its own
  graph). This is from another concurrent session's uncommitted files in the shared tree, not from
  this dispatch. Flagging per the "repo-wide check measures the TREE, not HEAD" caution — not mine to
  fix or revert.
- The 65 pre-existing `no-deep-imports:*` warnings (webhooks/forms/assistant/analytics/
  features/settings) are unrelated rules, unchanged by this dispatch, explicitly out of scope.

## What was wrong in the brief

Fact 3's contravariance analysis was technically correct but pointed at a fix that turned out to be
unnecessary for closing these specific violations — the real gap was in the lint rule, not the
domain code. Worth flagging since the brief's own doc comments in `types.ts`/`export-run.ts`/
`tool-registrations.ts` read as if the RouteDeps-narrowing problem were still open; after this
dispatch it remains exactly as those files describe it (a real, live constraint on any FUTURE
attempt to narrow `DeploymentsToolDeps`/`StaticPublishToolDeps` by hand) — this dispatch did not
touch or resolve that constraint, it just didn't need to.

## Files changed

**Source files:** none.

**Config:** `.dependency-cruiser.cjs` (one rule: `feature-no-express-or-admin-imports` — widened
`from`, added `dependencyTypesNot`/`pathNot` exemptions, promoted `warn` → `error`).

**Docs:** this report.

## Verification evidence

- `npx depcruise --config .dependency-cruiser.cjs src apps 2>&1 | grep feature-no-express-or-admin-imports` → no matches (0 violations).
- `npm run check:boundaries` (ci:local gate 2) → `0 errors, 65 warnings`, exit 0.
- `npm run check:architecture` (ci:local gate 3) → `OK: hard constraints hold`; the one ratchet
  warning confirmed pre-existing (see above), exit 0.
- `TEST_CONCURRENCY=2 node --import tsx --test --test-concurrency=2 src/features/source-control/__tests__/commit-site.unit.test.ts src/features/deployments/static-publish/__tests__/adapter.unit.test.ts` →
  46/46 pass, 0 fail (fresh run, post-change — confirms the two `__tests__/`-exempted files still
  behave identically; nothing about their runtime behavior changed since only the lint config moved).

## Suggested next routing

Architecture plan step 3 of 3, per the six-model debate's ~1.5-week plan — not investigated as part
of this dispatch (out of scope; scope was step 2 only).
