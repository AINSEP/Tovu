PLAN r62t-plan-deploy PARTIAL: 8 MOVE / 29 STAYS-HOST / 15 sheets

This covers 105 source files at Tovu `caa3ac7811f3` and Jini `dc2349f5194b`. The eight MOVE rows comprise seven extractions and one consolidation into an existing core contract. Sixty-eight rows are **NOT-PLANNED**, including **OPUS-CLOUD** holds. The destinations on hold rows are reservations, not instructions to create files. No files were changed and no tests, builds, installs, or type-checks ran. `AI-Dev-Shop/AGENTS.md` and the architecture section files were absent in this dispatch clone.

The main correction to the planner is that several files it calls blocked moves are already host bindings over landed Jini implementations. In particular, **do not copy Tovu's deploy-config files over Jini's**. Also, no route registrar is a source row in these seven areas. The publish-destination routes already use Jini specs mounted in Tovu. Leave those routes and their authorization wiring alone.

## File dispositions

Source paths are relative to the prefix in each heading. Destination paths are relative to the Jini `packages/` directory. **OPUS** means **OPUS-CLOUD / NOT-PLANNED**. An OPUS note on a STAYS-HOST row means leave even the host binding untouched.

### deployments — `apps/website/src/features/deployments/`

| File | Disposition | Jini destination | Blocking dependency or host responsibility |
|---|---|---|---|
| `capability-card.ts` | STAYS-HOST | — | Tovu guide copy, permissions and admin links. |
| `deploy-config-registry.ts` | STAYS-HOST | — | Binds deployed Jini registry to Tovu's bundled sources, trusted loader and warnings. Planner destination already occupied. |
| `deploy-config.ts` | STAYS-HOST | — | Binds Jini descriptor/notes to Tovu CLI label, overlays, runtime env, health route and secret declarations. Planner destination already occupied. OPUS. |
| `deploy-ops/agent-tools.ts` | OPUS | `devops/src/deploy/site/deploy-ops/agent-tools.ts` | Host discovery, product copy, credential authorization and deletion-tool metadata. Catalog path is observable. |
| `deploy-ops/registry.ts` | OPUS | `devops/src/deploy/site/deploy-ops/registry.ts` | Trusted contribution activation, site-dir and redaction. |
| `deploy-ops/run-ops.ts` | OPUS | `devops/src/deploy/site/deploy-ops/run-ops.ts` | Guarded HTTP, credential resolution and runtime binding. Inspect landed `deploy/ops-runner.ts` first. |
| `deploy-ops/secrets.ts` | OPUS | `devops/src/deploy/site/deploy-ops/secrets.ts` | Secret-operation surface depends on `run-ops`; do not recreate a facade. |
| `deploy-ops/tool-registrations.ts` | OPUS | `devops/src/deploy/site/deploy-ops/tool-registrations.ts` | Permissions, deletion confirmation and secret card; existing Jini builder is not the host registration. |
| `deploy-ops/typed-secret-card.ts` | OPUS | `devops/src/deploy/site/deploy-ops/typed-secret-card.ts` | Secure UI, exchange and credential copy. |
| `deploy-targets/host-kit.ts` | STAYS-HOST | — | Egress validation, DNS lookup, fetch tracing and SigV4 implementation are host-supplied. OPUS. |
| `deploy-targets/registry.ts` | OPUS | `devops/src/deploy/site/deploy-targets/registry.ts` | Trusted executable plugin lifecycle, installed versus bundled inventory. |
| `export-run-binding.ts` | STAYS-HOST | — | One host runner shared by admin and tool callers. Generic runner already in Jini. |
| `index.ts` | STAYS-HOST | — | Existing entry exposes actual host config and registry bindings. No new barrel or forwarding file. |
| `publish-agent-tools.ts` | OPUS | `devops/src/deploy/site/publish-agent-tools.ts` | Credentials, permissions, exchange handlers, CMS operations and product copy. |
| `publish-credentials/compatibility-port.ts` | OPUS | `devops/src/deploy/site/publish-credentials/compatibility-port.ts` | Contract follows credential-store and verification ownership. |
| `publish-credentials/index.ts` | OPUS | `devops/src/deploy/site/publish-credentials/index.ts` | Credential store surface. Repoint directly once the cloud split lands. |
| `publish-credentials/store.ts` | OPUS | `devops/src/deploy/site/publish-credentials/store.ts` | Vault kinds, sealing, credential store and DB adapters. |
| `publish-tool-deps.ts` | OPUS | `devops/src/deploy/site/publish-tool-deps.ts` | Consent, credentials, plugin registry and export report seams. Do not lift the host bag wholesale. |
| `static-publish/adapter.ts` | OPUS | `devops/src/deploy/site/static-publish/adapter.ts` | Secret resolution, public headers, export output, host kit and diagnostics. |
| `static-publish/credentials.ts` | OPUS | `devops/src/deploy/site/static-publish/credentials.ts` | Saved-key resolution and safe projections. |
| `static-publish/domain-publish-tool.ts` | OPUS | `devops/src/deploy/site/static-publish/domain-publish-tool.ts` | Plan/confirm/execute, permission and token redemption. |
| `static-publish/index.ts` | OPUS | `devops/src/deploy/site/static-publish/index.ts` | Mixed credential and publish surface. Do not transplant it as a forwarding shell. |
| `static-publish/inspection.ts` | OPUS | `devops/src/deploy/site/static-publish/inspection.ts` | Host kit, credential projection/redaction and planning. |
| `static-publish/publish-consent.ts` | STAYS-HOST | — | Tovu's fail-closed consent binding and refusal copy. OPUS. |
| `static-publish/publish-history.ts` | OPUS | `devops/src/deploy/site/static-publish/publish-history.ts` | History limit policy, public config allowlist and peer projections. |
| `static-publish/publish-run.ts` | OPUS | `devops/src/deploy/site/static-publish/publish-run.ts` | Redaction and publish effect lifecycle. |
| `static-publish/verify.ts` | OPUS | `devops/src/deploy/site/static-publish/verify.ts` | Credential verification, copy and cache. |
| `tool-registrations.ts` | OPUS | `devops/src/deploy/site/tool-registrations.ts` | Mixed export, deploy, credential and write tool registrations. Split read-only registrations before dispatching them to Sol. |

The landed `DeployConfigRegistryPorts<Plugin, Definition>` is the seam. Its required fields are `filename`, `contributionSources({ sourceRoot, filename })`, `defineExecutableContribution(spec, { onReadError })`, `loadFromSource({ plugin, definition })`, and `warn`. Tovu supplies these in `deploy-config-registry.ts`. Likewise, Jini's `buildDeploymentDescriptor({ repoRoot, commandLabel, healthCheck, secrets }, _optional)` already takes the product inputs from `deploy-config.ts`. Neither binding is a Jini prerequisite. Do not instantiate another export runner in either repo. The composition and deployment tools must continue to see the same host instance. **No executable deployments sheet.**

