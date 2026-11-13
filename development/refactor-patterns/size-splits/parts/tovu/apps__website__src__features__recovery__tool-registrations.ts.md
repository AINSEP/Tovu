### tovu:apps/website/src/features/recovery/tool-registrations.ts
- **Over:** `buildRecoveryRegistrations` 178 (file 269, under)
- **Phase:** after-move (MOVE-AFTER agent-tools.ts / contracts) · **Batch:** size-57
- **Tests:** `apps/website/src/features/recovery/__tests__/unit/permissions.unit.test.ts`, `apps/website/src/features/recovery/__tests__/unit/tool-registrations.deep-link-validation-status.unit.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.database-recovery.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `BACKUP_READ_PERMISSION`, `RESTORE_POINT_ENTITY`, `CATALOG_BY_ID`, `RecoveryToolDeps`, `recoveryDerivedRisk`, `RESTORE_TOOL_ID`, `RECOVERY_DISCLOSURE_COVERED_CATEGORIES`, `UNWIRED_RECOVERY_TOOL_IDS`, `requireEnvelope*`, `requireDeepLinkEnvelope` | constants + deep-link validation (stay) |
| B | build-locals `const restoreHooks = (actorId: string, restorePointId: string) =>`, `const planRestoreWithDisclosure = async (actorId: string, restorePointId: string) => {` | restore hooks + disclosure-aware planning |
| C | entries `backup_list_restore_points`, `backup_get_capabilities`, `backup_plan_restore`, `recovery_get_status`, `recovery_resolve_deep_link` | read/plan handlers |
| D | entry `[RESTORE_TOOL_ID]: humanConfirmedToolHandler(surfaces, {` | the human-confirmed restore handler |

- **Splits:**
  1. HELPERS (module level, above `buildRecoveryRegistrations`, in this order):
     - `restoreHooksFor({ routeDeps, actorId, restorePointId }: RestoreHooksForInput)` (return type inferred, as today) ← the `restoreHooks` arrow body (~L187-199).
     - `planRestoreWithDisclosure({ routeDeps, actorId, restorePointId }: PlanRestoreWithDisclosureInput)` ← the arrow body (~L203-234) with its "Plans a restore as the agent and folds in the discarded-write…" doc; its inner `restoreHooks(actorId, input.restorePointId)` becomes `restoreHooksFor({ routeDeps, actorId, restorePointId: input.restorePointId })`.
     - `buildRecoveryReadHandlers({ routeDeps }: RecoveryHandlersInput): Record<string, ToolHandler>` ← entries `backup_list_restore_points` … `recovery_resolve_deep_link` (~L237-319); `planRestoreWithDisclosure(ctx.principal.id, restorePointId)` → `planRestoreWithDisclosure({ routeDeps, actorId: ctx.principal.id, restorePointId })`.
     - `createRestoreHandler({ routeDeps, surfaces }: CreateRestoreHandlerInput): ToolHandler` ← the `[RESTORE_TOOL_ID]` entry value (~L320-395) with the same two call-site rewrites (`planRestoreWithDisclosure(...)`, `restoreHooks(ctx.principal.id, restorePointId)` → `restoreHooksFor({ routeDeps, actorId: ctx.principal.id, restorePointId })`).
     - Shared plan-named input `interface RecoveryHandlersInput { routeDeps: RecoveryToolDeps }`; `CreateRestoreHandlerInput` adds `surfaces: AssistantSurfaceDeps`.
  2. `buildRecoveryRegistrations` keeps its signature (incl. the `surfaces` default), `const handlers: Record<string, ToolHandler> = { ...buildRecoveryReadHandlers({ routeDeps }), [RESTORE_TOOL_ID]: createRestoreHandler({ routeDeps, surfaces }) };` and its `return buildDomainRegistrations(` statement.
- **Importers to update:** none.
- **After:** file ~280; `buildRecoveryRegistrations` ~10; helpers ~14 / ~32 / ~80 / ~76.
- **Risks / notes:** Positional `(actorId, restorePointId)` arrows become object-arg module functions — every call site (3) must be rewritten; grep the file for `restoreHooks(` and `planRestoreWithDisclosure(` afterwards. The default `surfaces` (fresh store per call) stays on the builder only.
