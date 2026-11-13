### tovu:apps/website/src/features/database/tool-registrations.ts
- **Over:** `buildDatabaseRegistrations` 106 (file 172, under)
- **Phase:** now (STAY-WIRING) · **Batch:** size-03
- **Tests:** `apps/website/src/assistant/__tests__/tool-registrations.database-recovery.test.ts`, `apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | the `[MIGRATE_TOOL_ID]: humanConfirmedToolHandler(surfaces, { flag: "migrated", prepare, dialog, run })` entry | human-confirmed "update the database" tool (plan → dialog → confirm → execute) |
| B | `migrateHooks`, `portable`, `restorePointTool` guard, the rest of `handlers` (portable read tools, `database_plan_migrate_forward`, `backup_create_restore_point`), `buildDomainRegistrations` | registration wiring (stays) |

- **Splits** (same file, module level, directly above `buildDatabaseRegistrations`):
  1. `buildMigrateForwardToolHandler({ routeDeps, surfaces, migrateHooks }: BuildMigrateForwardToolHandlerInput): ToolHandler` ← the value expression `humanConfirmedToolHandler(surfaces, { … })` of the `[MIGRATE_TOOL_ID]` key, verbatim (prepare/dialog/run bodies, error text, `ToolInputError` message unchanged). `migrateHooks: (actorId: string) => <its current return type>` — type it as `ReturnType`-free by declaring `migrateHooks` with an explicit type alias `type MigrateHooksFactory = (actorId: string) => ReturnType<typeof buildMigrateForwardHooks>` only if `migrateHooks` already returns `buildMigrateForwardHooks(...)` (check its body at `const migrateHooks = (actorId: string) =>`); otherwise use `typeof migrateHooks` is impossible across scopes, so export nothing and spell the existing return type. In `handlers`: `[MIGRATE_TOOL_ID]: buildMigrateForwardToolHandler({ routeDeps, surfaces, migrateHooks }),`.
- **Importers to update:** none (no export moves).
- **After:** file ~180; `buildDatabaseRegistrations` ~50; `buildMigrateForwardToolHandler` ~58.
- **Risks / notes:** `database_plan_migrate_forward` contains a pre-existing `hooks as unknown as GatedMutationHooks<…>` — it is NOT moved by this plan (stays inline) so the banned-cast rule is not triggered; do not touch it. The moved block keeps its single `as GatedMutationHooks<unknown, unknown>` casts verbatim (pre-existing; not `as any`/`as unknown as`). Same `surfaces` instance passed in (default param is evaluated once per `buildDatabaseRegistrations` call, as today).
