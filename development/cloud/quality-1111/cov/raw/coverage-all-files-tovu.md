# All-files coverage

| Metric | TRUE: all files | RUNNER: records only |
| --- | --- | --- |
| lines | 251296/338762 (74.18%) | 251296/319484 (78.66%) |
| branches | 29753/44059 (67.53%) | 29753/30847 (96.45%) |
| functions | 14821/29463 (50.30%) | 14821/24843 (59.66%) |

Never-loaded files: **328** / 3372

- NEVER-LOADED denominators are AST estimates (distinct executable statement start lines, function bodies, branch arms).
- LCOV lacks columns: functions/branches merge by source line and ordinal; different instrumentation layouts may not correspond.
- LOADED means a coverage record exists, including zero-hit include records.
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: skipped malformed LCOV record — LCOV FNH does not match detail records in /home/user/Tovu/apps/website/src/contracts/core/approval-i18n.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: skipped malformed LCOV record — LCOV FNH does not match detail records in /home/user/Tovu/apps/website/src/contracts/core/credential-copy.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: skipped malformed LCOV record — LCOV FNH does not match detail records in /home/user/Tovu/apps/website/src/features/agent-plugins/memory-i18n.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: skipped malformed LCOV record — LCOV FNH does not match detail records in /home/user/Tovu/apps/website/src/server/inbound/public-http/http/site/form-validation-i18n.ts
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: skipped malformed LCOV record — LCOV BRH does not match detail records in /home/user/Tovu/apps/desktop/src/desktop-i18n.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: skipped malformed LCOV record — Invalid LCOV BRDA count: -230

## Exclusions (first matching group)

| Group | Files | Up to 5 examples |
| --- | ---: | --- |
| explicit | 0 |  |
| vendor | 36 | apps/desktop/src/renderer/public/vendor/fonts/dm-sans-OFL.txt, apps/desktop/src/renderer/public/vendor/fonts/dm-sans-variable.ttf, apps/desktop/src/renderer/public/vendor/fonts/jetbrains-mono-OFL.txt, apps/desktop/src/renderer/public/vendor/fonts/jetbrains-mono-variable.ttf, apps/desktop/src/renderer/public/vendor/fonts/space-grotesk-OFL.txt |
| non-source | 6281 | .claude/.ads-initialized, .claude/agents/opus-high.md, .claude/agents/opus-low.md, .claude/agents/opus-medium.md, .claude/agents/sonnet-xhigh.md |
| dependencies/build/output | 0 |  |
| test/fixture | 4699 | apps/admin/__tests__/dev-jini-deps.unit.test.ts, apps/admin/__tests__/dev-jini-prebundle.integration.test.ts, apps/admin/__tests__/dev-proxy-upstream-close.unit.test.ts, apps/admin/__tests__/fixtures/dev-proxy-server.mjs, apps/admin/__tests__/vite-config-api-proxy.unit.test.ts |
| declaration | 4 | apps/admin/src/vite-env.d.ts, apps/desktop/src/renderer/electron-webview.d.ts, apps/site-chat/src/vite-env.d.ts, apps/website/src/server/http/cookie.d.ts |
| generated | 3 | apps/website/src/features/site-inspection/admin-screens.generated.ts, apps/website/src/features/webmcp/generated/annotated-actions-script.ts, apps/website/src/platform/db/content-database.generated.ts |
| type-only | 168 | apps/admin/src/components/MediaPickerDialog/media-picker-port.hooks.ts, apps/admin/src/components/TemplateSource/template-source-port.hooks.ts, apps/admin/src/components/WidgetConfigFields/widget-config-fields-port.hooks.ts, apps/admin/src/components/WidgetPickerDialog/widget-picker-port.hooks.ts, apps/admin/src/features/ai-assistant/hooks/ai-assistant-port.hooks.ts |

## Packages / top-level areas

| Area | Files | Never loaded | Lines | Branches | Functions |
| --- | ---: | ---: | --- | --- | --- |
| (root) | 2 | 1 | 437/459 (95.21%) | 3/9 (33.33%) | 2/11 (18.18%) |
| .claude | 2 | 2 | 0/170 (0.00%) | 0/68 (0.00%) | 0/41 (0.00%) |
| .semgrep | 5 | 5 | 0/77 (0.00%) | 0/0 (100.00%) | 0/19 (0.00%) |
| ADS-memory | 3 | 3 | 0/97 (0.00%) | 0/51 (0.00%) | 0/20 (0.00%) |
| apps/admin | 825 | 6 | 19703/20003 (98.50%) | 15963/16421 (97.21%) | 8502/8687 (97.87%) |
| apps/desktop | 262 | 8 | 37482/38617 (97.06%) | 8364/8729 (95.82%) | 3091/3404 (90.80%) |
| apps/site-chat | 28 | 28 | 0/778 (0.00%) | 0/384 (0.00%) | 0/214 (0.00%) |
| apps/website | 2069 | 106 | 193412/263348 (73.44%) | 5398/7413 (72.82%) | 3214/13572 (23.68%) |
| cloud | 1 | 1 | 0/38 (0.00%) | 0/22 (0.00%) | 0/4 (0.00%) |
| content | 16 | 16 | 0/1238 (0.00%) | 0/606 (0.00%) | 0/257 (0.00%) |
| development | 152 | 145 | 262/13886 (1.89%) | 25/10338 (0.24%) | 12/3226 (0.37%) |
| packages/contracts | 4 | 4 | 0/8 (0.00%) | 0/0 (100.00%) | 0/2 (0.00%) |
| packages/sdk | 2 | 2 | 0/12 (0.00%) | 0/0 (100.00%) | 0/1 (0.00%) |
| scripts | 1 | 1 | 0/31 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |

## Files (largest uncovered line gap first)

| File | Status | Uncovered lines | Lines | Branches | Functions |
| --- | --- | ---: | --- | --- | --- |
| development/scripts/extraction-dossier.mjs | NEVER-LOADED | 1666 | 0/1666 (0.00%) | 0/3604 (0.00%) | 0/529 (0.00%) |
| apps/website/src/server/runtime/composition/deps.ts | LOADED | 1102 | 2026/3128 (64.77%) | 2/2 (100.00%) | 1/38 (2.63%) |
| apps/website/src/server/runtime/composition/app.ts | LOADED | 950 | 1729/2679 (64.54%) | 2/2 (100.00%) | 1/15 (6.67%) |
| apps/website/src/server/inbound/public-http/http/site/render.ts | LOADED | 809 | 2892/3701 (78.14%) | 2/2 (100.00%) | 1/190 (0.53%) |
| development/scripts/test-rigor-inventory.mjs | NEVER-LOADED | 677 | 0/677 (0.00%) | 0/404 (0.00%) | 0/162 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/pages.ts | LOADED | 671 | 2443/3114 (78.45%) | 3/3 (100.00%) | 2/92 (2.17%) |
| apps/desktop/src/main/index.ts | LOADED | 595 | 565/1160 (48.71%) | 1/5 (20.00%) | 0/110 (0.00%) |
| apps/website/src/server/inbound/assistant/agent-daemon-scope.ts | NEVER-LOADED | 589 | 0/589 (0.00%) | 0/274 (0.00%) | 0/130 (0.00%) |
| apps/website/src/features/theme/tool-registrations.ts | LOADED | 478 | 533/1011 (52.72%) | 2/2 (100.00%) | 1/22 (4.55%) |
| development/scripts/mutation-lanes.mjs | NEVER-LOADED | 428 | 0/428 (0.00%) | 0/232 (0.00%) | 0/87 (0.00%) |
| apps/website/src/features/post/post.ts | LOADED | 427 | 2182/2609 (83.63%) | 6/7 (85.71%) | 5/72 (6.94%) |
| development/scripts/measure-site-memory.mjs | NEVER-LOADED | 420 | 0/420 (0.00%) | 0/208 (0.00%) | 0/134 (0.00%) |
| apps/website/src/features/deployments/publish-agent-tools.ts | LOADED | 380 | 812/1192 (68.12%) | 2/2 (100.00%) | 1/31 (3.23%) |
| development/scripts/dev.mjs | NEVER-LOADED | 379 | 0/379 (0.00%) | 0/216 (0.00%) | 0/88 (0.00%) |
| apps/website/src/features/publish-content/apply-loop.ts | LOADED | 373 | 616/989 (62.29%) | 2/2 (100.00%) | 1/13 (7.69%) |
| development/scripts/check-architecture.ts | NEVER-LOADED | 372 | 0/372 (0.00%) | 0/226 (0.00%) | 0/72 (0.00%) |
| apps/website/src/features/post/tool-registrations.ts | LOADED | 368 | 1171/1539 (76.09%) | 2/2 (100.00%) | 1/44 (2.27%) |
| development/scripts/coverage-changed.ts | NEVER-LOADED | 324 | 0/324 (0.00%) | 0/318 (0.00%) | 0/80 (0.00%) |
| apps/website/src/features/external-mcp/tool-registrations.ts | LOADED | 316 | 462/778 (59.38%) | 2/2 (100.00%) | 1/24 (4.17%) |
| apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts | LOADED | 309 | 487/796 (61.18%) | 2/2 (100.00%) | 1/13 (7.69%) |
| development/scripts/build-brand-icons.mjs | NEVER-LOADED | 309 | 0/309 (0.00%) | 0/66 (0.00%) | 0/63 (0.00%) |
| development/scripts/lib/dead-path-sweep.ts | NEVER-LOADED | 308 | 0/308 (0.00%) | 0/222 (0.00%) | 0/63 (0.00%) |
| apps/website/src/features/theme/theme-files.ts | LOADED | 295 | 1052/1347 (78.10%) | 3/3 (100.00%) | 2/46 (4.35%) |
| apps/website/src/features/site-backup/backup-service.ts | LOADED | 293 | 493/786 (62.72%) | 2/2 (100.00%) | 1/35 (2.86%) |
| apps/website/src/features/deployments/publish-credentials/store.ts | LOADED | 291 | 411/702 (58.55%) | 6/6 (100.00%) | 5/56 (8.93%) |
| apps/website/src/features/pages/tool-registrations.ts | LOADED | 291 | 467/758 (61.61%) | 2/2 (100.00%) | 1/22 (4.55%) |
| apps/website/src/features/theme/publish-content.ts | LOADED | 288 | 538/826 (65.13%) | 2/2 (100.00%) | 1/35 (2.86%) |
| apps/website/src/features/theme/theme.ts | LOADED | 288 | 892/1180 (75.59%) | 2/2 (100.00%) | 1/47 (2.13%) |
| apps/website/src/features/newsletter/repo.ts | LOADED | 287 | 346/633 (54.66%) | 8/14 (57.14%) | 7/54 (12.96%) |
| apps/website/src/server/inbound/admin-http/dev-auth.ts | LOADED | 286 | 567/853 (66.47%) | 2/2 (100.00%) | 1/28 (3.57%) |
| apps/website/src/features/newsletter/tool-registrations.ts | LOADED | 281 | 268/549 (48.82%) | 2/2 (100.00%) | 1/14 (7.14%) |
| apps/website/src/server/runtime/composition/modules/assistant-byok.ts | LOADED | 281 | 548/829 (66.10%) | 2/2 (100.00%) | 1/21 (4.76%) |
| apps/website/src/platform/site-dir/local-site-supervisor.ts | LOADED | 273 | 69/342 (20.18%) | 4/6 (66.67%) | 3/17 (17.65%) |
| apps/website/src/features/newsletter/send-pipeline.ts | LOADED | 264 | 350/614 (57.00%) | 2/2 (100.00%) | 1/21 (4.76%) |
| apps/website/src/features/members/write-service.ts | LOADED | 260 | 417/677 (61.60%) | 2/2 (100.00%) | 1/28 (3.57%) |
| apps/website/src/server/inbound/admin-http/routes/themes/explore.ts | LOADED | 254 | 1031/1285 (80.23%) | 2/2 (100.00%) | 1/34 (2.94%) |
| apps/website/src/features/site-backup/sources.ts | LOADED | 253 | 459/712 (64.47%) | 2/2 (100.00%) | 1/36 (2.78%) |
| development/scripts/coverage-changed-model.ts | NEVER-LOADED | 244 | 0/244 (0.00%) | 0/310 (0.00%) | 0/102 (0.00%) |
| apps/website/src/features/members/repo.ts | LOADED | 241 | 353/594 (59.43%) | 9/16 (56.25%) | 8/57 (14.04%) |
| apps/website/src/platform/db/migrations/0012_secrets_vault.ts | LOADED | 239 | 102/341 (29.91%) | 39/54 (72.22%) | 15/37 (40.54%) |
| apps/website/src/features/publish-content/peer-transport.ts | LOADED | 237 | 712/949 (75.03%) | 6/7 (85.71%) | 5/32 (15.63%) |
| development/scripts/check-outbox-bridge.ts | NEVER-LOADED | 236 | 0/236 (0.00%) | 0/130 (0.00%) | 0/18 (0.00%) |
| development/evals/tool-search-parent-tool-read.eval.ts | NEVER-LOADED | 230 | 0/230 (0.00%) | 0/78 (0.00%) | 0/93 (0.00%) |
| apps/website/src/platform/db/repos/media-repo.ts | LOADED | 229 | 489/718 (68.11%) | 7/12 (58.33%) | 6/51 (11.76%) |
| apps/website/src/platform/site-dir/init-site.ts | LOADED | 228 | 236/464 (50.86%) | 16/36 (44.44%) | 14/32 (43.75%) |
| apps/website/src/features/site-backup/share-database/repo.sqlite.ts | LOADED | 227 | 216/443 (48.76%) | 2/2 (100.00%) | 1/28 (3.57%) |
| apps/website/src/features/source-control/store.ts | LOADED | 225 | 326/551 (59.17%) | 6/6 (100.00%) | 5/43 (11.63%) |
| apps/website/src/server/runtime/composition/commerce.ts | LOADED | 224 | 113/337 (33.53%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/forms/tool-registrations.ts | LOADED | 222 | 430/652 (65.95%) | 2/2 (100.00%) | 1/15 (6.67%) |
| apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts | LOADED | 221 | 555/776 (71.52%) | 2/2 (100.00%) | 1/24 (4.17%) |
| apps/website/src/features/theme/static-render.ts | LOADED | 220 | 1172/1392 (84.20%) | 2/2 (100.00%) | 1/47 (2.13%) |
| apps/website/src/server/runtime/composition/modules/assistant.ts | LOADED | 220 | 508/728 (69.78%) | 2/2 (100.00%) | 1/23 (4.35%) |
| apps/website/src/features/settings/repo.ts | LOADED | 218 | 205/423 (48.46%) | 3/4 (75.00%) | 2/30 (6.67%) |
| apps/website/src/server/runtime/composition/modules/site-assistant.ts | LOADED | 217 | 630/847 (74.38%) | 2/2 (100.00%) | 1/21 (4.76%) |
| development/evals/tool-search-argument-fill.eval.ts | NEVER-LOADED | 215 | 0/215 (0.00%) | 0/120 (0.00%) | 0/45 (0.00%) |
| apps/desktop/scripts/verify-find-in-page.ts | NEVER-LOADED | 212 | 0/212 (0.00%) | 0/84 (0.00%) | 0/41 (0.00%) |
| apps/website/src/server/runtime/composition/provider-plugins.ts | LOADED | 212 | 288/500 (57.60%) | 2/2 (100.00%) | 1/16 (6.25%) |
| apps/website/src/server/runtime/composition/tool-catalog-manifest.ts | LOADED | 212 | 464/676 (68.64%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/widgets/tool-registrations.ts | LOADED | 208 | 300/508 (59.06%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts | LOADED | 208 | 209/417 (50.12%) | 2/2 (100.00%) | 1/32 (3.13%) |
| development/scripts/coverage-all-files.ts | NEVER-LOADED | 208 | 0/208 (0.00%) | 0/150 (0.00%) | 0/62 (0.00%) |
| apps/website/src/features/publish-content/peers.ts | LOADED | 206 | 431/637 (67.66%) | 9/10 (90.00%) | 8/48 (16.67%) |
| apps/website/src/platform/db/sqlite/fresh-content-db.ts | LOADED | 203 | 54/257 (21.01%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/platform/db/schema.postgres.ts | LOADED | 202 | 1038/1240 (83.71%) | 3/3 (100.00%) | 2/76 (2.63%) |
| apps/website/src/features/publish-content/tool-registrations.ts | LOADED | 198 | 291/489 (59.51%) | 2/2 (100.00%) | 1/18 (5.56%) |
| apps/website/src/platform/site-dir/site-registry.ts | LOADED | 198 | 368/566 (65.02%) | 3/3 (100.00%) | 2/42 (4.76%) |
| development/scripts/dev-desktop.mjs | NEVER-LOADED | 197 | 0/197 (0.00%) | 0/120 (0.00%) | 0/39 (0.00%) |
| apps/website/src/features/comments/tool-registrations.ts | LOADED | 190 | 195/385 (50.65%) | 2/2 (100.00%) | 1/9 (11.11%) |
| development/scripts/generate-postgres-schema.ts | NEVER-LOADED | 190 | 0/190 (0.00%) | 0/108 (0.00%) | 0/52 (0.00%) |
| apps/website/src/server/runtime/composition/peer-site-reads.ts | LOADED | 188 | 273/461 (59.22%) | 3/4 (75.00%) | 2/11 (18.18%) |
| development/evals/tool-search-distractors.ts | NEVER-LOADED | 188 | 0/188 (0.00%) | 0/101 (0.00%) | 0/57 (0.00%) |
| apps/website/src/features/taxonomy/tool-registrations.ts | LOADED | 182 | 262/444 (59.01%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/platform/db/schema.sqlite.ts | LOADED | 182 | 2215/2397 (92.41%) | 74/74 (100.00%) | 73/159 (45.91%) |
| development/scripts/mutation-sweep.mjs | NEVER-LOADED | 179 | 0/179 (0.00%) | 0/126 (0.00%) | 0/33 (0.00%) |
| development/scripts/write-path-inventory.ts | NEVER-LOADED | 178 | 0/178 (0.00%) | 0/136 (0.00%) | 0/39 (0.00%) |
| apps/website/src/assistant/byok-tool-surface.ts | LOADED | 177 | 648/825 (78.55%) | 3/3 (100.00%) | 2/13 (15.38%) |
| apps/desktop/scripts/verify-site-power.ts | NEVER-LOADED | 175 | 0/175 (0.00%) | 0/68 (0.00%) | 0/38 (0.00%) |
| apps/website/src/assistant/ask-choice-tool.ts | LOADED | 173 | 382/555 (68.83%) | 3/3 (100.00%) | 2/18 (11.11%) |
| apps/website/src/server/runtime/composition/vault-boot.ts | LOADED | 173 | 190/363 (52.34%) | 3/4 (75.00%) | 2/24 (8.33%) |
| apps/website/src/features/agent-plugins/install-upload.ts | LOADED | 172 | 211/383 (55.09%) | 3/4 (75.00%) | 2/18 (11.11%) |
| development/evals/tool-search-parent-tool-delete.eval.ts | NEVER-LOADED | 172 | 0/172 (0.00%) | 0/50 (0.00%) | 0/63 (0.00%) |
| development/scripts/theme-tool.ts | NEVER-LOADED | 172 | 0/172 (0.00%) | 0/104 (0.00%) | 0/29 (0.00%) |
| apps/website/src/features/taxonomy/repo.ts | LOADED | 171 | 384/555 (69.19%) | 6/10 (60.00%) | 5/48 (10.42%) |
| apps/website/src/features/webhooks/tool-registrations.ts | LOADED | 171 | 205/376 (54.52%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/identity/repo.ts | LOADED | 170 | 540/710 (76.06%) | 97/105 (92.38%) | 93/117 (79.49%) |
| apps/website/src/features/domain-dns/dns-changes.ts | LOADED | 167 | 211/378 (55.82%) | 2/2 (100.00%) | 1/30 (3.33%) |
| apps/website/src/features/identity/api-key-service.ts | LOADED | 167 | 304/471 (64.54%) | 2/2 (100.00%) | 1/14 (7.14%) |
| apps/website/src/features/theme/duplicate-theme.ts | LOADED | 167 | 253/420 (60.24%) | 3/4 (75.00%) | 2/18 (11.11%) |
| apps/website/src/platform/db/vault-credential-inventory.ts | LOADED | 167 | 121/288 (42.01%) | 4/6 (66.67%) | 3/47 (6.38%) |
| apps/website/src/cli/commands/owner-store.ts | LOADED | 164 | 210/374 (56.15%) | 7/7 (100.00%) | 6/33 (18.18%) |
| development/scripts/coverage-changed-discovery.ts | NEVER-LOADED | 164 | 0/164 (0.00%) | 0/164 (0.00%) | 0/45 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts | LOADED | 163 | 308/471 (65.39%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/recovery/tool-registrations.ts | LOADED | 160 | 254/414 (61.35%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/server/inbound/admin-http/routes/system/site-key.ts | LOADED | 159 | 460/619 (74.31%) | 2/2 (100.00%) | 1/22 (4.55%) |
| .claude/skills/tovu-demo-video/scripts/take-example.mjs | NEVER-LOADED | 158 | 0/158 (0.00%) | 0/66 (0.00%) | 0/40 (0.00%) |
| content/themes/__original-themes__/static/tovu-starter/scripts/main.js | NEVER-LOADED | 158 | 0/158 (0.00%) | 0/80 (0.00%) | 0/26 (0.00%) |
| content/themes/__original-themes__/static/tovu-theme/scripts/main.js | NEVER-LOADED | 158 | 0/158 (0.00%) | 0/80 (0.00%) | 0/26 (0.00%) |
| content/themes/static/tovu-starter/scripts/main.js | NEVER-LOADED | 158 | 0/158 (0.00%) | 0/80 (0.00%) | 0/26 (0.00%) |
| content/themes/static/tovu-theme/scripts/main.js | NEVER-LOADED | 158 | 0/158 (0.00%) | 0/80 (0.00%) | 0/26 (0.00%) |
| apps/website/src/features/site-backup/static-download-layout.ts | LOADED | 155 | 151/306 (49.35%) | 2/2 (100.00%) | 1/24 (4.17%) |
| apps/website/src/platform/db/repos/webhook-repo.ts | LOADED | 155 | 225/380 (59.21%) | 4/6 (66.67%) | 3/27 (11.11%) |
| development/scripts/check-coverage-integrity.ts | NEVER-LOADED | 155 | 0/155 (0.00%) | 0/86 (0.00%) | 0/32 (0.00%) |
| apps/website/src/features/members/repo.rows.ts | LOADED | 149 | 152/301 (50.50%) | 2/2 (100.00%) | 1/17 (5.88%) |
| apps/website/src/features/web-screenshot/web-screenshot.ts | LOADED | 149 | 240/389 (61.70%) | 3/4 (75.00%) | 2/22 (9.09%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/backstop.ts | LOADED | 149 | 131/280 (46.79%) | 2/2 (100.00%) | 1/16 (6.25%) |
| apps/website/src/server/runtime/composition/permanent-delete-deps.ts | LOADED | 149 | 109/258 (42.25%) | 2/2 (100.00%) | 1/10 (10.00%) |
| development/scripts/check-jini-registry-drift.mjs | NEVER-LOADED | 149 | 0/149 (0.00%) | 0/68 (0.00%) | 0/23 (0.00%) |
| apps/website/src/features/deployments/static-publish/adapter.ts | LOADED | 148 | 514/662 (77.64%) | 2/2 (100.00%) | 1/25 (4.00%) |
| apps/website/src/features/webhooks/site-key-ensure.ts | LOADED | 146 | 661/807 (81.91%) | 2/2 (100.00%) | 1/32 (3.13%) |
| apps/website/src/features/external-mcp/external-mcp-repo.ts | LOADED | 145 | 115/260 (44.23%) | 3/4 (75.00%) | 2/17 (11.76%) |
| apps/website/src/features/newsletter/repo.rows.ts | LOADED | 145 | 220/365 (60.27%) | 2/2 (100.00%) | 1/19 (5.26%) |
| apps/website/src/index.ts | NEVER-LOADED | 145 | 0/145 (0.00%) | 0/50 (0.00%) | 0/31 (0.00%) |
| apps/website/src/features/post/publish-content.ts | LOADED | 143 | 434/577 (75.22%) | 3/3 (100.00%) | 2/18 (11.11%) |
| apps/website/src/platform/site-dir/duplicate-site.ts | LOADED | 143 | 189/332 (56.93%) | 3/3 (100.00%) | 2/14 (14.29%) |
| apps/website/src/assistant/content-read-tool.ts | LOADED | 142 | 557/699 (79.69%) | 9/9 (100.00%) | 6/27 (22.22%) |
| apps/website/src/features/theme/validation/manifest-v2.ts | LOADED | 142 | 406/548 (74.09%) | 2/2 (100.00%) | 1/24 (4.17%) |
| development/cloud/quality-1111/cov/scripts/test-quality.mjs | NEVER-LOADED | 139 | 0/139 (0.00%) | 0/184 (0.00%) | 0/20 (0.00%) |
| development/scripts/check-openapi-contract.ts | NEVER-LOADED | 139 | 0/139 (0.00%) | 0/62 (0.00%) | 0/21 (0.00%) |
| apps/website/src/features/publish-content/raw-row-contributor.ts | LOADED | 137 | 95/232 (40.95%) | 2/2 (100.00%) | 1/15 (6.67%) |
| apps/website/src/features/source-control/tool-registrations.ts | LOADED | 137 | 382/519 (73.60%) | 2/2 (100.00%) | 1/17 (5.88%) |
| apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts | LOADED | 137 | 626/763 (82.04%) | 2/2 (100.00%) | 1/26 (3.85%) |
| apps/website/src/features/members/repo.memory.ts | LOADED | 136 | 375/511 (73.39%) | 9/16 (56.25%) | 8/58 (13.79%) |
| apps/website/src/features/newsletter/campaign-write-service.ts | LOADED | 136 | 109/245 (44.49%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/seo/settings.ts | LOADED | 136 | 273/409 (66.75%) | 2/2 (100.00%) | 1/24 (4.17%) |
| apps/website/src/features/trash/adapters/directory.ts | LOADED | 136 | 117/253 (46.25%) | 2/2 (100.00%) | 1/14 (7.14%) |
| apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts | LOADED | 136 | 533/669 (79.67%) | 2/2 (100.00%) | 1/42 (2.38%) |
| development/evals/tool-search-doc2query-adoption.eval.ts | NEVER-LOADED | 136 | 0/136 (0.00%) | 0/42 (0.00%) | 0/41 (0.00%) |
| apps/website/src/features/identity/tool-registrations.ts | LOADED | 134 | 133/267 (49.81%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/media-import/tool-registrations.ts | LOADED | 133 | 274/407 (67.32%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/trash/trash-item-tool.ts | LOADED | 133 | 384/517 (74.27%) | 2/2 (100.00%) | 1/15 (6.67%) |
| apps/website/src/platform/db/sqlite/database-journal-repo.ts | LOADED | 133 | 266/399 (66.67%) | 5/8 (62.50%) | 4/23 (17.39%) |
| apps/website/src/server/runtime/composition/product-telemetry.ts | LOADED | 133 | 133/266 (50.00%) | 11/13 (84.62%) | 5/31 (16.13%) |
| apps/website/src/server/runtime/lifecycle/local-site-process.ts | LOADED | 133 | 118/251 (47.01%) | 2/2 (100.00%) | 1/6 (16.67%) |
| development/scripts/split-chat-data-into-chat-db.ts | NEVER-LOADED | 133 | 0/133 (0.00%) | 0/38 (0.00%) | 0/33 (0.00%) |
| apps/website/src/features/email-templates/operations.ts | LOADED | 132 | 193/325 (59.38%) | 5/5 (100.00%) | 4/26 (15.38%) |
| development/scripts/seed-site.mjs | NEVER-LOADED | 132 | 0/132 (0.00%) | 0/40 (0.00%) | 0/29 (0.00%) |
| apps/website/src/assistant/tool-registrations.ts | LOADED | 131 | 414/545 (75.96%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/cli/commands/serve.ts | LOADED | 131 | 363/494 (73.48%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/server/runtime/boot/bootstrap.ts | LOADED | 131 | 264/395 (66.84%) | 2/2 (100.00%) | 1/14 (7.14%) |
| development/evals/tool-search-fat-concat-arm.eval.ts | NEVER-LOADED | 130 | 0/130 (0.00%) | 0/54 (0.00%) | 0/59 (0.00%) |
| apps/website/src/features/site-backup/import-verifier-inventory.ts | LOADED | 127 | 136/263 (51.71%) | 2/2 (100.00%) | 1/22 (4.55%) |
| apps/website/src/features/site-search/index-state-store.ts | LOADED | 127 | 125/252 (49.60%) | 2/2 (100.00%) | 1/8 (12.50%) |
| development/scripts/agent-run-probe.mjs | NEVER-LOADED | 127 | 0/127 (0.00%) | 0/76 (0.00%) | 0/15 (0.00%) |
| development/scripts/migrate-page-embed-markers.ts | NEVER-LOADED | 127 | 0/127 (0.00%) | 0/56 (0.00%) | 0/25 (0.00%) |
| apps/website/src/features/newsletter/repo.memory.ts | LOADED | 126 | 228/354 (64.41%) | 8/14 (57.14%) | 7/53 (13.21%) |
| apps/website/src/server/runtime/composition/modules/site-search.ts | LOADED | 126 | 334/460 (72.61%) | 2/2 (100.00%) | 1/14 (7.14%) |
| apps/website/src/features/redirects/tool-registrations.ts | LOADED | 125 | 157/282 (55.67%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/custom-credentials/tool-registrations.ts | LOADED | 124 | 374/498 (75.10%) | 2/2 (100.00%) | 1/14 (7.14%) |
| apps/website/src/features/trash/table-adapter.ts | LOADED | 124 | 236/360 (65.56%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/sites.ts | LOADED | 124 | 337/461 (73.10%) | 2/2 (100.00%) | 1/9 (11.11%) |
| development/eslint-rules/effect-resource-cleanup.mjs | LOADED | 124 | 66/190 (34.74%) | 1/1 (100.00%) | 0/6 (0.00%) |
| apps/website/src/features/publish-content/raw-file-contributor.ts | LOADED | 123 | 95/218 (43.58%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts | LOADED | 123 | 142/265 (53.58%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/api-connections/vault-stores.ts | LOADED | 122 | 131/253 (51.78%) | 2/2 (100.00%) | 1/18 (5.56%) |
| apps/website/src/features/publish-content/publish-tool.ts | LOADED | 122 | 71/193 (36.79%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/site-backup/share-backend.ts | LOADED | 122 | 119/241 (49.38%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/features/sites/tool-registrations.ts | LOADED | 122 | 187/309 (60.52%) | 7/8 (87.50%) | 6/20 (30.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/import.ts | LOADED | 122 | 180/302 (59.60%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/site-chat/src/site-assistant-transport.ts | NEVER-LOADED | 120 | 0/120 (0.00%) | 0/66 (0.00%) | 0/22 (0.00%) |
| apps/website/src/features/member-login/oidc-login.ts | LOADED | 120 | 127/247 (51.42%) | 2/2 (100.00%) | 1/18 (5.56%) |
| apps/website/src/features/members/tool-registrations.ts | LOADED | 120 | 200/320 (62.50%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/site-export/export-html-policy.ts | LOADED | 116 | 128/244 (52.46%) | 2/2 (100.00%) | 1/21 (4.76%) |
| apps/website/src/server/runtime/composition/vault-legacy-codecs.ts | LOADED | 116 | 439/555 (79.10%) | 2/2 (100.00%) | 1/31 (3.23%) |
| apps/website/src/features/agent-plugins/host-plugin-guidance.ts | LOADED | 114 | 144/258 (55.81%) | 3/3 (100.00%) | 2/28 (7.14%) |
| apps/website/src/features/external-mcp/save-form.ts | LOADED | 114 | 194/308 (62.99%) | 2/2 (100.00%) | 1/13 (7.69%) |
| apps/website/src/features/comments/settings.ts | LOADED | 113 | 173/286 (60.49%) | 3/3 (100.00%) | 2/34 (5.88%) |
| apps/website/src/server/runtime/composition/modules/assistant-tool-exec.ts | LOADED | 113 | 186/299 (62.21%) | 2/2 (100.00%) | 1/14 (7.14%) |
| apps/website/src/features/media/publish-content.ts | LOADED | 112 | 171/283 (60.42%) | 4/5 (80.00%) | 3/13 (23.08%) |
| apps/website/src/features/navigation/repo.ts | LOADED | 112 | 220/332 (66.27%) | 4/6 (66.67%) | 3/28 (10.71%) |
| development/evals/tool-search-caller2-compliance-harness.ts | NEVER-LOADED | 112 | 0/112 (0.00%) | 0/26 (0.00%) | 0/17 (0.00%) |
| apps/website/src/features/publish-content/planner.ts | LOADED | 111 | 481/592 (81.25%) | 2/2 (100.00%) | 1/15 (6.67%) |
| apps/website/src/platform/site-dir/repair-site.ts | LOADED | 111 | 216/327 (66.06%) | 4/6 (66.67%) | 3/21 (14.29%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/agent-tools.ts | LOADED | 111 | 207/318 (65.09%) | 2/2 (100.00%) | 1/15 (6.67%) |
| development/scripts/check-idle-motion.ts | NEVER-LOADED | 111 | 0/111 (0.00%) | 0/68 (0.00%) | 0/13 (0.00%) |
| apps/website/src/features/media/provider-credential-store.ts | LOADED | 110 | 231/341 (67.74%) | 5/5 (100.00%) | 4/19 (21.05%) |
| apps/website/src/server/inbound/public-http/routes/commerce/purchase.ts | LOADED | 110 | 82/192 (42.71%) | 2/2 (100.00%) | 1/14 (7.14%) |
| apps/website/src/features/identity/delete-user-service.ts | LOADED | 109 | 246/355 (69.30%) | 5/5 (100.00%) | 4/14 (28.57%) |
| apps/website/src/features/publish-trust/provisioning.ts | LOADED | 109 | 453/562 (80.60%) | 2/2 (100.00%) | 1/17 (5.88%) |
| apps/website/src/features/settings/site-title.ts | LOADED | 108 | 172/280 (61.43%) | 4/6 (66.67%) | 3/29 (10.34%) |
| apps/website/src/features/consent/service.ts | LOADED | 107 | 99/206 (48.06%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/widgets/publish-content.ts | LOADED | 107 | 132/239 (55.23%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/platform/db/migrations/legacy-sqlite.ts | LOADED | 107 | 93/200 (46.50%) | 22/31 (70.97%) | 16/32 (50.00%) |
| development/scripts/lib/route-tool-parity.ts | NEVER-LOADED | 106 | 0/106 (0.00%) | 0/98 (0.00%) | 0/33 (0.00%) |
| apps/website/src/features/settings/form-delivery.ts | LOADED | 105 | 100/205 (48.78%) | 3/3 (100.00%) | 2/32 (6.25%) |
| apps/website/src/features/theme/build-conformance.ts | LOADED | 105 | 469/574 (81.71%) | 3/3 (100.00%) | 2/16 (12.50%) |
| apps/website/src/platform/db/repos/form-delivery-repo.ts | LOADED | 105 | 161/266 (60.53%) | 4/6 (66.67%) | 3/22 (13.64%) |
| apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts | LOADED | 105 | 125/230 (54.35%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/media/import-media-entity.ts | LOADED | 104 | 338/442 (76.47%) | 2/2 (100.00%) | 1/12 (8.33%) |
| apps/website/src/features/publish-content/repo-handler.ts | LOADED | 104 | 244/348 (70.11%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/runtime/composition/other-site-keys.ts | LOADED | 103 | 106/209 (50.72%) | 2/2 (100.00%) | 1/14 (7.14%) |
| development/evals/tool-search-scaling-curve.eval.ts | NEVER-LOADED | 103 | 0/103 (0.00%) | 0/30 (0.00%) | 0/43 (0.00%) |
| apps/website/src/contracts/core/human-confirm.ts | LOADED | 102 | 209/311 (67.20%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/server/runtime/composition/project-store.ts | LOADED | 102 | 168/270 (62.22%) | 2/2 (100.00%) | 1/14 (7.14%) |
| development/evals/tool-search-argument-fill-fixture.ts | NEVER-LOADED | 102 | 0/102 (0.00%) | 0/40 (0.00%) | 0/48 (0.00%) |
| apps/website/src/features/email-templates/render.ts | LOADED | 101 | 223/324 (68.83%) | 2/2 (100.00%) | 1/27 (3.70%) |
| apps/website/src/features/navigation/publish-content.ts | LOADED | 101 | 233/334 (69.76%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/post/repo.ts | LOADED | 101 | 257/358 (71.79%) | 3/4 (75.00%) | 2/21 (9.52%) |
| apps/website/src/server/runtime/composition/modules/assistant-chats.ts | LOADED | 101 | 177/278 (63.67%) | 2/2 (100.00%) | 1/5 (20.00%) |
| development/evals/tool-search-canary-significance.eval.ts | NEVER-LOADED | 101 | 0/101 (0.00%) | 0/58 (0.00%) | 0/23 (0.00%) |
| apps/website/src/features/plugin-runtime/built-ins/content-analyzer/analyze-content.ts | NEVER-LOADED | 100 | 0/100 (0.00%) | 0/48 (0.00%) | 0/24 (0.00%) |
| apps/website/src/server/inbound/assistant/agent-daemon-server.ts | NEVER-LOADED | 100 | 0/100 (0.00%) | 0/48 (0.00%) | 0/28 (0.00%) |
| development/scripts/check-governance-adr-scope-drift.ts | NEVER-LOADED | 100 | 0/100 (0.00%) | 0/50 (0.00%) | 0/19 (0.00%) |
| apps/website/src/features/agent-plugins/uninstall-tool.ts | LOADED | 99 | 169/268 (63.06%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/mail-status/activity.ts | LOADED | 99 | 122/221 (55.20%) | 4/5 (80.00%) | 3/21 (14.29%) |
| apps/website/src/server/runtime/composition/form-submissions.ts | LOADED | 99 | 165/264 (62.50%) | 2/2 (100.00%) | 1/16 (6.25%) |
| development/scripts/check-embed-marker-drift.ts | NEVER-LOADED | 99 | 0/99 (0.00%) | 0/42 (0.00%) | 0/15 (0.00%) |
| apps/website/src/features/members/password-auth.ts | LOADED | 98 | 106/204 (51.96%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/server/inbound/admin-http/routes/recovery/restore.ts | LOADED | 98 | 151/249 (60.64%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/agent-plugins/automatic-agent-plugins.ts | LOADED | 97 | 113/210 (53.81%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/publish-content/file-tree-policy.ts | LOADED | 97 | 402/499 (80.56%) | 2/2 (100.00%) | 1/21 (4.76%) |
| apps/website/src/features/site-backup/import-backend.ts | LOADED | 97 | 96/193 (49.74%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/system/site-shares.ts | LOADED | 97 | 49/146 (33.56%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/mail/activity.repo.ts | LOADED | 96 | 98/194 (50.52%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/features/agent-plugins/install-tool.ts | LOADED | 95 | 150/245 (61.22%) | 2/2 (100.00%) | 1/14 (7.14%) |
| apps/website/src/features/trash/repo.ts | LOADED | 95 | 137/232 (59.05%) | 3/4 (75.00%) | 2/13 (15.38%) |
| apps/website/src/server/runtime/composition/import-database/repo.sqlite.ts | NEVER-LOADED | 95 | 0/95 (0.00%) | 0/52 (0.00%) | 0/26 (0.00%) |
| apps/site-chat/scripts/check-bundle-mounts.mjs | NEVER-LOADED | 94 | 0/94 (0.00%) | 0/48 (0.00%) | 0/29 (0.00%) |
| apps/website/src/platform/site-dir/key-only-site-meta.ts | LOADED | 94 | 146/240 (60.83%) | 3/3 (100.00%) | 2/30 (6.67%) |
| apps/website/src/platform/site-dir/site-trash.ts | LOADED | 94 | 56/150 (37.33%) | 3/3 (100.00%) | 2/28 (7.14%) |
| apps/website/src/features/sites/site-admin.ts | LOADED | 93 | 244/337 (72.40%) | 2/2 (100.00%) | 1/11 (9.09%) |
| development/scripts/measure-idle-cpu.mjs | NEVER-LOADED | 93 | 0/93 (0.00%) | 0/42 (0.00%) | 0/23 (0.00%) |
| apps/website/src/features/agent-plugins/exports/runtime.ts | LOADED | 92 | 116/208 (55.77%) | 2/2 (100.00%) | 1/13 (7.69%) |
| apps/website/src/features/domain-dns/mail-dns-status.ts | LOADED | 92 | 199/291 (68.38%) | 2/2 (100.00%) | 1/19 (5.26%) |
| apps/website/src/features/newsletter/delivery/tool-registrations.ts | LOADED | 92 | 111/203 (54.68%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/site-backup/import-keep-off.ts | LOADED | 92 | 69/161 (42.86%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/web-screenshot/playwright-page-capture.ts | LOADED | 92 | 132/224 (58.93%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/peer-transport.ts | LOADED | 92 | 254/346 (73.41%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/server/inbound/admin-http/routes/system/site-imports.ts | LOADED | 92 | 44/136 (32.35%) | 2/2 (100.00%) | 1/3 (33.33%) |
| development/scripts/codex-jini-rebuild.mjs | NEVER-LOADED | 92 | 0/92 (0.00%) | 0/66 (0.00%) | 0/16 (0.00%) |
| apps/website/src/features/publish-content/publish-backstop-file.ts | LOADED | 91 | 62/153 (40.52%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/assistant/agents.ts | LOADED | 90 | 189/279 (67.74%) | 2/2 (100.00%) | 1/13 (7.69%) |
| apps/website/src/features/deployments/static-publish/credentials.ts | LOADED | 90 | 253/343 (73.76%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/server/runtime/composition/modules/assistant-daemon-client.ts | LOADED | 90 | 290/380 (76.32%) | 2/2 (100.00%) | 1/21 (4.76%) |
| development/scripts/check-theme-replaced-elements.ts | NEVER-LOADED | 90 | 0/90 (0.00%) | 0/44 (0.00%) | 0/21 (0.00%) |
| development/scripts/report-churn-hotspots.ts | NEVER-LOADED | 90 | 0/90 (0.00%) | 0/54 (0.00%) | 0/12 (0.00%) |
| apps/website/src/cli/commands/import-local.ts | NEVER-LOADED | 89 | 0/89 (0.00%) | 0/62 (0.00%) | 0/18 (0.00%) |
| apps/website/src/features/post/cover-image.ts | LOADED | 89 | 171/260 (65.77%) | 2/2 (100.00%) | 1/21 (4.76%) |
| apps/website/src/features/source-control/commit-site.ts | LOADED | 89 | 450/539 (83.49%) | 2/2 (100.00%) | 1/11 (9.09%) |
| development/evals/tool-search-all-approaches-v2.eval.ts | NEVER-LOADED | 89 | 0/89 (0.00%) | 0/36 (0.00%) | 0/23 (0.00%) |
| development/scripts/check-openapi-secret-leaks.ts | NEVER-LOADED | 89 | 0/89 (0.00%) | 0/30 (0.00%) | 0/13 (0.00%) |
| apps/website/src/contracts/core/entry-refs/extractor.ts | LOADED | 88 | 326/414 (78.74%) | 2/2 (100.00%) | 1/14 (7.14%) |
| apps/website/src/server/inbound/admin-http/routes/database/migrate-forward.ts | LOADED | 88 | 92/180 (51.11%) | 2/2 (100.00%) | 1/3 (33.33%) |
| content/themes/__original-themes__/static/tovu-starter/scripts/docs-toc.js | NEVER-LOADED | 88 | 0/88 (0.00%) | 0/36 (0.00%) | 0/20 (0.00%) |
| content/themes/__original-themes__/static/tovu-theme/scripts/docs-toc.js | NEVER-LOADED | 88 | 0/88 (0.00%) | 0/36 (0.00%) | 0/20 (0.00%) |
| content/themes/static/tovu-starter/scripts/docs-toc.js | NEVER-LOADED | 88 | 0/88 (0.00%) | 0/36 (0.00%) | 0/20 (0.00%) |
| content/themes/static/tovu-theme/scripts/docs-toc.js | NEVER-LOADED | 88 | 0/88 (0.00%) | 0/36 (0.00%) | 0/20 (0.00%) |
| apps/website/src/features/mail-status/test-send.ts | NEVER-LOADED | 87 | 0/87 (0.00%) | 0/82 (0.00%) | 0/13 (0.00%) |
| apps/website/src/features/site-inspection/published-page.ts | LOADED | 87 | 447/534 (83.71%) | 3/3 (100.00%) | 2/15 (13.33%) |
| apps/website/src/features/source-control/credential-setup.ts | LOADED | 87 | 126/213 (59.15%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/trash/adapters/user.ts | LOADED | 86 | 142/228 (62.28%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts | LOADED | 86 | 283/369 (76.69%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/media-generation/tool-registrations.ts | LOADED | 85 | 349/434 (80.41%) | 3/3 (100.00%) | 2/10 (20.00%) |
| apps/website/src/features/media/view-video-tool.ts | LOADED | 85 | 129/214 (60.28%) | 2/2 (100.00%) | 1/21 (4.76%) |
| apps/website/src/features/publish-content/export-bundle.ts | LOADED | 85 | 259/344 (75.29%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/settings/site-title-write.ts | LOADED | 85 | 116/201 (57.71%) | 3/3 (100.00%) | 2/24 (8.33%) |
| apps/website/src/features/site-inspection/live-url.ts | LOADED | 85 | 98/183 (53.55%) | 2/2 (100.00%) | 1/13 (7.69%) |
| apps/website/src/features/webhooks/secret-scan-guard.ts | LOADED | 85 | 375/460 (81.52%) | 2/3 (66.67%) | 1/19 (5.26%) |
| apps/website/src/platform/db/migration/manifest.ts | LOADED | 85 | 865/950 (91.05%) | 3/4 (75.00%) | 2/22 (9.09%) |
| development/scripts/check-hardwiring.mjs | NEVER-LOADED | 85 | 0/85 (0.00%) | 0/62 (0.00%) | 0/18 (0.00%) |
| apps/website/src/features/pages/html-document-store.ts | LOADED | 84 | 529/613 (86.30%) | 6/7 (85.71%) | 5/18 (27.78%) |
| apps/website/src/features/source-control/provider-registry.ts | LOADED | 84 | 230/314 (73.25%) | 2/2 (100.00%) | 1/22 (4.55%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/destination.ts | LOADED | 84 | 199/283 (70.32%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/assistant/agent-daemon-site-tools.ts | NEVER-LOADED | 84 | 0/84 (0.00%) | 0/42 (0.00%) | 0/26 (0.00%) |
| apps/website/src/server/runtime/composition/provider-config-source.ts | LOADED | 83 | 137/220 (62.27%) | 4/5 (80.00%) | 3/12 (25.00%) |
| apps/website/src/features/fs-files/tool-registrations.ts | LOADED | 82 | 140/222 (63.06%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/features/post/reverters.ts | LOADED | 82 | 256/338 (75.74%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/trash/agent-tools.ts | LOADED | 82 | 77/159 (48.43%) | 2/2 (100.00%) | 1/6 (16.67%) |
| development/evals/tool-search-heldout-v2.eval.ts | NEVER-LOADED | 82 | 0/82 (0.00%) | 0/36 (0.00%) | 0/26 (0.00%) |
| apps/website/src/features/members/consent-service.ts | LOADED | 81 | 180/261 (68.97%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/site-backup/static-copy.ts | LOADED | 81 | 88/169 (52.07%) | 2/2 (100.00%) | 1/14 (7.14%) |
| apps/website/src/server/inbound/admin-http/routes/plugins/set-enabled.ts | LOADED | 80 | 119/199 (59.80%) | 2/2 (100.00%) | 1/5 (20.00%) |
| development/scripts/check-menu-href-allowlist-sync.ts | NEVER-LOADED | 80 | 0/80 (0.00%) | 0/26 (0.00%) | 0/11 (0.00%) |
| development/scripts/deploy-html-snapshot.mjs | NEVER-LOADED | 80 | 0/80 (0.00%) | 0/44 (0.00%) | 0/10 (0.00%) |
| apps/website/src/features/api-connections/shared-api.ts | LOADED | 79 | 44/123 (35.77%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/media-generation/providers-tools.ts | LOADED | 79 | 118/197 (59.90%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/publish-trust/handshake-client.ts | LOADED | 79 | 265/344 (77.03%) | 3/4 (75.00%) | 2/15 (13.33%) |
| apps/website/src/features/site-backup/import-backend-steps.ts | LOADED | 79 | 90/169 (53.25%) | 2/2 (100.00%) | 1/18 (5.56%) |
| apps/website/src/features/deployments/static-publish/domain-publish-tool.ts | LOADED | 78 | 45/123 (36.59%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/webhooks/repo.memory.ts | LOADED | 78 | 201/279 (72.04%) | 5/8 (62.50%) | 4/26 (15.38%) |
| apps/website/src/platform/site-dir/local-admin-bundle.ts | LOADED | 78 | 101/179 (56.42%) | 2/2 (100.00%) | 1/8 (12.50%) |
| development/scripts/args-object-audit.mjs | NEVER-LOADED | 78 | 0/78 (0.00%) | 0/108 (0.00%) | 0/21 (0.00%) |
| apps/website/src/features/theme/migration/migrate-theme.ts | LOADED | 77 | 299/376 (79.52%) | 2/2 (100.00%) | 1/16 (6.25%) |
| apps/website/src/features/theme/validation/webmcp-markup.ts | LOADED | 77 | 117/194 (60.31%) | 2/2 (100.00%) | 1/26 (3.85%) |
| apps/website/src/server/inbound/admin-http/routes/posts/template-preview-render.ts | LOADED | 77 | 135/212 (63.68%) | 3/4 (75.00%) | 2/8 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts | LOADED | 77 | 88/165 (53.33%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/public-http/http/site/form-render.ts | LOADED | 77 | 709/786 (90.20%) | 2/2 (100.00%) | 1/27 (3.70%) |
| development/scripts/stage-selected-agent-plugin-assets.ts | NEVER-LOADED | 77 | 0/77 (0.00%) | 0/46 (0.00%) | 0/15 (0.00%) |
| apps/website/src/features/custom-credentials/provider-settings-card.ts | LOADED | 76 | 113/189 (59.79%) | 3/3 (100.00%) | 2/15 (13.33%) |
| apps/website/src/features/media/tool-registrations.ts | LOADED | 76 | 187/263 (71.10%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/publish-trust/revocations.ts | LOADED | 76 | 215/291 (73.88%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/features/webhooks/keyring.env.ts | LOADED | 76 | 401/477 (84.07%) | 6/9 (66.67%) | 5/39 (12.82%) |
| apps/website/src/server/inbound/public-http/routes/site/chat-comparison-html.ts | LOADED | 75 | 10/85 (11.76%) | 2/2 (100.00%) | 1/3 (33.33%) |
| development/scripts/check-admin-api-routes.ts | NEVER-LOADED | 75 | 0/75 (0.00%) | 0/44 (0.00%) | 0/5 (0.00%) |
| apps/site-chat/src/visitor-page-control.ts | NEVER-LOADED | 74 | 0/74 (0.00%) | 0/50 (0.00%) | 0/32 (0.00%) |
| apps/website/src/features/database/tool-registrations.ts | LOADED | 74 | 190/264 (71.97%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/features/entries/public-list.ts | LOADED | 74 | 286/360 (79.44%) | 2/2 (100.00%) | 1/12 (8.33%) |
| apps/website/src/features/forms/import-remote-submissions.ts | LOADED | 74 | 163/237 (68.78%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/seo/tool-registrations.ts | LOADED | 74 | 178/252 (70.63%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/assistant/external-mcp-reauth-tool.ts | LOADED | 73 | 307/380 (80.79%) | 3/3 (100.00%) | 2/11 (18.18%) |
| apps/website/src/features/newsletter/subscriptions.ts | LOADED | 73 | 97/170 (57.06%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/site-backup/archive-manifest.ts | LOADED | 73 | 102/175 (58.29%) | 2/2 (100.00%) | 1/19 (5.26%) |
| apps/website/src/features/trash/registry.ts | LOADED | 73 | 292/365 (80.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/settings/events.ts | LOADED | 73 | 301/374 (80.48%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/agent-plugins/admin-surfaces/delivery-bindings.ts | LOADED | 72 | 147/219 (67.12%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/features/asset-transfer/copy-tool.ts | LOADED | 72 | 96/168 (57.14%) | 2/2 (100.00%) | 1/12 (8.33%) |
| apps/website/src/features/newsletter/confirmation.ts | LOADED | 72 | 115/187 (61.50%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/skills/tool-registrations.ts | LOADED | 72 | 351/423 (82.98%) | 2/2 (100.00%) | 1/13 (7.69%) |
| apps/website/src/features/theme/theme-trash.ts | LOADED | 72 | 139/211 (65.88%) | 3/3 (100.00%) | 2/9 (22.22%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/bundle-create.ts | LOADED | 72 | 162/234 (69.23%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/server/runtime/composition/provider-settings-save.ts | LOADED | 72 | 123/195 (63.08%) | 2/2 (100.00%) | 1/12 (8.33%) |
| development/scripts/check-src-complexity-drift.ts | NEVER-LOADED | 72 | 0/72 (0.00%) | 0/34 (0.00%) | 0/6 (0.00%) |
| apps/website/src/cli/commands/export.ts | LOADED | 71 | 125/196 (63.78%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/database-transfer/table-catalog.ts | LOADED | 71 | 106/177 (59.89%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/features/theme/migration/theme-migration-plan.ts | LOADED | 71 | 215/286 (75.17%) | 2/2 (100.00%) | 1/14 (7.14%) |
| apps/website/src/server/inbound/admin-http/routes/media/upload.ts | LOADED | 71 | 139/210 (66.19%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/server/runtime/composition/domain-dns-adapters.ts | LOADED | 71 | 118/189 (62.43%) | 2/2 (100.00%) | 1/16 (6.25%) |
| development/evals/tool-search-quality.eval.ts | NEVER-LOADED | 71 | 0/71 (0.00%) | 0/24 (0.00%) | 0/18 (0.00%) |
| apps/website/src/features/entries/publish-content.ts | LOADED | 70 | 92/162 (56.79%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/theme/entry-list-render.ts | LOADED | 70 | 305/375 (81.33%) | 2/2 (100.00%) | 1/21 (4.76%) |
| apps/website/src/features/webhooks/seal-aad-invariant.ts | NEVER-LOADED | 70 | 0/70 (0.00%) | 0/42 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/widgets/media-html.ts | LOADED | 70 | 102/172 (59.30%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/domain-dns/dns-tools.ts | LOADED | 69 | 160/229 (69.87%) | 2/2 (100.00%) | 1/23 (4.35%) |
| apps/website/src/features/publish-content/media-references.ts | LOADED | 69 | 159/228 (69.74%) | 2/2 (100.00%) | 1/17 (5.88%) |
| apps/website/src/features/settings/visitor-tools-service.ts | LOADED | 69 | 66/135 (48.89%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/assistant/external-mcp-connection-source.ts | LOADED | 68 | 177/245 (72.24%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/comments/builtin-provider.ts | LOADED | 68 | 55/123 (44.72%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/entries/repo.ts | LOADED | 68 | 200/268 (74.63%) | 3/4 (75.00%) | 2/22 (9.09%) |
| apps/website/src/features/theme/validation/structure.ts | LOADED | 68 | 231/299 (77.26%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/vendor-credentials/vault-adapter.ts | LOADED | 68 | 88/156 (56.41%) | 4/6 (66.67%) | 3/28 (10.71%) |
| apps/website/src/platform/oauth/endpoint-safety.ts | LOADED | 68 | 128/196 (65.31%) | 2/2 (100.00%) | 1/12 (8.33%) |
| apps/website/src/server/runtime/composition/site-key-recovery.ts | LOADED | 68 | 111/179 (62.01%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/features/mail-status/tool-registrations.ts | LOADED | 67 | 67/134 (50.00%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/navigation/import-menu.ts | LOADED | 67 | 193/260 (74.23%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/publish-trust/challenge.ts | LOADED | 67 | 246/313 (78.59%) | 3/4 (75.00%) | 2/15 (13.33%) |
| apps/website/src/features/theme/visitor-publication.ts | LOADED | 67 | 82/149 (55.03%) | 2/2 (100.00%) | 1/17 (5.88%) |
| apps/website/src/features/trash/tool-registrations.ts | LOADED | 67 | 183/250 (73.20%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/assistant/content-target-inputs.ts | LOADED | 66 | 89/155 (57.42%) | 2/2 (100.00%) | 1/12 (8.33%) |
| apps/website/src/features/agent-plugins/lifecycle.ts | LOADED | 66 | 214/280 (76.43%) | 5/8 (62.50%) | 4/44 (9.09%) |
| apps/website/src/features/post/repo.memory.ts | LOADED | 66 | 194/260 (74.62%) | 3/4 (75.00%) | 2/21 (9.52%) |
| apps/website/src/server/inbound/admin-http/routes/pages/update.ts | LOADED | 66 | 178/244 (72.95%) | 2/2 (100.00%) | 1/4 (25.00%) |
| development/scripts/backfill-media-slugs.ts | NEVER-LOADED | 66 | 0/66 (0.00%) | 0/18 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/custom-credentials/write-files-validation.ts | LOADED | 65 | 178/243 (73.25%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/features/deployments/deploy-targets/host-kit.ts | LOADED | 65 | 86/151 (56.95%) | 3/3 (100.00%) | 2/12 (16.67%) |
| apps/website/src/features/entries/trash-aware-memory-repo.ts | LOADED | 65 | 144/209 (68.90%) | 3/4 (75.00%) | 2/18 (11.11%) |
| apps/website/src/features/mail-status/provider-operations.ts | LOADED | 65 | 101/166 (60.84%) | 3/4 (75.00%) | 2/12 (16.67%) |
| apps/website/src/features/mail-status/suppressions.ts | LOADED | 65 | 96/161 (59.63%) | 3/3 (100.00%) | 2/11 (18.18%) |
| apps/website/src/features/member-login/link-service.ts | LOADED | 65 | 107/172 (62.21%) | 2/2 (100.00%) | 1/13 (7.69%) |
| apps/website/src/features/post/repo.rows.ts | LOADED | 65 | 192/257 (74.71%) | 2/2 (100.00%) | 1/12 (8.33%) |
| apps/website/src/features/publish-trust/publish-trust-revocations.ts | LOADED | 65 | 76/141 (53.90%) | 3/4 (75.00%) | 2/11 (18.18%) |
| apps/website/src/features/site-backup/push-engine.ts | LOADED | 65 | 125/190 (65.79%) | 3/4 (75.00%) | 2/12 (16.67%) |
| apps/website/src/features/site-export/site-exporter.ts | LOADED | 65 | 566/631 (89.70%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/platform/db/repos/oauth-pending-store.ts | LOADED | 65 | 57/122 (46.72%) | 3/3 (100.00%) | 2/10 (20.00%) |
| apps/website/src/server/runtime/composition/agent-plugin-connections.ts | LOADED | 65 | 131/196 (66.84%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/runtime/composition/modules/agent-daemon-core-rpc.ts | LOADED | 65 | 87/152 (57.24%) | 2/2 (100.00%) | 1/12 (8.33%) |
| apps/admin/src/features/plugins/Plugins.tsx | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/40 (0.00%) | 0/25 (0.00%) |
| apps/website/src/assistant/mcp-federation/registrations.ts | LOADED | 64 | 223/287 (77.70%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/cli/errors.ts | LOADED | 64 | 157/221 (71.04%) | 5/6 (83.33%) | 4/12 (33.33%) |
| apps/website/src/features/pages/html-document-store.memory.ts | LOADED | 64 | 162/226 (71.68%) | 3/4 (75.00%) | 2/12 (16.67%) |
| apps/website/src/features/publish-content/backstop-service.ts | LOADED | 64 | 52/116 (44.83%) | 2/2 (100.00%) | 1/13 (7.69%) |
| apps/website/src/features/theme/asset-operations.ts | LOADED | 64 | 181/245 (73.88%) | 8/8 (100.00%) | 7/18 (38.89%) |
| apps/website/src/server/inbound/admin-http/routes/plugins/provider-settings.ts | LOADED | 64 | 79/143 (55.24%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/server/runtime/boot/process-error-guards.ts | LOADED | 64 | 97/161 (60.25%) | 3/3 (100.00%) | 2/8 (25.00%) |
| development/scripts/check-test-baseline.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/32 (0.00%) | 0/11 (0.00%) |
| development/scripts/convert-legacy-doc-pages-to-html.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/24 (0.00%) | 0/12 (0.00%) |
| development/scripts/rewrite-deep-imports.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/26 (0.00%) | 0/7 (0.00%) |
| apps/website/src/assistant/execution-credential-store.ts | LOADED | 63 | 135/198 (68.18%) | 4/4 (100.00%) | 3/14 (21.43%) |
| apps/website/src/assistant/run-page-context.ts | LOADED | 63 | 125/188 (66.49%) | 2/2 (100.00%) | 1/12 (8.33%) |
| apps/website/src/features/deployments/tool-registrations.ts | LOADED | 63 | 131/194 (67.53%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/site-inspection/tool-registrations.ts | LOADED | 63 | 150/213 (70.42%) | 3/3 (100.00%) | 2/8 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/update-campaign.ts | LOADED | 63 | 101/164 (61.59%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/server/inbound/admin-http/routes/system/site-share-errors.ts | LOADED | 63 | 92/155 (59.35%) | 2/2 (100.00%) | 1/12 (8.33%) |
| apps/website/src/server/inbound/admin-http/routes/taxonomy/assign-terms.ts | LOADED | 63 | 80/143 (55.94%) | 2/2 (100.00%) | 1/8 (12.50%) |
| development/scripts/check-route-coverage-diff.ts | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/36 (0.00%) | 0/10 (0.00%) |
| apps/website/src/assistant/demo-a2ui-tool.ts | LOADED | 62 | 231/293 (78.84%) | 3/3 (100.00%) | 2/6 (33.33%) |
| apps/website/src/features/media/provider-credential-vault.ts | LOADED | 62 | 61/123 (49.59%) | 3/4 (75.00%) | 2/18 (11.11%) |
| apps/website/src/features/taxonomy/publish-content.ts | LOADED | 62 | 54/116 (46.55%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/platform/db/vault-credential-recovery.ts | LOADED | 62 | 78/140 (55.71%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/server/inbound/public-http/routes/site/search.ts | LOADED | 62 | 112/174 (64.37%) | 2/2 (100.00%) | 1/12 (8.33%) |
| apps/site-chat/src/vanilla-tool-confirmation.ts | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/22 (0.00%) | 0/11 (0.00%) |
| apps/website/src/assistant/demo-choices-tool.ts | LOADED | 61 | 228/289 (78.89%) | 3/3 (100.00%) | 2/7 (28.57%) |
| apps/website/src/assistant/site/visitor-executor.ts | LOADED | 61 | 129/190 (67.89%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/features/mail-status/use-readiness.ts | LOADED | 61 | 136/197 (69.04%) | 2/2 (100.00%) | 1/14 (7.14%) |
| apps/website/src/features/post/content-stats-tool.ts | LOADED | 61 | 111/172 (64.53%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/features/settings/publish-content.ts | LOADED | 61 | 91/152 (59.87%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/server/inbound/admin-http/owner-passkey-routes.ts | LOADED | 61 | 52/113 (46.02%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/server/inbound/admin-http/routes/posts/update.ts | LOADED | 61 | 209/270 (77.41%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/assistant/agent-daemon-core-client.ts | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/24 (0.00%) | 0/29 (0.00%) |
| apps/website/src/server/runtime/composition/site-consent.ts | LOADED | 61 | 49/110 (44.55%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/runtime/composition/storage-secret.ts | LOADED | 61 | 114/175 (65.14%) | 3/3 (100.00%) | 2/9 (22.22%) |
| development/cloud/quality-1111/cov/scripts/extract-failures.mjs | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/76 (0.00%) | 0/8 (0.00%) |
| development/scripts/compose-bundled-agent-plugins.mjs | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/30 (0.00%) | 0/18 (0.00%) |
| apps/website/src/features/site-backup/share-service.ts | LOADED | 60 | 87/147 (59.18%) | 2/2 (100.00%) | 1/13 (7.69%) |
| apps/website/src/platform/db/repos/publish-history-repo.ts | LOADED | 60 | 91/151 (60.26%) | 3/4 (75.00%) | 2/14 (14.29%) |
| apps/website/src/server/inbound/admin-http/routes/agent-plugins/set-enabled.ts | LOADED | 60 | 255/315 (80.95%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/inbound/admin-http/routes/comments/moderate.ts | LOADED | 60 | 98/158 (62.03%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/trash/list.ts | LOADED | 60 | 95/155 (61.29%) | 2/2 (100.00%) | 1/8 (12.50%) |
| development/scripts/prepare-start.mjs | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/40 (0.00%) | 0/9 (0.00%) |
| development/scripts/start.mjs | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/30 (0.00%) | 0/18 (0.00%) |
| apps/website/src/features/forms/form-file-maintenance.ts | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/34 (0.00%) | 0/79 (0.00%) |
| apps/website/src/features/publish-trust/grant.ts | LOADED | 59 | 259/318 (81.45%) | 2/2 (100.00%) | 1/15 (6.67%) |
| apps/website/src/platform/db/sqlite/chat-orphan-check.ts | LOADED | 59 | 131/190 (68.95%) | 5/5 (100.00%) | 4/12 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/settings/shared.ts | LOADED | 59 | 203/262 (77.48%) | 3/4 (75.00%) | 2/11 (18.18%) |
| apps/website/src/server/inbound/public-http/routes/publish-trust/handshake.ts | LOADED | 59 | 183/242 (75.62%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/runtime/services/external-mcp-probe.ts | LOADED | 59 | 139/198 (70.20%) | 2/2 (100.00%) | 1/9 (11.11%) |
| development/scripts/check-area-coverage-floor.ts | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/26 (0.00%) | 0/7 (0.00%) |
| development/scripts/diagnose-jini-typecheck-failure.mjs | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/8 (0.00%) | 0/8 (0.00%) |
| development/scripts/emit-dist-package-json.mjs | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/28 (0.00%) | 0/8 (0.00%) |
| apps/website/src/assistant/mcp-ui-tool-calls-route.ts | LOADED | 58 | 288/346 (83.24%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/features/mail/suppression-admin.repo.ts | LOADED | 58 | 57/115 (49.57%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/project-keys/service.ts | LOADED | 58 | 97/155 (62.58%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/site-backup/archive-extensions.ts | LOADED | 58 | 58/116 (50.00%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/site-backup/import-database.ts | LOADED | 58 | 69/127 (54.33%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/site-backup/import-registry.ts | LOADED | 58 | 104/162 (64.20%) | 3/4 (75.00%) | 2/23 (8.70%) |
| apps/website/src/features/site-backup/share-file-policy.ts | LOADED | 58 | 88/146 (60.27%) | 2/2 (100.00%) | 1/12 (8.33%) |
| apps/website/src/platform/site-dir/boot-site-dir.ts | LOADED | 58 | 165/223 (73.99%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/browser-telemetry.ts | LOADED | 58 | 100/158 (63.29%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/server/inbound/admin-http/routes/users/update.ts | LOADED | 58 | 59/117 (50.43%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/platform/db/sqlite/content-db.ts | LOADED | 57 | 133/190 (70.00%) | 6/8 (75.00%) | 5/18 (27.78%) |
| apps/website/src/platform/site-dir/active-site.ts | LOADED | 57 | 122/179 (68.16%) | 3/3 (100.00%) | 2/12 (16.67%) |
| apps/website/src/platform/site-dir/duplicate-pglite-store.ts | LOADED | 57 | 40/97 (41.24%) | 3/3 (100.00%) | 2/8 (25.00%) |
| apps/website/src/server/inbound/admin-http/http/forms.ts | LOADED | 57 | 88/145 (60.69%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/server/inbound/admin-http/routes/database/restore-points.ts | LOADED | 57 | 157/214 (73.36%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/server/inbound/public-http/http/site/form-validation-message.ts | LOADED | 57 | 39/96 (40.63%) | 2/2 (100.00%) | 1/12 (8.33%) |
| apps/website/src/server/inbound/public-http/routes/plugin-contributions.ts | LOADED | 57 | 78/135 (57.78%) | 2/2 (100.00%) | 1/13 (7.69%) |
| apps/website/src/server/runtime/composition/pending-agent-plugin-tokens.ts | LOADED | 57 | 108/165 (65.45%) | 2/2 (100.00%) | 1/7 (14.29%) |
| development/scripts/backfill-slug-collision-defaults.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/16 (0.00%) | 0/7 (0.00%) |
| development/scripts/backfill-trashed-items.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/22 (0.00%) | 0/10 (0.00%) |
| apps/website/src/features/deployments/static-publish/verify.ts | LOADED | 56 | 291/347 (83.86%) | 3/4 (75.00%) | 2/19 (10.53%) |
| apps/website/src/features/object-storage/media-store.ts | LOADED | 56 | 104/160 (65.00%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/publish-content/ui/criteria.ts | LOADED | 56 | 261/317 (82.33%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/server/inbound/admin-http/routes/posts/create.ts | LOADED | 56 | 89/145 (61.38%) | 2/2 (100.00%) | 1/3 (33.33%) |
| development/scripts/classify-coverage-gaps.ts | NEVER-LOADED | 56 | 0/56 (0.00%) | 0/28 (0.00%) | 0/9 (0.00%) |
| development/scripts/package-agent-plugin.ts | NEVER-LOADED | 56 | 0/56 (0.00%) | 0/14 (0.00%) | 0/9 (0.00%) |
| ADS-memory/reports/architecture/2026-08-18-ag-ui-sample/backend-agui-adapter.sample.ts | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/23 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/database-transfer/tool-registrations.ts | LOADED | 55 | 70/125 (56.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/fs-files/write-files.ts | LOADED | 55 | 84/139 (60.43%) | 3/3 (100.00%) | 2/13 (15.38%) |
| apps/website/src/features/mail-status/provider-tool-registrations.ts | LOADED | 55 | 72/127 (56.69%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/features/media/view-image-tool.ts | LOADED | 55 | 172/227 (75.77%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/platform/db/repos/change-set-repo.ts | LOADED | 55 | 123/178 (69.10%) | 3/4 (75.00%) | 2/13 (15.38%) |
| apps/website/src/server/inbound/admin-http/owner-recovery-routes.ts | LOADED | 55 | 64/119 (53.78%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts | LOADED | 55 | 155/210 (73.81%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/comments/provider-selection.ts | LOADED | 54 | 57/111 (51.35%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/deployments/deploy-config.ts | LOADED | 54 | 320/374 (85.56%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/features/post/search-index.ts | LOADED | 54 | 220/274 (80.29%) | 4/5 (80.00%) | 3/15 (20.00%) |
| apps/website/src/server/inbound/admin-http/owner-mfa-routes.ts | LOADED | 54 | 52/106 (49.06%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/server/inbound/admin-http/publish-trust-auth.ts | LOADED | 54 | 383/437 (87.64%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/put.ts | LOADED | 54 | 122/176 (69.32%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/inbound/admin-http/routes/posts/autosave.ts | LOADED | 54 | 140/194 (72.16%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/server/inbound/admin-http/routes/users/enable.ts | LOADED | 54 | 45/99 (45.45%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/users/write-policy-permission.ts | LOADED | 54 | 45/99 (45.45%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/runtime/boot/production-readiness-gate.ts | LOADED | 54 | 147/201 (73.13%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/form-destinations/port.ts | LOADED | 53 | 69/122 (56.56%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/identity/default-credential-exposure.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/16 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/media/duplicate-asset.ts | LOADED | 53 | 228/281 (81.14%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/publish-content/ui/report-rows.ts | LOADED | 53 | 583/636 (91.67%) | 3/3 (100.00%) | 2/18 (11.11%) |
| apps/website/src/features/publish-trust/session.ts | LOADED | 53 | 159/212 (75.00%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/features/theme/validation/validate-theme-package.ts | LOADED | 53 | 192/245 (78.37%) | 2/2 (100.00%) | 1/12 (8.33%) |
| apps/website/src/platform/db/migrations/0006_submission_ip_retention.ts | LOADED | 53 | 19/72 (26.39%) | 11/15 (73.33%) | 8/9 (88.89%) |
| apps/website/src/platform/db/repos/origin-repo.ts | LOADED | 53 | 179/232 (77.16%) | 3/4 (75.00%) | 2/14 (14.29%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/list-models.ts | LOADED | 53 | 105/158 (66.46%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/pages/create.ts | LOADED | 53 | 72/125 (57.60%) | 2/2 (100.00%) | 1/3 (33.33%) |
| development/scripts/ts-escape-metrics.mjs | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/24 (0.00%) | 0/6 (0.00%) |
| apps/website/src/assistant/external-mcp-federation-runtime.ts | LOADED | 52 | 174/226 (76.99%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/site-backup/share-zip.ts | LOADED | 52 | 97/149 (65.10%) | 2/2 (100.00%) | 1/13 (7.69%) |
| apps/website/src/features/site-evidence/collect-page-evidence.ts | LOADED | 52 | 110/162 (67.90%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/platform/site-dir/seed-site-themes.ts | LOADED | 52 | 128/180 (71.11%) | 18/24 (75.00%) | 6/11 (54.55%) |
| apps/website/src/server/inbound/admin-http/routes/sites/sites-home.ts | LOADED | 52 | 41/93 (44.09%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/inbound/public-http/middleware/theme-page-preview.ts | LOADED | 52 | 206/258 (79.84%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/runtime/lifecycle/close-store-on-shutdown.ts | LOADED | 52 | 142/194 (73.20%) | 2/2 (100.00%) | 1/5 (20.00%) |
| development/scripts/cleanup-stale-owner-sessions.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/20 (0.00%) | 0/10 (0.00%) |
| development/scripts/dev-sites-home.mjs | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/38 (0.00%) | 0/10 (0.00%) |
| apps/website/src/features/pages/hidden-until-script.ts | LOADED | 51 | 77/128 (60.16%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/plugin-runtime/built-ins/content-analyzer/tiptap-blocks.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/44 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/settings/visitor-tools-write.ts | LOADED | 51 | 53/104 (50.96%) | 4/4 (100.00%) | 3/15 (20.00%) |
| apps/website/src/features/site-backup/share-hosting.ts | LOADED | 51 | 86/137 (62.77%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/features/site-inspection/site-profile.ts | LOADED | 51 | 613/664 (92.32%) | 2/2 (100.00%) | 1/12 (8.33%) |
| apps/website/src/features/theme/duplicate-theme-tool.ts | LOADED | 51 | 123/174 (70.69%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/detect-agents.ts | LOADED | 51 | 148/199 (74.37%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/server/inbound/admin-http/routes/media/original.ts | LOADED | 51 | 228/279 (81.72%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/inbound/assistant/durable-run-routes.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/60 (0.00%) | 0/13 (0.00%) |
| development/scripts/check-route-tool-parity.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/14 (0.00%) | 0/12 (0.00%) |
| apps/site-chat/src/session-store.ts | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/28 (0.00%) | 0/13 (0.00%) |
| apps/website/src/assistant/tool-approval-policy.ts | LOADED | 50 | 73/123 (59.35%) | 2/2 (100.00%) | 1/16 (6.25%) |
| apps/website/src/contracts/site-assistant/visitor-tools.ts | LOADED | 50 | 49/99 (49.49%) | 4/4 (100.00%) | 3/17 (17.65%) |
| apps/website/src/features/newsletter/unsubscribe.ts | LOADED | 50 | 93/143 (65.03%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/settings/visitor-tools-registrations.ts | LOADED | 50 | 48/98 (48.98%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/theme/preview-switcher.ts | LOADED | 50 | 57/107 (53.27%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/server/inbound/admin-http/routes/settings/register-definitions.ts | LOADED | 50 | 118/168 (70.24%) | 2/2 (100.00%) | 1/11 (9.09%) |
| development/cloud/quality-1111/cov/scripts/build-coverage-table.mjs | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/50 (0.00%) | 0/10 (0.00%) |
| development/scripts/agent-plugin-activation.ts | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/30 (0.00%) | 0/3 (0.00%) |
| apps/website/src/cli/commands/adopt.ts | LOADED | 49 | 151/200 (75.50%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/cli/commands/deploy-config.ts | LOADED | 49 | 129/178 (72.47%) | 5/7 (71.43%) | 4/10 (40.00%) |
| apps/website/src/features/asset-transfer/asset-destinations.ts | LOADED | 49 | 79/128 (61.72%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/deployments/deploy-ops/run-ops.ts | LOADED | 49 | 46/95 (48.42%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/deployments/static-publish/publish-history.ts | LOADED | 49 | 252/301 (83.72%) | 3/4 (75.00%) | 2/15 (13.33%) |
| apps/website/src/features/site-backup/share-registry.ts | LOADED | 49 | 97/146 (66.44%) | 3/4 (75.00%) | 2/17 (11.76%) |
| apps/website/src/features/theme/code-tier-asset-normalizer.ts | LOADED | 49 | 358/407 (87.96%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/server/inbound/admin-http/routes/agent-plugins/admin-surfaces.ts | LOADED | 49 | 82/131 (62.60%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/server/inbound/admin-http/routes/menus/update-tree.ts | LOADED | 49 | 98/147 (66.67%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/mail-providers.ts | LOADED | 49 | 71/120 (59.17%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/public-http/routes/members/deps.ts | LOADED | 49 | 129/178 (72.47%) | 2/2 (100.00%) | 1/7 (14.29%) |
| development/evals/tool-search-argument-fill-duplicate.ts | NEVER-LOADED | 49 | 0/49 (0.00%) | 0/24 (0.00%) | 0/12 (0.00%) |
| development/evals/tool-search-hyde-canary.eval.ts | NEVER-LOADED | 49 | 0/49 (0.00%) | 0/20 (0.00%) | 0/10 (0.00%) |
| apps/website/src/assistant/ask-choice-custom-answer.ts | LOADED | 48 | 110/158 (69.62%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/theme/trash-theme-tool.ts | LOADED | 48 | 142/190 (74.74%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/platform/secrets/vault-meta-rules.ts | LOADED | 48 | 90/138 (65.22%) | 2/2 (100.00%) | 1/15 (6.67%) |
| apps/website/src/platform/server-logs/log-file.ts | LOADED | 48 | 104/152 (68.42%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/platform/site-dir/local-site-child.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/24 (0.00%) | 0/18 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/disable.ts | LOADED | 48 | 56/104 (53.85%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/public-http/routes/members/oidc-callback.ts | LOADED | 48 | 47/95 (49.47%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/runtime/composition/site-paths.ts | LOADED | 48 | 173/221 (78.28%) | 3/3 (100.00%) | 2/20 (10.00%) |
| development/scripts/quality-semgrep.mjs | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/46 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/publish-content/publish-backstop-row.sqlite.ts | LOADED | 47 | 36/83 (43.37%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/site-backup/tool-registrations.ts | LOADED | 47 | 211/258 (81.78%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/site-inspection/site-capabilities.ts | LOADED | 47 | 270/317 (85.17%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/site-search/cms-document-source.ts | LOADED | 47 | 126/173 (72.83%) | 2/2 (100.00%) | 1/13 (7.69%) |
| apps/website/src/features/theme/active-theme-publish-content.ts | LOADED | 47 | 63/110 (57.27%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/server/inbound/admin-http/routes/media/import-url.ts | LOADED | 47 | 36/83 (43.37%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/system/mail-activity.ts | LOADED | 47 | 71/118 (60.17%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/runtime/boot/boot-readiness-warnings.ts | LOADED | 47 | 67/114 (58.77%) | 6/9 (66.67%) | 3/10 (30.00%) |
| apps/website/src/features/api-connections/shared-owner.ts | LOADED | 46 | 46/92 (50.00%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/consent/readiness.ts | LOADED | 46 | 28/74 (37.84%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/image-transform/image-ops.ts | LOADED | 46 | 121/167 (72.46%) | 3/3 (100.00%) | 2/14 (14.29%) |
| apps/website/src/features/media/library-save-attachment.ts | LOADED | 46 | 37/83 (44.58%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/server-logs/read-server-logs.ts | LOADED | 46 | 67/113 (59.29%) | 3/3 (100.00%) | 2/10 (20.00%) |
| apps/website/src/features/site-backup/import-verifier-projection.ts | LOADED | 46 | 51/97 (52.58%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/theme/preview-switcher-html.ts | LOADED | 46 | 81/127 (63.78%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/server/inbound/admin-http/routes/pages/delete.ts | LOADED | 46 | 88/134 (65.67%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/site-chat/src/SiteAssistantActivation.hooks.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/16 (0.00%) | 0/15 (0.00%) |
| apps/website/src/assistant/content-chat-title.ts | LOADED | 45 | 59/104 (56.73%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/agent-plugins/supersession.ts | LOADED | 45 | 95/140 (67.86%) | 2/2 (100.00%) | 1/14 (7.14%) |
| apps/website/src/features/change-sets/tool-registrations.ts | LOADED | 45 | 147/192 (76.56%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/navigation/render-entry.ts | LOADED | 45 | 54/99 (54.55%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/publish-content/backstop-preview.ts | LOADED | 45 | 28/73 (38.36%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/redirects/publish-content.ts | LOADED | 45 | 106/151 (70.20%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/taxonomy/publish-term-ids.ts | LOADED | 45 | 71/116 (61.21%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/agent-plugins/install.ts | LOADED | 45 | 86/131 (65.65%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/inbound/admin-http/routes/pages/update-html.ts | LOADED | 45 | 165/210 (78.57%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/plugins/install.ts | LOADED | 45 | 79/124 (63.71%) | 3/3 (100.00%) | 2/14 (14.29%) |
| apps/website/src/server/inbound/admin-http/routes/system/dockerfile-source.ts | LOADED | 45 | 125/170 (73.53%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/assistant/agent-daemon-idle-park.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/24 (0.00%) | 0/10 (0.00%) |
| development/scripts/link-jini.mjs | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/24 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/deployments/deploy-config-registry.ts | LOADED | 44 | 131/175 (74.86%) | 4/6 (66.67%) | 3/21 (14.29%) |
| apps/website/src/features/mail-status/delivery-tool-registrations.ts | LOADED | 44 | 60/104 (57.69%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/source-control/credential-form.ts | LOADED | 44 | 64/108 (59.26%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/theme/handlebars-allowlist.ts | LOADED | 44 | 380/424 (89.62%) | 2/2 (100.00%) | 1/15 (6.67%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/test-connection.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/26 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/forms/list-submissions.ts | LOADED | 44 | 53/97 (54.64%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/plugins/preview.ts | LOADED | 44 | 111/155 (71.61%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/inbound/admin-http/routes/presentation/get.ts | LOADED | 44 | 92/136 (67.65%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/skills/manage.ts | LOADED | 44 | 25/69 (36.23%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/assistant-subagents.ts | LOADED | 44 | 29/73 (39.73%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/site-guide.ts | LOADED | 44 | 68/112 (60.71%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/runtime/composition/site-mailer.ts | LOADED | 44 | 66/110 (60.00%) | 2/2 (100.00%) | 1/4 (25.00%) |
| development/evals/tool-search-doc2query-canary.eval.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/18 (0.00%) | 0/13 (0.00%) |
| development/scripts/lib/admin-route-walk.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/42 (0.00%) | 0/9 (0.00%) |
| apps/website/src/assistant/site-credential-store.ts | LOADED | 43 | 123/166 (74.10%) | 4/4 (100.00%) | 3/12 (25.00%) |
| apps/website/src/features/agent-plugins/new-site-agent-plugin-tokens.ts | LOADED | 43 | 108/151 (71.52%) | 3/6 (50.00%) | 2/9 (22.22%) |
| apps/website/src/features/domain-dns/binding.repo.ts | LOADED | 43 | 46/89 (51.69%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/media-generation/media-provider-registry.ts | LOADED | 43 | 109/152 (71.71%) | 2/2 (100.00%) | 1/12 (8.33%) |
| apps/website/src/features/newsletter/lists.ts | LOADED | 43 | 72/115 (62.61%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/publish-content/backstop-policy.ts | LOADED | 43 | 78/121 (64.46%) | 3/4 (75.00%) | 2/11 (18.18%) |
| apps/website/src/features/site-inspection/page-body.ts | LOADED | 43 | 65/108 (60.19%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/theme/set-active-theme-tool.ts | LOADED | 43 | 149/192 (77.60%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/inbound/admin-http/routes/media/update.ts | LOADED | 43 | 96/139 (69.06%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/trash/items.ts | LOADED | 43 | 66/109 (60.55%) | 2/2 (100.00%) | 1/5 (20.00%) |
| development/scripts/check-test-safety-diff.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/16 (0.00%) | 0/13 (0.00%) |
| apps/site-chat/src/SiteAssistantWidget.tsx | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/4 (0.00%) | 0/15 (0.00%) |
| apps/website/src/assistant/render-ui-tool.ts | LOADED | 42 | 130/172 (75.58%) | 3/3 (100.00%) | 2/5 (40.00%) |
| apps/website/src/features/agent-plugins/provider-plugin-link.ts | LOADED | 42 | 86/128 (67.19%) | 3/4 (75.00%) | 2/8 (25.00%) |
| apps/website/src/features/content-types/publish-content.ts | LOADED | 42 | 42/84 (50.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/forms/publish-content.ts | LOADED | 42 | 39/81 (48.15%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/mail/ledger.repo.ts | LOADED | 42 | 35/77 (45.45%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/site-backup/import-restore.ts | LOADED | 42 | 62/104 (59.62%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/platform/site-dir/site-key-dependent-data.ts | LOADED | 42 | 41/83 (49.40%) | 3/3 (100.00%) | 2/8 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/email-templates/routes.ts | LOADED | 42 | 70/112 (62.50%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/server/inbound/admin-http/routes/presentation/patch-active-theme.ts | LOADED | 42 | 80/122 (65.57%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/themes/preview.ts | LOADED | 42 | 88/130 (67.69%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/list.ts | LOADED | 42 | 61/103 (59.22%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/middleware/theme-preview-switcher.ts | LOADED | 42 | 52/94 (55.32%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/server/runtime/composition/agent-plugin-service-ports.ts | LOADED | 42 | 58/100 (58.00%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/runtime/composition/move-site-storage.ts | LOADED | 42 | 88/130 (67.69%) | 2/2 (100.00%) | 1/5 (20.00%) |
| development/evals/tool-search-credential-save.eval.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/26 (0.00%) | 0/17 (0.00%) |
| development/scripts/route-coverage-lib.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/22 (0.00%) | 0/9 (0.00%) |
| apps/website/src/assistant/agent-daemon-port.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/assistant/daemon-access.ts | LOADED | 41 | 61/102 (59.80%) | 3/3 (100.00%) | 2/22 (9.09%) |
| apps/website/src/assistant/site/visitor-page-tools.ts | LOADED | 41 | 58/99 (58.59%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/features/members/access-resolver.ts | LOADED | 41 | 196/237 (82.70%) | 3/4 (75.00%) | 2/15 (13.33%) |
| apps/website/src/features/site-evidence/tool-registrations.ts | LOADED | 41 | 195/236 (82.63%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/theme/validation/markup.ts | LOADED | 41 | 88/129 (68.22%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/platform/db/key-dependent-data.ts | LOADED | 41 | 64/105 (60.95%) | 3/3 (100.00%) | 2/12 (16.67%) |
| apps/website/src/platform/db/prepare-content-store.ts | LOADED | 41 | 42/83 (50.60%) | 19/22 (86.36%) | 12/16 (75.00%) |
| apps/website/src/platform/site-dir/read-site-dir.ts | LOADED | 41 | 143/184 (77.72%) | 17/37 (45.95%) | 14/20 (70.00%) |
| apps/website/src/server/inbound/admin-http/routes/forms/update.ts | LOADED | 41 | 78/119 (65.55%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/system/observability-status.ts | LOADED | 41 | 43/84 (51.19%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/public-http/middleware/theme-preview-refresh.ts | LOADED | 41 | 72/113 (63.72%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/public-http/routes/members/unlink-identity.ts | LOADED | 41 | 39/80 (48.75%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/runtime/composition/plugin-host.ts | LOADED | 41 | 64/105 (60.95%) | 2/2 (100.00%) | 1/5 (20.00%) |
| content/themes/__original-themes__/static/tovu-starter/scripts/docs-sidebar.js | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/24 (0.00%) | 0/13 (0.00%) |
| content/themes/__original-themes__/static/tovu-theme/scripts/docs-sidebar.js | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/24 (0.00%) | 0/13 (0.00%) |
| content/themes/static/tovu-starter/scripts/docs-sidebar.js | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/24 (0.00%) | 0/13 (0.00%) |
| content/themes/static/tovu-theme/scripts/docs-sidebar.js | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/24 (0.00%) | 0/13 (0.00%) |
| development/scripts/check-admin-complexity-drift.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/20 (0.00%) | 0/3 (0.00%) |
| development/scripts/lib/openapi-operations.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/24 (0.00%) | 0/10 (0.00%) |
| apps/site-chat/src/site-chat-comparison.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/20 (0.00%) | 0/17 (0.00%) |
| apps/website/src/assistant/run-start-context.ts | LOADED | 40 | 109/149 (73.15%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/assistant/site/visitor-confirmation-gate.ts | LOADED | 40 | 67/107 (62.62%) | 3/3 (100.00%) | 2/5 (40.00%) |
| apps/website/src/features/domain-dns/mail-requirements.ts | LOADED | 40 | 58/98 (59.18%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/mail-status/feedback-setup.ts | LOADED | 40 | 65/105 (61.90%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/plugin-runtime/agent-plugin-tool-binding.ts | LOADED | 40 | 22/62 (35.48%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/plugin-runtime/install-source.ts | LOADED | 40 | 22/62 (35.48%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/site-backup/share-preparation-steps.ts | LOADED | 40 | 68/108 (62.96%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/site-export/route-manifest.ts | LOADED | 40 | 299/339 (88.20%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/theme/file-identity-lock.ts | LOADED | 40 | 256/296 (86.49%) | 2/2 (100.00%) | 1/13 (7.69%) |
| apps/website/src/server/inbound/admin-http/routes/members/request-magic-link.ts | LOADED | 40 | 78/118 (66.10%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/menus/assign-location.ts | LOADED | 40 | 66/106 (62.26%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/plugins/uninstall.ts | LOADED | 40 | 45/85 (52.94%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/redirects/create.ts | LOADED | 40 | 54/94 (57.45%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/assistant/assistant-runtime-guidance.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/30 (0.00%) | 0/12 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/liquid-render.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/12 (0.00%) | 0/13 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/worker-sandbox.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/14 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/runtime/boot/local-owner-signin.ts | LOADED | 40 | 118/158 (74.68%) | 27/43 (62.79%) | 15/30 (50.00%) |
| apps/website/src/server/runtime/boot/parent-watchdog.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/18 (0.00%) | 0/7 (0.00%) |
| apps/site-chat/src/vanilla-host.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/20 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/consent/validation.ts | LOADED | 39 | 29/68 (42.65%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/media/versioned-media-repo.ts | LOADED | 39 | 169/208 (81.25%) | 3/4 (75.00%) | 2/16 (12.50%) |
| apps/website/src/features/settings/mail-provider.ts | LOADED | 39 | 87/126 (69.05%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/site-backup/archive-media.ts | LOADED | 39 | 54/93 (58.06%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/site-backup/archive-paths.ts | LOADED | 39 | 49/88 (55.68%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/site-backup/import-restore-placement.ts | LOADED | 39 | 83/122 (68.03%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/webhooks/site-key-sources.ts | LOADED | 39 | 260/299 (86.96%) | 2/2 (100.00%) | 1/16 (6.25%) |
| apps/website/src/platform/db/migrations/0020_vault_api_connection_kind.ts | LOADED | 39 | 36/75 (48.00%) | 9/12 (75.00%) | 7/10 (70.00%) |
| apps/website/src/server/inbound/admin-http/routes/agent-plugins/memory.ts | LOADED | 39 | 32/71 (45.07%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/entries/lifecycle.ts | LOADED | 39 | 47/86 (54.65%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/entries/update.ts | LOADED | 39 | 50/89 (56.18%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/posts/delete.ts | LOADED | 39 | 115/154 (74.68%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/settings/set.ts | LOADED | 39 | 97/136 (71.32%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/server/inbound/admin-http/routes/system/credential-copy.ts | LOADED | 39 | 33/72 (45.83%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/create.ts | LOADED | 39 | 72/111 (64.86%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/public-http/routes/api-connections/oauth-callback.ts | LOADED | 39 | 83/122 (68.03%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/server/runtime/composition/modules/members.ts | LOADED | 39 | 85/124 (68.55%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/runtime/lifecycle/local-site-host.ts | LOADED | 39 | 61/100 (61.00%) | 2/2 (100.00%) | 1/6 (16.67%) |
| development/evals/tool-search-hierarchical-canary.eval.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/14 (0.00%) | 0/9 (0.00%) |
| development/scripts/generate-seed-content.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| apps/website/src/assistant/byok-meta-tool-result.ts | LOADED | 38 | 90/128 (70.31%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/assistant/tool-recovery-preset.ts | LOADED | 38 | 72/110 (65.45%) | 2/2 (100.00%) | 1/12 (8.33%) |
| apps/website/src/features/publish-content/gated-hooks.ts | LOADED | 38 | 313/351 (89.17%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/features/site-backup/static-download-landing.ts | LOADED | 38 | 70/108 (64.81%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/site-export/media-original-urls.ts | LOADED | 38 | 60/98 (61.22%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/theme/hardcoded-link-lists.ts | LOADED | 38 | 80/118 (67.80%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/platform/db/kernel/sqlite-only.ts | LOADED | 38 | 82/120 (68.33%) | 3/3 (100.00%) | 2/12 (16.67%) |
| apps/website/src/platform/dev-supervisor/dev-restart.ts | LOADED | 38 | 76/114 (66.67%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/change-sets/revert.ts | LOADED | 38 | 76/114 (66.67%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/media/replace.ts | LOADED | 38 | 45/83 (54.22%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/trash.ts | LOADED | 38 | 53/91 (58.24%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/public-http/http/site/page-head.ts | LOADED | 38 | 167/205 (81.46%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/inbound/public-http/routes/members/oidc-deps.ts | LOADED | 38 | 68/106 (64.15%) | 3/3 (100.00%) | 2/10 (20.00%) |
| apps/website/src/server/runtime/composition/agent-daemon-core-deps.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/26 (0.00%) | 0/7 (0.00%) |
| cloud/reports/bugs-fixture-write-guard.mjs | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/22 (0.00%) | 0/4 (0.00%) |
| development/scripts/prune-tsx-cache.mjs | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/22 (0.00%) | 0/17 (0.00%) |
| development/scripts/tap-summary.mjs | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/22 (0.00%) | 0/2 (0.00%) |
| apps/website/src/assistant/mcp-federation/bootstrap.ts | LOADED | 37 | 213/250 (85.20%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/assistant/site/visitor-frontend-control.ts | LOADED | 37 | 30/67 (44.78%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/agent-plugins/tool-registrations.ts | LOADED | 37 | 135/172 (78.49%) | 3/4 (75.00%) | 2/12 (16.67%) |
| apps/website/src/features/consent/settings.ts | LOADED | 37 | 65/102 (63.73%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/database/repo.memory.ts | LOADED | 37 | 177/214 (82.71%) | 8/13 (61.54%) | 7/30 (23.33%) |
| apps/website/src/features/media/read-chat-attachment.ts | LOADED | 37 | 332/369 (89.97%) | 2/2 (100.00%) | 1/13 (7.69%) |
| apps/website/src/features/plugin-runtime/host-tool-binding.ts | LOADED | 37 | 39/76 (51.32%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/project-keys/site-references.ts | LOADED | 37 | 48/85 (56.47%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/seo/index.ts | LOADED | 37 | 89/126 (70.63%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/platform/site-dir/duplicate-content-db.ts | LOADED | 37 | 153/190 (80.53%) | 3/3 (100.00%) | 2/6 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/forms/get-submission.ts | LOADED | 37 | 41/78 (52.56%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/settings/clear.ts | LOADED | 37 | 61/98 (62.24%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/server/inbound/public-http/routes/members/complete-sign-in.ts | LOADED | 37 | 55/92 (59.78%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/runtime/composition/open-site-store.ts | LOADED | 37 | 159/196 (81.12%) | 5/9 (55.56%) | 4/9 (44.44%) |
| apps/website/src/server/runtime/composition/site-guide-tools.ts | LOADED | 37 | 94/131 (71.76%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/assistant/demo-image-png.ts | LOADED | 36 | 108/144 (75.00%) | 6/6 (100.00%) | 2/7 (28.57%) |
| apps/website/src/features/agent-plugins/analytics-provider-registry.ts | LOADED | 36 | 94/130 (72.31%) | 3/3 (100.00%) | 2/10 (20.00%) |
| apps/website/src/features/deployments/static-publish/inspection.ts | LOADED | 36 | 40/76 (52.63%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/publish-content/type-registry.ts | LOADED | 36 | 647/683 (94.73%) | 3/3 (100.00%) | 2/11 (18.18%) |
| apps/website/src/features/theme/import-theme-file-tool.ts | LOADED | 36 | 142/178 (79.78%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/theme/liquid-allowlist.ts | LOADED | 36 | 267/303 (88.12%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/features/theme/theme-file-import.ts | LOADED | 36 | 144/180 (80.00%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/platform/db/client/open-site-db-client.ts | LOADED | 36 | 127/163 (77.91%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/platform/site-dir/local-site-intent.ts | LOADED | 36 | 31/67 (46.27%) | 3/3 (100.00%) | 2/10 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/api-keys/deps.ts | LOADED | 36 | 96/132 (72.73%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/consent/routes.ts | LOADED | 36 | 27/63 (42.86%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/content-types/update-fields.ts | LOADED | 36 | 48/84 (57.14%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/forms/delete-submission.ts | LOADED | 36 | 41/77 (53.25%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/forms/pull-submissions.ts | LOADED | 36 | 36/72 (50.00%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/trash/restore.ts | LOADED | 36 | 74/110 (67.27%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/reset-password.ts | LOADED | 36 | 57/93 (61.29%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/public-http/routes/site/comments-submit.ts | LOADED | 36 | 80/116 (68.97%) | 2/2 (100.00%) | 1/5 (20.00%) |
| .semgrep/tests/provider-errors.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/0 (0.00%) | 0/11 (0.00%) |
| apps/website/src/assistant/subagent-settings.ts | LOADED | 35 | 60/95 (63.16%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/assistant/tool-catalog-query.ts | LOADED | 35 | 152/187 (81.28%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/analytics/forwarding.ts | LOADED | 35 | 89/124 (71.77%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/consent/tool-registrations.ts | LOADED | 35 | 38/73 (52.05%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/features/deployments/deploy-ops/registry.ts | LOADED | 35 | 71/106 (66.98%) | 3/4 (75.00%) | 2/15 (13.33%) |
| apps/website/src/features/form-destinations/pull.ts | LOADED | 35 | 91/126 (72.22%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/mail/capture.repo.ts | LOADED | 35 | 55/90 (61.11%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/object-storage/registry.ts | LOADED | 35 | 87/122 (71.31%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/permanent-delete/tool-registrations.ts | LOADED | 35 | 70/105 (66.67%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/platform/site-dir/read-applied-schema-identity.ts | LOADED | 35 | 90/125 (72.00%) | 3/3 (100.00%) | 2/8 (25.00%) |
| apps/website/src/platform/site-dir/site-storage.ts | LOADED | 35 | 55/90 (61.11%) | 6/15 (40.00%) | 4/10 (40.00%) |
| apps/website/src/server/inbound/admin-http/http/newsletter.ts | LOADED | 35 | 131/166 (78.92%) | 2/2 (100.00%) | 1/15 (6.67%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/put-site-credential.ts | LOADED | 35 | 74/109 (67.89%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/content-types/lifecycle.ts | LOADED | 35 | 58/93 (62.37%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/sites/local-sites.ts | LOADED | 35 | 36/71 (50.70%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/deployment-overview.ts | LOADED | 35 | 168/203 (82.76%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/inbound/admin-http/routes/system/export-site.ts | LOADED | 35 | 149/184 (80.98%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/inbound/admin-http/routes/taxonomy/create-term.ts | LOADED | 35 | 39/74 (52.70%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/users/remove-policy-permission.ts | LOADED | 35 | 55/90 (61.11%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/public-http/routes/site/analytics-ingest.ts | LOADED | 35 | 87/122 (71.31%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/server/inbound/public-http/routes/site/products.ts | LOADED | 35 | 91/126 (72.22%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/shared/observability-middleware.ts | LOADED | 35 | 122/157 (77.71%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/runtime/boot/resolve-mailer.ts | LOADED | 35 | 171/206 (83.01%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/cli/commands/theme/migrate.ts | LOADED | 34 | 47/81 (58.02%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/email-templates/tool-registrations.ts | LOADED | 34 | 53/87 (60.92%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/forms/form-file-purge.ts | LOADED | 34 | 58/92 (63.04%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/forms/index.ts | LOADED | 34 | 167/201 (83.08%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/project-keys/tools.ts | LOADED | 34 | 30/64 (46.88%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/publish-content/push-plan.ts | LOADED | 34 | 99/133 (74.44%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/publish-content/report-labels.ts | LOADED | 34 | 151/185 (81.62%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/settings/chat-execution-write.ts | LOADED | 34 | 51/85 (60.00%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/site-backup/import-verifier.ts | LOADED | 34 | 33/67 (49.25%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/theme/preview-refresh.ts | LOADED | 34 | 47/81 (58.02%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/trash/adapters/marker-sql.ts | LOADED | 34 | 113/147 (76.87%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/platform/db/sqlite/database-introspection-adapter.sqlite.ts | LOADED | 34 | 254/288 (88.19%) | 3/4 (75.00%) | 2/17 (11.76%) |
| apps/website/src/platform/http/test-origin-allowlist.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/24 (0.00%) | 0/9 (0.00%) |
| apps/website/src/server/inbound/admin-http/admin-dev-proxy.ts | LOADED | 34 | 220/254 (86.61%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/server/inbound/admin-http/routes/agent-plugins/install-response.ts | LOADED | 34 | 120/154 (77.92%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/server/inbound/admin-http/routes/content-types/register.ts | LOADED | 34 | 53/87 (60.92%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/themes/duplicate.ts | LOADED | 34 | 53/87 (60.92%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/public-http/routes/site/forms-submit.ts | LOADED | 34 | 69/103 (66.99%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/composition/publish-content-seed-hash.ts | LOADED | 34 | 105/139 (75.54%) | 2/2 (100.00%) | 1/4 (25.00%) |
| development/scripts/lib/openapi-contract-fixtures.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/28 (0.00%) | 0/4 (0.00%) |
| apps/website/src/assistant/site/visitor-confirmations.ts | LOADED | 33 | 51/84 (60.71%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/analytics/tool-registrations.ts | LOADED | 33 | 39/72 (54.17%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/content-types/repo.rows.ts | LOADED | 33 | 60/93 (64.52%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/deployments/static-publish/publish-run.ts | LOADED | 33 | 239/272 (87.87%) | 2/2 (100.00%) | 1/12 (8.33%) |
| apps/website/src/features/external-mcp/operations-tools.ts | LOADED | 33 | 75/108 (69.44%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/post/search-index.postgres.ts | LOADED | 33 | 77/110 (70.00%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/settings/tool-registrations.ts | LOADED | 33 | 115/148 (77.70%) | 4/4 (100.00%) | 3/5 (60.00%) |
| apps/website/src/features/site-guide/facts.ts | LOADED | 33 | 48/81 (59.26%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/sites/site-preview/site-preview-service.ts | LOADED | 33 | 107/140 (76.43%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/db/migrations/0011_archive_legacy_commerce.ts | LOADED | 33 | 37/70 (52.86%) | 12/16 (75.00%) | 9/14 (64.29%) |
| apps/website/src/platform/db/repos/gated-mutation-token-repo.ts | LOADED | 33 | 95/128 (74.22%) | 3/4 (75.00%) | 2/11 (18.18%) |
| apps/website/src/platform/server-logs/index.ts | LOADED | 33 | 93/126 (73.81%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/server/inbound/admin-http/routes/entries/create.ts | LOADED | 33 | 54/87 (62.07%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/media/list.ts | LOADED | 33 | 23/56 (41.07%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/boot/site-key-boot-notice.ts | LOADED | 33 | 117/150 (78.00%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/runtime/lifecycle/boot-lifecycle.ts | LOADED | 33 | 127/160 (79.38%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/assistant/external-mcp-call-confirmation.ts | LOADED | 32 | 81/113 (71.68%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/contracts/core/events/memory-bus.ts | LOADED | 32 | 124/156 (79.49%) | 4/6 (66.67%) | 3/15 (20.00%) |
| apps/website/src/features/database-transfer/destination-store.ts | LOADED | 32 | 114/146 (78.08%) | 8/8 (100.00%) | 7/19 (36.84%) |
| apps/website/src/features/fs-files/site-file-request.ts | LOADED | 32 | 56/88 (63.64%) | 3/3 (100.00%) | 2/7 (28.57%) |
| apps/website/src/features/project-keys/attached-vault.ts | LOADED | 32 | 28/60 (46.67%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/workspace/tool-registrations.ts | LOADED | 32 | 77/109 (70.64%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/http/widgets.ts | LOADED | 32 | 141/173 (81.50%) | 2/2 (100.00%) | 1/20 (5.00%) |
| apps/website/src/server/inbound/admin-http/routes/integrations/deliveries.ts | LOADED | 32 | 47/79 (59.49%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/create-campaign.ts | LOADED | 32 | 61/93 (65.59%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/seo/put-settings.ts | LOADED | 32 | 22/54 (40.74%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/assistant-owner-grant.ts | LOADED | 32 | 42/74 (56.76%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/assistant/agent-daemon-scope-control.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/22 (0.00%) | 0/6 (0.00%) |
| development/evals/tool-search-rerank-ceiling.eval.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/10 (0.00%) | 0/8 (0.00%) |
| development/scripts/check-route-coverage-floor.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/10 (0.00%) | 0/1 (0.00%) |
| apps/desktop/scripts/verify-staged-closure.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| apps/site-chat/src/loader-host.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/32 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/deployments/deploy-targets/registry.ts | LOADED | 31 | 128/159 (80.50%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/features/plugin-runtime/plugin-tool-messages.ts | LOADED | 31 | 41/72 (56.94%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/publish-content/ui/replan.ts | LOADED | 31 | 75/106 (70.75%) | 3/4 (75.00%) | 2/9 (22.22%) |
| apps/website/src/features/trash/move-to-trash.ts | LOADED | 31 | 136/167 (81.44%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/web-screenshot/desktop-page-capture.ts | LOADED | 31 | 43/74 (58.11%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/platform/site-dir/site-running.ts | LOADED | 31 | 16/47 (34.04%) | 3/3 (100.00%) | 2/8 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/put-execution-credential.ts | LOADED | 31 | 76/107 (71.03%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/test-agent.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/20 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/database/timeline.ts | LOADED | 31 | 52/83 (62.65%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/peers.ts | LOADED | 31 | 125/156 (80.13%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/redirects/update.ts | LOADED | 31 | 33/64 (51.56%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/users/delete.ts | LOADED | 31 | 43/74 (58.11%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/region-mutate-placements.ts | LOADED | 31 | 55/86 (63.95%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts | LOADED | 31 | 52/83 (62.65%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/public-http/routes/members/oidc-verify-email.ts | LOADED | 31 | 23/54 (42.59%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/runtime/composition/browser-analytics-http.ts | LOADED | 31 | 29/60 (48.33%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/runtime/composition/form-delivery.ts | LOADED | 31 | 70/101 (69.31%) | 3/4 (75.00%) | 2/7 (28.57%) |
| scripts/forms-maintenance.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| apps/desktop/scripts/stage-website-shared.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/agent-plugins/connect-tool.ts | LOADED | 30 | 179/209 (85.65%) | 2/2 (100.00%) | 1/24 (4.17%) |
| apps/website/src/features/deployments/deploy-ops/tool-registrations.ts | LOADED | 30 | 35/65 (53.85%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/media/verify-published-media.ts | LOADED | 30 | 70/100 (70.00%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/settings/admin-interface.ts | LOADED | 30 | 66/96 (68.75%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/features/site-backup/import-plugin-state.ts | LOADED | 30 | 52/82 (63.41%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/site-backup/static-export-selection.ts | LOADED | 30 | 43/73 (58.90%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/sites/site-preview/playwright-site-preview-capture.ts | LOADED | 30 | 109/139 (78.42%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/theme/page-publication.ts | LOADED | 30 | 30/60 (50.00%) | 3/4 (75.00%) | 2/6 (33.33%) |
| apps/website/src/features/trash/adapters/media.ts | LOADED | 30 | 65/95 (68.42%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/trash/adapters/post.ts | LOADED | 30 | 61/91 (67.03%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/web/tool-registrations.ts | LOADED | 30 | 51/81 (62.96%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/platform/db/repos/entry-refs-repo.ts | LOADED | 30 | 96/126 (76.19%) | 3/4 (75.00%) | 2/13 (15.38%) |
| apps/website/src/platform/db/repos/publish-content-run-repo.ts | LOADED | 30 | 57/87 (65.52%) | 3/4 (75.00%) | 2/8 (25.00%) |
| apps/website/src/server/inbound/admin-http/admin-static.ts | LOADED | 30 | 74/104 (71.15%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/http/menus.ts | LOADED | 30 | 155/185 (83.78%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/server/inbound/admin-http/routes/integrations/list.ts | LOADED | 30 | 55/85 (64.71%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/menus/create.ts | LOADED | 30 | 58/88 (65.91%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/route-helpers.ts | LOADED | 30 | 104/134 (77.61%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/server/inbound/admin-http/routes/redirects/hits.ts | LOADED | 30 | 21/51 (41.18%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/assistant/assistant-tool-access.ts | LOADED | 30 | 37/67 (55.22%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/public-http/routes/external-mcp/oauth-callback.ts | LOADED | 30 | 145/175 (82.86%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/runtime/composition/site-search-tools.ts | LOADED | 30 | 73/103 (70.87%) | 2/2 (100.00%) | 1/5 (20.00%) |
| development/evals/tool-search-argument-fill-adversarial.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/14 (0.00%) | 0/21 (0.00%) |
| development/scripts/build-server.mjs | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| development/scripts/repair-site.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/16 (0.00%) | 0/2 (0.00%) |
| development/scripts/unlink-jini.mjs | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/16 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/content-duplication/tool-registrations.ts | LOADED | 29 | 164/193 (84.97%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/database-transfer/destination-ui.ts | LOADED | 29 | 29/58 (50.00%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/deployments/export-run.ts | LOADED | 29 | 247/276 (89.49%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/domain-dns/tools.ts | LOADED | 29 | 140/169 (82.84%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/forms/protect-existing-files.ts | LOADED | 29 | 29/58 (50.00%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/post/go-live.ts | LOADED | 29 | 156/185 (84.32%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/publish-content/pull.ts | LOADED | 29 | 58/87 (66.67%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/seo/cover-image.ts | LOADED | 29 | 67/96 (69.79%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/site-backup/import-archive-reader.ts | LOADED | 29 | 56/85 (65.88%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/skills/install-tool.ts | LOADED | 29 | 79/108 (73.15%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/tool-audit/repo.ts | LOADED | 29 | 129/158 (81.65%) | 3/4 (75.00%) | 2/7 (28.57%) |
| apps/website/src/features/webmcp/published-html.ts | LOADED | 29 | 45/74 (60.81%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/platform/db/migrations/0011_drop_empty_core_commerce_tables.ts | LOADED | 29 | 187/216 (86.57%) | 9/15 (60.00%) | 5/7 (71.43%) |
| apps/website/src/platform/db/repos/outbox-repo.ts | LOADED | 29 | 127/156 (81.41%) | 3/4 (75.00%) | 2/10 (20.00%) |
| apps/website/src/platform/server-logs/console-tee.ts | LOADED | 29 | 94/123 (76.42%) | 20/22 (90.91%) | 8/13 (61.54%) |
| apps/website/src/platform/site-dir/read-template.ts | LOADED | 29 | 66/95 (69.47%) | 5/7 (71.43%) | 4/5 (80.00%) |
| apps/website/src/platform/site-dir/site-databases.ts | LOADED | 29 | 51/80 (63.75%) | 10/23 (43.48%) | 6/12 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/integrations/pause.ts | LOADED | 29 | 50/79 (63.29%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/menus/get-by-id.ts | LOADED | 29 | 24/53 (45.28%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/seo/get-entry.ts | LOADED | 29 | 23/52 (44.23%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/region-get.ts | LOADED | 29 | 24/53 (45.28%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/assistant/assistant-system-overlay.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/22 (0.00%) | 0/8 (0.00%) |
| apps/website/src/server/runtime/composition/installed-extension-tools.ts | LOADED | 29 | 90/119 (75.63%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/runtime/composition/product-events.ts | LOADED | 29 | 74/103 (71.84%) | 13/13 (100.00%) | 8/16 (50.00%) |
| apps/website/src/assistant/desktop-mcp-runtime.ts | LOADED | 28 | 59/87 (67.82%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/assistant/site/capability-registry.ts | LOADED | 28 | 146/174 (83.91%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/cli/commands/init.ts | LOADED | 28 | 145/173 (83.82%) | 8/21 (38.10%) | 7/8 (87.50%) |
| apps/website/src/features/form-destinations/registry.ts | LOADED | 28 | 80/108 (74.07%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/features/identity/api-key-secret.ts | LOADED | 28 | 209/237 (88.19%) | 3/3 (100.00%) | 2/13 (15.38%) |
| apps/website/src/features/members/mailer.console.ts | LOADED | 28 | 65/93 (69.89%) | 3/4 (75.00%) | 2/7 (28.57%) |
| apps/website/src/features/publish-trust/connect.ts | LOADED | 28 | 169/197 (85.79%) | 3/3 (100.00%) | 2/6 (33.33%) |
| apps/website/src/features/site-inspection/section-collector.ts | LOADED | 28 | 149/177 (84.18%) | 3/4 (75.00%) | 2/7 (28.57%) |
| apps/website/src/features/theme/file-mutation-tools.ts | LOADED | 28 | 36/64 (56.25%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/theme/structure-only-theme.ts | LOADED | 28 | 26/54 (48.15%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/theme/theme-watcher.ts | LOADED | 28 | 69/97 (71.13%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/change-sets/get.ts | LOADED | 28 | 30/58 (51.72%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/redirects/list.ts | LOADED | 28 | 28/56 (50.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/seo/get-entry-analyze.ts | LOADED | 28 | 21/49 (42.86%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/seo/put-entry.ts | LOADED | 28 | 64/92 (69.57%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/settings/reset.ts | LOADED | 28 | 53/81 (65.43%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/system/mail-test-send.ts | LOADED | 28 | 51/79 (64.56%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/taxonomy/rename-term.ts | LOADED | 28 | 29/57 (50.88%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/themes/list.ts | LOADED | 28 | 73/101 (72.28%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/users/attach-policy.ts | LOADED | 28 | 38/66 (57.58%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/public-http/http/site/handlebars-render.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/agent-plugin-surfaces/export-files.ts | LOADED | 28 | 40/68 (58.82%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/runtime/composition/plugin-credential-cards.ts | LOADED | 28 | 56/84 (66.67%) | 2/2 (100.00%) | 1/6 (16.67%) |
| development/evals/tool-search-caller2-score-captures.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/16 (0.00%) | 0/6 (0.00%) |
| apps/website/src/assistant/assistant-vault.ts | LOADED | 27 | 50/77 (64.94%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/assistant/run-active-context.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/20 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/agent-plugins/executable-tools/host-bindings.ts | LOADED | 27 | 69/96 (71.88%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/agent-plugins/soon-lock.ts | LOADED | 27 | 68/95 (71.58%) | 3/4 (75.00%) | 2/8 (25.00%) |
| apps/website/src/features/custom-credentials/credential-ports.ts | LOADED | 27 | 52/79 (65.82%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/form-destinations/select.ts | LOADED | 27 | 25/52 (48.08%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/media/promote-chat-attachment.ts | LOADED | 27 | 186/213 (87.32%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/navigation/migrate-footer-page-links.ts | LOADED | 27 | 70/97 (72.16%) | 8/10 (80.00%) | 7/15 (46.67%) |
| apps/website/src/features/plugin-runtime/enable-confirmation-ui.ts | LOADED | 27 | 53/80 (66.25%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/plugin-runtime/host-binding.ts | LOADED | 27 | 96/123 (78.05%) | 3/3 (100.00%) | 2/13 (15.38%) |
| apps/website/src/features/post/preview-tool.ts | LOADED | 27 | 58/85 (68.24%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/project-keys/shared-oauth-disconnect.ts | LOADED | 27 | 25/52 (48.08%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/site-export/public-origin-policy.ts | LOADED | 27 | 30/57 (52.63%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/trash/adapters/redirect.ts | LOADED | 27 | 46/73 (63.01%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/db/migrations/0013_unify_vault_credentials.ts | LOADED | 27 | 40/67 (59.70%) | 6/7 (85.71%) | 5/8 (62.50%) |
| apps/website/src/platform/site-dir/move-sites-home.ts | LOADED | 27 | 259/286 (90.56%) | 43/72 (59.72%) | 26/45 (57.78%) |
| apps/website/src/server/inbound/admin-http/http/integrations.ts | LOADED | 27 | 102/129 (79.07%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/http/media.ts | LOADED | 27 | 125/152 (82.24%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/forms/create.ts | LOADED | 27 | 48/75 (64.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/integrations/delete.ts | LOADED | 27 | 36/63 (57.14%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/taxonomy/create-taxonomy.ts | LOADED | 27 | 25/52 (48.08%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/assign-role.ts | LOADED | 27 | 38/65 (58.46%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/workspace/update.ts | LOADED | 27 | 46/73 (63.01%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/assistant/assistant-run-tool-policy.ts | LOADED | 27 | 25/52 (48.08%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/public-http/routes/members/sign-in.ts | LOADED | 27 | 43/70 (61.43%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/shared/json-body-parsers.ts | LOADED | 27 | 90/117 (76.92%) | 2/2 (100.00%) | 1/6 (16.67%) |
| content/themes/static/tovu-starter/scripts/theme-toggle.js | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/16 (0.00%) | 0/6 (0.00%) |
| development/scripts/dev-lite.mjs | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/12 (0.00%) | 0/11 (0.00%) |
| apps/website/src/assistant/lost-frontend-binding.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/18 (0.00%) | 0/6 (0.00%) |
| apps/website/src/contracts/core/public-page-security-headers.ts | LOADED | 26 | 59/85 (69.41%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/agent-plugins/exports/diagnostics.ts | LOADED | 26 | 28/54 (51.85%) | 3/4 (75.00%) | 2/7 (28.57%) |
| apps/website/src/features/agent-plugins/layout.ts | LOADED | 26 | 83/109 (76.15%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/analytics/jini-adapters.ts | LOADED | 26 | 86/112 (76.79%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/api-connections/host-bindings.ts | LOADED | 26 | 57/83 (68.67%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/custom-credentials/custom-credential-create-ui.ts | LOADED | 26 | 158/184 (85.87%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/entries/repo.rows.ts | LOADED | 26 | 36/62 (58.06%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/entries/unreadable-owner-entries-repair.ts | LOADED | 26 | 155/181 (85.64%) | 11/16 (68.75%) | 10/12 (83.33%) |
| apps/website/src/features/external-mcp/external-mcp-oauth.ts | LOADED | 26 | 142/168 (84.52%) | 3/4 (75.00%) | 2/21 (9.52%) |
| apps/website/src/features/site-backup/push-jobs.ts | LOADED | 26 | 95/121 (78.51%) | 5/5 (100.00%) | 4/8 (50.00%) |
| apps/website/src/features/theme/static-portability-index.ts | LOADED | 26 | 208/234 (88.89%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/features/theme/theme-preview-image.ts | LOADED | 26 | 88/114 (77.19%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/widgets/deps.ts | LOADED | 26 | 114/140 (81.43%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/platform/db/sqlite/reset-legacy-site-title-pin.ts | LOADED | 26 | 64/90 (71.11%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/platform/secrets/vault-kinds.ts | LOADED | 26 | 76/102 (74.51%) | 6/6 (100.00%) | 5/10 (50.00%) |
| apps/website/src/platform/site-dir/resolve-install-dir-target.ts | LOADED | 26 | 40/66 (60.61%) | 4/5 (80.00%) | 3/4 (75.00%) |
| apps/website/src/platform/site-dir/schema-guard.ts | LOADED | 26 | 78/104 (75.00%) | 4/5 (80.00%) | 3/8 (37.50%) |
| apps/website/src/server/inbound/admin-http/routes/forms/get-by-id.ts | LOADED | 26 | 27/53 (50.94%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/integrations/create.ts | LOADED | 26 | 46/72 (63.89%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/pages/get-by-id.ts | LOADED | 26 | 66/92 (71.74%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/redirects/get-by-id.ts | LOADED | 26 | 17/43 (39.53%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/redirects/import.ts | LOADED | 26 | 33/59 (55.93%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/workspace/delete.ts | LOADED | 26 | 99/125 (79.20%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/public-http/middleware/theme-static-assets.ts | LOADED | 26 | 153/179 (85.47%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/server/runtime/composition/registered-sites.ts | LOADED | 26 | 41/67 (61.19%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/runtime/composition/serving-app.ts | LOADED | 26 | 89/115 (77.39%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/admin/vite.config.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/26 (0.00%) | 0/4 (0.00%) |
| apps/site-chat/scripts/measure-bundles.mjs | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/6 (0.00%) | 0/9 (0.00%) |
| apps/website/src/cli/commands/owner-store-import.ts | LOADED | 25 | 73/98 (74.49%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/cli/commands/theme/validate.ts | LOADED | 25 | 70/95 (73.68%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/agent-plugins/exports/source.ts | LOADED | 25 | 45/70 (64.29%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/api-connections/form-delivery-connection.ts | LOADED | 25 | 94/119 (78.99%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/forms/form-destination-manifest.ts | LOADED | 25 | 74/99 (74.75%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/fs-files/native-folder-picker.ts | LOADED | 25 | 132/157 (84.08%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/platform/db/repos/analytics-sink.ts | LOADED | 25 | 95/120 (79.17%) | 3/4 (75.00%) | 2/11 (18.18%) |
| apps/website/src/platform/db/repos/external-mcp-tool-approval-repo.ts | LOADED | 25 | 49/74 (66.22%) | 3/4 (75.00%) | 2/9 (22.22%) |
| apps/website/src/platform/db/repos/publish-content-bundle-repo.ts | LOADED | 25 | 51/76 (67.11%) | 3/4 (75.00%) | 2/8 (25.00%) |
| apps/website/src/platform/server-logs/log-buffer.ts | LOADED | 25 | 112/137 (81.75%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/put-settings.ts | LOADED | 25 | 39/64 (60.94%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/members/get-by-id.ts | LOADED | 25 | 43/68 (63.24%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/posts/template-preview.ts | LOADED | 25 | 219/244 (89.75%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/inbound/admin-http/routes/redirects/tombstone.ts | LOADED | 25 | 25/50 (50.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/settings/assistant-subagents-access.ts | LOADED | 25 | 63/88 (71.59%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/server/runtime/composition/analytics-providers.ts | LOADED | 25 | 59/84 (70.24%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/composition/public-site-guide.ts | LOADED | 25 | 20/45 (44.44%) | 2/2 (100.00%) | 1/3 (33.33%) |
| development/scripts/lib/tovu-test-server.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/8 (0.00%) | 0/8 (0.00%) |
| ADS-memory/reports/architecture/2026-08-18-ag-ui-sample/frontend-agui-chat.sample.tsx | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/24 (0.00%) | 0/8 (0.00%) |
| apps/admin/src/features/email/email-api.ts | LOADED | 24 | 8/32 (25.00%) | 2/12 (16.67%) | 2/24 (8.33%) |
| apps/website/src/assistant/persistence/conversation-tool-approval-store.ts | LOADED | 24 | 47/71 (66.20%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/assistant/site/tools.ts | LOADED | 24 | 255/279 (91.40%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/assistant/tool-search-keywords.ts | LOADED | 24 | 135/159 (84.91%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/cli/commands/storage-move.ts | LOADED | 24 | 38/62 (61.29%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/agent-plugins/update-effects.ts | LOADED | 24 | 52/76 (68.42%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/consent/revisions.repo.ts | LOADED | 24 | 25/49 (51.02%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/database-transfer/destination-exchange.ts | LOADED | 24 | 21/45 (46.67%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/identity/mfa.repo.ts | LOADED | 24 | 32/56 (57.14%) | 6/7 (85.71%) | 5/10 (50.00%) |
| apps/website/src/features/member-login/providers.ts | LOADED | 24 | 41/65 (63.08%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/navigation/trash-aware-memory-menu-repo.ts | LOADED | 24 | 110/134 (82.09%) | 3/4 (75.00%) | 2/16 (12.50%) |
| apps/website/src/features/project-keys/attachments.ts | LOADED | 24 | 26/50 (52.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/project-keys/site-sealer.ts | LOADED | 24 | 35/59 (59.32%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/publish-content/publish-readiness.ts | LOADED | 24 | 131/155 (84.52%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/publish-trust/keys.ts | LOADED | 24 | 181/205 (88.29%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/settings/form-delivery-write.ts | LOADED | 24 | 36/60 (60.00%) | 4/4 (100.00%) | 3/7 (42.86%) |
| apps/website/src/features/settings/visitor-tools-configure.ts | LOADED | 24 | 31/55 (56.36%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/site-search/settings.ts | LOADED | 24 | 61/85 (71.76%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/theme/preview-switcher-tools.ts | LOADED | 24 | 41/65 (63.08%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/analytics/recent-hits.ts | LOADED | 24 | 88/112 (78.57%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/visitor-tools.ts | LOADED | 24 | 35/59 (59.32%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/comments/put-settings.ts | LOADED | 24 | 34/58 (58.62%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/create-subscription.ts | LOADED | 24 | 34/58 (58.62%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/plugins/chart-providers.ts | LOADED | 24 | 28/52 (53.85%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/export.ts | LOADED | 24 | 111/135 (82.22%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/settings/get-raw.ts | LOADED | 24 | 58/82 (70.73%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/trash/purge.ts | LOADED | 24 | 73/97 (75.26%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/users/create-policy.ts | LOADED | 24 | 38/62 (61.29%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/create-role.ts | LOADED | 24 | 23/47 (48.94%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/delete-policy.ts | LOADED | 24 | 35/59 (59.32%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/users/delete-role.ts | LOADED | 24 | 35/59 (59.32%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/users/update-policy.ts | LOADED | 24 | 35/59 (59.32%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/public-http/http/shared/post.ts | LOADED | 24 | 58/82 (70.73%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/runtime/composition/commerce-http.ts | LOADED | 24 | 33/57 (57.89%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/composition/plugin-activation-polling.ts | LOADED | 24 | 87/111 (78.38%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/assistant/mcp-federation/reload-adapter.ts | LOADED | 23 | 25/48 (52.08%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/cli/commands/import-site.ts | LOADED | 23 | 30/53 (56.60%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/contracts/core/expand-partials.ts | LOADED | 23 | 63/86 (73.26%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/agent-plugins/memory.ts | LOADED | 23 | 46/69 (66.67%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/mail/attempts.repo.ts | LOADED | 23 | 14/37 (37.84%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/post/html-plain-text.ts | LOADED | 23 | 76/99 (76.77%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/site-backup/share-preparation.ts | LOADED | 23 | 23/46 (50.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/site-inspection/deps.ts | LOADED | 23 | 143/166 (86.14%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/taxonomy/repo.rows.ts | LOADED | 23 | 58/81 (71.60%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/trash/adapters/member.ts | LOADED | 23 | 41/64 (64.06%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/workspace/repo.ts | LOADED | 23 | 65/88 (73.86%) | 3/4 (75.00%) | 2/13 (15.38%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/stored-credential-probe.ts | LOADED | 23 | 204/227 (89.87%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/forms/authoring.ts | LOADED | 23 | 37/60 (61.67%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/fs-files/custom-root.ts | LOADED | 23 | 90/113 (79.65%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/media/text.ts | LOADED | 23 | 25/48 (52.08%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/sites/site-previews.ts | LOADED | 23 | 54/77 (70.13%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/taxonomy/delete-term.ts | LOADED | 23 | 32/55 (58.18%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/routes/members/oidc-start.ts | LOADED | 23 | 23/46 (50.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/public-http/routes/site/product-checkout.ts | LOADED | 23 | 30/53 (56.60%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/runtime/composition/modules/newsletter.ts | LOADED | 23 | 50/73 (68.49%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/observability-export.ts | LOADED | 23 | 24/47 (51.06%) | 3/3 (100.00%) | 2/8 (25.00%) |
| apps/website/src/server/runtime/composition/source-control-key-binding.ts | LOADED | 23 | 17/40 (42.50%) | 2/2 (100.00%) | 1/2 (50.00%) |
| development/evals/probe-caps-retrieval.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| development/evals/tool-search-eval-registry.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/2 (0.00%) | 0/19 (0.00%) |
| .dependency-cruiser.mjs | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/6 (0.00%) | 0/9 (0.00%) |
| apps/website/src/assistant/public-assistant-settings.ts | LOADED | 22 | 234/256 (91.41%) | 3/3 (100.00%) | 2/6 (33.33%) |
| apps/website/src/assistant/runtime-preferences.ts | LOADED | 22 | 42/64 (65.63%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/api-connections/surface-connection-bindings.ts | LOADED | 22 | 22/44 (50.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/comments/public-markers.ts | LOADED | 22 | 13/35 (37.14%) | 3/3 (100.00%) | 2/6 (33.33%) |
| apps/website/src/features/consent/ensure-privacy-defaults.ts | LOADED | 22 | 31/53 (58.49%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/form-destinations/key-store.ts | LOADED | 22 | 47/69 (68.12%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/publish-content/content-references.ts | LOADED | 22 | 56/78 (71.79%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/publish-content/ui/publish-order.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/12 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/taxonomy/render-entry.ts | LOADED | 22 | 16/38 (42.11%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/web-screenshot/tool-registrations.ts | LOADED | 22 | 47/69 (68.12%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/platform/db/repos/publish-content-baseline-repo.ts | LOADED | 22 | 51/73 (69.86%) | 3/4 (75.00%) | 2/7 (28.57%) |
| apps/website/src/server/inbound/admin-http/routes/comments/moderation-queue.ts | LOADED | 22 | 48/70 (68.57%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/media/delete.ts | LOADED | 22 | 46/68 (67.65%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/send-test-campaign.ts | LOADED | 22 | 27/49 (55.10%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/recovery/deep-link.ts | LOADED | 22 | 27/49 (55.10%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/update.ts | LOADED | 22 | 21/43 (48.84%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/routes/members/me.ts | LOADED | 22 | 20/42 (47.62%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/composition/build-release.ts | LOADED | 22 | 22/44 (50.00%) | 3/3 (100.00%) | 2/12 (16.67%) |
| apps/website/src/server/runtime/composition/reset-owner.ts | LOADED | 22 | 24/46 (52.17%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/plugin-tier2/run-in-worker.ts | LOADED | 22 | 105/127 (82.68%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/site-chat/src/SiteToolConfirmation.hooks.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| apps/website/src/assistant/a2ui-actions-route.ts | LOADED | 21 | 174/195 (89.23%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/assistant/assistant-vault-compat.ts | LOADED | 21 | 39/60 (65.00%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/assistant/installed-extension-tools.ts | LOADED | 21 | 132/153 (86.27%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/assistant/persistence/store-factory.ts | LOADED | 21 | 42/63 (66.67%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/cli/commands/plugin/install.ts | LOADED | 21 | 43/64 (67.19%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/cli/commands/theme/normalize-build.ts | LOADED | 21 | 55/76 (72.37%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/analytics/config.settings.ts | LOADED | 21 | 202/223 (90.58%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/post/featured-image.ts | LOADED | 21 | 58/79 (73.42%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/server-logs/tool-registrations.ts | LOADED | 21 | 30/51 (58.82%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/site-search/access.ts | LOADED | 21 | 56/77 (72.73%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/platform/site-dir/seed-starter-title.ts | LOADED | 21 | 13/34 (38.24%) | 7/9 (77.78%) | 4/6 (66.67%) |
| apps/website/src/server/inbound/admin-http/routes/change-sets/list.ts | LOADED | 21 | 20/41 (48.78%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/deps.ts | LOADED | 21 | 146/167 (87.43%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/list-send-log.ts | LOADED | 21 | 16/37 (43.24%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/sites/warm-site-control.ts | LOADED | 21 | 30/51 (58.82%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/skills/files.ts | LOADED | 21 | 22/43 (51.16%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/server-logs.ts | LOADED | 21 | 37/58 (63.79%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/workspace/create.ts | LOADED | 21 | 27/48 (56.25%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/assistant/early-run-session.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/28 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/runtime/composition/chart-providers.ts | LOADED | 21 | 39/60 (65.00%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/runtime/composition/provider-revision-watch.ts | LOADED | 21 | 34/55 (61.82%) | 2/2 (100.00%) | 1/4 (25.00%) |
| content/themes/__original-themes__/static/tovu-starter/scripts/theme-toggle.js | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| content/themes/__original-themes__/static/tovu-theme/scripts/theme-toggle.js | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| content/themes/static/tovu-theme/scripts/theme-toggle.js | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| development/scripts/dev-server.mjs | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| development/scripts/jini-links.mjs | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/0 (0.00%) | 0/8 (0.00%) |
| apps/website/src/assistant/byok-credential.ts | LOADED | 20 | 155/175 (88.57%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/agent-plugins/bundled-catalog.ts | LOADED | 20 | 148/168 (88.10%) | 5/5 (100.00%) | 4/10 (40.00%) |
| apps/website/src/features/agent-plugins/grant-signed-in-defaults.ts | LOADED | 20 | 43/63 (68.25%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/asset-transfer/asset-sources.ts | LOADED | 20 | 45/65 (69.23%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/database-transfer/confirmation-ui.ts | LOADED | 20 | 25/45 (55.56%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/deployments/static-publish/domain-publish-rows.ts | LOADED | 20 | 27/47 (57.45%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/forms/submission-ip-expiry-sweep.ts | LOADED | 20 | 32/52 (61.54%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/fs-files/custom-root-store.ts | LOADED | 20 | 228/248 (91.94%) | 3/3 (100.00%) | 2/12 (16.67%) |
| apps/website/src/features/identity/user-purge.ts | LOADED | 20 | 72/92 (78.26%) | 3/4 (75.00%) | 2/5 (40.00%) |
| apps/website/src/features/settings/ui-locales-tool.ts | LOADED | 20 | 62/82 (75.61%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/source-control/provider-kit.ts | LOADED | 20 | 29/49 (59.18%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/taxonomy/gated-hooks.ts | LOADED | 20 | 83/103 (80.58%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/theme/sync-originals.ts | LOADED | 20 | 180/200 (90.00%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/theme/template-applicability.ts | LOADED | 20 | 27/47 (57.45%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/webmcp/settings.ts | LOADED | 20 | 17/37 (45.95%) | 3/3 (100.00%) | 2/6 (33.33%) |
| apps/website/src/platform/db/kernel/ops.ts | LOADED | 20 | 17/37 (45.95%) | 3/3 (100.00%) | 2/6 (33.33%) |
| apps/website/src/platform/db/migrations/chat/0002_durable_run_attempts.ts | LOADED | 20 | 13/33 (39.39%) | 7/9 (77.78%) | 6/8 (75.00%) |
| apps/website/src/platform/db/sqlite/publish-backstop-audit.sqlite.ts | LOADED | 20 | 14/34 (41.18%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/site-dir/product-root.ts | LOADED | 20 | 154/174 (88.51%) | 25/41 (60.98%) | 13/18 (72.22%) |
| apps/website/src/server/inbound/admin-http/routes/forms/list.ts | LOADED | 20 | 17/37 (45.95%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/put-providers.ts | LOADED | 20 | 60/80 (75.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/get-campaign.ts | LOADED | 20 | 14/34 (41.18%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/import-subscriptions.ts | LOADED | 20 | 34/54 (62.96%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/plugins/files.ts | LOADED | 20 | 51/71 (71.83%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/posts/get-by-id.ts | LOADED | 20 | 26/46 (56.52%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/blob-get.ts | LOADED | 20 | 106/126 (84.13%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/blob-put.ts | LOADED | 20 | 72/92 (78.26%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/blobs-probe.ts | LOADED | 20 | 68/88 (77.27%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/import-errors.ts | LOADED | 20 | 23/43 (53.49%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/seo/get-settings.ts | LOADED | 20 | 18/38 (47.37%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/seo/post-sitemap-regenerate.ts | LOADED | 20 | 17/37 (45.95%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/settings/get-effective.ts | LOADED | 20 | 72/92 (78.26%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/site/profile.ts | LOADED | 20 | 176/196 (89.80%) | 3/3 (100.00%) | 2/8 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/update-role.ts | LOADED | 20 | 37/57 (64.91%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/preview.ts | LOADED | 20 | 20/40 (50.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/public-http/http/site/bare-page.ts | LOADED | 20 | 129/149 (86.58%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/public-http/http/site/external-links.ts | LOADED | 20 | 114/134 (85.07%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/server/runtime/composition/database-transfer-adapters.ts | LOADED | 20 | 29/49 (59.18%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/runtime/composition/domain-binding-sweeper.ts | LOADED | 20 | 78/98 (79.59%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/runtime/composition/site-cookie-consent.ts | LOADED | 20 | 44/64 (68.75%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/assistant/cli-probe-cache.ts | LOADED | 19 | 37/56 (66.07%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/assistant/component-catalog-query.ts | LOADED | 19 | 93/112 (83.04%) | 3/3 (100.00%) | 2/7 (28.57%) |
| apps/website/src/features/agent-plugins/apply-connect-defaults.ts | LOADED | 19 | 59/78 (75.64%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/api-connections/browser-binding.ts | LOADED | 19 | 50/69 (72.46%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/comments/index.ts | LOADED | 19 | 44/63 (69.84%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/features/image-transform/tool.ts | LOADED | 19 | 74/93 (79.57%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/newsletter/errors.ts | LOADED | 19 | 108/127 (85.04%) | 14/22 (63.64%) | 13/29 (44.83%) |
| apps/website/src/features/newsletter/hooks.ts | LOADED | 19 | 79/98 (80.61%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/plugin-runtime/capability-tool-registrations.ts | LOADED | 19 | 110/129 (85.27%) | 2/2 (100.00%) | 1/13 (7.69%) |
| apps/website/src/features/publish-content/disconnect-tool.ts | LOADED | 19 | 35/54 (64.81%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/settings/mail-sender.ts | LOADED | 19 | 31/50 (62.00%) | 3/3 (100.00%) | 2/8 (25.00%) |
| apps/website/src/features/trash/entry-sql.ts | LOADED | 19 | 64/83 (77.11%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/entries/list.ts | LOADED | 19 | 19/38 (50.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/members/list.ts | LOADED | 19 | 54/73 (73.97%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/create-list.ts | LOADED | 19 | 23/42 (54.76%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/create.ts | LOADED | 19 | 44/63 (69.84%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/assistant/assistant-run-tool-facts.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/16 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/assistant/assistant-tool-consent.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/36 (0.00%) | 0/11 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site-assistant-confirm.ts | LOADED | 19 | 37/56 (66.07%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/runtime/boot/mail-provider-catalog.ts | LOADED | 19 | 99/118 (83.90%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/server/runtime/composition/modules/content.ts | LOADED | 19 | 107/126 (84.92%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/forms.ts | LOADED | 19 | 69/88 (78.41%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/visitor-page-targets.ts | LOADED | 19 | 21/40 (52.50%) | 2/2 (100.00%) | 1/2 (50.00%) |
| development/evals/tool-search-export-corpus.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/12 (0.00%) | 0/3 (0.00%) |
| development/scripts/check-capability-inventory.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| development/scripts/check-immutable-migrations.mjs | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| ADS-memory/reports/codex-audit/measure-cognitive.cjs | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| apps/website/src/assistant/external-mcp-tool-approval-adapters.ts | LOADED | 18 | 46/64 (71.88%) | 3/4 (75.00%) | 2/11 (18.18%) |
| apps/website/src/cli/commands/agent-plugin-tokens.ts | LOADED | 18 | 92/110 (83.64%) | 5/8 (62.50%) | 4/10 (40.00%) |
| apps/website/src/cli/program.ts | LOADED | 18 | 263/281 (93.59%) | 6/6 (100.00%) | 4/25 (16.00%) |
| apps/website/src/features/agent-plugins/switch-on-saved-token.ts | LOADED | 18 | 37/55 (67.27%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/comments/ip-hash-salt.ts | LOADED | 18 | 57/75 (76.00%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/features/domain-dns/mail-dns-tools.ts | LOADED | 18 | 50/68 (73.53%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/form-destinations/deliver.ts | LOADED | 18 | 51/69 (73.91%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/form-destinations/rewrite-actions.ts | LOADED | 18 | 28/46 (60.87%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/mail/retention.ts | LOADED | 18 | 27/45 (60.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/media/content-type-resolution.ts | LOADED | 18 | 75/93 (80.65%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/media/hydrate-blob-store-from-seed.ts | LOADED | 18 | 214/232 (92.24%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/post/search-index.sqlite.ts | LOADED | 18 | 120/138 (86.96%) | 1/1 (100.00%) | 0/3 (0.00%) |
| apps/website/src/features/skills/live-registration.ts | LOADED | 18 | 21/39 (53.85%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/platform/site-dir/errors.ts | LOADED | 18 | 44/62 (70.97%) | 9/9 (100.00%) | 8/20 (40.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/get-site-credential.ts | LOADED | 18 | 28/46 (60.87%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/resolve-test-agent-outcome.ts | LOADED | 18 | 56/74 (75.68%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/comments/get-settings.ts | LOADED | 18 | 27/45 (60.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/tool-approvals.ts | LOADED | 18 | 33/51 (64.71%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/taxonomy/delete-taxonomy.ts | LOADED | 18 | 35/53 (66.04%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/embed-remove.ts | LOADED | 18 | 20/38 (52.63%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/routes/site/newsletter-confirm.ts | LOADED | 18 | 35/53 (66.04%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/boot/boot-readiness-gate.ts | LOADED | 18 | 66/84 (78.57%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/composition/modules/assistant-tool-access-lowering.ts | LOADED | 18 | 20/38 (52.63%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/composition/plugin-runtime.ts | LOADED | 18 | 91/109 (83.49%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/lifecycle/warm-site-retirement.ts | LOADED | 18 | 34/52 (65.38%) | 2/2 (100.00%) | 1/3 (33.33%) |
| .semgrep/tests/no-raw-fetch.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/assistant/cli-permission-layer.ts | LOADED | 17 | 20/37 (54.05%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/assistant/permanent-delete-settings.ts | LOADED | 17 | 21/38 (55.26%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/contracts/core/approval-i18n.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/12 (0.00%) | 0/1 (0.00%) |
| apps/website/src/contracts/core/credential-copy.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/12 (0.00%) | 0/8 (0.00%) |
| apps/website/src/contracts/core/rate-limit/rate-limit.ts | LOADED | 17 | 204/221 (92.31%) | 3/3 (100.00%) | 2/6 (33.33%) |
| apps/website/src/features/agent-plugins/admin-surfaces/surfaces.ts | LOADED | 17 | 102/119 (85.71%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/consent/region-plugins.ts | LOADED | 17 | 71/88 (80.68%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/custom-credentials/custom-credential-set-token-ui.ts | LOADED | 17 | 92/109 (84.40%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/identity/passkeys.repo.ts | LOADED | 17 | 17/34 (50.00%) | 3/3 (100.00%) | 2/6 (33.33%) |
| apps/website/src/features/identity/permission-list-tool.ts | LOADED | 17 | 32/49 (65.31%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/identity/wiring.ts | LOADED | 17 | 358/375 (95.47%) | 9/14 (64.29%) | 8/13 (61.54%) |
| apps/website/src/features/mail/feedback-route.ts | LOADED | 17 | 60/77 (77.92%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/media/list-pending-chat-attachments.ts | LOADED | 17 | 98/115 (85.22%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/publish-content/connect-destination.ts | LOADED | 17 | 168/185 (90.81%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/publish-content/destination-credential.ts | LOADED | 17 | 84/101 (83.17%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/publish-content/precheck-reasons.ts | LOADED | 17 | 66/83 (79.52%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/redirects/phase-handler.ts | LOADED | 17 | 78/95 (82.11%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/site-export/theme-preview-report.ts | LOADED | 17 | 12/29 (41.38%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/taxonomy/taxonomy-trash-follow-ups.ts | LOADED | 17 | 165/182 (90.66%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/theme/active-theme.ts | LOADED | 17 | 201/218 (92.20%) | 3/3 (100.00%) | 2/5 (40.00%) |
| apps/website/src/platform/db/migrations/0000_legacy_baseline.ts | LOADED | 17 | 30/47 (63.83%) | 6/7 (85.71%) | 5/9 (55.56%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/delete-site-credential.ts | LOADED | 17 | 29/46 (63.04%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/route-guards.ts | LOADED | 17 | 64/81 (79.01%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/inbound/admin-http/routes/menus/delete.ts | LOADED | 17 | 27/44 (61.36%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/schedule-campaign.ts | LOADED | 17 | 48/65 (73.85%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/send-campaign.ts | LOADED | 17 | 68/85 (80.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/server/inbound/admin-http/routes/system/assistant-daemon.ts | LOADED | 17 | 74/91 (81.32%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/site-backups.ts | LOADED | 17 | 38/55 (69.09%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/embed-insert.ts | LOADED | 17 | 24/41 (58.54%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/embed-reorder.ts | LOADED | 17 | 29/46 (63.04%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/middleware/site-consent.ts | LOADED | 17 | 46/63 (73.02%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/runtime/composition/modules/assistant-server-federation.ts | LOADED | 17 | 50/67 (74.63%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/publish-content.ts | LOADED | 17 | 81/98 (82.65%) | 2/2 (100.00%) | 1/2 (50.00%) |
| development/scripts/prepare-desktop-hooks.mjs | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/18 (0.00%) | 0/3 (0.00%) |
| apps/site-chat/src/main.tsx | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/assistant/live-model-cache.ts | LOADED | 16 | 142/158 (89.87%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/contracts/core/gated-mutations/token.ts | LOADED | 16 | 130/146 (89.04%) | 3/4 (75.00%) | 2/12 (16.67%) |
| apps/website/src/features/agent-plugins/host-tool-ports.ts | LOADED | 16 | 54/70 (77.14%) | 2/2 (100.00%) | 1/11 (9.09%) |
| apps/website/src/features/mail/feedback-inbox.repo.ts | LOADED | 16 | 17/33 (51.52%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/mail/suppression.repo.ts | LOADED | 16 | 21/37 (56.76%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/navigation/trash-menu.ts | LOADED | 16 | 46/62 (74.19%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/pages/authoring-html.ts | LOADED | 16 | 12/28 (42.86%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/settings/site-timezone.ts | LOADED | 16 | 76/92 (82.61%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/site-backup/package-file-inventory.ts | LOADED | 16 | 44/60 (73.33%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/taxonomy/collection-term-policy.ts | LOADED | 16 | 60/76 (78.95%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/theme/page-publish-tool.ts | LOADED | 16 | 39/55 (70.91%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/theme/validation/references.ts | LOADED | 16 | 87/103 (84.47%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/trash/adapters/comment.ts | LOADED | 16 | 58/74 (78.38%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/site-dir/resolve-workspace.ts | LOADED | 16 | 66/82 (80.49%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/http/redirects.ts | LOADED | 16 | 118/134 (88.06%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/server/inbound/admin-http/routes/commerce/status.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/content-types/list.ts | LOADED | 16 | 24/40 (60.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/fs-files/folder-picker.ts | LOADED | 16 | 52/68 (76.47%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/pause-campaign.ts | LOADED | 16 | 20/36 (55.56%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/recovery/status.ts | LOADED | 16 | 54/70 (77.14%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/mail-status.ts | LOADED | 16 | 47/63 (74.60%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/preview-render.ts | LOADED | 16 | 26/42 (61.90%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/assistant/agent-plugin-preflight-events.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/chat-comparison.ts | LOADED | 16 | 20/36 (55.56%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/boot/content-db-schema-guard.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/runtime/composition/commerce-settings.ts | LOADED | 16 | 25/41 (60.98%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/runtime/composition/content-events.ts | LOADED | 16 | 19/35 (54.29%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/composition/modules/external-mcp.ts | LOADED | 16 | 60/76 (78.95%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/lifecycle/readiness-state.ts | LOADED | 16 | 86/102 (84.31%) | 2/2 (100.00%) | 1/7 (14.29%) |
| development/evals/site-guide-planner.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| development/scripts/sites-move-home.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/admin/vitest.config.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/site-chat/src/tool-confirmation.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/16 (0.00%) | 0/4 (0.00%) |
| apps/website/src/assistant/admin-screen-link-tool.ts | LOADED | 15 | 212/227 (93.39%) | 3/3 (100.00%) | 2/5 (40.00%) |
| apps/website/src/assistant/credential-chat-intake.ts | LOADED | 15 | 27/42 (64.29%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/assistant/mcp-injection.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/10 (0.00%) | 0/7 (0.00%) |
| apps/website/src/assistant/rewrap-page-navigate-error.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| apps/website/src/assistant/site/visitor-tool-budgets.ts | LOADED | 15 | 40/55 (72.73%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/contracts/core/events/jini-outbox-adapter.ts | LOADED | 15 | 44/59 (74.58%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/contracts/core/native-approval-memory.ts | LOADED | 15 | 21/36 (58.33%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/agent-plugins/customize-tool.ts | LOADED | 15 | 30/45 (66.67%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/api-connections/byo-client.ts | LOADED | 15 | 21/36 (58.33%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/api-connections/contribution.ts | LOADED | 15 | 66/81 (81.48%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/content-types/repo.ts | LOADED | 15 | 54/69 (78.26%) | 3/4 (75.00%) | 2/10 (20.00%) |
| apps/website/src/features/custom-credentials/credentialed-request.ts | LOADED | 15 | 753/768 (98.05%) | 4/6 (66.67%) | 3/19 (15.79%) |
| apps/website/src/features/navigation/menu-trash-follow-ups.ts | LOADED | 15 | 81/96 (84.38%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/post/search.ts | LOADED | 15 | 264/279 (94.62%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/settings/operator-locale.ts | LOADED | 15 | 27/42 (64.29%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/features/site-backup/share-policy.ts | LOADED | 15 | 63/78 (80.77%) | 3/4 (75.00%) | 2/6 (33.33%) |
| apps/website/src/features/site-export/theme-preview-manifest.ts | LOADED | 15 | 17/32 (53.13%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/sites/warm-switch.ts | LOADED | 15 | 16/31 (51.61%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/trash/permissions.ts | LOADED | 15 | 132/147 (89.80%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/platform/db/kernel/drivers/sqlite.ts | LOADED | 15 | 44/59 (74.58%) | 7/7 (100.00%) | 6/15 (40.00%) |
| apps/website/src/platform/db/migrations/runner.ts | LOADED | 15 | 22/37 (59.46%) | 4/6 (66.67%) | 3/6 (50.00%) |
| apps/website/src/platform/http/client.ts | LOADED | 15 | 69/84 (82.14%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/server/inbound/admin-http/routes/agent-plugins/files.ts | LOADED | 15 | 51/66 (77.27%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/agent-plugins/list.ts | LOADED | 15 | 67/82 (81.71%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/members/delete.ts | LOADED | 15 | 17/32 (53.13%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/members/disable.ts | LOADED | 15 | 52/67 (77.61%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/cancel-campaign.ts | LOADED | 15 | 26/41 (63.41%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/resume-campaign.ts | LOADED | 15 | 21/36 (58.33%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/pages/list.ts | LOADED | 15 | 27/42 (64.29%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/assistant-permanent-deletes.ts | LOADED | 15 | 15/30 (50.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/mail-dns.ts | LOADED | 15 | 40/55 (72.73%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/system/module-status.ts | LOADED | 15 | 41/56 (73.21%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/site-share-password.ts | LOADED | 15 | 29/44 (65.91%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/public-http/routes/agent-plugin-surfaces/files.ts | LOADED | 15 | 54/69 (78.26%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/public-http/routes/site/newsletter-unsubscribe.ts | LOADED | 15 | 39/54 (72.22%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/public-http/routes/site/robots.ts | LOADED | 15 | 21/36 (58.33%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/browser-analytics.ts | LOADED | 15 | 20/35 (57.14%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/users.ts | LOADED | 15 | 57/72 (79.17%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/lifecycle/site-idle-park.ts | LOADED | 15 | 39/54 (72.22%) | 2/2 (100.00%) | 1/2 (50.00%) |
| development/scripts/list-server-test-files.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| apps/admin/dev-proxy-upstream-close.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| apps/site-chat/src/SiteAssistantHeader.hooks.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| apps/website/src/assistant/page-approval-context.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/agent-plugins/access-token-tool.ts | LOADED | 14 | 118/132 (89.39%) | 2/2 (100.00%) | 1/20 (5.00%) |
| apps/website/src/features/agent-plugins/admin-surfaces/forms.ts | LOADED | 14 | 23/37 (62.16%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/consent/cookie-consent.ts | LOADED | 14 | 48/62 (77.42%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/external-mcp/external-mcp-store.ts | LOADED | 14 | 60/74 (81.08%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/forms/form-file-storage.ts | LOADED | 14 | 29/43 (67.44%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/navigation/repoint-menu-refs.ts | LOADED | 14 | 124/138 (89.86%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/newsletter/campaign.ts | LOADED | 14 | 126/140 (90.00%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/presentation/repo.ts | LOADED | 14 | 37/51 (72.55%) | 3/4 (75.00%) | 2/8 (25.00%) |
| apps/website/src/features/publish-content/bundle-staging.ts | LOADED | 14 | 206/220 (93.64%) | 3/4 (75.00%) | 2/10 (20.00%) |
| apps/website/src/features/publish-content/peer-url.ts | LOADED | 14 | 126/140 (90.00%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/publish-content/run-repo.ts | LOADED | 14 | 128/142 (90.14%) | 3/4 (75.00%) | 2/6 (33.33%) |
| apps/website/src/features/site-backup/plan-store.ts | LOADED | 14 | 124/138 (89.86%) | 5/5 (100.00%) | 4/7 (57.14%) |
| apps/website/src/features/site-backup/saved-keys.ts | LOADED | 14 | 29/43 (67.44%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/http/change-sets.ts | LOADED | 14 | 20/34 (58.82%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/range.ts | LOADED | 14 | 91/105 (86.67%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/list-lists.ts | LOADED | 14 | 18/32 (56.25%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/list-subscriptions.ts | LOADED | 14 | 21/35 (60.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/resend-confirmation.ts | LOADED | 14 | 43/57 (75.44%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/capabilities.ts | LOADED | 14 | 66/80 (82.50%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/taxonomy/list.ts | LOADED | 14 | 25/39 (64.10%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/get-by-id.ts | LOADED | 14 | 17/31 (54.84%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/regions-list.ts | LOADED | 14 | 22/36 (61.11%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/assistant/plugin-prompt-prefix.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/members/password-sign-in.ts | LOADED | 14 | 16/30 (53.33%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/declared-content-types.ts | LOADED | 14 | 43/57 (75.44%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/dns-change-deps.ts | LOADED | 14 | 63/77 (81.82%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/runtime/composition/modules/core.ts | LOADED | 14 | 84/98 (85.71%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/integrations.ts | LOADED | 14 | 84/98 (85.71%) | 2/2 (100.00%) | 1/3 (33.33%) |
| development/scripts/port-listeners.mjs | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| development/sonarjs/formatter.mjs | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| apps/website/src/assistant/assistant-tool-approval-policy.ts | LOADED | 13 | 35/48 (72.92%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/assistant/component-catalog-tool.ts | LOADED | 13 | 150/163 (92.02%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/assistant/site/history.ts | LOADED | 13 | 89/102 (87.25%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/cli/commands/reset-owner.ts | LOADED | 13 | 16/29 (55.17%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/custom-credentials/credential-recovery.ts | LOADED | 13 | 16/29 (55.17%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/identity/recovery-codes.repo.ts | LOADED | 13 | 21/34 (61.76%) | 3/3 (100.00%) | 2/5 (40.00%) |
| apps/website/src/features/media/document-archive.ts | LOADED | 13 | 24/37 (64.86%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/media/where-used.ts | LOADED | 13 | 21/34 (61.76%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/member-login/credentials.ts | LOADED | 13 | 20/33 (60.61%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/member-login/link-policy.ts | LOADED | 13 | 26/39 (66.67%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/navigation/reverters.ts | LOADED | 13 | 80/93 (86.02%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/observability/tool-registrations.ts | LOADED | 13 | 30/43 (69.77%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/origin/configured-origin.ts | LOADED | 13 | 69/82 (84.15%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/plugin-runtime/built-ins/content-analyzer/plugin.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/publish-content/ui/sections.ts | LOADED | 13 | 132/145 (91.03%) | 3/3 (100.00%) | 2/6 (33.33%) |
| apps/website/src/features/site-backup/credential-warnings.ts | LOADED | 13 | 30/43 (69.77%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/skills/install-service.ts | LOADED | 13 | 39/52 (75.00%) | 2/2 (100.00%) | 1/10 (10.00%) |
| apps/website/src/features/theme/font-links.ts | LOADED | 13 | 23/36 (63.89%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/theme/public-page-security-headers.ts | LOADED | 13 | 38/51 (74.51%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/theme/verify-active-theme.ts | LOADED | 13 | 56/69 (81.16%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/db/migrations/index.ts | LOADED | 13 | 164/177 (92.66%) | 7/10 (70.00%) | 6/12 (50.00%) |
| apps/website/src/platform/headless-browser/playwright-loader.ts | LOADED | 13 | 21/34 (61.76%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/get-settings.ts | LOADED | 13 | 42/55 (76.36%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/menus/list.ts | LOADED | 13 | 36/49 (73.47%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/archive-list.ts | LOADED | 13 | 23/36 (63.89%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/remove-subscription.ts | LOADED | 13 | 40/53 (75.47%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/posts/list.ts | LOADED | 13 | 24/37 (64.86%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/recovery/disclosure.ts | LOADED | 13 | 46/59 (77.97%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/recovery/restore-points.ts | LOADED | 13 | 28/41 (68.29%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/skills/list.ts | LOADED | 13 | 45/58 (77.59%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/region-bind.ts | LOADED | 13 | 25/38 (65.79%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/workspace/get.ts | LOADED | 13 | 30/43 (69.77%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/assistant/capability-manifest-prefix.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/assistant/tool-access-lowering-route.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/public-http/middleware/published-webmcp.ts | LOADED | 13 | 31/44 (70.45%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/routes/ops/health.ts | LOADED | 13 | 50/63 (79.37%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/public-http/routes/site/llms.ts | LOADED | 13 | 57/70 (81.43%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/shared/dev-cors.ts | LOADED | 13 | 12/25 (48.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/composition/content-target-inputs.ts | LOADED | 13 | 31/44 (70.45%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/agent-plugins.ts | LOADED | 13 | 48/61 (78.69%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/site-import-backend.ts | LOADED | 13 | 35/48 (72.92%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/webhook-delivery-worker.ts | LOADED | 13 | 64/77 (83.12%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/lifecycle/theme-preview-host.ts | LOADED | 13 | 21/34 (61.76%) | 2/2 (100.00%) | 1/2 (50.00%) |
| development/scripts/backfill-db-path.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| development/scripts/free-port.mjs | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/6 (0.00%) | 0/7 (0.00%) |
| .claude/skills/tovu-demo-video/scripts/make-state.mjs | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/desktop/src/renderer/main.tsx | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/site-chat/scripts/check-bundle-mounts.d.mts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/assistant/ask-choice-ui-resource.ts | LOADED | 12 | 20/32 (62.50%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/assistant/daemon-call-context.ts | LOADED | 12 | 34/46 (73.91%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/assistant/public-assistant-availability.ts | LOADED | 12 | 18/30 (60.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/agent-plugins/capability-projection.ts | LOADED | 12 | 117/129 (90.70%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/agent-plugins/import-access-token.ts | LOADED | 12 | 51/63 (80.95%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/agent-plugins/set-enabled.ts | LOADED | 12 | 81/93 (87.10%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/agent-plugins/uninstall-confirmation-ui.ts | LOADED | 12 | 44/56 (78.57%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/consent/config.ts | LOADED | 12 | 70/82 (85.37%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/external-mcp/built-in-connections.ts | LOADED | 12 | 10/22 (45.45%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/identity/username-change-ports.ts | LOADED | 12 | 15/27 (55.56%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/mail/feedback-sources.ts | LOADED | 12 | 54/66 (81.82%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/members/trash-member.ts | LOADED | 12 | 12/24 (50.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/plugin-runtime/built-ins/word-count/index.ts | LOADED | 12 | 98/110 (89.09%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/tool-audit/repo.memory.ts | LOADED | 12 | 31/43 (72.09%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/trash/not-trashed.ts | LOADED | 12 | 105/117 (89.74%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/features/webhooks/delivery.ts | LOADED | 12 | 60/72 (83.33%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/platform/db/migrations/0002_drop_empty_legacy_chat_tables.ts | LOADED | 12 | 27/39 (69.23%) | 7/11 (63.64%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0007_publish_backstop.ts | LOADED | 12 | 9/21 (42.86%) | 6/7 (85.71%) | 5/6 (83.33%) |
| apps/website/src/platform/mail/adapters/smtp.nodemailer.ts | LOADED | 12 | 57/69 (82.61%) | 3/4 (75.00%) | 2/8 (25.00%) |
| apps/website/src/platform/secrets/store-vault-guards.ts | LOADED | 12 | 24/36 (66.67%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/owner-mfa-deps.ts | LOADED | 12 | 20/32 (62.50%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/content-types/write-error-status.ts | LOADED | 12 | 39/51 (76.47%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/forms/providers.ts | LOADED | 12 | 15/27 (55.56%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/get-providers.ts | LOADED | 12 | 39/51 (76.47%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/parse.ts | LOADED | 12 | 72/84 (85.71%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/list-policies.ts | LOADED | 12 | 25/37 (67.57%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/list-policy-permissions.ts | LOADED | 12 | 41/53 (77.36%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/http/site/site-chat-markup.ts | LOADED | 12 | 25/37 (67.57%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/server/inbound/public-http/routes/members/set-password.ts | LOADED | 12 | 16/28 (57.14%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/routes/site/sitemap.ts | LOADED | 12 | 24/36 (66.67%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/visitor-analytics.ts | LOADED | 12 | 29/41 (70.73%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/shared/trust-proxy.ts | LOADED | 12 | 48/60 (80.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/composition/content-publish-ports.ts | LOADED | 12 | 70/82 (85.37%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/publish-content-manifest.ts | LOADED | 12 | 58/70 (82.86%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/tool-use-events.ts | LOADED | 12 | 26/38 (68.42%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/desktop/src/speech/preload-speech.cts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| apps/site-chat/src/visitor-site-path.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| apps/website/src/assistant/admin-frontend-owner.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/assistant/batch-tool-inputs.ts | LOADED | 11 | 144/155 (92.90%) | 8/8 (100.00%) | 6/9 (66.67%) |
| apps/website/src/assistant/custom-instructions.ts | LOADED | 11 | 144/155 (92.90%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/assistant/execution-mode-settings.ts | LOADED | 11 | 205/216 (94.91%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/assistant/persistence/run-ledger.ts | LOADED | 11 | 20/31 (64.52%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/cli/commands/theme/generate-index.ts | LOADED | 11 | 32/43 (74.42%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/cli/commands/theme/sync-originals.ts | LOADED | 11 | 37/48 (77.08%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/contracts/core/entry-refs/repo.memory.ts | LOADED | 11 | 39/50 (78.00%) | 3/4 (75.00%) | 2/8 (25.00%) |
| apps/website/src/contracts/core/plugin-hook-failed-error.ts | LOADED | 11 | 59/70 (84.29%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/agent-plugins/auth-schemes.ts | LOADED | 11 | 112/123 (91.06%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/agent-plugins/deploy-split-activation.ts | LOADED | 11 | 18/29 (62.07%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/media-import/fetch-image.ts | LOADED | 11 | 178/189 (94.18%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/navigation/page-target-resolver.ts | LOADED | 11 | 16/27 (59.26%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/object-storage/artifact-provider.ts | LOADED | 11 | 55/66 (83.33%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/plugin-runtime/built-ins/content-analyzer/summary.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/16 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/plugin-runtime/install-tool-binding.ts | LOADED | 11 | 12/23 (52.17%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/post/template-options.ts | LOADED | 11 | 20/31 (64.52%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/publish-content/composite-blob-source.ts | LOADED | 11 | 101/112 (90.18%) | 3/3 (100.00%) | 2/5 (40.00%) |
| apps/website/src/features/seo/page-head-contributor.ts | LOADED | 11 | 32/43 (74.42%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/site-backup/bundled-export-file-policy.ts | LOADED | 11 | 30/41 (73.17%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/site-guide/plugin-contributions.ts | LOADED | 11 | 18/29 (62.07%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/theme/save-theme-original.ts | LOADED | 11 | 43/54 (79.63%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/vendor-credentials/abort-guarded-repo.ts | LOADED | 11 | 26/37 (70.27%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/web-screenshot/capture-files.ts | LOADED | 11 | 36/47 (76.60%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/platform/site-dir/site-root.ts | LOADED | 11 | 96/107 (89.72%) | 4/7 (57.14%) | 3/9 (33.33%) |
| apps/website/src/platform/test-home-isolation.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/12 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/get-chat-attachment.ts | LOADED | 11 | 97/108 (89.81%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/database/schema-state.ts | LOADED | 11 | 55/66 (83.33%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/where-used.ts | LOADED | 11 | 14/25 (56.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/list-campaigns.ts | LOADED | 11 | 29/40 (72.50%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/plugins/list.ts | LOADED | 11 | 54/65 (83.08%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/presentation/rescan-themes.ts | LOADED | 11 | 53/64 (82.81%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/settings/preview-feed-access.ts | LOADED | 11 | 12/23 (52.17%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/middleware/canonical-site-host.ts | LOADED | 11 | 32/43 (74.42%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/public-http/routes/oauth/public-origin.ts | LOADED | 11 | 75/86 (87.21%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/public-http/routes/site-share.ts | LOADED | 11 | 15/26 (57.69%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/routes/site/feed.ts | LOADED | 11 | 20/31 (64.52%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/routes/site/member-pages.ts | LOADED | 11 | 194/205 (94.63%) | 20/20 (100.00%) | 12/14 (85.71%) |
| apps/website/src/server/runtime/boot/startup-secrets.ts | LOADED | 11 | 32/43 (74.42%) | 3/3 (100.00%) | 2/6 (33.33%) |
| apps/website/src/server/runtime/composition/publish-trust-grants.ts | LOADED | 11 | 65/76 (85.53%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/trash-user-tool-port.ts | LOADED | 11 | 33/44 (75.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/lifecycle/agent-daemon-port.ts | LOADED | 11 | 150/161 (93.17%) | 3/3 (100.00%) | 2/13 (15.38%) |
| apps/website/src/server/runtime/lifecycle/site-preview-host.ts | LOADED | 11 | 19/30 (63.33%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/lifecycle/warm-site-agent.ts | LOADED | 11 | 15/26 (57.69%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/plugin-tier2/worker.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/runtime/services/external-mcp-admissions.ts | LOADED | 11 | 29/40 (72.50%) | 2/2 (100.00%) | 1/3 (33.33%) |
| development/eslint-rules/single-fetch-query-provider.mjs | LOADED | 11 | 15/26 (57.69%) | 1/1 (100.00%) | 0/1 (0.00%) |
| packages/sdk/src/index.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| .semgrep/tests/no-secret-literals-in-tests.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| .semgrep/tests/react-component-options-param.tsx | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/8 (0.00%) |
| apps/admin/dev-jini-deps.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/admin/src/lib/api.ts | LOADED | 10 | 350/360 (97.22%) | 252/254 (99.21%) | 244/254 (96.06%) |
| apps/desktop/src/renderer/source-test-harness.ts | LOADED | 10 | 66/76 (86.84%) | 23/25 (92.00%) | 9/12 (75.00%) |
| apps/site-chat/src/remixicon-override.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/site-chat/src/site-chat-i18n.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| apps/website/src/assistant/execution-credential-store.memory.ts | LOADED | 10 | 25/35 (71.43%) | 3/4 (75.00%) | 2/7 (28.57%) |
| apps/website/src/assistant/external-mcp-roster-change.ts | LOADED | 10 | 94/104 (90.38%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/assistant/frontend-control-capabilities.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/contracts/core/gated-mutations/composition.ts | LOADED | 10 | 153/163 (93.87%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/agent-plugins/admin-surfaces/handlers.ts | LOADED | 10 | 60/70 (85.71%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/agent-plugins/retired-plugin-tool-aliases.ts | LOADED | 10 | 41/51 (80.39%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/media-generation/provider-credential-save.ts | LOADED | 10 | 25/35 (71.43%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/object-storage/setting.ts | LOADED | 10 | 26/36 (72.22%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/plugin-runtime/install-consent.ts | LOADED | 10 | 19/29 (65.52%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/post/duplicate-embeds.ts | LOADED | 10 | 100/110 (90.91%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/settings/site-title-preservation.ts | LOADED | 10 | 42/52 (80.77%) | 3/4 (75.00%) | 2/7 (28.57%) |
| apps/website/src/features/theme/render-contract.ts | LOADED | 10 | 351/361 (97.23%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/vendor-credentials/project-scope.ts | LOADED | 10 | 49/59 (83.05%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/platform/db/migrations/0015_document_blob_ownership.ts | LOADED | 10 | 14/24 (58.33%) | 8/9 (88.89%) | 6/8 (75.00%) |
| apps/website/src/platform/db/migrations/0031_mail_activity_retention.ts | LOADED | 10 | 36/46 (78.26%) | 14/14 (100.00%) | 12/13 (92.31%) |
| apps/website/src/platform/http/egress-policies.ts | LOADED | 10 | 291/301 (96.68%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/deps.ts | LOADED | 10 | 143/153 (93.46%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/report-dto.ts | LOADED | 10 | 33/43 (76.74%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/list.ts | LOADED | 10 | 30/40 (75.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/trash.ts | LOADED | 10 | 18/28 (64.29%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/workspace/list.ts | LOADED | 10 | 25/35 (71.43%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/assistant/run-log-lines.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/mail-feedback.ts | LOADED | 10 | 30/40 (75.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/public-http/routes/site/forms-admission.ts | LOADED | 10 | 14/24 (58.33%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/form-delivery-deliverer.ts | LOADED | 10 | 37/47 (78.72%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/form-pull-triggers.ts | LOADED | 10 | 53/63 (84.13%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/composition/modules/forms-admin.ts | LOADED | 10 | 32/42 (76.19%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/media.ts | LOADED | 10 | 69/79 (87.34%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/widgets.ts | LOADED | 10 | 44/54 (81.48%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/trash-user-admin-override.ts | LOADED | 10 | 49/59 (83.05%) | 2/2 (100.00%) | 1/2 (50.00%) |
| development/playwright.memory-soak.config.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/assistant/mcp-federation/adapter.memory.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| apps/website/src/assistant/site-credential-store.memory.ts | LOADED | 9 | 23/32 (71.88%) | 3/4 (75.00%) | 2/7 (28.57%) |
| apps/website/src/assistant/tool-audit-preset.ts | LOADED | 9 | 25/34 (73.53%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/cli/commands/plugin/integrity.ts | LOADED | 9 | 13/22 (59.09%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/contracts/core/events/outbox-drainer.ts | LOADED | 9 | 64/73 (87.67%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/agent-plugins/activation-effects.ts | LOADED | 9 | 31/40 (77.50%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/agent-plugins/connect-card-ui.ts | LOADED | 9 | 26/35 (74.29%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/deployments/deploy-ops/typed-secret-card.ts | LOADED | 9 | 15/24 (62.50%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/external-mcp/external-mcp-vault.ts | LOADED | 9 | 36/45 (80.00%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/media/access-evidence.ts | LOADED | 9 | 29/38 (76.32%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/media/bootstrap.ts | LOADED | 9 | 75/84 (89.29%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/plugin-runtime/widget-partials.ts | LOADED | 9 | 10/19 (52.63%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/presentation/set-active-theme.ts | LOADED | 9 | 14/23 (60.87%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/project-keys/create-vault.ts | LOADED | 9 | 24/33 (72.73%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/features/publish-content/file-blob-index.ts | LOADED | 9 | 100/109 (91.74%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/settings/index.ts | LOADED | 9 | 153/162 (94.44%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/features/sites/site-preview/site-preview-store.ts | LOADED | 9 | 94/103 (91.26%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/skills/layout.ts | LOADED | 9 | 81/90 (90.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/tool-audit/tool-gaps.repo.ts | LOADED | 9 | 15/24 (62.50%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/web-screenshot/own-site-opener.ts | LOADED | 9 | 40/49 (81.63%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/platform/db/kernel/drivers/pglite-owner.ts | LOADED | 9 | 25/34 (73.53%) | 3/3 (100.00%) | 2/8 (25.00%) |
| apps/website/src/platform/db/migrations/0034_member_auth.ts | LOADED | 9 | 15/24 (62.50%) | 8/9 (88.89%) | 6/8 (75.00%) |
| apps/website/src/platform/mail/sender-identity.ts | LOADED | 9 | 53/62 (85.48%) | 3/3 (100.00%) | 2/5 (40.00%) |
| apps/website/src/platform/markdown/frontmatter.ts | LOADED | 9 | 57/66 (86.36%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/platform/site-dir/new-site-owner.ts | LOADED | 9 | 17/26 (65.38%) | 4/7 (57.14%) | 3/4 (75.00%) |
| apps/website/src/server/inbound/admin-http/http/users.ts | LOADED | 9 | 84/93 (90.32%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/local-admin-request.ts | LOADED | 9 | 18/27 (66.67%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/agent-plugins/connection-sign-in.ts | LOADED | 9 | 17/26 (65.38%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/entries/write-error-status.ts | LOADED | 9 | 19/28 (67.86%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/delete.ts | LOADED | 9 | 34/43 (79.07%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/probe.ts | LOADED | 9 | 79/88 (89.77%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/routes/settings/list-definitions.ts | LOADED | 9 | 34/43 (79.07%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/tool-gaps.ts | LOADED | 9 | 10/19 (52.63%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/assistant/federation-reload-route.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/form-validation-i18n.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/boot/site-daemon-listener.ts | LOADED | 9 | 33/42 (78.57%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/assistant-history-tools.ts | LOADED | 9 | 22/31 (70.97%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/composition/modules/database-recovery.ts | LOADED | 9 | 62/71 (87.32%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/desktop-mcp-handoff.ts | LOADED | 9 | 19/28 (67.86%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/publish-backstop-ports.ts | LOADED | 9 | 17/26 (65.38%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/lifecycle/assistant-daemon-registry.ts | LOADED | 9 | 26/35 (74.29%) | 2/2 (100.00%) | 1/4 (25.00%) |
| development/playwright.journeys.config.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/14 (0.00%) | 0/2 (0.00%) |
| development/scripts/load-repo-root-env.mjs | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/site-chat/src/site-assistant-errors.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/10 (0.00%) | 0/1 (0.00%) |
| apps/website/src/assistant/persistence/tenant-scope.ts | LOADED | 8 | 111/119 (93.28%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/assistant/read-only-tool-constraint.ts | LOADED | 8 | 167/175 (95.43%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/assistant/site/public-errors.ts | LOADED | 8 | 67/75 (89.33%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/assistant/tool-gaps-tool.ts | LOADED | 8 | 23/31 (74.19%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/contracts/core/agent-permission-mode.ts | LOADED | 8 | 34/42 (80.95%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/contracts/core/chat-delete-grant.ts | LOADED | 8 | 21/29 (72.41%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/agent-plugins/connect-sign-in-wait.ts | LOADED | 8 | 27/35 (77.14%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/consent/privacy-page-template.ts | LOADED | 8 | 9/17 (52.94%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/custom-credentials/tovu-credential-sets.ts | LOADED | 8 | 49/57 (85.96%) | 2/2 (100.00%) | 1/14 (7.14%) |
| apps/website/src/features/deployments/dockerfile.ts | LOADED | 8 | 159/167 (95.21%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/external-mcp/external-mcp-revocation.ts | LOADED | 8 | 30/38 (78.95%) | 3/3 (100.00%) | 2/10 (20.00%) |
| apps/website/src/features/media/chat-preview.ts | LOADED | 8 | 27/35 (77.14%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/media/guard-rendition-repo.ts | LOADED | 8 | 16/24 (66.67%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/post/search-index.memory.ts | LOADED | 8 | 83/91 (91.21%) | 3/4 (75.00%) | 2/6 (33.33%) |
| apps/website/src/features/theme/theme-roster-sync.ts | LOADED | 8 | 81/89 (91.01%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/webhooks/secret-sealer.aesgcm.ts | LOADED | 8 | 148/156 (94.87%) | 6/7 (85.71%) | 5/9 (55.56%) |
| apps/website/src/features/webhooks/signing.ts | LOADED | 8 | 35/43 (81.40%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/workspace/agent-tools.ts | LOADED | 8 | 10/18 (55.56%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/db/sqlite/hydrate-content-db-from-seed.ts | LOADED | 8 | 108/116 (93.10%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/platform/oauth/legacy-endpoint-error.ts | LOADED | 8 | 24/32 (75.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/http/presentation.ts | LOADED | 8 | 15/23 (65.22%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/admissions.ts | LOADED | 8 | 22/30 (73.33%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/list-roles.ts | LOADED | 8 | 29/37 (78.38%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/assistant/run-start-decisions.ts | LOADED | 8 | 65/73 (89.04%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/inbound/public-http/http/site/handlebars-worker.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/6 (0.00%) | 0/0 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/members/analytics.ts | LOADED | 8 | 24/32 (75.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/public-http/routes/members/forgot-password.ts | LOADED | 8 | 14/22 (63.64%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/routes/members/sign-out.ts | LOADED | 8 | 15/23 (65.22%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/assistant-settings.ts | LOADED | 8 | 41/49 (83.67%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/content-types.ts | LOADED | 8 | 34/42 (80.95%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/redirects.ts | LOADED | 8 | 29/37 (78.38%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/seo.ts | LOADED | 8 | 45/53 (84.91%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/settings.ts | LOADED | 8 | 43/51 (84.31%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/taxonomy.ts | LOADED | 8 | 37/45 (82.22%) | 2/2 (100.00%) | 1/2 (50.00%) |
| development/cloud/quality-1111/cov/scripts/test-safety-all.mjs | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/6 (0.00%) |
| development/scripts/dev-admin-build.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/admin/src/features/email/EmailOverviewTab.tsx | LOADED | 7 | 17/24 (70.83%) | 17/28 (60.71%) | 5/10 (50.00%) |
| apps/admin/src/features/email/EmailTemplatesTab.tsx | LOADED | 7 | 13/20 (65.00%) | 9/14 (64.29%) | 12/19 (63.16%) |
| apps/site-chat/scripts/measure-bundles.d.mts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/assistant/credential-store-fields.ts | LOADED | 7 | 12/19 (63.16%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/assistant/mcp-federation/presets.ts | LOADED | 7 | 76/83 (91.57%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/assistant/permanent-delete-tool-gate.ts | LOADED | 7 | 36/43 (83.72%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/assistant/site/mode.ts | LOADED | 7 | 10/17 (58.82%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/assistant/site/public-content.ts | LOADED | 7 | 51/58 (87.93%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/cli/commands/owner-store-mapping.ts | LOADED | 7 | 12/19 (63.16%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/agent-plugins/federate-mcp.ts | LOADED | 7 | 60/67 (89.55%) | 2/2 (100.00%) | 1/13 (7.69%) |
| apps/website/src/features/custom-credentials/store.ts | LOADED | 7 | 128/135 (94.81%) | 2/2 (100.00%) | 1/9 (11.11%) |
| apps/website/src/features/custom-credentials/vault-repo.ts | LOADED | 7 | 30/37 (81.08%) | 3/3 (100.00%) | 2/5 (40.00%) |
| apps/website/src/features/deployments/deploy-ops/secrets.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/fs-files/fs-files.ts | LOADED | 7 | 218/225 (96.89%) | 2/2 (100.00%) | 1/8 (12.50%) |
| apps/website/src/features/member-login/ready-providers.ts | LOADED | 7 | 14/21 (66.67%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/members/auth-mail.ts | LOADED | 7 | 18/25 (72.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/members/subscriber-directory.ts | LOADED | 7 | 126/133 (94.74%) | 3/4 (75.00%) | 2/8 (25.00%) |
| apps/website/src/features/plugin-runtime/install-archive.ts | LOADED | 7 | 39/46 (84.78%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/plugin-runtime/uninstall-confirmation-ui.ts | LOADED | 7 | 36/43 (83.72%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/publish-content/ui/phase.ts | LOADED | 7 | 97/104 (93.27%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/publish-trust/provisioning.node-io.ts | LOADED | 7 | 76/83 (91.57%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/settings/form-destination.ts | LOADED | 7 | 28/35 (80.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/sites/deps.ts | LOADED | 7 | 117/124 (94.35%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/webhooks/http.memory.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/webhooks/subscriptions.ts | LOADED | 7 | 120/127 (94.49%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/platform/db/repos/form-submission-receipt-repo.ts | LOADED | 7 | 17/24 (70.83%) | 3/4 (75.00%) | 2/5 (40.00%) |
| apps/website/src/server/inbound/admin-http/http/api-keys.ts | LOADED | 7 | 60/67 (89.55%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/list.ts | LOADED | 7 | 23/30 (76.67%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/redirects/shared.ts | LOADED | 7 | 45/52 (86.54%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/server/inbound/public-http/http/site/member-auth-script.ts | LOADED | 7 | 438/445 (98.43%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/middleware/theme-asset-dirs.ts | LOADED | 7 | 64/71 (90.14%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/public-http/routes/members/reset-password.ts | LOADED | 7 | 11/18 (61.11%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/integrations-admin.ts | LOADED | 7 | 28/35 (80.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/menus.ts | LOADED | 7 | 30/37 (81.08%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/plugins.ts | LOADED | 7 | 40/47 (85.11%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/workspace.ts | LOADED | 7 | 22/29 (75.86%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/visitor-tools-management.ts | LOADED | 7 | 20/27 (74.07%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/runtime/lifecycle/assistant-daemon-connection.ts | LOADED | 7 | 39/46 (84.78%) | 3/3 (100.00%) | 2/12 (16.67%) |
| development/playwright.mobile-visual.config.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| development/scripts/lib/secret-patterns.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/admin/src/features/email/hooks/use-email-template-editor.hooks.ts | LOADED | 6 | 57/63 (90.48%) | 34/43 (79.07%) | 18/22 (81.82%) |
| apps/admin/src/features/plugins/hooks/use-plugin-provider-settings.hooks.ts | LOADED | 6 | 39/45 (86.67%) | 14/21 (66.67%) | 11/14 (78.57%) |
| apps/admin/src/features/settings/ExternalMcpSettingsPanel.tsx | LOADED | 6 | 65/71 (91.55%) | 44/50 (88.00%) | 24/29 (82.76%) |
| apps/admin/src/lib/agent-navigation-entities.ts | LOADED | 6 | 10/16 (62.50%) | 6/7 (85.71%) | 4/7 (57.14%) |
| apps/desktop/scripts/check-coverage.ts | LOADED | 6 | 364/370 (98.38%) | 108/109 (99.08%) | 28/28 (100.00%) |
| apps/desktop/vite.config.mts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/site-chat/vite.vanilla.config.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/assistant/byok-provider-turn.ts | LOADED | 6 | 180/186 (96.77%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/assistant/mcp-ui-tool-calls.ts | LOADED | 6 | 86/92 (93.48%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/assistant/server-federation-diagnosis.ts | LOADED | 6 | 13/19 (68.42%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/assistant/site/visitor-request-origin.ts | LOADED | 6 | 24/30 (80.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/contracts/core/assistant-run-events.ts | LOADED | 6 | 57/63 (90.48%) | 2/2 (100.00%) | 1/16 (6.25%) |
| apps/website/src/contracts/core/events/outbox-worker.ts | LOADED | 6 | 92/98 (93.88%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/contracts/core/gated-mutations/watermark.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/agent-plugins/apply-tool-renames.ts | LOADED | 6 | 30/36 (83.33%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/agent-plugins/mcp-host-bindings.ts | LOADED | 6 | 37/43 (86.05%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/consent/request.ts | LOADED | 6 | 20/26 (76.92%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/content-duplication/derive-available-name.ts | LOADED | 6 | 128/134 (95.52%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/custom-credentials/custom-credential-repo.ts | LOADED | 6 | 14/20 (70.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/custom-credentials/delete-request-confirmation-ui.ts | LOADED | 6 | 34/40 (85.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/identity/boot-session-token.ts | LOADED | 6 | 129/135 (95.56%) | 3/3 (100.00%) | 2/9 (22.22%) |
| apps/website/src/features/mail/site-feedback-route.ts | LOADED | 6 | 22/28 (78.57%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/media/analytics.ts | LOADED | 6 | 15/21 (71.43%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/media/purge-media.ts | LOADED | 6 | 16/22 (72.73%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/newsletter/launch-gate.ts | LOADED | 6 | 81/87 (93.10%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/newsletter/repo.sqlite.ts | LOADED | 6 | 54/60 (90.00%) | 8/8 (100.00%) | 7/13 (53.85%) |
| apps/website/src/features/plugin-runtime/sdk-resolver.ts | LOADED | 6 | 118/124 (95.16%) | 3/3 (100.00%) | 2/5 (40.00%) |
| apps/website/src/features/plugins/migration-journal.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/post/slug.ts | LOADED | 6 | 17/23 (73.91%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/presentation/repo.rows.ts | LOADED | 6 | 23/29 (79.31%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/publish-content/ui/index.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/site-backup/share-export-failure.ts | LOADED | 6 | 20/26 (76.92%) | 3/4 (75.00%) | 2/4 (50.00%) |
| apps/website/src/features/taxonomy/trash-term.ts | LOADED | 6 | 110/116 (94.83%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/trash/remove-without-blocker.ts | LOADED | 6 | 31/37 (83.78%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/web-screenshot/screenshot-image.ts | LOADED | 6 | 8/14 (57.14%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/db/chat-kernel.ts | LOADED | 6 | 78/84 (92.86%) | 4/5 (80.00%) | 3/6 (50.00%) |
| apps/website/src/platform/db/keyset-cursor.ts | LOADED | 6 | 28/34 (82.35%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/platform/db/migrations/0003_coercion_json_as_json.ts | LOADED | 6 | 19/25 (76.00%) | 6/7 (85.71%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0009_posts_author.ts | LOADED | 6 | 17/23 (73.91%) | 6/7 (85.71%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0029_mail_activity_indexes.ts | LOADED | 6 | 57/63 (90.48%) | 38/39 (97.44%) | 36/37 (97.30%) |
| apps/website/src/platform/db/sqlite/database-journal-schema.ts | LOADED | 6 | 110/116 (94.83%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/headless-browser/desktop-render.ts | LOADED | 6 | 12/18 (66.67%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/mail/purpose-gate-probe.ts | LOADED | 6 | 19/25 (76.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/site-dir/atomic-write.ts | LOADED | 6 | 84/90 (93.33%) | 4/4 (100.00%) | 3/6 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/api-keys/issue.ts | LOADED | 6 | 40/46 (86.96%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/get-execution-credential.ts | LOADED | 6 | 26/32 (81.25%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/guard.ts | LOADED | 6 | 53/59 (89.83%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/forms/resolve-definition.ts | LOADED | 6 | 24/30 (80.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/integrations/deps.ts | LOADED | 6 | 30/36 (83.33%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/byte-size.ts | LOADED | 6 | 36/42 (85.71%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/stored-media-response.ts | LOADED | 6 | 19/25 (76.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/assistant/assistant-filesystem-notices.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/assistant/chat-attachment-directory.ts | LOADED | 6 | 39/45 (86.67%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/server/inbound/assistant/run-lifecycle-tracing.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/6 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/seo-render-context.ts | LOADED | 6 | 17/23 (73.91%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/boot/mail-plugin-account-token.ts | LOADED | 6 | 22/28 (78.57%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/assistant-execution.ts | LOADED | 6 | 27/33 (81.82%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/comments-moderation.ts | LOADED | 6 | 26/32 (81.25%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/open-site-content-db.ts | LOADED | 6 | 56/62 (90.32%) | 3/6 (50.00%) | 2/3 (66.67%) |
| apps/website/src/server/runtime/composition/store-bound-services.ts | LOADED | 6 | 36/42 (85.71%) | 2/2 (100.00%) | 1/3 (33.33%) |
| development/scripts/mutation-sweep-result.mjs | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/14 (0.00%) | 0/1 (0.00%) |
| .semgrep/tests/no-as-any.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/admin/src/components/AssistantDock/agent-failure-scanners.ts | LOADED | 5 | 104/109 (95.41%) | 65/84 (77.38%) | 17/17 (100.00%) |
| apps/admin/src/features/settings/hooks/use-external-mcp-oauth-connect.hooks.ts | LOADED | 5 | 58/63 (92.06%) | 22/29 (75.86%) | 15/19 (78.95%) |
| apps/desktop/src/app-version-ipc.ts | LOADED | 5 | 51/56 (91.07%) | 11/11 (100.00%) | 4/5 (80.00%) |
| apps/desktop/src/renderer/app/TabCloseAsk.tsx | LOADED | 5 | 30/35 (85.71%) | 8/9 (88.89%) | 2/3 (66.67%) |
| apps/desktop/src/renderer/SharedKeys.tsx | LOADED | 5 | 178/183 (97.27%) | 54/62 (87.10%) | 26/29 (89.66%) |
| apps/desktop/src/renderer/use-update-check.hooks.ts | LOADED | 5 | 36/41 (87.80%) | 6/7 (85.71%) | 3/3 (100.00%) |
| apps/site-chat/src/SiteAssistantHeader.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/site-chat/src/vanilla-entry.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/site-chat/vite-public-guard.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/site-chat/vite.config.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/cli/commands/introspect.ts | LOADED | 5 | 42/47 (89.36%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/contracts/core/host-signals.ts | LOADED | 5 | 88/93 (94.62%) | 7/12 (58.33%) | 6/16 (37.50%) |
| apps/website/src/features/agent-plugins/admin-surfaces/capabilities.ts | LOADED | 5 | 39/44 (88.64%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/agent-plugins/admin-surfaces/issued-sign-ins.ts | LOADED | 5 | 39/44 (88.64%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/agent-plugins/enable-access.ts | LOADED | 5 | 28/33 (84.85%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/agent-plugins/memory-tools.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/agent-plugins/token-sign-in.ts | LOADED | 5 | 26/31 (83.87%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/agent-plugins/write-note-tool.ts | LOADED | 5 | 23/28 (82.14%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/consent/revisions.ts | LOADED | 5 | 20/25 (80.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/content-types/tool-registrations.ts | LOADED | 5 | 65/70 (92.86%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/custom-credentials/card-token.ts | LOADED | 5 | 30/35 (85.71%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/deployments/publish-credentials/account-label-heal-scheduler.ts | LOADED | 5 | 123/128 (96.09%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/deployments/static-publish/publish-consent.ts | LOADED | 5 | 6/11 (54.55%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/form-destinations/connection-port.ts | LOADED | 5 | 31/36 (86.11%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/identity/repo.memory.ts | LOADED | 5 | 37/42 (88.10%) | 3/4 (75.00%) | 2/7 (28.57%) |
| apps/website/src/features/media/original-bytes.ts | LOADED | 5 | 18/23 (78.26%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/media/public-path.ts | LOADED | 5 | 60/65 (92.31%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/media/upload-content-type.ts | LOADED | 5 | 38/43 (88.37%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/navigation/tool-registrations.ts | LOADED | 5 | 57/62 (91.94%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/publish-content/seed-hash.ts | LOADED | 5 | 69/74 (93.24%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/theme/validation/profiles.ts | LOADED | 5 | 90/95 (94.74%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/db/journal-kernel.ts | LOADED | 5 | 110/115 (95.65%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/db/migrations/0004_drop_unused_deployment_tables.ts | LOADED | 5 | 31/36 (86.11%) | 7/7 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0030_mail_suppression_admin.ts | LOADED | 5 | 51/56 (91.07%) | 32/33 (96.97%) | 30/31 (96.77%) |
| apps/website/src/platform/db/migrations/step.ts | LOADED | 5 | 16/21 (76.19%) | 5/5 (100.00%) | 4/8 (50.00%) |
| apps/website/src/platform/db/sqlite/chat-db.ts | LOADED | 5 | 70/75 (93.33%) | 4/6 (66.67%) | 3/4 (75.00%) |
| apps/website/src/platform/db/sqlite/db-ops.ts | LOADED | 5 | 88/93 (94.62%) | 3/4 (75.00%) | 2/7 (28.57%) |
| apps/website/src/platform/mail/purpose-scoped-mailer.ts | LOADED | 5 | 26/31 (83.87%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/secrets/vault-api-connection-meta.ts | LOADED | 5 | 22/27 (81.48%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/site-dir/site-switcher-enabled.ts | LOADED | 5 | 23/28 (82.14%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/platform/site-dir/sites-home.ts | LOADED | 5 | 43/48 (89.58%) | 5/9 (55.56%) | 4/8 (50.00%) |
| apps/website/src/server/error-mapping/respond.ts | LOADED | 5 | 11/16 (68.75%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/authorize-guard.ts | LOADED | 5 | 61/66 (92.42%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/api-keys/create-principal.ts | LOADED | 5 | 41/46 (89.13%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/delete-execution-credential.ts | LOADED | 5 | 26/31 (83.87%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/members/deps.ts | LOADED | 5 | 44/49 (89.80%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/plugins/local-installer.ts | LOADED | 5 | 13/18 (72.22%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/apply-report.ts | LOADED | 5 | 34/39 (87.18%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/assistant/federation-admissions-route.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/liquid-worker.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/0 (0.00%) |
| apps/website/src/server/inbound/public-http/middleware/site-chat-static.ts | LOADED | 5 | 40/45 (88.89%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/middleware/theme-preview-static.ts | LOADED | 5 | 37/42 (88.10%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/routes/site/forms-multipart.ts | LOADED | 5 | 9/14 (64.29%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/routes/site/newsletter-deps.ts | LOADED | 5 | 59/64 (92.19%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/boot/dev-tls.ts | LOADED | 5 | 118/123 (95.93%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/server/runtime/boot/mail-delivery-policy.ts | LOADED | 5 | 64/69 (92.75%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/boot/site-listener-origin.ts | LOADED | 5 | 21/26 (80.77%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/composition/modules/api-keys.ts | LOADED | 5 | 23/28 (82.14%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/publish-content-http.ts | LOADED | 5 | 15/20 (75.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/telemetry-consent.ts | LOADED | 5 | 37/42 (88.10%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/lifecycle/daemon-demand-fetch.ts | LOADED | 5 | 16/21 (76.19%) | 2/2 (100.00%) | 1/2 (50.00%) |
| development/scripts/site-identity-eslint.config.mjs | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| packages/contracts/src/secret-redaction.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/admin/src/features/email/EmailActivityTab.tsx | LOADED | 4 | 43/47 (91.49%) | 68/100 (68.00%) | 22/25 (88.00%) |
| apps/admin/src/features/email/hooks/use-email-templates.hooks.ts | LOADED | 4 | 44/48 (91.67%) | 18/26 (69.23%) | 12/13 (92.31%) |
| apps/admin/src/features/settings/ExternalMcpSharedChoice.tsx | LOADED | 4 | 24/28 (85.71%) | 18/20 (90.00%) | 12/12 (100.00%) |
| apps/desktop/scripts/verify-package.ts | LOADED | 4 | 47/51 (92.16%) | 1/2 (50.00%) | 0/0 (100.00%) |
| apps/desktop/src/renderer/App.tsx | LOADED | 4 | 299/303 (98.68%) | 33/33 (100.00%) | 19/20 (95.00%) |
| apps/site-chat/vite.lazy.config.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/assistant/demo-image-tool.ts | LOADED | 4 | 94/98 (95.92%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/assistant/mcp-federation/adapter.http.ts | LOADED | 4 | 26/30 (86.67%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/assistant/mcp-ui-sandbox-proxy-route.ts | LOADED | 4 | 78/82 (95.12%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/assistant/session-services.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/assistant/site/visitor-tool-settings.ts | LOADED | 4 | 17/21 (80.95%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/assistant/tool-catalog-live-query.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| apps/website/src/contracts/core/gated-mutations/gateway.ts | LOADED | 4 | 208/212 (98.11%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/agent-plugins/connect-destination.ts | LOADED | 4 | 17/21 (80.95%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/analytics/salt.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/api-connections/plugin-state-bindings.ts | LOADED | 4 | 9/13 (69.23%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/api-connections/surface-connections.ts | LOADED | 4 | 10/14 (71.43%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/identity/owner-reset-env.ts | LOADED | 4 | 38/42 (90.48%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/newsletter/data-module-manifest.ts | LOADED | 4 | 146/150 (97.33%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/pages/html-document-store.sqlite.ts | LOADED | 4 | 27/31 (87.10%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/plugin-runtime/install-tool.ts | LOADED | 4 | 40/44 (90.91%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/plugin-runtime/tool-registrations.ts | LOADED | 4 | 69/73 (94.52%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/publish-content/blob-staging.ts | LOADED | 4 | 66/70 (94.29%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/publish-content/content-hash.ts | LOADED | 4 | 148/152 (97.37%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/features/settings/chart-provider.ts | LOADED | 4 | 13/17 (76.47%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/site-export/static-security-headers.ts | LOADED | 4 | 44/48 (91.67%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/theme/static-asset-contract.ts | LOADED | 4 | 111/115 (96.52%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/trash/scheduler.node.ts | LOADED | 4 | 14/18 (77.78%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/db/content-kernel.ts | LOADED | 4 | 19/23 (82.61%) | 6/6 (100.00%) | 3/4 (75.00%) |
| apps/website/src/platform/db/migrations/0001_post_search.ts | LOADED | 4 | 35/39 (89.74%) | 6/7 (85.71%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0008_posts_publish_at_featured_media.ts | LOADED | 4 | 11/15 (73.33%) | 6/6 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0016_publish_destination_history.ts | LOADED | 4 | 11/15 (73.33%) | 6/6 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0036_publish_history_config_jsonb.ts | LOADED | 4 | 13/17 (76.47%) | 6/7 (85.71%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0037_media_source_metadata.ts | LOADED | 4 | 8/12 (66.67%) | 7/8 (87.50%) | 6/7 (85.71%) |
| apps/website/src/platform/db/migrations/chat/0000_chat_baseline.ts | LOADED | 4 | 77/81 (95.06%) | 6/7 (85.71%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/chat/0001_sqlite_chat_tables.ts | LOADED | 4 | 74/78 (94.87%) | 7/8 (87.50%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/project/0000_project_vault.ts | LOADED | 4 | 50/54 (92.59%) | 5/5 (100.00%) | 4/6 (66.67%) |
| apps/website/src/platform/db/migrations/project/0001_project_credential_kinds.ts | LOADED | 4 | 63/67 (94.03%) | 5/5 (100.00%) | 4/6 (66.67%) |
| apps/website/src/platform/db/postgres/db-ops-adapter.ts | LOADED | 4 | 38/42 (90.48%) | 4/4 (100.00%) | 3/7 (42.86%) |
| apps/website/src/platform/db/postgres/db-ops.ts | LOADED | 4 | 47/51 (92.16%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/db/sqlite/database-journal-db.ts | LOADED | 4 | 42/46 (91.30%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/db/sqlite/origin-repo.sqlite.ts | LOADED | 4 | 43/47 (91.49%) | 3/3 (100.00%) | 2/5 (40.00%) |
| apps/website/src/platform/headless-browser/lazy-browser.ts | LOADED | 4 | 37/41 (90.24%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/http/members.ts | LOADED | 4 | 56/60 (93.33%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/api-keys/revoke.ts | LOADED | 4 | 36/40 (90.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/assistant/attempt-process-identity.ts | LOADED | 4 | 20/24 (83.33%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/assistant/bridge-preflight-entry.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/assistant/byok-message-attachments.ts | LOADED | 4 | 15/19 (78.95%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/http/content/posts.ts | LOADED | 4 | 14/18 (77.78%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/http/site/handlebars-sandbox.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/liquid-sandbox.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/public-http/middleware/public-page-security-headers.ts | LOADED | 4 | 54/58 (93.10%) | 3/3 (100.00%) | 2/6 (33.33%) |
| apps/website/src/server/runtime/composition/commerce-worker.ts | LOADED | 4 | 12/16 (75.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/trash.ts | LOADED | 4 | 29/33 (87.88%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/provider-contracts.ts | LOADED | 4 | 22/26 (84.62%) | 2/2 (100.00%) | 1/7 (14.29%) |
| apps/website/src/server/runtime/composition/publish-trust-revocations.ts | LOADED | 4 | 38/42 (90.48%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/plugin-tier2/typescript-bootstrap.cjs | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| development/cloud/quality-1111/cov/scripts/lcov-abs.mjs | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| development/playwright.desktop-journeys.config.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| development/playwright.desktop-shell.config.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| development/scripts/check-no-linked-jini.mjs | LOADED | 4 | 67/71 (94.37%) | 9/11 (81.82%) | 8/8 (100.00%) |
| development/scripts/dev-api-watch.mjs | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/admin/dev-tls-disable-flag.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/admin/src/features/integrations/hooks/use-integration-deliveries.hooks.ts | LOADED | 3 | 5/8 (62.50%) | 4/4 (100.00%) | 2/4 (50.00%) |
| apps/admin/src/features/observability/recent-errors-rules.ts | LOADED | 3 | 83/86 (96.51%) | 50/55 (90.91%) | 15/15 (100.00%) |
| apps/admin/src/features/plugins/hooks/plugins-dependencies.hooks.ts | LOADED | 3 | 63/66 (95.45%) | 60/66 (90.91%) | 26/29 (89.66%) |
| apps/admin/src/features/security/RecoveryCodesCard.tsx | LOADED | 3 | 36/39 (92.31%) | 29/34 (85.29%) | 17/18 (94.44%) |
| apps/admin/src/features/sites/hooks/use-site-list-prefs.hooks.ts | LOADED | 3 | 20/23 (86.96%) | 5/7 (71.43%) | 9/12 (75.00%) |
| apps/admin/src/features/sites/hooks/use-sites.hooks.ts | LOADED | 3 | 70/73 (95.89%) | 29/30 (96.67%) | 17/19 (89.47%) |
| apps/admin/src/lib/owner-mfa-api.ts | LOADED | 3 | 3/6 (50.00%) | 0/0 (100.00%) | 1/5 (20.00%) |
| apps/admin/src/lib/owner-recovery-api.ts | LOADED | 3 | 4/7 (57.14%) | 2/2 (100.00%) | 2/6 (33.33%) |
| apps/desktop/scripts/clean-preload.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/site-chat/src/loader-entry.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/assistant/assistant-permanent-deletes-policy.ts | LOADED | 3 | 10/13 (76.92%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/assistant/persistence/agent-session-store.ts | LOADED | 3 | 44/47 (93.62%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/assistant/persistence/chat-expiry-sweep.ts | LOADED | 3 | 17/20 (85.00%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/cli/main.ts | LOADED | 3 | 42/45 (93.33%) | 3/5 (60.00%) | 2/2 (100.00%) |
| apps/website/src/contracts/core/events/enqueue-only-outbox.ts | LOADED | 3 | 30/33 (90.91%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/agent-plugins/mail-adapter-registry.ts | LOADED | 3 | 37/40 (92.50%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/api-connections/budgets.ts | LOADED | 3 | 33/36 (91.67%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/comments/comment-targets.ts | LOADED | 3 | 24/27 (88.89%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/comments/data-module-install.ts | LOADED | 3 | 17/20 (85.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/database-transfer/copy-engine.ts | LOADED | 3 | 18/21 (85.71%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/forms/field-length-caps.ts | LOADED | 3 | 36/39 (92.31%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/forms/render-entry.ts | LOADED | 3 | 13/16 (81.25%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/media/attachment-tools.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/members/repo.sqlite.ts | LOADED | 3 | 66/69 (95.65%) | 9/9 (100.00%) | 8/15 (53.33%) |
| apps/website/src/features/plugin-runtime/built-ins/content-analyzer/index.ts | LOADED | 3 | 104/107 (97.20%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/plugin-runtime/install.ts | LOADED | 3 | 20/23 (86.96%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/plugin-runtime/plugin-export.ts | LOADED | 3 | 15/18 (83.33%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/plugins/plugin-identity.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/post/search-index.contract.ts | LOADED | 3 | 46/49 (93.88%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/publish-content/execute-import.ts | LOADED | 3 | 55/58 (94.83%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/features/redirects/repo.sqlite.ts | LOADED | 3 | 29/32 (90.63%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/theme/asset-path-rewrites.ts | LOADED | 3 | 20/23 (86.96%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/theme/token-aliases.ts | LOADED | 3 | 50/53 (94.34%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/trash/repo.sqlite.ts | LOADED | 3 | 31/34 (91.18%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/features/webhooks/keyring.memory.ts | LOADED | 3 | 34/37 (91.89%) | 5/5 (100.00%) | 4/7 (57.14%) |
| apps/website/src/platform/db/drift.ts | LOADED | 3 | 54/57 (94.74%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/db/migrations/0005_media_createdby.ts | LOADED | 3 | 9/12 (75.00%) | 6/6 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0010_members_credentials_revoked_at.ts | LOADED | 3 | 14/17 (82.35%) | 6/6 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0014_media_library.ts | LOADED | 3 | 14/17 (82.35%) | 7/7 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0017_publish_history_kind.ts | LOADED | 3 | 10/13 (76.92%) | 6/6 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0018_form_submission_remote_receipts.ts | LOADED | 3 | 16/19 (84.21%) | 6/6 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0019_form_delivery_plans.ts | LOADED | 3 | 30/33 (90.91%) | 7/7 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0021_site_consent_revisions.ts | LOADED | 3 | 17/20 (85.00%) | 7/7 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0022_workspace_mcp_cascade.ts | LOADED | 3 | 28/31 (90.32%) | 6/6 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0023_mail_ledgers.ts | LOADED | 3 | 40/43 (93.02%) | 7/7 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0024_domain_bindings.ts | LOADED | 3 | 33/36 (91.67%) | 7/7 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0025_mail_feedback_processed.ts | LOADED | 3 | 27/30 (90.00%) | 6/6 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0026_domain_binding_version.ts | LOADED | 3 | 26/29 (89.66%) | 6/6 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0027_search_index.ts | LOADED | 3 | 35/38 (92.11%) | 7/7 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0028_search_index_retired.ts | LOADED | 3 | 25/28 (89.29%) | 6/6 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0032_member_signup_email.ts | LOADED | 3 | 15/18 (83.33%) | 6/6 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0033_mail_activity_message.ts | LOADED | 3 | 15/18 (83.33%) | 6/6 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0035_member_external_identities.ts | LOADED | 3 | 22/25 (88.00%) | 7/7 (100.00%) | 5/6 (83.33%) |
| apps/website/src/platform/db/migrations/0040_owner_mfa.ts | LOADED | 3 | 42/45 (93.33%) | 32/34 (94.12%) | 30/31 (96.77%) |
| apps/website/src/platform/db/migrations/0041_owner_passkeys.ts | LOADED | 3 | 23/26 (88.46%) | 24/26 (92.31%) | 22/23 (95.65%) |
| apps/website/src/platform/db/migrations/chat/0003_active_run_index.ts | LOADED | 3 | 14/17 (82.35%) | 7/8 (87.50%) | 6/8 (75.00%) |
| apps/website/src/platform/db/migrations/project/0002_site_key_attachments.ts | LOADED | 3 | 17/20 (85.00%) | 5/5 (100.00%) | 4/6 (66.67%) |
| apps/website/src/platform/db/sqlite/webhook-repo.sqlite.ts | LOADED | 3 | 23/26 (88.46%) | 4/4 (100.00%) | 3/5 (60.00%) |
| apps/website/src/server/inbound/admin-http/http/plugin-hook-error.ts | LOADED | 3 | 50/53 (94.34%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/execution-request-fields.ts | LOADED | 3 | 27/30 (90.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/admin-http/sea-runtime.ts | LOADED | 3 | 38/41 (92.68%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/inbound/assistant/ensure-json-agent-install.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/public-http/middleware/site-serving-gate.ts | LOADED | 3 | 72/75 (96.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/boot/agent-daemon-wanted.ts | LOADED | 3 | 40/43 (93.02%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/boot/sender-domain-verification.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/runtime/composition/modules/analytics.ts | LOADED | 3 | 18/21 (85.71%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/plugin-install-attachment-reader.ts | LOADED | 3 | 16/19 (84.21%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/sqlite-only-services.ts | LOADED | 3 | 20/23 (86.96%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/lifecycle/await-boot-work.ts | LOADED | 3 | 38/41 (92.68%) | 2/2 (100.00%) | 1/2 (50.00%) |
| development/sonarjs/eslint.config.mjs | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| development/test-support/composed-bundle-env.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/0 (0.00%) |
| apps/admin/src/components/AssistantDock/assistant-runtime-preferences.adapter.ts | LOADED | 2 | 7/9 (77.78%) | 7/8 (87.50%) | 5/7 (71.43%) |
| apps/admin/src/features/ai-assistant/hooks/use-visitor-tools.hooks.ts | LOADED | 2 | 50/52 (96.15%) | 45/49 (91.84%) | 17/19 (89.47%) |
| apps/admin/src/features/auth/Login.tsx | LOADED | 2 | 6/8 (75.00%) | 11/15 (73.33%) | 4/6 (66.67%) |
| apps/admin/src/features/email/EmailParts.tsx | LOADED | 2 | 15/17 (88.24%) | 16/22 (72.73%) | 11/12 (91.67%) |
| apps/admin/src/features/email/EmailProviderTab.tsx | LOADED | 2 | 63/65 (96.92%) | 93/112 (83.04%) | 31/33 (93.94%) |
| apps/admin/src/features/email/hooks/use-email-activity.hooks.ts | LOADED | 2 | 77/79 (97.47%) | 29/39 (74.36%) | 22/24 (91.67%) |
| apps/admin/src/features/email/hooks/use-email-provider.hooks.ts | LOADED | 2 | 85/87 (97.70%) | 33/38 (86.84%) | 26/27 (96.30%) |
| apps/admin/src/features/email/hooks/use-email.hooks.ts | LOADED | 2 | 18/20 (90.00%) | 20/22 (90.91%) | 10/12 (83.33%) |
| apps/admin/src/features/plugins/hooks/use-linked-lock-tip.hooks.ts | LOADED | 2 | 24/26 (92.31%) | 5/8 (62.50%) | 8/8 (100.00%) |
| apps/admin/src/features/security/hooks/access-tokens-dependencies.hooks.ts | LOADED | 2 | 37/39 (94.87%) | 32/33 (96.97%) | 39/41 (95.12%) |
| apps/admin/src/features/sites/hooks/site-transfer-dependencies.hooks.ts | LOADED | 2 | 42/44 (95.45%) | 35/42 (83.33%) | 28/33 (84.85%) |
| apps/admin/src/hooks/admin-execution-credential-dependencies.hooks.ts | LOADED | 2 | 14/16 (87.50%) | 15/17 (88.24%) | 6/6 (100.00%) |
| apps/admin/src/lib/browser-telemetry.ts | LOADED | 2 | 18/20 (90.00%) | 6/7 (85.71%) | 9/11 (81.82%) |
| apps/admin/src/lib/owner-passkey-api.ts | LOADED | 2 | 4/6 (66.67%) | 0/0 (100.00%) | 1/7 (14.29%) |
| apps/admin/src/lib/unique-id.ts | LOADED | 2 | 7/9 (77.78%) | 3/4 (75.00%) | 2/2 (100.00%) |
| apps/desktop/src/desktop-mcp-http.ts | LOADED | 2 | 82/84 (97.62%) | 20/26 (76.92%) | 12/15 (80.00%) |
| apps/desktop/src/renderer/app-render-harness.ts | LOADED | 2 | 136/138 (98.55%) | 56/61 (91.80%) | 54/91 (59.34%) |
| apps/desktop/src/renderer/app/SettingsControl.tsx | LOADED | 2 | 189/191 (98.95%) | 45/46 (97.83%) | 19/20 (95.00%) |
| apps/desktop/src/renderer/ImportWebsite.tsx | LOADED | 2 | 147/149 (98.66%) | 25/27 (92.59%) | 9/12 (75.00%) |
| apps/desktop/src/site-process-registry.ts | LOADED | 2 | 635/637 (99.69%) | 117/118 (99.15%) | 31/32 (96.88%) |
| apps/desktop/src/update-check-now.ts | LOADED | 2 | 174/176 (98.86%) | 42/45 (93.33%) | 13/13 (100.00%) |
| apps/website/src/assistant/agent-session-preset.ts | LOADED | 2 | 19/21 (90.48%) | 2/2 (100.00%) | 1/5 (20.00%) |
| apps/website/src/assistant/daemon-respawn-policy.ts | LOADED | 2 | 34/36 (94.44%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/assistant/duplicate-resource-registry.ts | LOADED | 2 | 66/68 (97.06%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/assistant/prompt-guidance.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/cli/help.ts | LOADED | 2 | 33/35 (94.29%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/contracts/core/runtime-mode.ts | LOADED | 2 | 30/32 (93.75%) | 4/7 (57.14%) | 3/6 (50.00%) |
| apps/website/src/contracts/core/scheduled-publish.ts | LOADED | 2 | 60/62 (96.77%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/agent-plugins/executable-tools/register.ts | LOADED | 2 | 7/9 (77.78%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/agent-plugins/memory-i18n.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/agent-plugins/search-provider-registry.ts | LOADED | 2 | 51/53 (96.23%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/api-connections/plugin-state.ts | LOADED | 2 | 9/11 (81.82%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/custom-credentials/types.ts | LOADED | 2 | 82/84 (97.62%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/database/gated-hooks.ts | LOADED | 2 | 8/10 (80.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/deployments/deploy-ops/agent-tools.ts | LOADED | 2 | 78/80 (97.50%) | 7/11 (63.64%) | 6/12 (50.00%) |
| apps/website/src/features/entries/tool-registrations.ts | LOADED | 2 | 66/68 (97.06%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/forms/repo.sqlite.ts | LOADED | 2 | 33/35 (94.29%) | 4/4 (100.00%) | 3/6 (50.00%) |
| apps/website/src/features/media/provider-credential-store.memory.ts | LOADED | 2 | 22/24 (91.67%) | 3/4 (75.00%) | 2/7 (28.57%) |
| apps/website/src/features/newsletter/types.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/plugin-runtime/repo.sqlite.ts | LOADED | 2 | 18/20 (90.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/plugin-runtime/source-tools.ts | LOADED | 2 | 14/16 (87.50%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/plugins/disk-headroom.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/plugins/plugin-store.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/post/expected-version.ts | LOADED | 2 | 74/76 (97.37%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/presentation/active-theme-id.ts | LOADED | 2 | 56/58 (96.55%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/recovery/gated-hooks.ts | LOADED | 2 | 9/11 (81.82%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/source-control/source-control-credential-repo.ts | LOADED | 2 | 16/18 (88.89%) | 3/4 (75.00%) | 2/4 (50.00%) |
| apps/website/src/features/theme/theme-layout.ts | LOADED | 2 | 158/160 (98.75%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/features/trash/agent-delete-policy.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/vendor-credentials/repo.memory.ts | LOADED | 2 | 6/8 (75.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/vendor-credentials/vendor-credential-repo.ts | LOADED | 2 | 9/11 (81.82%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/web/web-page.ts | LOADED | 2 | 34/36 (94.44%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/db/kernel/drivers/pglite-socket.ts | LOADED | 2 | 8/10 (80.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/db/kernel/drivers/pglite.ts | LOADED | 2 | 9/11 (81.82%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/platform/db/kernel/drivers/postgres.ts | LOADED | 2 | 8/10 (80.00%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/platform/db/watermark-kernel.ts | LOADED | 2 | 57/59 (96.61%) | 3/3 (100.00%) | 2/5 (40.00%) |
| apps/website/src/platform/mail/delivery-availability.ts | LOADED | 2 | 12/14 (85.71%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/site-dir/layout.ts | LOADED | 2 | 148/150 (98.67%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/website/src/platform/site-dir/sites-workspace-options.ts | LOADED | 2 | 33/35 (94.29%) | 19/24 (79.17%) | 13/14 (92.86%) |
| apps/website/src/server/inbound/admin-http/http/workspace.ts | LOADED | 2 | 23/25 (92.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/deps.ts | LOADED | 2 | 106/108 (98.15%) | 5/7 (71.43%) | 4/4 (100.00%) |
| apps/website/src/server/inbound/assistant/plugin-prompt-assembly.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/public-http/http/members.ts | LOADED | 2 | 40/42 (95.24%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/middleware/render-theme-override.ts | LOADED | 2 | 38/40 (95.00%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/public-http/middleware/theme-content-security-headers.ts | LOADED | 2 | 123/125 (98.40%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/shared/request-id.ts | LOADED | 2 | 24/26 (92.31%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/boot/bind-host.ts | LOADED | 2 | 93/95 (97.89%) | 5/10 (50.00%) | 4/6 (66.67%) |
| apps/website/src/server/runtime/composition/media-video-ports.ts | LOADED | 2 | 19/21 (90.48%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/modules/skills.ts | LOADED | 2 | 16/18 (88.89%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/site-dir.ts | LOADED | 2 | 47/49 (95.92%) | 6/6 (100.00%) | 5/7 (71.43%) |
| apps/website/src/server/runtime/composition/site-portability.ts | LOADED | 2 | 36/38 (94.74%) | 2/2 (100.00%) | 1/5 (20.00%) |
| development/scripts/dev-sites-home.d.mts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| development/scripts/free-port.d.mts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| development/scripts/local-dev-plugin-install.mjs | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| development/scripts/test-safety-eslint.config.mjs | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-admin-subagents.hooks.ts | LOADED | 1 | 39/40 (97.50%) | 54/57 (94.74%) | 21/22 (95.45%) |
| apps/admin/src/features/auth/hooks/login-dependencies.hooks.ts | LOADED | 1 | 6/7 (85.71%) | 5/5 (100.00%) | 3/4 (75.00%) |
| apps/admin/src/features/email/EmailSenderTab.tsx | LOADED | 1 | 35/36 (97.22%) | 46/56 (82.14%) | 14/15 (93.33%) |
| apps/admin/src/features/email/EmailTemplateEditor.tsx | LOADED | 1 | 71/72 (98.61%) | 77/100 (77.00%) | 31/33 (93.94%) |
| apps/admin/src/features/email/hooks/use-email-overview.hooks.ts | LOADED | 1 | 16/17 (94.12%) | 8/9 (88.89%) | 5/6 (83.33%) |
| apps/admin/src/features/email/hooks/use-email-sender.hooks.ts | LOADED | 1 | 53/54 (98.15%) | 26/29 (89.66%) | 14/15 (93.33%) |
| apps/admin/src/features/integrations/hooks/integration-deliveries-dependencies.hooks.ts | LOADED | 1 | 4/5 (80.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/admin/src/features/menus/MenuEditor.tsx | LOADED | 1 | 47/48 (97.92%) | 41/42 (97.62%) | 43/43 (100.00%) |
| apps/admin/src/features/observability/hooks/observability-status-dependencies.hooks.ts | LOADED | 1 | 5/6 (83.33%) | 5/5 (100.00%) | 3/4 (75.00%) |
| apps/admin/src/features/plugins/hooks/use-plugins.hooks.ts | LOADED | 1 | 58/59 (98.31%) | 19/21 (90.48%) | 28/29 (96.55%) |
| apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts | LOADED | 1 | 244/245 (99.59%) | 118/121 (97.52%) | 60/61 (98.36%) |
| apps/admin/src/features/providers/Providers.tsx | LOADED | 1 | 11/12 (91.67%) | 12/12 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/security/AccessTokensTab.tsx | LOADED | 1 | 123/124 (99.19%) | 136/137 (99.27%) | 70/71 (98.59%) |
| apps/admin/src/features/security/hooks/use-copy-keys.hooks.ts | LOADED | 1 | 42/43 (97.67%) | 33/39 (84.62%) | 16/16 (100.00%) |
| apps/admin/src/features/security/security-i18n.ts | LOADED | 1 | 34/35 (97.14%) | 19/21 (90.48%) | 14/15 (93.33%) |
| apps/admin/src/features/security/Security.tsx | LOADED | 1 | 15/16 (93.75%) | 10/10 (100.00%) | 6/7 (85.71%) |
| apps/admin/src/features/sites/AllSitesTab.tsx | LOADED | 1 | 40/41 (97.56%) | 34/36 (94.44%) | 18/18 (100.00%) |
| apps/admin/src/features/sites/hooks/sites-dependencies.hooks.ts | LOADED | 1 | 12/13 (92.31%) | 11/11 (100.00%) | 11/12 (91.67%) |
| apps/admin/src/features/sites/hooks/use-site-transfer.hooks.ts | LOADED | 1 | 189/190 (99.47%) | 126/138 (91.30%) | 47/47 (100.00%) |
| apps/admin/src/features/sites/SiteImportTab.tsx | LOADED | 1 | 65/66 (98.48%) | 96/97 (98.97%) | 30/31 (96.77%) |
| apps/admin/src/features/sites/StaticExportPicker.tsx | LOADED | 1 | 19/20 (95.00%) | 28/28 (100.00%) | 10/11 (90.91%) |
| apps/desktop/src/project-ipc.ts | LOADED | 1 | 1942/1943 (99.95%) | 533/551 (96.73%) | 154/161 (95.65%) |
| apps/desktop/src/renderer/app/component-harness.ts | LOADED | 1 | 105/106 (99.06%) | 26/27 (96.30%) | 25/30 (83.33%) |
| apps/desktop/src/renderer/use-import-website.hooks.ts | LOADED | 1 | 178/179 (99.44%) | 45/48 (93.75%) | 15/17 (88.24%) |
| apps/desktop/src/renderer/use-tab-close-ask.hooks.ts | LOADED | 1 | 111/112 (99.11%) | 35/41 (85.37%) | 19/19 (100.00%) |
| apps/website/src/assistant/durable-runs/accept.ts | LOADED | 1 | 6/7 (85.71%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/assistant/durable-runs/continuation.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/assistant/persistence/chat-history-store.ts | LOADED | 1 | 7/8 (87.50%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/assistant/persistence/durable-run-store.ts | LOADED | 1 | 7/8 (87.50%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/cli/commands/site-rename.ts | LOADED | 1 | 15/16 (93.75%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/cli/introspect.ts | LOADED | 1 | 35/36 (97.22%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/contracts/core/admin-locales.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/commands/repo.memory.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/commands/revert.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/credential-token.ts | LOADED | 1 | 9/10 (90.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/contracts/core/model-facing-tool-errors.ts | LOADED | 1 | 52/53 (98.11%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/contracts/core/post-author.ts | LOADED | 1 | 6/7 (85.71%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/contracts/core/publish-history-list-limit.ts | LOADED | 1 | 23/24 (95.83%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/contracts/core/secret-redaction.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/strict-base64.ts | LOADED | 1 | 32/33 (96.97%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/contracts/core/tool-access-change.ts | LOADED | 1 | 10/11 (90.91%) | 3/4 (75.00%) | 2/4 (50.00%) |
| apps/website/src/contracts/core/tool-failure-diagnostics.ts | LOADED | 1 | 9/10 (90.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/agent-plugins/admin-surfaces/public-config.ts | LOADED | 1 | 29/30 (96.67%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/agent-plugins/admin-surfaces/same-origin.ts | LOADED | 1 | 32/33 (96.97%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/api-connections/hook-http.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/api-connections/host.ts | LOADED | 1 | 13/14 (92.86%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/comments/repo.sqlite.ts | LOADED | 1 | 21/22 (95.45%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/content-types/repo.memory.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/content-types/write-service.ts | LOADED | 1 | 41/42 (97.62%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/custom-credentials/credential-copy-tool.ts | LOADED | 1 | 69/70 (98.57%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/custom-credentials/repo.memory.ts | LOADED | 1 | 6/7 (85.71%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/custom-credentials/sets/store.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/custom-credentials/sets/vault-repo.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/database-transfer/postgres-target.ts | LOADED | 1 | 6/7 (85.71%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/database/boot/evaluate-boot-migration-policy.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/deployments/publish-credentials/execution-mode.ts | LOADED | 1 | 41/42 (97.62%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/external-mcp/contracts.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/external-mcp/external-mcp-shared-oauth.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/fs-files/layout.ts | LOADED | 1 | 158/159 (99.37%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/media/content-type-store.ts | LOADED | 1 | 79/80 (98.75%) | 3/4 (75.00%) | 2/6 (33.33%) |
| apps/website/src/features/navigation/html-render.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/plugin-runtime/declarative-content-types.ts | LOADED | 1 | 88/89 (98.88%) | 2/2 (100.00%) | 1/6 (16.67%) |
| apps/website/src/features/plugin-runtime/invocation-core-deps.ts | LOADED | 1 | 51/52 (98.08%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/plugin-runtime/lower-tool-access.ts | LOADED | 1 | 13/14 (92.86%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/plugins/restore.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/post/author.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/publish-content/apply-errors.ts | LOADED | 1 | 66/67 (98.51%) | 3/4 (75.00%) | 2/4 (50.00%) |
| apps/website/src/features/publish-content/baseline-repo.ts | LOADED | 1 | 81/82 (98.78%) | 3/4 (75.00%) | 2/6 (33.33%) |
| apps/website/src/features/recovery/restore-points.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/taxonomy/html-render.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/taxonomy/repo.sqlite.ts | LOADED | 1 | 43/44 (97.73%) | 6/6 (100.00%) | 5/9 (55.56%) |
| apps/website/src/features/theme/theme-id-aliases.ts | LOADED | 1 | 33/34 (97.06%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/tool-audit/types.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/web-screenshot/request-guard.ts | LOADED | 1 | 14/15 (93.33%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/web/html-document.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/web/html-to-markdown.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/platform/db/kernel/stopped-database.ts | LOADED | 1 | 51/52 (98.08%) | 13/17 (76.47%) | 6/9 (66.67%) |
| apps/website/src/platform/db/migrations/0038_newsletter_sending_index.ts | LOADED | 1 | 23/24 (95.83%) | 9/9 (100.00%) | 8/9 (88.89%) |
| apps/website/src/platform/db/migrations/0039_owner_recovery_codes.ts | LOADED | 1 | 25/26 (96.15%) | 15/15 (100.00%) | 14/15 (93.33%) |
| apps/website/src/platform/db/migrations/commerce/0000_catalog.ts | LOADED | 1 | 53/54 (98.15%) | 5/5 (100.00%) | 4/6 (66.67%) |
| apps/website/src/platform/oauth/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/platform/routing/adapter.ts | LOADED | 1 | 15/16 (93.75%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/platform/routing/reserved-paths.ts | LOADED | 1 | 87/88 (98.86%) | 2/2 (100.00%) | 1/4 (25.00%) |
| apps/website/src/server/inbound/admin-http/http/posts.ts | LOADED | 1 | 8/9 (88.89%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/public-http/routes/external-mcp/oauth-callback-url.ts | LOADED | 1 | 34/35 (97.14%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/boot/boot-listener.ts | LOADED | 1 | 38/39 (97.44%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/boot/mail-provider-configuration.ts | LOADED | 1 | 5/6 (83.33%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/boot/plugin-sdk-resolver.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/server/runtime/boot/site-boot-readiness.ts | LOADED | 1 | 46/47 (97.87%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/admin-assistant-enabled.ts | LOADED | 1 | 47/48 (97.92%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/composition/authoritative-dns.ts | LOADED | 1 | 34/35 (97.14%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/server/runtime/composition/commerce-origin.ts | LOADED | 1 | 10/11 (90.91%) | 2/2 (100.00%) | 1/2 (50.00%) |
| development/evals/tool-search-caller2-compliance-captures-2026-08-05.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| development/evals/tool-search-caller2-compliance-captures-2026-09-08.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| development/evals/tool-search-distractors-doc2query-calibration-250.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| development/evals/tool-search-heldout-v2.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| development/evals/tool-search-hyde-blind-expansions.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| development/evals/tool-search-hyde-prompt-expansions-v2.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| development/evals/tool-search-hyde-prompt-expansions.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| development/scripts/test-safety-eslint.config.d.mts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| development/test-support/agent-plugin-source.d.mts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/contracts/src/admin-failure-copy.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/contracts/src/admin-locales.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/contracts/src/site-share-limits.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/sdk/src/hooks.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/admin/src/__measurements__/forms-harness.tsx | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/__measurements__/redirects-harness.tsx | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/admin-themes/apply.ts | LOADED | 0 | 12/12 (100.00%) | 12/12 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/admin-themes/registry.ts | LOADED | 0 | 5/5 (100.00%) | 11/11 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/admin-themes/use-admin-theme.hooks.ts | LOADED | 0 | 71/71 (100.00%) | 64/65 (98.46%) | 29/29 (100.00%) |
| apps/admin/src/app-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/App.hooks.ts | LOADED | 0 | 245/245 (100.00%) | 159/160 (99.38%) | 107/107 (100.00%) |
| apps/admin/src/App.tsx | LOADED | 0 | 102/102 (100.00%) | 75/75 (100.00%) | 32/32 (100.00%) |
| apps/admin/src/components/AdminByokKeyPanel.tsx | LOADED | 0 | 25/25 (100.00%) | 35/35 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/components/AdminFailureNotice/AdminFailureNotice.tsx | LOADED | 0 | 5/5 (100.00%) | 6/7 (85.71%) | 2/2 (100.00%) |
| apps/admin/src/components/AssistantDock/agent-failure-hints.ts | LOADED | 0 | 2/2 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/agent-failure.ts | LOADED | 0 | 74/74 (100.00%) | 92/92 (100.00%) | 32/32 (100.00%) |
| apps/admin/src/components/AssistantDock/AgentFailureCard.hooks.ts | LOADED | 0 | 35/35 (100.00%) | 37/38 (97.37%) | 20/20 (100.00%) |
| apps/admin/src/components/AssistantDock/AgentFailureCard.tsx | LOADED | 0 | 5/5 (100.00%) | 12/12 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/components/AssistantDock/assistant-dock-i18n.ts | LOADED | 0 | 12/12 (100.00%) | 11/11 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/components/AssistantDock/assistant-dock-props.tsx | LOADED | 0 | 7/7 (100.00%) | 22/22 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/components/AssistantDock/assistant-runtime-preferences.ts | LOADED | 0 | 15/15 (100.00%) | 10/10 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/components/AssistantDock/AssistantDock.tsx | LOADED | 0 | 52/52 (100.00%) | 14/15 (93.33%) | 4/4 (100.00%) |
| apps/admin/src/components/AssistantDock/chat-agent-plugin-preferences.adapter.ts | LOADED | 0 | 10/10 (100.00%) | 9/9 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/components/AssistantDock/chat-agent-plugin-preferences.ts | LOADED | 0 | 7/7 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/AssistantDock/chat-display-preferences.adapter.ts | LOADED | 0 | 9/9 (100.00%) | 4/4 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/components/AssistantDock/chat-display-preferences.ts | LOADED | 0 | 12/12 (100.00%) | 7/7 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/components/AssistantDock/dock-header-rules.ts | LOADED | 0 | 33/33 (100.00%) | 32/32 (100.00%) | 21/21 (100.00%) |
| apps/admin/src/components/AssistantDock/DockHeader.tsx | LOADED | 0 | 4/4 (100.00%) | 13/13 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/components/AssistantDock/DockHeaderTip.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 9/9 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/AssistantDock/DockHeaderTip.tsx | LOADED | 0 | 2/2 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/DockLeadingAccessory.tsx | LOADED | 0 | 3/3 (100.00%) | 10/10 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/components/AssistantDock/DockSettingsMenu.tsx | LOADED | 0 | 22/22 (100.00%) | 47/47 (100.00%) | 14/14 (100.00%) |
| apps/admin/src/components/AssistantDock/execution-config-write.ts | LOADED | 0 | 21/21 (100.00%) | 20/20 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/components/AssistantDock/FolderDropConfirmation.tsx | LOADED | 0 | 2/2 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/FolderDropError.tsx | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/AssistantDock/FolderDropNotice.tsx | LOADED | 0 | 5/5 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/FolderDropPathHint.tsx | LOADED | 0 | 2/2 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/FolderPathButton.tsx | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx | LOADED | 0 | 429/429 (100.00%) | 323/325 (99.38%) | 161/161 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/chat-package-kind.ts | LOADED | 0 | 62/62 (100.00%) | 69/69 (100.00%) | 14/14 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/composer-skills.hooks.ts | LOADED | 0 | 32/32 (100.00%) | 22/22 (100.00%) | 23/23 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/conversation-refresh.hooks.ts | LOADED | 0 | 1/1 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/resolve-composer-discovery-outcome.ts | LOADED | 0 | 20/20 (100.00%) | 14/14 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/use-assistant-empty-state.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 9/9 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/use-assistant-runtime-preferences.hooks.ts | LOADED | 0 | 28/28 (100.00%) | 15/15 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/use-chat-agent-plugins.hooks.ts | LOADED | 0 | 26/26 (100.00%) | 11/11 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/use-chat-display-preferences.hooks.ts | LOADED | 0 | 28/28 (100.00%) | 12/12 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/use-composer-send-stop-guard.hooks.ts | LOADED | 0 | 19/19 (100.00%) | 21/21 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts | LOADED | 0 | 16/16 (100.00%) | 0/0 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/use-routed-a2ui-surface-card.hooks.ts | LOADED | 0 | 30/30 (100.00%) | 28/28 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/use-selected-agent-auth-warning.hooks.ts | LOADED | 0 | 19/19 (100.00%) | 17/17 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/useOverflowDetection.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 6/6 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/components/AssistantDock/local-cli-selection-echo.ts | LOADED | 0 | 4/4 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/MessageOverflowModal.hooks.tsx | LOADED | 0 | 18/18 (100.00%) | 14/14 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/components/AssistantDock/MessageOverflowModal.tsx | LOADED | 0 | 3/3 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/OverflowAwareMcpUiSurfaceCard.tsx | LOADED | 0 | 6/6 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/AssistantDock/RoutedA2uiSurfaceCard.tsx | LOADED | 0 | 10/10 (100.00%) | 7/7 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/components/AssistantDock/SelectedAgentPluginTray.tsx | LOADED | 0 | 5/5 (100.00%) | 4/4 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/AssistantDock/SlowRunNoticeCard.hooks.ts | LOADED | 0 | 3/3 (100.00%) | 9/9 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/components/AssistantDock/SlowRunNoticeCard.tsx | LOADED | 0 | 3/3 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/SubagentsIndicator.tsx | LOADED | 0 | 3/3 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/components/ChatFab/ChatFab.hooks.tsx | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/ChatFab/ChatFab.tsx | LOADED | 0 | 8/8 (100.00%) | 15/15 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/CodeView/CodeView.tsx | LOADED | 0 | 5/5 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/components/CodeView/preview-modal-icons.tsx | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/CodeView/use-code-wrap.hooks.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/ComingSoonPanel.tsx | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/components/CredentialHint.tsx | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/device-preview-icons.tsx | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/DevicePreview/DevicePreview.hooks.ts | LOADED | 0 | 24/24 (100.00%) | 20/20 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/components/DevicePreview/DevicePreviewFrame.tsx | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/DevicePreview/DevicePreviewToggle.tsx | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/EmbedInsertControl/EmbedInsertControl.hooks.tsx | LOADED | 0 | 12/12 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/EmbedInsertControl/EmbedInsertControl.tsx | LOADED | 0 | 34/34 (100.00%) | 27/27 (100.00%) | 20/20 (100.00%) |
| apps/admin/src/components/InstallTabCard/folder-zip.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/components/InstallTabCard/install-archive-size.ts | LOADED | 0 | 3/3 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/InstallTabCard/InstallTabCard.tsx | LOADED | 0 | 6/6 (100.00%) | 27/27 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/components/InstallTabCard/use-folder-upload.hooks.ts | LOADED | 0 | 20/20 (100.00%) | 9/9 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/components/InstallTabCard/use-zip-drop.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 7/7 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/components/MailStatusBanner/hooks/use-mail-status-banner.hooks.ts | LOADED | 0 | 24/24 (100.00%) | 7/7 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/components/MailStatusBanner/MailStatusBanner.tsx | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/MediaEditDialog/MediaEditDialog.hooks.tsx | LOADED | 0 | 10/10 (100.00%) | 14/14 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/components/MediaEditDialog/MediaEditDialog.tsx | LOADED | 0 | 10/10 (100.00%) | 16/16 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/components/MediaPickerDialog/JiniMediaPicker.hooks.ts | LOADED | 0 | 20/20 (100.00%) | 22/22 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/components/MediaPickerDialog/media-picker-dependencies.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 3/3 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/components/MediaPickerDialog/MediaPickerDialog.hooks.tsx | LOADED | 0 | 16/16 (100.00%) | 12/12 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/components/MediaPickerDialog/MediaPickerDialog.tsx | LOADED | 0 | 16/16 (100.00%) | 22/22 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/components/Placeholder.tsx | LOADED | 0 | 18/18 (100.00%) | 16/16 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/components/PlainTextBlocks.tsx | LOADED | 0 | 6/6 (100.00%) | 6/6 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/components/SecretInput/SecretInput.tsx | LOADED | 0 | 8/8 (100.00%) | 11/12 (91.67%) | 3/3 (100.00%) |
| apps/admin/src/components/Select/Select.hooks.tsx | LOADED | 0 | 52/52 (100.00%) | 44/44 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/components/Select/Select.tsx | LOADED | 0 | 5/5 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/components/ServerRestartingBanner/hooks/use-server-connection-status.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/ServerRestartingBanner/ServerRestartingBanner.tsx | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/shared-components-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/components/SitesSidebarNav.tsx | LOADED | 0 | 2/2 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/status-labels.ts | LOADED | 0 | 10/10 (100.00%) | 8/8 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/components/TemplateSource/template-source-dependencies.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/TemplateSource/TemplateSourceModal.tsx | LOADED | 0 | 16/16 (100.00%) | 15/15 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/components/TemplateSource/use-template-source.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 8/8 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/components/TemplateSource/ViewTemplateButton.tsx | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/WidgetConfigFields/HtmlAttributeRows.hooks.ts | LOADED | 0 | 11/11 (100.00%) | 6/6 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/components/WidgetConfigFields/HtmlAttributeRows.tsx | LOADED | 0 | 7/7 (100.00%) | 10/10 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/components/WidgetConfigFields/media-content-rules.ts | LOADED | 0 | 119/119 (100.00%) | 141/141 (100.00%) | 39/39 (100.00%) |
| apps/admin/src/components/WidgetConfigFields/MediaContentEditor.hooks.ts | LOADED | 0 | 71/71 (100.00%) | 43/43 (100.00%) | 34/34 (100.00%) |
| apps/admin/src/components/WidgetConfigFields/MediaContentEditor.tsx | LOADED | 0 | 67/67 (100.00%) | 103/103 (100.00%) | 43/43 (100.00%) |
| apps/admin/src/components/WidgetConfigFields/PlacementContentFields.tsx | LOADED | 0 | 5/5 (100.00%) | 3/3 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/components/WidgetConfigFields/widget-config-fields-dependencies.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 15/15 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.hooks.tsx | LOADED | 0 | 94/94 (100.00%) | 82/82 (100.00%) | 38/38 (100.00%) |
| apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.tsx | LOADED | 0 | 79/79 (100.00%) | 86/86 (100.00%) | 50/50 (100.00%) |
| apps/admin/src/components/WidgetConfigFields/WidgetPreview.hooks.ts | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/WidgetPickerDialog/widget-picker-dependencies.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 7/7 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.hooks.tsx | LOADED | 0 | 63/63 (100.00%) | 36/36 (100.00%) | 16/16 (100.00%) |
| apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.tsx | LOADED | 0 | 20/20 (100.00%) | 31/31 (100.00%) | 17/17 (100.00%) |
| apps/admin/src/features/admin-themes/admin-themes-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/admin-themes/AdminThemes.tsx | LOADED | 0 | 25/25 (100.00%) | 39/39 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/features/admin-themes/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/admin-ui/AdminUi.tsx | LOADED | 0 | 7/7 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/admin-ui/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/ai-assistant/AdminPermanentDeletes.tsx | LOADED | 0 | 14/14 (100.00%) | 21/21 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/ai-assistant/AdminSubagents.tsx | LOADED | 0 | 12/12 (100.00%) | 24/24 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/ai-assistant/ai-assistant-i18n.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/ai-assistant/ai-assistant-layout-i18n.ts | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/ai-assistant/AiAssistant.tsx | LOADED | 0 | 84/84 (100.00%) | 111/111 (100.00%) | 37/37 (100.00%) |
| apps/admin/src/features/ai-assistant/AssistantToggleRow.tsx | LOADED | 0 | 6/6 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/ai-assistant-dependencies.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/assistant-daemon-restart-dependencies.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 5/5 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-admin-assistant-switch.hooks.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-admin-execution-mode.hooks.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-admin-permanent-deletes.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 16/16 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-ai-assistant-locale-sync.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-ai-assistant.hooks.ts | LOADED | 0 | 32/32 (100.00%) | 19/19 (100.00%) | 16/16 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-assistant-daemon-restart.hooks.ts | LOADED | 0 | 28/28 (100.00%) | 3/3 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-assistant-owner-grant.hooks.ts | LOADED | 0 | 34/34 (100.00%) | 33/33 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-visitor-assistant-panel.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 9/9 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts | LOADED | 0 | 138/138 (100.00%) | 80/80 (100.00%) | 46/46 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/visitor-credential-form-dependencies.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/ai-assistant/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/ai-assistant/OwnerGrantStatus.tsx | LOADED | 0 | 1/1 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/ai-assistant/rules.ts | LOADED | 0 | 34/34 (100.00%) | 54/54 (100.00%) | 22/22 (100.00%) |
| apps/admin/src/features/ai-assistant/visitor-tools-i18n.ts | LOADED | 0 | 9/9 (100.00%) | 1/1 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/ai-assistant/VisitorAssistantPanel.tsx | LOADED | 0 | 12/12 (100.00%) | 14/14 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/ai-assistant/VisitorAssistantTabs.tsx | LOADED | 0 | 8/8 (100.00%) | 6/8 (75.00%) | 4/4 (100.00%) |
| apps/admin/src/features/ai-assistant/VisitorToolsPanel.tsx | LOADED | 0 | 34/34 (100.00%) | 54/55 (98.18%) | 15/15 (100.00%) |
| apps/admin/src/features/analytics/analytics-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/analytics/Analytics.tsx | LOADED | 0 | 10/10 (100.00%) | 12/12 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/analytics/hooks/analytics-dependencies.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/analytics/hooks/use-analytics.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 6/6 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/analytics/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/auth/auth-i18n.ts | LOADED | 0 | 6/6 (100.00%) | 1/2 (50.00%) | 2/2 (100.00%) |
| apps/admin/src/features/auth/hooks/use-login.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 12/12 (100.00%) | 8/9 (88.89%) |
| apps/admin/src/features/auth/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/auth/OwnerRecoverySignIn.tsx | LOADED | 0 | 16/16 (100.00%) | 10/11 (90.91%) | 6/6 (100.00%) |
| apps/admin/src/features/authentication/authentication-i18n.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/authentication/Authentication.tsx | LOADED | 0 | 13/13 (100.00%) | 0/0 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/authentication/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/authentication/model/provider-schemas.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/collections/CollectionEntries.tsx | LOADED | 0 | 13/13 (100.00%) | 13/13 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/collections/CollectionEntryEditor.tsx | LOADED | 0 | 51/51 (100.00%) | 74/74 (100.00%) | 29/29 (100.00%) |
| apps/admin/src/features/collections/collections-i18n.ts | LOADED | 0 | 14/14 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/collections/Collections.tsx | LOADED | 0 | 53/53 (100.00%) | 46/46 (100.00%) | 44/44 (100.00%) |
| apps/admin/src/features/collections/hooks/collection-entries-dependencies.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 11/11 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/collections/hooks/collection-entry-editor-dependencies.hooks.ts | LOADED | 0 | 29/29 (100.00%) | 21/21 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/features/collections/hooks/collections-dependencies.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 7/7 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/collections/hooks/edit-fields-dialog-dependencies.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 5/5 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/collections/hooks/new-content-type-dialog-dependencies.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 5/5 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/collections/hooks/use-collection-entries.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 6/6 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/collections/hooks/use-collection-entry-editor.hooks.ts | LOADED | 0 | 100/100 (100.00%) | 58/58 (100.00%) | 17/17 (100.00%) |
| apps/admin/src/features/collections/hooks/use-collections.hooks.ts | LOADED | 0 | 27/27 (100.00%) | 8/8 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/collections/hooks/use-edit-fields-dialog.hooks.ts | LOADED | 0 | 28/28 (100.00%) | 11/11 (100.00%) | 14/14 (100.00%) |
| apps/admin/src/features/collections/hooks/use-json-field-control.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 2/2 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/collections/hooks/use-lifecycle-confirm-dialog.hooks.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/collections/hooks/use-new-content-type-dialog.hooks.ts | LOADED | 0 | 29/29 (100.00%) | 8/8 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/collections/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/collections/rules.ts | LOADED | 0 | 63/63 (100.00%) | 49/49 (100.00%) | 31/31 (100.00%) |
| apps/admin/src/features/comments/comments-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/comments/index.ts | LOADED | 0 | 1/1 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/consent/consent-autosave.ts | LOADED | 0 | 32/32 (100.00%) | 19/19 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/features/consent/consent-dictionary.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/consent/consent-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/consent/ConsentOverviewTab.tsx | LOADED | 0 | 12/12 (100.00%) | 38/38 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/consent/CookieConsent.tsx | LOADED | 0 | 31/31 (100.00%) | 51/53 (96.23%) | 15/15 (100.00%) |
| apps/admin/src/features/consent/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/consent/rules.ts | LOADED | 0 | 21/21 (100.00%) | 44/44 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/consent/settings.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 5/5 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/consent/use-consent-page.hooks.ts | LOADED | 0 | 90/90 (100.00%) | 50/52 (96.15%) | 33/33 (100.00%) |
| apps/admin/src/features/content-analysis/content-analysis-i18n.ts | LOADED | 0 | 7/7 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/content-analysis/ContentAnalysisCard.tsx | LOADED | 0 | 8/8 (100.00%) | 12/12 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/content-analysis/hooks/content-analysis-dependencies.hooks.ts | LOADED | 0 | 17/17 (100.00%) | 12/12 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/content-analysis/hooks/use-content-analysis.hooks.ts | LOADED | 0 | 20/20 (100.00%) | 6/6 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/content-analysis/rules.ts | LOADED | 0 | 66/66 (100.00%) | 85/85 (100.00%) | 29/29 (100.00%) |
| apps/admin/src/features/dashboard/dashboard-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/dashboard/Dashboard.tsx | LOADED | 0 | 26/26 (100.00%) | 35/35 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/features/dashboard/hooks/dashboard-dependencies.hooks.ts | LOADED | 0 | 27/27 (100.00%) | 36/36 (100.00%) | 18/18 (100.00%) |
| apps/admin/src/features/dashboard/hooks/use-dashboard.hooks.ts | LOADED | 0 | 56/56 (100.00%) | 28/28 (100.00%) | 36/36 (100.00%) |
| apps/admin/src/features/dashboard/hooks/use-recent-activity-disclosure.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 2/2 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/dashboard/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/dashboard/rules.ts | LOADED | 0 | 18/18 (100.00%) | 23/23 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/database/database-i18n.tsx | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/database/database-visuals.tsx | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/database/Database.tsx | LOADED | 0 | 51/51 (100.00%) | 47/47 (100.00%) | 29/29 (100.00%) |
| apps/admin/src/features/database/hooks/migrate-forward-section-dependencies.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 13/13 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/database/hooks/schema-state-section-dependencies.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/database/hooks/timeline-section-dependencies.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/database/hooks/use-migrate-forward-section.hooks.ts | LOADED | 0 | 46/46 (100.00%) | 18/18 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/database/hooks/use-schema-state-section.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/database/hooks/use-timeline-section.hooks.ts | LOADED | 0 | 51/51 (100.00%) | 28/28 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/database/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/database/rules.ts | LOADED | 0 | 16/16 (100.00%) | 11/11 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/deployment/deployment-i18n.tsx | LOADED | 0 | 47/47 (100.00%) | 4/4 (100.00%) | 20/20 (100.00%) |
| apps/admin/src/features/deployment/deployment-visuals.tsx | LOADED | 0 | 12/12 (100.00%) | 15/15 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/features/deployment/Deployment.tsx | LOADED | 0 | 11/11 (100.00%) | 6/6 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/deployment/DockerfileTab.tsx | LOADED | 0 | 30/30 (100.00%) | 30/30 (100.00%) | 14/14 (100.00%) |
| apps/admin/src/features/deployment/HistoryTab.tsx | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/deployment/hooks/deployment-overview-dependencies.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/deployment/hooks/dockerfile-source-dependencies.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 5/5 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/deployment/hooks/publish-credentials-dependencies.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 13/13 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/deployment/hooks/static-export-dependencies.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 7/7 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/deployment/hooks/static-publish-dependencies.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 9/9 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/deployment/hooks/use-deployment-overview.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 2/2 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/deployment/hooks/use-dockerfile-source.hooks.ts | LOADED | 0 | 50/50 (100.00%) | 31/31 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/deployment/hooks/use-publish-credentials.hooks.ts | LOADED | 0 | 83/83 (100.00%) | 89/89 (100.00%) | 40/40 (100.00%) |
| apps/admin/src/features/deployment/hooks/use-static-export.hooks.ts | LOADED | 0 | 61/61 (100.00%) | 21/21 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/deployment/hooks/use-static-publish.hooks.ts | LOADED | 0 | 98/98 (100.00%) | 47/47 (100.00%) | 19/19 (100.00%) |
| apps/admin/src/features/deployment/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/deployment/OverviewTab.tsx | LOADED | 0 | 17/17 (100.00%) | 20/20 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/features/deployment/PublishRunResult.tsx | LOADED | 0 | 8/8 (100.00%) | 11/11 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/deployment/rules.ts | LOADED | 0 | 77/77 (100.00%) | 114/114 (100.00%) | 39/39 (100.00%) |
| apps/admin/src/features/deployment/StaticSiteTab.tsx | LOADED | 0 | 97/97 (100.00%) | 155/156 (99.36%) | 53/53 (100.00%) |
| apps/admin/src/features/email/email-i18n.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/email/email-tabs-i18n.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/email/Email.tsx | LOADED | 0 | 44/44 (100.00%) | 29/33 (87.88%) | 15/15 (100.00%) |
| apps/admin/src/features/email/hooks/email-load.hooks.ts | LOADED | 0 | 16/16 (100.00%) | 14/15 (93.33%) | 11/11 (100.00%) |
| apps/admin/src/features/email/hooks/use-email-template-view.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/email/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/forms/forms-field-settings-i18n.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/forms/forms-i18n.ts | LOADED | 0 | 8/8 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/forms/forms-leave-guard-i18n.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/forms/index-aligned-translations.ts | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/forms/index.ts | LOADED | 0 | 2/2 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/fs-files/folder-drop-port.ts | LOADED | 0 | 2/2 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/fs-files/hooks/use-folder-drop.hooks.ts | LOADED | 0 | 73/73 (100.00%) | 53/55 (96.36%) | 19/19 (100.00%) |
| apps/admin/src/features/fs-files/hooks/use-native-folder-picker.hooks.ts | LOADED | 0 | 24/24 (100.00%) | 19/20 (95.00%) | 10/10 (100.00%) |
| apps/admin/src/features/import-export/git-backup-rules.ts | LOADED | 0 | 13/13 (100.00%) | 17/17 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/import-export/GitBackupCard.tsx | LOADED | 0 | 28/28 (100.00%) | 32/32 (100.00%) | 16/16 (100.00%) |
| apps/admin/src/features/import-export/hooks/git-backup-port.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 1/1 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/import-export/hooks/use-git-backup.hooks.ts | LOADED | 0 | 46/46 (100.00%) | 39/40 (97.50%) | 13/13 (100.00%) |
| apps/admin/src/features/import-export/hooks/use-import-export.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 6/6 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/import-export/import-export-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/import-export/import-export-links.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/import-export/import-export-tabs.tsx | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/import-export/ImportExport.tsx | LOADED | 0 | 12/12 (100.00%) | 9/9 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/import-export/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/integrations/hooks/integrations-dependencies.hooks.ts | LOADED | 0 | 20/20 (100.00%) | 9/9 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/integrations/hooks/use-integrations-redirect.hooks.ts | LOADED | 0 | 2/2 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/integrations/hooks/use-integrations.hooks.ts | LOADED | 0 | 39/39 (100.00%) | 8/8 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/integrations/index.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/integrations/IntegrationDeliveries.tsx | LOADED | 0 | 9/9 (100.00%) | 9/9 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/integrations/integrations-i18n.tsx | LOADED | 0 | 7/7 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/integrations/Integrations.tsx | LOADED | 0 | 21/21 (100.00%) | 20/20 (100.00%) | 16/16 (100.00%) |
| apps/admin/src/features/integrations/IntegrationsRedirect.tsx | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/integrations/rules.ts | LOADED | 0 | 13/13 (100.00%) | 12/12 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/library/hooks/library-dependencies.hooks.ts | LOADED | 0 | 41/41 (100.00%) | 18/18 (100.00%) | 25/25 (100.00%) |
| apps/admin/src/features/library/hooks/use-library.hooks.ts | LOADED | 0 | 117/117 (100.00%) | 53/53 (100.00%) | 39/39 (100.00%) |
| apps/admin/src/features/library/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/library/library-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/library/Library.hooks.tsx | LOADED | 0 | 7/7 (100.00%) | 3/3 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/library/Library.tsx | LOADED | 0 | 88/88 (100.00%) | 93/93 (100.00%) | 41/41 (100.00%) |
| apps/admin/src/features/library/rules.ts | LOADED | 0 | 37/37 (100.00%) | 56/56 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/media/hooks/media-dependencies.hooks.ts | LOADED | 0 | 36/36 (100.00%) | 21/21 (100.00%) | 21/21 (100.00%) |
| apps/admin/src/features/media/hooks/media-import-dependencies.hooks.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/media/hooks/use-edit-media-modal.hooks.ts | LOADED | 0 | 18/18 (100.00%) | 14/14 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/media/hooks/use-edit-media-panel.hooks.ts | LOADED | 0 | 50/50 (100.00%) | 18/18 (100.00%) | 31/31 (100.00%) |
| apps/admin/src/features/media/hooks/use-media-card-details.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 10/10 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/media/hooks/use-media-card-metadata.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 16/16 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/media/hooks/use-media-grid-size.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/media/hooks/use-media-item-link.hooks.ts | LOADED | 0 | 11/11 (100.00%) | 9/9 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/media/hooks/use-media-preview.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 7/9 (77.78%) | 7/7 (100.00%) |
| apps/admin/src/features/media/hooks/use-media-tabs.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/media/hooks/use-media.hooks.ts | LOADED | 0 | 80/80 (100.00%) | 33/34 (97.06%) | 25/25 (100.00%) |
| apps/admin/src/features/media/hooks/use-remote-image-import.hooks.ts | LOADED | 0 | 26/26 (100.00%) | 15/15 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/media/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/media/media-i18n.ts | LOADED | 0 | 12/12 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/media/media-provider-catalog.ts | LOADED | 0 | 7/7 (100.00%) | 6/6 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/media/media-providers-port.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/media/Media.hooks.tsx | LOADED | 0 | 9/9 (100.00%) | 6/6 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/media/Media.tsx | LOADED | 0 | 115/115 (100.00%) | 120/121 (99.17%) | 57/57 (100.00%) |
| apps/admin/src/features/media/RemoteImageImport.tsx | LOADED | 0 | 4/4 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/media/rules.ts | LOADED | 0 | 138/138 (100.00%) | 133/133 (100.00%) | 46/46 (100.00%) |
| apps/admin/src/features/members/hooks/members-controller.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 3/3 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/members/hooks/members-dependencies.hooks.ts | LOADED | 0 | 22/22 (100.00%) | 8/8 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/features/members/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/members/members-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/members/MembersPanel.tsx | LOADED | 0 | 5/5 (100.00%) | 2/2 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/menus/hooks/menus-dependencies.hooks.ts | LOADED | 0 | 26/26 (100.00%) | 26/26 (100.00%) | 16/16 (100.00%) |
| apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts | LOADED | 0 | 145/145 (100.00%) | 100/100 (100.00%) | 44/44 (100.00%) |
| apps/admin/src/features/menus/hooks/use-menus.hooks.ts | LOADED | 0 | 36/36 (100.00%) | 25/25 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/menus/html-rules.ts | LOADED | 0 | 22/22 (100.00%) | 24/24 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/menus/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/menus/MenuEditor.hooks.tsx | LOADED | 0 | 7/7 (100.00%) | 10/10 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/menus/MenuPageLinkFields.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 2/2 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/menus/MenuPageLinkFields.tsx | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/menus/menus-i18n.ts | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/menus/Menus.tsx | LOADED | 0 | 8/8 (100.00%) | 12/12 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/menus/page-link-rules.ts | LOADED | 0 | 22/22 (100.00%) | 53/53 (100.00%) | 18/18 (100.00%) |
| apps/admin/src/features/observability/hooks/recent-server-errors-dependencies.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 7/7 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/observability/hooks/use-observability-status.hooks.ts | LOADED | 0 | 19/19 (100.00%) | 7/8 (87.50%) | 5/5 (100.00%) |
| apps/admin/src/features/observability/hooks/use-observability-tab.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/observability/hooks/use-queries-tab.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/observability/hooks/use-recent-error-item.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/observability/hooks/use-recent-server-errors.hooks.ts | LOADED | 0 | 21/21 (100.00%) | 10/10 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/observability/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/observability/observability-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/observability/observability-visuals.tsx | LOADED | 0 | 8/8 (100.00%) | 7/7 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/observability/Observability.tsx | LOADED | 0 | 21/21 (100.00%) | 39/45 (86.67%) | 11/11 (100.00%) |
| apps/admin/src/features/observability/queries-panel.tsx | LOADED | 0 | 3/3 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/observability/recent-errors-panel.tsx | LOADED | 0 | 11/11 (100.00%) | 34/34 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/observability/tool-gaps-panel.tsx | LOADED | 0 | 4/4 (100.00%) | 13/13 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/pages/hooks/page-editor-dependencies.hooks.ts | LOADED | 0 | 55/55 (100.00%) | 27/27 (100.00%) | 27/27 (100.00%) |
| apps/admin/src/features/pages/hooks/pages-dependencies.hooks.ts | LOADED | 0 | 32/32 (100.00%) | 20/20 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/features/pages/hooks/pages-tab-url.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/pages/hooks/theme-canvas-dependencies.hooks.ts | LOADED | 0 | 16/16 (100.00%) | 9/9 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/pages/hooks/theme-canvas-wrapper.ts | LOADED | 0 | 20/20 (100.00%) | 13/13 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/pages/hooks/theme-pages-dependencies.hooks.ts | LOADED | 0 | 15/15 (100.00%) | 17/17 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/pages/hooks/use-editor-html-jump.hooks.ts | LOADED | 0 | 54/54 (100.00%) | 25/25 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/pages/hooks/use-interactive-flush.hooks.ts | LOADED | 0 | 25/25 (100.00%) | 10/10 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts | LOADED | 0 | 270/270 (100.00%) | 159/161 (98.76%) | 76/76 (100.00%) |
| apps/admin/src/features/pages/hooks/use-pages.hooks.ts | LOADED | 0 | 50/50 (100.00%) | 33/33 (100.00%) | 23/23 (100.00%) |
| apps/admin/src/features/pages/hooks/use-theme-canvas-styling.hooks.ts | LOADED | 0 | 68/68 (100.00%) | 42/42 (100.00%) | 20/20 (100.00%) |
| apps/admin/src/features/pages/hooks/use-theme-pages.hooks.ts | LOADED | 0 | 43/43 (100.00%) | 41/41 (100.00%) | 16/16 (100.00%) |
| apps/admin/src/features/pages/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/pages/lib/embed-placeholder.ts | LOADED | 0 | 39/39 (100.00%) | 48/50 (96.00%) | 12/12 (100.00%) |
| apps/admin/src/features/pages/lib/prettify-html.ts | LOADED | 0 | 69/69 (100.00%) | 52/52 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/pages/lib/theme-page-publish-state.ts | LOADED | 0 | 19/19 (100.00%) | 22/22 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/pages/page-editor-i18n.ts | LOADED | 0 | 17/17 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/pages/PageEditor.tsx | LOADED | 0 | 56/56 (100.00%) | 70/70 (100.00%) | 36/36 (100.00%) |
| apps/admin/src/features/pages/pages-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/pages/Pages.tsx | LOADED | 0 | 28/28 (100.00%) | 24/24 (100.00%) | 19/19 (100.00%) |
| apps/admin/src/features/pages/rules.ts | LOADED | 0 | 69/69 (100.00%) | 72/72 (100.00%) | 40/40 (100.00%) |
| apps/admin/src/features/pages/ThemePageDetailsModal.hooks.tsx | LOADED | 0 | 18/18 (100.00%) | 14/14 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/pages/ThemePageDetailsModal.tsx | LOADED | 0 | 14/14 (100.00%) | 13/13 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/pages/ThemePagesTab.tsx | LOADED | 0 | 30/30 (100.00%) | 30/30 (100.00%) | 16/16 (100.00%) |
| apps/admin/src/features/playground/hooks/use-playground-canvas.hooks.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/playground/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/playground/playground-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/playground/Playground.tsx | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/plugins/add-plugin-tab-soon.ts | LOADED | 0 | 4/4 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/plugins/AddAgentPluginPanel.tsx | LOADED | 0 | 5/5 (100.00%) | 19/19 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/plugins/AddPluginPanel.tsx | LOADED | 0 | 6/6 (100.00%) | 14/14 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/plugins/admin-surface-theme.ts | LOADED | 0 | 21/21 (100.00%) | 9/9 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/plugins/agent-plugins-visuals.tsx | LOADED | 0 | 15/15 (100.00%) | 13/13 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/plugins/AgentPluginDetailsModal.tsx | LOADED | 0 | 8/8 (100.00%) | 10/10 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/plugins/AgentPluginDisableConfirmDialog.tsx | LOADED | 0 | 5/5 (100.00%) | 9/9 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/plugins/AgentPluginLinkedLock.tsx | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/plugins/AgentPluginManageButton.tsx | LOADED | 0 | 4/4 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/plugins/AgentPluginMaturity.tsx | LOADED | 0 | 4/4 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/plugins/AgentPluginMemoryPanel.tsx | LOADED | 0 | 5/5 (100.00%) | 6/6 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/plugins/AgentPluginRow.tsx | LOADED | 0 | 23/23 (100.00%) | 39/39 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/plugins/AgentPlugins.tsx | LOADED | 0 | 40/40 (100.00%) | 36/36 (100.00%) | 24/24 (100.00%) |
| apps/admin/src/features/plugins/AgentPluginSurfaceFrame.tsx | LOADED | 0 | 7/7 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/plugins/AgentPluginUpdateControl.tsx | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/plugins/composer-capabilities.ts | LOADED | 0 | 56/56 (100.00%) | 36/36 (100.00%) | 26/26 (100.00%) |
| apps/admin/src/features/plugins/hooks/agent-plugin-install-dependencies.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 12/12 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/plugins/hooks/agent-plugin-memory-dependencies.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/plugins/hooks/agent-plugin-surfaces-dependencies.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 3/3 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/plugins/hooks/agent-plugins-dependencies.hooks.ts | LOADED | 0 | 18/18 (100.00%) | 11/11 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/plugins/hooks/plugin-install-dependencies.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 11/11 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-admin-surface-frame.hooks.ts | LOADED | 0 | 52/52 (100.00%) | 31/31 (100.00%) | 24/24 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-agent-plugin-details-modal.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 3/3 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-agent-plugin-disable-confirm.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-agent-plugin-install.hooks.ts | LOADED | 0 | 73/73 (100.00%) | 60/60 (100.00%) | 17/17 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-agent-plugin-memory.hooks.ts | LOADED | 0 | 47/47 (100.00%) | 40/40 (100.00%) | 18/18 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-agent-plugin-surfaces.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 7/7 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-agent-plugin-tab.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 1/1 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-agent-plugin-update.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-agent-plugins.hooks.ts | LOADED | 0 | 46/46 (100.00%) | 30/30 (100.00%) | 24/24 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-package-file-tree.hooks.ts | LOADED | 0 | 37/37 (100.00%) | 33/33 (100.00%) | 14/14 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-plugin-install.hooks.ts | LOADED | 0 | 57/57 (100.00%) | 51/51 (100.00%) | 27/27 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-plugin-package-files.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 1/1 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-plugin-remove-confirm.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-plugin-row-focus.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/plugins/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/plugins/installed-skills-composer-source.ts | LOADED | 0 | 32/32 (100.00%) | 43/44 (97.73%) | 13/13 (100.00%) |
| apps/admin/src/features/plugins/package-file-tree.ts | LOADED | 0 | 7/7 (100.00%) | 0/0 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/plugins/PackageFilesModal.tsx | LOADED | 0 | 28/28 (100.00%) | 35/35 (100.00%) | 16/16 (100.00%) |
| apps/admin/src/features/plugins/PluginPackageFilesModal.tsx | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/plugins/PluginProviderSettingField.tsx | LOADED | 0 | 18/18 (100.00%) | 33/35 (94.29%) | 10/10 (100.00%) |
| apps/admin/src/features/plugins/PluginProviderSettingsDialog.tsx | LOADED | 0 | 24/24 (100.00%) | 38/41 (92.68%) | 18/18 (100.00%) |
| apps/admin/src/features/plugins/PluginRemoveConfirmDialog.tsx | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/plugins/PluginRow.tsx | LOADED | 0 | 11/11 (100.00%) | 15/15 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/plugins/plugins-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/plugins/plugins-memory-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/plugins/plugins-visuals.tsx | LOADED | 0 | 7/7 (100.00%) | 6/6 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/plugins/rules.ts | LOADED | 0 | 108/108 (100.00%) | 128/128 (100.00%) | 51/51 (100.00%) |
| apps/admin/src/features/plugins/selected-skills.ts | LOADED | 0 | 9/9 (100.00%) | 13/13 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/posts/hooks/post-editor-dependencies.hooks.ts | LOADED | 0 | 56/56 (100.00%) | 48/48 (100.00%) | 30/30 (100.00%) |
| apps/admin/src/features/posts/hooks/post-editor-save.rules.ts | LOADED | 0 | 10/10 (100.00%) | 31/31 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/posts/hooks/post-editor-state.rules.ts | LOADED | 0 | 14/14 (100.00%) | 30/31 (96.77%) | 7/7 (100.00%) |
| apps/admin/src/features/posts/hooks/posts-list-dependencies.hooks.ts | LOADED | 0 | 25/25 (100.00%) | 18/18 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/posts/hooks/use-post-editor-ui.hooks.ts | LOADED | 0 | 61/61 (100.00%) | 28/28 (100.00%) | 27/27 (100.00%) |
| apps/admin/src/features/posts/hooks/use-post-featured-image.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 12/12 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/posts/hooks/use-post-url-dialog.hooks.ts | LOADED | 0 | 50/50 (100.00%) | 39/39 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/posts/hooks/use-posts.hooks.ts | LOADED | 0 | 44/44 (100.00%) | 33/33 (100.00%) | 22/22 (100.00%) |
| apps/admin/src/features/posts/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/posts/post-editor-route-key.ts | LOADED | 0 | 7/7 (100.00%) | 8/8 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/posts/PostAuthorFields.tsx | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/posts/PostCoverImage.tsx | LOADED | 0 | 7/7 (100.00%) | 13/13 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/posts/PostEditor.tsx | LOADED | 0 | 153/153 (100.00%) | 132/132 (100.00%) | 118/118 (100.00%) |
| apps/admin/src/features/posts/PostPublishingFields.tsx | LOADED | 0 | 2/2 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/posts/posts-i18n.ts | LOADED | 0 | 13/13 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/posts/Posts.tsx | LOADED | 0 | 21/21 (100.00%) | 17/17 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/features/posts/PostSettingsDialog.tsx | LOADED | 0 | 6/6 (100.00%) | 12/12 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/posts/PostUrlDialog.tsx | LOADED | 0 | 2/2 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/posts/rules.ts | LOADED | 0 | 92/92 (100.00%) | 123/123 (100.00%) | 45/45 (100.00%) |
| apps/admin/src/features/providers/always-allow-rules.ts | LOADED | 0 | 18/18 (100.00%) | 8/8 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/providers/AlwaysAllowPanel.tsx | LOADED | 0 | 10/10 (100.00%) | 10/10 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/providers/hooks/always-allow-dependencies.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 9/9 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/providers/hooks/use-always-allow.hooks.ts | LOADED | 0 | 25/25 (100.00%) | 12/12 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/features/providers/hooks/use-providers.hooks.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/providers/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/providers/providers-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/publish-content/hooks/publish-availability.store.ts | LOADED | 0 | 11/11 (100.00%) | 2/2 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/publish-content/hooks/publish-content-dependencies.hooks.ts | LOADED | 0 | 57/57 (100.00%) | 70/70 (100.00%) | 18/18 (100.00%) |
| apps/admin/src/features/publish-content/hooks/publish-request.store.ts | LOADED | 0 | 24/24 (100.00%) | 4/4 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts | LOADED | 0 | 333/333 (100.00%) | 323/324 (99.69%) | 81/81 (100.00%) |
| apps/admin/src/features/publish-content/hooks/use-publish-section-button.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/publish-content/publish-scope.ts | LOADED | 0 | 12/12 (100.00%) | 16/16 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/publish-content/PublishContentDialog.tsx | LOADED | 0 | 22/22 (100.00%) | 57/58 (98.28%) | 17/17 (100.00%) |
| apps/admin/src/features/publish-content/PublishSectionButton.tsx | LOADED | 0 | 3/3 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/recovery/hooks/recovery-dependencies.hooks.ts | LOADED | 0 | 21/21 (100.00%) | 21/21 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/features/recovery/hooks/restore-flow-dependencies.hooks.ts | LOADED | 0 | 16/16 (100.00%) | 17/17 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/recovery/hooks/use-recovery-navigation.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 2/2 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/recovery/hooks/use-recovery.hooks.ts | LOADED | 0 | 45/45 (100.00%) | 19/19 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/recovery/hooks/use-restore-flow.hooks.ts | LOADED | 0 | 51/51 (100.00%) | 4/4 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/recovery/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/recovery/recovery-i18n.tsx | LOADED | 0 | 18/18 (100.00%) | 2/2 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/recovery/Recovery.tsx | LOADED | 0 | 48/48 (100.00%) | 63/63 (100.00%) | 23/23 (100.00%) |
| apps/admin/src/features/recovery/rules.ts | LOADED | 0 | 16/16 (100.00%) | 10/10 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/redirects/index.ts | LOADED | 0 | 1/1 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/redirects/redirects-i18n.tsx | LOADED | 0 | 19/19 (100.00%) | 0/0 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/roles/hooks/roles-dependencies.hooks.ts | LOADED | 0 | 70/70 (100.00%) | 37/37 (100.00%) | 35/35 (100.00%) |
| apps/admin/src/features/roles/hooks/use-roles.hooks.ts | LOADED | 0 | 143/143 (100.00%) | 60/60 (100.00%) | 40/40 (100.00%) |
| apps/admin/src/features/roles/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/roles/roles-i18n.ts | LOADED | 0 | 12/12 (100.00%) | 0/0 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/roles/Roles.hooks.tsx | LOADED | 0 | 7/7 (100.00%) | 2/2 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/roles/Roles.tsx | LOADED | 0 | 61/61 (100.00%) | 82/82 (100.00%) | 39/39 (100.00%) |
| apps/admin/src/features/roles/rules.ts | LOADED | 0 | 14/14 (100.00%) | 12/12 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/security/AccessTokensTab.hooks.tsx | LOADED | 0 | 25/25 (100.00%) | 14/14 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/security/CopyKeysDialog.tsx | LOADED | 0 | 5/5 (100.00%) | 15/18 (83.33%) | 3/3 (100.00%) |
| apps/admin/src/features/security/hooks/other-credentials-dependencies.hooks.ts | LOADED | 0 | 27/27 (100.00%) | 21/21 (100.00%) | 25/25 (100.00%) |
| apps/admin/src/features/security/hooks/security-permissions-dependencies.hooks.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/security/hooks/site-key-dependencies.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 0/0 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/security/hooks/site-key-status.rules.ts | LOADED | 0 | 4/4 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts | LOADED | 0 | 244/244 (100.00%) | 195/196 (99.49%) | 105/105 (100.00%) |
| apps/admin/src/features/security/hooks/use-other-credentials.hooks.ts | LOADED | 0 | 103/103 (100.00%) | 70/70 (100.00%) | 57/57 (100.00%) |
| apps/admin/src/features/security/hooks/use-security-permissions.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/security/hooks/use-site-key-recovery.hooks.ts | LOADED | 0 | 58/58 (100.00%) | 22/22 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/security/hooks/use-site-key.hooks.ts | LOADED | 0 | 49/49 (100.00%) | 28/28 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/security/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/security/OtherCredentialsSection.hooks.tsx | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/security/OtherCredentialsSection.tsx | LOADED | 0 | 23/23 (100.00%) | 18/18 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/features/security/rules.ts | LOADED | 0 | 136/136 (100.00%) | 195/195 (100.00%) | 70/70 (100.00%) |
| apps/admin/src/features/security/security-visuals.tsx | LOADED | 0 | 6/6 (100.00%) | 5/5 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/security/SiteKeyRecoveryCard.tsx | LOADED | 0 | 15/15 (100.00%) | 18/18 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/security/SiteKeyTab.hooks.tsx | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/security/SiteKeyTab.tsx | LOADED | 0 | 45/45 (100.00%) | 53/53 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/features/seo/index.ts | LOADED | 0 | 3/3 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/seo/seo-i18n.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/settings/AdminAppearance.tsx | LOADED | 0 | 21/21 (100.00%) | 24/24 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/settings/ai-agent-presentation.ts | LOADED | 0 | 15/15 (100.00%) | 20/20 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/settings/external-mcp-admissions-rules.ts | LOADED | 0 | 79/79 (100.00%) | 63/63 (100.00%) | 32/32 (100.00%) |
| apps/admin/src/features/settings/external-mcp-i18n.ts | LOADED | 0 | 13/13 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/settings/external-mcp-tool-picker-rules.ts | LOADED | 0 | 45/45 (100.00%) | 39/39 (100.00%) | 31/31 (100.00%) |
| apps/admin/src/features/settings/ExternalMcpAdmissionsBanner.tsx | LOADED | 0 | 21/21 (100.00%) | 26/26 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/settings/ExternalMcpRemoveConfirmDialog.tsx | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/settings/ExternalMcpSettingsPanel.hooks.tsx | LOADED | 0 | 33/33 (100.00%) | 18/18 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/features/settings/ExternalMcpToolPicker.hooks.tsx | LOADED | 0 | 28/28 (100.00%) | 20/20 (100.00%) | 16/16 (100.00%) |
| apps/admin/src/features/settings/ExternalMcpToolPicker.tsx | LOADED | 0 | 37/37 (100.00%) | 36/36 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/settings/ExternalMcpToolsModal.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 4/4 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/settings/ExternalMcpToolsModal.tsx | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/settings/hooks/use-admin-appearance-settings.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/settings/hooks/use-ai-agent-presentation.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 10/10 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/settings/hooks/use-external-mcp-admissions.hooks.ts | LOADED | 0 | 64/64 (100.00%) | 42/42 (100.00%) | 31/31 (100.00%) |
| apps/admin/src/features/settings/hooks/use-external-mcp-remove-confirm.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/settings/hooks/use-external-mcp-tool-picker.hooks.ts | LOADED | 0 | 30/30 (100.00%) | 10/10 (100.00%) | 18/18 (100.00%) |
| apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts | LOADED | 0 | 74/74 (100.00%) | 76/76 (100.00%) | 23/23 (100.00%) |
| apps/admin/src/features/settings/hooks/use-settings-active-tab-scroll.hooks.ts | LOADED | 0 | 16/16 (100.00%) | 8/8 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/settings/hooks/use-settings-locale-sync.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/settings/hooks/use-settings-ui.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 0/0 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/settings/hooks/use-user-interface-tab.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/settings/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/settings/rules.ts | LOADED | 0 | 53/53 (100.00%) | 64/65 (98.46%) | 20/20 (100.00%) |
| apps/admin/src/features/settings/settings-capabilities-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/settings/settings-execution-i18n.ts | LOADED | 0 | 7/7 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/settings/settings-i18n.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/settings/settings-interface-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/settings/settings-memory-i18n.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/settings/SettingsUi.tsx | LOADED | 0 | 42/42 (100.00%) | 34/34 (100.00%) | 17/17 (100.00%) |
| apps/admin/src/features/settings/UserInterfaceSettingsPanel.tsx | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/sites/CreateSiteOnboarding.tsx | LOADED | 0 | 16/16 (100.00%) | 11/11 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/sites/CredentialWarnings.tsx | LOADED | 0 | 17/17 (100.00%) | 16/18 (88.89%) | 6/6 (100.00%) |
| apps/admin/src/features/sites/hooks/use-create-site-plugin-tokens.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 8/8 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/sites/hooks/use-created-site-return.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/sites/hooks/use-desktop-import.hooks.ts | LOADED | 0 | 19/19 (100.00%) | 11/12 (91.67%) | 2/2 (100.00%) |
| apps/admin/src/features/sites/hooks/use-live-import-site.hooks.ts | LOADED | 0 | 41/41 (100.00%) | 26/31 (83.87%) | 8/10 (80.00%) |
| apps/admin/src/features/sites/hooks/use-local-sites.hooks.ts | LOADED | 0 | 55/55 (100.00%) | 58/59 (98.31%) | 16/16 (100.00%) |
| apps/admin/src/features/sites/hooks/use-share-credential-gate.hooks.ts | LOADED | 0 | 42/42 (100.00%) | 29/36 (80.56%) | 16/16 (100.00%) |
| apps/admin/src/features/sites/hooks/use-site-card-preview.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/sites/hooks/use-site-confirm.hooks.ts | LOADED | 0 | 17/17 (100.00%) | 5/5 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/sites/hooks/use-sites-config.hooks.ts | LOADED | 0 | 28/28 (100.00%) | 21/21 (100.00%) | 24/24 (100.00%) |
| apps/admin/src/features/sites/hooks/use-sites-home.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/sites/hooks/use-sites-snapshot.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/sites/hooks/use-static-export-selection.hooks.ts | LOADED | 0 | 16/16 (100.00%) | 22/25 (88.00%) | 15/15 (100.00%) |
| apps/admin/src/features/sites/import-handoff-port.ts | LOADED | 0 | 2/2 (100.00%) | 7/8 (87.50%) | 1/1 (100.00%) |
| apps/admin/src/features/sites/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/sites/LocalSiteConfirmDialog.tsx | LOADED | 0 | 2/2 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/sites/rules.ts | LOADED | 0 | 43/43 (100.00%) | 48/48 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/sites/site-export-error.ts | LOADED | 0 | 9/9 (100.00%) | 20/21 (95.24%) | 3/3 (100.00%) |
| apps/admin/src/features/sites/site-publish-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/sites/site-transfer-i18n.ts | LOADED | 0 | 24/24 (100.00%) | 0/0 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/sites/site-transfer-rules.ts | LOADED | 0 | 20/20 (100.00%) | 29/29 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/sites/SiteExportTab.tsx | LOADED | 0 | 51/51 (100.00%) | 80/82 (97.56%) | 28/28 (100.00%) |
| apps/admin/src/features/sites/sites-i18n.ts | LOADED | 0 | 26/26 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/sites/sites-settings-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/sites/sites-visuals.tsx | LOADED | 0 | 7/7 (100.00%) | 6/6 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/sites/Sites.hooks.tsx | LOADED | 0 | 96/96 (100.00%) | 168/168 (100.00%) | 50/50 (100.00%) |
| apps/admin/src/features/sites/Sites.tsx | LOADED | 0 | 28/28 (100.00%) | 35/37 (94.59%) | 13/13 (100.00%) |
| apps/admin/src/features/sites/SitesHomeSetting.tsx | LOADED | 0 | 27/27 (100.00%) | 29/29 (100.00%) | 21/21 (100.00%) |
| apps/admin/src/features/sites/SiteTrashTab.tsx | LOADED | 0 | 11/11 (100.00%) | 12/12 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/skills/api.ts | LOADED | 0 | 12/12 (100.00%) | 8/8 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/skills/skill-drop.ts | LOADED | 0 | 34/34 (100.00%) | 37/37 (100.00%) | 20/20 (100.00%) |
| apps/admin/src/features/skills/skill-failure.ts | LOADED | 0 | 1/1 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/skills/skill-upload.ts | LOADED | 0 | 10/10 (100.00%) | 16/16 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/skills/SkillInstallConfirmation.tsx | LOADED | 0 | 5/5 (100.00%) | 12/13 (92.31%) | 2/2 (100.00%) |
| apps/admin/src/features/skills/SkillRemoveConfirmDialog.tsx | LOADED | 0 | 2/2 (100.00%) | 6/7 (85.71%) | 2/2 (100.00%) |
| apps/admin/src/features/skills/SkillRow.tsx | LOADED | 0 | 3/3 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/skills/skills-i18n.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/skills/skills-page-dictionary.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/skills/skills-visuals.tsx | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/skills/Skills.tsx | LOADED | 0 | 10/10 (100.00%) | 15/15 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/skills/use-skill-confirmation.hooks.ts | LOADED | 0 | 17/17 (100.00%) | 10/10 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/skills/use-skill-files.hooks.ts | LOADED | 0 | 21/21 (100.00%) | 23/24 (95.83%) | 7/8 (87.50%) |
| apps/admin/src/features/skills/use-skill-install.hooks.ts | LOADED | 0 | 27/27 (100.00%) | 16/16 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/skills/use-skills-tabs.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 0/0 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/skills/use-skills.hooks.ts | LOADED | 0 | 74/74 (100.00%) | 45/45 (100.00%) | 32/32 (100.00%) |
| apps/admin/src/features/source-control/hooks/source-control-credentials-dependencies.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 11/11 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/source-control/hooks/use-source-control-credentials.hooks.ts | LOADED | 0 | 47/47 (100.00%) | 43/43 (100.00%) | 24/24 (100.00%) |
| apps/admin/src/features/source-control/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/source-control/ProvidersTab.tsx | LOADED | 0 | 28/28 (100.00%) | 44/44 (100.00%) | 16/16 (100.00%) |
| apps/admin/src/features/source-control/rules.ts | LOADED | 0 | 29/29 (100.00%) | 38/38 (100.00%) | 14/14 (100.00%) |
| apps/admin/src/features/source-control/source-control-i18n.ts | LOADED | 0 | 8/8 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/source-control/source-control-visuals.tsx | LOADED | 0 | 4/4 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/source-control/SourceControl.tsx | LOADED | 0 | 7/7 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/merge-term-section-dependencies.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 9/9 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/new-taxonomy-form-dependencies.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/new-term-form-dependencies.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/taxonomy-dependencies.hooks.ts | LOADED | 0 | 28/28 (100.00%) | 15/15 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/term-picker-dependencies.hooks.ts | LOADED | 0 | 24/24 (100.00%) | 15/15 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/use-merge-term-section.hooks.ts | LOADED | 0 | 63/63 (100.00%) | 24/24 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/use-new-taxonomy-form.hooks.ts | LOADED | 0 | 20/20 (100.00%) | 6/6 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/use-new-term-form.hooks.ts | LOADED | 0 | 22/22 (100.00%) | 10/10 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/use-taxonomy-html-embed.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/use-taxonomy.hooks.ts | LOADED | 0 | 51/51 (100.00%) | 18/18 (100.00%) | 20/20 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/use-term-detail-panel.hooks.ts | LOADED | 0 | 32/32 (100.00%) | 10/10 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/use-term-list-reveal.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/use-term-picker.hooks.ts | LOADED | 0 | 100/100 (100.00%) | 80/80 (100.00%) | 37/37 (100.00%) |
| apps/admin/src/features/taxonomy/html-rules.ts | LOADED | 0 | 4/4 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/taxonomy/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/taxonomy/rules.ts | LOADED | 0 | 58/58 (100.00%) | 51/51 (100.00%) | 20/20 (100.00%) |
| apps/admin/src/features/taxonomy/taxonomy-i18n.ts | LOADED | 0 | 10/10 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/taxonomy/Taxonomy.tsx | LOADED | 0 | 65/65 (100.00%) | 98/98 (100.00%) | 43/43 (100.00%) |
| apps/admin/src/features/taxonomy/TaxonomyRowMenu.hooks.ts | LOADED | 0 | 67/67 (100.00%) | 40/40 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/features/taxonomy/TaxonomyRowMenu.tsx | LOADED | 0 | 11/11 (100.00%) | 16/16 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/taxonomy/TermPicker.tsx | LOADED | 0 | 34/34 (100.00%) | 37/37 (100.00%) | 17/17 (100.00%) |
| apps/admin/src/features/themes/hooks/theme-explore-dependencies.hooks.ts | LOADED | 0 | 49/49 (100.00%) | 29/29 (100.00%) | 25/25 (100.00%) |
| apps/admin/src/features/themes/hooks/theme-explore-open-file.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/themes/hooks/theme-explore-url.hooks.ts | LOADED | 0 | 19/19 (100.00%) | 21/21 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/themes/hooks/themes-dependencies.hooks.ts | LOADED | 0 | 26/26 (100.00%) | 15/15 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/themes/hooks/use-theme-card-preview.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 15/15 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/themes/hooks/use-theme-delete-request.hooks.ts | LOADED | 0 | 11/11 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/themes/hooks/use-theme-explore-file-groups.hooks.ts | LOADED | 0 | 29/29 (100.00%) | 29/29 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/themes/hooks/use-theme-explore-preview.hooks.ts | LOADED | 0 | 18/18 (100.00%) | 25/25 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/themes/hooks/use-theme-explore-theme.hooks.ts | LOADED | 0 | 15/15 (100.00%) | 22/22 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts | LOADED | 0 | 436/436 (100.00%) | 277/278 (99.64%) | 128/128 (100.00%) |
| apps/admin/src/features/themes/hooks/use-theme-preview-refresh.hooks.ts | LOADED | 0 | 16/16 (100.00%) | 23/23 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/features/themes/hooks/use-themes.hooks.ts | LOADED | 0 | 88/88 (100.00%) | 39/39 (100.00%) | 27/27 (100.00%) |
| apps/admin/src/features/themes/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/themes/rules.ts | LOADED | 0 | 25/25 (100.00%) | 20/20 (100.00%) | 18/18 (100.00%) |
| apps/admin/src/features/themes/theme-card-menu.ts | LOADED | 0 | 13/13 (100.00%) | 15/15 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/themes/theme-preview-refresh.ts | LOADED | 0 | 20/20 (100.00%) | 18/18 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/themes/ThemeExplore.hooks.tsx | LOADED | 0 | 20/20 (100.00%) | 14/14 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/themes/ThemeExplore.tsx | LOADED | 0 | 110/110 (100.00%) | 120/120 (100.00%) | 55/55 (100.00%) |
| apps/admin/src/features/themes/ThemePreviewReloadButton.tsx | LOADED | 0 | 3/3 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/themes/themes-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/themes/themes-visuals.tsx | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/themes/Themes.tsx | LOADED | 0 | 51/51 (100.00%) | 74/74 (100.00%) | 27/27 (100.00%) |
| apps/admin/src/features/trash/hooks/trash-dependencies.hooks.ts | LOADED | 0 | 25/25 (100.00%) | 19/19 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/trash/hooks/use-trash.hooks.ts | LOADED | 0 | 87/87 (100.00%) | 42/42 (100.00%) | 26/26 (100.00%) |
| apps/admin/src/features/trash/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/trash/rules.ts | LOADED | 0 | 42/42 (100.00%) | 52/52 (100.00%) | 17/17 (100.00%) |
| apps/admin/src/features/trash/trash-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/trash/Trash.tsx | LOADED | 0 | 36/36 (100.00%) | 29/29 (100.00%) | 22/22 (100.00%) |
| apps/admin/src/features/users/hooks/users-controller.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/users/hooks/users-dependencies.hooks.ts | LOADED | 0 | 62/62 (100.00%) | 35/35 (100.00%) | 35/35 (100.00%) |
| apps/admin/src/features/users/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/users/users-i18n.ts | LOADED | 0 | 9/9 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/users/UsersPanel.tsx | LOADED | 0 | 5/5 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/voice-input/hooks/mic-button-view.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/voice-input/hooks/mic-capture.ts | LOADED | 0 | 43/43 (100.00%) | 2/2 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/voice-input/hooks/push-to-talk-state.hooks.ts | LOADED | 0 | 18/18 (100.00%) | 6/6 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/voice-input/hooks/space-hold-rules.ts | LOADED | 0 | 8/8 (100.00%) | 14/14 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/voice-input/hooks/use-composer-voice-input.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/voice-input/hooks/use-push-to-talk.hooks.ts | LOADED | 0 | 61/61 (100.00%) | 40/40 (100.00%) | 26/26 (100.00%) |
| apps/admin/src/features/voice-input/hooks/use-space-hold-to-talk.hooks.ts | LOADED | 0 | 46/46 (100.00%) | 26/26 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/voice-input/PushToTalkMicButton.tsx | LOADED | 0 | 9/9 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/voice-input/voice-input-config.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/voice-input/voice-input-port.ts | LOADED | 0 | 2/2 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/voice-input/voice-unavailability.ts | LOADED | 0 | 6/6 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/voice-input/VoiceInputPlaceholder.tsx | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/webmcp/admin-page-tools.ts | LOADED | 0 | 25/25 (100.00%) | 25/25 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/webmcp/browser-agent-settings.hooks.ts | LOADED | 0 | 24/24 (100.00%) | 14/14 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/features/webmcp/BrowserAgentSettingsPanel.tsx | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/webmcp/webmcp-i18n.ts | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/widgets/index.ts | LOADED | 0 | 6/6 (100.00%) | 10/10 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/widgets/widgets-i18n.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/workspace/hooks/use-workspace-redirect.hooks.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/workspace/hooks/use-workspace.hooks.ts | LOADED | 0 | 37/37 (100.00%) | 10/10 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/workspace/hooks/workspace-dependencies.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/workspace/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/workspace/rules.ts | LOADED | 0 | 6/6 (100.00%) | 12/12 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/workspace/workspace-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/workspace/Workspace.tsx | LOADED | 0 | 9/9 (100.00%) | 19/19 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/workspace/WorkspaceRedirect.tsx | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/hooks/admin-locale-dependencies.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 9/9 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/hooks/assistant-chats-dependencies.hooks.ts | LOADED | 0 | 41/41 (100.00%) | 31/31 (100.00%) | 17/17 (100.00%) |
| apps/admin/src/hooks/use-admin-appearance-snapshot.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/hooks/use-admin-appearance.hooks.ts | LOADED | 0 | 44/44 (100.00%) | 27/27 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/hooks/use-admin-document-locale.hooks.ts | LOADED | 0 | 3/3 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/hooks/use-admin-execution-credential.hooks.ts | LOADED | 0 | 28/28 (100.00%) | 20/20 (100.00%) | 18/18 (100.00%) |
| apps/admin/src/hooks/use-admin-locale.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 3/3 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/hooks/use-admin-telemetry.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/hooks/use-agent-screen-context.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 9/9 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/hooks/use-assistant-chats.hooks.ts | LOADED | 0 | 24/24 (100.00%) | 7/8 (87.50%) | 22/22 (100.00%) |
| apps/admin/src/hooks/use-cms-sidebar-label-tooltips.hooks.ts | LOADED | 0 | 20/20 (100.00%) | 13/13 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/hooks/use-content-refresh-subscription.hooks.ts | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/hooks/use-credential-hint.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/hooks/use-desktop-view-release.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 6/7 (85.71%) | 4/4 (100.00%) |
| apps/admin/src/hooks/use-dock-auto-rail.hooks.ts | LOADED | 0 | 20/20 (100.00%) | 15/15 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/hooks/use-drawer-active-item-centring.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 10/10 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/hooks/use-external-entry-refresh.hooks.ts | LOADED | 0 | 56/56 (100.00%) | 27/27 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/hooks/use-focus-trap.hooks.ts | LOADED | 0 | 1/1 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/hooks/use-interface-preferences.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 11/11 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/hooks/use-list-table-cell-labels.hooks.ts | LOADED | 0 | 29/29 (100.00%) | 20/20 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/hooks/use-settings-slice.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 6/6 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/hooks/use-sidebar-empty-click-toggle.hooks.ts | LOADED | 0 | 27/27 (100.00%) | 31/31 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/hooks/use-sites-sidebar-nav.hooks.ts | LOADED | 0 | 42/42 (100.00%) | 25/25 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/hooks/use-standing-draft-autosave.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 4/4 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/hooks/use-tovu-execution-adapters.hooks.ts | LOADED | 0 | 26/26 (100.00%) | 18/18 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/hooks/use-tovu-execution-policy.hooks.ts | LOADED | 0 | 17/17 (100.00%) | 18/18 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/integrations/chart-providers/chart-registry-context.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/integrations/chart-providers/chart-registry-dependencies.hooks.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/integrations/chart-providers/ChartRegistryProvider.tsx | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/integrations/chart-providers/use-chart-registry.hooks.ts | LOADED | 0 | 19/19 (100.00%) | 10/10 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/integrations/jini-admin/AdminModulesProvider.tsx | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/integrations/jini-admin/comments-module.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 3/3 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/integrations/jini-admin/comments-ports.ts | LOADED | 0 | 14/14 (100.00%) | 22/22 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/integrations/jini-admin/forms-module.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 6/6 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/integrations/jini-admin/forms-ports.ts | LOADED | 0 | 9/9 (100.00%) | 12/12 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/integrations/jini-admin/kit.ts | LOADED | 0 | 2/2 (100.00%) | 2/3 (66.67%) | 1/1 (100.00%) |
| apps/admin/src/integrations/jini-admin/media-ports.ts | LOADED | 0 | 68/68 (100.00%) | 67/67 (100.00%) | 36/36 (100.00%) |
| apps/admin/src/integrations/jini-admin/module-context.ts | LOADED | 0 | 2/2 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/integrations/jini-admin/ModulePanel.tsx | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/integrations/jini-admin/modules.hooks.ts | LOADED | 0 | 32/32 (100.00%) | 29/29 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/integrations/jini-admin/redirects-module.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 5/5 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/integrations/jini-admin/redirects-ports.ts | LOADED | 0 | 18/18 (100.00%) | 19/19 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/integrations/jini-admin/seo-module.hooks.ts | LOADED | 0 | 11/11 (100.00%) | 6/6 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/integrations/jini-admin/seo-ports.ts | LOADED | 0 | 11/11 (100.00%) | 16/16 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/integrations/jini-admin/widgets-module.hooks.ts | LOADED | 0 | 15/15 (100.00%) | 5/5 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/integrations/jini-admin/widgets-ports.ts | LOADED | 0 | 7/7 (100.00%) | 7/7 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/lib/a2ui-action-poster.ts | LOADED | 0 | 2/2 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/lib/acceptance-cancellation.ts | LOADED | 0 | 5/5 (100.00%) | 3/3 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/lib/addons-routes.ts | LOADED | 0 | 18/18 (100.00%) | 27/27 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/lib/admin-boot-scope.ts | LOADED | 0 | 3/3 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/admin-dev-origin.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/admin-draft-identity.ts | LOADED | 0 | 3/3 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/lib/admin-failure-channel.ts | LOADED | 0 | 22/22 (100.00%) | 41/46 (89.13%) | 7/7 (100.00%) |
| apps/admin/src/lib/admin-frontend-session.ts | LOADED | 0 | 8/8 (100.00%) | 1/1 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/lib/admin-nav-i18n.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/lib/agent-pages.ts | LOADED | 0 | 8/8 (100.00%) | 7/7 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/lib/agent-screen-context.ts | LOADED | 0 | 13/13 (100.00%) | 14/14 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/lib/agent-screenshot-bus.ts | LOADED | 0 | 9/9 (100.00%) | 0/0 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/lib/agent-screenshot.ts | LOADED | 0 | 32/32 (100.00%) | 18/18 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/lib/app-version.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/lib/ascii-slug.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/assistant-agents-snapshot.ts | LOADED | 0 | 14/14 (100.00%) | 15/15 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/lib/assistant-chats.ts | LOADED | 0 | 17/17 (100.00%) | 9/9 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/lib/assistant-daemon-activation.ts | LOADED | 0 | 25/25 (100.00%) | 22/25 (88.00%) | 6/7 (85.71%) |
| apps/admin/src/lib/assistant-dock-bus.ts | LOADED | 0 | 23/23 (100.00%) | 2/2 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/lib/assistant-permanent-deletes.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/lib/assistant-prompt-bus.ts | LOADED | 0 | 26/26 (100.00%) | 7/7 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/lib/assistant-subagents.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/lib/assistant-transport-ag-ui.ts | LOADED | 0 | 11/11 (100.00%) | 2/2 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/lib/assistant-transport.ts | LOADED | 0 | 21/21 (100.00%) | 16/16 (100.00%) | 20/20 (100.00%) |
| apps/admin/src/lib/block-atom-insert.ts | LOADED | 0 | 17/17 (100.00%) | 12/12 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/lib/boot-token-fragment.ts | LOADED | 0 | 10/10 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/browser-stream.ts | LOADED | 0 | 80/80 (100.00%) | 50/50 (100.00%) | 26/26 (100.00%) |
| apps/admin/src/lib/browser-working-directory-access.ts | LOADED | 0 | 22/22 (100.00%) | 12/12 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/lib/chat-attachment-liveness.ts | LOADED | 0 | 4/4 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/lib/content-refresh-bus.ts | LOADED | 0 | 11/11 (100.00%) | 6/6 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/lib/credential-card-guidance.ts | LOADED | 0 | 7/7 (100.00%) | 9/9 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/lib/credential-copy.ts | LOADED | 0 | 6/6 (100.00%) | 20/20 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/lib/descriptor-i18n.ts | LOADED | 0 | 16/16 (100.00%) | 28/28 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/lib/durable-run-subscription.ts | LOADED | 0 | 35/35 (100.00%) | 39/39 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/lib/editor-template-options.rules.ts | LOADED | 0 | 2/2 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/escape-owned-by-inner-layer.ts | LOADED | 0 | 7/7 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/execution-settings.ts | LOADED | 0 | 71/71 (100.00%) | 64/64 (100.00%) | 33/33 (100.00%) |
| apps/admin/src/lib/external-entry-refresh.ts | LOADED | 0 | 6/6 (100.00%) | 11/11 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/lib/fetch-query/adapter-context.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/lib/fetch-query/provider.tsx | LOADED | 0 | 10/10 (100.00%) | 5/5 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/lib/i18n-common.ts | LOADED | 0 | 10/10 (100.00%) | 0/0 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/lib/import-export-routes.ts | LOADED | 0 | 8/8 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/ledger-slice.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/lib/local-owner-signin.ts | LOADED | 0 | 12/12 (100.00%) | 15/15 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/lib/media-embed-extension.hooks.ts | LOADED | 0 | 31/31 (100.00%) | 20/20 (100.00%) | 18/18 (100.00%) |
| apps/admin/src/lib/media-embed-extension.tsx | LOADED | 0 | 13/13 (100.00%) | 14/14 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/lib/media-image-extension.tsx | LOADED | 0 | 19/19 (100.00%) | 18/18 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/lib/merge-locale-overlays.ts | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/lib/page-lifecycle.ts | LOADED | 0 | 8/8 (100.00%) | 0/0 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/lib/panel-access.ts | LOADED | 0 | 13/13 (100.00%) | 14/14 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/lib/plain-text-blocks.ts | LOADED | 0 | 7/7 (100.00%) | 4/4 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/lib/playground-render-target-bus.ts | LOADED | 0 | 14/14 (100.00%) | 2/2 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/lib/post-title-extension.ts | LOADED | 0 | 23/23 (100.00%) | 12/12 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/lib/publish-criteria-deep-link.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/query-suffix.ts | LOADED | 0 | 1/1 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/queued-daemon-start.ts | LOADED | 0 | 15/15 (100.00%) | 13/13 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/lib/retry-unreachable.ts | LOADED | 0 | 3/3 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/lib/router.ts | LOADED | 0 | 19/19 (100.00%) | 10/10 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/lib/server-failure.ts | LOADED | 0 | 2/2 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/server-reconnect.ts | LOADED | 0 | 47/47 (100.00%) | 31/31 (100.00%) | 23/23 (100.00%) |
| apps/admin/src/lib/settings-effective-reads.ts | LOADED | 0 | 18/18 (100.00%) | 15/15 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/lib/settings-events.ts | LOADED | 0 | 34/34 (100.00%) | 28/28 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/lib/settings-refresh-bus.ts | LOADED | 0 | 11/11 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/lib/settings-tabs.ts | LOADED | 0 | 70/70 (100.00%) | 60/60 (100.00%) | 19/19 (100.00%) |
| apps/admin/src/lib/site-url.ts | LOADED | 0 | 4/4 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/slug-redirect-path.ts | LOADED | 0 | 4/4 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/sse-frames.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/lib/standing-draft-local-backup.ts | LOADED | 0 | 5/5 (100.00%) | 3/3 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/lib/standing-draft-recovery-message.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/lib/stored-credential-endpoint.ts | LOADED | 0 | 13/13 (100.00%) | 20/20 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/lib/stream-activity.ts | LOADED | 0 | 28/28 (100.00%) | 7/7 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/lib/tab-event-source.ts | LOADED | 0 | 36/36 (100.00%) | 25/25 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/lib/tovu-execution-policy.ts | LOADED | 0 | 4/4 (100.00%) | 13/13 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/lib/translation-entry.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/typed-answer-poster.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/unchanged-save-warning.ts | LOADED | 0 | 14/14 (100.00%) | 9/9 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/lib/version-conflict.ts | LOADED | 0 | 3/3 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/visible-interval.ts | LOADED | 0 | 21/21 (100.00%) | 10/10 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/lib/visitor-tools.ts | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/lib/widget-embed-extension.hooks.ts | LOADED | 0 | 45/45 (100.00%) | 27/27 (100.00%) | 22/22 (100.00%) |
| apps/admin/src/lib/widget-embed-extension.tsx | LOADED | 0 | 30/30 (100.00%) | 20/20 (100.00%) | 22/22 (100.00%) |
| apps/admin/src/lib/widget-embed-placement-content.ts | LOADED | 0 | 6/6 (100.00%) | 11/11 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/main.tsx | LOADED | 0 | 11/11 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/media-panel.ts | LOADED | 0 | 1/1 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/nav.ts | LOADED | 0 | 3/3 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/panel-pages.ts | LOADED | 0 | 40/40 (100.00%) | 0/0 (100.00%) | 71/80 (88.75%) |
| apps/admin/src/panels.tsx | LOADED | 0 | 78/78 (100.00%) | 44/44 (100.00%) | 53/53 (100.00%) |
| apps/desktop/bin/tovu-desktop.ts | LOADED | 0 | 189/189 (100.00%) | 33/33 (100.00%) | 7/7 (100.00%) |
| apps/desktop/scripts/check-complexity.ts | LOADED | 0 | 207/207 (100.00%) | 27/27 (100.00%) | 7/7 (100.00%) |
| apps/desktop/scripts/check-gates.ts | LOADED | 0 | 176/176 (100.00%) | 25/25 (100.00%) | 12/12 (100.00%) |
| apps/desktop/scripts/check-js-backslide.ts | LOADED | 0 | 105/105 (100.00%) | 11/11 (100.00%) | 5/5 (100.00%) |
| apps/desktop/scripts/check-tree-quiet.ts | LOADED | 0 | 174/174 (100.00%) | 31/31 (100.00%) | 11/11 (100.00%) |
| apps/desktop/scripts/merge-latest-mac.ts | LOADED | 0 | 34/34 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/desktop/scripts/one-react.ts | LOADED | 0 | 33/33 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| apps/desktop/scripts/resolve-ts-ext.ts | LOADED | 0 | 26/26 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| apps/desktop/scripts/smoke-bridge.ts | LOADED | 0 | 80/80 (100.00%) | 22/22 (100.00%) | 5/5 (100.00%) |
| apps/desktop/scripts/smoke-native.ts | LOADED | 0 | 221/221 (100.00%) | 60/60 (100.00%) | 13/13 (100.00%) |
| apps/desktop/scripts/smoke-packaged-chat.ts | LOADED | 0 | 38/38 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/desktop/scripts/stage-payload.ts | LOADED | 0 | 85/85 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/add-site-pointer.ts | LOADED | 0 | 206/206 (100.00%) | 19/19 (100.00%) | 9/9 (100.00%) |
| apps/desktop/src/admin-dev-proxy.ts | LOADED | 0 | 157/157 (100.00%) | 25/25 (100.00%) | 7/7 (100.00%) |
| apps/desktop/src/agent-plugin-tokens.ts | LOADED | 0 | 172/172 (100.00%) | 59/59 (100.00%) | 17/17 (100.00%) |
| apps/desktop/src/asar-verify.ts | LOADED | 0 | 132/132 (100.00%) | 13/13 (100.00%) | 10/10 (100.00%) |
| apps/desktop/src/auto-update-controller.ts | LOADED | 0 | 49/49 (100.00%) | 10/10 (100.00%) | 5/5 (100.00%) |
| apps/desktop/src/complexity-debt.ts | LOADED | 0 | 176/176 (100.00%) | 30/30 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/contracts/app-version.ts | LOADED | 0 | 16/16 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/contracts/chat-attachments.ts | LOADED | 0 | 35/35 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/contracts/find-in-page.ts | LOADED | 0 | 36/36 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/contracts/import-handoff.ts | LOADED | 0 | 49/49 (100.00%) | 10/10 (100.00%) | 1/1 (100.00%) |
| apps/desktop/src/contracts/owner-store.ts | LOADED | 0 | 78/78 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/contracts/product-telemetry.ts | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/contracts/project.ts | LOADED | 0 | 324/324 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/contracts/resources.ts | LOADED | 0 | 57/57 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/contracts/runtime-inventory.ts | LOADED | 0 | 31/31 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/contracts/sections.ts | LOADED | 0 | 285/285 (100.00%) | 12/12 (100.00%) | 10/14 (71.43%) |
| apps/desktop/src/contracts/site-name.ts | LOADED | 0 | 26/26 (100.00%) | 17/17 (100.00%) | 5/6 (83.33%) |
| apps/desktop/src/contracts/site-theme-preview-bridge.ts | LOADED | 0 | 23/23 (100.00%) | 14/15 (93.33%) | 10/12 (83.33%) |
| apps/desktop/src/contracts/site-view-preference.ts | LOADED | 0 | 29/29 (100.00%) | 8/8 (100.00%) | 7/7 (100.00%) |
| apps/desktop/src/contracts/working-directory.ts | LOADED | 0 | 17/17 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/contracts/workspace-chat.ts | LOADED | 0 | 127/127 (100.00%) | 9/9 (100.00%) | 4/6 (66.67%) |
| apps/desktop/src/contracts/workspace-conversations.ts | LOADED | 0 | 52/52 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/contracts/zoom.ts | LOADED | 0 | 23/23 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/coverage-floors.ts | LOADED | 0 | 399/399 (100.00%) | 106/114 (92.98%) | 46/46 (100.00%) |
| apps/desktop/src/desktop-agent-inventory.ts | LOADED | 0 | 64/64 (100.00%) | 29/29 (100.00%) | 12/12 (100.00%) |
| apps/desktop/src/desktop-agent-service.ts | LOADED | 0 | 300/300 (100.00%) | 78/104 (75.00%) | 32/37 (86.49%) |
| apps/desktop/src/desktop-agent-tools.ts | LOADED | 0 | 187/187 (100.00%) | 33/33 (100.00%) | 14/14 (100.00%) |
| apps/desktop/src/desktop-agent.ts | LOADED | 0 | 444/444 (100.00%) | 137/139 (98.56%) | 53/53 (100.00%) |
| apps/desktop/src/desktop-auth.ts | LOADED | 0 | 457/457 (100.00%) | 46/46 (100.00%) | 25/25 (100.00%) |
| apps/desktop/src/desktop-capture.ts | LOADED | 0 | 91/91 (100.00%) | 46/46 (100.00%) | 38/39 (97.44%) |
| apps/desktop/src/desktop-chat-main.ts | LOADED | 0 | 89/89 (100.00%) | 14/14 (100.00%) | 8/8 (100.00%) |
| apps/desktop/src/desktop-host-signals.ts | LOADED | 0 | 29/29 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/desktop-i18n.ts | LOADED | 0 | 181/181 (100.00%) | 16/16 (100.00%) | 4/4 (100.00%) |
| apps/desktop/src/desktop-memory-sampler.ts | LOADED | 0 | 99/99 (100.00%) | 62/68 (91.18%) | 25/32 (78.13%) |
| apps/desktop/src/desktop-resources.ts | LOADED | 0 | 222/222 (100.00%) | 140/151 (92.72%) | 64/66 (96.97%) |
| apps/desktop/src/desktop-update-preference.ts | LOADED | 0 | 42/42 (100.00%) | 16/16 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/desktop-user-data-dir.ts | LOADED | 0 | 89/89 (100.00%) | 17/17 (100.00%) | 4/4 (100.00%) |
| apps/desktop/src/dist-import-check.ts | LOADED | 0 | 38/38 (100.00%) | 10/10 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/durable-json-file.ts | LOADED | 0 | 56/56 (100.00%) | 9/9 (100.00%) | 8/8 (100.00%) |
| apps/desktop/src/external-site-stop.ts | LOADED | 0 | 208/208 (100.00%) | 58/59 (98.31%) | 16/16 (100.00%) |
| apps/desktop/src/find-in-page-ipc.ts | LOADED | 0 | 73/73 (100.00%) | 15/15 (100.00%) | 13/13 (100.00%) |
| apps/desktop/src/find-in-page-verify.ts | LOADED | 0 | 41/41 (100.00%) | 15/15 (100.00%) | 5/5 (100.00%) |
| apps/desktop/src/find-menu.ts | LOADED | 0 | 49/49 (100.00%) | 11/11 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/import-handoff-ipc.ts | LOADED | 0 | 45/45 (100.00%) | 11/11 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/instance-presence.ts | LOADED | 0 | 38/38 (100.00%) | 11/11 (100.00%) | 10/10 (100.00%) |
| apps/desktop/src/js-backslide-guard.ts | LOADED | 0 | 47/47 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/keyed-serializer.ts | LOADED | 0 | 57/57 (100.00%) | 7/7 (100.00%) | 4/4 (100.00%) |
| apps/desktop/src/live-verify-checks.ts | LOADED | 0 | 39/39 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/main/boot/boot-failure.ts | LOADED | 0 | 105/105 (100.00%) | 16/16 (100.00%) | 7/7 (100.00%) |
| apps/desktop/src/main/boot/boot-sequence.ts | LOADED | 0 | 178/178 (100.00%) | 16/16 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/main/boot/boot-steps.ts | LOADED | 0 | 210/210 (100.00%) | 35/35 (100.00%) | 12/12 (100.00%) |
| apps/desktop/src/main/boot/own-server-boot.ts | LOADED | 0 | 202/202 (100.00%) | 33/33 (100.00%) | 10/10 (100.00%) |
| apps/desktop/src/main/boot/site-backend.ts | LOADED | 0 | 272/272 (100.00%) | 41/41 (100.00%) | 8/8 (100.00%) |
| apps/desktop/src/main/boot/site-preview-guests.ts | LOADED | 0 | 97/97 (100.00%) | 34/35 (97.14%) | 9/11 (81.82%) |
| apps/desktop/src/main/boot/site-preview.ts | LOADED | 0 | 116/116 (100.00%) | 37/40 (92.50%) | 10/10 (100.00%) |
| apps/desktop/src/main/updates/desktop-updater.ts | LOADED | 0 | 193/193 (100.00%) | 50/50 (100.00%) | 19/19 (100.00%) |
| apps/desktop/src/main/updates/native-notices.ts | LOADED | 0 | 80/80 (100.00%) | 14/14 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/main/updates/product-telemetry-boot.ts | LOADED | 0 | 209/209 (100.00%) | 39/39 (100.00%) | 26/26 (100.00%) |
| apps/desktop/src/main/updates/settings-menu.ts | LOADED | 0 | 135/135 (100.00%) | 27/28 (96.43%) | 12/14 (85.71%) |
| apps/desktop/src/main/windows/app-window.ts | LOADED | 0 | 113/113 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/main/windows/dock-icon.ts | LOADED | 0 | 34/34 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| apps/desktop/src/main/windows/guest-navigation.ts | LOADED | 0 | 70/70 (100.00%) | 13/13 (100.00%) | 4/4 (100.00%) |
| apps/desktop/src/main/windows/last-window-quit.ts | LOADED | 0 | 173/173 (100.00%) | 34/34 (100.00%) | 14/14 (100.00%) |
| apps/desktop/src/main/windows/site-folder-prompt.ts | LOADED | 0 | 70/70 (100.00%) | 10/10 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/main/windows/site-open-actions.ts | LOADED | 0 | 56/56 (100.00%) | 12/12 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/main/windows/site-window.ts | LOADED | 0 | 249/249 (100.00%) | 43/43 (100.00%) | 12/12 (100.00%) |
| apps/desktop/src/main/windows/sites-home-window.ts | LOADED | 0 | 224/224 (100.00%) | 19/20 (95.00%) | 9/9 (100.00%) |
| apps/desktop/src/move-site-home.ts | LOADED | 0 | 32/32 (100.00%) | 10/10 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/move-to-applications.ts | LOADED | 0 | 241/241 (100.00%) | 54/54 (100.00%) | 14/14 (100.00%) |
| apps/desktop/src/nested-sites-migration.ts | LOADED | 0 | 82/82 (100.00%) | 38/38 (100.00%) | 9/9 (100.00%) |
| apps/desktop/src/node-toolchain.ts | LOADED | 0 | 72/72 (100.00%) | 12/12 (100.00%) | 11/12 (91.67%) |
| apps/desktop/src/owner-store-cli.ts | LOADED | 0 | 169/169 (100.00%) | 54/59 (91.53%) | 20/25 (80.00%) |
| apps/desktop/src/owner-store-ipc.ts | LOADED | 0 | 218/218 (100.00%) | 100/104 (96.15%) | 40/40 (100.00%) |
| apps/desktop/src/packaged-gate-isolation.ts | LOADED | 0 | 58/58 (100.00%) | 12/13 (92.31%) | 2/2 (100.00%) |
| apps/desktop/src/packaged-paths.ts | LOADED | 0 | 124/124 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| apps/desktop/src/preload/preload.mts | LOADED | 0 | 225/225 (100.00%) | 77/77 (100.00%) | 76/76 (100.00%) |
| apps/desktop/src/product-memory-telemetry.ts | LOADED | 0 | 90/90 (100.00%) | 42/43 (97.67%) | 11/12 (91.67%) |
| apps/desktop/src/product-telemetry-ipc.ts | LOADED | 0 | 76/76 (100.00%) | 50/50 (100.00%) | 10/10 (100.00%) |
| apps/desktop/src/product-telemetry-preference.ts | LOADED | 0 | 96/96 (100.00%) | 47/47 (100.00%) | 10/10 (100.00%) |
| apps/desktop/src/product-telemetry.ts | LOADED | 0 | 85/85 (100.00%) | 37/40 (92.50%) | 9/9 (100.00%) |
| apps/desktop/src/project-delete-guard.ts | LOADED | 0 | 190/190 (100.00%) | 31/31 (100.00%) | 5/5 (100.00%) |
| apps/desktop/src/pty-helpers.ts | LOADED | 0 | 50/50 (100.00%) | 16/16 (100.00%) | 7/7 (100.00%) |
| apps/desktop/src/quality-gates.ts | LOADED | 0 | 238/238 (100.00%) | 56/56 (100.00%) | 13/13 (100.00%) |
| apps/desktop/src/remove-site-tree.ts | LOADED | 0 | 35/35 (100.00%) | 12/12 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/renderer/app-hooks.test-support.ts | LOADED | 0 | 78/78 (100.00%) | 25/25 (100.00%) | 22/22 (100.00%) |
| apps/desktop/src/renderer/app-shell-source.ts | LOADED | 0 | 22/22 (100.00%) | 6/6 (100.00%) | 5/5 (100.00%) |
| apps/desktop/src/renderer/App.hooks.ts | LOADED | 0 | 61/61 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/renderer/app/CreateWebsiteHost.tsx | LOADED | 0 | 41/41 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/renderer/app/FindBar.tsx | LOADED | 0 | 71/71 (100.00%) | 13/13 (100.00%) | 4/4 (100.00%) |
| apps/desktop/src/renderer/app/LoadedSitesStepper.tsx | LOADED | 0 | 88/88 (100.00%) | 22/24 (91.67%) | 11/11 (100.00%) |
| apps/desktop/src/renderer/app/MainArea.tsx | LOADED | 0 | 111/111 (100.00%) | 16/16 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/renderer/app/MainContent.tsx | LOADED | 0 | 159/159 (100.00%) | 22/22 (100.00%) | 5/5 (100.00%) |
| apps/desktop/src/renderer/app/MainHeader.tsx | LOADED | 0 | 72/72 (100.00%) | 16/16 (100.00%) | 5/5 (100.00%) |
| apps/desktop/src/renderer/app/SiteStartPanel.tsx | LOADED | 0 | 105/105 (100.00%) | 27/27 (100.00%) | 7/7 (100.00%) |
| apps/desktop/src/renderer/app/SiteWorkspace.tsx | LOADED | 0 | 346/346 (100.00%) | 44/44 (100.00%) | 12/12 (100.00%) |
| apps/desktop/src/renderer/app/Spinner.tsx | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/renderer/app/TabStrip.tsx | LOADED | 0 | 106/106 (100.00%) | 30/30 (100.00%) | 7/7 (100.00%) |
| apps/desktop/src/renderer/app/TopNav.tsx | LOADED | 0 | 121/121 (100.00%) | 20/20 (100.00%) | 4/4 (100.00%) |
| apps/desktop/src/renderer/chat-attachments.ts | LOADED | 0 | 59/59 (100.00%) | 17/17 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/renderer/create-website-onboarding-policy.ts | LOADED | 0 | 14/14 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/renderer/CreateWebsiteOnboarding.tsx | LOADED | 0 | 362/362 (100.00%) | 29/29 (100.00%) | 14/14 (100.00%) |
| apps/desktop/src/renderer/dom-hook-harness.ts | LOADED | 0 | 57/57 (100.00%) | 18/18 (100.00%) | 13/13 (100.00%) |
| apps/desktop/src/renderer/expanded-mode.ts | LOADED | 0 | 95/95 (100.00%) | 16/16 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/renderer/find-query-scheduler.ts | LOADED | 0 | 33/33 (100.00%) | 10/10 (100.00%) | 7/7 (100.00%) |
| apps/desktop/src/renderer/folder-drop.ts | LOADED | 0 | 99/99 (100.00%) | 20/20 (100.00%) | 4/4 (100.00%) |
| apps/desktop/src/renderer/icons.tsx | LOADED | 0 | 254/254 (100.00%) | 7/7 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/renderer/import-drop.ts | LOADED | 0 | 46/46 (100.00%) | 17/18 (94.44%) | 3/3 (100.00%) |
| apps/desktop/src/renderer/import-error-details.ts | LOADED | 0 | 17/17 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/renderer/import-site-entry.ts | LOADED | 0 | 72/72 (100.00%) | 27/27 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/renderer/mount-renderer.ts | LOADED | 0 | 41/41 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/renderer/nav-availability.ts | LOADED | 0 | 7/7 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/renderer/persistable-messages.ts | LOADED | 0 | 19/19 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/renderer/product-telemetry.ts | LOADED | 0 | 30/30 (100.00%) | 12/13 (92.31%) | 7/7 (100.00%) |
| apps/desktop/src/renderer/ResourcesPanel.tsx | LOADED | 0 | 209/209 (100.00%) | 88/91 (96.70%) | 29/29 (100.00%) |
| apps/desktop/src/renderer/runner-api.ts | LOADED | 0 | 194/194 (100.00%) | 4/4 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/renderer/runner-conversation-controller.ts | LOADED | 0 | 392/392 (100.00%) | 110/110 (100.00%) | 42/42 (100.00%) |
| apps/desktop/src/renderer/SharedKeys.hooks.ts | LOADED | 0 | 105/105 (100.00%) | 39/43 (90.70%) | 11/11 (100.00%) |
| apps/desktop/src/renderer/site-port.rules.ts | LOADED | 0 | 60/60 (100.00%) | 26/28 (92.86%) | 4/5 (80.00%) |
| apps/desktop/src/renderer/site-shell-policy.ts | LOADED | 0 | 59/59 (100.00%) | 53/53 (100.00%) | 9/9 (100.00%) |
| apps/desktop/src/renderer/site-status.ts | LOADED | 0 | 17/17 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/renderer/site-theme-preview.hooks.ts | LOADED | 0 | 55/55 (100.00%) | 39/39 (100.00%) | 8/8 (100.00%) |
| apps/desktop/src/renderer/SiteGrid.hooks.ts | LOADED | 0 | 265/265 (100.00%) | 60/60 (100.00%) | 14/14 (100.00%) |
| apps/desktop/src/renderer/SiteGrid.tsx | LOADED | 0 | 759/759 (100.00%) | 92/94 (97.87%) | 41/41 (100.00%) |
| apps/desktop/src/renderer/sites-home-view.ts | LOADED | 0 | 99/99 (100.00%) | 27/27 (100.00%) | 7/7 (100.00%) |
| apps/desktop/src/renderer/SitesFolders.tsx | LOADED | 0 | 123/123 (100.00%) | 19/19 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/renderer/SiteToast.tsx | LOADED | 0 | 21/21 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/renderer/theme.ts | LOADED | 0 | 50/50 (100.00%) | 18/18 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/renderer/tool-icons.tsx | LOADED | 0 | 88/88 (100.00%) | 4/4 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/renderer/use-add-site.hooks.ts | LOADED | 0 | 155/155 (100.00%) | 28/30 (93.33%) | 10/10 (100.00%) |
| apps/desktop/src/renderer/use-app-version.hooks.ts | LOADED | 0 | 44/44 (100.00%) | 15/15 (100.00%) | 5/5 (100.00%) |
| apps/desktop/src/renderer/use-create-site-plugin-tokens.hooks.ts | LOADED | 0 | 117/117 (100.00%) | 36/36 (100.00%) | 14/14 (100.00%) |
| apps/desktop/src/renderer/use-create-website-form.hooks.ts | LOADED | 0 | 199/199 (100.00%) | 49/49 (100.00%) | 8/8 (100.00%) |
| apps/desktop/src/renderer/use-delete-confirmation.hooks.ts | LOADED | 0 | 60/60 (100.00%) | 13/13 (100.00%) | 8/8 (100.00%) |
| apps/desktop/src/renderer/use-dropdown-menu.hooks.ts | LOADED | 0 | 155/155 (100.00%) | 48/48 (100.00%) | 17/17 (100.00%) |
| apps/desktop/src/renderer/use-expanded-mode.hooks.ts | LOADED | 0 | 52/52 (100.00%) | 12/12 (100.00%) | 9/9 (100.00%) |
| apps/desktop/src/renderer/use-find-in-page.hooks.ts | LOADED | 0 | 712/712 (100.00%) | 135/136 (99.26%) | 53/53 (100.00%) |
| apps/desktop/src/renderer/use-import-drop.hooks.ts | LOADED | 0 | 53/53 (100.00%) | 16/16 (100.00%) | 7/8 (87.50%) |
| apps/desktop/src/renderer/use-import-handoff.hooks.ts | LOADED | 0 | 42/42 (100.00%) | 16/16 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/renderer/use-live-views.hooks.ts | LOADED | 0 | 276/276 (100.00%) | 84/88 (95.45%) | 33/34 (97.06%) |
| apps/desktop/src/renderer/use-loaded-sites.hooks.ts | LOADED | 0 | 62/62 (100.00%) | 12/14 (85.71%) | 7/7 (100.00%) |
| apps/desktop/src/renderer/use-new-site-dir.hooks.ts | LOADED | 0 | 31/31 (100.00%) | 18/18 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/renderer/use-product-screen.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/renderer/use-project-mutations.hooks.ts | LOADED | 0 | 129/129 (100.00%) | 25/25 (100.00%) | 13/13 (100.00%) |
| apps/desktop/src/renderer/use-project-tabs.hooks.ts | LOADED | 0 | 70/70 (100.00%) | 20/20 (100.00%) | 11/12 (91.67%) |
| apps/desktop/src/renderer/use-resources.hooks.ts | LOADED | 0 | 91/91 (100.00%) | 33/33 (100.00%) | 14/14 (100.00%) |
| apps/desktop/src/renderer/use-runner-conversations.hooks.ts | LOADED | 0 | 119/119 (100.00%) | 13/13 (100.00%) | 9/9 (100.00%) |
| apps/desktop/src/renderer/use-section-nav.hooks.ts | LOADED | 0 | 161/161 (100.00%) | 19/19 (100.00%) | 15/15 (100.00%) |
| apps/desktop/src/renderer/use-site-actions.hooks.ts | LOADED | 0 | 55/55 (100.00%) | 11/11 (100.00%) | 5/5 (100.00%) |
| apps/desktop/src/renderer/use-site-folders.hooks.ts | LOADED | 0 | 95/95 (100.00%) | 47/47 (100.00%) | 19/19 (100.00%) |
| apps/desktop/src/renderer/use-site-list-prefs.hooks.ts | LOADED | 0 | 66/66 (100.00%) | 13/13 (100.00%) | 8/8 (100.00%) |
| apps/desktop/src/renderer/use-site-locate.hooks.ts | LOADED | 0 | 71/71 (100.00%) | 16/16 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/renderer/use-site-power.hooks.ts | LOADED | 0 | 353/353 (100.00%) | 129/129 (100.00%) | 32/32 (100.00%) |
| apps/desktop/src/renderer/use-site-preview.hooks.ts | LOADED | 0 | 114/114 (100.00%) | 23/23 (100.00%) | 8/8 (100.00%) |
| apps/desktop/src/renderer/use-site-rename.hooks.ts | LOADED | 0 | 221/221 (100.00%) | 39/39 (100.00%) | 15/15 (100.00%) |
| apps/desktop/src/renderer/use-site-start.hooks.ts | LOADED | 0 | 142/142 (100.00%) | 24/24 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/renderer/use-site-storage-settings.hooks.ts | LOADED | 0 | 24/24 (100.00%) | 13/13 (100.00%) | 7/7 (100.00%) |
| apps/desktop/src/renderer/use-site-toast.hooks.ts | LOADED | 0 | 51/51 (100.00%) | 22/22 (100.00%) | 10/10 (100.00%) |
| apps/desktop/src/renderer/use-site-view-preference.hooks.ts | LOADED | 0 | 34/34 (100.00%) | 18/19 (94.74%) | 9/10 (90.00%) |
| apps/desktop/src/renderer/use-site-workspace.hooks.ts | LOADED | 0 | 402/402 (100.00%) | 132/133 (99.25%) | 38/38 (100.00%) |
| apps/desktop/src/renderer/use-sites-folders-dialog.hooks.ts | LOADED | 0 | 68/68 (100.00%) | 19/19 (100.00%) | 11/11 (100.00%) |
| apps/desktop/src/renderer/use-sites-inventory.hooks.ts | LOADED | 0 | 163/163 (100.00%) | 38/38 (100.00%) | 19/19 (100.00%) |
| apps/desktop/src/renderer/use-start-imported.hooks.ts | LOADED | 0 | 52/52 (100.00%) | 17/18 (94.44%) | 6/6 (100.00%) |
| apps/desktop/src/renderer/use-tab-strip.hooks.ts | LOADED | 0 | 82/82 (100.00%) | 42/42 (100.00%) | 18/18 (100.00%) |
| apps/desktop/src/renderer/use-webview-load-failure.hooks.ts | LOADED | 0 | 135/135 (100.00%) | 15/15 (100.00%) | 8/8 (100.00%) |
| apps/desktop/src/renderer/use-workspace-chat-pane.hooks.ts | LOADED | 0 | 187/187 (100.00%) | 16/16 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/renderer/use-workspace-chat-transport.hooks.ts | LOADED | 0 | 80/80 (100.00%) | 22/22 (100.00%) | 8/8 (100.00%) |
| apps/desktop/src/renderer/use-zoom.hooks.ts | LOADED | 0 | 258/258 (100.00%) | 50/50 (100.00%) | 17/17 (100.00%) |
| apps/desktop/src/renderer/visible-interval.ts | LOADED | 0 | 64/64 (100.00%) | 20/22 (90.91%) | 13/15 (86.67%) |
| apps/desktop/src/renderer/workspace-chat-transport.ts | LOADED | 0 | 446/446 (100.00%) | 127/128 (99.22%) | 41/41 (100.00%) |
| apps/desktop/src/renderer/WorkspaceChatPane.tsx | LOADED | 0 | 143/143 (100.00%) | 10/10 (100.00%) | 4/4 (100.00%) |
| apps/desktop/src/resources-ipc.ts | LOADED | 0 | 30/30 (100.00%) | 13/13 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/runner-ipc-stubs.ts | LOADED | 0 | 117/117 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/selftest-tracker.ts | LOADED | 0 | 95/95 (100.00%) | 11/11 (100.00%) | 4/4 (100.00%) |
| apps/desktop/src/shared-sites.ts | LOADED | 0 | 219/219 (100.00%) | 85/86 (98.84%) | 21/21 (100.00%) |
| apps/desktop/src/shell-staleness.ts | LOADED | 0 | 77/77 (100.00%) | 14/14 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/site-archive-import.ts | LOADED | 0 | 172/172 (100.00%) | 40/44 (90.91%) | 21/24 (87.50%) |
| apps/desktop/src/site-config.ts | LOADED | 0 | 167/167 (100.00%) | 42/42 (100.00%) | 5/5 (100.00%) |
| apps/desktop/src/site-dir-store.ts | LOADED | 0 | 638/638 (100.00%) | 116/116 (100.00%) | 30/30 (100.00%) |
| apps/desktop/src/site-directory-identity.ts | LOADED | 0 | 112/112 (100.00%) | 33/35 (94.29%) | 10/10 (100.00%) |
| apps/desktop/src/site-discovery-scan.ts | LOADED | 0 | 38/38 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/site-discovery-worker.ts | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/site-discovery.ts | LOADED | 0 | 59/59 (100.00%) | 25/25 (100.00%) | 12/12 (100.00%) |
| apps/desktop/src/site-folders.ts | LOADED | 0 | 161/161 (100.00%) | 63/63 (100.00%) | 27/27 (100.00%) |
| apps/desktop/src/site-history-menu.ts | LOADED | 0 | 151/151 (100.00%) | 12/12 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/site-name-policy.ts | LOADED | 0 | 32/32 (100.00%) | 12/12 (100.00%) | 5/5 (100.00%) |
| apps/desktop/src/site-name.ts | LOADED | 0 | 23/23 (100.00%) | 7/7 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/site-power-verify.ts | LOADED | 0 | 165/165 (100.00%) | 33/33 (100.00%) | 8/8 (100.00%) |
| apps/desktop/src/site-preview-scheduler.ts | LOADED | 0 | 47/47 (100.00%) | 19/19 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/site-preview-store.ts | LOADED | 0 | 214/214 (100.00%) | 22/22 (100.00%) | 9/9 (100.00%) |
| apps/desktop/src/site-relocation.ts | LOADED | 0 | 276/276 (100.00%) | 88/88 (100.00%) | 22/22 (100.00%) |
| apps/desktop/src/site-scan-policy.ts | LOADED | 0 | 40/40 (100.00%) | 20/20 (100.00%) | 5/5 (100.00%) |
| apps/desktop/src/site-supervisor.ts | LOADED | 0 | 176/176 (100.00%) | 16/16 (100.00%) | 10/10 (100.00%) |
| apps/desktop/src/site-theme-preview-ipc.ts | LOADED | 0 | 72/72 (100.00%) | 39/39 (100.00%) | 9/9 (100.00%) |
| apps/desktop/src/site-theme-preview.ts | LOADED | 0 | 121/121 (100.00%) | 52/52 (100.00%) | 15/15 (100.00%) |
| apps/desktop/src/site-transitions.ts | LOADED | 0 | 80/80 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/site-view-preference.ts | LOADED | 0 | 171/171 (100.00%) | 77/78 (98.72%) | 26/26 (100.00%) |
| apps/desktop/src/sites-mcp-identity.ts | LOADED | 0 | 10/10 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/sites-mcp-tools.ts | LOADED | 0 | 392/392 (100.00%) | 51/52 (98.08%) | 21/21 (100.00%) |
| apps/desktop/src/smoke-bridge.ts | LOADED | 0 | 256/256 (100.00%) | 81/84 (96.43%) | 21/21 (100.00%) |
| apps/desktop/src/smoke-native.ts | LOADED | 0 | 304/304 (100.00%) | 41/41 (100.00%) | 10/10 (100.00%) |
| apps/desktop/src/smoke-packaged-chat-gate.ts | LOADED | 0 | 427/427 (100.00%) | 144/144 (100.00%) | 42/42 (100.00%) |
| apps/desktop/src/smoke-packaged-chat.ts | LOADED | 0 | 202/202 (100.00%) | 113/113 (100.00%) | 25/25 (100.00%) |
| apps/desktop/src/speech/mac-on-device-transcriber.ts | LOADED | 0 | 92/92 (100.00%) | 17/17 (100.00%) | 13/13 (100.00%) |
| apps/desktop/src/speech/speech-ipc.ts | LOADED | 0 | 66/66 (100.00%) | 12/12 (100.00%) | 8/8 (100.00%) |
| apps/desktop/src/speech/transcription-port.ts | LOADED | 0 | 26/26 (100.00%) | 5/5 (100.00%) | 4/4 (100.00%) |
| apps/desktop/src/spellcheck-menu.ts | LOADED | 0 | 94/94 (100.00%) | 19/19 (100.00%) | 18/18 (100.00%) |
| apps/desktop/src/stage-payload-lib.ts | LOADED | 0 | 707/707 (100.00%) | 148/149 (99.33%) | 47/47 (100.00%) |
| apps/desktop/src/stage-payload-run.ts | LOADED | 0 | 459/459 (100.00%) | 98/100 (98.00%) | 40/41 (97.56%) |
| apps/desktop/src/staged-closure-scan.ts | LOADED | 0 | 28/28 (100.00%) | 10/10 (100.00%) | 4/4 (100.00%) |
| apps/desktop/src/startup-env.ts | LOADED | 0 | 94/94 (100.00%) | 31/31 (100.00%) | 7/7 (100.00%) |
| apps/desktop/src/supervised-site-url.ts | LOADED | 0 | 23/23 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/tovu-server.ts | LOADED | 0 | 1137/1137 (100.00%) | 151/156 (96.79%) | 53/53 (100.00%) |
| apps/desktop/src/tracked-sites.ts | LOADED | 0 | 716/716 (100.00%) | 136/136 (100.00%) | 49/49 (100.00%) |
| apps/desktop/src/tree-quiet.ts | LOADED | 0 | 94/94 (100.00%) | 17/17 (100.00%) | 5/5 (100.00%) |
| apps/desktop/src/update-manifest-merge.ts | LOADED | 0 | 103/103 (100.00%) | 35/35 (100.00%) | 13/13 (100.00%) |
| apps/desktop/src/update-policy.ts | LOADED | 0 | 21/21 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/verify-package-cli.ts | LOADED | 0 | 184/184 (100.00%) | 39/39 (100.00%) | 14/14 (100.00%) |
| apps/desktop/src/webview-guest-policy.ts | LOADED | 0 | 33/33 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/window-bounds-store.ts | LOADED | 0 | 70/70 (100.00%) | 9/9 (100.00%) | 8/8 (100.00%) |
| apps/desktop/src/window-navigation-policy.ts | LOADED | 0 | 84/84 (100.00%) | 12/12 (100.00%) | 11/11 (100.00%) |
| apps/desktop/src/workspace-chat-ipc.ts | LOADED | 0 | 215/215 (100.00%) | 60/60 (100.00%) | 28/28 (100.00%) |
| apps/desktop/src/workspace-conversation-store.ts | LOADED | 0 | 137/137 (100.00%) | 55/55 (100.00%) | 30/30 (100.00%) |
| apps/desktop/src/zoom-menu.ts | LOADED | 0 | 51/51 (100.00%) | 12/12 (100.00%) | 7/7 (100.00%) |
| apps/website/src/assistant/agent-discovery.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/assistant/assistant-subagents-policy.ts | LOADED | 0 | 1/1 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/assistant/credential-guidance.ts | LOADED | 0 | 14/14 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/assistant/daemon-core-protocol.ts | LOADED | 0 | 83/83 (100.00%) | 4/5 (80.00%) | 3/6 (50.00%) |
| apps/website/src/assistant/daemon-exit-codes.ts | LOADED | 0 | 20/20 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/assistant/durable-runs/recover.ts | LOADED | 0 | 1/1 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/assistant/execution-credential-repo.sqlite.ts | LOADED | 0 | 16/16 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/assistant/execution-credential-repo.ts | LOADED | 0 | 11/11 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/assistant/index.ts | LOADED | 0 | 264/264 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/assistant/mcp-services.ts | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/assistant/mcp-ui.ts | LOADED | 0 | 25/25 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/assistant/runtime-settings.ts | LOADED | 0 | 8/8 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/assistant/site-credential-repo.sqlite.ts | LOADED | 0 | 16/16 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/assistant/site-credential-repo.ts | LOADED | 0 | 11/11 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/assistant/site-guide-pointer.ts | LOADED | 0 | 15/15 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/assistant/site/capability-card.ts | LOADED | 0 | 16/16 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/assistant/site/visitor-tool-presentation.ts | LOADED | 0 | 44/44 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/assistant/tool-search-doc2query.ts | LOADED | 0 | 15/15 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/assistant/visitor-services.ts | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/contracts/core/assistant-content-guidance.ts | LOADED | 0 | 9/9 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/contracts/core/assistant-native-fallbacks.ts | LOADED | 0 | 139/139 (100.00%) | 25/32 (78.13%) | 11/17 (64.71%) |
| apps/website/src/contracts/core/commands/appliers.ts | LOADED | 0 | 6/6 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/contracts/core/commands/index.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/contracts/core/custom-credential-categories.ts | LOADED | 0 | 9/9 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/contracts/core/events/index.ts | LOADED | 0 | 7/7 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/contracts/core/events/outbox-retry-policies.ts | LOADED | 0 | 23/23 (100.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/contracts/core/extension-capability-vocabulary.ts | LOADED | 0 | 33/33 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/contracts/core/external-mcp-access.ts | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/contracts/core/external-mcp-auth.ts | LOADED | 0 | 7/7 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/contracts/core/hosted-sign-in-links.ts | LOADED | 0 | 10/10 (100.00%) | 5/5 (100.00%) | 4/6 (66.67%) |
| apps/website/src/contracts/core/index.ts | LOADED | 0 | 7/7 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/contracts/core/operation-lock.ts | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/contracts/core/page-html.ts | LOADED | 0 | 149/149 (100.00%) | 10/10 (100.00%) | 4/4 (100.00%) |
| apps/website/src/contracts/core/path-containment.ts | LOADED | 0 | 20/20 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/contracts/core/plugin-credential-card.ts | LOADED | 0 | 11/11 (100.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/contracts/core/soft-delete.ts | LOADED | 0 | 11/11 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/contracts/core/system-content-types.ts | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/contracts/core/theme-slots.ts | LOADED | 0 | 41/41 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/agent-plugins.ts | LOADED | 0 | 53/53 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/analytics.ts | LOADED | 0 | 19/19 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/assistant.ts | LOADED | 0 | 58/58 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/change-sets.ts | LOADED | 0 | 21/21 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/comments.ts | LOADED | 0 | 108/108 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/commerce.ts | LOADED | 0 | 13/13 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/consent.ts | LOADED | 0 | 16/16 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/content-duplication.ts | LOADED | 0 | 16/16 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/content-read.ts | LOADED | 0 | 107/107 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/content-types.ts | LOADED | 0 | 98/98 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/custom-credentials.ts | LOADED | 0 | 106/106 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/database-transfer.ts | LOADED | 0 | 34/34 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/database.ts | LOADED | 0 | 113/113 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/deploy-ops.ts | LOADED | 0 | 85/85 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/deployments.ts | LOADED | 0 | 83/83 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/domain-dns.ts | LOADED | 0 | 101/101 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/email-templates.ts | LOADED | 0 | 43/43 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/entries.ts | LOADED | 0 | 77/77 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/external-mcp.ts | LOADED | 0 | 82/82 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/files-copy.ts | LOADED | 0 | 20/20 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/forms.ts | LOADED | 0 | 119/119 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/frontend-control.ts | LOADED | 0 | 80/80 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/fs-files.ts | LOADED | 0 | 48/48 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/identity.ts | LOADED | 0 | 228/228 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/image-transform.ts | LOADED | 0 | 20/20 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/index.ts | LOADED | 0 | 131/131 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/mail-status.ts | LOADED | 0 | 97/97 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/media-generation.ts | LOADED | 0 | 31/31 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/media-import.ts | LOADED | 0 | 42/42 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/media.ts | LOADED | 0 | 105/105 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/members.ts | LOADED | 0 | 72/72 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/navigation.ts | LOADED | 0 | 73/73 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/newsletter.ts | LOADED | 0 | 248/248 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/observability.ts | LOADED | 0 | 10/10 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/pages.ts | LOADED | 0 | 69/69 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/permanent-delete.ts | LOADED | 0 | 125/125 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/plugin-runtime.ts | LOADED | 0 | 77/77 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/post.ts | LOADED | 0 | 119/119 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/publish-content.ts | LOADED | 0 | 82/82 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/recovery.ts | LOADED | 0 | 80/80 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/redirects.ts | LOADED | 0 | 95/95 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/search.ts | LOADED | 0 | 35/35 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/seo.ts | LOADED | 0 | 85/85 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/server-logs.ts | LOADED | 0 | 12/12 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/settings.ts | LOADED | 0 | 119/119 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/site-backup.ts | LOADED | 0 | 28/28 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/site-evidence.ts | LOADED | 0 | 13/13 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/site-guide.ts | LOADED | 0 | 13/13 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/site-inspection.ts | LOADED | 0 | 57/57 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/sites.ts | LOADED | 0 | 58/58 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/skills.ts | LOADED | 0 | 12/12 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/source-control.ts | LOADED | 0 | 25/25 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/taxonomy.ts | LOADED | 0 | 116/116 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/theme.ts | LOADED | 0 | 237/237 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/trash.ts | LOADED | 0 | 29/29 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/visitor-tools.ts | LOADED | 0 | 13/13 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/web-screenshot.ts | LOADED | 0 | 25/25 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/web.ts | LOADED | 0 | 23/23 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/webhooks.ts | LOADED | 0 | 80/80 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/widgets.ts | LOADED | 0 | 163/163 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/tool-metadata/workspace.ts | LOADED | 0 | 52/52 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/core/upload-limits.ts | LOADED | 0 | 7/7 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/contracts/core/widget-tables.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/contracts/headless/assistant-permanent-deletes-policy.ts | LOADED | 0 | 39/39 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| apps/website/src/contracts/headless/assistant-subagents-policy.ts | LOADED | 0 | 19/19 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/headless/assistant-tool-approval-policy.ts | LOADED | 0 | 41/41 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/headless/chat-attachment.ts | LOADED | 0 | 26/26 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/headless/form-delivery-status.ts | LOADED | 0 | 27/27 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/headless/index.ts | LOADED | 0 | 21/21 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/headless/member-login.ts | LOADED | 0 | 2/2 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/headless/plugin-install-source.ts | LOADED | 0 | 34/34 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/contracts/headless/secret-form-cards.ts | LOADED | 0 | 11/11 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/features/agent-plugins/bundled-contribution-sources.ts | LOADED | 0 | 17/17 (100.00%) | 12/12 (100.00%) | 11/12 (91.67%) |
| apps/website/src/features/agent-plugins/card-host-bindings.ts | LOADED | 0 | 14/14 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/agent-plugins/connection-status.ts | LOADED | 0 | 15/15 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/agent-plugins/credential-cards.ts | LOADED | 0 | 1/1 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/agent-plugins/descriptor-i18n.ts | LOADED | 0 | 22/22 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/agent-plugins/executable-tools/approval-bindings.ts | LOADED | 0 | 7/7 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/agent-plugins/executable-tools/approval.ts | LOADED | 0 | 9/9 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/agent-plugins/executable-tools/host-capabilities.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/agent-plugins/host-signals.ts | LOADED | 0 | 83/83 (100.00%) | 9/17 (52.94%) | 8/16 (50.00%) |
| apps/website/src/features/agent-plugins/identity.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/agent-plugins/mail-provider-setup.ts | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/agent-plugins/mcp-metadata.ts | LOADED | 0 | 13/13 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/analytics/agent-tools.ts | LOADED | 0 | 12/12 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/analytics/index.ts | LOADED | 0 | 64/64 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/analytics/ports.ts | LOADED | 0 | 209/209 (100.00%) | 6/6 (100.00%) | 5/5 (100.00%) |
| apps/website/src/features/api-connections/connect-bindings.ts | LOADED | 0 | 11/11 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/api-connections/connect.ts | LOADED | 0 | 16/16 (100.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/api-connections/oauth-bindings.ts | LOADED | 0 | 19/19 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/change-sets/agent-tools.ts | LOADED | 0 | 111/111 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/comments/agent-tools.ts | LOADED | 0 | 207/207 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/comments/types.ts | LOADED | 0 | 68/68 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/content-duplication/agent-tools.ts | LOADED | 0 | 104/104 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/content-types/declared-owners.ts | LOADED | 0 | 27/27 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/content-types/index.ts | LOADED | 0 | 122/122 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/content-types/repo.sqlite.ts | LOADED | 0 | 15/15 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/custom-credentials/agent-tools.ts | LOADED | 0 | 190/190 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/custom-credentials/credential-save-tool.ts | LOADED | 0 | 12/12 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/custom-credentials/custom-credential-repo.sqlite.ts | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/custom-credentials/index.ts | LOADED | 0 | 52/52 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/custom-credentials/plugin-credential-card.ts | LOADED | 0 | 6/6 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/custom-credentials/tovu-credential-card-identity.ts | LOADED | 0 | 18/18 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/database-transfer/destination-repo.ts | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/database-transfer/exclusions.ts | LOADED | 0 | 84/84 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/features/database-transfer/plan-store.ts | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/database-transfer/sqlite-source.ts | LOADED | 0 | 6/6 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/database-transfer/transfer-messages.ts | LOADED | 0 | 21/21 (100.00%) | 3/3 (100.00%) | 2/6 (33.33%) |
| apps/website/src/features/database/agent-tools.ts | LOADED | 0 | 9/9 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/database/boot/reconcile-interrupted-migration.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/database/db-messages.ts | LOADED | 0 | 22/22 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/database/migrate-forward/execute.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/database/restore-points.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/database/timeline.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/deployments/agent-tools.ts | LOADED | 0 | 142/142 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/deployments/capability-card.ts | LOADED | 0 | 34/34 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/deployments/index.ts | LOADED | 0 | 93/93 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/deployments/publish-credentials/index.ts | LOADED | 0 | 44/44 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/deployments/publish-credentials/repo.memory.ts | LOADED | 0 | 1/1 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/deployments/static-publish/index.ts | LOADED | 0 | 57/57 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/domain-dns/index.ts | LOADED | 0 | 14/14 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/email-templates/agent-tools.ts | LOADED | 0 | 72/72 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/email-templates/index.ts | LOADED | 0 | 27/27 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/entries/contracts.ts | LOADED | 0 | 57/57 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/entries/index.ts | LOADED | 0 | 69/69 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/entries/public-read.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/entries/render-entry.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/entries/repo.sqlite.ts | LOADED | 0 | 17/17 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/external-mcp/agent-tools.ts | LOADED | 0 | 220/220 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/external-mcp/external-mcp-repo.sqlite.ts | LOADED | 0 | 15/15 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/external-mcp/external-mcp-store.memory.ts | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/form-destinations/index.ts | LOADED | 0 | 30/30 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/forms/agent-tools.ts | LOADED | 0 | 356/356 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/forms/capability-card.ts | LOADED | 0 | 29/29 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/forms/mail-outbox-readiness.ts | LOADED | 0 | 2/2 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/forms/rate-limit-profile.ts | LOADED | 0 | 18/18 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/fs-files/agent-tools.ts | LOADED | 0 | 195/195 (100.00%) | 4/4 (100.00%) | 3/3 (100.00%) |
| apps/website/src/features/fs-files/custom-root-permission.ts | LOADED | 0 | 88/88 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/identity/builtin-role-grants.ts | LOADED | 0 | 199/199 (100.00%) | 10/14 (71.43%) | 7/7 (100.00%) |
| apps/website/src/features/identity/permission-grants.ts | LOADED | 0 | 38/38 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/identity/repo.sqlite.ts | LOADED | 0 | 84/84 (100.00%) | 22/22 (100.00%) | 21/21 (100.00%) |
| apps/website/src/features/identity/role-manage-permission.ts | LOADED | 0 | 46/46 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/identity/site-key-permission.ts | LOADED | 0 | 102/102 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/identity/user-manage-permission.ts | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/identity/user-purge-types.ts | LOADED | 0 | 84/84 (100.00%) | 4/4 (100.00%) | 3/4 (75.00%) |
| apps/website/src/features/identity/user-purge.sqlite.ts | LOADED | 0 | 8/8 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/mail-status/agent-tools.ts | LOADED | 0 | 21/21 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/mail-status/delivery-agent-tools.ts | LOADED | 0 | 56/56 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/mail-status/permissions.ts | LOADED | 0 | 41/41 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/mail-status/provider-agent-tools.ts | LOADED | 0 | 16/16 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/mail/index.ts | LOADED | 0 | 11/11 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/media-generation/agent-tools.ts | LOADED | 0 | 143/143 (100.00%) | 8/8 (100.00%) | 7/7 (100.00%) |
| apps/website/src/features/media-import/agent-tools.ts | LOADED | 0 | 139/139 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/media/index.ts | LOADED | 0 | 156/156 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/media/media-provider-credential-repo.sqlite.ts | LOADED | 0 | 9/9 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/media/media-provider-credential-repo.ts | LOADED | 0 | 21/21 (100.00%) | 3/4 (75.00%) | 2/5 (40.00%) |
| apps/website/src/features/media/public-urls.ts | LOADED | 0 | 1/1 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/member-login/index.ts | LOADED | 0 | 10/10 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/member-login/public-path.ts | LOADED | 0 | 1/1 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/member-login/types.ts | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/members/agent-tools.ts | LOADED | 0 | 162/162 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/members/capability-card.ts | LOADED | 0 | 29/29 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/members/index.ts | LOADED | 0 | 134/134 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/members/types.ts | LOADED | 0 | 326/326 (100.00%) | 8/8 (100.00%) | 7/7 (100.00%) |
| apps/website/src/features/navigation/index.ts | LOADED | 0 | 163/163 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/navigation/menu-html-permission.ts | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/navigation/menu-version-conflict-error.ts | LOADED | 0 | 12/12 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/navigation/repo.sqlite.ts | LOADED | 0 | 23/23 (100.00%) | 4/4 (100.00%) | 3/5 (60.00%) |
| apps/website/src/features/newsletter/agent-tools.ts | LOADED | 0 | 267/267 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/newsletter/index.ts | LOADED | 0 | 42/42 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/object-storage/index.ts | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/origin/index.ts | LOADED | 0 | 8/8 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/pages/agent-tools.ts | LOADED | 0 | 223/223 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/pages/index.ts | LOADED | 0 | 34/34 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/pages/permissions.ts | LOADED | 0 | 154/154 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/pages/skeleton.ts | LOADED | 0 | 61/61 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/permanent-delete/agent-tools.ts | LOADED | 0 | 34/34 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| apps/website/src/features/plugin-runtime/admin-response.ts | LOADED | 0 | 38/38 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/plugin-runtime/agent-tools.ts | LOADED | 0 | 299/299 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/plugin-runtime/capability-card.ts | LOADED | 0 | 29/29 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/plugin-runtime/install-tool-catalog.ts | LOADED | 0 | 27/27 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/plugin-runtime/plugin-tool-ids.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/plugin-runtime/provider-status-tool.ts | LOADED | 0 | 12/12 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/plugin-runtime/source-tool-catalog.ts | LOADED | 0 | 40/40 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/plugins/data-module.ts | LOADED | 0 | 1/1 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/plugins/index.ts | LOADED | 0 | 1/1 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/plugins/lipay/manifest.ts | LOADED | 0 | 88/88 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/plugins/migration-recovery.ts | LOADED | 0 | 5/5 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/plugins/snapshot.ts | LOADED | 0 | 5/5 (100.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/features/plugins/store/manifest.ts | LOADED | 0 | 29/29 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/post/agent-tools.ts | LOADED | 0 | 1005/1005 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/post/capability-card.ts | LOADED | 0 | 29/29 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/post/index.ts | LOADED | 0 | 85/85 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/post/read-model.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/post/rendering.ts | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/post/repo.sqlite.ts | LOADED | 0 | 17/17 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/presentation/index.ts | LOADED | 0 | 27/27 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/presentation/repo.sqlite.ts | LOADED | 0 | 15/15 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/publish-content/agent-tools.ts | LOADED | 0 | 145/145 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/publish-content/artifact-format.ts | LOADED | 0 | 9/9 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/publish-content/live-site-policy.ts | LOADED | 0 | 25/25 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/publish-content/permissions.ts | LOADED | 0 | 107/107 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/publish-content/publish-content-peer-repo.sqlite.ts | LOADED | 0 | 8/8 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/publish-content/publish-content-peer-repo.ts | LOADED | 0 | 12/12 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/recovery/agent-tools.ts | LOADED | 0 | 180/180 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/recovery/capability-card.ts | LOADED | 0 | 27/27 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/recovery/deep-link.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/recovery/disclosure.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/recovery/recovery-orchestrator.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/recovery/repo.memory.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/recovery/ui/degraded-banners.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/redirects/agent-tools.ts | LOADED | 0 | 236/236 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/redirects/index.ts | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/seo/agent-tools.ts | LOADED | 0 | 273/273 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/seo/capability-card.ts | LOADED | 0 | 29/29 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/server-logs/agent-tools.ts | LOADED | 0 | 19/19 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/server-logs/process-source.ts | LOADED | 0 | 7/7 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/settings/contracts.ts | LOADED | 0 | 10/10 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/settings/repo.sqlite.ts | LOADED | 0 | 15/15 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/settings/site-title-preservation.sqlite.ts | LOADED | 0 | 9/9 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/settings/visitor-tools-agent-tools.ts | LOADED | 0 | 25/25 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/settings/visitor-tools-permissions.ts | LOADED | 0 | 14/14 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/site-backup/saved-keys-port.ts | LOADED | 0 | 18/18 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/site-evidence/agent-tools.ts | LOADED | 0 | 99/99 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/site-export/export-failure-summary.ts | LOADED | 0 | 56/56 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/site-export/index.ts | LOADED | 0 | 18/18 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/site-guide/capability-card.ts | LOADED | 0 | 22/22 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/site-guide/index.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/site-inspection/agent-tools.ts | LOADED | 0 | 194/194 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/site-inspection/index.ts | LOADED | 0 | 98/98 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/sites/agent-tools.ts | LOADED | 0 | 164/164 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/sites/index.ts | LOADED | 0 | 38/38 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/sites/list-tool.ts | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/skills/install-adapters.ts | LOADED | 0 | 7/7 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/skills/state.ts | LOADED | 0 | 7/7 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/source-control/commit-schema.ts | LOADED | 0 | 31/31 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/source-control/index.ts | LOADED | 0 | 32/32 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/source-control/provider-module.ts | LOADED | 0 | 223/223 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/source-control/repo.memory.ts | LOADED | 0 | 14/14 (100.00%) | 3/4 (75.00%) | 2/4 (50.00%) |
| apps/website/src/features/source-control/repository-target.ts | LOADED | 0 | 20/20 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/source-control/source-control-credential-repo.sqlite.ts | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/taxonomy/agent-tools.ts | LOADED | 0 | 34/34 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/features/taxonomy/content-targets.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/taxonomy/index.ts | LOADED | 0 | 60/60 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/taxonomy/term-sync.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/theme/agent-tools.ts | LOADED | 0 | 458/458 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/theme/capability-card.ts | LOADED | 0 | 29/29 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/theme/catalog.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/theme/index.ts | LOADED | 0 | 221/221 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/theme/rendering.ts | LOADED | 0 | 18/18 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/tool-audit/repo.sqlite.ts | LOADED | 0 | 17/17 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/trash/adapters/plugin.ts | LOADED | 0 | 1/1 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/trash/adapters/theme.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/trash/index.ts | LOADED | 0 | 110/110 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/trash/ports.ts | LOADED | 0 | 61/61 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/trash/widget-removal.ts | LOADED | 0 | 13/13 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/vendor-credentials/index.ts | LOADED | 0 | 12/12 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/vendor-credentials/vendor-credential-repo.sqlite.ts | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/web-screenshot/agent-tools.ts | LOADED | 0 | 56/56 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/web/agent-tools.ts | LOADED | 0 | 65/65 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/webhooks/agent-tools.ts | LOADED | 0 | 209/209 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/features/webhooks/index.ts | LOADED | 0 | 95/95 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/webhooks/signing.keyring.ts | LOADED | 0 | 31/31 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/features/webmcp/webmcp-i18n.ts | LOADED | 0 | 25/25 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/widgets/agent-tools.ts | LOADED | 0 | 341/341 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/features/widgets/capability-card.ts | LOADED | 0 | 34/34 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/widgets/repo.sqlite.ts | LOADED | 0 | 19/19 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/features/workspace/index.ts | LOADED | 0 | 38/38 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/features/workspace/repo.sqlite.ts | LOADED | 0 | 15/15 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/platform/db/kernel/checkpoint-stopped-wal.ts | LOADED | 0 | 19/19 (100.00%) | 5/6 (83.33%) | 3/4 (75.00%) |
| apps/website/src/platform/db/kernel/dialect.ts | LOADED | 0 | 7/7 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/platform/db/kernel/index.ts | LOADED | 0 | 45/45 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/platform/db/kernel/port.ts | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/platform/db/kernel/schema-shape.ts | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/platform/db/migrations/0000_legacy_baseline.postgres.ts | LOADED | 0 | 265/265 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/platform/db/migrations/checksums.ts | LOADED | 0 | 67/67 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/platform/db/site-store-copy.ts | LOADED | 0 | 17/17 (100.00%) | 3/3 (100.00%) | 2/10 (20.00%) |
| apps/website/src/platform/db/sqlite/analytics-sink.sqlite.ts | LOADED | 0 | 15/15 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/platform/db/sqlite/change-set-repo.sqlite.ts | LOADED | 0 | 15/15 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/platform/db/sqlite/entry-refs-repo.sqlite.ts | LOADED | 0 | 15/15 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/platform/db/sqlite/external-mcp-tool-approval-repo.sqlite.ts | LOADED | 0 | 16/16 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/platform/db/sqlite/gated-mutation-token-repo.sqlite.ts | LOADED | 0 | 15/15 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/platform/db/sqlite/media-repo.sqlite.ts | LOADED | 0 | 46/46 (100.00%) | 7/7 (100.00%) | 6/11 (54.55%) |
| apps/website/src/platform/db/sqlite/oauth-pending-store.sqlite.ts | LOADED | 0 | 27/27 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/db/sqlite/outbox-repo.sqlite.ts | LOADED | 0 | 19/19 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/platform/db/sqlite/publish-content-baseline-repo.sqlite.ts | LOADED | 0 | 15/15 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/platform/db/sqlite/publish-content-bundle-repo.sqlite.ts | LOADED | 0 | 15/15 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/platform/db/sqlite/publish-content-run-repo.sqlite.ts | LOADED | 0 | 15/15 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/platform/db/sqlite/publish-history-repo.sqlite.ts | LOADED | 0 | 15/15 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/platform/dev-supervisor/index.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/platform/html/escape.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/platform/html/slug.ts | LOADED | 0 | 28/28 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/platform/html/style-values.ts | LOADED | 0 | 58/58 (100.00%) | 2/2 (100.00%) | 1/3 (33.33%) |
| apps/website/src/platform/http/index.ts | LOADED | 0 | 15/15 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/platform/mail/index.ts | LOADED | 0 | 31/31 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/platform/mail/provider-error.ts | LOADED | 0 | 7/7 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/platform/oauth/errors.ts | LOADED | 0 | 34/34 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/platform/observability/index.ts | LOADED | 0 | 72/72 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/platform/observability/report-error.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/platform/routing/index.ts | LOADED | 0 | 10/10 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/platform/server-logs/redact-local-text.ts | LOADED | 0 | 27/27 (100.00%) | 5/9 (55.56%) | 4/4 (100.00%) |
| apps/website/src/platform/site-dir/index.ts | LOADED | 0 | 130/130 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/website/src/platform/site-dir/moves.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/platform/site-dir/nested-sites-root.ts | LOADED | 0 | 63/63 (100.00%) | 20/25 (80.00%) | 10/17 (58.82%) |
| apps/website/src/platform/site-dir/sites-project-references.ts | LOADED | 0 | 61/61 (100.00%) | 23/32 (71.88%) | 15/23 (65.22%) |
| apps/website/src/server/http/request-cookie.ts | LOADED | 0 | 13/13 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/http/entity-not-live.ts | LOADED | 0 | 21/21 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/inbound/admin-http/http/plugins.ts | LOADED | 0 | 12/12 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/content-type.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/server/inbound/admin-http/routes/trash/deps.ts | LOADED | 0 | 46/46 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/server/inbound/assistant/index.ts | LOADED | 0 | 19/19 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/server/inbound/public-http/routes/oauth/callback-page.ts | LOADED | 0 | 146/146 (100.00%) | 4/8 (50.00%) | 3/4 (75.00%) |
| apps/website/src/server/inbound/shared/body-size-limit.ts | LOADED | 0 | 55/55 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/server/runtime/composition/app-permission-grants.ts | LOADED | 0 | 37/37 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/website/src/server/runtime/composition/boot-data-repairs.ts | LOADED | 0 | 45/45 (100.00%) | 3/4 (75.00%) | 2/2 (100.00%) |
| apps/website/src/server/runtime/composition/charts-recharts-source.ts | LOADED | 0 | 138/138 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/server/runtime/composition/commerce-drain.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| apps/website/src/server/runtime/composition/core-extension-claims.ts | LOADED | 0 | 49/49 (100.00%) | 6/6 (100.00%) | 5/5 (100.00%) |
| apps/website/src/server/runtime/composition/data-modules.ts | LOADED | 0 | 9/9 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/website/src/server/runtime/composition/host-signals.ts | LOADED | 0 | 7/7 (100.00%) | 5/5 (100.00%) | 4/5 (80.00%) |
| apps/website/src/server/runtime/configuration/capability-inventory.ts | LOADED | 0 | 372/372 (100.00%) | 3/3 (100.00%) | 2/3 (66.67%) |
| apps/website/src/server/runtime/configuration/seed.ts | LOADED | 0 | 328/328 (100.00%) | 27/28 (96.43%) | 18/19 (94.74%) |
| apps/website/src/server/runtime/lifecycle/daemon-lifecycle-log.ts | LOADED | 0 | 16/16 (100.00%) | 2/2 (100.00%) | 1/2 (50.00%) |
| development/scripts/dev-source-maps-off.mjs | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| development/scripts/dev-tsx-loader.mjs | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| development/sonarjs/policy.mjs | LOADED | 0 | 79/79 (100.00%) | 10/11 (90.91%) | 3/3 (100.00%) |
| development/test-support/agent-plugin-source.mjs | LOADED | 0 | 27/27 (100.00%) | 2/3 (66.67%) | 1/1 (100.00%) |
| eslint.config.mjs | LOADED | 0 | 437/437 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |

## Full never-loaded list

- development/scripts/extraction-dossier.mjs
- development/scripts/test-rigor-inventory.mjs
- apps/website/src/server/inbound/assistant/agent-daemon-scope.ts
- development/scripts/mutation-lanes.mjs
- development/scripts/measure-site-memory.mjs
- development/scripts/dev.mjs
- development/scripts/check-architecture.ts
- development/scripts/coverage-changed.ts
- development/scripts/build-brand-icons.mjs
- development/scripts/lib/dead-path-sweep.ts
- development/scripts/coverage-changed-model.ts
- development/scripts/check-outbox-bridge.ts
- development/evals/tool-search-parent-tool-read.eval.ts
- development/evals/tool-search-argument-fill.eval.ts
- apps/desktop/scripts/verify-find-in-page.ts
- development/scripts/coverage-all-files.ts
- development/scripts/dev-desktop.mjs
- development/scripts/generate-postgres-schema.ts
- development/evals/tool-search-distractors.ts
- development/scripts/mutation-sweep.mjs
- development/scripts/write-path-inventory.ts
- apps/desktop/scripts/verify-site-power.ts
- development/evals/tool-search-parent-tool-delete.eval.ts
- development/scripts/theme-tool.ts
- development/scripts/coverage-changed-discovery.ts
- .claude/skills/tovu-demo-video/scripts/take-example.mjs
- content/themes/__original-themes__/static/tovu-starter/scripts/main.js
- content/themes/__original-themes__/static/tovu-theme/scripts/main.js
- content/themes/static/tovu-starter/scripts/main.js
- content/themes/static/tovu-theme/scripts/main.js
- development/scripts/check-coverage-integrity.ts
- development/scripts/check-jini-registry-drift.mjs
- apps/website/src/index.ts
- development/cloud/quality-1111/cov/scripts/test-quality.mjs
- development/scripts/check-openapi-contract.ts
- development/evals/tool-search-doc2query-adoption.eval.ts
- development/scripts/split-chat-data-into-chat-db.ts
- development/scripts/seed-site.mjs
- development/evals/tool-search-fat-concat-arm.eval.ts
- development/scripts/agent-run-probe.mjs
- development/scripts/migrate-page-embed-markers.ts
- apps/site-chat/src/site-assistant-transport.ts
- development/evals/tool-search-caller2-compliance-harness.ts
- development/scripts/check-idle-motion.ts
- development/scripts/lib/route-tool-parity.ts
- development/evals/tool-search-scaling-curve.eval.ts
- development/evals/tool-search-argument-fill-fixture.ts
- development/evals/tool-search-canary-significance.eval.ts
- apps/website/src/features/plugin-runtime/built-ins/content-analyzer/analyze-content.ts
- apps/website/src/server/inbound/assistant/agent-daemon-server.ts
- development/scripts/check-governance-adr-scope-drift.ts
- development/scripts/check-embed-marker-drift.ts
- apps/website/src/server/runtime/composition/import-database/repo.sqlite.ts
- apps/site-chat/scripts/check-bundle-mounts.mjs
- development/scripts/measure-idle-cpu.mjs
- development/scripts/codex-jini-rebuild.mjs
- development/scripts/check-theme-replaced-elements.ts
- development/scripts/report-churn-hotspots.ts
- apps/website/src/cli/commands/import-local.ts
- development/evals/tool-search-all-approaches-v2.eval.ts
- development/scripts/check-openapi-secret-leaks.ts
- content/themes/__original-themes__/static/tovu-starter/scripts/docs-toc.js
- content/themes/__original-themes__/static/tovu-theme/scripts/docs-toc.js
- content/themes/static/tovu-starter/scripts/docs-toc.js
- content/themes/static/tovu-theme/scripts/docs-toc.js
- apps/website/src/features/mail-status/test-send.ts
- development/scripts/check-hardwiring.mjs
- apps/website/src/server/inbound/assistant/agent-daemon-site-tools.ts
- development/evals/tool-search-heldout-v2.eval.ts
- development/scripts/check-menu-href-allowlist-sync.ts
- development/scripts/deploy-html-snapshot.mjs
- development/scripts/args-object-audit.mjs
- development/scripts/stage-selected-agent-plugin-assets.ts
- development/scripts/check-admin-api-routes.ts
- apps/site-chat/src/visitor-page-control.ts
- development/scripts/check-src-complexity-drift.ts
- development/evals/tool-search-quality.eval.ts
- apps/website/src/features/webhooks/seal-aad-invariant.ts
- development/scripts/backfill-media-slugs.ts
- apps/admin/src/features/plugins/Plugins.tsx
- development/scripts/check-test-baseline.ts
- development/scripts/convert-legacy-doc-pages-to-html.ts
- development/scripts/rewrite-deep-imports.ts
- development/scripts/check-route-coverage-diff.ts
- apps/site-chat/src/vanilla-tool-confirmation.ts
- apps/website/src/server/inbound/assistant/agent-daemon-core-client.ts
- development/cloud/quality-1111/cov/scripts/extract-failures.mjs
- development/scripts/compose-bundled-agent-plugins.mjs
- development/scripts/prepare-start.mjs
- development/scripts/start.mjs
- apps/website/src/features/forms/form-file-maintenance.ts
- development/scripts/check-area-coverage-floor.ts
- development/scripts/diagnose-jini-typecheck-failure.mjs
- development/scripts/emit-dist-package-json.mjs
- development/scripts/backfill-slug-collision-defaults.ts
- development/scripts/backfill-trashed-items.ts
- development/scripts/classify-coverage-gaps.ts
- development/scripts/package-agent-plugin.ts
- ADS-memory/reports/architecture/2026-08-18-ag-ui-sample/backend-agui-adapter.sample.ts
- apps/website/src/features/identity/default-credential-exposure.ts
- development/scripts/ts-escape-metrics.mjs
- development/scripts/cleanup-stale-owner-sessions.ts
- development/scripts/dev-sites-home.mjs
- apps/website/src/features/plugin-runtime/built-ins/content-analyzer/tiptap-blocks.ts
- apps/website/src/server/inbound/assistant/durable-run-routes.ts
- development/scripts/check-route-tool-parity.ts
- apps/site-chat/src/session-store.ts
- development/cloud/quality-1111/cov/scripts/build-coverage-table.mjs
- development/scripts/agent-plugin-activation.ts
- development/evals/tool-search-argument-fill-duplicate.ts
- development/evals/tool-search-hyde-canary.eval.ts
- apps/website/src/platform/site-dir/local-site-child.ts
- development/scripts/quality-semgrep.mjs
- apps/site-chat/src/SiteAssistantActivation.hooks.ts
- apps/website/src/server/inbound/assistant/agent-daemon-idle-park.ts
- development/scripts/link-jini.mjs
- apps/website/src/server/inbound/admin-http/routes/assistant/test-connection.ts
- development/evals/tool-search-doc2query-canary.eval.ts
- development/scripts/lib/admin-route-walk.ts
- development/scripts/check-test-safety-diff.ts
- apps/site-chat/src/SiteAssistantWidget.tsx
- development/evals/tool-search-credential-save.eval.ts
- development/scripts/route-coverage-lib.ts
- apps/website/src/assistant/agent-daemon-port.ts
- content/themes/__original-themes__/static/tovu-starter/scripts/docs-sidebar.js
- content/themes/__original-themes__/static/tovu-theme/scripts/docs-sidebar.js
- content/themes/static/tovu-starter/scripts/docs-sidebar.js
- content/themes/static/tovu-theme/scripts/docs-sidebar.js
- development/scripts/check-admin-complexity-drift.ts
- development/scripts/lib/openapi-operations.ts
- apps/site-chat/src/site-chat-comparison.ts
- apps/website/src/server/inbound/assistant/assistant-runtime-guidance.ts
- apps/website/src/server/inbound/public-http/http/site/liquid-render.ts
- apps/website/src/server/inbound/public-http/http/site/worker-sandbox.ts
- apps/website/src/server/runtime/boot/parent-watchdog.ts
- apps/site-chat/src/vanilla-host.ts
- development/evals/tool-search-hierarchical-canary.eval.ts
- development/scripts/generate-seed-content.ts
- apps/website/src/server/runtime/composition/agent-daemon-core-deps.ts
- cloud/reports/bugs-fixture-write-guard.mjs
- development/scripts/prune-tsx-cache.mjs
- development/scripts/tap-summary.mjs
- .semgrep/tests/provider-errors.ts
- apps/website/src/platform/http/test-origin-allowlist.ts
- development/scripts/lib/openapi-contract-fixtures.ts
- apps/website/src/server/inbound/assistant/agent-daemon-scope-control.ts
- development/evals/tool-search-rerank-ceiling.eval.ts
- development/scripts/check-route-coverage-floor.ts
- apps/desktop/scripts/verify-staged-closure.ts
- apps/site-chat/src/loader-host.ts
- apps/website/src/server/inbound/admin-http/routes/assistant/test-agent.ts
- scripts/forms-maintenance.ts
- apps/desktop/scripts/stage-website-shared.ts
- development/evals/tool-search-argument-fill-adversarial.ts
- development/scripts/build-server.mjs
- development/scripts/repair-site.ts
- development/scripts/unlink-jini.mjs
- apps/website/src/server/inbound/assistant/assistant-system-overlay.ts
- apps/website/src/server/inbound/public-http/http/site/handlebars-render.ts
- development/evals/tool-search-caller2-score-captures.ts
- apps/website/src/assistant/run-active-context.ts
- content/themes/static/tovu-starter/scripts/theme-toggle.js
- development/scripts/dev-lite.mjs
- apps/website/src/assistant/lost-frontend-binding.ts
- apps/admin/vite.config.ts
- apps/site-chat/scripts/measure-bundles.mjs
- development/scripts/lib/tovu-test-server.ts
- ADS-memory/reports/architecture/2026-08-18-ag-ui-sample/frontend-agui-chat.sample.tsx
- development/evals/probe-caps-retrieval.ts
- development/evals/tool-search-eval-registry.ts
- .dependency-cruiser.mjs
- apps/website/src/features/publish-content/ui/publish-order.ts
- apps/site-chat/src/SiteToolConfirmation.hooks.ts
- apps/website/src/server/inbound/assistant/early-run-session.ts
- content/themes/__original-themes__/static/tovu-starter/scripts/theme-toggle.js
- content/themes/__original-themes__/static/tovu-theme/scripts/theme-toggle.js
- content/themes/static/tovu-theme/scripts/theme-toggle.js
- development/scripts/dev-server.mjs
- development/scripts/jini-links.mjs
- apps/website/src/server/inbound/assistant/assistant-run-tool-facts.ts
- apps/website/src/server/inbound/assistant/assistant-tool-consent.ts
- development/evals/tool-search-export-corpus.ts
- development/scripts/check-capability-inventory.ts
- development/scripts/check-immutable-migrations.mjs
- ADS-memory/reports/codex-audit/measure-cognitive.cjs
- .semgrep/tests/no-raw-fetch.ts
- apps/website/src/contracts/core/approval-i18n.ts
- apps/website/src/contracts/core/credential-copy.ts
- development/scripts/prepare-desktop-hooks.mjs
- apps/site-chat/src/main.tsx
- apps/website/src/server/inbound/admin-http/routes/commerce/status.ts
- apps/website/src/server/inbound/assistant/agent-plugin-preflight-events.ts
- apps/website/src/server/runtime/boot/content-db-schema-guard.ts
- development/evals/site-guide-planner.ts
- development/scripts/sites-move-home.ts
- apps/admin/vitest.config.ts
- apps/site-chat/src/tool-confirmation.ts
- apps/website/src/assistant/mcp-injection.ts
- apps/website/src/assistant/rewrap-page-navigate-error.ts
- development/scripts/list-server-test-files.ts
- apps/admin/dev-proxy-upstream-close.ts
- apps/site-chat/src/SiteAssistantHeader.hooks.ts
- apps/website/src/assistant/page-approval-context.ts
- apps/website/src/server/inbound/assistant/plugin-prompt-prefix.ts
- development/scripts/port-listeners.mjs
- development/sonarjs/formatter.mjs
- apps/website/src/features/plugin-runtime/built-ins/content-analyzer/plugin.ts
- apps/website/src/server/inbound/assistant/capability-manifest-prefix.ts
- apps/website/src/server/inbound/assistant/tool-access-lowering-route.ts
- development/scripts/backfill-db-path.ts
- development/scripts/free-port.mjs
- .claude/skills/tovu-demo-video/scripts/make-state.mjs
- apps/desktop/src/renderer/main.tsx
- apps/site-chat/scripts/check-bundle-mounts.d.mts
- apps/desktop/src/speech/preload-speech.cts
- apps/site-chat/src/visitor-site-path.ts
- apps/website/src/assistant/admin-frontend-owner.ts
- apps/website/src/features/plugin-runtime/built-ins/content-analyzer/summary.ts
- apps/website/src/platform/test-home-isolation.ts
- apps/website/src/server/runtime/plugin-tier2/worker.ts
- packages/sdk/src/index.ts
- .semgrep/tests/no-secret-literals-in-tests.ts
- .semgrep/tests/react-component-options-param.tsx
- apps/admin/dev-jini-deps.ts
- apps/site-chat/src/remixicon-override.ts
- apps/site-chat/src/site-chat-i18n.ts
- apps/website/src/assistant/frontend-control-capabilities.ts
- apps/website/src/server/inbound/assistant/run-log-lines.ts
- development/playwright.memory-soak.config.ts
- apps/website/src/assistant/mcp-federation/adapter.memory.ts
- apps/website/src/server/inbound/assistant/federation-reload-route.ts
- apps/website/src/server/inbound/public-http/http/site/form-validation-i18n.ts
- development/playwright.journeys.config.ts
- development/scripts/load-repo-root-env.mjs
- apps/site-chat/src/site-assistant-errors.ts
- apps/website/src/server/inbound/public-http/http/site/handlebars-worker.ts
- development/cloud/quality-1111/cov/scripts/test-safety-all.mjs
- development/scripts/dev-admin-build.ts
- apps/site-chat/scripts/measure-bundles.d.mts
- apps/website/src/features/deployments/deploy-ops/secrets.ts
- apps/website/src/features/webhooks/http.memory.ts
- development/playwright.mobile-visual.config.ts
- development/scripts/lib/secret-patterns.ts
- apps/desktop/vite.config.mts
- apps/site-chat/vite.vanilla.config.ts
- apps/website/src/contracts/core/gated-mutations/watermark.ts
- apps/website/src/features/plugins/migration-journal.ts
- apps/website/src/features/publish-content/ui/index.ts
- apps/website/src/server/inbound/assistant/assistant-filesystem-notices.ts
- apps/website/src/server/inbound/assistant/run-lifecycle-tracing.ts
- development/scripts/mutation-sweep-result.mjs
- .semgrep/tests/no-as-any.ts
- apps/site-chat/src/SiteAssistantHeader.tsx
- apps/site-chat/src/vanilla-entry.ts
- apps/site-chat/vite-public-guard.ts
- apps/site-chat/vite.config.ts
- apps/website/src/features/agent-plugins/memory-tools.ts
- apps/website/src/server/inbound/assistant/federation-admissions-route.ts
- apps/website/src/server/inbound/public-http/http/site/liquid-worker.ts
- development/scripts/site-identity-eslint.config.mjs
- packages/contracts/src/secret-redaction.ts
- apps/site-chat/vite.lazy.config.ts
- apps/website/src/assistant/session-services.ts
- apps/website/src/assistant/tool-catalog-live-query.ts
- apps/website/src/features/analytics/salt.ts
- apps/website/src/server/inbound/assistant/bridge-preflight-entry.ts
- apps/website/src/server/inbound/public-http/http/site/handlebars-sandbox.ts
- apps/website/src/server/inbound/public-http/http/site/liquid-sandbox.ts
- apps/website/src/server/runtime/plugin-tier2/typescript-bootstrap.cjs
- development/cloud/quality-1111/cov/scripts/lcov-abs.mjs
- development/playwright.desktop-journeys.config.ts
- development/playwright.desktop-shell.config.ts
- development/scripts/dev-api-watch.mjs
- apps/admin/dev-tls-disable-flag.ts
- apps/desktop/scripts/clean-preload.ts
- apps/site-chat/src/loader-entry.ts
- apps/website/src/features/media/attachment-tools.ts
- apps/website/src/features/plugins/plugin-identity.ts
- apps/website/src/server/inbound/assistant/ensure-json-agent-install.ts
- apps/website/src/server/runtime/boot/sender-domain-verification.ts
- development/sonarjs/eslint.config.mjs
- development/test-support/composed-bundle-env.ts
- apps/website/src/assistant/prompt-guidance.ts
- apps/website/src/features/agent-plugins/memory-i18n.ts
- apps/website/src/features/newsletter/types.ts
- apps/website/src/features/plugins/disk-headroom.ts
- apps/website/src/features/plugins/plugin-store.ts
- apps/website/src/features/trash/agent-delete-policy.ts
- apps/website/src/server/inbound/assistant/plugin-prompt-assembly.ts
- development/scripts/dev-sites-home.d.mts
- development/scripts/free-port.d.mts
- development/scripts/local-dev-plugin-install.mjs
- development/scripts/test-safety-eslint.config.mjs
- apps/website/src/assistant/durable-runs/continuation.ts
- apps/website/src/contracts/core/admin-locales.ts
- apps/website/src/contracts/core/commands/repo.memory.ts
- apps/website/src/contracts/core/commands/revert.ts
- apps/website/src/contracts/core/secret-redaction.ts
- apps/website/src/features/api-connections/hook-http.ts
- apps/website/src/features/content-types/repo.memory.ts
- apps/website/src/features/custom-credentials/sets/store.ts
- apps/website/src/features/custom-credentials/sets/vault-repo.ts
- apps/website/src/features/database/boot/evaluate-boot-migration-policy.ts
- apps/website/src/features/external-mcp/contracts.ts
- apps/website/src/features/external-mcp/external-mcp-shared-oauth.ts
- apps/website/src/features/navigation/html-render.ts
- apps/website/src/features/plugins/restore.ts
- apps/website/src/features/post/author.ts
- apps/website/src/features/recovery/restore-points.ts
- apps/website/src/features/taxonomy/html-render.ts
- apps/website/src/features/tool-audit/types.ts
- apps/website/src/features/web/html-document.ts
- apps/website/src/features/web/html-to-markdown.ts
- apps/website/src/platform/oauth/index.ts
- apps/website/src/server/runtime/boot/plugin-sdk-resolver.ts
- development/evals/tool-search-caller2-compliance-captures-2026-08-05.ts
- development/evals/tool-search-caller2-compliance-captures-2026-09-08.ts
- development/evals/tool-search-distractors-doc2query-calibration-250.ts
- development/evals/tool-search-heldout-v2.ts
- development/evals/tool-search-hyde-blind-expansions.ts
- development/evals/tool-search-hyde-prompt-expansions-v2.ts
- development/evals/tool-search-hyde-prompt-expansions.ts
- development/scripts/test-safety-eslint.config.d.mts
- development/test-support/agent-plugin-source.d.mts
- packages/contracts/src/admin-failure-copy.ts
- packages/contracts/src/admin-locales.ts
- packages/contracts/src/site-share-limits.ts
- packages/sdk/src/hooks.ts

## Unmatched coverage records

- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/core/persistent-state.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/action-dispatcher.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/action-schema.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/action-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/callback-field-inbox.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/capability-declarations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/connections/connections.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/connections/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/contribution.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/delivery-bindings.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/descriptor.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/external-links.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/host-validator.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/plugin-state.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/protocol.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/sandbox.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/settings-value.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/surface-capabilities.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/surface-handlers.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/admin-surfaces/theme.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/access-token-tool.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/apply-connect-defaults.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/apply-tool-renames.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/connect-card-ui.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/connect-destination.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/connect-sign-in-wait.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/connect-tool.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/connection-status.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/credential-cards.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/credential-save-tool.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/enable-access.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/executable/approval.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/executable/host-capabilities.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/executable/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/executable/register.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/federate-mcp.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/grant-signed-in-defaults.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/import-access-token.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/plugin-credential-card.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/plugin-host/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/switch-on-saved-token.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/connect/token-sign-in.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/contracts/admin-surface-action-schema.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/core/identity-namespace.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/core/plugin-name.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/folder-zip-node.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/folder-zip.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/activation-reader.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/activation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/automatic-use.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/bundled-digests.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/bundled-file-policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/bundled-source-archive.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/capability-projection.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/compatibility-metadata.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/compatibility.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/contribution-loader.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/credential-card-metadata.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/enable-grants.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/exports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/fetch-archive.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/host-tools/identity.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/host-tools/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/host-tools/memory-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/host-tools/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/host-tools/provider-status-tool.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/host-tools/search-tool.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/host-tools/skill-tool.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/host-tools/write-note-tool.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/install-errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/install-from-url.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/install.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/installed-package-index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/installed-package-roots.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/layout.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/mail/adapter-descriptors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/mail/catalog.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/mail/configuration.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/mail/contribution.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/mail/host-mailer.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/mail/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/mail/selection.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/manifest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/mcp-provisioning.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/metadata.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/node.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/package-paths.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/persistent-state.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/provider-contribution.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/resolve-agent-plugin-refs.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/retire-bundled.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/search-projection.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/search.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/seed-bundled.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/set-enabled.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/skill-file-reader.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/tools/capabilities.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/tools/definition.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/tools/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/tools/manifest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/tools/projection.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/trusted-plugin-files.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/uninstall.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/update-plan.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/update-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/update.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/lifecycle/yauzl-archive-reader.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/dist/manifest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-plugins/persistent-state.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/acp-model-probe.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/acp/account-failure.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/acp/constants.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/acp/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/acp/json.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/acp/models.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/acp/rpc.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/acp/session-params.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/acp/session.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/acp/text-suppression.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/acp/updates.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/core/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/core/json-line-stream.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/pi-rpc/events.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/pi-rpc/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/pi-rpc/internal.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/pi-rpc/models.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/agent-protocol/pi-rpc/session.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/ai-trace/capture.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/ai-trace/classify.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/ai-trace/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/ai-trace/recorder.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/ai-trace/sinks.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/ai-trace/usage.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/amr-model-cache.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/amr-profile-resolver.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/anthropic-live-models.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/artifact-taxonomy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/auth.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/capabilities.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/claude-code-models.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/claude-filesystem-policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/claude-segment-usage.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/claude-stream.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/core/bounded-line-stream.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/core/model-discovery-shared.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/core/omit-keys.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/aider.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/amp.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/amr.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/antigravity/event-stream.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/antigravity/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/auggie.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/claude-compatible-args.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/claude.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/cline.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/codebuddy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/codex.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/crush.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/cursor-agent.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/deepseek.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/devin.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/droid.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/goose.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/grok-build.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/hermes.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/kilo.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/kimi.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/kiro.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/mimo.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/opencode.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/pi.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/qoder.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/qwen.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/reasonix.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/shared.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/trae-cli.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/defs/vibe.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/detection.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/diagnostics.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/env.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/executables.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/invocation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/json-event-stream.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/launch.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/log-file.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/mcp.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/metadata.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/mmd-routes.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/model-catalog-cache.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/model-discovery-adapters.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/model-discovery-config.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/model-discovery-native.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/model-discovery-sdk.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/model-discovery-shared.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/model-discovery-yaml.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/model-discovery.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/model-loading-state.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/model-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/models.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/native-runtime.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/native-tool-policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/opencode-log.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/paths.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/pi-models.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/probe-scheduler.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/prompt-augmenter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/prompt-budget.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/prompt-file.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/aihubmix.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/anthropic-messages.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/azure-chat.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/connection-guard.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/elevenlabs.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/google-messages.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/google-schema.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/google.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/model-catalog.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/oauth-callback-server.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/oauth-credentials.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/oauth-provider.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/oauth-tokens.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/ollama-chat.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/openai-chat.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/operation-schema.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/pkce.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/response-text.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/sse-decode.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/token-params.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/tool-loop-verdict.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/tool-turn.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/turn-end-guard.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/providers/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/qoder-stream.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/resolution.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/role-marker-guard.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/runtime-state.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/telemetry-sink.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/terminal-launch.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agent-runtime/dist/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/agent-to-renderer.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/catalog.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/common-types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/interpreter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/json-pointer.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/renderer-to-agent.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/resolve.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/surface-properties.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/tree.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/ag-ui.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/annotated-actions-script.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/capability.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/element-handles.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/gen-ui/encoder.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/gen-ui/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/guards.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/handle.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/list-handles.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/mcp-ui-apps.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/messages.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/omit-keys.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/page-capabilities.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/page-executor.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/page-navigation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/page-publication.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/site-guide/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/site-guide/site-guide.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/site-guide/topic-schema.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/site-guide/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/core/webmcp.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/skills/install/archive.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/skills/install/fetch-adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/skills/install/github.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/skills/install/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/skills/install/install-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/skills/install/layout.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/skills/install/live-registration.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/skills/install/node-filesystem.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/skills/install/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/skills/install/state.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/skills/install/unsafe-chars.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/skills/install/validation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/agentic/dist/skills/install/yauzl-archive-reader.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/analytics/dist/forwarding.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/analytics/dist/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/analytics/dist/ingest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/analytics/dist/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/analytics/dist/privacy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/analytics/dist/product/ai-generations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/analytics/dist/product/browser.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/analytics/dist/product/fanout.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/analytics/dist/product/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/analytics/dist/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/analytics/dist/salt.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/analytics/dist/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/capability-providers/dist/comments/definitions.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/capability-providers/dist/comments/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/capability-providers/dist/comments/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/capability-providers/dist/comments/registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/capability-providers/dist/comments/tokens.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/contracts/chat-bubble-style.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/accepted-input.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/ag-ui/entry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/agentic/chat-capabilities.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/agentic/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/antigravity/tool-presentation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/assistant-content.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/checkpoint-interval.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/compact-events.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/composer-history.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/conversation-title.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/durable-projection.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/durable-runs/continuation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/durable-runs/policies.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/durable-runs/run-lock.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/events.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/history-tool-metadata.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/messages.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/partial-json.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/persistence/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/persistence/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/persistence/title.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/question-answer.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/question-form.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/question-form/format.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/question-form/normalize.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/question-form/scan.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/question-form/secret-answers.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/run-activity.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/run-events/entry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/surface-expiry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/surface-recovery.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/todos.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/tool-call-detail.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/tool-events.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/tool-output.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/tool-presentation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/transcript.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/transport.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/turn-usage.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/usage-format.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/user-text-redaction.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/util/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/util/manifest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/util/markdown-context.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/util/markup-attributes.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/util/parser.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/util/pointer.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/util/recover.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/util/strip.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/util/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/core/util/validate.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/embed-widget/browser/lazy-loader.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/server/durable-runs/accept.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/server/durable-runs/entry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/server/durable-runs/recover.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/pglite/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/postgres/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/runtime/chat-expiry-sweep.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/runtime/chat-history-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/runtime/checkpoint-delta.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/runtime/durable-run-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/runtime/entry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/runtime/events-json.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/runtime/history-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/runtime/run-guarded-chat-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/runtime/run-ledger.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/sql/boundary.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/sql/cursor.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/sql/maintenance.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/sql/read-version.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/sql/store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/sqlite/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/chat/dist/store/sqlite/schema.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cli/dist/command-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cli/dist/daemon-command.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cli/dist/daemon-url.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cli/dist/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cli/dist/flags.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cli/dist/http.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cli/dist/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cli/dist/introspection.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cli/dist/local-daemon-discovery.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cli/dist/prompt.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cli/dist/redact.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cli/dist/run-command.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cli/dist/tokens.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cli/dist/usage.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cli/dist/version-command.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/comments/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/comments/express/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/comments/express/submit-handler.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/comments/hooks.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/comments/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/comments/ingress.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/comments/module.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/comments/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/comments/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/comments/sanitize.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/comments/spam.heuristic.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/comments/sql/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/comments/sql/repo.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/comments/sql/repo.rows.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/comments/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/comments/write-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/content-types/agent-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/content-types/cleanup.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/content-types/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/content-types/field-defs.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/content-types/index-provisioning.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/content-types/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/content-types/lifecycle-dispatch.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/content-types/lifecycle.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/content-types/list.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/content-types/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/content-types/tool-registrations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/content-types/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/content-types/write-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/contracts/consent-category.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/core/commands/appliers.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/core/commands/command.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/core/commands/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/core/commands/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/core/commands/revert.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/core/entity-liveness.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/core/form-collection.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/core/form-schema.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/core/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/core/keyset-cursor.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/core/tools/args.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/core/tools/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/core/transform-format.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/entries/agent-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/entries/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/entries/field-validation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/entries/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/entries/lifecycle-dispatch.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/entries/list.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/entries/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/entries/tool-registrations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/entries/write-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/attachment-cleanup.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/attachment-purge.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/delete-submission.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/delivery/deliver-job.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/delivery/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/delivery/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/delivery/planner.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/delivery/pull-lease.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/delivery/pull-trigger.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/delivery/retry-policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/delivery/status.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/delivery/subscriptions.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/delivery/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/descriptor-rules.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/destination-contracts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/destination-descriptors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/duplicate-slug.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/email-format.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/express/handler.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/express/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/field-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/fields-json.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/forms.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/html-render.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/html/authoring-adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/html/html-authoring.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/html/html-submission-adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/html/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/html/retry-draft.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/notify-subscriber.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/portable-validation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/provider.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/rate-limit-key.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/reconcile-attachments.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/request-admission.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/sql/create-tables.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/sql/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/sql/repo.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/sql/repo.rows.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/sql/submission-ip-retention-repo.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/sql/tables.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/stale-form.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/submission-attempts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/submission-email-validation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/submission-evidence.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/submission-ip-retention.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/submission-json.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/submit-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/forms/write-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/listing/batch.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/listing/html.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/listing/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/listing/paging.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/listing/paths.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/listing/see-more-script.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/agent-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/blob-gc-lock.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/blob-gc.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/blob-key.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/blob-store.fs.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/blob-store.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/blob-store.object-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/content-type-sniffer.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/created-by.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/document-ingress.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/document-read.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/document-text.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/file-extension.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/html-attributes.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/image-transformer.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/image-transformer.sharp.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/import/fetch-image.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/import/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/import/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/list-page.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/media-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/node.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/plugins/document-text/mammoth.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/plugins/document-text/optional-module.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/plugins/document-text/unpdf.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/provenance.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/rendition-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/replace-media-file.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/sanitize-svg.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/slug.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/tool-registrations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/transform-lock.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/transform-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/transform-types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/video-frames.ffmpeg.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/media/video-frames.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/navigation/agent-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/navigation/contracts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/navigation/dropdown.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/navigation/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/navigation/link-rel.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/navigation/menu-html.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/navigation/menu-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/navigation/node/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/navigation/read-model.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/navigation/reconcile.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/navigation/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/navigation/resolver.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/navigation/tool-registrations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/navigation/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/presentation/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/presentation/presentation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/presentation/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/capture.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/hit-sink.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/matcher.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/order.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/path-key.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/ports.internal.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/redirects.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/referrer-alias.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/reserved-destination.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/resolver.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/sql/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/sql/repo.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/sql/repo.rows.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/target-gate.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/redirects/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/routing/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/routing/routing.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/seo/absolute-url.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/seo/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/seo/feed.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/seo/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/seo/media.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/seo/page-head.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/seo/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/seo/seo.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/seo/sitemap.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/seo/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/seo/write-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/seo/xml-escape.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/taxonomy/agent-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/taxonomy/content-lookup.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/taxonomy/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/taxonomy/list.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/taxonomy/merge-term.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/taxonomy/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/taxonomy/validation-chain.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/taxonomy/write-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/trash/adapters/record-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/trash/cursor.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/trash/follow-ups.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/trash/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/trash/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/trash/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/trash/sweeper.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/trash/write-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/authorize-helper.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/concurrency.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/config-validation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/date-label.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/embed-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/embed-validation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/entry-payload.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/gallery-resolver.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/host-ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/html/gallery-render.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/html/html-embeds.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/html/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/html/legacy-widget-markers.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/html/plugin-export.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/html/resolve-html-page-embeds.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/html/server-fragment.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/markers/gallery.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/markers/html-attributes.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/markers/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/markers/marker.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/markers/media-reference.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/page-embed-types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/read-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/region-area-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/resolver-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/resolvers/contact-form.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/resolvers/create-core-resolvers.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/resolvers/gallery.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/resolvers/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/resolvers/menu.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/resolvers/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/resolvers/recent-entries.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/resolvers/taxonomy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/sql/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/sql/repo.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/sql/tables.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/where-used.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/widgets/write-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/workspace/agent-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/workspace/create.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/workspace/delete.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/workspace/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/workspace/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/workspace/tool-registrations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cms/dist/workspace/update.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/browser/checkout.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/buyer-order.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/checkout.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/contracts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/load-payable-order.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/merchant-drain.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/order-projection.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/pay-order.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/plugin-server.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/repo.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/repo.order-payments.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/repo.price-refs.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/repo.rows.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/repo.storefront.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/settle-order-payment.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/status.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/storefront.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/catalog/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/core/tool-input.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/http/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/http/payments-webhook.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/money/money.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/accounting/apply-evidence.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/accounting/plan-evidence.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/contract/alerts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/contract/evidence.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/contract/payments-port.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/contract/provider.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/contract/risk.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/contract/scope.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/contract/tokens.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ingest/outbox-relay.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ingest/receive.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ingest/settlement-worker.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ingest/worker.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/kernel.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ledger/migrations/0001_payments_ledger.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ledger/migrations/0002_payments_operator_actions.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ledger/migrations/0004_payments_attempt_recovery.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ledger/migrations/0005_payments_intent_replay.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ledger/migrations/checksums.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ledger/migrations/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ledger/repo.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ledger/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ledger/repo.sql.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ledger/rows.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ledger/sql.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ops/capture-void.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ops/common.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ops/deps.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ops/grants.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ops/intent-recovery.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ops/intent.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ops/operator.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ops/reconcile-attempts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ops/reconcile-snapshot.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ops/reconciler.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ops/refund.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ops/service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/ops/view.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/provider-contexts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/provider-contract.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/provider-module-guard.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/provider-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/state/status.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/tools/catalog.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/tools/deps.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/tools/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/tools/input.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/tools/money-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/tools/read-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/payments/tools/resolve-unknown.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/commerce/dist/tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cookie-consent/dist/contract.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cookie-consent/dist/contracts/consent-file.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cookie-consent/dist/contracts/plugins.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cookie-consent/dist/contracts/policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cookie-consent/dist/contracts/scripts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cookie-consent/dist/node/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cookie-consent/dist/plugins.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cookie-consent/dist/policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cookie-consent/dist/render/banner.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cookie-consent/dist/render/base-css.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cookie-consent/dist/render/css-parser.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cookie-consent/dist/render/css.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cookie-consent/dist/render/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cookie-consent/dist/render/scripts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cookie-consent/dist/server/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cookie-consent/dist/server/receipt.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/cookie-consent/dist/server/region.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/api-token-auth.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/approval.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/batch-tool-inputs.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/bindings.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/composition.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/contracts/hosted-mcp.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/contribution-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/daemon.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/feature-flags.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/filesystem.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/gated-mutations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/gated-mutations/actor-identity.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/gated-mutations/gateway.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/gated-mutations/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/gated-mutations/token.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/model-facing-tool-errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/naming.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/native-regexp.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/object-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/optional-peer.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/origin-validation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/pack-lifecycle.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/pack.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/primitives/http.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/primitives/ids.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/primitives/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/primitives/json.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/primitives/logger.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/primitives/paths.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/primitives/result.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/primitives/sse.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/primitives/tasks.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/primitives/time.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/primitives/trim-chars.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/principal.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/provider-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/records.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/redact.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/registration-kit.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/agent-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/agent-value-write-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/agent-writable-preferences.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/agent-write-denylist.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/change-feed.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/definitions-dispatch.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.ar.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.bn.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.de.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.es.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.fa.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.fr.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.hi.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.hu.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.id.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.it.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.ja.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.ko.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.pl.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.pt-BR.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.ru.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.th.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.tr.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.uk.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.ur.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.zh-CN.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/dictionaries/settings-dialog.zh-TW.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/ensure-definitions.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/express/cms-adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/express/http-request.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/express/http.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/express/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/express/shared.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/express/stream.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/purge-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/settings.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/tool-registrations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/ui-tab-definitions.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/settings/write-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/surface-exchanges.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/target-scope.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/teardown.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/text/descriptor-i18n.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/text/escape.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/text/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/text/line-tail.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/text/sanitize-untrusted-text.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/token.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/tool-exposure.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/tool-input-envelope.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/tool-input-errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/tool-input-normalization.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/tool-metadata.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/tool-permissions.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/tool-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/tool-tokens.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/dist/user-facing-error.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/core/plugin-directory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/agent-env.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/antigravity-permissions.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/claude/mcp-config.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/claude/subagent-start.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/codex/home-config.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/codex/home-staging.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/codex/isolation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/contracts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/event-translation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/events.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/gemini/tool-calls.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/handoff.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/http-mcp.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/launch.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/live-session-state.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/mcp-bridge-probe.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/mcp-bridge.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/message-relay.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/model-receipts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/opencode/mcp-config.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/opencode/tool-calls.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/run-output.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/sanitized-line-stream.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/tool-call-receipts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/agent-executor/values.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/ai-trace-lifecycle.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/attachment-content.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/close-status.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/continuation/continuation-transport.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/continuation/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/continuation/journal.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/continuation/run-scoped-context-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/continuation/run-start-handler.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/core/omit-keys.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/core/read-only-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/core/tool-audit.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/core/tool-candidates.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/core/tool-gaps.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/delegated-result-correlation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/delegated-tool-bridge.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/event-log.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/frontend-capability-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/frontend-session-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/active-context.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/agents.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/attachment-lookup-routes.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/attachments.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/cancel-owned-runs.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/component-catalog.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/connectors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/daemon-status.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/db-ops.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/delegated-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/frontend-control.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/frontend-guest-scope.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/frontend-request-route.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/frontend-sessions.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/health.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/host-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/media.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/message-relay.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/model-proxy-fields.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/model-proxy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/remote-run-events.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/research-tavily.adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/research.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/resource-request.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/route-manifest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/routines.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/run-credentials.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/runs.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/surface-callback.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/surface-restoration.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/terminals.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/tool-catalog.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/tool-execution-routes.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/workspace-root.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/http/xai.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/idle-monitor.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/image-prompt-delivery.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/legacy-data-migration.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/read-only-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/remote-attachment-lookup.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/remote-tool-bridge.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/remote-tool-executor.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/routines/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/routines/routine-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/routines/schedule.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/routines/scheduler.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/routines/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/routing-tool-executor.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/run-credentials.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/run-lifecycle.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/run-tool-consent.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/run/core/failure-taxonomy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/run/core/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/run/core/result.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/run/core/retry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/run/diagnostics/diagnostics.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/run/diagnostics/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/run/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/scheduler.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/session-coordination.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/store/agent-sessions/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/store/agent-sessions/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/store/agent-sessions/pglite.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/store/agent-sessions/postgres.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/store/agent-sessions/schema.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/store/agent-sessions/sql.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/store/agent-sessions/sqlite.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/surface-exchanges.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/surface-restoration.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/terminal-session.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/tokens.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/tool-access-lowering.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/tool-audit.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/tool-executor.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/tool-recovery/analytics.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/tool-recovery/diagnostics.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/tool-recovery/federated-refusal.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/tool-recovery/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/tool-recovery/observability.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/tool-recovery/recovery.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/tool-recovery/redaction.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/tool-recovery/stack.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/tool-recovery/surface-lifetime.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/tool-result-diagnostics.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/tool-result-media.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/daemon/dist/tool-result-surfaces.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/core/artifact-naming.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/core/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/core/messages.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/core/pg-types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/core/row-values.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/core/socket.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/data-modules/data-module.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/data-modules/disk-headroom.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/data-modules/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/data-modules/migration-journal.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/data-modules/migration-recovery.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/data-modules/plugin-identity.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/data-modules/plugin-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/data-modules/restore.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/data-modules/snapshot.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/dialect.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/kernel-core.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/ops.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/owned-transaction.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/pglite/dialect.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/pglite/driver.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/pglite/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/pglite/ops.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/port.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/postgres-lock.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/postgres/driver.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/postgres/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/postgres/ops.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/postgres/pglite-socket.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/schema-scope.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/schema-shape.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/session-lock.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/sqlite/driver.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/sqlite/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/sqlite/ops.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/store-copy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/turn-lock.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/kernel/typegen.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/migrate/checksum.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/migrate/ddl.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/migrate/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/migrate/legacy-ledger.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/migrate/runner.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/migrate/step.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/pglite/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/pglite/owner.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/pglite/socket-server.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/recovery/deep-link.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/recovery/degraded-banners.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/recovery/disclosure.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/recovery/lookup-adapters.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/recovery/migrate-forward-execute.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/recovery/migrate-forward-hooks.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/recovery/operation-lock.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/recovery/reconcile-interrupted-migration.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/recovery/recovery-orchestrator.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/recovery/restore-hooks.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/secrets-vault/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/secrets-vault/repo.sql.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/sqlite/backup-policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/sqlite/checked-client.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/sqlite/checked-state.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/sqlite/db-ops.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/sqlite/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/sqlite/inspect.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/sqlite/open.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/sqlite/transaction.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/tools/database-catalog.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/tools/destination-port.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/tools/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/tools/plan-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/tools/read-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/tools/registration.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/tools/restore-points.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/tools/timeline.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/tools/transfer-catalog.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/tools/transfer-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/transfer/copy-engine.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/transfer/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/transfer/internal-ddl.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/transfer/plan.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/transfer/postgres-ddl.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/transfer/postgres-target.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/transfer/signals.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/transfer/sqlite-source.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/transfer/table-catalog.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/db/dist/transfer/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/bridge.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/config.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/create-electron-desktop-host.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/electron-process-memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/electron-protocol.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/electron-render-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/electron-shell.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/electron-single-instance.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/electron-surfaces.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/electron-url-capture.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/electron-window-lifecycle.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/navigation-policy/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/navigation-policy/webview-guest-policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/navigation-policy/window-navigation-policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/render-window.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/testing.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/updates/auto-update-controller.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/updates/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/updates/instance-presence.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/updates/update-policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/usability/find-in-page-ipc.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/usability/find-menu.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/usability/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/usability/spellcheck-menu.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/usability/window-bounds-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/usability/zoom-menu.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/logging.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/node-toolchain/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/node-toolchain/install-location.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/paths.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/protocol.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/render-bridge.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/render-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/shell.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/shutdown/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/shutdown/quit-drain-gate.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/shutdown/quit-signals.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/shutdown/shutdown-tracker.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/sidecar.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/single-instance.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/speech/channels.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/speech/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/speech/macos/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/speech/macos/mac-on-device-transcriber.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/speech/pcm-wav-encoder.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/speech/speech-bridge.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/speech/speech-ipc.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/speech/transcription-port.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/tokens.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/url-capture.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/window-lifecycle.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/desktop-host/dist/windows-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/checks/coverage/diff.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/checks/coverage/disk.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/checks/coverage/floors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/checks/coverage/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/checks/coverage/integrity.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/checks/coverage/lcov.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/core/deploy-types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/core/export-failure-summary.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/core/redirect-guard.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/config-contracts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/config-descriptors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/host-kit.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/naming.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/node.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/ops-contracts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/ops-descriptors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/ops-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/ops-runner.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/ops-secret-card.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/ops-secrets.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/ops-tool-contracts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/ops-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/publish-jobs.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/reachability.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/target-contracts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/target-descriptors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/tokens.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/deploy/tool.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/dns/approval.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/dns/contract.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/dns/delegation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/dns/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/dns/manual.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/dns/node/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/dns/node/resolver.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/dns/node/udp.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/dns/node/wire.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/dns/plan.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/dns/records.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/dns/registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/dns/spf.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/dns/verify.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/local-dev/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/local-dev/node-runtime.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/local-dev/server-retirement.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/local-dev/source-tree-stamp.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/packaging/electron/archive.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/packaging/electron/asar-adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/packaging/electron/entry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/packaging/electron/imports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/packaging/electron/node.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/packaging/electron/optional-peers.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/packaging/electron/policies.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/packaging/electron/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/packaging/electron/stability.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/packaging/electron/staged-closure-node.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/packaging/electron/staged-closure.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/packaging/electron/staging.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/packaging/electron/typescript.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/source-control/commit.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/source-control/contracts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/source-control/entry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/source-control/kit.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/source-control/registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/source-control/repository-path.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/source-control/repository-target.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/static-export/contracts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/static-export/css-urls.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/static-export/entry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/static-export/fetch-adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/static-export/html-url-locations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/static-export/node-adapters.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/static-export/runner.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/dist/static-export/transforms.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/src/packaging/electron/archive.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/src/packaging/electron/asar-adapter.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/src/packaging/electron/entry.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/src/packaging/electron/imports.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/src/packaging/electron/node.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/src/packaging/electron/optional-peers.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/src/packaging/electron/policies.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/src/packaging/electron/ports.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/src/packaging/electron/stability.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/src/packaging/electron/staged-closure-node.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/src/packaging/electron/staged-closure.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/src/packaging/electron/staging.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/devops/src/packaging/electron/typescript.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/agent-logs.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/contract.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/core/secrets-only.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/discovery-filesystem.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/domain-dns/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/manifest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/memory-growth.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/node-ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/observability/config.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/observability/delivery.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/observability/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/observability/export-policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/observability/fanout.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/observability/hooks.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/observability/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/observability/instrumentation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/observability/node.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/observability/noop.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/observability/otel.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/observability/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/observability/report-error.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/observability/tracker-noop.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/observability/tracker.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/redaction.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/redaction/secrets-only.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/sources.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/web-evidence/browser-port.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/web-evidence/collect-page-evidence.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/web-evidence/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/web-evidence/lazy-browser.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/web-evidence/page-performance-script.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/web-evidence/page-structure-script.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/web-evidence/page-work-budget.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/web-evidence/playwright-browser.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/web-evidence/playwright-runtime.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/web-evidence/public-page.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/web-evidence/render-page.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/web-evidence/request-guard.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/web-evidence/same-origin.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/diagnostics/dist/zip.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/api-security-middleware.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/compat.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/html-response.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/local-daemon-request.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/middleware.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/observability.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/origin.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/pack-http.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/rate-limit.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/raw-sse.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/request.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/response.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/route-registration-guard.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/sse.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/verified-origin.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/verified-origin/configured-origin.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/verified-origin/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/verified-origin/loopback-host.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/verified-origin/origin.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/verified-origin/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/verified-origin/site-path.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/http-kit/dist/verified-origin/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/infra/dist/events/outbox/drainer.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/infra/dist/events/outbox/enqueue-only.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/infra/dist/events/outbox/fenced-conformance.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/infra/dist/events/outbox/in-memory-fenced.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/infra/dist/events/outbox/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/infra/dist/events/outbox/node-scheduler.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/infra/dist/events/outbox/policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/infra/dist/events/outbox/request-digest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/infra/dist/events/outbox/worker.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/access-token.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/account-actions.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/attempt-state.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/authorization.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/budgets.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/byo-client.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/connect.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/declarations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/deps.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/descriptor.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/finish-authorization.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/hook-http.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/host.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/hosted-mcp/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/hosted-mcp/shared-sign-in.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/hosted-mcp/sign-in.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/hosted-sign-in.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/install-credential.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/keys.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/records.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/request-checks.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/shared.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/status.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/token-store/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/token-store/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/token-store/record.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/api-connections/token-store/vault-token-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/args.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/argument-error.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/contracts/credentialed-request-errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/credentialed-http/auth-schemes.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/credentialed-http/credentialed-request.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/credentialed-http/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/credentialed-http/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/credentialed-http/response-redaction.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/credentialed-http/sets/host.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/credentialed-http/sets/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/credentialed-http/sets/store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/credentialed-http/sets/vault-repo.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/credentialed-http/tools/credential-copy-tool.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/credentialed-http/tools/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/credentialed-http/tools/tool-registrations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/capability-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/catalog.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/async-operation-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/builtin-vendors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/context.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/credentials.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/engine.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/media-provider-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/openai-compatible.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/operation-runtime.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/outbound.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/polling-adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/providers/aihubmix-shared.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/providers/aihubmix.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/providers/custom-image.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/providers/elevenlabs.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/providers/fishaudio.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/providers/grok.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/providers/imagerouter-video-async.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/providers/imagerouter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/providers/minimax.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/providers/nanobanana.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/providers/openai.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/providers/openrouter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/providers/senseaudio.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/providers/volcengine.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/response-parsers.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/sqlite-async-operation-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/ssrf-guard.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/stub.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/vendor-adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/vendor-registry-core.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/dispatch/vendor-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/providers.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/seed.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/sqlite-driver.adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/sqlite-task-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/staging.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/task-lifecycle.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/task-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/tokens.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/ui-defaults.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/media-providers/video-request.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/webhooks/delivery.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/webhooks/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/webhooks/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/webhooks/signing.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/webhooks/signing.keyring.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/webhooks/subscriptions.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/webhooks/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/integrations/dist/webhooks/worker.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/agent-install/chrome-devtools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/agent-install/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/agent-install/install.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/agent-install/owned-json-install.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/client/client.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/client/css-url-refs.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/client/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/core/config.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/core/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/core/install-info.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/core/tokens.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/adapter.http.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/approvals/call-confirmation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/approvals/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/approvals/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/approvals/remembered-approval.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/approvals/revocation-reason.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/approvals/revocation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/approvals/scope-option.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/bootstrap.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/config.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/frozen-grants.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/hosted/access.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/hosted/auth.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/hosted/connection-gate.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/hosted/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/hosted/projections.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/hosted/revocation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/hosted/store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/hosted/store.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/hosted/unconfigured-error.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/hosted/validation-error.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/hosted/vault.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/hosted/vocabulary.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/mcp-protocol.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/messages.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/presets.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/refusal-notice.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/registrations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/reload.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/result-secrets.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/stdio/adapter.stdio.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/stdio/default-connect.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/stdio/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/stdio/stdio-launch-resolver.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/testing/adapter.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/testing/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/testing/tool-approvals.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/tool-approvals.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/federation/trust.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/adapters/protocol.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/adapters/stdio-codec.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/daemon-client.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/http-tool-server.adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/message-relay.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/resource-protocol.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/resources/active-resource.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/resources/site-guide-resource.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/run-tool-host.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/schema-ref-scope.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/sdk-transport.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/stdio-hosting.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/tool-arguments.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/tool-protocol.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/tool-result-pages.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/tool-server.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/tools/component-catalog-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/tools/delegated-tool.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/tools/run-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/tools/tool-catalog-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/server/tools/wait.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/tools/ask-choice/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/tools/ask-choice/pending.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/tools/ask-choice/question.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/mcp/dist/tools/ask-choice/schema.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/authorization-code.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/bounded-json.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/device-code.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/discovery-policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/discovery.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/dns-pinned-transport.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/endpoint-safety.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/file-registration-cache.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/flow-operations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/guarded-transport.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/loopback-callback.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/loopback-receiver.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/messages.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/node-file-cache.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/oidc.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/options.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/pending-authorizations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/pkce.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/protocol-error-codes.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/redact.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/refresh.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/registration-cache.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/registration.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/resource.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/revocation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/sealed-state.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/oauth/dist/token-endpoint.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/asset-cache.adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/asset-cache.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/aws-sigv4.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/blob-storage.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/child-environment.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/command.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/core/effective-port.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/download.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fetch-with-timeout.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/atomic-write.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/backup-once.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/boot-identity.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/directory-home.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/directory-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/directory-running-lock.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/directory-sync.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/directory-user-config.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/directory-workspace.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/durable-json.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/env-text.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/errno.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/file-lock.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/guarded-reader.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/reviewed-file.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/strict-containment.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/user-data-directories.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/verified-directory-move.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/verified-file-relocation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/fs/workspace-directory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/home-expansion.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/http.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/http/guarded/client.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/http/guarded/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/http/guarded/fetch-adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/http/guarded/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/http/guarded/node-ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/http/guarded/transport.fetch.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/http/multipart.adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/adapter-module.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/builtin-providers.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/delivery-availability.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/delivery-wrapper.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/domain-read.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/email-sender-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/email-sender.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/feedback.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/mail-status-cache.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/plugin-abi.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/prepare-sender-email.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/provider-error.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/provider-mailer.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/provider-setup.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/provider.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/purpose-scoped-mailer.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/rate-limit.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/resolve-mailer.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/sender-domain-verification.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/sender-identity.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/senders.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/mail/smtp.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/messages.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/net/address.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/net/endpoint-policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/net/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/net/local-http-probe.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/net/local-http-request.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/object-store/descriptors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/object-store/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/object-store/local-fs.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/process.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/proxy-env.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/resource-paths.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/sandbox-env.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/secrets/aad.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/secrets/credential-sets/contracts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/secrets/credential-sets/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/secrets/credential-sets/provider-matches.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/secrets/credential-sets/vault-archive.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/secrets/credential-sets/vault.aad.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/secrets/credential-sets/vault.meta.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/secrets/credential-sets/vault.repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/secrets/credential-sets/vault.service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/secrets/credential-sets/vault.types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/secrets/credential-token.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/secrets/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/secrets/keyring.env.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/secrets/passphrase-envelope.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/secrets/secret-sealer.aesgcm.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/shell.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/terminal.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/toolchain.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/web/first-distinct.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/web/html-document.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/web/html-resource.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/web/html-to-markdown.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/web/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/web/strip-html-presentation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/web/web-page.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/platform/dist/windows-system-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/activation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/admin-response.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/attach-loaded-plugin.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/browser-providers.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/bundled-initialization.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/capability-sdk.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/capability-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/claim-conflicts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/contributions.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/declarative-content-types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/declarative-enable.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/discovery-types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/hook-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/manifest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/node/archive-policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/node/browser-provider-assets.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/node/discovery.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/node/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/node/install.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/node/invocation-binding.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/node/loader.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/node/module-snapshot.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/node/open-flags.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/node/package-files.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/node/provider-artifact.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/node/runtime-core.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/node/source-drafts.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/plugin-claims.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/plugin-format.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/plugin-tool-errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/provider-contributions.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/provider-host.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/provider-setting-required.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/provider-settings-migrations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/quarantine.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/source-policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/sql/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/sql/repo.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/sql/repo.rows.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/tool-contributions.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/tools/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/tools/install.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/tools/management.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/tools/source.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/uninstall.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/worker/import-seam.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/worker/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/worker/protocol.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/worker/run-call.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/plugins/dist/host/worker/start.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/protocol/dist/agent-catalog.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/protocol/dist/common.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/protocol/dist/delegated-result.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/protocol/dist/errors.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/protocol/dist/event-log.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/protocol/dist/events.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/protocol/dist/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/protocol/dist/journal.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/protocol/dist/registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/protocol/dist/run-context.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/protocol/dist/run.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/registry/dist/tool-catalog-builder/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/registry/dist/tool-catalog-builder/input-signature.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/registry/dist/tool-catalog-builder/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/registry/dist/tool-catalog-builder/query.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/registry/dist/tool-catalog-builder/search-enricher.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/registry/dist/tool-catalog-builder/sqlite.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/registry/dist/tool-catalog/sqlite.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/sandbox/dist/node-worker.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/search/dist/api.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/search/dist/contract.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/search/dist/contribution.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/search/dist/digest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/search/dist/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/search/dist/indexer.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/search/dist/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/search/dist/registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/search/dist/service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/search/dist/tokens.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/search/dist/tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/server/dist/owner-store/backup.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/server/dist/owner-store/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/server/dist/owner-store/legacy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/sidecar/dist/bootstrap.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/sidecar/dist/daemon-registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/sidecar/dist/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/sidecar/dist/ipc-path.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/sidecar/dist/json-file.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/sidecar/dist/json-ipc.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/sidecar/dist/net.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/sidecar/dist/paths.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/sidecar/dist/port.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/sidecar/dist/supervision/respawn-policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/sidecar/dist/supervision/supervisor-node.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/sidecar/dist/supervision/supervisor.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/core/theme/default.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/charts/catalog-manifests.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/charts/contract.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/charts/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/charts/registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/charts/wire.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/manifests.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/native/data-table.manifest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/action-button.manifest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/checkbox-field.manifest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/content-card.manifest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/data-table.manifest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/radio-group-field.manifest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/select-field.manifest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/text-input-field.manifest.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/registry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/cards.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/confirmation-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/credential-card.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/early-message-buffer.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/escape.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/protocol.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/resource.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/sandbox-proxy-link-forwarder.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/sandbox-proxy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/secret-card.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/sign-in-card.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/access-approval.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/bridge.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/checkbox.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/choice-group.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/confirmation.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/document.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/fields.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/form.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/host-theme.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/outcome.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/select.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/structured-details.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/text-input.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/tokens.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/tool-approval.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/utils/trim-chars.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/ui/dist/utils/unhandled-case.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/core/builtin-permissions.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/core/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/core/permissions.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/core/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/core/principal-kind-policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/core/runtime-ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/core/types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/admin-crud-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/agent-tool-input.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/agent-tool-registrations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/agent-tools.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/auth-challenge.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/auth-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/authorize.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/grant-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/hasher.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/identity-transaction.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/login-providers.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/login-types.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/messages.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/mfa/passkey-adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/mfa/passkey-ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/mfa/passkey-service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/mfa/ports.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/mfa/secret-adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/mfa/service.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/mfa/totp-adapter.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/owner-reset-input.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/password-policy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/permission-migrations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/recovery-codes.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/repo.memory-transactions.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/repo.memory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/seed.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/session-tokens.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/user-management/dist/server/username.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/vibecoding/dist/html/edit.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/vibecoding/dist/html/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/vibecoding/dist/html/node/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/vibecoding/dist/html/node/parse5-region-parser.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Jini/packages/vibecoding/dist/html/regions.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/contracts/app-version.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/contracts/chat-attachments.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/contracts/find-in-page.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/contracts/import-handoff.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/contracts/owner-store.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/contracts/product-telemetry.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/contracts/project.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/contracts/resources.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/contracts/runtime-inventory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/contracts/sections.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/contracts/site-theme-preview-bridge.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/contracts/site-view-preference.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/contracts/working-directory.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/contracts/workspace-chat.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/contracts/workspace-conversations.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/contracts/zoom.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/preload/preload.mjs
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/desktop/dist/speech/preload-speech.cjs
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/packages/contracts/dist/admin-failure-copy.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/packages/contracts/dist/admin-locales.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/packages/contracts/dist/secret-redaction.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/packages/contracts/dist/site-share-limits.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/packages/sdk/dist/hooks.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/packages/sdk/dist/index.js
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /tmp/tovu-desktop-agent-plugin-tokens-UKlKPX/dist/src/cli/main.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agent-runtime/dist/core/model-discovery-shared.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agent-runtime/dist/model-discovery-shared.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agent-runtime/dist/native-tool-policy.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/agent-to-renderer.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/catalog.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/common-types.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/interpreter.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/json-pointer.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/renderer-to-agent.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/resolve.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/surface-properties.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/a2ui/tree.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/ag-ui.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/annotated-actions-script.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/capability.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/dom/dom-page-driver.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/dom/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/dom/model-context.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/dom/native-model-context.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/dom/publication-filter.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/element-handles.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/gen-ui/encoder.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/gen-ui/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/guards.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/handle.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/list-handles.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/mcp-ui-apps.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/messages.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/omit-keys.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/page-capabilities.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/page-executor.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/page-navigation.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/page-publication.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/site-guide/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/site-guide/site-guide.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/site-guide/topic-schema.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/site-guide/types.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/core/webmcp.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/agentic/dist/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/accepted-input.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/agent-plugin-chat-state.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/agentic/chat-capabilities.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/agentic/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/antigravity/tool-presentation.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/assistant-client/messages.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/assistant-content.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/checkpoint-interval.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/compact-events.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/composer-history.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/conversation-title.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/durable-projection.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/events.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/history-tool-metadata.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/messages.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/partial-json.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/persistence/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/persistence/ports.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/persistence/title.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/question-answer.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/question-form.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/question-form/format.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/question-form/normalize.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/question-form/scan.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/question-form/secret-answers.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/run-activity.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/run-events/entry.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/surface-expiry.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/surface-recovery.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/todos.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/tool-call-detail.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/tool-events.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/tool-output.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/tool-presentation.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/tools.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/transcript.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/transport.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/turn-usage.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/usage-format.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/user-text-redaction.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/util/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/util/manifest.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/util/markdown-context.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/util/markup-attributes.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/util/parser.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/util/pointer.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/util/recover.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/util/strip.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/util/types.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/core/util/validate.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/embed-widget/browser/frontend-session-bridge.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/agent-bridge/frontend-session-bridge.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/artifact-types.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/chat-pane.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/A2uiSurfaceCard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/attachment-size.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/AttachmentGallery.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/AttachmentGallery.rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/AttachmentPreviewModal.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/AttachmentPreviewModal.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/AttachmentTray.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/ChatFab.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/ChatSettingsDialog.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/ChatSettingsDialog.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/ChatSettingsSegmented.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/composer-discovery.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/Composer.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/ComposerDiscovery.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/ConversationList.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/ConversationList.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/ConversationList.rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/ConversationTitleEditor.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/CopyMessageButton.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/ExtEventErrorBoundary.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/FolderChips.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/Icon.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/JiniChatProvider.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/Markdown.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/mcp-ui-question-input.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/mcp-ui-surface-state.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/McpUiSurfaceCard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/MessageList.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/MessageList.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/MessageList.rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/MessageRow.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/MessageRow.usage.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/MidRunUserMessage.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/NextStepActions.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/QuestionForm.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/QuestionsPanel.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/SentAttachment.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/SentAttachment.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/TodoCard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/ToolCallGroup.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/ToolCallGroup.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/ToolCard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/components/ToolCard.rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/ext-event-renderer-registry.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/agent-tools.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/components/AgentPluginUsage.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/components/AgentRuntimePicker.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/components/ChatPane.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/components/RuntimeDropUp.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/create-daemon-attachment-uploader.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/create-frontend-request-caller.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/create-mcp-ui-tool-caller.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/create-mid-run-message-poster.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/create-typed-answer-poster.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/hooks/useAgentRuntimePicker.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/hooks/useChatPane.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/hooks/useChatPaneAgentControl.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/hooks/useChatPaneComposerPlaceholder.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/hooks/useChatPaneControlsHeight.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/hooks/useChatPaneFileDrop.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/hooks/useChatPaneNewTabLinks.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/hooks/useChatPaneRuntimeInventory.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/hooks/useChatPaneSuggestion.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/hooks/useChatPaneSurface.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/hooks/useChatPaneWorkingDirectory.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/hooks/useRuntimeDropUp.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/model-options.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/styles.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/features/chat-pane/surface-recovery-stream.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/assistant-chats.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/attachment-preview-cache.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/composer-draft-cache.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/composer-history-storage.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/context.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/fab-position.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/last-conversation-store.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/useAnsweredCards.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/useArtifactStream.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/useChatFabDrag.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/useComposer.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/useComposerHistory.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/useComposerHistoryKeys.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/useConversation.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/useCopyToClipboard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/useExtEventGroups.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/useLatestOperation.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/usePinnedTodos.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/useQuestionForms.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/useRunActivity.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/useRunStream.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/useSurfaceExpiry.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/useSurfaceRecovery.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/useToolTimeline.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/hooks/useUserTextGuard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/message-blocks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/tool-call-display.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/tool-renderer-registry.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/chat/dist/react/util/defined-props.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/api-token-auth.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/approval.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/batch-tool-inputs.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/bindings.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/contribution-registry.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/daemon.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/feature-flags.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/fetch/cache.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/fetch/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/fetch/loader-read.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/gated-mutations.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/gated-mutations/actor-identity.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/gated-mutations/gateway.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/gated-mutations/ports.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/gated-mutations/token.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/model-facing-tool-errors.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/naming.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/native-regexp.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/object-store.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/origin-validation.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/pack-lifecycle.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/pack.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/primitives/http.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/primitives/ids.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/primitives/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/primitives/json.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/primitives/logger.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/primitives/paths.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/primitives/result.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/primitives/sse.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/primitives/tasks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/primitives/time.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/primitives/trim-chars.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/principal.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/provider-registry.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/records.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/redact.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/registration-kit.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/surface-exchanges.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/target-scope.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/teardown.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/text/descriptor-i18n.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/text/escape.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/text/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/text/line-tail.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/text/sanitize-untrusted-text.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/token.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/tool-exposure.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/tool-input-envelope.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/tool-input-errors.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/tool-input-normalization.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/tool-metadata.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/tool-permissions.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/tool-registry.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/tool-tokens.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/core/dist/user-facing-error.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/create-electron-desktop-host.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/electron-process-memory.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/electron-protocol.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/electron-render-service.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/electron-shell.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/electron-single-instance.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/electron-surfaces.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/electron-url-capture.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/electron-window-lifecycle.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/render-window.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/electron/testing.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/protocol.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/render-service.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/shell.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/sidecar.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/single-instance.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/url-capture.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/desktop-host/dist/window-lifecycle.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/diagnostics/dist/core/secrets-only.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/diagnostics/dist/redaction/secrets-only.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/platform/dist/command.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/platform/dist/fetch-with-timeout.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/platform/dist/net/endpoint-policy.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/platform/dist/process.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/platform/dist/shell.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/platform/dist/windows-system-tools.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/protocol/dist/agent-catalog.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/protocol/dist/common.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/protocol/dist/delegated-result.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/protocol/dist/errors.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/protocol/dist/event-log.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/protocol/dist/events.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/protocol/dist/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/protocol/dist/journal.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/protocol/dist/registry.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/protocol/dist/run-context.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/protocol/dist/run.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/attrs.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/confirm.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/kit-contract.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/needs.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/agent-attrs.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/confirm/ConfirmDialog.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/confirm/ConfirmDialog.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/confirm/guard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/context.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/facade.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/Kit.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/kit.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/KitProvider.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/native/Controls.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/native/Controls.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/native/Dialog.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/native/Dialog.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/native/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/native/Navigation.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/native/Navigation.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/secret-reveal.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/react/SecretInput.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui-kit/dist/toast.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/browser/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/browser/useDismissOnOutsideOrEscape.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/browser/useFileDropTarget.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/browser/useGlobalKeydown.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/browser/useModalWindowDragGuard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/core/theme/css-name.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/core/theme/default.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/core/theme/stylesheet.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/core/theme/validation.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/a2ui/catalog-from-registry.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/a2ui/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/a2ui/protocol.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/a2ui/renderer.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/a2ui/use-a2ui-surface.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/about/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/about/react/components/AboutTab.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/about/react/hooks/useSilentUpdatesToggle.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/about/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/ComingSoonNotice.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/ComingSoonPanel.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/ImagePreviewModal.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/InfoTip.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/InfoTip.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/InfoTip.rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/Lightbox/Lightbox.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/Lightbox/Lightbox.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/MiddleTruncate.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/MiddleTruncate.rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/ScrollJump/ScrollJump.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/ScrollJump/ScrollJump.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/ScrollJump/ScrollJump.rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/SeeMore/SeeMore.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/SeeMore/SeeMore.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/Select/Select.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/Select/Select.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/SuggestInput/SuggestInput.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/SuggestInput/SuggestInput.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/components/useDebouncedHtmlPreview.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/admin-widgets/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/appearance/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/appearance/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/appearance/react/components/AppearanceTab.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/appearance/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-grid/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-grid/dependencies.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-grid/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-grid/react/components/AssetCard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-grid/react/components/AssetGrid.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-grid/react/components/AssetGridBody.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-grid/react/components/AssetGridToolbar.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-grid/react/components/DeleteConfirmDialog.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-grid/react/components/SelectionActionBar.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-grid/react/components/SelectionBand.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-grid/react/components/useAssetGridFilters.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-grid/react/hooks/useAssetGridData.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-grid/react/hooks/useAssetGridKeyboardShortcuts.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-grid/react/hooks/useAssetGridLiveUpdates.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-grid/react/hooks/useAssetGridSelection.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-grid/react/hooks/useRubberBandDrag.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-grid/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/dependencies.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/components/AssetTreeBreadcrumbs.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/components/AssetTreeBrowser.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/components/AssetTreeBrowserParts.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/components/AssetTreeEmptyState.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/components/AssetTreeFileRow.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/components/AssetTreeFolderRow.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/components/AssetTreeRowMenu.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/components/AssetTreeSelectionBar.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/components/AssetTreeToolbar.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/components/AssetTreeUploadErrorBanner.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/components/FilePreviewPane.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/components/useAssetTreeBrowserController.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/hooks/useAssetTreeBatchActions.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/hooks/useAssetTreeClipboardPasteUpload.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/hooks/useAssetTreeCopyLocalPath.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/hooks/useAssetTreeDragUpload.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/hooks/useAssetTreeNavigation.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/hooks/useAssetTreePreview.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/hooks/useAssetTreeRename.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/hooks/useAssetTreeRowMenu.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/react/hooks/useAssetTreeSelection.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/asset-tree-browser/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/browser-chrome/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/browser-chrome/dependencies.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/browser-chrome/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/browser-chrome/react/components/BrowserViewportControls.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/browser-chrome/react/hooks/useBrowserBridgeRegistration.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/browser-chrome/react/hooks/useBrowserHistory.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/browser-chrome/react/hooks/useBrowserNavigationStack.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/browser-chrome/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/charts/browser.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/charts/catalog-manifests.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/charts/contract.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/charts/react.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/charts/registry.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/charts/table.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/charts/wire.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/command-palette/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/command-palette/dependencies.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/command-palette/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/command-palette/react/components/CommandPalette.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/command-palette/react/components/CommandPaletteRow.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/command-palette/react/hooks/useCommandPalette.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/command-palette/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/connectors/components/ConnectorAlertList.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/connectors/components/ConnectorCard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/connectors/components/ConnectorDetailDrawer.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/connectors/components/ConnectorGate.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/connectors/components/ConnectorGrid.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/connectors/components/ConnectorLogo.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/connectors/components/ConnectorSearchBar.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/connectors/components/ProviderTabBar.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/connectors/ConnectorsBrowser.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/connectors/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/connectors/dependencies.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/connectors/hooks/useConnectorAuthorization.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/connectors/hooks/useConnectorCatalog.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/connectors/hooks/useConnectorDetail.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/connectors/hooks/useWiredConnectorsBrowser.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/connectors/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/connectors/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/dependencies.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/http-adapter.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/react/components/AgentCliEnvFields.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/react/components/AgentDiagnosticRow.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/react/components/ByokProviderForm.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/react/components/ExecutionTab.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/react/components/LocalCliAgentCard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/react/components/LocalCliAgentList.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/react/components/LocalCliAgentSettings.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/react/components/ProviderChipGroup.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/react/components/SearchableModelSelect.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/react/hooks/use-byok-field-validation.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/react/hooks/use-execution-credential.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/react/hooks/useExecutionTab.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/react/hooks/useLocalCliAgentCard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/react/hooks/useLocalCliAgentList.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/react/hooks/useReasoningControl.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/execution/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/external-mcp/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/external-mcp/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/external-mcp/react/components/ExternalMcpTab.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/file-dropzone/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/file-dropzone/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/file-dropzone/react/components/FileDropzone.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/file-dropzone/react/components/FileDropzoneLightbox.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/file-dropzone/react/components/FileDropzoneNameList.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/file-dropzone/react/components/FileDropzoneThumbnailGrid.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/file-dropzone/react/components/FileDropzoneZone.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/file-dropzone/react/hooks/useFileDialogTracking.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/file-dropzone/react/hooks/useFileDropzone.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/file-dropzone/react/hooks/useFileDropzonePreviews.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/file-dropzone/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/folder-path-drop/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/folder-path-drop/react/hooks/useFolderPathDropCapture.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/folder-path-drop/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/html-viewer/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/html-viewer/dependencies.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/html-viewer/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/html-viewer/react/components/DeckNavigationControls.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/html-viewer/react/components/PresentMenu.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/html-viewer/react/components/ZoomMenu.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/html-viewer/react/hooks/useDeckNavigation.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/html-viewer/react/hooks/usePresentMode.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/html-viewer/react/hooks/useZoomControl.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/html-viewer/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/context.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.ar.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.bn.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.de.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.en.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.es.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.fa.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.fr.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.hi.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.hu.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.id.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.it.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.ja.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.ko.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.pl.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.pt-BR.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.ru.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.th.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.tr.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.uk.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.ur.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.zh-CN.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionaries/settings-dialog.zh-TW.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/dictionary-translator.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/locale.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/i18n/template-i18n.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/iframe-pool/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/iframe-pool/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/iframe-pool/react/components/IframeKeepAliveProvider.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/iframe-pool/react/components/PooledIframe.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/iframe-pool/react/dom-sync.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/iframe-pool/react/hooks/useIframeKeepAlivePool.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/iframe-pool/react/pool-context.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/iframe-pool/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/instructions/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/instructions/react/components/InstructionsTab.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/integrations/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/integrations/dependencies.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/integrations/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/integrations/react/components/ClientPicker.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/integrations/react/components/CodexInstallToggleButton.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/integrations/react/components/IntegrationsTab.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/integrations/react/components/SnippetBlock.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/integrations/react/hooks/useCodexInstallToggle.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/integrations/react/hooks/useMcpInstallInfo.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/integrations/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/native/data-table.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/native/data-table.manifest.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/native/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/action-button.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/action-button.manifest.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/button.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/card.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/checkbox-field.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/checkbox-field.manifest.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/checkbox.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/content-card.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/content-card.manifest.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/data-table.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/data-table.manifest.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/icons.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/input.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/label.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/lib/utils.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/radio-group-field.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/radio-group-field.manifest.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/radio-group.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/select-field.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/select-field.manifest.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/select.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/table.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/text-input-field.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/providers/shadcn/text-input-field.manifest.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/registry.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/interactive-ui/table-data.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/language/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/language/react/components/LanguageTab.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/list-detail-panel/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/list-detail-panel/react/components/ListDetailPanel.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/list-detail-panel/react/hooks/useListDetailSelection.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/list-detail-panel/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/confirmation-store.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/early-message-buffer.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/escape.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/protocol.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/resource.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/sandbox-proxy-link-forwarder.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/sandbox-proxy.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/secret-card.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/access-approval.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/bridge.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/checkbox.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/choice-group.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/confirmation.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/document.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/fields.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/form.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/host-theme.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/outcome.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/select.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/structured-details.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/text-input.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/tokens.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mcp-ui/surfaces/tool-approval.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/media-providers/catalog.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/media-providers/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/media-providers/dependencies.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/media-providers/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/media-providers/react/components/media-providers-tab-labels.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/media-providers/react/components/MediaProviderCard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/media-providers/react/components/MediaProvidersTab.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/media-providers/react/hooks/useMediaProvidersTab.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/media-providers/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/async-commit-guard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/dependencies.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/formatters.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/components/MemoryAdvancedModal.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/components/MemoryConnectedPanel.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/components/MemoryEntryCard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/components/MemoryExtractionCard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/components/MemoryHooksPanel.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/components/MemoryHowPanel.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/components/MemoryList.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/components/MemoryManualEditor.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/components/MemorySettingsPanel.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/hooks/useMemoryConfig.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/hooks/useMemoryConnectors.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/hooks/useMemoryConnectors.rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/hooks/useMemoryEntries.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/hooks/useMemoryExtractions.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/hooks/useMemoryExtractions.store.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/hooks/useMemoryFlash.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/hooks/useMemoryNavigation.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/MemoryPorts.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/render-markdown.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/react/styles.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/memory/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mention-autocomplete/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mention-autocomplete/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mention-autocomplete/react/components/MentionAutocomplete.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mention-autocomplete/react/components/MentionCategoryTabs.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mention-autocomplete/react/components/MentionResultItem.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mention-autocomplete/react/components/MentionResultsList.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mention-autocomplete/react/components/SelectedMentionChips.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mention-autocomplete/react/hooks/useMentionAutocomplete.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/mention-autocomplete/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/notifications/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/notifications/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/notifications/notifications-catalog.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/notifications/react/components/NotificationsTab.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/notifications/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/observability/boot-timing.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/observability/iframe.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/observability/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/observability/install.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/observability/long-task.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/observability/ports.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/observability/resource-error.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/observability/stuck-run.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/observability/telemetry-url.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/observability/visibility.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/observability/white-screen.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/ErrorNotice.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/failure-channel.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/fetch-query/adapter.react.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/fetch-query/binding.react.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/fetch-query/environment.browser.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/fetch-query/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/helpers/format-timestamp.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/helpers/permissions.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/helpers/resolve-active-tab-id.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/helpers/retry-unreachable.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/helpers/standing-draft-local-backup.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/helpers/standing-draft-recovery-message.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/hooks/use-async-action.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/hooks/use-dirty-guard.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/hooks/use-focus-trap.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/hooks/use-serial-writes.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/hooks/use-settings-slice.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/hooks/use-settlement-generation.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/hooks/use-standing-draft-autosave.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/panel-kit/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/privacy/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/privacy/react/components/PrivacyTab.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/privacy/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/progress-card/components/ProgressCard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/progress-card/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/progress-card/reference-adapters.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/progress-card/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/project-locations/dependencies.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/project-locations/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/project-locations/react/components/ProjectLocationsTab.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/project-locations/react/hooks/useProjectLocationsTab.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/project-locations/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/dependencies.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/ResourceBoard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/resourceBoardProps.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/ResourceBoardToolbar.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/ResourceBoardView.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/ResourceBoardViewParts.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/ResourceCard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/ResourceCardParts.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/ResourceKanbanBoard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/ResourceMetrics.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/ResourceRowList.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/ResourceRowListItem.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/ResourceRowListItemParts.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/resourceRowListProps.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/ResourceRowListView.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/ResourceRowListViewParts.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/ResourceRunHistoryList.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/StatusPill.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/components/translatedErrorLabelProps.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/hooks/useResourceBoard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/react/hooks/useResourceRowList.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/resource-dashboard/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/revision-review/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/revision-review/react/components/RevisionDiffCard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/revision-review/react/components/RevisionHistoryList.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/revision-review/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/schedule-picker/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/schedule-picker/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/schedule-picker/react/components/RecurringSchedulePicker.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/schedule-picker/react/components/ScheduleFields.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/schedule-picker/react/components/ScheduleKindTabs.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/schedule-picker/react/components/ScheduleSummary.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/schedule-picker/react/components/WeekdayGrid.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/schedule-picker/react/hooks/useRecurringSchedulePicker.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/schedule-picker/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/settings/dialog/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/settings/dialog/react/components/SettingsDialogShell.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/settings/dialog/react/hooks/useSettingsDialogShell.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/site-card/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/site-card/site-list-view.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/site-card/SiteCard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/site-card/SiteListToolbar.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/site-card/use-site-list-view.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/skills/dependencies.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/skills/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/skills/react/components/SkillDraftForm.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/skills/react/components/SkillDraftForm.labels.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/skills/react/components/SkillRow.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/skills/react/components/SkillRow.labels.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/skills/react/components/SkillsTab.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/skills/react/components/SkillsTab.labels.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/skills/react/hooks/useSkillsTab.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/skills/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/source-config-list/agent-handles.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/source-config-list/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/source-config-list/dependencies.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/source-config-list/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/source-config-list/react/components/SourceConfigAddForm.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/source-config-list/react/components/SourceConfigField.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/source-config-list/react/components/SourceConfigItemCard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/source-config-list/react/components/SourceConfigList.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/source-config-list/react/components/SourceConfigListView.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/source-config-list/react/components/SourceConfigTestControl.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/source-config-list/react/components/SourceConfigTrustOptions.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/source-config-list/react/hooks/useSourceConfigAddForm.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/source-config-list/react/hooks/useSourceConfigList.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/source-config-list/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-launcher-menu/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-launcher-menu/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-launcher-menu/react/components/TabLauncherActionRow.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-launcher-menu/react/components/TabLauncherMenu.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-launcher-menu/react/components/TabLauncherResultRow.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-launcher-menu/react/hooks/useTabLauncherMenu.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-launcher-menu/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-strip/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-strip/dependencies.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-strip/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-strip/ports.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-strip/react/components/TabBar.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-strip/react/components/TabBar.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-strip/react/components/TabStrip.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-strip/react/components/TabStripFrame.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-strip/react/components/TabStripItem.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-strip/react/hooks/useTabStripDragReorder.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tab-strip/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tabbed-dialog/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tabbed-dialog/react/components/TabbedDialog.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tabbed-dialog/react/components/TabbedDialogChrome.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tabbed-dialog/react/components/TabbedDialogHeader.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tabbed-dialog/react/components/TabbedDialogSidebar.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tabbed-dialog/react/components/tabbedDialogView.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tabbed-dialog/react/hooks/useTabbedDialog.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/tabbed-dialog/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/version-manager/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/version-manager/dependencies.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/version-manager/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/version-manager/react/components/VersionManagerModal.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/version-manager/react/components/VersionPreviewFrame.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/version-manager/react/components/VersionPromptPopover.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/version-manager/react/components/VersionRestoreControl.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/version-manager/react/components/VersionSidebar.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/version-manager/react/hooks/usePreviewCanvasSize.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/version-manager/react/hooks/useVersionManager.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/version-manager/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/constants.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/dependencies.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/react/components/AudioViewerBody.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/react/components/CodeWithLines.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/react/components/CommentSideDock.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/react/components/CommentSidePanel.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/react/components/ImageViewerBody.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/react/components/JsonPanel.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/react/components/MarkdownSplitPane.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/react/components/SegmentedToggle.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/react/components/SvgSourcePane.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/react/components/VideoViewerBody.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/react/components/ViewerFileActions.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/react/components/ViewerShell.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/react/components/ViewportSwitcher.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/react/components/ViewportToggleGroup.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/react/hooks/useCommentReorder.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/react/hooks/useCopyToClipboard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/react/hooks/useMarkdownScrollSync.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/features/viewer-shell/rules.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/agent-icon-data-uris.generated.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/AgentIcon.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/AppChromeHeader.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/BrandLogo.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/CompactToggle.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/ComponentKitPreview.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/CustomSelect.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/EdgeScrollZones.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/EditorIcon.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/ExportDiagnosticsButton.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/FileImportPanel.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/HeaderActionsMenu.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/Icon.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/ImportChoice.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/KitErrorBoundary.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/LanguageMenu.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/Loading.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/Notice.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/OnboardingChipField.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/OnboardingDropdown.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/OnboardingPanelHeader.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/OptionCards.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/PaletteTweaks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/PillButton.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/PopoverItem.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/PopoverMenu.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/remixicon-font-recovery.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/RemixIcon.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/RemixIcon.stylesheet.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/SecretInput.hooks.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/SecretInput.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/select-popover.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/StatCard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/Toast.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/ToggleRow.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/TokenChip.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/TooltipLayer.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/ValueChip.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/components/WorkingDirPicker.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/hooks/useAgentHandle.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/hooks/useBrandFonts.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/hooks/useCoalescedCallback.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/hooks/useDebouncedValue.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/hooks/useEdgeAutoScroll.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/hooks/useInView.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/hooks/useResizableSplitPane.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/hooks/useStableHandler.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/mcp-ui/host-message-source.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/mcp-ui/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/mcp-ui/mcp-ui-host-frame.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/mcp-ui/McpUiHost.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/mcp-ui/useHostSurfaceTokens.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/react/mcp-ui/useMcpUiHost.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/renderers/html-utils.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/renderers/new-tab-preview.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/renderers/sandbox-bridge.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/renderers/sandbox-scripts.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/renderers/sandboxed-document.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/theme/default.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/theme/stylesheet.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/appearance.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/auto-open-file.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/browser-request.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/class-names.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/color-math.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/copy-to-clipboard.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/design-md.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/dom-subscriptions.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/endpoint-policy.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/file-system-errors.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/file-transfer.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/ime-composing.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/index.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/localized-url.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/markdown-scroll-sync.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/notifications.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/omit-keys.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/platform.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/polygon-selection.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/scroll-tabs-with-wheel.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/smooth-scroll-to-top.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/sse.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/timezone.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/trim-chars.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/unhandled-case.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/unit-bezier.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/uuid.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/visual-stability.js
- /tmp/claude-0/cov/abs/desktop-b.lcov.info: /home/user/Jini/packages/ui/dist/utils/zip.js

## Coverage records excluded from denominator

- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/website/src/features/site-guide/contracts.ts → apps/website/src/features/site-guide/contracts.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/website/src/features/site-inspection/admin-screens.generated.ts → apps/website/src/features/site-inspection/admin-screens.generated.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/website/src/features/webmcp/generated/annotated-actions-script.ts → apps/website/src/features/webmcp/generated/annotated-actions-script.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/website/src/platform/site-dir/__tests__/helpers/assert-site-owner-login.ts → apps/website/src/platform/site-dir/__tests__/helpers/assert-site-owner-login.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/apps/website/src/platform/site-dir/__tests__/helpers/isolated-catalog-home.ts → apps/website/src/platform/site-dir/__tests__/helpers/isolated-catalog-home.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/development/e2e/desktop/_shared-daemon-evidence.ts → development/e2e/desktop/_shared-daemon-evidence.ts
- /tmp/claude-0/cov/abs/desktop-a.lcov.info: /home/user/Tovu/development/e2e/support/run-packaged-desktop.mjs → development/e2e/support/run-packaged-desktop.mjs
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/panel-contracts.ts → apps/admin/src/panel-contracts.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/components/MediaPickerDialog/media-picker-port.hooks.ts → apps/admin/src/components/MediaPickerDialog/media-picker-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/components/TemplateSource/template-source-port.hooks.ts → apps/admin/src/components/TemplateSource/template-source-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/components/WidgetConfigFields/widget-config-fields-port.hooks.ts → apps/admin/src/components/WidgetConfigFields/widget-config-fields-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/components/WidgetPickerDialog/widget-picker-port.hooks.ts → apps/admin/src/components/WidgetPickerDialog/widget-picker-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/ai-assistant/hooks/ai-assistant-port.hooks.ts → apps/admin/src/features/ai-assistant/hooks/ai-assistant-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/ai-assistant/hooks/assistant-daemon-restart-port.hooks.ts → apps/admin/src/features/ai-assistant/hooks/assistant-daemon-restart-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/ai-assistant/hooks/visitor-credential-form-port.hooks.ts → apps/admin/src/features/ai-assistant/hooks/visitor-credential-form-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/analytics/hooks/analytics-port.hooks.ts → apps/admin/src/features/analytics/hooks/analytics-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/auth/hooks/login-port.hooks.ts → apps/admin/src/features/auth/hooks/login-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/collections/hooks/collection-entries-port.hooks.ts → apps/admin/src/features/collections/hooks/collection-entries-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/collections/hooks/collection-entry-editor-port.hooks.ts → apps/admin/src/features/collections/hooks/collection-entry-editor-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/collections/hooks/collections-port.hooks.ts → apps/admin/src/features/collections/hooks/collections-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/collections/hooks/edit-fields-dialog-port.hooks.ts → apps/admin/src/features/collections/hooks/edit-fields-dialog-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/collections/hooks/new-content-type-dialog-port.hooks.ts → apps/admin/src/features/collections/hooks/new-content-type-dialog-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/content-analysis/hooks/content-analysis-port.hooks.ts → apps/admin/src/features/content-analysis/hooks/content-analysis-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/dashboard/hooks/dashboard-port.hooks.ts → apps/admin/src/features/dashboard/hooks/dashboard-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/database/hooks/migrate-forward-section-port.hooks.ts → apps/admin/src/features/database/hooks/migrate-forward-section-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/database/hooks/schema-state-section-port.hooks.ts → apps/admin/src/features/database/hooks/schema-state-section-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/database/hooks/timeline-section-port.hooks.ts → apps/admin/src/features/database/hooks/timeline-section-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/deployment/hooks/deployment-overview-port.hooks.ts → apps/admin/src/features/deployment/hooks/deployment-overview-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/deployment/hooks/dockerfile-source-port.hooks.ts → apps/admin/src/features/deployment/hooks/dockerfile-source-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/deployment/hooks/publish-credentials-port.hooks.ts → apps/admin/src/features/deployment/hooks/publish-credentials-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/deployment/hooks/static-export-port.hooks.ts → apps/admin/src/features/deployment/hooks/static-export-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/deployment/hooks/static-publish-port.hooks.ts → apps/admin/src/features/deployment/hooks/static-publish-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/integrations/hooks/integration-deliveries-port.hooks.ts → apps/admin/src/features/integrations/hooks/integration-deliveries-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/integrations/hooks/integrations-port.hooks.ts → apps/admin/src/features/integrations/hooks/integrations-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/library/hooks/library-port.hooks.ts → apps/admin/src/features/library/hooks/library-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/media/hooks/media-port.hooks.ts → apps/admin/src/features/media/hooks/media-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/members/hooks/members-port.hooks.ts → apps/admin/src/features/members/hooks/members-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/menus/hooks/menus-port.hooks.ts → apps/admin/src/features/menus/hooks/menus-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/observability/hooks/observability-status-port.hooks.ts → apps/admin/src/features/observability/hooks/observability-status-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/observability/hooks/recent-server-errors-port.hooks.ts → apps/admin/src/features/observability/hooks/recent-server-errors-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/pages/hooks/page-editor-port.hooks.ts → apps/admin/src/features/pages/hooks/page-editor-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/pages/hooks/pages-port.hooks.ts → apps/admin/src/features/pages/hooks/pages-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/pages/hooks/theme-canvas-port.hooks.ts → apps/admin/src/features/pages/hooks/theme-canvas-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/pages/hooks/theme-pages-port.hooks.ts → apps/admin/src/features/pages/hooks/theme-pages-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/plugins/hooks/agent-plugin-install-port.hooks.ts → apps/admin/src/features/plugins/hooks/agent-plugin-install-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/plugins/hooks/agent-plugin-memory-port.hooks.ts → apps/admin/src/features/plugins/hooks/agent-plugin-memory-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/plugins/hooks/agent-plugin-surfaces-port.hooks.ts → apps/admin/src/features/plugins/hooks/agent-plugin-surfaces-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/plugins/hooks/agent-plugins-port.hooks.ts → apps/admin/src/features/plugins/hooks/agent-plugins-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/plugins/hooks/plugin-install-port.hooks.ts → apps/admin/src/features/plugins/hooks/plugin-install-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/plugins/hooks/plugins-port.hooks.ts → apps/admin/src/features/plugins/hooks/plugins-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/posts/hooks/post-editor-port.hooks.ts → apps/admin/src/features/posts/hooks/post-editor-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/posts/hooks/posts-list-port.hooks.ts → apps/admin/src/features/posts/hooks/posts-list-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/providers/hooks/always-allow-port.hooks.ts → apps/admin/src/features/providers/hooks/always-allow-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/publish-content/hooks/publish-content-port.hooks.ts → apps/admin/src/features/publish-content/hooks/publish-content-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/recovery/hooks/recovery-port.hooks.ts → apps/admin/src/features/recovery/hooks/recovery-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/recovery/hooks/restore-flow-port.hooks.ts → apps/admin/src/features/recovery/hooks/restore-flow-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/roles/hooks/roles-port.hooks.ts → apps/admin/src/features/roles/hooks/roles-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/security/hooks/access-tokens-port.hooks.ts → apps/admin/src/features/security/hooks/access-tokens-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/security/hooks/other-credentials-port.hooks.ts → apps/admin/src/features/security/hooks/other-credentials-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/security/hooks/security-permissions-port.hooks.ts → apps/admin/src/features/security/hooks/security-permissions-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/security/hooks/site-key-port.hooks.ts → apps/admin/src/features/security/hooks/site-key-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/sites/hooks/sites-port.hooks.ts → apps/admin/src/features/sites/hooks/sites-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/source-control/hooks/source-control-credentials-port.hooks.ts → apps/admin/src/features/source-control/hooks/source-control-credentials-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/taxonomy/hooks/merge-term-section-port.hooks.ts → apps/admin/src/features/taxonomy/hooks/merge-term-section-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/taxonomy/hooks/new-taxonomy-form-port.hooks.ts → apps/admin/src/features/taxonomy/hooks/new-taxonomy-form-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/taxonomy/hooks/new-term-form-port.hooks.ts → apps/admin/src/features/taxonomy/hooks/new-term-form-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/taxonomy/hooks/taxonomy-port.hooks.ts → apps/admin/src/features/taxonomy/hooks/taxonomy-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/taxonomy/hooks/term-picker-port.hooks.ts → apps/admin/src/features/taxonomy/hooks/term-picker-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/themes/hooks/theme-explore-port.hooks.ts → apps/admin/src/features/themes/hooks/theme-explore-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/themes/hooks/themes-port.hooks.ts → apps/admin/src/features/themes/hooks/themes-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/trash/hooks/trash-port.hooks.ts → apps/admin/src/features/trash/hooks/trash-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/users/hooks/users-port.hooks.ts → apps/admin/src/features/users/hooks/users-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/features/workspace/hooks/workspace-port.hooks.ts → apps/admin/src/features/workspace/hooks/workspace-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/hooks/admin-execution-credential-port.hooks.ts → apps/admin/src/hooks/admin-execution-credential-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/hooks/admin-locale-port.hooks.ts → apps/admin/src/hooks/admin-locale-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/hooks/assistant-chats-port.hooks.ts → apps/admin/src/hooks/assistant-chats-port.hooks.ts
- /tmp/claude-0/cov/abs/admin.lcov.info: /home/user/Tovu/apps/admin/src/integrations/chart-providers/chart-registry-port.hooks.ts → apps/admin/src/integrations/chart-providers/chart-registry-port.hooks.ts
