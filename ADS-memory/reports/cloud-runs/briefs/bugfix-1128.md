# bugfix-1128: fix the 51 confirmed bugs, and verify the dead-code cuts (run BF)

Owner 11-28: "sure please fix in the cloud". One run, both repos.

## Input
- **Confirmed bugs:** Tovu `origin/cloud/bugproof-1128-BP:cloud-results/bugproof-1128-BP.md` lists all 51 CONFIRMED, with a per-bug table: path:line, proof, and the local fix that turned each test green. It also has a severity-sorted list and Setup notes.
- **Bug tests:** each bug has a red test named `BUG <id>:` in a `*.bug-1128.test.*` file, on `codex/bugproof-1128`. Jini head is d314bcbf, Tovu head is 8b68f34c75.
- **Dead-code cuts:** made by Codex and untested, on `codex/deadcode-1128`.
  - Jini 4796d539c.
  - Tovu 296ef5fe98, plus the desktop cuts as a patch at `ADS-memory/reports/cloud-runs/briefs/deadcode-desktop-1128.patch` on this branch. That commit wasn't pushed because the local pre-push hook runs heavy desktop gates on the owner's Mac. You run those gates here, in the cloud.
  - The cuts are listed, with proof, in Tovu `development/coverage-ledger-2026-11-28.md` (REFACTOR rows).

## ROLE
You and every subagent are the AI-Dev-Shop TDD / programmer agent. Read first (AI-Dev-Shop cloned next to Tovu/Jini): `agents/tdd/skills.md`, `skills/systematic-debugging/SKILL.md`, `skills/anti-over-engineering/SKILL.md`, `skills/coding-foundations/SKILL.md`, `skills/testable-design-patterns/SKILL.md`, `skills/adversarial-test-design/references/testing-mistakes.md` lines 1-192.

## Setup
Use the BP report's Setup section: Node 24, then `chmod +x` corepack's `gyp_main.py`, then Jini install + build. **Build Jini from `d1ced6c5` until J-B38 is fixed.** For Tovu: npm ci, then contracts/sdk BEFORE `link:jini`.

## Phase 1: branches (both repos)
1. Create `fix/bugs-1128` from `origin/codex/bugproof-1128`, then `git merge --no-ff origin/codex/deadcode-1128`.
2. Tovu only: then `git am` the desktop patch.
3. **Jini first: fix J-B38** (widen the parameter at `cms/src/posts/post-tool-policy.ts:124`, per the BP report) so that `pnpm -r build` is green on the branch. Then rebuild Jini and re-link Tovu.

## Phase 2: fix the 51 bugs
- **Order:** severity, as in the BP report (high first).
- **Per bug:**
  - Make the smallest fix at the cited line. The BP table already shows a fix that turned the test green; use it unless it's wrong or too narrow.
  - The bug test must go green. Also run the unit's existing neighbouring test files, which must stay green.
  - Keep the `*.bug-1128.test.*` files as regression tests. Never weaken them.
- **Owner defaults** (the owner didn't object; apply these and note them in the report):
  - **J-B21:** the code is right (an asset failure makes `ok` false). Fix the catalog / tool description text.
  - **J-B48:** the chosen ready connection wins over the default connection (J-O25).
- **If a fix needs more than about 40 changed production lines, or a contract change:** stop on that bug, leave its test red, and report it with the proposed fix.
- **Commits:** one commit per bug or per small same-file batch, with the bug ID in the message. Push after each landing.

## Phase 3: verify the dead-code cuts
- **For every package / app the cuts touched:**
  - Typecheck. Jini: per package. Tovu: `npm run typecheck` and `npm run typecheck:tests`.
  - Run the existing tests of every touched file: unit tests next to it, plus importers found by basename.
- **A cut that breaks a test or typecheck:**
  - If the TEST relied on the impossible path through a contrived setup, update the test without weakening it.
  - Otherwise REVERT that cut (`git revert` or a hand edit) and report the row ID and why.
- **Desktop gates (Tovu):** run the desktop gates exactly as `origin/integ/merge-28-2026-11-26:cloud-results/merge-28.md` describes. All must pass before you push apps/desktop changes.
- **Notes for the later coverage merge** (put them in the report; don't do them here): J-R19's mocked-describer test lives on `codex/w62-cov-um-*`; T-R04's `identity-settings.unit.test.ts` is on `codex/tv-w62-cov-web-13`.

## Rules (owner, always)
- Production changes only for the listed bugs (plus J-B38) and cut fallout. No drive-by refactors.
- Code rules: inject everything; hooks are REQUIRED props; args `(required, _optional = {})`; fn ≤ 80 lines; complexity ≤ 10; no re-export shells. Jini stays vendor- and server-neutral, with no 'tovu' text. Themes untouched. DO NOT TOUCH packages/commerce or PageEditorChrome.tsx.
- Never silence a check: no guard allowlist or baseline edits, no ts-ignore / expect-error, no `as any`, no skips, no coverage exclusions, no lowered thresholds, never `--no-verify`.
- Secrets: run gitleaks if it is installed; if not, don't download it. Review `git diff --cached` by eye. Fakes are short and low-entropy. Never `gitleaks:allow`; never edit `.gitleaks.toml`.
- Branches: push only `fix/bugs-1128` (both repos) and your report branch. Never main, release/*, integ/*, or codex/*. No codebase-memory tools. No RemoteTrigger.

## Caps (iron rule)
Opus high; **2 h 30 min wall clock**; 300k context for you (near ~280k: push, report PARTIAL); 300 tool calls; at most 4 subagents (slices: Jini high-severity + db/recovery; Jini cms / devops; Jini admin / ui hooks; Tovu + the cut verification), each about 180k tokens / 80 calls. One heavy command at a time; any single test command at most 10 min; never whole suites. Start with `date +%s > /tmp/run-start`. Keep dispatching while bugs are left. Stop new dispatches at 2 h 10, and have the report pushed by 2 h 25.

## Report
Push to the Tovu branch `cloud/bugfix-1128-BF` (from this branch) with `cloud-results/bugfix-1128-BF.md`.
- FIRST LINE: `DONE|PARTIAL run BF | bugs fixed n/51 | cuts kept n / reverted n | desktop gates PASS|FAIL|n/a | Production LOC +A/-D per repo`.
- Then:
  - a per-bug table: id | fix commit | production lines | tests run;
  - bugs left, with the proposed fix;
  - cuts reverted, with the reason;
  - test edits made;
  - the owner defaults applied;
  - the coverage-merge notes;
  - branch SHAs.
- Mark each fixed row FIXED in the 55-row section of `development/open-bugs.md` on the report branch.
