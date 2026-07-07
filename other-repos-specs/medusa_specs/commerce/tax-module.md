# Tax Module

## 1. Summary of the Subsystem

Medusa's `tax` module owns tax regions, tax rates, tax-rate rules, and provider-backed tax-line generation. It does not own baseline pricing or discount computation.

Visible source anchors:

- `packages/modules/tax/src/`
- `packages/core/core-flows/src/tax/`
- `packages/medusa/src/api/admin/tax-regions/`
- `packages/medusa/src/api/admin/tax-rates/`
- `packages/medusa/src/api/admin/tax-providers/`
- `packages/medusa/src/api/store/carts/[id]/taxes/route.ts`

This is a rule-and-provider subsystem. Medusa first resolves which rates apply, then hands those rates to a tax provider that produces tax lines.

## 2. Key Primitives / Contracts

The visible model family is:

- `TaxProvider`
- `TaxRegion`
- `TaxRate`
- `TaxRateRule`

The relationships show a layered tax model:

- `TaxRegion` represents a country or province scope and can be nested parent to child.
- top-level tax regions point at a provider
- `TaxRate` belongs to a tax region and can be default or combinable
- `TaxRateRule` narrows a rate to references such as `product`, `product_type`, or `shipping_option`

The service implementation reveals several important behaviors:

- creating a tax region can also create its `default_tax_rate`
- province regions must belong to a parent region with the same country code
- tax calculation normalizes country and province codes before lookup
- rate selection first finds candidate rates, then prioritizes the best match per item
- combinable child-region rates can bring in the parent-region rate as well

Provider loading is also explicit:

- the module loads local providers plus configured custom providers
- providers are registered into the container under `tp_<identifier>`
- provider enablement is synchronized into the database

The built-in `system` provider is revealing because it does very little magic. It simply converts already-resolved item and shipping rates into tax lines. That suggests Medusa separates "which rates apply" from "how a provider formats or computes the final lines."

## 3. Boundaries and Constraints

Tax does not own:

- base prices
- promotions and discount eligibility
- orders or carts as persistent aggregates
- product catalog identity outside rule references

Instead it consumes adjacent identifiers:

- cart items and shipping lines for tax calculation
- product, product type, and shipping option references for rate rules

The store surface shows the boundary clearly. Calculating cart taxes is a workflow-triggered action on carts, not a raw public tax CRUD API.

## 4. Operational Implications

- Tax behavior can vary by region hierarchy instead of one flat country table.
- Providers can be swapped or extended without changing tax-region ownership.
- Default rates and rule-based rates can coexist.
- A province rate can combine with a parent-country rate when policy requires layered taxation.

The tradeoff is another separate decision engine:

- address normalization
- candidate-rate selection
- provider dispatch
- rule references that must stay aligned with other modules

That complexity is justified. Tax is too jurisdiction-sensitive to bury under generic price fields.

## 5. Tovu Reconstruction Notes

### Why this exists

This matters because Tovu should model tax as a provider-backed policy subsystem, not as a percentage field on products or markets.

### What Tovu should preserve

- tax-region hierarchy
- default plus rule-targeted rates
- provider registration as a clear seam
- separate tax-line calculation from price and promotion resolution

### What Tovu can simplify

- start with one system provider
- support only country-level regions first if province-level rules are not required
- keep rule references narrow until shipping-option and product-type tax cases are real

### Possible Tovu seams

- `TaxModulePort`
- `TaxProviderRegistry`
- `TaxRateSelectionPolicy`
- `TaxLineCalculationPort`

### Suggested priority

- `V1`: hierarchical regions, default rates, one provider seam, cart tax recalculation
- `V2`: richer rule references and multi-provider strategies
