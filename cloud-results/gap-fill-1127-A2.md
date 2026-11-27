PARTIAL run A2 | jobs 0/5 complete (5/5 advanced + pushed) | tests added 147 (124 it/test lines) | files 100% >=62/355 (25 new this run, all three axes) | bugs 0 | left: cms-3 ~45 files, misc-1 ~40 (branch-only), plugins-1 ~10 (branch-only + 3 owner items), ui-1 ~20 (branch-only), admin-8 ~35 (lists below)

# gap-fill-1127 run A2: continuation of run A (Jini TDD coverage gap fill, cloud, tests run)

This was an unattended cloud run on Opus at high effort, started 2026-11-27 at about 22:20 UTC. It continues run A (`cloud-results/gap-fill-1127-A.md`) and worked only on run A's "Left" lists, on the same `codex/w62-cov-<job>` branches. Every branch fast-forwards from run A's head. Nothing was redone or duplicated, and no test was removed. One file was renamed with `git mv` (see admin-8).

**Setup:**
- Node 24 (`/opt/node24`) and pnpm 10.33.2 via corepack.
- Jini: `pnpm install --frozen-lockfile`, then `pnpm -r build` at merge-28. The build was green in 3m21s.
- One git worktree per job, each with `pnpm install --offline` and the built `dist/` copied in.
- gitleaks 8.24.3. `gitleaks protect --staged` reported no leaks before every commit.

**Subagents:** 4, each `opus-high` with one job: cms-3, misc-1, ui-1 and admin-8. Each brief named the AI-Dev-Shop TDD skill files (read first) and honest-testing. I did plugins-1 myself. Subagents only committed; I reviewed each diff for banned patterns (`as any`, ts-ignore/expect-error, `.skip`/`.only`, the `tovu` string, production files, removed assertions) and did all the pushing.

**Guard rails I kept:**
- No `--no-verify`, no force-push, no RemoteTrigger, no codebase-memory tools.
- No config, threshold, guard, baseline or `.gitleaks.toml` edits.
- **No production code changes** in any job.
- packages/commerce and PageEditorChrome were not touched. The provider-credential vault/store (BUG 6) was not touched.

**Test count:**
- "Tests added" is what the subagents ran (`it.each` rows count once each).
- "it/test lines" is `git diff -M <run-A head>..HEAD` counting added `it(`/`test(` lines. Removed: 0 on every branch.

**Coverage method:** each "before" is run A's "after" (or the merge-28 brief number when run A gave none). Each "after" is a scoped run of the touched test files plus their neighbours, unless noted otherwise. Scoped runs can **undercount** files that other tests also exercise.

---

## w62-cov-plugins-1: `codex/w62-cov-plugins-1` @ `f1071151` (7 commits on `792a80cd`, pushed)

18 tests added, 0 removed. "After" is a **whole plugins suite run**: 103 files and 1231 tests with `--coverage.all` over the job's 37 files.

The run had 1 red: `host-entry-purity.test.ts` timed out at 60 s. It is **environmental**:
- Run alone, without coverage, it passes in 14 s.
- It timed out the same way on my baseline run, before any of my changes.

| file | before L/B/F | after L/B/F |
|---|---|---|
| host/capability-tools.ts | 92.7/94.4/95.8 | **100/100/100** |
| host/declarative-content-types.ts | 93.1/88.7/100 | **100/100/100** |
| host/admin-response.ts | 100/83.3/100 | **100/100/100** |
| react/plugin-install-port.ts | 100/66.7/100 | **100/100/100** |
| runtime/enable-confirmation-ui.ts | 100/94.1/100 | **100/100/100** |
| runtime/built-ins/word-count/plugin.ts | 100/75/100 | **100/100/100** |
| host/node/module-snapshot.ts | 96.7/94.5/95.2 | **100**/98/**100** |
| host/node/runtime-reload.ts | 98.8/80.6/84.2 | **100**/90.5/89.5 |
| host/node/runtime-activation.ts | 93.6/82.1/88.2 | 96.8/88.1/94.1 |
| host/provider-host.ts | 100/95.2/100 | 100/98.9/100 |

