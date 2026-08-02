<!-- Source: https://shopify.dev/docs/api/admin-graphql/2024-10/enums/WebhookSubscriptionTopic -->

# Webhook Subscription Topic Enum Values

Complete list of all `WebhookSubscriptionTopic` enum values from the Shopify GraphQL Admin API, organized by category:

## App & Installation Events
- **APP_PURCHASES_ONE_TIME_UPDATE**: "Occurs whenever a one-time app charge is updated"
- **APP_SCOPES_UPDATE**: "Occurs whenever the access scopes of any installation are modified"
- **APP_SUBSCRIPTIONS_APPROACHING_CAPPED_AMOUNT**: "Occurs when the balance used on an app subscription crosses 90% of the capped amount"
- **APP_SUBSCRIPTIONS_UPDATE**: "Occurs whenever an app subscription is updated"
- **APP_UNINSTALLED**: "Occurs whenever a shop has uninstalled the app"

## Audit & Operations
- **AUDIT_EVENTS_ADMIN_API_ACTIVITY**: "Triggers for each auditable Admin API request"
- **BULK_OPERATIONS_FINISH**: "Notifies when a Bulk Operation finishes"

## Cart Events
- **CARTS_CREATE**: "Occurs when a cart is created in the online store"
- **CARTS_UPDATE**: "Occurs when a cart is updated in the online store"

## Channel & Publication Events
- **CHANNELS_DELETE**: "Occurs whenever a channel is deleted"
- **COLLECTION_LISTINGS_ADD/REMOVE/UPDATE**: Covers collection listing publication events
- **COLLECTION_PUBLICATIONS_CREATE/DELETE/UPDATE**: Handles collection publication lifecycle
- **PRODUCT_LISTINGS_ADD/REMOVE/UPDATE**: Tracks product publication changes
- **PRODUCT_PUBLICATIONS_CREATE/DELETE/UPDATE**: Monitors product publication events
- **PRODUCT_FEEDS_CREATE/UPDATE/FULL_SYNC/INCREMENTAL_SYNC/FULL_SYNC_FINISH**: Manages product feed operations

## Checkout Events
- **CHECKOUTS_CREATE/DELETE/UPDATE**: Covers checkout lifecycle events

## Collection Events
- **COLLECTIONS_CREATE/DELETE/UPDATE**: Tracks collection modifications

## Company & Contact Events
- **COMPANIES_CREATE/DELETE/UPDATE**: Company lifecycle management
- **COMPANY_CONTACTS_CREATE/DELETE/UPDATE**: Contact management
- **COMPANY_CONTACT_ROLES_ASSIGN/REVOKE**: Role assignment/revocation
- **COMPANY_LOCATIONS_CREATE/DELETE/UPDATE**: Location management

## Customer Events
- **CUSTOMER_ACCOUNT_SETTINGS_UPDATE**: "Triggers when merchants change customer account setting"
- **CUSTOMER_GROUPS_CREATE/DELETE/UPDATE**: Customer saved search events
- **CUSTOMER_JOINED_SEGMENT/CUSTOMER_LEFT_SEGMENT**: Segment membership changes
- **CUSTOMER_PAYMENT_METHODS_CREATE/REVOKE/UPDATE**: Payment method lifecycle
- **CUSTOMER_TAGS_ADDED/REMOVED**: Tag management
- **CUSTOMERS_CREATE/DELETE/DISABLE/ENABLE/UPDATE**: Core customer events
- **CUSTOMERS_EMAIL_MARKETING_CONSENT_UPDATE**: Email consent changes
- **CUSTOMERS_MARKETING_CONSENT_UPDATE**: SMS consent changes
- **CUSTOMERS_MERGE**: "Triggers when two customers are merged"
- **CUSTOMERS_PURCHASING_SUMMARY**: "Occurs when a customer sales history change"

## Discount Events
- **DISCOUNTS_CREATE/DELETE/UPDATE**: Discount lifecycle
- **DISCOUNTS_REDEEMCODE_ADDED/REMOVED**: Redeem code management

