PARTIAL T c571d021ae J c0b88b83 | FILES LEFT 855/0 | left: Tovu website tsc 19 (13 carried from merge-25 + 6 new), Tovu admin tsc 6 (new), Jini guard 267 rows (merge-25: 181), typecheck:tests + typecheck:e2e not run, full Jini/Tovu suites not run, 2 new red tests from bugd (platform guarded-reader)

# MERGE-26: test and fix the finished Tovu->Jini extraction (y5) plus tonight's bug fixes (2026-11-26)

This was an unattended cloud run. The coordinator ran on Opus (high). It read `AI-Dev-Shop/agents/programmer/skills.md` (v1.7.5) first.

- **Subagents:** 4, which is the cap. Three were Opus-high: cms; agent-plugins/mcp/admin/chat; and Jini admin plus Tovu admin. One was Sonnet: user-management, devops, cookie-consent and integrations.
- **Rules kept:** no codebase-memory tools, no RemoteTrigger, no `--no-verify`, no force-push, no tag and no publish. `main`, `release/*`, merge-24 and merge-25 were not touched.
- **Environment:** Node 22.23.5 (the repo pins 24, so you get engine warnings only).
- **Tovu install:** `npm ci --ignore-scripts --legacy-peer-deps` was run at the root and in apps/admin, site-chat and desktop. The contracts `prepare` script was suppressed during install only and then restored; it was never committed.
- **Electron:** the binary was fetched with `node node_modules/electron/install.js`.
- **Link step:** `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini`, then contracts and sdk were built with `tsc`.

**Branches:** `integ/merge-26-2026-11-26` in both repos.

**Bases:** Jini `origin/codex/y5-bugsj` (a6a2c60c) and Tovu `origin/integ/y5-bugs-2026-11-26` (bc262146).

**Base-only green state, pushed before the bugd merges:** Jini `f3860f74`, Tovu `ad077c9c`.

**Push hook:** this container has no git hooksPath, because `prepare` was not run, so the push did not trigger the gates itself. Instead, `npm run gates` (apps/desktop) was run by hand and passed 6/6 immediately before each Tovu push: on `ad077c9c`, and on the bugd merge.

## Gates: NEW vs merge-25

| gate | merge-25 | merge-26 now | note |
|---|---|---|---|
| Jini `pnpm -r build` | green | **green** | y5 base: 118 errors in 9 packages. After admin's syntax repair: +24. After the bugd merges: +7. All fixed. |
| Jini guard | 181 | **267** | SI-domain 168, HW3 24, R14 18, N2 15, N1 14, N3 7, R13 6, L1 6, L3 6, L5 5, R8/R5/HW8/HW4 1 each. All come from the y5/bug slices' new modules, and none was added by a fix in this run. |
| Tovu root `tsc` (website + e2e) | 31 | **19** | 13 carried from merge-25 (purchase ×3, post ×2, publish-agent-tools ×2, project-store, virtual-page, template-preview-render, protect-existing-files, domain-publish-tool, mail-status). 6 NEW: peer-transport ×2, publish-site, plugins/install, mount-admin-system, import-database repo.sqlite. Count went 52 → 42 → 36 → 20 → 19. |
| Tovu admin `tsc` | 0 | **6** (NEW) | Down from 78. Remaining: AssistantDock.tsx:80 (`mcpUiToolCaller` return), AccessTokensTab.tsx:50 (label `string \| undefined`), SettingsUi.tsx:201 (`KitDictionaries` one more site), and 3 tests (use-other-credentials:680 delete envelope literal, use-external-mcp:866 `restartRequired` in the mcp port, credential-input-autocomplete:350 `useMediaProvidersTabHook` prop). |
| desktop `npm run gates` | not run | **6/6 PASS** | Passes on the base and on the bugd merge. One run in between failed `tests` under CPU contention (guard was running in parallel). A rerun of the suite (2176 + 739 pass) and a rerun of the gates on their own were green. |
| Tovu `typecheck:tests` / `typecheck:e2e` | not run | **not run** | Out of budget. Root `tsc` already includes e2e, through `npm run typecheck`'s first half. |
| Jini changed-package tests | partial | **targeted only** | Every touched test file was run. The reds are listed below. |

### Known red tests (not fixed; all present in merge-25 or authored by the slices)
- **chat `durable-run-subscription.paths` P26:** an empty AG-UI stream settles as an error. The test expects `runId: "ag:empty"`. Two merged branches disagree here and someone needs to decide.
- **user-management:**
  - `identity-authorization`: the test expects `/OWNER_REQUIRED/`, but the code throws "only an owner can modify an owner principal". This was in merge-25.
  - `user-trash-adapter` blocked purge: `mockRejectedValue` replaces the fixture that records `"guard"`. This was in merge-25.
