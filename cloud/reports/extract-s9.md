# EXTRACT-S9

In progress. No extraction gate has passed yet. This inventory is recorded before implementation.

## Inputs and clock

- Tovu: `2c9c1a65c0c0bcf8993d6a6b774c37de94ca92aa`, origin `https://github.com/AINSEP/Tovu.git`.
- Jini: `46cd558de9c6b4fa882b46349450ce3bcf0a378d`, origin `https://github.com/AINSEP/Jini.git`.
- Both clean branches created as `cloud/extract-s9` after checking remote branch absence and the full integrated pins. No merges, other-lane cherry-picks, main writes, force pushes or publication.
- Conservative UTC start `2026-11-09T17:14:00Z`; reserve starts `20:54:00Z`; deadline `21:14:00Z`. Setup is inside the four-hour cap.
- Actual tools: Node `v24.2.0`, npm `11.3.0`, pnpm `10.33.2`; installed under `/workspace/work/extract-s9/toolchain`, outside tracked source.
- Jini bootstrap and honest-testing instructions loaded. Missing Tovu AI-Dev-Shop and planning chapters are expected and explicitly waived by the dispatch. No helper agents.
- Original declaration snapshot is being reproduced from clean `35c4961af718f0f30591c46d2ea2756c4484a731`. No gate substitutes a later baseline.
- S4/S5/S6/S8 are already merged in the supplied integrated base. The trim's historical statement that they are unmerged is superseded by that base. S7 remains unbuilt. C-d is reserved for an independent reviewer.

## Setup evidence before inventory

Jini frozen install, core build and recursive build: exit 0. Tovu npm ci, SDK build, Jini relink, contracts build and main tsc: exit 0. Both tracked trees remained clean. Raw commands, timestamps, child PIDs and exits are logged under `/workspace/work/extract-s9/`.

Initial tool installation hit the read-only default npm cache; setting a task-local npm cache fixed setup. One untracked `packages/plugin-ui-ux-design` directory left by the original `work` checkout was proven absent from the integrated Git tree and moved intact to task scratch storage. No tracked or other user file was deleted.

## C3 inventory (before implementation)

Source provenance is the full Tovu pin above, under `apps/website/src/features/custom-credentials/`. AST extraction identified 29 handler declarations and six copy declarations. The former `isCredentialedRequestShapeRejection` is already absent following the integration repair; it is not recreated. The 15 frozen closure function names still exist. Searches of every Jini package and example found no existing declaration/caller of any moving API, so the existing-Jini-test input allowance remains NONE.

All destinations below are within `packages/integrations/src/credentialed-http/tools/`, unless a defining core/same-package module is stated. The source bodies and why-comments will be transferred mechanically from Git-pinned files. Host binders, catalogs, implementations and policy remain Tovu.

