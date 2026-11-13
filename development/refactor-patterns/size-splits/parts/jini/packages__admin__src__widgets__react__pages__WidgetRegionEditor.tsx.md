### jini:packages/admin/src/widgets/react/pages/WidgetRegionEditor.tsx
- **Over:** `WidgetRegionEditor` 117
- **Phase:** now · **Batch:** size-21
- **Tests:** `packages/admin/src/widgets/react/__tests__/WidgetRegionEditor.unit.test.tsx`, `.../use-widget-region-editor.hooks.unit.test.tsx`, `packages/admin/src/widgets/__tests__/region-editor.controller.unit.test.ts` (pkg `@jini-ai/admin`)
- **Responsibility map:** A = `<div className="jini-widget-region-placements">` (~70: empty state, placement list, add control) — placement list; B = header `<div` (`widget-region-editor-header`) + guards — screen shell.
- **Splits:**
  1. SUB-COMPONENT `RegionPlacementList({ placements, widgetTypes, toggleEnabled, placementHandles, moveAt, removeAt, WidgetAddControl, addPlacement, saving, t }: RegionPlacementListProps): JSX.Element` (same file, above) ← unit A verbatim (the file header already names `RegionPlacementList` — this realizes it). Types from `useWiredWidgetRegionEditor` return / `useWidgetsOptions()`.
- **Importers to update:** none.
- **After:** `WidgetRegionEditor` ~48; `RegionPlacementList` ~72.
- **Risks / notes:** `WidgetAddControl` is a component from a slot — pass it as a prop of type `ComponentType<…>` taken from the options type; keep JSX `<WidgetAddControl …/>` verbatim.
