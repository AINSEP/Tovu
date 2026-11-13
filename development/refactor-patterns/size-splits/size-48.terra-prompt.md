# Terra job size-48: split 6 Tovu file(s) by responsibility (size limits)

Generated 2026-11-13 by `development/refactor-patterns/size-splits/assemble.mjs` from the per-file design fragments. Self-contained: the rules, the per-file plans and the checks are all below.

Repo: the Tovu clone you are given (Tovu only). `TOVU` below = that clone's root.

AFTER-MOVE: run this job only after the Tovu→Jini move work for these files has landed. If a file is gone, or `outline.mjs` no longer shows the declarations a fragment names, STOP that file and report it — the plan is stale for it.

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
### tovu:apps/website/src/features/deployments/publish-agent-tools.ts
- **Over:** file 763 lines · `buildStaticPublishRegistrations` 155
- **Phase:** after-move (MIXED: catalog copy, capabilit…) · **Batch:** size-48
- **Tests:** `apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts`, `apps/website/src/features/deployments/__tests__/publish-agent-tools.abort-guard.unit.test.ts`, `apps/website/src/features/deployments/static-publish/__tests__/domain-publish-tool.unit.test.ts`, `apps/website/src/assistant/__tests__/moved-tools.credential-cards.golden.test.ts`, `apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | re-exports, `AgentToolDefinition`, `NO_INPUT_SCHEMA`, the 3 schemas, `DEPLOYMENTS_READ_PERMISSION`, `SITE_PUBLISH_ENTITY`, `staticPublishAgentToolCatalog`, `CATALOG_BY_ID`, `staticPublishDerivedRisk`, `planToolPublish`, `PUBLISH_REQUEST_KEYS`, `toolCredentialChoice`, `requireOnlyDeclaredFields`, `configDetailRows`, `EXECUTE_STATIC_PUBLISH_TOOL_ID`, `buildStaticPublishPreviewResult`, `trackBlockedToolPublish`, `MissingHost`, `hostsMissingSavedKey`, `buildStaticPublishRegistrations`, `contributeStaticPublishTools` | catalog + publish tool handlers (stays) |
| B | `buildCapabilityGuidance`, `ProviderCapabilityContext`, `mapSavedCredentials`, `buildProviderCapabilityResult`, `buildProviderCapability`, `buildInstalledProviderCapability` | per-provider capability answers |
| C | `DetailRow`, `publishConfirmationUri`, `buildPublishOutcomeResource`, `PublishConfirmationContext`, `mapPublishOutcomeToToolResult` | publish confirmation/outcome cards |
| D | `deployTargetsLoader`, `CUSTOM_PROVIDER_CREDENTIAL_ROW_LABEL`, `requireStaticPublishTarget`, `requireCredentialTarget`, `readCredentialHints`, `readCredentialHint`, `buildProposeCredentialForm`, `publishConnectionValues`, `publishCredentialToUpdate`, `saveProposedCredential`, `checkPublishReplacement`, `saveProposeCredential`, `credentialConnectionStatus`, `buildPublishHostCredentialHandler` | propose/save a host credential from chat |

- **Splits:**
  1. NEW `publish-agent-tools-capabilities.ts` — Moves unit B. Exports `ProviderCapabilityContext`, `buildInstalledProviderCapability`.
  2. NEW `publish-agent-tools-outcome.ts` — Moves unit C (+ the long outcome-card doc). Exports `DetailRow`, `mapPublishOutcomeToToolResult`.
  3. NEW `publish-agent-tools-credential.ts` — Moves unit D (+ the `ui://` form-URI comment above `requireStaticPublishTarget`). Exports `deployTargetsLoader`, `requireStaticPublishTarget`, `buildPublishHostCredentialHandler`. Needs `SITE_PUBLISH_ENTITY`: move that 1-line const here too and import it back in the original (new never imports original).
  4. HANDLER FACTORIES in the original, above `buildStaticPublishRegistrations`: `previewStaticPublishHandler({ deps, credentialSource })`, `staticPublishCapabilitiesHandler({ deps, credentialSource })`, `staticPublishStatusHandler({ deps, historyStore })`, `executeStaticPublishHandler({ deps, credentialSource, historyStore, surfaces })`, `bucketHostingSetupHandler({ deps })` — each `(…): ToolHandler` ← the value of the same-named key in `const handlers: Record<string, ToolHandler> = {` (exact inputs = what each body reads). `handlers` keeps the same keys in order.
