# EXTRACT-S9

**Continuation D in progress. The coordinator approved the single additive F1 trace expectation; the C3 gate is being completed before G-deploy and C4. Historical stop sections below are superseded.**

The input, inventory and initial-stop sections retain historical first-delivery evidence. The Continuation and closing sections below describe the current source and supersede that initial stop.

The inventory below was committed before implementation. The approved R1 relocation resolves the old S8 layout conflict, but does not authorize edits to the two additional failing overlay tests.

## Inputs and clock

- Tovu: `2c9c1a65c0c0bcf8993d6a6b774c37de94ca92aa`, origin `https://github.com/AINSEP/Tovu.git`.
- Jini: `46cd558de9c6b4fa882b46349450ce3bcf0a378d`, origin `https://github.com/AINSEP/Jini.git`.
- Both clean branches created as `cloud/extract-s9` after checking remote branch absence and the full integrated pins. No merges, other-lane cherry-picks, main writes, force pushes or publication.
- Conservative UTC start `2026-11-09T17:14:00Z`; reserve starts `20:54:00Z`; deadline `21:14:00Z`. Setup is inside the four-hour cap.
- Actual tools: Node `v24.2.0`, npm `11.3.0`, pnpm `10.33.2`; installed under `/workspace/work/extract-s9/toolchain`, outside tracked source.
- Jini bootstrap and honest-testing instructions loaded. Missing Tovu AI-Dev-Shop and planning chapters are expected and explicitly waived by the dispatch. No helper agents.
- Original declaration snapshot reproduced from clean `35c4961af718f0f30591c46d2ea2756c4484a731` and verified at the end. No gate substitutes a later baseline.
- S4/S5/S6/S8 are already merged in the supplied integrated base. The trim's historical statement that they are unmerged is superseded by that base. S7 remains unbuilt. C-d is reserved for an independent reviewer.

## Setup evidence before inventory

Jini frozen install, core build and recursive build: exit 0. Tovu npm ci, SDK build, Jini relink, contracts build and main tsc: exit 0. Both tracked trees remained clean. Raw commands, timestamps, child PIDs and exits are logged under `/workspace/work/extract-s9/`.

Initial tool installation hit the read-only default npm cache; setting a task-local npm cache fixed setup. One untracked `packages/plugin-ui-ux-design` directory left by the original `work` checkout was proven absent from the integrated Git tree and moved intact to task scratch storage. No tracked or other user file was deleted.

## C3 inventory (recorded before implementation; move not started)

Source provenance is the full Tovu pin above, under `apps/website/src/features/custom-credentials/`. AST extraction identified 29 handler declarations and six copy declarations. The former `isCredentialedRequestShapeRejection` is already absent following the integration repair; it is not recreated. The 15 frozen closure function names still exist. Searches of every Jini package and example found no existing declaration/caller of any moving API, so the existing-Jini-test input allowance remains NONE.

All destinations below are within `packages/integrations/src/credentialed-http/tools/`, unless a defining core/same-package module is stated. The resolved move would transfer source bodies and why-comments mechanically from Git-pinned files; it was not executed. Host binders, catalogs, implementations and policy remain Tovu.

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
- Runtime dependencies use existing canonical class objects and `buildAuthorizationHeader` directly from their defining integrations modules, not this package's public barrel. The unimplemented entry would get exports/typesVersions plus `jini.entries` node classification; no isolation or dependency additions.
- Ordering/custody: same store, vault, transaction, CAS/private context and answer-route exchange store; metadata-only reads; selected-only decrypt; current grant/permission rechecks; abort after async sealing; fresh username on rotation; origin/probe before seal; validation before dialogs; authenticated frozen DELETE with post-answer re-admission; one provider build/plan/commit on the SAME provider with the EXACT plan; caller-safe egress before decoration; optional publish enrichment and post-success invalidation only. The existing consumer declarations already carry these obligations; their preservation on the future Jini declarations remains part of the unstarted move.

### Prospective test changes and boundaries (not implemented)

- Approved R1 relocation only: remove Tovu `features/custom-credentials/__tests__/extract-s8-x-contracts.test.ts`; add integrations `tools/__tests__/contracts-closure.test.ts` with its same four tests, 15 function names, eight type names and byte-identical regexes. Only source reads/lookup across this package's own tools files change. The existing S8-2 additive allowlist entries already exist and will not be duplicated. Actual R1 diffs at this stop are empty, as recorded below.
- New checks: `tools/__tests__/vocabulary.test.ts`; public-export second-host `examples/neutral-host/src/credential-tools.test.ts`; Tovu `features/custom-credentials/__tests__/extract-s9-tools-public.test.ts` for public-subpath/runtime/error identity and real emitted-note boundaries. New Tovu tests resolve only published subpaths/dist, never Jini source, checkout, snapshot or environment paths.
- Baseline selection verified from Git: 71 apps/website source tests and 28 current fly/github/railway/render overlay test files (99 files total). Trim's historical overlay count 13 is stale; root `content/` is the real location. Exact lists and actual results are retained in the gate receipt. Known allowlist unresolved pair remains explicitly non-green.

## Baseline and batch results

Baseline assessed below. The two prior overlay failures invoke the brief's test-drift stop. No C3/G-deploy/C4 implementation started.

### Core dependencies of the moved consumer declarations

All imports below are type-only. Source file:line is at the integrated Tovu pin. No runtime dependency is introduced.