### adm-deployment — `apps/admin/src/features/deployment/`

The planner's `admin/src/deployment/` destination is wrong for domain UI. Use the existing DevOps browser entry and its `deploy/react/` folder. Authenticated request composition stays in Tovu.

| File | Disposition | Jini destination | Blocking dependency or host responsibility |
|---|---|---|---|
| `Deployment.tsx` | NOT-PLANNED | `devops/src/deploy/react/Deployment.tsx` | Tab composition, navigation, host copy and remaining tabs. D1.T changes only its History mount. |
| `DockerfileTab.tsx` | OPUS | `devops/src/deploy/react/DockerfileTab.tsx` | Writable Dockerfile flow and host confirmation/error handling. |
| `HistoryTab.tsx` | MOVE | `devops/src/deploy/react/HistoryTab.tsx` | Required locale hook, translator, icon, route and agent attributes. D1. |
| `OverviewTab.tsx` | NOT-PLANNED | `devops/src/deploy/react/OverviewTab.tsx` | Overview hook, visuals, capability rules and readiness copy. D2.T repoints the wired hook only. |
| `StaticSiteTab.hooks.ts` | NOT-PLANNED | `devops/src/deploy/react/StaticSiteTab.hooks.ts` | Host translator and mixed export/publish controllers. |
| `StaticSiteTab.tsx` | OPUS | `devops/src/deploy/react/StaticSiteTab.tsx` | Export, publish, credentials and kit parity; not a single verbatim move. |
| `api/publish-destination.types.ts` | NOT-PLANNED | `core/src/contracts/site/deploy-publish-destination.ts` | Shared wire union needs parity with server projections; product peer discriminant is not the CMS destination DTO. |
| `deployment-host-i18n.ts` | STAYS-HOST | — | Tovu dictionary layered over existing Jini translator. |
| `deployment-host-ports.ts` | STAYS-HOST | — | Authenticated `request`, workspace and API-client binding. OPUS. |
| `deployment-visuals.tsx` | NOT-PLANNED | `devops/src/deploy/react/deployment-visuals.tsx` | Kit `Icon` and capability rules; D1 injects the existing icon. |
| `hooks/deployment-overview-dependencies.hooks.ts` | STAYS-HOST | — | Real API and test fake binding. |
| `hooks/dockerfile-source-dependencies.hooks.ts` | STAYS-HOST | — | Host API, ETag semantics and test fake. OPUS. |
| `hooks/publish-credentials-dependencies.hooks.ts` | STAYS-HOST | — | Host security client and test fake. OPUS. |
| `hooks/static-export-dependencies.hooks.ts` | STAYS-HOST | — | Tovu import/export client binding. |
| `hooks/static-publish-dependencies.hooks.ts` | STAYS-HOST | — | Authenticated deployment client and test fake. OPUS. |
| `hooks/static-export-port.hooks.ts` | NOT-PLANNED | `core/src/contracts/site/static-export-admin.ts` | Confirm neutral data types and all consumers before lifting the port. |
| `hooks/static-publish-port.hooks.ts` | OPUS | `core/src/contracts/site/static-publish-admin.ts` | Credential-bearing API boundary needs wire parity first. |
| `hooks/use-deployment-overview.hooks.ts` | MOVE | `devops/src/deploy/react/use-deployment-overview.hooks.ts` | Generic snapshot, K2 fetch query, host formatter. D2. |
| `hooks/use-dockerfile-source.hooks.ts` | OPUS | `devops/src/deploy/react/use-dockerfile-source.hooks.ts` | Save, ETag and error behavior. |
| `hooks/use-publish-credentials.hooks.ts` | OPUS | `devops/src/deploy/react/use-publish-credentials.hooks.ts` | Secure form and credential copy. |
| `hooks/use-static-export.hooks.ts` | NOT-PLANNED | `devops/src/deploy/react/use-static-export.hooks.ts` | Export port and host dependencies; characterize poll and selection before moving. |
| `hooks/use-static-publish.hooks.ts` | OPUS | `devops/src/deploy/react/use-static-publish.hooks.ts` | Redaction, credentials and publish state. |
| `index.ts` | NOT-PLANNED | — | Mixed surface. Repoint direct imports as remaining leaves move. |
| `rules.ts` | OPUS | `devops/src/deploy/react/rules.ts` for neutral pieces | Mixed capability labels, readiness policy and credential-form rules. No whole-file move. |

### source-control — `apps/website/src/features/source-control/`

| File | Disposition | Jini destination | Blocking dependency or host responsibility |
|---|---|---|---|
| `commit-site.ts` | OPUS | `devops/src/source-control/site/commit-site.ts` | Credentials, export report, guarded write and cleanup. |
| `credential-setup.ts` | OPUS | `devops/src/source-control/site/credential-setup.ts` | Typed credentials, secure UI, token/copy policy and exchange. |
| `index.ts` | NOT-PLANNED | — | Mixed repo/store/write exports. Repoint leaf consumers rather than create a new barrel. |
| `provider-kit-host.ts` | STAYS-HOST | — | Tovu egress-refusal class and fetch tracer. Existing Jini kit does not own these. OPUS. |
| `provider-registry.ts` | OPUS | `devops/src/source-control/site/provider-registry.ts` | Trusted plugins, guarded transport and redaction. |
| `repo.memory.ts` | OPUS | `devops/src/source-control/site/repo.memory.ts` | Credential record and project-scope parity. |
| `source-control-credential-repo.sqlite.ts` | STAYS-HOST | — | Existing named SQLite subclass of host adapter; no new wrapper. OPUS. |
| `source-control-credential-repo.ts` | STAYS-HOST | — | Maps Tovu's content kernel, vault kind and project fallback onto db's SQL vault. OPUS. |
| `store.ts` | OPUS | `devops/src/source-control/site/store.ts` | Credential/token policy, egress, project scopes and vault repo. |
| `tool-registrations.ts` | OPUS | `devops/src/source-control/site/tool-registrations.ts` | Authenticated writes, credential and export/CMS seams. |
| `types.ts` | OPUS | `core/src/contracts/site/source-control-credentials.ts` for neutral types only | Planner's DevOps location is wrong for types shared by vault, host and domain. Audit sealed envelope/project types first. |
| `write-port.ts` | OPUS | `devops/src/source-control/site/write-port.ts` | Credential use and guarded HTTP/write behavior. |

