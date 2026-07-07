# Shopify Research TODO

## Completed

- [x] Sign up at https://partners.shopify.com
- [x] Create development store: `ai-powered-furniture-sales.myshopify.com`
- [x] Install Shopify CLI, authenticate store
- [x] Dump full Admin API schema introspection (3,269 types)
- [x] Create sample products with variants, options, metafields
- [x] Create sample collection with linked products
- [x] Save sample API responses (products, collections, pages, blogs, shop)
- [x] Extract 28 public doc files to public-api-surface/
- [x] Write interpretation docs: commerce primitives, custom data, merchant editing, two-API, extensibility, webhooks
- [x] Write coverage-audit.md and index.md

## Collection principles

- [ ] Use only public Shopify docs, Shopify CLI output, dev stores, scoped API tokens, generated app/extension scaffolds, webhook deliveries, screenshots, and sample responses.
- [ ] Do not claim or infer private Shopify internals such as database design, service topology, queue architecture, fraud/risk systems, or proprietary deployment systems.
- [ ] Mark every plan-gated item clearly, especially Shopify Plus checkout placements and Shopify Functions custom-app limitations.
- [ ] Keep raw evidence separate from interpretation:
  - `public-api-surface/` for official-doc extracts.
  - `schema-dumps/` for API introspection JSON.
  - `sample-responses/` for API responses and webhook payloads.
  - `screenshots/` for admin/theme/checkout UI captures.
  - `cli-captures/` for generated trees, terminal output, deploy logs, and failure output.
- [ ] After each capture pass, update `coverage-audit.md` and `index.md`.

## Priority order

1. Storefront API schema diff.
2. Checkout UI extension scaffold and target matrix.
3. Shopify Functions scaffold and real input/output samples.
4. Admin UI screenshots and workflow notes.
5. Webhook payload captures.
6. Failure-mode captures.
7. Extension app file tree and deploy lifecycle.
8. Theme editor artifacts.
9. Discount/pricing and fulfillment state machines.
10. Hydrogen data loading and caching patterns.

## Next acquisition passes

### P0: Storefront API schema dump and Admin diff

- [ ] Create or confirm a Storefront access token for the dev store.
- [ ] Record the exact unauthenticated Storefront scopes granted to the app.
- [ ] Dump the full Storefront API GraphQL schema.
- [ ] Save the raw schema to `schema-dumps/storefront-api-full-schema.json`.
- [ ] Save the command used and auth/scopes notes to `cli-captures/storefront-schema-capture.md`.
- [ ] Diff Storefront API vs Admin API:
  - public read-only entities.
  - fields hidden from public access.
  - operations allowed without a token.
  - operations requiring public/private Storefront token.
  - customer-token-only operations.
  - cart write operations exposed publicly.
- [ ] Write interpretation notes in `tovu-interpretation/two-api-pattern.md` or a new `storefront-admin-schema-diff.md`.
- [ ] Tovu use: define public content API vs privileged admin API boundaries, auth rules, caching expectations, and scope tests.
- Source refs:
  - https://shopify.dev/docs/api/storefront/2025-04
  - https://shopify.dev/docs/api/usage/authentication
  - https://shopify.dev/docs/api/admin-rest/latest/resources/storefrontaccesstoken

### P0: Checkout UI extension scaffold and target matrix

- [ ] Generate a checkout UI extension with Shopify CLI.
- [ ] Save the generated app/extension file tree to `cli-captures/checkout-ui-extension-tree.md`.
- [ ] Save the generated `shopify.extension.toml` or equivalent config.
- [ ] Capture all configured targets and supported target APIs.
- [ ] Capture the target matrix:
  - static targets.
  - block targets.
  - default placements.
  - checkout placement references.
  - thank-you placement references.
  - order-status/customer-account placement references.
- [ ] Capture extension capabilities:
  - `api_access`.
  - `block_progress`.
  - `network_access`.
  - buyer-consent capabilities.
  - metafields readable by target.
