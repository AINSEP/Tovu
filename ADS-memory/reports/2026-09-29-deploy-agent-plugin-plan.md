# Deploy agent plugin: plan (hosting vendor code out of Jini devops and Tovu core)

Date: 2026-09-29. Author: Opus 5.5 (software-architect persona). PLAN ONLY, no code changed.
Owner decision (paraphrased): a Tovu "deploy" agent plugin owns every hosting-vendor deploy path (Netlify, Vercel,
Cloudflare Pages, GitHub Pages, S3-compatible, future hosts). `@jini-ai/devops` keeps no vendor-specific code, and
the host only gains generic capabilities.

## 0. Answer first: does this block the pending release?

**No. Ship `@jini-ai/devops` 0.3.2 (Cloudflare `_headers` fix `28f67f9a`) now.** It is a patch release with no API
change. Tovu's `^0.3.1` range picks it up, and the fix is what makes today's Tovu Cloudflare publish apply
security headers. This plan's breaking release (0.4.0) comes last (slice J2), after Tovu no longer imports any
vendor class. The plugin's Cloudflare target must be ported from **0.3.2** source, not 0.3.1, so the fix carries
forward.

## 1. Current map

### 1a. Jini `packages/devops/src/deploy/` (only consumer: Tovu. Also `Tovu-release-build/package.json`, a build copy)

| File | Lines | Verdict | Notes |
|---|---|---|---|
| `types.ts` | 101 | **generic, stays** | `DeployFile`, `DeployTarget` port, `DeployPublishInput/Result`, `DeployError`. Header comment names Vercel/Cloudflare only as examples. |
| `tokens.ts` | 70 | **generic, stays** | `DeployTargetToken = manyToken(...)`, `publishDeploy()`. Comment examples at :7, :12-13 name vendor classes. |
| `tool.ts` | 148 | **generic, stays** | `deploy.publish` registration, deny-by-default policy. Vendor names only in prose (:47-49) and **in the tool description string at :130** (runtime text, so it must change). |
| `reachability.ts` | 306 | **generic, stays** | `checkDeploymentUrl`, `waitForReachableDeploymentUrl`, `normalizeDeploymentUrl`. Already vendor-neutral by design: protected-page detection is injected (`ProtectedResponseDetector`, :38). Vendor names only in comments (:8, :32-35, :67). |
| `redirect-guard.ts` | 45 | **generic, stays** | Also used by Tovu `source-control/github-git-provider.ts:3`, which is not deploy code. |
| `naming.ts` | 29 | **generic, stays** | `safeProjectLabel`, `safeDnsLabel`. |
| `vercel.ts` | 278 | **vendor, moves** | `VERCEL_TARGET_ID` :7, `isVercelProtectedResponse` :32, `VercelDeployTarget` :58 |
| `netlify.ts` | 343 | **vendor, moves** | `NETLIFY_TARGET_ID` :15, `NetlifyDeployTarget` :51 |
| `cloudflare-pages.ts` | 1115 | **vendor, moves** | ids/limits :16-23, hash/chunk helpers :64/:96, `CloudflarePagesDeployTarget` :996. Includes the 0.3.2 form-field fix. |
| `github-pages.ts` | 460 | **vendor, moves** | `GITHUB_PAGES_TARGET_ID` :15, `GitHubPagesDeployTarget` :71 |
| `__tests__/{vercel,netlify,cloudflare-pages,github-pages}.test.ts` | part of 4991 test lines | move with their targets | `index.test.ts` asserts the barrel, so update it. |
| `index.ts` | 10 | edit | Barrel re-exports the 4 vendor files. |
| `README.md`, `source-map.md` | n/a | edit | Describe the vendor targets. |

All four vendor files import only `node:crypto`, `@jini-ai/platform`'s `fetchWithTimeout`/`FETCH_TIMEOUT_MS`, and the
generic siblings (reachability, redirect-guard, naming, types). That makes them portable if a host passes those
helpers in (§3). No Jini-internal package or app binds them. `DeployTargetToken`/`deploy.publish` have no binding
anywhere in Jini outside tests.

