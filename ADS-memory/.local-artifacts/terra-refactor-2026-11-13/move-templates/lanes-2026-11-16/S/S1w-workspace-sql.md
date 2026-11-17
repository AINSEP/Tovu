# S1w (revision 3, new) — workspace SQL repo -> `@jini-ai/cms/workspace/sql`. Calibration run of T-SQLREPO.

Template: T-SQLREPO rev 3. Facts: `S1w-workspace-sql.facts.md` (2 files, 116 lines, 3 test files).
**Why this sheet exists (Opus review P4, coordinator decision 4).** Revision 2 sent this move to `sheets/move-workspace.md`
on `plan/w1-sheets-d`. That sheet exists (origin `AINSEP/Tovu`, not in the terra clone's remotes, which is why the review
could not find it), and its blobs still equal merge-final. But it was written for the OLD `T-MOVE` template: it forbids
tests ("No RED test"), its `jini_code` is unfilled ("CHECK-AFTER-C3"; C3 has since landed), and its binding uses the
`as unknown as` cast that T-SQLREPO forbids. A calibration run of T-SQLREPO cannot use another template, so its decisions
D1-D7 are folded in here, adapted. `move-workspace.md` is superseded for lanes S/U; do not dispatch it.

```
id: S1w-workspace-sql (~90k; no cut point)
jini_target: cms NEW ./workspace/sql (node), files packages/cms/src/workspace/sql/{repo.ts,index.ts}
prerequisites: S0 DONE (P1 `workspace:roster`; P6). xpkg R6-R9 landed (cms manifest, wave 1). C3 landed:
successor_of: S0
```
```bash
# Jini; each prints ok
rg -q "export interface StorageKernel" packages/core/src/contracts/storage/kernel.ts && echo ok
rg -q "@jini-ai/core/contracts/storage" packages/cms/src/redirects/sql/repo.ts && echo ok
test ! -e packages/cms/src/workspace/sql && echo ok
```

## split
| Declaration (`features/workspace/repo.ts`, 101 lines) | Label | Where |
|---|---|---|
| `SqlWorkspaceRepo` (:19-96) | MOVE | `packages/cms/src/workspace/sql/repo.ts` |
| `workspaceRepoFor` (:99) | MOVE | same file; becomes `workspaceRepoFor(required, _optional = {})` |
| file header (:9-13) | MOVE, neutral | "THE workspace repository: one Kysely query body for every database the storage kernel drives. Satisfies `WorkspaceRepoPort`, the same port as `../repo.memory.ts`. Every statement goes through `kernel.run`; table names are host-owned." (drops the storage-plan / ADR pointers) |
| `repo.sqlite.ts` `SqliteWorkspaceRepo` | STAY-WIRING | wiring below |

Decisions (from move-workspace D1-D7, adapted to T-SQLREPO):
- D1 shape: `new SqlWorkspaceRepo({ kernel, tables }, _optional = {})` and `workspaceRepoFor({ kernel, tables }, _optional = {})`,
  exactly like `SqlRedirectRepo` (`packages/cms/src/redirects/sql/repo.ts:27-38`). `tables: { workspaces: string }`, no default.
- D2 row type: Jini-local `WorkspacesTable { id: string; name: string; slug: string; created_at: string; version: number }`
  in `repo.ts` (columns copied from the generated type in key order; S0-P6 compares). Every query uses
  `db.withTables<Record<string, WorkspacesTable>>().<op>(this.tables.workspaces)`.
- D3 the roster lock key `"workspace:roster"` (:92) moves as a non-exported module constant, byte-identical.
- D4 bodies verbatim: `insert`, `findBySlug`, `findById`, `list`, `update` (incl. the `expectedVersion` branch and
  `assertVersionedWrite` from `@jini-ai/core/optimistic-concurrency`), `delete`, `transaction`. Why-comments move
  (neutral wording); spec-ticket tags are dropped as Tovu pointers.
- D5 port import: today `repo.ts:4` imports `WorkspaceRecord, WorkspaceRepoPort` from `@jini-ai/cms/workspace`; in Jini it
  is the leaf `../create.js` (find it: `rg -n "export (interface|type) (WorkspaceRecord|WorkspaceRepoPort)\b" packages/cms/src/workspace`).