### Tests added, with the mutation that turns each one red
- **`capability-tools.extract-s6.unit.test.ts` (+4)**
  - A stored string that only looks like JSON (`{not json`) comes back verbatim. Mutation: the `decodeFieldValue` catch rethrows or returns undefined.
  - A post with no `ext`, or a non-object plugin bag, reads as "not yet written" (nulls plus the host note). Mutation: drop either `isRecord` narrowing.
  - Executable contribution tools attach to the dedicated registry and not the capability one. Checked through `authorizeToolInvocation`:
    - activation gates them
    - the executable permission goes out with `{entityType: 'extension', entityId: pluginId}` (exact)
    - the handler gets `{access: 'admin', principalId, workspaceId}`
    - disabling the plugin denies

    Mutations: drop the `isEnabled` read, change `executableAccess.permission`/`entityType`, change `access: 'admin'`, or prefer `registry` over `executablePluginToolRegistry`.
  - It falls back to the capability registry when that registry can `has`/`list`, and attaches nothing to a register-only port. Mutation: remove the `registry.has && registry.list` condition.
- **`declarative-content-types.extract-s6.unit.test.ts` (+4)**, each with exact messages:
  - non-boolean `required`/`queryable` flags
  - a bad or missing field name
  - 21 queryable fields refused, with exactly 20 accepted. This catches the bound changing from `>` to `>=` as well as dropping the check.
  - duplicate field names and duplicate type keys
  - an existing type lacking a declared field, which plans a conflict and writes nothing
  - an `undefined`/`null` list read as empty, a non-array list, and non-object entries and fields
  - tier-2 skipping the tier-1 code-surface rule

  Each mutation is removing the matching check.
- **`runtime-core.lifecycle-pin.unit.test.ts` (+2)**
  - A plugin declaring the before-save hook without attaching a filter gives `PLUGIN_HOOK_NOT_ATTACHED` and is not published. Mutation: drop `assertBeforeSaveFilterAttached`.
  - A failed publish (a contribution subscriber throws) gives `PLUGIN_HOOK_ATTACH_FAILED` with the original `cause`. The filter is detached, so a save no longer runs it, and re-enabling after the subscriber is gone works. Mutation: drop `hookRegistry.detach` in the catch, or drop the `cause`.
- **`module-snapshot-native-process.unit.test.ts` (new, 1):** this uses the default OS process probe. A snapshot owned by an unallocatable PID (ESRCH) is reaped, and one owned by this process is kept. Mutation: `isAlive` returning `true` (or `false`) on ESRCH.
- **`module-snapshot.unit.test.ts` (+1):** a site entry inside its package is imported from the verified copy held by a real `createPluginModuleSnapshotLifecycle`. The test checks the exported value, that exactly one `load-<host>-<pid>-` copy exists, and that the copy's bytes are correct. Mutation: skip the snapshot (import from `modulePath`), or ignore `optional.lifecycle`.
- **`runtime-reload.rollback-pin.unit.test.ts` (+2)**
  - This workspace reloads first, so a failed local load leaves another workspace's row on the approved version. **Checked:** removing the `enabled.sort(...)` turns it red.
  - A successful reload moves every enabled workspace to 0.1.1 and reports `reloaded: true`.
- **Other files:**
  - `plugin-install-transport.wire.unit.test.ts` (+1): a folder install hits `/install` with no `/preview`; a zip preview hits `/zip/preview?replace=true` with no digest, and its bytes are kept.
  - `word-count/plugin.test.ts` (+1 assertion): a draft with no body counts 0.
  - `l1c1.extract-s6.unit.test.ts` (+1): `providerSettings` appears only when some declared provider has at least one setting, and it is the last key.
  - `confirmation-ui.test.ts` (+1): a scoped enable produces exact access rows (previous state, revision, extra resources with scope), and a bare subject gets `null`/`[]` defaults.
  - `provider-contributions.unit.test.ts` (+1): an unknown contract is refused before the factory runs; `null` and `{port}` without `dispose` are refused; initialize after `dispose` gives "provider host is closed".

### Left in plugins-1
- runtime-activation 114-115 (no load target, which needs a site install with an invalid manifest on disk) and 218-220 (retaining browser providers through the runtime, which needs a site package with provider assets). Both need fs fixtures I did not build.
- Branch-only remnants:
  - archive-policy (77, 88, 90, 97-98, 107, 117)
  - runtime-conflicts (16, 32, 50)
  - provider-contributions (66, 150, 162)
  - contributions 94, package-files 296, worker/start 81
  - activation-polling 72 and 149-151, provider-revision-watch 31 and 67
  - management (several), install-source (runtime) 10-15, 32-34 and 46
  - import-policy 122, runtime-boot 46-47
