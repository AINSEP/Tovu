# Break the website import cycle (hard item #6) — design, 2026-11-16

Planning only. No source file was changed. Measured on Tovu `integ/wave-b-r2` @ `65302ee5` and Jini `integ/wave-b-r2` @ `02edbb68`.
Data: `EDGES.tsv` (263 rows). Scripts: `scripts/` (reproduce with the commands in §1.1).

## 0. Summary

1. **The cycle is real at feature level and absent at file level.** 24 feature folders form one runtime cycle (64 runtime edges inside it). No two *files* in `apps/website/src` import each other at runtime, directly or through a chain: the file graph has **0** runtime cycles (my extractor and dependency-cruiser agree). So nothing breaks at load time today. The cycle is a grouping problem: a folder holds files of two layers.
2. **Five feature edges close every loop** (exact minimum, §1.5). They are 11 import statements in 8 files. Removing the first one (one import of a helper that Jini already exports) shrinks the cycle from 24 features to 7.
3. **Fixes by kind:** 1 repoint to an existing Jini export, 1 move of a pure function down to `platform/secrets`, 1 repoint + move of a binding to its owner, 2 port inversions bound by the host. No new package, no event bus, no barrel.
4. **Rule:** a rank table for the 68 feature folders plus one generated dependency-cruiser rule per rank: a feature may value-import only features of a strictly lower rank. Prototype run on the real tree: exactly the 11 import statements above, nothing else (§3.3).
5. **Jini has 3 runtime module cycles, not 2** (agent-runtime 6 files, daemon 4 files, admin 2 files) and 0 package cycles. Each is fixed by extracting a leaf file (§5).
6. **Also found:** a second runtime cycle that runs through `server/` and `assistant/` (8 units, 4 features caught in it), and 37 upward type-only feature edges. Both are planned as later lanes (§4, B and T).
7. **Steps:** S0–S6 for the feature cycle (the count drops 24 → 7 → 5 → 3+2 → 2 → 0), B1–B3, J1–J4, T. Estimate in §7. Owner decisions in §9.

## 1. Measurement

### 1.1 Method

`scripts/edges.mjs` parses every production `.ts` file with the TypeScript compiler API (no `__tests__`, no `*.test.ts`) and records each `import`, `export … from`, `import()`, `require()` and `import('x').T`. Each edge gets one kind:

| Kind | Meaning |
|---|---|
| `runtime` | Survives compilation: a side-effect import, an `export … from` of values, or at least one imported name used in a value position. |
| `erased` | Written without `type`, but every name is used only as a type, so `tsc` and `tsx` drop it. Fragile: one value use makes it runtime. |
| `type` | `import type`, all-inline-`type` specifiers, `export type … from`, or an `import('x').T` type node. |

`dynamic` marks `import()`/`require()`. `scripts/graph.mjs` aggregates files to features (`features/<name>/…`), finds strongly connected components (Tarjan) and the minimum feedback arc set (§1.5).

Reproduce (Node 24, `npm i typescript@5 dependency-cruiser` in a scratch folder):
```
node scripts/edges.mjs <tovu> apps/website/src tovu-edges.json --alias '#src/=apps/website/src/'
node scripts/graph.mjs tovu-edges.json summary        # SCCs at feature, unit and file level
node scripts/graph.mjs tovu-edges.json fas features   # exact minimum feedback arc set
node scripts/graph.mjs tovu-edges.json steps "publish-trust>deployments" "project-keys>api-connections" "custom-credentials>source-control" "custom-credentials>deployments" "source-control>site-backup"
node scripts/edges.mjs <jini> packages jini-edges.json && node scripts/jini-pkgs.mjs <jini>
```

Cross-check: dependency-cruiser 18.7.2 `no-circular` over `apps/website/src`, tests excluded. With `tsPreCompilationDeps: false` (runtime only): **0** violations. With `true` (types included): 16 rows, the same 16 the repo's own `npm run check:boundaries` prints.

### 1.2 Results (Tovu website)

| Fact | Measured | 11-11 survey |
|---|---|---|
| Production files / internal import edges | 2,133 / 8,615 (6,355 runtime of which 15 dynamic, 2,257 type, 3 erased) | – |
| Feature folders with production code | 68 | – |
| Feature → feature edges, runtime | 127 (53 features take part) | – |
| Feature → feature edges, type-only | 114 (59 of them on pairs with no runtime edge) | – |
| Runtime feature SCCs | **1, of 24 features**, 64 internal edges | 24 ✔ |
| Mutual feature pairs | **3** runtime; 17 when type-only edges count | 21 ✘ |
| Feature SCC with type-only edges counted | 1, of 30 features | – |
| File-level runtime cycles | **0** | – |
| File-level cycles with types counted | 6 SCCs (15, 3, 2, 2, 2, 2 files) | – |
| Dynamic imports between features | 0 | – |

The survey's "21 mutual pairs" does not reproduce. The closest number is 17 (type-only edges counted). I could not find the survey's counting rule, so I treat 3 and 17 as the current facts.

The 24 features: `api-connections consent content-types custom-credentials deployments entries form-destinations media media-import navigation post project-keys publish-content publish-trust redirects settings site-backup site-export site-inspection source-control taxonomy theme trash widgets`.

**A second runtime cycle** appears when `assistant/`, `platform/<x>/` and `server/<x>/` are graph nodes too: `assistant`, `server/inbound`, `server/runtime`, `platform/headless-browser`, and the features `external-mcp`, `site-evidence`, `sites`, `web-screenshot`. It does not touch the 24. Edges in §4 (B lanes).

### 1.3 Why a feature cycle exists without a file cycle

The file graph is a DAG, so the files can be sorted bottom-up. A feature cycle then means a folder holds files from two places in that order. Example: `publish-content/repo-handler.ts` (a kit 10 content features build on) and `publish-content/tool-registrations.ts` (which calls `publish-trust`) live in one folder.

