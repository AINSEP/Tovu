PARTIAL T 4542cd8fef J a9f58d6bc | FILES LEFT 855/0 | tsc 0/0/1089 | guard 0 | suites J 72671/95 (0 new), T-web 13838/894 (415 new, run capped at 40 min), T-admin 12543/361 (2 new), desktop gates 6/6 | left: 415 new website test reds (192 createHash + ~195 createRepoPublishHandler fixtures), typecheck:tests 1089, 2 new admin reds, Jini SI-touched packages not re-run after the m26si merge

# MERGE-27: final test + fix of the finished Tovu->Jini extraction (2026-11-26)

Unattended cloud run. The coordinator ran on Opus (high) and read `AI-Dev-Shop/agents/programmer/skills.md` (v1.7.5) first.

- **Subagents:** 4 (the cap), all Opus-high: website composition; website features + inbound; admin plugins/security/settings/dock; admin media/widgets/pages.
- **Rules kept:** no codebase-memory tools, no RemoteTrigger, no `--no-verify`, no force-push, no tag, no publish. `main`, `release/*` and merge-24/25/26 were not touched. No ts-ignore/expect-error, no `as any`, no guard allowlist/baseline edit, no skipped test, `.gitleaks.toml` untouched, themes untouched.
- **Environment:** the same as merge-26, and it worked unchanged:
  - Jini: `pnpm install --frozen-lockfile`.
  - Tovu: `npm ci --ignore-scripts --legacy-peer-deps` at the root and in admin, site-chat and desktop. The contracts `prepare` script was suppressed during install only, then restored; it was never committed.
  - `node node_modules/electron/install.js`, then `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini`, then `tsc` for contracts and sdk.
- **Bases:** Jini `origin/codex/m26bj` (875491a47) and Tovu `origin/codex/m26b` (dc3c8be32b).
- **Codex branches:** the `m26si*` branches existed in both repos and were merged in step 7: Jini `m26si-aj`, `-dockj`, `-pagesj`, `-plugj`; Tovu `tv-m26si-a`, `-dock`, `-pages`, `-plug`. Tovu had 3 conflicts, all resolved.
- **Baselines (NEW vs merge-26):** merge-26 never ran the full suites. To get a real comparison, I checked out merge-26 worktrees of both repos, built them, and linked them to each other. Every file that failed here was rerun on that baseline, and the comparison is per test.
- **Push hook:** hooksPath is unset in this container, so I ran `npm run gates` (apps/desktop) by hand before every Tovu push.

## Gates: merge-27 compared with merge-26

| gate | merge-26 | merge-27 | note |
|---|---|---|---|
| Jini `pnpm -r build` | green | **green** | The Codex base did not build: 8 errors in cms, 3 in agent-plugins, 12 in admin and user-management tests. All fixed. After the m26si merge: green, with 6 admin type errors fixed along the way. |
| Jini strict typecheck (`pnpm -r typecheck` + scripts) | not run | **green** | One `db` test literal was pre-existing; fixed. After m26si, the touched packages (core, user-management, cms, admin) are clean. |
| Jini guard | 267 | **0** | `cloud-results/merge-27-jini-guard.txt`. Codex's local count was 80; after the m26si merge it is 0. The only output is 6 `R13-model-fallback-freshness` lines, which are SKIPPED notes, not violations. |
| Tovu root `tsc` (website) | 19 | **0** | Was 66 at the start of this run. All 19 carried from merge-26 are fixed, along with 47 new ones from Codex. |
| Tovu admin `tsc` | 6 | **0** | Was 161 at the start; 5 more appeared after m26si. |
| Tovu `typecheck:e2e` | not run | **0** | `cloud-results/merge-27-typecheck-e2e.txt` |
| Tovu `typecheck:tests` | not run | **1089** | All in `apps/website` tests, saved to `cloud-results/merge-27-typecheck-tests.txt`. By error code: TS2345 343, TS2554 162, TS2741 127, TS2322 101. Mostly test fixtures calling Jini binders without the arguments they now require. Not fixed (budget). |
| desktop `npm run gates` | 6/6 | **6/6 PASS** | Passed before every Tovu push, including on the m26si-merged tree. |
| Jini full suites | targeted only | **72671 pass / 95 fail, 0 NEW** | Run one package at a time. 98 red at first; 3 were new and are fixed. The other 95 are red on merge-26 too: admin, agent-runtime packed-fixture (`smol-toml`), chat P26, cms, db, devops, diagnostics, http-kit, infra, integrations, mcp, plugin-catalog, plugin-fixture-provider, provider-plugins, user-management. **This sweep ran before the m26si merge.** admin, cms, core and user-management were only typechecked and built after it, not re-tested. |
| Tovu website suite | not run | **13838 pass / 894 fail, 415 NEW** | Hit the 40-min cap (exit 124). New reds are listed in `cloud-results/merge-27-website-new-reds.txt` and all reds in `-all-reds.txt`. |
| Tovu admin suite | not run | **12543 pass / 361 fail, 2 NEW** | The same 108 files had 501 failures on merge-26. New reds: `cloud-results/merge-27-admin-new-reds.txt`. |
| Tovu desktop suite | in gates | **PASS** | Covered by the gates' `tests` step. |