Existing `SourceControlKitHost` in `@jini-ai/devops/source-control/site/provider-kit` is the K5 seam. It takes `describeTransportError({ error: unknown }): { refusal: string | undefined; logDetail: string }` and optional `observeFetch({ fetch: typeof fetch }): typeof fetch`. The host supplies it via `sourceControlKitHost({ observability }, _optional)` in `provider-kit-host.ts`. Preserve the optional guarded `httpClient` at `createSourceControlProviderKit`, including the current failing no-client behavior and the plugin ABI. Do not substitute bare fetch for a credentialed client. **No executable website source-control sheet.**

### adm-source-control — `apps/admin/src/features/source-control/`

| File | Disposition | Jini destination | Blocking dependency or host responsibility |
|---|---|---|---|
| `ProvidersTab.tsx` | OPUS | `devops/src/source-control/react/ProvidersTab.tsx` | Credential controls, host hint, secret input and writes. Leave this subtree in Tovu. |
| `SourceControl.tsx` | MOVE | `devops/src/source-control/react/SourceControl.tsx` | Shell only. Inject kit `TabBar`, locale, host text, navigation and the existing Providers subtree. S1. |
| `hooks/source-control-credentials-dependencies.hooks.ts` | STAYS-HOST | — | Authenticated API and test fixtures. OPUS. |
| `hooks/use-source-control-credentials.hooks.ts` | OPUS | `devops/src/source-control/react/hooks/use-source-control-credentials.hooks.ts` | Credential copy, API and required hook migration. |
| `index.ts` | NOT-PLANNED as a move | — | Delete its sole re-export in S1.T when the two lazy references repoint. |
| `rules.ts` | OPUS | `devops/src/source-control/react/rules.ts` for neutral pieces | Credential submission and error classification; also used by Security. |
| `source-control-host-i18n.ts` | STAYS-HOST | — | Host dictionary and common-dictionary composition over existing Jini translator. |
| `source-control-host-ports.ts` | STAYS-HOST | — | Authenticated request + workspace. OPUS. |
| `source-control-visuals.tsx` | NOT-PLANNED | `devops/src/source-control/react/source-control-visuals.tsx` | Split icon/visual code from credential UI before moving. S1 injects the existing icon. |

The planner's `admin/src/source-control/host/` destination is wrong for these domain screen leaves. Existing Admin API, router helper and translator subpaths stay where they are. They are wired on the **host** side of S1.

### site-export — `apps/website/src/features/site-export/`

| File | Disposition | Jini destination | Blocking dependency or host responsibility |
|---|---|---|---|
| `export-failure-summary.ts` | OPUS | Existing `devops/src/core/export-failure-summary.ts` | Generic implementation already landed. Removing the positional compatibility adapter affects static publish error disclosure and barrel identities. |
| `export-html-policy.ts` | OPUS | `devops/src/static-export/site/export-html-policy.ts` | Published WebMCP/form stripping and CMS source-edit callbacks. |
| `export-preflight.ts` | MOVE | `devops/src/static-export/site/export-preflight.ts` | Parse5 already present; inject template literal and reporting text from host. E1. |
| `index.ts` | NOT-PLANNED | — | Still fronts host exporter and route manifest. No Jini re-export shell. |
| `media-original-urls.ts` | OPUS | `devops/src/static-export/site/media-original-urls.ts` | Origin identity, active/non-document selection, CMS read-path backfill. |
| `route-manifest.ts` | NOT-PLANNED | `devops/src/static-export/site/route-manifest.ts` | Shares routing with the live app; theme discovery and published-content selectors need their own sheet. |
| `site-exporter.ts` | OPUS | `devops/src/static-export/site/site-exporter.ts` | Output cleanup, render origin, publish sanitization and private/media policy. E1.T changes only warning imports and args. |
| `static-security-headers.ts` | OPUS | `devops/src/static-export/site/static-security-headers.ts` | Live-header parity and host policy; no new header defaults. |
| `theme-preview-manifest.ts` | MOVE | `devops/src/static-export/site/theme-preview-manifest.ts` | Generic orchestration only. Existing host file becomes a real theme binding. E2. |
| `theme-preview-report.ts` | NOT-PLANNED | `devops/src/static-export/site/theme-preview-report.ts` | Export-report contract and theme-specific report interpretation. |

Use the existing `RouteManifest` and `ManifestRoute` from DevOps `static-export/site/ports`. No second manifest contract and no theme module in Jini. E2 abstracts the route-deps object as an opaque generic and injects only the three calls it makes.

### database-transfer — `apps/website/src/features/database-transfer/`

| File | Disposition | Jini destination | Blocking dependency or host responsibility |
|---|---|---|---|
| `confirmation-ui.ts` | OPUS | `db/src/transfer/confirmation-ui.ts` | Human-confirm exchange, deadline and host copy. |
| `copy-engine.ts` | OPUS | `db/src/transfer/copy-engine.ts` already exists | Host naming and partial exclusion glue, not the same file as Jini's engine. Do not overwrite. |
| `destination-exchange.ts` | OPUS | `db/src/transfer/destination-exchange.ts` | Privileged destination setup exchange and credential copy. |
| `destination-repo.ts` | STAYS-HOST | — | Composed `ContentKernel`, singleton DDL and SQL vault binding. OPUS. |
| `destination-store.ts` | OPUS | `db/src/transfer/destination-store.ts` | Vault kinds, credentials, sealer, verification. |
| `destination-ui.ts` | OPUS | `db/src/transfer/destination-ui.ts` | Secure destination card, copy and exchange. |
| `exclusions.ts` | STAYS-HOST | — | Product schema, excluded tables/columns and secret-setting policy. OPUS. |
| `table-catalog.ts` | STAYS-HOST | — | Tovu Drizzle schema introspection and exclusions; neutral table catalog already in Jini. OPUS. |
| `tool-registrations.ts` | OPUS | `db/src/transfer/tool-registrations.ts` | Host kernel, snapshot policy, confirm exchange and copy/gating orchestration. |

The host-side `DatabaseDestinationRepo` extends `SqlSecretsVaultRepo` and currently supplies `{ kernel }` as `KyselyKernel<SecretsVaultDatabase>`. Jini db's own schema slice is `SecretsVaultDatabase { secrets_vault: SecretsVaultTable }`. It is not a dependency-free core contract. Keep that adapter and the Drizzle/host-schema catalog on the host side. Cloud must characterize plain copy versus switch, without loosening the login/key exclusions, before extracting anything that handles the destination or writes data. **No executable database-transfer sheet.**

### adm-publish-content — `apps/admin/src/features/publish-content/`

