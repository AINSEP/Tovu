> **⚠️ EXPLORATORY — NOT A DECISION.** Owner curiosity session, 2026-10-04. Nothing here was chosen or approved, and nothing is being built. The owner noted the proposed format "looks kinda funny" and that none of this can be judged until it is tried on a real vibe-coded app. Treat as raw input for a future prototype, not a spec.

_Source: Codex gpt-6.1-sol (high). Owner rejected this per-feature approach as unsustainable — kept for its code findings (member-access gap, Lipay→commerce bridge missing, raw session token exists)._

## 1. Recommendation in one paragraph

Build `@jini-ai/vibecoding/connect` as a framework-free browser connector with one `embed.js`, automatic mounting of ordinary `div[data-embed-config]` markers, a small data client, and an injected router port. Start with forms: one new fragment endpoint reuses Tovu’s existing resolver and renderer, while submission uses the existing forms endpoint. Expand through one bounded query endpoint and one route-resolution endpoint instead of creating a REST mirror. Keep content ownership, visibility, registration, and commerce orchestration in Tovu; put reusable browser lifecycle, transport, and provider drivers in Jini. Use bearer member sessions across origins and Stripe-hosted Checkout first. Reject GraphQL, mandatory SSR, iframes everywhere, and three framework SDKs: each increases implementation or integration work without helping the first working app.

## 2. Capability matrix

All SDK names below are proposed. Every call takes `(requiredObj, optionalObj)`. **S/M/L** describes the incremental work, including missing backend behavior—not just the wrapper.

Cross-origin notation:

- **C:** exact registered-origin CORS; anonymous requests omit credentials.
- **B:** bearer authorization; support preflight.
- **U:** distinguish backend resource URLs from app navigation URLs.
- **P:** provider script/CSP requirements; provider behavior remains separate from HTML.

`appId` is public registration metadata, not a secret app key.

