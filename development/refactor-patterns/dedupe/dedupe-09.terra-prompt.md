# Terra job dedupe-09: Jini daemon, cli, platform, mcp, user-management, plugins

READY (2026-11-13). Self-contained. Background and the reason for every decision: `development/refactor-patterns/dedupe/PLAN.md` (Tovu repo). Repo: the Jini clone you are given (Jini only; paths below are relative to the Jini repo root).

J60 runs as ONE fixed sequence: first the forced-confirmation forwarding fix (its own failing test, its own commit), then the decorator extraction. Do not reorder them and do not do the extraction alone.

Cross-package rule (gate handoffs, PLAN.md "Coordinator gates"): a step that imports from package P a name that this job or job 05 adds to P is Phase B. Phase B steps run only after the dispatch says the matching gate is done (P reviewed and built in this clone). In this job: J46 needs gate H1 (`@jini-ai/core` with J09's `errorMessageOf`); J42 step daemon-side and JR02 step 3-4 need gate H4 (`@jini-ai/platform`, `@jini-ai/http-kit` built).

## Rules for every group in this job (read before editing)
- HARD: stop before ~250k tokens of context. If you get close: commit what is done (by explicit paths), list the groups you did not finish under "REMAINING" in your report, and stop.
- Do exactly the recipe. If a recipe's "before" text is not in the file (code moved or changed), search the same file for the same code by content; if it is gone or differs in behavior, SKIP that group and report it as `STALE <id>: <what you saw>`. Never improvise a different design.
- No `eslint-disable`, no `as any`, no non-null `!`, no `@ts-ignore`. New functions take `(required: {...}, optional: {...} = {})`.
- "Why" comments are never deleted: when code moves, its comment moves with it to the survivor; when two copies carry different why-comments, the survivor keeps both.
- Do not change response text, status codes, error messages, defaults or ordering unless the recipe says so. Where a recipe says "behavior differs", write the failing test first (run it, see it RED), then make the change, then see it GREEN.
- Plugins never import each other (`packages/agent-plugins/src/<id>/`, `content/agent-plugins/<id>/`); no new package; a shared helper goes only where the recipe says.
- Tests: run ONLY the single files the recipe lists (and any test file you edit), one at a time. No suites, no full `tsc`, no watch modes; vitest always `--maxWorkers=2`; Tovu node tests always `--test-concurrency=1`. Leave no process running. Jini: after editing a package, type-check that package only, no emit (`cd packages/<pkg> && npx tsc --noEmit -p tsconfig.json`), and do NOT rebuild/publish it.
- Tovu single-file test command: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <file>`.
- Commit once per group (or once per job if the groups are tiny), by explicit paths: `git add -- <paths> && git commit -F msg -- <paths>`. Never `git add -A`, never stash/checkout/reset, never push.
- Report: per group `DONE | STALE | SKIPPED` + lines removed (from `git diff --stat`), tests run with pass/fail counts, anything that looked like a bug (do not fix bugs that are not in the recipe; list them).

## Groups in this job (decision, risk, expected saving, divergence, tests)
- **J06** MERGE INTO EXISTING — risk L; est. −32 lines; divergence: none (byte-identical)
  - tests: cd packages/mcp && npx vitest run --maxWorkers=2 src/core/__tests__/tokens.test.ts src/core/__tests__/config.test.ts
- **J08** EXTRACT SHARED HELPER — risk L; est. −33 lines; divergence: none (identical incl. MAX 25 / DEFAULT 10 and error texts)
  - tests: cd packages/daemon && npx vitest run --maxWorkers=2 src/http/__tests__/tool-catalog.test.ts src/http/__tests__/component-catalog.test.ts
- **J12** EXTRACT SHARED HELPER — risk L; est. −95 lines; divergence: none (identical); version-command header comment says each module owns its own copy on purpose - owner dedupe rule supersedes; rewrite that comment
  - tests: cd packages/cli && npx vitest run --maxWorkers=2 src/__tests__/daemon-command.test.ts src/__tests__/run-command.test.ts src/__tests__/run-command.pins.test.ts src/__tests__/main.test.ts src/__tests__/version-command.test.ts
- **J42** EXTRACT SHARED HELPER — risk L; est. −25 lines; divergence: JSON key order changes (projectId/resourceRef move to the end): check snapshot tests only
  - tests: cd packages/platform && npx vitest run --maxWorkers=2 src/__tests__/terminal.test.ts ; cd packages/daemon && npx vitest run --maxWorkers=2 src/__tests__/terminal-session.test.ts src/__tests__/identifier-lint.test.ts
- **J46** EXTRACT SHARED HELPER (Phase B: after gate H1) — risk M; est. −70 lines (the isRecord part moved to job 10 as J46a, owner-gated O2); divergence: none in messages (each helper reproduces the exact existing text). routines parseOptionalBoolean = the same behavior as the media/xai copies
  - tests: cd packages/daemon && npx vitest run --maxWorkers=2 src/http/__tests__
- **J60** BUG FIX then EXTRACT SHARED HELPER — risk M; est. −15 lines; divergence: step 1 is a deliberate behavior fix (the 4 decorators drop the per-call `requireConfirmation` option; logged in development/open-bugs.md); step 2 is a pure extraction on top of the fixed code
  - tests: cd packages/daemon && npx vitest run --maxWorkers=2 src/tool-recovery/__tests__ src/__tests__/forced-confirmation.test.ts
- **JR02** EXTRACT SHARED HELPER — risk L; est. −18 lines; divergence: none: guardSameOrigin only returns FORBIDDEN, statusForError(FORBIDDEN)=403, so the attachments/model-proxy literal 403 and the statusForError sites send the same status and body
  - tests: cd packages/http-kit && npx vitest run --maxWorkers=2 src/__tests__/origin.test.ts src/__tests__/adapter.test.ts ; cd packages/daemon && npx vitest run --maxWorkers=2 src/http/__tests__/memory.test.ts src/http/__tests__/terminals.test.ts src/http/__tests__/frontend-sessions.test.ts src/http/__tests__/attachments.test.ts src/http/__tests__/model-proxy.test.ts
- **J20** EXTRACT SHARED HELPER — risk L; est. −70 lines; divergence: none, if Terra verifies ROLE_MANAGE === "role.manage" (grant-service uses the literal)
  - tests: cd packages/user-management && npx vitest run --maxWorkers=2 src/server/__tests__/admin-crud-service.test.ts src/server/__tests__/grant-service.test.ts
- **J29** EXTRACT SHARED HELPER — risk L; est. −10 lines; divergence: none
  - tests: cd packages/plugins && npx vitest run --maxWorkers=2 src/__tests__/glue-manifest.test.ts src/__tests__/manifest.test.ts
- **J52** MERGE INTO EXISTING — risk M; est. −20 lines; divergence: none if the dispose guard order is kept (no generation bump after dispose)
  - tests: cd packages/user-management && npx vitest run --maxWorkers=2 src/admin/controllers/__tests__/roles.controller.test.ts
- **J54** MERGE INTO EXISTING — risk L; est. −5 lines; divergence: none (same shape)
  - tests: cd packages/agent-plugins && npx vitest run --maxWorkers=2 src/lifecycle/mail
- **J55** EXTRACT SHARED HELPER — risk L; est. −25 lines; divergence: none (key order kept: code before note)
  - tests: cd packages/plugins && npx vitest run --maxWorkers=2 src/host/tools/__tests__
- **J57** EXTRACT SHARED HELPER — risk L; est. −45 lines; divergence: none (only methods byte-identical to the base move)
  - tests: cd packages/user-management && npx vitest run --maxWorkers=2 src/server/__tests__
- **JR06** EXTRACT SHARED HELPER — risk L; est. −10 lines; divergence: none (helper stays async so an aborted signal still rejects, never throws synchronously)
  - tests: cd packages/user-management && npx vitest run --maxWorkers=2 src/admin/__tests__/http.test.ts src/admin/__tests__/http.options.test.ts src/admin/__tests__/people.adapters.test.ts
- **JR08** EXTRACT SHARED HELPER — risk L; est. −5 lines; divergence: none: strict (throw) vs tolerant (warn+skip) policy stays in each loop
  - tests: cd packages/agent-plugins && npx vitest run --maxWorkers=2 src/lifecycle/__tests__/unit/capability-projection.unit.test.ts src/lifecycle/__tests__/unit/lifecycle-facade.contract.unit.test.ts src/lifecycle/__tests__/integration/agent-plugin-pipeline.integration.test.ts

## Recipes (exact before → after)

## J06 mcp secret filesystem (MERGE)
config.ts: `const defaultFilesystem` -> `export const defaultMcpSecretFilesystem` (keep the CR-006 comment there; update internal uses). tokens.ts: delete its comment block + `defaultFilesystem` const and `readFile`/`writeFileAtomicAsync` imports if now unused; `import { defaultMcpSecretFilesystem, type McpConfigFilesystemPort } from './config.js';` and replace both `defaultFilesystem` uses.

## J08 catalog route input (EXTRACT, daemon)
New packages/daemon/src/http/catalog-route-input.ts with MAX_SEARCH_LIMIT=25, DEFAULT_SEARCH_LIMIT=10 and the two parse functions copied from tool-catalog.ts, renamed `parseCatalogSearchInput({ input }, _optional = {})` / `parseCatalogDescribeInput({ input }, _optional = {})`. In both route files delete the local copies + constants, import, and set `parse: (input) => parseCatalogSearchInput({ input })` / `parse: (input) => parseCatalogDescribeInput({ input })`.

## J12 CLI daemon-call deps (EXTRACT)
New packages/cli/src/daemon-call-deps.ts: move `DaemonCommandDeps`'s fields as `export interface DaemonCallDeps`, `export function defaultWrite({ text }: { text: string }, _optional: Record<string, never> = {}): void`, `defaultWriteErr` (same), `errorOptions({ deps }: { deps: Omit<DaemonCallDeps,'resolveBaseUrl'> }, _optional = {})`, `transportOptions({ deps }…)` (bodies verbatim, keep their JSDoc). In daemon-command.ts, run-command.ts, version-command.ts: `export interface DaemonCommandDeps extends DaemonCallDeps {}` (same for RunCommandDeps, VersionCommandDeps; no new members), delete local copies, call `errorOptions({ deps })`, `transportOptions({ deps })`. main.ts: import defaultWrite/defaultWriteErr. Rewrite version-command.ts header sentence about "duplicates rather than imports" to "shares `daemon-call-deps.ts` with the other daemon commands".

## J42 terminal session state (EXTRACT, platform)
platform/src/terminal.ts: add `export interface TerminalSessionState { readonly id; cwd; shell; cols; rows; status; createdAt; updatedAt; exitCode; signal }`, using the exact field types of TerminalSession minus `projectId`. Then `export interface TerminalSession extends TerminalSessionState { readonly projectId: string | null; }`, and add:
```ts
/** The grouping-key-free session fields, copied field by field so a richer internal record never leaks extra keys. */
export function terminalSessionState({ session }: { session: TerminalSessionState }, _optional: Record<string, never> = {}): TerminalSessionState {
  return { id: session.id, cwd: session.cwd, shell: session.shell, cols: session.cols, rows: session.rows, status: session.status, createdAt: session.createdAt, updatedAt: session.updatedAt, exitCode: session.exitCode, signal: session.signal };
}
```
`toPublicSession` becomes `({ ...terminalSessionState({ session }), projectId: session.projectId })`. Export both names from the platform terminal entry. Type-check platform, run its test, commit, report `J42 PHASE A DONE (needs H4)`. Phase B (only after "H4 done: @jini-ai/platform built"): daemon terminal-session.ts: `export interface TerminalSessionInfo extends TerminalSessionState { readonly resourceRef: string | null; }` (keep its long doc comment) and `toSessionInfo = ({ ...terminalSessionState({ session }), resourceRef })`. The identifier-lint test must stay green: the daemon source must still not mention the platform grouping-key name.

## J46 daemon http request helpers (EXTRACT + MERGE) — Phase B: needs gate H1 (core built with J09)
1. The 22 daemon `isRecord` copies are NOT touched in this job. A shared positional type guard is the args-rule exception the owner has not approved (O2); it is J46a in job dedupe-10, gated with JR01.
2. New `daemon/src/http/body-fields.ts`. MOVE `readOptionalNonEmptyString` and `readOptionalNumber` (with their docs; both already take `({ body, field })`) from resource-request.ts, and keep `export { readOptionalNonEmptyString, readOptionalNumber } from './body-fields.js';` in resource-request.ts so its importers stay unchanged. resource-request's `isRecord` and model-proxy-fields' `isRecord`/`nonEmptyString` stay where they are (positional; see step 1). Every NEW reader below takes `(required, _optional: Record<string, never> = {})`:
   - `readRequiredNonEmptyString({ body, field }): Result<string>`: `typeof v === 'string' && v.trim().length > 0 ? ok({ value: v }) : err({ error: validationError({ message: \`${field} must be a non-empty string\` }, { issues: [{ path: field, message: 'required non-empty string' }] }) })`.
   - `readOptionalString`, `readOptionalFiniteNumber`, `readOptionalBoolean`: the bodies of media.ts parseOptionalString/parseOptionalNumber/parseOptionalBoolean, with messages unchanged (`must be a string when provided`, `must be a finite number when provided`, `must be a boolean when provided`).
   - `readPathParam({ input, name }: { input: RouteInputContext; name: string }): Result<string>`: `const v = input.params[name]; return typeof v === 'string' && v.length > 0 ? ok({ value: v }) : err({ error: validationError({ message: \`${name} must be a non-empty path parameter\` }) });`
3. Replace copies: requireNonEmptyString(+undefined check+issues error) in delegated-tools.ts and remote-run-events.ts becomes `const x = readRequiredNonEmptyString({ body: input.body, field: 'x' }); if (!x.ok) return x;`. Apply this only where the error literal matches exactly. Replace media.ts `requireNonEmptyString` call sites in the same way only where that exact message follows; otherwise keep a local one-liner. parseOptionalString/Number/Boolean (media, xai, routines) are replaced by the readers. parseRunId (runs, remote-run-events), parseTerminalId, parseTaskId, memory/routines id parsers and connectors key parser become `readPathParam({ input, name })`. KEEP remote-run-events `requireString` and its long why-comment (empty content allowed).
4. New `http/tool-result-api.ts#toolResultToApiResult<T>({ result, reportInternalError }: { result: ToolExecutionResult; reportInternalError: (required: { correlationId: string; error: unknown }) => void }, _optional = {}): Result<T>`. The body is db-ops' switch: the `completed` cast stays as it is, the internal branch calls `reportInternalError({ correlationId, error: result.status === 'failed' ? result.error : result.status })`, and the "Unreachable" comment moves with it. db-ops and terminals call it with a closure that resolves `deps.onInternalError ?? default…Sink` and adds their `source`. delegated-tools stays (its cases differ).
5. errorMessage copies (memory, routines, routines/scheduler, delegated-tool-bridge): replace each private `errorMessage(x)` with `errorMessageOf({ error: x })` from `@jini-ai/core/primitives` (added by J09 in job 05; this is why J46 waits for gate H1). Delete a copy only if its body is exactly `error instanceof Error ? error.message : String(error)`; otherwise keep it and report it.
The 5 SSE `guardSameOrigin` blocks (#277) are handled by group JR02 (same job), not here.

## J60 tool-executor decorators: forwarding fix FIRST, then extraction (daemon)
Step 1 — forwarding fix (own commit, test first):
1. Test `packages/daemon/src/tool-recovery/__tests__/forced-confirmation-forwarding.test.ts` (ALREADY WRITTEN by the design in the Jini design clone; copy it if your clone lacks it). The design already wrote this test file (not yet run). Run it first; if it fails for a reason other than the one stated, fix only the TEST's setup (fixture shape, import path), never its assertions, and report what you changed. What it checks: For each of `withToolCallAnalytics` (analytics.ts), the observability wrapper (observability.ts), the federated-refusal wrapper (federated-refusal.ts) and the redaction wrapper (redaction.ts): wrap a fake inner `ToolExecutor` whose `execute` records its second argument; call the wrapper's `execute(args, { requireConfirmation: true, signal })`; assert the inner call received `requireConfirmation: true` and the same `signal`. Use each wrapper's existing test file for how to construct it (fakes only, no `as any`).
2. Run it: it must FAIL (RED) for all four. If any passes, STALE J60 and report which.
3. In each of the 4 files change only the `execute` options plumbing: the second parameter becomes `options: Parameters<ToolExecutor['execute']>[1] = {}`; the inner call becomes `inner.execute({ principal, run, toolId, input }, options)`. Where the wrapper body itself reads `signal`/`emitSurface`, read them from `options`. Keep every comment.
4. Run the new test (GREEN), then `src/tool-recovery/__tests__` and `src/__tests__/forced-confirmation.test.ts` one file at a time. Commit "fix(daemon): tool decorators forward the per-call confirmation option". Report the fix in the job report (the coordinator updates development/open-bugs.md).

Step 2 — extraction (separate commit, after step 1 is GREEN):
New `tool-recovery/decorate-executor.ts`:
```ts
/** A ToolExecutor that replaces only `execute`; confirmation, cancel and audit reads pass straight through to `inner`. */
export function decorateToolExecutor({ inner, execute }: { inner: ToolExecutor; execute: ToolExecutor['execute'] }, _optional: Record<string, never> = {}): ToolExecutor {
  return { execute, resumeConfirmation: (args) => inner.resumeConfirmation(args), cancel: (args) => inner.cancel(args), getAuditRecord: (args) => inner.getAuditRecord(args) };
}
```
The 4 wrappers return `decorateToolExecutor({ inner, execute: async (args, options = {}) => { … } })`, keeping step 1's whole-`options` forwarding. Each wrapper's doc sentence that says `resumeConfirmation`/`cancel`/`getAuditRecord` delegate straight through stays on the wrapper. Re-run the same test files. Commit.

## JR02 SSE same-origin guard -> http-kit `passesSameOriginGuard` (EXTRACT, framework-neutral ports)
No new Express type in a public signature. The new helper takes two structural ports; an Express `Request`/`Response` satisfies both, so callers pass `req`/`res` unchanged.
Phase A (http-kit only):
1. `http-kit/src/response.ts`: add, above `sendJson`:
```ts
/** The one response capability an API error write needs. Express's `Response` satisfies it structurally; a host on another server framework adapts its own response object to it. */
export interface ApiErrorResponseWriter { status(code: number): { json(body: unknown): unknown } }
```
   Widen ONLY `sendApiError`'s `res` parameter type from `Response` to `ApiErrorResponseWriter` (body unchanged). Parameter widening is backward compatible: every existing caller passes an Express `Response`.
2. `http-kit/src/origin.ts`: widen `guardSameOrigin`'s `req` from Express `Request` to `RequestWithOriginHeaders` (import type from `@jini-ai/core`; it is what `isLocalSameOrigin` already takes, `packages/core/src/origin-validation.ts:27`). Remove the `import type { Request } from 'express'` line if nothing else in the file uses it. Add `import { sendApiError, statusForError, type ApiErrorResponseWriter } from './response.js';` and:
```ts
/**
 * The same-origin check for a raw route (one not mounted through `mountJsonRoute`, e.g. an SSE
 * stream): answers a cross-origin request with the guard's own error and status and returns
 * `false`, so the caller only has to `return`. `mountJsonRoute` routes get this from `requireSameOrigin`.
 * Framework-neutral: `req` needs only the origin headers, `res` only `status().json()`.
 * @complexity O(1) plus the origin check.
 */
export function passesSameOriginGuard({ req, res, origin }: { readonly req: RequestWithOriginHeaders; readonly res: ApiErrorResponseWriter; readonly origin: OriginContext }, _optional: Record<string, never> = {}): boolean {
  const verdict = guardSameOrigin({ req, origin });
  if (verdict.ok) return true;
  sendApiError({ res, status: statusForError({ error: verdict.error }), error: verdict.error });
  return false;
}
```
   Export `passesSameOriginGuard` and `type ApiErrorResponseWriter` from the http-kit root wherever `guardSameOrigin` / `sendApiError` are exported. The import is one-way (`origin.ts` -> `response.ts`); `response.ts` must not import `origin.ts`.
3. `http-kit/src/adapter.ts` `allowRouteOrigin`: replace its last 4 lines (`const origin = …` to `return false;`) with `return passesSameOriginGuard({ req, res, origin: adapter });`; drop `guardSameOrigin`/`statusForError` imports only if now unused.
4. Type-check http-kit; run `src/__tests__/origin.test.ts`, `src/__tests__/adapter.test.ts`. Add one origin.test.ts case: `passesSameOriginGuard` with a plain `{ status(code) { … return { json(body) { … } } } }` object (no Express) records 403 and the FORBIDDEN envelope. Commit. Report `JR02 PHASE A DONE (needs H4)`.
Phase B (only after "H4 done: @jini-ai/http-kit built"):
5. daemon/src/http: in `memory.ts` registerMemoryEventStream and `terminals.ts` registerTerminalEventStream replace the 5-line `const origin = guardSameOrigin(…); if (!origin.ok) { sendApiError(…); return; }` with `if (!passesSameOriginGuard({ req, res, origin: adapter })) return;`. `frontend-sessions.ts` stream route: `if (!deps.resolveOwner && !passesSameOriginGuard({ req, res, origin: adapter })) return;` keeping the "Scoped hosts authenticate origin …" comment above it. `attachments.ts` passesOriginGuard body: `return deps.requireSameOrigin === false || passesSameOriginGuard({ req, res, origin: adapter });` (keep its doc). `model-proxy.ts` (both the fixed-route runner and the catch-all): same one-liner inside the existing `try`.
6. model-proxy.ts comments that name `guardSameOrigin` as the call that might throw (around the `catch` docs, ~L242, ~L411, ~L446, ~L607-610): rename the call to `passesSameOriginGuard` in the text; keep every comment. Drop `guardSameOrigin`, `statusForError`, `ok` from each daemon import only if unused. Run the daemon test files listed for JR02.

## J20 authorized identity transaction (EXTRACT, user-management)
grant-service.ts, after assertCallerHasAnyPermission:
```ts
/** Runs `execute` in one identity transaction after the caller passes `assertCallerHasAnyPermission`, so the check and the write see the same snapshot. */
export function inAuthorizedIdentityTransaction<T>({ deps, workspaceId, callerPrincipalId, permissions, execute }: { deps: AuthServiceDeps; workspaceId: UUID; callerPrincipalId: UUID; permissions: readonly string[]; execute: () => Promise<T> }, _optional: Record<string, never> = {}): Promise<T> {
  return inIdentityTransaction({ transactions: deps.repos.transactions, workspaceId, execute: async () => {
    await assertCallerHasAnyPermission({ deps, workspaceId, callerPrincipalId, permissions });
    return execute();
  } });
}
```
Replace every `return inIdentityTransaction({ transactions: deps.repos.transactions, workspaceId: input.workspaceId, execute: async () => { await assertCallerHasAnyPermission({ deps, workspaceId: input.workspaceId, callerPrincipalId: input.callerPrincipalId, permissions: [X] }); REST } })` in admin-crud-service.ts and grant-service.ts with `return inAuthorizedIdentityTransaction({ deps, workspaceId: input.workspaceId, callerPrincipalId: input.callerPrincipalId, permissions: [X], execute: async () => { REST } });`. Only where the permission check is the FIRST statement inside execute. Do not touch the non-transactional sites (grant-service ~311, ~348).

## J29 manifest key checks (EXTRACT, plugins)
New plugins/src/glue/manifest-keys.ts (no imports) with the generic `collectManifestKeyErrors` (body = validateKeys, using `malformed` param). glue/manifest.ts and host/manifest.ts validateKeys become `return collectManifestKeyErrors({ raw, allowedKeys: ALLOWED_KEYS, requiredKeys: REQUIRED_KEYS, malformed });` (keep host's "BR-02 step 1" doc).

## J52 roles controller store (MERGE)
roles.controller.ts: replace `let state…, disposed = false`, `listeners`, `abort` and `call` with `const store = createControllerStore<RolesState>({ initial }); const read = store.getSnapshot, call = store.call; let listGeneration = 0, permissionGeneration = 0, panelGeneration = 0;`. `set` becomes `const set = (patch: Partial<RolesState>) => store.set({ patch: patch.permissionRows ? { ...patch, permissionRows: Object.freeze([...patch.permissionRows]) } : patch });`. Every `state.` read becomes `read({}).`, and every `disposed` read becomes `!store.active({})`. The returned `getSnapshot`/`subscribe` delegate to the store. `dispose` becomes `if (!store.active({})) return; ++listGeneration; ++permissionGeneration; store.dispose({});`. Import from './controller-store.js'.

## J54 SMTP payload type (MERGE)
agent-plugins/src/lifecycle/mail/catalog.ts: delete `interface SmtpPayload {…}` and add `import type { SmtpMailPayload as SmtpPayload } from "@jini-ai/platform/mail/smtp";`.

## J55 plugins management not-changed results (EXTRACT, local)
```ts
/** Nothing changed, so a RESULT the model can relay, not a redacted failure. */
function notChangedEnableResult({ request, reason, note }: { request: SetEnabledRequest; reason: string; note: string }, { code }: { code?: string | undefined } = {}): unknown {
  return { changed: false, cancelled: false, family: request.family, pluginId: request.pluginId, restartRequired: false, reason, ...(code === undefined ? {} : { code }), note };
}
function warnSetEnabledRefused<Description>({ routeDeps, request, error }: { routeDeps: PluginManagementToolsRequired<Description>; request: SetEnabledRequest; error: { message: string } }, _optional: Record<string, never> = {}): void {
  console.warn(`[agent-plugins] '${request.pluginId}': ${routeDeps.toolIds.setEnabled} refused — ${redactSecrets({ input: error.message }, { redactPii: false })}`);
}
```
Use them in updatePendingResult, hostIncompatibleResult, activationsUnreadableResult, activationsBusyResult and the linkedFaceResult literal (~line 313; check that its keys match). Each function keeps its own doc comment.

## J57 user-management in-memory repos (EXTRACT)
repo.memory.ts, after InMemoryIdentityRows:
```ts
/** Workspace-scoped rows keyed by `id`: the generic find/list/save/delete every identity repo shares. */
export abstract class InMemoryWorkspaceRecords<Row extends { workspaceId: string; id: string }> extends InMemoryIdentityRows<Row> {
  async findById(required: { workspaceId: string; id: string }): Promise<Row | null> { return this.rows.find(record => matchesRecordFields({ record, fields: { workspaceId: required.workspaceId, id: required.id } as Partial<Row> })) ?? null; }
  async list(required: { workspaceId: string }): Promise<Row[]> { return this.rows.filter(record => matchesRecordFields({ record, fields: { workspaceId: required.workspaceId } as Partial<Row> })); }
  async save(record: Row): Promise<void> { upsertRecord({ records: this.rows, record, identity: { workspaceId: record.workspaceId, id: record.id } as Partial<Row> }); }
  async delete(required: { workspaceId: string; id: string }): Promise<void> { this.rows = this.rows.filter(record => !matchesRecordFields({ record, fields: { workspaceId: required.workspaceId, id: required.id } as Partial<Row> })); }
}
```
(`as Partial<Row>` is needed because generic Row; if typecheck accepts it without the cast, drop the cast.) Every repo class whose methods are textually these four switches to `extends InMemoryWorkspaceRecords<X>`, deletes those methods, and deletes its constructor when the constructor only forwards `{ initialRows }` with the same parameter shape. Classes that do not have them all keep the ones they lack. Only methods byte-identical to the base move.

## JR06 user-management HTTP adapters (EXTRACT, file-private in admin/adapters/http.ts)
```ts
type RolesHttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** One call through the host transport: refuses an aborted signal first and forwards the signal
 *  only when given. Async on purpose, so an aborted signal rejects the promise instead of throwing. */
async function sendRolesRequest<T>(
  { transport, path, method, options }: { transport: RolesHttpTransport; path: string; method: RolesHttpMethod; options: RolesCallOptions },
  { body }: { body?: Record<string, unknown> } = {},
): Promise<T> {
  options.signal?.throwIfAborted();
  return transport.request<T>({ path, method, ...(body ? { body } : {}) }, options.signal ? { signal: options.signal } : {});
}

/** `<basePath>/<workspaceId>`, with one trailing slash trimmed from basePath. */
function workspaceRoot({ basePath, workspaceId }: { basePath: string; workspaceId: string }, _optional: Record<string, never> = {}): string {
  return `${basePath.replace(/\/$/, '')}/${encodeURIComponent(workspaceId)}`;
}
```
In each of the three factories: `const root = workspaceRoot({ basePath, workspaceId });` (members appends `/members`), and the 4-line `request` closure becomes `const request = <T>(path: string, method: RolesHttpMethod, o: RolesCallOptions, body?: Record<string, unknown>) => sendRolesRequest<T>({ transport, path, method, options: o }, { body });` (members keeps `method: 'GET' | 'POST'`). All call sites unchanged. Auth login: `login: (r, o = {}) => sendRolesRequest({ transport, path: \`${authPath.replace(/\/$/, '')}/login\`, method: 'POST', options: o }, { body: { username: r.username, password: r.password } }),`; if tsc cannot infer `T` there, leave login as it is.

## JR08 installed-skill detail (EXTRACT, agent-plugins host-tools/skill-tool.ts)
```ts
/** Reads one installed skill's markdown and builds its detail. A read failure propagates: each
 *  caller applies its own policy (the tool loader refuses the plugin, search skips the skill). */
export async function readInstalledSkillDetail(
  { plugin, skill, ports }: { plugin: { readonly packageRoot: string }; skill: { readonly name: string; readonly skillPath: string }; ports: AgentPluginHostToolPorts },
  _optional: Record<string, never> = {},
): Promise<AgentPluginSkillDetail> {
  const markdown = await ports.lifecycle.readInstalledSkillMarkdown({ packageRoot: plugin.packageRoot, skillPath: skill.skillPath });
  return { name: skill.name, summary: summarizeSkillMarkdown(skill.name, markdown, ports), markdown,
    readFile: (_input, options = {}) => ports.lifecycle.readInstalledSkillFile({ packageRoot: plugin.packageRoot, skillPath: skill.skillPath }, options),
  };
}
```
`resolveSkillsForPlugin` loop body -> `skills.push(await readInstalledSkillDetail({ plugin, skill, ports }));`. search-tool.ts `resolveSkillsForSearchTolerant` `try` body -> the same line (catch/warn unchanged, its long doc unchanged); swap `summarizeSkillMarkdown` for `readInstalledSkillDetail` in its skill-tool import if no other use remains.
