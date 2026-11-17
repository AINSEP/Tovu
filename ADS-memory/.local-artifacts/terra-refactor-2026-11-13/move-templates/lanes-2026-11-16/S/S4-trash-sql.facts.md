# S4-trash-sql — machine-verified facts (generated; do not hand-edit)

Source: Tovu tree at `LANE_ROOT` (committed copy: `origin/integ/merge-a-2026-11-16`) @ `e801e9aee`. Regenerate: `LANE_ROOT=<tovu clone> python3 scripts/inv.py && LANE_ROOT=<tovu clone> python3 scripts/rep.py && LANE_ROOT=<tovu clone> python3 scripts/facts.py [<out dir>]`. Blobs are `git hash-object` of that tree; a sheet executor re-checks every blob (COMMON STOP-on-mismatch).

Files: 19, 2311 lines (tests not counted).

## Files
| path (under apps/website/src) | lines | blob | CLASSIFY label | audit row | existing sheet/design mention | prod importers | test importers |
|---|---|---|---|---|---|---|---|
| features/trash/repo.ts | 232 | 6d021f772491f7b07751ebe1903252d8dc458429 | MOVE-AFTER | - | - | 2 | 1 |
| features/trash/repo.sqlite.ts | 34 | 81037d83f9347cce1c19f31693a50a0aaccc8d39 | - | - | - | 2 | 22 |
| features/trash/table-adapter.ts | 362 | 130fb351f7c2a7b94f24ace3bb4dbcd93de163d2 | MOVE-AFTER | - | - | 1 | 15 |
| features/trash/registry.ts | 365 | 9f57eab631aa59db2bfd9b20e77cb7549ca558bb | MIXED | - | - | 10 | 21 |
| features/trash/entry-sql.ts | 83 | 3b6118b1142a1c9f481ae089739f5bf45d0726fb | MOVE-AFTER | - | - | 6 | 2 |
| features/trash/entry-sql.types.ts | 9 | 40dfd4247ddc905606ecd900b29a73811eda6c4a | MOVE-AFTER | - | - | 2 | 0 |
| features/trash/not-trashed.ts | 117 | 52f16e518731c309b242a23ad61f6bcc5fd519de | MOVE-AFTER | - | - | 2 | 1 |
| features/trash/db-port.ts | 19 | 6f3933aa623bf14e6db7a23652e85772102ae03b | DELETE | - | - | 5 | 0 |
| features/trash/ports.ts | 61 | 259001ccbb8641aea194b24c9892eae43845d5fd | MIXED | - | - | 3 | 1 |
| features/trash/adapters/marker-sql.ts | 147 | a9b4b2dc837f8cb535e1cb40abd512b8e3054232 | DEDUPE-AFTER-HARDENING | - | - | 5 | 1 |
| features/trash/adapters/comment.ts | 74 | ddc480f72a7ba96b9a3e474c62bf46ff5ac17ab7 | DEDUPE-AFTER-HARDENING | - | - | 4 | 1 |
| features/trash/adapters/post.ts | 91 | ec577cc49c659d7eeac4168343053ee28501b1c9 | DEDUPE-AFTER-HARDENING | - | - | 4 | 9 |
| features/trash/adapters/redirect.ts | 73 | 2510365a6bfab9fe04cdd8618fb77cb19368824f | DEDUPE-AFTER-HARDENING | - | - | 4 | 2 |
| features/trash/adapters/media.ts | 95 | 5f52eb6dc4b12fa45995fc158c6805cfc46a7e9d | - | - | - | 4 | 3 |
| features/trash/adapters/member.ts | 64 | 198f819cc57da91efad9d6c11554ac4f1b34f882 | - | - | - | 1 | 2 |
| features/trash/adapters/user.ts | 228 | efed28901c7e183c9a8dd55513f423ef5d772812 | - | - | - | 3 | 4 |
| features/trash/adapters/directory.ts | 253 | 882f7424dab6e4bf99888b908c39d69357a2508f | MOVE | - | - | 1 | 1 |
| features/trash/adapters/plugin.ts | 1 | 7eb6549c5c38c1b4985172b0af63ad78c3984707 | - | - | - | 2 | 0 |
| features/trash/adapters/theme.ts | 3 | 62a459c27c7d39818b40d38a8a6b279628276489 | - | - | - | 3 | 0 |

