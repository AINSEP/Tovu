# Lane: jini-typecheck

## 1. Results
Runner: each package `typecheck` script sequentially + root `tsc -p scripts/tsconfig.json`. Summary file: jini-typecheck-summary.txt (LANE-DONE present).

| suite/package | exit | files | tests | tsc errors | secs |
|---|---|---|---|---|---|
| 39 packages with a typecheck script (admin, agent-plugins, agent-runtime, agentic, analytics, artifacts, capability-providers, chat, cli, cms, commerce, cookie-consent, core, daemon, db, desktop-host, devops, diagnostics, http-kit, infra, integrations, mcp, memory, oauth, platform, plugins, protocol, provider-plugins, registry, sandbox, search, server, sidecar, sqlite, ui-kit, ui, user-management, vibecoding) | all 0 | n/a | n/a | 0 | 2-33 each |
| scripts (root tsc -p scripts/tsconfig.json) | 0 | n/a | n/a | 0 | 3 |
| pnpm guard | 1 | n/a | n/a | n/a | n/a |

No non-zero tsc exit, so no "non-zero exit with zero error TS" case.

## 2. Failing tests
None (type-check lane; no tests).

## 3. Type/lint errors (`error TS` lines)
None. 0 across all packages and scripts.

## guard violation (1)
`[guard] R10-chatpane-public-surface packages/chat/src/react/features/chat-pane/components/ChatPane.tsx: imports "Icon" from "../../../components/Icon.js" (resolves outside features/chat-pane/**), but "Icon" is not in the public barrel's export list (packages/chat/src/react/index.ts) — a consumer of the published API could not reach this the same way ChatPane does`
Class: product bug (real guard rule R10 tripped; ChatPane imports Icon which the public barrel does not export). Not environment. Fix would be exporting Icon from the barrel or removing the import.
Other guard output: hardwiring HW1-HW9 all "0 new"; R13 MF3 skipped for codex/antigravity (codex, agy binaries absent: ENOENT) = environment, informational, not a failure.

## 5. Did not run
- plugin-catalog, plugin-fixture-provider: no `typecheck` script (skipped by lane).
- R13 MF3 live-model comparison for codex and antigravity: CLIs not installed.
