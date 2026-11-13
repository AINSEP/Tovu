### jini:packages/ui/src/features/project-locations/react/components/ProjectLocationsTab.tsx
- **Over:** `ProjectLocationsTab` 103 (file 157)
- **Phase:** now · **Batch:** size-44
- **Tests:** `packages/ui/src/features/project-locations/react/components/__tests__/ProjectLocationsTab.characterization.test.tsx` (vi.mocks `useProjectLocationsTab` — unaffected, nothing moves out of the hook path), `packages/ui/src/features/project-locations/__tests__/react/components/ProjectLocationsTab.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `const notice = (() => {`, `errorNoticeByStatus`, `errorNotice` | map action result to a notice line |
| B | rest | render the tab |

- **Splits:**
  1. HELPER (same file, above the component) `resolveLocationNotices({ result, copy, t }: ResolveLocationNoticesInput): { notice: string | null; errorNotice: string | null }` ← the three statements of unit A; `copy` = the resolved labels object (`noFolderSelectedLabel`, `duplicateLabel`, `savedLabel`, `defaultSavedLabel`, `scanCompleteTemplate`, `saveErrorLabel`, `scanErrorLabel`). Keep `notice`'s IIFE return type as is.
- **Importers to update:** none.
- **After:** `ProjectLocationsTab` ~84; file ~165.
- **Risks / notes:** none beyond typing `copy` as `ReturnType<typeof resolveLabels>`.
