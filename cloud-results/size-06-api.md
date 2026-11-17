# size-06-api — size 06 PHASE 1 (steps 0a → 3): COMPLETE

Branch `refactor/size-06-api` from `origin/refactor/terra` `80b00f5b`. Builds on Jini `refactor/terra` `02edbb68`.
Admin only. Phase 2 (signatures) not started. No `lib/admin-http/*` reader behaviour changed.

## Result

- `apps/admin/src/lib/api.ts` (4,484 lines) is deleted. Nothing imports it; no forwarder or re-export shell remains.
- Transport: `lib/admin-http/config.ts` (BASE, WORKSPACE_ID), `request.ts` (193 code lines), `urls.ts`.
- 33 feature clients in `features/<feature>/api/<feature>-api.ts` with their DTOs in `<feature>-api.types.ts`
  (66 files; largest 173 code lines). 219 methods moved byte-for-byte; no signature changed.
- 701 importer files repointed; 18 `vi.mock(lib/api)` factories migrated to the feature modules.

## Gates

| gate | base (`80b00f5b`) | final |
|---|---|---|
| admin `tsc --noEmit` | 0 errors | 0 errors |
| admin `vitest run` (894 files) | 14,470 of 14,472 pass, 0 fail, 2 skipped, 1 suite cannot load | 14,713 of 14,715 pass, 0 fail, 2 skipped, same 1 suite |
| request-shape table (219 members × min/full) | written | byte-identical after every commit |
| `check:complexity` | exit 1 (24 entries, none from this lane) | identical output |
| `check:size` | exit 1 (17 entries) | 5 admin files longer by 1–5 import lines (below); no new violation |
| root `tsc -p tsconfig.json` | — | 0 errors |
| `typecheck:scripts` | — | no error in the two scripts touched |

The 243 extra tests are the pins added in step 0a. Each client commit was gated on admin tsc, the touched test files,
the feature folder's tests and both pin files before it was committed.

**Named baseline exception (design R1.8, decision 06-b):** one suite fails to load on the unmodified tree and identically at the end:
`src/integrations/chart-providers/__tests__/recharts-bundle-integer-ticks.unit.test.ts` pins `charts-recharts/0.7.0`; the linked Jini
checkout builds `0.7.1`. It does not import the admin API. I continued because every test passes and the failure is the checkout's
plugin version, not a red test. If that exception is not acceptable the run should be treated as unreviewed from step 1 on.

## Pins and mutation proof (step 0a, `0a522aee`)

- `lib/__tests__/api-request-shapes.characterization.test.ts` + `.samples.json` + snapshot: every member called with generated sample
  arguments against a fake `fetch`; method, URL, headers, body, credentials, keepalive, cache snapshotted. 216 fetching members, 3 URL builders.
