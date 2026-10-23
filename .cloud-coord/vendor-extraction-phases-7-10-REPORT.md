Programmer(Direct): Programmer persona loaded for the returned review fixes; it fits the theme, validation and tool-discovery adapters in this task.

# Vendor extraction phases 7 and 10 — review-fix handoff

Inputs: Part B of `/Users/la/Programming/Tovu/ADS-memory/reports/2026-10-22-j2-vendor710-review.md`, the existing uncommitted extraction, and the dispatch's compatibility and excess-cut requirements. Read the required bootstrap, canonical persona, architecture sections 13/14 and governance ADR index (the latter documents are absent from this checkout and were read in the canonical Tovu workspace). GOV-ADR-001 applies by path; this work adds no gated writer. Graph MCP tools were unavailable; used direct source reads and rg. No spec/ADR ownership change was needed; the returned review supplied the concrete implementation pattern.

Existing uncommitted work was retained and corrected. No commits, installs, builds or tests were run; no background processes were launched. The two phase inventories below cover the complete current extraction, including its pre-existing edits, so each phase can be committed independently. This shared report can accompany phase 10.

## Finding → fixed

| Finding | Fixed in source |
|---|---|
| B1 | Moved both golden fixtures out of shipped `content/themes` into test fixtures and updated all five readers. No discovery exclusion added. |
| B2 | Added `fontStylesheets` to both validator key sets; validate an array of HTTPS URLs or root-relative paths, rejecting protocol-relative hosts and malformed/mixed entries. Added positive, opt-out and negative cases; documented precedence and static-tier limitations in both theme skill documents. |
| B3 | Replaced the four-list lookup and its special type with one data-declared `legacyFontStylesheetTemplate`. Every nonempty legacy family list uses the original `family=` join without encoding, sorting or deduplicating its families. Explicit `fontStylesheets: []` disables loading. Added custom/unknown, ordered/duplicate and replacement-metacharacter cases; retained stock goldens. Attribute-boundary escaping remains in place. |
| B4 | Both static-publish test imports now use the theme-owned header module and its memoized `publicPageSecurityHeaders({})` accessor. |
| B5 | Keyed preconnect groups by stylesheet origin. Local and unrelated-CDN stylesheets emit no Google preconnect using the real defaults; Google stylesheets retain both original preconnect tags, including the crossorigin font host. |
| B6 | Theme resources and headers now load through memoized accessors. Default middleware creation no longer reads resources at import; the first public request obtains them. Bundled keywords and the existing Jini enricher are also lazy. Dedicated mocked-module contracts cover no import-time reads, caching and resource failure/retry behavior. |
| B7 | Replaced the nonexistent `.ci/deploy.yml` example with `docs/index.md`. |
| B8 | Corrected all three “e.g. a registrar” descriptions and changed the image-provider target example to the neutral literal `image-provider`. |
| Excess: Fly formatting | Restored the original compact hostSignals block; only the toolKeywords addition remains. |
| Excess: duplicated plugin tests | One loop over real bundled manifests in the core contract checks both indexing paths. The five plugin files retain only their vendor discovery cases, compacted. |
| Excess: dead font lookup/test | Removed the lookup, FontResourceData type and the redundant stock legacy-list assertion loop. The generalized compatibility tests exercise the replacement behavior. |
| Excess: unused export | Removed `PUBLIC_PAGE_CSP_REPORT_ONLY`. |
| Excess: brittle count | Removed the “exactly 2 entries” assertion while preserving each owner record's path/reason checks. |

B9 was informational and left unchanged to avoid unrelated metadata baseline churn. The accepted repository-write helper rename was not expanded.

## Reuse, boundaries and documentation

- Reuse: legacy fonts and preconnects; traced theme loading → `pageShell` → `renderThemeFontLinks`, original HEAD `fontLink`, shipped resources, validation and theme skill contracts; inspected Jini CMS sources for an existing owner; extended the existing Tovu theme owner and used native URL parsing. Owner: phase 10 and B3/B5. No generic platform mechanism or dependency was introduced.
- Reuse: keyword enrichment; traced native metadata + bundled manifest selection → shared Jini `createSearchEnricher` → both indexing paths; inspected `/Users/la/Programming/Jini/packages/registry/src/tool-catalog-builder/search-enricher.ts` and the core metadata projection; retained those owners and deferred product-data loading. Owner: phase 7. Fold/strip semantics still call Jini.
- Reuse: shared headers; traced the pure contract → theme resource adapter → live middleware/static export/static publish; retained the same formatter and frozen report-only header policy, deferring only the effect boundary. Owner: phase 10.
- All new functions/helpers use `(requiredObject, optionalObject = {})`. Existing positional interfaces retain compatibility with their callers (including Express). Why-comments, including the SPEC-004 font sanitization rationale and public-policy rationale, were retained at their behavior owners.
- Documentation: new accessors/helpers are documented; renderer and manifest field docs were updated. API consumers now call `toolSearchKeywords({})`, `publicThemeResources({})` and `publicPageSecurityHeaders({})` instead of reading eager constants.
- Assessment: renderer/legacy fallback, resource/header accessors, keyword accessors/enricher, stylesheet validator and lazy middleware have no remaining source findings in this static pass. Adversarial cases include mixed valid/invalid URL arrays, duplicate family entries, explicit opt-out, unrelated/local origins and failed first resource loads. Runtime/type/coverage disposition remains INCONCLUSIVE until the deferred checks run. The second source pass checked raw URL bytes, escaping, first-use caching, policy owner/imports and complete consumer propagation.