| Capability | Mode | Existing server code to reuse (`file:line`) | Existing public endpoint | New endpoint needed | SDK surface | Auth | Cross-origin needs | Size |
|---|---|---|---|---|---|---|---|---|
| Forms | HTML embed + submit behavior | [contact-form.ts:28](/Users/la/Programming/Tovu/apps/website/src/features/widgets/resolvers/contact-form.ts:28), [render.ts:2401](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/http/site/render.ts:2401), [forms-submit.ts:245](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/forms-submit.ts:245) | `POST /forms/:slug/submit` | `GET /api/connect/v1/embed` | `mount`, `submitForm` | Anonymous | C, U; urlencoded submit | S |
| Menus/navigation | HTML embed or data call | [pages.ts:611](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/pages.ts:611), [html-render.ts:47](/Users/la/Programming/Tovu/apps/website/src/features/navigation/html-render.ts:47) | NONE | `GET /api/connect/v1/embed`; `GET /api/connect/v1/query` | `mount`, `getMenu` | Anonymous; member for restricted targets | C, B, U | M |
| Single post/page content | HTML embed or data call | [post.ts:1792](/Users/la/Programming/Tovu/apps/website/src/features/post/post.ts:1792), [get-by-slug.ts:43](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts:43), [pages.ts:1226](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/pages.ts:1226) | `GET /api/content/v1/workspaces/:workspaceId/posts/:slug`; rendered `/` and `/:slug` | `GET /api/connect/v1/embed`; `GET /api/connect/v1/query` for additional selectors | `mount`, `getContent` | Anonymous/member token | C, B, U | M |
| Content lists/custom entries | Data call; optional HTML list | [post.ts:1760](/Users/la/Programming/Tovu/apps/website/src/features/post/post.ts:1760), [pages.ts:919](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/pages.ts:919) | NONE for JSON lists | `GET /api/connect/v1/query` | `listContent` | Anonymous/member token | C, B; visibility-aware pagination | M |
| Media | HTML embed or data call | [resolver-service.ts:1297](/Users/la/Programming/Tovu/apps/website/src/features/widgets/resolver-service.ts:1297), [media-rendition.ts:437](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts:437) | `GET /m/:assetId/:transformSpec/:filename`; `GET /m/:assetId/original` | `GET /api/connect/v1/embed`; `GET /api/connect/v1/query` for metadata/access tickets | `mount`, `mediaUrl` | Anonymous/member token | U; protected browser media needs signed URL or authenticated blob | M |
| Taxonomy | HTML embed or data call | [taxonomy.ts:6](/Users/la/Programming/Tovu/apps/website/src/features/widgets/resolvers/taxonomy.ts:6) | NONE | `GET /api/connect/v1/embed`; `GET /api/connect/v1/query` | `mount`, `getTaxonomy` | Anonymous | C; no invented archive routes | S |
| Comments: read/submit | Behavior embed + data call | [ports.ts:37](/Users/la/Programming/Tovu/apps/website/src/features/comments/ports.ts:37), [comments-submit.ts:59](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/comments-submit.ts:59) | `POST /api/site/comments` | `GET /api/connect/v1/query` | `getComments`, `submitComment`, `mount` | Anonymous; member for gated entry | C, B; JSON preflight | M |
| Newsletter signup | Behavior embed + data call | [subscriptions.ts:38](/Users/la/Programming/Tovu/apps/website/src/features/newsletter/subscriptions.ts:38), [confirmation.ts:53](/Users/la/Programming/Tovu/apps/website/src/features/newsletter/confirmation.ts:53) | Confirm/unsubscribe routes only; NONE for signup | `POST /api/connect/v1/newsletter/subscriptions` | `subscribeNewsletter`, `mount` | Anonymous | C; confirmation remains an email-link flow | M |
| Member sign-in | Data call | [sign-in.ts:53](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/members/sign-in.ts:53), [complete-sign-in.ts:74](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/members/complete-sign-in.ts:74) | `POST /api/members/v1/workspaces/:workspaceId/sign-in`; `POST /api/members/v1/workspaces/:workspaceId/sign-in/complete` | NONE; extend existing routes | `requestSignIn`, `completeSignIn` | Anonymous → member token | C; app-bound callback/verifier | M |
| Current user/sign-out | Data call | [access-resolver.ts:85](/Users/la/Programming/Tovu/apps/website/src/features/members/access-resolver.ts:85), [ports.ts:86](/Users/la/Programming/Tovu/apps/website/src/features/members/ports.ts:86) | NONE | `GET /api/members/v1/workspaces/:workspaceId/me`; `POST /api/members/v1/workspaces/:workspaceId/sign-out` | `getCurrentMember`, `signOut` | Member token | B; server revocation | M |
| Gated content | Data call/HTML embed | [access-resolver.ts:132](/Users/la/Programming/Tovu/apps/website/src/features/members/access-resolver.ts:132), [get-by-slug.ts:69](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts:69) | Single-content route uses member cookie today | Same embed/query routes; bearer support on existing content/media routes | `getContent`, `listContent`, `mount` | Member token | B; private caching throughout nested content | M |
| Redirects/routing | Router adapter | [phase-handler.ts:129](/Users/la/Programming/Tovu/apps/website/src/features/redirects/phase-handler.ts:129), [routing.ts:251](/Users/la/Programming/Tovu/apps/website/src/platform/routing/routing.ts:251), [pages.ts:164](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/pages.ts:164) | Page HTTP redirects; NONE for lookup | `GET /api/connect/v1/resolve` | `resolveRoute`, `attachRouter` | Anonymous/member token | C, B, U | M |
| SEO/head metadata | Data call + router integration | [page-head.ts:175](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/http/site/page-head.ts:175), [seo.ts:260](/Users/la/Programming/Tovu/apps/website/src/features/seo/seo.ts:260) | HTML heads, sitemap/robots; NONE for metadata JSON | `GET /api/connect/v1/resolve` | `resolveRoute`, `applyHead` | Anonymous/member token | C, U; choose public canonical origin | M |
| Search | Data call | [search.ts:239](/Users/la/Programming/Tovu/apps/website/src/features/post/search.ts:239) | NONE for public search | `GET /api/connect/v1/query` | `searchContent` | Anonymous/member token | C, B; published and access-filtered results | M |
| Products/cart/checkout | Data call + behavior embed | [products.ts:61](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/products.ts:61), [checkout.ts:84](/Users/la/Programming/Tovu/apps/website/src/features/commerce/checkout.ts:84) | HTML `/products`, `/products/:id`, `/store`; `/store/buy` prototype | `GET /api/connect/v1/query`; `POST /api/connect/v1/checkout`; `GET /api/connect/v1/orders/:orderId` | `listProducts`, `createCart`, `checkout`, `getOrder` | Anonymous catalog; member token for first checkout | C, B; local cart, authoritative server prices | L |
| Stripe payments | Behavior embed | [lipay-plugin.ts:250](/Users/la/Programming/Tovu/apps/website/src/features/plugins/lipay/lipay-plugin.ts:250), [payments-webhook.ts:72](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/payments-webhook.ts:72) | `POST /payments/webhook/:providerId`; Stripe adapter/activation **UNVERIFIED** | Shared checkout/order routes | `checkout`, `mount` | Member token; webhook signature | B; hosted redirect first | L |
| PayPal payments | Behavior embed | Same Lipay/webhook boundary; PayPal adapter **UNVERIFIED** | Same webhook route | Shared checkout/order routes; `POST /api/connect/v1/checkout/:checkoutId/capture` | `checkout`, `captureCheckout`, `mount` | Member token; webhook signature | B, P; light-DOM provider mount | L |
| Analytics | Data call | [analytics-ingest.ts:90](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/analytics-ingest.ts:90) | `POST /_analytics/e` | NONE | `trackPageview`, `trackEvent` | Anonymous | C; validate registered host, honor DNT/GPC | S |
| Site settings/branding | Data call | [pages.ts:199](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/pages.ts:199), presentation read in [get-by-slug.ts:59](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts:59) | NONE for public settings JSON | `GET /api/connect/v1/query` | `getSite` | Anonymous | C; explicit public-field allowlist | S |
| WebMCP | Not now; later behavior adapter | [published-html.ts:35](/Users/la/Programming/Tovu/apps/website/src/features/webmcp/published-html.ts:35) | HTML injection, not a data endpoint | NONE initially | `registerTools`—deferred | Capability-dependent | Shadow-tree discovery **UNVERIFIED** | M |
| Site-chat | Not now; later behavior handler | [site-chat-static.ts:14](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/middleware/site-chat-static.ts:14) | `/site-chat/site-assistant.js`; visitor API/auth **UNVERIFIED** | **UNVERIFIED** | `mountSiteChat`—deferred | **UNVERIFIED** | Separate chat transport/CORS verification | M, provisional |

