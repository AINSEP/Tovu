# S1w-workspace-sql — machine-verified facts (generated; do not hand-edit)

Source: Tovu tree at `LANE_ROOT` (ref `integ/merge-final-2026-11-16`) @ `232764af5`. Regenerate: `LANE_ROOT=<tovu clone> python3 scripts/inv.py && LANE_ROOT=<tovu clone> python3 scripts/rep.py && LANE_ROOT=<tovu clone> python3 scripts/facts.py [<out dir>]`. Blobs are `git hash-object` of that tree; a sheet executor re-checks every blob (COMMON STOP-on-mismatch).

Files: 2, 116 lines (tests not counted).

## Files
| path (under apps/website/src) | lines | blob | CLASSIFY label | audit row | existing sheet/design mention | prod importers | test importers |
|---|---|---|---|---|---|---|---|
| features/workspace/repo.ts | 101 | 637d6c262153d395842e84cd1fa3b4303e81fbf4 | MOVE | - | w1-sheets-d:move-workspace.gen.md;w1-sheets-d:move-workspace.md | 1 | 2 |
| features/workspace/repo.sqlite.ts | 15 | 5847bf86dfa0237f25a728b603ac7638ecc1289d | - | - | w1-sheets-d:move-workspace.gen.md;w1-sheets-d:move-workspace.md | 1 | 1 |

## Per file: exports, tables, lock keys, imports that leave the folder, importers

### features/workspace/repo.ts (101 lines)
- exports (2): SqlWorkspaceRepo, workspaceRepoFor
- tables touched: workspaces
- lock keys: 92: await this.kernel.lockKey("workspace:roster");
- flags: -
- npm/@jini-ai imports: @jini-ai/cms/workspace, @jini-ai/core/optimistic-concurrency, kysely
- same-folder imports: -
- imports leaving the folder: platform/db/content-database.generated.ts, platform/db/content-kernel.ts
- prod importers (1): features/workspace/repo.sqlite.ts
- test importers (2): features/workspace/__tests__/repo.dialects.test.ts, features/workspace/__tests__/workspace.lost-update.test.ts

### features/workspace/repo.sqlite.ts (15 lines)
- exports (1): SqliteWorkspaceRepo
- tables touched: -
- lock keys: -
- flags: -
- npm/@jini-ai imports: -
- same-folder imports: features/workspace/repo.ts
- imports leaving the folder: platform/db/content-kernel.ts, platform/db/sqlite/content-db.ts
- prod importers (1): features/workspace/index.ts
- test importers (1): features/workspace/__tests__/integration/repo.sqlite.integration.test.ts

## Test files that import a file of this sheet (blob-guard each before editing)
| test | lines | blob |
|---|---|---|
| features/workspace/__tests__/repo.dialects.test.ts | 52 | 8b7172a77b11542f7e0255c942be0eaeaf8701e3 |
| features/workspace/__tests__/workspace.lost-update.test.ts | 29 | 3016143f1e6db4316c6ecbe06aaa3e96334b4b76 |
| features/workspace/__tests__/integration/repo.sqlite.integration.test.ts | 150 | 3f718844672ee7be72c28bd305aef926b9a27f66 |

## vi.mock / vi.doMock / importActual sites that name a file of this sheet (lesson 2: mock factories are consumers)
- none found by pattern (re-check with the census at execution)

## Path-keyed baselines / configs that name a file of this sheet (lesson 10: debt does not follow moved code silently)
- development/scripts/write-path-inventory.baseline.json: `src/features/workspace/repo.sqlite.ts` at lines 964 (1 hits)

## Census command (run from the Tovu clone root; every hit must be listed above)
```
rg -n --no-heading -e 'repo|repo\.sqlite' apps development scripts --glob '!**/node_modules/**' -g '*.ts' -g '*.tsx' -g '*.json' -g '*.mjs' -g '*.cjs' | rg 'workspace'
```
