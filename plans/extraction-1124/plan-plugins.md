PLAN r62t-plan-plugins PARTIAL: 6 files MOVE / 37 STAYS-HOST / 16 sheets

The six planner areas contain **124 production TypeScript files** at these refs. Six have whole-file move sheets, 37 stay in Tovu, and 81 are **NOT-PLANNED** for execution. Two files that stay have exact symbol-level extraction sheets. Of the 16 sheets, **6 are Sol and 10 are OPUS-CLOUD**. The cloud sheets are separate work, not Sol prerequisites.

Verified against Tovu `caa3ac7811f3ca15afb782ef0c4823f2d2cd5f8f` and Jini `dc2349f5194b8fcc2994e5c50936946f8229fab3`. Used the 18:20 planner inventory, P9K §2, `k-work.json`, and the wave-5 decisions. The current refs take precedence over the older recipes where a neutral implementation has already landed. No files changed, and no tests, builds, installs, or type-checks ran.

## Inventory

Source names are relative to `apps/website/src/features/<area>/`. Destination names are relative to the Jini directory shown for that area. Append `.ts` to both columns unless shown. `=` preserves the relative path. A `—` means no Jini destination for the file.

**M** means MOVE with numbered sheets. **H** means STAYS-HOST. **N** means the planner’s MOVE candidate is NOT-PLANNED and must not be edited from this plan. **N/C** adds an OPUS-CLOUD hold. A destination on an N row records the planner’s proposal, not permission to create or overwrite that file.

### agent-plugins → `packages/agent-plugins/src/site/`

| File | Disposition | Jini destination | Blocking dependency or reason |
|---|---|---|---|
| `access-token-tool` | N/C | `=` | Credential copy, card ports, platform, token handling |
| `activation-effects` | H | — | The Tovu binding shares the lifecycle activation queue. The Jini revision reader already exists. |
| `admin-surfaces/issued-sign-ins` | N/C | `=` | Hosted-sign-in link copy and issuance |
| `admin-surfaces/public-config` | H | — | Product allowlist over the process environment. Jini’s neutral factory already exists. |
| `admin-surfaces/surfaces` | N/C | `=` | Lifecycle and trusted surface admission |
| `apply-connect-defaults` | N/C | `=` | Enable-access and default grants |
| `apply-tool-renames` | H | — | Binds the installed-plugin reader, roster notification and audit actor. Neutral logic is already in Jini `connect`. |
| `automatic-agent-plugins` | N/C | `=` | Host chat-delete grant policy |
| `bundled-catalog` | H | — | Product bundle selection, seed and retirement policy, host maturity list, and build-time import-free contract |
| `bundled-contribution-sources` | H | — | Injects the Tovu retirement table into the existing Jini selector |
| `bundled-id-upgrade` | H | — | Tovu-owned upgrade roster and maintenance binding. Do not replace Jini’s existing upgrade engine. |
| `card-host-bindings` | H | — | Agreed host credential-card binding |
| `connect-card-ui` | H | — | Agreed host card/copy wiring |
| `connect-destination` | N/C | `=` | Credential-card host binding |
| `connect-sign-in-wait` | N/C | `=` | Credential-card and browser sign-in collaborators |
| `connect-tool` | N/C | `=` | Integrations implementation edge and OAuth/token ports |
| `customize-tool` | H | — | Tovu tool definition, permission and product examples. Archive preparation is already in Jini. |
| `enable-access` | N/C | `=` | MCP host binding and access policy |
| `executable-tools/approval` | N/C | `=` | Host approval binding |
| `executable-tools/approval-bindings` | H | — | Agreed host approval policy |
| `executable-tools/host-bindings` | N/C | `=` | Approval binding and plugin/integrations implementations |
| `executable-tools/register` | N/C | `=` | Executable-tool trust boundary and host bindings |
| `exports/diagnostics` | N/C | `=` | Export-source types and authenticated, redacted diagnostics |
| `exports/runtime` | N/C | `=` | CMS marker adapter, member sign-in, consent and security-header policy |
| `exports/source` | N/C | `=` | Lifecycle, trusted package identity and contained reads |
| `federate-mcp` | N/C | `=` | MCP host binding and roster admission |
| `grant-signed-in-defaults` | N/C | `=` | Enable-access and signed-in grants |
| `host-overlays-dir` | H | — | Agreed Tovu overlay location |
| `host-tool-ports` | H | — | Binds host frontmatter, layout, memory, permissions and the host maturity list |
| `import-access-token` | N/C | `=` | Access-token tool and credential import |
| `install-tool` | N/C | `=` | CMS authorization and plugin install |
| `install-upload` | N/C | `=` | Host redaction and archive admission |
| `layout` | N/C | `=` | Per-workspace containment, storage layout and `TOVU_AGENT_PLUGINS_DIR` |
| `lifecycle` | N/C | `=` | Host overlays, node/platform adapters, trusted loader and shared activation policy. Requires a split, not a move of `createTovuAgentPluginLifecycle` as-is. |
| `mail-adapter-registry` | N/C | `=` | Platform mail ABI, credential setup parser and trusted source loader |
| `mcp-host-bindings` | N/C | `=` | MCP and OAuth implementations |
| `memory-tools` | N/C | `=` | Host assistant-tool approval policy |
| `memory` | N/C | `=` | Redaction, platform and contained filesystem reads/writes |
| `new-site-agent-plugin-tokens` | N/C | `=` | Lifecycle and token provisioning |
| `provider-plugin-link` | H | — | Host activation queue, warning sink, and product refusal copy over the existing Jini engine |
| `search-provider-registry` | N/C | `=` | Search contribution definition and in-process trusted loader |
| `set-enabled` | N/C | `=` | Lifecycle policy and post-enable effects |
| `soon-lock` | M | `=` | **AP-01** injects the host maturity list. No lifecycle owner moves. |
| `switch-on-saved-token` | N/C | `=` | Token and MCP host bindings |
| `token-sign-in` | N/C | `=` | Access-token tool and credential port |
| `tool-registrations` | N/C | `=` | Host overlays, CMS authorization and tool catalog composition |
| `uninstall-confirmation-ui` | N/C | `=` | Held-open destructive confirmation and shared redemption ID |
| `update-effects` | N/C | `=` | Federation and activation/write effects |
| `write-note-tool` | N/C | `=` | CMS authorization and memory write port |

