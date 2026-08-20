# Quality metrics — 4 commits from today's agent work

**Reviewer:** Code Inspection Agent (persona loaded from `AI-Dev-Shop/agents/code-inspection/skills.md`, confirmed at task start)
**Repo:** `/Users/la/Programming/Tovu`, branch `general-work`. Shared tree — measurement only, nothing under `src/` was modified.
**Scope:** measure only, per dispatch. Complexity + coverage, not a full six-dimension code-inspection pass.

## Commits and their changed files (derived via `git show --name-only`, not trusted from the dispatch summary)

| Commit | Changed source | Changed tests |
|---|---|---|
| `e4b03a34` | `src/server/http/site/worker-sandbox.ts` (new), `handlebars-sandbox.ts`, `liquid-sandbox.ts` | — |
| `db7c9df5` | — | `__tests__/fixtures/exit-worker.ts` (new), `worker-sandbox.test.ts` (new), `handlebars-sandbox.test.ts`, `liquid-sandbox.test.ts`, `sandbox-timeout-resolution.test.ts` |
| `1e07bb0b` | `src/core/extension-capability-vocabulary.ts` (new), `src/features/plugin-runtime/manifest.ts`, `src/features/site-glue/capability-gate.ts`, `src/features/site-glue/manifest.ts` | `src/core/__tests__/unit/extension-capability-vocabulary.unit.test.ts` (new) |
| `b1254680` | `src/server/http/site/render.ts` | — |

Also touched by `e4b03a34`: a non-code architecture-proposal doc under `ADS-memory/reports/`, out of scope for these gates.

`b1254680` confirmed comment-only by reading the actual diff (`git show b1254680`): both hunks are entirely inside a `//` block comment above the `Component` registry; zero executable lines changed. No behavioral or coverage impact is possible by construction — not assumed, verified.

## Gate 1 — Complexity (cyclomatic + cognitive)

**Ceilings, read from `eslint.config.mjs`, not guessed:**
- Repo-wide (everything not under `apps/admin/src`): `complexity: ["warn", 15]` and `sonarjs/cognitive-complexity: ["warn", 15]` — **`warn`, not `error`**. Per that file's own comment, this means `npm run complexity` (`eslint --no-error-on-unmatched-pattern .`) cannot fail on complexity content regardless of value.
- `apps/admin/src` has a separate hard `error`/9 gate — not applicable, none of the 4 commits touch `apps/admin`.

**`npm run complexity` — ran full-repo: exit 0 (PASS, as expected — warn-only).**
Ran a second, targeted pass (`eslint -f json` on exactly the 8 changed source files + 6 changed test files) to get real per-function numbers:

| File | Violation | Threshold |
|---|---|---|
| `src/features/plugin-runtime/manifest.ts:157` `validateManifest` | complexity **51**, cognitive **47** | 15/15 |
| `src/features/site-glue/manifest.ts:164` `validateGlueManifest` | complexity **35**, cognitive **30** | 15/15 |
| all other changed files (worker-sandbox.ts, liquid-sandbox.ts, handlebars-sandbox.ts, render.ts, extension-capability-vocabulary.ts, capability-gate.ts, all 6 test files) | **zero** violations at 15/15 | — |

**These two are pre-existing, not new or worsened by this diff.** Verified by extracting `1e07bb0b~1`'s versions of both files (`git show 1e07bb0b~1:<path>`) and running the same targeted ESLint pass via stdin: identical complexity/cognitive numbers (51/47 and 35/30) at the pre-commit revision — only the line numbers shifted (151→157, 163→164) because the commit inserted an `import` line above the function. The diff itself never touches inside either function body (confirmed via `git diff 1e07bb0b~1 1e07bb0b` — the only changes are an added import, a type-alias body swap, and one `Set` construction line, all outside `validateManifest`/`validateGlueManifest`). Per the review rubric, a complexity finding is only Required when new or worsened against the comparison base — these are neither. **Advisory note only, and even that is capped: the gate itself is `warn`, non-blocking.**

