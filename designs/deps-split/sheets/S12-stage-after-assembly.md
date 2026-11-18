# S12 — stage `after-assembly` (rows I1-I7)

Responsibility: statements 185-213 (`f0613d9e` 2722-2932); statement 184 `resolveRouteDeps(routeDeps)` and 202 `routeDepsBuiltForPluginHost = routeDeps` stay in the closure. Budget ≤200k. Commits: 8.
Prerequisites: S11. COMMON §2, §3, §9. Every slice receives `routeDeps` as a **value** (it exists) and writes the same `routeDeps.<key>` as today (15 writes, `grep -P '\twrite\t' work/literal-keys.tsv`).

| commit | slice | statements | notes |
|---|---|---|---|
| 1 | `slices/widget-adoption.ts` | 185-186 | `logger`; returns `widgetAdoptionReady`; writes `legacyPublishCredentialsReady` |
| 2 | `slices/forms.ts` | 187-192 | writes 6 keys in order. `serving-app-boot-wiring.unit.test.ts:164` list: `server/runtime/composition/deps.ts` → `server/runtime/composition/site-deps/slices/forms.ts` |
| 3 | `slices/site-search.ts` | 193 | |
| 4 | `slices/commerce.ts` (+ `compositionCommerce`; `compositionSharedOAuth` also moves here and is imported by the literal's caller in the closure until S13) | 195-199 | registration `onStoreClose(commerceBinding.close)` in order |
| 5 | `slices/plugin-host.ts`: `attachPluginHost` (200-201) and `startPluginRuntime` (203-205) | 200-205 minus 202 | closure order: `attachPluginHost(...)`; `routeDepsBuiltForPluginHost = routeDeps;` (202); `startPluginRuntime(...)`. `startPluginRuntime` receives the boot-drain promises as values (`widgetAdoptionReady`, `blobHydrationReady`, `adminPasswordResetReady`, `postSearchBackfillReady`, `originReady`, `adminSurfaceHandlersReady`, `siteAppBootWork`) and `provideMediaCredentials` (S5) |
| 6 | `slices/site-sharing.ts` (S4's 4 functions) + `slices/site-imports.ts` | 206-210 | `savedKeys` built in the sharing slice and passed to imports |
| 7 | `slices/consent-analytics.ts` (+ `configureVisitorConsentAnalytics`) | 211-213 | **async** (213 `await registerContentAnalytics`, the 4th pinned await) |
| 8 | `stages/after-assembly.ts` `composeAfterAssemblyStage(required: { …, markPluginHostReady: () => void }, optional)` calling 1-7; the closure passes `markPluginHostReady: () => { routeDepsBuiltForPluginHost = routeDeps; }` and deletes its own line 202 in the same commit (DESIGN §2.3) |

## STOP
```bash
D=apps/website/src/server/runtime/composition
test "$(grep -rn 'siteAppBootWorkByDeps.set(' $D/deps.ts $D/site-deps | wc -l)" = 1 || echo "STOP: boot-work map written more than once"
grep -rn 'routeDepsBuiltForPluginHost = routeDeps' $D/deps.ts | wc -l | grep -qx 1 || echo "STOP: the plugin-host cell write left the root"
grep -rq 'attachEnabledPluginsAtBoot' $D/site-deps || echo "STOP: runtime attach missing"
```
Gates: COMMON §5; `site-root.late-contracts.pin.test.ts` (b), (e) and `site-root.teardown.pin.test.ts` every commit; `site-share-wiring`, `site-backup-wiring`, `commerce.integration`, `form-delivery*.test.ts`, `sqlite-create-site-app-module-identity.integration.test.ts` at sheet end.
