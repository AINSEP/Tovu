# codex/tv-b3 — eight-sheet handoff

Base: Tovu merge-6 `776ce6d0f`; existing Jini merge-6 idiom export consumed without package or lock changes. Executed in order: A1 → A2 → A3 → A4 → A5 → RC-A → RC-D → RC-W1. The supplied culls govern every edit.

Verification here was limited to targeted source/importer reads and diff review. No tests, builds, installs, type-checks, linters, error-gate runs, browser checks, MCP graph queries, subagents, commits or pushes. Runtime verification and mutation results remain pending Cloud. `.git` was used read-only; coordinator owns commits. No STOPs. No unlisted test importer needed a repoint, so no `REFRESH.md` was created.

## 1. A1 — DONE

- Changed: `apps/admin/src/features/media/hooks/use-media-grid-size.hooks.ts`.
- Ledger identity to zero: that file + `catch-reads-error` (row 38, baseline 2). Ledger untouched.
- Replaced the storage-read initializer and storage-write catch with the exact `orFallbackSync` calls. State update remains before persistence; docblock and `/* not remembered */` retained. Pads removed: 0. Tests changed: none; no new test file.
- Cloud proof: compare the file/rule count with the live baseline. Original storage bypass mutations: bypass each corresponding fallback and verify blocked reads/writes expose the loss of the medium default or immediately applied selection in the combine look; no new test harness.
- Combine Chrome look: blocked storage stays muted and a size change applies immediately. Electron look: none.
- Deletions: the two replaced catch forms only. Diff re-read removed nothing extra. STOP: none.

## 2. A2 — DONE

- Changed: `apps/admin/src/features/media/media-providers-port.ts`.
- Ledger identity to zero: that file + `catch-reads-error` (row 41, baseline 1). Ledger untouched.
- Added the existing idiom import and made the exact body swap in `fetchMediaProviders`; its docblock and singleton remain. Pads removed: 0. Tests changed: none; existing `media-providers-port.unit.test.ts` map, network/HTTP-null and save-rejection cases retained.
- Cloud mutations: bypass the read or propagate its rejection; the existing map/null assertions must detect the corresponding change.
- Combine Chrome look: provider form edits survive an unreachable read. Electron look: none.
- Deletions: the replaced read catch only. Diff re-read removed nothing extra. STOP: none.

## 3. A3 — DONE

- Changed: `apps/admin/src/features/sites/hooks/site-transfer-dependencies.hooks.ts` and `apps/admin/src/features/sites/__tests__/site-transfer-credential-warnings.unit.test.tsx`.
- Ledger identity to zero: the hooks file + `catch-reads-error` (row 65, baseline 3). Ledger untouched.
- Wrote the single named test first: HEAD 409, GET non-JSON 403, result `{ status: 403, credentialWarnings: [] }`. Then changed only the three awaited expressions to inline `orFallback` callbacks and added the import. Existing comments, body assertion, status precedence, valid-warning case and gate owner remain. Pads removed: 0.
- Cloud mutations: propagate each corresponding HEAD/GET/JSON rejection; the new case specifically must fail when JSON rejection propagates. No additional test cases were added.
- Combine Chrome look: existing refusal and credential-warning display. Electron look: none.
- Deletions: the three replaced `.catch(() => null)` expressions only. Diff re-read removed nothing extra. STOP: none.

## 4. A4 — DONE

- Changed: `apps/admin/src/lib/queued-daemon-start.ts`.
- Ledger identity to zero: that file + `catch-reads-error` (row 96, baseline 1). Ledger untouched.
- Added the idiom import and exact inline `response.clone().json()` fallback, retaining the existing assertion and comment. Body identity, busy check, wait and abort order remain. Pads removed: 0. Tests changed: none.
- Cloud mutations: propagate the rejected JSON read; then read the original body instead of the clone. Existing malformed-conflict and readable-body cases must fail respectively.
- Combine Chrome look: queued turn, explicit Stop and ordinary conflict notice. Electron look: none.
- Deletions: the replaced JSON catch only. Diff re-read removed nothing extra. STOP: none.

## 5. A5 — DONE

- Changed: `apps/site-chat/src/session-store.ts`.
- Ledger identity to zero: that file + `catch-reads-error` (row 150, baseline 4). Ledger untouched.
- Added `orFallbackSync` for storage read, decode, save and clear. Parse/shape-validation statements stayed verbatim; decode observation still clears invalid persisted input. Serialization and caps remain in place, and the existing save/clear why-comments moved verbatim above their calls. Pads removed: 0. Tests changed: none; existing storage and lazy-load cases retained.
- Cloud mutations: remove invalid-state cleanup, then bypass each of the get/set/remove fallbacks. Matching existing invalid-state/throwing-storage assertions must fail.
- Combine Chrome look: React and vanilla widgets with storage disabled, retained in-memory conversation and explicit New thread. Electron look: none.
- Deletions: four replaced catch forms and the superseded mutable `raw` declaration only. Diff re-read removed nothing extra. STOP: none.

