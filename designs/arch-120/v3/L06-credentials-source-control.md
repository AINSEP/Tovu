# L06 — credentials ↔ source-control (3 edges, I + H)

Also clears `check:boundaries` error `feature-rank:3 custom-credentials/credential-ports.ts →
source-control/provider-registry.ts` and the 10-file runtime cycle in the tip's
`no-circular` warning (`agent-plugins/bundled-contribution-sources → … → credential-ports →
provider-registry → agent-plugins`).

- **I** `custom-credentials/credential-ports.ts:14` (`buildSourceControlProviderForApi`,
  `LoadSourceControlProviders`): the credential-ports deps take a **required**
  `buildSourceControlProvider` function and a local `LoadSourceControlProviders` function type;
  composition (`server/runtime/composition/credentials-host-ports.ts`, which already picks
  `loadSourceControlProviders`) passes source-control's function.
- **I** `source-control/tool-registrations.ts:2` (`describeCredentialByLabel`,
  `resolveCustomCredentialByLabel`, `CustomCredentialSetRepoPort`): the source-control tool deps
  take a required `customCredentials: { describeByLabel, resolveByLabel }` built in composition
  over the custom-credentials store; the repo type becomes the local subset used.
- **H** `source-control/write-port.ts:11` → `validateRepositoryTarget`: `custom-credentials/write-files-validation.ts`
  already imports `../source-control/provider-module.js`; the repository-target validator is
  source-control's job. Move `validateRepositoryTarget` (and only what it alone uses) into
  `features/source-control/repository-target-validation.ts`; custom-credentials' remaining users
  import it — **STOP** if that creates `custom-credentials → source-control` value imports: then
  instead inject it into custom-credentials' write-files deps (I). Decide by rg at run time; record which.

**Characterization (named risks):** *validation order changes / wrong provider identity / eager
binding* → keep `features/source-control/__tests__/write-port.unit.test.ts` (validation ordering,
provider identity, lazy binding — judge 2 evidence), `features/custom-credentials/__tests__/extract-s8-c1-*.test.ts`,
`extract-s8-g-cred.integration.test.ts`. Add: tool deps built by the composition root resolve a
label to the same credential as before (one case per root).

**Gates:** shared gate, `LANE=L06`; additionally G3 must show the `feature-rank:3` error gone.

Base: Tovu `2d82735a` (integ/merge-3 tip). Edge list for G2: `designs/arch-120/v3/edges/L06.txt`. Every source line/kind/symbol origin: `facts/edges.v3.tsv` rows with lane `L06`.

---

### Inventory (TypeScript-AST reverse-import index of tip `2d82735a`, all of `apps/website/src`, prod + tests)

#### Edges
- `custom-credentials/credential-ports.ts` -> `source-control/provider-registry.ts` [I] buildSourceControlProviderForApi -> CredentialPortsDeps.buildSourceControlProvider (composition)
- `source-control/tool-registrations.ts` -> `custom-credentials/index.ts` [I] describe/resolveCustomCredentialByLabel -> SourceControlToolDeps.customCredentials port (composition)
- `source-control/write-port.ts` -> `custom-credentials/write-files-validation.ts` [H] validateRepositoryTarget moves into source-control (it already imports source-control/provider-module)

#### Exact importers of each changed source file (callers that construct/pass its deps, and tests)
- `features/custom-credentials/credential-ports.ts`
    - prod: features/custom-credentials/index.ts, features/custom-credentials/tool-registrations.ts
    - tests: features/custom-credentials/__tests__/extract-s8-c2p1-credential-ports.test.ts, features/custom-credentials/__tests__/extract-s8-c2p1-ports.type-pin.ts
- `features/source-control/tool-registrations.ts`
    - prod: assistant/tool-registrations.ts, server/runtime/composition/tool-catalog-manifest.ts
    - tests: assistant/__tests__/moved-tools.credential-cards.golden.test.ts, assistant/__tests__/tool-approval-policy.test.ts, assistant/__tests__/tool-registrations.contracts.test.ts, features/source-control/__tests__/gates.characterization.unit.test.ts, features/source-control/__tests__/propose-credential-tool.test.ts, features/source-control/__tests__/tool-registrations.dry-run.test.ts, features/source-control/__tests__/tool-registrations.unit.test.ts
- `features/source-control/write-port.ts`
    - prod: features/source-control/index.ts
    - tests: features/custom-credentials/__tests__/extract-s8-c2p1-ports.type-pin.ts, features/source-control/__tests__/write-port.unit.test.ts
