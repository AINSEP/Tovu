# om-chat-3 — in progress

Branch: cloud/om-chat-3, based on origin/cloud/combine.

Desktop passes host-prepared image contents and read-only folders through Jini's existing executor contract. Antigravity's static connector is installed before dispatch through the existing Jini installer, using the effective personal-MCP grant. No per-run credentials are persisted. No picker lifecycle or staging service was added.

Validation:
- `node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test src/desktop-agent.test.ts` (apps/desktop, loopback enabled): base 19 passed; new tests red 2 failures; green 20 passed after implementation and explicit-grant fixture correction.
- `./node_modules/.bin/tsc -p apps/desktop/tsconfig.main.json --noEmit` (root): passed before final helper extraction, rerunning.
- Complexity ceiling 9: final run pending after extracting the attachment option wiring from the dispatch callback.

Open: selected-agent test-route adoption and its focused test; final typecheck/lint/build results.

Checkpoint: ce0e198d75ee023631d7ba3a4a6949b225df72b8 committed locally; push attempted but blocked by the desktop pre-push gates in a clean checkout lacking dependencies. Full desktop tests/coverage are required by the hook but excluded by this job's focused-test instruction; awaiting user clarification before running them. No hook/check bypass was used.

The Test agent route now passes only the requested agent ID to Jini discovery, preserving its forced refresh and existing unknown/unavailable responses.
- Focused route test: red after refreshed dependencies (expected agentIds, received whole-inventory request); green 2 passed.
- Desktop focused tests: 20 passed.
- Existing static registration owner test: 1 passed.
- Desktop main-process typecheck passed after rebuilding stale dependencies; website typecheck currently exposes stale chat declaration outputs, refresh in progress.
- Desktop changed code complexity ceiling 9 passed; changed website route complexity ceiling 10 passed.
