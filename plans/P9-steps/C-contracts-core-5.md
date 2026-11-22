# C-contracts-core-5 — contracts-core → @jini-ai/core (Jini step J then Tovu step T)

Lane C. Batch J:3 T:6. Depends on: C-contracts-core-3. Est: J 72 min, T 43 min.

## J — move verbatim into Jini (14 files, 950 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/contracts/core/tool-metadata/mail-status.ts` | `packages/core/src/contracts/site/tool-metadata/mail-status.ts` | 98 |  |
| `apps/website/src/contracts/core/tool-metadata/media-generation.ts` | `packages/core/src/contracts/site/tool-metadata/media-generation.ts` | 32 |  |
| `apps/website/src/contracts/core/tool-metadata/media-import.ts` | `packages/core/src/contracts/site/tool-metadata/media-import.ts` | 43 |  |
| `apps/website/src/contracts/core/tool-metadata/media.ts` | `packages/core/src/contracts/site/tool-metadata/media.ts` | 106 |  |
| `apps/website/src/contracts/core/tool-metadata/navigation.ts` | `packages/core/src/contracts/site/tool-metadata/navigation.ts` | 74 |  |
| `apps/website/src/contracts/core/tool-metadata/observability.ts` | `packages/core/src/contracts/site/tool-metadata/observability.ts` | 11 |  |
| `apps/website/src/contracts/core/tool-metadata/pages.ts` | `packages/core/src/contracts/site/tool-metadata/pages.ts` | 70 |  |
| `apps/website/src/contracts/core/tool-metadata/permanent-delete.ts` | `packages/core/src/contracts/site/tool-metadata/permanent-delete.ts` | 126 |  |
| `apps/website/src/contracts/core/tool-metadata/plugin-runtime.ts` | `packages/core/src/contracts/site/tool-metadata/plugin-runtime.ts` | 78 | W1 |
| `apps/website/src/contracts/core/tool-metadata/recovery.ts` | `packages/core/src/contracts/site/tool-metadata/recovery.ts` | 81 |  |
| `apps/website/src/contracts/core/tool-metadata/redirects.ts` | `packages/core/src/contracts/site/tool-metadata/redirects.ts` | 96 |  |
| `apps/website/src/contracts/core/tool-metadata/search.ts` | `packages/core/src/contracts/site/tool-metadata/search.ts` | 36 |  |
| `apps/website/src/contracts/core/tool-metadata/seo.ts` | `packages/core/src/contracts/site/tool-metadata/seo.ts` | 86 |  |
| `apps/website/src/contracts/core/tool-metadata/server-logs.ts` | `packages/core/src/contracts/site/tool-metadata/server-logs.ts` | 13 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/core" exports["./contracts/site/tool-metadata/mail-status"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/media"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/media-generation"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/media-import"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/navigation"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/observability"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/pages"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/permanent-delete"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/plugin-runtime"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/recovery"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/redirects"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/search"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/seo"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/server-logs"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 14 sources, rewrite every importer (42 lines)

