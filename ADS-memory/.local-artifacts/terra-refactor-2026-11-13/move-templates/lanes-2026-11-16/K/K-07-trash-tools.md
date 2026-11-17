# K-07 trash list/restore agent tools -> `@jini-ai/cms/trash` (one run, est 150k)
files: `K-07.files.tsv` (`trash/agent-tools.ts` 154, `trash/tool-registrations.ts` 252). `trash/trash-item-tool.ts` (518 lines) is NOT in this sheet any more: it imports six per-entity adapter constants, `TrashDb`, `moveToTrash` (`move-to-trash.ts`, STAY) and `readLiveSnapshot` (`entry-sql.ts`, K-08) and holds the host's delegate table; it is K-07b in the design queue. tools: `K-07.tools.tsv` = 2, longest 21. pkg: cms. tests: `apps/website/src/features/trash/**/*.test.ts`.
over the limit: `buildTrashRegistrations` 53 (S1).
There is NO `TrashRegistry` contract in Jini (`rg -n "TrashRegistry" packages/cms/src packages/core/src` prints nothing; round 1 was wrong). Tovu owns the registry schema (`trash/registry.ts:129-164`, STAY).
BINDINGS:
| import | class | action |
|---|---|---|
| `toolMetadata` (`tool-metadata/trash.js`) | host | `withToolMetadata` |
| `TrashRegistry` (`./registry.js`) | structural | handlers use it only as `routeDeps.registry.keys()` and as the argument of `trashToolEntityTypes` (`tool-registrations.ts:192,217`): Jini declares `interface TrashKindSource { keys(): IterableIterator<TrashEntityType> }`; `trashToolEntityTypes(registry?: TrashKindSource)` keeps its name and optional parameter (S2 changes only the parameter TYPE; if it reads any other member = STOP) |
| `./permissions.js` (`filterVisibleTrashItems`, `trashDaysRemaining`, `trashPermissionFor`, `TRASH_PERMISSION_BY_ENTITY_TYPE`, `TRASH_READ_PERMISSION`) | port | product policy STAYS: `deps.trashPolicy: { permissionFor, readPermission, filterVisible, daysRemaining, permissionKinds(): readonly TrashEntityType[] }` typed from the real signatures; `permissionKinds` replaces the direct `TRASH_PERMISSION_BY_ENTITY_TYPE.keys()` read at line 192 with the same order |
| `UserRepoPort` (`@jini-ai/user-management`) | structural | members called only |
| `TrashPort`, `TrashItem`, `TrashEntityType` (`@jini-ai/cms/trash`), `@jini-ai/cms/core` | own | leaf files |
no surfaces. The catalog is built per call from the registry kinds (comment at line 213): keep it per call.
S0 extra: (f) an item the principal may not see is absent from the list tool and its restore is refused with the same message (V3: skip `filterVisible` -> RED); (g) `daysRemaining` with a fixed clock; (h) the unknown-kind refusal lists the same kinds in the same order (pins `permissionKinds` + registry order).
No step deletes data; permanent delete is not a tool here. changeset: cms minor.
