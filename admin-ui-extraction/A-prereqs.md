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
| 1 | `App.hooks.ts:2` | `assistant/assistant-tool-approval-policy.ts` (48; 14) `directPageAction` | The name is imported and **not used** in this file (row-1 block below prints line 2 only). Delete the import; the typecheck in that block confirms. |
| 2 | `features/webmcp/admin-page-tools.ts:1,64` | same module | Step B below. |
| 3 | `hooks/assistant-chats-dependencies.hooks.ts:1` | `assistant/content-chat-title.ts` (104; 1) | Move the file to `packages/contracts/src/content-chat-title.ts` (it imports only `@jini-ai/chat/core`; check `packages/contracts/package.json` may take that dependency: if not, STOP for this row). Repoint the 1 website importer and its tests. |
| 4 | `features/menus/hooks/use-menu-editor.hooks.ts:16` | `platform/html/slug.ts` (28; 71) `toSlug` | Step C. |
| 5 | `features/posts/rules.ts:1` | `features/post/slug.ts` (23; 71) | Step C. |
| 6 | `features/ai-assistant/hooks/use-admin-subagents.hooks.ts:6` | `assistant/assistant-subagents-policy.ts` (1 line: a re-export of `contracts/core/assistant-native-fallbacks.js`) | Find the real declaration (row-6 block below). If that file is pure data, move it to `packages/contracts/src/assistant-native-fallbacks.ts`, delete the 1-line re-export shell, repoint its 7 website importers. |
| 7 | `lib/credential-copy.ts:2-7` | `contracts/core/credential-copy.ts` (601, a dictionary) + `credential-token.ts` (10) | Step D below. **This file is not a re-export shell** (round-1 error, judge blocker 1): it also declares two live helpers. |
Row 1 (before: prints only line 2; after the edit: prints nothing, and the typecheck passes):
```
rg -n directPageAction $T/apps/admin/src/App.hooks.ts
npm --prefix $T/apps/admin run typecheck
```
Row 6 (find the real declaration):
```
rg -n "assistantCliPermissions" $T/apps/website/src/contracts/core
```

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

**Step D (credential copy; class: credential input validation and display copy).** `apps/admin/src/lib/credential-copy.ts`
(31 lines at `e801e9ae`) holds three different things. Inventory, every export:
| Lines | Export | Kind | After |
|---|---|---|---|
| 2 | `credentialText`, `formatCredentialHint`, `formatCredentialHints`, `translateCredentialMessage` | forwarding of website `contracts/core/credential-copy.ts` | line deleted; each importer of one of these names imports it from `@tovu/contracts/credential-copy` |
| 3-4 | `assertCredentialToken`, `CredentialInputError`, `CREDENTIAL_MESSAGES`, type `CredentialTokenHint` | forwarding of website `contracts/core/credential-token.ts`, which is itself a re-export of `@jini-ai/platform/secrets/credential-token` (lines 3-5; `universal` entry) | lines deleted; importers import from the REAL owner `@jini-ai/platform/secrets/credential-token` (admin already declares `@jini-ai/platform`, `apps/admin/package.json:32`). Revision 3 (Opus M1): `credential-token.ts` is NOT moved; moving it would create a new forwarder in `@tovu/contracts` |
| 10-16 | `storedCredentialHint` | **live function** (stored-key hint; hides the hint when the key belongs to another endpoint) | **stays in `lib/credential-copy.ts`**, unchanged, with its comment |
| 21-31 | `credentialDraftError` | **live function** (only the validator's own `CredentialInputError` becomes display copy; any other exception is rethrown) | **stays in `lib/credential-copy.ts`**, unchanged, with its comment |
`lib/credential-copy.ts` is NOT deleted. After Step D it is the admin owner of the two helpers and its own imports
(lines 6-7) read `@jini-ai/platform/secrets/credential-token` and `@tovu/contracts/credential-copy`.
1. Census (paste into the report): `rg -n "lib/credential-copy" apps/admin/src` (15 production files at `e801e9ae`,
   among them `features/security/hooks/use-access-tokens.hooks.ts`, `features/deployment/hooks/use-publish-credentials.hooks.ts`,
   `components/CredentialHint.tsx`; tests are extra). For each importer write the names it imports and tag each
   name FORWARDED (table rows 1-2) or LIVE (rows 3-4).
2. Tests first, GREEN on today's code, each shown RED under its mutation (add to the existing test file of
   `lib/credential-copy`; find it: `rg -l "credentialDraftError|storedCredentialHint" apps/admin/src -g '**/__tests__/**'`;
   if a case below already exists, name it instead of duplicating):
   | # | Asserts | Fails when |
   |---|---|---|
   | D1 | `credentialDraftError` with an `assertToken` that throws a plain `Error` **rethrows the same error** | the `instanceof CredentialInputError` test is dropped (an unknown exception would become display copy) |
   | D2 | `credentialDraftError` with an invalid value returns the translated message for `locale: 'de'`, and `null` for `''` when not required | the translation call or the blank-keeps-secret rule is dropped |
   | D3 | `storedCredentialHint` returns `undefined` when `storedKeyIsForOtherEndpoint` is true even though `stored.isSet` | the other-endpoint guard is dropped |
   | D4 | `storedCredentialHint` prefers the formatted `tokenHint`, falls back to `masked`, then `undefined` | the fallback order changes |