| File | Disposition | Jini destination | Blocking dependency or host responsibility |
|---|---|---|---|
| `PublishContentDialog.hooks.tsx` | NOT-PLANNED | `cms/src/react/publish-content/PublishContentDialog.hooks.tsx` | Report-row UI needs a smaller view contract than the confirm controller. |
| `PublishContentDialog.tsx` | OPUS | `cms/src/react/publish-content/PublishContentDialog.tsx` | K2 `Dialog`, required confirm hook, CSS at host mount and confirmation UI parity. |
| `PublishSectionButton.tsx` | MOVE | `cms/src/react/publish-content/PublishSectionButton.tsx` | Inject section hook and agent handle; host retains section vocabulary and scope. P2. |
| `api/publish-content-api.ts` | STAYS-HOST | — | Authenticated request/workspace and peer path binding. OPUS, except P0.T's type-only import. |
| `api/publish-content-api.types.ts` | MOVE → existing | `core/src/contracts/site/cms-publish-content.ts` | Existing `PublishDestinationView` is already used by the Jini route. P0. |
| `hooks/criteria-publish-result.ts` | MOVE | `cms/src/react/publish-content/hooks/criteria-publish-result.ts` | Same-package row selectors, injected `nextStep` copy. P1. |
| `hooks/publish-availability.store.ts` | STAYS-HOST | — | One host instance fed by `/auth/me`, not another generic store. OPUS. |
| `hooks/publish-content-dependencies.hooks.ts` | STAYS-HOST | — | Real API and test fake bindings. P0.T changes only the type import. |
| `hooks/publish-content-port.hooks.ts` | OPUS | `core/src/contracts/site/cms-publish-admin-port.ts` if shared | Plan/confirm/execute contracts and bundle/token flow. P0.T changes only the view type import. |
| `hooks/publish-request.store.ts` | STAYS-HOST | — | Bound singleton, live-site predicate and product results. |
| `hooks/use-publish-content-confirm.hooks.ts` | OPUS | `cms/src/react/publish-content/hooks/use-publish-content-confirm.hooks.ts` | Confirm/execute, overwrite, stale plans and token lifecycle. P0/P1 touch only types and report projection. |
| `hooks/use-publish-section-button.hooks.ts` | STAYS-HOST | — | Generic hook already in Jini admin; host binds sections, Dashboard translation and the shared request store. |
| `publish-content.css` | STAYS-HOST | — | Imported by `apps/admin/src/main.tsx`; keep styling and native-dialog CSS in host. |

Use CMS `react/`, not the planner's admin package, for domain UI and its report projection. K4 destination DTO is already landed. K2 for later dialog work is the injected AdminKit `Dialog` slot, but **do not** swap the dialog implementation or its props in these sheets. P2 preserves the native `<button>` and exact DOM. It does not introduce a kit button.

## Prerequisites and execution order

All `.J` sheets precede all `.T` sheets. No Jini source imports Tovu, UI implementations, or an implementation in a sibling Jini package. Core imports in the signatures below are type-only. Preserve all original comments except references made inaccurate by moving their subject. Keep `_optional = {}` pads on functions and factories and object-shaped required args. JSX component props remain one object.

| Order | Jini | Tovu, after the Jini half is available |
|---|---|---|
| 1 | E1.J, E2.J | P0.T |
| 2 | D1.J, D2.J | E1.T, E2.T |
| 3 | S1.J | D1.T, D2.T, S1.T |
| 4 | P1.J, P2.J | P1.T, P2.T |

For a new public leaf, add `exports[subpath]` with `types` → `./dist/<stem>.d.ts`, and `import` and `default` → `./dist/<stem>.js`. Add the stated `jini.entries` runtime class. Existing export entries named below keep their existing targets. Baseline notes are the exact entries the cloud run should regenerate with `pnpm api:update`. Sol does not run generation or fabricate a generated delta. There are no new dependencies or lockfile edits. Tovu admin already declares CMS and DevOps.

For each sheet, write the characterization case before changing the behavior-bearing code. Where there is an existing host characterization, keep it in Tovu and make only the listed import/arg adjustments. Cloud validates the original behavior on the old base, then runs the new and retained cases and checks the named mutation turns the stated case red. Do not commit mutations.

## Executable sheets

### E1.J — Jini, export preflight

Create `packages/devops/src/static-export/site/export-preflight.ts` from Tovu's file. Keep `parse5`, `MAX_SAMPLE_BYTES`, `hostOf`, the script scanner, the per-export closure, the `existing` warning order and the collector return methods verbatim. Remove the template constant, host warning formatters and `MAX_HOSTS_SHOWN` from the Jini copy. Use these seams:

```ts
export interface ExportPreflightCopy {
  readonly contactEmailPlaceholder: string;
  readonly placeholderWarning: (
    required: { pages: number },
    optional?: Record<string, never>,
  ) => string | undefined;
  readonly thirdPartyWarning: (
    required: { pages: number; hosts: readonly string[] },
    optional?: Record<string, never>,
  ) => string | undefined;
}
```

- Add `placeholder: string` to the existing required args of `findContactEmailPlaceholder`. Implement `html.includes(placeholder)`.
- Add required `copy: ExportPreflightCopy` to `createExportPreflight({ ownOrigins, copy }, _optional = {})`. Pass its placeholder to the detector. In `joinWarnings`, call `copy.placeholderWarning({ pages: found.placeholderPages })` and, only when consent is configured, `copy.thirdPartyWarning({ pages: found.thirdPartyPages, hosts: [...found.hosts].sort() })`. Preserve empty-string filtering and the original order.
- Export `./static-export/site/export-preflight`, `node`. Expected delta in `api-baseline/jini-ai__devops.json` is this leaf with `ExportPreflightCopy`, `createExportPreflight`, `findContactEmailPlaceholder` and `findThirdPartyScriptHosts`. No package root export.
- Create `static-export/site/__tests__/export-preflight.test.ts`. Use a distinct placeholder and callbacks returning deterministic strings. Cover two independent collectors, repeated observations, sorted/deduplicated hosts, mixed-case script tags, relative/own-origin/declared/inert scripts, existing warning first and no third-party warning when consent is off. **Mutation `DROP_CONSENT_CHECK`** calls the third-party formatter regardless of consent. The consent-off case must fail.
- Carry the A421/A400 warning-not-blocking rationale, per-export state ownership, script sampling bound and parser/HTML tag case rationale.

### E1.T — Tovu, preflight copy binding

Create `apps/website/src/features/site-export/export-preflight-copy.ts`. Move, verbatim, `CONTACT_EMAIL_PLACEHOLDER`, `MAX_HOSTS_SHOWN`, `placeholderWarning`, and `thirdPartyWarning` into it. Export `CONTACT_EMAIL_PLACEHOLDER` and `EXPORT_PREFLIGHT_COPY: ExportPreflightCopy`, naming the latter's three fields exactly as above. Import that type from the new Jini leaf. Carry the A400 comment beside the host formatter.

