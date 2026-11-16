# r2-sheets-a handoff (Codex r2 findings for C3/C3t/C4/C5), stopped at the 250k context line

Pre-edit copies of the 4 TSVs and LANES.md: `/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/6d305acc-73f7-4e6d-a4d1-9dd291981c30/scratchpad/r2a/*.orig.*` (diff against them).

## Done
- **C3.repoint.tsv** (503 rows):
  - Rows 3/5/7/11: template is now `MigrationStep => MigrationStep<StorageKernel<unknown>> (core)`. The next row completes it to `MigrationStep<StorageKernel<Kysely<unknown>, unknown>>` (checked with a simulation).
  - Rows 111/187/188/229 get phase `lane` (files deleted or moved by the lane).
  - Rows 30/254/266-271/296 `SqliteConnectionSource` → `KEEP` (it stays in db).
  - +6 rows: 2 inline `import('../core/index.js')` in cms forms; the taxonomy `TransactionalRepoPort` chain (Jini DROP, Tovu DROP + 2 MOVE).
  - +1 MANUAL row: db `__tests__/core/index.test.ts:12` key list.
- **C3t.repoint.tsv**: row 255 gets phase `lane`.
- **C4.repoint.tsv**: +1 MANUAL row for Tovu `origin-repo.import-boundary.test.ts:86` (expected specifier becomes core verified-origin).
- **C5.repoint.tsv** (382 rows):
  - Old row 40 deleted (C4 row 268 owns the DROP).
  - Rows 175/326/327/377: rename `SiteKeyHandle->RootKeyHandle`.
  - Rows 184/186 star `./vault.types.js` → DROP.
  - Rows 195/154/155/183 get phase `lane`.
  - Row 31 (daemon `TerminalSseSink` re-export) → DROP.
  - Row 29 (daemon `http/terminals.ts` `../index.js` TerminalSseSink) → MOVE to `@jini-ai/core/contracts/runtime`.
  - The line numbers above are the pre-delete ones; rows after 40 shift by -1.
- **LANES.md:144**: `C3t --phase wave,c3-rewrite`. The B1 cell explains phase `lane`, and that `followups/{C3,C4,C5}.md` §A runs before B1 and §B after it.
- **C3.md**:
  - SqliteConnectionSource row struck.
  - Neutral kernel and migration comments.
  - `kernel/sqlite/index.ts` keeps the export.
  - Commerce type text matches the rows.
  - D5/D7 digest timing moved to the follow-up.
  - New "Neutral prose" table before STOP.
- **followups/C3.md** written:
  - A1 SqliteConnectionSource back to db; A2 neutral prose; A3 commerce placeholder; A4 cms api.spec; A5 Tovu empty digests.
  - B1/B2 digest computation commands; B3 cloud proof.
- Dry runs (all `--dry-run`, 0 STALE / 0 ERROR):

  | TSV | phase | rows | applied | keep | manual |
  |---|---|---|---|---|---|
  | C3 | all | 503 | 493 | 9 | 1 |
  | C3 | c3-rewrite | | 128 | | |
  | C3t | all | | 295 | | 3 |
  | C3t | c3-rewrite | | 57 | | |
  | C4 | all | | 256 | | 3 |
  | C4 | wave | | 214 | | |
  | C5 | all | | 310 | | 64 |
  | C5 | wave | | 306 | | |

## Remaining (decided; write these)
### followups/C4.md (§A, before B1)
1. **Reporter off the context** (fixes the r2 HIGH: constructors at Jini `server/src/create-local-node-daemon.ts:364`, Tovu `agent-daemon-scope.ts:1434`, `http-kit/__tests__/adapter-pins.test.ts:41`, and the hostless path).
   - In core `json-route.ts`, DELETE `reportInternalError` from `RouteHostContext`. It then has exactly the old `AdapterContext` fields, so the existing constructors need no edit.
   - Add `readonly reportInternalError: ReportRouteInternalError` to `jsonRoute`'s REQUIRED argument: `jsonRoute({ spec, deps, reportInternalError }, { host })`. Thread it into the exception helper.
   - Red-first test in `json-route.test.ts`: a plain throw with NO host → 500 with the injected reporter's `requestId`. Move the fake reporter in existing tests from `host` to `required`.
   - Update C4.md §2.2, §3 (`fooRoutes({ deps, reportInternalError }, { host? })`), §6 (`routeHost` drops `reportInternalError`) and §11 H2 text.
2. **Middleware `path`**: delete the `readonly path: string` member C4 added to core `ServerMiddleware`. O2 adds it with dispatcher threading. Skip if `runChain` already passes `path`. Edit C4.md:72.
3. **Sink context type**: declare it in core `json-route.ts`: `export interface RouteHostInternalErrorContext { readonly method: string; readonly path: string; readonly correlationId: string; readonly error: unknown }`, with the doc comments copied from http-kit `adapter.ts:14-23`. `onInternalError?: (context: RouteHostInternalErrorContext) => void`.
   - http-kit `adapter.ts`: delete `AdapterInternalErrorContext` and use the core type at line 194.
   - Rename it in http-kit `docs/spec/{api,state}.spec.md`.
