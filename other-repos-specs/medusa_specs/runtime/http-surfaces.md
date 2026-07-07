# HTTP Surfaces

## 1. Summary of the Subsystem

Medusa exposes several distinct HTTP zones under `packages/medusa/src/api/`:

- `admin/`
- `store/`
- `auth/`
- `hooks/`
- `cloud/`
- shared `utils/` and middleware layers

This is a visible product-boundary decision, not just a routing convenience.

The platform clearly distinguishes:

- privileged operator and management actions
- storefront/customer-facing commerce actions
- authentication and session flows
- provider hook ingress
- cloud-specific routes that are not central to the open-core commerce model

## 2. Key Primitives / Contracts

### Admin surface

The admin API exposes broad write and operational control across domains such as:

- products, categories, collections, variants
- orders, order edits, returns, claims, exchanges
- customers and customer groups
- price lists and price preferences
- regions, stock locations, shipping profiles, shipping options
- promotions and campaigns
- users, invites, RBAC, api keys
- translations, settings views, workflow executions

### Store surface

The store API focuses on public or customer-facing flows such as:

- products, categories, collections, tags, types
- carts
- shipping options
- payment collections and payment providers
- customers and customer addresses
- regions, locales, currencies
- orders and returns

### Auth surface

The auth API is split by actor type and auth provider, with session and token flows.

### Hooks surface

The hooks API includes provider callback entrypoints such as payment hooks.

### Route shape

Many route folders share a repeated pattern:

- `route.ts`
- `validators.ts`
- `query-config.ts`
- `middlewares.ts`
- optional `helpers.ts`

That pattern suggests a disciplined contract between transport, validation, query shape, and handler logic.

## 3. Boundaries and Constraints

- Admin and store are not one undifferentiated API.
- Store responses are shaped through query config and restricted-field policy.
- Auth providers are parameterized by actor type and provider name.
- Hook ingress is separated from normal API flows.
- Plugin routes are loaded before core routes, allowing controlled extension or override behavior.

This creates a strong "multiple contracts for different trust levels" architecture.

## 4. Operational Implications

- Public/store consumers can be constrained differently from admin operators.
- Route-level query shaping can prevent accidental overexposure of fields.
- Provider-specific callbacks can be isolated operationally.
- Extension routing power must be governed because route precedence is intentionally flexible.

## 5. Tovu Reconstruction Notes

### Why this exists

This subsystem matters because Tovu should not expose one flat API surface to every caller. Different trust levels need different contracts, failure handling, and data exposure rules.

### What Tovu should preserve

- separate public/read and privileged/operator HTTP surfaces
- distinct auth and callback ingress surfaces
- validation and query-shaping layers independent of raw handlers
- policy-aware field restriction on public contracts

### What Tovu can simplify

- fewer route folders if the same trust-boundary discipline can be preserved with less ceremony
- a narrower set of HTTP surfaces if Tovu starts with less hosted-integration complexity

### Possible Tovu seams

- `PublicApiSurface`
- `OperatorApiSurface`
- `AuthIngressSurface`
- `ProviderCallbackSurface`
- `QueryExposurePolicy`

### Suggested priority

- `V1`: separate public and operator surfaces
- `V2`: add more formal callback ingress and field-restriction policy layers