```
apps/website/src/contracts/core/tool-metadata/index.ts:28  './mail-status.js' -> '@jini-ai/core/contracts/site/tool-metadata/mail-status'
apps/website/src/features/mail-status/delivery-tool-registrations.ts:1  '../../contracts/core/tool-metadata/mail-status.js' -> '@jini-ai/core/contracts/site/tool-metadata/mail-status'
apps/website/src/features/mail-status/provider-tool-registrations.ts:1  '../../contracts/core/tool-metadata/mail-status.js' -> '@jini-ai/core/contracts/site/tool-metadata/mail-status'
apps/website/src/features/mail-status/tool-registrations.ts:1  '../../contracts/core/tool-metadata/mail-status.js' -> '@jini-ai/core/contracts/site/tool-metadata/mail-status'
apps/website/src/contracts/core/tool-metadata/index.ts:30  './media-generation.js' -> '@jini-ai/core/contracts/site/tool-metadata/media-generation'
apps/website/src/features/media-generation/providers-tools.ts:1  '../../contracts/core/tool-metadata/media-generation.js' -> '@jini-ai/core/contracts/site/tool-metadata/media-generation'
apps/website/src/features/media-generation/tool-registrations.ts:5  '../../contracts/core/tool-metadata/media-generation.js' -> '@jini-ai/core/contracts/site/tool-metadata/media-generation'
apps/website/src/contracts/core/tool-metadata/index.ts:31  './media-import.js' -> '@jini-ai/core/contracts/site/tool-metadata/media-import'
apps/website/src/features/media-import/tool-registrations.ts:4  '../../contracts/core/tool-metadata/media-import.js' -> '@jini-ai/core/contracts/site/tool-metadata/media-import'
apps/website/src/contracts/core/tool-metadata/index.ts:29  './media.js' -> '@jini-ai/core/contracts/site/tool-metadata/media'
apps/website/src/features/media/library-save-attachment.ts:7  '../../contracts/core/tool-metadata/media.js' -> '@jini-ai/core/contracts/site/tool-metadata/media'
apps/website/src/features/media/list-pending-chat-attachments.ts:1  '../../contracts/core/tool-metadata/media.js' -> '@jini-ai/core/contracts/site/tool-metadata/media'
apps/website/src/features/media/promote-chat-attachment.ts:1  '../../contracts/core/tool-metadata/media.js' -> '@jini-ai/core/contracts/site/tool-metadata/media'
apps/website/src/features/media/tool-registrations.ts:6  '../../contracts/core/tool-metadata/media.js' -> '@jini-ai/core/contracts/site/tool-metadata/media'
apps/website/src/features/media/view-image-tool.ts:1  '../../contracts/core/tool-metadata/media.js' -> '@jini-ai/core/contracts/site/tool-metadata/media'
apps/website/src/features/media/view-video-tool.ts:1  '../../contracts/core/tool-metadata/media.js' -> '@jini-ai/core/contracts/site/tool-metadata/media'
apps/website/src/contracts/core/tool-metadata/index.ts:33  './navigation.js' -> '@jini-ai/core/contracts/site/tool-metadata/navigation'
apps/website/src/features/navigation/tool-registrations.ts:1  '../../contracts/core/tool-metadata/navigation.js' -> '@jini-ai/core/contracts/site/tool-metadata/navigation'
apps/website/src/contracts/core/tool-metadata/index.ts:45  './observability.js' -> '@jini-ai/core/contracts/site/tool-metadata/observability'
apps/website/src/features/observability/tool-registrations.ts:7  '../../contracts/core/tool-metadata/observability.js' -> '@jini-ai/core/contracts/site/tool-metadata/observability'
apps/website/src/contracts/core/tool-metadata/index.ts:35  './pages.js' -> '@jini-ai/core/contracts/site/tool-metadata/pages'
apps/website/src/features/pages/tool-registrations.ts:1  '../../contracts/core/tool-metadata/pages.js' -> '@jini-ai/core/contracts/site/tool-metadata/pages'
apps/website/src/contracts/core/tool-metadata/index.ts:36  './permanent-delete.js' -> '@jini-ai/core/contracts/site/tool-metadata/permanent-delete'
apps/website/src/features/permanent-delete/tool-registrations.ts:2  '../../contracts/core/tool-metadata/permanent-delete.js' -> '@jini-ai/core/contracts/site/tool-metadata/permanent-delete'
apps/website/src/contracts/core/tool-metadata/index.ts:37  './plugin-runtime.js' -> '@jini-ai/core/contracts/site/tool-metadata/plugin-runtime'
apps/website/src/features/plugin-runtime/__tests__/unit/source-tools.unit.test.ts:10  '../../../../contracts/core/tool-metadata/plugin-runtime.js' -> '@jini-ai/core/contracts/site/tool-metadata/plugin-runtime'
apps/website/src/features/plugin-runtime/capability-tool-registrations.ts:4  '../../contracts/core/tool-metadata/plugin-runtime.js' -> '@jini-ai/core/contracts/site/tool-metadata/plugin-runtime'
apps/website/src/features/plugin-runtime/host-tool-binding.ts:8  '../../contracts/core/tool-metadata/plugin-runtime.js' -> '@jini-ai/core/contracts/site/tool-metadata/plugin-runtime'
apps/website/src/features/plugin-runtime/install-tool-binding.ts:8  '../../contracts/core/tool-metadata/plugin-runtime.js' -> '@jini-ai/core/contracts/site/tool-metadata/plugin-runtime'
apps/website/src/features/plugin-runtime/provider-status-tool.ts:2  '../../contracts/core/tool-metadata/plugin-runtime.js' -> '@jini-ai/core/contracts/site/tool-metadata/plugin-runtime'
apps/website/src/contracts/core/tool-metadata/index.ts:40  './recovery.js' -> '@jini-ai/core/contracts/site/tool-metadata/recovery'
apps/website/src/features/recovery/tool-registrations.ts:1  '../../contracts/core/tool-metadata/recovery.js' -> '@jini-ai/core/contracts/site/tool-metadata/recovery'
apps/website/src/contracts/core/tool-metadata/index.ts:41  './redirects.js' -> '@jini-ai/core/contracts/site/tool-metadata/redirects'
apps/website/src/features/redirects/__tests__/agent-tools.tombstone-confirmation.test.ts:21  '#src/contracts/core/tool-metadata/redirects' -> '@jini-ai/core/contracts/site/tool-metadata/redirects'
apps/website/src/features/redirects/tool-registrations.ts:7  '../../contracts/core/tool-metadata/redirects.js' -> '@jini-ai/core/contracts/site/tool-metadata/redirects'
apps/website/src/contracts/core/tool-metadata/index.ts:42  './search.js' -> '@jini-ai/core/contracts/site/tool-metadata/search'
apps/website/src/server/runtime/composition/__tests__/site-search-tools.test.ts:13  '#src/contracts/core/tool-metadata/search' -> '@jini-ai/core/contracts/site/tool-metadata/search'
apps/website/src/server/runtime/composition/site-search-tools.ts:9  '#src/contracts/core/tool-metadata/search' -> '@jini-ai/core/contracts/site/tool-metadata/search'
apps/website/src/contracts/core/tool-metadata/index.ts:43  './seo.js' -> '@jini-ai/core/contracts/site/tool-metadata/seo'
apps/website/src/features/seo/tool-registrations.ts:1  '../../contracts/core/tool-metadata/seo.js' -> '@jini-ai/core/contracts/site/tool-metadata/seo'
apps/website/src/contracts/core/tool-metadata/index.ts:44  './server-logs.js' -> '@jini-ai/core/contracts/site/tool-metadata/server-logs'
apps/website/src/features/server-logs/tool-registrations.ts:1  '../../contracts/core/tool-metadata/server-logs.js' -> '@jini-ai/core/contracts/site/tool-metadata/server-logs'
```

## Tovu tests that must stay green (3; import lines are repointed above, assertions untouched)
- `apps/website/src/features/plugin-runtime/__tests__/unit/source-tools.unit.test.ts`
- `apps/website/src/features/redirects/__tests__/agent-tools.tombstone-confirmation.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/site-search-tools.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/contracts/core/tool-metadata/plugin-runtime.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/contracts/core/tool-metadata/plugin-runtime.ts:20: keywords: "plugin plugins install add new upload folder zip attachment local package upgrade replace version site plugin tovu-plugin extensi
```

## Named mutation
in the Jini copy of `permanent-delete.ts`, negate the first `if (` condition of its first exported function; a NEW characterization test (write it first, tests-first rule) must go red, then revert
