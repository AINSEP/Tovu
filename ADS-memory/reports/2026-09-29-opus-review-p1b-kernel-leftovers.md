# Opus review, part 1b: the leftovers from part 1 (kernel / server / cli)

- Range: `962f928fb..HEAD` on `restructure/apps-website-phased`. Code read with `git show HEAD:` and `git diff` only. Nothing was run and nothing was edited.
- Persona: `AI-Dev-Shop/agents/code-inspection/skills.md`.
- Continues `2026-09-29-opus-review-p1-kernel-server.md`. None of its findings (M1–M4, L1–L9) are repeated here, and neither are the 11 Codex findings in `2026-09-28-codex-sol-review-today.md`.
- Counts: critical 0, high 0, medium 0, low 7, plus the M1 verdict.

## M1 verdict: the premise is REFUTED for agent CLIs. A narrower risk remains.
- The daemon does get `TOVU_PG_SOCKET`. `daemon-supervisor.ts:459` adds it to the overrides, and `:508` spreads them over `process.env` for the spawn.
- Agent CLIs do not inherit it:
  - `agent-daemon-server.ts:1040-1062` calls `agentExecutor.run({...})` with no `env` and no `credentialEnv`.
  - `@jini-ai/daemon` `agent-executor.ts:2980-2985` `resolveRunEnv` then takes the deny-by-default path, `buildAgentEnv`.
  - `buildAgentEnv` (`:680-708`) copies only `BASELINE_AGENT_ENV_KEYS`: PATH, HOME, USERPROFILE, TMPDIR, TEMP, TMP, SHELL, LANG, LC_ALL, LC_CTYPE, USER, and the Windows-only keys.
  - The CLI's Bash tool, and any `tovu serve` / `tovu init` it runs, therefore start without `TOVU_PG_SOCKET`.
- Other children of the daemon do not inherit it either:
  - The injected Jini MCP entry (`buildMcpJsonServerEntry`, `:1066-1079`) sets only `JINI_RUN_ID`, `JINI_DAEMON_URL` and `JINI_DAEMON_TOKEN`.
  - Federated stdio MCP servers get `buildMcpChildEnv`, which replaces the parent env (`assistant/mcp-federation/adapter.stdio.ts:253-273`).
- The only other `spawn` in `apps/website/src` is `psql` in `database-transfer/postgres-target.ts:93`, which gets an explicit env.
- What is left:
  - The daemon process itself holds the variable. Any in-daemon `openSiteStore({ role: "owner" })` of another PGlite site would still take over the socket.
  - No such call exists today. `createSite` uses the SQLite default. `initSite --storage pglite` is reachable only from the CLI. `duplicate-pglite-store.ts` uses `openPgliteKernel` under its own lock.
  - An operator shell that exported the variable still triggers it.
- Recommendation:
  - Downgrade M1 to low (latent).
  - Keep its fix direction: the owner ignores `PG_SOCKET_ENV` and always uses `defaultPgliteSocketDir(dataDir)`. That is a two-line change and closes the in-daemon path for good.
- Caveat: the Jini daemon source was read through `node_modules/@jini-ai/daemon`, which is a symlink to the Jini checkout. If an install nests a different `@jini-ai/daemon` version, this trace does not cover it.

## Bugs

### L1 (low): the run finalizer never checkpoints the tail of a run that goes quiet
- `server/runtime/composition/modules/assistant-run-finalizer.ts:155-170` (`checkpoint`) and `:187` (the call after each non-terminal frame).
- A checkpoint happens only when a frame arrives and at least `checkpointIntervalMs` (1 s) has passed since the last one. There is no trailing write.
- Scenario:
  1. The run streams text at t=0.0 s, which is checkpointed.
  2. More text and a `tool_call` start arrive at t=0.6 s. They are not checkpointed, because the interval has not passed.
  3. The tool then runs for 3 minutes with no frames.
  4. The API process is killed (or stopped: the exit flush was removed in this range).
  5. On the next boot, `reconcileInterrupted` keeps only the t=0.0 content. The last text and the tool-call start are lost.
- Before this range, the synchronous `exit` flush saved everything on a graceful exit. Now even a graceful `SIGTERM` loses up to one interval of output. For a run that pauses, that output can be the most recent minutes.
- Fix: schedule a trailing checkpoint (a timer armed when a checkpoint is skipped), or flush the in-flight runs from the shutdown path (which can await) before the store closes.

### L2 (low, latent): typegen's types disagree with what the Postgres drivers return
- `platform/db/kernel/typegen.ts:32-37` maps `numeric` to `number` and `bigint` to `number`.
- `drivers/pg-types.ts` overrides only int8, json and jsonb.
  - `numeric` (oid 1700) therefore reads as a string on node-postgres. (PGlite behaviour not checked.)
  - `int8` above 2^53 reads as a JS `bigint`.
