Programmer(Direct): Implemented jobs A, C and D across 22 files. [Full file list, regressions and handoff]( /Users/la/Programming/Tovu/ADS-memory/.local-artifacts/codex/2026-11-05-day/BA-result.md).

The diagnostic loss came from [Tovu’s startup catch](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/website/src/server/inbound/assistant/agent-daemon-scope.ts:1016) and [Jini’s recovery launch catch](/Users/la/Programming/tovu-integration-clones/prov2-jini/packages/chat/src/server/durable-runs/recover.ts:171). They now preserve redacted stage/cause evidence capped at 2 KiB, including through reload and replay. Also added the fallback size flag, accessible permission help, and job D’s fixture/profiler repairs.

Regressions cover redaction/bounds, startup stages, persistence/replay, uncertain-launch safety, argv, tooltip interaction and profiler defaults. **No tests ran.** Agent-runtime tsc passed; chat/daemon tsc reported stale package exports and untouched sanitizer errors. Jini package refresh remains with integration. The 503 and historical recovery triggers remain **UNVERIFIED**.

Cost: no new polling; each rejected recovery launch adds one checkpoint reading/writing the saved projection plus ≤2 KiB. Sibling edits were preserved; no commits.

Exact test commands, after integration refreshes the Jini package set:

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