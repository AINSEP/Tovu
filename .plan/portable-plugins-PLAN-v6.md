# PLAN v6, revision 6: move generic code from Tovu into Jini, by domain (2026-11-07)

Replaces v1-v5 and v6 revision 1. Planning only. Nothing was built, run or installed. **T** = Tovu `apps/website/src/`. **J** = Jini `packages/`.
Refs read through git objects: base `origin/cloud/combine` (Tovu `b45d2ee75`, Jini `32e9c9c21`), session 1 `origin/cloud/portable-fin` (Tovu `be968c727`, Jini `d3efaed69`), `origin/cloud/more-jini-1` (Tovu `a0c60192c`, Jini `2364f89e7`).
Tovu and Jini are PUBLIC. Paste this plan into a brief. Never commit it. **R6:** Keep code, commits, reports and branch names within this plugin-extraction scope.

**Status:** §15 lists what was not read. Per-batch test lists are named by group, with v5 §7 as the detailed source for v5 batches; recon names for the rest.

## Revision 3: owner's decisions and Codex's second check (2026-11-07)

**Owner's test for every placement:** can another app use this by only wiring things up? Hard dependency injection; no automatic imports from another domain.

**New rule, overrides anything below that conflicts: a move unit is one job plus everything it needs at runtime, not a whole file.** A file with mixed jobs is split by owner first. No move leaves a Jini file importing back into Tovu; a cycle moves in one commit. Prerequisite leaves move first.

**Decided (owner delegated these to the coordinator, against the test above):**
- D1: `plugins_*` tools go in `plugins/host/tools`, a domain subpath, with a local contract for everything from other families.
- D3: neutral card types in `core`, builders in `ui`. V2 proves it and stops early if it fails.
- D5: the host keeps table DDL for now. The left-out survey may change this.
- D10: seam then move only for contract-heavy batches (judgment batches over 630 lines). Pure moves stay one agent. Session 2 measures both formulas; re-cut if over 1.4x.
- Comments: owner accepted section 8's amended rule.

**Lane checks replace whole-plan revisions.** Before a lane's first session, Codex checks that lane alone against the code: runtime dependency groups, contracts, the owner's rule. Its must-change items are applied to that lane, then it builds. Codex's second check did not fully cover later lanes.

