# Break the website import cycle (hard item #6) — design, 2026-11-16, revision 2

Planning only. No source file was changed. Measured on Tovu `integ/wave-b-r2` @ `65302ee5` and Jini `integ/wave-b-r2` @ `02edbb68`.
Data: `EDGES.tsv` (286 rows). Scripts: `scripts/` (commands in §1.1).
Revision 2 answers `CODEX-JUDGE.md` finding by finding (last section, "Judge response": 10 findings, 9 accepted, 1 accepted in part). Every finding was checked against the code first. Where revision 1 and this text differ, this text is the design.

## 0. Summary

1. **The cycle is real at feature level and absent at file level.** 24 feature folders form one runtime cycle (64 runtime edges inside it). No two *files* in `apps/website/src` import each other at runtime, directly or through a chain. So nothing breaks at load time today. The cycle is a grouping problem: a folder holds files of two layers.
2. **Five feature edges close every loop** (exact minimum, §1.5). They are 11 import statements in **7** files. Removing the first one shrinks the cycle from 24 features to 7.
3. **Fixes by kind:** 1 repoint to an existing Jini export, 1 move of a pure function down to `platform/secrets`, 1 repoint + move of a binding to its owner, 2 ports the host binds (in both, the implementation is existing code moved verbatim to the feature that owns it). No new package, no event bus, no barrel.
4. **Rule:** a rank table for the 68 feature folders, one generated dependency-cruiser rule per rank, and a **node check** that every feature folder with production code has a rank (an edge rule cannot see a folder without edges). Prototype on the real tree: exactly the 11 statements, nothing else (§3.3).
5. **Jini has 3 runtime module cycles** (agent-runtime 6 files, daemon 4, admin 2) and 0 package cycles. Each is fixed by extracting a leaf file (§5). The Jini numbers now come from real compiler emission, because Jini builds with `verbatimModuleSyntax` (§1.1).
6. **Also found:** a second runtime cycle through `server/` and `assistant/` (8 units, 4 features caught in it), and 37 upward type-only feature edges. Both are later lanes (§4, B and T).
7. **Order changed in revision 2:** S0, S1, S2, S3a can run now (cycle 24 → 5; no composition file touched). S3b, S4, S5 add properties to the two composition roots, which are over the size limit and under a shrink-only ratchet, so they run after size designs 01/02 or need an owner decision (§4.1, §9).

## 1. Measurement

### 1.1 Method (revision 2: runtime = what the compiler really emits)

Revision 1 decided "runtime or type" by reading the syntax. That is wrong for a package built with `verbatimModuleSyntax`: there `import { type A } from "./x.js"` is emitted as `import {} from "./x.js"`, which still loads the module, and an unused value import is kept too. `scripts/edges.mjs` now asks the compiler:

1. **Which files.** The files of the build tsconfig, with `include` / `exclude` / `extends` resolved by TypeScript, plus every source file they import (tsc compiles those too). Test files (`__tests__/`, `*.test.*`, `*.spec.*`, `*.typecheck.*`) are removed. `noEmit` projects are not build projects. For Jini: every `tsc -p <config>` named in a package's `build` script, limited to `packages/<name>/src/`.
2. **Which statements are runtime.** Each file is emitted with its own project's `compilerOptions`. A transformer that runs after emission records which source `import` / `export … from` statements are still in the JavaScript. A self-check compares that with the import statements counted in the emitted text; it must match for every file.
3. **Two emit modes.** `program` = full `tsc` emit with type information (what Tovu's `npm run build:server` does: `tsc -p tsconfig.json`). `transpile` = one file at a time (what `isolatedModules` builds, `tsx` and esbuild do; Tovu's dev server and tests run on `tsx`).

| Kind | Meaning |
|---|---|
| `runtime` | The statement is in the emitted JavaScript. Sub-flags: `empty` (kept only as `import {} from`), `unused` (kept although no name is used as a value). Also every `import()` / `require()` (`dynamic`). |
| `erased` | Written without `type`, dropped by the compiler because no name is used as a value. Fragile: one value use makes it runtime. Cannot occur under `verbatimModuleSyntax`. |
| `type` | `import type`, `export type … from`, all-inline-`type` names when the compiler drops them, or an `import('x').T` type node. |

Compiler settings that decide this, as resolved by TypeScript (the script prints them per project):

| Repo | Projects | `verbatimModuleSyntax` | `isolatedModules` | `importsNotUsedAsValues` / `preserveValueImports` | Emit used |
|---|---|---|---|---|---|
| Tovu website | `tsconfig.json` | off | off | unset / off | `program`, and `transpile` as a cross-check |
| Jini | 39 package projects (`tsconfig.base.json`) | **on** | on | unset / off | `transpile` (exact: with `verbatimModuleSyntax` the decision is per file) |
| Jini | `sandbox/tsconfig.cjs.json` (second build of the same 12 files) | off | on | unset / off | not used; the ESM build decides. Reported by the script. |

`scripts/graph.mjs` aggregates files to features, finds strongly connected components (Tarjan) and the minimum feedback arc set (§1.5).

Reproduce (Node 24; `npm i typescript@5 dependency-cruiser@18.7.2` in a scratch folder):
```
node scripts/edges.mjs <tovu> tovu-edges.json --project tsconfig.json --within apps/website/src --alias '#src/=apps/website/src/'      # add --emit transpile for the tsx view
node scripts/graph.mjs tovu-edges.json summary        # SCCs at feature, unit and file level
node scripts/graph.mjs tovu-edges.json fas features   # exact minimum feedback arc set
node scripts/graph.mjs tovu-edges.json steps "publish-trust>deployments" "project-keys>api-connections" "custom-credentials>source-control" "custom-credentials>deployments" "source-control>site-backup"
node scripts/edges.mjs <jini> jini-edges.json --packages packages --extra-project packages/provider-plugins/tsconfig.json --scope @jini-ai/
node scripts/graph.mjs jini-edges.json summary && node scripts/jini-pkgs.mjs jini-edges.json
node scripts/edges.mjs <tovu> tovu-all.json --extra-project tsconfig.tests.json --within apps/website/src --alias '#src/=apps/website/src/' --emit transpile --tests
node scripts/importers.mjs tovu-all.json <file> [name …]      # consumer inventory of a move, tests included
node scripts/fn-sizes.mjs <repo> <file …>                     # functions over 50 lines / complexity 10
node scripts/check-feature-ranks.mjs <tovu> scripts/feature-ranks.json   # and --self-test
```

Cross-check: dependency-cruiser 18.7.2 `no-circular` over `apps/website/src`, tests excluded. With `tsPreCompilationDeps: false` (runtime only): **0** violations. With `true` (types included): 16 rows, the same 16 the repo's own `npm run check:boundaries` prints.

### 1.2 Results (Tovu website)

| Fact | Measured | 11-11 survey |
|---|---|---|
| Production files / internal import edges | **2,132** / 8,615 (6,355 runtime of which 15 dynamic, 2,257 type, 3 erased) | – |
| Same numbers under `tsc` program emit and single-file emit | identical; 0 statements differ from the syntactic rule | – |
| Feature folders with production code | 68 | – |
| Feature → feature edges, runtime | 127 (53 features take part) | – |
| Feature → feature edges, type-only | 114 (59 of them on pairs with no runtime edge) | – |
| Runtime feature SCCs | **1, of 24 features**, 64 internal edges | 24 ✔ |
| Mutual feature pairs | **3** runtime; 17 when type-only edges count | 21 ✘ |
| Feature SCC with type-only edges counted | 1, of 30 features | – |
| File-level runtime cycles | **0** | – |
| File-level cycles with types counted | 6 SCCs (15, 3, 2, 2, 2, 2 files) | – |
| Dynamic imports between features | 0 | – |

Changed from revision 1: 2,133 → 2,132 files. The build tsconfig excludes `features/webhooks/seal-aad-invariant.ts`; it has no internal import, so no edge count moved. Tovu does not set `verbatimModuleSyntax`, so the classification did not change.

The survey's "21 mutual pairs" does not reproduce. The closest number is 17 (type-only edges counted).

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

Line numbers are from `65302ee5`. Paths are under `apps/website/src/features/` unless they start with another root. Consumer lists come from `scripts/importers.mjs` over a dump that includes tests.

### 2.1 `publish-trust → deployments` (S1) — repoint to Jini

- **Site:** `publish-trust/connect.ts:1` imports `isContainedDeployConfigPath` from `../deployments/index.js`; used once at `:81` to skip deploy-config paths that leave the repo.
- **Why it exists:** the function is defined in Jini (`@jini-ai/devops/deploy`, `packages/devops/src/deploy/config-descriptors.ts`). `deployments/deploy-config-registry.ts:8,16` imports and re-exports it "to keep the host's existing imports", and `deployments/index.ts:71-73` re-exports it again.
- **Consumers of the name (all):** `publish-trust/connect.ts:1`. No test imports it by name. `deployments/__tests__/index.unit.test.ts:3` imports `* as deployments` and asserts only that no `DeploymentProvider` name exists and that `loadDeployConfigGeneratorsFromSource` is a function, so it stays green.
- **Fix:** `connect.ts` imports it from `@jini-ai/devops/deploy`. Delete the name from the `export { … }` at `deploy-config-registry.ts:16` and from `deployments/index.ts`. Keep the comment at `deploy-config-registry.ts:14-15` for the type re-exports that remain.
- **CLASSIFY:** `publish-trust/connect.ts` is not in the backlog (stays). If it later follows `handshake-client.ts` into `@jini-ai/cms`, a `cms → devops` import is not allowed there; the guard then arrives as a port. Not part of this step.

