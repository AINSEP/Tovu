# Build vs borrow — adversarial verification (2026-09-28)

Checks `2026-09-28-build-vs-borrow.md`. Read-only. Package facts come from `npm view` on 2026-09-28. The slugify results come from running `@sindresorhus/slugify@3.0.1` in a scratch install.

## Verdicts

| # | Item | Verdict | Effort |
|---|---|---|---|
| 1 | js-yaml devDependency used at runtime | **GO, urgent.** The report called it unverified. It is a real bug for desktop builds | S |
| 2 | slugify ×3 → `@sindresorhus/slugify` | **GO-WITH-CHANGES.** Wrap it so ASCII output stays byte-identical. There are 5 server copies, not 3 | S |
| 3 | 9 `escapeHtml` copies → one helper | **GO.** There are 12 copies, not 9 | S |
| 4 | RSS/Atom (`feed`) | **GO**, or hand-write it the same way as `sitemap.ts` | S |
| 4b | Static-export search (`pagefind`) | **NO as proposed.** It adds 57 MB of native binary per arch. Use `minisearch` (0 deps) | M |
| 5 | `isomorphic-dompurify` for raw HTML/embeds | **NO.** Wrong tool for the stated use, and it pulls jsdom into prod | — |
| 5b | Public CSP | **GO-WITH-CHANGES.** Add the safe headers now. Ship the CSP as Report-Only | S |
| 6 | External-MCP OAuth client → SDK `client/auth` | **NO.** The SDK would regress real-world discovery and SSRF hardening | — |
| 7 | Public MCP OAuth server via SDK `server/auth` | **GO-WITH-CHANGES, blocked on the security ruling.** Effort is L, not M: no inbound MCP server exists yet | L |
| 8 | `@tiptap/static-renderer` for `render.ts` | **NO.** Only a small share of the code could go, and every public page's bytes would change | — |

Recommended order: 1 → 3 → 2 → 4 (feed) → 5b → 4b (minisearch) → 7 (after the ruling).

---

## 1. js-yaml — GO, urgent (S)

**Facts (confirmed):**
- `package.json:151` declares `js-yaml ^5.3.0` under devDependencies.
- `apps/website/src/platform/markdown/frontmatter.ts:1` imports `load, FAILSAFE_SCHEMA` from js-yaml at runtime.
- The importers are boot-path tool registrations: `features/skills/tool-registrations.ts:15` and `features/agent-plugins/tool-registrations.ts:16`.
- The import arrived in commit 377269aaa on 2026-09-24.

**Docker is fine.** `Dockerfile:44` runs a plain `npm install` with NODE_ENV unset, so dev dependencies are installed.

**Desktop is not.** `apps/desktop/scripts/stage-payload.ts:24` stages "only the `dependencies` closure".
- The last staged payload (Sep 12) has no `node_modules/js-yaml`.
- Nothing prod-side depends on root js-yaml 5. `interpret` and `astro` want `^4`, and astro is dev-only.
- `assertClosureComplete` (`apps/desktop/src/stage-payload-lib.ts:178`) checks only the declared dependencies of staged packages. It does not check the website's own imports, so it will not catch the gap.
- Expected result: the next packaged app gets ERR_MODULE_NOT_FOUND at boot. The dev tree hides this because Node walks up into the repo's own `node_modules`.

**Brief:**
1. Move `js-yaml` from `devDependencies` to `dependencies` in the root `package.json`. Keep `@types/js-yaml` in dev. Run `npm install`.
2. Make the guard catch this class of bug. In `stage-payload-lib.ts` (or a new small check), scan `dist/src/**/*.js` for bare import specifiers. Assert that each one is a builtin or a root `dependencies` entry. Add a unit test with a fixture that imports a dev-only package and expect it to fail.
3. Verify by running `npm run stage` (or the desktop stage script) and confirming that `staging/tovu-payload/node_modules/js-yaml` exists.

## 2. slugify — GO-WITH-CHANGES (S)

**Facts:**
- The report named 3 copies. There are 5 server-side, all using `[^a-z0-9]+ → -`:
  - `features/post/post.ts:1275` (used at :1201, fallback `"untitled"`)
  - `features/forms/duplicate-slug.ts:65`
  - `features/widgets/write-service.ts:74` (fallback `"widget"`)
  - `server/inbound/public-http/http/site/render.ts:973` `headingAnchorId`. Its doc comment says it deliberately shares the post-slug dialect.
  - `features/pages/regions.ts:403`
