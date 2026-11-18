# S7 — slices `events-origin`, `redirect-media-repos`, `trash-*`, `redirects` (C1-C4)

Responsibility: bindings `outbox` … the three `onStoreClose` registrations after `redirectsWriteDeps` (`b5fbf2a5` 1290-1581). Budget ≤160k. Commits: 6. Prerequisites: S6; COMMON §1-§4, §9 (`DS_SHEET=S7`).

| commit | slice | bindings | getters | returns |
|---|---|---|---|---|
| 1 | `slices/events-origin.ts` (+ `registerBootOrigin` from S4) | `outbox` … `originRegistry` | — | `outbox`, `bus`, `devCapabilityScheme`, `originReady`, `originRegistry` (+ every other name a later statement reads — census eager/deferred columns) |
| 2 | `slices/redirect-media-repos.ts` | `redirectRepo`, `redirectHitSink`, `assetRenditionRepo` | — | same |
| 3 | `slices/trash-follow-ups.ts` (S4's four functions) | `trashRegistry` … `trashFollowUpHooks` | `mediaRepo`, `postRepo`, `assetBlobRepo`, `entryRefsRepo`, `routeDeps` | `trashRegistry`, `sqliteTrashDb`, `trashRepo`, `formDeliveryRepo`, `trashFollowUpHooks` |
| 4 | `slices/trash-adapters.ts` (the Map statement **whole** — S4 left it intact; split it in this commit only if `check:size` fails the slice function) | `pluginTrashAdapter`, `trashAdapters` | `mediaRepo`, `entryRefsRepo`, `postRepo`, `assetBlobRepo` | `pluginTrashAdapter`, `trashAdapters` (the **same** Map instance; S10's themes step `.set`s it) |
| 5 | `slices/trash-service.ts` | `trashTransaction` … `isInTrash` | `postRepo` | `trashTransaction`, `trash`, `removePlugin`, `removeUser`, `isInTrash` |
| 6 | `slices/redirects.ts` | `redirectsWriteDeps` + the three `onStoreClose` registrations, at the same positions, `onStoreClose` passed as a value | — | `redirectsWriteDeps` |

## Carries
| behaviour (base lines) | pin |
|---|---|
| locked purge snapshots and the kept-attachment error (1388-1455) | S4's `trash-follow-up-hooks.unit.test.ts` (now importing the slice); S0 pin 2 |
| one shared trash adapter Map, mutated later by themes (1461, 2007) | STOP block (one `new Map<string, TrashAdapter>`); S0 pin 2 (`removeTheme`) |
| `trash`'s `onError` text verbatim (1528) | new `$D/__tests__/trash-service.unit.test.ts`: a failing hook → the exact `console.error` text |
| close hooks: the three registrations are still made at the same positions in boot order (1574-1581) and run inside the teardown barriers — drain → **all** registrations (concurrently, `Promise.all`, `deps.ts:701`; no order among them) → sweeps → close | S0 pin 5 (barriers); `composition-boot-order.unit.test.ts` new assertion: `composeRedirects(` comes after `composeTrashService(` in the root |
| boot origin registered before the readiness promise resolves (1322-1352) | S4's `register-boot-origin.unit.test.ts`; `production-readiness-boot.integration.test.ts` |
| user removal through trash wins over `...identity` (literal precedence) | S0 pin 2 |

```bash
SHEET_TESTS=(
  apps/website/src/server/runtime/composition/__tests__/memory-root-trash-adapters.pin.test.ts
  apps/website/src/server/__tests__/routes/taxonomy-trash-routes.test.ts
)   # plus SR_TESTS and CHANGED_TESTS (COMMON §5)
```

## STOP (before the report commit; COMMON §9 rule 8 form)
```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
grep -rnE 'new Map<string, TrashAdapter>' "$D/deps.ts" "$D/site-deps" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-S7-ONE-TRASH-MAP"; exit 1; }
grep -rnE '^(export )?async function|^  (const [^=]+= )?await ' "$D/site-deps/slices/events-origin.ts" "$D/site-deps/slices/redirect-media-repos.ts" "$D/site-deps/slices/trash-follow-ups.ts" "$D/site-deps/slices/trash-adapters.ts" "$D/site-deps/slices/trash-service.ts" "$D/site-deps/slices/redirects.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S7-ASYNC-SLICE"; exit 1; }
```
(`async` arrows **inside** a slice — hooks, adapters — are today's code and allowed: the pattern matches only module-level `async function` declarations and awaits at a function body's own two-space indent.) Gates: COMMON §5.
