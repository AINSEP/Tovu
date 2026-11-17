# JM sheets: Jini admin's own domain code moves to its owners (1 + 5 pre-runs + 5 move runs). Read `COMMON-ADMIN.md` first.

Measured at Jini `96aade8c`: `packages/admin/src` is 27,253 source lines; 17,533 are domain code in 11 folders
(files and blobs: `jini-admin-domains.tsv`; Tovu import sites: `jini-admin-domains.tovu-sites.tsv`). No other Jini
package and no example imports these subpaths (`rg` printed none), so Tovu is the only caller.

| Folder | Source (files) | Tests (files) | Export-map entries | Tovu sites prod / test | Target | Sheet |
|---|---|---|---|---|---|---|
| forms | 4,547 (45) | 5,221 (35) | 5 | 5 / 5 | `packages/cms/src/forms/admin` | JM1 |
| seo | 3,042 (35) | 3,595 (18) | 5 | 3 / 6 | `packages/cms/src/seo/admin` | JM2 |
| redirects | 1,110 (23) | 2,164 (12) | 5 | 4 / 2 | `packages/cms/src/redirects/admin` | JM2 |
| media | 2,751 (40) | 3,944 (25) | 5 | 6 / 0 | `packages/cms/src/media/admin` | JM3 |
| widgets | 1,884 (30) | 5,662 (35) | 5 | 5 / 5 | `packages/cms/src/widgets/admin` | JM4 |
| comments | 1,757 (25) | 2,924 (17) | 5 | 5 / 4 | `packages/cms/src/comments/admin` | JM4 |
| agent-plugins | 907 (28) | 584 (10) | 5 | 2 / 0 | `packages/agent-plugins/src/admin` | JM5 |
| security | 746 (22) | 1,171 (11) | 5 | 0 / 0 | **stays in `packages/admin/src/security`** (owner 11-10: Tovu uses "Jini's admin/security"; moving it is D-5, optional, not planned: lesson 27) | - |
| consent | 329 (5) | 350 (4) | 1 | 5 / 2 | `packages/cookie-consent/src/admin` | JM5 |
| source-control | 327 (19) | 425 (7) | 5 | 0 / 0 | `packages/devops/src/source-control/admin` | JM5 |
| playground | 133 (17) | 129 (5) | 5 | 0 / 0 | stays in admin (dev tool; D-9) | - |