- Admin has client-side copies at `apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.tsx:177` and `features/media/hooks/media-dependencies.hooks.ts:50`. The second mirrors Jini's `slugifyMediaTitle` in `/Users/la/Programming/Jini/packages/cms/src/media/media-service.ts:228`. Leave Jini alone.
- The bug is real: "Café Münster" becomes `caf-m-nster`, and Cyrillic, Greek and Arabic titles become an empty string.
- The slug validators are ASCII-only (`post.ts:993` SLUG_FORMAT_PATTERN, `pages.ts:1660`, `forms/write-service.ts:46`). A transliterating slugifier is therefore the right fit. The Unicode-slug approach in `apps/desktop/src/renderer/App.hooks.ts:1354` would require changing validators and routing.

**Hidden cost the report missed:** the package's defaults change ASCII output.

| Input | Today | Package default |
|---|---|---|
| `"fooBar"` | `foobar` | `foo-bar` (decamelize) |
| `"iPhone"` | `iphone` | `i-phone` |
| `"AT&T"` | `at-t` | `at-and-t` |
| `"Don't"` | `don-t` | `dont` |

`^` and `` ` `` are also dropped rather than used as separators. Heading anchors are recomputed at every render, so the defaults would silently break existing `#fragment` links.

**The fix is measured.** `slugify(s.replace(/[\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g, " "), { decamelize: false })` matched the current regex exactly on 500,000 random all-ASCII strings (0 mismatches). Non-ASCII now transliterates:

| Input | New output |
|---|---|
| Café Münster | `cafe-muenster` |
| Привет | `privet` |
| Ελληνικά | `ellinika` |
| Łódź | `lodz` |

CJK and Hebrew still come out empty, so the existing fallbacks still apply. Stored slugs are never recomputed, so no redirects are needed. The only visible change is heading anchors for headings that contain non-ASCII letters (for example `#caf` becomes `#cafe`). Accept that and note it in the commit.

**Brief:**
1. Add `@sindresorhus/slugify@^3` to root `dependencies`. It is MIT, ESM (the root is `"type":"module"`), about 19 KB, and has 2 small dependencies.
2. Create `apps/website/src/platform/routing/slug.ts` (or `platform/html/slug.ts`) exporting `toSlug(text: string): string`, using the pre-pass above. Put the parity rationale in its doc comment.
3. Replace the 5 server copies with calls to `toSlug`. Keep each caller's own fallback (`"untitled"`, `"widget"`, `FALLBACK_SLUG`) and the form length cap. Update the `headingAnchorId` doc comment.
4. Tests: a parity test over a fixed ASCII corpus plus a seeded random fuzz of about 10k cases against the old regex, kept inline in the test as the oracle. Add a transliteration table test for the examples above and a CJK → `""` case. Run each caller's existing suite.
5. Admin copies are optional. `WidgetConfigFields` should only change if the server derives the same value; otherwise leave it.

## 3. escapeHtml consolidation — GO (S)

**Facts:**
- There are 12 copies, not 9. Eight produce identical output (`& < > " '` → `&#39;`): `render.ts:256`, `form-render.ts:164`, `page-head.ts:205`, `theme/static-render.ts:127` and `:188`, `site-exporter.ts:312` (attr), `assistant/mcp-ui.ts:190`, and `routes/site/store.ts:36`.
- These differ:
  - `external-links.ts:88` escapes only `&` and `"`. That is correct for a double-quoted attribute, but the output bytes differ.
  - `sitemap.ts:9` uses `&apos;`.
  - `routes/site/newsletter-confirm.ts:40` and `newsletter-unsubscribe.ts:45` do not escape quotes. They are text-only today, so this is safe, but fragile.
- Several files keep their own copy to avoid import cycles (`form-render.ts:149`, `static-render.ts:219`). A leaf module with no imports fixes that.