## Phase 7 — complete files to commit separately

- `apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.tsx`
- `apps/admin/src/components/__tests__/WidgetConfigFields.unit.test.tsx`
- `apps/admin/src/components/__tests__/shared-components-i18n.unit.test.ts`
- `apps/admin/src/components/shared-components-i18n.ts`
- `apps/admin/src/features/observability/Observability.tsx`
- `apps/admin/src/features/observability/__tests__/Observability.unit.test.tsx`
- `apps/admin/src/features/observability/observability-i18n.ts`
- `apps/admin/src/features/plugins/AddAgentPluginPanel.tsx`
- `apps/admin/src/features/plugins/__tests__/surface-copy.contract.test.ts`
- `apps/admin/src/features/plugins/plugins-i18n.ts`
- `apps/admin/src/features/plugins/rules.ts`
- `apps/admin/src/features/security/AccessTokensTab.tsx`
- `apps/admin/src/features/security/security-i18n.ts`
- `apps/admin/src/features/settings/rules.ts`
- `apps/website/src/assistant/__tests__/content-read-tool.test.ts`
- `apps/website/src/assistant/__tests__/credential-setup-search.test.ts`
- `apps/website/src/assistant/__tests__/custom-credential-tools-search-discoverability.test.ts`
- `apps/website/src/assistant/__tests__/declared-tool-keywords-lazy.contract.test.ts`
- `apps/website/src/assistant/__tests__/declared-tool-keywords.contract.test.ts`
- `apps/website/src/assistant/__tests__/fixtures/credential-setup-search.json`
- `apps/website/src/assistant/__tests__/fixtures/tool-metadata.baseline.json`
- `apps/website/src/assistant/__tests__/tool-metadata-projections.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.themes-reset-copy.test.ts`
- `apps/website/src/assistant/__tests__/tool-search-keywords.content-post-copy.test.ts`
- `apps/website/src/assistant/credential-guidance.ts`
- `apps/website/src/assistant/tool-search-keywords.ts`
- `apps/website/src/contracts/core/tool-metadata/agent-plugins.ts`
- `apps/website/src/contracts/core/tool-metadata/custom-credentials.ts`
- `apps/website/src/contracts/core/tool-metadata/deploy-ops.ts`
- `apps/website/src/contracts/core/tool-metadata/external-mcp.ts`
- `apps/website/src/contracts/core/tool-metadata/media-import.ts`
- `apps/website/src/contracts/core/tool-metadata/search.ts`
- `apps/website/src/contracts/core/tool-metadata/site-backup.ts`
- `apps/website/src/contracts/core/tool-metadata/skills.ts`
- `apps/website/src/contracts/core/tool-metadata/web.ts`
- `apps/website/src/features/agent-plugins/tool-registrations.ts`
- `apps/website/src/features/custom-credentials/agent-tools.ts`
- `apps/website/src/features/custom-credentials/credential-save-tool.ts`
- `apps/website/src/features/custom-credentials/custom-credential-create-ui.ts`
- `apps/website/src/features/custom-credentials/tool-registrations.ts`
- `apps/website/src/features/deployments/deploy-ops/__tests__/search-discoverability.test.ts`
- `apps/website/src/features/deployments/deploy-ops/agent-tools.ts`
- `apps/website/src/features/deployments/deploy-targets/__tests__/deploy-vendor-baseline.json`
- `apps/website/src/features/deployments/deploy-targets/__tests__/deploy-vendor-scan.ts`
- `apps/website/src/features/deployments/deploy-targets/__tests__/no-deploy-vendor-in-core.boundary.test.ts`
- `apps/website/src/features/deployments/deploy-targets/__tests__/vendor-owner-allowlist.json`
- `apps/website/src/features/mail-status/agent-tools.ts`
- `apps/website/src/features/media/__tests__/view-video-tool.test.ts`
- `apps/website/src/features/plugin-runtime/agent-tools.ts`
- `apps/website/src/features/web/agent-tools.ts`
- `apps/website/src/server/inbound/assistant/assistant-system-overlay.ts`
- `apps/website/src/server/runtime/composition/__tests__/plugin-install-catalog.unit.test.ts`
- `content/agent-plugins/fly/__tests__/tool-discovery.test.mjs`
- `content/agent-plugins/fly/plugin.json`
- `content/agent-plugins/github/__tests__/tool-discovery.test.mjs`
- `content/agent-plugins/github/plugin.json`
- `content/agent-plugins/higgsfield-media/__tests__/tool-discovery.test.mjs`
- `content/agent-plugins/higgsfield-media/plugin.json`
- `content/agent-plugins/meilisearch/__tests__/tool-discovery.test.mjs`
- `content/agent-plugins/meilisearch/plugin.json`
- `content/agent-plugins/s3-compatible/__tests__/tool-discovery.test.mjs`
- `content/agent-plugins/s3-compatible/plugin.json`

