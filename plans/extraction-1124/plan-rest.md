PLAN r62t-plan-rest PARTIAL: 14 MOVE / 28 STAYS-HOST / 16 sheets

The 16 sheets are eight Jini/Tovu pairs. The counts cover 74 current production files, including the two feature stylesheets. A split is counted once, under the disposition of the source row. Tests and new seam files are not counted. The remaining 32 files are **NOT-PLANNED**. Their destination column is a recommendation, not permission to execute a move.

Base used: Tovu `caa3ac7811f3ca15afb782ef0c4823f2d2cd5f8f`, Jini `dc2349f5194b8fcc2994e5c50936946f8229fab3`. The November 24 source and planner inputs take precedence over the November 22 destination guesses. In particular, the members screen and the publish-trust route specs are already in Jini. The dispatch waived the missing `AI-Dev-Shop` bootstrap. Architecture sections 13 and 14 were also absent from this checkout. No files were changed and no tests, builds, installs, or type-checks were run.

**Execution convention.** Land the applicable `.J` halves first, in order, then their `.T` halves against that Jini revision. Do not send any **OPUS-CLOUD** pair to Sol. In the tables, paths are relative to the stated root. In import ledgers, line numbers identify the starting tree, so match the old literal and symbols if earlier sheets shift the lines. Preserve extensionful `.js` imports inside Jini. Do not add package-to-package implementation imports, compatibility re-exports, or optional defaults for injected custom hooks.

For each new public subpath `./x` below, add `exports["./x"]` with `types: "./dist/x.d.ts"`, `import: "./dist/x.js"`, and `default: "./dist/x.js"`, plus `jini.entries["./x"]` with the specified environment. Add a corresponding `typesVersions["*"]` entry if that manifest uses explicit entries for the affected surface. The verification run owns `pnpm api:update` and review of the named baseline diffs. It should reject unrelated API drift. Tovu needs no new package dependency for these sheets.

## adm-security

Source root `apps/admin/src/features/security/`. `S` means `packages/admin/src/security/`. Recovery cards belong to `@jini-ai/user-management`, not to a new user-management dependency on `@jini-ai/admin`.

| File | Disposition | Jini destination | Blocking dependency or host reason |
|---|---|---|---|
| `AccessTokensTab.hooks.tsx` | NOT-PLANNED | `S/host/AccessTokensTab.hooks.tsx` | Store order, category rules, controller types, and remove confirmation |
| `AccessTokensTab.tsx` | NOT-PLANNED | `S/host/AccessTokensTab.tsx` | Host copy, visuals, credential hint, provider descriptors, three wired hooks |
| `CopyKeysDialog.tsx` | MOVE | `S/host/CopyKeysDialog.tsx` | S02 kit and CSS seam |
| `OtherCredentialsSection.hooks.tsx` | NOT-PLANNED | `S/host/OtherCredentialsSection.hooks.tsx` | Remove confirmation and controller seam |
| `OtherCredentialsSection.tsx` | NOT-PLANNED | `S/host/OtherCredentialsSection.tsx` | Host remove copy, locale, and other-credentials controller |
| `RecoveryCodesCard.hooks.ts` | NOT-PLANNED | Existing `packages/user-management/src/react/auth/RecoveryCodesCard.hooks.ts` | Replace the duplicate only with proof of host formatter, download, and reset parity |
| `RecoveryCodesCard.tsx` | NOT-PLANNED | Existing `packages/user-management/src/react/auth/RecoveryCodesCard.tsx` | Existing injected card, legacy call site, and source-scanning autocomplete test |
| `Security.hooks.ts` | STAYS-HOST | — | Owns `/access-tokens?tab=…` navigation |
| `Security.tsx` | NOT-PLANNED | `S/host/Security.tsx` | Host-owned MFA/passkey/recovery composition and security tab bodies |
| `SiteKeyRecoveryCard.tsx` | NOT-PLANNED | `S/host/SiteKeyRecoveryCard.tsx` | Start-fresh and key-recovery controller |
| `SiteKeyTab.tsx` | NOT-PLANNED | `S/host/SiteKeyTab.tsx` | Required locale, reveal, generation, and recovery hooks |
| `access-token-copy.ts` | STAYS-HOST | — | Deployment/provider labels and product copy |
| `access-token-forms.ts` | NOT-PLANNED | `S/host/access-token-forms.ts` | Host error class and deployment/source-control form policy |
| `copy-keys-dialog.css` | STAYS-HOST | — | Host theme styling, mounted by S02.T |
| `hooks/access-tokens-dependencies.hooks.ts` | STAYS-HOST | — | Binds security, deployment, source-control and provider clients |
| `hooks/other-credentials-dependencies.hooks.ts` | STAYS-HOST | — | Binds assistant, media and integrations clients and test doubles |
| `hooks/other-credentials-port.hooks.ts` | NOT-PLANNED | `packages/core/src/contracts/site/admin-other-credentials.ts` | `AdminMediaProviderMap` still defined by the host media client |
| `hooks/security-permissions-dependencies.hooks.ts` | STAYS-HOST | — | Agreed keep. Binds `authApi`, query hook and host permission ID |
| `hooks/site-key-dependencies.hooks.ts` | STAYS-HOST | — | Binds `sitesApi` |
| `hooks/site-key-port.hooks.ts` | MOVE | `packages/core/src/contracts/site/site-key.ts` | Append the current `SiteKeyPort` declaration |
| `hooks/site-key-status.rules.ts` | MOVE | `S/host/hooks/site-key-status.rules.ts` | Inject the host's fallback environment name |
| `hooks/use-access-tokens.hooks.ts` | NOT-PLANNED | `S/host/hooks/use-access-tokens.hooks.ts` | Host credential copy, error normalization, refresh, and provider form policy |
| `hooks/use-copy-keys.hooks.ts` | MOVE | `S/host/hooks/use-copy-keys.hooks.ts` | S02 splits the real HTTP and refresh binding back into Tovu |
| `hooks/use-other-credentials.hooks.ts` | NOT-PLANNED | `S/host/hooks/use-other-credentials.hooks.ts` | Redaction, catalog, locale, media shape, and live binding |
| `hooks/use-site-key-recovery.hooks.ts` | NOT-PLANNED | `S/host/hooks/use-site-key-recovery.hooks.ts` | Host error/locale seam and destructive recovery invariants |
| `hooks/use-site-key.hooks.ts` | NOT-PLANNED | `S/host/hooks/use-site-key.hooks.ts` | Error classification, locale, query hooks, and secret lifetime |
| `index.ts` | STAYS-HOST | — | Existing entry to the still-local `Security` mount |
| `other-credential-stores.ts` | NOT-PLANNED | `S/host/other-credential-stores.ts` | Host must inject the media catalog and store definitions |
| `rules.ts` | STAYS-HOST | — | Host permission, refresh resource and category composition |
| `security-host-ports.ts` | STAYS-HOST | — | Owner-authenticated request and workspace binding |