| Symbol | Value/type | Source file:line | Resolved destination/dependencies | Permission names, ids, paths and other vocabulary |
| --- | --- | --- | --- | --- |
| `ValidatedWriteFilesInput` | type | `tool-registrations.ts:80` | `tool-registrations.ts`; `CredentialWriteFilesRequest` | No runtime string default; host values arrive through required inputs. |
| `withCardApp` | value | `tool-registrations.ts:186` | `tool-registrations.ts`; `SurfaceCardApp` | No runtime string default; host values arrive through required inputs. |
| `makeModelFacingCredentialedRequest` | value | `tool-registrations.ts:236` | `tool-registrations.ts`; `decorateWithSchema`, `CredentialedRequestPort`, `CredentialedRequestRequired`, `CredentialedRequestOptional`, `CredentialedRequestResult`, `CustomCredentialToolHost` | Only neutral protocol literals: `vocabulary`, `catalog`, `validation`, `egress-refused`. Host values arrive through required host/operations/cards/ports. |
| `isWriteFilesShapeRejection` | value | `tool-registrations.ts:266` | `tool-registrations.ts`; `CustomCredentialValidationError` | No runtime string default; host values arrive through required inputs. |
| `WriteFilesResult` | type | `tool-registrations.ts:383` | `tool-registrations.ts`; same-job local helpers / language globals | Only neutral protocol literals: `expired`, `abandoned`, `error`. Host values arrive through required host/operations/cards/ports. |
| `performRepositoryFilesWrite` | value | `tool-registrations.ts:396` | `tool-registrations.ts`; `CustomProviderConnectionInput`, `SourceControlFileWritePlan`, `SourceControlFileWriter`, `SourceControlWritePort`, `CredentialToolOperations` | Only neutral protocol literals: `commit`, `error`. Host values arrive through required host/operations/cards/ports. |
| `writeTarget` | value | `tool-registrations.ts:415` | `tool-registrations.ts`; `CustomProviderConnectionInput`, `buildAuthorizationHeader` | No runtime string default; host values arrive through required inputs. |
| `SET_USERNAME_ALLOWED_FIELDS` | value | `tool-registrations.ts:425` | `tool-registrations.ts`; same-job local helpers / language globals | Only neutral protocol literals: `label`, `username`. Host values arrive through required host/operations/cards/ports. |
| `rejectUnexpectedSetUsernameFields` | value | `tool-registrations.ts:437` | `tool-registrations.ts`; `CustomCredentialValidationError`, `CredentialToolOperations` | Only neutral protocol literals: `messages`. Host values arrive through required host/operations/cards/ports. |
| `requireUsernameOrClearSentinel` | value | `tool-registrations.ts:459` | `tool-registrations.ts`; `CustomCredentialValidationError`, `CredentialToolOperations` | Only neutral protocol literals: `messages`, `string`, ``. Host values arrive through required host/operations/cards/ports. |
| `SET_TOKEN_ALLOWED_FIELDS` | value | `tool-registrations.ts:474` | `tool-registrations.ts`; same-job local helpers / language globals | Only neutral protocol literals: `label`. Host values arrive through required host/operations/cards/ports. |
| `rejectUnexpectedSetTokenFields` | value | `tool-registrations.ts:487` | `tool-registrations.ts`; `CustomCredentialValidationError`, `CredentialToolOperations` | Only neutral protocol literals: `messages`. Host values arrive through required host/operations/cards/ports. |
| `SetTokenResult` | type | `tool-registrations.ts:559` | `tool-registrations.ts`; same-job local helpers / language globals | Only neutral protocol literals: `cancelled`, `expired`, `abandoned`, `invalid`, `error`. Host values arrive through required host/operations/cards/ports. |
| `probeCardBeforeSave` | value | `tool-registrations.ts:565` | `tool-registrations.ts`; `PluginCredentialCard`, `CredentialedRequestPort`, `CustomCredentialValidationError`, `CredentialToolActorDeps`, `CredentialToolOperations` | Only neutral protocol literals: `probe`, `refused`, `unavailable`. Host values arrive through required host/operations/cards/ports. |
| `SetTokenAnswerContext` | type | `tool-registrations.ts:585` | `tool-registrations.ts`; `PluginCredentialCard`, `CustomCredentialSummary`, `CredentialedRequestPort`, `CredentialToolActorDeps`, `CredentialToolOperations` | Only neutral protocol literals: `probe`. Host values arrive through required host/operations/cards/ports. |
| `saveSetToken` | value | `tool-registrations.ts:616` | `tool-registrations.ts`; `CustomCredentialSummary`, `ToolInputError`, `CustomCredentialNotFoundError` | No runtime string default; host values arrive through required inputs. |
| `readCreateCredentialPrefill` | value | `tool-registrations.ts:665` | `tool-registrations.ts`; `ToolInputError`, `CreateCredentialPrefill`, `CredentialToolOperations` | Only neutral protocol literals: `worksFor`, `label`, `baseUrl`, `category`, `string`, ``. Host values arrive through required host/operations/cards/ports. |
| `CreateCredentialResult` | type | `tool-registrations.ts:691` | `tool-registrations.ts`; `CustomCredentialSummary` | Only neutral protocol literals: `tokenHint`, `cancelled`, `expired`, `abandoned`, `invalid`, `duplicate-label`, `error`. Host values arrive through required host/operations/cards/ports. |
| `RawCreateCredentialFields` | type | `tool-registrations.ts:704` | `tool-registrations.ts`; same-job local helpers / language globals | No runtime string default; host values arrive through required inputs. |
| `readRawCreateCredentialFields` | value | `tool-registrations.ts:720` | `tool-registrations.ts`; same-job local helpers / language globals | Only neutral protocol literals: `label`, `string`, ``, `baseUrl`, `category`, `username`, `token`. Host values arrive through required host/operations/cards/ports. |
| `CreateCredentialSubmission` | type | `tool-registrations.ts:735` | `tool-registrations.ts`; `PluginCredentialCard` | Only neutral protocol literals: `site`. Host values arrive through required host/operations/cards/ports. |
| `safeCredentialLabel` | value | `tool-registrations.ts:775` | `tool-registrations.ts`; `CredentialToolOperations` | Only neutral protocol literals: `label`, ``. Host values arrive through required host/operations/cards/ports. |
| `deriveCreateCredentialSubmission` | value | `tool-registrations.ts:780` | `tool-registrations.ts`; `CredentialToolOperations` | Only neutral protocol literals: ``. Host values arrive through required host/operations/cards/ports. |
| `CreateCardFailure` | type | `tool-registrations.ts:796` | `tool-registrations.ts`; same-job local helpers / language globals | Only neutral protocol literals: `invalid`, `duplicate-label`, `error`. Host values arrive through required host/operations/cards/ports. |
| `mapCreateCredentialError` | value | `tool-registrations.ts:815` | `tool-registrations.ts`; `callerSafeErrorMessage`, `CustomCredentialDuplicateLabelError`, `CustomCredentialValidationError`, `CredentialToolOperations` | Only neutral protocol literals: `duplicate-label`, `invalid`, `error`. Host values arrive through required host/operations/cards/ports. |
| `saveCreateCard` | value | `tool-registrations.ts:842` | `tool-registrations.ts`; `CustomCredentialSummary`, `CredentialedRequestPort`, `CredentialToolActorDeps`, `CredentialToolOperations` | Only neutral protocol literals: `probe`. Host values arrive through required host/operations/cards/ports. |
| `openCreateCard` | value | `tool-registrations.ts:873` | `tool-registrations.ts`; `CustomCredentialSummary`, `ToolExecutionContext`, `ToolExecutionOptions`, `redactSecrets`, `SecretCardForm`, `CredentialedRequestPort`, `CredentialCardIdentity`, `CustomCredentialSecretCards`, `CredentialToolActorDeps`, `CredentialToolOperations`, `CredentialToolSurfaces` | Only neutral protocol literals: `emitSurface`, `probe`, `saved`, `blank`, `invalid`, `failed`, `error`, `success`, `. `, ``, `failure`. Host values arrive through required host/operations/cards/ports. |
| `createCredentialSaveHandlers` | value | `tool-registrations.ts:977` | `tool-registrations.ts`; `CustomCredentialSummary`, `requireInputRecord`, `requireString`, `ToolHandler`, `adaptLegacyAuthorize`, `requireToolPermission`, `callerSafeErrorMessage`, `withModelFacingErrors`, `ToolInputError`, `CredentialedRequestPort`, `CustomCredentialNotFoundError`, `CustomCredentialSecretCards`, `CustomCredentialToolHost`, `CustomCredentialToolPorts`, `CredentialToolActorDeps`, `CredentialToolOperations`, `CredentialToolSurfaces` | Only neutral protocol literals: `credentialedRequest`, `probe`, `label`, `api`, ``, `saved`, `blank`, `invalid`, `failed`, `error`, `success`, `. `, `failure`, `provider`. Host values arrive through required host/operations/cards/ports. |
| `createCredentialToolRegistrations` | value | `tool-registrations.ts:1153` | `tool-registrations.ts`; `CustomCredentialSummary`, `CredentialedRequestOutcome`, `buildDomainRegistrations`, `requireInputRecord`, `requireNoInput`, `requireString`, `withSchemaOnRejection`, `ToolHandler`, `ToolRegistration`, `adaptLegacyAuthorize`, `requireToolPermission`, `withModelFacingErrors`, `ToolInputError`, `CustomCredentialNotFoundError`, `CustomCredentialToolHost`, `CustomCredentialToolPorts`, `CredentialToolActorDeps`, `CredentialToolOperations`, `CredentialToolSetupFailure` | Only neutral protocol literals: `tokenHint`, `api`, `label`, `method`, `url`, `DELETE`, `credentialSetup`, `abandoned`, `declined`, `plan`. Host values arrive through required host/operations/cards/ports. |
| `CredentialCopyRequired` | type | `credential-copy-tool.ts:59` | `credential-copy-tool.ts`; `LegacyToolAuthorizeFn`, `InstanceAuthorizeFn`, `CredentialCopyProjectKeysPort` | No runtime string default; host values arrive through required inputs. |
| `admit` | value | `credential-copy-tool.ts:71` | `credential-copy-tool.ts`; `adaptLegacyAuthorize`, `requireToolPermission`, `ToolInputError`, `CredentialCopyToolHost` | No runtime string default; host values arrive through required inputs. |
| `selectedKey` | value | `credential-copy-tool.ts:85` | `credential-copy-tool.ts`; `SURFACE_EXCHANGE_ID_PARAM`, `ToolInputError`, `CredentialCopyToolHost` | Only neutral protocol literals: `new`, `credentialId`. Host values arrive through required host/operations/cards/ports. |
| `validateInput` | value | `credential-copy-tool.ts:96` | `credential-copy-tool.ts`; `ToolInputError`, `CredentialCopyToolHost` | Only neutral protocol literals: `object`. Host values arrive through required host/operations/cards/ports. |
| `normalKeyCard` | value | `credential-copy-tool.ts:103` | `credential-copy-tool.ts`; `ToolExecutionContext`, `ToolExecutionOptions`, `ToolHandler`, `CredentialCopyToolHost` | No runtime string default; host values arrive through required inputs. |
| `createCredentialCopyRegistrations` | value | `credential-copy-tool.ts:120` | `credential-copy-tool.ts`; `buildDomainRegistrations`, `indexCatalogById`, `SURFACE_DISMISSED_PARAM`, `SURFACE_EXCHANGE_ID_PARAM`, `ToolInputError`, `SurfaceExchangeStore`, `ToolHandler`, `ToolRegistration`, `SurfaceCardUri`, `CredentialCopyToolHost` | Only neutral protocol literals: `mcp-ui`, `abort`, `enum`, `credentialId`, `100%`, `1px`, `received`, `new`. Host values arrive through required host/operations/cards/ports. |
| `CredentialCardIdentity` | type | `credential-tool-host.ts:20` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CustomCredentialToolVocabulary` | type | `credential-tool-host.ts:38` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CustomCredentialToolHost` | type | `credential-tool-host.ts:50` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CustomCredentialSecretCards` | type | `credential-tool-host.ts:65` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CustomCredentialToolPorts` | type | `credential-tool-host.ts:85` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialCopyProjectKeysPort` | type | `credential-tool-host.ts:97` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialCopyMessages` | type | `credential-tool-host.ts:108` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialCopyToolHost` | type | `credential-tool-host.ts:136` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialApprovalDescription` | type | `credential-tool-operations.ts:19` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialApprovalPort` | type | `credential-tool-operations.ts:38` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialPluginCardsPort` | type | `credential-tool-operations.ts:51` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialCreatePrefill` | type | `credential-tool-operations.ts:64` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialCardFormsPort` | type | `credential-tool-operations.ts:77` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialSetupDiagnostic` | type | `credential-tool-operations.ts:91` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialToolSetupFailure` | type | `credential-tool-operations.ts:97` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialRecoveryPort` | type | `credential-tool-operations.ts:108` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialPublishPort` | type | `credential-tool-operations.ts:119` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialLocalePort` | type | `credential-tool-operations.ts:129` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialToolPolicy` | type | `credential-tool-operations.ts:144` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialWriteFilesRequest` | type | `credential-tool-operations.ts:160` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialToolMessages` | type | `credential-tool-operations.ts:171` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialToolDiagnostics` | type | `credential-tool-operations.ts:198` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialToolSetsPort` | type | `credential-tool-operations.ts:212` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialToolActorDeps` | type | `credential-tool-operations.ts:228` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialToolOperations` | type | `credential-tool-operations.ts:242` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |
| `CredentialToolSurfaces` | type | `credential-tool-operations.ts:264` | same-named tools contract file; core types only | Required host vocabulary/copy/authority; no runtime default. Declaration-local notes preserved. |

