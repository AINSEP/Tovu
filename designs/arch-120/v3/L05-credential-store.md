# L05 — credential store foundation, incl. P1 (10 edges, D + I + S)

**vendor-credentials (3 edges):**
- D: `credentialScopes`, `credentialCreateTarget`, `CredentialScope`, `ScopedCredentialDeps`,
  `CredentialProjectHalf` (`features/vendor-credentials/project-scope.ts`, 60 lines; after L01 its
  only import is `@jini-ai/integrations/webhooks`) → `contracts/core/credential-scope.ts`; also the
  two pure helpers `credentialScope`, `credentialHint` (`vault-adapter.ts:152,156`).
- I: `credentialVault` (`vault-adapter.ts:126`, constructs the Jini vault adapter) is called by
  `deployments/publish-credentials/store.ts:111` and `source-control/store.ts`. Each store's deps
  gets a **required** `credentialVault` function; composition (`server/runtime/composition/deps.ts`
  and `memory-deps/**`, every root that builds those deps — inventory) passes
  `vendor-credentials`' `credentialVault`. Record types (`VendorCredentialSetRecord`,
  `VendorCredentialSetRepoPort`) in the deployments store become local structural `Pick`s of the
  members used.
- `vendor-credentials/index.ts` drops the moved re-exports (no forwarder).