| Source file:line | Types | Resolved defining core subpath | Vocabulary |
| --- | --- | --- | --- |
| `credential-tool-host.ts:9` | `AgentToolDefinition`, `DerivedRiskByToolId`, `SurfaceAskThenReport`, `ToolMetadataById` | `@jini-ai/core` | Shared types; host values remain required declaration inputs. |
| `credential-tool-host.ts:10` | `SurfaceCardApp`, `SurfaceCardFormSpec`, `SurfaceCardsPort` | `@jini-ai/core/contracts/cards` | Shared types; host values remain required declaration inputs. |
| `credential-tool-host.ts:11` | `CredentialedRequestPort`, `SourceControlWritePort` | `@jini-ai/core/contracts/credentials` | Shared types; host values remain required declaration inputs. |
| `credential-tool-operations.ts:7` | `ApprovalAnswer`, `ApprovalSteps`, `DerivedRiskByToolId`, `LegacyToolAuthorizeFn`, `SurfaceExchangeStore`, `ToolExecutionContext`, `ToolExecutionOptions`, `ToolHandler` | `@jini-ai/core` | Shared types; host values remain required declaration inputs. |
| `credential-tool-operations.ts:8` | `SecretCardForm`, `SurfaceDetail`, `SurfaceOutcomeSpec` | `@jini-ai/core/contracts/cards` | Shared types; host values remain required declaration inputs. |
| `credential-tool-operations.ts:9` | `CredentialAuthSchemeRule`, `CredentialSetConnectionInput`, `CredentialSetSummary`, `CredentialSetTokenHint`, `PluginCredentialCard` | `@jini-ai/core/contracts/credentials` | Shared types; host values remain required declaration inputs. |
| `credential-tool-operations.ts:10` | `VaultRepoPort` | `@jini-ai/core/contracts/vault` | Shared types; host values remain required declaration inputs. |
| `credential-tool-operations.ts:11` | `CallerSafeErrorRule`, `ModelFacingErrorRule` | `@jini-ai/core/model-facing-tool-errors` | Shared types; host values remain required declaration inputs. |

Dependency import sites for the runtime closure are its original import declarations in `tool-registrations.ts:2–75` and `credential-copy-tool.ts:1–9`; the symbol-by-symbol owner table above resolves those specifiers. Property names such as `cards.defineSecretCardTool` and `cards.askThenReport` are required inputs, not imports of UI/daemon values into the moved implementation.

## Actual baseline and stop evidence

[Complete gate receipt](extract-s9-gates.json) contains exact commands, exits, PIDs/timestamps, all 99 raw Tovu outputs, exact Jini selections, raw guard output and every isolation finding. Results apply to the unchanged paired source pins listed above; Tovu descendants are report-only. No last fully green extraction pair exists.

### Why this is a mandatory prior-drift stop

Both failing Tovu tests at line 36 require literal `credential_save { kind: "plugin-provider", target: "railway" }` / `target: "render"` in the selected plugin skill. The real resolver points to the pinned Jini `packages/agent-plugins/{railway,render}` directories. Their current instructions instead say `open the secure connection card; it saves as` the API label, without those literal tool calls. Each failing file is 2/3; no extraction or setup edit changed any input.

| Frozen test / failing case | Baseline | Exact pinned dependency |
| --- | --- | --- |
| `content/agent-plugin-overlays/railway/__tests__/credential-card.test.mjs:36`: Railway guidance opens its own card, deploys only through the tools and never offers an unasked replacement | exit 1, 2 pass / 1 fail | Jini `packages/agent-plugins/railway/skills/railway/SKILL.md:19` |
| `content/agent-plugin-overlays/render/__tests__/credential-card.test.mjs:36`: Render guidance opens its own card, deploys only through the tools and never offers an unasked replacement | exit 1, 2 pass / 1 fail | Jini `packages/agent-plugins/render/skills/render/SKILL.md:27` |

All four working files were compared byte-for-byte to their full supplied Git pins, not merely to a local source snapshot:

| Repository / path | Git blob at supplied pin | Working bytes |
| --- | --- | --- |
| Tovu `content/agent-plugin-overlays/railway/__tests__/credential-card.test.mjs` | `200e5e761ebe23ad2567b843b6d45202a209175d` | identical |
| Tovu `content/agent-plugin-overlays/render/__tests__/credential-card.test.mjs` | `f0d00933af80bb395e3ce042b9080295788ae6b3` | identical |
| Jini `packages/agent-plugins/railway/skills/railway/SKILL.md` | `0c91c9d34fe9b457c3fc728026471eac73514f8a` | identical |
| Jini `packages/agent-plugins/render/skills/render/SKILL.md` | `a34a138ca17d8eb419f9bfde08e84828d9ba3483` | identical |

These tests are explicitly required by R7 and are outside R1's two-file allowance. Neither failure is a waived baseline exclusion. The brief forbids fixing prior behavior or changing another frozen test, so implementation stops rather than adding a waiver. The next assignee is the coordinator/owner to decide how to reconcile these frozen literal assertions with the already-neutral plugin guidance. No repair or assertion change is made here.

