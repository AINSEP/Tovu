# S7 — stage `events-trash` (rows C1-C4)

Responsibility: statements 56-85 (`f0613d9e` 1293-1584). Budget ≤200k. Commits: 6.
Prerequisites: S6. COMMON §2, §3, §9.

| commit | slice | statements | getters | returns |
|---|---|---|---|---|
| 1 | `slices/events-origin.ts` (+ `registerBootOrigin` module fn from S4) | 56-63 | — | `outbox`, `bus`, `devCapabilityScheme`, `originReady`, `originRegistry` (+ any other name later rows read; check census) |
| 2 | `slices/redirect-media-repos.ts` | 64-66 | — | `redirectRepo`, `redirectHitSink`, `assetRenditionRepo` |
| 3 | `slices/trash-follow-ups.ts` (S4's four functions move here) | 67-74 | `mediaRepo`, `postRepo`, `assetBlobRepo`, `entryRefsRepo`, `routeDeps` | `trashRegistry`, `sqliteTrashDb`, `trashRepo`, `formDeliveryRepo`, `trashFollowUpHooks` |
| 4 | `slices/trash-adapters.ts` (S4's three functions) | 75-76 | `mediaRepo`, `entryRefsRepo`, `postRepo`, `assetBlobRepo` | `pluginTrashAdapter`, `trashAdapters` (the **same** Map instance; G2 mutates it in S10) |
| 5 | `slices/trash-service.ts` | 77-81 | `postRepo` | `trashTransaction`, `trash`, `removePlugin`, `removeUser`, `isInTrash` |
| 6 | `slices/redirects.ts` + `stages/events-trash.ts` | 82-85; stage 56-85 | — | `redirectsWriteDeps` |

The three `onStoreClose` registrations (1577-1584) move in order with their `onStoreClose` passed as a value. `trash`'s `onError` `console.error` text (1531) is verbatim.

## STOP
```bash
D=apps/website/src/server/runtime/composition/site-deps
grep -n 'new Map<string, TrashAdapter>' -r $D | wc -l | grep -qx 1 || echo "STOP: trash adapter Map built more than once"
grep -nE '^  (const [^=]+= )?await ' $D/slices/{events-origin,redirect-media-repos,trash-follow-ups,trash-adapters,trash-service,redirects}.ts && echo "STOP: a top-level await appeared in a synchronous block"
```
Gates: COMMON §5; `site-root.overridden-capabilities.pin.test.ts`, `memory-root-trash-adapters.pin.test.ts` (unchanged root, sanity) and the trash route tests `apps/website/src/server/__tests__/routes/*trash*.test.ts` at sheet end.
