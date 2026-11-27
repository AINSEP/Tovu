# Cloud gap-fill 2026-11-27 — TDD coverage tests for the jobs local Codex did not finish

Owner 11-27 ~1 PM PT: "lets do the rest of the ones in the cloud with opus". You are ONE of three runs (A, B, C); your trigger message names your run and its 5 jobs. Other runs own other jobs: never touch their branches.

## What each job is
`ADS-memory/reports/cloud-runs/gap-fill-1127/<job>.md` (this branch) is the job's full brief, written for LOCAL Codex: role (TDD agent), the AI-Dev-Shop skills to read, test-quality rules, and the FILES list (path | coverage now | uncovered lines, measured by merge-28 coverage). Follow it, with these CLOUD OVERRIDES:
- IGNORE its "HARD - NO RUNNING" and "no install" rules: in the cloud you DO install, build and RUN the tests you write.
- IGNORE "NO REPO-WIDE SEARCH" (it protected a small Mac); still prefer reading exact files.
- AI-Dev-Shop paths: read them from the AI-Dev-Shop repo cloned next to Tovu/Jini (not /Users/la/...).
- COMMIT-PLAN.md: keep the per-test mutation notes, but put them in your run report, not in the repo.

## Setup (once per run, only what your repos need)
Read Tovu `origin/integ/merge-28-2026-11-26:cloud-results/merge-28.md` FIRST for the setup that worked (Node 24 from nodejs.org tarball, corepack/pnpm, Jini install + build, Tovu npm ci, build contracts/sdk BEFORE link:jini, link:jini). Jini runs need Jini only; run C (Tovu website) needs both.

## Per job, in order
1. Branch: if `origin/codex/<job>` exists, check it out and CONTINUE from it (it holds partial Codex work, untested: read its diff first; fix or finish it). Else `git checkout -b codex/<job> origin/integ/merge-28-2026-11-26`.
2. Write the tests (brief rules: real behaviour, exact args to injected ports, every branch, no mocking the unit under test, no weak-only assertions, extend neighbouring test files).
3. RUN only the test files you touched (vitest `run <files>` in the package / `node --test <files>` with the app's own flags), then coverage scoped to the job's FILES; record before -> after per file (lines/branches/functions).
4. Red test: if the TEST is wrong, fix the test properly (never weaken or delete an assertion, never skip). If it proves a PRODUCTION bug: fix it only when small and local (<= ~40 lines) with the failing test first; otherwise leave that one test out of the commit, and report BUG <file:line> + test code + proposed fix.
5. Secrets: test values must not look like real keys (gitleaks generic-api-key). Use short low-entropy fakes like `"tok-a"`, `"test-key"`. Run `gitleaks protect --staged` (install the binary if missing) before every commit. NEVER add gitleaks:allow, never edit .gitleaks.toml.
6. Commit `test(<job>): TDD coverage gap fill (cloud, tests run)` and push `codex/<job>` (incremental: push after EACH job; force-with-lease only on your own codex/<job>). Tovu pushes run the desktop pre-push hook only when apps/desktop changes; never --no-verify.

## Rules (owner, always)
Never silence a check (no guard allowlist/baseline edits, no ts-ignore/expect-error, no `as any`, no skipped tests, no coverage exclusions or lowered thresholds). Inject everything; hooks as REQUIRED props; args `(required, _optional = {})`; fn <= 80 lines; complexity <= 10; no re-export shells; Jini vendor/server-neutral, no 'tovu' text in Jini; themes untouched. Production code changes ONLY for proven bugs (step 4). DO NOT TOUCH packages/commerce, packages/admin/src/pages/PageEditorChrome.tsx. No codebase-memory tools. Never touch main/release/*/integ/*; never publish/tag.

## Caps (iron rule)
Opus high; wall-clock 3 h; context 300k (near ~280k: push, report PARTIAL); 350 tool calls; <= 4 subagents (each one job, <= 120k context / 50 calls; only YOU push); one heavy command at a time, any test command <= 20 min. Near any cap: push what is done, write the report with exact jobs/files left, STOP. Do not re-run whole suites.

## Report
Push to Tovu branch `cloud/gap-fill-1127-<run>` (from this branch) the file `cloud-results/gap-fill-1127-<run>.md`. FIRST LINE: `DONE|PARTIAL run <X> | jobs <done>/5 | tests added <n> | files 100% <n>/<total> | bugs <n> | left: <list>`. Then per job: branch + sha, per-file coverage before -> after, tests added (file:test -> mutation that turns it red), EXCEPTIONs, BUGs (also append to development/open-bugs.md on that report branch), partial-work fixes, anything for the owner to decide.
