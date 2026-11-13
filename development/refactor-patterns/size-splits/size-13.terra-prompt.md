# Terra job size-13: split 4 Jini file(s) by responsibility (size limits)

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
### jini:packages/core/src/redact.ts
- **Over:** file 601 lines (no function over 100)
- **Phase:** now · **Batch:** size-13
- **Package entry:** not an exports target; `src/index.ts` (entry `.`) has `export * from './redact.js'` → ADD `export * from './redact-shapes.js'` right below it (entry keeps the public API). The two other new modules export only internal names — do not add them to index.ts.
- **Tests:** `src/__tests__/redact.test.ts`, `redact.gap-audit.test.ts`, `redact.characterization.test.ts`, `redact.exact-only.test.ts`, `redaction-union.test.ts`, `security-vocabulary.test.ts` (asserts `core.X === X` identity → must import from `../redact-shapes.js`), `unit/filesystem-redaction-contracts.unit.test.ts`. Cross-package smoke: `pnpm --filter @jini-ai/cli exec vitest run src/__tests__/core-redaction-migration.test.ts --maxWorkers=2`. No `vi.mock` of redact.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A shapes | `SecretShapePattern`, `PEM_PATTERN_NAME`, `PRIVATE_KEY_HEADER`, `PRIVATE_KEY_BLOCK`, `SECRET_SHAPE_PATTERNS`, `createPrivateKeyLineRedactor`, `AGENT_FAILURE_TOKEN_SHAPES`, `AGENT_FAILURE_SECRET_SHAPE_RE`, `CREDENTIAL_FILE_DENY_SEGMENTS`, `LOCAL_OWNER_PROXY_MARKER_PREFIXES`, `LOCAL_OWNER_PROXY_MARKER_HEADERS` (L37-151) | security vocabulary shared with static scans and other packages |
| B spans | `Span`, `AddSpan`, `SpanPass`, `MergedSpan`, `mergeSpans`, `startsSeparateSpan`, `orderedSpanRanks`, `collectMatches` | span bookkeeping + merge order |
| C text scan | `LabelValue`, `isCoveredField`, `coveredLabelFields`, `labelValueExtents`, `unescapedQuoteFinder`, `isBackslashEscaped`, `forwardFinder`, `quotedValueEnd`, `exactNeedles`, `syntaxContainment`, `beginsSecretRun`, `forEachOccurrence`, `nextSearchOffset`, `borderTable` | pure scanners: label value extents, KMP occurrence search |
| D (stays) | patterns/regex constants L153-399, `redactSecrets`, `formatErrorForLog`, `diagnosticJson`, `redactSecretsWithCounts`, `collectSpans`, `trailingValue`, the `collect*` rule passes, `addLabelValue`, `emptyAssignmentRanges`, `collectEmptyQuotedAssignments`, `isLuhnValid`, `isMaskedValue` | the redaction pipeline and its rules |

- **Splits:**
  1. NEW `redact-shapes.ts` — unit A verbatim. The `@module redact` header paragraph(s) that describe the shared vocabulary are copied into its header; keep the original header in redact.ts. Imports nothing local. redact.ts imports `SECRET_SHAPE_PATTERNS` (used by `credentialPatterns`) from it.
  2. NEW `redact-spans.ts` — unit B verbatim (comments incl. the radix-order note). Exports all moved names. Imports nothing local.
  3. NEW `redact-text-scan.ts` — unit C verbatim (KMP and quote-finder comments move). Imports `Span` from `./redact-spans.js`. Before moving, confirm with the outline `uses:` that none of these reads a unit-D constant (per the outline they do not; if one does, leave that function in redact.ts and stop the move for it only).
- **Importers to update:** `src/index.ts` (add `export *` line); `src/__tests__/security-vocabulary.test.ts` (the 4 vocabulary names → `../redact-shapes.js`); `src/__tests__/redaction-union.test.ts` (`SECRET_SHAPE_PATTERNS` → `../redact-shapes.js`); `src/__tests__/redact.test.ts` (`createPrivateKeyLineRedactor` → `../redact-shapes.js`). `text/sanitize-untrusted-text.ts`, `user-facing-error.ts`, `settings/express/stream.ts` import only unit-D names → unchanged. Other packages import from `@jini-ai/core` → unchanged.
- **After:** redact.ts ~355; redact-shapes ~75; redact-spans ~75; redact-text-scan ~100.
- **Risks / notes:** `export *` from two modules: a name clash would silently drop the name — there is none (unit A names are unique). Regex objects with `g` flag are module singletons; `security-vocabulary.test.ts` checks identity via `core.X` — satisfied since index re-exports the same object.

