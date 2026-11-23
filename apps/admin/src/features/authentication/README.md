# Authentication

Admin screen built on the settings-dialog shell.

## Wiring

- Tab type: `SettingsDialogTab` is imported from `@jini-ai/admin/react/kit` (the kit's structural mirror of `@jini-ai/ui`'s `TabbedDialogTab`; `admin-kit.integration.test.tsx` keeps the two in sync).
- Kit slots: `I18nProvider` come from the `@jini-ai/admin/react/kit` facades; the host binds them to `@jini-ai/ui` in `integrations/jini-kits.ts` (`satisfies AdminKit`) and mounts `AdminKitProvider` in `main.tsx`.
- `SettingsDialogShell` comes from the kit facade; its `labels` prop is the kit `SettingsDialogChromeLabels` mirror of the UI owner's chrome labels.
- Residual `@jini-ai/ui` imports: `SETTINGS_DIALOG_DICTIONARIES`, `SettingsDialogShell`.
