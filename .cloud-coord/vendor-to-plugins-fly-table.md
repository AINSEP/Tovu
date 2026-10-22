# Lane B (Fly) hit table

| file | class | moved/genericized/left (why) |
|---|---|---|
| .cloud-coord/build-comments-REPORT.md | history | LEFT (history doc) |
| .env.example | c | genericized line 63; LEFT line 29 (documents FLY_APP_NAME trust-proxy code) |
| .github/readme/tovu-capabilities.mp4 | false+ (binary) | LEFT |
| .github/readme/tovu-capabilities.webp | false+ (binary) | LEFT |
| .github/workflows/fly-deploy.yml | d | now RENDERED from plugin template (scripts/render-deploy-workflow.mjs + test); output identical except GENERATED header + build-script path |
| .github/workflows/jini-published-typecheck.yml | c | LEFT: names sibling fly-deploy.yml (real file) |
| .github/workflows/publish-image.yml | c | LEFT: names sibling fly-deploy.yml + Machines API path (real files) |
| .gitignore | host-config | genericized history note; LEFT /fly.toml ignore (generated artifact) |
| Dockerfile | c | genericized plugin/proxy examples; LEFT line 62 (names real fly-deploy.yml) |
| Dockerfile.dockerignore | host-config | LEFT: excludes generated fly.toml from build context (functional) |
| apps/admin/src/features/pages/__tests__/fixtures/landing-scriptblocks.html | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/admin/src/features/plugins/__tests__/AgentPluginRow.unit.test.tsx | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/admin/src/features/plugins/__tests__/AgentPlugins.unit.test.tsx | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/admin/src/features/plugins/__tests__/agent-plugin-rules.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/admin/src/features/plugins/__tests__/package-file-tree.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/admin/src/features/plugins/__tests__/use-agent-plugins.hooks.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/admin/src/features/plugins/rules.ts | b/UI | LEFT: 'fly' keyword in deploy search category - UI search behaviour |
| apps/admin/src/features/security/AccessTokensTab.tsx | UI copy | LEFT: 'e.g. fly.io' help text; +security-i18n.ts 20 locales - UI change |
| apps/admin/src/features/security/Security.tsx | c | GENERICIZED (comment/example) |
| apps/admin/src/features/security/SiteKeyTab.tsx | c | GENERICIZED (comment/example) |
| apps/admin/src/features/security/__tests__/AccessTokensTab.credential-flows.unit.test.tsx | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/admin/src/features/security/__tests__/rules.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/admin/src/features/security/hooks/__tests__/use-access-tokens.unit.test.tsx | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/admin/src/features/security/rules.ts | c | GENERICIZED (comment/example) |
| apps/admin/src/features/security/security-i18n.ts | UI copy | LEFT: translations of the AccessTokensTab string |
| apps/admin/src/lib/__tests__/api-system-endpoints.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/admin/src/lib/__tests__/assistant-transport.closed-stream.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/admin/src/lib/api.ts | c | GENERICIZED (comment/example) |
| apps/admin/src/panels.tsx | c | GENERICIZED (comment/example) |
| apps/desktop/RELEASE-NOTES-0.1.15.md | history | LEFT (history doc) |
| apps/desktop/RELEASE-NOTES-0.1.16.md | history | LEFT (history doc) |
| apps/desktop/RELEASING.md | docs | LEFT: names real fly-deploy.yml |
| apps/desktop/src/tovu-server.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/desktop/src/tovu-server.ts | c | LEFT: names real candidate config paths read by publish-trust |
| apps/website/src/assistant/__tests__/credential-guidance.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/assistant/__tests__/custom-credential-tools-search-discoverability.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/assistant/__tests__/fixtures/credential-setup-search.json | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/assistant/__tests__/fixtures/tool-metadata.baseline.json | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/assistant/__tests__/tool-failure-recovery.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/assistant/credential-guidance.ts | model copy | LEFT: model-facing guidance string (unit-tested) |
| apps/website/src/cli/__tests__/integration/deploy-config-command.integration.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/cli/__tests__/unit/deploy-config-command.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/cli/__tests__/unit/deploy-config-target-help.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/cli/commands/deploy-config.ts | c | GENERICIZED (comment/example) |
| apps/website/src/contracts/core/__tests__/unit/agent-permission-mode.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/contracts/core/__tests__/unit/assistant-native-fallbacks.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/contracts/core/assistant-native-fallbacks.ts | runtime | LEFT: FLY_APP_NAME/MACHINE_ID/ALLOC_ID hosted detection - runtime behaviour |
| apps/website/src/contracts/core/rate-limit/rate-limit.ts | c | GENERICIZED (comment/example) |
| apps/website/src/contracts/core/tool-metadata/agent-plugins.ts | b/search | LEFT: same |
| apps/website/src/contracts/core/tool-metadata/custom-credentials.ts | b/search | LEFT: same as deploy-ops metadata |
| apps/website/src/contracts/core/tool-metadata/deploy-ops.ts | b/search | LEFT: tool search keywords/queries; pinned by deploy-vendor-baseline.json ratchet + search-discoverability fixtures; needs plugin->keyword channel (owner Q) |
| apps/website/src/features/agent-plugins/__tests__/integration/agent-plugin-search-discovery.integration.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/agent-plugins/__tests__/integration/agent-plugin-search-tool.integration.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/agent-plugins/__tests__/integration/bundled-inactive-gating.integration.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/agent-plugins/__tests__/unit/bundled-deploy-config-fly.unit.test.ts | a | MOVED -> content/agent-plugins/fly/deploy-configs/__tests__/fly.test.mjs (11 tests) |
| apps/website/src/features/agent-plugins/__tests__/unit/bundled-deploy-config-railway.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/agent-plugins/__tests__/unit/bundled-deploy-config-render.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/agent-plugins/__tests__/unit/bundled-deploy-fly-server.unit.test.ts | a | MOVED -> content/agent-plugins/fly/__tests__/bundled-package.test.mjs (15 tests) |
| apps/website/src/features/agent-plugins/__tests__/unit/bundled-deploy-package.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-package.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-write-files.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/agent-plugins/__tests__/unit/bundled-higgsfield-media-package.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/agent-plugins/__tests__/unit/capability-projection.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/agent-plugins/__tests__/unit/deploy-split-activation.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/agent-plugins/__tests__/unit/manifest.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/agent-plugins/__tests__/unit/new-site-agent-plugin-tokens.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/agent-plugins/__tests__/unit/retire-bundled.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/agent-plugins/__tests__/unit/retired-plugin-tool-aliases.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/agent-plugins/bundled-catalog.ts | b | SEEDED_ENABLED: fly now derived from plugin.json extensions.tovu.seededEnabled; LEFT: RETIRED_* migration maps (deploy->fly successor data, all vendors) |
| apps/website/src/features/agent-plugins/deploy-split-activation.ts | b | LEFT: DEPLOY_SPLIT_HOST_PLUGIN_IDS migration list spans 8 vendors (owner Q) |
| apps/website/src/features/agent-plugins/retired-plugin-tool-aliases.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/agent-plugins/tool-registrations.ts | model copy | LEFT: model-facing tool description example ('deploying to fly.io') |
| apps/website/src/features/custom-credentials/__tests__/auth-failure-diagnostic.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/custom-credentials/__tests__/auth-schemes.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/custom-credentials/__tests__/bundled-auth-schemes.fixture.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/custom-credentials/__tests__/create-agent-tool.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/custom-credentials/__tests__/credentialed-request.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/custom-credentials/__tests__/form-save-errors.model-facing.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/custom-credentials/__tests__/list-agent-tool.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/custom-credentials/__tests__/make-request-delete-confirmation.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/custom-credentials/__tests__/tool-registrations.model-facing-errors.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/custom-credentials/__tests__/write-files-confirmation.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/custom-credentials/__tests__/write-files-network-failure.model-facing.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/custom-credentials/__tests__/write-files-validation.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/custom-credentials/auth-schemes.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/custom-credentials/credentialed-request.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/custom-credentials/custom-credential-create-ui.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/custom-credentials/types.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/custom-credentials/write-files-validation.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/deployments/__tests__/deploy-config-registry.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/__tests__/deploy-config.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/__tests__/dockerfile-browser-opt-in.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/deploy-config.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/deployments/deploy-ops/__tests__/deploy.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/deploy-ops/__tests__/fly-module.test.ts | a | MOVED -> content/agent-plugins/fly/deploy-ops/__tests__/fly-module.test.mjs (7) |
| apps/website/src/features/deployments/deploy-ops/__tests__/fly-secrets-module.test.ts | a | MOVED -> .../fly-secrets-module.test.mjs (4) |
| apps/website/src/features/deployments/deploy-ops/__tests__/github-actions-deploy.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/deploy-ops/__tests__/installed-deploy-verb.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/deploy-ops/__tests__/ops-fixture.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/deploy-ops/__tests__/registry.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/deploy-ops/__tests__/run-ops.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/deploy-ops/__tests__/search-discoverability.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/deploy-ops/__tests__/secrets-adapter-contract.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/deploy-ops/__tests__/secrets.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/deploy-ops/__tests__/tool-registrations-secret-cards.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/deploy-ops/__tests__/tool-registrations.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/deploy-ops/__tests__/tw3-L041.pins.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/deploy-ops/__tests__/typed-secret-card.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/deploy-ops/registry.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/deployments/deploy-ops/secrets.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/deployments/deploy-targets/__tests__/deploy-vendor-baseline.json | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/deploy-targets/__tests__/deploy-vendor-scan.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/deploy-targets/__tests__/registry.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/deployments/index.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/fs-files/fs-files.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/identity/__tests__/wiring.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/identity/default-credential-exposure.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/identity/wiring.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/media/hydrate-blob-store-from-seed.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/origin/__tests__/configured-origin.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/origin/__tests__/repo.contract.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/plugin-runtime/__tests__/integration/source-runtime.integration.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/plugin-runtime/__tests__/unit/install-tool.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/plugin-runtime/install.ts | runtime | LEFT: FLY_APP_NAME => hosted plugin-source policy - runtime/security |
| apps/website/src/features/publish-content/live-site-policy.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/publish-content/peer-transport.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/publish-content/peer-url.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/publish-content/peers.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/publish-content/type-registry.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/publish-trust/__tests__/grant-backstop.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/publish-trust/connect.ts | b | LEFT: DEPLOY_CONFIG_CANDIDATE_PATHS (ordered, multi-vendor; allowlisted in deploy-vendor-scan; owner Q) |
| apps/website/src/features/publish-trust/provisioning.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/seo/__tests__/sitemap.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/source-control/__tests__/provider-registry.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/features/theme/theme-id-aliases.ts | c | GENERICIZED (comment/example) |
| apps/website/src/features/webhooks/keyring.env.ts | c | GENERICIZED (comment/example) |
| apps/website/src/index.ts | c | GENERICIZED (comment/example) |
| apps/website/src/platform/db/migrations/__tests__/unify-vault-credentials-step.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/platform/db/repos/__tests__/custom-credential-repo.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/platform/db/repos/origin-repo.ts | c | GENERICIZED (comment/example) |
| apps/website/src/platform/http/egress-policies.ts | c | GENERICIZED (comment/example) |
| apps/website/src/server/__tests__/admin-local-boot-session-route.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/__tests__/integration/hydrate-blob-store-boot.integration.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/__tests__/integration/hydrate-content-db-boot.integration.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/__tests__/routes/publish-zero-setup-end-to-end.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugins-http.integration.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/inbound/admin-http/routes/plugins/__tests__/unit/install-route.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/inbound/admin-http/routes/plugins/__tests__/unit/list-route.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/inbound/admin-http/routes/plugins/__tests__/unit/local-installer.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/peer-transport-live-site.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/inbound/admin-http/routes/publish-content/destination.ts | c | GENERICIZED (comment/example) |
| apps/website/src/server/inbound/admin-http/routes/system/site-key.ts | c | GENERICIZED (comment/example) |
| apps/website/src/server/inbound/assistant/__tests__/native-fallback-wiring.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/inbound/assistant/__tests__/plugin-prompt-prefix.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/inbound/assistant/plugin-prompt-prefix.ts | c | GENERICIZED (comment/example) |
| apps/website/src/server/inbound/shared/__tests__/trust-proxy.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/inbound/shared/trust-proxy.ts | runtime | LEFT: FLY_APP_NAME => 1 trusted proxy hop - security-sensitive runtime |
| apps/website/src/server/routes/types.ts | c | GENERICIZED (comment/example) |
| apps/website/src/server/runtime/boot/__tests__/boot-readiness-gate.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/runtime/boot/__tests__/boot-readiness-warnings.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/runtime/boot/__tests__/index-bind-host-wiring.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/runtime/boot/__tests__/local-owner-signin.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/runtime/boot/boot-readiness-warnings.ts | runtime | LEFT: FLY_APP_NAME signal + log text - runtime |
| apps/website/src/server/runtime/boot/production-readiness-gate.ts | c | GENERICIZED (comment/example) |
| apps/website/src/server/runtime/boot/site-key-boot-notice.ts | c | GENERICIZED (comment/example) |
| apps/website/src/server/runtime/composition/__tests__/domain-dns-adapters.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/runtime/composition/app.ts | c | LEFT: comment describes trust-proxy code that stays |
| apps/website/src/server/runtime/composition/deps.ts | c | GENERICIZED (comment/example) |
| apps/website/src/server/runtime/composition/modules/__tests__/publish-content.destination-root.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| apps/website/src/server/runtime/composition/tool-catalog-manifest.ts | c | GENERICIZED (comment/example) |
| apps/website/src/server/runtime/lifecycle/__tests__/local-site-process.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| content/agent-plugins/github-pages/targets/github-pages.mjs | false+ | LEFT |
| content/agent-plugins/github/deploy-ops/__tests__/github-actions.test.mjs | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| content/agent-plugins/github/deploy-ops/github-actions.mjs | cross-plugin | LEFT: github plugin hardcodes DEPLOY_WORKFLOW='fly-deploy.yml' (owner Q) |
| content/agent-plugins/github/skills/github/SKILL.md | cross-plugin | LEFT: github skill names fly plugin as example |
| content/agent-plugins/render/deploy-configs/render.mjs | cross-plugin | LEFT: Render error labels mention fly.toml fields (Render lane) |
| content/brand/logo/tovu-logo.png | false+ (binary) | LEFT |
| development/HANDOFF-session-tovu-fb-2026-08-31.md | history | LEFT (history doc) |
| development/SESSION-TASKS-2026-08-31.md | history | LEFT (history doc) |
| development/assistant-prompts/capability-prompts.md | docs | LEFT: capability prompt catalog |
| development/docs/deployment/deployment-constraints.md | docs | LEFT: host comparison doc |
| development/docs/themes/compression-evidence/fuel-gradient-before-png.png | false+ (binary) | LEFT |
| development/docs/themes/compression-evidence/fuel-text-after-jpg-q85.png | false+ (binary) | LEFT |
| development/docs/themes/compression-evidence/fuel-text-before-png.png | false+ (binary) | LEFT |
| development/e2e/fixtures/video/fuselab-spatial-clinic.mp4 | false+ (binary) | LEFT |
| development/e2e/fixtures/video/fuselab-spatial-clinic.webm | false+ (binary) | LEFT |
| development/e2e/journeys/admin-visual.pins.journey.ts-snapshots/admin-agent-plugins-tab-installed-tablet-darwin.png | false+ (binary) | LEFT |
| development/e2e/journeys/admin-visual.pins.journey.ts-snapshots/admin-billing-tablet-darwin.png | false+ (binary) | LEFT |
| development/e2e/journeys/admin-visual.pins.journey.ts-snapshots/admin-integrations-tablet-darwin.png | false+ (binary) | LEFT |
| development/e2e/journeys/admin-visual.pins.journey.ts-snapshots/admin-providers-tab-webhooks-tablet-darwin.png | false+ (binary) | LEFT |
| development/e2e/journeys/admin-visual.pins.journey.ts-snapshots/admin-settings-execution-ollama-desktop-darwin.png | false+ (binary) | LEFT |
| development/e2e/journeys/mobile-visual.visual.ts-snapshots/source-control-phone-375-darwin.png | false+ (binary) | LEFT |
| development/e2e/journeys/plugins.journey.ts-snapshots/plugins-installed-chromium-darwin.png | false+ (binary) | LEFT |
| development/evals/fixtures/credential-save-baseline.json | fixture | LEFT: eval baseline snapshot |
| development/scripts/__tests__/fixtures/coverage-changed-cov3/aggregate-timeout.tap | false+ (binary) | LEFT |
| development/scripts/__tests__/seed-site.unit.test.ts | test fixture | LEFT: core test uses fly as example id / asserts generic routing (switching ids non-trivial: shared fixtures, baselines) |
| development/scripts/backfill-reset-admin-password.ts | c | GENERICIZED (comment/example) |
| development/scripts/ci-local.sh | c | LEFT: lists real workflow name |
| development/scripts/emit-dist-package-json.mjs | c | LEFT: names real fly-deploy.yml |
| development/scripts/fly-build.sh | a | MOVED -> content/agent-plugins/fly/scripts/fly-build.sh (root path fixed) |
| development/scripts/hardwiring-debt.json | config | LEFT: debt entries point at plugin file |
| development/scripts/local-dev-plugin-install.mjs | c | GENERICIZED (comment/example) |
| development/scripts/seed-site.mjs | c | GENERICIZED (comment/example) |
| development/scripts/start.mjs | c | GENERICIZED (comment/example) |
| development/todos.md | history | LEFT (history doc) |
| knip.json | config | LEFT fly.mjs entries; globs widened to nested plugin __tests__ + plugin scripts/ |
| apps/website/src/features/agent-plugins/__tests__/unit/manifest-seeded-enabled.unit.test.ts | new | added core test (vendor-neutral) |

