# COMMIT-PLAN

Executor branch: `codex/tv-engaps2`. Base: `7edb01031616b9b5c10008c72d598bc5b7856997`.
No tests, builds, installs, type-checks, linters, commits or pushes were run, per the dispatch machine rule. The coordinator owns staging and execution.

## T2 — STOPPED

- Base: `7edb01031616b9b5c10008c72d598bc5b7856997`.
- Files: no source changes; this entry and `REFRESH.md` record the STOP.
- Pre-existing size: `apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts:595–667` is 73 physical lines; `:669–748` is 80 physical lines, inclusive. Both callbacks are already async. The coordinator ruling explicitly stops the sheet at 80 or more, so no fixture or caller edits were made.
- File size: the serve integration file is already 794 lines; this is recorded, not the STOP reason.
- Tests: none added or changed. The named seeded-route and foreign-CWD tests already exist; they are behavior-preservation witnesses, not expected-red tests for a fixture optimization. No RED/GREEN claim is made.
- Mutation owed to combine: remove sample content after T2 is unblocked and implemented; seeded-route coverage must fail. Paired T1/T2 before/after timing on the same linked build and a completed run remain owed.
- API-baseline delta (Jini): none.
- Look owed: none.
- Diff re-read deletions: none; the sheet was stopped before editing.

## T4 — DONE (implementation; runtime verification owed)

- Base: `7edb01031616b9b5c10008c72d598bc5b7856997`.
- Files: `apps/website/src/server/inbound/assistant/agent-daemon-server.ts`, `apps/website/src/server/inbound/assistant/__tests__/integration/daemon-boots.integration.test.ts`, this entry and `REFRESH.md`.
- Ownership check: the standalone listener still used bare `Number(process.env.JINI_AGENT_DAEMON_PORT ?? 4319)` on this base. T3's proxy validation is separate and unchanged.
- Test first: added one real-child invalid-port case before editing production. It requires startup failure within the existing 45-second boot budget, the setting name and allowed range, no supplied value, and no listener announcement. Expected RED on the base: native Number/listen failure omits `JINI_AGENT_DAEMON_PORT` and prints the supplied out-of-range number. This expectation was not executed.
- Implementation: the prescribed private `standaloneListenerPort(): number` preserves missing → 4319, explicit `"0"` → 0, and integers 1–65535. Only the coercion expression changes inside `start()`; its complexity remains unchanged. Existing optional pads and args rules remain untouched.
- Mutation owed to combine: restore bare Number coercion and confirm the new child case fails. Run the unchanged boot/EOF cases too.
- API-baseline delta (Jini): none; no Jini files or public APIs changed.
- Look owed: packaged Electron daemon-start check on the combine host.
- Diff re-read deletions: none; all additions are named by the sheet or ruling.

Static architecture review: PASS for the scoped change; validation stays private in the Tovu host, with no new imports, dependencies or exported surface. No comments were added.

| Unit | Disposition | Findings | Local fix attempted |
| --- | --- | --- | --- |
| standaloneListenerPort | INCONCLUSIVE | Runtime evidence unavailable under machine rule; static inspection found no contract or naming issue | No further change required by sheet |
| start | INCONCLUSIVE | Execution owed; existing complexity 10 retained by expression-only replacement | Prescribed private guard |

The new guard is 10 physical lines, cyclomatic complexity 6 by manual branch count, O(n) conversion time for n input characters and constant auxiliary space. Coverage is unmeasured. Only the named invalid-port case was added; additional cases were not authorized. T1, T3, T5 and T6 were not edited.
