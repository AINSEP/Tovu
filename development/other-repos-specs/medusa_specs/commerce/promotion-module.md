# Promotion Module

## 1. Summary of the Subsystem

Medusa's `promotion` module owns discount programs, rule targeting, campaign grouping, and budget tracking. It does not replace base pricing.

Visible source anchors:

- `packages/modules/promotion/src/`
- `packages/core/core-flows/src/promotion/`
- `packages/medusa/src/api/admin/promotions/`
- `packages/medusa/src/api/admin/campaigns/`
- `packages/medusa/src/api/store/carts/[id]/promotions/route.ts`

This module is where Medusa models "why a discount applies" and "how it should adjust a cart," not where it stores canonical product prices.

## 2. Key Primitives / Contracts

The visible model family is:

- `Promotion`
- `ApplicationMethod`
- `PromotionRule`
- `PromotionRuleValue`
- `Campaign`
- `CampaignBudget`
- `CampaignBudgetUsage`

Those models break promotion logic into a few distinct layers:

- `Promotion` holds code, automatic/manual status, type, usage limit, tax-inclusivity flag, and lifecycle status.
- `ApplicationMethod` defines how the promotion applies: value, type, target type, allocation, quantity limits, buy rules, and target rules.
- `PromotionRule` and `PromotionRuleValue` describe the conditions that make a promotion applicable.
- `Campaign` groups promotions into time-bounded commercial programs.
- `CampaignBudget` and `CampaignBudgetUsage` track spend or usage ceilings, including per-attribute usage such as customer-specific limits.

The service implementation exposes several important behaviors:

- `listActivePromotions` filters by promotion status and by campaign date windows
- budget usage is incremented and reverted transactionally
- promotion creation and updates validate application-method shape and rule compatibility

The compute-action utilities show how Medusa actually turns promotions into cart effects:

- `line-items.ts` computes line-item adjustments
- `shipping-methods.ts` computes shipping adjustments
- `buy-get.ts` handles buy-X-get-Y style logic
- `usage.ts` emits budget-exceeded actions when a campaign cap is reached

One especially important detail is `build-promotion-rule-query-filter-from-context.ts`. Before Medusa computes discount actions, it tries to exclude impossible promotions in SQL by comparing promotion rules against flattened cart or customer context. That means promotions are not only a post-query in-memory filter; they are treated as a potentially large search problem.

## 3. Boundaries and Constraints

Promotions do not own:

- baseline money values for variants or shipping options
- tax-rate calculation
- order settlement or payment capture
- cart identity and persistence as a whole

Instead they produce adjustment intent against adjacent surfaces:

- line items
- order-wide totals
- shipping methods
- promo-code application on carts

The validators make the policy surface explicit:

- buy-get promotions require buy rules and quantity configuration
- automatic promotions cannot also carry manual usage limits
- application method target types and allocations are tightly constrained

This is a different boundary from pricing. Pricing picks the base number; promotions compute delta actions against that number.

## 4. Operational Implications

- Merchants get both code-based and automatic promotions.
- Campaigns can group multiple promotions under one scheduled commercial umbrella.
- Budget enforcement can happen at overall or per-attribute scope.
- Cart application can stay workflow-driven because store routes only add, replace, or remove promo codes and then refetch the cart.

The tradeoff is rule-system complexity:

- more validation branches
- more context flattening and prefiltering
- more edge cases around quantity allocation and overlapping discounts

That complexity is not accidental. Medusa treats promotions as their own subsystem rather than as an if-statement attached to price selection.

## 5. Tovu Reconstruction Notes

### Why this exists

This matters because Tovu should keep discount programs separate from baseline pricing and separate again from workflow settlement.

### What Tovu should preserve

- a dedicated promotion domain
- explicit application-method types and targets
- rule-based targeting instead of ad hoc coupon code logic
- campaign and budget concepts if merchant programs need them

### What Tovu can simplify

- start with manual code promotions plus one automatic class
- postpone campaign-budget usage-by-attribute until real merchant demand appears
- support fewer allocation strategies at first

### Possible Tovu seams

- `PromotionModulePort`
- `PromotionEligibilityEngine`
- `PromotionComputationPort`
- `CampaignBudgetPolicy`

### Suggested priority

- `V1`: code promotions, automatic promotions, item and shipping adjustments
- `V2`: richer buy-get logic and per-attribute budget enforcement
