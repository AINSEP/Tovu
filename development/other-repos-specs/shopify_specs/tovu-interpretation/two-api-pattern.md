# Shopify Two-API Pattern

## Summary

Shopify exposes two separate GraphQL APIs with different access levels, audiences, and capabilities:
- **Storefront API**: public, read-heavy, for buyers and storefronts
- **Admin API**: authenticated, full CRUD, for merchants and apps

This is not just an auth difference — the APIs expose different types, different fields, and different operations.

## Storefront API

**Audience**: Buyers, storefronts, headless frontends, mobile apps

**Authentication**:
- Tokenless access (limited to 1,000 complexity)
- Public access tokens (browser/mobile)
- Private access tokens (server-side, Hydrogen)

**Capabilities**:
- Browse products, collections, pages, blogs, articles
- Manage carts (read + write)
- Search
- Access metafields/metaobjects (with token)
- Customer data (with customer access token)

**Rate limiting**: No request count limits. Complexity-based throttling. Tokenless capped at 1,000 complexity.

**Endpoint**: `https://{store}.myshopify.com/api/{version}/graphql.json`

## Admin API

**Audience**: Merchants, apps, integrations

**Authentication**: Required. `X-Shopify-Access-Token` header. OAuth-scoped.

**Capabilities**: Everything — full CRUD on all resources including:
- Products, collections, orders, customers, inventory
- Metafield definitions and values
- Theme management
- Webhook subscriptions
- Discounts, shipping, fulfillment
- Analytics, apps, billing

**Rate limiting**: Cost-based (separate from Storefront API)

**Endpoint**: `https://{store}.myshopify.com/admin/api/{version}/graphql.json`

## Key Differences

| Aspect | Storefront | Admin |
|--------|-----------|-------|
| Auth required | Optional | Always |
| Write operations | Carts only | Everything |
| Scope model | Token type | OAuth scopes |
| Audience | Public buyers | Privileged operators |
| Versioned | Yes (quarterly) | Yes (quarterly) |
| Schema size | Smaller subset | Full (3,269 types) |

## Boundaries and Constraints

- The Storefront API deliberately excludes admin operations. You cannot create products, manage inventory, or configure the store through it.
- Some fields (tags, metaobjects, customer data, total inventory) require a token even on the Storefront API.
- API versions are released quarterly and supported for ~12 months.
- The two APIs share entity concepts but may expose different fields on the same entity.

## Tovu Reconstruction Notes

### Why this exists
Shopify separates public reads from privileged writes because the security, caching, and scaling requirements are fundamentally different. The storefront serves millions of buyers with read-heavy traffic. The admin serves thousands of merchants with write-heavy operations. Different APIs mean different auth, different rate limits, different caching strategies.

### What Tovu should preserve
- **Separate route namespaces for public vs admin**: Tovu already has `src/server/routes/content/` (public reads) and `src/server/routes/admin/` (authenticated writes). This is the same pattern.
- **Different auth requirements**: public content routes should work without auth. Admin routes require authentication and authorization.
- **Scope-based permissions**: admin operations should be scoped (can this token edit posts? manage users? change themes?).
- **API versioning**: Shopify versions quarterly. Tovu should version its API from the start to avoid breaking consumers.

### What Tovu can simplify
- Tovu doesn't need two completely separate GraphQL schemas. REST or a single schema with field-level auth can achieve the same separation.
- Tovu doesn't need complexity-based rate limiting initially — request-count limits are fine for a young platform.
- Tovu doesn't need the OAuth app installation flow — start with API keys.

### Possible Tovu seams
- `src/server/routes/content/` = Tovu's "Storefront API" equivalent (public, read-only)
- `src/server/routes/admin/` = Tovu's "Admin API" equivalent (authenticated, read-write)
- A middleware layer that enforces scope-based access on admin routes
- A versioning prefix on all routes (`/api/v1/content/...`, `/api/v1/admin/...`)

### Suggested priority
Medium — Tovu already has the route separation. The missing pieces are auth middleware, scoped permissions, and versioning.
