# Final sweep: codex/w3-pages-members-{jini,tovu} (556b3a9c5 / bb8384d922 plus uncommitted fixes below)

Setup: `pnpm install --frozen-lockfile` exit 0. `pnpm --no-bail -r build` exit 0, 0 `error TS` ($S/tip-build.log). link-jini exit 0.

## Gates (base = $S/g-base, tip = $S/g-tip; new = normalised line diff)
| gate | base | tip | new findings | status |
|---|---|---|---|---|
| jini guard | 1 | 1 | 0 (count drift in the injection advisory only) | same as base |
| jini typecheck | 0 | 0 | 0 | ok |
| jini api:check | 0 | 0 | 0 after the re-run of api:update (`SqlNewsletterCampaignRepo` hash moved by the typing fix) | ok |
| jini check:cross-package | 1 | 1 | 2 lines: XP3 `admin/src/forms/react/hooks/use-form-editor-parts.hooks.ts: @jini-ai/ui`, `user-management/src/server/auth-challenge.ts` | the gate is broken in this environment both times (~2016 lines say `absolute JINI_DECLARATION_BASELINE_DIR required`), so these lines are noise; forms is outside this run |
| jini check:size | 1 | 1 | 1: max-lines `user-management/src/members/repo.ts` (669 lines) | LISTED: splitting it is a refactor, not a local fix |
| jini check:complexity | 1 | 1 | 0 | same |
| jini check:why-comments | 1 | 1 | 0 | same |
| jini check:hooks | 0 | 0 | 0 | ok |
| jini check:errors | 0 (warn) | 0 (warn) | 1: catch-reads-error `user-management/src/member-login/oidc-login.ts` (4: lines 140, 202, 234, 258; bare `catch {}` mapped to MemberLoginError, moved verbatim from Tovu). fanout.ts 7->8 is in base too | LISTED: fixing it means attaching a `cause`, a behaviour seam that needs a pinning test first |
| jini check:log-safety | 1 | 1 | 2: stored-error-text `admin/.../use-dashboard.hooks.ts:201`, `cms/.../system/server-logs.ts:50` | REPORTED on purpose: the local-variable evasion was reverted (step 2) |
| tovu check:size | 1 | 1 | 0 | same |
| tovu check:boundaries | 0 | **2** | 2 errors no-deep-imports:features/members: `server/inbound/{public,admin}-http/routes/members/deps.ts -> features/members/mail-transport.ts` | LISTED: this run deleted `features/members/index.ts` (the module's door), but `features/members` is still in GUARDED_MODULES (.dependency-cruiser.mjs). Owner call: per that file's own policy (modules without an index.ts are not guarded) remove it from GUARDED_MODULES, or have the composition inject `membersMailTransport` |
| tovu typecheck | 0 | 0 | 0 | ok |
| tovu typecheck:tests | 0 | 0 | 0 (after the 2 fixes below) | fixed |
| tovu typecheck:scripts | 2 | 2 | 0 | same |
| tovu check:errors/complexity/hooks | 0 | 0 | 0 | ok |
| tovu check:architecture | 1 | 1 | ratchet warning (non-blocking): propagation cost runtime-only 3.06 -> 3.33; API surface 821->640, hubs 335->266, all-import 15.52->12.16 improved | LISTED (warning) |
| tovu check:why-comments | 1 | 1 | 10 lost blocks: admin `features/pages/rules.ts` (241, 321, 361), website `contracts/core/tool-metadata/server-logs.ts:4`, `features/newsletter/data-module-manifest.ts` (20, 138), `features/newsletter/repo.rows.ts` (23, 88, 114), `features/newsletter/repo.ts:52` | LISTED: the Jini copies are reworded; each needs its original text restored verbatim in Jini (out of budget). The `tovu permissions list` block is restored |
| tovu admin-tsc | 0 | 0 | 0 | ok |

## Tests
| suite | files | result | new reds |
|---|---|---|---|
| Jini user-management (whole) | 141 | 1511/1514 before fix; public-args now passes | public-args (FIXED). runtime-boundary x2: fails in base too |
| Jini diagnostics (whole) | 75 | 1127/1131 | none: web-evidence/page-body x4 fails in base too |
| Jini admin pages/screens/react/forms | 118 | 1288/1288 | none |
| Jini cms routes/system | 5 | 27/27 | none |
| Jini core tool-metadata | 3 | 24/24 | none |
| Tovu admin (pages,members,dashboard,observability,posts,email,menus,lib,integrations) | 230 | 3877/3882 | dictionary-lookup-sinks (LISTED); untranslated-copy x2 (FIXED, 64/64). admin-literal-copy and credential-input-autocomplete fail in base too |
| Tovu website node tests | 152 | 137 pass, 15 fail | none: 14 fail in base too. set-token-agent-tool passed in base only under load; run alone, base cancels the same 8 subtests, so it is a timing flake |

LISTED dictionary-lookup-sinks: `features/members/members-i18n.ts` and `features/pages/page-editor-i18n.ts` pass COMMON_I18N as `commonDictionary` to the Jini factories `createMembersTranslator` / `createPageEditorTranslator`. The guard only recognises `createDictionaryTranslator`. Recommendation: teach the guard about `create*Translator({ commonDictionary: COMMON_I18N })`, which its header already allows, and add a case for it. That is a change to the guard itself, so it is left for the owner.

## Fixes made (uncommitted)
Jini:
- `packages/cms/src/admin-http/routes/system/server-logs.ts`, `packages/admin/src/screens/dashboard/hooks/use-dashboard.hooks.ts`: reverted the local-variable log-safety evasion. The checker documents no safe alternative for a caller answer.
- `packages/user-management/src/newsletter/repo.ts`: `hasSending` and `transaction` now type `_options: Record<string, never> = {}` (public-args test).
- `api-baseline/jini-ai__user-management.json` regenerated (only the 5 expected packages differ from integ).
- `.changeset/p9-w3-pages-members-user-management.md`: added `member-login/oidc-login`, `members/auth-mail`, `members/repo`.

Tovu:
- `apps/website/src/features/newsletter/__tests__/repo.dialects.test.ts`: `satisfies ContentKernel` gives `work` its contextual type (TS7006).
- `apps/website/src/server/__tests__/routes/member-oidc-auth.test.ts`: binds `reportFailure` to `reportServerFailure` the same way as composition/modules/members.ts.
- `apps/website/src/features/newsletter/repo.sqlite.ts`: restored the original types.ts header block, verbatim.
- `apps/admin/src/lib/__tests__/untranslated-copy.unit.test.ts`: the Jini page-editor dictionaries are now checked under the host module path (the same pattern as admin-nav-i18n).

Note: Jini `npx vitest run src/newsletter` in user-management already passes on the tip (12 files, 90 tests). An untracked `/home/user/Tovu/chat.db` appeared during the test runs; it is not mine and I left it alone.

## Last fixes
1. Tovu check:boundaries: **0 errors** (106 warnings = base). Injection, not de-listing: `MembersDeps.membersMailTransport` + `MemberPublicRouteDeps.membersMailTransport` (required); route deps builders read `deps.membersMailTransport`; bound in composition roots `site-deps/route-deps-members-mail.ts`, `memory-deps/route-deps/members-media-newsletter-forms.ts`, plus one line in `http-app/mount-members-newsletter.ts` (memberPublicDepsFor; held-list file, one field). Fixtures: 4 route tests bind it; characterization keys + memory-root shape pin (UPDATE_MEMORY_ROOT_SHAPE_PIN=1; diff = one new key). typecheck 0, typecheck:tests 0. Tests: 139/143; the 4 reds fail at HEAD/base too (CAS 401/500, session-repo 500, L4 "run calls sit" verified at HEAD, pin: only `membersMailTransport` recorded; the pin stays red on 3 pre-existing unpinned keys (staticSitePackager, sourceControlWrite, publishCompatibility) not added by this fix, left for the owner).
   GUARDED_MODULES removal rejected: commerce/entries/taxonomy are guarded without index.ts via PUBLIC_ENTRIES, so line 363's rule is not how the file treats barrel-less modules.
2. Tovu why-comments: all 10 ids restored verbatim (88 -> 78 with working trees). Jini: newsletter `repo.ts`, `repo.rows.ts` (x3), core `tool-metadata/server-logs.ts` (+ "Now:" lines). Tovu (apps/ paths): `apps/admin/src/features/pages/rules.ts` (x3), `server/runtime/composition/data-modules.ts` (x2). NOTE: the gate reads Jini via `git ls-files`, so the 10 members/repo blocks show as lost until `repo.sessions.ts`/`repo.sql.ts` are tracked (all original lines verified present).
3. Jini check:size: members/repo.ts gone from findings (459 lines). Split: `members/repo.sessions.ts` (SqlMemberSessionRepo, SqlMagicLinkTokenRepo; new subpath export + jini.entries + contract test), `members/repo.sql.ts` (internal `on`/`withoutId`). 13 Tovu importers + 1 Jini test repointed. Jini src/members 56/56; Tovu members repo/dialect suites 254/255 (1 = base CAS red).
4. dictionary-lookup-sinks: not attempted (budget).