### S01.J → S01.T — site-key contract and status label, OPUS-CLOUD

**Jini.** Add tests first in `S/host/__tests__/site-key-status.rules.test.ts`. Copy the inactive, file, explicit environment, and missing environment cases from Tovu's `__tests__/site-key-status.rules.unit.test.ts`, using `t: String` in Jini. Named fixture mutation `SITE-KEY-FALLBACK-HOST` supplies a non-Tovu fallback and expects the new name only when the server omitted its own. Keep the German translation assertion in Tovu.

Append `SiteKeyPort`, with its current member signatures and comments, to core's existing `contracts/site/site-key.ts`. Remove the redundant same-file DTO import in the moved declaration. Move the status rules file and change its first args object to:

```ts
{
  status: Pick<AdminSiteKeyStatus, "active" | "source" | "envVarName">;
  t: Translate;
  fallbackEnvVarName: string;
}
```

Keep `_optional = {}`. Replace only the hardcoded nullish fallback with `fallbackEnvVarName`. Preserve the why-comment assigning environment provenance to the status rules. Export admin `./security/host/hooks/site-key-status.rules` as `universal`. Core uses the existing `./contracts/site/site-key` export. Baselines `jini-ai__admin.json` and `jini-ai__core.json`.

**Tovu.** Delete the two source files after these repoints:

- `__tests__/use-site-key.unit.test.tsx:7`, `hooks/site-key-dependencies.hooks.ts:2`, `hooks/use-site-key-recovery.hooks.ts:9`, `hooks/use-site-key.hooks.ts:11` import `SiteKeyPort` from `@jini-ai/core/contracts/site/site-key`.
- `SiteKeyTab.tsx:1`, `__tests__/site-key-copy.i18n.unit.test.tsx:5`, `__tests__/site-key-status.rules.unit.test.ts:2` import `siteKeyStatusBadgeLabel` from `@jini-ai/admin/security/host/hooks/site-key-status.rules`. Add `fallbackEnvVarName: "TOVU_SITE_KEY"` to the existing args object at each call in those three files. Do not change DTO handling, locale keys, or the actual environment name from the server.

**STOP** if the port already exists with different DTOs or a caller needs behavior changes. This sheet must not touch reveal, generation, import, or start-fresh implementation.

### S02.J → S02.T — saved-key picker, OPUS-CLOUD

**Jini.** Tests first in `S/host/__tests__/copy-keys-picker.test.tsx`. Use `AdminKitProvider` and `fakeAdminKit` from admin's local React modules. Port the Tovu picker assertions for one selected reference, no other-site inventory, and redacted failure. Assert the notifier fires once after a resolved copy and never on rejection. Named fixture mutation `COPY-KEYS-NONDEFAULT-SOURCE` changes the injected source ID and proves the same ID drives both selection and the outgoing request. Keep Tovu's actual Shared Keys ID pinned in its tests.

Move `CopyKeysDialog.tsx` and `hooks/use-copy-keys.hooks.ts` into `S/host/`. In the dialog, replace the `@jini-ai/ui-kit/react` import with `{ Button, Dialog }` from `../../react/kit.js`. Use `./hooks/use-copy-keys.hooks.js` for the type and remove both CSS imports. No UI dependency or kit expansion is needed. In the hook, use `AdminCredentialCopySource` and `AdminCredentialCopyResult` from `@jini-ai/core/contracts/site/api-security-api-types`. Use these seams:

```ts
interface CopyKeysPort {
  listCredentialCopySources(
    required: Record<string, never>,
    optional?: Record<string, never>,
  ): Promise<{ sources: AdminCredentialCopySource[] }>;
  copyCredentials(
    required: { sourceSiteId: string; ids: string[]; overwrite: boolean },
    optional?: Record<string, never>,
  ): Promise<{ results: AdminCredentialCopyResult[] }>;
}

interface CopyKeysArgs {
  t: Translate;
  port: CopyKeysPort;
  onGranted: (required: Record<string, never>, optional?: Record<string, never>) => void;
  sharedKeys: { sourceSiteId: string; loadFailed: string; grantFailed: string };
}
```

