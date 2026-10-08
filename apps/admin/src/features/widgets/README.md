# features/widgets

Widget instances and the regions they're placed into — four screens behind the sidebar's
**Content → Widgets** entry.

Screens live in `@jini-ai/admin/widgets`; React pages are mounted through
`@jini-ai/admin/widgets/react`. `index.ts` keeps the four public exports and route props, so
`panels.tsx` remains the route and agent-page owner. Jini owns library/editor/regions/region
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