### 2.2 `project-keys → api-connections` (S2) — move a pure function down

- **Site:** `project-keys/site-references.ts:5` imports `apiConnectionVaultScope` and `PLUGIN_STATE_FORMAT` from `../api-connections/vault-stores.js`; used at `:27, :45, :63, :73`.
- **Why it exists:** `apiConnectionVaultScope` (`vault-stores.ts:67-69`) is a 3-line pure function returning `{ workspaceId, kind: API_CONNECTION_VAULT_KIND, ownerKey: "tovu", principalId: null, binding: null }`. `PLUGIN_STATE_FORMAT` is not defined in `vault-stores.ts`: line 19 re-exports it from `#src/platform/secrets/vault-api-connection-meta` (27 lines, already holds the formats).
- **Fix:** move `API_CONNECTION_VAULT_KIND` (`vault-stores.ts:34`) and `apiConnectionVaultScope` with its doc comment into `platform/secrets/vault-api-connection-meta.ts`. Delete the re-export at `vault-stores.ts:19` (owner rule 5). No signature changes. `vault-stores.ts` imports the two names it still uses.
- **Every importer of the three names from `vault-stores.js` is repointed in this commit** (3 production, 6 test files):

| File | Names |
|---|---|
| `project-keys/site-references.ts:5` | scope, format |
| `api-connections/shared-owner.ts:7` | scope, format (its other four names stay on `vault-stores.js`) |
| `api-connections/plugin-state-bindings.ts:4` | scope, format |
| `api-connections/__tests__/plugin-state-format.pin.unit.test.ts:8` | kind, format, scope |
| `api-connections/__tests__/vault-stores.unit.test.ts:19` | kind, scope |
| `api-connections/__tests__/shared-owner.integration.test.ts:21` | scope |
| `api-connections/__tests__/shared-bindings.postgres.test.ts:12` | scope |
| `site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts:2` | scope, format |
| `server/runtime/composition/__tests__/api-connection-state-vault.identity.test.ts:10` | scope, format |

- **Tests:** no new test. `plugin-state-format.pin.unit.test.ts:12-14` already asserts the exact format string, the exact scope object and the exact kind string; it keeps those assertions and only its import line changes. (Revision 1 proposed a new unit test; it would have duplicated this one.)
- **Why not a port:** the function is pure and host-owned (`ownerKey: "tovu"`). CLASSIFY sends `vault-stores.ts` to `@jini-ai/integrations/api-connections/token-store` with "Host supplies: vault scope ownerKey, meta formats". A Tovu `platform/secrets` file is where the host keeps what it will supply. A port would be an abstraction with one implementation (owner rule 11).
- **Left over:** `project-keys → api-connections` keeps one type-only import (`SharedOAuthOwnerStorage`). It is a T row.

### 2.3 `custom-credentials → source-control` (S3) — repoint to Jini, move a binding to its owner

**(a) S3a. `custom-credentials/write-files-validation.ts:3`** imports `repositoryTargetError` from `../source-control/repository-target.js`. That file is a 20-line forwarder: `repositoryTargetError(target, validateTarget?)` returns Jini's `repositoryTargetError(target, { validateTarget })` (`@jini-ai/devops/source-control`). Jini also exports `RepositoryTargetValidator`.
- **Consumers (all):** `write-files-validation.ts:3`, `source-control/commit-site.ts:19`, and one test, `source-control/__tests__/repository-target.unit.test.ts:3`.
- **Fix:** both production callers import the function from `@jini-ai/devops/source-control` and call `repositoryTargetError(target, { validateTarget })`. Delete `source-control/repository-target.ts`. Its file comment (which three tools run this check, host rules first) moves to the call in `commit-site.ts` (owner rule 6). The test file keeps every assertion (`:9-13`: exact messages, 60/100 character caps, valid names) and imports the Jini function instead; it stays in Tovu as the host's pin on a function it depends on.
- **CLASSIFY:** `write-files-validation.ts` is DEDUPE-AFTER-HARDENING → `devops/source-control`. This repoint is a first part of that row.

**(b) S3b. `custom-credentials/credential-ports.ts:15`** imports `buildSourceControlProviderForApi` for `bindSourceControlWritePort` (`:68-79`). That function binds the core contract `SourceControlWritePort` (`@jini-ai/core/contracts/credentials`) over the source-control provider registry: source-control's adapter, living in the consumer's folder. Its one production caller is `tovuCredentialToolPorts` at `custom-credentials/tool-registrations.ts:362`.
- **Fix, feature side:** move `bindSourceControlWritePort` verbatim to a new file `source-control/write-port.ts` (it keeps calling `validateRepositoryTarget` from `custom-credentials`; that direction is downward, rank 6 → 3). The interface **`CustomCredentialsToolDeps`** (`custom-credentials/tool-registrations.ts:62`; revision 1 named a type that does not exist) gains `readonly sourceControlWrite: SourceControlWritePort` (required). `tovuCredentialToolPorts` (`:359-364`) returns `sourceControlWrite: routeDeps.sourceControlWrite`. `loadSourceControlProviders` stays on the interface: `:298` still lists provider descriptors with it.
- **Fix, host side:** `RouteDeps` (`server/routes/types.ts`) gains `sourceControlWrite: SourceControlWritePort`. The assistant's tool deps are the intersection `… & CustomCredentialsToolDeps & …` (`assistant/tool-registrations.ts:142`), which `RouteDeps` must satisfy, so the host bag is where the field belongs.
- **Late-read rule (lesson 3), now traced.** Today the port is built when the registrations are built, from the bag that is passed in, and `build()` reads `required.load / httpClient / observability` at call time. In the roots these values are created as follows:

| Value | `deps.ts` | `app.ts` |
|---|---|---|
| `loadSourceControlProviders` | inside the `routeDeps` literal, `:2798` | inside the literal, `:1669` |
| `customCredentialsHttpClient` | `const` at `:2061`, before the literal (`:2265`) | inside the literal, `:1701` |
| `observability` | `const` at `:2014` | inside the literal, `:1425` |

  So the port cannot be built from plain values inside the literal in `app.ts` (they do not exist as bindings), and `routeDeps` itself is not readable while its own literal is evaluated. The host therefore passes getters, the same self-referencing shape `exportSiteBound` uses (`deps.ts:2841`, `app.ts:1720`):
```ts
sourceControlWrite: bindSourceControlWritePort({
  load: (input, optional) => routeDeps.loadSourceControlProviders(input, optional),
  get httpClient() { return routeDeps.customCredentialsHttpClient; },
  get observability() { return routeDeps.observability; },
}),
```
  This works because the moved function reads `required.*` inside `build`, not when it is bound. The executor must keep that property (do not destructure `required` at bind time) and pin it with a test: bind with getters that throw, assert binding does not throw, then assert `build` reads them.
- **Known difference (the documented "closure identity" rule, `server/routes/types.ts:1733`):** a test that copies a composed `RouteDeps` with a spread and overrides `loadSourceControlProviders`, `customCredentialsHttpClient` or `observability` no longer changes what `custom_credential_write_files` uses; it must override `sourceControlWrite` too. Hand-built fixtures are not affected (they build their own port, below). Not verified: whether any composed-root test relies on such an override; `npm test` on the three composition suites in the fixture table decides.
- **Fixtures (finding 3).** 16 test files construct `CustomCredentialsToolDeps` and must add the field in this commit: in `custom-credentials/__tests__/`: `create-agent-tool.unit`, `credential-save-probe`, `extract-s8-c2p2-pins.support.ts`, `extract-s8-c2p2c-ports`, `form-save-errors.model-facing`, `list-agent-tool.unit`, `make-request-delete-confirmation`, `set-token-agent-tool.unit`, `set-username-agent-tool.unit`, `tool-registrations.model-facing-errors`, `write-files-confirmation`, `write-files-network-failure.model-facing`; in `assistant/__tests__/`: `moved-tools.credential-cards.golden`, `read-only-tool-constraint.composition`, `tool-registrations.custom-credentials-egress-refusal.integration`; plus `server/runtime/boot/__tests__/mail-credential-cards.unit`. (`extract-s8-c2p2-host-inputs`, `extract-s8-x-host-operations` and `extract-s9-tools-public` build through other entry points; `npm run typecheck:tests` shows whether their bags need it.) Rule for the value: a fixture that passes a working `loadSourceControlProviders` fake builds the port with the real `bindSourceControlWritePort` over **its own** fake loader and HTTP client, so every existing write-files assertion keeps running through the same code; a fixture whose loader is a stub passes a fake `SourceControlWritePort` whose four methods fail the test if called. No module mocks.
- **Binder tests:** the source-control half of `custom-credentials/__tests__/extract-s8-c2p1-credential-ports.test.ts:17` and `extract-s8-c2p1-ports.type-pin.ts:27` moves to `source-control/__tests__/` in the same commit; the `bindCredentialedRequestPort` half stays.
- **Left over:** `tool-registrations.ts:90,298` keeps a type-only import of `LoadSourceControlProviders`. That is a T row.

