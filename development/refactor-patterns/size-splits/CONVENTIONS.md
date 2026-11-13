# Size splits — rules every split follows

Owner decision 2026-11-13 (final; replaces the 100-line limit). Binding for every `size-NN` job and every
hard-file plan. Inlined into each Terra prompt, so a job needs nothing else.

## Limits and how lines are counted
- Function (incl. React component, hook, method, arrow): at most **50** counted lines. File: at most **500**.
  Counted = non-blank after comments are removed (ESLint `max-lines-per-function` / `max-lines` with
  `skipBlankLines` + `skipComments`). A nested function counts on its own AND inside its parent.
- Every function you create or change also stays at **cyclomatic ≤ 10 and cognitive ≤ 10**
  (`apps/admin/**` in Tovu: **9 / 9**). A split that leaves a helper at 11 is not done.
- Outline tool (read-only; TypeScript from `<root>/node_modules`):
  `node <TOVU>/development/refactor-patterns/size-splits/outline.mjs --root <repo with node_modules> <file>` prints
  each top-level declaration (range, counted lines, same-file names it uses) and, for each function over 50,
  its statements with `decl:` (locals created) and `uses:` (earlier locals/params read). `--check <files…>`
  prints only what is still over and exits 1 if anything is. Default limits are 50 / 500.
- Exempt (never split): everything in `development/scripts/size-exceptions.json` (locale `*-i18n.ts(x)`,
  `i18n-common.ts`, `*.generated.*`, `migration(s)/`, listed entries). `composition/deps.ts` and
  `composition/app.ts` are NOT exempt.

## What a split is
1. **By responsibility, never by line count.** Each new function/module does one job you can name in a few
   words, and its name says it. Banned: mechanical chunks (`part1`/`rest`/`step2`, "first half"), pass-through
   helpers whose body only forwards their inputs to one call, and helpers that take a grab-bag of 7+ unrelated
   inputs (a sign the cut is in the wrong place). If a piece has no nameable job, it stays.
2. **Long function → helpers in the SAME file**, at module level directly above the function, in run order.
   Only when the file then passes 500 do helpers move to a sibling module (as the plan says).