Consequences:
- No load-order hazard today. No fix in this design changes evaluation order inside Tovu.
- The risk is in the planned moves. CLASSIFY sends most of the 24 features to Jini packages (`cms`, `devops`, `integrations`, `platform`). A feature cycle becomes a package cycle unless each cross-feature value import is already a host-bound port. Cutting the five edges first makes those moves simpler.
- Barrels can turn a feature cycle into a file cycle. The repo's `no-deep-imports:<module>` rules push callers to `index.ts`. `publish-trust → deployments` goes through `deployments/index.ts`, which re-exports a Jini function. §8 flags this conflict with owner rule 5.

### 1.4 Shape of the 24-feature cycle

- **`publish-content` is the hub.** 12 features import it at runtime (10 content features use the contributor kit: `createRepoPublishHandler`, `gatewayDeps`, `PublishContentApplyRowError`, `contentHash`, reference collectors). It imports its contributors back **only as types** (ports). Its one runtime out-edge inside the cycle is `→ publish-trust` (6 imports in 3 files).
- **`publish-trust → deployments`** is one import: `isContainedDeployConfigPath`, read from `deployments/index.ts`. `deployments` then reaches `consent`, `custom-credentials`, `form-destinations`, `project-keys`, `settings`, `site-export` and `theme`, and those reach `publish-content` again. This single import ties 17 features into the cycle.
- **The remaining 7** are the credentials and operations cluster: three mutual pairs (`custom-credentials ↔ deployments`, `custom-credentials ↔ source-control`, `source-control ↔ site-backup`) and the triangle `api-connections → custom-credentials → project-keys → api-connections`.

### 1.5 Minimum feedback arc set

A feedback arc set is a set of edges whose removal leaves no cycle. The minimum one is the smallest such set.

How computed: every ordering of the 24 features splits the 64 edges into "forward" and "backward"; the backward edges of an ordering are a feedback arc set, and the best ordering gives the minimum. `graph.mjs fas` finds the best ordering exactly with dynamic programming over subsets: `dp[S]` = fewest backward edges when the features in `S` are placed first; 2^24 states, about 16 s. It is exact, not a heuristic. It was run with three weights.

| Weight | Minimum | Edges |
|---|---|---|
| 1 per feature edge | **5 edges** | `api-connections→custom-credentials`, `custom-credentials→deployments`, `custom-credentials→source-control`, `publish-content→publish-trust`, `source-control→site-backup` |
| import statements | 7 statements (5 edges) | same first three, then `publish-trust→deployments`, `site-backup→source-control` |
| importing files | 6 files (5 edges) | same as the row above |

The minimum is 5 under every weight. Three slots have equal-cost alternatives, and the design picks by meaning, not by count:

| Slot | Options | Chosen | Why |
|---|---|---|---|
| credentials triangle | `api-connections→custom-credentials` or `project-keys→api-connections` (every cycle through `api-connections` uses both) | `project-keys→api-connections` | `project-keys` is the lower layer (key vault). It reaches up for two constants. |
| publish loop | `publish-content→publish-trust` (6 imports) or `publish-trust→deployments` (1 import) | `publish-trust→deployments` | One import of a function that already lives in Jini. |
| backup pair | `source-control→site-backup` (6 imports, 2 files) or `site-backup→source-control` (2 imports, 1 file) | `source-control→site-backup` | Backup uses source control as a transport, which is the natural direction. Source control reaches into backup only for static-site packaging, and CLASSIFY already makes that a host port (`files.export`). |

**Chosen cut:** `publish-trust→deployments`, `project-keys→api-connections`, `custom-credentials→source-control`, `custom-credentials→deployments`, `source-control→site-backup`. Verified: `graph.mjs verify` reports 0 SCCs with these five removed. Cumulative effect in step order (`graph.mjs steps`):

| After | SCC sizes | Mutual pairs | Rule violations (import statements) |
|---|---|---|---|
| today | 24 | 3 | 11 |
| S1 `publish-trust→deployments` | 7 | 3 | 10 |
| S2 `project-keys→api-connections` | 5 | 3 | 9 |
| S3 `custom-credentials→source-control` | 3, 2 | 2 | 7 |
| S4 `custom-credentials→deployments` | 2 | 1 | 6 |
| S5 `source-control→site-backup` | none | 0 | 0 |

## 2. The five cut edges: why each exists, and the fix

Line numbers are from `65302ee5`. Paths are under `apps/website/src/features/` unless they start with another root.

### 2.1 `publish-trust → deployments` (S1) — repoint to Jini

- **Site:** `publish-trust/connect.ts:1` imports `isContainedDeployConfigPath` from `../deployments/index.js`; used once at `:81` to skip deploy-config paths that leave the repo.
- **Why it exists:** the function is defined in Jini (`@jini-ai/devops/deploy`, `packages/devops/src/deploy/config-descriptors.ts`). `deployments/deploy-config-registry.ts:8,16` imports and re-exports it "to keep the host's existing imports", and `deployments/index.ts:73` re-exports it again. `publish-trust` is the only consumer of those re-exports (3 production files mention the name; 0 test files).
- **Fix:** `connect.ts` imports it from `@jini-ai/devops/deploy`. Delete the name from the `export { … }` at `deploy-config-registry.ts:16` and from `deployments/index.ts:73`. Keep the comment at `deploy-config-registry.ts:14-15` for the type re-exports that remain.
- **CLASSIFY:** `publish-trust/connect.ts` is not in the backlog (stays). `publish-trust/handshake-client.ts` is MOVE-AFTER → `cms/publish`. If `connect.ts` later follows it into `@jini-ai/cms`, a `cms → devops` import is not allowed there; the guard then arrives as a port. Not part of this step.

### 2.2 `project-keys → api-connections` (S2) — move a pure function down

