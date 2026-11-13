### jini:packages/ui/src/features/project-locations/react/hooks/useProjectLocationsTab.ts
- **Over:** `useProjectLocationsTab` 119 (file 169)
- **Phase:** now · **Batch:** size-44
- **Tests:** `packages/ui/src/features/project-locations/react/hooks/__tests__/useProjectLocationsTab.characterization.test.ts`, `packages/ui/src/features/project-locations/__tests__/react/hooks/useProjectLocationsTab.test.ts`, smoke `packages/ui/src/features/project-locations/react/components/__tests__/ProjectLocationsTab.characterization.test.tsx` (mocks this module path — `useProjectLocationsTab` stays exported here, so fine)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `locations`/`drafts`/`loading` state, `portRef`, `locationsRef`, `draftsRef`, `alive` + its effect, initial-fetch `useEffect` (~L108) | load locations and keep run-time refs |
| B | `saving`/`result` state, default-id refs, `persist`, `addFolder`, `removeDraft`, `setDefaultLocationId` | edit + persist (stays) |

- **Splits:**
  1. SUB-HOOK (same file, above) `useLoadedLocations({ port }: UseLoadedLocationsInput): { locations, setLocations, drafts, setDrafts, loading, portRef, locationsRef, draftsRef, alive }` ← unit A statements, comment "Volatile values async callbacks need at RUN time…" moves with the refs (copy it again above the default-id refs that stay).
- **Importers to update:** none.
- **After:** `useProjectLocationsTab` ~80; file ~180.
- **Risks / notes:** useState order changes (`saving`/`result` after the sub-hook) — harmless. The mount `alive` effect must stay before the fetch effect (both inside the sub-hook, same order).
