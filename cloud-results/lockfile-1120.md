**Jini `release/lockfile-1120` @ JINI_SHA · Tovu `release/lockfile-1120` @ TOVU_SHA**

# lockfile-1120 — Tovu half (2026-11-21) — PARTIAL: lockfiles not regenerated (Jini 0.7.3-next.1 not on npm)

Authoritative full report (all 13 steps, Jini commits, decisions): Jini `cloud-results/lockfile-1120.md` on `release/lockfile-1120`. This file covers Tovu only.

Base: `origin/integ/merge-7-2026-11-20` @ `8d1a4c274` (`cloud-results/combine-7-tovu.md` present, as a draft, at 01:36 UTC). Node 24.22.3. `npm ci --ignore-scripts` (root, apps/admin, apps/desktop) 0; `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` (Jini at the release branch tip); `packages/contracts` + `packages/sdk` built.

## Commits
| SHA | what |
|---|---|
| `71cd5a84b` | Pairs for the Jini API changes (R8a/R8b hosts re-done on the split daemon scope; R11a agent-plugins effects + plugin-runtime `fileLock`; R11b-1 mcp `files`, sidecar `writer`) and the manifest bump: every `@jini-ai/*` range in root, apps/admin, apps/desktop, apps/site-chat, packages/contracts, packages/sdk → `^0.7.3-next.1` (provider-plugins exact), the `@jini-ai/chat@` override selector, `@jini-ai/node-adapters` declared at root and apps/desktop |
| `aa9f8d3db` | desktop test: the Antigravity install pin includes the `files` port |
| `8258649f5` | pair for Jini's sidecar adapter ports: 4 `createNodeDaemonProcessAdapter` callers pass `nodeProcessControl` + `nodeCommandShell({ env })`; `createOwnTreeReaper` takes an optional `processes` port |
| (this report) | docs |

### R8 host pairs (the daemon-r8-2 Tovu patches did not apply: `agent-daemon-scope.ts` was split since)
- `agent-daemon-scope-runtime.ts`: `createScopeAgentExecutor` builds `daemon-runtime-ports.ts`' runtime ports and one `createAgentRuntimeBindings({ runtime }) satisfies AgentRuntimePort`, passes `{ lifecycle, runtime, hostEnv, agentRuntime }`, returns `{ agentExecutor, agentRuntime, daemonRuntime }`; `startBridgeProbe` passes `spawn` + `hostEnv`. The comment on why the picker's runtime is bound moved with the code.
- `failRunBeforeStart` with a startup exception needs `startupMessage` (daemon R8b): threaded as `RunStartRequired.startupMessage` (`agent-daemon-run-start.ts`, `agent-daemon-run-launch.ts`, fixtures).
- `executor-definition-policies.ts` deleted (the binding owns the Codex/Pi policies). Desktop `desktop-agent.ts` the same shape (`desktopDaemonRuntimePorts`).

## Lockfiles: NOT regenerated (blocked)
`npm install` cannot resolve `@jini-ai/*@0.7.3-next.1` nor `@jini-ai/node-adapters` (never published) until the Jini tag publishes; there is no npm auth in this container. So `package-lock.json`, `apps/admin/package-lock.json` and `apps/desktop/package-lock.json` still pin 0.7.0 (incl. the downgraded `@jini-ai/core` 0.7.0) and are **out of sync with the bumped manifests: `npm ci` fails on this branch until re-locked**. Nothing tarball-based was written into any lockfile.
After the publish: `npm install` at root, `apps/admin`, `apps/desktop` → commit the three lockfiles → `npm ci` (all three) must pass → re-run `apps/desktop/src/jini-mcp-peers.test.ts`.

## Checks (linked to the Jini tip; vs combine-7 final outputs in `cloud-results/combine-7-tovu-*.txt`)
| check | result |
|---|---|
| `npm run typecheck` | 0 |
| `npm run typecheck:tests` | 0 |
| admin `tsc --noEmit` | 0 |
| desktop `npm run typecheck` (4 configs) | 0 |
| `check:boundaries` | 20 errors / 111 warnings = combine-7 (module count +3) |
| `check:architecture` | identical |
| `typecheck:scripts` | identical (3 base-red) |
| `worker-import-graph.test.ts` | identical case list (base-red incl. `C7-theme-preview-refresh-public-barrel`) |
| website assistant/daemon tests (changed files + every `agent-daemon-server*`) | 203/208; the 5 red also fail on the base (source-shape wiring tests) |
| sidecar-adapter callers (local-site-child, daemon-supervisor, local-site-process, assistant-daemon-registry) | 56/56 |
| desktop agent / agent-runtime / agent-service / jini-mcp-peers | 62/64; red = the 2 lock-vs-manifest checks (integrations, sidecar) until re-lock |
| COMMIT-PLAN mutations (tv-z1 H-LIST-NEWS `+ 1` and `>=`, H-LIST-VISITOR `>=` and dropped `truncated`) | 4/4 killed, sources restored |

Not run here: the remaining COMMIT-PLAN mutations (tv-b3 beyond RC-W1, tv-b4 idiom bypasses, tv-y2 DC checks, tv-z1 comment/`Cancel`), the packaged desktop install-from-archive boot and the Chrome checks (coordinator, locally).

## Red lines
`npm ci` fails until the three lockfiles are regenerated; `jini-mcp-peers.test.ts` lock-sync ×2 (same cause). Everything else equals combine-7's final.