The signature is `useCopyKeys(required: CopyKeysArgs, _optional: Record<string, never> = {})`. Keep `CopyKeysController = ReturnType<typeof useCopyKeys>`. Use `sharedKeys.sourceSiteId`, `.loadFailed` and `.grantFailed` in place of the corresponding constants. Invoke `onGranted({})` at the existing success-side refresh statement. Do not move `useWiredCopyKeys`, the real API import, or the bus import. Keep the effect's live guard and the busy ref. Preserve the metadata-only, one-approval, locked-input and one-selection rationale. Export `./security/host/CopyKeysDialog` and `./security/host/hooks/use-copy-keys.hooks` as `browser`. Baseline `jini-ai__admin.json`.

**Tovu.** Create `hooks/copy-keys-dependencies.hooks.ts`. Put the exact current `SHARED_KEYS`, `LOAD_FAILED`, and `GRANT_FAILED` values in a `copyKeysHostPolicy` object with the three fields above. Export `notifyCopyKeysGranted` with the notifier signature, calling `publishContentRefresh({ resources: [ACCESS_TOKENS_RESOURCE] })`. Export `useWiredCopyKeys({ t }, _optional = {})` and have it call `useCopyKeys({ t, port: securityApi, onGranted: notifyCopyKeysGranted, sharedKeys: copyKeysHostPolicy })`. This file owns real binding code, not a re-export.

- `AccessTokensTab.tsx:36` goes to `@jini-ai/admin/security/host/CopyKeysDialog`, and `:37` goes to `./hooks/copy-keys-dependencies.hooks`. Move the two CSS imports to this mount, as `../../styles/native-domain-dialogs.css` and `./copy-keys-dialog.css`.
- `__tests__/CopyKeysDialog.unit.test.tsx:3–4` goes to the new Jini dialog and hook exports. Use `@/__tests__/render-with-jini-kits` for `render`. Keep Testing Library's `fireEvent` and `screen`. Change the hook call to the new required object with the fake `port`, `copyKeysHostPolicy` and a no-op notifier.
- `__tests__/AccessTokensTab.unit.test.tsx:13` and `hooks/__tests__/use-copy-keys.unit.test.tsx:4` go to the Jini hook export. At the two test overrides in the former and both `renderHook` calls in the latter, move `port` into the first argument with `copyKeysHostPolicy` and a test notifier. Keep the actual `copyCredentials` payload assertions.
- `__tests__/copy-keys.fixture.ts:2–3` uses the core DTO and the Jini `CopyKeysPort`. Delete the two moved sources. No local shim.

**STOP** if the kit-backed dialog no longer preserves form submit, focus, pending cancellation, the redacted message, or one notification on success. For the held security cluster, the only approved continuation is an OPUS-CLOUD plan with exact formatter and controller seams. The current Jini recovery card already takes `port`, `describeFailure`, `FailureNotice`, `filename`, and three required bound hooks. Tovu's `integrations/jini-admin/security-module.hooks.ts:23–38` is the reference composer. Do not move the duplicate card into admin or delete it before migrating `Security.tsx:183`, its tests, and the `credential-input-autocomplete.unit.test.ts:173,213` source assertions.

## adm-themes

Source root `apps/admin/src/features/themes/`. `C` means `packages/core/src/contracts/site/`. `R` means `packages/cms/src/react/themes/`. This lane does not move theme assets, catalogs, rendering engines, server routes, or Tovu's admin theme styling.

| File | Disposition | Jini destination | Blocking dependency or host reason |
|---|---|---|---|
| `HeldBackThemes.tsx` | NOT-PLANNED | `R/HeldBackThemes.tsx` | A452 controller/row seam, injected confirm and error UI |
| `ThemeExplore.hooks.tsx` | NOT-PLANNED | `R/ThemeExplore.hooks.tsx` | Explore file and publish-state contracts |
| `ThemeExplore.tsx` | NOT-PLANNED | `R/ThemeExplore.tsx` | Required wired controller and device/preview/navigation adapters |
| `ThemePreviewReloadButton.tsx` | MOVE | `R/ThemePreviewReloadButton.tsx` | TH03 injects existing visual and locale-aware hook |
| `Themes.tsx` | NOT-PLANNED | `R/Themes.tsx` | Host publish button, site URL, navigation, i18n, and deletion/restore composition |
| `api/held-back-themes-api.ts` | STAYS-HOST | `C/cms-admin-held-back-themes.ts` for DTOs only | HTTP authorization, workspace and POST body binding |
| `api/themes-api.ts` | STAYS-HOST | — | Live request binding shared with dashboard, pages and posts |
| `api/themes-api.types.ts` | STAYS-HOST | `C/cms-admin-theme-types.ts` for types only | `NO_THEME_ID` and its host/server parity pin remain |
| `held-back-themes-failure.ts` | STAYS-HOST | — | Host `ApiError`, error reference disclosure and redaction policy |
| `held-back-themes.css` | STAYS-HOST | — | Host styling |
| `hooks/held-back-themes-dependencies.hooks.ts` | STAYS-HOST | — | Live API binding and host-shaped test doubles |
| `hooks/held-back-themes-port.hooks.ts` | MOVE | `C/cms-admin-held-back-themes.ts` | Move with its six DTOs in TH01 |
| `hooks/theme-explore-dependencies.hooks.ts` | STAYS-HOST | — | Real theme-file HTTP binding |
| `hooks/theme-explore-open-file.hooks.ts` | MOVE | `R/hooks/theme-explore-open-file.hooks.ts` | No runtime collaborator |
| `hooks/theme-explore-port.hooks.ts` | MOVE | `C/cms-admin-theme-explore.ts` | Core `ThemeFileGroup` contract |
| `hooks/theme-explore-url.hooks.ts` | NOT-PLANNED | `R/hooks/theme-explore-url.hooks.ts` for pure selection | Split URL mutation from selection rules |
| `hooks/themes-dependencies.hooks.ts` | STAYS-HOST | — | Binds theme API, Trash API and host fake |
| `hooks/themes-port.hooks.ts` | MOVE | `C/cms-admin-theme-registry.ts` | Core DTOs. Includes Trash contract, no implementation change |
| `hooks/use-held-back-themes.hooks.ts` | NOT-PLANNED | `R/hooks/use-held-back-themes.hooks.ts` | Approval/restore, error presentation, confirm hook, live binding |
| `hooks/use-theme-card-preview.hooks.ts` | MOVE | `R/hooks/use-theme-card-preview.hooks.ts` | React only and existing preview URL contract |
| `hooks/use-theme-delete-request.hooks.ts` | NOT-PLANNED | `R/hooks/use-theme-delete-request.hooks.ts` | Delete dialog and host policy |
| `hooks/use-theme-explore-file-groups.hooks.ts` | NOT-PLANNED | `R/hooks/use-theme-explore-file-groups.hooks.ts` | `ThemeExploreFile`, group ordering, modified-state test |
| `hooks/use-theme-explore-preview.hooks.ts` | NOT-PLANNED | `R/hooks/use-theme-explore-preview.hooks.ts` | Inject host `siteUrl` and preview-refresh hook |
| `hooks/use-theme-explore-theme.hooks.ts` | NOT-PLANNED | `R/hooks/use-theme-explore-theme.hooks.ts` | Split active-theme query from host locale and binding |
| `hooks/use-theme-explore.hooks.ts` | NOT-PLANNED | `R/hooks/use-theme-explore.hooks.ts` | File controller, route state, dirty guard, durable refresh and delete |
| `hooks/use-theme-preview-refresh.hooks.ts` | STAYS-HOST | — | Site/entry preview behavior, locale and host feed binding for this cut |
| `hooks/use-themes.hooks.ts` | NOT-PLANNED | `R/hooks/use-themes.hooks.ts` | Live registry, durable refresh, locale and Trash binding |
| `index.ts` | NOT-PLANNED | — | Delete when the two lazy mounts repoint directly to actual screen exports |
| `rules.ts` | NOT-PLANNED | `R/rules.ts` for neutral rules | Resource names and no-theme sentinel remain host |
| `theme-card-menu.ts` | NOT-PLANNED | `R/theme-card-menu.ts` | Row menu type and delete policy |
| `theme-preview-refresh.ts` | STAYS-HOST | — | One document bus, SSE/POST dedup and Tovu preview URL protocol |
| `themes-i18n.ts` | NOT-PLANNED | `R/i18n/` for a dictionary factory and locale slices | `COMMON_I18N`, product strings and imported sentinel |

