# S12 — after assembly (I1-I7) up to the last root await

Responsibility: everything after `resolveRouteDeps(routeDeps)` up to `await registerContentAnalytics(…)` (`f0613d9e` 2722-2931); that await **stays in the root, verbatim**, and so do `resolveRouteDeps(routeDeps)` and `return routeDeps`. Budget ≤190k. Commits: 8. Prerequisites: S11; COMMON §1-§3, §9 (`DS_SHEET=S12`). Every slice receives `routeDeps` as a **value** (it exists) and writes the same keys as today: 15 writes to 14 keys (`awk -F'\t' '$2=="write"' work/literal-keys.tsv`).

| commit | slice (sync) | bindings / statements | notes |
|---|---|---|---|
| 1 | `slices/widget-adoption.ts` | `widgetAdoptionReady`, the `legacyPublishCredentialsReady` write | receives `logger`; its two `consoleLogger.error` texts verbatim |
| 2 | `slices/forms.ts` | `formSubmissions` + the **5** forms writes (`formDestination`, `formSubmissionsPull`, `formSubmissionsAutoPull`, `formDeliveryStatus`, `formDelivery`) | `serving-app-boot-wiring.unit.test.ts:164` list entry `server/runtime/composition/deps.ts` → `…/site-deps/slices/forms.ts` |
| 3 | `slices/site-search.ts` | the `siteSearch` write | |
| 4 | `slices/commerce.ts` (+ `compositionCommerce`, `compositionSharedOAuth`) | `commerceBinding`, `commerce`/`commerceCatalog` writes, `onStoreClose(commerceBinding.close)` | the literal reads `compositionSharedOAuth(…)` — the closure imports it from this slice file until S13 |
| 5 | `slices/plugin-host.ts`: `attachPluginHost` (boot-work map `siteAppBootWorkByDeps.set`, `pluginHost` write) and `startPluginRuntime` (`attachEnabledPluginsAtBoot`, `pluginRuntimeReady` write, boot drain, `provideMediaCredentials(…)`) | root order: `attachPluginHost(…)`; `routeDepsBuiltForPluginHost = routeDeps;`; `startPluginRuntime(…)`. `siteAppBootWorkByDeps` arrives as `required.siteAppBootWorkByDeps` (imports rule, COMMON §5) |
| 6 | `slices/site-sharing.ts` (S4's four functions) + `slices/site-imports.ts` | `savedKeys`, the `siteShareBackend` writes (failure path + success path), `siteImportBackend` | `savedKeys` built in sharing, passed to imports |
| 7 | `slices/consent-analytics.ts` (+ `configureVisitorConsentAnalytics`) | the `siteConsent` write and the analytics configuration — **not** the `registerContentAnalytics` await | |
| 8 | `stages/after-assembly.ts` `composeAfterAssemblyStage(required: { …, markPluginHostReady: () => void }, optional = {})` (sync) calling 1-7; the root passes `markPluginHostReady: () => { routeDepsBuiltForPluginHost = routeDeps; }` and deletes its own write in the same commit (DESIGN §2.3). `startSettingsRegistration` and `siteAppBootWorkByDeps` reach it as values |

## Carries
| behaviour (base lines) | pin |
|---|---|
| host attach then cell write then runtime attach (2817-2822): `getPluginHost()` answers during `attachEnabledPluginsAtBoot` | S0 pin 3b + new `plugin-host.unit.test.ts`: the fake runtime's attach observes the host through the getter; mutation (call `markPluginHostReady` after `startPluginRuntime`) → red |
| boot drain waits on every boot promise in the same set (2823-2830) | S0 pin 5; `plugin-host.unit.test.ts` with pending fakes |
| media credentials provided last (2831) | S0 pin 3e (now: `provideMediaCredentials(` after `attachEnabledPluginsAtBoot(` inside `plugin-host.ts`) |
| module identity of the boot-work map (`site-app-boot-work.ts`) | `sqlite-create-site-app-module-identity.integration.test.ts` (wide); `expect-count` below |
| sharing failure leaves `siteShareBackend` undefined + one error line; success sets it; imports reuse `savedKeys` (2834-2929) | S4's `site-sharing.unit.test.ts`; `site-share-wiring`, `site-backup-wiring` (wide) |
| forms: the 5 writes in order (2747-2756) | `serving-app-boot-wiring` (repointed); `form-delivery*.test.ts` (wide) |
| commerce close registered at the same position (2815) | S0 pin 5; `commerce.integration` (wide) |
| consent service bound to the assembled deps; content analytics registered last and awaited by the root (2930-2932) | widened await list (S0 pin 6); `site-consent.ports.unit.test.ts` |

## STOP
```bash
set -euo pipefail
G="bash designs/deps-split/work/gates.sh"; D=apps/website/src/server/runtime/composition
$G expect-count S12-BOOT-WORK-ONCE 1 'siteAppBootWorkByDeps\.set\(' $D/deps.ts $D/site-deps
$G expect-count S12-HOST-CELL-WRITE 1 'routeDepsBuiltForPluginHost = routeDeps' $D/deps.ts
$G expect-count S12-RUNTIME-ATTACH 1 'attachEnabledPluginsAtBoot\(' $D/site-deps
$G expect-count S12-LAST-AWAIT-IN-ROOT 1 '^  await registerContentAnalytics\(' $D/deps.ts
$G forbid S12-ASYNC-SLICE '^(export )?async function|^  (const [^=]+= )?await ' $D/site-deps/slices/widget-adoption.ts $D/site-deps/slices/forms.ts $D/site-deps/slices/site-search.ts $D/site-deps/slices/commerce.ts $D/site-deps/slices/plugin-host.ts $D/site-deps/slices/site-sharing.ts $D/site-deps/slices/site-imports.ts $D/site-deps/slices/consent-analytics.ts $D/site-deps/stages/after-assembly.ts
```
Gates: COMMON §5.