- **cms `media/site/publish-content` ×2:** the write throws `MissingMutationActorError` before the expected `MediaApplyBlockedError`.
- **db `recovery/tool-registrations`:** "a malformed internal confirm result must not proceed". This was in merge-25.
- **admin:** `y5-live-secrets` and `y5-admin-surfaces` "plugin Add falls back" each render without `<AdminKitProvider>`.
- **platform `guarded-reader.binary` ×2:** new tests from a bugd branch fail their close-count assertions.

## Fixes (file: why)

### Jini, y5 base build (subagents; full detail is in each commit message)
- **cookie-consent `b4dd7fd9`:**
  - `DocumentState.client` is now `?: … | undefined`, because the client bundle can fail to load.
  - The collector adapter is now typed as a readonly record, which fixes a weak-type error.
- **user-management `f4f3f1f6`:** `UserTrashTables` is now a `type` alias, so it gets the implicit index signature. The passkey-admission fake is fully typed.
- **devops `2582c5af`:**
  - Exported the inferred hook types (TS4058).
  - `runStatusTone` now has `ok?: … | undefined`.
  - The backup tool's `parseStaticExportInput` is now a port without a policy, because the wiring layer never had one.
  - Added the missing `@testing-library/react` devDependency and the jsdom pragma.
- **integrations `0497064b`:** the test no longer imports devops (that would be a workspace cycle). The builders are injected `vi.fn()`, with stricter `not.toHaveBeenCalled()` assertions.
- **chat `7303041e`:** the durable binding fake has the required `cancelPendingRun`.
- **agent-plugins `0247750e`:**
  - The catalog is typed `AgentToolDefinition[]`.
  - Exact-optional spreads.
  - **Runtime bug:** upload preview handed the engine the host's zero-arg archive reader. Install and preview now share one adapter.
- **mcp `3789d640`:** DOM lib for the React surface, exact-optional labels, and a typed generic mutation fake.
- **cms `1e0340dd`, `db23b405`:**
  - `PostTables` is a type alias (this cleared 17 errors).
  - Exact-optional ports and test fixtures typed to the production ports.
  - **Runtime bug:** in MediaContentEditor, clearing alt or caption left the key on the item as `undefined`. It now removes the key.
- **admin `77b9c897`, `4aaad2a5`, `06e71ee3`:**
  - Restored the test closers that a merge dropped.
  - `isDevMode` is injected (required) instead of reading `import.meta.env`.
  - Added the `MediaController` import.
  - Exact-optional fixes.
  - `KitDictionaries` for the plugins and providers dictionaries.
  - The delete path now returns core's `ExternalMcpDeleteEnvelope`.
  - cms `useTabBarKeyboard` uses a `<div>` event type.

### Jini, host seams found from the Tovu side (coordinator)
- `cms/media/site-import/bindings.ts`: the media-import client is now an opaque `send`-capable handle. cms only forwards it to the host's `fetchImage`; the core object-arg port and the host's positional port could never both be satisfied.
- `cms/.../handlers/marketing.ts`: the site-title resolver and the extra-head input are `string`, which matches the host and the shared builder.
- `cms/media/site-generation/tool-registrations.ts`: `bindMediaGenerationTools<TRegistry>`, so the host's registry type flows through instead of `object`.
- `agent-plugins/site/install-upload.ts`: the upload binder always passes the host's full `AgentPluginLayout`, so its lifecycle ports accept a host lifecycle that requires one.
- `agent-plugins/connect/host-deps.ts`: `projectMcp`/`mcp` take `AgentPluginMcpContext`, where projections come with their classifier or not at all.
- `agent-plugins/connect/new-site-agent-plugin-tokens.ts`: imports from its owning modules, not the package barrel. This fixes merge-25's red `relative-imports` test.
- `db/recovery/tool-registrations.ts`: the binder is generic over the host gateway deps, because it only forwards them to the injected gateway functions.
- `cms/posts/sql/repo.ts`: named `SqlPostRepoRuntime`. A private member's type is erased from the d.ts, which left the host's `hashJsonText` callback as implicit `any`.
- `user-management/identity/sql/kernel-user-trash-store.ts`: `db`/`kernelFor` are Kysely kernels, because the adapter queries through `withTables`.
- `devops/backup/site/backup-service.ts`: the picker slot is `typeof pickSourceControlProviderForApi<SourceControlProvider>`.
- `cms/site-inspection/tool-registrations.ts`: `publishedPageDeps` omits the two fields the binder supplies itself.
- After the bugd merges:
  - The duplicate `retentionDays` in the cms grid hook was removed. bugd-adminj owns it: trash tab, page one. The merge-26 any-tab version and its assertion were dropped.
  - The fixtures follow the new required `transaction` and `maxJsonUploadBytes`.

