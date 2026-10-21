# All-files coverage

| Metric | TRUE: all files | RUNNER: records only |
| --- | --- | --- |
| lines | 35148/111570 (31.50%) | 35148/37972 (92.56%) |
| branches | 16035/66436 (24.14%) | 16035/16491 (97.23%) |
| functions | 3822/23782 (16.07%) | 3822/3948 (96.81%) |

Never-loaded files: **2072** / 2705

- NEVER-LOADED denominators are AST estimates (distinct executable statement start lines, function bodies, branch arms).
- LCOV lacks columns: functions/branches merge by source line and ordinal; different instrumentation layouts may not correspond.
- LOADED means a coverage record exists, including zero-hit include records.

## Exclusions (first matching group)

| Group | Files | Up to 5 examples |
| --- | ---: | --- |
| non-source | 697 | packages/README.md, packages/admin/CHANGELOG.md, packages/admin/README.md, packages/admin/docs/spec/api.spec.md, packages/admin/docs/spec/behavior.spec.md |
| dependencies/build/output | 9 | packages/devops/src/checks/coverage/__tests__/coverage.test.ts, packages/devops/src/checks/coverage/__tests__/disk.test.ts, packages/devops/src/checks/coverage/__tests__/integrity.test.ts, packages/devops/src/checks/coverage/diff.ts, packages/devops/src/checks/coverage/disk.ts |
| test/fixture | 2789 | packages/admin/src/__tests__/fetch-query-support.ts, packages/admin/src/__tests__/fqfix-loading.unit.test.tsx, packages/admin/src/agent-plugins/__tests__/controllers.test.ts, packages/admin/src/agent-plugins/__tests__/http.test.ts, packages/admin/src/agent-plugins/__tests__/package-file-tree.hwa.test.ts |
| declaration | 5 | packages/agent-plugins/core/persistent-state.d.ts, packages/agent-plugins/persistent-state.d.ts, packages/core/plugin-directory.d.ts, packages/ui/src/vitest-env.d.ts, packages/ui/src/vitest-jest-dom.d.ts |
| generated | 1 | packages/ui/src/react/components/agent-icon-data-uris.generated.ts |
| type-only | 247 | packages/admin/src/agent-plugins/models.ts, packages/admin/src/comments/models.ts, packages/admin/src/core/data-table/types.ts, packages/admin/src/core/gated/types.ts, packages/admin/src/core/manifest/types.ts |

## Packages / top-level areas

| Area | Files | Never loaded | Lines | Branches | Functions |
| --- | ---: | ---: | --- | --- | --- |
| packages/admin | 337 | 337 | 0/7011 (0.00%) | 0/5106 (0.00%) | 0/2727 (0.00%) |
| packages/agent-plugins | 61 | 61 | 0/3238 (0.00%) | 0/2038 (0.00%) | 0/809 (0.00%) |
| packages/agent-runtime | 144 | 144 | 0/8593 (0.00%) | 0/6644 (0.00%) | 0/1840 (0.00%) |
| packages/agentic | 45 | 1 | 2814/2820 (99.79%) | 1444/1470 (98.23%) | 278/280 (99.29%) |
| packages/analytics | 6 | 1 | 325/331 (98.19%) | 188/189 (99.47%) | 33/35 (94.29%) |
| packages/artifacts | 10 | 10 | 0/390 (0.00%) | 0/270 (0.00%) | 0/84 (0.00%) |
| packages/capability-providers | 19 | 1 | 1095/1128 (97.07%) | 405/430 (94.19%) | 114/114 (100.00%) |
| packages/charts-recharts | 12 | 12 | 0/149 (0.00%) | 0/82 (0.00%) | 0/44 (0.00%) |
| packages/chat | 192 | 192 | 0/9009 (0.00%) | 0/6642 (0.00%) | 0/2446 (0.00%) |
| packages/cli | 17 | 1 | 1074/1076 (99.81%) | 664/668 (99.40%) | 123/123 (100.00%) |
| packages/cms | 254 | 246 | 523/9294 (5.63%) | 211/5879 (3.59%) | 43/2244 (1.92%) |
| packages/commerce | 24 | 1 | 168/1874 (8.96%) | 10/22 (45.45%) | 10/22 (45.45%) |
| packages/core | 90 | 3 | 4751/5027 (94.51%) | 2080/2214 (93.95%) | 437/472 (92.58%) |
| packages/daemon | 101 | 101 | 0/6102 (0.00%) | 0/3942 (0.00%) | 0/1477 (0.00%) |
| packages/db | 81 | 7 | 2969/3685 (80.57%) | 1235/1388 (88.98%) | 346/410 (84.39%) |
| packages/desktop-host | 63 | 1 | 2260/2272 (99.47%) | 1172/1197 (97.91%) | 382/391 (97.70%) |
| packages/devops | 41 | 41 | 0/1660 (0.00%) | 0/1264 (0.00%) | 0/470 (0.00%) |
| packages/diagnostics | 33 | 2 | 2373/2397 (99.00%) | 1333/1361 (97.94%) | 300/305 (98.36%) |
| packages/http-kit | 24 | 1 | 896/902 (99.33%) | 481/483 (99.59%) | 108/109 (99.08%) |
| packages/infra | 10 | 1 | 192/194 (98.97%) | 106/106 (100.00%) | 30/30 (100.00%) |
| packages/integrations | 77 | 1 | 5423/5437 (99.74%) | 2287/2298 (99.52%) | 495/495 (100.00%) |
| packages/mcp | 55 | 55 | 0/2175 (0.00%) | 0/1392 (0.00%) | 0/540 (0.00%) |
| packages/memory | 9 | 1 | 1109/1111 (99.82%) | 511/513 (99.61%) | 109/109 (100.00%) |
| packages/oauth | 38 | 38 | 0/1266 (0.00%) | 0/799 (0.00%) | 0/258 (0.00%) |
| packages/platform | 72 | 72 | 0/4448 (0.00%) | 0/3162 (0.00%) | 0/1115 (0.00%) |
| packages/plugins | 41 | 41 | 0/1746 (0.00%) | 0/1131 (0.00%) | 0/440 (0.00%) |
| packages/protocol | 7 | 1 | 260/262 (99.24%) | 53/53 (100.00%) | 8/8 (100.00%) |
| packages/registry | 14 | 1 | 1028/1036 (99.23%) | 590/592 (99.66%) | 121/123 (98.37%) |
| packages/sandbox | 11 | 1 | 437/444 (98.42%) | 195/199 (97.99%) | 43/43 (100.00%) |
| packages/server | 17 | 17 | 0/666 (0.00%) | 0/390 (0.00%) | 0/216 (0.00%) |
| packages/sidecar | 13 | 1 | 918/932 (98.50%) | 399/413 (96.61%) | 91/93 (97.85%) |
| packages/sqlite | 2 | 1 | 1/8 (12.50%) | 0/0 (100.00%) | 0/2 (0.00%) |
| packages/ui | 648 | 648 | 0/17598 (0.00%) | 0/10802 (0.00%) | 0/4929 (0.00%) |
| packages/ui-kit | 26 | 26 | 0/596 (0.00%) | 0/499 (0.00%) | 0/198 (0.00%) |
| packages/user-management | 94 | 2 | 5670/5823 (97.37%) | 2410/2528 (95.33%) | 698/723 (96.54%) |
| packages/vibecoding | 17 | 2 | 862/870 (99.08%) | 261/270 (96.67%) | 53/58 (91.38%) |

## Files (largest uncovered line gap first)

| File | Status | Uncovered lines | Lines | Branches | Functions |
| --- | --- | ---: | --- | --- | --- |
| packages/commerce/src/payments/lipay-plugin.ts | LOADED | 603 | 0/603 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/renderers/annotation-canvas/react/hooks/useAnnotationCanvas.ts | NEVER-LOADED | 507 | 0/507 (0.00%) | 0/244 (0.00%) | 0/112 (0.00%) |
| packages/platform/src/download.ts | NEVER-LOADED | 493 | 0/493 (0.00%) | 0/296 (0.00%) | 0/98 (0.00%) |
| packages/agent-runtime/src/json-event-stream.ts | NEVER-LOADED | 474 | 0/474 (0.00%) | 0/398 (0.00%) | 0/92 (0.00%) |
| packages/agent-runtime/src/agent-protocol/acp/session.ts | NEVER-LOADED | 463 | 0/463 (0.00%) | 0/334 (0.00%) | 0/72 (0.00%) |
| packages/daemon/src/agent-executor/events.ts | NEVER-LOADED | 429 | 0/429 (0.00%) | 0/274 (0.00%) | 0/116 (0.00%) |
| packages/agent-runtime/src/claude-stream.ts | NEVER-LOADED | 373 | 0/373 (0.00%) | 0/332 (0.00%) | 0/55 (0.00%) |
| packages/daemon/src/http/attachments.ts | NEVER-LOADED | 338 | 0/338 (0.00%) | 0/186 (0.00%) | 0/72 (0.00%) |
| packages/daemon/src/agent-executor/launch.ts | NEVER-LOADED | 323 | 0/323 (0.00%) | 0/278 (0.00%) | 0/66 (0.00%) |
| packages/daemon/src/run-lifecycle.ts | NEVER-LOADED | 319 | 0/319 (0.00%) | 0/156 (0.00%) | 0/62 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts | NEVER-LOADED | 318 | 0/318 (0.00%) | 0/224 (0.00%) | 0/52 (0.00%) |
| packages/cms/src/widgets/resolver-service.ts | NEVER-LOADED | 290 | 0/290 (0.00%) | 0/184 (0.00%) | 0/76 (0.00%) |
| packages/commerce/src/payments/providers/lipay-gateway.ts | LOADED | 263 | 0/263 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/plugins/src/host/node/install.ts | NEVER-LOADED | 257 | 0/257 (0.00%) | 0/188 (0.00%) | 0/67 (0.00%) |
| packages/cms/src/taxonomy/write-service.ts | NEVER-LOADED | 247 | 0/247 (0.00%) | 0/92 (0.00%) | 0/36 (0.00%) |
| packages/agent-runtime/src/model-discovery-adapters.ts | NEVER-LOADED | 243 | 0/243 (0.00%) | 0/258 (0.00%) | 0/79 (0.00%) |
| packages/chat/src/embed-widget/vanilla/index.ts | NEVER-LOADED | 243 | 0/243 (0.00%) | 0/112 (0.00%) | 0/44 (0.00%) |
| packages/commerce/src/catalog/repo.ts | LOADED | 233 | 0/233 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/hooks/assistant-chats.ts | NEVER-LOADED | 230 | 0/230 (0.00%) | 0/126 (0.00%) | 0/73 (0.00%) |
| packages/ui/src/features/memory/react/hooks/useMemoryConnectors.hooks.ts | NEVER-LOADED | 230 | 0/230 (0.00%) | 0/98 (0.00%) | 0/59 (0.00%) |
| packages/daemon/src/http/xai.ts | NEVER-LOADED | 228 | 0/228 (0.00%) | 0/142 (0.00%) | 0/50 (0.00%) |
| packages/daemon/src/agent-executor/mcp-bridge.ts | NEVER-LOADED | 224 | 0/224 (0.00%) | 0/174 (0.00%) | 0/48 (0.00%) |
| packages/ui/src/features/connectors/rules.ts | NEVER-LOADED | 222 | 0/222 (0.00%) | 0/202 (0.00%) | 0/50 (0.00%) |
| packages/devops/src/checks/hardwiring.ts | NEVER-LOADED | 220 | 0/220 (0.00%) | 0/252 (0.00%) | 0/58 (0.00%) |
| packages/agent-runtime/src/providers/openai-chat.ts | NEVER-LOADED | 218 | 0/218 (0.00%) | 0/152 (0.00%) | 0/34 (0.00%) |
| packages/chat/src/core/assistant-client/transport.ts | NEVER-LOADED | 218 | 0/218 (0.00%) | 0/174 (0.00%) | 0/73 (0.00%) |
| packages/chat/src/react/components/Markdown.tsx | NEVER-LOADED | 216 | 0/216 (0.00%) | 0/118 (0.00%) | 0/46 (0.00%) |
| packages/ui/src/features/execution/rules.ts | NEVER-LOADED | 213 | 0/213 (0.00%) | 0/200 (0.00%) | 0/58 (0.00%) |
| packages/daemon/src/http/connectors.ts | NEVER-LOADED | 209 | 0/209 (0.00%) | 0/172 (0.00%) | 0/55 (0.00%) |
| packages/plugins/src/host/node/source-drafts.ts | NEVER-LOADED | 207 | 0/207 (0.00%) | 0/138 (0.00%) | 0/60 (0.00%) |
| packages/cms/src/widgets/markers/marker.ts | NEVER-LOADED | 205 | 0/205 (0.00%) | 0/82 (0.00%) | 0/34 (0.00%) |
| packages/platform/src/web/web-page.ts | NEVER-LOADED | 205 | 0/205 (0.00%) | 0/190 (0.00%) | 0/38 (0.00%) |
| packages/cms/src/redirects/redirects.ts | NEVER-LOADED | 201 | 0/201 (0.00%) | 0/128 (0.00%) | 0/31 (0.00%) |
| packages/platform/src/fs/guarded-reader.ts | NEVER-LOADED | 200 | 0/200 (0.00%) | 0/116 (0.00%) | 0/34 (0.00%) |
| packages/agent-plugins/core/persistent-state.js | NEVER-LOADED | 198 | 0/198 (0.00%) | 0/108 (0.00%) | 0/32 (0.00%) |
| packages/cms/src/media/video-frames.ffmpeg.ts | NEVER-LOADED | 198 | 0/198 (0.00%) | 0/102 (0.00%) | 0/47 (0.00%) |
| packages/agent-plugins/src/lifecycle/activation.ts | NEVER-LOADED | 196 | 0/196 (0.00%) | 0/112 (0.00%) | 0/59 (0.00%) |
| packages/agent-plugins/src/lifecycle/install.ts | NEVER-LOADED | 195 | 0/195 (0.00%) | 0/74 (0.00%) | 0/24 (0.00%) |
| packages/agent-runtime/src/agent-protocol/core/json-line-stream.ts | NEVER-LOADED | 195 | 0/195 (0.00%) | 0/134 (0.00%) | 0/35 (0.00%) |
| packages/agent-runtime/src/providers/model-catalog.ts | NEVER-LOADED | 195 | 0/195 (0.00%) | 0/178 (0.00%) | 0/35 (0.00%) |
| packages/agent-runtime/src/providers/anthropic-messages.ts | NEVER-LOADED | 193 | 0/193 (0.00%) | 0/134 (0.00%) | 0/31 (0.00%) |
| packages/agent-runtime/src/providers/google-messages.ts | NEVER-LOADED | 193 | 0/193 (0.00%) | 0/144 (0.00%) | 0/29 (0.00%) |
| packages/platform/src/terminal.ts | NEVER-LOADED | 193 | 0/193 (0.00%) | 0/92 (0.00%) | 0/35 (0.00%) |
| packages/mcp/src/federation/trust.ts | NEVER-LOADED | 192 | 0/192 (0.00%) | 0/126 (0.00%) | 0/37 (0.00%) |
| packages/chat/src/react/components/QuestionForm.tsx | NEVER-LOADED | 189 | 0/189 (0.00%) | 0/206 (0.00%) | 0/88 (0.00%) |
| packages/cms/src/navigation/menu-service.ts | NEVER-LOADED | 188 | 0/188 (0.00%) | 0/116 (0.00%) | 0/32 (0.00%) |
| packages/chat/src/react/components/Composer.tsx | NEVER-LOADED | 187 | 0/187 (0.00%) | 0/176 (0.00%) | 0/53 (0.00%) |
| packages/mcp/src/core/config.ts | NEVER-LOADED | 186 | 0/186 (0.00%) | 0/156 (0.00%) | 0/45 (0.00%) |
| packages/agent-runtime/src/providers/ollama-chat.ts | NEVER-LOADED | 184 | 0/184 (0.00%) | 0/128 (0.00%) | 0/25 (0.00%) |
| packages/platform/src/fs/file-lock.ts | NEVER-LOADED | 184 | 0/184 (0.00%) | 0/158 (0.00%) | 0/50 (0.00%) |
| packages/chat/src/store/runtime/durable-run-store.ts | NEVER-LOADED | 181 | 0/181 (0.00%) | 0/186 (0.00%) | 0/72 (0.00%) |
| packages/daemon/src/tool-executor.ts | NEVER-LOADED | 178 | 0/178 (0.00%) | 0/104 (0.00%) | 0/36 (0.00%) |
| packages/cms/src/media/media-service.ts | NEVER-LOADED | 177 | 0/177 (0.00%) | 0/136 (0.00%) | 0/32 (0.00%) |
| packages/devops/src/static-export/runner.ts | NEVER-LOADED | 177 | 0/177 (0.00%) | 0/122 (0.00%) | 0/29 (0.00%) |
| packages/agent-runtime/src/providers/google-schema.ts | NEVER-LOADED | 175 | 0/175 (0.00%) | 0/116 (0.00%) | 0/43 (0.00%) |
| packages/mcp/src/federation/stdio/adapter.stdio.ts | NEVER-LOADED | 175 | 0/175 (0.00%) | 0/72 (0.00%) | 0/45 (0.00%) |
| packages/ui/src/react/components/TooltipLayer.tsx | NEVER-LOADED | 174 | 0/174 (0.00%) | 0/90 (0.00%) | 0/34 (0.00%) |
| packages/plugins/src/host/manifest.ts | NEVER-LOADED | 173 | 0/173 (0.00%) | 0/150 (0.00%) | 0/32 (0.00%) |
| packages/ui/src/features/memory/react/hooks/useMemoryEntries.hooks.ts | NEVER-LOADED | 173 | 0/173 (0.00%) | 0/62 (0.00%) | 0/21 (0.00%) |
| packages/platform/src/blob-storage.ts | NEVER-LOADED | 172 | 0/172 (0.00%) | 0/110 (0.00%) | 0/32 (0.00%) |
| packages/cms/src/widgets/embed-service.ts | NEVER-LOADED | 171 | 0/171 (0.00%) | 0/100 (0.00%) | 0/43 (0.00%) |
| packages/ui/src/features/html-editor/react/hooks/useInteractiveHtmlEditor.ts | NEVER-LOADED | 170 | 0/170 (0.00%) | 0/64 (0.00%) | 0/29 (0.00%) |
| packages/ui/src/features/sketch-editor/dom.ts | NEVER-LOADED | 170 | 0/170 (0.00%) | 0/114 (0.00%) | 0/32 (0.00%) |
| packages/chat/src/core/run-events/entry.ts | NEVER-LOADED | 169 | 0/169 (0.00%) | 0/153 (0.00%) | 0/40 (0.00%) |
| packages/admin/src/forms/field-settings.ts | NEVER-LOADED | 166 | 0/166 (0.00%) | 0/214 (0.00%) | 0/58 (0.00%) |
| packages/agent-plugins/src/lifecycle/manifest.ts | NEVER-LOADED | 166 | 0/166 (0.00%) | 0/178 (0.00%) | 0/44 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/rules.ts | NEVER-LOADED | 165 | 0/165 (0.00%) | 0/106 (0.00%) | 0/29 (0.00%) |
| packages/chat/src/react/components/ToolCard.tsx | NEVER-LOADED | 164 | 0/164 (0.00%) | 0/196 (0.00%) | 0/45 (0.00%) |
| packages/devops/src/packaging/electron/staging.ts | NEVER-LOADED | 164 | 0/164 (0.00%) | 0/120 (0.00%) | 0/51 (0.00%) |
| packages/ui/src/features/skills/react/hooks/useSkillsTab.ts | NEVER-LOADED | 164 | 0/164 (0.00%) | 0/70 (0.00%) | 0/52 (0.00%) |
| packages/ui/src/react/hooks/useResizableSplitPane.ts | NEVER-LOADED | 163 | 0/163 (0.00%) | 0/76 (0.00%) | 0/28 (0.00%) |
| packages/agent-runtime/src/model-discovery.ts | NEVER-LOADED | 161 | 0/161 (0.00%) | 0/150 (0.00%) | 0/46 (0.00%) |
| packages/ui/src/features/memory/formatters.ts | NEVER-LOADED | 161 | 0/161 (0.00%) | 0/158 (0.00%) | 0/34 (0.00%) |
| packages/platform/src/proxy-env.ts | NEVER-LOADED | 160 | 0/160 (0.00%) | 0/118 (0.00%) | 0/34 (0.00%) |
| packages/agent-runtime/src/agent-protocol/pi-rpc/session.ts | NEVER-LOADED | 159 | 0/159 (0.00%) | 0/110 (0.00%) | 0/26 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/asset-harvest.mjs | NEVER-LOADED | 159 | 0/159 (0.00%) | 0/162 (0.00%) | 0/25 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/interaction-probe.mjs | NEVER-LOADED | 158 | 0/158 (0.00%) | 0/108 (0.00%) | 0/33 (0.00%) |
| packages/platform/src/secrets/credential-sets/vault.service.ts | NEVER-LOADED | 158 | 0/158 (0.00%) | 0/172 (0.00%) | 0/38 (0.00%) |
| packages/agent-runtime/src/agent-protocol/acp/models.ts | NEVER-LOADED | 157 | 0/157 (0.00%) | 0/96 (0.00%) | 0/35 (0.00%) |
| packages/commerce/src/catalog/repo.rows.ts | LOADED | 157 | 0/157 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/audit-clone.mjs | NEVER-LOADED | 156 | 0/156 (0.00%) | 0/114 (0.00%) | 0/19 (0.00%) |
| packages/agent-runtime/src/detection.ts | NEVER-LOADED | 155 | 0/155 (0.00%) | 0/84 (0.00%) | 0/38 (0.00%) |
| packages/chat/src/core/question-form/scan.ts | NEVER-LOADED | 155 | 0/155 (0.00%) | 0/102 (0.00%) | 0/21 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneRuntimeInventory.hooks.ts | NEVER-LOADED | 153 | 0/153 (0.00%) | 0/52 (0.00%) | 0/36 (0.00%) |
| packages/ui/src/features/progress-card/reference-adapters.ts | NEVER-LOADED | 153 | 0/153 (0.00%) | 0/170 (0.00%) | 0/39 (0.00%) |
| packages/agent-runtime/src/providers/connection-test.ts | NEVER-LOADED | 149 | 0/149 (0.00%) | 0/132 (0.00%) | 0/28 (0.00%) |
| packages/platform/src/web/html-document.ts | NEVER-LOADED | 148 | 0/148 (0.00%) | 0/116 (0.00%) | 0/29 (0.00%) |
| packages/platform/src/asset-cache.ts | NEVER-LOADED | 147 | 0/147 (0.00%) | 0/86 (0.00%) | 0/21 (0.00%) |
| packages/daemon/src/tool-recovery/recovery.ts | NEVER-LOADED | 145 | 0/145 (0.00%) | 0/122 (0.00%) | 0/34 (0.00%) |
| packages/cms/src/forms/field-registry.ts | NEVER-LOADED | 144 | 0/144 (0.00%) | 0/210 (0.00%) | 0/47 (0.00%) |
| packages/daemon/src/http/memory.ts | NEVER-LOADED | 143 | 0/143 (0.00%) | 0/56 (0.00%) | 0/40 (0.00%) |
| packages/daemon/src/http/media.ts | NEVER-LOADED | 142 | 0/142 (0.00%) | 0/76 (0.00%) | 0/34 (0.00%) |
| packages/chat/src/react/hooks/composer-draft-cache.ts | NEVER-LOADED | 141 | 0/141 (0.00%) | 0/94 (0.00%) | 0/25 (0.00%) |
| packages/cms/src/forms/html/html-authoring.ts | NEVER-LOADED | 141 | 0/141 (0.00%) | 0/138 (0.00%) | 0/46 (0.00%) |
| packages/platform/src/process.ts | NEVER-LOADED | 141 | 0/141 (0.00%) | 0/74 (0.00%) | 0/40 (0.00%) |
| packages/admin/src/core/module/create-admin.ts | NEVER-LOADED | 140 | 0/140 (0.00%) | 0/100 (0.00%) | 0/36 (0.00%) |
| packages/daemon/src/http/routines.ts | NEVER-LOADED | 140 | 0/140 (0.00%) | 0/92 (0.00%) | 0/34 (0.00%) |
| packages/platform/src/web/html-to-markdown.ts | NEVER-LOADED | 140 | 0/140 (0.00%) | 0/116 (0.00%) | 0/37 (0.00%) |
| packages/ui/src/features/panel-kit/hooks/use-standing-draft-autosave.hooks.ts | NEVER-LOADED | 139 | 0/139 (0.00%) | 0/76 (0.00%) | 0/31 (0.00%) |
| packages/agent-runtime/src/executables.ts | NEVER-LOADED | 138 | 0/138 (0.00%) | 0/92 (0.00%) | 0/30 (0.00%) |
| packages/chat/src/react/hooks/useComposer.ts | NEVER-LOADED | 137 | 0/137 (0.00%) | 0/68 (0.00%) | 0/36 (0.00%) |
| packages/daemon/src/http/host-tools.ts | NEVER-LOADED | 137 | 0/137 (0.00%) | 0/94 (0.00%) | 0/39 (0.00%) |
| packages/daemon/src/http/runs.ts | NEVER-LOADED | 137 | 0/137 (0.00%) | 0/100 (0.00%) | 0/24 (0.00%) |
| packages/cms/src/entries/write-service.ts | NEVER-LOADED | 136 | 0/136 (0.00%) | 0/98 (0.00%) | 0/20 (0.00%) |
| packages/agent-runtime/src/providers/tool-turn.ts | NEVER-LOADED | 134 | 0/134 (0.00%) | 0/128 (0.00%) | 0/43 (0.00%) |
| packages/cms/src/consent/html/gate.ts | NEVER-LOADED | 134 | 0/134 (0.00%) | 0/126 (0.00%) | 0/38 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/recon-site.mjs | NEVER-LOADED | 133 | 0/133 (0.00%) | 0/146 (0.00%) | 0/50 (0.00%) |
| packages/agent-plugins/src/lifecycle/tools/projection.ts | NEVER-LOADED | 131 | 0/131 (0.00%) | 0/76 (0.00%) | 0/34 (0.00%) |
| packages/chat/src/react/features/chat-pane/components/ChatPane.tsx | NEVER-LOADED | 131 | 0/131 (0.00%) | 0/102 (0.00%) | 0/40 (0.00%) |
| packages/daemon/src/http/terminals.ts | NEVER-LOADED | 131 | 0/131 (0.00%) | 0/74 (0.00%) | 0/27 (0.00%) |
| packages/ui/src/features/browser-chrome/rules.ts | NEVER-LOADED | 131 | 0/131 (0.00%) | 0/120 (0.00%) | 0/33 (0.00%) |
| packages/ui/src/features/version-manager/react/hooks/useVersionManager.ts | NEVER-LOADED | 131 | 0/131 (0.00%) | 0/62 (0.00%) | 0/27 (0.00%) |
| packages/daemon/src/routines/schedule.ts | NEVER-LOADED | 130 | 0/130 (0.00%) | 0/96 (0.00%) | 0/24 (0.00%) |
| packages/admin/src/core/entities/rules.ts | NEVER-LOADED | 129 | 0/129 (0.00%) | 0/95 (0.00%) | 0/30 (0.00%) |
| packages/daemon/src/http/model-proxy.ts | NEVER-LOADED | 129 | 0/129 (0.00%) | 0/72 (0.00%) | 0/36 (0.00%) |
| packages/daemon/src/routines/scheduler.ts | NEVER-LOADED | 129 | 0/129 (0.00%) | 0/66 (0.00%) | 0/35 (0.00%) |
| packages/ui/src/features/asset-tree-browser/rules.ts | NEVER-LOADED | 129 | 0/129 (0.00%) | 0/82 (0.00%) | 0/27 (0.00%) |
| packages/ui/src/features/connectors/hooks/useConnectorAuthorization.ts | NEVER-LOADED | 129 | 0/129 (0.00%) | 0/42 (0.00%) | 0/47 (0.00%) |
| packages/platform/src/secrets/keyring.env.ts | NEVER-LOADED | 128 | 0/128 (0.00%) | 0/64 (0.00%) | 0/32 (0.00%) |
| packages/admin/src/seo/rules.ts | NEVER-LOADED | 127 | 0/127 (0.00%) | 0/148 (0.00%) | 0/47 (0.00%) |
| packages/platform/src/fs/directory-user-config.ts | NEVER-LOADED | 125 | 0/125 (0.00%) | 0/152 (0.00%) | 0/40 (0.00%) |
| packages/ui/src/utils/markdown-scroll-sync.ts | NEVER-LOADED | 125 | 0/125 (0.00%) | 0/62 (0.00%) | 0/20 (0.00%) |
| packages/agent-plugins/src/lifecycle/uninstall.ts | NEVER-LOADED | 124 | 0/124 (0.00%) | 0/36 (0.00%) | 0/33 (0.00%) |
| packages/chat/src/server/durable-runs/recover.ts | NEVER-LOADED | 124 | 0/124 (0.00%) | 0/148 (0.00%) | 0/35 (0.00%) |
| packages/ui/src/features/media-providers/react/hooks/useMediaProvidersTab.ts | NEVER-LOADED | 124 | 0/124 (0.00%) | 0/42 (0.00%) | 0/25 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/surface-client.ts | NEVER-LOADED | 123 | 0/123 (0.00%) | 0/92 (0.00%) | 0/26 (0.00%) |
| packages/mcp/src/federation/adapter.http.ts | NEVER-LOADED | 123 | 0/123 (0.00%) | 0/74 (0.00%) | 0/32 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/compare-recon.mjs | NEVER-LOADED | 121 | 0/121 (0.00%) | 0/212 (0.00%) | 0/34 (0.00%) |
| packages/chat/src/store/sql/store.ts | NEVER-LOADED | 121 | 0/121 (0.00%) | 0/106 (0.00%) | 0/87 (0.00%) |
| packages/devops/src/checks/published-types/index.ts | NEVER-LOADED | 121 | 0/121 (0.00%) | 0/74 (0.00%) | 0/25 (0.00%) |
| packages/platform/src/http/guarded/client.ts | NEVER-LOADED | 120 | 0/120 (0.00%) | 0/110 (0.00%) | 0/24 (0.00%) |
| packages/ui/src/renderers/annotation-canvas/drawing.ts | NEVER-LOADED | 120 | 0/120 (0.00%) | 0/24 (0.00%) | 0/7 (0.00%) |
| packages/agent-runtime/src/auth.ts | NEVER-LOADED | 119 | 0/119 (0.00%) | 0/104 (0.00%) | 0/32 (0.00%) |
| packages/chat/src/core/util/strip.ts | NEVER-LOADED | 119 | 0/119 (0.00%) | 0/92 (0.00%) | 0/19 (0.00%) |
| packages/daemon/src/legacy-data-migration.ts | NEVER-LOADED | 119 | 0/119 (0.00%) | 0/36 (0.00%) | 0/17 (0.00%) |
| packages/ui/src/features/viewer-shell/rules.ts | NEVER-LOADED | 119 | 0/119 (0.00%) | 0/86 (0.00%) | 0/23 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/descriptor.ts | NEVER-LOADED | 118 | 0/118 (0.00%) | 0/132 (0.00%) | 0/26 (0.00%) |
| packages/artifacts/src/manifest.ts | NEVER-LOADED | 118 | 0/118 (0.00%) | 0/126 (0.00%) | 0/18 (0.00%) |
| packages/cms/src/media/document-ingress.ts | NEVER-LOADED | 118 | 0/118 (0.00%) | 0/130 (0.00%) | 0/33 (0.00%) |
| packages/platform/src/fs/atomic-write.ts | NEVER-LOADED | 118 | 0/118 (0.00%) | 0/72 (0.00%) | 0/47 (0.00%) |
| packages/ui/src/features/memory/react/hooks/useMemoryExtractions.store.ts | NEVER-LOADED | 117 | 0/117 (0.00%) | 0/68 (0.00%) | 0/34 (0.00%) |
| packages/ui/src/features/panel-kit/fetch-query/adapter.tanstack.tsx | NEVER-LOADED | 117 | 0/117 (0.00%) | 0/58 (0.00%) | 0/45 (0.00%) |
| packages/cms/src/widgets/write-service.ts | NEVER-LOADED | 116 | 0/116 (0.00%) | 0/72 (0.00%) | 0/20 (0.00%) |
| packages/platform/src/fs/directory-workspace.ts | NEVER-LOADED | 116 | 0/116 (0.00%) | 0/132 (0.00%) | 0/70 (0.00%) |
| packages/server/src/builtin-features.ts | NEVER-LOADED | 115 | 0/115 (0.00%) | 0/82 (0.00%) | 0/93 (0.00%) |
| packages/chat/src/react/components/A2uiSurfaceCard.tsx | NEVER-LOADED | 114 | 0/114 (0.00%) | 0/70 (0.00%) | 0/22 (0.00%) |
| packages/ui/src/features/sketch-editor/rules.ts | NEVER-LOADED | 114 | 0/114 (0.00%) | 0/74 (0.00%) | 0/26 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/route-crawl.mjs | NEVER-LOADED | 113 | 0/113 (0.00%) | 0/86 (0.00%) | 0/14 (0.00%) |
| packages/ui/src/features/html-editor/canvas-embed-placeholders.ts | NEVER-LOADED | 113 | 0/113 (0.00%) | 0/64 (0.00%) | 0/13 (0.00%) |
| packages/ui/src/react/components/CustomSelect.tsx | NEVER-LOADED | 113 | 0/113 (0.00%) | 0/82 (0.00%) | 0/45 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/hooks/useResourceBoard.ts | NEVER-LOADED | 112 | 0/112 (0.00%) | 0/44 (0.00%) | 0/42 (0.00%) |
| packages/ui/src/features/html-editor/editor-blocks.ts | NEVER-LOADED | 111 | 0/111 (0.00%) | 0/118 (0.00%) | 0/32 (0.00%) |
| packages/ui/src/react/components/OnboardingDropdown.tsx | NEVER-LOADED | 111 | 0/111 (0.00%) | 0/70 (0.00%) | 0/37 (0.00%) |
| packages/cms/src/consent/express/index.ts | NEVER-LOADED | 110 | 0/110 (0.00%) | 0/86 (0.00%) | 0/21 (0.00%) |
| packages/cms/src/routing/routing.ts | NEVER-LOADED | 110 | 0/110 (0.00%) | 0/51 (0.00%) | 0/30 (0.00%) |
| packages/agent-runtime/src/defs/amr.ts | NEVER-LOADED | 109 | 0/109 (0.00%) | 0/68 (0.00%) | 0/27 (0.00%) |
| packages/ui/src/features/asset-grid/rules.ts | NEVER-LOADED | 109 | 0/109 (0.00%) | 0/70 (0.00%) | 0/34 (0.00%) |
| packages/ui/src/react/components/WorkingDirPicker.tsx | NEVER-LOADED | 109 | 0/109 (0.00%) | 0/62 (0.00%) | 0/34 (0.00%) |
| packages/cms/src/content-types/write-service.ts | NEVER-LOADED | 108 | 0/108 (0.00%) | 0/66 (0.00%) | 0/15 (0.00%) |
| packages/oauth/tests/helpers.ts | NEVER-LOADED | 108 | 0/108 (0.00%) | 0/62 (0.00%) | 0/27 (0.00%) |
| packages/cms/src/widgets/markers/gallery.ts | NEVER-LOADED | 107 | 0/107 (0.00%) | 0/124 (0.00%) | 0/24 (0.00%) |
| packages/daemon/src/run/diagnostics/diagnostics.ts | NEVER-LOADED | 107 | 0/107 (0.00%) | 0/100 (0.00%) | 0/19 (0.00%) |
| packages/devops/src/checks/hardwiring-node.ts | NEVER-LOADED | 107 | 0/107 (0.00%) | 0/88 (0.00%) | 0/31 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/visual-diff.mjs | NEVER-LOADED | 106 | 0/106 (0.00%) | 0/62 (0.00%) | 0/10 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useAgentRuntimePicker.hooks.ts | NEVER-LOADED | 106 | 0/106 (0.00%) | 0/78 (0.00%) | 0/24 (0.00%) |
| packages/devops/src/source-control/registry.ts | NEVER-LOADED | 106 | 0/106 (0.00%) | 0/108 (0.00%) | 0/44 (0.00%) |
| packages/agent-runtime/src/claude-code-models.ts | NEVER-LOADED | 105 | 0/105 (0.00%) | 0/76 (0.00%) | 0/24 (0.00%) |
| packages/chat/src/react/agent-bridge/frontend-session-bridge.ts | NEVER-LOADED | 105 | 0/105 (0.00%) | 0/55 (0.00%) | 0/27 (0.00%) |
| packages/chat/src/store/runtime/history-tools.ts | NEVER-LOADED | 105 | 0/105 (0.00%) | 0/90 (0.00%) | 0/25 (0.00%) |
| packages/cms/src/forms/forms.ts | NEVER-LOADED | 105 | 0/105 (0.00%) | 0/78 (0.00%) | 0/18 (0.00%) |
| packages/ui/src/features/memory/dependencies.ts | NEVER-LOADED | 104 | 0/104 (0.00%) | 0/52 (0.00%) | 0/29 (0.00%) |
| packages/ui/src/utils/notifications.ts | NEVER-LOADED | 103 | 0/103 (0.00%) | 0/46 (0.00%) | 0/22 (0.00%) |
| packages/admin/src/comments/controllers/comment-queue.controller.ts | NEVER-LOADED | 102 | 0/102 (0.00%) | 0/50 (0.00%) | 0/16 (0.00%) |
| packages/chat/src/react/components/MessageRow.tsx | NEVER-LOADED | 102 | 0/102 (0.00%) | 0/102 (0.00%) | 0/26 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneAgentControl.hooks.ts | NEVER-LOADED | 102 | 0/102 (0.00%) | 0/44 (0.00%) | 0/27 (0.00%) |
| packages/cms/src/seo/seo.ts | NEVER-LOADED | 102 | 0/102 (0.00%) | 0/92 (0.00%) | 0/19 (0.00%) |
| packages/mcp/src/client/client.ts | NEVER-LOADED | 102 | 0/102 (0.00%) | 0/60 (0.00%) | 0/21 (0.00%) |
| packages/oauth/src/authorization-code.ts | NEVER-LOADED | 102 | 0/102 (0.00%) | 0/70 (0.00%) | 0/13 (0.00%) |
| packages/agent-runtime/src/defs/codex.ts | NEVER-LOADED | 101 | 0/101 (0.00%) | 0/104 (0.00%) | 0/24 (0.00%) |
| packages/chat/src/core/util/parser.ts | NEVER-LOADED | 101 | 0/101 (0.00%) | 0/74 (0.00%) | 0/14 (0.00%) |
| packages/chat/src/core/util/validate.ts | NEVER-LOADED | 101 | 0/101 (0.00%) | 0/48 (0.00%) | 0/15 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneWorkingDirectory.hooks.ts | NEVER-LOADED | 101 | 0/101 (0.00%) | 0/36 (0.00%) | 0/14 (0.00%) |
| packages/cms/src/consent/express/response.ts | NEVER-LOADED | 101 | 0/101 (0.00%) | 0/82 (0.00%) | 0/29 (0.00%) |
| packages/daemon/src/terminal-session.ts | NEVER-LOADED | 101 | 0/101 (0.00%) | 0/60 (0.00%) | 0/36 (0.00%) |
| packages/devops/src/static-export/transforms.ts | NEVER-LOADED | 101 | 0/101 (0.00%) | 0/96 (0.00%) | 0/34 (0.00%) |
| packages/ui/src/features/panel-kit/hooks/use-settings-slice.hooks.ts | NEVER-LOADED | 101 | 0/101 (0.00%) | 0/52 (0.00%) | 0/28 (0.00%) |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/BubbleScene.tsx | NEVER-LOADED | 100 | 0/100 (0.00%) | 0/56 (0.00%) | 0/18 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/mention-parser.ts | NEVER-LOADED | 100 | 0/100 (0.00%) | 0/68 (0.00%) | 0/16 (0.00%) |
| packages/agent-runtime/src/providers/azure-chat.ts | NEVER-LOADED | 99 | 0/99 (0.00%) | 0/64 (0.00%) | 0/19 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/od-preview-rewrite.mjs | NEVER-LOADED | 99 | 0/99 (0.00%) | 0/66 (0.00%) | 0/17 (0.00%) |
| packages/chat/src/embed-widget/transports/fetch-sse.ts | NEVER-LOADED | 99 | 0/99 (0.00%) | 0/80 (0.00%) | 0/30 (0.00%) |
| packages/platform/src/toolchain.ts | NEVER-LOADED | 99 | 0/99 (0.00%) | 0/62 (0.00%) | 0/15 (0.00%) |
| packages/cms/src/seo/write-service.ts | NEVER-LOADED | 98 | 0/98 (0.00%) | 0/44 (0.00%) | 0/15 (0.00%) |
| packages/mcp/src/server/daemon-client.ts | NEVER-LOADED | 98 | 0/98 (0.00%) | 0/54 (0.00%) | 0/20 (0.00%) |
| packages/platform/src/fs/durable-json.ts | NEVER-LOADED | 98 | 0/98 (0.00%) | 0/54 (0.00%) | 0/36 (0.00%) |
| packages/plugins/src/host/node/package-files.ts | NEVER-LOADED | 98 | 0/98 (0.00%) | 0/54 (0.00%) | 0/13 (0.00%) |
| packages/chat/src/react/components/ConversationList.tsx | NEVER-LOADED | 97 | 0/97 (0.00%) | 0/68 (0.00%) | 0/39 (0.00%) |
| packages/chat/src/react/features/chat-pane/rules.ts | NEVER-LOADED | 97 | 0/97 (0.00%) | 0/96 (0.00%) | 0/28 (0.00%) |
| packages/chat/src/react/hooks/useConversation.ts | NEVER-LOADED | 97 | 0/97 (0.00%) | 0/88 (0.00%) | 0/33 (0.00%) |
| packages/daemon/src/core/tool-gaps.ts | NEVER-LOADED | 97 | 0/97 (0.00%) | 0/84 (0.00%) | 0/25 (0.00%) |
| packages/plugins/src/host/node/discovery.ts | NEVER-LOADED | 97 | 0/97 (0.00%) | 0/60 (0.00%) | 0/27 (0.00%) |
| packages/agent-plugins/src/lifecycle/bundled-digests.ts | NEVER-LOADED | 96 | 0/96 (0.00%) | 0/50 (0.00%) | 0/14 (0.00%) |
| packages/artifacts/src/text-suppression.ts | NEVER-LOADED | 96 | 0/96 (0.00%) | 0/50 (0.00%) | 0/26 (0.00%) |
| packages/chat/src/react/features/chat-pane/create-daemon-attachment-uploader.ts | NEVER-LOADED | 96 | 0/96 (0.00%) | 0/52 (0.00%) | 0/23 (0.00%) |
| packages/daemon/src/run-credentials.ts | NEVER-LOADED | 96 | 0/96 (0.00%) | 0/80 (0.00%) | 0/32 (0.00%) |
| packages/admin/src/forms/react/hooks/use-form-editor.hooks.ts | NEVER-LOADED | 95 | 0/95 (0.00%) | 0/48 (0.00%) | 0/26 (0.00%) |
| packages/agent-runtime/src/agent-protocol/acp/text-suppression.ts | NEVER-LOADED | 95 | 0/95 (0.00%) | 0/54 (0.00%) | 0/18 (0.00%) |
| packages/agent-runtime/src/providers/oauth-callback-server.ts | NEVER-LOADED | 95 | 0/95 (0.00%) | 0/48 (0.00%) | 0/17 (0.00%) |
| packages/chat/src/core/ag-ui/entry.ts | NEVER-LOADED | 95 | 0/95 (0.00%) | 0/72 (0.00%) | 0/25 (0.00%) |
| packages/cms/src/forms/write-service.ts | NEVER-LOADED | 95 | 0/95 (0.00%) | 0/54 (0.00%) | 0/19 (0.00%) |
| packages/ui/src/features/memory/react/hooks/useMemoryConfig.hooks.ts | NEVER-LOADED | 95 | 0/95 (0.00%) | 0/32 (0.00%) | 0/19 (0.00%) |
| packages/ui/src/index.ts | NEVER-LOADED | 95 | 0/95 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/src/launch.ts | NEVER-LOADED | 94 | 0/94 (0.00%) | 0/50 (0.00%) | 0/18 (0.00%) |
| packages/admin/src/media/controllers/library.controller.ts | NEVER-LOADED | 93 | 0/93 (0.00%) | 0/64 (0.00%) | 0/28 (0.00%) |
| packages/agent-runtime/src/qoder-stream.ts | NEVER-LOADED | 93 | 0/93 (0.00%) | 0/82 (0.00%) | 0/20 (0.00%) |
| packages/chat/src/react/hooks/fab-position.ts | NEVER-LOADED | 93 | 0/93 (0.00%) | 0/44 (0.00%) | 0/16 (0.00%) |
| packages/cms/src/consent/node/index.ts | NEVER-LOADED | 93 | 0/93 (0.00%) | 0/64 (0.00%) | 0/21 (0.00%) |
| packages/devops/src/deploy/reachability.ts | NEVER-LOADED | 93 | 0/93 (0.00%) | 0/56 (0.00%) | 0/20 (0.00%) |
| packages/plugins/src/host/hook-registry.ts | NEVER-LOADED | 93 | 0/93 (0.00%) | 0/49 (0.00%) | 0/15 (0.00%) |
| packages/ui/src/features/viewer-shell/react/hooks/useMarkdownScrollSync.ts | NEVER-LOADED | 93 | 0/93 (0.00%) | 0/56 (0.00%) | 0/17 (0.00%) |
| packages/server/src/create-local-node-daemon.ts | NEVER-LOADED | 92 | 0/92 (0.00%) | 0/64 (0.00%) | 0/26 (0.00%) |
| packages/ui/src/features/html-editor/css.ts | NEVER-LOADED | 92 | 0/92 (0.00%) | 0/49 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/react/components/select-popover.ts | NEVER-LOADED | 92 | 0/92 (0.00%) | 0/74 (0.00%) | 0/31 (0.00%) |
| packages/agent-plugins/src/lifecycle/fetch-archive.ts | NEVER-LOADED | 91 | 0/91 (0.00%) | 0/42 (0.00%) | 0/11 (0.00%) |
| packages/agent-runtime/src/agent-protocol/pi-rpc/events.ts | NEVER-LOADED | 91 | 0/91 (0.00%) | 0/64 (0.00%) | 0/22 (0.00%) |
| packages/chat/src/react/hooks/useRunStream.ts | NEVER-LOADED | 91 | 0/91 (0.00%) | 0/36 (0.00%) | 0/29 (0.00%) |
| packages/cms/src/seo/sitemap.ts | NEVER-LOADED | 91 | 0/91 (0.00%) | 0/36 (0.00%) | 0/24 (0.00%) |
| packages/daemon/src/http/remote-run-events.ts | NEVER-LOADED | 91 | 0/91 (0.00%) | 0/52 (0.00%) | 0/14 (0.00%) |
| packages/user-management/src/react/testing.ts | LOADED | 91 | 164/255 (64.31%) | 59/66 (89.39%) | 26/40 (65.00%) |
| packages/admin/src/media/react/hooks/LibraryTab.hooks.ts | NEVER-LOADED | 90 | 0/90 (0.00%) | 0/86 (0.00%) | 0/41 (0.00%) |
| packages/admin/src/react/components/RowMenu/RowMenu.hooks.tsx | NEVER-LOADED | 90 | 0/90 (0.00%) | 0/33 (0.00%) | 0/19 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/dna-scaffold.mjs | NEVER-LOADED | 90 | 0/90 (0.00%) | 0/100 (0.00%) | 0/16 (0.00%) |
| packages/chat/src/core/transcript.ts | NEVER-LOADED | 90 | 0/90 (0.00%) | 0/56 (0.00%) | 0/15 (0.00%) |
| packages/chat/src/store/legacy/sqlite/messages.ts | NEVER-LOADED | 90 | 0/90 (0.00%) | 0/88 (0.00%) | 0/20 (0.00%) |
| packages/cms/src/forms/descriptor-rules.ts | NEVER-LOADED | 90 | 0/90 (0.00%) | 0/132 (0.00%) | 0/31 (0.00%) |
| packages/daemon/src/surface-exchanges.ts | NEVER-LOADED | 90 | 0/90 (0.00%) | 0/56 (0.00%) | 0/22 (0.00%) |
| packages/platform/src/sandbox-env.ts | NEVER-LOADED | 90 | 0/90 (0.00%) | 0/32 (0.00%) | 0/16 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/surface-capabilities.ts | NEVER-LOADED | 89 | 0/89 (0.00%) | 0/62 (0.00%) | 0/38 (0.00%) |
| packages/daemon/src/store/event-log/sqlite.ts | NEVER-LOADED | 89 | 0/89 (0.00%) | 0/46 (0.00%) | 0/17 (0.00%) |
| packages/oauth/src/discovery.ts | NEVER-LOADED | 89 | 0/89 (0.00%) | 0/60 (0.00%) | 0/19 (0.00%) |
| packages/ui/src/features/html-editor/protected-elements.ts | NEVER-LOADED | 89 | 0/89 (0.00%) | 0/86 (0.00%) | 0/25 (0.00%) |
| packages/ui/src/features/viewer-shell/react/components/CommentSidePanel.tsx | NEVER-LOADED | 89 | 0/89 (0.00%) | 0/72 (0.00%) | 0/32 (0.00%) |
| packages/ui/src/utils/zip.ts | NEVER-LOADED | 89 | 0/89 (0.00%) | 0/4 (0.00%) | 0/7 (0.00%) |
| packages/admin/src/forms/rules.ts | NEVER-LOADED | 88 | 0/88 (0.00%) | 0/76 (0.00%) | 0/35 (0.00%) |
| packages/agent-runtime/src/model-discovery-config.ts | NEVER-LOADED | 88 | 0/88 (0.00%) | 0/100 (0.00%) | 0/43 (0.00%) |
| packages/agent-runtime/src/providers/elevenlabs.ts | NEVER-LOADED | 88 | 0/88 (0.00%) | 0/58 (0.00%) | 0/20 (0.00%) |
| packages/ui/src/features/project-locations/react/hooks/useProjectLocationsTab.ts | NEVER-LOADED | 88 | 0/88 (0.00%) | 0/44 (0.00%) | 0/16 (0.00%) |
| packages/agent-runtime/src/mmd-routes.ts | NEVER-LOADED | 87 | 0/87 (0.00%) | 0/56 (0.00%) | 0/11 (0.00%) |
| packages/oauth/src/loopback-receiver.ts | NEVER-LOADED | 87 | 0/87 (0.00%) | 0/42 (0.00%) | 0/23 (0.00%) |
| packages/platform/src/net/endpoint-policy.ts | NEVER-LOADED | 87 | 0/87 (0.00%) | 0/90 (0.00%) | 0/27 (0.00%) |
| packages/admin/src/react/components/Sidebar.tsx | NEVER-LOADED | 86 | 0/86 (0.00%) | 0/74 (0.00%) | 0/31 (0.00%) |
| packages/agent-plugins/src/lifecycle/resolve-agent-plugin-refs.ts | NEVER-LOADED | 86 | 0/86 (0.00%) | 0/36 (0.00%) | 0/13 (0.00%) |
| packages/chat/src/core/accepted-input.ts | NEVER-LOADED | 86 | 0/86 (0.00%) | 0/94 (0.00%) | 0/20 (0.00%) |
| packages/plugins/src/host/contributions.ts | NEVER-LOADED | 86 | 0/86 (0.00%) | 0/70 (0.00%) | 0/34 (0.00%) |
| packages/ui/src/features/mcp-ui/secret-card.ts | NEVER-LOADED | 86 | 0/86 (0.00%) | 0/60 (0.00%) | 0/19 (0.00%) |
| packages/agent-plugins/src/lifecycle/automatic-use.ts | NEVER-LOADED | 85 | 0/85 (0.00%) | 0/86 (0.00%) | 0/35 (0.00%) |
| packages/server/src/compose-jini-kernel.ts | NEVER-LOADED | 85 | 0/85 (0.00%) | 0/46 (0.00%) | 0/18 (0.00%) |
| packages/ui/src/features/asset-grid/react/hooks/useAssetGridLiveUpdates.ts | NEVER-LOADED | 85 | 0/85 (0.00%) | 0/34 (0.00%) | 0/21 (0.00%) |
| packages/ui/src/renderers/preview-modal-shell/react/hooks/usePreviewModalShell.ts | NEVER-LOADED | 85 | 0/85 (0.00%) | 0/26 (0.00%) | 0/28 (0.00%) |
| packages/ui/src/renderers/srcdoc/build.ts | NEVER-LOADED | 85 | 0/85 (0.00%) | 0/50 (0.00%) | 0/17 (0.00%) |
| packages/chat/src/react/components/AttachmentPreviewModal.hooks.ts | NEVER-LOADED | 84 | 0/84 (0.00%) | 0/60 (0.00%) | 0/26 (0.00%) |
| packages/ui/src/features/admin-widgets/components/Select/Select.hooks.tsx | NEVER-LOADED | 84 | 0/84 (0.00%) | 0/58 (0.00%) | 0/30 (0.00%) |
| packages/chat/src/core/run-activity.ts | NEVER-LOADED | 83 | 0/83 (0.00%) | 0/78 (0.00%) | 0/27 (0.00%) |
| packages/mcp/src/agent-install/install.ts | NEVER-LOADED | 83 | 0/83 (0.00%) | 0/36 (0.00%) | 0/31 (0.00%) |
| packages/oauth/src/refresh.ts | NEVER-LOADED | 83 | 0/83 (0.00%) | 0/48 (0.00%) | 0/13 (0.00%) |
| packages/ui/src/features/memory/react/hooks/useMemoryExtractions.hooks.ts | NEVER-LOADED | 83 | 0/83 (0.00%) | 0/14 (0.00%) | 0/14 (0.00%) |
| packages/mcp/src/federation/stdio/stdio-launch-resolver.ts | NEVER-LOADED | 82 | 0/82 (0.00%) | 0/64 (0.00%) | 0/17 (0.00%) |
| packages/platform/src/fs/verified-directory-move.ts | NEVER-LOADED | 82 | 0/82 (0.00%) | 0/42 (0.00%) | 0/15 (0.00%) |
| packages/admin/src/media/react/hooks/ProvidersTab.hooks.ts | NEVER-LOADED | 81 | 0/81 (0.00%) | 0/90 (0.00%) | 0/37 (0.00%) |
| packages/daemon/src/http/delegated-tools.ts | NEVER-LOADED | 81 | 0/81 (0.00%) | 0/56 (0.00%) | 0/11 (0.00%) |
| packages/agent-runtime/src/opencode-log.ts | NEVER-LOADED | 80 | 0/80 (0.00%) | 0/63 (0.00%) | 0/12 (0.00%) |
| packages/chat/src/server/run-finalizer/entry.ts | NEVER-LOADED | 80 | 0/80 (0.00%) | 0/48 (0.00%) | 0/23 (0.00%) |
| packages/chat/src/store/runtime/run-ledger.ts | NEVER-LOADED | 80 | 0/80 (0.00%) | 0/62 (0.00%) | 0/40 (0.00%) |
| packages/daemon/src/delegated-tool-bridge.ts | NEVER-LOADED | 80 | 0/80 (0.00%) | 0/34 (0.00%) | 0/15 (0.00%) |
| packages/ui/src/features/execution/react/hooks/useExecutionTab.ts | NEVER-LOADED | 80 | 0/80 (0.00%) | 0/46 (0.00%) | 0/29 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/components/RichTextInput.tsx | NEVER-LOADED | 80 | 0/80 (0.00%) | 0/28 (0.00%) | 0/15 (0.00%) |
| packages/ui/src/features/tab-strip/react/hooks/useTabStripDragReorder.ts | NEVER-LOADED | 80 | 0/80 (0.00%) | 0/46 (0.00%) | 0/14 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/action-schema.ts | NEVER-LOADED | 79 | 0/79 (0.00%) | 0/126 (0.00%) | 0/23 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/surface-handlers.ts | NEVER-LOADED | 79 | 0/79 (0.00%) | 0/54 (0.00%) | 0/26 (0.00%) |
| packages/cms/src/consent/css.ts | NEVER-LOADED | 79 | 0/79 (0.00%) | 0/68 (0.00%) | 0/36 (0.00%) |
| packages/daemon/src/frontend-session-registry.ts | NEVER-LOADED | 79 | 0/79 (0.00%) | 0/38 (0.00%) | 0/17 (0.00%) |
| packages/db/src/transfer/table-catalog.ts | LOADED | 79 | 7/86 (8.14%) | 0/0 (100.00%) | 0/7 (0.00%) |
| packages/cms/src/forms/html-render.ts | NEVER-LOADED | 78 | 0/78 (0.00%) | 0/106 (0.00%) | 0/27 (0.00%) |
| packages/mcp/src/tools/ask-choice/index.ts | NEVER-LOADED | 78 | 0/78 (0.00%) | 0/50 (0.00%) | 0/13 (0.00%) |
| packages/admin/src/forms/html-rules.ts | NEVER-LOADED | 77 | 0/77 (0.00%) | 0/96 (0.00%) | 0/35 (0.00%) |
| packages/agent-plugins/src/lifecycle/skill-file-reader.ts | NEVER-LOADED | 77 | 0/77 (0.00%) | 0/58 (0.00%) | 0/19 (0.00%) |
| packages/agent-runtime/src/agent-protocol/acp/updates.ts | NEVER-LOADED | 77 | 0/77 (0.00%) | 0/70 (0.00%) | 0/19 (0.00%) |
| packages/db/src/recovery/recovery-orchestrator.ts | LOADED | 77 | 0/77 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/mcp/src/core/tokens.ts | NEVER-LOADED | 77 | 0/77 (0.00%) | 0/44 (0.00%) | 0/19 (0.00%) |
| packages/ui/src/react/components/ExportDiagnosticsButton.tsx | NEVER-LOADED | 77 | 0/77 (0.00%) | 0/36 (0.00%) | 0/15 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/mirror-site.mjs | NEVER-LOADED | 76 | 0/76 (0.00%) | 0/48 (0.00%) | 0/16 (0.00%) |
| packages/ui/src/features/execution/react/components/ByokProviderForm.tsx | NEVER-LOADED | 76 | 0/76 (0.00%) | 0/86 (0.00%) | 0/29 (0.00%) |
| packages/ui/src/features/sketch-editor/react/hooks/useSketchSaveWorkflow.ts | NEVER-LOADED | 76 | 0/76 (0.00%) | 0/24 (0.00%) | 0/17 (0.00%) |
| packages/chat/src/core/turn-usage.ts | NEVER-LOADED | 75 | 0/75 (0.00%) | 0/76 (0.00%) | 0/12 (0.00%) |
| packages/chat/src/react/hooks/useComposerHistory.hooks.ts | NEVER-LOADED | 75 | 0/75 (0.00%) | 0/38 (0.00%) | 0/23 (0.00%) |
| packages/core/src/primitives/sse.ts | LOADED | 75 | 1/76 (1.32%) | 0/0 (100.00%) | 0/4 (0.00%) |
| packages/ui/src/features/execution/react/hooks/use-execution-credential.hooks.ts | NEVER-LOADED | 75 | 0/75 (0.00%) | 0/24 (0.00%) | 0/16 (0.00%) |
| packages/agent-plugins/src/lifecycle/tools/capabilities.ts | NEVER-LOADED | 74 | 0/74 (0.00%) | 0/46 (0.00%) | 0/26 (0.00%) |
| packages/cms/src/redirects/host-config/index.ts | NEVER-LOADED | 74 | 0/74 (0.00%) | 0/64 (0.00%) | 0/21 (0.00%) |
| packages/cms/src/trash/write-service.ts | NEVER-LOADED | 74 | 0/74 (0.00%) | 0/54 (0.00%) | 0/18 (0.00%) |
| packages/ui/src/react/mcp-ui/useMcpUiHost.ts | NEVER-LOADED | 74 | 0/74 (0.00%) | 0/28 (0.00%) | 0/14 (0.00%) |
| packages/chat/src/embed-widget/browser/lazy-loader.ts | NEVER-LOADED | 73 | 0/73 (0.00%) | 0/30 (0.00%) | 0/18 (0.00%) |
| packages/cms/src/widgets/config-validation.ts | NEVER-LOADED | 73 | 0/73 (0.00%) | 0/57 (0.00%) | 0/14 (0.00%) |
| packages/daemon/src/http/research.ts | NEVER-LOADED | 73 | 0/73 (0.00%) | 0/56 (0.00%) | 0/19 (0.00%) |
| packages/ui/src/features/source-config-list/react/components/SourceConfigItemCard.tsx | NEVER-LOADED | 73 | 0/73 (0.00%) | 0/58 (0.00%) | 0/25 (0.00%) |
| packages/cms/src/forms/submit-service.ts | NEVER-LOADED | 72 | 0/72 (0.00%) | 0/32 (0.00%) | 0/16 (0.00%) |
| packages/ui/src/features/charts/browser.ts | NEVER-LOADED | 72 | 0/72 (0.00%) | 0/36 (0.00%) | 0/16 (0.00%) |
| packages/agent-runtime/src/providers/aihubmix.ts | NEVER-LOADED | 71 | 0/71 (0.00%) | 0/54 (0.00%) | 0/19 (0.00%) |
| packages/agent-runtime/src/providers/connection-guard.ts | NEVER-LOADED | 71 | 0/71 (0.00%) | 0/50 (0.00%) | 0/15 (0.00%) |
| packages/agent-runtime/src/providers/oauth-tokens.ts | NEVER-LOADED | 71 | 0/71 (0.00%) | 0/48 (0.00%) | 0/15 (0.00%) |
| packages/chat/src/core/question-form/normalize.ts | NEVER-LOADED | 71 | 0/71 (0.00%) | 0/90 (0.00%) | 0/26 (0.00%) |
| packages/chat/src/embed-widget/vanilla/state.ts | NEVER-LOADED | 71 | 0/71 (0.00%) | 0/42 (0.00%) | 0/18 (0.00%) |
| packages/cms/src/media/blob-gc.ts | NEVER-LOADED | 71 | 0/71 (0.00%) | 0/28 (0.00%) | 0/15 (0.00%) |
| packages/commerce/src/store/store-plugin.ts | LOADED | 71 | 0/71 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/mcp/src/bin/serve.ts | NEVER-LOADED | 71 | 0/71 (0.00%) | 0/42 (0.00%) | 0/15 (0.00%) |
| packages/platform/src/secrets/credential-sets/vault.repo.memory.ts | NEVER-LOADED | 71 | 0/71 (0.00%) | 0/60 (0.00%) | 0/26 (0.00%) |
| packages/ui/src/features/file-dropzone/react/hooks/useFileDropzone.ts | NEVER-LOADED | 71 | 0/71 (0.00%) | 0/26 (0.00%) | 0/18 (0.00%) |
| packages/ui/src/features/skills/rules.ts | NEVER-LOADED | 71 | 0/71 (0.00%) | 0/56 (0.00%) | 0/30 (0.00%) |
| packages/admin/src/agent-plugins/package-file-tree.ts | NEVER-LOADED | 70 | 0/70 (0.00%) | 0/44 (0.00%) | 0/23 (0.00%) |
| packages/cms/src/consent/css-parser.ts | NEVER-LOADED | 70 | 0/70 (0.00%) | 0/58 (0.00%) | 0/9 (0.00%) |
| packages/cms/src/redirects/matcher.ts | NEVER-LOADED | 70 | 0/70 (0.00%) | 0/55 (0.00%) | 0/12 (0.00%) |
| packages/cms/src/taxonomy/repo.memory.ts | NEVER-LOADED | 70 | 0/70 (0.00%) | 0/28 (0.00%) | 0/41 (0.00%) |
| packages/plugins/src/host/node/loader.ts | NEVER-LOADED | 70 | 0/70 (0.00%) | 0/40 (0.00%) | 0/12 (0.00%) |
| packages/ui/src/features/execution/react/hooks/useReasoningControl.ts | NEVER-LOADED | 70 | 0/70 (0.00%) | 0/64 (0.00%) | 0/20 (0.00%) |
| packages/ui/src/features/panel-kit/fetch-query/adapter.react.tsx | NEVER-LOADED | 70 | 0/70 (0.00%) | 0/26 (0.00%) | 0/29 (0.00%) |
| packages/admin/src/comments/rules.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/66 (0.00%) | 0/25 (0.00%) |
| packages/admin/src/forms/react/hooks/use-form-submissions.hooks.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/22 (0.00%) | 0/19 (0.00%) |
| packages/agent-runtime/src/models.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/84 (0.00%) | 0/25 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/sourcemap-hunt.mjs | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/42 (0.00%) | 0/8 (0.00%) |
| packages/cms/src/forms/repo.memory.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/56 (0.00%) | 0/31 (0.00%) |
| packages/cms/src/media/video-frames.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/76 (0.00%) | 0/21 (0.00%) |
| packages/daemon/src/http/frontend-sessions.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/42 (0.00%) | 0/10 (0.00%) |
| packages/daemon/src/run/core/retry.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/56 (0.00%) | 0/12 (0.00%) |
| packages/devops/src/agent-jobs/jobs.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/60 (0.00%) | 0/17 (0.00%) |
| packages/mcp/src/federation/bootstrap.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/26 (0.00%) | 0/13 (0.00%) |
| packages/ui/src/features/tab-launcher-menu/react/hooks/useTabLauncherMenu.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/18 (0.00%) | 0/17 (0.00%) |
| packages/agent-plugins/src/lifecycle/seed-bundled.ts | NEVER-LOADED | 68 | 0/68 (0.00%) | 0/26 (0.00%) | 0/10 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/network-capture.mjs | NEVER-LOADED | 68 | 0/68 (0.00%) | 0/48 (0.00%) | 0/8 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useRuntimeDropUp.hooks.ts | NEVER-LOADED | 68 | 0/68 (0.00%) | 0/34 (0.00%) | 0/16 (0.00%) |
| packages/plugins/src/host/plugin-claims.ts | NEVER-LOADED | 68 | 0/68 (0.00%) | 0/36 (0.00%) | 0/26 (0.00%) |
| packages/cms/src/entries/field-validation.ts | NEVER-LOADED | 67 | 0/67 (0.00%) | 0/50 (0.00%) | 0/16 (0.00%) |
| packages/ui/src/features/iframe-pool/react/dom-sync.ts | NEVER-LOADED | 67 | 0/67 (0.00%) | 0/42 (0.00%) | 0/11 (0.00%) |
| packages/ui/src/features/source-config-list/rules.ts | NEVER-LOADED | 67 | 0/67 (0.00%) | 0/34 (0.00%) | 0/19 (0.00%) |
| packages/ui/src/renderers/renderers/markdown.ts | NEVER-LOADED | 67 | 0/67 (0.00%) | 0/46 (0.00%) | 0/14 (0.00%) |
| packages/ui/src/utils/file-transfer.ts | NEVER-LOADED | 67 | 0/67 (0.00%) | 0/58 (0.00%) | 0/19 (0.00%) |
| packages/admin/src/media/adapters/memory.ts | NEVER-LOADED | 66 | 0/66 (0.00%) | 0/14 (0.00%) | 0/25 (0.00%) |
| packages/admin/src/media/rules.ts | NEVER-LOADED | 66 | 0/66 (0.00%) | 0/76 (0.00%) | 0/23 (0.00%) |
| packages/admin/src/seo/react/pages/SeoPage.tsx | NEVER-LOADED | 66 | 0/66 (0.00%) | 0/78 (0.00%) | 0/26 (0.00%) |
| packages/chat/src/core/durable-projection.ts | NEVER-LOADED | 66 | 0/66 (0.00%) | 0/78 (0.00%) | 0/19 (0.00%) |
| packages/cms/src/media/content-type-sniffer.ts | NEVER-LOADED | 66 | 0/66 (0.00%) | 0/38 (0.00%) | 0/24 (0.00%) |
| packages/daemon/src/agent-executor/event-translation.ts | NEVER-LOADED | 66 | 0/66 (0.00%) | 0/72 (0.00%) | 0/21 (0.00%) |
| packages/server/src/store/projects/sqlite.ts | NEVER-LOADED | 66 | 0/66 (0.00%) | 0/50 (0.00%) | 0/15 (0.00%) |
| packages/cms/src/forms/express/handler.ts | NEVER-LOADED | 65 | 0/65 (0.00%) | 0/38 (0.00%) | 0/12 (0.00%) |
| packages/cms/src/widgets/region-area-service.ts | NEVER-LOADED | 65 | 0/65 (0.00%) | 0/30 (0.00%) | 0/10 (0.00%) |
| packages/devops/src/static-export/node-adapters.ts | NEVER-LOADED | 65 | 0/65 (0.00%) | 0/34 (0.00%) | 0/14 (0.00%) |
| packages/ui/src/features/connectors/dependencies.ts | NEVER-LOADED | 65 | 0/65 (0.00%) | 0/38 (0.00%) | 0/32 (0.00%) |
| packages/ui/src/features/html-editor/source-splice.ts | NEVER-LOADED | 65 | 0/65 (0.00%) | 0/42 (0.00%) | 0/15 (0.00%) |
| packages/admin/src/react/entities/use-entity-edit.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/70 (0.00%) | 0/21 (0.00%) |
| packages/cms/src/content-types/lifecycle.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/32 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/file-dropzone/react/hooks/useFileDropzonePreviews.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/24 (0.00%) | 0/15 (0.00%) |
| packages/ui/src/features/media-providers/rules.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/52 (0.00%) | 0/25 (0.00%) |
| packages/ui/src/renderers/annotation-canvas/rules.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/30 (0.00%) | 0/19 (0.00%) |
| packages/admin/src/comments/conformance/comments-api.conformance.ts | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/20 (0.00%) | 0/15 (0.00%) |
| packages/agent-plugins/src/folder-zip.ts | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/18 (0.00%) | 0/9 (0.00%) |
| packages/agent-plugins/src/lifecycle/retire-bundled.ts | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/42 (0.00%) | 0/9 (0.00%) |
| packages/chat/src/core/assistant-client/durable-run-subscription.ts | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/46 (0.00%) | 0/15 (0.00%) |
| packages/chat/src/core/partial-json.ts | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/36 (0.00%) | 0/8 (0.00%) |
| packages/chat/src/core/todos.ts | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/52 (0.00%) | 0/19 (0.00%) |
| packages/cms/src/media/tool-registrations.ts | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/44 (0.00%) | 0/17 (0.00%) |
| packages/plugins/src/glue/manifest.ts | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/54 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/68 (0.00%) | 0/21 (0.00%) |
| packages/ui/src/features/file-dropzone/react/hooks/useFileDialogTracking.ts | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/16 (0.00%) | 0/15 (0.00%) |
| packages/ui/src/features/mcp-ui/resource.ts | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/68 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/memory/react/components/MemoryConnectedPanel.tsx | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/92 (0.00%) | 0/24 (0.00%) |
| packages/ui/src/features/source-config-list/react/hooks/useSourceConfigList.ts | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/18 (0.00%) | 0/28 (0.00%) |
| packages/admin/src/media/react/hooks/UploadButton.hooks.ts | NEVER-LOADED | 62 | 0/62 (0.00%) | 0/50 (0.00%) | 0/22 (0.00%) |
| packages/chat/src/core/assistant-client/ag-ui-transport.ts | NEVER-LOADED | 62 | 0/62 (0.00%) | 0/28 (0.00%) | 0/21 (0.00%) |
| packages/cms/src/comments/ingress.ts | NEVER-LOADED | 62 | 0/62 (0.00%) | 0/42 (0.00%) | 0/11 (0.00%) |
| packages/mcp/src/server/tool-protocol.ts | NEVER-LOADED | 62 | 0/62 (0.00%) | 0/44 (0.00%) | 0/11 (0.00%) |
| packages/oauth/src/pending-authorizations.ts | NEVER-LOADED | 62 | 0/62 (0.00%) | 0/38 (0.00%) | 0/16 (0.00%) |
| packages/platform/src/resource-paths.ts | NEVER-LOADED | 62 | 0/62 (0.00%) | 0/42 (0.00%) | 0/12 (0.00%) |
| packages/agent-plugins/src/lifecycle/bundled-source-archive.ts | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/20 (0.00%) | 0/9 (0.00%) |
| packages/cms/src/comments/sql/repo.ts | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/26 (0.00%) | 0/34 (0.00%) |
| packages/cms/src/widgets/resolvers/index.ts | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/22 (0.00%) | 0/12 (0.00%) |
| packages/mcp/src/server/tool-server.ts | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/30 (0.00%) | 0/25 (0.00%) |
| packages/server/src/host-bootstrap.ts | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/30 (0.00%) | 0/17 (0.00%) |
| packages/ui-kit/src/react/testing/driver.ts | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/76 (0.00%) | 0/12 (0.00%) |
| packages/ui/src/features/asset-grid/react/components/AssetGrid.tsx | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/34 (0.00%) | 0/22 (0.00%) |
| packages/ui/src/features/asset-grid/react/hooks/useRubberBandDrag.ts | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/24 (0.00%) | 0/9 (0.00%) |
| packages/agent-runtime/src/prompt-budget.ts | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/58 (0.00%) | 0/8 (0.00%) |
| packages/artifacts/src/node/stub-guard.ts | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/28 (0.00%) | 0/11 (0.00%) |
| packages/chat/src/core/browser/page-actions.ts | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/58 (0.00%) | 0/22 (0.00%) |
| packages/cms/src/content-types/errors.ts | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/4 (0.00%) | 0/14 (0.00%) |
| packages/cms/src/widgets/resolvers/recent-entries.ts | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/22 (0.00%) | 0/21 (0.00%) |
| packages/core/plugin-directory.js | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/86 (0.00%) | 0/17 (0.00%) |
| packages/daemon/src/session-coordination.ts | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/42 (0.00%) | 0/27 (0.00%) |
| packages/server/src/feature-activation.ts | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/42 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/mcp-ui/surfaces/confirmation.ts | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/58 (0.00%) | 0/15 (0.00%) |
| packages/ui/src/features/observability/white-screen.ts | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/46 (0.00%) | 0/14 (0.00%) |
| packages/ui/src/react/components/RemixIcon.stylesheet.ts | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/30 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/renderers/preview-modal-shell/react/components/PreviewModalShell.tsx | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/74 (0.00%) | 0/24 (0.00%) |
| packages/admin/src/comments/react/hooks/use-comment-queue.hooks.ts | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/24 (0.00%) | 0/26 (0.00%) |
| packages/chat/src/react/features/chat-pane/components/AgentRuntimePicker.tsx | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/94 (0.00%) | 0/19 (0.00%) |
| packages/chat/src/react/hooks/useComposerHistoryKeys.hooks.ts | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/28 (0.00%) | 0/10 (0.00%) |
| packages/cms/src/taxonomy/validation-chain.ts | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/26 (0.00%) | 0/10 (0.00%) |
| packages/oauth/src/loopback-callback.ts | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/38 (0.00%) | 0/8 (0.00%) |
| packages/ui-kit/src/react/native/Navigation.hooks.ts | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/57 (0.00%) | 0/32 (0.00%) |
| packages/ui/src/features/connectors/components/ConnectorCard.tsx | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/60 (0.00%) | 0/18 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/hooks/useResourceRowList.ts | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/16 (0.00%) | 0/15 (0.00%) |
| packages/admin/src/media/html-attributes.ts | NEVER-LOADED | 58 | 0/58 (0.00%) | 0/37 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/redirects/conformance/redirects-api.conformance.ts | NEVER-LOADED | 58 | 0/58 (0.00%) | 0/20 (0.00%) | 0/22 (0.00%) |
| packages/admin/src/widgets/adapters/memory.ts | NEVER-LOADED | 58 | 0/58 (0.00%) | 0/42 (0.00%) | 0/25 (0.00%) |
| packages/cms/src/consent/html/resources.ts | NEVER-LOADED | 58 | 0/58 (0.00%) | 0/54 (0.00%) | 0/13 (0.00%) |
| packages/platform/src/fs/verified-file-relocation.ts | NEVER-LOADED | 58 | 0/58 (0.00%) | 0/14 (0.00%) | 0/15 (0.00%) |
| packages/admin/src/react/entities/rules.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/34 (0.00%) | 0/19 (0.00%) |
| packages/admin/src/security/adapters/http.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/78 (0.00%) | 0/36 (0.00%) |
| packages/cms/src/media/import/fetch-image.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/46 (0.00%) | 0/9 (0.00%) |
| packages/cms/src/navigation/tool-registrations.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/36 (0.00%) | 0/15 (0.00%) |
| packages/cms/src/widgets/html/html-embeds.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/42 (0.00%) | 0/17 (0.00%) |
| packages/platform/src/http/guarded/transport.fetch.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/38 (0.00%) | 0/10 (0.00%) |
| packages/ui-kit/src/react/confirm/ConfirmDialog.hooks.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/60 (0.00%) | 0/20 (0.00%) |
| packages/ui-kit/src/react/Kit.hooks.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/38 (0.00%) | 0/23 (0.00%) |
| packages/ui/src/features/integrations/rules.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/37 (0.00%) | 0/17 (0.00%) |
| packages/ui/src/features/mcp-ui/confirmation-store.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/28 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/utils/smooth-scroll-to-top.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/22 (0.00%) | 0/10 (0.00%) |
| packages/chat/src/core/util/recover.ts | NEVER-LOADED | 56 | 0/56 (0.00%) | 0/36 (0.00%) | 0/6 (0.00%) |
| packages/chat/src/react/components/McpUiSurfaceCard.tsx | NEVER-LOADED | 56 | 0/56 (0.00%) | 0/58 (0.00%) | 0/14 (0.00%) |
| packages/cms/src/seo/media.ts | NEVER-LOADED | 56 | 0/56 (0.00%) | 0/50 (0.00%) | 0/11 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeBrowserParts.tsx | NEVER-LOADED | 56 | 0/56 (0.00%) | 0/28 (0.00%) | 0/19 (0.00%) |
| packages/chat/src/embed-widget/react/embed.tsx | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/22 (0.00%) | 0/16 (0.00%) |
| packages/chat/src/react/message-blocks.ts | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/46 (0.00%) | 0/12 (0.00%) |
| packages/cms/src/listing/html.ts | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/28 (0.00%) | 0/14 (0.00%) |
| packages/cms/src/media/repo.memory.ts | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/44 (0.00%) | 0/43 (0.00%) |
| packages/plugins/src/host/claim-conflicts.ts | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/36 (0.00%) | 0/16 (0.00%) |
| packages/server/src/kernel-base.ts | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/24 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/admin-widgets/components/InfoTip.hooks.tsx | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/30 (0.00%) | 0/11 (0.00%) |
| packages/ui/src/react/components/remixicon-font-recovery.ts | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/28 (0.00%) | 0/13 (0.00%) |
| packages/ui/src/utils/auto-open-file.ts | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/48 (0.00%) | 0/17 (0.00%) |
| packages/admin/src/widgets/controllers/instance-editor.controller.ts | NEVER-LOADED | 54 | 0/54 (0.00%) | 0/36 (0.00%) | 0/15 (0.00%) |
| packages/agent-plugins/src/lifecycle/trusted-plugin-files.ts | NEVER-LOADED | 54 | 0/54 (0.00%) | 0/22 (0.00%) | 0/7 (0.00%) |
| packages/cms/src/consent/html/render.ts | NEVER-LOADED | 54 | 0/54 (0.00%) | 0/56 (0.00%) | 0/14 (0.00%) |
| packages/mcp/src/tools/ask-choice/question.ts | NEVER-LOADED | 54 | 0/54 (0.00%) | 0/80 (0.00%) | 0/12 (0.00%) |
| packages/ui/src/features/mention-autocomplete/react/hooks/useMentionAutocomplete.ts | NEVER-LOADED | 54 | 0/54 (0.00%) | 0/18 (0.00%) | 0/17 (0.00%) |
| packages/ui/src/features/resource-dashboard/rules.ts | NEVER-LOADED | 54 | 0/54 (0.00%) | 0/36 (0.00%) | 0/16 (0.00%) |
| packages/ui/src/features/version-manager/rules.ts | NEVER-LOADED | 54 | 0/54 (0.00%) | 0/40 (0.00%) | 0/19 (0.00%) |
| packages/agent-runtime/src/claude-segment-usage.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/68 (0.00%) | 0/14 (0.00%) |
| packages/chat/src/store/legacy/sqlite/conversations.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/42 (0.00%) | 0/14 (0.00%) |
| packages/cms/src/widgets/markers/html-attributes.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/40 (0.00%) | 0/8 (0.00%) |
| packages/commerce/src/payments/credentials.ts | LOADED | 53 | 0/53 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/daemon/src/http/research-tavily.adapter.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/36 (0.00%) | 0/11 (0.00%) |
| packages/platform/src/fs/directory-registry.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/54 (0.00%) | 0/33 (0.00%) |
| packages/platform/src/fs/directory-sync.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/38 (0.00%) | 0/22 (0.00%) |
| packages/ui/src/features/tab-strip/react/components/TabBar.hooks.tsx | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/50 (0.00%) | 0/16 (0.00%) |
| packages/admin/src/forms/adapters/memory.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/48 (0.00%) | 0/33 (0.00%) |
| packages/chat/src/react/components/composer-discovery.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/50 (0.00%) | 0/13 (0.00%) |
| packages/cms/src/core/commands/command.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/28 (0.00%) | 0/8 (0.00%) |
| packages/cms/src/redirects/sql/repo.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/26 (0.00%) | 0/36 (0.00%) |
| packages/daemon/src/agent-executor/mcp-bridge-probe.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/10 (0.00%) | 0/14 (0.00%) |
| packages/oauth/src/token-endpoint.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/58 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/sketch-editor/react/hooks/useSketchScene.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/14 (0.00%) | 0/9 (0.00%) |
| packages/admin/src/agent-plugins/controllers/agent-plugins.controller.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/56 (0.00%) | 0/23 (0.00%) |
| packages/admin/src/security/rules.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/84 (0.00%) | 0/28 (0.00%) |
| packages/admin/src/source-control/conformance/source-control-api.conformance.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/14 (0.00%) | 0/19 (0.00%) |
| packages/admin/src/widgets/conformance/widgets-api.conformance.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/12 (0.00%) | 0/22 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/capability-declarations.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/40 (0.00%) | 0/11 (0.00%) |
| packages/chat/src/core/user-text-redaction.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/46 (0.00%) | 0/14 (0.00%) |
| packages/chat/src/core/util/markdown-context.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/34 (0.00%) | 0/7 (0.00%) |
| packages/daemon/src/core/tool-audit.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/28 (0.00%) | 0/19 (0.00%) |
| packages/daemon/src/http/db-ops.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/24 (0.00%) | 0/16 (0.00%) |
| packages/db/src/kernel/typegen.ts | LOADED | 51 | 15/66 (22.73%) | 0/0 (100.00%) | 0/3 (0.00%) |
| packages/ui-kit/src/react/confirm/guard.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/52 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/react/components/HeaderActionsMenu.tsx | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/26 (0.00%) | 0/25 (0.00%) |
| packages/ui/src/react/components/PaletteTweaks.tsx | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/26 (0.00%) | 0/20 (0.00%) |
| packages/ui/src/renderers/annotation-canvas/react/components/AnnotationCanvas.tsx | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/76 (0.00%) | 0/36 (0.00%) |
| packages/agent-plugins/src/lifecycle/index.ts | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/12 (0.00%) | 0/39 (0.00%) |
| packages/chat/src/react/index.ts | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/oauth/src/device-code.ts | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/38 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/react/components/Toast.tsx | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/26 (0.00%) | 0/17 (0.00%) |
| packages/admin/src/media/react/hooks/MediaPage.hooks.ts | NEVER-LOADED | 49 | 0/49 (0.00%) | 0/34 (0.00%) | 0/17 (0.00%) |
| packages/admin/src/security/controllers/access-tokens.controller.ts | NEVER-LOADED | 49 | 0/49 (0.00%) | 0/60 (0.00%) | 0/20 (0.00%) |
| packages/admin/src/seo/adapters/memory.ts | NEVER-LOADED | 49 | 0/49 (0.00%) | 0/32 (0.00%) | 0/20 (0.00%) |
| packages/agent-plugins/src/folder-zip-node.ts | NEVER-LOADED | 49 | 0/49 (0.00%) | 0/26 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/widgets/gallery-resolver.ts | NEVER-LOADED | 49 | 0/49 (0.00%) | 0/40 (0.00%) | 0/14 (0.00%) |
| packages/commerce/src/http/payments-webhook.ts | LOADED | 49 | 0/49 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/platform/src/fs.ts | NEVER-LOADED | 49 | 0/49 (0.00%) | 0/24 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/features/notifications/react/components/NotificationsTab.tsx | NEVER-LOADED | 49 | 0/49 (0.00%) | 0/30 (0.00%) | 0/13 (0.00%) |
| packages/ui/src/features/resource-dashboard/dependencies.ts | NEVER-LOADED | 49 | 0/49 (0.00%) | 0/40 (0.00%) | 0/22 (0.00%) |
| packages/admin/src/seo/react/hooks/use-share-image-warning.hooks.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/32 (0.00%) | 0/15 (0.00%) |
| packages/admin/src/widgets/rules.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/46 (0.00%) | 0/15 (0.00%) |
| packages/agent-plugins/src/lifecycle/package-paths.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/22 (0.00%) | 0/7 (0.00%) |
| packages/chat/src/core/util/manifest.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/48 (0.00%) | 0/13 (0.00%) |
| packages/commerce/src/catalog/checkout.ts | LOADED | 48 | 0/48 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/devops/src/source-control/commit.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/24 (0.00%) | 0/10 (0.00%) |
| packages/mcp/src/server/tool-arguments.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/58 (0.00%) | 0/15 (0.00%) |
| packages/ui/src/features/iframe-pool/react/components/IframeKeepAliveProvider.tsx | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/16 (0.00%) | 0/12 (0.00%) |
| packages/ui/src/features/integrations/react/components/IntegrationsTab.tsx | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/48 (0.00%) | 0/14 (0.00%) |
| packages/ui/src/features/mcp-ui/surfaces/document.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/34 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/features/viewer-shell/react/hooks/useCommentReorder.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/36 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/react/components/LanguageMenu.tsx | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/26 (0.00%) | 0/22 (0.00%) |
| packages/admin/src/forms/react/hooks/use-forms-list.hooks.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/22 (0.00%) | 0/18 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/delivery-bindings.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/40 (0.00%) | 0/20 (0.00%) |
| packages/agent-plugins/src/lifecycle/installed-package-index.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/26 (0.00%) | 0/9 (0.00%) |
| packages/agent-runtime/src/agent-protocol/acp/rpc.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/48 (0.00%) | 0/10 (0.00%) |
| packages/cms/src/widgets/entry-payload.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/16 (0.00%) | 0/13 (0.00%) |
| packages/db/src/recovery/degraded-banners.ts | LOADED | 47 | 0/47 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/devops/src/packaging/electron/archive.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/30 (0.00%) | 0/18 (0.00%) |
| packages/mcp/src/federation/registrations.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/30 (0.00%) | 0/10 (0.00%) |
| packages/oauth/src/registration.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/56 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/browser/useFileDropTarget.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/10 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/renderers/annotation-canvas/react/hooks/useAnnotationCanvas.controller.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/52 (0.00%) | 0/16 (0.00%) |
| packages/admin/src/browser/navigation.ts | NEVER-LOADED | 46 | 0/46 (0.00%) | 0/38 (0.00%) | 0/10 (0.00%) |
| packages/admin/src/core/transport/http.ts | NEVER-LOADED | 46 | 0/46 (0.00%) | 0/34 (0.00%) | 0/12 (0.00%) |
| packages/admin/src/forms/conformance/forms-api.conformance.ts | NEVER-LOADED | 46 | 0/46 (0.00%) | 0/18 (0.00%) | 0/13 (0.00%) |
| packages/admin/src/media/react/hooks/EditMediaPanel.hooks.ts | NEVER-LOADED | 46 | 0/46 (0.00%) | 0/46 (0.00%) | 0/18 (0.00%) |
| packages/agent-plugins/src/lifecycle/capability-projection.ts | NEVER-LOADED | 46 | 0/46 (0.00%) | 0/10 (0.00%) | 0/9 (0.00%) |
| packages/agent-runtime/src/model-discovery-shared.ts | NEVER-LOADED | 46 | 0/46 (0.00%) | 0/42 (0.00%) | 0/12 (0.00%) |
| packages/cms/src/trash/sweeper.ts | NEVER-LOADED | 46 | 0/46 (0.00%) | 0/26 (0.00%) | 0/9 (0.00%) |
| packages/devops/src/local-dev/index.ts | NEVER-LOADED | 46 | 0/46 (0.00%) | 0/26 (0.00%) | 0/12 (0.00%) |
| packages/agent-plugins/src/lifecycle/tools/manifest.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/44 (0.00%) | 0/9 (0.00%) |
| packages/cms/src/media/rendition-service.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/22 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/seo/page-head.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/34 (0.00%) | 0/7 (0.00%) |
| packages/mcp/src/federation/approvals/remembered-approval.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/44 (0.00%) | 0/8 (0.00%) |
| packages/mcp/src/federation/testing/adapter.memory.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/36 (0.00%) | 0/20 (0.00%) |
| packages/ui/src/features/connectors/hooks/useConnectorDetail.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/36 (0.00%) | 0/16 (0.00%) |
| packages/ui/src/features/execution/react/components/ExecutionTab.tsx | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/48 (0.00%) | 0/20 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/index.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/agent-plugins/react/hooks/AgentPluginInspector.hooks.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/68 (0.00%) | 0/25 (0.00%) |
| packages/admin/src/comments/controllers/comment-settings.controller.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/20 (0.00%) | 0/5 (0.00%) |
| packages/artifacts/src/stub-guard.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/32 (0.00%) | 0/7 (0.00%) |
| packages/commerce/src/catalog/status.ts | LOADED | 44 | 0/44 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/mcp/src/federation/mcp-protocol.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/40 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/source-config-list/dependencies.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/40 (0.00%) | 0/24 (0.00%) |
| packages/ui/src/theme/apply.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/28 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/utils/dom-subscriptions.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/26 (0.00%) | 0/21 (0.00%) |
| packages/admin/src/forms/react/hooks/forms-view.hooks.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/38 (0.00%) | 0/61 (0.00%) |
| packages/admin/src/media/conformance/media-api.conformance.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/14 (0.00%) | 0/12 (0.00%) |
| packages/admin/src/security/react/hooks/AccessTokensTab.hooks.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/52 (0.00%) | 0/29 (0.00%) |
| packages/agent-runtime/src/anthropic-live-models.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/26 (0.00%) | 0/7 (0.00%) |
| packages/agent-runtime/src/copilot-stream.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/42 (0.00%) | 0/13 (0.00%) |
| packages/agent-runtime/src/index.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/core/persistence/title.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/30 (0.00%) | 0/9 (0.00%) |
| packages/cms/src/forms/submission-attempts.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/22 (0.00%) | 0/10 (0.00%) |
| packages/cms/src/trash/repo.memory.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/36 (0.00%) | 0/24 (0.00%) |
| packages/cms/src/widgets/errors.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/0 (0.00%) | 0/12 (0.00%) |
| packages/cms/src/widgets/html/gallery-render.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/46 (0.00%) | 0/10 (0.00%) |
| packages/core/src/args-convention.typecheck.ts | LOADED | 43 | 0/43 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/daemon/src/tool-recovery/redaction.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/28 (0.00%) | 0/15 (0.00%) |
| packages/ui/src/features/charts/react.tsx | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/20 (0.00%) | 0/11 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/mention-node.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/18 (0.00%) | 0/12 (0.00%) |
| packages/ui/src/react/hooks/useEdgeAutoScroll.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/14 (0.00%) | 0/9 (0.00%) |
| packages/admin/src/react/shell/use-admin-shell-session.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/26 (0.00%) | 0/9 (0.00%) |
| packages/admin/src/redirects/adapters/memory.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/34 (0.00%) | 0/13 (0.00%) |
| packages/admin/src/widgets/controllers/region-editor.controller.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/22 (0.00%) | 0/16 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/host-validator.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/44 (0.00%) | 0/9 (0.00%) |
| packages/agent-plugins/src/lifecycle/contribution-loader.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/22 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/features/chat-pane/model-options.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/48 (0.00%) | 0/12 (0.00%) |
| packages/chat/src/react/hooks/useQuestionForms.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/32 (0.00%) | 0/15 (0.00%) |
| packages/cms/src/comments/write-service.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/24 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/admin-widgets/components/SuggestInput/SuggestInput.hooks.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/32 (0.00%) | 0/12 (0.00%) |
| packages/ui/src/features/source-config-list/react/components/SourceConfigField.tsx | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/38 (0.00%) | 0/12 (0.00%) |
| packages/ui/src/utils/polygon-selection.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/24 (0.00%) | 0/12 (0.00%) |
| packages/ui/vitest.setup.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/38 (0.00%) | 0/47 (0.00%) |
| packages/admin/src/core/manifest/rules.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/46 (0.00%) | 0/18 (0.00%) |
| packages/admin/src/forms/react/hooks/use-form-submission-detail.hooks.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/16 (0.00%) | 0/13 (0.00%) |
| packages/admin/src/security/adapters/memory.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/76 (0.00%) | 0/42 (0.00%) |
| packages/charts-recharts/src/mount.tsx | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/26 (0.00%) | 0/14 (0.00%) |
| packages/chat/src/core/durable-runs/continuation.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/42 (0.00%) | 0/17 (0.00%) |
| packages/chat/src/embed-widget/browser/session-store.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/36 (0.00%) | 0/10 (0.00%) |
| packages/cms/src/comments/repo.memory.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/46 (0.00%) | 0/25 (0.00%) |
| packages/cms/src/content-types/field-defs.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/28 (0.00%) | 0/5 (0.00%) |
| packages/cms/src/media/blob-store.fs.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/14 (0.00%) | 0/12 (0.00%) |
| packages/daemon/src/event-log.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/30 (0.00%) | 0/7 (0.00%) |
| packages/db/src/recovery/migrate-forward-execute.ts | LOADED | 41 | 0/41 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/a2ui/renderer.tsx | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/26 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/about/rules.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/48 (0.00%) | 0/16 (0.00%) |
| packages/ui/src/features/html-editor/editor-serialization.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/24 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/react/components/BrandLogo.tsx | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/30 (0.00%) | 0/13 (0.00%) |
| packages/agent-plugins/src/lifecycle/search.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/50 (0.00%) | 0/26 (0.00%) |
| packages/chat/src/react/hooks/useChatFabDrag.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/22 (0.00%) | 0/9 (0.00%) |
| packages/chat/src/react/tool-call-display.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/30 (0.00%) | 0/11 (0.00%) |
| packages/cms/src/content-types/index-provisioning.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/18 (0.00%) | 0/9 (0.00%) |
| packages/cms/src/forms/sql/repo.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/20 (0.00%) | 0/29 (0.00%) |
| packages/cms/src/media/sanitize-svg.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/28 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/core.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFileRow.tsx | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/32 (0.00%) | 0/19 (0.00%) |
| packages/ui/src/features/connectors/hooks/useConnectorCatalog.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/18 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/hooks/useKeyboardCommands.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/16 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/mention-autocomplete/rules.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/16 (0.00%) | 0/12 (0.00%) |
| packages/ui/src/features/schedule-picker/rules.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/28 (0.00%) | 0/11 (0.00%) |
| packages/agent-runtime/src/role-marker-guard.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/22 (0.00%) | 0/4 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/init-clone.mjs | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/42 (0.00%) | 0/4 (0.00%) |
| packages/chat/src/core/composer-history.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/44 (0.00%) | 0/9 (0.00%) |
| packages/cms/src/content-types/tool-registrations.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/6 (0.00%) | 0/17 (0.00%) |
| packages/cms/src/media/html-attributes.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/28 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/navigation/repo.memory.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/38 (0.00%) | 0/28 (0.00%) |
| packages/cms/src/redirects/repo.memory.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/46 (0.00%) | 0/28 (0.00%) |
| packages/daemon/src/agent-executor/run-output.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/44 (0.00%) | 0/10 (0.00%) |
| packages/daemon/src/routines/routine-store.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/54 (0.00%) | 0/20 (0.00%) |
| packages/platform/src/secrets/credential-sets/vault.meta.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/50 (0.00%) | 0/14 (0.00%) |
| packages/ui/src/features/about/react/components/AboutTab.tsx | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/22 (0.00%) | 0/13 (0.00%) |
| packages/ui/src/features/execution/react/hooks/useLocalCliAgentCard.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/25 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/integrations/react/hooks/useCodexInstallToggle.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/8 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/observability/stuck-run.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/22 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/panel-kit/hooks/use-focus-trap.hooks.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/40 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/tab-strip/rules.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/34 (0.00%) | 0/13 (0.00%) |
| packages/ui/src/react/hooks/useBrandFonts.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/22 (0.00%) | 0/13 (0.00%) |
| packages/ui/src/utils/design-md.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/26 (0.00%) | 0/11 (0.00%) |
| packages/chat/src/store/sql/cursor.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/30 (0.00%) | 0/13 (0.00%) |
| packages/cms/src/consent/policy.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/54 (0.00%) | 0/10 (0.00%) |
| packages/cms/src/media/document-read.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/40 (0.00%) | 0/6 (0.00%) |
| packages/cms/src/widgets/html/legacy-widget-markers.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/18 (0.00%) | 0/10 (0.00%) |
| packages/oauth/src/oidc.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/32 (0.00%) | 0/7 (0.00%) |
| packages/oauth/src/registry.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/26 (0.00%) | 0/7 (0.00%) |
| packages/plugins/src/host/activation.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/16 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/browser-chrome/react/hooks/useBrowserNavigationStack.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/14 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/features/iframe-pool/react/components/PooledIframe.tsx | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/4 (0.00%) | 0/12 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/hooks/useMentionAtomicNavigation.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/40 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/observability/boot-timing.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/26 (0.00%) | 0/11 (0.00%) |
| packages/ui/src/features/sketch-editor/react/hooks/useSketchDomEnhancements.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/10 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/security/controllers/root-key.controller.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/48 (0.00%) | 0/18 (0.00%) |
| packages/admin/src/widgets/react/hooks/WidgetsQuery.hooks.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/2 (0.00%) | 0/32 (0.00%) |
| packages/chat/src/react/hooks/useCopyToClipboard.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/8 (0.00%) | 0/6 (0.00%) |
| packages/db/src/transfer/sqlite-source.ts | LOADED | 37 | 31/68 (45.59%) | 12/14 (85.71%) | 8/13 (61.54%) |
| packages/devops/src/packaging/electron/imports.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/22 (0.00%) | 0/6 (0.00%) |
| packages/devops/src/packaging/electron/policies.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/36 (0.00%) | 0/12 (0.00%) |
| packages/ui/src/features/source-config-list/react/hooks/useSourceConfigAddForm.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/10 (0.00%) | 0/9 (0.00%) |
| packages/admin/src/comments/adapters/memory.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/34 (0.00%) | 0/19 (0.00%) |
| packages/admin/src/core/routing/rules.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/36 (0.00%) | 0/7 (0.00%) |
| packages/admin/src/react/components/InteractiveHtmlEditor/InteractiveHtmlEditor.tsx | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/32 (0.00%) | 0/10 (0.00%) |
| packages/admin/src/react/entities/contribution.tsx | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/40 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/react/shell/use-admin-theme.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/34 (0.00%) | 0/11 (0.00%) |
| packages/agent-runtime/src/agent-protocol/acp/json.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/28 (0.00%) | 0/11 (0.00%) |
| packages/chat/src/react/features/chat-pane/create-mcp-ui-tool-caller.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/34 (0.00%) | 0/5 (0.00%) |
| packages/daemon/src/core/read-only-tools.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/20 (0.00%) | 0/22 (0.00%) |
| packages/mcp/src/server/tools/run-tools.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/12 (0.00%) | 0/7 (0.00%) |
| packages/platform/src/fs/directory-running-lock.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/44 (0.00%) | 0/14 (0.00%) |
| packages/plugins/src/host/uninstall.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/18 (0.00%) | 0/8 (0.00%) |
| packages/plugins/src/host/worker/run-call.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/14 (0.00%) | 0/3 (0.00%) |
| packages/ui-kit/src/react/native/Dialog.hooks.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/44 (0.00%) | 0/12 (0.00%) |
| packages/ui/src/features/connectors/ConnectorsBrowser.tsx | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/22 (0.00%) | 0/15 (0.00%) |
| packages/ui/src/features/media-providers/react/components/MediaProvidersTab.tsx | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/26 (0.00%) | 0/15 (0.00%) |
| packages/admin/src/source-control/controllers/source-control.controller.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/46 (0.00%) | 0/18 (0.00%) |
| packages/admin/src/widgets/controllers/library.controller.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/24 (0.00%) | 0/10 (0.00%) |
| packages/chat/src/core/tool-events.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/38 (0.00%) | 0/7 (0.00%) |
| packages/chat/src/core/util/pointer.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/28 (0.00%) | 0/13 (0.00%) |
| packages/chat/src/embed-widget/react/dialog.hooks.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/20 (0.00%) | 0/10 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneFileDrop.hooks.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/26 (0.00%) | 0/10 (0.00%) |
| packages/cms/scripts/check-packaging.mjs | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/28 (0.00%) | 0/6 (0.00%) |
| packages/core/src/batch-tool-inputs.ts | LOADED | 35 | 105/140 (75.00%) | 40/54 (74.07%) | 10/13 (76.92%) |
| packages/mcp/src/federation/refusal-notice.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/14 (0.00%) | 0/12 (0.00%) |
| packages/oauth/src/endpoint-safety.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/22 (0.00%) | 0/8 (0.00%) |
| packages/platform/src/aws-sigv4.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/6 (0.00%) | 0/9 (0.00%) |
| packages/platform/src/mail/smtp.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/30 (0.00%) | 0/11 (0.00%) |
| packages/ui-kit/src/react/native/Controls.hooks.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/74 (0.00%) | 0/18 (0.00%) |
| packages/ui-kit/src/react/native/Controls.tsx | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/0 (0.00%) | 0/11 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeBatchActions.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/12 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/command-palette/react/hooks/useCommandPalette.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/18 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/iframe-pool/react/hooks/useIframeKeepAlivePool.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/6 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/react/components/EditorIcon.tsx | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/2 (0.00%) | 0/9 (0.00%) |
| packages/admin/src/react/shell/AdminShell.tsx | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/40 (0.00%) | 0/10 (0.00%) |
| packages/admin/src/seo/react/hooks/SeoQuery.hooks.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/0 (0.00%) | 0/22 (0.00%) |
| packages/agent-runtime/src/env.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/19 (0.00%) | 0/6 (0.00%) |
| packages/agent-runtime/src/terminal-launch.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/core/assistant-client/a2ui-action-poster.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/26 (0.00%) | 0/6 (0.00%) |
| packages/commerce/src/payments/registry.ts | LOADED | 34 | 0/34 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/commerce/src/payments/state-machine.ts | LOADED | 34 | 0/34 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/daemon/src/http/active-context.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/20 (0.00%) | 0/6 (0.00%) |
| packages/platform/src/child-environment.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/18 (0.00%) | 0/10 (0.00%) |
| packages/platform/src/fs/user-data-directories.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/34 (0.00%) | 0/11 (0.00%) |
| packages/platform/src/secrets/secret-sealer.aesgcm.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/12 (0.00%) | 0/5 (0.00%) |
| packages/server/src/lifecycle/boot-lifecycle.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/14 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/admin-widgets/components/InfoTip.rules.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/28 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/useAssetTreeBrowserController.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/8 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/observability/long-task.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/18 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/features/tab-launcher-menu/rules.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/22 (0.00%) | 0/10 (0.00%) |
| packages/admin/src/agent-plugins/react/hooks/AgentPluginPanel.hooks.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/40 (0.00%) | 0/15 (0.00%) |
| packages/admin/src/seo/conformance/seo-api.conformance.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/14 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/seo/react/components/SitemapModal.tsx | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/18 (0.00%) | 0/7 (0.00%) |
| packages/agent-runtime/src/providers/pkce.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/14 (0.00%) | 0/23 (0.00%) |
| packages/artifacts/src/store.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/20 (0.00%) | 0/10 (0.00%) |
| packages/chat/src/react/components/MessageList.hooks.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/14 (0.00%) | 0/9 (0.00%) |
| packages/chat/src/react/hooks/context.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/6 (0.00%) | 0/12 (0.00%) |
| packages/chat/src/react/hooks/last-conversation-store.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/18 (0.00%) | 0/8 (0.00%) |
| packages/cms/src/navigation/resolver.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| packages/cms/src/redirects/target-gate.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/28 (0.00%) | 0/6 (0.00%) |
| packages/db/src/kernel/schema-shape.ts | LOADED | 33 | 58/91 (63.74%) | 32/36 (88.89%) | 4/6 (66.67%) |
| packages/oauth/src/file-registration-cache.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/24 (0.00%) | 0/14 (0.00%) |
| packages/ui/src/features/asset-grid/dependencies.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/22 (0.00%) | 0/17 (0.00%) |
| packages/ui/src/features/command-palette/rules.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/26 (0.00%) | 0/14 (0.00%) |
| packages/ui/src/features/i18n/context.tsx | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/18 (0.00%) | 0/13 (0.00%) |
| packages/ui/src/features/memory/react/components/MemoryList.tsx | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/26 (0.00%) | 0/18 (0.00%) |
| packages/admin/src/agent-plugins/react/hooks/AgentPluginsPage.hooks.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/28 (0.00%) | 0/15 (0.00%) |
| packages/admin/src/media/controllers/providers.controller.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/18 (0.00%) | 0/10 (0.00%) |
| packages/admin/src/media/react/index.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/8 (0.00%) | 0/12 (0.00%) |
| packages/agent-runtime/src/defs/shared.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/36 (0.00%) | 0/7 (0.00%) |
| packages/chat/src/react/components/ChatSettingsDialog.tsx | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/64 (0.00%) | 0/15 (0.00%) |
| packages/cms/src/comments/express/submit-handler.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/28 (0.00%) | 0/6 (0.00%) |
| packages/cms/src/entries/errors.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/6 (0.00%) | 0/9 (0.00%) |
| packages/cms/src/entries/tool-registrations.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/6 (0.00%) | 0/17 (0.00%) |
| packages/daemon/src/agent-executor/antigravity-permissions.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/30 (0.00%) | 0/8 (0.00%) |
| packages/db/src/recovery/restore-point-create.ts | LOADED | 32 | 0/32 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/oauth/src/index.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/oauth/src/sealed-state.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/28 (0.00%) | 0/8 (0.00%) |
| packages/plugins/src/host/browser-providers.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/36 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/asset-grid/react/hooks/useAssetGridData.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/6 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/features/file-dropzone/rules.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/34 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/folder-path-drop/rules.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/20 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/source-config-list/react/components/SourceConfigAddForm.tsx | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/34 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/version-manager/react/components/VersionManagerModal.tsx | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/30 (0.00%) | 0/14 (0.00%) |
| packages/admin/src/react/entities/EntityField.tsx | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/35 (0.00%) | 0/17 (0.00%) |
| packages/admin/src/react/hooks/use-nav-sections.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/16 (0.00%) | 0/10 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/action-dispatcher.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/22 (0.00%) | 0/7 (0.00%) |
| packages/agent-runtime/src/amr-model-cache.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/18 (0.00%) | 0/8 (0.00%) |
| packages/agent-runtime/src/model-registry.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/24 (0.00%) | 0/8 (0.00%) |
| packages/chat/src/core/question-answer.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/40 (0.00%) | 0/6 (0.00%) |
| packages/chat/src/react/hooks/useExtEventGroups.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/16 (0.00%) | 0/6 (0.00%) |
| packages/cms/src/entries/repo.memory.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/32 (0.00%) | 0/16 (0.00%) |
| packages/cms/src/widgets/read-service.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/14 (0.00%) | 0/2 (0.00%) |
| packages/daemon/src/close-status.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/24 (0.00%) | 0/8 (0.00%) |
| packages/db/src/tools/transfer-tools.ts | LOADED | 31 | 223/254 (87.80%) | 63/90 (70.00%) | 25/28 (89.29%) |
| packages/devops/src/agent-jobs/node.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/8 (0.00%) | 0/15 (0.00%) |
| packages/mcp/src/federation/stdio/default-connect.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/12 (0.00%) | 0/10 (0.00%) |
| packages/oauth/src/registration-cache.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/16 (0.00%) | 0/7 (0.00%) |
| packages/ui-kit/src/react/facade.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/charts/table.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/i18n/locale.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/34 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/mcp-ui/surfaces/form.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/32 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/features/sketch-editor/react/components/SketchEditor.tsx | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| packages/admin/src/redirects/react/hooks/use-redirects.hooks.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/10 (0.00%) | 0/21 (0.00%) |
| packages/admin/src/seo/controllers/seo-entry.controller.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/6 (0.00%) | 0/8 (0.00%) |
| packages/agent-plugins/src/lifecycle/installed-package-roots.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/12 (0.00%) | 0/3 (0.00%) |
| packages/agent-runtime/src/defs/antigravity.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/18 (0.00%) | 0/9 (0.00%) |
| packages/agent-runtime/src/defs/claude.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/28 (0.00%) | 0/6 (0.00%) |
| packages/agent-runtime/src/model-catalog-cache.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| packages/agent-runtime/src/providers/oauth-provider.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/components/ConversationTitleEditor.tsx | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/14 (0.00%) | 0/9 (0.00%) |
| packages/chat/src/react/ext-event-renderer-registry.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/8 (0.00%) | 0/10 (0.00%) |
| packages/commerce/src/catalog/storefront.ts | LOADED | 30 | 0/30 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/daemon/src/http/component-catalog.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| packages/daemon/src/http/tool-catalog.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| packages/mcp/src/federation/reload.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/10 (0.00%) | 0/11 (0.00%) |
| packages/oauth/src/errors.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/27 (0.00%) | 0/6 (0.00%) |
| packages/plugins/src/host/capability-sdk.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/16 (0.00%) | 0/13 (0.00%) |
| packages/plugins/src/host/node/module-snapshot.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| packages/server/src/storage/legacy/sqlite.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/hooks/useCaretFloatingLayerPosition.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/16 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/skills/react/components/SkillRow.tsx | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/42 (0.00%) | 0/10 (0.00%) |
| packages/user-management/src/react/members/Members.tsx | LOADED | 30 | 144/174 (82.76%) | 18/22 (81.82%) | 4/6 (66.67%) |
| packages/admin/src/agent-plugins/rules.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/22 (0.00%) | 0/18 (0.00%) |
| packages/admin/src/media/controllers/edit-media.controller.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/14 (0.00%) | 0/9 (0.00%) |
| packages/admin/src/react/entities/EntityList.tsx | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/26 (0.00%) | 0/10 (0.00%) |
| packages/admin/src/security/controllers/other-credentials.controller.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/30 (0.00%) | 0/12 (0.00%) |
| packages/admin/src/seo/controllers/seo.controller.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/4 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/seo/react/hooks/use-seo-entry-panel.hooks.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/18 (0.00%) | 0/11 (0.00%) |
| packages/admin/src/seo/react/hooks/use-seo.hooks.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/26 (0.00%) | 0/13 (0.00%) |
| packages/agent-runtime/src/defs/index.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/react/features/chat-pane/components/AgentPluginUsage.tsx | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/16 (0.00%) | 0/10 (0.00%) |
| packages/daemon/src/http/health.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/4 (0.00%) | 0/11 (0.00%) |
| packages/plugins/src/glue/attachment-points/tool-registration.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/admin-widgets/components/Select/Select.tsx | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/44 (0.00%) | 0/16 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeRename.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/12 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/mcp-ui/surfaces/text-input.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/28 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/progress-card/rules.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/20 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/skills/dependencies.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/22 (0.00%) | 0/12 (0.00%) |
| packages/ui/src/features/source-config-list/react/components/SourceConfigListView.tsx | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/34 (0.00%) | 0/12 (0.00%) |
| packages/admin/src/comments/react/components/QueueSection.tsx | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/20 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/react/components/DataTable.tsx | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/42 (0.00%) | 0/12 (0.00%) |
| packages/admin/src/react/hooks/use-sidebar-rail.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/14 (0.00%) | 0/9 (0.00%) |
| packages/admin/src/seo/react/hooks/MediaRefField.hooks.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/10 (0.00%) | 0/12 (0.00%) |
| packages/admin/src/widgets/react/hooks/use-widget-instance-editor.hooks.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/16 (0.00%) | 0/14 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/external-links.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/30 (0.00%) | 0/4 (0.00%) |
| packages/agent-runtime/src/defs/cursor-agent.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/34 (0.00%) | 0/8 (0.00%) |
| packages/chat/src/core/question-form/secret-answers.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/20 (0.00%) | 0/7 (0.00%) |
| packages/chat/src/react/components/MessageRow.usage.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/36 (0.00%) | 0/8 (0.00%) |
| packages/cms/src/content-types/cleanup.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| packages/cms/src/listing/batch.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| packages/cms/src/seo/dom/index.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/11 (0.00%) | 0/2 (0.00%) |
| packages/daemon/src/http/frontend-control.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/10 (0.00%) | 0/6 (0.00%) |
| packages/mcp/src/federation/approvals/revocation.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| packages/mcp/src/server/tools/delegated-tool.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/22 (0.00%) | 0/7 (0.00%) |
| packages/oauth/src/guarded-transport.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/20 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/core/theme/validation.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/48 (0.00%) | 0/16 (0.00%) |
| packages/ui/src/features/execution/http-adapter.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/28 (0.00%) | 0/14 (0.00%) |
| packages/ui/src/features/observability/resource-error.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/30 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/resourceBoardProps.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/28 (0.00%) | 0/11 (0.00%) |
| packages/ui/src/react/hooks/useCoalescedCallback.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/renderers/shiki.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/22 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/agent-plugins/conformance/agent-plugins-api.conformance.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/22 (0.00%) | 0/39 (0.00%) |
| packages/admin/src/forms/controllers/field-attributes-dialog.controller.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/16 (0.00%) | 0/28 (0.00%) |
| packages/admin/src/react/components/ConfirmButton/ConfirmButton.hooks.tsx | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/12 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/react/entities/EntityEdit.tsx | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/38 (0.00%) | 0/11 (0.00%) |
| packages/chat/src/store/runtime/chat-expiry-sweep.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/10 (0.00%) | 0/7 (0.00%) |
| packages/cms/src/workspace/create.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| packages/commerce/src/catalog/webhook-inbox.ts | LOADED | 27 | 0/27 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/daemon/src/http/index.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/db/src/kernel/dialect.ts | LOADED | 27 | 87/114 (76.32%) | 47/48 (97.92%) | 13/18 (72.22%) |
| packages/devops/src/packaging/electron/node.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/24 (0.00%) | 0/12 (0.00%) |
| packages/oauth/src/dns-pinned-transport.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/18 (0.00%) | 0/8 (0.00%) |
| packages/platform/src/fs/boot-identity.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/20 (0.00%) | 0/6 (0.00%) |
| packages/ui-kit/src/react/kit.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/26 (0.00%) | 0/14 (0.00%) |
| packages/ui/src/features/file-dropzone/react/components/FileDropzone.tsx | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/34 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/observability/iframe.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/8 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/observability/visibility.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/10 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/skills/react/components/SkillsTab.tsx | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/26 (0.00%) | 0/16 (0.00%) |
| packages/ui/src/features/viewer-shell/react/components/MarkdownSplitPane.tsx | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/26 (0.00%) | 0/7 (0.00%) |
| packages/admin/src/media/react/hooks/MediaLightbox.hooks.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/42 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/widgets/controllers/regions.controller.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/14 (0.00%) | 0/5 (0.00%) |
| packages/admin/src/widgets/react/hooks/use-widgets-library.hooks.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/14 (0.00%) | 0/13 (0.00%) |
| packages/agent-plugins/src/lifecycle/yauzl-archive-reader.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| packages/agent-runtime/src/model-discovery-sdk.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/14 (0.00%) | 0/11 (0.00%) |
| packages/agent-runtime/src/native-runtime.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/14 (0.00%) | 0/14 (0.00%) |
| packages/artifacts/src/publication-guard.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/14 (0.00%) | 0/8 (0.00%) |
| packages/chat/src/core/index.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/core/question-form/format.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/22 (0.00%) | 0/9 (0.00%) |
| packages/chat/src/react/hooks/useLatestOperation.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/8 (0.00%) | 0/10 (0.00%) |
| packages/cms/src/forms/html/authoring-adapter.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/24 (0.00%) | 0/13 (0.00%) |
| packages/cms/src/media/replace-media-file.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/16 (0.00%) | 0/2 (0.00%) |
| packages/cms/src/media/transform-registry.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/10 (0.00%) | 0/7 (0.00%) |
| packages/cms/src/widgets/resolvers/menu.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/16 (0.00%) | 0/5 (0.00%) |
| packages/daemon/src/http/run-credentials.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/22 (0.00%) | 0/6 (0.00%) |
| packages/mcp/src/federation/approvals/call-confirmation.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/32 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/integrations/react/components/SnippetBlock.tsx | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/20 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/hooks/useTriggerDetection.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/media-providers/react/components/MediaProviderCard.tsx | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/36 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/features/sketch-editor/react/dependencies-fake.tsx | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/10 (0.00%) | 0/16 (0.00%) |
| packages/ui/src/utils/color-math.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/16 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/utils/copy-to-clipboard.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/agent-plugins/controllers/agent-plugin-files.controller.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/16 (0.00%) | 0/9 (0.00%) |
| packages/admin/src/media/react/hooks/MediaQuery.hooks.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/8 (0.00%) | 0/18 (0.00%) |
| packages/admin/src/widgets/react/hooks/use-widget-regions.hooks.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/8 (0.00%) | 0/11 (0.00%) |
| packages/agent-runtime/src/defs/grok-build.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/22 (0.00%) | 0/5 (0.00%) |
| packages/capability-providers/src/visitor-auth/lifecycle.ts | LOADED | 25 | 280/305 (91.80%) | 104/126 (82.54%) | 22/22 (100.00%) |
| packages/charts-recharts/src/chart.tsx | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/26 (0.00%) | 0/7 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneComposerPlaceholder.hooks.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/18 (0.00%) | 0/11 (0.00%) |
| packages/chat/src/store/runtime/chat-history-store.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/14 (0.00%) | 0/5 (0.00%) |
| packages/cms/src/comments/module.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/media/image-transformer.sharp.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/widgets/resolvers/gallery.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/14 (0.00%) | 0/6 (0.00%) |
| packages/daemon/src/tool-recovery/federated-refusal.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/26 (0.00%) | 0/9 (0.00%) |
| packages/platform/src/index.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/platform/src/secrets/credential-token.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/20 (0.00%) | 0/6 (0.00%) |
| packages/platform/src/secrets/index.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/plugins/src/host/node/browser-provider-assets.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/24 (0.00%) | 0/9 (0.00%) |
| packages/server/src/storage/backend-config.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/26 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/file-dropzone/react/components/FileDropzoneThumbnailGrid.tsx | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/16 (0.00%) | 0/11 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/hooks/useMentionColorStamping.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/8 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/mcp-ui/surfaces/fields.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/11 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/memory/react/hooks/useMemoryConnectors.rules.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/30 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/project-locations/react/components/ProjectLocationsTab.tsx | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/24 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/media/react/components/MediaIcons.tsx | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/0 (0.00%) | 0/12 (0.00%) |
| packages/admin/src/media/react/hooks/MediaCard.hooks.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/26 (0.00%) | 0/10 (0.00%) |
| packages/admin/src/react/components/ConfirmDialog/use-confirm-request.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/8 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/react/overlays.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/8 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/seo/adapters/http.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/24 (0.00%) | 0/20 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/sandbox.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/12 (0.00%) | 0/12 (0.00%) |
| packages/chat/src/core/tool-call-detail.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/24 (0.00%) | 0/7 (0.00%) |
| packages/commerce/src/tools.ts | LOADED | 24 | 0/24 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/db/src/recovery/disclosure.ts | LOADED | 24 | 0/24 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/oauth/src/bounded-json.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/12 (0.00%) | 0/5 (0.00%) |
| packages/platform/src/secrets/credential-sets/provider-matches.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/38 (0.00%) | 0/12 (0.00%) |
| packages/ui/src/features/admin-widgets/components/ImagePreviewModal.hooks.tsx | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/14 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/data-table.tsx | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/42 (0.00%) | 0/13 (0.00%) |
| packages/ui/src/features/panel-kit/helpers/standing-draft-local-backup.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/14 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/schedule-picker/react/hooks/useRecurringSchedulePicker.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/6 (0.00%) | 0/19 (0.00%) |
| packages/ui/src/react/mcp-ui/useHostSurfaceTokens.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/renderers/sandboxed-document.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/14 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/comments/react/hooks/use-comment-settings.hooks.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/6 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/forms/react/hooks/use-form-fields-editor.hooks.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/4 (0.00%) | 0/8 (0.00%) |
| packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/data-table.tsx | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/8 (0.00%) | 0/21 (0.00%) |
| packages/chat/src/core/agent-plugin-chat-state.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/22 (0.00%) | 0/8 (0.00%) |
| packages/chat/src/core/assistant-client/attachment-liveness.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/6 (0.00%) | 0/9 (0.00%) |
| packages/chat/src/react/features/chat-pane/components/RuntimeDropUp.tsx | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/28 (0.00%) | 0/9 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneNewTabLinks.hooks.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/24 (0.00%) | 0/6 (0.00%) |
| packages/chat/src/react/hooks/useRunActivity.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| packages/cms/src/media/index.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/redirects/resolver.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/8 (0.00%) | 0/7 (0.00%) |
| packages/daemon/src/http/resource-request.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/14 (0.00%) | 0/6 (0.00%) |
| packages/db/src/pglite/owner.ts | LOADED | 23 | 225/248 (90.73%) | 73/86 (84.88%) | 21/22 (95.45%) |
| packages/db/src/recovery/evaluate-boot-migration-policy.ts | LOADED | 23 | 0/23 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/ui/src/features/admin-widgets/components/InfoTip.tsx | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/36 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/admin-widgets/components/SeeMore/SeeMore.hooks.tsx | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/10 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/browser-chrome/react/hooks/useBrowserHistory.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/6 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/features/file-dropzone/react/components/FileDropzoneLightbox.tsx | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/12 (0.00%) | 0/13 (0.00%) |
| packages/ui/src/features/interactive-ui/manifests.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/deserialize.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/12 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/renderers/url-load-decision.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/28 (0.00%) | 0/5 (0.00%) |
| packages/admin/src/comments/adapters/http.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/12 (0.00%) | 0/9 (0.00%) |
| packages/admin/src/comments/react/hooks/QueueSection.hooks.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/6 (0.00%) | 0/16 (0.00%) |
| packages/admin/src/redirects/rules.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/20 (0.00%) | 0/13 (0.00%) |
| packages/admin/src/seo/react/hooks/SeoPage.hooks.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/6 (0.00%) | 0/11 (0.00%) |
| packages/admin/src/widgets/react/hooks/page-views.hooks.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/6 (0.00%) | 0/10 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/action-tools.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/10 (0.00%) | 0/7 (0.00%) |
| packages/agent-runtime/src/agent-protocol/acp/session-params.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/24 (0.00%) | 0/8 (0.00%) |
| packages/agent-runtime/src/providers/oauth-credentials.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/18 (0.00%) | 0/2 (0.00%) |
| packages/chat/src/react/components/AttachmentPreviewModal.tsx | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/20 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/hooks/testing/fake-transport.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/6 (0.00%) | 0/11 (0.00%) |
| packages/chat/src/react/hooks/useAnsweredCards.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/14 (0.00%) | 0/9 (0.00%) |
| packages/cms/src/presentation/presentation.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/widgets/concurrency.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| packages/cms/src/widgets/resolvers/contact-form.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/22 (0.00%) | 0/6 (0.00%) |
| packages/db/src/kernel/postgres/driver.ts | LOADED | 22 | 2/24 (8.33%) | 0/0 (100.00%) | 0/1 (0.00%) |
| packages/platform/src/command.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| packages/platform/src/mail/purpose-scoped-mailer.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/14 (0.00%) | 0/7 (0.00%) |
| packages/plugins/src/host/worker/import-seam.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/16 (0.00%) | 0/7 (0.00%) |
| packages/ui-kit/src/toast.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/14 (0.00%) | 0/14 (0.00%) |
| packages/ui/src/features/appearance/react/components/AppearanceTab.tsx | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/26 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/asset-tree-browser/index.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeSelection.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/4 (0.00%) | 0/11 (0.00%) |
| packages/ui/src/features/execution/react/components/LocalCliAgentList.tsx | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/24 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/external-mcp/react/components/ExternalMcpTab.tsx | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/18 (0.00%) | 0/13 (0.00%) |
| packages/ui/src/features/i18n/template-i18n.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/12 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/integrations/react/hooks/useMcpInstallInfo.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/8 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/select.tsx | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/4 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/memory/index.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/tab-launcher-menu/react/components/TabLauncherMenu.tsx | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/20 (0.00%) | 0/11 (0.00%) |
| packages/ui/src/renderers/react/components/ArtifactView.tsx | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/forms/adapters/http.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/14 (0.00%) | 0/13 (0.00%) |
| packages/admin/src/media/adapters/http.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/11 (0.00%) |
| packages/agent-plugins/src/lifecycle/set-enabled.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| packages/agent-runtime/src/diagnostics.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/26 (0.00%) | 0/4 (0.00%) |
| packages/chat/src/react/components/SentAttachment.hooks.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/8 (0.00%) |
| packages/chat/src/react/features/chat-pane/create-mid-run-message-poster.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/16 (0.00%) | 0/8 (0.00%) |
| packages/chat/src/react/hooks/useToolTimeline.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/12 (0.00%) |
| packages/cms/src/media/transform-types.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/20 (0.00%) | 0/5 (0.00%) |
| packages/cms/src/workspace/repo.memory.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/6 (0.00%) | 0/14 (0.00%) |
| packages/daemon/src/attachment-content.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/16 (0.00%) | 0/4 (0.00%) |
| packages/daemon/src/store/agent-sessions/sqlite.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/24 (0.00%) | 0/7 (0.00%) |
| packages/devops/src/checks/node.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/6 (0.00%) | 0/19 (0.00%) |
| packages/devops/src/deploy/node.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/16 (0.00%) | 0/8 (0.00%) |
| packages/mcp/src/server/resource-protocol.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| packages/oauth/src/node-file-cache.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/asset-grid/react/components/AssetCard.tsx | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/30 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/html-editor/canvas-content-wrapper.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/14 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/html-viewer/rules.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/24 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/mcp-ui/surfaces/outcome.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/24 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/panel-kit/hooks/use-serial-writes.hooks.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/project-locations/rules.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/16 (0.00%) | 0/14 (0.00%) |
| packages/ui/src/features/source-config-list/agent-handles.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/react/hooks/useInView.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/renderers/sandbox-bridge.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/12 (0.00%) | 0/5 (0.00%) |
| packages/admin/src/core/ledger-slice.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/8 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/seo/react/components/MediaRefField.tsx | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/26 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/widgets/adapters/http.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/10 (0.00%) | 0/11 (0.00%) |
| packages/agent-runtime/src/providers/google.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/4 (0.00%) | 0/6 (0.00%) |
| packages/agent-runtime/src/providers/index.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/core/assistant-content.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/22 (0.00%) | 0/3 (0.00%) |
| packages/chat/src/react/components/TodoCard.tsx | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/34 (0.00%) | 0/10 (0.00%) |
| packages/chat/src/react/hooks/composer-history-storage.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/hooks/useArtifactStream.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/listing/paths.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| packages/cms/src/seo/absolute-url.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/16 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/widgets/html/resolve-html-page-embeds.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/widgets/html/server-fragment.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/24 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/widgets/sql/repo.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/4 (0.00%) | 0/17 (0.00%) |
| packages/cms/src/workspace/tool-registrations.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/daemon/src/http/route-manifest.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/daemon/src/tool-result-surfaces.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/14 (0.00%) | 0/2 (0.00%) |
| packages/db/src/recovery/restore-hooks.ts | LOADED | 20 | 49/69 (71.01%) | 6/7 (85.71%) | 4/7 (57.14%) |
| packages/platform/src/secrets/credential-sets/vault.types.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/22 (0.00%) | 0/6 (0.00%) |
| packages/plugins/src/host/declarative-enable.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/8 (0.00%) | 0/6 (0.00%) |
| packages/plugins/src/host/index.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/plugins/src/host/tool-contributions.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/12 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/asset-grid/react/hooks/useAssetGridKeyboardShortcuts.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/28 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/asset-tree-browser/dependencies.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/6 (0.00%) | 0/14 (0.00%) |
| packages/ui/src/features/browser-chrome/react/components/BrowserViewportControls.tsx | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/18 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/execution/dependencies.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/28 (0.00%) | 0/15 (0.00%) |
| packages/ui/src/features/interactive-ui/table-data.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/22 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/panel-kit/helpers/retry-unreachable.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/6 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/progress-card/components/ProgressCard.tsx | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/20 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/tab-strip/react/components/TabStripItem.tsx | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/20 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/tabbed-dialog/react/hooks/useTabbedDialog.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/6 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/version-manager/react/hooks/usePreviewCanvasSize.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/viewer-shell/index.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/viewer-shell/react/hooks/useCopyToClipboard.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/renderers/html-utils.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/utils/sse.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/forms/react/hooks/use-field-attributes-dialog.hooks.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/6 (0.00%) | 0/14 (0.00%) |
| packages/admin/src/forms/react/index.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/8 (0.00%) | 0/10 (0.00%) |
| packages/admin/src/redirects/react/hooks/use-import-redirects-form.hooks.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/10 (0.00%) | 0/9 (0.00%) |
| packages/admin/src/source-control/react/hooks/ProvidersTab.hooks.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/22 (0.00%) | 0/14 (0.00%) |
| packages/agent-runtime/src/skills/web-clone/scripts/lib/playwright-loader.mjs | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/2 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/components/AttachmentTray.tsx | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/16 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/components/ComposerDiscovery.tsx | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/38 (0.00%) | 0/11 (0.00%) |
| packages/chat/src/react/components/mcp-ui-surface-state.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/20 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/features/chat-pane/create-typed-answer-poster.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| packages/chat/src/react/hooks/usePinnedTodos.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/10 (0.00%) | 0/8 (0.00%) |
| packages/cms/src/forms/delivery/subscriptions.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/2 (0.00%) | 0/8 (0.00%) |
| packages/cms/src/forms/notify-subscriber.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| packages/cms/src/forms/submission-email-validation.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/16 (0.00%) | 0/7 (0.00%) |
| packages/cms/src/trash/adapters/record-store.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/20 (0.00%) | 0/5 (0.00%) |
| packages/daemon/src/tool-result-media.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/18 (0.00%) | 0/3 (0.00%) |
| packages/mcp/src/federation/testing/tool-approvals.memory.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/8 (0.00%) | 0/12 (0.00%) |
| packages/oauth/src/pkce.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| packages/platform/src/http/guarded/fetch-adapter.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/22 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/browser/useModalWindowDragGuard.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/a2ui/use-a2ui-surface.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/10 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/admin-widgets/components/SuggestInput/SuggestInput.tsx | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/18 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreePreview.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/12 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/connectors/components/ConnectorSearchBar.tsx | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/execution/react/components/LocalCliAgentCard.tsx | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/30 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/integrations/react/components/CodexInstallToggleButton.tsx | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/table.tsx | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/0 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/privacy/rules.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/10 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/project-locations/dependencies.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/14 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/renderers/new-tab-preview.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/12 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/comments/react/index.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/react/components/ConfirmDialog/ConfirmDialog.hooks.tsx | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/4 (0.00%) | 0/6 (0.00%) |
| packages/admin/src/react/entities/use-entity-read.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/14 (0.00%) | 0/6 (0.00%) |
| packages/admin/src/react/shell/AdminShell.hooks.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/4 (0.00%) | 0/9 (0.00%) |
| packages/admin/src/redirects/react/hooks/wired.hooks.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| packages/admin/src/security/conformance/security-api.conformance.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/14 (0.00%) | 0/9 (0.00%) |
| packages/admin/src/seo/react/index.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/0 (0.00%) | 0/7 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/settings-value.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/22 (0.00%) | 0/5 (0.00%) |
| packages/agent-plugins/src/manifest.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/16 (0.00%) | 0/4 (0.00%) |
| packages/charts-recharts/scripts/build-artifact.mjs | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/chat/src/embed-widget/react/header.hooks.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/10 (0.00%) | 0/7 (0.00%) |
| packages/cms/src/comments/hooks.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/2 (0.00%) | 0/5 (0.00%) |
| packages/cms/src/comments/spam.heuristic.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/consent/html/static.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/forms/delivery/planner.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/8 (0.00%) | 0/6 (0.00%) |
| packages/cms/src/forms/index.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/seo/feed.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| packages/cms/src/widgets/index.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/daemon/src/http/model-proxy-fields.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/10 (0.00%) | 0/9 (0.00%) |
| packages/daemon/src/store/agent-sessions/sql.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/6 (0.00%) | 0/15 (0.00%) |
| packages/diagnostics/src/web-evidence/playwright-browser.ts | LOADED | 18 | 175/193 (90.67%) | 53/68 (77.94%) | 21/21 (100.00%) |
| packages/oauth/src/discovery-policy.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| packages/ui-kit/src/confirm.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/26 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeNavigation.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/8 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/browser-chrome/dependencies.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/14 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/command-palette/dependencies.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/connectors/components/ConnectorLogo.tsx | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/16 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/html-viewer/dependencies.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/14 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/features/html-viewer/react/hooks/usePresentMode.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/2 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/serialize.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/mcp-ui/early-message-buffer.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/privacy/react/components/PrivacyTab.tsx | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/44 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/features/version-manager/dependencies.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/8 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/renderers/preview-modal-shell/rules.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/26 (0.00%) | 0/7 (0.00%) |
| packages/admin/src/forms/react/components/FieldSettingsRows.tsx | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/22 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/react/components/RowMenu/RowMenu.tsx | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/18 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/redirects/react/index.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/security/react/hooks/RootKeyTab.hooks.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/24 (0.00%) | 0/13 (0.00%) |
| packages/admin/src/seo/react/hooks/MediaPickerBridge.hooks.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| packages/admin/src/widgets/react/hooks/use-widget-region-editor.hooks.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/4 (0.00%) | 0/12 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/callback-field-inbox.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| packages/agent-plugins/src/lifecycle/layout.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/10 (0.00%) | 0/7 (0.00%) |
| packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/form-pattern.tsx | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/0 (0.00%) | 0/6 (0.00%) |
| packages/agent-runtime/src/agent-protocol/pi-rpc/models.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/12 (0.00%) | 0/3 (0.00%) |
| packages/agent-runtime/src/pi-models.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/12 (0.00%) | 0/3 (0.00%) |
| packages/agent-runtime/src/probe-scheduler.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/8 (0.00%) | 0/8 (0.00%) |
| packages/chat/src/react/components/JiniChatProvider.tsx | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/14 (0.00%) | 0/3 (0.00%) |
| packages/cms/src/forms/delivery/errors.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/14 (0.00%) | 0/3 (0.00%) |
| packages/cms/src/media/blob-store.memory.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| packages/cms/src/redirects/express/index.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| packages/cms/src/taxonomy/content-lookup.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/8 (0.00%) | 0/6 (0.00%) |
| packages/cms/src/trash/follow-ups.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/widgets/resolvers/taxonomy.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/18 (0.00%) | 0/6 (0.00%) |
| packages/commerce/src/catalog/errors.ts | LOADED | 17 | 0/17 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/daemon/src/continuation/run-scoped-context-store.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/4 (0.00%) | 0/7 (0.00%) |
| packages/oauth/src/revocation.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/12 (0.00%) | 0/1 (0.00%) |
| packages/ui/scripts/generate-agent-icon-data-uris.mjs | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/command-palette/react/components/CommandPalette.tsx | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/execution/react/components/LocalCliAgentSettings.tsx | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/26 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/execution/react/components/SearchableModelSelect.tsx | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/14 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/integrations/react/components/ClientPicker.tsx | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/20 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/hooks/useSyncedOnChange.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/mcp-ui/surfaces/host-theme.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/memory/rules.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/8 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/observability/install.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceBoardViewParts.tsx | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/36 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/skills/react/components/SkillDraftForm.labels.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/viewer-shell/react/components/ViewportSwitcher.tsx | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/20 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/utils/timezone.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/12 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/comments/react/hooks/use-comments.hooks.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| packages/admin/src/forms/react/components/FormSubmissions.tsx | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/10 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/redirects/controllers/redirects.controller.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/12 (0.00%) | 0/11 (0.00%) |
| packages/admin/src/seo/react/hooks/use-entry-picker.hooks.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/seo/react/hooks/use-sitemap-modal.hooks.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/14 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/widgets/react/index.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/13 (0.00%) |
| packages/admin/src/widgets/react/pages/WidgetInstanceEditor.tsx | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/14 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/widgets/react/pages/WidgetRegionEditor.tsx | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/14 (0.00%) | 0/7 (0.00%) |
| packages/admin/src/widgets/react/pages/WidgetsLibrary.tsx | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/10 (0.00%) | 0/10 (0.00%) |
| packages/agent-runtime/src/defs/claude-compatible-args.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/22 (0.00%) | 0/6 (0.00%) |
| packages/agent-runtime/src/defs/pi.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/12 (0.00%) | 0/8 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneControlsHeight.hooks.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/core/entity-liveness.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| packages/cms/src/forms/duplicate-slug.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| packages/cms/src/redirects/capture.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/cms/src/taxonomy/merge-term.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/daemon/src/index.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/db/src/recovery/lookup-adapters.ts | LOADED | 16 | 0/16 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/db/src/testing/transfer-pg-test-db.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| packages/devops/src/source-control/repository-target.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/22 (0.00%) | 0/3 (0.00%) |
| packages/mcp/src/tools/ask-choice/pending.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| packages/platform/src/http.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/platform/src/shell.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/8 (0.00%) | 0/7 (0.00%) |
| packages/plugins/src/host/worker/protocol.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/20 (0.00%) | 0/4 (0.00%) |
| packages/ui-kit/scripts/headless-smoke.mjs | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/browser/useGlobalKeydown.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/asset-grid/react/components/DeleteConfirmDialog.tsx | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/asset-grid/react/hooks/useAssetGridSelection.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/2 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/features/connectors/index.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/hooks/usePasteFiles.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/mcp-ui/surfaces/tokens.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/panel-kit/hooks/use-dirty-guard.hooks.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/8 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/panel-kit/index.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/resource-dashboard/index.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/tabbed-dialog/react/components/TabbedDialog.tsx | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/react/components/AgentIcon.tsx | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/14 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/renderers/react/components/SrcDocSandbox.tsx | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/utils/file-system-errors.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/core/module/controller-store.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| packages/admin/src/seo/controllers/sitemap.controller.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/seo/react/hooks/SeoPorts.hooks.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/auth-layout.tsx | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| packages/charts-recharts/src/bar-chart.tsx | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/chat/src/react/tool-renderer-registry.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/2 (0.00%) | 0/8 (0.00%) |
| packages/chat/src/store/sql/boundary.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/store/sqlite/index.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/navigation/menu-html.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/22 (0.00%) | 0/3 (0.00%) |
| packages/cms/src/navigation/node/index.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| packages/cms/src/workspace/update.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/16 (0.00%) | 0/1 (0.00%) |
| packages/core/src/settings/write-service.ts | LOADED | 15 | 586/601 (97.50%) | 161/170 (94.71%) | 18/18 (100.00%) |
| packages/platform/src/fetch-with-timeout.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/platform/src/net/address.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| packages/ui-kit/src/needs.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/20 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/about/react/hooks/useSilentUpdatesToggle.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/admin-widgets/index.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/asset-grid/index.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/charts/registry.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/2 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/execution/react/components/AgentDiagnosticRow.tsx | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/html-editor/canvas-style.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/14 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/card.tsx | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/0 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/sketch-editor/react/hooks/useSketchTheme.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/tab-strip/react/components/TabBar.tsx | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/22 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/tabbed-dialog/react/components/tabbedDialogView.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/12 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/version-manager/react/components/VersionPromptPopover.tsx | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/renderers/index.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/renderers/react/i18n.tsx | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/8 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/core/react/bind-react.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| packages/admin/src/forms/react/components/FormSubmissionDetail.tsx | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/forms/react/pages/FormEditor.tsx | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/10 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/media/react/hooks/GallerySelection.hooks.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/12 (0.00%) | 0/12 (0.00%) |
| packages/admin/src/media/react/hooks/MediaPicker.hooks.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/12 (0.00%) | 0/9 (0.00%) |
| packages/admin/src/react/entities/EntityDetail.tsx | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/source-control/adapters/memory.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/34 (0.00%) | 0/18 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/theme.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| packages/agent-runtime/src/invocation.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| packages/agent-runtime/src/paths.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| packages/agent-runtime/src/providers/token-params.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/components/MidRunUserMessage.tsx | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| packages/cms/src/content-types/repo.memory.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/2 (0.00%) | 0/15 (0.00%) |
| packages/cms/src/forms/delivery/deliver-job.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| packages/cms/src/forms/sql/repo.rows.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| packages/daemon/src/agent-executor/model-receipts.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| packages/daemon/src/image-prompt-delivery.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/18 (0.00%) | 0/6 (0.00%) |
| packages/daemon/src/run/core/result.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/18 (0.00%) | 0/2 (0.00%) |
| packages/db/src/testing/postgres-database.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/mcp/src/server/sdk-transport.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/8 (0.00%) | 0/9 (0.00%) |
| packages/oauth/src/options.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| packages/platform/src/fs/env-text.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| packages/plugins/src/host/sql/repo.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/2 (0.00%) | 0/12 (0.00%) |
| packages/ui-kit/src/react/context.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/admin-widgets/components/useDebouncedHtmlPreview.hooks.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/6 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/execution/index.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/index.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/test-support/lexical-harness.tsx | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/2 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/mcp-ui/surfaces/choice-group.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/20 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/panel-kit/fetch-query/environment.browser.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/4 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/panel-kit/hooks/use-async-action.hooks.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/schedule-picker/react/components/RecurringSchedulePicker.tsx | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/source-config-list/react/components/SourceConfigTestControl.tsx | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/18 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/utils/scroll-tabs-with-wheel.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/forms/react/pages/FormsList.tsx | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/12 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/playground/conformance/playground-api.conformance.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/react/components/ConfirmDialog/ConfirmDialog.tsx | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/14 (0.00%) | 0/7 (0.00%) |
| packages/admin/src/react/index.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/redirects/adapters/http.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/6 (0.00%) | 0/10 (0.00%) |
| packages/admin/src/redirects/react/pages/RedirectsPage.tsx | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/seo/react/hooks/SeoModuleTabs.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/seo/react/hooks/SitemapModal.hooks.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/6 (0.00%) |
| packages/agent-runtime/src/metadata.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| packages/agent-runtime/src/model-loading-state.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/chat/src/react/components/ChatSettingsDialog.hooks.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/16 (0.00%) | 0/12 (0.00%) |
| packages/chat/src/react/components/MessageList.tsx | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| packages/chat/src/react/hooks/useSurfaceExpiry.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/7 (0.00%) |
| packages/chat/src/react/hooks/useUserTextGuard.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/chat/src/store/runtime/run-guarded-chat-store.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/16 (0.00%) | 0/5 (0.00%) |
| packages/cms/src/forms/sql/submission-ip-retention-repo.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/media/transform-lock.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| packages/cms/src/navigation/dropdown.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| packages/cms/src/widgets/repo.memory.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/10 (0.00%) | 0/11 (0.00%) |
| packages/cms/src/workspace/delete.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/daemon/src/http/daemon-status.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/0 (0.00%) | 0/6 (0.00%) |
| packages/daemon/src/tool-recovery/diagnostics.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| packages/db/src/recovery/reconcile-interrupted-migration.ts | LOADED | 13 | 0/13 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/devops/src/deploy/tool.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| packages/mcp/src/federation/index.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/mcp/src/server/tools/component-catalog-tools.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/mcp/src/server/tools/tool-catalog-tools.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/oauth/src/resource.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/platform/src/fs/index.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/platform/src/home-expansion.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/plugins/src/glue/capability-gate.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| packages/plugins/src/host/plugin-format.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/asset-grid/react/components/useAssetGridFilters.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeRowMenu.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/connectors/hooks/useWiredConnectorsBrowser.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/html-viewer/react/hooks/useDeckNavigation.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/integrations/dependencies.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/8 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/interactive-ui/index.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/hooks/useSeededValue.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/memory/react/hooks/useMemoryNavigation.hooks.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/20 (0.00%) | 0/11 (0.00%) |
| packages/ui/src/features/skills/react/components/SkillDraftForm.tsx | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/react/mcp-ui/McpUiHost.tsx | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/utils/endpoint-policy.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/utils/uuid.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/forms/controllers/form-editor.controller.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/forms/react/components/FieldAttributesDialog.tsx | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/forms/react/hooks/FormsPorts.hooks.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/media/react/hooks/MediaDialog.hooks.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/redirects/react/hooks/RedirectsPage.hooks.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/10 (0.00%) |
| packages/admin/src/security/react/hooks/CredentialEditor.hooks.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/10 (0.00%) | 0/14 (0.00%) |
| packages/admin/src/security/react/tabs/RootKeyTab.tsx | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| packages/admin/src/source-control/rules.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/26 (0.00%) | 0/15 (0.00%) |
| packages/admin/src/widgets/react/hooks/WidgetsPorts.hooks.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/widgets/react/pages/WidgetRegions.tsx | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/index.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-plugins/src/lifecycle/persistent-state.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/13 (0.00%) |
| packages/agent-runtime/src/defs/qoder.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/12 (0.00%) | 0/7 (0.00%) |
| packages/agent-runtime/src/native-tool-policy.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| packages/agent-runtime/src/registry.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| packages/chat/src/react/components/MessageList.rules.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/features/chat-pane/index.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/content-types/index.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/forms/delivery/pull-trigger.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/2 (0.00%) | 0/6 (0.00%) |
| packages/cms/src/forms/errors.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/6 (0.00%) |
| packages/cms/src/forms/submission-ip-retention.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/media/types.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| packages/cms/src/redirects/index.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/redirects/spa/index.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/cms/src/redirects/sql/repo.rows.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/24 (0.00%) | 0/5 (0.00%) |
| packages/cms/src/trash/cursor.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/cms/src/widgets/registry.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/mcp/src/core/install-info.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/14 (0.00%) | 0/1 (0.00%) |
| packages/oauth/src/testing/token-store.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/6 (0.00%) |
| packages/oauth/tests/fixtures.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| packages/oauth/tests/integration-contract.types.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/platform/src/fs/workspace-directory.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/16 (0.00%) | 0/12 (0.00%) |
| packages/plugins/src/host/bundled-initialization.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/ui-kit/src/react/native/Dialog.tsx | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeBrowser.tsx | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/12 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/browser-chrome/react/hooks/useBrowserBridgeRegistration.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/charts/wire.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/10 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/connectors/components/ConnectorGrid.tsx | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/24 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/file-dropzone/constants.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/file-dropzone/react/components/FileDropzoneZone.tsx | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/12 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/html-viewer/react/components/PresentMenu.tsx | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/2 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/icons.tsx | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/mcp-ui/surfaces/index.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/panel-kit/fetch-query/binding.react.tsx | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/2 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/panel-kit/helpers/format-timestamp.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/schedule-picker/react/components/ScheduleSummary.tsx | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/sketch-editor/index.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/source-config-list/index.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/version-manager/react/components/VersionRestoreControl.tsx | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/8 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/react/mcp-ui/mcp-ui-host-frame.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/renderers/registry.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/6 (0.00%) | 0/7 (0.00%) |
| packages/admin/src/agent-plugins/adapters/memory.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/8 (0.00%) | 0/7 (0.00%) |
| packages/admin/src/comments/react/hooks/CommentsPorts.hooks.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/consent/react/ConsentSettingsPanel.tsx | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/consent/react/settings-panel.hooks.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/4 (0.00%) | 0/9 (0.00%) |
| packages/admin/src/core/react/use-controller.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/4 (0.00%) | 0/7 (0.00%) |
| packages/admin/src/forms/index.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/media/react/components/MediaCard.tsx | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/media/react/tabs/LibraryTab.tsx | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/10 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/react/entities/EntityCell.tsx | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/14 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/redirects/controllers/import-redirects.controller.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/seo/index.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/src/defs/reasonix.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| packages/agent-runtime/src/prompt-file.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/agent-runtime/src/runtime-state.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/core/compact-events.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/chat/src/core/surface-expiry.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/chat/src/react/components/attachment-size.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/10 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/components/AttachmentGallery.rules.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/react/components/QuestionsPanel.tsx | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| packages/chat/src/react/hooks/attachment-preview-cache.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| packages/chat/vitest.setup.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| packages/cms/src/media/blob-gc-lock.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/navigation/index.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/navigation/reconcile.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/seo/index.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/core/src/model-facing-tool-errors.ts | LOADED | 11 | 56/67 (83.58%) | 23/23 (100.00%) | 6/8 (75.00%) |
| packages/daemon/src/frontend-capability-tools.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/16 (0.00%) | 0/5 (0.00%) |
| packages/daemon/src/http/workspace-root.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| packages/db/src/recovery/deep-link.ts | LOADED | 11 | 0/11 (0.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/mcp/src/federation/config.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| packages/mcp/src/federation/presets.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/2 (0.00%) | 0/8 (0.00%) |
| packages/mcp/src/index.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/oauth/src/api.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/oauth/tests/args-convention.types.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui-kit/src/react/KitProvider.tsx | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/2 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/browser/useDismissOnOutsideOrEscape.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/2 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeClipboardPasteUpload.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeCopyLocalPath.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/iframe-pool/rules.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/radio-group.tsx | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/list-detail-panel/react/components/ListDetailPanel.tsx | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/mcp-ui/escape.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/mcp-ui/surfaces/select.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/16 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/media-providers/dependencies.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/12 (0.00%) | 0/9 (0.00%) |
| packages/ui/src/features/memory/react/components/MemoryExtractionCard.tsx | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/memory/react/components/MemoryManualEditor.tsx | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/10 (0.00%) | 0/10 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceBoard.tsx | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceRowList.tsx | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/8 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/revision-review/rules.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/sketch-editor/constants.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/renderers/renderers/index.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/utils/appearance.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/agent-plugins/react/components/AgentPluginRow.tsx | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/16 (0.00%) | 0/6 (0.00%) |
| packages/admin/src/agent-plugins/react/index.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| packages/admin/src/comments/react/hooks/SettingsSection.hooks.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/comments/react/pages/CommentsPage.tsx | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/forms/controllers/draft-store.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/playground/adapters/memory.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/10 (0.00%) | 0/8 (0.00%) |
| packages/admin/src/playground/controllers/playground.controller.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/playground/react/hooks/Canvas.hooks.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/seo/controllers/entry-picker.controller.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/source-control/adapters/http.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/8 (0.00%) | 0/10 (0.00%) |
| packages/admin/src/widgets/react/components/WidgetInstanceNotices.tsx | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| packages/agent-plugins/src/lifecycle/install-from-url.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/agent-plugins/src/lifecycle/node.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/8 (0.00%) | 0/8 (0.00%) |
| packages/agent-plugins/src/lifecycle/tools/definition.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| packages/agent-runtime/src/acp-model-probe.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/5 (0.00%) |
| packages/agent-runtime/src/agent-protocol/acp/constants.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/src/defs/amp.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/agent-runtime/src/defs/opencode.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| packages/agent-runtime/src/log-file.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/agent-runtime/src/model-discovery-native.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/6 (0.00%) |
| packages/cms/src/comments/index.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/content-types/types.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/cms/src/core/keyset-cursor.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/cms/src/forms/delivery/status.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| packages/cms/src/presentation/repo.memory.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/4 (0.00%) | 0/6 (0.00%) |
| packages/cms/src/redirects/hit-sink.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/4 (0.00%) | 0/7 (0.00%) |
| packages/cms/src/redirects/order.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/24 (0.00%) | 0/3 (0.00%) |
| packages/daemon/src/tool-recovery/stack.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| packages/devops/src/packaging/electron/typescript.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| packages/mcp/src/federation/tool-approvals.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| packages/mcp/src/server/index.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/platform/src/fs/directory-home.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| packages/plugins/src/host/quarantine.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/plugins/src/host/repo.memory.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/10 (0.00%) | 0/8 (0.00%) |
| packages/plugins/src/host/source-policy.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/14 (0.00%) | 0/13 (0.00%) |
| packages/ui-kit/src/react/native/Navigation.tsx | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/admin-widgets/components/SeeMore/SeeMore.tsx | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/16 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/appearance/rules.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/asset-grid/react/components/AssetGridBody.tsx | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/execution/constants.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/execution/react/hooks/use-byok-field-validation.hooks.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/html-viewer/react/hooks/useZoomControl.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/button.tsx | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/language/react/components/LanguageTab.tsx | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/index.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/mcp-ui/surfaces/bridge.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/memory/constants.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/memory/react/components/MemorySettingsPanel.tsx | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/memory/react/hooks/useMemoryFlash.hooks.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceCard.tsx | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceRowListViewParts.tsx | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/20 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/version-manager/index.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/version-manager/react/components/VersionPreviewFrame.tsx | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/10 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/react/components/ComponentKitPreview.tsx | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/agent-plugins/adapters/http.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/6 (0.00%) |
| packages/admin/src/agent-plugins/react/pages/AgentPluginsPage.tsx | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/comments/react/components/SettingsSection.tsx | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/16 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/core/transport/errors.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/forms/react/components/FormFieldsEditor.tsx | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/react/shell/model.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/redirects/react/hooks/RedirectsOptions.hooks.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/redirects/react/hooks/use-hit-count-cell.hooks.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/seo/controllers/media-ref.controller.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/contribution.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/agent-plugins/src/admin-surfaces/protocol.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/agent-plugins/src/lifecycle/mcp-provisioning.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/agent-runtime/src/defs/copilot.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| packages/agent-runtime/src/defs/crush.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/agent-runtime/src/defs/droid.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/agent-runtime/src/defs/qwen.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/charts-recharts/src/line-chart.tsx | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/charts-recharts/src/pie-chart.tsx | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/core/assistant-client/messages.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| packages/chat/src/react/artifact-types.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/chat/src/react/components/ConversationList.hooks.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| packages/chat/src/react/components/ToolCallGroup.hooks.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/chat/src/server/durable-runs/accept.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/chat/src/store/pglite/index.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/chat/src/store/postgres/index.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/cms/src/forms/delivery/index.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/forms/delivery/pull-lease.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/navigation/read-model.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/6 (0.00%) |
| packages/daemon/src/agent-executor/agent-env.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/daemon/src/http/agents.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/7 (0.00%) |
| packages/db/src/testing/pg-fixture.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| packages/server/src/create-local-node-daemon.typecheck.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/core/theme/stylesheet.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/FilePreviewPane.tsx | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/connectors/components/ProviderTabBar.tsx | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/execution/react/components/ProviderChipGroup.tsx | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/file-dropzone/index.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/html-editor/react/components/InteractiveHtmlEditor.tsx | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/html-viewer/index.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/integrations/index.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/react/components/CaretFloatingLayer.tsx | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/list-detail-panel/react/hooks/useListDetailSelection.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/memory/react/components/MemoryAdvancedModal.tsx | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/24 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/mention-autocomplete/react/components/MentionAutocomplete.tsx | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/mention-autocomplete/react/components/MentionCategoryTabs.tsx | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/observability/index.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/source-config-list/react/components/SourceConfigList.tsx | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/14 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/tab-strip/index.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/react/components/KitErrorBoundary.tsx | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/react/components/Loading.tsx | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/react/components/OnboardingChipField.tsx | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/react/hooks/useDebouncedValue.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| packages/user-management/test-setup.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/agent-plugins/index.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/agent-plugins/react/components/AgentPluginInspector.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/forms/form-editor-dirty.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/forms/react/components/FormEditorFieldsBodyParts.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/18 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/forms/react/components/FormEditorMainPanel.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/media/index.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/playground/react/index.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/playground/react/pages/PlaygroundPage.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/redirects/index.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/redirects/react/components/HitCountCell.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/security/index.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/security/react/hooks/SecurityPage.hooks.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/12 (0.00%) | 0/5 (0.00%) |
| packages/admin/src/security/react/index.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/source-control/react/index.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/source-control/react/pages/SourceControlPage.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/widgets/index.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/src/agent-protocol/pi-rpc/internal.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| packages/agent-runtime/src/defs/aider.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/agent-runtime/src/defs/deepseek.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/avatarLibrary.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/ChatMotionOverlay.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/charts-recharts/src/chart-config.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| packages/chat/src/core/util/markup-attributes.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/components/ExtEventErrorBoundary.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/chat/vitest.config.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/cms/src/comments/errors.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/cms/src/comments/sanitize.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/cms/src/comments/sql/repo.rows.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/content-types/agent-tools.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/entries/index.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/media/image-transformer.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/navigation/agent-tools.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/redirects/types.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/taxonomy/list.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/widgets/authorize-helper.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/commerce/src/catalog/index.ts | LOADED | 8 | 0/8 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/core/src/compose.typecheck.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/core/src/target-scope.ts | LOADED | 8 | 45/53 (84.91%) | 39/39 (100.00%) | 4/5 (80.00%) |
| packages/daemon/src/agent-executor/values.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| packages/daemon/src/store/agent-sessions/index.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/5 (0.00%) |
| packages/db/src/migrate/runner.ts | LOADED | 8 | 94/102 (92.16%) | 54/66 (81.82%) | 11/11 (100.00%) |
| packages/devops/src/deploy/tokens.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/devops/src/packaging/electron/entry.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/mcp/src/server/resources/site-guide-resource.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/platform/src/fs/strict-containment.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| packages/server/src/feature.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/server/src/index.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/server/src/lifecycle/readiness-state.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/asset-tree-browser/constants.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/html-viewer/react/components/ZoomMenu.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/instructions/react/components/InstructionsTab.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/label.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/radio-group-field.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/lexical-rich-text-editor/constants.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/mcp-ui/index.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/memory/react/MemoryPorts.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/mention-autocomplete/index.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/panel-kit/helpers/standing-draft-recovery-message.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/schedule-picker/index.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/schedule-picker/react/components/ScheduleFields.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/version-manager/react/components/VersionSidebar.tsx | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/18 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/react/mcp-ui/host-message-source.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/agent-plugins/react/components/AgentPluginListPanel.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/agent-plugins/react/hooks/AgentPluginsPorts.hooks.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/agent-plugins/react/tabs/MarketplaceTab.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/comments/index.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/forms/react/components/FieldSettingsSection.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/forms/react/components/FormEditorFieldsBody.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/forms/react/components/FormEditorTabStrip.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/media/react/components/EditMediaPanel.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/media/react/components/MediaLightbox.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/media/react/components/MediaPicker.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/media/react/hooks/MediaPorts.hooks.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/media/react/tabs/ProvidersTab.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/18 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/react/components/ConfirmButton/ConfirmButton.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/16 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/redirects/react/hooks/RedirectsPorts.hooks.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/security/react/hooks/SecurityPorts.hooks.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/security/react/pages/SecurityPage.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/security/react/tabs/AccessTokensTab.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/26 (0.00%) | 0/5 (0.00%) |
| packages/admin/src/seo/react/components/SeoIcons.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/source-control/react/tabs/ProvidersTab.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| packages/agent-runtime/src/defs/codebuddy.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/agent-runtime/src/defs/mimo.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/agent-runtime/src/mcp.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/agent-runtime/src/providers/turn-end-guard.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/artifacts/src/index.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/charts-recharts/src/chart-tokens.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/charts-recharts/vitest.setup.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| packages/chat/src/core/tool-output.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/core/tools.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| packages/chat/src/core/util/index.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/react/components/AttachmentGallery.hooks.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/8 (0.00%) | 0/7 (0.00%) |
| packages/chat/src/react/components/ChatFab.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/14 (0.00%) | 0/2 (0.00%) |
| packages/chat/src/store/sql/maintenance.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/content-types/lifecycle-dispatch.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| packages/cms/src/entries/lifecycle-dispatch.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/cms/src/redirects/reserved-destination.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/taxonomy/index.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/trash/index.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/widgets/embed-validation.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| packages/core/src/tool-registry.ts | LOADED | 7 | 84/91 (92.31%) | 43/48 (89.58%) | 12/13 (92.31%) |
| packages/daemon/src/agent-executor/index.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/daemon/src/continuation/journal.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| packages/daemon/vitest.config.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/db/src/kernel/store-copy.ts | LOADED | 7 | 188/195 (96.41%) | 99/104 (95.19%) | 22/23 (95.65%) |
| packages/db/src/transfer/postgres-target.ts | LOADED | 7 | 71/78 (91.03%) | 28/36 (77.78%) | 7/9 (77.78%) |
| packages/devops/src/core/export-failure-summary.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/devops/src/deploy/index.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/devops/src/packaging/electron/stability.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/plugins/src/glue/index.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/plugins/src/host/node/index.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/registry/vitest.config.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/server/vitest.config.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/sidecar/src/supervisor.ts | LOADED | 7 | 104/111 (93.69%) | 68/74 (91.89%) | 16/17 (94.12%) |
| packages/sqlite/vitest.config.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeBreadcrumbs.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/browser-chrome/index.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/connectors/components/ConnectorAlertList.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/connectors/constants.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/execution/react/components/AgentCliEnvFields.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/html-editor/index.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/native/data-table.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/18 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/checkbox.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/interactive-ui/registry.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/list-detail-panel/rules.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/mcp-ui/sandbox-proxy.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/mcp-ui/surfaces/checkbox.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/memory/react/components/MemoryEntryCard.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/panel-kit/hooks/use-settlement-generation.hooks.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/10 (0.00%) | 0/7 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceRunHistoryList.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/18 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/tab-strip/react/components/TabStrip.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/tabbed-dialog/rules.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/react/components/AppChromeHeader.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/react/components/RemixIcon.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/renderers/annotation-canvas/theme.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/renderers/renderers/html.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/12 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/utils/index.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/agent-plugins/react/components/AgentPluginFileContent.tsx | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/comments/controllers/comments.controller.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/comments/react/hooks/CommentsPage.hooks.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/core/index.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/forms/controllers/form-fields-editor.controller.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/forms/controllers/form-submission-detail.controller.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/forms/controllers/form-submissions.controller.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/forms/controllers/forms-list.controller.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/media/react/pages/MediaPage.tsx | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/playground/react/components/Canvas.tsx | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/react/entities/index.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/react/OverlayHost.hooks.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| packages/admin/src/react/types.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/widgets/widgets.module.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/src/resolution.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/capability-providers/src/visitor-auth/registry.ts | LOADED | 6 | 63/69 (91.30%) | 19/22 (86.36%) | 8/8 (100.00%) |
| packages/charts-recharts/src/descriptor.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| packages/chat/src/core/durable-runs/policies.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/react/components/SentAttachment.tsx | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/chat/src/store/runtime/entry.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/forms/delete-submission.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/forms/delivery/retry-policy.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| packages/cms/src/media/created-by.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/6 (0.00%) | 0/7 (0.00%) |
| packages/cms/src/widgets/html/index.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/widgets/resolvers/create-core-resolvers.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/cms/src/workspace/index.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/commerce/src/payments/index.ts | LOADED | 6 | 0/6 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/core/src/fetch/cache.ts | LOADED | 6 | 176/182 (96.70%) | 95/101 (94.06%) | 26/29 (89.66%) |
| packages/db/src/tools/plan-store.ts | LOADED | 6 | 25/31 (80.65%) | 10/13 (76.92%) | 4/4 (100.00%) |
| packages/devops/src/core/deploy-types.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/devops/src/core/redirect-guard.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/devops/src/source-control/kit.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/8 (0.00%) |
| packages/integrations/src/webhooks/subscriptions.ts | LOADED | 6 | 133/139 (95.68%) | 32/36 (88.89%) | 6/6 (100.00%) |
| packages/mcp/src/server/resources/active-resource.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/oauth/src/testing/registration-cache.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| packages/platform/src/http/guarded/index.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/platform/src/secrets/credential-sets/index.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui-kit/src/react/index.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/asset-grid/react/components/AssetGridToolbar.tsx | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/20 (0.00%) | 0/8 (0.00%) |
| packages/ui/src/features/browser-chrome/constants.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/charts/contract.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/command-palette/index.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/execution/react/hooks/useLocalCliAgentList.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/folder-path-drop/react/hooks/useFolderPathDropCapture.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/html-editor/dom.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/i18n/dictionary-translator.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/iframe-pool/index.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/checkbox-field.tsx | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/input.tsx | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/memory/react/components/MemoryHowPanel.tsx | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/mention-autocomplete/react/components/MentionResultsList.tsx | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/mention-autocomplete/react/components/SelectedMentionChips.tsx | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/revision-review/react/components/RevisionDiffCard.tsx | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/settings/dialog/react/components/SettingsDialogShell.tsx | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/skills/index.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/tab-launcher-menu/index.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/tabbed-dialog/react/components/TabbedDialogSidebar.tsx | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/16 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/viewer-shell/react/components/SegmentedToggle.tsx | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/react/components/Icon.tsx | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/4 (0.00%) | 0/98 (0.00%) |
| packages/ui/src/react/components/Notice.tsx | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/14 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/react/hooks/useStableHandler.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/renderers/annotation-canvas/index.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/renderers/renderers/svg.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/10 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/renderers/sandbox-scripts.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/utils/visual-stability.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/user-management/src/server/grant-service.ts | LOADED | 6 | 274/280 (97.86%) | 71/77 (92.21%) | 14/14 (100.00%) |
| packages/admin/src/agent-plugins/agent-plugins.module.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/forms/messages.en.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/forms/ports.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/forms/react/components/FormSubmissionsTable.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| packages/admin/src/forms/react/hooks/use-form-submission-date.hooks.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/media/media.module.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/media/react/components/MediaDialog.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/media/react/components/MediaGrid.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/media/react/components/MediaPurgeDialog.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/media/react/components/UploadButton.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/react/entities/RelationTruncationNotice.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/redirects/controllers/hit-count.controller.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/redirects/react/components/ImportRedirectsForm.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/security/react/components/CredentialEditor.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/seo/models.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/seo/react/hooks/use-seo-entry-section.hooks.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/seo/seo.module.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/source-control/index.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/source-control/react/components/SourceControlCredentialFields.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/source-control/source-control.module.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/widgets/messages.en.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/admin/vitest.setup.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/remotion.config.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/Root.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/core/assistant-client/entry.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/core/usage-format.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/chat/src/react/components/Icon.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/components/NextStepActions.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| packages/chat/src/react/components/ToolCallGroup.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneSuggestion.hooks.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/chat/src/react/util/defined-props.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/chat/vitest.postgres.config.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/entries/list.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/forms/fields-json.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/cms/src/media/slug.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/seo/errors.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/daemon/src/agent-executor/contracts.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/daemon/src/agent-executor/handoff.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/daemon/src/http/cancel-owned-runs.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| packages/daemon/src/remote-tool-bridge.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/daemon/src/scheduler.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/daemon/src/tokens.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/daemon/src/tool-recovery/index.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/db/src/transfer/copy-engine.ts | LOADED | 5 | 174/179 (97.21%) | 104/120 (86.67%) | 17/17 (100.00%) |
| packages/db/vitest.postgres.config.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/devops/src/source-control/entry.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/devops/src/static-export/entry.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/oauth/tests/dispatcher-stub.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/platform/src/asset-cache.adapter.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/platform/src/web/html-resource.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| packages/plugins/src/glue/dispatch.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/plugins/src/host/errors.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/plugins/src/host/sql/repo.rows.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| packages/ui-kit/src/react/confirm/ConfirmDialog.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui-kit/src/react/native/index.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/admin-widgets/components/ImagePreviewModal.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/asset-grid/constants.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/asset-grid/react/components/SelectionActionBar.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeToolbar.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/file-dropzone/react/components/FileDropzoneNameList.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/html-viewer/react/components/DeckNavigationControls.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/i18n/index.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/media-providers/index.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/memory/react/render-markdown.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceRowListItemParts.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/18 (0.00%) | 0/4 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceRowListView.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/revision-review/react/components/RevisionHistoryList.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/schedule-picker/constants.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/sketch-editor/react/components/SketchMainMenu.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/14 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/tab-launcher-menu/constants.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/tab-strip/dependencies.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/viewer-shell/dependencies.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/viewer-shell/react/components/SvgSourcePane.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/viewer-shell/react/components/ViewerFileActions.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/12 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/react/components/FileImportPanel.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/renderers/renderers/react-component.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/renderers/srcdoc/bridge.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/user-management/src/server/agent-tool-registrations.ts | LOADED | 5 | 296/301 (98.34%) | 62/69 (89.86%) | 31/31 (100.00%) |
| packages/vibecoding/vitest.setup.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/agent-plugins/react/components/AgentPluginFileTree.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/agent-plugins/react/hooks/AgentPluginRow.hooks.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/browser/shell-navigation.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| packages/admin/src/comments/comments.module.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/comments/messages.en.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/comments/ports.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/forms/forms.module.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/forms/models.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/media/ports.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/media/react/hooks/MediaGrid.hooks.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/admin/src/playground/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/playground/playground.module.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/playground/react/hooks/PlaygroundPorts.hooks.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/react/entities/types.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/react/OverlayHost.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/react/shell/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/redirects/messages.en.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/redirects/redirects.module.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/security/ports.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/security/security.module.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/seo/controllers/entry-section.controller.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/seo/react/components/MediaPickerBridge.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/source-control/react/components/SourceControlProviderRow.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/source-control/react/hooks/SourceControlCredentialFields.hooks.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/source-control/react/hooks/SourceControlPorts.hooks.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/widgets/ports.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-plugins/src/lifecycle/install-errors.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/agent-plugins/src/lifecycle/tools/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/src/agent-protocol/acp/account-failure.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/agent-runtime/src/agent-protocol/acp/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/analytics/src/repo.memory.ts | LOADED | 4 | 24/28 (85.71%) | 9/9 (100.00%) | 6/8 (75.00%) |
| packages/chat/src/core/messages.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/core/question-form.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/embed-widget/react/header.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/react/components/ConversationList.rules.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/store/errors.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/consent/types.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/content-types/list.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/core/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/core/transform-format.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/entries/agent-tools.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/forms/sql/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/listing/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/media/agent-tools.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/navigation/contracts.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/redirects/ports.internal.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/taxonomy/agent-tools.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/widgets/markers/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/widgets/page-embed-types.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/widgets/types.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/workspace/agent-tools.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/core/src/settings/repo.memory.ts | LOADED | 4 | 180/184 (97.83%) | 82/86 (95.35%) | 22/22 (100.00%) |
| packages/daemon/src/continuation/continuation-transport.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| packages/daemon/src/continuation/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/daemon/src/continuation/run-start-handler.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/18 (0.00%) | 0/2 (0.00%) |
| packages/daemon/src/routines/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/daemon/src/store/agent-sessions/errors.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/daemon/src/store/agent-sessions/pglite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/daemon/src/store/agent-sessions/postgres.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/db/src/kernel/sqlite/ops.ts | LOADED | 4 | 21/25 (84.00%) | 7/9 (77.78%) | 3/3 (100.00%) |
| packages/db/src/pglite/socket-server.ts | LOADED | 4 | 272/276 (98.55%) | 114/124 (91.94%) | 28/30 (93.33%) |
| packages/devops/src/deploy/naming.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/http-kit/src/sse.ts | LOADED | 4 | 91/95 (95.79%) | 44/44 (100.00%) | 10/11 (90.91%) |
| packages/mcp/src/tools/ask-choice/schema.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/platform/src/http/guarded/node-ports.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| packages/platform/src/secrets/keyring.memory.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/sandbox/src/e2b/wrap-e2b-sandbox.ts | LOADED | 4 | 244/248 (98.39%) | 115/116 (99.14%) | 25/25 (100.00%) |
| packages/ui-kit/src/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui-kit/src/kit-contract.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/a2ui/catalog-from-registry.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/a2ui/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/appearance/constants.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeEmptyState.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFolderRow.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeRowMenu.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeSelectionBar.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/components/AssetTreeUploadErrorBanner.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/command-palette/constants.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/html-viewer/constants.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/lib/utils.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/media-providers/react/components/media-providers-tab-labels.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/memory/async-commit-guard.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/features/mention-autocomplete/react/components/MentionResultItem.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/notifications/notifications-catalog.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/panel-kit/helpers/resolve-active-tab-id.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/project-locations/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceRowListItem.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/StatusPill.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/schedule-picker/react/components/ScheduleKindTabs.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/schedule-picker/react/components/WeekdayGrid.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/source-config-list/constants.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/source-config-list/react/components/SourceConfigTrustOptions.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/tabbed-dialog/react/components/TabbedDialogChrome.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/version-manager/constants.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/viewer-shell/react/components/CodeWithLines.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/viewer-shell/react/components/ViewerShell.tsx | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/react/mcp-ui/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/renderers/preview-modal-shell/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/theme/color-scheme.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/10 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/theme/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/utils/browser-request.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/utils/localized-url.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/user-management/src/admin/conformance/index.ts | LOADED | 4 | 85/89 (95.51%) | 60/77 (77.92%) | 11/11 (100.00%) |
| packages/admin/src/agent-plugins/react/tabs/DownloadedTab.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/agent-plugins/react/tabs/InstalledTab.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/core/module/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/forms/react/components/FormEditorHeaderText.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/playground/react/tabs/CanvasTab.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/react/entities/EntityIndex.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| packages/admin/src/redirects/ports.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/seo/ports.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/source-control/react/hooks/SourceControlPage.hooks.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| packages/admin/src/widgets/react/components/WidgetRegionEditorHeaderActions.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/widgets/react/hooks/navigation.hooks.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/agent-plugins/vitest.config.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/src/agent-protocol/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/src/agent-protocol/pi-rpc/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/src/defs/auggie.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| packages/agent-runtime/src/defs/cline.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| packages/agent-runtime/src/defs/devin.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/agent-runtime/src/defs/goose.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| packages/agent-runtime/src/defs/hermes.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| packages/agent-runtime/src/defs/kilo.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| packages/agent-runtime/src/defs/kimi.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| packages/agent-runtime/src/defs/kiro.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| packages/agent-runtime/src/defs/trae-cli.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| packages/agent-runtime/src/defs/vibe.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/DeviceFrame.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/artifacts/src/runtime-compat.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| packages/chat/src/react/features/chat-pane/hooks/useChatPaneSurface.hooks.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/server/durable-runs/entry.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/store/legacy/sqlite/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/store/sqlite/schema.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/comments/types.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/consent/html/client.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/consent/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/forms/email-format.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/forms/html/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/media/blob-key.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/media/node.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/navigation/types.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/redirects/referrer-alias.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/redirects/sql/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/daemon/src/run/core/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/daemon/vitest.postgres.config.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/db/src/kernel/pglite/ops.ts | LOADED | 3 | 53/56 (94.64%) | 22/23 (95.65%) | 5/5 (100.00%) |
| packages/devops/src/agent-jobs/entry.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/mcp/src/core/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/mcp/src/federation/approvals/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/mcp/src/federation/approvals/revocation-reason.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/mcp/src/federation/messages.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/4 (0.00%) | 0/7 (0.00%) |
| packages/mcp/src/federation/stdio/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/oauth/src/testing/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/platform/src/http/guarded/errors.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/platform/src/secrets/credential-sets/vault.aad.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/platform/src/web/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/plugins/src/glue/attachment-points/content-lifecycle.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/plugins/src/glue/attachment-points/events.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/plugins/src/host/attach-loaded-plugin.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/plugins/src/host/worker/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/sidecar/src/daemon-registry.ts | LOADED | 3 | 60/63 (95.24%) | 38/40 (95.00%) | 7/7 (100.00%) |
| packages/ui/src/browser/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/about/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/admin-widgets/components/ComingSoonNotice.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/asset-grid/react/components/SelectionBand.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/charts/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/command-palette/react/components/CommandPaletteRow.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/connectors/components/ConnectorGate.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/integrations/constants.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/native/data-table.manifest.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/action-button.manifest.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/action-button.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/checkbox-field.manifest.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/content-card.manifest.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/content-card.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/data-table.manifest.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/radio-group-field.manifest.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/select-field.manifest.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/select-field.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/text-input-field.manifest.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/shadcn/text-input-field.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/list-detail-panel/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/mcp-ui/protocol.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/mention-autocomplete/constants.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/progress-card/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/resource-dashboard/constants.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceBoardToolbar.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/18 (0.00%) | 0/6 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceBoardView.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/ResourceMetrics.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/revision-review/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/settings/dialog/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/sketch-editor/dependencies.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/sketch-editor/react/components/SketchSaveStateBadge.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/tab-strip/constants.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/tab-strip/react/components/TabStripFrame.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/tabbed-dialog/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/viewer-shell/constants.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/viewer-shell/react/components/AudioViewerBody.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/viewer-shell/react/components/CommentSideDock.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/viewer-shell/react/components/JsonPanel.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/viewer-shell/react/components/ViewportToggleGroup.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/react/components/CompactToggle.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/react/components/EdgeScrollZones.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/react/components/ImportChoice.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/react/components/ToggleRow.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/renderers/annotation-canvas/react/components/icons.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/15 (0.00%) |
| packages/ui/src/renderers/preview-modal-shell/react/components/icons.tsx | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| packages/ui/src/utils/ime-composing.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/vitest.config.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/agent-plugins/ports.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/agent-plugins/react/hooks/MarketplaceTab.hooks.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/browser/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/contracts/credential-management.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/contracts/media-picker.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/contracts/playground-render-target.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/core/module/define-admin-module.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/core/module/token.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/core/permissions/rules.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/core/react/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/core/transport/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/forms/react/components/FormSubmissionDate.tsx | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/media/react/hooks/MediaPurgeDialog.hooks.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/source-control/ports.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/widgets/react/components/WidgetsLibraryNotices.tsx | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| packages/admin/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/src/capabilities.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agentic/src/index.ts | LOADED | 2 | 0/2 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/agentic/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/analytics/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/artifacts/src/tokens.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/capability-providers/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/charts-recharts/src/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/charts-recharts/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/core/durable-runs/run-lock.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/chat/src/core/persistence/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/react/features/chat-pane/agent-tools.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/testing/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/cli/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/forms/src/forms.ts | LOADED | 2 | 161/163 (98.77%) | 104/105 (99.05%) | 15/15 (100.00%) |
| packages/cms/forms/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/comments/sql/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/consent/html/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/forms/html/html-submission-adapter.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/forms/rate-limit-key.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/media/import/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/presentation/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/widgets/markers/media-reference.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/cms/src/widgets/sql/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/widgets/where-used.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| packages/cms/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/commerce/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/core/src/settings/errors.ts | LOADED | 2 | 25/27 (92.59%) | 2/2 (100.00%) | 2/3 (66.67%) |
| packages/core/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/daemon/src/core/tool-candidates.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| packages/daemon/src/run/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/daemon/src/tool-audit.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
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
| packages/mcp/src/agent-install/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/mcp/src/federation/approvals/scope-option.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/mcp/src/federation/ports.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/mcp/src/federation/testing/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/mcp/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/memory/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/oauth/src/redact.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/oauth/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/platform/src/mail/delivery-availability.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/platform/src/mail/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/platform/src/secrets/aad.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/platform/src/secrets/credential-sets/contracts.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/platform/src/secrets/testing.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/platform/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/plugins/src/host/sql/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/protocol/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/sandbox/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/server/src/lifecycle/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/sidecar/src/supervisor-node.ts | LOADED | 2 | 79/81 (97.53%) | 51/53 (96.23%) | 13/14 (92.86%) |
| packages/sidecar/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui-kit/src/react/testing/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui-kit/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/admin-widgets/components/ComingSoonPanel.tsx | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/appearance/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/external-mcp/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/folder-path-drop/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/iframe-pool/react/pool-context.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/interactive-ui/providers/native/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/notifications/constants.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/notifications/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/notifications/rules.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/panel-kit/fetch-query/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/panel-kit/fetch-query/tanstack.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/panel-kit/helpers/permissions.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/privacy/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/resourceRowListProps.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/resource-dashboard/react/components/translatedErrorLabelProps.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/tab-launcher-menu/react/components/TabLauncherActionRow.tsx | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/features/tab-launcher-menu/react/components/TabLauncherResultRow.tsx | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/features/tabbed-dialog/react/components/TabbedDialogHeader.tsx | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/viewer-shell/react/components/ImageViewerBody.tsx | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/viewer-shell/react/components/VideoViewerBody.tsx | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/react/components/OnboardingPanelHeader.tsx | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/react/components/OptionCards.tsx | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| packages/ui/src/react/components/PillButton.tsx | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/react/components/PopoverItem.tsx | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/react/components/PopoverMenu.tsx | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/react/components/StatCard.tsx | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/react/components/TokenChip.tsx | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/react/components/ValueChip.tsx | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/renderers/annotation-canvas/dependencies.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/ui/src/renderers/srcdoc/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/utils/platform.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| packages/user-management/src/server/authorize.ts | LOADED | 2 | 69/71 (97.18%) | 36/38 (94.74%) | 3/3 (100.00%) |
| packages/user-management/src/server/repo.memory-transactions.ts | LOADED | 2 | 60/62 (96.77%) | 22/25 (88.00%) | 6/6 (100.00%) |
| packages/user-management/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/vibecoding/vitest.config.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/agent-plugins/messages.en.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/consent/react/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/media/messages.en.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/media/styles.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/playground/adapters/http.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/playground/messages.en.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/playground/react/hooks/PlaygroundPage.hooks.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| packages/admin/src/playground/rules.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/admin/src/react/bind-react.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/react/use-controller.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/security/messages.en.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/seo/messages.en.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/admin/src/source-control/messages.en.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-plugins/persistent-state.js | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-plugins/src/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/src/agent-protocol/core/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/src/amr-profile-resolver.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/agent-runtime/src/artifact-taxonomy.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/agent-runtime/src/prompt-augmenter.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/agent-runtime/src/providers/sse-decode.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/chatSpec.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/agent-runtime/src/telemetry-sink.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/agentic/src/core/site-guide/topic-schema.ts | LOADED | 1 | 47/48 (97.92%) | 36/42 (85.71%) | 11/12 (91.67%) |
| packages/agentic/src/skills/install/live-registration.ts | LOADED | 1 | 49/50 (98.00%) | 22/27 (81.48%) | 8/8 (100.00%) |
| packages/artifacts/src/node/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/contracts/chat-bubble-style.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/core/agentic/chat-capabilities.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/core/agentic/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/core/conversation-title.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/core/history-tool-metadata.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/embed-widget/browser/page-actions.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/react/chat-pane.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/react/features/chat-pane/styles.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/store/contracts/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/store/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/chat/src/store/legacy/sqlite/schema.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/comments/express/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/consent/html/styles.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/core/tools/args.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/core/tools/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/forms/delivery/types.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/forms/express/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/forms/types.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/listing/see-more-script.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/routing/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/seo/xml-escape.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/settings/express/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/cms/src/settings/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/commerce/src/http/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/commerce/src/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/commerce/src/store/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/daemon/src/agent-executor.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/daemon/src/read-only-tools.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/daemon/src/run/diagnostics/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/daemon/src/store/agent-sessions/schema.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/db/src/postgres/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/db/src/recovery/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/db/src/secrets-vault/repo.sql.ts | LOADED | 1 | 146/147 (99.32%) | 121/126 (96.03%) | 17/17 (100.00%) |
| packages/devops/src/deploy/redirect-guard.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/devops/src/deploy/types.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/devops/src/static-export/failure-summary.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/diagnostics/src/web-evidence/lazy-browser.ts | LOADED | 1 | 83/84 (98.81%) | 41/45 (91.11%) | 10/12 (83.33%) |
| packages/diagnostics/src/web-evidence/playwright-runtime.ts | LOADED | 1 | 33/34 (97.06%) | 8/12 (66.67%) | 1/1 (100.00%) |
| packages/mcp/src/agent-install/chrome-devtools.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/mcp/src/client/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/oauth/src/messages.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/platform/src/messages.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/12 (0.00%) |
| packages/platform/src/net/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/registry/src/tool-catalog-builder/query.ts | LOADED | 1 | 58/59 (98.31%) | 30/31 (96.77%) | 9/9 (100.00%) |
| packages/sandbox/src/node-worker.ts | LOADED | 1 | 82/83 (98.80%) | 43/46 (93.48%) | 7/7 (100.00%) |
| packages/server/src/storage/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui-kit/src/testing/scenarios.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/core/theme/default.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/a2ui/protocol.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeDragUpload.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/external-mcp/constants.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.ar.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.bn.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.de.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.en.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.es.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.fa.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.fr.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.hi.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.hu.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.id.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.it.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.ja.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.ko.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.pl.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.pt-BR.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.ru.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.th.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.tr.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.uk.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.ur.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.zh-CN.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/dictionaries/settings-dialog.zh-TW.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/i18n/universal.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/iframe-pool/constants.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/instructions/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/language/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/mcp-ui/sandbox-proxy-link-forwarder.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/media-providers/constants.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/memory/react/styles.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/observability/ports.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/features/settings/dialog/react/hooks/useSettingsDialogShell.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/skills/react/components/SkillRow.labels.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/skills/react/components/SkillsTab.labels.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/features/tab-strip/ports.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| packages/ui/src/icon-name.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/theme/default.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/theme/stylesheet.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/theme/types.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/ui/src/theme/validation.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/user-management/src/admin/controllers/members.controller.ts | LOADED | 1 | 66/67 (98.51%) | 46/57 (80.70%) | 15/16 (93.75%) |
| packages/user-management/src/admin/index.ts | LOADED | 1 | 0/1 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/vibecoding/src/html/regions.ts | LOADED | 1 | 121/122 (99.18%) | 50/53 (94.34%) | 10/10 (100.00%) |
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
| packages/analytics/src/ingest.ts | LOADED | 0 | 282/282 (100.00%) | 172/172 (100.00%) | 25/25 (100.00%) |
| packages/analytics/src/ports.ts | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/analytics/src/salt.ts | LOADED | 0 | 9/9 (100.00%) | 6/7 (85.71%) | 1/1 (100.00%) |
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
| packages/core/src/settings/express/http-request.ts | LOADED | 0 | 37/37 (100.00%) | 22/22 (100.00%) | 4/4 (100.00%) |
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
| packages/core/src/tool-input-errors.ts | LOADED | 0 | 7/7 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/core/src/tool-input-normalization.ts | LOADED | 0 | 142/142 (100.00%) | 136/136 (100.00%) | 20/20 (100.00%) |
| packages/core/src/tool-metadata.ts | LOADED | 0 | 45/45 (100.00%) | 37/37 (100.00%) | 3/3 (100.00%) |
| packages/core/src/tool-permissions.ts | LOADED | 0 | 21/21 (100.00%) | 6/6 (100.00%) | 4/4 (100.00%) |
| packages/core/src/tool-tokens.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
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
| packages/db/src/kernel/sqlite/driver.ts | LOADED | 0 | 95/95 (100.00%) | 39/39 (100.00%) | 20/21 (95.24%) |
| packages/db/src/kernel/sqlite/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/db/src/kernel/turn-lock.ts | LOADED | 0 | 28/28 (100.00%) | 20/20 (100.00%) | 5/5 (100.00%) |
| packages/db/src/migrate/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/db/src/migrate/step.ts | LOADED | 0 | 20/20 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| packages/db/src/pg-fixture.ts | LOADED | 0 | 37/37 (100.00%) | 14/15 (93.33%) | 4/4 (100.00%) |
| packages/db/src/pglite/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
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
| packages/desktop-host/src/paths.ts | LOADED | 0 | 50/50 (100.00%) | 32/32 (100.00%) | 5/5 (100.00%) |
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
| packages/diagnostics/src/agent-logs.ts | LOADED | 0 | 104/104 (100.00%) | 52/52 (100.00%) | 5/5 (100.00%) |
| packages/diagnostics/src/contract.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/diagnostics/src/core/secrets-only.ts | LOADED | 0 | 248/248 (100.00%) | 113/114 (99.12%) | 28/31 (90.32%) |
| packages/diagnostics/src/discovery-filesystem.ts | LOADED | 0 | 21/21 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| packages/diagnostics/src/domain-dns/index.ts | LOADED | 0 | 89/89 (100.00%) | 65/67 (97.01%) | 15/15 (100.00%) |
| packages/diagnostics/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/diagnostics/src/manifest.ts | LOADED | 0 | 37/37 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| packages/diagnostics/src/node-ports.ts | LOADED | 0 | 48/48 (100.00%) | 18/18 (100.00%) | 10/10 (100.00%) |
| packages/diagnostics/src/observability/config.ts | LOADED | 0 | 10/10 (100.00%) | 11/11 (100.00%) | 1/1 (100.00%) |
| packages/diagnostics/src/observability/hooks.ts | LOADED | 0 | 25/25 (100.00%) | 18/18 (100.00%) | 7/7 (100.00%) |
| packages/diagnostics/src/observability/index.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/diagnostics/src/observability/instrumentation.ts | LOADED | 0 | 95/95 (100.00%) | 92/92 (100.00%) | 24/24 (100.00%) |
| packages/diagnostics/src/observability/node.ts | LOADED | 0 | 5/5 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| packages/diagnostics/src/observability/noop.ts | LOADED | 0 | 17/17 (100.00%) | 9/9 (100.00%) | 9/9 (100.00%) |
| packages/diagnostics/src/observability/otel.ts | LOADED | 0 | 87/87 (100.00%) | 66/66 (100.00%) | 12/12 (100.00%) |
| packages/diagnostics/src/redaction.ts | LOADED | 0 | 54/54 (100.00%) | 28/29 (96.55%) | 4/4 (100.00%) |
| packages/diagnostics/src/redaction/secrets-only.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/diagnostics/src/sources.ts | LOADED | 0 | 72/72 (100.00%) | 34/34 (100.00%) | 4/4 (100.00%) |
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
| packages/infra/src/events/outbox/worker.ts | LOADED | 0 | 105/105 (100.00%) | 64/64 (100.00%) | 15/15 (100.00%) |
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
| packages/memory/src/entry-frontmatter.ts | LOADED | 0 | 21/21 (100.00%) | 8/8 (100.00%) | 2/2 (100.00%) |
| packages/memory/src/extract-facts.ts | LOADED | 0 | 100/100 (100.00%) | 61/61 (100.00%) | 8/8 (100.00%) |
| packages/memory/src/extraction-log.ts | LOADED | 0 | 143/143 (100.00%) | 55/55 (100.00%) | 20/20 (100.00%) |
| packages/memory/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/memory/src/llm-provider.ts | LOADED | 0 | 259/259 (100.00%) | 114/115 (99.13%) | 20/20 (100.00%) |
| packages/memory/src/note-store.ts | LOADED | 0 | 431/431 (100.00%) | 195/196 (99.49%) | 45/45 (100.00%) |
| packages/memory/src/rule-body.ts | LOADED | 0 | 24/24 (100.00%) | 11/11 (100.00%) | 1/1 (100.00%) |
| packages/memory/src/verify.ts | LOADED | 0 | 130/130 (100.00%) | 67/67 (100.00%) | 13/13 (100.00%) |
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
| packages/vibecoding/src/core/apply.ts | LOADED | 0 | 39/39 (100.00%) | 13/13 (100.00%) | 1/1 (100.00%) |
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

- packages/ui/src/renderers/annotation-canvas/react/hooks/useAnnotationCanvas.ts
- packages/platform/src/download.ts
- packages/agent-runtime/src/json-event-stream.ts
- packages/agent-runtime/src/agent-protocol/acp/session.ts
- packages/daemon/src/agent-executor/events.ts
- packages/agent-runtime/src/claude-stream.ts
- packages/daemon/src/http/attachments.ts
- packages/daemon/src/agent-executor/launch.ts
- packages/daemon/src/run-lifecycle.ts
- packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts
- packages/cms/src/widgets/resolver-service.ts
- packages/plugins/src/host/node/install.ts
- packages/cms/src/taxonomy/write-service.ts
- packages/agent-runtime/src/model-discovery-adapters.ts
- packages/chat/src/embed-widget/vanilla/index.ts
- packages/chat/src/react/hooks/assistant-chats.ts
- packages/ui/src/features/memory/react/hooks/useMemoryConnectors.hooks.ts
- packages/daemon/src/http/xai.ts
- packages/daemon/src/agent-executor/mcp-bridge.ts
- packages/ui/src/features/connectors/rules.ts
- packages/devops/src/checks/hardwiring.ts
- packages/agent-runtime/src/providers/openai-chat.ts
- packages/chat/src/core/assistant-client/transport.ts
- packages/chat/src/react/components/Markdown.tsx
- packages/ui/src/features/execution/rules.ts
- packages/daemon/src/http/connectors.ts
- packages/plugins/src/host/node/source-drafts.ts
- packages/cms/src/widgets/markers/marker.ts
- packages/platform/src/web/web-page.ts
- packages/cms/src/redirects/redirects.ts
- packages/platform/src/fs/guarded-reader.ts
- packages/agent-plugins/core/persistent-state.js
- packages/cms/src/media/video-frames.ffmpeg.ts
- packages/agent-plugins/src/lifecycle/activation.ts
- packages/agent-plugins/src/lifecycle/install.ts
- packages/agent-runtime/src/agent-protocol/core/json-line-stream.ts
- packages/agent-runtime/src/providers/model-catalog.ts
- packages/agent-runtime/src/providers/anthropic-messages.ts
- packages/agent-runtime/src/providers/google-messages.ts
- packages/platform/src/terminal.ts
- packages/mcp/src/federation/trust.ts
- packages/chat/src/react/components/QuestionForm.tsx
- packages/cms/src/navigation/menu-service.ts
- packages/chat/src/react/components/Composer.tsx
- packages/mcp/src/core/config.ts
- packages/agent-runtime/src/providers/ollama-chat.ts
- packages/platform/src/fs/file-lock.ts
- packages/chat/src/store/runtime/durable-run-store.ts
- packages/daemon/src/tool-executor.ts
- packages/cms/src/media/media-service.ts
- packages/devops/src/static-export/runner.ts
- packages/agent-runtime/src/providers/google-schema.ts
- packages/mcp/src/federation/stdio/adapter.stdio.ts
- packages/ui/src/react/components/TooltipLayer.tsx
- packages/plugins/src/host/manifest.ts
- packages/ui/src/features/memory/react/hooks/useMemoryEntries.hooks.ts
- packages/platform/src/blob-storage.ts
- packages/cms/src/widgets/embed-service.ts
- packages/ui/src/features/html-editor/react/hooks/useInteractiveHtmlEditor.ts
- packages/ui/src/features/sketch-editor/dom.ts
- packages/chat/src/core/run-events/entry.ts
- packages/admin/src/forms/field-settings.ts
- packages/agent-plugins/src/lifecycle/manifest.ts
- packages/ui/src/features/lexical-rich-text-editor/rules.ts
- packages/chat/src/react/components/ToolCard.tsx
- packages/devops/src/packaging/electron/staging.ts
- packages/ui/src/features/skills/react/hooks/useSkillsTab.ts
- packages/ui/src/react/hooks/useResizableSplitPane.ts
- packages/agent-runtime/src/model-discovery.ts
- packages/ui/src/features/memory/formatters.ts
- packages/platform/src/proxy-env.ts
- packages/agent-runtime/src/agent-protocol/pi-rpc/session.ts
- packages/agent-runtime/src/skills/web-clone/scripts/asset-harvest.mjs
- packages/agent-runtime/src/skills/web-clone/scripts/interaction-probe.mjs
- packages/platform/src/secrets/credential-sets/vault.service.ts
- packages/agent-runtime/src/agent-protocol/acp/models.ts
- packages/agent-runtime/src/skills/web-clone/scripts/audit-clone.mjs
- packages/agent-runtime/src/detection.ts
- packages/chat/src/core/question-form/scan.ts
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneRuntimeInventory.hooks.ts
- packages/ui/src/features/progress-card/reference-adapters.ts
- packages/agent-runtime/src/providers/connection-test.ts
- packages/platform/src/web/html-document.ts
- packages/platform/src/asset-cache.ts
- packages/daemon/src/tool-recovery/recovery.ts
- packages/cms/src/forms/field-registry.ts
- packages/daemon/src/http/memory.ts
- packages/daemon/src/http/media.ts
- packages/chat/src/react/hooks/composer-draft-cache.ts
- packages/cms/src/forms/html/html-authoring.ts
- packages/platform/src/process.ts
- packages/admin/src/core/module/create-admin.ts
- packages/daemon/src/http/routines.ts
- packages/platform/src/web/html-to-markdown.ts
- packages/ui/src/features/panel-kit/hooks/use-standing-draft-autosave.hooks.ts
- packages/agent-runtime/src/executables.ts
- packages/chat/src/react/hooks/useComposer.ts
- packages/daemon/src/http/host-tools.ts
- packages/daemon/src/http/runs.ts
- packages/cms/src/entries/write-service.ts
- packages/agent-runtime/src/providers/tool-turn.ts
- packages/cms/src/consent/html/gate.ts
- packages/agent-runtime/src/skills/web-clone/scripts/recon-site.mjs
- packages/agent-plugins/src/lifecycle/tools/projection.ts
- packages/chat/src/react/features/chat-pane/components/ChatPane.tsx
- packages/daemon/src/http/terminals.ts
- packages/ui/src/features/browser-chrome/rules.ts
- packages/ui/src/features/version-manager/react/hooks/useVersionManager.ts
- packages/daemon/src/routines/schedule.ts
- packages/admin/src/core/entities/rules.ts
- packages/daemon/src/http/model-proxy.ts
- packages/daemon/src/routines/scheduler.ts
- packages/ui/src/features/asset-tree-browser/rules.ts
- packages/ui/src/features/connectors/hooks/useConnectorAuthorization.ts
- packages/platform/src/secrets/keyring.env.ts
- packages/admin/src/seo/rules.ts
- packages/platform/src/fs/directory-user-config.ts
- packages/ui/src/utils/markdown-scroll-sync.ts
- packages/agent-plugins/src/lifecycle/uninstall.ts
- packages/chat/src/server/durable-runs/recover.ts
- packages/ui/src/features/media-providers/react/hooks/useMediaProvidersTab.ts
- packages/agent-plugins/src/admin-surfaces/surface-client.ts
- packages/mcp/src/federation/adapter.http.ts
- packages/agent-runtime/src/skills/web-clone/scripts/compare-recon.mjs
- packages/chat/src/store/sql/store.ts
- packages/devops/src/checks/published-types/index.ts
- packages/platform/src/http/guarded/client.ts
- packages/ui/src/renderers/annotation-canvas/drawing.ts
- packages/agent-runtime/src/auth.ts
- packages/chat/src/core/util/strip.ts
- packages/daemon/src/legacy-data-migration.ts
- packages/ui/src/features/viewer-shell/rules.ts
- packages/agent-plugins/src/admin-surfaces/descriptor.ts
- packages/artifacts/src/manifest.ts
- packages/cms/src/media/document-ingress.ts
- packages/platform/src/fs/atomic-write.ts
- packages/ui/src/features/memory/react/hooks/useMemoryExtractions.store.ts
- packages/ui/src/features/panel-kit/fetch-query/adapter.tanstack.tsx
- packages/cms/src/widgets/write-service.ts
- packages/platform/src/fs/directory-workspace.ts
- packages/server/src/builtin-features.ts
- packages/chat/src/react/components/A2uiSurfaceCard.tsx
- packages/ui/src/features/sketch-editor/rules.ts
- packages/agent-runtime/src/skills/web-clone/scripts/route-crawl.mjs
- packages/ui/src/features/html-editor/canvas-embed-placeholders.ts
- packages/ui/src/react/components/CustomSelect.tsx
- packages/ui/src/features/resource-dashboard/react/hooks/useResourceBoard.ts
- packages/ui/src/features/html-editor/editor-blocks.ts
- packages/ui/src/react/components/OnboardingDropdown.tsx
- packages/cms/src/consent/express/index.ts
- packages/cms/src/routing/routing.ts
- packages/agent-runtime/src/defs/amr.ts
- packages/ui/src/features/asset-grid/rules.ts
- packages/ui/src/react/components/WorkingDirPicker.tsx
- packages/cms/src/content-types/write-service.ts
- packages/oauth/tests/helpers.ts
- packages/cms/src/widgets/markers/gallery.ts
- packages/daemon/src/run/diagnostics/diagnostics.ts
- packages/devops/src/checks/hardwiring-node.ts
- packages/agent-runtime/src/skills/web-clone/scripts/visual-diff.mjs
- packages/chat/src/react/features/chat-pane/hooks/useAgentRuntimePicker.hooks.ts
- packages/devops/src/source-control/registry.ts
- packages/agent-runtime/src/claude-code-models.ts
- packages/chat/src/react/agent-bridge/frontend-session-bridge.ts
- packages/chat/src/store/runtime/history-tools.ts
- packages/cms/src/forms/forms.ts
- packages/ui/src/features/memory/dependencies.ts
- packages/ui/src/utils/notifications.ts
- packages/admin/src/comments/controllers/comment-queue.controller.ts
- packages/chat/src/react/components/MessageRow.tsx
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneAgentControl.hooks.ts
- packages/cms/src/seo/seo.ts
- packages/mcp/src/client/client.ts
- packages/oauth/src/authorization-code.ts
- packages/agent-runtime/src/defs/codex.ts
- packages/chat/src/core/util/parser.ts
- packages/chat/src/core/util/validate.ts
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneWorkingDirectory.hooks.ts
- packages/cms/src/consent/express/response.ts
- packages/daemon/src/terminal-session.ts
- packages/devops/src/static-export/transforms.ts
- packages/ui/src/features/panel-kit/hooks/use-settings-slice.hooks.ts
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/BubbleScene.tsx
- packages/ui/src/features/lexical-rich-text-editor/mention-parser.ts
- packages/agent-runtime/src/providers/azure-chat.ts
- packages/agent-runtime/src/skills/web-clone/scripts/od-preview-rewrite.mjs
- packages/chat/src/embed-widget/transports/fetch-sse.ts
- packages/platform/src/toolchain.ts
- packages/cms/src/seo/write-service.ts
- packages/mcp/src/server/daemon-client.ts
- packages/platform/src/fs/durable-json.ts
- packages/plugins/src/host/node/package-files.ts
- packages/chat/src/react/components/ConversationList.tsx
- packages/chat/src/react/features/chat-pane/rules.ts
- packages/chat/src/react/hooks/useConversation.ts
- packages/daemon/src/core/tool-gaps.ts
- packages/plugins/src/host/node/discovery.ts
- packages/agent-plugins/src/lifecycle/bundled-digests.ts
- packages/artifacts/src/text-suppression.ts
- packages/chat/src/react/features/chat-pane/create-daemon-attachment-uploader.ts
- packages/daemon/src/run-credentials.ts
- packages/admin/src/forms/react/hooks/use-form-editor.hooks.ts
- packages/agent-runtime/src/agent-protocol/acp/text-suppression.ts
- packages/agent-runtime/src/providers/oauth-callback-server.ts
- packages/chat/src/core/ag-ui/entry.ts
- packages/cms/src/forms/write-service.ts
- packages/ui/src/features/memory/react/hooks/useMemoryConfig.hooks.ts
- packages/ui/src/index.ts
- packages/agent-runtime/src/launch.ts
- packages/admin/src/media/controllers/library.controller.ts
- packages/agent-runtime/src/qoder-stream.ts
- packages/chat/src/react/hooks/fab-position.ts
- packages/cms/src/consent/node/index.ts
- packages/devops/src/deploy/reachability.ts
- packages/plugins/src/host/hook-registry.ts
- packages/ui/src/features/viewer-shell/react/hooks/useMarkdownScrollSync.ts
- packages/server/src/create-local-node-daemon.ts
- packages/ui/src/features/html-editor/css.ts
- packages/ui/src/react/components/select-popover.ts
- packages/agent-plugins/src/lifecycle/fetch-archive.ts
- packages/agent-runtime/src/agent-protocol/pi-rpc/events.ts
- packages/chat/src/react/hooks/useRunStream.ts
- packages/cms/src/seo/sitemap.ts
- packages/daemon/src/http/remote-run-events.ts
- packages/admin/src/media/react/hooks/LibraryTab.hooks.ts
- packages/admin/src/react/components/RowMenu/RowMenu.hooks.tsx
- packages/agent-runtime/src/skills/web-clone/scripts/dna-scaffold.mjs
- packages/chat/src/core/transcript.ts
- packages/chat/src/store/legacy/sqlite/messages.ts
- packages/cms/src/forms/descriptor-rules.ts
- packages/daemon/src/surface-exchanges.ts
- packages/platform/src/sandbox-env.ts
- packages/agent-plugins/src/admin-surfaces/surface-capabilities.ts
- packages/daemon/src/store/event-log/sqlite.ts
- packages/oauth/src/discovery.ts
- packages/ui/src/features/html-editor/protected-elements.ts
- packages/ui/src/features/viewer-shell/react/components/CommentSidePanel.tsx
- packages/ui/src/utils/zip.ts
- packages/admin/src/forms/rules.ts
- packages/agent-runtime/src/model-discovery-config.ts
- packages/agent-runtime/src/providers/elevenlabs.ts
- packages/ui/src/features/project-locations/react/hooks/useProjectLocationsTab.ts
- packages/agent-runtime/src/mmd-routes.ts
- packages/oauth/src/loopback-receiver.ts
- packages/platform/src/net/endpoint-policy.ts
- packages/admin/src/react/components/Sidebar.tsx
- packages/agent-plugins/src/lifecycle/resolve-agent-plugin-refs.ts
- packages/chat/src/core/accepted-input.ts
- packages/plugins/src/host/contributions.ts
- packages/ui/src/features/mcp-ui/secret-card.ts
- packages/agent-plugins/src/lifecycle/automatic-use.ts
- packages/server/src/compose-jini-kernel.ts
- packages/ui/src/features/asset-grid/react/hooks/useAssetGridLiveUpdates.ts
- packages/ui/src/renderers/preview-modal-shell/react/hooks/usePreviewModalShell.ts
- packages/ui/src/renderers/srcdoc/build.ts
- packages/chat/src/react/components/AttachmentPreviewModal.hooks.ts
- packages/ui/src/features/admin-widgets/components/Select/Select.hooks.tsx
- packages/chat/src/core/run-activity.ts
- packages/mcp/src/agent-install/install.ts
- packages/oauth/src/refresh.ts
- packages/ui/src/features/memory/react/hooks/useMemoryExtractions.hooks.ts
- packages/mcp/src/federation/stdio/stdio-launch-resolver.ts
- packages/platform/src/fs/verified-directory-move.ts
- packages/admin/src/media/react/hooks/ProvidersTab.hooks.ts
- packages/daemon/src/http/delegated-tools.ts
- packages/agent-runtime/src/opencode-log.ts
- packages/chat/src/server/run-finalizer/entry.ts
- packages/chat/src/store/runtime/run-ledger.ts
- packages/daemon/src/delegated-tool-bridge.ts
- packages/ui/src/features/execution/react/hooks/useExecutionTab.ts
- packages/ui/src/features/lexical-rich-text-editor/react/components/RichTextInput.tsx
- packages/ui/src/features/tab-strip/react/hooks/useTabStripDragReorder.ts
- packages/agent-plugins/src/admin-surfaces/action-schema.ts
- packages/agent-plugins/src/admin-surfaces/surface-handlers.ts
- packages/cms/src/consent/css.ts
- packages/daemon/src/frontend-session-registry.ts
- packages/cms/src/forms/html-render.ts
- packages/mcp/src/tools/ask-choice/index.ts
- packages/admin/src/forms/html-rules.ts
- packages/agent-plugins/src/lifecycle/skill-file-reader.ts
- packages/agent-runtime/src/agent-protocol/acp/updates.ts
- packages/mcp/src/core/tokens.ts
- packages/ui/src/react/components/ExportDiagnosticsButton.tsx
- packages/agent-runtime/src/skills/web-clone/scripts/mirror-site.mjs
- packages/ui/src/features/execution/react/components/ByokProviderForm.tsx
- packages/ui/src/features/sketch-editor/react/hooks/useSketchSaveWorkflow.ts
- packages/chat/src/core/turn-usage.ts
- packages/chat/src/react/hooks/useComposerHistory.hooks.ts
- packages/ui/src/features/execution/react/hooks/use-execution-credential.hooks.ts
- packages/agent-plugins/src/lifecycle/tools/capabilities.ts
- packages/cms/src/redirects/host-config/index.ts
- packages/cms/src/trash/write-service.ts
- packages/ui/src/react/mcp-ui/useMcpUiHost.ts
- packages/chat/src/embed-widget/browser/lazy-loader.ts
- packages/cms/src/widgets/config-validation.ts
- packages/daemon/src/http/research.ts
- packages/ui/src/features/source-config-list/react/components/SourceConfigItemCard.tsx
- packages/cms/src/forms/submit-service.ts
- packages/ui/src/features/charts/browser.ts
- packages/agent-runtime/src/providers/aihubmix.ts
- packages/agent-runtime/src/providers/connection-guard.ts
- packages/agent-runtime/src/providers/oauth-tokens.ts
- packages/chat/src/core/question-form/normalize.ts
- packages/chat/src/embed-widget/vanilla/state.ts
- packages/cms/src/media/blob-gc.ts
- packages/mcp/src/bin/serve.ts
- packages/platform/src/secrets/credential-sets/vault.repo.memory.ts
- packages/ui/src/features/file-dropzone/react/hooks/useFileDropzone.ts
- packages/ui/src/features/skills/rules.ts
- packages/admin/src/agent-plugins/package-file-tree.ts
- packages/cms/src/consent/css-parser.ts
- packages/cms/src/redirects/matcher.ts
- packages/cms/src/taxonomy/repo.memory.ts
- packages/plugins/src/host/node/loader.ts
- packages/ui/src/features/execution/react/hooks/useReasoningControl.ts
- packages/ui/src/features/panel-kit/fetch-query/adapter.react.tsx
- packages/admin/src/comments/rules.ts
- packages/admin/src/forms/react/hooks/use-form-submissions.hooks.ts
- packages/agent-runtime/src/models.ts
- packages/agent-runtime/src/skills/web-clone/scripts/sourcemap-hunt.mjs
- packages/cms/src/forms/repo.memory.ts
- packages/cms/src/media/video-frames.ts
- packages/daemon/src/http/frontend-sessions.ts
- packages/daemon/src/run/core/retry.ts
- packages/devops/src/agent-jobs/jobs.ts
- packages/mcp/src/federation/bootstrap.ts
- packages/ui/src/features/tab-launcher-menu/react/hooks/useTabLauncherMenu.ts
- packages/agent-plugins/src/lifecycle/seed-bundled.ts
- packages/agent-runtime/src/skills/web-clone/scripts/network-capture.mjs
- packages/chat/src/react/features/chat-pane/hooks/useRuntimeDropUp.hooks.ts
- packages/plugins/src/host/plugin-claims.ts
- packages/cms/src/entries/field-validation.ts
- packages/ui/src/features/iframe-pool/react/dom-sync.ts
- packages/ui/src/features/source-config-list/rules.ts
- packages/ui/src/renderers/renderers/markdown.ts
- packages/ui/src/utils/file-transfer.ts
- packages/admin/src/media/adapters/memory.ts
- packages/admin/src/media/rules.ts
- packages/admin/src/seo/react/pages/SeoPage.tsx
- packages/chat/src/core/durable-projection.ts
- packages/cms/src/media/content-type-sniffer.ts
- packages/daemon/src/agent-executor/event-translation.ts
- packages/server/src/store/projects/sqlite.ts
- packages/cms/src/forms/express/handler.ts
- packages/cms/src/widgets/region-area-service.ts
- packages/devops/src/static-export/node-adapters.ts
- packages/ui/src/features/connectors/dependencies.ts
- packages/ui/src/features/html-editor/source-splice.ts
- packages/admin/src/react/entities/use-entity-edit.ts
- packages/cms/src/content-types/lifecycle.ts
- packages/ui/src/features/file-dropzone/react/hooks/useFileDropzonePreviews.ts
- packages/ui/src/features/media-providers/rules.ts
- packages/ui/src/renderers/annotation-canvas/rules.ts
- packages/admin/src/comments/conformance/comments-api.conformance.ts
- packages/agent-plugins/src/folder-zip.ts
- packages/agent-plugins/src/lifecycle/retire-bundled.ts
- packages/chat/src/core/assistant-client/durable-run-subscription.ts
- packages/chat/src/core/partial-json.ts
- packages/chat/src/core/todos.ts
- packages/cms/src/media/tool-registrations.ts
- packages/plugins/src/glue/manifest.ts
- packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx
- packages/ui/src/features/file-dropzone/react/hooks/useFileDialogTracking.ts
- packages/ui/src/features/mcp-ui/resource.ts
- packages/ui/src/features/memory/react/components/MemoryConnectedPanel.tsx
- packages/ui/src/features/source-config-list/react/hooks/useSourceConfigList.ts
- packages/admin/src/media/react/hooks/UploadButton.hooks.ts
- packages/chat/src/core/assistant-client/ag-ui-transport.ts
- packages/cms/src/comments/ingress.ts
- packages/mcp/src/server/tool-protocol.ts
- packages/oauth/src/pending-authorizations.ts
- packages/platform/src/resource-paths.ts
- packages/agent-plugins/src/lifecycle/bundled-source-archive.ts
- packages/cms/src/comments/sql/repo.ts
- packages/cms/src/widgets/resolvers/index.ts
- packages/mcp/src/server/tool-server.ts
- packages/server/src/host-bootstrap.ts
- packages/ui-kit/src/react/testing/driver.ts
- packages/ui/src/features/asset-grid/react/components/AssetGrid.tsx
- packages/ui/src/features/asset-grid/react/hooks/useRubberBandDrag.ts
- packages/agent-runtime/src/prompt-budget.ts
- packages/artifacts/src/node/stub-guard.ts
- packages/chat/src/core/browser/page-actions.ts
- packages/cms/src/content-types/errors.ts
- packages/cms/src/widgets/resolvers/recent-entries.ts
- packages/core/plugin-directory.js
- packages/daemon/src/session-coordination.ts
- packages/server/src/feature-activation.ts
- packages/ui/src/features/mcp-ui/surfaces/confirmation.ts
- packages/ui/src/features/observability/white-screen.ts
- packages/ui/src/react/components/RemixIcon.stylesheet.ts
- packages/ui/src/renderers/preview-modal-shell/react/components/PreviewModalShell.tsx
- packages/admin/src/comments/react/hooks/use-comment-queue.hooks.ts
- packages/chat/src/react/features/chat-pane/components/AgentRuntimePicker.tsx
- packages/chat/src/react/hooks/useComposerHistoryKeys.hooks.ts
- packages/cms/src/taxonomy/validation-chain.ts
- packages/oauth/src/loopback-callback.ts
- packages/ui-kit/src/react/native/Navigation.hooks.ts
- packages/ui/src/features/connectors/components/ConnectorCard.tsx
- packages/ui/src/features/resource-dashboard/react/hooks/useResourceRowList.ts
- packages/admin/src/media/html-attributes.ts
- packages/admin/src/redirects/conformance/redirects-api.conformance.ts
- packages/admin/src/widgets/adapters/memory.ts
- packages/cms/src/consent/html/resources.ts
- packages/platform/src/fs/verified-file-relocation.ts
- packages/admin/src/react/entities/rules.ts
- packages/admin/src/security/adapters/http.ts
- packages/cms/src/media/import/fetch-image.ts
- packages/cms/src/navigation/tool-registrations.ts
- packages/cms/src/widgets/html/html-embeds.ts
- packages/platform/src/http/guarded/transport.fetch.ts
- packages/ui-kit/src/react/confirm/ConfirmDialog.hooks.ts
- packages/ui-kit/src/react/Kit.hooks.ts
- packages/ui/src/features/integrations/rules.ts
- packages/ui/src/features/mcp-ui/confirmation-store.ts
- packages/ui/src/utils/smooth-scroll-to-top.ts
- packages/chat/src/core/util/recover.ts
- packages/chat/src/react/components/McpUiSurfaceCard.tsx
- packages/cms/src/seo/media.ts
- packages/ui/src/features/asset-tree-browser/react/components/AssetTreeBrowserParts.tsx
- packages/chat/src/embed-widget/react/embed.tsx
- packages/chat/src/react/message-blocks.ts
- packages/cms/src/listing/html.ts
- packages/cms/src/media/repo.memory.ts
- packages/plugins/src/host/claim-conflicts.ts
- packages/server/src/kernel-base.ts
- packages/ui/src/features/admin-widgets/components/InfoTip.hooks.tsx
- packages/ui/src/react/components/remixicon-font-recovery.ts
- packages/ui/src/utils/auto-open-file.ts
- packages/admin/src/widgets/controllers/instance-editor.controller.ts
- packages/agent-plugins/src/lifecycle/trusted-plugin-files.ts
- packages/cms/src/consent/html/render.ts
- packages/mcp/src/tools/ask-choice/question.ts
- packages/ui/src/features/mention-autocomplete/react/hooks/useMentionAutocomplete.ts
- packages/ui/src/features/resource-dashboard/rules.ts
- packages/ui/src/features/version-manager/rules.ts
- packages/agent-runtime/src/claude-segment-usage.ts
- packages/chat/src/store/legacy/sqlite/conversations.ts
- packages/cms/src/widgets/markers/html-attributes.ts
- packages/daemon/src/http/research-tavily.adapter.ts
- packages/platform/src/fs/directory-registry.ts
- packages/platform/src/fs/directory-sync.ts
- packages/ui/src/features/tab-strip/react/components/TabBar.hooks.tsx
- packages/admin/src/forms/adapters/memory.ts
- packages/chat/src/react/components/composer-discovery.ts
- packages/cms/src/core/commands/command.ts
- packages/cms/src/redirects/sql/repo.ts
- packages/daemon/src/agent-executor/mcp-bridge-probe.ts
- packages/oauth/src/token-endpoint.ts
- packages/ui/src/features/sketch-editor/react/hooks/useSketchScene.ts
- packages/admin/src/agent-plugins/controllers/agent-plugins.controller.ts
- packages/admin/src/security/rules.ts
- packages/admin/src/source-control/conformance/source-control-api.conformance.ts
- packages/admin/src/widgets/conformance/widgets-api.conformance.ts
- packages/agent-plugins/src/admin-surfaces/capability-declarations.ts
- packages/chat/src/core/user-text-redaction.ts
- packages/chat/src/core/util/markdown-context.ts
- packages/daemon/src/core/tool-audit.ts
- packages/daemon/src/http/db-ops.ts
- packages/ui-kit/src/react/confirm/guard.ts
- packages/ui/src/react/components/HeaderActionsMenu.tsx
- packages/ui/src/react/components/PaletteTweaks.tsx
- packages/ui/src/renderers/annotation-canvas/react/components/AnnotationCanvas.tsx
- packages/agent-plugins/src/lifecycle/index.ts
- packages/chat/src/react/index.ts
- packages/oauth/src/device-code.ts
- packages/ui/src/react/components/Toast.tsx
- packages/admin/src/media/react/hooks/MediaPage.hooks.ts
- packages/admin/src/security/controllers/access-tokens.controller.ts
- packages/admin/src/seo/adapters/memory.ts
- packages/agent-plugins/src/folder-zip-node.ts
- packages/cms/src/widgets/gallery-resolver.ts
- packages/platform/src/fs.ts
- packages/ui/src/features/notifications/react/components/NotificationsTab.tsx
- packages/ui/src/features/resource-dashboard/dependencies.ts
- packages/admin/src/seo/react/hooks/use-share-image-warning.hooks.ts
- packages/admin/src/widgets/rules.ts
- packages/agent-plugins/src/lifecycle/package-paths.ts
- packages/chat/src/core/util/manifest.ts
- packages/devops/src/source-control/commit.ts
- packages/mcp/src/server/tool-arguments.ts
- packages/ui/src/features/iframe-pool/react/components/IframeKeepAliveProvider.tsx
- packages/ui/src/features/integrations/react/components/IntegrationsTab.tsx
- packages/ui/src/features/mcp-ui/surfaces/document.ts
- packages/ui/src/features/viewer-shell/react/hooks/useCommentReorder.ts
- packages/ui/src/react/components/LanguageMenu.tsx
- packages/admin/src/forms/react/hooks/use-forms-list.hooks.ts
- packages/agent-plugins/src/admin-surfaces/delivery-bindings.ts
- packages/agent-plugins/src/lifecycle/installed-package-index.ts
- packages/agent-runtime/src/agent-protocol/acp/rpc.ts
- packages/cms/src/widgets/entry-payload.ts
- packages/devops/src/packaging/electron/archive.ts
- packages/mcp/src/federation/registrations.ts
- packages/oauth/src/registration.ts
- packages/ui/src/browser/useFileDropTarget.ts
- packages/ui/src/renderers/annotation-canvas/react/hooks/useAnnotationCanvas.controller.ts
- packages/admin/src/browser/navigation.ts
- packages/admin/src/core/transport/http.ts
- packages/admin/src/forms/conformance/forms-api.conformance.ts
- packages/admin/src/media/react/hooks/EditMediaPanel.hooks.ts
- packages/agent-plugins/src/lifecycle/capability-projection.ts
- packages/agent-runtime/src/model-discovery-shared.ts
- packages/cms/src/trash/sweeper.ts
- packages/devops/src/local-dev/index.ts
- packages/agent-plugins/src/lifecycle/tools/manifest.ts
- packages/cms/src/media/rendition-service.ts
- packages/cms/src/seo/page-head.ts
- packages/mcp/src/federation/approvals/remembered-approval.ts
- packages/mcp/src/federation/testing/adapter.memory.ts
- packages/ui/src/features/connectors/hooks/useConnectorDetail.ts
- packages/ui/src/features/execution/react/components/ExecutionTab.tsx
- packages/ui/src/features/i18n/dictionaries/index.ts
- packages/admin/src/agent-plugins/react/hooks/AgentPluginInspector.hooks.ts
- packages/admin/src/comments/controllers/comment-settings.controller.ts
- packages/artifacts/src/stub-guard.ts
- packages/mcp/src/federation/mcp-protocol.ts
- packages/ui/src/features/source-config-list/dependencies.ts
- packages/ui/src/theme/apply.ts
- packages/ui/src/utils/dom-subscriptions.ts
- packages/admin/src/forms/react/hooks/forms-view.hooks.ts
- packages/admin/src/media/conformance/media-api.conformance.ts
- packages/admin/src/security/react/hooks/AccessTokensTab.hooks.ts
- packages/agent-runtime/src/anthropic-live-models.ts
- packages/agent-runtime/src/copilot-stream.ts
- packages/agent-runtime/src/index.ts
- packages/chat/src/core/persistence/title.ts
- packages/cms/src/forms/submission-attempts.ts
- packages/cms/src/trash/repo.memory.ts
- packages/cms/src/widgets/errors.ts
- packages/cms/src/widgets/html/gallery-render.ts
- packages/daemon/src/tool-recovery/redaction.ts
- packages/ui/src/features/charts/react.tsx
- packages/ui/src/features/lexical-rich-text-editor/mention-node.ts
- packages/ui/src/react/hooks/useEdgeAutoScroll.ts
- packages/admin/src/react/shell/use-admin-shell-session.ts
- packages/admin/src/redirects/adapters/memory.ts
- packages/admin/src/widgets/controllers/region-editor.controller.ts
- packages/agent-plugins/src/admin-surfaces/host-validator.ts
- packages/agent-plugins/src/lifecycle/contribution-loader.ts
- packages/chat/src/react/features/chat-pane/model-options.ts
- packages/chat/src/react/hooks/useQuestionForms.ts
- packages/cms/src/comments/write-service.ts
- packages/ui/src/features/admin-widgets/components/SuggestInput/SuggestInput.hooks.ts
- packages/ui/src/features/source-config-list/react/components/SourceConfigField.tsx
- packages/ui/src/utils/polygon-selection.ts
- packages/ui/vitest.setup.ts
- packages/admin/src/core/manifest/rules.ts
- packages/admin/src/forms/react/hooks/use-form-submission-detail.hooks.ts
- packages/admin/src/security/adapters/memory.ts
- packages/charts-recharts/src/mount.tsx
- packages/chat/src/core/durable-runs/continuation.ts
- packages/chat/src/embed-widget/browser/session-store.ts
- packages/cms/src/comments/repo.memory.ts
- packages/cms/src/content-types/field-defs.ts
- packages/cms/src/media/blob-store.fs.ts
- packages/daemon/src/event-log.ts
- packages/ui/src/features/a2ui/renderer.tsx
- packages/ui/src/features/about/rules.ts
- packages/ui/src/features/html-editor/editor-serialization.ts
- packages/ui/src/react/components/BrandLogo.tsx
- packages/agent-plugins/src/lifecycle/search.ts
- packages/chat/src/react/hooks/useChatFabDrag.ts
- packages/chat/src/react/tool-call-display.ts
- packages/cms/src/content-types/index-provisioning.ts
- packages/cms/src/forms/sql/repo.ts
- packages/cms/src/media/sanitize-svg.ts
- packages/ui/src/core.ts
- packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFileRow.tsx
- packages/ui/src/features/connectors/hooks/useConnectorCatalog.ts
- packages/ui/src/features/lexical-rich-text-editor/react/hooks/useKeyboardCommands.ts
- packages/ui/src/features/mention-autocomplete/rules.ts
- packages/ui/src/features/schedule-picker/rules.ts
- packages/agent-runtime/src/role-marker-guard.ts
- packages/agent-runtime/src/skills/web-clone/scripts/init-clone.mjs
- packages/chat/src/core/composer-history.ts
- packages/cms/src/content-types/tool-registrations.ts
- packages/cms/src/media/html-attributes.ts
- packages/cms/src/navigation/repo.memory.ts
- packages/cms/src/redirects/repo.memory.ts
- packages/daemon/src/agent-executor/run-output.ts
- packages/daemon/src/routines/routine-store.ts
- packages/platform/src/secrets/credential-sets/vault.meta.ts
- packages/ui/src/features/about/react/components/AboutTab.tsx
- packages/ui/src/features/execution/react/hooks/useLocalCliAgentCard.ts
- packages/ui/src/features/integrations/react/hooks/useCodexInstallToggle.ts
- packages/ui/src/features/observability/stuck-run.ts
- packages/ui/src/features/panel-kit/hooks/use-focus-trap.hooks.ts
- packages/ui/src/features/tab-strip/rules.ts
- packages/ui/src/react/hooks/useBrandFonts.ts
- packages/ui/src/utils/design-md.ts
- packages/chat/src/store/sql/cursor.ts
- packages/cms/src/consent/policy.ts
- packages/cms/src/media/document-read.ts
- packages/cms/src/widgets/html/legacy-widget-markers.ts
- packages/oauth/src/oidc.ts
- packages/oauth/src/registry.ts
- packages/plugins/src/host/activation.ts
- packages/ui/src/features/browser-chrome/react/hooks/useBrowserNavigationStack.ts
- packages/ui/src/features/iframe-pool/react/components/PooledIframe.tsx
- packages/ui/src/features/lexical-rich-text-editor/react/hooks/useMentionAtomicNavigation.ts
- packages/ui/src/features/observability/boot-timing.ts
- packages/ui/src/features/sketch-editor/react/hooks/useSketchDomEnhancements.ts
- packages/admin/src/security/controllers/root-key.controller.ts
- packages/admin/src/widgets/react/hooks/WidgetsQuery.hooks.ts
- packages/chat/src/react/hooks/useCopyToClipboard.ts
- packages/devops/src/packaging/electron/imports.ts
- packages/devops/src/packaging/electron/policies.ts
- packages/ui/src/features/source-config-list/react/hooks/useSourceConfigAddForm.ts
- packages/admin/src/comments/adapters/memory.ts
- packages/admin/src/core/routing/rules.ts
- packages/admin/src/react/components/InteractiveHtmlEditor/InteractiveHtmlEditor.tsx
- packages/admin/src/react/entities/contribution.tsx
- packages/admin/src/react/shell/use-admin-theme.ts
- packages/agent-runtime/src/agent-protocol/acp/json.ts
- packages/chat/src/react/features/chat-pane/create-mcp-ui-tool-caller.ts
- packages/daemon/src/core/read-only-tools.ts
- packages/mcp/src/server/tools/run-tools.ts
- packages/platform/src/fs/directory-running-lock.ts
- packages/plugins/src/host/uninstall.ts
- packages/plugins/src/host/worker/run-call.ts
- packages/ui-kit/src/react/native/Dialog.hooks.ts
- packages/ui/src/features/connectors/ConnectorsBrowser.tsx
- packages/ui/src/features/media-providers/react/components/MediaProvidersTab.tsx
- packages/admin/src/source-control/controllers/source-control.controller.ts
- packages/admin/src/widgets/controllers/library.controller.ts
- packages/chat/src/core/tool-events.ts
- packages/chat/src/core/util/pointer.ts
- packages/chat/src/embed-widget/react/dialog.hooks.ts
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneFileDrop.hooks.ts
- packages/cms/scripts/check-packaging.mjs
- packages/mcp/src/federation/refusal-notice.ts
- packages/oauth/src/endpoint-safety.ts
- packages/platform/src/aws-sigv4.ts
- packages/platform/src/mail/smtp.ts
- packages/ui-kit/src/react/native/Controls.hooks.ts
- packages/ui-kit/src/react/native/Controls.tsx
- packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeBatchActions.ts
- packages/ui/src/features/command-palette/react/hooks/useCommandPalette.ts
- packages/ui/src/features/iframe-pool/react/hooks/useIframeKeepAlivePool.ts
- packages/ui/src/react/components/EditorIcon.tsx
- packages/admin/src/react/shell/AdminShell.tsx
- packages/admin/src/seo/react/hooks/SeoQuery.hooks.ts
- packages/agent-runtime/src/env.ts
- packages/agent-runtime/src/terminal-launch.ts
- packages/chat/src/core/assistant-client/a2ui-action-poster.ts
- packages/daemon/src/http/active-context.ts
- packages/platform/src/child-environment.ts
- packages/platform/src/fs/user-data-directories.ts
- packages/platform/src/secrets/secret-sealer.aesgcm.ts
- packages/server/src/lifecycle/boot-lifecycle.ts
- packages/ui/src/features/admin-widgets/components/InfoTip.rules.ts
- packages/ui/src/features/asset-tree-browser/react/components/useAssetTreeBrowserController.ts
- packages/ui/src/features/observability/long-task.ts
- packages/ui/src/features/tab-launcher-menu/rules.ts
- packages/admin/src/agent-plugins/react/hooks/AgentPluginPanel.hooks.ts
- packages/admin/src/seo/conformance/seo-api.conformance.ts
- packages/admin/src/seo/react/components/SitemapModal.tsx
- packages/agent-runtime/src/providers/pkce.ts
- packages/artifacts/src/store.ts
- packages/chat/src/react/components/MessageList.hooks.ts
- packages/chat/src/react/hooks/context.ts
- packages/chat/src/react/hooks/last-conversation-store.ts
- packages/cms/src/navigation/resolver.ts
- packages/cms/src/redirects/target-gate.ts
- packages/oauth/src/file-registration-cache.ts
- packages/ui/src/features/asset-grid/dependencies.ts
- packages/ui/src/features/command-palette/rules.ts
- packages/ui/src/features/i18n/context.tsx
- packages/ui/src/features/memory/react/components/MemoryList.tsx
- packages/admin/src/agent-plugins/react/hooks/AgentPluginsPage.hooks.ts
- packages/admin/src/media/controllers/providers.controller.ts
- packages/admin/src/media/react/index.ts
- packages/agent-runtime/src/defs/shared.ts
- packages/chat/src/react/components/ChatSettingsDialog.tsx
- packages/cms/src/comments/express/submit-handler.ts
- packages/cms/src/entries/errors.ts
- packages/cms/src/entries/tool-registrations.ts
- packages/daemon/src/agent-executor/antigravity-permissions.ts
- packages/oauth/src/index.ts
- packages/oauth/src/sealed-state.ts
- packages/plugins/src/host/browser-providers.ts
- packages/ui/src/features/asset-grid/react/hooks/useAssetGridData.ts
- packages/ui/src/features/file-dropzone/rules.ts
- packages/ui/src/features/folder-path-drop/rules.ts
- packages/ui/src/features/source-config-list/react/components/SourceConfigAddForm.tsx
- packages/ui/src/features/version-manager/react/components/VersionManagerModal.tsx
- packages/admin/src/react/entities/EntityField.tsx
- packages/admin/src/react/hooks/use-nav-sections.ts
- packages/agent-plugins/src/admin-surfaces/action-dispatcher.ts
- packages/agent-runtime/src/amr-model-cache.ts
- packages/agent-runtime/src/model-registry.ts
- packages/chat/src/core/question-answer.ts
- packages/chat/src/react/hooks/useExtEventGroups.ts
- packages/cms/src/entries/repo.memory.ts
- packages/cms/src/widgets/read-service.ts
- packages/daemon/src/close-status.ts
- packages/devops/src/agent-jobs/node.ts
- packages/mcp/src/federation/stdio/default-connect.ts
- packages/oauth/src/registration-cache.ts
- packages/ui-kit/src/react/facade.ts
- packages/ui/src/features/charts/table.ts
- packages/ui/src/features/i18n/locale.ts
- packages/ui/src/features/mcp-ui/surfaces/form.ts
- packages/ui/src/features/sketch-editor/react/components/SketchEditor.tsx
- packages/admin/src/redirects/react/hooks/use-redirects.hooks.ts
- packages/admin/src/seo/controllers/seo-entry.controller.ts
- packages/agent-plugins/src/lifecycle/installed-package-roots.ts
- packages/agent-runtime/src/defs/antigravity.ts
- packages/agent-runtime/src/defs/claude.ts
- packages/agent-runtime/src/model-catalog-cache.ts
- packages/agent-runtime/src/providers/oauth-provider.ts
- packages/chat/src/react/components/ConversationTitleEditor.tsx
- packages/chat/src/react/ext-event-renderer-registry.ts
- packages/daemon/src/http/component-catalog.ts
- packages/daemon/src/http/tool-catalog.ts
- packages/mcp/src/federation/reload.ts
- packages/oauth/src/errors.ts
- packages/plugins/src/host/capability-sdk.ts
- packages/plugins/src/host/node/module-snapshot.ts
- packages/server/src/storage/legacy/sqlite.ts
- packages/ui/src/features/lexical-rich-text-editor/react/hooks/useCaretFloatingLayerPosition.ts
- packages/ui/src/features/skills/react/components/SkillRow.tsx
- packages/admin/src/agent-plugins/rules.ts
- packages/admin/src/media/controllers/edit-media.controller.ts
- packages/admin/src/react/entities/EntityList.tsx
- packages/admin/src/security/controllers/other-credentials.controller.ts
- packages/admin/src/seo/controllers/seo.controller.ts
- packages/admin/src/seo/react/hooks/use-seo-entry-panel.hooks.ts
- packages/admin/src/seo/react/hooks/use-seo.hooks.ts
- packages/agent-runtime/src/defs/index.ts
- packages/chat/src/react/features/chat-pane/components/AgentPluginUsage.tsx
- packages/daemon/src/http/health.ts
- packages/plugins/src/glue/attachment-points/tool-registration.ts
- packages/ui/src/features/admin-widgets/components/Select/Select.tsx
- packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeRename.ts
- packages/ui/src/features/mcp-ui/surfaces/text-input.ts
- packages/ui/src/features/progress-card/rules.ts
- packages/ui/src/features/skills/dependencies.ts
- packages/ui/src/features/source-config-list/react/components/SourceConfigListView.tsx
- packages/admin/src/comments/react/components/QueueSection.tsx
- packages/admin/src/react/components/DataTable.tsx
- packages/admin/src/react/hooks/use-sidebar-rail.ts
- packages/admin/src/seo/react/hooks/MediaRefField.hooks.ts
- packages/admin/src/widgets/react/hooks/use-widget-instance-editor.hooks.ts
- packages/agent-plugins/src/admin-surfaces/external-links.ts
- packages/agent-runtime/src/defs/cursor-agent.ts
- packages/chat/src/core/question-form/secret-answers.ts
- packages/chat/src/react/components/MessageRow.usage.ts
- packages/cms/src/content-types/cleanup.ts
- packages/cms/src/listing/batch.ts
- packages/cms/src/seo/dom/index.ts
- packages/daemon/src/http/frontend-control.ts
- packages/mcp/src/federation/approvals/revocation.ts
- packages/mcp/src/server/tools/delegated-tool.ts
- packages/oauth/src/guarded-transport.ts
- packages/ui/src/core/theme/validation.ts
- packages/ui/src/features/execution/http-adapter.ts
- packages/ui/src/features/observability/resource-error.ts
- packages/ui/src/features/resource-dashboard/react/components/resourceBoardProps.ts
- packages/ui/src/react/hooks/useCoalescedCallback.ts
- packages/ui/src/renderers/shiki.ts
- packages/admin/src/agent-plugins/conformance/agent-plugins-api.conformance.ts
- packages/admin/src/forms/controllers/field-attributes-dialog.controller.ts
- packages/admin/src/react/components/ConfirmButton/ConfirmButton.hooks.tsx
- packages/admin/src/react/entities/EntityEdit.tsx
- packages/chat/src/store/runtime/chat-expiry-sweep.ts
- packages/cms/src/workspace/create.ts
- packages/daemon/src/http/index.ts
- packages/devops/src/packaging/electron/node.ts
- packages/oauth/src/dns-pinned-transport.ts
- packages/platform/src/fs/boot-identity.ts
- packages/ui-kit/src/react/kit.ts
- packages/ui/src/features/file-dropzone/react/components/FileDropzone.tsx
- packages/ui/src/features/observability/iframe.ts
- packages/ui/src/features/observability/visibility.ts
- packages/ui/src/features/skills/react/components/SkillsTab.tsx
- packages/ui/src/features/viewer-shell/react/components/MarkdownSplitPane.tsx
- packages/admin/src/media/react/hooks/MediaLightbox.hooks.ts
- packages/admin/src/widgets/controllers/regions.controller.ts
- packages/admin/src/widgets/react/hooks/use-widgets-library.hooks.ts
- packages/agent-plugins/src/lifecycle/yauzl-archive-reader.ts
- packages/agent-runtime/src/model-discovery-sdk.ts
- packages/agent-runtime/src/native-runtime.ts
- packages/artifacts/src/publication-guard.ts
- packages/chat/src/core/index.ts
- packages/chat/src/core/question-form/format.ts
- packages/chat/src/react/hooks/useLatestOperation.ts
- packages/cms/src/forms/html/authoring-adapter.ts
- packages/cms/src/media/replace-media-file.ts
- packages/cms/src/media/transform-registry.ts
- packages/cms/src/widgets/resolvers/menu.ts
- packages/daemon/src/http/run-credentials.ts
- packages/mcp/src/federation/approvals/call-confirmation.ts
- packages/ui/src/features/integrations/react/components/SnippetBlock.tsx
- packages/ui/src/features/lexical-rich-text-editor/react/hooks/useTriggerDetection.ts
- packages/ui/src/features/media-providers/react/components/MediaProviderCard.tsx
- packages/ui/src/features/sketch-editor/react/dependencies-fake.tsx
- packages/ui/src/utils/color-math.ts
- packages/ui/src/utils/copy-to-clipboard.ts
- packages/admin/src/agent-plugins/controllers/agent-plugin-files.controller.ts
- packages/admin/src/media/react/hooks/MediaQuery.hooks.ts
- packages/admin/src/widgets/react/hooks/use-widget-regions.hooks.ts
- packages/agent-runtime/src/defs/grok-build.ts
- packages/charts-recharts/src/chart.tsx
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneComposerPlaceholder.hooks.ts
- packages/chat/src/store/runtime/chat-history-store.ts
- packages/cms/src/comments/module.ts
- packages/cms/src/media/image-transformer.sharp.ts
- packages/cms/src/widgets/resolvers/gallery.ts
- packages/daemon/src/tool-recovery/federated-refusal.ts
- packages/platform/src/index.ts
- packages/platform/src/secrets/credential-token.ts
- packages/platform/src/secrets/index.ts
- packages/plugins/src/host/node/browser-provider-assets.ts
- packages/server/src/storage/backend-config.ts
- packages/ui/src/features/file-dropzone/react/components/FileDropzoneThumbnailGrid.tsx
- packages/ui/src/features/lexical-rich-text-editor/react/hooks/useMentionColorStamping.ts
- packages/ui/src/features/mcp-ui/surfaces/fields.ts
- packages/ui/src/features/memory/react/hooks/useMemoryConnectors.rules.ts
- packages/ui/src/features/project-locations/react/components/ProjectLocationsTab.tsx
- packages/admin/src/media/react/components/MediaIcons.tsx
- packages/admin/src/media/react/hooks/MediaCard.hooks.ts
- packages/admin/src/react/components/ConfirmDialog/use-confirm-request.ts
- packages/admin/src/react/overlays.ts
- packages/admin/src/seo/adapters/http.ts
- packages/agent-plugins/src/admin-surfaces/sandbox.ts
- packages/chat/src/core/tool-call-detail.ts
- packages/oauth/src/bounded-json.ts
- packages/platform/src/secrets/credential-sets/provider-matches.ts
- packages/ui/src/features/admin-widgets/components/ImagePreviewModal.hooks.tsx
- packages/ui/src/features/interactive-ui/providers/shadcn/data-table.tsx
- packages/ui/src/features/panel-kit/helpers/standing-draft-local-backup.ts
- packages/ui/src/features/schedule-picker/react/hooks/useRecurringSchedulePicker.ts
- packages/ui/src/react/mcp-ui/useHostSurfaceTokens.ts
- packages/ui/src/renderers/sandboxed-document.ts
- packages/admin/src/comments/react/hooks/use-comment-settings.hooks.ts
- packages/admin/src/forms/react/hooks/use-form-fields-editor.hooks.ts
- packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/data-table.tsx
- packages/chat/src/core/agent-plugin-chat-state.ts
- packages/chat/src/core/assistant-client/attachment-liveness.ts
- packages/chat/src/react/features/chat-pane/components/RuntimeDropUp.tsx
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneNewTabLinks.hooks.ts
- packages/chat/src/react/hooks/useRunActivity.ts
- packages/cms/src/media/index.ts
- packages/cms/src/redirects/resolver.ts
- packages/daemon/src/http/resource-request.ts
- packages/ui/src/features/admin-widgets/components/InfoTip.tsx
- packages/ui/src/features/admin-widgets/components/SeeMore/SeeMore.hooks.tsx
- packages/ui/src/features/browser-chrome/react/hooks/useBrowserHistory.ts
- packages/ui/src/features/file-dropzone/react/components/FileDropzoneLightbox.tsx
- packages/ui/src/features/interactive-ui/manifests.ts
- packages/ui/src/features/lexical-rich-text-editor/deserialize.ts
- packages/ui/src/renderers/url-load-decision.ts
- packages/admin/src/comments/adapters/http.ts
- packages/admin/src/comments/react/hooks/QueueSection.hooks.ts
- packages/admin/src/redirects/rules.ts
- packages/admin/src/seo/react/hooks/SeoPage.hooks.ts
- packages/admin/src/widgets/react/hooks/page-views.hooks.ts
- packages/agent-plugins/src/admin-surfaces/action-tools.ts
- packages/agent-runtime/src/agent-protocol/acp/session-params.ts
- packages/agent-runtime/src/providers/oauth-credentials.ts
- packages/chat/src/react/components/AttachmentPreviewModal.tsx
- packages/chat/src/react/hooks/testing/fake-transport.ts
- packages/chat/src/react/hooks/useAnsweredCards.ts
- packages/cms/src/presentation/presentation.ts
- packages/cms/src/widgets/concurrency.ts
- packages/cms/src/widgets/resolvers/contact-form.ts
- packages/platform/src/command.ts
- packages/platform/src/mail/purpose-scoped-mailer.ts
- packages/plugins/src/host/worker/import-seam.ts
- packages/ui-kit/src/toast.ts
- packages/ui/src/features/appearance/react/components/AppearanceTab.tsx
- packages/ui/src/features/asset-tree-browser/index.ts
- packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeSelection.ts
- packages/ui/src/features/execution/react/components/LocalCliAgentList.tsx
- packages/ui/src/features/external-mcp/react/components/ExternalMcpTab.tsx
- packages/ui/src/features/i18n/template-i18n.ts
- packages/ui/src/features/integrations/react/hooks/useMcpInstallInfo.ts
- packages/ui/src/features/interactive-ui/providers/shadcn/select.tsx
- packages/ui/src/features/memory/index.ts
- packages/ui/src/features/tab-launcher-menu/react/components/TabLauncherMenu.tsx
- packages/ui/src/renderers/react/components/ArtifactView.tsx
- packages/admin/src/forms/adapters/http.ts
- packages/admin/src/media/adapters/http.ts
- packages/agent-plugins/src/lifecycle/set-enabled.ts
- packages/agent-runtime/src/diagnostics.ts
- packages/chat/src/react/components/SentAttachment.hooks.ts
- packages/chat/src/react/features/chat-pane/create-mid-run-message-poster.ts
- packages/chat/src/react/hooks/useToolTimeline.ts
- packages/cms/src/media/transform-types.ts
- packages/cms/src/workspace/repo.memory.ts
- packages/daemon/src/attachment-content.ts
- packages/daemon/src/store/agent-sessions/sqlite.ts
- packages/devops/src/checks/node.ts
- packages/devops/src/deploy/node.ts
- packages/mcp/src/server/resource-protocol.ts
- packages/oauth/src/node-file-cache.ts
- packages/ui/src/features/asset-grid/react/components/AssetCard.tsx
- packages/ui/src/features/html-editor/canvas-content-wrapper.ts
- packages/ui/src/features/html-viewer/rules.ts
- packages/ui/src/features/mcp-ui/surfaces/outcome.ts
- packages/ui/src/features/panel-kit/hooks/use-serial-writes.hooks.ts
- packages/ui/src/features/project-locations/rules.ts
- packages/ui/src/features/source-config-list/agent-handles.ts
- packages/ui/src/react/hooks/useInView.ts
- packages/ui/src/renderers/sandbox-bridge.ts
- packages/admin/src/core/ledger-slice.ts
- packages/admin/src/seo/react/components/MediaRefField.tsx
- packages/admin/src/widgets/adapters/http.ts
- packages/agent-runtime/src/providers/google.ts
- packages/agent-runtime/src/providers/index.ts
- packages/chat/src/core/assistant-content.ts
- packages/chat/src/react/components/TodoCard.tsx
- packages/chat/src/react/hooks/composer-history-storage.ts
- packages/chat/src/react/hooks/useArtifactStream.ts
- packages/cms/src/listing/paths.ts
- packages/cms/src/seo/absolute-url.ts
- packages/cms/src/widgets/html/resolve-html-page-embeds.ts
- packages/cms/src/widgets/html/server-fragment.ts
- packages/cms/src/widgets/sql/repo.ts
- packages/cms/src/workspace/tool-registrations.ts
- packages/daemon/src/http/route-manifest.ts
- packages/daemon/src/tool-result-surfaces.ts
- packages/platform/src/secrets/credential-sets/vault.types.ts
- packages/plugins/src/host/declarative-enable.ts
- packages/plugins/src/host/index.ts
- packages/plugins/src/host/tool-contributions.ts
- packages/ui/src/features/asset-grid/react/hooks/useAssetGridKeyboardShortcuts.ts
- packages/ui/src/features/asset-tree-browser/dependencies.ts
- packages/ui/src/features/browser-chrome/react/components/BrowserViewportControls.tsx
- packages/ui/src/features/execution/dependencies.ts
- packages/ui/src/features/interactive-ui/table-data.ts
- packages/ui/src/features/panel-kit/helpers/retry-unreachable.ts
- packages/ui/src/features/progress-card/components/ProgressCard.tsx
- packages/ui/src/features/tab-strip/react/components/TabStripItem.tsx
- packages/ui/src/features/tabbed-dialog/react/hooks/useTabbedDialog.ts
- packages/ui/src/features/version-manager/react/hooks/usePreviewCanvasSize.ts
- packages/ui/src/features/viewer-shell/index.ts
- packages/ui/src/features/viewer-shell/react/hooks/useCopyToClipboard.ts
- packages/ui/src/renderers/html-utils.ts
- packages/ui/src/utils/sse.ts
- packages/admin/src/forms/react/hooks/use-field-attributes-dialog.hooks.ts
- packages/admin/src/forms/react/index.ts
- packages/admin/src/redirects/react/hooks/use-import-redirects-form.hooks.ts
- packages/admin/src/source-control/react/hooks/ProvidersTab.hooks.ts
- packages/agent-runtime/src/skills/web-clone/scripts/lib/playwright-loader.mjs
- packages/chat/src/react/components/AttachmentTray.tsx
- packages/chat/src/react/components/ComposerDiscovery.tsx
- packages/chat/src/react/components/mcp-ui-surface-state.ts
- packages/chat/src/react/features/chat-pane/create-typed-answer-poster.ts
- packages/chat/src/react/hooks/usePinnedTodos.ts
- packages/cms/src/forms/delivery/subscriptions.ts
- packages/cms/src/forms/notify-subscriber.ts
- packages/cms/src/forms/submission-email-validation.ts
- packages/cms/src/trash/adapters/record-store.ts
- packages/daemon/src/tool-result-media.ts
- packages/mcp/src/federation/testing/tool-approvals.memory.ts
- packages/oauth/src/pkce.ts
- packages/platform/src/http/guarded/fetch-adapter.ts
- packages/ui/src/browser/useModalWindowDragGuard.ts
- packages/ui/src/features/a2ui/use-a2ui-surface.ts
- packages/ui/src/features/admin-widgets/components/SuggestInput/SuggestInput.tsx
- packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreePreview.ts
- packages/ui/src/features/connectors/components/ConnectorSearchBar.tsx
- packages/ui/src/features/execution/react/components/LocalCliAgentCard.tsx
- packages/ui/src/features/integrations/react/components/CodexInstallToggleButton.tsx
- packages/ui/src/features/interactive-ui/providers/shadcn/table.tsx
- packages/ui/src/features/privacy/rules.ts
- packages/ui/src/features/project-locations/dependencies.ts
- packages/ui/src/renderers/new-tab-preview.ts
- packages/admin/src/comments/react/index.ts
- packages/admin/src/react/components/ConfirmDialog/ConfirmDialog.hooks.tsx
- packages/admin/src/react/entities/use-entity-read.ts
- packages/admin/src/react/shell/AdminShell.hooks.ts
- packages/admin/src/redirects/react/hooks/wired.hooks.ts
- packages/admin/src/security/conformance/security-api.conformance.ts
- packages/admin/src/seo/react/index.ts
- packages/agent-plugins/src/admin-surfaces/settings-value.ts
- packages/agent-plugins/src/manifest.ts
- packages/charts-recharts/scripts/build-artifact.mjs
- packages/chat/src/embed-widget/react/header.hooks.ts
- packages/cms/src/comments/hooks.ts
- packages/cms/src/comments/spam.heuristic.ts
- packages/cms/src/consent/html/static.ts
- packages/cms/src/forms/delivery/planner.ts
- packages/cms/src/forms/index.ts
- packages/cms/src/seo/feed.ts
- packages/cms/src/widgets/index.ts
- packages/daemon/src/http/model-proxy-fields.ts
- packages/daemon/src/store/agent-sessions/sql.ts
- packages/oauth/src/discovery-policy.ts
- packages/ui-kit/src/confirm.ts
- packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeNavigation.ts
- packages/ui/src/features/browser-chrome/dependencies.ts
- packages/ui/src/features/command-palette/dependencies.ts
- packages/ui/src/features/connectors/components/ConnectorLogo.tsx
- packages/ui/src/features/html-viewer/dependencies.ts
- packages/ui/src/features/html-viewer/react/hooks/usePresentMode.ts
- packages/ui/src/features/lexical-rich-text-editor/serialize.ts
- packages/ui/src/features/mcp-ui/early-message-buffer.ts
- packages/ui/src/features/privacy/react/components/PrivacyTab.tsx
- packages/ui/src/features/version-manager/dependencies.ts
- packages/ui/src/renderers/preview-modal-shell/rules.ts
- packages/admin/src/forms/react/components/FieldSettingsRows.tsx
- packages/admin/src/react/components/RowMenu/RowMenu.tsx
- packages/admin/src/redirects/react/index.ts
- packages/admin/src/security/react/hooks/RootKeyTab.hooks.ts
- packages/admin/src/seo/react/hooks/MediaPickerBridge.hooks.ts
- packages/admin/src/widgets/react/hooks/use-widget-region-editor.hooks.ts
- packages/agent-plugins/src/admin-surfaces/callback-field-inbox.ts
- packages/agent-plugins/src/lifecycle/layout.ts
- packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/form-pattern.tsx
- packages/agent-runtime/src/agent-protocol/pi-rpc/models.ts
- packages/agent-runtime/src/pi-models.ts
- packages/agent-runtime/src/probe-scheduler.ts
- packages/chat/src/react/components/JiniChatProvider.tsx
- packages/cms/src/forms/delivery/errors.ts
- packages/cms/src/media/blob-store.memory.ts
- packages/cms/src/redirects/express/index.ts
- packages/cms/src/taxonomy/content-lookup.ts
- packages/cms/src/trash/follow-ups.ts
- packages/cms/src/widgets/resolvers/taxonomy.ts
- packages/daemon/src/continuation/run-scoped-context-store.ts
- packages/oauth/src/revocation.ts
- packages/ui/scripts/generate-agent-icon-data-uris.mjs
- packages/ui/src/features/command-palette/react/components/CommandPalette.tsx
- packages/ui/src/features/execution/react/components/LocalCliAgentSettings.tsx
- packages/ui/src/features/execution/react/components/SearchableModelSelect.tsx
- packages/ui/src/features/integrations/react/components/ClientPicker.tsx
- packages/ui/src/features/lexical-rich-text-editor/react/hooks/useSyncedOnChange.ts
- packages/ui/src/features/mcp-ui/surfaces/host-theme.ts
- packages/ui/src/features/memory/rules.ts
- packages/ui/src/features/observability/install.ts
- packages/ui/src/features/resource-dashboard/react/components/ResourceBoardViewParts.tsx
- packages/ui/src/features/skills/react/components/SkillDraftForm.labels.ts
- packages/ui/src/features/viewer-shell/react/components/ViewportSwitcher.tsx
- packages/ui/src/utils/timezone.ts
- packages/admin/src/comments/react/hooks/use-comments.hooks.ts
- packages/admin/src/forms/react/components/FormSubmissions.tsx
- packages/admin/src/redirects/controllers/redirects.controller.ts
- packages/admin/src/seo/react/hooks/use-entry-picker.hooks.ts
- packages/admin/src/seo/react/hooks/use-sitemap-modal.hooks.ts
- packages/admin/src/widgets/react/index.ts
- packages/admin/src/widgets/react/pages/WidgetInstanceEditor.tsx
- packages/admin/src/widgets/react/pages/WidgetRegionEditor.tsx
- packages/admin/src/widgets/react/pages/WidgetsLibrary.tsx
- packages/agent-runtime/src/defs/claude-compatible-args.ts
- packages/agent-runtime/src/defs/pi.ts
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneControlsHeight.hooks.ts
- packages/cms/src/core/entity-liveness.ts
- packages/cms/src/forms/duplicate-slug.ts
- packages/cms/src/redirects/capture.ts
- packages/cms/src/taxonomy/merge-term.ts
- packages/daemon/src/index.ts
- packages/db/src/testing/transfer-pg-test-db.ts
- packages/devops/src/source-control/repository-target.ts
- packages/mcp/src/tools/ask-choice/pending.ts
- packages/platform/src/http.ts
- packages/platform/src/shell.ts
- packages/plugins/src/host/worker/protocol.ts
- packages/ui-kit/scripts/headless-smoke.mjs
- packages/ui/src/browser/useGlobalKeydown.ts
- packages/ui/src/features/asset-grid/react/components/DeleteConfirmDialog.tsx
- packages/ui/src/features/asset-grid/react/hooks/useAssetGridSelection.ts
- packages/ui/src/features/connectors/index.ts
- packages/ui/src/features/lexical-rich-text-editor/react/hooks/usePasteFiles.ts
- packages/ui/src/features/mcp-ui/surfaces/tokens.ts
- packages/ui/src/features/panel-kit/hooks/use-dirty-guard.hooks.ts
- packages/ui/src/features/panel-kit/index.ts
- packages/ui/src/features/resource-dashboard/index.ts
- packages/ui/src/features/tabbed-dialog/react/components/TabbedDialog.tsx
- packages/ui/src/react/components/AgentIcon.tsx
- packages/ui/src/renderers/react/components/SrcDocSandbox.tsx
- packages/ui/src/utils/file-system-errors.ts
- packages/admin/src/core/module/controller-store.ts
- packages/admin/src/seo/controllers/sitemap.controller.ts
- packages/admin/src/seo/react/hooks/SeoPorts.hooks.ts
- packages/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/auth-layout.tsx
- packages/charts-recharts/src/bar-chart.tsx
- packages/chat/src/react/tool-renderer-registry.ts
- packages/chat/src/store/sql/boundary.ts
- packages/chat/src/store/sqlite/index.ts
- packages/cms/src/navigation/menu-html.ts
- packages/cms/src/navigation/node/index.ts
- packages/cms/src/workspace/update.ts
- packages/platform/src/fetch-with-timeout.ts
- packages/platform/src/net/address.ts
- packages/ui-kit/src/needs.ts
- packages/ui/src/features/about/react/hooks/useSilentUpdatesToggle.ts
- packages/ui/src/features/admin-widgets/index.ts
- packages/ui/src/features/asset-grid/index.ts
- packages/ui/src/features/charts/registry.ts
- packages/ui/src/features/execution/react/components/AgentDiagnosticRow.tsx
- packages/ui/src/features/html-editor/canvas-style.ts
- packages/ui/src/features/interactive-ui/providers/shadcn/card.tsx
- packages/ui/src/features/sketch-editor/react/hooks/useSketchTheme.ts
- packages/ui/src/features/tab-strip/react/components/TabBar.tsx
- packages/ui/src/features/tabbed-dialog/react/components/tabbedDialogView.ts
- packages/ui/src/features/version-manager/react/components/VersionPromptPopover.tsx
- packages/ui/src/renderers/index.ts
- packages/ui/src/renderers/react/i18n.tsx
- packages/admin/src/core/react/bind-react.ts
- packages/admin/src/forms/react/components/FormSubmissionDetail.tsx
- packages/admin/src/forms/react/pages/FormEditor.tsx
- packages/admin/src/media/react/hooks/GallerySelection.hooks.ts
- packages/admin/src/media/react/hooks/MediaPicker.hooks.ts
- packages/admin/src/react/entities/EntityDetail.tsx
- packages/admin/src/source-control/adapters/memory.ts
- packages/agent-plugins/src/admin-surfaces/theme.ts
- packages/agent-runtime/src/invocation.ts
- packages/agent-runtime/src/paths.ts
- packages/agent-runtime/src/providers/token-params.ts
- packages/chat/src/react/components/MidRunUserMessage.tsx
- packages/cms/src/content-types/repo.memory.ts
- packages/cms/src/forms/delivery/deliver-job.ts
- packages/cms/src/forms/sql/repo.rows.ts
- packages/daemon/src/agent-executor/model-receipts.ts
- packages/daemon/src/image-prompt-delivery.ts
- packages/daemon/src/run/core/result.ts
- packages/db/src/testing/postgres-database.ts
- packages/mcp/src/server/sdk-transport.ts
- packages/oauth/src/options.ts
- packages/platform/src/fs/env-text.ts
- packages/plugins/src/host/sql/repo.ts
- packages/ui-kit/src/react/context.ts
- packages/ui/src/features/admin-widgets/components/useDebouncedHtmlPreview.hooks.ts
- packages/ui/src/features/execution/index.ts
- packages/ui/src/features/interactive-ui/providers/shadcn/index.ts
- packages/ui/src/features/lexical-rich-text-editor/react/test-support/lexical-harness.tsx
- packages/ui/src/features/mcp-ui/surfaces/choice-group.ts
- packages/ui/src/features/panel-kit/fetch-query/environment.browser.ts
- packages/ui/src/features/panel-kit/hooks/use-async-action.hooks.ts
- packages/ui/src/features/schedule-picker/react/components/RecurringSchedulePicker.tsx
- packages/ui/src/features/source-config-list/react/components/SourceConfigTestControl.tsx
- packages/ui/src/utils/scroll-tabs-with-wheel.ts
- packages/admin/src/forms/react/pages/FormsList.tsx
- packages/admin/src/playground/conformance/playground-api.conformance.ts
- packages/admin/src/react/components/ConfirmDialog/ConfirmDialog.tsx
- packages/admin/src/react/index.ts
- packages/admin/src/redirects/adapters/http.ts
- packages/admin/src/redirects/react/pages/RedirectsPage.tsx
- packages/admin/src/seo/react/hooks/SeoModuleTabs.ts
- packages/admin/src/seo/react/hooks/SitemapModal.hooks.ts
- packages/agent-runtime/src/metadata.ts
- packages/agent-runtime/src/model-loading-state.ts
- packages/chat/src/react/components/ChatSettingsDialog.hooks.ts
- packages/chat/src/react/components/MessageList.tsx
- packages/chat/src/react/hooks/useSurfaceExpiry.ts
- packages/chat/src/react/hooks/useUserTextGuard.ts
- packages/chat/src/store/runtime/run-guarded-chat-store.ts
- packages/cms/src/forms/sql/submission-ip-retention-repo.ts
- packages/cms/src/media/transform-lock.ts
- packages/cms/src/navigation/dropdown.ts
- packages/cms/src/widgets/repo.memory.ts
- packages/cms/src/workspace/delete.ts
- packages/daemon/src/http/daemon-status.ts
- packages/daemon/src/tool-recovery/diagnostics.ts
- packages/devops/src/deploy/tool.ts
- packages/mcp/src/federation/index.ts
- packages/mcp/src/server/tools/component-catalog-tools.ts
- packages/mcp/src/server/tools/tool-catalog-tools.ts
- packages/oauth/src/resource.ts
- packages/platform/src/fs/index.ts
- packages/platform/src/home-expansion.ts
- packages/plugins/src/glue/capability-gate.ts
- packages/plugins/src/host/plugin-format.ts
- packages/ui/src/features/asset-grid/react/components/useAssetGridFilters.ts
- packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeRowMenu.ts
- packages/ui/src/features/connectors/hooks/useWiredConnectorsBrowser.ts
- packages/ui/src/features/html-viewer/react/hooks/useDeckNavigation.ts
- packages/ui/src/features/integrations/dependencies.ts
- packages/ui/src/features/interactive-ui/index.ts
- packages/ui/src/features/lexical-rich-text-editor/react/hooks/useSeededValue.ts
- packages/ui/src/features/memory/react/hooks/useMemoryNavigation.hooks.ts
- packages/ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx
- packages/ui/src/features/skills/react/components/SkillDraftForm.tsx
- packages/ui/src/react/mcp-ui/McpUiHost.tsx
- packages/ui/src/utils/endpoint-policy.ts
- packages/ui/src/utils/uuid.ts
- packages/admin/src/forms/controllers/form-editor.controller.ts
- packages/admin/src/forms/react/components/FieldAttributesDialog.tsx
- packages/admin/src/forms/react/hooks/FormsPorts.hooks.ts
- packages/admin/src/media/react/hooks/MediaDialog.hooks.ts
- packages/admin/src/redirects/react/hooks/RedirectsPage.hooks.ts
- packages/admin/src/security/react/hooks/CredentialEditor.hooks.ts
- packages/admin/src/security/react/tabs/RootKeyTab.tsx
- packages/admin/src/source-control/rules.ts
- packages/admin/src/widgets/react/hooks/WidgetsPorts.hooks.ts
- packages/admin/src/widgets/react/pages/WidgetRegions.tsx
- packages/agent-plugins/src/admin-surfaces/index.ts
- packages/agent-plugins/src/lifecycle/persistent-state.ts
- packages/agent-runtime/src/defs/qoder.ts
- packages/agent-runtime/src/native-tool-policy.ts
- packages/agent-runtime/src/registry.ts
- packages/chat/src/react/components/MessageList.rules.ts
- packages/chat/src/react/features/chat-pane/index.ts
- packages/cms/src/content-types/index.ts
- packages/cms/src/forms/delivery/pull-trigger.ts
- packages/cms/src/forms/errors.ts
- packages/cms/src/forms/submission-ip-retention.ts
- packages/cms/src/media/types.ts
- packages/cms/src/redirects/index.ts
- packages/cms/src/redirects/spa/index.ts
- packages/cms/src/redirects/sql/repo.rows.ts
- packages/cms/src/trash/cursor.ts
- packages/cms/src/widgets/registry.ts
- packages/mcp/src/core/install-info.ts
- packages/oauth/src/testing/token-store.ts
- packages/oauth/tests/fixtures.ts
- packages/oauth/tests/integration-contract.types.ts
- packages/platform/src/fs/workspace-directory.ts
- packages/plugins/src/host/bundled-initialization.ts
- packages/ui-kit/src/react/native/Dialog.tsx
- packages/ui/src/features/asset-tree-browser/react/components/AssetTreeBrowser.tsx
- packages/ui/src/features/browser-chrome/react/hooks/useBrowserBridgeRegistration.ts
- packages/ui/src/features/charts/wire.ts
- packages/ui/src/features/connectors/components/ConnectorGrid.tsx
- packages/ui/src/features/file-dropzone/constants.ts
- packages/ui/src/features/file-dropzone/react/components/FileDropzoneZone.tsx
- packages/ui/src/features/html-viewer/react/components/PresentMenu.tsx
- packages/ui/src/features/interactive-ui/providers/shadcn/icons.tsx
- packages/ui/src/features/mcp-ui/surfaces/index.ts
- packages/ui/src/features/panel-kit/fetch-query/binding.react.tsx
- packages/ui/src/features/panel-kit/helpers/format-timestamp.ts
- packages/ui/src/features/schedule-picker/react/components/ScheduleSummary.tsx
- packages/ui/src/features/sketch-editor/index.ts
- packages/ui/src/features/source-config-list/index.ts
- packages/ui/src/features/version-manager/react/components/VersionRestoreControl.tsx
- packages/ui/src/react/mcp-ui/mcp-ui-host-frame.ts
- packages/ui/src/renderers/registry.ts
- packages/admin/src/agent-plugins/adapters/memory.ts
- packages/admin/src/comments/react/hooks/CommentsPorts.hooks.ts
- packages/admin/src/consent/react/ConsentSettingsPanel.tsx
- packages/admin/src/consent/react/settings-panel.hooks.ts
- packages/admin/src/core/react/use-controller.ts
- packages/admin/src/forms/index.ts
- packages/admin/src/media/react/components/MediaCard.tsx
- packages/admin/src/media/react/tabs/LibraryTab.tsx
- packages/admin/src/react/entities/EntityCell.tsx
- packages/admin/src/redirects/controllers/import-redirects.controller.ts
- packages/admin/src/seo/index.ts
- packages/agent-runtime/src/defs/reasonix.ts
- packages/agent-runtime/src/prompt-file.ts
- packages/agent-runtime/src/runtime-state.ts
- packages/chat/src/core/compact-events.ts
- packages/chat/src/core/surface-expiry.ts
- packages/chat/src/react/components/attachment-size.ts
- packages/chat/src/react/components/AttachmentGallery.rules.ts
- packages/chat/src/react/components/QuestionsPanel.tsx
- packages/chat/src/react/hooks/attachment-preview-cache.ts
- packages/chat/vitest.setup.ts
- packages/cms/src/media/blob-gc-lock.ts
- packages/cms/src/navigation/index.ts
- packages/cms/src/navigation/reconcile.ts
- packages/cms/src/seo/index.ts
- packages/daemon/src/frontend-capability-tools.ts
- packages/daemon/src/http/workspace-root.ts
- packages/mcp/src/federation/config.ts
- packages/mcp/src/federation/presets.ts
- packages/mcp/src/index.ts
- packages/oauth/src/api.ts
- packages/oauth/tests/args-convention.types.ts
- packages/ui-kit/src/react/KitProvider.tsx
- packages/ui/src/browser/useDismissOnOutsideOrEscape.ts
- packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeClipboardPasteUpload.ts
- packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeCopyLocalPath.ts
- packages/ui/src/features/iframe-pool/rules.ts
- packages/ui/src/features/interactive-ui/providers/shadcn/radio-group.tsx
- packages/ui/src/features/list-detail-panel/react/components/ListDetailPanel.tsx
- packages/ui/src/features/mcp-ui/escape.ts
- packages/ui/src/features/mcp-ui/surfaces/select.ts
- packages/ui/src/features/media-providers/dependencies.ts
- packages/ui/src/features/memory/react/components/MemoryExtractionCard.tsx
- packages/ui/src/features/memory/react/components/MemoryManualEditor.tsx
- packages/ui/src/features/resource-dashboard/react/components/ResourceBoard.tsx
- packages/ui/src/features/resource-dashboard/react/components/ResourceRowList.tsx
- packages/ui/src/features/revision-review/rules.ts
- packages/ui/src/features/sketch-editor/constants.ts
- packages/ui/src/renderers/renderers/index.ts
- packages/ui/src/utils/appearance.ts
- packages/admin/src/agent-plugins/react/components/AgentPluginRow.tsx
- packages/admin/src/agent-plugins/react/index.ts
- packages/admin/src/comments/react/hooks/SettingsSection.hooks.ts
- packages/admin/src/comments/react/pages/CommentsPage.tsx
- packages/admin/src/forms/controllers/draft-store.ts
- packages/admin/src/playground/adapters/memory.ts
- packages/admin/src/playground/controllers/playground.controller.ts
- packages/admin/src/playground/react/hooks/Canvas.hooks.ts
- packages/admin/src/seo/controllers/entry-picker.controller.ts
- packages/admin/src/source-control/adapters/http.ts
- packages/admin/src/widgets/react/components/WidgetInstanceNotices.tsx
- packages/agent-plugins/src/lifecycle/install-from-url.ts
- packages/agent-plugins/src/lifecycle/node.ts
- packages/agent-plugins/src/lifecycle/tools/definition.ts
- packages/agent-runtime/src/acp-model-probe.ts
- packages/agent-runtime/src/agent-protocol/acp/constants.ts
- packages/agent-runtime/src/defs/amp.ts
- packages/agent-runtime/src/defs/opencode.ts
- packages/agent-runtime/src/log-file.ts
- packages/agent-runtime/src/model-discovery-native.ts
- packages/cms/src/comments/index.ts
- packages/cms/src/content-types/types.ts
- packages/cms/src/core/keyset-cursor.ts
- packages/cms/src/forms/delivery/status.ts
- packages/cms/src/presentation/repo.memory.ts
- packages/cms/src/redirects/hit-sink.ts
- packages/cms/src/redirects/order.ts
- packages/daemon/src/tool-recovery/stack.ts
- packages/devops/src/packaging/electron/typescript.ts
- packages/mcp/src/federation/tool-approvals.ts
- packages/mcp/src/server/index.ts
- packages/platform/src/fs/directory-home.ts
- packages/plugins/src/host/quarantine.ts
- packages/plugins/src/host/repo.memory.ts
- packages/plugins/src/host/source-policy.ts
- packages/ui-kit/src/react/native/Navigation.tsx
- packages/ui/src/features/admin-widgets/components/SeeMore/SeeMore.tsx
- packages/ui/src/features/appearance/rules.ts
- packages/ui/src/features/asset-grid/react/components/AssetGridBody.tsx
- packages/ui/src/features/execution/constants.ts
- packages/ui/src/features/execution/react/hooks/use-byok-field-validation.hooks.ts
- packages/ui/src/features/html-viewer/react/hooks/useZoomControl.ts
- packages/ui/src/features/interactive-ui/providers/shadcn/button.tsx
- packages/ui/src/features/language/react/components/LanguageTab.tsx
- packages/ui/src/features/lexical-rich-text-editor/index.ts
- packages/ui/src/features/mcp-ui/surfaces/bridge.ts
- packages/ui/src/features/memory/constants.ts
- packages/ui/src/features/memory/react/components/MemorySettingsPanel.tsx
- packages/ui/src/features/memory/react/hooks/useMemoryFlash.hooks.ts
- packages/ui/src/features/resource-dashboard/react/components/ResourceCard.tsx
- packages/ui/src/features/resource-dashboard/react/components/ResourceRowListViewParts.tsx
- packages/ui/src/features/version-manager/index.ts
- packages/ui/src/features/version-manager/react/components/VersionPreviewFrame.tsx
- packages/ui/src/react/components/ComponentKitPreview.tsx
- packages/admin/src/agent-plugins/adapters/http.ts
- packages/admin/src/agent-plugins/react/pages/AgentPluginsPage.tsx
- packages/admin/src/comments/react/components/SettingsSection.tsx
- packages/admin/src/core/transport/errors.ts
- packages/admin/src/forms/react/components/FormFieldsEditor.tsx
- packages/admin/src/react/shell/model.ts
- packages/admin/src/redirects/react/hooks/RedirectsOptions.hooks.ts
- packages/admin/src/redirects/react/hooks/use-hit-count-cell.hooks.ts
- packages/admin/src/seo/controllers/media-ref.controller.ts
- packages/agent-plugins/src/admin-surfaces/contribution.ts
- packages/agent-plugins/src/admin-surfaces/protocol.ts
- packages/agent-plugins/src/lifecycle/mcp-provisioning.ts
- packages/agent-runtime/src/defs/copilot.ts
- packages/agent-runtime/src/defs/crush.ts
- packages/agent-runtime/src/defs/droid.ts
- packages/agent-runtime/src/defs/qwen.ts
- packages/charts-recharts/src/line-chart.tsx
- packages/charts-recharts/src/pie-chart.tsx
- packages/chat/src/core/assistant-client/messages.ts
- packages/chat/src/react/artifact-types.ts
- packages/chat/src/react/components/ConversationList.hooks.ts
- packages/chat/src/react/components/ToolCallGroup.hooks.ts
- packages/chat/src/server/durable-runs/accept.ts
- packages/chat/src/store/pglite/index.ts
- packages/chat/src/store/postgres/index.ts
- packages/cms/src/forms/delivery/index.ts
- packages/cms/src/forms/delivery/pull-lease.ts
- packages/cms/src/navigation/read-model.ts
- packages/daemon/src/agent-executor/agent-env.ts
- packages/daemon/src/http/agents.ts
- packages/db/src/testing/pg-fixture.ts
- packages/server/src/create-local-node-daemon.typecheck.ts
- packages/ui/src/core/theme/stylesheet.ts
- packages/ui/src/features/asset-tree-browser/react/components/FilePreviewPane.tsx
- packages/ui/src/features/connectors/components/ProviderTabBar.tsx
- packages/ui/src/features/execution/react/components/ProviderChipGroup.tsx
- packages/ui/src/features/file-dropzone/index.ts
- packages/ui/src/features/html-editor/react/components/InteractiveHtmlEditor.tsx
- packages/ui/src/features/html-viewer/index.ts
- packages/ui/src/features/integrations/index.ts
- packages/ui/src/features/lexical-rich-text-editor/react/components/CaretFloatingLayer.tsx
- packages/ui/src/features/list-detail-panel/react/hooks/useListDetailSelection.ts
- packages/ui/src/features/memory/react/components/MemoryAdvancedModal.tsx
- packages/ui/src/features/mention-autocomplete/react/components/MentionAutocomplete.tsx
- packages/ui/src/features/mention-autocomplete/react/components/MentionCategoryTabs.tsx
- packages/ui/src/features/observability/index.ts
- packages/ui/src/features/source-config-list/react/components/SourceConfigList.tsx
- packages/ui/src/features/tab-strip/index.ts
- packages/ui/src/react/components/KitErrorBoundary.tsx
- packages/ui/src/react/components/Loading.tsx
- packages/ui/src/react/components/OnboardingChipField.tsx
- packages/ui/src/react/hooks/useDebouncedValue.ts
- packages/user-management/test-setup.ts
- packages/admin/src/agent-plugins/index.ts
- packages/admin/src/agent-plugins/react/components/AgentPluginInspector.tsx
- packages/admin/src/forms/form-editor-dirty.ts
- packages/admin/src/forms/react/components/FormEditorFieldsBodyParts.tsx
- packages/admin/src/forms/react/components/FormEditorMainPanel.tsx
- packages/admin/src/media/index.ts
- packages/admin/src/playground/react/index.ts
- packages/admin/src/playground/react/pages/PlaygroundPage.tsx
- packages/admin/src/redirects/index.ts
- packages/admin/src/redirects/react/components/HitCountCell.tsx
- packages/admin/src/security/index.ts
- packages/admin/src/security/react/hooks/SecurityPage.hooks.ts
- packages/admin/src/security/react/index.ts
- packages/admin/src/source-control/react/index.ts
- packages/admin/src/source-control/react/pages/SourceControlPage.tsx
- packages/admin/src/widgets/index.ts
- packages/agent-runtime/src/agent-protocol/pi-rpc/internal.ts
- packages/agent-runtime/src/defs/aider.ts
- packages/agent-runtime/src/defs/deepseek.ts
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/avatarLibrary.tsx
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/ChatMotionOverlay.tsx
- packages/charts-recharts/src/chart-config.ts
- packages/chat/src/core/util/markup-attributes.ts
- packages/chat/src/react/components/ExtEventErrorBoundary.tsx
- packages/chat/vitest.config.ts
- packages/cms/src/comments/errors.ts
- packages/cms/src/comments/sanitize.ts
- packages/cms/src/comments/sql/repo.rows.ts
- packages/cms/src/content-types/agent-tools.ts
- packages/cms/src/entries/index.ts
- packages/cms/src/media/image-transformer.ts
- packages/cms/src/navigation/agent-tools.ts
- packages/cms/src/redirects/types.ts
- packages/cms/src/taxonomy/list.ts
- packages/cms/src/widgets/authorize-helper.ts
- packages/core/src/compose.typecheck.ts
- packages/daemon/src/agent-executor/values.ts
- packages/daemon/src/store/agent-sessions/index.ts
- packages/devops/src/deploy/tokens.ts
- packages/devops/src/packaging/electron/entry.ts
- packages/mcp/src/server/resources/site-guide-resource.ts
- packages/platform/src/fs/strict-containment.ts
- packages/server/src/feature.ts
- packages/server/src/index.ts
- packages/server/src/lifecycle/readiness-state.ts
- packages/ui/src/features/asset-tree-browser/constants.ts
- packages/ui/src/features/html-viewer/react/components/ZoomMenu.tsx
- packages/ui/src/features/instructions/react/components/InstructionsTab.tsx
- packages/ui/src/features/interactive-ui/providers/shadcn/label.tsx
- packages/ui/src/features/interactive-ui/providers/shadcn/radio-group-field.tsx
- packages/ui/src/features/lexical-rich-text-editor/constants.ts
- packages/ui/src/features/mcp-ui/index.ts
- packages/ui/src/features/memory/react/MemoryPorts.tsx
- packages/ui/src/features/mention-autocomplete/index.ts
- packages/ui/src/features/panel-kit/helpers/standing-draft-recovery-message.ts
- packages/ui/src/features/schedule-picker/index.ts
- packages/ui/src/features/schedule-picker/react/components/ScheduleFields.tsx
- packages/ui/src/features/version-manager/react/components/VersionSidebar.tsx
- packages/ui/src/react/mcp-ui/host-message-source.ts
- packages/admin/src/agent-plugins/react/components/AgentPluginListPanel.tsx
- packages/admin/src/agent-plugins/react/hooks/AgentPluginsPorts.hooks.ts
- packages/admin/src/agent-plugins/react/tabs/MarketplaceTab.tsx
- packages/admin/src/comments/index.ts
- packages/admin/src/forms/react/components/FieldSettingsSection.tsx
- packages/admin/src/forms/react/components/FormEditorFieldsBody.tsx
- packages/admin/src/forms/react/components/FormEditorTabStrip.tsx
- packages/admin/src/media/react/components/EditMediaPanel.tsx
- packages/admin/src/media/react/components/MediaLightbox.tsx
- packages/admin/src/media/react/components/MediaPicker.tsx
- packages/admin/src/media/react/hooks/MediaPorts.hooks.ts
- packages/admin/src/media/react/tabs/ProvidersTab.tsx
- packages/admin/src/react/components/ConfirmButton/ConfirmButton.tsx
- packages/admin/src/redirects/react/hooks/RedirectsPorts.hooks.ts
- packages/admin/src/security/react/hooks/SecurityPorts.hooks.ts
- packages/admin/src/security/react/pages/SecurityPage.tsx
- packages/admin/src/security/react/tabs/AccessTokensTab.tsx
- packages/admin/src/seo/react/components/SeoIcons.tsx
- packages/admin/src/source-control/react/tabs/ProvidersTab.tsx
- packages/agent-runtime/src/defs/codebuddy.ts
- packages/agent-runtime/src/defs/mimo.ts
- packages/agent-runtime/src/mcp.ts
- packages/agent-runtime/src/providers/turn-end-guard.ts
- packages/artifacts/src/index.ts
- packages/charts-recharts/src/chart-tokens.ts
- packages/charts-recharts/vitest.setup.ts
- packages/chat/src/core/tool-output.ts
- packages/chat/src/core/tools.ts
- packages/chat/src/core/util/index.ts
- packages/chat/src/react/components/AttachmentGallery.hooks.ts
- packages/chat/src/react/components/ChatFab.tsx
- packages/chat/src/store/sql/maintenance.ts
- packages/cms/src/content-types/lifecycle-dispatch.ts
- packages/cms/src/entries/lifecycle-dispatch.ts
- packages/cms/src/redirects/reserved-destination.ts
- packages/cms/src/taxonomy/index.ts
- packages/cms/src/trash/index.ts
- packages/cms/src/widgets/embed-validation.ts
- packages/daemon/src/agent-executor/index.ts
- packages/daemon/src/continuation/journal.ts
- packages/daemon/vitest.config.ts
- packages/devops/src/core/export-failure-summary.ts
- packages/devops/src/deploy/index.ts
- packages/devops/src/packaging/electron/stability.ts
- packages/plugins/src/glue/index.ts
- packages/plugins/src/host/node/index.ts
- packages/registry/vitest.config.ts
- packages/server/vitest.config.ts
- packages/sqlite/vitest.config.ts
- packages/ui/src/features/asset-tree-browser/react/components/AssetTreeBreadcrumbs.tsx
- packages/ui/src/features/browser-chrome/index.ts
- packages/ui/src/features/connectors/components/ConnectorAlertList.tsx
- packages/ui/src/features/connectors/constants.ts
- packages/ui/src/features/execution/react/components/AgentCliEnvFields.tsx
- packages/ui/src/features/html-editor/index.ts
- packages/ui/src/features/interactive-ui/providers/native/data-table.tsx
- packages/ui/src/features/interactive-ui/providers/shadcn/checkbox.tsx
- packages/ui/src/features/interactive-ui/registry.ts
- packages/ui/src/features/list-detail-panel/rules.ts
- packages/ui/src/features/mcp-ui/sandbox-proxy.ts
- packages/ui/src/features/mcp-ui/surfaces/checkbox.ts
- packages/ui/src/features/memory/react/components/MemoryEntryCard.tsx
- packages/ui/src/features/memory/react/components/MemoryHooksPanel.tsx
- packages/ui/src/features/panel-kit/hooks/use-settlement-generation.hooks.ts
- packages/ui/src/features/resource-dashboard/react/components/ResourceKanbanBoard.tsx
- packages/ui/src/features/resource-dashboard/react/components/ResourceRunHistoryList.tsx
- packages/ui/src/features/tab-strip/react/components/TabStrip.tsx
- packages/ui/src/features/tabbed-dialog/rules.ts
- packages/ui/src/react/components/AppChromeHeader.tsx
- packages/ui/src/react/components/RemixIcon.tsx
- packages/ui/src/renderers/annotation-canvas/theme.ts
- packages/ui/src/renderers/renderers/html.ts
- packages/ui/src/utils/index.ts
- packages/admin/src/agent-plugins/react/components/AgentPluginFileContent.tsx
- packages/admin/src/comments/controllers/comments.controller.ts
- packages/admin/src/comments/react/hooks/CommentsPage.hooks.ts
- packages/admin/src/core/index.ts
- packages/admin/src/forms/controllers/form-fields-editor.controller.ts
- packages/admin/src/forms/controllers/form-submission-detail.controller.ts
- packages/admin/src/forms/controllers/form-submissions.controller.ts
- packages/admin/src/forms/controllers/forms-list.controller.ts
- packages/admin/src/media/react/pages/MediaPage.tsx
- packages/admin/src/playground/react/components/Canvas.tsx
- packages/admin/src/react/entities/index.ts
- packages/admin/src/react/OverlayHost.hooks.ts
- packages/admin/src/react/types.ts
- packages/admin/src/widgets/widgets.module.ts
- packages/agent-runtime/src/resolution.ts
- packages/charts-recharts/src/descriptor.ts
- packages/chat/src/core/durable-runs/policies.ts
- packages/chat/src/react/components/SentAttachment.tsx
- packages/chat/src/store/runtime/entry.ts
- packages/cms/src/forms/delete-submission.ts
- packages/cms/src/forms/delivery/retry-policy.ts
- packages/cms/src/media/created-by.ts
- packages/cms/src/widgets/html/index.ts
- packages/cms/src/widgets/resolvers/create-core-resolvers.ts
- packages/cms/src/workspace/index.ts
- packages/devops/src/core/deploy-types.ts
- packages/devops/src/core/redirect-guard.ts
- packages/devops/src/source-control/kit.ts
- packages/mcp/src/server/resources/active-resource.ts
- packages/oauth/src/testing/registration-cache.ts
- packages/platform/src/http/guarded/index.ts
- packages/platform/src/secrets/credential-sets/index.ts
- packages/ui-kit/src/react/index.ts
- packages/ui/src/features/asset-grid/react/components/AssetGridToolbar.tsx
- packages/ui/src/features/browser-chrome/constants.ts
- packages/ui/src/features/charts/contract.ts
- packages/ui/src/features/command-palette/index.ts
- packages/ui/src/features/execution/react/hooks/useLocalCliAgentList.ts
- packages/ui/src/features/folder-path-drop/react/hooks/useFolderPathDropCapture.ts
- packages/ui/src/features/html-editor/dom.ts
- packages/ui/src/features/i18n/dictionary-translator.ts
- packages/ui/src/features/iframe-pool/index.ts
- packages/ui/src/features/interactive-ui/providers/shadcn/checkbox-field.tsx
- packages/ui/src/features/interactive-ui/providers/shadcn/input.tsx
- packages/ui/src/features/memory/react/components/MemoryHowPanel.tsx
- packages/ui/src/features/mention-autocomplete/react/components/MentionResultsList.tsx
- packages/ui/src/features/mention-autocomplete/react/components/SelectedMentionChips.tsx
- packages/ui/src/features/revision-review/react/components/RevisionDiffCard.tsx
- packages/ui/src/features/settings/dialog/react/components/SettingsDialogShell.tsx
- packages/ui/src/features/skills/index.ts
- packages/ui/src/features/tab-launcher-menu/index.ts
- packages/ui/src/features/tabbed-dialog/react/components/TabbedDialogSidebar.tsx
- packages/ui/src/features/viewer-shell/react/components/SegmentedToggle.tsx
- packages/ui/src/react/components/Icon.tsx
- packages/ui/src/react/components/Notice.tsx
- packages/ui/src/react/hooks/useStableHandler.ts
- packages/ui/src/renderers/annotation-canvas/index.ts
- packages/ui/src/renderers/renderers/svg.ts
- packages/ui/src/renderers/sandbox-scripts.ts
- packages/ui/src/utils/visual-stability.ts
- packages/admin/src/agent-plugins/agent-plugins.module.ts
- packages/admin/src/forms/messages.en.ts
- packages/admin/src/forms/ports.ts
- packages/admin/src/forms/react/components/FormSubmissionsTable.tsx
- packages/admin/src/forms/react/hooks/use-form-submission-date.hooks.ts
- packages/admin/src/media/media.module.ts
- packages/admin/src/media/react/components/MediaDialog.tsx
- packages/admin/src/media/react/components/MediaGrid.tsx
- packages/admin/src/media/react/components/MediaPurgeDialog.tsx
- packages/admin/src/media/react/components/UploadButton.tsx
- packages/admin/src/react/entities/RelationTruncationNotice.tsx
- packages/admin/src/redirects/controllers/hit-count.controller.ts
- packages/admin/src/redirects/react/components/ImportRedirectsForm.tsx
- packages/admin/src/security/react/components/CredentialEditor.tsx
- packages/admin/src/seo/models.ts
- packages/admin/src/seo/react/hooks/use-seo-entry-section.hooks.ts
- packages/admin/src/seo/seo.module.ts
- packages/admin/src/source-control/index.ts
- packages/admin/src/source-control/react/components/SourceControlCredentialFields.tsx
- packages/admin/src/source-control/source-control.module.ts
- packages/admin/src/widgets/messages.en.ts
- packages/admin/vitest.setup.ts
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/remotion.config.ts
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/Root.tsx
- packages/chat/src/core/assistant-client/entry.ts
- packages/chat/src/core/usage-format.ts
- packages/chat/src/react/components/Icon.tsx
- packages/chat/src/react/components/NextStepActions.tsx
- packages/chat/src/react/components/ToolCallGroup.tsx
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneSuggestion.hooks.ts
- packages/chat/src/react/util/defined-props.ts
- packages/chat/vitest.postgres.config.ts
- packages/cms/src/entries/list.ts
- packages/cms/src/forms/fields-json.ts
- packages/cms/src/media/slug.ts
- packages/cms/src/seo/errors.ts
- packages/daemon/src/agent-executor/contracts.ts
- packages/daemon/src/agent-executor/handoff.ts
- packages/daemon/src/http/cancel-owned-runs.ts
- packages/daemon/src/remote-tool-bridge.ts
- packages/daemon/src/scheduler.ts
- packages/daemon/src/tokens.ts
- packages/daemon/src/tool-recovery/index.ts
- packages/db/vitest.postgres.config.ts
- packages/devops/src/source-control/entry.ts
- packages/devops/src/static-export/entry.ts
- packages/oauth/tests/dispatcher-stub.ts
- packages/platform/src/asset-cache.adapter.ts
- packages/platform/src/web/html-resource.ts
- packages/plugins/src/glue/dispatch.ts
- packages/plugins/src/host/errors.ts
- packages/plugins/src/host/sql/repo.rows.ts
- packages/ui-kit/src/react/confirm/ConfirmDialog.tsx
- packages/ui-kit/src/react/native/index.ts
- packages/ui/src/features/admin-widgets/components/ImagePreviewModal.tsx
- packages/ui/src/features/asset-grid/constants.ts
- packages/ui/src/features/asset-grid/react/components/SelectionActionBar.tsx
- packages/ui/src/features/asset-tree-browser/react/components/AssetTreeToolbar.tsx
- packages/ui/src/features/file-dropzone/react/components/FileDropzoneNameList.tsx
- packages/ui/src/features/html-viewer/react/components/DeckNavigationControls.tsx
- packages/ui/src/features/i18n/index.ts
- packages/ui/src/features/media-providers/index.ts
- packages/ui/src/features/memory/react/render-markdown.tsx
- packages/ui/src/features/resource-dashboard/react/components/ResourceRowListItemParts.tsx
- packages/ui/src/features/resource-dashboard/react/components/ResourceRowListView.tsx
- packages/ui/src/features/revision-review/react/components/RevisionHistoryList.tsx
- packages/ui/src/features/schedule-picker/constants.ts
- packages/ui/src/features/sketch-editor/react/components/SketchMainMenu.tsx
- packages/ui/src/features/tab-launcher-menu/constants.ts
- packages/ui/src/features/tab-strip/dependencies.ts
- packages/ui/src/features/viewer-shell/dependencies.ts
- packages/ui/src/features/viewer-shell/react/components/SvgSourcePane.tsx
- packages/ui/src/features/viewer-shell/react/components/ViewerFileActions.tsx
- packages/ui/src/react/components/FileImportPanel.tsx
- packages/ui/src/renderers/renderers/react-component.ts
- packages/ui/src/renderers/srcdoc/bridge.ts
- packages/vibecoding/vitest.setup.ts
- packages/admin/src/agent-plugins/react/components/AgentPluginFileTree.tsx
- packages/admin/src/agent-plugins/react/hooks/AgentPluginRow.hooks.ts
- packages/admin/src/browser/shell-navigation.ts
- packages/admin/src/comments/comments.module.ts
- packages/admin/src/comments/messages.en.ts
- packages/admin/src/comments/ports.ts
- packages/admin/src/forms/forms.module.ts
- packages/admin/src/forms/models.ts
- packages/admin/src/media/ports.ts
- packages/admin/src/media/react/hooks/MediaGrid.hooks.ts
- packages/admin/src/playground/index.ts
- packages/admin/src/playground/playground.module.ts
- packages/admin/src/playground/react/hooks/PlaygroundPorts.hooks.ts
- packages/admin/src/react/entities/types.ts
- packages/admin/src/react/OverlayHost.tsx
- packages/admin/src/react/shell/index.ts
- packages/admin/src/redirects/messages.en.ts
- packages/admin/src/redirects/redirects.module.ts
- packages/admin/src/security/ports.ts
- packages/admin/src/security/security.module.ts
- packages/admin/src/seo/controllers/entry-section.controller.ts
- packages/admin/src/seo/react/components/MediaPickerBridge.tsx
- packages/admin/src/source-control/react/components/SourceControlProviderRow.tsx
- packages/admin/src/source-control/react/hooks/SourceControlCredentialFields.hooks.ts
- packages/admin/src/source-control/react/hooks/SourceControlPorts.hooks.ts
- packages/admin/src/widgets/ports.ts
- packages/agent-plugins/src/lifecycle/install-errors.ts
- packages/agent-plugins/src/lifecycle/tools/index.ts
- packages/agent-runtime/src/agent-protocol/acp/account-failure.ts
- packages/agent-runtime/src/agent-protocol/acp/index.ts
- packages/chat/src/core/messages.ts
- packages/chat/src/core/question-form.ts
- packages/chat/src/embed-widget/react/header.tsx
- packages/chat/src/react/components/ConversationList.rules.ts
- packages/chat/src/store/errors.ts
- packages/cms/src/consent/types.ts
- packages/cms/src/content-types/list.ts
- packages/cms/src/core/index.ts
- packages/cms/src/core/transform-format.ts
- packages/cms/src/entries/agent-tools.ts
- packages/cms/src/forms/sql/index.ts
- packages/cms/src/listing/index.ts
- packages/cms/src/media/agent-tools.ts
- packages/cms/src/navigation/contracts.ts
- packages/cms/src/redirects/ports.internal.ts
- packages/cms/src/taxonomy/agent-tools.ts
- packages/cms/src/widgets/markers/index.ts
- packages/cms/src/widgets/page-embed-types.ts
- packages/cms/src/widgets/types.ts
- packages/cms/src/workspace/agent-tools.ts
- packages/daemon/src/continuation/continuation-transport.ts
- packages/daemon/src/continuation/index.ts
- packages/daemon/src/continuation/run-start-handler.ts
- packages/daemon/src/routines/index.ts
- packages/daemon/src/store/agent-sessions/errors.ts
- packages/daemon/src/store/agent-sessions/pglite.ts
- packages/daemon/src/store/agent-sessions/postgres.ts
- packages/devops/src/deploy/naming.ts
- packages/mcp/src/tools/ask-choice/schema.ts
- packages/platform/src/http/guarded/node-ports.ts
- packages/platform/src/secrets/keyring.memory.ts
- packages/ui-kit/src/index.ts
- packages/ui-kit/src/kit-contract.ts
- packages/ui/src/features/a2ui/catalog-from-registry.ts
- packages/ui/src/features/a2ui/index.ts
- packages/ui/src/features/appearance/constants.ts
- packages/ui/src/features/asset-tree-browser/react/components/AssetTreeEmptyState.tsx
- packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFolderRow.tsx
- packages/ui/src/features/asset-tree-browser/react/components/AssetTreeRowMenu.tsx
- packages/ui/src/features/asset-tree-browser/react/components/AssetTreeSelectionBar.tsx
- packages/ui/src/features/asset-tree-browser/react/components/AssetTreeUploadErrorBanner.tsx
- packages/ui/src/features/command-palette/constants.ts
- packages/ui/src/features/html-viewer/constants.ts
- packages/ui/src/features/interactive-ui/providers/shadcn/lib/utils.ts
- packages/ui/src/features/media-providers/react/components/media-providers-tab-labels.ts
- packages/ui/src/features/memory/async-commit-guard.ts
- packages/ui/src/features/mention-autocomplete/react/components/MentionResultItem.tsx
- packages/ui/src/features/notifications/notifications-catalog.ts
- packages/ui/src/features/panel-kit/helpers/resolve-active-tab-id.ts
- packages/ui/src/features/project-locations/index.ts
- packages/ui/src/features/resource-dashboard/react/components/ResourceRowListItem.tsx
- packages/ui/src/features/resource-dashboard/react/components/StatusPill.tsx
- packages/ui/src/features/schedule-picker/react/components/ScheduleKindTabs.tsx
- packages/ui/src/features/schedule-picker/react/components/WeekdayGrid.tsx
- packages/ui/src/features/source-config-list/constants.ts
- packages/ui/src/features/source-config-list/react/components/SourceConfigTrustOptions.tsx
- packages/ui/src/features/tabbed-dialog/react/components/TabbedDialogChrome.tsx
- packages/ui/src/features/version-manager/constants.ts
- packages/ui/src/features/viewer-shell/react/components/CodeWithLines.tsx
- packages/ui/src/features/viewer-shell/react/components/ViewerShell.tsx
- packages/ui/src/react/mcp-ui/index.ts
- packages/ui/src/renderers/preview-modal-shell/index.ts
- packages/ui/src/theme/color-scheme.ts
- packages/ui/src/theme/index.ts
- packages/ui/src/utils/browser-request.ts
- packages/ui/src/utils/localized-url.ts
- packages/admin/src/agent-plugins/react/tabs/DownloadedTab.tsx
- packages/admin/src/agent-plugins/react/tabs/InstalledTab.tsx
- packages/admin/src/core/module/index.ts
- packages/admin/src/forms/react/components/FormEditorHeaderText.tsx
- packages/admin/src/playground/react/tabs/CanvasTab.tsx
- packages/admin/src/react/entities/EntityIndex.tsx
- packages/admin/src/redirects/ports.ts
- packages/admin/src/seo/ports.ts
- packages/admin/src/source-control/react/hooks/SourceControlPage.hooks.ts
- packages/admin/src/widgets/react/components/WidgetRegionEditorHeaderActions.tsx
- packages/admin/src/widgets/react/hooks/navigation.hooks.ts
- packages/agent-plugins/vitest.config.ts
- packages/agent-runtime/src/agent-protocol/index.ts
- packages/agent-runtime/src/agent-protocol/pi-rpc/index.ts
- packages/agent-runtime/src/defs/auggie.ts
- packages/agent-runtime/src/defs/cline.ts
- packages/agent-runtime/src/defs/devin.ts
- packages/agent-runtime/src/defs/goose.ts
- packages/agent-runtime/src/defs/hermes.ts
- packages/agent-runtime/src/defs/kilo.ts
- packages/agent-runtime/src/defs/kimi.ts
- packages/agent-runtime/src/defs/kiro.ts
- packages/agent-runtime/src/defs/trae-cli.ts
- packages/agent-runtime/src/defs/vibe.ts
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/components/DeviceFrame.tsx
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/index.ts
- packages/artifacts/src/runtime-compat.ts
- packages/chat/src/react/features/chat-pane/hooks/useChatPaneSurface.hooks.ts
- packages/chat/src/server/durable-runs/entry.ts
- packages/chat/src/store/legacy/sqlite/index.ts
- packages/chat/src/store/sqlite/schema.ts
- packages/cms/src/comments/types.ts
- packages/cms/src/consent/html/client.ts
- packages/cms/src/consent/index.ts
- packages/cms/src/forms/email-format.ts
- packages/cms/src/forms/html/index.ts
- packages/cms/src/media/blob-key.ts
- packages/cms/src/media/node.ts
- packages/cms/src/navigation/types.ts
- packages/cms/src/redirects/referrer-alias.ts
- packages/cms/src/redirects/sql/index.ts
- packages/daemon/src/run/core/index.ts
- packages/daemon/vitest.postgres.config.ts
- packages/devops/src/agent-jobs/entry.ts
- packages/mcp/src/core/index.ts
- packages/mcp/src/federation/approvals/index.ts
- packages/mcp/src/federation/approvals/revocation-reason.ts
- packages/mcp/src/federation/messages.ts
- packages/mcp/src/federation/stdio/index.ts
- packages/oauth/src/testing/index.ts
- packages/platform/src/http/guarded/errors.ts
- packages/platform/src/secrets/credential-sets/vault.aad.ts
- packages/platform/src/web/index.ts
- packages/plugins/src/glue/attachment-points/content-lifecycle.ts
- packages/plugins/src/glue/attachment-points/events.ts
- packages/plugins/src/host/attach-loaded-plugin.ts
- packages/plugins/src/host/worker/index.ts
- packages/ui/src/browser/index.ts
- packages/ui/src/features/about/index.ts
- packages/ui/src/features/admin-widgets/components/ComingSoonNotice.tsx
- packages/ui/src/features/asset-grid/react/components/SelectionBand.tsx
- packages/ui/src/features/charts/index.ts
- packages/ui/src/features/command-palette/react/components/CommandPaletteRow.tsx
- packages/ui/src/features/connectors/components/ConnectorGate.tsx
- packages/ui/src/features/integrations/constants.ts
- packages/ui/src/features/interactive-ui/providers/native/data-table.manifest.ts
- packages/ui/src/features/interactive-ui/providers/shadcn/action-button.manifest.ts
- packages/ui/src/features/interactive-ui/providers/shadcn/action-button.tsx
- packages/ui/src/features/interactive-ui/providers/shadcn/checkbox-field.manifest.ts
- packages/ui/src/features/interactive-ui/providers/shadcn/content-card.manifest.ts
- packages/ui/src/features/interactive-ui/providers/shadcn/content-card.tsx
- packages/ui/src/features/interactive-ui/providers/shadcn/data-table.manifest.ts
- packages/ui/src/features/interactive-ui/providers/shadcn/radio-group-field.manifest.ts
- packages/ui/src/features/interactive-ui/providers/shadcn/select-field.manifest.ts
- packages/ui/src/features/interactive-ui/providers/shadcn/select-field.tsx
- packages/ui/src/features/interactive-ui/providers/shadcn/text-input-field.manifest.ts
- packages/ui/src/features/interactive-ui/providers/shadcn/text-input-field.tsx
- packages/ui/src/features/list-detail-panel/index.ts
- packages/ui/src/features/mcp-ui/protocol.ts
- packages/ui/src/features/mention-autocomplete/constants.ts
- packages/ui/src/features/progress-card/index.ts
- packages/ui/src/features/resource-dashboard/constants.ts
- packages/ui/src/features/resource-dashboard/react/components/ResourceBoardToolbar.tsx
- packages/ui/src/features/resource-dashboard/react/components/ResourceBoardView.tsx
- packages/ui/src/features/resource-dashboard/react/components/ResourceMetrics.tsx
- packages/ui/src/features/revision-review/index.ts
- packages/ui/src/features/settings/dialog/index.ts
- packages/ui/src/features/sketch-editor/dependencies.ts
- packages/ui/src/features/sketch-editor/react/components/SketchSaveStateBadge.tsx
- packages/ui/src/features/tab-strip/constants.ts
- packages/ui/src/features/tab-strip/react/components/TabStripFrame.tsx
- packages/ui/src/features/tabbed-dialog/index.ts
- packages/ui/src/features/viewer-shell/constants.ts
- packages/ui/src/features/viewer-shell/react/components/AudioViewerBody.tsx
- packages/ui/src/features/viewer-shell/react/components/CommentSideDock.tsx
- packages/ui/src/features/viewer-shell/react/components/JsonPanel.tsx
- packages/ui/src/features/viewer-shell/react/components/ViewportToggleGroup.tsx
- packages/ui/src/react/components/CompactToggle.tsx
- packages/ui/src/react/components/EdgeScrollZones.tsx
- packages/ui/src/react/components/ImportChoice.tsx
- packages/ui/src/react/components/ToggleRow.tsx
- packages/ui/src/renderers/annotation-canvas/react/components/icons.tsx
- packages/ui/src/renderers/preview-modal-shell/react/components/icons.tsx
- packages/ui/src/utils/ime-composing.ts
- packages/ui/vitest.config.ts
- packages/admin/src/agent-plugins/ports.ts
- packages/admin/src/agent-plugins/react/hooks/MarketplaceTab.hooks.ts
- packages/admin/src/browser/index.ts
- packages/admin/src/contracts/credential-management.ts
- packages/admin/src/contracts/media-picker.ts
- packages/admin/src/contracts/playground-render-target.ts
- packages/admin/src/core/module/define-admin-module.ts
- packages/admin/src/core/module/token.ts
- packages/admin/src/core/permissions/rules.ts
- packages/admin/src/core/react/index.ts
- packages/admin/src/core/transport/index.ts
- packages/admin/src/forms/react/components/FormSubmissionDate.tsx
- packages/admin/src/media/react/hooks/MediaPurgeDialog.hooks.ts
- packages/admin/src/source-control/ports.ts
- packages/admin/src/widgets/react/components/WidgetsLibraryNotices.tsx
- packages/admin/vitest.config.ts
- packages/agent-runtime/src/capabilities.ts
- packages/agent-runtime/vitest.config.ts
- packages/agentic/vitest.config.ts
- packages/analytics/vitest.config.ts
- packages/artifacts/src/tokens.ts
- packages/capability-providers/vitest.config.ts
- packages/charts-recharts/src/index.ts
- packages/charts-recharts/vitest.config.ts
- packages/chat/src/core/durable-runs/run-lock.ts
- packages/chat/src/core/persistence/index.ts
- packages/chat/src/react/features/chat-pane/agent-tools.ts
- packages/chat/src/testing/index.ts
- packages/cli/vitest.config.ts
- packages/cms/forms/vitest.config.ts
- packages/cms/src/comments/sql/index.ts
- packages/cms/src/consent/html/index.ts
- packages/cms/src/forms/html/html-submission-adapter.ts
- packages/cms/src/forms/rate-limit-key.ts
- packages/cms/src/media/import/index.ts
- packages/cms/src/presentation/index.ts
- packages/cms/src/widgets/markers/media-reference.ts
- packages/cms/src/widgets/sql/index.ts
- packages/cms/src/widgets/where-used.ts
- packages/cms/vitest.config.ts
- packages/commerce/vitest.config.ts
- packages/core/vitest.config.ts
- packages/daemon/src/core/tool-candidates.ts
- packages/daemon/src/run/index.ts
- packages/daemon/src/tool-audit.ts
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
- packages/mcp/src/agent-install/index.ts
- packages/mcp/src/federation/approvals/scope-option.ts
- packages/mcp/src/federation/ports.ts
- packages/mcp/src/federation/testing/index.ts
- packages/mcp/vitest.config.ts
- packages/memory/vitest.config.ts
- packages/oauth/src/redact.ts
- packages/oauth/vitest.config.ts
- packages/platform/src/mail/delivery-availability.ts
- packages/platform/src/mail/index.ts
- packages/platform/src/secrets/aad.ts
- packages/platform/src/secrets/credential-sets/contracts.ts
- packages/platform/src/secrets/testing.ts
- packages/platform/vitest.config.ts
- packages/plugins/src/host/sql/index.ts
- packages/protocol/vitest.config.ts
- packages/sandbox/vitest.config.ts
- packages/server/src/lifecycle/index.ts
- packages/sidecar/vitest.config.ts
- packages/ui-kit/src/react/testing/index.ts
- packages/ui-kit/vitest.config.ts
- packages/ui/src/features/admin-widgets/components/ComingSoonPanel.tsx
- packages/ui/src/features/appearance/index.ts
- packages/ui/src/features/external-mcp/index.ts
- packages/ui/src/features/folder-path-drop/index.ts
- packages/ui/src/features/iframe-pool/react/pool-context.ts
- packages/ui/src/features/interactive-ui/providers/native/index.ts
- packages/ui/src/features/notifications/constants.ts
- packages/ui/src/features/notifications/index.ts
- packages/ui/src/features/notifications/rules.ts
- packages/ui/src/features/panel-kit/fetch-query/index.ts
- packages/ui/src/features/panel-kit/fetch-query/tanstack.ts
- packages/ui/src/features/panel-kit/helpers/permissions.ts
- packages/ui/src/features/privacy/index.ts
- packages/ui/src/features/resource-dashboard/react/components/resourceRowListProps.ts
- packages/ui/src/features/resource-dashboard/react/components/translatedErrorLabelProps.ts
- packages/ui/src/features/tab-launcher-menu/react/components/TabLauncherActionRow.tsx
- packages/ui/src/features/tab-launcher-menu/react/components/TabLauncherResultRow.tsx
- packages/ui/src/features/tabbed-dialog/react/components/TabbedDialogHeader.tsx
- packages/ui/src/features/viewer-shell/react/components/ImageViewerBody.tsx
- packages/ui/src/features/viewer-shell/react/components/VideoViewerBody.tsx
- packages/ui/src/react/components/OnboardingPanelHeader.tsx
- packages/ui/src/react/components/OptionCards.tsx
- packages/ui/src/react/components/PillButton.tsx
- packages/ui/src/react/components/PopoverItem.tsx
- packages/ui/src/react/components/PopoverMenu.tsx
- packages/ui/src/react/components/StatCard.tsx
- packages/ui/src/react/components/TokenChip.tsx
- packages/ui/src/react/components/ValueChip.tsx
- packages/ui/src/renderers/annotation-canvas/dependencies.ts
- packages/ui/src/renderers/srcdoc/index.ts
- packages/ui/src/utils/platform.ts
- packages/user-management/vitest.config.ts
- packages/vibecoding/vitest.config.ts
- packages/admin/src/agent-plugins/messages.en.ts
- packages/admin/src/consent/react/index.ts
- packages/admin/src/media/messages.en.ts
- packages/admin/src/media/styles.ts
- packages/admin/src/playground/adapters/http.ts
- packages/admin/src/playground/messages.en.ts
- packages/admin/src/playground/react/hooks/PlaygroundPage.hooks.ts
- packages/admin/src/playground/rules.ts
- packages/admin/src/react/bind-react.ts
- packages/admin/src/react/use-controller.ts
- packages/admin/src/security/messages.en.ts
- packages/admin/src/seo/messages.en.ts
- packages/admin/src/source-control/messages.en.ts
- packages/agent-plugins/persistent-state.js
- packages/agent-plugins/src/index.ts
- packages/agent-runtime/src/agent-protocol/core/index.ts
- packages/agent-runtime/src/amr-profile-resolver.ts
- packages/agent-runtime/src/artifact-taxonomy.ts
- packages/agent-runtime/src/prompt-augmenter.ts
- packages/agent-runtime/src/providers/sse-decode.ts
- packages/agent-runtime/src/skills/chat-motion-overlay/assets/remotion-template/src/chatSpec.ts
- packages/agent-runtime/src/telemetry-sink.ts
- packages/artifacts/src/node/index.ts
- packages/chat/src/contracts/chat-bubble-style.ts
- packages/chat/src/core/agentic/chat-capabilities.ts
- packages/chat/src/core/agentic/index.ts
- packages/chat/src/core/conversation-title.ts
- packages/chat/src/core/history-tool-metadata.ts
- packages/chat/src/embed-widget/browser/page-actions.ts
- packages/chat/src/react/chat-pane.ts
- packages/chat/src/react/features/chat-pane/styles.ts
- packages/chat/src/store/contracts/index.ts
- packages/chat/src/store/index.ts
- packages/chat/src/store/legacy/sqlite/schema.ts
- packages/cms/src/comments/express/index.ts
- packages/cms/src/consent/html/styles.ts
- packages/cms/src/core/tools/args.ts
- packages/cms/src/core/tools/index.ts
- packages/cms/src/forms/delivery/types.ts
- packages/cms/src/forms/express/index.ts
- packages/cms/src/forms/types.ts
- packages/cms/src/listing/see-more-script.ts
- packages/cms/src/routing/index.ts
- packages/cms/src/seo/xml-escape.ts
- packages/cms/src/settings/express/index.ts
- packages/cms/src/settings/index.ts
- packages/daemon/src/agent-executor.ts
- packages/daemon/src/read-only-tools.ts
- packages/daemon/src/run/diagnostics/index.ts
- packages/daemon/src/store/agent-sessions/schema.ts
- packages/devops/src/deploy/redirect-guard.ts
- packages/devops/src/deploy/types.ts
- packages/devops/src/static-export/failure-summary.ts
- packages/mcp/src/agent-install/chrome-devtools.ts
- packages/mcp/src/client/index.ts
- packages/oauth/src/messages.ts
- packages/platform/src/messages.ts
- packages/platform/src/net/index.ts
- packages/server/src/storage/index.ts
- packages/ui-kit/src/testing/scenarios.ts
- packages/ui/src/core/theme/default.ts
- packages/ui/src/features/a2ui/protocol.ts
- packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeDragUpload.ts
- packages/ui/src/features/external-mcp/constants.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.ar.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.bn.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.de.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.en.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.es.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.fa.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.fr.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.hi.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.hu.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.id.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.it.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.ja.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.ko.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.pl.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.pt-BR.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.ru.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.th.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.tr.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.uk.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.ur.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.zh-CN.ts
- packages/ui/src/features/i18n/dictionaries/settings-dialog.zh-TW.ts
- packages/ui/src/features/i18n/universal.ts
- packages/ui/src/features/iframe-pool/constants.ts
- packages/ui/src/features/instructions/index.ts
- packages/ui/src/features/language/index.ts
- packages/ui/src/features/mcp-ui/sandbox-proxy-link-forwarder.ts
- packages/ui/src/features/media-providers/constants.ts
- packages/ui/src/features/memory/react/styles.ts
- packages/ui/src/features/observability/ports.ts
- packages/ui/src/features/settings/dialog/react/hooks/useSettingsDialogShell.ts
- packages/ui/src/features/skills/react/components/SkillRow.labels.ts
- packages/ui/src/features/skills/react/components/SkillsTab.labels.ts
- packages/ui/src/features/tab-strip/ports.ts
- packages/ui/src/icon-name.ts
- packages/ui/src/theme/default.ts
- packages/ui/src/theme/stylesheet.ts
- packages/ui/src/theme/types.ts
- packages/ui/src/theme/validation.ts

## Unmatched coverage records


## Coverage records excluded from denominator

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
- /tmp/cov/j-cms-forms/coverage-final.json: /home/user/Jini/packages/cms/forms/src/ports.ts → packages/cms/forms/src/ports.ts
- /tmp/cov/j-cms-forms/coverage-final.json: /home/user/Jini/packages/cms/forms/src/types.ts → packages/cms/forms/src/types.ts
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
- /tmp/cov/j-protocol/coverage-final.json: /home/user/Jini/packages/protocol/src/agent-catalog.ts → packages/protocol/src/agent-catalog.ts
- /tmp/cov/j-protocol/coverage-final.json: /home/user/Jini/packages/protocol/src/common.ts → packages/protocol/src/common.ts
- /tmp/cov/j-protocol/coverage-final.json: /home/user/Jini/packages/protocol/src/event-log.ts → packages/protocol/src/event-log.ts
- /tmp/cov/j-protocol/coverage-final.json: /home/user/Jini/packages/protocol/src/journal.ts → packages/protocol/src/journal.ts
- /tmp/cov/j-protocol/coverage-final.json: /home/user/Jini/packages/protocol/src/json.ts → packages/protocol/src/json.ts
- /tmp/cov/j-registry/coverage-final.json: /home/user/Jini/packages/registry/src/ports.ts → packages/registry/src/ports.ts
- /tmp/cov/j-registry/coverage-final.json: /home/user/Jini/packages/registry/src/tool-catalog/index.ts → packages/registry/src/tool-catalog/index.ts
- /tmp/cov/j-registry/coverage-final.json: /home/user/Jini/packages/registry/src/tool-catalog-builder/ports.ts → packages/registry/src/tool-catalog-builder/ports.ts
- /tmp/cov/j-sidecar/coverage-final.json: /home/user/Jini/packages/sidecar/src/types.ts → packages/sidecar/src/types.ts
- /tmp/cov/j-user-management/coverage-final.json: /home/user/Jini/packages/user-management/src/admin/models.ts → packages/user-management/src/admin/models.ts
- /tmp/cov/j-user-management/coverage-final.json: /home/user/Jini/packages/user-management/src/core/ports.ts → packages/user-management/src/core/ports.ts
- /tmp/cov/j-user-management/coverage-final.json: /home/user/Jini/packages/user-management/src/core/runtime-ports.ts → packages/user-management/src/core/runtime-ports.ts
- /tmp/cov/j-user-management/coverage-final.json: /home/user/Jini/packages/user-management/src/react/models.ts → packages/user-management/src/react/models.ts
- /tmp/cov/j-user-management/coverage-final.json: /home/user/Jini/packages/user-management/src/react/ports.ts → packages/user-management/src/react/ports.ts
- /tmp/cov/j-vibecoding/coverage-final.json: /home/user/Jini/packages/vibecoding/src/core/target.ts → packages/vibecoding/src/core/target.ts
- /tmp/cov/j-vibecoding/coverage-final.json: /home/user/Jini/packages/vibecoding/src/core/types.ts → packages/vibecoding/src/core/types.ts