## Phase 10 — complete files to commit separately

- `apps/website/src/contracts/core/__tests__/fixtures/public-security-headers.json`
- `apps/website/src/contracts/core/__tests__/unit/public-theme-resource-policy.contract.test.ts`
- `apps/website/src/contracts/core/public-page-security-headers.ts`
- `apps/website/src/features/deployments/static-publish/__tests__/adapter.plugin-targets.unit.test.ts`
- `apps/website/src/features/deployments/static-publish/__tests__/adapter.unit.test.ts`
- `apps/website/src/features/deployments/static-publish/adapter.ts`
- `apps/website/src/features/site-export/__tests__/static-security-headers.test.ts`
- `apps/website/src/features/site-export/static-security-headers.ts`
- `apps/website/src/features/theme/__tests__/fixtures/font-links.json`
- `apps/website/src/features/theme/__tests__/font-links.contract.test.ts`
- `apps/website/src/features/theme/__tests__/public-resources-lazy.test.ts`
- `apps/website/src/features/theme/font-links.ts`
- `apps/website/src/features/theme/public-page-security-headers.ts`
- `apps/website/src/features/theme/theme.ts`
- `apps/website/src/features/theme/validation/__tests__/manifest-v2.test.ts`
- `apps/website/src/features/theme/validation/manifest-v2.ts`
- `apps/website/src/server/inbound/public-http/http/site/__tests__/render-font-links.test.ts`
- `apps/website/src/server/inbound/public-http/http/site/render.ts`
- `apps/website/src/server/inbound/public-http/middleware/__tests__/public-page-security-headers.test.ts`
- `apps/website/src/server/inbound/public-http/middleware/public-page-security-headers.ts`
- `content/agent-plugins/tovu-theme/skills/tovu-theme/SKILL.md`
- `content/agent-plugins/tovu-theme/skills/tovu-theme/references/theme-v2-contract.md`
- `content/themes/__original-themes__/declarative/basic-declarative/theme.json`
- `content/themes/__original-themes__/static/basic-2/theme.json`
- `content/themes/__original-themes__/static/tailark-dusk/theme.json`
- `content/themes/__original-themes__/static/tailark-quartz-dark/theme.json`
- `content/themes/__original-themes__/static/tailark-quartz-libre/theme.json`
- `content/themes/__original-themes__/templated/fashion-modern/theme.json`
- `content/themes/__original-themes__/templated/storefront/theme.json`
- `content/themes/declarative/basic-declarative/theme.json`
- `content/themes/public-resources.json`
- `content/themes/static/basic-2/theme.json`
- `content/themes/static/tailark-dusk/theme.json`
- `content/themes/static/tailark-quartz-dark/theme.json`
- `content/themes/static/tailark-quartz-libre/theme.json`
- `content/themes/templated/fashion-modern/theme.json`
- `content/themes/templated/storefront/theme.json`

## Exact tests to run centrally (not executed here)


Phase 7 core and plugin suites, from repository root:

```bash
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 \
  apps/website/src/assistant/__tests__/credential-setup-search.test.ts \
  apps/website/src/assistant/__tests__/custom-credential-tools-search-discoverability.test.ts \
  apps/website/src/assistant/__tests__/declared-tool-keywords.contract.test.ts \
  apps/website/src/assistant/__tests__/declared-tool-keywords-lazy.contract.test.ts \
  apps/website/src/assistant/__tests__/content-read-tool.test.ts \
  apps/website/src/assistant/__tests__/tool-registrations.themes-reset-copy.test.ts \
  apps/website/src/assistant/__tests__/tool-search-keywords.content-post-copy.test.ts \
  apps/website/src/features/media/__tests__/view-video-tool.test.ts \
  apps/website/src/server/runtime/composition/__tests__/plugin-install-catalog.unit.test.ts \
  apps/website/src/assistant/__tests__/tool-metadata-projections.test.ts \
  apps/website/src/assistant/__tests__/tool-search-keywords.test.ts \
  apps/website/src/features/custom-credentials/__tests__/credential-save-tool.unit.test.ts \
  apps/website/src/features/deployments/deploy-ops/__tests__/search-discoverability.test.ts \
  apps/website/src/features/deployments/deploy-targets/__tests__/no-deploy-vendor-in-core.boundary.test.ts \
  apps/website/src/features/mail-status/__tests__/provider-tools.unit.test.ts \
  apps/website/src/features/skills/__tests__/integration/skill-tool-search-ranking.integration.test.ts \
  content/agent-plugins/fly/__tests__/tool-discovery.test.mjs \
  content/agent-plugins/github/__tests__/tool-discovery.test.mjs \
  content/agent-plugins/higgsfield-media/__tests__/tool-discovery.test.mjs \
  content/agent-plugins/meilisearch/__tests__/tool-discovery.test.mjs \
  content/agent-plugins/s3-compatible/__tests__/tool-discovery.test.mjs
```

Phase 7 admin suites:

```bash
npm --prefix apps/admin test -- --maxWorkers=2 \
  src/components/__tests__/WidgetConfigFields.unit.test.tsx \
  src/components/__tests__/shared-components-i18n.unit.test.ts \
  src/features/observability/__tests__/Observability.unit.test.tsx \
  src/features/observability/__tests__/observability-i18n.unit.test.ts \
  src/features/plugins/__tests__/plugins-i18n.unit.test.ts \
  src/features/plugins/__tests__/plugins-rules.unit.test.ts \
  src/features/plugins/__tests__/surface-copy.contract.test.ts \
  src/features/security/__tests__/AccessTokensTab.credential-flows.unit.test.tsx \
  src/features/security/__tests__/AccessTokensTab.unit.test.tsx \
  src/features/security/__tests__/security-i18n.unit.test.ts \
  src/features/settings/__tests__/rules.unit.test.ts \
  src/features/settings/__tests__/settings-i18n.unit.test.ts
```

Phase 10 suites, from repository root:

```bash
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 \
  apps/website/src/contracts/core/__tests__/unit/public-theme-resource-policy.contract.test.ts \
  apps/website/src/features/site-export/__tests__/static-security-headers.test.ts \
  apps/website/src/features/theme/__tests__/font-links.contract.test.ts \
  apps/website/src/features/theme/__tests__/public-resources-lazy.test.ts \
  apps/website/src/features/theme/validation/__tests__/manifest-v2.test.ts \
  apps/website/src/features/theme/validation/__tests__/validate-theme-package.test.ts \
  apps/website/src/features/theme/__tests__/sync-originals.test.ts \
  apps/website/src/features/deployments/static-publish/__tests__/adapter.unit.test.ts \
  apps/website/src/features/deployments/static-publish/__tests__/adapter.plugin-targets.unit.test.ts \
  apps/website/src/features/theme/__tests__/shipped-site-theme-drift.canary.test.ts \
  apps/website/src/features/theme/__tests__/shipped-theme-original-drift.canary.test.ts \
  apps/website/src/features/theme/__tests__/theme.test.ts \
  apps/website/src/server/inbound/public-http/http/site/__tests__/render-font-links.test.ts \
  apps/website/src/server/inbound/public-http/middleware/__tests__/public-page-security-headers.test.ts
```

Also run `npx tsc -p apps/website --noEmit --incremental false` and `node development/scripts/check-hardwiring.mjs`. Run all plugin `.mjs` suites with `node --test --test-concurrency=1` (and the existing tsx/module-mock flags where needed). Keep Vitest at `--maxWorkers=2`. Measure coverage centrally with the existing full suites; these targeted suites are not a coverage claim.


## Verification performed here

- Read-only TypeScript parser/JSON syntax lint passed on all 97 changed extraction code/data files (zero errors); no production or test module was executed.
- Read-only ESLint core complexity rule at limit 10 passed across the renderer, theme resource adapter, keyword adapter, manifest-v2 validator, public-header middleware and the three changed/new contract files selected for complexity checks (8 files, zero violations). The first lint attempts could not resolve the parser by absolute directory; resolving the installed `typescript-eslint` package through the canonical workspace's package context succeeded. No dependency was installed.
- `git diff --check` passed before handoff; no test, build, typecheck or coverage success is claimed. Dependencies are absent in this checkout, so the full typecheck is deferred to the central runner.
- No new platform owner, deferred Jini extraction, migration, commit or background process was introduced. Next assignee: Coordinator/TestRunner for the central commands, then separate phase commits.
