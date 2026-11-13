# Terra job size-25: split 4 Jini file(s) by responsibility (size limits)

Generated 2026-11-13 by `development/refactor-patterns/size-splits/assemble.mjs` from the per-file design fragments. Self-contained: the rules, the per-file plans and the checks are all below.

Repo: the Jini clone you are given (Jini only; never edit Tovu). `TOVU` below = the Tovu clone path the coordinator gives you (only for the read-only `outline.mjs` tool). Run `pnpm install --frozen-lockfile` once if `node_modules` is missing.

READY: these files are not reshaped by the Tovu→Jini move.

## Rules
Owner-approved 2026-11-13. These rules are binding for every `size-NN` job and every hard-file plan.
They are inlined into each Terra prompt, so a job needs nothing else.

## Limits and how lines are counted
- A file is over when it has more than **500** counted lines; a function (incl. a React component, hook,
  method, arrow) when it has more than **100**. Counted = non-blank after comments are removed (ESLint
  `max-lines` / `max-lines-per-function` with `skipBlankLines` + `skipComments`). Nested functions count
  on their own, and they also count inside their parent.
- Measure and check with the outline tool (read-only, TypeScript from `<root>/node_modules`):
  `node <TOVU>/development/refactor-patterns/size-splits/outline.mjs --root <repo with node_modules> <file>` prints
  every top-level declaration (range, counted lines, same-file names it uses) and, for each function over
  100, its body statements with `decl:` (locals it creates) and `uses:` (earlier locals/params it reads).
  `--check <files...>` prints only what is still over and exits 1 if anything is.
- Exempt (never split): `development/scripts/size-exceptions.json` (locale `*-i18n.ts(x)`, `i18n-common.ts`,
  `*.generated.*`, `migration(s)/`, plus listed entries). `composition/deps.ts` and `composition/app.ts`
  are NOT exempt.

## What a split is
1. **Split by responsibility, never by line number.** Each new module does one job you can name in a few
   words (its file name says it). Each helper does one step you can name. If a piece has no nameable job,
   it stays where it is.
2. **A long function becomes helper functions in the SAME file.** Helpers go at module level directly
   above the function they came from, in the order they run. A step that needs many of the function's
   locals becomes a helper that takes them as one object; for a React hook, a group of state + effects
   becomes a sub-hook `useXxx` in the same file. Only when the file itself is then over 500 do helpers
   move to a sibling file (as the plan says).
3. **A long file splits into sibling modules** in the same folder, named `<original-stem>-<job>.ts(x)`
   (or the name the plan gives). The original file keeps its own name and its main job, and imports
   what moved. No new folder unless the plan says so.
4. **Imports follow the move.** Every importer of a moved export imports it from its new module
   (find them with `rg -n "from ['\"].*<old-stem>(\.js)?['\"]"` across the repo, tests included). The old
   file does NOT re-export moved names — except when the old file is a package entry (a target in a
   `package.json` `exports` map, or an `index.ts` that is one): then it keeps `export { x } from "./new.js"`
   so the public API is unchanged.
5. **No import cycles.** A new module never imports the file it was cut out of. Types both sides need move
   into the new module (or a `<stem>-types.ts` sibling when the plan says so).
6. **Behaviour does not change.** Same statements, same order, same awaits, same error text, same exports
   from the package. Only what crosses a new boundary changes: locals become parameters / return values.
   Do not "improve" code you move.
7. **"Why" comments move with their code** — word for word, including the comment above a moved
   statement and the file header paragraph that explains a moved part (copy that paragraph into the new
   file's header; keep the original header's other paragraphs).
8. **Arguments: `(required, optional = {})`.** A new helper takes ONE destructured object of required
   inputs and, only if it has optional inputs, a second object defaulting to `{}`:
   `function applyRow({ row, store }: ApplyRowInput, { signal }: ApplyRowOptions = {}): Promise<void>`.
   No new positional primitive parameters. Name the input type `<Helper>Input` (and `<Helper>Options`)
   unless the plan names it. Sub-hooks follow the same rule.
9. **React components take props only.** State, effects, refs, callbacks and data loading live in
   `<Component>.hooks.ts` (or the existing hooks file the plan names). A component split into
   sub-components passes plain props; a sub-component never receives the whole hook result object unless
   the plan says so.