Delete `export-preflight.ts`. Executable importer repoints from the fixed-string scan:

- `site-exporter.ts:2,572` — import `createExportPreflight` from `@jini-ai/devops/static-export/site/export-preflight` and `EXPORT_PREFLIGHT_COPY` from `./export-preflight-copy.js`. Pass `copy: EXPORT_PREFLIGHT_COPY` to the existing call.
- `__tests__/export-preflight.unit.test.ts:4` — import all three functions from the same Jini leaf, and the copy object/placeholder from `../export-preflight-copy.js`. Add `placeholder: CONTACT_EMAIL_PLACEHOLDER` to the two detector calls and `copy: EXPORT_PREFLIGHT_COPY` to all three collector constructions. Leave their assertions and the real privacy-template import unchanged.
- The integration test uses the exporter, not the old leaf. Keep it and its imports unchanged.

Add a host characterization for six distinct hosts that asserts the existing warning lists the first five sorted hosts and `, ...`, and that the privacy-template placeholder warning still has the exact host copy. **Mutation `SHOW_SIX_HOSTS`** changes the cap from five to six. No manifest or baseline edit in Tovu.

### E2.J — Jini, preview-manifest orchestration

Create `packages/devops/src/static-export/site/theme-preview-manifest.ts`. Move `isHtmlPage` and `buildPreviewExportManifest` from Tovu. Replace host imports with the same-package `import type { ManifestRoute, RouteManifest } from "./ports.js"` and these exact structural ports:

```ts
export interface PreviewExportManifestPorts<Deps> {
  readonly buildManifest: (
    required: { routeDeps: Deps; themeId?: string },
    optional?: Record<string, never>,
  ) => Promise<RouteManifest>;
  readonly readPreviewConfig: (
    required: { routeDeps: Deps; activeThemeId: string },
    optional?: Record<string, never>,
  ) => Promise<{ enabled: boolean; themes: readonly { themeId: string }[] } | null>;
  readonly previewThemePath: (
    required: { themeId: string; activeThemeId: string; path: string },
    optional?: Record<string, never>,
  ) => string;
}
```

Required args are `{ routeDeps: Deps; ports: PreviewExportManifestPorts<Deps> }`, with `Deps extends { readonly siteTitleReady?: Promise<void> | undefined }`. Keep the existing optional `{ includeThemePreviews?: boolean } = {}` and return `{ manifest: RouteManifest; themeCount: number }` inside the promise. Await `siteTitleReady` before baseline enumeration. Call `ports.buildManifest({ routeDeps })`. Keep the explicit false early return and missing-active-theme return. At the original settings check, call `readPreviewConfig`, then return one theme for `null` or disabled. Inside the existing variant loop, call `buildManifest({ routeDeps, themeId })` and pass `previewThemePath` the same three values. Keep the merge order, dedupe `Map`, route-kind filter and `themeCount` unchanged.

Export `./static-export/site/theme-preview-manifest`, `universal`. DevOps API delta is the leaf with `PreviewExportManifestPorts` and `buildPreviewExportManifest`. No changes to `ports.ts`. Create `static-export/site/__tests__/theme-preview-manifest.test.ts` with fake ports covering the readiness wait, explicit false not calling config, null/disabled, active+one variant, duplicate path preferring the variant, and no preview aliases for well-known/redirect/404 routes. **Mutation `DROP_THEME_OVERRIDE`** omits `themeId` on the variant `buildManifest` call. The fake variant-only path must go missing and fail the test. Carry the real-app fetch, portable-copy and discovery-output why-comments.

### E2.T — Tovu, retain the theme binding

Keep `theme-preview-manifest.ts` as the actual host binding, not a re-export. Retain its five current host/domain imports: `SettingsRepoPort`, `readPreviewSwitcher`, `previewThemePath`, `buildRouteManifest`, and `RouteManifestDeps` (the latter two share an import). Import the Jini function as `buildWithPorts` and its `PreviewExportManifestPorts` type. Remove the old local `ManifestRoute` import. `RouteManifest` can remain as a type for the return annotation.

```ts
type PreviewRouteDeps = RouteManifestDeps & {
  settingsRepo?: SettingsRepoPort;
  siteTitleReady?: Promise<void>;
};

const ports: PreviewExportManifestPorts<PreviewRouteDeps> = {
  buildManifest: ({ routeDeps, themeId }) =>
    buildRouteManifest(themeId === undefined
      ? routeDeps
      : { ...routeDeps, resolveActiveThemeId: async () => themeId }),
  readPreviewConfig: async ({ routeDeps, activeThemeId }) =>
    routeDeps.settingsRepo
      ? readPreviewSwitcher({ ...routeDeps, settingsRepo: routeDeps.settingsRepo, activeThemeId })
      : null,
  previewThemePath,
};
```

The existing host export keeps its signature and delegates with `buildWithPorts({ routeDeps, ports }, options)`. No importer needs a specifier change. The fixed-string scan found `site-exporter.ts:16,622`, `site-export/__tests__/theme-preview-manifest.test.ts:11,18,27`, and `features/theme/__tests__/preview-switcher.integration.test.ts:13,163,177`. Keep all on the host binding. Keep its two existing theme edges at the same path in `.dependency-cruiser.mjs` and `development/scripts/check-architecture.baseline.json`; do not add edges or baseline rows.

Add a case to the host manifest test using a switcher-enabled fixture with `includeThemePreviews: false`, asserting no `/_themes/` paths and `themeCount === 1`. **Mutation `IGNORE_PREVIEW_OPT_OUT`** drops the optional object in the host delegation. No Tovu manifest/API change.

### D1.J — Jini, deployment History tab

Create `packages/devops/src/deploy/react/HistoryTab.tsx`. Copy the current JSX, handles, copy and why-comments. Replace imports of the Tovu locale hook, translator and visuals, and the runtime `agentHandle` import, with required fields on `HistoryTabProps`:

```ts
export interface HistoryTabProps {
  useAdminLocaleHook: (
    required: Record<string, never>, optional?: Record<string, never>,
  ) => string;
  t: (required: { locale: string; key: string }, optional?: Record<string, never>) => string;
  historyIcon: ReactNode;
  publishHref: string;
  agentHandle: (
    required: { handle: string }, optional?: AgentHandleOptions,
  ) => AgentHandleProps;
}
```

Use type-only imports from `react` and `@jini-ai/core/agent-handles`. Call `useAdminLocaleHook({})`. Render `historyIcon` inside the existing span, and use `publishHref` on the same link. No kit slot is needed for the supplied icon or native link.