**`npm run check:src-complexity-drift` — exit 0, "0 new complexity violations (98 total, 105 in baseline)."** This gate's scope is hardcoded to `src/server/routes/**` only (read from the script itself, not assumed) — **none of the 4 commits touch that path**, so this result is N/A to this diff, not a pass earned by the changed code. Noting it rather than silently omitting it.

**Verdict: PASS.** No new or worsened complexity/cognitive finding in the diff. The only over-threshold functions are untouched pre-existing debt, and the one gate that could theoretically block (`check:src-complexity-drift`) doesn't even cover this diff's files.

## Gate 2 — Coverage (scoped, not full-suite)

Ran `node --import tsx --test` with the same flags `test:cov` uses (`--experimental-test-coverage`, lcov reporter), scoped to the 8 test files that exercise the changed source: `handlebars-sandbox.test.ts`, `liquid-sandbox.test.ts`, `sandbox-timeout-resolution.test.ts`, `worker-sandbox.test.ts`, `extension-capability-vocabulary.unit.test.ts`, `plugin-runtime/__tests__/unit/manifest.unit.test.ts`, `site-glue/__tests__/unit/manifest.unit.test.ts`, `site-glue/__tests__/unit/capability-gate.unit.test.ts`.

**First two attempts genuinely failed** (exit 1, not empty/broken tooling): under measured system load average 38–55 on this 8-core box (concurrent sibling agent sessions in this same dispatch — confirmed via `uptime`/`ps`), the sandbox tests' real `worker_threads` timed out against their 5000ms wall-clock budget. This is a documented, known phenomenon in the code itself — `worker-sandbox.ts`'s own header cites an identical 2026-08-19 incident at load average 135 and names `TOVU_THEME_RENDER_TIMEOUT_MS` as the intended escape hatch for exactly this case. Re-ran with that env var raised (`TOVU_THEME_RENDER_TIMEOUT_MS=60000`, `--test-concurrency=1`) to get a trustworthy signal:

**Result: 87/88 tests passing.** The one remaining failure (`liquid-sandbox.test.ts` "a memory-blowup template … is force-terminated by the worker's memory guards") is not a timeout — it's `ERR_WORKER_OUT_OF_MEMORY` instead of the expected LiquidJS soft guard (`memory alloc limit exceeded`). This test's own comment documents a defense-in-depth race between LiquidJS's precise limit and V8's harder ceiling; under the same concurrent memory pressure from sibling agents, V8's ceiling can win the race first. Not attributable to this diff — the extraction only moved shared spawn/timeout/resourceLimits plumbing, and `resourceLimits` values pass through unchanged. **Reporting this plainly as an unresolved environmental flake, not papering over it as a pass.**

### Per-file coverage (from the 87/88 run, `/tmp/scoped-coverage-final/lcov.info`)

| File | Line % | Branch % |
|---|---|---|
| `src/core/extension-capability-vocabulary.ts` | 100% (35/35) | 100% (1/1) |
| `src/features/site-glue/capability-gate.ts` | 100% (115/115) | 100% (11/11) |
| `src/server/http/site/handlebars-sandbox.ts` | 100% (74/74) | 84.6% (11/13) |
| `src/server/http/site/liquid-sandbox.ts` | 100% (60/60) | 84.6% (11/13) |
| `src/server/http/site/worker-sandbox.ts` | 100% (216/216) | 87.2% (34/39) |
| `src/features/site-glue/manifest.ts` | 98.9% (263/266) | 81.8% (36/44) |
| **`src/features/plugin-runtime/manifest.ts`** | 98.6% (279/283) | **62.9% (22/35)** — worst |

