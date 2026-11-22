# X-fs-files-1 — fs-files → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:16 T:17. Depends on: none (only already-Jini code). Est: J 37 min, T 24 min.

## J — move verbatim into Jini (2 files, 408 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/fs-files/custom-root-store.ts` | `packages/cms/src/fs-files/custom-root-store.ts` | 250 |  |
| `apps/website/src/features/fs-files/native-folder-picker.ts` | `packages/cms/src/fs-files/native-folder-picker.ts` | 158 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./fs-files/custom-root-store"]
- "@jini-ai/cms" exports["./fs-files/native-folder-picker"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (2, 334 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/fs-files/__tests__/custom-root-store.test.ts`
- `apps/website/src/features/fs-files/__tests__/native-folder-picker.test.ts`


## T — Tovu repoint: delete the 2 sources, rewrite every importer (10 lines)

```
apps/website/src/assistant/run-page-context.ts:1  '#src/features/fs-files/custom-root-store' -> '@jini-ai/cms/fs-files/custom-root-store'
apps/website/src/features/fs-files/__tests__/layout.test.ts:7  '../custom-root-store.js' -> '@jini-ai/cms/fs-files/custom-root-store'
apps/website/src/features/fs-files/__tests__/wiring.integration.test.ts:10  '../custom-root-store.js' -> '@jini-ai/cms/fs-files/custom-root-store'
apps/website/src/features/fs-files/layout.ts:5  './custom-root-store.js' -> '@jini-ai/cms/fs-files/custom-root-store'
apps/website/src/server/inbound/admin-http/routes/fs-files/custom-root.ts:14  '#src/features/fs-files/custom-root-store' -> '@jini-ai/cms/fs-files/custom-root-store'
apps/website/src/server/inbound/assistant/agent-daemon-run-launch.ts:12  '../../../features/fs-files/custom-root-store.js' -> '@jini-ai/cms/fs-files/custom-root-store'
apps/website/src/server/inbound/assistant/agent-daemon-run-start.ts:33  '../../../features/fs-files/custom-root-store.js' -> '@jini-ai/cms/fs-files/custom-root-store'
apps/website/src/server/runtime/composition/__tests__/booted-request-layouts.integration.test.ts:22  '#src/features/fs-files/custom-root-store' -> '@jini-ai/cms/fs-files/custom-root-store'
apps/website/src/server/inbound/admin-http/routes/fs-files/folder-picker.ts:8  '#src/features/fs-files/native-folder-picker' -> '@jini-ai/cms/fs-files/native-folder-picker'
apps/website/src/server/runtime/composition/http-app/mount-admin-system.ts:43  '#src/features/fs-files/native-folder-picker' -> '@jini-ai/cms/fs-files/native-folder-picker'
```

## Tovu tests that must stay green (3; import lines are repointed above, assertions untouched)
- `apps/website/src/features/fs-files/__tests__/layout.test.ts`
- `apps/website/src/features/fs-files/__tests__/wiring.integration.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/booted-request-layouts.integration.test.ts`

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/fs-files/custom-root-store.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `custom-root-store.ts`, negate the first `if (` condition of its first exported function; `custom-root-store.test.ts` must go red, then revert