Newsletter signup is not automatically solved by embedding a contact form: the existing subscription service requires an existing subscriber identity and issues confirmation. External-app hosting on Tovu is also **UNVERIFIED**; connector attachment must ship independently of deployment management.

## 3. Server surface, minimized

Use `/api/connect/v1` for new connector resources. Preserve existing public write routes.

The first three new handlers cover almost every read capability:

1. **`GET /api/connect/v1/embed`** — validated `type`, `id`, `appId`, and bounded type-specific options. Return sanitized HTML; behavior types are handled by the client registry.
2. **`GET /api/connect/v1/query`** — explicit resource enum: `posts`, `pages`, `entries`, `menus`, `media`, `taxonomy`, `comments`, `products`, `site`, `search`. Typed selectors and capped pagination; no arbitrary SQL, repository methods, or admin projections.
3. **`GET /api/connect/v1/resolve`** — normalized app path → redirect, visible content reference plus head metadata, or not-found.

Add the member pair, newsletter signup, and checkout/order/capture routes only in their slices. `GET /api/connect/v1/embed.js` serves the Jini-built artifact; it is static delivery, not another business API.

Do not render a whole page and scrape its body. Construct a validated marker and reuse [resolveHtmlPageEmbeds:1297](/Users/la/Programming/Tovu/apps/website/src/features/widgets/resolver-service.ts:1297) plus [renderHtmlPageBody:1779](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/http/site/render.ts:1779). HTML-format content additionally needs the recursive pass at [pages.ts:1226](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/pages.ts:1226). Menus require the later navigation stage; the current menu helper’s static-theme restriction must be separated from its reusable resolution logic.

**Visibility is a required addition.** Published lookups exclude drafts/trash, but [post.ts:1824](/Users/la/Programming/Tovu/apps/website/src/features/post/post.ts:1824) does not enforce member access. Inject request-scoped access filtering into every nested lookup, collection, menu target, search result, and media decision. Preserve indistinguishable not-found responses.

Use exact-origin CORS on connector and reused browser endpoints, without credentials. Handle `OPTIONS` before routing/authentication; allow `Authorization`, `Content-Type`, and `Idempotency-Key` where needed. Emit `Vary: Origin`; expose `Retry-After`. Existing localhost CORS is real but incomplete for this use case: [dev-cors.ts:7](/Users/la/Programming/Tovu/apps/website/src/server/inbound/shared/dev-cors.ts:7) lacks authenticated-header support.