### jini:packages/core/src/settings/express/http.ts
- **Over:** `registerSettingsRoutes` 112
- **Phase:** now · **Batch:** size-13
- **Package entry:** `./settings/express` → `src/settings/express/index.ts`; `registerSettingsRoutes` stays here, so nothing changes there.
- **Tests:** `src/settings/express/__tests__/settings-http.test.ts`, `settings-http.pins.test.ts`, `settings-http-request.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | statements in `registerSettingsRoutes` | job |
|---|---|---|
| A (stays) | destructure, `streams`, `disposed`, `wrap`, `check`, `readTarget`, value/reset/events routes, return | lifecycle, guards, writes, change feed |
| B | `app.get(routes.definitions…`, `app.get(routes.effective…`, `app.get(routes.raw…`, `app.post(routes.definitions…` | read + register-definition routes |
| C | `const mutate = (operation: ValueMutationOperation): Handler => …` | value set/clear handler |

- **Splits:**
  0. Move local `type Handler` to module level as `type SettingsRouteHandler` (same shape) — both new helpers and `wrap` use it.
  1. HELPER `mountDefinitionAndReadRoutes({ app, routes, wrap, check, readTarget, permissions, service, workspaceId }: MountDefinitionAndReadRoutesInput): void` — module level above `registerSettingsRoutes` ← the four route statements of unit B verbatim, same order. Type `wrap`/`check`/`readTarget` with their inferred signatures written out (`(handler: SettingsRouteHandler, mappings?: readonly SettingsErrorMapping[]) => RequestHandler` etc.); no `any`.
  2. HELPER `createValueMutationHandler({ workspaceId, permissions, check, service }: CreateValueMutationHandlerInput): (operation: ValueMutationOperation) => SettingsRouteHandler` ← unit C body verbatim; `registerSettingsRoutes` keeps `const mutate = createValueMutationHandler({ … });` at the same position.
- **Importers to update:** none.
- **After:** `registerSettingsRoutes` ~70; helpers ~38 / ~17; file ~175.
- **Risks / notes:** route registration order on `app` must not change (B stays between `readTarget` and `mutate`). `wrap` reads the mutable `disposed` — it stays in the main function, so no getter is needed.

### jini:packages/core/src/settings/tool-registrations.ts
- **Over:** `buildSettingsRegistrations` 116 (its `const handlers = {…}` literal is 103)
- **Phase:** now · **Batch:** size-13
- **Tests:** `src/settings/__tests__/tool-registrations.reads.test.ts`, `tool-registrations.set-value.test.ts`, `tool-registrations.clear-value.test.ts`, `tool-registrations.dotted-key.test.ts`, `tool-registrations.ui-preference.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A (stays) | module helpers L36-211, `buildSettingsRegistrations` shell + `return buildDomainRegistrations(…)` | registration wiring |
| B | `handlers` entries `settings_list_definitions`, `settings_get_effective`, `settings_get_raw` | read tools |
| C | `handlers` entry `settings_set_ui_preference` | UI-preference write tool |

- **Splits:**
  1. HELPER `buildSettingsReadHandlers({ routeDeps }: BuildSettingsReadHandlersInput): Record<string, ToolHandler>` — module level above `buildSettingsRegistrations` ← the three read entries verbatim as an object literal (same key order).
  2. HELPER `buildUiPreferenceHandler({ routeDeps }: BuildUiPreferenceHandlerInput): ToolHandler` ← the `settings_set_ui_preference` arrow body verbatim (comments move).
  3. `handlers` becomes `{ settings_set_value: …, settings_clear_value: …, ...buildSettingsReadHandlers({ routeDeps }), settings_set_ui_preference: buildUiPreferenceHandler({ routeDeps }) }` — key insertion order unchanged.
- **Importers to update:** none.
- **After:** `buildSettingsRegistrations` ~22; `buildSettingsReadHandlers` ~68; `buildUiPreferenceHandler` ~52; file ~240.
- **Risks / notes:** if any downstream code iterates `Object.keys(handlers)`, order is preserved by spreading in place.

### jini:packages/core/src/settings/write-service.ts
- **Over:** file 777 lines (no function over 100)
- **Phase:** now · **Batch:** size-13
- **Package entry:** not an exports target. `./settings` → `src/settings/index.ts`, which re-exports from `./write-service.js` (~L70-84): split that export block per name onto the new modules (index.ts is the entry and keeps every name).
- **Tests:** `src/settings/__tests__/write-service.set.test.ts`, `write-service.scope-guards.test.ts`, `write-service.scope-guards.f2.test.ts`, `write-service.reset.test.ts`, `write-service.revision-check.test.ts`, `write-service.principal-check.test.ts`, `write-service.permission-derivation.test.ts`, `write-service.definitions-manage-authorization.test.ts`, `write-service.reconcile-default.test.ts`, `settings.lifecycle-rename.test.ts`, `settings.lifecycle-retype.test.ts`, `settings.lifecycle-deprecate-tombstone.test.ts`, `settings.registration.test.ts`, `definitions-dispatch.test.ts`, `ensure-definitions.test.ts`, `cache.test.ts`, `purge-service.test.ts`, `tool-registrations.set-value.test.ts`, `unit/catalog-contracts.unit.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A auth | `AuthorizeFn`, `SettingsWriteServiceDeps`, `deriveRequiredPermission`, `authorizeDefinitionsManage` | who may write what (shared by both write kinds) |
| B values (stays) | `SetValueRequired`, `resolveScopedDefinitionOrThrow`, `assertTargetWorkspaceMatchesAuth`, `assertTargetPrincipalInWorkspace`, `SettingsValueWriteOptions`, `readAddressedValue`, `assertExpectedRevision`, `set`, `ClearValueRequired`, `clear`, `ResetNamespaceRequired`, `resetNamespace` | value writes (set / clear / reset) |
| C definitions | `RegisterDefinitionsRequired`, `registerDefinitions`, `resolveActiveDefinitionOrThrow`, `RenameDefinitionRequired`, `renameDefinition`, `RetypeDefinitionRequired`, `retypeDefinition`, `extendDefinitionScopes`, `ReconcileDefinitionDefaultRequired`, `reconcileDefinitionDefault`, `DeprecateDefinitionRequired`, `TombstoneDefinitionRequired`, `transitionDefinitionStatus`, `deprecateDefinition`, `tombstoneDefinition` | definition lifecycle writes |

- **Splits:**
  1. NEW `write-service-auth.ts` — unit A verbatim (the behavior.spec §1.3 comment on `deriveRequiredPermission` moves). `authorizeDefinitionsManage` becomes exported (was module-private). Imports nothing local.
  2. NEW `write-service-definitions.ts` — unit C verbatim, in source order (all mechanism doc blocks move). The original `@file` header's "single write chokepoint" paragraph is copied into its header. Imports from `./write-service-auth.js` only (never from write-service.ts).
  3. write-service.ts keeps unit B; imports `SettingsWriteServiceDeps`, `deriveRequiredPermission` from auth. It does NOT re-export moved names.
- **Importers to update:** `src/settings/index.ts` (entry: retarget per name); `settings/ensure-definitions.ts` (`SettingsWriteServiceDeps` → auth; check its other names); `settings/purge-service.ts` (`AuthorizeFn` → auth); `settings/definitions-dispatch.ts` (`renameDefinition`, `retypeDefinition`, `deprecateDefinition`, `tombstoneDefinition` → definitions; `SettingsWriteServiceDeps` → auth); `settings/agent-value-write-tools.ts` (`deriveRequiredPermission`, `SettingsWriteServiceDeps` → auth; `set`, `clear` stay); tests importing `registerDefinitions`/`renameDefinition`/`retypeDefinition`/`extendDefinitionScopes`/`reconcileDefinitionDefault`/`deprecateDefinition`/`tombstoneDefinition` → `../write-service-definitions.js`; `deriveRequiredPermission`/`SettingsWriteServiceDeps` → `../write-service-auth.js` (write-service.permission-derivation, revision-check, definitions-manage-authorization, cache — check each import list).
- **After:** write-service.ts ~330; write-service-auth ~50; write-service-definitions ~430.
- **Risks / notes:** `resetNamespace` calls `clear` — both stay together. No cycle: definitions → auth, values → auth.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/core/src/redact.ts packages/core/src/settings/express/http.ts packages/core/src/settings/tool-registrations.ts packages/core/src/settings/write-service.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
