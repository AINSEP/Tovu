# R-public-http-2 — public-http → @jini-ai/cms (Jini step J then Tovu step T)

Lane R. Batch J:22 T:23. Depends on: R-public-http-1, C-platform-html-1, C-presentation-1, C-contracts-core-2, T-post-1, T-theme-1, X-entries-1, C-platform-routing-1. Est: J 61 min, T 33 min.

## J — move verbatim into Jini (9 files, 608 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/server/inbound/public-http/http/site/render/contact-form-widget.ts` | `packages/cms/src/public-http/http/site/render/contact-form-widget.ts` | 95 | W8 |
| `apps/website/src/server/inbound/public-http/http/site/render/media-placeholder.ts` | `packages/cms/src/public-http/http/site/render/media-placeholder.ts` | 20 |  |
| `apps/website/src/server/inbound/public-http/middleware/render-theme-override.ts` | `packages/cms/src/public-http/middleware/render-theme-override.ts` | 41 | W1 |
| `apps/website/src/server/inbound/public-http/middleware/theme-asset-dirs.ts` | `packages/cms/src/public-http/middleware/theme-asset-dirs.ts` | 72 | W1 |
| `apps/website/src/server/inbound/public-http/middleware/theme-preview-static.ts` | `packages/cms/src/public-http/middleware/theme-preview-static.ts` | 43 | W2 |
| `apps/website/src/server/inbound/public-http/routes/site/pages/request-policy.ts` | `packages/cms/src/public-http/routes/site/pages/request-policy.ts` | 132 | W4 |
| `apps/website/src/server/inbound/public-http/routes/site/product-checkout.ts` | `packages/cms/src/public-http/routes/site/product-checkout.ts` | 55 |  |
| `apps/website/src/server/inbound/public-http/http/site/render/widgets/social-entries.ts` | `packages/cms/src/public-http/http/site/render/widgets/social-entries.ts` | 115 | W1 |
| `apps/website/src/server/inbound/public-http/routes/site/pages/redirect-phase.ts` | `packages/cms/src/public-http/routes/site/pages/redirect-phase.ts` | 35 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./public-http/http/site/render/contact-form-widget"]
- "@jini-ai/cms" exports["./public-http/http/site/render/media-placeholder"]
- "@jini-ai/cms" exports["./public-http/http/site/render/widgets/social-entries"]
- "@jini-ai/cms" exports["./public-http/middleware/render-theme-override"]
- "@jini-ai/cms" exports["./public-http/middleware/theme-asset-dirs"]
- "@jini-ai/cms" exports["./public-http/middleware/theme-preview-static"]
- "@jini-ai/cms" exports["./public-http/routes/site/pages/redirect-phase"]
- "@jini-ai/cms" exports["./public-http/routes/site/pages/request-policy"]
- "@jini-ai/cms" exports["./public-http/routes/site/product-checkout"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (3, 269 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/server/inbound/public-http/middleware/__tests__/unit/theme-asset-dirs.unit.test.ts`
- `apps/website/src/server/inbound/public-http/middleware/__tests__/theme-preview-static.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/product-checkout.unit.test.ts`


## T — Tovu repoint: delete the 9 sources, rewrite every importer (28 lines)

```
apps/website/src/server/inbound/public-http/http/site/render/content-html.ts:12  './contact-form-widget.js' -> '@jini-ai/cms/public-http/http/site/render/contact-form-widget'
apps/website/src/server/inbound/public-http/http/site/render/components/marketing.ts:6  '../media-placeholder.js' -> '@jini-ai/cms/public-http/http/site/render/media-placeholder'
apps/website/src/server/inbound/public-http/http/site/render/components/registry.ts:7  '../media-placeholder.js' -> '@jini-ai/cms/public-http/http/site/render/media-placeholder'
apps/website/src/server/inbound/public-http/http/site/render/doc/nodes-media.ts:5  '../media-placeholder.js' -> '@jini-ai/cms/public-http/http/site/render/media-placeholder'
apps/website/src/server/inbound/public-http/middleware/__tests__/declared-consent.unit.test.ts:5  '../render-theme-override.js' -> '@jini-ai/cms/public-http/middleware/render-theme-override'
apps/website/src/server/inbound/public-http/middleware/theme-preview-switcher.ts:9  './render-theme-override.js' -> '@jini-ai/cms/public-http/middleware/render-theme-override'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/home.ts:8  '../../../../middleware/render-theme-override.js' -> '@jini-ai/cms/public-http/middleware/render-theme-override'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/slug-routes.ts:3  '../../../../middleware/render-theme-override.js' -> '@jini-ai/cms/public-http/middleware/render-theme-override'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/virtual-page.ts:3  '../../../../middleware/render-theme-override.js' -> '@jini-ai/cms/public-http/middleware/render-theme-override'
apps/website/src/server/inbound/public-http/routes/site/products.ts:5  '../../middleware/render-theme-override.js' -> '@jini-ai/cms/public-http/middleware/render-theme-override'
apps/website/src/server/runtime/composition/commerce-http.ts:9  '#src/server/inbound/public-http/middleware/render-theme-override' -> '@jini-ai/cms/public-http/middleware/render-theme-override'
apps/website/src/server/runtime/composition/http-app/public-middleware.ts:30  '../../../inbound/public-http/middleware/render-theme-override.js' -> '@jini-ai/cms/public-http/middleware/render-theme-override'
apps/website/src/server/inbound/public-http/middleware/theme-static-assets.ts:8  './theme-asset-dirs.js' -> '@jini-ai/cms/public-http/middleware/theme-asset-dirs'
apps/website/src/server/runtime/composition/http-app/mount-public-site.ts:12  '../../../inbound/public-http/middleware/theme-preview-static.js' -> '@jini-ai/cms/public-http/middleware/theme-preview-static'
apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts:28  '../routes/site/pages/request-policy.js' -> '@jini-ai/cms/public-http/routes/site/pages/request-policy'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/home.ts:18  '../request-policy.js' -> '@jini-ai/cms/public-http/routes/site/pages/request-policy'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/post-not-found.ts:8  '../request-policy.js' -> '@jini-ai/cms/public-http/routes/site/pages/request-policy'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/slug-routes.ts:10  '../request-policy.js' -> '@jini-ai/cms/public-http/routes/site/pages/request-policy'
apps/website/src/server/inbound/public-http/routes/site/pages/listing/listing-batch.ts:6  '../request-policy.js' -> '@jini-ai/cms/public-http/routes/site/pages/request-policy'
apps/website/src/server/inbound/public-http/routes/site/pages/render-context/widgets.ts:15  '../request-policy.js' -> '@jini-ai/cms/public-http/routes/site/pages/request-policy'
apps/website/src/server/inbound/public-http/routes/site/pages/response.ts:21  './request-policy.js' -> '@jini-ai/cms/public-http/routes/site/pages/request-policy'
apps/website/src/server/inbound/public-http/routes/site/products.ts:12  './pages/request-policy.js' -> '@jini-ai/cms/public-http/routes/site/pages/request-policy'
apps/website/src/server/inbound/public-http/routes/site/products.ts:4  './product-checkout.js' -> '@jini-ai/cms/public-http/routes/site/product-checkout'
apps/website/src/server/inbound/public-http/http/site/render/content-html.ts:9  './widgets/social-entries.js' -> '@jini-ai/cms/public-http/http/site/render/widgets/social-entries'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/home.ts:24  '../redirect-phase.js' -> '@jini-ai/cms/public-http/routes/site/pages/redirect-phase'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/listing.ts:5  '../redirect-phase.js' -> '@jini-ai/cms/public-http/routes/site/pages/redirect-phase'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/post-not-found.ts:10  '../redirect-phase.js' -> '@jini-ai/cms/public-http/routes/site/pages/redirect-phase'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/slug-routes.ts:15  '../redirect-phase.js' -> '@jini-ai/cms/public-http/routes/site/pages/redirect-phase'
```

## Tovu tests that must stay green (1; import lines are repointed above, assertions untouched)
- `apps/website/src/server/inbound/public-http/middleware/__tests__/declared-consent.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/server/inbound/public-http/http/site/render/contact-form-widget.ts` (8)
- `apps/website/src/server/inbound/public-http/middleware/render-theme-override.ts` (1)
- `apps/website/src/server/inbound/public-http/middleware/theme-asset-dirs.ts` (1)
- `apps/website/src/server/inbound/public-http/middleware/theme-preview-static.ts` (2)
- `apps/website/src/server/inbound/public-http/routes/site/pages/request-policy.ts` (4)
- `apps/website/src/server/inbound/public-http/http/site/render/widgets/social-entries.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/server/inbound/public-http/middleware/theme-preview-static.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/server/inbound/public-http/http/site/render/contact-form-widget.ts:63: hooks: { field: "data-tovu-field", form: "data-tovu-form", success: "data-jini-form-success", error: "data-tovu-form-error" },
apps/website/src/server/inbound/public-http/http/site/render/contact-form-widget.ts:68: hooks: { field: "data-tovu-field", form: "data-tovu-form", success: "data-jini-form-success", error: "data-tovu-form-error" },
apps/website/src/server/inbound/public-http/http/site/render/contact-form-widget.ts:79: const fields = stampFormFieldMaxLengths({ html: renderHtmlFormBody({ fields: fieldDescriptors, hooks: { field: "data-tovu-field" } }, fieldO
apps/website/src/server/inbound/public-http/middleware/render-theme-override.ts:17: const LOCAL_KEY = "tovuRenderThemeIdOverride";
apps/website/src/server/inbound/public-http/routes/site/pages/request-policy.ts:13: const STATIC_EXPORT_REQUEST_HEADER = "x-tovu-static-export";
```

## Named mutation
in the Jini copy of `request-policy.ts`, negate the first `if (` condition of its first exported function; `theme-asset-dirs.unit.test.ts` must go red, then revert