### plugin-runtime → `packages/plugins/src/runtime/`

| File | Disposition | Jini destination | Blocking dependency or reason |
|---|---|---|---|
| `agent-plugin-tool-binding` | N/C | `=` | Agent Plugins implementation and tool admission |
| `built-ins/content-analyzer/analyze-content` | M/C | `packages/cms/src/seo/content-analysis/site-analyze-content.ts` | Both scorer and slug rule are CMS implementations. Keeping them in CMS avoids a new plugins → CMS edge. **PR-02** |
| `built-ins/content-analyzer/index` | H | — | Product manifest and compiled-in worker location. Retain the no-in-process-import rule. |
| `built-ins/content-analyzer/plugin` | N/C | `=` | `@tovu/sdk` ABI, CMS scorer and trusted worker imports |
| `built-ins/word-count/index` | H + split | `built-ins/word-count/count-words.ts` for `countWords` only | Product manifest, SDK and source location stay. **PR-01** |
| `capability-tool-registrations` | N/C | `=` | SDK/CMS and capability authorization |
| `declarative-content-types` | H | — | Binds the CMS vocabulary and `ext.site` ownership to the existing Jini provisioner |
| `host-binding` | N/C | `=` | Host invocation deps, SDK and runtime policy |
| `host-tool-binding` | N/C | `=` | MCP/CMS ports and tool authorization |
| `install-archive` | N/C | `=` | Agent Plugins archive implementation and validation |
| `install-source` | N/C | `=` | Headless install types, filesystem and bounded owner/run attachment reads |
| `install-tool` | N/C | `=` | Host signals and install authorization |
| `install-tool-binding` | N/C | `=` | Host install policy and execution wiring |
| `install` | H | — | Tovu env and desktop/hosted policy over `createPluginSourcePolicy` |
| `invocation-core-deps` | H | — | Agreed host composition |
| `plugin-host-copy` | H | — | Tovu text, schemas and tool names. The same-named Jini module is the neutral contract. |
| `provider-status-tool` | N/C | `=` | Agent Plugins and provider account state |
| `repo.sqlite` | H | — | Adapts the site kernel and table to Jini’s existing SQL owner |
| `sdk-resolver` | H | — | Host resolves its own SDK. Jini already requires `sdkModulePath` and `sdkSpecifiers`. See the cloud hold below. |
| `service-ports` | H | — | Host `HostSignals` adapter. The existing Jini entry owns different ports. |
| `source-tools` | N/C | `=` | Registration and install-source authorization |
| `tool-registrations` | N/C | `=` | Host tool bindings and lifecycle routing |
| `widget-partials` | N/C | `=` | CMS renderer/validator, activation check and Tovu theme defaults |

### external-mcp → `packages/mcp/src/external/`

| File | Disposition | Jini destination | Blocking dependency or reason |
|---|---|---|---|
| `contracts` | H | — | Two host specializations over existing core contracts, not a neutral contract owner |
| `deps` | M/C | `packages/core/src/contracts/site/external-mcp-tool-deps.ts` | Shared, type-only consumer contract. Core already owns the two imports reported as integrations edges. **XM-01** |
| `external-mcp-host-copy` | H | — | Product text, rate-limit profile, redacting log sink and probe wiring. Do not overwrite the Jini contract. |
| `external-mcp-oauth` | N/C | `=` | Endpoint safeguards, OAuth, owner storage and refusal copy |
| `external-mcp-repo` | N/C | `=` | Content kernel/schema and DB adapter edge |
| `external-mcp-repo.sqlite` | H | — | Host SQLite/kernel constructor adapter |
| `external-mcp-repo.writes` | N/C | `=` | Content kernel, DB and persisted revision/writes |
| `external-mcp-revocation` | H | — | Tovu no-retry copy and error code. Jini already owns the decision and base error. |
| `external-mcp-store` | N/C | `=` | Token hint, integrations store, platform crypto and credential views |
| `external-mcp-store.memory` | H | — | Agreed host binding |
| `external-mcp-vault` | N/C | `=` | Vault kind/scope and sealer/repo collaborators |
| `tool-registrations` | N/C | `=` | Assistant MCP services, credential copy, UI/card creation, CMS and daemon ports |

