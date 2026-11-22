# R-public-http-1 — public-http → @jini-ai/cms (Jini step J then Tovu step T)

Lane R. Batch J:21 T:22. Depends on: none (only already-Jini code). Est: J 87 min, T 57 min.

## J — move verbatim into Jini (14 files, 1202 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/server/inbound/public-http/http/site/form-label-inspection.ts` | `packages/cms/src/public-http/http/site/form-label-inspection.ts` | 74 |  |
| `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts` | `packages/cms/src/public-http/http/site/form-presentation-assets.ts` | 183 | W39 |
| `apps/website/src/server/inbound/public-http/http/site/form-validation-i18n.ts` | `packages/cms/src/public-http/http/site/form-validation-i18n.ts` | 42 |  |
| `apps/website/src/server/inbound/public-http/http/site/form-wire-policy.ts` | `packages/cms/src/public-http/http/site/form-wire-policy.ts` | 18 | W1 |
| `apps/website/src/server/inbound/public-http/http/site/member-auth-script.ts` | `packages/cms/src/public-http/http/site/member-auth-script.ts` | 446 | W2 |
| `apps/website/src/server/inbound/public-http/http/site/render/media-playback-copy.ts` | `packages/cms/src/public-http/http/site/render/media-playback-copy.ts` | 5 |  |
| `apps/website/src/server/inbound/public-http/http/site/render/value-readers.ts` | `packages/cms/src/public-http/http/site/render/value-readers.ts` | 40 |  |
| `apps/website/src/server/inbound/public-http/http/site/render/widgets/placeholder.ts` | `packages/cms/src/public-http/http/site/render/widgets/placeholder.ts` | 28 |  |
| `apps/website/src/server/inbound/public-http/middleware/canonical-site-host.ts` | `packages/cms/src/public-http/middleware/canonical-site-host.ts` | 47 |  |
| `apps/website/src/server/inbound/public-http/middleware/site-chat-static.ts` | `packages/cms/src/public-http/middleware/site-chat-static.ts` | 46 | W2 |
| `apps/website/src/server/inbound/public-http/middleware/theme-content-security-headers.ts` | `packages/cms/src/public-http/middleware/theme-content-security-headers.ts` | 126 |  |
| `apps/website/src/server/inbound/public-http/routes/site/chat-comparison-html.ts` | `packages/cms/src/public-http/routes/site/chat-comparison-html.ts` | 99 | W5 |
| `apps/website/src/server/inbound/public-http/routes/site/pages/listing/listing-state.ts` | `packages/cms/src/public-http/routes/site/pages/listing/listing-state.ts` | 4 |  |
| `apps/website/src/server/inbound/public-http/http/site/form-feedback-policy.ts` | `packages/cms/src/public-http/http/site/form-feedback-policy.ts` | 44 | W2 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./public-http/http/site/form-feedback-policy"]
- "@jini-ai/cms" exports["./public-http/http/site/form-presentation-assets"]
- "@jini-ai/cms" exports["./public-http/http/site/form-wire-policy"]
- "@jini-ai/cms" exports["./public-http/http/site/member-auth-script"]
- "@jini-ai/cms" exports["./public-http/http/site/render/media-playback-copy"]
- "@jini-ai/cms" exports["./public-http/http/site/render/value-readers"]
- "@jini-ai/cms" exports["./public-http/http/site/render/widgets/placeholder"]
- "@jini-ai/cms" exports["./public-http/middleware/canonical-site-host"]
- "@jini-ai/cms" exports["./public-http/middleware/site-chat-static"]
- "@jini-ai/cms" exports["./public-http/middleware/theme-content-security-headers"]
- "@jini-ai/cms" exports["./public-http/routes/site/chat-comparison-html"]
- "@jini-ai/cms" exports["./public-http/routes/site/pages/listing/listing-state"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (7, 709 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/server/inbound/public-http/http/site/__tests__/form-render.unit.test.ts`
- `apps/website/src/server/inbound/public-http/http/site/__tests__/form-theme-colours.test.ts`
- `apps/website/src/server/inbound/public-http/http/site/__tests__/form-validation-friendly.test.ts`
- `apps/website/src/server/inbound/public-http/http/site/__tests__/form-validation-i18n.unit.test.ts`
- `apps/website/src/server/inbound/public-http/middleware/__tests__/canonical-site-host.test.ts`
- `apps/website/src/server/inbound/public-http/middleware/__tests__/site-chat-static.test.ts`
- `apps/website/src/server/inbound/public-http/http/site/__tests__/form-validation-message.unit.test.ts`


## T — Tovu repoint: delete the 14 sources, rewrite every importer (49 lines)

```
apps/website/src/features/widgets/__tests__/integration/html-form-embeds.integration.test.ts:8  '#src/server/inbound/public-http/http/site/form-presentation-assets' -> '@jini-ai/cms/public-http/http/site/form-presentation-assets'
apps/website/src/server/inbound/public-http/http/site/__tests__/form-field-types-style.unit.test.ts:6  '../form-presentation-assets.js' -> '@jini-ai/cms/public-http/http/site/form-presentation-assets'
apps/website/src/server/inbound/public-http/http/site/render/contact-form-widget.ts:2  '../form-presentation-assets.js' -> '@jini-ai/cms/public-http/http/site/form-presentation-assets'
apps/website/src/server/__tests__/routes/forms-submit.test.ts:23  '../../inbound/public-http/http/site/form-wire-policy.js' -> '@jini-ai/cms/public-http/http/site/form-wire-policy'
apps/website/src/server/__tests__/routes/request-cost-cacheability.measurement.test.ts:9  '../../inbound/public-http/http/site/form-wire-policy.js' -> '@jini-ai/cms/public-http/http/site/form-wire-policy'
apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts:4  '../form-wire-policy.js' -> '@jini-ai/cms/public-http/http/site/form-wire-policy'
apps/website/src/server/inbound/public-http/routes/site/forms-submit.ts:15  '../../http/site/form-wire-policy.js' -> '@jini-ai/cms/public-http/http/site/form-wire-policy'
apps/website/src/server/inbound/public-http/routes/site/pages/response.ts:11  '../../../http/site/form-wire-policy.js' -> '@jini-ai/cms/public-http/http/site/form-wire-policy'
apps/website/src/server/inbound/public-http/http/site/__tests__/member-auth-script.unit.test.ts:5  '../member-auth-script.js' -> '@jini-ai/cms/public-http/http/site/member-auth-script'
apps/website/src/server/inbound/public-http/routes/site/pages/response.ts:16  '../../../http/site/member-auth-script.js' -> '@jini-ai/cms/public-http/http/site/member-auth-script'
apps/website/src/server/inbound/public-http/http/site/render/doc/nodes-media.ts:13  '../media-playback-copy.js' -> '@jini-ai/cms/public-http/http/site/render/media-playback-copy'
apps/website/src/server/inbound/public-http/http/site/render/widgets/media.ts:9  '../media-playback-copy.js' -> '@jini-ai/cms/public-http/http/site/render/media-playback-copy'
apps/website/src/server/inbound/public-http/http/site/render/blocks.ts:8  './value-readers.js' -> '@jini-ai/cms/public-http/http/site/render/value-readers'
apps/website/src/server/inbound/public-http/http/site/render/components/layout.ts:4  '../value-readers.js' -> '@jini-ai/cms/public-http/http/site/render/value-readers'
apps/website/src/server/inbound/public-http/http/site/render/components/marketing.ts:2  '../value-readers.js' -> '@jini-ai/cms/public-http/http/site/render/value-readers'
apps/website/src/server/inbound/public-http/http/site/render/contact-form-widget.ts:5  './value-readers.js' -> '@jini-ai/cms/public-http/http/site/render/value-readers'
apps/website/src/server/inbound/public-http/http/site/render/content-html.ts:8  './value-readers.js' -> '@jini-ai/cms/public-http/http/site/render/value-readers'
apps/website/src/server/inbound/public-http/http/site/render/doc/doc-nodes.ts:7  '../value-readers.js' -> '@jini-ai/cms/public-http/http/site/render/value-readers'
apps/website/src/server/inbound/public-http/http/site/render/doc/nodes-media.ts:2  '../value-readers.js' -> '@jini-ai/cms/public-http/http/site/render/value-readers'
apps/website/src/server/inbound/public-http/http/site/render/media-placeholder.ts:3  './value-readers.js' -> '@jini-ai/cms/public-http/http/site/render/value-readers'
apps/website/src/server/inbound/public-http/http/site/render/widgets/media.ts:4  '../value-readers.js' -> '@jini-ai/cms/public-http/http/site/render/value-readers'
apps/website/src/server/inbound/public-http/http/site/render/widgets/post-content.ts:3  '../value-readers.js' -> '@jini-ai/cms/public-http/http/site/render/value-readers'
apps/website/src/server/inbound/public-http/http/site/render/widgets/social-entries.ts:2  '../value-readers.js' -> '@jini-ai/cms/public-http/http/site/render/value-readers'
apps/website/src/server/inbound/public-http/http/site/__tests__/render-doc-widget-port.unit.test.ts:5  '../render/widgets/placeholder.js' -> '@jini-ai/cms/public-http/http/site/render/widgets/placeholder'
apps/website/src/server/inbound/public-http/http/site/render/contact-form-widget.ts:6  './widgets/placeholder.js' -> '@jini-ai/cms/public-http/http/site/render/widgets/placeholder'
apps/website/src/server/inbound/public-http/http/site/render/content-html.ts:15  './widgets/placeholder.js' -> '@jini-ai/cms/public-http/http/site/render/widgets/placeholder'
apps/website/src/server/inbound/public-http/http/site/render/doc/doc-nodes.ts:13  '../widgets/placeholder.js' -> '@jini-ai/cms/public-http/http/site/render/widgets/placeholder'
apps/website/src/server/inbound/public-http/http/site/render/widgets/media.ts:6  './placeholder.js' -> '@jini-ai/cms/public-http/http/site/render/widgets/placeholder'
apps/website/src/server/inbound/public-http/http/site/render/widgets/post-content.ts:8  './placeholder.js' -> '@jini-ai/cms/public-http/http/site/render/widgets/placeholder'
apps/website/src/server/runtime/composition/http-app/public-middleware.ts:26  '../../../inbound/public-http/middleware/canonical-site-host.js' -> '@jini-ai/cms/public-http/middleware/canonical-site-host'
apps/website/src/server/runtime/composition/http-app/public-middleware.ts:29  '../../../inbound/public-http/middleware/site-chat-static.js' -> '@jini-ai/cms/public-http/middleware/site-chat-static'
apps/website/src/server/inbound/public-http/middleware/theme-preview-static.ts:6  './theme-content-security-headers.js' -> '@jini-ai/cms/public-http/middleware/theme-content-security-headers'
apps/website/src/server/inbound/public-http/middleware/theme-static-assets.ts:9  './theme-content-security-headers.js' -> '@jini-ai/cms/public-http/middleware/theme-content-security-headers'
apps/website/src/server/inbound/public-http/routes/site/chat-comparison.ts:5  './chat-comparison-html.js' -> '@jini-ai/cms/public-http/routes/site/chat-comparison-html'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/listing.ts:4  '../listing/listing-state.js' -> '@jini-ai/cms/public-http/routes/site/pages/listing/listing-state'
apps/website/src/server/inbound/public-http/routes/site/pages/listing/listing-batch.ts:5  './listing-state.js' -> '@jini-ai/cms/public-http/routes/site/pages/listing/listing-state'
apps/website/src/server/inbound/public-http/routes/site/pages/render-context/post-previews.ts:16  '../listing/listing-state.js' -> '@jini-ai/cms/public-http/routes/site/pages/listing/listing-state'
apps/website/src/server/inbound/public-http/routes/site/pages/request-policy.ts:2  './listing/listing-state.js' -> '@jini-ai/cms/public-http/routes/site/pages/listing/listing-state'
apps/website/src/server/inbound/public-http/routes/site/pages/response.ts:20  './listing/listing-state.js' -> '@jini-ai/cms/public-http/routes/site/pages/listing/listing-state'
apps/website/src/features/forms/__tests__/common-fields.test.ts:12  '../../../server/inbound/public-http/http/site/form-feedback-policy.js' -> '@jini-ai/cms/public-http/http/site/form-feedback-policy'
apps/website/src/features/forms/__tests__/submission-email-validation.test.ts:4  '#src/server/inbound/public-http/http/site/form-feedback-policy' -> '@jini-ai/cms/public-http/http/site/form-feedback-policy'
apps/website/src/features/widgets/__tests__/integration/html-form-embeds.integration.test.ts:10  '#src/server/inbound/public-http/http/site/form-feedback-policy' -> '@jini-ai/cms/public-http/http/site/form-feedback-policy'
apps/website/src/server/inbound/public-http/http/site/__tests__/form-attempt-token.unit.test.ts:7  '../form-feedback-policy.js' -> '@jini-ai/cms/public-http/http/site/form-feedback-policy'
apps/website/src/server/inbound/public-http/http/site/__tests__/form-field-max-length.unit.test.ts:6  '../form-feedback-policy.js' -> '@jini-ai/cms/public-http/http/site/form-feedback-policy'
apps/website/src/server/inbound/public-http/http/site/__tests__/form-field-max-length.unit.test.ts:8  '../form-feedback-policy.js' -> '@jini-ai/cms/public-http/http/site/form-feedback-policy'
apps/website/src/server/inbound/public-http/http/site/__tests__/leading-style-regression.test.ts:20  '../form-feedback-policy.js' -> '@jini-ai/cms/public-http/http/site/form-feedback-policy'
apps/website/src/server/inbound/public-http/http/site/__tests__/render-form-layout.test.ts:6  '../form-feedback-policy.js' -> '@jini-ai/cms/public-http/http/site/form-feedback-policy'
apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts:15  '../form-feedback-policy.js' -> '@jini-ai/cms/public-http/http/site/form-feedback-policy'
apps/website/src/server/inbound/public-http/routes/site/pages/response.ts:9  '../../../http/site/form-feedback-policy.js' -> '@jini-ai/cms/public-http/http/site/form-feedback-policy'
```

## Tovu tests that must stay green (13; import lines are repointed above, assertions untouched)
- `apps/website/src/features/forms/__tests__/common-fields.test.ts`
- `apps/website/src/features/forms/__tests__/submission-email-validation.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/html-form-embeds.integration.test.ts`
- `apps/website/src/server/__tests__/routes/forms-submit.test.ts`
- `apps/website/src/server/__tests__/routes/request-cost-cacheability.measurement.test.ts`
- `apps/website/src/server/inbound/public-http/http/site/__tests__/form-attempt-token.unit.test.ts`
- `apps/website/src/server/inbound/public-http/http/site/__tests__/form-field-max-length.unit.test.ts`
- `apps/website/src/server/inbound/public-http/http/site/__tests__/form-field-types-style.unit.test.ts`
- `apps/website/src/server/inbound/public-http/http/site/__tests__/leading-style-regression.test.ts`
- `apps/website/src/server/inbound/public-http/http/site/__tests__/member-auth-script.unit.test.ts`
- `apps/website/src/server/inbound/public-http/http/site/__tests__/render-doc-widget-port.unit.test.ts`
- `apps/website/src/server/inbound/public-http/http/site/__tests__/render-form-layout.test.ts`
- `apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts` (39)
- `apps/website/src/server/inbound/public-http/http/site/form-wire-policy.ts` (1)
- `apps/website/src/server/inbound/public-http/http/site/member-auth-script.ts` (2)
- `apps/website/src/server/inbound/public-http/middleware/site-chat-static.ts` (2)
- `apps/website/src/server/inbound/public-http/routes/site/chat-comparison-html.ts` (5)
- `apps/website/src/server/inbound/public-http/http/site/form-feedback-policy.ts` (2)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/server/inbound/public-http/http/site/render/value-readers.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/website/src/server/inbound/public-http/middleware/site-chat-static.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/website/src/server/inbound/public-http/middleware/theme-content-security-headers.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:1: const FORM_CLASS = "tovu-form";
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:3: const FORM_ERROR_CLASS = "tovu-form-error";
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:79: ":root{--tovu-form-danger-fallback:#f87171;--tovu-form-success-fallback:#4ade80;}" +
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:80: ":root[data-theme=\"light\"]{--tovu-form-danger-fallback:#b91c1c;--tovu-form-success-fallback:#166534;}" +
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:110: ":where(.tovu-form-range-value){font-size:0.85rem;color:var(--muted,#6b7280);font-variant-numeric:tabular-nums;}" +
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:121: ":where(.widget-form-field-error){color:var(--danger,var(--tovu-form-danger-fallback));font-size:0.85rem;font-weight:700;}" +
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:131: ":where([data-tovu-form] label:not([hidden])){display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:0.9rem;}" +
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:132: ":where([data-tovu-form] label:has(> input[type=checkbox],> input[type=radio])){flex-direction:row;align-items:center;gap:8px;font-weight:40
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:133: ":where([data-tovu-form] :is(input:not([type=checkbox],[type=radio],[type=hidden],[type=submit],[type=button],[type=reset],[type=range],[typ
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:135: ":where([data-tovu-form] textarea){min-height:100px;resize:vertical;}" +
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:136: ":where([data-tovu-form] :is(input[type=checkbox],input[type=radio],input[type=range])){accent-color:var(--accent,#2563eb);}" +
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:137: ":where([data-tovu-form] input[type=range]){width:100%;margin:0;}" +
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:154: ":where([data-tovu-form] button:not([type=button],[type=reset])){align-self:flex-start;padding:8px 16px;" +
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:159: "border-left:4px solid var(--success,var(--tovu-form-success-fallback));color:var(--success,var(--tovu-form-success-fallback));}" +
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:160: `:where(.${FORM_ERROR_CLASS},[data-tovu-form-error]){padding:10px 12px;border-radius:6px;` +
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:162: "border-left:4px solid var(--danger,var(--tovu-form-danger-fallback));color:var(--danger,var(--tovu-form-danger-fallback));font-size:0.9rem;
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:175: "(function(d){d.querySelectorAll('.tovu-form input[type=range]:not([data-tovu-range]),[data-tovu-form] input[type=range]:not([data-tovu-rang
apps/website/src/server/inbound/public-http/http/site/form-presentation-assets.ts:176: "r.setAttribute('data-tovu-range','');var o=d.createElement('output');o.className='tovu-form-range-value';o.setAttribute('aria-hidden','true
apps/website/src/server/inbound/public-http/http/site/form-wire-policy.ts:16: export const FORM_FLASH_COOKIE_NAME = "tovu_form_flash";
apps/website/src/server/inbound/public-http/http/site/member-auth-script.ts:430: const MEMBER_SCRIPT_MARKER = "data-tovu-member-auth";
apps/website/src/server/inbound/public-http/middleware/site-chat-static.ts:29: const devProxyUrl = process.env.TOVU_SITE_CHAT_DEV_PROXY_URL;
apps/website/src/server/inbound/public-http/routes/site/chat-comparison-html.ts:9: <div id="tovu-site-assistant-root" data-chat-open="true" data-chat-compare="${variant}"></div>
apps/website/src/server/inbound/public-http/routes/site/chat-comparison-html.ts:53: const ready = () => frames.every(frame => frame.contentDocument?.getElementById('tovu-site-assistant-root')?.dataset.compareReady === 'true'
apps/website/src/server/inbound/public-http/routes/site/chat-comparison-html.ts:56: if (event.origin === location.origin && frames.some(frame => frame.contentWindow === event.source) && event.data?.type === 'tovu-site-chat-r
apps/website/src/server/inbound/public-http/routes/site/chat-comparison-html.ts:62: const root = frame.contentDocument.getElementById('tovu-site-assistant-root');
apps/website/src/server/inbound/public-http/routes/site/chat-comparison-html.ts:72: root.dispatchEvent(new frame.contentWindow.CustomEvent('tovu-compare-send', { detail: { text, done: error => {
apps/website/src/server/inbound/public-http/http/site/form-feedback-policy.ts:11: hooks: { form: "data-tovu-form", success: "data-jini-form-success", error: "data-tovu-form-error" },
```

## i18n
- `apps/website/src/server/inbound/public-http/http/site/form-feedback-policy.ts` imports locale/i18n; move the keys it reads into the Jini package's locale file in the same step (same keys, same text), delete them from Tovu in step T

## Named mutation
in the Jini copy of `member-auth-script.ts`, negate the first `if (` condition of its first exported function; `form-render.unit.test.ts` must go red, then revert