10. **Banned:** `eslint-disable` (any form), `as any`, `as unknown as`, non-null `!`, `@ts-ignore`,
    `@ts-expect-error`. If a type does not line up after a move, export the existing type from where it
    lives — never loosen it. A pre-existing `eslint-disable-next-line` / `biome-ignore` on a moved line moves
    with that line unchanged (the diff shows it moved, not added); never add a new one.
11. **Tests are not edited**, except an import path of a moved symbol. Before moving an export, run
    `rg -n "vi\.mock\(|mock\.module\(|jest\.mock\(" <test dirs of the file>`: if a test mocks the OLD module
    path and the code under test now gets the moved symbol from the NEW module, the mock stops applying —
    move the mock path in that test to the new module (the only other allowed test edit) and say so in the
    report.

## Running checks (no suites, nothing left running)
- Run ONLY the test files the plan lists for each file, one at a time, after that file is done:
  - Tovu `apps/website`, `packages/*`, `content/*`, `apps/site-chat`:
    `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <test file>`
  - Tovu `apps/admin`: `cd apps/admin && npx vitest run <path relative to apps/admin> --maxWorkers=2`
  - Tovu `apps/desktop` main (`src/` outside `renderer/`, `contracts/`):
    `cd apps/desktop && node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=1 <file>`
  - Tovu `apps/desktop` renderer/contracts: `cd apps/desktop && node --import ./scripts/one-react.ts --import tsx --test --test-concurrency=1 <file>`
  - Jini: `pnpm --filter <package name> exec vitest run <path relative to the package> --maxWorkers=2`, then
    `pnpm --filter <package name> run typecheck` once per touched package (Jini packages are small enough).
- Tovu: no full `tsc` (admin tsc needs 2+ GB). Run `npx eslint <changed files>` (no new errors, no
  `max-lines`/`max-lines-per-function` warnings left on the planned items).
- Done check per file: `outline.mjs --check <original file> <new files>` → every planned item `OK`
  (an item the plan says stays over, e.g. an owner exception candidate, is listed in the report).
- No watch modes, no dev servers, no suites; kill nothing you did not start; leave nothing running.

## Commit and report
- One commit per file (or per tightly coupled pair the plan names), by explicit paths only:
  `git add -- <paths> && git commit -F msg -- <paths>`; message `refactor(<area>): split <file> by responsibility (size)`.
  Never push, never `git add -A`, never stash or checkout other files.
- If a plan step cannot be done as written (an anchor is missing, a cycle appears, a test fails and
  the cause is the split), stop that file, revert only that file's uncommitted changes
  (`git restore -- <its paths>`, delete its new files), and report it — never improvise a different split.
- Report: per file `OK` / `STOPPED (reason)`, new files, before → after counted lines, tests run with
  pass/fail counts, and any test-mock path you moved.

## For each file, in the order listed
1. `node $TOVU/development/refactor-patterns/size-splits/outline.mjs --root <repo with node_modules> <file>` — confirm every declaration / statement anchor the plan names exists. A missing anchor = STOP this file.
2. Complete the test list: `rg -l "<file stem>" <app or package dir> --glob '*.test.*'` (colocated tests are easy to miss); add any hit that exercises the file.
3. Run those tests once BEFORE editing (baseline). A test already failing is noted and compared after; it is not yours to fix.
4. Do the plan's steps in order. After the file: tests again (same pass count), `npx eslint <changed files>`, `outline.mjs --check <original> <new files>`, Jini: the package typecheck. Then commit that file.
5. Worked example of the expected style: `development/refactor-patterns/size-splits/EXAMPLE.md` in the Tovu clone (optional reading).