3. One commit: `git mv` ONLY `apps/website/src/contracts/core/credential-copy.ts` to `packages/contracts/src/credential-copy.ts`
   and change its line 1 import from `./credential-token.js` to `@jini-ai/platform/secrets/credential-token` (the real owner of
   `CREDENTIAL_MESSAGES`, `CredentialMessageId`, `CredentialTokenHint`); add `"@jini-ai/platform"` to `packages/contracts/package.json`
   `dependencies` with the SAME range `apps/admin/package.json:32` uses (declared, imported statically; `npm install` regenerates the
   lockfile; no `exports` edit: the package already exports the wildcard `./*`). `credential-token.ts` STAYS in website (it holds
   the live `assertCredentialFreeField` binding, lines 6-10; its website re-export lines are a separate cleanup, sheet A2 below); move the size exception: the row in
   `development/scripts/size-exceptions.json:20` names `apps/website/src/contracts/core/credential-copy.ts` — change
   its `file` to the new path in this same commit (it is a data table: the exception stays valid; `npm run check:size`
   proves it); repoint the website importers of `credential-copy.ts` only (`rg -ln "contracts/core/credential-copy" apps/website/src`);
   in admin delete lines 2-4 of `lib/credential-copy.ts`, repoint its lines 6-7, and repoint only the FORWARDED
   names of each importer. LIVE names keep importing `lib/credential-copy`.
4. Proof: `rg -n "^export \{|^export type \{" apps/admin/src/lib/credential-copy.ts` prints nothing;
   `rg -n "export function (storedCredentialHint|credentialDraftError)" apps/admin/src/lib/credential-copy.ts` prints 2 lines;
   D1-D4 pass; admin and website typecheck; `npm run check:size`.


**Step C (slug).** Admin previews the slug the server will store, so both must call one function. Move
`platform/html/slug.ts` and `features/post/slug.ts` to `packages/contracts/src/{slug,post-slug}.ts`. This adds
`@sindresorhus/slugify` to `packages/contracts/package.json` (this run edits it and runs `npm install`; the
lockfile is never edited by hand; COMMON-ADMIN section 3). 71 website files import these: this is over the rule-of-500 comfort line, so repoint with one scripted
rewrite (`rg -l` the two specifiers, `sed` the path, then typecheck), commit the script output in one commit, and
list the file count. Keep the header comment of `slug.ts` (lines 1-18) on the moved file.
Test first: C1 a table of 12 titles (ASCII, accents, CJK, RTL, emoji, 200 characters, empty) with the slugs the OLD
function returns, pinned as literals; it must pass unchanged after the move.

Order: row 1 (alone, trivial), Step B, rows 3 and 6, Step D, Step C last (largest). Each is its own green commit.
Done when: the census command prints nothing; `npm run check:boundaries` is no worse; website and admin typecheck;
the website tests of every repointed file pass with the website's own runner (root `npm test` is `node --test`; run the files' own suite the way `package.json` `test` does, scoped to the touched folders; say which command you used).

