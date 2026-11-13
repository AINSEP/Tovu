### tovu:apps/admin/src/panels.tsx
- **Over:** file 726 lines (`PANELS` literal 650; no function over 100)
- **Phase:** now (STAY-PRODUCT; survey also wants the `export type { PanelRouteContext, PanelRenderContext }` re-export at the top DELETED — separate job, do not do it here) · **Batch:** size-04
- **Tests:** `apps/admin/src/__tests__/unit/panels-render.unit.test.tsx`, `apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx`, `apps/admin/src/__tests__/unit/nav-wiring.unit.test.ts`, `apps/admin/src/__tests__/unit/commerce-off.unit.test.ts`, `apps/admin/src/__tests__/unit/admin-nav-recovery-acs.unit.test.ts`, `apps/admin/src/lib/__tests__/panel-access.unit.test.ts`, `apps/admin/src/lib/__tests__/admin-screens-manifest.unit.test.ts`, `apps/admin/src/lib/__tests__/agent-pages.unit.test.ts`, `apps/admin/src/features/admin-ui/__tests__/redirects.unit.test.tsx`
- **Responsibility map** (the `// --- <group> ---` comments inside `PANELS` are the sidebar groups):

| unit | entries | job |
|---|---|---|
| A | `PanelRenderer`, `TovuAdminPanel` | panel types |
| B | `// --- Content ---` … up to `// --- People ---` | Content group panels |
| C | `// --- People ---` | People group |
| D | `// --- Studio ---` | Studio group |
| E | `// --- Add-Ons ---` | Add-Ons group |
| F | `// --- Commerce ---` | Commerce group |
| G | `// --- Operations ---` | Operations group |
| H | `// --- Administration ---` | Administration group |
| I | `// --- Marketing ---` | Marketing group |
| J | `// --- Ungrouped top row ---`, `// --- Routable, no sidebar row … ---`, `PANELS`, `PanelRouteLoading`, `ADMIN_PANELS` | assembly + Suspense wrapper (stays) |

- **Splits** (in order):
  1. NEW `panels-types.ts` — moves `PanelRenderer`, `TovuAdminPanel` (with their JSDoc). Exports both. `panels.tsx` imports them; it does NOT re-export (no outside importer uses them today — re-run `rg -n "TovuAdminPanel|PanelRenderer" apps/admin/src --glob '!panels*.ts*'`; only a comment in `panels-render.unit.test.tsx` mentions `PanelRenderer`).
  2. NEW one module per group, each `export const <GROUP>_PANELS: readonly TovuAdminPanel[] = [ …entries verbatim, incl. every comment… ];`: `panels-content.tsx` (`CONTENT_PANELS`), `panels-people.tsx` (`PEOPLE_PANELS`), `panels-studio.tsx` (`STUDIO_PANELS`), `panels-add-ons.tsx` (`ADD_ON_PANELS`), `panels-commerce.tsx` (`COMMERCE_PANELS`), `panels-operations.tsx` (`OPERATIONS_PANELS`), `panels-administration.tsx` (`ADMINISTRATION_PANELS`), `panels-marketing.tsx` (`MARKETING_PANELS`). Each takes from `panels.tsx`'s import block exactly the components/helpers its entries use (e.g. `renderMediaPanel`, `postEditorRouteKey` go where `media`/`posts` live). The group comment line becomes that file's header line.
  3. `PANELS` becomes `[ <top-row entries inline>, ...CONTENT_PANELS, ...PEOPLE_PANELS, ...STUDIO_PANELS, ...ADD_ON_PANELS, ...COMMERCE_PANELS, ...OPERATIONS_PANELS, ...ADMINISTRATION_PANELS, ...MARKETING_PANELS, <routable-no-row entries inline> ]` — the exact original order (sidebar order and route matching depend on it).
- **Importers to update:** none outside (`ADMIN_PANELS` and the `panel-contracts` type re-export stay in `panels.tsx`).
- **After:** `panels.tsx` ~140; group files ~35–150 each (Content ~150, Operations ~115, Add-Ons ~110).
- **Risks / notes:** lazy imports — check whether the feature components are imported from a lazy barrel (the `import { Skills, Themes, … }` block); each group file must import from the SAME module specifier so lazy chunks do not change (`admin-route-lazy-loading.unit.test.tsx` guards this). No import from a group file back into `panels.tsx`.
- **Owner exception candidate:** alternatively keep `PANELS` as one declarative table (it is a flat list of data entries; the split is by sidebar group, which is a real but thin responsibility). Owner decides; the split above is ready if not excepted.
