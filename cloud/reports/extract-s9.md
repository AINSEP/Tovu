# EXTRACT-S9

**Continuation in progress: F1 first, then C3 → G-deploy → C4 seam → C4 move → accumulated gate. The earlier stop is superseded by the coordinator ruling below.**

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

## Preservation, unrun work and delivery

No production, existing test, fixture, pin, metadata, migration, lock, guard, checker, layer, debt or waiver file changed in either repository. No new dependency, runtime layer or package import was added. The only tracked S9 additions are this report and its gate receipt. Existing C0/golden/mail/cost/saved-state tests ran unchanged; no serialization, ciphertext, key, grant, custody or cost behavior was modified.

R1 diffs in full: both are empty. `extract-s8-x-contracts.test.ts` remains in Tovu and passed 4/4; re-homing belongs to the unstarted C3 move. The MCP-UI completeness test is unchanged. No new second-host/vocabulary/declaration test listed in the prospective inventory was written or claimed as evidence.

Remaining work, in order:

1. C3 move, approved test re-home, new public-subpath/second-host/vocabulary tests and its full gate. Inventory only is complete.
2. G-deploy immutable real-tool recording; no fixture/recording SHA exists for S9.
3. C4 seam, inventory and its tests/gate.
4. C4 move, inventories/provenance/new tests and full accumulated gate.
5. Independent C-d review after the work is eligible; not produced or self-approved in this session. X1/X2/X3 remain later work.

Because no implementation began, new-code lint/complexity, moved emitted JS/d.ts/note inspection, mutation tests, G-deploy hashes and post-move accumulated gate were not run. Baseline builds/types do not stand in for any of those gates. No C3 or later batch passed.

Baseline-only paired source: Tovu `2c9c1a65c0c0bcf8993d6a6b774c37de94ca92aa` / Jini `46cd558de9c6b4fa882b46349450ce3bcf0a378d`. There is no fully green S9 source pair, because the required baseline itself has the additional prior drift above. Source pins have not advanced.

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
