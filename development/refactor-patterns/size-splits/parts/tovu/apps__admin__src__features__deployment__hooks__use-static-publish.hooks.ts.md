### tovu:apps/admin/src/features/deployment/hooks/use-static-publish.hooks.ts
- **Over:** `useStaticPublish` 150 (file 241)
- **Phase:** after-move (MIXED) · **Batch:** size-47
- **Tests:** `apps/admin/src/features/deployment/hooks/__tests__/use-static-publish.unit.test.tsx`, `apps/admin/src/features/deployment/__tests__/StaticSiteTab.unit.test.tsx`
- **Responsibility map:**

| unit | statements of `useStaticPublish` | job |
|---|---|---|
| A | `const targetsQuery = useFetchQuery(` … `async function checkPreview() {` | target choice, config fields, preview |
| B | `const query = useFetchQuery({ key: ["deployment", "publish"]` … `async function publish(` | publish run: seed, poll loop, trigger |
| C | `return {` | controller assembly |

- **Splits:**
  1. SUB-HOOK `usePublishTargetForm({ port, locale }: UsePublishTargetFormInput): PublishTargetForm` (same file, above `useStaticPublish`) ← unit A verbatim (incl. `invalidatePreview`, `setTarget`, `setConfigField`, `checkPreview` and the generation/duplicate-guard ref comments). Returns `{ targets, targetsError, target, selectedTarget, setTarget, configValues, setConfigField, projectName, setProjectName, preview, previewLoading, previewError, checkPreview }`.
  2. SUB-HOOK `usePublishRun({ port, locale, t, selectedTarget, configValues, projectName }: UsePublishRunInput): PublishRunState` ← unit B verbatim (seed effect, poll effect, `publish`). Returns `{ run, publishing, publishError, publishFailure, pollError, loadError, isPublishing, publish }` — exactly the names `return {` reads.
  3. `useStaticPublish(port, t, locale)` keeps its signature (exported, tests call it) and is: the two sub-hook calls in this order + the unchanged `return {`.
- **Importers to update:** none (no export moves).
- **After:** `useStaticPublish` ~32; `usePublishTargetForm` ~50; `usePublishRun` ~75; file ~250.
- **Risks / notes:** hook order is preserved (A before B). `publish` reads `selectedTarget`/`configValues`/`projectName` from the current render — passing them as inputs each render keeps that. Return-type interfaces are local (not exported).