### api-connections → `packages/integrations/src/api-connections/`

| File | Disposition | Jini destination | Blocking dependency or reason |
|---|---|---|---|
| `browser-binding` | H | — | Tovu cookie names, paths and OAuth binding |
| `bundled-client-namespace` | M/C | `=` | Inject the manifest projection and move the shared callback type to core. **AC-01** |
| `byo-client` | H | — | Custom-credential ownership, origin projection and Tovu refusal copy. Jini’s generic file already exists. |
| `connect-bindings` | H | — | Host browser link and refusal inputs |
| `connect` | H | — | Binds host sign-in links/messages to existing Jini functions. Do not overwrite Jini `connect.ts`. |
| `contribution` | N/C + split | `=` for any future body move. `ClientNamespaceFor` goes to core in **AC-01**. | Trusted contribution loader, callback rules and Tovu namespace |
| `host-bindings` | H | — | Host OAuth HTTP, runtime/environment and Agent Plugins collaborators |
| `host` | H | — | Composes Tovu’s ports over the existing Jini host |
| `oauth-bindings` | H | — | Agreed host protocol binding |
| `plugin-state` | N/C | `=` | Agent Plugins state implementation and credential ownership |
| `plugin-state-bindings` | N/C | `=` | Vault metadata and platform |
| `shared-owner` | N/C | `=` | Owner/site vault metadata, crypto and shared owner storage |
| `surface-connection-bindings` | N/C | `=` | Agent Plugins surface operations |
| `surface-connections` | N/C | `=` | Agent Plugins surface identity and connection ownership |
| `vault-stores` | N/C | `=` | Vault kinds, metadata, crypto and persisted owners |

### custom-credentials → `packages/integrations/src/custom-credentials/`

| File | Disposition | Jini destination | Blocking dependency or reason |
|---|---|---|---|
| `agent-tools` | N/C | `=` | Host write-files validation. Existing Jini file is not a destination for wholesale replacement. |
| `credential-copy-tool` | N/C | `=` | Host card identity, UI/daemon approval and user-management |
| `credential-save-tool` | N/C | `=` | Agent Plugins and credential writes |
| `credentialed-request` | N/C | `=` | Host outbound HTTP, audit and credential policy. Same-name Jini binder already exists. |
| `custom-credential-repo` | N/C | `=` | Content kernel and DB adapter edge |
| `delete-request-confirmation-ui` | N/C | `=` | Destructive confirmation and redemption |
| `index` | N/C | No Jini barrel | Repoint to actual owners, then delete when the credential moves land. Do not copy the aggregate as a shell. |
| `plugin-credential-card` | N/C | `=` | Credential-token transport and Agent Plugins |
| `publish-compatibility-port` | M | `packages/core/src/contracts/site/custom-credential-publish-compatibility.ts` | Cross-domain type-only K4 seam. **CC-01** |
| `repo.memory` | N/C | `=` | Platform credential repository implementation |
| `store` | N/C | `=` | Tovu credential sets and site/project policy |
| `tool-registrations` | N/C | `=` | Credential/card/HTTP/approval and source-control collaborators |
| `tovu-credential-card-identity` | H | — | Agreed host identity binding |
| `tovu-credential-sets` | H | — | Product credential policy and conflict handling |
| `types` | N/C | `=` | Not type-only. It also owns the credential origin allowlist projection. |
| `vault-repo` | N/C | `=` | Host credential-set policy and user-management |
| `write-files-validation` | N/C | `=` | DevOps implementation and path authorization |

### project-keys → `packages/user-management/src/project-keys/`

| File | Disposition | Jini destination | Blocking dependency or reason |
|---|---|---|---|
| `attached-vault` | N/C | `=` | Attachment contract and credential visibility |
| `attachments` | H + split | `packages/core/src/contracts/site/project-key-attachments.ts` for the two types only | Host SQL, `@jini-ai/db` and the project schema stay. **PK-01** |
| `create-vault` | N/C | `=` | Host conflict class and owner/view replacement transaction |
| `service` | N/C | `=` | Provider usage contracts, attachment/visibility policy and grant handling |
| `shared-oauth-disconnect` | N/C | `=` | Integrations implementation, shared-owner storage and destructive transaction |
| `site-references` | N/C | `=` | Platform vault metadata and site-owned references |
| `site-sealer` | M/C | `=` | Core crypto ports, injected product identity and refusal copy. **PK-02** |
| `tools` | N/C | `=` | Host approval/restart, sensitive key access and catalog policy |

## Prerequisites and execution rules