4. **validationError without protocol**: `export interface ServerValidationIssue { readonly path: string; readonly message: string }`.
   - Signature: `validationError({ message }, { issues = [] }: { readonly issues?: readonly ServerValidationIssue[] | undefined } = {}): ServerApiError`.
   - Body: `{ code: 'BAD_REQUEST', message }`, plus `details: { kind: 'validation', issues } as unknown as JsonValue` when `issues` is non-empty.
5. **`core-server-contract.typecheck.ts`**: drop the `AdapterContext` lines. Keep `ApiError`↔`ServerApiError` and `reportRouteInternalError satisfies ReportRouteInternalError`. Add `const i: ServerValidationIssue = {} as Pick<ApiValidationIssue,'path'|'message'>`.
6. **C4.md:198 gate fixes**:
   - Replace the T-MOVE "still importable from old path" check with an absence check: `rg -n "export .*\b(<moved names>)\b" packages/http-kit/src` prints nothing.
   - Make the dependency grep match imports only: `rg -n "from ['\"](node:|express|@jini-ai/protocol)|import\(['\"](node:|express|@jini-ai/protocol)|\bprocess\.|globalThis"`.

### followups/C5.md (§A)
1. **Shim planner**. Platform `command.ts:122` `createPackageManagerInvocation` still calls the deleted `buildCmdShimInvocation`.
   - Core `runtime/command.ts` exports `planCmdShimInvocation({ command, args, env }, { fallbackComSpec })`: the old body with `process.env.ComSpec` replaced by `fallbackComSpec`. `planCommandInvocation` uses it for the win32 `.bat/.cmd` branch.
   - Platform line 122 becomes `planCmdShimInvocation({ command: "corepack", args: ["pnpm", ...args], env }, { fallbackComSpec: process.env.ComSpec })`. This keeps the forced Corepack wrap.
   - Red-first test: on win32 with no `npm_execpath`, the result is the `cmd.exe /d /s /c` shape.
2. **FileLockOptions**: platform `export interface FileLockOptions extends Omit<FileLockPortOptions, "filesystem"> { messages?: PlatformMessages }`. The concrete-filesystem intersections at `file-lock.ts:275,336` then type. Check `file-lock.boundaries.test.ts:143` (cloud run).
3. **Moved tests**:
   - Core `net/__tests__/endpoint-policy.test.ts`: the manifest case checks core `package.json` `jini.entries['./net']==='universal'` and `exports['./net']` = `./dist/net/index.{d.ts,js}`. The import-free check reads `../endpoint-policy.ts`.
   - Delete the "same predicates" identity case (lines ~52-53) and imports from `../address.js`. Keep the `HOSTS` cases.
   - Platform keeps NO identity test (correct C5.md:227/231).
   - `vault.types.test.ts` → core `contracts/vault/__tests__/invariants.test.ts`, imports relative to core.
4. **C5.md 79/83**: the positional "published API" exceptions are pre-existing debt (verbatim moves). Do not change them in wave B. Change the sheet wording from "published API" to "pre-existing arg debt, own slice".

### Report items still to send to main
- Owner questions:
  - (a) The Q2 forwarders `@jini-ai/sqlite` and `@jini-ai/infra/db/sqlite` (C3 rows 19/55) conflict with the 11-15 no-forwarders rule. Should the 2 deprecated packages be deleted in their own task?
  - (b) R7-xai destination: recommend `@jini-ai/provider-plugins/xai` (vendor code in its plugin; agent-runtime option rejected). Not yet written into C4-server-port-fold.md or C6.md:242.
- Coordinator task: 10 PRE-EXISTING platform→core shell files need their own census and repoint task. They are `secrets/{ports,types}.ts`, `secrets/credential-sets/types.ts`, `fs/guarded-reader.ts:9`, `mail/{adapter-module,provider,types,ports,engine-contracts,plugin-abi}.ts`. C5 rows 188/200/202 stay KEEP. C5's STOP #7 `rg` hits them, so the running C5 lane may have STOPPED on them: tell it they are pre-existing and out of scope.
- The running lanes may STOP on their own prose `rg` (C3) or protocol/crypto (C4 `validationError`). The follow-ups cover both.
- Rejected:
  - C3 helper positional args: pre-existing, ~1.3k call sites, verbatim move; for the arg-debt ratchet.
  - C4 verified-origin registry/memory repo in core: orchestrates injected ports only, no I/O; the memory repo is test-only and may move to `/testing` in R9.
  - SSE stream in core: web `ReadableStream` plus an injected scheduler, no Node/timers.
  - C3 L8 gate: coordinator decision (defer or schedule), not a lane edit.