The MCP-UI file retains its separately approved two failures: `cli/commands/import-local.ts:151: file` is unresolved and `agent_plugin_connect` is allowlisted without a local opener. The integrated scan reports one unresolved binding plus one unexplained id (rather than the trim's older two-unresolved wording). Neither is counted green. Existing S8-2 additive entries were not duplicated.

### Gates actually run

| Gate | Exit / result |
| --- | --- |
| Jini frozen install, core build, full recursive bootstrap | 0 each |
| Tovu npm ci, SDK build, local Jini link, contracts build | 0 each |
| Tovu main `npx tsc -p tsconfig.json --noEmit` | 0 |
| Jini core / integrations / devops / neutral-host `tsc --noEmit` | 0 each |
| Jini named credential HTTP + package surface + sets | 8 files, 217/217; exit 0 |
| Jini named deploy + fetch/integration contracts | 22 files, 163/163; exit 0 |
| Neutral-host credential sets | 1 file, 1/1; exit 0 |
| Three named checker test files | 3 files, 70/70; exit 0 |
| Tovu exact named matrix, including all required overlays | 99 files, 1,244 tests: 1,240 pass, 4 fail, 0 cancelled/skipped; aggregate exit 1 |
| Tovu unchanged C0 stored-row/G-cred recording | 11/11; exit 0 |
| XP1–XP5 `pnpm check:cross-package` with original snapshot | 0, clean |
| Full `pnpm guard` after residue removal | 1, only inherited R2/R10; full output below |
| `pnpm guard:plugins` | 0 |
| Layer CLI + actual exported `checkPackageLayers` | 0 / `[]` |
| Isolation CLI + actual exported audit | 0 blocking; 578 closures, SI-c 9 / SI-d 7, all paths/reasons in receipt |

Guard output was personally read in full, including all HW families and all six R13 lines. No scratch finding filter is used as guard evidence:

```text
2026-11-09T17:29:45.499406+00:00 cwd=/workspace/Jini command=pnpm guard

> jini@ guard /workspace/Jini
> node --import tsx ./scripts/guard.ts

[hardwiring] HW1-env-default: 17 total; 0 new
[hardwiring] HW2-vendor-adapter: 16 total; 0 new
[hardwiring] HW3-module-state: 135 total; 0 new
[hardwiring] HW4-injected-fetch: 1 total; 0 new
[hardwiring] HW5-jini-export: 0 total; 0 new
[hardwiring] HW6-boot-default: 0 total; 0 new
[hardwiring] HW7-public-react: 0 total; 0 new
[hardwiring] HW8-provider-url: 49 total; 0 new
[hardwiring] HW9-plugin-import: 0 total; 0 new
[guard] R13-model-fallback-freshness claude: MF3 SKIPPED — no readable ~/.claude.json and the CLI initialize handshake found nothing (Claude Code not installed/usable here). Staleness date still enforced (MF1/MF2).
[guard] R13-model-fallback-freshness codex: MF3 compared 9 live id(s) against 20 fallback entr(ies).
[guard] R13-model-fallback-freshness antigravity: MF3 SKIPPED — `agy models` unavailable (spawn agy ENOENT). Staleness date still enforced (MF1/MF2).
[guard] R13-model-fallback-freshness pi: MF3 SKIPPED — MF3 does not apply to `pi` — only MF1/MF2 (staleness date) apply. Staleness date still enforced (MF1/MF2).
[guard] R13-model-fallback-freshness aider: MF3 SKIPPED — MF3 does not apply to `aider` — only MF1/MF2 (staleness date) apply. Staleness date still enforced (MF1/MF2).
[guard] R13-model-fallback-freshness opencode: MF3 SKIPPED — MF3 does not apply to `opencode` — only MF1/MF2 (staleness date) apply. Staleness date still enforced (MF1/MF2).
[guard] R2-deep-path packages/plugin-catalog/scripts/generate.ts: relative import "../../agent-plugins/src/core/identity-namespace.js" reaches into another package's src (agent-plugins) — import by package name instead
[guard] R10-chatpane-public-surface packages/chat/src/react/features/chat-pane/components/ChatPane.tsx: imports "Icon" from "../../../components/Icon.js" (resolves outside features/chat-pane/**), but "Icon" is not in the public barrel's export list (packages/chat/src/react/index.ts) — a consumer of the published API could not reach this the same way ChatPane does

2 guard violation(s).
 ELIFECYCLE  Command failed with exit code 1.

END 2026-11-09T17:30:18.848642+00:00 EXIT 1
```

Before cleanup, the same guard additionally found exactly five R8 missing-manifest directories: `plugin-ai-trace-langfuse`, `plugin-analytics-posthog`, `plugin-observability-opentelemetry`, `plugin-observability-sentry`, `plugin-payments-stripe`. Each was proven untracked and contained only ignored node_modules and generated plugin payloads; each was moved intact outside the checkout. The sixth earlier residue was `plugin-ui-ux-design`. This was setup cleanup, not a stop or a new waiver.

Tooling corrections: the first full exported audit used ESM named imports against scripts loaded as CommonJS; inspecting the real exports and rerunning with `require` produced the complete audit. The initial matrix summary expected TAP but Node selected the spec reporter; all 99 raw spec summaries were reparsed and verified, giving the actual 1,244/1,240/4 totals above. No test was edited or rerun merely to alter a count.

### Original declaration baseline

Fresh detached scratch checkout at `35c4961af718f0f30591c46d2ea2756c4484a731`; frozen install, core and recursive builds all exit 0. The unchanged S9 checker and verified tsx 4.23.1 loader wrote the snapshot using their own mapping: 3,308 mappings / 3,320 declarations. Tracked original source remained clean before/after/finally.

- Manifest SHA256: `d836eba0b0e29efb9fe2e79f8a1c2f61655190008d70e74c0c86ae518728d459`.
- Sorted declaration aggregate SHA256: `48f6d4223224dc975edfbdebf1a01a25bf12044dfd1d4f872624571266452d24`.
- Both reverified at shutdown; the receipt includes raw final hash/count output and original HEAD/cleanliness. Every gate command inherited `JINI_DECLARATION_BASELINE_DIR=/workspace/work/extract-s9/xp3-snapshot`. No snapshot regeneration.

## Initial preservation, unrun work and delivery (historical)

At the first delivery `43fff22ff2f4188c88ef5011da5392eb96e4ebc6`, no production, existing test, fixture, pin, metadata, migration, lock, guard, checker, layer, debt or waiver file had changed in either repository. No new dependency, runtime layer or package import was added. At that first delivery, the only tracked S9 additions were the report and its initial gate receipt. Existing C0/golden/mail/cost/saved-state tests ran unchanged; no serialization, ciphertext, key, grant, custody or cost behavior was modified.

At the initial stop, R1 diffs were both empty (the later C3 relocation diffs appear in full below). `extract-s8-x-contracts.test.ts` remains in Tovu and passed 4/4; re-homing belongs to the unstarted C3 move. The MCP-UI completeness test is unchanged. No new second-host/vocabulary/declaration test listed in the prospective inventory was written or claimed as evidence.

Remaining work, in order:

1. C3 move, approved test re-home, new public-subpath/second-host/vocabulary tests and its full gate. Inventory only is complete.
2. G-deploy immutable real-tool recording; no fixture/recording SHA exists for S9.
3. C4 seam, inventory and its tests/gate.
4. C4 move, inventories/provenance/new tests and full accumulated gate.
5. Independent C-d review after the work is eligible; not produced or self-approved in this session. X1/X2/X3 remain later work.

At the initial stop, because no implementation had begun, new-code lint/complexity, moved emitted JS/d.ts/note inspection, mutation tests, G-deploy hashes and post-move accumulated gate were not run. Baseline builds/types do not stand in for any of those gates. No C3 or later batch passed.

Baseline-only paired source: Tovu `2c9c1a65c0c0bcf8993d6a6b774c37de94ca92aa` / Jini `46cd558de9c6b4fa882b46349450ce3bcf0a378d`. There is no fully green S9 source pair, because the required baseline itself has the additional prior drift above. Those were the unchanged source pins at the initial stop; current C3 source tips are recorded below.

Initial inventory commit pushed on Tovu `cloud/extract-s9`: `0d1f39c0492bfa06ab56537ca617a0ba33fc6820`. Jini `cloud/extract-s9` was pushed and verified at `46cd558de9c6b4fa882b46349450ce3bcf0a378d`; no Jini tracked write/commit. Baseline/stop evidence commit pushed on the same branch: `60bd6711a9aa5ba98a9ff6bf6c984eaadf2acc2b`. The final closing commit is report-only and its full SHA is supplied in the final response; no later source verification is implied.

Evidence/shutdown UTC: `2026-11-09T17:39:18.296485+00:00`; elapsed `0.4217` hours of 4. This is an early prior-drift stop, not a cap stop. All 133 recorded child commands have matching exits. Exact process-group inspection found no running task child; remaining defunct entries have already exited and were not killed. No test/server was left running, no broad kill was used, and unrelated processes were untouched.

Session scratch stays under `/workspace/work/extract-s9/`, outside both tracked trees. Prepared move scripts were never executed. No brief or plan was committed. There are no uncommitted source/test changes to hand off.

Final close at 2026-11-09T17:40:20.860285+00:00; elapsed 0.4391 hours. Both remote branches are `cloud/extract-s9`. The terminal marker below records session termination only; the STOPPED verdict above governs extraction status.


## F1 addition — inventory before implementation

The owner explicitly authorizes the DELETE preflight repair and an additive regression in `extract-s8-x-host-operations.test.ts`; this extends the old frozen-test allowance for this finding only. Existing assertions, inputs, fixtures and byte pins remain unchanged. The Railway/Render overlay stop remains in effect for the move.

| Unit | Value/type | Current location | Resolution / future C3 destination | Vocabulary |
| --- | --- | --- | --- | --- |
| DELETE `resolveTarget` rejection in `createCredentialToolRegistrations` | value | Tovu `apps/website/src/features/custom-credentials/tool-registrations.ts:1228` | Catch inside the existing recovery `invoke`; classify the original once; rebuild validation only from `callerSafeMessage`; rethrow other objects unchanged. Future same C3 handler closure. | No new literal or host policy. Retain map-level formatting; no schema decoration. |
| `CredentialedRequestValidationError` constructor | value | Already imported in Tovu from `./credentialed-request.js` | Canonical defining owner is Jini `integrations/src/contracts/credentialed-request-errors.ts`; future relative import `../../contracts/credentialed-request-errors.js` from tools. No package-barrel import. | Shared error identity, no host vocabulary. |
| Foreign DELETE regression | test | Existing `extract-s8-x-host-operations.test.ts` | Append test(s) only, using the published credentialed-http error and independent raw/safe messages. Pin classify-once, exact map prefix, zero approval/send and non-validation identity. | Foreign ids/permissions/catalog already provided by the unchanged fixture. |

The old five-line preflight comment describes the unsafe old behavior; this owner-directed correction will replace it with the caller-safe/class-preserving rule. All unrelated why-comments remain byte-identical. No Jini source, export, dependency or stored format changes are needed for F1.

Follow-up UTC opened 2026-11-09T17:42:42.789517+00:00; original start/deadline remain 17:14Z / 21:14Z. No clock reset. Baseline is the verified report-only tip `43fff22ff2f4188c88ef5011da5392eb96e4ebc6` / Jini `46cd558de9c6b4fa882b46349450ce3bcf0a378d`.

## Continuation

The coordinator explicitly rules the unchanged Railway/Render `credential-card.test.mjs:36` failures to be known baseline failures unrelated to these moves. Neither test nor either plugin skill may change. Every gate will run them and verify the same literal `credential_save` assertion still fails; they are never counted green. The two MCP-UI failures remain known baseline failures too. Every other new red retains the existing fix/stop policy.

Proceed on the same `cloud/extract-s9` branches and original clock: start `2026-11-09T17:14:00Z`, reserve `20:54Z`, hard deadline `21:14Z`. No new cap or helper agent. The final marker is now `EXTRACT-S9-C DONE` or `EXTRACT-S9-C STOPPED AT CAP`, written only at actual close. Historical stop evidence above remains baseline evidence, not the continuation verdict.

### F1 result (before C3 move)

Implemented at Tovu `94c9bb85c78cc8bf7858ee40f1ba5b27cc419b46`, Jini unchanged `46cd558de9c6b4fa882b46349450ce3bcf0a378d`. The new tests reproduced the raw-address leak (17 pass /2 new fail), passed after repair (19/19), rejected the raw-message mutation (18 pass /1 fail), then passed restored (19/19). Validation keeps the canonical class and exact map-level prefix, with no schema text; non-validation objects retain identity. Approval/send/exchange counts remain zero on preflight rejection. All old four card/descriptor byte pins remain equal.

The focused F1 selection (not the full C3 gate) is 12 files /120 cases: 116 pass, exactly the four approved baseline failures. Both overlay failures still fail at their original literal assertion; neither test nor skill changed. Strict ESLint including complexity/cognitive limits 10, the explicit amended-test type check and main Tovu tsc all exit 0. Raw commands/results are `f1-*` in the existing task logs and will be retained in continuation evidence.

C3 provenance is updated to this F1-fixed source SHA before the move. Its only additional value dependency is the already-existing canonical `CredentialedRequestValidationError`, resolved to Jini `integrations/src/contracts/credentialed-request-errors.ts` (relative `../../contracts/credentialed-request-errors.js` from tools), as inventoried above. The F1 comment correction is owner-requested; no unrelated rationale is changed.

### C3 implementation and gate in progress

The complete 35-declaration closure and both local consumer contract files now live in `@jini-ai/integrations/credentialed-http/tools`; the F1-fixed source was moved, not reconstructed. Tovu's old factories/types bind/re-export that public entry. The new entry declares node runtime, exports and typesVersions without new package dependencies or isolation exceptions. The migrated four-test closure suite retains every assertion, function/type name and regex, changing only directory-local reads.

New tests pass: published second-host factories 3/3, vocabulary/import scan 1/1, migrated closure 4/4, public old-entry/error identity and real emitted notes 2/2. All core/integrations/devops/neutral types, Tovu main and explicit new pins pass. Normal strict lint with both complexity ceilings10 passes after the optional-property and hint-projection adaptations below. Full Jini shared gate passes except the two inherited guard violations; full real guard output was read, all HW counts unchanged/zero new. Layers `[]`, 579 closures after the single new subpath, same nine SI-c and seven SI-d informational paths/reasons.

The full Tovu matrix currently records 99 files /1,244 cases: 1,239 pass and 5 fail. Four are the explicitly known MCP-UI/Railway/Render failures. The remaining failure is the frozen `extract-s8-c2p2c-ports.test.ts:235` trace: F1 requires a classification call after refused `resolveTarget`, while the old expected trace is only `['resolveTarget']`. No assertion has been changed; a single additive expected-call allowance has been requested from the coordinator. C3 is not claimed gated and G-deploy has not started.

Self-caused setup/build/lint findings fixed in scope: Jini strict optional-property checking requires local optional `card`, `pluginCard`, `keyHint` and `pluginId` to explicitly admit undefined; no core contract is widened. Absent emitter uses an empty optional object; saved-card output clones the same safe summary then deletes tokenHint instead of binding an unused discard variable rejected by Jini lint. Old card/descriptor/cost/recording tests remain equal. A new host-test authorizer annotation now uses the canonical core type.

The real guard (not a scratch filter) reported four N1 consumer-name and four N2 source-root comment findings. Only those actual rejected comment lines were neutralized; exact original SHA/path attribution is retained in Jini `packages/integrations/source-map.md`. The eight-line exact old/new record is in continuation evidence. No production string default or stored protocol changed. The corrected raw guard is exactly inherited R2/R10 with HW17/16/135/1/0/0/0/49/0 and zero new.

### R1 full actual relocation diffs

Tovu deletion (the four unchanged tests are preserved in the Jini addition immediately after it):

```diff
diff --git a/apps/website/src/features/custom-credentials/__tests__/extract-s8-x-contracts.test.ts b/apps/website/src/features/custom-credentials/__tests__/extract-s8-x-contracts.test.ts
deleted file mode 100644
index f64bdaec9..000000000
--- a/apps/website/src/features/custom-credentials/__tests__/extract-s8-x-contracts.test.ts
+++ /dev/null
@@ -1,72 +0,0 @@
-/** @file EXTRACT-S8-X: pure consumer contracts, declaration notes and host-vocabulary closure. */
-import assert from 'node:assert/strict';
-import { readFileSync } from 'node:fs';
-import test from 'node:test';
-import ts from 'typescript';
-
-function read(name: string) {
-  const text = readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
-  return { text, source: ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true) };
-}
-
-test('consumer-only operations import core types only, with no runtime imports or hidden host defaults', () => {
-  const { text, source } = read('credential-tool-operations.ts');
-  for (const statement of source.statements) {
-    if (ts.isImportDeclaration(statement)) {
-      assert.equal(statement.importClause?.isTypeOnly, true);
-      assert.ok(ts.isStringLiteral(statement.moduleSpecifier));
-      assert.match(statement.moduleSpecifier.text, /^@jini-ai\/core(?:\/|$)/);
-    } else assert.ok(ts.isInterfaceDeclaration(statement), statement.getText(source));
-  }
-  assert.doesNotMatch(text, /@tovu\/|#src\/|@jini-ai\/(?!core)|['"]tovu['"]|CUSTOM_CREDENTIALS|custom_credential_|https?:\/\//);
-});
-
-test('every exported consumer contract carries its own second-host note, preserved in declarations', () => {
-  for (const name of ['credential-tool-operations.ts', 'credential-tool-host.ts']) {
-    const { text, source } = read(name);
-    const declarations = ts.transpileDeclaration(text, { fileName: name, compilerOptions: { removeComments: false } });
-    assert.deepEqual(declarations.diagnostics ?? [], []);
-    const emitted = ts.createSourceFile(name.replace('.ts', '.d.ts'), declarations.outputText, ts.ScriptTarget.Latest, true);
-    for (const declaration of [source, emitted]) {
-      for (const statement of declaration.statements.filter(ts.isInterfaceDeclaration)) {
-        const comments = declaration.text.slice(statement.getFullStart(), statement.getStart(declaration));
-        assert.match(comments, /@agent-note/, `${name}: ${statement.name.text} must carry declaration-local obligations`);
-      }
-    }
-  }
-});
-
-test('the credential-port ordering note is attached to CustomCredentialToolPorts itself', () => {
-  const { text, source } = read('credential-tool-host.ts');
-  const declaration = source.statements.find(s => ts.isInterfaceDeclaration(s) && s.name.text === 'CustomCredentialToolPorts');
-  assert.ok(declaration);
-  const comment = text.slice(declaration.getFullStart(), declaration.getStart(source));
-  assert.match(comment, /resolveTarget.*never decrypts/);
-  assert.match(comment, /SAME provider object/); assert.match(comment, /EXACT plan/); assert.match(comment, /Aborted → no commit/);
-  assert.doesNotMatch(comment, /The secret-card functions/);
-});
-
-test('the prospective moved handler/helper closure has no product literal defaults or Tovu dependency types', () => {
-  const { source } = read('tool-registrations.ts');
-  const names = [
-    'createCredentialSaveHandlers', 'createCredentialToolRegistrations', 'openCreateCard', 'saveCreateCard', 'saveSetToken',
-    'probeCardBeforeSave', 'readCreateCredentialPrefill', 'safeCredentialLabel', 'deriveCreateCredentialSubmission',
-    'mapCreateCredentialError', 'rejectUnexpectedSetUsernameFields', 'requireUsernameOrClearSentinel', 'rejectUnexpectedSetTokenFields',
-    'makeModelFacingCredentialedRequest', 'performRepositoryFilesWrite',
-  ];
-  for (const name of names) {
-    const fn = source.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === name);
-    assert.ok(fn && ts.isFunctionDeclaration(fn) && fn.body, name);
-    const visit = (node: ts.Node) => {
-      if (ts.isStringLiteralLike(node)) assert.doesNotMatch(node.text, /tovu|custom_credential_|custom-credentials|credential_save|features\/|https?:\/\//i, `${name}: host vocabulary must be supplied`);
-      if (ts.isIdentifier(node)) assert.notEqual(node.text, 'CustomCredentialsToolDeps', `${name}: actor contract must not name Tovu route types`);
-      ts.forEachChild(node, visit);
-    };
-    visit(fn);
-  }
-  for (const name of ['ValidatedWriteFilesInput', 'WriteFilesResult', 'SetTokenResult', 'SetTokenAnswerContext', 'RawCreateCredentialFields', 'CreateCredentialSubmission', 'CreateCardFailure', 'CreateCredentialResult']) {
-    const statement = source.statements.find(s => (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) && s.name.text === name);
-    assert.ok(statement, name);
-    assert.match(source.text.slice(statement.getFullStart(), statement.getStart(source)), /@agent-note/, name);
-  }
-});
```

Jini addition:

```diff
diff --git a/packages/integrations/src/credentialed-http/tools/__tests__/contracts-closure.test.ts b/packages/integrations/src/credentialed-http/tools/__tests__/contracts-closure.test.ts
new file mode 100644
index 000000000..5bd0a663c
--- /dev/null
+++ b/packages/integrations/src/credentialed-http/tools/__tests__/contracts-closure.test.ts
@@ -0,0 +1,75 @@
+/** @file EXTRACT-S8-X: pure consumer contracts, declaration notes and host-vocabulary closure. */
+import assert from 'node:assert/strict';
+import { readdirSync, readFileSync } from 'node:fs';
+import test from 'node:test';
+import ts from 'typescript';
+
+function read(name: string) {
+  const names = name === 'tool-registrations.ts'
+    ? readdirSync(new URL('..', import.meta.url)).filter(file => file.endsWith('.ts'))
+    : [name];
+  const text = names.map(file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')).join('\n');
+  return { text, source: ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true) };
+}
+
+test('consumer-only operations import core types only, with no runtime imports or hidden host defaults', () => {
+  const { text, source } = read('credential-tool-operations.ts');
+  for (const statement of source.statements) {
+    if (ts.isImportDeclaration(statement)) {
+      assert.equal(statement.importClause?.isTypeOnly, true);
+      assert.ok(ts.isStringLiteral(statement.moduleSpecifier));
+      assert.match(statement.moduleSpecifier.text, /^@jini-ai\/core(?:\/|$)/);
+    } else assert.ok(ts.isInterfaceDeclaration(statement), statement.getText(source));
+  }
+  assert.doesNotMatch(text, /@tovu\/|#src\/|@jini-ai\/(?!core)|['"]tovu['"]|CUSTOM_CREDENTIALS|custom_credential_|https?:\/\//);
+});
+
+test('every exported consumer contract carries its own second-host note, preserved in declarations', () => {
+  for (const name of ['credential-tool-operations.ts', 'credential-tool-host.ts']) {
+    const { text, source } = read(name);
+    const declarations = ts.transpileDeclaration(text, { fileName: name, compilerOptions: { removeComments: false } });
+    assert.deepEqual(declarations.diagnostics ?? [], []);
+    const emitted = ts.createSourceFile(name.replace('.ts', '.d.ts'), declarations.outputText, ts.ScriptTarget.Latest, true);
+    for (const declaration of [source, emitted]) {
+      for (const statement of declaration.statements.filter(ts.isInterfaceDeclaration)) {
+        const comments = declaration.text.slice(statement.getFullStart(), statement.getStart(declaration));
+        assert.match(comments, /@agent-note/, `${name}: ${statement.name.text} must carry declaration-local obligations`);
+      }
+    }
+  }
+});
+
+test('the credential-port ordering note is attached to CustomCredentialToolPorts itself', () => {
+  const { text, source } = read('credential-tool-host.ts');
+  const declaration = source.statements.find(s => ts.isInterfaceDeclaration(s) && s.name.text === 'CustomCredentialToolPorts');
+  assert.ok(declaration);
+  const comment = text.slice(declaration.getFullStart(), declaration.getStart(source));
+  assert.match(comment, /resolveTarget.*never decrypts/);
+  assert.match(comment, /SAME provider object/); assert.match(comment, /EXACT plan/); assert.match(comment, /Aborted → no commit/);
+  assert.doesNotMatch(comment, /The secret-card functions/);
+});
+
+test('the prospective moved handler/helper closure has no product literal defaults or Tovu dependency types', () => {
+  const { source } = read('tool-registrations.ts');
+  const names = [
+    'createCredentialSaveHandlers', 'createCredentialToolRegistrations', 'openCreateCard', 'saveCreateCard', 'saveSetToken',
+    'probeCardBeforeSave', 'readCreateCredentialPrefill', 'safeCredentialLabel', 'deriveCreateCredentialSubmission',
+    'mapCreateCredentialError', 'rejectUnexpectedSetUsernameFields', 'requireUsernameOrClearSentinel', 'rejectUnexpectedSetTokenFields',
+    'makeModelFacingCredentialedRequest', 'performRepositoryFilesWrite',
+  ];
+  for (const name of names) {
+    const fn = source.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === name);
+    assert.ok(fn && ts.isFunctionDeclaration(fn) && fn.body, name);
+    const visit = (node: ts.Node) => {
+      if (ts.isStringLiteralLike(node)) assert.doesNotMatch(node.text, /tovu|custom_credential_|custom-credentials|credential_save|features\/|https?:\/\//i, `${name}: host vocabulary must be supplied`);
+      if (ts.isIdentifier(node)) assert.notEqual(node.text, 'CustomCredentialsToolDeps', `${name}: actor contract must not name Tovu route types`);
+      ts.forEachChild(node, visit);
+    };
+    visit(fn);
+  }
+  for (const name of ['ValidatedWriteFilesInput', 'WriteFilesResult', 'SetTokenResult', 'SetTokenAnswerContext', 'RawCreateCredentialFields', 'CreateCredentialSubmission', 'CreateCardFailure', 'CreateCredentialResult']) {
+    const statement = source.statements.find(s => (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) && s.name.text === name);
+    assert.ok(statement, name);
+    assert.match(source.text.slice(statement.getFullStart(), statement.getStart(source)), /@agent-note/, name);
+  }
+});
```

R1 allowlist diff at C3 is empty: the integrated S8 entries already exist, and are not duplicated. All four regex/name/assertion bodies in the relocation remain byte-identical.

All three C3 factory regressions independently reject defaulted host input (permission, card namespace, copy id mutations), each 2 pass /1 expected fail, then restore 3/3. No mutation remains. [Continuation gate receipt](extract-s9-c-gates.json) preserves actual source pairs, raw test/guard outputs, command exits, exact comment rewordings and declaration provenance. The frozen trace allowance remains pending; no later batch is claimed.

## Continuation close — C3 gate blocked, no later batch started

F1's functional repair is implemented and its new regression/mutation evidence is green. The moved credential-tool code, canonical error identities, core-only contracts, required foreign host values and real emitted notes are present. C3 is **not** claimed complete: the full affected gate cannot pass while both requirements remain in force:

- F1 requires the DELETE `resolveTarget` catch to call `classifyError` once before handling a validation rejection.
- Frozen `extract-s8-c2p2c-ports.test.ts:235` requires the refused-target trace to equal only `['resolveTarget']`. The actual trace is `['resolveTarget', 'classifyError']`.

Skipping or concealing the classification would undo the requested fix. Changing the expected trace is outside the explicit existing-test allowances. A coordinator allowance for that single additive expected-call update was requested, but no answer has been received. The original exact assertion remains untouched; it is not waived, hidden or counted green. This is a joint frozen-contract conflict, not an implementation failure left unfixed or a time-cap stop.

The final replay ran after all source repairs, comment repairs and mutation restoration: **99 Tovu files, 1,244 cases, 1,239 pass /5 fail**, no cancellation/skip. Four failures are the explicitly known baseline failures. The fifth is the trace assertion above. Both Railway/Render tests still fail on their original line36 literal assertion, with 2/3 in each file; both tests and both skill files remain byte-identical to their supplied pins. Main/explicit T types, touched J builds/types, new second-host runtime/type/note/vocabulary tests and strict lint pass. The raw guard after repair is exactly the inherited R2/R10, unchanged HW counts/zero new; no N1/N2 finding remains. Full layer/isolation evidence remains unchanged except 579 closures for the added subpath.

No G-deploy recording/fixture was created, no C4 seam or move started, no accumulated-gate success is claimed, and no C-d review or packed/full-suite proof is claimed. These are the remaining batches, in their required order. No final green post-F1 paired source exists: the last complete baseline-only matrix is at Tovu `2c9c1a65c0c0bcf8993d6a6b774c37de94ca92aa` / Jini `46cd558de9c6b4fa882b46349450ce3bcf0a378d`, with the four now-approved baseline failures. The smaller F1 selection was not proof of the complete C3 gate.

Current moved source pair: Tovu `f11072b7d830654c4010c752f68d9379e14b69af` / Jini `e4c2b55681a8e8a0ab67365b0cc747a7ed84da66`. Later Tovu descendants are report-only. No lock, migration, guard, checker, layer, isolation, debt, waiver, existing golden, metadata or saved fixture changed. Existing-test edits are exactly the approved R1 relocation and the explicitly requested F1 additive cases; the pending trace assertion and both waived overlay tests/skills are unchanged.

All pushed commits in this continuation (branch `cloud/extract-s9` in both repositories):

### Tovu

```text
4f1d8087bc19b36a68b4ab3d835f06c704bee3e0 docs(extraction): inventory authorized F1 DELETE preflight repair
f7d36a53c7f914adfc1dd97b4527b789bfeaccf6 test(credentials): reproduce F1 DELETE preflight message leak
94c9bb85c78cc8bf7858ee40f1ba5b27cc419b46 fix(credentials): sanitize classified DELETE preflight validation text
d796f7457c634950f9deff3a1b3fd9c18d1c9883 docs(extraction): record F1 gate and C3 fixed-source provenance
f11072b7d830654c4010c752f68d9379e14b69af refactor(credentials): bind C3 tools from the public Jini subpath
cf7c6da32f1dc5e8e756ee4938535427801b2a23 docs(extraction): preserve C3 gates and exact frozen-trace conflict
```

### Jini

```text
ed15026bdec708ea5d9061ea3e0fb9fb563fa18f feat(integrations): move credential tool closure behind injected host ports
60ea703f53cf8c79c8b451527dd947bfdadc0a60 fix(integrations): satisfy strict host typing and hint projection lint
e4c2b55681a8e8a0ab67365b0cc747a7ed84da66 fix(integrations): neutralize guard-rejected comments and retain provenance
```

The closing Tovu report-only SHA is supplied in the final response; both final remote refs will be verified after that push. XP3 original manifest and declaration aggregate hashes were checked again and still match the required originals; the original checkout is clean.

Actual close/shutdown: `2026-11-09T18:14:47.795236+00:00`; `1.0133` elapsed hours from the original 17:14Z start, deadline still 21:14Z. All 396 recorded command parents have exits, no running exact task process group remains, and defunct entries are already exited. No test/server was left running; no broad kill or unrelated-process change occurred. Both source trees are preserved on the same branches. No brief/plan was committed. The terminal marker records this non-cap session termination, not a successful C3 or completed extraction.


## Continuation D — approved additive test wiring

The coordinator explicitly approves adding `classifyError` to the single expected refused-target trace at `extract-s8-c2p2c-ports.test.ts:235`. Only that expected entry changes; every other byte of that frozen test remains unchanged. This preserves its intent (one non-decrypting resolution, no dialog/send on refusal) while recording F1's required classify-once call.

The coordinator also authorizes necessary additive test wiring for already-approved fixes when existing assertion intent is unchanged; each instance must be listed here. Real behavior drift still stops. The known Railway/Render skill-text failures remain unchanged and non-green at every gate.

Original UTC start/deadline remain 17:14Z /21:14Z, reserve20:54Z. Same branches, no agents or clock reset. New final marker: `EXTRACT-S9-D DONE` or `EXTRACT-S9-D STOPPED AT CAP`, only at the actual end.

### C3 gate completed after the approved trace update

Tovu source `4d871e83b` /Jini source `e4c2b55681a8e8a0ab67365b0cc747a7ed84da66`: full replay **99 files /1,244 cases, 1,240 pass /4 known fail**, no skipped/cancelled case. The previously frozen trace now passes with exactly its approved single-entry addition. Every other byte of that test is unchanged. Both overlay failures remain the same line36 literal assertion, 2/3 each. The MCP-UI pair is unchanged. This is the first complete post-F1 C3 matrix with no unapproved failure. Jini's paired-source builds/types, 459 named/added cases (including the re-homed four), strict lint, emitted notes, XP1–XP5, full corrected guard, layers/isolation and mutation-restoration evidence are as recorded above; no Jini source changed since those results.

### G-deploy recording inventory (unmoved code)

New files: `features/deployments/deploy-ops/__tests__/extract-s9-g-deploy.support.ts`, `extract-s9-g-deploy.test.ts`, and literal `fixtures/extract-s9/recordings.json`. The support invokes real `buildDeployOpsRegistrations` and `runDeploy`; fixed synthetic root/site/API/plain values, clock, exchange ids and scripted existing example adapters make results/card bytes deterministic with no live network.

Record list/create/no-op/approved overwrite/declined overwrite/unset absent/approved unset/changed-during-confirmation; both site-key and exact UTF-8 plain fingerprints; original irrecoverability card bytes; denied site-key permission with zero protected reads/decrypt/network; direct accepted deploy ledger entry and a tool dispatch whose ledger fails without retry. Every case retains HTTP traces, decrypt/seal/write/site-key/registry/history counts and authorizations, and checks model output/cards/logs contain no synthetic secret. Expiry/abandonment and metadata remain the unchanged frozen tests.

The initial recorder is scratch-only and refuses to overwrite an existing fixture. The new test only reads/replays the literal fixture; it has no recording mode. The recording commit and SHA256 will be pinned before the C4 seam and never regenerated. No deploy production file changes in this batch.