Add named `HistoryTab` and type `HistoryTabProps` exports to `deploy/react/index.ts` using `./HistoryTab.js`; existing `./deploy/react` remains `browser`. Create `deploy/react/__tests__/HistoryTab.test.tsx` using the existing SSR test pattern. Assert the heading is `<h2>`, there are no fabricated rows, the two stable agent handles render and the supplied href is used. **Mutation `HARDCODE_HISTORY_HREF`** ignores the injected href; use a distinct path in this test. Carry the no-backend/no-fake-rows rationale and the heading-level accessibility comment.

### D1.T — Tovu, mount the History tab

Delete `HistoryTab.tsx`. In `Deployment.tsx:11,62` import `HistoryTab` from `@jini-ai/devops/deploy/react`. At the History branch pass `useAdminLocaleHook={useWiredAdminLocale}`, the existing `t`, `historyIcon={<HistoryIcon size={22} />}`, `publishHref="/admin/deployment?tab=static-site"`, and the existing `agentHandle`. Add `useWiredAdminLocale` to the existing locale import. Do not reuse the parent's locale override; the old History tab did not use it.

In `__tests__/PureTabs.unit.test.tsx:4,23,36` import from the new entry and pass the same real dependencies from the existing host modules. Add an assertion for the real href and keep the absence-of-rows and agent-handle assertions. **Mutation `DROP_HISTORY_LINK_BINDING`** passes a different host path and must fail. `DockerfileTab.tsx:115` is a comment reference, not an importer; update the reference to the moved History component. `Deployment.unit.test.tsx` still renders `Deployment`; keep its imports and route assertions. No package change. Cloud regenerates only the `./deploy/react` DevOps delta shared with D2.

### D2.J — Jini, read-only deployment overview hook

Create `packages/devops/src/deploy/react/use-deployment-overview.hooks.ts`. Move the controller and `useDeploymentOverview`, not `useWiredDeploymentOverview`. Use `Translate` as a type from `@jini-ai/core/text`. Parameterize the controller and port by `Snapshot`; do not copy `AdminDeploymentOverview`, import `@jini-ai/admin`, or promote a site DTO into core for this read-only hook.

```ts
export interface DeploymentOverviewController<Snapshot> {
  snapshot: Snapshot | undefined;
  error: string | null;
  t: Translate;
}

export interface DeploymentOverviewArgs<Snapshot> {
  port: { getDeploymentOverview(): Promise<Snapshot> };
  t: Translate;
  locale: string;
  useFetchQueryHook: (
    required: { key: readonly string[]; fetch: () => Promise<Snapshot> },
    optional?: Record<string, never>,
  ) => { data: Snapshot | undefined; error: unknown };
  describeError: (
    required: { error: unknown; locale: string },
    optional?: Record<string, never>,
  ) => string;
}
```

`useDeploymentOverview<Snapshot>(required: DeploymentOverviewArgs<Snapshot>, _optional = {})` invokes the required `useFetchQueryHook` with the existing `["deployment", "overview"]` key and `fetch: () => port.getDeploymentOverview()`. Preserve truthiness of `query.error` and project it through `describeError({ error: query.error, locale })`; no generic formatter or raw error fallback. Return `{ snapshot: query.data, error, t }`.

Export the hook and its two types from `deploy/react/index.ts` using the relative `.js` leaf. No new subpath and no package dependency. Create `deploy/react/__tests__/use-deployment-overview.test.ts` with an injected synchronous fake query function. Capture the exact key and invoke the supplied fetch to check port identity, check translator identity on the controller, and pass a sentinel error and locale to check the formatter. **Mutation `BYPASS_OVERVIEW_ERROR_FORMATTER`** uses a generic string instead of the port. Carry the single-read, no-mutation and bound-translator comments.

### D2.T — Tovu, supply the overview collaborators

Create `apps/admin/src/features/deployment/hooks/deployment-overview-binding.hooks.ts`, then delete the original `use-deployment-overview.hooks.ts`. Move the old wired function into the binding, retaining its exact locale behavior and `defaultDeploymentOverviewPort`. Import `useDeploymentOverview` from `@jini-ai/devops/deploy/react`, K2 `useFetchQuery` from `@jini-ai/admin/react/kit`, and the existing host locale, translator, `describeApiError`, and `deploymentOverviewLoadErrorMessage`. Export the local formatter for the existing test:

```ts
export function describeDeploymentOverviewError(
  { error, locale }: { error: unknown; locale: string },
  _optional = {},
): string {
  return deploymentOverviewLoadErrorMessage({
    locale,
    error: describeApiError({ e: error, fallback: "unknown error" }),
  });
}
```

Supply the facade as `useFetchQueryHook` and that formatter as `describeError`. The production provider already binds `adminKit.query.useFetchQuery` in `integrations/jini-kits.ts` and mounts it in `main.tsx`.

- `OverviewTab.tsx:18` — use `./hooks/deployment-overview-binding.hooks`. Existing `typeof useWiredDeploymentOverview` props and behavior stay.
- `__tests__/OverviewTab.unit.test.tsx:5` — import the generic type from `@jini-ai/devops/deploy/react`; instantiate it with the test's `AdminDeploymentOverview` DTO at both annotations on `controllerFixture`.
- `hooks/__tests__/use-deployment-overview.unit.test.tsx:5,50,62,73` — import the hook from DevOps and the formatter from `../deployment-overview-binding.hooks`. Pass `describeError: describeDeploymentOverviewError`. This test mounts the fetch-query provider alone, so inject its existing implementation from `@jini-ai/ui/fetch-query` rather than silently requiring a new provider.
- Update stale doc paths in `hooks/use-dockerfile-source.hooks.ts` and `hooks/use-static-export.hooks.ts`. No other executable imports were found.

Keep the three existing cases. Add a characterization that passes a distinct bound locale/formatter and checks the localized error, including the existing fallback for an unknown error. **Mutation `IGNORE_OVERVIEW_LOCALE`** supplies `"en"` instead of the test locale at the formatter seam. No Tovu package/API delta.

### S1.J — Jini, source-control page shell

Create `packages/devops/src/source-control/react/SourceControl.tsx`. Move the page header, tab specification and panel structure. Keep `SOURCE_CONTROL_TAB_IDS = ["providers"] as const` and the guard helper. Replace Tovu, `@jini-ai/admin`, and `@jini-ai/ui` implementation imports with these required props:

