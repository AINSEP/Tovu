# G5: injectable field renderer and list search in the admin entity screens

## Revision 2 corrections (authoritative; they replace the steps they name)

**Judge 12, 6:** `AdminEntityListQuery.search` and the create/persisted field split move to the earlier
`GA-admin-entity-seams.md` (their consumers N1 and N2 come first). This sheet keeps only the `renderField` port and
the list search box, and no longer "renders `version` read-only" as a fix for a required field. Prerequisite: GA landed.

---

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/gap-g5-field-renderer-search`. Estimate: ~110k Sonnet.
Owner: `@jini-ai/admin` (`react/entities`, `core/ports/entities.ts`). Prerequisite: G6 merged (serial: same folder).
Closes G5 and G3(b).

## Inventory

```sh
cat packages/admin/src/react/entities/EntityField.tsx packages/admin/src/react/entities/EntityEdit.tsx
cat packages/admin/src/react/entities/EntityList.tsx packages/admin/src/react/entities/EntityList.hooks.ts
sed -n 1,60p packages/admin/src/react/entities/types.ts
rg -n "interface AdminEntityListQuery" -A 8 packages/admin/src/core/ports/entities.ts
rg -n "EntityScreenDependencies|createEntityPanel\(" packages examples ../Tovu/apps -g '!**/__tests__/**' -g '!**/node_modules/**' | head
```

Expected: `EntityField` switches on `field.kind`, `text` -> `<input>`; `EntityScreenDependencies` =
`{ registry, translate, routes }`; `AdminEntityListQuery` = `{ limit, cursor, filter, sort }`.

## Target (all additive and optional: existing callers compile unchanged)

```ts
// react/entities/types.ts
export interface EntityFieldRenderArgs {
  readonly entityName: string; readonly field: AdminEntityField; readonly mode: 'create' | 'edit';
  readonly inputId: string; readonly value: unknown; readonly disabled: boolean; readonly invalid: boolean;
  readonly onChange: (args: { readonly value: unknown }) => void;
}
/** Return a node to replace the built-in control; return undefined to keep it. Must be a stable function. */
export type EntityFieldRenderer = (args: EntityFieldRenderArgs) => ReactNode | undefined;
export interface EntityScreenDependencies { /* existing */ readonly renderField?: EntityFieldRenderer }
// createEntityPanel(args, options): options.renderField?: EntityFieldRenderer
// core/ports/entities.ts
export interface AdminEntityListQuery { /* existing */ readonly search?: string }
```

- `EntityEdit` calls `renderField` first; `undefined` falls through to today's switch. The label, the
  `aria-invalid` wiring and required-field validation stay owned by the screen (the renderer supplies the
  control only), so a custom control cannot skip validation.
- `EntityList`: when the descriptor has at least one `queryable` text field **and** the caller passes
  `searchable: true` in `createEntityPanel` options, render a search field (kit `TextField`, `type: 'search'`)
  above the table; the value goes to `port.list({ search })`; the cursor walk resets when the search changes;
  an in-flight older response never replaces a newer one.
- `./entities/server` + `./entities/adapters/http` (from G6) already carry `search` on the wire; the memory
  port implements it as case-insensitive substring over queryable text fields.

## Tests first (admin's vitest; `fakeAdminKit`; memory port from G6)

| Test | Must fail when |
|---|---|
| `renderField` returning a `<textarea>` for field `body` is rendered instead of `<input>`; for other fields the built-in control remains | the hook is ignored or applied to all fields |
| a renderer returning `undefined` for every field gives output identical to no renderer (snapshot-free: assert the same roles/names) | fallback is broken |
| required-field validation still blocks save when the custom control leaves the value blank | validation moved into the replaced control |
| a renderer that throws -> the screen's existing error surface, not a blank page (if there is no boundary today, assert the current behaviour and note it) | — characterization |
| search: typing sends `list({ search })`; clearing sends `search: undefined` (explicit absence, not `''`); changing search resets to page 1; out-of-order responses (older resolves last) keep the newer rows (AP10) | race guard or reset missing |
| `searchable` omitted -> no search field (default unchanged) | the default flips |

## Steps (commit each)

1. Types + `EntityEdit` hook + tests. 2. `search` on the query type, memory port, list UI + tests.
3. Changeset `@jini-ai/admin` minor; `README`/doc comment in `contribution.tsx`.
4. notes-web: `renderField` gives `body` a kit `TextArea` and renders `version` and `updatedAt` read-only;
   `searchable: true`; delete `pages/search/SearchPanel.tsx` and its test (the list search replaces it) and
   say so in the deletion ledger; N5 e2e step (d) is updated **only** in its selector for the search field
   (list it as the one permitted e2e edit).

## Acceptance

admin gates; Jini repo gates; Tovu typecheck linked (zero edits expected); notes-web gates; e2e green.

## Not verified by the planner

`EntityEdit.tsx` and `use-entity-edit.ts` internals (where validation runs); whether the kit `TextField`
`type: 'search'` is in the USED set after N2; R1c/R2 overlap on `react/entities/**`.
