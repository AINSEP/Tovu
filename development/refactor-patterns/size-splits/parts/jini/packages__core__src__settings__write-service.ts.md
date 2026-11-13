### jini:packages/core/src/settings/write-service.ts
- **Over:** file 777 lines (no function over 100)
- **Phase:** now · **Batch:** size-13
- **Package entry:** not an exports target. `./settings` → `src/settings/index.ts`, which re-exports from `./write-service.js` (~L70-84): split that export block per name onto the new modules (index.ts is the entry and keeps every name).
- **Tests:** `src/settings/__tests__/write-service.set.test.ts`, `write-service.scope-guards.test.ts`, `write-service.scope-guards.f2.test.ts`, `write-service.reset.test.ts`, `write-service.revision-check.test.ts`, `write-service.principal-check.test.ts`, `write-service.permission-derivation.test.ts`, `write-service.definitions-manage-authorization.test.ts`, `write-service.reconcile-default.test.ts`, `settings.lifecycle-rename.test.ts`, `settings.lifecycle-retype.test.ts`, `settings.lifecycle-deprecate-tombstone.test.ts`, `settings.registration.test.ts`, `definitions-dispatch.test.ts`, `ensure-definitions.test.ts`, `cache.test.ts`, `purge-service.test.ts`, `tool-registrations.set-value.test.ts`, `unit/catalog-contracts.unit.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A auth | `AuthorizeFn`, `SettingsWriteServiceDeps`, `deriveRequiredPermission`, `authorizeDefinitionsManage` | who may write what (shared by both write kinds) |
| B values (stays) | `SetValueRequired`, `resolveScopedDefinitionOrThrow`, `assertTargetWorkspaceMatchesAuth`, `assertTargetPrincipalInWorkspace`, `SettingsValueWriteOptions`, `readAddressedValue`, `assertExpectedRevision`, `set`, `ClearValueRequired`, `clear`, `ResetNamespaceRequired`, `resetNamespace` | value writes (set / clear / reset) |
| C definitions | `RegisterDefinitionsRequired`, `registerDefinitions`, `resolveActiveDefinitionOrThrow`, `RenameDefinitionRequired`, `renameDefinition`, `RetypeDefinitionRequired`, `retypeDefinition`, `extendDefinitionScopes`, `ReconcileDefinitionDefaultRequired`, `reconcileDefinitionDefault`, `DeprecateDefinitionRequired`, `TombstoneDefinitionRequired`, `transitionDefinitionStatus`, `deprecateDefinition`, `tombstoneDefinition` | definition lifecycle writes |

- **Splits:**
  1. NEW `write-service-auth.ts` — unit A verbatim (the behavior.spec §1.3 comment on `deriveRequiredPermission` moves). `authorizeDefinitionsManage` becomes exported (was module-private). Imports nothing local.
  2. NEW `write-service-definitions.ts` — unit C verbatim, in source order (all mechanism doc blocks move). The original `@file` header's "single write chokepoint" paragraph is copied into its header. Imports from `./write-service-auth.js` only (never from write-service.ts).
  3. write-service.ts keeps unit B; imports `SettingsWriteServiceDeps`, `deriveRequiredPermission` from auth. It does NOT re-export moved names.
- **Importers to update:** `src/settings/index.ts` (entry: retarget per name); `settings/ensure-definitions.ts` (`SettingsWriteServiceDeps` → auth; check its other names); `settings/purge-service.ts` (`AuthorizeFn` → auth); `settings/definitions-dispatch.ts` (`renameDefinition`, `retypeDefinition`, `deprecateDefinition`, `tombstoneDefinition` → definitions; `SettingsWriteServiceDeps` → auth); `settings/agent-value-write-tools.ts` (`deriveRequiredPermission`, `SettingsWriteServiceDeps` → auth; `set`, `clear` stay); tests importing `registerDefinitions`/`renameDefinition`/`retypeDefinition`/`extendDefinitionScopes`/`reconcileDefinitionDefault`/`deprecateDefinition`/`tombstoneDefinition` → `../write-service-definitions.js`; `deriveRequiredPermission`/`SettingsWriteServiceDeps` → `../write-service-auth.js` (write-service.permission-derivation, revision-check, definitions-manage-authorization, cache — check each import list).
- **After:** write-service.ts ~330; write-service-auth ~50; write-service-definitions ~430.
- **Risks / notes:** `resetNamespace` calls `clear` — both stay together. No cycle: definitions → auth, values → auth.