### The 415 new website reds (exact continuation)
The cause is test fixtures, not production code: production wiring was fixed through tsc. The counts below are by error message:
- **192** `deps.createHash is not a function`. The media-generation, media-import, media and assistant media tests build media deps without `createHash`. Add `createHash` from `node:crypto` to each fixture's deps bag:
  - `features/media-generation/__tests__/tool-registrations.test.ts` (26)
  - `features/media-import/__tests__/replace-file.test.ts` (24)
  - `media/__tests__/view-image-tool` (15)
  - `assistant/__tests__/tool-registrations.media` (15)
  - `content-duplicate.media` (14)
  - `media-import/tool-registrations` (13)
  - `view-video-tool.guards` (11)
  - `import-local-file` (9)
  - and others
- **~195** `createRepoPublishHandler is not a function` / `required.createRepoPublishHandler…`. The publish-content tests call `contributePostPublish()`, `contributeMenusPublish()` and similar with no arguments. Export the bags from `server/runtime/composition/publish-content-manifest.ts` (`repoPublishBindings`, `termSyncBindings`, `widgetPublishPolicy`) and pass them in the tests:
  - `post/publish-content` (42)
  - `publish-content/apply-loop` (35)
  - `navigation/publish-content` (33)
  - `post/publish-content.round-trip` (17)
  - `entries/unit/publish-content` (13)
  - `forms` (9)
  - …
- **~28 others:** `names no trusted actor` (mutation-actor fixtures), and `withKeys` / `newId` / `CREDENTIAL_MESSAGES` undefined.
- Fixing these will also clear most of the 1089 `typecheck:tests` errors, because they have the same root.

### New admin reds (2)
- `lib/__tests__/api-request-shapes.characterization.test.ts`: "the table covers every member" fails because H1970 added `applyMediaProviderChanges` (PATCH `/media/providers` `{removes, patches}`) without a sample row. Add a `min`/`full` sample to `api-request-shapes.samples.json` and its snapshot row.
- `features/trash/__tests__/use-trash.unit.test.tsx`: "ignores selection and batch actions before the first page arrives" gets `null` where it expects the first page. Not diagnosed.

## Fixes (file: why)

### Jini — Codex m26 round did not build (all untested Codex work)
- `cms/media/tool-registrations.ts`, `cms/media/convert-video-tool.ts`: `createHash` (made injected by Codex) was dropped by `buildMediaRegistrations` and never passed to `media_convert_video` -> **runtime crash** on assistant upload/convert. Now wired through.
- `cms/pages/html-inverse.ts`: `EntryRefRow` imported from its owning `widgets/ports`.
- `agent-plugins/connect/connect-tool.ts`: `titleCaseFromPluginId` imported from `core/plugin-display-name` (Codex deleted the local copy, left 3 callers).
- `admin/screens/media/hooks/use-media.hooks.ts` **(runtime bug)**: cms `useGridPages`/`useMediaWrites` now take injected `useState`/`useCallback`; admin `useMedia` never passed them -> Media screen threw `useState is not a function` (red: `y5-admin-surfaces` media test; green after).
- `admin/screens/media/MediaEditChildren.tsx`: missing `agentHandle` import.
- Tests following moved exports: `FolderZipError` (core/folder-zip-error), `ownerPasskeyActionRoute` (passkey-routes), `bindKernelUserTrashAdapter` (kernel-user-trash-store), `AgentPluginUpdateSlot` (AgentPluginUpdateControl), cms media fixtures pass `createHash`, `MediaContentEditor` fixtures pass React hooks + `acceptedMediaItems`.
- `db/recovery/__tests__/tool-registrations.test.ts`: `ok: true as const` (strict typecheck; pre-existing).
- 3 test reds NEW vs merge-26: cms/core `package.json` `jini.entries` for 5 subpaths Codex exported without runtime metadata (all import nothing at runtime -> universal); cms navigation publish-content test injected the `src` `updateMenuTree`, whose conflict error is a different class from the `dist` `MenuConflictError` the retry checks.

