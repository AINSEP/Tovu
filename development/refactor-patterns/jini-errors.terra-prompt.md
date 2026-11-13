# Terra prompt: Jini error handling (swallowed errors + generic catch messages)

STATUS: READY (rev 3, 2026-11-13: the logging default is now SAFE METADATA ONLY, section 1; owner
decisions D6/D7 in `jini-errors.md` use the defaults written here). Self-contained. Two parts:
**Part A** = Jini monorepo (sections 0-9). **Part B** = Tovu (section 10), run only after Part A
is reviewed, released and Tovu's `@jini-ai/*` versions are bumped. Every `path:line` below was
read on Jini branch `design-d5` (head 898ec8a21); if a line moved, find the quoted text in the same
file. Part B Tovu paths were read on the Tovu design clone at 4d658cde7 (same rule). Neither repo needs `AI-Dev-Shop/`; that is expected, proceed. Do not follow CLAUDE.md/AGENTS.md
bootstrap steps.

## 0. Preconditions (check first; if one fails, STOP and report which)
- **P1 hardened describeErrorForLog.** `grep -n "diagnostic unavailable" packages/core/src/model-facing-tool-errors.ts`
  must match. It is Jini commit ad856dba3 ("describeErrorForLog never throws"), already on the
  integration branch `refactor/terra`. Without it a throwing `code`/`constructor`/`cause` getter makes
  the RS/LS/U/Q log calls replace the original failure. Run Part A on a branch made from
  `refactor/terra` with `design-d5` merged in.
- **P2 shared route owner.** `packages/http-kit/src/internal-error.ts` exports `reportRouteInternalError`
  and `packages/http-kit/src/index.ts` re-exports it (design-d5 c88af7d03, 76447baa5); its default line
  logs `describeErrorForLog` only (`grep -n "describeErrorForLog({ err: context.error })"` matches; ef09da3c3).
- **P4 worked examples proven red, then green.** The cloud gate has recorded, for each pair in
  `jini-errors.md` section 7 (c88af7d03->76447baa5, bf4043fce->c55eec038, e4061b9de->ef09da3c3/898ec8a21),
  the failing assertion on the test-only revision and the pass on the fix. The design commits were
  never run locally; until both records exist the examples are unproven. Ask for the records; do not
  run the pairs yourself.
- **P3 approved-copy-only describeApiError.** `packages/admin/src/core/transport/errors.ts`
  `describeApiError` returns `fallback` for anything that is not an `AdminApiError` (design-d5 c55eec038).

## 1. Ground rules
- Smallest change per site. No refactors beyond what a row says, no renames, reformatting or moves.
  Keep every comment; a "why" comment on code you replace moves with the code, never deleted.
- API args are `(requiredObj, optionalObj = {})`. Every constructor/helper this prompt creates or
  changes is object-first (section 3 R, section 6 R-API). No `eslint-disable`, `as any`, non-null `!` in
  added code, except the `// eslint-disable-next-line no-console` lines that already sit on the
  default sinks you consolidate (they move with the line).
- **Logging default: safe metadata only.** Every log line or diagnostic cause this prompt adds or
  changes carries a fixed text, `describeErrorForLog({ err: error })` (class + constant code, e.g.
  `Error(ENOENT)`; never the message; never throws, P1) and an ID when one exists. Never
  `formatErrorForLog`, `inspect(error)`, `String(error)`, `error.message`, `error.name` or any other
  field/getter of a caught value in a log line or cause, unless the row is marked **L-full** and says
  why the thrown error cannot carry untrusted input or a secret (section 9b has the only three).
  Reading anything off an unknown error goes through `describeErrorForLog` only. Why: a caught
  error's text can quote untrusted input (a parsed file, a request, a tool argument) or a credential
  no redaction pattern recognises; two design reviews found such rows each time full text was the
  default. Hand-over is unchanged: a host sink/port still receives the original error object and
  applies its own policy.
- Helpers allowed, no others: `describeErrorForLog({ err })` (`@jini-ai/core`; browser code imports it
  from `@jini-ai/core/model-facing-tool-errors`), `reportRouteInternalError` (`@jini-ai/http-kit`),
  `describeApiError` (admin `src/core/transport/errors.ts`, relative import), `decodeApiError`
  (`@jini-ai/protocol`). `formatErrorForLog` only on an L-full row. Where `@jini-ai/core` cannot be
  imported (self-contained bundles, `@jini-ai/memory`) use variant **LB** (section 3).
- **Dependencies.** A package that imports a Jini package it does not declare gets the declaration
  in this change, per section 7 (package.json + `pnpm-lock.yaml` importer entry). Never a dynamic
  `import()` or optional peer to dodge it.
- Never attach a parse error of untrusted input as a cause, never log it with its message (it quotes
  the input). Never log request bodies, tokens, cookies, or the raw error object (`console.warn(text, error)`).
- Agent-plugin `.mjs` files, `cookie-consent/src/client`, `commerce/src/browser` are self-contained
  bundles: import nothing new there.
- Complexity: every changed function stays at or under 10 cyclomatic AND 10 cognitive.
- Tests: ONE file at a time, never a suite, never a full tsc; leave nothing running.
  vitest: `npx vitest run --maxWorkers=2 --minWorkers=1 <file>` from the package dir; node:test
  files (`import { test } from 'node:test'`): `node --import tsx --test --test-concurrency=1 <file>`.
  If `@jini-ai/core` resolves to a stale dist (`formatErrorForLog is not a function`), resolve it
  to `packages/core/src` with an UNTRACKED per-package config (vitest `resolveId` plugin, or a tsconfig
  `paths` file passed as `TSX_TSCONFIG_PATH`); never commit it.
- Per changed source file, one test in the nearest existing test file: write it, SEE RED, fix, GREEN,
  mutate (undo the fix's key line) and SEE RED, restore. Record each red and green run (command + the
  failing assertion line, then the passing line) in the report: a test nobody saw fail proves nothing.
  Existing tests that pin an old full-text log (`stringContaining('Error: disk full')`, `toContain('boom')`)
  are updated to the class in the same change; `rg -n "stringContaining\('Error: |toContain\('boom'\)" <package>/src`. Assert what the variant promises (table below);
  secret input is `new Error("boom api_key=SECRETSECRETSECRETSECRET")`; assert `SECRETSECRET` absent.
  Host-specific token shapes are the host's job (Part B), not Jini's default policy.

  | Variant | The test asserts |
  |---|---|
  | R | the thrown error's `.cause` IS the original (`toBe`), its message is unchanged |
  | RS, LS, RES-LS, LB | the cause/log text keeps its old fixed text and gains the class (+ code), e.g. `Error` or `Error(ENOENT)`; `boom`, a stack frame (the test file name) and `SECRETSECRET` are absent; RES-LS also: the returned result equals the old one exactly; LB also: an error whose `name` getter throws and one whose `name` is `"SECRETSECRETSECRETSECRET"` give `Error` |
  | L-full | the log line keeps its old text and gains `boom`, no `SECRETSECRET` |
  | U | an `AdminApiError` shows its own message; a plain `Error("credential: PRIVATEVALUE")` shows the row's fallback and `PRIVATEVALUE` is nowhere in the state |
  | DR, CN | status + the row's exact message; response `requestId` === the sink's `correlationId`; sink gets the route's own fields + the original error; with no sink the default log is `internal error (<logSource>, correlationId=<id>) Error` with no `boom`, no stack, no `SECRETSECRET` |
  | Q, MR | first failure reported once; a second failure in the same streak not reported; a success re-arms it; the queue/subscription/retry still runs the next attempt; a THROWING reporter is called once per streak too and leaves no unhandled rejection |
  | S1-S3, P | as written in section 5 |
  | C, V, VH | no test |
- Do not commit, push, stash, `git add -A` or `git checkout`. Leave changes in the tree.

## 2. Rule
Plain words (what failed + what to do) + Copy details; the incident is logged redacted under the same
ID; never a catch-all that drops the cause, never a generic "an internal error occurred". Not an
incident: invalid input / untrusted payload parse, expected refusals. Jini is a library: the HOST owns
the screen, the incident store and its own token shapes, so Jini hands the error over (typed throw
with cause, injected sink/port) or logs it redacted when nobody gets it. Hosts redact their own token
shapes in the sinks they inject and at their process log boundary (Part B).

## 3. Variants (before -> after)
- **R**: `catch { throw new X("t") }` -> `catch (error) { throw new X("t", { cause: error }) }`. If X
  cannot take a cause, give it an object-first optional arg `{ cause?: unknown } = {}` and pass
  `super(message, { cause })` (section 6 R-API lists the classes and their caller migrations).
- **RS** (secret path): same, but `{ cause: new Error(describeErrorForLog({ err: error })) }`. Keep the why-comment.
- **RES-LS** (every function that returns a result): keep the returned result EXACTLY; before the
  return add one line `console.warn("<given text>", describeErrorForLog({ err: error }))`. Use the
  module's existing `warn`/`log` port instead of console when one is in scope.
- **LS** (every best-effort step): the existing log line gets the cause's class/code: two-arg logger ->
  2nd arg `describeErrorForLog({ err: error })`; one-string port -> append
  `` ` Cause: ${describeErrorForLog({ err: error })}` ``; an optional port (`options.warn?.(...)`) becomes
  `(options.warn ?? console.warn)(...)`. A catch with no log gets
  `console.warn("<given text>", describeErrorForLog({ err: error }))`. Keep existing text and codes.
- **MR** (a retry loop that fails every few seconds): LS, reported once per failure streak (a flag set
  BEFORE reporting, cleared on success), with the default console when the port is omitted, through a
  reporter that cannot throw. Section 9 gives the code.
- **L-full** (opt-in only): as LS with `formatErrorForLog({ error })`. Only on a row that says why the
  thrown error cannot carry untrusted input or a secret. Rev 3 has three (section 9b).
- **LB** (no `@jini-ai/core` import possible: self-contained bundles, `@jini-ai/memory`): a fixed label
  from built-in class checks, never the value's own `name`/`message`/getters. One module-level function
  per file (plain JS in `.mjs`, typed in `.ts`):
  ```ts
  /** A fixed label for a caught value. Never reads its own fields: `name`/`message` are caller-controlled
   * and can quote a secret; `instanceof` on a hostile prototype chain can throw. O(1). */
  function errorClassLabel(error: unknown): string {
    try {
      if (error instanceof TypeError) return 'TypeError';
      if (error instanceof RangeError) return 'RangeError';
      if (typeof DOMException === 'function' && error instanceof DOMException) return 'DOMException';
      return error instanceof Error ? 'Error' : 'non-error value';
    } catch {
      return 'unreadable error'; // The original failure must stand, never a lookup error.
    }
  }
  ```
- **U** (Jini admin controller, host API call): `catch { set({ error: "t" }) }` ->
  `catch (error) { set({ error: describeApiError({ e: error, fallback: "t" }) }) }`. Never publish an
  incident: an `AdminApiError` was already reported by the host API port; anything else shows `t` and
  `describeApiError` logs its class/code (P3).
- **Q** (queued/polled work whose rejection nobody receives): report through the module's injected
  channel, once per failure streak (flag set BEFORE reporting), without stopping the queue/poll; a
  throwing reporter is contained. Section 5 Q gives the exact code.
