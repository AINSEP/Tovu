> **⚠️ EXPLORATORY — NOT A DECISION.** Owner curiosity session, 2026-10-04. Nothing here was chosen or approved, and nothing is being built. The owner noted the proposed format "looks kinda funny" and that none of this can be judged until it is tried on a real vibe-coded app. Treat as raw input for a future prototype, not a spec.

_Source: question packet_

## CONTEXT BUDGET — HARD PRIORITY RULE (overrides finishing the task)
Your hard ceiling is 300k tokens of context. Stop well before it. If you approach ~200k, stop reading and write the design from what you have, marking unverified rows "UNVERIFIED".

## Preamble
- Do NOT read AGENTS.md / CLAUDE.md / CONTEXT.md / START-HERE.md or anything under `AI-Dev-Shop/` or `ADS-memory/`. There is no bootstrap for this task. A missing file is never a reason to stop; reporting yourself blocked is a wrong answer.
- Read-only. Do not edit files. Do not run tests, builds, installs, or servers.
- Never call codebase-memory-mcp `index_repository`. Use `rg`/`sed -n`. Never chain reads with `&&` (one miss aborts the rest).
- EFFICIENCY (owner constraint): be economical. Use `rg` to locate, then read only the slices you need (`sed -n A,Bp`). Skip `__tests__`, `dist`, `node_modules`, generated files. Target ≤ 40 targeted reads total. The file list below is a map, not a fence — read anything you genuinely need, but don't sweep.

## Repos
- Tovu (CMS, this repo): `/Users/la/Programming/Tovu`, app code under `apps/website/src` (server + site render) and `apps/admin/src` (admin UI).
- Jini (shared packages, sibling repo): `/Users/la/Programming/Jini/packages/*`. Relevant: `vibecoding` (`@jini-ai/vibecoding`: "Conversational artifact authoring: a target-agnostic edit loop… Framework-free in /core; tagged-region HTML documents behind ./html; filesystem targets behind ./node and the chat/preview surface behind ./react"), `cms` (`@jini-ai/cms`, subpaths ./core ./navigation ./media ./settings ./workspace ./entries ./content-types ./taxonomy ./presentation ./trash), `cms/forms` (`@jini-ai/cms-forms`, server-side form validation/submissions).

## The need (owner)
Tovu is a CMS that is also a vibe-coding platform. Users vibe-code a React, Vue, or Angular app on our platform and connect it to the Tovu admin and server. They may host the built app on Vercel, AWS, or on Tovu itself. The app should be able to use essentially the whole backend: embeds (forms, menus, posts, media, comments, newsletter), routing/navigation + redirects, users/members (sign-in, current user), content queries, commerce/payments (Stripe, PayPal widgets), analytics, etc.

**Owner constraint: the most efficient way possible** — fewest new server surfaces, maximum reuse of existing services/render paths/endpoints, thinnest client SDK, smallest number of per-framework pieces, and a build order where each step is independently shippable.

Owner decisions already made:
- The client SDK lives in Jini as a new subpath `@jini-ai/vibecoding/connect` (NOT `@jini-ai/cms`). Tovu-specific server pieces stay in Tovu.
- One `embed.js` that works for React, Vue and Angular, built from that subpath, loaded by one `<script>` tag.
- Marker contract stays `<div data-embed-config='{"type":"form","id":"contact"}'></div>`.
- Owner principles: easiest for the end user first; prototype first (forms first) so they can see it; generic code in Jini with injected ports, host-specific in Tovu; API function args shaped `(requiredObj, optionalObj)` with deps as ports.

## Prior conclusions (two reviewers, 2026-10-04) — treat as inputs, challenge if wrong
1. Embed runtime: one document-level MutationObserver over plain `div[data-embed-config]` (custom elements need Angular `CUSTOM_ELEMENTS_SCHEMA` / Vue `isCustomElement`). WeakMap per-element state, AbortController, generation token, dedupe identical configs, defer first scan past hydration.
2. Inject into a Shadow DOM on the marker; light-DOM children = fallback via `<slot>` (shown while loading / on failure). Isolates CSS both ways; app themes via CSS custom properties. (Alternative view: require empty markers, no shadow DOM — trade-off is the app's CSS can't style the fragment.)
3. Default cross-origin (Vercel/AWS): CORS with no credentials on the fragment endpoint and on submit routes; same-origin works automatically (SDK derives API base from its own `script.src`). Relative URLs in fragments (`action="/forms/x/submit"`, media src, post hrefs) must be absolutized. Third-party cookies (flash cookie) are dead cross-origin.
4. Form submit must be intercepted by the runtime: `fetch` urlencoded + `Accept: application/json` (simple request, no preflight) to the existing `POST /forms/:slug/submit` JSON branch (201 / 400 `FORMS_SUBMISSION_VALIDATION_ERROR` with `details.fieldErrors` / 429 / 404). The existing native-post Post/Redirect/Get + server-side splice (`apps/website/src/server/inbound/public-http/http/site/form-render.ts:461 injectFormSubmissionResultIntoHtml`) cannot reach an SPA.
5. New endpoint `GET /embed?type=&id=` that reuses the existing page render (`apps/website/src/server/inbound/public-http/http/site/render.ts:1779 renderHtmlPageBody` + the route's batch loader `resolveHtmlPageEmbeds` in `apps/website/src/features/widgets/resolver-service.ts`), applies the same visibility rules as pages (no drafts/private), validated, rate-limited, cacheable. Strip `<script>`, `on*`, `javascript:` (fragment runs in the customer's origin).
6. Payments (Stripe/PayPal) cannot be plain HTML embeds: their JS must load, secret keys stay server-side. Needs a "behavior embed" handler registry in the runtime (HTML embeds vs handler embeds).
7. Routing/redirects/data hooks probably need thin per-framework adapters (React Router / Vue Router / Angular Router) — "one file" holds for embeds only.