## Per file: exports, tables, lock keys, imports that leave the folder, importers

### features/trash/repo.ts (232 lines)
- exports (1): SqlTrashRepo
- tables touched: trashed_items
- lock keys: 191: await this.kernel.lockKey(SWEEP_LOCK_KEY);
- flags: sql``
- npm/@jini-ai imports: @jini-ai/cms/trash, kysely
- same-folder imports: -
- imports leaving the folder: platform/db/content-database.generated.ts, platform/db/content-kernel.ts
- prod importers (2): features/trash/index.ts, features/trash/repo.sqlite.ts
- test importers (1): features/trash/__tests__/repo.contract.test.ts

### features/trash/repo.sqlite.ts (34 lines)
- exports (2): SqliteTrashRepo, createContentDbTransactionRunner
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: features/trash/ports.ts, features/trash/repo.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/kernel/index.ts
- prod importers (2): features/trash/index.ts, server/runtime/composition/peer-site-reads.ts
- test importers (22): assistant/__tests__/tool-registrations.trash-item.test.ts, features/post/__tests__/post.trashed-slug-release.test.ts, features/trash/__tests__/email-template-trash-flow.test.ts, features/trash/__tests__/follow-ups.test.ts, features/trash/__tests__/form-adapter.test.ts, features/trash/__tests__/form-trash-flow.test.ts, features/trash/__tests__/member-adapter.test.ts, features/trash/__tests__/menu-trash-flow.test.ts, features/trash/__tests__/move-to-trash.test.ts, features/trash/__tests__/on-changed.contract.test.ts, features/trash/__tests__/post-delete-undo-index.test.ts, features/trash/__tests__/prior-marker.contract.test.ts, features/trash/__tests__/repo.contract.test.ts, features/trash/__tests__/sweeper.test.ts, features/trash/__tests__/table-adapter.test.ts, features/trash/__tests__/term-trash-flow.test.ts, features/trash/__tests__/transaction-runner.test.ts, features/trash/__tests__/trash.contract.test.ts, features/trash/__tests__/user-adapter.test.ts, features/trash/__tests__/widget-trash-flow.test.ts, server/inbound/admin-http/routes/trash/__tests__/page-display-kind.integration.test.ts, server/inbound/admin-http/routes/trash/__tests__/request-contracts.test.ts