- **Site:** `project-keys/site-references.ts:5` imports `apiConnectionVaultScope` and `PLUGIN_STATE_FORMAT` from `../api-connections/vault-stores.js`; used at `:27, :45, :63, :73` to store token-free site references in the api-connection vault scope.
- **Why it exists:** `apiConnectionVaultScope` (`vault-stores.ts:67-69`) is a 3-line pure function returning `{ workspaceId, kind: API_CONNECTION_VAULT_KIND, ownerKey: "tovu", principalId: null, binding: null }`. `PLUGIN_STATE_FORMAT` is not defined in `vault-stores.ts` at all: line 19 re-exports it from `#src/platform/secrets/vault-api-connection-meta` (27 lines, already holds the formats).
- **Fix:** move `API_CONNECTION_VAULT_KIND` (`vault-stores.ts:34`) and `apiConnectionVaultScope` with its doc comment into `platform/secrets/vault-api-connection-meta.ts`. Repoint the 4 importers: `project-keys/site-references.ts`, `api-connections/vault-stores.ts`, `api-connections/shared-owner.ts`, `api-connections/plugin-state-bindings.ts`. Delete the re-export at `vault-stores.ts:19` (owner rule 5). No signature changes.
- **Why not a port:** the function is pure and host-owned (`ownerKey: "tovu"`). CLASSIFY sends `vault-stores.ts` to `@jini-ai/integrations/api-connections/token-store` with "Host supplies: vault scope ownerKey, meta formats", and `project-keys` to `platform/secrets/credential-sets`. A Tovu `platform/secrets` file is exactly where the host keeps what it will supply to both. A port now would be an abstraction with one implementation (owner rule 11).
- **Left over:** `project-keys → api-connections` keeps one type-only import (`SharedOAuthOwnerStorage`). It is a T row.

### 2.3 `custom-credentials → source-control` (S3) — repoint to Jini, move a binding to its owner

Two sites.

**(a) `custom-credentials/write-files-validation.ts:2-3`** imports `repositoryTargetError` from `../source-control/repository-target.js` (and the type `RepositoryTargetValidator` from `provider-module.js`). `source-control/repository-target.ts` is a 20-line forwarder to `@jini-ai/devops/source-control` `repositoryTargetError(required, { validateTarget })`. Jini also exports `RepositoryTargetValidator` (`devops/src/source-control/contracts.ts:43`), structurally identical to Tovu's.
- **Fix:** both callers (`write-files-validation.ts:98`, `source-control/commit-site.ts:19`) import the function and the type from `@jini-ai/devops/source-control` and call `repositoryTargetError(target, { validateTarget })`. Delete `source-control/repository-target.ts`. Its file comment (which three tools run this check, host rules first) moves to the call in `commit-site.ts` (owner rule 6).
- **CLASSIFY:** `write-files-validation.ts` is DEDUPE-AFTER-HARDENING → `devops/source-control`. This repoint is a first part of that row, not extra work.

**(b) `custom-credentials/credential-ports.ts:15`** imports `buildSourceControlProviderForApi` for `bindSourceControlWritePort` (`:68-79`). That function binds the core contract `SourceControlWritePort` (`@jini-ai/core/contracts/credentials`) over the source-control provider registry. It is source-control's adapter living in the consumer's folder. Its one production caller is `custom-credentials/tool-registrations.ts:362`.
- **Fix:** move `bindSourceControlWritePort` to a new file `source-control/write-port.ts` (it may import `validateRepositoryTarget` from `custom-credentials`: that direction is downward). `CustomCredentialToolRouteDeps` gains `readonly sourceControlWrite: SourceControlWritePort`, and `tool-registrations.ts:362` reads `routeDeps.sourceControlWrite`. The host builds the port in the two places that already wire `loadSourceControlProviders`: `server/runtime/composition/deps.ts:2798` and `app.ts:1669`.
- **Late-read rule (lesson 3):** today the port is built when the handlers are built, after `routeDeps` is complete, from `routeDeps.loadSourceControlProviders`, `routeDeps.customCredentialsHttpClient` and `routeDeps.observability`. The host must build it from the same values and not earlier than they exist. If any of the three is assigned after the `routeDeps` literal, pass closures that read at call time. The executor checks this with `size-designs/work/deferred-reads.cjs` before moving the construction point.
- **Left over:** `tool-registrations.ts:90,298` still uses `routeDeps.loadSourceControlProviders` to list provider descriptors, with a type-only import of `LoadSourceControlProviders`. That is a T row.
- **Tests:** `custom-credentials/__tests__/extract-s8-c2p1-credential-ports.test.ts` and `extract-s8-c2p1-ports.type-pin.ts` cover the binder with fakes. The source-control half of each moves to `source-control/__tests__/` in the same commit.

### 2.4 `custom-credentials → deployments` (S4) — port inversion

- **Site:** `custom-credentials/tool-registrations.ts:7` imports `invalidatePublishCredentialCompatibility` from `../deployments/publish-credentials/index.js`; used at `:425-430` inside `publish.prepareInvalidation`. Line `:9` adds a type import of `DeployTargetRegistry`.
- **Why it exists:** when a custom credential is created, publish targets whose eligibility changed must drop their cached verification. The host already injects both raw ingredients (`routeDeps.loadDeployTargets`, `routeDeps.publishCredentialVerificationCache`, both optional); the feature then calls the concrete `deployments` function itself.
- **Fix:** `custom-credentials` declares what it needs; the host binds `deployments` to it.
```ts
// features/custom-credentials/publish-compatibility-port.ts (new; consumer-owned port)
/** Tells publish targets that a saved credential's compatibility changed. Bound by the host. */
export interface PublishCompatibilityPort {
  /** Loads what the binding needs BEFORE the credential write, then returns the invalidator. */
  prepareInvalidation(required: { workspaceId: string }, optional?: Record<string, never>): Promise<PublishCompatibilityInvalidator>;
}
// PublishCompatibilityInvalidator = the exact function type `publish.prepareInvalidation` resolves to today
// (take it from the existing handler-config type; do not restate it by hand).

// features/deployments/publish-credentials/compatibility-port.ts (new; the binding, next to the function it calls)
export function bindPublishCompatibility(
  required: { loadDeployTargets: LoadDeployTargets; cache: PublishCredentialVerificationCachePort },
  _optional: Record<string, never> = {},
): PublishCompatibilityPort {
  return { prepareInvalidation: async ({ workspaceId }) => {
    const registry = await required.loadDeployTargets({ workspaceId });
    return (change) => invalidatePublishCredentialCompatibility({ workspaceId, registry, cache: required.cache, ...change });
  } };
}
```
  `routeDeps` replaces `loadDeployTargets?` + `publishCredentialVerificationCache?` (as used by this feature) with `publishCompatibility?: PublishCompatibilityPort`. `deployments` importing a `custom-credentials` type is downward.