### External dependencies and exact owners

| Symbols | Value/type | Existing owner / resolved import | Vocabulary |
| --- | --- | --- | --- |
| `CredentialWriteFilesRequest` | type | `same-job ./credential-tool-operations.js` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `SurfaceCardApp` | type | `@jini-ai/core/contracts/cards` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `decorateWithSchema` | value | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CredentialedRequestPort` | type | `@jini-ai/core/contracts/credentials` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CredentialedRequestRequired` | type | `@jini-ai/core/contracts/credentials` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CredentialedRequestOptional` | type | `@jini-ai/core/contracts/credentials` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CredentialedRequestResult` | type | `@jini-ai/core/contracts/credentials` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CustomCredentialToolHost` | type | `same-job ./credential-tool-host.js` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CustomCredentialValidationError` | value | `../sets/store.js (same canonical classes)` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CustomProviderConnectionInput` (alias of `CredentialSetConnectionInput`) | type | `@jini-ai/core/contracts/credentials` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `SourceControlFileWritePlan` | type | `@jini-ai/core/contracts/credentials` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `SourceControlFileWriter` | type | `@jini-ai/core/contracts/credentials` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `SourceControlWritePort` | type | `@jini-ai/core/contracts/credentials` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CredentialToolOperations` | type | `same-job ./credential-tool-operations.js` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `buildAuthorizationHeader` | value | `../credentialed-request.js (defining same-package module)` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `PluginCredentialCard` | type | `@jini-ai/core/contracts/credentials` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CredentialToolActorDeps` | type | `same-job ./credential-tool-operations.js` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CustomCredentialSummary` (alias of `CredentialSetSummary`) | type | `@jini-ai/core/contracts/credentials` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `ToolInputError` | value | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CustomCredentialNotFoundError` | value | `../sets/store.js (same canonical classes)` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CreateCredentialPrefill` (alias of `CredentialCreatePrefill`) | type | `same-job ./credential-tool-operations.js` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `callerSafeErrorMessage` | value | `@jini-ai/core/model-facing-tool-errors` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CustomCredentialDuplicateLabelError` | value | `../sets/store.js (same canonical classes)` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `ToolExecutionContext` | type | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `ToolExecutionOptions` | type | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `redactSecrets` | value | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `SecretCardForm` | type | `@jini-ai/core/contracts/cards` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CredentialCardIdentity` | type | `same-job ./credential-tool-host.js` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CustomCredentialSecretCards` | type | `same-job ./credential-tool-host.js` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CredentialToolSurfaces` | type | `same-job ./credential-tool-operations.js` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `requireInputRecord` | value | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `requireString` | value | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `ToolHandler` | type | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `adaptLegacyAuthorize` | value | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `requireToolPermission` | value | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `withModelFacingErrors` | value | `@jini-ai/core/model-facing-tool-errors` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CustomCredentialToolPorts` | type | `same-job ./credential-tool-host.js` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CredentialedRequestOutcome` | type | `../credentialed-request.js (defining same-package module)` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `buildDomainRegistrations` | value | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `requireNoInput` | value | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `withSchemaOnRejection` | value | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `ToolRegistration` | type | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CredentialToolSetupFailure` | type | `same-job ./credential-tool-operations.js` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `LegacyToolAuthorizeFn` | type | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `InstanceAuthorizeFn` | type | `@jini-ai/core/gated-mutations` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CredentialCopyProjectKeysPort` | type | `same-job ./credential-tool-host.js` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `CredentialCopyToolHost` | type | `same-job ./credential-tool-host.js` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `SURFACE_EXCHANGE_ID_PARAM` | value | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `indexCatalogById` | value | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `SURFACE_DISMISSED_PARAM` | value | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `SurfaceExchangeStore` | type | `@jini-ai/core` | Core/shared contract or explicitly supplied host capability; no package cross-import. |
| `SurfaceCardUri` | type | `@jini-ai/core/contracts/cards` | Core/shared contract or explicitly supplied host capability; no package cross-import. |

