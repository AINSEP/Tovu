# Extract canary #2: features/vendor-credentials + features/project-keys (rg only, no CBM)

Persona: AI-Dev-Shop/agents/codebase-analyzer/skills.md (graph gate skipped by dispatch: control method, rg/git/read only).
Tovu fad66fb87, Jini f6fa96ae3 (0.7.1). Read-only: nothing edited, built or tested.

**Slice correction:** the dispatch said 14 files; the two folders hold **16** non-test files (8 + 8), 913 lines (355 + 558). All 16 were read in full (100% of lines).

## Sampling notice

- Read in full: all 16 slice files. Jini: `integrations/credentialed-http/sets/{host,vault-repo,index}.ts`, `core/contracts/vault/vendor-credential-sets.ts`, `platform/secrets/credential-sets/vault.aad.ts`.
- Read in part: Jini `core/contracts/credentials.ts` (project-scope block), `core/contracts/vault/ports.ts`, `platform/secrets/aad.ts`, `platform/.../vault.repo.memory.ts` (`findDefault`), `agent-plugins/admin-surfaces/plugin-state.ts` (row-id code), `integrations/credentialed-http/tools/credential-tool-operations.ts` (`guardRepo` port). Tovu outside the slice: `platform/secrets/vault-kinds.ts` (~140 lines), `platform/secrets/store-vault-guards.ts`, `custom-credentials/tovu-credential-sets.ts` (host object), `source-control/credential-setup.ts` (wrapper), `composition/source-control-key-binding.ts`, `composition/deps.ts` (project-vault wiring), `publish-credentials/repo.memory.ts`.
- Not checked: Tovu tests (counted only), Postgres dialect of `attachments.ts` SQL.
- Confidence: labels high for 14, medium for `service.ts` and `vault-adapter.ts` (MIXED splits are judgment).

## 1. Per-file table

Signals: **T** = Tovu feature/contracts/platform import, shown as resolved under R7 (`T:webhooks`/`T:contracts` that only re-export Jini are marked `→J`). **J** = Jini. **N** = node. **In** = importers (prod / test), rg over apps/ packages/ content/ scripts/ with folder-qualified specifiers, `#src/` aliases and inline `import()` in both quote styles. **lit** = code literals, comments stripped.

### vendor-credentials (8 files, 355 lines)