### 2.4 `custom-credentials → deployments` (S4) — a port, with today's code moved behind it

- **Site:** `custom-credentials/tool-registrations.ts:7` imports `invalidatePublishCredentialCompatibility` from `../deployments/publish-credentials/index.js`; used at `:425-430` inside `publish.prepareInvalidation` of `bindTovuCredentialToolOperations`. Line `:9` adds a type import of `DeployTargetRegistry`.
- **Why it exists:** when a custom credential is created, publish targets whose eligibility changed must drop their cached verification. The host injects both raw ingredients (`loadDeployTargets?`, `publishCredentialVerificationCache?`); the feature then calls the concrete `deployments` function itself.
- **Fix (changed in revision 2):** the six lines `:425-430` move verbatim into `deployments`, behind a port that `custom-credentials` declares. Revision 1 wrote a new binding and made the port optional; that would have created a second "absent" contract and an eager read. Moving the existing lines keeps every read and every branch as it is.
```ts
// features/custom-credentials/publish-compatibility-port.ts (new; consumer-owned port)
import type { CredentialToolOperations } from "@jini-ai/integrations/credentialed-http/tools";
/** Tells publish targets that a saved credential's compatibility changed. Bound by the host. */
export interface PublishCompatibilityPort {
  /** Loads what invalidation needs BEFORE the credential write. The returned function runs after the write and loads nothing. */
  prepareInvalidation(required: { workspaceId: string }, optional?: Record<string, never>): ReturnType<CredentialToolOperations["publish"]["prepareInvalidation"]>;
}

// features/deployments/publish-credentials/compatibility-port.ts (new; beside the function it calls)
/** The two optional host values the invalidation has always read. Read at call time, never at bind time. */
export interface PublishCompatibilitySource {
  readonly loadDeployTargets?: (required: { workspaceId: string }, optional?: Record<string, never>) => Promise<DeployTargetRegistry>;
  readonly publishCredentialVerificationCache?: { delete(input: { workspaceId: string; target: string }): void };
}
export function bindPublishCompatibility(required: { readonly source: PublishCompatibilitySource }, _optional: Record<string, never> = {}): PublishCompatibilityPort {
  return { prepareInvalidation: async ({ workspaceId }) => {
    const source = required.source;
    const registry = source.loadDeployTargets && source.publishCredentialVerificationCache ? await source.loadDeployTargets({ workspaceId }) : undefined;
    return ({ after }) => {
      if (registry && source.publishCredentialVerificationCache) invalidatePublishCredentialCompatibility({ workspaceId, registry, cache: source.publishCredentialVerificationCache, after });
    };
  } };
}
```
  `CustomCredentialsToolDeps` gains `readonly publishCompatibility: PublishCompatibilityPort` (required) and loses `publishCredentialVerificationCache?` (its only reads are `:426` and `:428`). `loadDeployTargets?` stays: `:295` lists deploy descriptors with it. `bindTovuCredentialToolOperations` keeps `prepareInvalidation: () => routeDeps.publishCompatibility.prepareInvalidation({ workspaceId: routeDeps.workspaceId })`. `deployments` importing the `custom-credentials` port type is downward (rank 8 → 3).
- **Host:** `RouteDeps` gains `publishCompatibility`. In both roots: `publishCompatibility: bindPublishCompatibility({ get source() { return routeDeps; } })`. A plain `{ source: routeDeps }` inside the literal would read `routeDeps` before it is initialised and throw at boot (lesson 3); the getter is read only when a credential is saved. The cache stays the one instance the admin HTTP routes use (`server/inbound/admin-http/routes/system/custom-credentials.ts:3`, `publish-credentials.ts:5` call the same function with `deps.publishCredentialVerificationCache`), because the binding reads it from the same bag.
- **Behaviour that must not change, and the tests that already pin it (finding 3):** `custom-credentials/__tests__/extract-s8-x-host-operations.test.ts:300-321` asserts: the registry and the cache are called as methods of the same objects (`this` identity), the registry loads exactly twice (once for `loadProviders`, once in `prepareInvalidation`), nothing is deleted before the save, invalidation runs after the save and does not load again, and the exact `cache.delete` argument. The next test (`:323`) asserts that with no cache there is no registry load for invalidation. Both tests stay, with every assertion; only the fixture changes: `deps = { ...base, loadDeployTargets, publishCompatibility: bindPublishCompatibility({ source: { loadDeployTargets, publishCredentialVerificationCache: cache } }) }` (and `source: { loadDeployTargets }` for the second). A rejected load still propagates from `prepareInvalidation`; the binding adds no `catch`.
- **Fixtures:** the same 16 files as S3b add `publishCompatibility: bindPublishCompatibility({ source: {} })`: the real binding with no ingredients, which is the no-op they get today. No new fake is needed.

### 2.5 `source-control → site-backup` (S5) — port inversion, reaching preview and commit

- **Sites:** `source-control/commit-site.ts:8-12` imports `prepareStaticReport`, `staticDownloadLayout`, `LANDING_FILE`, `claimArchivePaths`, `SiteShareRefusal` from five `site-backup` files; used at `:398-409` (package the exported site into commit files, inside `exportForCommit`) and `:532` (entry path, inside `commitOutcome`). `source-control/tool-registrations.ts:4` imports `LANDING_FILE`, used at `:459` (dry-run result).
- **Why it exists:** a commit publishes the same portable static copy that the backup/share download builds. The packaging code lives in `site-backup`.
- **CLASSIFY:** `commit-site.ts` is DELETE-AFTER-PARITY → `@jini-ai/devops/source-control` with "Host contract: `credentials.resolve`, `files.export` (theme pinning + packaging), `layout.outputDirectory/cleanup`". Packaging is already planned as a host-supplied port. This step introduces it now, in Tovu.
- **The port:**
```ts
// features/source-control/static-site-packager-port.ts (new; consumer-owned port)
export interface StaticSitePackagerPort {
  /** File a visitor opens first in the packaged copy (today's LANDING_FILE). */
  readonly entryFile: string;
  /** Turns a finished export into flat commit files. Never throws for a path collision. */
  packageSite(required: { report: ExportReport; site: StaticSiteIdentity }, optional?: Record<string, never>): StaticSitePackage;
}
export type StaticSitePackage = { ok: true; files: CommitFile[] } | { ok: false; kind: "destination-collision"; message: string };
// StaticSiteIdentity = what StaticSiteContextFn resolves to today: { name, slug, theme, themeId }.

// features/site-backup/static-site-packager.ts (new; the implementation, beside the code it calls)
export function createStaticSitePackager(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): StaticSitePackagerPort
```
  The implementation is the body of `commit-site.ts:398-402` moved verbatim, plus the `SiteShareRefusal` + `/collision|aliases/i` test from `:405`, which becomes the `destination-collision` result. Any other error is rethrown unchanged.
- **Where the packager travels (finding 1, the blocker).** Revision 1 put it on `CommitSiteDeps`. That cannot work: packaging runs in `exportForCommit({ input, providerId })` (`commit-site.ts:369`), which gets no `CommitSiteDeps`, and the preview (`previewCommitExport(input, …)`, `:429`) has no `CommitSiteDeps` at all. Both paths do share `CommitSiteInput`, which already carries the two host-bound export functions (`staticSiteContext`, `exportSiteBound`, `:209,217`). The packager goes beside them:

| Hop | Change |
|---|---|
| `server/routes/types.ts` (next to `staticSiteContext`, `:1721`) | `RouteDeps.staticSitePackager: StaticSitePackagerPort` |
| `composition/deps.ts` (next to `:2842`), `composition/app.ts` (next to `:1721`) | `staticSitePackager: createStaticSitePackager()`. It has no dependencies and no state, so there is no late-read question. |
| `source-control/tool-registrations.ts:224` `SourceControlToolDeps` | `readonly staticSitePackager: StaticSitePackagerPort` (required) |
| `tool-registrations.ts:301` `commitInput` | adds `packager: deps.staticSitePackager`. This one function builds the input for both the dry run (`:435`) and the commit (`:484`). |
| `commit-site.ts:207` `CommitSiteInput` | `readonly packager: StaticSitePackagerPort` (required) |
| `commit-site.ts:369` `exportForCommit` | calls `input.packager.packageSite({ report, site: context })`; `destination-collision` → `EXPORT_FAILED` with ``Static site destination validation failed: ${message}``; a thrown error → `EXPORT_FAILED` with the existing generic text (the `try/catch` stays here) |
| `commit-site.ts:511` `commitOutcome` (already receives `input`) | `entryPath` uses `input.packager.entryFile` |
| `tool-registrations.ts:459` | `entryPath` uses `deps.staticSitePackager.entryFile` |

  `CommitSiteDeps` does not change. After the step `source-control` imports nothing from `site-backup`. `site-backup` importing source-control's port type is downward (rank 8 → 6), and `site-backup → source-control` already exists. `commitInput` is the only production builder of a `CommitSiteInput` (grep: no production file outside `features/source-control/` names the type).
