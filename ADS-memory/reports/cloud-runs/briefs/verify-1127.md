# Cloud verify 2026-11-27 — run and fix the UNTESTED Codex coverage-test branches

Owner 11-27 ~1 PM PT approved 7 Opus runs (V1..V7). Your trigger message names your run and its branches. Never touch another run's branches.

## Background
Local Codex (gpt-6.2) wrote TDD coverage gap-fill tests on branches `codex/<job>` (base `integ/merge-28-2026-11-26`) WITHOUT running anything (no installs, no tests, no typecheck). Each job's brief is `ADS-memory/reports/cloud-runs/gap-fill-1127/<job>.md` (rules + FILES list with coverage before); Codex's per-test mutation notes are in `ADS-memory/reports/cloud-runs/gap-fill-1127/plans/<job>-COMMIT-PLAN.md` when present. Expect: tests that do not compile, wrong imports, wrong expectations, and some weak tests.

## Setup (once)
Read Tovu `origin/integ/merge-28-2026-11-26:cloud-results/merge-28.md` for the setup that worked (Node 24 tarball, pnpm, Jini install + build, Tovu npm ci, contracts/sdk build BEFORE link:jini, link:jini). Tovu runs also need Jini built.

## Per branch, in order
1. `git checkout codex/<job>`; list the test files it adds/changes: `git diff --name-only origin/integ/merge-28-2026-11-26...HEAD`.
2. Typecheck those files (package tsconfig / tests tsconfig scoped to the package; never repo-wide), then RUN only those test files.
3. Fix every red properly: wrong test -> fix the test so it checks the real behaviour (never weaken/delete an assertion to get green, never skip, never mock the unit under test). A test that proves a PRODUCTION bug: fix the bug with that failing test first when small and local (<= ~40 lines); otherwise leave that one test out of the commit and report BUG <file:line> + test code + proposed fix.
4. Quality pass on every new test against the job brief's rules (AI-Dev-Shop tdd skills + testing-mistakes.md 1-192): no weak-only assertions (`toBeDefined`, `not.toThrow`, `ok(x)` alone), no snapshot-only, no tautologies, real behaviour through injected fakes. Fix weak ones. Spot-check mutations: for at least 3 tests per branch, apply the COMMIT-PLAN mutation (or your own), confirm red, revert.
5. Coverage for the job's FILES (scoped run): record before (brief) -> after per file, lines/branches/functions.
6. Secrets: test values must not look like real keys; `gitleaks protect --staged` before every commit (install the binary if missing). Never add gitleaks:allow, never edit .gitleaks.toml.
7. Commit `fix(<job>): tests run + fixed in cloud` and push `codex/<job>` (push after EACH branch). Tovu: the desktop pre-push hook runs only when apps/desktop changes; never --no-verify.

## Rules (owner, always)
Never silence a check (no guard allowlist/baseline edits, no ts-ignore/expect-error, no `as any`, no skipped tests, no coverage exclusions or lowered thresholds). Inject everything; hooks as REQUIRED props; args `(required, _optional = {})`; fn <= 80 lines; complexity <= 10; no re-export shells; Jini vendor/server-neutral, no 'tovu' text in Jini; themes untouched. Production changes only for proven bugs (step 3). DO NOT TOUCH packages/commerce, packages/admin/src/pages/PageEditorChrome.tsx. No codebase-memory tools. Never touch main/release/*/integ/*; never publish/tag.

## Caps (iron rule)
Opus high; wall-clock 3 h; context 300k (near ~280k: push, report PARTIAL); 350 tool calls; <= 4 subagents (one branch each, <= 120k context / 50 calls; only YOU push); one heavy command at a time; any test command <= 20 min; never run whole-repo suites. Near any cap: push what is done, report exact branches left, STOP.

## Report
Push Tovu branch `cloud/verify-1127-<run>` (from `origin/cloud/gap-fill-1127`) with `cloud-results/verify-1127-<run>.md`. FIRST LINE: `DONE|PARTIAL run <V> | branches <done>/<n> | tests run <n> pass <n> fixed <n> dropped <n> | weak fixed <n> | bugs <n> | left: <list>`. Then per branch: final sha; tests red -> why -> fix; weak tests fixed; mutation spot-checks; per-file coverage before -> after; BUGs (also append to development/open-bugs.md on that report branch); owner decisions.