| File | Lines | Signals | Label | Jini home / host contract | Reason |
|---|---|---|---|---|---|
| abort-guarded-repo.ts | 37 | J: platform (type `VaultRepoPort`, also in core/contracts/vault). No T, no lit. In: 4 / 3 (publish-agent-tools, custom-credentials/tool-registrations, source-control/credential-setup, composition/source-control-key-binding) | **MOVE** | `@jini-ai/platform/secrets/credential-sets` (`abortGuardedCredentialRepo`). It is the only implementation of Jini's existing `CredentialToolPolicy.guardRepo` port (integrations/credentialed-http/tools); hosts keep injecting it | Pure Proxy decorator, product-free. Also: credential-setup's hand-rolled `sourceControlSaveVault` + repo wrapper should be replaced by it (behaviour diffed, see S1). |
| project-scope.ts | 59 | T:webhooks→J (KeyringPort/SecretSealerPort, in core/contracts/vault). lit: `"site"`, `"project"` (scope values). In: 4 / 1 (index, source-control types/repo.memory/source-control-credential-repo) | **MIXED: types DEDUPE, functions MOVE** | Types → `@jini-ai/core/contracts/credentials`: `CredentialScope` = core `CredentialSetScope`; `ScopedCredentialDeps<D>` = integrations `CredentialSetScoped<D>`; `WithProject` = integrations `CredentialSetScopeCarrier` (move those two from integrations/sets/host.ts down to core first so platform can use them). `CredentialProjectHalf<R>` becomes core's generic project-half (core `CredentialSetProjectScope<C>` = it over `CredentialSetRepoPort<C>` + `inventoryRepo`). `credentialScopes` / `credentialCreateTarget` → `@jini-ai/platform/secrets/credential-sets` as the default scope policy | Same shapes, different names (a name match finds none of them). Implementer check: `custom-credentials/tovu-credential-sets.ts` passes `scopes: credentialScopes, createTarget: credentialCreateTarget` into Jini's `CredentialSetStoreHost`, so these functions ARE that port's implementation. Jini deliberately keeps scope policy a host input; ship these as the default the host passes, not a hard-coded rule. |
| vendor-credential-repo.ts | 11 | J: db x2. T: platform/db ContentKernel, self via `#src/features/vendor-credentials/*` alias. In: 1 / 1 (.sqlite alias) | **STAY-WIRING** | composition: `SqlSecretsVaultRepo({kernel})` | Binds Tovu's ContentKernel to the Jini SQL vault with the `as unknown as StorageKernel` double cast (same as source-control-credential-repo). One composition line once the adapter moves. |
| vendor-credential-repo.sqlite.ts | 10 | local only. In: 1 / 2 (composition/deps) | **DELETE** (empty subclass alias) | none | `class X extends Y {}` kept for call-site names. |
| types.ts | 62 | J: platform (types). T:contracts→J (`CredentialTokenHint` re-exports platform/secrets/credential-token), T:webhooks→J. In: 5 / 4 (static-publish credentials/verify, own folder) | **MOVE** (fold into Jini) | `@jini-ai/core/contracts/vault/vendor-credential-sets.ts`: add optional `tokenHint`, `vault`, `project` to `VendorCredentialSetRecord` / `VendorCredentialSetRepoPort`; `VendorCredentialProjectScope` → core generic project half over the vendor port | Already declares itself an extension of the Jini same-name types; the added fields are host-neutral. `VendorCredentialProjectScope` is structurally identical to `CredentialProjectHalf<VendorCredentialSetRepoPort>` (DEDUPE, shape compared; caller: deps.ts `credentialProject`). |
| repo.memory.ts | 8 | J: platform (`InMemoryVaultRepo`). In: 2 / 0 (index, publish-credentials/repo.memory re-export) | **MOVE-AFTER(vault-adapter)** | `@jini-ai/platform/secrets/credential-sets` memory adapter | 3-line config subclass. `publish-credentials/repo.memory.ts` is a re-export-only barrel of it (DELETE, outside slice). |
| index.ts | 12 | re-exports only. In: 6 / 2 (custom-credentials/tovu-credential-sets, publish-agent-tools, publish-credentials/store, publish-tool-deps, source-control/store, routes/types) | **DELETE** (barrel) | none | Importers switch to the Jini subpaths after the moves. |
| vault-adapter.ts | 156 | J: platform, core (Clock). T: `platform/secrets/vault-kinds` (real), **`source-control/types` (reverse edge, type-only)**, webhooks→J. lit: `"tovu"` x4 (ownerKey), kinds `vendor/custom/source-control`. In: 6 / 7 | **MIXED** | (a) `TovuCredentialSetVaultAdapter` + `VendorCredentialSetVaultRepo` → **MOVE-AFTER(source-control/types)** to platform/secrets/credential-sets as a provider-keyed credential-set vault repo; ports: `ownerKey`, `kind`, `metaParsers` (today the Tovu `createTovuVaultKinds` registry). (b) `credentialHint` → **MOVE** (pure) beside the credential-token hint types. (c) `credentialScope` → **DEDUPE-AFTER-HARDENING** onto Jini `credentialSetVaultScope` once its kind union admits `source-control` and it lives in platform (it sits in integrations today). (d) `credentialVault` → **STAY-WIRING**, and DEDUPE inside Tovu onto `platform/secrets/vault-kinds.ts` `createTovuStoreVault` once that accepts a kind set | (a) Diverged sibling of Jini's `CredentialSetVaultRepo` (custom kind): same row↔DTO/CAS pattern, different DTO (provider, isDefault, accountLabel, `updateAccountLabel`). (c) Bodies identical except owner key is a param in Jini and its kind union is `vendor|custom`; callers (publish-credentials/store, source-control/store) pass `vendor`, `custom`, `source-control`. (d) Behaviour diff vs `createTovuStoreVault`: authorizes 3 kinds per service instead of 1, a narrower context check, and a partial keyring cast; the publish store really reads `vendor` + legacy `custom` through one service (store.ts:156-157, :653), so the dedupe needs a kind-set option. |

