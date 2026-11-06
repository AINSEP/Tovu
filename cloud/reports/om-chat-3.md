# om-chat-3 — in progress

Branch: cloud/om-chat-3, based on origin/cloud/combine.

Desktop passes host-prepared image contents and read-only folders through Jini's existing executor contract. Antigravity's static connector is installed before dispatch through the existing Jini installer, using the effective personal-MCP grant. No per-run credentials are persisted. No picker lifecycle or staging service was added.

Validation:
- `node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test src/desktop-agent.test.ts` (apps/desktop, loopback enabled): base 19 passed; new tests red 2 failures; green 20 passed after implementation and explicit-grant fixture correction.
- `./node_modules/.bin/tsc -p apps/desktop/tsconfig.main.json --noEmit` (root): passed before final helper extraction, rerunning.
- Complexity ceiling 9: final run pending after extracting the attachment option wiring from the dispatch callback.

Open: selected-agent test-route adoption and its focused test; final typecheck/lint/build results.
