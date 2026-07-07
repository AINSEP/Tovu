# Pricing Module

## 1. Summary of the Subsystem

Medusa's `pricing` module owns price records, contextual price selection, and scheduled price-list overlays. It does not own discounts, taxes, or product catalog records.

Visible source anchors:

- `packages/modules/pricing/src/`
- `packages/core/core-flows/src/pricing/`
- `packages/core/core-flows/src/price-list/`
- `packages/core/core-flows/src/fulfillment/steps/set-shipping-options-prices.ts`
- `packages/medusa/src/api/admin/price-lists/`
- `packages/medusa/src/api/admin/price-preferences/`

The module is a pricing engine plus persistence layer. It decides which base price applies for a given context, while promotions and taxes are layered elsewhere.

## 2. Key Primitives / Contracts

The visible model family is:

- `PriceSet`
- `Price`
- `PriceRule`
- `PriceList`
- `PriceListRule`
- `PricePreference`

The model relationships make the intent fairly clear:

- `PriceSet` is the stable container for a family of prices.
- `Price` carries currency, amount, quantity windows, and optional membership in a price list.
- `PriceRule` adds attribute/value/operator matching to an individual price.
- `PriceList` adds scheduled or status-gated overlays with their own rules.
- `PriceListRule` scopes an entire list by context attributes.
- `PricePreference` stores attribute/value preferences such as tax-inclusivity policy.

The service layer shows two important behaviors:

- ordinary CRUD for prices, lists, rules, and preferences
- `calculatePrices`, which resolves the right price for a requested context

The repository implementation is the key evidence for how Medusa thinks about pricing:

- `currency_code` is mandatory in pricing context
- `quantity` is treated as a first-class selector
- arbitrary rule context is flattened into key/value pairs
- active price lists are filtered by status plus `starts_at` / `ends_at`
- rule matching is pushed into SQL rather than done only in memory

The repository also caches known pricing attributes when the context gets large, which suggests Medusa expects contextual pricing to grow beyond trivial `region_id` cases.

The joiner config exposes the module through:

- `PriceSet`
- `PriceList`
- `Price`
- `PricePreference`

That means pricing is queryable as a first-class module boundary rather than only as embedded variant fields.

## 3. Boundaries and Constraints

Pricing does not own:

- product or variant identity
- promotion and discount composition
- inventory availability
- tax-region calculation

That split is visible in both models and workflows:

- variants and shipping options link to price sets
- promotions compute adjustments after base price resolution
- taxes are calculated from tax regions and rates, not from pricing rules

The `set-shipping-options-prices` workflow step is especially revealing. Shipping options do not own raw price columns themselves; the workflow fetches linked price sets, converts region-specific inputs into pricing rules, updates the pricing module, and keeps rollback data for reversal.

So Medusa's pricing module is not "the place where money lives." It is the place where base commercial prices are stored and selected.

## 4. Operational Implications

- Catalog and fulfillment surfaces can share one pricing substrate through `PriceSet`.
- Context-driven pricing can be extended without rewriting product or cart ownership.
- Scheduled sales or overrides can be activated by list state and date windows instead of code changes.
- HTTP handlers stay thin because create/update/delete price-list routes hand work to workflows and then refetch through query config.

The tradeoff is complexity in price resolution:

- more rule matching logic
- more cross-module links
- a harder distinction between "base price", "promotion", and "tax"

That complexity looks intentional. Medusa is preserving pricing as its own bounded context instead of burying it under products.

## 5. Tovu Reconstruction Notes

### Why this exists

This matters because Tovu should treat pricing as a reusable commerce service, not as a field attached directly to content or SKU records.

### What Tovu should preserve

- a `PriceSet`-like indirection for things that need prices
- contextual price selection driven by explicit rule inputs
- scheduled list or override layers separate from baseline prices
- distinct boundaries between pricing, promotions, and tax

### What Tovu can simplify

- start with fewer supported pricing attributes
- keep SQL rule matching narrow until real pricing complexity appears
- postpone price preferences until tax-inclusivity or market policy actually needs them

### Possible Tovu seams

- `PricingModulePort`
- `PriceSetLinkPort`
- `PriceResolutionContext`
- `PricePreferencePolicy`

### Suggested priority

- `V1`: preserve price-set indirection and contextual selection
- `V2`: add richer scheduled price lists and broader rule matching only when merchants need them