## follow-up

Commits (branch cloud/vendor-to-plugins-2026-10-22): 92a1c67cc, a664923dd, 8d08d165f, 5310b512f, f56172730, b38f7bc18, c26f760b7.

| file | action | tests before -> after |
|---|---|---|
| custom-credentials/__tests__/{auth-failure-diagnostic,auth-schemes,create-agent-tool,credentialed-request,form-save-errors,list-agent-tool,make-request-delete-confirmation,tool-registrations.model-facing-errors,write-files-confirmation,write-files-network-failure,write-files-validation} | SWITCHED to neutral `fixtures/example-host` plugin (ExampleV1, example-host.io hosts); bundled-auth-schemes.fixture.ts -> fixture-auth-schemes.fixture.ts; Fly.io incident why-comments kept; retired `tovu-deploy-fly` id kept | 27/21/34/63/7/14/23/13/11/50/5 unchanged |
| assistant/__tests__/read-only-tool-constraint.composition.test.ts | fixture import renamed | 9 -> 9 |
| content/agent-plugins/fly/__tests__/credential-schemes.test.mjs | NEW (moved Fly rule assertion: fly-io/FlyV1 + FlyV1 detect) | +2 |
| origin/configured-origin, origin/repo.contract, seo/sitemap, source-control/provider-registry, identity/wiring | SWITCHED fly.dev/fly.toml/fly-deploy.yml fixtures | 28/31/2/13/19 unchanged |
| server agent-plugins-http.integration, composition/domain-dns-adapters | SWITCHED | 7/54 unchanged |
| agent-plugins search-tool.integration, capability-projection, manifest; assistant tool-failure-recovery | SWITCHED | 16(1 skip)/12/41/29 unchanged |
| admin plugins (AgentPluginRow, AgentPlugins, agent-plugin-rules, use-agent-plugins, package-file-tree), security (AccessTokensTab.credential-flows, rules, use-access-tokens), lib (api-system-endpoints, assistant-transport.closed-stream) | SWITCHED (vitest) | 426 -> 426; package-file-tree 31 -> 31 |
| agent-plugins/unit/bundled-deploy-package | MOVED 4 Fly-package tests -> content/agent-plugins/fly/__tests__/package-manifest.test.mjs; deploy->fly seeding tests stay | 16 -> 12 (+4 in plugin) |
| cli unit/integration deploy-config-command | SWITCHED to fixture generator `cli/__tests__/fixtures/deploy-config-plugins/example-host` via TOVU_BUNDLED_AGENT_PLUGINS_DIR; Fly CLI assertions copied to content/agent-plugins/fly/deploy-configs/__tests__/cli.test.mjs; knip entry added | 6->6, 7->7 (+3 in plugin) |
| LEFT rule 3 (FLY_* env reads) | trust-proxy, boot-readiness-gate/-warnings, local-owner-signin, index-bind-host-wiring, local-site-process, admin-local-boot-session-route, plugin-runtime source-runtime + install-tool, plugins install/list-route + local-installer, native-fallback-wiring, contracts agent-permission-mode + assistant-native-fallbacks | - |
| LEFT rule 3 (DEPLOY_CONFIG_CANDIDATE_PATHS fly.toml/fly-deploy.yml) | publish-zero-setup-end-to-end, publish-content.destination-root, publish-trust/grant-backstop | - |
| LEFT retired/migration maps | retire-bundled, retired-plugin-tool-aliases, deploy-split-activation, new-site-agent-plugin-tokens, plugin-prompt-prefix (deploy->fly B7), deploy-targets/registry, deploy-config-registry + cli target-help (retired id + bundled union) | - |
| LEFT catalog iteration / tool-metadata keywords | bundled-inactive-gating, agent-plugin-search-discovery, custom-credential-tools-search-discoverability, deploy-ops/search-discoverability, deploy-vendor-scan/baseline, cli '--target must be one of: fly, railway, render' | - |
| LEFT deploy-ops/__tests__ (deploy, run-ops, secrets, secrets-adapter-contract, tool-registrations(+secret-cards), typed-secret-card, tw3-L041.pins, registry, installed-deploy-verb, github-actions-deploy, ops-fixture) | generic runners exercised through the REAL bundled Fly adapter (assertions are Fly module output); needs a neutral fixture deploy-ops plugin — not done (time) | - |
| LEFT other-vendor/real-file | bundled-github-package/-write-files, higgsfield, render/railway config (other lane); dockerfile-browser-opt-in (reads real workflow); comments only: hydrate-*-boot, peer-transport-live-site, desktop tovu-server, seed-site, deploy-config.unit, use-access-tokens L50 | - |
| LEFT Postgres/pglite (not run) | platform/db/migrations unify-vault-credentials-step, platform/db/repos custom-credential-repo | - |
| LEFT UI copy fixture | admin pages landing-scriptblocks.html | - |
