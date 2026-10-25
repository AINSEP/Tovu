<<SUBAGENT_DISPATCH>>
# FIX-WAVE FOLLOW-UP A (owner approved 2026-10-25 ~4:50 PM PT). Unattended: verify by measuring, never ask.
Read ../BRIEF.md (the fix-wave brief) + ../TEST-ANTIPATTERNS.md + RUN-PROTOCOL.md/COMMON.md first; same owner rules (DI fakes, CCN ≤ 10, smallest change, MOVE "why" comments, owner pins in ../BRIEF.md "OWNER DECISIONS" untouched).

## Work (in this order; failing test FIRST for every source change)
1. Codex test-quality findings (TESTS ONLY) — CODEX-F4.md (Jini, continue branch `cloud/fixwave-1025-F4`), CODEX-F7.md (Tovu, continue `cloud/fixwave-1025-F7`), CODEX-F8.md test findings (Tovu, continue `cloud/fixwave-1025-F8`). Each fixed test must FAIL against the mutation Codex describes (prove it, revert the mutation).
2. OWNER-APPROVED security fixes, Tovu `cloud/fixwave-1025-F8` (apps/website/src/features/publish-content + webhooks):
   a. backstop-policy: explicitly deny the `secrets_vault` table (independent of column names).
   b. backstop-policy: explicitly deny private/per-install CORE tables — classify each measured one (mail_suppression, mail_suppression_removals, mail_feedback_inbox, site_consent_heads, site_consent_revisions, setting_values_user, external_mcp_tool_approvals, agent_tool_attempts, form_delivery_jobs, form_delivery_plans, domain_binding, and any similar you find); plugin tables keep current rules. REMOVE F8's test pin that `deployments` is allowed (classify it instead).
   c. file-tree-policy + raw-file rules: recognise credential-config backup suffixes (`.bak`, `.old`, `~`, `.orig` on `.mcp.local.json`, `.npmrc`, `.env*`), files named exactly `.pem`/`.key`, `site.db.bak`, `*.sqlite3` backups.
   d. secret-scan-guard: scan tracked AND historical PATHS (before extension filtering / blob dedupe) for credential patterns; redact matched values in diagnostics.
3. Security REVIEW, Tovu `cloud/fixwave-1025-F7`: `apps/website/src/assistant/site/visitor-confirmations.ts:42` opens a surface exchange with `toolId: binding.executionId` for principal `anonymous-visitor`. Trace where `binding`/`executionId` comes from. If it is server-issued and cannot be chosen by the visitor → add it to the completeness scan's `DYNAMIC_BINDINGS` with a comment citing the trace; the RED test turns green. If a visitor can influence it → report at the TOP as a source bug, write the failing test, minimal fix.

## HARD CAPS (first hit → stop, report, push, END)
1 h 30 m wall (stop new work at 1 h 15 m), ~0.6M tokens, no subagents. Never push main, never force-push, never npm publish, never touch any RemoteTrigger, never self-reschedule. Kill by pid only. Never leave test processes running.
Code pushes ONLY to the three branches above. Report → Tovu `cloud/fixwave-1025-reports` at `ADS-memory/reports/cloud-runs/2026-10-25-fixwave/FU-A/REPORT.md` (`git pull --rebase` before push).

## REPORT
1. Headline (findings fixed / security fixes a–d / visitor review verdict / source bugs). 2. Per finding: test, mutation proof, commit. 3. NOT done. End "FU-A DONE <UTC>", wall, rough tokens.
