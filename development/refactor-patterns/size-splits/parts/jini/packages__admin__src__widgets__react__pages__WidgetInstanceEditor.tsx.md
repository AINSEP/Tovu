### jini:packages/admin/src/widgets/react/pages/WidgetInstanceEditor.tsx
- **Over:** `WidgetInstanceEditor` 108
- **Phase:** now · **Batch:** size-21
- **Tests:** `packages/admin/src/widgets/react/__tests__/WidgetInstanceEditor.unit.test.tsx`, `.../use-widget-instance-editor.hooks.unit.test.ts`, `packages/admin/src/widgets/__tests__/instance-editor.controller.unit.test.ts` (pkg `@jini-ai/admin`)
- **Responsibility map:** A = header `<div className="page-header page-header-split"` with handle `widget-instance-header` (~43 lines: back link, title, Save) — editor header; B = message/title label/config form + guards — editor body.
- **Splits:**
  1. SUB-COMPONENT `WidgetInstanceHeader({ onBackClick, isNew, save, saving, t }: WidgetInstanceHeaderProps): JSX.Element` (same file, above) ← unit A verbatim (with the `page-header-split` comment above it, ~L64). Add any further names it reads (`widget`, `whereUsed`, `message`, `error`) — props are exactly what the JSX reads, typed from the hook return.
- **Importers to update:** none.
- **After:** `WidgetInstanceEditor` ~68; header ~45.
- **Risks / notes:** `export { widgetInstanceGuard }` re-export at top stays.
