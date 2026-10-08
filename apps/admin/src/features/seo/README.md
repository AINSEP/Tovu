# features/seo

The site-wide SEO settings screen (SPEC-008 `ui.spec.md` §2.4) behind the sidebar's
**Marketing → SEO** entry.

| file | what it is |
|---|---|
| `index.ts` | Thin `Seo({ tabId })` mount for the Jini settings page; the only surface `panels.tsx` may import. |
| `seo-i18n.ts` | Host dictionary with common-copy and English fallbacks. |
| `__tests__/Seo.hooks.unit.test.tsx` | Real host routing, dictionary and defaults-patch contract. |

## Notes for anyone editing here

Screens live in `@jini-ai/admin/seo` (`@jini-ai/admin/seo/react` for rendering). Rules,
controllers, HTTP/memory adapters and the eight migrated suites live with that owner.
`integrations/jini-admin/seo-{module.hooks,ports}.ts` supplies the live locale, authenticated
transport, public sitemap transport, publish action and existing CMS media picker slot.

Browser acceptance still covers all three tabs and the sitemap modal after the coordinator's
test/build batch and published-package typecheck.