### project-keys (8 files, 558 lines)

| File | Lines | Signals | Label | Jini home / host contract | Reason |
|---|---|---|---|---|---|
| attachments.ts | 50 | J: db (type). npm: kysely `sql`. lit: SQL on `site_key_attachments` + `secrets_vault`, `workspace_id='project'`, SQLite `json_each`, "Shared Keys" copy. In: 9 / 2 (CLI x2, api-connections/shared-api, composition project-store/provider-config-source, own folder) | **MIXED** | `KeyAttachments`, `ProjectKeyTransaction` → MOVE with attached-vault (grant port, platform/secrets/credential-sets). `createKeyAttachments` → **STAY-WIRING** | The adapter is Tovu's own grant table and SQLite JSON query; the port types are generic. |
| site-references.ts | 85 | J: core, platform. N: crypto. T: api-connections (`apiConnectionVaultScope`, `PLUGIN_STATE_FORMAT`). lit: persisted ids `plugin-state:tovu-shared-oauth-binding:` / `plugin-state:tovu-key-references:`, copy. In: 4 / 5 | **STAY-WIRING** | none now | Byte-stable persisted Tovu row ids over api-connections' plugin-state rows. Generic pattern ("inert reference row"), but no second host. |
| create-vault.ts | 33 | J: core, platform. lit: copy + `P25_KEY_CREATE_CONFLICT`. In: 4 / 4 (custom-credentials host, publish-credentials/store, source-control/store, deps) | **MIXED: MOVE + STAY-PRODUCT** | `projectKeyCreateVault` → platform/secrets/credential-sets (create-only CAS decorator; ports: `conflict()` error factory, refusal message, `transaction`). `ProjectKeyCreateConflictError` stays; stores recognize it through Jini's existing `CredentialSetStoreHost.isCreateConflict` predicate | Generic decorator; the error is host copy. |
| site-sealer.ts | 59 | J: core. T:webhooks→J. lit: AAD prefix `secrets-vault:v1:`, `'project'`, `'tovu'`, kind list, copy. In: 1 / 0 (deps) | **MIXED: MOVE + DEDUPE + STAY-PRODUCT** | `ownerKeyHandleOnly` → platform/secrets (keyring decorator, message port). `siteGrantedSealer` → platform/secrets/credential-sets with an identity predicate port. The AAD parsing (`selectedIdentity`) → **DEDUPE** onto a new Jini `parseVaultAad`, the inverse of `buildVaultAad`. Owner-scope policy (`project`/`tovu`/kinds) + copy stay | ABI check against the implementer: Jini `buildVaultAad` = `formatAad` join `:` of `secrets-vault`, `v1`, JSON tuple `[workspaceId,id,kind,ownerKey,principalId,binding]`; Tovu's parser matches that order today. It re-parses a Jini-private encoding (S7). 0 tests import it directly. |
| attached-vault.ts | 60 | J: core, platform (`isInVaultQueryScope`). lit: copy + `P25_*` codes, `console.warn`. In: 3 / 10 (custom-credentials/vault-repo, service, deps) | **MOVE** | platform/secrets/credential-sets (grant-filtered read-only `VaultRepoPort`); ports: grants (`isAttached`, `keysFor`, `keyForLabel?`), messages, warn sink | Generic decorator. Note S9 (`findDefault` single-row fallback). |
| shared-oauth-disconnect.ts | 52 | J: core, integrations (`disconnectApiConnection`). N: crypto. T: api-connections/shared-owner (type). lit: `'project'` x2, copy. In: 1 / 2 (CLI owner-store) | **STAY-WIRING** now; MOVE-AFTER(api-connections) later | later `@jini-ai/integrations/api-connections` (inspect + disconnect with a grant-removal port) | Needs Tovu's shared-owner storage contract first; one CLI caller. |
| service.ts | 155 | J: core, platform, plugins (types incl. one inline `import("@jini-ai/plugins/host")`). T:contracts→J (`PluginCredentialCard` = core). lit: `"project"` x4, `"tovu"`, permission ids, kind list, `plugin-state:${pluginId}:provider.config`, `saved-on-site:`, copy. In: 13 / 12 | **MIXED** | `providerKeyId`/`providerPluginOf` → **DEDUPE-AFTER** Jini agent-plugins exports its plugin-state row-id builder/parser (today a private `rowPrefix`); `isSharedOAuthKey` → with api-connections. `projectKeyPermission`, `createProjectKeys`, `ProjectKeysPort`, rows, `SITE_KEY_ID_PREFIX`, `SiteKeySource` → **STAY-PRODUCT** (Shared Keys product; would need platform + plugins = R8 CORE-CONTRACT-NEEDED if ever generalized) | Prefix compared to Jini `plugin-state.ts`: identical; Tovu's id regex `[a-z0-9-]+` is a superset of Jini's `PLUGIN_ID_PATTERN`, so no valid id is missed. Caller checked: composition/provider-config-source. |
| tools.ts | 64 | J: core, daemon. T: contracts x3 (human-confirm, tool-metadata, credential card→J), platform/dev-supervisor. In: 1 / 1 (tool-catalog-manifest) | **STAY** (R9) | later with core authorize/surface contracts | MCP tool registrations. `site_restart` is a dev-supervisor tool registered in this domain (S10). |

