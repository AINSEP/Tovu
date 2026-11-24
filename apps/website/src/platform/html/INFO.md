# platform/html

Host-side HTML helpers the public renderers share: `menu-render.ts`, `safe-url.ts`,
`source-edits.ts` and `published-webmcp-strip.ts`. Each keeps a Tovu host role.

## Wiring

- **Escaping is owned by Jini Core.** Import `escapeHtml` and `escapeXml` directly from
  `@jini-ai/core/text`. Both take `({ text }, _optional = {})`. HTML uses `&#39;` and XML uses
  `&apos;`. The host forwarder `escape.ts` was deleted in P12 cut #7.
- **Slugs are owned by Jini CMS.** Import `toSlug` directly from `@jini-ai/cms/html/site/slug`
  (universal entry, so the browser and the server use the same rule). The host copy `slug.ts`
  was byte-identical and was deleted in the same cut.
- Do not add a forwarding file here. `__tests__/html-owner-imports.boundary.test.ts` fails if
  either file returns, or if any source reaches them through `#src/…`, a relative path (with or
  without `.js`), or Admin's cross-app path.
- `__tests__/escape.test.ts` and `__tests__/slug.test.ts` remain as parity runs against the
  linked Jini functions. The slug test keeps the old ASCII rule as its oracle.
