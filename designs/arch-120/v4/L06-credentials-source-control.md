# L06 — credentials ↔ source-control (3 edges + boundary `feature-rank:3`; I) — one repo (Tovu), Codex-ready

This lane also clears the `check:boundaries` error `feature-rank:3 custom-credentials/credential-ports.ts →
source-control/provider-registry.ts` and the tip's 10-file `no-circular` warning
(`agent-plugins/bundled-contribution-sources → … → credential-ports → provider-registry → agent-plugins`).

### Changes
1. **I** `custom-credentials/credential-ports.ts:14` (`buildSourceControlProviderForApi`,
   `LoadSourceControlProviders`): the credential-ports deps take a **required**
   `buildSourceControlProvider` function and a local `LoadSourceControlProviders` function type.
   Composition (`server/runtime/composition/credentials-host-ports.ts`, which already picks
   `loadSourceControlProviders`) passes source-control's function.
2. **I** `source-control/tool-registrations.ts:2` (`describeCredentialByLabel`,
   `resolveCustomCredentialByLabel`, `CustomCredentialSetRepoPort`): the source-control tool deps take
   a required `customCredentials: { describeByLabel, resolveByLabel }`, built in composition over
   the custom-credentials store. The repo type becomes the local subset that is used.
3. **I — the validator is bound, not moved (judge 3 F6).** v3 moved `validateRepositoryTarget` into
   source-control, which recreated the edge because the moved code throws
   `CustomCredentialValidationError` from `custom-credentials/store.ts`. v4 does not move it.
   - `source-control/write-port.ts`: delete `:11`. `bindSourceControlWritePort(required)` gains
     the required field
     `validateRepositoryTarget: (target: { owner: unknown; repo: unknown }, validateTarget?: RepositoryTargetValidator) => { owner: string; repo: string }`.
     `RepositoryTargetValidator` is source-control's own type in `provider-module.ts`. The port's
     `validateTarget` member becomes
     `({ provider, target }) => required.validateRepositoryTarget(target, provider.validateTarget)`.
     It reads `required.validateRepositoryTarget` **inside the closure, at call time**, as `build`
     already reads `required.load`. Do not destructure it at bind time, because the roots bind from
     inside the `RouteDeps` literal, where the fields are getters (`write-port.ts:16-19`).
   - **Legal import path:** `features/custom-credentials/index.ts` adds
     `export { validateRepositoryTarget } from "./write-files-validation.js";`.
     `server/runtime/composition/credentials-host-ports.ts:18` passes it as
     `bindSourceControlWritePort({ ..., validateRepositoryTarget })`, imported from
     `#src/features/custom-credentials/index`. Composition already imports feature entries.
   - **Error identity:** the bound function is the original, so the error is still a
     `CustomCredentialValidationError` with the same message, thrown before any provider call.
   - Callers to repoint (they pass the same function): `features/source-control/__tests__/write-port.unit.test.ts:50,78,86`,
     `features/custom-credentials/__tests__/write-files-network-failure.model-facing.test.ts:100`,
     `tool-registrations.model-facing-errors.test.ts:98`, `write-files-confirmation.test.ts:105,323,340`.
     Test files import the validator from `#src/features/custom-credentials/index` (tests are not
     measured by `check:architecture`). `extract-s8-c2p1-ports.type-pin.ts:28,47` is unchanged
     because `ReturnType` is unchanged.

### Characterization tests
- Keep and run: `features/custom-credentials/__tests__/write-files-validation.unit.test.ts` (the validator's own unit test, `:7,24-66`, unchanged path),
  `features/source-control/__tests__/write-port.unit.test.ts` (validation ordering, provider identity, lazy binding),
  `features/custom-credentials/__tests__/extract-s8-c1-*.test.ts`, `extract-s8-g-cred.integration.test.ts`,
  `write-files-confirmation.test.ts`, `write-files-network-failure.model-facing.test.ts`, `tool-registrations.model-facing-errors.test.ts`.
- Add to `write-port.unit.test.ts`: (a) an invalid `repo` through the bound port throws `instanceof CustomCredentialValidationError`
  imported from `custom-credentials/store.ts`, and `provider.validateTarget` is never called;
  (b) a `required` object whose `validateRepositoryTarget` is a getter is not read by `bindSourceControlWritePort` itself (lazy binding).
- Add one composed case per root showing that the source-control tool deps resolve a label to the same credential as before.

### STOP
- If `custom-credentials/index.ts` exporting the validator creates a cycle or a new `check:boundaries` error, stop and report it. Do not move the function.
- If any production caller of `bindSourceControlWritePort` exists besides `credentials-host-ports.ts`, list it and pass the validator there too.

---

### Inventory (TypeScript-AST reverse-import index of tip `2d82735a`, all of `apps/website/src`, prod + tests)

#### Edges
- `custom-credentials/credential-ports.ts` -> `source-control/provider-registry.ts` [I] buildSourceControlProvider in deps (composition)
- `source-control/tool-registrations.ts` -> `custom-credentials/index.ts` [I] customCredentials { describeByLabel, resolveByLabel } in deps (composition)
- `source-control/write-port.ts` -> `custom-credentials/write-files-validation.ts` [I] validateRepositoryTarget bound through `bindSourceControlWritePort` required (composition passes the original)

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

#### Named test files (verifier runs them; every `*.test.ts` that imports a changed source file or a moved symbol's old home; AST index of the tip): 9 files

```text
  apps/website/src/assistant/__tests__/moved-tools.credential-cards.golden.test.ts
  apps/website/src/assistant/__tests__/tool-approval-policy.test.ts
  apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  apps/website/src/features/custom-credentials/__tests__/extract-s8-c2p1-credential-ports.test.ts
  apps/website/src/features/source-control/__tests__/gates.characterization.unit.test.ts
  apps/website/src/features/source-control/__tests__/propose-credential-tool.test.ts
  apps/website/src/features/source-control/__tests__/tool-registrations.dry-run.test.ts
  apps/website/src/features/source-control/__tests__/tool-registrations.unit.test.ts
  apps/website/src/features/source-control/__tests__/write-port.unit.test.ts
```
The verifier runs every file above plus the new characterization tests this sheet names, on the parent and on the candidate (INDEX-v4 § Gate).
