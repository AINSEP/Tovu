# C-platform-html-1 — platform-html → @jini-ai/cms (Jini step J then Tovu step T)

Lane C. Batch J:1 T:8. Depends on: none (only already-Jini code). Est: J 49 min, T 47 min.

## J — move verbatim into Jini (6 files, 378 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/platform/html/escape.ts` | `packages/cms/src/html/site/escape.ts` | 5 |  |
| `apps/website/src/platform/html/published-webmcp-strip.ts` | `packages/cms/src/html/site/published-webmcp-strip.ts` | 69 | W1 |
| `apps/website/src/platform/html/safe-url.ts` | `packages/cms/src/html/site/safe-url.ts` | 149 | W2 |
| `apps/website/src/platform/html/slug.ts` | `packages/cms/src/html/site/slug.ts` | 29 |  |
| `apps/website/src/platform/html/source-edits.ts` | `packages/cms/src/html/site/source-edits.ts` | 38 |  |
| `apps/website/src/platform/html/menu-render.ts` | `packages/cms/src/html/site/menu-render.ts` | 88 | W6 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./html/site/escape"]
- "@jini-ai/cms" exports["./html/site/menu-render"]
- "@jini-ai/cms" exports["./html/site/published-webmcp-strip"]
- "@jini-ai/cms" exports["./html/site/safe-url"]
- "@jini-ai/cms" exports["./html/site/slug"]
- "@jini-ai/cms" exports["./html/site/source-edits"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (2, 96 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/platform/html/__tests__/escape.test.ts`
- `apps/website/src/platform/html/__tests__/slug.test.ts`


## T — Tovu repoint: delete the 6 sources, rewrite every importer (46 lines)

```
apps/website/src/features/comments/builtin-provider.ts:5  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/features/site-backup/static-download-html.ts:3  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/features/site-backup/static-download-landing.ts:1  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/features/site-export/export-html-policy.ts:1  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/features/site-export/static-security-headers.ts:3  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/features/theme/preview-switcher-html.ts:2  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/features/theme/static-render-content.ts:3  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/features/theme/static-render-menus.ts:8  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/features/theme/static-render-previews.ts:3  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/features/theme/static-render.ts:5  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/features/theme/visitor-publication.ts:7  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/server/inbound/public-http/http/site/render/blocks.ts:5  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/server/inbound/public-http/http/site/render/components/entry-lists.ts:6  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/server/inbound/public-http/http/site/render/components/layout.ts:3  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/server/inbound/public-http/http/site/render/components/marketing.ts:3  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/server/inbound/public-http/http/site/render/contact-form-widget.ts:10  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/server/inbound/public-http/http/site/render/content-html.ts:7  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/server/inbound/public-http/http/site/render/doc/doc-nodes.ts:8  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/server/inbound/public-http/http/site/render/doc/nodes-media.ts:7  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/server/inbound/public-http/http/site/render/media-placeholder.ts:2  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/server/inbound/public-http/http/site/render/post-body.ts:3  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/server/inbound/public-http/http/site/render/widgets/post-content.ts:7  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/server/inbound/public-http/http/site/render/widgets/social-entries.ts:3  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/server/inbound/public-http/http/site/render-site.ts:13  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/server/inbound/public-http/routes/commerce/purchase.ts:5  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/server/inbound/public-http/routes/site/newsletter-confirm.ts:7  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/server/inbound/public-http/routes/site/newsletter-unsubscribe.ts:6  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/server/inbound/public-http/routes/site/product-checkout.ts:2  '#src/platform/html/escape' -> '@jini-ai/cms/html/site/escape'
apps/website/src/features/site-export/export-html-policy.ts:2  '#src/platform/html/published-webmcp-strip' -> '@jini-ai/cms/html/site/published-webmcp-strip'
apps/website/src/features/webmcp/published-html.ts:3  '#src/platform/html/published-webmcp-strip' -> '@jini-ai/cms/html/site/published-webmcp-strip'
apps/website/src/server/inbound/public-http/http/site/render/doc/nodes-media.ts:6  '#src/platform/html/safe-url' -> '@jini-ai/cms/html/site/safe-url'
apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts:16  '../../../../../website/src/platform/html/slug' -> '@jini-ai/cms/html/site/slug'
apps/website/src/assistant/__tests__/domain-no-direct-tool-registration.boundary.test.ts:260  '#src/platform/html/slug' -> '@jini-ai/cms/html/site/slug'
apps/website/src/features/forms/index.ts:62  '../../platform/html/slug.js' -> '@jini-ai/cms/html/site/slug'
apps/website/src/features/pages/tool-registrations.ts:32  '../../platform/html/slug.js' -> '@jini-ai/cms/html/site/slug'
apps/website/src/features/plugin-runtime/built-ins/content-analyzer/analyze-content.ts:8  '#src/platform/html/slug' -> '@jini-ai/cms/html/site/slug'
apps/website/src/features/post/slug.ts:1  '../../platform/html/slug.js' -> '@jini-ai/cms/html/site/slug'
apps/website/src/features/taxonomy/tool-registrations.ts:29  '../../platform/html/slug.js' -> '@jini-ai/cms/html/site/slug'
apps/website/src/features/widgets/deps.ts:49  '../../platform/html/slug.js' -> '@jini-ai/cms/html/site/slug'
apps/website/src/server/inbound/public-http/http/site/render/doc/doc-nodes.ts:5  '#src/platform/html/slug' -> '@jini-ai/cms/html/site/slug'
apps/website/src/features/site-backup/static-download-html.ts:4  '#src/platform/html/source-edits' -> '@jini-ai/cms/html/site/source-edits'
apps/website/src/features/site-export/export-html-policy.ts:3  '#src/platform/html/source-edits' -> '@jini-ai/cms/html/site/source-edits'
apps/website/src/features/navigation/__tests__/footer-page-links.test.ts:15  '#src/platform/html/menu-render' -> '@jini-ai/cms/html/site/menu-render'
apps/website/src/features/navigation/__tests__/html-render.test.ts:3  '#src/platform/html/menu-render' -> '@jini-ai/cms/html/site/menu-render'
apps/website/src/features/theme/static-render-menus.ts:6  '#src/platform/html/menu-render' -> '@jini-ai/cms/html/site/menu-render'
apps/website/src/features/webmcp/__tests__/embed-annotations.test.ts:5  '#src/platform/html/menu-render' -> '@jini-ai/cms/html/site/menu-render'
```

## Tovu tests that must stay green (4; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/domain-no-direct-tool-registration.boundary.test.ts`
- `apps/website/src/features/navigation/__tests__/footer-page-links.test.ts`
- `apps/website/src/features/navigation/__tests__/html-render.test.ts`
- `apps/website/src/features/webmcp/__tests__/embed-annotations.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/platform/html/published-webmcp-strip.ts` (1)
- `apps/website/src/platform/html/safe-url.ts` (2)
- `apps/website/src/platform/html/menu-render.ts` (6)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/platform/html/published-webmcp-strip.ts:5: export const SCRIPT_MARKER = 'data-tovu-webmcp-script';
apps/website/src/platform/html/safe-url.ts:9: const SAFE_HREF_RESOLUTION_BASE = "https://tovu-safehref.invalid/";
apps/website/src/platform/html/menu-render.ts:45: const icon = attrs.icon ? `<span data-tovu-menu-icon="${escapeHtml({ text: attrs.icon })}"></span>` : "";
apps/website/src/platform/html/menu-render.ts:46: const description = attrs.description ? `<span data-tovu-menu-description>${escapeHtml({ text: attrs.description })}</span>` : "";
apps/website/src/platform/html/menu-render.ts:70: ? `<span data-tovu-menu-label>${label}</span>`
apps/website/src/platform/html/menu-render.ts:72: return `<li data-tovu-menu-item data-depth="${depth}" data-current="${item.isCurrent}" data-active="${item.isActive === true}" data-has-chil
apps/website/src/platform/html/menu-render.ts:79: return children === "" ? "" : `<ul data-tovu-menu-list data-depth="${depth}">${children}</ul>`;
apps/website/src/platform/html/menu-render.ts:86: return list === "" ? "" : `<nav data-tovu-menu="${escapeHtml({ text: id })}">${list}</nav>`;
```

## Named mutation
in the Jini copy of `safe-url.ts`, negate the first `if (` condition of its first exported function; `escape.test.ts` must go red, then revert
