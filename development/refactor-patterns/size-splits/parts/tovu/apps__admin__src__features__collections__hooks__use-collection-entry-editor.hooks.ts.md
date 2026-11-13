### tovu:apps/admin/src/features/collections/hooks/use-collection-entry-editor.hooks.ts
- **Over:** `useCollectionEntryEditor` 199 (file 252, under)
- **Phase:** now (?) · **Batch:** size-15
- **Tests:** `apps/admin/src/features/collections/__tests__/use-collection-entry-editor.unit.test.tsx`, `CollectionEntryEditor.unit.test.tsx`, `CollectionEntryEditor.dynamic-field.unit.test.tsx` (same folder), `apps/admin/src/__measurements__/request-volume.measurement.test.tsx`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `invalidFields`, `validationError`, `setFieldValidity` | json-field validity (M2) |
| B | `list`, `contentType`, `loaded`, `loadError`, `seedExistingWorkingCopy`, `seededIdentityRef`, the seeding `useEffect` | load + seed working copy |
| C | `updateMutation`, `createMutation`, `saveExisting`, `save`, `saving` | save |
| D | `lastLifecycleOp`, `lifecycleMutation`, `publishWithSave`, `toggleLifecycle` | publish/unpublish (H2) |
| E | deps, `entry`/`title`/`slug`/`extFields`/`message` states, `editor`, `busy`, `error`, return | compose (stays) |

- **Splits** (same file, module level, above the hook, in run order):
  1. SUB-HOOK `useEntryFieldValidity(): { invalidFields: ReadonlySet<string>; validationError: string | null; setValidationError; setFieldValidity }` ← `const [invalidFields, …`, `const [validationError, …`, `const setFieldValidity = useCallback(` (with the M2 and "Stable setter" comments).
  2. SUB-HOOK `useEntryEditorLoad({ props, port, navigate, locale, editor, entry, slug, title, setEntry, setTitle, setSlug, setExtFields }: UseEntryEditorLoadInput): { contentType; loaded: boolean; loadError: string | null }` ← `const list = useFetchQuery({` through the seeding `useEffect` (incl. `seedExistingWorkingCopy`, `seededIdentityRef` and their comments).
  3. SUB-HOOK `useEntrySave({ props, port, locale, editor, contentType, entry, title, slug, extFields, invalidFields, setEntry, setMessage, setValidationError }: UseEntrySaveInput): { updateMutation; createMutation; saveExisting: (current: AdminEntry) => Promise<AdminEntry>; save: () => Promise<void>; saving: boolean }` ← `updateMutation`, `createMutation`, `saveExisting`, `save`, `saving` (list every outer name `save` reads per the outline `uses:` — it is truncated with `…`; read the body).
  4. SUB-HOOK `useEntryLifecycle({ port, props, locale, entry, invalidFields, saveExisting, setEntry, setMessage, setValidationError }: UseEntryLifecycleInput): { lastLifecycleOp; lifecycleMutation; toggleLifecycle }` ← `lastLifecycleOp` state (+ comment), `lifecycleMutation`, `publishWithSave` (+ H2 comment), `toggleLifecycle`.
  5. Hook keeps `busy` (reads `saving` + `lifecycleMutation.status`), `error = validationError ?? visibleEntryEditorError({…})`, return.
- **Importers to update:** none.
- **After:** file ~275; `useCollectionEntryEditor` ~65; sub-hooks ≤ 55.
- **Risks / notes:** state declaration order changes (`lastLifecycleOp`, validity state move into sub-hooks) — grouping only. `editor` (TipTap `useEditor`) must be created before the load/save hooks; pass the same instance.