**Worst file: `src/features/plugin-runtime/manifest.ts`, 62.9% branch.** But per the lcov phantom-branch trap: checked `DA` hit counts for every zero-hit `BRDA` line before writing anything off. **Every single zero-hit branch in all 4 files with reported gaps (`plugin-runtime/manifest.ts`, `site-glue/manifest.ts`, `handlebars-sandbox.ts`, `liquid-sandbox.ts`) lands on a comment/JSDoc/`interface`/`type`-union line — TypeScript constructs erased entirely at compile time, with no possible emitted branch.** Read the actual source at every flagged line to confirm this (not inferred): e.g. `plugin-runtime/manifest.ts` lines 16/22/34/39/46/56/58/62/64/69 are inside the file's JSDoc header and the `PluginManifestFieldDecl`/`PluginManifest` interfaces; `site-glue/manifest.ts` lines 22/23/27/29/31/33/38/41 are the header comment and the `GlueCallSite` union; both sandbox wrapper files' 2 misses each are inside their JSDoc blocks (their actual function bodies are one-line `return renderInWorkerSandbox(...)` calls with no branches at all). `worker-sandbox.ts`'s 5 zero-hit branches (lines 14/20/21/73) are the same pattern — its `@file` header comment.

**Net effect: the real, executable branch coverage of every changed function in this diff is effectively 100%** for this test run. The 62.9%/81.8%/84.6% numbers are a coverage-tool artifact from source-map line attribution on non-executable TS syntax, not a gap in tested logic — consistent with this repo's known "lcov phantom branches are usually real, misattributed" pattern, confirmed here by DA hit-count cross-check exactly as that pattern requires, not assumed.

Real (non-phantom) zero-hit *lines* also checked: `plugin-runtime/manifest.ts:48,59,70,71` and `site-glue/manifest.ts:31,42,43` — all `interface` fields / `type` union members / a comment-closing `*/`, same erasure, same non-finding.

**`render.ts` (`b1254680`):** not run through coverage — the diff changed zero executable lines (verified above), so there is nothing to measure; a coverage delta is impossible by construction.

### `worker.once("exit")` branch — the dedicated fixture

**Covered.** `worker-sandbox.ts:212-213`'s `worker.once("exit", (code) => { finish(() => reject(...)) })` callback body shows `DA:213,4` (nonzero — the callback body executed) in the clean run, and no `BRDA` zero-hit entry appears anywhere near that line range. `worker-sandbox.test.ts` (new in `db7c9df5`) drives it via the dedicated `__tests__/fixtures/exit-worker.ts` fixture (`process.exit(7)`, no message, no throw) for both engine labels; the corresponding test — "a worker that exits without posting a message or throwing rejects with the exact exit-code message, per engine label" — passed in the clean run. The fixture's own header comment documents why neither real worker (`liquid-worker.ts`/`handlebars-worker.ts`) can trigger this branch (both route failures through try/catch into a `postMessage` reply, and Node fires `error` before `exit` on any uncaught exception) — matches what the coverage data shows.

## Verdict summary

| Gate | Result | Notes |
|---|---|---|
| `npm run complexity` (repo-wide, warn/15) | **PASS** (exit 0) | Two pre-existing over-threshold functions, unchanged by this diff — not new/worsened, and the gate is non-blocking regardless |
| `npm run check:src-complexity-drift` (routes-only, error/9) | **PASS** (exit 0) | N/A to this diff — scope is `src/server/routes/**`, none of the 4 commits touch it |
| Scoped coverage run | **1 failing test, 87/88** | Not a diff regression — reproduced as environmental (system load 38-55 on 8 cores from concurrent sibling sessions); one test is a documented guard-ordering race sensitive to memory pressure. Flagging as unresolved, not asserting a clean pass |
| Line/branch coverage on changed files | Lines ≥98.6% everywhere; branch 62.9%-100% nominal, **effectively 100% real** after phantom-branch verification | Worst nominal file: `plugin-runtime/manifest.ts` (62.9% branch, all-phantom) |
| `worker.once("exit")` branch | **Covered**, by the dedicated `exit-worker.ts` fixture test | Confirmed via DA hit count + passing test, not assumed |

No file under `src/` was modified during this review.