- `tabId?: string | null | undefined`, unchanged.
- `useAdminLocaleHook` and `t` have the D1 shapes; call the hook with `{}`.
- `resolveActiveTabId(required: { tabId: string | null | undefined; validIds: readonly "providers"[]; defaultId: "providers" }, optional?: Record<string, never>): "providers"`. The guard helper calls this injected resolver with the same existing values.
- `TabBar: ComponentType<SourceControlTabBarProps>`. The local structural slot props are `{ tabs: readonly { id: string; label: string; icon?: ReactNode | undefined; handle?: string | undefined; handleLabel?: string | undefined }[]; activeId: string; onChange: (id: string) => void; ariaLabel: string; containerHandle?: string | undefined }`. This is the subset of the existing AdminKit `TabBar` used here.
- `onTabChange(required: { nextTabId: string }, optional?: Record<string, never>): void`, `providerIcon: ReactNode`, `providers: ReactNode`, and `headerAttrs: AgentHandleProps`.
- `copy: { descriptionKey: string; providerTabHandleLabel: string }`. Use `t({ locale, key: copy.descriptionKey })` for the paragraph.

Use type-only React and core imports. Inside the existing `TabBar`, adapt `onChange` to `onTabChange({ nextTabId })`. Spread `headerAttrs` where the old `agentHandle` was. Render `providers` in the exact position of the old `ProvidersTab`, unconditionally. The Jini shell does not know or call a credential controller.

Export `./source-control/react` to `source-control/react/SourceControl`, `browser`. Expected DevOps baseline delta is `SourceControl`, `SourceControlProps`, and `SourceControlTabBarProps` on that new leaf. Add `source-control/react/__tests__/SourceControl.test.tsx` using SSR and a fake TabBar. Assert only Providers exists, a stale tab resolves to Providers, the injected icon/header/copy render, and the panel is not conditional on a valid query. **Mutation `BLANK_ON_UNKNOWN_TAB`** hides the provided panel for a junk tab id. Carry the owner reversal on page-level tabs, no phantom tabs, and direct-link/replace-history rationale. Do not move `ProvidersTab`.

### S1.T — Tovu, keep lazy route and credential subtree

Create `apps/admin/src/features/source-control/source-control-panel.tsx`. Export `SourceControl` as the **bound page**, import the Jini component as `SourceControlShell`, and keep the old host props, including the two test overrides. Wire:

- AdminKit facade `TabBar` from `@jini-ai/admin/react/kit`; the real slot is already supplied by `integrations/jini-kits.ts`.
- The old Tovu `useAdminLocale` default and an override through a required object-args prop. Keep invocation semantics with no locale port override. Do not change `ProvidersTab` or its hook fallback.
- `t` from `./source-control-host-i18n`, `resolveActiveTabId` from `@jini-ai/core/text`, `<SourceControlIcon size={16} />`, and `<ProvidersTab useSourceControlCredentialsHook={props.useSourceControlCredentialsHook} />` from their current host modules.
- `onTabChange` calls the existing `navigateSourceControlTab({ nextTabId, navigate })`. Keep the same imports of that helper and `navigate` on the host.
- `headerAttrs` uses the old `agentHandle({ handle: "source-control-header" }, ...)` with the same role and label. Copy the old full description translation key and Providers-tab handle label verbatim into the `copy` prop.

Delete `SourceControl.tsx` and its one-export `index.ts`. Repoints:

- `apps/admin/src/panel-pages.ts:60` — change only the `import()` specifier to `./features/source-control/source-control-panel`; keep the exported lazy element and `module.SourceControl`.
- `apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx:46` — same specifier change relative to this file (`../../features/source-control/source-control-panel`); keep module id and export name.
- `features/source-control/__tests__/SourceControl.unit.test.tsx:5` — `../source-control-panel`. Keep the real provider subtree tests and fake hook overrides. The existing render helper mounts the AdminKit provider.
- `panels.tsx:1011` still consumes the same lazy symbol. Update only the stale source comment at `panels.tsx:993` and the matching comment in `styles/source-control.css:3`.

Keep the existing invalid deep-link test. Extend it to assert navigation replaces rather than pushes the current history entry, using the existing router and a `replaceState` spy. **Mutation `PUSH_SOURCE_CONTROL_TAB`** changes `replace` to false in the cloud verification copy of the existing navigation helper. No Tovu manifest or baseline change. Stop if the move would load Providers eagerly from the app shell.

### P0.T — Tovu, consolidate the destination response type

No Jini sheet. `@jini-ai/core/contracts/site/cms-publish-content` already exports `PublishDestinationView`, and Jini's three destination specs use it. Shape is `readonly { connected: boolean; site: PublishContentPeerView | null; candidateUrl: string | null; message: string; nextStep: string | null }` in the sense that all five members are readonly. No request method or route is part of this change.

Delete `apps/admin/src/features/publish-content/api/publish-content-api.types.ts`. Replace the local type imports below with `import type { PublishDestinationView as AdminPublishDestinationView } from "@jini-ai/core/contracts/site/cms-publish-content"`. Merge into an existing type import from that subpath when present.

- `api/publish-content-api.ts:5`
- `hooks/__tests__/use-publish-content-confirm-T4-03.characterization.unit.test.ts:4`
- `hooks/publish-content-dependencies.hooks.ts:4`
- `hooks/publish-content-port.hooks.ts:4`
- `hooks/use-publish-content-confirm.hooks.ts:21`

No code uses this type as a value. No alias file, manifest or baseline change. In the existing T4-03 characterization, type the deferred response fixture with `satisfies PublishDestinationView` and keep the displayed status/next-step assertions. Add a type-only negative fixture using `@ts-expect-error` for an omitted `nextStep`. **Mutation `MAKE_DESTINATION_NEXT_STEP_OPTIONAL`** makes that negative fixture fail type-check through an unused directive. Keep the zero-setup response rationale in the adjacent API comment. Do not wire, read, or expose any new field.

### P1.J — Jini, criteria report projection

Create `packages/cms/src/react/publish-content/hooks/criteria-publish-result.ts`. Move both functions. Replace the combined cross-package import with same-package relative imports:

- `rowPublishesWithSelection`, `selectableRowKeys` and type `PublishReportRow` from `../../../publish/content/ui/report-rows.js`
- types `CriteriaSelection` and `PublishRequestResult` from `../../../publish/content/ui/criteria.js`

Add `nextStep: string` to `buildCriteriaPublishResult`'s existing required args, and return that field instead of the current literal. Preserve every other return field, array order, missing-reason throw and `_options = {}`. No new selection algorithm.

Export `./react/publish-content/criteria-publish-result` to `react/publish-content/hooks/criteria-publish-result`, `universal`. Set `jini.isolation.entries[subpath] = "publish"` so the relative calls stay in the CMS publish domain. CMS baseline delta is `buildCriteriaPublishResult` on that leaf only. Create `react/publish-content/hooks/__tests__/criteria-publish-result.test.ts`. Use actual typed rows for a forced selected row, carried media, deselected row, unchanged row, skipped row with a reason, and a skipped row without a reason. Assert that forced appears in both arrays, carried media follows its selected parent, only the skipped row is `leftAlone`, and the injected next step and unmatched/unknown arrays survive. **Mutation `FORCED_NOT_PUBLISHED`** reports forced only in `willOverwrite`. Carry the S2 report/dialog parity, subset and carried-media comments.