- **Behaviour that must not change (lesson 9 in the brief: check port bindings):**
  1. Both ingredients missing → no load, and the returned invalidator is a no-op. New form: `publishCompatibility` undefined → same no-op. The host sets the port only when both ingredients exist.
  2. The registry loads once, in `prepareInvalidation`, before the write. A rejected load propagates from `prepareInvalidation`, as today. The binding adds no `catch`.
  3. The cache object is the same instance the admin HTTP route uses (`server/inbound/admin-http/routes/system/custom-credentials.ts:187-217` calls the same function). Both hosts (`deps.ts:2788-2805`, `app.ts:1663-1680`) must pass their existing `publishCredentialVerificationCache` instance into the binding, not a new one.
- **Check other uses first:** `routeDeps.loadDeployTargets` and the cache may be read elsewhere in `custom-credentials/*`. The executor lists every read before removing the two fields; fields still read stay.

### 2.5 `source-control → site-backup` (S5) — port inversion

- **Sites:** `source-control/commit-site.ts:8-12` imports `prepareStaticReport`, `staticDownloadLayout`, `LANDING_FILE`, `claimArchivePaths`, `SiteShareRefusal` from five `site-backup` files; used at `:398-409` (package the exported site into commit files) and `:532` (entry path). `source-control/tool-registrations.ts:4` imports `LANDING_FILE`, used at `:459`.
- **Why it exists:** a commit publishes the same portable static copy that the backup/share download builds. The packaging code lives in `site-backup`.
- **CLASSIFY:** `commit-site.ts` is DELETE-AFTER-PARITY → `@jini-ai/devops/source-control` with "Host contract: `credentials.resolve`, `files.export` (theme pinning + packaging), `layout.outputDirectory/cleanup`". `site-backup/static-download-layout.ts` is MIXED → `devops/static-export`. So packaging is already planned as a host-supplied port. This step introduces that port now, in Tovu.
- **Fix:**
```ts
// features/source-control/static-site-packager-port.ts (new; consumer-owned port)
export interface StaticSitePackagerPort {
  /** File a visitor opens first in the packaged copy (today's LANDING_FILE). */
  readonly entryFile: string;
  /** Turns a finished export into flat commit files. Never throws for a path collision. */
  packageSite(required: { report: ExportReport; site: StaticSiteIdentity }, optional?: Record<string, never>): StaticSitePackage;
}
export type StaticSitePackage =
  | { ok: true; files: CommitFile[] }
  | { ok: false; kind: "destination-collision"; message: string };
// StaticSiteIdentity = the fields commit-site passes today: slug, themeId, theme, name.

// features/site-backup/static-site-packager.ts (new; the implementation, beside the code it calls)
export function createStaticSitePackager(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): StaticSitePackagerPort
```
  The implementation is the body of `commit-site.ts:398-402` moved verbatim, plus the `SiteShareRefusal` + `/collision|aliases/i` test from `:405`, which becomes the `destination-collision` result. `CommitSiteDeps` gains `packager: StaticSitePackagerPort`. `commit-site.ts` keeps its `try/catch`: `destination-collision` → `EXPORT_FAILED` with ``Static site destination validation failed: ${message}``, any thrown error → `EXPORT_FAILED` with the existing generic text. `tool-registrations.ts:459` and `commit-site.ts:532` read `packager.entryFile`. `site-backup` importing source-control's port type is downward (rank 8 → 6), and `site-backup → source-control` already exists.
- **Host:** wherever `CommitSiteDeps` is built (the executor lists the builders; 11 production files mention `commit-site`), add `packager: createStaticSitePackager()`.
- **Characterization test first (must be able to fail):** before the move, add a test in `source-control/__tests__/` that runs the commit export on a fixed `ExportReport` fixture and asserts (1) the exact ordered list of `{ path, sha256(data) }`, (2) that two files claiming one path give `EXPORT_FAILED` with the exact collision message, (3) that a thrown non-refusal error gives the exact generic message, (4) `entryPath` equals the folder-prefixed landing file. It must pass before and after. It fails if the port drops `readme`, `metadata` or `{ manifest: false }`.

## 3. Target layering and the rule

### 3.1 Layers

Three kinds of place, already in the tree:

```
server/runtime/composition   host: builds every implementation, binds every port        (imports anything)
server/inbound, assistant    delivery: HTTP routes, agent tools                         (imports features, platform, contracts)
features/<name>              feature slices, ordered by FEATURE_RANK                    (imports lower-rank features, platform, contracts, @jini-ai/*)
platform/<x>, contracts      host-owned infrastructure and shared types                 (imports @jini-ai/* only; never features, server, assistant)
```

Inside `features/`, the order is a rank per folder. Rank = longest runtime import chain below the feature after the five cuts, so every existing edge points strictly downward and the table needs no exception:

| Rank | Features (68) |
|---|---|
| 8 | deployments, email-templates, site-backup |
| 7 | consent, pages, seo, site-search, widgets |
| 6 | image-transform, post, site-guide, source-control, web |
| 5 | asset-transfer, external-mcp, mail-status, site-export, site-inspection |
| 4 | api-connections, entries, form-destinations, mail, member-login, theme |
| 3 | analytics, comments, custom-credentials, database-transfer, forms, media-generation, media-import, trash |
| 2 | content-types, media, navigation, redirects, settings, taxonomy |
| 1 | object-storage, publish-content, sites |
| 0 | agent-plugins, change-sets, content-duplication, database, domain-dns, fs-files, identity, members, newsletter, observability, origin, permanent-delete, plugin-runtime, plugins, presentation, project-keys, publish-trust, recovery, server-logs, site-evidence, skills, tool-audit, vendor-credentials, web-screenshot, webhooks, webmcp, workspace |

(`admin-parity`, `credential-safety`, `site-glue` hold only tests and get no rank.)

**The rule:** a feature may value-import a feature of strictly lower rank. Same rank is not allowed (so no pair can ever be mutual). Any graph that obeys a strict rank is acyclic, so this rule is enough for "zero runtime feature cycles".