- **Importers to update:** `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`, `apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts`, `apps/website/src/assistant/__tests__/moved-tools.credential-cards.golden.test.ts` (`buildPublishHostCredentialHandler` → `publish-agent-tools-credential`); `publish-agent-tools.unit.test.ts` if it imports `requireStaticPublishTarget`.
- **After:** original ~400; `buildStaticPublishRegistrations` ~20; `executeStaticPublishHandler` ~80; new files ~95 / ~95 / ~200.
- **Risks / notes:** no `mock.module` of this path found. `executeStaticPublishHandler` takes `(inputCtx, optional = {})` — keep that two-arg handler signature exactly.

### tovu:apps/website/src/features/forms/tool-registrations.ts
- **Over:** `buildFormsRegistrations` 163 (file 399)
- **Phase:** after-move (MIXED; MOVE-AFTER write-service.ts …; STAY-WIRING) · **Batch:** size-48
- **Tests:** `apps/website/src/features/forms/__tests__/tool-registrations.model-facing-errors.test.ts`, `apps/website/src/features/forms/__tests__/agent-tools.unit.test.ts`, `apps/website/src/features/forms/__tests__/tool-definition-view.unit.test.ts`, `apps/website/src/features/forms/__tests__/common-field-tools.test.ts`
- **Responsibility map:** `const handlers: Record<string, ToolHandler> = {` holds two jobs — form definitions (`forms_list_providers`, `forms_list_definitions`, `forms_create_definition`, `forms_update_definition`, `forms_set_definition_status`) and submissions/delivery (`forms_list_submissions`, `forms_get_submission`, `forms_delivery_status`, `forms_pull_submissions`).
- **Splits:**
  1. HELPER `buildFormsDefinitionHandlers({ routeDeps }: BuildFormsHandlersInput): Record<string, ToolHandler>` (same file, above `buildFormsRegistrations`) ← the five definition entries verbatim (with their comments).
  2. HELPER `buildFormsSubmissionHandlers({ routeDeps }: BuildFormsHandlersInput): Record<string, ToolHandler>` ← the four submission/delivery entries.
  `buildFormsRegistrations` becomes `const handlers: Record<string, ToolHandler> = { ...buildFormsDefinitionHandlers({ routeDeps }), ...buildFormsSubmissionHandlers({ routeDeps }) };` + the unchanged `return buildDomainRegistrations(` (key order preserved).
- **Importers to update:** none.
- **After:** `buildFormsRegistrations` ~15; helpers ~85 / ~70; file ~405.
- **Risks / notes:** none of the tests `mock.module` this file. MOVE-AFTER: handlers move with the write-service later; helpers move as a unit.