## Domain Events
- **DOMAINS_CREATE/DESTROY/UPDATE**: Domain lifecycle

## Draft Order Events
- **DRAFT_ORDERS_CREATE/DELETE/UPDATE**: Draft order management

## Dispute Events
- **DISPUTES_CREATE/UPDATE**: "Occurs whenever a dispute is created/updated"

## Delivery & Shipping
- **DELIVERY_PROMISE_SETTINGS_UPDATE**: "Occurs when a promise setting is updated"
- **SHIPPING_ADDRESSES_CREATE/UPDATE**: Shipping address events
- **PROFILES_CREATE/DELETE/UPDATE**: Delivery profile management

## Finance Events
- **FINANCE_KYC_INFORMATION_UPDATE**: KYC information updates
- **FINANCE_APP_STAFF_MEMBER_GRANT/REVOKE/DELETE/UPDATE**: Finance app access management

## Fulfillment Events
- **FULFILLMENT_EVENTS_CREATE/DELETE**: Fulfillment event lifecycle
- **FULFILLMENT_HOLDS_ADDED/RELEASED**: Hold management
- **FULFILLMENT_ORDERS_CANCELLATION_REQUEST_ACCEPTED/REJECTED/SUBMITTED**: Cancellation requests
- **FULFILLMENT_ORDERS_CANCELLED**: "Occurs when a fulfillment order is cancelled"
- **FULFILLMENT_ORDERS_FULFILLMENT_REQUEST_ACCEPTED/REJECTED/SUBMITTED**: Fulfillment request lifecycle
- **FULFILLMENT_ORDERS_FULFILLMENT_SERVICE_FAILED_TO_COMPLETE**: Service failure notification
- **FULFILLMENT_ORDERS_HOLD_RELEASED**: "Occurs when a fulfillment order is released and is no longer on hold"
- **FULFILLMENT_ORDERS_LINE_ITEMS_PREPARED_FOR_LOCAL_DELIVERY/PICKUP**: Preparation events
- **FULFILLMENT_ORDERS_MANUALLY_REPORTED_PROGRESS_STOPPED**: Manual progress cessation
- **FULFILLMENT_ORDERS_MERGED**: Multiple order consolidation
- **FULFILLMENT_ORDERS_MOVED**: Location reassignment
- **FULFILLMENT_ORDERS_ORDER_ROUTING_COMPLETE**: "Occurs when an order has finished being routed"
- **FULFILLMENT_ORDERS_PLACED_ON_HOLD**: Hold placement
- **FULFILLMENT_ORDERS_PROGRESS_REPORTED**: Progress updates
- **FULFILLMENT_ORDERS_RESCHEDULED**: "Triggers when a fulfillment order is rescheduled"
- **FULFILLMENT_ORDERS_SCHEDULED_FULFILLMENT_ORDER_READY**: Scheduled order readiness
- **FULFILLMENT_ORDERS_SPLIT**: Order splitting
- **FULFILLMENTS_CREATE/UPDATE**: Fulfillment lifecycle

## Inventory Events
- **INVENTORY_ITEMS_CREATE/DELETE/UPDATE**: Inventory item lifecycle
- **INVENTORY_LEVELS_CONNECT/DISCONNECT/UPDATE**: Level management
- **INVENTORY_SHIPMENTS_ADD_ITEMS/CREATE/DELETE/MARK_IN_TRANSIT/RECEIVE_ITEMS/REMOVE_ITEMS/UPDATE_ITEM_QUANTITIES/UPDATE_TRACKING**: Shipment operations
- **INVENTORY_TRANSFERS_ADD_ITEMS/CANCEL/COMPLETE/READY_TO_SHIP/REMOVE_ITEMS/UPDATE_ITEM_QUANTITIES**: Transfer management

## Locale Events
- **LOCALES_CREATE/DESTROY/UPDATE**: Shop locale lifecycle

## Location Events
- **LOCATIONS_ACTIVATE/CREATE/DEACTIVATE/DELETE/UPDATE**: Location management

