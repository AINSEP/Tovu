# K-07 SP-trash-tools-1: trash agent tools -> `@jini-ai/cms/trash`
kind: SPLIT (K-TOOLS-PATTERN). est: 200k Sonnet (3 files, 924 lines).
tovu_files: `K-07.files.tsv`: `trash/agent-tools.ts` 154, `trash/tool-registrations.ts` 252, `trash/trash-item-tool.ts` 518. decls: `K-07.decls.tsv` (36 declarations).
over the limit: `buildTrashRegistrations` 86, `TRASH_ITEM_DELEGATES` 81 (a data table: split into one constant per entity type, same keys, same order), `deriveTrashItemRegistrations` 60.
ports: `./permissions.js` (`filterVisibleTrashItems`, `trashDaysRemaining`, `trashPermissionFor`, `TRASH_PERMISSION_BY_ENTITY_TYPE`, `TRASH_READ_PERMISSION`): the entity-type -> permission MAP is product policy and STAYS (Codex, plan-v6 K4) -> `deps.trashPolicy: { permissionFor, readPermission, filterVisible, daysRemaining }`; `TrashRegistry` (`./registry.js`, STAY per plan-v6 S4) -> the registry CONTRACT type already in `@jini-ai/cms/trash` (guard: `rg -n "TrashRegistry" packages/cms/src/trash` hits; if the Jini type lacks a member the handlers call = STOP). `buildTrashAgentToolCatalog`, `trashToolEntityTypes` take the entity-type list as an argument already (verify) -> Tovu passes its list. `UserRepoPort` -> local structural port.
no surfaces (`ToolContributor<TrashToolDeps, unknown>`).
characterization (S0): pattern plus (f) an item the principal may not see is absent from `trash_list` and its restore is refused with the same message (fails if `filterVisible` is skipped); (g) `daysRemaining` pinned with a fixed clock.
note: permanent delete is not in this sheet and no step deletes data (owner: never permanent deletes).
changeset: cms minor. census: `K-07.census.txt`.
