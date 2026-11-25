REVISED r62t-rev-bugs: 7 SOL sheets (5 Jini / 2 Tovu), 2 OPUS sheets

Verified against merge-21 Tovu `7c87b3c3f9` and Jini `010c8cd874`. No files changed and no tests, builds, installs, or type-checks ran.

`J` = Jini `packages`. `A`, `D`, and `W` = Tovu `apps/admin/src`, `apps/desktop/src`, and `apps/website/src`. Other paths are relative to the named repository.

For each sheet, add the named witness first, verify that it fails for the stated reason, apply the fix, then verify the named mutation and restore the fix. For a missing guard, the meaningful red is failure to catch the marked fixture. Preserve why-comments and `_optional = {}` pads. Use the existing required and optional args objects, keep custom hook props required where introduced, and keep new functions at most 80 lines and complexity 10. No sheet moves an existing route or screen or requests a schema migration. For a `SOL (OPUS-REVIEW)` sheet, Opus owns the verification run and generated API baseline.

## Jini SOL

### B-HEADLESS.J — Classify the type-only core edge correctly

**BUILDER: SOL**  
Repo: Jini

- **Files:** `J/user-management/src/core/__tests__/runtime-boundary.test.ts:18–55`. Keep production `J/user-management/src/core/types.ts:34` and `J/core/package.json:824–827` unchanged. The canonical target is `J/core/src/contracts/site/user-management-react.ts:10–149`.
- **Tests first:** Add `accepts the canonical type-only passkey contract without treating it as React` and `rejects React imports and value imports of the passkey contract`. Use AST fixtures with the exact current `export type { PasskeyOptions } from "@jini-ai/core/contracts/site/user-management-react"` declaration, a runtime import of the same subpath, and imports of `react`, `react/jsx-runtime`, and an admin entry. Keep both existing real-tree checks. The raw-source scan at `:23` matches the suffix in `user-management-react`, and the graph's relative-only expectation at `:47` rejects the bare specifier.
- **Change:** Extract private test helpers `readModuleEdges({ source, file }, _optional = {})` and `isAllowedPasskeyTypeEdge({ specifier, typeOnly }, _optional = {})`. Apply exactly `/^(?:react|react-dom)(?:\/|$)|^@jini-ai\/(?:cms|admin|mcp|ui)(?:\/|$)/` to each extracted module specifier, never to raw source text. The sole new allowed graph edge is `{ specifier: "@jini-ai/core/contracts/site/user-management-react", typeOnly: true }`. Set `typeOnly` for this purpose only when the whole declaration is `import type` or `export type`. Keep the relative dependency walk, the existing rejection of nonliteral runtime module references, and traversal into core primitives. Do not exempt other core subpaths or let a value import of this one through.
- **Target guard:** Parse `J/core/src/contracts/site/user-management-react.ts`. Require zero `ImportDeclaration`, `ImportEqualsDeclaration`, dynamic `import()` or `require` calls. Require every top-level statement to be a `ts.isTypeAliasDeclaration`, a `ts.isInterfaceDeclaration`, or an `ExportDeclaration` with `isTypeOnly`. Assert this when accepting the exception, so that future runtime code in the target fails the real-tree check.
- **Mutations:** `restore-source-regex` fails the valid type-only fixture. `ignore-type-only-bit` fails the value-import fixture. `skip-react-package-check` fails the React fixtures.
- **Injection and release:** Test source is supplied as data. No host injection, package export, changeset, or API-baseline change. Why-comment: the subpath name indicates who consumes the DTO, not what code it loads. This avoids a public-path rename merely to satisfy a regex.

### B-VENDOR-SCAN.J — Restore the guard for the two moved plugin surfaces

**BUILDER: SOL · Repo: Jini**

