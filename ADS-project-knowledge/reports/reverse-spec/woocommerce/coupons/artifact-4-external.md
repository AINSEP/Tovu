# Artifact 4 — External Systems & Consumers: WooCommerce Coupons

**Pass:** 4 (External)
**Module:** WooCommerce Coupons
**Reads:** artifact-1 through artifact-3

---

## REQ-COUP-028: Analytics & Reporting Integration

**Layer:** Integration
**Confidence:** `observed` — report data store and controllers exist
**Criticality:** medium
**Criticality reason:** Business intelligence; no monetary impact if broken, but operational visibility lost.
**Status:** confirmed

**Contract:**

**Coupon analytics pipeline:**
- `src/Admin/API/Reports/Coupons/DataStore.php` — aggregates coupon usage data for admin reports
- Reports available at: `/wc-analytics/reports/coupons` and `/wc-analytics/reports/coupons/stats`
- Tracks: orders_count, amount (total discount given), per-coupon breakdown
- Data synced via `wc_order_coupon_lookup` table (separate from postmeta)

**Lookup table:**
- `{prefix}wc_order_coupon_lookup` — denormalized table for fast analytics queries
- Columns: `order_id`, `coupon_id`, `discount_amount`, `date_created`
- Synced on order creation/update via `CouponsDataStore::sync_order_coupons()`

**Known bug repair:** `wc_repair_zero_discount_coupons_lookup_table()` fixes entries where WC 9.9 wrote zero discount_amount due to case-sensitivity bug.

**Source evidence:**
- `src/Admin/API/Reports/Coupons/Controller.php`
- `src/Admin/API/Reports/Coupons/DataStore.php`
- `includes/wc-coupon-functions.php:142-217` (repair function)

---

## REQ-COUP-029: Tracking & Events

**Layer:** Integration
**Confidence:** `observed` — tracking classes exist
**Criticality:** low
**Criticality reason:** Analytics telemetry; no functional impact.
**Status:** confirmed

**Contract:**
- `includes/tracks/events/class-wc-coupon-tracking.php` — tracks coupon admin actions (create, update, delete)
- `includes/tracks/events/class-wc-coupons-tracking.php` — tracks bulk coupon list actions
- Events sent to WooCommerce telemetry system (Automattic Tracks)
- Only fires for admin users with consent

**Source evidence:**
- `includes/tracks/events/class-wc-coupon-tracking.php`
- `includes/tracks/events/class-wc-coupons-tracking.php`

---

## REQ-COUP-030: WC Brands Integration

**Layer:** Integration
**Confidence:** `observed` — class exists, behavior unclear without reading fully
**Criticality:** low
**Criticality reason:** Extension feature; not core coupon behavior.
**Status:** confirmed

**Contract:**
- `includes/class-wc-brands-coupons.php` adds brand-based restriction capabilities to coupons
- Extends the product eligibility model (REQ-COUP-007) with brand filtering
- Hooks into `woocommerce_coupon_is_valid_for_product` filter

**Behavior classification:** `compatibility_required` — active extension consumers depend on this.
**Preservation decision:** `preserve`

**Source evidence:**
- `includes/class-wc-brands-coupons.php`

---

## REQ-COUP-031: Admin UI — Coupon Management

**Layer:** Integration (Consumer)
**Confidence:** `observed` — UI files exist
**Criticality:** medium
**Criticality reason:** Primary management interface for store operators.
**Status:** confirmed

**Contract:**

**WordPress Admin (PHP-rendered):**
- `includes/admin/meta-boxes/class-wc-meta-box-coupon-data.php` — coupon edit screen with all fields
- `includes/admin/list-tables/class-wc-admin-list-table-coupons.php` — coupon list with custom columns
- `legacy/js/admin/meta-boxes-coupon.js` — JS for coupon admin interactions

**WooCommerce Admin (React):**
- `client/admin/client/marketing/coupons/` — Marketing > Coupons page
- `client/admin/client/analytics/report/coupons/` — Analytics coupon reports
- `client/admin/client/wp-admin-scripts/marketing-coupons/` — WP admin integration scripts

