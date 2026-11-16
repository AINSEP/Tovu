id: MV-workspace-1   (template T-MOVE, MOVE-AFTER; written 2026-11-16 from Tovu b28d38c6 / Jini b7666092, refactor/terra; skeleton: move-workspace.gen.md)
feature: website/features/workspace (only `repo.ts` is in the backlog row)
STATUS: BLOCKED on a PRECONDITION (not an owner decision): untangle C3 must land first. Then an Opus pass (~20k) pins the exact post-C3 type names in `jini_code` below (marked CHECK-AFTER-C3) and flips this to ready. Every design choice is already made here.
kind_check: MOVE confirmed (no React/Express/env/console), but it is a Kysely SQL adapter, so it follows the C3 "domain SQL adapter subpath" rule (C3.md decision A / D6): the adapter lives in cms behind the existing neutral `WorkspaceRepoPort`, imports only its own package, `@jini-ai/core` and the third-party `kysely` (already a cms optional peer, packages/cms/package.json:141; not a new dependency), never `@jini-ai/db`. Today's sibling pattern (`cms/src/redirects/sql/repo.ts:1`) still imports `StorageKernel` from `@jini-ai/db/kernel`, which COMMON rule 5 forbids for new code; C3.repoint.tsv:143 rewrites it to `@jini-ai/core/contracts/storage` `StorageKernel<Kysely<X>, X>`. Writing the workspace adapter before C3 would either break rule 5 or invent the contract. Hence the precondition.
untangle_overlap: none on these Tovu files (no *.repoint.tsv row on features/workspace/repo.ts, repo.sqlite.ts or the two tests). Dependency (not overlap): C3 (wave B) creates `@jini-ai/core/contracts/storage`.
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base

precondition: C3 landed: `rg -n "export (interface|type) StorageKernel" {JINI_CLONE}/packages/core/src/contracts/storage` prints a line AND `rg -n "@jini-ai/core/contracts/storage" {JINI_CLONE}/packages/cms/src/redirects/sql/repo.ts` prints a line AND `rg -n "storageAdapters" {JINI_CLONE}/packages/cms/package.json` shows a glob that covers `src/workspace/sql/**` (C3 D6 gate); else SKIPPED "precondition not landed".
tovu_files:
  - apps/website/src/features/workspace/repo.ts | blob 637d6c262153d395842e84cd1fa3b4303e81fbf4 | delete
  - apps/website/src/features/workspace/repo.sqlite.ts | blob 5847bf86dfa0237f25a728b603ac7638ecc1289d | keep-reduced (becomes the Tovu binding, same shape as features/redirects/repo.sqlite.ts)