- **Files:** Create `J/admin/src/screens/plugins/__tests__/surface-vendor-neutrality.test.ts`. The scan targets are `J/admin/src/screens/plugins/AgentPluginSurfaceFrame.tsx:1–48` and `J/admin/src/screens/plugins/hooks/use-agent-plugin-surfaces.hooks.ts:1–25`. No production edits.
- **Tests first:** `scans both moved plugin surface sources`, `reports a provider word with the source path and line`, and `fails when a moved surface source cannot be read`. Inject two fixture sources, including one with the vendor token in the frame and one with it in the hook, and require both hits in order. The checked-in source check must read both real files and find no hits.
- **Change:** Implement private `scanSurfaceVendorWords({ targets, readText }, _optional = {})` returning `readonly { file: string; line: number }[]`. Bind a test-local `readText({ file })` to `readFileSync`, using paths relative to the test's `import.meta.url`. Use the existing seam vocabulary `/google|googleapis|gsheets|spreadsheet|drive\.file|picker/i`, no new allowlist, and no runtime vendor dependency. A missing or empty source is a test failure, not a skip.
- **Mutations:** `drop-moved-hook-from-scan` fails the coverage test. `put-provider-word-in-frame` fails the real-source assertion. `ignore-missing-source` fails the missing-source test.
- **Injection and release:** Test injects the reader. No host wiring, exports, changeset, or API-baseline change. Why-comment: the Tovu guard still owns host seams, and the Jini package now owns these two sources.

### B-MEDIA-DATE.J — Accept the viewer time zone in the existing formatter

**BUILDER: SOL (OPUS-REVIEW)**  
Repo: Jini

- **Files:** `J/admin/src/media/rules.ts:170–175`, `J/admin/src/screens/media/hooks/use-media-card-metadata.hooks.ts:4–33`, and `J/admin/src/media/react/hooks/MediaCard.hooks.ts:6–10,34–36,68–83`. Test files are `J/admin/src/media/__tests__/metadata-exports.test.ts`, `J/admin/src/screens/media/hooks/__tests__/use-media-card-metadata.hooks.unit.test.tsx`, and `J/admin/src/media/react/__tests__/media-card-hooks.test.tsx`. Tovu consumes the second card path through `@jini-ai/admin/media/react` at `A/integrations/jini-admin/modules.hooks.ts:6`.
- **Tests first:** `formats a late-evening upload in the supplied viewer time zone` uses `2026-11-25T07:30:00.000Z`, `en-US`, and `America/Los_Angeles`, expecting `Nov 24, 2026`. `keeps the original ISO timestamp while showing the viewer's date` asserts the same display text and the unchanged ISO string in `uploadDateTime`. Add `MediaCard shows the upload date in a supplied viewer time zone` beside the existing MediaCard hook tests, using the same timestamp and zone. Keep the existing UTC default and invalid-date tests.
- **Formatter and legacy card:** Use `formatUploadDate({ createdAt }: { createdAt: string }, { locale = "en-US", viewerTimeZone = "UTC" }: { locale?: string; viewerTimeZone?: string | undefined } = {}): string | null`. Use the supplied zone in `Intl.DateTimeFormat`. Add `viewerTimeZone?: string | undefined` to the existing options on `useMediaCardMetadata({ item }, { locale, formatters, viewerTimeZone } = {})` and on `MediaMetadataFormatters["formatUploadDate"]`. Forward it only to date formatting. Preserve the `{ locale }` formatter call when no zone is supplied, including the existing injected-formatter assertion at `use-media-card-metadata.hooks.unit.test.tsx:71`.
- **Jini MediaCard:** Widen `metadata({ item }, { locale = 'en-US', viewerTimeZone }: { locale?: string | undefined; viewerTimeZone?: string | undefined } = {})` and forward `viewerTimeZone` to `formatUploadDate`. Add optional `viewerTimeZone?: string` alongside `locale` in the MediaCard hook's existing `MediaCardProps` options and pass it from `useMediaCard` to `metadata`. Keep the hook's `_optional` pad and the UTC default. No ambient time-zone lookup or mutable package state in Jini. No new hook or cross-package implementation import.
- **Mutation:** `force-utc-after-injection` fails all three viewer-date witnesses while the existing UTC characterization stays green.
- **Injection and release:** The browser host supplies the zone in B-MEDIA-DATE.T. Keep `./media`, `./media/react`, and `./screens/media/hooks/use-media-card-metadata.hooks` exports and classifications unchanged. Add `.changeset/media-card-viewer-zone.md` for `@jini-ai/admin` patch. Do not edit `api-baseline`. The Opus verification run executes `pnpm api:update` (`package.json:14`) and confirms that only the `formatUploadDate`, `MediaMetadataFormatters`, `useMediaCardMetadata`, and affected MediaCard hook entries change. Why-comment: timestamps remain instants and only the calendar label belongs to the person viewing it.