### Vocabulary resolution

- `custom-credentials.read`, `custom-credentials.write`, `system.write`, domain/entity `custom-credentials`, copy domain `credential-copy`, every tool id, catalog module path, save routing, `:new-key`, `use-saved-key`, namespace/app identities, category default `general`, error codes/guidance, provider/owner labels and all human copy/example URLs remain required host/operations inputs. Existing Tovu bindings retain their original values.
- Field keys (`label`, `username`, `token`, `baseUrl`, `category`, `worksFor`, `credentialId`), `scope: site`, `saveKind: api`, `tokenHint` omission and create/rotate/pluginProvider roles are existing saved-card/store protocol; they convey no additional grant. Lifecycle/result/error discriminants and HTTP DELETE are neutral engine protocol, not host ids. `mcp-ui`, `enum`, `100%`, `1px`, abort/received and the punctuation `. ` are shared surface/layout protocol.
- Runtime dependencies use existing canonical class objects and `buildAuthorizationHeader` directly from their defining integrations modules, not this package's public barrel. New entry gets exports/typesVersions plus `jini.entries` node classification; no isolation or dependency additions.
- Ordering/custody: same store, vault, transaction, CAS/private context and answer-route exchange store; metadata-only reads; selected-only decrypt; current grant/permission rechecks; abort after async sealing; fresh username on rotation; origin/probe before seal; validation before dialogs; authenticated frozen DELETE with post-answer re-admission; one provider build/plan/commit on the SAME provider with the EXACT plan; caller-safe egress before decoration; optional publish enrichment and post-success invalidation only. These obligations live on the moved declarations and their existing port notes, not only this report.

