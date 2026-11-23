# Skills (admin)

The Skills add-on page (`Skills.tsx`, mounted from `panel-pages.ts`) and the skill-install
confirmation the chat dock also renders.

## Wiring

Part of this feature now lives in `@jini-ai/admin/screens/skills/*` (step sheet A-K2-skills-1,
batch w3-screens B). What moved, and what the host supplies:

| Jini module | What it is | Host injects |
|---|---|---|
| `skills-i18n` (+ unexported `skills-page-dictionary`) | the Skills translator `t({ locale, key })` | nothing: shared words ("Cancel") fall back to Jini `ADMIN_COMMON_I18N` |
| `SkillInstallConfirmation.hooks` | `createSkillInstallConfirmationTranslator({ locale })` | nothing; `SkillInstallConfirmation.tsx` (Tovu) calls it with the caller's locale |
| `Skills.hooks` | `useSkillsTranslator({ locale })` | `Skills.tsx` (Tovu) passes it as the default of its `useSkillsTranslatorHook` prop |
| `skill-upload` | `prepareSkillUpload({ files }, { paths })` | nothing; `use-skill-install.hooks.ts` (Tovu) calls it |
| `api/skills-api.types` | `InstalledSkill`, `SkillInstallPayload` wire types | nothing; `api.ts` (Tovu) types its requests with them |
| `skill-drop` | `captureSkillDrop({ event, proposeFiles, fallback }, { onError })`, the bounded browser folder walk for chat skill drops | nothing is injected at import; `composer-files.hooks.ts` (AssistantDock) passes `proposeFiles` (from `use-skill-install.hooks.ts`), the host's folder `fallback` and `onError` in the call |
| `use-skills-tabs.hooks` | `useSkillsTabs()`, the URL-backed `?tab=skills\|add` tabs (replacement navigation to `/addons/skills`) | nothing: it reads the Jini router (`shell/lib/router`) directly; `use-skills.hooks.ts` (Tovu) calls it |

Still in Tovu, and why:

- `api.ts`: the HTTP client (`authenticatedAdminRequest`, `WORKSPACE_ID`) and the product event
  name `tovu-skills-changed`; `listSkills()` has no args object a request port could ride on.
- `skill-failure.ts`: Tovu `ApiError`/`describeApiError` plus `TOVU_ERROR_REDACTION_OPTIONS`; its
  callers (`use-skill-install`, `use-skills`, `use-skill-files`, `SkillInstallConfirmation`) stay.
- `use-skill-install.hooks.ts`: calls `installSkill` and `skillFailure`; the AssistantDock calls it
  with no collaborators, so injecting them would change call sites outside this feature.
- `use-skill-confirmation.hooks.ts`: moving it onto the kit `useFocusTrap` facade would require an
  `AdminKitProvider` above every AssistantDock render that shows `SkillInstallConfirmation`.
- `use-skill-files.hooks.ts`, `Skills.tsx`, `SkillRow.tsx`: depend on the plugins feature
  (`PackageFilesModal`, `rules`, `agent-plugins-visuals`), which has not moved yet.
- `use-skills.hooks.ts`, `SkillRemoveConfirmDialog.tsx`, `SkillInstallConfirmation.tsx`: depend on
  the files above. `skills-visuals.tsx` renders the plugins stylesheet's `agent-plugin-chevron-glyph`
  class and its only consumer is `SkillRow.tsx`.

Stylesheets: `skills.css` and `@jini-ai/ui/settings-dialog.css` are still imported by the Tovu
components; no moved module renders markup, so no `jini-*` class aliases are needed yet.