## Verified facts about the current server (2026-10-04)
- Embed types owned by page render: `["widget","form","taxonomy","media","post","content"]` (`apps/website/src/features/widgets/page-embed-types.ts:14`); theme `partial` and `menu` markers resolve in a later static-render stage. Unowned marker types are left untouched by render.
- Public (non-admin) routes registered today (from `apps/website/src/server/inbound/public-http`): `GET / /:slug /products /products/:id /store /store/buy /sitemap.xml /robots.txt /llms.txt /m/:assetId/... /newsletter/confirm /newsletter/unsubscribe /theme-explore/... /site-chat/* /health*`, `GET /api/content/v1/workspaces/:workspaceId/posts/:slug`, `GET /api/publish-trust/v1/identity`, `POST /forms/:slug/submit`, `POST /api/site/comments`, `POST /_analytics/e`, `POST /api/members/v1/workspaces/:workspaceId/sign-in` and `/sign-in/complete`, `POST /newsletter/unsubscribe`, `POST /api/publish-trust/v1/challenge|session`. Route files: `apps/website/src/server/inbound/public-http/routes/site/` (analytics-ingest, comments-submit, feed, forms-submit, llms, media-rendition, newsletter-*, pages, payments-webhook, products, robots, sitemap, store).
- No CORS anywhere in the public HTTP layer. No public JSON for menus, redirects lookup, current member/session, sign-out, content lists.
- Commerce: `apps/website/src/features/commerce/checkout.ts` creates a `pending` order and deliberately never charges ("`CommercePaymentRuntimePort` still excludes charge/refund/webhook methods by design"). There is a `payments-webhook.ts` route and `features/commerce/webhook-inbox.ts` — check what they actually do. Stripe/PayPal client flows are not wired.
- Feature folders that matter: `apps/website/src/features/{members,identity,redirects,navigation,commerce,comments,newsletter,analytics,forms,widgets,post,pages,media,taxonomy,webmcp,site-glue}`. Admin API lives under `/api/admin/v1/workspaces/:workspaceId/...` (`apps/website/src/server/inbound/admin-http/routes/`).
- "Attach an app to the admin" has no existing model; check `features/sites`, `features/deployments`, `features/origin`, `features/plugin-runtime` briefly for anything reusable (an app registry / allowed-origins list / per-app key).

## The deliverable
Write the design as your final message (Markdown, ~2,500–4,000 words, no preamble). Sections:

1. **Recommendation in one paragraph.** The overall shape, and why it's the most efficient.
2. **Capability matrix (the core).** One row per backend capability a vibe-coded app needs: forms, menus/navigation, posts/pages content (single + lists), media, taxonomy, comments, newsletter signup, members sign-in / current user / sign-out / gated content, redirects + routing, SEO/head metadata, search (if any exists), commerce products/cart/checkout, payments (Stripe, PayPal), analytics, site settings/branding, webmcp/site-chat if relevant. Columns: **mode** (HTML embed / behavior embed / data call / router adapter / not now), **existing server code to reuse (file:line)**, **existing public endpoint (or NONE)**, **new endpoint needed (exact method + path)**, **SDK surface** (exact call name), **auth** (anonymous / member token / app key), **cross-origin needs**, **size (S/M/L)**. Mark anything you didn't verify in code as UNVERIFIED.
3. **Server surface, minimized.** The smallest set of new endpoints that covers the matrix (collapse where one generic endpoint can serve many rows — e.g. one `/embed` for all HTML embeds, one content query endpoint). Versioning/prefix, CORS policy, caching, rate limits, visibility rules, error shape.
4. **App registration / "attach to admin".** How an app is registered (allowed origins, app id/public key, which capabilities it may use), where it lives in admin, and how the server enforces it. Reuse existing models if any fit.
5. **Auth for members across origins.** Cookies vs token (third-party cookie restrictions), how sign-in/sign-out/current-user work from a Vercel-hosted app, CSRF posture.
6. **Payments.** Stripe and PayPal end-to-end with the least code: what the admin stores, which server endpoints create sessions/orders, which client handler mounts what (Stripe Checkout redirect vs Embedded Checkout vs Elements; PayPal JS SDK buttons), webhook → order paid, Shadow DOM compatibility risks. Ground in what `commerce/` + `payments-webhook.ts` actually do today.
7. **Routing & redirects.** How a client-side router respects Tovu redirects and menus/page slugs; what is framework-agnostic vs a thin adapter; SEO implications.
8. **`@jini-ai/vibecoding/connect` package shape.** Module layout (core runtime / embed handlers / data client / framework adapters), what's framework-free vs per-framework, ports injected by Tovu, the `embed.js` build output, and the `(requiredObj, optionalObj)` API shape. Name what moves from Tovu to Jini (e.g. the marker parser `apps/website/src/contracts/core/embeds/marker`).
9. **Build order.** Numbered slices, each independently shippable and demo-able, smallest first (slice 1 = forms embed in a Vite React app on another port). For each: what ships, files touched (Tovu + Jini), size, and what it unblocks.
10. **Ranked risks and open questions for the owner** (max 8, each a plain question with your recommended answer).

Be concrete and grounded: cite `file:line` for every reuse claim. Prefer reusing an existing service over a new one; say explicitly where you rejected a heavier option (GraphQL, full REST mirror, SSR, iframes everywhere, per-framework SDKs) and why.
