# Review: Jini `origin/cloud/notes-app-fix` → `origin/main`

Persona: `AI-Dev-Shop/agents/code-inspection/skills.md` (v1.4.2) loaded.

Branch head `a322a8b20`; merge base `35c4961af` (216 commits behind `origin/main` @ `bb44f52d6`, Jini 0.7.0).
Method: git objects only (`git show`, `git diff`, `git merge-tree`); no checkout. Nothing was built or run. Typecheck and tests on the merged tree were **not** run (see "Not verified").

## Verdict: MERGE-AFTER-FIXES

Counts: Required 2 · Recommended 5 · Low 4 · merge conflicts 0.

## Merge check

`git merge-tree --write-tree origin/main origin/cloud/notes-app-fix` → tree `36af5007`, **no textual conflicts**.
Semantic checks on the merged tree:
- `packages/core/package.json`: `exports` keys == `jini.entries` keys (the `settings-subpath-isolation.contract.test.ts:37` equality holds); `./contracts/server` sits beside main's `./contracts/oauth|content-types|hosted-mcp`.
- `packages/core/src/index.ts`: no diff vs main (root barrel untouched; P1-5 net effect is zero).
- Every subpath the example imports still exists on main (`@jini-ai/db/{sqlite,kernel/sqlite,data-modules}`, `@jini-ai/http-kit/rate-limit`, `@jini-ai/cms/{core,core/commands,entries,content-types,forms,forms/sql,forms/html-render}`, `@jini-ai/core/{primitives,text}`). `pnpm-workspace.yaml` on main already includes `examples/*`.
- Drift since the base that touches what the branch uses, read and judged non-breaking: `sourceIp` now reads back `null` instead of `""` (`repo.rows.ts`); `ContentTypeRecord` moved to `@jini-ai/core/contracts/content-types` and re-exported (same shape); `declareDataModule` now resolves the open SQLite file via `pragma_database_list`.

## Findings

### Required

