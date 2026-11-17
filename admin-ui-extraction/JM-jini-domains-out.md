# JM sheets: Jini admin's own domain code moves to its owners (1 + 5 runs). Read `COMMON-ADMIN.md` first.

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
| security | 746 (22) | 1,171 (11) | 5 | 0 / 0 | `packages/user-management/src/admin/security` (D-5) | JM5 |
| consent | 329 (5) | 350 (4) | 1 | 5 / 2 | `packages/cookie-consent/src/admin` | JM5 |
| source-control | 327 (19) | 425 (7) | 5 | 0 / 0 | `packages/devops/src/source-control/admin` | JM5 |
| playground | 133 (17) | 129 (5) | 5 | 0 / 0 | stays in admin (dev tool; D-9) | - |

## What the folders import from admin itself (this decides the prerequisite)
Measured (script over the 11 folders, tests excluded):
| From | Names (uses) | After the move |
|---|---|---|
| `react/kit.js` | `useFetchQuery` 15, `Button` 13, `Notice` 13, `useInvalidate` 11, `useFetchMutation` 9, `TextField` 8, `Spinner` 8, `Dialog` 5, `useCachedLoader` 4, `ConfirmDialog` 4, `InfoTip` 3, `Select` 3, `Tabs` 3, `useDirtyGuard` 2, `Badge` 2, `IconButton` 2, `TabBar`, `TabBarTab`, `WidgetSelect`, `Menu`, `Lightbox`, `useSettlementGeneration` | each owner declares its own kit (`<owner>/src/<domain>/admin/react/kit.tsx`), the pattern of xpkg C9a/C9c; the host binds it in `apps/admin/src/integrations/jini-kits.ts` (coordinator) |
| `core/ports/<domain>.js` | forms 12, comments 15, redirects 13, seo 5 (the domain's own port types) | move with the domain: they are the owner's ports |
| `core/react/use-controller.js`, `core/react/bind-react.js` | `useController` 31, `bindReact` 10, `TabViewProps` 19, `ModulePageProps` 11 | J4 |
| `core/module/controller-store.js`, `core/module/*` | `createControllerStore` 27, `AdminConfigError` 11 | J4 |
| `core/transport/errors.js`, `query-suffix.js` | `describeApiError` 16, `AdminApiError` 8, `querySuffix` 3 | J4 |
| `react/components/*` | `DataTable` 6, `ConfirmDialog` 6, `RowMenu` 3 | kit slots (host binds admin's components) |
| `core/permissions/rules.js`, `core/omit-keys.js` | `hasPermission` 4, `omitKeys` 2 | `omitKeys` already exists at `@jini-ai/core` (`core/src/records.ts:25`, object-args form: adapt the 2 call sites, lesson 12); `hasPermission`: J4 |
| `contracts/*` | `mediaPickerToken` etc. (media-picker 6, credential-management 2, playground 5), `core/ports/shell.js` 2, `core/ports/auth.js` 1 | already token contracts; they move to `@jini-ai/core/contracts/` only if a second package needs them, else stay with the owner that declares them (J4 lists which) |
Outside admin the folders still import `@jini-ai/ui` (forms 11, comments 7, redirects 6, seo 5, …) and `@jini-ai/cms`
(forms 7, media 1, comments 1): xpkg **R1c, R2a, R2b** remove those. They are prerequisites of the matching JM sheet.

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
Coordinator lines: `packages/core/package.json` exports, `packages/ui-kit/package.json` exports.
STOP: `describeApiError` reads admin transport types that would drag `core/transport` (359 lines) into core.

## JM1-JM5: the move recipe (one run each; estimates: JM1 220k, JM2 200k, JM3 190k, JM4 240k, JM5 180k)
Prerequisites: J4; R1c; JM1 also R2a; JM3 and JM4 also R2b; JM5 also R2b (agent-plugins types). All five are
file-disjoint in source. They collide on `packages/admin/package.json` (export-map removals), on
`packages/cms/package.json` (JM1-4 add entries) and on Tovu `integrations/jini-admin/modules.hooks.ts` (84 lines,
wires six modules): the coordinator applies those lines, or the five run serially.
Per folder:
1. Guard: every row of `jini-admin-domains.tsv` for the folder matches `git rev-parse --short=10 HEAD:<path>`.
2. Baseline: `npm --prefix packages/admin run test -- <folder>`; record the test count for the folder.
3. Jini commit A (green alone): `git mv packages/admin/src/<folder> <target>`; move `core/ports/<folder>.ts` with
   it; rewrite the folder's imports per the table above; add the owner's export-map entries (same five shapes the
   admin entries have: `.`, `./react`, `./adapters/http`, `./adapters/memory`, `./conformance`) and build them
   (lesson 25); add the owner kit file and its fake; move the tests and run them in the owner package. The test
   count in the owner equals the folder's baseline count. Remove the admin export-map entries and the admin
   `core/ports` export in this same commit. Class names in the moved React files become `jini-<domain>-*`; write
   the old → new list into the report for the Tovu half.
4. Tovu commit B: repoint every row of `jini-admin-domains.tovu-sites.tsv` for the folder (`@jini-ai/admin/<folder>…`
   → the owner specifier), bind the owner kit (coordinator lines for `jini-kits.ts`), rename the selectors in host
   CSS, keep `features/<folder>/*-i18n.ts` and its parity test passing against the owner's `messages.en`.
5. Chrome check of that screen (COMMON-ADMIN 4).
Folder notes:
- **forms**: `field-settings.ts` (445) computes four module-level values from the catalog at import time; R2a
  turns them into functions. Do not start JM1 until R2a's report says all six steps landed.
- **media**: Tovu keeps its own media screen (`features/media`, 4,166 lines) and uses Jini's only through
  `integrations/jini-admin/media-ports.ts` (170) and `media-panel.ts` (19), which parks the swap. JM3 moves the Jini
  code only; it must not mount Jini's screen in Tovu. S-MEDIA decides the swap.
- **security**: 746 lines, **no Tovu import site**. It is the module S-SECURITY grows. Move it first (JM5), then
  S-SECURITY ports Tovu behaviour into the new home.
- **consent** has one export-map entry (`./consent/react`) and no module file: read it before choosing the shape.
- **playground** stays; after JM1-5, `rg -n "@jini-ai/(cms|agent-plugins|ui)['\"/]" packages/admin/src -g '!**/__tests__/**'`
  must print nothing and admin's manifest drops those three dependencies (G-STALE-DEPS covers the stale peers).
STOP
- A moved file needs a name that is not in the kit list above and adding it costs more than one line per name in
  `jini-kits.ts`.
- The owner package cannot import what the folder needs without breaking the import rule (report the edge).
- Test count in the owner differs from the baseline.