- A future `numeric` column would type-check as `number` while holding a string at runtime, so `a + b` would concatenate.
- There is no `numeric` or `real` column in the migrations today (grep), so this is latent.
- Fix: map `numeric` to `string` (or add a parser), and `bigint` to `number | bigint`, or refuse `numeric` like other unmapped types.

## Slop / stale comments

### L3 (low): comments renamed by search-and-replace now state false things
- The rename `createSqliteRouteDeps` → `createSiteRouteDeps` kept sentences that were true only of the old synchronous, SQLite-only function:
  - `platform/observability/otel.ts:16-22` justifies `require()` because "both composition roots' RouteDeps are built synchronously today … synchronous functions". `createSiteRouteDeps` is now async (`export.ts` awaits it).
  - `server/runtime/boot/resolve-mailer.ts:~61`: "(`createSiteRouteDeps`/`createRouteDeps`) must stay synchronous". False.
  - `server/runtime/boot/content-db-schema-guard.ts:21-22`: "`createSiteRouteDeps()` calls `openContentDb()` directly, which unconditionally runs Drizzle's `migrate()`". It now goes through `openSiteStore` and the kernel migration runner.
    - The same header, `index.ts:218-227`, still calls the guard the only protection. It does not say that it guards SQLite files only: a pg store has no `content.db`, so the answer is `no-file`. Nor does it say that newer-runtime detection for the `tovu_migrations` steps now lives in `runner.ts`'s `UnknownAppliedMigrationError`.
  - `platform/site-dir/duplicate-content-db.ts:93-97`: "SQLite by construction until a site can choose another store (plan R1)". R1 has landed. Say instead that PGlite sources go through `duplicate-pglite-store.ts`.
  - `server/runtime/composition/deps.ts` / `routes/types.ts:1219-1223` (`contentKernel`): "Set only by `server/deps.ts`". The path is `server/runtime/composition/deps.ts`. Minor.

### L4 (low): `schema-shape.ts` claims more than its Postgres half checks
- Header, `platform/db/kernel/schema-shape.ts:10-11`: "Two shapes are equal when the databases would accept and reject the same writes".
- The Postgres half (`:79-113`) falls short of that:
  - It reads `information_schema.columns.data_type`, which drops `character varying(n)` lengths and `numeric(p,s)` precision.
  - It has no triggers. The SQLite half includes them.
  - Constraint names are compared verbatim, for example `posts_pkey`, so a database built by a different tool with different auto-names would read as different.
- Production uses only the SQLite half (`legacy-sqlite.ts:128,174`). The Postgres half is test-only today, so nothing ships wrong.
- Fix: narrow the claim to "columns, indexes, constraints, views", or add length and precision (`character_maximum_length`, `numeric_precision`) and `pg_trigger`.

## Excess

### L5 (low): the sealed-credential inventory has been ported across dialects but still has no production caller
- `platform/db/sealed-credential-inventory.ts`, renamed from `sqlite/sealed-credential-inventory.sqlite.ts` with 80 % similarity and rewritten onto the kernel. `listSealedCredentials` and `discoverSealedColumns` have no non-test importer.
- Its companion `server/runtime/composition/sealed-credential-descriptors.ts` (`SEALED_COLUMN_DESCRIPTORS`) also has no non-test importer. It was not wired at base either.
- This range did the port and its test work without adding a consumer.
- Behaviour lost in the port: the old `readAll` refused any statement whose `Statement.readonly` was false. The new header replaces that with "cannot write by construction", which holds today because every statement is built in this file.
- Not a defect on its own. Flag it for the owner: keep the capability parked, or wire it into the root-key flows it was built for (header §"Why this exists").

## Architecture

### L6 (low): `bootstrap.ts`'s store module and `routes/types.ts`'s `contentKernel` widen `RouteDeps` with a raw kernel
- `routes/types.ts:1215-1219` adds `contentKernel?: ContentKernel` to `DatabaseOpsDeps`, and `runtime/boot/bootstrap.ts:141-147` reads it.
- Every feature that receives `RouteDeps` can now reach the raw content kernel and run any query, bypassing its repo ports. The only intended reader is one boot module.
- Narrower: pass the kernel into `buildBootModules` options, which already takes `defaultContentDbPath`, instead of adding it to the request-time dependency bag.

### L7 (low): the chats route gate waits on the repair promise for every request, forever
- `server/runtime/composition/modules/assistant-chats.ts:103-106`: `app.use("/api/assistant/chats", (_req,_res,next) => { void reconciled.then(() => next()); })`.
- It is correct: `reconciled` never rejects, because both branches handle the result. But it adds a microtask hop to every chat request for the life of the process.
- It also swallows nothing if `next` throws synchronously inside `.then` (Express 4 would not see it). Nothing throws there today, but the pattern is fragile.
- Tidier: `if (settled) return next();` after the first resolution, or `reconciled.then(() => next(), next)`.

