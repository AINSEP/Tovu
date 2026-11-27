# gap-fill-1127 ROUND 3 (runs A3, B3, C3a, C3b), addendum to gap-fill-1127.md

Read `gap-fill-1127.md` first. ROLE, rules and CAPS there still apply: Opus high, 3 h, 300k context for you, 350 tool calls for you, at most 4 subagents at once. This file changes ONE thing: **how long you keep working.**

## Why this round exists
Runs A/A2, B/B2 and C/C2 each ended after 20-55 minutes, with hundreds of files still not at 100%. The coordinator gave each job one subagent. When that subagent returned, the coordinator wrote the report and stopped. That is wrong. **Ending early with work left is a failure of this run.**

## The loop (mandatory)
1. At start, run `date +%s > /tmp/run-start` and check the time again before every dispatch decision.
2. Keep a queue of jobs whose LEFT list isn't empty. Start with the LEFT lists in the previous run's report (named in your dispatch message).
3. Keep up to 4 subagents running at all times. Each gets ONE job and the current LEFT list for that job, and works in its own worktree on that job's branch.
4. **When a subagent returns and its job still has LEFT files, dispatch a FRESH subagent for the same job right away.** Give it the updated LEFT list and the branch head. Do this every time, not just once.
5. Stop starting new subagents only when **(a)** every job's LEFT list is empty or holds only documented EXCEPTIONS, or **(b)** 2 h 30 min have passed.
6. Between 2 h 30 and 2 h 50: let running subagents finish or tell them to commit, then push every branch, write the report and push it. Done by 2 h 55.
7. Do not do test-writing yourself beyond small fixes; your context is for coordinating. Push after each subagent's work lands (you push; subagents don't).

## Subagent limits (raised from round 2)
- Stop at about 200k tokens or 90 tool calls, whichever comes first.
- Before stopping: commit green work, then reply in 15 lines or fewer: commit SHAs, files now at 100/100/100, and the exact remaining LEFT list with per-file uncovered lines/branches. Also report EXCEPTIONS with reasons, and any BUG (failing test first, per the brief).
- Never redo or duplicate an existing test. Read the job's existing tests first and extend them.

## Secrets
- Use gitleaks if it is installed. If it is not, don't try to download it. Instead, review `git diff --cached` by eye for key/token/secret/password values before each commit, and say in the report that gitleaks wasn't run.
- Fake values must be short and low-entropy (`tok-a`, `fake-one`). Never use `gitleaks:allow` and never edit `.gitleaks.toml`. Its parse error with gitleaks v8.21.2 is known and is for the owner to handle.

## Report
- First line: `DONE|PARTIAL run <id> | jobs <complete>/<n> | tests added N | files 100% X/Y | bugs N | left: <per job count>`.
- Also include the start and end times, and how many subagents ran in total. That shows the loop ran.
