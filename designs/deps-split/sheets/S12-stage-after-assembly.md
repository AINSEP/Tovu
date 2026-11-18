# S12 — after assembly (I1-I7) up to the last root await

Responsibility: everything after `resolveRouteDeps(routeDeps)` up to `await registerContentAnalytics(…)` (`b5fbf2a5` 2722-2931); that await **stays in the root, verbatim**, and so do `resolveRouteDeps(routeDeps)` and `return routeDeps`. Budget ≤170k. Commits: 7. Prerequisites: S11; COMMON §1-§4, §9 (`DS_SHEET=S12`). Every slice receives `routeDeps` as a **value** (it exists) and writes the same keys as today: 15 writes to 14 keys (`awk -F'\t' '$2=="write"' work/literal-keys.tsv`).

| commit | slice (sync) | bindings / statements | notes |
|---|---|---|---|
| 1 | `slices/widget-adoption.ts` | `widgetAdoptionReady`, the `legacyPublishCredentialsReady` write | receives `logger`; keeps **one `logger.info`** (2726, the moved-widget notice) and **one `logger.error`** (2730, the failure) — levels and texts verbatim |
| 2 | `slices/forms.ts` | `formSubmissions` + the **5** forms writes (`formDestination`, `formSubmissionsPull`, `formSubmissionsAutoPull`, `formDeliveryStatus`, `formDelivery`) | `serving-app-boot-wiring.unit.test.ts:164` list entry `server/runtime/composition/deps.ts` → `…/site-deps/slices/forms.ts` |
| 3 | `slices/site-search.ts` | the `siteSearch` write | |
| 4 | `slices/commerce.ts` (+ `compositionCommerce`, `compositionSharedOAuth`) | `commerceBinding`, `commerce`/`commerceCatalog` writes, `onStoreClose(commerceBinding.close)` | the literal reads `compositionSharedOAuth(…)` — the closure imports it from this slice file until S13 |
| 5 | `slices/plugin-host.ts`: `attachPluginHost` (boot-work map `siteAppBootWorkByDeps.set`, `pluginHost` write) and `startPluginRuntime` (`attachEnabledPluginsAtBoot`, `pluginRuntimeReady` write, boot drain, `provideMediaCredentials(…)`) | root order: `attachPluginHost(…)`; `routeDepsBuiltForPluginHost = routeDeps;`; `startPluginRuntime(…)`. `siteAppBootWorkByDeps` arrives as `required.siteAppBootWorkByDeps` (imports rule, COMMON §5) |
| 6 | `slices/site-sharing.ts` (S4's four functions) + `slices/site-imports.ts` | `savedKeys`, the `siteShareBackend` writes (failure path + success path), `siteImportBackend` | `savedKeys` built in sharing, passed to imports |
| 7 | `slices/consent-analytics.ts` (+ `configureVisitorConsentAnalytics`) | the `siteConsent` write and the analytics configuration — **not** the `registerContentAnalytics` await | |
| — | no stage file (COMMON §7). Root order after commit 5: `attachPluginHost(…)`; `routeDepsBuiltForPluginHost = routeDeps;` (the root's own write, unchanged); `startPluginRuntime(…)`. If S13 later groups these calls into a stage, the write travels as the `markPluginHostReady` callback of DESIGN §2.3 |

## Carries
| behaviour (base lines) | pin |
|---|---|
| host attach then cell write then runtime attach (2817-2822): `getPluginHost()` answers during `attachEnabledPluginsAtBoot` | S0 pin 3b + new `plugin-host.unit.test.ts`: the fake runtime's attach observes the host through the getter; mutation (move the root's `routeDepsBuiltForPluginHost = routeDeps;` below `startPluginRuntime(`) → red |
| boot drain waits on every boot promise in the same set (2823-2830) | S0 pin 5; `plugin-host.unit.test.ts` with pending fakes |
| media credentials provided last (2831) | S0 pin 3e (now: `provideMediaCredentials(` after `attachEnabledPluginsAtBoot(` inside `plugin-host.ts`) |
| module identity of the boot-work map (`site-app-boot-work.ts`) | `sqlite-create-site-app-module-identity.integration.test.ts`; STOP block |
| sharing failure leaves `siteShareBackend` undefined + one error line; success sets it; imports reuse `savedKeys` (2834-2929) | S4's `site-sharing.unit.test.ts`; `site-share-wiring.integration.test.ts`, `site-backup-wiring.integration.test.ts` |
| forms: the 5 writes in order (2747-2756) | `serving-app-boot-wiring` (repointed); `apps/website/src/features/settings/__tests__/form-delivery-write.unit.test.ts` |
| commerce close registered at the same position (2815) | S0 pin 5; `commerce.integration.test.ts` |
| consent service bound to the assembled deps; content analytics registered last and awaited by the root (2930-2932) | widened await list (S0 pin 6); `site-consent.ports.unit.test.ts` |

```bash
SHEET_TESTS=(
  apps/website/src/server/runtime/composition/__tests__/sqlite-create-site-app-module-identity.integration.test.ts
  apps/website/src/server/runtime/composition/__tests__/site-share-wiring.integration.test.ts
  apps/website/src/server/runtime/composition/__tests__/site-backup-wiring.integration.test.ts
  apps/website/src/server/runtime/composition/__tests__/commerce.integration.test.ts
  apps/website/src/server/runtime/composition/__tests__/site-consent.ports.unit.test.ts
  apps/website/src/features/settings/__tests__/form-delivery-write.unit.test.ts
)   # plus SR_TESTS and CHANGED_TESTS (COMMON §5)
```

## STOP (before the report commit; COMMON §9 rule 8 form)
```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
grep -rnE 'siteAppBootWorkByDeps\.set\(' "$D/deps.ts" "$D/site-deps" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-S12-BOOT-WORK-ONCE"; exit 1; }
grep -rnE 'routeDepsBuiltForPluginHost = routeDeps' "$D/deps.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-S12-HOST-CELL-WRITE"; exit 1; }
grep -rnE 'attachEnabledPluginsAtBoot\(' "$D/site-deps" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-S12-RUNTIME-ATTACH"; exit 1; }
grep -rnE '^  await registerContentAnalytics\(' "$D/deps.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-S12-LAST-AWAIT-IN-ROOT"; exit 1; }
grep -rnE '^(export )?async function|^  (const [^=]+= )?await ' "$D/site-deps/slices/widget-adoption.ts" "$D/site-deps/slices/forms.ts" "$D/site-deps/slices/site-search.ts" "$D/site-deps/slices/commerce.ts" "$D/site-deps/slices/plugin-host.ts" "$D/site-deps/slices/site-sharing.ts" "$D/site-deps/slices/site-imports.ts" "$D/site-deps/slices/consent-analytics.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S12-ASYNC-SLICE"; exit 1; }
```
Gates: COMMON §5.
