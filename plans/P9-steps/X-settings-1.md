# X-settings-1 — settings → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:8 T:10. Depends on: none (only already-Jini code). Est: J 52 min, T 65 min.

## J — move verbatim into Jini (7 files, 785 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/settings/admin-interface.ts` | `packages/cms/src/settings/site/admin-interface.ts` | 99 | W1 |
| `apps/website/src/features/settings/chart-provider.ts` | `packages/cms/src/settings/site/chart-provider.ts` | 18 |  |
| `apps/website/src/features/settings/form-delivery.ts` | `packages/cms/src/settings/site/form-delivery.ts` | 206 |  |
| `apps/website/src/features/settings/form-destination.ts` | `packages/cms/src/settings/site/form-destination.ts` | 36 |  |
| `apps/website/src/features/settings/mail-sender.ts` | `packages/cms/src/settings/site/mail-sender.ts` | 54 |  |
| `apps/website/src/features/settings/site-timezone.ts` | `packages/cms/src/settings/site/site-timezone.ts` | 94 |  |
| `apps/website/src/features/settings/site-title.ts` | `packages/cms/src/settings/site/site-title.ts` | 278 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./settings/site/admin-interface"]
- "@jini-ai/cms" exports["./settings/site/chart-provider"]
- "@jini-ai/cms" exports["./settings/site/form-delivery"]
- "@jini-ai/cms" exports["./settings/site/form-destination"]
- "@jini-ai/cms" exports["./settings/site/mail-sender"]
- "@jini-ai/cms" exports["./settings/site/site-timezone"]
- "@jini-ai/cms" exports["./settings/site/site-title"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 51 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/settings/__tests__/site-timezone-local-fallback.unit.test.ts`


## T — Tovu repoint: delete the 7 sources, rewrite every importer (52 lines)

```
apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts:22  '../../features/settings/admin-interface.js' -> '@jini-ai/cms/settings/site/admin-interface'
apps/website/src/assistant/runtime-preferences.ts:4  '../features/settings/admin-interface.js' -> '@jini-ai/cms/settings/site/admin-interface'
apps/website/src/features/settings/__tests__/admin-interface.unit.test.ts:20  '../admin-interface.js' -> '@jini-ai/cms/settings/site/admin-interface'
apps/website/src/features/settings/index.ts:159  './admin-interface.js' -> '@jini-ai/cms/settings/site/admin-interface'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/settings/tool-registrations.ts:42  './admin-interface.js' -> '@jini-ai/cms/settings/site/admin-interface'
apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.browser-lease.integration.test.ts:13  '#src/features/settings/admin-interface' -> '@jini-ai/cms/settings/site/admin-interface'
apps/website/src/server/runtime/composition/__tests__/agent-plugin-preferences.unit.test.ts:4  '#src/features/settings/admin-interface' -> '@jini-ai/cms/settings/site/admin-interface'
apps/website/src/server/runtime/composition/agent-plugin-service-ports.ts:15  '#src/features/settings/admin-interface' -> '@jini-ai/cms/settings/site/admin-interface'
apps/website/src/server/runtime/composition/memory-deps/slices/site-title-settings.ts:3  '#src/features/settings/admin-interface' -> '@jini-ai/cms/settings/site/admin-interface'
apps/website/src/server/runtime/composition/site-deps/identity-settings.ts:22  '#src/features/settings/admin-interface' -> '@jini-ai/cms/settings/site/admin-interface'
apps/website/src/server/runtime/composition/__tests__/chart-providers.unit.test.ts:5  '#src/features/settings/chart-provider' -> '@jini-ai/cms/settings/site/chart-provider'
apps/website/src/server/runtime/composition/memory-deps/slices/site-title-settings.ts:5  '#src/features/settings/chart-provider' -> '@jini-ai/cms/settings/site/chart-provider'
apps/website/src/server/runtime/composition/site-deps/identity-settings.ts:23  '#src/features/settings/chart-provider' -> '@jini-ai/cms/settings/site/chart-provider'
apps/website/src/features/settings/__tests__/form-delivery.security.test.ts:8  '../form-delivery.js' -> '@jini-ai/cms/settings/site/form-delivery'
apps/website/src/features/settings/__tests__/form-delivery.unit.test.ts:9  '../form-delivery.js' -> '@jini-ai/cms/settings/site/form-delivery'
apps/website/src/features/settings/form-delivery-write.ts:5  './form-delivery.js' -> '@jini-ai/cms/settings/site/form-delivery'
apps/website/src/features/settings/index.ts:152  './form-delivery.js' -> '@jini-ai/cms/settings/site/form-delivery'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/settings/site-title-write.ts:7  './form-delivery.js' -> '@jini-ai/cms/settings/site/form-delivery'
apps/website/src/features/settings/__tests__/form-destination.unit.test.ts:11  '../form-destination.js' -> '@jini-ai/cms/settings/site/form-destination'
apps/website/src/server/runtime/composition/form-submissions.ts:10  '#src/features/settings/form-destination' -> '@jini-ai/cms/settings/site/form-destination'
apps/website/src/server/runtime/composition/memory-deps/slices/site-title-settings.ts:6  '#src/features/settings/form-destination' -> '@jini-ai/cms/settings/site/form-destination'
apps/website/src/server/runtime/composition/site-deps/identity-settings.ts:26  '#src/features/settings/form-destination' -> '@jini-ai/cms/settings/site/form-destination'
apps/website/src/features/settings/__tests__/mail-sender.unit.test.ts:8  '../mail-sender.js' -> '@jini-ai/cms/settings/site/mail-sender'
apps/website/src/features/settings/index.ts:153  './mail-sender.js' -> '@jini-ai/cms/settings/site/mail-sender'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/settings/__tests__/site-timezone.test.ts:15  '../site-timezone.js' -> '@jini-ai/cms/settings/site/site-timezone'
apps/website/src/server/runtime/composition/app.ts:81  '#src/features/settings/site-timezone' -> '@jini-ai/cms/settings/site/site-timezone'
apps/website/src/server/runtime/composition/memory-deps/route-deps/context.ts:22  '#src/features/settings/site-timezone' -> '@jini-ai/cms/settings/site/site-timezone'
apps/website/src/server/runtime/composition/memory-deps/slices/site-title-settings.ts:8  '#src/features/settings/site-timezone' -> '@jini-ai/cms/settings/site/site-timezone'
apps/website/src/server/runtime/composition/site-deps/identity-settings.ts:11  '#src/features/settings/site-timezone' -> '@jini-ai/cms/settings/site/site-timezone'
apps/website/src/server/runtime/composition/site-deps/identity-settings.ts:32  '#src/features/settings/site-timezone' -> '@jini-ai/cms/settings/site/site-timezone'
apps/website/src/server/runtime/composition/site-deps/site-sharing.ts:24  '#src/features/settings/site-timezone' -> '@jini-ai/cms/settings/site/site-timezone'
apps/website/src/features/seo/__tests__/index.unit.test.ts:10  '../../settings/site-title.js' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/features/settings/__tests__/site-title-preservation-store.contract.test.ts:6  '../site-title.js' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/features/settings/__tests__/site-title-write.test.ts:10  '../site-title.js' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/features/settings/__tests__/site-title.test.ts:26  '../site-title.js' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/features/settings/index.ts:97  './site-title.js' -> '@jini-ai/cms/settings/site/site-title'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/settings/index.ts:157  './site-title.js' -> '@jini-ai/cms/settings/site/site-title'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/settings/site-title-preservation.ts:2  './site-title.js' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/features/settings/site-title-write.ts:8  './site-title.js' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/platform/db/sqlite/__tests__/reset-legacy-site-title-pin.test.ts:6  '#src/features/settings/site-title' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/site-title-preservation.integration.test.ts:22  '#src/features/settings/site-title' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/server/inbound/public-http/routes/site/pages/render-context/site-title.ts:3  '#src/features/settings/site-title' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/server/routes/types.ts:43  '../../features/settings/site-title.js' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/server/runtime/composition/__tests__/app.title-rejection.unit.test.ts:4  '#src/features/settings/site-title' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/server/runtime/composition/__tests__/create-app-boot-work.test.ts:9  '#src/features/settings/site-title' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/server/runtime/composition/__tests__/site-consent.ports.unit.test.ts:74  '#src/features/settings/site-title' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/server/runtime/composition/__tests__/site-consent.ports.unit.test.ts:75  '#src/features/settings/site-title' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/server/runtime/composition/memory-deps/slices/site-title-settings.ts:2  '#src/features/settings/site-title' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/server/runtime/composition/site-consent.ts:6  '#src/features/settings/site-title' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/server/runtime/composition/site-deps/identity-settings.ts:6  '#src/features/settings/site-title' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/server/runtime/composition/site-deps/identity-settings.ts:33  '#src/features/settings/site-title' -> '@jini-ai/cms/settings/site/site-title'
apps/website/src/server/runtime/composition/site-deps/identity-settings.ts:34  '#src/features/settings/site-title' -> '@jini-ai/cms/settings/site/site-title'
```

## Tovu tests that must stay green (19; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts`
- `apps/website/src/features/seo/__tests__/index.unit.test.ts`
- `apps/website/src/features/settings/__tests__/admin-interface.unit.test.ts`
- `apps/website/src/features/settings/__tests__/form-delivery.security.test.ts`
- `apps/website/src/features/settings/__tests__/form-delivery.unit.test.ts`
- `apps/website/src/features/settings/__tests__/form-destination.unit.test.ts`
- `apps/website/src/features/settings/__tests__/mail-sender.unit.test.ts`
- `apps/website/src/features/settings/__tests__/site-timezone.test.ts`
- `apps/website/src/features/settings/__tests__/site-title-preservation-store.contract.test.ts`
- `apps/website/src/features/settings/__tests__/site-title-write.test.ts`
- `apps/website/src/features/settings/__tests__/site-title.test.ts`
- `apps/website/src/platform/db/sqlite/__tests__/reset-legacy-site-title-pin.test.ts`
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.browser-lease.integration.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/site-title-preservation.integration.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/agent-plugin-preferences.unit.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/app.title-rejection.unit.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/chart-providers.unit.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/create-app-boot-work.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/site-consent.ports.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/settings/admin-interface.ts` (1)
- `apps/website/src/features/settings/site-title.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/features/settings/site-title.ts:45: export const LEGACY_SITE_TITLE = "Tovu Demo Site";
```

## Named mutation
in the Jini copy of `site-title.ts`, negate the first `if (` condition of its first exported function; `site-timezone-local-fallback.unit.test.ts` must go red, then revert
