### jini:packages/admin/src/forms/react/hooks/use-form-editor.hooks.ts
- **Over:** `useFormEditor` 151
- **Phase:** now · **Batch:** size-38
- **Tests:** `packages/admin/src/forms/react/__tests__/use-form-editor.unit.test.tsx`, `.../use-form-editor.branches.unit.test.tsx`, `.../FormEditor.unit.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `const seededFormIdRef`, `const seededControllerRef`, `useEffect(() => {` (seed) | seed editor state from the loaded form once per form/controller |
| B | `const updateMutation`, `const createMutation`, `const statusMutation`, `async function handleSave()`, `async function handleStatusToggle()`, `const saving`, `const error = visibleFormEditorError({` | persist (create/update/status) + visible error/saving |
| C | `const { isDirty } = useDirtyGuard(`, `const [leaveConfirmOpen, …]`, `const leave = {` | unsaved-changes leave guard |
| D | `const tabRefs`, `function onTabChange`, `function onTabsKeyDown` | tab navigation (ADR-063) |
| E | rest (state controller, setters, queries, `onModeChange`, `copyEmbed`, return) | hook shell |

- **Splits** (all SUB-HOOKS in this file, module level above `useFormEditor`, in this order):
  1. `useFormEditorSeed({ stateController, list, formId, isNew, form }: UseFormEditorSeedInput): void` ← unit A verbatim (its long "Seeds `form`/`name`…" comment moves with it). `props.formId` → `formId`.
  2. `useFormEditorPersistence({ port, list, formId, isNew, state, stateController, setForm, navigate, t }: UseFormEditorPersistenceInput): { saving: boolean; error: string | null; handleSave(): Promise<void>; handleStatusToggle(): Promise<void> }` ← unit B verbatim (state fields `name, slug, fields, notify, provider, mode, html, form` destructured from `state` at the top; "None of these invalidate `KEYS.form…`" comment moves). Use the exact `error` type `visibleFormEditorError` returns.
  3. `useFormLeaveGuard({ draft, isNew, navigate }: UseFormLeaveGuardInput): { isDirty: boolean; leave: <type of leave> }` ← unit C; `draft` = the `formEditorDraft({...})` value computed in `useFormEditor` (keep the "Same guard as the post and widget editors" comment on the `useDirtyGuard` line). If returning `leaveConfirmOpen` separately is required by the return object, include it.
  4. `useFormEditorTabs({ formId, tab, navigate, t }: UseFormEditorTabsInput): { tabRefs; onTabChange; onTabsKeyDown }` ← unit D (ADR-063 comment moves).
  5. `useFormEditor` calls them in the same order the statements ran (seed after `list`, persistence after seed, guard, tabs) and returns the same object.
- **Importers to update:** none (only `useFormEditor`/`useWiredFormEditor`/`FormEditorController` exported, unchanged).
- **After:** `useFormEditor` ~60; sub-hooks ~15 / ~55 / ~18 / ~14; file ~240.
- **Risks / notes:** hook call ORDER must be identical (React rules): sub-hooks replace the statements at their original position — persistence's three `useFetchMutation` sit where they were, before `useDirtyGuard`/`useState`. `handleSave` reads `stateController` — pass it, don't snapshot.