## What the folders import from admin itself (this decides the prerequisite)
Measured (script over the 11 folders, tests excluded):
| From | Names (uses) | After the move |
|---|---|---|
| `react/kit.js` | `useFetchQuery` 15, `Button` 13, `Notice` 13, `useInvalidate` 11, `useFetchMutation` 9, `TextField` 8, `Spinner` 8, `Dialog` 5, `useCachedLoader` 4, `ConfirmDialog` 4, `InfoTip` 3, `Select` 3, `Tabs` 3, `useDirtyGuard` 2, `Badge` 2, `IconButton` 2, `TabBar`, `TabBarTab`, `WidgetSelect`, `Menu`, `Lightbox`, `useSettlementGeneration` | each owner declares its own kit (`<owner>/src/<domain>/admin/react/kit.tsx`), the pattern of xpkg C9a/C9c; the host binds it in `apps/admin/src/integrations/jini-kits.ts` (edited by the run's Tovu commit) |
| `core/ports/<domain>.js` | forms 12, comments 15, redirects 13, seo 5 (the domain's own port types) | move with the domain: they are the owner's ports |
| `core/react/use-controller.js`, `core/react/bind-react.js` | `useController` 31, `bindReact` 10, `TabViewProps` 19, `ModulePageProps` 11 | J4 |
| `core/module/controller-store.js`, `core/module/*` | `createControllerStore` 27, `AdminConfigError` 11 | J4 |
| `core/transport/errors.js`, `query-suffix.js` | `describeApiError` 16, `AdminApiError` 8, `querySuffix` 3 | J4 |
| `react/components/*` | `DataTable` 6, `ConfirmDialog` 6, `RowMenu` 3 | kit slots (host binds admin's components) |
| `core/permissions/rules.js`, `core/omit-keys.js` | `hasPermission` 4, `omitKeys` 2 | `omitKeys` already exists at `@jini-ai/core` (`core/src/records.ts:25`, object-args form: adapt the 2 call sites, lesson 12); `hasPermission`: J4 |
| `contracts/*` | `mediaPickerToken` etc. (media-picker 6, credential-management 2, playground 5), `core/ports/shell.js` 2, `core/ports/auth.js` 1 | already token contracts; they move to `@jini-ai/core/contracts/` only if a second package needs them, else stay with the owner that declares them (J4 lists which) |
Outside admin the folders still import `@jini-ai/ui` (forms 11, comments 7, redirects 6, seo 5, …) and `@jini-ai/cms`
(forms 7, media 1, comments 1): xpkg **R1c, R2a, R2b** remove those. They are prerequisites of the matching JM sheet.

## Round-2 measurements the recipe now depends on (Jini `dde69a6d`)
| Folder | size-debt keys | hook-debt keys | `export *` lines in entry files | test files / of which import admin internals outside the folder | files > 500 |
|---|---|---|---|---|---|
| forms | 6 | 9 | 2 (`index.ts:6-7`) | 32 / 26 | - |
| seo | 2 | 25 | 2 | 14 / 6 | `react/pages/SeoPage.tsx` 838 |
| redirects | 1 | 1 | 4 | 10 / 10 | - |
| media | 5 | 12 | 0 | 25 / 12 | - |
| widgets | 4 | 8 | 1 | 19 / 18 | - |
| comments | 2 | 6 | 0 | 14 / 14 | - |
| agent-plugins | 0 | 7 | 8 | 10 / 4 | - |
| consent | 0 | 6 | 0 | 4 / 0 | - |
| source-control | 0 | 3 | 0 | 7 / 2 | - |
Commands: `rg -c "packages/admin/src/<f>/" scripts/size-debt.json scripts/hook-injection-debt.json`;
`rg -n "export \*" packages/admin/src/<f> -g '!**/__tests__/**'`;
`rg -l "from ['\"](\.\./)+(__tests__|core|react|contracts|testing)/" packages/admin/src/<f> -g '**/__tests__/**' | wc -l`.
Reverse edges (admin code outside the folder importing into it):
`for f in forms seo redirects media widgets comments agent-plugins consent source-control; do rg -n "from ['\"](\.\./)+$f/" packages/admin/src -g "!packages/admin/src/$f/**" -g '!**/__tests__/**'; done`
prints exactly one line: `core/ports/embed-policy.ts:7` imports `ParsedMediaHtmlAttributes` from `media/html-attributes.js`
(and `core/ports/index.ts:130` exports `EmbedPolicyPort`). JM3 handles it; any other line is a STOP for that folder.

## Exact specifier table (round-1 judge finding 16). Old key in `packages/admin/package.json` → new key
The owner's **existing** domain entries are not touched or replaced: `@jini-ai/cms/forms`, `/comments`, `/redirects`,
`/seo`, `/widgets` (universal domain APIs) and `/media` (node) keep their meaning. Admin screens get new keys
**under `<domain>/admin`**, the shape `@jini-ai/user-management` already publishes (`./admin`, `./admin/react`,
`./admin/adapters/http`, `./admin/adapters/memory`, `./admin/conformance`, `user-management/package.json:59-79`).
| Old specifier (`@jini-ai/admin/…`) | New specifier | Entry source file | `jini` runtime tag |
|---|---|---|---|
| `<d>` | `@jini-ai/cms/<d>/admin` | `packages/cms/src/<d>/admin/index.ts` | universal |
| `<d>/react` | `@jini-ai/cms/<d>/admin/react` | `packages/cms/src/<d>/admin/react/index.ts` | browser |
| `<d>/adapters/http` | `@jini-ai/cms/<d>/admin/adapters/http` | `…/admin/adapters/http.ts` | universal |
| `<d>/adapters/memory` | `@jini-ai/cms/<d>/admin/adapters/memory` | `…/admin/adapters/memory.ts` | universal |
| `<d>/conformance` | `@jini-ai/cms/<d>/admin/conformance` | `…/admin/conformance/index.ts` | universal |
for `<d>` in forms, seo, redirects, media, widgets, comments (30 keys). Then:
| `agent-plugins[/react, /adapters/http, /adapters/memory, /conformance]` | `@jini-ai/agent-plugins/admin[/…]` (5 keys; the existing `./admin-surfaces*` keys are a different surface: untouched) | `packages/agent-plugins/src/admin/…` | as above |
| `source-control[/…]` | `@jini-ai/devops/source-control/admin[/…]` (5 keys) | `packages/devops/src/source-control/admin/…` | as above |
| `consent/react` | `@jini-ai/cookie-consent/admin/react` (1 key) | `packages/cookie-consent/src/admin/react/index.ts` | browser |
The entry file path is taken from the old key's `import` target (`node -e "console.log(require('./packages/admin/package.json').exports['./<d>/react'])"`),
kept relative to the moved folder. The same naming holds for the S sheets: `@jini-ai/cms/taxonomy/admin/react`,
`…/trash/admin/react`, `…/navigation/admin/react`, `…/content-types/admin/react`, `@jini-ai/user-management/admin/react`
(INDEX column corrected). Entry files name their exports explicitly: the 17 `export *` lines above are replaced by
named exports in the pre-run, **in admin, before the move** (so the move commit is a pure move).
Browser proof for every `/react` key: COMMON-ADMIN section 2, export-map row (`npx vite build` of the admin, not a Node import).

## J4 (first; 150k): the module runtime the owners need, placed where they may import it
Decision D-1 (INDEX) picks the home. Recommended and assumed by JM1-5:
- pure pieces → `@jini-ai/core` beside `contracts/admin-module.ts`: `createControllerStore` (36 lines),
  `AdminConfigError`, `AdminApiError` + `describeApiError`, `querySuffix`, `hasPermission` + J1's panel rules.
- React pieces → `@jini-ai/ui-kit/react`: `useController` (31), `bindReact` + `ModulePageProps` + `TabViewProps` (68).
Search for existing owners first and report the diffs: `user-management/src/admin/controllers/controller-store.ts`
is a second `createControllerStore`; `ui/src/features/panel-kit/helpers/permissions.ts:9` a second `hasPermission`;
`core/src/records.ts:25` the `omitKeys` owner. A DEDUPE claim needs a behaviour diff and one real caller checked.
Steps, each green: (1) add the pieces to core / ui-kit with their tests moved (not copied); (2) repoint every admin
importer (`rg -ln "controller-store|use-controller|bind-react|transport/errors|query-suffix" packages/admin/src`);
(3) delete the admin originals (no re-export left); (4) repoint `user-management`'s local controller store to the
core one only if step-0's diff shows identical behaviour, else leave it and report.
J4 edits `packages/core/package.json` and `packages/ui-kit/package.json` (exports + `jini` runtime tags) and runs
`pnpm install` itself, in the commit that adds each piece (COMMON-ADMIN section 3). J4 runs alone on those two files.
Reconcile with J1: `isPanelAccessible` / `withoutInaccessiblePanels` move to core together with `hasPermission`
here; `@jini-ai/admin/core` keeps exporting them only if admin's own shell imports them from core and admin's
public entry already listed them (it does after J1: update that entry to import from `@jini-ai/core`, no shell file).
STOP: `describeApiError` reads admin transport types that would drag `core/transport` (359 lines) into core.

## JMn-pre (5 runs, Jini `packages/admin` only): make each folder movable **before** it moves
Why a separate run: debt is path-keyed (size) or file-listed (hooks), and the owner packages may not receive
debt (COMMON-ADMIN section 2, last row). So the debt is paid where the code and its tests are today.
| Run | Folders | Work | Estimate |
|---|---|---|---|
| JM1-pre | forms | 9 hook keys → props; 6 size keys; 2 `export *`; classify 32 test files | 180k |
| JM2-pre | seo, redirects | split `SeoPage.tsx` (below); 26 hook keys; 3 size keys; 6 `export *`; classify 24 test files | 240k |
| JM3-pre | media | 12 hook keys; 5 size keys; classify 25 test files; embed-policy decision below | 170k |
| JM4-pre | widgets, comments | 14 hook keys; 6 size keys; 1 `export *`; classify 33 test files | 200k |
| JM5-pre | agent-plugins, consent, source-control | 16 hook keys; 8 `export *`; classify 21 test files | 130k |
Steps (each a green commit in `packages/admin`; `pnpm guard`, build and the package tests after each):
1. Hooks: every key whose `files` include the folder → the hook becomes a prop defaulted to the real hook, with
   one fake-hook output test per component (COMMON-ADMIN section 1). `--update` afterwards only deletes keys.
2. Size: each size-debt key of the folder is retired by splitting along the dependency graph (one refactor type
   per commit). If a function needs a judgment the sheet does not give: STOP for that key, report the span.
3. Barrels: replace each `export *` with explicit names (`tsc` lists them: build, then read the entry's `.d.ts`).
   Test: the package's public-surface test (`rg -l "public surface|publicSurface" packages/admin/src`) still
   lists the same names; if none covers the entry, add one that pins the sorted export names **before** the edit.
4. Test classification, written as a table in the report (one row per test file):
   | Class | Rule | What happens to it in the move run |
   |---|---|---|
   | OWNER-UNIT | imports only the folder itself and test libraries | moves with the folder |
   | OWNER-UNIT-REWRITE | imports admin internals only for kit/test support (`__tests__/fetch-query-support`, `react/kit`, `use-controller`, `bind-react`, contracts tokens) | rewritten **in this pre-run** onto the folder's own kit fake and J4's core/ui-kit pieces, proven green in admin, then moves |
   | ADMIN-COMPOSITION | its subject is admin composition (`createAdmin`, `OverlayHost`, `createOverlayController`, shell) and the domain module is only the example | stays in `packages/admin`, with the domain module replaced by a fixture module declared in the test (`defineAdminModule` from `@jini-ai/core`), in this pre-run |
   | INTEGRATION | needs the real domain module **and** real admin composition together (example: `media/react/__tests__/media.test.tsx:3-18`) | cannot live in either package after the move (cross-package implementation test). Goes to the integration test package that xpkg **G-TESTS** creates. **If any file is in this class, G-TESTS's "integration home exists" step is a prerequisite of the move run; the pre-run reports the list and the move run does not start before it.** |
   Ownership against xpkg G-TESTS: the JM pre-runs own the classification of tests **inside the nine folders**;
   G-TESTS owns every other admin test and the creation of the integration package. Tell G-TESTS's runner to skip
   `packages/admin/src/{forms,seo,redirects,media,widgets,comments,agent-plugins,consent,source-control}`.
   Case ledger (replaces round 1's "owner count equals baseline"): count cases with
   `rg -c "^\s*(it|test)(\.each(\([^)]*\))?)?\(" <files>` and report `baseline = owner + admin-kept + integration`
   per folder. Any missing case is named with its new location or the run is not done.

**JM2-pre: the `SeoPage.tsx` split** (838 lines; file and function keys at `scripts/size-debt.json:108-119`).
State ownership does not move: the tabs already receive `controller: SeoTabController`, the entry panel already
takes its hooks as props. Partition by the declarations in the file (line numbers at `dde69a6d`):
| New file (under `seo/react/`) | Declarations (lines) |
|---|---|
| `components/SeoSection.tsx` | `SeoSection` 108-136 |
| `components/EntryPicker.tsx` | `EntryPicker` 137-163 (keeps `useEntryPickerHook` prop) |
| `components/AnalyzePanel.tsx` | `issueStatusClass` 164-171, `AnalyzePanel` 172-235 |
| `components/SeoEntryFields.tsx` | `SeoEntrySearchFields` 315-376, `SeoEntrySocialFields` 377-424, `SeoEntryXFields` 425-483 |
| `components/SeoEntryPanel.tsx` | `SeoEntryPanel` 236-273, `SeoEntryHead` 274-314, exported `SeoEntrySection` 484-524 |
| `tabs/SeoDefaultsTab.tsx` | exported `SeoDefaultsTab` 525-682 (158 lines: one sub-component per `<SeoSection>` block it renders, each receiving `controller`; no new state) |
| `tabs/SeoSitemapTab.tsx` | exported `SeoSitemapTab` 683-744 (62 lines: extract its list/row markup the same way) |
| `pages/SeoPage.tsx` (stays) | imports, `Seo` 745-827, `seoTabPanel` 828-838, the wired-hook defaults from 1-107 that `Seo` uses |
One commit per row (extract, then repoint every importer: `rg -n "pages/SeoPage" packages/admin/src`); the three
exported names are imported from their new files by every caller, no re-export left in `SeoPage.tsx`. Types and
wired hooks in lines 1-107 move with their single user; one used by two files goes to `seo/react/types.ts`.
Why-comments by content (COMMON-ADMIN). Done when both `SeoPage.tsx` keys are gone from `scripts/size-debt.json`
and no new key exists. STOP: after one-component-per-section a function is still over 50 lines or complexity 10.

## JM1-JM5: the move recipe (one run each; estimates: JM1 200k, JM2 190k, JM3 190k, JM4 220k, JM5 150k)
Prerequisites: J4; the folder's pre-run (debt keys 0, no `export *`, classification table, INTEGRATION list
empty or G-TESTS's integration home present); R1c; JM1 also R2a; JM3 and JM4 also R2b; JM5 also R2b (agent-plugins
types). **Serial, in order JM1 → JM5**: every run edits `packages/admin/package.json`, JM1-4 edit
`packages/cms/package.json`, and every Tovu half edits `integrations/jini-admin/modules.hooks.ts` and `jini-kits.ts`
(COMMON-ADMIN section 3). The run makes those edits itself, in the commit that needs them.
Per folder:
1. Guard: every row of `jini-admin-domains.tsv` for the folder matches `git rev-parse --short=10 HEAD:<path>`
   **except** the files the pre-run changed (the pre-run report lists them; any other mismatch is a STOP), and the
   reverse-edge command above prints nothing for the folder.
2. Baseline: `npm --prefix packages/admin run test -- <folder>`; record cases per class from the pre-run table.
3. Jini commit A (green alone; one commit because a half-moved folder does not build): `git mv packages/admin/src/<folder> <target>`;
   move `core/ports/<folder>.ts` with it and delete its line from `core/ports/index.ts`; rewrite the folder's
   imports per the table above; add the owner's export-map keys and `jini` runtime tags from the specifier table and
   **remove** the old admin keys, both `package.json` files in this commit; `pnpm install`; build both packages;
   add the owner kit file and its fake; run the moved tests in the owner package and the kept tests in admin.
   Case ledger balances. Class names in the moved React files become `jini-<domain>-*`; write the old → new list
   into the report for the Tovu half. Checks: specifier-table rows all resolve (COMMON-ADMIN section 2);
   `rg -n "@jini-ai/admin" <target>` prints nothing; the by-file hook check prints CLEAN for `<target>`.
4. Tovu commit B (green alone, linked to commit A): repoint every row of `jini-admin-domains.tovu-sites.tsv` for
   the folder with the specifier table, bind the owner kit in `integrations/jini-kits.ts` and the module in
   `modules.hooks.ts` (this run edits both), rename the selectors in host CSS, keep `features/<folder>/*-i18n.ts`
   and its parity test passing against the owner's `messages.en`. `(cd apps/admin && npx vite build)` succeeds.
5. Chrome check of that screen (COMMON-ADMIN 4).
Between commit A and commit B Tovu stays linked to the Jini commit before A; nothing is published in between.
Folder notes:
- **forms**: `field-settings.ts` (445) computes four module-level values from the catalog at import time; R2a
  turns them into functions. Do not start JM1 until R2a's report says all six steps landed.
- **media (round-1 judge blocker 4)**: `core/ports/embed-policy.ts` stays behind in admin and imports
  `ParsedMediaHtmlAttributes` from the folder that leaves. Facts: `EmbedPolicyPort` has **no importer** in any Jini
  package or in Tovu `apps/` (`rg -ln "EmbedPolicyPort|embedPolicy" packages` → only the port file and
  `core/ports/index.ts`); the owner package already declares the same type name at
  `packages/cms/src/media/html-attributes.ts:98` (admin's copy: `packages/admin/src/media/html-attributes.ts:44`).
  In JM3 commit A, same commit as the move: (a) `git mv packages/admin/src/core/ports/embed-policy.ts packages/cms/src/media/admin/ports/embed-policy.ts`
  (its owner is media: it describes what a media embed may carry); (b) delete `core/ports/index.ts:130`;
  (c) its import becomes the folder-local `../html-attributes.js`; (d) export `EmbedPolicyPort` by name from
  `@jini-ai/cms/media/admin`; (e) the admin public-surface test loses that one name, stated in the changeset as a
  removed export. In JM3-pre, first: diff the two `ParsedMediaHtmlAttributes` declarations and the two
  `html-attributes.ts` files. Identical shape → after the move the admin copy's type is deleted and imported from
  `../../html-attributes.js` (same package, allowed). Different → keep both, report the diff; do not merge
  behaviour in a move. Re-run the importer census on the day; a new importer of `EmbedPolicyPort` is repointed in
  commit A (Jini) or commit B (Tovu).
  Tovu keeps its own media screen (`features/media`, 4,166 lines) and uses Jini's only through
  `integrations/jini-admin/media-ports.ts` (170) and `media-panel.ts` (19), which parks the swap. JM3 moves the Jini
  code only; it must not mount Jini's screen in Tovu. S-MEDIA decides the swap.
- **security**: not moved (table above). S-SECURITY grows it where it is; its 4 hook keys and 3 `export *` lines
  are retired in S-SECURITY run b's first commit.
- **consent** has one export-map entry (`./consent/react`) and no module file: read it before choosing the shape.
- **playground** stays; after JM1-5, `rg -n "@jini-ai/(cms|agent-plugins|ui)['\"/]" packages/admin/src -g '!**/__tests__/**'`
  must print nothing and admin's manifest drops those three dependencies (G-STALE-DEPS covers the stale peers).
STOP
- A moved file needs a kit name that is not in the kit list above: report the name; adding it is allowed only as
  one more slot in the owner's kit interface plus one binding line in `jini-kits.ts`, with a fake.
- The owner package cannot import what the folder needs without breaking the import rule (report the edge).
- The case ledger does not balance, or a test would have to import another package's source to keep passing.
- The reverse-edge command prints a line the sheet does not name.
