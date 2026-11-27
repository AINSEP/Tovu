PARTIAL run A | jobs 0/5 complete (5/5 pushed with partial progress) | tests added 432 | files 100% >=37/355 (all three axes; more at 100% lines) | bugs 6 (5 fixed, 1 open) | left: cms-3 ~60 files, misc-1 ~55, plugins-1 ~20 (branch-only gaps), ui-1 ~40, admin-8 ~65 (lists below)

# gap-fill-1127 run A: Jini TDD coverage gap fill (cloud, tests run)

This was an unattended cloud run on Opus at high effort, started 2026-11-27 at about 20:40 UTC. I followed the brief `ADS-memory/reports/cloud-runs/briefs/gap-fill-1127.md` with its cloud overrides.

**Setup:**
- Node 24 at `/opt/node24`.
- Jini: `pnpm install --frozen-lockfile` (12 s), then `pnpm -r build`. The build was green in 2m36s.
- One git worktree per job under `/home/user/wt/<job>`, each with `pnpm install --offline` and the built `dist/` copied in.
- gitleaks 8.24.3 installed. `gitleaks protect --staged` reported no leaks before every commit.

**Subagents:** 4, all Opus at high effort, one job each: cms-3, misc-1, ui-1 and admin-8. I wrote plugins-1 myself. Only I pushed.

**Guard rails I kept:**
- No `--no-verify`, no force-push, no RemoteTrigger, no codebase-memory tools.
- No ts-ignore or expect-error, no `as any`, no skipped tests.
- No config, threshold, guard, baseline or `.gitleaks.toml` edits.
- No `tovu` text in Jini.
- packages/commerce and PageEditorChrome were not touched.

**Test count:** "tests added" counts `it(`/`test(` lines added against `origin/integ/merge-28-2026-11-26`. It includes Codex's partial tests on cms-3 and misc-1, which were untested before this run and are now run and fixed. The diffs remove 0 tests. One `test(` line on cms-3 shows as removed, but that test was rewritten with a valid fixture field, not deleted.

**Production changes:** only for proven bugs, each 5 lines or fewer, each with the failing test written first. There are 5 (see BUGs).

**Coverage method:**
- "Before" is the merge-28 number in each job brief.
- "After" for **plugins-1** is a run of the whole plugins suite: 102 files, 1213 tests, all green, `--coverage.include` set to the job's 37 files. It is comparable to "before".
- "After" for the other four jobs is the subagent's scoped run: only the touched test files plus the neighbouring `__tests__` folders. It may **undercount** files that tests elsewhere also exercise.

Per-test mutation notes are in each job section, and in full in the subagent ledgers (`cloud-results/gap-fill-1127-A/ledger-*.md`). Most mutations are reasoned, not run. The ones that were actually executed are marked "checked".

---

## w62-cov-plugins-1: `codex/w62-cov-plugins-1` @ `792a80cd` (11 commits, pushed)

There was no prior Codex branch, so this one starts from merge-28. 84 tests added, 0 removed, and the whole plugins suite is green.