### 1b. Tovu vendor call sites for hosting deploys (production files; tests listed after)

**Static publish (`apps/website/src/features/deployments/static-publish/`)**
- `adapter.ts:38`: imports `renderHeadersFile`/`renderVercelConfig`; `:40` S3 target.
- `adapter.ts:97`: `NOJEKYLL_FILE`; `:493-500` the github-pages `.nojekyll` branch in `buildDeployFilesForPublish`.
- `adapter.ts:484-488`: **`SECURITY_HEADER_FILES`** (netlify/cloudflare-pages get `_headers`, vercel gets `vercel.json`).
- `adapter.ts:103-150`: per-vendor config validation (`validateGitHubPagesConfig`, `validateVercelConfig`, OWNER/REPO/BRANCH patterns).
- `adapter.ts:162-163`: `computeBasePath` sets `/${repo}` for github-pages only.
- `adapter.ts:247-337`: `buildS3CompatibleTargetConfig`, `buildJiniTarget` plus 3 per-vendor builders (`new *DeployTarget`).
- `types.ts:40-105`: `StaticPublishTargetId`, per-vendor `*PublishConfig` closed union.
- `credentials.ts:57-171, 210`: `ENV_VAR_ALIASES_BY_TARGET` (GITHUB_TOKEN, VERCEL_TOKEN, NETLIFY_*, CLOUDFLARE_*), Cloudflare account-id env var, the S3 no-env rule.
- `verify.ts:114-289`: per-vendor credential probes (`api.vercel.com/v2/user`, `api.netlify.com/api/v1/user`, Cloudflare `/user/tokens/verify`, GitHub), `PROVIDERS_WITH_ACCOUNT_LABEL` :144, the dispatch `if` chain :270-273, display labels :289.
- `s3-compatible-target.ts` (868 lines): Tovu's own S3/R2/B2/Spaces/Wasabi/MinIO target implementing Jini's `DeployTarget`.
- `publish-run.ts`, `publish-history.ts`: vendor names in prose only. Publish history columns are generic text (`schema.sqlite.ts` publish history: `target, owner, repo, branch, commit_sha, deployment_id, base_path`). **No DB migration is needed.**

**Credentials**
- `publish-credentials/types.ts:44`: `PublishProviderId` closed union; `:54-125` per-vendor `*ConnectionInput`.
- `publish-credentials/store.ts:71`: `PROVIDER_IDS` set; `:200-248` per-vendor connection builders (teamId, siteId, accountId, projectName, S3 fields).
- `publish-credentials/s3-compatible-field-guidance.ts` (123 lines): R2/B2/Spaces/AWS field help.
- `vendor-credentials/types.ts:54-69, 104-120`: `VendorId` includes vercel/netlify/cloudflare/s3-compatible; `PUBLISH_PROVIDER_TO_VENDOR`; per-vendor inputs. `vendor-credentials/dual-read.ts:112`, `store.ts`.
- `server/runtime/composition/sealed-credential-descriptors.ts:8, 102`: AAD is keyed by `provider_id`. **Ids must stay byte-identical** or sealed rows stop decrypting.

**Agent tools and routes**
- `features/deployments/publish-agent-tools.ts:218-323`: provider-id enum, per-vendor parameter prose (owner/repo/branch/teamId); `:363` `deployment_generate_bucket_hosting_setup` and `:350` `deployment_propose_custom_provider_credential` (both S3-specific); `:595-640` confirmation card has a github-pages branch.
- `server/inbound/admin-http/routes/system/publish-site.ts:97-122, 155, 178-186`: per-vendor body/query parsers and the error string listing vendors.
- `server/inbound/admin-http/routes/system/publish-credentials.ts:396`: github-pages-only repo listing.
- `server/inbound/admin-http/routes/system/deployment-overview.ts:102`: `DEPLOY_CLI_NAMES = ["gh","vercel"]` (server PATH probe).

