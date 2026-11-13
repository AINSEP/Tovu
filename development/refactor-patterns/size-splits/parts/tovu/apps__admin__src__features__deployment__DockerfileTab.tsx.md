### tovu:apps/admin/src/features/deployment/DockerfileTab.tsx
- **Over:** `DockerfileEditorCard` 132 (file 335, under)
- **Phase:** now (?) · **Batch:** size-15
- **Tests:** `apps/admin/src/features/deployment/__tests__/DockerfileTab.unit.test.tsx`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `<div className="card-head">` (~L253, 67 lines) | title, line count, unsaved badge, Copy/Download/Save actions |
| B | `<div className="deployment-card-body">` | status banner + textarea (stays) |

- **Splits** (same file, module level, directly above `DockerfileEditorCard`):
  1. SUB-COMPONENT `DockerfileCardHead({ draft, hasContent, isDirty, saved, copied, saving, exists, onCopy, onSave, t }: DockerfileCardHeadProps): JSX.Element` ← the `<div className="card-head">` element verbatim (it calls `countLines(draft)` and `downloadDockerfile(...)` — module functions, fine). Prop types = the same types `DockerfileEditorCard`'s destructured props already have (reuse by indexed access on its props type if it is named; otherwise spell them).
- **Importers to update:** none.
- **After:** file ~345; `DockerfileEditorCard` ~70; `DockerfileCardHead` ~72.
- **Risks / notes:** keep the "Copy/Download act on `draft`" comment on `hasContent` in `DockerfileEditorCard` and pass `hasContent` down.
