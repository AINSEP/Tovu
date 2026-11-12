## Test quality (static, script-only)

Script: `scripts/test-quality.mjs` (TypeScript-AST scan of every git-tracked `*.test.*` / `*.spec.*` file in both repos, excluding
`node_modules`, `dist`, and Jini's `AI-Dev-Shop/`, `ADS-memory/`, `foundry/`). No test file was read or judged by the model;
every number below is script output. Per-file results: `test-quality.tsv`; per-area totals: `test-quality-by-area.tsv`.

What each column counts (heuristics, stated in the script header):

- `tests`: `test()`/`it()` calls, including `.each`, `.skip`, `.only` and `.concurrent` variants and `t.test` subtests. Hooks (`test.before`, `test.after`, etc.) are excluded.
- `no_assert`: tests whose callback has no assertion call (`expect…`, `assert…`, Node assert functions), no helper named `assert*`/`expect*`/`verify*`/`check*`/`should*`/`ensure*`/`must*`, and no call to a function in the same file that itself asserts, directly or transitively.
  - Known false positives: tests that delegate to an imported helper with a non-assert name, and tests that rely on an implicit throw.
- `weak_only`: tests whose every assertion is a truthiness, existence or no-throw check (`ok(x)`, `assert(x)`, `toBeTruthy`, `toBeFalsy`, `toBeDefined`, `not.toBeUndefined`, `not.toBeNull`, `not.toThrow`, `doesNotThrow`, `doesNotReject`).
- `snapshot_only`: tests whose every assertion is a snapshot.
- `indirect`: tests with no direct assertion but with an asserting helper. These are not counted in `no_assert`.
- `mocks_uut`: `vi.mock` / `vi.doMock` / `jest.mock` / `mock.module` calls on a relative specifier whose basename equals the test file's subject name (the test basename with `.test` and suffixes like `.unit` or `.integration` stripped).
- `skip` / `only` / `todo`: `.skip`/`.skipIf`/`xit`/`xdescribe`/`{ skip }`/`t.skip()`, `.only`/`fit`/`{ only }`, and `.todo`/`{ todo }`/`t.todo()`.

TOTALS_TQ

Notes:

- `mocks_uut` = 0 in both repos under this heuristic, i.e. no test mocks a module whose name equals the unit under test. The heuristic does not catch mocks of the unit through a barrel or index re-export.
- `only` = 0 in both repos.
- Area breakdown (`test-quality-by-area.tsv`): `no_assert` is highest in `apps/website` (24), `packages/provider-plugins` (5) and `packages/ui` (4). `weak_only` is highest in `apps/website` (458), `packages/ui` (158), `apps/admin` (72) and `apps/desktop` (34). `skip` is highest in `apps/website` (52), `packages/platform` (24), `packages/agent-runtime` (16) and `apps/desktop` (16).

### `npm run check:test-safety` (Tovu)

- Ran against `origin/main`: **FAIL**, exit 1. It is a diff check, so it only looks at test files this branch changed relative to its merge-base with main. Two files hold more message-less asserts than their merge-base copy:
  - `apps/website/src/assistant/__tests__/ask-choice-custom-answer.test.ts`: 0 → 1
  - `apps/website/src/features/plugin-runtime/__tests__/unit/plugins-tool-registrations.unit.test.ts`: 2 → 4
- I also ran the same lint config over the whole tree with `scripts/test-safety-all.mjs`, an ESLint API run with no diff gating. It scanned **3,230** test files and found **1,365** files with **4,722** message-less `assert` / `assert.ok` / `assert.strict` calls. Per file: `test-safety-all.tsv`. Raw: `raw/tovu-check-test-safety.txt`, `raw/tovu-test-safety-all.txt`.

### `npm run quality:semgrep:test` (Tovu): did not run

Exit 127: "Semgrep is not installed". Semgrep is a Python CLI, not an npm package, so it cannot be installed under the brief's `npx --yes <tool>@<version>` rule. Raw: `raw/tovu-quality-semgrep-test.txt`.

## Mutation pilot (StrykerJS)

- **Slice:** Jini `packages/protocol`, the only slice run. It has 12 source files (1,105 lines, 5 of them with runtime code that Stryker could mutate) and 13 test files with 205 vitest tests. Its line, statement and function coverage is 100%.
- **Tool:** StrykerJS **9.6.1** with `@stryker-mutator/vitest-runner` 9.6.1, vitest 2.1.9 (the version Jini uses), and typescript 5.9.3 (Jini's version, needed by Stryker's tsconfig preprocessor). All were installed via `npx --yes -p …` into the npx cache, from a neutral cwd.
- **Config:** `stryker/stryker.protocol.config.json`: default mutators, `coverageAnalysis: perTest`, concurrency 2.
- **Setup issues:** two attempts failed before the run (`raw/stryker-protocol-attempt1.txt`, `raw/stryker-protocol-attempt2.txt`). When npx runs inside the Jini workspace it skips installing `typescript`/`vitest` into its cache because they already exist in the workspace. Stryker, running from the cache, then cannot resolve `typescript`. Installing from `/tmp` and running the cached `stryker` binary from the package dir fixed it.
- **Result:** 308 mutants. Done in **1 min 59 s** (120 s wall), well under the 40-min step cap.

| file | score % | killed | timeout | survived | no coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| **all** | **98.05** (covered 98.37) | 302 | 0 | 5 | 1 |
| delegated-result.ts | 95.65 | 88 | 0 | 4 | 0 |
| errors.ts | 98.41 | 62 | 0 | 0 | 1 |
| registry.ts | 100.00 | 99 | 0 | 0 | 0 |
| run-context.ts | 97.96 | 48 | 0 | 1 | 0 |
| run.ts | 100.00 | 5 | 0 | 0 | 0 |

Stryker also warned that 97 of the 308 mutants (31%) were static mutants, estimated to take 81% of the run time.

**Surviving and no-coverage mutants.** The brief asked for 10 example survivors; only 6 mutants were not killed, so all 6 are listed (also in `stryker/survivors-protocol.tsv`; full report `stryker/mutation-protocol.json`):

| file:line:col | mutator | status | replacement |
| --- | --- | --- | --- |
| src/delegated-result.ts:13:10 | ConditionalExpression | Survived | `true` |
| src/delegated-result.ts:17:52 | ConditionalExpression | Survived | `false` |
| src/delegated-result.ts:28:7 | ConditionalExpression | Survived | `false` |
| src/delegated-result.ts:36:11 | BlockStatement | Survived | `{}` |
| src/run-context.ts:56:11 | BlockStatement | Survived | `{}` (a `catch { return undefined; }` emptied) |
| src/errors.ts:91:23 | StringLiteral | NoCoverage | `""` (default `fallbackMessage`) |

So 100% line coverage in this package still leaves 6 mutants that no test kills. Four of them are in `delegated-result.ts` conditionals.