- **K4 first.** CC-01 and XM-01 establish their core contracts before deleting host sources. AC-01 establishes `ClientNamespaceFor` in core before its reader imports it. PK-01 establishes `KeyAttachments` and `ProjectKeyTransaction` before any later project-key body extraction. Copy exact existing optionality. Do not move SQL, credential implementations, or global `RouteDeps` into core.
- **K5 at the existing call site.** AP-01 gets the host maturity set from Tovu’s bundled catalog. AC-01 gets a reader and metadata projection from Tovu’s integration composition. PK-02 gets owner scope and copy from Tovu’s provider-identity composition. PR-02 is a same-package CMS binding and introduces no cross-package implementation import. Keep existing second-argument pads.
- **K1 and K2 have no new work in these sheets.** The planner puts the matching route folders in other areas. Route-mount files listed below are importer edits only. Existing `defineJsonRoute`/raw specs, small route deps, host mount and wire tests stay intact. No screens or custom hooks move, so there are no `AdminKit` names to add and no `@jini-ai/admin` dependency changes.
- **Order for Sol** is CC-01.J → AP-01.J → PR-01.J, then CC-01.T → AP-01.T → PR-01.T. **Order for OPUS-CLOUD** is XM-01.J → AC-01.J → PK-01.J → PK-02.J → PR-02.J, then the corresponding T halves in that order. Never delete a Tovu source before its Jini entry is available on the paired tree.
- **Export notation.** For each new public `./x`, add the `package.json` export with `types: "./dist/x.d.ts"` and both `import` and `default` set to `"./dist/x.js"`. Add the stated classification to `jini.entries`. Where an existing entry suffices, change only the named export. No root-barrel repoints, new runtime dependencies, publish, or lockfile churn in these sheets.
- **Characterize first.** Add or transplant the Jini characterization tests before the moved implementation. Named mutations below are cloud verification probes, not edits to land. For a type-only sheet, red means a compile-time pin fails, not that ordinary Vitest execution notices erased types. Generate the listed `api-baseline/jini-ai__<pkg>.json` changes in cloud using `pnpm api:update`. Do not hand-invent generated baselines in Sol.
- In the importer lists, paths beginning `features/`, `server/`, `assistant/`, or `cli/` are under `apps/website/src/`. Importer entries are from fixed-string searches at the verified Tovu ref. Historical reports and frozen baseline fixture text are not repoints.

## SOL sheets

### CC-01.J — Jini | publish compatibility type

Create `packages/core/src/contracts/site/custom-credential-publish-compatibility.ts`. Use `import type { CredentialSetSummary } from "../credentials.js"`. Copy `PublishCompatibilityPort` and its comments from Tovu, replacing only the integrations `ReturnType` lookup with its resolved type.

```ts
export interface PublishCompatibilityPort {
  prepareInvalidation(
    required: { workspaceId: string },
    optional?: Record<string, never>,
  ): Promise<(required: { after: CredentialSetSummary }) => void>;
}
```

Add universal `./contracts/site/custom-credential-publish-compatibility`. Baseline is additive in `jini-ai__core.json`. Add `packages/core/src/contracts/site/__tests__/custom-credential-publish-compatibility.test.ts` with an exact type-equality pin for both arguments and for the awaited callback. **`CC-PrepareDropsPostWriteCallback`** substitutes `Promise<void>` and must fail the pin. Carry the why-comment that preparation may load dependencies before a write, while the returned callback loads nothing afterward. No implementation moves.

### CC-01.T — Tovu | direct type consumers

Delete `features/custom-credentials/publish-compatibility-port.ts`. Use `@jini-ai/core/contracts/site/custom-credential-publish-compatibility` in:

- `features/custom-credentials/tool-registrations.ts`, replacing `./publish-compatibility-port.js`.
- `features/custom-credentials/__tests__/extract-s8-c2p1-ports.type-pin.ts`, replacing `../publish-compatibility-port.js`.
- `server/routes/route-deps/credentials-deps.ts`, replacing the `PublishCompatibilityPort` import from `../../../features/custom-credentials/index.js`.

Remove the type re-export from `features/custom-credentials/index.ts`. Keep `features/deployments/publish-credentials/compatibility-port.ts` inferred and untouched. The host still supplies `bindPublishCompatibility({ source })` through `RouteDeps.publishCompatibility`. The existing `Same<ReturnType<typeof bindPublishCompatibility>, PublishCompatibilityPort>` assertion is the host characterization and must reject **`CC-PrepareDropsPostWriteCallback`**. No Tovu export or baseline change. Stop if anything proposes moving the write, invalidation implementation or credential logic in this sheet.

### AP-01.J — Jini | Soon maturity gate

Create `packages/agent-plugins/src/site/soon-lock.ts` from the Tovu file. Replace the self-package `readPluginMaturity` import with `../lifecycle/host-tools/identity.js`. Remove the bundled-catalog import. Add **required** `hostSoonPluginIds: ReadonlySet<string>` to the existing first object of `readHostPluginMaturity`, `findSoonAgentPlugin`, `assertAgentPluginReady`, and `lockSoonAgentPlugins`. Thread it into both maturity reads in `findSoonAgentPlugin` and the find call in `lockSoonAgentPlugins`. `assertAgentPluginReady` already forwards its whole required object. Replace the lookup of `HOST_SOON_AGENT_PLUGINS` with `.has` on the injected set. No default set, new policy, or change to actor, error class, public message, or fallback.

