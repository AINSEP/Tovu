# All-files coverage

| Metric | TRUE: all files | RUNNER: records only |
| --- | --- | --- |
| lines | 157079/173189 (90.70%) | 157079/162666 (96.57%) |
| branches | 72319/81643 (88.58%) | 72319/73952 (97.79%) |
| functions | 15922/19264 (82.65%) | 15922/16419 (96.97%) |

Never-loaded files: **254** / 2716

- NEVER-LOADED denominators are AST estimates (distinct executable statement start lines, function bodies, branch arms).
- LCOV lacks columns: functions/branches merge by source line and ordinal; different instrumentation layouts may not correspond.
- LOADED means a coverage record exists, including zero-hit include records.

## Exclusions (first matching group)

| Group | Files | Up to 5 examples |
| --- | ---: | --- |
| non-source | 698 | packages/README.md, packages/admin/CHANGELOG.md, packages/admin/README.md, packages/admin/docs/spec/api.spec.md, packages/admin/docs/spec/behavior.spec.md |
| dependencies/build/output | 9 | packages/devops/src/checks/coverage/__tests__/coverage.test.ts, packages/devops/src/checks/coverage/__tests__/disk.test.ts, packages/devops/src/checks/coverage/__tests__/integrity.test.ts, packages/devops/src/checks/coverage/diff.ts, packages/devops/src/checks/coverage/disk.ts |
| test/fixture | 2801 | packages/admin/src/__tests__/fetch-query-support.ts, packages/admin/src/__tests__/fqfix-loading.unit.test.tsx, packages/admin/src/agent-plugins/__tests__/controllers.test.ts, packages/admin/src/agent-plugins/__tests__/http.test.ts, packages/admin/src/agent-plugins/__tests__/package-file-tree.hwa.test.ts |
| declaration | 5 | packages/agent-plugins/core/persistent-state.d.ts, packages/agent-plugins/persistent-state.d.ts, packages/core/plugin-directory.d.ts, packages/ui/src/vitest-env.d.ts, packages/ui/src/vitest-jest-dom.d.ts |
| generated | 1 | packages/ui/src/react/components/agent-icon-data-uris.generated.ts |
| type-only | 247 | packages/admin/src/agent-plugins/models.ts, packages/admin/src/comments/models.ts, packages/admin/src/core/data-table/types.ts, packages/admin/src/core/gated/types.ts, packages/admin/src/core/manifest/types.ts |

## Packages / top-level areas

| Area | Files | Never loaded | Lines | Branches | Functions |
| --- | ---: | ---: | --- | --- | --- |
| packages/admin | 337 | 2 | 13384/13784 (97.10%) | 6870/7131 (96.34%) | 1889/1992 (94.83%) |
| packages/agent-plugins | 61 | 6 | 4240/4591 (92.35%) | 2695/2875 (93.74%) | 533/628 (84.87%) |
| packages/agent-runtime | 146 | 24 | 12640/14374 (87.94%) | 6752/8275 (81.60%) | 1251/1587 (78.83%) |
| packages/agentic | 45 | 1 | 2814/2820 (99.79%) | 1444/1470 (98.23%) | 278/280 (99.29%) |
| packages/analytics | 6 | 1 | 332/338 (98.22%) | 192/193 (99.48%) | 34/36 (94.44%) |
| packages/artifacts | 10 | 0 | 702/702 (100.00%) | 355/356 (99.72%) | 73/73 (100.00%) |
| packages/capability-providers | 19 | 1 | 1095/1128 (97.07%) | 405/430 (94.19%) | 114/114 (100.00%) |
| packages/charts-recharts | 12 | 2 | 228/266 (85.71%) | 90/102 (88.24%) | 26/32 (81.25%) |
| packages/chat | 192 | 138 | 3733/10537 (35.43%) | 2397/7156 (33.50%) | 423/2336 (18.11%) |
| packages/cli | 17 | 1 | 1074/1076 (99.81%) | 664/668 (99.40%) | 123/123 (100.00%) |
| packages/cms | 254 | 3 | 15783/16970 (93.01%) | 7381/7629 (96.75%) | 1631/1725 (94.55%) |
| packages/commerce | 24 | 1 | 168/1874 (8.96%) | 10/22 (45.45%) | 10/22 (45.45%) |
| packages/core | 91 | 3 | 4876/5152 (94.64%) | 2139/2273 (94.10%) | 455/490 (92.86%) |
| packages/daemon | 101 | 2 | 10232/10446 (97.95%) | 5234/5312 (98.53%) | 1157/1184 (97.72%) |
| packages/db | 82 | 7 | 2995/3707 (80.79%) | 1250/1406 (88.90%) | 349/411 (84.91%) |
| packages/desktop-host | 63 | 1 | 2263/2275 (99.47%) | 1174/1199 (97.91%) | 382/391 (97.70%) |
| packages/devops | 41 | 33 | 273/1790 (15.25%) | 130/1311 (9.92%) | 28/461 (6.07%) |
| packages/diagnostics | 33 | 2 | 2395/2419 (99.01%) | 1358/1391 (97.63%) | 302/307 (98.37%) |
| packages/http-kit | 24 | 1 | 896/902 (99.33%) | 481/483 (99.59%) | 108/109 (99.08%) |
| packages/infra | 10 | 1 | 192/194 (98.97%) | 108/108 (100.00%) | 30/30 (100.00%) |
| packages/integrations | 77 | 1 | 5423/5437 (99.74%) | 2287/2298 (99.52%) | 495/495 (100.00%) |
| packages/mcp | 55 | 1 | 4071/4085 (99.66%) | 2028/2070 (97.97%) | 441/443 (99.55%) |
| packages/memory | 9 | 1 | 1085/1087 (99.82%) | 512/514 (99.61%) | 109/109 (100.00%) |
| packages/oauth | 38 | 6 | 1793/1949 (92.00%) | 931/1017 (91.54%) | 184/223 (82.51%) |
| packages/platform | 72 | 1 | 6697/6755 (99.14%) | 4218/4262 (98.97%) | 873/893 (97.76%) |
| packages/plugins | 41 | 0 | 2544/2731 (93.15%) | 1458/1526 (95.54%) | 290/299 (96.99%) |
| packages/protocol | 7 | 1 | 260/262 (99.24%) | 53/53 (100.00%) | 8/8 (100.00%) |
| packages/registry | 14 | 1 | 1028/1036 (99.23%) | 590/592 (99.66%) | 121/123 (98.37%) |
| packages/sandbox | 11 | 1 | 446/453 (98.45%) | 201/205 (98.05%) | 44/44 (100.00%) |
| packages/server | 17 | 2 | 1550/1566 (98.98%) | 596/600 (99.33%) | 158/166 (95.18%) |
| packages/sidecar | 13 | 1 | 918/932 (98.50%) | 399/413 (96.61%) | 91/93 (97.85%) |
| packages/sqlite | 2 | 1 | 1/8 (12.50%) | 0/0 (100.00%) | 0/2 (0.00%) |
| packages/ui | 655 | 2 | 43601/43995 (99.10%) | 14712/14953 (98.39%) | 3031/3119 (97.18%) |
| packages/ui-kit | 26 | 1 | 815/855 (95.32%) | 535/553 (96.75%) | 130/135 (96.30%) |
| packages/user-management | 94 | 2 | 5670/5823 (97.37%) | 2410/2528 (95.33%) | 698/723 (96.54%) |
| packages/vibecoding | 17 | 2 | 862/870 (99.08%) | 260/269 (96.65%) | 53/58 (91.38%) |

## Files (largest uncovered line gap first)

| File | Status | Uncovered lines | Lines | Branches | Functions |
| --- | --- | ---: | --- | --- | --- |
| packages/commerce/src/payments/lipay-plugin.ts | LOADED | 603 | 0/603 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts | NEVER-LOADED | 341 | 0/341 (0.00%) | 0/246 (0.00%) | 0/64 (0.00%) |
| packages/commerce/src/payments/providers/lipay-gateway.ts | LOADED | 263 | 0/263 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/embed-widget/vanilla/index.ts | NEVER-LOADED | 243 | 0/243 (0.00%) | 0/112 (0.00%) | 0/44 (0.00%) |
| packages/commerce/src/catalog/repo.ts | LOADED | 233 | 0/233 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/hooks/assistant-chats.ts | NEVER-LOADED | 230 | 0/230 (0.00%) | 0/126 (0.00%) | 0/73 (0.00%) |
| packages/devops/src/checks/hardwiring.ts | NEVER-LOADED | 220 | 0/220 (0.00%) | 0/252 (0.00%) | 0/58 (0.00%) |
| packages/chat/src/react/components/Markdown.tsx | NEVER-LOADED | 216 | 0/216 (0.00%) | 0/118 (0.00%) | 0/46 (0.00%) |
| packages/agent-plugins/core/persistent-state.js | NEVER-LOADED | 198 | 0/198 (0.00%) | 0/108 (0.00%) | 0/32 (0.00%) |
| packages/chat/src/react/components/QuestionForm.tsx | NEVER-LOADED | 189 | 0/189 (0.00%) | 0/206 (0.00%) | 0/88 (0.00%) |
| packages/chat/src/react/components/Composer.tsx | NEVER-LOADED | 187 | 0/187 (0.00%) | 0/176 (0.00%) | 0/53 (0.00%) |
| packages/chat/src/store/runtime/durable-run-store.ts | NEVER-LOADED | 181 | 0/181 (0.00%) | 0/186 (0.00%) | 0/72 (0.00%) |
| packages/devops/src/static-export/runner.ts | NEVER-LOADED | 177 | 0/177 (0.00%) | 0/122 (0.00%) | 0/29 (0.00%) |
| packages/chat/src/react/components/ToolCard.tsx | NEVER-LOADED | 164 | 0/164 (0.00%) | 0/196 (0.00%) | 0/45 (0.00%) |
| packages/devops/src/packaging/electron/staging.ts | NEVER-LOADED | 164 | 0/164 (0.00%) | 0/120 (0.00%) | 0/51 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/asset-harvest.mjs | NEVER-LOADED | 159 | 0/159 (0.00%) | 0/162 (0.00%) | 0/25 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/interaction-probe.mjs | NEVER-LOADED | 158 | 0/158 (0.00%) | 0/108 (0.00%) | 0/33 (0.00%) |
| packages/commerce/src/catalog/repo.rows.ts | LOADED | 157 | 0/157 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/audit-clone.mjs | NEVER-LOADED | 156 | 0/156 (0.00%) | 0/114 (0.00%) | 0/19 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneRuntimeInventory.hooks.ts | NEVER-LOADED | 153 | 0/153 (0.00%) | 0/52 (0.00%) | 0/36 (0.00%) |
| packages/agent-runtime/src/providers/connection-test.ts | NEVER-LOADED | 149 | 0/149 (0.00%) | 0/132 (0.00%) | 0/28 (0.00%) |
| packages/cms/src/taxonomy/repo.memory.ts | LOADED | 145 | 0/145 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/hooks/composer-draft-cache.ts | NEVER-LOADED | 141 | 0/141 (0.00%) | 0/94 (0.00%) | 0/25 (0.00%) |
| packages/chat/src/react/hooks/useComposer.ts | NEVER-LOADED | 137 | 0/137 (0.00%) | 0/68 (0.00%) | 0/36 (0.00%) |
| packages/cms/src/taxonomy/agent-tools.ts | LOADED | 136 | 0/136 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/recon-site.mjs | NEVER-LOADED | 133 | 0/133 (0.00%) | 0/146 (0.00%) | 0/50 (0.00%) |
| packages/chat/src/react/features/chat-pane/components/ChatPane.tsx | NEVER-LOADED | 131 | 0/131 (0.00%) | 0/100 (0.00%) | 0/42 (0.00%) |
| packages/chat/src/server/durable-runs/recover.ts | NEVER-LOADED | 124 | 0/124 (0.00%) | 0/148 (0.00%) | 0/35 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/compare-recon.mjs | NEVER-LOADED | 121 | 0/121 (0.00%) | 0/212 (0.00%) | 0/34 (0.00%) |
| packages/chat/src/store/sql/store.ts | NEVER-LOADED | 121 | 0/121 (0.00%) | 0/106 (0.00%) | 0/87 (0.00%) |
| packages/devops/src/checks/published-types/index.ts | NEVER-LOADED | 121 | 0/121 (0.00%) | 0/74 (0.00%) | 0/25 (0.00%) |
| packages/cms/src/widgets/resolvers/recent-entries.ts | LOADED | 120 | 7/127 (5.51%) | 0/0 (100.00%) | 0/12 (0.00%) |
| packages/chat/src/react/components/A2uiSurfaceCard.tsx | NEVER-LOADED | 114 | 0/114 (0.00%) | 0/70 (0.00%) | 0/22 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/route-crawl.mjs | NEVER-LOADED | 113 | 0/113 (0.00%) | 0/86 (0.00%) | 0/14 (0.00%) |
| packages/oauth/tests/helpers.ts | NEVER-LOADED | 108 | 0/108 (0.00%) | 0/62 (0.00%) | 0/27 (0.00%) |
| packages/devops/src/checks/hardwiring-node.ts | NEVER-LOADED | 107 | 0/107 (0.00%) | 0/88 (0.00%) | 0/31 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/visual-diff.mjs | NEVER-LOADED | 106 | 0/106 (0.00%) | 0/62 (0.00%) | 0/10 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useAgentRuntimePicker.hooks.ts | NEVER-LOADED | 106 | 0/106 (0.00%) | 0/78 (0.00%) | 0/24 (0.00%) |
| packages/devops/src/source-control/registry.ts | NEVER-LOADED | 106 | 0/106 (0.00%) | 0/108 (0.00%) | 0/44 (0.00%) |
| packages/chat/src/react/agent-bridge/frontend-session-bridge.ts | NEVER-LOADED | 105 | 0/105 (0.00%) | 0/55 (0.00%) | 0/27 (0.00%) |
| packages/chat/src/store/runtime/history-tools.ts | NEVER-LOADED | 105 | 0/105 (0.00%) | 0/90 (0.00%) | 0/25 (0.00%) |
| packages/chat/src/react/components/MessageRow.tsx | NEVER-LOADED | 102 | 0/102 (0.00%) | 0/102 (0.00%) | 0/26 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneAgentControl.hooks.ts | NEVER-LOADED | 102 | 0/102 (0.00%) | 0/44 (0.00%) | 0/27 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneWorkingDirectory.hooks.ts | NEVER-LOADED | 101 | 0/101 (0.00%) | 0/36 (0.00%) | 0/14 (0.00%) |
| packages/devops/src/static-export/transforms.ts | NEVER-LOADED | 101 | 0/101 (0.00%) | 0/96 (0.00%) | 0/34 (0.00%) |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/BubbleScene.tsx | NEVER-LOADED | 100 | 0/100 (0.00%) | 0/56 (0.00%) | 0/18 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/od-preview-rewrite.mjs | NEVER-LOADED | 99 | 0/99 (0.00%) | 0/66 (0.00%) | 0/17 (0.00%) |
| packages/chat/src/embed-widget/transports/fetch-sse.ts | NEVER-LOADED | 99 | 0/99 (0.00%) | 0/80 (0.00%) | 0/30 (0.00%) |
| packages/chat/src/react/components/ConversationList.tsx | NEVER-LOADED | 97 | 0/97 (0.00%) | 0/68 (0.00%) | 0/39 (0.00%) |
| packages/chat/src/react/features/chat-pane/rules.ts | NEVER-LOADED | 97 | 0/97 (0.00%) | 0/96 (0.00%) | 0/28 (0.00%) |
| packages/chat/src/react/hooks/useConversation.ts | NEVER-LOADED | 97 | 0/97 (0.00%) | 0/88 (0.00%) | 0/33 (0.00%) |
| packages/chat/src/react/features/chat-pane/create-daemon-attachment-uploader.ts | NEVER-LOADED | 96 | 0/96 (0.00%) | 0/52 (0.00%) | 0/23 (0.00%) |
| packages/chat/src/react/hooks/fab-position.ts | NEVER-LOADED | 93 | 0/93 (0.00%) | 0/44 (0.00%) | 0/16 (0.00%) |
| packages/chat/src/react/hooks/useRunStream.ts | NEVER-LOADED | 91 | 0/91 (0.00%) | 0/36 (0.00%) | 0/29 (0.00%) |
| packages/user-management/src/react/testing.ts | LOADED | 91 | 164/255 (64.31%) | 59/66 (89.39%) | 26/40 (65.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/dna-scaffold.mjs | NEVER-LOADED | 90 | 0/90 (0.00%) | 0/100 (0.00%) | 0/16 (0.00%) |
| packages/chat/src/store/legacy/sqlite/messages.ts | NEVER-LOADED | 90 | 0/90 (0.00%) | 0/88 (0.00%) | 0/20 (0.00%) |
| packages/chat/src/react/components/AttachmentPreviewModal.hooks.ts | NEVER-LOADED | 84 | 0/84 (0.00%) | 0/60 (0.00%) | 0/26 (0.00%) |
| packages/ui/src/features/memory/react/components/MemorySettingsPanel.tsx | LOADED | 83 | 2/85 (2.35%) | 0/0 (100.00%) | 0/1 (0.00%) |
| packages/admin/src/seo/messages.en.ts | LOADED | 82 | 0/82 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/chat/src/server/run-finalizer/entry.ts | NEVER-LOADED | 80 | 0/80 (0.00%) | 0/48 (0.00%) | 0/23 (0.00%) |
| packages/chat/src/store/runtime/run-ledger.ts | NEVER-LOADED | 80 | 0/80 (0.00%) | 0/62 (0.00%) | 0/40 (0.00%) |
| packages/db/src/transfer/table-catalog.ts | LOADED | 79 | 7/86 (8.14%) | 0/0 (100.00%) | 0/7 (0.00%) |
| packages/cms/src/widgets/write-service.ts | LOADED | 77 | 174/251 (69.32%) | 45/62 (72.58%) | 13/17 (76.47%) |
| packages/db/src/recovery/recovery-orchestrator.ts | LOADED | 77 | 0/77 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/scripts/generate-agent-icon-data-uris.mjs | LOADED | 77 | 0/77 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/mirror-site.mjs | NEVER-LOADED | 76 | 0/76 (0.00%) | 0/48 (0.00%) | 0/16 (0.00%) |
| packages/chat/src/react/hooks/useComposerHistory.hooks.ts | NEVER-LOADED | 75 | 0/75 (0.00%) | 0/38 (0.00%) | 0/23 (0.00%) |
| packages/core/src/primitives/sse.ts | LOADED | 75 | 1/76 (1.32%) | 0/0 (100.00%) | 0/4 (0.00%) |
| packages/chat/src/embed-widget/browser/lazy-loader.ts | NEVER-LOADED | 73 | 0/73 (0.00%) | 0/30 (0.00%) | 0/18 (0.00%) |
| packages/chat/src/embed-widget/vanilla/state.ts | NEVER-LOADED | 71 | 0/71 (0.00%) | 0/42 (0.00%) | 0/18 (0.00%) |
| packages/commerce/src/store/store-plugin.ts | LOADED | 71 | 0/71 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/forms/express/handler.ts | LOADED | 70 | 39/109 (35.78%) | 6/14 (42.86%) | 5/11 (45.45%) |
| packages/agent-runtime/src/skills/web-clone/scripts/sourcemap-hunt.mjs | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/42 (0.00%) | 0/8 (0.00%) |
| packages/devops/src/agent-jobs/jobs.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/60 (0.00%) | 0/17 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/network-capture.mjs | NEVER-LOADED | 68 | 0/68 (0.00%) | 0/48 (0.00%) | 0/8 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useRuntimeDropUp.hooks.ts | NEVER-LOADED | 68 | 0/68 (0.00%) | 0/34 (0.00%) | 0/16 (0.00%) |
| packages/cms/src/entries/tool-registrations.ts | LOADED | 65 | 59/124 (47.58%) | 7/8 (87.50%) | 6/11 (54.55%) |
| packages/devops/src/static-export/node-adapters.ts | NEVER-LOADED | 65 | 0/65 (0.00%) | 0/34 (0.00%) | 0/14 (0.00%) |
| packages/cms/src/content-types/tool-registrations.ts | LOADED | 64 | 73/137 (53.28%) | 8/11 (72.73%) | 6/11 (54.55%) |
| packages/chat/src/core/assistant-client/a2ui-action-poster.ts | LOADED | 62 | 0/62 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/core/plugin-directory.js | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/86 (0.00%) | 0/17 (0.00%) |
| packages/chat/src/react/features/chat-pane/components/AgentRuntimePicker.tsx | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/94 (0.00%) | 0/19 (0.00%) |
| packages/chat/src/react/hooks/useComposerHistoryKeys.hooks.ts | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/28 (0.00%) | 0/10 (0.00%) |
| packages/chat/src/react/components/McpUiSurfaceCard.tsx | NEVER-LOADED | 56 | 0/56 (0.00%) | 0/58 (0.00%) | 0/14 (0.00%) |
| packages/daemon/src/store/agent-sessions/sqlite.ts | LOADED | 56 | 11/67 (16.42%) | 1/1 (100.00%) | 1/7 (14.29%) |
| packages/chat/src/embed-widget/react/embed.tsx | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/22 (0.00%) | 0/16 (0.00%) |
| packages/chat/src/react/message-blocks.ts | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/46 (0.00%) | 0/12 (0.00%) |
| packages/chat/src/store/legacy/sqlite/conversations.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/42 (0.00%) | 0/14 (0.00%) |
| packages/commerce/src/payments/credentials.ts | LOADED | 53 | 0/53 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/chat/src/react/components/composer-discovery.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/50 (0.00%) | 0/13 (0.00%) |
| packages/daemon/src/tool-recovery/federated-refusal.ts | LOADED | 51 | 1/52 (1.92%) | 0/0 (100.00%) | 0/4 (0.00%) |
| packages/db/src/kernel/typegen.ts | LOADED | 51 | 15/66 (22.73%) | 0/0 (100.00%) | 0/3 (0.00%) |
| packages/chat/src/react/index.ts | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/workspace/agent-tools.ts | LOADED | 49 | 0/49 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/commerce/src/http/payments-webhook.ts | LOADED | 49 | 0/49 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/core/assistant-client/attachment-liveness.ts | LOADED | 48 | 0/48 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/comments/module.ts | LOADED | 48 | 0/48 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/commerce/src/catalog/checkout.ts | LOADED | 48 | 0/48 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/devops/src/source-control/commit.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/24 (0.00%) | 0/10 (0.00%) |
| packages/plugins/src/host/sql/repo.ts | LOADED | 48 | 0/48 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/db/src/recovery/degraded-banners.ts | LOADED | 47 | 0/47 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/devops/src/packaging/electron/archive.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/30 (0.00%) | 0/18 (0.00%) |
| packages/devops/src/local-dev/index.ts | NEVER-LOADED | 46 | 0/46 (0.00%) | 0/26 (0.00%) | 0/12 (0.00%) |
| packages/commerce/src/catalog/status.ts | LOADED | 44 | 0/44 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/chat/src/react/components/MessageList.hooks.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/22 (0.00%) | 0/11 (0.00%) |
| packages/cms/src/workspace/tool-registrations.ts | LOADED | 43 | 0/43 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/core/src/args-convention.typecheck.ts | LOADED | 43 | 0/43 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/features/chat-pane/model-options.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/48 (0.00%) | 0/12 (0.00%) |
| packages/chat/src/react/hooks/useQuestionForms.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/32 (0.00%) | 0/15 (0.00%) |
| packages/ui/vitest.setup.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/38 (0.00%) | 0/47 (0.00%) |
| packages/chat/src/core/assistant-client/ag-ui-transport.ts | LOADED | 41 | 64/105 (60.95%) | 9/15 (60.00%) | 6/17 (35.29%) |
| packages/chat/src/embed-widget/browser/session-store.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/36 (0.00%) | 0/10 (0.00%) |
| packages/db/src/recovery/migrate-forward-execute.ts | LOADED | 41 | 0/41 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/chat/src/react/hooks/useChatFabDrag.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/22 (0.00%) | 0/9 (0.00%) |
| packages/chat/src/react/tool-call-display.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/30 (0.00%) | 0/11 (0.00%) |
| packages/daemon/src/tool-recovery/redaction.ts | LOADED | 40 | 45/85 (52.94%) | 4/9 (44.44%) | 4/13 (30.77%) |
| packages/agent-runtime/src/skills/web-clone/scripts/init-clone.mjs | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/42 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/panel-kit/hooks/use-settings-slice.hooks.ts | LOADED | 39 | 123/162 (75.93%) | 25/42 (59.52%) | 7/9 (77.78%) |
| packages/chat/src/store/sql/cursor.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/30 (0.00%) | 0/13 (0.00%) |
| packages/chat/src/react/hooks/useCopyToClipboard.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/8 (0.00%) | 0/6 (0.00%) |
| packages/db/src/transfer/sqlite-source.ts | LOADED | 37 | 31/68 (45.59%) | 12/14 (85.71%) | 8/13 (61.54%) |
| packages/devops/src/packaging/electron/imports.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/22 (0.00%) | 0/6 (0.00%) |
| packages/devops/src/packaging/electron/policies.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/36 (0.00%) | 0/12 (0.00%) |
| packages/chat/src/react/features/chat-pane/create-mcp-ui-tool-caller.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/34 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/core/ag-ui/entry.ts | LOADED | 35 | 136/171 (79.53%) | 58/70 (82.86%) | 22/25 (88.00%) |
| packages/chat/src/embed-widget/react/dialog.hooks.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/20 (0.00%) | 0/10 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneFileDrop.hooks.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/26 (0.00%) | 0/10 (0.00%) |
| packages/cms/scripts/check-packaging.mjs | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/28 (0.00%) | 0/6 (0.00%) |
| packages/core/src/batch-tool-inputs.ts | LOADED | 35 | 105/140 (75.00%) | 40/54 (74.07%) | 10/13 (76.92%) |
| packages/cms/src/media/tool-registrations.ts | LOADED | 34 | 135/169 (79.88%) | 23/33 (69.70%) | 10/13 (76.92%) |
| packages/commerce/src/payments/registry.ts | LOADED | 34 | 0/34 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/commerce/src/payments/state-machine.ts | LOADED | 34 | 0/34 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/chat/src/react/hooks/context.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/6 (0.00%) | 0/12 (0.00%) |
| packages/chat/src/react/hooks/last-conversation-store.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/18 (0.00%) | 0/8 (0.00%) |
| packages/db/src/kernel/schema-shape.ts | LOADED | 33 | 58/91 (63.74%) | 32/36 (88.89%) | 4/6 (66.67%) |
| packages/chat/src/react/components/ChatSettingsDialog.tsx | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/64 (0.00%) | 0/15 (0.00%) |
| packages/db/src/recovery/restore-point-create.ts | LOADED | 32 | 0/32 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/chat/src/react/hooks/useExtEventGroups.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/16 (0.00%) | 0/6 (0.00%) |
| packages/cms/src/widgets/html/resolve-html-page-embeds.ts | LOADED | 31 | 0/31 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/db/src/tools/transfer-tools.ts | LOADED | 31 | 223/254 (87.80%) | 63/90 (70.00%) | 25/28 (89.29%) |
| packages/devops/src/agent-jobs/node.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/8 (0.00%) | 0/15 (0.00%) |
| packages/chat/src/react/components/ConversationTitleEditor.tsx | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/14 (0.00%) | 0/9 (0.00%) |
| packages/chat/src/react/ext-event-renderer-registry.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/8 (0.00%) | 0/10 (0.00%) |
| packages/commerce/src/catalog/storefront.ts | LOADED | 30 | 0/30 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/platform/src/secrets/credential-token.ts | LOADED | 30 | 37/67 (55.22%) | 3/3 (100.00%) | 1/5 (20.00%) |
| packages/user-management/src/react/members/Members.tsx | LOADED | 30 | 144/174 (82.76%) | 18/22 (81.82%) | 4/6 (66.67%) |
| packages/charts-recharts/scripts/build-artifact.mjs | LOADED | 29 | 0/29 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/features/chat-pane/components/AgentPluginUsage.tsx | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/16 (0.00%) | 0/10 (0.00%) |
| packages/ui-kit/scripts/headless-smoke.mjs | LOADED | 29 | 0/29 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/components/MessageRow.usage.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/36 (0.00%) | 0/8 (0.00%) |
| packages/plugins/src/host/declarative-enable.ts | LOADED | 28 | 0/28 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/panel-kit/hooks/use-standing-draft-autosave.hooks.ts | LOADED | 28 | 156/184 (84.78%) | 32/50 (64.00%) | 2/5 (40.00%) |
| packages/chat/src/store/runtime/chat-expiry-sweep.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/10 (0.00%) | 0/7 (0.00%) |
| packages/commerce/src/catalog/webhook-inbox.ts | LOADED | 27 | 0/27 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/db/src/kernel/dialect.ts | LOADED | 27 | 87/114 (76.32%) | 47/48 (97.92%) | 13/18 (72.22%) |
| packages/devops/src/packaging/electron/node.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/24 (0.00%) | 0/12 (0.00%) |
| packages/chat/src/react/hooks/useLatestOperation.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/8 (0.00%) | 0/10 (0.00%) |
| packages/capability-providers/src/visitor-auth/lifecycle.ts | LOADED | 25 | 280/305 (91.80%) | 104/126 (82.54%) | 22/22 (100.00%) |
| packages/chat/src/react/components/MessageList.tsx | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/24 (0.00%) | 0/10 (0.00%) |
| packages/chat/src/react/components/MidRunUserMessage.tsx | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/16 (0.00%) | 0/8 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneComposerPlaceholder.hooks.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/18 (0.00%) | 0/11 (0.00%) |
| packages/chat/src/store/runtime/chat-history-store.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/14 (0.00%) | 0/5 (0.00%) |
| packages/plugins/src/host/sql/repo.rows.ts | LOADED | 25 | 0/25 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/commerce/src/tools.ts | LOADED | 24 | 0/24 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/db/src/recovery/disclosure.ts | LOADED | 24 | 0/24 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/data-table.tsx | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/8 (0.00%) | 0/21 (0.00%) |
| packages/chat/src/react/features/chat-pane/components/RuntimeDropUp.tsx | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/28 (0.00%) | 0/9 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneNewTabLinks.hooks.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/24 (0.00%) | 0/6 (0.00%) |
| packages/chat/src/react/hooks/useRunActivity.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| packages/db/src/pglite/owner.ts | LOADED | 23 | 225/248 (90.73%) | 73/86 (84.88%) | 21/22 (95.45%) |
| packages/db/src/recovery/evaluate-boot-migration-policy.ts | LOADED | 23 | 0/23 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/seo/react/index.ts | LOADED | 22 | 0/22 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/components/AttachmentPreviewModal.tsx | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/20 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/hooks/testing/fake-transport.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/6 (0.00%) | 0/11 (0.00%) |
| packages/chat/src/react/hooks/useAnsweredCards.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/14 (0.00%) | 0/9 (0.00%) |
| packages/db/src/kernel/postgres/driver.ts | LOADED | 22 | 2/24 (8.33%) | 0/0 (100.00%) | 0/1 (0.00%) |
| packages/devops/src/checks/node.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/6 (0.00%) | 0/19 (0.00%) |
| packages/admin/src/widgets/react/index.ts | LOADED | 21 | 0/21 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/agent-plugins/src/lifecycle/activation.ts | LOADED | 21 | 324/345 (93.91%) | 168/176 (95.45%) | 43/44 (97.73%) |
| packages/chat/src/react/components/SentAttachment.hooks.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/8 (0.00%) |
| packages/chat/src/react/features/chat-pane/create-mid-run-message-poster.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/16 (0.00%) | 0/8 (0.00%) |
| packages/chat/src/react/hooks/useToolTimeline.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/12 (0.00%) |
| packages/plugins/src/host/index.ts | LOADED | 21 | 0/21 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/widgets/react/components/WidgetInstanceNotices.tsx | LOADED | 20 | 12/32 (37.50%) | 3/5 (60.00%) | 1/2 (50.00%) |
| packages/chat/src/react/components/TodoCard.tsx | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/34 (0.00%) | 0/10 (0.00%) |
| packages/chat/src/react/hooks/composer-history-storage.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/hooks/useArtifactStream.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| packages/db/src/recovery/restore-hooks.ts | LOADED | 20 | 49/69 (71.01%) | 6/7 (85.71%) | 4/7 (57.14%) |
| packages/agent-runtime/src/skills/web-clone/scripts/lib/playwright-loader.mjs | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/2 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/components/AttachmentTray.tsx | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/16 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/components/ComposerDiscovery.tsx | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/38 (0.00%) | 0/11 (0.00%) |
| packages/chat/src/react/components/mcp-ui-surface-state.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/20 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/features/chat-pane/create-typed-answer-poster.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| packages/chat/src/react/hooks/usePinnedTodos.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/10 (0.00%) | 0/8 (0.00%) |
| packages/chat/src/embed-widget/react/header.hooks.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/10 (0.00%) | 0/7 (0.00%) |
| packages/diagnostics/src/web-evidence/playwright-browser.ts | LOADED | 18 | 175/193 (90.67%) | 53/68 (77.94%) | 21/21 (100.00%) |
| packages/ui/src/features/execution/react/hooks/use-execution-credential.hooks.ts | LOADED | 18 | 113/131 (86.26%) | 16/25 (64.00%) | 9/11 (81.82%) |
| packages/agent-plugins/src/admin-surfaces/surface-client.ts | LOADED | 17 | 139/156 (89.10%) | 100/105 (95.24%) | 19/19 (100.00%) |
| packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/form-pattern.tsx | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/0 (0.00%) | 0/6 (0.00%) |
| packages/chat/src/react/components/JiniChatProvider.tsx | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/14 (0.00%) | 0/3 (0.00%) |
| packages/commerce/src/catalog/errors.ts | LOADED | 17 | 0/17 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/plugins/src/host/activation.ts | LOADED | 17 | 59/76 (77.63%) | 9/17 (52.94%) | 5/6 (83.33%) |
| packages/admin/src/seo/react/hooks/MediaPickerBridge.hooks.ts | LOADED | 16 | 2/18 (11.11%) | 0/0 (100.00%) | 0/1 (0.00%) |
| packages/agent-plugins/src/lifecycle/set-enabled.ts | LOADED | 16 | 16/32 (50.00%) | 3/3 (100.00%) | 2/4 (50.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneControlsHeight.hooks.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| packages/db/src/recovery/lookup-adapters.ts | LOADED | 16 | 0/16 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/db/src/testing/transfer-pg-test-db.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| packages/devops/src/source-control/repository-target.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/22 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/html-editor/protected-elements.ts | LOADED | 16 | 137/153 (89.54%) | 77/80 (96.25%) | 14/17 (82.35%) |
| packages/admin/src/widgets/widgets.module.ts | LOADED | 15 | 0/15 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/auth-layout.tsx | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| packages/chat/src/react/tool-renderer-registry.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/2 (0.00%) | 0/8 (0.00%) |
| packages/chat/src/store/sql/boundary.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/store/sqlite/index.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/comments/errors.ts | LOADED | 15 | 0/15 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/core/src/settings/write-service.ts | LOADED | 15 | 586/601 (97.50%) | 161/170 (94.71%) | 18/18 (100.00%) |
| packages/daemon/src/agent-executor/mcp-bridge.ts | LOADED | 15 | 403/418 (96.41%) | 214/221 (96.83%) | 36/40 (90.00%) |
| packages/admin/src/react/entities/contribution.tsx | LOADED | 14 | 44/58 (75.86%) | 17/22 (77.27%) | 6/8 (75.00%) |
| packages/cms/src/content-types/lifecycle.ts | LOADED | 14 | 110/124 (88.71%) | 19/29 (65.52%) | 7/7 (100.00%) |
| packages/db/src/testing/postgres-database.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/platform/src/child-environment.ts | LOADED | 14 | 38/52 (73.08%) | 19/22 (86.36%) | 3/4 (75.00%) |
| packages/admin/src/seo/adapters/http.ts | LOADED | 13 | 34/47 (72.34%) | 11/15 (73.33%) | 3/17 (17.65%) |
| packages/agent-plugins/src/lifecycle/install.ts | LOADED | 13 | 257/270 (95.19%) | 111/118 (94.07%) | 24/24 (100.00%) |
| packages/chat/src/react/components/ChatSettingsDialog.hooks.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/16 (0.00%) | 0/12 (0.00%) |
| packages/chat/src/react/hooks/useSurfaceExpiry.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/7 (0.00%) |
| packages/chat/src/react/hooks/useUserTextGuard.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/chat/src/store/runtime/run-guarded-chat-store.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/16 (0.00%) | 0/5 (0.00%) |
| packages/cms/src/navigation/read-model.ts | LOADED | 13 | 13/26 (50.00%) | 2/2 (100.00%) | 2/6 (33.33%) |
| packages/cms/src/redirects/index.ts | LOADED | 13 | 0/13 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/widgets/markers/marker.ts | LOADED | 13 | 283/296 (95.61%) | 106/112 (94.64%) | 27/29 (93.10%) |
| packages/daemon/src/agent-executor/launch.ts | LOADED | 13 | 673/686 (98.10%) | 340/356 (95.51%) | 55/55 (100.00%) |
| packages/db/src/recovery/reconcile-interrupted-migration.ts | LOADED | 13 | 0/13 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/redirects/react/index.ts | LOADED | 12 | 0/12 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/core/assistant-client/durable-run-subscription.ts | LOADED | 12 | 64/76 (84.21%) | 22/34 (64.71%) | 9/10 (90.00%) |
| packages/chat/src/react/components/MessageList.rules.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/features/chat-pane/index.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/content-types/repo.memory.ts | LOADED | 12 | 34/46 (73.91%) | 10/10 (100.00%) | 8/13 (61.54%) |
| packages/cms/src/seo/index.ts | LOADED | 12 | 0/12 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/taxonomy/merge-term.ts | LOADED | 12 | 29/41 (70.73%) | 4/5 (80.00%) | 2/4 (50.00%) |
| packages/oauth/tests/fixtures.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| packages/oauth/tests/integration-contract.types.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/react/entities/EntityIndex.tsx | LOADED | 11 | 2/13 (15.38%) | 0/0 (100.00%) | 0/1 (0.00%) |
| packages/admin/src/redirects/react/components/ImportRedirectsForm.tsx | LOADED | 11 | 45/56 (80.36%) | 6/9 (66.67%) | 1/1 (100.00%) |
| packages/admin/src/seo/controllers/entry-picker.controller.ts | LOADED | 11 | 0/11 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/seo/react/hooks/SeoModuleTabs.ts | LOADED | 11 | 0/11 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/components/attachment-size.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/10 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/components/AttachmentGallery.rules.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/components/QuestionsPanel.tsx | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| packages/chat/src/react/hooks/attachment-preview-cache.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| packages/chat/vitest.setup.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| packages/core/src/model-facing-tool-errors.ts | LOADED | 11 | 56/67 (83.58%) | 23/23 (100.00%) | 6/8 (75.00%) |
| packages/db/src/recovery/deep-link.ts | LOADED | 11 | 0/11 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/oauth/tests/args-convention.types.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/table.tsx | LOADED | 11 | 43/54 (79.63%) | 6/6 (100.00%) | 6/8 (75.00%) |
| packages/cms/src/comments/index.ts | LOADED | 10 | 0/10 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/media/created-by.ts | LOADED | 10 | 8/18 (44.44%) | 1/4 (25.00%) | 1/2 (50.00%) |
| packages/devops/src/packaging/electron/typescript.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| packages/plugins/src/glue/manifest.ts | LOADED | 10 | 97/107 (90.65%) | 32/40 (80.00%) | 9/9 (100.00%) |
| packages/admin/src/redirects/redirects.module.ts | LOADED | 9 | 0/9 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/seo/seo.module.ts | LOADED | 9 | 0/9 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/agent-runtime/src/model-discovery-sdk.ts | LOADED | 9 | 24/33 (72.73%) | 7/13 (53.85%) | 3/4 (75.00%) |
| packages/chat/src/react/artifact-types.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/chat/src/react/components/ConversationList.hooks.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| packages/chat/src/react/components/ToolCallGroup.hooks.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/chat/src/server/durable-runs/accept.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/chat/src/store/pglite/index.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/chat/src/store/postgres/index.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/cms/src/widgets/region-area-service.ts | LOADED | 9 | 134/143 (93.71%) | 27/33 (81.82%) | 10/10 (100.00%) |
| packages/db/src/testing/pg-fixture.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| packages/server/src/create-local-node-daemon.typecheck.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/execution/rules.ts | LOADED | 9 | 411/420 (97.86%) | 245/253 (96.84%) | 43/44 (97.73%) |
| packages/ui/src/features/html-editor/react/hooks/useInteractiveHtmlEditor.ts | LOADED | 9 | 214/223 (95.96%) | 73/90 (81.11%) | 22/23 (95.65%) |
| packages/user-management/test-setup.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/agent-plugins/index.ts | LOADED | 8 | 0/8 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/forms/react/hooks/use-form-editor.hooks.ts | LOADED | 8 | 153/161 (95.03%) | 53/64 (82.81%) | 22/23 (95.65%) |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/avatarLibrary.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/ChatMotionOverlay.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/components/ExtEventErrorBoundary.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/chat/vitest.config.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/cms/src/forms/submission-email-validation.ts | LOADED | 8 | 15/23 (65.22%) | 15/16 (93.75%) | 1/1 (100.00%) |
| packages/cms/src/presentation/presentation.ts | LOADED | 8 | 44/52 (84.62%) | 5/7 (71.43%) | 3/4 (75.00%) |
| packages/cms/src/widgets/errors.ts | LOADED | 8 | 85/93 (91.40%) | 16/17 (94.12%) | 16/19 (84.21%) |
| packages/commerce/src/catalog/index.ts | LOADED | 8 | 0/8 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/core/src/compose.typecheck.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/core/src/target-scope.ts | LOADED | 8 | 45/53 (84.91%) | 39/39 (100.00%) | 4/5 (80.00%) |
| packages/daemon/src/run-lifecycle.ts | LOADED | 8 | 536/544 (98.53%) | 216/222 (97.30%) | 53/53 (100.00%) |
| packages/daemon/src/tool-recovery/stack.ts | LOADED | 8 | 2/10 (20.00%) | 0/0 (100.00%) | 0/1 (0.00%) |
| packages/db/src/migrate/runner.ts | LOADED | 8 | 94/102 (92.16%) | 54/66 (81.82%) | 11/11 (100.00%) |
| packages/devops/src/packaging/electron/entry.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/plugins/src/host/node/index.ts | LOADED | 8 | 0/8 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/core/ledger-slice.ts | LOADED | 7 | 27/34 (79.41%) | 7/9 (77.78%) | 3/5 (60.00%) |
| packages/admin/src/forms/react/index.ts | LOADED | 7 | 14/21 (66.67%) | 4/4 (100.00%) | 4/7 (57.14%) |
| packages/admin/src/media/adapters/http.ts | LOADED | 7 | 53/60 (88.33%) | 15/16 (93.75%) | 8/11 (72.73%) |
| packages/agent-runtime/src/model-discovery-adapters.ts | LOADED | 7 | 327/334 (97.90%) | 336/341 (98.53%) | 58/60 (96.67%) |
| packages/agent-runtime/src/providers/elevenlabs.ts | LOADED | 7 | 141/148 (95.27%) | 73/76 (96.05%) | 17/17 (100.00%) |
| packages/agent-runtime/src/providers/google-schema.ts | LOADED | 7 | 242/249 (97.19%) | 117/132 (88.64%) | 33/34 (97.06%) |
| packages/charts-recharts/vitest.setup.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/components/AttachmentGallery.hooks.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/8 (0.00%) | 0/7 (0.00%) |
| packages/chat/src/react/components/ChatFab.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/14 (0.00%) | 0/2 (0.00%) |
| packages/chat/src/store/sql/maintenance.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/forms/sql/repo.ts | LOADED | 7 | 160/167 (95.81%) | 47/48 (97.92%) | 14/16 (87.50%) |
| packages/cms/src/widgets/resolvers/create-core-resolvers.ts | LOADED | 7 | 2/9 (22.22%) | 0/0 (100.00%) | 0/1 (0.00%) |
| packages/cms/src/widgets/resolvers/index.ts | LOADED | 7 | 89/96 (92.71%) | 30/34 (88.24%) | 7/8 (87.50%) |
| packages/core/src/tool-registry.ts | LOADED | 7 | 84/91 (92.31%) | 43/48 (89.58%) | 12/13 (92.31%) |
| packages/daemon/src/agent-executor/events.ts | LOADED | 7 | 687/694 (98.99%) | 324/345 (93.91%) | 53/53 (100.00%) |
| packages/daemon/vitest.config.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/db/src/kernel/store-copy.ts | LOADED | 7 | 188/195 (96.41%) | 99/104 (95.19%) | 22/23 (95.65%) |
| packages/db/src/transfer/postgres-target.ts | LOADED | 7 | 75/82 (91.46%) | 29/39 (74.36%) | 7/9 (77.78%) |
| packages/devops/src/core/export-failure-summary.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/devops/src/packaging/electron/stability.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/registry/vitest.config.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/server/vitest.config.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/sidecar/src/supervisor.ts | LOADED | 7 | 104/111 (93.69%) | 68/74 (91.89%) | 16/17 (94.12%) |
| packages/sqlite/vitest.config.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/comments/adapters/http.ts | LOADED | 6 | 41/47 (87.23%) | 8/12 (66.67%) | 8/9 (88.89%) |
| packages/admin/src/forms/rules.ts | LOADED | 6 | 178/184 (96.74%) | 93/98 (94.90%) | 26/27 (96.30%) |
| packages/capability-providers/src/visitor-auth/registry.ts | LOADED | 6 | 63/69 (91.30%) | 19/22 (86.36%) | 8/8 (100.00%) |
| packages/chat/src/core/assistant-client/messages.ts | LOADED | 6 | 8/14 (57.14%) | 2/3 (66.67%) | 1/3 (33.33%) |
| packages/chat/src/react/components/SentAttachment.tsx | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/chat/src/store/runtime/entry.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/media/blob-gc.ts | LOADED | 6 | 102/108 (94.44%) | 40/45 (88.89%) | 12/13 (92.31%) |
| packages/commerce/src/payments/index.ts | LOADED | 6 | 0/6 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/core/src/fetch/cache.ts | LOADED | 6 | 176/182 (96.70%) | 95/101 (94.06%) | 26/29 (89.66%) |
| packages/db/src/tools/plan-store.ts | LOADED | 6 | 25/31 (80.65%) | 10/13 (76.92%) | 4/4 (100.00%) |
| packages/devops/src/core/deploy-types.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/devops/src/core/redirect-guard.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/devops/src/source-control/kit.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/8 (0.00%) |
| packages/integrations/src/webhooks/subscriptions.ts | LOADED | 6 | 133/139 (95.68%) | 32/36 (88.89%) | 6/6 (100.00%) |
| packages/platform/src/fs/workspace-directory.ts | LOADED | 6 | 12/18 (66.67%) | 7/8 (87.50%) | 1/1 (100.00%) |
| packages/ui/src/features/mcp-ui/surfaces/tokens.ts | LOADED | 6 | 71/77 (92.21%) | 6/7 (85.71%) | 3/3 (100.00%) |
| packages/user-management/src/server/grant-service.ts | LOADED | 6 | 274/280 (97.86%) | 71/77 (92.21%) | 14/14 (100.00%) |
| packages/admin/vitest.setup.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/agent-plugins/src/lifecycle/seed-bundled.ts | LOADED | 5 | 114/119 (95.80%) | 29/37 (78.38%) | 7/7 (100.00%) |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/remotion.config.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/Root.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/components/Icon.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/components/NextStepActions.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| packages/chat/src/react/components/ToolCallGroup.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneSuggestion.hooks.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/chat/src/react/util/defined-props.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/chat/vitest.postgres.config.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/entries/repo.memory.ts | LOADED | 5 | 63/68 (92.65%) | 31/34 (91.18%) | 11/11 (100.00%) |
| packages/cms/src/navigation/repo.memory.ts | LOADED | 5 | 106/111 (95.50%) | 47/47 (100.00%) | 16/17 (94.12%) |
| packages/cms/src/presentation/repo.memory.ts | LOADED | 5 | 16/21 (76.19%) | 6/8 (75.00%) | 4/5 (80.00%) |
| packages/daemon/src/http/remote-run-events.ts | LOADED | 5 | 124/129 (96.12%) | 61/63 (96.83%) | 11/12 (91.67%) |
| packages/db/src/transfer/copy-engine.ts | LOADED | 5 | 179/184 (97.28%) | 109/125 (87.20%) | 17/17 (100.00%) |
| packages/db/vitest.postgres.config.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/devops/src/source-control/entry.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/devops/src/static-export/entry.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/oauth/tests/dispatcher-stub.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/plugins/src/host/contributions.ts | LOADED | 5 | 122/127 (96.06%) | 87/97 (89.69%) | 19/19 (100.00%) |
| packages/plugins/src/host/hook-registry.ts | LOADED | 5 | 172/177 (97.18%) | 59/66 (89.39%) | 14/14 (100.00%) |
| packages/ui/src/features/execution/dependencies.ts | LOADED | 5 | 54/59 (91.53%) | 21/26 (80.77%) | 7/8 (87.50%) |
| packages/ui/src/features/execution/http-adapter.ts | LOADED | 5 | 60/65 (92.31%) | 25/29 (86.21%) | 10/12 (83.33%) |
| packages/ui/src/features/panel-kit/helpers/standing-draft-local-backup.ts | LOADED | 5 | 33/38 (86.84%) | 7/16 (43.75%) | 5/5 (100.00%) |
| packages/user-management/src/server/agent-tool-registrations.ts | LOADED | 5 | 296/301 (98.34%) | 62/69 (89.86%) | 31/31 (100.00%) |
| packages/vibecoding/vitest.setup.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/media/controllers/providers.controller.ts | LOADED | 4 | 70/74 (94.59%) | 12/17 (70.59%) | 6/7 (85.71%) |
| packages/admin/src/react/entities/EntityCell.tsx | LOADED | 4 | 10/14 (71.43%) | 9/11 (81.82%) | 1/1 (100.00%) |
| packages/admin/src/widgets/adapters/http.ts | LOADED | 4 | 25/29 (86.21%) | 11/11 (100.00%) | 4/11 (36.36%) |
| packages/admin/src/widgets/ports.ts | LOADED | 4 | 0/4 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/widgets/react/hooks/use-widget-region-editor.hooks.ts | LOADED | 4 | 10/14 (71.43%) | 12/12 (100.00%) | 9/11 (81.82%) |
| packages/agent-plugins/src/lifecycle/bundled-source-archive.ts | LOADED | 4 | 83/87 (95.40%) | 23/26 (88.46%) | 9/9 (100.00%) |
| packages/agent-plugins/src/lifecycle/index.ts | LOADED | 4 | 76/80 (95.00%) | 13/15 (86.67%) | 8/38 (21.05%) |
| packages/agent-plugins/src/lifecycle/trusted-plugin-files.ts | LOADED | 4 | 62/66 (93.94%) | 28/31 (90.32%) | 6/6 (100.00%) |
| packages/agent-runtime/src/providers/azure-chat.ts | LOADED | 4 | 167/171 (97.66%) | 91/94 (96.81%) | 15/15 (100.00%) |
| packages/analytics/src/repo.memory.ts | LOADED | 4 | 24/28 (85.71%) | 9/9 (100.00%) | 6/8 (75.00%) |
| packages/chat/src/embed-widget/react/header.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/components/ConversationList.rules.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/store/errors.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/comments/repo.memory.ts | LOADED | 4 | 102/106 (96.23%) | 43/44 (97.73%) | 11/12 (91.67%) |
| packages/cms/src/content-types/cleanup.ts | LOADED | 4 | 48/52 (92.31%) | 12/15 (80.00%) | 3/3 (100.00%) |
| packages/cms/src/media/image-transformer.sharp.ts | LOADED | 4 | 46/50 (92.00%) | 14/16 (87.50%) | 4/4 (100.00%) |
| packages/cms/src/media/rendition-service.ts | LOADED | 4 | 81/85 (95.29%) | 20/23 (86.96%) | 4/4 (100.00%) |
| packages/cms/src/navigation/tool-registrations.ts | LOADED | 4 | 136/140 (97.14%) | 50/55 (90.91%) | 14/16 (87.50%) |
| packages/cms/src/widgets/markers/index.ts | LOADED | 4 | 0/4 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/core/src/settings/repo.memory.ts | LOADED | 4 | 180/184 (97.83%) | 82/86 (95.35%) | 22/22 (100.00%) |
| packages/db/src/kernel/sqlite/ops.ts | LOADED | 4 | 21/25 (84.00%) | 7/9 (77.78%) | 3/3 (100.00%) |
| packages/devops/src/deploy/node.ts | LOADED | 4 | 31/35 (88.57%) | 16/18 (88.89%) | 6/7 (85.71%) |
| packages/http-kit/src/sse.ts | LOADED | 4 | 91/95 (95.79%) | 44/44 (100.00%) | 10/11 (90.91%) |
| packages/plugins/src/host/manifest.ts | LOADED | 4 | 305/309 (98.71%) | 154/157 (98.09%) | 27/27 (100.00%) |
| packages/plugins/src/host/uninstall.ts | LOADED | 4 | 61/65 (93.85%) | 22/24 (91.67%) | 5/5 (100.00%) |
| packages/plugins/src/host/worker/index.ts | LOADED | 4 | 0/4 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/sandbox/src/e2b/wrap-e2b-sandbox.ts | LOADED | 4 | 253/257 (98.44%) | 121/122 (99.18%) | 26/26 (100.00%) |
| packages/ui-kit/src/react/Kit.hooks.ts | LOADED | 4 | 63/67 (94.03%) | 33/38 (86.84%) | 10/10 (100.00%) |
| packages/ui/src/features/execution/react/hooks/useExecutionTab.ts | LOADED | 4 | 151/155 (97.42%) | 40/50 (80.00%) | 6/6 (100.00%) |
| packages/ui/src/features/html-editor/dom.ts | LOADED | 4 | 13/17 (76.47%) | 3/3 (100.00%) | 3/4 (75.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/data-table.tsx | LOADED | 4 | 67/71 (94.37%) | 52/52 (100.00%) | 6/7 (85.71%) |
| packages/ui/src/react/components/RemixIcon.stylesheet.ts | LOADED | 4 | 77/81 (95.06%) | 31/36 (86.11%) | 8/9 (88.89%) |
| packages/user-management/src/admin/conformance/index.ts | LOADED | 4 | 85/89 (95.51%) | 60/77 (77.92%) | 11/11 (100.00%) |
| packages/admin/src/comments/react/index.ts | LOADED | 3 | 18/21 (85.71%) | 2/2 (100.00%) | 2/3 (66.67%) |
| packages/admin/src/media/conformance/media-api.conformance.ts | LOADED | 3 | 82/85 (96.47%) | 11/15 (73.33%) | 3/3 (100.00%) |
| packages/admin/src/react/overlays.ts | LOADED | 3 | 45/48 (93.75%) | 10/12 (83.33%) | 6/7 (85.71%) |
| packages/admin/src/redirects/ports.ts | LOADED | 3 | 0/3 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/seo/ports.ts | LOADED | 3 | 0/3 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/seo/react/components/MediaPickerBridge.tsx | LOADED | 3 | 2/5 (40.00%) | 0/0 (100.00%) | 0/1 (0.00%) |
| packages/admin/src/seo/react/hooks/use-sitemap-modal.hooks.ts | LOADED | 3 | 10/13 (76.92%) | 20/20 (100.00%) | 5/6 (83.33%) |
| packages/admin/src/widgets/rules.ts | LOADED | 3 | 57/60 (95.00%) | 56/59 (94.92%) | 13/13 (100.00%) |
| packages/agent-plugins/src/lifecycle/bundled-digests.ts | LOADED | 3 | 129/132 (97.73%) | 66/72 (91.67%) | 12/12 (100.00%) |
| packages/agent-plugins/vitest.config.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/src/providers/connection-guard.ts | LOADED | 3 | 127/130 (97.69%) | 59/65 (90.77%) | 7/8 (87.50%) |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/DeviceFrame.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneSurface.hooks.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/server/durable-runs/entry.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/store/legacy/sqlite/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/store/sqlite/schema.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/comments/sql/repo.ts | LOADED | 3 | 178/181 (98.34%) | 60/62 (96.77%) | 13/13 (100.00%) |
| packages/cms/src/consent/express/response.ts | LOADED | 3 | 121/124 (97.58%) | 101/104 (97.12%) | 24/24 (100.00%) |
| packages/daemon/vitest.postgres.config.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/db/src/kernel/pglite/ops.ts | LOADED | 3 | 53/56 (94.64%) | 22/23 (95.65%) | 5/5 (100.00%) |
| packages/devops/src/agent-jobs/entry.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/mcp/src/federation/stdio/default-connect.ts | LOADED | 3 | 62/65 (95.38%) | 21/24 (87.50%) | 6/7 (85.71%) |
| packages/plugins/src/host/plugin-claims.ts | LOADED | 3 | 116/119 (97.48%) | 48/54 (88.89%) | 12/13 (92.31%) |
| packages/plugins/src/host/sql/index.ts | LOADED | 3 | 0/3 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/sidecar/src/daemon-registry.ts | LOADED | 3 | 60/63 (95.24%) | 38/40 (95.00%) | 7/7 (100.00%) |
| packages/ui/src/features/connectors/hooks/useConnectorAuthorization.ts | LOADED | 3 | 216/219 (98.63%) | 101/103 (98.06%) | 7/7 (100.00%) |
| packages/ui/src/features/html-editor/editor-serialization.ts | LOADED | 3 | 56/59 (94.92%) | 19/25 (76.00%) | 4/4 (100.00%) |
| packages/ui/src/features/panel-kit/fetch-query/adapter.tanstack.tsx | LOADED | 3 | 163/166 (98.19%) | 81/85 (95.29%) | 30/32 (93.75%) |
| packages/ui/src/react/mcp-ui/useHostSurfaceTokens.ts | LOADED | 3 | 25/28 (89.29%) | 5/7 (71.43%) | 2/2 (100.00%) |
| packages/ui/vitest.config.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/core/react/index.ts | LOADED | 2 | 0/2 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/forms/adapters/http.ts | LOADED | 2 | 45/47 (95.74%) | 25/25 (100.00%) | 12/13 (92.31%) |
| packages/admin/src/forms/react/hooks/use-form-submission-detail.hooks.ts | LOADED | 2 | 62/64 (96.88%) | 19/21 (90.48%) | 9/11 (81.82%) |
| packages/admin/src/media/react/hooks/MediaPicker.hooks.ts | LOADED | 2 | 25/27 (92.59%) | 15/15 (100.00%) | 4/6 (66.67%) |
| packages/admin/src/redirects/react/pages/RedirectsPage.tsx | LOADED | 2 | 105/107 (98.13%) | 8/10 (80.00%) | 2/2 (100.00%) |
| packages/admin/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-plugins/src/lifecycle/capability-projection.ts | LOADED | 2 | 60/62 (96.77%) | 25/27 (92.59%) | 9/9 (100.00%) |
| packages/agent-plugins/src/lifecycle/layout.ts | LOADED | 2 | 31/33 (93.94%) | 8/11 (72.73%) | 7/7 (100.00%) |
| packages/agent-plugins/src/lifecycle/package-paths.ts | LOADED | 2 | 63/65 (96.92%) | 30/32 (93.75%) | 7/7 (100.00%) |
| packages/agent-runtime/src/agent-protocol/pi-rpc/events.ts | LOADED | 2 | 173/175 (98.86%) | 84/87 (96.55%) | 21/21 (100.00%) |
| packages/agent-runtime/src/anthropic-live-models.ts | LOADED | 2 | 62/64 (96.88%) | 31/34 (91.18%) | 6/6 (100.00%) |
| packages/agent-runtime/src/providers/tool-turn.ts | LOADED | 2 | 314/316 (99.37%) | 197/214 (92.06%) | 37/37 (100.00%) |
| packages/agent-runtime/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agentic/src/index.ts | LOADED | 2 | 0/2 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/agentic/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/analytics/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/capability-providers/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/charts-recharts/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/react/features/chat-pane/agent-tools.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/testing/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/cli/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/forms/src/forms.ts | LOADED | 2 | 161/163 (98.77%) | 104/105 (99.05%) | 15/15 (100.00%) |
| packages/cms/forms/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/media/blob-store.fs.ts | LOADED | 2 | 65/67 (97.01%) | 25/26 (96.15%) | 9/9 (100.00%) |
| packages/cms/src/media/blob-store.memory.ts | LOADED | 2 | 31/33 (93.94%) | 11/12 (91.67%) | 7/7 (100.00%) |
| packages/cms/src/media/import/fetch-image.ts | LOADED | 2 | 109/111 (98.20%) | 48/51 (94.12%) | 9/9 (100.00%) |
| packages/cms/src/media/repo.memory.ts | LOADED | 2 | 156/158 (98.73%) | 65/67 (97.01%) | 29/29 (100.00%) |
| packages/cms/src/media/sanitize-svg.ts | LOADED | 2 | 59/61 (96.72%) | 26/28 (92.86%) | 4/4 (100.00%) |
| packages/cms/src/navigation/node/index.ts | LOADED | 2 | 14/16 (87.50%) | 4/4 (100.00%) | 4/5 (80.00%) |
| packages/cms/src/redirects/matcher.ts | LOADED | 2 | 111/113 (98.23%) | 45/56 (80.36%) | 10/10 (100.00%) |
| packages/cms/src/trash/adapters/record-store.ts | LOADED | 2 | 32/34 (94.12%) | 21/23 (91.30%) | 5/5 (100.00%) |
| packages/cms/src/trash/cursor.ts | LOADED | 2 | 14/16 (87.50%) | 11/12 (91.67%) | 2/2 (100.00%) |
| packages/cms/src/trash/follow-ups.ts | LOADED | 2 | 34/36 (94.44%) | 15/17 (88.24%) | 4/4 (100.00%) |
| packages/cms/src/trash/repo.memory.ts | LOADED | 2 | 93/95 (97.89%) | 56/58 (96.55%) | 13/13 (100.00%) |
| packages/cms/src/widgets/sql/index.ts | LOADED | 2 | 0/2 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/cms/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/commerce/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/core/src/settings/errors.ts | LOADED | 2 | 25/27 (92.59%) | 2/2 (100.00%) | 2/3 (66.67%) |
| packages/core/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/db/src/kernel/ops.ts | LOADED | 2 | 30/32 (93.75%) | 7/10 (70.00%) | 4/4 (100.00%) |
| packages/db/src/kernel/pglite/dialect.ts | LOADED | 2 | 61/63 (96.83%) | 22/22 (100.00%) | 15/16 (93.75%) |
| packages/db/src/kernel/postgres/ops.ts | LOADED | 2 | 24/26 (92.31%) | 5/7 (71.43%) | 3/3 (100.00%) |
| packages/db/src/kernel/postgres/pglite-socket.ts | LOADED | 2 | 26/28 (92.86%) | 4/5 (80.00%) | 3/3 (100.00%) |
| packages/db/src/migrate/checksum.ts | LOADED | 2 | 2/4 (50.00%) | 0/0 (100.00%) | 0/1 (0.00%) |
| packages/db/src/postgres/types.ts | LOADED | 2 | 0/2 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/db/src/testing/content-schema.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/db/src/testing/sqlite-snapshot-client.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/db/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/desktop-host/src/electron/testing.ts | LOADED | 2 | 137/139 (98.56%) | 49/50 (98.00%) | 35/36 (97.22%) |
| packages/desktop-host/src/electron/updates/auto-update-controller.ts | LOADED | 2 | 160/162 (98.77%) | 84/92 (91.30%) | 31/38 (81.58%) |
| packages/desktop-host/src/render-bridge.ts | LOADED | 2 | 108/110 (98.18%) | 68/68 (100.00%) | 9/10 (90.00%) |
| packages/desktop-host/src/speech/macos/mac-on-device-transcriber.ts | LOADED | 2 | 87/89 (97.75%) | 60/63 (95.24%) | 10/10 (100.00%) |
| packages/desktop-host/src/tauri/tauri-shell.ts | LOADED | 2 | 29/31 (93.55%) | 17/18 (94.44%) | 7/7 (100.00%) |
| packages/desktop-host/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/devops/src/packaging/electron/asar-adapter.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/devops/src/static-export/contracts.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/devops/src/static-export/fetch-adapter.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/devops/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/diagnostics/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/diagnostics/vitest.port.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/http-kit/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/infra/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/integrations/src/media-providers/dispatch/polling-adapter.ts | LOADED | 2 | 18/20 (90.00%) | 3/5 (60.00%) | 2/2 (100.00%) |
| packages/integrations/src/media-providers/dispatch/ssrf-guard.ts | LOADED | 2 | 73/75 (97.33%) | 44/45 (97.78%) | 6/6 (100.00%) |
| packages/integrations/src/webhooks/signing.ts | LOADED | 2 | 61/63 (96.83%) | 36/37 (97.30%) | 7/7 (100.00%) |
| packages/integrations/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/mcp/src/federation/bootstrap.ts | LOADED | 2 | 95/97 (97.94%) | 39/41 (95.12%) | 8/8 (100.00%) |
| packages/mcp/src/federation/ports.ts | LOADED | 2 | 1/3 (33.33%) | 0/0 (100.00%) | 0/1 (0.00%) |
| packages/mcp/src/server/sdk-transport.ts | LOADED | 2 | 22/24 (91.67%) | 9/13 (69.23%) | 8/8 (100.00%) |
| packages/mcp/src/tools/ask-choice/question.ts | LOADED | 2 | 80/82 (97.56%) | 71/79 (89.87%) | 7/7 (100.00%) |
| packages/mcp/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/memory/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/oauth/src/node-file-cache.ts | LOADED | 2 | 34/36 (94.44%) | 5/7 (71.43%) | 3/3 (100.00%) |
| packages/oauth/src/redact.ts | LOADED | 2 | 1/3 (33.33%) | 0/0 (100.00%) | 0/1 (0.00%) |
| packages/oauth/src/token-endpoint.ts | LOADED | 2 | 95/97 (97.94%) | 61/66 (92.42%) | 9/9 (100.00%) |
| packages/oauth/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/platform/src/mail/delivery-availability.ts | LOADED | 2 | 1/3 (33.33%) | 0/0 (100.00%) | 0/1 (0.00%) |
| packages/platform/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/plugins/src/host/node/browser-provider-assets.ts | LOADED | 2 | 34/36 (94.44%) | 19/23 (82.61%) | 4/4 (100.00%) |
| packages/protocol/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/sandbox/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/sidecar/src/supervisor-node.ts | LOADED | 2 | 79/81 (97.53%) | 51/53 (96.23%) | 13/14 (92.86%) |
| packages/sidecar/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui-kit/src/react/kit.ts | LOADED | 2 | 33/35 (94.29%) | 32/34 (94.12%) | 4/4 (100.00%) |
| packages/ui-kit/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/template-i18n.ts | LOADED | 2 | 32/34 (94.12%) | 14/16 (87.50%) | 4/4 (100.00%) |
| packages/ui/src/theme/types.ts | LOADED | 2 | 0/2 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/user-management/src/server/authorize.ts | LOADED | 2 | 69/71 (97.18%) | 36/38 (94.74%) | 3/3 (100.00%) |
| packages/user-management/src/server/repo.memory-transactions.ts | LOADED | 2 | 60/62 (96.77%) | 22/25 (88.00%) | 6/6 (100.00%) |
| packages/user-management/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/vibecoding/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/comments/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/consent/react/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/forms/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/media/styles.ts | LOADED | 1 | 0/1 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/playground/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/react/shell/use-admin-theme.ts | LOADED | 1 | 42/43 (97.67%) | 37/42 (88.10%) | 2/2 (100.00%) |
| packages/admin/src/redirects/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/security/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/seo/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/seo/react/hooks/use-seo.hooks.ts | LOADED | 1 | 33/34 (97.06%) | 29/33 (87.88%) | 10/11 (90.91%) |
| packages/admin/src/source-control/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/widgets/controllers/regions.controller.ts | LOADED | 1 | 30/31 (96.77%) | 8/11 (72.73%) | 5/5 (100.00%) |
| packages/admin/src/widgets/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/agent-plugins/persistent-state.js | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-plugins/src/lifecycle/tools/projection.ts | LOADED | 1 | 179/180 (99.44%) | 118/121 (97.52%) | 18/18 (100.00%) |
| packages/agent-runtime/src/launch.ts | LOADED | 1 | 163/164 (99.39%) | 73/74 (98.65%) | 14/14 (100.00%) |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/chatSpec.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agentic/src/core/site-guide/topic-schema.ts | LOADED | 1 | 47/48 (97.92%) | 36/42 (85.71%) | 11/12 (91.67%) |
| packages/agentic/src/skills/install/live-registration.ts | LOADED | 1 | 49/50 (98.00%) | 22/27 (81.48%) | 8/8 (100.00%) |
| packages/chat/src/contracts/chat-bubble-style.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/core/assistant-client/entry.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/embed-widget/browser/page-actions.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/react/chat-pane.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/react/features/chat-pane/styles.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/store/contracts/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/store/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/store/legacy/sqlite/schema.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/comments/hooks.ts | LOADED | 1 | 33/34 (97.06%) | 12/13 (92.31%) | 5/5 (100.00%) |
| packages/cms/src/consent/html/gate.ts | LOADED | 1 | 157/158 (99.37%) | 141/146 (96.58%) | 25/25 (100.00%) |
| packages/cms/src/forms/express/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/media/node.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/presentation/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/redirects/sql/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/redirects/target-gate.ts | LOADED | 1 | 55/56 (98.21%) | 28/32 (87.50%) | 6/6 (100.00%) |
| packages/cms/src/taxonomy/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/widgets/html/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/widgets/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/workspace/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/commerce/src/http/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/commerce/src/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/commerce/src/store/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/daemon/src/http/run-credentials.ts | LOADED | 1 | 38/39 (97.44%) | 17/25 (68.00%) | 3/3 (100.00%) |
| packages/db/src/postgres/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/db/src/recovery/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/db/src/secrets-vault/repo.sql.ts | LOADED | 1 | 146/147 (99.32%) | 121/126 (96.03%) | 17/17 (100.00%) |
| packages/devops/src/static-export/failure-summary.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/diagnostics/src/web-evidence/lazy-browser.ts | LOADED | 1 | 83/84 (98.81%) | 41/45 (91.11%) | 10/12 (83.33%) |
| packages/diagnostics/src/web-evidence/playwright-runtime.ts | LOADED | 1 | 33/34 (97.06%) | 8/12 (66.67%) | 1/1 (100.00%) |
| packages/mcp/src/federation/testing/adapter.memory.ts | LOADED | 1 | 109/110 (99.09%) | 52/55 (94.55%) | 20/20 (100.00%) |
| packages/platform/src/http/guarded/transport.fetch.ts | LOADED | 1 | 93/94 (98.94%) | 40/43 (93.02%) | 6/6 (100.00%) |
| packages/platform/src/net/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/platform/src/secrets/testing.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/platform/src/web/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/registry/src/tool-catalog-builder/query.ts | LOADED | 1 | 58/59 (98.31%) | 30/31 (96.77%) | 9/9 (100.00%) |
| packages/sandbox/src/node-worker.ts | LOADED | 1 | 82/83 (98.80%) | 43/46 (93.48%) | 7/7 (100.00%) |
| packages/ui-kit/src/react/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/ui-kit/src/react/native/Dialog.hooks.ts | LOADED | 1 | 46/47 (97.87%) | 42/45 (93.33%) | 9/9 (100.00%) |
| packages/ui-kit/src/react/testing/driver.ts | LOADED | 1 | 77/78 (98.72%) | 79/82 (96.34%) | 8/8 (100.00%) |
| packages/ui/src/features/a2ui/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/admin-widgets/components/ScrollJump/ScrollJump.hooks.ts | LOADED | 1 | 37/38 (97.37%) | 16/19 (84.21%) | 3/5 (60.00%) |
| packages/ui/src/features/html-editor/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/i18n/universal.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/card.tsx | LOADED | 1 | 24/25 (96.00%) | 5/5 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/panel-kit/helpers/standing-draft-recovery-message.ts | LOADED | 1 | 14/15 (93.33%) | 2/6 (33.33%) | 2/2 (100.00%) |
| packages/user-management/src/admin/controllers/members.controller.ts | LOADED | 1 | 66/67 (98.51%) | 46/57 (80.70%) | 15/16 (93.75%) |
| packages/user-management/src/admin/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/vibecoding/src/html/regions.ts | LOADED | 1 | 121/122 (99.18%) | 50/53 (94.34%) | 10/10 (100.00%) |
| packages/admin/src/agent-plugins/adapters/http.ts | LOADED | 0 | 12/12 (100.00%) | 12/12 (100.00%) | 5/5 (100.00%) |
| packages/admin/src/agent-plugins/adapters/memory.ts | LOADED | 0 | 15/15 (100.00%) | 17/18 (94.44%) | 5/5 (100.00%) |
| packages/admin/src/agent-plugins/agent-plugins.module.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/agent-plugins/conformance/agent-plugins-api.conformance.ts | LOADED | 0 | 28/28 (100.00%) | 39/43 (90.70%) | 4/4 (100.00%) |
| packages/admin/src/agent-plugins/controllers/agent-plugin-files.controller.ts | LOADED | 0 | 29/29 (100.00%) | 26/26 (100.00%) | 9/9 (100.00%) |
| packages/admin/src/agent-plugins/controllers/agent-plugins.controller.ts | LOADED | 0 | 59/59 (100.00%) | 77/77 (100.00%) | 15/15 (100.00%) |
| packages/admin/src/agent-plugins/messages.en.ts | LOADED | 0 | 13/13 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/agent-plugins/package-file-tree.ts | LOADED | 0 | 140/140 (100.00%) | 67/67 (100.00%) | 17/17 (100.00%) |
| packages/admin/src/agent-plugins/ports.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/agent-plugins/react/components/AgentPluginFileContent.tsx | LOADED | 0 | 7/7 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/agent-plugins/react/components/AgentPluginFileTree.tsx | LOADED | 0 | 5/5 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/agent-plugins/react/components/AgentPluginInspector.tsx | LOADED | 0 | 9/9 (100.00%) | 4/5 (80.00%) | 1/1 (100.00%) |
| packages/admin/src/agent-plugins/react/components/AgentPluginListPanel.tsx | LOADED | 0 | 10/10 (100.00%) | 3/7 (42.86%) | 1/1 (100.00%) |
| packages/admin/src/agent-plugins/react/components/AgentPluginRow.tsx | LOADED | 0 | 24/24 (100.00%) | 15/15 (100.00%) | 3/3 (100.00%) |
| packages/admin/src/agent-plugins/react/hooks/AgentPluginInspector.hooks.ts | LOADED | 0 | 53/53 (100.00%) | 93/93 (100.00%) | 16/16 (100.00%) |
| packages/admin/src/agent-plugins/react/hooks/AgentPluginPanel.hooks.ts | LOADED | 0 | 54/54 (100.00%) | 58/58 (100.00%) | 14/14 (100.00%) |
| packages/admin/src/agent-plugins/react/hooks/AgentPluginRow.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/agent-plugins/react/hooks/AgentPluginsPage.hooks.ts | LOADED | 0 | 42/42 (100.00%) | 46/46 (100.00%) | 11/11 (100.00%) |
| packages/admin/src/agent-plugins/react/hooks/AgentPluginsPorts.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 1/2 (50.00%) | 1/1 (100.00%) |
| packages/admin/src/agent-plugins/react/hooks/MarketplaceTab.hooks.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/agent-plugins/react/index.ts | LOADED | 0 | 7/7 (100.00%) | 5/5 (100.00%) | 5/5 (100.00%) |
| packages/admin/src/agent-plugins/react/pages/AgentPluginsPage.tsx | LOADED | 0 | 11/11 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/agent-plugins/react/tabs/DownloadedTab.tsx | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/agent-plugins/react/tabs/InstalledTab.tsx | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/agent-plugins/react/tabs/MarketplaceTab.tsx | LOADED | 0 | 6/6 (100.00%) | 1/2 (50.00%) | 1/1 (100.00%) |
| packages/admin/src/agent-plugins/rules.ts | LOADED | 0 | 43/43 (100.00%) | 38/38 (100.00%) | 8/8 (100.00%) |
| packages/admin/src/browser/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/browser/navigation.ts | LOADED | 0 | 69/69 (100.00%) | 47/47 (100.00%) | 8/8 (100.00%) |
| packages/admin/src/browser/shell-navigation.ts | LOADED | 0 | 9/9 (100.00%) | 5/5 (100.00%) | 5/5 (100.00%) |
| packages/admin/src/comments/adapters/memory.ts | LOADED | 0 | 64/64 (100.00%) | 47/47 (100.00%) | 16/16 (100.00%) |
| packages/admin/src/comments/comments.module.ts | LOADED | 0 | 13/13 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/comments/conformance/comments-api.conformance.ts | LOADED | 0 | 82/82 (100.00%) | 37/37 (100.00%) | 13/13 (100.00%) |
| packages/admin/src/comments/controllers/comment-queue.controller.ts | LOADED | 0 | 145/145 (100.00%) | 73/74 (98.65%) | 16/16 (100.00%) |
| packages/admin/src/comments/controllers/comment-settings.controller.ts | LOADED | 0 | 58/58 (100.00%) | 22/25 (88.00%) | 5/5 (100.00%) |
| packages/admin/src/comments/controllers/comments.controller.ts | LOADED | 0 | 13/13 (100.00%) | 6/7 (85.71%) | 2/2 (100.00%) |
| packages/admin/src/comments/messages.en.ts | LOADED | 0 | 53/53 (100.00%) | 3/4 (75.00%) | 1/1 (100.00%) |
| packages/admin/src/comments/ports.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/comments/react/components/QueueSection.tsx | LOADED | 0 | 151/151 (100.00%) | 26/27 (96.30%) | 7/7 (100.00%) |
| packages/admin/src/comments/react/components/SettingsSection.tsx | LOADED | 0 | 112/112 (100.00%) | 9/14 (64.29%) | 1/1 (100.00%) |
| packages/admin/src/comments/react/hooks/CommentsPage.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/comments/react/hooks/CommentsPorts.hooks.ts | LOADED | 0 | 11/11 (100.00%) | 2/3 (66.67%) | 2/2 (100.00%) |
| packages/admin/src/comments/react/hooks/QueueSection.hooks.ts | LOADED | 0 | 48/48 (100.00%) | 18/19 (94.74%) | 14/14 (100.00%) |
| packages/admin/src/comments/react/hooks/SettingsSection.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 4/5 (80.00%) | 3/3 (100.00%) |
| packages/admin/src/comments/react/hooks/use-comment-queue.hooks.ts | LOADED | 0 | 84/84 (100.00%) | 50/50 (100.00%) | 18/18 (100.00%) |
| packages/admin/src/comments/react/hooks/use-comment-settings.hooks.ts | LOADED | 0 | 28/28 (100.00%) | 17/17 (100.00%) | 6/6 (100.00%) |
| packages/admin/src/comments/react/hooks/use-comments.hooks.ts | LOADED | 0 | 15/15 (100.00%) | 11/11 (100.00%) | 4/4 (100.00%) |
| packages/admin/src/comments/react/pages/CommentsPage.tsx | LOADED | 0 | 23/23 (100.00%) | 5/6 (83.33%) | 1/1 (100.00%) |
| packages/admin/src/comments/rules.ts | LOADED | 0 | 151/151 (100.00%) | 78/80 (97.50%) | 23/24 (95.83%) |
| packages/admin/src/consent/react/ConsentSettingsPanel.tsx | LOADED | 0 | 37/37 (100.00%) | 12/12 (100.00%) | 3/3 (100.00%) |
| packages/admin/src/consent/react/settings-panel.hooks.ts | LOADED | 0 | 23/23 (100.00%) | 10/10 (100.00%) | 7/7 (100.00%) |
| packages/admin/src/contracts/credential-management.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/contracts/media-picker.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/contracts/playground-render-target.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/core/entities/rules.ts | LOADED | 0 | 273/273 (100.00%) | 125/125 (100.00%) | 24/24 (100.00%) |
| packages/admin/src/core/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/core/manifest/rules.ts | LOADED | 0 | 72/72 (100.00%) | 51/53 (96.23%) | 6/6 (100.00%) |
| packages/admin/src/core/module/controller-store.ts | LOADED | 0 | 30/30 (100.00%) | 14/14 (100.00%) | 5/5 (100.00%) |
| packages/admin/src/core/module/create-admin.ts | LOADED | 0 | 341/341 (100.00%) | 125/125 (100.00%) | 26/26 (100.00%) |
| packages/admin/src/core/module/define-admin-module.ts | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/core/module/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/core/module/token.ts | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/core/permissions/rules.ts | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/core/react/bind-react.ts | LOADED | 0 | 36/36 (100.00%) | 6/7 (85.71%) | 3/3 (100.00%) |
| packages/admin/src/core/react/use-controller.ts | LOADED | 0 | 25/25 (100.00%) | 11/11 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/core/routing/rules.ts | LOADED | 0 | 50/50 (100.00%) | 41/47 (87.23%) | 6/6 (100.00%) |
| packages/admin/src/core/transport/errors.ts | LOADED | 0 | 19/19 (100.00%) | 9/9 (100.00%) | 3/3 (100.00%) |
| packages/admin/src/core/transport/http.ts | LOADED | 0 | 85/85 (100.00%) | 57/57 (100.00%) | 9/9 (100.00%) |
| packages/admin/src/core/transport/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/forms/adapters/memory.ts | LOADED | 0 | 73/73 (100.00%) | 76/76 (100.00%) | 17/17 (100.00%) |
| packages/admin/src/forms/conformance/forms-api.conformance.ts | LOADED | 0 | 61/61 (100.00%) | 37/37 (100.00%) | 11/11 (100.00%) |
| packages/admin/src/forms/controllers/draft-store.ts | LOADED | 0 | 15/15 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| packages/admin/src/forms/controllers/field-attributes-dialog.controller.ts | LOADED | 0 | 45/45 (100.00%) | 43/43 (100.00%) | 19/19 (100.00%) |
| packages/admin/src/forms/controllers/form-editor.controller.ts | LOADED | 0 | 18/18 (100.00%) | 9/9 (100.00%) | 4/4 (100.00%) |
| packages/admin/src/forms/controllers/form-fields-editor.controller.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/admin/src/forms/controllers/form-submission-detail.controller.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/admin/src/forms/controllers/form-submissions.controller.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/admin/src/forms/controllers/forms-list.controller.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/admin/src/forms/field-settings.ts | LOADED | 0 | 271/271 (100.00%) | 266/266 (100.00%) | 41/41 (100.00%) |
| packages/admin/src/forms/form-editor-dirty.ts | LOADED | 0 | 10/10 (100.00%) | 12/12 (100.00%) | 2/2 (100.00%) |
| packages/admin/src/forms/forms.module.ts | LOADED | 0 | 14/14 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/forms/html-rules.ts | LOADED | 0 | 117/117 (100.00%) | 128/128 (100.00%) | 24/24 (100.00%) |
| packages/admin/src/forms/messages.en.ts | LOADED | 0 | 174/174 (100.00%) | 2/3 (66.67%) | 1/1 (100.00%) |
| packages/admin/src/forms/models.ts | LOADED | 0 | 6/6 (100.00%) | 3/4 (75.00%) | 2/2 (100.00%) |
| packages/admin/src/forms/ports.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/forms/react/components/FieldAttributesDialog.tsx | LOADED | 0 | 139/139 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/forms/react/components/FieldSettingsRows.tsx | LOADED | 0 | 168/168 (100.00%) | 29/29 (100.00%) | 5/5 (100.00%) |
| packages/admin/src/forms/react/components/FieldSettingsSection.tsx | LOADED | 0 | 13/13 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/forms/react/components/FormEditorFieldsBody.tsx | LOADED | 0 | 42/42 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/forms/react/components/FormEditorFieldsBodyParts.tsx | LOADED | 0 | 50/50 (100.00%) | 21/21 (100.00%) | 2/2 (100.00%) |
| packages/admin/src/forms/react/components/FormEditorHeaderText.tsx | LOADED | 0 | 13/13 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/forms/react/components/FormEditorMainPanel.tsx | LOADED | 0 | 18/18 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/forms/react/components/FormEditorTabStrip.tsx | LOADED | 0 | 29/29 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/forms/react/components/FormFieldsEditor.tsx | LOADED | 0 | 167/167 (100.00%) | 11/11 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/forms/react/components/FormSubmissionDate.tsx | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/forms/react/components/FormSubmissionDetail.tsx | LOADED | 0 | 76/76 (100.00%) | 6/12 (50.00%) | 1/1 (100.00%) |
| packages/admin/src/forms/react/components/FormSubmissions.tsx | LOADED | 0 | 24/24 (100.00%) | 10/10 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/forms/react/components/FormSubmissionsTable.tsx | LOADED | 0 | 44/44 (100.00%) | 11/11 (100.00%) | 5/5 (100.00%) |
| packages/admin/src/forms/react/hooks/forms-view.hooks.ts | LOADED | 0 | 117/117 (100.00%) | 74/77 (96.10%) | 38/46 (82.61%) |
| packages/admin/src/forms/react/hooks/FormsPorts.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 4/5 (80.00%) | 2/2 (100.00%) |
| packages/admin/src/forms/react/hooks/use-field-attributes-dialog.hooks.ts | LOADED | 0 | 28/28 (100.00%) | 15/15 (100.00%) | 12/14 (85.71%) |
| packages/admin/src/forms/react/hooks/use-form-fields-editor.hooks.ts | LOADED | 0 | 36/36 (100.00%) | 11/11 (100.00%) | 8/8 (100.00%) |
| packages/admin/src/forms/react/hooks/use-form-submission-date.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/forms/react/hooks/use-form-submissions.hooks.ts | LOADED | 0 | 76/76 (100.00%) | 40/43 (93.02%) | 11/12 (91.67%) |
| packages/admin/src/forms/react/hooks/use-forms-list.hooks.ts | LOADED | 0 | 73/73 (100.00%) | 37/41 (90.24%) | 11/11 (100.00%) |
| packages/admin/src/forms/react/pages/FormEditor.tsx | LOADED | 0 | 83/83 (100.00%) | 12/12 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/forms/react/pages/FormsList.tsx | LOADED | 0 | 97/97 (100.00%) | 19/19 (100.00%) | 7/7 (100.00%) |
| packages/admin/src/media/adapters/memory.ts | LOADED | 0 | 138/138 (100.00%) | 46/46 (100.00%) | 22/22 (100.00%) |
| packages/admin/src/media/controllers/edit-media.controller.ts | LOADED | 0 | 62/62 (100.00%) | 16/20 (80.00%) | 6/6 (100.00%) |
| packages/admin/src/media/controllers/library.controller.ts | LOADED | 0 | 168/168 (100.00%) | 87/87 (100.00%) | 16/16 (100.00%) |
| packages/admin/src/media/html-attributes.ts | LOADED | 0 | 92/92 (100.00%) | 47/47 (100.00%) | 8/8 (100.00%) |
| packages/admin/src/media/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/media/media.module.ts | LOADED | 0 | 35/35 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/media/messages.en.ts | LOADED | 0 | 23/23 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/media/ports.ts | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/media/react/components/EditMediaPanel.tsx | LOADED | 0 | 22/22 (100.00%) | 10/10 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/media/react/components/MediaCard.tsx | LOADED | 0 | 33/33 (100.00%) | 15/15 (100.00%) | 3/3 (100.00%) |
| packages/admin/src/media/react/components/MediaDialog.tsx | LOADED | 0 | 5/5 (100.00%) | 1/2 (50.00%) | 1/1 (100.00%) |
| packages/admin/src/media/react/components/MediaGrid.tsx | LOADED | 0 | 17/17 (100.00%) | 4/6 (66.67%) | 1/1 (100.00%) |
| packages/admin/src/media/react/components/MediaIcons.tsx | LOADED | 0 | 28/28 (100.00%) | 9/9 (100.00%) | 9/9 (100.00%) |
| packages/admin/src/media/react/components/MediaLightbox.tsx | LOADED | 0 | 14/14 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/media/react/components/MediaPicker.tsx | LOADED | 0 | 35/35 (100.00%) | 4/5 (80.00%) | 1/1 (100.00%) |
| packages/admin/src/media/react/components/MediaPurgeDialog.tsx | LOADED | 0 | 10/10 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/media/react/components/UploadButton.tsx | LOADED | 0 | 38/38 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/media/react/hooks/EditMediaPanel.hooks.ts | LOADED | 0 | 85/85 (100.00%) | 64/65 (98.46%) | 7/7 (100.00%) |
| packages/admin/src/media/react/hooks/GallerySelection.hooks.ts | LOADED | 0 | 25/25 (100.00%) | 17/19 (89.47%) | 5/5 (100.00%) |
| packages/admin/src/media/react/hooks/LibraryTab.hooks.ts | LOADED | 0 | 179/179 (100.00%) | 136/136 (100.00%) | 30/30 (100.00%) |
| packages/admin/src/media/react/hooks/MediaCard.hooks.ts | LOADED | 0 | 68/68 (100.00%) | 33/33 (100.00%) | 9/9 (100.00%) |
| packages/admin/src/media/react/hooks/MediaDialog.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 2/3 (66.67%) | 1/1 (100.00%) |
| packages/admin/src/media/react/hooks/MediaGrid.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/media/react/hooks/MediaLightbox.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/media/react/hooks/MediaPage.hooks.ts | LOADED | 0 | 75/75 (100.00%) | 53/53 (100.00%) | 11/11 (100.00%) |
| packages/admin/src/media/react/hooks/MediaPorts.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 1/2 (50.00%) | 1/1 (100.00%) |
| packages/admin/src/media/react/hooks/MediaPurgeDialog.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/media/react/hooks/MediaQuery.hooks.ts | LOADED | 0 | 34/34 (100.00%) | 25/26 (96.15%) | 15/15 (100.00%) |
| packages/admin/src/media/react/hooks/ProvidersTab.hooks.ts | LOADED | 0 | 169/169 (100.00%) | 127/127 (100.00%) | 26/26 (100.00%) |
| packages/admin/src/media/react/hooks/UploadButton.hooks.ts | LOADED | 0 | 111/111 (100.00%) | 71/71 (100.00%) | 18/18 (100.00%) |
| packages/admin/src/media/react/index.ts | LOADED | 0 | 79/79 (100.00%) | 19/23 (82.61%) | 12/12 (100.00%) |
| packages/admin/src/media/react/pages/MediaPage.tsx | LOADED | 0 | 42/42 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/media/react/tabs/LibraryTab.tsx | LOADED | 0 | 44/44 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/media/react/tabs/ProvidersTab.tsx | LOADED | 0 | 38/38 (100.00%) | 9/13 (69.23%) | 1/1 (100.00%) |
| packages/admin/src/media/rules.ts | LOADED | 0 | 129/129 (100.00%) | 104/104 (100.00%) | 18/18 (100.00%) |
| packages/admin/src/playground/adapters/http.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/playground/adapters/memory.ts | LOADED | 0 | 14/14 (100.00%) | 17/18 (94.44%) | 7/7 (100.00%) |
| packages/admin/src/playground/conformance/playground-api.conformance.ts | LOADED | 0 | 14/14 (100.00%) | 3/4 (75.00%) | 3/3 (100.00%) |
| packages/admin/src/playground/controllers/playground.controller.ts | LOADED | 0 | 13/13 (100.00%) | 10/10 (100.00%) | 4/4 (100.00%) |
| packages/admin/src/playground/messages.en.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/playground/playground.module.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/playground/react/components/Canvas.tsx | LOADED | 0 | 5/5 (100.00%) | 1/2 (50.00%) | 1/1 (100.00%) |
| packages/admin/src/playground/react/hooks/Canvas.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| packages/admin/src/playground/react/hooks/PlaygroundPage.hooks.ts | LOADED | 0 | 1/1 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/playground/react/hooks/PlaygroundPorts.hooks.ts | LOADED | 0 | 3/3 (100.00%) | 1/2 (50.00%) | 1/1 (100.00%) |
| packages/admin/src/playground/react/index.ts | LOADED | 0 | 6/6 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| packages/admin/src/playground/react/pages/PlaygroundPage.tsx | LOADED | 0 | 6/6 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/playground/react/tabs/CanvasTab.tsx | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/playground/rules.ts | LOADED | 0 | 1/1 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/react/bind-react.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/react/components/ConfirmButton/ConfirmButton.hooks.tsx | LOADED | 0 | 39/39 (100.00%) | 13/14 (92.86%) | 6/6 (100.00%) |
| packages/admin/src/react/components/ConfirmButton/ConfirmButton.tsx | LOADED | 0 | 31/31 (100.00%) | 14/14 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/react/components/ConfirmDialog/ConfirmDialog.hooks.tsx | LOADED | 0 | 28/28 (100.00%) | 8/9 (88.89%) | 5/5 (100.00%) |
| packages/admin/src/react/components/ConfirmDialog/ConfirmDialog.tsx | LOADED | 0 | 57/57 (100.00%) | 11/16 (68.75%) | 7/7 (100.00%) |
| packages/admin/src/react/components/ConfirmDialog/use-confirm-request.ts | LOADED | 0 | 41/41 (100.00%) | 16/16 (100.00%) | 4/4 (100.00%) |
| packages/admin/src/react/components/DataTable.tsx | LOADED | 0 | 94/94 (100.00%) | 55/56 (98.21%) | 7/7 (100.00%) |
| packages/admin/src/react/components/InteractiveHtmlEditor/InteractiveHtmlEditor.tsx | LOADED | 0 | 58/58 (100.00%) | 44/44 (100.00%) | 9/9 (100.00%) |
| packages/admin/src/react/components/RowMenu/RowMenu.hooks.tsx | LOADED | 0 | 137/137 (100.00%) | 46/46 (100.00%) | 13/13 (100.00%) |
| packages/admin/src/react/components/RowMenu/RowMenu.tsx | LOADED | 0 | 85/85 (100.00%) | 28/28 (100.00%) | 6/6 (100.00%) |
| packages/admin/src/react/components/Sidebar.tsx | LOADED | 0 | 249/249 (100.00%) | 92/92 (100.00%) | 21/21 (100.00%) |
| packages/admin/src/react/entities/EntityDetail.tsx | LOADED | 0 | 20/20 (100.00%) | 8/12 (66.67%) | 1/1 (100.00%) |
| packages/admin/src/react/entities/EntityEdit.tsx | LOADED | 0 | 48/48 (100.00%) | 45/45 (100.00%) | 8/8 (100.00%) |
| packages/admin/src/react/entities/EntityField.tsx | LOADED | 0 | 48/48 (100.00%) | 49/49 (100.00%) | 15/15 (100.00%) |
| packages/admin/src/react/entities/EntityList.tsx | LOADED | 0 | 44/44 (100.00%) | 31/31 (100.00%) | 5/5 (100.00%) |
| packages/admin/src/react/entities/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/react/entities/RelationTruncationNotice.tsx | LOADED | 0 | 6/6 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/react/entities/rules.ts | LOADED | 0 | 92/92 (100.00%) | 52/54 (96.30%) | 11/11 (100.00%) |
| packages/admin/src/react/entities/types.ts | LOADED | 0 | 9/9 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| packages/admin/src/react/entities/use-entity-edit.ts | LOADED | 0 | 94/94 (100.00%) | 86/86 (100.00%) | 12/12 (100.00%) |
| packages/admin/src/react/entities/use-entity-read.ts | LOADED | 0 | 28/28 (100.00%) | 17/18 (94.44%) | 3/3 (100.00%) |
| packages/admin/src/react/hooks/use-nav-sections.ts | LOADED | 0 | 49/49 (100.00%) | 31/31 (100.00%) | 4/4 (100.00%) |
| packages/admin/src/react/hooks/use-sidebar-rail.ts | LOADED | 0 | 44/44 (100.00%) | 25/25 (100.00%) | 4/4 (100.00%) |
| packages/admin/src/react/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/react/OverlayHost.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/react/OverlayHost.tsx | LOADED | 0 | 10/10 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/react/shell/AdminShell.hooks.ts | LOADED | 0 | 22/22 (100.00%) | 11/11 (100.00%) | 3/3 (100.00%) |
| packages/admin/src/react/shell/AdminShell.tsx | LOADED | 0 | 78/78 (100.00%) | 44/45 (97.78%) | 8/8 (100.00%) |
| packages/admin/src/react/shell/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/react/shell/model.ts | LOADED | 0 | 23/23 (100.00%) | 7/8 (87.50%) | 1/1 (100.00%) |
| packages/admin/src/react/shell/use-admin-shell-session.ts | LOADED | 0 | 60/60 (100.00%) | 36/36 (100.00%) | 4/4 (100.00%) |
| packages/admin/src/react/types.ts | LOADED | 0 | 11/11 (100.00%) | 10/10 (100.00%) | 2/2 (100.00%) |
| packages/admin/src/react/use-controller.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/redirects/adapters/http.ts | LOADED | 0 | 29/29 (100.00%) | 15/17 (88.24%) | 9/10 (90.00%) |
| packages/admin/src/redirects/adapters/memory.ts | LOADED | 0 | 70/70 (100.00%) | 40/44 (90.91%) | 10/10 (100.00%) |
| packages/admin/src/redirects/conformance/redirects-api.conformance.ts | LOADED | 0 | 86/86 (100.00%) | 63/63 (100.00%) | 16/16 (100.00%) |
| packages/admin/src/redirects/controllers/hit-count.controller.ts | LOADED | 0 | 6/6 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/admin/src/redirects/controllers/import-redirects.controller.ts | LOADED | 0 | 20/20 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| packages/admin/src/redirects/controllers/redirects.controller.ts | LOADED | 0 | 27/27 (100.00%) | 19/19 (100.00%) | 5/6 (83.33%) |
| packages/admin/src/redirects/messages.en.ts | LOADED | 0 | 57/57 (100.00%) | 4/5 (80.00%) | 1/1 (100.00%) |
| packages/admin/src/redirects/react/components/HitCountCell.tsx | LOADED | 0 | 14/14 (100.00%) | 5/7 (71.43%) | 1/1 (100.00%) |
| packages/admin/src/redirects/react/hooks/RedirectsOptions.hooks.ts | LOADED | 0 | 11/11 (100.00%) | 4/5 (80.00%) | 2/2 (100.00%) |
| packages/admin/src/redirects/react/hooks/RedirectsPage.hooks.ts | LOADED | 0 | 24/24 (100.00%) | 11/12 (91.67%) | 9/10 (90.00%) |
| packages/admin/src/redirects/react/hooks/RedirectsPorts.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 1/2 (50.00%) | 1/1 (100.00%) |
| packages/admin/src/redirects/react/hooks/use-hit-count-cell.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 8/8 (100.00%) | 4/4 (100.00%) |
| packages/admin/src/redirects/react/hooks/use-import-redirects-form.hooks.ts | LOADED | 0 | 27/27 (100.00%) | 20/20 (100.00%) | 9/9 (100.00%) |
| packages/admin/src/redirects/react/hooks/use-redirects.hooks.ts | LOADED | 0 | 46/46 (100.00%) | 27/28 (96.43%) | 16/17 (94.12%) |
| packages/admin/src/redirects/react/hooks/wired.hooks.ts | LOADED | 0 | 22/22 (100.00%) | 6/7 (85.71%) | 4/5 (80.00%) |
| packages/admin/src/redirects/rules.ts | LOADED | 0 | 53/53 (100.00%) | 29/29 (100.00%) | 10/11 (90.91%) |
| packages/admin/src/security/adapters/http.ts | LOADED | 0 | 84/84 (100.00%) | 118/118 (100.00%) | 28/28 (100.00%) |
| packages/admin/src/security/adapters/memory.ts | LOADED | 0 | 55/55 (100.00%) | 122/122 (100.00%) | 25/25 (100.00%) |
| packages/admin/src/security/conformance/security-api.conformance.ts | LOADED | 0 | 19/19 (100.00%) | 8/10 (80.00%) | 2/2 (100.00%) |
| packages/admin/src/security/controllers/access-tokens.controller.ts | LOADED | 0 | 60/60 (100.00%) | 78/78 (100.00%) | 16/16 (100.00%) |
| packages/admin/src/security/controllers/other-credentials.controller.ts | LOADED | 0 | 34/34 (100.00%) | 27/31 (87.10%) | 8/8 (100.00%) |
| packages/admin/src/security/controllers/root-key.controller.ts | LOADED | 0 | 46/46 (100.00%) | 68/68 (100.00%) | 14/14 (100.00%) |
| packages/admin/src/security/messages.en.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/security/ports.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/security/react/components/CredentialEditor.tsx | LOADED | 0 | 11/11 (100.00%) | 1/2 (50.00%) | 1/1 (100.00%) |
| packages/admin/src/security/react/hooks/AccessTokensTab.hooks.ts | LOADED | 0 | 49/49 (100.00%) | 80/80 (100.00%) | 25/25 (100.00%) |
| packages/admin/src/security/react/hooks/CredentialEditor.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 5/8 (62.50%) | 4/9 (44.44%) |
| packages/admin/src/security/react/hooks/RootKeyTab.hooks.ts | LOADED | 0 | 21/21 (100.00%) | 47/47 (100.00%) | 13/13 (100.00%) |
| packages/admin/src/security/react/hooks/SecurityPage.hooks.ts | LOADED | 0 | 11/11 (100.00%) | 14/15 (93.33%) | 2/2 (100.00%) |
| packages/admin/src/security/react/hooks/SecurityPorts.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| packages/admin/src/security/react/index.ts | LOADED | 0 | 6/6 (100.00%) | 4/5 (80.00%) | 4/4 (100.00%) |
| packages/admin/src/security/react/pages/SecurityPage.tsx | LOADED | 0 | 6/6 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/security/react/tabs/AccessTokensTab.tsx | LOADED | 0 | 16/16 (100.00%) | 8/13 (61.54%) | 1/1 (100.00%) |
| packages/admin/src/security/react/tabs/RootKeyTab.tsx | LOADED | 0 | 19/19 (100.00%) | 18/18 (100.00%) | 4/4 (100.00%) |
| packages/admin/src/security/rules.ts | LOADED | 0 | 66/66 (100.00%) | 103/103 (100.00%) | 19/19 (100.00%) |
| packages/admin/src/security/security.module.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/seo/adapters/memory.ts | LOADED | 0 | 95/95 (100.00%) | 46/47 (97.87%) | 20/20 (100.00%) |
| packages/admin/src/seo/conformance/seo-api.conformance.ts | LOADED | 0 | 37/37 (100.00%) | 2/4 (50.00%) | 2/2 (100.00%) |
| packages/admin/src/seo/controllers/entry-section.controller.ts | LOADED | 0 | 5/5 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/admin/src/seo/controllers/media-ref.controller.ts | LOADED | 0 | 11/11 (100.00%) | 5/5 (100.00%) | 5/5 (100.00%) |
| packages/admin/src/seo/controllers/seo-entry.controller.ts | LOADED | 0 | 41/41 (100.00%) | 13/14 (92.86%) | 5/6 (83.33%) |
| packages/admin/src/seo/controllers/seo.controller.ts | LOADED | 0 | 41/41 (100.00%) | 14/15 (93.33%) | 7/8 (87.50%) |
| packages/admin/src/seo/controllers/sitemap.controller.ts | LOADED | 0 | 23/23 (100.00%) | 10/11 (90.91%) | 4/4 (100.00%) |
| packages/admin/src/seo/models.ts | LOADED | 0 | 6/6 (100.00%) | 1/2 (50.00%) | 1/1 (100.00%) |
| packages/admin/src/seo/react/components/MediaRefField.tsx | LOADED | 0 | 73/73 (100.00%) | 33/33 (100.00%) | 4/4 (100.00%) |
| packages/admin/src/seo/react/components/SeoIcons.tsx | LOADED | 0 | 36/36 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| packages/admin/src/seo/react/components/SitemapModal.tsx | LOADED | 0 | 151/151 (100.00%) | 25/25 (100.00%) | 5/6 (83.33%) |
| packages/admin/src/seo/react/hooks/MediaRefField.hooks.ts | LOADED | 0 | 32/32 (100.00%) | 20/21 (95.24%) | 12/12 (100.00%) |
| packages/admin/src/seo/react/hooks/SeoPage.hooks.ts | LOADED | 0 | 32/32 (100.00%) | 15/15 (100.00%) | 9/11 (81.82%) |
| packages/admin/src/seo/react/hooks/SeoPorts.hooks.ts | LOADED | 0 | 17/17 (100.00%) | 5/7 (71.43%) | 4/4 (100.00%) |
| packages/admin/src/seo/react/hooks/SeoQuery.hooks.ts | LOADED | 0 | 52/52 (100.00%) | 26/26 (100.00%) | 15/15 (100.00%) |
| packages/admin/src/seo/react/hooks/SitemapModal.hooks.ts | LOADED | 0 | 18/18 (100.00%) | 10/10 (100.00%) | 5/5 (100.00%) |
| packages/admin/src/seo/react/hooks/use-entry-picker.hooks.ts | LOADED | 0 | 17/17 (100.00%) | 10/11 (90.91%) | 3/3 (100.00%) |
| packages/admin/src/seo/react/hooks/use-seo-entry-panel.hooks.ts | LOADED | 0 | 30/30 (100.00%) | 17/21 (80.95%) | 10/10 (100.00%) |
| packages/admin/src/seo/react/hooks/use-seo-entry-section.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| packages/admin/src/seo/react/hooks/use-share-image-warning.hooks.ts | LOADED | 0 | 66/66 (100.00%) | 41/41 (100.00%) | 9/9 (100.00%) |
| packages/admin/src/seo/react/pages/SeoPage.tsx | LOADED | 0 | 486/486 (100.00%) | 85/85 (100.00%) | 25/25 (100.00%) |
| packages/admin/src/seo/rules.ts | LOADED | 0 | 193/193 (100.00%) | 185/186 (99.46%) | 39/39 (100.00%) |
| packages/admin/src/source-control/adapters/http.ts | LOADED | 0 | 12/12 (100.00%) | 16/17 (94.12%) | 7/7 (100.00%) |
| packages/admin/src/source-control/adapters/memory.ts | LOADED | 0 | 16/16 (100.00%) | 44/46 (95.65%) | 11/11 (100.00%) |
| packages/admin/src/source-control/conformance/source-control-api.conformance.ts | LOADED | 0 | 59/59 (100.00%) | 31/31 (100.00%) | 13/13 (100.00%) |
| packages/admin/src/source-control/controllers/source-control.controller.ts | LOADED | 0 | 41/41 (100.00%) | 57/57 (100.00%) | 12/12 (100.00%) |
| packages/admin/src/source-control/messages.en.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/source-control/ports.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/source-control/react/components/SourceControlCredentialFields.tsx | LOADED | 0 | 5/5 (100.00%) | 1/3 (33.33%) | 1/1 (100.00%) |
| packages/admin/src/source-control/react/components/SourceControlProviderRow.tsx | LOADED | 0 | 4/4 (100.00%) | 5/6 (83.33%) | 1/1 (100.00%) |
| packages/admin/src/source-control/react/hooks/ProvidersTab.hooks.ts | LOADED | 0 | 23/23 (100.00%) | 30/30 (100.00%) | 10/10 (100.00%) |
| packages/admin/src/source-control/react/hooks/SourceControlCredentialFields.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/source-control/react/hooks/SourceControlPage.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 8/9 (88.89%) | 1/2 (50.00%) |
| packages/admin/src/source-control/react/hooks/SourceControlPorts.hooks.ts | LOADED | 0 | 3/3 (100.00%) | 1/2 (50.00%) | 1/1 (100.00%) |
| packages/admin/src/source-control/react/index.ts | LOADED | 0 | 6/6 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| packages/admin/src/source-control/react/pages/SourceControlPage.tsx | LOADED | 0 | 6/6 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/source-control/react/tabs/ProvidersTab.tsx | LOADED | 0 | 6/6 (100.00%) | 3/5 (60.00%) | 1/1 (100.00%) |
| packages/admin/src/source-control/rules.ts | LOADED | 0 | 14/14 (100.00%) | 41/42 (97.62%) | 8/8 (100.00%) |
| packages/admin/src/source-control/source-control.module.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/admin/src/widgets/adapters/memory.ts | LOADED | 0 | 78/78 (100.00%) | 60/62 (96.77%) | 15/15 (100.00%) |
| packages/admin/src/widgets/conformance/widgets-api.conformance.ts | LOADED | 0 | 60/60 (100.00%) | 30/30 (100.00%) | 7/7 (100.00%) |
| packages/admin/src/widgets/controllers/instance-editor.controller.ts | LOADED | 0 | 76/76 (100.00%) | 46/46 (100.00%) | 15/15 (100.00%) |
| packages/admin/src/widgets/controllers/library.controller.ts | LOADED | 0 | 44/44 (100.00%) | 36/36 (100.00%) | 10/10 (100.00%) |
| packages/admin/src/widgets/controllers/region-editor.controller.ts | LOADED | 0 | 50/50 (100.00%) | 39/39 (100.00%) | 10/10 (100.00%) |
| packages/admin/src/widgets/messages.en.ts | LOADED | 0 | 79/79 (100.00%) | 1/3 (33.33%) | 1/1 (100.00%) |
| packages/admin/src/widgets/react/components/WidgetRegionEditorHeaderActions.tsx | LOADED | 0 | 25/25 (100.00%) | 8/8 (100.00%) | 2/2 (100.00%) |
| packages/admin/src/widgets/react/components/WidgetsLibraryNotices.tsx | LOADED | 0 | 26/26 (100.00%) | 11/11 (100.00%) | 2/2 (100.00%) |
| packages/admin/src/widgets/react/hooks/navigation.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/admin/src/widgets/react/hooks/page-views.hooks.ts | LOADED | 0 | 21/21 (100.00%) | 12/12 (100.00%) | 5/5 (100.00%) |
| packages/admin/src/widgets/react/hooks/use-widget-instance-editor.hooks.ts | LOADED | 0 | 28/28 (100.00%) | 25/25 (100.00%) | 12/13 (92.31%) |
| packages/admin/src/widgets/react/hooks/use-widget-regions.hooks.ts | LOADED | 0 | 20/20 (100.00%) | 22/22 (100.00%) | 10/10 (100.00%) |
| packages/admin/src/widgets/react/hooks/use-widgets-library.hooks.ts | LOADED | 0 | 24/24 (100.00%) | 31/31 (100.00%) | 12/12 (100.00%) |
| packages/admin/src/widgets/react/hooks/WidgetsPorts.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 4/6 (66.67%) | 2/2 (100.00%) |
| packages/admin/src/widgets/react/hooks/WidgetsQuery.hooks.ts | LOADED | 0 | 60/60 (100.00%) | 32/32 (100.00%) | 20/20 (100.00%) |
| packages/admin/src/widgets/react/pages/WidgetInstanceEditor.tsx | LOADED | 0 | 96/96 (100.00%) | 12/16 (75.00%) | 2/2 (100.00%) |
| packages/admin/src/widgets/react/pages/WidgetRegionEditor.tsx | LOADED | 0 | 100/100 (100.00%) | 20/20 (100.00%) | 6/6 (100.00%) |
| packages/admin/src/widgets/react/pages/WidgetRegions.tsx | LOADED | 0 | 88/88 (100.00%) | 16/16 (100.00%) | 6/6 (100.00%) |
| packages/admin/src/widgets/react/pages/WidgetsLibrary.tsx | LOADED | 0 | 123/123 (100.00%) | 15/16 (93.75%) | 9/9 (100.00%) |
| packages/agent-plugins/src/admin-surfaces/action-dispatcher.ts | LOADED | 0 | 46/46 (100.00%) | 36/36 (100.00%) | 7/7 (100.00%) |
| packages/agent-plugins/src/admin-surfaces/action-schema.ts | LOADED | 0 | 110/110 (100.00%) | 140/140 (100.00%) | 18/18 (100.00%) |
| packages/agent-plugins/src/admin-surfaces/action-tools.ts | LOADED | 0 | 37/37 (100.00%) | 14/17 (82.35%) | 5/5 (100.00%) |
| packages/agent-plugins/src/admin-surfaces/callback-field-inbox.ts | LOADED | 0 | 27/27 (100.00%) | 14/14 (100.00%) | 5/5 (100.00%) |
| packages/agent-plugins/src/admin-surfaces/capability-declarations.ts | LOADED | 0 | 62/62 (100.00%) | 51/51 (100.00%) | 8/8 (100.00%) |
| packages/agent-plugins/src/admin-surfaces/contribution.ts | LOADED | 0 | 17/17 (100.00%) | 8/8 (100.00%) | 4/4 (100.00%) |
| packages/agent-plugins/src/admin-surfaces/delivery-bindings.ts | LOADED | 0 | 69/69 (100.00%) | 60/60 (100.00%) | 12/12 (100.00%) |
| packages/agent-plugins/src/admin-surfaces/descriptor.ts | LOADED | 0 | 136/136 (100.00%) | 158/158 (100.00%) | 17/17 (100.00%) |
| packages/agent-plugins/src/admin-surfaces/external-links.ts | LOADED | 0 | 33/33 (100.00%) | 37/37 (100.00%) | 4/4 (100.00%) |
| packages/agent-plugins/src/admin-surfaces/host-validator.ts | LOADED | 0 | 54/54 (100.00%) | 53/53 (100.00%) | 8/8 (100.00%) |
| packages/agent-plugins/src/admin-surfaces/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agent-plugins/src/admin-surfaces/protocol.ts | LOADED | 0 | 14/14 (100.00%) | 4/5 (80.00%) | 2/2 (100.00%) |
| packages/agent-plugins/src/admin-surfaces/sandbox.ts | LOADED | 0 | 64/64 (100.00%) | 19/19 (100.00%) | 10/10 (100.00%) |
| packages/agent-plugins/src/admin-surfaces/settings-value.ts | LOADED | 0 | 21/21 (100.00%) | 28/28 (100.00%) | 3/3 (100.00%) |
| packages/agent-plugins/src/admin-surfaces/surface-capabilities.ts | LOADED | 0 | 148/148 (100.00%) | 93/93 (100.00%) | 20/20 (100.00%) |
| packages/agent-plugins/src/admin-surfaces/surface-handlers.ts | LOADED | 0 | 102/102 (100.00%) | 80/80 (100.00%) | 19/19 (100.00%) |
| packages/agent-plugins/src/admin-surfaces/theme.ts | LOADED | 0 | 30/30 (100.00%) | 9/9 (100.00%) | 3/3 (100.00%) |
| packages/agent-plugins/src/folder-zip-node.ts | LOADED | 0 | 56/56 (100.00%) | 47/47 (100.00%) | 3/3 (100.00%) |
| packages/agent-plugins/src/folder-zip.ts | LOADED | 0 | 71/71 (100.00%) | 33/33 (100.00%) | 5/5 (100.00%) |
| packages/agent-plugins/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agent-plugins/src/lifecycle/automatic-use.ts | LOADED | 0 | 113/113 (100.00%) | 113/113 (100.00%) | 18/18 (100.00%) |
| packages/agent-plugins/src/lifecycle/contribution-loader.ts | LOADED | 0 | 68/68 (100.00%) | 37/38 (97.37%) | 5/5 (100.00%) |
| packages/agent-plugins/src/lifecycle/fetch-archive.ts | LOADED | 0 | 140/140 (100.00%) | 71/71 (100.00%) | 11/11 (100.00%) |
| packages/agent-plugins/src/lifecycle/install-errors.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/agent-plugins/src/lifecycle/install-from-url.ts | LOADED | 0 | 20/20 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| packages/agent-plugins/src/lifecycle/installed-package-index.ts | LOADED | 0 | 78/78 (100.00%) | 41/41 (100.00%) | 8/8 (100.00%) |
| packages/agent-plugins/src/lifecycle/installed-package-roots.ts | LOADED | 0 | 44/44 (100.00%) | 28/28 (100.00%) | 3/3 (100.00%) |
| packages/agent-plugins/src/lifecycle/manifest.ts | LOADED | 0 | 222/222 (100.00%) | 221/221 (100.00%) | 35/35 (100.00%) |
| packages/agent-plugins/src/lifecycle/mcp-provisioning.ts | LOADED | 0 | 15/15 (100.00%) | 4/4 (100.00%) | 3/3 (100.00%) |
| packages/agent-plugins/src/lifecycle/node.ts | LOADED | 0 | 23/23 (100.00%) | 10/11 (90.91%) | 8/8 (100.00%) |
| packages/agent-plugins/src/lifecycle/persistent-state.ts | LOADED | 0 | 28/28 (100.00%) | 13/15 (86.67%) | 13/13 (100.00%) |
| packages/agent-plugins/src/lifecycle/resolve-agent-plugin-refs.ts | LOADED | 0 | 132/132 (100.00%) | 57/57 (100.00%) | 10/10 (100.00%) |
| packages/agent-plugins/src/lifecycle/retire-bundled.ts | LOADED | 0 | 96/96 (100.00%) | 53/53 (100.00%) | 7/7 (100.00%) |
| packages/agent-plugins/src/lifecycle/search.ts | LOADED | 0 | 80/80 (100.00%) | 61/61 (100.00%) | 9/9 (100.00%) |
| packages/agent-plugins/src/lifecycle/skill-file-reader.ts | LOADED | 0 | 97/97 (100.00%) | 88/88 (100.00%) | 12/12 (100.00%) |
| packages/agent-plugins/src/lifecycle/tools/capabilities.ts | LOADED | 0 | 120/120 (100.00%) | 81/81 (100.00%) | 19/19 (100.00%) |
| packages/agent-plugins/src/lifecycle/tools/definition.ts | LOADED | 0 | 18/18 (100.00%) | 12/12 (100.00%) | 4/4 (100.00%) |
| packages/agent-plugins/src/lifecycle/tools/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agent-plugins/src/lifecycle/tools/manifest.ts | LOADED | 0 | 57/57 (100.00%) | 56/56 (100.00%) | 8/8 (100.00%) |
| packages/agent-plugins/src/lifecycle/uninstall.ts | LOADED | 0 | 179/179 (100.00%) | 97/97 (100.00%) | 23/23 (100.00%) |
| packages/agent-plugins/src/lifecycle/yauzl-archive-reader.ts | LOADED | 0 | 47/47 (100.00%) | 24/24 (100.00%) | 5/5 (100.00%) |
| packages/agent-plugins/src/manifest.ts | LOADED | 0 | 22/22 (100.00%) | 14/14 (100.00%) | 4/4 (100.00%) |
| packages/agent-runtime/src/acp-model-probe.ts | LOADED | 0 | 18/18 (100.00%) | 5/5 (100.00%) | 4/5 (80.00%) |
| packages/agent-runtime/src/agent-protocol/acp/account-failure.ts | LOADED | 0 | 13/13 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| packages/agent-runtime/src/agent-protocol/acp/constants.ts | LOADED | 0 | 14/14 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agent-runtime/src/agent-protocol/acp/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agent-runtime/src/agent-protocol/acp/json.ts | LOADED | 0 | 80/80 (100.00%) | 41/41 (100.00%) | 9/9 (100.00%) |
| packages/agent-runtime/src/agent-protocol/acp/models.ts | LOADED | 0 | 242/242 (100.00%) | 137/137 (100.00%) | 23/23 (100.00%) |
| packages/agent-runtime/src/agent-protocol/acp/rpc.ts | LOADED | 0 | 90/90 (100.00%) | 66/66 (100.00%) | 9/9 (100.00%) |
| packages/agent-runtime/src/agent-protocol/acp/session-params.ts | LOADED | 0 | 48/48 (100.00%) | 30/30 (100.00%) | 5/5 (100.00%) |
| packages/agent-runtime/src/agent-protocol/acp/session.ts | LOADED | 0 | 1004/1004 (100.00%) | 369/369 (100.00%) | 61/61 (100.00%) |
| packages/agent-runtime/src/agent-protocol/acp/text-suppression.ts | LOADED | 0 | 151/151 (100.00%) | 57/57 (100.00%) | 15/15 (100.00%) |
| packages/agent-runtime/src/agent-protocol/acp/updates.ts | LOADED | 0 | 154/154 (100.00%) | 98/98 (100.00%) | 18/18 (100.00%) |
| packages/agent-runtime/src/agent-protocol/core/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agent-runtime/src/agent-protocol/core/json-line-stream.ts | LOADED | 0 | 296/296 (100.00%) | 163/163 (100.00%) | 35/35 (100.00%) |
| packages/agent-runtime/src/agent-protocol/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agent-runtime/src/agent-protocol/pi-rpc/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agent-runtime/src/agent-protocol/pi-rpc/internal.ts | LOADED | 0 | 12/12 (100.00%) | 12/12 (100.00%) | 4/4 (100.00%) |
| packages/agent-runtime/src/agent-protocol/pi-rpc/models.ts | LOADED | 0 | 22/22 (100.00%) | 14/14 (100.00%) | 1/1 (100.00%) |
| packages/agent-runtime/src/agent-protocol/pi-rpc/session.ts | LOADED | 0 | 258/258 (100.00%) | 130/130 (100.00%) | 19/19 (100.00%) |
| packages/agent-runtime/src/amr-model-cache.ts | LOADED | 0 | 63/63 (100.00%) | 28/28 (100.00%) | 9/9 (100.00%) |
| packages/agent-runtime/src/amr-profile-resolver.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/agent-runtime/src/artifact-taxonomy.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/agent-runtime/src/auth.ts | LOADED | 0 | 225/225 (100.00%) | 130/130 (100.00%) | 31/31 (100.00%) |
| packages/agent-runtime/src/capabilities.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agent-runtime/src/claude-code-models.ts | LOADED | 0 | 164/164 (100.00%) | 117/117 (100.00%) | 14/14 (100.00%) |
| packages/agent-runtime/src/claude-segment-usage.ts | LOADED | 0 | 73/73 (100.00%) | 80/80 (100.00%) | 13/13 (100.00%) |
| packages/agent-runtime/src/claude-stream.ts | LOADED | 0 | 621/621 (100.00%) | 329/329 (100.00%) | 51/51 (100.00%) |
| packages/agent-runtime/src/copilot-stream.ts | LOADED | 0 | 83/83 (100.00%) | 50/50 (100.00%) | 10/10 (100.00%) |
| packages/agent-runtime/src/defs/aider.ts | LOADED | 0 | 33/33 (100.00%) | 6/9 (66.67%) | 2/2 (100.00%) |
| packages/agent-runtime/src/defs/amp.ts | LOADED | 0 | 29/29 (100.00%) | 5/5 (100.00%) | 1/2 (50.00%) |
| packages/agent-runtime/src/defs/amr.ts | LOADED | 0 | 212/212 (100.00%) | 98/98 (100.00%) | 19/19 (100.00%) |
| packages/agent-runtime/src/defs/antigravity.ts | LOADED | 0 | 94/94 (100.00%) | 31/31 (100.00%) | 7/7 (100.00%) |
| packages/agent-runtime/src/defs/auggie.ts | LOADED | 0 | 22/22 (100.00%) | 5/5 (100.00%) | 2/3 (66.67%) |
| packages/agent-runtime/src/defs/claude-compatible-args.ts | LOADED | 0 | 23/23 (100.00%) | 23/23 (100.00%) | 5/5 (100.00%) |
| packages/agent-runtime/src/defs/claude.ts | LOADED | 0 | 119/119 (100.00%) | 36/36 (100.00%) | 6/6 (100.00%) |
| packages/agent-runtime/src/defs/cline.ts | LOADED | 0 | 22/22 (100.00%) | 5/5 (100.00%) | 2/3 (66.67%) |
| packages/agent-runtime/src/defs/codebuddy.ts | LOADED | 0 | 62/62 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| packages/agent-runtime/src/defs/codex.ts | LOADED | 0 | 228/228 (100.00%) | 138/138 (100.00%) | 19/19 (100.00%) |
| packages/agent-runtime/src/defs/copilot.ts | LOADED | 0 | 31/31 (100.00%) | 9/9 (100.00%) | 1/2 (50.00%) |
| packages/agent-runtime/src/defs/crush.ts | LOADED | 0 | 21/21 (100.00%) | 4/4 (100.00%) | 1/2 (50.00%) |
| packages/agent-runtime/src/defs/cursor-agent.ts | LOADED | 0 | 69/69 (100.00%) | 37/37 (100.00%) | 6/6 (100.00%) |
| packages/agent-runtime/src/defs/deepseek.ts | LOADED | 0 | 24/24 (100.00%) | 3/3 (100.00%) | 1/2 (50.00%) |
| packages/agent-runtime/src/defs/devin.ts | LOADED | 0 | 40/40 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| packages/agent-runtime/src/defs/droid.ts | LOADED | 0 | 21/21 (100.00%) | 4/4 (100.00%) | 1/2 (50.00%) |
| packages/agent-runtime/src/defs/goose.ts | LOADED | 0 | 22/22 (100.00%) | 5/5 (100.00%) | 2/3 (66.67%) |
| packages/agent-runtime/src/defs/grok-build.ts | LOADED | 0 | 70/70 (100.00%) | 26/26 (100.00%) | 4/5 (80.00%) |
| packages/agent-runtime/src/defs/hermes.ts | LOADED | 0 | 44/44 (100.00%) | 5/5 (100.00%) | 2/3 (66.67%) |
| packages/agent-runtime/src/defs/index.ts | LOADED | 0 | 30/30 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agent-runtime/src/defs/kilo.ts | LOADED | 0 | 22/22 (100.00%) | 5/5 (100.00%) | 2/3 (66.67%) |
| packages/agent-runtime/src/defs/kimi.ts | LOADED | 0 | 28/28 (100.00%) | 5/5 (100.00%) | 2/3 (66.67%) |
| packages/agent-runtime/src/defs/kiro.ts | LOADED | 0 | 22/22 (100.00%) | 5/5 (100.00%) | 2/3 (66.67%) |
| packages/agent-runtime/src/defs/mimo.ts | LOADED | 0 | 20/20 (100.00%) | 3/3 (100.00%) | 1/2 (50.00%) |
| packages/agent-runtime/src/defs/opencode.ts | LOADED | 0 | 51/51 (100.00%) | 15/15 (100.00%) | 4/4 (100.00%) |
| packages/agent-runtime/src/defs/pi.ts | LOADED | 0 | 62/62 (100.00%) | 21/21 (100.00%) | 6/6 (100.00%) |
| packages/agent-runtime/src/defs/qoder.ts | LOADED | 0 | 37/37 (100.00%) | 13/13 (100.00%) | 4/4 (100.00%) |
| packages/agent-runtime/src/defs/qwen.ts | LOADED | 0 | 25/25 (100.00%) | 4/4 (100.00%) | 1/2 (50.00%) |
| packages/agent-runtime/src/defs/reasonix.ts | LOADED | 0 | 43/43 (100.00%) | 11/11 (100.00%) | 3/4 (75.00%) |
| packages/agent-runtime/src/defs/shared.ts | LOADED | 0 | 37/37 (100.00%) | 40/40 (100.00%) | 4/4 (100.00%) |
| packages/agent-runtime/src/defs/trae-cli.ts | LOADED | 0 | 25/25 (100.00%) | 7/7 (100.00%) | 2/3 (66.67%) |
| packages/agent-runtime/src/defs/vibe.ts | LOADED | 0 | 22/22 (100.00%) | 5/5 (100.00%) | 2/3 (66.67%) |
| packages/agent-runtime/src/detection.ts | LOADED | 0 | 302/302 (100.00%) | 123/123 (100.00%) | 28/28 (100.00%) |
| packages/agent-runtime/src/diagnostics.ts | LOADED | 0 | 67/67 (100.00%) | 30/30 (100.00%) | 4/4 (100.00%) |
| packages/agent-runtime/src/env.ts | LOADED | 0 | 45/45 (100.00%) | 23/23 (100.00%) | 5/5 (100.00%) |
| packages/agent-runtime/src/executables.ts | LOADED | 0 | 242/242 (100.00%) | 131/133 (98.50%) | 27/27 (100.00%) |
| packages/agent-runtime/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agent-runtime/src/invocation.ts | LOADED | 0 | 30/30 (100.00%) | 14/14 (100.00%) | 3/3 (100.00%) |
| packages/agent-runtime/src/json-event-stream.ts | LOADED | 0 | 793/793 (100.00%) | 441/441 (100.00%) | 80/80 (100.00%) |
| packages/agent-runtime/src/log-file.ts | LOADED | 0 | 14/14 (100.00%) | 7/7 (100.00%) | 2/2 (100.00%) |
| packages/agent-runtime/src/mcp.ts | LOADED | 0 | 11/11 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| packages/agent-runtime/src/metadata.ts | LOADED | 0 | 116/116 (100.00%) | 14/14 (100.00%) | 2/2 (100.00%) |
| packages/agent-runtime/src/mmd-routes.ts | LOADED | 0 | 124/124 (100.00%) | 82/82 (100.00%) | 11/11 (100.00%) |
| packages/agent-runtime/src/model-catalog-cache.ts | LOADED | 0 | 46/46 (100.00%) | 19/20 (95.00%) | 4/4 (100.00%) |
| packages/agent-runtime/src/model-discovery-config.ts | LOADED | 0 | 130/130 (100.00%) | 144/144 (100.00%) | 35/35 (100.00%) |
| packages/agent-runtime/src/model-discovery-native.ts | LOADED | 0 | 18/18 (100.00%) | 6/6 (100.00%) | 6/6 (100.00%) |
| packages/agent-runtime/src/model-discovery-shared.ts | LOADED | 0 | 56/56 (100.00%) | 62/62 (100.00%) | 9/9 (100.00%) |
| packages/agent-runtime/src/model-discovery.ts | LOADED | 0 | 232/232 (100.00%) | 216/216 (100.00%) | 38/38 (100.00%) |
| packages/agent-runtime/src/model-loading-state.ts | LOADED | 0 | 18/18 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| packages/agent-runtime/src/model-registry.ts | LOADED | 0 | 49/49 (100.00%) | 31/31 (100.00%) | 7/7 (100.00%) |
| packages/agent-runtime/src/models.ts | LOADED | 0 | 91/91 (100.00%) | 101/101 (100.00%) | 13/13 (100.00%) |
| packages/agent-runtime/src/native-runtime.ts | LOADED | 0 | 43/43 (100.00%) | 16/18 (88.89%) | 5/7 (71.43%) |
| packages/agent-runtime/src/native-tool-policy.ts | LOADED | 0 | 25/25 (100.00%) | 14/14 (100.00%) | 2/2 (100.00%) |
| packages/agent-runtime/src/opencode-log.ts | LOADED | 0 | 108/108 (100.00%) | 76/76 (100.00%) | 11/11 (100.00%) |
| packages/agent-runtime/src/paths.ts | LOADED | 0 | 17/17 (100.00%) | 14/14 (100.00%) | 2/2 (100.00%) |
| packages/agent-runtime/src/pi-models.ts | LOADED | 0 | 22/22 (100.00%) | 16/16 (100.00%) | 1/1 (100.00%) |
| packages/agent-runtime/src/probe-scheduler.ts | LOADED | 0 | 25/25 (100.00%) | 16/16 (100.00%) | 4/4 (100.00%) |
| packages/agent-runtime/src/prompt-augmenter.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/agent-runtime/src/prompt-budget.ts | LOADED | 0 | 91/91 (100.00%) | 58/58 (100.00%) | 8/8 (100.00%) |
| packages/agent-runtime/src/prompt-file.ts | LOADED | 0 | 15/15 (100.00%) | 7/7 (100.00%) | 2/2 (100.00%) |
| packages/agent-runtime/src/providers/aihubmix.ts | LOADED | 0 | 142/142 (100.00%) | 68/68 (100.00%) | 13/13 (100.00%) |
| packages/agent-runtime/src/providers/anthropic-messages.ts | LOADED | 0 | 332/332 (100.00%) | 183/183 (100.00%) | 29/29 (100.00%) |
| packages/agent-runtime/src/providers/google-messages.ts | LOADED | 0 | 325/325 (100.00%) | 200/200 (100.00%) | 24/24 (100.00%) |
| packages/agent-runtime/src/providers/google.ts | LOADED | 0 | 28/28 (100.00%) | 9/9 (100.00%) | 6/6 (100.00%) |
| packages/agent-runtime/src/providers/index.ts | LOADED | 0 | 21/21 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agent-runtime/src/providers/model-catalog.ts | LOADED | 0 | 373/373 (100.00%) | 220/221 (99.55%) | 25/25 (100.00%) |
| packages/agent-runtime/src/providers/oauth-callback-server.ts | LOADED | 0 | 155/155 (100.00%) | 58/58 (100.00%) | 10/10 (100.00%) |
| packages/agent-runtime/src/providers/oauth-credentials.ts | LOADED | 0 | 38/38 (100.00%) | 16/16 (100.00%) | 2/2 (100.00%) |
| packages/agent-runtime/src/providers/oauth-provider.ts | LOADED | 0 | 73/73 (100.00%) | 11/11 (100.00%) | 5/5 (100.00%) |
| packages/agent-runtime/src/providers/oauth-tokens.ts | LOADED | 0 | 102/102 (100.00%) | 55/55 (100.00%) | 12/12 (100.00%) |
| packages/agent-runtime/src/providers/ollama-chat.ts | LOADED | 0 | 285/285 (100.00%) | 141/142 (99.30%) | 23/23 (100.00%) |
| packages/agent-runtime/src/providers/openai-chat.ts | LOADED | 0 | 381/381 (100.00%) | 224/224 (100.00%) | 32/32 (100.00%) |
| packages/agent-runtime/src/providers/operation-schema.ts | LOADED | 0 | 163/163 (100.00%) | 147/164 (89.63%) | 23/23 (100.00%) |
| packages/agent-runtime/src/providers/pkce.ts | LOADED | 0 | 64/64 (100.00%) | 40/40 (100.00%) | 23/23 (100.00%) |
| packages/agent-runtime/src/providers/response-text.ts | LOADED | 0 | 19/19 (100.00%) | 12/13 (92.31%) | 1/1 (100.00%) |
| packages/agent-runtime/src/providers/sse-decode.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agent-runtime/src/providers/token-params.ts | LOADED | 0 | 28/28 (100.00%) | 13/13 (100.00%) | 5/5 (100.00%) |
| packages/agent-runtime/src/providers/turn-end-guard.ts | LOADED | 0 | 16/16 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| packages/agent-runtime/src/qoder-stream.ts | LOADED | 0 | 149/149 (100.00%) | 86/86 (100.00%) | 19/19 (100.00%) |
| packages/agent-runtime/src/registry.ts | LOADED | 0 | 46/46 (100.00%) | 7/7 (100.00%) | 2/2 (100.00%) |
| packages/agent-runtime/src/resolution.ts | LOADED | 0 | 6/6 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/agent-runtime/src/role-marker-guard.ts | LOADED | 0 | 64/64 (100.00%) | 26/26 (100.00%) | 4/4 (100.00%) |
| packages/agent-runtime/src/runtime-state.ts | LOADED | 0 | 25/25 (100.00%) | 12/13 (92.31%) | 5/5 (100.00%) |
| packages/agent-runtime/src/telemetry-sink.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/agent-runtime/src/terminal-launch.ts | LOADED | 0 | 73/73 (100.00%) | 21/21 (100.00%) | 5/5 (100.00%) |
| packages/agentic/src/core/a2ui/agent-to-renderer.ts | LOADED | 0 | 127/127 (100.00%) | 18/18 (100.00%) | 2/2 (100.00%) |
| packages/agentic/src/core/a2ui/catalog.ts | LOADED | 0 | 178/178 (100.00%) | 30/30 (100.00%) | 12/12 (100.00%) |
| packages/agentic/src/core/a2ui/common-types.ts | LOADED | 0 | 75/75 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| packages/agentic/src/core/a2ui/index.ts | LOADED | 0 | 10/10 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agentic/src/core/a2ui/interpreter.ts | LOADED | 0 | 222/222 (100.00%) | 119/120 (99.17%) | 23/23 (100.00%) |
| packages/agentic/src/core/a2ui/json-pointer.ts | LOADED | 0 | 110/110 (100.00%) | 75/75 (100.00%) | 20/20 (100.00%) |
| packages/agentic/src/core/a2ui/renderer-to-agent.ts | LOADED | 0 | 82/82 (100.00%) | 23/23 (100.00%) | 6/6 (100.00%) |
| packages/agentic/src/core/a2ui/resolve.ts | LOADED | 0 | 100/100 (100.00%) | 80/80 (100.00%) | 11/11 (100.00%) |
| packages/agentic/src/core/a2ui/surface-properties.ts | LOADED | 0 | 19/19 (100.00%) | 18/18 (100.00%) | 3/3 (100.00%) |
| packages/agentic/src/core/a2ui/tree.ts | LOADED | 0 | 38/38 (100.00%) | 14/14 (100.00%) | 2/2 (100.00%) |
| packages/agentic/src/core/ag-ui.ts | LOADED | 0 | 32/32 (100.00%) | 15/15 (100.00%) | 4/4 (100.00%) |
| packages/agentic/src/core/annotated-actions-script.ts | LOADED | 0 | 8/8 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/agentic/src/core/capability.ts | LOADED | 0 | 46/46 (100.00%) | 33/33 (100.00%) | 5/5 (100.00%) |
| packages/agentic/src/core/dom/dom-page-driver.ts | LOADED | 0 | 338/338 (100.00%) | 216/216 (100.00%) | 36/36 (100.00%) |
| packages/agentic/src/core/dom/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agentic/src/core/dom/model-context.ts | LOADED | 0 | 8/8 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/agentic/src/core/dom/native-model-context.ts | LOADED | 0 | 15/15 (100.00%) | 12/12 (100.00%) | 3/3 (100.00%) |
| packages/agentic/src/core/element-handles.ts | LOADED | 0 | 21/21 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| packages/agentic/src/core/gen-ui/encoder.ts | LOADED | 0 | 67/67 (100.00%) | 36/36 (100.00%) | 6/6 (100.00%) |
| packages/agentic/src/core/gen-ui/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agentic/src/core/guards.ts | LOADED | 0 | 78/78 (100.00%) | 44/44 (100.00%) | 8/8 (100.00%) |
| packages/agentic/src/core/handle.ts | LOADED | 0 | 31/31 (100.00%) | 24/24 (100.00%) | 4/4 (100.00%) |
| packages/agentic/src/core/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agentic/src/core/list-handles.ts | LOADED | 0 | 15/15 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/agentic/src/core/mcp-ui-apps.ts | LOADED | 0 | 102/102 (100.00%) | 42/42 (100.00%) | 12/12 (100.00%) |
| packages/agentic/src/core/messages.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/agentic/src/core/page-capabilities.ts | LOADED | 0 | 137/137 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agentic/src/core/page-executor.ts | LOADED | 0 | 229/229 (100.00%) | 128/128 (100.00%) | 16/16 (100.00%) |
| packages/agentic/src/core/site-guide/index.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agentic/src/core/site-guide/site-guide.ts | LOADED | 0 | 111/111 (100.00%) | 86/86 (100.00%) | 15/15 (100.00%) |
| packages/agentic/src/core/webmcp.ts | LOADED | 0 | 74/74 (100.00%) | 33/33 (100.00%) | 8/8 (100.00%) |
| packages/agentic/src/skills/install/archive.ts | LOADED | 0 | 40/40 (100.00%) | 31/31 (100.00%) | 4/4 (100.00%) |
| packages/agentic/src/skills/install/fetch-adapter.ts | LOADED | 0 | 7/7 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/agentic/src/skills/install/github.ts | LOADED | 0 | 93/93 (100.00%) | 94/94 (100.00%) | 10/10 (100.00%) |
| packages/agentic/src/skills/install/index.ts | LOADED | 0 | 11/11 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/agentic/src/skills/install/install-service.ts | LOADED | 0 | 101/101 (100.00%) | 36/43 (83.72%) | 13/13 (100.00%) |
| packages/agentic/src/skills/install/layout.ts | LOADED | 0 | 14/14 (100.00%) | 15/15 (100.00%) | 2/2 (100.00%) |
| packages/agentic/src/skills/install/node-filesystem.ts | LOADED | 0 | 32/32 (100.00%) | 13/18 (72.22%) | 8/8 (100.00%) |
| packages/agentic/src/skills/install/state.ts | LOADED | 0 | 24/24 (100.00%) | 22/22 (100.00%) | 2/2 (100.00%) |
| packages/agentic/src/skills/install/validation.ts | LOADED | 0 | 93/93 (100.00%) | 97/97 (100.00%) | 11/11 (100.00%) |
| packages/agentic/src/skills/install/yauzl-archive-reader.ts | LOADED | 0 | 21/21 (100.00%) | 9/10 (90.00%) | 4/4 (100.00%) |
| packages/analytics/src/index.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/analytics/src/ingest.ts | LOADED | 0 | 289/289 (100.00%) | 176/176 (100.00%) | 26/26 (100.00%) |
| packages/analytics/src/ports.ts | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/analytics/src/salt.ts | LOADED | 0 | 9/9 (100.00%) | 6/7 (85.71%) | 1/1 (100.00%) |
| packages/artifacts/src/index.ts | LOADED | 0 | 8/8 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/artifacts/src/manifest.ts | LOADED | 0 | 245/245 (100.00%) | 137/137 (100.00%) | 15/15 (100.00%) |
| packages/artifacts/src/node/index.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/artifacts/src/node/stub-guard.ts | LOADED | 0 | 111/111 (100.00%) | 57/58 (98.28%) | 10/10 (100.00%) |
| packages/artifacts/src/publication-guard.ts | LOADED | 0 | 43/43 (100.00%) | 21/21 (100.00%) | 8/8 (100.00%) |
| packages/artifacts/src/runtime-compat.ts | LOADED | 0 | 6/6 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| packages/artifacts/src/store.ts | LOADED | 0 | 62/62 (100.00%) | 27/27 (100.00%) | 10/10 (100.00%) |
| packages/artifacts/src/stub-guard.ts | LOADED | 0 | 90/90 (100.00%) | 43/43 (100.00%) | 8/8 (100.00%) |
| packages/artifacts/src/text-suppression.ts | LOADED | 0 | 133/133 (100.00%) | 66/66 (100.00%) | 20/20 (100.00%) |
| packages/artifacts/src/tokens.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/capability-providers/src/adapters/blob-storage/index.ts | LOADED | 0 | 43/43 (100.00%) | 17/17 (100.00%) | 7/7 (100.00%) |
| packages/capability-providers/src/adapters/jwt-auth/index.ts | LOADED | 0 | 122/122 (100.00%) | 45/45 (100.00%) | 12/12 (100.00%) |
| packages/capability-providers/src/adapters/sqlite/index.ts | LOADED | 0 | 66/66 (100.00%) | 21/21 (100.00%) | 8/8 (100.00%) |
| packages/capability-providers/src/adapters/stripe/index.ts | LOADED | 0 | 116/116 (100.00%) | 74/74 (100.00%) | 12/12 (100.00%) |
| packages/capability-providers/src/adapters/ws/index.ts | LOADED | 0 | 116/116 (100.00%) | 50/50 (100.00%) | 18/18 (100.00%) |
| packages/capability-providers/src/index.ts | LOADED | 0 | 7/7 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/capability-providers/src/tokens.ts | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/capability-providers/src/unsafe-reference/auth.ts | LOADED | 0 | 50/50 (100.00%) | 16/16 (100.00%) | 5/5 (100.00%) |
| packages/capability-providers/src/unsafe-reference/db.ts | LOADED | 0 | 44/44 (100.00%) | 24/24 (100.00%) | 8/8 (100.00%) |
| packages/capability-providers/src/unsafe-reference/index.ts | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/capability-providers/src/unsafe-reference/payments.ts | LOADED | 0 | 37/37 (100.00%) | 11/11 (100.00%) | 4/4 (100.00%) |
| packages/capability-providers/src/unsafe-reference/realtime.ts | LOADED | 0 | 30/30 (100.00%) | 10/10 (100.00%) | 4/4 (100.00%) |
| packages/capability-providers/src/unsafe-reference/storage.ts | LOADED | 0 | 29/29 (100.00%) | 12/12 (100.00%) | 5/5 (100.00%) |
| packages/capability-providers/src/visitor-auth/definitions.ts | LOADED | 0 | 52/52 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/capability-providers/src/visitor-auth/index.ts | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/capability-providers/src/visitor-auth/tokens.ts | LOADED | 0 | 22/22 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/charts-recharts/src/bar-chart.tsx | LOADED | 0 | 27/27 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| packages/charts-recharts/src/chart-config.ts | LOADED | 0 | 20/20 (100.00%) | 13/13 (100.00%) | 3/3 (100.00%) |
| packages/charts-recharts/src/chart-tokens.ts | LOADED | 0 | 14/14 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/charts-recharts/src/chart.tsx | LOADED | 0 | 62/62 (100.00%) | 30/30 (100.00%) | 4/4 (100.00%) |
| packages/charts-recharts/src/descriptor.ts | LOADED | 0 | 7/7 (100.00%) | 9/9 (100.00%) | 1/1 (100.00%) |
| packages/charts-recharts/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/charts-recharts/src/line-chart.tsx | LOADED | 0 | 22/22 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/charts-recharts/src/mount.tsx | LOADED | 0 | 53/53 (100.00%) | 25/36 (69.44%) | 13/13 (100.00%) |
| packages/charts-recharts/src/pie-chart.tsx | LOADED | 0 | 22/22 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/chat/src/core/accepted-input.ts | LOADED | 0 | 139/139 (100.00%) | 134/138 (97.10%) | 13/13 (100.00%) |
| packages/chat/src/core/agent-plugin-chat-state.ts | LOADED | 0 | 34/34 (100.00%) | 33/33 (100.00%) | 7/7 (100.00%) |
| packages/chat/src/core/agentic/chat-capabilities.ts | LOADED | 0 | 96/96 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/chat/src/core/agentic/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/chat/src/core/assistant-client/transport.ts | LOADED | 0 | 390/390 (100.00%) | 262/262 (100.00%) | 51/51 (100.00%) |
| packages/chat/src/core/assistant-content.ts | LOADED | 0 | 26/26 (100.00%) | 24/24 (100.00%) | 3/3 (100.00%) |
| packages/chat/src/core/browser/page-actions.ts | LOADED | 0 | 89/89 (100.00%) | 62/65 (95.38%) | 17/17 (100.00%) |
| packages/chat/src/core/compact-events.ts | LOADED | 0 | 15/15 (100.00%) | 10/10 (100.00%) | 2/2 (100.00%) |
| packages/chat/src/core/composer-history.ts | LOADED | 0 | 74/74 (100.00%) | 53/53 (100.00%) | 8/8 (100.00%) |
| packages/chat/src/core/conversation-title.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/chat/src/core/durable-projection.ts | LOADED | 0 | 82/82 (100.00%) | 94/94 (100.00%) | 9/9 (100.00%) |
| packages/chat/src/core/durable-runs/continuation.ts | LOADED | 0 | 77/77 (100.00%) | 56/56 (100.00%) | 7/7 (100.00%) |
| packages/chat/src/core/durable-runs/policies.ts | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/chat/src/core/durable-runs/run-lock.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/chat/src/core/history-tool-metadata.ts | LOADED | 0 | 11/11 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/chat/src/core/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/chat/src/core/messages.ts | LOADED | 0 | 5/5 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/chat/src/core/partial-json.ts | LOADED | 0 | 78/78 (100.00%) | 46/46 (100.00%) | 8/8 (100.00%) |
| packages/chat/src/core/persistence/index.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/chat/src/core/persistence/title.ts | LOADED | 0 | 90/90 (100.00%) | 33/37 (89.19%) | 8/8 (100.00%) |
| packages/chat/src/core/question-answer.ts | LOADED | 0 | 44/44 (100.00%) | 49/49 (100.00%) | 5/5 (100.00%) |
| packages/chat/src/core/question-form.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/chat/src/core/question-form/format.ts | LOADED | 0 | 33/33 (100.00%) | 32/32 (100.00%) | 6/6 (100.00%) |
| packages/chat/src/core/question-form/normalize.ts | LOADED | 0 | 141/141 (100.00%) | 109/109 (100.00%) | 19/19 (100.00%) |
| packages/chat/src/core/question-form/scan.ts | LOADED | 0 | 215/215 (100.00%) | 135/135 (100.00%) | 19/19 (100.00%) |
| packages/chat/src/core/question-form/secret-answers.ts | LOADED | 0 | 39/39 (100.00%) | 23/24 (95.83%) | 6/6 (100.00%) |
| packages/chat/src/core/run-activity.ts | LOADED | 0 | 159/159 (100.00%) | 111/111 (100.00%) | 22/22 (100.00%) |
| packages/chat/src/core/run-events/entry.ts | LOADED | 0 | 267/267 (100.00%) | 202/202 (100.00%) | 35/35 (100.00%) |
| packages/chat/src/core/surface-expiry.ts | LOADED | 0 | 13/13 (100.00%) | 7/7 (100.00%) | 2/2 (100.00%) |
| packages/chat/src/core/todos.ts | LOADED | 0 | 99/99 (100.00%) | 70/70 (100.00%) | 14/14 (100.00%) |
| packages/chat/src/core/tool-call-detail.ts | LOADED | 0 | 36/36 (100.00%) | 33/33 (100.00%) | 6/6 (100.00%) |
| packages/chat/src/core/tool-events.ts | LOADED | 0 | 46/46 (100.00%) | 53/53 (100.00%) | 4/4 (100.00%) |
| packages/chat/src/core/tool-output.ts | LOADED | 0 | 10/10 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| packages/chat/src/core/tools.ts | LOADED | 0 | 18/18 (100.00%) | 17/17 (100.00%) | 2/2 (100.00%) |
| packages/chat/src/core/transcript.ts | LOADED | 0 | 120/120 (100.00%) | 62/63 (98.41%) | 10/10 (100.00%) |
| packages/chat/src/core/turn-usage.ts | LOADED | 0 | 105/105 (100.00%) | 85/85 (100.00%) | 12/12 (100.00%) |
| packages/chat/src/core/usage-format.ts | LOADED | 0 | 7/7 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| packages/chat/src/core/user-text-redaction.ts | LOADED | 0 | 73/73 (100.00%) | 52/53 (98.11%) | 7/8 (87.50%) |
| packages/chat/src/core/util/index.ts | LOADED | 0 | 8/8 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/chat/src/core/util/manifest.ts | LOADED | 0 | 144/144 (100.00%) | 60/60 (100.00%) | 12/12 (100.00%) |
| packages/chat/src/core/util/markdown-context.ts | LOADED | 0 | 66/66 (100.00%) | 38/38 (100.00%) | 7/7 (100.00%) |
| packages/chat/src/core/util/markup-attributes.ts | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/chat/src/core/util/parser.ts | LOADED | 0 | 158/158 (100.00%) | 85/85 (100.00%) | 13/13 (100.00%) |
| packages/chat/src/core/util/pointer.ts | LOADED | 0 | 53/53 (100.00%) | 41/41 (100.00%) | 9/9 (100.00%) |
| packages/chat/src/core/util/recover.ts | LOADED | 0 | 65/65 (100.00%) | 43/43 (100.00%) | 6/6 (100.00%) |
| packages/chat/src/core/util/strip.ts | LOADED | 0 | 175/175 (100.00%) | 111/111 (100.00%) | 15/15 (100.00%) |
| packages/chat/src/core/util/validate.ts | LOADED | 0 | 135/135 (100.00%) | 60/60 (100.00%) | 13/13 (100.00%) |
| packages/cli/src/command-registry.ts | LOADED | 0 | 40/40 (100.00%) | 29/29 (100.00%) | 8/8 (100.00%) |
| packages/cli/src/daemon-command.ts | LOADED | 0 | 71/71 (100.00%) | 42/42 (100.00%) | 10/10 (100.00%) |
| packages/cli/src/daemon-url.ts | LOADED | 0 | 53/53 (100.00%) | 40/40 (100.00%) | 6/6 (100.00%) |
| packages/cli/src/errors.ts | LOADED | 0 | 63/63 (100.00%) | 50/50 (100.00%) | 6/6 (100.00%) |
| packages/cli/src/flags.ts | LOADED | 0 | 61/61 (100.00%) | 50/50 (100.00%) | 5/5 (100.00%) |
| packages/cli/src/http.ts | LOADED | 0 | 193/193 (100.00%) | 118/118 (100.00%) | 25/25 (100.00%) |
| packages/cli/src/index.ts | LOADED | 0 | 15/15 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cli/src/introspection.ts | LOADED | 0 | 41/41 (100.00%) | 20/24 (83.33%) | 3/3 (100.00%) |
| packages/cli/src/local-daemon-discovery.ts | LOADED | 0 | 15/15 (100.00%) | 10/10 (100.00%) | 2/2 (100.00%) |
| packages/cli/src/main.ts | LOADED | 0 | 122/122 (100.00%) | 62/62 (100.00%) | 12/12 (100.00%) |
| packages/cli/src/prompt.ts | LOADED | 0 | 131/131 (100.00%) | 67/67 (100.00%) | 15/15 (100.00%) |
| packages/cli/src/redact.ts | LOADED | 0 | 18/18 (100.00%) | 14/14 (100.00%) | 1/1 (100.00%) |
| packages/cli/src/run-command.ts | LOADED | 0 | 189/189 (100.00%) | 122/122 (100.00%) | 21/21 (100.00%) |
| packages/cli/src/tokens.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cli/src/usage.ts | LOADED | 0 | 14/14 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| packages/cli/src/version-command.ts | LOADED | 0 | 46/46 (100.00%) | 32/32 (100.00%) | 8/8 (100.00%) |
| packages/cms/forms/src/errors.ts | LOADED | 0 | 22/22 (100.00%) | 9/9 (100.00%) | 9/10 (90.00%) |
| packages/cms/forms/src/index.ts | LOADED | 0 | 9/9 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/forms/src/notify-subscriber.ts | LOADED | 0 | 54/54 (100.00%) | 20/20 (100.00%) | 3/3 (100.00%) |
| packages/cms/forms/src/rate-limit-key.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/cms/forms/src/submission-ip-retention.ts | LOADED | 0 | 17/17 (100.00%) | 9/9 (100.00%) | 1/1 (100.00%) |
| packages/cms/forms/src/submit-service.ts | LOADED | 0 | 48/48 (100.00%) | 17/18 (94.44%) | 1/1 (100.00%) |
| packages/cms/forms/src/write-service.ts | LOADED | 0 | 209/209 (100.00%) | 51/51 (100.00%) | 13/13 (100.00%) |
| packages/cms/src/comments/express/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/comments/express/submit-handler.ts | LOADED | 0 | 60/60 (100.00%) | 34/34 (100.00%) | 5/5 (100.00%) |
| packages/cms/src/comments/ingress.ts | LOADED | 0 | 124/124 (100.00%) | 49/49 (100.00%) | 11/11 (100.00%) |
| packages/cms/src/comments/sanitize.ts | LOADED | 0 | 14/14 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| packages/cms/src/comments/spam.heuristic.ts | LOADED | 0 | 33/33 (100.00%) | 11/11 (100.00%) | 3/3 (100.00%) |
| packages/cms/src/comments/sql/index.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/comments/sql/repo.rows.ts | LOADED | 0 | 70/70 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| packages/cms/src/comments/types.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/comments/write-service.ts | LOADED | 0 | 103/103 (100.00%) | 23/24 (95.83%) | 5/5 (100.00%) |
| packages/cms/src/consent/css-parser.ts | LOADED | 0 | 84/84 (100.00%) | 72/75 (96.00%) | 9/9 (100.00%) |
| packages/cms/src/consent/css.ts | LOADED | 0 | 124/124 (100.00%) | 99/100 (99.00%) | 21/21 (100.00%) |
| packages/cms/src/consent/express/index.ts | LOADED | 0 | 135/135 (100.00%) | 109/110 (99.09%) | 17/17 (100.00%) |
| packages/cms/src/consent/html/client.ts | LOADED | 0 | 7/7 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/consent/html/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/consent/html/render.ts | LOADED | 0 | 69/69 (100.00%) | 70/71 (98.59%) | 11/11 (100.00%) |
| packages/cms/src/consent/html/resources.ts | LOADED | 0 | 71/71 (100.00%) | 48/58 (82.76%) | 9/9 (100.00%) |
| packages/cms/src/consent/html/static.ts | LOADED | 0 | 22/22 (100.00%) | 14/14 (100.00%) | 2/2 (100.00%) |
| packages/cms/src/consent/html/styles.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/consent/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/consent/node/index.ts | LOADED | 0 | 118/118 (100.00%) | 94/94 (100.00%) | 14/14 (100.00%) |
| packages/cms/src/consent/policy.ts | LOADED | 0 | 46/46 (100.00%) | 60/60 (100.00%) | 8/8 (100.00%) |
| packages/cms/src/consent/types.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/content-types/agent-tools.ts | LOADED | 0 | 129/129 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/content-types/errors.ts | LOADED | 0 | 112/112 (100.00%) | 20/20 (100.00%) | 18/18 (100.00%) |
| packages/cms/src/content-types/field-defs.ts | LOADED | 0 | 60/60 (100.00%) | 35/35 (100.00%) | 4/4 (100.00%) |
| packages/cms/src/content-types/index-provisioning.ts | LOADED | 0 | 66/66 (100.00%) | 33/33 (100.00%) | 7/7 (100.00%) |
| packages/cms/src/content-types/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/content-types/lifecycle-dispatch.ts | LOADED | 0 | 17/17 (100.00%) | 4/4 (100.00%) | 1/4 (25.00%) |
| packages/cms/src/content-types/list.ts | LOADED | 0 | 8/8 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/content-types/types.ts | LOADED | 0 | 15/15 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/cms/src/content-types/write-service.ts | LOADED | 0 | 184/184 (100.00%) | 91/91 (100.00%) | 10/10 (100.00%) |
| packages/cms/src/core/commands/command.ts | LOADED | 0 | 141/141 (100.00%) | 45/45 (100.00%) | 9/9 (100.00%) |
| packages/cms/src/core/entity-liveness.ts | LOADED | 0 | 26/26 (100.00%) | 11/11 (100.00%) | 4/4 (100.00%) |
| packages/cms/src/core/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/core/keyset-cursor.ts | LOADED | 0 | 13/13 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| packages/cms/src/core/tools/args.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/core/tools/index.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/core/transform-format.ts | LOADED | 0 | 10/10 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/entries/agent-tools.ts | LOADED | 0 | 95/95 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/entries/errors.ts | LOADED | 0 | 56/56 (100.00%) | 15/15 (100.00%) | 9/9 (100.00%) |
| packages/cms/src/entries/field-validation.ts | LOADED | 0 | 104/104 (100.00%) | 65/65 (100.00%) | 12/12 (100.00%) |
| packages/cms/src/entries/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/entries/lifecycle-dispatch.ts | LOADED | 0 | 14/14 (100.00%) | 4/4 (100.00%) | 1/3 (33.33%) |
| packages/cms/src/entries/list.ts | LOADED | 0 | 9/9 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/entries/write-service.ts | LOADED | 0 | 238/238 (100.00%) | 126/126 (100.00%) | 17/17 (100.00%) |
| packages/cms/src/forms/delete-submission.ts | LOADED | 0 | 17/17 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/forms/delivery/deliver-job.ts | LOADED | 0 | 21/21 (100.00%) | 18/18 (100.00%) | 2/2 (100.00%) |
| packages/cms/src/forms/delivery/errors.ts | LOADED | 0 | 32/32 (100.00%) | 16/16 (100.00%) | 4/4 (100.00%) |
| packages/cms/src/forms/delivery/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/forms/delivery/planner.ts | LOADED | 0 | 31/31 (100.00%) | 12/12 (100.00%) | 4/4 (100.00%) |
| packages/cms/src/forms/delivery/pull-lease.ts | LOADED | 0 | 15/15 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/forms/delivery/pull-trigger.ts | LOADED | 0 | 24/24 (100.00%) | 9/9 (100.00%) | 3/3 (100.00%) |
| packages/cms/src/forms/delivery/retry-policy.ts | LOADED | 0 | 15/15 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| packages/cms/src/forms/delivery/status.ts | LOADED | 0 | 20/20 (100.00%) | 16/16 (100.00%) | 2/2 (100.00%) |
| packages/cms/src/forms/delivery/subscriptions.ts | LOADED | 0 | 27/27 (100.00%) | 14/14 (100.00%) | 6/6 (100.00%) |
| packages/cms/src/forms/delivery/types.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/forms/descriptor-rules.ts | LOADED | 0 | 111/111 (100.00%) | 161/161 (100.00%) | 25/25 (100.00%) |
| packages/cms/src/forms/duplicate-slug.ts | LOADED | 0 | 34/34 (100.00%) | 10/11 (90.91%) | 6/6 (100.00%) |
| packages/cms/src/forms/email-format.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/forms/errors.ts | LOADED | 0 | 22/22 (100.00%) | 9/9 (100.00%) | 9/10 (90.00%) |
| packages/cms/src/forms/field-registry.ts | LOADED | 0 | 201/201 (100.00%) | 257/257 (100.00%) | 39/39 (100.00%) |
| packages/cms/src/forms/fields-json.ts | LOADED | 0 | 9/9 (100.00%) | 6/7 (85.71%) | 2/2 (100.00%) |
| packages/cms/src/forms/forms.ts | LOADED | 0 | 145/145 (100.00%) | 101/101 (100.00%) | 15/15 (100.00%) |
| packages/cms/src/forms/html-render.ts | LOADED | 0 | 118/118 (100.00%) | 120/120 (100.00%) | 20/20 (100.00%) |
| packages/cms/src/forms/html/authoring-adapter.ts | LOADED | 0 | 49/49 (100.00%) | 39/39 (100.00%) | 13/13 (100.00%) |
| packages/cms/src/forms/html/html-authoring.ts | LOADED | 0 | 195/195 (100.00%) | 175/175 (100.00%) | 22/22 (100.00%) |
| packages/cms/src/forms/html/html-submission-adapter.ts | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/forms/html/index.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/forms/index.ts | LOADED | 0 | 18/18 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/forms/notify-subscriber.ts | LOADED | 0 | 55/55 (100.00%) | 20/20 (100.00%) | 3/3 (100.00%) |
| packages/cms/src/forms/rate-limit-key.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/forms/repo.memory.ts | LOADED | 0 | 146/146 (100.00%) | 81/83 (97.59%) | 24/24 (100.00%) |
| packages/cms/src/forms/sql/index.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/forms/sql/repo.rows.ts | LOADED | 0 | 55/55 (100.00%) | 7/9 (77.78%) | 5/5 (100.00%) |
| packages/cms/src/forms/sql/submission-ip-retention-repo.ts | LOADED | 0 | 29/29 (100.00%) | 6/8 (75.00%) | 2/2 (100.00%) |
| packages/cms/src/forms/submission-attempts.ts | LOADED | 0 | 64/64 (100.00%) | 38/38 (100.00%) | 8/8 (100.00%) |
| packages/cms/src/forms/submission-ip-retention.ts | LOADED | 0 | 17/17 (100.00%) | 9/9 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/forms/submit-service.ts | LOADED | 0 | 129/129 (100.00%) | 63/63 (100.00%) | 11/11 (100.00%) |
| packages/cms/src/forms/types.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/forms/write-service.ts | LOADED | 0 | 246/246 (100.00%) | 74/76 (97.37%) | 15/15 (100.00%) |
| packages/cms/src/listing/batch.ts | LOADED | 0 | 44/44 (100.00%) | 21/21 (100.00%) | 5/5 (100.00%) |
| packages/cms/src/listing/html.ts | LOADED | 0 | 72/72 (100.00%) | 38/41 (92.68%) | 13/13 (100.00%) |
| packages/cms/src/listing/index.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/listing/paths.ts | LOADED | 0 | 24/24 (100.00%) | 20/20 (100.00%) | 4/4 (100.00%) |
| packages/cms/src/listing/see-more-script.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/media/agent-tools.ts | LOADED | 0 | 111/111 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/media/blob-gc-lock.ts | LOADED | 0 | 17/17 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/media/blob-key.ts | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/media/content-type-sniffer.ts | LOADED | 0 | 103/103 (100.00%) | 72/72 (100.00%) | 17/17 (100.00%) |
| packages/cms/src/media/document-ingress.ts | LOADED | 0 | 160/160 (100.00%) | 155/155 (100.00%) | 24/24 (100.00%) |
| packages/cms/src/media/document-read.ts | LOADED | 0 | 47/47 (100.00%) | 39/39 (100.00%) | 6/6 (100.00%) |
| packages/cms/src/media/html-attributes.ts | LOADED | 0 | 52/52 (100.00%) | 35/36 (97.22%) | 4/4 (100.00%) |
| packages/cms/src/media/image-transformer.ts | LOADED | 0 | 11/11 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/media/import/index.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/media/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/media/media-service.ts | LOADED | 0 | 333/333 (100.00%) | 146/152 (96.05%) | 31/31 (100.00%) |
| packages/cms/src/media/replace-media-file.ts | LOADED | 0 | 29/29 (100.00%) | 12/14 (85.71%) | 2/2 (100.00%) |
| packages/cms/src/media/slug.ts | LOADED | 0 | 6/6 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/media/transform-lock.ts | LOADED | 0 | 20/20 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| packages/cms/src/media/transform-registry.ts | LOADED | 0 | 42/42 (100.00%) | 12/14 (85.71%) | 5/5 (100.00%) |
| packages/cms/src/media/transform-types.ts | LOADED | 0 | 32/32 (100.00%) | 15/15 (100.00%) | 5/5 (100.00%) |
| packages/cms/src/media/types.ts | LOADED | 0 | 28/28 (100.00%) | 6/6 (100.00%) | 6/6 (100.00%) |
| packages/cms/src/media/video-frames.ffmpeg.ts | LOADED | 0 | 256/256 (100.00%) | 177/177 (100.00%) | 33/33 (100.00%) |
| packages/cms/src/media/video-frames.ts | LOADED | 0 | 93/93 (100.00%) | 88/88 (100.00%) | 11/11 (100.00%) |
| packages/cms/src/navigation/agent-tools.ts | LOADED | 0 | 166/166 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/navigation/contracts.ts | LOADED | 0 | 28/28 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/navigation/dropdown.ts | LOADED | 0 | 21/21 (100.00%) | 9/9 (100.00%) | 3/3 (100.00%) |
| packages/cms/src/navigation/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/navigation/menu-html.ts | LOADED | 0 | 23/23 (100.00%) | 22/22 (100.00%) | 3/3 (100.00%) |
| packages/cms/src/navigation/menu-service.ts | LOADED | 0 | 374/374 (100.00%) | 139/139 (100.00%) | 29/29 (100.00%) |
| packages/cms/src/navigation/reconcile.ts | LOADED | 0 | 21/21 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/navigation/resolver.ts | LOADED | 0 | 76/76 (100.00%) | 23/24 (95.83%) | 4/4 (100.00%) |
| packages/cms/src/navigation/types.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/redirects/capture.ts | LOADED | 0 | 50/50 (100.00%) | 9/9 (100.00%) | 2/2 (100.00%) |
| packages/cms/src/redirects/express/index.ts | LOADED | 0 | 28/28 (100.00%) | 11/11 (100.00%) | 2/2 (100.00%) |
| packages/cms/src/redirects/hit-sink.ts | LOADED | 0 | 35/35 (100.00%) | 15/15 (100.00%) | 6/6 (100.00%) |
| packages/cms/src/redirects/host-config/index.ts | LOADED | 0 | 101/101 (100.00%) | 84/84 (100.00%) | 13/13 (100.00%) |
| packages/cms/src/redirects/order.ts | LOADED | 0 | 13/13 (100.00%) | 25/25 (100.00%) | 3/3 (100.00%) |
| packages/cms/src/redirects/ports.internal.ts | LOADED | 0 | 8/8 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/redirects/redirects.ts | LOADED | 0 | 405/405 (100.00%) | 162/162 (100.00%) | 26/26 (100.00%) |
| packages/cms/src/redirects/referrer-alias.ts | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/redirects/repo.memory.ts | LOADED | 0 | 88/88 (100.00%) | 67/68 (98.53%) | 14/14 (100.00%) |
| packages/cms/src/redirects/reserved-destination.ts | LOADED | 0 | 10/10 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/redirects/resolver.ts | LOADED | 0 | 52/52 (100.00%) | 14/15 (93.33%) | 5/5 (100.00%) |
| packages/cms/src/redirects/spa/index.ts | LOADED | 0 | 15/15 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/redirects/sql/repo.rows.ts | LOADED | 0 | 73/73 (100.00%) | 19/19 (100.00%) | 5/5 (100.00%) |
| packages/cms/src/redirects/sql/repo.ts | LOADED | 0 | 143/143 (100.00%) | 59/59 (100.00%) | 16/16 (100.00%) |
| packages/cms/src/redirects/types.ts | LOADED | 0 | 8/8 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/routing/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/routing/routing.ts | LOADED | 0 | 189/189 (100.00%) | 83/84 (98.81%) | 24/24 (100.00%) |
| packages/cms/src/seo/absolute-url.ts | LOADED | 0 | 29/29 (100.00%) | 24/24 (100.00%) | 4/4 (100.00%) |
| packages/cms/src/seo/dom/index.ts | LOADED | 0 | 44/44 (100.00%) | 10/10 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/seo/errors.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/seo/feed.ts | LOADED | 0 | 36/36 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| packages/cms/src/seo/media.ts | LOADED | 0 | 83/83 (100.00%) | 66/66 (100.00%) | 10/10 (100.00%) |
| packages/cms/src/seo/page-head.ts | LOADED | 0 | 85/85 (100.00%) | 30/31 (96.77%) | 6/6 (100.00%) |
| packages/cms/src/seo/seo.ts | LOADED | 0 | 227/227 (100.00%) | 113/113 (100.00%) | 19/19 (100.00%) |
| packages/cms/src/seo/sitemap.ts | LOADED | 0 | 129/129 (100.00%) | 57/57 (100.00%) | 21/21 (100.00%) |
| packages/cms/src/seo/write-service.ts | LOADED | 0 | 174/174 (100.00%) | 67/67 (100.00%) | 14/14 (100.00%) |
| packages/cms/src/seo/xml-escape.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/settings/express/index.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/settings/index.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/taxonomy/content-lookup.ts | LOADED | 0 | 31/31 (100.00%) | 12/13 (92.31%) | 6/6 (100.00%) |
| packages/cms/src/taxonomy/list.ts | LOADED | 0 | 13/13 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/taxonomy/validation-chain.ts | LOADED | 0 | 115/115 (100.00%) | 38/38 (100.00%) | 10/10 (100.00%) |
| packages/cms/src/taxonomy/write-service.ts | LOADED | 0 | 494/494 (100.00%) | 159/159 (100.00%) | 38/38 (100.00%) |
| packages/cms/src/trash/index.ts | LOADED | 0 | 7/7 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/trash/sweeper.ts | LOADED | 0 | 74/74 (100.00%) | 32/33 (96.97%) | 8/8 (100.00%) |
| packages/cms/src/trash/write-service.ts | LOADED | 0 | 168/168 (100.00%) | 63/67 (94.03%) | 14/14 (100.00%) |
| packages/cms/src/widgets/authorize-helper.ts | LOADED | 0 | 16/16 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| packages/cms/src/widgets/concurrency.ts | LOADED | 0 | 29/29 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| packages/cms/src/widgets/config-validation.ts | LOADED | 0 | 117/117 (100.00%) | 63/63 (100.00%) | 13/13 (100.00%) |
| packages/cms/src/widgets/embed-service.ts | LOADED | 0 | 361/361 (100.00%) | 157/157 (100.00%) | 44/44 (100.00%) |
| packages/cms/src/widgets/embed-validation.ts | LOADED | 0 | 12/12 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/widgets/entry-payload.ts | LOADED | 0 | 105/105 (100.00%) | 22/24 (91.67%) | 13/13 (100.00%) |
| packages/cms/src/widgets/gallery-resolver.ts | LOADED | 0 | 68/68 (100.00%) | 60/60 (100.00%) | 8/8 (100.00%) |
| packages/cms/src/widgets/html/gallery-render.ts | LOADED | 0 | 57/57 (100.00%) | 56/56 (100.00%) | 8/8 (100.00%) |
| packages/cms/src/widgets/html/html-embeds.ts | LOADED | 0 | 107/107 (100.00%) | 58/58 (100.00%) | 13/13 (100.00%) |
| packages/cms/src/widgets/html/legacy-widget-markers.ts | LOADED | 0 | 50/50 (100.00%) | 40/40 (100.00%) | 5/5 (100.00%) |
| packages/cms/src/widgets/html/server-fragment.ts | LOADED | 0 | 24/24 (100.00%) | 26/26 (100.00%) | 4/4 (100.00%) |
| packages/cms/src/widgets/markers/gallery.ts | LOADED | 0 | 136/136 (100.00%) | 128/128 (100.00%) | 20/20 (100.00%) |
| packages/cms/src/widgets/markers/html-attributes.ts | LOADED | 0 | 84/84 (100.00%) | 51/51 (100.00%) | 7/7 (100.00%) |
| packages/cms/src/widgets/markers/media-reference.ts | LOADED | 0 | 3/3 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/widgets/page-embed-types.ts | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/widgets/read-service.ts | LOADED | 0 | 53/53 (100.00%) | 19/19 (100.00%) | 2/2 (100.00%) |
| packages/cms/src/widgets/registry.ts | LOADED | 0 | 138/138 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| packages/cms/src/widgets/repo.memory.ts | LOADED | 0 | 40/40 (100.00%) | 18/18 (100.00%) | 7/7 (100.00%) |
| packages/cms/src/widgets/resolver-service.ts | LOADED | 0 | 606/606 (100.00%) | 256/256 (100.00%) | 45/45 (100.00%) |
| packages/cms/src/widgets/resolvers/contact-form.ts | LOADED | 0 | 45/45 (100.00%) | 26/26 (100.00%) | 6/6 (100.00%) |
| packages/cms/src/widgets/resolvers/gallery.ts | LOADED | 0 | 31/31 (100.00%) | 21/21 (100.00%) | 4/4 (100.00%) |
| packages/cms/src/widgets/resolvers/menu.ts | LOADED | 0 | 45/45 (100.00%) | 26/26 (100.00%) | 4/4 (100.00%) |
| packages/cms/src/widgets/resolvers/taxonomy.ts | LOADED | 0 | 30/30 (100.00%) | 6/10 (60.00%) | 1/1 (100.00%) |
| packages/cms/src/widgets/sql/repo.ts | LOADED | 0 | 83/83 (100.00%) | 24/24 (100.00%) | 10/10 (100.00%) |
| packages/cms/src/widgets/types.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/cms/src/widgets/where-used.ts | LOADED | 0 | 10/10 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/cms/src/workspace/create.ts | LOADED | 0 | 53/53 (100.00%) | 11/12 (91.67%) | 6/6 (100.00%) |
| packages/cms/src/workspace/delete.ts | LOADED | 0 | 17/17 (100.00%) | 10/10 (100.00%) | 2/2 (100.00%) |
| packages/cms/src/workspace/repo.memory.ts | LOADED | 0 | 43/43 (100.00%) | 18/20 (90.00%) | 9/9 (100.00%) |
| packages/cms/src/workspace/update.ts | LOADED | 0 | 22/22 (100.00%) | 10/10 (100.00%) | 1/1 (100.00%) |
| packages/commerce/src/react/commerce-i18n.ts | LOADED | 0 | 68/68 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/commerce/src/react/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/commerce/src/react/Payments.tsx | LOADED | 0 | 99/99 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/core/src/api-token-auth.ts | LOADED | 0 | 15/15 (100.00%) | 10/10 (100.00%) | 4/4 (100.00%) |
| packages/core/src/approval.ts | LOADED | 0 | 152/152 (100.00%) | 115/115 (100.00%) | 31/31 (100.00%) |
| packages/core/src/bindings.ts | LOADED | 0 | 34/34 (100.00%) | 15/15 (100.00%) | 7/7 (100.00%) |
| packages/core/src/composition.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/contribution-registry.ts | LOADED | 0 | 11/11 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| packages/core/src/daemon.ts | LOADED | 0 | 35/35 (100.00%) | 17/17 (100.00%) | 5/5 (100.00%) |
| packages/core/src/feature-flags.ts | LOADED | 0 | 10/10 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| packages/core/src/fetch/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/gated-mutations.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/gated-mutations/actor-identity.ts | LOADED | 0 | 28/28 (100.00%) | 9/9 (100.00%) | 2/2 (100.00%) |
| packages/core/src/gated-mutations/gateway.ts | LOADED | 0 | 110/110 (100.00%) | 40/40 (100.00%) | 11/11 (100.00%) |
| packages/core/src/gated-mutations/token.ts | LOADED | 0 | 66/66 (100.00%) | 37/37 (100.00%) | 13/13 (100.00%) |
| packages/core/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/naming.ts | LOADED | 0 | 27/27 (100.00%) | 19/19 (100.00%) | 3/3 (100.00%) |
| packages/core/src/origin-validation.ts | LOADED | 0 | 165/165 (100.00%) | 131/131 (100.00%) | 20/20 (100.00%) |
| packages/core/src/pack-lifecycle.ts | LOADED | 0 | 29/29 (100.00%) | 13/13 (100.00%) | 2/2 (100.00%) |
| packages/core/src/pack.ts | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/core/src/primitives/ids.ts | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/core/src/primitives/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/primitives/logger.ts | LOADED | 0 | 13/13 (100.00%) | 9/9 (100.00%) | 5/5 (100.00%) |
| packages/core/src/primitives/paths.ts | LOADED | 0 | 32/32 (100.00%) | 28/28 (100.00%) | 5/5 (100.00%) |
| packages/core/src/primitives/tasks.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/core/src/primitives/time.ts | LOADED | 0 | 9/9 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| packages/core/src/records.ts | LOADED | 0 | 19/19 (100.00%) | 12/12 (100.00%) | 5/5 (100.00%) |
| packages/core/src/redact.ts | LOADED | 0 | 160/160 (100.00%) | 68/68 (100.00%) | 11/11 (100.00%) |
| packages/core/src/registration-kit.ts | LOADED | 0 | 240/240 (100.00%) | 132/132 (100.00%) | 28/28 (100.00%) |
| packages/core/src/settings/agent-tools.ts | LOADED | 0 | 125/125 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/core/src/settings/agent-value-write-tools.ts | LOADED | 0 | 145/145 (100.00%) | 118/118 (100.00%) | 17/17 (100.00%) |
| packages/core/src/settings/agent-writable-preferences.ts | LOADED | 0 | 56/56 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/core/src/settings/agent-write-denylist.ts | LOADED | 0 | 8/8 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/core/src/settings/change-feed.ts | LOADED | 0 | 29/29 (100.00%) | 14/14 (100.00%) | 2/2 (100.00%) |
| packages/core/src/settings/definitions-dispatch.ts | LOADED | 0 | 71/71 (100.00%) | 8/13 (61.54%) | 6/6 (100.00%) |
| packages/core/src/settings/dictionaries/index.ts | LOADED | 0 | 27/27 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.ar.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.bn.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.de.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.es.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.fa.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.fr.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.hi.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.hu.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.id.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.it.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.ja.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.ko.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.pl.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.pt-BR.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.ru.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.th.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.tr.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.uk.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.ur.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.zh-CN.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.zh-TW.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/ensure-definitions.ts | LOADED | 0 | 73/73 (100.00%) | 20/20 (100.00%) | 5/5 (100.00%) |
| packages/core/src/settings/express/cms-adapter.ts | LOADED | 0 | 115/115 (100.00%) | 55/55 (100.00%) | 17/17 (100.00%) |
| packages/core/src/settings/express/http-request.ts | LOADED | 0 | 37/37 (100.00%) | 21/21 (100.00%) | 4/4 (100.00%) |
| packages/core/src/settings/express/http.ts | LOADED | 0 | 130/130 (100.00%) | 120/120 (100.00%) | 23/23 (100.00%) |
| packages/core/src/settings/express/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/express/shared.ts | LOADED | 0 | 36/36 (100.00%) | 28/29 (96.55%) | 4/4 (100.00%) |
| packages/core/src/settings/express/stream.ts | LOADED | 0 | 109/109 (100.00%) | 87/87 (100.00%) | 12/12 (100.00%) |
| packages/core/src/settings/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/purge-service.ts | LOADED | 0 | 101/101 (100.00%) | 11/12 (91.67%) | 1/1 (100.00%) |
| packages/core/src/settings/settings.ts | LOADED | 0 | 168/168 (100.00%) | 101/101 (100.00%) | 19/19 (100.00%) |
| packages/core/src/settings/tool-registrations.ts | LOADED | 0 | 180/180 (100.00%) | 77/77 (100.00%) | 15/15 (100.00%) |
| packages/core/src/settings/types.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/ui-tab-definitions.ts | LOADED | 0 | 61/61 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/core/src/surface-exchanges.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/text/escape.ts | LOADED | 0 | 9/9 (100.00%) | 4/6 (66.67%) | 2/2 (100.00%) |
| packages/core/src/text/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/text/sanitize-untrusted-text.ts | LOADED | 0 | 72/72 (100.00%) | 54/54 (100.00%) | 9/9 (100.00%) |
| packages/core/src/token.ts | LOADED | 0 | 17/17 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| packages/core/src/tool-exposure.ts | LOADED | 0 | 125/125 (100.00%) | 60/60 (100.00%) | 18/18 (100.00%) |
| packages/core/src/tool-input-errors.ts | LOADED | 0 | 7/7 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/core/src/tool-input-normalization.ts | LOADED | 0 | 142/142 (100.00%) | 136/136 (100.00%) | 20/20 (100.00%) |
| packages/core/src/tool-metadata.ts | LOADED | 0 | 45/45 (100.00%) | 37/37 (100.00%) | 3/3 (100.00%) |
| packages/core/src/tool-permissions.ts | LOADED | 0 | 21/21 (100.00%) | 6/6 (100.00%) | 4/4 (100.00%) |
| packages/core/src/tool-tokens.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/daemon/src/agent-executor.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/daemon/src/agent-executor/agent-env.ts | LOADED | 0 | 17/17 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/daemon/src/agent-executor/antigravity-permissions.ts | LOADED | 0 | 44/44 (100.00%) | 39/39 (100.00%) | 6/6 (100.00%) |
| packages/daemon/src/agent-executor/contracts.ts | LOADED | 0 | 17/17 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/daemon/src/agent-executor/event-translation.ts | LOADED | 0 | 158/158 (100.00%) | 90/90 (100.00%) | 21/21 (100.00%) |
| packages/daemon/src/agent-executor/handoff.ts | LOADED | 0 | 8/8 (100.00%) | 7/7 (100.00%) | 2/2 (100.00%) |
| packages/daemon/src/agent-executor/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/daemon/src/agent-executor/mcp-bridge-probe.ts | LOADED | 0 | 77/77 (100.00%) | 32/32 (100.00%) | 9/9 (100.00%) |
| packages/daemon/src/agent-executor/model-receipts.ts | LOADED | 0 | 18/18 (100.00%) | 22/24 (91.67%) | 2/2 (100.00%) |
| packages/daemon/src/agent-executor/run-output.ts | LOADED | 0 | 56/56 (100.00%) | 50/50 (100.00%) | 7/7 (100.00%) |
| packages/daemon/src/agent-executor/values.ts | LOADED | 0 | 12/12 (100.00%) | 12/12 (100.00%) | 4/4 (100.00%) |
| packages/daemon/src/attachment-content.ts | LOADED | 0 | 37/37 (100.00%) | 21/21 (100.00%) | 3/3 (100.00%) |
| packages/daemon/src/close-status.ts | LOADED | 0 | 50/50 (100.00%) | 31/31 (100.00%) | 7/7 (100.00%) |
| packages/daemon/src/continuation/continuation-transport.ts | LOADED | 0 | 5/5 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| packages/daemon/src/continuation/index.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/daemon/src/continuation/journal.ts | LOADED | 0 | 13/13 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| packages/daemon/src/continuation/run-scoped-context-store.ts | LOADED | 0 | 34/34 (100.00%) | 12/12 (100.00%) | 8/8 (100.00%) |
| packages/daemon/src/continuation/run-start-handler.ts | LOADED | 0 | 12/12 (100.00%) | 22/22 (100.00%) | 1/1 (100.00%) |
| packages/daemon/src/core/read-only-tools.ts | LOADED | 0 | 89/89 (100.00%) | 42/42 (100.00%) | 17/17 (100.00%) |
| packages/daemon/src/core/tool-audit.ts | LOADED | 0 | 96/96 (100.00%) | 53/53 (100.00%) | 17/17 (100.00%) |
| packages/daemon/src/core/tool-candidates.ts | LOADED | 0 | 6/6 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/daemon/src/core/tool-gaps.ts | LOADED | 0 | 137/137 (100.00%) | 96/96 (100.00%) | 20/20 (100.00%) |
| packages/daemon/src/delegated-tool-bridge.ts | LOADED | 0 | 132/132 (100.00%) | 57/57 (100.00%) | 15/15 (100.00%) |
| packages/daemon/src/event-log.ts | LOADED | 0 | 77/77 (100.00%) | 34/34 (100.00%) | 6/6 (100.00%) |
| packages/daemon/src/frontend-capability-tools.ts | LOADED | 0 | 42/42 (100.00%) | 19/19 (100.00%) | 4/4 (100.00%) |
| packages/daemon/src/frontend-session-registry.ts | LOADED | 0 | 114/114 (100.00%) | 57/57 (100.00%) | 14/14 (100.00%) |
| packages/daemon/src/http/active-context.ts | LOADED | 0 | 53/53 (100.00%) | 24/24 (100.00%) | 5/5 (100.00%) |
| packages/daemon/src/http/agents.ts | LOADED | 0 | 10/10 (100.00%) | 8/8 (100.00%) | 6/6 (100.00%) |
| packages/daemon/src/http/attachments.ts | LOADED | 0 | 661/661 (100.00%) | 302/304 (99.34%) | 55/55 (100.00%) |
| packages/daemon/src/http/cancel-owned-runs.ts | LOADED | 0 | 6/6 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/daemon/src/http/component-catalog.ts | LOADED | 0 | 37/37 (100.00%) | 17/17 (100.00%) | 5/5 (100.00%) |
| packages/daemon/src/http/connectors.ts | LOADED | 0 | 298/298 (100.00%) | 222/222 (100.00%) | 38/38 (100.00%) |
| packages/daemon/src/http/daemon-status.ts | LOADED | 0 | 33/33 (100.00%) | 8/8 (100.00%) | 5/5 (100.00%) |
| packages/daemon/src/http/db-ops.ts | LOADED | 0 | 121/121 (100.00%) | 38/38 (100.00%) | 16/16 (100.00%) |
| packages/daemon/src/http/delegated-tools.ts | LOADED | 0 | 134/134 (100.00%) | 74/74 (100.00%) | 11/11 (100.00%) |
| packages/daemon/src/http/frontend-control.ts | LOADED | 0 | 48/48 (100.00%) | 18/18 (100.00%) | 5/5 (100.00%) |
| packages/daemon/src/http/frontend-sessions.ts | LOADED | 0 | 103/103 (100.00%) | 48/48 (100.00%) | 9/9 (100.00%) |
| packages/daemon/src/http/health.ts | LOADED | 0 | 36/36 (100.00%) | 14/14 (100.00%) | 11/11 (100.00%) |
| packages/daemon/src/http/host-tools.ts | LOADED | 0 | 232/232 (100.00%) | 137/137 (100.00%) | 29/29 (100.00%) |
| packages/daemon/src/http/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/daemon/src/http/media.ts | LOADED | 0 | 240/240 (100.00%) | 119/119 (100.00%) | 24/24 (100.00%) |
| packages/daemon/src/http/memory.ts | LOADED | 0 | 277/277 (100.00%) | 105/105 (100.00%) | 39/39 (100.00%) |
| packages/daemon/src/http/model-proxy-fields.ts | LOADED | 0 | 24/24 (100.00%) | 19/19 (100.00%) | 8/8 (100.00%) |
| packages/daemon/src/http/model-proxy.ts | LOADED | 0 | 258/258 (100.00%) | 107/107 (100.00%) | 31/31 (100.00%) |
| packages/daemon/src/http/research-tavily.adapter.ts | LOADED | 0 | 94/94 (100.00%) | 50/50 (100.00%) | 9/9 (100.00%) |
| packages/daemon/src/http/research.ts | LOADED | 0 | 104/104 (100.00%) | 73/73 (100.00%) | 16/16 (100.00%) |
| packages/daemon/src/http/resource-request.ts | LOADED | 0 | 33/33 (100.00%) | 25/25 (100.00%) | 5/5 (100.00%) |
| packages/daemon/src/http/route-manifest.ts | LOADED | 0 | 37/37 (100.00%) | 9/9 (100.00%) | 3/3 (100.00%) |
| packages/daemon/src/http/routines.ts | LOADED | 0 | 204/204 (100.00%) | 126/126 (100.00%) | 26/26 (100.00%) |
| packages/daemon/src/http/runs.ts | LOADED | 0 | 202/202 (100.00%) | 118/118 (100.00%) | 23/23 (100.00%) |
| packages/daemon/src/http/terminals.ts | LOADED | 0 | 178/178 (100.00%) | 89/89 (100.00%) | 25/25 (100.00%) |
| packages/daemon/src/http/tool-catalog.ts | LOADED | 0 | 45/45 (100.00%) | 18/18 (100.00%) | 5/5 (100.00%) |
| packages/daemon/src/http/workspace-root.ts | LOADED | 0 | 18/18 (100.00%) | 10/10 (100.00%) | 4/4 (100.00%) |
| packages/daemon/src/http/xai.ts | LOADED | 0 | 391/391 (100.00%) | 180/181 (99.45%) | 39/39 (100.00%) |
| packages/daemon/src/image-prompt-delivery.ts | LOADED | 0 | 25/25 (100.00%) | 25/25 (100.00%) | 3/3 (100.00%) |
| packages/daemon/src/index.ts | LOADED | 0 | 17/17 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/daemon/src/legacy-data-migration.ts | LOADED | 0 | 163/163 (100.00%) | 65/65 (100.00%) | 17/17 (100.00%) |
| packages/daemon/src/read-only-tools.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/daemon/src/remote-tool-bridge.ts | LOADED | 0 | 22/22 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| packages/daemon/src/routines/index.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/daemon/src/routines/routine-store.ts | LOADED | 0 | 113/113 (100.00%) | 68/68 (100.00%) | 15/15 (100.00%) |
| packages/daemon/src/routines/schedule.ts | LOADED | 0 | 218/218 (100.00%) | 117/117 (100.00%) | 21/21 (100.00%) |
| packages/daemon/src/routines/scheduler.ts | LOADED | 0 | 289/289 (100.00%) | 104/104 (100.00%) | 26/26 (100.00%) |
| packages/daemon/src/run-credentials.ts | LOADED | 0 | 144/144 (100.00%) | 116/116 (100.00%) | 30/30 (100.00%) |
| packages/daemon/src/run/core/index.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/daemon/src/run/core/result.ts | LOADED | 0 | 18/18 (100.00%) | 18/18 (100.00%) | 2/2 (100.00%) |
| packages/daemon/src/run/core/retry.ts | LOADED | 0 | 142/142 (100.00%) | 68/68 (100.00%) | 11/11 (100.00%) |
| packages/daemon/src/run/diagnostics/diagnostics.ts | LOADED | 0 | 199/199 (100.00%) | 103/103 (100.00%) | 18/18 (100.00%) |
| packages/daemon/src/run/diagnostics/index.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/daemon/src/run/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/daemon/src/scheduler.ts | LOADED | 0 | 12/12 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| packages/daemon/src/session-coordination.ts | LOADED | 0 | 87/87 (100.00%) | 69/70 (98.57%) | 21/21 (100.00%) |
| packages/daemon/src/store/agent-sessions/errors.ts | LOADED | 0 | 8/8 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| packages/daemon/src/store/agent-sessions/index.ts | LOADED | 0 | 10/10 (100.00%) | 6/6 (100.00%) | 5/5 (100.00%) |
| packages/daemon/src/store/agent-sessions/pglite.ts | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/daemon/src/store/agent-sessions/postgres.ts | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/daemon/src/store/agent-sessions/schema.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/daemon/src/store/agent-sessions/sql.ts | LOADED | 0 | 34/34 (100.00%) | 23/23 (100.00%) | 7/7 (100.00%) |
| packages/daemon/src/store/event-log/sqlite.ts | LOADED | 0 | 185/185 (100.00%) | 57/58 (98.28%) | 14/14 (100.00%) |
| packages/daemon/src/surface-exchanges.ts | LOADED | 0 | 143/143 (100.00%) | 77/81 (95.06%) | 22/22 (100.00%) |
| packages/daemon/src/terminal-session.ts | LOADED | 0 | 191/191 (100.00%) | 80/80 (100.00%) | 28/28 (100.00%) |
| packages/daemon/src/tokens.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/daemon/src/tool-audit.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/daemon/src/tool-executor.ts | LOADED | 0 | 263/263 (100.00%) | 150/150 (100.00%) | 32/32 (100.00%) |
| packages/daemon/src/tool-recovery/diagnostics.ts | LOADED | 0 | 22/22 (100.00%) | 3/5 (60.00%) | 3/3 (100.00%) |
| packages/daemon/src/tool-recovery/index.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/daemon/src/tool-recovery/recovery.ts | LOADED | 0 | 186/186 (100.00%) | 165/165 (100.00%) | 28/28 (100.00%) |
| packages/daemon/src/tool-result-media.ts | LOADED | 0 | 23/23 (100.00%) | 26/26 (100.00%) | 3/3 (100.00%) |
| packages/daemon/src/tool-result-surfaces.ts | LOADED | 0 | 25/25 (100.00%) | 22/22 (100.00%) | 2/2 (100.00%) |
| packages/db/src/core/artifact-naming.ts | LOADED | 0 | 7/7 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/db/src/core/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/db/src/core/messages.ts | LOADED | 0 | 23/23 (100.00%) | 3/3 (100.00%) | 3/5 (60.00%) |
| packages/db/src/core/pg-types.ts | LOADED | 0 | 21/21 (100.00%) | 7/7 (100.00%) | 4/4 (100.00%) |
| packages/db/src/core/row-values.ts | LOADED | 0 | 14/14 (100.00%) | 12/12 (100.00%) | 3/3 (100.00%) |
| packages/db/src/core/socket.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/db/src/kernel/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/db/src/kernel/kernel-core.ts | LOADED | 0 | 83/83 (100.00%) | 54/57 (94.74%) | 12/12 (100.00%) |
| packages/db/src/kernel/pglite/driver.ts | LOADED | 0 | 32/32 (100.00%) | 13/13 (100.00%) | 4/4 (100.00%) |
| packages/db/src/kernel/pglite/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/db/src/kernel/port.ts | LOADED | 0 | 9/9 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/db/src/kernel/postgres-lock.ts | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/db/src/kernel/postgres/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/db/src/kernel/schema-scope.ts | LOADED | 0 | 7/7 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| packages/db/src/kernel/sqlite/driver.ts | LOADED | 0 | 95/95 (100.00%) | 38/38 (100.00%) | 20/21 (95.24%) |
| packages/db/src/kernel/sqlite/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/db/src/kernel/turn-lock.ts | LOADED | 0 | 28/28 (100.00%) | 20/20 (100.00%) | 5/5 (100.00%) |
| packages/db/src/migrate/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/db/src/migrate/step.ts | LOADED | 0 | 20/20 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| packages/db/src/pg-fixture.ts | LOADED | 0 | 37/37 (100.00%) | 14/15 (93.33%) | 4/4 (100.00%) |
| packages/db/src/pglite/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/db/src/pglite/socket-server.ts | LOADED | 0 | 287/287 (100.00%) | 124/135 (91.85%) | 31/31 (100.00%) |
| packages/db/src/recovery/migrate-forward-hooks.ts | LOADED | 0 | 44/44 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| packages/db/src/recovery/operation-lock.ts | LOADED | 0 | 37/37 (100.00%) | 7/7 (100.00%) | 4/4 (100.00%) |
| packages/db/src/secrets-vault/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/db/src/sqlite/db-ops.ts | LOADED | 0 | 45/45 (100.00%) | 11/11 (100.00%) | 5/5 (100.00%) |
| packages/db/src/sqlite/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/db/src/sqlite/inspect.ts | LOADED | 0 | 131/131 (100.00%) | 74/75 (98.67%) | 11/11 (100.00%) |
| packages/db/src/sqlite/open.ts | LOADED | 0 | 16/16 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/db/src/tools/database-catalog.ts | LOADED | 0 | 106/106 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/db/src/tools/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/db/src/tools/read-tools.ts | LOADED | 0 | 74/74 (100.00%) | 22/27 (81.48%) | 8/8 (100.00%) |
| packages/db/src/tools/registration.ts | LOADED | 0 | 7/7 (100.00%) | 3/4 (75.00%) | 1/2 (50.00%) |
| packages/db/src/tools/restore-points.ts | LOADED | 0 | 39/39 (100.00%) | 14/14 (100.00%) | 4/4 (100.00%) |
| packages/db/src/tools/timeline.ts | LOADED | 0 | 22/22 (100.00%) | 8/8 (100.00%) | 2/2 (100.00%) |
| packages/db/src/tools/transfer-catalog.ts | LOADED | 0 | 52/52 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/db/src/transfer/index.ts | LOADED | 0 | 8/8 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/db/src/transfer/internal-ddl.ts | LOADED | 0 | 84/84 (100.00%) | 58/58 (100.00%) | 13/13 (100.00%) |
| packages/db/src/transfer/plan.ts | LOADED | 0 | 16/16 (100.00%) | 12/12 (100.00%) | 3/3 (100.00%) |
| packages/db/src/transfer/postgres-ddl.ts | LOADED | 0 | 13/13 (100.00%) | 3/4 (75.00%) | 3/9 (33.33%) |
| packages/db/src/transfer/signals.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/desktop-host/src/bridge-testing.ts | LOADED | 0 | 46/46 (100.00%) | 16/16 (100.00%) | 5/5 (100.00%) |
| packages/desktop-host/src/bridge.ts | LOADED | 0 | 81/81 (100.00%) | 73/73 (100.00%) | 12/12 (100.00%) |
| packages/desktop-host/src/config.ts | LOADED | 0 | 29/29 (100.00%) | 17/17 (100.00%) | 3/3 (100.00%) |
| packages/desktop-host/src/electron/create-electron-desktop-host.ts | LOADED | 0 | 15/15 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/desktop-host/src/electron/electron-protocol.ts | LOADED | 0 | 12/12 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| packages/desktop-host/src/electron/electron-render-service.ts | LOADED | 0 | 29/29 (100.00%) | 15/15 (100.00%) | 7/7 (100.00%) |
| packages/desktop-host/src/electron/electron-shell.ts | LOADED | 0 | 31/31 (100.00%) | 14/15 (93.33%) | 6/6 (100.00%) |
| packages/desktop-host/src/electron/electron-single-instance.ts | LOADED | 0 | 9/9 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| packages/desktop-host/src/electron/electron-url-capture.ts | LOADED | 0 | 70/70 (100.00%) | 45/45 (100.00%) | 8/8 (100.00%) |
| packages/desktop-host/src/electron/electron-window-lifecycle.ts | LOADED | 0 | 28/28 (100.00%) | 17/17 (100.00%) | 10/10 (100.00%) |
| packages/desktop-host/src/electron/index.ts | LOADED | 0 | 9/9 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/desktop-host/src/electron/navigation-policy/index.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/desktop-host/src/electron/navigation-policy/webview-guest-policy.ts | LOADED | 0 | 18/18 (100.00%) | 8/8 (100.00%) | 2/2 (100.00%) |
| packages/desktop-host/src/electron/navigation-policy/window-navigation-policy.ts | LOADED | 0 | 90/90 (100.00%) | 49/49 (100.00%) | 15/15 (100.00%) |
| packages/desktop-host/src/electron/render-window.ts | LOADED | 0 | 54/54 (100.00%) | 34/34 (100.00%) | 8/8 (100.00%) |
| packages/desktop-host/src/electron/updates/index.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/desktop-host/src/electron/updates/instance-presence.ts | LOADED | 0 | 46/46 (100.00%) | 28/28 (100.00%) | 8/8 (100.00%) |
| packages/desktop-host/src/electron/updates/update-policy.ts | LOADED | 0 | 38/38 (100.00%) | 43/43 (100.00%) | 6/6 (100.00%) |
| packages/desktop-host/src/electron/usability/find-in-page-ipc.ts | LOADED | 0 | 19/19 (100.00%) | 10/10 (100.00%) | 5/5 (100.00%) |
| packages/desktop-host/src/electron/usability/find-menu.ts | LOADED | 0 | 17/17 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| packages/desktop-host/src/electron/usability/index.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/desktop-host/src/electron/usability/spellcheck-menu.ts | LOADED | 0 | 48/48 (100.00%) | 29/29 (100.00%) | 17/17 (100.00%) |
| packages/desktop-host/src/electron/usability/window-bounds-store.ts | LOADED | 0 | 29/29 (100.00%) | 19/19 (100.00%) | 6/6 (100.00%) |
| packages/desktop-host/src/electron/usability/zoom-menu.ts | LOADED | 0 | 13/13 (100.00%) | 10/10 (100.00%) | 6/6 (100.00%) |
| packages/desktop-host/src/index.ts | LOADED | 0 | 15/15 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/desktop-host/src/logging.ts | LOADED | 0 | 92/92 (100.00%) | 53/56 (94.64%) | 14/14 (100.00%) |
| packages/desktop-host/src/node-toolchain/index.ts | LOADED | 0 | 67/67 (100.00%) | 29/30 (96.67%) | 6/6 (100.00%) |
| packages/desktop-host/src/paths.ts | LOADED | 0 | 53/53 (100.00%) | 34/34 (100.00%) | 5/5 (100.00%) |
| packages/desktop-host/src/protocol.ts | LOADED | 0 | 37/37 (100.00%) | 13/13 (100.00%) | 5/5 (100.00%) |
| packages/desktop-host/src/render-service.ts | LOADED | 0 | 59/59 (100.00%) | 38/39 (97.44%) | 7/7 (100.00%) |
| packages/desktop-host/src/shell.ts | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/desktop-host/src/shutdown/index.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/desktop-host/src/shutdown/quit-drain-gate.ts | LOADED | 0 | 12/12 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| packages/desktop-host/src/shutdown/quit-signals.ts | LOADED | 0 | 12/12 (100.00%) | 5/7 (71.43%) | 2/2 (100.00%) |
| packages/desktop-host/src/shutdown/shutdown-tracker.ts | LOADED | 0 | 22/22 (100.00%) | 7/7 (100.00%) | 4/4 (100.00%) |
| packages/desktop-host/src/sidecar.ts | LOADED | 0 | 127/127 (100.00%) | 62/63 (98.41%) | 17/17 (100.00%) |
| packages/desktop-host/src/single-instance.ts | LOADED | 0 | 11/11 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| packages/desktop-host/src/speech/channels.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/desktop-host/src/speech/index.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/desktop-host/src/speech/macos/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/desktop-host/src/speech/pcm-wav-encoder.ts | LOADED | 0 | 39/39 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| packages/desktop-host/src/speech/speech-bridge.ts | LOADED | 0 | 12/12 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| packages/desktop-host/src/speech/speech-ipc.ts | LOADED | 0 | 32/32 (100.00%) | 28/29 (96.55%) | 5/5 (100.00%) |
| packages/desktop-host/src/speech/transcription-port.ts | LOADED | 0 | 10/10 (100.00%) | 6/6 (100.00%) | 4/4 (100.00%) |
| packages/desktop-host/src/tauri/create-tauri-desktop-host.ts | LOADED | 0 | 15/15 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/desktop-host/src/tauri/index.ts | LOADED | 0 | 11/11 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/desktop-host/src/tauri/not-implemented.ts | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/desktop-host/src/tauri/tauri-protocol.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/desktop-host/src/tauri/tauri-render-service.ts | LOADED | 0 | 17/17 (100.00%) | 5/5 (100.00%) | 5/5 (100.00%) |
| packages/desktop-host/src/tauri/tauri-sidecar.ts | LOADED | 0 | 71/71 (100.00%) | 31/31 (100.00%) | 12/12 (100.00%) |
| packages/desktop-host/src/tauri/tauri-single-instance.ts | LOADED | 0 | 8/8 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| packages/desktop-host/src/tauri/tauri-window-lifecycle.ts | LOADED | 0 | 43/43 (100.00%) | 20/20 (100.00%) | 12/12 (100.00%) |
| packages/desktop-host/src/tauri/testing.ts | LOADED | 0 | 124/124 (100.00%) | 41/42 (97.62%) | 25/25 (100.00%) |
| packages/desktop-host/src/tokens.ts | LOADED | 0 | 7/7 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/desktop-host/src/url-capture.ts | LOADED | 0 | 29/29 (100.00%) | 23/24 (95.83%) | 4/4 (100.00%) |
| packages/desktop-host/src/window-lifecycle.ts | LOADED | 0 | 22/22 (100.00%) | 9/9 (100.00%) | 5/5 (100.00%) |
| packages/desktop-host/src/windows-registry.ts | LOADED | 0 | 23/23 (100.00%) | 15/15 (100.00%) | 3/3 (100.00%) |
| packages/devops/src/deploy/index.ts | LOADED | 0 | 7/7 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/devops/src/deploy/naming.ts | LOADED | 0 | 13/13 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/devops/src/deploy/reachability.ts | LOADED | 0 | 167/167 (100.00%) | 92/92 (100.00%) | 14/14 (100.00%) |
| packages/devops/src/deploy/redirect-guard.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/devops/src/deploy/tokens.ts | LOADED | 0 | 15/15 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/devops/src/deploy/tool.ts | LOADED | 0 | 36/36 (100.00%) | 15/16 (93.75%) | 5/5 (100.00%) |
| packages/devops/src/deploy/types.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/diagnostics/src/agent-logs.ts | LOADED | 0 | 104/104 (100.00%) | 53/53 (100.00%) | 5/5 (100.00%) |
| packages/diagnostics/src/contract.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/diagnostics/src/core/secrets-only.ts | LOADED | 0 | 268/268 (100.00%) | 130/135 (96.30%) | 30/33 (90.91%) |
| packages/diagnostics/src/discovery-filesystem.ts | LOADED | 0 | 21/21 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| packages/diagnostics/src/domain-dns/index.ts | LOADED | 0 | 89/89 (100.00%) | 65/67 (97.01%) | 15/15 (100.00%) |
| packages/diagnostics/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/diagnostics/src/manifest.ts | LOADED | 0 | 37/37 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| packages/diagnostics/src/node-ports.ts | LOADED | 0 | 50/50 (100.00%) | 24/25 (96.00%) | 10/10 (100.00%) |
| packages/diagnostics/src/observability/config.ts | LOADED | 0 | 10/10 (100.00%) | 11/11 (100.00%) | 1/1 (100.00%) |
| packages/diagnostics/src/observability/hooks.ts | LOADED | 0 | 25/25 (100.00%) | 18/18 (100.00%) | 7/7 (100.00%) |
| packages/diagnostics/src/observability/index.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/diagnostics/src/observability/instrumentation.ts | LOADED | 0 | 95/95 (100.00%) | 92/92 (100.00%) | 24/24 (100.00%) |
| packages/diagnostics/src/observability/node.ts | LOADED | 0 | 5/5 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| packages/diagnostics/src/observability/noop.ts | LOADED | 0 | 17/17 (100.00%) | 9/9 (100.00%) | 9/9 (100.00%) |
| packages/diagnostics/src/observability/otel.ts | LOADED | 0 | 87/87 (100.00%) | 66/66 (100.00%) | 12/12 (100.00%) |
| packages/diagnostics/src/redaction.ts | LOADED | 0 | 54/54 (100.00%) | 28/29 (96.55%) | 4/4 (100.00%) |
| packages/diagnostics/src/redaction/secrets-only.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/diagnostics/src/sources.ts | LOADED | 0 | 72/72 (100.00%) | 35/35 (100.00%) | 4/4 (100.00%) |
| packages/diagnostics/src/web-evidence/collect-page-evidence.ts | LOADED | 0 | 162/162 (100.00%) | 57/57 (100.00%) | 13/13 (100.00%) |
| packages/diagnostics/src/web-evidence/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/diagnostics/src/web-evidence/page-performance-script.ts | LOADED | 0 | 56/56 (100.00%) | 43/43 (100.00%) | 5/5 (100.00%) |
| packages/diagnostics/src/web-evidence/page-structure-script.ts | LOADED | 0 | 262/262 (100.00%) | 143/143 (100.00%) | 25/25 (100.00%) |
| packages/diagnostics/src/web-evidence/page-work-budget.ts | LOADED | 0 | 52/52 (100.00%) | 33/34 (97.06%) | 9/9 (100.00%) |
| packages/diagnostics/src/web-evidence/public-page.ts | LOADED | 0 | 145/145 (100.00%) | 110/110 (100.00%) | 22/22 (100.00%) |
| packages/diagnostics/src/web-evidence/render-page.ts | LOADED | 0 | 200/200 (100.00%) | 146/146 (100.00%) | 37/37 (100.00%) |
| packages/diagnostics/src/web-evidence/request-guard.ts | LOADED | 0 | 186/186 (100.00%) | 140/140 (100.00%) | 21/21 (100.00%) |
| packages/diagnostics/src/web-evidence/same-origin.ts | LOADED | 0 | 54/54 (100.00%) | 30/30 (100.00%) | 6/6 (100.00%) |
| packages/diagnostics/src/zip.ts | LOADED | 0 | 38/38 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| packages/http-kit/src/adapter.ts | LOADED | 0 | 79/79 (100.00%) | 51/51 (100.00%) | 10/10 (100.00%) |
| packages/http-kit/src/api-security-middleware.ts | LOADED | 0 | 111/111 (100.00%) | 50/51 (98.04%) | 9/9 (100.00%) |
| packages/http-kit/src/compat.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/http-kit/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/http-kit/src/local-daemon-request.ts | LOADED | 0 | 83/83 (100.00%) | 59/59 (100.00%) | 6/6 (100.00%) |
| packages/http-kit/src/middleware.ts | LOADED | 0 | 13/13 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/http-kit/src/observability.ts | LOADED | 0 | 27/27 (100.00%) | 15/15 (100.00%) | 3/3 (100.00%) |
| packages/http-kit/src/origin.ts | LOADED | 0 | 10/10 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/http-kit/src/pack-http.ts | LOADED | 0 | 7/7 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/http-kit/src/rate-limit.ts | LOADED | 0 | 67/67 (100.00%) | 38/38 (100.00%) | 11/11 (100.00%) |
| packages/http-kit/src/raw-sse.ts | LOADED | 0 | 55/55 (100.00%) | 21/21 (100.00%) | 6/6 (100.00%) |
| packages/http-kit/src/request.ts | LOADED | 0 | 17/17 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| packages/http-kit/src/response.ts | LOADED | 0 | 35/35 (100.00%) | 4/4 (100.00%) | 3/3 (100.00%) |
| packages/http-kit/src/route-registration-guard.ts | LOADED | 0 | 37/37 (100.00%) | 17/17 (100.00%) | 4/4 (100.00%) |
| packages/http-kit/src/types.ts | LOADED | 0 | 2/2 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/http-kit/src/verified-origin.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/http-kit/src/verified-origin/configured-origin.ts | LOADED | 0 | 63/63 (100.00%) | 42/42 (100.00%) | 8/8 (100.00%) |
| packages/http-kit/src/verified-origin/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/http-kit/src/verified-origin/origin.ts | LOADED | 0 | 87/87 (100.00%) | 70/70 (100.00%) | 15/15 (100.00%) |
| packages/http-kit/src/verified-origin/repo.memory.ts | LOADED | 0 | 29/29 (100.00%) | 14/14 (100.00%) | 6/6 (100.00%) |
| packages/http-kit/src/verified-origin/site-path.ts | LOADED | 0 | 58/58 (100.00%) | 30/31 (96.77%) | 5/5 (100.00%) |
| packages/http-kit/src/verified-origin/types.ts | LOADED | 0 | 14/14 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| packages/infra/src/db/driver/index.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/infra/src/db/sqlite/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/infra/src/events/index.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/infra/src/events/outbox/drainer.ts | LOADED | 0 | 32/32 (100.00%) | 18/18 (100.00%) | 5/5 (100.00%) |
| packages/infra/src/events/outbox/enqueue-only.ts | LOADED | 0 | 12/12 (100.00%) | 5/5 (100.00%) | 5/5 (100.00%) |
| packages/infra/src/events/outbox/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/infra/src/events/outbox/node-scheduler.ts | LOADED | 0 | 11/11 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| packages/infra/src/events/outbox/policy.ts | LOADED | 0 | 25/25 (100.00%) | 16/16 (100.00%) | 2/2 (100.00%) |
| packages/infra/src/events/outbox/worker.ts | LOADED | 0 | 105/105 (100.00%) | 66/66 (100.00%) | 15/15 (100.00%) |
| packages/integrations/src/api-connections/access-token.ts | LOADED | 0 | 66/66 (100.00%) | 36/36 (100.00%) | 10/10 (100.00%) |
| packages/integrations/src/api-connections/account-actions.ts | LOADED | 0 | 83/83 (100.00%) | 60/60 (100.00%) | 9/9 (100.00%) |
| packages/integrations/src/api-connections/attempt-state.ts | LOADED | 0 | 53/53 (100.00%) | 18/18 (100.00%) | 8/8 (100.00%) |
| packages/integrations/src/api-connections/authorization.ts | LOADED | 0 | 88/88 (100.00%) | 50/50 (100.00%) | 9/9 (100.00%) |
| packages/integrations/src/api-connections/deps.ts | LOADED | 0 | 7/7 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| packages/integrations/src/api-connections/descriptor.ts | LOADED | 0 | 85/85 (100.00%) | 57/57 (100.00%) | 11/11 (100.00%) |
| packages/integrations/src/api-connections/errors.ts | LOADED | 0 | 18/18 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| packages/integrations/src/api-connections/finish-authorization.ts | LOADED | 0 | 89/89 (100.00%) | 58/58 (100.00%) | 12/12 (100.00%) |
| packages/integrations/src/api-connections/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/integrations/src/api-connections/install-credential.ts | LOADED | 0 | 13/13 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/integrations/src/api-connections/keys.ts | LOADED | 0 | 17/17 (100.00%) | 9/9 (100.00%) | 4/4 (100.00%) |
| packages/integrations/src/api-connections/records.ts | LOADED | 0 | 35/35 (100.00%) | 12/12 (100.00%) | 5/5 (100.00%) |
| packages/integrations/src/api-connections/request-checks.ts | LOADED | 0 | 51/51 (100.00%) | 36/36 (100.00%) | 6/6 (100.00%) |
| packages/integrations/src/api-connections/service.ts | LOADED | 0 | 14/14 (100.00%) | 8/8 (100.00%) | 8/8 (100.00%) |
| packages/integrations/src/api-connections/status.ts | LOADED | 0 | 27/27 (100.00%) | 17/17 (100.00%) | 2/2 (100.00%) |
| packages/integrations/src/api-connections/token-store/errors.ts | LOADED | 0 | 30/30 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| packages/integrations/src/api-connections/token-store/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/integrations/src/api-connections/token-store/record.ts | LOADED | 0 | 72/72 (100.00%) | 63/63 (100.00%) | 12/12 (100.00%) |
| packages/integrations/src/api-connections/token-store/vault-token-store.ts | LOADED | 0 | 153/153 (100.00%) | 111/111 (100.00%) | 20/20 (100.00%) |
| packages/integrations/src/args.ts | LOADED | 0 | 8/8 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/integrations/src/argument-error.ts | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/integrations/src/credentialed-http/auth-schemes.ts | LOADED | 0 | 45/45 (100.00%) | 36/36 (100.00%) | 5/5 (100.00%) |
| packages/integrations/src/credentialed-http/credentialed-request.ts | LOADED | 0 | 250/250 (100.00%) | 136/136 (100.00%) | 29/29 (100.00%) |
| packages/integrations/src/credentialed-http/index.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/integrations/src/credentialed-http/response-redaction.ts | LOADED | 0 | 34/34 (100.00%) | 24/24 (100.00%) | 4/4 (100.00%) |
| packages/integrations/src/media-providers/capability-registry.ts | LOADED | 0 | 19/19 (100.00%) | 10/10 (100.00%) | 5/5 (100.00%) |
| packages/integrations/src/media-providers/catalog.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/integrations/src/media-providers/dispatch/async-operation-store.ts | LOADED | 0 | 240/240 (100.00%) | 109/109 (100.00%) | 19/19 (100.00%) |
| packages/integrations/src/media-providers/dispatch/builtin-vendors.ts | LOADED | 0 | 20/20 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/integrations/src/media-providers/dispatch/context.ts | LOADED | 0 | 34/34 (100.00%) | 23/23 (100.00%) | 4/4 (100.00%) |
| packages/integrations/src/media-providers/dispatch/credentials.ts | LOADED | 0 | 12/12 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| packages/integrations/src/media-providers/dispatch/engine.ts | LOADED | 0 | 128/128 (100.00%) | 69/70 (98.57%) | 12/12 (100.00%) |
| packages/integrations/src/media-providers/dispatch/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/integrations/src/media-providers/dispatch/node.ts | LOADED | 0 | 20/20 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/integrations/src/media-providers/dispatch/openai-compatible.ts | LOADED | 0 | 163/163 (100.00%) | 84/84 (100.00%) | 20/20 (100.00%) |
| packages/integrations/src/media-providers/dispatch/operation-runtime.ts | LOADED | 0 | 244/244 (100.00%) | 86/87 (98.85%) | 14/14 (100.00%) |
| packages/integrations/src/media-providers/dispatch/outbound.ts | LOADED | 0 | 43/43 (100.00%) | 27/27 (100.00%) | 4/4 (100.00%) |
| packages/integrations/src/media-providers/dispatch/providers/aihubmix-shared.ts | LOADED | 0 | 67/67 (100.00%) | 31/31 (100.00%) | 7/7 (100.00%) |
| packages/integrations/src/media-providers/dispatch/providers/aihubmix.ts | LOADED | 0 | 146/146 (100.00%) | 67/67 (100.00%) | 12/12 (100.00%) |
| packages/integrations/src/media-providers/dispatch/providers/custom-image.ts | LOADED | 0 | 67/67 (100.00%) | 30/30 (100.00%) | 5/5 (100.00%) |
| packages/integrations/src/media-providers/dispatch/providers/elevenlabs.ts | LOADED | 0 | 124/124 (100.00%) | 29/29 (100.00%) | 11/11 (100.00%) |
| packages/integrations/src/media-providers/dispatch/providers/fishaudio.ts | LOADED | 0 | 53/53 (100.00%) | 12/12 (100.00%) | 4/4 (100.00%) |
| packages/integrations/src/media-providers/dispatch/providers/grok.ts | LOADED | 0 | 90/90 (100.00%) | 27/27 (100.00%) | 8/8 (100.00%) |
| packages/integrations/src/media-providers/dispatch/providers/imagerouter-video-async.ts | LOADED | 0 | 95/95 (100.00%) | 45/45 (100.00%) | 11/11 (100.00%) |
| packages/integrations/src/media-providers/dispatch/providers/imagerouter.ts | LOADED | 0 | 100/100 (100.00%) | 20/20 (100.00%) | 8/8 (100.00%) |
| packages/integrations/src/media-providers/dispatch/providers/minimax.ts | LOADED | 0 | 56/56 (100.00%) | 13/13 (100.00%) | 3/3 (100.00%) |
| packages/integrations/src/media-providers/dispatch/providers/nanobanana.ts | LOADED | 0 | 94/94 (100.00%) | 38/38 (100.00%) | 10/10 (100.00%) |
| packages/integrations/src/media-providers/dispatch/providers/openai.ts | LOADED | 0 | 138/138 (100.00%) | 47/47 (100.00%) | 11/11 (100.00%) |
| packages/integrations/src/media-providers/dispatch/providers/openrouter.ts | LOADED | 0 | 93/93 (100.00%) | 48/48 (100.00%) | 8/8 (100.00%) |
| packages/integrations/src/media-providers/dispatch/providers/senseaudio.ts | LOADED | 0 | 141/141 (100.00%) | 50/50 (100.00%) | 9/9 (100.00%) |
| packages/integrations/src/media-providers/dispatch/providers/volcengine.ts | LOADED | 0 | 45/45 (100.00%) | 8/8 (100.00%) | 4/4 (100.00%) |
| packages/integrations/src/media-providers/dispatch/response-parsers.ts | LOADED | 0 | 69/69 (100.00%) | 32/32 (100.00%) | 6/6 (100.00%) |
| packages/integrations/src/media-providers/dispatch/sqlite-async-operation-store.ts | LOADED | 0 | 127/127 (100.00%) | 39/39 (100.00%) | 11/11 (100.00%) |
| packages/integrations/src/media-providers/dispatch/stub.ts | LOADED | 0 | 85/85 (100.00%) | 25/25 (100.00%) | 5/5 (100.00%) |
| packages/integrations/src/media-providers/dispatch/vendor-adapter.ts | LOADED | 0 | 15/15 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| packages/integrations/src/media-providers/dispatch/vendor-registry-core.ts | LOADED | 0 | 29/29 (100.00%) | 13/13 (100.00%) | 5/5 (100.00%) |
| packages/integrations/src/media-providers/dispatch/vendor-registry.ts | LOADED | 0 | 37/37 (100.00%) | 10/10 (100.00%) | 8/8 (100.00%) |
| packages/integrations/src/media-providers/index.ts | LOADED | 0 | 12/12 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/integrations/src/media-providers/policy.ts | LOADED | 0 | 29/29 (100.00%) | 19/19 (100.00%) | 5/5 (100.00%) |
| packages/integrations/src/media-providers/providers.ts | LOADED | 0 | 207/207 (100.00%) | 20/20 (100.00%) | 5/5 (100.00%) |
| packages/integrations/src/media-providers/seed.ts | LOADED | 0 | 96/96 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/integrations/src/media-providers/sqlite-driver.adapter.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/integrations/src/media-providers/sqlite-task-store.ts | LOADED | 0 | 128/128 (100.00%) | 48/48 (100.00%) | 10/10 (100.00%) |
| packages/integrations/src/media-providers/staging.ts | LOADED | 0 | 110/110 (100.00%) | 64/64 (100.00%) | 9/9 (100.00%) |
| packages/integrations/src/media-providers/task-lifecycle.ts | LOADED | 0 | 98/98 (100.00%) | 50/50 (100.00%) | 10/10 (100.00%) |
| packages/integrations/src/media-providers/task-store.ts | LOADED | 0 | 62/62 (100.00%) | 27/27 (100.00%) | 8/8 (100.00%) |
| packages/integrations/src/media-providers/tokens.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/integrations/src/media-providers/ui-defaults.ts | LOADED | 0 | 129/129 (100.00%) | 3/3 (100.00%) | 0/0 (100.00%) |
| packages/integrations/src/media-providers/video-request.ts | LOADED | 0 | 184/184 (100.00%) | 127/127 (100.00%) | 22/22 (100.00%) |
| packages/integrations/src/webhooks/delivery.ts | LOADED | 0 | 212/212 (100.00%) | 46/47 (97.87%) | 9/9 (100.00%) |
| packages/integrations/src/webhooks/index.ts | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/integrations/src/webhooks/signing.keyring.ts | LOADED | 0 | 13/13 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/mcp/src/agent-install/chrome-devtools.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/mcp/src/agent-install/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/mcp/src/agent-install/install.ts | LOADED | 0 | 221/221 (100.00%) | 70/70 (100.00%) | 30/30 (100.00%) |
| packages/mcp/src/bin/serve.ts | LOADED | 0 | 134/134 (100.00%) | 58/59 (98.31%) | 14/14 (100.00%) |
| packages/mcp/src/client/client.ts | LOADED | 0 | 172/172 (100.00%) | 78/78 (100.00%) | 20/20 (100.00%) |
| packages/mcp/src/client/index.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/mcp/src/core/config.ts | LOADED | 0 | 292/292 (100.00%) | 196/196 (100.00%) | 32/32 (100.00%) |
| packages/mcp/src/core/index.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/mcp/src/core/install-info.ts | LOADED | 0 | 46/46 (100.00%) | 12/12 (100.00%) | 1/1 (100.00%) |
| packages/mcp/src/core/tokens.ts | LOADED | 0 | 133/133 (100.00%) | 63/63 (100.00%) | 16/16 (100.00%) |
| packages/mcp/src/federation/adapter.http.ts | LOADED | 0 | 226/226 (100.00%) | 113/118 (95.76%) | 23/23 (100.00%) |
| packages/mcp/src/federation/approvals/call-confirmation.ts | LOADED | 0 | 44/44 (100.00%) | 38/38 (100.00%) | 3/3 (100.00%) |
| packages/mcp/src/federation/approvals/index.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/mcp/src/federation/approvals/remembered-approval.ts | LOADED | 0 | 62/62 (100.00%) | 70/70 (100.00%) | 8/8 (100.00%) |
| packages/mcp/src/federation/approvals/revocation-reason.ts | LOADED | 0 | 4/4 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/mcp/src/federation/approvals/revocation.ts | LOADED | 0 | 38/38 (100.00%) | 31/31 (100.00%) | 4/4 (100.00%) |
| packages/mcp/src/federation/approvals/scope-option.ts | LOADED | 0 | 3/3 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/mcp/src/federation/config.ts | LOADED | 0 | 22/22 (100.00%) | 14/14 (100.00%) | 3/3 (100.00%) |
| packages/mcp/src/federation/index.ts | LOADED | 0 | 13/13 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/mcp/src/federation/mcp-protocol.ts | LOADED | 0 | 80/80 (100.00%) | 44/51 (86.27%) | 9/9 (100.00%) |
| packages/mcp/src/federation/messages.ts | LOADED | 0 | 33/33 (100.00%) | 11/11 (100.00%) | 7/7 (100.00%) |
| packages/mcp/src/federation/presets.ts | LOADED | 0 | 16/16 (100.00%) | 10/10 (100.00%) | 7/7 (100.00%) |
| packages/mcp/src/federation/refusal-notice.ts | LOADED | 0 | 73/73 (100.00%) | 23/24 (95.83%) | 7/7 (100.00%) |
| packages/mcp/src/federation/registrations.ts | LOADED | 0 | 111/111 (100.00%) | 47/47 (100.00%) | 8/8 (100.00%) |
| packages/mcp/src/federation/reload.ts | LOADED | 0 | 45/45 (100.00%) | 20/22 (90.91%) | 5/5 (100.00%) |
| packages/mcp/src/federation/stdio/adapter.stdio.ts | LOADED | 0 | 281/281 (100.00%) | 123/123 (100.00%) | 36/36 (100.00%) |
| packages/mcp/src/federation/stdio/index.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/mcp/src/federation/stdio/stdio-launch-resolver.ts | LOADED | 0 | 153/153 (100.00%) | 82/82 (100.00%) | 16/16 (100.00%) |
| packages/mcp/src/federation/testing/index.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/mcp/src/federation/testing/tool-approvals.memory.ts | LOADED | 0 | 40/40 (100.00%) | 20/20 (100.00%) | 12/12 (100.00%) |
| packages/mcp/src/federation/tool-approvals.ts | LOADED | 0 | 27/27 (100.00%) | 16/19 (84.21%) | 2/2 (100.00%) |
| packages/mcp/src/federation/trust.ts | LOADED | 0 | 319/319 (100.00%) | 177/177 (100.00%) | 29/29 (100.00%) |
| packages/mcp/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/mcp/src/server/daemon-client.ts | LOADED | 0 | 151/151 (100.00%) | 95/95 (100.00%) | 19/19 (100.00%) |
| packages/mcp/src/server/index.ts | LOADED | 0 | 11/11 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/mcp/src/server/resource-protocol.ts | LOADED | 0 | 44/44 (100.00%) | 24/24 (100.00%) | 3/3 (100.00%) |
| packages/mcp/src/server/resources/active-resource.ts | LOADED | 0 | 13/13 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/mcp/src/server/resources/site-guide-resource.ts | LOADED | 0 | 15/15 (100.00%) | 7/7 (100.00%) | 2/2 (100.00%) |
| packages/mcp/src/server/tool-arguments.ts | LOADED | 0 | 68/68 (100.00%) | 79/79 (100.00%) | 8/8 (100.00%) |
| packages/mcp/src/server/tool-protocol.ts | LOADED | 0 | 92/92 (100.00%) | 60/60 (100.00%) | 10/10 (100.00%) |
| packages/mcp/src/server/tool-server.ts | LOADED | 0 | 144/144 (100.00%) | 82/83 (98.80%) | 20/20 (100.00%) |
| packages/mcp/src/server/tools/component-catalog-tools.ts | LOADED | 0 | 58/58 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| packages/mcp/src/server/tools/delegated-tool.ts | LOADED | 0 | 116/116 (100.00%) | 36/36 (100.00%) | 8/8 (100.00%) |
| packages/mcp/src/server/tools/run-tools.ts | LOADED | 0 | 128/128 (100.00%) | 21/21 (100.00%) | 7/7 (100.00%) |
| packages/mcp/src/server/tools/tool-catalog-tools.ts | LOADED | 0 | 71/71 (100.00%) | 17/18 (94.44%) | 3/3 (100.00%) |
| packages/mcp/src/tools/ask-choice/index.ts | LOADED | 0 | 114/114 (100.00%) | 68/68 (100.00%) | 12/12 (100.00%) |
| packages/mcp/src/tools/ask-choice/pending.ts | LOADED | 0 | 23/23 (100.00%) | 17/18 (94.44%) | 3/3 (100.00%) |
| packages/mcp/src/tools/ask-choice/schema.ts | LOADED | 0 | 45/45 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/memory/src/entry-frontmatter.ts | LOADED | 0 | 21/21 (100.00%) | 8/8 (100.00%) | 2/2 (100.00%) |
| packages/memory/src/extract-facts.ts | LOADED | 0 | 100/100 (100.00%) | 61/61 (100.00%) | 8/8 (100.00%) |
| packages/memory/src/extraction-log.ts | LOADED | 0 | 143/143 (100.00%) | 55/55 (100.00%) | 20/20 (100.00%) |
| packages/memory/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/memory/src/llm-provider.ts | LOADED | 0 | 235/235 (100.00%) | 114/115 (99.13%) | 20/20 (100.00%) |
| packages/memory/src/note-store.ts | LOADED | 0 | 431/431 (100.00%) | 195/196 (99.49%) | 45/45 (100.00%) |
| packages/memory/src/rule-body.ts | LOADED | 0 | 24/24 (100.00%) | 11/11 (100.00%) | 1/1 (100.00%) |
| packages/memory/src/verify.ts | LOADED | 0 | 130/130 (100.00%) | 68/68 (100.00%) | 13/13 (100.00%) |
| packages/oauth/src/api.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/oauth/src/authorization-code.ts | LOADED | 0 | 162/162 (100.00%) | 83/83 (100.00%) | 12/12 (100.00%) |
| packages/oauth/src/bounded-json.ts | LOADED | 0 | 35/35 (100.00%) | 22/22 (100.00%) | 3/3 (100.00%) |
| packages/oauth/src/device-code.ts | LOADED | 0 | 93/93 (100.00%) | 38/38 (100.00%) | 8/8 (100.00%) |
| packages/oauth/src/discovery-policy.ts | LOADED | 0 | 29/29 (100.00%) | 22/22 (100.00%) | 4/4 (100.00%) |
| packages/oauth/src/discovery.ts | LOADED | 0 | 147/147 (100.00%) | 89/90 (98.89%) | 15/15 (100.00%) |
| packages/oauth/src/dns-pinned-transport.ts | LOADED | 0 | 32/32 (100.00%) | 23/26 (88.46%) | 4/4 (100.00%) |
| packages/oauth/src/endpoint-safety.ts | LOADED | 0 | 73/73 (100.00%) | 31/31 (100.00%) | 7/7 (100.00%) |
| packages/oauth/src/errors.ts | LOADED | 0 | 62/62 (100.00%) | 31/31 (100.00%) | 7/7 (100.00%) |
| packages/oauth/src/file-registration-cache.ts | LOADED | 0 | 50/50 (100.00%) | 39/39 (100.00%) | 10/10 (100.00%) |
| packages/oauth/src/guarded-transport.ts | LOADED | 0 | 42/42 (100.00%) | 30/31 (96.77%) | 3/3 (100.00%) |
| packages/oauth/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/oauth/src/loopback-callback.ts | LOADED | 0 | 66/66 (100.00%) | 45/45 (100.00%) | 8/8 (100.00%) |
| packages/oauth/src/loopback-receiver.ts | LOADED | 0 | 119/119 (100.00%) | 62/62 (100.00%) | 14/14 (100.00%) |
| packages/oauth/src/messages.ts | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/oauth/src/oidc.ts | LOADED | 0 | 68/68 (100.00%) | 29/30 (96.67%) | 7/7 (100.00%) |
| packages/oauth/src/options.ts | LOADED | 0 | 25/25 (100.00%) | 15/15 (100.00%) | 2/2 (100.00%) |
| packages/oauth/src/pending-authorizations.ts | LOADED | 0 | 92/92 (100.00%) | 47/49 (95.92%) | 16/16 (100.00%) |
| packages/oauth/src/pkce.ts | LOADED | 0 | 31/31 (100.00%) | 8/8 (100.00%) | 4/4 (100.00%) |
| packages/oauth/src/refresh.ts | LOADED | 0 | 156/156 (100.00%) | 53/55 (96.36%) | 11/11 (100.00%) |
| packages/oauth/src/registration-cache.ts | LOADED | 0 | 58/58 (100.00%) | 21/21 (100.00%) | 4/4 (100.00%) |
| packages/oauth/src/registration.ts | LOADED | 0 | 95/95 (100.00%) | 63/63 (100.00%) | 8/8 (100.00%) |
| packages/oauth/src/registry.ts | LOADED | 0 | 85/85 (100.00%) | 29/29 (100.00%) | 6/6 (100.00%) |
| packages/oauth/src/resource.ts | LOADED | 0 | 21/21 (100.00%) | 14/14 (100.00%) | 1/1 (100.00%) |
| packages/oauth/src/revocation.ts | LOADED | 0 | 29/29 (100.00%) | 11/14 (78.57%) | 1/1 (100.00%) |
| packages/oauth/src/sealed-state.ts | LOADED | 0 | 60/60 (100.00%) | 45/45 (100.00%) | 6/6 (100.00%) |
| packages/oauth/src/testing/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/oauth/src/testing/registration-cache.ts | LOADED | 0 | 8/8 (100.00%) | 5/5 (100.00%) | 4/4 (100.00%) |
| packages/oauth/src/testing/token-store.ts | LOADED | 0 | 16/16 (100.00%) | 9/9 (100.00%) | 6/6 (100.00%) |
| packages/platform/src/asset-cache.adapter.ts | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/platform/src/asset-cache.ts | LOADED | 0 | 219/219 (100.00%) | 120/120 (100.00%) | 19/19 (100.00%) |
| packages/platform/src/aws-sigv4.ts | LOADED | 0 | 58/58 (100.00%) | 13/13 (100.00%) | 6/6 (100.00%) |
| packages/platform/src/blob-storage.ts | LOADED | 0 | 275/275 (100.00%) | 152/152 (100.00%) | 30/30 (100.00%) |
| packages/platform/src/command.ts | LOADED | 0 | 34/34 (100.00%) | 17/17 (100.00%) | 4/4 (100.00%) |
| packages/platform/src/download.ts | LOADED | 0 | 804/804 (100.00%) | 381/381 (100.00%) | 70/70 (100.00%) |
| packages/platform/src/fetch-with-timeout.ts | LOADED | 0 | 33/33 (100.00%) | 10/10 (100.00%) | 3/3 (100.00%) |
| packages/platform/src/fs.ts | LOADED | 0 | 74/74 (100.00%) | 35/35 (100.00%) | 7/7 (100.00%) |
| packages/platform/src/fs/atomic-write.ts | LOADED | 0 | 169/169 (100.00%) | 139/139 (100.00%) | 39/39 (100.00%) |
| packages/platform/src/fs/boot-identity.ts | LOADED | 0 | 33/33 (100.00%) | 31/31 (100.00%) | 6/6 (100.00%) |
| packages/platform/src/fs/directory-home.ts | LOADED | 0 | 16/16 (100.00%) | 13/13 (100.00%) | 2/2 (100.00%) |
| packages/platform/src/fs/directory-registry.ts | LOADED | 0 | 81/81 (100.00%) | 85/85 (100.00%) | 15/15 (100.00%) |
| packages/platform/src/fs/directory-running-lock.ts | LOADED | 0 | 57/57 (100.00%) | 66/66 (100.00%) | 14/14 (100.00%) |
| packages/platform/src/fs/directory-sync.ts | LOADED | 0 | 70/70 (100.00%) | 68/68 (100.00%) | 14/14 (100.00%) |
| packages/platform/src/fs/directory-user-config.ts | LOADED | 0 | 166/166 (100.00%) | 182/182 (100.00%) | 33/33 (100.00%) |
| packages/platform/src/fs/directory-workspace.ts | LOADED | 0 | 179/179 (100.00%) | 119/150 (79.33%) | 45/55 (81.82%) |
| packages/platform/src/fs/durable-json.ts | LOADED | 0 | 151/151 (100.00%) | 99/99 (100.00%) | 31/31 (100.00%) |
| packages/platform/src/fs/env-text.ts | LOADED | 0 | 18/18 (100.00%) | 12/12 (100.00%) | 2/2 (100.00%) |
| packages/platform/src/fs/file-lock.ts | LOADED | 0 | 235/235 (100.00%) | 225/225 (100.00%) | 49/49 (100.00%) |
| packages/platform/src/fs/guarded-reader.ts | LOADED | 0 | 276/276 (100.00%) | 151/151 (100.00%) | 32/32 (100.00%) |
| packages/platform/src/fs/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/platform/src/fs/strict-containment.ts | LOADED | 0 | 9/9 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| packages/platform/src/fs/user-data-directories.ts | LOADED | 0 | 49/49 (100.00%) | 40/40 (100.00%) | 9/9 (100.00%) |
| packages/platform/src/fs/verified-directory-move.ts | LOADED | 0 | 105/105 (100.00%) | 67/67 (100.00%) | 13/13 (100.00%) |
| packages/platform/src/fs/verified-file-relocation.ts | LOADED | 0 | 72/72 (100.00%) | 45/45 (100.00%) | 13/13 (100.00%) |
| packages/platform/src/home-expansion.ts | LOADED | 0 | 14/14 (100.00%) | 8/8 (100.00%) | 2/2 (100.00%) |
| packages/platform/src/http.ts | LOADED | 0 | 20/20 (100.00%) | 14/14 (100.00%) | 2/2 (100.00%) |
| packages/platform/src/http/guarded/client.ts | LOADED | 0 | 184/184 (100.00%) | 132/132 (100.00%) | 22/22 (100.00%) |
| packages/platform/src/http/guarded/errors.ts | LOADED | 0 | 7/7 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| packages/platform/src/http/guarded/fetch-adapter.ts | LOADED | 0 | 38/38 (100.00%) | 27/27 (100.00%) | 5/5 (100.00%) |
| packages/platform/src/http/guarded/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/platform/src/http/guarded/node-ports.ts | LOADED | 0 | 8/8 (100.00%) | 3/3 (100.00%) | 3/4 (75.00%) |
| packages/platform/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/platform/src/mail/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/platform/src/mail/purpose-scoped-mailer.ts | LOADED | 0 | 39/39 (100.00%) | 18/19 (94.74%) | 7/7 (100.00%) |
| packages/platform/src/mail/smtp.ts | LOADED | 0 | 92/92 (100.00%) | 40/41 (97.56%) | 11/11 (100.00%) |
| packages/platform/src/messages.ts | LOADED | 0 | 14/14 (100.00%) | 12/12 (100.00%) | 12/12 (100.00%) |
| packages/platform/src/net/address.ts | LOADED | 0 | 18/18 (100.00%) | 13/14 (92.86%) | 3/3 (100.00%) |
| packages/platform/src/net/endpoint-policy.ts | LOADED | 0 | 119/119 (100.00%) | 121/121 (100.00%) | 15/15 (100.00%) |
| packages/platform/src/process.ts | LOADED | 0 | 237/237 (100.00%) | 114/114 (100.00%) | 24/24 (100.00%) |
| packages/platform/src/proxy-env.ts | LOADED | 0 | 285/285 (100.00%) | 145/145 (100.00%) | 30/30 (100.00%) |
| packages/platform/src/resource-paths.ts | LOADED | 0 | 113/113 (100.00%) | 47/47 (100.00%) | 8/8 (100.00%) |
| packages/platform/src/sandbox-env.ts | LOADED | 0 | 164/164 (100.00%) | 49/49 (100.00%) | 13/13 (100.00%) |
| packages/platform/src/secrets/aad.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/platform/src/secrets/credential-sets/contracts.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/platform/src/secrets/credential-sets/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/platform/src/secrets/credential-sets/provider-matches.ts | LOADED | 0 | 37/37 (100.00%) | 43/43 (100.00%) | 4/4 (100.00%) |
| packages/platform/src/secrets/credential-sets/vault.aad.ts | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/platform/src/secrets/credential-sets/vault.meta.ts | LOADED | 0 | 69/69 (100.00%) | 62/62 (100.00%) | 9/9 (100.00%) |
| packages/platform/src/secrets/credential-sets/vault.repo.memory.ts | LOADED | 0 | 121/121 (100.00%) | 87/87 (100.00%) | 20/20 (100.00%) |
| packages/platform/src/secrets/credential-sets/vault.service.ts | LOADED | 0 | 239/239 (100.00%) | 237/237 (100.00%) | 34/34 (100.00%) |
| packages/platform/src/secrets/credential-sets/vault.types.ts | LOADED | 0 | 33/33 (100.00%) | 25/25 (100.00%) | 6/6 (100.00%) |
| packages/platform/src/secrets/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/platform/src/secrets/keyring.env.ts | LOADED | 0 | 224/224 (100.00%) | 101/101 (100.00%) | 35/35 (100.00%) |
| packages/platform/src/secrets/keyring.memory.ts | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/platform/src/secrets/secret-sealer.aesgcm.ts | LOADED | 0 | 54/54 (100.00%) | 19/19 (100.00%) | 5/5 (100.00%) |
| packages/platform/src/shell.ts | LOADED | 0 | 40/40 (100.00%) | 15/15 (100.00%) | 5/5 (100.00%) |
| packages/platform/src/terminal.ts | LOADED | 0 | 314/314 (100.00%) | 118/118 (100.00%) | 25/25 (100.00%) |
| packages/platform/src/toolchain.ts | LOADED | 0 | 163/163 (100.00%) | 72/72 (100.00%) | 12/12 (100.00%) |
| packages/platform/src/web/html-document.ts | LOADED | 0 | 190/190 (100.00%) | 149/149 (100.00%) | 23/23 (100.00%) |
| packages/platform/src/web/html-resource.ts | LOADED | 0 | 6/6 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| packages/platform/src/web/html-to-markdown.ts | LOADED | 0 | 185/185 (100.00%) | 140/140 (100.00%) | 31/31 (100.00%) |
| packages/platform/src/web/web-page.ts | LOADED | 0 | 278/278 (100.00%) | 248/248 (100.00%) | 32/32 (100.00%) |
| packages/plugins/src/glue/attachment-points/content-lifecycle.ts | LOADED | 0 | 7/7 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/plugins/src/glue/attachment-points/events.ts | LOADED | 0 | 7/7 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/plugins/src/glue/attachment-points/tool-registration.ts | LOADED | 0 | 45/45 (100.00%) | 16/17 (94.12%) | 3/3 (100.00%) |
| packages/plugins/src/glue/capability-gate.ts | LOADED | 0 | 21/21 (100.00%) | 10/10 (100.00%) | 4/4 (100.00%) |
| packages/plugins/src/glue/dispatch.ts | LOADED | 0 | 7/7 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/plugins/src/glue/index.ts | LOADED | 0 | 7/7 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/plugins/src/host/attach-loaded-plugin.ts | LOADED | 0 | 7/7 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/plugins/src/host/browser-providers.ts | LOADED | 0 | 50/50 (100.00%) | 44/44 (100.00%) | 6/6 (100.00%) |
| packages/plugins/src/host/bundled-initialization.ts | LOADED | 0 | 17/17 (100.00%) | 9/10 (90.00%) | 1/1 (100.00%) |
| packages/plugins/src/host/capability-sdk.ts | LOADED | 0 | 62/62 (100.00%) | 20/23 (86.96%) | 5/5 (100.00%) |
| packages/plugins/src/host/claim-conflicts.ts | LOADED | 0 | 84/84 (100.00%) | 54/54 (100.00%) | 10/10 (100.00%) |
| packages/plugins/src/host/errors.ts | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| packages/plugins/src/host/node/discovery.ts | LOADED | 0 | 159/159 (100.00%) | 88/88 (100.00%) | 15/15 (100.00%) |
| packages/plugins/src/host/node/install.ts | LOADED | 0 | 317/317 (100.00%) | 290/293 (98.98%) | 45/45 (100.00%) |
| packages/plugins/src/host/node/loader.ts | LOADED | 0 | 101/101 (100.00%) | 64/64 (100.00%) | 12/12 (100.00%) |
| packages/plugins/src/host/node/module-snapshot.ts | LOADED | 0 | 39/39 (100.00%) | 18/18 (100.00%) | 2/2 (100.00%) |
| packages/plugins/src/host/node/package-files.ts | LOADED | 0 | 145/145 (100.00%) | 74/75 (98.67%) | 13/13 (100.00%) |
| packages/plugins/src/host/node/source-drafts.ts | LOADED | 0 | 249/249 (100.00%) | 201/203 (99.01%) | 41/41 (100.00%) |
| packages/plugins/src/host/plugin-format.ts | LOADED | 0 | 17/17 (100.00%) | 3/4 (75.00%) | 1/1 (100.00%) |
| packages/plugins/src/host/quarantine.ts | LOADED | 0 | 25/25 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/plugins/src/host/repo.memory.ts | LOADED | 0 | 30/30 (100.00%) | 14/14 (100.00%) | 6/6 (100.00%) |
| packages/plugins/src/host/source-policy.ts | LOADED | 0 | 24/24 (100.00%) | 20/21 (95.24%) | 6/6 (100.00%) |
| packages/plugins/src/host/tool-contributions.ts | LOADED | 0 | 33/33 (100.00%) | 20/20 (100.00%) | 7/7 (100.00%) |
| packages/plugins/src/host/worker/import-seam.ts | LOADED | 0 | 40/40 (100.00%) | 24/24 (100.00%) | 5/5 (100.00%) |
| packages/plugins/src/host/worker/protocol.ts | LOADED | 0 | 26/26 (100.00%) | 21/21 (100.00%) | 3/3 (100.00%) |
| packages/plugins/src/host/worker/run-call.ts | LOADED | 0 | 49/49 (100.00%) | 28/28 (100.00%) | 3/3 (100.00%) |
| packages/protocol/src/errors.ts | LOADED | 0 | 52/52 (100.00%) | 27/27 (100.00%) | 4/4 (100.00%) |
| packages/protocol/src/events.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/protocol/src/index.ts | LOADED | 0 | 9/9 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/protocol/src/registry.ts | LOADED | 0 | 162/162 (100.00%) | 4/4 (100.00%) | 0/0 (100.00%) |
| packages/protocol/src/run-context.ts | LOADED | 0 | 24/24 (100.00%) | 21/21 (100.00%) | 3/3 (100.00%) |
| packages/protocol/src/run.ts | LOADED | 0 | 12/12 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/registry/src/database-backend.ts | LOADED | 0 | 90/90 (100.00%) | 30/31 (96.77%) | 9/9 (100.00%) |
| packages/registry/src/github-backend.ts | LOADED | 0 | 132/132 (100.00%) | 37/37 (100.00%) | 10/10 (100.00%) |
| packages/registry/src/github-client.ts | LOADED | 0 | 174/174 (100.00%) | 109/109 (100.00%) | 25/25 (100.00%) |
| packages/registry/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/registry/src/static-backend.ts | LOADED | 0 | 202/202 (100.00%) | 106/106 (100.00%) | 25/25 (100.00%) |
| packages/registry/src/tool-catalog-builder/index.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/registry/src/tool-catalog-builder/search-enricher.ts | LOADED | 0 | 26/26 (100.00%) | 30/30 (100.00%) | 6/6 (100.00%) |
| packages/registry/src/tool-catalog-builder/sqlite.ts | LOADED | 0 | 15/15 (100.00%) | 5/5 (100.00%) | 4/4 (100.00%) |
| packages/registry/src/tool-catalog/sqlite.ts | LOADED | 0 | 52/52 (100.00%) | 17/17 (100.00%) | 5/5 (100.00%) |
| packages/registry/src/trust-certificates.ts | LOADED | 0 | 34/34 (100.00%) | 23/23 (100.00%) | 4/4 (100.00%) |
| packages/registry/src/trust.ts | LOADED | 0 | 105/105 (100.00%) | 80/80 (100.00%) | 9/9 (100.00%) |
| packages/registry/src/versioning.ts | LOADED | 0 | 136/136 (100.00%) | 123/123 (100.00%) | 15/15 (100.00%) |
| packages/sandbox/src/core/errors.ts | LOADED | 0 | 8/8 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/sandbox/src/core/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/sandbox/src/e2b/categorize-e2b-error.ts | LOADED | 0 | 17/17 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/sandbox/src/e2b/default-vite-react-template.ts | LOADED | 0 | 18/18 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/sandbox/src/e2b/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/sandbox/src/e2b/provider.ts | LOADED | 0 | 60/60 (100.00%) | 32/32 (100.00%) | 9/9 (100.00%) |
| packages/sandbox/src/e2b/shell-quote.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/sandbox/src/e2b/to-array-buffer.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/server/src/builtin-features.ts | LOADED | 0 | 500/500 (100.00%) | 168/169 (99.41%) | 80/81 (98.77%) |
| packages/server/src/compose-jini-kernel.ts | LOADED | 0 | 166/166 (100.00%) | 64/64 (100.00%) | 12/12 (100.00%) |
| packages/server/src/create-local-node-daemon.ts | LOADED | 0 | 191/191 (100.00%) | 89/89 (100.00%) | 15/15 (100.00%) |
| packages/server/src/feature-activation.ts | LOADED | 0 | 111/111 (100.00%) | 55/55 (100.00%) | 5/5 (100.00%) |
| packages/server/src/feature.ts | LOADED | 0 | 52/52 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/server/src/host-bootstrap.ts | LOADED | 0 | 90/90 (100.00%) | 40/41 (97.56%) | 7/7 (100.00%) |
| packages/server/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/server/src/kernel-base.ts | LOADED | 0 | 95/95 (100.00%) | 45/46 (97.83%) | 7/7 (100.00%) |
| packages/server/src/lifecycle/boot-lifecycle.ts | LOADED | 0 | 67/67 (100.00%) | 31/31 (100.00%) | 4/4 (100.00%) |
| packages/server/src/lifecycle/index.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/server/src/lifecycle/readiness-state.ts | LOADED | 0 | 15/15 (100.00%) | 6/6 (100.00%) | 4/4 (100.00%) |
| packages/server/src/storage/backend-config.ts | LOADED | 0 | 47/47 (100.00%) | 25/25 (100.00%) | 4/4 (100.00%) |
| packages/server/src/storage/index.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/server/src/storage/legacy/sqlite.ts | LOADED | 0 | 34/34 (100.00%) | 19/20 (95.00%) | 5/5 (100.00%) |
| packages/server/src/store/projects/sqlite.ts | LOADED | 0 | 177/177 (100.00%) | 52/52 (100.00%) | 13/13 (100.00%) |
| packages/sidecar/src/bootstrap.ts | LOADED | 0 | 51/51 (100.00%) | 11/11 (100.00%) | 3/3 (100.00%) |
| packages/sidecar/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/sidecar/src/ipc-path.ts | LOADED | 0 | 13/13 (100.00%) | 14/14 (100.00%) | 2/2 (100.00%) |
| packages/sidecar/src/json-file.ts | LOADED | 0 | 21/21 (100.00%) | 9/9 (100.00%) | 5/5 (100.00%) |
| packages/sidecar/src/json-ipc.ts | LOADED | 0 | 351/351 (100.00%) | 98/102 (96.08%) | 16/16 (100.00%) |
| packages/sidecar/src/net.ts | LOADED | 0 | 18/18 (100.00%) | 12/12 (100.00%) | 2/2 (100.00%) |
| packages/sidecar/src/paths.ts | LOADED | 0 | 111/111 (100.00%) | 28/28 (100.00%) | 15/15 (100.00%) |
| packages/sidecar/src/port.ts | LOADED | 0 | 65/65 (100.00%) | 42/42 (100.00%) | 7/7 (100.00%) |
| packages/sidecar/src/respawn-policy.ts | LOADED | 0 | 44/44 (100.00%) | 28/28 (100.00%) | 5/5 (100.00%) |
| packages/sqlite/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui-kit/src/confirm.ts | LOADED | 0 | 33/33 (100.00%) | 30/30 (100.00%) | 6/6 (100.00%) |
| packages/ui-kit/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui-kit/src/kit-contract.ts | LOADED | 0 | 40/40 (100.00%) | 2/2 (100.00%) | 0/0 (100.00%) |
| packages/ui-kit/src/needs.ts | LOADED | 0 | 25/25 (100.00%) | 15/15 (100.00%) | 4/4 (100.00%) |
| packages/ui-kit/src/react/confirm/ConfirmDialog.hooks.ts | LOADED | 0 | 76/76 (100.00%) | 61/61 (100.00%) | 8/9 (88.89%) |
| packages/ui-kit/src/react/confirm/ConfirmDialog.tsx | LOADED | 0 | 7/7 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui-kit/src/react/confirm/guard.ts | LOADED | 0 | 61/61 (100.00%) | 66/66 (100.00%) | 8/8 (100.00%) |
| packages/ui-kit/src/react/context.ts | LOADED | 0 | 18/18 (100.00%) | 5/6 (83.33%) | 3/3 (100.00%) |
| packages/ui-kit/src/react/facade.ts | LOADED | 0 | 34/34 (100.00%) | 6/6 (100.00%) | 4/4 (100.00%) |
| packages/ui-kit/src/react/KitProvider.tsx | LOADED | 0 | 13/13 (100.00%) | 5/6 (83.33%) | 4/4 (100.00%) |
| packages/ui-kit/src/react/native/Controls.hooks.ts | LOADED | 0 | 61/61 (100.00%) | 38/38 (100.00%) | 17/17 (100.00%) |
| packages/ui-kit/src/react/native/Controls.tsx | LOADED | 0 | 45/45 (100.00%) | 11/11 (100.00%) | 11/11 (100.00%) |
| packages/ui-kit/src/react/native/Dialog.tsx | LOADED | 0 | 15/15 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| packages/ui-kit/src/react/native/index.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui-kit/src/react/native/Navigation.hooks.ts | LOADED | 0 | 85/85 (100.00%) | 76/76 (100.00%) | 20/20 (100.00%) |
| packages/ui-kit/src/react/native/Navigation.tsx | LOADED | 0 | 15/15 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| packages/ui-kit/src/react/testing/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui-kit/src/testing/scenarios.ts | LOADED | 0 | 26/26 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| packages/ui-kit/src/toast.ts | LOADED | 0 | 35/35 (100.00%) | 23/24 (95.83%) | 8/10 (80.00%) |
| packages/ui/src/browser/index.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/browser/useDismissOnOutsideOrEscape.ts | LOADED | 0 | 18/18 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/browser/useFileDropTarget.ts | LOADED | 0 | 57/57 (100.00%) | 22/22 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/browser/useGlobalKeydown.ts | LOADED | 0 | 27/27 (100.00%) | 13/13 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/browser/useModalWindowDragGuard.ts | LOADED | 0 | 32/32 (100.00%) | 10/10 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/core.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/core/theme/default.ts | LOADED | 0 | 9/9 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/core/theme/stylesheet.ts | LOADED | 0 | 11/11 (100.00%) | 6/9 (66.67%) | 1/1 (100.00%) |
| packages/ui/src/core/theme/validation.ts | LOADED | 0 | 48/48 (100.00%) | 59/59 (100.00%) | 11/11 (100.00%) |
| packages/ui/src/features/a2ui/catalog-from-registry.ts | LOADED | 0 | 17/17 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/a2ui/protocol.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/a2ui/renderer.tsx | LOADED | 0 | 105/105 (100.00%) | 30/32 (93.75%) | 8/8 (100.00%) |
| packages/ui/src/features/a2ui/use-a2ui-surface.ts | LOADED | 0 | 27/27 (100.00%) | 18/18 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/about/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/about/react/components/AboutTab.tsx | LOADED | 0 | 171/171 (100.00%) | 36/36 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/features/about/react/hooks/useSilentUpdatesToggle.ts | LOADED | 0 | 26/26 (100.00%) | 9/9 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/about/rules.ts | LOADED | 0 | 173/173 (100.00%) | 63/63 (100.00%) | 15/15 (100.00%) |
| packages/ui/src/features/admin-widgets/components/ComingSoonNotice.tsx | LOADED | 0 | 12/12 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/admin-widgets/components/ComingSoonPanel.tsx | LOADED | 0 | 13/13 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/admin-widgets/components/ImagePreviewModal.tsx | LOADED | 0 | 22/22 (100.00%) | 1/2 (50.00%) | 1/1 (100.00%) |
| packages/ui/src/features/admin-widgets/components/InfoTip.hooks.tsx | LOADED | 0 | 73/73 (100.00%) | 34/37 (91.89%) | 7/8 (87.50%) |
| packages/ui/src/features/admin-widgets/components/InfoTip.rules.ts | LOADED | 0 | 52/52 (100.00%) | 38/38 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/admin-widgets/components/InfoTip.tsx | LOADED | 0 | 60/60 (100.00%) | 38/38 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/admin-widgets/components/Lightbox/Lightbox.hooks.ts | LOADED | 0 | 88/88 (100.00%) | 52/53 (98.11%) | 11/11 (100.00%) |
| packages/ui/src/features/admin-widgets/components/Lightbox/Lightbox.tsx | LOADED | 0 | 44/44 (100.00%) | 14/14 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/admin-widgets/components/MiddleTruncate.rules.ts | LOADED | 0 | 11/11 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/admin-widgets/components/MiddleTruncate.tsx | LOADED | 0 | 9/9 (100.00%) | 5/6 (83.33%) | 1/1 (100.00%) |
| packages/ui/src/features/admin-widgets/components/ScrollJump/ScrollJump.rules.ts | LOADED | 0 | 18/18 (100.00%) | 10/10 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/admin-widgets/components/ScrollJump/ScrollJump.tsx | LOADED | 0 | 20/20 (100.00%) | 9/9 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/admin-widgets/components/SeeMore/SeeMore.hooks.tsx | LOADED | 0 | 27/27 (100.00%) | 16/16 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/admin-widgets/components/SeeMore/SeeMore.tsx | LOADED | 0 | 46/46 (100.00%) | 16/17 (94.12%) | 3/3 (100.00%) |
| packages/ui/src/features/admin-widgets/components/Select/Select.hooks.tsx | LOADED | 0 | 164/164 (100.00%) | 81/81 (100.00%) | 22/23 (95.65%) |
| packages/ui/src/features/admin-widgets/components/Select/Select.tsx | LOADED | 0 | 199/199 (100.00%) | 60/60 (100.00%) | 13/13 (100.00%) |
| packages/ui/src/features/admin-widgets/components/SuggestInput/SuggestInput.hooks.ts | LOADED | 0 | 62/62 (100.00%) | 41/41 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/features/admin-widgets/components/SuggestInput/SuggestInput.tsx | LOADED | 0 | 54/54 (100.00%) | 17/20 (85.00%) | 6/6 (100.00%) |
| packages/ui/src/features/admin-widgets/components/useDebouncedHtmlPreview.hooks.ts | LOADED | 0 | 21/21 (100.00%) | 12/12 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/admin-widgets/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/appearance/constants.ts | LOADED | 0 | 17/17 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/appearance/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/appearance/react/components/AppearanceTab.tsx | LOADED | 0 | 77/77 (100.00%) | 22/24 (91.67%) | 4/4 (100.00%) |
| packages/ui/src/features/appearance/rules.ts | LOADED | 0 | 19/19 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/asset-grid/constants.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/asset-grid/dependencies.ts | LOADED | 0 | 53/53 (100.00%) | 31/31 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/features/asset-grid/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/asset-grid/react/components/AssetCard.tsx | LOADED | 0 | 106/106 (100.00%) | 36/36 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/asset-grid/react/components/AssetGrid.tsx | LOADED | 0 | 213/213 (100.00%) | 53/55 (96.36%) | 5/5 (100.00%) |
| packages/ui/src/features/asset-grid/react/components/AssetGridBody.tsx | LOADED | 0 | 40/40 (100.00%) | 12/12 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-grid/react/components/AssetGridToolbar.tsx | LOADED | 0 | 91/91 (100.00%) | 20/20 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/asset-grid/react/components/DeleteConfirmDialog.tsx | LOADED | 0 | 41/41 (100.00%) | 9/9 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/asset-grid/react/components/SelectionActionBar.tsx | LOADED | 0 | 26/26 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-grid/react/components/SelectionBand.tsx | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-grid/react/components/useAssetGridFilters.ts | LOADED | 0 | 21/21 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-grid/react/hooks/useAssetGridData.ts | LOADED | 0 | 46/46 (100.00%) | 15/15 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/asset-grid/react/hooks/useAssetGridKeyboardShortcuts.ts | LOADED | 0 | 39/39 (100.00%) | 26/26 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/asset-grid/react/hooks/useAssetGridLiveUpdates.ts | LOADED | 0 | 122/122 (100.00%) | 50/51 (98.04%) | 9/9 (100.00%) |
| packages/ui/src/features/asset-grid/react/hooks/useAssetGridSelection.ts | LOADED | 0 | 24/24 (100.00%) | 11/11 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-grid/react/hooks/useRubberBandDrag.ts | LOADED | 0 | 87/87 (100.00%) | 28/28 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/asset-grid/rules.ts | LOADED | 0 | 172/172 (100.00%) | 102/102 (100.00%) | 21/21 (100.00%) |
| packages/ui/src/features/asset-tree-browser/constants.ts | LOADED | 0 | 8/8 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/asset-tree-browser/dependencies.ts | LOADED | 0 | 44/44 (100.00%) | 18/18 (100.00%) | 11/11 (100.00%) |
| packages/ui/src/features/asset-tree-browser/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeBreadcrumbs.tsx | LOADED | 0 | 25/25 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeBrowser.tsx | LOADED | 0 | 65/65 (100.00%) | 13/13 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeBrowserParts.tsx | LOADED | 0 | 217/217 (100.00%) | 45/45 (100.00%) | 16/16 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeEmptyState.tsx | LOADED | 0 | 24/24 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFileRow.tsx | LOADED | 0 | 136/136 (100.00%) | 43/43 (100.00%) | 19/19 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFolderRow.tsx | LOADED | 0 | 26/26 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeRowMenu.tsx | LOADED | 0 | 45/45 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeSelectionBar.tsx | LOADED | 0 | 40/40 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeToolbar.tsx | LOADED | 0 | 20/20 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeUploadErrorBanner.tsx | LOADED | 0 | 13/13 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/FilePreviewPane.tsx | LOADED | 0 | 66/66 (100.00%) | 9/9 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/useAssetTreeBrowserController.ts | LOADED | 0 | 64/64 (100.00%) | 11/11 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeBatchActions.ts | LOADED | 0 | 44/44 (100.00%) | 19/19 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeClipboardPasteUpload.ts | LOADED | 0 | 14/14 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeCopyLocalPath.ts | LOADED | 0 | 19/19 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeDragUpload.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeNavigation.ts | LOADED | 0 | 30/30 (100.00%) | 12/12 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreePreview.ts | LOADED | 0 | 28/28 (100.00%) | 20/20 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeRename.ts | LOADED | 0 | 41/41 (100.00%) | 22/22 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeRowMenu.ts | LOADED | 0 | 18/18 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeSelection.ts | LOADED | 0 | 32/32 (100.00%) | 14/14 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/asset-tree-browser/rules.ts | LOADED | 0 | 196/196 (100.00%) | 113/113 (100.00%) | 20/20 (100.00%) |
| packages/ui/src/features/browser-chrome/constants.ts | LOADED | 0 | 10/10 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/browser-chrome/dependencies.ts | LOADED | 0 | 42/42 (100.00%) | 20/20 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/browser-chrome/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/browser-chrome/react/components/BrowserViewportControls.tsx | LOADED | 0 | 61/61 (100.00%) | 24/24 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/browser-chrome/react/hooks/useBrowserBridgeRegistration.ts | LOADED | 0 | 18/18 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/browser-chrome/react/hooks/useBrowserHistory.ts | LOADED | 0 | 30/30 (100.00%) | 12/12 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/browser-chrome/react/hooks/useBrowserNavigationStack.ts | LOADED | 0 | 57/57 (100.00%) | 22/22 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/browser-chrome/rules.ts | LOADED | 0 | 238/238 (100.00%) | 152/152 (100.00%) | 28/28 (100.00%) |
| packages/ui/src/features/charts/browser.ts | LOADED | 0 | 103/103 (100.00%) | 51/52 (98.08%) | 13/14 (92.86%) |
| packages/ui/src/features/charts/contract.ts | LOADED | 0 | 18/18 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/charts/index.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/charts/react.tsx | LOADED | 0 | 52/52 (100.00%) | 21/23 (91.30%) | 4/4 (100.00%) |
| packages/ui/src/features/charts/registry.ts | LOADED | 0 | 31/31 (100.00%) | 10/11 (90.91%) | 4/4 (100.00%) |
| packages/ui/src/features/charts/table.ts | LOADED | 0 | 44/44 (100.00%) | 22/22 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/charts/wire.ts | LOADED | 0 | 32/32 (100.00%) | 11/11 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/command-palette/constants.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/command-palette/dependencies.ts | LOADED | 0 | 30/30 (100.00%) | 14/14 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/command-palette/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/command-palette/react/components/CommandPalette.tsx | LOADED | 0 | 57/57 (100.00%) | 11/11 (100.00%) | 2/3 (66.67%) |
| packages/ui/src/features/command-palette/react/components/CommandPaletteRow.tsx | LOADED | 0 | 18/18 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/command-palette/react/hooks/useCommandPalette.ts | LOADED | 0 | 46/46 (100.00%) | 22/22 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/command-palette/rules.ts | LOADED | 0 | 54/54 (100.00%) | 42/42 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/connectors/components/ConnectorAlertList.tsx | LOADED | 0 | 29/29 (100.00%) | 7/7 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/connectors/components/ConnectorCard.tsx | LOADED | 0 | 203/203 (100.00%) | 69/69 (100.00%) | 17/17 (100.00%) |
| packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx | LOADED | 0 | 322/322 (100.00%) | 77/77 (100.00%) | 18/18 (100.00%) |
| packages/ui/src/features/connectors/components/ConnectorGate.tsx | LOADED | 0 | 17/17 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/connectors/components/ConnectorGrid.tsx | LOADED | 0 | 84/84 (100.00%) | 28/28 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/connectors/components/ConnectorLogo.tsx | LOADED | 0 | 42/42 (100.00%) | 17/17 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/connectors/components/ConnectorSearchBar.tsx | LOADED | 0 | 58/58 (100.00%) | 8/8 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/connectors/components/ProviderTabBar.tsx | LOADED | 0 | 24/24 (100.00%) | 9/9 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/connectors/ConnectorsBrowser.tsx | LOADED | 0 | 155/155 (100.00%) | 37/37 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/features/connectors/constants.ts | LOADED | 0 | 13/13 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/connectors/dependencies.ts | LOADED | 0 | 112/112 (100.00%) | 65/65 (100.00%) | 19/19 (100.00%) |
| packages/ui/src/features/connectors/hooks/useConnectorCatalog.ts | LOADED | 0 | 53/53 (100.00%) | 27/27 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/connectors/hooks/useConnectorDetail.ts | LOADED | 0 | 76/76 (100.00%) | 55/55 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/connectors/hooks/useWiredConnectorsBrowser.ts | LOADED | 0 | 29/29 (100.00%) | 9/9 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/connectors/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/connectors/rules.ts | LOADED | 0 | 386/386 (100.00%) | 246/246 (100.00%) | 37/37 (100.00%) |
| packages/ui/src/features/execution/constants.ts | LOADED | 0 | 93/93 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/execution/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/execution/react/components/AgentCliEnvFields.tsx | LOADED | 0 | 30/30 (100.00%) | 9/9 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/execution/react/components/AgentDiagnosticRow.tsx | LOADED | 0 | 61/61 (100.00%) | 20/20 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/execution/react/components/ByokProviderForm.tsx | LOADED | 0 | 342/342 (100.00%) | 114/114 (100.00%) | 24/24 (100.00%) |
| packages/ui/src/features/execution/react/components/ExecutionTab.tsx | LOADED | 0 | 190/190 (100.00%) | 53/55 (96.36%) | 15/15 (100.00%) |
| packages/ui/src/features/execution/react/components/LocalCliAgentCard.tsx | LOADED | 0 | 122/122 (100.00%) | 38/38 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/execution/react/components/LocalCliAgentList.tsx | LOADED | 0 | 106/106 (100.00%) | 31/31 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/execution/react/components/LocalCliAgentSettings.tsx | LOADED | 0 | 138/138 (100.00%) | 32/33 (96.97%) | 7/7 (100.00%) |
| packages/ui/src/features/execution/react/components/ProviderChipGroup.tsx | LOADED | 0 | 44/44 (100.00%) | 13/14 (92.86%) | 2/2 (100.00%) |
| packages/ui/src/features/execution/react/components/SearchableModelSelect.tsx | LOADED | 0 | 63/63 (100.00%) | 19/20 (95.00%) | 4/4 (100.00%) |
| packages/ui/src/features/execution/react/hooks/use-byok-field-validation.hooks.ts | LOADED | 0 | 26/26 (100.00%) | 10/11 (90.91%) | 3/3 (100.00%) |
| packages/ui/src/features/execution/react/hooks/useLocalCliAgentCard.ts | LOADED | 0 | 109/109 (100.00%) | 35/35 (100.00%) | 8/9 (88.89%) |
| packages/ui/src/features/execution/react/hooks/useLocalCliAgentList.ts | LOADED | 0 | 8/8 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/execution/react/hooks/useReasoningControl.ts | LOADED | 0 | 136/136 (100.00%) | 86/86 (100.00%) | 8/8 (100.00%) |
| packages/ui/src/features/external-mcp/constants.ts | LOADED | 0 | 16/16 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/external-mcp/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/external-mcp/react/components/ExternalMcpTab.tsx | LOADED | 0 | 108/108 (100.00%) | 20/22 (90.91%) | 5/11 (45.45%) |
| packages/ui/src/features/file-dropzone/constants.ts | LOADED | 0 | 34/34 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/file-dropzone/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/file-dropzone/react/components/FileDropzone.tsx | LOADED | 0 | 111/111 (100.00%) | 37/37 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/file-dropzone/react/components/FileDropzoneLightbox.tsx | LOADED | 0 | 78/78 (100.00%) | 21/21 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/file-dropzone/react/components/FileDropzoneNameList.tsx | LOADED | 0 | 22/22 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/file-dropzone/react/components/FileDropzoneThumbnailGrid.tsx | LOADED | 0 | 79/79 (100.00%) | 28/28 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/features/file-dropzone/react/components/FileDropzoneZone.tsx | LOADED | 0 | 45/45 (100.00%) | 13/13 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/file-dropzone/react/hooks/useFileDialogTracking.ts | LOADED | 0 | 76/76 (100.00%) | 33/33 (100.00%) | 8/8 (100.00%) |
| packages/ui/src/features/file-dropzone/react/hooks/useFileDropzone.ts | LOADED | 0 | 103/103 (100.00%) | 39/39 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/features/file-dropzone/react/hooks/useFileDropzonePreviews.ts | LOADED | 0 | 95/95 (100.00%) | 42/42 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/file-dropzone/rules.ts | LOADED | 0 | 44/44 (100.00%) | 49/49 (100.00%) | 8/8 (100.00%) |
| packages/ui/src/features/folder-path-drop/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/folder-path-drop/react/hooks/useFolderPathDropCapture.ts | LOADED | 0 | 13/13 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/folder-path-drop/rules.ts | LOADED | 0 | 42/42 (100.00%) | 26/26 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/html-editor/canvas-content-wrapper.ts | LOADED | 0 | 26/26 (100.00%) | 14/15 (93.33%) | 2/2 (100.00%) |
| packages/ui/src/features/html-editor/canvas-embed-placeholders.ts | LOADED | 0 | 151/151 (100.00%) | 72/72 (100.00%) | 11/11 (100.00%) |
| packages/ui/src/features/html-editor/canvas-style.ts | LOADED | 0 | 22/22 (100.00%) | 9/10 (90.00%) | 3/3 (100.00%) |
| packages/ui/src/features/html-editor/css.ts | LOADED | 0 | 110/110 (100.00%) | 50/50 (100.00%) | 8/8 (100.00%) |
| packages/ui/src/features/html-editor/editor-blocks.ts | LOADED | 0 | 174/174 (100.00%) | 127/128 (99.22%) | 14/14 (100.00%) |
| packages/ui/src/features/html-editor/react/components/InteractiveHtmlEditor.tsx | LOADED | 0 | 23/23 (100.00%) | 2/4 (50.00%) | 1/1 (100.00%) |
| packages/ui/src/features/html-editor/source-splice.ts | LOADED | 0 | 99/99 (100.00%) | 54/55 (98.18%) | 12/12 (100.00%) |
| packages/ui/src/features/html-viewer/constants.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/html-viewer/dependencies.ts | LOADED | 0 | 36/36 (100.00%) | 20/20 (100.00%) | 8/8 (100.00%) |
| packages/ui/src/features/html-viewer/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/html-viewer/react/components/DeckNavigationControls.tsx | LOADED | 0 | 33/33 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/html-viewer/react/components/PresentMenu.tsx | LOADED | 0 | 36/36 (100.00%) | 10/10 (100.00%) | 7/7 (100.00%) |
| packages/ui/src/features/html-viewer/react/components/ZoomMenu.tsx | LOADED | 0 | 32/32 (100.00%) | 7/7 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/html-viewer/react/hooks/useDeckNavigation.ts | LOADED | 0 | 33/33 (100.00%) | 12/12 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/html-viewer/react/hooks/usePresentMode.ts | LOADED | 0 | 30/30 (100.00%) | 9/9 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/html-viewer/react/hooks/useZoomControl.ts | LOADED | 0 | 21/21 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/html-viewer/rules.ts | LOADED | 0 | 28/28 (100.00%) | 28/28 (100.00%) | 7/7 (100.00%) |
| packages/ui/src/features/i18n/context.tsx | LOADED | 0 | 69/69 (100.00%) | 33/33 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/index.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.ar.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.bn.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.de.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.en.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.es.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.fa.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.fr.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.hi.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.hu.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.id.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.it.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.ja.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.ko.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.pl.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.pt-BR.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.ru.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.th.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.tr.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.uk.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.ur.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.zh-CN.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.zh-TW.ts | LOADED | 0 | 248/248 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/dictionary-translator.ts | LOADED | 0 | 12/12 (100.00%) | 9/9 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/i18n/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/i18n/locale.ts | LOADED | 0 | 52/52 (100.00%) | 38/38 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/iframe-pool/constants.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/iframe-pool/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/iframe-pool/react/components/IframeKeepAliveProvider.tsx | LOADED | 0 | 71/71 (100.00%) | 24/24 (100.00%) | 7/7 (100.00%) |
| packages/ui/src/features/iframe-pool/react/components/PooledIframe.tsx | LOADED | 0 | 58/58 (100.00%) | 15/15 (100.00%) | 7/7 (100.00%) |
| packages/ui/src/features/iframe-pool/react/dom-sync.ts | LOADED | 0 | 110/110 (100.00%) | 59/59 (100.00%) | 9/9 (100.00%) |
| packages/ui/src/features/iframe-pool/react/hooks/useIframeKeepAlivePool.ts | LOADED | 0 | 48/48 (100.00%) | 15/15 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/iframe-pool/react/pool-context.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/iframe-pool/rules.ts | LOADED | 0 | 28/28 (100.00%) | 11/11 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/instructions/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/instructions/react/components/InstructionsTab.tsx | LOADED | 0 | 38/38 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/integrations/constants.ts | LOADED | 0 | 11/11 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/integrations/dependencies.ts | LOADED | 0 | 32/32 (100.00%) | 13/13 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/integrations/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/integrations/react/components/ClientPicker.tsx | LOADED | 0 | 53/53 (100.00%) | 29/29 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/integrations/react/components/CodexInstallToggleButton.tsx | LOADED | 0 | 37/37 (100.00%) | 20/20 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/integrations/react/components/IntegrationsTab.tsx | LOADED | 0 | 128/128 (100.00%) | 58/58 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/features/integrations/react/components/SnippetBlock.tsx | LOADED | 0 | 44/44 (100.00%) | 18/18 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/integrations/react/hooks/useCodexInstallToggle.ts | LOADED | 0 | 54/54 (100.00%) | 19/19 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/integrations/react/hooks/useMcpInstallInfo.ts | LOADED | 0 | 32/32 (100.00%) | 15/15 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/integrations/rules.ts | LOADED | 0 | 146/146 (100.00%) | 56/56 (100.00%) | 15/15 (100.00%) |
| packages/ui/src/features/interactive-ui/index.ts | LOADED | 0 | 16/16 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/manifests.ts | LOADED | 0 | 14/14 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/native/data-table.manifest.ts | LOADED | 0 | 14/14 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/native/data-table.tsx | LOADED | 0 | 38/38 (100.00%) | 17/17 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/native/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/action-button.manifest.ts | LOADED | 0 | 16/16 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/action-button.tsx | LOADED | 0 | 7/7 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/button.tsx | LOADED | 0 | 31/31 (100.00%) | 1/2 (50.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/checkbox-field.manifest.ts | LOADED | 0 | 15/15 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/checkbox-field.tsx | LOADED | 0 | 14/14 (100.00%) | 10/10 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/checkbox.tsx | LOADED | 0 | 16/16 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/content-card.manifest.ts | LOADED | 0 | 16/16 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/content-card.tsx | LOADED | 0 | 13/13 (100.00%) | 8/9 (88.89%) | 1/1 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/data-table.manifest.ts | LOADED | 0 | 16/16 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/icons.tsx | LOADED | 0 | 35/35 (100.00%) | 9/11 (81.82%) | 2/2 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/input.tsx | LOADED | 0 | 14/14 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/label.tsx | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/lib/utils.ts | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/radio-group-field.manifest.ts | LOADED | 0 | 15/15 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/radio-group-field.tsx | LOADED | 0 | 18/18 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/radio-group.tsx | LOADED | 0 | 22/22 (100.00%) | 2/2 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/select-field.manifest.ts | LOADED | 0 | 16/16 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/select-field.tsx | LOADED | 0 | 19/19 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/select.tsx | LOADED | 0 | 87/87 (100.00%) | 5/5 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/text-input-field.manifest.ts | LOADED | 0 | 16/16 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/text-input-field.tsx | LOADED | 0 | 11/11 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/interactive-ui/registry.ts | LOADED | 0 | 19/19 (100.00%) | 10/10 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/interactive-ui/table-data.ts | LOADED | 0 | 29/29 (100.00%) | 32/32 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/language/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/language/react/components/LanguageTab.tsx | LOADED | 0 | 29/29 (100.00%) | 7/9 (77.78%) | 2/2 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/constants.ts | LOADED | 0 | 13/13 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/deserialize.ts | LOADED | 0 | 42/42 (100.00%) | 13/13 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/mention-node.ts | LOADED | 0 | 106/106 (100.00%) | 24/24 (100.00%) | 13/13 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/mention-parser.ts | LOADED | 0 | 167/167 (100.00%) | 84/84 (100.00%) | 12/12 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/components/CaretFloatingLayer.tsx | LOADED | 0 | 32/32 (100.00%) | 9/9 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/components/RichTextInput.tsx | LOADED | 0 | 157/157 (100.00%) | 28/28 (100.00%) | 13/13 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/hooks/useCaretFloatingLayerPosition.ts | LOADED | 0 | 45/45 (100.00%) | 20/20 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/hooks/useKeyboardCommands.ts | LOADED | 0 | 70/70 (100.00%) | 28/28 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/hooks/useMentionAtomicNavigation.ts | LOADED | 0 | 60/60 (100.00%) | 31/31 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/hooks/useMentionColorStamping.ts | LOADED | 0 | 29/29 (100.00%) | 16/16 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/hooks/usePasteFiles.ts | LOADED | 0 | 21/21 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/hooks/useSeededValue.ts | LOADED | 0 | 11/11 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/hooks/useSyncedOnChange.ts | LOADED | 0 | 19/19 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/hooks/useTriggerDetection.ts | LOADED | 0 | 32/32 (100.00%) | 14/14 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/test-support/lexical-harness.tsx | LOADED | 0 | 28/28 (100.00%) | 8/8 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/rules.ts | LOADED | 0 | 238/238 (100.00%) | 137/137 (100.00%) | 28/28 (100.00%) |
| packages/ui/src/features/lexical-rich-text-editor/serialize.ts | LOADED | 0 | 29/29 (100.00%) | 13/13 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/list-detail-panel/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/list-detail-panel/react/components/ListDetailPanel.tsx | LOADED | 0 | 80/80 (100.00%) | 16/16 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/list-detail-panel/react/hooks/useListDetailSelection.ts | LOADED | 0 | 16/16 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/list-detail-panel/rules.ts | LOADED | 0 | 15/15 (100.00%) | 12/12 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/mcp-ui/confirmation-store.ts | LOADED | 0 | 79/79 (100.00%) | 39/39 (100.00%) | 8/8 (100.00%) |
| packages/ui/src/features/mcp-ui/early-message-buffer.ts | LOADED | 0 | 29/29 (100.00%) | 11/11 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/mcp-ui/escape.ts | LOADED | 0 | 15/15 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/mcp-ui/index.ts | LOADED | 0 | 9/9 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/mcp-ui/protocol.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/mcp-ui/resource.ts | LOADED | 0 | 105/105 (100.00%) | 71/72 (98.61%) | 9/9 (100.00%) |
| packages/ui/src/features/mcp-ui/sandbox-proxy-link-forwarder.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/mcp-ui/sandbox-proxy.ts | LOADED | 0 | 12/12 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/mcp-ui/secret-card.ts | LOADED | 0 | 121/121 (100.00%) | 85/85 (100.00%) | 14/14 (100.00%) |
| packages/ui/src/features/mcp-ui/surfaces/bridge.ts | LOADED | 0 | 14/14 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/mcp-ui/surfaces/checkbox.ts | LOADED | 0 | 16/16 (100.00%) | 9/9 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/mcp-ui/surfaces/choice-group.ts | LOADED | 0 | 29/29 (100.00%) | 20/20 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/mcp-ui/surfaces/confirmation.ts | LOADED | 0 | 131/131 (100.00%) | 66/66 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/features/mcp-ui/surfaces/document.ts | LOADED | 0 | 83/83 (100.00%) | 43/43 (100.00%) | 8/8 (100.00%) |
| packages/ui/src/features/mcp-ui/surfaces/fields.ts | LOADED | 0 | 45/45 (100.00%) | 17/17 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/mcp-ui/surfaces/form.ts | LOADED | 0 | 72/72 (100.00%) | 38/38 (100.00%) | 7/7 (100.00%) |
| packages/ui/src/features/mcp-ui/surfaces/host-theme.ts | LOADED | 0 | 34/34 (100.00%) | 13/13 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/mcp-ui/surfaces/index.ts | LOADED | 0 | 12/12 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/mcp-ui/surfaces/outcome.ts | LOADED | 0 | 44/44 (100.00%) | 29/29 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/mcp-ui/surfaces/select.ts | LOADED | 0 | 21/21 (100.00%) | 16/16 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/mcp-ui/surfaces/text-input.ts | LOADED | 0 | 52/52 (100.00%) | 33/33 (100.00%) | 7/7 (100.00%) |
| packages/ui/src/features/media-providers/constants.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/media-providers/dependencies.ts | LOADED | 0 | 21/21 (100.00%) | 20/20 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/media-providers/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/media-providers/react/components/media-providers-tab-labels.ts | LOADED | 0 | 56/56 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/media-providers/react/components/MediaProviderCard.tsx | LOADED | 0 | 141/141 (100.00%) | 40/40 (100.00%) | 9/9 (100.00%) |
| packages/ui/src/features/media-providers/react/components/MediaProvidersTab.tsx | LOADED | 0 | 135/135 (100.00%) | 38/38 (100.00%) | 9/9 (100.00%) |
| packages/ui/src/features/media-providers/react/hooks/useMediaProvidersTab.ts | LOADED | 0 | 190/190 (100.00%) | 64/64 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/media-providers/rules.ts | LOADED | 0 | 113/113 (100.00%) | 97/97 (100.00%) | 15/15 (100.00%) |
| packages/ui/src/features/memory/async-commit-guard.ts | LOADED | 0 | 11/11 (100.00%) | 5/5 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/memory/constants.ts | LOADED | 0 | 43/43 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/memory/dependencies.ts | LOADED | 0 | 195/195 (100.00%) | 77/77 (100.00%) | 23/23 (100.00%) |
| packages/ui/src/features/memory/formatters.ts | LOADED | 0 | 323/323 (100.00%) | 192/192 (100.00%) | 28/28 (100.00%) |
| packages/ui/src/features/memory/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/memory/react/components/MemoryAdvancedModal.tsx | LOADED | 0 | 154/154 (100.00%) | 27/27 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/memory/react/components/MemoryConnectedPanel.tsx | LOADED | 0 | 399/399 (100.00%) | 116/116 (100.00%) | 19/19 (100.00%) |
| packages/ui/src/features/memory/react/components/MemoryEntryCard.tsx | LOADED | 0 | 56/56 (100.00%) | 12/12 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/memory/react/components/MemoryExtractionCard.tsx | LOADED | 0 | 57/57 (100.00%) | 11/11 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx | LOADED | 0 | 80/80 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/memory/react/components/MemoryHowPanel.tsx | LOADED | 0 | 28/28 (100.00%) | 1/2 (50.00%) | 1/1 (100.00%) |
| packages/ui/src/features/memory/react/components/MemoryList.tsx | LOADED | 0 | 205/205 (100.00%) | 45/45 (100.00%) | 11/11 (100.00%) |
| packages/ui/src/features/memory/react/components/MemoryManualEditor.tsx | LOADED | 0 | 182/182 (100.00%) | 20/20 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/memory/react/hooks/useMemoryConfig.hooks.ts | LOADED | 0 | 180/180 (100.00%) | 49/49 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/memory/react/hooks/useMemoryConnectors.hooks.ts | LOADED | 0 | 401/401 (100.00%) | 167/167 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/memory/react/hooks/useMemoryConnectors.rules.ts | LOADED | 0 | 69/69 (100.00%) | 36/36 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/memory/react/hooks/useMemoryEntries.hooks.ts | LOADED | 0 | 258/258 (100.00%) | 103/103 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/memory/react/hooks/useMemoryExtractions.hooks.ts | LOADED | 0 | 120/120 (100.00%) | 36/36 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/memory/react/hooks/useMemoryExtractions.store.ts | LOADED | 0 | 162/162 (100.00%) | 101/101 (100.00%) | 22/22 (100.00%) |
| packages/ui/src/features/memory/react/hooks/useMemoryFlash.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/memory/react/hooks/useMemoryNavigation.hooks.ts | LOADED | 0 | 27/27 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/memory/react/MemoryPorts.tsx | LOADED | 0 | 10/10 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/memory/react/render-markdown.tsx | LOADED | 0 | 8/8 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/memory/react/styles.ts | LOADED | 0 | 9/9 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/memory/rules.ts | LOADED | 0 | 33/33 (100.00%) | 16/16 (100.00%) | 7/7 (100.00%) |
| packages/ui/src/features/mention-autocomplete/constants.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/mention-autocomplete/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/mention-autocomplete/react/components/MentionAutocomplete.tsx | LOADED | 0 | 71/71 (100.00%) | 12/12 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/mention-autocomplete/react/components/MentionCategoryTabs.tsx | LOADED | 0 | 32/32 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/mention-autocomplete/react/components/MentionResultItem.tsx | LOADED | 0 | 24/24 (100.00%) | 8/8 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/mention-autocomplete/react/components/MentionResultsList.tsx | LOADED | 0 | 36/36 (100.00%) | 8/8 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/mention-autocomplete/react/components/SelectedMentionChips.tsx | LOADED | 0 | 24/24 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/mention-autocomplete/react/hooks/useMentionAutocomplete.ts | LOADED | 0 | 101/101 (100.00%) | 33/33 (100.00%) | 8/8 (100.00%) |
| packages/ui/src/features/mention-autocomplete/rules.ts | LOADED | 0 | 73/73 (100.00%) | 27/27 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/features/notifications/constants.ts | LOADED | 0 | 7/7 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/notifications/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/notifications/notifications-catalog.ts | LOADED | 0 | 13/13 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/notifications/react/components/NotificationsTab.tsx | LOADED | 0 | 180/180 (100.00%) | 43/43 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/features/notifications/rules.ts | LOADED | 0 | 3/3 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/observability/boot-timing.ts | LOADED | 0 | 73/73 (100.00%) | 36/36 (100.00%) | 9/9 (100.00%) |
| packages/ui/src/features/observability/iframe.ts | LOADED | 0 | 38/38 (100.00%) | 11/11 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/observability/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/observability/install.ts | LOADED | 0 | 24/24 (100.00%) | 10/10 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/observability/long-task.ts | LOADED | 0 | 49/49 (100.00%) | 31/31 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/observability/ports.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/observability/resource-error.ts | LOADED | 0 | 40/40 (100.00%) | 33/33 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/observability/stuck-run.ts | LOADED | 0 | 66/66 (100.00%) | 22/23 (95.65%) | 7/7 (100.00%) |
| packages/ui/src/features/observability/telemetry-url.ts | LOADED | 0 | 10/10 (100.00%) | 13/13 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/observability/visibility.ts | LOADED | 0 | 44/44 (100.00%) | 13/13 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/observability/white-screen.ts | LOADED | 0 | 97/97 (100.00%) | 41/44 (93.18%) | 7/7 (100.00%) |
| packages/ui/src/features/panel-kit/fetch-query/adapter.react.tsx | LOADED | 0 | 90/90 (100.00%) | 44/45 (97.78%) | 13/13 (100.00%) |
| packages/ui/src/features/panel-kit/fetch-query/binding.react.tsx | LOADED | 0 | 14/14 (100.00%) | 6/7 (85.71%) | 6/6 (100.00%) |
| packages/ui/src/features/panel-kit/fetch-query/environment.browser.ts | LOADED | 0 | 22/22 (100.00%) | 9/9 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/panel-kit/fetch-query/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/panel-kit/fetch-query/tanstack.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/panel-kit/helpers/format-timestamp.ts | LOADED | 0 | 15/15 (100.00%) | 13/13 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/panel-kit/helpers/permissions.ts | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/panel-kit/helpers/resolve-active-tab-id.ts | LOADED | 0 | 6/6 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/panel-kit/helpers/retry-unreachable.ts | LOADED | 0 | 32/32 (100.00%) | 16/16 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/panel-kit/hooks/use-async-action.hooks.ts | LOADED | 0 | 18/18 (100.00%) | 7/7 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/panel-kit/hooks/use-dirty-guard.hooks.ts | LOADED | 0 | 21/21 (100.00%) | 13/13 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/panel-kit/hooks/use-focus-trap.hooks.ts | LOADED | 0 | 53/53 (100.00%) | 30/34 (88.24%) | 4/4 (100.00%) |
| packages/ui/src/features/panel-kit/hooks/use-serial-writes.hooks.ts | LOADED | 0 | 30/30 (100.00%) | 10/10 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/panel-kit/hooks/use-settlement-generation.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 4/4 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/panel-kit/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/privacy/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/privacy/react/components/PrivacyTab.tsx | LOADED | 0 | 141/141 (100.00%) | 39/39 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/features/privacy/rules.ts | LOADED | 0 | 60/60 (100.00%) | 15/15 (100.00%) | 8/8 (100.00%) |
| packages/ui/src/features/progress-card/components/ProgressCard.tsx | LOADED | 0 | 60/60 (100.00%) | 20/20 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/progress-card/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/progress-card/reference-adapters.ts | LOADED | 0 | 249/249 (100.00%) | 219/219 (100.00%) | 25/25 (100.00%) |
| packages/ui/src/features/progress-card/rules.ts | LOADED | 0 | 47/47 (100.00%) | 29/29 (100.00%) | 8/8 (100.00%) |
| packages/ui/src/features/project-locations/dependencies.ts | LOADED | 0 | 39/39 (100.00%) | 18/18 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/project-locations/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/project-locations/react/components/ProjectLocationsTab.tsx | LOADED | 0 | 127/127 (100.00%) | 31/31 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/project-locations/react/hooks/useProjectLocationsTab.ts | LOADED | 0 | 133/133 (100.00%) | 58/59 (98.31%) | 2/2 (100.00%) |
| packages/ui/src/features/project-locations/rules.ts | LOADED | 0 | 41/41 (100.00%) | 27/27 (100.00%) | 7/7 (100.00%) |
| packages/ui/src/features/resource-dashboard/constants.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/resource-dashboard/dependencies.ts | LOADED | 0 | 88/88 (100.00%) | 55/55 (100.00%) | 15/15 (100.00%) |
| packages/ui/src/features/resource-dashboard/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceBoard.tsx | LOADED | 0 | 83/83 (100.00%) | 12/12 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/resourceBoardProps.ts | LOADED | 0 | 75/75 (100.00%) | 37/37 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceBoardToolbar.tsx | LOADED | 0 | 90/90 (100.00%) | 23/23 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceBoardView.tsx | LOADED | 0 | 9/9 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceBoardViewParts.tsx | LOADED | 0 | 111/111 (100.00%) | 43/43 (100.00%) | 8/8 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceCard.tsx | LOADED | 0 | 55/55 (100.00%) | 18/18 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx | LOADED | 0 | 77/77 (100.00%) | 31/31 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx | LOADED | 0 | 61/61 (100.00%) | 15/15 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceMetrics.tsx | LOADED | 0 | 13/13 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceRowList.tsx | LOADED | 0 | 55/55 (100.00%) | 14/14 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceRowListItem.tsx | LOADED | 0 | 48/48 (100.00%) | 9/9 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceRowListItemParts.tsx | LOADED | 0 | 50/50 (100.00%) | 21/21 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/resourceRowListProps.ts | LOADED | 0 | 10/10 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceRowListView.tsx | LOADED | 0 | 17/17 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceRowListViewParts.tsx | LOADED | 0 | 102/102 (100.00%) | 27/27 (100.00%) | 7/7 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceRunHistoryList.tsx | LOADED | 0 | 58/58 (100.00%) | 24/24 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/StatusPill.tsx | LOADED | 0 | 8/8 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/components/translatedErrorLabelProps.ts | LOADED | 0 | 11/11 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/hooks/useResourceBoard.ts | LOADED | 0 | 193/193 (100.00%) | 82/82 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/resource-dashboard/react/hooks/useResourceRowList.ts | LOADED | 0 | 101/101 (100.00%) | 36/36 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/resource-dashboard/rules.ts | LOADED | 0 | 75/75 (100.00%) | 52/52 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/features/revision-review/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/revision-review/react/components/RevisionDiffCard.tsx | LOADED | 0 | 38/38 (100.00%) | 9/9 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/revision-review/react/components/RevisionHistoryList.tsx | LOADED | 0 | 15/15 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/revision-review/rules.ts | LOADED | 0 | 14/14 (100.00%) | 7/7 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/schedule-picker/constants.ts | LOADED | 0 | 18/18 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/schedule-picker/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/schedule-picker/react/components/RecurringSchedulePicker.tsx | LOADED | 0 | 45/45 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/schedule-picker/react/components/ScheduleFields.tsx | LOADED | 0 | 35/35 (100.00%) | 7/7 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/schedule-picker/react/components/ScheduleKindTabs.tsx | LOADED | 0 | 18/18 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/schedule-picker/react/components/ScheduleSummary.tsx | LOADED | 0 | 30/30 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/schedule-picker/react/components/WeekdayGrid.tsx | LOADED | 0 | 18/18 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/schedule-picker/react/hooks/useRecurringSchedulePicker.ts | LOADED | 0 | 46/46 (100.00%) | 23/23 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/features/schedule-picker/rules.ts | LOADED | 0 | 71/71 (100.00%) | 41/41 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/features/settings/dialog/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/settings/dialog/react/components/SettingsDialogShell.tsx | LOADED | 0 | 17/17 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/settings/dialog/react/hooks/useSettingsDialogShell.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/sketch-editor/constants.ts | LOADED | 0 | 70/70 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/sketch-editor/dependencies.ts | LOADED | 0 | 9/9 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/sketch-editor/dom.ts | LOADED | 0 | 254/254 (100.00%) | 133/133 (100.00%) | 27/27 (100.00%) |
| packages/ui/src/features/sketch-editor/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/sketch-editor/react/components/SketchEditor.tsx | LOADED | 0 | 131/131 (100.00%) | 16/16 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/sketch-editor/react/components/SketchMainMenu.tsx | LOADED | 0 | 51/51 (100.00%) | 13/13 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/sketch-editor/react/components/SketchSaveStateBadge.tsx | LOADED | 0 | 14/14 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/sketch-editor/react/dependencies-fake.tsx | LOADED | 0 | 75/75 (100.00%) | 25/25 (100.00%) | 15/15 (100.00%) |
| packages/ui/src/features/sketch-editor/react/hooks/useSketchDomEnhancements.ts | LOADED | 0 | 66/66 (100.00%) | 17/17 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/sketch-editor/react/hooks/useSketchSaveWorkflow.ts | LOADED | 0 | 108/108 (100.00%) | 43/43 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/sketch-editor/react/hooks/useSketchScene.ts | LOADED | 0 | 82/82 (100.00%) | 22/22 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/sketch-editor/react/hooks/useSketchTheme.ts | LOADED | 0 | 17/17 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/sketch-editor/rules.ts | LOADED | 0 | 228/228 (100.00%) | 100/100 (100.00%) | 20/20 (100.00%) |
| packages/ui/src/features/skills/dependencies.ts | LOADED | 0 | 71/71 (100.00%) | 28/28 (100.00%) | 9/9 (100.00%) |
| packages/ui/src/features/skills/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/skills/react/components/SkillDraftForm.labels.ts | LOADED | 0 | 54/54 (100.00%) | 22/22 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/skills/react/components/SkillDraftForm.tsx | LOADED | 0 | 77/77 (100.00%) | 12/12 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/skills/react/components/SkillRow.labels.ts | LOADED | 0 | 16/16 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/skills/react/components/SkillRow.tsx | LOADED | 0 | 266/266 (100.00%) | 53/53 (100.00%) | 9/9 (100.00%) |
| packages/ui/src/features/skills/react/components/SkillsTab.labels.ts | LOADED | 0 | 9/9 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/skills/react/components/SkillsTab.tsx | LOADED | 0 | 188/188 (100.00%) | 41/41 (100.00%) | 13/13 (100.00%) |
| packages/ui/src/features/skills/react/hooks/useSkillsTab.ts | LOADED | 0 | 261/261 (100.00%) | 113/113 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/skills/rules.ts | LOADED | 0 | 146/146 (100.00%) | 87/87 (100.00%) | 21/21 (100.00%) |
| packages/ui/src/features/source-config-list/agent-handles.ts | LOADED | 0 | 36/36 (100.00%) | 15/17 (88.24%) | 6/6 (100.00%) |
| packages/ui/src/features/source-config-list/constants.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/source-config-list/dependencies.ts | LOADED | 0 | 92/92 (100.00%) | 53/53 (100.00%) | 16/16 (100.00%) |
| packages/ui/src/features/source-config-list/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/source-config-list/react/components/SourceConfigAddForm.tsx | LOADED | 0 | 94/94 (100.00%) | 40/40 (100.00%) | 8/8 (100.00%) |
| packages/ui/src/features/source-config-list/react/components/SourceConfigField.tsx | LOADED | 0 | 113/113 (100.00%) | 45/45 (100.00%) | 9/9 (100.00%) |
| packages/ui/src/features/source-config-list/react/components/SourceConfigItemCard.tsx | LOADED | 0 | 229/229 (100.00%) | 81/81 (100.00%) | 20/20 (100.00%) |
| packages/ui/src/features/source-config-list/react/components/SourceConfigList.tsx | LOADED | 0 | 56/56 (100.00%) | 20/21 (95.24%) | 8/8 (100.00%) |
| packages/ui/src/features/source-config-list/react/components/SourceConfigListView.tsx | LOADED | 0 | 89/89 (100.00%) | 45/45 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/features/source-config-list/react/components/SourceConfigTestControl.tsx | LOADED | 0 | 44/44 (100.00%) | 21/21 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/source-config-list/react/components/SourceConfigTrustOptions.tsx | LOADED | 0 | 17/17 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/source-config-list/react/hooks/useSourceConfigAddForm.ts | LOADED | 0 | 50/50 (100.00%) | 21/21 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/source-config-list/react/hooks/useSourceConfigList.ts | LOADED | 0 | 126/126 (100.00%) | 47/47 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/source-config-list/rules.ts | LOADED | 0 | 117/117 (100.00%) | 56/56 (100.00%) | 14/14 (100.00%) |
| packages/ui/src/features/tab-launcher-menu/constants.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/tab-launcher-menu/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/tab-launcher-menu/react/components/TabLauncherActionRow.tsx | LOADED | 0 | 13/13 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/tab-launcher-menu/react/components/TabLauncherMenu.tsx | LOADED | 0 | 114/114 (100.00%) | 31/31 (100.00%) | 7/7 (100.00%) |
| packages/ui/src/features/tab-launcher-menu/react/components/TabLauncherResultRow.tsx | LOADED | 0 | 27/27 (100.00%) | 11/11 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/tab-launcher-menu/react/hooks/useTabLauncherMenu.ts | LOADED | 0 | 109/109 (100.00%) | 42/42 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/tab-launcher-menu/rules.ts | LOADED | 0 | 60/60 (100.00%) | 30/30 (100.00%) | 8/8 (100.00%) |
| packages/ui/src/features/tab-strip/constants.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/tab-strip/dependencies.ts | LOADED | 0 | 11/11 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/tab-strip/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/tab-strip/ports.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/tab-strip/react/components/TabBar.hooks.tsx | LOADED | 0 | 63/63 (100.00%) | 60/60 (100.00%) | 9/9 (100.00%) |
| packages/ui/src/features/tab-strip/react/components/TabBar.tsx | LOADED | 0 | 64/64 (100.00%) | 26/26 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/tab-strip/react/components/TabStrip.tsx | LOADED | 0 | 49/49 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/tab-strip/react/components/TabStripFrame.tsx | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/tab-strip/react/components/TabStripItem.tsx | LOADED | 0 | 65/65 (100.00%) | 20/20 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/tab-strip/react/hooks/useTabStripDragReorder.ts | LOADED | 0 | 126/126 (100.00%) | 44/44 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/features/tab-strip/rules.ts | LOADED | 0 | 64/64 (100.00%) | 49/49 (100.00%) | 9/9 (100.00%) |
| packages/ui/src/features/tabbed-dialog/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/tabbed-dialog/react/components/TabbedDialog.tsx | LOADED | 0 | 68/68 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/tabbed-dialog/react/components/TabbedDialogChrome.tsx | LOADED | 0 | 36/36 (100.00%) | 9/9 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/tabbed-dialog/react/components/TabbedDialogHeader.tsx | LOADED | 0 | 19/19 (100.00%) | 10/10 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/tabbed-dialog/react/components/TabbedDialogSidebar.tsx | LOADED | 0 | 60/60 (100.00%) | 20/20 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/tabbed-dialog/react/components/tabbedDialogView.ts | LOADED | 0 | 49/49 (100.00%) | 17/17 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/tabbed-dialog/react/hooks/useTabbedDialog.ts | LOADED | 0 | 39/39 (100.00%) | 14/14 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/tabbed-dialog/rules.ts | LOADED | 0 | 16/16 (100.00%) | 12/12 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/version-manager/constants.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/version-manager/dependencies.ts | LOADED | 0 | 38/38 (100.00%) | 15/15 (100.00%) | 8/8 (100.00%) |
| packages/ui/src/features/version-manager/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/version-manager/react/components/VersionManagerModal.tsx | LOADED | 0 | 174/174 (100.00%) | 43/43 (100.00%) | 11/11 (100.00%) |
| packages/ui/src/features/version-manager/react/components/VersionPreviewFrame.tsx | LOADED | 0 | 47/47 (100.00%) | 13/13 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/version-manager/react/components/VersionPromptPopover.tsx | LOADED | 0 | 40/40 (100.00%) | 15/15 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/version-manager/react/components/VersionRestoreControl.tsx | LOADED | 0 | 42/42 (100.00%) | 14/14 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/version-manager/react/components/VersionSidebar.tsx | LOADED | 0 | 91/91 (100.00%) | 25/25 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/version-manager/react/hooks/usePreviewCanvasSize.ts | LOADED | 0 | 25/25 (100.00%) | 9/9 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/version-manager/react/hooks/useVersionManager.ts | LOADED | 0 | 256/256 (100.00%) | 87/87 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/features/version-manager/rules.ts | LOADED | 0 | 131/131 (100.00%) | 67/67 (100.00%) | 15/15 (100.00%) |
| packages/ui/src/features/viewer-shell/constants.ts | LOADED | 0 | 7/7 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/viewer-shell/dependencies.ts | LOADED | 0 | 11/11 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/features/viewer-shell/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/features/viewer-shell/react/components/AudioViewerBody.tsx | LOADED | 0 | 9/9 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/viewer-shell/react/components/CodeWithLines.tsx | LOADED | 0 | 12/12 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/viewer-shell/react/components/CommentSideDock.tsx | LOADED | 0 | 7/7 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/viewer-shell/react/components/CommentSidePanel.tsx | LOADED | 0 | 392/392 (100.00%) | 100/100 (100.00%) | 27/27 (100.00%) |
| packages/ui/src/features/viewer-shell/react/components/ImageViewerBody.tsx | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/viewer-shell/react/components/JsonPanel.tsx | LOADED | 0 | 5/5 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/viewer-shell/react/components/MarkdownSplitPane.tsx | LOADED | 0 | 159/159 (100.00%) | 23/23 (100.00%) | 7/7 (100.00%) |
| packages/ui/src/features/viewer-shell/react/components/SegmentedToggle.tsx | LOADED | 0 | 28/28 (100.00%) | 10/10 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/viewer-shell/react/components/SvgSourcePane.tsx | LOADED | 0 | 7/7 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/viewer-shell/react/components/VideoViewerBody.tsx | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/viewer-shell/react/components/ViewerFileActions.tsx | LOADED | 0 | 18/18 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/viewer-shell/react/components/ViewerShell.tsx | LOADED | 0 | 14/14 (100.00%) | 8/8 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/viewer-shell/react/components/ViewportSwitcher.tsx | LOADED | 0 | 51/51 (100.00%) | 24/24 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/features/viewer-shell/react/components/ViewportToggleGroup.tsx | LOADED | 0 | 16/16 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/viewer-shell/react/hooks/useCommentReorder.ts | LOADED | 0 | 61/61 (100.00%) | 40/40 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/features/viewer-shell/react/hooks/useCopyToClipboard.ts | LOADED | 0 | 30/30 (100.00%) | 9/9 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/features/viewer-shell/react/hooks/useMarkdownScrollSync.ts | LOADED | 0 | 127/127 (100.00%) | 59/59 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/viewer-shell/rules.ts | LOADED | 0 | 166/166 (100.00%) | 108/108 (100.00%) | 19/19 (100.00%) |
| packages/ui/src/icon-name.ts | LOADED | 0 | 16/16 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/react/components/AgentIcon.tsx | LOADED | 0 | 81/81 (100.00%) | 12/12 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/react/components/AppChromeHeader.tsx | LOADED | 0 | 55/55 (100.00%) | 12/12 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/react/components/BrandLogo.tsx | LOADED | 0 | 90/90 (100.00%) | 40/40 (100.00%) | 9/9 (100.00%) |
| packages/ui/src/react/components/CompactToggle.tsx | LOADED | 0 | 28/28 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/react/components/ComponentKitPreview.tsx | LOADED | 0 | 79/79 (100.00%) | 10/10 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/react/components/CustomSelect.tsx | LOADED | 0 | 365/365 (100.00%) | 136/136 (100.00%) | 29/29 (100.00%) |
| packages/ui/src/react/components/EdgeScrollZones.tsx | LOADED | 0 | 31/31 (100.00%) | 9/9 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/react/components/EditorIcon.tsx | LOADED | 0 | 129/129 (100.00%) | 11/11 (100.00%) | 8/8 (100.00%) |
| packages/ui/src/react/components/ExportDiagnosticsButton.tsx | LOADED | 0 | 127/127 (100.00%) | 51/52 (98.08%) | 10/10 (100.00%) |
| packages/ui/src/react/components/FileImportPanel.tsx | LOADED | 0 | 44/44 (100.00%) | 12/12 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/react/components/HeaderActionsMenu.tsx | LOADED | 0 | 119/119 (100.00%) | 47/47 (100.00%) | 16/16 (100.00%) |
| packages/ui/src/react/components/Icon.tsx | LOADED | 0 | 567/567 (100.00%) | 101/101 (100.00%) | 98/98 (100.00%) |
| packages/ui/src/react/components/ImportChoice.tsx | LOADED | 0 | 20/20 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/react/components/KitErrorBoundary.tsx | LOADED | 0 | 35/35 (100.00%) | 10/10 (100.00%) | 8/8 (100.00%) |
| packages/ui/src/react/components/LanguageMenu.tsx | LOADED | 0 | 119/119 (100.00%) | 46/46 (100.00%) | 14/14 (100.00%) |
| packages/ui/src/react/components/Loading.tsx | LOADED | 0 | 33/33 (100.00%) | 10/10 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/react/components/Notice.tsx | LOADED | 0 | 33/33 (100.00%) | 13/13 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/react/components/OnboardingChipField.tsx | LOADED | 0 | 33/33 (100.00%) | 15/15 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/react/components/OnboardingDropdown.tsx | LOADED | 0 | 333/333 (100.00%) | 93/93 (100.00%) | 23/23 (100.00%) |
| packages/ui/src/react/components/OnboardingPanelHeader.tsx | LOADED | 0 | 8/8 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/react/components/OptionCards.tsx | LOADED | 0 | 26/26 (100.00%) | 7/7 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/react/components/PaletteTweaks.tsx | LOADED | 0 | 128/128 (100.00%) | 44/44 (100.00%) | 14/14 (100.00%) |
| packages/ui/src/react/components/PillButton.tsx | LOADED | 0 | 28/28 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/react/components/PopoverItem.tsx | LOADED | 0 | 15/15 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/react/components/PopoverMenu.tsx | LOADED | 0 | 4/4 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/react/components/remixicon-font-recovery.ts | LOADED | 0 | 78/78 (100.00%) | 42/42 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/react/components/RemixIcon.tsx | LOADED | 0 | 21/21 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/react/components/select-popover.ts | LOADED | 0 | 138/138 (100.00%) | 112/112 (100.00%) | 18/18 (100.00%) |
| packages/ui/src/react/components/StatCard.tsx | LOADED | 0 | 8/8 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/react/components/Toast.tsx | LOADED | 0 | 135/135 (100.00%) | 44/44 (100.00%) | 12/12 (100.00%) |
| packages/ui/src/react/components/ToggleRow.tsx | LOADED | 0 | 30/30 (100.00%) | 8/8 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/react/components/TokenChip.tsx | LOADED | 0 | 11/11 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/react/components/TooltipLayer.tsx | LOADED | 0 | 265/265 (100.00%) | 118/118 (100.00%) | 16/16 (100.00%) |
| packages/ui/src/react/components/ValueChip.tsx | LOADED | 0 | 10/10 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/react/components/WorkingDirPicker.tsx | LOADED | 0 | 291/291 (100.00%) | 91/91 (100.00%) | 16/16 (100.00%) |
| packages/ui/src/react/hooks/useBrandFonts.ts | LOADED | 0 | 66/66 (100.00%) | 32/32 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/react/hooks/useCoalescedCallback.ts | LOADED | 0 | 43/43 (100.00%) | 15/15 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/react/hooks/useDebouncedValue.ts | LOADED | 0 | 17/17 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/react/hooks/useEdgeAutoScroll.ts | LOADED | 0 | 66/66 (100.00%) | 24/24 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/react/hooks/useInView.ts | LOADED | 0 | 36/36 (100.00%) | 15/15 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/react/hooks/useResizableSplitPane.ts | LOADED | 0 | 249/249 (100.00%) | 92/92 (100.00%) | 13/13 (100.00%) |
| packages/ui/src/react/hooks/useStableHandler.ts | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/react/mcp-ui/host-message-source.ts | LOADED | 0 | 11/11 (100.00%) | 3/4 (75.00%) | 2/2 (100.00%) |
| packages/ui/src/react/mcp-ui/index.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/react/mcp-ui/mcp-ui-host-frame.ts | LOADED | 0 | 18/18 (100.00%) | 10/10 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/react/mcp-ui/McpUiHost.tsx | LOADED | 0 | 23/23 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/react/mcp-ui/useMcpUiHost.ts | LOADED | 0 | 123/123 (100.00%) | 33/36 (91.67%) | 2/2 (100.00%) |
| packages/ui/src/renderers/annotation-canvas/dependencies.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/renderers/annotation-canvas/drawing.ts | LOADED | 0 | 150/150 (100.00%) | 38/38 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/renderers/annotation-canvas/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/renderers/annotation-canvas/react/components/AnnotationCanvas.tsx | LOADED | 0 | 323/323 (100.00%) | 106/106 (100.00%) | 32/32 (100.00%) |
| packages/ui/src/renderers/annotation-canvas/react/components/icons.tsx | LOADED | 0 | 75/75 (100.00%) | 15/15 (100.00%) | 15/15 (100.00%) |
| packages/ui/src/renderers/annotation-canvas/react/hooks/useAnnotationCanvas.controller.ts | LOADED | 0 | 97/97 (100.00%) | 65/65 (100.00%) | 12/12 (100.00%) |
| packages/ui/src/renderers/annotation-canvas/react/hooks/useAnnotationCanvas.ts | LOADED | 0 | 745/745 (100.00%) | 344/345 (99.71%) | 52/52 (100.00%) |
| packages/ui/src/renderers/annotation-canvas/rules.ts | LOADED | 0 | 145/145 (100.00%) | 61/61 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/renderers/annotation-canvas/theme.ts | LOADED | 0 | 15/15 (100.00%) | 14/14 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/renderers/html-utils.ts | LOADED | 0 | 28/28 (100.00%) | 18/18 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/renderers/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/renderers/new-tab-preview.ts | LOADED | 0 | 35/35 (100.00%) | 11/12 (91.67%) | 2/2 (100.00%) |
| packages/ui/src/renderers/preview-modal-shell/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/renderers/preview-modal-shell/react/components/icons.tsx | LOADED | 0 | 35/35 (100.00%) | 5/5 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/renderers/preview-modal-shell/react/components/PreviewModalShell.tsx | LOADED | 0 | 349/349 (100.00%) | 101/101 (100.00%) | 21/21 (100.00%) |
| packages/ui/src/renderers/preview-modal-shell/react/hooks/usePreviewModalShell.ts | LOADED | 0 | 142/142 (100.00%) | 49/49 (100.00%) | 8/8 (100.00%) |
| packages/ui/src/renderers/preview-modal-shell/rules.ts | LOADED | 0 | 38/38 (100.00%) | 30/30 (100.00%) | 5/5 (100.00%) |
| packages/ui/src/renderers/react/components/ArtifactView.tsx | LOADED | 0 | 38/38 (100.00%) | 18/18 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/renderers/react/components/SrcDocSandbox.tsx | LOADED | 0 | 25/25 (100.00%) | 9/9 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/renderers/react/i18n.tsx | LOADED | 0 | 27/27 (100.00%) | 15/15 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/renderers/registry.ts | LOADED | 0 | 21/21 (100.00%) | 14/14 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/renderers/renderers/html.ts | LOADED | 0 | 12/12 (100.00%) | 12/12 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/renderers/renderers/index.ts | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/renderers/renderers/markdown.ts | LOADED | 0 | 111/111 (100.00%) | 56/56 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/renderers/renderers/react-component.ts | LOADED | 0 | 10/10 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/renderers/renderers/svg.ts | LOADED | 0 | 11/11 (100.00%) | 10/10 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/renderers/sandbox-bridge.ts | LOADED | 0 | 28/28 (100.00%) | 16/16 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/renderers/sandbox-scripts.ts | LOADED | 0 | 22/22 (100.00%) | 14/14 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/renderers/sandboxed-document.ts | LOADED | 0 | 36/36 (100.00%) | 23/23 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/renderers/shiki.ts | LOADED | 0 | 46/46 (100.00%) | 21/21 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/renderers/srcdoc/bridge.ts | LOADED | 0 | 13/13 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/renderers/srcdoc/build.ts | LOADED | 0 | 113/113 (100.00%) | 74/74 (100.00%) | 15/15 (100.00%) |
| packages/ui/src/renderers/srcdoc/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/renderers/url-load-decision.ts | LOADED | 0 | 30/30 (100.00%) | 32/32 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/theme/apply.ts | LOADED | 0 | 50/50 (100.00%) | 38/38 (100.00%) | 4/4 (100.00%) |
| packages/ui/src/theme/color-scheme.ts | LOADED | 0 | 6/6 (100.00%) | 4/5 (80.00%) | 1/1 (100.00%) |
| packages/ui/src/theme/default.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/theme/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/theme/stylesheet.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/theme/validation.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/utils/appearance.ts | LOADED | 0 | 17/17 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/utils/auto-open-file.ts | LOADED | 0 | 84/84 (100.00%) | 59/59 (100.00%) | 15/15 (100.00%) |
| packages/ui/src/utils/browser-request.ts | LOADED | 0 | 8/8 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/utils/color-math.ts | LOADED | 0 | 41/41 (100.00%) | 21/21 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/utils/copy-to-clipboard.ts | LOADED | 0 | 40/40 (100.00%) | 16/16 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/utils/design-md.ts | LOADED | 0 | 78/78 (100.00%) | 34/34 (100.00%) | 6/6 (100.00%) |
| packages/ui/src/utils/dom-subscriptions.ts | LOADED | 0 | 63/63 (100.00%) | 41/41 (100.00%) | 11/11 (100.00%) |
| packages/ui/src/utils/endpoint-policy.ts | LOADED | 0 | 15/15 (100.00%) | 12/12 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/utils/file-system-errors.ts | LOADED | 0 | 22/22 (100.00%) | 14/14 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/utils/file-transfer.ts | LOADED | 0 | 93/93 (100.00%) | 87/87 (100.00%) | 10/10 (100.00%) |
| packages/ui/src/utils/ime-composing.ts | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/utils/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/ui/src/utils/localized-url.ts | LOADED | 0 | 5/5 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/utils/markdown-scroll-sync.ts | LOADED | 0 | 193/193 (100.00%) | 78/78 (100.00%) | 16/16 (100.00%) |
| packages/ui/src/utils/notifications.ts | LOADED | 0 | 177/177 (100.00%) | 76/76 (100.00%) | 20/20 (100.00%) |
| packages/ui/src/utils/platform.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/utils/polygon-selection.ts | LOADED | 0 | 64/64 (100.00%) | 37/37 (100.00%) | 9/9 (100.00%) |
| packages/ui/src/utils/scroll-tabs-with-wheel.ts | LOADED | 0 | 18/18 (100.00%) | 14/14 (100.00%) | 2/2 (100.00%) |
| packages/ui/src/utils/smooth-scroll-to-top.ts | LOADED | 0 | 71/71 (100.00%) | 28/29 (96.55%) | 9/9 (100.00%) |
| packages/ui/src/utils/sse.ts | LOADED | 0 | 27/27 (100.00%) | 20/20 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/utils/timezone.ts | LOADED | 0 | 35/35 (100.00%) | 15/15 (100.00%) | 3/3 (100.00%) |
| packages/ui/src/utils/uuid.ts | LOADED | 0 | 17/17 (100.00%) | 11/11 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/utils/visual-stability.ts | LOADED | 0 | 11/11 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/utils/zip.ts | LOADED | 0 | 108/108 (100.00%) | 15/15 (100.00%) | 3/3 (100.00%) |
| packages/user-management/src/admin/adapters/http.ts | LOADED | 0 | 65/65 (100.00%) | 54/64 (84.38%) | 38/38 (100.00%) |
| packages/user-management/src/admin/adapters/memory.ts | LOADED | 0 | 134/134 (100.00%) | 197/197 (100.00%) | 57/57 (100.00%) |
| packages/user-management/src/admin/auth.module.ts | LOADED | 0 | 8/8 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/user-management/src/admin/controllers/auth.controller.ts | LOADED | 0 | 20/20 (100.00%) | 12/14 (85.71%) | 5/5 (100.00%) |
| packages/user-management/src/admin/controllers/controller-store.ts | LOADED | 0 | 15/15 (100.00%) | 15/15 (100.00%) | 6/6 (100.00%) |
| packages/user-management/src/admin/controllers/roles.controller.ts | LOADED | 0 | 251/251 (100.00%) | 183/184 (99.46%) | 37/37 (100.00%) |
| packages/user-management/src/admin/controllers/users.controller.ts | LOADED | 0 | 159/159 (100.00%) | 152/153 (99.35%) | 31/31 (100.00%) |
| packages/user-management/src/admin/error-copy.ts | LOADED | 0 | 6/6 (100.00%) | 10/10 (100.00%) | 2/2 (100.00%) |
| packages/user-management/src/admin/members.module.ts | LOADED | 0 | 9/9 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/user-management/src/admin/messages.en.ts | LOADED | 0 | 20/20 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/user-management/src/admin/people.rules.ts | LOADED | 0 | 40/40 (100.00%) | 42/42 (100.00%) | 9/9 (100.00%) |
| packages/user-management/src/admin/ports.ts | LOADED | 0 | 15/15 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| packages/user-management/src/admin/react/components/DestructiveDialog.tsx | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/components/MemberRow.tsx | LOADED | 0 | 13/13 (100.00%) | 18/18 (100.00%) | 2/2 (100.00%) |
| packages/user-management/src/admin/react/components/MembersConfirmation.tsx | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/components/PermissionPanel.tsx | LOADED | 0 | 13/13 (100.00%) | 8/10 (80.00%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/components/PolicyRow.tsx | LOADED | 0 | 11/11 (100.00%) | 5/8 (62.50%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/components/RoleRow.tsx | LOADED | 0 | 9/9 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/components/UserRow.tsx | LOADED | 0 | 12/12 (100.00%) | 9/12 (75.00%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/components/UsersConfirmation.tsx | LOADED | 0 | 11/11 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/hooks/AuthBinding.hooks.ts | LOADED | 0 | 11/11 (100.00%) | 5/6 (83.33%) | 2/2 (100.00%) |
| packages/user-management/src/admin/react/hooks/AuthScope.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 1/2 (50.00%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/hooks/LoginPage.hooks.ts | LOADED | 0 | 17/17 (100.00%) | 13/16 (81.25%) | 6/7 (85.71%) |
| packages/user-management/src/admin/react/hooks/MembersBinding.hooks.ts | LOADED | 0 | 11/11 (100.00%) | 5/6 (83.33%) | 2/2 (100.00%) |
| packages/user-management/src/admin/react/hooks/MembersPage.hooks.ts | LOADED | 0 | 31/31 (100.00%) | 29/29 (100.00%) | 12/12 (100.00%) |
| packages/user-management/src/admin/react/hooks/MembersScope.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 1/2 (50.00%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/hooks/PeopleController.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 14/14 (100.00%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/hooks/PermissionPanel.hooks.ts | LOADED | 0 | 18/18 (100.00%) | 9/10 (90.00%) | 5/5 (100.00%) |
| packages/user-management/src/admin/react/hooks/PoliciesTab.hooks.ts | LOADED | 0 | 31/31 (100.00%) | 27/27 (100.00%) | 13/13 (100.00%) |
| packages/user-management/src/admin/react/hooks/RolesBinding.hooks.ts | LOADED | 0 | 15/15 (100.00%) | 6/7 (85.71%) | 2/2 (100.00%) |
| packages/user-management/src/admin/react/hooks/RolesController.hooks.ts | LOADED | 0 | 18/18 (100.00%) | 14/14 (100.00%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/hooks/RolesPage.hooks.ts | LOADED | 0 | 41/41 (100.00%) | 35/35 (100.00%) | 9/9 (100.00%) |
| packages/user-management/src/admin/react/hooks/RolesScope.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 1/2 (50.00%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/hooks/RolesTab.hooks.ts | LOADED | 0 | 22/22 (100.00%) | 13/14 (92.86%) | 8/9 (88.89%) |
| packages/user-management/src/admin/react/hooks/UsersBinding.hooks.ts | LOADED | 0 | 11/11 (100.00%) | 5/6 (83.33%) | 2/2 (100.00%) |
| packages/user-management/src/admin/react/hooks/UsersPage.hooks.ts | LOADED | 0 | 16/16 (100.00%) | 12/15 (80.00%) | 4/5 (80.00%) |
| packages/user-management/src/admin/react/hooks/UsersScope.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 1/2 (50.00%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/hooks/UsersTab.hooks.ts | LOADED | 0 | 59/59 (100.00%) | 46/46 (100.00%) | 30/30 (100.00%) |
| packages/user-management/src/admin/react/index.ts | LOADED | 0 | 18/18 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| packages/user-management/src/admin/react/pages/LoginPage.tsx | LOADED | 0 | 7/7 (100.00%) | 3/4 (75.00%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/pages/MembersPage.tsx | LOADED | 0 | 11/11 (100.00%) | 8/10 (80.00%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/pages/RolesPage.tsx | LOADED | 0 | 25/25 (100.00%) | 19/19 (100.00%) | 2/2 (100.00%) |
| packages/user-management/src/admin/react/pages/UsersPage.tsx | LOADED | 0 | 19/19 (100.00%) | 20/20 (100.00%) | 2/2 (100.00%) |
| packages/user-management/src/admin/react/tabs/AuthTab.tsx | LOADED | 0 | 7/7 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/tabs/MembersTab.tsx | LOADED | 0 | 6/6 (100.00%) | 2/3 (66.67%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/tabs/PoliciesTab.tsx | LOADED | 0 | 14/14 (100.00%) | 6/7 (85.71%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/tabs/RolesTab.tsx | LOADED | 0 | 13/13 (100.00%) | 6/7 (85.71%) | 1/1 (100.00%) |
| packages/user-management/src/admin/react/tabs/UsersTab.tsx | LOADED | 0 | 16/16 (100.00%) | 7/9 (77.78%) | 1/1 (100.00%) |
| packages/user-management/src/admin/roles.module.ts | LOADED | 0 | 9/9 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/user-management/src/admin/rules.ts | LOADED | 0 | 33/33 (100.00%) | 22/22 (100.00%) | 5/5 (100.00%) |
| packages/user-management/src/admin/users.module.ts | LOADED | 0 | 10/10 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/user-management/src/core/builtin-permissions.ts | LOADED | 0 | 354/354 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/user-management/src/core/index.ts | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/user-management/src/core/permissions.ts | LOADED | 0 | 29/29 (100.00%) | 11/11 (100.00%) | 8/8 (100.00%) |
| packages/user-management/src/core/principal-kind-policy.ts | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/user-management/src/core/types.ts | LOADED | 0 | 53/53 (100.00%) | 13/13 (100.00%) | 12/12 (100.00%) |
| packages/user-management/src/react/auth/hooks/use-login.hooks.ts | LOADED | 0 | 21/21 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| packages/user-management/src/react/auth/Login.tsx | LOADED | 0 | 22/22 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| packages/user-management/src/react/errors.ts | LOADED | 0 | 16/16 (100.00%) | 20/20 (100.00%) | 3/3 (100.00%) |
| packages/user-management/src/react/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/user-management/src/react/members/hooks/use-members.hooks.ts | LOADED | 0 | 115/115 (100.00%) | 58/58 (100.00%) | 16/16 (100.00%) |
| packages/user-management/src/react/members/rules.ts | LOADED | 0 | 33/33 (100.00%) | 6/8 (75.00%) | 5/5 (100.00%) |
| packages/user-management/src/react/users/ChangeUsernameDialog.tsx | LOADED | 0 | 15/15 (100.00%) | 5/6 (83.33%) | 4/4 (100.00%) |
| packages/user-management/src/react/users/hooks/use-change-username.hooks.ts | LOADED | 0 | 32/32 (100.00%) | 18/18 (100.00%) | 5/5 (100.00%) |
| packages/user-management/src/react/users/hooks/use-reset-password-fields.hooks.ts | LOADED | 0 | 20/20 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| packages/user-management/src/react/users/hooks/use-users.hooks.ts | LOADED | 0 | 331/331 (100.00%) | 158/158 (100.00%) | 40/40 (100.00%) |
| packages/user-management/src/react/users/rules.ts | LOADED | 0 | 95/95 (100.00%) | 46/49 (93.88%) | 11/12 (91.67%) |
| packages/user-management/src/react/users/UserRowParts.tsx | LOADED | 0 | 48/48 (100.00%) | 19/19 (100.00%) | 6/6 (100.00%) |
| packages/user-management/src/react/users/Users.tsx | LOADED | 0 | 561/561 (100.00%) | 106/106 (100.00%) | 29/29 (100.00%) |
| packages/user-management/src/server/admin-crud-service.ts | LOADED | 0 | 394/394 (100.00%) | 174/174 (100.00%) | 22/22 (100.00%) |
| packages/user-management/src/server/agent-tool-input.ts | LOADED | 0 | 94/94 (100.00%) | 80/80 (100.00%) | 13/13 (100.00%) |
| packages/user-management/src/server/agent-tools.ts | LOADED | 0 | 237/237 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/user-management/src/server/auth-service.ts | LOADED | 0 | 104/104 (100.00%) | 47/47 (100.00%) | 9/9 (100.00%) |
| packages/user-management/src/server/hasher.ts | LOADED | 0 | 40/40 (100.00%) | 8/8 (100.00%) | 7/7 (100.00%) |
| packages/user-management/src/server/identity-transaction.ts | LOADED | 0 | 6/6 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/user-management/src/server/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/user-management/src/server/messages.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/user-management/src/server/password-policy.ts | LOADED | 0 | 11/11 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| packages/user-management/src/server/permission-migrations.ts | LOADED | 0 | 54/54 (100.00%) | 26/26 (100.00%) | 6/6 (100.00%) |
| packages/user-management/src/server/repo.memory.ts | LOADED | 0 | 174/174 (100.00%) | 82/84 (97.62%) | 48/48 (100.00%) |
| packages/user-management/src/server/seed.ts | LOADED | 0 | 279/279 (100.00%) | 64/64 (100.00%) | 10/10 (100.00%) |
| packages/user-management/src/server/session-tokens.ts | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| packages/user-management/src/server/username.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/vibecoding/src/core/apply.ts | LOADED | 0 | 39/39 (100.00%) | 12/12 (100.00%) | 1/1 (100.00%) |
| packages/vibecoding/src/core/history.ts | LOADED | 0 | 103/103 (100.00%) | 43/43 (100.00%) | 12/16 (75.00%) |
| packages/vibecoding/src/core/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/vibecoding/src/html/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/vibecoding/src/html/node/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/vibecoding/src/html/node/parse5-region-parser.ts | LOADED | 0 | 109/109 (100.00%) | 48/48 (100.00%) | 7/7 (100.00%) |
| packages/vibecoding/src/index.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/vibecoding/src/react/components/DocumentPreview.tsx | LOADED | 0 | 17/17 (100.00%) | 1/2 (50.00%) | 0/0 (100.00%) |
| packages/vibecoding/src/react/components/PartsViewer.tsx | LOADED | 0 | 76/76 (100.00%) | 13/13 (100.00%) | 1/1 (100.00%) |
| packages/vibecoding/src/react/components/VibecodingWorkbench.tsx | LOADED | 0 | 86/86 (100.00%) | 18/19 (94.74%) | 0/0 (100.00%) |
| packages/vibecoding/src/react/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/vibecoding/src/react/session.ts | LOADED | 0 | 123/123 (100.00%) | 37/39 (94.87%) | 12/12 (100.00%) |
| packages/vibecoding/src/react/tools.ts | LOADED | 0 | 164/164 (100.00%) | 32/32 (100.00%) | 10/10 (100.00%) |
| packages/vibecoding/src/react/use-vibecoding-session.ts | LOADED | 0 | 18/18 (100.00%) | 6/6 (100.00%) | 0/0 (100.00%) |

## Full never-loaded list

- packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts
- packages/chat/src/embed-widget/vanilla/index.ts
- packages/chat/src/react/hooks/assistant-chats.ts
- packages/devops/src/checks/hardwiring.ts
- packages/chat/src/react/components/Markdown.tsx
- packages/agent-plugins/core/persistent-state.js
- packages/chat/src/react/components/QuestionForm.tsx
- packages/chat/src/react/components/Composer.tsx
- packages/chat/src/store/runtime/durable-run-store.ts
- packages/devops/src/static-export/runner.ts
- packages/chat/src/react/components/ToolCard.tsx
- packages/devops/src/packaging/electron/staging.ts
- packages/agent-runtime/src/skills/web-clone/scripts/asset-harvest.mjs
- packages/agent-runtime/src/skills/web-clone/scripts/interaction-probe.mjs
- packages/agent-runtime/src/skills/web-clone/scripts/audit-clone.mjs
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneRuntimeInventory.hooks.ts
- packages/agent-runtime/src/providers/connection-test.ts
- packages/chat/src/react/hooks/composer-draft-cache.ts
- packages/chat/src/react/hooks/useComposer.ts
- packages/agent-runtime/src/skills/web-clone/scripts/recon-site.mjs
- packages/chat/src/react/features/chat-pane/components/ChatPane.tsx
- packages/chat/src/server/durable-runs/recover.ts
- packages/agent-runtime/src/skills/web-clone/scripts/compare-recon.mjs
- packages/chat/src/store/sql/store.ts
- packages/devops/src/checks/published-types/index.ts
- packages/chat/src/react/components/A2uiSurfaceCard.tsx
- packages/agent-runtime/src/skills/web-clone/scripts/route-crawl.mjs
- packages/oauth/tests/helpers.ts
- packages/devops/src/checks/hardwiring-node.ts
- packages/agent-runtime/src/skills/web-clone/scripts/visual-diff.mjs
- packages/chat/src/react/features/chat-pane/hooks/useAgentRuntimePicker.hooks.ts
- packages/devops/src/source-control/registry.ts
- packages/chat/src/react/agent-bridge/frontend-session-bridge.ts
- packages/chat/src/store/runtime/history-tools.ts
- packages/chat/src/react/components/MessageRow.tsx
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneAgentControl.hooks.ts
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneWorkingDirectory.hooks.ts
- packages/devops/src/static-export/transforms.ts
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/BubbleScene.tsx
- packages/agent-runtime/src/skills/web-clone/scripts/od-preview-rewrite.mjs
- packages/chat/src/embed-widget/transports/fetch-sse.ts
- packages/chat/src/react/components/ConversationList.tsx
- packages/chat/src/react/features/chat-pane/rules.ts
- packages/chat/src/react/hooks/useConversation.ts
- packages/chat/src/react/features/chat-pane/create-daemon-attachment-uploader.ts
- packages/chat/src/react/hooks/fab-position.ts
- packages/chat/src/react/hooks/useRunStream.ts
- packages/agent-runtime/src/skills/web-clone/scripts/dna-scaffold.mjs
- packages/chat/src/store/legacy/sqlite/messages.ts
- packages/chat/src/react/components/AttachmentPreviewModal.hooks.ts
- packages/chat/src/server/run-finalizer/entry.ts
- packages/chat/src/store/runtime/run-ledger.ts
- packages/agent-runtime/src/skills/web-clone/scripts/mirror-site.mjs
- packages/chat/src/react/hooks/useComposerHistory.hooks.ts
- packages/chat/src/embed-widget/browser/lazy-loader.ts
- packages/chat/src/embed-widget/vanilla/state.ts
- packages/agent-runtime/src/skills/web-clone/scripts/sourcemap-hunt.mjs
- packages/devops/src/agent-jobs/jobs.ts
- packages/agent-runtime/src/skills/web-clone/scripts/network-capture.mjs
- packages/chat/src/react/features/chat-pane/hooks/useRuntimeDropUp.hooks.ts
- packages/devops/src/static-export/node-adapters.ts
- packages/core/plugin-directory.js
- packages/chat/src/react/features/chat-pane/components/AgentRuntimePicker.tsx
- packages/chat/src/react/hooks/useComposerHistoryKeys.hooks.ts
- packages/chat/src/react/components/McpUiSurfaceCard.tsx
- packages/chat/src/embed-widget/react/embed.tsx
- packages/chat/src/react/message-blocks.ts
- packages/chat/src/store/legacy/sqlite/conversations.ts
- packages/chat/src/react/components/composer-discovery.ts
- packages/chat/src/react/index.ts
- packages/devops/src/source-control/commit.ts
- packages/devops/src/packaging/electron/archive.ts
- packages/devops/src/local-dev/index.ts
- packages/chat/src/react/components/MessageList.hooks.ts
- packages/chat/src/react/features/chat-pane/model-options.ts
- packages/chat/src/react/hooks/useQuestionForms.ts
- packages/ui/vitest.setup.ts
- packages/chat/src/embed-widget/browser/session-store.ts
- packages/chat/src/react/hooks/useChatFabDrag.ts
- packages/chat/src/react/tool-call-display.ts
- packages/agent-runtime/src/skills/web-clone/scripts/init-clone.mjs
- packages/chat/src/store/sql/cursor.ts
- packages/chat/src/react/hooks/useCopyToClipboard.ts
- packages/devops/src/packaging/electron/imports.ts
- packages/devops/src/packaging/electron/policies.ts
- packages/chat/src/react/features/chat-pane/create-mcp-ui-tool-caller.ts
- packages/chat/src/embed-widget/react/dialog.hooks.ts
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneFileDrop.hooks.ts
- packages/cms/scripts/check-packaging.mjs
- packages/chat/src/react/hooks/context.ts
- packages/chat/src/react/hooks/last-conversation-store.ts
- packages/chat/src/react/components/ChatSettingsDialog.tsx
- packages/chat/src/react/hooks/useExtEventGroups.ts
- packages/devops/src/agent-jobs/node.ts
- packages/chat/src/react/components/ConversationTitleEditor.tsx
- packages/chat/src/react/ext-event-renderer-registry.ts
- packages/chat/src/react/features/chat-pane/components/AgentPluginUsage.tsx
- packages/chat/src/react/components/MessageRow.usage.ts
- packages/chat/src/store/runtime/chat-expiry-sweep.ts
- packages/devops/src/packaging/electron/node.ts
- packages/chat/src/react/hooks/useLatestOperation.ts
- packages/chat/src/react/components/MessageList.tsx
- packages/chat/src/react/components/MidRunUserMessage.tsx
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneComposerPlaceholder.hooks.ts
- packages/chat/src/store/runtime/chat-history-store.ts
- packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/data-table.tsx
- packages/chat/src/react/features/chat-pane/components/RuntimeDropUp.tsx
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneNewTabLinks.hooks.ts
- packages/chat/src/react/hooks/useRunActivity.ts
- packages/chat/src/react/components/AttachmentPreviewModal.tsx
- packages/chat/src/react/hooks/testing/fake-transport.ts
- packages/chat/src/react/hooks/useAnsweredCards.ts
- packages/devops/src/checks/node.ts
- packages/chat/src/react/components/SentAttachment.hooks.ts
- packages/chat/src/react/features/chat-pane/create-mid-run-message-poster.ts
- packages/chat/src/react/hooks/useToolTimeline.ts
- packages/chat/src/react/components/TodoCard.tsx
- packages/chat/src/react/hooks/composer-history-storage.ts
- packages/chat/src/react/hooks/useArtifactStream.ts
- packages/agent-runtime/src/skills/web-clone/scripts/lib/playwright-loader.mjs
- packages/chat/src/react/components/AttachmentTray.tsx
- packages/chat/src/react/components/ComposerDiscovery.tsx
- packages/chat/src/react/components/mcp-ui-surface-state.ts
- packages/chat/src/react/features/chat-pane/create-typed-answer-poster.ts
- packages/chat/src/react/hooks/usePinnedTodos.ts
- packages/chat/src/embed-widget/react/header.hooks.ts
- packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/form-pattern.tsx
- packages/chat/src/react/components/JiniChatProvider.tsx
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneControlsHeight.hooks.ts
- packages/db/src/testing/transfer-pg-test-db.ts
- packages/devops/src/source-control/repository-target.ts
- packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/auth-layout.tsx
- packages/chat/src/react/tool-renderer-registry.ts
- packages/chat/src/store/sql/boundary.ts
- packages/chat/src/store/sqlite/index.ts
- packages/db/src/testing/postgres-database.ts
- packages/chat/src/react/components/ChatSettingsDialog.hooks.ts
- packages/chat/src/react/hooks/useSurfaceExpiry.ts
- packages/chat/src/react/hooks/useUserTextGuard.ts
- packages/chat/src/store/runtime/run-guarded-chat-store.ts
- packages/chat/src/react/components/MessageList.rules.ts
- packages/chat/src/react/features/chat-pane/index.ts
- packages/oauth/tests/fixtures.ts
- packages/oauth/tests/integration-contract.types.ts
- packages/chat/src/react/components/attachment-size.ts
- packages/chat/src/react/components/AttachmentGallery.rules.ts
- packages/chat/src/react/components/QuestionsPanel.tsx
- packages/chat/src/react/hooks/attachment-preview-cache.ts
- packages/chat/vitest.setup.ts
- packages/oauth/tests/args-convention.types.ts
- packages/devops/src/packaging/electron/typescript.ts
- packages/chat/src/react/artifact-types.ts
- packages/chat/src/react/components/ConversationList.hooks.ts
- packages/chat/src/react/components/ToolCallGroup.hooks.ts
- packages/chat/src/server/durable-runs/accept.ts
- packages/chat/src/store/pglite/index.ts
- packages/chat/src/store/postgres/index.ts
- packages/db/src/testing/pg-fixture.ts
- packages/server/src/create-local-node-daemon.typecheck.ts
- packages/user-management/test-setup.ts
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/avatarLibrary.tsx
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/ChatMotionOverlay.tsx
- packages/chat/src/react/components/ExtEventErrorBoundary.tsx
- packages/chat/vitest.config.ts
- packages/core/src/compose.typecheck.ts
- packages/devops/src/packaging/electron/entry.ts
- packages/charts-recharts/vitest.setup.ts
- packages/chat/src/react/components/AttachmentGallery.hooks.ts
- packages/chat/src/react/components/ChatFab.tsx
- packages/chat/src/store/sql/maintenance.ts
- packages/daemon/vitest.config.ts
- packages/devops/src/core/export-failure-summary.ts
- packages/devops/src/packaging/electron/stability.ts
- packages/registry/vitest.config.ts
- packages/server/vitest.config.ts
- packages/sqlite/vitest.config.ts
- packages/chat/src/react/components/SentAttachment.tsx
- packages/chat/src/store/runtime/entry.ts
- packages/devops/src/core/deploy-types.ts
- packages/devops/src/core/redirect-guard.ts
- packages/devops/src/source-control/kit.ts
- packages/admin/vitest.setup.ts
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/remotion.config.ts
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/Root.tsx
- packages/chat/src/react/components/Icon.tsx
- packages/chat/src/react/components/NextStepActions.tsx
- packages/chat/src/react/components/ToolCallGroup.tsx
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneSuggestion.hooks.ts
- packages/chat/src/react/util/defined-props.ts
- packages/chat/vitest.postgres.config.ts
- packages/db/vitest.postgres.config.ts
- packages/devops/src/source-control/entry.ts
- packages/devops/src/static-export/entry.ts
- packages/oauth/tests/dispatcher-stub.ts
- packages/vibecoding/vitest.setup.ts
- packages/chat/src/embed-widget/react/header.tsx
- packages/chat/src/react/components/ConversationList.rules.ts
- packages/chat/src/store/errors.ts
- packages/agent-plugins/vitest.config.ts
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/DeviceFrame.tsx
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/index.ts
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneSurface.hooks.ts
- packages/chat/src/server/durable-runs/entry.ts
- packages/chat/src/store/legacy/sqlite/index.ts
- packages/chat/src/store/sqlite/schema.ts
- packages/daemon/vitest.postgres.config.ts
- packages/devops/src/agent-jobs/entry.ts
- packages/ui/vitest.config.ts
- packages/admin/vitest.config.ts
- packages/agent-runtime/vitest.config.ts
- packages/agentic/vitest.config.ts
- packages/analytics/vitest.config.ts
- packages/capability-providers/vitest.config.ts
- packages/charts-recharts/vitest.config.ts
- packages/chat/src/react/features/chat-pane/agent-tools.ts
- packages/chat/src/testing/index.ts
- packages/cli/vitest.config.ts
- packages/cms/forms/vitest.config.ts
- packages/cms/vitest.config.ts
- packages/commerce/vitest.config.ts
- packages/core/vitest.config.ts
- packages/db/src/testing/content-schema.ts
- packages/db/src/testing/sqlite-snapshot-client.ts
- packages/db/vitest.config.ts
- packages/desktop-host/vitest.config.ts
- packages/devops/src/packaging/electron/asar-adapter.ts
- packages/devops/src/static-export/contracts.ts
- packages/devops/src/static-export/fetch-adapter.ts
- packages/devops/vitest.config.ts
- packages/diagnostics/vitest.config.ts
- packages/diagnostics/vitest.port.config.ts
- packages/http-kit/vitest.config.ts
- packages/infra/vitest.config.ts
- packages/integrations/vitest.config.ts
- packages/mcp/vitest.config.ts
- packages/memory/vitest.config.ts
- packages/oauth/vitest.config.ts
- packages/platform/vitest.config.ts
- packages/protocol/vitest.config.ts
- packages/sandbox/vitest.config.ts
- packages/sidecar/vitest.config.ts
- packages/ui-kit/vitest.config.ts
- packages/user-management/vitest.config.ts
- packages/vibecoding/vitest.config.ts
- packages/agent-plugins/persistent-state.js
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/chatSpec.ts
- packages/chat/src/contracts/chat-bubble-style.ts
- packages/chat/src/embed-widget/browser/page-actions.ts
- packages/chat/src/react/chat-pane.ts
- packages/chat/src/react/features/chat-pane/styles.ts
- packages/chat/src/store/contracts/index.ts
- packages/chat/src/store/index.ts
- packages/chat/src/store/legacy/sqlite/schema.ts
- packages/devops/src/static-export/failure-summary.ts

## Unmatched coverage records

- /tmp/cov/j-charts-recharts/coverage-final.json: /home/user/Jini/packages/charts-recharts/plugin/client/provider.js

## Coverage records excluded from denominator

- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/agent-plugins/models.ts → packages/admin/src/agent-plugins/models.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/comments/models.ts → packages/admin/src/comments/models.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/data-table/types.ts → packages/admin/src/core/data-table/types.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/gated/types.ts → packages/admin/src/core/gated/types.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/manifest/types.ts → packages/admin/src/core/manifest/types.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/module/types.ts → packages/admin/src/core/module/types.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/analytics.ts → packages/admin/src/core/ports/analytics.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/auth.ts → packages/admin/src/core/ports/auth.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/comments.ts → packages/admin/src/core/ports/comments.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/database.ts → packages/admin/src/core/ports/database.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/entities.ts → packages/admin/src/core/ports/entities.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/forms.ts → packages/admin/src/core/ports/forms.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/identity.ts → packages/admin/src/core/ports/identity.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/index.ts → packages/admin/src/core/ports/index.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/integrations.ts → packages/admin/src/core/ports/integrations.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/media.ts → packages/admin/src/core/ports/media.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/members.ts → packages/admin/src/core/ports/members.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/menus.ts → packages/admin/src/core/ports/menus.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/plugins.ts → packages/admin/src/core/ports/plugins.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/recovery.ts → packages/admin/src/core/ports/recovery.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/redirects.ts → packages/admin/src/core/ports/redirects.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/seo.ts → packages/admin/src/core/ports/seo.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/settings.ts → packages/admin/src/core/ports/settings.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/shell.ts → packages/admin/src/core/ports/shell.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/ports/workspace.ts → packages/admin/src/core/ports/workspace.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/routing/types.ts → packages/admin/src/core/routing/types.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/core/transport/types.ts → packages/admin/src/core/transport/types.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/media/models.ts → packages/admin/src/media/models.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/playground/models.ts → packages/admin/src/playground/models.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/playground/ports.ts → packages/admin/src/playground/ports.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/react/shell/theme-ports.ts → packages/admin/src/react/shell/theme-ports.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/react/shell/types.ts → packages/admin/src/react/shell/types.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/redirects/models.ts → packages/admin/src/redirects/models.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/security/models.ts → packages/admin/src/security/models.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/seo/react/options.ts → packages/admin/src/seo/react/options.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/source-control/models.ts → packages/admin/src/source-control/models.ts
- /tmp/cov/j-admin/coverage-final.json: /home/user/Jini/packages/admin/src/widgets/models.ts → packages/admin/src/widgets/models.ts
- /tmp/cov/j-agent-plugins/coverage-final.json: /home/user/Jini/packages/agent-plugins/src/lifecycle/ports.ts → packages/agent-plugins/src/lifecycle/ports.ts
- /tmp/cov/j-agent-plugins/coverage-final.json: /home/user/Jini/packages/agent-plugins/src/lifecycle/types.ts → packages/agent-plugins/src/lifecycle/types.ts
- /tmp/cov/j-agent-runtime/coverage-final.json: /home/user/Jini/packages/agent-runtime/src/model-discovery-types.ts → packages/agent-runtime/src/model-discovery-types.ts
- /tmp/cov/j-agent-runtime/coverage-final.json: /home/user/Jini/packages/agent-runtime/src/providers/tool-turn-types.ts → packages/agent-runtime/src/providers/tool-turn-types.ts
- /tmp/cov/j-agentic/coverage-final.json: /home/user/Jini/packages/agentic/src/core/page-driver.ts → packages/agentic/src/core/page-driver.ts
- /tmp/cov/j-agentic/coverage-final.json: /home/user/Jini/packages/agentic/src/core/a2ui/__tests__/fixture-ports.ts → packages/agentic/src/core/a2ui/__tests__/fixture-ports.ts
- /tmp/cov/j-agentic/coverage-final.json: /home/user/Jini/packages/agentic/src/core/gen-ui/events.ts → packages/agentic/src/core/gen-ui/events.ts
- /tmp/cov/j-agentic/coverage-final.json: /home/user/Jini/packages/agentic/src/core/site-guide/types.ts → packages/agentic/src/core/site-guide/types.ts
- /tmp/cov/j-agentic/coverage-final.json: /home/user/Jini/packages/agentic/src/skills/install/ports.ts → packages/agentic/src/skills/install/ports.ts
- /tmp/cov/j-analytics/coverage-final.json: /home/user/Jini/packages/analytics/src/types.ts → packages/analytics/src/types.ts
- /tmp/cov/j-capability-providers/coverage-final.json: /home/user/Jini/packages/capability-providers/src/auth.ts → packages/capability-providers/src/auth.ts
- /tmp/cov/j-capability-providers/coverage-final.json: /home/user/Jini/packages/capability-providers/src/db.ts → packages/capability-providers/src/db.ts
- /tmp/cov/j-capability-providers/coverage-final.json: /home/user/Jini/packages/capability-providers/src/payments.ts → packages/capability-providers/src/payments.ts
- /tmp/cov/j-capability-providers/coverage-final.json: /home/user/Jini/packages/capability-providers/src/realtime.ts → packages/capability-providers/src/realtime.ts
- /tmp/cov/j-capability-providers/coverage-final.json: /home/user/Jini/packages/capability-providers/src/storage.ts → packages/capability-providers/src/storage.ts
- /tmp/cov/j-capability-providers/coverage-final.json: /home/user/Jini/packages/capability-providers/src/visitor-auth/ports.ts → packages/capability-providers/src/visitor-auth/ports.ts
- /tmp/cov/j-chat/coverage-final.json: /home/user/Jini/packages/chat/src/core/events.ts → packages/chat/src/core/events.ts
- /tmp/cov/j-chat/coverage-final.json: /home/user/Jini/packages/chat/src/core/transport.ts → packages/chat/src/core/transport.ts
- /tmp/cov/j-chat/coverage-final.json: /home/user/Jini/packages/chat/src/core/durable-runs/ledger-contracts.ts → packages/chat/src/core/durable-runs/ledger-contracts.ts
- /tmp/cov/j-chat/coverage-final.json: /home/user/Jini/packages/chat/src/core/durable-runs/ports.ts → packages/chat/src/core/durable-runs/ports.ts
- /tmp/cov/j-chat/coverage-final.json: /home/user/Jini/packages/chat/src/core/durable-runs/run-contracts.ts → packages/chat/src/core/durable-runs/run-contracts.ts
- /tmp/cov/j-chat/coverage-final.json: /home/user/Jini/packages/chat/src/core/persistence/ports.ts → packages/chat/src/core/persistence/ports.ts
- /tmp/cov/j-chat/coverage-final.json: /home/user/Jini/packages/chat/src/core/question-form/types.ts → packages/chat/src/core/question-form/types.ts
- /tmp/cov/j-chat/coverage-final.json: /home/user/Jini/packages/chat/src/core/run-events/__tests__/fixture.ts → packages/chat/src/core/run-events/__tests__/fixture.ts
- /tmp/cov/j-chat/coverage-final.json: /home/user/Jini/packages/chat/src/core/util/types.ts → packages/chat/src/core/util/types.ts
- /tmp/cov/j-cms-forms/coverage-final.json: /home/user/Jini/packages/cms/forms/src/ports.ts → packages/cms/forms/src/ports.ts
- /tmp/cov/j-cms-forms/coverage-final.json: /home/user/Jini/packages/cms/forms/src/types.ts → packages/cms/forms/src/types.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/comments/ports.ts → packages/cms/src/comments/ports.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/core/authorization.ts → packages/cms/src/core/authorization.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/core/ports.ts → packages/cms/src/core/ports.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/core/commands/change-set.ts → packages/cms/src/core/commands/change-set.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/entries/types.ts → packages/cms/src/entries/types.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/forms/ports.ts → packages/cms/src/forms/ports.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/forms/sql/tables.ts → packages/cms/src/forms/sql/tables.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/media/ports.ts → packages/cms/src/media/ports.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/media/import/ports.ts → packages/cms/src/media/import/ports.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/navigation/ports.ts → packages/cms/src/navigation/ports.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/redirects/ports.ts → packages/cms/src/redirects/ports.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/redirects/sql/row-types.ts → packages/cms/src/redirects/sql/row-types.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/routing/ports.ts → packages/cms/src/routing/ports.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/routing/types.ts → packages/cms/src/routing/types.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/seo/ports.ts → packages/cms/src/seo/ports.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/seo/types.ts → packages/cms/src/seo/types.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/trash/ports.ts → packages/cms/src/trash/ports.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/widgets/host-ports.ts → packages/cms/src/widgets/host-ports.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/widgets/ports.ts → packages/cms/src/widgets/ports.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/widgets/resolvers/ports.ts → packages/cms/src/widgets/resolvers/ports.ts
- /tmp/cov/j-cms/coverage-final.json: /home/user/Jini/packages/cms/src/widgets/sql/tables.ts → packages/cms/src/widgets/sql/tables.ts
- /tmp/cov/j-commerce/coverage-final.json: /home/user/Jini/packages/commerce/src/catalog/contracts.ts → packages/commerce/src/catalog/contracts.ts
- /tmp/cov/j-commerce/coverage-final.json: /home/user/Jini/packages/commerce/src/catalog/database.ts → packages/commerce/src/catalog/database.ts
- /tmp/cov/j-commerce/coverage-final.json: /home/user/Jini/packages/commerce/src/catalog/ports.ts → packages/commerce/src/catalog/ports.ts
- /tmp/cov/j-commerce/coverage-final.json: /home/user/Jini/packages/commerce/src/catalog/types.ts → packages/commerce/src/catalog/types.ts
- /tmp/cov/j-commerce/coverage-final.json: /home/user/Jini/packages/commerce/src/payments/ports.ts → packages/commerce/src/payments/ports.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/agent-tools.ts → packages/core/src/agent-tools.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/native-regexp.ts → packages/core/src/native-regexp.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/principal.ts → packages/core/src/principal.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/provider-catalog.ts → packages/core/src/provider-catalog.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/tool-metadata-types.ts → packages/core/src/tool-metadata-types.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/__tests__/fixtures/legacy-redactors.ts → packages/core/src/__tests__/fixtures/legacy-redactors.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/__tests__/fixtures/legacy-secret-shapes.ts → packages/core/src/__tests__/fixtures/legacy-secret-shapes.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/fetch/types.ts → packages/core/src/fetch/types.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/gated-mutations/ports.ts → packages/core/src/gated-mutations/ports.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/primitives/http.ts → packages/core/src/primitives/http.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/primitives/json.ts → packages/core/src/primitives/json.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/primitives/result.ts → packages/core/src/primitives/result.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/settings/ports.ts → packages/core/src/settings/ports.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/settings/principal-lookup.ts → packages/core/src/settings/principal-lookup.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/settings/__tests__/principal-lookup.typecheck.ts → packages/core/src/settings/__tests__/principal-lookup.typecheck.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/settings/__tests__/principal.fixture.ts → packages/core/src/settings/__tests__/principal.fixture.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/settings/__tests__/write-tool-fixture.ts → packages/core/src/settings/__tests__/write-tool-fixture.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/settings/express/contracts.ts → packages/core/src/settings/express/contracts.ts
- /tmp/cov/j-core/coverage-final.json: /home/user/Jini/packages/core/src/settings/express/__tests__/settings-fixture.ts → packages/core/src/settings/express/__tests__/settings-fixture.ts
- /tmp/cov/j-daemon/coverage-final.json: /home/user/Jini/packages/daemon/src/__tests__/audit-fixture.ts → packages/daemon/src/__tests__/audit-fixture.ts
- /tmp/cov/j-daemon/coverage-final.json: /home/user/Jini/packages/daemon/src/__tests__/catalog-fixture.ts → packages/daemon/src/__tests__/catalog-fixture.ts
- /tmp/cov/j-daemon/coverage-final.json: /home/user/Jini/packages/daemon/src/__tests__/session-fixture.ts → packages/daemon/src/__tests__/session-fixture.ts
- /tmp/cov/j-daemon/coverage-final.json: /home/user/Jini/packages/daemon/src/__tests__/surface-fixture.ts → packages/daemon/src/__tests__/surface-fixture.ts
- /tmp/cov/j-daemon/coverage-final.json: /home/user/Jini/packages/daemon/src/agent-executor/__tests__/model-discovery-fixture.ts → packages/daemon/src/agent-executor/__tests__/model-discovery-fixture.ts
- /tmp/cov/j-daemon/coverage-final.json: /home/user/Jini/packages/daemon/src/routines/types.ts → packages/daemon/src/routines/types.ts
- /tmp/cov/j-daemon/coverage-final.json: /home/user/Jini/packages/daemon/src/run/core/failure-taxonomy.ts → packages/daemon/src/run/core/failure-taxonomy.ts
- /tmp/cov/j-daemon/coverage-final.json: /home/user/Jini/packages/daemon/src/store/agent-sessions/ports.ts → packages/daemon/src/store/agent-sessions/ports.ts
- /tmp/cov/j-daemon/coverage-final.json: /home/user/Jini/packages/daemon/src/store/agent-sessions/__tests__/contract.ts → packages/daemon/src/store/agent-sessions/__tests__/contract.ts
- /tmp/cov/j-daemon/coverage-final.json: /home/user/Jini/packages/daemon/src/store/agent-sessions/__tests__/fixtures.ts → packages/daemon/src/store/agent-sessions/__tests__/fixtures.ts
- /tmp/cov/j-daemon/coverage-final.json: /home/user/Jini/packages/daemon/src/store/agent-sessions/__tests__/packed-fixture.ts → packages/daemon/src/store/agent-sessions/__tests__/packed-fixture.ts
- /tmp/cov/j-daemon/coverage-final.json: /home/user/Jini/packages/daemon/src/store/agent-sessions/__tests__/sql-contract.ts → packages/daemon/src/store/agent-sessions/__tests__/sql-contract.ts
- /tmp/cov/j-db/coverage-final.json: /home/user/Jini/packages/db/src/core/ports.ts → packages/db/src/core/ports.ts
- /tmp/cov/j-db/coverage-final.json: /home/user/Jini/packages/db/src/core/transfer-naming.ts → packages/db/src/core/transfer-naming.ts
- /tmp/cov/j-db/coverage-final.json: /home/user/Jini/packages/db/src/pglite/types.ts → packages/db/src/pglite/types.ts
- /tmp/cov/j-db/coverage-final.json: /home/user/Jini/packages/db/src/recovery/hook-policy.ts → packages/db/src/recovery/hook-policy.ts
- /tmp/cov/j-db/coverage-final.json: /home/user/Jini/packages/db/src/sqlite/restore-types.ts → packages/db/src/sqlite/restore-types.ts
- /tmp/cov/j-db/coverage-final.json: /home/user/Jini/packages/db/src/sqlite/sync-types.ts → packages/db/src/sqlite/sync-types.ts
- /tmp/cov/j-db/coverage-final.json: /home/user/Jini/packages/db/src/sqlite/types.ts → packages/db/src/sqlite/types.ts
- /tmp/cov/j-db/coverage-final.json: /home/user/Jini/packages/db/src/tools/destination-port.ts → packages/db/src/tools/destination-port.ts
- /tmp/cov/j-db/coverage-final.json: /home/user/Jini/packages/db/src/tools/surface-port.ts → packages/db/src/tools/surface-port.ts
- /tmp/cov/j-db/coverage-final.json: /home/user/Jini/packages/db/src/transfer/types.ts → packages/db/src/transfer/types.ts
- /tmp/cov/j-desktop-host/coverage-final.json: /home/user/Jini/packages/desktop-host/src/ports.ts → packages/desktop-host/src/ports.ts
- /tmp/cov/j-desktop-host/coverage-final.json: /home/user/Jini/packages/desktop-host/src/__tests__/node-ports.ts → packages/desktop-host/src/__tests__/node-ports.ts
- /tmp/cov/j-desktop-host/coverage-final.json: /home/user/Jini/packages/desktop-host/src/electron/electron-surfaces.ts → packages/desktop-host/src/electron/electron-surfaces.ts
- /tmp/cov/j-desktop-host/coverage-final.json: /home/user/Jini/packages/desktop-host/src/tauri/tauri-surfaces.ts → packages/desktop-host/src/tauri/tauri-surfaces.ts
- /tmp/cov/j-devops/coverage-final.json: /home/user/Jini/packages/devops/src/deploy/host-kit.ts → packages/devops/src/deploy/host-kit.ts
- /tmp/cov/j-diagnostics/coverage-final.json: /home/user/Jini/packages/diagnostics/src/ports.ts → packages/diagnostics/src/ports.ts
- /tmp/cov/j-diagnostics/coverage-final.json: /home/user/Jini/packages/diagnostics/src/types.ts → packages/diagnostics/src/types.ts
- /tmp/cov/j-diagnostics/coverage-final.json: /home/user/Jini/packages/diagnostics/src/__tests__/l170-filesystem.fake.ts → packages/diagnostics/src/__tests__/l170-filesystem.fake.ts
- /tmp/cov/j-diagnostics/coverage-final.json: /home/user/Jini/packages/diagnostics/src/__tests__/observability-fakes.ts → packages/diagnostics/src/__tests__/observability-fakes.ts
- /tmp/cov/j-diagnostics/coverage-final.json: /home/user/Jini/packages/diagnostics/src/observability/ports.ts → packages/diagnostics/src/observability/ports.ts
- /tmp/cov/j-diagnostics/coverage-final.json: /home/user/Jini/packages/diagnostics/src/web-evidence/browser-port.ts → packages/diagnostics/src/web-evidence/browser-port.ts
- /tmp/cov/j-diagnostics/coverage-final.json: /home/user/Jini/packages/diagnostics/src/web-evidence/__tests__/web-evidence-playwright.port-check.ts → packages/diagnostics/src/web-evidence/__tests__/web-evidence-playwright.port-check.ts
- /tmp/cov/j-http-kit/coverage-final.json: /home/user/Jini/packages/http-kit/src/verified-origin/ports.ts → packages/http-kit/src/verified-origin/ports.ts
- /tmp/cov/j-infra/coverage-final.json: /home/user/Jini/packages/infra/src/db/core/index.ts → packages/infra/src/db/core/index.ts
- /tmp/cov/j-infra/coverage-final.json: /home/user/Jini/packages/infra/src/events/outbox/ports.ts → packages/infra/src/events/outbox/ports.ts
- /tmp/cov/j-integrations/coverage-final.json: /home/user/Jini/packages/integrations/src/api-connections/ports.ts → packages/integrations/src/api-connections/ports.ts
- /tmp/cov/j-integrations/coverage-final.json: /home/user/Jini/packages/integrations/src/api-connections/types.ts → packages/integrations/src/api-connections/types.ts
- /tmp/cov/j-integrations/coverage-final.json: /home/user/Jini/packages/integrations/src/credentialed-http/ports.ts → packages/integrations/src/credentialed-http/ports.ts
- /tmp/cov/j-integrations/coverage-final.json: /home/user/Jini/packages/integrations/src/webhooks/ports.ts → packages/integrations/src/webhooks/ports.ts
- /tmp/cov/j-integrations/coverage-final.json: /home/user/Jini/packages/integrations/src/webhooks/types.ts → packages/integrations/src/webhooks/types.ts
- /tmp/cov/j-mcp/coverage-final.json: /home/user/Jini/packages/mcp/src/__tests__/args-fixtures.ts → packages/mcp/src/__tests__/args-fixtures.ts
- /tmp/cov/j-mcp/coverage-final.json: /home/user/Jini/packages/mcp/src/federation/__tests__/fixtures.ts → packages/mcp/src/federation/__tests__/fixtures.ts
- /tmp/cov/j-mcp/coverage-final.json: /home/user/Jini/packages/mcp/src/federation/approvals/ports.ts → packages/mcp/src/federation/approvals/ports.ts
- /tmp/cov/j-mcp/coverage-final.json: /home/user/Jini/packages/mcp/src/server/ports.ts → packages/mcp/src/server/ports.ts
- /tmp/cov/j-mcp/coverage-final.json: /home/user/Jini/packages/mcp/src/tools/ask-choice/types.ts → packages/mcp/src/tools/ask-choice/types.ts
- /tmp/cov/j-mcp/coverage-final.json: /home/user/Jini/packages/mcp/src/tools/ask-choice/__tests__/fixtures.ts → packages/mcp/src/tools/ask-choice/__tests__/fixtures.ts
- /tmp/cov/j-oauth/coverage-final.json: /home/user/Jini/packages/oauth/src/args.ts → packages/oauth/src/args.ts
- /tmp/cov/j-oauth/coverage-final.json: /home/user/Jini/packages/oauth/src/ports.ts → packages/oauth/src/ports.ts
- /tmp/cov/j-platform/coverage-final.json: /home/user/Jini/packages/platform/src/http/guarded/ports.ts → packages/platform/src/http/guarded/ports.ts
- /tmp/cov/j-platform/coverage-final.json: /home/user/Jini/packages/platform/src/http/guarded/types.ts → packages/platform/src/http/guarded/types.ts
- /tmp/cov/j-platform/coverage-final.json: /home/user/Jini/packages/platform/src/mail/adapter-module.ts → packages/platform/src/mail/adapter-module.ts
- /tmp/cov/j-platform/coverage-final.json: /home/user/Jini/packages/platform/src/mail/ports.ts → packages/platform/src/mail/ports.ts
- /tmp/cov/j-platform/coverage-final.json: /home/user/Jini/packages/platform/src/mail/types.ts → packages/platform/src/mail/types.ts
- /tmp/cov/j-platform/coverage-final.json: /home/user/Jini/packages/platform/src/secrets/ports.ts → packages/platform/src/secrets/ports.ts
- /tmp/cov/j-platform/coverage-final.json: /home/user/Jini/packages/platform/src/secrets/types.ts → packages/platform/src/secrets/types.ts
- /tmp/cov/j-platform/coverage-final.json: /home/user/Jini/packages/platform/src/secrets/credential-sets/types.ts → packages/platform/src/secrets/credential-sets/types.ts
- /tmp/cov/j-plugins/coverage-final.json: /home/user/Jini/packages/plugins/src/glue/ports.ts → packages/plugins/src/glue/ports.ts
- /tmp/cov/j-plugins/coverage-final.json: /home/user/Jini/packages/plugins/src/host/discovery-types.ts → packages/plugins/src/host/discovery-types.ts
- /tmp/cov/j-plugins/coverage-final.json: /home/user/Jini/packages/plugins/src/host/manifest-types.ts → packages/plugins/src/host/manifest-types.ts
- /tmp/cov/j-plugins/coverage-final.json: /home/user/Jini/packages/plugins/src/host/ports.ts → packages/plugins/src/host/ports.ts
- /tmp/cov/j-protocol/coverage-final.json: /home/user/Jini/packages/protocol/src/agent-catalog.ts → packages/protocol/src/agent-catalog.ts
- /tmp/cov/j-protocol/coverage-final.json: /home/user/Jini/packages/protocol/src/common.ts → packages/protocol/src/common.ts
- /tmp/cov/j-protocol/coverage-final.json: /home/user/Jini/packages/protocol/src/event-log.ts → packages/protocol/src/event-log.ts
- /tmp/cov/j-protocol/coverage-final.json: /home/user/Jini/packages/protocol/src/journal.ts → packages/protocol/src/journal.ts
- /tmp/cov/j-protocol/coverage-final.json: /home/user/Jini/packages/protocol/src/json.ts → packages/protocol/src/json.ts
- /tmp/cov/j-registry/coverage-final.json: /home/user/Jini/packages/registry/src/ports.ts → packages/registry/src/ports.ts
- /tmp/cov/j-registry/coverage-final.json: /home/user/Jini/packages/registry/src/tool-catalog/index.ts → packages/registry/src/tool-catalog/index.ts
- /tmp/cov/j-registry/coverage-final.json: /home/user/Jini/packages/registry/src/tool-catalog-builder/ports.ts → packages/registry/src/tool-catalog-builder/ports.ts
- /tmp/cov/j-server/coverage-final.json: /home/user/Jini/packages/server/src/lifecycle/__tests__/boot-lifecycle.characterization.unit.test.ts → packages/server/src/lifecycle/__tests__/boot-lifecycle.characterization.unit.test.ts
- /tmp/cov/j-server/coverage-final.json: /home/user/Jini/packages/server/src/lifecycle/__tests__/boot-lifecycle.test.ts → packages/server/src/lifecycle/__tests__/boot-lifecycle.test.ts
- /tmp/cov/j-server/coverage-final.json: /home/user/Jini/packages/server/src/lifecycle/__tests__/readiness-state.test.ts → packages/server/src/lifecycle/__tests__/readiness-state.test.ts
- /tmp/cov/j-server/coverage-final.json: /home/user/Jini/packages/server/src/storage/__tests__/backend-config.characterization.unit.test.ts → packages/server/src/storage/__tests__/backend-config.characterization.unit.test.ts
- /tmp/cov/j-server/coverage-final.json: /home/user/Jini/packages/server/src/storage/__tests__/backend-config.test.ts → packages/server/src/storage/__tests__/backend-config.test.ts
- /tmp/cov/j-server/coverage-final.json: /home/user/Jini/packages/server/src/storage/__tests__/hardwiring-ports.test.ts → packages/server/src/storage/__tests__/hardwiring-ports.test.ts
- /tmp/cov/j-server/coverage-final.json: /home/user/Jini/packages/server/src/storage/__tests__/host-injection.test.ts → packages/server/src/storage/__tests__/host-injection.test.ts
- /tmp/cov/j-server/coverage-final.json: /home/user/Jini/packages/server/src/storage/__tests__/legacy-ownership.test.ts → packages/server/src/storage/__tests__/legacy-ownership.test.ts
- /tmp/cov/j-server/coverage-final.json: /home/user/Jini/packages/server/src/storage/__tests__/legacy-sqlite.test.ts → packages/server/src/storage/__tests__/legacy-sqlite.test.ts
- /tmp/cov/j-server/coverage-final.json: /home/user/Jini/packages/server/src/storage/__tests__/sqlite-ownership.test.ts → packages/server/src/storage/__tests__/sqlite-ownership.test.ts
- /tmp/cov/j-sidecar/coverage-final.json: /home/user/Jini/packages/sidecar/src/types.ts → packages/sidecar/src/types.ts
- /tmp/cov/j-ui-kit/coverage-final.json: /home/user/Jini/packages/ui-kit/src/attrs.ts → packages/ui-kit/src/attrs.ts
- /tmp/cov/j-ui-kit/coverage-final.json: /home/user/Jini/packages/ui-kit/src/react/types.ts → packages/ui-kit/src/react/types.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/core/theme/types.ts → packages/ui/src/core/theme/types.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/about/types.ts → packages/ui/src/features/about/types.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/appearance/types.ts → packages/ui/src/features/appearance/types.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/execution/ports.ts → packages/ui/src/features/execution/ports.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/execution/types.ts → packages/ui/src/features/execution/types.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/i18n/dictionaries/types.ts → packages/ui/src/features/i18n/dictionaries/types.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/integrations/ports.ts → packages/ui/src/features/integrations/ports.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/integrations/types.ts → packages/ui/src/features/integrations/types.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/interactive-ui/types.ts → packages/ui/src/features/interactive-ui/types.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/language/types.ts → packages/ui/src/features/language/types.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/media-providers/ports.ts → packages/ui/src/features/media-providers/ports.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/media-providers/types.ts → packages/ui/src/features/media-providers/types.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/notifications/types.ts → packages/ui/src/features/notifications/types.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/privacy/types.ts → packages/ui/src/features/privacy/types.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/project-locations/ports.ts → packages/ui/src/features/project-locations/ports.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/project-locations/types.ts → packages/ui/src/features/project-locations/types.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/skills/ports.ts → packages/ui/src/features/skills/ports.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/skills/types.ts → packages/ui/src/features/skills/types.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/features/tabbed-dialog/types.ts → packages/ui/src/features/tabbed-dialog/types.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/react/components/agent-icon-data-uris.generated.ts → packages/ui/src/react/components/agent-icon-data-uris.generated.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/renderers/annotation-canvas/ports.ts → packages/ui/src/renderers/annotation-canvas/ports.ts
- /tmp/cov/j-ui/coverage-final.json: /home/user/Jini/packages/ui/src/renderers/annotation-canvas/types.ts → packages/ui/src/renderers/annotation-canvas/types.ts
- /tmp/cov/j-user-management/coverage-final.json: /home/user/Jini/packages/user-management/src/admin/models.ts → packages/user-management/src/admin/models.ts
- /tmp/cov/j-user-management/coverage-final.json: /home/user/Jini/packages/user-management/src/core/ports.ts → packages/user-management/src/core/ports.ts
- /tmp/cov/j-user-management/coverage-final.json: /home/user/Jini/packages/user-management/src/core/runtime-ports.ts → packages/user-management/src/core/runtime-ports.ts
- /tmp/cov/j-user-management/coverage-final.json: /home/user/Jini/packages/user-management/src/react/models.ts → packages/user-management/src/react/models.ts
- /tmp/cov/j-user-management/coverage-final.json: /home/user/Jini/packages/user-management/src/react/ports.ts → packages/user-management/src/react/ports.ts
- /tmp/cov/j-vibecoding/coverage-final.json: /home/user/Jini/packages/vibecoding/src/core/target.ts → packages/vibecoding/src/core/target.ts
- /tmp/cov/j-vibecoding/coverage-final.json: /home/user/Jini/packages/vibecoding/src/core/types.ts → packages/vibecoding/src/core/types.ts