tovu_tests:
  - apps/website/src/features/workspace/__tests__/repo.dialects.test.ts | blob 8b7172a77b11542f7e0255c942be0eaeaf8701e3 | keep-repointed (it runs Tovu's dialect matrix `#src/platform/db/kernel/__tests__/dialect-matrix`; it cannot move to Jini)
  - apps/website/src/features/workspace/__tests__/workspace.lost-update.test.ts | blob 3016143f1e6db4316c6ecbe06aaa3e96334b4b76 | keep-repointed (also imports Tovu `toAdminWorkspaceResponse`)
jini_target: cms NEW subpath ./workspace/sql (runtime node, like ./redirects/sql at package.json:51) NEW files packages/cms/src/workspace/sql/repo.ts + packages/cms/src/workspace/sql/index.ts
jini_guards:
  - packages/cms/src/workspace/sql must not exist
  - packages/cms/package.json: re-take the blob after wave B (C3 edits it); guard by TEXT instead: the line `      "./redirects/sql": "node",` occurs once and `rg -n '"./workspace/sql"' packages/cms/package.json` prints nothing
  - packages/cms/README.md blob a604eb8ec382cc0819305ed0939995519ed1157b (re-take after wave B if C3 changed it)
  - rg -n "SqlWorkspaceRepo|workspaceRepoFor|WorkspacesTable|WorkspaceSqlRequired" packages/cms/src -> prints nothing
decisions (binding for the filler and the executor):
  D1 Shape: `new SqlWorkspaceRepo({ kernel, tables }, _optional = {})` and `workspaceRepoFor(required, _optional = {})`, exactly like `SqlRedirectRepo`/`redirectRepoFor` (cms/src/redirects/sql/repo.ts:25-38, :206). `tables: { workspaces: string }` is host-owned (redirects: "No schema or product table defaults live in the adapter"). Tovu passes `{ workspaces: "workspaces" }`.
  D2 Row type: Jini declares `WorkspacesTable { id: string; name: string; slug: string; created_at: string; version: number }` in repo.ts (copied from the Tovu generated column set; no Generated columns, so `Selectable<…>` is dropped and `toRecord` takes `WorkspacesTable`). Every query uses `db.withTables<Record<string, WorkspacesTable>>().<op>(this.tables.workspaces)` as redirects does (repo.ts:46).
  D3 The roster lock key `"workspace:roster"` moves into Jini as a non-exported module constant `ROSTER_LOCK_KEY` (it is the workspace domain's own coordination name, not persisted data or product text; `rg -n "workspace:roster" apps` finds only repo.ts:92).
  D4 Bodies verbatim otherwise: insert/findBySlug/findById/list/update (incl. the expectedVersion branch and `assertVersionedWrite` from `@jini-ai/core/optimistic-concurrency`, already a core subpath)/delete/transaction; the why-comments ("Match the editor's basis…", the 5-line transaction doc, "SPEC-044 REQ-08" tags dropped as Tovu spec pointers, "(v1 always has exactly one — see `delete.ts`'s header)" kept: Jini also has workspace/delete.ts).
  D5 Header (neutral): "@file THE workspace repository: one Kysely query body for every database the storage kernel drives (SQLite, PGlite, Postgres). Satisfies `WorkspaceRepoPort`, the same port as `../repo.memory.ts`. Every statement goes through `kernel.run`; table names are host-owned." (drops "storage plan §4, ADR-066, ADR-006", "repo.sqlite.ts is the thin subclass").
  D6 Port import: `import type { WorkspaceRecord, WorkspaceRepoPort } from "../create.js";` (leaf file, cms/src/workspace/create.ts exports both: workspace/index.ts:7-20).
  D7 Kernel type: `kernel: StorageKernel<Kysely<unknown>, unknown>` from `@jini-ai/core/contracts/storage` + `import type { Kysely } from "kysely";` — CHECK-AFTER-C3: copy the exact generic spelling the landed redirects/sql/repo.ts uses for `RedirectSqlRequired["kernel"]`.
jini_code (CHECK-AFTER-C3 fills it from D1-D7; ~95 lines; the filler must paste the complete text here before the job runs)
jini_index: NEW packages/cms/src/workspace/sql/index.ts: `export { SqlWorkspaceRepo, workspaceRepoFor, type WorkspacesTable, type WorkspaceTables, type WorkspaceSqlRequired } from "./repo.js";`
entry:
  exports_after: the `"./redirects/sql": { … }` block (package.json:330-334 at b7666092); insert `"./workspace/sql": { "types": "./dist/workspace/sql/index.d.ts", "import": "./dist/workspace/sql/index.js", "default": "./dist/workspace/sql/index.js" },`
  runtime: node -> after `      "./redirects/sql": "node",` insert `      "./workspace/sql": "node",`
  optional_peers_text: - (kysely's optional-peer text already covers "sql storage adapters")
  readme_append_after: the `./widgets/html` row of the Layers table; readme_text: "| `./workspace/sql` | node | Kysely `WorkspaceRepoPort` adapter (`workspaceRepoFor`); the host supplies the kernel and table name. |"
symbol_map:
  - SqlWorkspaceRepo -> @jini-ai/cms/workspace/sql SqlWorkspaceRepo (args: (kernel) -> ({ kernel, tables }, _optional = {}))
  - workspaceRepoFor -> @jini-ai/cms/workspace/sql workspaceRepoFor (args: (kernel) -> ({ kernel, tables }, _optional = {}))
values_injected:
  - table name "workspaces" -> required.tables.workspaces (Tovu passes "workspaces")
tovu_reduced: |
  apps/website/src/features/workspace/repo.sqlite.ts becomes (exact text):
  ----8<----
import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlWorkspaceRepo, type WorkspaceSqlRequired } from "@jini-ai/cms/workspace/sql";

/** Tovu owns the persisted table name. */
export const WORKSPACE_TABLES = { workspaces: "workspaces" } as const;

/**
 * @file The workspace repo on a site's SQLite `content.db`. The one Kysely query body lives in Jini
 * `@jini-ai/cms/workspace/sql` (`SqlWorkspaceRepo`); this named class keeps the composition root
 * that builds it from the content db handle as it is.
 */
export class SqliteWorkspaceRepo extends SqlWorkspaceRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    // Erase the host schema only: Jini supplies each query's table view on this same kernel.
    super({ kernel: contentKernel({ store }) as unknown as WorkspaceSqlRequired["kernel"], tables: WORKSPACE_TABLES });
  }
}
  ----8<----