Add universal `./site/soon-lock` in isolation group `lifecycle`. Baseline adds the entry to `jini-ai__agent-plugins.json`. First add `packages/agent-plugins/src/site/__tests__/soon-lock.test.ts` with a fake catalog and activation owner. Pin manifest `untested` winning over host `soon`, a missing or unreadable manifest still consulting the host list, any installed `soon` revision being sufficient, and boot writing only for affected active IDs with `SOON_LOCK_ACTOR`. **`AP-HostListWinsOverManifest`** reverses precedence and must fail. Carry the manifest-first, any-revision, warning-only, and no-uninstall comments. Generalize the reference to the Tovu list without losing the rationale.

### AP-01.T — Tovu | wire the one host maturity list

Delete `features/agent-plugins/soon-lock.ts`. Repoint these imports to `@jini-ai/agent-plugins/site/soon-lock`. Supply `hostSoonPluginIds: HOST_SOON_AGENT_PLUGINS` on the calls identified below. Import the set from `./bundled-catalog.js` in the feature files and from `#src/features/agent-plugins/bundled-catalog` at the other production sites.

| Importer | Exact edit |
|---|---|
| `features/agent-plugins/lifecycle.ts` | Replace `./soon-lock.js`. Pass the set on the guidance maturity read and on the guarded `assertAgentPluginReady` and `findSoonAgentPlugin` calls. Do not alter catalog construction. |
| `features/agent-plugins/set-enabled.ts` | Replace `./soon-lock.js` for `assertAgentPluginReady` and pass the set. Remove the `AgentPluginNotReadyError` re-export from this module. Known readers use the error owner directly. |
| `features/agent-plugins/__tests__/unit/soon-lock.unit.test.ts` | Replace `../../soon-lock.js`. Pass the existing fixture’s Tovu set on the four maturity calls and the boot lock call. Leave lifecycle tests in Tovu. |
| `features/site-backup/import-plugin-state.ts` | Replace `#src/features/agent-plugins/soon-lock`. Pass the set to `findSoonAgentPlugin`; preserve its position in the enable condition. |
| `server/runtime/boot/bootstrap.ts` | Replace the alias. Pass the set to `lockSoonAgentPlugins` with the same catalog and activation owner. |
| `server/runtime/boot/__tests__/bootstrap-reporting.unit.test.ts` | Repoint both the dynamic `import()` and `mock.module()` specifiers, preserving namespace spread and mock behavior. |
| `server/runtime/composition/agent-plugin-service-ports.ts` | Replace the alias. Pass the set to the provider-face readiness check. Keep the same `AgentPluginNotReadyError` constructor. |
| `server/runtime/composition/modules/agent-plugins-routes.ts` | Replace the error class import only. Keep the existing `instanceof` predicate and route deps. |

Update the error re-export note in `features/agent-plugins/README.md`. Keep all host characterization cases and add an assertion, in the existing Soon suite, that the refusal from the lifecycle path is an instance of the public Jini class. **`AP-HostListWinsOverManifest`** must still fail the Tovu manifest-precedence case. No Tovu export or baseline change. Stop if the move would create a second activation owner, touch authorization, or change when a route returns its readiness refusal.

### PR-01.J — Jini | pure word count

Create `packages/plugins/src/runtime/built-ins/word-count/count-words.ts`. Transplant only `countWords` and its comments from `built-ins/word-count/index.ts`. Keep `countWords({ bodyJson }: { bodyJson: unknown }, _optional = {}): number` and the traversal verbatim. Do not import the manifest, SDK, host or Node.

Add universal `./runtime/built-ins/word-count/count-words`. Baseline adds that entry in `jini-ai__plugins.json`. First copy the nine tokenizer cases and their test helpers from Tovu’s `built-ins/word-count/__tests__/unit/word-count.unit.test.ts` into `packages/plugins/src/runtime/built-ins/word-count/__tests__/count-words.test.ts`. Import `test` from `vitest` and `countWords` from `../count-words.js`. Do not copy the manifest or loader cases. **`PR-JoinWithoutSeparator`** replaces `texts.join(" ")` with `texts.join("")` and must fail the across-node case. Carry RT-005’s separator, whitespace and malformed-node rationale.

### PR-01.T — Tovu | keep manifest and Tier-3 binding

In `features/plugin-runtime/built-ins/word-count/index.ts`, import `countWords` from `@jini-ai/plugins/runtime/built-ins/word-count/count-words` and remove the local function. Keep `WORD_COUNT_MANIFEST`, `WORD_COUNT_PLUGIN`, `WORD_COUNT_RUNTIME_SOURCE`, and the source-directory, loader and registration comments unchanged. There is no re-export.

The only other importer of `countWords` is `features/plugin-runtime/built-ins/word-count/__tests__/unit/word-count.unit.test.ts`. Remove `countWords` from its `../../index.js` import and remove the nine transplanted cases and now-unused helpers. Retain the manifest contract and runtime-source hook tests, including their static and dynamic `../../index.js` imports. All other `word-count/index` imports are manifest or runtime-source readers and stay unchanged. Add a hook assertion with two adjacent text nodes and no trailing space. It must also reject **`PR-JoinWithoutSeparator`**. No Tovu export or baseline change. Stop if the source directory, runtime entry path or SDK resolution needs to change to make this extraction work.

## OPUS-CLOUD sheets

