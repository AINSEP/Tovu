# G4: `AdminKit` as a required core plus optional feature kits

## Revision 2 corrections (authoritative; they replace the steps they name)

**Judge 18:** no slice `index.ts` re-export files; each kit slice is its implementation file behind an export-map
entry, created in the commit that adds it. **Judge 19:** React entries may import `@jini-ai/ui-kit/react` (owner
option C, recorded in COMMON rule 5); this is an approved exception, not a boundary breach.

---

Inherits `COMMON.md`. Repos: Jini (+ one Tovu file). Branch: `feat/gap-g4-admin-kit-slices` in both.
Estimate: ~90k Sonnet. Owner: `@jini-ai/admin` (`react/kit.tsx`).
Prerequisites: xpkg **R1c, R2a, R2b landed** (they edit kit call sites and this file); OD-N8 = "split"; G5 merged.
If any prerequisite is missing: do not run.

## Inventory

```sh
wc -l packages/admin/src/react/kit.tsx packages/admin/src/react/testing-kit.tsx            # 268 on merge-b; re-measure
sed -n 115,130p packages/admin/src/react/kit.tsx                                           # AdminKit = { components, hooks, query, mediaProviders, theme }
# slot usage per admin area (non-test source):
for s in Button IconButton TextField TextArea Select Switch Dialog ConfirmDialog Tabs Menu Notice Spinner Badge InfoTip Lightbox WidgetSelect TabBar HtmlEditor ErrorNotice useAgentHandle useFocusTrap useDirtyGuard useSettlementGeneration useConfirmController useNativeDialog useMediaProvidersTab useMediaProviderRules useAdminThemeKit; do
  printf "%s\t" $s; rg -l "\b$s\b" packages/admin/src -g '!**/__tests__/**' -g '!react/kit.tsx' -g '!react/testing-kit*' | awk -F/ '{print $4"/"$5}' | sort -u | tr '\n' ' '; echo; done
rg -n "satisfies AdminKit|AdminKitProvider" packages examples ../Tovu/apps -g '!**/node_modules/**'
rg -n "@jini-ai/ui/theme" packages/admin/src -g '!**/__tests__/**'                          # planner saw react/shell/use-admin-theme.ts:2; R1c may have removed it
cat examples/notes-web/src/shared/kit/unbound.ts examples/notes-web/src/shared/kit/admin-kit.ts
```

Build the table "slot -> admin areas that use it". CORE = slots used by `react/shell`, `react/entities`,
`react/components/{Sidebar,DataTable,ConfirmDialog}` and `react/OverlayHost*`. Everything else is FEATURE,
grouped by the area that uses it (expected groups: `media` -> `mediaProviders`, `Lightbox`; html editing ->
`HtmlEditor`; tabbed screens -> `TabBar`, `Tabs`; …). The grouping comes from this table, not from this sheet.

## Target

```ts
export interface AdminCoreKit { readonly components: Pick<AdminKitComponents, /* CORE names */>; readonly hooks: Pick<AdminKitHooks, /* CORE */>; readonly query: AdminQueryKit; readonly theme: AdminThemeKit }
export interface AdminFeatureKits { /* one optional readonly property per FEATURE group */ }
/** Unchanged name and provider: a full kit (today's shape) still satisfies it. */
export type AdminKit = AdminCoreKit & { readonly components: Partial<…FEATURE components> ; readonly hooks: Partial<…>; readonly mediaProviders?: AdminMediaProvidersKit };
export class AdminKitSlotError extends Error { readonly code = 'ADMIN_KIT_SLOT_UNBOUND'; readonly slot: string }
```

Rules:
- **Tovu's existing binding must typecheck without edits** (`apps/admin/src/integrations/jini-kits.ts`
  supplies every slot, and a full object satisfies the new type). The one Tovu file this sheet may touch is
  that binding, and only if `satisfies AdminKit` fails; report the diff.
- A FEATURE slot used while unbound throws `AdminKitSlotError` naming the slot, at first render/call of that
  slot, never at provider mount (hosts that never open that screen never pay). For **hook** slots the facade
  throws on call: hook order is unaffected because the throw happens before any React hook runs in the facade.
- The provider keeps the first kit (unchanged rule). No slot is looked up with truthiness on a value that can
  legitimately be falsy (lesson 20): use `=== undefined`.
- If R1c left `use-admin-theme.ts` importing `@jini-ai/ui/theme`, repoint it to `useAdminThemeKit()` here only
  if R1c's sheet does not own that line (check the lane's site list); otherwise leave it and report.

## Tests first

1. `kit.unit.test.tsx`: a core-only kit renders `AdminShell` + the entity list/edit screens with zero
   `AdminKitSlotError` (this is the notes app's case); the same kit rendering a media screen throws the
   error with `slot` = the first FEATURE slot it touches; a full kit renders both. Mutation: make a CORE slot
   optional -> the first test must fail to typecheck (`@ts-expect-error` assertion in a `.typecheck.ts` file).
2. Type tests: `{} satisfies AdminKit` is an error; a full literal satisfies; a core literal satisfies.
3. `fakeAdminKit()` (testing kit) still returns a full kit; add `fakeAdminCoreKit()`.

## Steps (commit each)

1. Types + error + facades; existing admin tests untouched and green (test count unchanged). 2. New tests +
   `fakeAdminCoreKit`. 3. Changeset `@jini-ai/admin` minor; doc in `kit.tsx` header. 4. notes-web: delete
   `unbound.ts`, bind core only, delete its `GAPS.json` row; its T3 now asserts `AdminKitSlotError`.

## Acceptance

admin gates; Jini repo gates; **Tovu typecheck + admin unit tests** linked to this SHA; notes-web gates; N5
e2e unchanged; a Chrome look at two Tovu admin screens that use FEATURE slots (media, an html-editor screen)
is requested from the coordinator (this run cannot do it headless reliably: say so).

## Not verified by the planner

The CORE/FEATURE split (derived at run time); whether any admin screen passes kit components by reference
at module scope (a module-level read of an optional slot would become eager: lesson 3; grep for
`= useAdminKit()` outside components and for top-level `slot(` consumers).
