
## §2b Coverage — Tovu (node:test lcov, all 8 shards merged with `coverage-all-files`)
Whole-repo (apps/ packages/ content/ roots): **lines 284549/318978 = 89.2%, branches 75.4%, functions 63.2%**, 3054 files, **1044 NEVER-LOADED (0%)**. Caveat: apps/admin and apps/desktop renderer code is exercised by vitest/desktop tests, not these lcovs, so those areas read artificially low here. `check-route-coverage-floor`: line 82.85% (floor 88%), branch 80.20% (68%), funcs 65.08% (floor 93%) → FAIL. `check-area-coverage-floor`: FAIL — `development/scripts/area-coverage-floors.json` is missing from the repo. `classify-coverage-gaps`: 276 route files below tier threshold of 497 scanned — **ARCHITECTURE_DEBT 176** (complexity ≥ 10 blocks coverage; many admin-http routes sit at complexity exactly 10 vs the gate's max 9) and **TEST_GAP 100** (clean complexity, tests missing). Full text: raw/classify-coverage-gaps.log.

Per-area (lines / branches / functions %, files, never-loaded), lowest 25 areas with ≥ 15 files:

| area | files | never-loaded | lines% | branches% | funcs% |
|---|---|---|---|---|---|
| apps/admin | 798 | 798 | 0.0 | 0.0 | 0.0 |
| apps/desktop | 188 | 188 | 0.0 | 0.0 | 0.0 |
| content | 145 | 50 | 87.3 | 83.7 | 74.2 |
| apps/site-chat | 29 | 5 | 98.2 | 95.6 | 95.6 |
| apps/website | 1892 | 3 | 99.5 | 96.7 | 95.1 |

30 largest uncovered production files (Tovu, uncovered lines):

| file | status | uncovered | total lines |
|---|---|---|---|
| apps/desktop/main.ts | NEVER-LOADED | 535 | 535 |
| apps/website/src/server/inbound/assistant/agent-daemon-server.ts | NEVER-LOADED | 487 | 487 |
| apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts | NEVER-LOADED | 470 | 470 |
| apps/desktop/src/renderer/App.hooks.ts | NEVER-LOADED | 461 | 461 |
| apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx | NEVER-LOADED | 456 | 456 |
| apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts | NEVER-LOADED | 337 | 337 |
| apps/desktop/src/project-ipc.ts | NEVER-LOADED | 336 | 336 |
| apps/admin/src/App.hooks.ts | NEVER-LOADED | 286 | 286 |
| apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts | NEVER-LOADED | 285 | 285 |
| apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts | NEVER-LOADED | 279 | 279 |
| apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts | NEVER-LOADED | 250 | 250 |
| apps/desktop/scripts/verify-find-in-page.ts | NEVER-LOADED | 212 | 212 |
| apps/desktop/src/stage-payload-lib.ts | NEVER-LOADED | 212 | 212 |
| apps/desktop/src/tovu-server.ts | NEVER-LOADED | 204 | 204 |
| apps/desktop/src/smoke-packaged-chat-gate.ts | NEVER-LOADED | 181 | 181 |
| apps/desktop/src/renderer/use-find-in-page.hooks.ts | NEVER-LOADED | 180 | 180 |
| apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts | NEVER-LOADED | 177 | 177 |
| apps/desktop/scripts/verify-site-power.ts | NEVER-LOADED | 175 | 175 |
| apps/admin/src/features/security/rules.ts | NEVER-LOADED | 173 | 173 |
| apps/admin/src/lib/api.ts | NEVER-LOADED | 167 | 167 |
| apps/desktop/src/stage-payload-run.ts | NEVER-LOADED | 165 | 165 |
| apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts | NEVER-LOADED | 155 | 155 |
| apps/admin/src/features/media/rules.ts | NEVER-LOADED | 153 | 153 |
| apps/desktop/src/renderer/workspace-chat-transport.ts | NEVER-LOADED | 153 | 153 |
| apps/admin/src/features/roles/hooks/use-roles.hooks.ts | NEVER-LOADED | 152 | 152 |
| apps/admin/src/App.tsx | NEVER-LOADED | 150 | 150 |
| apps/admin/src/components/WidgetConfigFields/media-content-rules.ts | NEVER-LOADED | 149 | 149 |
| apps/desktop/src/tracked-sites.ts | NEVER-LOADED | 149 | 149 |
| apps/desktop/src/site-process-registry.ts | NEVER-LOADED | 146 | 146 |
| apps/desktop/src/site-dir-store.ts | NEVER-LOADED | 144 | 144 |
