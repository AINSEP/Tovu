# S7 — stage `events-trash` (C1-C4)

Responsibility: bindings `outbox` … the three `onStoreClose` registrations after `redirectsWriteDeps` (`f0613d9e` 1290-1581). Budget ≤190k. Commits: 6. Prerequisites: S6; COMMON §1-§3, §9 (`DS_SHEET=S7`).

| commit | slice | bindings | getters | returns |
|---|---|---|---|---|
| 1 | `slices/events-origin.ts` (+ `registerBootOrigin` from S4) | `outbox` … `originRegistry` | — | `outbox`, `bus`, `devCapabilityScheme`, `originReady`, `originRegistry` (+ every other name a later statement reads — census eager/deferred columns) |
| 2 | `slices/redirect-media-repos.ts` | `redirectRepo`, `redirectHitSink`, `assetRenditionRepo` | — | same |
| 3 | `slices/trash-follow-ups.ts` (S4's four functions) | `trashRegistry` … `trashFollowUpHooks` | `mediaRepo`, `postRepo`, `assetBlobRepo`, `entryRefsRepo`, `routeDeps` | `trashRegistry`, `sqliteTrashDb`, `trashRepo`, `formDeliveryRepo`, `trashFollowUpHooks` |
| 4 | `slices/trash-adapters.ts` (S4's three functions) | `pluginTrashAdapter`, `trashAdapters` | `mediaRepo`, `entryRefsRepo`, `postRepo`, `assetBlobRepo` | `pluginTrashAdapter`, `trashAdapters` (the **same** Map instance; S10's themes step `.set`s it) |
| 5 | `slices/trash-service.ts` | `trashTransaction` … `isInTrash` | `postRepo` | `trashTransaction`, `trash`, `removePlugin`, `removeUser`, `isInTrash` |
| 6 | `slices/redirects.ts` + `stages/events-trash.ts` (sync) | `redirectsWriteDeps` + the three registrations, in order, `onStoreClose` passed as a value | — | `redirectsWriteDeps` |

## Carries
| behaviour (base lines) | pin |
|---|---|
| locked purge snapshots and the kept-attachment error (1388-1455) | S4's `trash-follow-up-hooks.unit.test.ts` (now importing the slice); S0 pin 2 |
| one shared trash adapter Map, mutated later by themes (1464, 2007) | `expect-count` below; S0 pin 2 (`removeTheme`) |
| `trash`'s `onError` text verbatim (1528) | `trash-service.unit.test.ts`: a failing hook → the exact `console.error` text |
| close hooks: the three registrations run at teardown in the same order of registration (1574-1581) | S0 pin 5 (teardown) |
| boot origin registered before the readiness promise resolves (1322-1352) | S4's `register-boot-origin.unit.test.ts`; `production-readiness-boot.integration.test.ts` |
| user removal through trash wins over `...identity` (literal precedence) | S0 pin 2 |

## STOP
```bash
set -euo pipefail
G="bash designs/deps-split/work/gates.sh"; D=apps/website/src/server/runtime/composition
$G expect-count S7-ONE-TRASH-MAP 1 'new Map<string, TrashAdapter>' $D/deps.ts $D/site-deps
$G forbid S7-ASYNC-SLICE '^(export )?async function|^  (const [^=]+= )?await ' $D/site-deps/slices/events-origin.ts $D/site-deps/slices/redirect-media-repos.ts $D/site-deps/slices/trash-follow-ups.ts $D/site-deps/slices/trash-adapters.ts $D/site-deps/slices/trash-service.ts $D/site-deps/slices/redirects.ts $D/site-deps/stages/events-trash.ts
```
(`async` arrows **inside** a slice — hooks, adapters — are today's code and allowed: the pattern matches only module-level `async function` declarations and awaits at a function body's own two-space indent.) Gates: COMMON §5; at sheet end also `memory-root-trash-adapters.pin.test.ts` (in `tests sr`) and `server/__tests__/routes/*trash*.test.ts` (in `tests wide`).