**Source evidence:** File listing from inventory.

---

## REQ-COUP-032: Block Editor / Checkout Blocks Integration

**Layer:** Integration (Consumer)
**Confidence:** `observed` — block types and Store API schemas exist
**Criticality:** high
**Criticality reason:** Modern checkout flow uses blocks; broken integration = no coupon input.
**Status:** confirmed

**Contract:**
- `src/Blocks/BlockTypes/CartOrderSummaryCouponFormBlock.php` — cart coupon input block
- `src/Blocks/BlockTypes/CheckoutOrderSummaryCouponFormBlock.php` — checkout coupon input block
- `src/Blocks/BlockTypes/CouponCode.php` — coupon code display block
- `client/blocks/assets/js/blocks/coupon-code/` — frontend JS for coupon code block
- `client/blocks/assets/js/base/context/hooks/cart/use-store-cart-coupons.ts` — React hook consuming Store API

**Data flow:** Blocks → React hook → Store API (`/cart/apply-coupon`, `/cart/remove-coupon`) → Backend validation

**Source evidence:**
- `src/Blocks/BlockTypes/CartOrderSummaryCouponFormBlock.php`
- `client/blocks/assets/js/base/context/hooks/cart/use-store-cart-coupons.ts`

---

## REQ-COUP-033: GraphQL API Consumer

**Layer:** API
**Confidence:** `tested` — mutation/query tests exist
**Criticality:** medium
**Criticality reason:** Newer API surface; fewer consumers than REST currently.
**Status:** confirmed

**Contract:**

**Mutations:**
- `createCoupon` — mirrors REST POST, requires admin auth
- `updateCoupon` — mirrors REST PUT
- `deleteCoupon` — mirrors REST DELETE, returns `DeleteCouponResult`

**Queries:**
- `getCoupon` — single coupon by ID
- `listCoupons` — paginated list with `CouponConnection`/`CouponEdge` types

**Types:**
- `Coupon` output type with all domain fields
- `CouponStatus` enum
- `DiscountType` enum
- `CreateCouponInput` / `UpdateCouponInput` input types

**Source evidence:**
- `src/Api/Mutations/Coupons/CreateCoupon.php`
- `src/Api/Queries/Coupons/ListCoupons.php`
- `src/Api/Types/Coupons/Coupon.php`
- `src/Api/Enums/Coupons/CouponStatus.php`, `DiscountType.php`
- `tests/php/src/Api/Mutations/Coupons/*.php`, `tests/php/src/Api/Queries/Coupons/*.php`

---

## Consumer Inventory

| Consumer | Interface | Auth Required | Notes |
|----------|-----------|--------------|-------|
| Store checkout (blocks) | Store API v1 | No (public) | Primary customer path |
| Store checkout (shortcode) | PHP direct | No (public) | Legacy path |
| Admin dashboard (WP) | PHP admin screens | edit_shop_coupons | Legacy management |
| Admin dashboard (React) | REST API v3 | manage_woocommerce | Modern management |
| Analytics reports | Internal data store | manage_woocommerce | Read-only aggregation |
| Third-party apps | REST API v3 | API key (consumer_key/secret) | Full CRUD |
| Mobile apps | REST API v3 | API key | Full CRUD |
| Headless storefronts | Store API v1 + GraphQL | Public (apply) / Admin (CRUD) | Growing segment |
| WC Brands plugin | Filter hooks | N/A (internal) | Product eligibility extension |
| Telemetry/Tracks | Action hooks | N/A (internal) | Anonymous usage data |

---

## Open Questions

None — all external boundaries documented at available depth.

---

## Amendments to Prior Artifacts

None.

---

## Risk Tags

- `[DATA COMPATIBILITY]` — REQ-COUP-028: The `wc_order_coupon_lookup` denormalized table can drift from source-of-truth (postmeta). Repair function exists but requires manual trigger.
