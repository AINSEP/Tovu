# Coverage: Tovu development/scripts (PARTIAL)

Branch `test/coverage-tovu-dev-scripts` (from `origin/integ/wave-b`). Runner: `node --test --test-concurrency=1` with tsx, Node 24.22.3.
Baseline (unmodified tree): 60 files loaded in lcov, 2110 uncovered lines. After: 61 files, 2001 uncovered lines.
The failing-test count is identical before and after (43 `✖` lines in the dot reporter, pre-existing; e.g. `backfill-trashed-items`, `backfill-slug-collision-defaults`, `convert-legacy-doc-pages-to-html`, `admin-vite-config-port`, the admin coverage suite policy floors). None come from this work.

## Per file (lines / branches / functions, before -> after)
| file | before | after |
|---|---|---|
| check-size-drift.ts | not loaded by any test | 100 / 98.9 / 96.2 |
| check-src-complexity-drift.ts | 86.5 / 61.5 / 87.0 | 98.4 / 100 / 95.8 |
| check-route-coverage-diff.ts | 90.7 / 92.3 / 57.1 | 100 / 97.8 / 100 |
| check-test-safety-diff.ts | 83.7 / 85.7 / 75.0 | 100 / 93.1 / 100 |
| check-governance-adr-scope-drift.ts | 92.5 / 96.7 / 94.7 | 100 / 97.0 / 100 |
| check-theme-replaced-elements.ts | 94.9 / 95.3 / 82.4 | 100 / 95.4 / 100 |

None reach the full 100% on every metric, and some branches are below the 99% floor. The residue is the `import.meta.url === pathToFileURL(argv[1])` entry guard, `process.argv`/`process.exit` default-parameter branches, and in check-src-complexity-drift the CLI-entry lines. Subprocess tests already run those CLIs but node's coverage does not credit child processes.

## Exceptions (not done, with reason)
- check-no-linked-jini.mjs: top-level script (reads cwd, `process.exit`), no exports. It is CLI entry glue; existing tests exercise it via subprocess.
- Not attempted for budget/time: check-coverage-integrity.ts (98.7% already), coverage-changed.ts, check-hardwiring.mjs, measure-site-memory.mjs, dev.mjs, dev-desktop.mjs, dev-lite.mjs, start.mjs, theme-tool.ts, mutation-*.mjs, stage-selected-agent-plugin-assets.ts, emit-dist-package-json.mjs, write-path-inventory.ts, test-rigor-inventory.mjs and others in the baseline list. dev*.mjs/start.mjs are launcher glue.
- Files the baseline does not load at all (about 40, e.g. check-architecture.ts, check-outbox-bridge.ts, check-openapi-contract.ts, check-area-coverage-floor.ts, extraction-dossier.mjs) still need to be assessed. Some are tested by subprocess only.

## Seams added (optional ports, no behaviour change)
- check-size-drift.ts: exported readViolations, readDebt, checkDebtHistory, gitAtBase, sourceMatchesBase. `checkDebtHistory(current, measured, {env, git, sameAsBase})`, `main(_, {debtRaw, find, history})`.
- check-src-complexity-drift.ts: exported readViolations, readDebt, checkDebtHistory (`{env, show}`), `main({debtRaw, find, history})`.
- check-route-coverage-diff.ts: exported changedRouteFiles(baseRef, git) and `main({argv, git, load, exit})`. The failure path now `return`s after `exit(1)`.
- check-test-safety-diff.ts: exported mergeBaseOf(base, runGit) and `main({argv, runGit, log, error, exit})`.
- check-governance-adr-scope-drift.ts: exported `main({repoRoot, indexPath, exit})`.
- check-theme-replaced-elements.ts: exported `main({scanDir, exit})`.

## Bugs / findings (nothing fixed)
- BUG (repo state, not a test bug): the real `check:size` gate is RED on this branch. `main()` against the real tree reports 12 worsened entries and 2 stale debt entries versus `size-debt.json`, for example `apps/website/src/server/runtime/composition/deps.ts` max-lines 1948 vs baseline 1926, `use-page-editor.hooks.ts` 682 vs 681, and stale `publish-trust-auth.ts:233 requirePublishTrust#1...` and `peer-transport.ts:901`. My real-tree test therefore asserts exit code mirrors the printed drift rather than requiring green (`check-size-drift.test.ts`, last-but-one test).
- Baseline test failures listed above are pre-existing; they were not investigated.

## Commits
a9a6c269 check-size-drift; 37c5a0b5 check-src-complexity-drift; plus route/test-safety diff, governance-adr and theme-replaced-elements commits on the same branch (`git log origin/test/coverage-tovu-dev-scripts`).