- [ ] Capture local preview behavior from `shopify app dev`.
- [ ] Screenshot checkout editor placement behavior where available.
- [ ] Capture bundle size output and the 64 KB compressed bundle constraint.
- [ ] Capture at least three failure cases:
  - unsupported target.
  - missing capability.
  - oversized bundle or invalid config.
- [ ] Mark Plus-gated behavior clearly. Some checkout placements require Shopify Plus.
- [ ] Tovu use: design safe extension targets, host-rendered UI constraints, extension capability declarations, and checkout-equivalent high-risk surface policy.
- Source refs:
  - https://shopify.dev/docs/api/checkout-ui-extensions/latest
  - https://shopify.dev/docs/api/checkout-ui-extensions/latest/targets
  - https://shopify.dev/docs/apps/build/checkout/test-checkout-ui-extensions
  - https://shopify.dev/docs/apps/build/app-extensions/configure-app-extensions

### P0: Shopify Functions scaffold and real input/output samples

- [ ] Generate at least one Shopify Function extension.
- [ ] Prefer captures for discount, validation, cart transform, or delivery customization.
- [ ] Save generated file tree to `cli-captures/functions-extension-tree.md`.
- [ ] Save generated config files, GraphQL input query files, source files, and generated types.
- [ ] Capture the exact GraphQL input query shape.
- [ ] Capture real input JSON from a local run or documented test fixture.
- [ ] Capture valid output JSON.
- [ ] Capture invalid output JSON and Shopify/CLI error behavior.
- [ ] Capture runtime constraints:
  - Wasm requirement.
  - supported languages/templates.
  - direct URL invocation is not allowed.
  - execution is triggered by Shopify during cart/checkout/customer journey.
  - performance guidance and Rust recommendation.
- [ ] Capture deployment/versioning behavior.
- [ ] Mark plan-gated behavior clearly. Some Function APIs and custom-app Function usage are Shopify Plus-gated.
- [ ] Tovu use: design safe hosted logic, input-query scoping, output-only mutation intent, sandbox limits, and bad-output acceptance tests.
- Source refs:
  - https://shopify.dev/docs/apps/functions
  - https://shopify.dev/docs/apps/build/functions/programming-languages/webassembly-for-functions

### P0: Admin UI screenshots and workflow notes

- [ ] Create `screenshots/admin-ui/`.
- [ ] Capture product list and product edit screens.
- [ ] Capture product variants/options UI.
- [ ] Capture collection creation and product assignment.
- [ ] Capture page creation/edit UI.
- [ ] Capture blog/article creation/edit UI if available.
- [ ] Capture media/file picker behavior.
- [ ] Capture SEO fields on content/commerce entities.
- [ ] Capture theme editor home state.
- [ ] Capture theme editor section add/remove/reorder/hide workflows.
- [ ] Capture block add/remove/reorder/hide workflows.
- [ ] Capture Settings > Custom data / metafield definitions.
- [ ] Capture metaobject definition and entry workflows.
- [ ] Capture app install/scopes consent screen.
- [ ] Capture app extension placement in admin/theme/checkout surfaces where available.
- [ ] Write workflow notes:
  - field grouping.
  - validation errors.
  - autosave or save behavior.
  - preview behavior.
  - empty states.
  - guardrails that stop merchants from breaking critical paths.
- [ ] Tovu use: admin-shell specs, page composition UX, custom-field admin rendering, app scope consent, and operator-friction backlog.

### P0: Webhook payload captures

- [ ] Create a public HTTPS endpoint or local tunnel for webhook testing.
- [ ] Subscribe through app config where possible.
- [ ] Subscribe through GraphQL Admin API where shop-specific behavior is needed.
- [ ] Save webhook subscription config and API mutations to `cli-captures/webhook-subscriptions.md`.
- [ ] Capture payloads and headers for:
  - product create/update/delete.
  - collection create/update/delete.
  - page create/update/delete or publish-equivalent change.
  - theme publish/update.
  - metafield definition create/update/delete.
  - metaobject create/update/delete.
  - app uninstall.
  - order create/update/paid/fulfilled/cancelled if sample orders are available.
  - inventory level update if sample inventory is available.