### B-MAIL-CLEAR-COPY.J — Explain captures versus Activity records

**BUILDER: SOL**  
Repo: Jini. The coordinated Tovu test repoint lands in the Tovu commit after the Jini bump.

- **Scope:** Copy only. The 2026-11-23 decision keeps sent-email records for 30 days, keeps captures for 7 days, and applies “clear all” to captured test messages only. See `plans/owner-decisions-1123-bugs-todos.md:3` on `origin/plan/whats-left-1122` and `W/features/mail/__tests__/capture-clear-retention.dialects.test.ts:13–14`. Do not change deletion, retention, permissions, preview revisions, or migrations.
- **Files:** `J/admin/src/screens/email/EmailActivityTab.tsx:117–153` and `J/admin/src/screens/email/email-tabs-i18n.ts:187–196`. Add `J/admin/src/screens/email/__tests__/EmailActivityCaptureScope.unit.test.tsx`.
- **Tests first:** `keeps console-only Activity visible when there are no captured messages to delete` renders the real Activity tab with a `captured` delivery row labelled “Kept locally” and an injected controller whose preview returns empty. After clicking Clear, assert that the row remains and the status explicitly says Activity records are kept separately. `the confirmation names captured messages and leaves Activity records alone` uses a nonzero preview and asserts that opening the dialog does not delete anything.
- **Change:** Keep `CaptureNotice({ state, locale })`, `CaptureClear({ controller, locale })`, the controller methods, permission gate, preview revision, and handle IDs. At `EmailActivityTab.tsx:138–139`, set the `agentHandle` label to “Clear all captured test messages”. At `:126–129`, update the doc comment to say captured test messages. Replace these five dictionary entries in place and update their call sites.

| Existing key | Replacement key |
|---|---|
| `Clear test emails` | `Clear captured test messages` |
| `Clear all test emails?` | `Clear all captured test messages?` |
| `Test emails kept on this machine: {count}. Clearing deletes all of them and nothing else. This cannot be undone.` | `Captured test messages: {count}. This deletes their saved copies, not Email Activity records. This cannot be undone.` |
| `No test emails to clear` | `No captured test messages to clear. Email Activity records are kept separately.` |
| `Cleared {count} test emails.` | `Cleared {count} captured test messages.` |

- Translate each replacement into every existing locale slot, including the accessible button and dialog names. Keep `{count}` exactly once in each locale where the English key has it. Leave “The test emails changed. Review and confirm again.” and “Only the site owner can clear test emails.” unchanged. Do not change “Kept locally” globally or imply that an Activity row contains a stored email.
- **Tovu after the Jini bump:** In `A/features/email/__tests__/EmailCaptureClear.unit.test.tsx`, update `BUTTON` at `:18`, the dialog name and body at `:47–48`, and the end-to-end dialog names at `:85,90` in the `:81–90` block. Repoint the existing empty and success assertions at `:62–63,93` and the Spanish assertions at `:71–74` to the corresponding new dictionary copy. Retain all preview, stale-revision, permission, cancel, confirm, and locale assertions.
- **Mutation:** `restore-unqualified-clear-copy` fails the console-only and dialog tests. Keep the existing mutation that drops the revision check separate.
- **Injection and release:** The host already injects the Email Activity controller and permissions. Keep `./screens/email/EmailActivityTab`. Add `.changeset/email-capture-scope-copy.md` for `@jini-ai/admin` patch. No API-baseline delta. Why-comment: a delivery record can remain after its message copy is gone, or exist without a message copy at all.

### B-VIDEO-NOTE.J — Carry one typed conversion notice through the two route specs

**BUILDER: SOL (OPUS-REVIEW)**  
Repo: Jini. B-VIDEO-NOTE.T supplies the host outcome after this contract lands.