- `lib/__tests__/api-request.characterization.test.ts`: 23 cases — 200, 204, unparseable body (and `requireJson`), 401 listener rule,
  timeout, unreachable, caller abort, restart retry (4), keepalive byte limit, failure notice (500 / no response / GET default published
  once with the request's body, path, method, generation; six 4xx not published; throwing notice keeps the original rejection).
- Mutations, each reverted: logout path changed → row `logout` fails; template-preview path changed → `templatePreviewUrl` fails;
  inner try/catch removed → "a notice that throws" fails; `>= 500` → `> 500` plus 404 published → 3 fail; any-401 notifies and method
  forced to PUT → 4 fail.
- Mock-factory interception proof (one override removed → the test file must fail → restored), recorded in each commit message:
  24 migrated factory blocks proven. 2 not provable: in `features/security/hooks/__tests__/use-other-credentials.unit.test.tsx` the
  overrides `mediaApi.getMediaProviders` and `integrationsApi.listExternalMcpServers` are not used by that file — it passes with the
  override removed **and** the real method made to throw. They were dead overrides before the move too.

## Commits (oldest first)

- `0a522aee` test(admin): pin lib/api before the size-06 split (step 0a)
- `f884aee3` refactor(admin): move the fetch seam to lib/admin-http (size 06 step 1)
- `23749801` cloud-results: size 06 step 0b sheets
- `822cdd25` refactor(admin): move the forms API client out of lib/api (size 06 step 2)
- `47130120` refactor(admin): move the analytics API client out of lib/api (size 06 step 2)
- `eac9cf06` refactor(admin): move the comments API client out of lib/api (size 06 step 2)
- `aa7475a5` refactor(admin): move the providers API client out of lib/api (size 06 step 2)
- `9b3cebb5` refactor(admin): move the seo API client out of lib/api (size 06 step 2)
- `4adb0e9a` refactor(admin): move the redirects API client out of lib/api (size 06 step 2)
- `9bfcefbc` refactor(admin): move the workspace API client out of lib/api (size 06 step 2)
- `5d991822` refactor(admin): move the settings API client out of lib/api (size 06 step 2)
- `241df4f7` refactor(admin): move the widgets API client out of lib/api (size 06 step 2)
- `62b95f25` refactor(admin): move the members API client out of lib/api (size 06 step 2)
- `29b492af` refactor(admin): move the menus API client out of lib/api (size 06 step 2)
- `50a27f2b` refactor(admin): move the trash API client out of lib/api (size 06 step 2)
- `16ca2217` refactor(admin): move the pages API client out of lib/api (size 06 step 2)
- `b91f4b2d` refactor(admin): move the fs-files API client out of lib/api (size 06 step 2)
- `db5488a3` refactor(admin): move the plugins API client out of lib/api (size 06 step 2)
- `9b472ef1` refactor(admin): move the database API client out of lib/api (size 06 step 2)
- `6d28e911` refactor(admin): move the publish-content API client out of lib/api (size 06 step 2)
- `b4f89a7b` refactor(admin): move the auth API client out of lib/api (size 06 step 2)
- `936d2bc6` refactor(admin): move the recovery API client out of lib/api (size 06 step 2)
- `a0c6cec4` refactor(admin): move the collections API client out of lib/api (size 06 step 2)
- `c855a43d` refactor(admin): move the users API client out of lib/api (size 06 step 2)
- `5afa84f2` refactor(admin): move the posts API client out of lib/api (size 06 step 2)
- `57f37901` refactor(admin): move the taxonomy API client out of lib/api (size 06 step 2)
- `4d040a9d` refactor(admin): move the roles API client out of lib/api (size 06 step 2)
- `8756003b` refactor(admin): move the themes API client out of lib/api (size 06 step 2)
- `e7fc4cb7` refactor(admin): move the media API client out of lib/api (size 06 step 2)
- `a4ecce1c` refactor(admin): move the ai-assistant API client out of lib/api (size 06 step 2)
- `419cfaa4` refactor(admin): move the integrations API client out of lib/api (size 06 step 2)
- `8e6079fc` refactor(admin): move the email API client out of lib/api (size 06 step 2)
- `a68405d6` refactor(admin): move the import-export API client out of lib/api (size 06 step 2)
- `408c7cb2` refactor(admin): move the observability API client out of lib/api (size 06 step 2)
- `83270f3e` refactor(admin): move the source-control API client out of lib/api (size 06 step 2)
- `fe56e011` refactor(admin): move the deployment API client out of lib/api (size 06 step 2)
- `cc7fb842` refactor(admin): move the security API client out of lib/api (size 06 step 2)
- `317ad987` refactor(admin): move the sites API client out of lib/api (size 06 step 2)
- `9af66b69` chore(admin): point tools at the feature API clients (size 06 step 3)

## Deviations from the design (nothing improvised silently)

1. **Self-references (R1.3):** the code has one, not four. `mediaContentType` read `api.mediaOriginalUrl`; it now reads
   `mediaApi.mediaOriginalUrl`. The other three sites the design lists (2860, 3352, 3571) are prose in doc comments. One body edit in total.
2. **Rows the design table does not name** were placed by where their callers are (sheet `cloud-results/size-06-api/members.tsv`, rule column):
   `system/publish` preview/trigger/status/destinations and `publish-targets` → `deployment`; publish credentials, custom credentials,
   `credential-copy` → `security`; `policies` → `roles`. `system/export` → `import-export` and `site-key` → `sites` follow the table although
   their callers are in `deployment` and `security`. Moving a client between feature folders is a file rename plus an import codemod.
3. **Shared DTOs:** `AdminPost` (posts + pages) → posts; `GatedPlanResult`, `GatedConfirmResult` (taxonomy, database, recovery) → taxonomy
   (tie broken by client order). Other features import them type-only.
4. **24 exported DTOs have no API member and no importer** (Seo*, RobotsRule, Redirect*, AdminWidgetPlacement/Area/RegionBinding,
   AdminFormSubmission, CommentsSettings, CommentModerationAction, SettingResetResponse). Moved verbatim by name; `features/seo/api` and
   `features/redirects/api` hold types only. They are deletion candidates (owner decision; not deleted here).
5. **Email client name:** `features/email/email-api.ts` already exports `emailApi`, so `getMailStatus` lives in
   `features/email/api/mail-status-api.ts` as `mailStatusApi`.
6. **A port that spanned three clients:** the Library port read media, auth and users methods off `api`. Its host binding
   (`features/library/hooks/library-dependencies.hooks.ts`) now names each method's client and looks it up per call (commit `auth`).
   The design only foresaw single-client ports. All other whole-object ports (`Pick<typeof api, …>`) map to one client each.
7. **`lib/api.ts` was deleted in the last client commit** (`sites`), when `api` became empty, not in a separate commit. The step-3 commit
   holds the tool updates and the debt entries.
8. **Step 0a commit alone does not typecheck:** the table test had a type predicate on a destructured parameter. Fixed in the step-1 commit.
9. **Two lib tests** (`execution-settings.test.ts`, `ledger-slice.test.ts`) replaced `ApiError` through a non-spread `lib/api` mock; they now
   replace it on `admin-http/request` (spread of the real module + the same fake class). No assertion edited anywhere.
   `pages-dependencies.unit.test.ts` used a dynamic `import("@/lib/api")`; edited by hand in the posts commit.
10. **Codemod not committed.** The design's `development/scripts/api-split-inventory.mjs` is deleted at the end anyway; the tool
    (TypeScript-AST, regenerates files from the step-1 `api.ts` for a given moved set) lived in the session scratchpad.

## For the coordinator

- **`check:size` (lane-caused, not hidden):** one import became one per new home, so five files already in `size-debt.json` grew:
  `App.hooks.ts` 513 → 518, `features/pages/hooks/use-page-editor.hooks.ts` 682 → 684 (681 in debt), `features/posts/PostEditor.tsx` 1451 → 1452,
  `features/posts/hooks/use-post-editor.hooks.ts` 636 → 637, `features/publish-content/hooks/use-publish-content-confirm.hooks.ts` 847 → 848.
  `features/security/hooks/use-access-tokens.hooks.ts` went back from 612 to its debt value. I did not raise any debt number. The
  `lib/api.ts` entries were removed from both debt files.
- **Bug found, not fixed (outside admin):** `development/scripts/check-admin-api-routes.ts` prints "checked 0 admin request() calls" on the
  base tree too — its matcher expects a string literal as `request`'s first argument, every call passes `{ path }`. It now reads the
  feature client files, and still checks 0 calls.
- **Stale prose:** about 275 admin files still say `lib/api.ts` or `api.someMethod` in comments. Not swept (comments moved with their code unchanged).
- **Not run:** root `typecheck:tests`, website tests, `check:boundaries` (website only) — no file under them changed.
- **DI (practice 1):** unchanged, as the design says: features still import a concrete client. `request` and `fetchOrThrowUnreachable` are now exported from `admin-http/request.ts` because clients in other files call them.

## Next step

Size 06 **P2** (AMENDMENTS-A A2: one commit per feature client, four signature classes; `members.tsv` has a signature-class column —
re-measure, my classifier gives 115 / 62 / 32 / 10 against A2's 115 / 62 / 31 / 11) beside error-system **E6a** on `lib/admin-http/*`.
The request-shape table must stay byte-identical through P2 except for the call arguments of the "one optional object" class.