Forms use urlencoded bodies and `Accept: application/json`, avoiding preflight when no custom headers are added. They still require server CORS and origin enforcement. [MDN CORS guidance](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)

Cache explicitly public responses with short TTLs/ETags, including app policy version and render options in the key. Authenticated or potentially gated responses use `private, no-store`. Bound fragment bytes, nesting, queries, pagination, and per-origin/IP traffic; retain existing submission limits.

New errors use `{error, code, details?}`. Keep existing error contracts and normalize them in the SDK. Sanitize parsed HTML with allowlists: removing scripts, event handlers, and `javascript:` alone is insufficient. Restrict URLs, frames, SVG, CSS, and form destinations; Shadow DOM is not a security boundary.

## 4. App registration / “attach to admin”

Add **Settings → Connected apps**: name, public app ID, exact allowed origins, callback path, app base path, enabled capabilities, status, and generated script snippet.

Start with a workspace-scoped settings-ledger record per app, behind `ConnectedAppRegistryPort`; avoid a new registry database initially. Existing admin ledger adapters demonstrate this pattern in [settings-tabs.ts:17](/Users/la/Programming/Tovu/apps/admin/src/lib/settings-tabs.ts:17). Use existing authorized settings endpoints and register definitions through the established settings system.

The inspected alternatives do not fit:

- [sites/deps.ts:41](/Users/la/Programming/Tovu/apps/website/src/features/sites/deps.ts:41) manages site-directory installations.
- [deployments/types.ts:19](/Users/la/Programming/Tovu/apps/website/src/features/deployments/types.ts:19) describes deployment connections, with no table writer.
- [origin/ports.ts:40](/Users/la/Programming/Tovu/apps/website/src/features/origin/ports.ts:40) governs canonical, redirect, and egress trust—not browser app permissions.
- [capability-sdk.ts:84](/Users/la/Programming/Tovu/apps/website/src/features/plugin-runtime/capability-sdk.ts:84) scopes installed plugins.

Middleware resolves `appId`, verifies origin and capability, and supplies workspace context. It never accepts a client-selected workspace as authority. Bind member sessions to their app registration.

The public ID selects policy and attribution. It cannot authenticate arbitrary HTTP callers, who can forge `Origin`; member authorization, provider signatures, and abuse controls remain necessary. Do not issue an admin API key to browser apps.

## 5. Auth for members across origins

Use bearer member sessions for connector calls with `credentials: "omit"`. Preserve first-party cookies for existing Tovu-rendered pages; third-party cookies must not determine whether a Vercel app works.

Reuse the existing passwordless services. [write-service.ts:240](/Users/la/Programming/Tovu/apps/website/src/features/members/write-service.ts:240) already returns a raw session token, while the current HTTP completion route exposes only member data and sets a cookie.

Extend sign-in requests with an app-bound login context: registered callback, random state, and verifier challenge. Store that context against the magic-link credential. An injected link builder creates the registered app callback; do not trust the existing free-form `redirectPath` as an external destination.

The app callback validates state, removes the credential from the URL, and exchanges it with the verifier at the existing completion endpoint. Return a bearer session only for that explicit connector flow. Keep cookie completion unchanged.

`me` validates token hash, expiry, revocation, app binding, and current member status. Sign-out revokes the server session using [MemberSessionRepoPort.revoke:86](/Users/la/Programming/Tovu/apps/website/src/features/members/ports.ts:86), then clears client state.

Default bearer storage is memory; offer explicit tab-scoped `sessionStorage` persistence for convenience. Avoid default `localStorage` and add no refresh-token service initially. Connector session lifetime should be configurable rather than inheriting the existing 30-day duration at [write-service.ts:56](/Users/la/Programming/Tovu/apps/website/src/features/members/write-service.ts:56).

Bearer requests lack ambient cookie authority, reducing classic CSRF exposure. Magic-link completion still needs state/verifier binding against login CSRF. Preserve anti-enumeration and existing email/IP rate limits. Cross-device magic-link behavior needs an explicit product decision.

## 6. Payments

Today, [checkout.ts:84](/Users/la/Programming/Tovu/apps/website/src/features/commerce/checkout.ts:84) creates one pending order and price snapshot; it neither charges nor supports carts. Separately, the webhook route passes raw bytes to Lipay, whose [handleWebhook implementation:1060](/Users/la/Programming/Tovu/apps/website/src/features/plugins/lipay/lipay-plugin.ts:1060) verifies through provider adapters and updates payment records. The commerce inbox at [webhook-inbox.ts:76](/Users/la/Programming/Tovu/apps/website/src/features/commerce/webhook-inbox.ts:76) updates orders. No bridge call was found. Production Lipay activation and Stripe/PayPal registrations remain **UNVERIFIED**.