What the table is and is not: it is a faithful ratchet of today's 122 legitimate edges, not an ideal architecture. Some ranks are high for thin reasons (`post` is 6 because `post/preview-tool.ts` imports `site-inspection/page-body.ts` and `post/template-options.ts` imports `theme`). Lowering a rank later is a one-line change that the rule itself verifies. As features move to Jini, their rows leave the table; the Jini rule (package imports only itself + core + protocol) takes over.

Changing a rank is allowed only when the rule still passes for all edges. A new upward need is solved with a port, not by re-ranking around it.

### 3.2 Exact dependency-cruiser config

Add to `.dependency-cruiser.mjs`, next to the other generated rule families (the file already generates `no-deep-imports:<module>` the same way):

```js
// One row per feature folder. Rank = longest runtime import chain below it (designs/import-cycles/DESIGN.md §3.1).
const FEATURE_RANK = { deployments: 8, "email-templates": 8, "site-backup": 8, /* … the full table from §3.1 … */ workspace: 0 };
const FEATURES = "apps/website/src/features";
const TESTS = ".*/__tests__/.*|\\.test\\.ts$";
const alternatives = (names) => names.map((name) => name.replace(/-/g, "\\-")).join("|");
const FEATURE_RANK_RULES = [...new Set(Object.values(FEATURE_RANK))].map((rank) => {
  const here = Object.keys(FEATURE_RANK).filter((name) => FEATURE_RANK[name] === rank);
  const sameOrHigher = Object.keys(FEATURE_RANK).filter((name) => FEATURE_RANK[name] >= rank);
  return {
    name: `feature-rank:${rank}`,
    severity: "warn", // S6 changes this to "error"
    comment: "A feature may value-import only features of a strictly lower rank (FEATURE_RANK). Need something from above? Declare a port and let the composition root bind it.",
    from: { path: `^${FEATURES}/(${alternatives(here)})/`, pathNot: TESTS },
    // `$1` = the importing feature, so imports inside one feature are not checked.
    to: { path: `^${FEATURES}/(${alternatives(sameOrHigher)})/`, pathNot: `^${FEATURES}/$1/`, dependencyTypesNot: ["type-only", "type-import"] },
  };
});
const FEATURE_UNRANKED_RULE = {
  name: "feature-rank:unranked",
  severity: "error",
  comment: "Every feature folder with production code needs a FEATURE_RANK entry.",
  from: { path: `^${FEATURES}/[^/]+/`, pathNot: `^${FEATURES}/(${alternatives(Object.keys(FEATURE_RANK))}|__tests__)/|${TESTS}` },
  to: { path: `^${FEATURES}/[^/]+/`, pathNot: `^${FEATURES}/$1/` },
};
// forbidden: [...HAND_WRITTEN_RULES, ...FEATURE_RANK_RULES, FEATURE_UNRANKED_RULE, …existing generated families]
```

Notes on the exact shape:
- **`dependencyTypesNot` needs both values.** `type-only` covers `import type`. `import("x").T` type nodes are tagged `type-import` by dependency-cruiser and were reported as value imports until `type-import` was added (found on `publish-content/backstop-ports.ts:22`).
- **The filter is safe here.** The file's own comment on `no-circular` explains why `dependencyTypesNot` cannot be used on a reachability rule. This rule judges one edge at a time, the same use the file already makes of it in `only-composition-constructs-concrete-adapters`.
- **Tests are out of scope of the rule** (they may import any feature), matching the existing rules.

### 3.3 Prototype result (verified)

`scripts/dc-rank-prototype.mjs` is this config with the table in `scripts/feature-ranks.json`. Run from the Tovu root with dependency-cruiser 18.7.2:

```
depcruise --config designs/import-cycles/scripts/dc-rank-prototype.mjs apps/website/src   → exit 11
feature-rank:0  project-keys → api-connections ×1 · publish-trust → deployments ×1
feature-rank:3  custom-credentials → source-control ×2 · custom-credentials → deployments ×1
feature-rank:6  source-control → site-backup ×6
```
11 violations, exactly the import statements of the five cut edges, and none on the other 122 runtime edges. With the type filter off (`TYPES=1`) it reports 67 rows on production files: the 11 plus 56 type-only import statements, which sit on the 37 upward type-only edges of lane T.

### 3.4 Tried and rejected

- **dependency-cruiser folder-scope cycles** (`scope: "folder"`, `to: { circular: true }`): 807 rows on today's tree (874 with types), across 67 folders, because the folder graph includes tests and the paths through `server/` and `assistant/`. Not usable as a gate.
- **File-level `no-circular` as the gate:** it is the right gate for *file* cycles and already exists at `warn`. It cannot see a feature cycle (0 runtime file cycles today while 24 features are tied).
- **An allow-list of feature pairs:** exact, but every new legitimate downward import would need a config edit. The rank table allows those for free.

## 4. Migration order

Every step is one commit that compiles and passes alone, with its caller and test updates inside it. One refactor kind per commit. Checks after every step, from the Tovu root:

```
npm run typecheck && npm run typecheck:tests
npm run check:boundaries          # the feature-rank count must equal the "violations" column in §1.5
npm test                          # or the affected feature folders plus server/runtime/composition
node designs/import-cycles/scripts/graph.mjs <fresh tovu-edges.json> summary   # SCC size per §1.5
```