- **Fixtures:** `source-control/__tests__/commit-site.unit.test.ts` builds `CommitSiteInput` in 22 places (21 literals from `:220` to `:870` and the helper at `:609`): each gains `packager: createStaticSitePackager()` (the real one, so every existing file-list assertion keeps running through real packaging). `SourceControlToolDeps` fixtures: `source-control/__tests__/tool-registrations.dry-run.test.ts:71`, `tool-registrations.unit.test.ts:69` (real packager); `propose-credential-tool.test.ts:86` and `assistant/__tests__/moved-tools.credential-cards.golden.test.ts:99` (a fake `StaticSitePackagerPort` that fails the test if called, next to their existing `assert.fail` export fakes). No module mocks of `site-backup`.
- **Characterization test first (S5a; each assertion can fail on the risk named):** in `source-control/__tests__/`, on one fixed `ExportReport` fixture: (1) the commit receives the exact ordered list of `{ path, sha256(data) }`; (2) two files claiming one path give `EXPORT_FAILED` with the exact collision message; (3) a thrown non-refusal error gives the exact generic message; (4) `entryPath` equals the folder-prefixed landing file, for the commit result and for the dry-run result; (5) **preview and commit package the same files**: the dry run's `paths` and `fileCount` equal the sorted, folder-prefixed paths the fake git adapter received from the commit; (6) **the preview resolves no credential and writes nothing**: the fake credential repo and the fake git adapter record zero calls during the dry run. It passes before and after S5b. It fails if the port drops `readme`, `metadata` or `{ manifest: false }`, or if preview and commit ever get different packagers.
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

### 3.2 Exact dependency-cruiser config, and the node check

The rank table lives in one JSON file that both the rule and the node check read (one source of truth): `development/boundaries/feature-ranks.json` (today: `designs/import-cycles/scripts/feature-ranks.json`). Add to `.dependency-cruiser.mjs`, next to the other generated rule families (the file already generates `no-deep-imports:<module>` the same way):

```js
// One row per feature folder. Rank = longest runtime import chain below it (designs/import-cycles/DESIGN.md §3.1).
const FEATURE_RANK = JSON.parse(readFileSync(new URL("./development/boundaries/feature-ranks.json", import.meta.url), "utf8"));
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
    // The group in `from.path` is the importing feature; `$1` in `to.pathNot` then skips imports inside that feature.
    from: { path: `^${FEATURES}/(${alternatives(here)})/`, pathNot: TESTS },
    to: { path: `^${FEATURES}/(${alternatives(sameOrHigher)})/`, pathNot: `^${FEATURES}/$1/`, dependencyTypesNot: ["type-only", "type-import"] },
  };
});
// forbidden: [...HAND_WRITTEN_RULES, ...FEATURE_RANK_RULES, …existing generated families]
```

**The "every feature has a rank" invariant is a node check, not an edge rule (finding 8).** Revision 1 had a `feature-rank:unranked` edge rule. It only fired on an outgoing feature import, so a new leaf feature passed, and so did imports into it; its `$1` also referred to a group that its `from.path` did not have. It is deleted. `scripts/check-feature-ranks.mjs` (to live at `development/scripts/check-feature-ranks.mjs`) lists the folders under `features/` that hold at least one production source file and compares the set with the table:

- a production folder without a rank → error (covers the unranked leaf, and therefore every import into it);
- a rank for a folder that is gone or holds only tests → error (the table cannot rot);
- a rank that is not a non-negative integer → error.

`check:boundaries` becomes `node development/scripts/check-feature-ranks.mjs . development/boundaries/feature-ranks.json && depcruise --config .dependency-cruiser.mjs apps/website/src`. The check is an error from S0 on (it passes today). A new feature that only imports `platform/` must still be added to the table, at rank 0.

Notes on the exact shape:
- **`dependencyTypesNot` needs both values.** `type-only` covers `import type`. `import("x").T` type nodes are tagged `type-import` by dependency-cruiser and were reported as value imports until `type-import` was added (found on `publish-content/backstop-ports.ts:22`).
- **Why this type filter is right for Tovu and would be wrong for Jini.** The rule reads imports before compilation and treats `import { type A } from` as type-only. Tovu's compiler drops that statement (no `verbatimModuleSyntax`), so the filter agrees with the build: the rule's 11 rows are exactly the 11 statements the emission-based extractor reports. If Tovu ever turns `verbatimModuleSyntax` on, such imports become runtime loads and this rule must switch to `tsPreCompilationDeps: false` like the Jini gate (§5, J4). The S0 commit adds that sentence as a comment beside the rule.
- **The filter is safe here.** The file's own comment on `no-circular` explains why `dependencyTypesNot` cannot be used on a reachability rule. This rule judges one edge at a time, the same use the file already makes of it in `only-composition-constructs-concrete-adapters`.
- **Tests are out of scope of the rule** (they may import any feature), matching the existing rules.

### 3.3 Prototype result (verified again for revision 2)

`scripts/dc-rank-prototype.mjs` is this config with the table in `scripts/feature-ranks.json`. Run from the Tovu root with dependency-cruiser 18.7.2:

```
depcruise --config designs/import-cycles/scripts/dc-rank-prototype.mjs apps/website/src   → exit 11
feature-rank:0  project-keys → api-connections ×1 · publish-trust → deployments ×1
feature-rank:3  custom-credentials → source-control ×2 · custom-credentials → deployments ×1
feature-rank:6  source-control → site-backup ×6
```
11 violations in 7 importing files: exactly the import statements of the five cut edges, and none on the other 122 runtime edges. That run is also the fixture for same-feature imports: the tree has thousands of imports inside one feature and none is reported, so the `$1` exclusion works where `from.path` has its group. With the type filter off (`TYPES=1`) it reports 67 rows on production files: the 11 plus 56 type-only import statements, which sit on the 37 upward type-only edges of lane T.

Node check: `check-feature-ranks.mjs --self-test` passes 5 fixture cases (complete table; unranked leaf with no feature import; stale entry; tests-only folder; non-integer rank). On the real tree: 68 production feature folders, 0 problems, exit 0. With `object-storage` removed from the table (a feature that imports no other feature): `unranked feature: object-storage`, exit 1. The revision-1 edge rule passed that case.

### 3.4 Tried and rejected

- **dependency-cruiser folder-scope cycles** (`scope: "folder"`, `to: { circular: true }`): 807 rows on today's tree (874 with types), across 67 folders, because the folder graph includes tests and the paths through `server/` and `assistant/`. Not usable as a gate.
- **File-level `no-circular` as the gate:** it is the right gate for *file* cycles and already exists at `warn`. It cannot see a feature cycle (0 runtime file cycles today while 24 features are tied).
- **An allow-list of feature pairs:** exact, but every new legitimate downward import would need a config edit. The rank table allows those for free.

## 4. Migration order

Every step is one commit that compiles and passes alone, with its caller, fixture and test updates inside it. One refactor kind per commit. Checks after every step, from the Tovu root:

```
npm run typecheck && npm run typecheck:tests      # typecheck:tests is what finds a fixture that misses a new required field
npm run check:boundaries          # the feature-rank count must equal the "violations" column in §1.5
npm run check:size                # shrink-only size ratchet (see §4.1)
npm test                          # or the affected feature folders plus server/runtime/composition
node designs/import-cycles/scripts/graph.mjs <fresh tovu-edges.json> summary   # SCC size per §1.5
```