### Test changes and boundaries

- Approved R1 relocation only: remove Tovu `features/custom-credentials/__tests__/extract-s8-x-contracts.test.ts`; add integrations `tools/__tests__/contracts-closure.test.ts` with its same four tests, 15 function names, eight type names and byte-identical regexes. Only source reads/lookup across this package's own tools files change. The existing S8-2 additive allowlist entries already exist and will not be duplicated. Full actual allowed diffs will be included after implementation.
- New checks: `tools/__tests__/vocabulary.test.ts`; public-export second-host `examples/neutral-host/src/credential-tools.test.ts`; Tovu `features/custom-credentials/__tests__/extract-s9-tools-public.test.ts` for public-subpath/runtime/error identity and real emitted-note boundaries. New Tovu tests resolve only published subpaths/dist, never Jini source, checkout, snapshot or environment paths.
- Baseline selection verified from Git: 71 apps/website source tests and 28 current fly/github/railway/render overlay test files (99 files total). Trim's historical overlay count 13 is stale; root `content/` is the real location. Exact lists and actual results will be retained with gate evidence. Known allowlist unresolved pair remains explicitly non-green.

## Baseline and batch results

Pending: fresh original declaration snapshot verification, named tests and full real guard/layer/isolation baseline. No implementation is authorized until the baseline is assessed. No G-deploy/C4 implementation has started.