## Files
### jini:packages/mcp/src/federation/hosted/store.ts
- **Over:** file 988 lines (no function over 100)
- **Phase:** now · **Batch:** size-25
- **Tests:** `src/federation/hosted/__tests__/second-host-store.test.ts`, `src/federation/hosted/__tests__/hosted-entry.test.ts`, `src/__tests__/index.test.ts`, `src/__tests__/integration-contracts.test.ts` (`pnpm --filter @jini-ai/mcp exec vitest run <path> --maxWorkers=2`), then `pnpm --filter @jini-ai/mcp run typecheck`.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| T | types `ExternalMcpIdentity`, `HostedMcpStoreDeps`, `SealDeps`, `OpenDeps`, `CredentialPorts` | store dependency types |
| P | `ENV_NAME_PATTERN`, `MAX_ENV_VARS`, `MAX_ARGS`, `MAX_OAUTH_SCOPES`, `parseJsonObject`, `parseEnvLine`, `parseEnvBlock`, `assertJsonEnvEntry`, `parseJsonEnvBlock`, `parseArgs`, `readBareArg`, `readQuotedArg`, `parseToolNameList`, `parseAllowedToolNames`, `parseWriteAllowedToolNames`, `parseOAuthScopes`, `assertExternalMcpPlainField`, `assertExternalMcpPlainInput` | parsing/validating operator-typed text fields |
| S | `EXTERNAL_MCP_VAULT_VERSION`, `EXTERNAL_MCP_OAUTH_PAYLOAD_VERSION`, `hydrateExternalMcpOAuthPayload`, `openExternalMcpOAuthPayload`, `sealExternalMcpOAuthPayload` | the sealed OAuth payload codec |
| R | `externalMcpRecordHasStoredToken`, `externalMcpEnvHints`, `externalMcpAccessTokenHint`, `toView`, `listExternalMcpServerViews`, `openExternalMcpEnv`, `oauthStatusFailure`, `resolveExternalMcpAccessToken`, `resolveOwnedAccessToken`, `externalMcpFailure`, `resolveStdioTarget`, `resolveHttpTarget`, `hostedTokenFailure`, `withStaticAccessToken`, `openExternalMcpStaticAccessToken`, `resolveExternalMcpConfig`, `readEnabledExternalMcpConfigs`, `toResolvedFederatedConnections`, `toFederatedLaunchSpec` | read side: admin views + resolving enabled rows into launch configs |
| O | `MAX_OAUTH_FIELD_LENGTH`, `OAUTH_PROVIDER_ID_PATTERN`, `buildOAuthEndpoints`, `oauthBindingFingerprint`, `ResolvedOAuthFields`, `NO_OAUTH_FIELDS`, `firstTrimmed`, `assertOAuthGrant`, `assertOAuthClientId`, `resolveOAuthEndpoints`, `DYNAMIC_REGISTRATION_ENDPOINT_KEYS`, `assertOAuthProviderIdentity`, `resolveOAuthProviderIdentity`, `resolveOAuthTokenEnvName`, `resolveSavedOAuthScopes`, `resolveOAuthFields`, `normalizeOAuthClientSecret`, `carryOAuthRuntimeState` | resolving a save's OAuth columns |
| W | everything else: `MAX_SERVERS_PER_WORKSPACE`, `applyExternalMcpAccess`, `assertWriteAllowlistSubset`, `toolNameSetsEqual`, `assertValidExternalMcpServerId`, `assertSupportedExternalMcpTransport`, `resolveSavedAuthMode`, `assertNonEmptyExternalMcpCommand`, `assertUnderExternalMcpServerCap`, sealed-env trio, `LOOPBACK_HOSTNAMES`, `assertSafeRemoteMcpUrl`, `resolveTransportTarget`, `resolveSealedOAuthBlob`, `resolveWriteGrantAttribution`, `normalizeExternalMcpAccessToken`, `resolveSealedStaticAccessToken`, `resolveStaticAccessTokenEnvName`, `resolveSavedCredentialColumns`, `saveExternalMcpServer`, `deleteExternalMcpServer` | write side: save/delete (stays in `store.ts`) |

- **Splits** (in order; dependency order T → P → S → O → R):
  1. NEW `store-types.ts` — job: store dependency types. Moves unit T (all exported now). Imports only the external types they reference.
  2. NEW `store-input-parsing.ts` — job: parse/validate operator-typed fields. Moves unit P. Exports the five public parsers plus `ENV_NAME_PATTERN`, `parseJsonObject`, `assertExternalMcpPlainField`, `assertExternalMcpPlainInput` (needed by O and W). Imports `CredentialPorts` from `./store-types.js`.
  3. NEW `store-oauth-payload.ts` — job: sealed OAuth payload codec. Moves unit S (all exported). Imports T types.
  4. NEW `store-oauth-fields.ts` — job: a save's OAuth columns. Moves unit O; exports `ResolvedOAuthFields`, `NO_OAUTH_FIELDS`, `resolveOAuthFields`, `carryOAuthRuntimeState`, `firstTrimmed`, `normalizeOAuthClientSecret` if W uses it (check with rg in `store.ts` after the move; export exactly what W reads). Imports `parseJsonObject`, `parseOAuthScopes`, `ENV_NAME_PATTERN` from parsing.
  5. NEW `store-config-resolution.ts` — job: admin views + resolving enabled rows to launch configs. Moves unit R; exports the four public names. Imports `OpenDeps` from types, `openExternalMcpOAuthPayload` from `./store-oauth-payload.js`.
  6. `store.ts` keeps unit W plus its `@file`/header comments and imports what it uses from the new modules (`firstTrimmed`, `ENV_NAME_PATTERN`, `EXTERNAL_MCP_VAULT_VERSION`, seal/open payload, parsers, OAuth fields).
