# redtests-1128: fix the ~15 tests that already fail on the merge-28 base (run RT)

Owner 11-28: "let's fix 15 tests, whether they're bad tests or actual code."

## Input
The list is in Tovu `origin/fix/bugs-1128:development/open-bugs.md`, section "2026-11-28 — tests already failing on the merge-28 base". The details are in `origin/cloud/bugfix-1128-BF:cloud-results/bugfix-1128-BF.md`, section "Dead-code cuts" ("Failing tests in the touched suites…"). Work on branch `fix/bugs-1128` in BOTH repos (continue from its head).

## ROLE
You and every subagent are the AI-Dev-Shop TDD / programmer agent. Read first (AI-Dev-Shop cloned next to Tovu/Jini): `agents/tdd/skills.md`, `skills/systematic-debugging/SKILL.md`, `skills/anti-over-engineering/SKILL.md`, `skills/adversarial-test-design/references/testing-mistakes.md` lines 1-192.

## Setup
Same as the BF report's Setup notes: Node 24, corepack, `chmod +x` gyp_main.py; Jini install + build at `fix/bugs-1128`; Tovu npm ci, contracts/sdk, then `link:jini`.

## Per failing test
1. Run it alone, then find the cause with systematic debugging. Decide which case it is:
   - **CODE BUG:** production is wrong. Fix it, with the failing test as proof, at no more than about 40 lines.
   - **STALE TEST:** production changed on purpose, so the test checks old text, old anchors or an old contract. Update the test to check the CURRENT real behaviour, just as strictly. Never weaken it, delete its assertions or skip it.
   - **ENVIRONMENT:** for example react 19.2.8 vs react-dom 19.2.7. Fix the real cause: align the versions in the right package.json and lockfile, the smallest change. If that needs an owner decision, report it.
2. For the source-text "anchor" tests (`serve-command-wiring.unit`, `session-resume-wiring`), prefer a behaviour test if one is cheap. Otherwise update the anchor and say why.
3. For `tool-registrations.contracts.test` ('posts' missing from `CATALOGS_BY_DOMAIN`), decide whether the registry or the catalog map is wrong, and fix the real one.
4. Run the neighbouring tests of each file you touch. Commit one fix per test (or per shared cause) with the test name in the message, then push.

## Rules (owner, always)
- Code rules: inject everything; hooks are REQUIRED props; args `(required, _optional = {})`; fn ≤ 80 lines; complexity ≤ 10; no re-export shells. Jini stays neutral, with no 'tovu' text. Themes untouched. DO NOT TOUCH packages/commerce or PageEditorChrome.tsx.
- Never silence a check: no guard or baseline edits, no ts-ignore / expect-error, no `as any`, no skips, no coverage exclusions, never `--no-verify`.
- Secrets: run gitleaks if it is installed; otherwise review the diff by eye. Never `gitleaks:allow`.
- Branches: push only `fix/bugs-1128` (both repos) and your report branch. If you touch apps/desktop, run the desktop gates (see BF report) before pushing. No RemoteTrigger. No codebase-memory tools.

## Caps (iron rule)
Opus high; **1 h 15 min wall clock**; 200k context; 200 tool calls; at most 3 subagents (Jini; Tovu website / admin; Tovu site-chat env + anchors); any single test command at most 10 min; never whole suites. Start with `date +%s > /tmp/run-start`. Stop dispatching at 1 h; report by 1 h 12.

## Report
Push to the Tovu branch `cloud/redtests-1128-RT` (from this branch) with `cloud-results/redtests-1128-RT.md`.
- FIRST LINE: `DONE|PARTIAL run RT | tests fixed n/<total> | code bugs n | stale tests n | env n | left n`.
- Then per test: case, cause, fix commit, production lines.
- Mark each row FIXED in that open-bugs section, on the report branch.