### P1.T — Tovu, report call only

Delete `apps/admin/src/features/publish-content/hooks/criteria-publish-result.ts`. There is one executable importer, `hooks/use-publish-content-confirm.hooks.ts:26,948`. Import from `@jini-ai/cms/react/publish-content/criteria-publish-result` and add `nextStep: "Check the list in the Publish dialog, then click Publish."` to the existing `buildCriteriaPublishResult` required args. Do not move or otherwise touch confirm, execute, overwrite, arming or error logic.

Keep `__tests__/PublishContentDialog.unit.test.tsx`'s exact `onPlanned` assertion and add a case asserting a forced preview row is in both lists with the Tovu next-step string. **Mutation `CHANGE_HOST_NEXT_STEP`** replaces that literal and must fail the exact result. No package/API change.

### P2.J — Jini, publish section button markup

Create `packages/cms/src/react/publish-content/PublishSectionButton.tsx`. Retain the exact native button, default class, handle construction, event and early hidden return. Remove the Tovu section-type and hook imports, and replace the runtime agent-handle import with type-only `AgentHandleOptions` and `AgentHandleProps`. Use:

```ts
export interface PublishSectionButtonProps<Section extends string> {
  section: Section;
  className?: string | undefined;
  usePublishSectionButtonHook: (
    required: { section: Section },
    optional?: Record<string, never>,
  ) => { visible: boolean; label: string; onClick: () => void };
  agentHandle: (
    required: { handle: string }, optional?: AgentHandleOptions,
  ) => AgentHandleProps;
  agentLabel: string;
}
```

The component is generic in `Section extends string`, calls the required hook with `{ section }`, and uses the supplied `agentLabel` only in the existing attribute construction. Leave the native DOM intact; no `@jini-ai/admin` or UI-kit import. Carry the rationale for secondary actions and the host's primary style override.

Export `./react/publish-content/PublishSectionButton` to `react/publish-content/PublishSectionButton`, `browser`. Set `jini.isolation.entries[subpath] = "publish"` and `jini.isolation.forbidden[subpath] = ["node:", "express", "kysely", "parse5"]`, following CMS `./react/media`'s React leaf precedent. CMS baseline delta is the component and props type on the new leaf. Create `react/publish-content/__tests__/PublishSectionButton.test.tsx` using CMS's existing React test harness. Assert the fake hook sees `{ section }`, invisible renders nothing, custom class and agent label survive, default class stays secondary and clicking runs the injected callback once. **Mutation `RENDER_WHEN_UNAVAILABLE`** removes the early return.

### P2.T — Tovu, one host-bound button

Create `apps/admin/src/features/publish-content/publish-section-button-binding.tsx`. Export `PublishSectionButton` as the bound component, import the Jini component as `JiniPublishSectionButton`. Keep the host `PublishSectionId` type from `@tovu/publish-content-ui`, and the existing `usePublishSectionButton` from `./hooks/use-publish-section-button.hooks`. Adapt it once, at module scope, with a required `{ section: PublishSectionId }` and `_optional = {}`. The binding's props are `section`, optional `className`, and the existing test override, now typed as the object-args hook from `PublishSectionButtonProps<PublishSectionId>`. Default the override to the host adapter. Pass the selected hook, `agentHandle` from core, and the exact `` `Publish ${section} to the live site` `` agent label. This is actual host composition. Do not instantiate another request or availability store.

Delete `PublishSectionButton.tsx`. For every importer below, replace only the final `PublishSectionButton` path segment with `publish-section-button-binding`; retain the named import and the existing JSX, `createElement`, component-valued prop or identity assertion.

- `features/collections/CollectionEntriesScreen.tsx`
- `features/collections/CollectionsScreen.tsx`
- `features/media/Media.tsx`
- `features/menus/menus-panel.tsx`
- `features/pages/Pages.tsx`
- `features/posts/Posts.tsx`
- `features/taxonomy/TaxonomyScreen.tsx`
- `features/themes/Themes.tsx`
- `features/publish-content/__tests__/PublishSectionButton.unit.test.tsx`
- `features/publish-content/__tests__/publish-availability.store.unit.test.tsx`
- `features/publish-content/__tests__/use-publish-section-button.hooks.unit.test.tsx`
- `integrations/jini-admin/__tests__/modules.hooks.unit.test.tsx`
- `integrations/jini-admin/forms-module.hooks.ts`
- `integrations/jini-admin/modules.hooks.ts`
- `integrations/jini-admin/redirects-module.hooks.ts`
- `integrations/jini-admin/seo-module.hooks.ts`
- `integrations/jini-admin/widgets-module.hooks.ts`

Keep the existing parameterized scope and real store identity cases. Add a host case asserting Themes' primary override and `data-agent-label` are unchanged. **Mutation `DROP_SECTION_CLASS_OVERRIDE`** omits `className` from the host projection. No Tovu package/API change.

## STOP conditions

- **No Sol expansion.** Do not execute an OPUS or NOT-PLANNED row, even if a nearby sheet opens a dependency. In particular, do not edit auth, credential, key, redaction, delete, trusted-loading, confirmation, or write behavior. The only edits to held files are the explicitly listed type, call-site, comment, and report-projection changes.
- **No shadow owners.** Stop on an occupied target, an additional live importer not accounted for by its sheet, a new cross-package implementation dependency, a required new provider, or a dependency/type/config change not listed. Do not solve any of these with a re-export shell, machine-generated debt, a bypass, or a broad manifest change.
- **Preserve boundaries and observable bytes.** Stop on route method/path/status/body drift, changed tool catalog bytes, a new Jini-to-host edge, a changed DOM handle, or a product/theme implementation crossing into Jini. Preserve the old kit bindings, CSS mount points, lazy boundaries, singleton counts and route tests. No new architecture baseline exemptions.
- **Respect the execution split.** Stop a Tovu half if its Jini export is not available on the paired tree. Do not fall back to an older registry package or leave both implementations live. Sol records unverified work and the expected baseline entries; cloud runs characterization, mutation checks, build/type/API/guard checks, and fixes. New functions must stay within 80 lines and complexity 10 without debt rows.
- **No inferred follow-on.** The remaining 68 rows require separate sheets with their own live importer scans and observed contracts. A planner destination or a blocked-edge label is not enough to authorize the move.