### Tovu
- `website/features/asset-transfer/asset-sources.ts`, `features/theme/import-theme-file-tool.ts` and `assistant/tool-registrations.ts`: they narrow cms's opaque media-import handle to the host's `HttpClientPort`.
- `website/.../http/site/render-site.ts`: `?? undefined`, because the static renderer returns null and the engine wants undefined.
- `website/.../modules/assistant-byok.ts`: `prepareGuidance` takes one argument, per the engine contract.
- `website/features/agent-plugins/connect-sign-in-wait.ts`: the skipped result is typed as the full connect result. Without that, generic inference narrowed it to `not-connected`. This error was in merge-25 and blocked the desktop typecheck.
- `website/features/media-generation/tool-registrations.ts`: `bindMediaGenerationTools<MediaProviderRegistry>`.
- `website/features/site-backup/share-database/repo.sqlite.ts`: the kernel is opened with a per-table map type, with no cast. This error was in merge-25.
- `website/features/site-inspection/tool-registrations.ts`: the cast was dropped. This error was in merge-25.
- `website/.../site-deps/trash-adapters.ts`: `schemaErasedKernel` at the user trash binding.
- `desktop/src/site-dir-store.ts` **(bug):** `deliverTokens` used `finished(stdin)`, which on a duplex stream also waits for the readable side. Since y5, every init pipes stdin (the generated admin password), so a duplex stdin that nobody reads hung the create. 46 desktop tests hung for this reason. It now uses `{ readable: false }`.
- `desktop/src/desktop-agent-runtime.test.ts`: inventory IPC has been top-frame-only since y5, so the fixture event now carries `senderFrame: { parent: null }`, like desktop-chat-main.test.
- `admin` (subagent, `ff9fb35b`): `sizeRefusalFromError` returns `null`, and `isDevMode: import.meta.env.DEV` is injected.
- Merge conflict `assistant-composition-size.test.ts` (tv-bugd-rules): both size tests kept (BYOK files and visitor files).

## bugd branches
- **Jini, all merged cleanly:** `codex/bugd-deskj` (changeset only), `bugd-adminj`, `bugd-dataj`, `bugd-mediaj`, `bugd-rulesj`, `bugd-secj`. This took the build to 7 errors, all fixed in `c0b88b83`.
- **Tovu, all merged:** `codex/tv-bugd-admin`, `-data`, `-media`, `-rerr`, `-rules` (1 test conflict, both tests kept) and `-sec`. Gated: desktop gates 6/6 PASS, root tsc 19, admin tsc 6.
- No bug sheets were built here; Codex owns them.

## FILES LEFT
**855 / 0** (planner / true), 871 rules, at Tovu `c571d021ae` / Jini `c0b88b83`. merge-25 was 882 / 97.

Method: `cloud-results/count-25/count-files-left.sh /home/user/Tovu /home/user/Jini keep plans/count-1125/*keeps.md`. All 11 keep files were used, including the y5 ones.

## Bugs (also in `development/open-bugs.md` -> "MERGE-26")
- **FIXED, runtime (desktop):** site create could hang forever on a duplex stdin (`site-dir-store.ts` `deliverTokens`). Details are above.
- **FIXED, runtime (Jini agent-plugins):** upload preview's `createLifecycle` received the host's zero-arg archive reader without the adapter.
- **FIXED, runtime (Jini cms):** clearing a media alt or caption kept an `undefined` key.
- **FIXED, type-level host seams (13):** the Jini contracts could not be satisfied by any host binding. The list is above.
- **OPEN:**
  - Guard 267 rows.
  - Jini still has "tovu" text: 14 N1 rows, mostly comments. Code identifiers are the persisted `"tovu-peer"` publish-history kind (merge-25's open G2 item) and `REMOVE_FROM_TOVU` (integrations). Both need a coordinated cross-repo rename.
  - Tovu tsc 19 + 6 and the red tests listed above.
  - Desktop gate `tests` is timing-sensitive under CPU load. One flake was seen.

## Continuation (exact)
1. Fix the 6 admin tsc errors in the order listed above. Each is a one-line binding or type change, plus mcp `saveExternalMcpServer` returning `restartRequired`.
2. Fix the 6 new website tsc errors:
   - peer-transport: the history kind generic, and `requireOverwriteSession`.
   - publish-site: `ConsentDeploymentRefusal` to a record.
   - plugins/install: the handler's optional `{signal}`.
   - mount-admin-system: incident status `503|507`.
   - import-database: `ShareQueryHandle` kernel. Use the same per-table-map open as share-database.
3. Run `npm run typecheck:tests` (per app if OOM) and the full Jini suites, one at a time, and compare with the reds above.
4. Guard: reclassify SI-domain as merge-24 `d0d8f392` did, instance-own HW3, and split the R14 cycles.