**Tally (16 files):** MOVE 4 (abort-guarded-repo, types, attached-vault, repo.memory as MOVE-AFTER), DELETE 2, STAY-WIRING 4 (vendor-credential-repo, site-references, shared-oauth-disconnect, + tools as STAY), MIXED 6 (project-scope, vault-adapter, attachments, create-vault, site-sealer, service). DEDUPE-UNVERIFIED: 0 (every DEDUPE below had a behaviour diff and a real caller/implementer).

DEDUPE claims and their checks:

| Claim | Behaviour diff | Implementer / caller checked |
|---|---|---|
| project-scope types → core/integrations scope types | shapes identical (names differ) | tovu-credential-sets passes `credentialScopes` as Jini `CredentialSetStoreHost.scopes` |
| `VendorCredentialProjectScope` → generic project half | identical to `CredentialProjectHalf<VendorRepo>`; Jini's custom variant adds `inventoryRepo`, narrower keyring type | deps.ts `credentialProject` |
| `credentialScope` → `credentialSetVaultScope` | same body; owner key param, narrower kind union in Jini | publish-credentials/store, source-control/store (3 kinds) |
| `credentialVault` → `createTovuStoreVault` (in Tovu) | kind set vs single kind, context check, keyring completeness | publish-credentials/store reads 2 kinds via one service |
| site-sealer AAD parse → `buildVaultAad` inverse | tuple order and prefix match | Jini `vault.aad.ts` + `aad.ts` |
| `providerKeyId`/`providerPluginOf` → plugin-state row id | identical prefix; Tovu regex is a superset | composition/provider-config-source |
| credential-setup wrapper → `abortGuardedCredentialRepo` | wrapper misses `update` and `project.replaceRepo` guards | source-control/credential-setup.ts:98-109 |

## 2. Lines that leave Tovu, lines that stay, and what this unblocks

| | vendor-credentials | project-keys | Total |
|---|---|---|---|
| MOVE / DEDUPE | 296 (abort 37, project-scope 59, types 62, repo.memory 8, vault-adapter ~130 of 156) | 142 (attached-vault 60, site-sealer ~45, create-vault ~22, attachments types ~15) | **438** |
| DELETE | 22 (.sqlite 10, index 12) | 0 | **22** |
| **Leaves Tovu** | **318 of 355 (90%)** | **142 of 558 (25%)** | **460 of 913 (50%)** |
| Stays | 37 (repo binding 11, `credentialVault` + registry ~26) | 416 (service 155, site-references 85, tools 64, shared-oauth 52, attachments adapter ~35, site-sealer policy ~14, create-vault error ~11) | **453** |