### tovu:apps/website/src/features/identity/repo.ts
- **Over:** file 616 lines (no function over 100)
- **Phase:** after-move (MOVE-AFTER content schema type; MOVE-AFTER …) · **Batch:** size-48
- **Tests:** `apps/website/src/features/identity/__tests__/repo.contract.test.ts`, `apps/website/src/features/identity/__tests__/repo.sqlite.test.ts`, `apps/website/src/features/identity/__tests__/repo.sqlite-kernel.test.ts`, `apps/website/src/features/identity/__tests__/mfa.repo.dialects.test.ts`, `apps/website/src/features/identity/__tests__/passkeys.repo.dialects.test.ts`
- **Responsibility map:** A accounts (`createIdentityTransactions`, `toPrincipalRecord`/`SqlPrincipalRepo`, `toUserRecord`/`SqlUserRepo`, `toSessionRecord`/`SqlSessionRepo`, `toApiKeyRecord`/`SqlApiKeyRepo`) · B RBAC (`toRoleRecord`/`SqlRoleRepo`, `toPolicyRecord`/`SqlPolicyRepo`, `toPolicyPermissionRecord`/`SqlPolicyPermissionRepo`, `toRolePolicyRecord`/`SqlRolePolicyRepo`, `toPrincipalRoleRecord`/`SqlPrincipalRoleRepo`, `toPrincipalPolicyRecord`/`SqlPrincipalPolicyRepo`).
- **Splits:**
  1. NEW `repo-transactions.ts` — Moves `createIdentityTransactions` (+ the `@file` paragraph on the one-Kysely-body adapters, copied). Exports it.
  2. NEW `repo-rbac.ts` — Moves unit B (mappers stay next to their class). Imports `createIdentityTransactions` from step 1. Exports the six classes.
  `repo.ts` keeps unit A, importing `createIdentityTransactions` from step 1.
- **Importers to update:** `createIdentityTransactions` → `features/identity/mfa.repo.ts`, `features/identity/passkeys.repo.ts`, `features/identity/wiring.ts`, tests `__tests__/passkeys.repo.dialects.test.ts`, `__tests__/recovery-codes.repo.dialects.test.ts`, `__tests__/repo.sqlite-kernel.test.ts`, `__tests__/mfa.repo.dialects.test.ts`; RBAC classes → `features/identity/repo.sqlite.ts`, `features/identity/__tests__/repo.contract.test.ts`. Also rg `from ".*identity/repo(\.js)?"` for any other path (e.g. composition) and repoint per name.
- **After:** `repo.ts` ~290; `repo-rbac.ts` ~320; `repo-transactions.ts` ~15.
- **Risks / notes:** no `mock.module` of `identity/repo` found. MOVE-AFTER: if the schema/repo moves to Jini first, this split is moot.
- **Owner exception candidate:** alternatively — ten sibling repo classes of one adapter family; acceptable either way (split above is by table family, so it is a real responsibility split).

### tovu:apps/website/src/features/identity/tool-registrations.ts
- **Over:** `buildGatedIdentityRegistrations` 154 (file 213)
- **Phase:** after-move (MOVE-AFTER write-service.ts …; STAY-WIRING) · **Batch:** size-48
- **Tests:** `apps/website/src/features/identity/__tests__/tool-registrations.human-confirm.test.ts`, `apps/website/src/features/identity/__tests__/change-username-tool.test.ts`, `apps/website/src/features/identity/__tests__/permission-list-tool.test.ts`, `apps/website/src/server/runtime/composition/modules/__tests__/assistant-tool-exec.integration.test.ts`
- **Responsibility map:** delete-reference lookup (`deleteReferences`) · human-confirmed delete wrapper (`confirmedDelete`) · human-password user create wrapper (`createUserWithHumanPassword`) · clock/identity/username port assembly + `return withToolMetadata(` (stays).
- **Splits** (HELPERS, module level above the function, closures turned into explicit inputs):
  1. `loadIdentityDeleteReferences({ routeDeps, kind, id }: LoadIdentityDeleteReferencesInput): Promise<…same return…>` ← the `deleteReferences` arrow body (+ "Each family supplies" comment). Inside the main function keep `const deleteReferences = ({ kind, id }, _options = {}) => loadIdentityDeleteReferences({ routeDeps, kind, id });` only if its call sites pass `_options`; otherwise call the helper directly.
  2. `confirmedIdentityDelete({ registration, kind, surfaces, routeDeps }: ConfirmedIdentityDeleteInput): ToolRegistration` ← `confirmedDelete`'s body (calls helper 1).
  3. `createUserWithHumanPassword({ inner, publishedSchema, routeDeps, surfaces }: CreateUserWithHumanPasswordInput): ToolHandler` ← that arrow's body (56 lines).
  In the `return withToolMetadata(` call, replace the closure references with arrows passing `routeDeps`/`surfaces` (same call shape the Jini builder expects).
