# Terra job size-51: split 3 Tovu file(s) by responsibility (size limits)

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
### tovu:apps/admin/src/features/security/AccessTokensTab.tsx
- **Over:** file 847 lines · `AddCustomCredentialDialog` 119 · `TokenInputFields` 114
- **Phase:** after-move (DELETE-AFTER-PARITY) · **Batch:** size-51
- **Tests:** `apps/admin/src/features/security/__tests__/AccessTokensTab.unit.test.tsx`, `apps/admin/src/features/security/__tests__/AccessTokensTab.credential-flows.unit.test.tsx`, `apps/admin/src/features/security/__tests__/access-tokens-revoke-copy.unit.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `AccessTokensTabProps`, `acceptsAnotherToken`, `resolve*Hook`, `SHOW_COPY_KEYS_ENTRY`, `AccessTokensTab`, `AccessTokensBody`, `HostingPluginsHint`, `AccessTokensCategoryFilter`, `AccessTokensSearch`, `ProviderGroup`, `AddAnotherButton`, `NotConnectedRow`, `TokenRow`, `CustomKeyUsage`, `TokenRowDefaultIndicator`, `RemoveConfirmDialog` | tab, list, rows (stays) |
| B | `REMOVE_FROM_TOVU`, `TokenInputFields`, `ExtraFieldInputs`, `ExtraFieldInput`, `WorksForField`, `ExistingTokenFields`, `SharedKeyReplaceNote`, `AddTokenForm` | token entry/replace fields |
| C | `RequiredFieldMarker`, `AdditionalHostsField`, `CustomKeyStorageChoice`, `AddCustomCredentialDialog` | "Add custom provider" dialog |

- **Splits:**
  1. NEW `AccessTokensTab-token-fields.tsx` — Moves unit B (with the "Remove from Tovu, never Revoke" comment on `REMOVE_FROM_TOVU`). Exports `REMOVE_FROM_TOVU`, `WorksForField`, `ExistingTokenFields`, `AddTokenForm`. In it, SUB-COMPONENT `TokenSecretField({ idPrefix, translate, info, token, onTokenChange, connected }): ReactNode` above `TokenInputFields` ← the second `<div className="field">` (the token input, ~50 lines).
  2. NEW `AccessTokensTab-custom-credential.tsx` — Moves unit C; imports `WorksForField` from step 1. Exports `AddCustomCredentialDialog`. In it, SUB-COMPONENT `CustomCredentialFields({ form, controller, translate, baseUrlInvalid }): ReactNode` above the dialog ← the five `<div className="field">` blocks (Name … storage choice), with the `RequiredFieldMarker` / hosts comments. `controller` is the dialog's own prop (not the hook result).
- **Importers to update:** none outside the file (moved names were private); `AccessTokensTab.tsx` imports `REMOVE_FROM_TOVU`, `ExistingTokenFields`, `AddTokenForm`, `AddCustomCredentialDialog`.
- **After:** `AccessTokensTab.tsx` ~395; `TokenInputFields` ~65; `AddCustomCredentialDialog` ~50; new files ~300 / ~165.
- **Risks / notes:** `AddCustomCredentialDialog` is a `forwardRef` const — keep it a `forwardRef` with the same display name; `useAddCustomCredentialDialog` import moves with it. DELETE-AFTER-PARITY.

### tovu:apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts
- **Over:** file 584 lines · `useAccessTokens` 336
- **Phase:** after-move (DELETE-AFTER-PARITY · CORE-CON…) · **Batch:** size-51
- **Tests:** `apps/admin/src/features/security/hooks/__tests__/use-access-tokens.unit.test.tsx`, `apps/admin/src/features/security/__tests__/AccessTokensTab.hooks.unit.test.tsx`, `apps/admin/src/features/security/__tests__/AccessTokensTab.credential-flows.unit.test.tsx`, `apps/admin/src/features/security/__tests__/AccessTokensTab.unit.test.tsx`, `apps/admin/src/features/security/__tests__/access-tokens-revoke-copy.unit.test.tsx`, `apps/admin/src/features/security/__tests__/Security.unit.test.tsx`, `apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts`
- **Responsibility map:** A model: types + pure helpers (`UNKNOWN_ERROR` … `writeCredential`, `mergeRaw`, exported `AccessToken*State`, `AccessTokensController`) · B `useAccessTokens` stores (queries, seeded state, reload, `rows`) · C existing-row edits · D row actions (remove/default/custom-key use) · E add forms · F custom-provider form · G grouping + controller (stays).
- **Splits:**
  1. NEW `hooks/use-access-tokens-model.ts` — job: Access Tokens controller types + pure draft/error helpers. Moves unit A with the `@file` paragraph about drafts. Exports all moved types and the helpers `useAccessTokens` needs.
  2. SUB-HOOKS in `use-access-tokens.hooks.ts` above `useAccessTokens`:
     - `useAccessTokenStores({ port, t, locale }): AccessTokenStores` ← `const publishQuery = useFetchQuery(` through `const rows = useMemo<AccessTokenRow[] | undefined>(`, plus `mergeCredential` and `refetchStore` (store-level). Returns `providers, worksForOptions, setPublishCredentials, setSourceControlCredentials, setCustomCredentials, customQuery, reloadAllStores, loadError, rows, mergeCredential, refetchStore`.
     - `useExistingTokenEdits({ port, t, locale, rows, providers, mergeCredential, setCustomCredentials }): ExistingTokenEdits` ← `existingDrafts`, `existingBusy` states, `setExistingField`, `replaceCustomCredential`, `replaceToken`.
     - `useTokenRowActions({ port, t, locale, setExistingBusy, setCustomCredentials, setPublishCredentials, setSourceControlCredentials, refetchStore, reloadAllStores }): TokenRowActions` ← `customKeyBusy`, `customKeyPending`, `setCustomKeyUse`, `removeToken`, `applyPromotedDefault`, `reconcileStore`, `makeDefault`.
     - `useAddTokenForms({ port, t, locale, providers, rows, worksForOptions, mergeCredential }): AddTokenForms` ← `addForms`, `openAddForm`, `closeAddForm`, `setAddField`, `createToken`.
     - `useCustomAddForm({ port, t, locale, rows, category, customQuery, worksForOptions, setCustomCredentials }): CustomAddForm` ← `customAddDraft`, `customAddBusy`, `setCustomAddField`, `resetCustomAddForm`, `createCustomCredential`.
     `useAccessTokens` keeps `query`/`category` state, the sub-hook calls, `customGroups`, `groups`, `totalCount`, `matchCount`, and `return {`.
- **Importers to update** (moved exported types): `features/security/AccessTokensTab.tsx`, `features/security/AccessTokensTab.hooks.tsx`, `features/security/hooks/use-other-credentials.hooks.ts`, `features/security/rules.ts` (check: may be comment-only), tests `hooks/__tests__/use-access-tokens.unit.test.tsx`, `__tests__/access-tokens-revoke-copy.unit.test.tsx`, `__tests__/AccessTokensTab.hooks.unit.test.tsx`, `__tests__/AccessTokensTab.credential-flows.unit.test.tsx`, `__tests__/AccessTokensTab.unit.test.tsx`, `__tests__/Security.unit.test.tsx`.
- **After:** original ~430; `useAccessTokens` ~65; sub-hooks ~85 / ~70 / ~60 / ~45 / ~40; model ~190.
- **Risks / notes:** `settlement` (`useSettlementGeneration`) belongs to the stores hook; `reloadAllStores` identity must stay `useCallback`-stable (content-refresh subscription). Hook call order changes between groups only (stable across renders). Busy state `setExistingBusy` is shared by edits and row actions — owned by `useExistingTokenEdits`, passed to `useTokenRowActions`. DELETE-AFTER-PARITY; consider Opus (many shared setters).

### tovu:apps/admin/src/features/security/rules.ts
- **Over:** file 516 lines (no function over 100)
- **Phase:** after-move (MIXED — credential-row and form rules) · **Batch:** size-51
- **Tests:** `apps/admin/src/features/security/__tests__/rules.unit.test.ts`, `apps/admin/src/features/security/__tests__/OtherCredentialsSection.unit.test.tsx`, `apps/admin/src/features/security/hooks/__tests__/use-other-credentials.unit.test.tsx`, `apps/admin/src/features/security/__tests__/AccessTokensTab.hooks.unit.test.tsx`, `apps/admin/src/features/security/__tests__/AccessTokensTab.credential-flows.unit.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `ACCESS_TOKENS_RESOURCE` … `accessTokenExistingRowReadyToSave`, `buildCustomProviderConnectionInput`, `buildCustomCredentialUpdatePatch`, `buildAdditionalHostsInput`, `accessTokensCountText` | Access Tokens (Tier-1) rows, providers, form gates (stays) |
| B | `OtherCredentialStoreId`, `OtherCredentialStoreInfo`, `OTHER_CREDENTIAL_STORES`, `otherCredentialStoreInfo`, `otherCredentialMatchesQuery`, `mediaProviderLabel`, `maskedTailFact`, `envNamesFact` | Tier-2 "other credential" store registry + value facts |

- **Splits:**
  1. NEW `apps/admin/src/features/security/rules-types.ts` — job: the category id types both rule modules share. Moves `AccessTokenCategoryId` and `AccessTokenRowCategoryId` (with their comments). `rules.ts` imports them (type-only).
  2. NEW `apps/admin/src/features/security/rules-other-credentials.ts` — job: Tier-2 credential store registry and its display facts. Moves unit B verbatim with every doc comment (the OTHER_CREDENTIAL_STORES ordering rationale). Imports the category type from `./rules-types` (never from `./rules`). Exports all 8 names.
- **Importers to update:** unit B names → `features/security/hooks/use-other-credentials.hooks.ts`, `features/security/hooks/other-credentials-port.hooks.ts`, `features/security/OtherCredentialsSection.tsx`, `features/security/Security.tsx`, `features/security/AccessTokensTab.tsx`, `features/security/AccessTokensTab.hooks.tsx`, `features/security/security-i18n.ts` (may be comment-only), tests `__tests__/rules.unit.test.ts`, `__tests__/OtherCredentialsSection.unit.test.tsx`, `__tests__/AccessTokensTab.hooks.unit.test.tsx`, `__tests__/AccessTokensTab.credential-flows.unit.test.tsx`, `hooks/__tests__/use-other-credentials.unit.test.tsx`. Category types → `apps/admin/src/lib/api.ts` (check: comment or import), `features/security/hooks/use-access-tokens.hooks.ts`, `features/security/hooks/use-other-credentials.hooks.ts`, `features/security/AccessTokensTab.tsx`, `features/security/__tests__/rules.unit.test.ts`.
- **After:** `rules.ts` ~445; new files ~70 / ~10.
- **Risks / notes:** if `lib/api.ts` truly imports `AccessTokenRowCategoryId` from `features/security/rules`, repoint it to `rules-types` (lib→feature import already existed). No `vi.mock` of `rules` found. Only 16 lines over: if the owner prefers fewer files, the coordinator may mark this an exception instead.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/admin/src/features/security/AccessTokensTab.tsx apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts apps/admin/src/features/security/rules.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