- D6 kernel type: `StorageKernel<Kysely<unknown>, unknown>` from `@jini-ai/core/contracts/storage`, spelled as
  `RedirectSqlRequired["kernel"]` is (`redirects/sql/repo.ts:27`).
- D7 `index.ts` (the subpath entry file, package convention for `*/sql`): named exports
  `SqlWorkspaceRepo, workspaceRepoFor, type WorkspacesTable, type WorkspaceTables, type WorkspaceSqlRequired`.

**port_compat (step 0).** `rg -n "interface WorkspaceRepoPort" -A20 packages/cms/src/workspace` vs the 7 methods above.
`insert(record)` and `update(record, optional)` are positional in the port: they keep the port's signature.
**tables.** `workspaces` only (facts "tables touched").
**lock_keys.** `workspace:roster` (S0-P1; Jini `lock-keys.test.ts`).
**Existing delete.** `delete({ id })` (:80, `workspaces`): the port method behind Jini `workspace/delete.ts`, which refuses
to delete the last workspace ("v1 always has exactly one"); moves verbatim. No Tovu production code calls it directly
(the command prints nothing on merge-final and must still print nothing after T1):
```bash
rg -n "workspaceRepo[A-Za-z]*\(\)?\.delete\(|workspaces\.delete\(" apps/website/src -g '*.ts' -g '!**/__tests__/**'
```

## characterization (T0, unmoved code, real kernel via the existing dialect matrix)
| Risk | Test | Mutation -> RED |
|---|---|---|
| Stale update overwrites | `update` with an old `expectedVersion`: the conflict error, row unchanged; without `expectedVersion`: last write wins (today) | drop the version predicate |
| Roster read-then-write not serialized | recording kernel: `transaction` -> `lockKey("workspace:roster")` -> first statement | remove the lock |
| Slug lookup | `findBySlug` exact match; unknown slug -> `null` | change the predicate |
| List order | three workspaces: today's order, pinned | change the `orderBy` |
The two existing tests (`__tests__/repo.dialects.test.ts`, `workspace.lost-update.test.ts`) stay in Tovu (they need the
dialect matrix) and are repointed in T1; `__tests__/integration/repo.sqlite.integration.test.ts` imports only the binding.

## wiring (T1)
`features/workspace/repo.sqlite.ts` becomes:
```ts
import { type ContentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlWorkspaceRepo } from "@jini-ai/cms/workspace/sql";

/** Tovu owns the persisted table name. */
export const WORKSPACE_TABLES = { workspaces: "workspaces" } as const;

/**
 * @file The workspace repo on a site's SQLite `content.db`. The one Kysely query body lives in Jini
 * `@jini-ai/cms/workspace/sql`; this named class keeps the composition root that builds it from the content db handle.
 */
export class SqliteWorkspaceRepo extends SqlWorkspaceRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super({ kernel: schemaErasedKernel({ store }), tables: WORKSPACE_TABLES }, {});
  }
}
```
(`schemaErasedKernel` comes from S0 commit K; if OD-8 is NO, the precedent cast is used and reported.)
Test repoints: `repo.dialects.test.ts` and `workspace.lost-update.test.ts` build the repo with
`workspaceRepoFor({ kernel: schemaErasedKernel({ store: kernel }), tables: WORKSPACE_TABLES })` (no test-side cast; if the
matrix kernel is not accepted by `schemaErasedKernel`, STOP and report the type). `features/workspace/repo.ts` is deleted.
Baseline: `development/scripts/write-path-inventory.baseline.json`: delete exactly the objects whose `"file"` is
`src/features/workspace/repo.ts` or `src/features/workspace/repo.sqlite.ts` (list them first:
`rg -n '"file": "src/features/workspace/repo' development/scripts/write-path-inventory.baseline.json`), never regenerate.

## commits / stops
T0 -> J1 (repo, index, manifest export block after `./redirects/sql` + `"./workspace/sql": "node"` in `jini.entries` +
README row + changeset `cms: minor`) -> T1. Gates: T-SQLREPO §5. This is the calibration: the report lists every
T-SQLREPO rule that was unclear or wrong, and the coordinator fixes T-SQLREPO before S1a.
- STOP: `workspace/delete.ts` or any caller would need an edit to compile (only the binding and the two tests change).
- STOP: the cms manifest already has `./workspace/sql` (another lane got there first).
Estimate: ~90k Sonnet (T0 ~35k, J1 ~30k, T1 ~25k).
