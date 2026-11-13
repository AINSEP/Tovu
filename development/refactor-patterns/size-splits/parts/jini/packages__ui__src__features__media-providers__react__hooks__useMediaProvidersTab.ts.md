### jini:packages/ui/src/features/media-providers/react/hooks/useMediaProvidersTab.ts
- **Over:** `useMediaProvidersTab` 168 (file 231, fine)
- **Phase:** now · **Batch:** size-37
- **Tests:** `src/features/media-providers/__tests__/react/hooks/useMediaProvidersTab.test.ts`, `src/features/media-providers/__tests__/catalog-ports.test.ts`, `src/features/media-providers/__tests__/index.test.ts`
- **Responsibility map** (inside `useMediaProvidersTab`):

| unit | statements | job |
|---|---|---|
| A | `providers`, `pendingProviderIds`, the "The working set, mirrored into refs…" comment, `providersRef`, `pendingRef`, `applyProviders`, `applyPending` | synchronously-mirrored working set |
| B | `save`, type `PersistOutcome` (+ "`'abandoned'` is deliberately distinct…" comment), `flushNow` (+doc), `writing`, `queued`, `persist` (+doc) | serialized, coalesced whole-map writes |
| C | `load`, `loadTicket` (+comment), `fetchAndReconcile`, the mount `useEffect`, `reload` | ticketed load + reconcile (+ one-time migration) |
| D | `portRef`, `mutatedSinceSend`, `clearedProviderIds`, `alive` + effect, `updateProvider`, `clearProvider`, `saveChanges`, `return` | shared refs + edit actions — stay |

- **Splits** (same file, module level above `useMediaProvidersTab`, in this order; statements verbatim with all comments; deps arrays unchanged):
  1. TYPE `PersistOutcome` moves from inside the hook to module level (with its comment), unexported.
  2. SUB-HOOK `useProviderWorkingSet({ initialProviders, normalizeMediaProviderMap }: UseProviderWorkingSetInput): ProviderWorkingSet` ← unit A. Returns `{ providers, pendingProviderIds, providersRef, pendingRef, applyProviders, applyPending }` (`MutableRefObject<MediaProviderMap>`, `MutableRefObject<ReadonlySet<string>>`, `(next: MediaProviderMap) => void`, `(next: ReadonlySet<string>) => void`). Input types: `initialProviders: UseMediaProvidersTabOptions['initialProviders']`, `normalizeMediaProviderMap: UseMediaProvidersTabOptions['catalogPolicy']['normalizeMediaProviderMap']`.
  3. SUB-HOOK `useProviderPersistence({ portRef, alive, providersRef, pendingRef, mutatedSinceSend, clearedProviderIds, applyProviders, applyPending, normalizeMediaProviderMap }: UseProviderPersistenceInput): { save: MediaProvidersSaveState; persist: () => Promise<PersistOutcome> }` ← unit B (`useState` for `save` first, then `flushNow`, `writing`, `queued`, `persist`). `mutatedSinceSend`/`clearedProviderIds`: `MutableRefObject<Set<string>>`; `portRef: MutableRefObject<UseMediaProvidersTabOptions['port']>`; `alive: MutableRefObject<boolean>`.
  4. SUB-HOOK `useProviderLoad({ port, portRef, alive, providersRef, pendingRef, clearedProviderIds, applyProviders, normalizeMediaProviderMap, persist }: UseProviderLoadInput): { load: MediaProvidersLoadState; reload: () => void }` ← unit C (`useState` for `load`, `loadTicket`, `fetchAndReconcile`, mount effect with its comment and deps `[port, fetchAndReconcile]`, `reload`).
  5. `useMediaProvidersTab` keeps: `catalogPolicy` destructure; `useProviderWorkingSet(...)`; `portRef` (+comment); `mutatedSinceSend` (+doc); `clearedProviderIds` (+doc); `alive` + its effect; `useProviderPersistence(...)`; `useProviderLoad(...)`; `updateProvider`, `clearProvider`, `saveChanges`; same `return`.
- **Importers to update:** none (no exports move).
- **After:** file ~265; `useMediaProvidersTab` ~78; `useProviderPersistence` ~62; `useProviderLoad` ~40; `useProviderWorkingSet` ~18.
- **Risks / notes:** effect order preserved: `alive` effect registers before the mount-fetch effect (persistence/load sub-hooks are called after it). `useState` order changes (`load`/`save` now after refs) — no behavior effect. The working-set comment's rule "nothing in this hook may call `setProviders`/`setPendingProviderIds` directly" is now enforced by the sub-hook boundary — keep the comment as is. Pre-existing `let settle!:` in `persist` moves unchanged. No `vi.mock` of this file.