## Market Events
- **MARKETS_BACKUP_REGION_UPDATE**: Backup region updates
- **MARKETS_CREATE/DELETE/UPDATE**: Market lifecycle

## Metafield Events
- **METAFIELD_DEFINITIONS_CREATE/DELETE/UPDATE**: Metafield definition lifecycle
- **METAOBJECTS_CREATE/DELETE/UPDATE**: Metaobject lifecycle

## Order Events
- **ORDER_TRANSACTIONS_CREATE**: "Occurs when a order transaction is created or when its status is updated"
- **ORDERS_CANCELLED**: "Occurs whenever an order is cancelled"
- **ORDERS_CREATE**: "Occurs whenever an order is created"
- **ORDERS_DELETE**: "Occurs whenever an order is deleted"
- **ORDERS_EDITED**: "Occurs whenever an order is edited"
- **ORDERS_FULFILLED**: "Occurs whenever an order is fulfilled"
- **ORDERS_LINK_REQUESTED**: "Occurs whenever a customer requests a new order link"
- **ORDERS_PAID**: "Occurs whenever an order is paid"
- **ORDERS_PARTIALLY_FULFILLED**: "Occurs whenever an order is partially fulfilled"
- **ORDERS_RISK_ASSESSMENT_CHANGED**: "Triggers when a new risk assessment is available on the order"
- **ORDERS_SHOPIFY_PROTECT_ELIGIBILITY_CHANGED**: "Occurs whenever Shopify Protect's eligibility for an order is changed"
- **ORDERS_UPDATED**: "Occurs whenever an order is updated"

## Payment Events
- **PAYMENT_SCHEDULES_DUE**: "Occurs whenever payment schedules are due"
- **PAYMENT_TERMS_CREATE/DELETE/UPDATE**: Payment term lifecycle
- **TENDER_TRANSACTIONS_CREATE**: "Occurs when a tender transaction is created"

## Product Events
- **PRODUCTS_CREATE/DELETE/UPDATE**: Product lifecycle
- **VARIANTS_IN_STOCK**: "Occurs whenever a variant becomes in stock"
- **VARIANTS_OUT_OF_STOCK**: "Occurs whenever a variant becomes out of stock"

## Refund & Return Events
- **REFUNDS_CREATE**: "Occurs whenever a new refund is created without errors"
- **RETURNS_APPROVE/CANCEL/CLOSE/DECLINE/PROCESS/REOPEN/REQUEST/UPDATE**: Return lifecycle
- **REVERSE_DELIVERIES_ATTACH_DELIVERABLE**: "Occurs whenever a deliverable is attached to a reverse delivery"
- **REVERSE_FULFILLMENT_ORDERS_DISPOSE**: "Occurs whenever a disposition is made on a reverse fulfillment order"

## Scheduled Product Events
- **SCHEDULED_PRODUCT_LISTINGS_ADD/REMOVE/UPDATE**: Scheduled publication management

## Segment Events
- **SEGMENTS_CREATE/DELETE/UPDATE**: Customer segment lifecycle

## Selling Plan Events
- **SELLING_PLAN_GROUPS_CREATE/DELETE/UPDATE**: Selling plan group lifecycle

## Shop Events
- **SHOP_UPDATE**: "Occurs whenever a shop is updated"

## Subscription Events
- **SUBSCRIPTION_BILLING_ATTEMPTS_CHALLENGED/FAILURE/SUCCESS**: Billing attempt outcomes
- **SUBSCRIPTION_BILLING_CYCLE_EDITS_CREATE/DELETE/UPDATE**: Billing cycle edit management
- **SUBSCRIPTION_BILLING_CYCLES_SKIP/UNSKIP**: Billing cycle skip management
- **SUBSCRIPTION_CONTRACTS_ACTIVATE/CANCEL/CREATE/EXPIRE/FAIL/PAUSE/UPDATE**: Contract lifecycle

## Tax Events
- **TAX_SERVICES_CREATE/UPDATE**: Tax service lifecycle

## Theme Events
- **THEMES_CREATE/DELETE/PUBLISH/UPDATE**: Theme lifecycle