3. **Long file → sibling modules** in the same folder named `<original-stem>-<job>.ts(x)` (or the plan's name).
   The original keeps its name and main job and imports what moved. No new folder unless the plan says so.
4. **Imports follow the move.** Every importer of a moved export imports it from its new module (find them:
   `rg -n "from ['\"].*<old-stem>(\.js)?['\"]"`, tests included). No re-export from the old file — except a
   package entry (a `package.json` `exports` target, or the `index.ts` that is one): it keeps
   `export { x } from "./new.js"` so the public API is unchanged.
5. **No import cycles.** A new module never imports the file it came from; shared types move into the new
   module (or a `<stem>-types.ts` sibling when the plan says so).
6. **Behaviour does not change.** Same statements, order, awaits, error text, exports. Only what crosses a new
   boundary changes (locals become inputs / return values). Do not "improve" moved code.
7. **"Why" comments move with their code**, word for word (incl. the file-header paragraph explaining a moved
   part; copy it into the new file's header).
8. **Arguments: always `(required, optional = {})`** for every new function, helper, factory, builder and
   sub-hook — even when there are no optional inputs (`_options: Record<string, never> = {}`) and even when
   there are no required inputs (`_required: Record<string, never>` first). Name types `<Name>Input` /
   `<Name>Options` unless the plan names them. No positional primitive parameters. Never delete or narrow an
   existing options object. Plans often show only the first object in a signature — add the second anyway.
   React components keep their single `props` object.
9. **Banned:** `eslint-disable` (any form), `as any`, `as unknown as`, non-null `!`, `@ts-ignore`,
   `@ts-expect-error`. Export the existing type instead of loosening one. A pre-existing suppression on a
   moved line moves with it unchanged; never add one.
10. **Tests are not edited**, except (a) an import path of a moved symbol, (b) a `vi.mock` / `mock.module` path
    that must follow a moved symbol (check `rg -n "vi\.mock\(|mock\.module\(|jest\.mock\(" <test dirs>` before
    moving an export). Say so in the report. A test that reads source text by name (anchors, `functionBody(…)`)
    pins that name in its file: keep it there.

## How to split each kind
- **Plain functions / services:** extract named steps (validate, load, decide, write, map errors). Decision
  logic and effects split apart (a pure helper returns a decision; the caller performs the effect).
- **Route registrars (`register…Routes`):** shared closures (auth gate, error mapper) and long handler bodies
  become module-level helpers taking `{ req, res, deps, … }`; groups of routes with one job become
  `register<Group>Routes({ app, deps, … }, {})`. Paths and registration ORDER stay byte for byte (call the
  group registrars in the old order).
- **React components:** the component renders; regions become **subcomponents with their own props type**
  (same file, or `<Component>-<region>.tsx` when the file passes 500). Never define a component inside
  another; a subcomponent receives plain values + callbacks, never the whole hook result; state stays where it
  is (a subcomponent may not take over state the parent owned — that changes remount behaviour); keys, element
  order and conditional rendering stay identical. Data/state/effects live in `<Component>.hooks.ts` (or the
  hooks file the plan names). Plain render helpers (no hooks) are fine for small repeated fragments.
- **Hooks:** compose smaller hooks `useXxx(required, optional = {})` that each own one concern (its state +
  effects), called in the SAME position so the overall hook call order is unchanged; or move pure logic into
  module-level helpers. Effect dependency semantics stay identical: copy deps arrays exactly; never put a
  freshly built object/array returned by a sub-hook into a deps array (destructure it; pass the same values);
  `useCallback`/`useMemo` keep the same deps; refs are passed as ref objects, never `.current`.
- **Factories / composition roots:** per-feature builders `build<Feature>({ settled inputs }, {})` whose inputs
  are values already constructed in the root; construction and side-effect order unchanged; late-bound values
  reach a builder as a thunk created in the root (`routeDeps: () => routeDeps`). A builder never reads or writes
  the root's mutable `let`s directly — if the split needs that, it is HARD (below).
- **Classes:** a long method becomes module-level helpers (explicit inputs, no `this`) or private methods;
  `this` binding and public surface unchanged.

## Not yours to split — report instead
- **Exception candidates** (the owner decides; you never grant one, never edit `size-exceptions.json`): literal
  data tables / maps, registration lists (one entry per line), scripts serialized into a browser
  (`fn.toString()`, `page.evaluate`, template-string scripts), a component/hook whose only remaining over-50
  part is one indivisible JSX tree or one effect. Leave it, and report
  `EXCEPTION-CANDIDATE <file> <function> <lines> — <one-line reason>`.
- **HARD** (needs judgment; goes to the Opus/Fable lane): the cut must share ≥2 mutable `let`s written by
  nested functions, reorder effects or module init (top-level side effects, ES import evaluation order), or
  the only cut creates an import cycle. Revert that file (`git restore -- <its paths>`, delete its new files)
  and report `HARD <file> <function> — <reason>`. Never improvise around it.

## Checks (no suites, nothing left running)
- **Baseline first**, per file, before editing: its tests (below) and the gate command on the file; save the
  gate output.
- **Gate command** (repo root; Tovu `apps/admin/**`: 9 for both complexity rules):
  `npx eslint --no-warn-ignored --rule 'complexity: [error, 10]' --rule 'sonarjs/cognitive-complexity: [error, 10]' --rule 'max-lines-per-function: [error, {max: 50, skipBlankLines: true, skipComments: true}]' --rule 'max-lines: [error, {max: 500, skipBlankLines: true, skipComments: true}]' <original file> <new files>`
  After the split: **zero errors** on every function you created or changed and on the planned items. An error
  left on a function you did not touch must already be in the baseline output — list it as existing debt in
  the report (no suppression). Also `outline.mjs --check <original> <new files>` → OK.
- Tests: ONLY the file's tests (the plan's list, completed with
  `rg -l "<file stem>" <app or package dir> --glob '*.test.*'`), one at a time, same pass count as baseline:
  - Tovu `apps/website`, `packages/*`, `content/*`, `apps/site-chat`:
    `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <test file>`
  - Tovu `apps/admin`: `cd apps/admin && npx vitest run <path relative to apps/admin> --maxWorkers=2`
  - Tovu `apps/desktop` main (`src/` outside `renderer/`, `contracts/`):
    `cd apps/desktop && node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=1 <file>`
  - Tovu `apps/desktop` renderer/contracts: `cd apps/desktop && node --import ./scripts/one-react.ts --import tsx --test --test-concurrency=1 <file>`
  - Jini: `pnpm --filter <package> exec vitest run <path relative to the package> --maxWorkers=2`, then
    `pnpm --filter <package> run typecheck` once per touched package.
- Tovu: no full `tsc`. No watch modes, dev servers or suites; kill nothing you did not start.

## Commit and report
- One commit per file (or per coupled pair the plan names), explicit paths only:
  `git add -- <paths> && git commit -F msg -- <paths>`; subject `refactor(<area>): split <file> by responsibility (size)`;
  body = the file's responsibility map (unit → job → where it went). Never push, `git add -A`, stash or checkout.
- A step that cannot be done as written (missing anchor, cycle, test fails because of the split): stop that
  file, revert only its uncommitted changes, report it.
- Report per file: `OK` / `STOPPED (reason)` / `HARD (reason)` / `EXCEPTION-CANDIDATE (reason)`, new files,
  before → after counted lines, tests with pass counts, gate result (+ existing-debt lines), moved mock paths.