| file | before L/B/F | after L/B/F |
|---|---|---|
| host/activation-polling.ts | 61.8/97.4/83.3 | **100**/94.4/**100** |
| host/node/integrity-command.ts | 25/100/0 | **100/100/100** |
| host/node/runtime-package-location.ts | 47.8/100/50 | **100/100/100** |
| host/node/runtime-boot.ts | 58.3/38.1/45.5 | 98.3/84.3/81.8 |
| host/node/runtime-load-target.ts | 94.1/85.7/100 | **100/100/100** |
| host/worker/import-policy.ts | 91.2/80/100 | **100**/87.5/**100** |
| host/node/runtime-core.ts | 85.5/85.2/63.6 | 95.2/94.3/86.4 |
| host/provider-revision-watch.ts | 88.1/88.2/80 | **100**/90.9/**100** |
| host/tools/install.ts | 0/0/0 | **100/100/100** |
| host/tools/source.ts | 0/0/0 | **100/100/100** |
| host/tools/management.ts | 0/100/100 | **100**/95.3/**100** |
| react/PluginProviderSettingsDialog.tsx | 0/0/0 | 95.8/100/92.3 |
| runtime/plugin-tool-ids.ts | 0/100/100 | **100/100/100** |
| runtime/plugin-tool-messages.ts | 76.6/75/80 | **100/100/100** |
| runtime/sdk-resolver.ts | 46.2/100/33.3 | **100/100/100** |
| runtime/install-source.ts | 94.2/70.4/100 | **100**/75.9/**100** |
| the other 21 files | unchanged | see `coverage-summary` in the run |

### Tests added, with the mutation that should turn each one red

**`host/__tests__/unit/runtime-package-location.unit.test.ts` (new, 18 tests)**
- Mutations to `resolvePackageLocation`, each caught: dropping the built-in `sourceDir` lookup, the `installDir === undefined` null, the id or version allowlist (5 unsafe cases), or the `rootDir`/`containerDir` join.
- Mutations to runtime-core `readPluginPackageFiles`, each caught: dropping the null-location early return, or the "no installDir" error (exact message).
- Changing the ENOENT-only swallow in `locatePluginPackageDirs` (ENOTDIR must propagate) is caught.
- Mutations to `runPluginIntegrityCommand`, each caught:
  - writing when `write` is unset
  - keeping the manifest inside the map
  - reading the legacy name only when present
  - leaving the `.tmp-` file behind
  - dropping the default stdout
- **Checked:** the module had 0% function coverage before, and every case runs it.

The same file also has 2 `resolveLoadTarget` tests. Caught: dropping the built-in `packageRoot` spread, the importer, the site `siteEntryPath`, or the `null` for a site without an install folder or manifest.

**`host/worker/__tests__/import-policy.unit.test.ts` (+1)**
- A missing entry keeps its plain path, but ENOTDIR is thrown. Caught: swallowing every realpath error, or rethrowing ENOENT.

**`host/__tests__/unit/activation-polling.unit.test.ts` (+5 tests)**
- Seeding only this workspace's enabled rows: caught if the workspace or enabled filter is dropped.
- Default 5000 ms interval, and passes queued before readiness: caught if `?? 5000` is changed or the seed is skipped.
- `stop()` while a pass is reading: caught if either `!stopped` guard in `pollingDeps` is removed (attach and detach have separate tests).
- Readiness failure logged on every tick: caught if the `.catch` logging is dropped.
- **BUG, checked:** removing the new `seeded.catch` makes vitest report an unhandled rejection, and the run fails.

**`host/__tests__/unit/runtime-boot.providers.unit.test.ts` (new, 7 tests)**
- An empty request reads nothing (caught: removing `wanted.size === 0`).
- Only requested, enabled, provider-declaring plugins load (caught: dropping any of the 3 filters).
- `listProviderPlugins` returns only enabled providers.
- A throwing setup is isolated and revoked, and the exact log line is checked (caught: removing the catch or `onPluginDisabled`).
- A deadline-bounded stalled provider resolves before setup does (caught: removing the `Promise.race`).
- Boot re-attach skips provider plugins (caught: dropping the `declaresProviders` return).
- Boot conflict quarantine durably turns one plugin off and logs it (caught: dropping the `quarantinePlugin` call).
- A failed conflict pass attaches nothing (caught: removing the fail-closed `return null`).

**`host/tools/__tests__/install-source.unit.test.ts` (new, 16 tests)**
These import `install.ts` and `source.ts` from source. The existing public-entry test only reaches them through `dist`.
- Install, each caught:
  - the call-order chain authorize → parse → input → preview → install with `expectedDigest`
  - the `upgradeFrom` spread
  - the disabled/no-installer gate
  - a denied permission stopping before parse
  - a preview `PluginInstallError` becoming `ToolInputError` while other errors are rethrown by identity
  - `throwIfAborted`
  - the retry hint only for `PLUGIN_CHANGED_SINCE_PREVIEW`
  - refused vs internal telemetry
  - the risk map
- Source, each caught:
  - every operation's port arguments
  - per-catalog permission
  - field-type errors
  - `replaceAll` validation
  - reporting the missing owner first
  - the relay of both refusal classes
  - deletion pinned to the prepared digest, after asking
  - a decline deleting nothing
  - the risk map

**`host/tools/__tests__/management.unit.test.ts` (new, 29 tests)**
- List, each caught: the projection of enabled vs OFF rows, the inactive agent-plugin path, the exports-catalog failure fallback, the `version ?? null`, isolating a failed agent-plugin half, and `requireNoInput`.
- set-enabled input errors, caught: the `readFamily` and boolean checks.
- Site-runtime, each caught:
  - the exact consent-card subject and scope
  - the approval recorded with the capability set
  - the gateway command summary and permission
  - the toggle telemetry, only on a change
  - the decline result
  - `PLUGINS_STALE_APPROVAL` when the fingerprint changes
  - a missing plugin refused before asking
  - a disable that does not ask but lowers tool access
  - abandoned-after-confirm
  - gateway rollback restoring the prior row and its hooks, or deleting a fresh row
- Agent plugin, each caught:
  - provisioning with the approved access key
  - previous-enabled read in strict mode
  - the revision string including the access key
  - recording a decline only for a real decline
  - the not-installed error
  - all 4 pre-flight refusal results (exact objects, plus the redacted `console.warn`)
  - an unclassified pre-flight error propagating
  - the linked face, and a link read that fails being ignored
  - host incompatibility
  - write-failure classification (not-installed, linked, update, rethrow)
  - a disable that does not provision
- Uninstall, each caught:
  - agent delegation
  - the site sequence auth → ask → re-auth → remove, with the display
  - a decline
  - changed-since-confirmation
  - a built-in refused before any dialog
  - the family being required
  - the risk map

**`react/__tests__/PluginProviderSettingsDialog.unit.test.tsx` (new, 11 tests)**
This uses react-dom/server with a recording kit, because the package has no jsdom.
- Each caught: the subtitle for each of the 4 store states, both re-entry notices, `handleWords` (camelCase and `_`), effective values (saved secret, default, trim), the inputs to the required rule, `setValue`, the saved-key action condition and its accepted/refused hand-off, submit calling `preventDefault` with `onSaved` only when accepted, the saving state (pending, disabled, spinner), the error line, and closing.
- `useProviderSettingsFocus` (lines 138-140) is **left uncovered**. It needs a DOM renderer, and adding jsdom to `@jini-ai/plugins` devDependencies would be a lockfile change.

**`runtime/__tests__/plugin-host-copy.test.ts` (+5 tests)**
- Caught: changes to each `restartNote` family/direction branch, the non-pending update text, `changedSinceConfirmation`, both directions of the unreadable/busy notes, `installedNote`, and `retryInstallHint`.
- An invariant test: the `plugin-tool-ids` tables must equal the catalog tool names.

**Other files**
- `runtime/__tests__/install-source.test.ts` (+1): an owned attachment returns its bytes, an oversized one is refused, and a missing reader is "unavailable".
- `runtime/__tests__/sdk-resolver.in-process.test.ts` (new, 1): the process marker is set once, and a second call throws the named error with its exact message. The redirect itself stays covered end to end by the child-process suite.
- `host/__tests__/unit/provider-revision-watch.unit.test.ts` (+1): the default schedule polls every 30 s and `stop()` clears it. Caught: changing the `POLL_INTERVAL_MS` use, or `clearInterval`.

### EXCEPTIONs
- `host/tools/contract.ts` lines 4-9: a type-only contract module. Its only "executable" lines are `import { type … }` statements, and every consumer uses `import type`, so it never loads at runtime.
- `host/tools/index.ts` 2-4,7: a pure public re-export barrel. `public-entry.test.ts` exercises it through the built entry.
- `host/hook-registry.ts` 140: the documented fail-closed `default` arm of an exhaustive switch over the field-type union. `validateManifest` refuses any other type before a plugin can attach.
- `host/node/runtime-core.ts` 102-103 and 107-108: defense-in-depth `startsWith` checks that `SAFE_PLUGIN_ID_SEGMENT` already makes unreachable, since an id with no `/`, `..` or leading dot cannot resolve outside its root. These should be refactored with a guaranteeing comment if the owner wants 100%. I did not fake tests for them.

### Left in plugins-1
Small branch gaps in:
- `capability-tools` (376-377, 641-655, 681-682) and `declarative-content-types` (122-124, 200-202, 376-378, 411-416, 457-458)
- `module-snapshot` (59-60, 243-244, 294-296), `runtime-activation` (114-115, 159-160, 208-220) and `runtime-reload` 98
- `discovery` 294-298 (case-insensitive duplicate, probably unreachable because ids are lowercase-only)
- branch-only files: admin-response, archive-policy, runtime-conflicts, plugin-install-port, word-count plugin, enable-confirmation-ui, start, invocation-binding, provider-host, provider-contributions, contributions, package-files

---

## w62-cov-cms-3: `codex/w62-cov-cms-3` @ `c15c8911` (pushed, on top of Codex wip `97845269`)

**Codex partial work (63 test files):** all were run, and 8 were red.

7 are fixed (`bca5e4b2`):
- **Test fixes:**
  - `forms/site/publish-content.test.ts`: the fixtures used `fields: []`, but the validator requires at least one field. This test was already red at baseline.
  - `listing/static-collections.test.ts`: the see-more marker was looked up under the wrong key. The real key is `listing:3:${config}`.
  - `pages/html-recording-revert.test.ts`: `PageConcurrentEditError` was imported from a relative path, which loads a second class, so `instanceof` failed. It now imports from the same package entry the production code uses. Red at baseline.
- **Typecheck fixes:** `derived-media-link`, `provider-credential-store` and `view-image-tool`.
- **2 production bugs:** see BUGs.

**Left red:** the first test in `provider-credential-vault.test.ts`. It is red on merge-28 too, and it contradicts `provider-credential-store.test.ts:88`. This is BUG 6 and needs an owner decision.

**New tests (`c15c8911`):**
- `html-document-store.memory.test.ts` (+3), each caught by: skipping `withWidgetIds`, removing the `isTrashed` block, or removing `if (!applied) throw`.
- `navigation/site/publish-content.test.ts` (+3), each caught by: the retry bound or conflict branch, the Forbidden branch or swallowing every error, or the port check.

**Coverage (scoped):**
- At 100% lines through Codex's now-green tests:
  - form-delivery-repo, form-pull-lease-repo, form-submission-receipt-repo
  - media-provider-registry, content-type-resolution, list-pending-chat-attachments
  - where-used, purge-media, derived-media-link
  - rate-limit-profile, form-file-storage, bootstrap, export-html-policy
  - view-image-tool (branches 87%)
- Other files, before → after (L/B/F):
  - html-document-store.memory: 28.4/44.4/28.6 → 100/88.9/100
  - navigation/site/publish-content: 69/77.3/45.8 → 97.1/88.7/87.5
  - media/site/publish-content: 55.1/67.7/41.4 → 90.8/76.4/78.8
  - import-video-conversion: 60/38.9/55.6 → 83.8/68.4/88.9
  - library-save-attachment: 66.7/60/60 → 98.4/70/80
  - document-marks: → 100/100/100
  - forms/site/publish-content: 89.3/38.5/62.5 → 100/82.6/100

**Left in cms-3:**
- media/site/publish-content (rest), import-video-conversion 157-169, view-image-tool branches
- rendition-access, provider-credential-store/vault branches, duplicate-asset, import-media-entity, view-video-tool
- blob-store.selection, fs-files/tool-registrations, write-files, media-service, video-transcode
- html-change-recording, the forms tool-handlers, and every file with only branch gaps

---

## w62-cov-misc-1: `codex/w62-cov-misc-1` @ `bbfd39bf` (pushed, on top of Codex wip `8824fa4b`)

**Codex partial work (19 files):** 3 reds, all fixed (`7955d975`).
- `codex-isolation-m1` (test wrong): vitest 3 compares the error class, so the test now expects `CodexMcpIsolationError`, which is stricter.
- `codex-home-staging` inline MCP: a production bug (BUG 4). `codex-staging-policy.test.ts:48` now expects the class.
- A pre-existing red from untested wip `0cbe0534`: `assistant-transport.ag-ui.approvals` "expired resume…" simulated `onDone` on an accepted durable turn, which cannot happen (`settleRunOnce` leaves it to the checkpoint follower). The call is removed and the test now asserts that `onDone` is not called.

**New tests (`f1a5c683`, `9c9e3d1e`, `bbfd39bf`, about 50):** agentic site install flow and tool registrations, React skills hooks (useSkills, useSkillFiles, useSkillInstall, modal), the skills-client wire, the chat AG-UI approval relay, chat-cleanup hooks and panel, installed-skill-tools, and page-port. The mutation list is in `ledger-misc-1.md`.

**Coverage, before → after (L/B/F):**
- install-service: 62.8/80/44 → 100/93.8/92.3
- install-tool: 76.7/50/33 → 100/94.7/100
- agentic site/tool-registrations: 37.5/100/60 → 100/94.4/100
- installed-skill-tools: 89.8/71.7/92 → 100/89.3/100
- react/skills/api: 61/83/62.5 → **100/100/100**
- use-skill-files.hooks: 0/0/0 → **100/100/100**
- use-skills.hooks: 82.9/65.5/54 → 100/98.2/92
- page-port: 37.5/100/0 → **100/100/100**
- ag-ui-approval-relay: 81/66.7/64 → 100/94.1/88
- chat-cleanup.hooks: 35/66.7/33 → **100/100/100**
- ChatCleanupPanel: 100/40/40 → 100/100/80
- analytics config.settings: 0 → **100/100/100**
- analytics site/tool-registrations: 0 → 100/97.3/100

These agent-runtime files are now at 100% lines through Codex's tests: claude config-dir, filesystem, mcp-config, mcp-delivery and mcp-json; codex home-staging, isolation and mcp-delivery; opencode-acp; json-line-stream; model-discovery-yaml. antigravity event-stream went from 86.4 to 100 lines.

**EXCEPTION candidates (owner):** `skills/chat-motion-overlay/assets/remotion-template/**`. These are template files copied into user projects, not engine code, and `tsconfig` already excludes `src/skills`.

**Left in misc-1:**
- runtime-port-bindings forwarders (F 48.6) and acp/session-run 461-467
- chat validate 165-167, frontend-invocation-handler 168-170 and ag-ui-transport 257
- every file at 100% lines with only small branch gaps

---

## w62-cov-ui-1: `codex/w62-cov-ui-1` @ `4e624443` (4 commits, pushed)

There was no prior Codex branch. 50 tests added, 0 removed.

**Coverage, before → after (L/B/F):**
- find hooks (`use-find-bar-effects`, `use-find-bar-state`, `use-find-focus-reclaim`, `use-find-input-binding`): 0 → **100/100/100**
- find-focus-clock and find/index: 0 → **100**
- find-bar-state: 90.9/92.9/100 → **100/100/100**
- use-live-views: 0 → **100/100/100**
- live-views: → **100/100/100**
- live-views/index: 0 → **100**
- mcp-ui tool-approval: 75.9/100/80 → **100/100/100**
- credential-card: 100/55/100 → 100/96.7/100
- viewer-shell CodeWrapToggle and useCodeWrap: 23-40 → **100/100/100**
- AgentDiagnosticRow: → **100/100/100**
- media-providers dependencies: → **100/100/100**
- react/testing.tsx: → **100/100/100**
- utils/unhandled-case: 33/100/0 → **100/100/100**
- PopoverMenu: 100/50/100 → **100/100/100**

Mutations actually run ("checked"):
- removing `if (restoringFocus.current) return` in use-find-input-binding turns a test red
- removing `if (!keepGoing) return` in use-find-focus-reclaim turns 2 tests red

The rest are in `ledger-ui-1.md`.

**EXCEPTIONs (pure re-export barrels):** app-shell/index 1-7, find-bar/index 1, number-stepper/index 1-4, resource-monitor/index 1,7-8, site-card/index 1-9.

**Owner:** `react/components/CustomSelectMarkup.tsx` is imported nowhere. I did not test it, so as not to pin dead code in place.

**Left in ui-1:**
- InfoTip.hooks, charts wire and catalog-manifests, ExecutionTab.hooks, useReasoningControl, execution rules, find-target, editor-blocks, shadcn select
- use-site-view-preference, mcp-ui fields 82-83 and integrations rules 211-212 (both `unhandledCase` tails), outcome, structured-details, useMediaProvidersTab, useMentionAutocomplete, NumberStepper
- panel-kit hooks, useProjectLocationsTab, SiteListToolbar, site-list-view, use-site-list-prefs, SketchEditor, TabStrip, useTabStripDragReorder, scrollable, PillButton, select-popover, design-md, trim-chars

---

## w62-cov-admin-8: `codex/w62-cov-admin-8` @ `f27a1680` (3 commits, pushed)

There was no prior Codex branch. 79 tests added in 6 new files. There are no production changes, and the admin package typecheck, which includes the tests, is clean.

**Coverage, before → after (L/B/F):**
- trash-api: 0/0/0 → **100/100/100**
- use-trash.hooks: 0/0/0 → 100/94.4/100
- trash/rules: 88.2/82.2/64.3 → 98/88.5/100
- taxonomy/rules: 50/60/38.5 → 100/93/92.3
- use-new-taxonomy-form, use-new-term-form and use-taxonomy-html-embed: 0 (html-embed 40/100/50) → **100/100/100**
- use-term-detail-panel: 0 → 100/92.9/100
- use-merge-term-section: 0 → 100/97.5/100
- access-token-add-actions: 11.4/100/0 → 100/92/100
- access-token-replace-actions: 10.8/100/0 → 100/87.8/100
- access-token-store-operations: 51.8/58.3/50 → 85.7/69.6/66.7
- AgentFailureCard.hooks: 12.3/100/0 → 100/95.6/92.3
- AgentFailureCard.tsx: 0 → **100/100/100**
- agent-failure-hints: 77.8/100/0 → **100/100/100**

Mutations actually run ("checked"), each turned a test red:
- the superseded-page guard in useTrash `loadMore`
- the term-switch guard in rename
- the `usedBy` merge in `replaceCustomCredential`
- the worksFor suggestion for hosting providers only
- the same-scope filter in the custom name check
- the inventory generation guard
- `available === true` in `switchAgent`

The rest are in `ledger-admin-8.md`.

**Left in admin-8:**
- taxonomy: use-term-picker, use-taxonomy, use-term-list-reveal
- trash: Trash.tsx branches
- voice-input: mic-button-view, push-to-talk-state, voice-input-config
- widgets/index, security-i18n, SeoIcons, AdminByokKeyPanel.hooks
- security host components: AccessTokenRows, Fields, Groups, Tab, Dialogs
- access-token-actions (remove, make-default and custom-key paths), other-credential-store-operations, use-other-credentials, access-token-state
- AssistantDock: DockLeadingAccessory, FolderDropNotice, FolderDropPathHint, SubagentsIndicator, DockHeader, DockHeaderTip, FolderDropConfirmation
- every file with only branch gaps

`y5-live-secrets.test.tsx` fails 1 test ("<AdminKitProvider>"). It is on merge-28's own red list, so it is old and unrelated.

---

## BUGs (also in `development/open-bugs.md` on this branch)
1. **FIXED, plugins `host/activation-polling.ts`:** a rejected `pluginRuntimeReady` before the first tick was an unhandled rejection, which crashes the process in Node's default mode. Fixed with `seeded.catch(() => undefined)`, failing test first.
2. **FIXED, cms `forms/submission-evidence.ts:62`:** an array provenance source passed via `String(source)`.
3. **FIXED, cms `html/document-marks.ts:88`:** Object.prototype mark names rendered `[object Object]`. Fixed with `Object.hasOwn`.
4. **FIXED, agent-runtime `defs/codex/home-config.ts:188`:** the inline `mcp_servers` refusal was a plain `Error`. It is now `CodexMcpIsolationError`, so staging reports the isolation refusal.
5. **FIXED, ui `AgentDiagnosticRow.tsx`:** an unknown fix-intent kind (`unhandledCase` returns `undefined`) crashed the row. The filter now excludes `undefined`.
6. **OPEN (owner decision), cms `media/site/provider-credential-vault.ts:35`:** the vault test and the store test claim opposite `findOne` contracts. The proposed strict fix is in open-bugs.md. If it is applied, the store test must be inverted.

## For the owner to decide
- BUG 6: which `findOne` contract is correct.
- plugins `runtime-core.ts` 102-108: refactor the unreachable defense-in-depth checks (with a guaranteeing comment), or accept them as an EXCEPTION.
- plugins has no jsdom. Should `@jini-ai/plugins` get a DOM test environment (a lockfile change) so `useProviderSettingsFocus` can be covered?
- The remotion template assets in agent-runtime `src/skills`: accept them as EXCEPTIONs?
- ui `CustomSelectMarkup.tsx`: wire it or delete it.

## Continuation
For each job, keep working the "Left" lists above on the same `codex/w62-cov-<job>` branches. All 5 branches are pushed and fast-forward from merge-28 (cms-3 and misc-1 from their Codex wip commits). Scoped coverage per package:

`npx vitest run <tests> --coverage.enabled --coverage.all=false --coverage.include=<file>…`

For plugins, the whole suite is cheap: 57 s with `--coverage.all=true`.
