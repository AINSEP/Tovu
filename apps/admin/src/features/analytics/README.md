# features/analytics

What stays in the host of the pageview/hits screen behind the sidebar's **Marketing → Analytics**
entry. The screen itself (markup, `useAnalytics`, the port type, its fake and the 21-locale
dictionary) lives in `@jini-ai/admin/screens/analytics`.

| file | what it is |
|---|---|
| `api/analytics-api.ts` | The workspace-scoped admin API call (`request()` + `WORKSPACE_ID`) — host HTTP, never moved into the package. |
| `__tests__/use-analytics.hooks.unit.test.ts` | `useWiredAnalytics` through the real request path and the real admin-locale hook. |

The wiring lives in `integrations/jini-admin/`: `analytics-module.hooks.ts` builds the live port
over `api/analytics-api.ts` and the zero-argument `useWiredAnalytics()` (binding `useAdminLocale()`
to the package dictionary); `analytics-page.ts` mounts the package screen with that hook as its
required `useAnalyticsHook` prop and is what `panel-pages.ts` lazy-loads.

```
cd apps/admin && npx vitest run src/features/analytics
```

**Copy changes are 21-locale changes** in the package's `analytics-i18n.ts` — each key is the
English sentence the screen renders, and a miss resolves to the key itself, silently.
