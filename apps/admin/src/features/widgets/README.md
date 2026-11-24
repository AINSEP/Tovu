# features/widgets

Widget instances and the regions they're placed into — four screens behind the sidebar's
**Content → Widgets** entry.

Screens live in `@jini-ai/admin/widgets`; React pages are mounted through
`@jini-ai/admin/widgets/react`. `@jini-ai/admin/screens/widgets` keeps the four panel exports and
route props, so `panels.tsx` remains the route and agent-page owner. Jini owns library/editor/regions/region
controllers and rules; `widgets-i18n.ts` retains this host's dictionaries and common fallback.

`integrations/jini-admin/widgets-ports.ts` binds authenticated HTTP, refresh and navigation.
`widgets-module.hooks.ts` binds live locale, catalog/default config, slug replacement, status
labels, shared component slots and the widgets publish contribution.

## What this feature does not own

- **`components/WidgetConfigFields`** and **`components/WidgetPickerDialog`** — shared widget-config
  UI used by this feature (and elsewhere), kept under `components/` rather than moved here.

## Notes for anyone editing here

Screen/rule/hook suites moved with their subjects to Jini's `widgets/{react/,}__tests__/`.
Host dictionary coverage stays in `__tests__/widgets-i18n.unit.test.ts`; actual locale, nested
config translation, picker/placement and route wiring stay in
`integrations/jini-admin/__tests__/widgets-swap.unit.test.tsx`. Coordinator runs these and the
unchanged shared-component suites, then checks all four screens in Chrome before release.

## Wiring

- `panels.tsx` spreads `widgetsMount(...)` (`integrations/jini-admin/panel-mounts.ts`: `useModulePanel` from `integrations/jini-admin/modules.hooks.ts` and `WidgetsModuleLoading` from `integrations/jini-admin/widgets-module.hooks.ts`) into all four `@jini-ai/admin/screens/widgets` panels as their required props; `panel-pages.ts` re-exports them eagerly.
- `widgets-host-ports.ts` binds `@jini-ai/admin/screens/widgets/api/widgets-api`'s `createWidgetsApi` to this host's `authenticatedAdminRequest` and `WORKSPACE_ID`; every importer reads the `widgetsApi` singleton from there.

**Locale (P12 #6.T).** The screens take no locale. `WidgetsModuleLoading`/`createHostWidgetsModule` (`integrations/jini-admin/widgets-module.hooks.ts`) take a REQUIRED `useAdminLocaleHook` (`UseAdminLocaleHook` from
`@jini-ai/admin/react/kit`); there is no default and no direct import of the live hook. `panels.tsx` passes `ctx.useAdminLocaleHook` from `PanelRenderContext` to `widgetsMount`, which binds it
into `WidgetsModuleLoading` (one stable bound component per hook, so the loading notice does not remount); the
function is the host's one `useHostAdminLocale` (`hooks/admin-locale-dependencies.hooks.ts`), the
same one `adminKit.hooks.useAdminLocale` holds. Tests pass a fake hook or `useHostAdminLocale`.