importer_edits:
  - __tests__/repo.dialects.test.ts: "import { workspaceRepoFor } from \"../repo.js\";" -> "import { workspaceRepoFor, type WorkspaceSqlRequired } from \"@jini-ai/cms/workspace/sql\";" and "{ tables: [\"workspaces\"], make: workspaceRepoFor }" -> "{ tables: [\"workspaces\"], make: (kernel) => workspaceRepoFor({ kernel: kernel as unknown as WorkspaceSqlRequired[\"kernel\"], tables: { workspaces: \"workspaces\" } }) }"
  - __tests__/workspace.lost-update.test.ts: "import { SqlWorkspaceRepo } from \"../repo.js\";" -> "import { SqlWorkspaceRepo, type WorkspaceSqlRequired } from \"@jini-ai/cms/workspace/sql\";" and "make: (kernel) => new SqlWorkspaceRepo(kernel) }" -> "make: (kernel) => new SqlWorkspaceRepo({ kernel: kernel as unknown as WorkspaceSqlRequired[\"kernel\"], tables: { workspaces: \"workspaces\" } }) }"
  (Only the factory argument shape changes; every assertion stays. The test-side cast is the same host-schema erasure the binding uses.)
census:
  cmd: python3 scripts/census.py {TOVU_CLONE} apps/website/src/features/workspace/repo.ts
  allowed: [apps/website/src/features/workspace/__tests__/repo.dialects.test.ts:7, apps/website/src/features/workspace/__tests__/workspace.lost-update.test.ts:6, apps/website/src/features/workspace/repo.sqlite.ts:3]
baselines: development/scripts/write-path-inventory.baseline.json:982 names `src/features/workspace/repo.sqlite.ts` (the file stays; its write sites move to Jini, so the inventory will report them "disappeared"): remove every object whose `"file"` is `src/features/workspace/repo.sqlite.ts` or `src/features/workspace/repo.ts` (`rg -n '"file": "src/features/workspace/repo' development/scripts/write-path-inventory.baseline.json` lists them; record the count), then JSON.parse check.
changeset: cms: minor | "Add `@jini-ai/cms/workspace/sql`: the Kysely `WorkspaceRepoPort` adapter (`workspaceRepoFor`, `SqlWorkspaceRepo`) with host-owned table names."
jini_msg: "feat(cms): add workspace/sql Kysely repository adapter" | tovu_msg: "refactor(workspace): use @jini-ai/cms/workspace/sql for the SQL workspace repo"
Commits: Jini 5 paths (repo.ts, index.ts, package.json, README.md, changeset). Tovu 5 paths (deleted repo.ts, repo.sqlite.ts, 2 tests, write-path baseline).
Cloud run owes: cms typecheck/build + subpath isolation + L8 storage-adapter gate; Tovu typecheck + the 2 dialect tests on SQLite and PGlite. No RED test (pure move).
est_executor_tokens: ~40k Sonnet (+ ~20k Opus to finish jini_code after C3)
