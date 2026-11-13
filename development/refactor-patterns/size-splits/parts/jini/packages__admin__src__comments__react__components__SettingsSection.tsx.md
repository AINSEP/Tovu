### jini:packages/admin/src/comments/react/components/SettingsSection.tsx
- **Over:** `SettingsSection` 114
- **Phase:** now · **Batch:** size-38
- **Tests:** `packages/admin/src/comments/react/__tests__/SettingsSection.unit.test.tsx`, `.../comments-states.unit.test.tsx`, `.../Comments.unit.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `<div className="field-group">` (first, checkbox toggles, ~L35-57) | on/off comment options |
| B | `<div className="field-group">` (second, `field-row` numeric/limit inputs from `comments-max-depth`, ~L59-122) | numeric limits |
| C | rest of `SettingsSection` (hook call, guards, `<form>`, `editor-actions`) | screen shell |

- **Splits:**
  1. SUB-COMPONENT `CommentsToggleFields({ settings, saving, t }: CommentsToggleFieldsProps): JSX.Element` (same file, above `SettingsSection`) ← first `<div className="field-group">` verbatim. Props are exactly the names that JSX reads (check: `settings`, `saving`, `t`; add any other hook name it reads, typed from `useSettingsSection`'s return).
  2. SUB-COMPONENT `CommentsLimitFields({ settings, saving, t }: CommentsLimitFieldsProps): JSX.Element` ← second `<div className="field-group">` verbatim.
  3. `SettingsSection` renders `<CommentsToggleFields … />` and `<CommentsLimitFields … />` in place. No hook changes (state already lives in `useSettingsSection`).
- **Importers to update:** none.
- **After:** `SettingsSection` ~35; sub-components ~30 / ~68; file ~135.
- **Risks / notes:** inputs are uncontrolled form fields read by `onSubmit` via FormData if `name=` attributes are used — keep every attribute verbatim. Header why-comment on `SettingsSection` export stays.
