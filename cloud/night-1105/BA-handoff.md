Programmer(Direct): Jobs A, C and D implemented in the integration clones. No tests, builds, installs, servers, localhost requests, commits or pushes ran. Existing sibling edits were preserved. Pattern confirmation came from the owner brief. RED/GREEN execution is intentionally absent under the owner's no-tests rule.

## Root causes and resulting behavior

- Tovu `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts:1016` (previously 1007) replaced caught startup exceptions with generic prose. Static stage tracking now accompanies the original thrown value into Jini's existing error event. The CLI-bridge rejection uses the same path. Existing terminalization and release behavior stays in place.
- Jini `packages/daemon/src/session-coordination.ts:105` accepts optional startup evidence. Jini `packages/agent-runtime/src/diagnostics.ts:19` formats it using core's shared redactor, preserves message/code/cause (deepest first, at most four causes), avoids stack/request/environment serialization, handles cycles/hostile getters and caps the complete result at 2,048 UTF-8 bytes after redaction.
- Jini `packages/chat/src/server/durable-runs/recover.ts:171` (previously 152) discarded rejected launch responses. A status notice now records redacted stage/cause through an optional existing-ledger checkpoint port. It does not declare the attempt dead. Its stage distinguishes launch from recovery-clock persistence. The attached watcher retains the diagnostic in its replay baseline, including after reload. Existing probes, CAS fencing, reconstruction/native-resume decisions and retry budgets remain authoritative.
- The same recovery file previously kept only the last 300-character diagnostic line. Startup stage/cause blocks now survive the exhausted notice within the 2 KiB bound.
- Tovu `apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts:377` omitted the V8 size flag from fallback argv. The common argv builder now puts exactly one `--optimize-for-size` before either script extension, preserving workspace identity.
- Jini `packages/agent-runtime/src/native-tool-policy.ts:88` pointed to vague settings and hardcoded alternate agents. It now names gear → More settings → Agent permissions and an available compatible agent. Jini `packages/chat/src/react/features/chat-pane/components/AgentRuntimePicker.tsx:65` reuses accessible InfoTip for that warning.
- D: layout fixture used the wrong env argument; cold daemon registration invalidated the token test's automatic-start assumption; profiler inferred running from idle settings although cold/synthetic workloads do not demand the real daemon. See BA-D-handoff.md for exact lines and reasoning.

## Files changed

Tovu clone `/Users/la/Programming/tovu-integration-clones/prov2-tovu`:

