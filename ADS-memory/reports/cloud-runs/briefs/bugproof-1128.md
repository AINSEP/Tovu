# bugproof-1128: run Codex's 51 bug-proof tests and classify each suspected bug (run BP)

Owner 11-28: "test those bugs, and then when they come back, we will decide what to do." This run **proves or disproves**. It never fixes production code.

## Input
- Codex 6.2 read the 19 cloud coverage reports and the merge-28 code, and listed suspected bugs in Tovu `development/coverage-ledger-2026-11-28.md` (branch `origin/codex/deadcode-1128`), in the BUG rows.
- It then wrote one failing test per bug, WITHOUT running anything, on branch `codex/bugproof-1128` in each repo (Jini and Tovu, base `integ/merge-28-2026-11-26`).
  - Each test is in a new `*.bug-1128.test.*` file and its name starts with `BUG <id>:`.
  - Codex's per-bug notes (test, expected failure, NOT-A-BUG claims) are in `ADS-memory/reports/cloud-runs/briefs/bugproof-1128-codex-notes.md` on this branch.
- Expect: compile errors, wrong imports, wrong helpers. Some tests will fail for the wrong reason.

## ROLE
You and every subagent are the AI-Dev-Shop TDD agent. Read first (AI-Dev-Shop cloned next to Tovu/Jini): `agents/tdd/skills.md`, `skills/test-design/SKILL.md`, `skills/adversarial-test-design/references/testing-mistakes.md` lines 1-192, `skills/systematic-debugging/SKILL.md`, `skills/anti-over-engineering/SKILL.md`.

## Setup
Follow the Setup section of Tovu `origin/cloud/gap-fill-1127-C4b:cloud-results/gap-fill-1127-C4b.md`:
- Node 24 tarball, then `chmod +x` corepack's `gyp_main.py`.
- Jini: install + build at `codex/bugproof-1128` (test-only changes, so the same build as merge-28).
- Tovu: npm ci, then contracts/sdk BEFORE `link:jini`.

## Per bug (both repos)
1. Run its test file alone. If it doesn't compile or run, fix the TEST (imports, helpers, setup), never the production code.
2. Decide, and prove it:
   - **CONFIRMED**: the test runs and fails for the stated reason. Show expected vs actual. Then check the assertion describes the CORRECT behaviour, not just different behaviour: read the surrounding code, docs and contracts. Briefly break the cited production line locally to see the failure move, then revert.
   - **NOT-A-BUG**: the code behaves correctly. Either the test, once corrected, passes, or the scenario can't happen through public or injected inputs. Delete that test, and give the reason in one line.
   - **UNCLEAR**: deciding needs an owner or product call. Keep the test as `it.todo` / `test.todo` with the question.
3. Also re-check Codex's NOT-A-BUG claims quickly (read the code). Reverse any that are wrong, writing the test yourself.
4. Commit after each bug or small batch, on `codex/bugproof-1128` in that repo, and push. Force-with-lease only on this branch.
   - Confirmed-bug tests stay RED on purpose. That is the point of this branch. Name each file in the report so the bug-fix run can turn them green.

## Rules (owner, always)
- **Never change production code. No fixes.**
- No skips except `todo` for UNCLEAR. No ts-ignore / expect-error. No `as any`. Never weaken an assertion to reach a verdict. Never mock the unit under test.
- Secrets: run gitleaks if it is installed; if not, don't download it. Review `git diff --cached` by eye and say in the report that gitleaks wasn't run. Fakes are short and low-entropy. Never `gitleaks:allow`; never edit `.gitleaks.toml`.
- Never `--no-verify`.
- Branches: push only `codex/bugproof-1128` (both repos) and your report branch. Never main, release/*, integ/*, or other codex/* branches. No codebase-memory tools. No RemoteTrigger.

## Caps (iron rule)
Opus high; **2 h wall clock**; 250k context for you (near ~230k: push, report PARTIAL); 250 tool calls; at most 3 subagents (one slice each: Jini A, Jini B, Tovu), each about 150k tokens / 70 calls. Run one test file at a time, each run at most 5 min. Never run whole suites. Start with `date +%s > /tmp/run-start`. At 1 h 45: stop dispatching, then push and report.

## Report
Push to the Tovu branch `cloud/bugproof-1128-BP` (from this branch) with `cloud-results/bugproof-1128-BP.md`.
- FIRST LINE: `DONE|PARTIAL run BP | bugs 51 | CONFIRMED n | NOT-A-BUG n | UNCLEAR n | left n`.
- Then a table: `id | repo path:line | verdict | one-line proof (expected vs actual, or why not) | severity guess (high / med / low: data loss, security, wrong output, cosmetic) | test file`.
- Then the CONFIRMED list sorted by severity, the UNCLEAR questions for the owner, and the branch SHAs.
- Also update the 55-row section in `development/open-bugs.md` on the report branch: mark each row CONFIRMED / NOT-A-BUG / UNCLEAR.