| Step | Change | Files touched (production) | Tests | After: SCC / violations |
|---|---|---|---|---|
| **S0** | Add `FEATURE_RANK` + rules at `warn` (§3.2). No source change. Record 11. | `.dependency-cruiser.mjs` | none | 24 / 11 |
| **S1** | §2.1 repoint to `@jini-ai/devops/deploy`; delete two re-exports | `publish-trust/connect.ts`, `deployments/deploy-config-registry.ts`, `deployments/index.ts` | 0 test files name the function; run `publish-trust` and `deployments` suites | 7 / 10 |
| **S2** | §2.2 move scope function + kind constant to `platform/secrets/vault-api-connection-meta.ts`; delete one re-export | that file, `api-connections/{vault-stores,shared-owner,plugin-state-bindings}.ts`, `project-keys/site-references.ts` | 6 test files import `site-references`; none should need edits (signatures unchanged). Add one unit test for the moved function: exact returned object | 5 / 9 |
| **S3a** | §2.3(a) repoint both callers to Jini `repositoryTargetError`; delete forwarder | `custom-credentials/write-files-validation.ts`, `source-control/commit-site.ts`, delete `source-control/repository-target.ts` | 5 test files name these modules; any test of the forwarder is repointed or deleted with it | 5 / 8 |
| **S3b** | §2.3(b) move `bindSourceControlWritePort` to `source-control/write-port.ts`; inject the port | `custom-credentials/{credential-ports,tool-registrations}.ts`, new `source-control/write-port.ts`, `composition/deps.ts`, `composition/app.ts` | split the two `extract-s8-c2p1-*` test files | 3+2 / 7 |
| **S4** | §2.4 `PublishCompatibilityPort` | new port file, new binding file, `custom-credentials/tool-registrations.ts`, `composition/deps.ts`, `composition/app.ts` | 3 test files name the function. Add a test of the binding with a fake cache and fake registry: exact `cache.delete` arguments; registry load happens before the invalidator is returned; absent port → no call | 2 / 6 |
| **S5a** | §2.5 characterization test only | none | new test in `source-control/__tests__/` | 2 / 6 |
| **S5b** | §2.5 `StaticSitePackagerPort` | new port file, new `site-backup/static-site-packager.ts`, `source-control/{commit-site,tool-registrations}.ts`, every builder of `CommitSiteDeps` | 9 test files name `commit-site`: each fake `CommitSiteDeps` gains a `packager` (use the real `createStaticSitePackager()` or a fake of the interface; no `vi.mock`/module mocks of `site-backup`) | none / 0 |
| **S6** | Change `feature-rank:*` to `severity: "error"` | `.dependency-cruiser.mjs` | none | none / 0 |

Order reasons: S1 first because it is the smallest change and removes 17 features from the cycle. S2 and S3a touch no composition file. S3b, S4 and S5b each edit `deps.ts` and `app.ts` by replacing or adding one property; they are serial with each other and with any other lane that edits those two files.

**When the rule becomes a CI error:** at S6, right after S5b, in its own commit. Not earlier: `check:boundaries` runs with the `err` reporter and exits with the number of error rows, so an `error` rule with open violations fails the gate. See §8 item 1: the gate already exits 16 on this commit for unrelated rows, and that must be settled for S6 to mean anything.

**Lanes after the feature cycle** (each independent of S1–S6 unless stated):

| Lane | Change | Notes |
|---|---|---|
| **B1** | `external-mcp/tool-registrations.ts:31` stops importing `notifyExternalMcpRosterChanged` from `assistant/mcp-services.ts` (5 call sites: `:386, :387, :565, :566, :753`). The external-mcp tool deps gain `rosterChanged(optional?: { lowered?: { serverIds: string[] } }): Promise<void>`; the host binds the assistant function. | Keep `void` vs `await` at each call site exactly as today. 22 test files name the function. This import also breaks the existing `error` rule family in spirit (a feature reaching the delivery layer). |
| **B2** | Move `server/runtime/boot/startup-secrets.ts` (a leaf: 0 internal imports) to `platform/secrets/`; repoint its production importers (9 production files name `startupSecretEnvironment`, the definition included; among them `platform/headless-browser/desktop-render.ts:6` and 2 `assistant` files). | Removes `platform → server`. After B1 + B2 no feature is in a runtime cycle at any granularity. |
| **B3** | `assistant → server`: `asyncRoute` (`server/inbound/shared/async-route.ts`) and `resolveProtocol` (`server/inbound/public-http/routes/oauth/public-origin.ts`) are leaves → move to `platform/http`. `warmSiteServerForAgent` (`assistant/tool-registrations.ts:73`) becomes a port the host binds. | Leaves `assistant` and `server` acyclic at unit level. `server/inbound ↔ server/runtime` (38 and 354 import statements) is inside the server and belongs to size designs 01/02, not here. |
| **T** | 37 upward type-only feature edges (56 import statements; `EDGES.tsv` step `T`). Fix kind: the consumer declares its own port type, or the shared record type moves to `#src/contracts`. Biggest group: `publish-content` importing port types from 8 contributor features (16 statements). | Optional for "zero runtime cycles". Ratchet: run the rule with the type filter off and keep the count from rising (67 rows today; at most 56 after S1–S5). Decide in §9. |

## 5. Jini module cycles

Measured with the same extractor over `packages/*/src` (3,735 production files, tests excluded): **3** runtime file cycles, 0 package cycles (83 runtime package edges, `scripts/jini-pkgs.mjs`). The 11-11 survey said 2; the admin one is small and may be newer or may have been missed if `.tsx` was not scanned.

### J1 — `agent-runtime`: `json-event-stream.ts` ↔ 5 `defs/*/event-stream.ts` (6 files)

- **Why:** `json-event-stream.ts` (251 lines) holds two things: shared types and pure helpers (`:11-188`: `isRecord`, `nonEmptyString`, `trimmedNonBlank`, `optionalString`, `optionalNumber`, `pickUsage`, `dispatchFrame`, `safeParseJson`, `stringifyContent`, `extractErrorMessage`, `initializingStatus`, `todoWriteInputFrom*`), and the dispatcher (`:190-251`) that imports each agent's handler into module-scope maps (`MODEL_RECEIPT_EXTRACTORS`, `PARSERS_BY_KIND`). The codex, cursor-agent, gemini, kimi and opencode handlers import the helpers back. (`defs/antigravity/event-stream.ts` is imported by the dispatcher but does not import back.)
- **Hazard:** the maps are built while the module loads, from bindings of modules that are part of the same cycle. It works today because of the order in which the package entry loads them. A new entry point that loads a `defs/*/event-stream.ts` first could read a handler before it is initialised.
- **Fix:** new leaf `packages/agent-runtime/src/json-event-stream-shared.ts` with lines `:11-188` moved verbatim (types, helpers, the private helpers and constants they use). The five defs import the leaf. `json-event-stream.ts` keeps the dispatcher and imports what it needs from the leaf. `src/index.ts:58` exports the helper names from the leaf directly (no re-export through the old file, owner rule 5). The package's public names do not change.
- **Path-keyed debt:** `vitest.config.ts:53` documents a coverage exception for `stringifyContent`'s catch by file name. It must be re-pointed to the new file in the same commit (lesson 10).
- **Not verified:** that every helper in `:11-188` is free of references to `:190-251`. The executor checks with the compiler (move, then `tsc`), not by eye.

