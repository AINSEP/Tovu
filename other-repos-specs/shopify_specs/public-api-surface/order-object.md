<!-- Source: https://shopify.dev/docs/api/storefront/2024-10/objects/Order -->

# Shopify Storefront API: Order Object Schema

## Overview
The Order object represents "a customer's completed request to purchase one or more products from a shop," created upon checkout completion. It requires `unauthenticated_read_customers` access scope.

## Core Fields

**Identity & Metadata:**
- `id` (ID, non-null) - Globally-unique identifier
- `name` (String, non-null) - Unique order identifier (e.g., #1000)
- `orderNumber` (Int, non-null) - Numeric identifier for shop owner/customer reference

**Customer Information:**
- `email` (String) - Customer email address
- `phone` (String) - Customer phone for SMS notifications
- `customerLocale` (String) - Locale code of the order
- `customerUrl` (URL) - Unique customer access URL
- `statusUrl` (URL, non-null) - Order status page URL

**Addressing:**
- `billingAddress` (MailingAddress) - Payment method address
- `shippingAddress` (MailingAddress) - Shipping destination

**Financial Data:**
- `currencyCode` (CurrencyCode, non-null) - Payment currency
- `originalTotalPrice` (MoneyV2, non-null) - Pre-edit total
- `currentTotalPrice` (MoneyV2, non-null) - Final amount including duties, taxes, discounts
- `currentSubtotalPrice` (MoneyV2, non-null) - Line items minus discounts, excluding order-level adjustments
- `totalRefunded` (MoneyV2, non-null) - Total refund amount

**Shipping & Taxes:**
- `currentTotalShippingPrice` (MoneyV2, non-null) - Shipping cost excluding refunds/removals
- `currentTotalTax` (MoneyV2, non-null) - Applied taxes excluding returned items
- `currentTotalDuties` (MoneyV2) - Total duties including refunds
- `originalTotalDuties` (MoneyV2) - Duties charged at checkout
- `shippingDiscountAllocations` (DiscountAllocation array) - Shipping line discounts

**Status & Fulfillment:**
- `financialStatus` (OrderFinancialStatus) - Payment status
- `fulfillmentStatus` (OrderFulfillmentStatus, non-null) - Delivery status
- `canceledAt` (DateTime) - Cancellation timestamp
- `cancelReason` (OrderCancelReason) - Cancellation reason
- `processedAt` (DateTime, non-null) - Import/creation timestamp
- `edited` (Boolean, non-null) - Whether edits have been applied

**Line Items & Discounts:**
- `lineItems` (OrderLineItemConnection, non-null) - Paginated order items
- `discountApplications` (DiscountApplicationConnection, non-null) - Applied discounts

**Fulfillment & Custom Data:**
- `successfulFulfillments` (Fulfillment array) - Completed shipments
- `customAttributes` (Attribute array, non-null) - Custom order attributes
- `metafield` (Metafield) - Single custom field lookup
- `metafields` (Metafield array, non-null) - Multiple custom fields retrieval

## Interfaces Implemented
- `HasMetafields` - Metafield support
- `Node` - GraphQL node interface