STOP
- `packages/contracts` cannot take a needed dependency (rows 3, Step C): leave that row, report it.
- Step D: an importer uses a name that is in neither table half, or `lib/credential-copy.ts` has an export the
  table does not list (the file changed): stop Step D, report the export.
- A website module turns out to read env, the database or the request (not pure): leave it, report it.
- More than 80 files would change in one commit other than Step C's scripted rewrite.

## A2 (website follow-up, after A1 Step D; not admin): drop the re-export lines of `contracts/core/credential-token.ts`
Owner decision D-14 (INDEX): run it now or leave it. Estimate (Sonnet) 120k. Class: credential input validation.
Facts at Tovu merge-final `232764af5`: `apps/website/src/contracts/core/credential-token.ts` lines 3-5 re-export six
values and three types of `@jini-ai/platform/secrets/credential-token`; lines 6-10 are the live binding
`assertCredentialFreeField` (injects Tovu's secret-shape detector); lines 1-2 are its why-comment. 41 files import the
path (40 in `apps/website`, 1 in `apps/admin` that Step D removes; 9 are tests). One test is the trap:
`features/media/__tests__/provider-credential-store.rethrow.test.ts:17-27` replaces the whole module with
`mock.module("#src/contracts/core/credential-token", …)` to make the policy throw a plain `Error`, because the real
policy only throws `CredentialInputError` (its own header says so, lines 5-13). If the store imported
`normalizeCredentialToken` from platform directly, that mock would stop reaching it and the third test would fail
for the wrong reason; and mocking another package's module is forbidden (COMMON-ADMIN C5).
Design: **a port on the store, not a mock.** No re-export shell is kept.
1. `provider-credential-store.ts`: `MediaProviderCredentialWriteDeps` (`:110-117`) gains an optional
   `credentialPolicy?: { assertCredentialFreeField; normalizeCredentialToken }` (typed from the two real functions).
   The store resolves `deps.credentialPolicy ?? { assertCredentialFreeField, normalizeCredentialToken }` once per
   call and passes it to the three call sites (`:154`, `:169`, `:200`; through `assertValidEntry` and
   `sealNewProviderKeys`). `CredentialInputError` and `CREDENTIAL_MESSAGES` are imported from platform.
2. The rethrow test passes its substitute through `deps.credentialPolicy` and imports nothing with `mock.module`.
3. `credential-token.ts` keeps lines 6-10 only. Its lines 1-2 comment is rewritten, not deleted: it states why the
   binding exists (Tovu's detector injected into the platform rule); the "parallel credential-save work" clause is
   obsolete and its removal is listed in the report.
4. The 40 website importers: each name from lines 3-5 is imported from `@jini-ai/platform/secrets/credential-token`
   (website code is declared by the root `package.json`, which has `"@jini-ai/platform"` at line 127 on `232764af5`); `assertCredentialFreeField` keeps the website path.
   One scripted rewrite commit, the file count in the report.
Tests first (GREEN on today's code; RED under the mutation):
| # | Asserts | Fails when |
|---|---|---|
| W1 | the three existing rethrow cases, now through `deps.credentialPolicy`: the plain `Error` surfaces unchanged and nothing is written | `rethrowAsValidation` converts every error (its `throw err` becomes a validation error) |
| W2 | with no `credentialPolicy`, a `baseUrl` holding a secret-shaped value is refused as `MediaProviderCredentialValidationError` | the default policy is dropped or replaced by a no-op |
Proof:
```
rg -n "mock\.module" $T/apps/website/src/features/media/__tests__/provider-credential-store.rethrow.test.ts   # prints nothing
rg -n "^export \{|^export type \{" $T/apps/website/src/contracts/core/credential-token.ts                     # prints nothing
rg -l "contracts/core/credential-token" $T/apps $T/packages | wc -l    # only importers of assertCredentialFreeField remain
```
STOP: any importer uses a name from lines 3-5 through a namespace import or a dynamic path; the root
`package.json` no longer declares `@jini-ai/platform`.