**Brief:**
1. Create `apps/website/src/platform/html/escape.ts` (the directory already exists; `style-values.ts` lives there). It should export `escapeHtml(text)` (the 5-char set, `&#39;`) and `escapeXml(text)` (the same set plus `&apos;`, to keep the sitemap's bytes), with no imports.
2. Point the 8 identical copies plus both newsletter copies at it.
3. Keep re-exports where other files import `escapeHtml` from `render.ts` or `static-render.ts`: `bare-page.ts:4` and `entry-list-render.ts:1`. Better still, repoint those importers.
4. For `external-links.ts`, either switch it and update its snapshot tests (the output is semantically equal), or leave it with a one-line comment. Prefer switching.
5. Tests: one unit test for the leaf module. Run the render, form-render, page-head, static-render, site-exporter, sitemap and newsletter suites. Newsletter pages gain quote escaping, which is a byte change in text only.

## 4. RSS/Atom feed — GO (S)

**Facts:** no feed exists (confirmed). `feed@6.0.0` is MIT, about 27 KB, with 1 dependency (xml-js), last published 2026-07. The model to copy is `routes/site/sitemap.ts` (46 LOC, a hand-built XML route) together with `features/seo/sitemap.ts:140` `buildSitemap`, which already resolves absolute URLs via `originRegistry`.

**Hidden costs:**
- Feeds need absolute URLs. The exporter rewrites to root-relative (`site-exporter.ts:358`), so the feed must be exempt from that rewrite, the same way it handles `<loc>` at `:410`.
- Auto-discovery needs a `<link rel="alternate" type="application/rss+xml">` in `page-head.ts`.
- Hand-writing RSS 2.0 is about 60 LOC and avoids the dependency. Either choice is fine; the `feed` package also gives Atom and JSON Feed for free.

**Brief:**
1. Add `features/seo/feed.ts` `buildFeed(deps, {workspaceId})`. It should return the latest 20 published posts (kind post, not pages) with title, absolute URL, date and excerpt (or the first paragraph's text), plus the site title.
2. Add `routes/site/feed.ts` serving GET `/feed.xml` (RSS) and optionally `/atom.xml`. Use the same cache header as the sitemap. Register it before the `/:slug` catch-all.
3. Add the path as a `well-known` route in `features/site-export/route-manifest.ts` next to `SITEMAP_PATH` (`site-exporter.ts:523`), with a rewrite that keeps URLs absolute.
4. Add the alternate link in `page-head.ts`.
5. Tests: the route (content type, escaping of `& < '` in titles, drafts excluded), the export manifest including `/feed.xml`, and the head link.

## 4b. Static-export search — NO to pagefind; GO-WITH-CHANGES using minisearch (M)

**Facts:**
- There is no public search route (none under `server/inbound/public-http`).
- `pagefind` 1.5.2 is MIT, but indexing uses a native Rust binary. `@pagefind/darwin-arm64` is 57.6 MB and `@pagefind/darwin-x64` is 57.4 MB, so a universal desktop build adds about 115 MB.
- pagefind's last release was 2026-04.
- pagefind would also only work on exported sites, not the served site.

**Alternative:** `minisearch` 7.2.0 is MIT with 0 dependencies. It is pure JS, and the browser runtime is about 20 KB gzipped. Build the index from the post repo, which already has the text, rather than by crawling HTML.

**Brief:**
1. Add `features/search/public-index.ts`. It builds a MiniSearch JSON index from published posts and pages: title, plain text of the body (reuse the FTS text extraction in `features/post/search-index.sqlite.ts` if it can be shared), and URL.
2. The server exposes GET `/search-index.json`. The export writes the same file as a well-known route.
3. Add a small search page or theme partial that lazy-loads minisearch and the index. This is a theme and UX decision, so ask the owner where the search box goes before building UI.
4. Tests: index contents exclude drafts, and the export includes the file.

## 5. isomorphic-dompurify for raw HTML/embeds — NO

**Facts:**
- `development/todos.md:524-526` and `:570` describe html-format Pages as "stored unsanitized by design" and editable by admin/owner only (`update-html.ts:127-133`).
- The embed use case (Calendly) needs `<script src>`. A sanitizer would strip exactly what the feature needs, and it would break existing pages that contain vendor snippets.
- The owner parked embeds and raw HTML ("later", 2026-09-22).
- `isomorphic-dompurify@4.4.0` depends on `jsdom ^30`, about 8 MB plus its dependencies, which would enter the prod and desktop closure. jsdom is not currently installed at all.

The right primitive for embeds is a host allowlist, as the todo itself proposes, not a sanitizer. If non-owner roles ever get raw HTML, use `sanitize-html` (htmlparser2, no DOM) on the server at that point.

## 5b. Public CSP — GO-WITH-CHANGES (S)

**Facts:** public pages send no CSP. Only theme assets and a few routes set headers (`middleware/theme-content-security-headers.ts:119-120`). A blocking CSP would break html Pages with inline scripts or vendor embeds, theme inline scripts, and the site assistant, and it would need a per-embed host allowlist (`todos.md:538`). `helmet`'s default CSP would break things; do not add helmet.

**Brief:**
1. Add a public-page middleware that sets `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin` (safe now).
2. Add `Content-Security-Policy-Report-Only` with `default-src 'self'`, `img-src 'self' data: https:`, `script-src 'self' 'unsafe-inline'` plus the known hosts (YouTube frame-src and so on), and `object-src 'none'`, `base-uri 'self'`.
3. Do not set frame-ancestors. The rationale is at `theme-content-security-headers.ts:61`.
4. Static exports need the same headers in the deploy target config (`vercel.json` headers) or a `<meta http-equiv>`. Flag this in the commit; do not build it now.
5. Test the headers on `/`, a post, and an html-format page.

## 6. OAuth client → MCP SDK `client/auth` — NO

**Facts:** `platform/oauth/` is 14 files and 2,734 LOC, confirmed. It is used by external-MCP only (7 importers).

**Why the SDK regresses us:**
- **Multi-server discovery.** The SDK takes `authorization_servers[0]` only (`node_modules/@modelcontextprotocol/sdk/dist/esm/client/auth.js:667-668`). Our `discovery.ts:37-45` tries every candidate because a measured real hosted MCP server advertised two, and the first one we tried 404'd.
- **Checks on discovered URLs.** Our code checks every discovered URL with `assertSafeProviderEndpoint`. A bad candidate is dropped; a bad committed endpoint throws (`discovery.ts:20-30`). A `fetchFn` wrapper can only check URLs that are fetched. It cannot check the authorization URL that the SDK builds and hands to the browser.
- **Bounded JSON and operator-facing errors** (`bounded-json.ts`, `errors.ts`) would have to be re-wrapped anyway.
- **Scope of the SDK.** It is not a direct dependency of the website (only via `@jini-ai/mcp`, where the pin is ^1.29.0 against 1.30.0 installed). `device-code.ts`, `providers.ts`, `pending-authorizations.ts`, `endpoint-safety.ts` and `ports.ts` stay regardless.

Realistic net deletion is about 800–1,000 LOC, all on a security-sensitive surface, with a known regression. Not worth it. The only piece that could reasonably go is `pkce.ts` (82 LOC).

## 7. Public MCP OAuth server via SDK `server/auth` — GO-WITH-CHANGES, blocked on the security ruling (L)

**Facts:**
- The SDK ships express handlers (`server/auth/router.js`, which imports express, cors and express-rate-limit). Tovu is express 4 (`package.json:123`, `server/runtime/composition/app.ts:1480`), so the SDK fits.
- The SDK gives the HTTP endpoints only: metadata, authorize, token, register and revoke, with PKCE verification and rate limiting.
- We must supply:
  - an `OAuthServerProvider` (issuing, storing and verifying tokens, in 3 dialects: a new table plus migrations)
  - `OAuthRegisteredClientsStore`
  - a consent screen in admin
  - a scope model
  - **the MCP server itself**: `rg McpServer|StreamableHTTPServerTransport` finds nothing inbound in `apps/website/src`. Tovu has no public MCP endpoint today.

That makes this L, not M.

**Brief (after the ruling):**
1. Add `@modelcontextprotocol/sdk` to root `dependencies` at the same version Jini uses.
2. Mount `mcpAuthRouter` and a `StreamableHTTPServerTransport` `/mcp` route guarded by `requireBearerAuth`. The provider should be backed by a new `oauth_clients` / `oauth_tokens` Kysely repo (store hashed tokens only).
3. Expose a read-only tool subset first.
4. Add an admin consent page.
5. Tests: the authorization-code + PKCE flow end-to-end with the SDK client, refusal of a token with the wrong scope, and revocation.

## 8. `@tiptap/static-renderer` — NO

**Facts:**
- `render.ts` is 3,461 LOC, but the TipTap node and mark code is only about lines 541–1668 (`DOC_NODE_HANDLERS` at :1604, 23 node types). The rest is the page shell, block renderer (`BLOCK_TYPE_HANDLERS` :2940), media, widgets and head injection.
- The node and mark handlers that carry safety logic must stay custom under any renderer: link (`safeHref`), image and media, youtube, textStyle/highlight (`safeCss*`), codeBlock language class, widgetEmbed, mention, title.
- The TipTap defaults emit extension `renderHTML` output, which for example writes raw `style` colours.
- What the renderer could actually replace is the plain structural nodes (paragraph, lists, blockquote, hr, hardBreak, table rows, bold/italic): roughly 200–300 LOC.

**Costs:**
- It adds `@tiptap/core` and `@tiptap/pm` (ProseMirror, about 5 MB) to the public render path and the desktop payload.
- It must pin to admin's 3.27.2 (the latest is 3.31.3).
- The custom admin extensions live in React files and cannot load on the server.
- Every public page's HTML bytes would change.

Keep the homegrown renderer.
