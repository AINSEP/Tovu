# A-adm-publish-content-1 — adm-publish-content → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:24 T:25. Depends on: none (only already-Jini code). Est: J 32 min, T 30 min.

## J — move verbatim into Jini (2 files, 217 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/publish-content/hooks/publish-availability.store.ts` | `packages/admin/src/publish-content/screen/hooks/publish-availability.store.ts` | 46 | W1 |
| `apps/admin/src/features/publish-content/publish-content.css` | `packages/admin/src/publish-content/screen/publish-content.css` | 171 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./publish-content/screen/hooks/publish-availability.store"]
- "@jini-ai/admin" exports["./publish-content/screen/publish-content"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 2 sources, rewrite every importer (13 lines)

```
apps/admin/src/App.hooks.ts:37  './features/publish-content/hooks/publish-availability.store' -> '@jini-ai/admin/publish-content/screen/hooks/publish-availability.store'
apps/admin/src/App.session.ts:12  './features/publish-content/hooks/publish-availability.store' -> '@jini-ai/admin/publish-content/screen/hooks/publish-availability.store'
apps/admin/src/__tests__/unit/app-session-boot-token.unit.test.tsx:6  '../../features/publish-content/hooks/publish-availability.store' -> '@jini-ai/admin/publish-content/screen/hooks/publish-availability.store'
apps/admin/src/features/dashboard/Dashboard.tsx:11  '../publish-content/hooks/publish-availability.store' -> '@jini-ai/admin/publish-content/screen/hooks/publish-availability.store'
apps/admin/src/features/dashboard/__tests__/Dashboard.unit.test.tsx:5  '../../publish-content/hooks/publish-availability.store' -> '@jini-ai/admin/publish-content/screen/hooks/publish-availability.store'
apps/admin/src/features/publish-content/__tests__/publish-availability.store.unit.test.tsx:9  '../hooks/publish-availability.store' -> '@jini-ai/admin/publish-content/screen/hooks/publish-availability.store'
apps/admin/src/features/publish-content/__tests__/use-publish-section-button.hooks.unit.test.tsx:4  '../hooks/publish-availability.store' -> '@jini-ai/admin/publish-content/screen/hooks/publish-availability.store'
apps/admin/src/features/publish-content/hooks/publish-request.store.ts:5  './publish-availability.store' -> '@jini-ai/admin/publish-content/screen/hooks/publish-availability.store'
apps/admin/src/features/publish-content/hooks/use-publish-section-button.hooks.ts:5  './publish-availability.store' -> '@jini-ai/admin/publish-content/screen/hooks/publish-availability.store'
apps/admin/src/integrations/jini-admin/__tests__/media-swap.unit.test.tsx:10  '../../../features/publish-content/hooks/publish-availability.store' -> '@jini-ai/admin/publish-content/screen/hooks/publish-availability.store'
apps/admin/src/integrations/jini-admin/__tests__/seo-swap.unit.test.tsx:14  '../../../features/publish-content/hooks/publish-availability.store' -> '@jini-ai/admin/publish-content/screen/hooks/publish-availability.store'
apps/admin/src/integrations/jini-admin/__tests__/widgets-swap.unit.test.tsx:21  '../../../features/publish-content/hooks/publish-availability.store' -> '@jini-ai/admin/publish-content/screen/hooks/publish-availability.store'
apps/admin/src/main.tsx:37  './features/publish-content/publish-content.css' -> '@jini-ai/admin/publish-content/screen/publish-content'
```

## Tovu tests that must stay green (7; import lines are repointed above, assertions untouched)
- `apps/admin/src/__tests__/unit/app-session-boot-token.unit.test.tsx`
- `apps/admin/src/features/dashboard/__tests__/Dashboard.unit.test.tsx`
- `apps/admin/src/features/publish-content/__tests__/publish-availability.store.unit.test.tsx`
- `apps/admin/src/features/publish-content/__tests__/use-publish-section-button.hooks.unit.test.tsx`
- `apps/admin/src/integrations/jini-admin/__tests__/media-swap.unit.test.tsx`
- `apps/admin/src/integrations/jini-admin/__tests__/seo-swap.unit.test.tsx`
- `apps/admin/src/integrations/jini-admin/__tests__/widgets-swap.unit.test.tsx`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/admin/src/features/publish-content/hooks/publish-availability.store.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/admin/src/features/publish-content/hooks/publish-availability.store.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `publish-content.css`, negate the first `if (` condition of its first exported function; a NEW characterization test (write it first, tests-first rule) must go red, then revert
