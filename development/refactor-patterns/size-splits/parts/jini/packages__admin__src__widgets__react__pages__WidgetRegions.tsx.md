### jini:packages/admin/src/widgets/react/pages/WidgetRegions.tsx
- **Over:** `WidgetRegions` 107
- **Phase:** now · **Batch:** size-21
- **Tests:** `packages/admin/src/widgets/react/__tests__/WidgetRegions.unit.test.tsx`, `.../use-widget-regions.hooks.unit.test.tsx`, `.../use-widget-regions.wiring.unit.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:** A = header `<div` (`widget-regions-header`, ~51: back link, title, bind-a-region control) — header + bind control; B = `<DataTable` (~38) — region table.
- **Splits:**
  1. SUB-COMPONENT `WidgetRegionsHeader({ headerActions, newRegionKey, setNewRegionKey, bind, binding, error, t }: WidgetRegionsHeaderProps): JSX.Element` (same file, above) ← unit A verbatim; props = names the JSX reads.
- **Importers to update:** none.
- **After:** `WidgetRegions` ~58; header ~53.
- **Risks / notes:** none.
