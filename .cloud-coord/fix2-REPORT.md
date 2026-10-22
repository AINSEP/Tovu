# fix2 2026-10-22 REPORT (branch cloud/fix2-2026-10-22 in Tovu and Jini)

| item | result |
|---|---|
| C-1 Jini commerce rejected-replay ok:true | FIXED Jini c7284c90. Same-key replay of a rejected capture/void, or of a failed refund, returns the stored error (ok:false, retryable:false). A rejection is never retryable under its own key. Money-tool retry text now depends on error.retryable. The old race test that asserted ok:true on a rejected void was corrected. |
| A-1 /page/<n> rewrite hides redirects | FIXED Tovu 174b08d3. Redirect lookups use the ORIGINAL path; a /x/page/N whose listing is missing runs its own not-found rules before the 404. Rules were not moved ahead of the rewrite: that would run not-found rules before content resolution and break the documented order. |
| A-2 'unreachable' never clears | FIXED Tovu 2ffc1ed5. New reconnect.markReachable(), called after every successful requestRidingOutRestart. |
| R-1 Chrome guidance from def, not probe | FIXED Tovu d1caf3af. createAssistantChromeProbe uses published agent-runtime ensureAgentCapabilities (caps.chrome), cached under the agent id, so guidance, allowedTools and argv share one probe result. Probe failure or no probe = no Chrome. No Jini change. |
| R-3 update makes unverified plugin live | FIXED Tovu fa1dcb5b. Chose ALWAYS-ASK: agent_plugins_update approval edit/direct -> escalation/policy, with tool-metadata baseline updated. Smaller: one metadata entry, no lifecycle/MCP teardown. Every upload is unverified and bundled plugins cannot be updated, so "disable after unverified update" would have meant always disable. |
| L4a vendor logic in core | FIXED Tovu 826e4449. cloudflare plugin.json declares extensions.tovu.supersedes {packages, contributions[{fromPlugins, descriptorId, label}]}; new supersession.ts reads trusted manifests generically; refusal messages are word-for-word the same as before. Existing installs: boot re-packs content/ -> new digest -> reseed. If that reseed fails, the old manifest stays trusted, so supersession falls back to this build's bundled source plugin.json (tested). bundled-catalog.ts, deploy-split-activation.ts and migrations are untouched. |
| L4b dock drops message on POST /api/runs 500 | FIXED Tovu 4ff4aff7. agent-failure.ts returns an empty run id instead of rethrowing: the user's message stays and the failed reply shows the error in .jini-message-error. No auto-retry. A start the user stopped still rejects. Two older tests that asserted the old rejection were updated; their redaction checks are kept. |

## Tests run
- Jini commerce kernel vitest (full payments suite): 603 pass / 1 skipped. 100% stmt/branch/func/line on common.ts, capture-void.ts, refund.ts, money-tools.ts. Package tsc clean.
- A-1: pages.paging.route.test 13/13 (6 new, all red first); all pages.*.test 75/75. Changed lines 100% covered; pages.ts overall is not 100%, but every uncovered line was already uncovered.
- A-2: admin vitest server-reconnect, api-request-onok, ServerRestartingBanner: 35/35. server-reconnect.ts 100%.
- R-1: assistant-runtime-guidance unit 19/19 (100%); wiring 7/7; 17 agent-daemon-server.* files + 6 daemon files pass.
- R-3: install-tool-update 10/10; tool-metadata-projections, tool-approval-policy(+tw3), install-tool(+sources), plugin-install-catalog, mcp-ui-allowlist-completeness pass. agent-plugins.ts metadata 100%.
- L4a: lifecycle-binding + supersession 21/21; related regressions 88/88. supersession.ts 100%. lifecycle.ts 100% lines, 93.4% branches; every gap is in code that already had it.
- L4b: AssistantDock folder 626/626; agent-failure.ts 100%.
- Pre-existing failures, not from this job:
  - cross-site-read-catalog.test.ts fails 1/3 on the unmodified base too (verified).
  - admin auth-warning-layout.unit.test.ts cannot load: it reads @jini-ai/chat/src/...styles.ts, which the published package does not ship.

## tsc
- Root `npx tsc -p tsconfig.json --noEmit`: 0 errors (base: 0).
- Admin `npx tsc --noEmit`: 0 errors.

## LOCAL-RUN NEEDED
- development/e2e/desktop/global-chat.desktop.ts:173 (Electron/Chromium) for L4b.
- Optional: a real `claude` CLI older than 2.1.307 for R-1 end-to-end.

## LOCAL VISUAL CHECK
- Admin "Can't reach the Tovu server" banner hides on the first successful request after an outage (A-2).
- Admin assistant dock (and guest site tab dock) with POST /api/runs -> 500: the user message is still there, and a failed reply shows the red "agent run failed to start (500)…" line (L4b).

## Owner questions
1. A-2: should any server answer (4xx/5xx) also clear 'unreachable'? Today only a successful request does.
2. A-1: a not-found rule on a missing parent (/about-old) no longer catches /about-old/page/2, which now 404s. Intended?
3. R-1: the probe only sees whether `--help` lists --chrome, not whether the extension is connected. Gating on the connection needs a Jini probe.
4. L4b: a persisted failed turn now has runId "". Is that OK for the server message store?
5. L4a: keep the source-manifest fallback permanently, or drop it once every install has re-seeded?
6. C-1 follow-up: a same-key replay of a still-open (dispatched/unknown) capture/void still returns ok:true replayed with the current payment view. Should that be ok:false retryable "unresolved"? Not changed: outside C-1's scope.