### Jini — contracts no host binding could satisfy
- `cms/admin-http/routes/posts/template-preview-render.ts`: deps generic over the host's static-menu map (cms only carries it).
- `cms/admin-http/routes/plugins/install.ts`: `mountRaw` spec handle accepts http-kit's `{ signal }`.
- `cms/admin-http/routes/publish-content/peer-transport.ts`: `requestDeps` facts are a concrete overwrite gate (generic `Pick<Deps, Extract<…>>` was unsatisfiable; host cast removed).
- `cms/public-http/routes/site/pages/handlers/virtual-page.ts`: site-assistant selection `NonNullable`, like home/slug-routes.
- `cookie-consent/site/service.ts`: `ConsentDeploymentRefusal` is a type alias (satisfies `Record<string, unknown>` refusal bodies).
- `cms/react/media/ExternalProvidersPanel.tsx` (subagent): local provider port carries `applyProviderChanges` (ui's `MediaProviderRowsPort` requires it).

### Jini — gating the m26si SI-domain merges
- `admin` `y5-admin-surfaces` / `AccessTokensTab` tests: supply the newly injected deps with real implementations; complete `AccessTokenProviderInfo` instead of a cast.
- `admin/shell/components/AssistantDock/assistant-dock-props.tsx`: type-import alias (TS4078 declaration-emit: destructured `FolderPathButton` shadowed the type import).

### Tovu — runtime bugs (each red -> green)
- desktop `desktop-i18n.ts` (admin bug sheet 5): `pt-PT` fell back to bare `pt` (no row) -> English. Test-first commit `4fb919134a`, fix `f71c1ee578` via `@jini-ai/ui/core` `resolveSystemLocale`.
- website `composition/modules/media.ts`: `createHash` missing -> every admin upload/replace/import-url 500 (`upload-route.unit.test.ts` 5/6 -> 10/1; the 1 is pre-existing).
- website `composition/publish-content-manifest.ts`: contributors called with no bindings -> startup throw (`publish-content-manifest.test.ts` 0/21 -> 21/21).
- admin `features/plugins` "Choose a folder": `folder-zip` namespace has no `FolderZipError` -> `instanceof` TypeError on every refusal (new `folder-zip-port.unit.test.ts`).
- admin AssistantDock: resume-capable ref not injected -> inventory load/rescan threw (20 red -> green).
- admin other-credentials Remove button lost its label (`REMOVE_FROM_HOST` key rename) (9 red -> green).
- admin External MCP drift banner + Tools modal: `driftCopy` / `pickerCollaborators` key renames -> TypeErrors (5 red -> green).
- admin `media-panel.ts`: raw cms `useMediaProviderCatalog` had no React hooks -> every Media render threw (new `media-provider-catalog-wiring` test).
- admin page editor `useLivePreviewEmbedIds`: missing `useEffect`/`useState` -> every Page Editor render threw (new `live-preview-embed-ids` test).
- admin `WidgetPickerDialog.hooks.tsx`, `MediaContentEditor.tsx`: missing injected React hooks / `acceptedMediaItems` -> TypeErrors (existing tests red -> green).
- Fixed via tsc only (no separate red test, out of budget): visitor form attachment `createHash`, blob PUT `bytesMatchSha256`, email-template `PageConcurrentEditError`, post duplicate `copyBodyJsonWithFreshEmbedPlacements` + `contentPostReadToolId` ("Use undefined" copy), identity tool binders, site-export `fetch`, render-site layout/doc ports, slug-routes `checkSiteRelativeTarget`, response `injectFormAttemptTokens`, backup `findReservedPath`, member-login `parseLoginProviders`, publish-content import hooks/connect.
### Tovu — type-only
- website `features/mail-status/provider-tool-registrations.ts`: optional candidate description -> `""`.
- website `public-http/routes/commerce/purchase.ts`: drop core's (absent) `ports` slot before the http-kit mount (core and http-kit `JsonRoutePorts` disagree on `authenticate` args).
- admin `AccessTokensTab.tsx`: `customCredentialBaseUrlPlaceholder` = the pre-Codex literal `https://api.example.com`.
- admin `tsconfig.json` (subagent): `paths` dedupe for `react` types — two `@types/react` copies (Tovu 19.3.0, Jini 19.2.17) made every injected `useEffect` type-incompatible. **Owner sign-off** (alternative: one `@types/react` version across both repos).
- FILES LEFT: the two new host binding files were folded into existing host modules (`folderZipPort` -> `features/plugins/hooks/use-plugins.hooks.ts`; `useWiredMediaProviderCatalog` -> `features/media/hooks/media-dependencies.hooks.ts`).

## Merging the Codex SI branches (step 7)
- **Jini:** `m26si-aj`, `-dockj`, `-pagesj` and `-plugj` merged cleanly. Six admin type errors were fixed (see above), the build is green and the guard reports 0.
  - When I pushed, `git pull --rebase` flattened the 4 merge commits into cherry-picks (`cde3c07fb`..`1b312a538`). The tree is byte-identical to the gated merge `965ae7cc9`.
- **Tovu:** `tv-m26si-a`, `-dock`, `-pages` and `-plug` merged.
  - 3 conflicts were resolved by keeping this run's runtime fixes and taking Codex's new injections: AccessTokensTab ×2 and AgentPlugins.
  - Admin and website tsc are 0 after the merge, and the desktop gates pass 6/6.

## FILES LEFT
**855 / 0** (planner / true), 871 rules, at Tovu `4542cd8fef` / Jini `a9f58d6bc`. Method as in merge-26:

`cloud-results/count-25/count-files-left.sh /home/user/Tovu /home/user/Jini cloud-results/count-25/keep plans/count-1125/*keeps.md`

The two host binding files the subagents created briefly made true = 2. I folded them into existing host modules; no keep files were edited.

## Jini guard by rule
**0 violations.** merge-26 had 267: SI-domain 168, HW3 24, R14 18, N2 15, N1 14, N3 7, R13 6, L1 6, L3 6, L5 5, and R8/R5/HW8/HW4 1 each.

## Owner decisions needed
1. **chat P26:** should an empty AG-UI stream settle as an error, or as `runId: "ag:empty"`? Still red on both merge-26 and merge-27. Not decided here, as instructed.
2. **`@types/react` duplication:** Tovu has 19.3.0 and Jini has 19.2.17. The admin `tsconfig.json` now has `paths` entries that dedupe `react` types for the typechecker (vite/vitest already dedupe at runtime). Sign off on this, or align both repos on one version.
3. **`"tovu-peer"` publish-history kind:** now written in 3 Tovu places (the peer transport binding, `publish-history-repo.ts`, `publish-export.ts`) plus `publish-site.ts`. It wants one host constant, and the old cross-repo rename item is still open.
4. **devops `approvalToolHandler.describe(input, optional)`:** this differs from the mcp and user-management sibling ports, so the host has an adapter in `publish-agent-tools.ts`. Aligning the port would remove the adapter.
5. **`describeApiError` security change (`f4b1a25333`):** it returns the fallback for non-`ApiError`, and 6 WidgetPickerDialog hook tests (plus several media/pages tests) still expect raw error text. Decide which one is right. These failures were red on merge-26 too.
6. **`createHash` placement:** it is on the root route-deps bag in composition. The alternative is the per-feature host-binding pattern.

## Continuation (exact)
1. Website fixtures: `createHash` (192 tests) and the publish bindings (~195 tests), as described above. Then rerun `npm test`. It needs more than 40 min, so split it, e.g. `apps/website/src/features/**` and then the rest.
2. Fix the 2 new admin reds listed above.
3. Rerun the Jini suites for admin, cms, core and user-management on the m26si-merged tree.
4. Fix the rest of `typecheck:tests` (`NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.tests.json --noEmit`).