vendor-credentials is almost entirely generic. project-keys is mostly the Shared Keys product; its generic part is four vault decorators.

**What this unblocks for `source-control/store.ts` (canary #1: MOVE-AFTER(vendor-credentials)):** every slice dependency of store.ts now has a home.

- `credentialScopes`, `credentialCreateTarget`, `CredentialScope`, `ScopedCredentialDeps`, `credentialHint`: move to Jini as pure helpers/types. No blocker.
- `credentialScope`: needs one small Jini change (widen the kind union and relocate the helper to platform).
- `credentialVault`: stays in the host. store.ts takes it as an `openVault` port, the same shape as Jini's `CredentialSetStoreHost.openVault`.
- `ProjectKeyCreateConflictError`: stays. store.ts takes an `isCreateConflict` predicate, as Jini's host contract already does.
- `CredentialProjectHalf` (used by source-control/types): moves to core.

So store.ts can be rebuilt as a provider-keyed sibling of Jini's `credentialed-http/sets/store.ts` with the same host-object pattern. **One ordering constraint:** vault-adapter.ts imports `source-control/types` and source-control imports vendor-credentials. That is a feature cycle (S5). Move vault-adapter together with source-control/types in one batch; leaf-first ordering alone cannot sequence them.

## 3. Latent bugs, duplicates, owner-rule smells (neutral wording)

- **S1 (duplicate, behaviour differs):** `source-control/credential-setup.ts` hand-rolls an abort wrapper next to `abortGuardedCredentialRepo`. The hand-rolled one does not guard `update` and does not wrap `project.replaceRepo`. Replace it with the shared helper. This confirms canary #1's CBM finding and adds the `replaceRepo` gap.
- **S2 (coverage gap):** `abortGuardedCredentialRepo` leaves `vault.patchMeta` (used by `updateAccountLabel`) unguarded. The header says "every persistence write". The impact is low: only an account-label heal after cancellation.
- **S3 (in-Tovu duplicate, checks differ):** `credentialVault` (vault-adapter) and `createTovuStoreVault` (platform/secrets/vault-kinds) build the same Jini `SecretsVaultService` for the same owner. Their authorization checks and keyring completeness differ (the former casts a partial keyring). Unify on one helper with a kind-set option. Details are given to the coordinator directly.
- **S4 (shape duplicates, 4 copies):** the project-half shape exists as Tovu `CredentialProjectHalf<R>`, Tovu `VendorCredentialProjectScope`, Jini core `CredentialSetProjectScope<C>`, and an inline type in composition/deps.ts `credentialProject`. Also `ScopedCredentialDeps` ≡ Jini `CredentialSetScoped`, `CredentialScope` ≡ `CredentialSetScope`, `WithProject` ≡ `CredentialSetScopeCarrier`. None share a name.
- **S5 (feature cycle):** vendor-credentials/vault-adapter → source-control/types → vendor-credentials/project-scope (type-only edges).
- **S6 (divergence):** the Tovu adapter decides "envelope unchanged" (keep hints) by comparing ciphertext and nonce. Jini's sibling compares keyId, ciphertext, nonce and alg. Jini also keeps `existing.createdAt`. Align when merging.
- **S7 (private-format coupling):** `site-sealer.ts` parses Jini's vault AAD encoding itself. If Jini changes `buildVaultAad`, every grant-fenced open would refuse (fail-closed, but an outage). Jini should export the parser.
- **S8 (private-format coupling):** `service.ts` re-derives Jini agent-plugins' private plugin-state row-id prefix. Same class as S7.
- **S9 (undocumented semantics):** `attachedOnlyVault.findDefault` returns the only granted row when no row is marked default. The plain vault returns null. This looks intentional (new project keys are saved non-default), but the port does not document it.
- **S10 (misplaced):** `site_restart` (dev-supervisor restart) is registered in the project-keys tool domain.
- **S11:** `createKeyAttachments.attach` stamps `new Date()` instead of an injected clock.
- **S12 (stale docs):** vendor-credentials/types.ts cites `platform/db/repos/vendor-credential-repo.ts` (gone; the file is in the feature folder now). index.ts describes the `vendor_credential_sets` table, which migration 0012 folded into `secrets_vault`.
- **S13 (owner rule, outside slice, one line):** Jini `@jini-ai/core` still exports `./settings/express`.
- **S14 (benign):** the shared-OAuth disconnect digest includes site names, so a site rename between review and confirm fails as "changed" (fail-safe).
- No vendor ids (github etc.) in this slice. `"tovu"` appears as the vault owner key (vault-adapter x4, service x1, site-sealer x1) and in persisted row ids (site-references x2). Those are host policy and must stay byte-stable.

## 4. Tier calibration

| File | Tier needed | Why / what would move it down |
|---|---|---|
| abort-guarded-repo | 1 | Only Jini-type imports, no literals: the label is clear from header + exports. Knowing it implements Jini `guardRepo` is a bonus. A "passed as a value into a Jini port field" signal (`guardRepo: abortGuardedCredentialRepo`) would make it Tier 0. |
| project-scope | **2** | The label depends on seeing that Jini's `CredentialSetStoreHost.scopes/createTarget` port is implemented by these functions, and that 3 types are shape-twins under other names. Down to 1 with: structural type-hash matching + "Tovu export passed into a Jini host-object field". |
| vendor-credential-repo | 0 | R4 (`extends` Tovu adapter, <30 lines, kernel binding). |
| .sqlite | 0 | Empty subclass. |
| types | 1 | A same-name Jini hit promoted it under canary #1's rule. But the file header says it `extends` the Jini types, so the label (fold in) was obvious. An `extends <Jini same-name>` signal → Tier 1, not 2. |
| repo.memory | 0 | ≤3-line config subclass → MOVE-AFTER(its base). |
| index | 0 | Barrel. |
| vault-adapter | **2** | MIXED, a reverse feature edge, an in-Tovu duplicate (`createTovuStoreVault`) and a diverged Jini sibling with a different name. Down to 1 only with function-fingerprint similarity across Tovu↔Tovu and Tovu↔Jini **without** a name match. |
| attachments | 1 | SQL + Tovu table + copy → adapter stays; port types obvious. |
| site-references | 1 | T:api-connections + persisted `tovu-` ids → stays. A literal scan that matches `tovu` inside template strings would make it Tier 0 (the canary #1 regex missed `plugin-state:tovu-…`). |
| create-vault | 1 | Jini-only imports + product error copy → split is clear. |
| site-sealer | **2** | Needed the ABI check against Jini `buildVaultAad`. Down to 1 with a "string literal equals a Jini module-private constant/prefix" signal. |
| attached-vault | 1 | Jini-only imports + copy → generic decorator. S9 needed a Tier 2 read, but the label did not. |
| shared-oauth-disconnect | 1 | T:api-connections + one CLI importer → stays. |
| service | **2** | MIXED, coupling to a Jini-private id format, R8 check (platform + plugins), product permission policy. |
| tools | 0 | R9 (tool registrations). |

**Shares:**

| | Tier 0 | Tier 1 | Tier 2 |
|---|---|---|---|
| This slice, by file (16) | 5 (31%) | 7 (44%) | 4 (25%) |
| This slice, by line | 105 (11%) | 379 (42%) | 429 (47%) |
| Canary #1 (15 files) | 40% | 30% | 30% |
| Both canaries (31 files) | ~35% | ~37% | ~28% |

Key calibration finding: canary #1's Tier 2 trigger ("same-name Jini hit") fired on 1 file here (types.ts), and that file only needed Tier 1. All 4 real Tier 2 files were driven by things a name match cannot see:

- shape-twins under different names;
- port implementations;
- private-format coupling;
- a feature cycle.

## 5. Cost of this run

- **Tool calls:** 39 in total: 2 Read (persona, control report), 35 Bash (4 slice reads, 1 importer sweep, 1 literal/import sweep, 1 Jini same-name sweep, ~14 Jini counterpart/implementer checks, ~10 Tovu caller/duplicate checks, 4 misc), 1 Write, 1 SendMessage. 0 graph calls, 0 ToolSearch, 0 re-done sweeps.
- **Files read:** 16 slice files in full (913 lines, 100%). Jini: 5 in full, ~6 in part (~550 lines). Tovu outside the slice: ~7 in part (~350 lines).
- **Tokens:** about 115k context at the end. Fixed overhead (system, CLAUDE/memory index, both canary reports, persona) was about 45k, so **about 70k went on the slice: ~4.4k per file, or ~77 tokens per slice line.**
- **Per file (approximate, slice read + its checks):**
  - Tier 0 files (5): ~0.6k each (read only).
  - Tier 1 files (7): ~2.5k each.
  - Tier 2 files: vault-adapter ~14k (Jini sets read + vault-kinds duplicate), project-scope ~8k, site-sealer ~5k, service ~7k (plugin-state check). Average ~8.5k.
  - Shared discovery (importer sweep, same-name sweep, KeyringPort chain): ~10k, spread across the slice.

## 6. Updated projection (~2,800 non-test files)

Shares from both canaries: Tier 0 ~35%, Tier 1 ~37%, Tier 2 ~28%.

| Tier | Files | Model | Tokens/file | Tokens |
|---|---|---|---|---|
| 0 | ~980 | script | 0 | 0 |
| 1 | ~1,040 | Sonnet | ~2.5k | ~2.6M |
| 2 | ~780 | Opus | ~8.5k (Jini counterpart + implementer + in-Tovu twin check) | ~6.6M |
| Batch overhead | ~140 batches (feature SCCs, ~20 files each) | — | ~15k | ~2.1M |
| **All-Opus Tier 2** | | | | **~11.3M input + ~1M output** |
| **Sonnet reads Tier 2, Opus on ~30% of Tier 2** (diverged pairs, ABI/format coupling, cycles) | | | | **~7–7.5M** |

Changes vs canary #1 (~10.5M / ~6–7M):

- Tier 2 costs more per file (8.5k vs 7k), because twin discovery now includes **in-Tovu** duplicates and different-name Jini siblings.
- Tier 2 has fewer files, because Tier 1 absorbs the same-name `extends` cases.
- Batches are fewer and larger, because they follow feature cycles (SCCs) instead of single folders.
- Net about +0.5–0.8M. With the dossier additions below, Tier 2 should drop to ~6k/file (~4.7M), because the shape and fingerprint matching would be precomputed. That gives **~9.5M all-Opus / ~6M mixed**.

## 7. Verdict

**The method holds:**

- 16/16 files were labelled.
- Every DEDUPE claim had a behaviour diff plus a real caller or implementer, with 0 unverified.
- The rule "check the implementer" again produced the high-value findings: S1/S3 (duplicates with weaker checks), S7/S8 (coupling to Jini-private formats), and the port-implementation insight that unblocks store.ts.

**But the tier trigger must change.** "Same-name Jini export" is the wrong Tier 2 trigger: it over-promoted 1 file here and missed all 4 real Tier 2 files.

**What the dossier script should compute that it doesn't yet:**

1. **Shape-twin matching:** a normalized member-signature hash for interfaces/types, and a CBM `fp`-style body fingerprint for functions. Match across Tovu↔Jini **and Tovu↔Tovu**, regardless of name. This would have found the S3/S4 twins and the project-scope types.
2. **Port-implementation edges:** Tovu exports passed as values into Jini host-object fields or calls (`scopes: credentialScopes`, `guardRepo: abortGuardedCredentialRepo`). These are "implements Jini port X".
3. **Private-format coupling:** string literals/prefixes that equal a Jini module-private constant or format (`secrets-vault:v1:`, `plugin-state:`).
4. **Feature SCCs:** strongly connected components over feature folders, with type-only and inline `import()` edges included. Batch each SCC together.
5. **R7 re-export resolution built in:** here 6 of 9 `T:` edges (webhooks, contracts) were pure Jini re-exports.
6. **Literal scan inside template/compound strings**, with key-vs-value context (`'project'` as an object key is not a workspace literal).
7. **`extends <Jini same-name>` → Tier 1, not 2.**
8. **Stale path references in comments:** cheap, and it found S12.