## 6. RC-A — DONE, 7 component pads removed

- Changed files and declarations:
  - `apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.tsx`: `WidgetSelectionDialog`.
  - `apps/admin/src/features/collections/EditFieldsDialog.tsx`: `EditFieldsDialog`.
  - `apps/admin/src/features/collections/LifecycleConfirmDialog.tsx`: `LifecycleConfirmDialog`.
  - `apps/admin/src/features/collections/NewContentTypeDialog.tsx`: `NewContentTypeDialog`.
  - `apps/admin/src/features/security/AccessTokensTab.tsx`: `WorksForField`.
  - `apps/admin/src/integrations/jini-admin/AdminModulesProvider.tsx`: `AdminModulesProvider`.
  - `apps/admin/src/integrations/jini-admin/ModulePanel.tsx`: `ModulePanel`.
- Deleted only each trailing component pad and its separator/type/default. Bodies do not read these pads; targeted symbol reads found no direct call supplying a second argument. Hook defaults remain. No import, test, comment or ledger changes.
- Cloud: type-check at combine. Mutations and Chrome/Electron looks: none, explicitly cut.
- Existing size notes: `EditFieldsDialog` remains 64 lines, covered by the owner's tabled-function exception. `AccessTokensTab.tsx` remains 1,064 lines; no file-length stop.
- Deletions: the 7 named pads only. Diff re-read removed nothing extra. STOP: none.

## 7. RC-D — DONE, 14 component pads removed

- Changed files and declarations:
  - `apps/desktop/src/renderer/ResourcesPanel.tsx`: trailing pads on `MetricCells`, `ResourceGroupRows`, `ResourcesTable`, `ResourcesMonitor`, `ResourceSiteFigure`; both unused parameters on `Unknown` and `ResourcesChip`, leaving `()`.
  - `apps/desktop/src/renderer/app/SiteWorkspace.tsx`: `WorkspaceGuest`, `WorkspaceLoadingOverlay`.
  - `apps/desktop/src/renderer/SitesFolders.tsx`: `SitesFoldersWarning`.
  - `apps/desktop/src/renderer/SiteGrid.tsx`: `CardOverlays`.
  - `apps/desktop/src/renderer/SharedKeys.tsx`: trailing pad on `SharedKeys`; both unused parameters on `SharedKeysLauncher`, leaving `()`.
  - `apps/desktop/src/renderer/app/LoadedSitesStepper.tsx`: `LoadedSitesRow`.
- Count is 14 component hits (17 unused parameters including the three first-parameter pads). Bodies do not read the deleted pads; targeted symbol reads found no direct call supplying deleted arguments. Non-component pads, injected hooks and the existing `allowpopups` cast remain. No import, test, comment or ledger changes. `CardOverlays` was edited on merge-6 as the cull directs.
- Cloud: type-check at combine. Mutations and Chrome/Electron looks: none, explicitly cut.
- Existing size note: `SiteGrid.tsx` remains 749 lines; no file-length stop.
- Deletions: the named signature parameters only. Diff re-read removed nothing extra. STOP: none.

## 8. RC-W1 — DONE, test-only

- Changed:
  - `apps/website/src/assistant/__tests__/execution-credential-store.test.ts`.
  - `apps/website/src/assistant/__tests__/site-credential-store.test.ts`.
  - `apps/website/src/features/media/__tests__/provider-credential-store.test.ts`.
  - `apps/website/src/features/webhooks/__tests__/secret-sealer.aesgcm.test.ts`.
- Added `SecretOpenError` to each existing sealer import and as the second argument of exactly the four listed no-AAD `assert.rejects` calls. All four fixtures use the real `AesGcmSecretSealer`. No new cases or production edits. Pads removed: 0. No ledger row.
- Named Cloud mutation: in `apps/website/src/features/webhooks/secret-sealer.aesgcm.ts`, `open`'s catch, substitute plain `new Error(...)` for `new SecretOpenError(...)` in the existing open-error branch. All four strengthened assertions must fail even though the calls still reject; preserve the derivation-error branch. Mutation not applied here.
- Chrome/Electron look: none.
- Existing file sizes: execution credential test 534 lines, site credential test 561 lines, provider credential test 916 lines. No file-length stops.
- Deletions: none. Diff re-read removed nothing extra. STOP: none.

A6 ledger shrink, RC-W2 and all non-sheet items remain outside this job. Combine owns the culled A6 checker/update step: only update when the initial checker reports zero `New:`/`Worse:` lines; never raise a row. No ledger or package files were edited here.