### J2 — `daemon`: `agent-executor/mcp-bridge.ts` ↔ `claude/config-dir.ts`, `claude/mcp-delivery.ts`, `opencode/mcp-config.ts` (4 files)

- **Why:** the three agent files import small shared pieces from `mcp-bridge.ts`: `JINI_MCP_SERVER_KEY` (`:30`), `mergeMcpJsonContent` (`:103`), `defaultReadMcpJsonFile` / `defaultWriteMcpJsonFile` (`:212, :216`). `mcp-bridge.ts` imports the agent files to build delivery maps (`:10`, used in module-scope `MCP_DELIVERY_BUILDERS`/`MCP_DELIVERY_WRITERS`) and re-exports four of their functions (`:13-14`).
- **Fix:** new leaf `agent-executor/mcp-json-file.ts` with `JINI_MCP_SERVER_KEY`, `mergeMcpJsonContent`, `defaultReadMcpJsonFile`, `defaultWriteMcpJsonFile`, `defaultRemoveMcpJsonFile` and the types they need. The three agent files and `mcp-bridge.ts` import the leaf. In a second commit, delete the two `export … from` lines (`:13-14`) and repoint their importers to `claude/config-dir.ts` and `opencode/mcp-config.ts` (20 files mention `mcp-bridge`; the executor lists which import those four names).
- **Prerequisite (lesson 10):** untangle lane R8-daemon-runtime (`untangle/daemon/R8-RUNTIME.md`) edits import lines in `mcp-bridge.ts` and `claude/config-dir.ts` (agent-runtime types → core contracts) and makes `mcp-bridge-probe.ts` take `spawn`. J2 runs after R8's edits to these files land, or the same executor does both. R8 says `node:fs` in `mcp-bridge.ts:3` gets "no port", so the default file functions move as they are.
- **Not verified:** what `mergeMcpJsonContent` references inside `mcp-bridge.ts` beyond `JINI_MCP_SERVER_KEY` and its parameter types.

### J3 — `admin`: `comments/react/components/QueueSection.tsx` ↔ `hooks/QueueSection.hooks.ts` (2 files)

- **Why:** `QueueSection.tsx:10` imports four hooks. `QueueSection.hooks.ts:8` imports the component `QueueActionsCell` back, to `createElement` it in the table's actions column (`:60`). `QueueActionsCell` itself (`QueueSection.tsx:53-`) calls `useQueueActionsCell` from the hooks file.
- **Fix:** move the cell and its own hook out together: `components/QueueActionsCell.tsx` + `hooks/QueueActionsCell.hooks.ts` (`useQueueActionsCell` and what only it uses). `QueueSection.hooks.ts` imports the cell file; the cell file imports its hook file; nothing imports back. Moving only the component would leave a 2-file cycle between the cell and `QueueSection.hooks.ts`.
- **Prerequisite:** untangle lane R1-admin-react lists both files (handles/text repoints). On this commit the handle import is already repointed (`QueueSection.hooks.ts:2`); run J3 after R1 is closed for these files.
- **Test:** `comments/react/__tests__/use-comment-queue.unit.test.tsx` names the cell; add a render test that the actions column still shows the same menu items for one fixture row before the move.

### J4 — gate

