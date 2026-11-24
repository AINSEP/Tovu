# features/skills

The Skills screen's data hooks over `api.ts` and the host bindings for its screen. The screen, its
rows and dialogs, copy, the row chevron, the upload encoder and the failure formatter live in
`@jini-ai/admin/screens/skills/*`.

## Wiring

- `skill-failure-host.ts` binds what `@jini-ai/admin`'s `skillFailure` needs from this app: the
  transport `ApiError` and `describeApiError` (`lib/admin-http/request.ts`) and the product redaction
  options (`@tovu/contracts/secret-redaction`). Every caller spreads `SKILL_FAILURE_HOST`.
- `SkillInstallPayload` comes from `@jini-ai/core/contracts/site/skill-install` (read by `api.ts`).
- `skills.css` styles the moved chevron by `.jini-agent-plugin-chevron-glyph`.
- `SkillsPage.tsx` (export `Skills`, lazy-loaded by `panel-pages.ts`) binds `@jini-ai/admin`'s `Skills`:
  `hooks` = `useSkills`, `useAdminLocale`, `useAdminThemeBoundary` (`admin-themes`), the package's
  `useSkillsTranslator`, `useSkillFilesModal` and `useSkillInstallConfirmation`; `components` =
  `PlainTextBlocks`, `PackageFilesModal` (`features/plugins`), `InstallTabCard`/`InstallTabOption`/
  `InstallTabFieldRow`; `failureHost` = `SKILL_FAILURE_HOST`. Each hook stays overridable through the
  same `use*Hook` props as before, so tests drive the page through this binding.
- `skill-install-confirmation-host.ts` binds `SKILLS_HOST_CLASSNAMES` once: this app's design-system
  classes (`page`, `settings-ui-section`, `card`, `notice`, `btn-*`, `settings-dialog*`, `editor-actions`,
  `agent-plugin-*`, ...) for `@jini-ai/admin`'s required `classNames` prop. `SkillsPage.tsx` passes it to
  `Skills`; `SKILL_INSTALL_CONFIRMATION_HOST` carries it, so the chat dock's spread binds it too.
- `skill-install-confirmation-host.ts` — `SKILL_INSTALL_CONFIRMATION_HOST` (`hooks` + `failureHost`) for
  every `SkillInstallConfirmation` (Skills page, `AssistantDock/DockChatPane.tsx`); importing it loads
  `skills.css`.
- `InstalledSkill` comes from `@jini-ai/core/contracts/site/installed-skill`; `SkillRowView` from
  `@jini-ai/admin/screens/skills/skills-screen.types`. The package's classes are `jini-skills-*`, styled here.
