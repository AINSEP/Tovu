# merge-29: merge every coverage branch, then FULL per-file coverage (runs MJ = Jini, MT = Tovu)

Owner-approved order (11-27): test merge -> bug fixes -> desktop-host extraction. This is the test merge. Two runs in parallel, one per repo; your trigger message names yours. Never push the other repo's integ branch.

## ROLE
You, and every subagent you start, are the AI-Dev-Shop TDD agent. Read first (AI-Dev-Shop repo cloned next to Tovu/Jini): `agents/tdd/skills.md`, `skills/test-design/SKILL.md`, `skills/adversarial-test-design/references/testing-mistakes.md` lines 1-192, `skills/coding-foundations/SKILL.md`, `skills/testable-design-patterns/SKILL.md`, `skills/anti-over-engineering/SKILL.md`, `harness-engineering/quality/coverage-integrity-policy.md`. Every subagent brief names these files and says "read them first".

## Setup
Read Tovu `origin/integ/merge-28-2026-11-26:cloud-results/merge-28.md` and the Setup section of Tovu `origin/cloud/gap-fill-1127-C4b:cloud-results/gap-fill-1127-C4b.md` (Node 24 tarball, `chmod +x` for corepack's gyp_main.py, Jini install + build, Tovu npm ci, contracts/sdk BEFORE link:jini). MT builds Jini at `origin/integ/merge-28-2026-11-26` (the Jini coverage branches are test-only apart from small fixes Tovu does not need).

## Phase 1: merge (aim to finish by 0 h 50)
1. Create the branch from the merge-28 tip:
   - MJ: `integ/merge-29-2026-11-28` from Jini `origin/integ/merge-28-2026-11-26`.
   - MT: the same branch name from Tovu `origin/integ/merge-28-2026-11-26`, then `git merge origin/main` (6 commits: the desktop test fixes 57a590b85f and f41601a4e6, plus open-bugs docs).
2. Merge (`--no-ff`, one merge commit each) every branch from `git for-each-ref refs/remotes/origin/codex/` that matches:
   - MJ: `codex/w62-cov-*` (38 at brief time).
   - MT: `codex/tv-w62-cov-*` EXCEPT the backup branches ending in `-b` or `-c4a-b`. Their commits are already cherry-picked, verified by patch-id. That leaves 20: adm-1..2, dsk-1..2, web-1..14.
   - List the branches you merged, with their SHAs, in the report.
3. Conflicts: both sides are tests added to the same file, so keep both and dedupe identical helpers. For `development/open-bugs.md`, take the union. Never resolve a conflict by dropping an assertion. A production-file conflict (rare: small bug fixes) gets the stricter or fixed version, explained in the report.
4. After all merges:
   - Run typecheck. MJ: `pnpm -r typecheck` or the per-package equivalent. MT: `npm run typecheck` + `npm run typecheck:tests`.
   - Run every test file that any merged branch changed (`git diff --name-only <merge-28>...HEAD`, test files only), in batches of at most 20 min.
   - Fix reds properly (rules below).
   - Push the integ branch. Push again after every later landing.

## Phase 2: full per-file coverage (the real goal)
1. Measure EVERY source file, not only the ones tests import.
   - Jini vitest packages: pass `--coverage.all --coverage.include='src/**'` on the CLI. Do NOT edit coverage configs: some Jini configs measure only subsets, and that is an owner item. Just report which ones.
   - Tovu node:test: `--experimental-test-coverage --test-coverage-include` per app's source tree. Merge every lcov SF record per file, with anonymous functions keyed by position. Drop import-only records. Treat type-only lines as artefacts (C4b's corrected merger).
   - Run one app or package at a time. Each measuring command may take at most 40 min.