Jini has `dependency-cruiser` 18.1.0 as a devDependency and no cycle rule (no match for `circular` in `scripts/guard.ts` or the checks beside it). Add to `pnpm guard` a run with `tsPreCompilationDeps: false` and the canonical `no-circular` rule (`from: {}, to: { circular: true }`) over `packages/*/src`, tests excluded, `severity: "error"` after J1–J3. With types excluded this is the runtime graph, so the rule needs no type filter (the trap described in Tovu's config comment does not apply). Expected today: 3 cycles. **Not run in Jini:** I measured with my extractor only; the first task of J4 is to confirm that dependency-cruiser reports the same three.

## 6. Owner engineering practices — check

| # | Practice | Status in this design |
|---|---|---|
| 1 | DI via typed ports from the host | S3b, S4, S5, B1, B3 replace a concrete cross-feature call with a port the composition root binds. S1/S3a import Jini pure functions directly; S2 imports a pure host constant/function from `platform`. Pre-existing and untouched: `assistant/mcp-services.ts` roster notification looks like module-level state (B1 only stops the feature from reaching it). |
| 2 | Args `(required, optional = {})` | All new functions and port methods use it. Kept as is: Jini `repositoryTargetError(required, optional)`; `validateRepositoryTarget(target, validateTarget?)` in `write-files-validation.ts:95` is positional today and is not changed here (it belongs to that file's DEDUPE row). |
| 3 | Functions ≤ 50, files ≤ 500, complexity ≤ 10 | New files are under 60 lines. Files already over 500 that a step edits: `commit-site.ts` 541 (S3a, S5b: net shorter), `source-control/tool-registrations.ts` 511 (S5b: ±0), `deps.ts` 3,168 and `app.ts` 2,690 (S3b/S4/S5b: one property each). `custom-credentials/tool-registrations.ts` is 497: S3b and S4 must end at or below that (both remove imports and lines). No function grows. Function-level limits inside the touched functions were not measured. |
| 4 | Feature slicing, split by responsibility | Each moved piece goes to the feature that owns the behaviour (write-port → source-control, packager → site-backup, compatibility binding → deployments). No folder is split. |
| 5 | No barrels / re-export shells / forwarders | S1 deletes 2 re-exports, S2 deletes 1, S3a deletes a forwarder file, J2 deletes 2 `export … from` lines. No step adds one. **Conflict:** the repo's `no-deep-imports:*` rules (ADR-009) require imports through `index.ts`, which is the opposite of this practice. See §9. |
| 6 | Why-comments move with code | Named per step (S2 doc comment, S3a file comment, J1 verbatim move). |
| 7 | Generic → Jini; Jini imports only itself + core + protocol | Nothing generic is added to Tovu. S1 and S3a use existing Jini exports. J1–J3 stay inside one package each. Flagged for later: `publish-trust/connect.ts` cannot keep a `devops` import if it moves into `cms`. |
| 8 | Tests use fakes of interfaces, no mocking of another package's internals | New tests use fakes of the three ports. S5b updates 9 test files to pass a `packager` instead of relying on the import. |
| 9 | Errors never swallowed or generic | New port results are typed (`destination-collision`). **Pre-existing, kept on purpose:** `commit-site.ts:404-409` maps any other packaging error to a generic message. Changing it is a behaviour change (practice 10), so it is flagged, not fixed. |
| 10 | No new eslint-disable / @ts-ignore, no silent behaviour change | None needed. Behaviour pins are listed in §2.4 and §2.5. |
| 11 | Smallest change, reuse first, no abstraction with one user | S1/S2/S3a are repoints and moves. S4 and S5 add a port with one implementation: justified by practice 1 and by CLASSIFY, which already names both as host contracts of the Jini move. No contracts layer, event bus or new package is introduced. |
| 12 | Memory / IO cost on hot paths | No new I/O. S4 keeps one registry load per credential write. S5 packaging runs once per commit as today. The rank rule adds 10 regex rules to a 24 s depcruise run. |

## 7. Estimate

| Work | Lanes | Size |
|---|---|---|
| S0–S6 (feature cycle) | 8 small serial commits | S0, S1, S6: under 30 min each. S2, S3a: about 1 h each. S3b, S4: 2–3 h each. S5a+b: 4–5 h. About 1.5–2 working days of one Sonnet-class executor, with an Opus review of S3b, S4, S5b (late reads, port behaviour). |
| B1–B3 | 3 lanes | B1 3 h (22 test files), B2 1 h, B3 3 h. |
| J1–J4 | 4 lanes in Jini | J1 2 h, J2 2 h after R8, J3 1 h, J4 1 h. |
| T | optional | 37 edges; about 2 days if done fully. |

Rough tokens, same scale as the untangle plan: S+B+J about 1.5M Sonnet and 0.2M Opus. These are estimates, not measurements.

## 8. Not verified, and risks

1. **The boundaries gate is already red on this commit.** `depcruise --config .dependency-cruiser.mjs apps/website/src` (the body of `npm run check:boundaries`) exits **16**: 16 `no-deep-imports:*` rows at `error` (6 are feature → feature deep imports such as `post/repo.ts → media/access-evidence.ts`; the rest are `server`/`assistant` → feature or `platform/site-dir`). I ran it with dependency-cruiser 18.7.2 from a scratch install and without `npm ci` (external packages unresolved; all 8,615 internal specifiers resolved). I did not run CI. If CI shows the same, S6 cannot turn the gate green by itself.
2. **I did not run `npm ci`, `tsc` or the test suites.** Every fix is designed from reading the code and the import graph. Test-file counts come from `grep`, not from running tests.
3. **Usage classification is syntactic.** A name is "value-used" if it appears outside a type position. Shadowing could overcount runtime edges; it cannot hide one. dependency-cruiser's runtime run agrees on the file-cycle count (0), which checks the result that matters.
4. **`routeDeps` field reads in `custom-credentials/*`** were listed only for `loadSourceControlProviders` (lines 90, 298, 362). S4's executor must list reads of `loadDeployTargets` and the cache before removing fields.
5. **`CommitSiteDeps` builders** were not enumerated (11 production files mention `commit-site`).
6. **Late reads at the composition root** (S3b) were not traced in `deps.ts`/`app.ts`.
7. **Size designs 01/02 split `deps.ts` and `app.ts`.** S3b, S4 and S5b edit both. Whichever lands second must rebase its one-line edits; they must not run in parallel with that split.
8. **LESSONS file:** the brief says 15 rules; the file on `plan/size-designs-2026-11-16` has 11. I checked the 11.
9. **Rank table drift:** between this commit and execution, new edges may appear. S0 regenerates `feature-ranks.json` (`graph.mjs ranks <the five cuts>`) and confirms the violation list is still exactly the five edges.

## 9. Owner decisions

1. **Barrels vs deep imports.** Owner practice 5 says no barrels; `.dependency-cruiser.mjs` `no-deep-imports:*` (ADR-009) says cross-module imports must go through `index.ts`, and 16 rows of it are `error` today. Which one wins? This design assumes practice 5 (S1 imports the Jini function directly and deletes re-exports) and makes the rank rule independent of the answer.
2. **Fix the red gate before S6, or scope S6?** Options: (a) settle the 16 rows first; (b) run the `feature-rank` rules as their own blocking CI step so they can be enforced while the old rows stay.
3. **Type-only upward edges (lane T).** Is "zero runtime cycles" the finish line, with the 37 type-only edges as a ratchet that may not grow, or should they go to zero too?
4. **`source-control ↔ site-backup` direction.** The design keeps `site-backup → source-control` and inverts the other way with a packager port. The alternative with equal count is to move the static packaging files out of `site-backup` into `site-export` (their CLASSIFY target is `devops/static-export`). The port is smaller now and matches the CLASSIFY host contract; the move would be right only if the owner wants the Tovu folders to mirror the Jini packages before the move.
5. **Rank table as the long-term rule?** It is a ratchet derived from today's edges. Accept it as transitional (features leave it as they move to Jini), or ask for a named-layer model first (more design, more edges to re-home, no extra safety).
6. **Second cycle (B lanes) in scope of hard item #6?** B1 and B2 are what makes "no feature is in any runtime cycle" true at every granularity; B3 is the `assistant`/`server` shell.
7. **Jini third cycle (J3).** Confirm it counts under hard item #6 (the survey listed 2).
8. **Order against other lanes:** J2 after untangle R8; J3 after untangle R1; S3b/S4/S5b serial with size designs 01/02.
