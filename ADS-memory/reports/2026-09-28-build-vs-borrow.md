# Build vs borrow — open-source audit (2026-09-28)

Scope: apps/website, apps/admin, root deps. Method: dependency lists, todos.md headings, directory listings + LOC, targeted greps, npm registry + GitHub API for health (fetched 2026-09-28). Code was NOT read deeply; "unverified" marks guesses. Jini packages treated as ours (not swap targets).
Known, not re-researched: Kysely storage move (in progress); workerd sandbox todo; static-export site chat via a Vercel serverless proxy.

## A. Open gaps that open source already answers

| Gap | Evidence | Package(s) | Effort |
|---|---|---|---|
| Public MCP endpoint + OAuth **server** + scoped tokens (EmDash gap #5) | todos.md:2365 #5 | `@modelcontextprotocol/sdk` `server/auth` (authorize/token/register/revoke/metadata handlers; **already installed**, 1.30.0) ; heavier alt `oidc-provider` 9.12.2 (MIT, 3.8k★) | M (security ruling still needed) |
| Sandboxed site plugins / server functions | todos.md:2374 | `workerd` (known) | L |
| Signed plugin installs (checksum, provenance, signed publisher) (EmDash #2) | todos.md:2365 #2 | `sigstore` 5.0.0 (Apache-2.0, sigstore-js 183★ but the official Sigstore JS client) ; lighter: Ed25519 via `node:crypto` + a minisign-style manifest (no dep) | M |
| Sanitizing raw HTML / third-party embeds (raw-HTML authoring, Calendly-class embeds) | todos.md:519, :555 — currently "unsanitized by design", admin/owner-only | `isomorphic-dompurify` 4.4.0 (MIT) over `dompurify` 3.4.16 (MPL-2.0 OR Apache-2.0, 17k★) ; or `sanitize-html` 2.17.7 (MIT, 7 deps, no DOM) | S–M |
| Public-site search (no search route; static export has none) | `server/inbound/public-http/routes/site/` has no search; FTS5 only for posts in admin | `pagefind` 1.5.2 (MIT, 5.5k★) — builds a static index at export time, works on Vercel static; ships a native binary per platform (desktop size: check) | S |
| RSS/Atom feed (none exists; only sitemap/robots/llms) | grep for `application/rss`/`<rss` = 0 | `feed` 6.0.0 (MIT, 1.4k★, 1 dep) | S |
| Public-page CSP / security headers (todos: "public pages send no CSP") | only theme-asset + a few routes set headers (`middleware/theme-content-security-headers.ts`) | `helmet` 8.3.0 (MIT) — or keep the homegrown middleware and just extend it | S |
| Pluralization / ICU messages in admin i18n (unverified need) | 46 `*-i18n.ts` files, ~44k LOC of TS dictionaries; custom `dictionary-translator.ts` has no plural rules | `i18next` 26.4.2 (MIT, 8.6k★) or `@lingui/core` 6.8.0 | L (keep for now, see B) |

## B. Homegrown → swap candidates

| # | Our module (LOC, non-test) | Package | Health (latest / ★ / license) | Deletes | Risk | Call |
|---|---|---|---|---|---|---|
| 1 | `apps/website/src/platform/oauth/` — 14 files, 2,734 LOC: RFC 9728/8414 discovery, DCR, PKCE, auth-code, refresh, device-code; used only by external-MCP (`assistant/external-mcp-oauth.ts`, `mcp-federation/adapter.http.ts`) | `@modelcontextprotocol/sdk` `client/auth` (`auth`, `discoverOAuthProtectedResourceMetadata`, `discoverAuthorizationServerMetadata`, `registerClient`, `startAuthorization`, `exchangeAuthorization`, `refreshAuthorization`); takes a `fetchFn` (35 refs), so our SSRF guard (`endpoint-safety.ts`, egress policy) can be injected | 1.30.1, 2026-09-23 / 13.5k★ / MIT — **already a dependency** (via @jini-ai/mcp) | ~2,000 LOC (discovery, DCR, PKCE, auth-code, refresh). Keep `device-code.ts` (SDK has none), `endpoint-safety.ts`, `bounded-json.ts`, ports | M: our code has hardening the SDK may lack (bounded JSON, per-host fallbacks noted in discovery.ts:43). Diff behaviour first | **Swap (maybe-high)** |
| 2 | `server/inbound/public-http/http/site/render.ts` — 3,461 LOC TipTap-JSON → HTML renderer + URL/CSS safety helpers | `@tiptap/static-renderer` (renders TipTap JSON to HTML string with no DOM, uses the same extensions as the admin editor) | 3.31.3, 2026-09-04 / 38.6k★ / MIT, 0 deps | Most per-node/per-mark rendering (probably 1.5–2.5k LOC, unverified). Keep `safeHref`/`safeImageSrc`/`safeCss*`, media/embed marker resolution, heading-id dedupe | M–H: public output HTML changes → every theme page diff; custom nodes (media, widget embed, YouTube) need custom mappings. Needs snapshot parity tests first | **Maybe** (biggest LOC win; do after tests) |
| 3 | `slugify` ×3 (`features/post/post.ts:1275`, `features/forms/duplicate-slug.ts`, `features/widgets/write-service.ts`) — `[^a-z0-9]+ → -` | `@sindresorhus/slugify` 3.0.1 (MIT, 2.7k★, 2 deps; ESM) | 2026-09-01 | 3 copies | Low. **Bug today:** non-ASCII titles lose letters ("Café" → `caf`) or become empty (CJK/Arabic/Hebrew). Swap changes new slugs only; existing slugs untouched | **Swap** |
| 4 | `escapeHtml`/`escapeAttr`/`escapeXml` — 9 copies (`site/render.ts:256`, `form-render.ts:164`, `page-head.ts:205`, `external-links.ts:88`, `theme/static-render.ts:127,188`, `site-export/site-exporter.ts:312`, `routes/site/sitemap.ts:9`, `assistant/mcp-ui.ts:190`) | No package needed (`escape-html` is 2015-era); consolidate into one `platform/html` helper | — | 8 copies | Low; the copies may differ (`'` vs `&#39;`) — diff them | **Consolidate (keep homegrown)** |
| 5 | `contracts/core/rate-limit/rate-limit.ts` — 322 LOC in-memory fixed-window, single process | `rate-limiter-flexible` 11.2.1 (ISC, 3.6k★, 0 deps; memory + Postgres/SQLite stores) | 2026-09-17 | ~150 LOC of counting; keep the profiles + client-IP resolution | Low–M; only worth it once multi-process / hosted (API + daemon are separate processes already) | **Maybe (later)** |
| 6 | `features/redirects/matcher.ts` — 205 LOC pattern matcher | `path-to-regexp` 8.4.2 (MIT, 8.6k★, 0 deps; already transitively present via express) | 2026-04-01 | ~150 LOC | M: pattern syntax may differ from what stored redirects use — would need a migration of saved patterns | **Keep** |
| 7 | `features/webhooks/signing.ts` — 178 LOC Stripe-style `Tovu-Signature: t=,v1=` HMAC | `standardwebhooks` 1.1.1 (MIT, 1.8k★) — the cross-vendor Standard Webhooks spec with verifier libs in many languages | 2026-08-28 | ~120 LOC | M: changes the wire format receivers verify against | **Maybe** (only if we want receivers to use off-the-shelf verifiers) |
| 8 | `features/webhooks/delivery.ts` (452) + `contracts/core/events/outbox-worker.ts` — DB outbox, backoff, dead-letter | pg-boss / graphile-worker (Postgres-only); Svix self-host (server) | — | — | Must work on SQLite + PGlite + Postgres; the libraries don't | **Keep** |
| 9 | GitHub REST via raw fetch — `source-control/github-git-provider.ts` (857), `deployments/providers/github.ts` (448), `site-backup/github-push.ts` (261) | `@octokit/rest` 22.0.1 (MIT; last release 2025-10-31, repo active) or `@octokit/core` + plugins | — | Request plumbing only; the tree/commit logic stays | Low–M; our code has redirect guards (`redirectGuardInit`) + timeouts that must be re-wired | **Keep** (little to delete) |
| 10 | `platform/markdown/frontmatter.ts` (69) on js-yaml | `gray-matter` 4.0.3 — last release 2021 | stale | — | — | **Keep.** But **js-yaml is in root `devDependencies` (package.json:151) and is imported at runtime** here — move it to `dependencies` (unverified whether the prod build bundles it) |
| 11 | `features/comments/sanitize.ts` (25) regex tag-strip; comments render as plain text | `sanitize-html` / DOMPurify | — | — | Fine as-is while comments are plain text | **Keep** (switch only if comments get rich text) |
| 12 | Admin i18n: `lib/dictionary-translator.ts` + `i18n-common.ts` (526) + 46 `*-i18n.ts` (~44k LOC dictionaries) | `i18next` / `@lingui/core` | healthy | Only the ~50-LOC lookup; the dictionaries stay | H churn for little deletion | **Keep** |
| 13 | `features/theme/static-render.ts`, `form-render.ts` — HTML edited with regex (`<title>` replace, field-error slot regex) | `linkedom` 0.18.13 (ISC, 2k★) or `parse5` (already in Jini ui) | — | Small | M; regex-over-HTML is a latent bug class, not LOC | **Maybe** |
| 14 | `features/deployments/static-publish/s3-compatible-target.ts` (868) on `aws4fetch` | `@aws-sdk/client-s3` | healthy | Signing is already borrowed | AWS SDK is large (hurts the desktop bundle) | **Keep** |
| 15 | `features/post/search-index.sqlite.ts` (298) FTS5 + BM25 | Orama / MiniSearch | — | — | Postgres dialect needs a `tsvector` twin (Kysely move) — that is the real gap, not a library | **Keep** |

Already borrowed well (no action): argon2 (passwords), nodemailer, sharp (renditions via Jini cms), OpenTelemetry, Kysely/Drizzle, liquidjs/handlebars, yauzl/yazl, TanStack Query, TipTap, GrapesJS.

## C. Top 5 to do first

1. **Slugify swap** (`@sindresorhus/slugify`, S) — fixes a live bug for non-English titles; one shared helper replaces 3 copies.
2. **External-MCP OAuth client → MCP SDK `client/auth`** (M) — ~2k LOC deleted, SDK already installed; keep device-code + SSRF guard via `fetchFn`.
3. **RSS/Atom feed (`feed`) + static-export search (`pagefind`)** (S each) — table-stakes CMS features with near-zero maintenance.
4. **HTML sanitizer for raw-HTML/embeds (`isomorphic-dompurify`) + extend the public CSP** (S–M) — prerequisite for the embeds/raw-HTML todos; unblocks opening those surfaces beyond owner-only.
5. **Public MCP OAuth server via MCP SDK `server/auth`** (M, after security ruling) — covers EmDash gap #5 without writing an authorization server.

Next tier: `@tiptap/static-renderer` for the 3.4k-LOC public renderer (after parity snapshots); consolidate the 9 `escapeHtml` copies; move `js-yaml` to `dependencies`.

Unverified: exact LOC `render.ts` would lose; whether the MCP SDK's discovery covers our per-host fallbacks; pagefind binary size in the desktop bundle; whether the prod build bundles devDependency js-yaml.