2. Build the table `path | L% | B% | F% | uncovered lines / branches / fns` and commit it as `development/coverage-full-2026-11-28.md` on the integ branch.
3. Classify every row below 100/100/100:
   - **GAP**: write the test.
   - **EXCEPTION**: only these three kinds are allowed:
     - barrel / type-only files;
     - platform-specific paths (another OS);
     - deterministic sort tie-breakers.
   - **REFACTOR**: code that cannot run (impossible branch, dead closure, unobservable await). Don't test it. List file:line and the smallest change; bug-fix run 2 deletes or reworks it.
   - **BUG**: write the failing test first. Fix it if the fix is ≤ about 40 lines and local; otherwise report it.
   - Reuse the earlier EXCEPTION / refactor notes in `cloud-results/gap-fill-1127-*.md` and `verify-1127-*.md` (on Tovu's `origin/cloud/*` branches) rather than re-deriving them. Re-check any old "EXCEPTION" that isn't one of the three allowed kinds and move it to REFACTOR or GAP.
4. Write `development/coverage-exceptions.md` (one file per repo, on the integ branch) with these columns:
   - path:line
   - kind: EXCEPTION, REFACTOR or BUG
   - reason, in one line
   - for REFACTOR: the proposed change
5. MT first fills the known leftovers, then everything else the table shows:
   - job 11: commerce.ts (website), trash-and-content, assistant-and-site, publish-export, deps.ts, memory-trash, mount-admin-features, mount-admin-system, app.ts;
   - job 12 slice A: assistant-byok, assistant-byok-turn, assistant.ts, assistant-chats, public-members;
   - job 13: assembly-phases fns 213 and 221; site-import-backend, re-measured.
   - The details are in the LEFT sections of the C4a / C4b reports.

## The loop (mandatory; same as the round-3 brief)
- At the start, `date +%s > /tmp/run-start`. Keep up to 4 subagents busy, one slice of files each, each in its own worktree on a local branch. Each has its own scratch directory (C4a had a shared-scratch clash).
- When one returns with files left, dispatch a fresh one right away. Stop new dispatches when no GAP rows are left or at 2 h 30. By 2 h 55: push, final table, report.
- Subagent cap: about 200k tokens / 90 tool calls. Commit after every file. Reply in 15 lines or fewer: SHAs, files now at 100/100/100, LEFT with lines, EXCEPTION / REFACTOR / BUG rows. Cherry-pick their commits onto the integ branch; only YOU push.
- Ending early with GAP rows left and time left is a failure of this run.

## Rules (owner, always)
- Never silence a check: no guard allowlist or baseline edits, no ts-ignore / expect-error, no `as any`, no skipped tests, no coverage exclusions, no lowered thresholds, never `--no-verify`.
- Tests: real behaviour, exact arguments to injected ports, every branch, no mocking the unit under test, no weak-only assertions. Mutation-check every new test (break the line, see red, revert). Extend neighbouring test files; never duplicate an existing test.
- Production code changes ONLY for proven bugs, with the failing test first. The anti-over-engineering skill applies; report `Production LOC: +A / -D` if any.
- Code rules: inject everything; hooks are REQUIRED props; args `(required, _optional = {})`; fn ≤ 80 lines; complexity ≤ 10; no re-export shells. Jini stays vendor- and server-neutral, with no 'tovu' text. Themes untouched. DO NOT TOUCH packages/commerce or packages/admin/src/pages/PageEditorChrome.tsx. No codebase-memory tools.
- Branches: push only `integ/merge-29-2026-11-28` (your repo) and your report branch. Never main, release/*, other integ/*, or codex/* branches. Never publish or tag.
- Secrets: run gitleaks if it is installed; if not, don't download it. Review `git diff --cached` by eye before each commit and say in the report that gitleaks wasn't run. Fakes are short and low-entropy (`tok-a`). Never `gitleaks:allow`; never edit `.gitleaks.toml`.
- MT: the desktop pre-push hook runs when apps/desktop changes. Let it run.

## Caps (iron rule)
Opus high; 3 h wall clock; 300k context for you (near ~280k: push, report PARTIAL); 350 tool calls; at most 4 subagents; one heavy command at a time under a global flock.

## Report
Push to the Tovu branch `cloud/merge-29-<run>` (from this branch) with `cloud-results/merge-29-<run>.md`.
- FIRST LINE: `DONE|PARTIAL run <MJ|MT> | merged <n>/<n> | tests added N | files 100% X/Y | EXCEPTION n | REFACTOR n | BUG n | GAP left n`.
- Then:
  - start and end times, and subagents run in total;
  - the integ branch SHA;
  - merges with conflicts and how they were resolved;
  - reds fixed;
  - Jini configs that measure subsets (MJ);
  - the GAP-left list with lines;
  - BUGs, also appended to `development/open-bugs.md` on the report branch;
  - owner decisions.
