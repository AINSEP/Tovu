# G-TESTS sheet: the Q5 test ratchet (1 setup sheet + 5 sub-lanes)

Read `COMMON.md` first, and GAPS §4.3 (decisions 1–4 are kept as written: who owns a fake, which `/testing` entries exist, what moves to `packages/integration-tests`, the per-owner ratchet). Load the repo skill `.claude/skills/honest-testing/SKILL.md` before any edit. This sheet re-measures and makes the sub-lanes dispatchable.

## Re-measure (merged state; `census.mjs --tests`, files `census/merged/CENSUS-test-sites.tsv`)
- **279 test files** import a non-base `@jini-ai/*` package outside `/testing` and `/conformance` (GAPS said ~340 at an older base; terra alone is 288).
- By owner: daemon 44, admin 42, integrations 35, provider-plugins 31, chat 24, user-management 20, commerce 17, cms 12, server 12, agent-plugins 10, ui 9, mcp 4, cms-forms 3, diagnostics 3, cli 2, devops 2, sidecar 2, and 1 each in agent-runtime, db, memory, plugins, registry, search, vibecoding. (`server` and `cli` are presets: their tests may import anything; they are counted but need no change.)
- **`vi.mock` of another package:** 34 files mock some `@jini-ai/*` module (core included); of the non-base targets: `@jini-ai/platform/http/guarded` 21 (all in integrations), `@jini-ai/platform` 3, `platform/command` 2, `platform/process` 2, `integrations/media-providers/catalog` 2, `cms/forms` 1. (GAPS counted 62 files before C-ORIGIN-PORT removed the `core/contracts/server` mocks.)
- Not measured: tests that reach another package by a relative path (`../../../<pkg>/src`), by `require.resolve`, or by reading source text. Each sub-lane runs `rg -n "\.\./\.\./\.\./[a-z-]+/src|readFileSync\(.*packages/" packages/<owner>/src -g '**/__tests__/**'` and reports the hits.

## G-TESTS-0: setup (one run, ~70k; everything else needs it)
```
NEW packages/integration-tests/{package.json ("private": true, name "@jini-ai/integration-tests"), tsconfig.json, vitest.config.ts, src/.gitkeep}
NEW packages/core/src/contracts/runtime/testing.ts   -> fakeFileLock(), fakeAtomicWriter(), fakeProcessControl(), fakeHttpFetch(), fakeGuardedHttp({ routes })
NEW packages/ui/src/react/testing.tsx (moved from src/react/__tests__/fake-ui-kit.tsx) ; packages/admin/src/react/testing.tsx (moved fake-admin-kit: locate it with rg -l "fakeAdminKit" packages/admin/src)
NEW scripts/injection-test-debt.json (per-owner counts from the census) + the gate turning the advisory into a per-owner ratchet (read scripts/lib/injection-gate.ts `advisoryTestEdges` first)
```
- Copy the vitest config family from a package that has both node and jsdom projects (a root-level `npx vitest` has no jsdom: Jini standing rule). `packages/integration-tests` may import anything (DESIGN B6); the gate must also refuse any package importing **it**.
- Each fake implements the **port type** from core and records calls; `fakeAtomicWriter` writes into a `Map` and honours `createParent`/`mode` as recorded options only. Core fakes are pure (no `node:`): `pnpm guard` L6 must pass.
- Moving a fake to a `/testing` entry is a move + delete: repoint its current importers in the same commit; add the `exports` + `jini.entries` lines (coordinator for `core`).
- Tests for the fakes first: each fake passes the port's conformance checks where a suite exists, and a "records the arguments it was given, in order" test.
- Coordinator: `pnpm-workspace.yaml` (if packages are listed explicitly), CI job for the new workspace, `scripts/injection-test-debt.json` baseline.

## Sub-lanes (file-disjoint by owner package; each ≤ one run)
| Lane | Owners | Files | After | Estimate |
|---|---|---|---|---|
| T0 | chat (interim: `ui-kit-render-support.tsx` binds `fakeUiKit` from `@jini-ai/ui/react/testing`) | 24, only the support file is edited | G-TESTS-0; superseded if C-CHAT-DEPS S4/S5 landed | 10k |
| T1 | daemon (44), http-kit | 44+ | R7, R8 (their sheets already convert the tests of files they touch: re-count first, expect far fewer) | 120k |
| T2 | integrations (35, incl. the 21 `vi.mock`), agent-plugins (10), mcp (4), sidecar (2), plugins, devops, registry, memory, diagnostics | ~60 | R11 | 130k (split integrations into its own run if the count is still ≥ 30) |
| T3 | admin (42), user-management (20), ui (9) | ~71 | R1c, R2, R3 | 120k (split admin/um if ≥ 60 remain) |
| T4 | provider-plugins (31), commerce (17), cms (12), cms-forms (3), agent-runtime, db, search, vibecoding | ~66 | R12, R6/R9, R10 | 110k |

## Procedure for every file (the same in all sub-lanes)
1. Classify: **(a)** the subject is this package and the other package is a collaborator → replace the collaborator by a fake of the port (from this package's `__tests__/fakes/` for a one-consumer port, from a `/testing` entry otherwise). **(b)** the subject is two real packages together (repo contracts over a real DB, real kit rendering, driver × rendered handles, package-surface tests) → `git mv` to `packages/integration-tests/src/<owner>/`, fix imports, no assertion edits. **(c)** the import is only a type or a constant now available from core → repoint.
2. `vi.mock('@jini-ai/…')` is deleted in every class; the mocked behaviour is provided by a fake passed through the production argument. If the production code has no argument to pass it through, the R lane for that file has not landed: **leave the file, list it**.
3. Report per package: test files and test cases before/after (`vitest run --reporter=json`, count `numTotalTests`), cases moved to integration-tests, cases left. The sum must not go down. No `toBe` → `toBeDefined`, no `.skip`, no deleted assertion.
4. When an owner reaches zero, set its count in `scripts/injection-test-debt.json` to 0 (coordinator line) and remove the target from the owner's `devDependencies` (keep `/testing`-only targets).

## A characterization test must be able to fail
For class (a) conversions, pick one assertion per converted file and show it fails when the fake returns the wrong thing (one-line mutation in the fake, run, revert); record the file and the mutation in the report. A converted test that cannot fail is reported, not kept silently.

## STOP
- Class (b) files exceed 40% of a package's tests (the package's own coverage would collapse: owner decision OD-6 before moving them).
- A fake would need to import the implementation it fakes.