- **Importers to update:** none.
- **After:** `buildGatedIdentityRegistrations` ~55; helpers ~12 / ~33 / ~58; file ~225.
- **Risks / notes:** check the exact parameter shape Jini's `buildIdentityRegistrations` passes to these two callbacks — the wrappers keep that shape.

### tovu:apps/website/src/features/media-import/tool-registrations.ts
- **Over:** `buildMediaImportRegistrations` 118 (file 260)
- **Phase:** after-move (MIXED; MOVE-AFTER write-service.ts …) · **Batch:** size-48
- **Tests:** `apps/website/src/features/media-import/__tests__/tool-registrations.test.ts`, `apps/website/src/features/media-import/__tests__/import-local-file.test.ts`, `apps/website/src/features/media-import/__tests__/replace-file.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.media-import-egress-refusal.integration.test.ts`
- **Responsibility map:** three handlers, one job each: `media_replace_file`, `media_import_local_file`, `media_import_from_url`.
- **Splits** (HANDLER FACTORIES, same file, above `buildMediaImportRegistrations`, in this order):
  1. `mediaReplaceFileHandler({ routeDeps }: MediaImportHandlerInput): ToolHandler` ← the `media_replace_file: async (ctx) => {…}` value.
  2. `mediaImportLocalFileHandler({ routeDeps }): ToolHandler` ← `media_import_local_file`'s value.
  3. `mediaImportFromUrlHandler({ routeDeps }): ToolHandler` ← `media_import_from_url`'s value.
  `handlers = { media_replace_file: mediaReplaceFileHandler({ routeDeps }), … }`.
- **Importers to update:** none.
- **After:** `buildMediaImportRegistrations` ~15; factories ~35 / ~40 / ~38; file ~270.

### tovu:apps/website/src/features/newsletter/repo.ts
- **Over:** file 548 lines (no function over 100)
- **Phase:** after-move (MOVE-AFTER content schema type; MOVE-AFTE…) · **Batch:** size-48
- **Tests:** `apps/website/src/features/newsletter/__tests__/repo.contract.test.ts`, `apps/website/src/features/newsletter/__tests__/repo.dialects.test.ts`, `apps/website/src/features/newsletter/__tests__/repo.rows.test.ts`
- **Responsibility map:** A editorial (`DEFAULT_LIST_LIMIT`, `campaignsWithEditorialState`, `SqlNewsletterCampaignRepo`, `SqlNewsletterListRepo`, `SqlNewsletterSubscriptionRepo`, `SqlNewsletterConfirmationTokenRepo`) · B dispatch (`SqlNewsletterAudienceSnapshotRepo`, `SqlNewsletterSendRepo` incl. `claimForDispatch` / `recordOutcome` lease logic).
- **Splits:**
  1. NEW `repo-dispatch.ts` — job: audience snapshots + send rows (dispatch leases). Moves unit B with all lease comments. `SqlNewsletterSendRepo` uses `DEFAULT_LIST_LIMIT`: move the constant (+ its comment) into `repo-dispatch.ts`, export it, and import it in `repo.ts` (new never imports original).
- **Importers to update:** `features/newsletter/repo.sqlite.ts`, `features/newsletter/__tests__/repo.dialects.test.ts` (both classes); rg `from ".*newsletter/repo(\.js)?"` for others.
- **After:** `repo.ts` ~365; `repo-dispatch.ts` ~185.
- **Risks / notes:** the `@file` paragraph ("one Kysely query body for every database") is copied into the new header.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/website/src/features/deployments/publish-agent-tools.ts apps/website/src/features/forms/tool-registrations.ts apps/website/src/features/identity/repo.ts apps/website/src/features/identity/tool-registrations.ts apps/website/src/features/media-import/tool-registrations.ts apps/website/src/features/newsletter/repo.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
