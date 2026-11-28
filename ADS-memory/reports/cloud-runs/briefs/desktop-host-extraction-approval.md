# Desktop assistant host extraction: Opus review (APPROVED with amendments), 2026-11-27

Plan: `desktop-host-extraction-plan.md` (Codex gpt-6.2-sol, read-only, Tovu main 49ba87ad / Jini main 2c2961d5). Verdict: **APPROVED**. It reuses existing mechanisms (daemon run services, run-credentials, delegated routes, registry catalog builder, @jini-ai/chat/store) instead of building parallel ones, injects every host-specific port, keeps Express out of Jini, and orders the steps test-first.

## Amendments (binding on the executor)
1. **Base:** start from the merged tree that contains the gap-fill coverage branches (the next integ merge after merge-28), not main 49ba87ad. Codex branch `codex/tv-w62-cov-dsk-1` adds tests to `desktop-agent.test.ts` and `desktop-chat-main.test.ts`, and they must move with the code. Re-read every file:line in the plan against that base before editing.
2. **Step 7 (publish):** do NOT publish to npm and do NOT run a release workflow. Cut Tovu over the same way earlier Tovu→Jini extraction lanes did (read the latest `ADS-memory/reports/cloud-results/` extraction reports to find the mechanism). Publishing is an owner step.
3. **Step 9 (activation):** land only the opt-in boot selection, OFF by default, plus the IPC hardening tests. No renderer change and no shipping pane.
4. **Scope per run:** run 1 = steps 0–6 (Jini only). Run 2 = steps 7–9 (Tovu cutover + opt-in). Push after each step. Each step must be green (tests + typecheck + guard/complexity/size) before the next one starts.
5. **Bugs:** the 7 source findings in section E go to `development/open-bugs.md` (done by the coordinator). Fix each one with its failing test first, in the step the plan names.
6. **Owner decisions (E.1–E.6):** take the plan's recommendations as defaults; the owner can override. Gemini = Antigravity label (literal Gemini CLI is a separate project). opencode ships; opencode-acp waits for its parity gate. Help Me! defaults to scoped grants.
7. Usual rules: no `--no-verify`, no `gitleaks:allow`, no edits to guards/thresholds/baselines except `api-baseline` files the plan names, functions <= 50 lines, complexity <= 10, `_optional = {}` pads, no re-export shells.