- **Files:** `J/core/src/contracts/site/cms-media.ts:186,239`, `J/cms/src/admin-http/routes/media/upload.ts:26–37,121–159`, and `J/cms/src/admin-http/routes/media/import-url.ts:28–36,70–96`. Use the existing adjacent `__tests__/upload.test.ts` and `__tests__/import-url.test.ts`. The UI port is `J/admin/src/screens/media/hooks/media-port.hooks.ts:36–41`.
- **Tests first:** Add `upload returns the original media with a safe conversion notice`, `URL import returns 201 with the original media and the same notice`, and `successful and non-video uploads omit conversionNotice`. Inject a storage result with the allowed literal. Assert that the authorized response preserves the original projected `media` and contains exactly the known code, with no cause, path, or provider text. Keep unauthorized and normal wire-shape controls. In both route suites, inject `conversionNotice: "/tmp/x provider said …" as never` and assert that `conversionNotice` is absent, not merely empty, and the projected media is unchanged.
- **Types and ports:** At the existing core subpath add `export type MediaConversionNotice = "web-copy-unavailable"` and `export type MediaUploadResult<Media> = { media: Media; conversionNotice?: MediaConversionNotice }`. Keep `AdminMediaEnvelope` unchanged for unrelated reads, replacements, and mutations. At `upload.ts:30` change `storeUpload: (required: MediaUploadInput) => Promise<MediaUploadResult<MediaRecord>>`. At `import-url.ts:31` change `uploadMedia: (required: MediaImportUpload) => Promise<MediaUploadResult<MediaRecord>>`. Change only those return types. Neither dep takes `_optional` today, so add no parameter. Widen only `MediaPort.uploadMedia`'s return type to `Promise<MediaUploadResult<AdminMedia>>`.
- **Route specs:** At `upload.ts:124` change `persistUpload`'s return to `Promise<MediaUploadResult<AdminMediaDto>>`, retaining its existing `_optional` pad. At `:150` change the `defineJsonRoute` result generic from `AdminMediaEnvelope` to `MediaUploadResult<AdminMediaDto>`. Bind the full storage `result` at `:127`, keep the existing `media` projection and content-type/event work, and await the existing `describeStored` projection at `:134` before adding the notice. At `import-url.ts:70` use `MediaUploadResult<object>`. Bind the full storage `result` at `:83`, keep `mediaContentTypeStore.set` and `toMediaResponse`, and add the notice after the projection at `:91`. In **each** route use exactly `...(result.conversionNotice === "web-copy-unavailable" ? { conversionNotice: "web-copy-unavailable" as const } : {})`. No helper export. Keep authorization order, status, original-asset projection, and host mounts of both `defineJsonRoute` specs.
- **Mutations:** `drop-conversion-notice` fails both positive route witnesses. `forward-arbitrary-notice-value` replaces the spread with `conversionNotice: result.conversionNotice` and fails the arbitrary-value fixtures. Neither needs a real provider.
- **Release:** Keep the existing `./contracts/site/cms-media` and media route and port subpaths. Add `.changeset/media-conversion-notice.md` for `@jini-ai/core`, `@jini-ai/cms`, and `@jini-ai/admin`, patch. Do not hand-edit the hash-based API baselines. The Opus verification run executes `pnpm api:update` and confirms that only the additive cms-media, route, and port shapes change. Why-comment: an upload succeeded even when making the optional playable copy failed. Diagnostics never travel in the success response.

## Tovu SOL

### B-MEDIA-DATE.T — Bind the browser's time zone in Media

**BUILDER: SOL**  
Repo: Tovu. After B-MEDIA-DATE.J is available.

