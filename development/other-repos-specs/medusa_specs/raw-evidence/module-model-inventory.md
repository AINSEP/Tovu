# Module Model Inventory

Curated evidence inventory derived from `packages/modules/*/src/models`.

## Commerce and platform modules

- `api-key`: `api-key`
- `auth`: `auth-identity`, `provider-identity`
- `cart`: `address`, `cart`, `credit-line`, `line-item-adjustment`, `line-item-tax-line`, `line-item`, `shipping-method-adjustment`, `shipping-method-tax-line`, `shipping-method`
- `currency`: `currency`
- `customer`: `address`, `customer-group-customer`, `customer-group`, `customer`
- `fulfillment`: `address`, `fulfillment-item`, `fulfillment-label`, `fulfillment-provider`, `fulfillment-set`, `fulfillment`, `geo-zone`, `service-zone`, `shipping-option-rule`, `shipping-option-type`, `shipping-option`, `shipping-profile`
- `index`: `index-data`, `index-metadata`, `index-relation`, `index-sync`
- `inventory`: `inventory-item`, `inventory-level`, `reservation-item`
- `notification`: `notification-provider`, `notification`
- `order`: `address`, `claim-item-image`, `claim-item`, `claim`, `credit-line`, `exchange-item`, `exchange`, `line-item-adjustment`, `line-item-tax-line`, `line-item`, `order-change-action`, `order-change`, `order-item`, `order-shipping-method`, `order-summary`, `order`, `return-item`, `return-reason`, `return`, `shipping-method-adjustment`, `shipping-method-tax-line`, `shipping-method`, `transaction`
- `payment`: `account-holder`, `capture`, `payment-collection`, `payment-provider`, `payment-session`, `payment`, `refund-reason`, `refund`
- `pricing`: `price-list-rule`, `price-list`, `price-preference`, `price-rule`, `price-set`, `price`
- `product`: `product-category`, `product-collection`, `product-image`, `product-option-value`, `product-option`, `product-tag`, `product-type`, `product-variant-product-image`, `product-variant`, `product`
- `promotion`: `application-method`, `campaign-budget-usage`, `campaign-budget`, `campaign`, `promotion-rule-value`, `promotion-rule`, `promotion`
- `rbac`: `rbac-policy`, `rbac-role-inheritance`, `rbac-role-parent`, `rbac-role-policy`, `rbac-role`
- `region`: `country`, `region`
- `sales-channel`: `sales-channel`
- `settings`: `property-label`, `user-preference`, `view-configuration`
- `stock-location`: `stock-location-address`, `stock-location`
- `store`: `currency`, `locale`, `store`
- `tax`: `tax-provider`, `tax-rate-rule`, `tax-rate`, `tax-region`
- `translation`: `locale`, `settings`, `translation`
- `user`: `invite`, `user`
- `workflow-engine-inmemory`: `workflow-execution`
- `workflow-engine-redis`: `workflow-execution`

## Link definitions visible in `link-modules`

- `cart-payment-collection`
- `cart-promotion`
- `customer-account-holder`
- `fulfillment-provider-location`
- `fulfillment-set-location`
- `invite-rbac-role`
- `order-cart`
- `order-claim-payment-collection`
- `order-exchange-payment-collection`
- `order-fulfillment`
- `order-payment-collection`
- `order-promotion`
- `order-return-fulfillment`
- `product-sales-channel`
- `product-shipping-profile`
- `product-variant-inventory-item`
- `product-variant-price-set`
- `publishable-api-key-sales-channel`
- `region-payment-provider`
- `sales-channel-location`
- `shipping-option-price-set`
- `user-rbac-role`
