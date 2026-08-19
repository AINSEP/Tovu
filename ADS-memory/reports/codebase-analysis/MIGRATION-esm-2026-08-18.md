# Migration Plan: CommonJS → Native ES Modules

- Agent: CodeBase Analyzer (delegated, session-scoped dispatch)
- Date: 2026-08-18
- Scope: narrow — answers "what would it take to migrate this repo from CJS to ESM", not a full first-time codebase analysis
- Source: this repo's `check:architecture` / `check:boundaries` tooling plus direct source reads. No source files modified, no builds/installs run.

## Coverage Caveat

This migration plan is based on sampled codebase context. Files and modules not included in the analysis sample may contain architectural patterns, dependencies, or constraints not reflected in this plan. Before executing any migration phase, validate the plan against unsampled modules — especially `apps/admin/**` internals (only import-specifiers were grepped, not read in depth — a different, concurrently-live session owns that territory), `packages/*` workspace package build/module config, and the root cause of the `core` module's tool-vs-grep dependency discrepancy (see below).

## Motivation (context, not re-derived here)

A prior session measured the CJS-interop shim (esbuild's `__copyProps`/`__toCommonJS`/`__export` helpers) as costing exactly 2 permanently-dead coverage branches per file, confirmed on 6 files. Native ESM output has no such shim — this ceiling disappears entirely under ESM, not just shrinks.

## 1. Dependency graph reality check

- 990 total `#src/...` cross-module import specifiers repo-wide; **347 (35%) explicitly target a barrel `/index`** file.
- 67 `index.ts` barrels contain re-export lines; of those, **37 are pure barrels** (100% re-export, nothing locally defined) and 29 are mixed. Only 1 of 67 module-root `index.ts` files has no re-export at all.
- `check:boundaries` (dependency-cruiser): 1806 modules, 7945 dependencies, 72 warnings (0 errors) — mostly deep-imports bypassing intended barrels.
- `check:architecture --list`: 885 production files / 49 modules, propagation cost 11.57% (all-import) / 1.75% (runtime-only), **0 module cycles**, 517 deep-import edges bypassing barrels.
- **Smallest closed subgraph, verified two ways (tool + direct grep, they agree):** `origin` (5 files), `http` (5 files), `headless` (2 files), `features/agent-plugins` (6 files), `features/site-glue` (6 files) — **24 files total**, zero outward internal (`#src/`) dependencies, all with real test coverage under the real (non-placeholder) `test` script.
- The tool's 6th reported zero-outward-dep module, `core` (Ca=122, Ce=0 per the tool), was checked and **direct grep disproves it**: `src/core/` genuinely imports from `#src/db/*`, `#src/features/post/index`, `#src/widgets/*`. This is a tool/reality mismatch — do not trust `core`'s Ce=0 without resolving that discrepancy first. Excluded from the verified leaf set.
- Beyond that 24-file leaf set the graph is one connected DAG (no cycles), not a set of independent islands — 35% of edges are barrel-mediated, so most modules are only migratable in dependency order, not independently.

## 2. Failure-mode inventory

Confirmed the specific chain from the session-17 `delete.ts` experiment is real, not a fluke: `src/webhooks/subscriptions.ts:30` defines `WebhookSubscriptionNotFoundError` → `src/webhooks/index.ts:49` re-exports it by name → `delete.ts` imports it from the barrel. That's the single most common shape in this codebase (consumer → barrel → definer), not an edge case: since 37 of 67 barrels are *pure* re-export files, **every** barrel-targeting import into one of those 37 necessarily has this shape. Not every one of the 347 barrel imports was individually recompiled to confirm (out of budget/scope) — the structural proxy is strong but not exhaustive.

**Directional nuance that changes the plan:** the failure only fires when an already-ESM file statically imports a named export from a file that is still CJS and re-exports (rather than defines) that name — that's what breaks `cjs-module-lexer`'s static analysis. It does **not** fire in reverse — a CJS file `require()`-ing an already-ESM module works fine under Node's stable synchronous `require(esm)` (available since Node 24), because that direction resolves real ESM bindings, not a lexer heuristic. Wave ordering therefore isn't arbitrary — it only works bottom-up.

## 3. Two options

**(a) Big-bang, one PR:** ~1270+ non-test `.ts` files under `src/`+`apps/`, root `package.json` type flip, every relative import needs explicit extensions (ESM requires them, CJS doesn't), build/test tooling (tsx, node's native test runner, 3 native modules — see Docker build-traps memory) all need simultaneous compatibility. Main risk: the re-export-chain failure mode disappears as a *class* of bug (nothing stays CJS to be lexed), but the whole repo compiles/runs atomically or it doesn't — one bad dynamic `require()`/`__dirname` usage/circular-eval-order difference anywhere blocks the whole cutover with a huge "which of 1270 files" diagnosis surface.

**(b) Boundary-by-boundary waves:** small blast radius per wave (wave 1 = the 24-file verified leaf set). Main risk: naive wave ordering (pick any module folder, convert it) hits the failure mode at literally the first boundary crossing where the converted file imports a still-CJS barrel by name — this is what killed the `delete.ts` experiment. It only works if waves are strictly bottom-up by the real dependency graph, never top-down or arbitrary.

## 4. Recommendation: (b), strictly bottom-up, starting with the verified 24-file leaf set

Reasoning: a 1270-file, 35%-barrel-mediated graph makes atomic cutover high-risk with no partial-rollback story. The directional nature of the failure mode means a *correctly ordered* wave plan sidesteps the failure entirely in the migrated direction — that's not true of big-bang (which just avoids it by brute force) or of an undirected wave plan (which walks straight into it). There's already a real, small, test-covered starting point sitting in the repo today, so wave 1 needs no speculative seam-finding.

**One blocking catch to resolve before this is executable:** the bottom-up strategy's safety depends on Node's *stable* synchronous `require(esm)`, confirmed on Node 24. But root `package.json` `engines` currently floors at `>=20.6.0` — a wide, weaker floor. If this package needs to keep running on Node 20–23 for any consumer, the "CJS-requiring-ESM is safe" half of the argument doesn't hold for them, and Phase 0 of any real migration plan must first decide whether to raise the `engines` floor to whatever version guarantees stable `require(esm)`, or accept the risk on older runtimes.

## Sampling Notice

Files sampled: repo-wide grep for `#src/...` import specifiers and barrel `index.ts` re-export lines (exhaustive, not sampled); `check:architecture --list` and `check:boundaries` tool output; direct source reads of `src/webhooks/subscriptions.ts`, `src/webhooks/index.ts`, `delete.ts`, and the 24-file verified leaf set plus `src/core/` for the discrepancy check.

Files excluded: `apps/admin/**` internals beyond import-specifier greps (different, concurrently-live session owns this territory — read-only, not analyzed in depth), `packages/*` workspace package build/module config, individual recompilation of all 347 barrel imports.

Confidence levels by finding category:
- Dependency graph / barrel counts: High (exhaustive grep, not sampled)
- Confirmed failure chain (`delete.ts` case): High
- Failure-mode prevalence generalizing to all 347 barrel imports: Medium (structural proxy, not individually recompiled)
- Closed-subgraph claim: Medium — specifically because of the `core` tool/grep disagreement (explicitly excluded, not glossed over)
- Architecture structure: High
- Dependency direction: High
- Test coverage signal: Medium (leaf-set files confirmed covered; not verified repo-wide)
- Security surface: Not assessed (out of scope for this pass)
- Code quality indicators: Not assessed (out of scope for this pass)

Note: Confidence reflects sample coverage, not model certainty. A High-confidence finding means the sample was broad enough to support the conclusion. A Low/Medium-confidence finding is a hypothesis requiring human verification.

## Downstream requirement

Per AI-Dev-Shop's own governing rule: this deserves its own Spec/ADR pass before implementation — it touches module resolution repo-wide. Do not start editing files toward ESM before that exists.