- **Files:** `A/features/media/Media.tsx`. Add `A/features/media/__tests__/media-card-viewer-zone.unit.test.tsx`.
- **Test first:** `Media shows the owner's calendar date and preserves the upload instant`. Render the real Media grid with a fake controller injected through the existing `useMediaHook` prop (`Media.tsx:1000`). Give it an `en-US` card stamped `2026-11-25T07:30:00.000Z` and pass `America/Los_Angeles` as the viewer zone. Assert `Nov 24, 2026` in the actual card's `<time>` and the original ISO string in `datetime`.
- **Exact prop chain in `Media.tsx`:**
  1. At `MediaProps` (`:995`), add `viewerTimeZone?: string`.
  2. At `Media` (`:1477`), add `const viewerTimeZone = props.viewerTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone`. Pass `viewerTimeZone={viewerTimeZone}` on `<MediaLibraryPanel>` (`:1545`).
  3. At the `MediaLibraryPanel` props type (`:1192`), add `viewerTimeZone: string`. Destructure beside `locale` (`:1233`) and pass `viewerTimeZone={viewerTimeZone}` on `<MediaGridOrEmpty>` beside its locale prop (`:1292`).
  4. In `MediaGridOrEmpty` (`:1099–1119`), add `viewerTimeZone` to the destructure alongside `locale` (`:1105`) and `viewerTimeZone: string` to its type (`:1119`). Add `viewerTimeZone` to `menu={{ … }}` (`:1152`).
  5. In `MediaCardMenuProps` (`:1032–1034`), add `viewerTimeZone: string`.
  6. At `MediaCardMetadata` (`:1017–1018`), add `viewerTimeZone: string` to props and call `useMediaCardMetadata({ item: props.item }, { locale: props.locale, viewerTimeZone: props.viewerTimeZone })`. Pass `viewerTimeZone={menu.viewerTimeZone}` into `<MediaCardMetadata>` at `:1086`.
- **Mutation:** `drop-zone-at-card-boundary` fails the rendering witness.
- **Injection:** Resolve the browser zone once per render at the host screen. `Media(props: MediaProps)` stays a React component. Leave `ExternalProvidersPanel`, sorting, stored timestamps, and the configured site time zone untouched. Add no hook. Why-comment: the site zone controls site schedules, not how an owner sees a local upload time.

### B-ERROR-LEDGER.T — Remove the 32 rows that name absent files

**BUILDER: SOL**  
Repo: Tovu

- **Files:** `development/scripts/error-gate-debt.json`. Add `development/scripts/__tests__/moved-admin-surface-error-debt.test.mjs`. `development/scripts/check-error-gate.mjs:106,122–128` shows that stale rows are reported but do not cause a gate failure.
- **Test first:** `every Tovu error-debt row names a file that exists`. Read the real ledger relative to `import.meta.url`, resolve each row's `file` against the repository root derived from the test URL, and assert that the list of missing files is `[]`. Do not write a fixture or depend on the working directory. The pre-edit ledger has 290 rows, of which 32 refer to 31 absent paths.
- **Change:** Delete exactly the 32 rows below by hand. The numbers are the original ledger object start lines. Match by `file` and, for the repeated path, by `rule`. Keep the other 258 rows and their values untouched. Do not run `--update`, which would also lower improved values. Do not change the error gate or architecture baseline.

```text
  12  A/features/auth/hooks/use-login.hooks.ts
  37  A/features/database/hooks/use-migrate-forward-section.hooks.ts
  42  A/features/deployment/deployment-i18n.tsx
  97  A/features/media/hooks/use-remote-image-import.hooks.ts
 127  A/features/plugins/hooks/use-admin-surface-frame.hooks.ts
 142  A/features/recovery/hooks/use-recovery.hooks.ts
 147  A/features/roles/hooks/roles-row-actions.ts
 187  A/features/security/security-i18n.ts
 192  A/features/security/SiteKeyTab.hooks.tsx
 227  A/features/source-control/source-control-i18n.ts
 232  A/features/taxonomy/hooks/use-new-taxonomy-form.hooks.ts
 237  A/features/taxonomy/hooks/use-new-term-form.hooks.ts
 267  D/desktop-agent-inventory.ts
 417  W/assistant/cli-probe-cache.ts
 487  W/features/comments/provider-selection.ts
 557  W/features/form-destinations/deliver.ts  catch-reads-error
 562  W/features/form-destinations/deliver.ts  failure-text-from-catalog
 587  W/features/identity/api-key-secret.ts
 607  W/features/media/analytics.ts
 622  W/features/media/view-image-tool.ts
 632  W/features/member-login/oidc-login.ts
 637  W/features/members/member-sign-in.ts
 642  W/features/members/repo.memory.ts
 657  W/features/newsletter/launch-gate.ts
 677  W/features/post/go-live-sweep.ts
 697  W/features/publish-content/apply-retire.ts
 737  W/features/publish-trust/keys.ts
 757  W/features/settings/visitor-tools-write.ts
 922  W/platform/db/journal-kernel.ts
1047  W/server/inbound/admin-http/routes/media/put-providers.ts
1072  W/server/inbound/admin-http/routes/users/create.ts
1117  W/server/inbound/public-http/http/site/member-auth-script.ts
```

