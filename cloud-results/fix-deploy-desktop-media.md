PARTIAL: desktop FIX-1 (D15 dedupe of ./shell/window-navigation-policy, ./shell/webview-guest-policy, ./shell/window-bounds-store onto ./electron/navigation-policy + ./electron/usability) not started — tool-call cap

# Fix run — rv-c deploy / desktop / media (`reviews/rv-c-deploy-desktop-media.md`)

Unattended cloud run, 2026-11-23. Node v22.23.5 (repo wants ~24), pnpm 10.33.2. Tovu linked to the
lane's own Jini branch with `development/scripts/link-jini.mjs` (relinked per lane); Jini packages
rebuilt after each Jini commit. 12 of 13 FIX items done; desktop FIX-1 left.

## Media — 4/4

| item | Jini (`codex/ex4-media-jini`) | Tovu (`codex/ex4-media-tovu`) | test first / mutation |
|---|---|---|---|
| 1 boundary test reads deleted file | `9181e346` new `cms/src/media/site-transform/__tests__/image-codec.boundary.test.ts` | `f30567549` drops `../image-ops.ts` from the host list (3 kept); stale citation in `verify-published-media.ts:17` repointed to `@jini-ai/cms/media/site/content-type-resolution` | inject `import sharp` into image-ops → 1/1 red; restored |
| 2 codec input shape | `92061854` `ImageEncodeInput.flatten` allows `undefined`; original `flatten: … : undefined` call restored; injected-codec test asserts non-JPEG `flatten` own-key | — | red 1/12 before fix (= the moved spread shape); restored 12/12 |
| 3 settings implementations at host seam | `d8625b6b` `object-store/site/setting.ts` type-imports `getEffective`/`ensureSettingDefinitions`, both on required args | `4f1cabfc9` bound in `site-deps/identity-settings.ts`, `media-storage.ts`, `site-sharing.ts` | new fake reader/writer test red 1/7; mutation drop `.trim()` → 3/7; restored 7/7 |
| 4 error prefix | `b52f36c0` `readStoredBytes` takes `errorPrefix`; new `original-bytes.test.ts` | `a10a60efc` `view-image-tool.ts` + `asset-sources.ts` pass `"media_view_image"` | new test red 1/2; mutation `>`→`>=` → 1/2; consumer mutation prefix typo → `view-image-tool.test` 16/1; restored 17/0 |

## Deploy — 5/5

| item | Jini (`codex/ex4-deploy-jini`) | Tovu (`codex/ex4-deploy-tovu`) | test first / mutation |
|---|---|---|---|
| 1 trash registry stays in host | `ac1e4b68` removes `./trash/site/registry` (source, export triple, runtime metadata, api baseline) and the registry-bound `not-trashed.test.ts`; changeset reworded | `6baec6ccf` restores `features/trash/registry.ts` (byte-identical to the Jini copy except its type import) and `__tests__/not-trashed.test.ts`; 33 importers back on host paths; composition unchanged | terms marker `trash`→`trashed` → not-trashed 2/1; restored 3/0 |
| 2 host copy | `a85ba055` `PublishReadinessInput.copy: PublishReadinessCopy`; decision only; new `publish-readiness.test.ts` with fake copy; `SITE_EXPORT_FAILURE_MESSAGES` removed from devops (breaking, changeset) | `425d62cfa` new `features/publish-content/publish-readiness-copy.ts` (existing strings + name-list formatter) passed from `tool-registrations.ts`; map moved into `routes/system/site-share-password.ts` | Jini red 3/3 before; mutation check-order `=== 0`→`<= -1` → 1/3. Consumer: `and`→`plus` → 17/1; vocabulary leak → 16/2; archive copy → site-share-failures 12/1; all restored |
| 3 trash port options shape | `a31d2200` `TrashPort.trash`/`RemoveEntity` accept explicit `priorMarker: undefined`; `remove(record, { priorMarker })` restored; new fake-port `widget-removal.test.ts` (absent + supplied) | — | red 1/2 before; moved `{}` conditional → 1/2; restored (trash suite 187/187) |
| 4 inject URL validator | `fc5152a4` `normalizePeerBaseUrl` takes `hasForbiddenRawUrlCharacter` (type-imported contract) | `15c50b462` bound in `destination.ts`, `peers.ts`, `tool-registrations.ts`; host peer-url tests bind it | new injection test red 1/4; validate raw-not-trimmed → 1/4; consumer `() => false` → peer-url.test 10/1; restored |
| 5 mutation evidence | — | `20b53a90a` `cloud-results/ex4-deploy-raw/fix5-mutations.txt` | existing-DMARC branch → `mail-requirements.test` 6/1; recorded stage pinned `prepare` → share tests 24/3; restored 7/0, 27/0 |

## Desktop — 3/4

