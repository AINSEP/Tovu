DONE run V1 | branches 6/6 | tests run 1959 pass 1959 fixed 23 dropped 1 | weak fixed 10 | bugs 9 (8 fixed in place, 1 open) | left: none

# verify-1127 V1 — Jini `packages/admin` Codex coverage branches w62-cov-admin-1..6 (2026-11-27)

Unattended cloud run (Opus high) following `ADS-memory/reports/cloud-runs/briefs/verify-1127.md`. Coordinator verified branches 3 and 6 itself; 4 subagents (Opus high, one branch each: 1, 2, 4, 5) fixed and committed locally; the coordinator re-ran tsc + the branch's test files on every committed state, reviewed every production diff, ran gitleaks, and pushed. No `--no-verify`, no force-push, no tag/publish, no RemoteTrigger, no codebase-memory tools; main/release/integ untouched; no ts-ignore/expect-error/`as any`/skips/config/threshold/guard edits; `PageEditorChrome.tsx` and `packages/commerce` untouched; no 'tovu' text added to Jini.

## Setup
Node 24 (`/opt/node24/bin`), Jini `pnpm install --frozen-lockfile` + `pnpm -r build` at `origin/integ/merge-28-2026-11-26` (green); admin `tsc -p packages/admin/tsconfig.json --noEmit` = 0 errors on the base. One git worktree per branch (`/home/user/wt/admin-N`, node_modules symlinked to the built checkout; the symlinks were excluded via `info/exclude`, never committed). gitleaks 8.24.3 built with `go install` (the release-binary download was refused by the sandbox). Coverage per job: `vitest related --run <FILES> --coverage.include=<each FILE> --coverage.all` (scoped; "before" = the job brief's full-suite figures, "after" = related-tests run).

## Final shas (all pushed, `git ls-remote` confirmed)
| branch | sha | tests (branch files) | tsc |
|---|---|---|---|
| codex/w62-cov-admin-1 | 17beebe24 | 846/846 (60 files) | 0 |
| codex/w62-cov-admin-2 | 69ad75ae8 | 451/451 (32) | 0 |
| codex/w62-cov-admin-3 | fb256878c | 133/133 (12) | 0 |
| codex/w62-cov-admin-4 | 11650a1ed | 204/204 (21) * | 0 |
| codex/w62-cov-admin-5 | dc3c79563 | 159/159 (17), 1 dropped | 0 |
| codex/w62-cov-admin-6 | c6babf30a | 166/166 (17) | 0 |

\* admin-4: `media-api.unit.test.ts` and `media-providers-port.unit.test.ts` fail to IMPORT in this checkout because production `screens/media/api/media-api.ts` self-imports `@jini-ai/admin/shell/lib/admin-http/config` and the pnpm workspace has no `@jini-ai/admin` self-link; same on the merge-28 base (environment, not the branch). With a run-only alias config (`@jini-ai/admin/*` → `src/*`, not committed) both pass (9 + 15) and all 204 pass. Owner decision 3.

## Production bugs found by the Codex tests (fixed in place, each with its test red first; all ≤ 15 lines)
1. **admin-1** `pages/hooks/page-editor-workspace.hooks.ts:211-227` — first Save after an unreported Interactive-canvas edit saved the OLD body (preflight flushed the edit and said "changed"; `save()` ran from the same render, flushed again, got nothing, saved stale `html`). Fix: `preflushedHtmlRef` hands the preflight's HTML to the next flush once. **Owner review:** the ref is consumed by the next flush whatever triggers it.
2. **admin-1** `recovery/hooks/use-restore-flow.hooks.ts:207-215` — a late disclosure answer/error for a restore point the operator already left overwrote the current point's. Fix: `current` flag cleared in the effect cleanup.
3. **admin-2** `collections/hooks/use-collection-entry-editor.hooks.ts:~428` — id-or-slug lookup in one `find` let another row's matching slug beat an exact id. Fix: id first, then slug.
4. **admin-2** `consent/use-consent-page.hooks.ts:~100-113` — Publish reported the draft as it was AFTER the await as live (edits typed mid-request shown as live). Fix: snapshot before the request.
5. **admin-2** `email/hooks/use-email-activity.hooks.ts:~88-103` — a Load-more page from the previous filter replaced the new filter's first page. Fix: drop pages/errors from a replaced query.
6. **admin-3** `screens/email/hooks/use-email-template-editor.hooks.ts:~178` — switching template id kept the previous template's preview and its undeclared fields on screen until the new preview arrived. Fix: reset preview when a new template is seeded.
7. **admin-5** `plugins/PluginLists.tsx` `installedPluginRow` — the Installed tab ignored `pluginToggleControl().visible`: an invalid, switched-off plugin got an unlabeled enable-capable button (AC-21). Fix: muted "—" when not visible.
8. **admin-6** `plugins/hooks/use-plugin-install.hooks.ts:~36` and `use-agent-plugin-install.hooks.ts:~57` — refusal-code lookup on a plain object: server code `"toString"` resolved to `Object.prototype.toString`, which `setError` ran as an updater ("[object Undefined]"). Fix: `Object.hasOwn` guard.
9. **OPEN (admin-5, dropped test)** `plugins/rules.ts:595` — the Downloaded tab's "Turn off" copy says the plugin "drops off the Installed tab"; since 2026-09-13 Installed lists every plugin (AgentPluginLists.tsx:213). Fix needs the source string + 21 `i18n/plugins-dict-*.ts` translations; then restore the dropped test (code in the admin-5 section).

## Pre-existing (OLD) reds touched or seen
- Fixed (in a file admin-6 edits): `providers/__tests__/AlwaysAllowPanel.unit.test.tsx` "lists each server's tools…" (in merge-28's Jini red list) — queried a long agent label as the accessible name.
- Not touched: `screens/__tests__/y5-admin-surfaces.test.tsx` "plugin Add falls back to Installed…" ("needs <AdminKitProvider>") — red on the merge-28 base and in its red list; showed up only in `vitest related` coverage runs of 2/4/5/6.

## Owner decisions
1. admin-1 page-editor preflush fix (bug 1): accept as is, or move the handoff into `save()` explicitly.
2. admin-5: `DownloadedPluginAction` (PluginLists.tsx ~228) still offers Enable on every disabled row, including invalid ones — same AC-21 question as bug 7. Bug 9 copy change.
3. admin-4: make `media-api.ts` import `../../../shell/lib/admin-http/config.js` relatively, or add the workspace self-link in setup.
4. Remaining `as unknown as` in tests that model malformed server data (admin-1: pages/recovery/analytics/auth API tests cast `vi.fn` to the generic `request<T>`; admin-2 EmailSenderTab L194; admin-4 MenuEditor legacy target; admin-6 malformed memory listing). A shared typed JSON-decoding request fake would remove the admin-1 group.

---
## codex/w62-cov-admin-1 — DONE — pushed 014192ac5 + 17beebe24 (coordinator: added test failed tsc, `partial: false` vs literal `true`; fixed)
tests run 846 pass 846 (60 files) | red fixed 5 | dropped 0 | weak fixed 3 | bugs 2 (both fixed locally, <=15 lines each) | tsc errors fixed 9

### Reds -> why -> fix
- pages/__tests__/y5-page-editor.test.tsx: "a first Save after an unreported canvas edit…" — real PRODUCTION BUG (see BUGs #1) — fixed in source; the test is unchanged and now passes.
- posts/__tests__/y5-post-list.test.tsx: "list columns preserve all sorting choices" — looked up the sort label on the `<th>`, but it lives on the header button (the `<th>` is named "Updated") — now asserts `aria-sort="descending"` on Updated, `"none"` on Title, plus the button's full label.
- posts/__tests__/y5-post-list.test.tsx: "bound controller localizes trash failures" — `result.current.locale` does not exist on PostsController (it was also TS2339) — removed that line only. The locale is still checked by the "es: failed to delete post" assertion.
- react/entities/__tests__/FailureNotice.unit.test.tsx — expected `onReload`/`onRetry` to be called with no arguments, but `onClick={onReload}` passes the click event and the contract is `() => void` — now checks call counts (1/0, then 1/1). A swapped-action mutation still turns it red.
- recovery/hooks/__tests__/use-restore-flow.hooks.unit.test.ts: "never displays another restore point's disclosure" — real PRODUCTION BUG (BUGs #2) — fixed in source.

### TS errors -> fix
- settings-events.unit.test.ts (3): the `FeedSource extends EventTarget` fake did not match EventSource's overloaded `addEventListener`. Replaced it with a typed fake that records listeners and has an `emit()` (accepts function or EventListenerObject, no cast).
- y5-page-editor.test.tsx (5): the notices test cast partial `kit`/`deps` objects; both are now full typed `PageEditorProps["kit"|"deps"]` objects. `readVersionConflict` in `editorBinding` is now a typed const, because `satisfies` had narrowed it to `() => null`. The debounce test's `setTimeout` wrapper is now `Object.assign((handler, ms) => setTimeout(handler, ms), setTimeout)`, which is typed and resolved at call time so fake timers apply.
- y5-post-list.test.tsx (1): the `.locale` line, as above.

### Weak tests strengthened
1. post-list columnheader `toBeTruthy()` on an element that does not exist → `aria-sort` values plus a button-label check.
2. deployment-api.test.ts: removed `as unknown as` and `vi.fn() as`. Now a typed `authenticatedRequest` hands `onOk` a real ETag-less Response and decodes the body; `request` throws if it is used.
3. y5-page-editor notices test: removed `as PageEditorProps[...]` casts on partial objects.
- Added 1 regression test (use-restore-flow): a stale point's *rejection* must not set `error`. This covers the error half of BUG #2.

### Mutation spot-checks (test -> mutation -> result)
- use-restore-flow disclosure test -> drop the `current` gate on `setDisclosure` -> RED
- use-restore-flow stale-error test -> drop the `current` gate on `setError` -> RED
- y5-page-editor "first Save after unreported canvas edit" -> remove `?? preflushed` -> RED
- settings-events "resumes from last event id" -> `id: ""` instead of `message.lastEventId` -> RED
- FailureNotice copy/recovery test -> invert `view.action === 'reload'` -> RED
(Every source file was restored afterwards; `git status` showed only the intended changes.)

### Coverage (before -> after, lines/branches/functions)
Full table: /home/user/wt/covmeta-1/table.md. Highlights:
- settings-events.ts 80.4/45.5/66.7 -> 100/97.2/100
- server-reconnect.ts 72.4/66.7/80 -> 100/97.0/100
- use-restore-flow.hooks.ts 0/0/0 -> 100/100/87.5
- PageEditorNotices.tsx 73.8/50/58.3 -> 100/90/83.3
- page-editor-actions.hooks.ts 75.6/66.7/100 -> 100/72.4/100
- roles/hooks/roles-row-actions.ts 32.5/80/33.3 -> 99.1/69.2/93.8
- testing-kit.tsx 77.1/84.9/44.2 -> 90.7/90.0/57.7
- recovery/*, OwnerRecoverySignIn*, pages/recovery/analytics/auth api: 0 -> 100

### BUGs (file:line, test code, proposed fix) / owner decisions
1. BUG packages/admin/src/pages/hooks/page-editor-workspace.hooks.ts:211-221 (FIXED). An unchanged-Save preflight (`flushPendingEdits`) flushes the open Interactive edit and returns "changed". `save()` then runs from that same render, flushes again, gets `undefined`, and falls back to the stale `html` closure, so the last keystroke was saved as the old body. Fix: `preflushedHtmlRef` holds the preflight's HTML, and the next `flushInteractiveSafely` consumes it once (`html ?? preflushed`).
2. BUG packages/admin/src/recovery/hooks/use-restore-flow.hooks.ts:207-211 (FIXED). After switching restore points, the previous point's late disclosure or error overwrote the current one. Fix: a `current` flag in the effect, set to false in its cleanup, gates both `setDisclosure` and `setError`.
- Owner decision: pages-api, recovery-api, analytics-api and auth-api tests still pass `vi.fn(...) as unknown as XApiDeps["request"]`. The dep is a generic `<T>(…) => Promise<T>`: vitest's `Mock<generic>` is not assignable to it (TS2322, tried), and a plain fake needs a `T` assertion. I kept the existing pattern. Options: accept it, or add a shared JSON-decoding fake helper to the package.

## codex/w62-cov-admin-2 — DONE — pushed 69ad75ae8
tests run 451 pass 451 | red fixed 5 | dropped 0 | weak fixed 2 | bugs 3 (all fixed) | tsc errors fixed 5
### Reds -> why -> fix
- `collections/…/use-collection-entry-editor.unit.test.tsx` "prefers an exact ID over another row's matching slug" — **production bug, fixed** (`use-collection-entry-editor.hooks.ts` ~L428): one `find(e => e.id === id || e.slug === id)` let an earlier row whose slug equals the id win, contradicting the code's own comment ("id first, slug only when the id lookup misses"). Fix: `find(id) ?? find(slug) ?? null`.
- `consent/…/use-consent-page.hooks.unit.test.tsx` "reports the published revision as live even when the draft changes while Publish is pending" — **production bug, fixed** (`use-consent-page.hooks.ts`): `publish()` read `valueRef.current` after the await, so an edit typed during the request showed as live. Fix: snapshot `publishedValue` before the request (the post-await "lost its settings" throw became unreachable and was removed).
- `email/__tests__/EmailActivityTab.unit.test.tsx` "never replaces a newly filtered first page with an old page already in flight" — **production bug, fixed** (`use-email-activity.hooks.ts` `usePaged.loadMore`): a Load-more page from the old filter overwrote the new filter's results. Fix: `currentFetch` ref; a page/error from a replaced query is dropped (stale-error path not separately tested).
- `CookieConsent.unit.test.tsx` "shows fix links only for actionable problems" — queried before the snapshot loaded → `await findByRole`.
- `EmailSenderTab.unit.test.tsx` "validates a From address locally…" — inputs fill after async `readSender` → `waitFor(toHaveValue("Old site"))`; assertion unchanged.
### TS errors -> fix
- `Collections.unit.test.tsx` L679/693/694/698: invalid ByRole `exact` option removed (string names match exactly).
- `EmailOverviewTab.unit.test.tsx` L29: fake ApiError `readonly body?` param property vs `exactOptionalPropertyTypes` → declared optional field set only when defined.
### Weak tests strengthened
- `CollectionEntries.unit.test.tsx` 2 loading tests only asserted "New entry" absent → now assert exact "Loading entries…" text and zero `a, button` elements.
- Kept `"CheckingDelegation" as unknown as …status` in EmailSenderTab L194 (unknown server status value; owner may decide).
### Mutation spot-checks (all RED, reverted)
- consent-autosave `if (queued && !stopped)` → `if (queued)`; Dashboard `postsError && pagesError` → `||`; CollectionEntries drop `|| contentType === undefined`; plus the 3 bug tests red on unfixed source.
### Coverage (before -> after, lines/branches/functions; scoped `vitest related`)
| file | before | after |
|---|---|---|
| src/screens/auth/auth-i18n.ts | 100.0/66.67/100.0 | 100.00/66.66/100.00 |
| src/screens/auth/hooks/use-login.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/collections/CollectionEntries.tsx | 100.0/90.91/100.0 | 100.00/95.65/100.00 |
| src/screens/collections/EditFieldsDialog.tsx | 100.0/100.0/50.0 | 100.00/100.00/100.00 |
| src/screens/collections/LifecycleConfirmDialog.tsx | 100.0/71.43/50.0 | 100.00/100.00/100.00 |
| src/screens/collections/NewContentTypeDialog.tsx | 100.0/100.0/80.0 | 100.00/100.00/100.00 |
| src/screens/collections/api/collections-api.ts | 28.57/100.0/33.33 | 100.00/100.00/100.00 |
| src/screens/collections/hooks/collection-entries-dependencies.hooks.ts | 70.0/100.0/66.67 | 100.00/100.00/100.00 |
| src/screens/collections/hooks/collection-entry-editor-dependencies.hooks.ts | 13.33/100.0/75.0 | 100.00/100.00/100.00 |
| src/screens/collections/hooks/collections-dependencies.hooks.ts | 59.26/100.0/66.67 | 100.00/100.00/100.00 |
| src/screens/collections/hooks/edit-fields-dialog-dependencies.hooks.ts | 51.85/100.0/66.67 | 100.00/100.00/100.00 |
| src/screens/collections/hooks/new-content-type-dialog-dependencies.hooks.ts | 78.57/100.0/60.0 | 100.00/100.00/100.00 |
| src/screens/collections/hooks/use-collection-entries.hooks.ts | 62.5/25.0/50.0 | 100.00/100.00/100.00 |
| src/screens/collections/hooks/use-collection-entry-editor.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/collections/hooks/use-collections.hooks.ts | 71.88/77.78/20.0 | 100.00/100.00/100.00 |
| src/screens/collections/hooks/use-edit-fields-dialog.hooks.ts | 0.0/0.0/0.0 | 100.00/95.45/100.00 |
| src/screens/collections/hooks/use-new-content-type-dialog.hooks.ts | 60.71/66.67/28.57 | 100.00/100.00/100.00 |
| src/screens/collections/rules.ts | 83.65/83.87/90.48 | 100.00/100.00/100.00 |
| src/screens/comments/index.ts | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/consent/ConsentOverviewTab.tsx | 84.62/29.41/100.0 | 100.00/97.22/100.00 |
| src/screens/consent/CookieConsent.tsx | 75.0/66.67/76.92 | 100.00/92.72/100.00 |
| src/screens/consent/consent-autosave.ts | 100.0/96.15/100.0 | 100.00/96.15/100.00 |
| src/screens/consent/consent-i18n.ts | 100.0/80.0/100.0 | 100.00/80.00/100.00 |
| src/screens/consent/use-consent-page.hooks.ts | 100.0/94.32/100.0 | 100.00/95.40/100.00 |
| src/screens/content-analysis/content-analysis-i18n.ts | 100.0/75.0/100.0 | 100.00/75.00/100.00 |
| src/screens/content-analysis/hooks/content-analysis-dependencies.hooks.ts | 85.19/50.0/60.0 | 100.00/100.00/100.00 |
| src/screens/content-analysis/hooks/use-content-analysis.hooks.ts | 100.0/66.67/100.0 | 100.00/100.00/100.00 |
| src/screens/content-analysis/rules.ts | 99.16/77.78/100.0 | 100.00/97.95/100.00 |
| src/screens/dashboard/Dashboard.tsx | 100.0/97.5/100.0 | 100.00/100.00/100.00 |
| src/screens/dashboard/hooks/use-dashboard.hooks.ts | 100.0/98.48/100.0 | 100.00/100.00/100.00 |
| src/screens/database/Database.tsx | 100.0/98.55/100.0 | 100.00/98.55/100.00 |
| src/screens/database/api/database-api.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/database/hooks/use-migrate-forward-section.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/database/hooks/use-schema-state-section.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/database/hooks/use-timeline-section.hooks.ts | 32.39/50.0/50.0 | 100.00/100.00/100.00 |
| src/screens/database/rules.ts | 91.43/100.0/66.67 | 100.00/100.00/100.00 |
| src/screens/email/Email.hooks.ts | 77.78/100.0/50.0 | 100.00/100.00/100.00 |
| src/screens/email/EmailActivityTab.tsx | 53.96/51.11/47.06 | 100.00/94.36/95.65 |
| src/screens/email/EmailOverviewTab.tsx | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/email/EmailParts.tsx | 100.0/92.59/100.0 | 100.00/100.00/100.00 |
| src/screens/email/EmailProviderTab.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/email/EmailSegments.tsx | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/email/EmailSenderTab.tsx | 55.83/59.09/50.0 | 100.00/98.61/100.00 |
| src/screens/email/EmailTemplateEditor.hooks.ts | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/email/EmailTemplateEditor.tsx | 91.3/51.85/62.5 | 100.00/93.47/80.00 |
| src/screens/email/EmailTemplatesTab.tsx | 0.0/0.0/0.0 | 100.00/100.00/84.21 |
| src/screens/email/api/mail-status-api.ts | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/email/email-api.ts | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/email/email-tabs-i18n.ts | 100.0/66.67/100.0 | 100.00/66.66/100.00 |
| src/screens/email/hooks/email-load.hooks.ts | 100.0/94.74/100.0 | 100.00/100.00/100.00 |
| src/screens/email/hooks/use-email-activity.hooks.ts | 68.39/89.74/85.71 | 98.72/86.58/100.00 |
| src/screens/email/hooks/use-email-overview.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/email/hooks/use-email-provider.hooks.ts | 70.54/75.76/100.0 | 100.00/95.23/100.00 |
| src/screens/email/hooks/use-email-sender.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |

## codex/w62-cov-admin-3 — DONE — pushed fb256878c
tests run 133 pass 133 | red fixed 3 | dropped 0 | weak fixed 1 | bugs 1 (fixed) | tsc errors fixed 0 (tsc was 0)
### Reds -> why -> fix
- `email/__tests__/use-email-template-editor.unit.test.ts` "does not display a different template's preview or fields while the new template renders" — **production bug, fixed**: on switching the hook's `id`, the preview effect kept `current.data` (`{...current, pending:true}`), so template A's rendered preview/subject and its undeclared fields (`ticket`, `firstName`) stayed on screen as B's fill-in fields until B's preview arrived. Fix (3 lines, `use-email-template-editor.hooks.ts` seed effect): reset preview to `{data:null,error:null,pending:true}` when a different template is seeded. Test red before, green after; whole `screens/email` folder 74/74 green.
- `library/__tests__/Library.unit.test.tsx` "offers cleanup but not the Documents shortcut…" — test expected `clearUploads()` with no args, but the button is `onClick={clearUploads}` (React passes the click event; the controller type is `() => void`, so not a bug). Rewritten as a stateful harness: one call AND the failed row / alert / "Clear list" disappear (stronger than the original).
- `Library.unit.test.tsx` "moves only the selected document to Trash…" — `useFetchMutation` dispatches `port.trashDocument` asynchronously after the row shows "Moving…"; the exact-args assertion now sits in `waitFor` (unchanged assertion).
### Weak tests strengthened
- clear-list test above (call-count-only → observable list emptied). The rest of the 133 checked: exact-args/exact-state assertions throughout; negative `not.toHaveBeenCalled` only as companions.
### Mutation spot-checks
- `use-email.hooks.ts:65` drop `live` guard on resolve → use-email "ignores an old status read…" RED (1).
- `use-email.hooks.ts:43` legacy unavailable → "configured" → classification row RED (1).
- `library-api-port.hooks.ts:36` drop `credentials: "same-origin"` → 2 RED.
- `use-email-template-editor.hooks.ts` remove the new preview reset → switch test RED. All reverted.
### Coverage (before -> after, lines/branches/functions; scoped `vitest related`)
| file | before | after |
|---|---|---|
| src/screens/email/hooks/use-email-template-editor.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/email/hooks/use-email-template-view.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/email/hooks/use-email-templates.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/email/hooks/use-email.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/forms/index.ts | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/import-export/GitBackupCard.tsx | 100.0/96.0/100.0 | 100.00/100.00/100.00 |
| src/screens/import-export/api/import-export-api.ts | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/import-export/hooks/use-git-backup.hooks.ts | 100.0/98.0/100.0 | 100.00/100.00/100.00 |
| src/screens/integrations/api/integrations-api.ts | 80.37/100.0/53.85 | 100.00/100.00/100.00 |
| src/screens/integrations/hooks/use-integrations-redirect.hooks.ts | 100.0/66.67/100.0 | 100.00/100.00/100.00 |
| src/screens/integrations/i18n/integrations-dict-es-to-ko.ts | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/integrations/i18n/integrations-dict-pl-to-bn.ts | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/integrations/integrations-i18n.tsx | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/library/Library.hooks.tsx | 15.69/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/library/Library.tsx | 14.92/25.0/7.14 | 100.00/97.36/100.00 |
| src/screens/library/hooks/library-api-port.hooks.ts | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
Library.tsx branches 97.36: remaining uncovered branches not covered by the branch's tests (left as is; no new test added in this verify).

## codex/w62-cov-admin-4 — DONE — pushed 11650a1ed
tests run 204 pass 204 | red fixed 3 (+2 files failing to import, an environment issue, see below) | dropped 0 | weak fixed 2 | bugs 0 | tsc errors fixed 8

Not pushed (coordinator pushes). Production code unchanged. Commit touches 6 test files only.

**Environment note (the "collection/import failure"):** `media-api.unit.test.ts` and `media-providers-port.unit.test.ts` could not load because the production file `media-api.ts` imports its own package by name (`@jini-ai/admin/shell/lib/admin-http/config`), and this cloud checkout's `node_modules/@jini-ai/` has no `admin` link. The base branch has the same failure here, so the branch did not cause it. I did not change the repo for this. I ran everything with a run-only config in my scratchpad (`vitest.selfref.config.ts`: the package config plus an alias from `@jini-ai/admin/*` to `src/*`). I also ran coverage with a copy of `cov.sh` that adds only `--config` for that file. With the alias, both files pass (9 + 15 tests).

### Reds -> why -> fix
- Menus.unit.test.tsx: "shows pending only for the confirmed menu…" — `finish is not a function`. `useFetchMutation` calls `port.trash` on a later tick, so the held promise did not exist yet when the test released it. Fix: `await waitFor(() => expect(port.trash.mock.calls).toEqual([[{ id: "m1" }]]))` before `finish()`.
- MediaEditChildren.unit.test.tsx: "copies the public URL, stored embed slug and hash…" — timed out. `vi.useFakeTimers()` also fakes the real `setTimeout(0)` that Testing Library's async wrapper waits on, so the clicks never finished. Fix: use real timers. The labels stay "Copied" for 1.5 s, and the test now also checks (`waitFor`, 3 s) that all three labels go back to "Copy".
- MediaEditChildren.unit.test.tsx: "routes native cancel and backdrop dismissal…" — timed out only because the previous test left fake timers on (its `finally` never ran). It passed alone and passes after the fix above.

### TS errors -> fix
- Media.unit.test.tsx:39 (2 errors): the kit's `Button`/`TextField` (`ComponentType` with wider `defaultProps`) did not match Media's narrower kit slot under `exactOptionalPropertyTypes`. Fix: small wrapper components `(props) => <KitButton {...props} />`.
- use-media-item-link.hooks.unit.test.tsx (4 errors): `initialProps` was inferred too narrowly (`null` / `string`). Fix: typed `initialProps` constants.
- use-menu-editor.hooks.unit.test.tsx:205,291 (2 errors): same cause. Fix: `{ menuId: "m1" as string | null }` (widening only).

### Weak tests strengthened
1. media-api.unit.test.ts: removed `request as unknown as MediaRequestFn`. It is now a typed `vi.fn` plus a generic adapter: `<T,>(...args: Parameters<MediaRequestFn>) => request(...args) as Promise<T>`.
2. MediaEditChildren copy test: now checks that the "Copied" labels expire, not only that they appear (this catches mutation M3).
- I kept one `as unknown as AdminMenuItem` in MenuEditor.unit.test.tsx ("legacy unknown target"). That test checks how the editor handles a malformed value from the server, and a typed fake cannot represent that value.
- The rest of the diff has no assertions that only check `toBeDefined`/`not.toThrow`, no snapshots, and no `toHaveBeenCalled()` without arguments.

### Mutation spot-checks (test -> mutation -> result)
- M1 use-media-item-link "encodes one item…" -> remove `encodeURIComponent(id)` -> RED (2 tests)
- M2 Menus "shows pending only for the confirmed menu…" -> `setPendingTrash(null)` without the id check -> RED
- M3 MediaEditChildren "copies the public URL…" -> delete the embed `setTimeout` reset -> RED
- M4 html-rules "quotes an apostrophe…" -> drop `.replace(/'/g, "&#39;")` -> RED
- M5 media-api "isolates private documents…" -> drop `?kind=document` -> RED
All reverted. `git status` showed no changed source files.

### Coverage (before -> after, lines/branches/functions)
36 of 37 files are at 100% lines; the other, rules.ts, is at 98.87%. Remaining gaps: use-edit-media-panel 98.75 br; use-media.hooks 98.00 br / 92.30 fn; rules.ts 98.40 br; menus-dependencies 91.17 br; use-menu-editor-writes 97.36 br; use-menu-editor.hooks 94.11 br / 85.71 fn; use-menus 97.05 br; Observability 98.27 br. Full table: /home/user/wt/covmeta-4/table.md.
The coverage run (`vitest related`) had one failure in a file this branch did not change: `src/screens/__tests__/y5-admin-surfaces.test.tsx` "plugin Add falls back to Installed…", which threw "needs <AdminKitProvider>". It was not investigated.

### BUGs / owner decisions
- No production bugs found.
- Owner decision: the media-api self-import fails in any checkout whose `node_modules` has no `@jini-ai/admin` link. Options: add the workspace link in the cloud setup, or change `media-api.ts` to the relative import `../../../shell/lib/admin-http/config.js`.

## codex/w62-cov-admin-5 — DONE — pushed dc3c79563
tests run 159 (branch files, 17) pass 159 | red fixed 2 | dropped 1 | weak fixed 1 | bugs 2 (1 fixed, 1 reported) | tsc errors fixed 5
### Reds -> why -> fix
- agent-plugin-surface-frame.unit.test.tsx: "displays a sandboxed frame with sizing…" — test bug: `renderWithAdminKit` wraps in `AdminKitProvider`, but `view.rerender(panel())` dropped the provider, so React remounted the tree and the captured `iframe` was a stale detached node still at 28rem — render with an explicit `kit` and rerender inside the same `AdminKitProvider`; added `expect(screen.getByTitle(...)).toBe(iframe)` to prove the same frame is resized, not remounted.
- plugins-kit.unit.test.tsx: "keeps the disabled invalid package visible … without offering activation" — PRODUCTION BUG (fixed, see BUGs) — test kept as written, now green.
- plugin-confirmation-and-fields.unit.test.tsx: "does not promise that turning off a package hides its row from Installed" — PRODUCTION BUG, fix too large — test dropped, reported below.
### TS errors -> fix
- agent-plugins-kit.unit.test.tsx:195,204,215 and plugin-install-panels.unit.test.tsx:96,100 — `exact: true` is not a `ByRoleOptions` key. ByRole already matches a string `name` exactly, so the option was redundant. Removed it with no change in behaviour.
### Weak tests strengthened
- plugins-kit "invalid package…": besides the missing "Enable Example", the test now checks that the row's buttons are exactly [summary, "Inspect package files — Example"], that the aria-hidden "—" fallback renders, and that `onToggleEnabled` was not called.
- The rest of the diff passed review: exact-arg port calls, `toEqual` on real outputs, negative call checks paired with positive state checks. No snapshots or tautologies found.
### Mutation spot-checks (test -> mutation -> result)
- plugins-kit invalid package -> PluginLists `control.visible ? … : …` changed to `true ? …` -> RED
- plugins-api "PATCHes activation enabled=false" -> body `JSON.stringify({ enabled: true })` -> RED
- observability-query.hooks "never reads identity for builtin" -> use-queries-tab `enabled: adapter !== null` -> RED
- agent-plugin-surface-frame "displays a sandboxed frame…" -> height hardcoded to "28rem" -> RED
All reverted. `git status` was clean before the commit.
### Coverage (before -> after, lines/branches/functions)
All 41 FILES are at 100/100/100 except the branch coverage of these:
| file | before | after |
|---|---|---|
| observability/recent-errors-rules.ts | 95.83/95.16/100 | 100/98.61/100 |
| plugins/AddPluginPanel.tsx | 4.44/100/0 | 100/94.44/100 |
| plugins/Plugins.tsx | 93.75/62.07/100 | 100/94.28/100 |
| plugins/composer-capabilities.ts | 98.0/91.38/100 | 100/93.22/100 |
| plugins/hooks/use-admin-surface-frame.hooks.ts | 0/0/0 | 100/97.95/100 |
Full table: /home/user/wt/covmeta-5/table.md. The related run has 1 failure, `src/screens/__tests__/y5-admin-surfaces.test.tsx` "plugin Add falls back to Installed…" (missing AdminKitProvider). It is not a branch file and it also fails with my changes stashed. Every branch test is green.
### BUGs (file:line, test code, proposed fix) / owner decisions
1. FIXED — packages/admin/src/screens/plugins/PluginLists.tsx `installedPluginRow` (~l.262): the Installed tab ignored `pluginToggleControl(...).visible`. An invalid + switched-off plugin got an unlabeled button that still called `onToggleEnabled` (AC-21 breach; rules.ts:54 says the caller renders the muted "—"). Fix: `action={control.visible ? <button…/> : <span className="field-hint" aria-hidden="true">—</span>}` (+6 lines). Related, not fixed: `DownloadedPluginAction` (PluginLists.tsx ~l.228) still offers a direct Enable for any disabled row, invalid ones included. Owner decision needed.
2. REPORTED — packages/admin/src/screens/plugins/rules.ts:595: the Downloaded "Turn off" copy says "…and it drops off the Installed tab." Since 2026-09-13 Installed lists every plugin, on or off (AgentPluginLists.tsx:213), so the copy is stale. Dropped test:
```
it("does not promise that turning off a package hides its row from Installed", () => {
  renderWithAdminKit(<AgentPluginDisableConfirmDialog name="Reporting" variant="remove"
    agentHandleBase="row-reporting" t={t} rules={rules} onCancel={vi.fn()} onConfirm={vi.fn()} />);
  const dialog = within(screen.getByRole("dialog", { name: "Turn off Reporting?" }));
  expect(dialog.getByText(/skills stop reaching the assistant on the next run/)).toBeVisible();
  expect(dialog.getByText(/can be enabled again any time/)).toBeVisible();
  expect(dialog.queryByText(/drops off the Installed tab/)).toBeNull();
});
```
Proposed fix: change the key to "This turns it off: its skills stop reaching the assistant on the next run. " and re-key/retranslate it in all 21 `i18n/plugins-dict-*.ts` files (line ~151 each). The translations make it larger than the small-local threshold. Then restore the test.

## codex/w62-cov-admin-6 — DONE — pushed c6babf30a
tests run 166 pass 166 | red fixed 5 (incl. 1 OLD) | dropped 0 | weak fixed 1 | bugs 1 (fixed) | tsc errors fixed 5
### Reds -> why -> fix
- `use-plugin-install.hooks.unit.test.tsx` "localizes a failed preview (9)" and `use-agent-plugin-install.hooks.unit.test.tsx` "describes an Agent Plugin refusal (23)" — **production bug, fixed**: both install hooks looked refusal codes up in a plain object (`ERROR_CODE_KEYS[error.code]`, `errorKeys(product)[error.code]`). A server code `"toString"` resolved to `Object.prototype.toString`; `t()` returned the function and `setError(fn)` ran it as a React updater, showing "[object Undefined]". Fix (+3/+2 lines): `Object.hasOwn(...)` before the lookup in `use-plugin-install.hooks.ts` and `use-agent-plugin-install.hooks.ts`. Codex's plan predicted these rows red. Tests red before, green after.
- `plugin-interactions.hooks.unit.test.tsx` "traps Tab in the named removal dialog…" — expected dialog name was garbled; real title is `Move "Metrics $&" to trash?` (also proves `$&` is literal).
- `Routines.test.tsx` "edits the row with a nondefault model…" — `onCancel` is wired as `onClick={onCancel}` so it receives the click event; assertion now `toHaveBeenCalledTimes(1)` (the "no args" claim was false, not a bug: prop type `() => void`).
- `AlwaysAllowPanel.unit.test.tsx` "lists each server's tools…" — **OLD red** (in merge-28's Jini red list), in a file this branch edits: the button's accessible name is "Revoke"; the long text is the agent-handle `data-agent-label`. Now queries by name "Revoke" and asserts both rows' exact agent labels.
### TS errors -> fix
- `plugins-rules.unit.test.ts:271` predicate `e is FakeApiError` vs `exactOptionalPropertyTypes` → same predicate shape as the shared fixture (`e is Error & { code?: string }`).
- `use-agent-plugin-memory.hooks.unit.test.tsx:25` `read` referenced itself in its initializer (implicit any) → explicit call counter.
- `AlwaysAllowPanel.unit.test.tsx:78,112` `exact: true` is not a ByRole option (string names already match exactly) → removed.
### Weak tests
- The AlwaysAllow OLD test above now asserts per-row agent labels. Rest of the 166 reviewed: exact args/state throughout. Kept one `as unknown as PluginMemoryListing` (malformed wire data from the read port; a typed fake cannot express it) — owner may decide.
### Mutation spot-checks
- `rules-context.tsx:22` return instead of throwing → RED. Remove `Object.hasOwn` guard in each install hook → RED (1 each). All reverted.
### Coverage (before -> after, lines/branches/functions; scoped `vitest related`)
| file | before | after |
|---|---|---|
| src/screens/plugins/hooks/use-agent-plugin-install.hooks.ts | 52.27/62.5/23.81 | 100.00/98.70/100.00 |
| src/screens/plugins/hooks/use-agent-plugin-memory.hooks.ts | 0.0/0.0/0.0 | 100.00/98.27/100.00 |
| src/screens/plugins/hooks/use-agent-plugin-tab.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/hooks/use-agent-plugin-update.hooks.ts | 100.0/100.0/50.0 | 100.00/100.00/100.00 |
| src/screens/plugins/hooks/use-linked-lock-tip.hooks.ts | 7.89/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/hooks/use-plugin-install.hooks.ts | 0.0/0.0/0.0 | 100.00/96.38/100.00 |
| src/screens/plugins/hooks/use-plugin-package-files.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/hooks/use-plugin-provider-settings.hooks.ts | 55.0/71.43/33.33 | 100.00/93.33/100.00 |
| src/screens/plugins/hooks/use-plugin-remove-confirm.hooks.ts | 25.0/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/hooks/use-plugin-row-focus.hooks.ts | 18.18/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/hooks/use-plugins.hooks.ts | 0.0/0.0/0.0 | 100.00/98.18/100.00 |
| src/screens/plugins/plugins-memory-i18n.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/plugins-visuals.tsx | 75.68/100.0/66.67 | 100.00/100.00/100.00 |
| src/screens/plugins/rules-context.tsx | 100.0/66.67/100.0 | 100.00/100.00/100.00 |
| src/screens/plugins/rules.ts | 76.22/97.33/58.97 | 100.00/98.24/100.00 |
| src/screens/providers/AlwaysAllowPanel.tsx | 100.0/100.0/50.0 | 100.00/100.00/100.00 |
| src/screens/providers/Providers.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/providers/Providers.tsx | 100.0/100.0/87.5 | 100.00/100.00/100.00 |
| src/screens/providers/ProvidersTabBody.tsx | 98.21/84.62/100.0 | 100.00/100.00/100.00 |
| src/screens/providers/always-allow-rules.ts | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/providers/hooks/use-always-allow.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/providers/providers-i18n.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/routines/RoutineForm.tsx | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/routines/Routines.hooks.ts | 89.58/47.06/100.0 | 100.00/92.10/100.00 |

### Appendix: full coverage table admin-1 (before -> after, l/b/f)
| file | before | after |
|---|---|---|
| src/browser/server-reconnect.ts | 72.41/66.67/80.0 | 100.00/96.96/100.00 |
| src/browser/settings-events.ts | 80.36/45.45/66.67 | 100.00/97.22/100.00 |
| src/comments/conformance/comments-api.conformance.ts | 100.0/97.3/100.0 | 100.00/100.00/100.00 |
| src/core/i18n-common.ts | 100.0/66.67/100.0 | 100.00/66.66/100.00 |
| src/core/manifest/rules.ts | 100.0/90.28/100.0 | 100.00/96.10/100.00 |
| src/core/settings-tab-appearance.ts | 100.0/92.86/100.0 | 100.00/96.87/100.00 |
| src/core/settings-tab-preferences.ts | 100.0/90.0/100.0 | 100.00/100.00/100.00 |
| src/core/settings-tab-privacy.ts | 100.0/89.47/100.0 | 100.00/100.00/100.00 |
| src/core/settings-tabs.ts | 100.0/90.91/100.0 | 100.00/100.00/100.00 |
| src/deployment/api/deployment-api.ts | 100.0/88.24/100.0 | 100.00/100.00/100.00 |
| src/deployment/deployment-i18n.tsx | 98.98/100.0/93.75 | 100.00/100.00/100.00 |
| src/forms/adapters/http.ts | 100.0/96.0/100.0 | 100.00/100.00/100.00 |
| src/forms/adapters/memory.ts | 100.0/98.92/100.0 | 100.00/100.00/100.00 |
| src/forms/form-editor-refresh.ts | 100.0/90.7/100.0 | 100.00/90.90/100.00 |
| src/forms/html-rules.ts | 100.0/98.5/100.0 | 100.00/98.49/100.00 |
| src/forms/react/components/FormProviderSettings.tsx | 96.77/88.46/100.0 | 100.00/93.10/100.00 |
| src/forms/react/components/FormSubmissionDetail.tsx | 100.0/96.55/100.0 | 100.00/96.55/100.00 |
| src/forms/react/hooks/use-form-editor-parts.hooks.ts | 99.36/93.33/100.0 | 100.00/94.50/100.00 |
| src/forms/react/hooks/use-form-editor-refresh.hooks.ts | 98.73/91.8/100.0 | 100.00/93.54/100.00 |
| src/forms/react/hooks/use-form-editor.hooks.ts | 100.0/93.75/100.0 | 100.00/93.75/100.00 |
| src/media/adapters/http.ts | 89.94/79.71/79.41 | 100.00/100.00/100.00 |
| src/media/react/hooks/ProvidersTab.hooks.ts | 100.0/100.0/92.86 | 100.00/100.00/92.85 |
| src/pages/PageEditor.tsx | 99.12/81.25/72.73 | 100.00/88.23/72.72 |
| src/pages/PageEditorNotices.tsx | 73.83/50.0/58.33 | 100.00/90.00/83.33 |
| src/pages/PageEditorPane.tsx | 58.78/50.0/66.67 | 98.64/90.47/100.00 |
| src/pages/PageEditorPreview.tsx | 99.19/61.54/60.0 | 100.00/100.00/80.00 |
| src/pages/Pages.tsx | 98.56/84.85/90.48 | 100.00/91.42/95.23 |
| src/pages/ThemePageDetailsModal.hooks.tsx | 0.0/0.0/0.0 | 100.00/87.50/100.00 |
| src/pages/api/pages-api.ts | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/pages/hooks/page-editor-actions.hooks.ts | 75.56/66.67/100.0 | 100.00/72.41/100.00 |
| src/pages/hooks/page-editor-load.hooks.ts | 98.85/76.0/85.71 | 100.00/82.75/85.71 |
| src/pages/hooks/page-editor-preview.hooks.ts | 76.54/86.21/71.43 | 100.00/100.00/100.00 |
| src/pages/hooks/page-editor-recovery.hooks.ts | 88.3/90.0/66.67 | 100.00/88.88/88.88 |
| src/pages/hooks/page-editor-workspace.hooks.ts | 92.36/86.21/75.0 | 98.76/95.65/100.00 |
| src/pages/hooks/use-editor-html-jump.hooks.ts | 100.0/96.97/100.0 | 100.00/100.00/100.00 |
| src/pages/hooks/use-interactive-flush.hooks.ts | 100.0/94.74/100.0 | 100.00/100.00/100.00 |
| src/pages/hooks/use-page-editor.hooks.ts | 95.0/100.0/75.0 | 100.00/100.00/100.00 |
| src/pages/hooks/use-pages.hooks.ts | 66.67/82.35/70.0 | 100.00/89.47/100.00 |
| src/pages/lib/embed-placeholder.ts | 100.0/96.08/100.0 | 100.00/96.15/100.00 |
| src/pages/lib/page-preview-youtube.ts | 78.79/53.85/100.0 | 100.00/97.05/100.00 |
| src/pages/lib/prettify-html.ts | 100.0/98.28/100.0 | 100.00/98.30/100.00 |
| src/pages/page-editor-i18n.ts | 100.0/84.62/100.0 | 100.00/84.61/100.00 |
| src/pages/page-editor-rules.ts | 100.0/95.35/100.0 | 100.00/100.00/100.00 |
| src/posts/PostPublishingFields.tsx | 100.0/66.67/100.0 | 100.00/100.00/100.00 |
| src/posts/PostSettingsDialog.tsx | 98.04/84.62/66.67 | 100.00/100.00/100.00 |
| src/posts/Posts.tsx | 100.0/80.0/100.0 | 100.00/100.00/100.00 |
| src/posts/PostsColumns.tsx | 100.0/90.0/94.12 | 100.00/100.00/100.00 |
| src/posts/PostsTrashConfirm.tsx | 85.0/33.33/50.0 | 100.00/100.00/100.00 |
| src/posts/api/posts-api.ts | 92.86/100.0/92.86 | 100.00/100.00/100.00 |
| src/posts/editor/PostDeleteConfirmDialog.tsx | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/posts/editor/template/PostEditorTemplatePicker.tsx | 100.0/88.89/100.0 | 100.00/100.00/100.00 |
| src/posts/hooks/use-posts.hooks.ts | 73.86/77.42/76.92 | 100.00/81.63/100.00 |
| src/react/components/RowMenu/RowMenu.hooks.tsx | 100.0/98.31/100.0 | 100.00/98.30/100.00 |
| src/react/entities/EntityField.tsx | 100.0/98.18/100.0 | 100.00/98.18/100.00 |
| src/react/entities/FailureNotice.tsx | 80.0/85.71/80.0 | 100.00/100.00/100.00 |
| src/react/entities/use-entity-edit.ts | 100.0/98.96/100.0 | 100.00/98.95/100.00 |
| src/react/settings/SettingsPageLayout.tsx | 89.2/94.44/70.0 | 96.59/94.73/80.00 |
| src/react/shell/Placeholder.tsx | 77.19/40.0/100.0 | 100.00/96.15/100.00 |
| src/react/shell/appearance.ts | 100.0/95.83/100.0 | 100.00/100.00/100.00 |
| src/react/testing-kit-media-providers.ts | 100.0/92.54/100.0 | 100.00/95.58/100.00 |
| src/react/testing-kit.tsx | 77.05/84.87/44.15 | 90.65/90.04/57.69 |
| src/recovery/api/recovery-api.ts | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/recovery/hooks/use-recovery.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/recovery/hooks/use-restore-flow.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/87.50 |
| src/recovery/rules.ts | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/roles/PoliciesSection.tsx | 5.8/100.0/0.0 | 100.00/100.00/100.00 |
| src/roles/PolicyPermissionForm.tsx | 3.33/100.0/0.0 | 100.00/100.00/100.00 |
| src/roles/PolicyRow.tsx | 7.79/100.0/0.0 | 100.00/100.00/100.00 |
| src/roles/RoleConfirmDialogs.tsx | 79.49/33.33/50.0 | 100.00/93.75/100.00 |
| src/roles/Roles.hooks.tsx | 68.42/100.0/50.0 | 100.00/100.00/100.00 |
| src/roles/Roles.tsx | 72.44/84.62/83.33 | 100.00/100.00/100.00 |
| src/roles/RolesSection.tsx | 75.0/57.14/70.0 | 100.00/91.66/91.66 |
| src/roles/hooks/roles-permission-actions.ts | 33.7/100.0/37.5 | 100.00/86.48/100.00 |
| src/roles/hooks/roles-row-actions.ts | 32.48/80.0/33.33 | 99.14/69.23/93.75 |
| src/roles/hooks/use-roles-mutations.hooks.ts | 94.0/100.0/22.22 | 100.00/100.00/100.00 |
| src/roles/hooks/use-roles.hooks.ts | 98.21/75.0/100.0 | 100.00/100.00/100.00 |
| src/roles/rules.ts | 100.0/75.0/100.0 | 100.00/94.44/100.00 |
| src/screens/analytics/api/analytics-api.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/assistant-settings/AdminSubagents.tsx | 100.0/96.15/100.0 | 100.00/100.00/100.00 |
| src/screens/assistant-settings/VisitorAssistantPanel.tsx | 100.0/80.0/60.0 | 100.00/100.00/100.00 |
| src/screens/assistant-settings/use-visitor-assistant-panel.hooks.ts | 100.0/100.0/66.67 | 100.00/100.00/100.00 |
| src/screens/assistant-settings/use-visitor-assistant-tabs.hooks.ts | 100.0/66.67/100.0 | 100.00/100.00/100.00 |
| src/screens/assistant-settings/use-visitor-credential-discovery.hooks.ts | 82.26/94.74/100.0 | 100.00/96.29/100.00 |
| src/screens/assistant-settings/use-visitor-credential-form.hooks.ts | 100.0/85.19/100.0 | 100.00/85.18/100.00 |
| src/screens/assistant-settings/use-visitor-tools.hooks.ts | 100.0/92.86/90.91 | 100.00/95.34/100.00 |
| src/screens/assistant-settings/visitor-credential-form-actions.ts | 81.43/40.0/100.0 | 98.57/90.47/100.00 |
| src/screens/auth/Login.tsx | 100.0/85.71/40.0 | 100.00/100.00/100.00 |
| src/screens/auth/OwnerRecoverySignIn.hooks.ts | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/auth/OwnerRecoverySignIn.tsx | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/auth/api/auth-api.ts | 0.0/100.0/100.0 | 100.00/100.00/100.00 |

### Appendix: full coverage table admin-4 (before -> after, l/b/f)
| file | before | after |
|---|---|---|
| src/screens/library/hooks/use-library.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/media/Media.tsx | 62.5/40.0/80.0 | 100.00/100.00/100.00 |
| src/screens/media/MediaCards.tsx | 92.5/59.09/50.0 | 100.00/100.00/100.00 |
| src/screens/media/MediaEditChildren.tsx | 19.05/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/media/MediaEditFields.tsx | 1.65/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/media/MediaEditPanel.tsx | 5.36/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/media/MediaGridOrEmpty.tsx | 53.73/66.67/50.0 | 100.00/100.00/100.00 |
| src/screens/media/MediaLibraryPanel.tsx | 100.0/84.62/60.0 | 100.00/100.00/100.00 |
| src/screens/media/MediaLightbox.tsx | 13.33/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/media/MediaPreview.tsx | 3.16/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/media/MediaPurgeDialog.tsx | 3.85/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/media/MediaToolbar.tsx | 4.88/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/media/api/media-api.ts | 48.96/100.0/31.82 | 100.00/100.00/100.00 |
| src/screens/media/hooks/use-edit-media-panel.hooks.ts | 71.63/78.12/36.36 | 100.00/98.75/100.00 |
| src/screens/media/hooks/use-media-card-details.hooks.ts | 100.0/72.73/100.0 | 100.00/100.00/100.00 |
| src/screens/media/hooks/use-media-item-link.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/media/hooks/use-media-preview.hooks.ts | 77.78/100.0/66.67 | 100.00/100.00/100.00 |
| src/screens/media/hooks/use-media.hooks.ts | 94.85/79.31/61.54 | 100.00/98.00/92.30 |
| src/screens/media/media-providers-port.ts | 63.33/100.0/75.0 | 100.00/100.00/100.00 |
| src/screens/media/pinned-media-providers.ts | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/media/rules.ts | 64.61/70.83/44.44 | 98.87/98.40/100.00 |
| src/screens/menus/MenuEditor.tsx | 100.0/100.0/63.64 | 100.00/100.00/100.00 |
| src/screens/menus/MenuItemFields.tsx | 98.39/95.24/82.35 | 100.00/100.00/100.00 |
| src/screens/menus/MenuItemRow.tsx | 98.41/90.0/71.43 | 100.00/100.00/100.00 |
| src/screens/menus/MenuModeTabs.tsx | 100.0/100.0/33.33 | 100.00/100.00/100.00 |
| src/screens/menus/Menus.tsx | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/menus/api/menus-api.ts | 72.73/100.0/80.0 | 100.00/100.00/100.00 |
| src/screens/menus/hooks/menu-tree.ts | 44.23/40.0/50.0 | 100.00/100.00/100.00 |
| src/screens/menus/hooks/menus-dependencies.hooks.ts | 63.77/63.16/75.0 | 100.00/91.17/100.00 |
| src/screens/menus/hooks/use-menu-editor-state.hooks.ts | 87.5/100.0/66.67 | 100.00/100.00/100.00 |
| src/screens/menus/hooks/use-menu-editor-writes.hooks.ts | 93.75/45.45/88.89 | 100.00/97.36/100.00 |
| src/screens/menus/hooks/use-menu-editor.hooks.ts | 94.74/75.0/85.71 | 100.00/94.11/85.71 |
| src/screens/menus/hooks/use-menus.hooks.ts | 0.0/0.0/0.0 | 100.00/97.05/100.00 |
| src/screens/menus/html-rules.ts | 26.67/50.0/28.57 | 100.00/100.00/100.00 |
| src/screens/menus/page-link-rules.ts | 100.0/98.18/100.0 | 100.00/100.00/100.00 |
| src/screens/observability/Observability.tsx | 0.0/100.0/100.0 | 100.00/98.27/100.00 |
| src/screens/observability/api/observability-api.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |

### Appendix: full coverage table admin-5 (before -> after, l/b/f)
| file | before | after |
|---|---|---|
| src/screens/observability/hooks/observability-status-dependencies.hooks.ts | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/observability/hooks/recent-server-errors-dependencies.hooks.ts | 53.85/100.0/50.0 | 100.00/100.00/100.00 |
| src/screens/observability/hooks/use-observability-status.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/observability/hooks/use-queries-tab.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/observability/hooks/use-recent-server-errors.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/observability/observability-visuals.tsx | 85.42/100.0/85.71 | 100.00/100.00/100.00 |
| src/screens/observability/queries-panel.tsx | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/observability/recent-errors-panel.tsx | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/observability/recent-errors-rules.ts | 95.83/95.16/100.0 | 100.00/98.61/100.00 |
| src/screens/observability/tool-gaps-panel.tsx | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/plugins/AddAgentPluginPanel.tsx | 4.3/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/AddPluginPanel.tsx | 4.44/100.0/0.0 | 100.00/94.44/100.00 |
| src/screens/plugins/AgentPluginDisableConfirmDialog.tsx | 11.43/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/AgentPluginLinkedLock.tsx | 42.11/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/AgentPluginLists.tsx | 81.38/52.63/66.67 | 100.00/100.00/100.00 |
| src/screens/plugins/AgentPluginManageButton.tsx | 25.0/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/AgentPluginMaturity.tsx | 100.0/60.0/100.0 | 100.00/100.00/100.00 |
| src/screens/plugins/AgentPluginMemoryPanel.tsx | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/plugins/AgentPluginRow.tsx | 4.63/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/AgentPluginSurfaceFrame.tsx | 0.0/100.0/100.0 | 100.00/100.00/100.00 |
| src/screens/plugins/AgentPluginUpdateControl.tsx | 100.0/66.67/100.0 | 100.00/100.00/100.00 |
| src/screens/plugins/AgentPlugins.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/AgentPlugins.tsx | 32.08/100.0/60.0 | 100.00/100.00/100.00 |
| src/screens/plugins/AgentPluginsOverlays.tsx | 96.15/50.0/66.67 | 100.00/100.00/100.00 |
| src/screens/plugins/AgentPluginsTabs.tsx | 100.0/100.0/72.73 | 100.00/100.00/100.00 |
| src/screens/plugins/PackageFilesModal.tsx | 10.1/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/PluginLists.tsx | 89.18/54.55/58.82 | 100.00/100.00/100.00 |
| src/screens/plugins/PluginPackageFilesModal.tsx | 12.5/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/PluginProviderSettingField.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/PluginProviderSettingField.tsx | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/PluginRemoveConfirmDialog.tsx | 13.33/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/PluginRow.tsx | 8.04/100.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/Plugins.tsx | 93.75/62.07/100.0 | 100.00/94.28/100.00 |
| src/screens/plugins/PluginsOverlays.tsx | 95.83/70.0/100.0 | 100.00/100.00/100.00 |
| src/screens/plugins/agent-plugins-visuals.tsx | 56.86/100.0/38.46 | 100.00/100.00/100.00 |
| src/screens/plugins/api/plugins-api.ts | 50.0/100.0/28.57 | 100.00/100.00/100.00 |
| src/screens/plugins/composer-capabilities.ts | 98.0/91.38/100.0 | 100.00/93.22/100.00 |
| src/screens/plugins/composer-skills.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/hooks/use-admin-surface-frame.hooks.ts | 0.0/0.0/0.0 | 100.00/97.95/100.00 |
| src/screens/plugins/hooks/use-agent-plugin-details-modal.hooks.ts | 0.0/0.0/0.0 | 100.00/100.00/100.00 |
| src/screens/plugins/hooks/use-agent-plugin-disable-confirm.hooks.ts | 23.53/100.0/0.0 | 100.00/100.00/100.00 |