- [ ] Save raw payloads under `sample-responses/webhooks/`.
- [ ] Save headers with each payload:
  - topic.
  - shop domain.
  - webhook ID.
  - triggered timestamp.
  - HMAC header.
- [ ] Capture retry behavior and delivery logs when an endpoint fails.
- [ ] Document HMAC verification requirements.
- [ ] Tovu use: event catalog, outbox/webhook delivery contracts, idempotency tests, retry policy, and external integration safety.
- Source refs:
  - https://shopify.dev/docs/apps/build/webhooks/subscribe
  - https://shopify.dev/docs/apps/build/webhooks/subscribe/https
  - https://shopify.dev/docs/apps/webhooks

### P0: Failure-mode captures

- [ ] Missing Admin API scope.
- [ ] Missing Storefront scope.
- [ ] Expired/invalid API token.
- [ ] Invalid GraphQL mutation input.
- [ ] Deprecated mutation warning or replacement guidance.
- [ ] Invalid metafield type.
- [ ] Metafield definition conflict.
- [ ] Metaobject invalid field definition.
- [ ] Unsupported checkout target.
- [ ] Checkout extension missing required capability.
- [ ] Oversized checkout extension bundle.
- [ ] Bad Shopify Function output.
- [ ] Function input query too broad or invalid.
- [ ] Webhook endpoint returns non-2xx.
- [ ] Webhook HMAC verification failure.
- [ ] API rate limit or query-cost pressure.
- [ ] Theme JSON template validation failure.
- [ ] Section/block schema validation failure.
- [ ] Save each failure as:
  - command or UI action performed.
  - expected failure.
  - actual error text.
  - screenshot or terminal capture.
  - what Tovu should test or prevent.
- [ ] Tovu use: acceptance tests, validation contracts, recovery UX, and agent test packets.

### P1: Extension app file tree and deploy lifecycle

- [ ] Generate a normal app shell with Shopify CLI.
- [ ] Generate an extension-only app if useful.
- [ ] Generate these extension types where available:
  - admin UI extension.
  - checkout UI extension.
  - theme app extension.
  - customer account UI extension.
  - web pixel.
  - Shopify Function.
- [ ] Save generated file trees under `cli-captures/extension-file-trees/`.
- [ ] Save all generated TOML/config files.
- [ ] Capture `shopify app dev` output.
- [ ] Capture `shopify app deploy` output.
- [ ] Capture app versioning behavior.
- [ ] Capture how extensions version together with the app.
- [ ] Capture app scope errors and install consent behavior.
- [ ] Capture app uninstall cleanup behavior where visible.
- [ ] Tovu use: extension manifest design, plugin development workflow, versioning, deploy gates, and extension compatibility checks.
- Source refs:
  - https://shopify.dev/docs/api/shopify-cli/app/app-generate-extension
  - https://shopify.dev/docs/apps/build/app-extensions
  - https://shopify.dev/docs/apps/build/app-extensions/configure-app-extensions

### P1: Theme editor artifacts

- [ ] Create `sample-responses/theme-editor/` or `cli-captures/theme-editor/`.
- [ ] Create or modify a JSON template in a dev theme.
- [ ] Add, remove, reorder, and hide sections through the editor.
- [ ] Add, remove, reorder, and hide blocks through the editor.
- [ ] Capture the resulting JSON template.
- [ ] Capture `settings_data.json` changes if accessible.
- [ ] Capture section schema examples.
- [ ] Capture block schema examples.
- [ ] Capture app block config where available.
- [ ] Capture rendered storefront output before and after editor changes.
- [ ] Capture validation failures:
  - too many sections.
  - unsupported section/block type.
  - invalid setting type/value.
  - missing preset behavior.
