# Y5 pub G3 binding residuals

These retained public HTTP files contain host data and expression bindings to Jini; lifecycle decisions remain in the package entries.

| path | LOC | residual |
|---|---|---|
| `apps/website/src/server/inbound/public-http/middleware/site-serving-gate.ts` | 58 | Recovery allowlist, fixed 503 copy, and dispatcher registration |
| `apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts` | 194 | One HTTP instance and document owner; filesystem, raw parsers, request/writer, diagnostics, clock and timer bindings |
| `apps/website/src/server/inbound/public-http/routes/members/oidc-callback.ts` | 61 | Callback factory, request-bound protocol/cookie/analytics ports, and existing GET app view |
| `apps/website/src/server/inbound/public-http/routes/members/oidc-verify-email.ts` | 53 | Proof factory, preflight app view, protocol and cookie/analytics ports |
| `apps/website/src/server/inbound/public-http/routes/members/unlink-identity.ts` | 43 | Unlink factory, preflight app view, live repo/limiter/cookie ports |
| `apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts` | 72 | Media factory with lazy evidence/member ports and the two route registrations |
| `apps/website/src/server/inbound/public-http/routes/site/member-pages.ts` | 70 | Member-page factory with original copy/paths/IDs and page-serving registration |
| `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/home.ts` | 52 | Home registration with listing, redirect, member, theme and render ports |
| `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/slug-routes.ts` | 69 | Slug/nested registrations and Jini error dispatch with host 404 copy and writers |
| `apps/website/src/server/inbound/public-http/routes/site/pages/response.ts` | 111 | Visitor-policy and page-send calls with wire names, markup and request/writer ports |
| `apps/website/src/server/inbound/public-http/routes/site/pages/static-tier.ts` | 91 | Static finish/index calls with theme, embeds, menus, title, chat and delivery ports |
| `apps/website/src/server/inbound/public-http/routes/site/products.ts` | 92 | Storefront list/detail registrations with catalog, readiness, theme, checkout and fault ports |

## Keep rules

```text
^apps/website/src/server/inbound/public\-http/middleware/site\-serving\-gate\.ts$
^apps/website/src/server/inbound/public\-http/middleware/site\-cookie\-consent\.ts$
^apps/website/src/server/inbound/public\-http/routes/members/oidc\-callback\.ts$
^apps/website/src/server/inbound/public\-http/routes/members/oidc\-verify\-email\.ts$
^apps/website/src/server/inbound/public\-http/routes/members/unlink\-identity\.ts$
^apps/website/src/server/inbound/public\-http/routes/site/media\-rendition\.ts$
^apps/website/src/server/inbound/public\-http/routes/site/member\-pages\.ts$
^apps/website/src/server/inbound/public\-http/routes/site/pages/handlers/home\.ts$
^apps/website/src/server/inbound/public\-http/routes/site/pages/handlers/slug\-routes\.ts$
^apps/website/src/server/inbound/public\-http/routes/site/pages/response\.ts$
^apps/website/src/server/inbound/public\-http/routes/site/pages/static\-tier\.ts$
^apps/website/src/server/inbound/public\-http/routes/site/products\.ts$
```