### TH01.J → TH01.T — theme DTOs and ports, OPUS-CLOUD

**Jini.** The elevated lane is for the deletion and approval contracts this sheet carries. It does not change a delete or restore operation. Tests first in `C/__tests__/cms-admin-theme-ports.test.ts` using `expectTypeOf`. Pin the argument and result shapes of `ThemesPort["trashTheme"]`, `ThemeExplorePort["deleteThemeFile"]`, and `HeldBackThemesPort["restore"]`. Named type mutation `HELD-BACK-RESTORE-RESULT` widens the expected restore `status` union and must fail equality. Keep Tovu's wire and host binding tests.

Create these four `universal` exports under `./contracts/site/`:

- `cms-admin-theme-types` contains the exact four declarations `ThemeFileGroup`, `PresentationSettings`, `ThemeTier`, `AdminThemeSummary` from `api/themes-api.types.ts`. No runtime literal moves. Carry the comments on mirroring wire shapes, optional older-server fields and `apiVersion`.
- `cms-admin-theme-registry` contains `ThemesPort` verbatim. Import `PresentationSettings` and `ThemeTier` from `./cms-admin-theme-types.js`. The live implementer stays `defaultThemesPort` in Tovu's existing `hooks/themes-dependencies.hooks.ts`.
- `cms-admin-theme-explore` contains `ThemeExploreSlugCollision`, `ThemeExploreFileEntry`, and `ThemeExplorePort` verbatim. Import `ThemeFileGroup` from `./cms-admin-theme-types.js` without re-exporting it. The live implementer stays `defaultThemeExplorePort`. Carry the narrow shape and full-refetch rationale.
- `cms-admin-held-back-themes` contains the six exported DTO interfaces from `api/held-back-themes-api.ts` in their current order, then `HeldBackThemesPort` from its file without the old import. Carry the quarantine-versus-registry split and the ID/digest/token comments. The live implementer stays `defaultHeldBackThemesPort`.

All existing method signatures and optional args stay as written. Core baseline `jini-ai__core.json`.

**Tovu.** Delete the three moved port files. In the two split API type sources remove only the declarations moved above. `api/themes-api.types.ts` keeps `NO_THEME_ID` and the rationale for mirroring it. `api/held-back-themes-api.ts` imports the DTOs it uses from the new core subpath and keeps every request exactly as it is.

The import ledger, with each short name below resolved to its core export:

| New subpath | Tovu files and starting lines |
|---|---|
| `cms-admin-theme-types` | `apps/admin/src/components/TemplateSource/{TemplateSourceModal.tsx:7,use-template-source.hooks.ts:6}`. Under `apps/admin/src/features/`, `pages/PageEditor.tsx:31`, `pages/hooks/{page-editor-dependencies.hooks.ts:2,page-editor-port.hooks.ts:1,use-page-editor.hooks.ts:6}`, `posts/__tests__/post-editor-state.rules.unit.test.ts:3`, `posts/hooks/{post-editor-dependencies.hooks.ts:4,post-editor-port.hooks.ts:2,post-editor-state.rules.ts:1,use-post-editor-screen.hooks.ts:17,use-post-editor.hooks.ts:21}`. In the theme feature, `Themes.tsx:6`, `rules.ts:1`, `theme-card-menu.ts:3`, `api/themes-api.ts:4`, `hooks/{themes-dependencies.hooks.ts:1,use-themes.hooks.ts:4,theme-explore-url.hooks.ts:1}`, `__tests__/{Themes.unit.test.tsx:7,rules.unit.test.ts:3,held-back-themes.unit.test.tsx:6,themes-delete.unit.test.tsx:5,themes-duplicate.unit.test.tsx:5,use-themes.hooks.unit.test.ts:5}`. Split mixed imports so `NO_THEME_ID` stays on its original host specifier. `pages/hooks/use-theme-pages.hooks.ts:2` is value-only and does not change. |
| `cms-admin-theme-registry` | `hooks/{themes-dependencies.hooks.ts:4,use-theme-explore-theme.hooks.ts:5,use-themes.hooks.ts:11}`, `__tests__/use-theme-explore-theme.hooks.unit.test.tsx:6` |
| `cms-admin-theme-explore` | `hooks/{theme-explore-dependencies.hooks.ts:2,use-theme-explore.hooks.ts:20}`, `__tests__/use-theme-explore.hooks.unit.test.ts:11`. At `use-theme-explore.hooks.ts:20` split `ThemeFileGroup` to `cms-admin-theme-types` and keep the hook's existing type exports intact for its current callers. |
| `cms-admin-held-back-themes` | `HeldBackThemes.tsx:7`, `__tests__/{held-back-themes.unit.test.tsx:5,9,use-held-back-themes.hooks.unit.test.tsx:4}`, `hooks/{held-back-themes-dependencies.hooks.ts:3–4,use-held-back-themes.hooks.ts:5,9}`. Leave `heldBackThemesApi` on its old path in mixed imports. |

**STOP** if any wire member changes optionality, an approval field changes name, or a type move requires a runtime dependency in core. No new wrapper export for the DTOs.

### TH02.J → TH02.T — open-file predicates and card preview, Sol

**Jini.** Move `__tests__/theme-explore-open-file.hooks.unit.test.ts` and `__tests__/use-theme-card-preview.hooks.unit.test.ts` first to `R/__tests__/`. Their relative production imports become `../hooks/theme-explore-open-file.hooks.js` and `../hooks/use-theme-card-preview.hooks.js`. Named fixture mutations `OPEN-FILE-OTHER-THEME` and `ADVERTISED-PNG` use the existing mismatched loaded theme and explicitly advertised screenshot cases. The tests must distinguish a saved buffer from unrelated unsaved text and advertised artwork from legacy lookup.

Move the two `hooks/` sources to `R/hooks/`. Preserve the distinct loaded-buffer, unsaved-content, and advertised-versus-legacy image why-comments. Add the defaulted second empty object to `keepsOpenFileSelected` without changing its first object or result. Export `./react/themes/hooks/theme-explore-open-file.hooks` as `universal` and `./react/themes/hooks/use-theme-card-preview.hooks` as `browser`. Baseline `jini-ai__cms.json`.

**Tovu.** In `hooks/use-theme-explore.hooks.ts:21`, repoint both predicates to the first CMS export. In `Themes.tsx:14`, repoint `useThemeCardPreview` to the second. Delete the two old sources and the two relocated suites. The default hook on the still-Tovu card remains a host composition choice. No preview URLs or screenshot files change.

**STOP** if an additional caller requires format or fallback changes. This sheet does not move the file controller, the card, or any asset.

### TH03.J → TH03.T — preview reload button, Sol

**Jini.** Create `R/__tests__/ThemePreviewReloadButton.test.tsx` first. Use a supplied control that renders a labelled button and a required hook double. Assert disabled, label, click forwarding, and `role="alert"` from the hook's error. Named fixture mutation `PREVIEW-RELOAD-ERROR` replaces `null` with an error string and must change only the alert. Keep the Tovu suite that exercises real locale and reload behavior.

Move the source to `R/ThemePreviewReloadButton.tsx` with its current exported name `WiredThemePreviewReloadButton`. Delete the two implementation imports and add to its existing props object:

```ts
PreviewReloadControl: ComponentType<{
  className: string;
  label: string;
  reload: () => void;
  disabled?: boolean;
}>;
useThemePreviewReloadButtonHook: (
  required: Record<string, never>,
  optional?: { reload?: () => Promise<void> },
) => { label: string; reload: () => void; error: string | null };
```

Keep the current optional `disabled` and `reloadPreviews` props. Keep the hook's explicit `{}` first argument, the second-object reload override and the alert. Pass `disabled` to the control only when defined. Update, but carry, the why-comment about default reload coming from the supplied hook. This is K2 composition by injection: CMS imports neither admin implementation nor UI kit. Export `./react/themes/ThemePreviewReloadButton` as `browser`, with the same browser forbidden entry constraints as CMS's existing `./react/media`. Baseline `jini-ai__cms.json`.

**Tovu.** Repoint the component import in `ThemeExplore.tsx:3`, `../pages/PageEditor.tsx:3`, `../posts/editor/header/PostEditorToolbarEnd.tsx:1`, `__tests__/theme-preview-refresh.unit.test.tsx:12`, and `__tests__/themes-localization.unit.test.tsx:5` to the CMS export. In each file, import `ThemePreviewReloadControl` from `@jini-ai/admin/react` and `useThemePreviewReloadButton` from the existing Tovu `features/themes/hooks/use-theme-preview-refresh.hooks` path. Pass both as `PreviewReloadControl` and `useThemePreviewReloadButtonHook` at all six JSX mounts. Preserve the existing `disabled` and `reloadPreviews` overrides. Delete the one relocated source, not the preview hook, bus or tests.