## Checked, no finding
- `kernel/schema-shape.ts`, SQLite half: partial-index predicate extraction, auto-index labelling by origin, FK grouping, the DEFINITION text. The strict text match is intended and is covered by the real-sites integration test that exists in the range.
- `kernel/typegen.ts`: the Postgres-only guard, boolean aliases, `Generated<>` rules. Unmapped types throw.
- `sealed-credential-inventory.ts:330-483`: probe-then-open verdict logic, the no-key-source short-circuit (no derivation, so no key file is minted), descriptor errors kept as enum reasons, sequential re-probe, `tally`. Only the part-1 L1 snapshot caveat applies.
- `site-dir/duplicate-content-db.ts`:
  - Source opened read-only.
  - `openSqliteFileKernel` still sets `foreign_keys = ON` on the target (`drivers/sqlite.ts:143`), preserving the old pragma.
  - `storageOps.compactAndVerify` keeps the checkpoint-before-integrity order and the busy check (`kernel/ops.ts:93-107`).
  - `StorageOpError` is rewrapped as `InternalError`.
- `site-dir/repair-site.ts`, `resolve-workspace.ts` (`created_at` is `text` on both dialects, so `localeCompare` is safe), `site-registry.ts` (`createSite` awaited at `routes/system/sites.ts:222`), `seed-site-themes.ts`.
- All callers of the newly async functions await them:
  - `planRepairSite` and `repairSite` through `adopt.ts:101-110,158,162`.
  - `checkContentDbSchema` at `index.ts:229`.
  - `resolveWorkspace` at `boot-site-dir.ts:145,182` and `deps.ts:769,2271`.
  - `duplicateContentDb` at `duplicate-site.ts:258`.
- `bootstrap.ts` store module: optional criticality. `contentKernel` is set at `deps.ts:2077`. `declareDataModule` skips the snapshot and headroom on non-SQLite (`data-module.ts:919`), so the SQLite `dbPath` on a pg store is harmless.
- `export.ts`: `try/finally` now starts right after `bootSiteDir`. `closeSiteDirBoot` closes the composed store (sweep, then store), or `boot.store`. The fix for Codex #7 is verified.
- `app.ts`: the lazy-proxy `has` trap, the trash-registry simplification, public security headers mounted after the serving gate.
- `modules/external-mcp.ts` and `modules/seo.ts`: route additions, ordering commented. `content-publish-ports.ts`: the type widening.
- `assistant-system-overlay.ts`: `ASSISTANT_SETTING_SOURCES = []` and `resolveAssistantRunSettings` (existence-gated, JSON built with `JSON.stringify`, no shell interpolation).
- Contracts one-liners (`appliers.ts`, `gateway.ts`, `publish-history-list-limit.ts`), `observability/index.ts`, `routing/routing.ts`: comment-only changes.

## Files reviewed (HEAD)
- platform/db:
  - `kernel/schema-shape.ts`, `kernel/typegen.ts`
  - `sealed-credential-inventory.ts` in full, plus the diff against the old `.sqlite.ts`
  - `kernel/ops.ts`, `drivers/pg-types.ts` (context)
- platform/site-dir: `duplicate-content-db.ts`, `repair-site.ts`, `resolve-workspace.ts`, `site-registry.ts`, `seed-site-themes.ts`
- server/runtime/composition:
  - `app.ts`, `content-publish-ports.ts`, `sealed-credential-descriptors.ts` (diffs)
  - `modules/assistant-chats.ts`, `modules/assistant-run-finalizer.ts`, `modules/external-mcp.ts`, `modules/seo.ts` (diffs)
- server/runtime/boot: `content-db-schema-guard.ts`, `bootstrap.ts`, `boot-readiness-gate.ts`, `resolve-mailer.ts` (diffs)
- server (other): `routes/types.ts`, `inbound/assistant/assistant-system-overlay.ts` (diffs)
- cli: `commands/export.ts` (diff)
- contracts: `commands/appliers.ts`, `gated-mutations/gateway.ts`, `publish-history-list-limit.ts`
- observability and routing: comment diffs
- M1 trace:
  - `daemon-supervisor.ts`, `agent-daemon-server.ts:600-640,1036-1075`, `mcp-federation/adapter.stdio.ts`, `open-site-store.ts:145-196`, `init-site.ts`
  - `@jini-ai/daemon/src/agent-executor.ts` (`resolveRunEnv`, `buildAgentEnv`, `buildMcpJsonServerEntry`)

## Not reviewed
- `cli/__tests__/helpers/remove-fixture-tree.ts` (a test helper).
- The composition test files added in the range (`create-site-route-deps.*`, `move-site-storage.postgres.test.ts`, and others). They were out of scope as tests, and they are test-quality items for another pass.
- Whether the consumer in `@jini-ai/cms` awaits `stampWatermark()` now that it can return a promise (`routes/types.ts:1224` claims it does). The consumer is outside this repo's source, so this belongs to features review p3 or p4.
- The code-metrics, dependency-graph, type-safety and duplication sensors were not executed, because no runs were allowed.
