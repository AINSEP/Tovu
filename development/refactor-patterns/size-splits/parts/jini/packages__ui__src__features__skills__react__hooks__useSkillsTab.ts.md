### jini:packages/ui/src/features/skills/react/hooks/useSkillsTab.ts
- **Over:** `useSkillsTab` 260 (file 327)
- **Phase:** now · **Batch:** size-45
- **Tests:** `packages/ui/src/features/skills/__tests__/react/hooks/useSkillsTab.test.ts`; smoke `rg -l useSkillsTab packages/ui/src/features/skills/__tests__`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `skills`, `loading`, `loadError`, `portRef`, `alive` + effect, `refresh`, initial-load `useEffect` (~L141) | skills list loading |
| B | `filters`, `filteredSkills`, `sourceOptions`, `modeOptions`, `categoryOptions`, `setSearch`…`setCategoryFilter` | filters |
| C | `bodyById`, `bodyLoadingId`, `filesById`, `filesLoadingId`, `bodyByIdRef`, `filesByIdRef`, `ensureBody`, `ensureFiles` | lazy SKILL.md body + file-tree cache |
| D | `submitDraft` | save a draft |
| E | `commitDelete` | delete a skill |
| F | expanded/editing/creating/draft/confirm state, `toggleExpanded`, `startCreate`, `startEdit`, `requestEdit`, `confirmBuiltInEdit`, `cancelBuiltInEdit`, `cancelDraft`, `setDraft`, `armDelete`, `cancelDelete`, return | interaction state (stays) |

- **Splits** (same file, above `useSkillsTab`):
  1. SUB-HOOK `useSkillsList({ port }: UseSkillsListInput): { skills, loading, loadError, refresh, portRef, alive }` ← unit A.
  2. SUB-HOOK `useSkillFilters({ skills, locale }: UseSkillFiltersInput): { filters, filteredSkills, sourceOptions, modeOptions, categoryOptions, setSearch, setSourceFilter, setModeFilter, setCategoryFilter }` ← unit B.
  3. SUB-HOOK `useSkillContentCache({ portRef, alive }: UseSkillContentCacheInput): { bodyById, setBodyById, bodyLoadingId, filesById, setFilesById, filesLoadingId, ensureBody, ensureFiles }` ← unit C.
  4. SUB-HOOK `useSubmitSkillDraft({ draft, draftSaving, editingId, portRef, alive, refresh, setDraftError, setDraftSaving, setBodyById, setFilesById, setExpandedId, setEditingId, setCreating, setDraftState }: UseSubmitSkillDraftInput): () => void` ← `submitDraft` useCallback verbatim (deps array verbatim).
  5. SUB-HOOK `useCommitSkillDelete({ portRef, alive, refresh, setConfirmDeleteId, setBodyById, setFilesById, setExpandedId, setEditingId, setDraftState, setDraftError }: UseCommitSkillDeleteInput): (id: string) => Promise<void>` ← `commitDelete` (keep its exact signature/return type).
- **Importers to update:** none.
- **After:** `useSkillsTab` ~95; file ~370.
- **Risks / notes:** call order: list → filters → cache → (interaction `useState`s) → callbacks; sub-hooks 4/5 are called where `submitDraft`/`commitDelete` were. The filter `useState` moves before the cache `useState`s — state order only. If `useSkillsTab` is still >100 after counting, also move `startEdit`+`requestEdit`+`confirmBuiltInEdit` into `useSkillEditEntry({...})` (same rule).