**STOP** if the Pages or Posts caller needs its own subscription, if the control has to be cloned, or if moving this button would change when dirty previews reload. For the held screens, the future K2/K5 split must happen before the lazy imports at `apps/admin/src/panel-pages.ts:16–17` are touched. It must keep `siteUrl`, publish-button composition and preview-feed ownership in Tovu, inject the custom hooks as required props, and move the long functions only after exact, behavior-preserving splits are planned. Anything touching quarantine approval, redaction, Trash, file deletion or restore is OPUS-CLOUD.

## adm-members

Source root `apps/admin/src/features/members/`. No move or package change is warranted on this base.

| File | Disposition | Jini destination | Blocking dependency or host reason |
|---|---|---|---|
| `api/members-api.ts` | STAYS-HOST | — | Binds `request` and `WORKSPACE_ID` to the existing Jini factory |
| `hooks/members-controller.hooks.ts` | STAYS-HOST | — | Binds locale, translator, workspace and authorized refresh |
| `hooks/members-dependencies.hooks.ts` | STAYS-HOST | — | Binds the live `MembersPort` and the product refresh resource |
| `index.ts` | STAYS-HOST | — | Feature entry exports the real host composition object, not a moved Jini symbol |
| `members-i18n.ts` | STAYS-HOST | — | Common dictionary and translated “site visitors” product copy |
| `members-screen-props.tsx` | STAYS-HOST | — | Assembles host UI, copy, live port and wired hook |

**M00 disposition, no executable sheet.** K4 already uses `MembersPort` from `@jini-ai/core/contracts/site/user-management-react`. K5 already uses the required `useMembersHook(required: MembersDependencies, optional?: MembersOptions): MembersController` in Jini `packages/user-management/src/react/members/Members.tsx`. Tovu binds it as `useWiredMembers`, along with `port`, `translate`, `description`, `emptyDescription` and `renderServerLabel`, in `members-screen-props.tsx`. `apps/admin/src/panels.tsx:9,532` already mounts Jini `Members` with that object. The user-management kit is already supplied at `apps/admin/src/main.tsx:98`. No manifest or baseline delta and no import repoints.

Retain the four feature suites, the request-shape tests under `apps/admin/src/lib/__tests__/`, and the panel test at `apps/admin/src/__tests__/unit/panels-render.unit.test.tsx:5,126`. In cloud verification, use the existing Jini required-hook test and the Tovu refresh-scope test. Named fixture mutation `MEMBERS-UNRELATED-REFRESH` substitutes another resource and expects no members re-read. The critical why-comment is the controller's explanation that agent-written member changes must re-read through the authorized host API. **STOP** if the proposed change would move the live binding, product dictionary, or disable/magic-link authorization, or add admin as a domain implementation dependency.

## publish-trust

Source root `apps/website/src/features/publish-trust/`. `P` means `packages/cms/src/publish/trust/`. The current K1 route specs are under `packages/cms/src/public-http/routes/publish-trust/`. Their Tovu composition, admin trust gate and route tests stay host. Do not convert or remount a route here.

| File | Disposition | Jini destination | Blocking dependency or host reason |
|---|---|---|---|
| `challenge.ts` | MOVE | `P/challenge.ts` | Required pinned message format supplied by host |
| `connect.ts` | MOVE, split | `P/connect.ts` | Candidate discovery remains real code at the old host path |
| `handshake-client.ts` | MOVE | `P/handshake-client.ts` | Guarded HTTP, keyring and host protocol copy |
| `host-settings.ts` | STAYS-HOST | — | Product environment, committed config root, and protocol binding |
| `publish-trust-revocations.ts` | STAYS-HOST | — | Host `ContentKernel`, schema, table lock and boot assertion |
| `session.ts` | MOVE | `P/session.ts` | Already-injected clock and core keyring contract |

Prerequisite seam order is PT01 session, PT02 challenge format, PT03 outbound client and connection. All are OPUS-CLOUD. The existing revocation boundary remains `PublishTrustRevocationPort` from `@jini-ai/cms/publish/trust/revocations`. `publishTrustRevocationStoreFor({ kernel }, _optional = {})` is still supplied in `apps/website/src/server/runtime/composition/deps.ts:29`. Do not split out the SQL transaction or move the Tovu migration.

### PT01.J → PT01.T — session codec, OPUS-CLOUD

**Jini.** Move `__tests__/session.unit.test.ts` to `P/__tests__/session.unit.test.ts` first. Change `node:test` to Vitest's named `test`, remove the host catalog bootstrap, and use the core `KeyringPort` type. Copy just the source-scanning `T-D4c` test and its why-comment from `trust-key-pins.characterization.test.ts:124` into `P/__tests__/session-source-pins.test.ts`. Keep its `../session.ts` source URL and checks verbatim. Use the existing claim boundary tests. Named fixture mutation `SESSION-EXACT-EXPIRY` advances the fake destination clock to the exact expiry instant and expects refusal.

Move the codec with `PublishingCapability` from `./grant.js` and `KeyringPort` from `@jini-ai/core/contracts/vault`, the same contract Jini's existing `keys.ts` uses. No runtime keyring import, no new dependencies. Add a defaulted empty second object where the private `sessionKey`, `macMatches` and `claimRefusal` helpers currently take only one object. Keep the public `{ deps, input }` / `_optional = {}` shapes and the existing clock and keyring supplied by Tovu. Carry the purpose separation, claim ordering, length guard, and source why-comments. Export `./publish/trust/session` as `node`. Baseline `jini-ai__cms.json`.

**Tovu.** Repoint the following to `@jini-ai/cms/publish/trust/session`:

- Feature `__tests__/frozen-values.pins.test.ts:15`, `__tests__/handshake.test.ts:16`, `__tests__/trust-key-pins.characterization.test.ts:8`.
- Under `apps/website/src/server/`, `__tests__/routes/publish-trust-gate-predicates.characterization.test.ts:13`, `__tests__/routes/publish-trust-gate.test.ts:16`, `inbound/admin-http/publish-trust-auth.ts:14`, `inbound/public-http/middleware/__tests__/unit/async-error-forwarding.unit.test.ts:9`, and `runtime/composition/modules/publish-trust.ts:13`.

Remove the relocated `T-D4c` callback from the Tovu characterization suite and its now-unused `node:fs` and `node:url` imports. Keep the remaining byte and behavior pins there, and keep the host fixed-keyring fixture. Delete `session.ts` and its relocated unit test. Retain the literal `parse-refusal` test case in `development/eslint-rules/__tests__/fixtures/error-gate-sites.json:178`. It is an embedded-code fixture, not a runtime importer.

**STOP** if the equal-length comparison, byte pins, claim ordering, expiry edge, or host authorization result differs. Do not change a reason string or substitute a different keyring.

### PT02.J → PT02.T — challenge format and store, OPUS-CLOUD

**Jini.** Move `__tests__/challenge.unit.test.ts` to `P/__tests__/challenge.unit.test.ts` first. Replace the runner import with `import { test } from "vitest"`, remove the host catalog bootstrap, and use `../grant.js` and `../challenge.js`. Pass an explicit test message version in the builder inputs and verification deps. Named fixture mutation `CHALLENGE-EXACT-EXPIRY` uses the existing exactly-expired record case. Keep the test that pins field order and the tests that pin the order of verification decisions.

Move `challenge.ts`, changing self-package imports to `./grant.js` and `./keys.js`. Replace its Tovu-specific module constant with these two required fields on existing objects:

- `buildChallengeMessage` takes `messageVersion: string` on its first object, and uses it in the same first-line position.
- `verifyChallengeResponse` takes `messageVersion: string` on its existing `deps` object, alongside `store` and `clock`. Pass it through the private `signatureRefusal` args object to `buildChallengeMessage`.

`issuePublishChallenge`, the in-memory store and the record/response types do not change. Preserve the why-comments on canonical format, one clock reading, consume-on-read, validation ordering and refusal disclosure, moving the version comment to the injected field. Export `./publish/trust/challenge` as `node`. Baseline `jini-ai__cms.json`.

**Tovu.** Add `PUBLISH_TRUST_WIRE` to the real host module `host-settings.ts`:

```ts
export const PUBLISH_TRUST_WIRE = {
  messageVersion: "tovu-publish-challenge-v1",
  peerSiteLabel: "a Tovu site",
  notPeerFailure: "not-a-tovu-site",
} as const;
```

Repoint `../challenge.js`, `./challenge.js` and `#src/features/publish-trust/challenge` at these sites to `@jini-ai/cms/publish/trust/challenge`:

- Feature `handshake-client.ts:3`, `__tests__/frozen-values.pins.test.ts:9`, `__tests__/handshake-client.unit.test.ts:8`, and `__tests__/handshake.test.ts:13`.
- Under `apps/website/src/server/`, `__tests__/routes/publish-trust-gate-predicates.characterization.test.ts:10`, `__tests__/routes/publish-trust-gate.test.ts:11`, `__tests__/routes/publish-trust-revocation-gate.test.ts:11`, `inbound/public-http/routes/publish-trust/__tests__/handshake-keyless.unit.test.ts:7`, `runtime/composition/modules/core.ts:7`, and `runtime/composition/modules/publish-trust.ts:10`.

Supply `messageVersion: PUBLISH_TRUST_WIRE.messageVersion` in every direct builder call in the feature's `handshake-client.ts`, `frozen-values.pins.test.ts`, `handshake-client.unit.test.ts`, and `handshake.test.ts`, and in the two route gate tests that build a message. Supply the same field in `verifyChallengeResponse`'s `deps` in `handshake.test.ts` and the production verifier binding at `server/runtime/composition/modules/publish-trust.ts:105`. Do not add the field to unrelated `issuePublishChallenge` calls. Delete the moved source and unit test. The Tovu frozen-values test must continue to expect the literal format tag.

**STOP** if the route spec must change, an existing fixture is signed and verified with different formats, or maintaining parity requires a temporary second message builder. PT03 may reuse the same Jini builder, not duplicate it.

### PT03.J → PT03.T — guarded outbound client and connect/disconnect, OPUS-CLOUD

**Jini.** Tests first. Create `P/__tests__/handshake-client.test.ts` with an injected HTTP double that answers identity and one that returns 404. Assert the original identity path and that a non-Tovu `peerSiteLabel` and matching `notPeerFailure` reach the existing structured error. Create `P/__tests__/connect.test.ts` using the existing in-memory `connectionFixture` pattern in Tovu's `grant-backstop.test.ts`, with local Jini grant and provisioning imports, an injected protocol object and a fake clock formatter. Copy the backstop exclusion, idempotent reconnect and disconnect cases. Named fixture mutation `CONNECT-REPEAT-SAME-DOCUMENT` retains the fixture's committed document for the second connect and asserts `changed: false` and one grant.

Move `handshake-client.ts` to `P/handshake-client.ts`. Its HTTP type comes from the narrow shape below, with `HttpRequest` and `HttpResponse` from core primitives and the keyring type from `@jini-ai/core/contracts/vault`. Use local `./grant.js`, `./keys.js` and `./challenge.js`.