- discovery 294-298 is probably unreachable (ids are lowercase-only).
- Run A's EXCEPTIONs still stand: `tools/contract.ts`, `tools/index.ts`, `hook-registry.ts:140`, and `runtime-core.ts` 102-108. `PluginProviderSettingsDialog` 139-141 still needs jsdom (owner decision).

---

## w62-cov-cms-3: `codex/w62-cov-cms-3` @ `be9b011a` (6 commits on `c15c8911`, pushed)

28 tests added, 0 removed. The cms `tsc -p tsconfig.json` passes and all touched files are green.

| file | before L/B/F | after L/B/F |
|---|---|---|
| media/site/import-media-entity.ts | 77.0/67.1/85.7 | 99.1/92.8/**100** |
| forms/tool-handlers.submissions.ts | 100/94.1/100 | **100/100/100** |
| media/site/view-video-tool.ts | 91.0/87.7/95.8 | **100**/98.0/**100** |
| media/site/rendition-access.ts | 88.6/78.0/93.3 | **100**/88.2/**100** |
| media/video-transcode.ts | 99.2/90.0/94.1 | **100**/94.3/**100** |

**Tests and mutations** (`it(` counts before → after):
- **import-media-entity (13 → 30):** the slug race (holder known and unknown), the insert race, the ABA fallbacks, a row deleted mid-flight, no source, blob key mismatch on the existing-row and put paths, the replacement refusals (missing, wrong version, wrong sha), no atomic replace, a lost compare-and-set, a slug conflict vs a rethrow, and the 5 `restoreImportedMedia` paths.
  - **Checked:** `holder?.id ?? "unknown"` → `"?"`; dropped `!blob ||`; dropped the version+1 check; `existingBlob.storageKey` check → false; the ABA message → `""`.
- **forms tool-registrations (14 → 15):** a listing with no limit pages 50. **Checked:** changing `SUBMISSIONS_DEFAULT_LIMIT` to 100.
- **view-video-tool (6 → 13):** the owned library video and frame naming, a missing blob or `sizeOf`, an unknown key or layout, negative frames, unreadable, oversized and non-video attachments, the 8 MiB total cap, and the per-frame cap.
  - **Checked:** `if (!blob)` → false; the frame name; removing the per-frame cap; `frames < 0` → `< -1`; dropping the `at` option.
- **rendition-access (2 → 3):** a placed widget gates the media. **Checked:** removing the `status !== 'active'` return; neutering the `deletedAt` guard.
  - Survivor: removing `!needsWidgets` (a work-skip only; no output changes).
  - One commit fixed a fixture status, `"inactive"` → `"trash"`, which tsc caught.
- **video-transcode (15 → 17):** the default Web Crypto error id and the trashed and missing-blob refusals. **Checked:** removing `getRandomValues`; `if (!blob)` → false.

**EXCEPTIONs:**
- `import-media-entity.ts:440-441`: `reviewed === undefined` is guarded by the caller.
- `import-media-entity.ts:316-317`: the non-`MediaSourceImmutableError` rethrow. `resolveWriteOnceSource` throws only that class (read, not exhaustively verified).
- `view-video-tool.ts:70`: `refs[0]` always exists when the length is 1.
- `view-video-tool.ts:201`: a missing frame is already caught at line 196.

**Left in cms-3:**
- `forms/tool-handlers.definitions.ts`: branches at 82-83, 91, 153, 187 and 189.
- Branches in `rendition-access` (48, 67, 123, 154-164, 355) and `video-transcode` (53, 105).
- Not started:
  - duplicate-asset (`isTaken`@121, branches 97, 98, 240, 241, 271)
  - blob-store.selection (76, 126, 140)
  - fs-files/tool-registrations, fs-files/write-files and media-service (493-513)
  - html-change-recording:102
  - media/site/publish-content (rest), import-video-conversion 157-169 and the view-image-tool branches
  - the provider-credential-store/vault branches (blocked by BUG 6)
  - every other branch-only file

---

## w62-cov-misc-1: `codex/w62-cov-misc-1` @ `4446c16d` (4 commits on `bbfd39bf`, pushed)

25 tests run from 20 new `it`/`test` lines (2 are `it.each` with 3 rows), all green, 0 removed. agent-runtime `tsc` (which includes the tests) is clean.

The 5 removed diff lines are 3 widened imports and 2 extended test-helper signatures. No assertion was removed.

| file | before L/B/F | after L/B/F |
|---|---|---|
| agent-runtime/src/runtime-port-bindings.ts | 96.8/94.4/48.6 | **100/100/100** |
| chat/src/core/util/validate.ts | 97.95/98.48/100 | **100/100/100** |
| agent-runtime/src/defs/antigravity/index.ts | 99.15/94.87/100 | **100/100/100** |
| chat ag-ui-transport.ts | 99.58 lines | 100 lines (line 257 covered; branch gaps remain) |
| chat frontend-invocation-handler.ts | lines 168-170 uncovered | covered |
| agent-runtime providers/tool-turn.ts | lines 381-383 uncovered | covered |
| agentic core/page-executor.ts | lines 513-514 uncovered | covered |

**Tests and mutations:**
- **runtime-port-bindings (10 → 25):** every forwarder, with its exact arguments.
  - **Checked:**
    - swapping the `...optional` order in toolchainBinDirs
    - reusing the bound support probe in `createSupportProbe`
    - dropping `...piGrace`
  - Reasoned:
    - drop `{ state }` in ensureCapabilities
    - drop the PATH hostEnv
    - drop the promptArgvBudget platform
    - swap the cmd-shim and direct-exe budgets
- **validate:** a second `@import` after a safe one or an unreadable one. Mutation: `break` after the first yield.
- **ag-ui-transport:** a detach before acceptance forgets the run. Mutation: delete line 257.
- **frontend-session-bridge:** an unclaimed capability gets "Capability unavailable", with no click. Mutation: drop the capabilityIds guard.
- **tool-turn:** a stale protocol `'cohere'` gives the exact TypeError and calls no adapter.
- **antigravity:** a plain-text line has its sign-in URL redacted and keeps its `\n`.
- **dom-page-driver:** three bad entity shapes are rejected before navigating. **Checked:** replacing the throw turns all 3 rows red.

**EXCEPTIONs:**
- `agent-runtime/src/providers/connection-test.ts:326-328`: a `never` default after the `isSupportedProtocol` gate.
- remotion-template assets (owner, from run A).

**REFACTOR candidate (owner):** `agent-protocol/acp/session-run.ts:461-467` (`recoverFromModelSelectionError`) is unreachable.
- `isRecoverableModelSelectionError` needs no model or the default model.
- But `setModelRequestId` is only set when a non-default model is requested.

**Left in misc-1:**
- `dom-page-driver.ts:703` ("Submission target changed"). A cloned submitter failed with `no element published`, so it may only be reachable by re-publishing under the same handle. This is a possible refactor candidate; no test was committed.
- ag-ui-transport branch gaps (about 141, 147, 191, 197, 218, 251, 298, 316, 355, 380, 391).
- json-line-stream 82-84 and recon-site.mjs 204-205, not re-measured.
- Every branch-only file in the brief, not started: models, session-permission, session, claude-*, diagnostics, model-catalog-live-discovery, native-*, credentials, runtime-strategies, css-url, analytics, chat core/react, ChatCleanupPanel (F 80) and others.

---

## w62-cov-ui-1: `codex/w62-cov-ui-1` @ `c7f6b36d` (2 commits on `4e624443`, pushed)

15 tests added, 0 removed, no production changes. ui `tsc -p tsconfig.json` (tests included) passes.

All 11 files below went to **100/100/100** (before L/B/F):

| file | before |
|---|---|
| charts/wire.ts | 100/94.6/100 |
| find/find-target.ts | 100/96.8/100 |
| mcp-ui/surfaces/outcome.ts | 100/97.4/100 |
| mcp-ui/surfaces/structured-details.ts | 100/99.2/100 |
| site-card/site-list-view.ts | 100/95.1/100 |
| utils/design-md.ts | 100/97.2/100 |
| live-views/use-site-view-preference.ts | 100/88.2/100 |
| panel-kit/hooks/use-bounded-status-poll.hooks.ts | 100/94.4/100 |
| site-card/SiteListToolbar.tsx | 100/90/100 |
| site-card/use-site-list-prefs.hooks.ts | 100/96.8/100 |
| react/components/PillButton.tsx | 100/85.7/100 |

**Tests and mutations** (`it` counts: catalog-manifests 14→15, series-label 3→4, find-target.dom new 0→1, use-site-view-preference 4→6, outcome-cancellation 3→4, structured-details 12→13, use-bounded-status-poll 6→7, site-card.unit 9→10, site-list-view.unit 18→20, use-site-list-prefs 12→13, hook-injection 9→10, design-md 26→27):
- **Checked:**
  - catalog-manifests: drop `Number.isFinite`
  - series-label: the humanize fallback
  - site-list-view: the id tie-break `|| 0`
  - design-md: drop `|| match[1]!`
  - use-site-view-preference: drop `if (!active) return`
  - use-bounded-status-poll: drop `if (cancelled) return`
  - PillButton: the agent label
- **Reasoned:**
  - the oldest-first name tie-break
  - find-target: removeAllRanges
  - the structured-details dash
  - the snapshot clamp
  - SiteCardPin fill
  - the bare-string rejection
- **Equivalent mutant noted:** in outcome, `?? null` → bare survives, because the script treats `undefined` the same.

**EXCEPTIONs:**
- `integrations/rules.ts:211-212`: an `unhandledCase` tail; `methodLabelForClient` throws first.
- Candidate: `mcp-ui/surfaces/fields.ts:82-83`, an `unhandledCase` tail reachable only through a cast. No fake test was written.

**REFACTOR candidates (owner):**
- `charts/catalog-manifests.ts:28`: the `load` closure is never called.
- `tab-strip/scrollable.ts:58`: an unreachable defensive throw.

**Left in ui-1:**
- InfoTip.hooks: branches 31, 36, 84, 86, 93, 96 and 118, and the `follow` function (121).
- use-cursor-pages: 67, 78, 89.
- use-optimistic-stored-value 50-55: an equivalent guard, with no honest test as written.
- NumberStepper `onFocus` (64), SketchEditor 181 (dependencies fallback), TabStrip 85 and useTabStripDragReorder 73 and 77.
- Not started (branch-only): ExecutionTab.hooks, useReasoningControl, execution/rules, editor-blocks, shadcn select, useMediaProvidersTab, useMentionAutocomplete, useProjectLocationsTab, select-popover, trim-chars.

---

## w62-cov-admin-8: `codex/w62-cov-admin-8` @ `6482b5f9` (5 commits on `f27a1680`, pushed)

61 tests added (47 `it` lines by diff grep), 0 removed, no production changes.
- admin `tsc -p tsconfig.json` (tests included) passes.
- The 7 touched test files pass together: 62/62.
- Run A's `access-token-add-replace-actions.unit.test.tsx` was renamed with `git mv` to `access-token-actions.unit.test.tsx`, because it now drives all three action modules. Its assertions are unchanged (one import widened); its tests go from 15 to 24.

| file | before L/B/F | after L/B/F |
|---|---|---|
| security/host/access-token-actions.ts | 50.5/55/62.5 | 100/91.7/100 |
| security/host/access-token-state.hooks.ts | 81.8/88.9/87.5 | **100/100/100** |
| security/host/access-token-store-operations.ts | 85.7/69.6/66.7 (run A) | 100/64/100 (actions test only) |
| other-credential-store-operations.ts | 60/81/68.8 | 91.4/87.8/100 (own file only; the rest is run by y5-live-secrets) |
| use-other-credentials.hooks.ts | 89/85.7/91.7 | 100/95.2/100 |
| taxonomy/use-taxonomy.hooks.ts | 64.6/100/41.7 | 100/97/100 |
| taxonomy/use-term-picker.hooks.ts | 0/0/0 | 100/94.6/93.1 |
| taxonomy/use-term-list-reveal.hooks.ts | 85.7/100/50 | **100/100/100** |
| voice-input/push-to-talk-state.hooks.ts | 76.5/50/8.3 | **100/100/100** |
| voice-input/mic-button-view.hooks.ts | 78.6/100/50 | 100/90/100 (line 52 is covered by an existing test) |
| voice-input/voice-input-config.ts | 0/100/100 | **100/100/100** |

**New test files** (with their `it` counts): `other-credentials.unit.test.tsx` (6), `use-term-list-reveal.unit.test.tsx` (3), `use-taxonomy-delete.unit.test.tsx` (9), `use-term-picker.unit.test.tsx` (9), `push-to-talk-state.unit.test.ts` (9) and `use-mic-button-view.unit.test.tsx` (2).

**Mutations, all checked (each turned at least one test red):**
- access-token-actions:
  - the `customKeyPending.has` guard
  - reconcile `catch` → `finally`
  - inverting `kind === "publish"`
  - the `isDefault` guard
- other-credential-store-operations:
  - the `!builtIn` filter
  - the catalog `.catch(() => null)`
  - `patchMediaProvider` given `storeId` instead of `itemId`
  - the MCP delete
- use-term-list-reveal: `setPinned`
- push-to-talk-state:
  - the cancelling transition
  - the shared indicator object
- mic-button-view: the memo deps
- use-taxonomy:
  - the 404 `refetch`
  - the term and taxonomy selection guards
  - `requestDeleteTerm` clearing the blocked state
- use-term-picker:
  - reusing an existing term
  - the IME guard
  - the `contentId` effect deps
  - typing clearing createTarget

One "partial tick" mutation was not applied (sed miss); its assertion should still catch it.

**Dropped before commit (honest-testing):** a use-taxonomy test for line 152 whose mutant survived.

**EXCEPTION:** `use-taxonomy.hooks.ts:152`. The `instanceof Error` narrowing only satisfies a parameter type; through the kit's `isApiError` the mutant is equivalent.

**Left in admin-8:**
- Branch remnants:
  - access-token-actions 52-55, 87 and 133-134 (`?? []` fallbacks)
  - use-term-picker 285, 297, 371 and 375
  - store-operations branches (64%)
- Trash.tsx 184-191 and 301-303.
- widgets/index, security-i18n (testable as i18n invariants), SeoIcons and AdminByokKeyPanel.hooks.
- Security host components: AccessTokenRows, Fields, Groups, Tab and Dialogs.
- AssistantDock: DockLeadingAccessory, FolderDropNotice, FolderDropPathHint, SubagentsIndicator, DockHeader 136-140, DockHeaderTip.hooks 45-46 and FolderDropConfirmation 40.
- use-access-tokens.hooks 290-296 (`bindAccessTokens`).
- Every branch-only file in the brief.
- The known `y5-live-secrets.test.tsx` red ("<AdminKitProvider>") is pre-existing and was not touched.

---

## BUGs
None new this run, and there were no production changes. Run A's BUG 6 (cms `provider-credential-vault.ts:35`, the `findOne` contract) is still **open** and was deliberately left alone. `development/open-bugs.md` is unchanged.

## For the owner to decide
1. Still open from run A: BUG 6; plugins `runtime-core.ts` 102-108 (refactor or EXCEPTION); jsdom for `@jini-ai/plugins`; the remotion template EXCEPTIONs; `CustomSelectMarkup.tsx`.
2. New refactor candidates (unreachable code that cannot be tested honestly):
   - agent-runtime `acp/session-run.ts:461-467`
   - ui `charts/catalog-manifests.ts:28` (`load` is never called)
   - ui `tab-strip/scrollable.ts:58`
   - agentic `dom-page-driver.ts:703` (to be confirmed)
3. EXCEPTION candidates via `unhandledCase` tails: ui `mcp-ui/surfaces/fields.ts:82-83` and `integrations/rules.ts:211-212`.
4. **Pre-existing product-name text in Jini tests** (not mine; I did not touch them):
   - `packages/plugins/src/host/__tests__/unit/module-snapshot.unit.test.ts` uses the temp prefix `"tovu-module-snapshot-"`.
   - `packages/plugins/src/host/__tests__/unit/provider-contributions.unit.test.ts` declares the manifest `extensions: { tovu: … }`.

   These break the "no product name in Jini" rule.
5. `host-entry-purity.test.ts` runs for 14 s alone, and over 60 s (its timeout) under whole-suite coverage on a 4-core box. It may need a CI-only timeout look.

## Continuation
For each job, keep working the "Left" lists above on the same branches. Subagent context ran out at roughly 50 tool calls each, so plan one subagent per sub-area (for example, admin-8 security host components separately from AssistantDock).

Scoped coverage: `npx vitest run <tests> --maxWorkers=2 --coverage.enabled --coverage.all=false --coverage.include=<file>…`. For plugins, the whole suite is about 2 min with coverage; exclude or re-run `host-entry-purity` alone.