- **Importers to update:** `src/federation/hosted/index.ts` (`export * from "./store.js"`): add explicit re-exports of exactly the previously public names, NOT `export *` of the new modules (they now export internals): `export { parseEnvBlock, parseArgs, parseAllowedToolNames, parseWriteAllowedToolNames, parseOAuthScopes } from "./store-input-parsing.js"`, `export { EXTERNAL_MCP_VAULT_VERSION, EXTERNAL_MCP_OAUTH_PAYLOAD_VERSION, hydrateExternalMcpOAuthPayload, openExternalMcpOAuthPayload, sealExternalMcpOAuthPayload } from "./store-oauth-payload.js"`, `export { externalMcpRecordHasStoredToken, listExternalMcpServerViews, readEnabledExternalMcpConfigs, toResolvedFederatedConnections } from "./store-config-resolution.js"`, `export type { HostedMcpStoreDeps } from "./store-types.js"`. Before editing, run `rg -n "^export" src/federation/hosted/store.ts` and confirm the public list equals this one; no other file imports `./store.js`.
- **After:** `store.ts` ~350; `store-config-resolution.ts` ~295; `store-oauth-fields.ts` ~190; `store-input-parsing.ts` ~135; `store-oauth-payload.ts` ~55; `store-types.ts` ~10.
- **Risks / notes:** the many "why" comments (RFC notes, `@agent-note`s) above each moved function move word for word. The file header paragraph about the row shape (attached to `EXTERNAL_MCP_VAULT_VERSION`) is copied into `store-oauth-payload.ts` and kept in `store.ts`. Watch that no new module imports `./store.js` (W only imports from them). `export *` in index means a name collision would now be a compile error — explicit re-exports avoid it.