```ts
interface PublishHandshakeHttpPort {
  send(
    request: HttpRequest,
    options?: { redirect?: "follow" | "error" | "manual" },
  ): Promise<HttpResponse>;
}

interface PublishTrustWire {
  readonly messageVersion: string;
  readonly peerSiteLabel: string;
  readonly notPeerFailure: `not-a-${string}-site`;
}

interface HandshakeClientDeps {
  readonly httpClient: PublishHandshakeHttpPort;
  readonly protocol: PublishTrustWire;
}
```

Use `PublishTrustWire["notPeerFailure"]` in the failure union instead of the host literal. In the existing `notATovuSite` helper, the 404 mapping, and the non-JSON mapping, use `protocol.peerSiteLabel` and `protocol.notPeerFailure` in place of the product literals. Keep each sentence template, suffix and existing body-quote bound otherwise unchanged. Thread `protocol` through the existing helper args objects. Give `callHandshake` one first object `{ deps, request }` and a defaulted empty second object. Pass `deps.protocol.messageVersion` to the builder. Do not add a fallback HTTP implementation, change error classification, or move guarding into Jini. Carry the single egress seam, error-disclosure and verbatim destination-origin rationale.

Copy only the region of Tovu `connect.ts` from `export interface ConnectDeps` through the end of `disconnectDestination` into `P/connect.ts`, with the relevant file-level rationale and imports. Do not copy the candidate discovery function, env-key regexp or DevOps import. Use same-package relative trust imports and the core keyring and `Clock` types. `ConnectDeps` keeps its current fields, extends the new `HandshakeClientDeps`, and adds:

```ts
readonly nowIso: (
  required: { clock: Clock },
  optional?: Record<string, never>,
) => string;
```

Call `deps.nowIso({ clock: deps.clock })` at the existing clock conversion. Keep `disconnectDestination`'s `Pick` limited to `keyring`, `provisioning`, and `workspaceId`. Import `PublishTrustHandshakeError` at its actual owner if runtime use requires it. Do not re-export it from `connect`. Preserve why-comments for destination workspace, no private key persistence, next-deploy versus immediate disconnect, and idempotent grant merge. Export `./publish/trust/handshake-client` and `./publish/trust/connect` as `node`. Baseline `jini-ai__cms.json`.

**Tovu.** Keep `features/publish-trust/connect.ts` as the actual candidate-discovery module. Remove the moved region and its unused imports, preserving `findCandidateDestination`, `PUBLIC_URL_KEY`, `PUBLIC_URL_PATTERN`, the `ProvisioningFileIo` type import, and `isContainedDeployConfigPath`. This keeps the exact source pin and the Fly overlay candidate test on their old path. Delete the old `handshake-client.ts`.

- Connect imports to `@jini-ai/cms/publish/trust/connect` under `apps/website/src/`: `features/publish-content/disconnect-tool.ts:7`, `features/publish-content/tool-registrations.ts:34`, `server/runtime/composition/modules/publish-content-transport.ts:15`. Split `features/publish-trust/__tests__/grant-backstop.test.ts:5` and `server/__tests__/routes/publish-zero-setup-end-to-end.test.ts:18` so only `findCandidateDestination` keeps the host specifier. `runtime/composition/modules/publish-content.ts:12` and `runtime/composition/tool-catalog-manifest.ts:11` keep their candidate imports unchanged.
- Handshake imports to `@jini-ai/cms/publish/trust/handshake-client`: `features/publish-content/{destination-credential.ts:1,tool-registrations.ts:35}`, `features/publish-content/__tests__/{destination-credential.test.ts:4,plan-pull-tool.test.ts:163}` including the dynamic import, `features/publish-trust/__tests__/{frozen-values.pins.test.ts:11,handshake-client-keyless.unit.test.ts:5,handshake-client.unit.test.ts:14}`, `server/__tests__/routes/publish-zero-setup-end-to-end.test.ts:19`, `server/inbound/admin-http/routes/publish-content/{peer-transport.ts:13,__tests__/peer-transport.routes.pins.test.ts:9}`, and `server/runtime/composition/modules/publish-content-transport.ts:16`. All class checks use the same Jini error constructor.
- Supply `protocol: PUBLISH_TRUST_WIRE` beside the existing `httpClient` in `features/publish-content/destination-credential.ts`'s `openSession` call, in both `trustDeps` objects at `features/publish-content/tool-registrations.ts:225` and `server/runtime/composition/modules/publish-content-transport.ts:82`, and in the `deps` of all direct identity/session calls in `frozen-values.pins.test.ts`, `handshake-client.unit.test.ts` and `handshake-client-keyless.unit.test.ts`. Keep the original guarded HTTP instances. Import the protocol object from the existing host `host-settings` module.
- Supply `protocol: PUBLISH_TRUST_WIRE` and `nowIso` from `@jini-ai/core/primitives` in the two production `trustDeps` objects, in `grant-backstop.test.ts`'s inline connect deps and typed `connectionFixture`, and in the two `connectDestination` call objects in `publish-zero-setup-end-to-end.test.ts:197,456`. Leave disconnect-only deps unchanged. If a host test compares a complete deps object, extend its expected object with the same supplied dependency and retain the old field assertions.
- In `development/scripts/check-architecture.baseline.json:103–104,107–108`, remove the four obsolete edges from `destination-credential.ts`, `disconnect-tool.ts`, and `tool-registrations.ts` to the old in-tree implementations. Do not add exceptions. Keep the candidate lookup on the host path and retarget why-comments that describe the relocated grant writer, not the scanner.

**STOP** if the guarded egress instance, host refusal code or wording, confirmation gate, destination/workspace recheck, pinned candidate lookup, or grant contents change. Keep the end-to-end, grant-backstop, revocation, keyless, and route suites in Tovu with assertions unchanged apart from import and injected-argument updates. The cloud run must verify the Jini API baselines and Tovu wire parity before claiming the move complete.