1. **New cms → `@jini-ai/db` import fails main's cross-package gate.** `packages/cms/src/forms/sql/create-tables.ts:2 @ a322a8b20` imports `StorageDialect, StorageKernel` from `@jini-ai/db/kernel`. It is a new file (status A against the gate's pinned base `35c4961af`), so main's `pnpm check:cross-package` (`scripts/check-no-cross-package.ts`, `forbidden()` + `addedEdges()`) reports it as **XP1** (source) and **XP3** (the emitted `.d.ts` names `@jini-ai/db/kernel`). Owner rule: no package imports another except core. The report's P1-4 "existing pattern" argument does not hold for a *new* file — it adds a 7th cms→db occurrence (xpkg-plan row "cms → db 6/12").
   Fix (smallest, and matches the xpkg plan's "domain-local SQL kernel ports"): declare a local port in `create-tables.ts` and drop the import —
   `type FormsDdlKernel = { readonly dialect: "sqlite" | "postgres"; execute(statement: RawBuilder<unknown>): Promise<void> }` (kysely is third-party, allowed). `createFormsTables` uses only `kernel.dialect` and `kernel.execute`, and `StorageKernel<DB>` is structurally assignable to it, so callers don't change. Also reword the `@agent-note` at `:30-33`, which tells consumers to import `@jini-ai/db` paths (fine for apps, but keep it from reading as a package dependency).

2. **No changesets for two public additions.** Main uses `.changeset/` for every public surface change (e.g. `3a9fcc6c1`, `6c7a7857d`). Add: `@jini-ai/core` minor — new subpath `./contracts/server`; `@jini-ai/cms` minor — `createFormsTables` exported from `./forms/sql`.

### Recommended

3. **The forms dialect matrix lost its independent oracle.** `packages/cms/src/forms/__tests__/support/forms-tables.fixture.ts @ a322a8b20` used to hold the forms DDL copied from Tovu's real migrations (SQLite `0005/0071/0072`, Postgres baseline + `0006`); it now calls the production `createFormsTables`. The repo matrix (`repo.dialects.test.ts`) therefore tests the repos against the code-under-test's DDL, and nothing checks that `createFormsTables` produces the schema Tovu's databases actually have (expected value derived from the implementation). Column-by-column I found it does match today (same columns, types, nullability, defaults, index and FK names; SQLite FK is now named, which is harmless). Fix: restore the copied-DDL fixture for the matrix, and add one test in `create-tables.test.ts` comparing `createFormsTables` against it (`PRAGMA table_info`/`index_list` on SQLite, `information_schema.columns` + `pg_indexes` on PGlite).

4. **Contract leaves route precedence undefined.** `packages/core/src/contracts/server.ts:52-58 @ a322a8b20` specifies path syntax and duplicate registration, but not which route wins when a literal and a param pattern both match (`/notes/new` vs `/notes/:slug`). The example adapter uses registration order (`examples/notes-app/src/node-server.ts:111`); Express/Hono do the same, find-my-way (Fastify) prefers static. A package registering both behaves differently per adapter. Fix: one sentence in the contract — "when several patterns match, a pattern whose segment is literal beats `:name` at the first differing segment" (or "registration order"); pick one before this ships on npm, since narrowing it later is breaking.

5. **Align the contract with the xpkg plan before publishing.** The plan sketches `server.mount(daemon.routes())` (packages *return* routes; `xpkg-longterm-result.md:58,94`) and "server: lifecycle helpers against a supplied server contract" (`xpkg-plan-result.md:127,215`). This branch defines push-style `app.route({ method, path, handler })`, which matches the owner's 11-07 `{ app: Server }` decision. They are compatible if the registration object is a named type. Fix: `export type ServerRoute = { readonly method: ServerMethod; readonly path: string; readonly handler: ServerHandler }` and `route(requiredArgs: ServerRoute, …)`, so `routes(): readonly ServerRoute[]` can reuse it. Also: http-kit keeps its own Express-bound `HttpMethod` (lowercase) route spec (doc note at `server.ts:9-12`); the 11-10 "abstract Express out" work should converge onto this contract instead of adding a third vocabulary.

6. **Reference adapter flattens `Set-Cookie`.** `examples/notes-app/src/node-server.ts:76 @ a322a8b20`: `response.headers.forEach(... setHeader)` joins multiple `Set-Cookie` values into one comma-separated header, which breaks cookies. The contract's `@agent-note` (`server.ts:60-65`) points agents at this file as the model adapter, so the bug will be copied. Fix: `const cookies = response.headers.getSetCookie(); if (cookies.length) out.setHeader('set-cookie', cookies);` and skip `set-cookie` in the loop. (`:82` also ignores `write()` backpressure; acceptable in an example, worth a `drain` await if the file stays the reference.)

7. **Postgres truncates derived identifiers at 63 bytes.** `packages/cms/src/forms/sql/create-tables.ts:50-57 @ a322a8b20` builds names like `${s}_form_definition_id_${d}_id_fk` (58 chars with default names) and `idx_${s}_definition` / `idx_${s}_workspace` / `idx_${s}_ip_retention`. With longer host table names Postgres truncates silently; if two truncate to the same prefix, the second `CREATE INDEX IF NOT EXISTS` is skipped and an index is silently missing. Fix: throw a clear error when a derived name exceeds 63 bytes on Postgres (or document the limit in the `tables` param).

### Low

8. **Example mutations and PII endpoint have no guard.** `examples/notes-app/src/app.ts:68,102,133 @ a322a8b20`: `POST /notes`, `/notes/:slug/edit|publish` take no auth (a cross-site form POST from any page the owner visits works against `127.0.0.1:3000`), and `GET /api/forms/:slug/submissions` returns name/email/message unauthenticated (readable via DNS rebinding). README says localhost-only. Fix: reject requests whose `Host` is not `127.0.0.1:<port>`/`localhost:<port>` and POSTs whose `Origin` differs — a few lines in `node-server.ts`, and it teaches the right pattern.

9. **Contract doc points npm consumers at a file they don't have.** `server.ts:60-65` cites `examples/notes-app/src/node-server.ts`, which is not in the core tarball. Fix: say "Jini repo: examples/notes-app/…" or link the repo URL.

10. **Contract needs web globals.** `server.ts` names `Request`/`Response`; core's base `lib` is `ES2023` only, so consumers need `@types/node` or `lib: DOM`. Now confined to the subpath (root barrel unaffected). Fix: one line in the file header stating that requirement.

11. **Excess in the merge.** `cloud/reports/raw/notes-app-fix/*` (17 log files, ~300 lines) — main tracks `cloud/reports/*.md` but no `raw/` directory. Drop the raw logs (or keep them on the branch only). The example itself (~650 lines incl. tests/smoke) is proportionate; the `declareDataModule` "fake plugin" table (`db.ts`) is an acknowledged GAP, fine for a demo.

## Owner-rule scan

- Package imports (`packages/*` changes): only finding 1 (cms→db in non-test source). Test files importing `@jini-ai/db/kernel/*` and pglite/better-sqlite3 are exempt and already devDeps of cms.
- `core/contracts/server.ts`: interfaces/type aliases only, no imports → passes main's XP4 (types-only statements, empty emitted JS).
- No framework in Jini: none; the Node `http` adapter lives in `examples/`.
- Args `(requiredObj, optionalObj)`: `createFormsTables`, `ServerHandler`, `Server.route` and the example helpers comply.
- No lazy imports; example deps declared in its `package.json`.
- `args-convention.typecheck.ts` additions follow the file's existing top-level pattern; `!dist/**/*.typecheck.*` keeps it out of the tarball.

## Public API impact (npm)

Additive only: new subpath `@jini-ai/core/contracts/server` (types), new export `createFormsTables` from `@jini-ai/cms/forms/sql` (already a `node` subpath with `kysely`/`@jini-ai/db` as optional peers). Nothing removed or renamed on main: the `./server` subpath and the root-barrel line existed only inside the branch history. Findings 4 and 5 should be settled before the first publish, because changing a published contract is breaking.

## Merge conflicts

None (`merge-tree` clean). Lockfile merges to one added importer block (`examples/notes-app`), no external packages added.

## Not verified

- No typecheck, test or `check:cross-package` run on the merged tree (read-only clone rule). Finding 1 is derived by reading the gate's code, not by running it. The branch's own evidence (`cloud/reports/raw/notes-app-fix/`) was produced on the old base, before main's 216 commits.
- Before merge: run `pnpm check:cross-package`, `tsc --noEmit` for core and cms, the cms forms tests, and `examples/notes-app` `typecheck` + `node --test` + `scripts/smoke.ts` on the merged tree.
