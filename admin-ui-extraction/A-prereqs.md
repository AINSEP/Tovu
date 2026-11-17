# A sheets: prerequisites in Tovu (2 runs). Read `COMMON-ADMIN.md` first.

| Sheet | Work | Estimate (Sonnet) | Needs |
|---|---|---|---|
| A0 | before-pictures of every screen + request-count baseline | 150k | a browser |
| A1 | admin stops importing website source by relative path (the named blocker) | 160k | - |
A0 and A1 share no file and may run in parallel.

## A0: baselines (no production edit)
Purpose: every later sheet compares against these. Without them "looks the same" is a guess.
1. Start the real admin against a seeded site (`development/` has the seed scripts; use the one `npm run test:visual`
   uses; if you cannot find it in 10 minutes, STOP and report what you tried).
2. For each of the 51 panel ids in `apps/admin/src/panels.tsx` (`rg -n "^\s+id: ['\"]" apps/admin/src/panels.tsx`
   printed 51 at `f354cfbd`): capture list view, first editor/detail view, each tab. Themes `classic` and `glass`,
   light and dark, 1440 px and 390 px. Name files `<panelId>__<view>__<theme>-<scheme>-<width>.png`.
3. Record the request count per screen open with the existing harness: `apps/admin/src/__tests__/app-boot-request-volume.test.tsx`
   (run it; paste its numbers). Do not write a new harness.
4. Run and paste: `npm run check:admin-screens-drift`, `npm run test:visual` (report failures; do not fix).
5. Commit the pictures under `cloud-results/admin-ui/A0/` (if the set is over 150 MB, commit 390 px + 1440 px
   `classic-light` only and say so).
STOP: the admin cannot boot from a clean clone linked to the built Jini checkout. Report the exact error.

## A1: remove the relative imports of `apps/website/src` from admin source
The task brief names one (`App.hooks.ts`). Measured at `f354cfbd` there are **7 production files reaching 6 website
modules**, plus 30 admin test files and 4 declared aliases (`apps/admin/tsconfig.json:16-19`, `vite.config.ts:156-162`:
`@tovu/headless`, `@tovu/theme-layout`, `@tovu/publish-content-ui`, `@tovu/assistant-run-events`).
A1 fixes the 7 production files. The aliases and the tests are listed in INDEX "Left for later" (D-8).

Re-take the census first; a different result is reported before editing:
`rg -n "from ['\"](\.\./)+website/src/" apps/admin/src -g '!**/__tests__/**'`

| # | Admin file:line | Website module (lines; website importers) | Fix |
|---|---|---|---|
| 1 | `App.hooks.ts:2` | `assistant/assistant-tool-approval-policy.ts` (48; 14) `directPageAction` | The name is imported and **not used** in this file (`rg -n directPageAction apps/admin/src/App.hooks.ts` prints line 2 only). Delete the import. Confirm with `npm --prefix apps/admin run typecheck`. |
| 2 | `features/webmcp/admin-page-tools.ts:1,64` | same module | Step B below. |
| 3 | `hooks/assistant-chats-dependencies.hooks.ts:1` | `assistant/content-chat-title.ts` (104; 1) | Move the file to `packages/contracts/src/content-chat-title.ts` (it imports only `@jini-ai/chat/core`; check `packages/contracts/package.json` may take that dependency: if not, STOP for this row). Repoint the 1 website importer and its tests. |
| 4 | `features/menus/hooks/use-menu-editor.hooks.ts:16` | `platform/html/slug.ts` (28; 71) `toSlug` | Step C. |
| 5 | `features/posts/rules.ts:1` | `features/post/slug.ts` (23; 71) | Step C. |
| 6 | `features/ai-assistant/hooks/use-admin-subagents.hooks.ts:6` | `assistant/assistant-subagents-policy.ts` (1 line: a re-export of `contracts/core/assistant-native-fallbacks.js`) | Find the real declaration (`rg -n "assistantCliPermissions" apps/website/src/contracts/core`). If that file is pure data, move it to `packages/contracts/src/assistant-native-fallbacks.ts`, delete the 1-line re-export shell, repoint its 7 website importers. |
| 7 | `lib/credential-copy.ts:2-6` | `contracts/core/credential-copy.ts` (601, a dictionary) + `credential-token.ts` (10) | `lib/credential-copy.ts` is itself a re-export shell (lines 2-4). Move both website files to `packages/contracts/src/` (`credential-token.ts` already imports `@tovu/contracts/secret-redaction`), delete the admin shell, repoint every admin importer (`rg -ln "lib/credential-copy" apps/admin/src`) and the 14 + 34 website importers. The 601-line file is over 500: it is a dictionary; check `development/size-exceptions.json` for its current key and carry the exception to the new path in the same commit, or split per locale group if no exception exists (report which). |

**Step B (class: tool-approval gate, client side).** `directPageAction` decides whether a page action runs without
asking. Its table `TOOL_APPROVAL_POLICY` already lives in `apps/website/src/contracts/headless/assistant-tool-approval-policy.ts`,
which admin already reaches through the declared `@tovu/headless` alias. Move `DIRECT_PAGE_HANDLES` and
`directPageAction` (lines 13-33 of the website file, with the comment block above them) into that headless file, add
the one name to the existing export line `contracts/headless/index.ts:18`, and import it in admin from
`@tovu/headless`. The other three functions stay where they are. Repoint the website importers of `directPageAction`
(`rg -ln "directPageAction" apps/website/src`). There must be exactly one declaration afterwards:
`rg -n "function directPageAction" apps` prints 1 line.
Tests first (GREEN on old code, each shown RED under its mutation):
| # | Asserts | Fails when |
|---|---|---|
| B1 | an unknown capability id throws | the `hasOwn` guard is dropped |
| B2 | `page.click` with a handle not in the list returns false; with each listed literal and one id matching the pattern returns true | the list is emptied or widened to "any string" |
| B3 | `page.click` with a non-object input or a non-string handle returns false | the type guard is dropped |
| B4 | `admin-page-tools.ts`: a non-direct action does not call `execute()` before the approval path | line 64's condition is inverted or removed |

**Step C (slug).** Admin previews the slug the server will store, so both must call one function. Move
`platform/html/slug.ts` and `features/post/slug.ts` to `packages/contracts/src/{slug,post-slug}.ts`. This adds
`@sindresorhus/slugify` to `packages/contracts/package.json` (coordinator line: report it; do not edit lockfiles by
hand). 71 website files import these: this is over the rule-of-500 comfort line, so repoint with one scripted
rewrite (`rg -l` the two specifiers, `sed` the path, then typecheck), commit the script output in one commit, and
list the file count. Keep the header comment of `slug.ts` (lines 1-18) on the moved file.
Test first: C1 a table of 12 titles (ASCII, accents, CJK, RTL, emoji, 200 characters, empty) with the slugs the OLD
function returns, pinned as literals; it must pass unchanged after the move.

Order: row 1 (alone, trivial), Step B, rows 3 and 6, row 7, Step C last (largest). Each is its own green commit.
Done when: the census command prints nothing; `npm run check:boundaries` is no worse; website and admin typecheck;
`cd apps/website && npx vitest run` on the folders of every repointed test.

STOP
- `packages/contracts` cannot take a needed dependency (rows 3, Step C): leave that row, report it.
- A website module turns out to read env, the database or the request (not pure): leave it, report it.
- More than 80 files would change in one commit other than Step C's scripted rewrite.
