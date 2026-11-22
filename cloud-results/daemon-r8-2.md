# daemon-r8-2 (2026-11-18), Tovu side: R8a step 5 + R8b step 6 hosts re-applied onto refactor/terra. PARTIAL: delivered as a verified patch series, blocked by the lockfile rule

Authoritative full report: Jini `cloud-results/daemon-r8-2.md` on `wave3/daemon-r8-2` (Jini pushed tip `cf2f7456`). Branch here is `wave3/daemon-r8-2` from `origin/refactor/terra` (`b5fbf2a5`); it carries only this report and the patches, no source change, because the source change needs a new dependency.

## Why nothing is applied to the tree

The two hosts (`apps/website/.../agent-daemon-scope.ts` via `daemon-runtime-ports.ts`, and `apps/desktop/src/desktop-agent.ts`) must import the Node bindings from `@jini-ai/node-adapters/{fs,process}` (terra moved them out of `@jini-ai/platform/runtime-ports/*`; the old path no longer exists and no forwarder was left). Neither the root nor `apps/desktop` declares `@jini-ai/node-adapters`; declaring it changes `package-lock.json`, which the lockfile rule (until 2026-11-19) forbids, and my attempt to add the line to `package.json` was refused by the permission classifier (not worked around). It also needs a Jini release that includes `@jini-ai/node-adapters` with `nodeSpawnPort`/`createSpawnPort`/`nodeCommandShell`, and it depends on the Jini series (daemon `createAgentExecutor({ lifecycle, runtime, hostEnv, agentRuntime })`).

## Patches (`cloud-results/daemon-r8-2/tovu/`, apply with `git am --3way`; checked in a throwaway worktree: applies cleanly, tree equals my tested tree)

| # | Original | Result |
|---|---|---|
| 0001 | `6b058e2a` R8a step 5 | **Re-done:** conflict in the `desktop-agent.ts` import block (terra renamed `registerToolCatalogRoutes` -> `toolCatalogRoutes` and added `daemonRouteHost`/`mountJiniRoutes`); kept terra's lines, added the three port imports from `@jini-ai/node-adapters`. `daemon-runtime-ports.ts` imports `@jini-ai/node-adapters/{fs,process}`. |
| 0002 | `334aa87d` R8b step 6 | **Re-done:** conflict in `agent-daemon-scope.ts` imports (terra's `toolCatalogRoutes` kept; `executorDefinitionPolicies` import dropped, `createAgentRuntimeBindings` and the `AgentRuntimePort` type added). `executor-definition-policies.ts` deleted. The check:why-comments gate flagged 2 deleted blocks, now allow-listed with reasons in `development/why-comments-debt.json` (nested-copy hazard comment: reworded in place above the `agentRuntime` binding; `executor-definition-policies.ts` header: obsolete with the module). |

To land: after the Jini series, add `"@jini-ai/node-adapters": "^0.7.0"` after `@jini-ai/mcp` in `dependencies` of the root `package.json` and `apps/desktop/package.json`, run `npm install` (lockfiles) and fold that into patch 0001. Until then Tovu's own test `apps/desktop/src/jini-mcp-peers.test.ts` "runtime source imports declare their packages instead of relying on hoisting" fails on exactly `@jini-ai/node-adapters` in `desktop-agent.ts` and `daemon-runtime-ports.ts` (seen below). Alternative without a new dependency: the hosts state the five bindings themselves from `@jini-ai/platform` functions (duplicates node-adapters; not done).

## Gates (exact commands, `/home/user/Tovu`, scratch tree = the patch series, Jini linked at its full-series build, `node-adapters` symlinked by hand into `node_modules` and `apps/desktop/node_modules`)

- `node_modules/.bin/tsc -p tsconfig.json --noEmit` exit 0; `NODE_OPTIONS=--max-old-space-size=6144 node_modules/.bin/tsc -p tsconfig.tests.json --noEmit` exit 0.
- `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2` over 42 test files that read the touched sources (run-scoped-credential, run-ownership, agent-daemon-server.*, agent-daemon-scope*, shared-agent-daemon, typed-tools integration, assistant-run-finalizer, run-lifecycle-tracing, daemon-access): 408 tests, 408 pass.
- `cd apps/desktop && node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=2 src/desktop-chat-main.test.ts src/desktop-agent-runtime.test.ts src/desktop-agent.test.ts src/desktop-agent-inventory.test.ts`: 46/46.
- `cd apps/desktop && npm run gates` on the scratch tree: **exit 1**, 4 PASS (tree-quiet, typecheck, complexity, js-backslide), FAIL `tests` and `coverage`. The only failing test of the full node suite (2302 tests, 2291 pass, 1 fail) is the undeclared-dependency test above; coverage fails because the suite did not pass. Electron was installed in this container, so unlike the wave2 runs this is not an environment failure.
- `npm run check:size` exit 0 (188 debt entries); `check:complexity` exit 0; `check:hooks` exit 0; `npm run check:why-comments -- --base origin/refactor/terra` exit 1 before the allow-list, exit 0 ("2 comment blocks lost (2 allow-listed)") after.
- Pushed branch (terra + docs only): the desktop pre-push hook runs on push; result below in the pushed-SHA line of the final message.

## Overlaps with `origin/wave2/daemon-r7` (not merged)

`apps/desktop/src/desktop-agent.ts`, `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts`, `apps/website/src/assistant/__tests__/daemon-access.unit.test.ts`, `development/evals/tool-search-caller2-compliance-harness.ts`.
