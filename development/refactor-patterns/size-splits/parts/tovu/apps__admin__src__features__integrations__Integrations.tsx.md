### tovu:apps/admin/src/features/integrations/Integrations.tsx
- **Over:** `Integrations` 156 (file 253, under)
- **Phase:** now (?) · **Batch:** size-02
- **Tests:** `apps/admin/src/features/integrations/__tests__/Integrations.unit.test.tsx`, `apps/admin/src/__tests__/unit/nav-wiring.unit.test.ts` (smoke)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `IntegrationCreateForm`, `IntegrationDeleteDialog` (exist) | form / confirm dialog |
| B | `<div className="integrations-tab-intro form-measure">` block | intro text + "Add webhook" button |
| C | `<DataTable rows={subscriptions}` … `/>` | subscriptions table incl. empty card + row menu |
| D | `Integrations` | hook call, loading/error, compose |

- **Splits** (same file, module level, above `Integrations`):
  1. SUB-COMPONENT `IntegrationsIntro({ formOpen, onOpenForm, t }: IntegrationsIntroProps): JSX.Element` ← the `<div className="integrations-tab-intro form-measure">` element (its `{/* No page/page-header … */}` comment moves with it, placed above the element inside the new component's return). `onOpenForm` = `() => setFormOpen(true)` passed from `Integrations`.
  2. SUB-COMPONENT `IntegrationsTable({ subscriptions, rowMenuHandles, onTogglePause, onRequestDelete, locale, t }: IntegrationsTableProps): JSX.Element` ← the whole `<DataTable rows={subscriptions}` element (with its `form-measure` "why" comment in `empty`). Inside, replace `onDelete: setPendingDelete` with `onDelete: onRequestDelete`; `Integrations` passes `onRequestDelete={setPendingDelete}`. Types: `subscriptions` = the hook's non-undefined `subscriptions` element type (reuse the existing type the hook exports; if none is exported, export the existing one from the hooks file — do not redeclare), `rowMenuHandles` = `ReturnType<typeof buildAgentListHandles>`, `t`/`locale` same types as `IntegrationCreateForm` uses.
  3. `Integrations` keeps: hook destructure, two early returns, `rowMenuHandles`, and a return of `<div className="integrations-tab-body">` + `IntegrationsIntro` + the `formOpen ? <IntegrationCreateForm …/> : null` + `IntegrationsTable` + `IntegrationDeleteDialog`.
- **Importers to update:** none (no export moves).
- **After:** file ~265; `Integrations` ~68; `IntegrationsTable` ~72; `IntegrationsIntro` ~18.
- **Risks / notes:** props only (rule 9) — no hook result object passed down. Agent handles (`integrations-toggle-create-form`, row menu prefix) unchanged.
