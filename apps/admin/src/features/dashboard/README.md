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

## Wiring

`index.ts` binds this app into `@jini-ai/admin/screens/dashboard`: its hooks, publish request and
routes, plus the stylesheets — `../../lib/jini-admin-tokens.css` (this admin's theme bound into the
`--jini-admin-*` names the Jini screen CSS reads; it lives with the host shell wiring, not in the
frozen `admin-themes/`) imported ahead of `dashboard.css`.

## Notes for anyone editing here

`__tests__/Dashboard.unit.test.tsx` drives the bound screen end to end through a mocked `fetch`.
The screen's classes are `jini-dash-*`/`jini-dashboard-page`, styled by the package's `dashboard.css`.

## Wiring

What Tovu binds into `@jini-ai/admin/screens/dashboard`'s `Dashboard` (all in this folder):

- `useDashboardHook`: `useWiredDashboard` — `defaultDashboardPort` (this app's sites, media, themes,
  posts, auth, pages and comments API clients), `useWiredAdminLocale`, the `dashboard-i18n.ts`
  translator (package `DASHBOARD_DICT` over this app's `COMMON_I18N`), `describeApiError`, and the
  `tovu.admin.` default-password banner storage key.
- `useRecentActivityDisclosureHook`: `usePersistedDisclosure` under this app's
  `tovu.admin.dashboard.recent-activity.open` key.
- `usePublishToLiveAvailableHook` / `onPublishAll`: the publish-content stores.
- `links`: this app's admin routes, `siteUrl("/")` and `activityRowHref`.
- Stylesheets: `admin-themes/jini-admin-tokens.css` and the package's `dashboard.css`.

Nothing here is product-neutral enough to move: every file binds a host value (API clients,
locale hook, product-bound common dictionary, `tovu.admin.` storage keys).