### XM-01.J — Jini | split the tool deps contract, not the services

Create `packages/core/src/contracts/site/external-mcp-tool-deps.ts`. Move `ExternalMcpToolDeps` exactly, changing only imports and stale path references in the comments. Use `../headless/plugin-host.js` for `OperatorLocaleDeps`, `../../primitives/index.js` for `Clock`/`UUID`, `../events.js` for `AuthorizeFn`, `../vault.js` for the two crypto ports, `../hosted-mcp.js` for `ExternalMcpServerRepoPort`, and `./api-connections-hosted-mcp.js` for `ExternalMcpOAuthService`.

Keep the six named required deps `workspaceId`, `authorize`, `clock`, `externalMcpServerRepo`, `siteAssistantSecretSealer`, and `siteAssistantSecretKeyring`, plus the inherited locale shape. Preserve the four optional fields exactly:

```ts
externalMcpKnownToolNames?: (required: {
  serverId: string;
  admissionRevision: string;
}) => readonly string[] | null;
externalMcpProbe?: (required: {
  serverId: string;
}) => Promise<{ ok: boolean; body: Readonly<Record<string, unknown>> }>;
externalMcpOAuth?: ExternalMcpOAuthService;
derivedPublicOrigin?: string;
```

Add universal `./contracts/site/external-mcp-tool-deps`. Baseline is `jini-ai__core.json`. First add `packages/core/src/contracts/site/__tests__/external-mcp-tool-deps.test.ts` with a type pin for the required fields, both callback shapes, and assignability without the four optional fields. **`XM-RequireOAuthForAllTools`** makes OAuth required and must fail. Carry the narrow-consumer-versus-route-deps rationale and why OAuth is optional for this tool aggregate. Preserve the cross-process rationale without carrying stale claims about import sources.

### XM-01.T — Tovu | repoint the aggregate type

Delete `features/external-mcp/deps.ts`. Replace the old specifier with `@jini-ai/core/contracts/site/external-mcp-tool-deps` in:

- `assistant/__tests__/mcp-ui-tool-calls-route.external-mcp-save.integration.test.ts`
- `assistant/__tests__/tool-registrations.external-mcp.test.ts`
- `assistant/tool-registrations.ts`
- `features/external-mcp/__tests__/access-save.integration.test.ts`
- `features/external-mcp/__tests__/unit/static-token-setup.unit.test.ts`
- `features/external-mcp/__tests__/unit/tool-registrations.oauth-origin.unit.test.ts`
- `features/external-mcp/external-mcp-host-copy.ts` and `features/external-mcp/tool-registrations.ts`
- `server/runtime/composition/tool-catalog-manifest.ts`, both inline `import()` type references

Use type-only edits. The same host composition supplies all values, and the separate HTTP OAuth route’s required service stays required. Keep the existing no-OAuth tool fixture and make its deps literal `satisfies ExternalMcpToolDeps` before any widening cast. **`XM-RequireOAuthForAllTools`** must fail that host pin. No Tovu export or baseline change. Stop if a structural member differs or the move reaches authorization, crypto, execution or route behavior.

### AC-01.J — Jini | bundled namespace reader

Copy `ClientNamespaceFor` verbatim into `packages/core/src/contracts/site/integrations-api-connections.ts`.

```ts
export type ClientNamespaceFor =
  (input: { readonly pluginId: string }) => Promise<string | undefined>;
```

Create `packages/integrations/src/api-connections/bundled-client-namespace.ts` from Tovu. Import that type from the existing core subpath. Remove the Agent Plugins value import. Add a required field to the existing first object, leaving the `_optional` pad and result type unchanged.

```ts
required: {
  readonly pluginIds: ReadonlySet<string>;
  readonly readManifest: (input: { readonly pluginId: string }) => unknown;
  readonly readClientNamespace: (required: {
    readonly value: unknown;
  }) => string | undefined;
}
```

In the non-null branch call `required.readClientNamespace({ value: manifest })`. Preserve the allowlist check before either callback and do not add a fallback prefix or catch. Add universal `./api-connections/bundled-client-namespace`. The existing core export map stays unchanged. Baselines add the core type and integrations entry in `jini-ai__core.json` and `jini-ai__integrations.json`.

First add `packages/integrations/src/api-connections/__tests__/bundled-client-namespace.test.ts`. Pin one read/one projection for a selected fixture, no callbacks for an unselected fixture, no projection for a null manifest, and an unchanged `undefined` projection. **`AC-ReadBeforeMembershipCheck`** must fail the no-read case. Carry the reason that an installed plugin cannot select client-setting names.

### AC-01.T — Tovu | preserve product manifest selection

Delete `features/api-connections/bundled-client-namespace.ts`.

