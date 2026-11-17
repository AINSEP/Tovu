# C6 continuation (wave 2), Tovu side

Unattended run, 2026-11-17. Branch `wave2/c6-cont` from `origin/refactor/terra` (`232764af`). Builds on Jini `wave2/c6-cont`
(report: Jini `cloud-results/c6-cont.md`). **Result: C6 COMPLETE. This branch changes no Tovu source:** the Tovu repoint of the first run
(`ae915fac`) and the desktop hunk (`c6-desktop.patch`, applied on `refactor/terra`) are already on the base, and the continuation's work is the
Jini HTTP sub-ports, which no Tovu file consumes yet (R7 wires them). This report is the only commit.

## What I verified on the base against this run's Jini checkout

Setup: Node 24.11.1, `npm ci` (root, and `apps/desktop` with `--ignore-scripts`: the Electron binary download is not needed for typechecks),
`JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` (root and desktop), `packages/contracts` and `packages/sdk` built.

| Gate (exact command) | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` (root) | 0 errors |
| `npx tsc -p tsconfig.{preload,renderer,main}.json --noEmit` in `apps/desktop` | 0 errors each (the desktop hunk is on the base) |
| `node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2` on `provider-plugins.unit.test.ts`, `run-lifecycle-tracing.unit.test.ts`, `plugin-prompt-prefix.unit.test.ts` (`TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json`) | 68/68 |
| `node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=2 src/desktop-agent-runtime.test.ts src/desktop-agent-inventory.test.ts` in `apps/desktop` | 19/19 |

Not run: the full website/admin suites, `lint`, `check:boundaries` / `check:size` / `check:complexity` (no Tovu file changed, so they cannot differ from the base output). `link-jini.mjs` modifies only untracked `node_modules`; the tree was clean before this report.

## What is left for Tovu after C6 (all in other lanes)

- After R8b step 6 lands in Jini: add `createAgentRuntimeBindings({ runtime: assistantRuntime }) satisfies AgentRuntimePort` in `agent-daemon-scope.ts` (`createSiteScope`) and `desktop-agent.ts`, pass `agentRuntime`, delete the two option lines (`codexDisablePlugins`, `piGracefulShutdownMs`) at `desktop-agent.ts:285-286` and `agent-daemon-scope.ts`. Not done here: the executor does not take the port until then, so the value would be unused.
- R7: the hosts bind `ProviderToolTurnPort` (the five `run<Provider>ToolTurn` functions, passed directly) and `XaiOAuthPort<PendingAuthCache>` (`server/src/__tests__/runtime-port-bindings.typecheck.ts` in Jini is the worked, compiling binding), and Tovu mounts them in its daemon-runtime composition.
- R4: `server/runtime/composition/jini-agents.ts` (`chatAgentFailures`) still has no importer.