**HTML/security headers**
- `features/site-export/static-security-headers.ts:26-39`: `HEADERS_FILE_NAME`, `VERCEL_CONFIG_FILE_NAME`, `renderHeadersFile`, `renderVercelConfig` (vendor formats). **`withSecurityMeta` (:50) is host-neutral HTML and stays in core** (`site-exporter.ts:42, 616`).
- `contracts/core/public-page-security-headers.ts`: the one header set. Generic, stays.

**Dead spike**
- `features/plugins/deploy/deploy-plugin.ts`: "SPIKE ... NOT wired" (header :2-5), a second Vercel implementation with its own `DeployTarget` union :28, `TOVU_DEPLOY_TOKEN_*` :73-75, `api.vercel.com` :148. It has no importer; only comments in `lipay/*` and `supabase-mcp` cite it. Delete it in this job.

**Admin UI (`apps/admin/src/`)**
- `features/deployment/rules.ts:144-157` (`PUBLISH_CLI_TOOLS` gh/vercel), `:251-254` target list, `:305+` `PUBLISH_CREDENTIAL_PROVIDERS` (token page URLs, scope guidance).
- `features/deployment/StaticSiteTab.tsx:1282-1342` per-target config fields.
- `features/deployment/hooks/use-static-publish.hooks.ts:143-155` per-target config builder.
- `features/security/rules.ts:225-226` vendor labels.
- `lib/api.ts:608-611, 662, 738` closed unions of target/provider ids.

**Tests that encode vendor ids** (they move or become registry-driven with their slice): `static-publish/__tests__/{adapter,credentials,verify,publish-history,publish-run,s3-compatible-target}`, `deployments/__tests__/publish-agent-tools.unit.test.ts` (118 hits), `publish-credentials/__tests__/*`, `vendor-credentials/__tests__/*`, `server/__tests__/routes/{publish-site,publish-credentials,vendor-credentials}-route.test.ts`, `platform/db/repos/__tests__/{publish-credential-repo,vendor-credential-repo,publish-content-repos.dialects}`, `platform/db/sqlite/__tests__/publish-history-repo.sqlite.test.ts`, `assistant/__tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts`, admin `deployment/__tests__/*`, `deployment/hooks/__tests__/*`, `security/__tests__/*`, `lib/__tests__/api-*`. `features/plugins/deploy/__tests__/*` is deleted with the spike.

**Out of scope (different actor: the operator self-hosting Tovu itself, not a site owner publishing a static site).** Leave these alone and see Q2: `deployments/deploy-config-{fly,railway,render}.ts`, `publish-trust/provisioning.fly-toml.ts`, the existing `content/agent-plugins/tovu-deploy-fly/`, and `deployments/providers/github.ts` (GitHub App CI deployment runs, a source-control/CI concern).

### 1c. Existing agent-plugin shape (the precedent)
Every plugin under `content/agent-plugins/<id>/` today is `plugin.json` + `mcp.json` + `skills/<id>/SKILL.md` +
`references/*.md`. **No plugin ships executable code yet.** The only code-execution path, a `stdio` MCP server, is
parsed (`agent-plugins/manifest.ts:164-178`) but deliberately never auto-wired: `federate-mcp.ts:206-207` skips it,
and `capability-projection.ts:72` classifies it as `requires-confirmation`. Bundled plugins are content-addressed
under `packages/sha256/<digest>/`, and `bundled-digests.ts` records which digest Tovu itself shipped. That ledger is
the trust anchor this plan reuses. Prod `build:server` copies `content/agent-plugins/` verbatim (no compile step).

## 2. Target architecture

