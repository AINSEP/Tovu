# features/observability

Operations > Observability. The screen, its API client, ports, state hooks and dictionary live in
`@jini-ai/admin/screens/observability` (see its README); this folder is the host wiring that binds
this app into it. `panels.tsx` imports only `index.ts`.

## Wiring

`index.ts` (`HOST_BINDINGS`) binds every required `ObservabilityProps` member:

- `productName` — `"Tovu"`, filling the screen copy's `{product}` placeholder.
- `useObservabilityStatusHook`, `useRecentServerErrorsHook`, `useQueriesTabHook`, `QueryCachePanel` —
  from `hooks/observability-wiring.hooks.ts` (this admin's API client, locale, translator, error copy
  and the TanStack devtools panel).
- `useRecentErrorItemHook` (`hooks/use-recent-error-item.hooks.ts`), `useObservabilityTabHook`
  (`hooks/use-observability-tab.hooks.ts`, the `?tab=` URL adapter).
- `readToolGaps` — `observabilityApi.getToolGaps()` (`api/observability-api.ts`).
- `useAdminThemeBoundaryHook` — `admin-themes/use-admin-theme.hooks`.
- `useAdminKitValuesHook` — `useAdminKitValues` from `@jini-ai/admin/react/kit`.
- `layoutClassNames` — this admin's page chrome classes: `page`, `page-header`, `page-header-text`,
  `page-kicker`, `page-title`, `page-description`, and `settings-ui-section settings-ui-section--page-flow`
  for the shell wrapper (see that modifier's comment in `styles.css`).
- Stylesheets: `@jini-ai/ui/settings-dialog.css` and the screen's `observability.css` / `recent-errors.css`.

Server-log wire shapes (`ServerLogFilters`, `ServerLogsResult`, `ServerLogEntry`) come from
`@jini-ai/core/contracts/site/platform-server-logs`. Tests override any binding through props.