| item | Jini (`codex/ex4-desktop-jini`) | Tovu (`codex/ex4-desktop-tovu`) | test first / mutation |
|---|---|---|---|
| 1 D15 dedupe | **NOT DONE** (cap). Duplicate `./shell/{window-navigation-policy,webview-guest-policy,window-bounds-store}` exports and baselines remain; `shell/guest-navigation.ts` not repointed | `main/index.ts:135` and window callers not repointed | — |
| 2 spelling labels | `94b77acb` `labels` on both functions' required objects | `e6dedc9cc` `main/spellcheck-labels.ts` passed from `main/index.ts`; disposal test binds it; stale citations in `check-complexity.ts:4`, `check-gates.ts:6`, `desktop-updater.ts:4` repointed (`2adf6c253` exact subpaths) | new wording test red; disposer removing a fresh fn → red; restored 14/14 |
| 3 package-local coverage | `02a89c2b`, `6069d5ef`, `1f7f6a78` vitest ports of the host's pty-helpers / auto-update-controller / instance-presence tests; new site-presence test; spelling disposal guard covered by FIX-2 test. All five modules 100% lines/branches/functions | host copies kept as consumer checks (231/0) | drop site-presence `removeListener('destroyed')` → 1/3; restored |
| 4 D24 handoff | (Jini half unchanged) | `b913e9941` `main/index.ts` registers `registerHandoffForwarding` with `windows: openSitesHomeWindows`, shell-page sender check, `IMPORT_HANDOFF_CHANNELS`, `importHandoffRequest`, `IMPORT_HANDOFF_SENDER_REFUSED`; local `import-handoff-ipc.ts` removed; pin asserts the new call + window provider; sender-refusal and app-wide assertions kept. **D24 still PARTIAL** (renderer subscription open) | `windows: () => []` → pin red; restored 7/0 |

## Gates

- Jini `pnpm guard` ok on all three tips; `api:check` clean after each `api:update` (cms, devops, desktop-host baselines updated with patch changesets).
- Package typecheck (`tsc --noEmit`) clean: cms, platform, devops, desktop-host.
- vitest: platform 3361/0; devops 1339/0; desktop-host 845/0 (+1 skipped); cms 5055/8 on deploy, 5044/8 on media — the 8 are `forms/src/__tests__/package-boundary`, `src/forms/__tests__/result-html` (6), `src/widgets/__tests__/expand-partials`; neither lane touches forms/widgets. Not chased.
- Tovu: root `tsc -p tsconfig.json` 0 errors on media and deploy (after building `packages/sdk`); desktop `npm run typecheck` 0; admin tsc only the known A-K2-0a `Icon`/`useT`/`values` base-red.
- Tovu tests run on changed files (counts above). Seen and not chased, not caused here: `site-deps` characterization B02/H3 (identical with my changes stashed); `features/trash/__tests__/sweeper.test.ts` 3 timer tests ("promise still pending") and `admin-trash-routes.test.ts` 4 `list:` tests (redirect row) — the registry restore is byte-identical and the failing sweeper cases do not use the registry; not compared on an unmodified tip. `JiniMediaPicker.hooks.unit.test.tsx` not run.
- NOT run: Jini full `pnpm typecheck`/`-r build` after the fixes (changed packages rebuilt), desktop-host `test:coverage` for the whole package, Tovu why-comments / architecture / size gates (the removed `import-handoff-ipc.ts` and restored `registry.ts` may need why-comments debt rows), Tovu admin/website full suites.

## FILES MOVED

- Jini `packages/cms/src/trash/site/registry.ts` → Tovu `apps/website/src/features/trash/registry.ts` (restored).
- Jini `packages/cms/src/trash/site/__tests__/not-trashed.test.ts` → Tovu `apps/website/src/features/trash/__tests__/not-trashed.test.ts` (restored, node:test).
- Tovu image-ops assertion in `features/image-transform/__tests__/image-codec.boundary.test.ts` → Jini `packages/cms/src/media/site-transform/__tests__/image-codec.boundary.test.ts`.
- `SITE_EXPORT_FAILURE_MESSAGES`: Jini `packages/devops/src/backup/site/share-export-failure.ts` → Tovu `apps/website/src/server/inbound/admin-http/routes/system/site-share-password.ts`.
- Publish-readiness sentences + name-list formatter: Jini `publish/content/publish-readiness.ts` → Tovu `apps/website/src/features/publish-content/publish-readiness-copy.ts` (new).
- Spelling labels: Jini `shell/spellcheck-menu.ts` → Tovu `apps/desktop/src/main/spellcheck-labels.ts` (new).
- Hand-off refusal copy: Tovu `apps/desktop/src/import-handoff-ipc.ts` (deleted) → `apps/desktop/src/contracts/import-handoff.ts#IMPORT_HANDOFF_SENDER_REFUSED`.
- Tests copied (host keeps originals): Tovu `apps/desktop/src/{pty-helpers,auto-update-controller,instance-presence}.test.ts` → Jini `packages/desktop-host/src/shell/__tests__/`.

## Merge notes

- New cms changesets/baseline edits on both deploy and media; devops baseline edit on deploy (symbol removed). Union as in the review's MERGE-ORDER.
- Deploy FIX-1 restores `registry.ts`, which the review notes also unblocks the theme byte-for-byte freeze question only partly (theme import-only edits unchanged here).