| Step | Change | Production files | Tests and fixtures in the same commit | After: SCC / violations |
|---|---|---|---|---|
| **S0** | Add the rank table file, the generated rules at `warn` (§3.2) and the node check at error. No source change. Record 11. | `.dependency-cruiser.mjs`, `development/boundaries/feature-ranks.json`, `development/scripts/check-feature-ranks.mjs`, `package.json` (`check:boundaries`) | the node check's own fixture test (the 5 self-test cases as a `node:test` file) | 24 / 11 |
| **S1** | §2.1 repoint to `@jini-ai/devops/deploy`; delete two re-exports | `publish-trust/connect.ts`, `deployments/deploy-config-registry.ts`, `deployments/index.ts` | none to edit (0 tests import the name; the `* as deployments` test stays green) | 7 / 10 |
| **S2** | §2.2 move scope function + kind constant down; delete one re-export | `platform/secrets/vault-api-connection-meta.ts`, `api-connections/{vault-stores,shared-owner,plugin-state-bindings}.ts`, `project-keys/site-references.ts` | repoint the import line of the 6 test files in §2.2; no assertion changes; no new test | 5 / 9 |
| **S3a** | §2.3(a) repoint both callers to Jini; delete the forwarder | `custom-credentials/write-files-validation.ts`, `source-control/commit-site.ts`, delete `source-control/repository-target.ts` | `source-control/__tests__/repository-target.unit.test.ts` imports the Jini function; assertions kept | 5 / 8 |
| **S3b** | §2.3(b) move `bindSourceControlWritePort`; inject the port | new `source-control/write-port.ts`, `custom-credentials/{credential-ports,tool-registrations}.ts`, `server/routes/types.ts`, `composition/deps.ts`, `composition/app.ts` | 16 fixtures gain `sourceControlWrite`; split the two `extract-s8-c2p1-*` files; new late-read pin for the binder | 3+2 / 7 |
| **S4** | §2.4 `PublishCompatibilityPort`; the six lines move to `deployments` | new port file, new `deployments/publish-credentials/compatibility-port.ts`, `custom-credentials/tool-registrations.ts`, `server/routes/types.ts`, `composition/deps.ts`, `composition/app.ts` | the 16 fixtures gain `publishCompatibility`; `extract-s8-x-host-operations.test.ts:300-321` and the test after it keep all assertions with the fixture of §2.4 | 2 / 6 |
| **S5a** | §2.5 characterization test only | none | new test file in `source-control/__tests__/` (6 assertions) | 2 / 6 |
| **S5b** | §2.5 `StaticSitePackagerPort` through `CommitSiteInput` | new port file, new `site-backup/static-site-packager.ts`, `source-control/{commit-site,tool-registrations}.ts`, `server/routes/types.ts`, `composition/deps.ts`, `composition/app.ts` | 22 `CommitSiteInput` sites in `commit-site.unit.test.ts`, 4 `SourceControlToolDeps` fixtures (§2.5); new unit test of the packager's collision result | none / 0 |
| **S6** | Change `feature-rank:*` to `severity: "error"` | `.dependency-cruiser.mjs` | none | none / 0 |

Nine commits. Prerequisites: S0 none. S1, S2, S3a: S0 (for the count check) and nothing else; they are independent of each other. S3b needs S3a (same import block in `write-files-validation.ts` / `credential-ports.ts`). S4 needs S3b (both add a required field to the same 16 fixtures; doing them in this order avoids two merges of the same literals). S5b needs S5a. S6 needs all.

### 4.1 Size limits: what each step does to them (finding 7), and the prerequisite that follows

