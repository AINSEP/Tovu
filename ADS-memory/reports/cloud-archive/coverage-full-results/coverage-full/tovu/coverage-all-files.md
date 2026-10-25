# All-files coverage

| Metric | TRUE: all files | RUNNER: records only |
| --- | --- | --- |
| lines | 31430/102363 (30.70%) | 31430/32607 (96.39%) |
| branches | 15615/57120 (27.34%) | 15615/16298 (95.81%) |
| functions | 8169/25907 (31.53%) | 8169/8557 (95.47%) |

Never-loaded files: **1811** / 2647

- NEVER-LOADED denominators are AST estimates (distinct executable statement start lines, function bodies, branch arms).
- LCOV lacks columns: functions/branches merge by source line and ordinal; different instrumentation layouts may not correspond.
- LOADED means a coverage record exists, including zero-hit include records.
- /tmp/cov/desktop-2.info: skipped malformed LCOV record — LCOV BRH does not match detail records in src/desktop-i18n.ts

## Exclusions (first matching group)

| Group | Files | Up to 5 examples |
| --- | ---: | --- |
| non-source | 566 | apps/admin/INFO.md, apps/admin/index.html, apps/admin/package-lock.json, apps/admin/package.json, apps/admin/src/admin-themes/classic/admin.css |
| dependencies/build/output | 0 |  |
| test/fixture | 3378 | apps/admin/__tests__/dev-proxy-upstream-close.unit.test.ts, apps/admin/__tests__/fixtures/dev-proxy-server.mjs, apps/admin/__tests__/vite-config-api-proxy.unit.test.ts, apps/admin/__tests__/vite-config-dev-tls.unit.test.ts, apps/admin/src/__measurements__/render-churn.measurement.test.tsx |
| declaration | 4 | apps/admin/src/vite-env.d.ts, apps/desktop/src/renderer/electron-webview.d.ts, apps/site-chat/src/vite-env.d.ts, apps/website/src/server/http/cookie.d.ts |
| generated | 3 | apps/website/src/features/site-inspection/admin-screens.generated.ts, apps/website/src/features/webmcp/generated/annotated-actions-script.ts, apps/website/src/platform/db/content-database.generated.ts |
| type-only | 131 | apps/admin/src/components/MediaPickerDialog/media-picker-port.hooks.ts, apps/admin/src/components/TemplateSource/template-source-port.hooks.ts, apps/admin/src/components/WidgetConfigFields/widget-config-fields-port.hooks.ts, apps/admin/src/components/WidgetPickerDialog/widget-picker-port.hooks.ts, apps/admin/src/features/ai-assistant/hooks/ai-assistant-port.hooks.ts |

## Packages / top-level areas

| Area | Files | Never loaded | Lines | Branches | Functions |
| --- | ---: | ---: | --- | --- | --- |
| apps/admin | 728 | 2 | 16834/17115 (98.36%) | 13389/13974 (95.81%) | 7301/7506 (97.27%) |
| apps/desktop | 155 | 45 | 14596/22302 (65.45%) | 2226/5714 (38.96%) | 868/2712 (32.01%) |
| apps/site-chat | 24 | 24 | 0/659 (0.00%) | 0/340 (0.00%) | 0/175 (0.00%) |
| apps/website | 1651 | 1651 | 0/58317 (0.00%) | 0/34148 (0.00%) | 0/14452 (0.00%) |
| content | 87 | 87 | 0/3958 (0.00%) | 0/2944 (0.00%) | 0/1061 (0.00%) |
| packages/sdk | 2 | 2 | 0/12 (0.00%) | 0/0 (100.00%) | 0/1 (0.00%) |

## Files (largest uncovered line gap first)

| File | Status | Uncovered lines | Lines | Branches | Functions |
| --- | --- | ---: | --- | --- | --- |
| apps/desktop/src/renderer/public/vendor/kuinetic/kuinetic.js | NEVER-LOADED | 3123 | 0/3123 (0.00%) | 0/1314 (0.00%) | 0/761 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/render.ts | NEVER-LOADED | 888 | 0/888 (0.00%) | 0/788 (0.00%) | 0/227 (0.00%) |
| apps/website/src/server/runtime/composition/deps.ts | NEVER-LOADED | 620 | 0/620 (0.00%) | 0/198 (0.00%) | 0/165 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/pages.ts | NEVER-LOADED | 556 | 0/556 (0.00%) | 0/364 (0.00%) | 0/117 (0.00%) |
| apps/website/src/server/runtime/composition/app.ts | NEVER-LOADED | 498 | 0/498 (0.00%) | 0/56 (0.00%) | 0/136 (0.00%) |
| apps/website/src/assistant/external-mcp-store.ts | NEVER-LOADED | 472 | 0/472 (0.00%) | 0/360 (0.00%) | 0/82 (0.00%) |
| apps/desktop/main.ts | NEVER-LOADED | 467 | 0/467 (0.00%) | 0/228 (0.00%) | 0/119 (0.00%) |
| apps/website/src/server/inbound/assistant/agent-daemon-server.ts | NEVER-LOADED | 444 | 0/444 (0.00%) | 0/174 (0.00%) | 0/95 (0.00%) |
| apps/website/src/features/post/post.ts | NEVER-LOADED | 403 | 0/403 (0.00%) | 0/350 (0.00%) | 0/76 (0.00%) |
| apps/website/src/features/theme/tool-registrations.ts | NEVER-LOADED | 338 | 0/338 (0.00%) | 0/170 (0.00%) | 0/71 (0.00%) |
| apps/desktop/src/project-ipc.ts | NEVER-LOADED | 331 | 0/331 (0.00%) | 0/256 (0.00%) | 0/98 (0.00%) |
| apps/desktop/src/renderer/App.hooks.ts | LOADED | 301 | 1309/1610 (81.30%) | 88/95 (92.63%) | 29/53 (54.72%) |
| content/agent-plugins/s3-compatible/targets/s3-compatible.mjs | NEVER-LOADED | 299 | 0/299 (0.00%) | 0/212 (0.00%) | 0/63 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/themes/explore.ts | NEVER-LOADED | 297 | 0/297 (0.00%) | 0/162 (0.00%) | 0/45 (0.00%) |
| apps/website/src/features/theme/publish-content.ts | NEVER-LOADED | 294 | 0/294 (0.00%) | 0/156 (0.00%) | 0/58 (0.00%) |
| apps/website/src/features/theme/theme.ts | NEVER-LOADED | 292 | 0/292 (0.00%) | 0/186 (0.00%) | 0/67 (0.00%) |
| apps/website/src/features/post/tool-registrations.ts | NEVER-LOADED | 288 | 0/288 (0.00%) | 0/188 (0.00%) | 0/83 (0.00%) |
| apps/website/src/features/theme/theme-files.ts | NEVER-LOADED | 285 | 0/285 (0.00%) | 0/166 (0.00%) | 0/40 (0.00%) |
| apps/website/src/features/theme/static-render.ts | NEVER-LOADED | 284 | 0/284 (0.00%) | 0/252 (0.00%) | 0/72 (0.00%) |
| apps/website/src/features/site-backup/tool-registrations.ts | NEVER-LOADED | 274 | 0/274 (0.00%) | 0/188 (0.00%) | 0/63 (0.00%) |
| apps/website/src/assistant/external-mcp-oauth.ts | NEVER-LOADED | 267 | 0/267 (0.00%) | 0/178 (0.00%) | 0/67 (0.00%) |
| apps/website/src/features/publish-content/apply-loop.ts | NEVER-LOADED | 252 | 0/252 (0.00%) | 0/180 (0.00%) | 0/48 (0.00%) |
| apps/website/src/features/deployments/publish-agent-tools.ts | NEVER-LOADED | 251 | 0/251 (0.00%) | 0/206 (0.00%) | 0/69 (0.00%) |
| apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts | NEVER-LOADED | 245 | 0/245 (0.00%) | 0/133 (0.00%) | 0/51 (0.00%) |
| apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts | NEVER-LOADED | 237 | 0/237 (0.00%) | 0/192 (0.00%) | 0/61 (0.00%) |
| apps/website/src/features/custom-credentials/tool-registrations.ts | NEVER-LOADED | 235 | 0/235 (0.00%) | 0/136 (0.00%) | 0/64 (0.00%) |
| apps/website/src/features/deployments/publish-credentials/store.ts | NEVER-LOADED | 235 | 0/235 (0.00%) | 0/214 (0.00%) | 0/65 (0.00%) |
| apps/website/src/features/plugins/data-module.ts | NEVER-LOADED | 234 | 0/234 (0.00%) | 0/110 (0.00%) | 0/50 (0.00%) |
| apps/desktop/scripts/verify-find-in-page.ts | NEVER-LOADED | 227 | 0/227 (0.00%) | 0/100 (0.00%) | 0/45 (0.00%) |
| apps/website/src/server/runtime/composition/plugin-runtime.ts | NEVER-LOADED | 224 | 0/224 (0.00%) | 0/148 (0.00%) | 0/62 (0.00%) |
| apps/website/src/server/inbound/admin-http/dev-auth.ts | NEVER-LOADED | 213 | 0/213 (0.00%) | 0/103 (0.00%) | 0/36 (0.00%) |
| apps/website/src/server/runtime/composition/modules/assistant.ts | NEVER-LOADED | 211 | 0/211 (0.00%) | 0/126 (0.00%) | 0/44 (0.00%) |
| content/agent-plugins/github/source-control/commit-site.mjs | NEVER-LOADED | 211 | 0/211 (0.00%) | 0/174 (0.00%) | 0/30 (0.00%) |
| apps/desktop/scripts/verify-site-power.ts | NEVER-LOADED | 210 | 0/210 (0.00%) | 0/96 (0.00%) | 0/44 (0.00%) |
| apps/website/src/features/webhooks/site-key-ensure.ts | NEVER-LOADED | 208 | 0/208 (0.00%) | 0/137 (0.00%) | 0/36 (0.00%) |
| apps/website/src/features/site-backup/sources.ts | NEVER-LOADED | 207 | 0/207 (0.00%) | 0/144 (0.00%) | 0/38 (0.00%) |
| content/agent-plugins/github/source-control/write-files.mjs | NEVER-LOADED | 205 | 0/205 (0.00%) | 0/166 (0.00%) | 0/33 (0.00%) |
| apps/website/src/features/publish-content/peer-transport.ts | NEVER-LOADED | 203 | 0/203 (0.00%) | 0/144 (0.00%) | 0/33 (0.00%) |
| apps/website/src/features/agent-plugins/tool-registrations.ts | NEVER-LOADED | 200 | 0/200 (0.00%) | 0/108 (0.00%) | 0/52 (0.00%) |
| apps/website/src/server/runtime/composition/peer-site-reads.ts | NEVER-LOADED | 199 | 0/199 (0.00%) | 0/74 (0.00%) | 0/43 (0.00%) |
| apps/desktop/src/tovu-server.ts | NEVER-LOADED | 194 | 0/194 (0.00%) | 0/94 (0.00%) | 0/42 (0.00%) |
| apps/website/src/features/plugin-runtime/tool-registrations.ts | NEVER-LOADED | 193 | 0/193 (0.00%) | 0/110 (0.00%) | 0/52 (0.00%) |
| content/agent-plugins/github-pages/targets/github-pages.mjs | NEVER-LOADED | 188 | 0/188 (0.00%) | 0/126 (0.00%) | 0/30 (0.00%) |
| apps/website/src/server/runtime/composition/tool-catalog-manifest.ts | NEVER-LOADED | 184 | 0/184 (0.00%) | 0/2 (0.00%) | 0/21 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/site-key.ts | NEVER-LOADED | 183 | 0/183 (0.00%) | 0/134 (0.00%) | 0/33 (0.00%) |
| apps/website/src/platform/db/sqlite/share-database.ts | NEVER-LOADED | 179 | 0/179 (0.00%) | 0/106 (0.00%) | 0/54 (0.00%) |
| content/agent-plugins/vercel/targets/vercel.mjs | NEVER-LOADED | 179 | 0/179 (0.00%) | 0/142 (0.00%) | 0/35 (0.00%) |
| apps/website/src/features/newsletter/send-pipeline.ts | NEVER-LOADED | 178 | 0/178 (0.00%) | 0/84 (0.00%) | 0/26 (0.00%) |
| apps/desktop/scripts/smoke-packaged-chat.ts | NEVER-LOADED | 177 | 0/177 (0.00%) | 0/74 (0.00%) | 0/33 (0.00%) |
| apps/website/src/features/pages/tool-registrations.ts | NEVER-LOADED | 175 | 0/175 (0.00%) | 0/88 (0.00%) | 0/24 (0.00%) |
| apps/website/src/features/publish-content/tool-registrations.ts | NEVER-LOADED | 175 | 0/175 (0.00%) | 0/114 (0.00%) | 0/56 (0.00%) |
| apps/website/src/features/publish-content/peers.ts | NEVER-LOADED | 174 | 0/174 (0.00%) | 0/118 (0.00%) | 0/53 (0.00%) |
| apps/website/src/server/runtime/composition/modules/assistant-byok.ts | NEVER-LOADED | 174 | 0/174 (0.00%) | 0/100 (0.00%) | 0/34 (0.00%) |
| apps/desktop/src/tracked-sites.ts | LOADED | 173 | 540/713 (75.74%) | 9/20 (45.00%) | 8/30 (26.67%) |
| apps/website/src/server/runtime/composition/vault-boot.ts | NEVER-LOADED | 171 | 0/171 (0.00%) | 0/124 (0.00%) | 0/37 (0.00%) |
| apps/website/src/features/deployments/deploy-targets/registry.ts | NEVER-LOADED | 168 | 0/168 (0.00%) | 0/178 (0.00%) | 0/35 (0.00%) |
| apps/website/src/features/deployments/deploy-ops/run-ops.ts | NEVER-LOADED | 161 | 0/161 (0.00%) | 0/148 (0.00%) | 0/41 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/form-render.ts | NEVER-LOADED | 159 | 0/159 (0.00%) | 0/92 (0.00%) | 0/37 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/backstop.ts | NEVER-LOADED | 158 | 0/158 (0.00%) | 0/94 (0.00%) | 0/35 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts | NEVER-LOADED | 157 | 0/157 (0.00%) | 0/82 (0.00%) | 0/31 (0.00%) |
| content/agent-plugins/cloudflare/worker/forms-receiver.mjs | NEVER-LOADED | 155 | 0/155 (0.00%) | 0/138 (0.00%) | 0/44 (0.00%) |
| apps/website/src/assistant/content-read-tool.ts | NEVER-LOADED | 154 | 0/154 (0.00%) | 0/108 (0.00%) | 0/39 (0.00%) |
| apps/website/src/features/external-mcp/tool-registrations.ts | NEVER-LOADED | 154 | 0/154 (0.00%) | 0/120 (0.00%) | 0/34 (0.00%) |
| apps/website/src/features/members/write-service.ts | NEVER-LOADED | 154 | 0/154 (0.00%) | 0/80 (0.00%) | 0/15 (0.00%) |
| apps/website/src/platform/db/migrations/0012_secrets_vault.ts | NEVER-LOADED | 154 | 0/154 (0.00%) | 0/132 (0.00%) | 0/23 (0.00%) |
| apps/website/src/features/custom-credentials/store.ts | NEVER-LOADED | 151 | 0/151 (0.00%) | 0/120 (0.00%) | 0/30 (0.00%) |
| apps/website/src/platform/site-dir/init-site.ts | NEVER-LOADED | 151 | 0/151 (0.00%) | 0/72 (0.00%) | 0/18 (0.00%) |
| apps/website/src/index.ts | NEVER-LOADED | 150 | 0/150 (0.00%) | 0/56 (0.00%) | 0/23 (0.00%) |
| apps/website/src/platform/db/repos/media-repo.ts | NEVER-LOADED | 149 | 0/149 (0.00%) | 0/84 (0.00%) | 0/75 (0.00%) |
| apps/website/src/features/pages/regions.ts | NEVER-LOADED | 147 | 0/147 (0.00%) | 0/98 (0.00%) | 0/23 (0.00%) |
| apps/website/src/features/publish-content/file-tree-policy.ts | NEVER-LOADED | 146 | 0/146 (0.00%) | 0/130 (0.00%) | 0/20 (0.00%) |
| apps/desktop/src/site-dir-store.ts | NEVER-LOADED | 144 | 0/144 (0.00%) | 0/90 (0.00%) | 0/30 (0.00%) |
| apps/website/src/server/runtime/composition/modules/site-assistant.ts | NEVER-LOADED | 144 | 0/144 (0.00%) | 0/89 (0.00%) | 0/29 (0.00%) |
| content/agent-plugins/google-workspace/ui/surface-client.mjs | NEVER-LOADED | 144 | 0/144 (0.00%) | 0/92 (0.00%) | 0/26 (0.00%) |
| apps/website/src/features/plugin-runtime/declarative-content-types.ts | NEVER-LOADED | 143 | 0/143 (0.00%) | 0/84 (0.00%) | 0/32 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts | NEVER-LOADED | 143 | 0/143 (0.00%) | 0/116 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/agent-plugins/connect-tool.ts | NEVER-LOADED | 142 | 0/142 (0.00%) | 0/74 (0.00%) | 0/27 (0.00%) |
| content/agent-plugins/cloudflare/lib/forms.mjs | NEVER-LOADED | 142 | 0/142 (0.00%) | 0/132 (0.00%) | 0/36 (0.00%) |
| apps/desktop/scripts/stage-payload.ts | NEVER-LOADED | 141 | 0/141 (0.00%) | 0/56 (0.00%) | 0/17 (0.00%) |
| apps/website/src/features/publish-content/raw-row-contributor.ts | NEVER-LOADED | 141 | 0/141 (0.00%) | 0/146 (0.00%) | 0/44 (0.00%) |
| apps/website/src/features/newsletter/tool-registrations.ts | NEVER-LOADED | 140 | 0/140 (0.00%) | 0/50 (0.00%) | 0/29 (0.00%) |
| apps/website/src/features/widgets/tool-registrations.ts | NEVER-LOADED | 140 | 0/140 (0.00%) | 0/74 (0.00%) | 0/34 (0.00%) |
| apps/website/src/features/theme/validation/manifest-v2.ts | NEVER-LOADED | 139 | 0/139 (0.00%) | 0/108 (0.00%) | 0/21 (0.00%) |
| apps/website/src/platform/db/migration/manifest.ts | NEVER-LOADED | 137 | 0/137 (0.00%) | 0/65 (0.00%) | 0/28 (0.00%) |
| apps/website/src/features/agent-plugins/install-upload.ts | NEVER-LOADED | 136 | 0/136 (0.00%) | 0/78 (0.00%) | 0/26 (0.00%) |
| apps/website/src/features/source-control/store.ts | NEVER-LOADED | 135 | 0/135 (0.00%) | 0/100 (0.00%) | 0/27 (0.00%) |
| apps/website/src/features/trash/adapters/directory.ts | NEVER-LOADED | 135 | 0/135 (0.00%) | 0/64 (0.00%) | 0/19 (0.00%) |
| apps/website/src/features/deployments/static-publish/adapter.ts | NEVER-LOADED | 134 | 0/134 (0.00%) | 0/102 (0.00%) | 0/24 (0.00%) |
| apps/website/src/features/theme/duplicate-theme.ts | NEVER-LOADED | 134 | 0/134 (0.00%) | 0/62 (0.00%) | 0/19 (0.00%) |
| apps/website/src/server/runtime/lifecycle/local-site-process.ts | NEVER-LOADED | 134 | 0/134 (0.00%) | 0/80 (0.00%) | 0/41 (0.00%) |
| apps/website/src/platform/site-dir/site-registry.ts | NEVER-LOADED | 133 | 0/133 (0.00%) | 0/86 (0.00%) | 0/34 (0.00%) |
| apps/website/src/features/api-connections/host.ts | NEVER-LOADED | 131 | 0/131 (0.00%) | 0/88 (0.00%) | 0/42 (0.00%) |
| apps/website/src/features/publish-content/raw-file-contributor.ts | NEVER-LOADED | 130 | 0/130 (0.00%) | 0/130 (0.00%) | 0/30 (0.00%) |
| apps/website/src/platform/site-dir/move-sites-home.ts | NEVER-LOADED | 130 | 0/130 (0.00%) | 0/80 (0.00%) | 0/31 (0.00%) |
| apps/website/src/cli/commands/serve.ts | NEVER-LOADED | 129 | 0/129 (0.00%) | 0/44 (0.00%) | 0/24 (0.00%) |
| apps/desktop/src/renderer/App.tsx | NEVER-LOADED | 128 | 0/128 (0.00%) | 0/148 (0.00%) | 0/43 (0.00%) |
| apps/website/src/features/deployments/deploy-ops/secrets.ts | NEVER-LOADED | 128 | 0/128 (0.00%) | 0/106 (0.00%) | 0/32 (0.00%) |
| apps/website/src/features/web-screenshot/web-screenshot.ts | NEVER-LOADED | 127 | 0/127 (0.00%) | 0/100 (0.00%) | 0/28 (0.00%) |
| apps/website/src/features/site-inspection/published-page.ts | NEVER-LOADED | 126 | 0/126 (0.00%) | 0/76 (0.00%) | 0/22 (0.00%) |
| apps/website/src/features/webhooks/secret-scan-guard.ts | NEVER-LOADED | 126 | 0/126 (0.00%) | 0/60 (0.00%) | 0/17 (0.00%) |
| apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts | NEVER-LOADED | 126 | 0/126 (0.00%) | 0/76 (0.00%) | 0/38 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/agent-tools.ts | NEVER-LOADED | 125 | 0/125 (0.00%) | 0/70 (0.00%) | 0/19 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/sites.ts | NEVER-LOADED | 124 | 0/124 (0.00%) | 0/84 (0.00%) | 0/16 (0.00%) |
| apps/website/src/server/runtime/composition/vault-legacy-codecs.ts | NEVER-LOADED | 124 | 0/124 (0.00%) | 0/102 (0.00%) | 0/30 (0.00%) |
| apps/website/src/features/publish-content/planner.ts | NEVER-LOADED | 123 | 0/123 (0.00%) | 0/84 (0.00%) | 0/19 (0.00%) |
| apps/website/src/features/theme/build-conformance.ts | NEVER-LOADED | 123 | 0/123 (0.00%) | 0/62 (0.00%) | 0/16 (0.00%) |
| content/agent-plugins/netlify/targets/netlify.mjs | NEVER-LOADED | 123 | 0/123 (0.00%) | 0/78 (0.00%) | 0/29 (0.00%) |
| apps/desktop/src/desktop-agent.ts | NEVER-LOADED | 122 | 0/122 (0.00%) | 0/84 (0.00%) | 0/50 (0.00%) |
| apps/website/src/features/deployments/providers/github.ts | NEVER-LOADED | 121 | 0/121 (0.00%) | 0/74 (0.00%) | 0/17 (0.00%) |
| apps/website/src/features/forms/tool-registrations.ts | NEVER-LOADED | 121 | 0/121 (0.00%) | 0/54 (0.00%) | 0/32 (0.00%) |
| apps/website/src/features/identity/api-key-service.ts | NEVER-LOADED | 120 | 0/120 (0.00%) | 0/76 (0.00%) | 0/20 (0.00%) |
| apps/website/src/features/post/publish-content.ts | NEVER-LOADED | 119 | 0/119 (0.00%) | 0/112 (0.00%) | 0/37 (0.00%) |
| apps/website/src/features/publish-trust/provisioning.ts | NEVER-LOADED | 118 | 0/118 (0.00%) | 0/72 (0.00%) | 0/29 (0.00%) |
| apps/website/src/server/runtime/composition/permanent-delete-deps.ts | NEVER-LOADED | 116 | 0/116 (0.00%) | 0/86 (0.00%) | 0/40 (0.00%) |
| apps/website/src/features/trash/table-adapter.ts | NEVER-LOADED | 115 | 0/115 (0.00%) | 0/96 (0.00%) | 0/36 (0.00%) |
| apps/website/src/platform/site-dir/local-site-supervisor.ts | NEVER-LOADED | 115 | 0/115 (0.00%) | 0/86 (0.00%) | 0/34 (0.00%) |
| apps/website/src/platform/db/vault-credential-inventory.ts | NEVER-LOADED | 113 | 0/113 (0.00%) | 0/80 (0.00%) | 0/31 (0.00%) |
| apps/site-chat/src/site-assistant-transport.ts | NEVER-LOADED | 112 | 0/112 (0.00%) | 0/52 (0.00%) | 0/21 (0.00%) |
| apps/website/src/features/skills/tool-registrations.ts | NEVER-LOADED | 110 | 0/110 (0.00%) | 0/64 (0.00%) | 0/24 (0.00%) |
| apps/website/src/server/runtime/composition/modules/assistant-daemon-client.ts | NEVER-LOADED | 110 | 0/110 (0.00%) | 0/52 (0.00%) | 0/24 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/import.ts | NEVER-LOADED | 109 | 0/109 (0.00%) | 0/54 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/identity/repo.ts | NEVER-LOADED | 107 | 0/107 (0.00%) | 0/80 (0.00%) | 0/126 (0.00%) |
| apps/website/src/features/site-inspection/live-url.ts | NEVER-LOADED | 107 | 0/107 (0.00%) | 0/72 (0.00%) | 0/16 (0.00%) |
| apps/website/src/features/theme/validation/webmcp-markup.ts | NEVER-LOADED | 107 | 0/107 (0.00%) | 0/110 (0.00%) | 0/28 (0.00%) |
| apps/website/src/features/widgets/media-html.ts | NEVER-LOADED | 107 | 0/107 (0.00%) | 0/94 (0.00%) | 0/28 (0.00%) |
| apps/desktop/src/smoke-bridge.ts | NEVER-LOADED | 106 | 0/106 (0.00%) | 0/78 (0.00%) | 0/23 (0.00%) |
| apps/website/src/features/seo/settings.ts | NEVER-LOADED | 106 | 0/106 (0.00%) | 0/80 (0.00%) | 0/24 (0.00%) |
| apps/desktop/src/renderer/use-find-in-page.hooks.ts | LOADED | 105 | 572/677 (84.49%) | 54/55 (98.18%) | 16/18 (88.89%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/peer-transport.ts | NEVER-LOADED | 105 | 0/105 (0.00%) | 0/66 (0.00%) | 0/21 (0.00%) |
| apps/website/src/assistant/byok-tool-surface.ts | NEVER-LOADED | 104 | 0/104 (0.00%) | 0/68 (0.00%) | 0/26 (0.00%) |
| apps/website/src/features/media/view-video-tool.ts | NEVER-LOADED | 104 | 0/104 (0.00%) | 0/110 (0.00%) | 0/35 (0.00%) |
| apps/website/src/features/site-backup/import-verifier-inventory.ts | NEVER-LOADED | 104 | 0/104 (0.00%) | 0/76 (0.00%) | 0/21 (0.00%) |
| apps/website/src/features/source-control/tool-registrations.ts | NEVER-LOADED | 104 | 0/104 (0.00%) | 0/66 (0.00%) | 0/22 (0.00%) |
| apps/website/src/server/runtime/composition/local-credential-copy.ts | NEVER-LOADED | 104 | 0/104 (0.00%) | 0/64 (0.00%) | 0/29 (0.00%) |
| apps/website/src/features/post/cover-image.ts | NEVER-LOADED | 103 | 0/103 (0.00%) | 0/100 (0.00%) | 0/23 (0.00%) |
| apps/website/src/features/taxonomy/tool-registrations.ts | NEVER-LOADED | 103 | 0/103 (0.00%) | 0/26 (0.00%) | 0/35 (0.00%) |
| apps/website/src/features/theme/migration/migrate-theme.ts | NEVER-LOADED | 103 | 0/103 (0.00%) | 0/48 (0.00%) | 0/17 (0.00%) |
| apps/website/src/features/theme/migration/theme-migration-plan.ts | NEVER-LOADED | 102 | 0/102 (0.00%) | 0/52 (0.00%) | 0/18 (0.00%) |
| apps/website/src/features/sites/tool-registrations.ts | NEVER-LOADED | 101 | 0/101 (0.00%) | 0/30 (0.00%) | 0/29 (0.00%) |
| apps/website/src/features/plugin-runtime/built-ins/content-analyzer/analyze-content.ts | NEVER-LOADED | 100 | 0/100 (0.00%) | 0/56 (0.00%) | 0/25 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/settings/events.ts | NEVER-LOADED | 100 | 0/100 (0.00%) | 0/54 (0.00%) | 0/18 (0.00%) |
| apps/website/src/server/runtime/composition/form-submissions.ts | NEVER-LOADED | 100 | 0/100 (0.00%) | 0/52 (0.00%) | 0/40 (0.00%) |
| apps/website/src/features/agent-plugins/access-token-tool.ts | NEVER-LOADED | 99 | 0/99 (0.00%) | 0/66 (0.00%) | 0/19 (0.00%) |
| apps/website/src/features/newsletter/repo.ts | NEVER-LOADED | 99 | 0/99 (0.00%) | 0/48 (0.00%) | 0/88 (0.00%) |
| apps/website/src/features/site-backup/import-backend.ts | NEVER-LOADED | 99 | 0/99 (0.00%) | 0/30 (0.00%) | 0/23 (0.00%) |
| content/agent-plugins/github/source-control/backup-push.mjs | NEVER-LOADED | 98 | 0/98 (0.00%) | 0/82 (0.00%) | 0/9 (0.00%) |
| apps/desktop/scripts/check-coverage.ts | NEVER-LOADED | 97 | 0/97 (0.00%) | 0/62 (0.00%) | 0/18 (0.00%) |
| apps/site-chat/scripts/check-bundle-mounts.mjs | NEVER-LOADED | 97 | 0/97 (0.00%) | 0/68 (0.00%) | 0/30 (0.00%) |
| apps/website/src/features/api-connections/contribution.ts | NEVER-LOADED | 97 | 0/97 (0.00%) | 0/100 (0.00%) | 0/21 (0.00%) |
| apps/website/src/features/deployments/static-publish/credentials.ts | NEVER-LOADED | 97 | 0/97 (0.00%) | 0/64 (0.00%) | 0/24 (0.00%) |
| apps/website/src/features/members/repo.ts | NEVER-LOADED | 97 | 0/97 (0.00%) | 0/40 (0.00%) | 0/78 (0.00%) |
| apps/website/src/features/publish-content/media-references.ts | NEVER-LOADED | 97 | 0/97 (0.00%) | 0/88 (0.00%) | 0/19 (0.00%) |
| apps/website/src/features/publish-content/publish-tool.ts | NEVER-LOADED | 97 | 0/97 (0.00%) | 0/112 (0.00%) | 0/32 (0.00%) |
| apps/website/src/features/trash/trash-item-tool.ts | NEVER-LOADED | 97 | 0/97 (0.00%) | 0/37 (0.00%) | 0/20 (0.00%) |
| apps/website/src/features/entries/public-list.ts | NEVER-LOADED | 96 | 0/96 (0.00%) | 0/65 (0.00%) | 0/19 (0.00%) |
| apps/website/src/features/plugin-runtime/capability-tool-registrations.ts | NEVER-LOADED | 96 | 0/96 (0.00%) | 0/60 (0.00%) | 0/30 (0.00%) |
| content/agent-plugins/google-workspace/lib/sheets-client.mjs | NEVER-LOADED | 95 | 0/95 (0.00%) | 0/64 (0.00%) | 0/29 (0.00%) |
| apps/website/src/features/newsletter/delivery/tool-registrations.ts | NEVER-LOADED | 94 | 0/94 (0.00%) | 0/62 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/publish-content/repo-handler.ts | NEVER-LOADED | 94 | 0/94 (0.00%) | 0/110 (0.00%) | 0/34 (0.00%) |
| apps/desktop/src/sites-mcp-registration.ts | NEVER-LOADED | 93 | 0/93 (0.00%) | 0/48 (0.00%) | 0/23 (0.00%) |
| apps/website/src/features/theme/entry-list-render.ts | NEVER-LOADED | 92 | 0/92 (0.00%) | 0/70 (0.00%) | 0/36 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts | NEVER-LOADED | 92 | 0/92 (0.00%) | 0/56 (0.00%) | 0/12 (0.00%) |
| apps/website/src/features/media-import/tool-registrations.ts | NEVER-LOADED | 91 | 0/91 (0.00%) | 0/52 (0.00%) | 0/21 (0.00%) |
| apps/website/src/features/recovery/tool-registrations.ts | NEVER-LOADED | 91 | 0/91 (0.00%) | 0/28 (0.00%) | 0/25 (0.00%) |
| apps/website/src/features/webhooks/keyring.env.ts | NEVER-LOADED | 91 | 0/91 (0.00%) | 0/46 (0.00%) | 0/33 (0.00%) |
| apps/website/src/contracts/core/entry-refs/extractor.ts | NEVER-LOADED | 90 | 0/90 (0.00%) | 0/60 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/custom-credentials/credential-copy-tool.ts | NEVER-LOADED | 90 | 0/90 (0.00%) | 0/96 (0.00%) | 0/30 (0.00%) |
| apps/desktop/src/shared-sites.ts | LOADED | 89 | 108/197 (54.82%) | 12/22 (54.55%) | 7/16 (43.75%) |
| apps/desktop/src/site-relocation.ts | NEVER-LOADED | 89 | 0/89 (0.00%) | 0/60 (0.00%) | 0/22 (0.00%) |
| apps/website/src/features/agent-plugins/federate-mcp.ts | NEVER-LOADED | 89 | 0/89 (0.00%) | 0/76 (0.00%) | 0/13 (0.00%) |
| apps/website/src/features/identity/tool-registrations.ts | NEVER-LOADED | 89 | 0/89 (0.00%) | 0/71 (0.00%) | 0/26 (0.00%) |
| apps/website/src/server/runtime/composition/domain-dns-adapters.ts | NEVER-LOADED | 89 | 0/89 (0.00%) | 0/74 (0.00%) | 0/16 (0.00%) |
| apps/website/src/assistant/tool-registrations.ts | NEVER-LOADED | 88 | 0/88 (0.00%) | 0/52 (0.00%) | 0/26 (0.00%) |
| apps/website/src/features/comments/tool-registrations.ts | NEVER-LOADED | 87 | 0/87 (0.00%) | 0/38 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/theme/theme-trash.ts | NEVER-LOADED | 87 | 0/87 (0.00%) | 0/42 (0.00%) | 0/21 (0.00%) |
| apps/website/src/features/deployments/deploy-ops/registry.ts | NEVER-LOADED | 86 | 0/86 (0.00%) | 0/68 (0.00%) | 0/30 (0.00%) |
| apps/website/src/features/deployments/deploy-ops/tool-registrations.ts | NEVER-LOADED | 86 | 0/86 (0.00%) | 0/84 (0.00%) | 0/23 (0.00%) |
| apps/website/src/features/newsletter/repo.memory.ts | NEVER-LOADED | 86 | 0/86 (0.00%) | 0/126 (0.00%) | 0/76 (0.00%) |
| apps/website/src/features/theme/validation/structure.ts | NEVER-LOADED | 86 | 0/86 (0.00%) | 0/46 (0.00%) | 0/9 (0.00%) |
| content/agent-plugins/cloudflare/lib/target.mjs | NEVER-LOADED | 86 | 0/86 (0.00%) | 0/80 (0.00%) | 0/17 (0.00%) |
| content/agent-plugins/github/deploy-ops/github-actions.mjs | NEVER-LOADED | 86 | 0/86 (0.00%) | 0/118 (0.00%) | 0/18 (0.00%) |
| apps/website/src/features/api-connections/connect.ts | NEVER-LOADED | 85 | 0/85 (0.00%) | 0/26 (0.00%) | 0/20 (0.00%) |
| apps/website/src/features/consent/service.ts | NEVER-LOADED | 85 | 0/85 (0.00%) | 0/46 (0.00%) | 0/16 (0.00%) |
| apps/website/src/features/identity/delete-user-service.ts | NEVER-LOADED | 85 | 0/85 (0.00%) | 0/58 (0.00%) | 0/20 (0.00%) |
| apps/website/src/features/publish-trust/grant.ts | NEVER-LOADED | 85 | 0/85 (0.00%) | 0/76 (0.00%) | 0/17 (0.00%) |
| apps/website/src/features/taxonomy/repo.ts | NEVER-LOADED | 85 | 0/85 (0.00%) | 0/28 (0.00%) | 0/77 (0.00%) |
| apps/website/src/assistant/automatic-agent-plugins.ts | NEVER-LOADED | 84 | 0/84 (0.00%) | 0/52 (0.00%) | 0/21 (0.00%) |
| apps/website/src/features/publish-content/ui/criteria.ts | NEVER-LOADED | 84 | 0/84 (0.00%) | 0/78 (0.00%) | 0/20 (0.00%) |
| apps/website/src/platform/db/migrations/legacy-sqlite.ts | NEVER-LOADED | 84 | 0/84 (0.00%) | 0/28 (0.00%) | 0/22 (0.00%) |
| apps/website/src/platform/db/sqlite/database-introspection-adapter.sqlite.ts | NEVER-LOADED | 84 | 0/84 (0.00%) | 0/44 (0.00%) | 0/21 (0.00%) |
| apps/website/src/platform/site-dir/publish-backstop-file.ts | NEVER-LOADED | 84 | 0/84 (0.00%) | 0/46 (0.00%) | 0/16 (0.00%) |
| apps/website/src/features/post/content-stats-tool.ts | NEVER-LOADED | 83 | 0/83 (0.00%) | 0/44 (0.00%) | 0/23 (0.00%) |
| apps/website/src/features/publish-content/export-bundle.ts | NEVER-LOADED | 83 | 0/83 (0.00%) | 0/36 (0.00%) | 0/16 (0.00%) |
| apps/website/src/features/webhooks/tool-registrations.ts | NEVER-LOADED | 83 | 0/83 (0.00%) | 0/32 (0.00%) | 0/20 (0.00%) |
| apps/website/src/platform/db/vault-credential-recovery.ts | NEVER-LOADED | 83 | 0/83 (0.00%) | 0/50 (0.00%) | 0/18 (0.00%) |
| apps/website/src/features/media/provider-credential-store.ts | NEVER-LOADED | 82 | 0/82 (0.00%) | 0/54 (0.00%) | 0/26 (0.00%) |
| apps/website/src/features/publish-trust/revocations.ts | NEVER-LOADED | 82 | 0/82 (0.00%) | 0/64 (0.00%) | 0/26 (0.00%) |
| apps/desktop/src/smoke-packaged-chat.ts | NEVER-LOADED | 81 | 0/81 (0.00%) | 0/68 (0.00%) | 0/25 (0.00%) |
| apps/website/src/platform/site-dir/site-trash.ts | NEVER-LOADED | 81 | 0/81 (0.00%) | 0/30 (0.00%) | 0/14 (0.00%) |
| content/agent-plugins/google-workspace/form-destinations/sheets.mjs | NEVER-LOADED | 81 | 0/81 (0.00%) | 0/50 (0.00%) | 0/28 (0.00%) |
| apps/website/src/features/form-destinations/registry.ts | NEVER-LOADED | 80 | 0/80 (0.00%) | 0/84 (0.00%) | 0/32 (0.00%) |
| apps/website/src/platform/db/schema.postgres.ts | NEVER-LOADED | 80 | 0/80 (0.00%) | 0/2 (0.00%) | 0/70 (0.00%) |
| apps/website/src/server/runtime/boot/resolve-mailer.ts | NEVER-LOADED | 80 | 0/80 (0.00%) | 0/52 (0.00%) | 0/22 (0.00%) |
| apps/website/src/server/runtime/composition/modules/assistant-chats.ts | NEVER-LOADED | 80 | 0/80 (0.00%) | 0/58 (0.00%) | 0/24 (0.00%) |
| apps/website/src/features/members/repo.memory.ts | NEVER-LOADED | 79 | 0/79 (0.00%) | 0/94 (0.00%) | 0/57 (0.00%) |
| apps/website/src/features/theme/handlebars-allowlist.ts | NEVER-LOADED | 79 | 0/79 (0.00%) | 0/68 (0.00%) | 0/15 (0.00%) |
| apps/website/src/platform/db/schema.sqlite.ts | NEVER-LOADED | 79 | 0/79 (0.00%) | 0/0 (0.00%) | 0/74 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/bundle-create.ts | NEVER-LOADED | 79 | 0/79 (0.00%) | 0/60 (0.00%) | 0/13 (0.00%) |
| apps/website/src/server/runtime/composition/open-site-store.ts | NEVER-LOADED | 79 | 0/79 (0.00%) | 0/32 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/settings/form-delivery.ts | NEVER-LOADED | 78 | 0/78 (0.00%) | 0/50 (0.00%) | 0/20 (0.00%) |
| apps/website/src/platform/db/repos/form-delivery-repo.ts | NEVER-LOADED | 78 | 0/78 (0.00%) | 0/30 (0.00%) | 0/34 (0.00%) |
| apps/website/src/assistant/mcp-ui-tool-calls-route.ts | NEVER-LOADED | 77 | 0/77 (0.00%) | 0/46 (0.00%) | 0/10 (0.00%) |
| apps/website/src/features/theme/validation/validate-theme-package.ts | NEVER-LOADED | 77 | 0/77 (0.00%) | 0/34 (0.00%) | 0/15 (0.00%) |
| apps/website/src/server/inbound/admin-http/publish-trust-auth.ts | NEVER-LOADED | 77 | 0/77 (0.00%) | 0/42 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/pages/html-document-store.ts | NEVER-LOADED | 76 | 0/76 (0.00%) | 0/52 (0.00%) | 0/17 (0.00%) |
| apps/website/src/server/inbound/public-http/middleware/theme-page-preview.ts | NEVER-LOADED | 76 | 0/76 (0.00%) | 0/50 (0.00%) | 0/7 (0.00%) |
| apps/desktop/bin/mcp-bridge.ts | NEVER-LOADED | 75 | 0/75 (0.00%) | 0/26 (0.00%) | 0/15 (0.00%) |
| apps/website/src/features/media/read-chat-attachment.ts | NEVER-LOADED | 75 | 0/75 (0.00%) | 0/48 (0.00%) | 0/13 (0.00%) |
| apps/website/src/platform/db/sqlite/fresh-content-db.ts | NEVER-LOADED | 75 | 0/75 (0.00%) | 0/8 (0.00%) | 0/26 (0.00%) |
| apps/website/src/platform/site-dir/key-only-site-meta.ts | NEVER-LOADED | 75 | 0/75 (0.00%) | 0/40 (0.00%) | 0/14 (0.00%) |
| apps/website/src/server/runtime/composition/plugin-host.ts | NEVER-LOADED | 75 | 0/75 (0.00%) | 0/40 (0.00%) | 0/19 (0.00%) |
| apps/website/src/server/runtime/composition/site-key-recovery.ts | NEVER-LOADED | 75 | 0/75 (0.00%) | 0/18 (0.00%) | 0/23 (0.00%) |
| apps/website/src/features/custom-credentials/write-files-validation.ts | NEVER-LOADED | 74 | 0/74 (0.00%) | 0/52 (0.00%) | 0/13 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/posts/autosave.ts | NEVER-LOADED | 74 | 0/74 (0.00%) | 0/70 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/navigation/publish-content.ts | NEVER-LOADED | 73 | 0/73 (0.00%) | 0/32 (0.00%) | 0/21 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/destination.ts | NEVER-LOADED | 73 | 0/73 (0.00%) | 0/38 (0.00%) | 0/12 (0.00%) |
| apps/site-chat/src/session-store.ts | NEVER-LOADED | 72 | 0/72 (0.00%) | 0/30 (0.00%) | 0/18 (0.00%) |
| apps/website/src/features/agent-plugins/executable-tools/register.ts | NEVER-LOADED | 72 | 0/72 (0.00%) | 0/38 (0.00%) | 0/19 (0.00%) |
| apps/website/src/features/media-generation/providers-tools.ts | NEVER-LOADED | 72 | 0/72 (0.00%) | 0/50 (0.00%) | 0/26 (0.00%) |
| apps/website/src/features/post/search-index.ts | NEVER-LOADED | 72 | 0/72 (0.00%) | 0/20 (0.00%) | 0/23 (0.00%) |
| apps/website/src/features/publish-trust/handshake-client.ts | NEVER-LOADED | 72 | 0/72 (0.00%) | 0/48 (0.00%) | 0/13 (0.00%) |
| apps/website/src/platform/db/sqlite/import-database-worker.ts | NEVER-LOADED | 72 | 0/72 (0.00%) | 0/26 (0.00%) | 0/17 (0.00%) |
| apps/website/src/platform/site-dir/duplicate-site.ts | NEVER-LOADED | 72 | 0/72 (0.00%) | 0/26 (0.00%) | 0/8 (0.00%) |
| content/agent-plugins/google-workspace/ui/connection-panel.mjs | NEVER-LOADED | 72 | 0/72 (0.00%) | 0/38 (0.00%) | 0/33 (0.00%) |
| apps/website/src/features/newsletter/campaign-write-service.ts | NEVER-LOADED | 71 | 0/71 (0.00%) | 0/40 (0.00%) | 0/13 (0.00%) |
| apps/website/src/features/site-backup/import-backend-steps.ts | NEVER-LOADED | 71 | 0/71 (0.00%) | 0/74 (0.00%) | 0/19 (0.00%) |
| apps/website/src/features/widgets/publish-content.ts | NEVER-LOADED | 71 | 0/71 (0.00%) | 0/30 (0.00%) | 0/28 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/plugin-contributions.ts | NEVER-LOADED | 71 | 0/71 (0.00%) | 0/44 (0.00%) | 0/21 (0.00%) |
| apps/website/src/features/media/blob-store.s3.ts | NEVER-LOADED | 70 | 0/70 (0.00%) | 0/46 (0.00%) | 0/12 (0.00%) |
| apps/website/src/features/site-backup/share-service.ts | NEVER-LOADED | 70 | 0/70 (0.00%) | 0/46 (0.00%) | 0/10 (0.00%) |
| apps/website/src/features/source-control/credential-setup.ts | NEVER-LOADED | 70 | 0/70 (0.00%) | 0/67 (0.00%) | 0/30 (0.00%) |
| apps/website/src/features/webhooks/seal-aad-invariant.ts | NEVER-LOADED | 70 | 0/70 (0.00%) | 0/42 (0.00%) | 0/11 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts | NEVER-LOADED | 70 | 0/70 (0.00%) | 0/62 (0.00%) | 0/8 (0.00%) |
| apps/website/src/server/runtime/boot/local-owner-signin.ts | NEVER-LOADED | 70 | 0/70 (0.00%) | 0/76 (0.00%) | 0/15 (0.00%) |
| content/agent-plugins/google-workspace/ui/destination-panel.mjs | NEVER-LOADED | 70 | 0/70 (0.00%) | 0/58 (0.00%) | 0/32 (0.00%) |
| apps/website/src/features/deployments/deploy-config-registry.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/38 (0.00%) | 0/21 (0.00%) |
| apps/website/src/features/entries/repo.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/54 (0.00%) | 0/35 (0.00%) |
| apps/website/src/features/media-generation/tool-registrations.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/38 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/plugin-runtime/install-archive.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/50 (0.00%) | 0/15 (0.00%) |
| apps/website/src/features/publish-content/ui/report-rows.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/56 (0.00%) | 0/22 (0.00%) |
| apps/website/src/features/theme/code-tier-asset-normalizer.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/32 (0.00%) | 0/15 (0.00%) |
| apps/website/src/platform/site-dir/repair-site.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/22 (0.00%) | 0/10 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/original.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/36 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/site-imports.ts | NEVER-LOADED | 69 | 0/69 (0.00%) | 0/46 (0.00%) | 0/20 (0.00%) |
| apps/desktop/scripts/smoke-native.ts | NEVER-LOADED | 68 | 0/68 (0.00%) | 0/44 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/settings/repo.ts | NEVER-LOADED | 68 | 0/68 (0.00%) | 0/52 (0.00%) | 0/58 (0.00%) |
| apps/website/src/features/site-backup/share-preparation-steps.ts | NEVER-LOADED | 68 | 0/68 (0.00%) | 0/44 (0.00%) | 0/12 (0.00%) |
| apps/website/src/features/site-export/route-manifest.ts | NEVER-LOADED | 68 | 0/68 (0.00%) | 0/28 (0.00%) | 0/12 (0.00%) |
| apps/website/src/platform/secrets/vault-meta-rules.ts | NEVER-LOADED | 68 | 0/68 (0.00%) | 0/74 (0.00%) | 0/17 (0.00%) |
| apps/website/src/assistant/external-mcp-reauth-tool.ts | NEVER-LOADED | 67 | 0/67 (0.00%) | 0/32 (0.00%) | 0/12 (0.00%) |
| apps/website/src/features/deployments/static-publish/verify.ts | NEVER-LOADED | 67 | 0/67 (0.00%) | 0/48 (0.00%) | 0/15 (0.00%) |
| apps/website/src/features/redirects/tool-registrations.ts | NEVER-LOADED | 67 | 0/67 (0.00%) | 0/14 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/source-control/commit-site.ts | NEVER-LOADED | 67 | 0/67 (0.00%) | 0/38 (0.00%) | 0/10 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts | NEVER-LOADED | 67 | 0/67 (0.00%) | 0/40 (0.00%) | 0/10 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/publish-trust/handshake.ts | NEVER-LOADED | 67 | 0/67 (0.00%) | 0/44 (0.00%) | 0/13 (0.00%) |
| content/agent-plugins/cloudflare/lib/api.mjs | NEVER-LOADED | 67 | 0/67 (0.00%) | 0/62 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/database-transfer/tool-registrations.ts | NEVER-LOADED | 66 | 0/66 (0.00%) | 0/28 (0.00%) | 0/18 (0.00%) |
| apps/website/src/features/identity/api-key-secret.ts | NEVER-LOADED | 66 | 0/66 (0.00%) | 0/34 (0.00%) | 0/12 (0.00%) |
| apps/website/src/features/site-backup/push-engine.ts | NEVER-LOADED | 66 | 0/66 (0.00%) | 0/44 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/site-backup/share-registry.ts | NEVER-LOADED | 66 | 0/66 (0.00%) | 0/46 (0.00%) | 0/15 (0.00%) |
| apps/desktop/scripts/check-gates.ts | NEVER-LOADED | 65 | 0/65 (0.00%) | 0/30 (0.00%) | 0/12 (0.00%) |
| apps/website/src/cli/program.ts | NEVER-LOADED | 65 | 0/65 (0.00%) | 0/2 (0.00%) | 0/19 (0.00%) |
| apps/website/src/features/media/import-media-entity.ts | NEVER-LOADED | 65 | 0/65 (0.00%) | 0/54 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/members/tool-registrations.ts | NEVER-LOADED | 65 | 0/65 (0.00%) | 0/18 (0.00%) | 0/10 (0.00%) |
| apps/website/src/server/inbound/admin-http/admin-dev-proxy.ts | NEVER-LOADED | 65 | 0/65 (0.00%) | 0/32 (0.00%) | 0/17 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/site-shares.ts | NEVER-LOADED | 65 | 0/65 (0.00%) | 0/62 (0.00%) | 0/14 (0.00%) |
| content/agent-plugins/google-workspace/lib/picker-flow.mjs | NEVER-LOADED | 65 | 0/65 (0.00%) | 0/32 (0.00%) | 0/19 (0.00%) |
| apps/desktop/bin/tovu-desktop.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/30 (0.00%) | 0/7 (0.00%) |
| apps/desktop/src/workspace-chat-ipc.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/28 (0.00%) | 0/28 (0.00%) |
| apps/site-chat/src/SiteAssistantWidget.tsx | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/24 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/agent-plugins/admin-surfaces/delivery-bindings.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/32 (0.00%) | 0/26 (0.00%) |
| apps/website/src/features/api-connections/surface-connections.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/30 (0.00%) | 0/22 (0.00%) |
| apps/website/src/features/database-transfer/table-catalog.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/60 (0.00%) | 0/34 (0.00%) |
| apps/website/src/features/site-backup/import-restore-placement.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/36 (0.00%) | 0/7 (0.00%) |
| apps/website/src/platform/server-logs/log-file.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/44 (0.00%) | 0/12 (0.00%) |
| apps/website/src/platform/site-dir/boot-site-dir.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/16 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/plugins/install.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/56 (0.00%) | 0/16 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/plugins/set-enabled.ts | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/38 (0.00%) | 0/9 (0.00%) |
| content/agent-plugins/google-workspace/lib/http.mjs | NEVER-LOADED | 64 | 0/64 (0.00%) | 0/52 (0.00%) | 0/14 (0.00%) |
| apps/desktop/scripts/verify-package.ts | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/18 (0.00%) | 0/8 (0.00%) |
| apps/website/src/cli/commands/init.ts | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/54 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/media/tool-registrations.ts | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/30 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/publish-content/backstop-service.ts | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/76 (0.00%) | 0/24 (0.00%) |
| apps/website/src/features/site-inspection/site-profile.ts | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/34 (0.00%) | 0/34 (0.00%) |
| content/agent-plugins/google-workspace/form-destinations/mapping.mjs | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/54 (0.00%) | 0/23 (0.00%) |
| content/agent-plugins/google-workspace/ui/connection-panel.handler.mjs | NEVER-LOADED | 63 | 0/63 (0.00%) | 0/12 (0.00%) | 0/28 (0.00%) |
| apps/desktop/src/agent-plugin-tokens.ts | NEVER-LOADED | 62 | 0/62 (0.00%) | 0/42 (0.00%) | 0/17 (0.00%) |
| apps/website/src/assistant/agents.ts | NEVER-LOADED | 62 | 0/62 (0.00%) | 0/56 (0.00%) | 0/28 (0.00%) |
| apps/website/src/assistant/demo-image-png.ts | NEVER-LOADED | 62 | 0/62 (0.00%) | 0/16 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/agent-plugins/install-tool.ts | NEVER-LOADED | 62 | 0/62 (0.00%) | 0/56 (0.00%) | 0/13 (0.00%) |
| apps/website/src/features/entries/trash-aware-memory-repo.ts | NEVER-LOADED | 62 | 0/62 (0.00%) | 0/64 (0.00%) | 0/21 (0.00%) |
| apps/website/src/features/site-backup/share-hosting.ts | NEVER-LOADED | 62 | 0/62 (0.00%) | 0/50 (0.00%) | 0/17 (0.00%) |
| apps/website/src/features/theme/file-identity-lock.ts | NEVER-LOADED | 62 | 0/62 (0.00%) | 0/44 (0.00%) | 0/14 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/recovery/restore.ts | NEVER-LOADED | 62 | 0/62 (0.00%) | 0/32 (0.00%) | 0/13 (0.00%) |
| apps/website/src/cli/commands/adopt.ts | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/24 (0.00%) | 0/10 (0.00%) |
| apps/website/src/features/agent-plugins/new-site-agent-plugin-tokens.ts | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/34 (0.00%) | 0/12 (0.00%) |
| apps/website/src/features/media/view-image-tool.ts | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/34 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/navigation/import-menu.ts | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/32 (0.00%) | 0/10 (0.00%) |
| apps/website/src/features/navigation/repo.ts | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/24 (0.00%) | 0/43 (0.00%) |
| apps/website/src/features/sites/site-admin.ts | NEVER-LOADED | 61 | 0/61 (0.00%) | 0/52 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/deployments/static-publish/publish-history.ts | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/66 (0.00%) | 0/22 (0.00%) |
| apps/website/src/features/pages/html-document-store.memory.ts | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/38 (0.00%) | 0/10 (0.00%) |
| apps/website/src/features/site-inspection/page-body.ts | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/54 (0.00%) | 0/8 (0.00%) |
| content/agent-plugins/cloudflare/lib/domains.mjs | NEVER-LOADED | 60 | 0/60 (0.00%) | 0/40 (0.00%) | 0/20 (0.00%) |
| apps/desktop/scripts/check-tree-quiet.ts | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/14 (0.00%) | 0/11 (0.00%) |
| apps/website/src/cli/errors.ts | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/34 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/web-screenshot/playwright-page-capture.ts | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/38 (0.00%) | 0/25 (0.00%) |
| apps/website/src/features/webhooks/site-key-sources.ts | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/30 (0.00%) | 0/14 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/taxonomy/assign-terms.ts | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/30 (0.00%) | 0/12 (0.00%) |
| apps/website/src/server/runtime/composition/pending-agent-plugin-tokens.ts | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/18 (0.00%) | 0/7 (0.00%) |
| content/agent-plugins/fly/deploy-ops/fly.mjs | NEVER-LOADED | 59 | 0/59 (0.00%) | 0/108 (0.00%) | 0/33 (0.00%) |
| apps/website/src/assistant/external-mcp-store.memory.ts | NEVER-LOADED | 58 | 0/58 (0.00%) | 0/20 (0.00%) | 0/20 (0.00%) |
| apps/website/src/features/settings/site-title.ts | NEVER-LOADED | 58 | 0/58 (0.00%) | 0/28 (0.00%) | 0/12 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/database/restore-points.ts | NEVER-LOADED | 58 | 0/58 (0.00%) | 0/26 (0.00%) | 0/10 (0.00%) |
| apps/website/src/server/runtime/lifecycle/close-store-on-shutdown.ts | NEVER-LOADED | 58 | 0/58 (0.00%) | 0/20 (0.00%) | 0/21 (0.00%) |
| content/agent-plugins/google-workspace/ui/dom.mjs | NEVER-LOADED | 58 | 0/58 (0.00%) | 0/48 (0.00%) | 0/17 (0.00%) |
| apps/website/src/assistant/mcp-federation/registrations.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/32 (0.00%) | 0/19 (0.00%) |
| apps/website/src/cli/commands/export.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/32 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/agent-plugins/import-access-token.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/44 (0.00%) | 0/10 (0.00%) |
| apps/website/src/features/source-control/provider-registry.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/30 (0.00%) | 0/42 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/agent-plugins/set-enabled.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/30 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/upload.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/38 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/export-site.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/40 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/runtime/composition/move-site-storage.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/16 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/runtime/composition/storage-secret.ts | NEVER-LOADED | 57 | 0/57 (0.00%) | 0/20 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/api-connections/vault-stores.ts | NEVER-LOADED | 56 | 0/56 (0.00%) | 0/38 (0.00%) | 0/24 (0.00%) |
| apps/website/src/features/identity/default-credential-exposure.ts | NEVER-LOADED | 56 | 0/56 (0.00%) | 0/16 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/media/provider-credential-vault.ts | NEVER-LOADED | 56 | 0/56 (0.00%) | 0/50 (0.00%) | 0/28 (0.00%) |
| apps/website/src/features/publish-trust/challenge.ts | NEVER-LOADED | 56 | 0/56 (0.00%) | 0/38 (0.00%) | 0/13 (0.00%) |
| apps/website/src/features/vendor-credentials/vault-adapter.ts | NEVER-LOADED | 56 | 0/56 (0.00%) | 0/82 (0.00%) | 0/36 (0.00%) |
| apps/website/src/server/runtime/services/external-mcp-probe.ts | NEVER-LOADED | 56 | 0/56 (0.00%) | 0/46 (0.00%) | 0/11 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/index.ts | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/media/publish-content.ts | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/38 (0.00%) | 0/25 (0.00%) |
| apps/website/src/features/theme/static-portability-index.ts | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/22 (0.00%) | 0/16 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/plugins/preview.ts | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/46 (0.00%) | 0/9 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/dockerfile-source.ts | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/24 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/form-validation-message.ts | NEVER-LOADED | 55 | 0/55 (0.00%) | 0/50 (0.00%) | 0/18 (0.00%) |
| apps/website/src/assistant/execution-credential-store.ts | NEVER-LOADED | 54 | 0/54 (0.00%) | 0/44 (0.00%) | 0/13 (0.00%) |
| apps/website/src/contracts/core/commands/revert.ts | NEVER-LOADED | 54 | 0/54 (0.00%) | 0/32 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/webhooks/repo.memory.ts | NEVER-LOADED | 54 | 0/54 (0.00%) | 0/40 (0.00%) | 0/26 (0.00%) |
| apps/website/src/platform/oauth/endpoint-safety.ts | NEVER-LOADED | 54 | 0/54 (0.00%) | 0/44 (0.00%) | 0/14 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/comments/moderate.ts | NEVER-LOADED | 54 | 0/54 (0.00%) | 0/36 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/pages/update.ts | NEVER-LOADED | 54 | 0/54 (0.00%) | 0/36 (0.00%) | 0/8 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts | NEVER-LOADED | 54 | 0/54 (0.00%) | 0/30 (0.00%) | 0/9 (0.00%) |
| apps/website/src/server/runtime/composition/modules/content.ts | NEVER-LOADED | 54 | 0/54 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/desktop/scripts/check-complexity.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| apps/website/src/assistant/external-mcp-vault.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/36 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/fs-files/custom-root-store.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/22 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/pages/hidden-until-script.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/24 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/publish-content/type-registry.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/22 (0.00%) | 0/18 (0.00%) |
| apps/website/src/features/publish-trust/session.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/34 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/seo/tool-registrations.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/2 (0.00%) | 0/16 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/database/migrate-forward.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/30 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/posts/update.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/48 (0.00%) | 0/9 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/site/profile.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/26 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/update.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/36 (0.00%) | 0/8 (0.00%) |
| apps/website/src/server/inbound/assistant/durable-run-routes.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/60 (0.00%) | 0/13 (0.00%) |
| apps/website/src/server/runtime/boot/production-readiness-gate.ts | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/34 (0.00%) | 0/8 (0.00%) |
| content/agent-plugins/google-workspace/lib/request-policy.mjs | NEVER-LOADED | 53 | 0/53 (0.00%) | 0/54 (0.00%) | 0/13 (0.00%) |
| apps/website/src/assistant/tool-approval-policy.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/78 (0.00%) | 0/21 (0.00%) |
| apps/website/src/features/agent-plugins/apply-tool-renames.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/44 (0.00%) | 0/10 (0.00%) |
| apps/website/src/features/agent-plugins/lifecycle.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/28 (0.00%) | 0/45 (0.00%) |
| apps/website/src/features/custom-credentials/vault-repo.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/60 (0.00%) | 0/17 (0.00%) |
| apps/website/src/features/deployments/deploy-targets/host-kit.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/26 (0.00%) | 0/34 (0.00%) |
| apps/website/src/features/post/reverters.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/36 (0.00%) | 0/13 (0.00%) |
| apps/website/src/features/site-evidence/tool-registrations.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/30 (0.00%) | 0/10 (0.00%) |
| apps/website/src/platform/site-dir/read-site-dir.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/26 (0.00%) | 0/8 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/agent-plugins/admin-surfaces.ts | NEVER-LOADED | 52 | 0/52 (0.00%) | 0/32 (0.00%) | 0/17 (0.00%) |
| apps/desktop/src/renderer/SiteGrid.tsx | LOADED | 51 | 638/689 (92.60%) | 15/28 (53.57%) | 8/25 (32.00%) |
| apps/website/src/features/entries/unreadable-owner-entries-repair.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/24 (0.00%) | 0/12 (0.00%) |
| apps/website/src/features/members/access-resolver.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/33 (0.00%) | 0/12 (0.00%) |
| apps/website/src/features/plugin-runtime/built-ins/content-analyzer/tiptap-blocks.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/44 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/plugin-runtime/source-tools.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/16 (0.00%) | 0/23 (0.00%) |
| apps/website/src/features/site-inspection/tool-registrations.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/24 (0.00%) | 0/18 (0.00%) |
| apps/website/src/features/trash/adapters/user.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/28 (0.00%) | 0/19 (0.00%) |
| apps/website/src/platform/db/repos/webhook-repo.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/20 (0.00%) | 0/43 (0.00%) |
| apps/website/src/platform/db/sqlite/publish-backstop-row.sqlite.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/40 (0.00%) | 0/28 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/api-connections/oauth-callback.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/36 (0.00%) | 0/12 (0.00%) |
| apps/website/src/server/runtime/boot/bootstrap.ts | NEVER-LOADED | 51 | 0/51 (0.00%) | 0/20 (0.00%) | 0/21 (0.00%) |
| apps/website/src/assistant/external-mcp-federation-runtime.ts | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/22 (0.00%) | 0/17 (0.00%) |
| apps/website/src/assistant/site/tools.ts | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/34 (0.00%) | 0/15 (0.00%) |
| apps/website/src/features/forms/import-remote-submissions.ts | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/28 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/site-backup/import-registry.ts | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/38 (0.00%) | 0/20 (0.00%) |
| apps/website/src/features/source-control/credential-form.ts | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/64 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/theme/liquid-allowlist.ts | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/24 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/trash/tool-registrations.ts | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/22 (0.00%) | 0/11 (0.00%) |
| apps/website/src/platform/db/repos/external-mcp-repo.ts | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/28 (0.00%) | 0/27 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/32 (0.00%) | 0/8 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/menus/update-tree.ts | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/42 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/posts/template-preview.ts | NEVER-LOADED | 50 | 0/50 (0.00%) | 0/28 (0.00%) | 0/6 (0.00%) |
| apps/admin/src/components/Select/Select.hooks.tsx | LOADED | 49 | 3/52 (5.77%) | 0/44 (0.00%) | 1/10 (10.00%) |
| apps/desktop/src/sites-mcp-tools.ts | NEVER-LOADED | 49 | 0/49 (0.00%) | 0/26 (0.00%) | 0/15 (0.00%) |
| apps/website/src/assistant/ask-choice-tool.ts | NEVER-LOADED | 49 | 0/49 (0.00%) | 0/38 (0.00%) | 0/24 (0.00%) |
| apps/website/src/features/consent/settings.ts | NEVER-LOADED | 49 | 0/49 (0.00%) | 0/38 (0.00%) | 0/15 (0.00%) |
| apps/website/src/features/publish-content/report-labels.ts | NEVER-LOADED | 49 | 0/49 (0.00%) | 0/60 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/deployments/static-publish/domain-publish-tool.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/26 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/domain-dns/tools.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/12 (0.00%) | 0/19 (0.00%) |
| apps/website/src/features/form-destinations/port.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/32 (0.00%) | 0/10 (0.00%) |
| apps/website/src/features/newsletter/subscriptions.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/20 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/post/repo.memory.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/48 (0.00%) | 0/28 (0.00%) |
| apps/website/src/features/post/repo.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/16 (0.00%) | 0/37 (0.00%) |
| apps/website/src/features/sites/site-preview/site-preview-service.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/30 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/theme/trash-theme-tool.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/24 (0.00%) | 0/9 (0.00%) |
| apps/website/src/platform/db/sqlite/content-db.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/20 (0.00%) | 0/6 (0.00%) |
| apps/website/src/platform/server-logs/index.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/16 (0.00%) | 0/18 (0.00%) |
| apps/website/src/server/inbound/public-http/middleware/site-consent.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/18 (0.00%) | 0/13 (0.00%) |
| apps/website/src/server/inbound/public-http/middleware/theme-preview-refresh.ts | NEVER-LOADED | 48 | 0/48 (0.00%) | 0/20 (0.00%) | 0/10 (0.00%) |
| apps/website/src/assistant/site-credential-store.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/28 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/deployments/static-publish/publish-run.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/24 (0.00%) | 0/12 (0.00%) |
| apps/website/src/features/newsletter/unsubscribe.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/32 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/pages/update-html.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/20 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/sites/sites-home.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/46 (0.00%) | 0/8 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/credential-copy.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/44 (0.00%) | 0/13 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/themes/preview.ts | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/38 (0.00%) | 0/9 (0.00%) |
| content/agent-plugins/google-workspace/lib/sheets-admin-request-kinds.mjs | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/38 (0.00%) | 0/13 (0.00%) |
| content/agent-plugins/google-workspace/ui/destination-panel.handler.mjs | NEVER-LOADED | 47 | 0/47 (0.00%) | 0/30 (0.00%) | 0/20 (0.00%) |
| apps/website/src/features/form-destinations/pull.ts | NEVER-LOADED | 46 | 0/46 (0.00%) | 0/16 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/newsletter/confirmation.ts | NEVER-LOADED | 46 | 0/46 (0.00%) | 0/22 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/site-backup/share-backend.ts | NEVER-LOADED | 46 | 0/46 (0.00%) | 0/28 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/site-backup/share-zip.ts | NEVER-LOADED | 46 | 0/46 (0.00%) | 0/14 (0.00%) | 0/8 (0.00%) |
| apps/website/src/platform/server-logs/console-tee.ts | NEVER-LOADED | 46 | 0/46 (0.00%) | 0/24 (0.00%) | 0/10 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/replace.ts | NEVER-LOADED | 46 | 0/46 (0.00%) | 0/28 (0.00%) | 0/5 (0.00%) |
| apps/desktop/src/workspace-conversation-store.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/22 (0.00%) | 0/30 (0.00%) |
| apps/site-chat/src/SiteAssistantActivation.hooks.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/16 (0.00%) | 0/15 (0.00%) |
| apps/website/src/assistant/demo-a2ui-tool.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/20 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/agent-plugins/uninstall-tool.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/16 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/members/consent-service.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/16 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/site-inspection/site-capabilities.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/20 (0.00%) | 0/21 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/update-campaign.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/44 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/settings/shared.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/22 (0.00%) | 0/16 (0.00%) |
| apps/website/src/server/runtime/composition/agent-plugin-connections.ts | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/18 (0.00%) | 0/19 (0.00%) |
| content/agent-plugins/resend/adapters/resend.mjs | NEVER-LOADED | 45 | 0/45 (0.00%) | 0/38 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/comments/settings.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/36 (0.00%) | 0/17 (0.00%) |
| apps/website/src/features/fs-files/tool-registrations.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/10 (0.00%) | 0/13 (0.00%) |
| apps/website/src/features/media/hydrate-blob-store-from-seed.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/22 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/site-backup/share-file-policy.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/38 (0.00%) | 0/13 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/trash/restore.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/32 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/reset-password.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/24 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/runtime/composition/agent-daemon-deps.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/30 (0.00%) | 0/13 (0.00%) |
| apps/website/src/server/runtime/composition/modules/newsletter.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/lifecycle/agent-daemon-port.ts | NEVER-LOADED | 44 | 0/44 (0.00%) | 0/22 (0.00%) | 0/13 (0.00%) |
| apps/website/src/assistant/byok-meta-tool-result.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/48 (0.00%) | 0/9 (0.00%) |
| apps/website/src/contracts/core/human-confirm.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/34 (0.00%) | 0/21 (0.00%) |
| apps/website/src/features/api-connections/budgets.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/30 (0.00%) | 0/10 (0.00%) |
| apps/website/src/features/content-duplication/tool-registrations.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/14 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/identity/wiring.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/18 (0.00%) | 0/12 (0.00%) |
| apps/website/src/features/navigation/migrate-footer-page-links.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/38 (0.00%) | 0/17 (0.00%) |
| apps/website/src/features/plugin-runtime/install-tool.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/18 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/publish-content/backstop-policy.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/40 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/settings/publish-content.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/38 (0.00%) | 0/16 (0.00%) |
| apps/website/src/features/site-backup/import-verifier-projection.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/32 (0.00%) | 0/11 (0.00%) |
| apps/website/src/platform/db/repos/publish-trust-revocations.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/22 (0.00%) | 0/16 (0.00%) |
| apps/website/src/platform/db/sqlite/database-journal-repo.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/38 (0.00%) | 0/30 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/test-connection.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/24 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/settings/register-definitions.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/20 (0.00%) | 0/11 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/trash/items.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/29 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/create.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/28 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/public-http/middleware/theme-static-assets.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/30 (0.00%) | 0/11 (0.00%) |
| apps/website/src/server/runtime/lifecycle/boot-lifecycle.ts | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/12 (0.00%) | 0/10 (0.00%) |
| content/agent-plugins/google-workspace/ui/picker.mjs | NEVER-LOADED | 43 | 0/43 (0.00%) | 0/18 (0.00%) | 0/12 (0.00%) |
| apps/desktop/src/smoke-native.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/20 (0.00%) | 0/9 (0.00%) |
| apps/website/src/assistant/live-model-cache.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/26 (0.00%) | 0/10 (0.00%) |
| apps/website/src/assistant/mcp-federation/bootstrap.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/26 (0.00%) | 0/31 (0.00%) |
| apps/website/src/features/agent-plugins/mail-adapter-registry.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/32 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/api-connections/plugin-state.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/28 (0.00%) | 0/16 (0.00%) |
| apps/website/src/features/database-transfer/destination-store.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/32 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/publish-content/ui/replan.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/26 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/webmcp/published-html.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/18 (0.00%) | 0/6 (0.00%) |
| apps/website/src/platform/db/migrations/index.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/consent/routes.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/32 (0.00%) | 0/9 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/menus/assign-location.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/24 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/sites/local-sites.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/36 (0.00%) | 0/12 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/skills/manage.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/34 (0.00%) | 0/15 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/disable.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/20 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/runtime/composition/modules/users.ts | NEVER-LOADED | 42 | 0/42 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/assistant/demo-choices-tool.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/22 (0.00%) | 0/8 (0.00%) |
| apps/website/src/assistant/render-ui-tool.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/22 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/deployments/tool-registrations.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/16 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/media/versioned-media-repo.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/44 (0.00%) | 0/25 (0.00%) |
| apps/website/src/features/theme/sync-originals.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/10 (0.00%) | 0/10 (0.00%) |
| apps/website/src/platform/site-dir/duplicate-pglite-store.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/posts/template-preview-render.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/32 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/enable.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/20 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/page-head.ts | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/22 (0.00%) | 0/10 (0.00%) |
| content/agent-plugins/google-workspace/ui/picker-flow.mjs | NEVER-LOADED | 41 | 0/41 (0.00%) | 0/18 (0.00%) | 0/12 (0.00%) |
| apps/site-chat/src/site-chat-comparison.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/20 (0.00%) | 0/17 (0.00%) |
| apps/site-chat/src/vanilla-host.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/24 (0.00%) | 0/17 (0.00%) |
| apps/website/src/assistant/a2ui-actions-route.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/26 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/agent-plugins/memory.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/12 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/custom-credentials/credential-save-tool.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/34 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/database/tool-registrations.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/4 (0.00%) | 0/19 (0.00%) |
| apps/website/src/features/theme/preview-refresh.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/28 (0.00%) | 0/6 (0.00%) |
| apps/website/src/platform/observability/otel.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/12 (0.00%) | 0/16 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/content-types/update-fields.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/24 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/forms/update.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/28 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/import-url.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/24 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/products.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/18 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/store.ts | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/20 (0.00%) | 0/6 (0.00%) |
| content/agent-plugins/cloudflare/lib/domain-inventory.mjs | NEVER-LOADED | 40 | 0/40 (0.00%) | 0/26 (0.00%) | 0/20 (0.00%) |
| apps/website/src/features/forms/index.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/8 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/media/promote-chat-attachment.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/20 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/navigation/repoint-menu-refs.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/22 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/post/preview-tool.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/24 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/post/search.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/30 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/server-logs/read-server-logs.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/50 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/settings/chat-execution-write.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/34 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/theme/set-active-theme-tool.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/theme/theme-file-import.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/14 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/theme/theme-watcher.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/14 (0.00%) | 0/11 (0.00%) |
| apps/website/src/platform/site-dir/seed-site-themes.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/30 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/list-models.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/24 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/posts/delete.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/22 (0.00%) | 0/8 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/peers.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/16 (0.00%) | 0/9 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/region-mutate-placements.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/30 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/external-links.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/24 (0.00%) | 0/10 (0.00%) |
| apps/website/src/server/runtime/composition/site-guide.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/24 (0.00%) | 0/14 (0.00%) |
| apps/website/src/server/runtime/configuration/seed.ts | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/10 (0.00%) | 0/18 (0.00%) |
| content/agent-plugins/cloudflare/lib/assets.mjs | NEVER-LOADED | 39 | 0/39 (0.00%) | 0/30 (0.00%) | 0/8 (0.00%) |
| apps/website/src/assistant/index.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/events/memory-bus.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/16 (0.00%) | 0/18 (0.00%) |
| apps/website/src/features/deployments/deploy-config.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/10 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/media/verify-published-media.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/20 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/newsletter/lists.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/18 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/plugin-runtime/host-binding.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/24 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/sites/site-preview/playwright-site-preview-capture.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/6 (0.00%) | 0/12 (0.00%) |
| apps/website/src/features/taxonomy/publish-term-ids.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/34 (0.00%) | 0/13 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/agent-plugins/install.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/22 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/content-types/lifecycle.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/20 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/content-types/register.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/24 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/entries/lifecycle.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/20 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/update.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/28 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/pages/delete.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/20 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/presentation/get.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/deployment-overview.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/14 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/runtime/composition/registered-sites.ts | NEVER-LOADED | 38 | 0/38 (0.00%) | 0/26 (0.00%) | 0/5 (0.00%) |
| apps/website/src/assistant/run-page-context.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/40 (0.00%) | 0/9 (0.00%) |
| apps/website/src/cli/commands/agent-plugin-tokens.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/6 (0.00%) | 0/9 (0.00%) |
| apps/website/src/contracts/headless/plugin-install-source.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/34 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/consent/readiness.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/28 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/custom-credentials/credentialed-request.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/12 (0.00%) | 0/21 (0.00%) |
| apps/website/src/features/newsletter/repo.rows.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/2 (0.00%) | 0/17 (0.00%) |
| apps/website/src/features/publish-trust/keys.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/12 (0.00%) | 0/8 (0.00%) |
| apps/website/src/platform/db/sqlite/import-database.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/16 (0.00%) | 0/6 (0.00%) |
| apps/website/src/platform/site-dir/site-databases.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/42 (0.00%) | 0/7 (0.00%) |
| apps/website/src/platform/site-dir/site-storage.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/22 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/entries/create.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/26 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/write-policy-permission.ts | NEVER-LOADED | 37 | 0/37 (0.00%) | 0/28 (0.00%) | 0/4 (0.00%) |
| apps/website/src/assistant/tool-recovery-preset.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/16 (0.00%) | 0/19 (0.00%) |
| apps/website/src/features/newsletter/campaign.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/32 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/site-guide/facts.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/26 (0.00%) | 0/11 (0.00%) |
| apps/website/src/server/inbound/admin-http/admin-static.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/10 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/change-sets/revert.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/20 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/forms/list-submissions.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/22 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/trash.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/16 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/plugins/uninstall.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/18 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/blob-put.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/22 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/blobs-probe.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/22 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/trash/list.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/24 (0.00%) | 0/11 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/delete.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/18 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/remove-policy-permission.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/24 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/worker-sandbox.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/12 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/members/complete-sign-in.ts | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| content/agent-plugins/google-workspace/lib/picker-selection.mjs | NEVER-LOADED | 36 | 0/36 (0.00%) | 0/18 (0.00%) | 0/6 (0.00%) |
| apps/website/src/assistant/admin-screen-link-tool.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/16 (0.00%) | 0/5 (0.00%) |
| apps/website/src/cli/commands/deploy-config.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/14 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/analytics/tool-registrations.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/28 (0.00%) | 0/12 (0.00%) |
| apps/website/src/features/consent/validation.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/58 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/deployments/deploy-ops/typed-secret-card.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/30 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/media/duplicate-asset.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/16 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/navigation/html-render.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/32 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/navigation/trash-aware-memory-menu-repo.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/22 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/post/html-plain-text.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/20 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/site-backup/push-jobs.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/18 (0.00%) | 0/12 (0.00%) |
| apps/website/src/features/theme/active-theme-publish-content.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/26 (0.00%) | 0/13 (0.00%) |
| apps/website/src/features/theme/theme-preview-image.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/24 (0.00%) | 0/5 (0.00%) |
| apps/website/src/platform/db/repos/origin-repo.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/30 (0.00%) | 0/19 (0.00%) |
| apps/website/src/platform/site-dir/active-site.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/18 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/agent-plugins/memory.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/18 (0.00%) | 0/8 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/members/request-magic-link.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/20 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/pages/create.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/20 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/posts/create.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/20 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/export.ts | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| content/agent-plugins/cloudflare/lib/workers-upload.mjs | NEVER-LOADED | 35 | 0/35 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| apps/desktop/src/desktop-agent-tools.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/22 (0.00%) | 0/14 (0.00%) |
| apps/desktop/src/nested-sites-migration.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/26 (0.00%) | 0/9 (0.00%) |
| apps/site-chat/src/highlight.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/16 (0.00%) | 0/9 (0.00%) |
| apps/website/src/assistant/external-mcp-connection-source.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/12 (0.00%) | 0/9 (0.00%) |
| apps/website/src/cli/commands/plugin/install.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/18 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/agent-plugins/switch-on-saved-token.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/25 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/change-sets/tool-registrations.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/22 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/deployments/export-run.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/10 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/publish-content/bundle-staging.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/12 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/theme/validation/references.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| apps/website/src/platform/site-dir/site-key-dependent-data.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/17 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/entries/update.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/24 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/fs-files/custom-root.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/28 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/blob-get.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/16 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/route-helpers.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/24 (0.00%) | 0/9 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/seo/put-entry.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/20 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/shared/json-body-parsers.ts | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/22 (0.00%) | 0/7 (0.00%) |
| content/agent-plugins/google-workspace/lib/sheets-admin-csv.mjs | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/14 (0.00%) | 0/7 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets-admin/export-csv.mjs | NEVER-LOADED | 34 | 0/34 (0.00%) | 0/22 (0.00%) | 0/7 (0.00%) |
| apps/desktop/scripts/smoke-bridge.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/18 (0.00%) | 0/3 (0.00%) |
| apps/desktop/src/project-delete-guard.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/20 (0.00%) | 0/5 (0.00%) |
| apps/desktop/src/renderer/use-site-workspace.hooks.ts | LOADED | 33 | 334/367 (91.01%) | 85/87 (97.70%) | 28/29 (96.55%) |
| apps/website/src/cli/commands/import-site.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/26 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/api-connections/form-delivery-connection.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/20 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/database/repo.memory.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/36 (0.00%) | 0/28 (0.00%) |
| apps/website/src/features/publish-content/content-references.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/24 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/sites/site-preview/site-preview-store.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/trash/adapters/marker-sql.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/20 (0.00%) | 0/11 (0.00%) |
| apps/website/src/platform/db/key-dependent-data.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/12 (0.00%) | 0/7 (0.00%) |
| apps/website/src/platform/server-logs/log-buffer.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/18 (0.00%) | 0/9 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/detect-agents.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/36 (0.00%) | 0/13 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/forms/pull-submissions.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/22 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/runtime/composition/modules/publish-content.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/runtime/composition/publish-content-manifest.ts | NEVER-LOADED | 33 | 0/33 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/site-chat/src/loader-host.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/36 (0.00%) | 0/6 (0.00%) |
| apps/website/src/assistant/assistant-vault.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/26 (0.00%) | 0/10 (0.00%) |
| apps/website/src/assistant/byok-credential.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/32 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/external-mcp/save-form.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/62 (0.00%) | 0/12 (0.00%) |
| apps/website/src/features/publish-content/peer-url.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/24 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/publish-trust/connect.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/seo/cover-image.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/32 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/site-backup/import-archive-reader.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/14 (0.00%) | 0/10 (0.00%) |
| apps/website/src/features/skills/install-service.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/4 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/taxonomy/publish-content.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/18 (0.00%) | 0/23 (0.00%) |
| apps/website/src/features/trash/repo.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/20 (0.00%) | 0/25 (0.00%) |
| apps/website/src/platform/db/migrations/0020_vault_api_connection_kind.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| apps/website/src/platform/http/test-origin-allowlist.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/20 (0.00%) | 0/9 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/menus/create.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/24 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/presentation/patch-active-theme.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/16 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/redirects/create.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/22 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/members/sign-in.ts | NEVER-LOADED | 32 | 0/32 (0.00%) | 0/18 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/agent-plugins/memory-tools.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/18 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/consent/tool-registrations.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/16 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/deployments/static-publish/inspection.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/22 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/external-mcp/operations-tools.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/16 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/plugins/migration-journal.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/0 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/plugins/plugin-identity.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/22 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/theme/duplicate-theme-tool.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/10 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/theme/import-theme-file-tool.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/6 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/workspace/tool-registrations.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/14 (0.00%) | 0/10 (0.00%) |
| apps/website/src/server/inbound/admin-http/http/forms.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/14 (0.00%) | 0/8 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/settings/assistant-subagents-access.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/28 (0.00%) | 0/8 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/assign-role.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/18 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/attach-policy.ts | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/18 (0.00%) | 0/3 (0.00%) |
| content/agent-plugins/cloudflare/lib/domain-status.mjs | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/36 (0.00%) | 0/11 (0.00%) |
| content/agent-plugins/cloudflare/lib/pages-upload.mjs | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/14 (0.00%) | 0/6 (0.00%) |
| content/agent-plugins/google-workspace/lib/surface-actions.mjs | NEVER-LOADED | 31 | 0/31 (0.00%) | 0/16 (0.00%) | 0/8 (0.00%) |
| apps/desktop/src/admin-dev-proxy.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/16 (0.00%) | 0/7 (0.00%) |
| apps/desktop/src/renderer/use-site-power.hooks.ts | LOADED | 30 | 300/330 (90.91%) | 69/72 (95.83%) | 16/21 (76.19%) |
| apps/website/src/features/agent-plugins/capability-projection.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/forms/submission-ip-expiry-sweep.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/14 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/publish-content/gated-hooks.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/14 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/settings/tool-registrations.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/28 (0.00%) | 0/10 (0.00%) |
| apps/website/src/features/trash/permissions.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/web/tool-registrations.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/18 (0.00%) | 0/6 (0.00%) |
| apps/website/src/platform/secrets/vault-kinds.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/22 (0.00%) | 0/17 (0.00%) |
| apps/website/src/platform/site-dir/product-root.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/22 (0.00%) | 0/8 (0.00%) |
| apps/website/src/platform/site-dir/read-applied-schema-identity.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/18 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/put-site-credential.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/16 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/test-agent.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/20 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/put.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/24 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/create-campaign.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/18 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/trash/purge.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/20 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/workspace/delete.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/18 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/workspace/update.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/18 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/external-mcp/oauth-callback.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/22 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/runtime/composition/modules/widgets.ts | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/google-workspace/lib/sheets-a1.mjs | NEVER-LOADED | 30 | 0/30 (0.00%) | 0/20 (0.00%) | 0/10 (0.00%) |
| apps/website/src/features/agent-plugins/deploy-split-activation.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/18 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/agent-plugins/descriptor-i18n.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/24 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/api-connections/browser-binding.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/10 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/members/repo.rows.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/94 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/publish-content/backstop-preview.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/40 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/site-inspection/section-collector.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/16 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/theme/page-publication.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/trash/move-to-trash.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/28 (0.00%) | 0/4 (0.00%) |
| apps/website/src/platform/site-dir/local-admin-bundle.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/8 (0.00%) | 0/10 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/forms/delete-submission.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/16 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/forms/get-submission.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/update-policy.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/18 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/bare-page.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/24 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/analytics-ingest.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/24 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/runtime/composition/modules/media.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/publish-content-seed-hash.ts | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/2 (0.00%) | 0/5 (0.00%) |
| content/agent-plugins/google-workspace/ui/connection-view.mjs | NEVER-LOADED | 29 | 0/29 (0.00%) | 0/30 (0.00%) | 0/15 (0.00%) |
| apps/site-chat/src/main.tsx | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| apps/website/src/assistant/run-start-context.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/28 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/agent-plugins/layout.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/28 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/entries/publish-content.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/12 (0.00%) | 0/12 (0.00%) |
| apps/website/src/features/identity/builtin-role-grants.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/site-backup/import-restore.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/theme/hardcoded-link-lists.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/20 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/web-screenshot/desktop-page-capture.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/22 (0.00%) | 0/7 (0.00%) |
| apps/website/src/platform/db/sqlite/chat-orphan-check.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/10 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/inbound/admin-http/http/widgets.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/12 (0.00%) | 0/19 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/put-execution-credential.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/22 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/delete-policy.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/14 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/delete-role.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/14 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/handlebars-render.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/liquid-render.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/8 (0.00%) | 0/11 (0.00%) |
| apps/website/src/server/runtime/boot/boot-readiness-warnings.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/26 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/runtime/composition/installed-extension-tools.ts | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| content/agent-plugins/google-workspace/lib/product-state.mjs | NEVER-LOADED | 28 | 0/28 (0.00%) | 0/12 (0.00%) | 0/12 (0.00%) |
| apps/desktop/scripts/check-js-backslide.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| apps/website/src/assistant/run-active-context.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/20 (0.00%) | 0/9 (0.00%) |
| apps/website/src/assistant/site/history.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/26 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/agent-plugins/executable-tools/host-capabilities.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/22 (0.00%) | 0/15 (0.00%) |
| apps/website/src/features/media/index.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/post/duplicate-embeds.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/8 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/redirects/publish-content.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/14 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/theme/validation/markup.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/14 (0.00%) | 0/12 (0.00%) |
| apps/website/src/platform/site-dir/duplicate-content-db.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/platform/site-dir/sites-home.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/20 (0.00%) | 0/8 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/integrations/deliveries.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/14 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/integrations/pause.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/schedule-campaign.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/16 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/settings/clear.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/16 (0.00%) | 0/8 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/settings/set.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/16 (0.00%) | 0/9 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/sites/site-previews.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/22 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/create-policy.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/list.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/12 (0.00%) | 0/10 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/update-role.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/region-get.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/20 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/runtime/composition/open-site-content-db.ts | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/google-workspace/lib/auth.mjs | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/10 (0.00%) | 0/9 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets-admin/format.mjs | NEVER-LOADED | 27 | 0/27 (0.00%) | 0/26 (0.00%) | 0/12 (0.00%) |
| apps/website/src/assistant/agent-daemon-port.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/assistant/cli-probe-cache.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/12 (0.00%) | 0/9 (0.00%) |
| apps/website/src/assistant/tool-catalog-query.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/10 (0.00%) | 0/13 (0.00%) |
| apps/website/src/features/agent-plugins/write-note-tool.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/content-types/publish-content.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/22 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/custom-credentials/auth-schemes.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/6 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/deployments/deploy-ops/agent-tools.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/8 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/permanent-delete/tool-registrations.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/12 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/publish-content/composite-blob-source.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/12 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/trash/index.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/platform/db/migrations/0006_submission_ip_retention.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/12 (0.00%) | 0/5 (0.00%) |
| apps/website/src/platform/db/prepare-content-store.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/16 (0.00%) | 0/10 (0.00%) |
| apps/website/src/platform/db/repos/change-set-repo.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/46 (0.00%) | 0/17 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/agent-plugins/install-response.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/28 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/plugins/chart-providers.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/16 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/assistant-owner-grant.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/30 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/themes/duplicate.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/18 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/forms-multipart.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/20 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/runtime/composition/modules/external-mcp.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/site-guide-tools.ts | NEVER-LOADED | 26 | 0/26 (0.00%) | 0/22 (0.00%) | 0/6 (0.00%) |
| apps/desktop/src/add-site-pointer.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/10 (0.00%) | 0/9 (0.00%) |
| apps/desktop/src/renderer/use-tab-strip.hooks.ts | LOADED | 25 | 51/76 (67.11%) | 24/24 (100.00%) | 8/9 (88.89%) |
| apps/website/src/assistant/external-mcp-revocation.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/28 (0.00%) | 0/12 (0.00%) |
| apps/website/src/cli/commands/theme/validate.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/form-destinations/key-store.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/14 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/plugin-runtime/invocation-core-deps.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/16 (0.00%) | 0/7 (0.00%) |
| apps/website/src/platform/db/sqlite/chat-db.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/platform/site-dir/nested-sites-root.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/14 (0.00%) | 0/8 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/comments/moderation-queue.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/14 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/list.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/members/disable.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/create-subscription.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/14 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/plugins/files.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/capabilities.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/settings/reset.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/skills/files.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts | NEVER-LOADED | 25 | 0/25 (0.00%) | 0/12 (0.00%) | 0/3 (0.00%) |
| apps/admin/src/features/library/Library.tsx | LOADED | 24 | 64/88 (72.73%) | 65/95 (68.42%) | 28/41 (68.29%) |
| apps/website/src/assistant/component-catalog-tool.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| apps/website/src/assistant/subagent-settings.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/14 (0.00%) | 0/5 (0.00%) |
| apps/website/src/cli/commands/storage-move.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/identity/boot-session-token.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/8 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/publish-content/connect-destination.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/site-backup/plan-store.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/18 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/skills/install-tool.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/10 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/theme/index.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/platform/db/repos/publish-history-repo.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/40 (0.00%) | 0/21 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/analytics/recent-hits.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/delete.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/members/get-by-id.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/server-logs.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/runtime/services/external-mcp-admissions.ts | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/20 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets/find.mjs | NEVER-LOADED | 24 | 0/24 (0.00%) | 0/18 (0.00%) | 0/9 (0.00%) |
| apps/website/src/assistant/component-catalog-query.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/16 (0.00%) | 0/18 (0.00%) |
| apps/website/src/assistant/public-assistant-settings.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| apps/website/src/assistant/site/capability-registry.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/6 (0.00%) | 0/11 (0.00%) |
| apps/website/src/cli/commands/theme/migrate.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/consent/revisions.repo.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/22 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/plugin-runtime/built-ins/word-count/index.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/publish-content/content-hash.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/trash/not-trashed.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/12 (0.00%) | 0/8 (0.00%) |
| apps/website/src/platform/db/kernel/sqlite-only.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| apps/website/src/platform/db/migrations/0011_drop_empty_core_commerce_tables.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/18 (0.00%) | 0/3 (0.00%) |
| apps/website/src/platform/http/client.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/10 (0.00%) | 0/7 (0.00%) |
| apps/website/src/platform/markdown/frontmatter.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/14 (0.00%) | 0/3 (0.00%) |
| apps/website/src/platform/site-dir/sites-project-references.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/38 (0.00%) | 0/14 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/agent-plugins/files.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/integrations/create.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/integrations/list.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/parse.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/20 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/pages/get-by-id.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/seo/get-entry-analyze.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/seo/get-entry.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/settings/get-raw.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/themes/list.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/12 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/preview.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/26 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/runtime/boot/site-key-boot-notice.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/22 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/runtime/composition/modules/agent-plugins.ts | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/data-table.tsx | NEVER-LOADED | 23 | 0/23 (0.00%) | 0/8 (0.00%) | 0/21 (0.00%) |
| apps/website/src/assistant/daemon-access.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/6 (0.00%) | 0/12 (0.00%) |
| apps/website/src/assistant/external-mcp-roster-change.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/6 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/database-transfer/destination-exchange.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/16 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/deployments/publish-credentials/account-label-heal-scheduler.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/4 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/fs-files/fs-files.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/0 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/identity/repo.sqlite.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/0 (0.00%) | 0/10 (0.00%) |
| apps/website/src/features/identity/reset-admin-password-self-verified.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/media-import/fetch-image.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/12 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/plugins/snapshot.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/post/repo.rows.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/58 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/post/search-index.postgres.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/6 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/publish-content/push-plan.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/20 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/settings/index.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/theme/page-publish-tool.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/14 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/theme/theme-roster-sync.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/12 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/trash/adapters/media.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| apps/website/src/platform/db/repos/gated-mutation-token-repo.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/10 (0.00%) | 0/17 (0.00%) |
| apps/website/src/platform/site-dir/site-running.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/10 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/inbound/admin-http/range.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/28 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/api-keys/deps.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/database/timeline.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/16 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/forms/create.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/22 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/put-providers.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/members/list.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/12 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/resend-confirmation.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/redirects/hits.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/redirects/import.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/redirects/tombstone.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/taxonomy/delete-term.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/create.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/runtime/boot/boot-readiness-gate.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/runtime/composition/modules/core.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/runtime/composition/modules/seo.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/lifecycle/local-site-host.ts | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/12 (0.00%) | 0/7 (0.00%) |
| content/agent-plugins/github/source-control/github.mjs | NEVER-LOADED | 22 | 0/22 (0.00%) | 0/12 (0.00%) | 0/3 (0.00%) |
| apps/website/src/cli/commands/theme/normalize-build.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| apps/website/src/contracts/headless/assistant-tool-approval-policy.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/16 (0.00%) | 0/4 (0.00%) |
| apps/website/src/contracts/headless/content-chat-title.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/20 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/deployments/dockerfile.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/form-destinations/deliver.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/publish-content/ui/publish-order.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/12 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/server-logs/tool-registrations.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/trash/entry-sql.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/8 (0.00%) |
| apps/website/src/platform/db/migrations/0013_unify_vault_credentials.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/24 (0.00%) | 0/5 (0.00%) |
| apps/website/src/platform/db/repos/outbox-repo.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/4 (0.00%) | 0/15 (0.00%) |
| apps/website/src/platform/site-dir/site-root.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/16 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/inbound/admin-http/http/menus.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/16 (0.00%) | 0/9 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/put-settings.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/probe.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/forms/authoring.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/24 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/forms/get-by-id.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/integrations/delete.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/text.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/16 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/menus/get-by-id.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/remove-subscription.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/send-campaign.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/posts/get-by-id.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/redirects/update.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/14 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/seo/put-settings.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/assistant-daemon.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/taxonomy/create-term.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/16 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/taxonomy/rename-term.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/create-role.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/update.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/14 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/assistant/assistant-system-overlay.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/assistant/early-run-session.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/28 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/runtime/composition/form-delivery.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/10 (0.00%) | 0/12 (0.00%) |
| apps/website/src/server/runtime/plugin-tier2/run-in-worker.ts | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/16 (0.00%) | 0/5 (0.00%) |
| content/agent-plugins/google-workspace/lib/form-destination-settings.mjs | NEVER-LOADED | 21 | 0/21 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| apps/admin/vite.config.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/24 (0.00%) | 0/3 (0.00%) |
| apps/desktop/src/sites-mcp-server.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| apps/website/src/contracts/core/assistant-native-fallbacks.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/18 (0.00%) | 0/7 (0.00%) |
| apps/website/src/contracts/core/gated-mutations/token.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/4 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/agent-plugins/admin-surfaces/surfaces.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/6 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/agent-plugins/apply-connect-defaults.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/16 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/analytics/config.settings.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/10 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/identity/user-purge.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/0 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/newsletter/errors.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/0 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/newsletter/hooks.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/post/featured-image.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/16 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/publish-content/disconnect-tool.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/taxonomy/html-render.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/14 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/taxonomy/taxonomy-trash-follow-ups.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/8 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/trash/adapters/post.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/2 (0.00%) | 0/8 (0.00%) |
| apps/website/src/platform/db/kernel/ops.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/12 (0.00%) | 0/3 (0.00%) |
| apps/website/src/platform/db/repos/entry-refs-repo.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/2 (0.00%) | 0/17 (0.00%) |
| apps/website/src/platform/site-dir/local-site-child.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/12 (0.00%) | 0/9 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/change-sets/get.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/comments/put-settings.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/menus/delete.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/create-list.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/import-subscriptions.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/send-test-campaign.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/20 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/plugins/list.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/redirects/get-by-id.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/preview-render.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/10 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/workspace/create.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/shared/observability-middleware.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/runtime/composition/modules/forms-admin.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/plugin-tier2/worker.ts | NEVER-LOADED | 20 | 0/20 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| apps/desktop/src/desktop-chat-main.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/8 (0.00%) | 0/8 (0.00%) |
| apps/website/src/contracts/core/assistant-run-events.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/2 (0.00%) | 0/15 (0.00%) |
| apps/website/src/features/agent-plugins/executable-tools/approval.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/agent-plugins/token-sign-in.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/database-transfer/copy-engine.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/2 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/form-destinations/select.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/20 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/media/library-save-attachment.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/post/search-index.memory.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/0 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/publish-content/file-blob-index.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/publish-content/seed-hash.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/redirects/phase-handler.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/seo/index.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/2 (0.00%) | 0/24 (0.00%) |
| apps/website/src/features/theme/template-applicability.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/22 (0.00%) | 0/5 (0.00%) |
| apps/website/src/platform/db/repos/oauth-pending-store.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/2 (0.00%) | 0/11 (0.00%) |
| apps/website/src/platform/db/sqlite/hydrate-content-db-from-seed.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/http/newsletter.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/4 (0.00%) | 0/14 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/stored-credential-probe.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/route-guards.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/recovery/deep-link.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/recovery/disclosure.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/redirects/list.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/taxonomy/delete-taxonomy.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/list-policy-permissions.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/chat-comparison.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/newsletter-unsubscribe.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/runtime/boot/plugin-sdk-resolver.ts | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| content/agent-plugins/cloudflare/lib/dns.mjs | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/18 (0.00%) | 0/10 (0.00%) |
| content/agent-plugins/fly/deploy-configs/fly.mjs | NEVER-LOADED | 19 | 0/19 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| apps/website/src/assistant/tool-audit-preset.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/6 (0.00%) | 0/7 (0.00%) |
| apps/website/src/cli/commands/plugin/integrity.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| apps/website/src/contracts/core/commands/repo.memory.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/16 (0.00%) | 0/13 (0.00%) |
| apps/website/src/contracts/core/gated-mutations/composition.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/6 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/media/document-archive.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/navigation/reverters.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/plugins/disk-headroom.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/publish-content/publish-readiness.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/publish-content/ui/sections.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/6 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/settings/site-title-write.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/20 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/site-backup/import-verifier.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/theme/active-theme.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/14 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/theme/agent-tools.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/web-screenshot/capture-files.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/widgets/deps.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/10 (0.00%) | 0/12 (0.00%) |
| apps/website/src/platform/db/migrations/0000_legacy_baseline.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| apps/website/src/platform/db/sqlite/reset-legacy-site-title-pin.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| apps/website/src/platform/site-dir/errors.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/0 (0.00%) | 0/6 (0.00%) |
| apps/website/src/platform/site-dir/schema-guard.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/tool-approvals.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/16 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/list-send-log.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/taxonomy/create-taxonomy.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/embed-insert.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/embed-remove.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/embed-reorder.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/12 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/region-bind.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/workspace/get.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/agent-plugin-surfaces/files.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/runtime/composition/modules/assistant-settings.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/modules/content-types.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/modules/settings.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/modules/taxonomy.ts | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/render/deploy-configs/render.mjs | NEVER-LOADED | 18 | 0/18 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/assistant/custom-instructions.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| apps/website/src/assistant/lost-frontend-binding.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| apps/website/src/cli/main.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/agent-plugins/mcp-metadata.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/20 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/api-connections/byo-client.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/form-destinations/rewrite-actions.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/14 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/forms/publish-content.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/8 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/identity/permission-list-tool.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/members/mailer.console.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/plugins/migration-recovery.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/taxonomy/collection-term-policy.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/trash/adapters/redirect.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/0 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/web-screenshot/tool-registrations.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/workspace/repo.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/4 (0.00%) | 0/17 (0.00%) |
| apps/website/src/platform/db/repos/analytics-sink.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/10 (0.00%) | 0/11 (0.00%) |
| apps/website/src/platform/site-dir/seed-starter-title.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/get-chat-attachment.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/get-settings.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/comments/get-settings.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/content-type.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/cancel-campaign.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/import-errors.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/16 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/recovery/status.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/seo/get-settings.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/module-status.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/observability-status.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/regions-list.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/public-http/middleware/site-serving-gate.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/llms.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/newsletter-confirm.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/runtime/composition/form-pull-triggers.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/2 (0.00%) | 0/9 (0.00%) |
| apps/website/src/server/runtime/composition/modules/database-recovery.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/trash-user-tool-port.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/runtime/lifecycle/readiness-state.ts | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/8 (0.00%) | 0/10 (0.00%) |
| content/agent-plugins/google-workspace/form-destinations/delivery-result.mjs | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/12 (0.00%) | 0/3 (0.00%) |
| content/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/form-pattern.tsx | NEVER-LOADED | 17 | 0/17 (0.00%) | 0/0 (0.00%) | 0/6 (0.00%) |
| apps/desktop/src/preload/preload.mts | LOADED | 16 | 171/187 (91.44%) | 11/11 (100.00%) | 10/57 (17.54%) |
| apps/website/src/assistant/assistant-vault-compat.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/14 (0.00%) | 0/5 (0.00%) |
| apps/website/src/assistant/external-mcp-tool-approval-adapters.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/4 (0.00%) | 0/19 (0.00%) |
| apps/website/src/assistant/installed-extension-tools.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/4 (0.00%) | 0/8 (0.00%) |
| apps/website/src/assistant/persistence/store-factory.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/2 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/mail-status/tool-registrations.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/media/where-used.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/publish-content/precheck-reasons.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/0 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/theme/verify-active-theme.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/tool-audit/repo.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/14 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/trash/agent-tools.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/2 (0.00%) | 0/5 (0.00%) |
| apps/website/src/platform/site-dir/read-template.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/site-dir/resolve-workspace.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/10 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/delete-site-credential.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/get-site-credential.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/change-sets/list.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/delete.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/forms/list.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/byte-size.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/get-providers.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/menus/list.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/archive-list.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/get-campaign.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/list-campaigns.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/pause-campaign.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/resume-campaign.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/pages/list.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/posts/list.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/presentation/rescan-themes.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/seo/post-sitemap-regenerate.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/skills/list.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/mail-status.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/ops/health.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/8 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/robots.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/boot/content-db-schema-guard.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/runtime/boot/dev-tls.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/16 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/runtime/composition/app-permission-grants.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/runtime/composition/modules/plugins.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/modules/redirects.ts | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/cloudflare/lib/zones.mjs | NEVER-LOADED | 16 | 0/16 (0.00%) | 0/18 (0.00%) | 0/5 (0.00%) |
| apps/desktop/src/node-toolchain.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/0 (0.00%) | 0/11 (0.00%) |
| apps/desktop/src/renderer/use-add-site.hooks.ts | LOADED | 15 | 104/119 (87.39%) | 9/9 (100.00%) | 4/5 (80.00%) |
| apps/desktop/src/renderer/use-workspace-chat-pane.hooks.ts | LOADED | 15 | 160/175 (91.43%) | 14/14 (100.00%) | 4/5 (80.00%) |
| apps/website/src/assistant/mcp-federation/presets.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/10 (0.00%) | 0/11 (0.00%) |
| apps/website/src/assistant/rewrap-page-navigate-error.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| apps/website/src/cli/commands/theme/generate-index.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/contracts/core/credential-copy.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/12 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/content-types/repo.rows.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/8 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/pages/agent-tools.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/post/search-index.sqlite.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/4 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/redirects/agent-tools.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/settings/ui-locales-tool.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/site-backup/share-preparation.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/site-export/site-exporter.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/12 (0.00%) | 0/16 (0.00%) |
| apps/website/src/features/theme/save-theme-original.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/trash/adapters/member.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/8 (0.00%) | 0/11 (0.00%) |
| apps/website/src/platform/db/journal-kernel.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/0 (0.00%) | 0/9 (0.00%) |
| apps/website/src/platform/dev-supervisor/dev-restart.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/14 (0.00%) | 0/6 (0.00%) |
| apps/website/src/platform/http/egress-policies.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/agent-plugins/list.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/18 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/commerce/status.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/entries/list.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/where-used.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/list-policies.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/list-roles.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/get-by-id.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/assistant/plugin-prompt-prefix.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/site-chat-markup.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/oauth/public-origin.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/14 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/comments-submit.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/2 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/runtime/composition/publish-trust-grants.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/runtime/composition/serving-app.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/runtime/composition/trash-user-admin-override.ts | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/14 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/google-workspace/lib/drive-files.mjs | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets-admin/filter-views.mjs | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/16 (0.00%) | 0/8 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets-admin/named-ranges.mjs | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/14 (0.00%) | 0/7 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets/values-by-data-filter.mjs | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/14 (0.00%) | 0/13 (0.00%) |
| content/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/auth-layout.tsx | NEVER-LOADED | 15 | 0/15 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/desktop/src/desktop-agent-inventory.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/14 (0.00%) | 0/12 (0.00%) |
| apps/desktop/src/move-site-home.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| apps/desktop/src/renderer/SitesFolders.tsx | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/24 (0.00%) | 0/4 (0.00%) |
| apps/site-chat/src/SiteAssistantHeader.hooks.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| apps/website/src/assistant/external-mcp-call-confirmation.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/22 (0.00%) | 0/13 (0.00%) |
| apps/website/src/assistant/read-only-tool-constraint.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/0 (0.00%) | 0/8 (0.00%) |
| apps/website/src/contracts/core/gated-mutations/gateway.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/2 (0.00%) | 0/7 (0.00%) |
| apps/website/src/contracts/core/rate-limit/rate-limit.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/website/src/contracts/core/scheduled-publish.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/14 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/agent-plugins/admin-surfaces/handlers.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/comments/ip-hash-salt.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/consent/request.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/deployments/static-publish/domain-publish-rows.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/26 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/media/list-pending-chat-attachments.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/members/repo.sqlite.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/0 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/navigation/index.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/newsletter/launch-gate.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/12 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/newsletter/repo.sqlite.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/0 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/publish-trust/provisioning.node-io.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/settings/admin-interface.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/settings/form-delivery-write.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/skills/layout.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/skills/live-registration.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/2 (0.00%) | 0/17 (0.00%) |
| apps/website/src/platform/db/migrations/0002_drop_empty_legacy_chat_tables.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/sqlite/publish-backstop-audit.sqlite.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| apps/website/src/platform/secrets/vault-api-connection-meta.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/12 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/site-dir/resolve-install-dir-target.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/content-types/list.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/deps.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/0 (0.00%) | 0/8 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/list-lists.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/newsletter/list-subscriptions.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/recovery/restore-points.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/settings/get-effective.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/taxonomy/list.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/trash.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/public-http/middleware/published-webmcp.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/14 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/shared/dev-cors.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/runtime/boot/bind-host.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/modules/members.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/modules/menus.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/lifecycle/theme-preview-host.ts | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets/find-replace.mjs | NEVER-LOADED | 14 | 0/14 (0.00%) | 0/8 (0.00%) | 0/6 (0.00%) |
| apps/desktop/src/desktop-capture.ts | LOADED | 13 | 64/77 (83.12%) | 13/14 (92.86%) | 9/29 (31.03%) |
| apps/website/src/assistant/ask-choice-ui-resource.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/10 (0.00%) | 0/5 (0.00%) |
| apps/website/src/assistant/credential-chat-intake.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| apps/website/src/assistant/demo-image-tool.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| apps/website/src/assistant/persistence/agent-session-store.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/assistant/persistence/chat-expiry-sweep.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/assistant/persistence/tenant-scope.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| apps/website/src/assistant/site/public-errors.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| apps/website/src/cli/commands/theme/sync-originals.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/contracts/core/plugin-hook-failed-error.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/agent-plugins/connect-card-ui.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/consent/config.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/10 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/content-types/index.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/custom-credentials/credential-recovery.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/10 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/forms/form-file-storage.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/media/bootstrap.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/navigation/menu-trash-follow-ups.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/6 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/plugin-runtime/built-ins/content-analyzer/plugin.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/plugins/store/store-plugin.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/publish-content/ui/phase.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/13 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/site-evidence/collect-page-evidence.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/10 (0.00%) | 0/14 (0.00%) |
| apps/website/src/features/taxonomy/gated-hooks.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/web-screenshot/own-site-opener.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/8 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/webhooks/subscriptions.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/2 (0.00%) | 0/7 (0.00%) |
| apps/website/src/platform/db/kernel/drivers/sqlite.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/0 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/agent-plugins/connection-sign-in.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/database/schema-state.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/assistant-subagents.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/18 (0.00%) | 0/8 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/widgets/list.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/workspace/list.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/assistant/capability-manifest-prefix.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/public-http/middleware/theme-asset-dirs.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site-share.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/shared/trust-proxy.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/site-consent.ts | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets-admin/basic-filter.mjs | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| content/agent-plugins/google-workspace/ui/picker-view.mjs | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| content/agent-plugins/google-workspace/ui/picker.handler.mjs | NEVER-LOADED | 13 | 0/13 (0.00%) | 0/2 (0.00%) | 0/11 (0.00%) |
| apps/admin/src/features/security/SiteKeyTab.tsx | LOADED | 12 | 32/44 (72.73%) | 35/54 (64.81%) | 9/14 (64.29%) |
| apps/site-chat/scripts/measure-bundles.mjs | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/assistant/agent-session-preset.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| apps/website/src/assistant/permanent-delete-settings.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| apps/website/src/assistant/permanent-delete-tool-gate.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/10 (0.00%) |
| apps/website/src/assistant/site/client-directives.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/agent-plugins/retired-plugin-tool-aliases.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/content-types/repo.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/2 (0.00%) | 0/12 (0.00%) |
| apps/website/src/features/database-transfer/confirmation-ui.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/forms/agent-tools.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/fs-files/agent-tools.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/media-generation/provider-credential-save.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/plugins/lipay/lipay-plugin.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/post/agent-tools.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/post/index.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/publish-content/run-repo.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/16 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/seo/page-head-contributor.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/12 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/theme/render-contract.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/theme/static-asset-contract.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/6 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/trash/adapters/comment.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| apps/website/src/platform/db/kernel/drivers/pglite-owner.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/platform/db/migrations/runner.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/sqlite/media-repo.sqlite.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| apps/website/src/platform/db/watermark-kernel.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/7 (0.00%) |
| apps/website/src/platform/mail/adapters/smtp.nodemailer.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/9 (0.00%) |
| apps/website/src/platform/site-dir/sites-workspace-options.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/inbound/admin-http/http/redirects.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/10 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/api-keys/create-principal.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/api-keys/issue.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/delete-execution-credential.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/get-execution-credential.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/resolve-test-agent-outcome.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/14 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/admissions.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/guard.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/public-http/middleware/public-page-security-headers.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/public-http/middleware/site-chat-static.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/sitemap.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/runtime/boot/process-error-guards.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/runtime/composition/assistant-history-tools.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/2 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/runtime/composition/chart-providers.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/runtime/composition/modules/integrations-admin.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/modules/workspace.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/lifecycle/await-boot-work.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| apps/website/src/server/runtime/lifecycle/site-preview-host.ts | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| content/agent-plugins/google-workspace/form-destinations/dedupe.mjs | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| content/agent-plugins/railway/deploy-configs/railway.mjs | NEVER-LOADED | 12 | 0/12 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/admin/dev-proxy-upstream-close.ts | LOADED | 11 | 3/14 (21.43%) | 0/12 (0.00%) | 0/4 (0.00%) |
| apps/admin/src/features/library/hooks/library-dependencies.hooks.ts | LOADED | 11 | 29/40 (72.50%) | 11/18 (61.11%) | 14/23 (60.87%) |
| apps/admin/src/features/library/hooks/use-library.hooks.ts | LOADED | 11 | 106/117 (90.60%) | 39/53 (73.58%) | 29/39 (74.36%) |
| apps/website/src/assistant/duplicate-resource-registry.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/website/src/assistant/execution-credential-store.memory.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/website/src/assistant/public-assistant-availability.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/website/src/assistant/site-credential-store.memory.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/website/src/contracts/headless/assistant-permanent-deletes-policy.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/comments/index.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/database-transfer/destination-ui.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/forms/form-destination-manifest.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/6 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/navigation/page-target-resolver.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/newsletter/data-module-manifest.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/plugin-runtime/built-ins/content-analyzer/summary.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/16 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/publish-content/destination-credential.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/publish-content/pull.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/seo/agent-tools.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/site-backup/share-policy.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/10 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/site-glue/manifest.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/taxonomy/repo.rows.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| apps/website/src/platform/db/repos/external-mcp-tool-approval-repo.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/2 (0.00%) | 0/11 (0.00%) |
| apps/website/src/platform/db/sqlite/database-journal-db.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/observability/index.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/site-dir/index.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/api-keys/revoke.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/tool-gaps.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/assistant/run-start-decisions.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/16 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/public-http/middleware/theme-preview-static.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/feed.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/forms-submit.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets-admin/developer-metadata.mjs | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets-admin/open-existing.mjs | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets-admin/tab-modify.mjs | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/18 (0.00%) | 0/8 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets/create.mjs | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/8 (0.00%) | 0/6 (0.00%) |
| packages/sdk/src/index.ts | NEVER-LOADED | 11 | 0/11 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/desktop/src/renderer/use-site-rename.hooks.ts | LOADED | 10 | 205/215 (95.35%) | 25/26 (96.15%) | 10/15 (66.67%) |
| apps/desktop/src/site-discovery-worker.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/site-chat/src/remixicon-override.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/site-chat/src/site-chat-i18n.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/12 (0.00%) | 0/6 (0.00%) |
| apps/website/src/assistant/execution-mode-settings.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/assistant/frontend-control-capabilities.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/assistant/mcp-ui-sandbox-proxy-route.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/assistant/tool-search-keywords.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/contracts/core/chat-delete-grant.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| apps/website/src/contracts/core/events/jini-outbox-adapter.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/12 (0.00%) |
| apps/website/src/contracts/core/events/outbox-worker.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/contracts/core/native-approval-memory.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/agent-plugins/admin-surfaces/forms.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/agent-plugins/admin-surfaces/issued-sign-ins.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/agent-plugins/admin-surfaces/same-origin.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/agent-plugins/bundled-catalog.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/analytics/jini-adapters.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/13 (0.00%) |
| apps/website/src/features/content-types/tool-registrations.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/custom-credentials/custom-credential-create-ui.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/12 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/database-transfer/pg-store-copy.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/database-transfer/postgres-ddl.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/navigation/tool-registrations.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/plugin-runtime/widget-partials.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/post/expected-version.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/presentation/repo.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/9 (0.00%) |
| apps/website/src/features/settings/feature-flags.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/site-export/static-security-headers.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/site-guide/plugin-contributions.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/site-inspection/agent-tools.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/source-control/provider-kit.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/14 (0.00%) | 0/13 (0.00%) |
| apps/website/src/features/taxonomy/repo.sqlite.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/theme/theme-layout.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/theme/validation/profiles.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/10 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/web-screenshot/screenshot-image.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/webhooks/agent-tools.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/keyset-cursor.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/repos/publish-content-bundle-repo.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/9 (0.00%) |
| apps/website/src/platform/headless-browser/playwright-loader.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/4 (0.00%) | 0/9 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/external-mcp/list.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/redirects/shared.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/4 (0.00%) | 0/6 (0.00%) |
| apps/website/src/server/inbound/assistant/run-log-lines.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/16 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/public-http/http/shared/post.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/20 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/modules/assistant-execution.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/modules/comments-moderation.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/modules/trash.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/lifecycle/assistant-daemon-registry.ts | NEVER-LOADED | 10 | 0/10 (0.00%) | 0/6 (0.00%) | 0/3 (0.00%) |
| apps/desktop/src/site-config.ts | LOADED | 9 | 158/167 (94.61%) | 36/37 (97.30%) | 5/5 (100.00%) |
| apps/desktop/src/speech/preload-speech.cts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| apps/website/src/assistant/mcp-federation/adapter.memory.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| apps/website/src/assistant/mcp-federation/reload-adapter.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/8 (0.00%) | 0/9 (0.00%) |
| apps/website/src/assistant/mcp-injection.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/assistant/mcp-ui-tool-calls.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/8 (0.00%) | 0/2 (0.00%) |
| apps/website/src/assistant/mcp-ui.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| apps/website/src/assistant/persistence/conversation-tool-approval-store.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/8 (0.00%) |
| apps/website/src/assistant/site/public-content.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/assistant/tool-gaps-tool.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| apps/website/src/cli/commands/introspect.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/agent-plugins/operator-locale.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/agent-plugins/set-enabled.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/custom-credentials/agent-tools.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/entries/tool-registrations.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/external-mcp/built-in-connections.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/form-destinations/connection-port.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/forms/repo.sqlite.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/media/guard-rendition-repo.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/media/provider-credential-store.memory.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/media/public-path.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/media/upload-content-type.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/members/subscriber-directory.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/post/slug.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/publish-content/blob-staging.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/publish-content/permissions.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/site-inspection/deps.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/11 (0.00%) |
| apps/website/src/features/theme/token-aliases.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/8 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/trash/scheduler.node.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/webhooks/signing.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/webmcp/settings.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/repos/publish-content-baseline-repo.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/8 (0.00%) |
| apps/website/src/platform/db/repos/publish-content-run-repo.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/8 (0.00%) |
| apps/website/src/platform/db/sqlite/database-journal-schema.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| apps/website/src/platform/headless-browser/lazy-browser.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/site-dir/new-site-owner.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/authorize-guard.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/http/plugin-hook-error.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/apply-report.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/system/assistant-permanent-deletes.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/4 (0.00%) | 0/7 (0.00%) |
| apps/website/src/server/inbound/admin-http/sea-runtime.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/assistant/federation-reload-route.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/public-http/middleware/render-theme-override.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/public-http/middleware/theme-content-security-headers.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/runtime/composition/boot-data-repairs.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/runtime/composition/form-delivery-deliverer.ts | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/5 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets/get.mjs | NEVER-LOADED | 9 | 0/9 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/admin/src/features/integrations/Integrations.tsx | LOADED | 8 | 13/21 (61.90%) | 13/20 (65.00%) | 9/16 (56.25%) |
| apps/desktop/src/renderer/use-create-site-plugin-tokens.hooks.ts | LOADED | 8 | 101/109 (92.66%) | 16/16 (100.00%) | 7/10 (70.00%) |
| apps/desktop/src/renderer/use-zoom.hooks.ts | LOADED | 8 | 231/239 (96.65%) | 36/36 (100.00%) | 11/12 (91.67%) |
| apps/site-chat/src/site-page-actions.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/contracts/core/entry-refs/repo.memory.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/8 (0.00%) | 0/10 (0.00%) |
| apps/website/src/features/agent-plugins/identity.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/api-connections/hook-http.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/change-sets/agent-tools.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/comments/agent-tools.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/consent/host.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/6 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/content-duplication/derive-available-name.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/4 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/entries/index.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/external-mcp/agent-tools.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/form-destinations/index.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/identity/repo.memory.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/8 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/media/content-type-store.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/members/index.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/navigation/trash-menu.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/plugin-runtime/declarative-enable.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/4 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/plugins/restore.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/publish-content/agent-tools.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/publish-content/execute-import.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/settings/form-destination.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/taxonomy/trash-term.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/tool-audit/tool-gaps.repo.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/trash/repo.sqlite.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/webhooks/delivery.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/webhooks/keyring.memory.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/widgets/agent-tools.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/postgres/db-ops-adapter.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| apps/website/src/platform/db/sqlite/db-ops.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| apps/website/src/platform/db/sqlite/origin-repo.sqlite.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| apps/website/src/platform/mail/purpose-scoped-mailer.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/10 (0.00%) |
| apps/website/src/platform/routing/reserved-paths.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| apps/website/src/platform/site-dir/layout.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/assistant/attempt-process-identity.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/8 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/inbound/assistant/byok-message-attachments.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/handlebars-worker.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/6 (0.00%) | 0/0 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/oauth/callback-page.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/12 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/runtime/composition/modules/api-keys.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/modules/integrations.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/runtime/composition/modules/skills.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/public-site-guide.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets-admin/batch-update.mjs | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/admin/src/features/roles/Roles.tsx | LOADED | 7 | 52/59 (88.14%) | 77/86 (89.53%) | 32/39 (82.05%) |
| apps/admin/src/features/settings/ExternalMcpSettingsPanel.tsx | LOADED | 7 | 48/55 (87.27%) | 25/32 (78.13%) | 16/24 (66.67%) |
| apps/admin/src/lib/server-reconnect.ts | LOADED | 7 | 34/41 (82.93%) | 19/21 (90.48%) | 13/17 (76.47%) |
| apps/admin/vitest.config.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/0 (0.00%) |
| apps/desktop/src/renderer/main.tsx | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/assistant/batch-tool-inputs.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/assistant/byok-provider-turn.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/assistant/persistence/run-ledger.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| apps/website/src/contracts/core/agent-permission-mode.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| apps/website/src/contracts/core/model-facing-tool-errors.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/contracts/headless/assistant-subagents-policy.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/agent-plugins/admin-surfaces/public-config.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/comments/data-module-install.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/content-types/write-service.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/fs-files/layout.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/origin/configured-origin.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/10 (0.00%) | 0/7 (0.00%) |
| apps/website/src/features/plugin-runtime/built-ins/content-analyzer/index.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/plugin-runtime/install-consent.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/12 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/plugin-runtime/install.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/plugin-runtime/plugin-export.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/14 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/post/template-options.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/presentation/active-theme-id.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/site-glue/attachment-points/tool-registration.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/sites/index.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/webhooks/http.memory.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/chat-kernel.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/drift.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/kernel/index.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/platform/db/migrations/0001_post_search.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/migrations/0004_drop_unused_deployment_tables.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/migrations/0007_publish_backstop.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/migrations/0015_document_blob_ownership.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/platform/db/migrations/chat/0000_chat_baseline.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/migrations/chat/0001_sqlite_chat_tables.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/migrations/chat/0002_durable_run_attempts.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/platform/db/migrations/step.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/postgres/db-ops.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/repos/media-provider-credential-repo.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| apps/website/src/platform/oauth/legacy-endpoint-error.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/secrets/store-vault-guards.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/10 (0.00%) |
| apps/website/src/platform/site-dir/atomic-write.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/http/integrations.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/http/users.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/assistant/execution-request-fields.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/media/stored-media-response.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/settings/list-definitions.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/runtime/boot/agent-daemon-wanted.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/runtime/composition/charts-recharts-source.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/core-extension-claims.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/runtime/composition/publish-backstop-ports.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/10 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/runtime/composition/publish-content-http.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/store-bound-services.ts | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets/copy.mjs | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets/values-append.mjs | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets/values-batch-update.mjs | NEVER-LOADED | 7 | 0/7 (0.00%) | 0/2 (0.00%) | 0/5 (0.00%) |
| apps/admin/src/App.tsx | LOADED | 6 | 88/94 (93.62%) | 63/71 (88.73%) | 23/31 (74.19%) |
| apps/admin/src/features/library/rules.ts | LOADED | 6 | 31/37 (83.78%) | 34/56 (60.71%) | 11/12 (91.67%) |
| apps/desktop/vite.config.mts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/site-chat/src/site-assistant-errors.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| apps/site-chat/src/vanilla-entry.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/site-chat/vite.vanilla.config.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/assistant/mcp-federation/adapter.http.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/contracts/core/commands/appliers.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| apps/website/src/contracts/core/events/outbox-drainer.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/contracts/core/gated-mutations/watermark.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/contracts/core/tool-failure-diagnostics.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/custom-credentials/index.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/database-transfer/sqlite-source.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/deployments/index.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/entries/repo.rows.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/4 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/external-mcp/auth-mode.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/identity/site-key-permission.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/identity/username-change-ports.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/website/src/features/media/purge-media.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/navigation/repo.sqlite.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/pages/html-document-store.sqlite.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/post/repo.sqlite.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/publish-content/ui/index.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/settings/site-title-preservation.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/8 (0.00%) |
| apps/website/src/features/site-inspection/index.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/sites/agent-tools.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/skills/install-adapters.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/trash/remove-without-blocker.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/migrations/0003_coercion_json_as_json.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/migrations/0009_posts_author.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/migrations/0010_members_credentials_revoked_at.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/migrations/0016_publish_destination_history.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/migrations/0018_form_submission_remote_receipts.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/migrations/0019_form_delivery_plans.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/migrations/0021_site_consent_revisions.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/repos/publish-content-peer-repo.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/sqlite/webhook-repo.sqlite.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/html/style-values.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/routing/adapter.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/error-mapping/respond.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/shared/request-id.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/runtime/composition/plugin-install-attachment-reader.ts | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets-admin/protected-ranges-get.mjs | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets-admin/sort.mjs | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets/copy-tab.mjs | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets/get-by-data-filter.mjs | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets/values-batch-clear.mjs | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets/values-clear.mjs | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets/values-get.mjs | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets/values-update.mjs | NEVER-LOADED | 6 | 0/6 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/admin/src/components/WidgetConfigFields/PlacementContentFields.tsx | LOADED | 5 | 0/5 (0.00%) | 0/3 (0.00%) | 0/4 (0.00%) |
| apps/admin/src/lib/queued-daemon-start.ts | LOADED | 5 | 9/14 (64.29%) | 8/11 (72.73%) | 3/8 (37.50%) |
| apps/desktop/src/site-preview-store.ts | LOADED | 5 | 209/214 (97.66%) | 20/22 (90.91%) | 9/9 (100.00%) |
| apps/desktop/src/site-process-registry.ts | LOADED | 5 | 609/614 (99.19%) | 96/109 (88.07%) | 30/30 (100.00%) |
| apps/site-chat/src/SiteAssistantHeader.tsx | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/site-chat/vite-public-guard.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/site-chat/vite.config.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/assistant/persistence/durable-run-store.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/cli/help.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/cli/introspect.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/contracts/core/credential-token.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/contracts/core/publish-history-list-limit.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/contracts/headless/index.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/agent-plugins/bundled-contribution-sources.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/4 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/custom-credentials/custom-credential-set-token-ui.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/database-transfer/postgres-target.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/deployments/publish-credentials/index.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/deployments/static-publish/index.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/media-import/agent-tools.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/newsletter/agent-tools.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/pages/permissions.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/plugin-runtime/set-enabled-confirmation-ui.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/plugins/data-modules.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/publish-content/baseline-repo.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/features/publish-content/live-site-policy.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/recovery/agent-tools.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/recovery/gated-hooks.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/redirects/repo.sqlite.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/theme/theme-id-aliases.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/tool-audit/repo.sqlite.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/web/web-page.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/webhooks/secret-sealer.aesgcm.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/6 (0.00%) |
| apps/website/src/features/widgets/repo.sqlite.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/kernel/checkpoint-stopped-wal.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/migrations/0008_posts_publish_at_featured_media.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/migrations/0014_media_library.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/migrations/0017_publish_history_kind.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/headless-browser/desktop-render.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/mail/delivery-availability.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/http/api-keys.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/http/media.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/20 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/users/deps.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/assistant/federation-admissions-route.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/form-validation-i18n.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/liquid-worker.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/0 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/chat-comparison-html.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/boot/boot-listener.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/runtime/boot/site-listener-origin.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/runtime/composition/content-publish-ports.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/runtime/composition/publish-trust-revocations.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/sqlite-only-services.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/runtime/configuration/capability-inventory.ts | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/google-workspace/tools/account-info.mjs | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| content/agent-plugins/google-workspace/tools/sheets/values-batch-get.mjs | NEVER-LOADED | 5 | 0/5 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/admin/src/features/plugins/admin-surface-theme.ts | LOADED | 4 | 17/21 (80.95%) | 3/9 (33.33%) | 3/5 (60.00%) |
| apps/admin/src/features/plugins/hooks/use-agent-plugin-install.hooks.ts | LOADED | 4 | 58/62 (93.55%) | 36/48 (75.00%) | 13/14 (92.86%) |
| apps/admin/src/features/posts/PostEditor.tsx | LOADED | 4 | 147/151 (97.35%) | 115/118 (97.46%) | 112/117 (95.73%) |
| apps/site-chat/vite.lazy.config.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/assistant/credential-store-fields.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/16 (0.00%) | 0/2 (0.00%) |
| apps/website/src/assistant/daemon-respawn-policy.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/assistant/durable-runs/accept.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/assistant/persistence/chat-history-store.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/assistant/site/mode.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/website/src/assistant/tool-catalog-live-query.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| apps/website/src/contracts/core/approval-i18n.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/contracts/core/commands/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/events/enqueue-only-outbox.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/contracts/core/events/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/events/outbox-retry-policies.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/contracts/core/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/secret-redaction.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/contracts/core/strict-base64.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/contracts/headless/secret-form-cards.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/agent-plugins/admin-surfaces/capabilities.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/6 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/agent-plugins/uninstall-confirmation-ui.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/analytics/ports.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/analytics/salt.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/comments/repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/content-types/declared-owners.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/content-types/repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/custom-credentials/repo.memory.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/database-transfer/destination-repo.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/database-transfer/exclusions.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/database-transfer/plan-store.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/database/agent-tools.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/database/gated-hooks.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/deployments/agent-tools.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/deployments/publish-credentials/execution-mode.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/deployments/publish-credentials/repo.memory.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/entries/repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/identity/permission-grants.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/identity/user-purge.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/media-generation/agent-tools.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/members/types.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/pages/index.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/plugin-runtime/agent-tools.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/plugin-runtime/repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/presentation/repo.rows.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/presentation/repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/publish-content/apply-errors.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/settings/repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/settings/site-title-preservation.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/sites/deps.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/skills/state.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/source-control/repo.memory.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/theme/asset-path-rewrites.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/tool-audit/repo.memory.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/trash/widget-removal.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/web-screenshot/agent-tools.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/web-screenshot/request-guard.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/web/agent-tools.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/webhooks/signing.keyring.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/workspace/repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/kernel/drivers/pglite-socket.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/kernel/drivers/pglite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/kernel/drivers/postgres.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/migrations/0005_media_createdby.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/db/repos/custom-credential-repo.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/repos/execution-credential-repo.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/repos/site-credential-repo.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/repos/source-control-credential-repo.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/repos/vendor-credential-repo.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/analytics-sink.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/change-set-repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/custom-credential-repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/entry-refs-repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/execution-credential-repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/external-mcp-repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/external-mcp-tool-approval-repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/gated-mutation-token-repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/media-provider-credential-repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/oauth-pending-store.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/outbox-repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/publish-content-baseline-repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/publish-content-bundle-repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/publish-content-peer-repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/publish-content-run-repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/publish-history-repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/site-credential-repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/source-control-credential-repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/sqlite/vendor-credential-repo.sqlite.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/html/slug.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/site-dir/site-switcher-enabled.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/http/change-sets.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/10 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/admin-http/http/entity-not-live.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/plugins/local-installer.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/deps.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/settings/preview-feed-access.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/assistant/chat-attachment-directory.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/handlebars-sandbox.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/public-http/http/site/liquid-sandbox.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/external-mcp/oauth-callback-url.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/site/newsletter-deps.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/inbound/shared/body-size-limit.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/admin-assistant-enabled.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/media-video-ports.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/modules/analytics.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/server/runtime/composition/modules/forms.ts | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/website/src/server/runtime/plugin-tier2/typescript-bootstrap.cjs | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| content/agent-plugins/cloudflare/targets/cloudflare-pages.mjs | NEVER-LOADED | 4 | 0/4 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/admin/src/features/ai-assistant/AiAssistant.tsx | LOADED | 3 | 78/81 (96.30%) | 100/116 (86.21%) | 32/36 (88.89%) |
| apps/admin/src/features/security/AccessTokensTab.tsx | LOADED | 3 | 104/107 (97.20%) | 104/111 (93.69%) | 60/63 (95.24%) |
| apps/admin/src/features/settings/ExternalMcpSettingsPanel.hooks.tsx | LOADED | 3 | 30/33 (90.91%) | 15/18 (83.33%) | 13/15 (86.67%) |
| apps/admin/src/features/themes/hooks/use-theme-preview-refresh.hooks.ts | LOADED | 3 | 12/15 (80.00%) | 18/20 (90.00%) | 8/10 (80.00%) |
| apps/admin/src/lib/tab-event-source.ts | LOADED | 3 | 33/36 (91.67%) | 11/21 (52.38%) | 6/8 (75.00%) |
| apps/desktop/scripts/merge-latest-mac.ts | LOADED | 3 | 31/34 (91.18%) | 3/4 (75.00%) | 2/2 (100.00%) |
| apps/desktop/src/renderer/use-site-preview.hooks.ts | LOADED | 3 | 104/107 (97.20%) | 14/15 (93.33%) | 5/8 (62.50%) |
| apps/desktop/src/site-folders.ts | LOADED | 3 | 156/159 (98.11%) | 46/50 (92.00%) | 24/26 (92.31%) |
| apps/site-chat/src/loader-entry.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/runtime-mode.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/6 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/comments/types.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/custom-credentials/delete-request-confirmation-ui.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/custom-credentials/types.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/fs-files/custom-root-permission.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/identity/role-manage-permission.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/identity/user-purge-types.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/members/agent-tools.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/plugin-runtime/uninstall-confirmation-ui.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/plugins/plugin-store.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/presentation/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/settings/chart-provider.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/site-glue/attachment-points/events.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/site-guide/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/source-control/repository-target.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/trash/db-port.sqlite.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/workspace/agent-tools.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/2 (0.00%) |
| apps/website/src/features/workspace/index.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/platform/db/content-kernel.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/platform/db/repos/form-submission-receipt-repo.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/4 (0.00%) |
| apps/website/src/platform/html/escape.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| apps/website/src/platform/observability/config.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/http/request-cookie.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/http/posts.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/http/presentation.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/forms/resolve-definition.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/trash/deps.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/server/inbound/public-http/http/content/posts.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/runtime/boot/site-boot-readiness.ts | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| content/agent-plugins/cloudflare/targets/cloudflare-workers.mjs | NEVER-LOADED | 3 | 0/3 (0.00%) | 0/2 (0.00%) | 0/4 (0.00%) |
| apps/admin/src/components/AssistantDock/chat-agent-plugin-preferences.adapter.ts | LOADED | 2 | 7/9 (77.78%) | 7/8 (87.50%) | 5/7 (71.43%) |
| apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.hooks.tsx | LOADED | 2 | 92/94 (97.87%) | 75/82 (91.46%) | 38/38 (100.00%) |
| apps/admin/src/features/collections/Collections.tsx | LOADED | 2 | 51/53 (96.23%) | 46/46 (100.00%) | 42/44 (95.45%) |
| apps/admin/src/features/deployment/deployment-i18n.tsx | LOADED | 2 | 45/47 (95.74%) | 2/4 (50.00%) | 20/20 (100.00%) |
| apps/admin/src/features/media/Media.tsx | LOADED | 2 | 79/81 (97.53%) | 85/96 (88.54%) | 42/44 (95.45%) |
| apps/admin/src/features/menus/MenuEditor.tsx | LOADED | 2 | 45/47 (95.74%) | 40/42 (95.24%) | 40/43 (93.02%) |
| apps/admin/src/features/plugins/AgentPluginManageButton.tsx | LOADED | 2 | 2/4 (50.00%) | 2/3 (66.67%) | 1/2 (50.00%) |
| apps/admin/src/features/plugins/hooks/agent-plugin-install-dependencies.hooks.ts | LOADED | 2 | 8/10 (80.00%) | 4/4 (100.00%) | 4/6 (66.67%) |
| apps/admin/src/features/plugins/hooks/plugins-dependencies.hooks.ts | LOADED | 2 | 29/31 (93.55%) | 18/23 (78.26%) | 11/11 (100.00%) |
| apps/admin/src/features/plugins/Plugins.tsx | LOADED | 2 | 46/48 (95.83%) | 33/36 (91.67%) | 21/23 (91.30%) |
| apps/admin/src/lib/api.ts | LOADED | 2 | 363/365 (99.45%) | 264/270 (97.78%) | 271/273 (99.27%) |
| apps/admin/src/lib/standing-draft-local-backup.ts | LOADED | 2 | 3/5 (60.00%) | 1/3 (33.33%) | 2/4 (50.00%) |
| apps/desktop/src/stage-payload-lib.ts | LOADED | 2 | 701/703 (99.72%) | 146/151 (96.69%) | 43/43 (100.00%) |
| apps/website/src/assistant/credential-guidance.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/assistant/tool-search-doc2query.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/operation-lock.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/public-page-security-headers.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/soft-delete.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/assistant.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/agent-plugins/activation-effects.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/agent-plugins/memory-i18n.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/2 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/consent/revisions.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/database/db-messages.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/identity/user-manage-permission.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/newsletter/types.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/pages/skeleton.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/permanent-delete/agent-tools.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/plugin-runtime/admin-response.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/8 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/plugins/lipay/manifest.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/plugins/store/manifest.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/post/author.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/4 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/redirects/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/server-logs/agent-tools.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/server-logs/process-source.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/site-evidence/agent-tools.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/site-export/export-failure-summary.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/site-export/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/sites/list-tool.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/source-control/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/taxonomy/agent-tools.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/trash/agent-delete-policy.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/trash/registry.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/features/webhooks/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/platform/mail/index.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/server/inbound/admin-http/http/members.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/http/workspace.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/members/deps.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/report-dto.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/2 (0.00%) | 0/3 (0.00%) |
| apps/website/src/server/inbound/public-http/http/members.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/inbound/public-http/routes/members/deps.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| apps/website/src/server/runtime/lifecycle/daemon-lifecycle-log.ts | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/1 (0.00%) |
| content/agent-plugins/cloudflare/form-destinations/cloudflare-d1.mjs | NEVER-LOADED | 2 | 0/2 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/admin/src/admin-themes/use-admin-theme.hooks.ts | LOADED | 1 | 65/66 (98.48%) | 61/67 (91.04%) | 28/29 (96.55%) |
| apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx | LOADED | 1 | 358/359 (99.72%) | 260/274 (94.89%) | 141/142 (99.30%) |
| apps/admin/src/components/EmbedInsertControl/EmbedInsertControl.tsx | LOADED | 1 | 33/34 (97.06%) | 27/27 (100.00%) | 19/20 (95.00%) |
| apps/admin/src/components/InstallTabCard/InstallTabCard.tsx | LOADED | 1 | 5/6 (83.33%) | 26/27 (96.30%) | 5/6 (83.33%) |
| apps/admin/src/components/PlainTextBlocks.tsx | LOADED | 1 | 5/6 (83.33%) | 5/6 (83.33%) | 3/4 (75.00%) |
| apps/admin/src/components/WidgetConfigFields/HtmlAttributeRows.tsx | LOADED | 1 | 6/7 (85.71%) | 9/10 (90.00%) | 5/6 (83.33%) |
| apps/admin/src/features/dashboard/Dashboard.tsx | LOADED | 1 | 25/26 (96.15%) | 34/35 (97.14%) | 9/10 (90.00%) |
| apps/admin/src/features/library/Library.hooks.tsx | LOADED | 1 | 6/7 (85.71%) | 3/3 (100.00%) | 4/5 (80.00%) |
| apps/admin/src/features/observability/queries-panel.tsx | LOADED | 1 | 2/3 (66.67%) | 3/3 (100.00%) | 1/3 (33.33%) |
| apps/admin/src/features/observability/tool-gaps-panel.tsx | LOADED | 1 | 3/4 (75.00%) | 9/13 (69.23%) | 2/3 (66.67%) |
| apps/admin/src/features/plugins/AgentPluginMemoryPanel.tsx | LOADED | 1 | 4/5 (80.00%) | 6/6 (100.00%) | 4/6 (66.67%) |
| apps/admin/src/features/plugins/AgentPlugins.tsx | LOADED | 1 | 33/34 (97.06%) | 33/33 (100.00%) | 21/22 (95.45%) |
| apps/admin/src/features/plugins/hooks/agent-plugin-memory-dependencies.hooks.ts | LOADED | 1 | 3/4 (75.00%) | 1/2 (50.00%) | 2/3 (66.67%) |
| apps/admin/src/features/plugins/hooks/use-plugin-install.hooks.ts | LOADED | 1 | 55/56 (98.21%) | 41/51 (80.39%) | 26/27 (96.30%) |
| apps/admin/src/features/plugins/hooks/use-plugins.hooks.ts | LOADED | 1 | 51/52 (98.08%) | 16/18 (88.89%) | 26/27 (96.30%) |
| apps/admin/src/features/plugins/rules.ts | LOADED | 1 | 80/81 (98.77%) | 101/102 (99.02%) | 40/41 (97.56%) |
| apps/admin/src/features/posts/hooks/post-editor-dependencies.hooks.ts | LOADED | 1 | 52/53 (98.11%) | 43/44 (97.73%) | 25/28 (89.29%) |
| apps/admin/src/features/posts/PostSettingsDialog.tsx | LOADED | 1 | 5/6 (83.33%) | 8/12 (66.67%) | 2/4 (50.00%) |
| apps/admin/src/features/settings/SettingsUi.tsx | LOADED | 1 | 36/37 (97.30%) | 31/33 (93.94%) | 15/25 (60.00%) |
| apps/admin/src/features/sites/hooks/site-publish-dependencies.hooks.ts | LOADED | 1 | 5/6 (83.33%) | 4/5 (80.00%) | 4/5 (80.00%) |
| apps/admin/src/features/sites/hooks/use-site-publish.hooks.ts | LOADED | 1 | 77/78 (98.72%) | 67/77 (87.01%) | 24/24 (100.00%) |
| apps/admin/src/features/sites/Sites.tsx | LOADED | 1 | 26/27 (96.30%) | 36/39 (92.31%) | 11/11 (100.00%) |
| apps/admin/src/features/source-control/SourceControl.tsx | LOADED | 1 | 6/7 (85.71%) | 1/2 (50.00%) | 2/3 (66.67%) |
| apps/admin/src/features/taxonomy/hooks/use-taxonomy.hooks.ts | LOADED | 1 | 50/51 (98.04%) | 17/18 (94.44%) | 18/20 (90.00%) |
| apps/admin/src/features/themes/hooks/themes-dependencies.hooks.ts | LOADED | 1 | 25/26 (96.15%) | 14/15 (93.33%) | 12/13 (92.31%) |
| apps/admin/src/features/users/hooks/users-dependencies.hooks.ts | LOADED | 1 | 61/62 (98.39%) | 37/38 (97.37%) | 34/35 (97.14%) |
| apps/admin/src/features/voice-input/hooks/push-to-talk-state.hooks.ts | LOADED | 1 | 21/22 (95.45%) | 10/11 (90.91%) | 12/12 (100.00%) |
| apps/admin/src/lib/assistant-chats.ts | LOADED | 1 | 15/16 (93.75%) | 7/7 (100.00%) | 10/11 (90.91%) |
| apps/admin/src/lib/assistant-permanent-deletes.ts | LOADED | 1 | 3/4 (75.00%) | 0/0 (100.00%) | 1/2 (50.00%) |
| apps/admin/src/lib/assistant-subagents.ts | LOADED | 1 | 4/5 (80.00%) | 0/0 (100.00%) | 1/2 (50.00%) |
| apps/admin/src/lib/credential-card-guidance.ts | LOADED | 1 | 7/8 (87.50%) | 5/9 (55.56%) | 2/3 (66.67%) |
| apps/admin/src/lib/settings-tabs.ts | LOADED | 1 | 65/66 (98.48%) | 58/58 (100.00%) | 15/16 (93.75%) |
| apps/admin/src/lib/widget-embed-extension.tsx | LOADED | 1 | 29/30 (96.67%) | 19/20 (95.00%) | 21/22 (95.45%) |
| apps/admin/src/main.tsx | LOADED | 1 | 9/10 (90.00%) | 3/4 (75.00%) | 2/2 (100.00%) |
| apps/desktop/src/renderer/source-test-harness.ts | LOADED | 1 | 71/72 (98.61%) | 45/46 (97.83%) | 14/16 (87.50%) |
| apps/site-chat/src/client-directives.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/assistant/daemon-exit-codes.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/assistant/durable-runs/continuation.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/assistant/durable-runs/recover.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/assistant/site-guide-pointer.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/assistant/site/capability-card.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/admin-locales.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/extension-capability-vocabulary.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/path-containment.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/agent-plugins.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/analytics.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/change-sets.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/comments.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/consent.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/content-duplication.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/content-read.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/content-types.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/custom-credentials.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/database-transfer.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/database.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/deploy-ops.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/deployments.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/domain-dns.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/entries.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/external-mcp.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/forms.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/frontend-control.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/fs-files.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/identity.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/mail-status.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/media-generation.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/media-import.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/media.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/members.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/navigation.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/newsletter.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/pages.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/permanent-delete.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/plugin-runtime.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/post.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/publish-content.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/recovery.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/redirects.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/seo.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/server-logs.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/settings.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/site-backup.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/site-evidence.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/site-guide.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/site-inspection.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/sites.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/skills.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/source-control.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/taxonomy.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/theme.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/trash.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/web-screenshot.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/web.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/webhooks.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/widgets.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/tool-metadata/workspace.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/core/upload-limits.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/contracts/headless/chat-attachment.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/analytics/agent-tools.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/analytics/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/content-duplication/agent-tools.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/content-types/repo.memory.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/database-transfer/transfer-messages.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/5 (0.00%) |
| apps/website/src/features/database/boot/evaluate-boot-migration-policy.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/database/boot/reconcile-interrupted-migration.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/database/migrate-forward/execute.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/database/restore-points.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/database/timeline.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/deployments/capability-card.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/domain-dns/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/forms/capability-card.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/forms/rate-limit-profile.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/mail-status/agent-tools.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/members/capability-card.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/navigation/menu-html-permission.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/navigation/menu-version-conflict-error.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/newsletter/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/origin/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/plugin-runtime/capability-card.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/plugin-runtime/install-source.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/plugins/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/post/capability-card.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/publish-content/artifact-format.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/recovery/deep-link.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/recovery/disclosure.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/recovery/recovery-orchestrator.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/recovery/repo.memory.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/recovery/restore-points.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/recovery/ui/degraded-banners.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/seo/capability-card.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/site-guide/capability-card.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/taxonomy/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/theme/capability-card.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/tool-audit/types.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/trash/adapters/plugin.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/trash/adapters/theme.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/trash/ports.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/vendor-credentials/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/web/html-document.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/web/html-to-markdown.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/webmcp/webmcp-i18n.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/features/widgets/capability-card.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/platform/db/kernel/dialect.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/platform/db/kernel/port.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/platform/db/kernel/schema-shape.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/platform/db/migrations/0000_legacy_baseline.postgres.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/platform/db/migrations/checksums.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/platform/dev-supervisor/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/platform/http/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/platform/oauth/errors.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/platform/oauth/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/platform/routing/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/server/inbound/admin-http/http/plugins.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/website/src/server/inbound/assistant/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| packages/sdk/src/hooks.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/admin/dev-tls-disable-flag.ts | LOADED | 0 | 2/2 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/__measurements__/forms-harness.tsx | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/__measurements__/redirects-harness.tsx | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/admin-themes/apply.ts | LOADED | 0 | 12/12 (100.00%) | 12/12 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/admin-themes/registry.ts | LOADED | 0 | 4/4 (100.00%) | 7/9 (77.78%) | 2/2 (100.00%) |
| apps/admin/src/app-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/App.hooks.ts | LOADED | 0 | 218/218 (100.00%) | 143/146 (97.95%) | 90/95 (94.74%) |
| apps/admin/src/components/AdminByokKeyPanel.tsx | LOADED | 0 | 25/25 (100.00%) | 35/35 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/components/AssistantDock/agent-failure-hints.ts | LOADED | 0 | 2/2 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/agent-failure.ts | LOADED | 0 | 69/69 (100.00%) | 85/85 (100.00%) | 30/30 (100.00%) |
| apps/admin/src/components/AssistantDock/AgentFailureCard.hooks.ts | LOADED | 0 | 30/30 (100.00%) | 33/33 (100.00%) | 18/18 (100.00%) |
| apps/admin/src/components/AssistantDock/AgentFailureCard.tsx | LOADED | 0 | 3/3 (100.00%) | 5/6 (83.33%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/assistant-dock-i18n.ts | LOADED | 0 | 10/10 (100.00%) | 7/7 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/components/AssistantDock/assistant-dock-props.tsx | LOADED | 0 | 3/3 (100.00%) | 12/12 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/components/AssistantDock/AssistantDock.tsx | LOADED | 0 | 44/44 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/chat-agent-plugin-preferences.ts | LOADED | 0 | 7/7 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/AssistantDock/chat-display-preferences.adapter.ts | LOADED | 0 | 9/9 (100.00%) | 4/4 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/components/AssistantDock/chat-display-preferences.ts | LOADED | 0 | 12/12 (100.00%) | 7/7 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/components/AssistantDock/dock-header-rules.ts | LOADED | 0 | 22/22 (100.00%) | 20/20 (100.00%) | 14/14 (100.00%) |
| apps/admin/src/components/AssistantDock/DockHeader.tsx | LOADED | 0 | 4/4 (100.00%) | 12/12 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/components/AssistantDock/DockHeaderTip.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 9/9 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/AssistantDock/DockHeaderTip.tsx | LOADED | 0 | 2/2 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/DockLeadingAccessory.tsx | LOADED | 0 | 1/1 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/DockSettingsMenu.tsx | LOADED | 0 | 18/18 (100.00%) | 39/39 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/components/AssistantDock/execution-config-write.ts | LOADED | 0 | 21/21 (100.00%) | 20/20 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/components/AssistantDock/FolderDropConfirmation.tsx | LOADED | 0 | 2/2 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/FolderDropError.tsx | LOADED | 0 | 7/7 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/AssistantDock/FolderDropNotice.tsx | LOADED | 0 | 4/4 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/chat-package-kind.ts | LOADED | 0 | 60/60 (100.00%) | 69/69 (100.00%) | 14/14 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/composer-skills.hooks.ts | LOADED | 0 | 32/32 (100.00%) | 22/22 (100.00%) | 23/23 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/conversation-refresh.hooks.ts | LOADED | 0 | 1/1 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/resolve-composer-discovery-outcome.ts | LOADED | 0 | 20/20 (100.00%) | 14/14 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/use-assistant-empty-state.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 9/9 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/use-chat-agent-plugins.hooks.ts | LOADED | 0 | 26/26 (100.00%) | 11/11 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/use-chat-display-preferences.hooks.ts | LOADED | 0 | 28/28 (100.00%) | 12/12 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/use-composer-send-stop-guard.hooks.ts | LOADED | 0 | 19/19 (100.00%) | 21/21 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts | LOADED | 0 | 16/16 (100.00%) | 0/0 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/use-routed-a2ui-surface-card.hooks.ts | LOADED | 0 | 30/30 (100.00%) | 28/28 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/use-selected-agent-auth-warning.hooks.ts | LOADED | 0 | 18/18 (100.00%) | 17/17 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/components/AssistantDock/hooks/useOverflowDetection.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 6/6 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/components/AssistantDock/local-cli-selection-echo.ts | LOADED | 0 | 4/4 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/MessageOverflowModal.hooks.tsx | LOADED | 0 | 18/18 (100.00%) | 14/14 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/components/AssistantDock/MessageOverflowModal.tsx | LOADED | 0 | 3/3 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/AssistantDock/OverflowAwareMcpUiSurfaceCard.tsx | LOADED | 0 | 6/6 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/AssistantDock/RoutedA2uiSurfaceCard.tsx | LOADED | 0 | 10/10 (100.00%) | 7/7 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/components/AssistantDock/SelectedAgentPluginTray.tsx | LOADED | 0 | 4/4 (100.00%) | 4/4 (100.00%) | 3/3 (100.00%) |
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
| apps/admin/src/components/InstallTabCard/folder-zip.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/components/InstallTabCard/install-archive-size.ts | LOADED | 0 | 3/3 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/InstallTabCard/use-folder-upload.hooks.ts | LOADED | 0 | 20/20 (100.00%) | 9/9 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/components/InstallTabCard/use-zip-drop.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 6/7 (85.71%) | 4/4 (100.00%) |
| apps/admin/src/components/MediaEditDialog/MediaEditDialog.hooks.tsx | LOADED | 0 | 10/10 (100.00%) | 14/14 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/components/MediaEditDialog/MediaEditDialog.tsx | LOADED | 0 | 9/9 (100.00%) | 16/16 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/components/MediaPickerDialog/JiniMediaPicker.hooks.ts | LOADED | 0 | 20/20 (100.00%) | 22/22 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/components/MediaPickerDialog/media-picker-dependencies.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 3/3 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/components/MediaPickerDialog/MediaPickerDialog.hooks.tsx | LOADED | 0 | 16/16 (100.00%) | 11/12 (91.67%) | 9/9 (100.00%) |
| apps/admin/src/components/MediaPickerDialog/MediaPickerDialog.tsx | LOADED | 0 | 11/11 (100.00%) | 21/22 (95.45%) | 6/6 (100.00%) |
| apps/admin/src/components/Placeholder.tsx | LOADED | 0 | 18/18 (100.00%) | 16/16 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/components/Select/Select.tsx | LOADED | 0 | 5/5 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/components/ServerRestartingBanner/hooks/use-server-connection-status.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/ServerRestartingBanner/ServerRestartingBanner.tsx | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/shared-components-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/components/SitesSidebarNav.tsx | LOADED | 0 | 2/2 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/status-labels.ts | LOADED | 0 | 10/10 (100.00%) | 8/8 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/components/TemplateSource/template-source-dependencies.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/components/TemplateSource/TemplateSourceModal.tsx | LOADED | 0 | 16/16 (100.00%) | 15/15 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/components/TemplateSource/use-template-source.hooks.ts | LOADED | 0 | 11/11 (100.00%) | 8/8 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/components/TemplateSource/ViewTemplateButton.tsx | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/WidgetConfigFields/HtmlAttributeRows.hooks.ts | LOADED | 0 | 11/11 (100.00%) | 6/6 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/components/WidgetConfigFields/media-content-rules.ts | LOADED | 0 | 119/119 (100.00%) | 141/141 (100.00%) | 39/39 (100.00%) |
| apps/admin/src/components/WidgetConfigFields/MediaContentEditor.hooks.ts | LOADED | 0 | 71/71 (100.00%) | 43/43 (100.00%) | 34/34 (100.00%) |
| apps/admin/src/components/WidgetConfigFields/MediaContentEditor.tsx | LOADED | 0 | 66/66 (100.00%) | 103/103 (100.00%) | 42/42 (100.00%) |
| apps/admin/src/components/WidgetConfigFields/widget-config-fields-dependencies.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 15/15 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.tsx | LOADED | 0 | 79/79 (100.00%) | 85/86 (98.84%) | 50/50 (100.00%) |
| apps/admin/src/components/WidgetConfigFields/WidgetPreview.hooks.ts | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/components/WidgetPickerDialog/widget-picker-dependencies.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 7/7 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.hooks.tsx | LOADED | 0 | 63/63 (100.00%) | 36/36 (100.00%) | 16/16 (100.00%) |
| apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.tsx | LOADED | 0 | 20/20 (100.00%) | 32/33 (96.97%) | 17/17 (100.00%) |
| apps/admin/src/features/admin-themes/admin-themes-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/admin-themes/AdminThemes.tsx | LOADED | 0 | 24/24 (100.00%) | 32/38 (84.21%) | 10/10 (100.00%) |
| apps/admin/src/features/admin-themes/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/admin-ui/AdminUi.tsx | LOADED | 0 | 7/7 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/admin-ui/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/ai-assistant/AdminPermanentDeletes.tsx | LOADED | 0 | 14/14 (100.00%) | 21/21 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/ai-assistant/AdminSubagents.tsx | LOADED | 0 | 9/9 (100.00%) | 21/21 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/ai-assistant/ai-assistant-i18n.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/ai-assistant/ai-assistant-layout-i18n.ts | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/ai-assistant/AssistantToggleRow.tsx | LOADED | 0 | 6/6 (100.00%) | 6/6 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/ai-assistant-dependencies.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/assistant-daemon-restart-dependencies.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 5/5 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-admin-assistant-switch.hooks.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-admin-execution-mode.hooks.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-admin-permanent-deletes.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 16/16 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-admin-subagents.hooks.ts | LOADED | 0 | 24/24 (100.00%) | 36/36 (100.00%) | 14/14 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-ai-assistant-locale-sync.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-ai-assistant.hooks.ts | LOADED | 0 | 32/32 (100.00%) | 19/19 (100.00%) | 16/16 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-assistant-daemon-restart.hooks.ts | LOADED | 0 | 28/28 (100.00%) | 3/3 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-assistant-owner-grant.hooks.ts | LOADED | 0 | 32/32 (100.00%) | 28/28 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-visitor-assistant-panel.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 8/9 (88.89%) | 2/2 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts | LOADED | 0 | 138/138 (100.00%) | 85/85 (100.00%) | 45/45 (100.00%) |
| apps/admin/src/features/ai-assistant/hooks/visitor-credential-form-dependencies.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/ai-assistant/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/ai-assistant/OwnerGrantStatus.tsx | LOADED | 0 | 1/1 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/ai-assistant/rules.ts | LOADED | 0 | 33/33 (100.00%) | 50/51 (98.04%) | 22/22 (100.00%) |
| apps/admin/src/features/ai-assistant/VisitorAssistantPanel.tsx | LOADED | 0 | 12/12 (100.00%) | 13/14 (92.86%) | 5/5 (100.00%) |
| apps/admin/src/features/analytics/analytics-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/analytics/Analytics.tsx | LOADED | 0 | 10/10 (100.00%) | 12/12 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/analytics/hooks/analytics-dependencies.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/analytics/hooks/use-analytics.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 6/6 (100.00%) | 3/4 (75.00%) |
| apps/admin/src/features/analytics/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/auth/auth-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/auth/hooks/login-dependencies.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/auth/hooks/use-login.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/auth/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/auth/Login.tsx | LOADED | 0 | 6/6 (100.00%) | 5/5 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/authentication/authentication-i18n.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/authentication/Authentication.tsx | LOADED | 0 | 13/13 (100.00%) | 2/2 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/authentication/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/authentication/model/provider-schemas.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/collections/CollectionEntries.tsx | LOADED | 0 | 13/13 (100.00%) | 13/13 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/collections/CollectionEntryEditor.tsx | LOADED | 0 | 51/51 (100.00%) | 74/74 (100.00%) | 29/29 (100.00%) |
| apps/admin/src/features/collections/collections-i18n.ts | LOADED | 0 | 14/14 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/collections/hooks/collection-entries-dependencies.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 11/11 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/collections/hooks/collection-entry-editor-dependencies.hooks.ts | LOADED | 0 | 29/29 (100.00%) | 23/24 (95.83%) | 15/15 (100.00%) |
| apps/admin/src/features/collections/hooks/collections-dependencies.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 11/11 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/collections/hooks/edit-fields-dialog-dependencies.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 5/5 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/collections/hooks/new-content-type-dialog-dependencies.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 5/5 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/collections/hooks/use-collection-entries.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 6/6 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/collections/hooks/use-collection-entry-editor.hooks.ts | LOADED | 0 | 102/102 (100.00%) | 60/62 (96.77%) | 17/17 (100.00%) |
| apps/admin/src/features/collections/hooks/use-collections.hooks.ts | LOADED | 0 | 27/27 (100.00%) | 8/8 (100.00%) | 8/9 (88.89%) |
| apps/admin/src/features/collections/hooks/use-edit-fields-dialog.hooks.ts | LOADED | 0 | 28/28 (100.00%) | 11/11 (100.00%) | 14/14 (100.00%) |
| apps/admin/src/features/collections/hooks/use-json-field-control.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 2/2 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/collections/hooks/use-lifecycle-confirm-dialog.hooks.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/collections/hooks/use-new-content-type-dialog.hooks.ts | LOADED | 0 | 29/29 (100.00%) | 8/8 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/collections/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/collections/rules.ts | LOADED | 0 | 58/58 (100.00%) | 49/49 (100.00%) | 31/31 (100.00%) |
| apps/admin/src/features/comments/comments-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/comments/index.ts | LOADED | 0 | 1/1 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/consent/settings.hooks.ts | LOADED | 0 | 17/17 (100.00%) | 32/32 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/content-analysis/content-analysis-i18n.ts | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/content-analysis/ContentAnalysisCard.tsx | LOADED | 0 | 8/8 (100.00%) | 12/12 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/content-analysis/hooks/content-analysis-dependencies.hooks.ts | LOADED | 0 | 17/17 (100.00%) | 12/12 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/content-analysis/hooks/use-content-analysis.hooks.ts | LOADED | 0 | 20/20 (100.00%) | 6/6 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/content-analysis/rules.ts | LOADED | 0 | 61/61 (100.00%) | 78/78 (100.00%) | 27/27 (100.00%) |
| apps/admin/src/features/dashboard/dashboard-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/dashboard/hooks/dashboard-dependencies.hooks.ts | LOADED | 0 | 27/27 (100.00%) | 36/36 (100.00%) | 18/18 (100.00%) |
| apps/admin/src/features/dashboard/hooks/use-dashboard.hooks.ts | LOADED | 0 | 51/51 (100.00%) | 28/28 (100.00%) | 34/34 (100.00%) |
| apps/admin/src/features/dashboard/hooks/use-recent-activity-disclosure.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 2/2 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/dashboard/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/dashboard/rules.ts | LOADED | 0 | 17/17 (100.00%) | 23/23 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/database/database-i18n.tsx | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/database/database-visuals.tsx | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/database/Database.tsx | LOADED | 0 | 51/51 (100.00%) | 47/47 (100.00%) | 29/29 (100.00%) |
| apps/admin/src/features/database/hooks/migrate-forward-section-dependencies.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 13/13 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/database/hooks/schema-state-section-dependencies.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/database/hooks/timeline-section-dependencies.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/database/hooks/use-migrate-forward-section.hooks.ts | LOADED | 0 | 47/47 (100.00%) | 16/16 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/features/database/hooks/use-schema-state-section.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/database/hooks/use-timeline-section.hooks.ts | LOADED | 0 | 51/51 (100.00%) | 28/28 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/database/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/database/rules.ts | LOADED | 0 | 16/16 (100.00%) | 11/11 (100.00%) | 3/3 (100.00%) |
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
| apps/admin/src/features/deployment/hooks/use-dockerfile-source.hooks.ts | LOADED | 0 | 50/50 (100.00%) | 31/31 (100.00%) | 13/14 (92.86%) |
| apps/admin/src/features/deployment/hooks/use-publish-credentials.hooks.ts | LOADED | 0 | 82/82 (100.00%) | 90/91 (98.90%) | 39/39 (100.00%) |
| apps/admin/src/features/deployment/hooks/use-static-export.hooks.ts | LOADED | 0 | 61/61 (100.00%) | 21/21 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/deployment/hooks/use-static-publish.hooks.ts | LOADED | 0 | 92/92 (100.00%) | 46/47 (97.87%) | 18/18 (100.00%) |
| apps/admin/src/features/deployment/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/deployment/OverviewTab.tsx | LOADED | 0 | 16/16 (100.00%) | 20/20 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/features/deployment/PublishRunResult.tsx | LOADED | 0 | 8/8 (100.00%) | 11/11 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/deployment/rules.ts | LOADED | 0 | 77/77 (100.00%) | 113/113 (100.00%) | 39/39 (100.00%) |
| apps/admin/src/features/deployment/StaticSiteTab.tsx | LOADED | 0 | 95/95 (100.00%) | 154/161 (95.65%) | 55/55 (100.00%) |
| apps/admin/src/features/forms/forms-field-settings-i18n.ts | LOADED | 0 | 5/5 (100.00%) | 1/2 (50.00%) | 2/2 (100.00%) |
| apps/admin/src/features/forms/forms-i18n.ts | LOADED | 0 | 8/8 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/forms/forms-leave-guard-i18n.ts | LOADED | 0 | 5/5 (100.00%) | 1/2 (50.00%) | 2/2 (100.00%) |
| apps/admin/src/features/forms/index.ts | LOADED | 0 | 2/2 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/fs-files/folder-drop-port.ts | LOADED | 0 | 2/2 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/fs-files/hooks/use-folder-drop.hooks.ts | LOADED | 0 | 48/48 (100.00%) | 40/41 (97.56%) | 12/12 (100.00%) |
| apps/admin/src/features/integrations/hooks/integration-deliveries-dependencies.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/integrations/hooks/integrations-dependencies.hooks.ts | LOADED | 0 | 20/20 (100.00%) | 9/9 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/integrations/hooks/use-integration-deliveries.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/integrations/hooks/use-integrations-redirect.hooks.ts | LOADED | 0 | 2/2 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/integrations/hooks/use-integrations.hooks.ts | LOADED | 0 | 39/39 (100.00%) | 8/8 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/integrations/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/integrations/IntegrationDeliveries.tsx | LOADED | 0 | 9/9 (100.00%) | 9/9 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/integrations/integrations-i18n.tsx | LOADED | 0 | 7/7 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/integrations/IntegrationsRedirect.tsx | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/integrations/rules.ts | LOADED | 0 | 13/13 (100.00%) | 12/12 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/library/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/library/library-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/media/hooks/media-dependencies.hooks.ts | LOADED | 0 | 30/30 (100.00%) | 19/19 (100.00%) | 18/18 (100.00%) |
| apps/admin/src/features/media/hooks/media-import-dependencies.hooks.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/media/hooks/use-edit-media-modal.hooks.ts | LOADED | 0 | 18/18 (100.00%) | 14/14 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/media/hooks/use-edit-media-panel.hooks.ts | LOADED | 0 | 50/50 (100.00%) | 18/18 (100.00%) | 31/31 (100.00%) |
| apps/admin/src/features/media/hooks/use-media-card-details.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 10/10 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/media/hooks/use-media-card-metadata.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 16/16 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/media/hooks/use-media-lightbox.hooks.ts | LOADED | 0 | 42/42 (100.00%) | 28/28 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/media/hooks/use-media-preview.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 1/1 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/media/hooks/use-media-tabs.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/media/hooks/use-media.hooks.ts | LOADED | 0 | 71/71 (100.00%) | 29/30 (96.67%) | 22/22 (100.00%) |
| apps/admin/src/features/media/hooks/use-remote-image-import.hooks.ts | LOADED | 0 | 26/26 (100.00%) | 15/15 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/media/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/media/media-i18n.ts | LOADED | 0 | 8/8 (100.00%) | 4/8 (50.00%) | 1/1 (100.00%) |
| apps/admin/src/features/media/media-provider-catalog.ts | LOADED | 0 | 7/7 (100.00%) | 6/6 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/media/media-providers-port.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/media/Media.hooks.tsx | LOADED | 0 | 8/8 (100.00%) | 5/5 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/media/RemoteImageImport.tsx | LOADED | 0 | 4/4 (100.00%) | 5/6 (83.33%) | 3/3 (100.00%) |
| apps/admin/src/features/media/rules.ts | LOADED | 0 | 127/127 (100.00%) | 118/123 (95.93%) | 39/39 (100.00%) |
| apps/admin/src/features/members/hooks/members-controller.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 3/3 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/members/hooks/members-dependencies.hooks.ts | LOADED | 0 | 22/22 (100.00%) | 8/8 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/features/members/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/members/members-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/members/MembersPanel.tsx | LOADED | 0 | 5/5 (100.00%) | 2/2 (100.00%) | 4/5 (80.00%) |
| apps/admin/src/features/menus/hooks/menus-dependencies.hooks.ts | LOADED | 0 | 26/26 (100.00%) | 26/26 (100.00%) | 16/16 (100.00%) |
| apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts | LOADED | 0 | 148/148 (100.00%) | 102/106 (96.23%) | 45/45 (100.00%) |
| apps/admin/src/features/menus/hooks/use-menus.hooks.ts | LOADED | 0 | 36/36 (100.00%) | 25/25 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/menus/html-rules.ts | LOADED | 0 | 22/22 (100.00%) | 24/24 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/menus/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/menus/MenuEditor.hooks.tsx | LOADED | 0 | 7/7 (100.00%) | 10/10 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/menus/MenuPageLinkFields.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 2/2 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/menus/MenuPageLinkFields.tsx | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/menus/menus-i18n.ts | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/menus/Menus.tsx | LOADED | 0 | 8/8 (100.00%) | 12/12 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/menus/page-link-rules.ts | LOADED | 0 | 19/19 (100.00%) | 56/56 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/observability/hooks/observability-status-dependencies.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/observability/hooks/recent-server-errors-dependencies.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 7/7 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/observability/hooks/use-observability-status.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 4/4 (100.00%) | 3/4 (75.00%) |
| apps/admin/src/features/observability/hooks/use-observability-tab.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/observability/hooks/use-queries-tab.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/observability/hooks/use-recent-error-item.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/observability/hooks/use-recent-server-errors.hooks.ts | LOADED | 0 | 21/21 (100.00%) | 10/10 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/observability/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/observability/observability-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/observability/observability-visuals.tsx | LOADED | 0 | 8/8 (100.00%) | 7/7 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/observability/Observability.tsx | LOADED | 0 | 12/12 (100.00%) | 21/21 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/observability/recent-errors-panel.tsx | LOADED | 0 | 9/9 (100.00%) | 36/37 (97.30%) | 6/6 (100.00%) |
| apps/admin/src/features/observability/recent-errors-rules.ts | LOADED | 0 | 66/66 (100.00%) | 35/36 (97.22%) | 11/11 (100.00%) |
| apps/admin/src/features/pages/hooks/page-editor-dependencies.hooks.ts | LOADED | 0 | 55/55 (100.00%) | 27/27 (100.00%) | 27/27 (100.00%) |
| apps/admin/src/features/pages/hooks/pages-dependencies.hooks.ts | LOADED | 0 | 32/32 (100.00%) | 21/23 (91.30%) | 15/15 (100.00%) |
| apps/admin/src/features/pages/hooks/pages-tab-url.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/pages/hooks/theme-canvas-dependencies.hooks.ts | LOADED | 0 | 16/16 (100.00%) | 9/9 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/pages/hooks/theme-canvas-wrapper.ts | LOADED | 0 | 21/21 (100.00%) | 14/15 (93.33%) | 3/3 (100.00%) |
| apps/admin/src/features/pages/hooks/theme-pages-dependencies.hooks.ts | LOADED | 0 | 15/15 (100.00%) | 17/17 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/pages/hooks/use-editor-html-jump.hooks.ts | LOADED | 0 | 54/54 (100.00%) | 25/25 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/pages/hooks/use-interactive-flush.hooks.ts | LOADED | 0 | 25/25 (100.00%) | 10/10 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts | LOADED | 0 | 256/256 (100.00%) | 145/145 (100.00%) | 71/71 (100.00%) |
| apps/admin/src/features/pages/hooks/use-pages.hooks.ts | LOADED | 0 | 50/50 (100.00%) | 33/33 (100.00%) | 22/23 (95.65%) |
| apps/admin/src/features/pages/hooks/use-theme-canvas-styling.hooks.ts | LOADED | 0 | 69/69 (100.00%) | 45/46 (97.83%) | 20/20 (100.00%) |
| apps/admin/src/features/pages/hooks/use-theme-pages.hooks.ts | LOADED | 0 | 42/42 (100.00%) | 41/41 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/features/pages/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/pages/lib/embed-placeholder.ts | LOADED | 0 | 25/25 (100.00%) | 24/24 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/pages/lib/prettify-html.ts | LOADED | 0 | 65/65 (100.00%) | 53/54 (98.15%) | 11/11 (100.00%) |
| apps/admin/src/features/pages/lib/theme-page-publish-state.ts | LOADED | 0 | 19/19 (100.00%) | 22/22 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/pages/page-editor-i18n.ts | LOADED | 0 | 17/17 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/pages/PageEditor.tsx | LOADED | 0 | 55/55 (100.00%) | 65/68 (95.59%) | 35/35 (100.00%) |
| apps/admin/src/features/pages/pages-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/pages/Pages.tsx | LOADED | 0 | 30/30 (100.00%) | 23/26 (88.46%) | 19/19 (100.00%) |
| apps/admin/src/features/pages/rules.ts | LOADED | 0 | 70/70 (100.00%) | 72/72 (100.00%) | 41/41 (100.00%) |
| apps/admin/src/features/pages/ThemePageDetailsModal.hooks.tsx | LOADED | 0 | 18/18 (100.00%) | 13/14 (92.86%) | 6/6 (100.00%) |
| apps/admin/src/features/pages/ThemePageDetailsModal.tsx | LOADED | 0 | 14/14 (100.00%) | 12/13 (92.31%) | 7/7 (100.00%) |
| apps/admin/src/features/pages/ThemePagesTab.tsx | LOADED | 0 | 30/30 (100.00%) | 29/30 (96.67%) | 16/16 (100.00%) |
| apps/admin/src/features/playground/hooks/use-playground-canvas.hooks.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/playground/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/playground/playground-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/playground/Playground.tsx | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/plugins/add-plugin-tab-soon.ts | LOADED | 0 | 4/4 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/plugins/AddAgentPluginPanel.tsx | LOADED | 0 | 2/2 (100.00%) | 10/10 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/plugins/AddPluginPanel.tsx | LOADED | 0 | 6/6 (100.00%) | 14/14 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/plugins/agent-plugins-visuals.tsx | LOADED | 0 | 14/14 (100.00%) | 12/12 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/plugins/AgentPluginDetailsModal.tsx | LOADED | 0 | 8/8 (100.00%) | 9/10 (90.00%) | 2/2 (100.00%) |
| apps/admin/src/features/plugins/AgentPluginDisableConfirmDialog.tsx | LOADED | 0 | 5/5 (100.00%) | 7/7 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/plugins/AgentPluginRow.tsx | LOADED | 0 | 16/16 (100.00%) | 25/25 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/plugins/AgentPluginSurfaceFrame.tsx | LOADED | 0 | 7/7 (100.00%) | 5/6 (83.33%) | 3/3 (100.00%) |
| apps/admin/src/features/plugins/composer-capabilities.ts | LOADED | 0 | 56/56 (100.00%) | 36/36 (100.00%) | 26/26 (100.00%) |
| apps/admin/src/features/plugins/hooks/agent-plugin-surfaces-dependencies.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 3/3 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/plugins/hooks/agent-plugins-dependencies.hooks.ts | LOADED | 0 | 18/18 (100.00%) | 10/11 (90.91%) | 9/9 (100.00%) |
| apps/admin/src/features/plugins/hooks/plugin-install-dependencies.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 7/11 (63.64%) | 6/6 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-admin-surface-frame.hooks.ts | LOADED | 0 | 47/47 (100.00%) | 30/31 (96.77%) | 22/23 (95.65%) |
| apps/admin/src/features/plugins/hooks/use-agent-plugin-details-modal.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 3/3 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-agent-plugin-disable-confirm.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-agent-plugin-memory.hooks.ts | LOADED | 0 | 47/47 (100.00%) | 36/41 (87.80%) | 16/18 (88.89%) |
| apps/admin/src/features/plugins/hooks/use-agent-plugin-surfaces.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 7/7 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-agent-plugin-tab.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 1/1 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-agent-plugins.hooks.ts | LOADED | 0 | 37/37 (100.00%) | 15/16 (93.75%) | 21/21 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-package-file-tree.hooks.ts | LOADED | 0 | 34/34 (100.00%) | 25/31 (80.65%) | 12/12 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-plugin-package-files.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 5/5 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/plugins/hooks/use-plugin-remove-confirm.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/plugins/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/plugins/installed-skills-composer-source.ts | LOADED | 0 | 15/15 (100.00%) | 12/12 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/plugins/package-file-tree.ts | LOADED | 0 | 7/7 (100.00%) | 0/0 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/plugins/PackageFilesModal.tsx | LOADED | 0 | 26/26 (100.00%) | 33/33 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/features/plugins/PluginPackageFilesModal.tsx | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/plugins/PluginRemoveConfirmDialog.tsx | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/plugins/PluginRow.tsx | LOADED | 0 | 10/10 (100.00%) | 10/10 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/plugins/plugins-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/plugins/plugins-memory-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/plugins/plugins-visuals.tsx | LOADED | 0 | 7/7 (100.00%) | 6/6 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/plugins/selected-skills.ts | LOADED | 0 | 6/6 (100.00%) | 11/11 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/posts/hooks/post-editor-save.rules.ts | LOADED | 0 | 10/10 (100.00%) | 31/31 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/posts/hooks/post-editor-state.rules.ts | LOADED | 0 | 13/13 (100.00%) | 24/24 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/posts/hooks/posts-list-dependencies.hooks.ts | LOADED | 0 | 32/32 (100.00%) | 22/23 (95.65%) | 15/15 (100.00%) |
| apps/admin/src/features/posts/hooks/use-post-editor-ui.hooks.ts | LOADED | 0 | 61/61 (100.00%) | 28/28 (100.00%) | 27/27 (100.00%) |
| apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts | LOADED | 0 | 200/200 (100.00%) | 91/91 (100.00%) | 49/49 (100.00%) |
| apps/admin/src/features/posts/hooks/use-post-featured-image.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 12/12 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/posts/hooks/use-post-url-dialog.hooks.ts | LOADED | 0 | 51/51 (100.00%) | 43/44 (97.73%) | 13/13 (100.00%) |
| apps/admin/src/features/posts/hooks/use-posts.hooks.ts | LOADED | 0 | 48/48 (100.00%) | 33/33 (100.00%) | 22/22 (100.00%) |
| apps/admin/src/features/posts/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/posts/post-editor-route-key.ts | LOADED | 0 | 3/3 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/posts/PostAuthorFields.tsx | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/posts/PostCoverImage.tsx | LOADED | 0 | 7/7 (100.00%) | 13/15 (86.67%) | 4/4 (100.00%) |
| apps/admin/src/features/posts/PostPublishingFields.tsx | LOADED | 0 | 2/2 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/posts/posts-i18n.ts | LOADED | 0 | 7/7 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/posts/Posts.tsx | LOADED | 0 | 23/23 (100.00%) | 18/19 (94.74%) | 15/15 (100.00%) |
| apps/admin/src/features/posts/PostUrlDialog.tsx | LOADED | 0 | 2/2 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/posts/rules.ts | LOADED | 0 | 87/87 (100.00%) | 116/116 (100.00%) | 44/44 (100.00%) |
| apps/admin/src/features/providers/always-allow-rules.ts | LOADED | 0 | 18/18 (100.00%) | 10/12 (83.33%) | 9/9 (100.00%) |
| apps/admin/src/features/providers/AlwaysAllowPanel.tsx | LOADED | 0 | 10/10 (100.00%) | 10/10 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/providers/hooks/always-allow-dependencies.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 9/9 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/providers/hooks/use-always-allow.hooks.ts | LOADED | 0 | 25/25 (100.00%) | 12/12 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/features/providers/hooks/use-providers.hooks.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/providers/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/providers/providers-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/providers/Providers.tsx | LOADED | 0 | 12/12 (100.00%) | 12/12 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/publish-content/hooks/publish-availability.store.ts | LOADED | 0 | 11/11 (100.00%) | 2/2 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/publish-content/hooks/publish-content-dependencies.hooks.ts | LOADED | 0 | 56/56 (100.00%) | 70/70 (100.00%) | 17/17 (100.00%) |
| apps/admin/src/features/publish-content/hooks/publish-request.store.ts | LOADED | 0 | 24/24 (100.00%) | 4/4 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts | LOADED | 0 | 322/322 (100.00%) | 295/309 (95.47%) | 76/76 (100.00%) |
| apps/admin/src/features/publish-content/hooks/use-publish-section-button.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/publish-content/publish-scope.ts | LOADED | 0 | 12/12 (100.00%) | 16/16 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/publish-content/PublishContentDialog.tsx | LOADED | 0 | 18/18 (100.00%) | 56/56 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/features/publish-content/PublishSectionButton.tsx | LOADED | 0 | 3/3 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/recovery/hooks/recovery-dependencies.hooks.ts | LOADED | 0 | 21/21 (100.00%) | 23/24 (95.83%) | 10/10 (100.00%) |
| apps/admin/src/features/recovery/hooks/restore-flow-dependencies.hooks.ts | LOADED | 0 | 16/16 (100.00%) | 17/17 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/recovery/hooks/use-recovery-navigation.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 2/2 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/recovery/hooks/use-recovery.hooks.ts | LOADED | 0 | 45/45 (100.00%) | 19/19 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/recovery/hooks/use-restore-flow.hooks.ts | LOADED | 0 | 51/51 (100.00%) | 4/4 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/recovery/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/recovery/recovery-i18n.tsx | LOADED | 0 | 18/18 (100.00%) | 2/2 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/recovery/Recovery.tsx | LOADED | 0 | 48/48 (100.00%) | 63/63 (100.00%) | 23/23 (100.00%) |
| apps/admin/src/features/recovery/rules.ts | LOADED | 0 | 16/16 (100.00%) | 10/10 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/redirects/index.ts | LOADED | 0 | 1/1 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/redirects/redirects-i18n.tsx | LOADED | 0 | 20/20 (100.00%) | 1/2 (50.00%) | 8/8 (100.00%) |
| apps/admin/src/features/roles/hooks/roles-dependencies.hooks.ts | LOADED | 0 | 70/70 (100.00%) | 41/43 (95.35%) | 35/35 (100.00%) |
| apps/admin/src/features/roles/hooks/use-roles.hooks.ts | LOADED | 0 | 142/142 (100.00%) | 60/60 (100.00%) | 40/40 (100.00%) |
| apps/admin/src/features/roles/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/roles/roles-i18n.ts | LOADED | 0 | 13/13 (100.00%) | 1/2 (50.00%) | 5/5 (100.00%) |
| apps/admin/src/features/roles/Roles.hooks.tsx | LOADED | 0 | 7/7 (100.00%) | 2/2 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/roles/rules.ts | LOADED | 0 | 14/14 (100.00%) | 12/12 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/security/AccessTokensTab.hooks.tsx | LOADED | 0 | 30/30 (100.00%) | 14/14 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/features/security/CopyKeysDialog.tsx | LOADED | 0 | 6/6 (100.00%) | 18/18 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/security/hooks/access-tokens-dependencies.hooks.ts | LOADED | 0 | 36/36 (100.00%) | 29/29 (100.00%) | 39/39 (100.00%) |
| apps/admin/src/features/security/hooks/other-credentials-dependencies.hooks.ts | LOADED | 0 | 27/27 (100.00%) | 21/21 (100.00%) | 25/25 (100.00%) |
| apps/admin/src/features/security/hooks/security-permissions-dependencies.hooks.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/security/hooks/site-key-dependencies.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 0/0 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/security/hooks/site-key-status.rules.ts | LOADED | 0 | 4/4 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts | LOADED | 0 | 228/228 (100.00%) | 193/197 (97.97%) | 97/97 (100.00%) |
| apps/admin/src/features/security/hooks/use-copy-keys.hooks.ts | LOADED | 0 | 77/77 (100.00%) | 63/63 (100.00%) | 38/38 (100.00%) |
| apps/admin/src/features/security/hooks/use-other-credentials.hooks.ts | LOADED | 0 | 99/99 (100.00%) | 75/78 (96.15%) | 53/53 (100.00%) |
| apps/admin/src/features/security/hooks/use-security-permissions.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/security/hooks/use-site-key-recovery.hooks.ts | LOADED | 0 | 58/58 (100.00%) | 22/22 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/security/hooks/use-site-key.hooks.ts | LOADED | 0 | 47/47 (100.00%) | 28/28 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/security/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/security/OtherCredentialsSection.hooks.tsx | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/security/OtherCredentialsSection.tsx | LOADED | 0 | 22/22 (100.00%) | 18/18 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/features/security/rules.ts | LOADED | 0 | 135/135 (100.00%) | 196/199 (98.49%) | 71/71 (100.00%) |
| apps/admin/src/features/security/security-i18n.ts | LOADED | 0 | 31/31 (100.00%) | 12/12 (100.00%) | 14/14 (100.00%) |
| apps/admin/src/features/security/security-visuals.tsx | LOADED | 0 | 6/6 (100.00%) | 5/5 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/security/Security.tsx | LOADED | 0 | 12/12 (100.00%) | 9/10 (90.00%) | 4/4 (100.00%) |
| apps/admin/src/features/security/SiteKeyRecoveryCard.tsx | LOADED | 0 | 15/15 (100.00%) | 18/18 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/security/SiteKeyTab.hooks.tsx | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/seo/index.ts | LOADED | 0 | 3/3 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/seo/seo-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/settings/AdminAppearance.tsx | LOADED | 0 | 20/20 (100.00%) | 23/24 (95.83%) | 6/6 (100.00%) |
| apps/admin/src/features/settings/ai-agent-presentation.ts | LOADED | 0 | 14/14 (100.00%) | 20/20 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/settings/external-mcp-admissions-rules.ts | LOADED | 0 | 76/76 (100.00%) | 59/59 (100.00%) | 32/32 (100.00%) |
| apps/admin/src/features/settings/external-mcp-i18n.ts | LOADED | 0 | 5/5 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/settings/external-mcp-tool-picker-rules.ts | LOADED | 0 | 45/45 (100.00%) | 39/39 (100.00%) | 31/31 (100.00%) |
| apps/admin/src/features/settings/ExternalMcpAdmissionsBanner.tsx | LOADED | 0 | 21/21 (100.00%) | 26/26 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/settings/ExternalMcpRemoveConfirmDialog.tsx | LOADED | 0 | 4/4 (100.00%) | 1/1 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/settings/ExternalMcpToolPicker.hooks.tsx | LOADED | 0 | 28/28 (100.00%) | 18/20 (90.00%) | 16/16 (100.00%) |
| apps/admin/src/features/settings/ExternalMcpToolPicker.tsx | LOADED | 0 | 37/37 (100.00%) | 36/36 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/settings/ExternalMcpToolsModal.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 4/4 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/settings/ExternalMcpToolsModal.tsx | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/settings/hooks/use-admin-appearance-settings.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/settings/hooks/use-ai-agent-presentation.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 10/10 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/settings/hooks/use-external-mcp-admissions.hooks.ts | LOADED | 0 | 64/64 (100.00%) | 42/42 (100.00%) | 31/31 (100.00%) |
| apps/admin/src/features/settings/hooks/use-external-mcp-remove-confirm.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/settings/hooks/use-external-mcp-tool-picker.hooks.ts | LOADED | 0 | 30/30 (100.00%) | 10/10 (100.00%) | 18/18 (100.00%) |
| apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts | LOADED | 0 | 73/73 (100.00%) | 76/76 (100.00%) | 22/22 (100.00%) |
| apps/admin/src/features/settings/hooks/use-settings-active-tab-scroll.hooks.ts | LOADED | 0 | 16/16 (100.00%) | 8/8 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/settings/hooks/use-settings-locale-sync.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/settings/hooks/use-settings-ui.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 0/0 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/settings/hooks/use-user-interface-tab.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/settings/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/settings/rules.ts | LOADED | 0 | 48/48 (100.00%) | 59/59 (100.00%) | 17/17 (100.00%) |
| apps/admin/src/features/settings/settings-capabilities-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/settings/settings-execution-i18n.ts | LOADED | 0 | 7/7 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/settings/settings-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/settings/settings-interface-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/settings/settings-memory-i18n.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/settings/UserInterfaceSettingsPanel.tsx | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/sites/AllSitesTab.tsx | LOADED | 0 | 25/25 (100.00%) | 26/26 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/sites/CreateSiteOnboarding.tsx | LOADED | 0 | 18/18 (100.00%) | 11/11 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/sites/hooks/site-transfer-dependencies.hooks.ts | LOADED | 0 | 16/16 (100.00%) | 3/3 (100.00%) | 14/14 (100.00%) |
| apps/admin/src/features/sites/hooks/sites-dependencies.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 11/11 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/sites/hooks/use-create-site-plugin-tokens.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 8/8 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/sites/hooks/use-created-site-return.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/sites/hooks/use-local-sites.hooks.ts | LOADED | 0 | 43/43 (100.00%) | 45/45 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/sites/hooks/use-site-card-preview.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/sites/hooks/use-site-confirm.hooks.ts | LOADED | 0 | 17/17 (100.00%) | 5/5 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/sites/hooks/use-site-transfer.hooks.ts | LOADED | 0 | 109/109 (100.00%) | 55/62 (88.71%) | 27/27 (100.00%) |
| apps/admin/src/features/sites/hooks/use-sites-config.hooks.ts | LOADED | 0 | 28/28 (100.00%) | 21/21 (100.00%) | 24/24 (100.00%) |
| apps/admin/src/features/sites/hooks/use-sites-home.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/sites/hooks/use-sites-snapshot.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/sites/hooks/use-sites.hooks.ts | LOADED | 0 | 76/76 (100.00%) | 28/28 (100.00%) | 21/21 (100.00%) |
| apps/admin/src/features/sites/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/sites/LocalSiteConfirmDialog.tsx | LOADED | 0 | 2/2 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/sites/rules.ts | LOADED | 0 | 41/41 (100.00%) | 48/48 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/sites/site-publish-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/sites/site-publish-rules.ts | LOADED | 0 | 26/26 (100.00%) | 32/32 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/sites/site-transfer-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/sites/site-transfer-rules.ts | LOADED | 0 | 17/17 (100.00%) | 20/21 (95.24%) | 6/6 (100.00%) |
| apps/admin/src/features/sites/SiteExportTab.tsx | LOADED | 0 | 20/20 (100.00%) | 23/23 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/sites/SiteImportTab.tsx | LOADED | 0 | 40/40 (100.00%) | 53/53 (100.00%) | 21/21 (100.00%) |
| apps/admin/src/features/sites/SitePublishButton.tsx | LOADED | 0 | 34/34 (100.00%) | 31/31 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/sites/sites-i18n.ts | LOADED | 0 | 22/22 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/sites/sites-settings-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/sites/sites-visuals.tsx | LOADED | 0 | 7/7 (100.00%) | 6/6 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/sites/Sites.hooks.tsx | LOADED | 0 | 86/86 (100.00%) | 157/157 (100.00%) | 46/46 (100.00%) |
| apps/admin/src/features/sites/SitesHomeSetting.tsx | LOADED | 0 | 27/27 (100.00%) | 29/29 (100.00%) | 21/21 (100.00%) |
| apps/admin/src/features/sites/SiteTrashTab.tsx | LOADED | 0 | 11/11 (100.00%) | 10/12 (83.33%) | 6/6 (100.00%) |
| apps/admin/src/features/skills/api.ts | LOADED | 0 | 12/12 (100.00%) | 8/8 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/skills/skill-drop.ts | LOADED | 0 | 30/30 (100.00%) | 35/35 (100.00%) | 18/18 (100.00%) |
| apps/admin/src/features/skills/skill-upload.ts | LOADED | 0 | 10/10 (100.00%) | 16/16 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/skills/SkillInstallConfirmation.tsx | LOADED | 0 | 3/3 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/skills/SkillRemoveConfirmDialog.tsx | LOADED | 0 | 1/1 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/skills/SkillRow.tsx | LOADED | 0 | 2/2 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/skills/skills-visuals.tsx | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/skills/Skills.tsx | LOADED | 0 | 8/8 (100.00%) | 11/12 (91.67%) | 4/4 (100.00%) |
| apps/admin/src/features/skills/use-skill-confirmation.hooks.ts | LOADED | 0 | 17/17 (100.00%) | 10/10 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/skills/use-skill-files.hooks.ts | LOADED | 0 | 18/18 (100.00%) | 20/20 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/skills/use-skill-install.hooks.ts | LOADED | 0 | 22/22 (100.00%) | 16/16 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/skills/use-skills-tabs.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 0/0 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/skills/use-skills.hooks.ts | LOADED | 0 | 68/68 (100.00%) | 41/41 (100.00%) | 30/30 (100.00%) |
| apps/admin/src/features/source-control/hooks/source-control-credentials-dependencies.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 11/11 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/source-control/hooks/use-source-control-credentials.hooks.ts | LOADED | 0 | 47/47 (100.00%) | 43/43 (100.00%) | 24/24 (100.00%) |
| apps/admin/src/features/source-control/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/source-control/ProvidersTab.tsx | LOADED | 0 | 27/27 (100.00%) | 45/48 (93.75%) | 15/16 (93.75%) |
| apps/admin/src/features/source-control/rules.ts | LOADED | 0 | 29/29 (100.00%) | 40/42 (95.24%) | 14/14 (100.00%) |
| apps/admin/src/features/source-control/source-control-i18n.ts | LOADED | 0 | 9/9 (100.00%) | 1/2 (50.00%) | 3/3 (100.00%) |
| apps/admin/src/features/source-control/source-control-visuals.tsx | LOADED | 0 | 4/4 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/merge-term-section-dependencies.hooks.ts | LOADED | 0 | 13/13 (100.00%) | 9/9 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/new-taxonomy-form-dependencies.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/new-term-form-dependencies.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/taxonomy-dependencies.hooks.ts | LOADED | 0 | 28/28 (100.00%) | 15/15 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/term-picker-dependencies.hooks.ts | LOADED | 0 | 24/24 (100.00%) | 15/15 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/use-merge-term-section.hooks.ts | LOADED | 0 | 63/63 (100.00%) | 24/24 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/use-new-taxonomy-form.hooks.ts | LOADED | 0 | 20/20 (100.00%) | 6/6 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/use-new-term-form.hooks.ts | LOADED | 0 | 22/22 (100.00%) | 10/10 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/use-taxonomy-html-embed.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/use-term-detail-panel.hooks.ts | LOADED | 0 | 32/32 (100.00%) | 10/10 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/taxonomy/hooks/use-term-picker.hooks.ts | LOADED | 0 | 100/100 (100.00%) | 80/80 (100.00%) | 37/37 (100.00%) |
| apps/admin/src/features/taxonomy/html-rules.ts | LOADED | 0 | 4/4 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/taxonomy/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/taxonomy/rules.ts | LOADED | 0 | 47/47 (100.00%) | 45/46 (97.83%) | 15/15 (100.00%) |
| apps/admin/src/features/taxonomy/taxonomy-i18n.ts | LOADED | 0 | 8/8 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/taxonomy/Taxonomy.tsx | LOADED | 0 | 65/65 (100.00%) | 98/98 (100.00%) | 43/43 (100.00%) |
| apps/admin/src/features/taxonomy/TaxonomyRowMenu.hooks.ts | LOADED | 0 | 67/67 (100.00%) | 40/40 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/features/taxonomy/TaxonomyRowMenu.tsx | LOADED | 0 | 11/11 (100.00%) | 16/16 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/taxonomy/TermPicker.tsx | LOADED | 0 | 25/25 (100.00%) | 31/31 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/themes/hooks/theme-explore-dependencies.hooks.ts | LOADED | 0 | 49/49 (100.00%) | 29/29 (100.00%) | 25/25 (100.00%) |
| apps/admin/src/features/themes/hooks/theme-explore-open-file.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/themes/hooks/theme-explore-url.hooks.ts | LOADED | 0 | 19/19 (100.00%) | 21/21 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/themes/hooks/use-theme-card-preview.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 15/15 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/themes/hooks/use-theme-delete-request.hooks.ts | LOADED | 0 | 11/11 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/themes/hooks/use-theme-explore-file-groups.hooks.ts | LOADED | 0 | 29/29 (100.00%) | 29/29 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/features/themes/hooks/use-theme-explore-preview.hooks.ts | LOADED | 0 | 18/18 (100.00%) | 25/25 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/themes/hooks/use-theme-explore-theme.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 20/22 (90.91%) | 7/7 (100.00%) |
| apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts | LOADED | 0 | 428/428 (100.00%) | 264/264 (100.00%) | 123/125 (98.40%) |
| apps/admin/src/features/themes/hooks/use-themes.hooks.ts | LOADED | 0 | 83/83 (100.00%) | 39/39 (100.00%) | 26/26 (100.00%) |
| apps/admin/src/features/themes/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/themes/rules.ts | LOADED | 0 | 25/25 (100.00%) | 20/20 (100.00%) | 18/18 (100.00%) |
| apps/admin/src/features/themes/theme-card-menu.ts | LOADED | 0 | 13/13 (100.00%) | 15/15 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/themes/theme-preview-refresh.ts | LOADED | 0 | 20/20 (100.00%) | 18/18 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/themes/ThemeExplore.hooks.tsx | LOADED | 0 | 20/20 (100.00%) | 14/14 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/themes/ThemeExplore.tsx | LOADED | 0 | 108/108 (100.00%) | 104/118 (88.14%) | 53/54 (98.15%) |
| apps/admin/src/features/themes/ThemePreviewReloadButton.tsx | LOADED | 0 | 3/3 (100.00%) | 2/3 (66.67%) | 2/2 (100.00%) |
| apps/admin/src/features/themes/themes-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/themes/themes-visuals.tsx | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/themes/Themes.tsx | LOADED | 0 | 45/45 (100.00%) | 68/70 (97.14%) | 25/25 (100.00%) |
| apps/admin/src/features/trash/hooks/trash-dependencies.hooks.ts | LOADED | 0 | 25/25 (100.00%) | 18/19 (94.74%) | 12/12 (100.00%) |
| apps/admin/src/features/trash/hooks/use-trash.hooks.ts | LOADED | 0 | 87/87 (100.00%) | 42/42 (100.00%) | 26/26 (100.00%) |
| apps/admin/src/features/trash/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/trash/rules.ts | LOADED | 0 | 39/39 (100.00%) | 42/44 (95.45%) | 17/17 (100.00%) |
| apps/admin/src/features/trash/trash-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/trash/Trash.tsx | LOADED | 0 | 36/36 (100.00%) | 27/29 (93.10%) | 22/22 (100.00%) |
| apps/admin/src/features/users/hooks/users-controller.hooks.ts | LOADED | 0 | 11/11 (100.00%) | 2/2 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/users/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/users/users-i18n.ts | LOADED | 0 | 9/9 (100.00%) | 3/6 (50.00%) | 2/2 (100.00%) |
| apps/admin/src/features/users/UsersPanel.tsx | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 6/7 (85.71%) |
| apps/admin/src/features/voice-input/hooks/mic-button-view.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/voice-input/hooks/mic-capture.ts | LOADED | 0 | 43/43 (100.00%) | 2/2 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/features/voice-input/hooks/space-hold-rules.ts | LOADED | 0 | 8/8 (100.00%) | 14/14 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/voice-input/hooks/use-composer-voice-input.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/voice-input/hooks/use-push-to-talk.hooks.ts | LOADED | 0 | 62/62 (100.00%) | 41/42 (97.62%) | 26/26 (100.00%) |
| apps/admin/src/features/voice-input/hooks/use-space-hold-to-talk.hooks.ts | LOADED | 0 | 46/46 (100.00%) | 26/26 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/voice-input/PushToTalkMicButton.tsx | LOADED | 0 | 9/9 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/voice-input/voice-input-config.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/voice-input/voice-input-port.ts | LOADED | 0 | 2/2 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/voice-input/voice-unavailability.ts | LOADED | 0 | 6/6 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/webmcp/admin-page-approval.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 6/6 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/webmcp/admin-page-approval.store.ts | LOADED | 0 | 12/12 (100.00%) | 9/9 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/webmcp/admin-page-tools.ts | LOADED | 0 | 35/35 (100.00%) | 43/43 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/features/webmcp/AdminPageApprovalDialog.tsx | LOADED | 0 | 2/2 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/features/webmcp/browser-agent-settings.hooks.ts | LOADED | 0 | 24/24 (100.00%) | 14/14 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/features/webmcp/BrowserAgentSettingsPanel.tsx | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/webmcp/webmcp-i18n.ts | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/widgets/index.ts | LOADED | 0 | 6/6 (100.00%) | 10/10 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/widgets/widgets-i18n.ts | LOADED | 0 | 5/5 (100.00%) | 1/2 (50.00%) | 1/1 (100.00%) |
| apps/admin/src/features/workspace/hooks/use-workspace-redirect.hooks.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/workspace/hooks/use-workspace.hooks.ts | LOADED | 0 | 37/37 (100.00%) | 10/10 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/features/workspace/hooks/workspace-dependencies.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 3/3 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/features/workspace/index.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/workspace/rules.ts | LOADED | 0 | 6/6 (100.00%) | 12/12 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/features/workspace/workspace-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/workspace/Workspace.tsx | LOADED | 0 | 9/9 (100.00%) | 19/19 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/workspace/WorkspaceRedirect.tsx | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/hooks/admin-execution-credential-dependencies.hooks.ts | LOADED | 0 | 16/16 (100.00%) | 17/17 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/hooks/admin-locale-dependencies.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 9/9 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/hooks/assistant-chats-dependencies.hooks.ts | LOADED | 0 | 41/41 (100.00%) | 32/33 (96.97%) | 17/17 (100.00%) |
| apps/admin/src/hooks/use-admin-appearance-snapshot.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/hooks/use-admin-appearance.hooks.ts | LOADED | 0 | 39/39 (100.00%) | 25/25 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/hooks/use-admin-document-locale.hooks.ts | LOADED | 0 | 3/3 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/hooks/use-admin-execution-credential.hooks.ts | LOADED | 0 | 28/28 (100.00%) | 20/20 (100.00%) | 18/18 (100.00%) |
| apps/admin/src/hooks/use-admin-locale.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 3/3 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/hooks/use-agent-screen-context.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 9/9 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/hooks/use-assistant-chats.hooks.ts | LOADED | 0 | 29/29 (100.00%) | 7/8 (87.50%) | 27/27 (100.00%) |
| apps/admin/src/hooks/use-cms-sidebar-label-tooltips.hooks.ts | LOADED | 0 | 19/19 (100.00%) | 13/13 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/hooks/use-content-refresh-subscription.hooks.ts | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/hooks/use-credential-hint.hooks.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/hooks/use-dock-auto-rail.hooks.ts | LOADED | 0 | 20/20 (100.00%) | 15/15 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/hooks/use-drawer-active-item-centring.hooks.ts | LOADED | 0 | 14/14 (100.00%) | 10/10 (100.00%) | 4/5 (80.00%) |
| apps/admin/src/hooks/use-external-entry-refresh.hooks.ts | LOADED | 0 | 56/56 (100.00%) | 27/27 (100.00%) | 11/12 (91.67%) |
| apps/admin/src/hooks/use-focus-trap.hooks.ts | LOADED | 0 | 1/1 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/hooks/use-interface-preferences.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 11/11 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/hooks/use-list-table-cell-labels.hooks.ts | LOADED | 0 | 28/28 (100.00%) | 20/21 (95.24%) | 8/8 (100.00%) |
| apps/admin/src/hooks/use-settings-slice.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 6/6 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/hooks/use-sidebar-empty-click-toggle.hooks.ts | LOADED | 0 | 27/27 (100.00%) | 31/31 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/hooks/use-sites-sidebar-nav.hooks.ts | LOADED | 0 | 42/42 (100.00%) | 25/25 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/hooks/use-standing-draft-autosave.hooks.ts | LOADED | 0 | 7/7 (100.00%) | 4/4 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/hooks/use-tovu-execution-adapters.hooks.ts | LOADED | 0 | 26/26 (100.00%) | 18/18 (100.00%) | 12/12 (100.00%) |
| apps/admin/src/hooks/use-tovu-execution-policy.hooks.ts | LOADED | 0 | 16/16 (100.00%) | 18/18 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/integrations/chart-providers/chart-registry-context.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/integrations/chart-providers/chart-registry-dependencies.hooks.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/integrations/chart-providers/ChartRegistryProvider.tsx | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/integrations/chart-providers/use-chart-registry.hooks.ts | LOADED | 0 | 19/19 (100.00%) | 10/10 (100.00%) | 11/11 (100.00%) |
| apps/admin/src/integrations/jini-admin/AdminModulesProvider.tsx | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/integrations/jini-admin/comments-module.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 3/3 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/integrations/jini-admin/comments-ports.ts | LOADED | 0 | 14/14 (100.00%) | 22/22 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/integrations/jini-admin/forms-module.hooks.ts | LOADED | 0 | 8/8 (100.00%) | 6/6 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/integrations/jini-admin/forms-ports.ts | LOADED | 0 | 9/9 (100.00%) | 12/12 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/integrations/jini-admin/kit.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/integrations/jini-admin/media-ports.ts | LOADED | 0 | 67/67 (100.00%) | 67/67 (100.00%) | 35/35 (100.00%) |
| apps/admin/src/integrations/jini-admin/ModulePanel.tsx | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/integrations/jini-admin/modules.hooks.ts | LOADED | 0 | 34/34 (100.00%) | 33/33 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/integrations/jini-admin/redirects-module.hooks.ts | LOADED | 0 | 9/9 (100.00%) | 5/5 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/integrations/jini-admin/redirects-ports.ts | LOADED | 0 | 18/18 (100.00%) | 19/19 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/integrations/jini-admin/seo-module.hooks.ts | LOADED | 0 | 11/11 (100.00%) | 6/6 (100.00%) | 7/8 (87.50%) |
| apps/admin/src/integrations/jini-admin/seo-ports.ts | LOADED | 0 | 11/11 (100.00%) | 16/16 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/integrations/jini-admin/widgets-module.hooks.ts | LOADED | 0 | 15/15 (100.00%) | 5/5 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/integrations/jini-admin/widgets-ports.ts | LOADED | 0 | 7/7 (100.00%) | 7/7 (100.00%) | 6/6 (100.00%) |
| apps/admin/src/lib/a2ui-action-poster.ts | LOADED | 0 | 2/2 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/lib/acceptance-cancellation.ts | LOADED | 0 | 5/5 (100.00%) | 3/3 (100.00%) | 2/4 (50.00%) |
| apps/admin/src/lib/addons-routes.ts | LOADED | 0 | 18/18 (100.00%) | 27/27 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/lib/admin-boot-scope.ts | LOADED | 0 | 3/3 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/admin-dev-origin.ts | LOADED | 0 | 2/2 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/admin-draft-identity.ts | LOADED | 0 | 3/3 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/lib/admin-nav-i18n.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/lib/agent-pages.ts | LOADED | 0 | 11/11 (100.00%) | 8/8 (100.00%) | 10/10 (100.00%) |
| apps/admin/src/lib/agent-screen-context.ts | LOADED | 0 | 13/13 (100.00%) | 14/14 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/lib/agent-screenshot-bus.ts | LOADED | 0 | 9/9 (100.00%) | 0/0 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/lib/agent-screenshot.ts | LOADED | 0 | 33/33 (100.00%) | 16/22 (72.73%) | 8/8 (100.00%) |
| apps/admin/src/lib/app-version.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/lib/assistant-agents-snapshot.ts | LOADED | 0 | 14/14 (100.00%) | 14/15 (93.33%) | 3/3 (100.00%) |
| apps/admin/src/lib/assistant-dock-bus.ts | LOADED | 0 | 23/23 (100.00%) | 2/2 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/lib/assistant-prompt-bus.ts | LOADED | 0 | 26/26 (100.00%) | 7/7 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/lib/assistant-transport-ag-ui.ts | LOADED | 0 | 19/19 (100.00%) | 6/6 (100.00%) | 13/13 (100.00%) |
| apps/admin/src/lib/assistant-transport.ts | LOADED | 0 | 26/26 (100.00%) | 20/20 (100.00%) | 25/25 (100.00%) |
| apps/admin/src/lib/block-atom-insert.ts | LOADED | 0 | 17/17 (100.00%) | 12/12 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/lib/boot-token-fragment.ts | LOADED | 0 | 9/9 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/browser-stream.ts | LOADED | 0 | 80/80 (100.00%) | 50/50 (100.00%) | 26/26 (100.00%) |
| apps/admin/src/lib/browser-working-directory-access.ts | LOADED | 0 | 22/22 (100.00%) | 12/12 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/lib/chat-attachment-liveness.ts | LOADED | 0 | 4/4 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/lib/content-refresh-bus.ts | LOADED | 0 | 11/11 (100.00%) | 6/6 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/lib/credential-copy.ts | LOADED | 0 | 5/5 (100.00%) | 18/19 (94.74%) | 2/2 (100.00%) |
| apps/admin/src/lib/descriptor-i18n.ts | LOADED | 0 | 16/16 (100.00%) | 28/30 (93.33%) | 11/11 (100.00%) |
| apps/admin/src/lib/durable-run-subscription.ts | LOADED | 0 | 24/24 (100.00%) | 18/24 (75.00%) | 13/13 (100.00%) |
| apps/admin/src/lib/editor-template-options.rules.ts | LOADED | 0 | 2/2 (100.00%) | 5/5 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/escape-owned-by-inner-layer.ts | LOADED | 0 | 7/7 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/execution-settings.ts | LOADED | 0 | 68/68 (100.00%) | 68/68 (100.00%) | 33/33 (100.00%) |
| apps/admin/src/lib/external-entry-refresh.ts | LOADED | 0 | 6/6 (100.00%) | 11/11 (100.00%) | 2/2 (100.00%) |
| apps/admin/src/lib/fetch-query/adapter-context.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/lib/fetch-query/provider.tsx | LOADED | 0 | 10/10 (100.00%) | 5/5 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/lib/i18n-common.ts | LOADED | 0 | 10/10 (100.00%) | 0/0 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/lib/ledger-slice.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/lib/local-owner-signin.ts | LOADED | 0 | 12/12 (100.00%) | 15/15 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/lib/media-embed-extension.hooks.ts | LOADED | 0 | 31/31 (100.00%) | 20/20 (100.00%) | 18/18 (100.00%) |
| apps/admin/src/lib/media-embed-extension.tsx | LOADED | 0 | 13/13 (100.00%) | 14/14 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/lib/media-image-extension.tsx | LOADED | 0 | 19/19 (100.00%) | 19/20 (95.00%) | 9/9 (100.00%) |
| apps/admin/src/lib/page-lifecycle.ts | LOADED | 0 | 7/7 (100.00%) | 1/2 (50.00%) | 3/3 (100.00%) |
| apps/admin/src/lib/panel-access.ts | LOADED | 0 | 13/13 (100.00%) | 14/14 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/lib/plain-text-blocks.ts | LOADED | 0 | 7/7 (100.00%) | 4/4 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/lib/playground-render-target-bus.ts | LOADED | 0 | 14/14 (100.00%) | 2/2 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/lib/post-title-extension.ts | LOADED | 0 | 23/23 (100.00%) | 12/12 (100.00%) | 8/8 (100.00%) |
| apps/admin/src/lib/publish-criteria-deep-link.ts | LOADED | 0 | 8/8 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/retry-unreachable.ts | LOADED | 0 | 3/3 (100.00%) | 3/3 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/lib/router.ts | LOADED | 0 | 19/19 (100.00%) | 11/12 (91.67%) | 9/9 (100.00%) |
| apps/admin/src/lib/settings-effective-reads.ts | LOADED | 0 | 18/18 (100.00%) | 16/16 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/lib/settings-events.ts | LOADED | 0 | 32/32 (100.00%) | 28/28 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/lib/settings-refresh-bus.ts | LOADED | 0 | 11/11 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/lib/site-url.ts | LOADED | 0 | 4/4 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/slug-redirect-path.ts | LOADED | 0 | 4/4 (100.00%) | 6/6 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/sse-frames.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/lib/standing-draft-recovery-message.ts | LOADED | 0 | 0/0 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/lib/stored-credential-endpoint.ts | LOADED | 0 | 13/13 (100.00%) | 20/20 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/lib/stream-activity.ts | LOADED | 0 | 24/24 (100.00%) | 7/7 (100.00%) | 15/15 (100.00%) |
| apps/admin/src/lib/tovu-execution-policy.ts | LOADED | 0 | 4/4 (100.00%) | 13/13 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/lib/typed-answer-poster.ts | LOADED | 0 | 3/3 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/unchanged-save-warning.ts | LOADED | 0 | 11/11 (100.00%) | 9/9 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/lib/version-conflict.ts | LOADED | 0 | 3/3 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/lib/visible-interval.ts | LOADED | 0 | 19/19 (100.00%) | 9/12 (75.00%) | 7/7 (100.00%) |
| apps/admin/src/lib/widget-embed-extension.hooks.ts | LOADED | 0 | 45/45 (100.00%) | 27/27 (100.00%) | 22/22 (100.00%) |
| apps/admin/src/lib/widget-embed-placement-content.ts | LOADED | 0 | 6/6 (100.00%) | 10/11 (90.91%) | 4/4 (100.00%) |
| apps/admin/src/media-panel.ts | LOADED | 0 | 2/2 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/admin/src/nav.ts | LOADED | 0 | 3/3 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/panels.tsx | LOADED | 0 | 71/71 (100.00%) | 38/38 (100.00%) | 48/48 (100.00%) |
| apps/desktop/scripts/resolve-ts-ext.ts | LOADED | 0 | 26/26 (100.00%) | 7/7 (100.00%) | 1/1 (100.00%) |
| apps/desktop/src/app-version-ipc.ts | LOADED | 0 | 18/18 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/asar-verify.ts | LOADED | 0 | 126/126 (100.00%) | 12/12 (100.00%) | 9/10 (90.00%) |
| apps/desktop/src/auto-update-controller.ts | LOADED | 0 | 49/49 (100.00%) | 6/8 (75.00%) | 5/5 (100.00%) |
| apps/desktop/src/complexity-debt.ts | LOADED | 0 | 176/176 (100.00%) | 29/30 (96.67%) | 6/6 (100.00%) |
| apps/desktop/src/contracts/app-version.ts | LOADED | 0 | 8/8 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/desktop/src/contracts/chat-attachments.ts | LOADED | 0 | 35/35 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/desktop/src/contracts/find-in-page.ts | LOADED | 0 | 36/36 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/desktop/src/contracts/project.ts | LOADED | 0 | 302/302 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/desktop/src/contracts/runtime-inventory.ts | LOADED | 0 | 28/28 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/desktop/src/contracts/sections.ts | LOADED | 0 | 285/285 (100.00%) | 13/13 (100.00%) | 11/15 (73.33%) |
| apps/desktop/src/contracts/site-name.ts | LOADED | 0 | 26/26 (100.00%) | 8/12 (66.67%) | 4/6 (66.67%) |
| apps/desktop/src/contracts/site-theme-preview-bridge.ts | LOADED | 0 | 22/22 (100.00%) | 8/8 (100.00%) | 5/7 (71.43%) |
| apps/desktop/src/contracts/working-directory.ts | LOADED | 0 | 17/17 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/desktop/src/contracts/workspace-chat.ts | LOADED | 0 | 127/127 (100.00%) | 6/7 (85.71%) | 5/7 (71.43%) |
| apps/desktop/src/contracts/workspace-conversations.ts | LOADED | 0 | 52/52 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/desktop/src/contracts/zoom.ts | LOADED | 0 | 23/23 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| apps/desktop/src/coverage-floors.ts | LOADED | 0 | 84/84 (100.00%) | 8/8 (100.00%) | 7/7 (100.00%) |
| apps/desktop/src/desktop-auth.ts | LOADED | 0 | 457/457 (100.00%) | 45/45 (100.00%) | 24/24 (100.00%) |
| apps/desktop/src/desktop-i18n.ts | LOADED | 0 | 99/99 (100.00%) | 9/9 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/desktop-update-preference.ts | LOADED | 0 | 42/42 (100.00%) | 14/15 (93.33%) | 6/6 (100.00%) |
| apps/desktop/src/desktop-user-data-dir.ts | LOADED | 0 | 89/89 (100.00%) | 14/17 (82.35%) | 4/4 (100.00%) |
| apps/desktop/src/dist-import-check.ts | LOADED | 0 | 38/38 (100.00%) | 7/8 (87.50%) | 3/3 (100.00%) |
| apps/desktop/src/durable-json-file.ts | LOADED | 0 | 56/56 (100.00%) | 9/9 (100.00%) | 8/8 (100.00%) |
| apps/desktop/src/external-site-stop.ts | LOADED | 0 | 195/195 (100.00%) | 55/56 (98.21%) | 15/15 (100.00%) |
| apps/desktop/src/find-in-page-ipc.ts | LOADED | 0 | 73/73 (100.00%) | 15/15 (100.00%) | 13/13 (100.00%) |
| apps/desktop/src/find-menu.ts | LOADED | 0 | 49/49 (100.00%) | 11/11 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/instance-presence.ts | LOADED | 0 | 38/38 (100.00%) | 11/11 (100.00%) | 10/10 (100.00%) |
| apps/desktop/src/jini-mcp-peers.ts | LOADED | 0 | 16/16 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/js-backslide-guard.ts | LOADED | 0 | 47/47 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/keyed-serializer.ts | LOADED | 0 | 57/57 (100.00%) | 7/7 (100.00%) | 4/4 (100.00%) |
| apps/desktop/src/move-to-applications.ts | LOADED | 0 | 241/241 (100.00%) | 52/54 (96.30%) | 14/14 (100.00%) |
| apps/desktop/src/packaged-gate-isolation.ts | LOADED | 0 | 51/51 (100.00%) | 12/14 (85.71%) | 2/2 (100.00%) |
| apps/desktop/src/packaged-paths.ts | LOADED | 0 | 124/124 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| apps/desktop/src/quality-gates.ts | LOADED | 0 | 236/236 (100.00%) | 48/52 (92.31%) | 13/13 (100.00%) |
| apps/desktop/src/remove-site-tree.ts | LOADED | 0 | 35/35 (100.00%) | 11/11 (100.00%) | 2/3 (66.67%) |
| apps/desktop/src/renderer/chat-attachments.ts | LOADED | 0 | 59/59 (100.00%) | 17/17 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/renderer/create-website-onboarding-policy.ts | LOADED | 0 | 14/14 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/renderer/CreateWebsiteOnboarding.tsx | LOADED | 0 | 362/362 (100.00%) | 28/29 (96.55%) | 14/14 (100.00%) |
| apps/desktop/src/renderer/expanded-mode.ts | LOADED | 0 | 95/95 (100.00%) | 14/14 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/renderer/find-query-scheduler.ts | LOADED | 0 | 33/33 (100.00%) | 8/8 (100.00%) | 5/7 (71.43%) |
| apps/desktop/src/renderer/folder-drop.ts | LOADED | 0 | 99/99 (100.00%) | 19/19 (100.00%) | 4/4 (100.00%) |
| apps/desktop/src/renderer/icons.tsx | LOADED | 0 | 247/247 (100.00%) | 7/7 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/renderer/import-site-entry.ts | LOADED | 0 | 28/28 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/renderer/mount-renderer.ts | LOADED | 0 | 41/41 (100.00%) | 4/4 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/renderer/nav-availability.ts | LOADED | 0 | 7/7 (100.00%) | 5/5 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/renderer/persistable-messages.ts | LOADED | 0 | 19/19 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/renderer/public/kuinetic-init.js | LOADED | 0 | 6/6 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/renderer/runner-api.ts | LOADED | 0 | 140/140 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/renderer/site-port.rules.ts | LOADED | 0 | 60/60 (100.00%) | 22/22 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/renderer/site-shell-policy.ts | LOADED | 0 | 59/59 (100.00%) | 47/49 (95.92%) | 9/9 (100.00%) |
| apps/desktop/src/renderer/site-status.ts | LOADED | 0 | 16/16 (100.00%) | 1/1 (100.00%) | 0/0 (100.00%) |
| apps/desktop/src/renderer/site-theme-preview.hooks.ts | LOADED | 0 | 56/56 (100.00%) | 37/39 (94.87%) | 8/8 (100.00%) |
| apps/desktop/src/renderer/SiteGrid.hooks.ts | LOADED | 0 | 239/239 (100.00%) | 34/36 (94.44%) | 12/12 (100.00%) |
| apps/desktop/src/renderer/theme.ts | LOADED | 0 | 50/50 (100.00%) | 16/16 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/renderer/use-app-version.hooks.ts | LOADED | 0 | 44/44 (100.00%) | 13/13 (100.00%) | 5/5 (100.00%) |
| apps/desktop/src/renderer/use-new-site-dir.hooks.ts | LOADED | 0 | 31/31 (100.00%) | 18/18 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/renderer/use-site-actions.hooks.ts | LOADED | 0 | 51/51 (100.00%) | 11/11 (100.00%) | 5/5 (100.00%) |
| apps/desktop/src/renderer/use-site-folders.hooks.ts | LOADED | 0 | 95/95 (100.00%) | 42/42 (100.00%) | 19/19 (100.00%) |
| apps/desktop/src/renderer/use-site-locate.hooks.ts | LOADED | 0 | 79/79 (100.00%) | 17/17 (100.00%) | 7/7 (100.00%) |
| apps/desktop/src/renderer/use-site-storage-settings.hooks.ts | LOADED | 0 | 24/24 (100.00%) | 13/13 (100.00%) | 7/7 (100.00%) |
| apps/desktop/src/renderer/use-sites-folders-dialog.hooks.ts | LOADED | 0 | 68/68 (100.00%) | 19/19 (100.00%) | 11/11 (100.00%) |
| apps/desktop/src/renderer/visible-interval.ts | LOADED | 0 | 64/64 (100.00%) | 10/10 (100.00%) | 6/8 (75.00%) |
| apps/desktop/src/renderer/workspace-chat-transport.ts | LOADED | 0 | 424/424 (100.00%) | 120/122 (98.36%) | 39/40 (97.50%) |
| apps/desktop/src/runner-ipc-stubs.ts | LOADED | 0 | 117/117 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/selftest-tracker.ts | LOADED | 0 | 95/95 (100.00%) | 11/11 (100.00%) | 4/4 (100.00%) |
| apps/desktop/src/shell-staleness.ts | LOADED | 0 | 77/77 (100.00%) | 14/14 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/site-discovery.ts | LOADED | 0 | 59/59 (100.00%) | 23/24 (95.83%) | 11/12 (91.67%) |
| apps/desktop/src/site-history-menu.ts | LOADED | 0 | 151/151 (100.00%) | 12/12 (100.00%) | 6/6 (100.00%) |
| apps/desktop/src/site-name-policy.ts | LOADED | 0 | 26/26 (100.00%) | 11/12 (91.67%) | 4/4 (100.00%) |
| apps/desktop/src/site-preview-scheduler.ts | LOADED | 0 | 48/48 (100.00%) | 16/17 (94.12%) | 5/5 (100.00%) |
| apps/desktop/src/site-scan-policy.ts | LOADED | 0 | 35/35 (100.00%) | 13/16 (81.25%) | 5/5 (100.00%) |
| apps/desktop/src/site-supervisor.ts | LOADED | 0 | 176/176 (100.00%) | 15/15 (100.00%) | 10/10 (100.00%) |
| apps/desktop/src/site-theme-preview-ipc.ts | LOADED | 0 | 65/65 (100.00%) | 38/40 (95.00%) | 9/9 (100.00%) |
| apps/desktop/src/site-theme-preview.ts | LOADED | 0 | 118/118 (100.00%) | 42/48 (87.50%) | 14/15 (93.33%) |
| apps/desktop/src/site-transitions.ts | LOADED | 0 | 80/80 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/speech/mac-on-device-transcriber.ts | LOADED | 0 | 91/91 (100.00%) | 17/17 (100.00%) | 13/14 (92.86%) |
| apps/desktop/src/speech/speech-ipc.ts | LOADED | 0 | 62/62 (100.00%) | 11/12 (91.67%) | 8/8 (100.00%) |
| apps/desktop/src/speech/transcription-port.ts | LOADED | 0 | 26/26 (100.00%) | 5/5 (100.00%) | 4/4 (100.00%) |
| apps/desktop/src/spellcheck-menu.ts | LOADED | 0 | 94/94 (100.00%) | 19/19 (100.00%) | 18/18 (100.00%) |
| apps/desktop/src/tree-quiet.ts | LOADED | 0 | 94/94 (100.00%) | 14/14 (100.00%) | 5/5 (100.00%) |
| apps/desktop/src/update-manifest-merge.ts | LOADED | 0 | 103/103 (100.00%) | 33/34 (97.06%) | 13/13 (100.00%) |
| apps/desktop/src/update-policy.ts | LOADED | 0 | 21/21 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) |
| apps/desktop/src/webview-guest-policy.ts | LOADED | 0 | 33/33 (100.00%) | 8/8 (100.00%) | 3/3 (100.00%) |
| apps/desktop/src/window-bounds-store.ts | LOADED | 0 | 70/70 (100.00%) | 9/9 (100.00%) | 8/8 (100.00%) |
| apps/desktop/src/window-navigation-policy.ts | LOADED | 0 | 84/84 (100.00%) | 12/12 (100.00%) | 11/11 (100.00%) |
| apps/desktop/src/zoom-menu.ts | LOADED | 0 | 51/51 (100.00%) | 12/12 (100.00%) | 7/7 (100.00%) |

## Full never-loaded list

- apps/desktop/src/renderer/public/vendor/kuinetic/kuinetic.js
- apps/website/src/server/inbound/public-http/http/site/render.ts
- apps/website/src/server/runtime/composition/deps.ts
- apps/website/src/server/inbound/public-http/routes/site/pages.ts
- apps/website/src/server/runtime/composition/app.ts
- apps/website/src/assistant/external-mcp-store.ts
- apps/desktop/main.ts
- apps/website/src/server/inbound/assistant/agent-daemon-server.ts
- apps/website/src/features/post/post.ts
- apps/website/src/features/theme/tool-registrations.ts
- apps/desktop/src/project-ipc.ts
- content/agent-plugins/s3-compatible/targets/s3-compatible.mjs
- apps/website/src/server/inbound/admin-http/routes/themes/explore.ts
- apps/website/src/features/theme/publish-content.ts
- apps/website/src/features/theme/theme.ts
- apps/website/src/features/post/tool-registrations.ts
- apps/website/src/features/theme/theme-files.ts
- apps/website/src/features/theme/static-render.ts
- apps/website/src/features/site-backup/tool-registrations.ts
- apps/website/src/assistant/external-mcp-oauth.ts
- apps/website/src/features/publish-content/apply-loop.ts
- apps/website/src/features/deployments/publish-agent-tools.ts
- apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts
- apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts
- apps/website/src/features/custom-credentials/tool-registrations.ts
- apps/website/src/features/deployments/publish-credentials/store.ts
- apps/website/src/features/plugins/data-module.ts
- apps/desktop/scripts/verify-find-in-page.ts
- apps/website/src/server/runtime/composition/plugin-runtime.ts
- apps/website/src/server/inbound/admin-http/dev-auth.ts
- apps/website/src/server/runtime/composition/modules/assistant.ts
- content/agent-plugins/github/source-control/commit-site.mjs
- apps/desktop/scripts/verify-site-power.ts
- apps/website/src/features/webhooks/site-key-ensure.ts
- apps/website/src/features/site-backup/sources.ts
- content/agent-plugins/github/source-control/write-files.mjs
- apps/website/src/features/publish-content/peer-transport.ts
- apps/website/src/features/agent-plugins/tool-registrations.ts
- apps/website/src/server/runtime/composition/peer-site-reads.ts
- apps/desktop/src/tovu-server.ts
- apps/website/src/features/plugin-runtime/tool-registrations.ts
- content/agent-plugins/github-pages/targets/github-pages.mjs
- apps/website/src/server/runtime/composition/tool-catalog-manifest.ts
- apps/website/src/server/inbound/admin-http/routes/system/site-key.ts
- apps/website/src/platform/db/sqlite/share-database.ts
- content/agent-plugins/vercel/targets/vercel.mjs
- apps/website/src/features/newsletter/send-pipeline.ts
- apps/desktop/scripts/smoke-packaged-chat.ts
- apps/website/src/features/pages/tool-registrations.ts
- apps/website/src/features/publish-content/tool-registrations.ts
- apps/website/src/features/publish-content/peers.ts
- apps/website/src/server/runtime/composition/modules/assistant-byok.ts
- apps/website/src/server/runtime/composition/vault-boot.ts
- apps/website/src/features/deployments/deploy-targets/registry.ts
- apps/website/src/features/deployments/deploy-ops/run-ops.ts
- apps/website/src/server/inbound/public-http/http/site/form-render.ts
- apps/website/src/server/inbound/admin-http/routes/publish-content/backstop.ts
- apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts
- content/agent-plugins/cloudflare/worker/forms-receiver.mjs
- apps/website/src/assistant/content-read-tool.ts
- apps/website/src/features/external-mcp/tool-registrations.ts
- apps/website/src/features/members/write-service.ts
- apps/website/src/platform/db/migrations/0012_secrets_vault.ts
- apps/website/src/features/custom-credentials/store.ts
- apps/website/src/platform/site-dir/init-site.ts
- apps/website/src/index.ts
- apps/website/src/platform/db/repos/media-repo.ts
- apps/website/src/features/pages/regions.ts
- apps/website/src/features/publish-content/file-tree-policy.ts
- apps/desktop/src/site-dir-store.ts
- apps/website/src/server/runtime/composition/modules/site-assistant.ts
- content/agent-plugins/google-workspace/ui/surface-client.mjs
- apps/website/src/features/plugin-runtime/declarative-content-types.ts
- apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts
- apps/website/src/features/agent-plugins/connect-tool.ts
- content/agent-plugins/cloudflare/lib/forms.mjs
- apps/desktop/scripts/stage-payload.ts
- apps/website/src/features/publish-content/raw-row-contributor.ts
- apps/website/src/features/newsletter/tool-registrations.ts
- apps/website/src/features/widgets/tool-registrations.ts
- apps/website/src/features/theme/validation/manifest-v2.ts
- apps/website/src/platform/db/migration/manifest.ts
- apps/website/src/features/agent-plugins/install-upload.ts
- apps/website/src/features/source-control/store.ts
- apps/website/src/features/trash/adapters/directory.ts
- apps/website/src/features/deployments/static-publish/adapter.ts
- apps/website/src/features/theme/duplicate-theme.ts
- apps/website/src/server/runtime/lifecycle/local-site-process.ts
- apps/website/src/platform/site-dir/site-registry.ts
- apps/website/src/features/api-connections/host.ts
- apps/website/src/features/publish-content/raw-file-contributor.ts
- apps/website/src/platform/site-dir/move-sites-home.ts
- apps/website/src/cli/commands/serve.ts
- apps/desktop/src/renderer/App.tsx
- apps/website/src/features/deployments/deploy-ops/secrets.ts
- apps/website/src/features/web-screenshot/web-screenshot.ts
- apps/website/src/features/site-inspection/published-page.ts
- apps/website/src/features/webhooks/secret-scan-guard.ts
- apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts
- apps/website/src/server/inbound/admin-http/routes/widgets/agent-tools.ts
- apps/website/src/server/inbound/admin-http/routes/system/sites.ts
- apps/website/src/server/runtime/composition/vault-legacy-codecs.ts
- apps/website/src/features/publish-content/planner.ts
- apps/website/src/features/theme/build-conformance.ts
- content/agent-plugins/netlify/targets/netlify.mjs
- apps/desktop/src/desktop-agent.ts
- apps/website/src/features/deployments/providers/github.ts
- apps/website/src/features/forms/tool-registrations.ts
- apps/website/src/features/identity/api-key-service.ts
- apps/website/src/features/post/publish-content.ts
- apps/website/src/features/publish-trust/provisioning.ts
- apps/website/src/server/runtime/composition/permanent-delete-deps.ts
- apps/website/src/features/trash/table-adapter.ts
- apps/website/src/platform/site-dir/local-site-supervisor.ts
- apps/website/src/platform/db/vault-credential-inventory.ts
- apps/site-chat/src/site-assistant-transport.ts
- apps/website/src/features/skills/tool-registrations.ts
- apps/website/src/server/runtime/composition/modules/assistant-daemon-client.ts
- apps/website/src/server/inbound/admin-http/routes/publish-content/import.ts
- apps/website/src/features/identity/repo.ts
- apps/website/src/features/site-inspection/live-url.ts
- apps/website/src/features/theme/validation/webmcp-markup.ts
- apps/website/src/features/widgets/media-html.ts
- apps/desktop/src/smoke-bridge.ts
- apps/website/src/features/seo/settings.ts
- apps/website/src/server/inbound/admin-http/routes/publish-content/peer-transport.ts
- apps/website/src/assistant/byok-tool-surface.ts
- apps/website/src/features/media/view-video-tool.ts
- apps/website/src/features/site-backup/import-verifier-inventory.ts
- apps/website/src/features/source-control/tool-registrations.ts
- apps/website/src/server/runtime/composition/local-credential-copy.ts
- apps/website/src/features/post/cover-image.ts
- apps/website/src/features/taxonomy/tool-registrations.ts
- apps/website/src/features/theme/migration/migrate-theme.ts
- apps/website/src/features/theme/migration/theme-migration-plan.ts
- apps/website/src/features/sites/tool-registrations.ts
- apps/website/src/features/plugin-runtime/built-ins/content-analyzer/analyze-content.ts
- apps/website/src/server/inbound/admin-http/routes/settings/events.ts
- apps/website/src/server/runtime/composition/form-submissions.ts
- apps/website/src/features/agent-plugins/access-token-tool.ts
- apps/website/src/features/newsletter/repo.ts
- apps/website/src/features/site-backup/import-backend.ts
- content/agent-plugins/github/source-control/backup-push.mjs
- apps/desktop/scripts/check-coverage.ts
- apps/site-chat/scripts/check-bundle-mounts.mjs
- apps/website/src/features/api-connections/contribution.ts
- apps/website/src/features/deployments/static-publish/credentials.ts
- apps/website/src/features/members/repo.ts
- apps/website/src/features/publish-content/media-references.ts
- apps/website/src/features/publish-content/publish-tool.ts
- apps/website/src/features/trash/trash-item-tool.ts
- apps/website/src/features/entries/public-list.ts
- apps/website/src/features/plugin-runtime/capability-tool-registrations.ts
- content/agent-plugins/google-workspace/lib/sheets-client.mjs
- apps/website/src/features/newsletter/delivery/tool-registrations.ts
- apps/website/src/features/publish-content/repo-handler.ts
- apps/desktop/src/sites-mcp-registration.ts
- apps/website/src/features/theme/entry-list-render.ts
- apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts
- apps/website/src/features/media-import/tool-registrations.ts
- apps/website/src/features/recovery/tool-registrations.ts
- apps/website/src/features/webhooks/keyring.env.ts
- apps/website/src/contracts/core/entry-refs/extractor.ts
- apps/website/src/features/custom-credentials/credential-copy-tool.ts
- apps/desktop/src/site-relocation.ts
- apps/website/src/features/agent-plugins/federate-mcp.ts
- apps/website/src/features/identity/tool-registrations.ts
- apps/website/src/server/runtime/composition/domain-dns-adapters.ts
- apps/website/src/assistant/tool-registrations.ts
- apps/website/src/features/comments/tool-registrations.ts
- apps/website/src/features/theme/theme-trash.ts
- apps/website/src/features/deployments/deploy-ops/registry.ts
- apps/website/src/features/deployments/deploy-ops/tool-registrations.ts
- apps/website/src/features/newsletter/repo.memory.ts
- apps/website/src/features/theme/validation/structure.ts
- content/agent-plugins/cloudflare/lib/target.mjs
- content/agent-plugins/github/deploy-ops/github-actions.mjs
- apps/website/src/features/api-connections/connect.ts
- apps/website/src/features/consent/service.ts
- apps/website/src/features/identity/delete-user-service.ts
- apps/website/src/features/publish-trust/grant.ts
- apps/website/src/features/taxonomy/repo.ts
- apps/website/src/assistant/automatic-agent-plugins.ts
- apps/website/src/features/publish-content/ui/criteria.ts
- apps/website/src/platform/db/migrations/legacy-sqlite.ts
- apps/website/src/platform/db/sqlite/database-introspection-adapter.sqlite.ts
- apps/website/src/platform/site-dir/publish-backstop-file.ts
- apps/website/src/features/post/content-stats-tool.ts
- apps/website/src/features/publish-content/export-bundle.ts
- apps/website/src/features/webhooks/tool-registrations.ts
- apps/website/src/platform/db/vault-credential-recovery.ts
- apps/website/src/features/media/provider-credential-store.ts
- apps/website/src/features/publish-trust/revocations.ts
- apps/desktop/src/smoke-packaged-chat.ts
- apps/website/src/platform/site-dir/site-trash.ts
- content/agent-plugins/google-workspace/form-destinations/sheets.mjs
- apps/website/src/features/form-destinations/registry.ts
- apps/website/src/platform/db/schema.postgres.ts
- apps/website/src/server/runtime/boot/resolve-mailer.ts
- apps/website/src/server/runtime/composition/modules/assistant-chats.ts
- apps/website/src/features/members/repo.memory.ts
- apps/website/src/features/theme/handlebars-allowlist.ts
- apps/website/src/platform/db/schema.sqlite.ts
- apps/website/src/server/inbound/admin-http/routes/publish-content/bundle-create.ts
- apps/website/src/server/runtime/composition/open-site-store.ts
- apps/website/src/features/settings/form-delivery.ts
- apps/website/src/platform/db/repos/form-delivery-repo.ts
- apps/website/src/assistant/mcp-ui-tool-calls-route.ts
- apps/website/src/features/theme/validation/validate-theme-package.ts
- apps/website/src/server/inbound/admin-http/publish-trust-auth.ts
- apps/website/src/features/pages/html-document-store.ts
- apps/website/src/server/inbound/public-http/middleware/theme-page-preview.ts
- apps/desktop/bin/mcp-bridge.ts
- apps/website/src/features/media/read-chat-attachment.ts
- apps/website/src/platform/db/sqlite/fresh-content-db.ts
- apps/website/src/platform/site-dir/key-only-site-meta.ts
- apps/website/src/server/runtime/composition/plugin-host.ts
- apps/website/src/server/runtime/composition/site-key-recovery.ts
- apps/website/src/features/custom-credentials/write-files-validation.ts
- apps/website/src/server/inbound/admin-http/routes/posts/autosave.ts
- apps/website/src/features/navigation/publish-content.ts
- apps/website/src/server/inbound/admin-http/routes/publish-content/destination.ts
- apps/site-chat/src/session-store.ts
- apps/website/src/features/agent-plugins/executable-tools/register.ts
- apps/website/src/features/media-generation/providers-tools.ts
- apps/website/src/features/post/search-index.ts
- apps/website/src/features/publish-trust/handshake-client.ts
- apps/website/src/platform/db/sqlite/import-database-worker.ts
- apps/website/src/platform/site-dir/duplicate-site.ts
- content/agent-plugins/google-workspace/ui/connection-panel.mjs
- apps/website/src/features/newsletter/campaign-write-service.ts
- apps/website/src/features/site-backup/import-backend-steps.ts
- apps/website/src/features/widgets/publish-content.ts
- apps/website/src/server/inbound/public-http/routes/plugin-contributions.ts
- apps/website/src/features/media/blob-store.s3.ts
- apps/website/src/features/site-backup/share-service.ts
- apps/website/src/features/source-control/credential-setup.ts
- apps/website/src/features/webhooks/seal-aad-invariant.ts
- apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts
- apps/website/src/server/runtime/boot/local-owner-signin.ts
- content/agent-plugins/google-workspace/ui/destination-panel.mjs
- apps/website/src/features/deployments/deploy-config-registry.ts
- apps/website/src/features/entries/repo.ts
- apps/website/src/features/media-generation/tool-registrations.ts
- apps/website/src/features/plugin-runtime/install-archive.ts
- apps/website/src/features/publish-content/ui/report-rows.ts
- apps/website/src/features/theme/code-tier-asset-normalizer.ts
- apps/website/src/platform/site-dir/repair-site.ts
- apps/website/src/server/inbound/admin-http/routes/media/original.ts
- apps/website/src/server/inbound/admin-http/routes/system/site-imports.ts
- apps/desktop/scripts/smoke-native.ts
- apps/website/src/features/settings/repo.ts
- apps/website/src/features/site-backup/share-preparation-steps.ts
- apps/website/src/features/site-export/route-manifest.ts
- apps/website/src/platform/secrets/vault-meta-rules.ts
- apps/website/src/assistant/external-mcp-reauth-tool.ts
- apps/website/src/features/deployments/static-publish/verify.ts
- apps/website/src/features/redirects/tool-registrations.ts
- apps/website/src/features/source-control/commit-site.ts
- apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts
- apps/website/src/server/inbound/public-http/routes/publish-trust/handshake.ts
- content/agent-plugins/cloudflare/lib/api.mjs
- apps/website/src/features/database-transfer/tool-registrations.ts
- apps/website/src/features/identity/api-key-secret.ts
- apps/website/src/features/site-backup/push-engine.ts
- apps/website/src/features/site-backup/share-registry.ts
- apps/desktop/scripts/check-gates.ts
- apps/website/src/cli/program.ts
- apps/website/src/features/media/import-media-entity.ts
- apps/website/src/features/members/tool-registrations.ts
- apps/website/src/server/inbound/admin-http/admin-dev-proxy.ts
- apps/website/src/server/inbound/admin-http/routes/system/site-shares.ts
- content/agent-plugins/google-workspace/lib/picker-flow.mjs
- apps/desktop/bin/tovu-desktop.ts
- apps/desktop/src/workspace-chat-ipc.ts
- apps/site-chat/src/SiteAssistantWidget.tsx
- apps/website/src/features/agent-plugins/admin-surfaces/delivery-bindings.ts
- apps/website/src/features/api-connections/surface-connections.ts
- apps/website/src/features/database-transfer/table-catalog.ts
- apps/website/src/features/site-backup/import-restore-placement.ts
- apps/website/src/platform/server-logs/log-file.ts
- apps/website/src/platform/site-dir/boot-site-dir.ts
- apps/website/src/server/inbound/admin-http/routes/plugins/install.ts
- apps/website/src/server/inbound/admin-http/routes/plugins/set-enabled.ts
- content/agent-plugins/google-workspace/lib/http.mjs
- apps/desktop/scripts/verify-package.ts
- apps/website/src/cli/commands/init.ts
- apps/website/src/features/media/tool-registrations.ts
- apps/website/src/features/publish-content/backstop-service.ts
- apps/website/src/features/site-inspection/site-profile.ts
- content/agent-plugins/google-workspace/form-destinations/mapping.mjs
- content/agent-plugins/google-workspace/ui/connection-panel.handler.mjs
- apps/desktop/src/agent-plugin-tokens.ts
- apps/website/src/assistant/agents.ts
- apps/website/src/assistant/demo-image-png.ts
- apps/website/src/features/agent-plugins/install-tool.ts
- apps/website/src/features/entries/trash-aware-memory-repo.ts
- apps/website/src/features/site-backup/share-hosting.ts
- apps/website/src/features/theme/file-identity-lock.ts
- apps/website/src/server/inbound/admin-http/routes/recovery/restore.ts
- apps/website/src/cli/commands/adopt.ts
- apps/website/src/features/agent-plugins/new-site-agent-plugin-tokens.ts
- apps/website/src/features/media/view-image-tool.ts
- apps/website/src/features/navigation/import-menu.ts
- apps/website/src/features/navigation/repo.ts
- apps/website/src/features/sites/site-admin.ts
- apps/website/src/features/deployments/static-publish/publish-history.ts
- apps/website/src/features/pages/html-document-store.memory.ts
- apps/website/src/features/site-inspection/page-body.ts
- content/agent-plugins/cloudflare/lib/domains.mjs
- apps/desktop/scripts/check-tree-quiet.ts
- apps/website/src/cli/errors.ts
- apps/website/src/features/web-screenshot/playwright-page-capture.ts
- apps/website/src/features/webhooks/site-key-sources.ts
- apps/website/src/server/inbound/admin-http/routes/taxonomy/assign-terms.ts
- apps/website/src/server/runtime/composition/pending-agent-plugin-tokens.ts
- content/agent-plugins/fly/deploy-ops/fly.mjs
- apps/website/src/assistant/external-mcp-store.memory.ts
- apps/website/src/features/settings/site-title.ts
- apps/website/src/server/inbound/admin-http/routes/database/restore-points.ts
- apps/website/src/server/runtime/lifecycle/close-store-on-shutdown.ts
- content/agent-plugins/google-workspace/ui/dom.mjs
- apps/website/src/assistant/mcp-federation/registrations.ts
- apps/website/src/cli/commands/export.ts
- apps/website/src/features/agent-plugins/import-access-token.ts
- apps/website/src/features/source-control/provider-registry.ts
- apps/website/src/server/inbound/admin-http/routes/agent-plugins/set-enabled.ts
- apps/website/src/server/inbound/admin-http/routes/media/upload.ts
- apps/website/src/server/inbound/admin-http/routes/system/export-site.ts
- apps/website/src/server/runtime/composition/move-site-storage.ts
- apps/website/src/server/runtime/composition/storage-secret.ts
- apps/website/src/features/api-connections/vault-stores.ts
- apps/website/src/features/identity/default-credential-exposure.ts
- apps/website/src/features/media/provider-credential-vault.ts
- apps/website/src/features/publish-trust/challenge.ts
- apps/website/src/features/vendor-credentials/vault-adapter.ts
- apps/website/src/server/runtime/services/external-mcp-probe.ts
- apps/website/src/contracts/core/tool-metadata/index.ts
- apps/website/src/features/media/publish-content.ts
- apps/website/src/features/theme/static-portability-index.ts
- apps/website/src/server/inbound/admin-http/routes/plugins/preview.ts
- apps/website/src/server/inbound/admin-http/routes/system/dockerfile-source.ts
- apps/website/src/server/inbound/public-http/http/site/form-validation-message.ts
- apps/website/src/assistant/execution-credential-store.ts
- apps/website/src/contracts/core/commands/revert.ts
- apps/website/src/features/webhooks/repo.memory.ts
- apps/website/src/platform/oauth/endpoint-safety.ts
- apps/website/src/server/inbound/admin-http/routes/comments/moderate.ts
- apps/website/src/server/inbound/admin-http/routes/pages/update.ts
- apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts
- apps/website/src/server/runtime/composition/modules/content.ts
- apps/desktop/scripts/check-complexity.ts
- apps/website/src/assistant/external-mcp-vault.ts
- apps/website/src/features/fs-files/custom-root-store.ts
- apps/website/src/features/pages/hidden-until-script.ts
- apps/website/src/features/publish-content/type-registry.ts
- apps/website/src/features/publish-trust/session.ts
- apps/website/src/features/seo/tool-registrations.ts
- apps/website/src/server/inbound/admin-http/routes/database/migrate-forward.ts
- apps/website/src/server/inbound/admin-http/routes/posts/update.ts
- apps/website/src/server/inbound/admin-http/routes/site/profile.ts
- apps/website/src/server/inbound/admin-http/routes/users/update.ts
- apps/website/src/server/inbound/assistant/durable-run-routes.ts
- apps/website/src/server/runtime/boot/production-readiness-gate.ts
- content/agent-plugins/google-workspace/lib/request-policy.mjs
- apps/website/src/assistant/tool-approval-policy.ts
- apps/website/src/features/agent-plugins/apply-tool-renames.ts
- apps/website/src/features/agent-plugins/lifecycle.ts
- apps/website/src/features/custom-credentials/vault-repo.ts
- apps/website/src/features/deployments/deploy-targets/host-kit.ts
- apps/website/src/features/post/reverters.ts
- apps/website/src/features/site-evidence/tool-registrations.ts
- apps/website/src/platform/site-dir/read-site-dir.ts
- apps/website/src/server/inbound/admin-http/routes/agent-plugins/admin-surfaces.ts
- apps/website/src/features/entries/unreadable-owner-entries-repair.ts
- apps/website/src/features/members/access-resolver.ts
- apps/website/src/features/plugin-runtime/built-ins/content-analyzer/tiptap-blocks.ts
- apps/website/src/features/plugin-runtime/source-tools.ts
- apps/website/src/features/site-inspection/tool-registrations.ts
- apps/website/src/features/trash/adapters/user.ts
- apps/website/src/platform/db/repos/webhook-repo.ts
- apps/website/src/platform/db/sqlite/publish-backstop-row.sqlite.ts
- apps/website/src/server/inbound/public-http/routes/api-connections/oauth-callback.ts
- apps/website/src/server/runtime/boot/bootstrap.ts
- apps/website/src/assistant/external-mcp-federation-runtime.ts
- apps/website/src/assistant/site/tools.ts
- apps/website/src/features/forms/import-remote-submissions.ts
- apps/website/src/features/site-backup/import-registry.ts
- apps/website/src/features/source-control/credential-form.ts
- apps/website/src/features/theme/liquid-allowlist.ts
- apps/website/src/features/trash/tool-registrations.ts
- apps/website/src/platform/db/repos/external-mcp-repo.ts
- apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts
- apps/website/src/server/inbound/admin-http/routes/menus/update-tree.ts
- apps/website/src/server/inbound/admin-http/routes/posts/template-preview.ts
- apps/desktop/src/sites-mcp-tools.ts
- apps/website/src/assistant/ask-choice-tool.ts
- apps/website/src/features/consent/settings.ts
- apps/website/src/features/publish-content/report-labels.ts
- apps/website/src/features/deployments/static-publish/domain-publish-tool.ts
- apps/website/src/features/domain-dns/tools.ts
- apps/website/src/features/form-destinations/port.ts
- apps/website/src/features/newsletter/subscriptions.ts
- apps/website/src/features/post/repo.memory.ts
- apps/website/src/features/post/repo.ts
- apps/website/src/features/sites/site-preview/site-preview-service.ts
- apps/website/src/features/theme/trash-theme-tool.ts
- apps/website/src/platform/db/sqlite/content-db.ts
- apps/website/src/platform/server-logs/index.ts
- apps/website/src/server/inbound/public-http/middleware/site-consent.ts
- apps/website/src/server/inbound/public-http/middleware/theme-preview-refresh.ts
- apps/website/src/assistant/site-credential-store.ts
- apps/website/src/features/deployments/static-publish/publish-run.ts
- apps/website/src/features/newsletter/unsubscribe.ts
- apps/website/src/server/inbound/admin-http/routes/pages/update-html.ts
- apps/website/src/server/inbound/admin-http/routes/sites/sites-home.ts
- apps/website/src/server/inbound/admin-http/routes/system/credential-copy.ts
- apps/website/src/server/inbound/admin-http/routes/themes/preview.ts
- content/agent-plugins/google-workspace/lib/sheets-admin-request-kinds.mjs
- content/agent-plugins/google-workspace/ui/destination-panel.handler.mjs
- apps/website/src/features/form-destinations/pull.ts
- apps/website/src/features/newsletter/confirmation.ts
- apps/website/src/features/site-backup/share-backend.ts
- apps/website/src/features/site-backup/share-zip.ts
- apps/website/src/platform/server-logs/console-tee.ts
- apps/website/src/server/inbound/admin-http/routes/media/replace.ts
- apps/desktop/src/workspace-conversation-store.ts
- apps/site-chat/src/SiteAssistantActivation.hooks.ts
- apps/website/src/assistant/demo-a2ui-tool.ts
- apps/website/src/features/agent-plugins/uninstall-tool.ts
- apps/website/src/features/members/consent-service.ts
- apps/website/src/features/site-inspection/site-capabilities.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/update-campaign.ts
- apps/website/src/server/inbound/admin-http/routes/settings/shared.ts
- apps/website/src/server/runtime/composition/agent-plugin-connections.ts
- content/agent-plugins/resend/adapters/resend.mjs
- apps/website/src/features/comments/settings.ts
- apps/website/src/features/fs-files/tool-registrations.ts
- apps/website/src/features/media/hydrate-blob-store-from-seed.ts
- apps/website/src/features/site-backup/share-file-policy.ts
- apps/website/src/server/inbound/admin-http/routes/trash/restore.ts
- apps/website/src/server/inbound/admin-http/routes/users/reset-password.ts
- apps/website/src/server/runtime/composition/agent-daemon-deps.ts
- apps/website/src/server/runtime/composition/modules/newsletter.ts
- apps/website/src/server/runtime/lifecycle/agent-daemon-port.ts
- apps/website/src/assistant/byok-meta-tool-result.ts
- apps/website/src/contracts/core/human-confirm.ts
- apps/website/src/features/api-connections/budgets.ts
- apps/website/src/features/content-duplication/tool-registrations.ts
- apps/website/src/features/identity/wiring.ts
- apps/website/src/features/navigation/migrate-footer-page-links.ts
- apps/website/src/features/plugin-runtime/install-tool.ts
- apps/website/src/features/publish-content/backstop-policy.ts
- apps/website/src/features/settings/publish-content.ts
- apps/website/src/features/site-backup/import-verifier-projection.ts
- apps/website/src/platform/db/repos/publish-trust-revocations.ts
- apps/website/src/platform/db/sqlite/database-journal-repo.ts
- apps/website/src/server/inbound/admin-http/routes/assistant/test-connection.ts
- apps/website/src/server/inbound/admin-http/routes/settings/register-definitions.ts
- apps/website/src/server/inbound/admin-http/routes/trash/items.ts
- apps/website/src/server/inbound/admin-http/routes/users/create.ts
- apps/website/src/server/inbound/public-http/middleware/theme-static-assets.ts
- apps/website/src/server/runtime/lifecycle/boot-lifecycle.ts
- content/agent-plugins/google-workspace/ui/picker.mjs
- apps/desktop/src/smoke-native.ts
- apps/website/src/assistant/live-model-cache.ts
- apps/website/src/assistant/mcp-federation/bootstrap.ts
- apps/website/src/features/agent-plugins/mail-adapter-registry.ts
- apps/website/src/features/api-connections/plugin-state.ts
- apps/website/src/features/database-transfer/destination-store.ts
- apps/website/src/features/publish-content/ui/replan.ts
- apps/website/src/features/webmcp/published-html.ts
- apps/website/src/platform/db/migrations/index.ts
- apps/website/src/server/inbound/admin-http/routes/consent/routes.ts
- apps/website/src/server/inbound/admin-http/routes/menus/assign-location.ts
- apps/website/src/server/inbound/admin-http/routes/sites/local-sites.ts
- apps/website/src/server/inbound/admin-http/routes/skills/manage.ts
- apps/website/src/server/inbound/admin-http/routes/users/disable.ts
- apps/website/src/server/runtime/composition/modules/users.ts
- apps/website/src/assistant/demo-choices-tool.ts
- apps/website/src/assistant/render-ui-tool.ts
- apps/website/src/features/deployments/tool-registrations.ts
- apps/website/src/features/media/versioned-media-repo.ts
- apps/website/src/features/theme/sync-originals.ts
- apps/website/src/platform/site-dir/duplicate-pglite-store.ts
- apps/website/src/server/inbound/admin-http/routes/posts/template-preview-render.ts
- apps/website/src/server/inbound/admin-http/routes/users/enable.ts
- apps/website/src/server/inbound/public-http/http/site/page-head.ts
- content/agent-plugins/google-workspace/ui/picker-flow.mjs
- apps/site-chat/src/site-chat-comparison.ts
- apps/site-chat/src/vanilla-host.ts
- apps/website/src/assistant/a2ui-actions-route.ts
- apps/website/src/features/agent-plugins/memory.ts
- apps/website/src/features/custom-credentials/credential-save-tool.ts
- apps/website/src/features/database/tool-registrations.ts
- apps/website/src/features/theme/preview-refresh.ts
- apps/website/src/platform/observability/otel.ts
- apps/website/src/server/inbound/admin-http/routes/content-types/update-fields.ts
- apps/website/src/server/inbound/admin-http/routes/forms/update.ts
- apps/website/src/server/inbound/admin-http/routes/media/import-url.ts
- apps/website/src/server/inbound/public-http/routes/site/products.ts
- apps/website/src/server/inbound/public-http/routes/site/store.ts
- content/agent-plugins/cloudflare/lib/domain-inventory.mjs
- apps/website/src/features/forms/index.ts
- apps/website/src/features/media/promote-chat-attachment.ts
- apps/website/src/features/navigation/repoint-menu-refs.ts
- apps/website/src/features/post/preview-tool.ts
- apps/website/src/features/post/search.ts
- apps/website/src/features/server-logs/read-server-logs.ts
- apps/website/src/features/settings/chat-execution-write.ts
- apps/website/src/features/theme/set-active-theme-tool.ts
- apps/website/src/features/theme/theme-file-import.ts
- apps/website/src/features/theme/theme-watcher.ts
- apps/website/src/platform/site-dir/seed-site-themes.ts
- apps/website/src/server/inbound/admin-http/routes/assistant/list-models.ts
- apps/website/src/server/inbound/admin-http/routes/posts/delete.ts
- apps/website/src/server/inbound/admin-http/routes/publish-content/peers.ts
- apps/website/src/server/inbound/admin-http/routes/widgets/region-mutate-placements.ts
- apps/website/src/server/inbound/public-http/http/site/external-links.ts
- apps/website/src/server/runtime/composition/site-guide.ts
- apps/website/src/server/runtime/configuration/seed.ts
- content/agent-plugins/cloudflare/lib/assets.mjs
- apps/website/src/assistant/index.ts
- apps/website/src/contracts/core/events/memory-bus.ts
- apps/website/src/features/deployments/deploy-config.ts
- apps/website/src/features/media/verify-published-media.ts
- apps/website/src/features/newsletter/lists.ts
- apps/website/src/features/plugin-runtime/host-binding.ts
- apps/website/src/features/sites/site-preview/playwright-site-preview-capture.ts
- apps/website/src/features/taxonomy/publish-term-ids.ts
- apps/website/src/server/inbound/admin-http/routes/agent-plugins/install.ts
- apps/website/src/server/inbound/admin-http/routes/content-types/lifecycle.ts
- apps/website/src/server/inbound/admin-http/routes/content-types/register.ts
- apps/website/src/server/inbound/admin-http/routes/entries/lifecycle.ts
- apps/website/src/server/inbound/admin-http/routes/media/update.ts
- apps/website/src/server/inbound/admin-http/routes/pages/delete.ts
- apps/website/src/server/inbound/admin-http/routes/presentation/get.ts
- apps/website/src/server/inbound/admin-http/routes/system/deployment-overview.ts
- apps/website/src/server/runtime/composition/registered-sites.ts
- apps/website/src/assistant/run-page-context.ts
- apps/website/src/cli/commands/agent-plugin-tokens.ts
- apps/website/src/contracts/headless/plugin-install-source.ts
- apps/website/src/features/consent/readiness.ts
- apps/website/src/features/custom-credentials/credentialed-request.ts
- apps/website/src/features/newsletter/repo.rows.ts
- apps/website/src/features/publish-trust/keys.ts
- apps/website/src/platform/db/sqlite/import-database.ts
- apps/website/src/platform/site-dir/site-databases.ts
- apps/website/src/platform/site-dir/site-storage.ts
- apps/website/src/server/inbound/admin-http/routes/entries/create.ts
- apps/website/src/server/inbound/admin-http/routes/users/write-policy-permission.ts
- apps/website/src/assistant/tool-recovery-preset.ts
- apps/website/src/features/newsletter/campaign.ts
- apps/website/src/features/site-guide/facts.ts
- apps/website/src/server/inbound/admin-http/admin-static.ts
- apps/website/src/server/inbound/admin-http/routes/change-sets/revert.ts
- apps/website/src/server/inbound/admin-http/routes/forms/list-submissions.ts
- apps/website/src/server/inbound/admin-http/routes/media/trash.ts
- apps/website/src/server/inbound/admin-http/routes/plugins/uninstall.ts
- apps/website/src/server/inbound/admin-http/routes/publish-content/blob-put.ts
- apps/website/src/server/inbound/admin-http/routes/publish-content/blobs-probe.ts
- apps/website/src/server/inbound/admin-http/routes/trash/list.ts
- apps/website/src/server/inbound/admin-http/routes/users/delete.ts
- apps/website/src/server/inbound/admin-http/routes/users/remove-policy-permission.ts
- apps/website/src/server/inbound/public-http/http/site/worker-sandbox.ts
- apps/website/src/server/inbound/public-http/routes/members/complete-sign-in.ts
- content/agent-plugins/google-workspace/lib/picker-selection.mjs
- apps/website/src/assistant/admin-screen-link-tool.ts
- apps/website/src/cli/commands/deploy-config.ts
- apps/website/src/features/analytics/tool-registrations.ts
- apps/website/src/features/consent/validation.ts
- apps/website/src/features/deployments/deploy-ops/typed-secret-card.ts
- apps/website/src/features/media/duplicate-asset.ts
- apps/website/src/features/navigation/html-render.ts
- apps/website/src/features/navigation/trash-aware-memory-menu-repo.ts
- apps/website/src/features/post/html-plain-text.ts
- apps/website/src/features/site-backup/push-jobs.ts
- apps/website/src/features/theme/active-theme-publish-content.ts
- apps/website/src/features/theme/theme-preview-image.ts
- apps/website/src/platform/db/repos/origin-repo.ts
- apps/website/src/platform/site-dir/active-site.ts
- apps/website/src/server/inbound/admin-http/routes/agent-plugins/memory.ts
- apps/website/src/server/inbound/admin-http/routes/members/request-magic-link.ts
- apps/website/src/server/inbound/admin-http/routes/pages/create.ts
- apps/website/src/server/inbound/admin-http/routes/posts/create.ts
- apps/website/src/server/inbound/admin-http/routes/publish-content/export.ts
- content/agent-plugins/cloudflare/lib/workers-upload.mjs
- apps/desktop/src/desktop-agent-tools.ts
- apps/desktop/src/nested-sites-migration.ts
- apps/site-chat/src/highlight.ts
- apps/website/src/assistant/external-mcp-connection-source.ts
- apps/website/src/cli/commands/plugin/install.ts
- apps/website/src/features/agent-plugins/switch-on-saved-token.ts
- apps/website/src/features/change-sets/tool-registrations.ts
- apps/website/src/features/deployments/export-run.ts
- apps/website/src/features/publish-content/bundle-staging.ts
- apps/website/src/features/theme/validation/references.ts
- apps/website/src/platform/site-dir/site-key-dependent-data.ts
- apps/website/src/server/inbound/admin-http/routes/entries/update.ts
- apps/website/src/server/inbound/admin-http/routes/fs-files/custom-root.ts
- apps/website/src/server/inbound/admin-http/routes/publish-content/blob-get.ts
- apps/website/src/server/inbound/admin-http/routes/publish-content/route-helpers.ts
- apps/website/src/server/inbound/admin-http/routes/seo/put-entry.ts
- apps/website/src/server/inbound/shared/json-body-parsers.ts
- content/agent-plugins/google-workspace/lib/sheets-admin-csv.mjs
- content/agent-plugins/google-workspace/tools/sheets-admin/export-csv.mjs
- apps/desktop/scripts/smoke-bridge.ts
- apps/desktop/src/project-delete-guard.ts
- apps/website/src/cli/commands/import-site.ts
- apps/website/src/features/api-connections/form-delivery-connection.ts
- apps/website/src/features/database/repo.memory.ts
- apps/website/src/features/publish-content/content-references.ts
- apps/website/src/features/sites/site-preview/site-preview-store.ts
- apps/website/src/features/trash/adapters/marker-sql.ts
- apps/website/src/platform/db/key-dependent-data.ts
- apps/website/src/platform/server-logs/log-buffer.ts
- apps/website/src/server/inbound/admin-http/routes/assistant/detect-agents.ts
- apps/website/src/server/inbound/admin-http/routes/forms/pull-submissions.ts
- apps/website/src/server/runtime/composition/modules/publish-content.ts
- apps/website/src/server/runtime/composition/publish-content-manifest.ts
- apps/site-chat/src/loader-host.ts
- apps/website/src/assistant/assistant-vault.ts
- apps/website/src/assistant/byok-credential.ts
- apps/website/src/features/external-mcp/save-form.ts
- apps/website/src/features/publish-content/peer-url.ts
- apps/website/src/features/publish-trust/connect.ts
- apps/website/src/features/seo/cover-image.ts
- apps/website/src/features/site-backup/import-archive-reader.ts
- apps/website/src/features/skills/install-service.ts
- apps/website/src/features/taxonomy/publish-content.ts
- apps/website/src/features/trash/repo.ts
- apps/website/src/platform/db/migrations/0020_vault_api_connection_kind.ts
- apps/website/src/platform/http/test-origin-allowlist.ts
- apps/website/src/server/inbound/admin-http/routes/menus/create.ts
- apps/website/src/server/inbound/admin-http/routes/presentation/patch-active-theme.ts
- apps/website/src/server/inbound/admin-http/routes/redirects/create.ts
- apps/website/src/server/inbound/public-http/routes/members/sign-in.ts
- apps/website/src/features/agent-plugins/memory-tools.ts
- apps/website/src/features/consent/tool-registrations.ts
- apps/website/src/features/deployments/static-publish/inspection.ts
- apps/website/src/features/external-mcp/operations-tools.ts
- apps/website/src/features/plugins/migration-journal.ts
- apps/website/src/features/plugins/plugin-identity.ts
- apps/website/src/features/theme/duplicate-theme-tool.ts
- apps/website/src/features/theme/import-theme-file-tool.ts
- apps/website/src/features/workspace/tool-registrations.ts
- apps/website/src/server/inbound/admin-http/http/forms.ts
- apps/website/src/server/inbound/admin-http/routes/settings/assistant-subagents-access.ts
- apps/website/src/server/inbound/admin-http/routes/users/assign-role.ts
- apps/website/src/server/inbound/admin-http/routes/users/attach-policy.ts
- content/agent-plugins/cloudflare/lib/domain-status.mjs
- content/agent-plugins/cloudflare/lib/pages-upload.mjs
- content/agent-plugins/google-workspace/lib/surface-actions.mjs
- apps/desktop/src/admin-dev-proxy.ts
- apps/website/src/features/agent-plugins/capability-projection.ts
- apps/website/src/features/forms/submission-ip-expiry-sweep.ts
- apps/website/src/features/publish-content/gated-hooks.ts
- apps/website/src/features/settings/tool-registrations.ts
- apps/website/src/features/trash/permissions.ts
- apps/website/src/features/web/tool-registrations.ts
- apps/website/src/platform/secrets/vault-kinds.ts
- apps/website/src/platform/site-dir/product-root.ts
- apps/website/src/platform/site-dir/read-applied-schema-identity.ts
- apps/website/src/server/inbound/admin-http/routes/assistant/put-site-credential.ts
- apps/website/src/server/inbound/admin-http/routes/assistant/test-agent.ts
- apps/website/src/server/inbound/admin-http/routes/external-mcp/put.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/create-campaign.ts
- apps/website/src/server/inbound/admin-http/routes/trash/purge.ts
- apps/website/src/server/inbound/admin-http/routes/workspace/delete.ts
- apps/website/src/server/inbound/admin-http/routes/workspace/update.ts
- apps/website/src/server/inbound/public-http/routes/external-mcp/oauth-callback.ts
- apps/website/src/server/runtime/composition/modules/widgets.ts
- content/agent-plugins/google-workspace/lib/sheets-a1.mjs
- apps/website/src/features/agent-plugins/deploy-split-activation.ts
- apps/website/src/features/agent-plugins/descriptor-i18n.ts
- apps/website/src/features/api-connections/browser-binding.ts
- apps/website/src/features/members/repo.rows.ts
- apps/website/src/features/publish-content/backstop-preview.ts
- apps/website/src/features/site-inspection/section-collector.ts
- apps/website/src/features/theme/page-publication.ts
- apps/website/src/features/trash/move-to-trash.ts
- apps/website/src/platform/site-dir/local-admin-bundle.ts
- apps/website/src/server/inbound/admin-http/routes/forms/delete-submission.ts
- apps/website/src/server/inbound/admin-http/routes/forms/get-submission.ts
- apps/website/src/server/inbound/admin-http/routes/users/update-policy.ts
- apps/website/src/server/inbound/public-http/http/site/bare-page.ts
- apps/website/src/server/inbound/public-http/routes/site/analytics-ingest.ts
- apps/website/src/server/runtime/composition/modules/media.ts
- apps/website/src/server/runtime/composition/publish-content-seed-hash.ts
- content/agent-plugins/google-workspace/ui/connection-view.mjs
- apps/site-chat/src/main.tsx
- apps/website/src/assistant/run-start-context.ts
- apps/website/src/features/agent-plugins/layout.ts
- apps/website/src/features/entries/publish-content.ts
- apps/website/src/features/identity/builtin-role-grants.ts
- apps/website/src/features/site-backup/import-restore.ts
- apps/website/src/features/theme/hardcoded-link-lists.ts
- apps/website/src/features/web-screenshot/desktop-page-capture.ts
- apps/website/src/platform/db/sqlite/chat-orphan-check.ts
- apps/website/src/server/inbound/admin-http/http/widgets.ts
- apps/website/src/server/inbound/admin-http/routes/assistant/put-execution-credential.ts
- apps/website/src/server/inbound/admin-http/routes/users/delete-policy.ts
- apps/website/src/server/inbound/admin-http/routes/users/delete-role.ts
- apps/website/src/server/inbound/public-http/http/site/handlebars-render.ts
- apps/website/src/server/inbound/public-http/http/site/liquid-render.ts
- apps/website/src/server/runtime/boot/boot-readiness-warnings.ts
- apps/website/src/server/runtime/composition/installed-extension-tools.ts
- content/agent-plugins/google-workspace/lib/product-state.mjs
- apps/desktop/scripts/check-js-backslide.ts
- apps/website/src/assistant/run-active-context.ts
- apps/website/src/assistant/site/history.ts
- apps/website/src/features/agent-plugins/executable-tools/host-capabilities.ts
- apps/website/src/features/media/index.ts
- apps/website/src/features/post/duplicate-embeds.ts
- apps/website/src/features/redirects/publish-content.ts
- apps/website/src/features/theme/validation/markup.ts
- apps/website/src/platform/site-dir/duplicate-content-db.ts
- apps/website/src/platform/site-dir/sites-home.ts
- apps/website/src/server/inbound/admin-http/routes/integrations/deliveries.ts
- apps/website/src/server/inbound/admin-http/routes/integrations/pause.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/schedule-campaign.ts
- apps/website/src/server/inbound/admin-http/routes/settings/clear.ts
- apps/website/src/server/inbound/admin-http/routes/settings/set.ts
- apps/website/src/server/inbound/admin-http/routes/sites/site-previews.ts
- apps/website/src/server/inbound/admin-http/routes/users/create-policy.ts
- apps/website/src/server/inbound/admin-http/routes/users/list.ts
- apps/website/src/server/inbound/admin-http/routes/users/update-role.ts
- apps/website/src/server/inbound/admin-http/routes/widgets/region-get.ts
- apps/website/src/server/runtime/composition/open-site-content-db.ts
- content/agent-plugins/google-workspace/lib/auth.mjs
- content/agent-plugins/google-workspace/tools/sheets-admin/format.mjs
- apps/website/src/assistant/agent-daemon-port.ts
- apps/website/src/assistant/cli-probe-cache.ts
- apps/website/src/assistant/tool-catalog-query.ts
- apps/website/src/features/agent-plugins/write-note-tool.ts
- apps/website/src/features/content-types/publish-content.ts
- apps/website/src/features/custom-credentials/auth-schemes.ts
- apps/website/src/features/deployments/deploy-ops/agent-tools.ts
- apps/website/src/features/permanent-delete/tool-registrations.ts
- apps/website/src/features/publish-content/composite-blob-source.ts
- apps/website/src/features/trash/index.ts
- apps/website/src/platform/db/migrations/0006_submission_ip_retention.ts
- apps/website/src/platform/db/prepare-content-store.ts
- apps/website/src/platform/db/repos/change-set-repo.ts
- apps/website/src/server/inbound/admin-http/routes/agent-plugins/install-response.ts
- apps/website/src/server/inbound/admin-http/routes/plugins/chart-providers.ts
- apps/website/src/server/inbound/admin-http/routes/system/assistant-owner-grant.ts
- apps/website/src/server/inbound/admin-http/routes/themes/duplicate.ts
- apps/website/src/server/inbound/public-http/routes/site/forms-multipart.ts
- apps/website/src/server/runtime/composition/modules/external-mcp.ts
- apps/website/src/server/runtime/composition/site-guide-tools.ts
- apps/desktop/src/add-site-pointer.ts
- apps/website/src/assistant/external-mcp-revocation.ts
- apps/website/src/cli/commands/theme/validate.ts
- apps/website/src/features/form-destinations/key-store.ts
- apps/website/src/features/plugin-runtime/invocation-core-deps.ts
- apps/website/src/platform/db/sqlite/chat-db.ts
- apps/website/src/platform/site-dir/nested-sites-root.ts
- apps/website/src/server/inbound/admin-http/routes/comments/moderation-queue.ts
- apps/website/src/server/inbound/admin-http/routes/media/list.ts
- apps/website/src/server/inbound/admin-http/routes/members/disable.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/create-subscription.ts
- apps/website/src/server/inbound/admin-http/routes/plugins/files.ts
- apps/website/src/server/inbound/admin-http/routes/publish-content/capabilities.ts
- apps/website/src/server/inbound/admin-http/routes/settings/reset.ts
- apps/website/src/server/inbound/admin-http/routes/skills/files.ts
- apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts
- apps/website/src/assistant/component-catalog-tool.ts
- apps/website/src/assistant/subagent-settings.ts
- apps/website/src/cli/commands/storage-move.ts
- apps/website/src/features/identity/boot-session-token.ts
- apps/website/src/features/publish-content/connect-destination.ts
- apps/website/src/features/site-backup/plan-store.ts
- apps/website/src/features/skills/install-tool.ts
- apps/website/src/features/theme/index.ts
- apps/website/src/platform/db/repos/publish-history-repo.ts
- apps/website/src/server/inbound/admin-http/routes/analytics/recent-hits.ts
- apps/website/src/server/inbound/admin-http/routes/media/delete.ts
- apps/website/src/server/inbound/admin-http/routes/members/get-by-id.ts
- apps/website/src/server/inbound/admin-http/routes/system/server-logs.ts
- apps/website/src/server/runtime/services/external-mcp-admissions.ts
- content/agent-plugins/google-workspace/tools/sheets/find.mjs
- apps/website/src/assistant/component-catalog-query.ts
- apps/website/src/assistant/public-assistant-settings.ts
- apps/website/src/assistant/site/capability-registry.ts
- apps/website/src/cli/commands/theme/migrate.ts
- apps/website/src/features/consent/revisions.repo.ts
- apps/website/src/features/plugin-runtime/built-ins/word-count/index.ts
- apps/website/src/features/publish-content/content-hash.ts
- apps/website/src/features/trash/not-trashed.ts
- apps/website/src/platform/db/kernel/sqlite-only.ts
- apps/website/src/platform/db/migrations/0011_drop_empty_core_commerce_tables.ts
- apps/website/src/platform/http/client.ts
- apps/website/src/platform/markdown/frontmatter.ts
- apps/website/src/platform/site-dir/sites-project-references.ts
- apps/website/src/server/inbound/admin-http/routes/agent-plugins/files.ts
- apps/website/src/server/inbound/admin-http/routes/integrations/create.ts
- apps/website/src/server/inbound/admin-http/routes/integrations/list.ts
- apps/website/src/server/inbound/admin-http/routes/media/parse.ts
- apps/website/src/server/inbound/admin-http/routes/pages/get-by-id.ts
- apps/website/src/server/inbound/admin-http/routes/seo/get-entry-analyze.ts
- apps/website/src/server/inbound/admin-http/routes/seo/get-entry.ts
- apps/website/src/server/inbound/admin-http/routes/settings/get-raw.ts
- apps/website/src/server/inbound/admin-http/routes/themes/list.ts
- apps/website/src/server/inbound/admin-http/routes/widgets/preview.ts
- apps/website/src/server/runtime/boot/site-key-boot-notice.ts
- apps/website/src/server/runtime/composition/modules/agent-plugins.ts
- content/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/data-table.tsx
- apps/website/src/assistant/daemon-access.ts
- apps/website/src/assistant/external-mcp-roster-change.ts
- apps/website/src/features/database-transfer/destination-exchange.ts
- apps/website/src/features/deployments/publish-credentials/account-label-heal-scheduler.ts
- apps/website/src/features/fs-files/fs-files.ts
- apps/website/src/features/identity/repo.sqlite.ts
- apps/website/src/features/identity/reset-admin-password-self-verified.ts
- apps/website/src/features/media-import/fetch-image.ts
- apps/website/src/features/plugins/snapshot.ts
- apps/website/src/features/post/repo.rows.ts
- apps/website/src/features/post/search-index.postgres.ts
- apps/website/src/features/publish-content/push-plan.ts
- apps/website/src/features/settings/index.ts
- apps/website/src/features/theme/page-publish-tool.ts
- apps/website/src/features/theme/theme-roster-sync.ts
- apps/website/src/features/trash/adapters/media.ts
- apps/website/src/platform/db/repos/gated-mutation-token-repo.ts
- apps/website/src/platform/site-dir/site-running.ts
- apps/website/src/server/inbound/admin-http/range.ts
- apps/website/src/server/inbound/admin-http/routes/api-keys/deps.ts
- apps/website/src/server/inbound/admin-http/routes/database/timeline.ts
- apps/website/src/server/inbound/admin-http/routes/forms/create.ts
- apps/website/src/server/inbound/admin-http/routes/media/put-providers.ts
- apps/website/src/server/inbound/admin-http/routes/members/list.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/resend-confirmation.ts
- apps/website/src/server/inbound/admin-http/routes/redirects/hits.ts
- apps/website/src/server/inbound/admin-http/routes/redirects/import.ts
- apps/website/src/server/inbound/admin-http/routes/redirects/tombstone.ts
- apps/website/src/server/inbound/admin-http/routes/taxonomy/delete-term.ts
- apps/website/src/server/inbound/admin-http/routes/widgets/create.ts
- apps/website/src/server/runtime/boot/boot-readiness-gate.ts
- apps/website/src/server/runtime/composition/modules/core.ts
- apps/website/src/server/runtime/composition/modules/seo.ts
- apps/website/src/server/runtime/lifecycle/local-site-host.ts
- content/agent-plugins/github/source-control/github.mjs
- apps/website/src/cli/commands/theme/normalize-build.ts
- apps/website/src/contracts/headless/assistant-tool-approval-policy.ts
- apps/website/src/contracts/headless/content-chat-title.ts
- apps/website/src/features/deployments/dockerfile.ts
- apps/website/src/features/form-destinations/deliver.ts
- apps/website/src/features/publish-content/ui/publish-order.ts
- apps/website/src/features/server-logs/tool-registrations.ts
- apps/website/src/features/trash/entry-sql.ts
- apps/website/src/platform/db/migrations/0013_unify_vault_credentials.ts
- apps/website/src/platform/db/repos/outbox-repo.ts
- apps/website/src/platform/site-dir/site-root.ts
- apps/website/src/server/inbound/admin-http/http/menus.ts
- apps/website/src/server/inbound/admin-http/routes/assistant/put-settings.ts
- apps/website/src/server/inbound/admin-http/routes/external-mcp/probe.ts
- apps/website/src/server/inbound/admin-http/routes/forms/authoring.ts
- apps/website/src/server/inbound/admin-http/routes/forms/get-by-id.ts
- apps/website/src/server/inbound/admin-http/routes/integrations/delete.ts
- apps/website/src/server/inbound/admin-http/routes/media/text.ts
- apps/website/src/server/inbound/admin-http/routes/menus/get-by-id.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/remove-subscription.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/send-campaign.ts
- apps/website/src/server/inbound/admin-http/routes/posts/get-by-id.ts
- apps/website/src/server/inbound/admin-http/routes/redirects/update.ts
- apps/website/src/server/inbound/admin-http/routes/seo/put-settings.ts
- apps/website/src/server/inbound/admin-http/routes/system/assistant-daemon.ts
- apps/website/src/server/inbound/admin-http/routes/taxonomy/create-term.ts
- apps/website/src/server/inbound/admin-http/routes/taxonomy/rename-term.ts
- apps/website/src/server/inbound/admin-http/routes/users/create-role.ts
- apps/website/src/server/inbound/admin-http/routes/widgets/update.ts
- apps/website/src/server/inbound/assistant/assistant-system-overlay.ts
- apps/website/src/server/inbound/assistant/early-run-session.ts
- apps/website/src/server/runtime/composition/form-delivery.ts
- apps/website/src/server/runtime/plugin-tier2/run-in-worker.ts
- content/agent-plugins/google-workspace/lib/form-destination-settings.mjs
- apps/admin/vite.config.ts
- apps/desktop/src/sites-mcp-server.ts
- apps/website/src/contracts/core/assistant-native-fallbacks.ts
- apps/website/src/contracts/core/gated-mutations/token.ts
- apps/website/src/features/agent-plugins/admin-surfaces/surfaces.ts
- apps/website/src/features/agent-plugins/apply-connect-defaults.ts
- apps/website/src/features/analytics/config.settings.ts
- apps/website/src/features/identity/user-purge.ts
- apps/website/src/features/newsletter/errors.ts
- apps/website/src/features/newsletter/hooks.ts
- apps/website/src/features/post/featured-image.ts
- apps/website/src/features/publish-content/disconnect-tool.ts
- apps/website/src/features/taxonomy/html-render.ts
- apps/website/src/features/taxonomy/taxonomy-trash-follow-ups.ts
- apps/website/src/features/trash/adapters/post.ts
- apps/website/src/platform/db/kernel/ops.ts
- apps/website/src/platform/db/repos/entry-refs-repo.ts
- apps/website/src/platform/site-dir/local-site-child.ts
- apps/website/src/server/inbound/admin-http/routes/change-sets/get.ts
- apps/website/src/server/inbound/admin-http/routes/comments/put-settings.ts
- apps/website/src/server/inbound/admin-http/routes/menus/delete.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/create-list.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/import-subscriptions.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/send-test-campaign.ts
- apps/website/src/server/inbound/admin-http/routes/plugins/list.ts
- apps/website/src/server/inbound/admin-http/routes/redirects/get-by-id.ts
- apps/website/src/server/inbound/admin-http/routes/widgets/preview-render.ts
- apps/website/src/server/inbound/admin-http/routes/workspace/create.ts
- apps/website/src/server/inbound/shared/observability-middleware.ts
- apps/website/src/server/runtime/composition/modules/forms-admin.ts
- apps/website/src/server/runtime/plugin-tier2/worker.ts
- apps/desktop/src/desktop-chat-main.ts
- apps/website/src/contracts/core/assistant-run-events.ts
- apps/website/src/features/agent-plugins/executable-tools/approval.ts
- apps/website/src/features/agent-plugins/token-sign-in.ts
- apps/website/src/features/database-transfer/copy-engine.ts
- apps/website/src/features/form-destinations/select.ts
- apps/website/src/features/media/library-save-attachment.ts
- apps/website/src/features/post/search-index.memory.ts
- apps/website/src/features/publish-content/file-blob-index.ts
- apps/website/src/features/publish-content/seed-hash.ts
- apps/website/src/features/redirects/phase-handler.ts
- apps/website/src/features/seo/index.ts
- apps/website/src/features/theme/template-applicability.ts
- apps/website/src/platform/db/repos/oauth-pending-store.ts
- apps/website/src/platform/db/sqlite/hydrate-content-db-from-seed.ts
- apps/website/src/server/inbound/admin-http/http/newsletter.ts
- apps/website/src/server/inbound/admin-http/routes/assistant/stored-credential-probe.ts
- apps/website/src/server/inbound/admin-http/routes/media/route-guards.ts
- apps/website/src/server/inbound/admin-http/routes/recovery/deep-link.ts
- apps/website/src/server/inbound/admin-http/routes/recovery/disclosure.ts
- apps/website/src/server/inbound/admin-http/routes/redirects/list.ts
- apps/website/src/server/inbound/admin-http/routes/taxonomy/delete-taxonomy.ts
- apps/website/src/server/inbound/admin-http/routes/users/list-policy-permissions.ts
- apps/website/src/server/inbound/public-http/routes/site/chat-comparison.ts
- apps/website/src/server/inbound/public-http/routes/site/newsletter-unsubscribe.ts
- apps/website/src/server/runtime/boot/plugin-sdk-resolver.ts
- content/agent-plugins/cloudflare/lib/dns.mjs
- content/agent-plugins/fly/deploy-configs/fly.mjs
- apps/website/src/assistant/tool-audit-preset.ts
- apps/website/src/cli/commands/plugin/integrity.ts
- apps/website/src/contracts/core/commands/repo.memory.ts
- apps/website/src/contracts/core/gated-mutations/composition.ts
- apps/website/src/features/media/document-archive.ts
- apps/website/src/features/navigation/reverters.ts
- apps/website/src/features/plugins/disk-headroom.ts
- apps/website/src/features/publish-content/publish-readiness.ts
- apps/website/src/features/publish-content/ui/sections.ts
- apps/website/src/features/settings/site-title-write.ts
- apps/website/src/features/site-backup/import-verifier.ts
- apps/website/src/features/theme/active-theme.ts
- apps/website/src/features/theme/agent-tools.ts
- apps/website/src/features/web-screenshot/capture-files.ts
- apps/website/src/features/widgets/deps.ts
- apps/website/src/platform/db/migrations/0000_legacy_baseline.ts
- apps/website/src/platform/db/sqlite/reset-legacy-site-title-pin.ts
- apps/website/src/platform/site-dir/errors.ts
- apps/website/src/platform/site-dir/schema-guard.ts
- apps/website/src/server/inbound/admin-http/routes/external-mcp/tool-approvals.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/list-send-log.ts
- apps/website/src/server/inbound/admin-http/routes/taxonomy/create-taxonomy.ts
- apps/website/src/server/inbound/admin-http/routes/widgets/embed-insert.ts
- apps/website/src/server/inbound/admin-http/routes/widgets/embed-remove.ts
- apps/website/src/server/inbound/admin-http/routes/widgets/embed-reorder.ts
- apps/website/src/server/inbound/admin-http/routes/widgets/region-bind.ts
- apps/website/src/server/inbound/admin-http/routes/workspace/get.ts
- apps/website/src/server/inbound/public-http/routes/agent-plugin-surfaces/files.ts
- apps/website/src/server/runtime/composition/modules/assistant-settings.ts
- apps/website/src/server/runtime/composition/modules/content-types.ts
- apps/website/src/server/runtime/composition/modules/settings.ts
- apps/website/src/server/runtime/composition/modules/taxonomy.ts
- content/agent-plugins/render/deploy-configs/render.mjs
- apps/website/src/assistant/custom-instructions.ts
- apps/website/src/assistant/lost-frontend-binding.ts
- apps/website/src/cli/main.ts
- apps/website/src/features/agent-plugins/mcp-metadata.ts
- apps/website/src/features/api-connections/byo-client.ts
- apps/website/src/features/form-destinations/rewrite-actions.ts
- apps/website/src/features/forms/publish-content.ts
- apps/website/src/features/identity/permission-list-tool.ts
- apps/website/src/features/members/mailer.console.ts
- apps/website/src/features/plugins/migration-recovery.ts
- apps/website/src/features/taxonomy/collection-term-policy.ts
- apps/website/src/features/trash/adapters/redirect.ts
- apps/website/src/features/web-screenshot/tool-registrations.ts
- apps/website/src/features/workspace/repo.ts
- apps/website/src/platform/db/repos/analytics-sink.ts
- apps/website/src/platform/site-dir/seed-starter-title.ts
- apps/website/src/server/inbound/admin-http/routes/assistant/get-chat-attachment.ts
- apps/website/src/server/inbound/admin-http/routes/assistant/get-settings.ts
- apps/website/src/server/inbound/admin-http/routes/comments/get-settings.ts
- apps/website/src/server/inbound/admin-http/routes/media/content-type.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/cancel-campaign.ts
- apps/website/src/server/inbound/admin-http/routes/publish-content/import-errors.ts
- apps/website/src/server/inbound/admin-http/routes/recovery/status.ts
- apps/website/src/server/inbound/admin-http/routes/seo/get-settings.ts
- apps/website/src/server/inbound/admin-http/routes/system/module-status.ts
- apps/website/src/server/inbound/admin-http/routes/system/observability-status.ts
- apps/website/src/server/inbound/admin-http/routes/widgets/regions-list.ts
- apps/website/src/server/inbound/public-http/middleware/site-serving-gate.ts
- apps/website/src/server/inbound/public-http/routes/site/llms.ts
- apps/website/src/server/inbound/public-http/routes/site/newsletter-confirm.ts
- apps/website/src/server/runtime/composition/form-pull-triggers.ts
- apps/website/src/server/runtime/composition/modules/database-recovery.ts
- apps/website/src/server/runtime/composition/trash-user-tool-port.ts
- apps/website/src/server/runtime/lifecycle/readiness-state.ts
- content/agent-plugins/google-workspace/form-destinations/delivery-result.mjs
- content/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/form-pattern.tsx
- apps/website/src/assistant/assistant-vault-compat.ts
- apps/website/src/assistant/external-mcp-tool-approval-adapters.ts
- apps/website/src/assistant/installed-extension-tools.ts
- apps/website/src/assistant/persistence/store-factory.ts
- apps/website/src/features/mail-status/tool-registrations.ts
- apps/website/src/features/media/where-used.ts
- apps/website/src/features/publish-content/precheck-reasons.ts
- apps/website/src/features/theme/verify-active-theme.ts
- apps/website/src/features/tool-audit/repo.ts
- apps/website/src/features/trash/agent-tools.ts
- apps/website/src/platform/site-dir/read-template.ts
- apps/website/src/platform/site-dir/resolve-workspace.ts
- apps/website/src/server/inbound/admin-http/routes/assistant/delete-site-credential.ts
- apps/website/src/server/inbound/admin-http/routes/assistant/get-site-credential.ts
- apps/website/src/server/inbound/admin-http/routes/change-sets/list.ts
- apps/website/src/server/inbound/admin-http/routes/external-mcp/delete.ts
- apps/website/src/server/inbound/admin-http/routes/forms/list.ts
- apps/website/src/server/inbound/admin-http/routes/media/byte-size.ts
- apps/website/src/server/inbound/admin-http/routes/media/get-providers.ts
- apps/website/src/server/inbound/admin-http/routes/menus/list.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/archive-list.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/get-campaign.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/list-campaigns.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/pause-campaign.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/resume-campaign.ts
- apps/website/src/server/inbound/admin-http/routes/pages/list.ts
- apps/website/src/server/inbound/admin-http/routes/posts/list.ts
- apps/website/src/server/inbound/admin-http/routes/presentation/rescan-themes.ts
- apps/website/src/server/inbound/admin-http/routes/seo/post-sitemap-regenerate.ts
- apps/website/src/server/inbound/admin-http/routes/skills/list.ts
- apps/website/src/server/inbound/admin-http/routes/system/mail-status.ts
- apps/website/src/server/inbound/public-http/routes/ops/health.ts
- apps/website/src/server/inbound/public-http/routes/site/robots.ts
- apps/website/src/server/runtime/boot/content-db-schema-guard.ts
- apps/website/src/server/runtime/boot/dev-tls.ts
- apps/website/src/server/runtime/composition/app-permission-grants.ts
- apps/website/src/server/runtime/composition/modules/plugins.ts
- apps/website/src/server/runtime/composition/modules/redirects.ts
- content/agent-plugins/cloudflare/lib/zones.mjs
- apps/desktop/src/node-toolchain.ts
- apps/website/src/assistant/mcp-federation/presets.ts
- apps/website/src/assistant/rewrap-page-navigate-error.ts
- apps/website/src/cli/commands/theme/generate-index.ts
- apps/website/src/contracts/core/credential-copy.ts
- apps/website/src/features/content-types/repo.rows.ts
- apps/website/src/features/pages/agent-tools.ts
- apps/website/src/features/post/search-index.sqlite.ts
- apps/website/src/features/redirects/agent-tools.ts
- apps/website/src/features/settings/ui-locales-tool.ts
- apps/website/src/features/site-backup/share-preparation.ts
- apps/website/src/features/site-export/site-exporter.ts
- apps/website/src/features/theme/save-theme-original.ts
- apps/website/src/features/trash/adapters/member.ts
- apps/website/src/platform/db/journal-kernel.ts
- apps/website/src/platform/dev-supervisor/dev-restart.ts
- apps/website/src/platform/http/egress-policies.ts
- apps/website/src/server/inbound/admin-http/routes/agent-plugins/list.ts
- apps/website/src/server/inbound/admin-http/routes/commerce/status.ts
- apps/website/src/server/inbound/admin-http/routes/entries/list.ts
- apps/website/src/server/inbound/admin-http/routes/media/where-used.ts
- apps/website/src/server/inbound/admin-http/routes/users/list-policies.ts
- apps/website/src/server/inbound/admin-http/routes/users/list-roles.ts
- apps/website/src/server/inbound/admin-http/routes/widgets/get-by-id.ts
- apps/website/src/server/inbound/assistant/plugin-prompt-prefix.ts
- apps/website/src/server/inbound/public-http/http/site/site-chat-markup.ts
- apps/website/src/server/inbound/public-http/routes/oauth/public-origin.ts
- apps/website/src/server/inbound/public-http/routes/site/comments-submit.ts
- apps/website/src/server/runtime/composition/publish-trust-grants.ts
- apps/website/src/server/runtime/composition/serving-app.ts
- apps/website/src/server/runtime/composition/trash-user-admin-override.ts
- content/agent-plugins/google-workspace/lib/drive-files.mjs
- content/agent-plugins/google-workspace/tools/sheets-admin/filter-views.mjs
- content/agent-plugins/google-workspace/tools/sheets-admin/named-ranges.mjs
- content/agent-plugins/google-workspace/tools/sheets/values-by-data-filter.mjs
- content/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/auth-layout.tsx
- apps/desktop/src/desktop-agent-inventory.ts
- apps/desktop/src/move-site-home.ts
- apps/desktop/src/renderer/SitesFolders.tsx
- apps/site-chat/src/SiteAssistantHeader.hooks.ts
- apps/website/src/assistant/external-mcp-call-confirmation.ts
- apps/website/src/assistant/read-only-tool-constraint.ts
- apps/website/src/contracts/core/gated-mutations/gateway.ts
- apps/website/src/contracts/core/rate-limit/rate-limit.ts
- apps/website/src/contracts/core/scheduled-publish.ts
- apps/website/src/features/agent-plugins/admin-surfaces/handlers.ts
- apps/website/src/features/comments/ip-hash-salt.ts
- apps/website/src/features/consent/request.ts
- apps/website/src/features/deployments/static-publish/domain-publish-rows.ts
- apps/website/src/features/media/list-pending-chat-attachments.ts
- apps/website/src/features/members/repo.sqlite.ts
- apps/website/src/features/navigation/index.ts
- apps/website/src/features/newsletter/launch-gate.ts
- apps/website/src/features/newsletter/repo.sqlite.ts
- apps/website/src/features/publish-trust/provisioning.node-io.ts
- apps/website/src/features/settings/admin-interface.ts
- apps/website/src/features/settings/form-delivery-write.ts
- apps/website/src/features/skills/layout.ts
- apps/website/src/features/skills/live-registration.ts
- apps/website/src/platform/db/migrations/0002_drop_empty_legacy_chat_tables.ts
- apps/website/src/platform/db/sqlite/publish-backstop-audit.sqlite.ts
- apps/website/src/platform/secrets/vault-api-connection-meta.ts
- apps/website/src/platform/site-dir/resolve-install-dir-target.ts
- apps/website/src/server/inbound/admin-http/routes/content-types/list.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/deps.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/list-lists.ts
- apps/website/src/server/inbound/admin-http/routes/newsletter/list-subscriptions.ts
- apps/website/src/server/inbound/admin-http/routes/recovery/restore-points.ts
- apps/website/src/server/inbound/admin-http/routes/settings/get-effective.ts
- apps/website/src/server/inbound/admin-http/routes/taxonomy/list.ts
- apps/website/src/server/inbound/admin-http/routes/widgets/trash.ts
- apps/website/src/server/inbound/public-http/middleware/published-webmcp.ts
- apps/website/src/server/inbound/shared/dev-cors.ts
- apps/website/src/server/runtime/boot/bind-host.ts
- apps/website/src/server/runtime/composition/modules/members.ts
- apps/website/src/server/runtime/composition/modules/menus.ts
- apps/website/src/server/runtime/lifecycle/theme-preview-host.ts
- content/agent-plugins/google-workspace/tools/sheets/find-replace.mjs
- apps/website/src/assistant/ask-choice-ui-resource.ts
- apps/website/src/assistant/credential-chat-intake.ts
- apps/website/src/assistant/demo-image-tool.ts
- apps/website/src/assistant/persistence/agent-session-store.ts
- apps/website/src/assistant/persistence/chat-expiry-sweep.ts
- apps/website/src/assistant/persistence/tenant-scope.ts
- apps/website/src/assistant/site/public-errors.ts
- apps/website/src/cli/commands/theme/sync-originals.ts
- apps/website/src/contracts/core/plugin-hook-failed-error.ts
- apps/website/src/features/agent-plugins/connect-card-ui.ts
- apps/website/src/features/consent/config.ts
- apps/website/src/features/content-types/index.ts
- apps/website/src/features/custom-credentials/credential-recovery.ts
- apps/website/src/features/forms/form-file-storage.ts
- apps/website/src/features/media/bootstrap.ts
- apps/website/src/features/navigation/menu-trash-follow-ups.ts
- apps/website/src/features/plugin-runtime/built-ins/content-analyzer/plugin.ts
- apps/website/src/features/plugins/store/store-plugin.ts
- apps/website/src/features/publish-content/ui/phase.ts
- apps/website/src/features/site-evidence/collect-page-evidence.ts
- apps/website/src/features/taxonomy/gated-hooks.ts
- apps/website/src/features/web-screenshot/own-site-opener.ts
- apps/website/src/features/webhooks/subscriptions.ts
- apps/website/src/platform/db/kernel/drivers/sqlite.ts
- apps/website/src/server/inbound/admin-http/routes/agent-plugins/connection-sign-in.ts
- apps/website/src/server/inbound/admin-http/routes/database/schema-state.ts
- apps/website/src/server/inbound/admin-http/routes/system/assistant-subagents.ts
- apps/website/src/server/inbound/admin-http/routes/widgets/list.ts
- apps/website/src/server/inbound/admin-http/routes/workspace/list.ts
- apps/website/src/server/inbound/assistant/capability-manifest-prefix.ts
- apps/website/src/server/inbound/public-http/middleware/theme-asset-dirs.ts
- apps/website/src/server/inbound/public-http/routes/site-share.ts
- apps/website/src/server/inbound/shared/trust-proxy.ts
- apps/website/src/server/runtime/composition/site-consent.ts
- content/agent-plugins/google-workspace/tools/sheets-admin/basic-filter.mjs
- content/agent-plugins/google-workspace/ui/picker-view.mjs
- content/agent-plugins/google-workspace/ui/picker.handler.mjs
- apps/site-chat/scripts/measure-bundles.mjs
- apps/website/src/assistant/agent-session-preset.ts
- apps/website/src/assistant/permanent-delete-settings.ts
- apps/website/src/assistant/permanent-delete-tool-gate.ts
- apps/website/src/assistant/site/client-directives.ts
- apps/website/src/features/agent-plugins/retired-plugin-tool-aliases.ts
- apps/website/src/features/content-types/repo.ts
- apps/website/src/features/database-transfer/confirmation-ui.ts
- apps/website/src/features/forms/agent-tools.ts
- apps/website/src/features/fs-files/agent-tools.ts
- apps/website/src/features/media-generation/provider-credential-save.ts
- apps/website/src/features/plugins/lipay/lipay-plugin.ts
- apps/website/src/features/post/agent-tools.ts
- apps/website/src/features/post/index.ts
- apps/website/src/features/publish-content/run-repo.ts
- apps/website/src/features/seo/page-head-contributor.ts
- apps/website/src/features/theme/render-contract.ts
- apps/website/src/features/theme/static-asset-contract.ts
- apps/website/src/features/trash/adapters/comment.ts
- apps/website/src/platform/db/kernel/drivers/pglite-owner.ts
- apps/website/src/platform/db/migrations/runner.ts
- apps/website/src/platform/db/sqlite/media-repo.sqlite.ts
- apps/website/src/platform/db/watermark-kernel.ts
- apps/website/src/platform/mail/adapters/smtp.nodemailer.ts
- apps/website/src/platform/site-dir/sites-workspace-options.ts
- apps/website/src/server/inbound/admin-http/http/redirects.ts
- apps/website/src/server/inbound/admin-http/routes/api-keys/create-principal.ts
- apps/website/src/server/inbound/admin-http/routes/api-keys/issue.ts
- apps/website/src/server/inbound/admin-http/routes/assistant/delete-execution-credential.ts
- apps/website/src/server/inbound/admin-http/routes/assistant/get-execution-credential.ts
- apps/website/src/server/inbound/admin-http/routes/assistant/resolve-test-agent-outcome.ts
- apps/website/src/server/inbound/admin-http/routes/external-mcp/admissions.ts
- apps/website/src/server/inbound/admin-http/routes/external-mcp/guard.ts
- apps/website/src/server/inbound/public-http/middleware/public-page-security-headers.ts
- apps/website/src/server/inbound/public-http/middleware/site-chat-static.ts
- apps/website/src/server/inbound/public-http/routes/site/sitemap.ts
- apps/website/src/server/runtime/boot/process-error-guards.ts
- apps/website/src/server/runtime/composition/assistant-history-tools.ts
- apps/website/src/server/runtime/composition/chart-providers.ts
- apps/website/src/server/runtime/composition/modules/integrations-admin.ts
- apps/website/src/server/runtime/composition/modules/workspace.ts
- apps/website/src/server/runtime/lifecycle/await-boot-work.ts
- apps/website/src/server/runtime/lifecycle/site-preview-host.ts
- content/agent-plugins/google-workspace/form-destinations/dedupe.mjs
- content/agent-plugins/railway/deploy-configs/railway.mjs
- apps/website/src/assistant/duplicate-resource-registry.ts
- apps/website/src/assistant/execution-credential-store.memory.ts
- apps/website/src/assistant/public-assistant-availability.ts
- apps/website/src/assistant/site-credential-store.memory.ts
- apps/website/src/contracts/headless/assistant-permanent-deletes-policy.ts
- apps/website/src/features/comments/index.ts
- apps/website/src/features/database-transfer/destination-ui.ts
- apps/website/src/features/forms/form-destination-manifest.ts
- apps/website/src/features/navigation/page-target-resolver.ts
- apps/website/src/features/newsletter/data-module-manifest.ts
- apps/website/src/features/plugin-runtime/built-ins/content-analyzer/summary.ts
- apps/website/src/features/publish-content/destination-credential.ts
- apps/website/src/features/publish-content/pull.ts
- apps/website/src/features/seo/agent-tools.ts
- apps/website/src/features/site-backup/share-policy.ts
- apps/website/src/features/site-glue/manifest.ts
- apps/website/src/features/taxonomy/repo.rows.ts
- apps/website/src/platform/db/repos/external-mcp-tool-approval-repo.ts
- apps/website/src/platform/db/sqlite/database-journal-db.ts
- apps/website/src/platform/observability/index.ts
- apps/website/src/platform/site-dir/index.ts
- apps/website/src/server/inbound/admin-http/routes/api-keys/revoke.ts
- apps/website/src/server/inbound/admin-http/routes/system/tool-gaps.ts
- apps/website/src/server/inbound/assistant/run-start-decisions.ts
- apps/website/src/server/inbound/public-http/middleware/theme-preview-static.ts
- apps/website/src/server/inbound/public-http/routes/site/feed.ts
- apps/website/src/server/inbound/public-http/routes/site/forms-submit.ts
- content/agent-plugins/google-workspace/tools/sheets-admin/developer-metadata.mjs
- content/agent-plugins/google-workspace/tools/sheets-admin/open-existing.mjs
- content/agent-plugins/google-workspace/tools/sheets-admin/tab-modify.mjs
- content/agent-plugins/google-workspace/tools/sheets/create.mjs
- packages/sdk/src/index.ts
- apps/desktop/src/site-discovery-worker.ts
- apps/site-chat/src/remixicon-override.ts
- apps/site-chat/src/site-chat-i18n.ts
- apps/website/src/assistant/execution-mode-settings.ts
- apps/website/src/assistant/frontend-control-capabilities.ts
- apps/website/src/assistant/mcp-ui-sandbox-proxy-route.ts
- apps/website/src/assistant/tool-search-keywords.ts
- apps/website/src/contracts/core/chat-delete-grant.ts
- apps/website/src/contracts/core/events/jini-outbox-adapter.ts
- apps/website/src/contracts/core/events/outbox-worker.ts
- apps/website/src/contracts/core/native-approval-memory.ts
- apps/website/src/features/agent-plugins/admin-surfaces/forms.ts
- apps/website/src/features/agent-plugins/admin-surfaces/issued-sign-ins.ts
- apps/website/src/features/agent-plugins/admin-surfaces/same-origin.ts
- apps/website/src/features/agent-plugins/bundled-catalog.ts
- apps/website/src/features/analytics/jini-adapters.ts
- apps/website/src/features/content-types/tool-registrations.ts
- apps/website/src/features/custom-credentials/custom-credential-create-ui.ts
- apps/website/src/features/database-transfer/pg-store-copy.ts
- apps/website/src/features/database-transfer/postgres-ddl.ts
- apps/website/src/features/navigation/tool-registrations.ts
- apps/website/src/features/plugin-runtime/widget-partials.ts
- apps/website/src/features/post/expected-version.ts
- apps/website/src/features/presentation/repo.ts
- apps/website/src/features/settings/feature-flags.ts
- apps/website/src/features/site-export/static-security-headers.ts
- apps/website/src/features/site-guide/plugin-contributions.ts
- apps/website/src/features/site-inspection/agent-tools.ts
- apps/website/src/features/source-control/provider-kit.ts
- apps/website/src/features/taxonomy/repo.sqlite.ts
- apps/website/src/features/theme/theme-layout.ts
- apps/website/src/features/theme/validation/profiles.ts
- apps/website/src/features/web-screenshot/screenshot-image.ts
- apps/website/src/features/webhooks/agent-tools.ts
- apps/website/src/platform/db/keyset-cursor.ts
- apps/website/src/platform/db/repos/publish-content-bundle-repo.ts
- apps/website/src/platform/headless-browser/playwright-loader.ts
- apps/website/src/server/inbound/admin-http/routes/external-mcp/list.ts
- apps/website/src/server/inbound/admin-http/routes/redirects/shared.ts
- apps/website/src/server/inbound/assistant/run-log-lines.ts
- apps/website/src/server/inbound/public-http/http/shared/post.ts
- apps/website/src/server/runtime/composition/modules/assistant-execution.ts
- apps/website/src/server/runtime/composition/modules/comments-moderation.ts
- apps/website/src/server/runtime/composition/modules/trash.ts
- apps/website/src/server/runtime/lifecycle/assistant-daemon-registry.ts
- apps/desktop/src/speech/preload-speech.cts
- apps/website/src/assistant/mcp-federation/adapter.memory.ts
- apps/website/src/assistant/mcp-federation/reload-adapter.ts
- apps/website/src/assistant/mcp-injection.ts
- apps/website/src/assistant/mcp-ui-tool-calls.ts
- apps/website/src/assistant/mcp-ui.ts
- apps/website/src/assistant/persistence/conversation-tool-approval-store.ts
- apps/website/src/assistant/site/public-content.ts
- apps/website/src/assistant/tool-gaps-tool.ts
- apps/website/src/cli/commands/introspect.ts
- apps/website/src/features/agent-plugins/operator-locale.ts
- apps/website/src/features/agent-plugins/set-enabled.ts
- apps/website/src/features/custom-credentials/agent-tools.ts
- apps/website/src/features/entries/tool-registrations.ts
- apps/website/src/features/external-mcp/built-in-connections.ts
- apps/website/src/features/form-destinations/connection-port.ts
- apps/website/src/features/forms/repo.sqlite.ts
- apps/website/src/features/media/guard-rendition-repo.ts
- apps/website/src/features/media/provider-credential-store.memory.ts
- apps/website/src/features/media/public-path.ts
- apps/website/src/features/media/upload-content-type.ts
- apps/website/src/features/members/subscriber-directory.ts
- apps/website/src/features/post/slug.ts
- apps/website/src/features/publish-content/blob-staging.ts
- apps/website/src/features/publish-content/permissions.ts
- apps/website/src/features/site-inspection/deps.ts
- apps/website/src/features/theme/token-aliases.ts
- apps/website/src/features/trash/scheduler.node.ts
- apps/website/src/features/webhooks/signing.ts
- apps/website/src/features/webmcp/settings.ts
- apps/website/src/platform/db/repos/publish-content-baseline-repo.ts
- apps/website/src/platform/db/repos/publish-content-run-repo.ts
- apps/website/src/platform/db/sqlite/database-journal-schema.ts
- apps/website/src/platform/headless-browser/lazy-browser.ts
- apps/website/src/platform/site-dir/new-site-owner.ts
- apps/website/src/server/inbound/admin-http/authorize-guard.ts
- apps/website/src/server/inbound/admin-http/http/plugin-hook-error.ts
- apps/website/src/server/inbound/admin-http/routes/publish-content/apply-report.ts
- apps/website/src/server/inbound/admin-http/routes/system/assistant-permanent-deletes.ts
- apps/website/src/server/inbound/admin-http/sea-runtime.ts
- apps/website/src/server/inbound/assistant/federation-reload-route.ts
- apps/website/src/server/inbound/public-http/middleware/render-theme-override.ts
- apps/website/src/server/inbound/public-http/middleware/theme-content-security-headers.ts
- apps/website/src/server/runtime/composition/boot-data-repairs.ts
- apps/website/src/server/runtime/composition/form-delivery-deliverer.ts
- content/agent-plugins/google-workspace/tools/sheets/get.mjs
- apps/site-chat/src/site-page-actions.ts
- apps/website/src/contracts/core/entry-refs/repo.memory.ts
- apps/website/src/features/agent-plugins/identity.ts
- apps/website/src/features/api-connections/hook-http.ts
- apps/website/src/features/change-sets/agent-tools.ts
- apps/website/src/features/comments/agent-tools.ts
- apps/website/src/features/consent/host.ts
- apps/website/src/features/content-duplication/derive-available-name.ts
- apps/website/src/features/entries/index.ts
- apps/website/src/features/external-mcp/agent-tools.ts
- apps/website/src/features/form-destinations/index.ts
- apps/website/src/features/identity/repo.memory.ts
- apps/website/src/features/media/content-type-store.ts
- apps/website/src/features/members/index.ts
- apps/website/src/features/navigation/trash-menu.ts
- apps/website/src/features/plugin-runtime/declarative-enable.ts
- apps/website/src/features/plugins/restore.ts
- apps/website/src/features/publish-content/agent-tools.ts
- apps/website/src/features/publish-content/execute-import.ts
- apps/website/src/features/settings/form-destination.ts
- apps/website/src/features/taxonomy/trash-term.ts
- apps/website/src/features/tool-audit/tool-gaps.repo.ts
- apps/website/src/features/trash/repo.sqlite.ts
- apps/website/src/features/webhooks/delivery.ts
- apps/website/src/features/webhooks/keyring.memory.ts
- apps/website/src/features/widgets/agent-tools.ts
- apps/website/src/platform/db/postgres/db-ops-adapter.ts
- apps/website/src/platform/db/sqlite/db-ops.ts
- apps/website/src/platform/db/sqlite/origin-repo.sqlite.ts
- apps/website/src/platform/mail/purpose-scoped-mailer.ts
- apps/website/src/platform/routing/reserved-paths.ts
- apps/website/src/platform/site-dir/layout.ts
- apps/website/src/server/inbound/assistant/attempt-process-identity.ts
- apps/website/src/server/inbound/assistant/byok-message-attachments.ts
- apps/website/src/server/inbound/public-http/http/site/handlebars-worker.ts
- apps/website/src/server/inbound/public-http/routes/oauth/callback-page.ts
- apps/website/src/server/runtime/composition/modules/api-keys.ts
- apps/website/src/server/runtime/composition/modules/integrations.ts
- apps/website/src/server/runtime/composition/modules/skills.ts
- apps/website/src/server/runtime/composition/public-site-guide.ts
- content/agent-plugins/google-workspace/tools/sheets-admin/batch-update.mjs
- apps/admin/vitest.config.ts
- apps/desktop/src/renderer/main.tsx
- apps/website/src/assistant/batch-tool-inputs.ts
- apps/website/src/assistant/byok-provider-turn.ts
- apps/website/src/assistant/persistence/run-ledger.ts
- apps/website/src/contracts/core/agent-permission-mode.ts
- apps/website/src/contracts/core/model-facing-tool-errors.ts
- apps/website/src/contracts/headless/assistant-subagents-policy.ts
- apps/website/src/features/agent-plugins/admin-surfaces/public-config.ts
- apps/website/src/features/comments/data-module-install.ts
- apps/website/src/features/content-types/write-service.ts
- apps/website/src/features/fs-files/layout.ts
- apps/website/src/features/origin/configured-origin.ts
- apps/website/src/features/plugin-runtime/built-ins/content-analyzer/index.ts
- apps/website/src/features/plugin-runtime/install-consent.ts
- apps/website/src/features/plugin-runtime/install.ts
- apps/website/src/features/plugin-runtime/plugin-export.ts
- apps/website/src/features/post/template-options.ts
- apps/website/src/features/presentation/active-theme-id.ts
- apps/website/src/features/site-glue/attachment-points/tool-registration.ts
- apps/website/src/features/sites/index.ts
- apps/website/src/features/webhooks/http.memory.ts
- apps/website/src/platform/db/chat-kernel.ts
- apps/website/src/platform/db/drift.ts
- apps/website/src/platform/db/kernel/index.ts
- apps/website/src/platform/db/migrations/0001_post_search.ts
- apps/website/src/platform/db/migrations/0004_drop_unused_deployment_tables.ts
- apps/website/src/platform/db/migrations/0007_publish_backstop.ts
- apps/website/src/platform/db/migrations/0015_document_blob_ownership.ts
- apps/website/src/platform/db/migrations/chat/0000_chat_baseline.ts
- apps/website/src/platform/db/migrations/chat/0001_sqlite_chat_tables.ts
- apps/website/src/platform/db/migrations/chat/0002_durable_run_attempts.ts
- apps/website/src/platform/db/migrations/step.ts
- apps/website/src/platform/db/postgres/db-ops.ts
- apps/website/src/platform/db/repos/media-provider-credential-repo.ts
- apps/website/src/platform/oauth/legacy-endpoint-error.ts
- apps/website/src/platform/secrets/store-vault-guards.ts
- apps/website/src/platform/site-dir/atomic-write.ts
- apps/website/src/server/inbound/admin-http/http/integrations.ts
- apps/website/src/server/inbound/admin-http/http/users.ts
- apps/website/src/server/inbound/admin-http/routes/assistant/execution-request-fields.ts
- apps/website/src/server/inbound/admin-http/routes/media/stored-media-response.ts
- apps/website/src/server/inbound/admin-http/routes/settings/list-definitions.ts
- apps/website/src/server/runtime/boot/agent-daemon-wanted.ts
- apps/website/src/server/runtime/composition/charts-recharts-source.ts
- apps/website/src/server/runtime/composition/core-extension-claims.ts
- apps/website/src/server/runtime/composition/publish-backstop-ports.ts
- apps/website/src/server/runtime/composition/publish-content-http.ts
- apps/website/src/server/runtime/composition/store-bound-services.ts
- content/agent-plugins/google-workspace/tools/sheets/copy.mjs
- content/agent-plugins/google-workspace/tools/sheets/values-append.mjs
- content/agent-plugins/google-workspace/tools/sheets/values-batch-update.mjs
- apps/desktop/vite.config.mts
- apps/site-chat/src/site-assistant-errors.ts
- apps/site-chat/src/vanilla-entry.ts
- apps/site-chat/vite.vanilla.config.ts
- apps/website/src/assistant/mcp-federation/adapter.http.ts
- apps/website/src/contracts/core/commands/appliers.ts
- apps/website/src/contracts/core/events/outbox-drainer.ts
- apps/website/src/contracts/core/gated-mutations/watermark.ts
- apps/website/src/contracts/core/tool-failure-diagnostics.ts
- apps/website/src/features/custom-credentials/index.ts
- apps/website/src/features/database-transfer/sqlite-source.ts
- apps/website/src/features/deployments/index.ts
- apps/website/src/features/entries/repo.rows.ts
- apps/website/src/features/external-mcp/auth-mode.ts
- apps/website/src/features/identity/site-key-permission.ts
- apps/website/src/features/identity/username-change-ports.ts
- apps/website/src/features/media/purge-media.ts
- apps/website/src/features/navigation/repo.sqlite.ts
- apps/website/src/features/pages/html-document-store.sqlite.ts
- apps/website/src/features/post/repo.sqlite.ts
- apps/website/src/features/publish-content/ui/index.ts
- apps/website/src/features/settings/site-title-preservation.ts
- apps/website/src/features/site-inspection/index.ts
- apps/website/src/features/sites/agent-tools.ts
- apps/website/src/features/skills/install-adapters.ts
- apps/website/src/features/trash/remove-without-blocker.ts
- apps/website/src/platform/db/migrations/0003_coercion_json_as_json.ts
- apps/website/src/platform/db/migrations/0009_posts_author.ts
- apps/website/src/platform/db/migrations/0010_members_credentials_revoked_at.ts
- apps/website/src/platform/db/migrations/0016_publish_destination_history.ts
- apps/website/src/platform/db/migrations/0018_form_submission_remote_receipts.ts
- apps/website/src/platform/db/migrations/0019_form_delivery_plans.ts
- apps/website/src/platform/db/migrations/0021_site_consent_revisions.ts
- apps/website/src/platform/db/repos/publish-content-peer-repo.ts
- apps/website/src/platform/db/sqlite/webhook-repo.sqlite.ts
- apps/website/src/platform/html/style-values.ts
- apps/website/src/platform/routing/adapter.ts
- apps/website/src/server/error-mapping/respond.ts
- apps/website/src/server/inbound/shared/request-id.ts
- apps/website/src/server/runtime/composition/plugin-install-attachment-reader.ts
- content/agent-plugins/google-workspace/tools/sheets-admin/protected-ranges-get.mjs
- content/agent-plugins/google-workspace/tools/sheets-admin/sort.mjs
- content/agent-plugins/google-workspace/tools/sheets/copy-tab.mjs
- content/agent-plugins/google-workspace/tools/sheets/get-by-data-filter.mjs
- content/agent-plugins/google-workspace/tools/sheets/values-batch-clear.mjs
- content/agent-plugins/google-workspace/tools/sheets/values-clear.mjs
- content/agent-plugins/google-workspace/tools/sheets/values-get.mjs
- content/agent-plugins/google-workspace/tools/sheets/values-update.mjs
- apps/site-chat/src/SiteAssistantHeader.tsx
- apps/site-chat/vite-public-guard.ts
- apps/site-chat/vite.config.ts
- apps/website/src/assistant/persistence/durable-run-store.ts
- apps/website/src/cli/help.ts
- apps/website/src/cli/introspect.ts
- apps/website/src/contracts/core/credential-token.ts
- apps/website/src/contracts/core/publish-history-list-limit.ts
- apps/website/src/contracts/headless/index.ts
- apps/website/src/features/agent-plugins/bundled-contribution-sources.ts
- apps/website/src/features/custom-credentials/custom-credential-set-token-ui.ts
- apps/website/src/features/database-transfer/postgres-target.ts
- apps/website/src/features/deployments/publish-credentials/index.ts
- apps/website/src/features/deployments/static-publish/index.ts
- apps/website/src/features/media-import/agent-tools.ts
- apps/website/src/features/newsletter/agent-tools.ts
- apps/website/src/features/pages/permissions.ts
- apps/website/src/features/plugin-runtime/set-enabled-confirmation-ui.ts
- apps/website/src/features/plugins/data-modules.ts
- apps/website/src/features/publish-content/baseline-repo.ts
- apps/website/src/features/publish-content/live-site-policy.ts
- apps/website/src/features/recovery/agent-tools.ts
- apps/website/src/features/recovery/gated-hooks.ts
- apps/website/src/features/redirects/repo.sqlite.ts
- apps/website/src/features/theme/theme-id-aliases.ts
- apps/website/src/features/tool-audit/repo.sqlite.ts
- apps/website/src/features/web/web-page.ts
- apps/website/src/features/webhooks/secret-sealer.aesgcm.ts
- apps/website/src/features/widgets/repo.sqlite.ts
- apps/website/src/platform/db/kernel/checkpoint-stopped-wal.ts
- apps/website/src/platform/db/migrations/0008_posts_publish_at_featured_media.ts
- apps/website/src/platform/db/migrations/0014_media_library.ts
- apps/website/src/platform/db/migrations/0017_publish_history_kind.ts
- apps/website/src/platform/headless-browser/desktop-render.ts
- apps/website/src/platform/mail/delivery-availability.ts
- apps/website/src/server/inbound/admin-http/http/api-keys.ts
- apps/website/src/server/inbound/admin-http/http/media.ts
- apps/website/src/server/inbound/admin-http/routes/users/deps.ts
- apps/website/src/server/inbound/assistant/federation-admissions-route.ts
- apps/website/src/server/inbound/public-http/http/site/form-validation-i18n.ts
- apps/website/src/server/inbound/public-http/http/site/liquid-worker.ts
- apps/website/src/server/inbound/public-http/routes/site/chat-comparison-html.ts
- apps/website/src/server/runtime/boot/boot-listener.ts
- apps/website/src/server/runtime/boot/site-listener-origin.ts
- apps/website/src/server/runtime/composition/content-publish-ports.ts
- apps/website/src/server/runtime/composition/publish-trust-revocations.ts
- apps/website/src/server/runtime/composition/sqlite-only-services.ts
- apps/website/src/server/runtime/configuration/capability-inventory.ts
- content/agent-plugins/google-workspace/tools/account-info.mjs
- content/agent-plugins/google-workspace/tools/sheets/values-batch-get.mjs
- apps/site-chat/vite.lazy.config.ts
- apps/website/src/assistant/credential-store-fields.ts
- apps/website/src/assistant/daemon-respawn-policy.ts
- apps/website/src/assistant/durable-runs/accept.ts
- apps/website/src/assistant/persistence/chat-history-store.ts
- apps/website/src/assistant/site/mode.ts
- apps/website/src/assistant/tool-catalog-live-query.ts
- apps/website/src/contracts/core/approval-i18n.ts
- apps/website/src/contracts/core/commands/index.ts
- apps/website/src/contracts/core/events/enqueue-only-outbox.ts
- apps/website/src/contracts/core/events/index.ts
- apps/website/src/contracts/core/events/outbox-retry-policies.ts
- apps/website/src/contracts/core/index.ts
- apps/website/src/contracts/core/secret-redaction.ts
- apps/website/src/contracts/core/strict-base64.ts
- apps/website/src/contracts/headless/secret-form-cards.ts
- apps/website/src/features/agent-plugins/admin-surfaces/capabilities.ts
- apps/website/src/features/agent-plugins/uninstall-confirmation-ui.ts
- apps/website/src/features/analytics/ports.ts
- apps/website/src/features/analytics/salt.ts
- apps/website/src/features/comments/repo.sqlite.ts
- apps/website/src/features/content-types/declared-owners.ts
- apps/website/src/features/content-types/repo.sqlite.ts
- apps/website/src/features/custom-credentials/repo.memory.ts
- apps/website/src/features/database-transfer/destination-repo.ts
- apps/website/src/features/database-transfer/exclusions.ts
- apps/website/src/features/database-transfer/plan-store.ts
- apps/website/src/features/database/agent-tools.ts
- apps/website/src/features/database/gated-hooks.ts
- apps/website/src/features/deployments/agent-tools.ts
- apps/website/src/features/deployments/publish-credentials/execution-mode.ts
- apps/website/src/features/deployments/publish-credentials/repo.memory.ts
- apps/website/src/features/entries/repo.sqlite.ts
- apps/website/src/features/identity/permission-grants.ts
- apps/website/src/features/identity/user-purge.sqlite.ts
- apps/website/src/features/media-generation/agent-tools.ts
- apps/website/src/features/members/types.ts
- apps/website/src/features/pages/index.ts
- apps/website/src/features/plugin-runtime/agent-tools.ts
- apps/website/src/features/plugin-runtime/repo.sqlite.ts
- apps/website/src/features/presentation/repo.rows.ts
- apps/website/src/features/presentation/repo.sqlite.ts
- apps/website/src/features/publish-content/apply-errors.ts
- apps/website/src/features/settings/repo.sqlite.ts
- apps/website/src/features/settings/site-title-preservation.sqlite.ts
- apps/website/src/features/sites/deps.ts
- apps/website/src/features/skills/state.ts
- apps/website/src/features/source-control/repo.memory.ts
- apps/website/src/features/theme/asset-path-rewrites.ts
- apps/website/src/features/tool-audit/repo.memory.ts
- apps/website/src/features/trash/widget-removal.ts
- apps/website/src/features/web-screenshot/agent-tools.ts
- apps/website/src/features/web-screenshot/request-guard.ts
- apps/website/src/features/web/agent-tools.ts
- apps/website/src/features/webhooks/signing.keyring.ts
- apps/website/src/features/workspace/repo.sqlite.ts
- apps/website/src/platform/db/kernel/drivers/pglite-socket.ts
- apps/website/src/platform/db/kernel/drivers/pglite.ts
- apps/website/src/platform/db/kernel/drivers/postgres.ts
- apps/website/src/platform/db/migrations/0005_media_createdby.ts
- apps/website/src/platform/db/repos/custom-credential-repo.ts
- apps/website/src/platform/db/repos/execution-credential-repo.ts
- apps/website/src/platform/db/repos/site-credential-repo.ts
- apps/website/src/platform/db/repos/source-control-credential-repo.ts
- apps/website/src/platform/db/repos/vendor-credential-repo.ts
- apps/website/src/platform/db/sqlite/analytics-sink.sqlite.ts
- apps/website/src/platform/db/sqlite/change-set-repo.sqlite.ts
- apps/website/src/platform/db/sqlite/custom-credential-repo.sqlite.ts
- apps/website/src/platform/db/sqlite/entry-refs-repo.sqlite.ts
- apps/website/src/platform/db/sqlite/execution-credential-repo.sqlite.ts
- apps/website/src/platform/db/sqlite/external-mcp-repo.sqlite.ts
- apps/website/src/platform/db/sqlite/external-mcp-tool-approval-repo.sqlite.ts
- apps/website/src/platform/db/sqlite/gated-mutation-token-repo.sqlite.ts
- apps/website/src/platform/db/sqlite/media-provider-credential-repo.sqlite.ts
- apps/website/src/platform/db/sqlite/oauth-pending-store.sqlite.ts
- apps/website/src/platform/db/sqlite/outbox-repo.sqlite.ts
- apps/website/src/platform/db/sqlite/publish-content-baseline-repo.sqlite.ts
- apps/website/src/platform/db/sqlite/publish-content-bundle-repo.sqlite.ts
- apps/website/src/platform/db/sqlite/publish-content-peer-repo.sqlite.ts
- apps/website/src/platform/db/sqlite/publish-content-run-repo.sqlite.ts
- apps/website/src/platform/db/sqlite/publish-history-repo.sqlite.ts
- apps/website/src/platform/db/sqlite/site-credential-repo.sqlite.ts
- apps/website/src/platform/db/sqlite/source-control-credential-repo.sqlite.ts
- apps/website/src/platform/db/sqlite/vendor-credential-repo.sqlite.ts
- apps/website/src/platform/html/slug.ts
- apps/website/src/platform/site-dir/site-switcher-enabled.ts
- apps/website/src/server/inbound/admin-http/http/change-sets.ts
- apps/website/src/server/inbound/admin-http/http/entity-not-live.ts
- apps/website/src/server/inbound/admin-http/routes/plugins/local-installer.ts
- apps/website/src/server/inbound/admin-http/routes/publish-content/deps.ts
- apps/website/src/server/inbound/admin-http/routes/settings/preview-feed-access.ts
- apps/website/src/server/inbound/assistant/chat-attachment-directory.ts
- apps/website/src/server/inbound/public-http/http/site/handlebars-sandbox.ts
- apps/website/src/server/inbound/public-http/http/site/liquid-sandbox.ts
- apps/website/src/server/inbound/public-http/routes/external-mcp/oauth-callback-url.ts
- apps/website/src/server/inbound/public-http/routes/site/newsletter-deps.ts
- apps/website/src/server/inbound/shared/body-size-limit.ts
- apps/website/src/server/runtime/composition/admin-assistant-enabled.ts
- apps/website/src/server/runtime/composition/media-video-ports.ts
- apps/website/src/server/runtime/composition/modules/analytics.ts
- apps/website/src/server/runtime/composition/modules/forms.ts
- apps/website/src/server/runtime/plugin-tier2/typescript-bootstrap.cjs
- content/agent-plugins/cloudflare/targets/cloudflare-pages.mjs
- apps/site-chat/src/loader-entry.ts
- apps/website/src/contracts/core/runtime-mode.ts
- apps/website/src/features/comments/types.ts
- apps/website/src/features/custom-credentials/delete-request-confirmation-ui.ts
- apps/website/src/features/custom-credentials/types.ts
- apps/website/src/features/fs-files/custom-root-permission.ts
- apps/website/src/features/identity/role-manage-permission.ts
- apps/website/src/features/identity/user-purge-types.ts
- apps/website/src/features/members/agent-tools.ts
- apps/website/src/features/plugin-runtime/uninstall-confirmation-ui.ts
- apps/website/src/features/plugins/plugin-store.ts
- apps/website/src/features/presentation/index.ts
- apps/website/src/features/settings/chart-provider.ts
- apps/website/src/features/site-glue/attachment-points/events.ts
- apps/website/src/features/site-guide/index.ts
- apps/website/src/features/source-control/repository-target.ts
- apps/website/src/features/trash/db-port.sqlite.ts
- apps/website/src/features/workspace/agent-tools.ts
- apps/website/src/features/workspace/index.ts
- apps/website/src/platform/db/content-kernel.ts
- apps/website/src/platform/db/repos/form-submission-receipt-repo.ts
- apps/website/src/platform/html/escape.ts
- apps/website/src/platform/observability/config.ts
- apps/website/src/server/http/request-cookie.ts
- apps/website/src/server/inbound/admin-http/http/posts.ts
- apps/website/src/server/inbound/admin-http/http/presentation.ts
- apps/website/src/server/inbound/admin-http/routes/forms/resolve-definition.ts
- apps/website/src/server/inbound/admin-http/routes/trash/deps.ts
- apps/website/src/server/inbound/public-http/http/content/posts.ts
- apps/website/src/server/runtime/boot/site-boot-readiness.ts
- content/agent-plugins/cloudflare/targets/cloudflare-workers.mjs
- apps/website/src/assistant/credential-guidance.ts
- apps/website/src/assistant/tool-search-doc2query.ts
- apps/website/src/contracts/core/operation-lock.ts
- apps/website/src/contracts/core/public-page-security-headers.ts
- apps/website/src/contracts/core/soft-delete.ts
- apps/website/src/contracts/core/tool-metadata/assistant.ts
- apps/website/src/features/agent-plugins/activation-effects.ts
- apps/website/src/features/agent-plugins/memory-i18n.ts
- apps/website/src/features/consent/revisions.ts
- apps/website/src/features/database/db-messages.ts
- apps/website/src/features/identity/user-manage-permission.ts
- apps/website/src/features/newsletter/types.ts
- apps/website/src/features/pages/skeleton.ts
- apps/website/src/features/permanent-delete/agent-tools.ts
- apps/website/src/features/plugin-runtime/admin-response.ts
- apps/website/src/features/plugins/lipay/manifest.ts
- apps/website/src/features/plugins/store/manifest.ts
- apps/website/src/features/post/author.ts
- apps/website/src/features/redirects/index.ts
- apps/website/src/features/server-logs/agent-tools.ts
- apps/website/src/features/server-logs/process-source.ts
- apps/website/src/features/site-evidence/agent-tools.ts
- apps/website/src/features/site-export/export-failure-summary.ts
- apps/website/src/features/site-export/index.ts
- apps/website/src/features/sites/list-tool.ts
- apps/website/src/features/source-control/index.ts
- apps/website/src/features/taxonomy/agent-tools.ts
- apps/website/src/features/trash/agent-delete-policy.ts
- apps/website/src/features/trash/registry.ts
- apps/website/src/features/webhooks/index.ts
- apps/website/src/platform/mail/index.ts
- apps/website/src/server/inbound/admin-http/http/members.ts
- apps/website/src/server/inbound/admin-http/http/workspace.ts
- apps/website/src/server/inbound/admin-http/routes/members/deps.ts
- apps/website/src/server/inbound/admin-http/routes/publish-content/report-dto.ts
- apps/website/src/server/inbound/public-http/http/members.ts
- apps/website/src/server/inbound/public-http/routes/members/deps.ts
- apps/website/src/server/runtime/lifecycle/daemon-lifecycle-log.ts
- content/agent-plugins/cloudflare/form-destinations/cloudflare-d1.mjs
- apps/site-chat/src/client-directives.ts
- apps/website/src/assistant/daemon-exit-codes.ts
- apps/website/src/assistant/durable-runs/continuation.ts
- apps/website/src/assistant/durable-runs/recover.ts
- apps/website/src/assistant/site-guide-pointer.ts
- apps/website/src/assistant/site/capability-card.ts
- apps/website/src/contracts/core/admin-locales.ts
- apps/website/src/contracts/core/extension-capability-vocabulary.ts
- apps/website/src/contracts/core/path-containment.ts
- apps/website/src/contracts/core/tool-metadata/agent-plugins.ts
- apps/website/src/contracts/core/tool-metadata/analytics.ts
- apps/website/src/contracts/core/tool-metadata/change-sets.ts
- apps/website/src/contracts/core/tool-metadata/comments.ts
- apps/website/src/contracts/core/tool-metadata/consent.ts
- apps/website/src/contracts/core/tool-metadata/content-duplication.ts
- apps/website/src/contracts/core/tool-metadata/content-read.ts
- apps/website/src/contracts/core/tool-metadata/content-types.ts
- apps/website/src/contracts/core/tool-metadata/custom-credentials.ts
- apps/website/src/contracts/core/tool-metadata/database-transfer.ts
- apps/website/src/contracts/core/tool-metadata/database.ts
- apps/website/src/contracts/core/tool-metadata/deploy-ops.ts
- apps/website/src/contracts/core/tool-metadata/deployments.ts
- apps/website/src/contracts/core/tool-metadata/domain-dns.ts
- apps/website/src/contracts/core/tool-metadata/entries.ts
- apps/website/src/contracts/core/tool-metadata/external-mcp.ts
- apps/website/src/contracts/core/tool-metadata/forms.ts
- apps/website/src/contracts/core/tool-metadata/frontend-control.ts
- apps/website/src/contracts/core/tool-metadata/fs-files.ts
- apps/website/src/contracts/core/tool-metadata/identity.ts
- apps/website/src/contracts/core/tool-metadata/mail-status.ts
- apps/website/src/contracts/core/tool-metadata/media-generation.ts
- apps/website/src/contracts/core/tool-metadata/media-import.ts
- apps/website/src/contracts/core/tool-metadata/media.ts
- apps/website/src/contracts/core/tool-metadata/members.ts
- apps/website/src/contracts/core/tool-metadata/navigation.ts
- apps/website/src/contracts/core/tool-metadata/newsletter.ts
- apps/website/src/contracts/core/tool-metadata/pages.ts
- apps/website/src/contracts/core/tool-metadata/permanent-delete.ts
- apps/website/src/contracts/core/tool-metadata/plugin-runtime.ts
- apps/website/src/contracts/core/tool-metadata/post.ts
- apps/website/src/contracts/core/tool-metadata/publish-content.ts
- apps/website/src/contracts/core/tool-metadata/recovery.ts
- apps/website/src/contracts/core/tool-metadata/redirects.ts
- apps/website/src/contracts/core/tool-metadata/seo.ts
- apps/website/src/contracts/core/tool-metadata/server-logs.ts
- apps/website/src/contracts/core/tool-metadata/settings.ts
- apps/website/src/contracts/core/tool-metadata/site-backup.ts
- apps/website/src/contracts/core/tool-metadata/site-evidence.ts
- apps/website/src/contracts/core/tool-metadata/site-guide.ts
- apps/website/src/contracts/core/tool-metadata/site-inspection.ts
- apps/website/src/contracts/core/tool-metadata/sites.ts
- apps/website/src/contracts/core/tool-metadata/skills.ts
- apps/website/src/contracts/core/tool-metadata/source-control.ts
- apps/website/src/contracts/core/tool-metadata/taxonomy.ts
- apps/website/src/contracts/core/tool-metadata/theme.ts
- apps/website/src/contracts/core/tool-metadata/trash.ts
- apps/website/src/contracts/core/tool-metadata/web-screenshot.ts
- apps/website/src/contracts/core/tool-metadata/web.ts
- apps/website/src/contracts/core/tool-metadata/webhooks.ts
- apps/website/src/contracts/core/tool-metadata/widgets.ts
- apps/website/src/contracts/core/tool-metadata/workspace.ts
- apps/website/src/contracts/core/upload-limits.ts
- apps/website/src/contracts/headless/chat-attachment.ts
- apps/website/src/features/analytics/agent-tools.ts
- apps/website/src/features/analytics/index.ts
- apps/website/src/features/content-duplication/agent-tools.ts
- apps/website/src/features/content-types/repo.memory.ts
- apps/website/src/features/database-transfer/transfer-messages.ts
- apps/website/src/features/database/boot/evaluate-boot-migration-policy.ts
- apps/website/src/features/database/boot/reconcile-interrupted-migration.ts
- apps/website/src/features/database/migrate-forward/execute.ts
- apps/website/src/features/database/restore-points.ts
- apps/website/src/features/database/timeline.ts
- apps/website/src/features/deployments/capability-card.ts
- apps/website/src/features/domain-dns/index.ts
- apps/website/src/features/forms/capability-card.ts
- apps/website/src/features/forms/rate-limit-profile.ts
- apps/website/src/features/mail-status/agent-tools.ts
- apps/website/src/features/members/capability-card.ts
- apps/website/src/features/navigation/menu-html-permission.ts
- apps/website/src/features/navigation/menu-version-conflict-error.ts
- apps/website/src/features/newsletter/index.ts
- apps/website/src/features/origin/index.ts
- apps/website/src/features/plugin-runtime/capability-card.ts
- apps/website/src/features/plugin-runtime/install-source.ts
- apps/website/src/features/plugins/index.ts
- apps/website/src/features/post/capability-card.ts
- apps/website/src/features/publish-content/artifact-format.ts
- apps/website/src/features/recovery/deep-link.ts
- apps/website/src/features/recovery/disclosure.ts
- apps/website/src/features/recovery/recovery-orchestrator.ts
- apps/website/src/features/recovery/repo.memory.ts
- apps/website/src/features/recovery/restore-points.ts
- apps/website/src/features/recovery/ui/degraded-banners.ts
- apps/website/src/features/seo/capability-card.ts
- apps/website/src/features/site-guide/capability-card.ts
- apps/website/src/features/taxonomy/index.ts
- apps/website/src/features/theme/capability-card.ts
- apps/website/src/features/tool-audit/types.ts
- apps/website/src/features/trash/adapters/plugin.ts
- apps/website/src/features/trash/adapters/theme.ts
- apps/website/src/features/trash/ports.ts
- apps/website/src/features/vendor-credentials/index.ts
- apps/website/src/features/web/html-document.ts
- apps/website/src/features/web/html-to-markdown.ts
- apps/website/src/features/webmcp/webmcp-i18n.ts
- apps/website/src/features/widgets/capability-card.ts
- apps/website/src/platform/db/kernel/dialect.ts
- apps/website/src/platform/db/kernel/port.ts
- apps/website/src/platform/db/kernel/schema-shape.ts
- apps/website/src/platform/db/migrations/0000_legacy_baseline.postgres.ts
- apps/website/src/platform/db/migrations/checksums.ts
- apps/website/src/platform/dev-supervisor/index.ts
- apps/website/src/platform/http/index.ts
- apps/website/src/platform/oauth/errors.ts
- apps/website/src/platform/oauth/index.ts
- apps/website/src/platform/routing/index.ts
- apps/website/src/server/inbound/admin-http/http/plugins.ts
- apps/website/src/server/inbound/assistant/index.ts
- packages/sdk/src/hooks.ts

## Unmatched coverage records


## Coverage records excluded from denominator

- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles.css → apps/admin/src/styles.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/__tests__/app-shell-api.fixture.ts → apps/admin/src/__tests__/app-shell-api.fixture.ts
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/__tests__/fetch-query-provider.test-helper.tsx → apps/admin/src/__tests__/fetch-query-provider.test-helper.tsx
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/__tests__/fetch-query-render.tsx → apps/admin/src/__tests__/fetch-query-render.tsx
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/__tests__/unit/css-declarations.test-helper.ts → apps/admin/src/__tests__/unit/css-declarations.test-helper.ts
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/admin-themes/classic/manifest.json → apps/admin/src/admin-themes/classic/manifest.json
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/admin-themes/glass/manifest.json → apps/admin/src/admin-themes/glass/manifest.json
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/components/AssistantDock/__tests__/fixtures/gemini-position-9.ts → apps/admin/src/components/AssistantDock/__tests__/fixtures/gemini-position-9.ts
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/components/InstallTabCard/install-tab-card.css → apps/admin/src/components/InstallTabCard/install-tab-card.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/components/ServerRestartingBanner/server-restarting-banner.css → apps/admin/src/components/ServerRestartingBanner/server-restarting-banner.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/admin-themes/admin-themes.css → apps/admin/src/features/admin-themes/admin-themes.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/admin-ui/admin-ui.css → apps/admin/src/features/admin-ui/admin-ui.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/ai-assistant/ai-assistant.css → apps/admin/src/features/ai-assistant/ai-assistant.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/content-analysis/__tests__/content-analysis-fixtures.ts → apps/admin/src/features/content-analysis/__tests__/content-analysis-fixtures.ts
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/deployment/__tests__/publish-targets.fixture.ts → apps/admin/src/features/deployment/__tests__/publish-targets.fixture.ts
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/observability/recent-errors.css → apps/admin/src/features/observability/recent-errors.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/pages/__tests__/fixtures/landing-scriptblocks.html → apps/admin/src/features/pages/__tests__/fixtures/landing-scriptblocks.html
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/posts/post-url-dialog.css → apps/admin/src/features/posts/post-url-dialog.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/providers/always-allow.css → apps/admin/src/features/providers/always-allow.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/publish-content/publish-content.css → apps/admin/src/features/publish-content/publish-content.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/security/copy-keys-dialog.css → apps/admin/src/features/security/copy-keys-dialog.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/security/__tests__/access-token-providers.fixture.ts → apps/admin/src/features/security/__tests__/access-token-providers.fixture.ts
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/security/__tests__/copy-keys.fixture.ts → apps/admin/src/features/security/__tests__/copy-keys.fixture.ts
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/seo/__tests__/seo-host.harness.tsx → apps/admin/src/features/seo/__tests__/seo-host.harness.tsx
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/settings/user-interface-settings.css → apps/admin/src/features/settings/user-interface-settings.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/skills/skills.css → apps/admin/src/features/skills/skills.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/source-control/__tests__/source-control-providers.fixture.ts → apps/admin/src/features/source-control/__tests__/source-control-providers.fixture.ts
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/voice-input/push-to-talk-mic-button.css → apps/admin/src/features/voice-input/push-to-talk-mic-button.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/features/webmcp/admin-page-approval.css → apps/admin/src/features/webmcp/admin-page-approval.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/hooks/__tests__/focus-trap.test-helpers.ts → apps/admin/src/hooks/__tests__/focus-trap.test-helpers.ts
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/integrations/jini-admin/jini-media.css → apps/admin/src/integrations/jini-admin/jini-media.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/__tests__/assistant-transport.test-helpers.ts → apps/admin/src/lib/__tests__/assistant-transport.test-helpers.ts
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/__tests__/browser-stream.fakes.ts → apps/admin/src/lib/__tests__/browser-stream.fakes.ts
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/__tests__/durable-subscription.fixture.ts → apps/admin/src/lib/__tests__/durable-subscription.fixture.ts
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/__tests__/stored-credential-endpoint.test-helpers.ts → apps/admin/src/lib/__tests__/stored-credential-endpoint.test-helpers.ts
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/access-tokens.css → apps/admin/src/styles/access-tokens.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/assistant.css → apps/admin/src/styles/assistant.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/editor.css → apps/admin/src/styles/editor.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/external-mcp-tool-picker.css → apps/admin/src/styles/external-mcp-tool-picker.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/form-field-attrs.css → apps/admin/src/styles/form-field-attrs.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/form-field-settings.css → apps/admin/src/styles/form-field-settings.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/forms.css → apps/admin/src/styles/forms.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/library.css → apps/admin/src/styles/library.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/local-cli-policy.css → apps/admin/src/styles/local-cli-policy.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/media-content-editor.css → apps/admin/src/styles/media-content-editor.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/media.css → apps/admin/src/styles/media.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/native-domain-dialogs.css → apps/admin/src/styles/native-domain-dialogs.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/pages.css → apps/admin/src/styles/pages.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/playground.css → apps/admin/src/styles/playground.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/select.css → apps/admin/src/styles/select.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/seo.css → apps/admin/src/styles/seo.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/settings.css → apps/admin/src/styles/settings.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/site-key.css → apps/admin/src/styles/site-key.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/site-publish.css → apps/admin/src/styles/site-publish.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/site-transfer.css → apps/admin/src/styles/site-transfer.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/sites-settings.css → apps/admin/src/styles/sites-settings.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/source-control.css → apps/admin/src/styles/source-control.css
- /tmp/cov/admin/coverage-final.json: /home/user/Tovu/apps/admin/src/styles/theme-pages-tab.css → apps/admin/src/styles/theme-pages-tab.css
