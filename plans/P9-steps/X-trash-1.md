# X-trash-1 — trash → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:13 T:14. Depends on: none (only already-Jini code). Est: J 57 min, T 71 min.

## J — move verbatim into Jini (8 files, 411 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/trash/adapters/plugin.ts` | `packages/cms/src/trash/site/adapters/plugin.ts` | 2 |  |
| `apps/website/src/features/trash/adapters/theme.ts` | `packages/cms/src/trash/site/adapters/theme.ts` | 4 |  |
| `apps/website/src/features/trash/directory-rollback-log.ts` | `packages/cms/src/trash/site/directory-rollback-log.ts` | 6 |  |
| `apps/website/src/features/trash/ports.ts` | `packages/cms/src/trash/site/ports.ts` | 62 |  |
| `apps/website/src/features/trash/registry.ts` | `packages/cms/src/trash/site/registry.ts` | 266 |  |
| `apps/website/src/features/trash/remove-without-blocker.ts` | `packages/cms/src/trash/site/remove-without-blocker.ts` | 38 |  |
| `apps/website/src/features/trash/scheduler.node.ts` | `packages/cms/src/trash/site/scheduler.node.ts` | 19 |  |
| `apps/website/src/features/trash/widget-removal.ts` | `packages/cms/src/trash/site/widget-removal.ts` | 14 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./trash/site/adapters/plugin"]
- "@jini-ai/cms" exports["./trash/site/adapters/theme"]
- "@jini-ai/cms" exports["./trash/site/directory-rollback-log"]
- "@jini-ai/cms" exports["./trash/site/ports"]
- "@jini-ai/cms" exports["./trash/site/registry"]
- "@jini-ai/cms" exports["./trash/site/remove-without-blocker"]
- "@jini-ai/cms" exports["./trash/site/scheduler.node"]
- "@jini-ai/cms" exports["./trash/site/widget-removal"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (3, 514 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/trash/__tests__/directory-adapter.test.ts`
- `apps/website/src/features/trash/__tests__/not-trashed.test.ts`
- `apps/website/src/features/trash/__tests__/remove-without-blocker.test.ts`


## T — Tovu repoint: delete the 8 sources, rewrite every importer (46 lines)

```
apps/website/src/features/trash/index.ts:85  './adapters/plugin.js' -> '@jini-ai/cms/trash/site/adapters/plugin'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/trash/permissions.ts:24  './adapters/plugin.js' -> '@jini-ai/cms/trash/site/adapters/plugin'
apps/website/src/features/trash/index.ts:86  './adapters/theme.js' -> '@jini-ai/cms/trash/site/adapters/theme'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/trash/permissions.ts:26  './adapters/theme.js' -> '@jini-ai/cms/trash/site/adapters/theme'
apps/website/src/features/trash/trash-item-tool.ts:52  './adapters/theme.js' -> '@jini-ai/cms/trash/site/adapters/theme'
apps/website/src/features/trash/index.ts:84  './directory-rollback-log.js' -> '@jini-ai/cms/trash/site/directory-rollback-log'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/trash/__tests__/member-adapter.test.ts:31  '../ports.js' -> '@jini-ai/cms/trash/site/ports'
apps/website/src/features/trash/index.ts:9  './ports.js' -> '@jini-ai/cms/trash/site/ports'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/trash/index.ts:11  './ports.js' -> '@jini-ai/cms/trash/site/ports'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/trash/repo.sqlite.ts:21  './ports.js' -> '@jini-ai/cms/trash/site/ports'
apps/admin/src/features/trash/__tests__/rules.unit.test.ts:6  '../../../../../website/src/features/trash/registry' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/__tests__/lane-su-pins/p1b-lock-keys-media-trash-members.test.ts:8  '#src/features/trash/registry' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/__tests__/lane-su-pins/p2-member-one-lock.test.ts:13  '#src/features/trash/registry' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/assistant/__tests__/tool-registrations.trash-item.test.ts:24  '#src/features/trash/registry' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/email-template-trash-flow.test.ts:12  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/entry-sql.characterization.test.ts:7  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/form-adapter.test.ts:11  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/form-trash-flow.test.ts:14  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/member-adapter.test.ts:22  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/menu-trash-flow.test.ts:16  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/move-to-trash.test.ts:10  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/sweeper.test.ts:11  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/table-adapter.characterization.test.ts:8  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/table-adapter.dialects.test.ts:7  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/table-adapter.marker-sql-parity.test.ts:9  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/table-adapter.test.ts:12  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/term-trash-flow.test.ts:25  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/tool-contract.characterization.test.ts:26  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/tool-registrations.test.ts:10  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/trash-item-user.test.ts:10  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/user-adapter.test.ts:15  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/__tests__/widget-trash-flow.test.ts:19  '../registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/trash/index.ts:47  './registry.js' -> '@jini-ai/cms/trash/site/registry'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/server/__tests__/b07-trash-handler-gaps.test.ts:8  '../../features/trash/registry.js' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/server/inbound/admin-http/routes/trash/__tests__/request-contracts.test.ts:12  '#src/features/trash/registry' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts:21  '#src/features/trash/registry' -> '@jini-ai/cms/trash/site/registry'
apps/website/src/features/post/__tests__/post.trashed-slug-release.test.ts:11  '#src/features/trash/remove-without-blocker' -> '@jini-ai/cms/trash/site/remove-without-blocker'
apps/website/src/features/trash/__tests__/post-delete-undo-index.test.ts:21  '../remove-without-blocker.js' -> '@jini-ai/cms/trash/site/remove-without-blocker'
apps/website/src/features/trash/__tests__/widget-trash-flow.test.ts:4  '../remove-without-blocker.js' -> '@jini-ai/cms/trash/site/remove-without-blocker'
apps/website/src/features/trash/index.ts:13  './remove-without-blocker.js' -> '@jini-ai/cms/trash/site/remove-without-blocker'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/trash/index.ts:14  './remove-without-blocker.js' -> '@jini-ai/cms/trash/site/remove-without-blocker'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/server/inbound/admin-http/routes/trash/__tests__/page-display-kind.integration.test.ts:13  '#src/features/trash/remove-without-blocker' -> '@jini-ai/cms/trash/site/remove-without-blocker'
apps/website/src/features/trash/__tests__/sweeper.test.ts:2  '#src/features/trash/scheduler.node' -> '@jini-ai/cms/trash/site/scheduler.node'
apps/website/src/server/runtime/composition/serving-app.ts:2  '#src/features/trash/scheduler.node' -> '@jini-ai/cms/trash/site/scheduler.node'
apps/website/src/features/trash/__tests__/widget-trash-flow.test.ts:3  '../widget-removal.js' -> '@jini-ai/cms/trash/site/widget-removal'
apps/website/src/features/trash/index.ts:12  './widget-removal.js' -> '@jini-ai/cms/trash/site/widget-removal'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
```

## Tovu tests that must stay green (28; import lines are repointed above, assertions untouched)
- `apps/admin/src/features/trash/__tests__/rules.unit.test.ts`
- `apps/website/src/__tests__/lane-su-pins/p1b-lock-keys-media-trash-members.test.ts`
- `apps/website/src/__tests__/lane-su-pins/p2-member-one-lock.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.trash-item.test.ts`
- `apps/website/src/features/post/__tests__/post.trashed-slug-release.test.ts`
- `apps/website/src/features/trash/__tests__/email-template-trash-flow.test.ts`
- `apps/website/src/features/trash/__tests__/entry-sql.characterization.test.ts`
- `apps/website/src/features/trash/__tests__/form-adapter.test.ts`
- `apps/website/src/features/trash/__tests__/form-trash-flow.test.ts`
- `apps/website/src/features/trash/__tests__/member-adapter.test.ts`
- `apps/website/src/features/trash/__tests__/menu-trash-flow.test.ts`
- `apps/website/src/features/trash/__tests__/move-to-trash.test.ts`
- `apps/website/src/features/trash/__tests__/post-delete-undo-index.test.ts`
- `apps/website/src/features/trash/__tests__/sweeper.test.ts`
- `apps/website/src/features/trash/__tests__/table-adapter.characterization.test.ts`
- `apps/website/src/features/trash/__tests__/table-adapter.dialects.test.ts`
- `apps/website/src/features/trash/__tests__/table-adapter.marker-sql-parity.test.ts`
- `apps/website/src/features/trash/__tests__/table-adapter.test.ts`
- `apps/website/src/features/trash/__tests__/term-trash-flow.test.ts`
- `apps/website/src/features/trash/__tests__/tool-contract.characterization.test.ts`
- `apps/website/src/features/trash/__tests__/tool-registrations.test.ts`
- `apps/website/src/features/trash/__tests__/trash-item-user.test.ts`
- `apps/website/src/features/trash/__tests__/user-adapter.test.ts`
- `apps/website/src/features/trash/__tests__/widget-trash-flow.test.ts`
- `apps/website/src/server/__tests__/b07-trash-handler-gaps.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/trash/__tests__/page-display-kind.integration.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/trash/__tests__/request-contracts.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts`

## Named mutation
in the Jini copy of `registry.ts`, negate the first `if (` condition of its first exported function; `not-trashed.test.ts` must go red, then revert
