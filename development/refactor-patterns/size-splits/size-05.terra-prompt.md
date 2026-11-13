# Terra job size-05: split 3 Tovu file(s) by responsibility (size limits)

Generated 2026-11-13 by `development/refactor-patterns/size-splits/assemble.mjs` from the per-file design fragments. Self-contained: the rules, the per-file plans and the checks are all below.

Repo: the Tovu clone you are given (Tovu only). `TOVU` below = that clone's root.

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
### tovu:apps/admin/src/features/posts/Posts.tsx
- **Over:** `Posts` 132 (file 163, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-05
- **Tests:** `apps/admin/src/features/posts/__tests__/Posts.unit.test.tsx`, `posts-i18n.unit.test.ts`, `posts-agent-drive.unit.test.tsx` (same folder)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | the `columns={[ … ]}` array inside `<DataTable` (~L131-197, 5 column descriptors) | posts table columns (title/slug/status/updated/actions) |
| B | rest of `Posts` (hook call, locale, `t`, `sort` state, notice guard, header, `<DataTable` shell, `<ConfirmDialog`) | the screen (stays) |

- **Splits:**
  1. HELPER in `Posts.tsx` (module level, above `Posts`): `postsTableColumns({ t, locale, rowMenuHandleById, togglePostPublish, setPendingDelete }: PostsTableColumnsInput): DataTableColumn<AdminPost>[]` ← the array literal passed to `columns=` (all five descriptors, both "Sortable headers"/"desc" comments word for word). Import `type DataTableColumn` from `@jini-ai/admin/react` (same as `features/trash/Trash.tsx`). Type the inputs from the existing hook result: `t: ReturnType<typeof createPostsTranslator>`, `locale: string`, the other three as `ReturnType<typeof useWiredPosts>["rowMenuHandleById" | "togglePostPublish" | "setPendingDelete"]` (indexed one by one). In JSX: `columns={postsTableColumns({ t, locale, rowMenuHandleById, togglePostPublish, setPendingDelete })}`.
- **Importers to update:** none (no export moves).
- **After:** file ~170; `Posts` ~65; `postsTableColumns` ~72.
- **Risks / notes:** Pure move of a value expression; columns are rebuilt each render exactly as before. `sort` useState stays in the component (owner ruling 2026-08-14 comment explains it) — not touched by this split.

### tovu:apps/admin/src/features/providers/Providers.tsx
- **Over:** `Providers` 129 (file 165, under)
- **Phase:** now (STAY-PRODUCT; survey also notes `TabIcon` as a duplicate candidate — not part of this split) · **Batch:** size-05
- **Tests:** `apps/admin/src/features/providers/__tests__/Providers.unit.test.tsx`, `providers-i18n.unit.test.ts`, `apps/admin/src/features/providers/hooks/__tests__/use-providers.unit.test.ts` (smoke)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `const tabs: TabBarTab[] = [` (4 tab descriptors with `TabIcon` glyphs, ~L142-205) | the page's tab strip definition |
| B | rest of `Providers` (theme boundary, locale, hook, `activeTabId`, the `<I18nProvider>` markup and tab bodies) | the page (stays) |

- **Splits:**
  1. HELPER in `Providers.tsx` (module level, between `TabIcon` and `ProvidersProps`/`resolveProvidersHook`, i.e. above `Providers`): `providersTabs({ locale }: ProvidersTabsInput): TabBarTab[]` ← the array literal assigned to `tabs`, returned as is (all "Absorbed from `DeveloperApi.tsx`…" / "Soon" comments move word for word). `Providers` keeps `const tabs = providersTabs({ locale });`. `ProvidersTabsInput = { locale: string }` (match `useAdminLocale()`'s return type).
- **Importers to update:** none.
- **After:** file ~170; `Providers` ~78; `providersTabs` ~55.
- **Risks / notes:** `t` / `tIntegrations` are module imports, so the helper needs only `locale`. Long comments inside the JSX tab bodies stay put.

### tovu:apps/admin/src/features/publish-content/PublishContentDialog.tsx
- **Over:** `PublishContentDialog` 115 (file 287, under; `PublishContentReport` is exactly 100 — not over, leave it)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-05
- **Tests:** `apps/admin/src/features/publish-content/__tests__/PublishContentDialog.unit.test.tsx`, `publish-request.store.unit.test.ts` (same folder), `apps/admin/src/features/publish-content/hooks/__tests__/use-publish-content-confirm.hooks.unit.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | JSX `{view.peers.length > 1 && (` + `{view.peers.length === 1 && (` (~L120-150) | choose / show the target site |
| B | JSX `<span className="editor-actions">` (~L156-217) | Cancel + plan/confirm buttons |
| C | rest of `PublishContentDialog` (hook call, `<Dialog>` shell, intro paragraphs, `PublishContentNotices`, `PublishContentReport`) | the dialog (stays) |

- **Splits:** (sub-components follow this file's existing `PublishContentSectionProps` = `{ view, t }` pattern, as `PublishContentNotices`/`PublishContentReport` already do)
  1. SUB-COMPONENT `function PublishContentPeerPicker({ view, t }: PublishContentSectionProps)` (module level, below `PublishContentSectionProps`, above `PublishContentNotices`) ← the two peer blocks, wrapped in a fragment `<>…</>`; the `AgentElementRole` comment moves with it.
  2. SUB-COMPONENT `function PublishContentActions({ view, t }: PublishContentSectionProps)` (next to it) ← the whole `<span className="editor-actions">…</span>` with both comments (Cancel default-focus; "Two different buttons, keyed apart…") word for word; `key="start"` / `key="confirm"` stay on the buttons.
  3. `PublishContentDialog` renders `<PublishContentPeerPicker view={view} t={t} />` in place of A and `<PublishContentActions view={view} t={t} />` in place of B. `PublishContentSectionProps` must be declared above `PublishContentDialog`'s use only at type level — no reordering needed (interfaces hoist).
- **Importers to update:** none.
- **After:** file ~297; `PublishContentDialog` ~28; `PublishContentPeerPicker` ~32; `PublishContentActions` ~62.
- **Risks / notes:** the start/confirm button swap relies on `key` across sibling elements — both stay inside the same parent `<span>` in the new component, so remount semantics are unchanged.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/admin/src/features/posts/Posts.tsx apps/admin/src/features/providers/Providers.tsx apps/admin/src/features/publish-content/PublishContentDialog.tsx <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