### jini:packages/mcp/src/server/http-tool-server.adapter.ts
- **Over:** `startMcpHttpToolServer` 104
- **Phase:** now · **Batch:** size-25
- **Tests:** `src/server/__tests__/http-tool-server.wire.test.ts`, `src/server/__tests__/run-tool-host.http.test.ts` (`pnpm --filter @jini-ai/mcp exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `host`, `token`, `pending`, session lets, `server` creation | listener state (stays) |
| B | `server.headersTimeout = 5000;` … `server.maxConnections = MAX_REQUESTS;` and `await new Promise<void>((resolve, reject) => {` … `const port = address.port;` | bind the loopback listener with its limits, return the port |
| C | `handle`, `dispatch`, `repairListener`, `return {` | request admission/dispatch + handle (stays; they close over mutable lets) |

- **Splits:**
  1. HELPER `bindLoopbackListener({ server }: BindLoopbackListenerInput): Promise<number>` (same file, above `startMcpHttpToolServer`) ← the three `server.*Timeout/maxConnections` assignments, then the `await new Promise<void>(…listen…)`, `const address = server.address();`, the `if (!address || typeof address === 'string') throw …` line, and returns `address.port`. `server` type = `Server` from `node:http` (whatever `createServer` returns in the file).
  2. In `startMcpHttpToolServer`: the three assignments are removed from their spot; `const port = await bindLoopbackListener({ server });` replaces the listen block. `handle`/`dispatch` stay as hoisted function declarations between them, so runtime order is unchanged (limits set immediately before listen, as today — nothing runs between them).
- **Importers to update:** none.
- **After:** file ~218; `startMcpHttpToolServer` ~90.
- **Risks / notes:** `handle`, `dispatch`, `repairListener` mutate `stopped`/`retry`/`sessionConnection` — do NOT move them. The limits must still be set before `listen` (they are, inside the helper). Keep the throw message exact.

### jini:packages/mcp/src/server/tool-server.ts
- **Over:** `createMcpToolServer` 103
- **Phase:** now · **Batch:** size-25
- **Tests:** `src/server/__tests__/tool-server.test.ts`, `…/tool-server.wire.test.ts`, `…/tool-server.hosting.test.ts`, `…/tool-argument-recovery.test.ts`, `…/delegated-local-tools.integration.test.ts` (`pnpm --filter @jini-ai/mcp exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `validateFrameLimit`, `buildToolIndex`, `resources`, `resourceIndex`, `createServer`, `createTransport` | eager validation + factories (stays) |
| B | `async function connectHost({ transport, withActivity }: {` (61) | install tool/resource dispatch on a server for one transport |
| C | `return {` with prop `run` | run lifecycle (stays) |

- **Splits:**
  1. HELPER `connectToolHost({ requiredArgs, options, createServer, resources, resourceIndex, transport, withActivity }: ConnectToolHostInput): Promise<…same return as today…>` (module level, directly above `createMcpToolServer`, below `createToolPublisher`) ← body of `connectHost` verbatim, with its "Install the shared tool/resource dispatch…" comment. Field types: `McpToolServerRequiredArgs`, `McpToolServerOptions`, `NonNullable<McpToolServerOptions['createServer']>`, the `resources`/`resourceIndex` types as inferred today (use `ReturnType<typeof buildResourceIndex>`), and `transport`/`withActivity` as in `connectHost`'s current inline param type.
  2. `createMcpToolServer` keeps `function connectHost(input: { transport: …; withActivity: … }) { return connectToolHost({ requiredArgs, options, createServer, resources, resourceIndex, ...input }); }` (same name, so `run` is unchanged).
- **Importers to update:** none.
- **After:** file ~300; `createMcpToolServer` ~48; `connectToolHost` ~63.
- **Risks / notes:** `buildToolIndex` stays eager in `createMcpToolServer` (comment says the mutable dispatch index lives inside `run()` — do not move that).

### jini:packages/memory/src/extraction-log.ts
- **Over:** `createExtractionLog` 118
- **Phase:** now · **Batch:** size-25
- **Tests:** `src/__tests__/extraction-log.test.ts`, `src/__tests__/extract-facts.test.ts`, `src/__tests__/extract-facts.l088.characterization.test.ts` (`pnpm --filter @jini-ai/memory exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `nowMs`, `nextId`, `defer`, `records`, `events`, `emit`, `pushNewest`, `findById` | log state + event emit (stays) |
| B | `startExtraction`, `recordSkip`, `recordHeuristic` | creating new records |
| C | `markProvider`, `markProposed`, `markSuccess`, `markFailed` | advancing an existing record |
| D | `list`, `remove`, `clear`, `return` | reading/clearing (stays) |

- **Splits** (module level, above `createExtractionLog`):
  1. HELPER `createExtractionRecorders({ nowMs, nextId, pushNewest, emit }: CreateExtractionRecordersInput): Pick<ExtractionLog, 'startExtraction' | 'recordSkip' | 'recordHeuristic'>` ← the three function declarations verbatim.
  2. HELPER `createExtractionMarkers({ findById, nowMs, emit }: CreateExtractionMarkersInput): Pick<ExtractionLog, 'markProvider' | 'markProposed' | 'markSuccess' | 'markFailed'>` ← the four `mark*` declarations verbatim.
  3. Main: `const { startExtraction, recordSkip, recordHeuristic } = createExtractionRecorders({ … });` and the same for markers, placed where `startExtraction` was; `return {…}` unchanged. Input field types: `nowMs: () => number`, `nextId: () => string`, `pushNewest: (record: ExtractionRecord) => void`, `emit: typeof emit` → declare `type EmitExtractionEvent = (record: Parameters<…>[0]) => void` as the existing `emit` signature, `findById: (id: string) => ExtractionRecord | null`.
- **Importers to update:** none.
- **After:** file ~178; `createExtractionLog` ~45; helpers ~48 / ~33.
- **Risks / notes:** if `ExtractionLog` method types differ from the inner functions' declared types, use the inner signatures as an explicit return object type instead of `Pick`.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/mcp/src/federation/hosted/store.ts packages/mcp/src/server/http-tool-server.adapter.ts packages/mcp/src/server/tool-server.ts packages/memory/src/extraction-log.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