- In `server/runtime/composition/agent-plugin-connections.ts`, repoint the reader import to `@jini-ai/integrations/api-connections/bundled-client-namespace` and `ClientNamespaceFor` to `@jini-ai/core/contracts/site/integrations-api-connections`. Add `readAgentPluginMetadata` from `@jini-ai/agent-plugins/manifest` and pass `readClientNamespace: ({ value }) => readAgentPluginMetadata({ value }).metadata.clientNamespace` in `bundledClientNamespaceFor`. Leave the selected-catalog `Set`, `createRequire` base and read/parse catch unchanged.
- In `features/api-connections/contribution.ts`, delete the local type declaration and type-import from core. In `features/api-connections/host-bindings.ts`, keep `loadDeclaredApiConnections` from `./contribution.js` and import the type separately from core. No re-export.
- In `features/api-connections/__tests__/bundled-client-namespace.unit.test.ts`, repoint `../bundled-client-namespace.js` and supply the same real projection to the fixture helper and the direct empty-set call. Keep the malformed-declaration and selected/unselected cases.

Add a host case that an unselected ID does not call the host manifest reader, so **`AC-ReadBeforeMembershipCheck`** also fails host characterization. No Tovu export or baseline change. Stop if this would change selected package membership, the host prefix fallback, or any OAuth client-setting or credential access policy.

### PK-01.J — Jini | attachments and transaction contracts

Create `packages/core/src/contracts/site/project-key-attachments.ts`. Copy `ProjectKeyTransaction` and `KeyAttachments` from Tovu `attachments.ts` with their comments, verbatim and without imports. `ProjectKeyTransaction` takes `{ run: () => Promise<T> }` and the optional empty object, and returns `Promise<T>`. Preserve optional `keyForLabel` and the seven required `keysFor`, `attach`, `detach`, `isAttached`, `usersOf`, `removeKey`, and `renameSite` methods. Copy the exact first object, optional second object, and result of each method. No storage or queries enter core.

Add universal `./contracts/site/project-key-attachments`. Baseline is `jini-ai__core.json`. First add `packages/core/src/contracts/site/__tests__/project-key-attachments.test.ts` with type pins for the transaction’s preserved generic result, `attach`’s `{ siteId, keyId, siteName }` payload, and substitution of a port with no `keyForLabel`. **`PK-MakeLabelLookupRequired`** must fail that last pin. Carry the immutable site-identity and shared transaction-boundary rationale.

### PK-01.T — Tovu | leave the SQL owner in place

Remove the two declarations from `features/project-keys/attachments.ts`, type-import `KeyAttachments` from `@jini-ai/core/contracts/site/project-key-attachments`, and leave `createKeyAttachments` and its SQL verbatim. Repoint type imports in:

- `features/project-keys/attached-vault.ts`, `create-vault.ts`, `service.ts`, `shared-oauth-disconnect.ts`, and `__tests__/helpers.ts`.
- `features/api-connections/__tests__/shared-api.unit.test.ts`.
- `features/external-mcp/__tests__/external-mcp-shared-oauth.test.ts`, its inline `ProjectKeyTransaction` reference. Leave the frozen `fixtures/sign-in-copy-baseline/*.txt` untouched.
- `cli/commands/owner-store-import.ts`, `cli/commands/owner-store.ts`, and `server/runtime/composition/provider-config-source.ts`.
- `server/runtime/composition/project-store.ts`, splitting the mixed import. `createKeyAttachments` stays at `#src/features/project-keys/attachments`.

`features/project-keys/__tests__/attachments.unit.test.ts` still imports the local value implementation. Keep that characterization and add a host compile pin in `features/project-keys/__tests__/helpers.ts` for a structural fixture that intentionally omits `keyForLabel`. It must reject **`PK-MakeLabelLookupRequired`**. The host still supplies the same project kernel and transaction. No Tovu export or baseline change. Stop if any query, schema, transaction implementation, or site-ID source needs modification.

### PK-02.J — Jini | sealer with explicit owner-scope inputs

Create `packages/user-management/src/project-keys/site-sealer.ts` from Tovu. Import the crypto types from `@jini-ai/core/contracts/vault`, not `@jini-ai/integrations/secrets`. Keep `ToolInputError` from core. Extend the existing first objects as follows and keep `_options = {}`:

```ts
// ownerKeyHandleOnly
{
  keyring: KeyringPort;
  derivationRefusedMessage: string;
}

// siteGrantedSealer
{
  allowed: (input: { credentialId: string }) => Promise<boolean>;
  sealer: SecretSealerPort;
  ownerScope: {
    readonly workspaceId: string;
    readonly credentialKinds: readonly string[];
    readonly providerId: string;
  };
  accessRefusedMessage: string;
}
```

Replace the three host identity literals in the private identity check with the corresponding required scope. Use the two message fields in the existing refusal paths. Keep the envelope grammar and original options, identity and grant checks, and crypto forwarding unchanged. There is no new configurable verification algorithm or permissive default.

Add universal `./project-keys/site-sealer`. Baseline is `jini-ai__user-management.json`. First add `packages/user-management/src/project-keys/__tests__/site-sealer.test.ts` with fake keyring, fake sealer and fake lookup. Characterize active handle access without derivation, wrong owner scope refusing before crypto, grant denial, grant change during a pending open, and human save forwarding without reading site grants. **`PK-DropPostOpenGrantCheck`** must fail the pending-open case. Carry the comments about owner-private crypto, full AAD authentication, and checking the grant on both sides of asynchronous open.

### PK-02.T — Tovu | supply the exact existing owner scope

Delete `features/project-keys/site-sealer.ts`. Repoint:

- `server/runtime/composition/site-deps/provider-identity.ts`, from `#src/features/project-keys/site-sealer` to `@jini-ai/user-management/project-keys/site-sealer`. On the existing calls pass the existing derivation and access refusal strings verbatim, and `ownerScope: { workspaceId: "project", credentialKinds: ["vendor", "custom", "source-control"], providerId: "tovu" }`. Keep the existing keyring, sealer, grant lookup, owner/view vault and transaction wiring.
- `features/project-keys/__tests__/site-sealer.unit.test.ts`, from `../site-sealer.js` to the same public entry. Pass the fixed test scope and verbatim messages at the three sealer calls and pass the derivation message to the one handle-only call. Retain tests that verify the host fixture’s original policy and keep **`PK-DropPostOpenGrantCheck`** red.

No Tovu export or baseline change. Stop on any change to scope identity, stored envelope format, grant-check timing, owner-key availability or outward error text.

### PR-02.J — Jini | move the scorer/slug binding into CMS

Create `packages/cms/src/seo/content-analysis/site-analyze-content.ts` from the Tovu scorer binding. Take `analyzeContent as analyzeWithSlugify` and its three existing types from `./analyze-content.js`. Take `toSlug` from `../../html/site/slug.js`. Export the moved wrapper under the distinct name `analyzeContentWithSiteSlug`. Its first parameter stays `Omit<AnalyzeContentRequired, "slugify">`, its second stays `optional: AnalyzeContentOptional = {}`, and its return stays `ContentAnalysisReport`. The one-line body is unchanged. The slug module is already in CMS’s isolation shared list.

Add the named export to `packages/cms/src/seo/content-analysis/index.ts`. No new manifest subpath. Baseline adds the symbol under the existing `./seo/content-analysis` entry in `jini-ai__cms.json`. First add `packages/cms/src/seo/content-analysis/__tests__/site-analyze-content.test.ts` for transliterated heading anchors, repeated heading IDs, and preservation of the optional meta description. **`PR-UseAsciiOnlyHeadingSlug`** must fail the transliteration case. Carry AW-7’s why-comment that the TOC links must match the renderer’s actual fragment IDs.

### PR-02.T — Tovu | repoint the worker without changing its ABI

Delete `features/plugin-runtime/built-ins/content-analyzer/analyze-content.ts`. Import `analyzeContentWithSiteSlug as analyzeContent` from the existing `@jini-ai/cms/seo/content-analysis` entry at all four sites:

- `features/plugin-runtime/built-ins/content-analyzer/plugin.ts`, replacing `./analyze-content.js` and merging with `summarizeReport`/`tiptapToBlocks`.
- `features/plugin-runtime/built-ins/content-analyzer/__tests__/unit/analyze-content.unit.test.ts`, `plugin.unit.test.ts`, and `summary.unit.test.ts`, replacing `../../analyze-content.js`. Merge with existing imports from that entry when present.

Update the two stale local-file references in the `index.ts` header while keeping the worker-only rationale. Keep the scorer/summary tests and existing Tier-2 worker test. Add the accented-heading assertion through `buildContentAnalyzerPatch` in the existing plugin unit test so **`PR-UseAsciiOnlyHeadingSlug`** also fails at the plugin projection. No Tovu export or baseline change. Do not move `plugin.ts`, change the SDK or manifest, or widen trusted imports. Stop if the existing worker entry cannot load the result with its current trust configuration.

## Holds and STOP conditions

- **Do not dispatch the N rows.** For Agent Plugins, the remaining dependency order is trusted lifecycle and layout, then approval/admission and credential ports, then connect/federation and tool callers. For plugin-runtime, resolve the install/source/ABI boundary before registrations. `sdk-resolver.ts` stays because Jini already implements the coordinator’s required-path seam. Any removal of the Tovu binding is a separate cloud job covering `index.ts`, `cli/commands/serve.ts`, `cli/commands/export.ts`, and their wiring and resolver tests. No change to the three boot paths in this plan.
- For external MCP and API connections, establish repo/owner projections before OAuth and runtime registration. Keep the existing separation of roster and preset behavior, optional OAuth for non-OAuth tooling, host cookie and redirect ownership, and product errors. For credentials and project keys, establish the storage and scope contract before outbound requests, copies, replacements or deletion. Do not assume a shared filename means a shared implementation.
- **Stop on an unexpected importer, ambiguous specifier resolution, existing destination, or failed shape comparison.** In particular, do not overwrite the existing Jini activation-effects, public-config, provider-link, SDK-resolver, hosted-MCP copy, credentialed-request, or API-connection implementations. No compatibility shells or new export wildcards.
- **Stop on behavior drift.** No change to tool/catalog bytes, actor or error identity, trust mode, permission, refusal text, wire body, vault scope, transaction, filesystem layout or theme behavior. Keep original why-comments with the code they justify. Keep functions at or below 80 lines and complexity at or below 10. Stop if a sheet needs an unlisted split to meet those limits.
- **Cloud completion gate.** Capture the unchanged baseline, verify the explicit package/API deltas, run the affected type pins and characterization tests, then verify bounded mutation reds and the unchanged route/worker integrations. A Sol patch is prepared, not verified, until those checks run.