Measured with `scripts/fn-sizes.mjs` (code lines = not blank, not comment-only, which is what the repo's ESLint size rules count; complexity = ESLint classic). The repo gate: file over 500 code lines = error; function over 50 = warning, over 80 = error; `npm run check:size` is a shrink-only ratchet against `development/scripts/size-debt.json`.

| File a step edits | Code lines (raw) | Functions over the limit that the step edits inside | Effect of the step |
|---|---|---|---|
| `source-control/commit-site.ts` (S3a, S5b) | 423 (541) | none: 0 of 14 functions over 50, 0 over complexity 10. `exportForCommit` is `:369-411`, `commitSiteToSourceControl` is `:466-503`, `commitOutcome` is `:511-541`. | `exportForCommit` loses 4 lines; 5 import lines go. Compliant before and after. |
| `source-control/tool-registrations.ts` (S5b) | 394 (511) | `buildSourceControlRegistrations` `:382-501` = 120 lines; its inner handler `source_control_execute_commit` `:419-489` = 71, complexity 9 | ±0 lines in both (one expression at `:459` changes); `commitInput` at most +1 line (it is 5 lines); the deps interface +1. **Both functions stay over the limit.** |
| `custom-credentials/tool-registrations.ts` (S3b, S4) | 450 (497) | `bindTovuCredentialToolOperations` `:389-483` = 95 lines | S3b does not touch it. S4 removes 5 lines from it (→ about 90) and 2 import lines from the file. **Still over 80.** |
| `composition/deps.ts` (S3b, S4, S5b) | 2,567 (3,168) | `composeSiteRouteDeps` `:1081-3066` = 1,724 lines | **grows**: +5 (S3b), +1 (S4), +1 (S5b) |
| `composition/app.ts` (S3b, S4, S5b) | 1,757 (2,690) | `createRouteDeps` `:469-1732` = 928 lines, complexity 12 | **grows** by the same 7 lines |
| `server/routes/types.ts` (S3b, S4, S5b) | **518** (1,741): already over the 500 file limit | no functions (one interface) | **grows**: +1 code line per step (→ 521). No size design covers this file. |
| `external-mcp/tool-registrations.ts` (B1) | 633 (776) | `buildExternalMcpRegistrations` `:664-767` = 104; `externalMcpSaveHandler` `:575-627` = 53 | −1 import line; ±0 in the functions |
| all new files | under 40 each | none; every new function is under 20 lines, complexity ≤ 3 | compliant |

Revision 1 said "no function grows". That was wrong for the two composition roots: a new `RouteDeps` property is a new line inside `composeSiteRouteDeps` and `createRouteDeps`, and one more line in the `RouteDeps` interface file, which is already 18 code lines over the file limit. The ratchet is shrink-only (`size-exceptions.json` says both are "NOT exempt on purpose"). So:

- **S0, S1, S2, S3a touch no over-limit function and can run now.** They take the cycle from 24 features to 5.
- **S3b, S4, S5b have a prerequisite: size designs 01 (`deps.ts`) and 02 (`app.ts`)** on `plan/size-designs-2026-11-16`. After those splits each new property goes into the feature slice that builds the credentials / source-control part of `RouteDeps`, where it fits the limits. The alternative is an owner-approved, one-time raise of the two baselines in `size-debt.json` by 7 lines each (owner decision 9). `server/routes/types.ts` (+3 lines) is not split by 01/02, so it needs that decision in either case; moving three existing members out to make room would be a second refactor kind in the same commit. The executor does not decide this.
- **The three feature-level functions that stay over 80** (`buildSourceControlRegistrations`, `bindTovuCredentialToolOperations`, `buildExternalMcpRegistrations`) are existing debt. No step lengthens them, and none of the ten size designs covers them. This design does not claim they become compliant. They need their own size lane (each is one registration list or one operations object; the split is per tool or per operation group) or an owner exception (owner decision 9). Splitting them inside a cycle step would mix two refactor kinds in one commit.

**When the rule becomes a CI error:** at S6, right after S5b, in its own commit. `check:boundaries` runs with the `err` reporter and exits with the number of error rows, so an `error` rule with open violations fails the gate. See §8 item 1: the gate already exits 16 on this commit for unrelated rows.

### 4.2 Lanes after the feature cycle

| Lane | Change | Notes |
|---|---|---|
| **B1** | `external-mcp/tool-registrations.ts:31` stops importing `notifyExternalMcpRosterChanged` from `assistant/mcp-services.ts` (5 call statements: `:386, :387, :565, :566, :753`). **Reuse, not a new port:** the host already has `RouteDeps.notifyRosterChanged: NotifyToolAccessChanged` (`server/routes/types.ts:396`, type in `contracts/core/tool-access-change.ts:4`), bound to that same function in `deps.ts:2388` and `app.ts:1335`, and `features/plugin-runtime/tool-registrations.ts:25` already takes it. `ExternalMcpToolDeps` (`features/external-mcp/deps.ts:58`) gains `readonly notifyRosterChanged: NotifyToolAccessChanged`; the five statements call `deps.notifyRosterChanged(…)` with the same arguments. | No composition edit. Keep `void` vs `await` at each call site exactly as today. Fixtures that build `ExternalMcpToolDeps` gain the field: pass the real `notifyExternalMcpRosterChanged` where the test observes listeners registered on it, otherwise a recording fake. 24 test files mention the notifier; `npm run typecheck:tests` lists the fixtures. **Practice 2 conflict:** `NotifyToolAccessChanged` is `(input?: { lowered? }) => Promise<void>`, one optional object, not `(required, optional = {})`. B1 reuses the existing contract unchanged; changing it is a repo-wide signature change (owner decision 10). |
| **B2** | Move `server/runtime/boot/startup-secrets.ts` (43 lines, 0 internal imports) to `platform/secrets/startup-secrets.ts` with `git mv`. **One module instance:** the file holds module-level state (`let credentials`, `let startup`, `:8-9`); no copy and no forwarding file may stay behind, or initialisation and reads would use two states. | Full consumer list below. Removes `platform → server`. After B1 + B2 no feature is in a runtime cycle at any granularity. |
| **B3** | `assistant → server`: `asyncRoute` (`server/inbound/shared/async-route.ts`) and `resolveProtocol` (`server/inbound/public-http/routes/oauth/public-origin.ts`) are leaves → move to `platform/http`. `warmSiteServerForAgent` (`assistant/tool-registrations.ts:73`) becomes a port the host binds. | Leaves `assistant` and `server` acyclic at unit level. Consumer inventory with `importers.mjs` is the first task of the lane (not done here). `server/inbound ↔ server/runtime` belongs to size designs 01/02. |
| **T** | 37 upward type-only feature edges (56 import statements; `EDGES.tsv` step `T`). Fix kind: the consumer declares its own port type, or the shared record type moves to `#src/contracts`. | Optional for "zero runtime cycles". Ratchet: run the rule with the type filter off and keep the count from rising (67 rows today; at most 56 after S1–S5). Decide in §9. |

**B2 consumers (finding 6; all repointed in the one commit).** The file has four exports: `initializeStartupSecrets`, `startupSecretEnvironment`, `STARTUP_SECRET_KEYS`, `DESKTOP_AGENT_SERVICE_ENV`.

| Kind | Files |
|---|---|
| Website production (11) | `assistant/daemon-access.ts:3`, `assistant/desktop-mcp-runtime.ts:3`, `cli/commands/serve.ts:30`, `index.ts:33`, `platform/headless-browser/desktop-render.ts:6`, `server/inbound/admin-http/routes/system/deployment-overview.ts:1`, `server/inbound/assistant/agent-daemon-server.ts:15`, `server/runtime/boot/boot-readiness-gate.ts:10`, `server/runtime/composition/app.ts:3`, `server/runtime/composition/deps.ts:4`, `server/runtime/lifecycle/daemon-supervisor.ts:22` |
| Desktop app (2) | `apps/desktop/src/main/index.ts:115`, `apps/desktop/src/tovu-server.ts:31` (relative paths into `website/src`) |
| Dev harness (1) | `development/evals/tool-search-caller2-compliance-harness.ts:92` |
| Tests that import it (3) | `server/runtime/boot/__tests__/startup-secrets.unit.test.ts:3` (moves with the file to `platform/secrets/__tests__/`; its `moduleUrl('../startup-secrets.ts')` at `:78` then still resolves), `server/runtime/lifecycle/__tests__/daemon-startup-secrets.unit.test.ts:10`, `cli/__tests__/unit/serve-import-cleanup.unit.test.ts:13` (dynamic import) |
| Tests that name the path in a module mock (2) | `cli/__tests__/unit/serve-import-cleanup.unit.test.ts:14` (`t.mock.module(new URL("…/startup-secrets.ts"))`), `cli/__tests__/unit/serve-command-wiring.unit.test.ts:238`. A stale path here does not fail to compile; the mock just stops applying. The executor checks both tests fail when the path is wrong (revert the path, see red) before trusting green. |

The two import lines in `deps.ts` / `app.ts` change text but not count, so B2 does not move the size ratchet. Desktop packaging: `apps/desktop` stages website sources; the executor runs the desktop build's staging step and its typecheck after the move (not run here).

## 5. Jini module cycles

**Scope and compiler settings (finding 5).** Production files = the files each package's `tsc` build project compiles under `packages/<name>/src/`, tests removed: 40 build projects, plus `provider-plugins/tsconfig.json` (its `src` is bundled by a script with the same settings; measured as an extra project): **3,632 files** (revision 1 walked all of `packages/` and counted 3,735, including files such as `packages/admin/vitest.config.ts`). Every project inherits `verbatimModuleSyntax: true` and `isolatedModules: true` from `tsconfig.base.json:16-17`, so classification uses per-file emission (§1.1).

| Fact | Revision 2 | Revision 1 |
|---|---|---|
| Internal import edges | 10,784: 6,718 runtime (36 dynamic, **12 empty, 11 unused**), 4,066 type | syntactic rule; the 23 kept statements were counted as type / erased |
| Statements the compiler keeps that the syntactic rule dropped | **23** (the judge found 24 on the wider revision-1 file set). Listed in `EDGES.tsv`, scope `jini-kept-import`. Example: `packages/admin/src/react/shell/use-admin-theme.ts:3` `import { type AdminTheme, type ColorSchemePreference } from '../kit.js'` is emitted as `import {} from '../kit.js'`. | 0 |
| Runtime file cycles | **3** (6, 4, 2 files): unchanged. None of the 23 kept statements is in a cycle or creates one. | 3 |
| Runtime package edges / package cycles | 82 / 0 (88 edges with types; 0 package edges exist only through an empty or unused import) | 83 / 0 |

Not measured: `plugin-catalog` and `plugin-fixture-provider` (no `tsc` build), `provider-plugins/src/charts-*` (excluded from its tsconfig), and 8 unresolved specifiers (5 imports of the hand-written `agent-plugins/core/persistent-state.js`, which imports only Node built-ins; 3 JSON files).

The 11-11 survey said 2 cycles; the admin one is small and may be newer or may have been missed if `.tsx` was not scanned.

### J1 — `agent-runtime`: `json-event-stream.ts` ↔ 5 `defs/*/event-stream.ts` (6 files)

- **Why:** `json-event-stream.ts` (251 lines) holds two things: shared types and pure helpers (`:11-188`: `isRecord`, `nonEmptyString`, `trimmedNonBlank`, `optionalString`, `optionalNumber`, `pickUsage`, `dispatchFrame`, `safeParseJson`, `stringifyContent`, `extractErrorMessage`, `initializingStatus`, `todoWriteInputFrom*`), and the dispatcher (`:190-251`) that imports each agent's handler into module-scope maps. The codex, cursor-agent, gemini, kimi and opencode handlers import the helpers back (`defs/*/event-stream.ts:1-3`).
- **No load-order defect today (finding 9).** Revision 1 said a handler could be read before it is initialised. That is not supported: every handler the dispatcher imports is an `export function` declaration (for example `defs/opencode/event-stream.ts:7,117`, `defs/codex/event-stream.ts:375`), and function declarations are initialised when the modules are linked, before any module body runs. The cycle is removed because it is a cycle (it blocks the J4 gate and hides the helper layer), not because of a demonstrated evaluation bug.
- **Fix:** new **internal** leaf `packages/agent-runtime/src/json-event-stream-shared.ts` with lines `:11-188` moved verbatim. The five defs import the leaf. `json-event-stream.ts` keeps the dispatcher and imports what it needs from the leaf. **The package's public surface does not change:** `src/index.ts:61` exports only `createJsonEventStreamHandler` from `./json-event-stream.js` and keeps doing so; the helpers were never public and stay internal (revision 1 wrongly said `index.ts:58` exports them; that line is a comment). The four test files that import `createJsonEventStreamHandler` (`__tests__/json-event-stream.test.ts`, `antigravity-audit.unit.test.ts`, `stream-parser-bounds.unit.test.ts`, `ai-trace/__tests__/regressions.test.ts`) need no change.
- **A `verbatimModuleSyntax` trap in this move:** `ParserState` (`:15-21`) names five state types that live in the defs files. The leaf must import them with statement-level `import type { … } from './defs/…'`, which the compiler drops. Written as `import { type CodexStreamState } from …` it would be emitted as `import {} from …` and the runtime cycle would be back. The J4 gate catches that.
- **Path-keyed debt:** `vitest.config.ts:53` documents a coverage exception for `stringifyContent`'s catch by file name. It must be re-pointed to the new file in the same commit (lesson 10).
- **Not verified:** that every helper in `:11-188` is free of references to `:190-251`. The executor checks with the compiler (move, then `tsc`).

### J2 — `daemon`: `agent-executor/mcp-bridge.ts` ↔ `claude/config-dir.ts`, `claude/mcp-delivery.ts`, `opencode/mcp-config.ts` (4 files)

- **Why:** the three agent files import small shared pieces from `mcp-bridge.ts`. `mcp-bridge.ts` imports the agent files to build delivery maps (`:10`) and re-exports four of their functions (`:13-14`).
- **Commit 1 (finding 4: every consumer of the five moved names, not only the cycle members).** New leaf `agent-executor/mcp-json-file.ts` with `JINI_MCP_SERVER_KEY`, `mergeMcpJsonContent`, `defaultReadMcpJsonFile`, `defaultWriteMcpJsonFile`, `defaultRemoveMcpJsonFile` and the types they need. `mcp-bridge.ts` imports what it still uses from the leaf and exports none of the five. Repointed in the same commit (paths under `packages/daemon/src/agent-executor/`):

| File | Names |
|---|---|
| `claude/config-dir.ts:6` | read, write |
| `claude/mcp-config.ts:5` | read, merge |
| `claude/mcp-delivery.ts:4` | read, write, merge |
| `codex/home-config.ts:2`, `codex/isolation.ts:2`, `opencode/mcp-config.ts:3` | server key |
| `codex/home-staging.ts:20` | read, write |
| `launch.ts:99` | remove (its other five names stay on `mcp-bridge.js`) |
| `index.ts:152` (the package's public entry) | `mergeMcpJsonContent`: the public name stays, its source becomes the leaf |
| `__tests__/mcp-bridge-staging.test.ts:11` | remove (its other names stay) |

- **Commit 2:** delete the two `export … from` lines (`mcp-bridge.ts:13-14`) and repoint the consumers of the four forwarded names to their owners (`claude/config-dir.ts`: `prepareClaudeConfigDirIfNeeded`, `resolveSourceClaudeConfigDir`; `opencode/mcp-config.ts`: `mergeEnvContentMcpConfig`, `mergeEnvContentInstructions`): `launch.ts:99`, `index.ts:152`, `__tests__/mcp-bridge-staging.test.ts:11`, `opencode/__tests__/mcp-config.test.ts:3`. The other 6 test files that import `mcp-bridge.js` use names it defines itself and do not change.
- **Prerequisites (lesson 10):** untangle lane R8-daemon-runtime edits import lines in `mcp-bridge.ts` and `claude/config-dir.ts`; size design 10 splits `launch.ts`. J2 runs after both, or the same executor does them in that order.
- **Not verified:** what `mergeMcpJsonContent` references inside `mcp-bridge.ts` beyond `JINI_MCP_SERVER_KEY` and its parameter types.

### J3 — `admin`: `comments/react/components/QueueSection.tsx` ↔ `hooks/QueueSection.hooks.ts` (2 files)

- **Why:** `QueueSection.tsx:10` imports four hooks. `QueueSection.hooks.ts:8` imports the component `QueueActionsCell` back, to `createElement` it in the table's actions column (`:60`). `QueueActionsCell` itself calls `useQueueActionsCell` from the hooks file.
- **Fix:** move the cell and its own hook out together: `components/QueueActionsCell.tsx` + `hooks/QueueActionsCell.hooks.ts`. `QueueSection.hooks.ts` imports the cell file; the cell file imports its hook file; nothing imports back. Type imports between the new files use statement-level `import type`.
- **Prerequisite:** untangle lane R1-admin-react lists both files; run J3 after R1 is closed for them.
- **Test:** `comments/react/__tests__/use-comment-queue.unit.test.tsx` names the cell; add a render test that the actions column still shows the same menu items for one fixture row before the move.

### J4 — gate (run and confirmed in revision 2)

`scripts/jini-dc-prototype.mjs` is the rule: dependency-cruiser `no-circular` (`from: { pathNot: tests }, to: { circular: true }`) with **`tsPreCompilationDeps: false` and `tsConfig: { fileName: "tsconfig.base.json" }`**, over every `packages/*/src`. Result with dependency-cruiser 18.7.2: 9 error rows, 3,885 modules, 18 s. The 9 rows are exactly the three cycles (5 agent-runtime, 3 daemon, 1 admin).

It treats kept imports the way the package builds do; tested on two real statements:

| Config | `use-admin-theme.ts → kit.tsx` (emitted as `import {}`) | `QueueSection.tsx → use-comment-queue.hooks.ts` (unused value import) |
|---|---|---|
| `tsPreCompilationDeps: false` + `tsConfig` (the J4 config) | reported as a runtime import ✔ | reported ✔ |
| `tsPreCompilationDeps: false`, no `tsConfig` | **dropped** ✘ (compiled without `verbatimModuleSyntax`) | – |
| `tsPreCompilationDeps: true` | tagged `type-only` ✘ (a type filter would hide it) | reported |

So the gate must pass the tsconfig and must not use a type filter. Add it to `pnpm guard` at `severity: "error"` after J1–J3. Jini pins dependency-cruiser 18.1.0; the executor confirms the same 9 rows on that version first.

## 6. Owner engineering practices — check

| # | Practice | Status in this design |
|---|---|---|
| 1 | DI via typed ports from the host | S3b, S4, S5, B1, B3: a concrete cross-feature call becomes a port on `RouteDeps`, bound in the composition roots. S1/S3a import Jini pure functions directly; S2 imports a pure host constant/function from `platform`. Untouched: `assistant/external-mcp-roster-change.ts` keeps module-level listener state (B1 only stops the feature from importing it). |
| 2 | Args `(required, optional = {})` | Every new function and port method uses it: `bindPublishCompatibility`, `prepareInvalidation`, `packageSite`, `createStaticSitePackager`, `checkFeatureRanks`. **Conflicts, flagged:** (a) B1 reuses `NotifyToolAccessChanged`, which takes one optional object (owner decision 10). (b) Kept as is: `validateRepositoryTarget(target, validateTarget?)` in `write-files-validation.ts` is positional today; it belongs to that file's DEDUPE row. (c) The existing `SourceControlWritePort` methods and `StaticSiteContextFn` are existing contracts and are not changed. |
| 3 | Functions ≤ 50 (80 = CI error), files ≤ 500, complexity ≤ 10 | Measured, §4.1. New files and functions comply. `commit-site.ts` complies before and after. **Not compliant after this design, and not made worse by it:** `buildSourceControlRegistrations` (120), `bindTovuCredentialToolOperations` (95 → about 90), `buildExternalMcpRegistrations` (104). **Made worse unless the prerequisite holds:** `composeSiteRouteDeps` and `createRouteDeps` (+7 lines each) → S3b/S4/S5b wait for size designs 01/02 or an owner decision. **Made worse in any case:** `server/routes/types.ts` (518 → 521 code lines, limit 500) → owner decision 9. `createRouteDeps` complexity 12 is existing and unchanged. |
| 4 | Feature slicing, split by responsibility | Each moved piece goes to the feature that owns the behaviour (write-port → source-control, packager → site-backup, compatibility binding → deployments, startup secrets → platform/secrets). No folder is split. |
| 5 | No barrels / re-export shells / forwarders | S1 deletes 2 re-exports, S2 deletes 1, S3a deletes a forwarder file, J2 deletes 2 `export … from` lines. No step adds one; B2 leaves no forwarding file. **Conflict:** the repo's `no-deep-imports:*` rules (ADR-009) require imports through `index.ts`. See §9. `assistant/mcp-services.ts` is itself a 5-line re-export file; B1 removes one of its consumers and does not touch it. |
| 6 | Why-comments move with code | Named per step: S2 doc comment, S3a file comment → `commit-site.ts`, S3b the binder's doc block, S4 (the six lines carry no comment today; the new binding gets the doc line in §2.4), S5 the packaging lines as they are, J1/J2 verbatim moves, B2 `git mv`. |
| 7 | Generic → Jini; a Jini package imports only itself + core + protocol | Nothing generic is added to Tovu. S1 and S3a use existing Jini exports. J1–J3 stay inside one package each and add no package edge. Flagged for later: `publish-trust/connect.ts` cannot keep a `devops` import if it moves into `cms`. |
| 8 | Tests use fakes of interfaces; no `vi.mock` of another package's internals | Fixtures get real binders over their own fakes, or fakes of the port interface (§2.3–§2.5). No module mock is added. **Existing and kept:** two CLI tests mock `startup-secrets.ts` by path with `node:test` module mocks (B2 repoints them; replacing them is not part of a move). |
| 9 | Errors never swallowed or generic | New port results are typed (`destination-collision`). The S4 binding adds no `catch`. **Existing, kept on purpose:** `commit-site.ts:404-409` maps any other packaging error to a generic message. Changing it is a behaviour change (practice 10), so it is flagged, not fixed. |
| 10 | No new eslint-disable / @ts-ignore; no silent behaviour change | None needed. Behaviour pins: §2.3 (late reads, closure identity), §2.4, §2.5. The one known difference (spread-override of a composed `RouteDeps`) is stated in §2.3. |
| 11 | Smallest change, reuse first, no abstraction with one user | S1/S2/S3a are repoints and moves. B1 reuses an existing host port instead of adding one. S4 moves six existing lines instead of writing a new binding. S4 and S5 add a port with one implementation: justified by practice 1 and by CLASSIFY, which names both as host contracts of the Jini move. |
| 12 | Memory / IO cost on hot paths | No new I/O. S4 keeps one registry load per credential write. S5 packaging runs once per commit or dry run, as today. The rank rules add 9 regex rules to a 24 s depcruise run; the node check reads one directory tree (under 1 s). J4 adds an 18 s run to `pnpm guard`. |

## 7. Estimate

| Work | Lanes | Size (revision 1 in brackets) |
|---|---|---|
| S0, S1, S2, S3a (can run now) | 4 commits | S0 1 h (30 min: now includes the node check and its test), S1 30 min, S2 1.5 h (1 h: 6 test repoints), S3a 1 h. About half a day. |
| S3b, S4, S5a, S5b, S6 (after size designs 01/02) | 5 commits | S3b 4 h (2–3 h: 16 fixtures, late-read pin), S4 3 h (2–3 h), S5a+b 5–6 h (4–5 h: 22 input sites, 6 assertions), S6 15 min. About 1.5 working days, with an Opus review of S3b, S4, S5b. |
| B1–B3 | 3 lanes | B1 2 h (3 h: reuses an existing port), B2 2 h (1 h: 18 files, two of them path mocks), B3 3 h. |
| J1–J4 | 4 lanes in Jini | J1 2 h, J2 2.5 h after R8 and size design 10 (2 h), J3 1 h, J4 1 h. |
| T | optional | 37 edges; about 2 days if done fully. |

Rough tokens: S+B+J about 2.0M Sonnet and 0.3M Opus (revision 1: 1.5M and 0.2M). Estimates, not measurements.

## 8. Not verified, and risks

1. **The boundaries gate is already red on this commit.** `depcruise --config .dependency-cruiser.mjs apps/website/src` exits **16**: 16 `no-deep-imports:*` rows at `error`. Run with dependency-cruiser 18.7.2 from a scratch install, without `npm ci`. If CI shows the same, S6 cannot turn the gate green by itself.
2. **I did not run `npm ci`, `tsc --noEmit`, `npm run check:size` or the test suites.** The emission runs used TypeScript 5.9.3 from a scratch install with no `node_modules` in the repos (external packages unresolved; all internal specifiers resolved). Fixture lists come from the import graph with tests included; `npm run typecheck:tests` is the command that proves a fixture list complete, and it was not run.
3. **The size ratchet's exact behaviour** (does `check:size` fail on +1 line in a function that is already in `size-debt.json`?) was read from the script's description, not run. §4.1 assumes yes.
4. **Composed-root tests that override `loadSourceControlProviders` / `customCredentialsHttpClient` by spreading a `RouteDeps`** were not enumerated (§2.3).
5. **Desktop build after B2** (staging step and typecheck) was not run.
6. **B1 and B3 fixture lists** are not enumerated; B3's consumer inventory is the lane's first task.
7. **Size designs 01/02 change where the composition properties go.** §2.3–§2.5 give today's line numbers; after 01/02 the executor finds the slice that builds the credentials and source-control fields.
8. **LESSONS file:** the brief says 21 rules; `size-designs/LESSONS-FOR-DESIGN-BRIEFS.md` on `plan/size-designs-2026-11-16` (@ `b62acb7e`) has 11, and no other plan branch has the file. I applied the 11 and the two recurring classes from `CODEX-JUDGE.md` (INDEX.md maps each).
9. **Rank table drift:** between this commit and execution, new edges may appear. S0 regenerates `feature-ranks.json` (`graph.mjs ranks <the five cuts>`) and confirms the violation list is still exactly the five edges.
10. **dependency-cruiser version:** Jini pins 18.1.0; J4 was run on 18.7.2.

## 9. Owner decisions

1. **Barrels vs deep imports.** Owner practice 5 says no barrels; `.dependency-cruiser.mjs` `no-deep-imports:*` (ADR-009) says cross-module imports must go through `index.ts`, and 16 rows of it are `error` today. Which one wins? This design assumes practice 5 and makes the rank rule independent of the answer.
2. **Fix the red gate before S6, or scope S6?** Options: (a) settle the 16 rows first; (b) run the `feature-rank` rules as their own blocking CI step.
3. **Type-only upward edges (lane T).** Is "zero runtime cycles" the finish line, with the 37 type-only edges as a ratchet, or should they go to zero too?
4. **`source-control ↔ site-backup` direction.** The design keeps `site-backup → source-control` and inverts the other way with a packager port. The equal-count alternative is to move the static packaging files out of `site-backup` into `site-export`.
5. **Rank table as the long-term rule?** It is a ratchet derived from today's edges. Accept it as transitional, or ask for a named-layer model first.
6. **Second cycle (B lanes) in scope of hard item #6?**
7. **Jini third cycle (J3).** Confirm it counts under hard item #6 (the survey listed 2).
8. **Order against other lanes:** J2 after untangle R8 and size design 10; J3 after untangle R1.
9. **(new) Size limits.** (a) S3b/S4/S5b add 7 lines to each composition root. Wait for size designs 01/02 (recommended; S0–S3a still take the cycle to 5 features now), or approve a one-time raise of the two `size-debt.json` baselines? (c) The same three steps add 3 lines to `server/routes/types.ts`, which is at 518 code lines against a limit of 500 and has no size design: approve +3, or order a split of that file first? (b) Three feature functions stay over 80 lines and no design covers them (`buildSourceControlRegistrations` 120, `bindTovuCredentialToolOperations` 95, `buildExternalMcpRegistrations` 104): open a size lane for them, or record exceptions?
10. **(new) `NotifyToolAccessChanged` signature.** It takes one optional object. B1 reuses it as is. Convert it to `(required, optional = {})` repo-wide (4 features and the host use it), or keep it?

## Judge response

`CODEX-JUDGE.md` (Codex gpt-6.1-sol, high): 1 blocker, 6 majors, 3 minors. Each was checked against the code before it was accepted. **10 findings: 9 accepted in full, 1 accepted in part (finding 7; two of its sub-claims do not hold). 0 rejected. Blockers left: 0.**

| # | Finding | Verdict | What the code shows | Change |
|---|---|---|---|---|
| 1 | Blocker: S5's packager on `CommitSiteDeps` cannot reach the preview | **Accepted** | `exportForCommit({ input, providerId })` (`source-control/commit-site.ts:369`) takes no deps; `previewCommitExport(input, …)` (`:429`) has none; the dry run calls it at `tool-registrations.ts:435`. `commitInput` (`:301`) builds the input for both paths. | §2.5: the packager travels `RouteDeps → SourceControlToolDeps → commitInput → CommitSiteInput.packager`; `CommitSiteDeps` unchanged; every hop, fixture and two new characterization assertions (same files in preview and commit; preview resolves no credential and writes nothing) listed. |
| 2 | Major: S2 omits tests that import the removed exports | **Accepted, and the list was longer** | 6 test files import the names from `vault-stores.js`, not 4: also `site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts:2` and `server/runtime/composition/__tests__/api-connection-state-vault.identity.test.ts:10`. `plugin-state-format.pin.unit.test.ts:12-14` already asserts the exact object. | §2.2 table of 9 importers; the proposed duplicate unit test is dropped. |
| 3 | Major: S3b/S4 lack dependency-fixture migrations; wrong interface name | **Accepted** | The interface is `CustomCredentialsToolDeps` (`custom-credentials/tool-registrations.ts:62`). 16 test files construct it. `extract-s8-x-host-operations.test.ts:300-321` supplies the registry/cache fields and asserts identity, order and load count. | §2.3: name fixed, 16 fixtures listed with the rule for the value, host late reads traced. §2.4: redesigned as a verbatim move so those assertions stay unchanged. |
| 4 | Major: J2's first commit omits consumers outside its SCC | **Accepted** | 9 production files and 1 test import the five names from `mcp-bridge.js`, including `index.ts:152` (public re-export of `mergeMcpJsonContent`) and `launch.ts:99`. | §5 J2: both commits list every consumer. |
| 5 | Major: the Jini classifier does not model compiler settings; scope claim inaccurate | **Accepted** | `tsconfig.base.json:16` sets `verbatimModuleSyntax`; real emission keeps 23 statements the old rule dropped (24 on the old, wider file set); the old walk included `vitest.config.ts` and `tests/` files. | §1.1: classification from real emission per project, production roots from build tsconfigs; `EDGES.tsv` regenerated (+23 rows); §5 numbers; J4 run with a config proven to treat empty and unused imports like the build. The 3 cycles and 0 package cycles are unchanged. |
| 6 | Major: B2 misses startup-secret users incl. desktop boot | **Accepted, and one more found** | 11 website production files, 2 desktop files, 3 importing tests, 2 path mocks, and `development/evals/tool-search-caller2-compliance-harness.ts:92` (not in the judge's list). Module state at `startup-secrets.ts:8-9`. | §4.2 B2 table; `git mv`, no forwarding file, mock-path check. |
| 7 | Major: practice check does not establish a compliant target | **Accepted in part** | Accepted: B1's signature was not `(required, optional)`; "no function grows" was false for the two composition roots (and `server/routes/types.ts` grows past a file limit it already exceeds); function sizes were not measured. **Not supported:** (a) `commitSiteToSourceControl` does not span `:466-541`; it is `:466-503` and `commitOutcome` is `:511-541`; the file has 0 functions over 50 code lines. (b) `source-control/tool-registrations.ts` is 511 raw lines but 394 code lines, which is what the repo's `max-lines` rule counts (`skipBlankLines`, `skipComments`), so the file is inside the gate; two functions in it are not. | §4.1 measured table; S3b/S4/S5b get an explicit prerequisite (size designs 01/02); the three over-limit feature functions are stated as not fixed (owner decision 9); B1 reuses an existing port and its signature conflict is flagged (owner decision 10). |
| 8 | Minor: the unranked-feature rule does not enforce its invariant | **Accepted** | The edge rule cannot see a leaf, and its `$1` had no group. | §3.2: edge rule deleted; `check-feature-ranks.mjs` node check with 5 fixture cases, run on the real tree; one JSON table for both. |
| 9 | Minor: J1 invents a public helper surface and a load-order hazard | **Accepted** | `packages/agent-runtime/src/index.ts:61` exports only `createJsonEventStreamHandler`; all dispatched handlers are function declarations. | §5 J1: leaf is internal, public surface unchanged, hazard paragraph replaced; `import type` trap added. |
| 10 | Minor: chosen-cut file count wrong; commit count wrong | **Accepted** | 11 statements in 7 importing files (derived from the dump). The S series is 9 commits. | §0, §3.3, §4, §7, INDEX.md. |

**Recurring classes, applied beyond the findings.** (1) *Runtime classification depends on compiler settings:* the extractor no longer has a syntactic runtime rule at all; the Tovu rank rule states the condition under which its type filter stays valid (§3.2); J1 and J3 name the `import type` form they must use; the Jini package graph reads the same emission data. (2) *Layer-registration invariants need node checks:* the rank table is checked against the folder list in both directions (§3.2).
