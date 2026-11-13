# Terra job size-41: split 2 Jini file(s) by responsibility (size limits)

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
### jini:packages/vibecoding/src/core/session.ts
- **Over:** `createVibecodingSession` 126 (file 170)
- **Phase:** now · **Batch:** size-41
- **Tests:** `packages/vibecoding/src/react/__tests__/session.test.ts`, `packages/vibecoding/src/session/__tests__/session-exports.test.ts`, `packages/vibecoding/src/__tests__/integration.test.ts`, `packages/vibecoding/src/node/__tests__/project-history.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | returned `undo`, `redo` (+ `cacheChange`, `restoredPatch` they use) | replay history into the part cache |
| B | returned `applyEdits` | apply one model turn of edits |
| C | `history`, `applyTurn`, `listeners`, `partContent`, `current`, `commit`, `run`, return (`getSnapshot`, `subscribe`, `refresh`, `readPart`, `takeSnapshot`, `restoreSnapshot`) | session state core (stays) |

- **Splits** (same file, module level above `createVibecodingSession`):
  1. `createHistoryReplay({ target, history, applyTurn, partContent, run, getCurrent }: CreateHistoryReplayInput): Pick<VibecodingSession, 'undo' | 'redo'>` ← the `undo` and `redo` method bodies verbatim, plus `cacheChange` and `restoredPatch` as inner functions (with their comments) ONLY if nothing else in the factory uses them — `restoreSnapshot` likely uses `restoredPatch`; if so keep both in the factory and pass them in instead. `current.parts` (read at run time inside `undo`/`redo`) becomes `getCurrent().parts`; pass `getCurrent: () => current`.
  2. `createApplyEdits({ target, history, applyTurn, partContent, run, options }: CreateApplyEditsInput): VibecodingSession['applyEdits']` ← `applyEdits` method body.
  Return object: `...createHistoryReplay(...)` / `applyEdits: createApplyEdits(...)` in the original key positions.
- **Importers to update:** none (the factory and its types stay; `./session` and `./core` entries unchanged).
- **After:** `createVibecodingSession` ~80; file ~195.
- **Risks / notes:** `current` is a reassigned `let` — every read inside moved code must go through `getCurrent()` (a captured value would be stale). Check `run` is typed generic — pass it as-is.

### jini:packages/vibecoding/src/node/store.ts
- **Over:** `createProjectStore` 246 (file 411)
- **Phase:** now · **Batch:** size-41
- **Tests:** `packages/vibecoding/src/node/__tests__/store-recovery.test.ts`, `packages/vibecoding/src/node/__tests__/store-symlink.security.test.ts`, `packages/vibecoding/src/node/__tests__/unit/project-contracts.unit.test.ts`, `packages/vibecoding/src/node/__tests__/project-turn.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `currentPath`, `objectPath`, `manifestPath`, `checkpoint`, `metadataLimit`, `readCurrent`, `manifest`, `object` | state-dir paths + verified reads (core) |
| B | `prepare`, `writeObject` | stage objects/manifest before selection |
| C | `observations`, `scan`, `scanFile`, `readWorkingFile` | fingerprint/scan the live tree |
| D | `removeManaged`, `prune`, `pruneFolder`, `pruneRenamedFolders`, `materialize`, `removeBlockingFolder` | write a revision onto disk |
| E | `preflight`, `assertManagedDestination`, `assertRenamedFolders`, `assertRemovableFolder` | refuse unsafe obstructions before commit |
| F | `recover`, `select`, `observe`, `collect`, return | journal + lifecycle (stays) |

- **Splits** — the factory has no mutable `let`s, so groups lift cleanly. Because the file would pass ~470 with typed inputs, put them in siblings:
  1. NEW `store-scan.ts` — job: scan the working tree. `createTreeScanner({ paths, limits, manifest, object }: CreateTreeScannerInput): { observations, scan, readWorkingFile }` ← unit C (`scanFile` inner). Comments "Capture hashes only files…", "Read a published live file…" move.
  2. NEW `store-materialize.ts` — job: put a revision on disk. `createMaterializer({ paths, filesystem, checkpoint, manifest, object, observations, currentPath }: CreateMaterializerInput): { materialize, pruneFolder }` ← unit D (all inner functions, comments "Prune only directories…", "On case-insensitive volumes…", "Pre-read/verify every object…" move). If `removeBlockingFolder` is used by `preflight`, return it too.
  3. NEW `store-preflight.ts` — job: obstruction checks. `createPreflight({ paths, manifest, object, removeBlockingFolder? }: CreatePreflightInput): { preflight }` ← unit E with comments.
  4. HELPER in `store.ts`: `createObjectStager({ paths, limits, filesystem, checkpoint, manifestPath, manifest, objectPath, object }: CreateObjectStagerInput): { prepare }` ← unit B (same file; "Prepare every durable dependency…" comment).
  New files import `Manifest`, `ManifestFile`, `Current`, `Fingerprint` helpers from `./store.js` → CYCLE. Move first the shared pure pieces they need (`Manifest`, `ManifestFile`, `Fingerprint`, `fingerprint`, `sameFingerprint`, `removedFolders`, `inside`, `corrupt`, `missing`, `lstatIfPresent`, `statIfPresent`, `regularPath`, `readBounded`, `compareCodeUnits`) into NEW `store-fs.ts`; `store.ts` imports them and keeps `export type { Manifest, ManifestFile } from './store-fs.js'` ONLY if `store.ts` is reachable from the `./node` entry by name (check `src/node/index.ts`: if it does `export … from './store.js'`, update that barrel instead and drop the re-export).
- **Importers to update:** `rg -n "Manifest\b|ManifestFile" packages/vibecoding/src --glob '!**/store*.ts'`; `src/node/index.ts` barrel if it re-exports these.
- **After:** `createProjectStore` ~70; store.ts ~230; store-fs ~90; store-scan ~55; store-materialize ~75; store-preflight ~55.
- **Risks / notes:** security-sensitive (symlink/containment checks) — `store-symlink.security.test.ts` must stay green. Functions are hoisted declarations used before definition today; as factory results they must be created before use (create scanner → materializer → preflight → stager in that order). Recommend Opus execution.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/vibecoding/src/core/session.ts packages/vibecoding/src/node/store.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
