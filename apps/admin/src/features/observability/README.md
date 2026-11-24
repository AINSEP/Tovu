# Observability

Admin screen built on the settings-dialog shell.

## Wiring

- Tab type: `SettingsDialogTab` is imported from `@jini-ai/admin/react/kit` (the kit's structural mirror of `@jini-ai/ui`'s `TabbedDialogTab`; `admin-kit.integration.test.tsx` keeps the two in sync).
- Kit slots: `I18nProvider`, `SettingsDialogShell` come from the `@jini-ai/admin/react/kit` facades; the host binds them to `@jini-ai/ui` in `integrations/jini-kits.ts` (`satisfies AdminKit`) and mounts `AdminKitProvider` in `main.tsx`.
- Residual `@jini-ai/ui` imports: `SETTINGS_DIALOG_DICTIONARIES` (Observability.tsx); `findActiveTab`, `resolveInitialActiveTabId`, `useTabbedDialog` (hooks/use-observability-tab.hooks.ts).
# features/observability

Operations > Observability. The screen, its API client, ports, state hooks and dictionary live in
`@jini-ai/admin/screens/observability` (see its README); this folder is the host wiring that binds
this app into it. `panels.tsx` imports only `index.ts`.


`index.ts` (`HOST_BINDINGS`) binds every required `ObservabilityProps` member:

- `productName` — `"Tovu"`, filling the screen copy's `{product}` placeholder.
- `useObservabilityStatusHook`, `useRecentServerErrorsHook`, `useQueriesTabHook`, `QueryCachePanel` —
  from `hooks/observability-wiring.hooks.ts` (this admin's API client, locale, translator, error copy
  and the TanStack devtools panel).
- `useRecentErrorItemHook` and `useObservabilityTabHook` (the `?tab=` URL adapter) — Jini's
  `@jini-ai/admin/screens/observability/hooks/use-recent-error-item.hooks` and
  `.../use-observability-tab.hooks`. They read `useCopyToClipboard`, `useTabbedDialog`,
  `findActiveTab` and `resolveInitialActiveTabId` from the admin kit, which
  `integrations/jini-kits.ts` binds from `@jini-ai/ui`.
- `readToolGaps` — `observabilityApi.getToolGaps()` (`api/observability-api.ts`).
- `useAdminThemeBoundaryHook` — `admin-themes/use-admin-theme.hooks`.
- `useAdminKitValuesHook` — `useAdminKitValues` from `@jini-ai/admin/react/kit`.
- `layoutClassNames` — this admin's page chrome classes: `page`, `page-header`, `page-header-text`,
  `page-kicker`, `page-title`, `page-description`, and `settings-ui-section settings-ui-section--page-flow`
  for the shell wrapper (see that modifier's comment in `styles.css`).
- Stylesheets: `@jini-ai/ui/settings-dialog.css` and the screen's `observability.css` / `recent-errors.css`.

Server-log wire shapes (`ServerLogFilters`, `ServerLogsResult`, `ServerLogEntry`) come from
`@jini-ai/core/contracts/site/platform-server-logs`. Tests override any binding through props.
