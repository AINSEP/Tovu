# size-tovu — function-size refactor (partial)

Branch: `refactor/size-tovu` (from `origin/integ/wave-b`). Verified per file: eslint (repo config; size + complexity clean, ≤50 lines) and the tests next to each file.

Setup: Node 24.11 in ~/.local/node24; `npm ci --ignore-scripts`; Jini at `origin/integ/wave-b`
(`pnpm install --frozen-lockfile`, `pnpm -r build` — 11 Jini packages fail `tsc` on type errors but still emit dist),
linked with `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs`; `packages/contracts` + `packages/sdk` built with `tsc`.

## DONE (all now ≤50 lines, complexity clean)
| function | commit |
|---|---|
| requirePublishTrust (+ middleware) | d8497b78 |
| registerAdminPageDeleteRoute | a35ab6a1 |
| registerAdminPostUpdateRoute | 045b57e8 |
| saveCampaign | d3339d2f |
| registerAdminCustomCredentialsRoutes | 506bebd6 |
| registerPublishContentPeerTransportRoutes | f04f635a |
| buildBaseSystemOverlay (output md5-identical across all 12 flag combos, old vs new) | 67b7ae26 |
| registerPublishTrustHandshakeRoutes | 069a3b16 |
| registerAdminDatabaseMigrateForwardRoutes | 51337f07 |

## SKIPPED
- AssistantDock (AssistantDock.tsx): ~40 hook calls + ~190-line JSX; needs a multi-bundle hook split plus a view split. Not attempted for budget; plan: 5 bundle hooks in a sibling `AssistantDock.state.hooks.ts` + `DockChatPane` view.

## NOT REACHED
Everything else in `size-lanes/tovu.txt` not listed above (all other admin hooks/components, apps/website cli/features/server entries, assistant-byok, assistant-chats, assistant-run-finalizer, apply-loop, sites/site-shares/site-imports/publish-credentials/publish-site/import routes, etc.).

## size-debt.json entries now removable
requirePublishTrust#1 and requirePublishTrust#1.requirePublishTrustMiddleware#1; registerAdminPageDeleteRoute#1 and its `.<anonymous>#1`; registerAdminPostUpdateRoute#1 and its `.<anonymous>#1`; saveCampaign#1; registerAdminCustomCredentialsRoutes#1; registerPublishContentPeerTransportRoutes#1; buildBaseSystemOverlay#1; registerPublishTrustHandshakeRoutes#1; registerAdminDatabaseMigrateForwardRoutes#1.

## Pre-existing test failures (also fail on unmodified origin/integ/wave-b)
In the publish-content peer tests: "connecting learns the destination's workspace instead of asking a human for it", "a fresh install connects and then publishes, with no key displayed or copied", "forms and the active theme publish through a publishing grant" (3 of 102). Likely related to the Jini packages that fail to build here.
