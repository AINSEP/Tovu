# X-consent-1 — consent → @jini-ai/cookie-consent (Jini step J then Tovu step T)

Lane X. Batch J:8 T:13. Depends on: C-contracts-core-1. Est: J 57 min, T 56 min.

## J — move verbatim into Jini (6 files, 343 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/consent/config.ts` | `packages/cookie-consent/src/site/config.ts` | 83 | W2 |
| `apps/website/src/features/consent/privacy-page-template.ts` | `packages/cookie-consent/src/site/privacy-page-template.ts` | 18 |  |
| `apps/website/src/features/consent/revisions.ts` | `packages/cookie-consent/src/site/revisions.ts` | 26 | W1 |
| `apps/website/src/features/consent/cookie-consent.ts` | `packages/cookie-consent/src/site/cookie-consent.ts` | 63 | W1 |
| `apps/website/src/features/consent/readiness.ts` | `packages/cookie-consent/src/site/readiness.ts` | 84 |  |
| `apps/website/src/features/consent/validation.ts` | `packages/cookie-consent/src/site/validation.ts` | 69 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cookie-consent" exports["./site/config"]
- "@jini-ai/cookie-consent" exports["./site/cookie-consent"]
- "@jini-ai/cookie-consent" exports["./site/privacy-page-template"]
- "@jini-ai/cookie-consent" exports["./site/readiness"]
- "@jini-ai/cookie-consent" exports["./site/revisions"]
- "@jini-ai/cookie-consent" exports["./site/validation"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (6, 375 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/consent/__tests__/unit/config.unit.test.ts`
- `apps/website/src/features/consent/__tests__/unit/cookie-consent.unit.test.ts`
- `apps/website/src/features/consent/__tests__/unit/validation.property.unit.test.ts`
- `apps/website/src/features/consent/__tests__/validation.pins.test.ts`
- `apps/website/src/features/consent/__tests__/readiness.pins.test.ts`
- `apps/website/src/features/consent/__tests__/unit/declared-readiness.unit.test.ts`


## T — Tovu repoint: delete the 6 sources, rewrite every importer (38 lines)

```
apps/website/src/features/consent/__tests__/ensure-privacy-defaults.test.ts:8  '../config.js' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/features/consent/__tests__/fixture.ts:8  '../config.js' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/features/consent/__tests__/service.test.ts:34  '../config.js' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/features/consent/__tests__/tools.test.ts:11  '../config.js' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/features/consent/__tests__/unit/public-policy.unit.test.ts:3  '../../config.js' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/features/consent/__tests__/unit/published-policy.unit.test.ts:5  '../../config.js' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/features/consent/service.ts:15  './config.js' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/features/consent/settings.ts:6  './config.js' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/features/consent/settings.ts:7  './config.js' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/platform/db/sqlite/__tests__/share-database.integration.test.ts:7  '#src/features/consent/config' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/server/__tests__/routes/publish-site-route.test.ts:20  '#src/features/consent/config' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/server/inbound/public-http/middleware/__tests__/declared-consent.unit.test.ts:11  '#src/features/consent/config' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/server/inbound/public-http/middleware/__tests__/site-consent.test.ts:14  '#src/features/consent/config' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/server/inbound/public-http/middleware/__tests__/site-cookie-consent.errors.unit.test.ts:4  '#src/features/consent/config' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/server/inbound/public-http/middleware/site-consent.ts:6  '#src/features/consent/config' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/server/inbound/public-http/routes/site/__tests__/member-pages.route.test.ts:16  '#src/features/consent/config' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/server/runtime/composition/__tests__/create-app-boot-work.test.ts:8  '#src/features/consent/config' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/server/runtime/composition/site-consent.ts:5  '#src/features/consent/config' -> '@jini-ai/cookie-consent/site/config'
apps/website/src/features/consent/ensure-privacy-defaults.ts:3  './privacy-page-template.js' -> '@jini-ai/cookie-consent/site/privacy-page-template'
apps/website/src/features/consent/__tests__/ensure-privacy-defaults.test.ts:9  '../revisions.js' -> '@jini-ai/cookie-consent/site/revisions'
apps/website/src/features/consent/__tests__/service.test.ts:7  '../revisions.js' -> '@jini-ai/cookie-consent/site/revisions'
apps/website/src/features/consent/revisions.repo.ts:4  './revisions.js' -> '@jini-ai/cookie-consent/site/revisions'
apps/website/src/features/consent/service.ts:8  './revisions.js' -> '@jini-ai/cookie-consent/site/revisions'
apps/website/src/features/consent/service.ts:9  './revisions.js' -> '@jini-ai/cookie-consent/site/revisions'
apps/website/src/server/inbound/admin-http/routes/consent/routes.ts:8  '#src/features/consent/revisions' -> '@jini-ai/cookie-consent/site/revisions'
apps/website/src/server/routes/types.ts:628  '#src/features/consent/revisions' -> '@jini-ai/cookie-consent/site/revisions'
apps/website/src/features/consent/__tests__/adapters.test.ts:6  '../cookie-consent.js' -> '@jini-ai/cookie-consent/site/cookie-consent'
apps/website/src/features/consent/service.ts:18  './cookie-consent.js' -> '@jini-ai/cookie-consent/site/cookie-consent'
apps/website/src/server/inbound/public-http/middleware/__tests__/site-cookie-consent.test.ts:14  '#src/features/consent/cookie-consent' -> '@jini-ai/cookie-consent/site/cookie-consent'
apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts:26  '#src/features/consent/cookie-consent' -> '@jini-ai/cookie-consent/site/cookie-consent'
apps/website/src/features/consent/service.ts:17  './readiness.js' -> '@jini-ai/cookie-consent/site/readiness'
apps/website/src/features/theme/__tests__/template-render.canary.test.ts:317  '#src/features/consent/readiness' -> '@jini-ai/cookie-consent/site/readiness'
apps/website/src/server/inbound/public-http/middleware/__tests__/site-consent-metadata.unit.test.ts:6  '#src/features/consent/readiness' -> '@jini-ai/cookie-consent/site/readiness'
apps/website/src/server/runtime/composition/__tests__/site-consent.ports.unit.test.ts:143  '#src/features/consent/readiness' -> '@jini-ai/cookie-consent/site/readiness'
apps/website/src/features/consent/__tests__/service.test.ts:8  '../validation.js' -> '@jini-ai/cookie-consent/site/validation'
apps/website/src/features/consent/service.ts:10  './validation.js' -> '@jini-ai/cookie-consent/site/validation'
apps/website/src/features/consent/tool-registrations.ts:9  './validation.js' -> '@jini-ai/cookie-consent/site/validation'
apps/website/src/server/inbound/public-http/middleware/site-consent.ts:5  '#src/features/consent/validation' -> '@jini-ai/cookie-consent/site/validation'
```

## Tovu tests that must stay green (18; import lines are repointed above, assertions untouched)
- `apps/website/src/features/consent/__tests__/adapters.test.ts`
- `apps/website/src/features/consent/__tests__/ensure-privacy-defaults.test.ts`
- `apps/website/src/features/consent/__tests__/fixture.ts`
- `apps/website/src/features/consent/__tests__/service.test.ts`
- `apps/website/src/features/consent/__tests__/tools.test.ts`
- `apps/website/src/features/consent/__tests__/unit/public-policy.unit.test.ts`
- `apps/website/src/features/consent/__tests__/unit/published-policy.unit.test.ts`
- `apps/website/src/features/theme/__tests__/template-render.canary.test.ts`
- `apps/website/src/platform/db/sqlite/__tests__/share-database.integration.test.ts`
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts`
- `apps/website/src/server/inbound/public-http/middleware/__tests__/declared-consent.unit.test.ts`
- `apps/website/src/server/inbound/public-http/middleware/__tests__/site-consent-metadata.unit.test.ts`
- `apps/website/src/server/inbound/public-http/middleware/__tests__/site-consent.test.ts`
- `apps/website/src/server/inbound/public-http/middleware/__tests__/site-cookie-consent.errors.unit.test.ts`
- `apps/website/src/server/inbound/public-http/middleware/__tests__/site-cookie-consent.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/member-pages.route.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/create-app-boot-work.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/site-consent.ports.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/consent/config.ts` (2)
- `apps/website/src/features/consent/revisions.ts` (1)
- `apps/website/src/features/consent/cookie-consent.ts` (1)
- `apps/website/src/features/consent/validation.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/features/consent/config.ts:42: export const SITE_CONSENT_DEFAULT_CSS = `/* Tovu's default cookie banner style. Edit it freely; "Reset to default" brings it back. */
apps/website/src/features/consent/validation.ts:66: if ('reopen' in raw && raw.reopen !== 'link') throw new ToolInputError({ message: 'Tovu cookie preferences reopen through a link.' });
```

## Named mutation
in the Jini copy of `readiness.ts`, negate the first `if (` condition of its first exported function; `readiness.pins.test.ts` must go red, then revert