### features/trash/table-adapter.ts (362 lines)
- exports (1): createTableTrashAdapter
- tables touched: trashed_items
- lock keys: 85: const lockRow = ({ workspaceId, entityId }: { workspaceId: string; entityId: string }, _optional = {}) => kernel().lockKey(`trash:${entry.entityType}:
- flags: sql``
- npm/@jini-ai imports: @jini-ai/cms/trash, kysely, moved
- same-folder imports: features/trash/db-port.ts, features/trash/entry-sql.ts, features/trash/registry.ts
- imports leaving the folder: platform/db/content-database.generated.ts
- prod importers (1): features/trash/index.ts
- test importers (15): assistant/__tests__/tool-registrations.trash-item.test.ts, features/trash/__tests__/email-template-trash-flow.test.ts, features/trash/__tests__/follow-ups.test.ts, features/trash/__tests__/form-adapter.test.ts, features/trash/__tests__/form-trash-flow.test.ts, features/trash/__tests__/member-adapter.test.ts, features/trash/__tests__/menu-trash-flow.test.ts, features/trash/__tests__/move-to-trash.test.ts, features/trash/__tests__/sweeper.test.ts, features/trash/__tests__/table-adapter.dialects.test.ts, features/trash/__tests__/table-adapter.test.ts, features/trash/__tests__/term-trash-flow.test.ts, features/trash/__tests__/trash-item-user.test.ts, features/trash/__tests__/widget-trash-flow.test.ts, server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts

### features/trash/registry.ts (365 lines)
- exports (9): TrashMarkerSpec, TrashDisplaySpec, TrashDisplayJoin, TrashCascadeSpec, TrashBlockerSpec, TrashHiddenWithParentSpec, TrashEntry, TrashRegistry, buildTrashRegistry
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/trash, Red
- same-folder imports: -
- imports leaving the folder: -
- prod importers (10): features/trash/agent-tools.ts, features/trash/entry-sql.ts, features/trash/index.ts, features/trash/move-to-trash.ts, features/trash/not-trashed.ts, features/trash/permissions.ts, features/trash/table-adapter.ts, features/trash/tool-registrations.ts, features/trash/trash-item-tool.ts, server/runtime/composition/peer-site-reads.ts
- test importers (21): apps/admin/src/features/trash/__tests__/rules.unit.test.ts, assistant/__tests__/tool-registrations.trash-item.test.ts, features/trash/__tests__/email-template-trash-flow.test.ts, features/trash/__tests__/follow-ups.test.ts, features/trash/__tests__/form-adapter.test.ts, features/trash/__tests__/form-trash-flow.test.ts, features/trash/__tests__/member-adapter.test.ts, features/trash/__tests__/menu-trash-flow.test.ts, features/trash/__tests__/move-to-trash.test.ts, features/trash/__tests__/not-trashed.test.ts, features/trash/__tests__/sweeper.test.ts, features/trash/__tests__/table-adapter.dialects.test.ts, features/trash/__tests__/table-adapter.test.ts, features/trash/__tests__/term-trash-flow.test.ts, features/trash/__tests__/tool-registrations.test.ts, features/trash/__tests__/trash-item-user.test.ts, features/trash/__tests__/user-adapter.test.ts, features/trash/__tests__/widget-trash-flow.test.ts, server/__tests__/b07-trash-handler-gaps.test.ts, server/inbound/admin-http/routes/trash/__tests__/request-contracts.test.ts, server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts

### features/trash/entry-sql.ts (83 lines)
- exports (5): loose, qualified, EntitySnapshotRow, readLiveSnapshot, entryWhere
- re-exports: {LooseTables, LooseExpressionBuilder} from ./entry-sql.types.js
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/trash, kysely
- same-folder imports: features/trash/entry-sql.types.ts, features/trash/not-trashed.ts, features/trash/registry.ts
- imports leaving the folder: platform/db/content-database.generated.ts, platform/db/content-kernel.ts
- prod importers (6): features/trash/adapters/marker-sql.ts, features/trash/adapters/post.ts, features/trash/adapters/redirect.ts, features/trash/move-to-trash.ts, features/trash/table-adapter.ts, features/trash/trash-item-tool.ts
- test importers (2): features/trash/__tests__/table-adapter.dialects.test.ts, features/trash/__tests__/table-adapter.test.ts

### features/trash/entry-sql.types.ts (9 lines)
- exports (2): LooseTables, LooseExpressionBuilder
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: kysely
- same-folder imports: -
- imports leaving the folder: -
- prod importers (2): features/trash/entry-sql.ts, features/trash/not-trashed.ts
- test importers (0): -

### features/trash/not-trashed.ts (117 lines)
- exports (3): TrashCondition, notTrashed, isTrashedRecord
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/trash, kysely
- same-folder imports: features/trash/entry-sql.types.ts, features/trash/registry.ts
- imports leaving the folder: -
- prod importers (2): features/trash/entry-sql.ts, features/trash/index.ts
- test importers (1): features/trash/__tests__/not-trashed.test.ts

### features/trash/db-port.ts (19 lines)
- exports (1): TrashDb
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: -
- imports leaving the folder: platform/db/content-kernel.ts
- prod importers (5): features/trash/adapters/member.ts, features/trash/index.ts, features/trash/move-to-trash.ts, features/trash/table-adapter.ts, features/trash/trash-item-tool.ts
- test importers (0): -

### features/trash/ports.ts (61 lines)
- exports (3): TRASH_RETENTION_DAYS, RemoveEntity, TransactionRunner
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/trash
- same-folder imports: -
- imports leaving the folder: -
- prod importers (3): features/trash/index.ts, features/trash/repo.sqlite.ts, features/trash/widget-removal.ts
- test importers (1): features/trash/__tests__/member-adapter.test.ts

### features/trash/adapters/marker-sql.ts (147 lines)
- exports (7): MarkerStore, lazyKernel, MarkerPredicate, MarkerFlipSpec, flipMarker, CompareAndDeleteSpec, compareAndDelete
- tables touched: -
- lock keys: -
- flags: sql``
- npm/@jini-ai imports: @jini-ai/cms/trash, kysely
- same-folder imports: -
- imports leaving the folder: features/trash/entry-sql.ts, platform/db/content-database.generated.ts, platform/db/content-kernel.ts
- prod importers (5): features/trash/adapters/comment.ts, features/trash/adapters/media.ts, features/trash/adapters/post.ts, features/trash/adapters/redirect.ts, features/trash/adapters/user.ts
- test importers (1): features/trash/__tests__/marker-sql.test.ts

### features/trash/adapters/comment.ts (74 lines)
- exports (2): COMMENT_ENTITY_TYPE, createCommentTrashAdapter
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/comments, @jini-ai/cms/trash
- same-folder imports: features/trash/adapters/marker-sql.ts
- imports leaving the folder: -
- prod importers (4): features/trash/agent-tools.ts, features/trash/index.ts, features/trash/permissions.ts, features/trash/trash-item-tool.ts
- test importers (1): features/trash/__tests__/comment-adapter.test.ts

### features/trash/adapters/post.ts (91 lines)
- exports (2): POST_ENTITY_TYPE, createPostTrashAdapter
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/trash, @jini-ai/db/kernel
- same-folder imports: features/trash/adapters/marker-sql.ts
- imports leaving the folder: features/trash/entry-sql.ts
- prod importers (4): features/trash/agent-tools.ts, features/trash/index.ts, features/trash/permissions.ts, features/trash/trash-item-tool.ts
- test importers (9): features/post/__tests__/post.trashed-slug-release.test.ts, features/trash/__tests__/marker-adapters.dialects.test.ts, features/trash/__tests__/post-delete-undo-index.test.ts, features/trash/__tests__/post-trash-media-evidence.integration.test.ts, features/trash/__tests__/record-store-adapter.purge.test.ts, features/trash/__tests__/trash.contract.test.ts, server/__tests__/assistant-byok-routes.test.ts, server/inbound/admin-http/routes/trash/__tests__/page-display-kind.integration.test.ts, server/runtime/composition/modules/__tests__/assistant-tool-exec.integration.test.ts

### features/trash/adapters/redirect.ts (73 lines)
- exports (2): REDIRECT_ENTITY_TYPE, createRedirectTrashAdapter
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/trash
- same-folder imports: features/trash/adapters/marker-sql.ts
- imports leaving the folder: features/redirects/index.ts, features/trash/entry-sql.ts
- prod importers (4): features/trash/agent-tools.ts, features/trash/index.ts, features/trash/permissions.ts, features/trash/trash-item-tool.ts
- test importers (2): features/trash/__tests__/marker-adapters.dialects.test.ts, features/trash/__tests__/trash.contract.test.ts

### features/trash/adapters/media.ts (95 lines)
- exports (3): MEDIA_ENTITY_TYPE, MediaTrashAdapterDeps, createMediaTrashAdapter
- tables touched: media
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/media, @jini-ai/cms/trash
- same-folder imports: features/trash/adapters/marker-sql.ts
- imports leaving the folder: -
- prod importers (4): features/trash/agent-tools.ts, features/trash/index.ts, features/trash/permissions.ts, features/trash/trash-item-tool.ts
- test importers (3): features/media/__tests__/library-persistence.test.ts, features/trash/__tests__/marker-adapters.dialects.test.ts, server/inbound/admin-http/routes/trash/__tests__/request-contracts.test.ts

### features/trash/adapters/member.ts (64 lines)
- exports (1): createMemberTrashAdapter
- tables touched: member_magic_tokens, member_sessions, members
- lock keys: -
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/trash
- same-folder imports: -
- imports leaving the folder: features/trash/db-port.ts
- prod importers (1): server/runtime/composition/deps.ts
- test importers (2): features/trash/__tests__/member-adapter.test.ts, server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts

### features/trash/adapters/user.ts (228 lines)
- exports (3): USER_ENTITY_TYPE, UserTrashAdapterDeps, createUserTrashAdapter
- tables touched: identity_users, outbox_events, principals, sessions
- lock keys: 98: await k.lockKey(`trash:${USER_ENTITY_TYPE}:${workspaceId}:${principalId}`);
- flags: tovu-text
- npm/@jini-ai imports: @jini-ai/cms/trash, @jini-ai/core/contracts/events
- same-folder imports: features/trash/adapters/marker-sql.ts
- imports leaving the folder: features/identity/user-purge-types.ts, platform/db/content-kernel.ts, platform/db/repos/outbox-repo.ts
- prod importers (3): features/trash/index.ts, features/trash/permissions.ts, features/trash/trash-item-tool.ts
- test importers (4): features/trash/__tests__/account-protections.test.ts, features/trash/__tests__/user-adapter.dialects.test.ts, features/trash/__tests__/user-adapter.test.ts, server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts

### features/trash/adapters/directory.ts (253 lines)
- exports (4): DirectoryTrashLocation, DirectoryTrashAdapterDeps, unhideIfRemoveThrows, createDirectoryTrashAdapter
- tables touched: -
- lock keys: -
- flags: console, node:
- npm/@jini-ai imports: @jini-ai/cms/trash, @jini-ai/core/model-facing-tool-errors, node:crypto, node:fs/promises, node:path
- same-folder imports: -
- imports leaving the folder: -
- prod importers (1): features/trash/index.ts
- test importers (1): features/trash/__tests__/directory-adapter.test.ts

### features/trash/adapters/plugin.ts (1 lines)
- exports (1): PLUGIN_ENTITY_TYPE
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: -
- imports leaving the folder: -
- prod importers (2): features/trash/index.ts, features/trash/permissions.ts
- test importers (0): -

### features/trash/adapters/theme.ts (3 lines)
- exports (1): THEME_ENTITY_TYPE
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: -
- imports leaving the folder: -
- prod importers (3): features/trash/index.ts, features/trash/permissions.ts, features/trash/trash-item-tool.ts
- test importers (0): -

## Test files that import a file of this sheet (blob-guard each before editing)
| test | lines | blob |
|---|---|---|
| features/trash/__tests__/repo.contract.test.ts | 253 | 3345e93a9d6853648ecea1ce7169b6c01829c0bd |
| assistant/__tests__/tool-registrations.trash-item.test.ts | 707 | d9000adee0070a2ec8c586611a3a7157eb3281ad |
| features/post/__tests__/post.trashed-slug-release.test.ts | 241 | 37b8db7568e65d71b3bd5169fe394ab2121fc900 |
| features/trash/__tests__/email-template-trash-flow.test.ts | 103 | c88d5214ba71323cef2f76ab77d4b8277e7128e9 |
| features/trash/__tests__/follow-ups.test.ts | 416 | 5540b4a8b6c01b229ff24f1b10ec94a0dba2e575 |
| features/trash/__tests__/form-adapter.test.ts | 259 | cdb7823f14c8d590793334e5f243e84be1e7617a |
| features/trash/__tests__/form-trash-flow.test.ts | 276 | 79d68a44af728c452ace95878c2d32885724fbcf |
| features/trash/__tests__/member-adapter.test.ts | 369 | f2658334970b73a7790ffe38f1f7967fdebbf336 |
| features/trash/__tests__/menu-trash-flow.test.ts | 215 | 88769f2773be1273afe16b3ba4b5f790897db91b |
| features/trash/__tests__/move-to-trash.test.ts | 305 | 62c81682e1cb78820393e3935b5317b5f14d21de |
| features/trash/__tests__/on-changed.contract.test.ts | 268 | 45d3cb8d55666c78b84947967e37d9eb9a4cfc31 |
| features/trash/__tests__/post-delete-undo-index.test.ts | 233 | a958211a07948ba7acf287f276349caf2e432fd9 |
| features/trash/__tests__/prior-marker.contract.test.ts | 167 | f42b70aafecb362adbc8c83f7769d3831aed0071 |
| features/trash/__tests__/sweeper.test.ts | 295 | 4caf6fe817fe8709772ded346425ec37116b50e2 |
| features/trash/__tests__/table-adapter.test.ts | 794 | c7d06692fb0feb83af3df671fe5cc2a23f4cf4cf |
| features/trash/__tests__/term-trash-flow.test.ts | 372 | 2540cbc7d7a608c0dd9b9cc2f7080dbe031a22ad |
| features/trash/__tests__/transaction-runner.test.ts | 59 | e7573b4dde4e1fd293ab31bd5078b3fb85e44c9a |
| features/trash/__tests__/trash.contract.test.ts | 454 | 7bb102723b7f2ca8da2d9f3b14758547ac27e389 |
| features/trash/__tests__/user-adapter.test.ts | 439 | ff290189d5ea5e12890242da7a4a48bb100f3c7c |
| features/trash/__tests__/widget-trash-flow.test.ts | 364 | 4df3687c01af0b972af3239ff81714f3e716be3b |
| server/inbound/admin-http/routes/trash/__tests__/page-display-kind.integration.test.ts | 122 | b81375b5dd628070b344f427bf3ad90ab3773e12 |
| server/inbound/admin-http/routes/trash/__tests__/request-contracts.test.ts | 219 | e556239a0e976b29588907707416be8efb8d62b8 |
| features/trash/__tests__/table-adapter.dialects.test.ts | 260 | c60bbaf51895774cc606ab2fdc53d60047f4bb20 |
| features/trash/__tests__/trash-item-user.test.ts | 185 | aff47f602ca138a340175d2f10859305caa0ce32 |
| server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts | 262 | 17653b0d2fb31b7dce2eff9f68b83e80a40ddaad |
| apps/admin/src/features/trash/__tests__/rules.unit.test.ts | 226 | 5b207d0a9083811f26d16f0a5ec10ec65d29d7d2 |
| features/trash/__tests__/not-trashed.test.ts | 43 | bbe1d9624f39cc111e80808e7aa91ea7517b8e53 |
| features/trash/__tests__/tool-registrations.test.ts | 451 | fe1bec18447f64dad0e5177bb03ca8b3cc14bf89 |
| server/__tests__/b07-trash-handler-gaps.test.ts | 208 | 910a96151034e562cab1c3e83fa13d2ebf4832ff |
| features/trash/__tests__/marker-sql.test.ts | 29 | 4163d97a7f408b5d38671eeb5c9f9002e97b4bb4 |
| features/trash/__tests__/comment-adapter.test.ts | 44 | 33d6227d21a9d8a4beb3d8ee2f0e78c51bec55e7 |
| features/trash/__tests__/marker-adapters.dialects.test.ts | 238 | ef55b6c94795109966a28b8b2ab2c5a12bf595ea |
| features/trash/__tests__/post-trash-media-evidence.integration.test.ts | 47 | 9b3738cb51923a92c03e1f9a9680e9ffb4230f86 |
| features/trash/__tests__/record-store-adapter.purge.test.ts | 98 | 88f1429c07e997bf95f82c74f6715be2711ec0b0 |
| server/__tests__/assistant-byok-routes.test.ts | 1433 | 71b4271d7772dcd6bf75ee95a7862470acb0ffc2 |
| server/runtime/composition/modules/__tests__/assistant-tool-exec.integration.test.ts | 232 | bcf51a5c98711eccb4310c6ac8adec9794f70733 |
| features/media/__tests__/library-persistence.test.ts | 72 | da41feb5a32fa9473f10b1ce31d0cf546e1d6ece |
| features/trash/__tests__/account-protections.test.ts | 48 | e20289fe76ff479b39936eb2f7fe6f2f31888ba7 |
| features/trash/__tests__/user-adapter.dialects.test.ts | 159 | 1e0a44cf78630b894463e2ee8ed54d352bbaa4b7 |
| features/trash/__tests__/directory-adapter.test.ts | 357 | 032f19b6374b99bbd51bbea270fe23f3e278df53 |

## vi.mock / vi.doMock / importActual sites that name a file of this sheet (lesson 2: mock factories are consumers)
- none found by pattern (re-check with the census at execution)

## Path-keyed baselines / configs that name a file of this sheet (lesson 10: debt does not follow moved code silently)
- development/scripts/check-architecture.baseline.json: `src/features/trash/adapters/redirect.ts` at lines 432 (1 hits)
- development/scripts/check-architecture.baseline.json: `src/features/trash/adapters/user.ts` at lines 433 (1 hits)
- development/scripts/size-debt.json: `src/features/trash/table-adapter.ts` at lines 1307 (1 hits)
- development/scripts/size-debt.json: `src/features/trash/adapters/user.ts` at lines 1300 (1 hits)

## Census command (run from the Tovu clone root; every hit must be listed above)
```
rg -n --no-heading -e 'comment|db\-port|directory|entry\-sql|entry\-sql\.types|marker\-sql|media|member|not\-trashed|plugin|ports|post|redirect|registry|repo|repo\.sqlite|table\-adapter|theme|user' apps development scripts --glob '!**/node_modules/**' -g '*.ts' -g '*.tsx' -g '*.json' -g '*.mjs' -g '*.cjs' | rg 'adapters|trash'
```