**project-keys / api-connections (5 edges, S):** consumer-owned shapes, each naming only what is
called: `custom-credentials/vault-repo.ts` (`SiteGrantedVault`), `custom-credentials/credential-copy-tool.ts`
(`ProjectKeysPort` methods called), `api-connections/shared-api.ts` (`KeyAttachments`,
`ProjectKeyTransaction`, `SiteOAuthBindings`), `project-keys/shared-oauth-disconnect.ts` — a
**disconnect-only input** (`readConnection`-free) declared locally; `SharedOAuthOwnerStorage`
itself is *not* narrowed, so `shared-api.ts` keeps `readConnection`/`saveContext` (judge 2 #7).

**P1 — `custom-credentials/tool-registrations.ts:9,95` → `deployments/contracts.ts` (S):** on the tip
the invalidation is **already** a separate injected port (`publishCompatibility.prepareInvalidation`,
`tool-registrations.ts:100,429`, bound by `deployments/publish-credentials/compatibility-port.ts`
which keeps the full `DeployTargetRegistry`, `get()` and eligibility). The remaining import types
only `loadDeployTargets`, used solely at `:299` to enrich the create form. Replace with a local
`DeployTargetCatalog = { list(): Iterable<{ descriptor: { id: string; credential?: { vendorId: string } } }> }`.
The invalidation path is untouched, so judge 2 #4 (list-only port breaks invalidation) does not
arise: invalidation never sees the narrowed type.

**deployments/deploy-ops/run-ops.ts → webhooks (I):** the four site-key functions
(`run-ops.ts:43-52`) become one **required** `siteKey` port on the run-ops deps
(`{ fingerprint(raw), reveal(siteDir) }`), composed from `webhooks`' functions in composition.

**Characterization (named risks):**
- *Cache not invalidated after save / ineligible target accepted* → keep and run
  `features/custom-credentials/__tests__/extract-s8-x-host-operations.test.ts:300-337`,
  `extract-s8-c2p1-ports.type-pin.ts`, `extract-s8-c2p2c-ports.test.ts`.
- *Create-form loses hosting vendors* → add one case: `loadCreateCredentialProviders` with a catalog
  of two descriptors (one without `credential`) returns exactly one provider; and a throwing catalog still returns source-control providers.
- *Shared OAuth revocation regresses* → `features/project-keys/__tests__/shared-oauth*.test.ts`,
  `features/api-connections/__tests__/shared-api*.test.ts`.
- *Vault built differently per root* → `features/deployments/publish-credentials/__tests__/*.test.ts`,
  `features/source-control/__tests__/store*.test.ts` run against deps from both composition roots.

**Gates:** shared gate, `LANE=L05`.

Base: Tovu `2d82735a` (integ/merge-3 tip). Edge list for G2: `designs/arch-120/v3/edges/L05.txt`. Every source line/kind/symbol origin: `facts/edges.v3.tsv` rows with lane `L05`.

---

### Inventory (TypeScript-AST reverse-import index of tip `2d82735a`, all of `apps/website/src`, prod + tests)

#### Edges
- `custom-credentials/tovu-credential-sets.ts` -> `vendor-credentials/index.ts` [D] credentialCreateTarget,credentialScopes -> contracts/core/credential-scope.ts
- `deployments/publish-credentials/store.ts` -> `vendor-credentials/index.ts` [D+I] credentialScope/Hint/CreateTarget/Scopes -> contracts/core/credential-scope.ts; credentialVault -> deps.credentialVault (composition); record types -> S
- `source-control/store.ts` -> `vendor-credentials/index.ts` [D+I] same as deployments store
- `custom-credentials/vault-repo.ts` -> `project-keys/attached-vault.ts` [S] SiteGrantedVault -> local structural type
- `custom-credentials/credential-copy-tool.ts` -> `project-keys/service.ts` [S] ProjectKeysPort -> local Pick of called methods
- `api-connections/shared-api.ts` -> `project-keys/attachments.ts` [S] KeyAttachments,ProjectKeyTransaction -> local structural types
- `api-connections/shared-api.ts` -> `project-keys/site-references.ts` [S] SiteOAuthBindings -> local structural type
- `project-keys/shared-oauth-disconnect.ts` -> `api-connections/shared-owner.ts` [S] SharedOAuthOwnerStorage -> local disconnect-only input (full type kept for its other users)
- `custom-credentials/tool-registrations.ts` -> `deployments/contracts.ts` [S] DeployTargetRegistry -> local DeployTargetCatalog {list()} (invalidation stays on publishCompatibility port)
- `deployments/deploy-ops/run-ops.ts` -> `webhooks/index.ts` [I] site-key fns -> RunOpsDeps.siteKey port, wired by composition

#### Every import/re-export of a moved or redirected symbol — repoint each; delete each re-export (no forwarder)
- `credentialCreateTarget`:
    - `features/custom-credentials/tovu-credential-sets.ts:8` import from `features/vendor-credentials/index.ts`
    - `features/deployments/publish-credentials/store.ts:14` import from `features/vendor-credentials/index.ts`
    - `features/source-control/store.ts:10` import from `features/vendor-credentials/index.ts`
    - `features/vendor-credentials/index.ts:11` reexport from `features/vendor-credentials/project-scope.ts`
- `credentialScopes`:
    - `features/custom-credentials/tovu-credential-sets.ts:8` import from `features/vendor-credentials/index.ts`
    - `features/deployments/publish-credentials/store.ts:14` import from `features/vendor-credentials/index.ts`
    - `features/source-control/store.ts:10` import from `features/vendor-credentials/index.ts`
    - `features/vendor-credentials/index.ts:11` reexport from `features/vendor-credentials/project-scope.ts`
- `same`:

#### Exact importers of each changed source file (callers that construct/pass its deps, and tests)
- `features/api-connections/shared-api.ts`
    - prod: features/api-connections/host-bindings.ts, server/runtime/composition/agent-plugin-connections.ts
    - tests: features/api-connections/__tests__/support/acme-harness.ts
- `features/custom-credentials/credential-copy-tool.ts`
    - prod: features/custom-credentials/index.ts, server/runtime/composition/tool-catalog-manifest.ts
    - tests: assistant/__tests__/tool-registrations.contracts.test.ts, features/custom-credentials/__tests__/credential-copy-tool.test.ts, features/custom-credentials/__tests__/extract-s8-c2p2-host-inputs.test.ts, features/custom-credentials/__tests__/extract-s8-c2p2-pins.support.ts, features/custom-credentials/__tests__/extract-s9-tools-public.test.ts
- `features/custom-credentials/tool-registrations.ts`
    - prod: assistant/tool-registrations.ts, server/runtime/composition/tool-catalog-manifest.ts
    - tests: assistant/__tests__/moved-tools.credential-cards.golden.test.ts, assistant/__tests__/read-only-tool-constraint.composition.test.ts, assistant/__tests__/tool-registrations.custom-credentials-egress-refusal.integration.test.ts, features/custom-credentials/__tests__/create-agent-tool.unit.test.ts, features/custom-credentials/__tests__/credential-save-probe.test.ts, features/custom-credentials/__tests__/extract-s8-c2p2-host-inputs.test.ts, features/custom-credentials/__tests__/extract-s8-c2p2-pins.support.ts, features/custom-credentials/__tests__/extract-s8-c2p2c-ports.test.ts, features/custom-credentials/__tests__/extract-s8-x-host-operations.test.ts, features/custom-credentials/__tests__/extract-s9-tools-public.test.ts, features/custom-credentials/__tests__/form-save-errors.model-facing.test.ts, features/custom-credentials/__tests__/list-agent-tool.unit.test.ts, features/custom-credentials/__tests__/make-request-delete-confirmation.test.ts, features/custom-credentials/__tests__/set-token-agent-tool.unit.test.ts, features/custom-credentials/__tests__/set-username-agent-tool.unit.test.ts, features/custom-credentials/__tests__/tool-registrations.model-facing-errors.test.ts, features/custom-credentials/__tests__/write-files-confirmation.test.ts, features/custom-credentials/__tests__/write-files-network-failure.model-facing.test.ts, server/runtime/boot/__tests__/mail-credential-cards.unit.test.ts
- `features/custom-credentials/tovu-credential-sets.ts`
    - prod: features/custom-credentials/store.ts, features/custom-credentials/vault-repo.ts
    - tests: 
- `features/custom-credentials/vault-repo.ts`
    - prod: features/custom-credentials/custom-credential-repo.ts, features/custom-credentials/index.ts, features/custom-credentials/repo.memory.ts, server/runtime/composition/deps.ts
    - tests: features/custom-credentials/__tests__/create-agent-tool.unit.test.ts, features/custom-credentials/__tests__/extract-s8-c1-source-scan.test.ts, features/custom-credentials/__tests__/extract-s8-g-cred.integration.test.ts, features/custom-credentials/__tests__/project-scope.unit.test.ts, features/custom-credentials/__tests__/vault-repo.tw4.unit.test.ts, features/deployments/__tests__/publish-agent-tools.unit.test.ts, features/deployments/publish-credentials/__tests__/credential-works-for.unit.test.ts, features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts, features/deployments/static-publish/__tests__/credentials.unit.test.ts, features/form-destinations/__tests__/key-store.unit.test.ts, features/mail-status/__tests__/suppressions-feedback.unit.test.ts, platform/db/__tests__/parity/parity-harness.ts, platform/db/repos/__tests__/custom-credential-repo.test.ts, server/__tests__/routes/mail-providers-route.test.ts, server/inbound/admin-http/routes/system/__tests__/custom-credentials-branches.unit.test.ts, server/inbound/admin-http/routes/system/__tests__/custom-credentials-inventory.unit.test.ts, server/runtime/composition/__tests__/project-store.unit.test.ts, server/runtime/composition/__tests__/vault-boot.integration.test.ts, server/runtime/composition/__tests__/vault-unified-credentials.integration.test.ts
- `features/deployments/deploy-ops/run-ops.ts`
    - prod: features/deployments/deploy-ops/agent-tools.ts, features/deployments/deploy-ops/secrets.ts, features/deployments/deploy-ops/tool-registrations.ts, features/deployments/deploy-ops/typed-secret-card.ts
    - tests: features/deployments/deploy-ops/__tests__/deploy.test.ts, features/deployments/deploy-ops/__tests__/extract-integ2-lazy-credential.test.ts, features/deployments/deploy-ops/__tests__/extract-s9-deploy-ports.test.ts, features/deployments/deploy-ops/__tests__/extract-s9-g-deploy.support.ts, features/deployments/deploy-ops/__tests__/run-ops-contract.test.ts, features/deployments/deploy-ops/__tests__/run-ops.test.ts, features/deployments/deploy-ops/__tests__/tool-registrations.test.ts, features/deployments/deploy-ops/__tests__/tw3-L041.pins.test.ts
- `features/deployments/publish-credentials/store.ts`
    - prod: features/deployments/publish-agent-tools.ts, features/deployments/publish-credentials/compatibility-port.ts, features/deployments/publish-credentials/index.ts, features/deployments/static-publish/credentials.ts, features/deployments/static-publish/verify.ts
    - tests: features/credential-safety/__tests__/stores.test.ts, features/deployments/__tests__/publish-agent-tools.unit.test.ts, features/deployments/publish-credentials/__tests__/credential-works-for.unit.test.ts, features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts, features/deployments/publish-credentials/__tests__/store.unit.test.ts, features/deployments/static-publish/__tests__/credentials.unit.test.ts, features/deployments/static-publish/__tests__/publish-run.unit.test.ts, features/deployments/static-publish/__tests__/verify.unit.test.ts
- `features/project-keys/shared-oauth-disconnect.ts`
    - prod: cli/commands/owner-store.ts
    - tests: features/api-connections/__tests__/shared-api.unit.test.ts, features/api-connections/__tests__/shared-owner.integration.test.ts, features/project-keys/__tests__/shared-oauth-disconnect.unit.test.ts
- `features/source-control/store.ts`
    - prod: features/source-control/commit-site.ts, features/source-control/credential-setup.ts, features/source-control/index.ts, features/source-control/tool-registrations.ts
    - tests: features/credential-safety/__tests__/stores.test.ts, features/site-backup/__tests__/tool-registrations-host-connection.unit.test.ts, features/site-backup/__tests__/tool-registrations.unit.test.ts, features/source-control/__tests__/account-probe.guarded.unit.test.ts, features/source-control/__tests__/commit-site.unit.test.ts, features/source-control/__tests__/credential-setup-projections.unit.test.ts, features/source-control/__tests__/gates.characterization.unit.test.ts, features/source-control/__tests__/project-scope.unit.test.ts, features/source-control/__tests__/propose-credential-tool.test.ts, features/source-control/__tests__/shared-key-reader.unit.test.ts, features/source-control/__tests__/store.resolve.unit.test.ts, features/source-control/__tests__/store.unit.test.ts, features/source-control/__tests__/tool-registrations.dry-run.test.ts, features/source-control/__tests__/tool-registrations.unit.test.ts, server/inbound/admin-http/routes/system/__tests__/source-control-credentials.unit.test.ts