- **CN** (consolidate a route pack's incident path onto `reportRouteInternalError`): section 6.
- **C-<kind>** (intentional drop; NO behaviour change): put a why-comment INSIDE the handler.
  `() => {}` -> `() => { /* why */ }`; `() => undefined` -> `() => { /* why */ return undefined; }`;
  `() => null` -> `() => { /* why */ return null; }`; `catch {}` -> `catch { /* why */ }`. If a why-comment
  already sits on the line above/after, MOVE it inside instead of adding a second. Texts by kind:
  queue `Queue tail only: the caller of the queued work receives its rejection.`;
  observed `Observed elsewhere; this only prevents an unhandled rejection.` (or the existing comment);
  cleanup `Best-effort cleanup: the original result or error stands.`;
  drain `Best-effort stream release; the response is already settled.`;
  optional `Optional input: missing or unreadable is treated as absent.`;
  wait `A timeout is expected here; the capture continues with what loaded.`;
  report `Reporting this failure has no further channel.`
- **V / VH / DONE**: no change (V = input/payload validation or expected refusal; VH = host API port
  owns the incident; DONE = worked example).
- Method-form handlers that drop the error behind a fixed message (`.catch(() => { warn("fixed") })`)
  are not found by the audit. In every file you touch, search for `.catch(() =>` and `catch {` and
  give each one a variant; list every extra site in the report with its variant.

## 4. Worked examples (read the matching one first)
- DR/CN: `packages/http-kit/src/internal-error.ts` + test `packages/http-kit/src/__tests__/internal-error.test.ts`;
  caller `packages/daemon/src/http/tool-execution-routes.ts` catalog catch, test
  `src/http/__tests__/tool-execution-rpc.test.ts` "remote tool catalog" (commits 1d14bb8a2, 76447baa5;
  metadata-only default line e4061b9de red, ef09da3c3 fix, 898ec8a21).
- LS (one-string port): `packages/commerce/src/payments/ingest/settlement-worker.ts`, test
  `__tests__/settlement-worker.unit.test.ts` (c9a3383a7; metadata-only e4061b9de red, ef09da3c3 fix).
- U: `packages/admin/src/media/controllers/providers.controller.ts`, test `src/media/__tests__/controllers.test.ts`
  (4717ae478, bf4043fce, c55eec038).

## 5. Special sites
- **S1** `packages/daemon/src/http/frontend-request-route.ts:54`: a THROWN `resolveOwner` is a fault,
  not a refusal. Add `onInternalError?: RouteInternalErrorSink` to the route's optional deps
  (`{ newRequestId, onInternalError }`). In the catch: `const apiError = reportRouteInternalError({ report: { source: 'frontend-request-owner', error }, logSource: 'frontend-request-owner', message: 'The page action could not be checked. Reload the page and try again; if it keeps failing, copy the request ID and report this problem.' }, { onInternalError });`
  then `res.status(500).json({ error: apiError.message, requestId: apiError.requestId });` — the route's
  existing flat `{ error: string }` shape plus `requestId`, so every reader of `body.error` keeps a string.
  The `null` owner -> 403 line stays.
  **Consumer (same change):** `packages/chat/src/react/features/chat-pane/create-frontend-request-caller.ts:35`:
  `const body: unknown = await response.json().catch(() => null);` (`/* Optional input: a non-JSON refusal body is treated as absent. */` inside the handler), then
  `const { message, requestId } = decodeApiError({ body }, { fallbackMessage: \`The page request was refused (HTTP ${response.status}).\` });`
  `throw new Error(requestId === undefined ? message : \`${message} (request ID ${requestId})\`);`.
  It reads the flat string, a nested `ApiError` and the new `requestId`; never `[object Object]`.
  Needs section 7 DEP-chat. Test (chat caller test file): string body -> its text; flat body with
  `requestId` -> text + `(request ID <id>)`; nested `{ error: { message, requestId } }` -> same; non-JSON
  body -> the HTTP-status fallback.
- **S2** `packages/daemon/src/http/remote-run-events.ts:225`: a failed `lifecycle.get` is reported as
  NOT_FOUND. Change to `.catch(() => LOOKUP_FAILED)` with a local `const LOOKUP_FAILED = Symbol('lookup failed')`
  and a why-comment inside the handler (`/* The lookup failure is reported with the original error below. */`);
  `if (status === LOOKUP_FAILED)` skip the NOT_FOUND/CONFLICT branches and fall through to the CN
  report below (section 6 gives its words). `undefined` keeps NOT_FOUND.
- **S3** `packages/platform/src/mail/sender-domain-verification.ts:43`: `.catch(() => null)` makes a
  failed key read say "the provider's key is not saved". Split: on rejection return
  `{ state: "unknown", domain, providerId, reason: "the provider's key could not be read" }` after
  `console.warn("[mail] provider key could not be read", describeErrorForLog({ err: error }))`; `null` keeps the old reason.
- **P** `packages/agent-plugins/cloudflare/worker/forms-receiver.mjs:105`: `catch (error) { const reference = crypto.randomUUID(); console.error(\`FORMS_STORE_FAILED reference=${reference} ${errorClassLabel(error)}\`); return errorPage({ status: 503, message: \`Your submission could not be saved. Try again in a few minutes. Reference: ${reference}\`, back }); }` with the section 3 LB `errorClassLabel` (plain JS) at module level (never the D1 message: it can carry SQL with form answers; never `error.name`: a getter can throw or carry text).
- **Q1** `packages/chat/src/react/hooks/useComposerHistory.hooks.ts:112` (write queue launched by an
  effect; nobody receives its rejection). Add `onWriteError?: (error: unknown) => void` to the hook's
  optional arg, default `reportComposerHistoryWriteFailure` (module-level:
  `console.warn("[composer-history] recent prompts could not be saved in this browser", describeErrorForLog({ err: error }))`,
  import from `@jini-ai/core/model-facing-tool-errors`). Add `const writeFailingRef = useRef(false);`. The chain becomes
  `.then(() => storage.write(...), ...)` ->
  `writeQueueRef.current.then(() => storage.write(...)).then(() => { writeFailingRef.current = false; }, (error: unknown) => { if (writeFailingRef.current) return; writeFailingRef.current = true; onWriteError(error); }).catch(() => { /* Reporting this failure has no further channel; the queue must keep running. */ })`
  (the streak flag is set BEFORE the reporter runs, so a throwing reporter is still called once per streak; the
  final `.catch` contains its exception).
  Keep the "Serialize writes" comment.
- **Q2** `packages/chat/src/core/assistant-client/durable-run-subscription.ts:77,88,140` (checkpoint
  reads; `read()` has `finally` recovery but nothing reports a failed read). Widen the optional logger to
  `logger?: Pick<Console, "info"> & Partial<Pick<Console, "warn">>` (default `console`). Add
  `let readFailing = false;` and one local function
  `function reportReadFailure(error: unknown) { if (readFailing) return; readFailing = true; try { (logger.warn ?? console.warn)("[durable-subscription] " + JSON.stringify({ runId, reason: "checkpoint-read-failed" }), describeErrorForLog({ err: error })); } catch { /* Reporting this failure has no further channel; reads keep their schedule. */ } }`
  (it is a `.catch` handler: a throwing `logger.warn` must not become an unhandled rejection)
  (metadata only, like the existing info line: a JSON parse error quotes the saved message). Replace the
  three `read().catch(() => undefined)` with `read().catch(reportReadFailure)`; in `read()` set
  `readFailing = false;` right after `ports.read` resolves. Recovery/scheduling is unchanged.

## 6. Consolidation (CN): one incident owner for every route pack
Every route pack below has its own copy of `defaultInternalErrorSink` + `reportInternalError` and most
answer `"an internal error occurred"`. Route each through `reportRouteInternalError({ report, logSource, message }, { onInternalError: deps.onInternalError })`
from `@jini-ai/http-kit`:
- KEEP each pack's exported `XInternalErrorContext` type, its `onInternalError?: (context: XInternalErrorContext) => void`
  dep and all its doc/"why" comments (move a sink's why-comment onto the call). `report` = the
  context's own fields minus `correlationId` (e.g. `{ source, runId, error }`); if TS cannot infer,
  pass the type argument `reportRouteInternalError<Omit<XInternalErrorContext, 'correlationId'>>(...)`.
- DELETE the local `defaultInternalErrorSink`/`default*InternalErrorSink` and the local
  `randomUUID()` + sink call; keep a local `reportInternalError` wrapper only when it picks the message.
  Remove imports (`inspect`, `redactSecrets`, `randomUUID`) only when nothing else in the file uses them.
- `logSource` = the label the old default line printed (it keeps `[@jini-ai/http-kit] internal error (<logSource>, correlationId=<id>)`;
  the owner now appends the class/code only, never the error text: the pack's old `inspect`/redacted line goes with its sink).
- `message` = the row's words. Never `"an internal error occurred"`.

| File | Sources -> message (all end with " Try again; if it keeps failing, copy the request ID and report this problem." unless written out) | logSource |
|---|---|---|
| `daemon/src/http/runs.ts:43,88` | keep its two existing messages | `source` |
| `daemon/src/http/attachments.ts:1422,1430` | `attachment-upload` "The file could not be attached."; `attachment-cleanup` "The attachment could not be removed." | `source` |
| `daemon/src/http/attachment-lookup-routes.ts:64` | add `onInternalError?: RouteInternalErrorSink` to the route's optional deps; unexpected lookup failure (not `AttachmentRejectedError`): source `attachment-lookup` "The attachment could not be looked up." | `attachment-lookup` |
| `daemon/src/http/media.ts:170,175` | `media-generate-dispatch` "The media could not be generated."; `media-task-store` "The media task could not be read or saved. Reload to check the task; if it keeps failing, copy the request ID and report this problem." | `source` |
| `daemon/src/http/terminals.ts:58,92` | `terminal-create` "The terminal could not be opened." | `source` |
| `daemon/src/http/db-ops.ts:197,239` | `db-inspect` "The database could not be inspected."; `db-verify` "The database check could not finish."; `db-vacuum` "The database could not be compacted." | `source` |
| `daemon/src/http/connectors.ts:139,164` | `auth`/`storage`/`db`/`realtime` -> "The sign-in / file storage / database / realtime provider could not finish this request." | `` `connectors/${source}.${operation}` `` |
| `daemon/src/http/remote-run-events.ts:59,235` | `tool-use` "The tool call could not be recorded for this run. Check the run status; copy the request ID and report this problem."; `tool-result` same with "tool result" (also reached by S2) | `` `remote-run-events/${source}` `` |
| `daemon/src/http/research.ts:153,236` | "The web research request could not be completed." (context has no `source`; report `{ error }`) | `research/search` |
| `daemon/src/http/xai.ts:217` + every `resolved.onInternalError({...})` (340, 358, 460, 520, 571, 590, 785, 801) | `oauth-start` "xAI sign-in could not start."; `oauth-complete` "xAI sign-in could not be completed."; `oauth-disconnect` "xAI could not be disconnected."; `auth-status` "The xAI connection status could not be read."; `search` "The X search could not be completed." Keep every `redactError(error)` wrapper (secret path). Calls with no HTTP answer (340, 358) ignore the return value. Delete `INTERNAL_ERROR_MESSAGE`. | `` `xai/${source}` `` |
| `daemon/src/http/delegated-tools.ts:157,182` | the model reads this: "The tool could not run because of a server fault. Do not retry the same call; tell the user to copy the request ID and report this problem." Keep `describeSafely` precedence: `const apiError = reportRouteInternalError({ report, logSource: report.source, message }, { onInternalError: deps.onInternalError }); const described = describeSafely(deps, { ...report, correlationId: String(apiError.requestId) }); return described === undefined ? apiError : createApiError({ code: 'INTERNAL_ERROR', message: described }, { requestId: apiError.requestId });` (`onInternalError` still runs first, as its doc says). `describeSafely`'s own console line (`:176`) uses `describeErrorForLog({ err: error })`. | `source` |
| `daemon/src/http/model-proxy.ts:156,452,579,645` | "The model request failed on the server." Context field is `provider`, not `source`: report `{ provider, error }`. Registration passes `deps.onInternalError` through (no `?? defaultInternalErrorSink`). The unrecognized-provider branch of `reportCatchAllError` calls the owner WITHOUT a sink (keep its why-comment). Use the returned `requestId` where `correlationId` was used. | `` `model-proxy/${provider \|\| 'unknown'}` `` |
| `daemon/src/http/frontend-sessions.ts:132,336-340` | stream: "The page connection could not be opened. Reload the page; if it keeps failing, copy the request ID and report this problem." Pre-header answer becomes `res.status(500).json({ error: apiError })` (now WITH the request ID). The `reportInternalError` wrapper and its own sink-failure catch go (the owner logs a failing sink). Context gains `correlationId` (additive). Also `:328` responses-route `catch { res.sendStatus(403); }`: a THROWN `resolveOwner` is a fault -> source `responses-owner`, "The page could not confirm this browser session. Reload the page; ..." with `res.status(500).json({ error: apiError })`; a null/unowned session keeps 403. **Facade:** `daemon/src/http/frontend-control.ts:78` adds `'onInternalError'` to the `session` `Pick<FrontendSessionsHttpDeps, ...>`; the facade already spreads `options.session` into the route deps (`:172`), so the host's sink reaches the stream/responses catches with no other change (Tovu wires it in T1). Test in `frontend-control.test.ts`: a `session.onInternalError` given to `createFrontendControl` receives a failing stream's `{ source, error, correlationId }` and the answer carries the same `requestId`. | `` `frontend-sessions:${source}` `` |
| `http-kit/src/adapter.ts:38,205` | keep its existing message ("The server could not finish this request. Check whether your change was saved, then copy the request ID and report this problem."); report `{ method: spec.method, path: spec.path, error: e }` | `` `${spec.method.toUpperCase()} ${spec.path}` `` |

Not consolidated (say so in the report): `daemon/src/run-lifecycle.ts` `reportInternalError` (not a
route: no caller answer; it already contains a throwing sink). Its default lines become LS (section 9b). Wording-only rows, same rule:
`admin/src/redirects/adapters/memory.ts:83` fallback -> "The redirects could not be saved. Try again."
`cms/src/redirects/redirects.ts:859` fallback -> "The redirects could not be imported. Check the file and try again."
Tests: one CN case per file (variant table), in that file's existing test file; update existing
assertions that pinned `'an internal error occurred'` to the new words.

### R-API: constructors and helpers that take the cause (object-first)
- `plugins/src/host/plugin-tool-errors.ts:3` `PluginInstallError` -> `constructor({ code, message }: { readonly code: string; readonly message: string }, { cause }: { readonly cause?: unknown } = {})`,
  `super(message, cause === undefined ? undefined : { cause })`, keep `readonly code`. Migrate every Jini
  caller (4): the two local helpers `plugins/src/host/node/install.ts:71` and
  `plugins/src/host/node/archive-policy.ts:50` keep their signature `fail(code: string, message: string): never`
  (private, not changed by this prompt) and only their body becomes `throw new PluginInstallError({ code, message });`
  — do NOT rewrite their ~36 in-file calls; tests `plugins/src/host/tools/__tests__/public-entry.test.ts:63`,
  `plugins/src/host/__tests__/unit/loader.unit.test.ts:38` pass `{ code, message }`. The one R site (install.ts:222)
  throws directly: `catch (error) { throw new PluginInstallError({ code: "PLUGIN_ID_CONFLICT", message: "The publisher-qualified plugin id conflicts with an installed package." }, { cause: error }); }`.
  Tovu callers move in Part B (T6). `PluginSourceError` is untouched.
- `mcp/src/federation/hosted/unconfigured-error.ts:5` `ExternalMcpSecretStoreUnconfiguredError` ->
  `constructor({ message }: { readonly message: string }, { cause }: { readonly cause?: unknown } = {})`; its 3 callers
  `mcp/src/federation/hosted/store.ts:1199,1363,1388` pass `{ message: "..." }`. Tovu test caller in T6.
- `desktop-host/src/render-service.ts:70` `RenderServiceError` (already object-first) gains `{ cause }: { readonly cause?: unknown } = {}`
  and passes `super(message, cause === undefined ? undefined : { cause })`; its ~32 callers are unchanged (optional arg).
- `OAuthError` (`oauth/src/errors.ts:18`) ALREADY takes `cause` in its 2nd arg `OAuthErrorOptions`: pass it, change nothing there.
- `AgentPluginInstallError` ALREADY takes `{ cause }`.

## 7. Dependencies (DEP): declare what the new imports need, per package convention
Edit package.json AND the matching `pnpm-lock.yaml` importer block (copy the shape of a sibling entry:
`'@jini-ai/core':` / `specifier: workspace:^` / `version: link:../core`, keys sorted). Do not run an install.
- **DEP-cookie-consent**: `dependencies: { "@jini-ai/core": "workspace:^" }` (runtime; only `src/server` imports it). Lockfile `packages/cookie-consent` gains a `dependencies:` block.
- **DEP-provider-plugins**: `devDependencies` `"@jini-ai/core": "workspace:^"` — this package BUNDLES its Jini deps (scripts/build.ts fails on an unbundled runtime dep), so build deps go in devDependencies like its other `@jini-ai/*`. Lockfile devDependencies.
- **memory: NO new dependency.** `@jini-ai/memory` deliberately has no runtime dependencies (see the
  `src/text-scan.ts` file comment). Its RS site (section 9) uses an inline class-name cause, not core.
- **DEP-chat**: `@jini-ai/protocol` moves to `dependencies` (`workspace:^`); remove it from
  `peerDependencies`, `peerDependenciesMeta` and the `optionalPeers` message map (S1 consumer imports it from `chat/react`). Lockfile `packages/chat`: move the entry from devDependencies to dependencies.
- admin already done (P3: `@jini-ai/core` is a required peer).
- Check: every other package you add a core import to already lists `@jini-ai/core` in dependencies or as a required peer (admin, agent-plugins, agent-runtime, analytics, chat, cms, commerce, daemon, db, desktop-host, devops, integrations, mcp, oauth, platform, plugins, search, ui all do). If you find one that does not, declare it the same way and report it.

## 8. Sites (293 audit sites; 287 to do or confirm, 6 DONE)
Format: `path:line` - flagged text - note. Variant = the section heading. Counts: U 8, R 5, RS 6,
RES-LS 15, LS 41, S 3, P 1, Q 4, C 145 (queue 16, observed 25, cleanup 47, drain 14,
optional 26, wait 4, report 13), VH 3, V 56, DONE 6. Rev 3 moved the 10 former RES rows to RES-LS and
the 35 former L rows to LS (section 1 logging default); no row in this list is L-full. Section 6 CN
files and sections 9/9b sites are extra (not in the 293).

### U (8)
- `packages/admin/src/security/controllers/access-tokens.controller.ts:22` - `"Credential store unavailable"` - fallback 'Credential store unavailable'
- `packages/admin/src/security/controllers/access-tokens.controller.ts:24` - `"Provider catalog unavailable"` - fallback 'Provider catalog unavailable'
- `packages/admin/src/security/controllers/other-credentials.controller.ts:10` - `"Credential store unavailable"` - fallback 'Credential store unavailable'
- `packages/admin/src/security/controllers/other-credentials.controller.ts:34` - `"Unable to update credential"` - fallback 'Unable to update credential'
- `packages/admin/src/security/controllers/root-key.controller.ts:21` - `"Root key status unavailable"` - fallback 'Root key status unavailable'
- `packages/admin/src/security/controllers/root-key.controller.ts:28` - `"Recovery refused. Check the host key configuration."` - fallback 'Recovery refused. Check the host key configuration.' (the server's refusal text now wins)
- `packages/admin/src/security/controllers/root-key.controller.ts:48` - `"Recovery preview unavailable"` - fallback 'Recovery preview unavailable'
- `packages/admin/src/source-control/controllers/source-control.controller.ts:30` - `"Provider catalog unavailable"` - fallback 'Provider catalog unavailable'

### R (5)
- `packages/agent-plugins/src/lifecycle/host-tools/identity.ts:55` - `"The installed plugin identity manifest could not be read."` - SPLIT the read from the parse (the one `try` covers both; a JSON parse error quotes the file). Replace lines 54-55 with:
  `let text: string;`
  `try { text = await readText(path.join(plugin.packageRoot, 'plugin.json')); }`
  `catch (error) { throw new Error('The installed plugin identity manifest could not be read.', { cause: error }); }`
  `try { manifest = JSON.parse(text); }`
  `catch { /* Untrusted file content: the parse error quotes it, so no cause. */ throw new Error('The installed plugin identity manifest could not be read.'); }`
  Test (no identity test exists: add a new `packages/agent-plugins/src/lifecycle/__tests__/unit/identity.unit.test.ts`, vitest): a rejecting `readText` -> `.cause` is that error; `readText` resolving `'{"x": "PRIVATEVALUE'` -> no `.cause`, `PRIVATEVALUE` absent from the message.
- `packages/agent-plugins/src/lifecycle/install.ts:214` - `"The publisher-qualified plugin id conflicts with an installed package."` - AgentPluginInstallError already takes `{ cause }`
- `packages/agent-runtime/src/providers/response-text.ts:19` - `"Provider response could not be read within the byte limit"` - plain Error: `{ cause: error }`
- `packages/desktop-host/src/electron/electron-url-capture.ts:77` - `"native capture session cleanup failed"` - `catch (error) { throw new RenderServiceError({ code: 'load-failed', message: 'native capture session cleanup failed' }, { cause: error }); }` (section 6 R-API widens the class)
- `packages/plugins/src/host/node/install.ts:222` - `"The publisher-qualified plugin id conflicts with an installed package."` - section 6 R-API: throw `PluginInstallError` directly with `{ cause: error }`; the local `fail` helper is not widened

### RS (6)
- `packages/agent-plugins/src/lifecycle/fetch-archive.ts:167` - `"archive request failed"` - keep the why-comment; replace `cause: new Error("archive request failed")` with `cause: new Error(describeErrorForLog({ err: error }))`
- `packages/mcp/src/federation/hosted/store.ts:1362` - `"Stored OAuth credentials could not be decrypted."` - section 6 R-API (object-first class): `throw new ExternalMcpSecretStoreUnconfiguredError({ message: "Stored OAuth credentials could not be decrypted." }, { cause: new Error(describeErrorForLog({ err: error })) });`
- `packages/oauth/src/authorization-code.ts:62` - `"the OAuth authorization request configuration is invalid"` - OAuthError already takes `cause` in its 2nd arg: `throw new OAuthError({ ...unchanged }, { cause: new Error(describeErrorForLog({ err: error })) });` keep the "Upstream errors may contain supplied metadata" comment
- `packages/oauth/src/discovery.ts:74` - `"the OAuth metadata endpoint did not return a JSON object"` - same (the `if (fetch.failure) throw ...` line stays first; keep its comment)
- `packages/oauth/src/oidc.ts:63` - `"the OpenID Connect ID token could not be validated"` - same (the `if (guardedFetch.failure) throw ...` line stays first; keep its comment)
- `packages/platform/src/child-environment.ts:119` - `"Login shell environment unavailable"` - a login-shell read error can quote env values

### RES-LS (15)
Every row: keep the result, log `<text>` with `describeErrorForLog`. `(was RES)` marks the 10 rows that
logged full text in rev 2; each error comes from I/O, DNS, a child process, a provider or a host port and
can quote a path, host name, URL, command or stored value, so none passes the L-full bar.
- `packages/agent-plugins/src/admin-surfaces/external-links.ts:74` - `"The host could not open the link. Try again."` - (was RES) LS log '[admin-surfaces] the host could not open a plugin link'
- `packages/agent-plugins/src/lifecycle/capability-projection.ts:34` - `"File request refused: the installed skill folder is missing, unreadable, or outside the package. Valid sup...` - LS log (the why-comment at skill-file-reader.ts: no paths cross this seam) '[agent-plugins] skill folder could not be read'
- `packages/agent-plugins/src/lifecycle/provider-contribution.ts:97` - `"its parser failed"` - **RES-LS** (the parser receives raw manifest text; its exception can quote it): `catch (error) { console.warn('[agent-plugins] a provider contribution parser threw', describeErrorForLog({ err: error })); return { ok: false, reason: 'its parser failed' }; }`; keep the "A throwing seam parser is a refused manifest" doc comment
- `packages/agent-runtime/src/model-discovery.ts:232` - `"Launch configuration could not be read."` - LS log (launch config can hold keys) '[model-discovery] launch configuration could not be read'
- `packages/agent-runtime/src/providers/connection-guard.ts:168` - `"DNS lookup failed"` - (was RES) LS log '[connection-guard] DNS lookup failed for a provider host'
- `packages/cms/src/media/video-frames.ffmpeg.ts:330` - `"Video preview temporary files could not be removed."` - (was RES) LS log '[video-frames] preview temporary files could not be removed'
- `packages/commerce/src/catalog-tools.ts:53` - `"The catalog record was saved. The storefront size could not be checked; the grid shows at most 24 priced p...` - (was RES) LS log '[commerce] storefront size check failed after a catalog save'
- `packages/daemon/src/agent-executor/launch.ts:1141` - `"Folder-limited launch refused: invalid filesystem root, working directory or attachment path."` - (was RES) LS log '[agent-executor] folder-limited launch refused'
- `packages/daemon/src/agent-executor/launch.ts:1182` - `"Folder-limited launch refused: invalid host settings or private runtime directory."` - (was RES) LS log '[agent-executor] folder-limited launch unsupported'
- `packages/daemon/src/agent-executor/launch.ts:898` - `"AgentExecutor: could not prepare agent command"` - LS log (command/env can hold keys) '[agent-executor] agent command could not be prepared'
- `packages/daemon/src/tool-access-lowering.ts:52` - `"Couldn't stop everything the agent started after tool access changed."` - (was RES) LS log '[tool-access] could not stop a run after tool access changed'
- `packages/devops/src/dns/delegation.ts:29` - `"The DNS query failed before an answer arrived."` - (was RES) LS log '[dns] query failed before an answer arrived'
- `packages/devops/src/dns/node/resolver.ts:141` - `"The DNS query failed before an answer arrived."` - (was RES) LS log '[dns] parent nameserver query failed'
- `packages/provider-plugins/src/payments-stripe/http.ts:54` - `"payment provider request could not be confirmed"` - LS log (payment provider call with key) '[payments] provider request could not be confirmed'
- `packages/search/src/indexer.ts:58` - `"search provider threw"` - (was RES) LS log '[search] provider threw'

### LS, formerly L (35)
Rev 3: every row here is LS (section 3). Each error comes from I/O, a host/plugin port, a provider, a
database or a browser API and can quote a path, URL, row value, request or stored text; none passes the
L-full bar. Where a note below says what the log line says, keep that text and append the class/code.
- `packages/agent-plugins/src/connect/connect-tool.ts:421` - `const plugin = await routeDeps.resolveInstalledPlugin(pluginId).catch(() => null);` - '[connect] installed plugin could not be read; key cards omitted from the hint'
- `packages/agent-plugins/src/connect/plugin-credential-card.ts:67` - `"[plugin-credential-cards] Optional card lookup failed; using the default credential form."` - one-string port (options.warn ?? console.warn): append Cause
- `packages/agent-plugins/src/lifecycle/capability-projection.ts:59` - `} catch {` - SPLIT the read from the parse (the one `try`
  covers both `readFile` and `JSON.parse(plugin.json)`; a parse error quotes the manifest). Add a local function beside
  `readInstalledMcpConfig` (keeps that function's complexity where it is):
  ```ts
  /** plugin.json for the MCP config parser, or undefined. A read failure logs its class/code; a parse
   * failure logs fixed text only (the parse error quotes untrusted file content). */
  async function readInstalledManifest(packageRoot: string): Promise<unknown> {
    let text: string;
    try { text = await readFile(await assertContainedOnDisk(packageRoot, "plugin.json"), "utf8"); }
    catch (error) { console.warn("[agent-plugins] plugin.json could not be read for MCP config", describeErrorForLog({ err: error })); return undefined; }
    try { return JSON.parse(text); }
    catch { console.warn("[agent-plugins] plugin.json is not valid JSON; MCP config read without it"); return undefined; }
  }
  ```
  and replace lines 56-62 (`let manifest` ... the empty `catch {}` block) with `const manifest = await readInstalledManifest(packageRoot);`.
  Test in `__tests__/unit/capability-projection.mcp-read.unit.test.ts`: a `plugin.json` of `'{"x": "PRIVATEVALUE'` -> the warn
  has the fixed text and `PRIVATEVALUE` is in no console argument; a rejecting `readFile` for plugin.json -> the warn has the class.
- `packages/chat/src/core/assistant-client/transport.ts:781` - `const adopted = await ensureConversationId({}, {}).catch(() => null);` - '[assistant-client] conversation id could not be created; the run continues unsaved'
- `packages/chat/src/core/assistant-client/transport.ts:844` - `await persistUserTurn({ conversationId, message }, {}).catch(() => undefined);` - '[assistant-client] the user turn could not be saved' (owner decision D5: user-visible?)
- `packages/chat/src/react/features/chat-pane/hooks/useChatPaneAgentControl.hooks.ts:283` - `void Promise.resolve(registered).catch(() => undefined);` - '[chat-pane] page tool registration failed'
- `packages/chat/src/server/durable-runs/recover.ts:156` - `await ports.cancelAttempt(run, {}).catch(() => undefined);` - '[durable-runs] attempt could not be cancelled before finalize'
- `packages/chat/src/server/durable-runs/recover.ts:196` - `await ports.cancelAttempt(run, {}).catch(() => undefined);` - same text
- `packages/cms/src/forms/submit-service.ts:269` - `"form upload free-disk check unavailable; allowing attachments"` - logger.warn({ message }): append Cause to message; keep the inner try/catch
- `packages/cms/src/widgets/read-service.ts:117` - `"[widgets] listWidgetInstances: skipping malformed widget-instance row"` - keep the why-comment; the log line in this catch gets describeErrorForLog
- `packages/commerce/src/catalog/plugin-server.ts:136` - `"Commerce storage could not be prepared. Checkout is temporarily unavailable."` - one-string warnUnavailable: append Cause
- `packages/commerce/src/payments/accounting/apply-evidence.ts:193` - `.catch(() => undefined);` - '[payments] over-withdrawn alert could not be raised'
- `packages/commerce/src/payments/ingest/worker.ts:241` - `for (const alert of alerts) await port.raise({ alert }).catch(() => undefined);` - '[payments] alert could not be raised' (keep the why-comment)
- `packages/commerce/src/payments/ops/common.ts:170` - `await deps.alerts.raise({ alert }).catch(() => undefined);` - '[payments] alert could not be raised'
- `packages/cookie-consent/src/server/receipt.ts:75` - `await store.retire({ id: previousId }).catch(() => undefined);` - '[consent] superseded receipt could not be retired' (keep the why-comment)
- `packages/daemon/src/agent-executor/http-mcp.ts:87` - `"the HTTP listener could not start"` - console.warn line: add describeErrorForLog
- `packages/daemon/src/http/cancel-owned-runs.ts:45` - `await Promise.all(active.map((run) => runs.cancel({ runId: run.id }).catch(() => { })));` - '[runs] a run could not be cancelled'
- `packages/daemon/src/remote-tool-executor.ts:198` - `surfaces = surfaces.then(() => emitSurface?.(line.emission)).catch(() => undefined);` - '[remote-tool-executor] a tool surface could not be delivered'
- `packages/db/src/pglite/socket-server.ts:288` - `void this.queue.rollbackIfOwned(this.id).catch(() => {});` - '[pglite] rollback after disconnect failed'
- `packages/db/src/sqlite/db-ops.ts:78` - `await fs.rm(artifactRef, { force: true }).catch(() => undefined);` - '[db-ops] a database export file could not be removed' (it can hold data)
- `packages/db/src/tools/transfer-tools.ts:103` - `await deps.files.unlink(artifactRef).catch(() => undefined);` - '[db-transfer] a transfer file could not be removed' (it can hold data)
- `packages/desktop-host/src/electron/navigation-policy/window-navigation-policy.ts:166` - `} catch {` - '[navigation] the external browser could not be opened' (keep the why-comment; the catch must still not rethrow)
- `packages/integrations/src/media-providers/dispatch/operation-runtime.ts:192` - `await deps.store.update({ id: operationId, patch: { status: 'failed', error: toOperationError(submitted.err...` - '[media-operations] failed status could not be saved; the row stays submitted' (keep the why-comment)
- `packages/oauth/src/refresh.ts:139` - `}).catch(() => undefined);` - '[oauth] refresh lease could not be released'
- `packages/platform/src/download.ts:745` - `await writeJson(target.manifestPath, next).catch(() => undefined);` - '[download] partial-download manifest could not be written'
- `packages/platform/src/download.ts:783` - `await rm(target.lockPath, { force: true }).catch(() => undefined);` - '[download] download lock could not be removed'
- `packages/platform/src/download.ts:789` - `await rm(lock.path, { force: true }).catch(() => undefined);` - same text
- `packages/platform/src/mail/resolve-mailer.ts:279` - `const email = await state.options.readSenderEmail?.().catch(() => undefined);` - '[mail] sender settings could not be read; treated as unset' (keep the doc comment)
- `packages/platform/src/mail/sender-domain-verification.ts:35` - `const email = await deps.readSenderEmail().catch(() => undefined);` - '[mail] sender email could not be read'
- `packages/platform/src/mail/sender-domain-verification.ts:68` - `const [providerId, domain] = await Promise.all([deps.readProviderId().catch(() => null), senderDomain(deps)]);` - '[mail] provider id could not be read'
- `packages/platform/src/mail/sender-domain-verification.ts:70` - `const provider = providerId === null ? undefined : await deps.findProvider({ id: providerId }).catch(() => ...` - '[mail] provider could not be found'
- `packages/ui/src/features/connectors/hooks/useConnectorCatalog.ts:45` - `"[connectors] Catalog load failed."` - console.error line: add describeErrorForLog
- `packages/ui/src/features/connectors/hooks/useConnectorCatalog.ts:73` - `"[connectors] Catalog enrichment failed."` - same
- `packages/ui/src/features/execution/react/hooks/use-execution-credential.hooks.ts:266` - `.catch(() => undefined);` - '[execution] saved credential view could not be loaded'
- `packages/ui/src/features/panel-kit/helpers/standing-draft-local-backup.ts:55` - `"standing-draft local backup: could not write"` - keep the comment; console.warn gets describeErrorForLog; remove the eslint-disable only if lint does not need it (it does not: no no-console rule)

### LS (6)
- `packages/agent-runtime/src/agent-protocol/pi-rpc/session.ts:214` - `"[pi-rpc] Image attachment could not be read; skipping it."` - why-comment: filesystem errors carry private paths; keep it; append Cause: describeErrorForLog
- `packages/analytics/src/forwarding.ts:250` - `"beforeIngest handler threw"` - why-comment: plugin exception may carry the hit/secret; message becomes `beforeIngest handler threw (${describeErrorForLog({ err: error })})`
- `packages/devops/src/deploy/ops-runner.ts:220` - `"[deploy-ops] destination history write failed after accepted deploy"` - why-comment: DB params can carry credentials; keep it
- `packages/platform/src/mail/delivery-wrapper.ts:62` - `"[mail] activity observation failed"` - observation events carry recipient addresses; append Cause: describeErrorForLog to the one string
- `packages/platform/src/mail/domain-read.ts:25` - `const credential = await resolveDomainReadCredential({ id: providerId }).catch(() => null);` - '[mail] domain-read credential could not be resolved'
- `packages/platform/src/mail/sender-domain-verification.ts:47` - `const result = await readMailDomain({ ctx, providerId, read: context => provider.domainStatus!(context, { d...` - '[mail] domain status read failed'

### S (3)
- `packages/daemon/src/http/frontend-request-route.ts:54` - `"The browser session could not be verified for this page action."` - see section 5 S1
- `packages/daemon/src/http/remote-run-events.ts:225` - `const status = await deps.lifecycle.get({ runId }).catch(() => undefined);` - see section 5 S2
- `packages/platform/src/mail/sender-domain-verification.ts:43` - `const credential = await deps.resolveCredential({ id: providerId }).catch(() => null);` - see section 5 S3

### P (1)
- `packages/agent-plugins/cloudflare/worker/forms-receiver.mjs:105` - `"Your submission could not be saved. Try again in a few minutes."` - see section 5 P

### Q (4) — section 5 Q1/Q2
- `packages/chat/src/react/hooks/useComposerHistory.hooks.ts:112` - write queue launched by an effect - Q1
- `packages/chat/src/core/assistant-client/durable-run-subscription.ts:77` - `read().catch(() => undefined)` - Q2
- `packages/chat/src/core/assistant-client/durable-run-subscription.ts:88` - same - Q2
- `packages/chat/src/core/assistant-client/durable-run-subscription.ts:140` - same - Q2

### C-queue (16)
- `packages/admin/src/media/controllers/library.controller.ts:140` - `writes = operation.catch(() => undefined);`
- `packages/agent-plugins/src/connect/executable/register.ts:124` - `queue = run.catch(() => undefined);`
- `packages/agent-plugins/src/lifecycle/automatic-use.ts:281` - `queue = next.catch(() => undefined);`
- `packages/agent-runtime/src/providers/oauth-tokens.ts:99` - `const task = prev.catch(() => {}).then(fn);`
- `packages/agentic/src/skills/install/install-service.ts:78` - `const result = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(work);`
- `packages/cms/src/forms/repo.memory.ts:181` - `this.turn = run.catch(() => undefined);`
- `packages/commerce/src/payments/ledger/repo.memory.ts:490` - `tail = run.catch(() => undefined);`
- `packages/cookie-consent/src/node/index.ts:54` - `const pending = (writes.get(directory) ?? Promise.resolve()).catch(() => undefined).then(operation);`
- `packages/daemon/src/terminal-session.ts:191` - `const task = prior.catch(() => undefined).then(fn);`
- `packages/mcp/src/core/config.ts:270` - `const task = prev.catch(() => {}).then(() => doWrite(dataDir, body, filesystem));`
- `packages/mcp/src/core/tokens.ts:211` - `const task = prev.catch(() => {}).then(fn);`
- `packages/mcp/src/federation/hosted/store.memory.ts:57` - `this.pending = result.catch(() => {});`
- `packages/mcp/src/federation/reload.ts:180` - `queuedNext = runningPass.catch(() => undefined).then(() => {`
- `packages/oauth/src/file-registration-cache.ts:44` - `queue = attempt.catch(() => undefined);`
- `packages/oauth/src/registration-cache.ts:77` - `await inFlight.get(key)?.catch(() => undefined);`
- `packages/vibecoding/src/node/project.ts:168` - `queue = next.catch(() => {});`

### C-observed (25)
- `packages/admin/src/redirects/controllers/redirects.controller.ts:28` - `void actions().toggle(rule).catch(() => {});`
- `packages/admin/src/redirects/controllers/redirects.controller.ts:40` - `void actions().remove(rule).catch(() => {}).finally(() => store.set({ patch: { pendingDelete: null } }));`
- `packages/chat/src/react/hooks/assistant-chats.ts:980` - `.catch(() => null));`
- `packages/core/src/fetch/cache.ts:190` - `void pending.catch(() => {});`
- `packages/daemon/src/http/frontend-control.ts:217` - `.catch(() => undefined);`
- `packages/daemon/src/routines/scheduler.ts:417` - `.catch(() => {});`
- `packages/db/src/kernel/pglite/driver.ts:48` - `ready.catch(() => {});`
- `packages/db/src/kernel/pglite/driver.ts:63` - `await ready.catch(() => {});`
- `packages/desktop-host/src/electron/electron-url-capture.ts:172` - `await initialReset?.catch(() => {});`
- `packages/diagnostics/src/observability/report-error.ts:97` - `if (result instanceof Promise) { void result.then(accepted).catch(() => {}); return false; }`
- `packages/diagnostics/src/web-evidence/page-work-budget.ts:55` - `void closing.catch(() => {});`
- `packages/infra/src/events/outbox/fenced-conformance.ts:132` - `await first.rollback().catch(() => undefined);`
- `packages/infra/src/events/outbox/fenced-conformance.ts:51` - `const receipt = await pending.catch(() => undefined);`
- `packages/infra/src/events/outbox/worker.ts:331` - `gate.catch(() => {});`
- `packages/integrations/src/media-providers/dispatch/operation-runtime.ts:229` - `void settle.catch(() => undefined);`
- `packages/mcp/src/server/http-tool-server.adapter.ts:167` - `await sessionConnection?.catch(() => {});`
- `packages/oauth/src/loopback-receiver.ts:144` - `result.catch(() => undefined);`
- `packages/platform/src/download.ts:987` - `}).catch(() => undefined);`
- `packages/plugins/src/host/node/module-snapshot.ts:190` - `void ready.catch(() => undefined);`
- `packages/plugins/src/host/node/runtime-core.ts:710` - `attached.catch(() => {});`
- `packages/sidecar/src/supervision/supervisor-node.ts:253` - `).catch(() => {}).finally(() => { handling--; }); // A disconnected peer cannot receive its reply.`
- `packages/ui/src/features/panel-kit/fetch-query/adapter.react.tsx:108` - `void promise.catch(() => {});`
- `packages/ui/src/features/panel-kit/fetch-query/adapter.tanstack.tsx:183` - `void promise.catch(() => {});`
- `packages/ui/src/features/resource-dashboard/react/components/ResourceRowList.tsx:94` - `list.dispatchRowAction(id, () => onRowAction(id, kind)).catch(() => {});`
- `packages/user-management/src/react/members/hooks/use-members.hooks.ts:168` - `await listLoader.load().catch(() => {}); // Await roster settlement; list.error owns a failed read, not the...`

### C-cleanup (47)
- `packages/agent-plugins/core/persistent-state.js:150` - `catch (error) { if (frozen) await fs.chmod(source, mode).catch(() => undefined); throw error; }`
- `packages/agent-plugins/src/lifecycle/activation.ts:890` - `} catch {`
- `packages/agent-plugins/src/lifecycle/skill-file-reader.ts:109` - `return readOpened(handle).catch(() => ({ refusal: UNREADABLE })).finally(() => handle.close().catch(() => {...`
- `packages/agent-plugins/src/lifecycle/uninstall.ts:366` - `await chmod(packageRoot, originalMode).catch(() => undefined);`
- `packages/agent-plugins/src/lifecycle/uninstall.ts:385` - `await chmod(tree.original, tree.originalMode).catch(() => undefined);`
- `packages/agent-plugins/src/lifecycle/uninstall.ts:481` - `await chmod(dir, 0o700).catch(() => undefined);`
- `packages/agent-plugins/src/lifecycle/uninstall.ts:490` - `await chmod(absolute, 0o600).catch(() => undefined);`
- `packages/agent-runtime/src/agent-protocol/acp/models.ts:419` - `} catch {}`
- `packages/agent-runtime/src/model-discovery-adapters.ts:272` - `const killTree = () => { if (tree && child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } };`
- `packages/cms/src/media/plugins/document-text/unpdf.ts:48` - `const abort = () => { void destroy().catch(() => undefined); }; // Observed again by finally.`
- `packages/daemon/src/http/attachments.ts:1047` - `await rmdir(batchDirectory).catch(() => undefined);`
- `packages/daemon/src/http/attachments.ts:1271` - `await rm(filePath, { force: true }).catch(() => undefined);`
- `packages/daemon/src/http/attachments.ts:1577` - `await deps.store.deleteUnclaimed({ batchId, paths: [] }).catch(() => undefined);`
- `packages/db/src/data-modules/snapshot.ts:104` - `await fs.rm(snapshotPath, { force: true }).catch(() => {});`
- `packages/db/src/pglite/owner.ts:469` - `await server?.stop().catch(() => {});`
- `packages/db/src/pglite/owner.ts:470` - `await db?.close().catch(() => {});`
- `packages/desktop-host/src/electron/electron-url-capture.ts:159` - `{ timeoutMs: CAPTURE_CLEANUP_TIMEOUT_MS }).catch(() => {});`
- `packages/desktop-host/src/sidecar.ts:191` - `await logHandle?.close().catch(() => undefined);`
- `packages/desktop-host/src/sidecar.ts:201` - `await appendFile(logPath, '${message}\n', 'utf8').catch(() => undefined);`
- `packages/diagnostics/src/web-evidence/public-page.ts:176` - `void result.browser.close().catch(() => {});`
- `packages/diagnostics/src/web-evidence/public-page.ts:243` - `else await budget.release({ close: () => opened.browser.close().catch(() => {}) });`
- `packages/diagnostics/src/web-evidence/render-page.ts:144` - `void opened.close().catch(() => {});`
- `packages/diagnostics/src/web-evidence/render-page.ts:158` - `await budget.run({ work: async () => { await context.routeWebSocket?.(/.*/, socket => socket.close().catch(...`
- `packages/diagnostics/src/web-evidence/render-page.ts:168` - `await route.abort("blockedbyclient").catch(() => {});`
- `packages/diagnostics/src/web-evidence/render-page.ts:311` - `const onAbort = () => { void context?.close().catch(() => {}); };`
- `packages/diagnostics/src/web-evidence/render-page.ts:320` - `if (context) await budget.release({ close: () => context!.close().catch(() => {}) });`
- `packages/diagnostics/src/web-evidence/request-guard.ts:275` - `await route.abort(reason === "failed" ? "failed" : "blockedbyclient").catch(() => {});`
- `packages/diagnostics/src/web-evidence/request-guard.ts:283` - `: DROPPED_RESPONSE_HEADERS), body: resource.body }).catch(() => {});`
- `packages/diagnostics/src/web-evidence/request-guard.ts:304` - `return route.abort("aborted").catch(() => {});`
- `packages/mcp/src/federation/adapter.http.ts:213` - `}).catch(() => undefined);`
- `packages/mcp/src/federation/adapter.http.ts:469` - `await session.close({}).catch(() => undefined);`
- `packages/mcp/src/federation/bootstrap.ts:323` - `await session?.close({}).catch(() => undefined);`
- `packages/mcp/src/federation/stdio/adapter.stdio.ts:362` - `await session.close({}).catch(() => undefined);`
- `packages/mcp/src/server/tool-server.ts:387` - `void transport.close({}).catch(() => {});`
- `packages/memory/src/note-store.ts:410` - `await fsp.unlink(tmpPath).catch(() => {});`
- `packages/platform/src/download.ts:1024` - `await removeManagedDownload(state.removeOptions).catch(() => undefined);`
- `packages/platform/src/download.ts:1112` - `if (entries != null && entries.length === 0) await rm(bucketPath, { force: true, recursive: true }).catch((...`
- `packages/platform/src/download.ts:1151` - `if (remaining != null && remaining.length === 0) await rm(join(basePath, entry.name), { force: true, recurs...`
- `packages/platform/src/download.ts:389` - `await rm(path, { force: true }).catch(() => undefined);`
- `packages/platform/src/download.ts:685` - `await rm(target.partialPath, { force: true }).catch(() => undefined);`
- `packages/platform/src/download.ts:717` - `await rm(target.partialPath, { force: true }).catch(() => undefined);`
- `packages/platform/src/download.ts:849` - `await pruneManagedDownloads({ basePath: target.basePath }).catch(() => undefined);`
- `packages/platform/src/download.ts:893` - `await resetOwnedTarget({ target }).catch(() => undefined);`
- `packages/platform/src/download.ts:904` - `await resetOwnedTarget({ target }).catch(() => undefined);`
- `packages/platform/src/download.ts:907` - `await rm(target.partialPath, { force: true }).catch(() => undefined);`
- `packages/platform/src/fs.ts:114` - `await rm(tempPath, { force: true }).catch(() => undefined);`
- `packages/ui/src/renderers/preview-modal-shell/react/hooks/usePreviewModalShell.ts:203` - `document.exitFullscreen().catch(() => {});`

### C-drain (14)
- `packages/agent-plugins/src/lifecycle/fetch-archive.ts:255` - `await reader.cancel().catch(() => {});`
- `packages/agent-plugins/src/lifecycle/install.ts:503` - `await Promise.resolve(iterator.return?.()).catch(() => undefined);`
- `packages/agent-plugins/vercel/targets/vercel.mjs:350` - `await resp.arrayBuffer().catch(() => undefined);`
- `packages/agent-plugins/vercel/targets/vercel.mjs:433` - `await resp.arrayBuffer().catch(() => undefined);`
- `packages/agent-plugins/vercel/targets/vercel.mjs:437` - `await resp.arrayBuffer().catch(() => undefined);`
- `packages/chat/src/core/run-events/entry.ts:440` - `if (!ended) await reader.cancel().catch(() => undefined);`
- `packages/chat/src/embed-widget/browser/frontend-session-bridge.ts:510` - `} finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }`
- `packages/chat/src/embed-widget/transports/fetch-sse.ts:60` - `const cancel = () => { void reader.cancel().catch(() => {}); };`
- `packages/chat/src/server/run-finalizer/entry.ts:150` - `await response.body?.cancel().catch(() => undefined);`
- `packages/diagnostics/src/web-evidence/request-guard.ts:361` - `await reader.cancel().catch(() => {});`
- `packages/memory/src/llm-provider.ts:246` - `await resp.body?.cancel().catch(() => undefined);`
- `packages/oauth/src/bounded-json.ts:33` - `await reader.cancel().catch(() => undefined);`
- `packages/oauth/src/discovery.ts:50` - `await response.body?.cancel().catch(() => undefined);`
- `packages/oauth/src/endpoint-safety.ts:93` - `await response.body?.cancel().catch(() => undefined);`

### C-optional (26)
- `packages/admin/src/widgets/controllers/region-editor.controller.ts:32` - `}).catch(() => {});`
- `packages/agent-plugins/github-pages/targets/github-pages.mjs:515` - `return { ok: true, accountLabel: readGitHubLogin(await response.json().catch(() => undefined)) };`
- `packages/agent-plugins/google-workspace/lib/auth.mjs:58` - `const body = await response.json().catch(() => null);`
- `packages/agent-plugins/src/lifecycle/bundled-file-policy.ts:20` - `const installed = await required.readFile({ pluginId: required.pluginId, relativePath: required.relativePat...`
- `packages/agent-plugins/src/lifecycle/skill-file-reader.ts:106` - `const handle = await filesystem.open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONB...`
- `packages/agent-plugins/vercel/targets/vercel.mjs:634` - `return { ok: true, accountLabel: readVercelUsername(await response.json().catch(() => undefined)) };`
- `packages/agent-runtime/src/claude-code-models.ts:233` - `readConfigFile: (path) => readFile(path, 'utf8').catch(() => null),`
- `packages/agent-runtime/src/model-discovery-adapters.ts:367` - `read: (path, { signal }) => readFile(path, { encoding: 'utf8', signal }).catch(() => null),`
- `packages/agent-runtime/src/skills/web-clone/scripts/mirror-site.mjs:134` - `} catch {}`
- `packages/chat/src/embed-widget/transports/fetch-sse.ts:193` - `const body: unknown = await response.json().catch(() => null);`
- `packages/chat/src/react/features/chat-pane/create-mid-run-message-poster.ts:38` - `const body: unknown = await response.json().catch(() => null);`
- `packages/chat/src/react/features/chat-pane/create-mid-run-message-poster.ts:46` - `const body: unknown = await response.json().catch(() => null);`
- `packages/chat/src/react/hooks/assistant-chats.ts:493` - `const read = await portRef.current.listConversations({}, {}).catch(() => null);`
- `packages/cookie-consent/src/client/bridges.ts:34` - `else void import(/* @vite-ignore */ bridge.src!).then(module => mount(module.default)).catch(() => undefined);`
- `packages/cookie-consent/src/client/runtime.ts:107` - `const out = res?.ok ? ((await res.json().catch(() => null)) as { id?: unknown } | null) : null;`
- `packages/daemon/src/agent-executor/claude/mcp-config.ts:21` - `if (inheritUserMcp) existingRaw = await readFile({ path: join(cwd, '.mcp.json') }).catch(() => undefined);`
- `packages/daemon/src/http/attachments.ts:1038` - `const entries = await readdir(batchDirectory).catch(() => undefined);`
- `packages/platform/src/download.ts:1042` - `const existingDigest = await hashFile(outputPath, target.checksum.algorithm).catch(() => null);`
- `packages/platform/src/download.ts:1111` - `const entries = await readdir(bucketPath).catch(() => null);`
- `packages/platform/src/download.ts:1122` - `const info = await stat(path).catch(() => null);`
- `packages/platform/src/download.ts:1150` - `const remaining = await readdir(join(basePath, entry.name)).catch(() => null);`
- `packages/platform/src/download.ts:820` - `const actual = await hashFile(target.finalPath, target.checksum.algorithm).catch(() => null);`
- `packages/platform/src/download.ts:902` - `const existing = await hashFile(target.finalPath, target.checksum.algorithm).catch(() => null);`
- `packages/plugins/src/host/node/loader.ts:143` - `const actualHash = await computeFileHash(path.join(pluginRoot, relativeFilePath)).catch(() => undefined);`
- `packages/plugins/src/host/tools/management.ts:321` - `const providerPluginId = await routeDeps.providerFaces.linkedProvider({ pluginId: request.pluginId }).catch...`
- `packages/ui/src/features/version-manager/react/hooks/useVersionManager.ts:185` - `.catch(() => {})`

### C-wait (4)
- `packages/agent-runtime/src/skills/web-clone/scripts/interaction-probe.mjs:213` - `await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});`
- `packages/agent-runtime/src/skills/web-clone/scripts/network-capture.mjs:118` - `await page.waitForLoadState("networkidle", { timeout: args.waitMs }).catch(() => {});`
- `packages/agent-runtime/src/skills/web-clone/scripts/recon-site.mjs:417` - `await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});`
- `packages/agent-runtime/src/skills/web-clone/scripts/route-crawl.mjs:169` - `await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});`

### C-report (13)
- `packages/admin/src/browser/telemetry.ts:61` - `try { void deps.send(payload).catch(() => {}); } catch { /* never throws */ }`
- `packages/analytics/src/product/index.ts:156` - `try { return Promise.resolve(send()).catch(() => {}); } catch { /* A vendor failure must not invalidate oth...`
- `packages/chat/src/embed-widget/browser/frontend-session-bridge.ts:349` - `void respondError(action.invocationId, 'already executed on this surface').catch(() => undefined);`
- `packages/chat/src/embed-widget/browser/frontend-session-bridge.ts:353` - `void respondError(action.invocationId, 'Capability unavailable').catch(() => undefined);`
- `packages/chat/src/react/features/chat-pane/hooks/useChatPaneAgentControl.hooks.ts:214` - `await bridge.respondError(action.invocationId, errorMessage(error)).catch(() => undefined);`
- `packages/chat/src/react/features/chat-pane/hooks/useChatPaneAgentControl.hooks.ts:225` - `.catch(() => undefined);`
- `packages/cookie-consent/src/client/runtime.ts:106` - `headers: { 'content-type': 'application/json' }, body }).catch(() => null);`
- `packages/daemon/src/agent-executor/launch.ts:1073` - `.catch(() => undefined);`
- `packages/daemon/src/agent-executor/run-output.ts:89` - `await lifecycle.emit({ runId, input: { event: 'error', data: { message } } }).catch(() => {});`
- `packages/daemon/src/tool-access-lowering.ts:29` - `try { void notice(required).catch(() => {}); } catch { /* A closed stream cannot prevent Stop. */ }`
- `packages/plugins/src/host/provider-host.ts:155` - `try { void Promise.resolve(optional.onError?.(failure, {})).catch(() => {}); } catch { /* Failure reporting...`
- `packages/provider-plugins/src/analytics-posthog/consent-adapter.ts:60` - `headers: { 'content-type': 'application/json' }, body: anonymousPageview(config), signal }).catch(() => und...`
- `packages/ui/src/features/mcp-ui/sign-in-card.ts:92` - `await exchange?.send({ emission: { channel: 'mcp-ui', payload: { resource: card({ state }) } } }).catch(() ...`

### VH (3)
- `packages/ui/src/features/memory/react/hooks/useMemoryConnectors.hooks.ts:307` - `"Connected app statuses couldn't be loaded. Try again shortly."` - host API port owns the incident; inline text stays
- `packages/ui/src/features/memory/react/hooks/useMemoryConnectors.hooks.ts:326` - `"Connected apps couldn't be loaded. Try again shortly."` - same
- `packages/ui/src/features/memory/react/hooks/useMemoryConnectors.hooks.ts:409` - `"Connected app statuses couldn't be loaded. Try again shortly."` - same

### V (56)
- `packages/admin/src/forms/react/hooks/use-form-editor.hooks.ts:224` - `"Could not copy embed"` - clipboard refusal; inline text stays (owner decision D4)
- `packages/admin/src/redirects/rules.ts:151` - `"Not valid JSON."`
- `packages/admin/src/security/rules.ts:45` - `"Enter an HTTP or HTTPS URL"`
- `packages/agent-plugins/src/admin-surfaces/descriptor.ts:97` - `"not valid JSON"`
- `packages/agent-plugins/src/connect/plugin-credential-card.ts:41` - `"Server URL must use HTTPS"`
- `packages/agent-plugins/github/deployments/github.mjs:178` - `"GitHub returned invalid JSON minting an installation token"` - provider payload; the body holds an installation token, never attach the parse error
- `packages/agent-plugins/github/deployments/github.mjs:242` - `"GitHub returned invalid JSON creating a deployment"` - provider payload
- `packages/agent-plugins/github/deployments/github.mjs:367` - `"GitHub returned a malformed statuses response"` - provider payload
- `packages/agent-plugins/github/source-control/commit-site.mjs:203` - `"GitHub managed-manifest content is not valid JSON — cannot confirm which paths this adapter previously own...` - provider payload
- `packages/agent-plugins/github/source-control/commit-site.mjs:359` - `"Invalid target folder or repository file path."` - path validation
- `packages/agent-plugins/src/lifecycle/mail/adapter-descriptors.ts:85` - `"not valid JSON"`
- `packages/agent-plugins/src/lifecycle/skill-file-reader.ts:44` - `"File request refused: binary or invalid UTF-8 content cannot be read as text."` - model-visible refusal
- `packages/agent-plugins/src/lifecycle/tools/manifest.ts:81` - `"not valid JSON"`
- `packages/agent-plugins/resend/lib/domains.mjs:75` - `"Resend returned a body that is not JSON"` - provider payload
- `packages/agent-plugins/resend/lib/feedback.mjs:101` - `"body is not JSON"` - webhook body
- `packages/agent-plugins/s3-compatible/targets/s3-compatible.mjs:414` - `"The Tovu-managed object manifest is not valid JSON — cannot confirm which keys this target previously owned."` - provider payload
- `packages/agent-runtime/src/diagnostics.ts:26` - `"The error details could not be read."` - fallback inside a formatter
- `packages/agentic/src/core/site-guide/topic-schema.ts:51` - `"site-guide manifest must be valid JSON"`
- `packages/cms/src/forms/destination-descriptors.ts:38` - `"not valid JSON"`
- `packages/cms/src/media/document-ingress.ts:221` - `"document JSON is invalid"`
- `packages/cms/src/media/document-ingress.ts:42` - `"document text must be valid UTF-8"`
- `packages/cms/src/media/provenance.ts:24` - `"source URL must be HTTP or HTTPS"`
- `packages/cms/src/media/provenance.ts:8` - `"source path must be a safe relative path"`
- `packages/cms/src/media/sanitize-svg.ts:58` - `"SVG must be valid UTF-8"`
- `packages/commerce/src/browser/checkout.ts:107` - `"Your browser could not clear the saved order. Keep this page open and retry; a new payment has not been re...` - visitor browser storage refusal
- `packages/commerce/src/browser/checkout.ts:115` - `"Check paid order"` - visitor browser storage refusal
- `packages/commerce/src/browser/checkout.ts:47` - `"Your browser could not restore checkout. Keep this page open while paying."` - visitor browser storage refusal
- `packages/commerce/src/browser/checkout.ts:67` - `"The shop did not return a secure checkout link. Retry this same order."`
- `packages/commerce/src/browser/checkout.ts:81` - `"Your browser could not save this order. Payment has not been requested; keep this page open and retry."` - visitor browser storage refusal
- `packages/commerce/src/catalog/checkout.ts:120` - `"order total exceeds the safe integer range"`
- `packages/core/src/tool-input-envelope.ts:15` - `"The delegated input is not valid JSON. Send one JSON object containing the tool fields."`
- `packages/daemon/src/core/tool-audit.ts:53` - `"input: an unreadable object"` - fallback inside a formatter
- `packages/daemon/src/http/connectors.ts:417` - `"where must be valid JSON when provided"`
- `packages/db/src/transfer/postgres-target.ts:48` - `"the connection string is not a valid postgres:// URL"` - never attach: the URL parse error quotes the connection string
- `packages/desktop-host/src/render-bridge.ts:131` - `"invalid desktop capture channel"`
- `packages/devops/src/deploy/config-descriptors.ts:52` - `"not valid JSON"`
- `packages/devops/src/deploy/ops-descriptors.ts:15` - `"not valid JSON"`
- `packages/devops/src/deploy/ops-runner.ts:55` - `"Deployment ops module supplied an invalid URL."`
- `packages/devops/src/deploy/target-descriptors.ts:36` - `"not valid JSON"`
- `packages/devops/src/packaging/electron/archive.ts:75` - `"shipped in app.asar but missing from the source tree"` - the returned string IS the finding
- `packages/devops/src/source-control/registry.ts:66` - `"not valid JSON"`
- `packages/devops/src/static-export/transforms.ts:197` - `"Invalid URL encoding — refused"`
- `packages/integrations/src/credentialed-http/auth-schemes.ts:44` - `"not valid JSON"`
- `packages/integrations/src/credentialed-http/credentialed-request.ts:330` - `"credential probe requires an absolute HTTP(S) URL without embedded credentials"` - why-comment: never echo caller values
- `packages/integrations/src/credentialed-http/credentialed-request.ts:573` - `"JSON response must be valid"` - provider payload with credentials
- `packages/integrations/src/credentialed-http/credentialed-request.ts:71` - `"url must be a valid absolute URL"`
- `packages/integrations/src/credentialed-http/sets/store.ts:199` - `"baseUrl must be a valid absolute URL"`
- `packages/mcp/src/federation/hosted/access.ts:36` - `"The plugin connection has an unreadable tool list. Save its tool list again before enabling it."` - stored-data refusal with an action
- `packages/memory/src/llm-provider.ts:429` - `"llm-provider: response was not valid JSON"` - fallback parse, not a failure
- `packages/oauth/src/discovery.ts:106` - `"the protected resource metadata contains an invalid resource URL"`
- `packages/oauth/src/endpoint-safety.ts:38` - `"is not a valid absolute URL"`
- `packages/oauth/src/resource.ts:16` - `"resource indicators must be absolute URIs without fragments"`
- `packages/platform/src/object-store/descriptors.ts:38` - `"not valid JSON"`
- `packages/platform/src/web/web-page.ts:163` - `"web_fetch_page: url must be an absolute http(s) URL, e.g. https://example.com/about."`
- `packages/provider-plugins/src/analytics-posthog/consent.ts:37` - `"Use an HTTP or HTTPS host URL without credentials."`
- `packages/provider-plugins/src/payments-stripe/provider.ts:33` - `"invalid webhook JSON"` - webhook body

### DONE (6)
- `packages/admin/src/media/controllers/providers.controller.ts:35` - `"Provider service unavailable"` - example U
- `packages/admin/src/media/controllers/providers.controller.ts:49` - `"Failed to save provider credentials"` - example U
- `packages/commerce/src/payments/ingest/settlement-worker.ts:35` - `"Payment settlement ownership was lost; this process stopped its worker."` - example LS (class/code only since ef09da3c3)
- `packages/commerce/src/payments/ingest/settlement-worker.ts:48` - `"Payment settlement is delayed; recorded payments will retry automatically."` - example LS (class/code only since ef09da3c3)
- `packages/commerce/src/payments/ingest/settlement-worker.ts:62` - `"Payment settlement ownership retry is delayed; recorded work remains queued."` - example LS (class/code only since ef09da3c3)
- `packages/daemon/src/http/tool-execution-routes.ts:207` - `"an internal error occurred"` - example DR, now through `reportRouteInternalError` from `@jini-ai/http-kit` (76447baa5)

## 9. Sites the audit missed (Part A; do them like section 8 rows)
- **MCP HTTP tool server** `packages/mcp/src/server/http-tool-server.adapter.ts`. The `warn` port's own doc (`:12`) promises
  value-free diagnostics: a failed request can quote tool arguments, and a capability subscriber receives `{ url, token }`,
  so its exception can quote the listener token. All three sites are LS/MR through ONE module-level reporter (import
  `{ describeErrorForLog } from '@jini-ai/core'`; mcp declares core):
  ```ts
  /** Value-free diagnostics (see `warn`): fixed text + class/code, never the message. A throwing `warn`
   * never stops the answer or the retry. O(1). */
  function reportMcpFailure({ text, error, warn }: { readonly text: string; readonly error: unknown; readonly warn: (message: string) => void }, _optional = {}): void {
    try { warn(`${text} Cause: ${describeErrorForLog({ err: error })}`); } catch { /* Reporting this failure has no further channel. */ }
  }
  ```
  - `:68` `options.warn?.('MCP HTTP request failed')` - **LS**: `.catch((error: unknown) => { if (!response.headersSent) response.writeHead(500).end(); else response.destroy(); reportMcpFailure({ text: 'MCP HTTP request failed.', error, warn: options.warn ?? console.warn }); })` (answer first, then report).
  - `:212` `'MCP HTTP listener unavailable; retrying automatically'` - **MR**: add `let listenerFailing = false;` beside
    `let stopped = false;` in `createMcpHttpToolServerRuntime`; after `host = handle;` add `listenerFailing = false;`; the catch becomes
    `.catch((error: unknown) => { if (!stopped) { if (!listenerFailing) { listenerFailing = true; reportMcpFailure({ text: 'MCP HTTP listener unavailable; retrying automatically.', error, warn: options.warn ?? console.warn }); } retry ??= ...unchanged`.
  - `:236` `'MCP HTTP capability delivery unavailable; retrying automatically'` - **MR**: add `let deliveryFailing = false;` beside
    `let cancelled = false;` in `subscribe`; `deliver` becomes
    `void Promise.resolve().then(() => { if (!cancelled) return listener(capability); }).then(() => { deliveryFailing = false; }, (error: unknown) => { if (cancelled) return; if (!deliveryFailing) { deliveryFailing = true; reportMcpFailure({ text: 'MCP HTTP capability delivery unavailable; retrying automatically.', error, warn: options.warn ?? console.warn }); } deliveryRetry = setTimeout(() => deliver(capability), 1000); deliveryRetry.unref(); });`
    Keep the doc comment above `deliver`.
  Both retry sites now report when `warn` is omitted (once per streak, so no flood). `:145` `repairListener` has no
  error in scope: unchanged. Tests in `src/server/__tests__/http-tool-server.wire.test.ts` (fake timers):
  no `warn` injected and `console.warn` recorded: a subscriber whose listener throws `new Error(\`boom ${capability.token}\`)`
  twice, then returns -> exactly ONE line, it contains `Error`, and neither the token nor `boom`; a second subscription's
  first failure after that reports again (its own streak). `start` rejecting twice then resolving -> one line. A `warn` that
  throws: delivery still retries and succeeds, no unhandled rejection. `:68`: an injected `warn` gets the class (no `boom`),
  and a throwing `warn` still answers 500.
- `packages/memory/src/llm-provider.ts:242` - `` `${providerTag} request failed` `` - **RS via LB**: the Gemini URL carries
  `?key=<api key>` and fetch errors can quote the URL; memory has no runtime dependencies (section 7). Add the section 3
  LB `errorClassLabel` at module level (never `error.name`: a getter can throw and replace this error, or carry text), then
  `catch (error) { // The request URL can carry the API key and fetch errors can quote it: keep only a fixed class label.`
  `throw new Error(\`${providerTag} request failed\`, { cause: new Error(errorClassLabel(error)) }); }`.
- `packages/memory/src/llm-provider.ts:249` - `` `${providerTag} response could not be read` `` - **R**:
  `.catch((error: unknown) => { throw new Error(\`${providerTag} response could not be read\`, { cause: error }); })`.
  Test file `src/__tests__/llm-provider.test.ts`: a `fetchFn` rejecting `new TypeError("bad https://x.test/?key=SECRETSECRETSECRETSECRET")`
  -> `.cause.message === "TypeError"`, `SECRETSECRET` absent; a rejection whose `name` getter throws -> the thrown error is
  still `${providerTag} request failed` with `.cause.message === "Error"`; an `Error` whose `name` is set to
  `"SECRETSECRETSECRETSECRET"` -> `.cause.message === "Error"`; a body whose `text()` rejects -> `.cause` is that error.
- Already in section 6 (not repeated): `daemon/src/http/attachment-lookup-routes.ts:64`, `daemon/src/http/frontend-sessions.ts:328,340`.

## 9b. Existing full-text log lines (not audit sites; the section 1 default applies to them too)
Each line below logs a caught error's text today (`formatErrorForLog`, `redactSecrets({ input: inspect(x) })`,
`x.message`, `String(x)`). Make each **LS**: replace ONLY that error expression with `describeErrorForLog({ err: x })`
(browser files: import from `@jini-ai/core/model-facing-tool-errors`), keep the fixed text, labels and IDs; for a message
built as `'...: ${...message...} — skipped'` keep the words around it. Remove `inspect`/`redactSecrets`/`formatErrorForLog`
imports only when nothing else in the file uses them. One test per changed file (section 1), plus the pinned-text updates.
Re-run before you start: `rg -n "inspect\((e|err|error|sinkError|context\.error)\)|formatErrorForLog\(|instanceof Error \? \w+\.message" packages --glob '!**/__tests__/**' --glob '!**/*.test.*' --glob '!core/src/**'`;
any hit not listed here or in section 6 is a new LS row: do it and report it.
- agent-plugins: `src/connect/import-access-token.ts:159`, `src/connect/grant-signed-in-defaults.ts:155`,
  `src/connect/apply-tool-renames.ts:130,149`, `src/lifecycle/host-tools/search-tool.ts:218`, `src/lifecycle/host-tools/skill-tool.ts:297`
- agent-runtime: `src/providers/oauth-tokens.ts:88` (corrupted token file: the JSON parse error quotes it), `:129`;
  `src/providers/oauth-callback-server.ts:145`
- chat: `src/store/runtime/chat-expiry-sweep.ts:66`; browser: `src/react/hooks/useRunStream.ts:52`, `src/react/hooks/useConversation.ts:165`,
  `src/react/components/ConversationTitleEditor.tsx:39`, `ToolCard.tsx:120`, `Composer.tsx:116`, `ExtEventErrorBoundary.tsx:43`,
  `ConversationList.tsx:78`, `src/react/features/chat-pane/hooks/useChatPaneFileDrop.hooks.ts:39,43`
- cms: `src/forms/submit-service.ts:281,291`, `src/forms/notify-subscriber.ts:124` (only the `error:` field; the
  message field stays), `src/comments/express/submit-handler.ts:134`, `src/forms/express/handler.ts:279`
- daemon: `src/run-lifecycle.ts:730,733,806,812,852,857` (not consolidated, section 6); `src/http/frontend-control.ts:140`
  `defaultBindErrorSink` (`resolveBindToken` parses an opaque host blob that carries the bind token);
  `src/routines/scheduler.ts:185,297`
- db: `src/kernel/postgres/driver.ts:36`
- mcp: `src/core/config.ts:243`, `src/core/tokens.ts:200` (corrupted config/token files: the parse error quotes them),
  `src/federation/bootstrap.ts:321,348`
- plugins: `src/host/node/runtime-core.ts:641,646,671,821` (`:646` keeps its redacted plugin-id label),
  `src/host/contributions.ts:204`, `src/host/tools/management.ts:376,397`
- server: `src/create-local-node-daemon.ts:396`, `src/host-bootstrap.ts:180`
- ui (browser): `src/features/sketch-editor/react/hooks/useSketchSaveWorkflow.ts:128`,
  `src/features/lexical-rich-text-editor/react/components/RichTextInput.tsx:264`
Pinned tests to update with them (at least): daemon `src/__tests__/run-lifecycle-event-drop.test.ts:70`,
`src/__tests__/run-lifecycle-slow-run-watchdog.test.ts:274`, `src/http/__tests__/remote-run-events.test.ts:483` (CN).

**L-full, kept (3)**: `agent-runtime/src/skills/web-clone/scripts/mirror-site.mjs:64`, `asset-harvest.mjs:243`,
`dna-scaffold.mjs:229`. Why: operator-run CLI scripts that print to the operator's own terminal; the only input in a
`page.goto`/recon-file error is the public URL or local file the operator named on the command line. No change.
**Unchanged, not a log line (2)**: `infra/src/events/outbox/worker.ts:29` hands the error object to the host's injected
logger port (hand-over, host policy); `agent-runtime/src/diagnostics.ts:27` builds the user's own Copy-details startup text
with exact-secret redaction (a user-facing formatter, V row `diagnostics.ts:26`).
**Deleted by section 6 CN (15)**: the per-pack default lines in runs, attachments, media, terminals, db-ops, connectors,
remote-run-events, research, xai, delegated-tools (`:160`; `:176` becomes LS in its CN row), model-proxy (`:158`, `:589`),
frontend-sessions (`:136`, `:140`) and http-kit `adapter.ts:41`.

## 10. Part B — Tovu (separate run, AFTER Part A is reviewed, Jini is released and Tovu's `@jini-ai/*` versions are bumped)
Run on a Tovu branch from the integration branch. Same ground rules as section 1 (smallest change, keep
comments, object-first args, complexity <= 10, failing test first, one test file at a time, no commit).
Single-file test commands: website node:test files `node --import tsx --test --test-concurrency=1 <file>` from the repo
root; desktop files from `apps/desktop`: `node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=1 <file>`.
Logging default: the same as Part A section 1 (safe metadata only: fixed text, `describeErrorForLog`, IDs).
Host policy for process-level redaction: `redactSecretShapes` from `@tovu/contracts/secret-redaction`
(`packages/contracts/src/secret-redaction.ts`). Tovu's key shape (secret part after the dot):
`tovu_ak_0123456789ab.` + 30 chars of `[A-Za-z0-9_-]`. Every Part B test feeds
`new Error("boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRETSECRET01")` and asserts `SECRETSECRETSECRET` is absent
(the public `tovu_ak_0123456789ab` prefix may stay). Already true, do not redo: the website server
(`apps/website/src/index.ts:137`, `cli/commands/serve.ts:192`) and the daemon (`agent-daemon-server.ts:186`) install
`installServerLogCapture`, whose console tee redacts with `redactSecretShapes`; child output is framed and
redacted (`apps/desktop/src/desktop-agent-service.ts:38`, `tovu-server.ts:1062`).

- **T1 one Tovu sink for Jini incidents.** New file `apps/website/src/platform/server-logs/jini-route-incident.ts`:
  ```ts
  import { describeErrorForLog } from "@jini-ai/core";

  /** Tovu's sink for every Jini route/lifecycle incident: the route's label, the request ID and the
   * error's class/code. Never the error text: an incident's message can quote request input or a key
   * shape no redaction pattern knows (the owner's metadata-only default). The request ID ties this
   * line to what the user copied. Cannot throw: describeErrorForLog never throws, and the context is
   * a plain object Jini built. */
  export function logJiniRouteIncident(
    context: { readonly error: unknown; readonly correlationId?: string },
    _optional: Record<string, never> = {},
  ): void {
    const record = context as Readonly<Record<string, unknown>>;
    const label = [record.source, record.provider, record.path].find(value => typeof value === "string") ?? "route";
    const id = context.correlationId === undefined ? "" : `, correlationId=${context.correlationId}`;
    console.error(`[jini] internal error (${String(label)}${id})`, describeErrorForLog({ err: context.error }));
  }
  ```
  (`(required, optional = {})` per the API-args rule; still assignable to every one-argument `onInternalError` port.)
  Wire it (pass `onInternalError: logJiniRouteIncident`) at exactly these places:
  `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts` — `:282` `createRunLifecycle({ eventLog }, { dropEventsOnEviction: true, onInternalError: logJiniRouteIncident })`;
  `:1434` the `adapter: AdapterContext` object (covers every `mountJsonRoute` route given that adapter, incl. the tool catalog `:1555`);
  `:357` `createFrontendControl({ ..., session: { resolveOwner: ..., onInternalError: logJiniRouteIncident } })` (Part A
  widened the facade's `session` Pick; without this the page-session stream/owner catches use the Jini default);
  `:1468` `registerRunRoutes` deps; `:1519` `delegatedToolRouteDeps` (where it is built); `:1548`
  `registerFrontendRequestRoute` optional arg (Part A S1 added it); `:1602` `registerAttachmentRoutes` deps.
  `apps/website/src/server/runtime/composition/modules/assistant-tool-exec.ts:88` `registerToolExecutionRoutes` optional arg.
  `apps/website/src/assistant/site/visitor-frontend-control.ts:29` `createFrontendControl` `session` object: add
  `onInternalError: logJiniRouteIncident` (visitor page sessions, same facade).
  `apps/website/src/assistant/daemon-access.ts:71` `registerAttachmentLookupRoutes(..., { onInternalError: logJiniRouteIncident })`
  (Part A CN added the option). `apps/desktop/src/desktop-agent.ts` — `:341` `createRunLifecycle(..., { onInternalError: logJiniRouteIncident })`,
  `:370` the `adapter` object, `:372` `registerDelegatedToolRoutes` deps; import it by relative path
  `../../website/src/platform/server-logs/jini-route-incident.ts` (as the file's existing `../../website/src/...` imports do).
  Not wired, say so in the report: `admin-http/routes/settings/shared.ts:264` mounts without an adapter on purpose
  (no origin guard; its `spec.onError` answers every failure); a default Jini line there carries class/code only.
  Test: new `apps/website/src/platform/server-logs/__tests__/unit/jini-route-incident.unit.test.ts` (replace `console.error`
  with a recorder, restore it in `finally`): the line is exactly `[jini] internal error (attachment-upload, correlationId=c1) Error`
  (no `boom`, no `SECRETSECRETSECRET`, no stack); a context without `correlationId` (run lifecycle) prints no `correlationId=`.
  A wiring check in the existing `agent-daemon-scope` test (or a source-text test like `main-owner-store-wiring.test.ts`):
  both `createFrontendControl` calls pass `onInternalError: logJiniRouteIncident` in `session`.
- **T2 (dropped in rev 3).** The commerce `warn` default needs no change: under the metadata-only default no Jini
  line hands error text to that port (the former L rows are LS), and the website console tee redacts the process anyway.
- **T3 Electron main gets a redacting console.** Electron main is the one Tovu process with no tee, and it runs Jini code
  (`desktop-agent.ts` via `desktop-chat-main.ts`). New `apps/desktop/src/main/boot/console-redaction.ts`:
  ```ts
  import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
  import { installConsoleTee, type TeeableConsole } from "../../../../website/src/platform/server-logs/console-tee.ts";
  import { createLogBuffer } from "../../../../website/src/platform/server-logs/log-buffer.ts";

  const redactLine = (text: string) => redactSecretShapes({ text }).text;
  /** Electron main has no server-log capture; redact its console once, before anything logs, so Jini
   * default incident lines and every warn port cannot print a Tovu key. The one-entry buffer exists
   * only because the tee requires one; nothing reads it. */
  export function installMainConsoleRedaction(_required = {}, { target }: { readonly target?: TeeableConsole } = {}): () => void {
    return installConsoleTee({ buffer: createLogBuffer({ redact: redactLine }, { maxEntries: 1 }) }, { redact: redactLine, ...(target ? { target } : {}) });
  }
  ```
  Call `installMainConsoleRedaction({}, {});` in `apps/desktop/src/main/index.ts` as the first statement after the imports
  (before the `const userDataProfile = applyUserDataDir(` block at ~:285). Tests (from `apps/desktop`):
  new `src/main/boot/console-redaction.test.ts` (fake `target` console: `console.error("x", <bare-key error>)` reaches the
  target without `SECRETSECRETSECRET`; the returned uninstall restores the original method) and new
  `src/main-console-redaction-wiring.test.ts` in the source-text style of `src/main-owner-store-wiring.test.ts`:
  `main/index.ts` calls `installMainConsoleRedaction(` before `applyUserDataDir(`.
- **T4 site catalog refusal keeps the site's words and request ID.**
  `apps/website/src/server/inbound/assistant/agent-daemon-site-tools.ts:65`
  `if (!response.ok) throw new Error(\`site catalog refused (${response.status})\`);` -> `if (!response.ok) throw siteCatalogRefusal({ status: response.status, text });`
  with a module-level function (import `decodeApiError` from `@jini-ai/protocol`, a declared root dependency):
  ```ts
  /** A refused catalog read keeps the site's own words and request ID so the owner can report it. */
  function siteCatalogRefusal({ status, text }: { readonly status: number; readonly text: string }, _optional = {}): Error {
    let body: unknown = null;
    try { body = JSON.parse(text); } catch { /* Optional input: a non-JSON refusal body is treated as absent. */ }
    const { message, requestId } = decodeApiError({ body }, { fallbackMessage: "no details were returned" });
    return new Error(`site catalog refused (${status}): ${message}${requestId === undefined ? "" : ` (request ID ${requestId})`}`);
  }
  ```
  Test in `server/inbound/assistant/__tests__/agent-daemon-site-tools.unit.test.ts`: a 500 with
  `{ error: { code: "INTERNAL_ERROR", message: "M", requestId: "r1" } }` -> `site catalog refused (500): M (request ID r1)`;
  flat `{ error: "M" }` -> `...: M`; non-JSON -> `...: no details were returned`.
- **T5 regression cases** = the T1, T3, T4 tests above, all with the bare-key error. Plus one case in the existing
  `apps/website/src/platform/server-logs/__tests__/unit/console-tee.unit.test.ts`: through an installed tee,
  `console.error("[@jini-ai/http-kit] internal error (x, correlationId=c1)", formatErrorForLog({ error: <bare-key error> }))`
  (Jini default options) reaches the target without `SECRETSECRETSECRET`.
- **T6 object-first error constructors** (the Tovu side of section 6 R-API; Part A already changed the classes).
  `new PluginInstallError(code, message)` -> `new PluginInstallError({ code, message })` at:
  `apps/website/src/cli/commands/plugin/install.ts:33`, `features/plugin-runtime/install-archive.ts:32`,
  `features/plugin-runtime/host-binding.ts:61,64,65`, and every test caller (`rg -n "new PluginInstallError\(" apps` lists
  12 more under `__tests__`). `new ExternalMcpSecretStoreUnconfiguredError("m")` -> `({ message: "m" })` in 4 test files:
  `apps/website/src/server/inbound/admin-http/routes/external-mcp/__tests__/oauth-error-mapping.test.ts:190`,
  `apps/website/src/features/external-mcp/__tests__/h2c/sign-in-ports.test.ts:238`,
  `apps/website/src/features/external-mcp/__tests__/h1a/hosted-mcp-error-identity.test.ts:37`,
  `apps/website/src/server/runtime/composition/__tests__/plugin-host.integration.test.ts:445`. No new tests (mechanical).
- Not in scope (say so in the report): CLI one-shot commands other than `serve` print to the operator's own terminal
  without a tee.

## 11. Report (final message)
Part A and Part B each: per site done / skipped (why) / variant changed (why). Per test file: red, green, mutation-red
evidence (the command and the assertion line of each run; "not run" is a failed step, not a report). Files changed.
Extra method-form sites and extra section 9b hits fixed. Nothing else.