```
content/agent-plugins/deploy/                      <- ALL vendor knowledge + code
  plugin.json, mcp.json ({} - no MCP server)
  tovu-deploy-targets.json                         <- descriptor list (id, label, module, credential fields, config fields, env aliases, docs links)
  targets/netlify.js  vercel.js  cloudflare-pages.js  github-pages.js  s3-compatible.js   (ESM, zero npm imports; node: builtins + host kit only)
  skills/deploy/SKILL.md                           <- how an agent picks a host, gets a token, publishes, recovers
  skills/deploy/references/{choosing-a-host,github-pages,vercel,netlify,cloudflare-pages,s3-buckets,failure-modes}.md
  tests/*.test.ts                                  <- ported Jini vendor tests + Tovu per-vendor tests

apps/website (host) - generic only, zero vendor ids
  features/deployments/deploy-targets/             <- NEW generic capability: load descriptors from enabled trusted plugins, registry, host kit
  static-publish/*, publish-credentials/*, publish-agent-tools.ts, admin routes   <- read the registry; ids are opaque strings
apps/admin - renders target list + credential/config forms from GET /system/publish-targets descriptors

@jini-ai/devops/deploy - generic port only: DeployTarget, DeployFile, DeployPublishInput(+responseHeaders), DeployError,
  reachability, redirect guard, naming, DeployTargetToken, deploy.publish tool
```

### Pattern evaluation

| Candidate | Fit | Verdict |
|---|---|---|
| **A. Plugin ships target modules and a descriptor; the host loads them in-process through a generic "deploy target provider" registry** | Files stay in-process (no MB-size tool arguments). Credentials never cross a process boundary. Reuses the existing confirmation card and sealed store. Adding a host means adding one file to the plugin. | **Chosen** |
| B. Plugin ships a `stdio` MCP server that does the uploads | Whole-site file sets would travel as MCP arguments (or as a path, which weakens sandboxing). Sealed tokens would have to be handed to a child process. `stdio` from plugins is deliberately not auto-wired today. | Runner-up. Revisit if untrusted third-party hosts are ever wanted (process isolation). |
| C. Use vendors' own remote MCP servers (the Supabase/Composio precedent) | No vendor MCP does "direct-upload this exact file set" for all five hosts, and S3 has none. | Rejected |
| D. Keep the vendor code, but in a separate Jini package `@jini-ai/deploy-targets` | Still vendor code in Jini, and an agent cannot reason with it. The owner asked for a plugin. | Rejected |

## 3. The generic host contract (Tovu `features/deployments/deploy-targets/`)

**Descriptor** (`tovu-deploy-targets.json`, data only, so it can be listed without loading code):
```ts
interface DeployTargetDescriptor {
  id: string;                       // "netlify" ... byte-identical to today's ids (AAD, history rows)
  label: string; module: string;    // "targets/netlify.js", relative to the plugin root; must stay inside it
  credential: { vendorId: string; fields: FieldSpec[]; tokenPageUrl?: string; scopeHelp?: string; envAliases?: string[] };
  config: { fields: FieldSpec[] };  // e.g. github-pages owner/repo/branch, vercel teamId; JSON-schema-like
}
```
**Module contract** (default export):
```ts
interface DeployTargetModule {
  validateConfig(config: JsonObject): string | null;
  basePath(config: JsonObject): string | undefined;           // replaces computeBasePath's github-pages branch
  summarize(config: JsonObject): { label: string; value: string }[]; // confirmation-card rows
  create(ctx: { credential: ResolvedCredential; config: JsonObject; kit: DeployHostKit }): DeployTarget; // Jini's port
  verifyCredential(ctx: { credential: ResolvedCredential; kit: DeployHostKit }): Promise<{ ok: boolean; accountLabel?: string; reason?: string }>;
}
interface DeployHostKit {   // host-injected; plugin has no npm imports, so nothing to resolve from packages/sha256/<digest>/
  fetch: typeof fetch;      // Tovu's guarded outbound fetch (timeout + redirect guard applied by the host)
  checkDeploymentUrl; waitForReachableDeploymentUrl; normalizeDeploymentUrl; safeDnsLabel; safeProjectLabel; DeployError;
}
```
**Security headers become a generic input, not a vendor table.** `DeployPublishInput` gains
`responseHeaders?: Readonly<Record<string,string>>` (Jini, additive). Tovu passes `PUBLIC_PAGE_SECURITY_HEADERS`
to every target. Each target renders them into its own format: Netlify/Cloudflare write `_headers` (Cloudflare as a
form field, per 0.3.2), Vercel writes `vercel.json`, and GitHub Pages/S3 ignore them (the HTML `<meta>` from
`withSecurityMeta` still covers Referrer-Policy). GitHub Pages adds its own `.nojekyll`. This absorbs
`SECURITY_HEADER_FILES`, `NOJEKYLL_FILE`, `renderHeadersFile` and `renderVercelConfig`.

