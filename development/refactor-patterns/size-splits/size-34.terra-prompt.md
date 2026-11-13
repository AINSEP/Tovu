# Terra job size-34: split 4 Jini file(s) by responsibility (size limits)

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
### jini:packages/plugins/src/host/capability-tools.ts
- **Over:** `createPluginCapabilityTools` 186
- **Phase:** now · **Batch:** size-34
- **Tests:** `src/host/__tests__/unit/capability-tools.extract-s6.unit.test.ts`, `src/host/__tests__/unit/capability-tools.before-save-hook.extract-s6-fix.unit.test.ts` (`pnpm --filter @jini-ai/plugins exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | exported interfaces/types, `isPluginEnabledInWorkspace`, `runsFreshFor`, `pluginCapabilityToolDerivedRisk`, `readStoredFieldBag`, `decodeFieldValue` | contracts + pure helpers (unchanged) |
| B | `genericFieldDescription`, `buildFieldSources`, `buildCapabilityToolDescription`, `loadEnabledPluginCapabilityToolSources` | discover enabled plugins → tool sources |
| C | `buildCapabilityInputSchema`, `buildCapabilityToolResult`, `resolveFieldBag`, `capabilityCatalogEntry`, `capabilityToolHandler` | one capability tool's schema + call handler |
| D | `isCapabilityCallableNow`, `withActivationGate`, `buildPluginCapabilityToolRegistrations`, `executablePluginToolPorts`, `registerEnabledPluginCapabilityTools`, `return {` | registration (stays) |

- **Splits** (module level above `createPluginCapabilityTools`, B then C; both generic over the same `<TPost, TDraft, TFamily>` constraints copied from `createPluginCapabilityTools`):
  1. HELPER `createCapabilitySourceLoader({ text, identityNamespace, beforeSaveHook }: CreateCapabilitySourceLoaderInput): { loadEnabledPluginCapabilityToolSources }` ← unit B verbatim (keep each "why" comment). Input field types: the matching property types of `PluginCapabilityToolsRequired<TPost, TDraft, TFamily>` (use indexed access, e.g. `PluginCapabilityToolsRequired<TPost, TDraft, TFamily>['text']`).
  2. HELPER `createCapabilityCallHandlers({ required, text, access, toPreviewDraft }: CreateCapabilityCallHandlersInput): { capabilityCatalogEntry; capabilityToolHandler }` ← unit C verbatim; inside, `type Deps = PluginCapabilityToolDeps<TPost, TDraft>;` re-declared (same as main's).
  3. Main keeps the destructure, `type Deps`, calls both helpers, and unit D.
- **Importers to update:** none (helpers are not exported; `host/index.ts` does `export * from './capability-tools.js'`, so do NOT export the new helpers).
- **After:** file ~305; `createPluginCapabilityTools` ~75; `createCapabilitySourceLoader` ~45; `createCapabilityCallHandlers` ~80.
- **Risks / notes:** confirm which destructured names each moved function reads (outline: `text`, `access`, `identityNamespace`, `beforeSaveHook`, `toPreviewDraft`, `required`) and pass exactly those. The `@file` header (on `PluginCapabilityToolText`) is untouched.

### jini:packages/plugins/src/host/declarative-content-types.ts
- **Over:** `createDeclarativeContentTypes` 131
- **Phase:** now · **Batch:** size-34
- **Tests:** `src/host/__tests__/unit/declarative-content-types.extract-s6.unit.test.ts` (`pnpm --filter @jini-ai/plugins exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | consts, interfaces, `declError` … `labelValid`, `incompatibilities`, `planDeclaredContentTypes`, `judgeLostRace` | grammar helpers + planning (unchanged) |
| B | `fieldIdentity`, `parseField`, `parseFields` | parse one type's `fields[]` |
| C | `keyErrors`, `parseDecl`, `parseDeclaredContentTypes`, `validateDeclarativeManifest` | parse/validate declarations (stays) |
| D | `applyDeclaredContentTypes`, `createDeclared` | apply a plan via write ports |

- **Splits** (module level above `createDeclarativeContentTypes`):
  1. HELPER `createDeclaredFieldParser({ isContentTypeFieldKind, isIndexableFieldKind, validateIdentifierGrammar, IDENTIFIER_GRAMMAR_TEXT, CONTENT_TYPE_FIELD_KINDS }: CreateDeclaredFieldParserInput): { parseFields }` ← `function fieldIdentity(` through `function parseFields(` (with the "One `fields[]`" comment). Input = exactly the destructured names those bodies read; types = `DeclaredContentTypeCms[...]` indexed accesses.
  2. HELPER `createDeclaredContentTypeApplier({ isAlreadyExists }: CreateDeclaredContentTypeApplierInput): { applyDeclaredContentTypes }` ← `async function applyDeclaredContentTypes(` (with its "Carries out a conflict-free plan" comment) and `async function createDeclared(` (with its comment).
  3. Main keeps the destructure, `RESERVED_KEYS`, unit C, and `return {`.
- **Importers to update:** none (helpers not exported; `host/index.ts` re-exports this file with `export *`).
- **After:** file ~285; `createDeclarativeContentTypes` ~65; helpers ~45 / ~28.
- **Risks / notes:** error text/order in collect-all parsing must not change.

### jini:packages/plugins/src/host/node/source-drafts.ts
- **Over:** `createPluginSourceService` 180
- **Phase:** now · **Batch:** size-34
- **Tests:** `src/host/__tests__/unit/source-drafts.unit.test.ts` (`pnpm --filter @jini-ai/plugins exec vitest run src/host/__tests__/unit/source-drafts.unit.test.ts --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `root`, `drafts`, `draft`, `marker`, `approval`, `locked` | paths + cross-process lock (stays) |
| B | `versions`, `snapshot`, `putDraft`, `open`, `write`, `read` | draft file operations |
| C | `validate`, `publish`, `stageSealedPackage`, `reloadAndPrune` | seal + publish a draft |
| D | props `isSealedHere`, `readApproval` | seal provenance queries |
| E | `return {` remaining props | port surface (stays) |

- **Splits** (module level above `createPluginSourceService`):
  1. HELPER `createDraftFiles({ root, drafts, draft }: CreateDraftFilesInput): { versions; snapshot; putDraft; open; write; read }` ← `async function versions(` through `async function read(`.
  2. HELPER `createDraftSealer({ required, optional, root, marker, versions }: CreateDraftSealerInput): { publish }` ← `function validate(` through `async function reloadAndPrune(` (keep the "Writes the draft files, then the manifest" comment). Also return `validate` if a remaining prop calls it.
  3. HELPER `createSealProvenance({ root, marker, approval, versions }: CreateSealProvenanceInput): { isSealedHere; readApproval }` ← the two prop values verbatim (as arrow/method functions); props become `isSealedHere, readApproval` shorthand (keep the doc comments above the props on the helper's functions).
  4. Main keeps unit A, calls the three helpers, `return {`.
- **Importers to update:** none (`node/index.ts` `export *` — helpers are not exported).
- **After:** file ~312; `createPluginSourceService` ~75; helpers ≤ 60.
- **Risks / notes:** input field types: `required: PluginSourceDeps`, `optional`: the function's existing optional param type (extract it to a named `PluginSourceServiceOptions` type alias at module level, same shape). Lock usage (`locked`) stays in props.

### jini:packages/plugins/src/host/provider-host.ts
- **Over:** `createPluginProviderHost` 134
- **Phase:** now · **Batch:** size-34
- **Tests:** `src/host/__tests__/unit/provider-contributions.unit.test.ts`, `src/host/__tests__/unit/provider-guidance.unit.test.ts` (`pnpm --filter @jini-ai/plugins exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | timeouts, `contracts` map, sets, `closed`/`shutdown` lets, `current`, `track`, `cleanup`, `unsubscribe`, `report`, `findProvider`, `initialize`, `return {` | host state + entry points (stays) |
| B | `validatePort` (reads no locals) | contract shape check |
| C | `releaserFor`, `leaseResource`, `admit` | admit a factory result as a disposable lease |
| D | `untilRetiredOrDeadline` | race factory vs retirement vs deadline |

- **Splits** (module level above `createPluginProviderHost`):
  1. Lift `function validatePort(input: …)` verbatim.
  2. HELPER `createLeaseAdmission({ disposers, timeoutMs, report, current, acquired, track, cleanup }: CreateLeaseAdmissionInput): { admit }` ← `function releaserFor(` , `function leaseResource(`, `async function admit(` (with its "Admit one factory result" comment).
  3. HELPER `untilRetiredOrDeadline({ current, initializeTimeoutMs, wakers, …input }: UntilRetiredOrDeadlineInput)` — merge the existing `input` fields into the one object; main keeps a same-named local arrow passing them, so `initialize` is unchanged.
- **Importers to update:** none.
- **After:** file ~228; `createPluginProviderHost` ~80; helpers ≤ 40.
- **Risks / notes:** `closed`/`shutdown` are `let`s — they stay in main; `current` (reads `closed`) is passed as a function, so it still sees the live value.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/plugins/src/host/capability-tools.ts packages/plugins/src/host/declarative-content-types.ts packages/plugins/src/host/node/source-drafts.ts packages/plugins/src/host/provider-host.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