- `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts`
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-startup-cause.unit.test.ts` (new)
- `apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts` (one checkpoint adapter)
- `apps/website/src/server/__tests__/assistant-launch-cause.unit.test.ts` (new)
- `apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts`
- `apps/website/src/server/runtime/lifecycle/__tests__/daemon-size-flag.unit.test.ts` (new)
- `apps/website/src/server/runtime/lifecycle/__tests__/daemon-identity.test.ts`
- `apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts`
- `development/scripts/__tests__/site-plugin-directories.test.mjs`
- `development/scripts/__tests__/measure-site-memory.test.mjs`
- `development/scripts/measure-site-memory.mjs`

Jini clone `/Users/la/Programming/tovu-integration-clones/prov2-jini`:

- `packages/agent-runtime/src/diagnostics.ts` (existing public barrel already exports diagnostics)
- `packages/agent-runtime/src/__tests__/startup-failure.test.ts` (new)
- `packages/agent-runtime/src/native-tool-policy.ts`
- `packages/agent-runtime/src/__tests__/native-tool-compatibility.unit.test.ts`
- `packages/daemon/src/session-coordination.ts`
- `packages/daemon/src/__tests__/startup-failure.test.ts` (new)
- `packages/chat/src/core/durable-runs/ports.ts`
- `packages/chat/src/server/durable-runs/recover.ts`
- `packages/chat/src/server/durable-runs/__tests__/recover-boundaries.test.ts`
- `packages/chat/src/react/features/chat-pane/components/AgentRuntimePicker.tsx`
- `packages/chat/src/react/features/chat-pane/__tests__/components/AgentRuntimePicker.native-policy.unit.test.tsx`

Cloud-failure broadly owns test fixes and daemon-diagnostics owns related runtime territory. Changes in those areas are limited to this brief's startup evidence, argv, fixtures and assertions; no sibling patches were reverted. Jini's AGENTS explicitly requires a helper; that helper owned only D. No package versions/locks or schema changed.

## Regression evidence added (not executed)

- Original stage, nested cause and OS code; credential redaction before UTF-8 truncation; cyclic/plain/hostile thrown values.
- Pre-spawn error event before terminalization; actual Tovu onStarted attachment-stage wiring with injected failure/lifecycle.
- Rejected recovery launch persisted then reloaded; uncertain probe cannot duplicate execution; attachment still occurs if diagnostic persistence fails; exhausted notice retains long startup evidence.
- Real in-memory ledger wiring preserves saved answer plus launch cause through storage reload and daemon replay. Injected clock/timer ports; no sleeps or external services.
- Exactly one fallback size flag before .js/.ts script paths; workspace identity retained.
- Exact permission navigation and dynamic CLI label; InfoTip touch and keyboard disclosure; no toolbar paragraph.
- Explicit fixture environment; absent cold/synthetic daemon; existing explicit-running guard; owner login and activation before direct listener's 401 assertion.

## Verification performed

- `npx --no-install tsc --noEmit -p packages/agent-runtime`: PASS after final runtime changes (exit 0).
- `npx --no-install tsc --noEmit -p packages/chat`: exit 2, TS2305 for `startupFailureMessage` because installed agent-runtime declarations predate this export.
- `npx --no-install tsc --noEmit -p packages/daemon`: exit 2, same TS2305 plus untouched `agent-executor/events.ts:525–526` and `agent-executor/__tests__/agent-executor.test.ts:3002,6498` errors concerning `line` versus `live | until-close` and `sanitize` on never.
- `git diff --check`: PASS in both clones. No claim that tests pass or runtime incidents are resolved.
- Bounded typecheck logs: `/tmp/ba-agent-runtime-tsc-final.log`, `/tmp/ba-chat-tsc.log`, `/tmp/ba-daemon-tsc.log`.

## Architecture, reuse and function review

Reuse: startup evidence uses agent-runtime diagnostics + core formatErrorForLog, daemon failRunBeforeStart and chat's existing error translation. Recovery persistence uses the existing fenced ledger checkpoint; replay uses the existing attempt baseline. UI uses InfoTip and the existing launch-policy assessor. D uses the current layout optional-env port, loginAsOwner, activation endpoint and measurement fakes.

Generic formatting/persistence policy belongs to Jini; Tovu only names its preparation stages and supplies the ledger adapter. No vendor imports, plugin cross-imports, schema changes or new retries. Sections 13/14 and the authorized plan supplied the boundaries. The governance ADR registry has no matching production scope for these paths. Missing clone-local registry was read from the original read-only memory workspace. Graph MCP/local graph artifacts were unavailable; bounded fresh source reads confirmed the flow.

Function review: formatter and its two private helpers are pure with bounded cause traversal; failure emission remains a best-effort effect followed by mandatory finish; recovery launch and attachment retain their existing effects/fences. Added decisions stay within complexity 10; existing large wiring functions gain only stage assignments. Resource bound: 2 KiB diagnostic, four causes, no caller-variable service fanout. Review caught and fixed replay loss of a newly persisted status and stage attribution of clock-update errors. No locally fixable finding remains identified; execution evidence remains open.

Documentation: startup formatter and checkpoint port are documented; failRunBeforeStart contract and recovery orchestration/replay comments updated. Profiler defaults and existing why-comments were preserved/corrected. Obvious argv literal and declarative InfoTip markup need no extra documentation.

## Cost (frequency × payload)

- Pre-spawn failure: existing error event × ≤2 KiB total text, once per failed attempt; no extra event/poll.
- Rejected recovery launch/clock confirmation: one added checkpoint per rejection. Its existing indexed active-row read returns saved content C + saved events E + scalar metadata; its guarded write carries C + E + ≤2 KiB diagnostic + fixed status/JSON overhead. This reuses full projection persistence and can rewrite a multi-MB row. Transaction/receipt scalar reads follow the existing checkpoint implementation; no conversation/whole-collection read and no hot-path polling added.
- Attachment replay adjustment: CPU-only scan of already loaded events per attach; zero new reads/writes/polls.
- Size flag, permission wording and InfoTip: zero I/O.
- D product/profiler defaults: zero new requests. Integration setup per selected token test: one login POST × about 42 bytes JSON plus response/cookie; one activation POST × empty body / 0-byte successful response, with the existing readiness probe. No extra polling loop.

## Open / next routing

1. Activation 503 and historical recovery triggers remain UNVERIFIED. This patch preserves evidence for the next failure; it does not diagnose either incident.
2. Integration owner must refresh/release agent-runtime before dependent chat/daemon, then update Tovu's consumed packages. No versions, lockfiles, builds or installs were touched here. Current source depends on that new public formatter and optional checkpoint port.
3. TestRunner must execute the exact commands below after the Jini package set is refreshed. No RED/GREEN, browser/touch runtime, packaged desktop, cloud timeout, or memory saving result is claimed.
4. If the diagnostic checkpoint's store is unavailable, the watcher still receives the evidence and retains it for its existing persistence path; a crash while storage remains unavailable can still lose it. No diagnostic-only retry was added.

## Exact test commands (not run)

Run from each stated package directory, after the integration owner refreshes the package set:

```bash
cd /Users/la/Programming/tovu-integration-clones/prov2-jini/packages/agent-runtime
npx --no-install vitest run --maxWorkers=2 src/__tests__/startup-failure.test.ts src/__tests__/native-tool-compatibility.unit.test.ts
cd /Users/la/Programming/tovu-integration-clones/prov2-jini/packages/daemon
npx --no-install vitest run --maxWorkers=2 src/__tests__/startup-failure.test.ts src/__tests__/agent-run-concurrency.test.ts
cd /Users/la/Programming/tovu-integration-clones/prov2-jini/packages/chat
npx --no-install vitest run --maxWorkers=2 src/server/durable-runs/__tests__/recover.test.ts src/server/durable-runs/__tests__/recover-boundaries.test.ts src/react/features/chat-pane/__tests__/components/AgentRuntimePicker.native-policy.unit.test.tsx src/react/features/chat-pane/__tests__/components/AgentRuntimePicker.access-note-icon.unit.test.tsx
cd /Users/la/Programming/tovu-integration-clones/prov2-tovu
node --test --test-timeout=60000 --test-concurrency=2 development/scripts/__tests__/measure-site-memory.test.mjs
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-timeout=60000 --test-concurrency=2 apps/website/src/server/inbound/assistant/__tests__/agent-daemon-startup-cause.unit.test.ts apps/website/src/server/__tests__/assistant-launch-cause.unit.test.ts apps/website/src/server/runtime/lifecycle/__tests__/daemon-size-flag.unit.test.ts apps/website/src/server/runtime/lifecycle/__tests__/daemon-identity.test.ts development/scripts/__tests__/site-plugin-directories.test.mjs
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-timeout=60000 --test-concurrency=2 --test-name-pattern='tovu serve mints TOVU_AGENT_DAEMON_TOKEN' apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts
```