**Trust/loading rule (fail closed).** The registry loads a module only when the plugin is enabled **and** its
installed digest is the one `bundled-digests.ts` records for a Tovu-shipped plugin. Any other plugin is listed as
"needs operator confirmation" (same class as `stdio`, `capability-projection.ts:72`) and not loaded (see Q5). A
`module` path that escapes the plugin root is refused. A plugin that fails to load drops only its targets.

**How core consumes it:**
- `StaticPublishTargetId`/`PublishProviderId` become `string`, validated against the registry at every entry point: route parsers, agent tools, store.
- Per-vendor `*PublishConfig`/`*ConnectionInput` unions become `{ target: string; config: JsonObject }`/`{ providerId; fields }`, checked by the descriptor's field specs plus `validateConfig`.
- The `VendorId`/`PUBLISH_PROVIDER_TO_VENDOR` entries for deploy hosts come from `descriptor.credential.vendorId`. github/gitlab/bitbucket stay (source control, out of scope).

## 4. How an agent uses it
- **Tools stay host-generic** and keep their names: `deployment_get_static_publish_capabilities`, `deployment_preview_static_publish`, `deployment_execute_static_publish`, `deployment_propose_custom_provider_credential`. Their `target` enum and parameter help are built from the registry, and `get_static_publish_capabilities` returns each descriptor's config/credential fields. `deployment_generate_bucket_hosting_setup`'s S3 knowledge moves into `references/s3-buckets.md` (and the descriptor's field help). The tool either becomes generic ("host setup steps", from descriptor docs) or is deleted (§7, slice T6).
- **Approvals unchanged:** `deployment_execute_static_publish` stays `mutates-durable-state` behind the existing MCP-UI confirmation card (`publish-agent-tools.ts:601-640`). Card rows come from `module.summarize(config)` instead of the github-pages branch. The sealed credential is saved only through the existing propose-credential card. Deny-by-default `deploy.publish` in Jini is untouched.
- **The skill** (`skills/deploy/SKILL.md`) teaches: pick a host from what the person has (free/no account → GitHub Pages; custom domain → Cloudflare Pages; "my Vercel/Netlify" → that; own bucket → S3), where to get the token and which scopes, always preview before executing, and plain-language failure recovery (the Supabase/Higgsfield `failure-modes.md` pattern). Adding a host means adding a descriptor entry, a module, a reference page, and tests, all inside the plugin.

## 5. What moves / what stays in `@jini-ai/devops`

- **Stays:** `types.ts` (plus `responseHeaders`), `naming.ts`, `reachability.ts`, `redirect-guard.ts`, `tokens.ts`, `tool.ts`, and their tests. Strip vendor names from prose and from `tool.ts:130`'s runtime description. Add a guard test: no vendor host name anywhere under `packages/devops/src` (RED first).
- **Moves to the Tovu plugin:** `vercel.ts`, `netlify.ts`, `cloudflare-pages.ts` (0.3.2 version), `github-pages.ts`, and their 4 test files. Each is rewritten to take `DeployHostKit` instead of importing `@jini-ai/platform`/siblings. The logic stays the same, only the import surface changes.
- **Deleted from Jini:** nothing else. `DeployTargetToken` and `deploy.publish` remain the generic Jini seam.

**Semver.** Removing exported classes and constants (`VercelDeployTarget`, `NETLIFY_TARGET_ID`, `CLOUDFLARE_PAGES_*`,
`isVercelProtectedResponse`, ...) is breaking. Under 0.x that means **0.4.0**, which Tovu's `^0.3.1` will not pick up
by accident. The additive `responseHeaders` field can ship as **0.3.3** (or ride in 0.3.2 if the release has not
been cut yet; see Q6). The release gate is published typecheck plus Docker build only.

## 6. Migration slices (each small, independently committable, RED test first)

| # | Repo | Slice | RED test first | Depends |
|---|---|---|---|---|
| R0 | Jini | **Release devops 0.3.2 as-is** (CF `_headers` fix). | n/a (already tested) | none |
| J1 | Jini | Add `DeployPublishInput.responseHeaders` (type + doc). Additive → 0.3.3. | type-level test that a target receives it | R0 |
| T1 | Tovu | `deploy-targets/` registry + descriptor parser + trust rule + `DeployHostKit`, with a fixture plugin in tests only. No product path uses it yet. | registry refuses a non-bundled digest; refuses `module: "../x.js"`; lists a bundled fixture target | J1 |
| T2 | Tovu | Plugin skeleton `content/agent-plugins/deploy/` (plugin.json, mcp.json `{}`, SKILL.md, references) + **Netlify** module ported (smallest). The static-publish adapter takes the registry path for any id the registry knows and keeps the old branches for the rest (strangler). | netlify publish via registry with fake fetch sends `_headers` rendered from `responseHeaders`, and the adapter no longer adds one | T1 |
| T3 | Tovu | Cloudflare Pages module (from 0.3.2 source: `_headers`/`_redirects` as form fields). | `_headers` never uploaded as a public asset; sent as form field | T2 |
| T4 | Tovu | Vercel module (+ protected-response detector). | `vercel.json` rendered from `responseHeaders` | T2 |
| T5 | Tovu | GitHub Pages module (`.nojekyll`, `basePath`, owner/repo/branch validation, `summarize`). | base path `/<repo>` comes from the module; `.nojekyll` present | T2 |
| T6 | Tovu | S3-compatible: move `s3-compatible-target.ts` + field guidance into the plugin; bucket-setup knowledge into references. Decide the fate of `deployment_generate_bucket_hosting_setup` (generic or delete). | same S3 unit tests, now against the plugin module | T2 |
| T7 | Tovu | Open the ids: routes, agent tools, credential store, vendor-credential map and admin UI read descriptors (`GET /system/publish-targets`). `verify.ts` probes and `credentials.ts` env aliases come from modules/descriptors. | boundary test: no deploy-vendor id/host string in `features/deployments/**`, `site-export/**`, `vendor-credentials/**`, admin `features/deployment/**` (comments stripped). This is the RED that proves the absorption. | T3-T6 |
| T8 | Tovu | Delete the absorbed paths: `SECURITY_HEADER_FILES`, `NOJEKYLL_FILE`, `renderHeadersFile`/`renderVercelConfig`, per-vendor builders/validators, `ENV_VAR_ALIASES_BY_TARGET`, the `features/plugins/deploy/` spike, the `gh`/`vercel` CLI probe (per Q4). Remove Tovu's last import of any vendor symbol from `@jini-ai/devops`. | T7 boundary test stays green; `rg "VercelDeployTarget|NetlifyDeployTarget|CloudflarePagesDeployTarget|GitHubPagesDeployTarget" apps` = 0 | T7 |
| J2 | Jini | Remove the 4 vendor files + tests, barrel, README/source-map; neutral `tool.ts:130` text; no-vendor guard test. **Publish 0.4.0.** | guard test "no vendor host names in packages/devops/src" | T8 |
| T9 | Tovu | Bump `@jini-ai/devops` to `^0.4.0`; published typecheck + Docker build. | release gate | J2 |

T3-T6 can run in parallel after T2 (separate files). T7 is the one wide slice. Split it by surface if needed (routes /
agent tools / credential store / admin UI), each with its own part of the boundary test. Every slice is reversible:
until T8 the old branches still exist behind the registry check.

## 7. Risks
1. **In-process plugin code is arbitrary code execution.** Mitigation: load only from Tovu-bundled digests (ledger), fail closed, and refuse module paths that escape the plugin root. Residual: a trusted module could still call global `fetch` instead of the kit's guarded one. Accepted for first-party code. Process isolation (candidate B) is the upgrade path.
2. **Sealed-credential AAD is bound to `provider_id`.** Ids must stay byte-identical (`github-pages`, `cloudflare-pages`, ...). Add a test that each descriptor id equals the legacy id.
3. **Losing compile-time exhaustiveness** when unions become strings. The registry validates at every entry point, and T7's route tests cover unknown ids (the exact error text is asserted).
4. **Packaging/load paths.** Plugins run from `packages/sha256/<digest>/` under the site dir. Dynamic `import()` must work there in dev (tsx), in the prod `dist` copy, and in the desktop app (asar, userData). This must be verified in T2 on all three before T3+. Code format matters here (Q3).
5. **Digest churn.** Every plugin edit is a new digest. `bundled-digests.ts` already resolves this for bundled plugins.
6. **Cross-repo ordering.** If J2 ships before T8, Tovu's build breaks only after a manual `^0.4.0` bump (caret protects it). Keep J2 strictly after T8.
7. **Test port volume.** About 5k lines of Jini vendor tests move. Port them (don't re-author) and check coverage parity per file.

## 8. Open questions for the owner (plain words)

- **Q1. One "deploy" plugin for all hosts, or one plugin per host?**
  - What: one plugin holding Netlify, Vercel, Cloudflare, GitHub Pages and S3, or five small plugins.
  - Why: one plugin lets the agent compare hosts and pick one. Five plugins let people switch hosts on and off separately.
  - Effect: I recommend one plugin. Adding a host means adding a file inside it.
- **Q2. Should the existing "deploy Tovu itself to fly.io" plugin and the fly/railway/render config generator fold into this later?**
  - What: that code puts Tovu itself on a server. It does not publish a site.
  - Why: it is a different job, but it is also "hosting vendor" code.
  - Effect: I recommend leaving it separate for now and doing it as a follow-up.
- **Q3. Plugin code in plain JavaScript (no build step), or TypeScript (needs a build step)?**
  - Why: plugins are copied as-is into every install. Plain JS runs everywhere unchanged, and type checks still work through comments. TypeScript needs compiling for prod and desktop.
  - Effect: I recommend plain JS with type-checking comments.
- **Q4. The admin panel's "is the gh / vercel command installed on the server" check: delete it, or move it into the plugin?**
  - Effect: I recommend deleting it (it names vendors in core and adds little).
- **Q5. Can plugins not shipped by Tovu add new hosts?**
  - Why: that means running their code inside Tovu.
  - Effect: I recommend Tovu-shipped only for the first version. Others are shown as "needs your OK" and not run.
- **Q6. Does Jini lose its built-in Netlify/Vercel/Cloudflare/GitHub Pages deploy code entirely?**
  - Why: I found no other user of it. The package is public, though, so an outside user could break (0.x version bump signals this).
  - Effect: I recommend yes. Also, if 0.3.2 is not cut yet, the small header field (J1) could ride in it and save a release.

## 9. Architect records
- Constitution / governance check: not run as a full pipeline (no approved spec). This is a plan report per dispatch. An ADR is warranted at T1 (new cross-cutting generic capability: plugin-provided code modules with a trust rule). Candidate for governance promotion: "hosting-vendor code lives only in agent plugins; core and Jini expose ports only".
- Implementation outline: needed for T1 (public contract: descriptor, module, kit).
- Critical Internal Constraints: candidate unit is the T1 loader trust rule (ESCALATE_SECURITY: loads only a bundled digest, and never a path outside the plugin root).

## 10. Owner decisions 2026-09-29 (override §2-§8 where they differ)

1. **The deploy agent plugin lives in Tovu** (`content/agent-plugins/deploy/`). `@jini-ai/devops` keeps only the
   generic contract. Vendor host implementations are **dependency-injected**: Tovu (via the plugin registry)
   constructs each host's `DeployTarget` and passes it in; devops names no vendor.
2. **One plugin for all hosts** (Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3-compatible). Answers Q1.
3. **Merge the existing `tovu-deploy-fly` plugin into this one plugin.** Reverses Q2 / §1b "out of scope". Scheduled
   as its own later slice (T10 below), after the static hosts are absorbed.
4. **Plugin code is plain JS** (ESM, JSDoc types, no build step). Answers Q3.
5. **Delete the "gh / vercel CLI installed on server" check** (`deployment-overview.ts` `DEPLOY_CLI_NAMES`,
   admin `PUBLISH_CLI_TOOLS`). Answers Q4; lands in T8.
6. **Only Tovu-bundled plugins may add hosts for now** (third-party later). Answers Q5: the registry loads a module
   only when the plugin's installed digest is the one `bundled-digests.json` records for it.

### DI shape for `@jini-ai/devops` (replaces §3's "host kit" location)
- Jini keeps: `DeployTarget` port, `DeployFile`, `DeployPublishInput` (+ `responseHeaders`, J1), `DeployPublishResult`,
  `DeployError`, reachability, redirect guard, naming, `DeployTargetToken`, `deploy.publish`.
- **J1b (new, additive):** export the injection contract so any host can supply vendor targets without devops naming
  one: `DeployHostKit` (fetch-with-timeout, timeouts, sleep, reachability + naming helpers, `DeployError`) and
  `DeployTargetModule` (`create({ credential, config, kit }) -> DeployTarget`, optional `validateConfig`, `basePath`,
  `summarize`, `verifyCredential`). Until J1/J1b ship, Tovu declares both types locally in
  `apps/website/src/features/deployments/deploy-targets/types.ts` (identical shape) and builds the kit itself from
  devops' generic exports plus its own `AbortSignal.timeout` fetch (Tovu does not depend on `@jini-ai/platform`).
- Tovu binds plugin-created targets into devops (today: passed straight to the static-publish adapter; later, if
  wanted, `bindMany(DeployTargetToken, ...)`), which is the "injected" direction the owner asked for.

### Adjusted slice list
| # | Repo | Slice | Status |
|---|---|---|---|
| R0 | Jini | Release devops 0.3.2 (CF `_headers` fix, `28f67f9a`) | release agent, in progress |
| J1 | Jini | `DeployPublishInput.responseHeaders` (additive) | needed; Tovu uses a local widened type meanwhile |
| J1b | Jini | Export `DeployHostKit` + `DeployTargetModule` injection contract (additive) | needed; Tovu local copy meanwhile |
| T1 | Tovu | Generic plugin-host registry + bundled-digest gate + module-path containment | this build |
| T2 | Tovu | Plugin skeleton + Netlify module; adapter strangler (registry first, legacy fallback) | this build |
| T3 | Tovu | Cloudflare Pages module (port from devops **0.3.2** source, commit `28f67f9a`) | |
| T4 | Tovu | Vercel module | |
| T5 | Tovu | GitHub Pages module | |
| T6 | Tovu | S3-compatible module | |
| T7 | Tovu | Open the ids (routes, tools, store, admin UI from descriptors) + boundary test | |
| T8 | Tovu | Delete absorbed paths **and the gh/vercel CLI check** (decision 5) | |
| T10 | Tovu | **Merge `tovu-deploy-fly` into `deploy`** (skill + templates move under `skills/deploy/`; plugin id `tovu-deploy-fly` retired; `deploy-config-{fly,railway,render}.ts` and `provisioning.fly-toml.ts` reviewed for the same move) | new |
| J2 | Jini | Remove vendor files, publish 0.4.0 | after T8 |
| T9 | Tovu | Bump to `^0.4.0` | after J2 |

Note for T7/T8: bundled plugins seed **disabled**. While the strangler keeps legacy branches, a disabled `deploy`
plugin simply falls back to them. Before T8 deletes the legacy branches, decide whether `deploy` seeds enabled
or whether publish surfaces "turn on the deploy plugin" (owner call).
