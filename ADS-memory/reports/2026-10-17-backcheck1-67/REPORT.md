# backcheck1-67 — round-1 backlog Codex shards check (2026-10-17)

## Commits (Tovu, branch restructure/apps-website-phased, not pushed)
- 9e220fe7f e-themes: 281 page tools return `theme` {id,tokens,tokensLight}; 323 Theme Explore reconciles file list on content-bus / preview-feed frames.
- 8bf369284 f-platform: 1495 `http.request.completed` log per request (requestId, method, routePattern, status); 1514 error-mapping/INFO.md envelope doc; 1518 safe-mode policy draft (ADS-memory/reports/2026-10-17-platform-foundations/).
- ebbdd09d1 h-misc: EXTRA `.cms-item` in SIDEBAR_CONTROL_SELECTOR (DONE); 300 Electron LICENSE + LICENSES.chromium.html into Resources/licenses (partial); 538 dev-link refusal regression test (guard, GREEN on HEAD by design).
- 7b5517fb8 i-public-react: 2983 no eager React fallback; React not preloaded for closed chat.
No Jini commits. No Codex follow-up rounds needed (no bugs found).

## RED -> GREEN
RED argued from diff in each commit message (HEAD not reverted: shared live tree, owner working).
GREEN (all under the lock, one command per acquire):
- website node --test pages theme-colour-contract + tool-registrations: 26/26
- admin vitest use-theme-explore.hooks.unit + use-sidebar-empty-click-toggle.hooks: 293/293
- admin vitest ThemeExplore.hooks.unit, ThemeExplore.unit, use-theme-explore-preview, use-theme-explore-theme: 128/128
- website node --test observability-middleware, install-route.unit, render, site-chat-markup, site-chat-static: 256/256
- desktop electron-builder-files.test.ts: 10/10; site-chat loader-host.test.ts: 10/10
- root `npm run typecheck`: FAIL, 11 errors, none in these shards (other lanes): settings/feature-flags.ts (evaluateFeatureFlag/FeatureFlagDecision missing from @jini-ai/core), media/purge-media.ts + forms/form-file-storage.ts (referenceCheck), content-analyzer/plugin.ts (metaDescription), site-evidence/collect-page-evidence.ts (performance). typecheck:e2e did not run (chained after tsc).
- apps/admin tsc: FAIL, 4 errors, none in these shards: lib/api.ts decodeApiError missing from @jini-ai/protocol + its test.
No mutation (owner working).

## LOOKs (Claude in Chrome, own tab, closed after)
(a) https://localhost:3000/ after `apps/site-chat npm run build:local` (dist was Oct 13; plain `build` refuses linked Jini): plain view loads only /site-chat/site-assistant-loader.js (5KB) + inline bubble CSS. Click on bubble -> site-assistant.css 12KB, site-assistant.js 762KB, remixicon; panel mounts with input + starter prompts. No prompt sent; panel closed.
(b) admin Themes > Explore basic-2 (non-active), site tovu-dev: shell add of render/pages/zz-backcheck-scratch.html -> no change after 8s (expected: no file watcher, todo 1341 open). Pressing "Reload preview" -> Pages 13 -> 14. Shell rm + Reload -> 14 -> 13, no error. Scratch file deleted.

## Warnings / for the coordinator
- Dev server :3000 was down ~11:25 (tsx watch alive, no child), back by ~11:30. Likely the feature-flags.ts unbuilt-Jini import, not these shards.
- 1495 behavior change: one console.info line per HTTP request on dev, desktop and Fly (app.ts passes no logger). Not structured JSON: Node inspect format "http.request.completed { ... }".
- 2983: with TOVU_SITE_CHAT_DEV_PROXY_URL set, or lazy assets missing, the public widget is now absent entirely (no script sets the proxy env).
- 323 covers agent writes + preview feed only; raw filesystem edits still need Reload preview (1341).
- sites.json md5 changed at 11:30:57 (05d5... -> 405a...); still exactly the 5 owner sites, same ids. Matches the dev-server restart (lastOpened), not these test runs (11:19-11:27). site-keys 860 unchanged; ~/Documents/Tovu unchanged.
- No test processes left by me.
