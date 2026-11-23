# Skills

Admin screen built on the settings-dialog shell.

## Wiring

- Tab type: `SettingsDialogTab` is imported from `@jini-ai/admin/react/kit` (the kit's structural mirror of `@jini-ai/ui`'s `TabbedDialogTab`; `admin-kit.integration.test.tsx` keeps the two in sync).
- Kit slots: `Icon` come from the `@jini-ai/admin/react/kit` facades; the host binds them to `@jini-ai/ui` in `integrations/jini-kits.ts` (`satisfies AdminKit`) and mounts `AdminKitProvider` in `main.tsx`.
- Residual: `SettingsDialogShell` still comes from `@jini-ai/ui` because this screen passes `labels`, which the kit's `SettingsDialogShellProps` does not declare yet.
- Residual `@jini-ai/ui` imports: `SettingsDialogShell`.