- [ ] Tovu use: presentation specs, JSON-template model, section/block registries, settings schema validation, and theme editor UX.

### P1: Discount/pricing and fulfillment state machines

- [ ] Only do this pass if Tovu is likely to build a serious commerce plugin.
- [ ] Capture discount objects and mutation surfaces from Admin API schema.
- [ ] Capture discount creation/update UI screenshots.
- [ ] Capture discount application behavior in cart/checkout where possible.
- [ ] Capture pricing fields on products/variants:
  - price.
  - compare-at price.
  - price ranges.
  - unit price.
  - quantity price breaks.
- [ ] Capture fulfillment/order lifecycle fields:
  - order financial status.
  - fulfillment status.
  - fulfillment orders.
  - cancellation.
  - partial fulfillment.
  - refund/return where available.
- [ ] Capture sample order/draft order data using a dev store and test gateway only.
- [ ] Write state-machine notes:
  - states.
  - allowed transitions.
  - irreversible transitions.
  - async events/webhooks.
  - failure and retry behavior.
- [ ] Tovu use: future commerce plugin boundaries, order ledger, checkout reliability harness, and state-machine tests.

### P1: Hydrogen data loading and caching patterns

- [ ] Generate or inspect a current Hydrogen storefront.
- [ ] Save generated file tree to `cli-captures/hydrogen-file-tree.md`.
- [ ] Capture route conventions.
- [ ] Capture data loading patterns.
- [ ] Capture Storefront API client setup.
- [ ] Capture cart handling.
- [ ] Capture caching directives and cache invalidation assumptions.
- [ ] Capture deployment assumptions for Oxygen or alternative hosting.
- [ ] Capture error/loading boundary behavior.
- [ ] Tovu use: first-party headless storefront runtime, public API caching model, and route/data-loader contracts.

### P2: Deeper public-doc extraction

- [ ] Liquid full object reference.
- [ ] Liquid filters complete list.
- [ ] Liquid tags complete list.
- [ ] Polaris component catalog.
- [ ] Polaris design tokens and layout conventions.
- [ ] Customer accounts API and UI extensions.
- [ ] Shopify Flow triggers/actions/templates.
- [ ] Markets/localization concepts.
- [ ] Redirect/navigation/menu surfaces.

### P2: Existing Admin schema analysis cleanup

- [ ] Extract all top-level Query fields from `schema-dumps/admin-api-full-schema.json`.
- [ ] Extract all top-level Mutation fields from `schema-dumps/admin-api-full-schema.json`.
- [ ] Count schema types by domain prefix.
- [ ] Document capability interfaces:
  - `Node`.
  - `HasMetafields`.
  - `HasEvents`.
  - `Publishable`.
  - `Navigable`.
  - `Media`.
  - `File`.
- [ ] Document connection pagination pattern in more detail.
- [ ] Extract mutation input/output naming conventions.
- [ ] Tovu use: GraphQL or REST command naming, connection pagination helpers, capability interfaces, and generated contract tests.

## Agent build packet outputs

- [ ] Convert `custom-data-model.md` into a Tovu M1 spec for `src/features/custom-data/`.
- [ ] Convert `custom-data-model.md` into an M2 ADR for typed metafields/metaobjects and ownership rules.
- [ ] Convert `merchant-editing-model.md` into a Tovu M1 spec for section/block composition in `src/features/presentation/`.
- [ ] Convert `two-api-pattern.md` plus Storefront/Admin schema diff into API boundary specs for public content routes and admin routes.
- [ ] Convert extension captures into a Tovu M1 spec for constrained extension points.
- [ ] Convert webhook captures into a Tovu event catalog and external webhook delivery spec.
- [ ] For each spec, add M3 test-contract notes:
  - contract tests for ports.
  - integration tests for critical flows.
  - failure-mode tests from captured Shopify errors.
  - rollback or safe-disable behavior where relevant.