- **Mutation:** `restore-deleted-frame-hook-debt` re-adds the original `:127–131` entry for `apps/admin/src/features/plugins/hooks/use-admin-surface-frame.hooks.ts`, `catch-reads-error`, `value: 1`, and turns the missing-file test red.
- **Injection:** No public signature or host injection. Keep the frame-hook rationale in the test and extend it to rows for files moved to Jini or deleted. A host debt allowance for an absent file can no longer describe a real host source.

## OPUS

### B-DESKTOP-CACHE.T — Bound or retire per-site browser caches without touching site data

**BUILDER: OPUS · Repo: Tovu · Cache disposal and close ordering require a real Electron check.**

- **Files:** `D/main/index.ts:576–600,890–934`, `D/project-ipc.types.ts:198`, `D/project-ipc.delete.ts:101–150`, `D/project-ipc.test.ts:644–681`. Use `D/desktop-auth.ts:105–107` as the partition authority.
- **Tests first:** `project removal clears only the retired site's web caches after untracking`; `a refused erase never touches the site's partition cache`; `cache cleanup failure does not turn completed project removal into failed deletion`. With a recording fake, feed two tracked sites and assert the exact canonical partition for the removed site and zero calls for the other site. The packaged witness must distinguish the HTTP disk cache from code cache and show what happens to an already-grown partition. Sign-in and reopening a kept site are controls.
- **Change:** Add a required port to the existing `ProjectIpcDeps` object, `trimRetiredSiteCache: (required: { siteDir: string }, optional?: Record<string, never>) => Promise<void>`. Add it to the existing dependency picks. Invoke it in the serialized removal path only after untracking has succeeded, for both completed removal branches. Bind it in `buildProjectDeps` to the named site partition, never the default session. Use Electron's supported cache-only API. `D/desktop-capture.ts:57` shows an existing `clearCache()` call, but that alone is not proof about code cache. Report failures through the host diagnostic sink without exposing local paths in the user-visible message. Keep the deletion result unchanged. Do not clear cookies, local storage, IndexedDB, service-worker data, or database files, and do not recursively remove a live Chromium cache directory.
- **Active cache bound:** Verify the pinned Electron API and the first construction of a site partition before selecting a cap or cache opt-out. The report's suggested `session.setCacheSize` is not a verified callable on this tree. If the pinned runtime has no supported per-partition bound, use a supported cache-only policy and prove the bound in a packaged run, or report that only retirement cleanup is fixed. Do not advertise a cap based on a fake port passing.
- **Mutations:** `trim-default-partition`, `trim-before-untrack`, and `propagate-cache-failure` fail the corresponding tests. Why-comment: the partition also carries sign-in and site state, so only regenerable cache data is within scope. No package exports or migrations.

### B-VIDEO-NOTE.T — Preserve the original, report the safe outcome, and show it in Media

**BUILDER: OPUS · Repo: Tovu · After B-VIDEO-NOTE.J**

