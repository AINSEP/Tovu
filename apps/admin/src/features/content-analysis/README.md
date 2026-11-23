# content-analysis (host half)

The post editor's Content analysis card lives in `@jini-ai/admin/screens/content-analysis/` (card,
`useContentAnalysis`, `rules`, port interface, fake port, dictionary). This folder keeps only what
binds it to this admin.

## Wiring

- `features/posts/editor/PostSavedPanels.tsx` mounts `@jini-ai/admin`'s `ContentAnalysisCard` and injects its required `useContentAnalysisHook` prop: `useWiredContentAnalysis` from `hooks/use-content-analysis.hooks.ts`, which composes Jini's `useContentAnalysis` with this admin's locale (`useAdminLocale`) and the live port.
- `hooks/content-analysis-dependencies.hooks.ts` is the live `ContentAnalysisPort` (`authenticatedAdminRequest` + `WORKSPACE_ID`, the workspace-scoped plugin preview route). Tests use Jini's `createFakeContentAnalysisPort` (`@jini-ai/admin/screens/content-analysis/hooks/content-analysis-dependencies.hooks`).
- The card reads API errors structurally (an `Error` with a numeric `status` and optional `code`), which this admin's `ApiError` satisfies.
- Styles: the card renders only `jini-content-analysis-*` classes. `styles/editor.css` styles the card layout and `styles.css` carries alias selectors onto the existing `.card`, `.card-title`, `.card-lead`, `.editor-actions`, `.btn-secondary`, `.save-error`, `.dash-stat-{label,value,meta}`, `.field-label`, `.field-hint`, `.status` and `.status-{ok,warning,error,neutral}` rules (the rules' `status-*` tone renders as `jini-content-analysis-status-*`).
