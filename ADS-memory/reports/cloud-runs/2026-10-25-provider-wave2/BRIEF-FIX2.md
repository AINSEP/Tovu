<<SUBAGENT_DISPATCH>>
# WAVE-2 FIX 2 (owner approved 2026-10-25 ~7:15 PM PT, 1 h 30 m / ~0.6M). Unattended: verify by measuring, never ask.
Read BRIEF-FIX.md + REPORT-FIX.md (this folder) and CODEX-FIX-JINI.md + CODEX-FIX-TOVU.md (Codex's check of the fix lane). Same owner rules (no vendor code in core, (requiredObj, optionalObj), CCN ≤ 10, MOVE "why" comments, smallest change, DI fakes, FAILING TEST FIRST, fake secrets built at runtime — gitleaks runs on main).
Continue Jini `cloud/prov-wave2-jini` and Tovu `cloud/prov-wave2-tovu`. Report → this folder `REPORT-FIX2.md`.

## ORDER (commit + push after each)
1. HIGH (Jini diagnostics fanout.ts:24-30): exactly-once app callback — cache the callback's result/error, refuse a second execution, return/rethrow the recorded outcome after scope execution; a tracker that swallows the callback's error must not hide it. Tests: run(fn){fn();return fn()} runs app work once; catch-and-return tracker still surfaces the app error.
2. HIGH (Tovu provider-config-source.ts:61-71): settings + secrets saved and read ATOMICALLY (one transaction write via the existing vault/kernel transaction mechanism; consistent snapshot read). Tests: failed second write leaves nothing partial; concurrent rotation can never pair old endpoint + new secret.
3. MED (Tovu project-store.ts:58-63): mint the project key by REUSING the site-key publication mechanism (private temp file + fsync + atomic link/rename); a concurrent opener never reads an empty file; a damaged key still refused. Also LOW: validate existing key file type/owner and refuse/repair modes broader than 0600 (match the site key's policy), and LOW: enable WAL via the shared SQLite init path.
4. MED (Jini posthog.ts:58): identify events carry authoritative site attribution + groups; traits cannot override site_id.
5. MED (Jini core-boundary.test.ts:71): remove the raw-text prefilter; escaped literals (`import('langfuse')`) caught by the full parser scan; test it.
6. MED (Tovu provider-plugins.ts:125-131): legacy `plugin:<id>` API credentials — migrate once into the declared provider fields if the mapping is unambiguous, else show a one-time re-entry notice on the plugin's Settings card. Pick the smaller safe option; never log values.

## HARD CAPS
1 h 30 m wall (stop new work at 1 h 15 m), ~0.6M tokens, no subagents — first cap: report, push, END. Never push main, never force-push, never npm publish, never touch RemoteTriggers, never self-reschedule. Kill by pid only; never leave test processes running.

## REPORT-FIX2.md
Per item: fix, test, mutation proof, commit. NOT-done list. End "WAVE2-FIX2 DONE <UTC>", wall, rough tokens.
