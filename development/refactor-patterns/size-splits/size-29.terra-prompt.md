# Terra job size-29: split 7 Jini file(s) by responsibility (size limits)

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
### jini:packages/integrations/src/api-connections/hosted-mcp/shared-sign-in.ts
- **Over:** `createSharedExternalMcpOAuth` 257
- **Phase:** now · **Batch:** size-29
- **Tests:** `src/api-connections/hosted-mcp/__tests__/shared-owner.test.ts` (run: `pnpm --filter @jini-ai/integrations exec vitest run src/api-connections/hosted-mcp/__tests__/shared-owner.test.ts --maxWorkers=2`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | interfaces `SharedSignIn*`, `SharedExternalMcpOwner`, `SharedMcpConfiguration`, `SharedMcpContext`, `MCP_PLUGIN_ID`, `consumerId` | contracts the host fulfils (unchanged) |
| B | `optionalAuthorization`, `audienceIdentity` (closure fns that read no locals) | pure endpoint-identity helpers |
| C | `unavailable` … `refreshFor` (L88–L131) | per-site resolvers: errors, binding/context lookup, endpoint target, refresher cache |
| D | `consumer` … `currentSelection` (L132–L214) | selection/attempt steps over the owner store |
| E | `return {` props `beginConnect`, `pollDeviceAuthorization` | the two long service methods |
| F | the returned service object | wiring |

- **Splits** (same file, module level, above `createSharedExternalMcpOAuth`, in this order):
  1. Lift `function optionalAuthorization(...)` and `function audienceIdentity(...)` verbatim to module level (they read no closure locals).
  2. HELPER `createSharedSignInResolvers({ deps, shared, resolveProvider, ports }: CreateSharedSignInResolversInput): SharedSignInResolvers` ← statements `const unavailable = () => new ApiConnectionError(` through `async function refreshFor(credentialId: string) {` (~45 lines). Returns `{ unavailable, invalidState, deviceKeyFor, bindingFor, contextFor, endpointIdentity, target, refreshFor }` (`refreshers` stays private inside it). It destructures `owner, bindings, siteId` from `shared` itself. Type `SharedSignInResolvers` = `ReturnType<typeof createSharedSignInResolvers>` declared right below the function.
  3. HELPER `createSharedSignInSteps({ deps, shared, configure, ports, resolvers }: CreateSharedSignInStepsInput): SharedSignInSteps` ← statements `const consumer = createSharedOAuthConsumer({` through `async function currentSelection(input: { serverId: string }) {` (~85 lines). Reads resolver functions from `resolvers`. Returns `{ consumer, selected, assertAttempt, stateFor, assertOwner, createSelection, install, connectionOption, currentSelection }`. `SharedSignInSteps` = `ReturnType<typeof createSharedSignInSteps>`.
  4. HELPER `beginSharedConnect({ scope, input }: BeginSharedConnectInput): Promise<ExternalMcpConnectStart>` ← body of prop `beginConnect` (input type = the prop's existing inline param type, named `SharedBeginConnectRequest`). `scope` = `{ deps, shared, ports, ...resolvers, ...steps }` typed `SharedSignInScope`.
  5. HELPER `pollSharedDeviceAuthorization({ scope, input }: PollSharedDeviceAuthorizationInput)` (return type inferred as today) ← body of prop `pollDeviceAuthorization`.
  6. `createSharedExternalMcpOAuth` keeps: the two destructures, `const resolvers = createSharedSignInResolvers(...)`, `const steps = createSharedSignInSteps(...)`, then destructures the names its remaining props use (so prop bodies are unchanged) and the `return {` with `beginConnect: (input) => beginSharedConnect({ scope, input })`, `pollDeviceAuthorization: (input) => pollSharedDeviceAuthorization({ scope, input })`.
- **Importers to update:** none (no export moves; `index.ts` export unchanged).
- **After:** file ~325; `createSharedExternalMcpOAuth` ~85; `createSharedSignInSteps` ~88; `createSharedSignInResolvers` ~47; others < 30.
- **Risks / notes:** keep the order of statements inside each helper (the `refreshers` Map must be created once per service, so it lives in `createSharedSignInResolvers` which is called once). The `// Site-specific bindings…` doc comment stays on `createSharedExternalMcpOAuth`. Methods using `this`? none — the props use closure names only.

### jini:packages/integrations/src/api-connections/hosted-mcp/sign-in.ts
- **Over:** file 602 lines · `createHostedMcpSignInService` 216
- **Phase:** now · **Batch:** size-29
- **Tests:** `src/api-connections/hosted-mcp/__tests__/shared-owner.test.ts` (only direct test; also `src/api-connections/__tests__/security-pins.test.ts`, `src/api-connections/__tests__/access-token.unit.test.ts` as smoke). `pnpm --filter @jini-ai/integrations exec vitest run <path> --maxWorkers=2`.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `createDeviceAuthorizationStore`, `requireOAuthRecord`, `notifyConnected`, `resolveProviderDescriptor`, `resolveClient`, `buildConnectionOwnedProvider`, `CLIENT_REJECTED_PROVIDER_CODES`, `ownerKeyOf`, `resourceOption`, `sealedRedirectState`, `persistTokens`, `setOAuthStatus` + its clear-token helpers, `createHostedMcpSignInService` | the sign-in service (stays) |
| B | `SignInDeps`, `ExternalMcpOAuthServiceDeps` | dependency types (shared by A and C) |
| C | `StoredOAuthEndpoints`, `readStoredEndpoints`, `STORED_CLIENT_AUTH_METHODS`, `readStoredClientAuth`, `readStoredScopes`, `needsEndpointDiscovery`, `toStoredEndpoints`, `isSelfRegisteredClient`, `isStaleSelfRegisteredClient`, `withoutSelfRegisteredClient` | reading/narrowing the row's stored OAuth columns (pure) |
| D | `CONNECT_TIMEOUT_MS`, `oauthClientOptions`, `noOAuthProviderError`, `discoverConnectionAuthorizationServer`, `DEVICE_CODE_GRANT_TYPE`, `registrationGrantTypes`, `resolveGrantFromDiscovery`, `mintClientForConnection`, `persistSelfConfiguration`, `selfConfigureConnection`, `selfConfiguredGrant`, `selfConfiguredScopes`, `withMintedClient` | connect-time self-configuration: discovery + dynamic client registration |

- **Splits:**
  1. NEW `sign-in-types.ts` — job: the sign-in's dependency types. Moves: `SignInDeps`, `ExternalMcpOAuthServiceDeps` (both exported) with their doc comments. Imports the types they reference (`ExternalMcpOAuthDeps as HostedMcpOAuthDeps`, `HostedMcpSignInPorts` from `./contracts.js`, `SharedExternalMcpOwner` type from `./shared-sign-in.js`, `OAuthProviderRegistry`).
  2. NEW `sign-in-stored-endpoints.ts` — job: the row's stored OAuth columns. Moves unit C (all exported). Imports only core contract types. Nothing from the original.
  3. NEW `sign-in-self-configure.ts` — job: discovery + dynamic client registration on connect. Moves unit D; exports `CONNECT_TIMEOUT_MS`, `oauthClientOptions`, `noOAuthProviderError`, `selfConfigureConnection` (the rest stay module-private). Imports `SignInDeps` from `./sign-in-types.js` and unit C names from `./sign-in-stored-endpoints.js`. The `@file` header paragraph stays in `sign-in.ts`; the doc comment directly on `CONNECT_TIMEOUT_MS` ("A human is watching…") moves with it.
  4. `sign-in.ts` imports from the three new modules.
  5. HELPERS above `createHostedMcpSignInService`: `createRowTokenRefresher({ deps }: CreateRowTokenRefresherInput): ReturnType<HostedMcpSignInPorts['flow']['createTokenRefresher']>` ← the `deps.ports.flow.createTokenRefresher({ … })` call from `const refresher = deps.ports.flow.createTokenRefresher({` (main keeps `const refresher = createRowTokenRefresher({ deps });`) · `beginHostedConnect({ deps, shared, input }: BeginHostedConnectInput)` ← body of prop `beginConnect` · `completeHostedAuthorizationCallback({ deps, shared, input }: CompleteHostedAuthorizationCallbackInput)` ← body of prop `completeAuthorizationCallback` (prop keeps `(input, _options = {})` and calls it) · `pollHostedDeviceAuthorization({ deps, shared, refresher, input }: PollHostedDeviceAuthorizationInput)` ← body of prop `pollDeviceAuthorization` (pass only the closure names each body actually reads; `deps` typed `ExternalMcpOAuthServiceDeps`, `shared` typed `ReturnType<typeof createSharedExternalMcpOAuth> | undefined`). Input param types = `Parameters<ExternalMcpOAuthService['<method>']>[0]`; return types inferred as today.
- **Importers to update:** none — `createHostedMcpSignInService` and `createDeviceAuthorizationStore` stay (exported via `hosted-mcp/index.ts`, package entry `./api-connections/hosted-mcp`).
- **After:** `sign-in.ts` ~430; `createHostedMcpSignInService` ~75; `createRowTokenRefresher` ~45; `beginHostedConnect` ~52; `sign-in-self-configure.ts` ~150; `sign-in-stored-endpoints.ts` ~70; `sign-in-types.ts` ~8.
- **Risks / notes:** cycle avoided by `sign-in-types.ts` (types needed by both sides). `setOAuthStatus` (stays) imports `isSelfRegisteredClient`/`withoutSelfRegisteredClient` from the stored-endpoints module. Move the long RFC "why" comments above `DEVICE_CODE_GRANT_TYPE`, `registrationGrantTypes`, `selfConfigureConnection`, `withMintedClient`, `isStaleSelfRegisteredClient` word for word. Prop `reportAuthFailure(serverId, error)` and `tokenResolver` stay inline.

### jini:packages/integrations/src/api-connections/token-store/vault-token-store.ts
- **Over:** `createVaultOAuthTokenStore` 147
- **Phase:** now · **Batch:** size-29
- **Tests:** `src/api-connections/token-store/__tests__/vault-token-store.unit.test.ts`, `…/vault-token-store.security.test.ts`, `…/vault-token-store.slice.test.ts`, `src/api-connections/__tests__/credential-status.integration.test.ts` (`pnpm --filter @jini-ai/integrations exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | consts, `OAuthTokenVaultPort`, `VaultOAuthTokenStoreDeps`, private record interfaces | contracts (unchanged) |
| B | `identity`, `open`, `writeRecord`, `openInstallTarget`, `deleteOnce` | raw vault row access for one owner |
| C | `loads`, `observeLoad`, `takeRecentLoads` | recent-load observation window |
| D | `fencedWrite`, `claimLease` | lease-fenced writes |
| E | `held`, `installOnce`, `return {` | the store surface (stays) |

- **Splits** (same file, module level above `createVaultOAuthTokenStore`, in this order):
  1. HELPER `createVaultRecordAccess({ vault, vaultScope, owner, isConflict }: CreateVaultRecordAccessInput): VaultRecordAccess` ← `const identity = (key: string): VaultIdentity =>`, `const open = async (key: string)`, `const writeRecord = async (key: string, required:`, `const openInstallTarget = async (key: string)` (with its "Lease fields are kept" comment), `const deleteOnce = async (key: string)` (with its "Needs only the revision" comment). Returns those five. `VaultRecordAccess` = `ReturnType<typeof createVaultRecordAccess>`.
  2. HELPER `createLoadObservations({ clock }: CreateLoadObservationsInput): LoadObservations` ← `const loads = new Map<string, LoadObservation[]>();` (with its comment), `const observeLoad`, `const takeRecentLoads`. Returns `{ loads, observeLoad, takeRecentLoads }`.
  3. HELPER `createLeaseWriters({ held, readGeneration, open, owner, writeRecord, isConflict, clock, vault, identity }: CreateLeaseWritersInput): LeaseWriters` ← `const fencedWrite = async (key: string, required:` (with its "Every token write re-proves…" comment) and `const claimLease = async (key: string, required:`. Returns `{ fencedWrite, claimLease }`.
  4. `createVaultOAuthTokenStore` keeps: the deps destructure, `isConflict`, the workspace check (must stay before any helper call), `const held = new Map` (with its comment), then `const { identity, open, writeRecord, openInstallTarget, deleteOnce } = createVaultRecordAccess(...)`, `const { loads, observeLoad, takeRecentLoads } = createLoadObservations({ clock })`, `const { fencedWrite, claimLease } = createLeaseWriters(...)`, `installOnce`, and the `return {` unchanged.
- **Importers to update:** none outside the file.
- **After:** file ~190; `createVaultOAuthTokenStore` ~88; helpers ≤ 32 each.
- **Risks / notes:** `held` and `loads` Maps must be created once per store (each helper is called once). The workspace-mismatch throw stays the first statement after destructuring.

### jini:packages/integrations/src/credentialed-http/tools/tool-registrations.ts
- **Over:** `createCredentialToolRegistrations` 107
- **Phase:** now · **Batch:** size-29
- **Tests:** none import it by name in integrations except `src/credentialed-http/tools/__tests__/contracts-closure.test.ts` (smoke); run it with `pnpm --filter @jini-ai/integrations exec vitest run <path> --maxWorkers=2`, plus `pnpm --filter @jini-ai/integrations run typecheck`.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | set-username / set-token / create-card helpers, `createCredentialSaveHandlers` | save-card handling (unchanged) |
| B | handler `[operations.ids.makeRequest]` | model-issued credentialed request |
| C | handler `[operations.ids.writeFiles]` | repository files write |
| D | `list`, `verify`, `setUsername` handlers + `buildDomainRegistrations` call | registration wiring (stays) |

- **Splits** (same file, module level directly above `createCredentialToolRegistrations`):
  1. HELPER `createMakeRequestHandler({ routeDeps, host, operations, credentialedRequest }: CreateMakeRequestHandlerInput): ToolHandler` ← the arrow assigned to `[operations.ids.makeRequest]: async (ctx, { emitSurface } = {})` (body verbatim; the helper returns that arrow). Include in the input only the closure names the body reads.
  2. HELPER `createWriteFilesHandler({ routeDeps, host, operations, sourceControlWrite }: CreateWriteFilesHandlerInput): ToolHandler` ← the arrow for `[operations.ids.writeFiles]: async (ctx): Promise<WriteFilesResult>`.
  3. In `handlers`: `[operations.ids.makeRequest]: createMakeRequestHandler({ … })`, `[operations.ids.writeFiles]: createWriteFilesHandler({ … })`. Input types use the existing `CredentialToolActorDeps`, `CustomCredentialToolHost`, ports types from the function's signature.
- **Importers to update:** none.
- **After:** file ~465; `createCredentialToolRegistrations` ~40; `createMakeRequestHandler` ~55; `createWriteFilesHandler` ~42.
- **Risks / notes:** keep each handler's explicit return-type annotation on the arrow so `ToolHandler` assignment does not widen. Comments inside the handler bodies move with them.

### jini:packages/integrations/src/media-providers/dispatch/async-operation-store.ts
- **Over:** `createInMemoryAsyncOperationStore` 106
- **Phase:** now · **Batch:** size-29
- **Tests:** `src/media-providers/dispatch/__tests__/async-operation-store.test.ts`, `…/async-operation-store.contract.test.ts`, `…/operation-runtime.test.ts` (`pnpm --filter @jini-ai/integrations exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | types, constants, `assertNoCredentialMaterial`, `hydrateAsyncOperationRecord`, `assertTransition`, `mergeAsyncOperationPatch` … | shared store rules (unchanged) |
| B | prop `create` | in-memory insert |
| C | prop `reconcileOnBoot` | in-memory boot reconciliation |
| D | `rows` + remaining props | in-memory store (stays) |

- **Splits** (same file, above `createInMemoryAsyncOperationStore`):
  1. HELPER `createInMemoryRow({ rows, input }: CreateInMemoryRowInput): AsyncOperationRecord` ← body of prop `create` (keep `async`/return type exactly as the prop has them; if the prop is `async`, the helper is too and returns `Promise<AsyncOperationRecord>`).
  2. HELPER `reconcileInMemoryRows({ rows, options }: ReconcileInMemoryRowsInput): AsyncOperationReconcileResult` ← body of prop `reconcileOnBoot` (same async rule).
  3. Props become `create: (input) => createInMemoryRow({ rows, input })` style one-liners (keep the method doc comments on the props).
- **Importers to update:** none.
- **After:** file ~320; `createInMemoryAsyncOperationStore` ~55; helpers ~30 each.
- **Risks / notes:** `rows` is the only closure local. Keep `this`-free (props do not use `this`).

### jini:packages/integrations/src/media-providers/dispatch/sqlite-async-operation-store.ts
- **Over:** `createSqliteAsyncOperationStore` 145
- **Phase:** now · **Batch:** size-29
- **Tests:** `src/media-providers/dispatch/__tests__/sqlite-async-operation-store.test.ts`, `…/async-operation-store.contract.test.ts`, `src/media-providers/__tests__/hardwiring-ports.test.ts` (`pnpm --filter @jini-ai/integrations exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `LIVE_*`, `OperationRow`, `rowToOperation` | row mapping (unchanged) |
| B | `db.pragma` + `db.exec(` | schema setup |
| C | `getStmt` … `releaseDeadLeasesStmt` | prepared statements |
| D | `jsonOrNull` | JSON column encoding (pure) |
| E | `createTxn` … `reconcileTxn`, `return {` | the store (stays) |

- **Splits** (same file, above `createSqliteAsyncOperationStore`, in order):
  1. Lift `function jsonOrNull(value: object | null | undefined): string | null` verbatim (with its comment) to module level.
  2. HELPER `prepareAsyncOperationSchema({ db }: PrepareAsyncOperationSchemaInput): void` ← `db.pragma('journal_mode = WAL');` and the `db.exec(` statement.
  3. HELPER `prepareAsyncOperationStatements({ db }: PrepareAsyncOperationStatementsInput)` ← `const getStmt = db.prepare<[string], OperationRow>(` through `const releaseDeadLeasesStmt = db.prepare<unknown[], OperationRow>(` (keep the "Variadic bind params" comment). Returns all eight statements; type `AsyncOperationStatements = ReturnType<typeof prepareAsyncOperationStatements>`. `db` type = the opener's return type already used in the file.
  4. Main keeps `open`, `db`, calls the two helpers, destructures the eight statements, then the txns and `return {` unchanged.
- **Importers to update:** none.
- **After:** file ~225; `createSqliteAsyncOperationStore` ~75; `prepareAsyncOperationStatements` ~47.
- **Risks / notes:** order preserved: pragma → exec → prepare (prepare needs the table).

### jini:packages/integrations/src/media-providers/sqlite-task-store.ts
- **Over:** `createSqliteMediaTaskStore` 140
- **Phase:** now · **Batch:** size-29
- **Tests:** `src/media-providers/__tests__/sqlite-task-store.test.ts`, `src/media-providers/__tests__/hardwiring-ports.test.ts` (`pnpm --filter @jini-ai/integrations exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `TaskRow`, `rowToTask` | row mapping (unchanged) |
| B | `db.pragma` + `db.exec(` | schema setup |
| C | `getStmt` … `selectAllStmt` | prepared statements |
| D | `writeRow` | task → row write |
| E | txns + `return {` | the store (stays) |

- **Splits** (same file, above the function):
  1. HELPER `prepareMediaTaskSchema({ db }: PrepareMediaTaskSchemaInput): void` ← `db.pragma('journal_mode = WAL');` + `db.exec(`.
  2. HELPER `prepareMediaTaskStatements({ db }: PrepareMediaTaskStatementsInput)` ← `const getStmt = db.prepare<[string], TaskRow>(` through `const selectAllStmt = db.prepare<[], TaskRow>(`; returns the seven statements; `MediaTaskStatements = ReturnType<typeof prepareMediaTaskStatements>`.
  3. HELPER `writeTaskRow({ statements, task, isInsert }: WriteTaskRowInput): void` ← body of `function writeRow(task: MediaTask, isInsert: boolean)` (reads `statements.insertStmt`/`statements.updateStmt`). Main keeps `const writeRow = (task: MediaTask, isInsert: boolean): void => writeTaskRow({ statements, task, isInsert });` so txn bodies are unchanged.
  4. Main keeps `dbPath`, `open` (with the "string overload" comment), `db`, the two calls, destructure, `writeRow` wrapper, txns, `return {`.
- **Importers to update:** none.
- **After:** file ~195; `createSqliteMediaTaskStore` ~75; helpers ≤ 30.
- **Risks / notes:** none beyond statement order (pragma → exec → prepare).

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/integrations/src/api-connections/hosted-mcp/shared-sign-in.ts packages/integrations/src/api-connections/hosted-mcp/sign-in.ts packages/integrations/src/api-connections/token-store/vault-token-store.ts packages/integrations/src/credentialed-http/tools/tool-registrations.ts packages/integrations/src/media-providers/dispatch/async-operation-store.ts packages/integrations/src/media-providers/dispatch/sqlite-async-operation-store.ts packages/integrations/src/media-providers/sqlite-task-store.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
