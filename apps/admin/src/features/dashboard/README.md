# features/dashboard

The admin landing screen — the ungrouped, top-row **Dashboard** entry. The screen, its controller
hook, port, rules and dictionary live in `@jini-ai/admin/screens/dashboard` (see its README's
Wiring); this folder is the host wiring that binds this app into it.

| file | what it is |
|---|---|
| `index.ts` | The only surface `panels.tsx` may import: the Dashboard bound to this app's hooks, publish request and routes. |
| `hooks/use-dashboard.hooks.ts` | `useWiredDashboard` — binds the port, admin locale, translator, API error copy and banner storage key into `useDashboard`. |
| `hooks/dashboard-dependencies.hooks.ts` | `defaultDashboardPort` — this app's API clients as a `DashboardPort`. |
| `hooks/use-recent-activity-disclosure.hooks.ts` | The accordion's persisted open state under this app's storage key. |
| `dashboard-i18n.ts` | The dashboard dictionary bound to this app's `COMMON_I18N` (product-named entries included). |

## Notes for anyone editing here

`__tests__/Dashboard.unit.test.tsx` drives the bound screen end to end through a mocked `fetch`.
The screen's classes are `jini-dash-*`/`jini-dashboard-page`, styled in `styles.css`.
