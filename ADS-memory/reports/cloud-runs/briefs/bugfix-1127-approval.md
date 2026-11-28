# 11-27 bug-fix plan: Opus review (APPROVED), 2026-11-27

Plan: `bugfix-1127-plan.md` (Codex gpt-6.2-sol, read-only). Verdict: **APPROVED as written.** 7 desktop/kernel extraction blockers (D01–D06, J01), 5 focused Jini fixes (J02–J06), 6 Tovu lifecycle/contract fixes (T01–T06), 4 CMS/plugin fixes (T07–T10), and 4 Jini fixes or dispositions (J07–J10). D07 deferred, T11 not a bug, J09 and J10 test-only. Estimated net production lines are +85 (range +40 to +150).

Binding notes for the executor:
1. **Base:** the merged integration base that contains all verified coverage branches (including the Tovu desktop coverage branches dsk-1 and dsk-2), as the plan's step 1 says. Do not start on main.
2. **Owner-decision items:** use the plan's defaults (T02, T05, T07, T08, T09, T10, J08). Owner rule: auto mode decides.
3. **Load the skills** `AI-Dev-Shop/skills/anti-over-engineering/SKILL.md` (v1.1) plus `systematic-debugging` and `test-design` for you and every subagent. Failing test first, the smallest fix, no drive-by refactors. Report production LOC per batch.
4. **Two cloud runs** as in the plan's table. Run 2 consumes Run 1's heads. At most 4 subagents. Use the keep-dispatching loop from `gap-fill-1127-round3.md` (don't end early while batches remain).
5. The desktop-host extraction starts only after D01–D06 and J01 are green on its base.
6. Usual rules: no `--no-verify`, no `gitleaks:allow`, no guard/threshold edits, no npm publish. Use gitleaks 8.28.0.