- **Files:** `W/features/media/import-video-conversion.ts:19–33,50–86,99–109,133–144`, `W/server/runtime/composition/modules/media.ts:228–232,304–324`. Client changes in `A/features/media/api/media-api.ts:64–79`, `hooks/media-import-dependencies.hooks.ts:9–10`, `hooks/use-media.hooks.ts:151–167,188–214`, `media-i18n.ts`, and the Media panel body in `Media.tsx:1209–1259`. Keep the existing upload port binding in `hooks/media-dependencies.hooks.ts:19`.
- **Tests first:** Add `a failed video conversion returns the original and never serializes its cause` to the import conversion tests and a mounted direct-upload and URL-import witness in `W/server/inbound/admin-http/routes/media/__tests__/`. Use a fake converter with a low injected threshold and an exception containing a canary. Assert the converter is attempted once, the original asset still resolves, the notice code is present in both mounted responses, and the canary is absent from the response. Add `Media shows a saved-without-playable-copy status after a successful upload` with a fake upload port. Assert the successful upload still refreshes the list, the form closes, and the non-error status remains visible outside the modal. A subsequent successful upload without a notice clears it.
- **Change:** Keep the existing factory inputs. Change `withVideoConversionOnImport({ storeUpload, conversion }, _optional = {})` and `createConvertingUploader(required, { video } = {})` to return the existing upload callable with result `Promise<MediaUploadResult<MediaRecord>>`. Change private `convertStoredUpload(required, _optional = {}): Promise<MediaConversionNotice | undefined>` to return the fixed code on attempted conversion failure, after reporting through the current injected diagnostic sink. For no conversion, no configured hook, or success, omit the field. Merge the field into the individual request's result. Do not use a shared “last conversion error” variable or recompute a conversion on the client. Keep provider causes in host diagnostics only and use the host's redaction path for any copied details.
- **Client:** Type the two responses as `MediaUploadResult<AdminMedia>`. In the existing `useMedia` upload mutation consume the result and store `conversionNotice ?? null` in the controller, resetting it when a new accepted upload starts. Render a localized `role="status"` outside the upload dialog. Copy: “The video was saved as uploaded. A web-playable copy could not be made.” The URL route and existing API port carry the same code. Do not create a URL-import screen as part of this bug. Do not introduce a new custom hook, alter P10 conversion thresholds, or change assistant tool results.
- **Mutations:** `return-stored-without-notice` fails the mounted witnesses. `serialize-converter-cause` fails the canary assertions. `render-notice-inside-closed-modal` fails the Media witness.
- **Injection:** Keep using the host's converter, repositories, clock, upload caps, and diagnostic sink. The browser receives a fixed code and localizes it. Why-comment: the notice belongs to the request that stored the original, not to the shared converter or the media record. No migration.

## Non-build dispositions

- **O02 — OWNER-CONFIRM (rec: keep the exclusion until a captions UI exists).** `OWNER-DEFAULT: 2`. Keep `text/vtt` out of the Media picker. `cloud-results/combine-21.md:112` says “Confirm”, not that the owner confirmed it. The picker characterization excludes it at `A/features/media/__tests__/Media.unit.test.tsx:259–263`. Captions serving is separate at `W/server/inbound/public-http/routes/site/media-rendition.ts:638`, with a WebVTT response witness in the adjacent `__tests__/media-rendition.route.test.ts:161–167`.
- **O03 — OWNER-CONFIRM (rec: keep 550 MiB so one 500 MiB video plus prompt fits).** `OWNER-DEFAULT: 3`. Keep the cap and do not restore the old test limit. `cloud-results/combine-21.md:113` still asks for confirmation. Tovu `packages/contracts/src/upload-limits.ts:43` defines `MAX_UPLOAD_BATCH_BYTES = VIDEO_UPLOAD_LIMIT_BYTES + MAX_UPLOAD_BYTES`, with 500 MiB and 50 MiB defined at `:13` and `:10`. `A/components/AssistantDock/hooks/composer-files.hooks.ts:38,47` binds it as `maxBatchBytes`. The AssistantDock witness at `A/components/__tests__/AssistantDock.hooks.unit.test.tsx:1559–1565` fills the shared cap across a rerender and rejects one more byte.
- **Legacy redirect overflow — partly done, not sheeted.** New creation and activation already refuse at capacity (`J/cms/src/redirects/redirects.ts:515–520`). The resolver still bounds matching at 500 (`J/cms/src/redirects/resolver.ts:56–57,99–105`). First reproduce an import, restore, or upgrade ingress that can leave an existing site above the cap. Only if reproduced, use the check's unnumbered default of bounded matching plus an explicit owner warning, without silently deactivating or deleting rows.
- **Closed rows stay closed.** D01–D33 and O01 produce no build work. The unambiguous D23 witness is `W/server/runtime/composition/__tests__/form-delivery.security.test.ts:142`. No rejected sheets or new sheets from other lanes.