**Must apply before the named lane builds (Codex's second check, read and confirmed in the code):**
1. Lane H (H2, H3): do NOT move `external-mcp-oauth.ts` whole. `createExternalMcpConnectionGate` and its helpers (T `features/external-mcp/external-mcp-oauth.ts:198-212`) decide preset handling, revocation and the current-grants verdict, so they go to `mcp/federation/hosted`. Plugin enablement, shared authorization and the canonical reauth-error factory are host-passed, tagged contracts. Only the sign-in part goes to `integrations/api-connections/hosted-mcp`. Update sections 4 and 5.
2. Tier T: `build-conformance.ts` moves to `cms/themes` with its same-domain dependencies, keeping its compiled-theme rejection. `theme.ts:11,690` calls it. Update section 5's stay list.
3. Tier T order: prerequisite leaves, then loader (`theme.ts`, `theme-files.ts`), then `validation/*` and `migration/*`. `validate-theme-package.ts:4` and `manifest-v2.ts:4` import them. Re-cut T1d-T1h; keep any runtime cycle in one commit.
4. Section 6 row 12 is wrong: `theme-files.ts:661` also owns the reviewed-write `AsyncLocalStorage`, and it must stay one shared context across `withReviewedThemeFileWrite` and the persistence checks. `file-identity-lock.ts:46,100,102` lookup Sets become `ReadonlySet`.

**Owner's general rule (11-07): no specific server in any domain. Route code takes `{ app: Server }`, and `Server` is an interface; an Express adapter is opt-in wiring. This overrides every `<domain>/express` home in `left-out-survey.md`.** Jini already has Express in existing domain code, listed for a lane of its own.

**Left-out survey (Codex, read-only, `left-out-survey.md`), not yet in the batches or estimates; each needs the owner's approval by name.** Rough source lines, not added to section 12: R1 real second app (notes app, in `examples/`, outside packages) + first domain schema export, 400-800 new, judgment; R2 domain schema exports, 1,500-3,000; R3 rendering leaves, workers, page pipeline, 7,000-10,000; R4 rest of theme, 5,000-6,000; R5 publishing engine, 4,000-8,000; R6 domain HTTP adapters, only what an adopter needs, 10,000-18,000. Revision 3's "theme engine only" and D5 are provisional until R2 and R4 are decided. Same hard rule: no package above the domains; explicit host wiring; Tovu's 78-step migration chain and saved formats unchanged.

## Revision 4: plugin extraction only (2026-11-07)

**Overrides everything below that conflicts, Revision 3 included. Rows edited in place below carry "R4".** Base: session 1's result, `origin/cloud/extract`, Tovu `dc08c79bc`, Jini `35c4961af`. Every line reference in this block was read there through git objects. Nothing was built or run. Source of the seven items: Codex's lane check, `plugin-lanes-check.md` (verdict BUILDABLE WITH CHANGES).

### What changed in Revision 4 (Codex: check only these)

1. **Scope:** lanes A, H, L, C with their fixtures and checkpoints. Lanes S, K, U and tier T are deferred (R4.1).
2. **Owner's server rule** restated for these lanes; HTTP routes stay host-owned (R4.2).
3. **Cards:** `SurfaceCardsPort<Resource>`. Card types reuse Jini's existing `PluginCredentialCard`. Builders go to a new `ui/mcp-ui/credential-card` entry and are passed in (A1, A7, A10, C3; §4, §5).
4. **Plugin state** goes to `agent-plugins/admin-surfaces` behind a local persistence contract. The API host receives the built store. The API host's `stateLimits` port is cut (A3, A4; §4, §5, §6 row 14).
5. **A8** declares `grantSignedInDefaults` as a contract. **A11** is recut by symbols, and the connect registration block stays in Tovu (A8, A9, A11).
6. **L1** splits by job into L1a, L1b and L1c. Declarative content types go to `plugins/host`, not `cms/content-types` (§5, §9).
7. **C2** adds a credentialed request/probe contract, a source-control commit contract and a helper inventory. C3 waits for them (§4, §9).
8. **C4** gets contracts for credential inventory, requests and errors, a site-key reader, a fingerprint projection and publish history (§4, §9).
9. **Fixtures and checkpoints:** G-card comes before A1. G-plug comes before L1 and is expanded. G-deploy comes before C4. C-d checks plugins only. X1 runs on the extraction tip (§7, §9).
10. **Session table:** sessions 2-10, 40 agents, 11.3M estimated, 13.9M of caps, 32.5 h of caps (R4.5). This replaces §12's session table for these lanes.
11. **Session 2 build sheet** (R4.6).
12. **Found while checking:**
    - v5 P5m's line ranges are stale after session 1. `mail-adapter-registry.ts` is 179 lines now, but v5 cites `:275-323`. A2 re-inventories by symbol.
    - v5 P5m's trap about a "local structural card type" no longer applies, because the card type already sits in the mail code's own domain.
    - deploy-ops is 995 lines, not 880.

### R4.1 Scope

**Lanes S, K, U and tier T are deferred.** Nothing in A, H, L or C needs them. I checked the imports of every A, L and C file this revision cites. Services those lanes would own stay in Tovu and arrive by contract:
- Content types and the reserved system types (L1a).
- Post reads: `capability-tool-registrations.ts:20-21` imports only types (L1b).
- The operator locale (`resolveOperatorLocale`, custom-credentials `tool-registrations.ts:12`).
- The site-key permission (`deploy-ops/tool-registrations.ts:10`).
- The site-key helpers in T `features/webhooks` (`deploy-ops/secrets.ts:6-7`).
- Source control (custom-credentials `tool-registrations.ts:63-64`).

No deferred fixture is a prerequisite: G-id, G-cms, G-keys, G-theme, G-post and G-news all wait for their lanes. §6 rows 2 (rollback part), 3, 12 and 13 stay inactive, as do §10's S, K, U and T rows. Session 1's V3 already covers the `===` part of row 2. §12's 104-agent total and §13's D5 describe the whole program; they do not describe this extraction.

### R4.2 Owner's rule: no specific web server in any domain

Route code in any domain takes `{ app: Server }`, where `Server` is an interface. Express is only an adapter, wired in by choice.

**These lanes move no route.** These stay host-owned in Tovu:
- the API-connection callback, the MCP-UI answer route and the hosted-MCP callback;
- the deploy and admin routes;
- `browser-binding.ts` (its cookie and paths reach Jini only as `signInLink` and `callbackPath`).

Nothing here needs the unmerged `core/server` interface, and nothing touches Jini's existing Express code. A batch that finds itself moving a route handler stops and reports.

### R4.3 The seven must-change items, applied

Each item gives what I verified, what changes, and any disagreement with Codex.

**1. Cards.**
- **Verified:**
  - `J core/src/surface-cards.ts:119` declares `SurfaceCardsPort<Resource = unknown>`.
  - Its `waitAtSignInCard` (`:124`) takes `SurfaceCardSignInWait<Resource, Result>`, whose `card` returns `Resource` (`:105`).
  - T `contracts/core/plugin-credential-card.ts` (93 lines) mixes two jobs: types (`:13`, `:21`) and builders (`:59`, `:81`). The builders return `SecretCardForm` from `ui` and carry the product id `appName: "tovu-plugin-credential-card"` (`:73`).
  - Jini already declares the same two interfaces, line for line, in `J agent-plugins/src/lifecycle/credential-card-metadata.ts:8,16`. They are exported through `@jini-ai/agent-plugins/manifest` (`lifecycle/manifest.ts:63`).
- **Types:** nothing is copied. **R5:** Q2 moves both interfaces to `@jini-ai/core/contracts/credentials`; `agent-plugins/manifest` re-exports them. Tovu's file re-exports both types from `@jini-ai/core/contracts/credentials`. A1 adds a test that they are assignable both ways, rather than trusting the text match.
- **Builders:**
  - `buildPluginCredentialForm`, `applyPluginCredentialCard` and `pluginCardDetails` move to a new `J ui/src/features/mcp-ui/credential-card.ts`.
  - The entry is `@jini-ai/ui/mcp-ui/credential-card`: `universal`, domain `mcp-ui`, like `secret-card`.
  - **R5:** their input is `PluginCredentialCard` from `@jini-ai/core/contracts/credentials`. No local `CredentialCardCopy`, and never an `agent-plugins` import.
  - **`app: SurfaceCardApp` is a required input.** Tovu passes `{ appName: "tovu-plugin-credential-card", appVersion: "1" }`.
  - Tovu's file keeps both names and their old signatures by binding `app`.
- **Partial disagreement:** Codex asks to "retain Tovu's exact app identifiers and text through required inputs". The identifiers, yes. The card text ("Save key", "API key", "Get a key", "Used for", "Saved as", the sealing sentence) names no product, so rule 1 (§2) does not require it as input. It moves byte-exact as Jini's neutral default, and G-card pins it. A `messages` input now would be overbuild; a host that wants other words can add one later.
- **Consumers:**
  - Moved code that waits on a sign-in card takes `cards: SurfaceCardsPort<Resource>` and stays generic in `Resource`. Today these are A10's `connect-sign-in-wait.ts:1` and `token-sign-in.ts` (through it).
  - Code that only builds cards takes `Omit<SurfaceCardsPort<Resource>, "waitAtSignInCard">`: `connect-card-ui.ts:5` (`buildSignInCard`), `connect-destination.ts:3` (`buildFormSurface`) and `access-token-tool.ts:10` (`defineSecretCardTool`).
  - Moved code that applies a plugin card takes `credentialCardForms: { build, apply }`, which are the `ui` functions, passed in by the host. That is A10, C3 and C4's `typed-secret-card.ts` path, if it applies one.
  - In A10, the `connect-card-ui.ts` app names become required inputs: `tovu-agent-plugins-connect` (`:46`), `-access-token` (`:95`) and `-access-token-outcome` (`:117`). **R5:** together with the URI namespace, as `cardIdentity: { uriNamespace, appNames }` (R5.7).

**2. Plugin state.**
- **Verified:** T `features/api-connections/plugin-state.ts` (141 lines):
  - Imports `ADMIN_SURFACE_STATE_LIMITS` (`:1`).
  - Imports the value `VaultError` from `@jini-ai/platform/secrets/credential-sets` (`:3`). That entry is `node`; `./admin-surfaces` is `universal`.
  - Imports `apiConnectionVaultScope` and `PLUGIN_STATE_FORMAT` (`:5`).
  - Owns the limits and the unavailable text (`:20-22`), the key grammar, the `plugin-state:` ids (`:46`) and the writes (`:104-140`).
  - Its only importer is `host.ts:18`, which builds it at `host.ts:168`.
- **Home:** `J agent-plugins/src/admin-surfaces/plugin-state.ts`, exported from `./admin-surfaces`. The limits live in the same domain, so it needs no isolation line.
- **Contract:** a local `AdminSurfacePluginStatePersistence` (§4 R4).
  - `list`, `get`, `put` and `delete` over this workspace's rows in the API vault.
  - `isConflict({ error })`.
  - Required `format` (`"agent-plugin-state"`) and `scope`.
  - **R5:** no import of `platform` or `integrations`, types included. Vault types come from `@jini-ai/core/contracts/vault`.
- **API host:** it receives the built store. `host.ts:168` becomes a required `pluginState` input. Tovu's `createApiConnectionHost` keeps its name and signature, and builds the store over the same `vault` object (§6 row 14). The API host never imports `admin-surfaces` to get state.
- **The host's `stateLimits` port is cut.** `host.ts` uses the limits only through `plugin-state.ts`. Its remaining `admin-surfaces` use is `createAdminSurfaceCallbackInbox` (`:11`), which stays the `callbackInbox` port.
- **Preserved:**
  - the ids `plugin-state:<pluginId>:<key>`;
  - the vault scope with `ownerKey: "tovu"` (`vault-stores.ts:61-62`);
  - the label `Plugin settings <id>`;
  - the format `agent-plugin-state` (T `platform/secrets/vault-api-connection-meta.ts:8`);
  - the archive filter at `vault-stores.ts:238`, which stays in Tovu, as does `site-backup/import-plugin-state.ts`.
- **No test pins those literals today** (I grepped the tests for the format and the scope), so A3's first commit adds one.

**3. A8, A9 and A11.**
- **Verified:**
  - `plugin-host.ts:18` imports `grantDeclaredToolsToSignedInRows` (`grant-signed-in-defaults.ts:105`, an A10 file), and `:178` calls it. So A9 cannot move without A10.
  - `tool-registrations.ts` is 158 lines. `:123` `buildAgentPluginConnectRegistrations` wires the note handler (`:125`, Tovu's `write-note-tool.ts` over Jini host-tools) together with the connect handler. `:151-152` combine the two catalogs and risks, and `:156` is the contributor.
  - The plan's `:1013-1049` is stale.
- **A8:** `createTovuPluginHost`'s moved core gets a required `grantSignedInDefaults(required: { deps, pluginId, servers }, optional: { skipServerKeys?, approvedEnable? })`, with a local type. Tovu passes `grantDeclaredToolsToSignedInRows`. A9 then has no Tovu import, and the later cycle stays where it is.
- **Small deviation:** Codex says "rewire after A11". I keep the port. After A11, Tovu's binder passes the Jini function in one line. Rewiring would edit a moved file and gain no behavior.
- **A11 is recut by symbols.** It moves A10's files only. **The connect registration block stays in Tovu**: `tool-registrations.ts:114-158`, that is `buildAgentPluginConnectRegistrations`, `agentPluginConnectDomainCatalog`, `agentPluginConnectDomainRisk` and `contributeAgentPluginConnectTools`.
  - It is host wiring (rule 4). It binds the note handler, the connect handler, Tovu's `toolMetadata` and the `catalogModule` path string together, so nothing can be omitted.
  - It reaches the moved `runAgentPluginConnect`, `agentPluginConnectAgentToolCatalog`, `agentPluginConnectDerivedRisk`, `AGENT_PLUGIN_CONNECT_TOOL_ID` and `saveAgentPluginToken` through Tovu's shims.

**4. L1 split by job.**
- **Verified:**
  - `declarative-content-types.ts` (355 lines) value-imports CMS content-type functions (`:28-37`) and `SYSTEM_CONTENT_TYPES` (`:38`), which builds a module-level reserved set (`:56`).
  - It also value-imports `PluginInvalidError` (`:40`, thrown at `:320`).
  - T `server/runtime/composition/plugin-runtime.ts` (758 lines) builds `createSitePluginPolicy` from `process.env` (`:274`), defaults `createTier2WorkerRunner({})` (`:283`) and binds `pluginHostBinding.pluginSdkBinding` (`:284`).
  - `invocation-core-deps.ts:15` imports `@tovu/sdk`.
  - `capability-tool-registrations.ts` (518 lines) type-imports Post (`:20-21`), reads the identity with `namespace: "tovu"` (`:208`) and holds tool text naming `content_post_*` (`:213-215`).
- **L1a, seam, content types:**
  - Plugin manifest and tier policy stay together, bound for `plugins/host`: the bounds, the grammar, parse, `validateDeclarativeManifest`, the plan/apply orchestration over today's `DeclaredContentTypePorts`, and `PluginInvalidError`.
  - CMS operations arrive through a local `DeclaredContentTypeCms` contract: field kinds, the two kind checks, the identifier grammar, and an already-exists classifier.
  - `reservedKeys` is a required input. Tovu passes `["post", "page", ...SYSTEM_CONTENT_TYPES]`.
  - The module-level `RESERVED_KEYS` moves into the factory's closure.
  - **This changes the old L1 row:** the target was `cms/content-types`. **R5:** any import from `plugins` to `cms`, value or type, is forbidden (R5.1), and the tier rules belong to the plugin domain. The record and field types come from `@jini-ai/core/contracts/content-types`.
- **L1b, seam, runtime bindings:**
  - The moved factory requires `pluginSourcePolicy`, `tier2CallRunner` and `pluginSdkBinding`. Tovu keeps building all three in `plugin-runtime.ts`.
  - `invocation-core-deps` takes the hook name and filter types through a local binding contract, with no `@tovu/sdk` import.
  - `capability-tool-registrations` takes a local content-read/preview contract, plus `identityNamespace` and its tool text as required input. Post is not extracted.
- **L1c, move:** §5.W, except that, **R5**, `run-in-worker.ts` stays in Tovu and **no `@jini-ai/sandbox` peer is added** (R5.3 edge 13). Worker paths do not change, and `archiveReader` stays a port. No replacement platform coordinator.

**5. C2 and C3: request contract first.**
- **Verified:** custom-credentials `tool-registrations.ts` (1,245 lines):
  - `:2` imports `probeCredentialConnection` from `credentialed-request.ts`.
  - `:46-56` import `makeCredentialedRequest`, `resolveRequestTarget`, `verifyCustomCredential` and `CredentialedRequestValidationError` from the same file.
  - `credentialed-request.ts` (768 lines) stays in Tovu. Its host HTTP binding is at `:600`: `EgressRefusedError` and `HttpClientPort` from T `platform/http`.
  - `:388` calls `provider.commitFiles`, a real repository commit, on a provider from `buildSourceControlProviderForApi` (`:64`).
- **C2's first agent:**
  - Declares a local `CredentialedRequestPort` in `integrations/credentialed-http/tools`: `request`, `resolveTarget`, `verify`, `probe`, and `classifyError`, which covers today's caught classes (validation, transport, egress refused, not found).
  - Declares a local `SourceControlWritePort`: build the provider, then `commitFiles`.
  - Writes into its report a **helper inventory**: for each handler that moves, every import, whether it is a value or a type, from which file, and **R5:** its destination (R5.6).
- **R5: C3 is blocked by any unresolved inventory row, any Tovu import (value or type) in a moved handler, or any checker failure (R5.6).**

**6. C4 contracts.**
- **Verified:**
  - `deploy-ops/run-ops.ts:6` value-imports `makeCredentialedRequest`, `resolveRequestTarget`, `CredentialedRequestValidationError`, `CredentialedRequestTransportError`, `listCustomCredentials`, `CustomCredentialNotFoundError` and `allowedOriginsFor`. `run-ops.ts:1` imports `PublishHistoryStore`.
  - `secrets.ts:6-7` imports the site-key helpers from T `webhooks`.
  - `secrets.ts:56` defines `secretFingerprint`. `secrets.ts:62` defines `defaultReadSiteKey`, which reads `process.env`, `homedir()` and `cwd()`.
  - `deploy-ops/tool-registrations.ts:10` uses `SITE_KEY_MANAGE_PERMISSION` (`"admin.security.site-key.manage"`), and `:9` imports `notConfirmedResult` and `approvalToolHandler`.
- **C4's seam declares local contracts in `devops/deploy`:**
  - `credentials`: inventory (`list`, `allowedOrigins`), `request`, `resolveTarget` and an error classifier. **R5:** this is C2's `CredentialedRequestPort` from `@jini-ai/core/contracts/credentials`, not a local copy.
  - `siteKey: { read(), fingerprint({ value }) }`, as a host projection. Env, home and file lookup stay in Tovu.
  - `publishHistory`.
  - Required `permission`.
  - `approvals` and `messages` carrying today's confirmation text.
- **Nothing from custom-credentials or webhooks moves into `devops`.**
- **Not checked:** Jini's `platform/secrets` also exports `fingerprintSiteKeyHex` (`index.ts:15`, an alias). Whether it equals Tovu's `webhooks/keyring.env.ts:326` was not checked. So the fingerprint stays host-passed, and G-deploy pins its output.

**7. Fixtures and checkpoints.**
- **Verified:**
  - Session 1's report (`extract-s1.md:182,203`) leaves open the real-tool renders of the form-spec cards: `credential` via `pluginProvider`, and `accessTokenWithCredentialCard`, which today is rendered from the helper, not the tool.
  - v5 P10a step 4 clones `cloud/portable-fin`.
- **G-card** is new, in session 2, before A1. It records real-tool renders through `buildPluginCredentialForm` and `applyPluginCredentialCard` on unmoved code (spec in R4.6).
- **G-plug** leaves L2 and becomes its own batch before L1. It now covers:
  - `plugins_*` text and the 15 product words, as before;
  - capability-tool ids, names and descriptions (`capabilityToolIdFor`, and the description built with the `tovu` identity namespace);
  - runtime behavior: a declarative enable with create, keep, conflict and tombstone; one tier-2 call result and one timeout; one before-save hook preview.
- **G-deploy** is new, in session 8, before C4. It pins:
  - `deploy_ops` secret list, set and unset: text and results;
  - the fingerprint for a value shaped like a site key and for a plain value (both `fingerprintKind`s);
  - confirmation text, and the deny path;
  - the permission refusal without `admin.security.site-key.manage`;
  - the publish-history entry a deploy writes.
- **R6:** Claude **C-a** follows A7 in session 3; **C-b** follows A11; **C-c** follows H3 (R5.10).
- **C-d checks plugins only.** It runs after C4, with E1-E6 restricted to §1's plugin classes and to files moved in A, H, L and C. G-plug, G-cred, G-deploy, G-card and the connect goldens must all be equal.
- **X1 runs on the extraction tip.** The Tovu-on-tarballs run uses a throwaway clone of `cloud/extract` at its pushed tip, not `cloud/portable-fin`, which would test old Tovu shims. The old checkout is used only for the rollback replay: the old code reads rows written by the new code.

### R4.4 Order and parallelism

- **A** is serial.
- **H** follows A: H1a needs A7, and H2 needs A4.
- **L1** may run beside A on its own branch, if the owner chooses. The table runs it serially, which costs hours, not tokens.
- **L2** comes after A11. It needs A9 integrated, and running it then avoids overlapping connect wiring.
- **H and C serialize**, because both change `integrations`.
- **One coordinator merges** manifests and lockfiles.
- **Never side by side:** any A batch with L2, H or C.

### R4.5 Sessions 2-10 (Codex's re-cut, checked; **superseded by R5.10**)

Formula: `1.2 x` the §12 batch estimates for work, `1.55 x` for fixtures and checkpoints (session 1's V3 ran at 1.55x), plus a coordinator at `50k + 12k per agent`. Hours cap is roughly `agents x 25 min x 1.5`, rounded up with slack. Every token cap is at most 2M.

| Session | Batches, in order | Agents | Formula (k) | Est (Codex) | Token cap | Hours cap |
|---|---|---|---|---|---|---|
| 2 | G-card, A1, A2, A3, A4 seam | 5 | 1.2x(203+230+159+200) + 1.55x200 + 110 = 1,370 | 1.4M | 1.8M | 4 |
| 3 | A4 move, A5, A6, A7, A8, C-a | 6 | 1.2x(150+229+138+200+242) + 1.55x120 + 122 = 1,459 | 1.5M | 1.9M | 4.5 |
| 4 | A9, A10, A11, C-b | 4 | 1.2x(175+277+203) + 186 + 98 = 1,070 | 1.1M | 1.4M | 3.5 |
| 5 | H0, H1a, H1b, H2, H3, C-c | 6 | 1.2x(147+224+230+193) + 1.55x(200+120) + 122 = 1,571 | 1.6M | 1.9M | 4.5 |
| 6 | G-plug, L1a, L1b, L1c, L2 | 5 | 1.2x(220+220+219+282) + 1.55x200 + 110 = 1,549 | 1.6M | 1.9M | 4.5 |
| 7 | L3, C0, C1 seam, C1 move | 4 | 1.2x(204+211+153) + 1.55x200 + 98 = 1,090 | 1.3M | 1.6M | 3.5 |
| 8 | G-deploy, C2 (2), C3, C4 seam, C4 move | 6 | 1.2x(216+215+214+210+153) + 1.55x170 + 122 = 1,596 | 1.7M | 1.9M | 4.5 |
| 9 | C-d (plugin-only), X1, X2 | 3 | 1.55x(120+220+180) + 86 = 892 | 0.8M | 1.1M | 2.5 |
| 10 | X3, local, packaged worker | 1 | 1.55x150 + 62 = 294 | 0.3M | 0.4M | 1 |
| **Total** | | **40** | **10,891** | **11.3M** | **13.9M** | **32.5 h** |

**Sums, checked:**
- Codex's columns add up as stated: 11.3M, 13.9M and 32.5 h.
- The formula gives 10.9M. Codex's extra 0.4M sits mostly in session 7 (+0.2M, for C1's injected owner, metadata and vendor seams) and session 8 (+0.1M, for the request contract). Session 9 is 0.1M under the formula, but its cap is still 1.23x the formula.
- Caps run 1.2x to 1.4x of the estimates. **I kept Codex's estimates**, the more conservative figures.
- Against revision 3's plugin-lane sessions (2, 3, 4, 13, 14, 18, 19: 7.9M estimated, 9.9M of caps), this is **+3.4M**. It comes from the 1.2x calibration, the 1.55x fixture reserve, three new fixture batches and the L1, C2 and C4 splits.
- **Weekly share** (§12's rate, rough): 11.3M is about 8% to 23% of a week, about 15%.

**R6:** session 3 measures A4 seam and move using elapsed hours and edited lines. No Codex token accounting. Re-cut later batches if measured time exceeds the allocated estimate by 1.4x.

**Who builds (R6, replaces the 11-06 choice).** The owner chose **Codex Cloud** for plugin extraction. R5.10's R6 hours table and R4.6's R6 single-task build sheet govern. The capability table below is historical difficulty guidance only; it does not assign Claude as builder. Claude reviews at named later checkpoints.

| Plain moves, Codex-capable | Stronger builder only (contracts, splits, frozen fixtures, saved formats) |
|---|---|
| A4 move, A6, A9, A11, H1b (seal-path review by the stronger judge), H3, L1c, L3, C1 move, C3 (only once C2's inventory is clean), C4 move | G-card, A1, A2 (bug fix), A3, A4 seam, A5, A7, A8, A10, H0, H1a, H2, G-plug, L1a, L1b, L2, C0, C1 seam, C2 (both), G-deploy, C4 seam, C-a to C-d, X1, X2, X3 |

**On any cap: push, report, end. Each session is a separate owner approval by name.**

### R4.6 Session 2 build sheet (self-contained; R6 Codex Cloud)

**R6 execution: one Codex Cloud task.**
- Codex builds the plugin extraction. One task builds session 2 serially: **Q1 checker → Q2 core contracts → G-card → A1 → A2 → F2**. No per-batch subagents or helper agents. A3 and A4 seam remain in session 3.
- **Hard cap: 4 hours total**, including setup, baseline, implementation, gates, commits, pushes and reporting. Record UTC start and deadline. No token/context cap or token-count reporting: Codex has no token count. Reserve the last 20 minutes for stopping, pushing and reporting; start no new batch in that reserve.
- **Fails closed (R5.8, R6):** proceed only after the current batch has a green gate with every listed test named, green `check:cross-package`, no "not covered", "skipped", "unresolved" or unfinished work, and both repos pushed at the stated SHAs verified with `git ls-remote`. **Stop at the first failed gate**; do not start the next batch, waive a failure or use a fresh agent to bypass the stop.
- Keep the batch table in Tovu `cloud/reports/extract-s2.md`: batch, paired SHAs, commands/test names and results, fixture hashes, UTC elapsed time, remaining work. Add a progress line every 30 minutes.
- On a stop or approaching cap: stop tracked child/test processes by recorded PIDs, commit explicit paths, pull with rebase immediately before pushing, verify both remote tips, and record both tips, the last verified paired SHAs, numbered remaining batches and test/process status. Never claim unfinished work is green.
- The final line of the report and task response is exactly `EXTRACT-S2 DONE` only when F2 is green and both tips are verified pushed; otherwise exactly `EXTRACT-S2 STOPPED AT CAP`. For an early gate failure, state the actual failure immediately above that required non-success marker; it does not mean the clock expired.
- Nothing goes to `main`. No force push. A rebase conflict stops integration; push recoverable work to a named fallback branch and report branch and SHAs.
- **Later Claude review checkpoints (R6):** C-a after A7 (session 3; includes A3/A4 seam/A5/A7), C-b after A11 (session 4; includes A8/A10), C-c after H3 (session 5; includes H0/H1a/H1b/H2 and seal paths), and C-d after C4 (session 9; includes G-plug/L1a/L1b/L2, C0/C1/C2/C3 and G-deploy/C4). Claude also reviews X1/X2 packed/replay proof before landing; X3 remains local. These are review checkpoints, not Claude build assignments. F6/F7/F8 remain mandatory accumulated gates and do not replace Claude review. Each later session requires separate owner approval; session 2 does not authorize starting it.

**Common rules, session 2:**
- **Branch (R6):** create `cloud/extract-s2` in both repos from `origin/cloud/extract`, pinned to Tovu `dc08c79bc` and Jini `35c4961af`. Verify those bases before writing; stop on a mismatch. Record full starting SHAs. **AI-Dev-Shop is not in this Tovu checkout; that's expected, so proceed.** Never commit the plan or brief.
- **Commits:** by explicit paths, `git commit -F <msg> -- <paths>`. Never `git add -A`, stash or checkout of others' files. Push every 5-10 minutes.
- **Moves** are `git mv` plus import edits, never retyped. "Why" comments move byte-exact. Guard `N1` may force rewording; then only those lines change, in neutral words, listed in the report.
- **Old Tovu paths stay as thin re-exports** with the same names and signatures.
- **Tovu tests stay unedited (R6).** New test files are fine. Existing Jini tests also stay unedited except the precisely enumerated parser-wiring and additive export-list changes in R6.5; preserve every existing assertion. Any other existing test edit stops the session.
- **Byte-identical in Tovu:** tool text, approvals, cards and saved data. `tool-metadata.baseline.json` keeps its hash. No migration diff.
- **API shape:** `(requiredObj, optionalObj)`. Complexity under 11. No inline lint disables. No vendor in `core`.
- **Hard bans:** no edit to `scripts/check-package-layers.ts`. No new package. Nothing added to `@jini-ai/server`: **R6 session 2:** `git diff 35c4961af -- packages/server` stays empty. **R5: no Jini package imports another Jini package except `@jini-ai/core`, value or type, in source or in the emitted `.d.ts`, and no new `@jini-ai/*` dependency or peer other than `core` (R5.1).** `core` imports none. No `isolation.shared` to hide anything.
- **Checker (R5):** from Q1 on, every gate runs `pnpm check:cross-package` after the build. A failure is a failed gate.
- **Inventory (R5.6):** every move or seam batch's first commit is its inventory. An unresolved row stops the batch.
- **Pins (R5.9):** a batch that records a golden or pin reports its sha256 at the recording commit.
- **Every new contract** gets an `@agent-note` where types can't say it (same instance, saved format, ordering), in neutral words (guard `N1`).
- **Bugs:** failing test first, show red, mutate, then fix. Log each in `development/open-bugs.md` and in the report.
- **Tests:** run only the listed tests and changed files. Vitest: `--maxWorkers=2 --minWorkers=1`. `node --test --test-concurrency=1`. Leave no test process running. Run `tsc --noEmit` on every touched Jini package, because vitest does not type-check.
- **Guard record**, from session 1; every run must equal it by name:
  - `pnpm guard`: `R2-deep-path` (1), `R10-chatpane-public-surface` (1), and informational `R13-model-fallback-freshness` lines.
  - Hardwiring: HW1 17, HW2 16, HW3 135, HW4 1, HW8 49, 0 new.
  - Layers 0. Isolation 0 failing (audit `SI-c` 9, `SI-d` 7). `guard:plugins` clean.
- **Known reds, already there:** do not fix them, and do not count them.
  - `plugin-host-bundled-identity` (Tovu).
  - Jini `ui` `sign-in-card.unit.test.ts`: 5 failures, `AbortSignal.any` under jsdom.
  - Tovu `tsc -p tsconfig.tests.json`: 12 errors in `external-mcp-connection-source.operator-read-only`, `import-local.integration` (x8), `set-enabled-confirmation-ui`, `site-imports.integration` and `agent-plugin-token-boot-order`.
- **No route handler moves** (R4.2). **R6:** public-repository scope rules apply to every commit, report and branch.

**Commands** (copied here for session 2; **R6:** inspect the cloud environment first, set up these versions if needed, and record the baseline on the unmodified pinned trees before code edits. It must be green except the named known reds below. Build baseline Jini declarations and retain them outside tracked source for XP3's pinned comparison. Setup and baseline count toward the 4-hour cap):
```sh
# install Node 24.2.0 from the nodejs.org tarball into ~/.local/node24
corepack enable --install-directory ~/.local/node24/bin
# Jini (pnpm 10.33.2)
CI=true pnpm install --frozen-lockfile
pnpm --filter @jini-ai/core run build && pnpm --no-bail -r build
pnpm --filter <pkg> exec tsc --noEmit
pnpm --filter <pkg> exec vitest run <files> --maxWorkers=2 --minWorkers=1
pnpm guard && pnpm guard:plugins
# Tovu (npm 11.3.0). Order matters
npm ci
npm run build --workspace @tovu/sdk
JINI_PACKAGES_DIR=<jini>/packages npm run link:jini
npm --prefix packages/contracts run build
npx tsc -p tsconfig.json --noEmit           # after any Jini change: rebuild that package, re-link first
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx \
  --import ./development/test-support/composed-bundle-env.ts \
  --test --experimental-test-module-mocks --test-concurrency=1 <files>
```
**Lockfile:** this lane is serial. A batch that adds a dependency regenerates with `pnpm install --lockfile-only` in its own commit. On a conflict, never hand-merge: take theirs and regenerate. Session 2 expects no new dependency.

Paths below: **T** = Tovu `apps/website/src/`. **J** = Jini `packages/`.

#### 2.1 G-card: real-tool card renders (fixture, no production change)

**Work.** Create T `assistant/__tests__/moved-tools.credential-cards.golden.test.ts` and `fixtures/moved-tools.credential-cards.golden.json`. Record them once on unmoved code, through the real tool handlers, not the builder functions:
- `credential_save` `pluginProvider` (custom-credentials `tool-registrations.ts:1042`, `buildPluginCredentialForm`);
- creating a credential with a plugin card (`:985`, `applyPluginCredentialCard`);
- the publish-host credential card (`deployments/publish-agent-tools.ts:917`);
- the source-control credential card (`source-control/credential-setup.ts:73`);
- the access token with a credential card through the real `credential_save` `agent-plugin-token` path.

**For each path, freeze:**
- the emitted resource: title, description, details, fields and app identity;
- the frame size;
- the outcome card and result for saved and dismissed;
- per-path counters, as V3 did: cards, probe requests and open exchanges.

**Gate.** Stable across two runs. Mutate one character of the card text in T `contracts/core/plugin-credential-card.ts`: red. Restore it byte-exact: green. `moved-tools.golden` and `moved-tools.access-token.golden` stay unedited and pass.

**Stop rules.** If a path can't be reached through its real tool without a production change, record it as "not covered" with the reason, and change nothing. **R5: the session then stops before A1** (R5.8). The report gives the sha256 of the golden and the fixture at the recording commit.

**Do not touch.** Any production file. Any existing golden or fixture.

#### 2.2 A1: card split, `credential_save` router, `provider_status` (needs 2.1)

**R5 first:** the inventory commit (R5.6). Card types come from `@jini-ai/core/contracts/credentials` (Q2), and card shapes from `@jini-ai/core/contracts/cards`. Permission comes from `@jini-ai/core`'s `requireToolPermission`. No moved file names any other Jini package.

**Work.**
1. **Types.**
   - T `contracts/core/plugin-credential-card.ts` re-exports `PluginCredentialCard` and `PluginCredentialField` from `@jini-ai/core/contracts/credentials` (**R5**).
   - New Tovu type test: the old and new types are assignable both ways.
2. **Builders.**
   - `buildPluginCredentialForm`, `applyPluginCredentialCard` and the private `pluginCardDetails` move to `J ui/src/features/mcp-ui/credential-card.ts`.
   - Their input is `PluginCredentialCard` from `@jini-ai/core/contracts/credentials` (**R5**, no local copy), plus a required `app: SurfaceCardApp`.
   - Text moves byte-exact.
   - Add the entry `./mcp-ui/credential-card` to ui's `exports` and `jini.entries` (`universal`), to `typesVersions` if ui uses it, and to the `integration-exports.test.ts` universal list.
   - Add an `@agent-note`: "`app` is the host's own id; it appears in every rendered card".
   - Add a changeset.
   - The Tovu file keeps both functions with their old signatures, binding `app: { appName: "tovu-plugin-credential-card", appVersion: "1" }`.
3. **Router and card loader.**
   - These move to `J agent-plugins/src/connect/`: T `features/custom-credentials/credential-save-tool.ts` (185), T `features/custom-credentials/plugin-credential-card.ts` (58) and T `features/agent-plugins/credential-cards.ts` (50).
   - New export `./connect`, with `jini.isolation.entries` `"./connect": "lifecycle"`. This is the first of §2's three lines; A6 adds the other two.
   - **Ports:**
     - `cardErrors.validation(message, field)`: Tovu's builds `CustomCredentialValidationError`, so `instanceof` holds.
     - `assertFreeField`.
   - **Required product inputs:** tool metadata, `CREDENTIAL_SAVE_TOOL_ID`, the credential categories, and `authorization.permission` (`admin.plugins.read`).
   - `CredentialSaveAdapters` stay host handlers. Each saved kind's store stays in the host.
   - Old Tovu paths become shims.
4. **`provider_status`.** T `features/plugin-runtime/provider-status-tool.ts` (69) moves to `J agent-plugins/src/lifecycle/host-tools`, with `ProviderSettingFieldProjection`.
5. **Void target.** v5 P5's target `J server/src/agent-plugin-host/` no longer exists; V0 undid it.

**Size:** about 455 lines moved, plus about 60 new.

**Tests, unedited:**
- T `custom-credentials/__tests__/{credential-save-tool.unit,credential-save-probe,form-save-errors.model-facing}.test.ts`
- T `agent-plugins/__tests__/unit/plugin-credential-cards.unit.test.ts`
- T `server/runtime/composition/__tests__/{plugin-credential-cards.unit,provider-settings-chat-card.unit}.test.ts`
- T `assistant/__tests__/tool-registrations.contracts.test.ts`
- T `assistant/__tests__/moved-tools.golden.test.ts`, `moved-tools.access-token.golden.test.ts` and `moved-tools.credential-cards.golden.test.ts` (G-card)
- J `ui` `cards.unit`, `integration-exports`, `secret-card.unit`

**Gate.**
- All of the above green.
- The `examples/neutral-host` provider-status `.todo` becomes a real test. Using public exports only, it shows a provider-settings card and saves through a memory adapter.
- `tsc --noEmit` passes on `ui`, `agent-plugins` and `examples/neutral-host`. Tovu `tsc -p tsconfig.json --noEmit` passes.
- The guard record holds. The metadata baseline hash is unchanged. **R5:** `pnpm check:cross-package` green.

**Stop rules.**
- **R6:** an existing Tovu test needs editing, or an existing Jini test needs an edit beyond the enumerated export-list additions.
- **R5:** any moved or new file names a Jini package other than `core` (`check:cross-package` red).
- Any card text would change.
- The router turns out to need a Tovu value beyond the listed inputs: report it, and don't add it silently.

**Do not touch.** Custom-credentials `tool-registrations.ts` (no edit needed: its imports resolve through the shims), `store.ts`, `credentialed-request.ts`, every A10 file (`connect-card-ui.ts` and the others), the `connect/executable` and `connect/plugin-host` entries.

#### 2.3 A2: mail glue, `resend` bug (needs 2.2)

**R5 first:** the inventory commit (R5.6). Mail types come from `@jini-ai/core/contracts/mail` (Q2). The moved glue under `agent-plugins/src/lifecycle/mail/` takes these as required host input, with no `platform` import:
- `mailEngine: { createRegistry, builtins: { console, smtp } }`;
- the ABI functions;
- `parseSetup`.

`PositionalMailer` and `PluginMailHttpClient` are declared in `core/contracts/mail`, and the functions stay in `platform/src/mail/plugin-abi.ts`. Configuration reads a local `MailCredentialRow`.

**Also fix (R6)** `lifecycle/mail/adapter-descriptors.ts:10`'s `platform/mail` import (R5.11). `parseMailAdaptersFile` gains a required `parseSetup`, and Tovu's shim binds `parseMailProviderSetupProperty`. **Only** J `agent-plugins/src/lifecycle/mail/__tests__/adapter-descriptors.test.ts` may gain a test-only import of the real `parseMailProviderSetupProperty` from `@jini-ai/platform/mail`, and `parseSetup: parseMailProviderSetupProperty` in each existing required-args object (nine calls at the pin). Keep every assertion, case, raw input, expected value and optional arg unchanged; no stub parser. This test-only host wiring is exempt from F2's unchanged-test check (R6.5); production packages get no exception. Run it and include it in `agent-plugins` type-check/build. Stop if another Jini package calls `parseMailAdaptersFile`, or another existing test needs wiring edits. Report the sha256 of `mail-send.golden` at its recording commit.

**First commit: the golden, before any move.** Add T `server/runtime/boot/__tests__/mail-send.golden.test.ts` and `fixtures/mail-send.golden.json`. They run `createSiteMailer` with the real bundled `resend` module, a fake HTTP client and a fake SMTP transport, and freeze:
- the request URL, headers and body, and the SMTP payload;
- ledger calls, in order;
- the suppressed recipient, redirect and capture;
- the rate-limit result;
- the unconfigured, unavailable and missing-key refusals;
- `operations.mailSenderIdentity.resolve`, with the configured and fallback sender names in the payload and the full missing-sender message (T `platform/mail/sender-identity.ts:21-25`);
- `status()`, `describeProviders()` and `checkProvider`;
- key rotation and plugin-off clearing;
- the cards;
- the per-recipient ledger counters that session 1 left open.

`mail-engine-parity` already pins literal outputs; don't repeat them. Mutate one refusal and one header: red.

**The bug, failing test first.**
- Verified at Jini `35c4961af`: `J agent-plugins/resend/adapters/resend.mjs:100` calls `httpClient.send({ method, url, ... })`, but Jini's port is `send({ request })` (`J core/src/primitives/http.ts:62`). No mail leaves through Jini's own client. Tovu hides this with `toTovuHttpClient` (T `platform/http/client.ts`).
- **Test:** the neutral host, the real `resend` module, and a fake client shaped like Jini's port. Show red, mutate, then fix.
- **Fix without editing the plugin:** publish the plugin call shape in a new `J platform/src/mail/plugin-abi.ts`: `PositionalMailer`, `PluginMailHttpClient`, `toPluginHttpClient`, `fromPositionalMailer`, `toPositionalMailer`.
- Tovu keeps the old names `toJiniMailer` and `toTovuMailer` (T `platform/mail/purpose-scoped-mailer.ts:20,29`).

**Moves: re-inventory by symbol.** v5 P5m's line ranges are stale. Session 1 already moved part of this into `J platform/src/mail/` and `J agent-plugins/src/lifecycle/mail/`. Move only glue still in Tovu and not already in Jini, from:
- T `server/runtime/boot/mail-provider-catalog.ts` (221): `createProviderMailer` at `:197` goes to `J platform/src/mail/provider-mailer.ts`. The SMTP setup form, built-ins, catalog, cards and lookups go to `J agent-plugins/src/lifecycle/mail/catalog.ts`.
- T `server/runtime/boot/mail-provider-configuration.ts` (70) goes to `.../mail/configuration.ts`, with refusal text through `mailHostText`.
- T `features/agent-plugins/mail-adapter-registry.ts` (179): only what's left goes to `.../mail/contribution.ts`, with the filename as host input.
- T `server/runtime/composition/site-mailer.ts` (173): the plugin-off lane clearing with its retries, and `selectProvider`, go to `.../mail/selection.ts`.
- New: about 50 lines of `createHostMailer(required, optional)` in `.../mail/host-mailer.ts`.

**Stays in Tovu:**
- `resolve-mailer.ts`, `mail-delivery-policy.ts` (`resendPolicyFor` names Tovu's domains) and `mail-plugin-account-token.ts`.
- Tovu's positional types and text, and `adapters/smtp.nodemailer.ts`.
- Settings files, tables, routes and admin.

**Traps:**
- Keep the wrapping order: provider, scrub, observe, policy, purpose gate.
- Do not swap in `defineProviderContribution`: its refusals say "mail provider", while today's say "mail adapter".
- Do not change `J agent-plugins/resend/`. Its label is frozen in its own JSON.
- The card type is already the mail code's own domain type (`lifecycle/credential-card-metadata.ts`), so no local copy is needed.

**Tests, unedited:**
- T `features/agent-plugins/__tests__/unit/{mail-adapter-registry,mail-provider-contribution,mail-provider-setup,bundled-mail-credential-cards,trusted-plugin-files}.unit.test.ts`
- T `server/runtime/boot/__tests__/{resolve-mailer,resolve-mailer-lifecycle,mail-engine-parity,mail-engine-adoption,mail-delivery-policy,mail-provider-catalog-setup,mail-credential-cards,mail-plugin-account-token}.unit.test.ts`
- T `server/runtime/composition/__tests__/{site-mailer.unit,mail-sender-identity-wiring.integration,cost-counters.baseline}.test.ts`
- T `platform/mail/__tests__/unit/{provider-error,purpose-scoped-mailer,sender-identity}.unit.test.ts`, `platform/mail/__tests__/integration/purpose-scoped-mailer-call-sites.integration.test.ts`, `platform/mail/adapters/__tests__/smtp.nodemailer.unit.test.ts`
- T `server/__tests__/routes/{mail-providers-route,mail-status-route}.test.ts`
- T `features/mail-status/__tests__/{provider-operations.unit,provider-tools.unit,test-send}.test.ts`
- Tovu `content/agent-plugin-overlays/resend/__tests__/bundled-mail.test.mjs`
- J `agent-plugins/resend/__tests__/*`, J `platform/src/mail/__tests__/*`

**Gate.**
- The neutral host, using public exports and memory ports only, sends through the real `resend` module and through SMTP, each with a fake transport. It shows:
  - one ledger reserve and mark;
  - a suppressed recipient refused;
  - capture mode;
  - `status()` ready;
  - a rotated key used by the next send;
  - plugin off clearing the lane.
- Golden equal. Counters equal.
- No diff in migration directories or in `J agent-plugins/resend`.
- `tsc --noEmit` passes on `platform` and `agent-plugins`. The guard record holds. **R5:** `pnpm check:cross-package` green.

**Stop rules.**
- The golden can't be recorded stably.
- The fix would need a plugin edit.
- Any send-path read is added.

**Do not touch.** `J agent-plugins/resend/`, mail tables and repos, `mail-delivery-policy.ts`, routes.

#### 2.4 A3: API-connection seams, small moves, format pin (**R5: session 3, first batch**; needs session 2's F2 green)

**R5:** its gate also runs `pnpm check:cross-package`, and its report gives the pin's sha256. `byo-client.ts` and `hook-http.ts` name no Jini package other than `core`.

**First commit: the pin.** New test T `features/api-connections/__tests__/plugin-state-format.pin.unit.test.ts`. It checks, through the real `createAgentPluginStateStore` over a memory vault:
- `PLUGIN_STATE_FORMAT === "agent-plugin-state"`;
- `apiConnectionVaultScope({ workspaceId })` deep-equals today's value, including `ownerKey: "tovu"`, `principalId: null` and `binding: null`, with the kind literal read from `vault-stores.ts`;
- a written row's id is `plugin-state:<plugin>:<key>`, and its label is `Plugin settings <id>`.

Mutate the format: red.

**Seams in place.**
- T `features/api-connections/host.ts` stops importing `vault-stores.js`, `shared-api.js` and the `contribution.js` loader directly.
- It takes `apiConnectionStorage`, `loadDeclaredConnections`, `createSharedConnections`, `appIdentity` and `byoCredentials` as injected deps.
- T's `createApiConnectionHost` keeps its name and signature by binding them.
- The port types live in `J integrations/src/api-connections/`.

**Moves to `J integrations/src/api-connections/`:**
- `hook-http.ts` (37). Its type-only `agent-plugins` import becomes a local type, because type imports are forbidden too (R5.1).
- `byo-client.ts` (65), through `byoCredentials`.

**Stays:** `browser-binding.ts` (Revision 3, §5). `plugin-state.ts` is not seamed here; that is 2.5.

**Tests, unedited:**
- T `features/api-connections/__tests__/{browser-binding.unit,byo-client.unit,host.unit,plugin-state.unit,vault-stores.unit,connect.unit}.test.ts`
- T `features/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts`
- T `server/runtime/composition/__tests__/{wiring-identity,cost-counters.baseline,agent-plugin-connections.vertical-slice}.test.ts`

**Gate.**
- Green with Tovu's bindings.
- Counters equal; the token lookup is still 1 contribution load and 4 credential opens.
- `wiring-identity` row 5 holds.
- `tsc --noEmit` on `integrations`. The guard record holds.

**Stop rules.** The storage seam would change a saved id, scope, label or format. Or `byo-client` needs a Tovu value.

**Do not touch.** `browser-binding.ts`, `vault-stores.ts`, `plugin-state.ts`, `connect.ts`, routes, the callback inbox.

#### 2.5 A4 seam: plugin state, API host and connect ports (**R5: session 3, after A3**; the move follows it)

**R5:** `AdminSurfacePluginStatePersistence` uses vault types from `@jini-ai/core/contracts/vault`. Its gate also runs `pnpm check:cross-package`.

**Work, in place, no file moves.**
1. **Contract.** Add the type `AdminSurfacePluginStatePersistence` (§4 R4) to `J agent-plugins/src/admin-surfaces/` (exported from `./admin-surfaces`), with an `@agent-note`: "Back it with the same vault object as your API connection host; `format` and the row ids are saved; never change them."
2. **Plugin state.** T `features/api-connections/plugin-state.ts` takes that contract. It drops `vault-stores.js`, drops the value `VaultError` (it uses `isConflict` instead), and drops the `@jini-ai/platform/secrets/credential-sets` value import.
3. **API host.** T `host.ts`:
   - `pluginState` becomes a required input, replacing `:168`;
   - `createAdminSurfaceCallbackInbox` (`:11`) becomes `callbackInbox`;
   - `CALLBACK_PATH` (`:20`, `:257`, `:262`) becomes `callbackPath`.
   - T's `createApiConnectionHost` keeps its name and signature, and builds the state store over the same `vault`.
4. **Connect.** T `connect.ts` (217): `hostedSignInLink` (`:6`) becomes `signInLink`.
5. **Measure (R6).** This is the first seam batch. Report edited lines and elapsed hours against its allocated time; no Codex token/context count.

**Tests, unedited:**
- T `features/api-connections/__tests__/{host.unit,plugin-state.unit,connect.unit,surface-connections.unit,surface-adapters.security,api-connection-slice,vault-stores.unit}.test.ts`, plus 2.4's pin
- T `features/project-keys/__tests__/tools.unit.test.ts` (reads `plugin-state:` ids)
- T `features/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts`
- T `features/agent-plugins/__tests__/unit/connect-tool.api-connections.unit.test.ts`: its pre-existing failures, if any, must stay the same set (record it first)
- T `server/runtime/composition/__tests__/{wiring-identity,agent-plugin-connections.vertical-slice,cost-counters.baseline}.test.ts`

**Gate.**
- Green.
- `wiring-identity` rows 5 and 6 hold.
- The plugin-state pin is equal. Counters are equal.
- `tsc --noEmit` on `agent-plugins` and `integrations`. Tovu `tsc` passes. The guard record holds.

**Stop rules.**
- A second vault or a second state store would appear anywhere: §6 row 14.
- The API host would import `admin-surfaces` for state.
- Seam edits pass 600 truly edited lines: hand off.

**Do not touch.** `surface-connections.ts` (A5), `executable-tools/*`, `browser-binding.ts`, `vault-stores.ts`, any file move.

**End of session 2 (R6): F2, below.** Report Q2's edited/moved lines and elapsed hours. A4's seam and move are measured in session 3 using elapsed hours; historical token formulas do not set Codex caps.

#### Q1: checker (session 2, first). Brief = R5.4, pasted verbatim

**Tests (R6):** its own new test, including modified-source emitted-declaration coverage. **Do not touch:** `check-package-layers.ts`, `guard.ts`, `guard-baseline.json`, any package source.

#### Q2: contracts into core (session 2, after Q1). Brief = R5.2's six Q2 rows plus R5.5, including R6 card reconciliation and type-closure edits, pasted verbatim

**Tests (R6):** every existing vitest file in `core`, `platform`, `oauth`, `cms`, `agent-plugins` and `ui` that imports a moved name, listed by grep in the report, stays unedited. Only named export-list tests `integration-exports` and `packed-exports` may gain entries for Q2's six core exports and A1's UI entry; record exact repository paths, additions and diff for F2 (R6.5). New independent type-parity tests preserve pinned UI declarations before re-exporting canonical aliases.

#### F2: final accumulated gate (session 2, last). Brief = R5.9, pasted verbatim

**R6: the same Codex task runs F2 read-only on code.** This final batch may commit only its report. Start tips: Tovu `dc08c79bc`, Jini `35c4961af`. Pins: G-card's and `mail-send.golden`'s sha256 from their batch reports. **On any red:** the session ends red.

### R4.7 Hard rules, unchanged

- No package above the domains.
- **R5:** no Jini package imports another, except `@jini-ai/core`, types included. `core` imports none (R5.1).
- No domain workflow in `@jini-ai/server`.
- Every contract carries `@agent-note` where types can't say it.
- `(requiredObj, optionalObj)`.
- Tovu's tool text, approvals, cards and saved data stay byte-identical.
- `check-package-layers.ts` gets no edit.
- Never a `createEverything`, an event bus or a DI container.

### R4.8 Not verified in Revision 4

1. That `catalogModule` appears in `tool-metadata.baseline.json`. I kept the block in Tovu either way.
2. Whether Jini's `fingerprintSiteKeyHex` alias equals Tovu's (`keyring.env.ts:326`). G-deploy settles it.
3. `connect-tool.api-connections`' current pass/fail set; 2.5 records it.
4. Which A10 files call `waitAtSignInCard` indirectly beyond `connect-sign-in-wait.ts`. The A10 agent lists them.
5. Whether ui uses `typesVersions` for its `mcp-ui/*` entries. 2.2 checks it.
6. Whether every glue piece of v5 P5m is still in Tovu. 2.3 re-inventories.
7. `DeclaredContentTypePorts`' members (`declarative-content-types.ts:238`), beyond the name.
8. H-lane and L2/L3 rows were not re-read beyond Codex's "Yes" verdicts. Revision 3's H items stand.

## Revision 5: types in core, no package-to-package imports (2026-11-07)

**Overrides everything above and below that conflicts, Revision 4 included. Rows edited in place carry "R5".** Same base: Tovu `dc08c79bc`, Jini `35c4961af`, read through git objects only. Nothing was built or run. Source: the owner's decision (`owner-rules-verbatim.md`, 16:15 and 16:45) and Codex's check of Revision 4 (`plan-r4-check.md`: 17 edges, 5 must-change items).

### What changed in Revision 5 (Codex: check only these)

1. **The rule** (R5.1) replaces "no cross-domain value import" at Revision 4's P:115, 149, 154, 166, 268, 462, 607, 765, 771, 775, 1008, 1019 and 1104 (these numbers shift after this edit), and in §2's "Never", §4's code, §5.W, R4.3 items 1 and 6, and R4.7. Each edit is marked R5. Types count. Emitted `.d.ts` files count.
2. **Seven `core/contracts/<area>` subpaths**, types only (R5.2). Six are filled in session 2 by batch Q2 from types Jini already has. The seventh, `hosted-mcp`, is filled in lane H. Later lanes add Tovu-held types to them as they move.
3. **The 17 edges, each resolved** (R5.3), with the remaining values passed in by the host.
4. **Checker Q1**, first in session 2, a new small script plus test. Every later gate runs it (R5.4).
5. **Contracts batch Q2**, before A1, about 1,050 type lines moved, old paths re-export (R5.5).
6. **Move inventory** in every move batch. C3 is blocked on any unresolved row (R5.6, Codex item 2).
7. **Card URI namespace** is a required input. Tovu binds `"tovu"` (R5.7, Codex item 3).
8. **Session 2 fails closed**, and a cap records both tips and the last paired SHAs (R5.8, Codex item 4).
9. **Final accumulated gate F2** ends session 2. F6, F7 and F8 end sessions with no checkpoint (R5.9, Codex item 5).
10. **`run-in-worker.ts` stays in Tovu**, so `plugins` gains no `sandbox` peer (R5.3, edge 13).
11. **Sessions re-cut:** 2-11, 46 agents, 12.7M estimated, 15.7M of caps, 36.25 h. Each session stays under 2M and 5 h (R5.10). The session 2 build sheet (R4.6) is edited in place.
12. **Found:** pre-existing package-to-package imports outside these moves (R5.11). They are not fixed here.

### R5.1 The rule

**No Jini package imports another Jini package, except `@jini-ai/core`. `core` imports no Jini package.** This covers:
- value imports and `import type`, `export ... from`, `import()`, `require()`, and `import("…")` type nodes;
- the emitted `.d.ts`, which must name no other Jini package either;
- `dependencies`, `peerDependencies` and optional peers: no new `@jini-ai/*` entry other than `core`.

Being an optional peer, a lower layer or type-only grants **no exception**. Same-package self-imports are fine. `examples/neutral-host` is a host, so it may import both sides. Tests are not shipped and are not checked.

**Where things go:**
- **A shared contract type** goes to `@jini-ai/core/contracts/<area>`. That means a shape that two or more Jini packages must agree on exactly, because the host passes one package's object to another unchanged. These subpaths hold only interfaces and type aliases: no runtime code, no `node:` types, and imports only `import type` from inside `core/src`. Each subpath is its own export, so a package pulls only the area it uses.
- **A consumer's own need** stays local in that package, and the host fills it. That covers a narrow port listing only the members the package calls, such as a 2-field attempt or a tracker with two methods. This is the "contract spelled out" the owner described.
- **Everything with runtime code is passed in by the host.** That includes the vault service, mail engine, OAuth flow functions, worker execution, `isUniqueViolation`, error classifiers and card builders. A `/** @agent-note … */` says where a host usually gets it. For example: "Cards usually come from `@jini-ai/ui/mcp-ui/cards`."
- **No per-package `/types` subpaths.** No `import type` from another Jini package. **Tovu may import anything.** It is the host.

### R5.2 The `core/contracts/*` subpaths

Each is `packages/core/src/contracts/<area>.ts`, with an export `./contracts/<area>`, `jini.entries` `universal`, and a re-export from the old path. "From" is where the type is declared today. All of them were checked to be pure: the files are type-only, or Q2 moves only the type declarations out of a mixed file.

| Subpath | Types | From (verified) | Filled by | Closes edges |
|---|---|---|---|---|
| `contracts/cards` **R6** | everything in `surface-cards.ts` (129 lines at pin), reconciled to the **complete corresponding UI shapes**: detail `previous`/`labels`; number/boolean field variants and properties; form/secret-form `additionalSubmitActions`, `text`, `tokens`; outcome `tokens`; transitive presentation types as interfaces/literal type aliases | `J core/src/surface-cards.ts` plus type declarations from UI `mcp-ui/surfaces/{structured-details,fields,form,outcome}.ts` and their type-only closure | Q2 starts by reconciling cards; then moves canonical types to core, preserves old core exports, and UI re-exports canonical types under existing names. Key-and-property equality against pinned UI shapes plus two-way assignability before Q2 passes (R6.1) | 5, 11, 17 |
| `contracts/credentials` | `PluginCredentialField`, `PluginCredentialCard` | `J agent-plugins/src/lifecycle/credential-card-metadata.ts:8,16` (types only; the parsers stay) | Q2. **Later:** C1 adds the credential-set record, summary and scope types (T `custom-credentials/types.ts:27-107`, not `allowedOriginsFor`). C2 adds `CredentialedRequestPort` and `SourceControlWritePort` | 7 (C3 part); C4 reuses C2's port (replaces R4.3 item 6's "local copy") |
| `contracts/mail` | all of `mail/types.ts` (120), `mail/ports.ts` (90), `mail/engine-contracts.ts` (114, incl. `MailProviderSetup`); the interfaces of `adapter-module.ts:4-48`; from `provider.ts`: `MailRateLimit`, `MailProviderCapabilities`, `MailFeedbackParser`, `MailProviderCallContext`, `MailDomainState`, `MailProviderModule`, `MailProviderRegistry`, `MailProviderSetting`, `MailLaneState`, `MailLaneStatus`, `MailStatusWarning`, `MailStatus` | `J platform/src/mail/*`. The three whole files have only `import type` from core primitives and siblings. `MailProviderRegistry` keeps `ProviderRegistry<…>` by `import type` from core's own `provider-registry.ts` | Q2. **A2 adds** `PositionalMailer` and `PluginMailHttpClient`, the types of P:396's ABI. Its functions stay in `platform/src/mail/plugin-abi.ts` | 1 |
| `contracts/vault` | `SealedSecret`; `RootKeyHandle`, `KeyringPort`, `SecretSealerPort`; `VendorCredentialSet*` (75 lines); from `vault.types.ts:5-111`: `VaultKind` (**written as a literal union**), new `VaultErrorCode`, `CredentialType`, `CredentialMeta`, `VaultJson`, `VaultMeta`, `VaultOptions`, `VaultContext`, `VaultIdentity`, `VaultRecord`, `VaultSummary`, `VaultPutRecord`, `VaultQuery`, `VaultDefaultQuery`, `VaultSingletonQuery`, `VaultBatchOp`, `VaultBatchResult`, `VaultCopyResult`, `VaultMetaParser(s)`, `VaultRepoPort` | `J platform/src/secrets/{types,ports}.ts`, `credential-sets/{types,vault.types}.ts` | Q2. Platform keeps `VAULT_KINDS` (`as const satisfies readonly Exclude<VaultKind, "custom">[]`, plus a two-way type test) and `VaultError` (`code: VaultErrorCode`) | 8, 12, and the plugin-state contract |
| `contracts/oauth` | all of `oauth/src/ports.ts` (138, only `import type` from core primitives); `DeviceAuthorization` (`device-code.ts:15`), **R6:** `DiscoveredAuthorizationServer` (`discovery.ts:17`) and `DiscoveredOAuthConfiguration` (`discovery.ts:28-29`), `OAuthProviderRegistry` (`registry.ts:80`), `AuthorizationCallbackParams` (`authorization-code.ts:135`), plus the `args.ts` types they name | `J oauth/src/*` | Q2. **H2 adds** `OAuthFlowOperations`, typing the 11 functions hosted sign-in calls (T `external-mcp-oauth.ts:13-34`), and `oauth` exports `oauthFlowOperations = { … } satisfies OAuthFlowOperations` (`oauth`→`core`, allowed), so a host wires it in one line | 6 |
| `contracts/content-types` | `ContentTypeFieldDef`, `ContentTypeStatus`, `ContentTypeRecord`; `ContentTypeFieldKind` and `IndexableFieldKind` **written as literal unions** | `J cms/src/content-types/types.ts:79,114-150`. The consts stay in `cms` with `satisfies` plus a two-way type test | Q2 | 15 |
| `contracts/hosted-mcp` **R6** | §5.C's canonical record, repo port, save inputs, views, connect start, config and sealed payloads, OAuth-service row, and **`McpBearerTokenSupplier`**. OAuth types come from `contracts/oauth`. Rewrite transport/grant/auth/status aliases as literal unions: `"stdio" \| "streamable_http"`, `"authorization_code" \| "device_code"`, `"none" \| "static_env" \| "oauth"`, `"disconnected" \| "pending" \| "connected" \| "needs_reauth"`; no `typeof` runtime-constant dependency | Type declarations only from Tovu `features/external-mcp/contracts.ts`, `contracts/core/external-mcp-{auth,access}.ts` (mixed files: constants/functions stay outside core); bearer alias from J `mcp/src/federation/adapter.http.ts:124`, re-exported by MCP. Replace T `contracts.ts:179`'s import-type with the canonical core alias | **H0/H1, not Q2.** These are Tovu types, so they move in their lane. This **replaces §4's two ~60-field local copies** (`AgentPluginMcpRow` and the sign-in row): connect and sign-in import the one record from core, and `mcp/federation/hosted` re-exports it. Error classes and projections stay values and stay host-passed | 12, and §4's drift risk |

**Already in core, reused:** `requireToolPermission`, `adaptLegacyAuthorize`, `LegacyToolAuthorizeFn` (use it as `AuthorizeFn`) and `ToolPermissionDeniedError`, from `@jini-ai/core` (`J core/src/index.ts:55-60`). `cms/core/tools/args.ts:3-4` re-exports these same objects, so the error class identity holds. `SurfaceExchangeStore` and `SurfaceAskThenReport` stay at the root.

### R5.3 The 17 edges, resolved

| # | Edge | Types go to | Values become host-passed | Batch |
|---|---|---|---|---|
| 1 | `agent-plugins`→`platform` | `contracts/mail` | `mailEngine: { createRegistry, builtins: { console, smtp } }` (from `mail-provider-catalog.ts:4-11`); the ABI functions (`fromPositionalMailer`, …); `withLock` (`plugin-host.ts:6` `withFileLock`) | Q2, A2, A8 |
| 2 | `agent-plugins`→`integrations` | local `MailCredentialRow { id, label, updatedAt, username? }`: only what `mail-provider-configuration.ts:25-35` reads | none. Tovu passes its records, which fit structurally | A2 |
| 3 | `agent-plugins`→`plugins` | local `discoverPlugins` and `getActivation` reader types (§5 row, as planned) | the two functions | A8 |
| 4 | `agent-plugins`→`cms` | core permission helpers; `LegacyToolAuthorizeFn` replaces Tovu's commands-barrel `AuthorizeFn` | none | A9, A10 |
| 5 | `agent-plugins`→`ui` | `contracts/cards`: `SurfaceDetail`→`SurfaceCardDetail`, `SecretCardForm`→`SurfaceCardSecretForm`, `SurfaceOutcomeSpec`→`SurfaceCardOutcome`, `UIResourceUri`→`SurfaceCardUri`, `SecretCardRun`→`SurfaceCardSecretRun`, `UIResource`→generic `Resource` | `cards` (`SurfaceCardsPort` or its `Omit`), `credentialCardForms` | Q2, A9, A10 |
| 6 | `integrations`→`oauth` | `contracts/oauth` | `oauthFlow: OAuthFlowOperations`; `loopback` (`host.ts:5` `startLoopbackAuthorizationReceiver`); `isSignInRefusal` (replaces catching `OAuthError`) | Q2, A4 move, H2 |
| 7 | `integrations`→`agent-plugins` | local 2-field sign-in attempt (`AdminSurfaceSignInAttempt` is `{ code, nextAction }`, `surface-capabilities.ts:65`); `contracts/credentials` for card descriptors (`tool-registrations.ts:3,59`) | `callbackInbox` (planned); `pluginCards: { load, find, readValues }` (`loadPluginCredentialCardsSafely`, `findPluginCredentialCard`, `readPluginCredentialValues`) | A4 move, C2 |
| 8 | `integrations`→`platform` | `contracts/vault` | `vault` (service or factory); `classifyVaultError({ error })`, which replaces `instanceof VaultError` (`store.ts:2`, `vault-repo.ts:1`); **R6: required `vaultErrors.create({ code }: { code: VaultErrorCode }, optionalArgs?: Record<string, never>): Error`, with `VaultErrorCode` from core, replaces all constructor calls (`vault-repo.ts:23,26,126`); Tovu binds the original `new VaultError({ code })` so class identity and codes hold**; `worksFor: { normalize, suggest }` (`tool-registrations.ts:5`, `custom-credential-create-ui.ts:1`); `aad.format` (`external-mcp-oauth.ts:8` `formatAad`) | Q2, C1, C2, H2 |
| 9 | `integrations`→`db` | none | `isUniqueViolation` (`store.ts:6`). The database adapter stays in Tovu | C1 |
| 10 | `integrations`→`cms` | core permission helpers | none | C2 |
| 11 | `integrations`→`ui` | `contracts/cards` | `cards.buildFormSurface` (`credential-copy-tool.ts:7`); `credentialCardForms` | C2 |
| 12 | `mcp`→`platform` | `contracts/vault`; `contracts/hosted-mcp` | `vault: { createService, createMemoryRepo }` (`external-mcp-vault.ts:2-3` `SecretsVaultService`, `InMemoryVaultRepo`); `classifyVaultError`; **R6: required `vaultErrors.create({ code }: { code: VaultErrorCode }, optionalArgs?: Record<string, never>): Error` for every `VaultError` construction in `external-mcp-vault.ts:26,29,37,40,47,64,79,84,99,102`; Tovu binds the original constructor, and the code type comes from `core/contracts/vault`**; `aad.format`. The envelope symbols and CAS stay inside `mcp` | H0, H1a, H1b |
| 13 | `plugins`→`sandbox` | none | **`run-in-worker.ts` (127 lines) stays in Tovu.** It is host wiring that binds `sandbox`'s worker to the plugin's required `tier2CallRunner` (L1b, `plugin-runtime.ts:283`). L1c does not move it and **adds no `sandbox` peer.** (`WorkerFactory` names `node:worker_threads` types, so it can't go into a universal core contract.) | L1b, L1c |
| 14 | `plugins`→`diagnostics` | local `PluginRuntimeTracker`: only the operations `plugin-runtime.ts:2` and plugin-runtime `tool-registrations.ts:3` call | Tovu's tracker | L1b |
| 15 | `plugins`→`cms` | `contracts/content-types`; core permission helpers; local outbox contract (the members used from `cms/core` `OutboxPort`) | `DeclaredContentTypeCms` (L1a, planned) | Q2, L1a, L2 |
| 16 | `devops`→`cms` | core permission helpers | none | C4 |
| 17 | `devops`→`ui` | `contracts/cards` | required `cards: Pick<SurfaceCardsPort, "defineSecretCardTool">` (`typed-secret-card.ts:4,19`) | C4 |

**What "pure" was checked as:** the file's imports are all `import type`, and its declarations are all interfaces or type aliases. This was checked by reading the import and export lines of each source named above. Mixed files (`adapter-module.ts`, `provider.ts`, `vault.types.ts`, `credential-card-metadata.ts`, `cms types.ts`, the four `oauth` files) give up only their type declarations.

**R6 evidence:** the R5 check confirmed `oauth/src/args.ts` is type-only; `DiscoveredOAuthConfiguration` also needs `DiscoveredAuthorizationServer`, now listed. Pinned UI/core cards differ, so Q2 must reconcile them first (R6.1), preserve the UI field set, and prove key-and-property equality plus two-way assignability. A remaining mismatch stops Q2 before G-card. The hosted contract's MCP bearer alias and runtime-derived unions are explicitly closed in R6.2.

### R5.4 Batch Q1: checker (session 2, first)

**Work.** In Jini, add `scripts/check-no-cross-package.ts` (about 100 lines) and `scripts/__tests__/check-no-cross-package.test.ts` (about 90). Add the root script `"check:cross-package": "node --import tsx ./scripts/check-no-cross-package.ts --base 35c4961af"`.
- **It reuses** `scripts/lib/package-sources.ts` (`sourcePackages`, `parseSource`) and `lib/is-main-module.ts`. It copies the 5-line literal `import()`/`require()` test from `check-package-layers.ts`, because that function isn't exported.
- **Why not reuse the existing checkers:** `check-package-layers.ts` allows any downward edge (`targetLayer < ownerLayer`), and editing it is banned. `check-subpath-isolation.ts` skips type-only imports. Neither can take this rule with a small change.
- **Not added to `pnpm guard`.** The guard record stays identical by name, and `guard.ts` is not edited. If `script-entrypoints.test.ts` or the guard self-test requires every `scripts/check-*.ts` to be registered in guard, name the file `scripts/no-cross-package.ts` instead.

**Rules.** Each failure prints the rule, the file and the specifier:
- `XP1`: a non-test file under `packages/*/src`, **added or renamed** since `--base` (`git diff --diff-filter=AR`), names an `@jini-ai/<x>`, where `x` is neither its own package nor `core`. Imports and exports (type-only too), `import()`, `require()` and `import("…")` type nodes all count.
- `XP2`: a file **modified** since base gains such a specifier that its base version didn't have, counted per specifier. Pre-existing edges in old files are reported in R5.11, not failed.
- `XP3` **R6**: scan emitted declarations for **added, renamed and modified sources**, using each package's actual declaration output mapping (`src/a/b.ts` → `dist/a/b.d.ts` where applicable). Fully apply XP1 to moved/new declarations; for modified sources, compare emitted declaration specifiers against that source's declaration emitted from **pinned `35c4961af`**, failing any newly introduced forbidden dependency. Retain declarations from the unmodified baseline build outside tracked source, set `JINI_DECLARATION_BASELINE_DIR` to that absolute snapshot directory, and make the checker read it; never compare only source imports or the previous batch. Missing current declarations or a required baseline declaration fail. Run after the build.
- `XP4`: every `packages/core/src/contracts/**/*.ts` has only interface and type-alias declarations, `import type` and `export type` statements, and relative specifiers inside `core/src`. Anything else fails: `const`, `let`, `function`, `class`, `enum` (even `const enum`), `namespace`, expressions, default export, `export =`, a non-type import, a bare or `node:` specifier. Its emitted `.js` must be only `export {};` plus comments.
- `XP5`: a package's `dependencies` or `peerDependencies` gain an `@jini-ai/*` other than `core` since base.

No allow-list.

**Test.** Fixture repos in a temp directory, as `script-entrypoints.test.ts` does: one red and one green case per rule, including a type-only import, an `import("@jini-ai/ui").X` type node, a core import (green), a self-import (green), a pre-existing versus a new edge for `XP2`, a `const` in a contract, and an added optional peer. **R6 XP3 fixture:** a modified source with otherwise permitted source imports whose emitted declaration gains a forbidden dependency must fail; unchanged pre-existing declaration edges pass. Added/renamed declarations are checked in full; missing current/baseline declarations fail.

**Gate.** Test green under `vitest --maxWorkers=2 --minWorkers=1`. `pnpm check:cross-package` passes on the session 2 start tip, which has nothing added yet. Mutation: delete the `import type` branch of the `XP1` visitor, and the type-only case goes red. The guard record holds.

**Estimate:** a judgment batch of about 190 lines, so 165k.

**Every later batch gate,** in every session, runs `pnpm check:cross-package` after the build. A failure is a failed gate.

### R5.5 Batch Q2: contracts into core (session 2, after Q1, before G-card and A1)

**Work (R6).** First reconcile core's shared card shapes with the complete corresponding pinned UI declarations (R6.1); this is Q2 work, before its gate and G-card. Then create the six Q2 subpaths of R5.2 by **moving** type declarations (`git mv` for whole files, cut and paste for type parts of mixed files). Preserve bytes apart from import paths, enumerated card reconciliation and literal-union rewrites. Include `DiscoveredAuthorizationServer` in the OAuth closure. Every old path re-exports the moved names: `platform/src/mail/*`, `platform/src/secrets/*`, `oauth/src/*`, `cms/src/content-types/types.ts`, `agent-plugins/src/lifecycle/credential-card-metadata.ts` and `core/src/surface-cards.ts`. UI re-exports canonical card types under existing names and uses those aliases internally. No UI renderer, builder, constant or other runtime implementation moves to core.
- `core` `package.json`: six `exports` entries plus `jini.entries` (`universal`). If `check-subpath-isolation` needs a domain line, add `"contracts": ["src/contracts"]` to core's `isolation.domains`. Never use `shared`.
- **Type tests (R6):** retain two-way assignability and add key-and-property equality for cards; test-size estimates below are historical:
  - `VaultKind` against `VAULT_KINDS` plus `"custom"`;
  - `ContentTypeFieldKind` and `IndexableFieldKind` against their consts;
  - in `ui` (`ui`→`core` is allowed), each UI card type against its core twin from edge 5, **plus exact keys, each property's type, optionality and readonly modifiers**, recursively for nested presentation shapes and each discriminated field-union variant. Preserve an independent type-only copy of corresponding pinned UI shapes in a new test before replacing UI definitions with canonical re-exports, so comparing aliases cannot pass vacuously. Cover `previous`, `labels`, number/boolean fields, `additionalSubmitActions`, form/secret-form `text` and `tokens`, and outcome `tokens`. A mutation removing an optional presentation key must fail even when two-way assignability passes. Move required presentation type aliases/interfaces into core too; tokens use a literal-name union, never `typeof` a UI runtime constant.
- One `@agent-note` on each contracts file: "Types only. The runtime parts come from the host; this area usually from `@jini-ai/<owner>`."
- Add the new entries to the export-list tests that enumerate entries (`integration-exports`, `packed-exports`, if they list core). A changeset.

**Size:** about 1,050 type lines moved, about 30 re-export lines, about 40 test lines, 6 entries. Estimate: 100k + 60k × 1.05 for the move, plus about 35k for the type tests and union rewrites, about **200k**.

**Gate.**
- `pnpm check:cross-package` green, which covers `XP4` on every contracts file.
- `tsc --noEmit` on `core`, `platform`, `oauth`, `cms`, `agent-plugins` and `ui`.
- The existing vitest files of those packages that import a moved name (listed by grep in the report) are green and unedited.
- `pnpm --filter @jini-ai/core run build && pnpm --no-bail -r build` passes. `pnpm guard` matches the record.
- Tovu `tsc -p tsconfig.json --noEmit` passes after re-linking, with no Tovu file edited.

**Stop rules.**
- A moved type needs a runtime import, a `node:` type, or another Jini package.
- **R6:** a two-way or key-and-property equality check fails.
- **R6:** an existing test needs editing beyond the enumerated additive export-list changes; every Tovu test stays frozen.
- A re-export would change an emitted name.

**Do not touch.** Any value. Any Tovu file. `check-package-layers.ts`.

### R5.6 Move inventory (Codex item 2)

**Every move or seam batch's first commit is an inventory.** It goes in its report, one row per moved symbol, helper or type dependency: name, value or type, source `file:line`, and destination. A destination is one of: same package, `core` root, `core/contracts/<area>`, a named local port, or a named host input. **Any row marked "unresolved" stops the batch.**

**C3 is blocked until C2's inventory has no unresolved row, no Tovu import (value or type) in a handler that moves, and no checker failure.** This replaces P:166 and P:1019's "no Tovu value import".

### R5.7 Card identity (Codex item 3)

**Verified:** Tovu builds `ui://tovu/…` URIs at:
- `connect-card-ui.ts:27` (`agent-plugins-connect/<pluginId>`);
- `connect-destination.ts:35` (`sign-in-destination/<id>`);
- `credential-copy-tool.ts:95` (`use-saved-key/<id>`).

R4's `appIds` becomes **`cardIdentity: { uriNamespace, appNames }`**, required. `uriNamespace` is the first path segment of every card URI. A10 and C2 thread it. Tovu binds `uriNamespace: "tovu"` and today's app names. G-card and the connect goldens pin the URIs.

**`@agent-note`:** "Your app's id; it appears in every card URI and is compared on answers."

### R5.8 Session 2 fails closed (Codex item 4)

**R6: the single Codex task starts the next batch only if its batch report shows all of these:**
- the gate is green, with every listed test named as run;
- `check:cross-package` is green;
- there is no "not covered", "skipped", "unresolved" or unfinished-handoff line;
- both repos were pushed at the stated SHAs (`git ls-remote`).

Otherwise **the session stops before the next batch.**

**More rules:**
- **R6:** unfinished work is a stop, never permission to start the next batch. Record an explicit continuation for a later separately approved task; do not spawn another agent or reset the 4-hour clock.
- **G-card:** a path that can't be reached through its real tool is still recorded as "not covered" with no change. **The session then stops before A1**, and the owner decides.
- **On a cap or a stop,** the report records:
  - both repository tips;
  - **the last verified paired SHAs** (the last Tovu and Jini pair whose batch gate was green);
  - the remaining batches, numbered;
  - test status;
  - that no test process is left (checked by pid, never `pgrep -fl`).

### R5.9 Final accumulated gate F2 (Codex item 5; R6.5 test exception)

**F2, the last batch of session 2,** runs on the final tip of both repos. It does not re-trust earlier green results.

**Checks:**
1. **Unchanged tests (R6):** `git diff --name-status <start>..<tip>` shows no `M`, `D` or `R` for any existing Tovu test or fixture. In Jini, no deletion/rename and no existing test/fixture edits except R6.5's allow-list: A2's `packages/agent-plugins/src/lifecycle/mail/__tests__/adapter-descriptors.test.ts` may only import the real parser and inject it into the nine existing calls, preserving every assertion; existing `integration-exports`/`packed-exports` lists may only gain Q2's six core exports and A1's UI export. F2 inspects exact diffs against the starting pin and the enumerated paths in batch reports; it does not exempt whole files from assertion/fixture checking. Any other edit fails.
2. **New goldens and pins:** each batch's report gives the sha256 of its new goldens and pins at the recording commit (G-card, `mail-send.golden`). F2 compares them at the tip.
3. **Goldens, run again:**
   - `moved-tools.golden`, `moved-tools.access-token.golden`, `moved-tools.credential-cards.golden`;
   - `mail-send.golden`, `mail-engine-parity`;
   - `tool-registrations.contracts` (approvals and tool text);
   - `cost-counters.baseline`, `wiring-identity`;
   - `saved-keys-round-trip.integration` (saved data).
4. **Runtime metadata:** the `tool-metadata.baseline.json` hash equals the start's. No diff in migration directories.
5. **Checks at the tip:**
   - `check:cross-package`;
   - the guard record;
   - `tsc --noEmit` on every Jini package touched in the session;
   - Tovu `tsc`.

**Any failure:** the session ends red and reports. F2 fixes nothing. **Estimate:** 120k × 1.55.

**The same gate runs at the end of every session that has no checkpoint** (F6, F7, F8). It checks that session's start and tip, plus the pins and goldens already recorded.

### R5.10 Sessions 2-11, re-cut (R6: Codex Cloud builds; hours replace token caps)

**R6:** one Codex task per cloud session builds batches in order and stops at the first failed gate. Codex has no token count: no context/token cap, final-context report or per-batch agent. Historical token formulas in §12 and R4.5 are estimates for the former Claude builder, not execution limits. Session 2 has a hard **4-hour** cap including setup and reporting. Later caps are planning limits, not approval to launch.

| Session | Batches, in order | Hours cap (R6) | Required Claude review checkpoint (R6) |
|---|---|---|---|
| 2 | Q1, Q2, G-card, A1, A2, F2 | **4** | No in-session Claude checkpoint; F2 is mandatory |
| 3 | A3, A4 seam, A4 move, A5, A6, A7, C-a | 4.75 | C-a reviews through A7, including API/state/surface contracts |
| 4 | A8, A9, A10, A11, C-b | 4 | C-b reviews connect contracts, card identity and wiring |
| 5 | H0, H1a, H1b, H2, H3, C-c | 4.5 | C-c reviews canonical MCP/OAuth contracts, seal paths and factories |
| 6 | G-plug, L1a, L1b, L1c, F6 | 4 | Accumulated F6 now; Claude reviews runtime/content contracts at C-d |
| 7 | L2, L3, C0, F7 | 3.5 | Accumulated F7 now; Claude reviews plugin tools/goldens at C-d |
| 8 | C1 seam, C1 move, C2 (2 ordered parts), F8 | 4 | Accumulated F8 now; Claude reviews credentials/request/source-control contracts and inventory at C-d |
| 9 | C3, G-deploy, C4 seam, C4 move, C-d (plugin-only) | 4 | C-d reviews accumulated L/C work, saved formats, cards and deploy contracts |
| 10 | X1, X2 | 2 | Claude reviews packed/replay proof and final extraction result before landing |
| 11 | X3, local, packaged worker | 1 | Local packaged-app evidence; cloud does not claim this gate |
| **Total** | | **35.75 h** | |

**R6 stop and review rules:** C-a/C-b/C-c/C-d remain independent Claude reviews; Codex supplies code, paired pushed SHAs, inventory and gate evidence, then waits for the checkpoint verdict before the next session. F6/F7/F8 remain mandatory, with accumulated pins and goldens. Each later session requires separate owner approval by name. A3/A4 seam, A8, L2, C3/G-deploy/C4 and X1/X2/X3 retain R5's re-cut order. The 1.4x seam/move re-cut rule may use recorded elapsed hours and edited lines, never an unavailable Codex token count.

### R5.11 Found: pre-existing package-to-package imports, not fixed here

`XP2` lets these stand, and blocks any new one in the same files. **They need their own owner-approved lane.**
- `agent-plugins`:
  - `lifecycle/{activation,node,persistent-state,ports,update-store}.ts` → `platform/fs*`;
  - `lifecycle/mail/adapter-descriptors.ts:10` → `platform/mail` (value `parseMailProviderSetupProperty`). **A2 fixes this one**, because A2 adds files to the same subpath. The types come from `contracts/mail`, and `parseSetup` becomes a required input of `parseMailAdaptersFile`, which Tovu's shim binds. A2 stops if another Jini package calls `parseMailAdaptersFile`.
- `integrations`: 12 `api-connections/*` files → `oauth`; `token-store/*` → `platform/secrets/credential-sets`; `media-providers/*` and `saved-requests/*` → `platform`, `db`. Moved hosted sign-in sits beside them, but its own files import neither.
- `mcp` → `platform/{fs,net,fetch-with-timeout}`, `protocol`. `plugins` → `platform/fs/file-lock`, `db/kernel`. `devops/deploy/node.ts` → `platform`. `ui` → `agentic`, `ui-kit` (React components).
- The layer checker approves all of these today. **The owner's rule does not.**
- **Deferred lanes** (§5.T, newsletter, S, K, U) still plan imports such as "stays an import: optional peer already on `cms`". Each lane check must re-plan them under R5.1 before it builds.

## Revision 6: R5 check repairs and Codex Cloud session 2 (2026-11-07)

**Overrides every conflicting earlier instruction, including Revision 5. Affected rows are edited in place and tagged R6.** Inputs: `plan-r5-check.md`, `owner-rules-verbatim.md`, Tovu Git objects at `dc08c79bc`, Jini Git objects at `35c4961af`. Documentation edits only: no tests, builds or installs ran. The owner's rule remains absolute: no Jini package imports another except `@jini-ai/core`; core imports none. Shared types live in independently exported `core/contracts/<area>`, types only. Everything with runtime code is injected by the host.

The five must-change items below are copied verbatim from the R5 check; the following application notes identify the edits made to satisfy them. Old P line numbers identify the reviewed revision, not this revision.

### R6.1 Card reconciliation before Q2 passes

1. **P:610,674–677 — reconcile cards before Q2.** Make core’s shared shapes contain the complete corresponding UI fields, including number/boolean variants and optional presentation fields; re-export the canonical types from UI. Add key-and-property equality checks, beyond assignability. Otherwise Q2 predictably stops before G-card.

**Applied in place:** R5.2 `contracts/cards` and R5.5 Q2 now require full UI field/presentation closure, canonical UI re-exports, independent pinned-shape tests, key-and-property equality and optional-key mutation coverage. Reconciliation is Q2's first work, before its gate and G-card. Only types move to core; all runtime code remains host-injected.

### R6.2 Complete type closures

2. **P:614,616,672 — complete the type closures.**
   - Move `DiscoveredAuthorizationServer` too: J `oauth/src/discovery.ts:29` references it; it is missing from Q2’s list.
   - T `features/external-mcp/contracts.ts:179` explicitly imports `McpBearerTokenSupplier` from `@jini-ai/mcp/federation`. Move that pure alias from J `mcp/src/federation/adapter.http.ts:124` into core’s hosted-MCP contract and re-export it from MCP.
   - Explicitly rewrite the hosted transport/grant/auth/status aliases derived from runtime constants as literal unions. Keep those constants and all runtime functions outside core.

**Applied in place:** R5.2 `contracts/oauth` includes `DiscoveredAuthorizationServer`. Its `contracts/hosted-mcp` row adds `McpBearerTokenSupplier`, its MCP re-export and replacement of the import-type at T `contracts.ts:179`; transport/grant/auth/status are explicitly listed literal unions. Hosted contracts still move in H0/H1, not session 2; constants/functions remain outside core.

### R6.3 Canonical vault-error construction

3. **P:631,635 — inject canonical vault-error construction too.** T `custom-credentials/vault-repo.ts:23,26,126` and `external-mcp/external-mcp-vault.ts:26,29,37,40,47,64,79,84,99,102` construct `VaultError`. Add required `vaultErrors.create({ code })`, typed with core’s `VaultErrorCode`; Tovu binds the original constructor. A classifier alone cannot preserve these paths.

**Applied in place:** R5.3 edges 8 and 12 now require `vaultErrors.create({ code }, optionalArgs)` typed with `core/contracts/vault`'s `VaultErrorCode`, in addition to classification/service ports. Tovu binds the original `VaultError` constructor at every listed construction path; no replacement error class or runtime core code.

### R6.4 Modified declaration coverage

4. **P:656 — check modified declarations.** XP3 covers only added/renamed files. Scan emitted declarations for modified sources too, comparing existing declarations against the pinned baseline while fully checking moved/new declarations. Add a fixture proving a modified file cannot introduce a forbidden declaration dependency.

**Applied in place:** R5.4 XP3 checks added, renamed **and modified** sources' emitted declarations. Modified declarations compare with the unmodified build of pinned Jini `35c4961af`; moved/new declarations are checked in full. Missing declarations/baseline fail. The fixture explicitly introduces a forbidden dependency through a modified file's emitted declaration.

### R6.5 A2 test wiring and F2 exception

5. **P:392 versus P:740 — resolve A2’s test contradiction.** Existing J `agent-plugins/src/lifecycle/mail/__tests__/adapter-descriptors.test.ts:10–28` calls omit the newly required `parseSetup`. They are included by its `tsconfig.json:8`; the build fails. Permit narrowly enumerated Jini test-wiring edits that supply the real parser, preserve every assertion, and explicitly exempt those edits from F2’s unchanged-test check. Keep Tovu’s tests frozen.

**Applied in place:** A2 may change only J `packages/agent-plugins/src/lifecycle/mail/__tests__/adapter-descriptors.test.ts` to import the real `parseMailProviderSetupProperty` and supply it as `parseSetup` in its nine existing calls. Preserve every assertion, test case, input, expected value and optional arg. No stub. F2 checks that exact diff and exempts only those wiring additions. Q2/A1's already-authorized `integration-exports`/`packed-exports` additions are also limited to the six core entries and one UI entry, with exact paths/diffs in the reports; existing assertions cannot change. **Every pre-existing Tovu test and fixture stays frozen.** Any other existing-test edit stops the session.

### R6.6 Codex Cloud execution and review

The owner chose Codex Cloud to build plugin extraction. R4.6 is now a single-task session 2 sheet: Q1 → Q2 → G-card → A1 → A2 → F2, stop at the first failed gate, **4 hours total**, no Codex token count. Both repos use `cloud/extract-s2` from `origin/cloud/extract` at the pinned bases. The report is Tovu `cloud/reports/extract-s2.md`; the final marker is `EXTRACT-S2 DONE` only after green F2 and verified paired pushes, otherwise `EXTRACT-S2 STOPPED AT CAP` with the actual failure/stop reason above it. Never commit the plan or brief.

R5.10 now gives an hours cap per session instead of a token cap. Claude reviews later C-a/C-b/C-c/C-d checkpoints and X1/X2's final packed/replay proof; F6/F7/F8 remain accumulated gates. Scope does not expand: later sessions need separate approval, X3 stays local. **AI-Dev-Shop is not in this Tovu checkout; that's expected, so proceed.**

## What changed after Codex's check

Check only these. Everything else is as in revision 1.

1. **V0 is atomic for Commerce.** Its source edits and peer removal are one commit. Z1 is gone (§5, §9).
2. **Neutral host finished.** Three real contract checks, `formDestinationMissingMethods`, plugin-directory lookup rebased, Server's `typecheck` restored, test-only dependencies removed (§8, V0).
3. **D2 rejected.** `platform/hosted-mcp` removed. MCP policy and canonical records live in `mcp/federation/hosted`. Connect and sign-in declare local contracts and get projections and error factories through Tovu (§4, §5.C, A7, H1a, H1b).
4. **Rule rewritten.** Rule 2 applies only to code with no domain meaning. "No ports for pure functions" is gone; ownership decides (§2).
5. **Isolation and homes.** All three connect entries map to `lifecycle` (§2). `surface-connections.ts` goes to `agent-plugins/admin-surfaces/connections` with a local API-host contract (§4, §5, A5, A6).
6. **Missing contracts added:** OAuth refusal classification, sign-in link builders, callback path, hosted registration identity, MCP error factories and classifiers, surface-connections host (§4).
7. **Tier T specified.** Consumer contracts for theme, Post and Newsletter; `theme-trash.ts`, `theme-file-import.ts` and `asset-operations.ts` stay in Tovu; product resources and their cache stay in Tovu; Node dependencies inventoried; seam-then-move batches T1a-T3e (§4, §5.T, §6, §9, §10, §12).
8. **Fixtures and checkpoints.** G-id is its own batch before S3 and U1; U1 starts after S3 is integrated; C-a has a slot in session 2; G-news freezes an old unsubscribe token before T3; Newsletter's provenance stays host-owned, `"tovu-core"` preserved (§7, §9, §12).
9. **D1, D3** are recommendations with their contracts specified. D1 uses a truly local cross-family contract and ports CMS command execution and MCP approval fingerprinting (§4, §5, L2, §13).
10. **more-jini-1** merges after repaired V0, is reviewed integrated, and is compared to named baseline failures. Its known revert behaviours are preserved (§8, V1, E5).
11. **Cut:** baseline-guard repairs, advance peer additions (§9).
12. **§12 recomputed.** Per-batch figures now apply the formulas, and J batches over 630 lines split, as §9's own rule says. Revision 1 listed them at 230k, which its own formula contradicts. Result: **104 agents, ~22.8M with coordinators, caps 28.4M / 72 h** (was 81 agents, ~17.8M; caps 22.1M / 52 h).
13. **§13** holds only open decisions.
14. **Corrections found while checking:** `form-destinations` files do declare modules, so E1's "3 kinds declare no module" was wrong. Commerce `UUID` is unbranded. The API-key exclusion is not in an `INFO.md`; see U3.

## 1. Plain words

**What this does.** Moves generic code out of Tovu into the Jini package that owns its subject. Each Jini subpath states what it needs as a contract, and the host app fulfills it. Tovu keeps thin adapters at the old paths.

**What "finished" means.** E1-E6 (§7) pass: every listed file lives in its domain subpath; a fake host using only public exports runs the plugin classes below; Tovu's tool text, approvals, cards and saved data are byte-identical; packed tarballs install. The owner then decides on `npm publish`. Nothing goes to `main` in this plan.

| Plugin class | Proven to run in the fake host |
|---|---|
| Skills | All 16 skills-only plugins (done in session 1, measured) |
| Provider settings | One plugin, card shown, saved through a memory adapter |
| Mail | `resend` and SMTP through fake transports |
| Executable tools with API sign-in | `google-workspace` `sheets_get` against a fake Google |
| Hosted MCP with sign-in | Higgsfield against a fake OAuth server |
| Regular plugins | One tier-2 plugin in a worker. Packaged-app proof is separate (§11, X3) |
| Deploy, forms, storage, login, consent | Contract and module checks only |

**Not proven:** a real second host, real provider sign-ins, real mail, real production databases.

**What changes for Tovu:** nothing visible. Same tools, words, approvals, saved credentials. No migrations. No one reconnects. A second host still writes its wiring (§4) and, today, its own table DDL.

## 2. The one rule

For a new or moved file, list what it imports at runtime and as types. First match wins.

1. **It names the product** (words, env names, key prefixes, table names, permission maps, saved constants): required host input with no default, or it stays in the host.
2. **It is pure, carries no domain's policy or vocabulary, and several packages need it** (ids, text escaping, base shapes): the lowest package they can all import.
3. **It uses one domain's concepts:** that domain's subpath. Anything from another domain, or from a higher layer, is a port it declares and the host fills, **pure or not**. SQL or Node code goes in that domain's `/sql` or `/node` or `/server` subpath.
4. **It only binds things and decides nothing:** the host.

**Never:** **R5:** a Jini package importing another Jini package other than `core`, types included (R5.1); a new package above the domains; domain workflow in `@jini-ai/server`; a cross-domain import to get a capability; `isolation.shared` or `isolation.entries` to hide a domain capability. `@jini-ai/server` holds only what the Node daemon host itself needs.

**Pure functions: ownership decides, not purity.** The test is one question: would this function change if a domain's rules changed? If yes, it stays in that domain, and any other domain receives it through a port as a host-passed function, called a **projection** here, though it has no I/O. If no, rule 2. So `escapeHtml` goes to `core` (already there), and `externalMcpAdmissionRevision` stays in `mcp`. The owning subpath exports its projections as one object, so a host passes them in one line. Consumer contracts carry the matching member names. **`examples/neutral-host` type-checks each assignment, the only place in Jini allowed to import both sides, so drift breaks Jini's own build.**

**Subpath naming trap, verified in `check-subpath-isolation.ts`:** the domain is the first export segment unless `jini.isolation.entries` overrides it, and overrides match the **exact** export key, not descendants (`exportDomain`, lines 117-122). A self-import reaching another domain is an `SI-domain` failure; type-only imports are skipped by isolation, but **the layer check counts them**. So `integrations/api-connections/hosted-mcp` is inside the `api-connections` domain with no config, `agent-plugins/admin-surfaces/connections` is inside `admin-surfaces` with no config, and `agent-plugins/connect` needs **three lines**: `"./connect"`, `"./connect/executable"`, `"./connect/plugin-host"`, all `"lifecycle"` (precedent: `"./manifest": "lifecycle"`). This states a fact and hides nothing: all three call lifecycle functions as the same family. One entry would be no smaller and would load executable tools for every connect import. A name under `lifecycle/` would need no lines, but it isn't the name the owner asked for.

## 3. `@agent-note`

Each contract gets a doc comment with an `@agent-note` tag saying what fulfills it. Sparse, only where types can't say it: same instance, shared transaction, ordering, saved formats.

- **`removeComments`:** not set in `tsconfig.base.json`, nor in any `packages/*/tsconfig*.json` (grep at combine). Packages build with plain `tsc`, so comments reach `.d.ts`. V2 proves it on one packed `.d.ts`.
- **Lint:** `eslint.config.mjs` has no `tsdoc`, `jsdoc` or tag-name rule (grep), so the tag is accepted. **Unverified:** several `scripts/check-*` mention `@complexity` or `overallScore`; I did not read whether any rejects unknown tags. V2 settles it with `pnpm guard`.
- **Trap:** guard `N1-consumer-identity` refuses the product name in Jini source, so notes use neutral words.
- **README:** V2 adds a short section to Jini's root `README.md`: "`@agent-note` is written for coding agents. It says what fulfills a contract and what the types can't express. Read it before wiring a port."

## 4. Contracts

**Connect, in real code, using today's `T features/agent-plugins/service-ports.ts` shapes.** `J agent-plugins/src/connect/ports.ts`:

```ts
import type { SurfaceCardsPort, SurfaceAskThenReport, SurfaceExchangeStore, AuthorizationPort } from "@jini-ai/core";
import type { SealedSecret } from "@jini-ai/core/contracts/vault"; // R5
import type { HostedMcpServerRecord } from "@jini-ai/core/contracts/hosted-mcp"; // R5, moved in H0/H1

/** R5: the row is the one canonical record in core, not a local ~60-field copy. Nothing here imports `mcp`.
 *  (It is written back whole, `federate-mcp.ts:491`.) Save input, view, approved access, snapshot and connect start come from there too. */
export type AgentPluginMcpRow = HostedMcpServerRecord;

/** Rules MCP owns, used by connect on rows it already holds.
 * @agent-note Pass `hostedMcpProjections` from `@jini-ai/mcp/federation/hosted`. Revisions and snapshots are compared
 * against saved rows and approvals: never write your own. */
export interface AgentPluginMcpProjections {
  accessSnapshot(input: { record: AgentPluginMcpRow }, options?: Record<string, never>): AgentPluginMcpAccessSnapshot;
  admissionRevision(record: AgentPluginMcpAdmissionSource): string;
  readToolGrants(record: AgentPluginMcpGrantLists, options?: { strict?: boolean }): { allowedToolNames: string[]; writeAllowedToolNames: string[] };
  validateToolNames(input: { names: readonly string[]; field: string }, options?: Record<string, never>): string[];
  oauthStatus(record: { oauthStatus: string | null }): "disconnected" | "pending" | "connected" | "needs_reauth";
  hasStaticAccessToken(record: { authMode: string; sealedOAuth: SealedSecret | null }): boolean;
}

/**
 * Roster persistence and safe classification. Sealing stays with the store owner.
 * @agent-note Fulfill from `@jini-ai/mcp/federation/hosted`. `repo` must be the same object the store
 * uses: sealed envelopes carry a module-private context that only that repo rebuilds. `validateToolNames`
 * throws the error `classifyError` recognizes.
 */
export interface AgentPluginMcpPort {
  readonly repo: AgentPluginMcpRepo; // findByServerId, upsert, deleteByServerId, updateAccessIfCurrent
  readonly projections: AgentPluginMcpProjections;
  applyAccess(input: AgentPluginApprovedAccess, options?: Record<string, never>): Promise<void>;
  saveServer(input: AgentPluginSaveMcpServer, options?: Record<string, never>): Promise<AgentPluginMcpServerView>;
  classifyError(input: { error: unknown }, options?: Record<string, never>): "validation" | "unconfigured" | "other";
  notifyRosterChanged(input: { readonly lowered?: { readonly pluginIds?: readonly string[] } }, options?: Record<string, never>): Promise<void>;
}

/** @agent-note `isSignInRefusal` is true for your MCP validation error and your OAuth library's error. Both mean
 * "no card was opened, offer the key card". Anything else propagates. */
export interface AgentPluginOAuthPort {
  beginConnect(input: { serverId: string; redirectUri?: string; delivery?: "hosted" }, options?: Record<string, never>): Promise<AgentPluginMcpConnectStart>;
  isSignInRefusal(input: { error: unknown }, options?: Record<string, never>): boolean;
}

/** @agent-note In your app, use whatever cards you prefer, including `mcpUiCards` from `@jini-ai/ui/mcp-ui/cards`.
 * R4: generic in the resource, as session 1 shipped it (`core/surface-cards.ts:119`). Callers of `waitAtSignInCard`
 * stay generic in `Resource`; build-only callers take `Omit<..., "waitAtSignInCard">`. */
export type AgentPluginCardsPort<Resource> = SurfaceCardsPort<Resource>;
export type AgentPluginCardBuildersPort<Resource> = Omit<SurfaceCardsPort<Resource>, "waitAtSignInCard">;
/** R4: the plugin key-card builders, host-passed. R5: `PluginCredentialCard` comes from `@jini-ai/core/contracts/credentials`,
 * the same type the `ui` builders take, so no copy and no assignment check are needed.
 * @agent-note Pass `buildPluginCredentialForm` and `applyPluginCredentialCard` from `@jini-ai/ui/mcp-ui/credential-card`,
 * bound to your own `app` id. */
export interface AgentPluginCredentialCardForms<Form> {
  readonly build: (required: { card: PluginCredentialCard }, optional?: Record<string, never>) => Form;
  readonly apply: (required: { card?: PluginCredentialCard; form: Form }, optional?: Record<string, never>) => Form;
}

/**
 * @agent-note `surfaceExchanges` must be the same instance your callback route delivers to. A second
 * store leaves the person's answer unreachable until the deadline. `askThenReport` comes from
 * `@jini-ai/daemon/surface-exchanges`.
 */
export interface AgentPluginSurfacesPort { readonly surfaceExchanges: SurfaceExchangeStore; readonly askThenReport: SurfaceAskThenReport }

export function agentPluginConnectTools<Resource, Form>(
  required: { mcp: AgentPluginMcpPort; credentials: PluginCredentialsPort; cards: AgentPluginCardsPort<Resource>;
    credentialCardForms: AgentPluginCredentialCardForms<Form>; cardIdentity: ConnectCardIdentity; // R5: { uriNamespace, appNames }
    surfaces: AgentPluginSurfacesPort; approvals: AgentPluginApprovalsPort; lifecycle: AgentPluginLifecyclePort;
    activations: AgentPluginActivationsPort; preferences: AgentPluginPreferencesPort; authorize: AuthorizationPort; messages: ConnectMessages },
  optional: { oauth?: AgentPluginOAuthPort; apiConnections?: AgentPluginApiConnectionsPort; publicUrl?: () => string | undefined } = {},
): ToolRegistration[] { /* moved body */ }
```

`PluginCredentialsPort`, `AgentPluginPreferencesPort`, `AgentPluginApiConnectionsPort` are today's interfaces, unchanged except that their record and connection types become local. `AgentPluginOAuthPort` renames one member: `connect-tool.ts:172` today catches `OAuthError` itself and the classifier knows only MCP validation (`agent-plugin-service-ports.ts:86-88`), so the classifier now covers both and connect drops its `oauth` import. The dev dependency would not install that peer for consumers anyway. Tovu's binder `server/runtime/composition/agent-plugin-service-ports.ts` (96 lines) stays and grows by about 15.

**`surface-connections.ts`, the broader contract.** `J agent-plugins/src/admin-surfaces/connections/ports.ts`. It does more than list and connect (`surface-connections.ts:109-185`):

```ts
/** @agent-note Fulfill from the one API connection host your tools and callback route already share. A second
 * host loses callbacks. `pinnedTokenOptions` must read the same frozen accounts as the tool registrar. */
export interface AdminSurfaceConnectionsHost {
  readonly workspaceId: string;
  nowMs(): number;
  connectionKey(input: { workspaceId: string; pluginId: string; connectionId: string }): string;
  listConnections(input: { pluginId: string }): Promise<readonly AdminSurfaceDeclaredConnection[]>;
  requestedScopes(input: { connection: AdminSurfaceDeclaredConnection; scopeSetIds: readonly string[] }): Promise<readonly string[]>;
  readRecord(input: { key: string }): Promise<AdminSurfaceConnectionRecord | null>;
  getAccessToken(required: { workspaceId: string; pluginId: string; connectionRef: string }, optional?: unknown): Promise<unknown>;
  startSignIn(required: AdminSurfaceSignInStart, optional?: { startParams?: unknown }): Promise<AdminSurfaceSignInStarted>;
  service(input: { connection: AdminSurfaceDeclaredConnection }): { confirmSwitchAccount(i: AdminSurfaceAccountAction): Promise<AdminSurfaceStatusView>; cancelSwitchAccount(i: AdminSurfaceAccountAction): Promise<AdminSurfaceStatusView>; disconnect(i: AdminSurfaceAccountAction): Promise<AdminSurfaceDisconnected> };
  readonly attempts: { get(ref: string): AdminSurfaceSignInAttempt | undefined; set(ref: string, attempt: AdminSurfaceSignInAttempt): void; delete(ref: string): void };
  readonly callbackInbox: AdminSurfaceCallbackInbox;
  readonly sharedOAuth?: { hasBinding(c: AdminSurfaceDeclaredConnection): Promise<boolean>; getStatus(c: AdminSurfaceDeclaredConnection): Promise<AdminSurfaceStatusView | null>; stopUsing(c: AdminSurfaceDeclaredConnection): Promise<void> };
  notAvailable(): Error;
  pinnedTokenOptions?(input: { signal?: AbortSignal; connectionRef: string }): unknown;
}
```

Fourteen members. `ADMIN_SURFACE_ACTION_INTENTS` is then a same-domain import. `ApiConnectionError`, `deriveApiConnectionKey`, `startApiConnectionSignIn` and `confirmedTokenOptions` all reach it through this contract. Tovu fulfills it with about 40 lines over `ApiConnectionHost`. A5 finalizes the `unknown`s to the shapes in use.

**The cards contract (types only, about 90 lines est), `J core/src/surface-cards.ts`.** Decision 3 keeps builders in `ui`. L4 packages cannot name `ui` types, and connect, custom credentials and CMS catalogs all need the same shape, so the description goes in `core`, beside `SurfaceExchangeStore` and `SurfaceAskThenReport`, which already sit there for this reason (`J ui/.../secret-card.ts` `SecretCardDeps`). Five methods with today's signatures: `defineSecretCardTool<Prep, Saved, Result>`, `buildSignInCard`, `waitAtSignInCard<Result>`, `buildFormSurface`, `buildOutcomeSurface`. Field kinds used: `string`, `enum`, `multi-enum` (measured). `UIResource` is opaque to callers. **R4: shipped in session 1 as `SurfaceCardsPort<Resource = unknown>` (`core/surface-cards.ts:119`), because `waitAtSignInCard` takes the resource in a parameter position. Plugin key-card builders (`buildPluginCredentialForm`, `applyPluginCredentialCard`) are a separate `ui` entry, `ui/mcp-ui/credential-card`, passed in as `credentialCardForms`; card descriptor types are Jini's existing `PluginCredentialCard` (`agent-plugins/manifest`).**

**Drift pin:** `J ui/src/features/mcp-ui/cards.ts`, 6 lines, new subpath `@jini-ai/ui/mcp-ui/cards`: `export const mcpUiCards = { ... } satisfies SurfaceCardsPort<UIResource>` (done, session 1). A signature change in `ui` then breaks Jini's own build, and a host wires cards with one import.

**Tripwire from the debate, answered.** Three debaters called a cards port too big: 5+ members carrying callbacks. Measured: 5 methods. The callbacks are in `SecretCardSpec`, which is a data type. It costs ~90 lines of type, and a host writes one import. It would fail only if `satisfies` can't hold over the generics. **V2 tests that first, before anything depends on it. If it fails, stop and report.**

| Package / subpath | Port: methods | Tovu fulfills with | `@agent-note` says | Guarantee |
|---|---|---|---|---|
| `agent-plugins/connect` | `mcp` (6 + 6 projections), `oauth` (2), `credentials` (4), `preferences` (4), `apiConnections` (3) | `agent-plugin-service-ports.ts`, `hostedMcpProjections` | From `mcp/federation/hosted`, `integrations/api-connections` | `repo` same object as the store |
| same | `cards` (5), **R4: `SurfaceCardsPort<Resource>`**; build-only users take the `Omit` form | `mcpUiCards` | Any cards, including `ui/mcp-ui/cards` | None |
| same, **R4** | `credentialCardForms` (2: `build`, `apply`); `appIds` (3 card app names, `connect-card-ui.ts:46,95,117`) | `@jini-ai/ui/mcp-ui/credential-card` bound to `tovu-plugin-credential-card`; today's three `tovu-agent-plugins-*` names | Builders live in `ui`; `app` is your id | Card bytes: G-card, connect goldens |
| `agent-plugins/connect/plugin-host`, **R4** | `grantSignedInDefaults` (1): `(required: { deps, pluginId, servers }, optional: { skipServerKeys?, approvedEnable? }) => Promise<readonly string[]>` | `grantDeclaredToolsToSignedInRows`; after A11 the Jini one, passed in one line | Runs after provisioning, before reporting failures | Same order as `plugin-host.ts:173-183` |
| `agent-plugins/admin-surfaces`, **R4** | `AdminSurfacePluginStatePersistence`: `list`, `get`, `put`, `delete`, `isConflict({ error })`, required `format`, `scope` | Tovu's API vault (`createApiConnectionVault`), `PLUGIN_STATE_FORMAT`, `apiConnectionVaultScope` | Same vault object as the API host. `format`, ids `plugin-state:<plugin>:<key>`, label `Plugin settings <id>` are saved | §6 row 14 |
| `integrations/api-connections`, **R4** | `pluginState` (the built store) replaces building it; `stateLimits` **cut** | `createAgentPluginStateStore` from `admin-surfaces` over the same `vault` | One store per API host | §6 rows 5, 14 |
| `plugins/host` (L1a), **R4** | `DeclaredContentTypeCms`: field kinds, `isFieldKind`, `isIndexable`, `validateIdentifier`, `isAlreadyExists({ error })`; required `reservedKeys`; today's `DeclaredContentTypePorts` | `@jini-ai/cms/content-types` functions; `["post", "page", ...SYSTEM_CONTENT_TYPES]` | Reserved keys are your system types | Enable outcomes: G-plug |
| `plugins/host` runtime (L1b), **R4** | required `pluginSourcePolicy`, `tier2CallRunner`, `pluginSdkBinding`; invocation binding (hook name, filter types); capability tools: content read/preview, `identityNamespace`, tool text | T `plugin-runtime.ts:274,283,284` bindings; `@tovu/sdk` constants; `"tovu"`; today's text | Worker entry and SDK are yours | §5.W; G-plug |
| `integrations/credentialed-http/tools` (C2), **R4** | `CredentialedRequestPort`: `request`, `resolveTarget`, `verify`, `probe`, `classifyError`; `SourceControlWritePort`: build provider, `commitFiles` | T `credentialed-request.ts` (stays), T `source-control/provider-registry.ts` | Egress policy and HTTP client are the host's | Error identity §6 row 8 |
| `devops/deploy` (C4), **R4** | `credentials` (inventory, `allowedOrigins`, `request`, `resolveTarget`, `classifyError`, a local copy of C2's shape); `siteKey`: `read()`, `fingerprint({ value })`; `publishHistory`; required `permission`; `approvals`; `messages` | T custom-credentials, T `webhooks` site-key helpers, `PublishHistoryStore`, `"admin.security.site-key.manage"`, today's confirmation text | Fingerprint must match your security page's | G-deploy |
| same | `surfaces` (2) | `deps.surfaceExchanges`, daemon `askThenReport` | Same store as callback route | Same instance |
| same | `approvals`: `approvalToolHandler`, `notConfirmedResult` | T `human-confirm.ts` (stays; it holds approval text) | Build on `core` `createApprovalHandler` | Runs once per call, actor bound |
| same | `lifecycle` (9), `activations` | T `lifecycle.ts`; `createAgentPluginLifecycle` for a new host | All writers share one activation queue | Same queue |
| same | `contributions` (3): build registrations, create registry, tool id | `@jini-ai/plugins/host` functions | Pass them from `@jini-ai/plugins/host` | Tool ids `p_<plugin>__<tool>` are saved |
| same | `connectionKey`, `adminSurfaces.loadActionTools` | `integrations` `deriveApiConnectionKey`; a retained 20-line block | Key format is saved | Same derivation |
| `integrations/api-connections` | `storage` (5), `loadDeclaredConnections`, `createSharedConnections?`, `appIdentity`, `byoCredentials`, `callbackInbox`, ~~`stateLimits`~~ (R4: cut; plugin state owns its limits), **`pluginState` (R4)**, **`signInLink`, `callbackPath`** | v5 §4 rows; `agent-plugins/admin-surfaces` for inbox and plugin state; T `browser-binding.ts` stays in Tovu (routes, cookie names) | One host per site | Tool and callback share it; state format saved |
| `agent-plugins/admin-surfaces/connections` | `AdminSurfaceConnectionsHost` (14), above | About 40 lines over T `ApiConnectionHost` | Same API host as tools and callbacks | §6 rows 5, 6 |
| `integrations/api-connections/hosted-mcp` | `store`: `findByServerId`, `upsert`, `tryClaimLease`, `releaseLease`, `openPayload`, `sealPayload`, `rosterRefusalFor`; **`projections`: `oauthStatus`, `authMode`; `errors`: `validation(message, field)`, `unconfigured()`, `classify({ error })`; `signInLink`; `registrationIdentity`: `softwareId`, `clientName`**; `oauthMessages`, `discoveryPolicy`, `settingsLink`, `projectKeys?` | `mcp/federation/hosted` functions; T `platform/oauth/endpoint-safety.ts`; `hostedMcpSignInLink`; `"tovu"`, `"Tovu"` | From `mcp/federation/hosted`, never a copy. **Errors must be the store's classes.** Registration identity is stable: changing it registers a new client | Same store module; leased refresh; error identity §6 row 8 |
| `mcp/federation/hosted` | `repo`, `sealer`, `keyring`, `clock`, `metaParsers`, `assertFreeField` | T `external-mcp-repo.ts`, `createTovuVaultKinds` | Saved format: AAD, kinds, payload version are frozen | One module instance |
| `<domain>/sql` | `kernel`, `tables`, hooks | T `contentKernel`, table maps, `onWritten({ owner })` | **Pass one kernel object to every repo. Hooks receive the repo itself** | Shared transaction; cache identity |
| `user-management/server/members` | repos, `mailer`, `renderAuthMail`, `hasher`, `tokens`, `originCheck`, `authorize` | T `features/members` bindings | Saved token and hash formats | No format change |
| `user-management/server/api-keys` | `apiKeyRepo`, `hasher`, `clock`, **required `keyPrefix`** | `"tovu_ak_"` | No default. Changing it rejects every key | Saved prefix, scrypt digest |
| `integrations/credentialed-http/sets` | `vaultRepo`, `owner`, `kinds`, `projectKeys`, `vendorCredentials`, `messages`; **R4 (Codex): metadata parsing injected** | T `custom-credentials` bindings | **Both `custom` and `vendor` rows must stay readable** | Sealed format, CAS |
| `plugins/host/tools` (D1, recommended) | `agentPlugins`: `inactivePluginIds?`, `previewEnableAccess?`, `recordDeclinedAccess?`, `listInstalled`, `assertWritable`, `setEnabled`, `provisionMcp`, `uninstall`, `compatibility`, `searchCandidate`, `classifyError`, in **local** types. `executeCommand`, `approvalFingerprint`, `approvals`, `surfaces`, `messages` | T `getHostCapability` binder; `contracts/core/commands`; `federatedToolApprovalFingerprint` from `mcp/federation` | Lifecycle owner authorizes and writes. Fingerprint is in saved approvals | **Not** today's `contracts/headless/plugin-host.ts`, which itself imports `agent-plugins` and `daemon` types (lines 3-8) |
| `plugins/host/node`, `/worker` | `workerEntry`, `typescriptBootstrapPath?`, `binding`, `policy`, `archiveReader`, `tracker?`; **R4: see the `plugins/host` L1a/L1b rows** | T entry file, `host-binding.ts` | The worker entry must be your file | Fresh worker per call |
| `cms/<area>/tools` | services, `authorize`, `surfaces`, `approvals` (comments, taxonomy), `messages` | T metadata and text | Tool text is the host's | None |
| `cms/themes` | `markers` (`markersOfType`, `substituteMarkers`, `scanEmbedMarkers`, `parseGalleryConfig`, 5 `with*` helpers, 5 type constants), `listing` (7), `menus` (`injectMenuDropdownScript`, `renderMenuToggle`, `renderHtmlMenu`, `menuLinkRelAttr`), `validateScripts`, `agentHandleSegment`, `postAuthorForDisplay`, `expandPartials`, `productRoot`, `publicRoutes`, `messages` | T binder over `cms/widgets/markers`, `cms/listing`, `cms/navigation`, `cookie-consent/policy`, `agentic/core/handle` | Rendered HTML is byte-pinned; pass the real functions. Build one engine | One `createThemeEngine` per process |
| `cms/post` | `scanEmbedMarkers`, `media` (`findByIdOrSlug`, `sniffContentType`, `contentTypes`), `publicRoutes`, `processOutbox`, `withPluginHookRefusals`, `runtimeMode`, `deriveDuplicateName`, `kernel`, `tables`, `surfaces`, `approvals`, `messages` | T binders; `DuplicateResourceHandlerContributor` stays with its host registration | Same kernel as every repo; `processOutbox` joins that transaction | §6 row 2 |
| `cms/newsletter` | `processOutbox`, **required `provenance`**, `keyring`, `originRegistry`, `userRepo` (local shape, the members used), `kernel`, `tables`, `mailer`, `surfaces`, `approvals`, `messages` | T binders; `{ sourceUrl: "builtin://newsletter", publisher: "tovu-core" }` | No default. Changing provenance refuses adoption at boot. Token derivation is saved | `plugin-identity.ts:95-129`; G-news |

**What a second host must write, honestly (estimates, unbuilt).** Using Jini's defaults everywhere:

| Piece | Host lines (est) | Why | Revision 1 |
|---|---|---|---|
| Connect | 110-165 | Binder shape of today's 96, plus `lifecycle`, `activations`, messages, refusal classifier | 100-150 |
| Approvals | 40-70 | T `human-confirm.ts` is 311 with Tovu text; the handler part is about 45 | same |
| Hosted MCP + sign-in | 75-115 | Repo, sealer, keyring, messages, store port, projections, error factories and classifier, link, identity. **SQL repo stays host-owned today** | 50-80 |
| API host | 45-70 | Storage over vault, loader, identity, link, callback path | 40-60 |
| Surface connections | 40-60 | Fourteen members over the API host. **New** | 0 |
| Plugin tools (D1) | 30-50 | Family capability, command execution, fingerprint. **New** | 0 |
| Theme engine | 40-60 | Mostly one-line pass-throughs. **New** | 0 |
| Post | 30-50 | **New** | 0 |
| Newsletter | 20-40 | **New** | 0 |
| Each SQL domain | ~30 | Precedent: `features/redirects/repo.sqlite.ts` is 32 | same |
| DDL for about 40 tables | **Not written anywhere public** | Decision 5.S. Recon decision 1 | same |

**Cost of rejecting `platform/hosted-mcp`, stated plainly.** Connect, approvals, hosted MCP, API host and surface connections: **310-480 host lines** against 230-360 before, about **100 more**. About **30 more contract members**, and about **100 field declarations** in Jini, copied into two local contracts, not the ~55 revision 1 claimed, because both copy the row. It is not large per piece, since most new host lines pass a Jini export. It is real in aggregate: **with plugin tools and tier T, about 430-680 lines before any SQL domain and before DDL.** The copies can drift; the neutral-host type-check catches that in Jini and Tovu's binder catches it in Tovu. Debaters measured Tovu's composition at 5,793 lines, most of it unrelated.

## 5. Homes, verified against the code

| Item | Home | Verdict |
|---|---|---|
| Connect, access tokens, `credential_save` router, provisioning | `agent-plugins/connect`, three `isolation.entries` lines (§2) | **Works.** **R5:** needs only the same-package lifecycle (ok with the lines) and `core` with `core/contracts/*`. `platform` reaches it only through host input. `daemon` value use is only `askThenReport`; its `AssistantSurfaceDeps` is `{ surfaceExchanges }`, in core. `OAuthError` and all MCP vocabulary leave through §4 |
| Executable tools | `agent-plugins/connect/executable`, mapped to `lifecycle` | **Works, more ports than the brief lists.** `register.ts:19` imports lifecycle by value, so without the mapping it fails `SI-domain`. It value-imports `@jini-ai/plugins/host` (3 functions), `integrations` (`deriveApiConnectionKey`), and `agent-plugins/admin-surfaces`, a different domain. All three become ports |
| `plugin-host.ts`, 7 connect calls | `agent-plugins/connect/plugin-host`, mapped to `lifecycle` | **Fits, verified.** Calls are all same-family. `plugins/host` and `plugins/host/node` use is type-only (`PluginActivationRepoPort`, `PluginDiscoveryRecord`), but the layer check counts that, so local types: `discoverPlugins` and `getActivation`. `namespace: 'tovu'` becomes input. `runAgentPluginUninstall` becomes a port; `uninstall-tool.ts` stays |
| `plugins_*` tools | **Recommended: `plugins/host/tools`. Owner's decision (D1)** | **Works with a truly local contract.** `tool-registrations.ts`, `install-tool.ts`, `source-tools.ts` value-import `plugins/host` and `/node`, same domain. They also import `agent-plugins/lifecycle`, `executeCommand` (`contracts/core/commands`), and `federatedToolApprovalFingerprint` (`tool-registrations.ts:76-79`). All become ports (§4). Copying today's `AgentPluginHostCapability` unchanged fails the boundary: that file imports both families. From `agent-plugins/connect` the mirror image needs about 10 functions plus 5 error classes |
| Hosted MCP store, vault, revocation, vocabulary | `mcp/federation/hosted` | **Works** after the split below. Canonical home of records, grants, admission fingerprint and error classes. Runtime needs only `mcp/federation`, `platform`, `core`. `node:crypto` is fine: this entry is `node` |
| Hosted sign-in | `integrations/api-connections/hosted-mcp` | **Your proposal holds, verified from manifests and imports, not run.** **R5:** the moved files import no `oauth`. They take `contracts/oauth` types and the host-passed `oauthFlow` and `loopback` (R5.3 edge 6). Same domain as `api-connections`. No `mcp`-`oauth` edge exists, since `integrations` is the only importer of `oauth` here. Value imports from the store and vocabulary become ports (§4). `ExternalMcpValidationError` and `ExternalMcpSecretStoreUnconfiguredError` are thrown through factories at the 12 sites in `external-mcp-oauth.ts`; `ExternalMcpReauthRequiredError` is defined there and moves with it. Types `FederatedCallTarget`, `FederatedGateVerdict` become local. `softwareId: "tovu"` and `clientDisplayName: 'Tovu'` (`external-mcp-oauth.ts:276`, `external-mcp-shared-oauth.ts:243`) become required input |
| Plugin key-card types and builders, **R4** | Types: none move (Jini's `agent-plugins/manifest` already has them, identical). Builders: `ui/mcp-ui/credential-card` | **Works.** Tovu's `contracts/core/plugin-credential-card.ts` becomes a re-export plus a binding of `app` (`:73`). Consumers get builders through `credentialCardForms` |
| Plugin state, **R4** | `agent-plugins/admin-surfaces` | **Moved from the API host row (Codex item 2).** Owns limits, key rules, ids, writes (`plugin-state.ts:1,20-22,46,104-140`). Local persistence contract over the retained API vault; **R5:** no `platform` import of any kind, and vault types come from `core/contracts/vault` (`./admin-surfaces` is `universal`, `credential-sets` is `node`). The API host receives the store |
| API host | `integrations/api-connections` | **R4: `host.ts`, `connect.ts` only; `plugin-state.ts` goes to `admin-surfaces`.** **Works, one file differs.** `surface-connections.ts` (188) implements agent-plugins' `AdminSurfaceConnections`, uses its value `ADMIN_SURFACE_ACTION_INTENTS`, and uses this host, so moving it anywhere keeps one crossing. It goes to `agent-plugins/admin-surfaces/connections` behind `AdminSurfaceConnectionsHost`. `createAdminSurfaceCallbackInbox` and `ADMIN_SURFACE_STATE_LIMITS` are passed in. `browser-binding.ts` stays: its link builders reach Jini as inputs |
| Members | `user-management/server/members` | **Smaller.** Zero isolation lines; `/members` needs one, and reaches `server` anyway |
| API keys | `user-management/server/api-keys` | Removable batch U3. **Trap:** T `features/identity/repo.ts:17` type-imports the API key types, so U1 leaves the `api_keys` methods in Tovu and U3 takes them |
| Custom credentials | **Pick: store and vault in `integrations/credentialed-http/sets`; tools in `integrations/credentialed-http/tools`** | **R5:** `store.ts`'s `isUniqueViolation` is host-passed, and vault types come from `core/contracts/vault`. The existing `db` and `platform` peers grant no exception (R5.1). Same domain as `buildAuthorizationHeader`. `credentialed-request.ts` stays (recon: mostly adapter). **R4: the moved tools reach it only through `CredentialedRequestPort`, and source control through `SourceControlWritePort` (`tool-registrations.ts:2,46-56,64,388`)** |
| Deploy ops, **R4** | `devops/deploy` | **Works with the C4 contracts (§4).** `run-ops.ts:6` credential operations and classes, `secrets.ts:6-7,56,62` site-key helpers and env/home lookup, `tool-registrations.ts:10` permission all become host input. Env and file lookup stay in Tovu. 995 lines, not 880 |
| Regular plugin runtime | `plugins/host/node`, `/worker` | §5.W. **R4: L1 splits by job.** Declarative content types go to `plugins/host`, **not** `cms/content-types`: tier rules are the plugin domain's, and a `plugins`→`cms` value edge would be new; CMS operations and reserved types arrive by contract. Policy, worker runner and SDK binding stay built in T `plugin-runtime.ts:274,283,284`; `invocation-core-deps.ts:15` loses `@tovu/sdk`; capability tools take content read, identity namespace and text as input |
| CMS catalogs | `cms/<area>/tools` | Precedent `navigation`, `media`, `entries`. Self-import within a domain is ok; `seo` reaching `media` or `post` needs ports |
| Commerce | Drop `cms`, in V0's one commit | `adaptLegacyAuthorize`, `requireToolPermission` are defined in `core/tool-permissions.ts` and exported from `@jini-ai/core`; `cms/core/tools/args.ts` re-exports. Edit `catalog-tools.ts:3`, `tools.ts:2`, using `LegacyToolAuthorizeFn as AuthorizeFn`. `UUID` is unbranded (`core/primitives/ids.ts:1`). Two test files keep `ForbiddenError` from `cms/core` through the dev dependency, which stays. `commerce/react` stays |
| Page routes | Stay in Tovu | |

**5.C Contracts split.** `T features/external-mcp/contracts.ts` splits two ways, with the two helper files:

| Lines | Content | Goes to |
|---|---|---|
| 408-530 (est) | `DeviceAuthorizationStore`, `ExternalMcpOAuthDeps`, `ExternalMcpOAuthService`: the only users of `@jini-ai/oauth` types (line 9) | `integrations/api-connections/hosted-mcp/contracts.ts` |
| Rest (~415) | Record, repo port, save inputs, views, connect start, targets, config, sealed payloads | `mcp/federation/hosted/contracts.ts`, **canonical** |
| 242 | `T contracts/core/external-mcp-auth.ts`, `external-mcp-access.ts`, the validation and unconfigured error classes | `mcp/federation/hosted`, **canonical** |

**Consumers declare what they read.** Connect holds `AgentPluginMcp*` types (§4). Sign-in holds its own row type. Neither imports `mcp`. Tovu's binders assign canonical to local; a shape mismatch is a compile error there and in `examples/neutral-host`. `mcp/federation/hosted` also exports `hostedMcpProjections`, about 10 lines, the six functions by consumer name. `instanceof` still works: each error is built by the canonical class via its factory, and `enable-access.ts:30` becomes `classifyError`. Rule 3 decides this, and §14 notes what it costs.

**5.W Worker, the real solution.** Don't move the worker file. `T server/runtime/plugin-tier2/worker.ts` imports `pluginHostBinding` by value, and `run-in-worker.ts` finds its entry and `typescript-bootstrap.cjs` by `import.meta.dirname`. A published entry can't reach a host binding, and moving the file changes packaged paths.
- **Moves:** `main` and `startIfWorker` logic to `plugins/host/worker` as `startTier2Worker({ binding, registerSdkResolver, ... })`. **R5: `createTier2WorkerRunner` (`run-in-worker.ts`) stays in Tovu.** It binds `@jini-ai/sandbox` to the plugin's required `tier2CallRunner`, and its env key stays with it.
- **Stays in Tovu at the same paths:** `worker.ts` as about 5 lines, `typescript-bootstrap.cjs`, `sdk-resolver.ts`, `host-binding.ts`. They bind `@tovu/sdk`. Packaged paths do not change.
- **Proof is X3, local on the packaged desktop app.** A cloud session can't do it. **Unverified: how the desktop app packs this file; I did not read it.** **R5:** `plugins` gets no `@jini-ai/sandbox` peer.
- **Trap (Codex):** `install-archive.ts` imports `agent-plugins/lifecycle/yauzl`, so `archiveReader` is a port.

**5.T Tier T, seams. Engine scope is the recon's: 8,514 minus 391, not all 15,872 lines of `features/theme`.**

*Theme, `cms/themes`, a new domain line in `cms`'s `jini.isolation.domains`.* `createThemeEngine(required, optional)` holds every crossing, and Tovu's old-path shims call it once, so 100+ callers keep their signatures and no call site gains a parameter.

| File | Crossing | Becomes |
|---|---|---|
| `static-render.ts` | `widgets/markers`, `listing`, `navigation/dropdown`, T `navigation/render-entry`, `agentic/core/handle`, `post-author`, `expand-partials` | Ports (§4). Warn-once `Set` at line 1225 moves into the engine's closure, because `HW3-module-state` refuses module state |
| `entry-list-render.ts` | `listing` | Port |
| `theme.ts` | `widgets/markers`, `cookie-consent/policy`, T `product-root`, T `platform/routing` | Ports, `productRoot`, `publicRoutes`. `DeclaredScript` local |
| `render-contract.ts` | `DeclaredScript` type, T `theme-slots` | Local type. `theme-slots` moves with it, as it holds no product name (first seam agent confirms) |
| `validation/manifest-v2.ts`, `validation/markup.ts` | `cookie-consent/policy`, `widgets/markers` | Ports |
| `theme-files.ts` | `platform/fs` | Stays an import: L2, optional peer already on `cms` |

**Stay in Tovu, decided:**
- `theme-trash.ts` (211): host-side. Production callers are composition roots (`app.ts:144`, `deps.ts:183`).
- `theme-file-import.ts` (180), `import-theme-file-tool.ts`: host-side. **No split needed:** the one re-exporter, `asset-operations.ts:14-19`, is tool-side and stays too. `asset-transfer` and `image-transform` keep importing it from Tovu. It reaches moved `theme-files.ts` through the shim, so `ThemePathError` identity holds.
- `public-page-security-headers.ts`: product resource loading and all three caches at lines 22-24.
- Tools, `publish-content.ts` and `active-theme-publish-content.ts` (bound to `features/publish-content`, which stays), previews, `visitor-publication.ts`, `code-tier-asset-normalizer.ts`, `build-conformance.ts`, `theme-watcher.ts`, `theme-roster-sync.ts`, `capability-card.ts`.

**Node dependencies:**

| Dependency | Used by | Decision |
|---|---|---|
| `handlebars` (value, line 1) | `handlebars-allowlist.ts` | New optional peer on `cms`, its own entry `cms/themes/handlebars`. T1e adds it, own commit |
| `liquidjs` (value, line 1) | `liquid-allowlist.ts` | Same, `cms/themes/liquid` |
| `parse5` | `validation/webmcp-markup.ts` | Optional peer already on `cms`. Runtime `node` entry, since `universal` forbids it |
| `@jini-ai/agentic` | `static-render.ts` | **Not declared.** Port |
| `@jini-ai/cookie-consent` | `theme.ts`, `manifest-v2.ts`, `render-contract.ts` | **Not declared.** Port, local type |

If a validation file imports either linter by value, it takes the linter as a port. T1b reads that and reports. Both linters are declared, never lazy-loaded.

*Post, `cms/post`, as is: no unification with `entries`.* `cover-image.ts:7` (`scanEmbedMarkers`), `featured-image.ts:1,44` (`findMediaByIdOrSlug`), `content-stats-tool.ts` (`sniffContentType`), `tool-registrations.ts` (`processOutbox`, `withPluginHookRefusals`, `resolveRuntimeMode`, `deriveDuplicateName`) become ports. `RESERVED_SEGMENTS` and `postPublicPath` become routing inputs. `AssistantSurfaceDeps` comes from `core`. Type-only imports of `cms/media` are allowed by isolation. **Stay in Tovu:** `publish-content.ts` (577), `template-options.ts` (31), `capability-card.ts`, `repo.sqlite.ts`. `preview-tool.ts` moves, its `site-inspection` call a port. Factory as for theme, one per process; 138 importers keep the barrel shim.

*Newsletter, `cms/newsletter`.* `delivery/tool-registrations.ts` (`UserRepoPort`, type) gets a local shape. `send-pipeline.ts` (`processOutbox`) port. `KeyringPort` from `platform/secrets`, not T `webhooks`. `platform/mail`, `http-kit/verified-origin` stay imports: low-level, optional peers on `cms`. `DataModuleDecl` from `db/data-modules` after V1. **Provenance is host-owned:** `J` exports `newsletterDataModule({ provenance })`; `T data-module-manifest.ts` keeps `{ sourceUrl: "builtin://newsletter", publisher: "tovu-core" }`, exactly. Any change triggers adoption refusal (`J@2364f89e7 db/data-modules/plugin-identity.ts:95-129`). Comments gets the same treatment in K2.

**Dependency check for every T seam:** an import from `@jini-ai/daemon/*`, `@jini-ai/user-management`, or another `cms` domain, even type-only across packages, becomes local. Values: theme's `createSurfaceExchangeStore` and `createTimeoutScheduler` are in tool files that stay. Post imports only the type. Newsletter `delivery/tool-registrations.ts:14,24,105` uses both by value as a default: `surfaces` becomes required, and Tovu's shim keeps that default.

**5.S SQL.** Default adapters in `<domain>/sql` behind ports. Kernel and table names injected. DDL host-owned. Each binding gets a type pin against `content-database.generated.ts`, because `kernel as unknown as` erases column checks (Opus, verified at `features/redirects`). Codex corrections apply: entries' invalidation is a hook; content-types owner resolver injected; trash registry contracts extracted; `outboxEventValues` goes to `cms/core` (10 pure lines), never `infra` (L6). `form-delivery`, `change-set` take `outbox_events` as a table input.

## 6. Keeping the shared-instance, transaction and cache traps safe

**This is the design's main risk.** Interfaces can't express these. Wiring can break them silently, and the bug would appear only under load or after a restart.

**Two defenses.** `@agent-note` tells the next host. For Tovu, **new T `server/runtime/composition/__tests__/wiring-identity.test.ts`** (V3) builds the real composition once and asserts `===` on the pairs below. It stays green unedited through every batch. Each row also has a behavior test, since `===` proves wiring, not effect.

| # | Must be shared | Source | Breaks how | Check |
|---|---|---|---|---|
| 1 | One `SurfaceExchangeStore`: tools and callback route | `deps.ts`, 13-14 such comments; `daemon/surface-exchanges.ts:413` | Answer unreachable until timeout | `===`; card answered via the route wakes the tool |
| 2 | One kernel across all repos | `kernel-core.ts:24`, nested transaction joins only the same instance | Partial commit, no error | `===` across every `<domain>/sql` binding; failing change-set rolls back rows and outbox |
| 3 | Repo object identity in hooks | `entries/repo.ts:126,219`, WeakMap by repo | **Stale authorization**, silently | `onWritten({ owner })` is exactly the repo the cache keys on; write, then read denied. Never wrap the repo; no async events |
| 4 | One `external-mcp-vault` module | Module-private symbol, `external-mcp-vault.ts:9,18,25` | Fails closed: nothing opens | P8g fixture; packed Tovu run; sign-in reaches it only through the port |
| 5 | One API connection host per site | `api-connections/host.ts:155` | Lost callbacks, double budgets | `===`; callback completes a tool-started sign-in |
| 6 | One `issuedTokens`, one `frozen` | Comments in `executable-tools/register.ts` | A token withheld from one path leaks in another | `===`, tool and admin handler |
| 7 | One activation queue | `activation-effects.ts:17-40` | Lost writes | Moved code never builds a queue; grep gate |
| 8 | Error class identity | `ExternalMcpValidationError`, `ExternalMcpReauthRequiredError`, `CustomCredentialValidationError`; **R4:** `PluginInvalidError` (L1a), `CredentialedRequestValidationError`, `CredentialedRequestTransportError`, `CustomCredentialNotFoundError`, `EgressRefusedError` through the C2/C4 classifiers | Route maps to wrong error | `instanceof` across shim, on packed code too. Factories build the canonical class; `validateToolNames` through the port throws what `classifyError` recognizes; OAuth start refusal still opens no card |
| 9 | Saved formats | `pluginStateFormat`, vault scope, AAD, `tovu_ak_`, `publisher: "tovu-core"`, `custom` + `vendor`, unsubscribe derivation, admission revision, approval fingerprint | Reconnect, boot refusal, rejected keys, dead unsubscribe links | Fixtures §7 |
| 10 | Mail wrap order | v5 P5m | Policy skipped | Mail golden |
| 11 | Ordering in connect | `connect-tool.ts`: approve, provision, sign in, revalidate | Grant before consent | Golden approval traces, unedited tests |
| 12 | Theme state | **Read at module level:** engine has only the warn-once `Set`, `static-render.ts:1225`. Product resources and header caches (`public-page-security-headers.ts:22-24`), roster `WeakMap`, watcher stay in Tovu. **Closures not read** | Double warnings; a second engine loses the once | One `createThemeEngine`; `===` on engine; G-theme counts file reads per page, before and after |
| 13 | One Post, one Newsletter service | Factories, as row 12 | Second instance writes outside the kernel | `===` |
| 14 | **R4:** plugin-state store and API host share one vault object | `host.ts:168` builds it over `vault` today; `plugin-state.ts:110` writes with revision checks | Two vault objects: revision checks race, a write lost or a conflict surfaced as an error | `===` on the vault behind both (extends `wiring-identity`, A4 move); A3's pin on format, scope, ids, label |
| 15 | **R4:** card app ids and text | `plugin-credential-card.ts:73`, `connect-card-ui.ts:46,95,117` | A renamed app id or changed copy: the client's card changes silently | G-card, `moved-tools*.golden`, connect goldens |
| 16 | **R4:** deploy fingerprint equals the security page's | `deploy-ops/secrets.ts:56` over T `webhooks` helpers | People compare two different values by eye | G-deploy |

**Also:** never a `createEverything` helper. No event bus. No DI container.

**Second host:** rows 1-6 reach it only as `@agent-note` text. I see no cheap enforcement. A published conformance test is a later item, once a real host exists.

## 7. "Finished" as a check

| # | Statement | Check |
|---|---|---|
| E1 | 14 contribution kinds parse in Jini; declared modules validate | Contract test, now in `examples/neutral-host` (V0). No `.todo`. At least 27 files. `consent` and `login-providers` files declare no module (read); `form-destinations` do, so they also pass `formDestinationMissingMethods` |
| E2 | Fake host, public exports only, runs §1's table | Neutral-host test, packed |
| E3 | Each listed Tovu file is thin | v5 §9 script: over 80 code lines is FAT. Text-only `*-messages.ts` exempt |
| E4 | Behavior unchanged | Goldens byte-equal, listed tests unedited, `tool-metadata.baseline.json` hash, no migration diff |
| E5 | Layers and subpaths hold | V0 records `pnpm guard`, layers and isolation by finding name. Each later run must match by name; none are repaired here. The more-jini-1 report names R8-package-metadata (6), SI-resolution (7), R10-chatpane-public-surface (1); session 1 named `R2-deep-path`. `check-package-layers.ts` has **no diff**. **`server` gains nothing** |
| E6 | A consumer installs it | Tarballs: neutral host, Tovu groups, strict `nodenext` type-check, plain `node` import of every new entry |

**Frozen:** `tovu-*.json`, `TOVU_FORMS*`, `/_tovu/*`, credential labels, `.tovu/managed-files.json`, `.tovu.zip`, publisher ids `tovu/<id>`.

**Goldens and fixtures, before the moves they protect:**

| Id | What | Protects | Status |
|---|---|---|---|
| P1b | `moved-tools.golden`: text, schemas, cards, approvals | Connect | Done, session 1. **Gaps:** `agent_plugin_set_access_token` isn't registered; cards rendered from form specs; counters missing. V3 filled the access-token part; **R4: the real-tool form-card renders are G-card** |
| G-card, **R4** | Real-tool renders through `buildPluginCredentialForm`/`applyPluginCredentialCard`: `pluginProvider`, plugin-card create, publish host, source control, access token with a credential card; counters | A1, A10, C3 | **Session 2, before A1 (R4.6 2.1)** |
| G-deploy, **R4** | `deploy_ops` secret list/set/unset text, both fingerprint kinds, confirmation and deny, permission refusal, publish-history entry | C4 | **Session 8, before C4** |
| G-mail | v5 P5m golden | Mail | In P5m |
| G-mcp | v5 P8g: frozen DB, three credentials, open, refresh, restart, rollback | Store, sign-in | Before H1a |
| G-cred | **`custom` and `vendor` rows**, owner, null scopes, hidden `vaultRecord`, CAS, kind-preserving writes (`vault-repo.ts:8-32,56-61,96-101`), rollback | Custom credentials | Before C1 |
| G-cms | Names, descriptions, schemas, approvals of 6 catalogs + webhooks, forms | Catalogs | Before K1 |
| G-plug | `plugins_*`, 15 `Tovu` words each a `messages` entry. **R4 adds:** capability-tool ids, names, descriptions (`capabilityToolIdFor`, `capability-tool-registrations.ts:208-215`); one declarative enable (create, keep, conflict, tombstone); one tier-2 call result and timeout; one before-save hook preview | `plugins_*`, L1 | **R4: own batch, before L1** (was before L2) |
| G-id | Saved: lock names (`identity/repo.ts:52`), MFA, passkey RP IDs, token and hash formats, `entry_refs` kinds, form job prefix | SQL, members | **Own batch, session 5, before S3 and U1** |
| G-keys | `tovu_ak_` key made at baseline still authenticates | API keys | First commit of U3 |
| G-theme | Rendered HTML byte snapshots per tier (declarative, templated, handlebars, static), file reads per page | Theme engine | Before T1a |
| G-post | Text and schemas of Post tools, SQL statements of the write path and search index, `postPublicPath` output | Post | Before T2a |
| G-news | **A token minted on unmoved code and frozen in a file, never re-minted.** Fixed key material, purpose `newsletter-unsubscribe`, `info` as `subscriberId:listId:consentRevisionId:campaignId`, both `campaignId` set and null (`??""`, `unsubscribe.ts:43-70`). Redeemed after the move with the same key material. Today's tests mint and redeem with one implementation, so they cannot catch this. Also tools golden; `publisher` unchanged | Newsletter | Before T3a |

## 8. What stands from session 1, and undoing the rest

| Work | Verdict |
|---|---|
| P0, P1b, P2a, P2b, P2c, P3 | **Stand.** All in domain homes: `devops/deploy`, `cms/forms`, `platform/object-store`, `platform/mail`, `agent-plugins/lifecycle/mail`, `user-management/server`, `cookie-consent`, `integrations/api-connections`, `agent-plugins/lifecycle/host-tools`, `core/text` |
| 5 reworded comments, and similar in P2b, P2c, P3 | **Stand.** Guard `N1` forces it. Amended rule: byte-exact unless `N1` refuses; then only those lines, in neutral words, listed in the report |
| 5 types prefixed `Plugin` | **Stand.** Tovu re-exports the old names |
| `search_agent_plugin_local` description names host tools, in Jini | **Fix in V0:** host input through `messages`. Golden unchanged |
| P1a `server` entries, peers, stubs, tests | **Undo in V0** |

**V0 undoes:** `./agent-plugin-host`, `./hosted-mcp` exports, their peers, `peerDependenciesMeta` and `optionalPeers` text in `J server/package.json`; `server/src/agent-plugin-host/`, `hosted-mcp/`; `tsconfig.neutral-host.json`, the `tsconfig` exclusion. **It restores** Server's `typecheck` to `tsc -p tsconfig.tests.json && tsc -p tsconfig.json --noEmit`, and **removes** the eight dev dependencies session 1 added for these tests (`agent-plugins`, `integrations`, `mcp`, `oauth`, `plugins`, `ui`, `search`, `devops`). **It moves** `server/src/__tests__/contribution-contracts.test.ts` and `neutral-host/**` to a new private workspace `examples/neutral-host`, with that tsconfig's settings. `pnpm-workspace.yaml` already covers `examples/*`, and the layer check walks only `packages/`, so that package may dev-depend on `cms`, `user-management`, `cookie-consent` and the rest. `user-management`'s `oauth` peer stands.

**Moving doesn't clear the `.todo`s; handlers are `undefined` at `contribution-contracts.test.ts:133-139`.** V0 implements them with existing public parsers and deletes the `.todo` branch at line 160:
- `consent`: `parseConsentContributions` from `@jini-ai/cookie-consent/plugins`.
- `form-destinations`: `parseFormDestinationsFile`, `asFormDestinationModule`, **and** `formDestinationMissingMethods` from `@jini-ai/cms/forms` (object validation alone misses a receiver with no `pull`).
- `login-providers`: `parseLoginProviders` from `@jini-ai/user-management/server`.
- Rebase `pluginsDir` (line 33) to `packages/agent-plugins`.

**`cloud/more-jini-1`:** merge the paired branches (Jini `2364f89e7`, Tovu `a0c60192c`) in V1, **after repaired V0**. Both descend from combine in Jini (checked). Then a Claude subagent reviews the integrated result, not Codex: public entries, shims, persisted names (`_plugin_migration_journal`, `_plugin_identity`, `p_{id}__`). Codex moved `cms/core/commands`, `db/data-modules` (1,975 lines). Comment rewording and old-name type aliases stand.

Its report records targeted passes and existing failures, **not a green repository** (report lines 65-97, 156-167). So the V1 gate is: `cms`, `db` `tsc --noEmit` and build; its own targeted lists, 79 importer files and 30 module files; layers, isolation and guard equal to V0's record by finding name; reviewer's report.

**Preserved, not fixed:** the report's two pre-existing revert behaviours, pinned by test L079: `force` without `principalKind` bypasses a stale version guard, and a later inverse failure leaves earlier inverse writes applied. V1 logs both in the bug file. Fixing them is separate. Also a stale header in `snapshot.ts`.

**`data-modules` is on the recon's trap list:** comments and newsletter hold `publisher: "tovu-core"`, and `plugin-identity.ts:95-129` refuses a mismatch. Those declarations did not move in that branch. K2 and T3 keep them host-owned.


## 9. Batches, in order

**Branch:** `cloud/extract` in both repos, from `origin/cloud/portable-fin`. Recorded points as v5 §8.
**Seam first, then move (from session 1's measurements).** P3 reached 289k moving 930 lines with its seams in one agent. So any batch needing port work splits: a **seam** agent changes the code in place in Tovu, tests green, no file moves; a **move** agent does `git mv`, import edits and shims, with no thinking about ports. Moves can be 1,500 lines. **Seam batches stay near 600 lines touched.** You asked for about 1,500 per batch; for port-heavy work that doesn't fit under the ceiling, per §12.

**Type:** **M** = mechanical. **J** = judgment. **Par** = can run side by side with the named lane. Line counts are moved lines; most are recon or v5 figures, measured from whole files, est for partial.

**Lane F, foundation. Serial, nothing else starts until V3 is green.**

| Id | Work | Lines | Type | Gate | Needs |
|---|---|---|---|---|---|
| V0 | §8 undo and neutral-host finish. **One commit: Commerce's source edits (§5) with its peer, `optionalPeers` text and lockfile.** Records the baseline by finding name. Run P-C1 from v5: pack, plain `node` imports, Tovu on tarballs for one group | 0 | J | Contract test has no `.todo`, three new checks green. `server` diff vs combine empty. Guard equals the record, no `L3-undeclared-edge` | - |
| V1 | Merge `more-jini-1` after V0, both repos. Review integrated. Fix findings that are new, never the two preserved behaviours | 1,975 merged | J | §8's gate | V0 |
| V2 | `core/surface-cards.ts`, `ui/mcp-ui/cards` with `satisfies`, `@agent-note` README, packed `.d.ts` check, `guard` on the tag | ~100 new | J | **Design tripwire: generics satisfy** | V0 |
| V3 | `wiring-identity.test.ts`, P1b gaps, §10 counters (skill reads per call, token lookup, the two mail rows). Neutral-host dispatcher `.todo`s (one human card, write approval, cancelling a call waiting on a person) become real tests with a test-only tool on public exports; any that public exports can't reach yet stays `.todo`, named in the report with the lane that fills it. Changesets for the `core/text` and `devops` deploy exports | 0 | J | Mutate one pair: red | V0 |

**Lane A, connect. Serial, one at a time; touches `agent-plugins`, `integrations`, `mcp`, `platform`.** Tests: v5 §7's lists for the matching batch. Unedited.

| Id | Work | Lines | Type | Ports | Needs |
|---|---|---|---|---|---|
| G-card | **R4.** Real-tool card renders, fixture only (R4.6 2.1) | 0 | J | - | V3 |
| A1 | v5 P5: `provider_status` → `host-tools`. `credential_save` router, card loader, `credential-cards` → `agent-plugins/connect` (`./connect` → `lifecycle`). **R4:** card types re-export Jini's `agent-plugins/manifest`; builders → `ui/mcp-ui/credential-card`, required `app` (R4.6 2.2) | 455 + ~60 new | J | `cardErrors`, `assertFreeField`, product inputs | G-card |
| A2 | v5 P5m mail: golden, fix `resend` bug (failing test first), glue → `lifecycle/mail`. **R4:** re-inventory by symbol; v5 ranges stale (R4.6 2.3) | ≤390 | J | v5 §4 mail rows | A1 |
| A3 | v5 P6a seams in place, small moves (`hook-http`, `byo-client`). **R4:** `browser-binding.ts` stays; plugin state not seamed here; first commit pins format, scope, ids, label (R4.6 2.4) | 102 | J | `storage`, loaders | A2 |
| A4 | **R4:** seam (session 2, R4.6 2.5) then move (session 3). `host.ts`, `connect.ts` → `integrations/api-connections`; `plugin-state.ts` → `agent-plugins/admin-surfaces` behind `AdminSurfacePluginStatePersistence`. API host receives `pluginState` | 745 | J then M | `callbackInbox`, `pluginState`, `signInLink`, `callbackPath`; `stateLimits` cut | A3 |
| A5 | Seam: `executable-tools/*`, `surface-connections.ts` off `plugins/host`, `integrations`, `admin-surfaces`, `cms/core`, `ui`. `surface-connections.ts` onto `AdminSurfaceConnectionsHost` | 626 touched | J | `contributions`, `connectionKey`, `adminSurfaces`, §4 host | A4 |
| A6 | Move A5 → `agent-plugins/connect/executable`; `surface-connections.ts` → `agent-plugins/admin-surfaces/connections`. Three isolation lines, two `jini.entries` | 626 | M | - | A5 |
| A7 | Seam: connect consumers onto local `AgentPluginMcp*` types, `projections`, `classifyError`, `isSignInRefusal` (§4). Tovu binder grows. Vocabulary files don't move yet. Test one error identity. **R4:** `cards` typed `AgentPluginCardsPort<Resource>` (generic), not a bare alias | ~400 touched | J | `projections`, classifier | A6 |
| A8 | Seam: `federate-mcp`, `enable-access`, `apply-connect-defaults`, `switch-on-saved-token`, `connection-status`, `service-ports`, `plugin-host`. **R4:** `plugin-host` gets required `grantSignedInDefaults` (§4); Tovu passes `grantDeclaredToolsToSignedInRows` (`plugin-host.ts:18,178`) | 1,257 touched, small edits | J | `lifecycle`, `activations`, `setPluginEnabled`, `uninstall`, **`grantSignedInDefaults`** | A7 |
| A9 | Move A8 → `agent-plugins/connect`. **R4:** gate: no moved file imports Tovu (grep) | 1,257 | M | - | A8 |
| A10 | Seam: `connect-tool`, `access-token-tool`, `connect-card-ui`, `connect-destination`, `connect-sign-in-wait`, `grant-signed-in-defaults`, `token-sign-in`, `import-access-token`, `apply-tool-renames`. They import each other by value, so must move together. **R4:** card split: waiters generic in `Resource`, builders take the `Omit` form, plugin-card forms through `credentialCardForms`, three app names through `appIds` | 1,672 touched, small edits | J, **hardest** | `cards`, `credentialCardForms`, `appIds`, `surfaces`, `approvals`, `messages`, `publicUrl` | A9 |
| A11 | **R4, recut by symbols:** move A10's files only. `tool-registrations.ts:114-158` (`buildAgentPluginConnectRegistrations` with the note handler `:125`, combined catalog/risk `:151-152`, contributor `:156`) **stays in Tovu** as host wiring, importing moved symbols through shims. Tovu's binder passes the moved grant function to `plugin-host` | ~1,672 | M | - | A10 |
| H0 | G-mcp (v5 P8g), no moves | 0 | J | - | V3 |
| H1a | §5.C: contracts, vocabulary, error classes, `hostedMcpProjections` → `mcp/federation/hosted`, oauth half → `hosted-mcp/contracts`. Tovu re-exports. Neutral-host type-check. Test error identity | ~780 | M, J review | none | H0, A7 |
| H1b | Move store, memory, vault, revocation → `mcp/federation/hosted`. Mostly pure | 2,063 | M, J check on the seal path | `metaParsers`, `assertFreeField` | H1a |
| H2 | Seam: sign-in off store, vocabulary and `browser-binding`; `api-connections` shims, `project-keys`, registration identity | ~400 touched | J | `store`, `projections`, `errors`, `signInLink`, `registrationIdentity`, messages, policy | H1b, A4 |
| H3 | Move → `integrations/api-connections/hosted-mcp`; neutral host signs in to Higgsfield | 1,544 | M | - | H2 |

**Over 630 lines, a J row means two agents, seam then move, per this section's rule. The seam stays near 600 lines truly edited, assuming most moved lines are unedited (§12; first seam agent checks).**

**R4: lanes S, K, U and tier T below are DEFERRED. They are kept for a later approval, not built in this extraction. Nothing in A, H, L, C depends on them (R4.1).**

**Lane S, SQL. Par with A, because it touches other packages. Each group is separately removable.**

| Id | Work | Lines | Type | Trap |
|---|---|---|---|---|
| G-id | Fixtures on unmoved code (§7). **Gate for S3 and U1** | 0 | J | |
| S1 | Seam + move: `taxonomy`, `navigation`, `presentation`, `workspace` | ~650 est | M | Pin against schema |
| S2 | `entries`, `content-types` | ~980 est | J, 2 | §6 row 3; owner resolver |
| S3 | Needs G-id. Identity: `repo` minus `api_keys`, `mfa`, `passkeys`, `recovery-codes` → `user-management/server/sql`. **Serialized with U1** | ~800 est | J, 2 | Lock names, sealed MFA |
| S4 | `trash` + extracted registry contracts | 967 | J, 2 | `registry.ts` stays |
| S5 | `settings` → `db/settings`; `gated-token`, `origin` → `db`, `http-kit` | 783 | M | |
| S6 | `outboxEventValues` → `cms/core`; `change-set`, `outbox`, `webhook`, `form-delivery` | 980 | J, 2 | Compensating rollback stays |
| S7 | `media-repo`, `versioned-media-repo` → `cms/media/sql` | 926 | J, 2 | Dynamic `selectFrom` targets, read first |
| S8 | `entry-refs` (688; `entry_refs` is saved; `widgets` domain), `memory-bus` (156, remove worker constant), `expand-partials` (86) | 930 | J, 2 | Do not enable blob GC's where-used check |

**Lane K, CMS. Par with A and U. After S.**

| Id | Work | Lines | Type |
|---|---|---|---|
| K0 | G-cms golden | 0 | J |
| K1 | Seam, move: `redirects`, `widgets` | 1,367 | J, 2 |
| K2 | `comments`, `seo`. Comments' provenance stays host-owned, as Newsletter's | 1,117 | J, 2 |
| K3 | `taxonomy`, `trash` | 1,404 | J, 2 |
| K4 | Leftover logic, part 1 (algorithms only; Codex: settings bindings and `trash/permissions.ts` map stay) | ~900 est | J, 2 |
| K5 | Leftover logic, part 2 | ~900 est | J, 2 |
| K6 | Webhook tools (585, one agent), forms tools (1,008, two). `forms` imports `assistant/tool-contributions`: port | 1,593 | J, 3 |

**Lane U, users. Par with A and K, but U1 starts only after S3 is integrated: both edit `user-management`.**

| Id | Work | Lines | Type |
|---|---|---|---|
| U1 | Needs G-id, S3. Members seams and domain part 1 → `user-management/server/members` | ~1,400 | J, 2 |
| U2 | Members part 2, tools (`cms/trash`, `cms/core` as ports; `auth-mail`, `subscriber-directory` stay) | ~2,770 | J, 4 |
| U3 | **API keys, included, independently removable.** G-keys. Service, secret, types, the `api_keys` repo methods. **Lift the exclusion in the same batch:** `api-key-service.ts`'s header quotes an `INFO.md` that doesn't exist in Jini; the real statement is in `user-management/docs/spec/behavior.spec.md:98` or `api.spec.md:309`, read first. Delete-user service, not `user-purge` | ~1,130 | J, 2 |


**Lane L, plugin runtime. Serial with A from L2, because it needs A9.**

| Id | Work | Lines | Type |
|---|---|---|---|
| G-plug | **R4: own batch, before L1.** §7 row, expanded to capability tools and runtime behavior | 0 | J |
| L1a | **R4.** Seam, content types: split `declarative-content-types.ts` by owner. Plugin manifest/tier policy for `plugins/host` (not `cms/content-types`); CMS operations through `DeclaredContentTypeCms`; required `reservedKeys`; `RESERVED_KEYS` into the closure | ~355 touched | J |
| L1b | **R4.** Seam, runtime bindings: moved factory requires `pluginSourcePolicy`, `tier2CallRunner`, `pluginSdkBinding` (built in T `plugin-runtime.ts:274,283,284`); `invocation-core-deps` binding contract, no `@tovu/sdk`; `capability-tool-registrations` content read/preview, `identityNamespace`, tool text as input | ~600 touched | J |
| L1c | **R4.** Move: §5.W. `plugin-runtime` core, `capability-tool-registrations`, `install-archive`, `admin-response`, `invocation-core-deps`, `declarative-content-types` → `plugins/host`, `/node`, `/worker`. **R5: `run-in-worker` stays in Tovu; no `sandbox` peer.** No replacement platform coordinator | ~1,990 | M |
| L2 | Seam on `plugins_*` onto the local contract (§4): cross-family capability, `executeCommand`, `approvalFingerprint`, error classifiers. **R4:** G-plug already ran; needs A11 integrated | 1,731 touched | J |
| L3 | Move → D1's home | 1,731 | M |

**Lane C, credentials. After A11.**

| Id | Work | Lines | Type |
|---|---|---|---|
| C0 | G-cred, fixtures on unmoved code | 0 | J |
| C1 | Store, vault repo, types, small → `integrations/credentialed-http/sets`. Owner, metadata parsing, project and vendor operations injected | ~890 | J, 2 |
| C2 | Seam: tools off `source-control`, `deployments`, `settings`, `ui`, `daemon`. Two agents, ~950 each. **R4: agent 1 first adds `CredentialedRequestPort` and `SourceControlWritePort` (§4) and writes the per-handler helper inventory; card builders through `credentialCardForms`. R5: both ports go in `core/contracts/credentials`; `uriNamespace` threads `credential-copy-tool.ts:95`** | 1,897 touched | J, 2 |
| C3 | Move tools. **R5: blocked by any unresolved inventory row, any Tovu import (value or type), or any checker failure (R5.6)** | 1,897 | M |
| G-deploy | **R4.** §7 row, before C4 | 0 | J |
| C4 | Deploy-ops → `devops/deploy`. **R4:** seam declares `credentials`, `siteKey` (`read`, `fingerprint`), `publishHistory`, required `permission`, `approvals`, `messages` (§4); env/file lookup stays in Tovu; nothing from custom-credentials or webhooks moves into `devops` | 995 | J, 2 |


**Small, session 1:**

| Id | Work | Lines |
|---|---|---|
| Z2 | J `server/src/lifecycle/*`: **delete the dead copy.** Adopting it would change failure cleanup: T stops prepared modules, J only started ones (`boot-lifecycle.ts:62-74`, Codex). Tovu keeps its own | ~190 removed |

**Checkpoints (R6; R5.10's sessions govern):** Claude C-a after A7, session 3. Claude C-b after A11, session 4. Claude C-c after H3, session 5. **Claude C-d plugin-only**, after C4, session 9: E1-E6 limited to §1's plugin classes and files moved in A, H, L, C; G-card, G-plug, G-cred, G-deploy and connect goldens equal (v5's checkpoint steps). **Final:** X1 packed proof with seeded replay (v5 P10a) **on a throwaway clone of the `cloud/extract` tip, not `cloud/portable-fin`; the old checkout only for the rollback replay**; X2 full suites and report (v5 P10b); X3 packaged-app worker proof, local, session 10.

**Tier T. Runs after lane C and before C-d, X1, X2, so the final proof covers it. Serial: all three edit `cms/package.json`. Needs S and K for `presentation`, `widgets`, `media`, `outbox`. Seam (file stays in Tovu, tests green) then move, as §9 says.**

| Id | Work | Lines | Type |
|---|---|---|---|
| G-theme | §7 fixture on unmoved code. Reads engine closures for caches | 0 | J |
| T1a | Seam: `static-render.ts`. `themes/ports.ts`, `createThemeEngine`, warn-once into the closure | 1,392 touched | J |
| T1b | Seam: `theme.ts`, `validation/markup.ts`. Reports how validation reaches the linters | 1,309 touched | J |
| T1c | Seam: `entry-list-render.ts`, `render-contract.ts`, `validation/manifest-v2.ts` | 1,284 touched | J |
| T1d | Move `validation/*` → `cms/themes`. New domain line, `jini.entries` | 1,613 | M |
| T1e | Move linters, `migration/*`, small. `cms/themes/handlebars`, `/liquid`, two optional peers, lockfile in its own commit | 1,561 | M |
| T1f | Move `static-render`, `render-contract`, `entry-list-render` | 2,128 | M |
| T1g | Move `theme-files`, `file-identity-lock` | 1,641 | M |
| T1h | Move `theme.ts`. Tovu shim calls the factory once | 1,180 | M |
| G-post | §7 fixture | 0 | J |
| T2a | Seam: `cover-image`, `featured-image`, `repo`, `repo.memory`, `go-live`, `post.ts` routing inputs | ~1,400 touched | J |
| T2b | Seam: `tool-registrations.ts` | 1,539 touched | J |
| T2c | Seam: `agent-tools.ts`, `content-stats-tool`, `preview-tool`, `reverters` | ~1,600 touched | J |
| T2d | Move `post.ts`. Over target: `git mv`, few reads | 2,609 | M |
| T2e | Move `repo*`, `search*` → `cms/post`, `cms/post/sql` | ~1,833 | M |
| T2f | Move rest of the domain | ~1,164 | M |
| T2g | Move `tool-registrations`, stats, preview → `cms/post/tools` | ~1,796 | M |
| T2h | Move `agent-tools`, the rest. Barrel shim for 138 importers | ~1,005 | M |
| G-news | §7 frozen token, tools golden | 0 | J |
| T3a | Seam: `send-pipeline`, `unsubscribe`, `data-module-manifest` with required provenance | 907 touched | J |
| T3b | Seam: `tool-registrations`, `delivery/tool-registrations`: `UserRepoPort` local, `surfaces` required | 752 touched | J |
| T3c, T3d, T3e | Three moves → `cms/newsletter`, `cms/newsletter/sql`, `cms/newsletter/tools`. T3e runs G-news redeem on packed code | 5,097 total | M |


**Manifests and lockfile (session 1 was blocked here).** Old rule, "only P1a and P10b edit the lockfile", is retired.
- **No advance peers.** V0's lockfile edit is Commerce, Server and `examples/neutral-host` only. The batch needing a dependency adds it.
- Later `exports` and `jini.entries` edits don't change the lockfile, and lanes touch different packages.
- In a serial lane, the batch regenerates with `pnpm install --lockfile-only` in its own commit. In a parallel lane it stops and reports; the coordinator does it between batches.
- Lockfile conflict: never hand-merge. Take theirs, regenerate.
- Tovu: `npm ci` as is. No Tovu lockfile change expected.
- Changesets: one per package, each batch, conflict-free by filename.


**Side by side:** A, S, K can run at once in separate sessions; U joins after S3. Conflicts remain possible in `cms/package.json` between S and K, so K runs after S, and tier T runs last and serially. `user-management` conflicts between S3 and U1 are why U1 waits. **Sharing a Tovu branch needs care:** each lane on its own branch, integrated at checkpoints by one agent. Parallel saves hours, not tokens; integration costs about 100k per merge (est).

**Do not run side by side:** anything in A with L2, C or H; anything that moves `T features/agent-plugins`. **R4:** H and C serialize (both change `integrations`); L1 may run beside A on its own branch; see R4.4.

## 10. Memory and I/O cost, per batch: frequency x size

**Rule: counters equal before and after. No optimization during extraction.** v5 §10's table stands.

| Batch | Hot path | Frequency x size | Change |
|---|---|---|---|
| A1 | Card load, `provider_status` | Each call x 32 cards x 16 fields; one settings read per provider plugin | None |
| A2 | Mail: `listByWorkspace` of all credential rows, metadata only | Each send; newsletter once per recipient | None. **Candidate for later** |
| A4 | Contribution reload per token lookup; `vault.list` of all rows on state write | Each token read; each settings write | None. **Candidates** |
| A5-6 | State read | Each tool call x one sealed row | None |
| A8-9 | Boot provisioning | Once x enabled plugins | None |
| A10-11 | Connect | Each connect x bounded reads | None |
| H1b | `toView` opens up to 2 envelopes per row | Each list x rows | None |
| H3 | Federated call | Each call x 1 read, at most 1 leased refresh | None |
| S1-S8 | Queries | Per request and write; byte-identical text | Module load only |
| S8 | `extractEntryRefs` | Each entry write x body, in the transaction | None |
| K1-K6, L3 | Tool catalog | Per turn x ~328-425 names, bytes equal (session 1 measured 328 names, 751,493 bytes) | None |
| L1 | Discovery fresh on each lookup, O(p log p) plus I/O | Each lookup x installed plugins. **Not measured. Worth a look later** | None |
| U1-2 | Session reads | Per request x one row | None |
| T1 | Theme read: template and file reads | Per public page x files per template. **Module caches read (§6 row 12), closures not.** G-theme counts reads | None. Counts equal |
| T2 | Post write and search index update; public read | Per write x body; per request x one row | None, byte-identical SQL |
| T3 | Send pipeline per recipient; token derive per link | Per send x recipients x one derive | None |
| A7, H1a, H2 | Projections, factories | One extra function call, no I/O, no retained state | None |

**Memory:** one more Node entry per subpath, loaded only if imported. Fresh worker per tier-2 call, unchanged.

## 11. Rules for every batch

v5 §5's rules, §6's commands, §8's resync and golden rule stand, with these changes:
- Target is the domain subpath, never `server`.
- `(requiredObj, optionalObj)`. Complexity under 11. No inline lint disables. No vendor in core. `check-package-layers.ts` gets no edit.
- **R5: no import of another Jini package except `core`, value or type (R5.1).** A shared type goes in `core/contracts/<area>`. A consumer's own narrow need is a local port. `pnpm check:cross-package` runs in every gate.
- Comments: amended per §8.
- Each new contract: `@agent-note` where types can't say it.
- Bugs: failing test first, red, mutate, fix. **Report each in `development/open-bugs.md`. That file doesn't exist in either repo (session 1 finding); create it, or use the report.**
- **R6: Codex Cloud builds plugin extraction, one task per session, batches serially, no per-batch subagents.** Claude reviews the later lane checkpoints in R5.10; F6/F7/F8 remain mandatory. Hours caps replace token caps and context accounting.
- **X3 (packaged app):** local, one agent, real `npm run desktop` build, a tier-2 plugin save succeeds and times out correctly.

**Landing:** Jini merge, owner `npm publish`, Tovu pin, Tovu merge, deploy. Tovu shims import new entries, so Tovu can't land first.

## 12. Estimates, recalibrated

**Measured (session 1, final-context per agent):**

| Batch | v5 est | Measured | Ratio | Moved lines |
|---|---|---|---|---|
| P0 | 110k | 115k | 1.05 | 0 |
| P1a | 130k | 225k | 1.73 | 0, tests |
| P1b | 90k | 205k | 2.28 | 0, tests |
| P2a | 185k | 207k | 1.12 | ~785 |
| P2b | 130k | 185k | 1.42 | ~450 |
| P2c | 150k | 188k | 1.25 | ~494 |
| P3 | 160k | 289k | 1.81 | ~930 |
| Total, with coordinator ~95k | 1.18M, excl. C1 | **~1.51M** | 1.28 | ~2,660 |

Measured ratios are 1.05 to 2.28. **The brief's "1.6x to 2.3x" is the report's wording; its table shows that range only for P1a, P1b, P3.** Wall clock: 1 h 46 min for 7 batches, 15 min each. Codex: 1,975 mechanical lines in 19 min; its tokens were not measured. Weekly usage: 73% to 75% across session 1, the recon and the debate; display rounds to 1%.

**Three formulas. Only the first is fit to measurements.**
- **Judgment batch = 135k + 150k per 1,000 lines** (fit by eye to 4 points, not a model). P2a predicts 253k (actual 207k), P2b 203k (185k), P2c 209k (188k), P3 275k (289k). So under **a 230k target ceiling, a judgment agent handles about 630 lines.** A 1,500-line port batch predicts 360k: over the 300k ceiling. Hence §9's split.
- **Move agent = 100k + 60k per 1,000 lines** (ESTIMATE, never measured in this form). A pure move needs few reads; 1,500 lines ≈ 190k. First move agent (A4 or A6) measures this.
- **Seam agent, small edits in large files = 135k + 85k per 1,000 lines touched** (ESTIMATE, back-solved from revision 1's A8 and A10, unmeasured). First seam (A5 or A8) measures this. **If either runs over 1.4x, re-cut the remaining batches of that type before continuing.**

Fixtures at 170-200k and checkpoints at 120k are carried from revision 1. Set by hand, not by formula: V0, A2 (test-heavy), A4, A7 (new contracts), H2 (more ports), S1. **J batches over 630 lines now split into seam + move. Revision 1 listed them at 230k, which its own formula contradicts; that is most of the rise.**

**Per batch, final-context, Claude Cloud. Estimates, in k:**

| Lane | Batches | Agents | Sum (k) |
|---|---|---|---|
| F | V0 230 (Z1 folded in), V1 200, review 180, V2 170, V3 200, Z2 80 | 6 | 1,060 |
| A | A1 203, A2 230, A3 159, A4 200+150, A5 229, A6 138, A7 200, A8 242, A9 175, A10 277, A11 203 | 12 | 2,406 |
| H | H0 200, H1a 147, H1b 224, H2 230, H3 193 | 5 | 994 |
| S | G-id 200, S1 170, S2 218+159, S3 203+148, S4 217+158, S5 147, S6 218+159, S7 214+156, S8 214+156 | 15 | 2,737 |
| K | K0 200, K1 251+182, K2 230+167, K3 254+184, K4 212+154, K5 212+154, K6 223 + 221+160 | 14 | 2,804 |
| U | U1 254+184, U2 253+253+183+183, U3 231+168 | 8 | 1,709 |
| L | L1 220+220+219, L2 282, L3 204 | 5 | 1,145 |
| C | C0 200, C1 211+153, C2 216+215, C3 214, C4 210+153 | 8 | 1,572 |
| Checkpoints, final | C-a, C-b, C-c, C-d 120 each, X1 220, X2 180, X3 150 | 7 | 1,030 |
| **Subtotal before tier T** | | **80** | **15,457** |
| T theme | G-theme 200, T1a 253, T1b 246, T1c 244, T1d 197, T1e 194, T1f 228, T1g 198, T1h 171 | 9 | 1,931 |
| T Post | G-post 200, T2a 254, T2b 266, T2c 271, T2d 257, T2e 210, T2f 170, T2g 208, T2h 160 | 9 | 1,996 |
| T Newsletter | G-news 170, T3a 212, T3b 199, T3c-e 202 each | 6 | 1,187 |
| **All agents** | | **104** | **20,571** |
| Coordinators | 50k per session + 12k per agent (session 1 measured ~95k for 7): 19 x 50 + 104 x 12 | - | 2,198 |
| **Total** | | **104 agents** | **22,769 ≈ 22.8M** |

**Rows over 230k expect a handoff at 200k: A8, A10, K1, K3, U1, U2 seams, U3, L2, every T1 and T2 seam, T2d.** The caps hold one handoff per session; several in one session stop it, by design.

**Range:** 16M to 32M at the same 0.7x-1.4x spread. Session caps stop at 28.4M. Moved: ~36,700 lines before tier T, ~21,600 in tier T, plus 2,660 + 1,975 done (est; recon inventories include Codex's "upper bound" warnings).

**Against revision 1's ~17.8M, about 5M more:** ~3.7M from the splits and small additions (G-id, H1a, K6, seams), ~1.3M from counting coordinators by the formula per session rather than as ~0.9M. Rejecting D2 itself adds little: A7 200k vs 180k, H1a 147k.

**Weekly share (rough):** the 2-point rise covers 1.51M plus the recon and the debate, unmeasured. So at most about 1.3% per 1M, and rounding allows 0.7% to 2%. **~22.8M ≈ 16% to 46% of a week, about 30%.** Before tier T's 5.6M with its coordinators, ~17.2M ≈ 22%. Not a dollar figure. Unknown whether cached re-reads count.

**Hours, Claude Cloud:** 15 min per batch measured on 0-930 line batches; budget 25 min. 104 agents ≈ 43 h serial. Three or four lanes ≈ 22-26 h, since tier T and lanes L, C are serial. Over several days at the owner's pace.

**Hard caps. On any cap: push, report, end. Each session is a separate owner approval by name.**

**R4: for sessions 2 onward this table is superseded by R4.5 (sessions 2-10, plugin lanes only). Its S, K, U and T rows are deferred; its session numbers no longer apply.**

| Session | Batches | Agents | Est incl. coordinator (k) | Cap | Hours cap |
|---|---|---|---|---|---|
| 1 | V0, V1, V1 review, V2, V3, Z2 | 6 | 1,182 | 1.5M | 4 |
| 2 | A1, A2, A3, A4 (2), A5, A6, C-a | 8 | 1,575 | 1.9M | 5 |
| 3 | A7, A8, A9, A10, A11, C-b | 6 | 1,339 | 1.7M | 4 |
| 4 | H0, H1a, H1b, H2, H3, C-c | 6 | 1,236 | 1.5M | 4 |
| 5 | G-id, S1, S2 (2), S3 (2) | 6 | 1,220 | 1.5M | 4 |
| 6 | S4 (2), S5, S6 (2) | 5 | 1,009 | 1.3M | 4 |
| 7 | S7 (2), S8 (2) | 4 | 838 | 1.1M | 3 |
| 8 | K0, K1 (2), K2 (2) | 5 | 1,140 | 1.4M | 4 |
| 9 | K3 (2), K4 (2), K5 (2) | 6 | 1,292 | 1.6M | 4 |
| 10 | K6 (3) | 3 | 690 | 0.9M | 2 |
| 11 | U1 (2), U2 (4) | 6 | 1,432 | 1.8M | 4 |
| 12 | U3 (2), removable | 2 | 473 | 0.6M | 2 |
| 13 | L1 (3), L2, L3 | 5 | 1,255 | 1.6M | 4 |
| 14 | C0, C1 (2), C2 (2), C3, C4 (2) | 8 | 1,718 | 2.1M | 5 |
| 15 | G-theme, T1a-T1h | 9 | 2,089 | 2.6M | 6 |
| 16 | G-post, T2a-T2h | 9 | 2,154 | 2.6M | 6 |
| 17 | G-news, T3a-T3e | 6 | 1,309 | 1.6M | 4 |
| 18 | C-d, X1, X2 | 3 | 606 | 0.8M | 2 |
| 19 | X3, local | 1 | 212 | 0.3M | 1 |
| **All, 19 sessions** | | **104** | **22,769** | **28.4M** | **72** |

Cap = 1.2 x estimate, rounded up to 0.1M. Hours cap = agents x 25 min x 1.5, rounded up.

Session 1 re-derives every later number from its measurements. Over 1.4x: stop and rethink. Two fix rounds with same-class findings: stop and question the design. Every brief opens with the context clause; **agents hand off at 200k**, hook warns at 250k.

**Codex Cloud, separately. Its unit differs: wall clock and its own credit meter.** One measurement: 1,975 lines in 19 min, ~100 lines/min, mechanical, including its proof steps as far as I know (report unread). No token rate.

| Work | Fit | Est |
|---|---|---|
| All **M** and move agents | **Good.** Pure moves, clear gates | ~58,000 lines ≈ 10-20 h of runs, at 50-100 lines/min. One run per batch |
| Lanes S, K: seam plus move in one job | Possible, once a pilot shows it keeps tests unedited | Pilot S1 first |
| **J** and seams: V0, V2, A5, A7, A8, A10, H2, S2, S3, C0, C2, U1, L1, L2, T1a-c, T2a-c, T3a-b, all G-* | **Keep to the stronger judge.** These decide contracts or hold saved formats | Don't estimate; no data |

Past overbuild findings say keep "smallest change" and "no new helper" in each Codex prompt, self-contained, with personas. Codex's prompts must say `tsc --noEmit` on touched Jini packages. ≤6 at once.

**Builder neutral:** either can build any row. The owner chooses.

## 13. Decisions still open

| # | Question | Recommendation |
|---|---|---|
| D1 | `plugins_*` tools: `agent-plugins/connect` as you said, or `plugins/host/tools`? | **`plugins/host/tools`,** with a local cross-family contract. Fewer ports. Your rule holds both ways |
| D3 | Cards contract as neutral types in `core`, builders in `ui`? | **Yes.** It avoids three copies. V2 proves assignability with no `core→ui` and stops early if it fails |
| D5 | Who owns table DDL? | Leave with the host until a second host exists. A second host can't boot from Jini alone until then |
| D8 | Who builds? | **R6 owner decision: Codex Cloud builds plugin extraction**, one task per session with hours caps. Claude reviews later checkpoints in R5.10. §12's Claude token estimates are historical |
| D9 | Approve session 1 only, with its caps? | **Yes:** 6 agents, 1.5M, 4 h. Everything after re-derives from it |
| D10 | Seam-then-move in every lane? 104 agents and ~22.8M, instead of 1,500-line batches | **Yes.** Measured: 1,500 port lines don't fit one agent. Session 2 measures the seam and move formulas, and the plan re-cuts over 1.4x |


## 14. What the proof does not show

v5 §13 stands, minus "`@jini-ai/server` acceptable", plus: `@agent-note` guarantees are unenforced in a second host; the cards contract has one real implementation; local MCP contracts copy about 100 fields, so a canonical change needs edits in two consumers, caught at compile time only where the neutral host or a real binder assigns them; a wrongly passed projection of the right type is not caught at all; SQL adapters may freeze columns (additive-only, or every host migrates).

## 15. UNVERIFIED. Nothing here ran. Measured vs estimated is marked throughout

**Not read or not settled:**
1. `cloud/reports/more-jini-1.md`: read baseline, commands, results and bugs (about lines 60-100, 150-175, 214-226 and a grep). The rest was not read. V1 reads it all.
2. `check-package-layers` handling of `examples/` beyond `packagesDir`, read but not run.
3. **How the desktop app packs the worker.** A grep of `apps/desktop` for `plugin-tier2` and `typescript-bootstrap` at combine found nothing, which doesn't settle it. §5.W is designed from `run-in-worker.ts` and `worker.ts` only.
4. Whether any `scripts/check-*` rejects unknown doc tags. Grep shows `@complexity` in their comments only; not proof. V2 settles it.
5. Which of `behavior.spec.md:98`, `api.spec.md:309` holds the API-key exclusion: grep hits, not read in full.
6. `T contracts/core/plugin-credential-card.ts` body: `apply` uses `SecretCardForm` as a type only (read), the rest not.
7. Exact line ranges in §5.C ("est"); local field counts ("about 60", "about 100") are from counting declarations, not from writing them.
8. `api-connections/host.ts` internals beyond imports; final shapes behind the `unknown`s in `AdminSurfaceConnectionsHost`.
9. `credential_save`'s, access-token tool's and CMS catalogs' exact port lists; first seam agent confirms.
10. **Tier T:** inventory is from `from` import lines of non-test files, per file. Bodies were read only for `static-render` imports, `public-page-security-headers`, `asset-operations` head, `unsubscribe` and the manifest. Theme closures, whether validation imports the linters, and T's `escapeHtml` vs `core/text`'s signature are unread. T seam and move line groups are estimates. `theme-slots` moving is assumed from a zero-hit grep.
11. **S, K, U, C splits:** this revision applied the formula to revision 1's line counts. It did not re-read those files. Whether their seams really stay near 600 edited lines is unknown.
12. **Assignability of canonical MCP types to the local contracts,** and `isolation.entries` for three connect keys passing `pnpm guard`: read, not run.


**Also unverified:** `satisfies` over generic signatures (V2 is the test); `./connect` reaching `src/lifecycle` internal files; dual ESM/CJS class identity on tarballs (X1); test names from v5 and recon, mostly unchecked (a missing name is a report line); all line counts for S1-S8, K4-K5, U1-U2 splits; all token, hour and share figures except §12's measured table; seam and move formulas; Codex rate from one job.

**Measured or directly read:** layer table and ban (`check-package-layers.ts`), isolation domain rule and type-only skip, exact-key overrides (`check-subpath-isolation.ts`), manifests of `agent-plugins`, `integrations`, `mcp`, `user-management`, `core`, `platform`, `db`, `plugins`, `cms`, `commerce` at combine; `UUID` unbranded; Commerce imports; Server diff on `portable-fin`; contract test lines 20-40, 125-170; parsers named in V0; who imports `theme-trash.ts`, `theme-file-import.ts`, `asset-operations.ts`; Tovu root declares `handlebars`, `liquidjs`, `parse5`; imports of the connect, hosted, API, credentials, plugin-runtime files; `plugin-host.ts`, `contracts/headless/plugin-host.ts`, `executable-tools/register.ts`, `surface-connections.ts`, `browser-binding.ts`, `external-mcp-access.ts`, `run-in-worker.ts`, `worker.ts`, `service-ports.ts`, `agent-plugin-service-ports.ts`, `connect-card-ui.ts`, `connect-destination.ts`, `connect-sign-in-wait.ts`, `sign-in-card.ts`, `secret-card.ts` head, `human-confirm.ts` handler; `plugin-identity.ts:95-129`; session 1's report.
