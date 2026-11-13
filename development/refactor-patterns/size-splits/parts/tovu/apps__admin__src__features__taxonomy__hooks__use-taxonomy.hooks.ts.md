### tovu:apps/admin/src/features/taxonomy/hooks/use-taxonomy.hooks.ts
- **Over:** `useTaxonomy` 102 (file 173, under)
- **Phase:** now (survey label `?`) · **Batch:** size-06
- **Tests:** `apps/admin/src/features/taxonomy/__tests__/use-taxonomy.unit.test.tsx`, `Taxonomy.unit.test.tsx`, `taxonomy-agent-drive.unit.test.tsx`, `html-embed.unit.test.tsx`, `embed-header-alignment.unit.test.tsx` (same folder), `apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts`, `apps/admin/src/hooks/__tests__/use-content-refresh-subscription.hooks.test.ts`
- **Responsibility map:**

| unit | statements in `useTaxonomy` | job |
|---|---|---|
| A | `pendingDeleteTerm`, `deleteTermBlocked`, `deleteTermMutation`, `requestDeleteTerm`, `confirmDeleteTerm` | delete one term (confirm + blocked state) |
| B | `pendingDeleteTaxonomy`, `deleteTaxonomyBlocked`, `deleteTaxonomyMutation`, `requestDeleteTaxonomy`, `confirmDeleteTaxonomy` | delete one taxonomy |
| C | `list`, `taxonomies`, `useTaxonomyHtmlEmbed`, `invalidate` + refresh `useEffect`, `selectedTermId`, `formOpen`, `selected`, `error`, return | screen state (stays) |

- **Splits** (same file, module level, above `useTaxonomy`, below `runGuardedDelete`):
  1. SUB-HOOK `useTermDeletion({ port, list, selectedTermId, setSelectedTermId }: UseTermDeletionInput): { pendingDeleteTerm; deleteTermBlocked; deleteTermMutation; requestDeleteTerm; confirmDeleteTerm }` ← unit A verbatim.
  2. SUB-HOOK `useTaxonomyDeletion({ port, list, selected, setSelectedTermId }: UseTaxonomyDeletionInput): { pendingDeleteTaxonomy; deleteTaxonomyBlocked; deleteTaxonomyMutation; requestDeleteTaxonomy; confirmDeleteTaxonomy }` ← unit B verbatim.
  3. `useTaxonomy` order: `list`…refresh effect → `selectedTermId`, `formOpen` → `useTermDeletion` → `selected` (useMemo) → `useTaxonomyDeletion` → `error` → return (unchanged fields). Type `list` by wrapping the existing `useFetchQuery({ key: KEYS.list, fetch: () => port.listTaxonomies() })` call verbatim in a module-level `useTaxonomyListQuery({ port }: { port: TaxonomyPort })` and using `ReturnType<typeof useTaxonomyListQuery>`; `useTaxonomy` calls it where `list` is declared now.
- **Importers to update:** none.
- **After:** file ~190; `useTaxonomy` ~55; each sub-hook ~30.
- **Risks / notes:** the refresh `useEffect` (L178) is the content-refresh subscription `content-refresh-coverage.unit.test.ts` looks for in THIS file — it stays in `useTaxonomy`. `useState`/mutation order shifts only by grouping.