Admin stores provider enablement, test/live mode, public identifiers, price mappings, and secret references. Keep secret material behind `PaymentCredentialsPort`; the existing environment adapter deliberately excludes it from content storage at [credentials.ts:44](/Users/la/Programming/Tovu/apps/website/src/features/plugins/lipay/credentials.ts:44). Workspace-managed credentials need a sealed adapter.

For **Stripe**, `checkout` resolves Tovu prices, creates/reuses a pending order and provider session, and returns the hosted Checkout URL. The handler redirects there. This avoids Elements and Embedded Checkout lifecycle work; Stripe documents server session creation and URL redirection. [Stripe Checkout](https://docs.stripe.com/checkout/quickstart)

For **PayPal**, the handler loads the official JS SDK once. `createOrder` calls shared checkout creation; `onApprove` calls the capture endpoint. Server capture verifies checkout ownership and provider-order correlation. Mount buttons in a runtime-owned light-DOM container: Shadow DOM support is **UNVERIFIED**, so do not depend on it. [PayPal integration](https://developer.paypal.com/platforms/checkout/standard/integrate)

Reusable provider drivers and narrow checkout/capture ports belong in Jini; Tovu supplies credentials, pricing, persistence, and Lipay adapters. Keep the read-only commerce-status runtime separate.

Persist resumable provider action data: Lipay explicitly loses `next` on replay at [lipay-plugin.ts:215](/Users/la/Programming/Tovu/apps/website/src/features/plugins/lipay/lipay-plugin.ts:215). Browser retries must reuse the pending order and checkout, not create duplicates.

Verified settlement must produce a durable, retryable order projection. Add an outbox/settlement port inside the payment transaction, then consume it through the existing commerce inbox. A callback after webhook completion is insufficient: payment deduplication could otherwise prevent retrying a failed order update. Confirm amount, currency, merchant, and authoritative payment status; success-page arrival never marks an order paid.

Ship one-price, member checkout first. Guest identities, multi-item server checkout, subscriptions, tax, and refunds are later slices.

## 7. Routing & redirects

The route endpoint follows Tovu’s existing order: normalization → override redirects → visible content lookup → fallback redirects → not-found, matching [pages.ts:164](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/pages.ts:164).

Return JSON such as `{kind:"redirect", location, statusCode}` instead of issuing HTTP redirects to `fetch`. Reuse the redirect resolver’s destination validation; do not download the entire rule table.

Framework-free code handles route resolution, cancellation, navigation mapping, head updates, and loop bounds. Thin adapters supply `beforeNavigate`, `replace`, and location-change notifications for React Router, Vue Router, or Angular Router. Start with integration recipes; package adapters only when repetition warrants them.

Absolutize form/media/backend URLs against Tovu. Map content navigation through the registered app base; blindly absolutizing every link would send users out of the SPA.

Client head updates cannot create initial HTML metadata or HTTP 301/404 status. SEO-focused apps should prerender visible routes or use their host’s edge/server integration. Keep that optional and choose one canonical public origin.

## 8. `@jini-ai/vibecoding/connect` package shape

Add exports without pulling existing authoring React code into the connector. Current exports and optional React peers are visible in [vibecoding/package.json:28](/Users/la/Programming/Jini/packages/vibecoding/package.json:28).

```text
src/connect/
  core/          config, contracts, ports, request state
  browser/       observer, mounting, URL policy, script bootstrap
  handlers/      html, forms, comments, newsletter, payments
  client/        typed reads, member calls, analytics
  routing/       router port and navigation coordinator
  adapters/      optional framework router adapters
  server/        reusable provider drivers; browser-excluded
```

Build one self-contained `embed.js` from the browser entry. Provider scripts load only when needed. Tovu serves it with host transport defaults and registration metadata:

```html
<script defer src="https://cms.example/api/connect/v1/embed.js"
        data-app-id="app_public_id"></script>
<div data-embed-config='{"type":"form","id":"contact"}'></div>
```

The runtime uses one observer, filtered to marker attributes and added/removed subtrees—not repeated full-document scans. Each marker has WeakMap state, an abort controller, generation token, configuration deduplication, and handler disposal. Document observation does not cover arbitrary shadow trees; allow explicit root registration. [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver/observe)

HTML mounts into an open shadow root. A slot shows authored fallback while loading or failed; successful mounting suppresses it. Provide baseline styles and CSS variables. Bind form listeners inside the shadow root and render field errors accessibly without replacing entered values.

CSR auto-start works after document readiness. For hydrated apps, deferred timing is insufficient: support manual start after hydration.

```ts
const client = createConnectClient(
  { apiBase, appId, ports: { fetch, tokenStore } },
  {}
);
await client.getContent({ slug: "about" }, { signal });
const runtime = createEmbedRuntime({ root: document, client, ports }, {});
runtime.start({}, {});
```

Move generic config parsing from [marker.ts:225](/Users/la/Programming/Tovu/apps/website/src/contracts/core/embeds/marker.ts:225), lifecycle, transport, and URL mechanics to Jini. Keep CMS-specific target interpretation at [marker.ts:633](/Users/la/Programming/Tovu/apps/website/src/contracts/core/embeds/marker.ts:633) in Tovu. The browser reads attributes directly; it does not need the server’s source-offset scanner.

## 9. Build order

Paths below are proposed additions unless linked above. Each slice ships only its capability.

1. **Forms in a Vite React app on another port — S.** Tovu: `features/connect/embed-service.ts`, public `routes/connect/embed.ts`, scoped CORS, composition registration. Jini: config parser, observer, HTML/form handlers, browser bundle. Demo loading, submission, validation, and fallback; verify the admin receives the submission.

2. **Registration and Vue/Angular parity — S/M.** Tovu: registry port/settings adapter and `apps/admin/src/features/connect/ConnectedAppsPanel.tsx`. Jini: script metadata and disposal/manual-start APIs. Demo the same script and marker in all three frameworks. Unblocks production origin policy.

3. **Public menus/content/media/taxonomy — M.** Tovu: expand embed orchestration, extract theme-independent menu resolution, add recursive visibility filtering. Jini: URL mapping and theme variables. Demo an externally hosted app using existing CMS assets and navigation.

4. **Bounded data queries, search, branding, comments — M.** Tovu: query dispatcher/public projections and bounded repository extensions where existing lists are unbounded. Jini: typed client/comments handler. Demo framework-native lists and approved comments; preserve existing submit ingress.

5. **Cross-origin members — M.** Tovu: sign-in context, completion extension, bearer resolution, `me`, sign-out, protected-media tickets. Jini: auth/token port. Demo sign-in and gated content from Vercel. Unblocks member checkout.

6. **Route resolution/head recipes — M.** Tovu: resolve route and shared route-decision extraction. Jini: router/head coordinator and framework recipes. Demo renamed slugs, redirects, cancellation, and metadata updates.

7. **Newsletter and analytics — M.** Tovu: public signup orchestration using real identity/consent bindings; analytics origin attribution. Jini: newsletter handler and tracking client. Demo confirmed signup and one pageview per committed navigation.

8. **Stripe hosted checkout and settlement — L.** Tovu: idempotent order orchestration, Lipay composition, durable settlement bridge, order read. Jini: Stripe driver/handler. Demo a paid order confirmed by webhook, including retries.

9. **PayPal buttons and capture — M/L.** Extend the same orchestration; add PayPal driver, capture operation, and light-DOM mount. Demo approval, capture, webhook convergence, and cleanup on navigation.

10. **Hosting/chat/WebMCP extensions — independently scoped.** Verify existing hosting and visitor APIs first. Add behavior handlers only after their contracts are established. External hosting remains usable throughout.

## 10. Ranked risks and open questions for the owner

1. **Must nested embeds enforce member access from their first release?** Recommended: yes; publication status alone is insufficient.
2. **Can first checkout require member sign-in?** Recommended: yes, matching the existing order model.
3. **Is Stripe-hosted Checkout acceptable initially?** Recommended: yes; defer embedded payment UI.
4. **Which origin owns canonical URLs?** Recommended: select one public app origin per site.
5. **Should sign-in survive reloads?** Recommended: optional tab persistence with bounded sessions.
6. **Must magic links work across devices?** Recommended: defer that convenience until secure handoff behavior is designed.
7. **Should app CSS directly style embeds?** Recommended: CSS variables/parts for HTML, explicit light-DOM mounts for provider widgets.
8. **Does “attach” include deployment management now?** Recommended: no; ship backend attachment first and verify Tovu hosting separately.