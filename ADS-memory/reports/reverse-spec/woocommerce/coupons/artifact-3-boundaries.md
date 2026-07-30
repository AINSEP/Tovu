# Artifact 3 — Boundaries, Failures & Compliance: WooCommerce Coupons

**Pass:** 3 (Boundaries)
**Module:** WooCommerce Coupons
**Reads:** artifact-1-core-logic.md, artifact-2-data-access.md

---

## REQ-COUP-020: Failure Matrix — Validation Errors

**Layer:** Failure
**Confidence:** `tested` — error codes exercised in REST API tests
**Criticality:** critical
**Criticality reason:** Incorrect error handling = silent over-discounting or broken checkout UX.
**Status:** confirmed

**Contract:**

All validation failures return `WP_Error('invalid_coupon', $message, ['status' => 400])`. The internal error code determines the user-facing message:

| Code | Constant | Condition | HTTP | User Message |
|------|----------|-----------|------|-------------|
| 100 | `E_WC_COUPON_INVALID_FILTERED` | External filter returned false | 400 | "Coupon cannot be applied because it is not valid." |
| 101 | `E_WC_COUPON_INVALID_REMOVED` | Coupon became invalid after apply | 400 | "Sorry, it seems the coupon is invalid - it has now been removed from your order." |
| 102 | `E_WC_COUPON_NOT_YOURS_REMOVED` | Email restriction failed | 400 | "Please enter a valid email to use coupon code." / "...at checkout..." |
| 103 | `E_WC_COUPON_ALREADY_APPLIED` | Same coupon already in cart | 400 | "Coupon code already applied!" |
| 104 | `E_WC_COUPON_ALREADY_APPLIED_INDIV_USE_ONLY` | Individual-use coupon + other coupons | 400 | "...cannot be used in conjunction with other coupons." |
| 105 | `E_WC_COUPON_NOT_EXIST` | No ID + not virtual, OR trashed | 400 | "...cannot be applied because it does not exist." |
| 106 | `E_WC_COUPON_USAGE_LIMIT_REACHED` | Global or per-user limit hit | 400 | "Usage limit has been reached." |
| 107 | `E_WC_COUPON_EXPIRED` | Current time > date_expires | 400 | "Coupon has expired." |
| 108 | `E_WC_COUPON_MIN_SPEND_LIMIT_NOT_MET` | Cart subtotal < minimum_amount | 400 | "The minimum spend is {amount}." |
| 109 | `E_WC_COUPON_NOT_APPLICABLE` | Product/category mismatch | 400 | "...not applicable to selected products." |
| 110 | `E_WC_COUPON_NOT_VALID_SALE_ITEMS` | All eligible items are on sale | 400 | "...not valid for sale items." |
| 111 | `E_WC_COUPON_PLEASE_ENTER` | Empty code submitted | 400 | "Please enter a coupon code." |
| 112 | `E_WC_COUPON_MAX_SPEND_LIMIT_MET` | Cart subtotal > maximum_amount | 400 | "The maximum spend is {amount}." |
| 113 | `E_WC_COUPON_EXCLUDED_PRODUCTS` | Cart contains excluded products | 400 | "...not applicable to the products: {list}." |
| 114 | `E_WC_COUPON_EXCLUDED_CATEGORIES` | Cart contains excluded categories | 400 | "...not applicable to the categories: {list}." |
| 115 | `E_WC_COUPON_USAGE_LIMIT_COUPON_STUCK` | Limit reached but user has pending order (logged in) | 400 | "...retry or cancel the order by going to my account page." |
| 116 | `E_WC_COUPON_USAGE_LIMIT_COUPON_STUCK_GUEST` | Limit reached, possibly stuck (guest) | 400 | "Please try again after some time, or contact us for help." |

**Success codes:**

| Code | Constant | Meaning |
|------|----------|---------|
| 200 | `WC_COUPON_SUCCESS` | "Coupon code applied successfully." |
| 201 | `WC_COUPON_REMOVED` | "Coupon code removed successfully." |

**Error message filtering:** All error messages pass through `woocommerce_coupon_error` filter before returning. Numeric-only messages (legacy) are auto-resolved via `get_coupon_error()`.

**Context-based errors:** `get_context_based_coupon_errors()` adds `details` to the WP_Error `additional_data` for Store API consumers (structured error context).

**Source evidence:**
- `includes/class-wc-coupon.php:58-76` (constant definitions)
- `includes/class-wc-coupon.php:1104-1275` (`get_coupon_error` switch)
- `includes/class-wc-discounts.php:1134-1179` (error wrapping in `is_coupon_valid`)

---

## REQ-COUP-021: Failure Matrix — Store API Route Errors

**Layer:** Failure
**Confidence:** `tested` — Store API tests
**Criticality:** high
**Criticality reason:** Customer-facing API; incorrect responses break checkout flows.
**Status:** confirmed

**Contract:**

| Route | Condition | HTTP Code | Error Code |
|-------|-----------|-----------|-----------|
| `POST /cart/apply-coupon` | Coupons disabled globally | 404 | `woocommerce_rest_cart_coupon_disabled` |
| `POST /cart/apply-coupon` | Validation fails (any) | 400 | Passed through from WC_REST_Exception |
| `POST /cart/remove-coupon` | Coupons disabled globally | 404 | `woocommerce_rest_cart_coupon_disabled` |
| `POST /cart/remove-coupon` | Invalid/non-existent code | 400 | `woocommerce_rest_cart_coupon_error` |
| `POST /cart/remove-coupon` | Coupon not in cart | 409 | `woocommerce_rest_cart_coupon_invalid_code` |

**Invariant:** Store API always returns JSON error responses via `RouteException` → WP REST error format.

**Source evidence:**
- `src/StoreApi/Routes/V1/CartApplyCoupon.php:67-78`
- `src/StoreApi/Routes/V1/CartRemoveCoupon.php:67-87`

---

## REQ-COUP-022: Failure Matrix — Admin REST API Errors

**Layer:** Failure
**Confidence:** `observed` — inherits WC_REST_CRUD_Controller behavior
**Criticality:** medium
**Criticality reason:** Admin-facing; errors are visible to store operators only.
**Status:** confirmed

**Contract:**

| Route | Condition | HTTP Code | Error Code |
|-------|-----------|-----------|-----------|
| `POST /wc/v3/coupons` | Missing `code` | 400 | `rest_missing_callback_param` |
| `POST /wc/v3/coupons` | Invalid discount_type | 400 | `coupon_invalid_discount_type` |
| `POST /wc/v3/coupons` | Negative amount | 400 | `coupon_invalid_amount` |
| `POST /wc/v3/coupons` | Percent > 100 | 400 | `coupon_invalid_amount` |
| `POST /wc/v3/coupons` | max < min amount | 400 | `coupon_invalid_maximum_amount` |
| `POST /wc/v3/coupons` | Invalid email in restrictions | 400 | `coupon_invalid_email_address` |
| `GET /wc/v3/coupons/{id}` | Non-existent ID | 404 | `woocommerce_rest_shop_coupon_invalid_id` |
| `PUT /wc/v3/coupons/{id}` | Non-existent ID | 404 | `woocommerce_rest_shop_coupon_invalid_id` |
| `DELETE /wc/v3/coupons/{id}` | Non-existent ID | 404 | `woocommerce_rest_shop_coupon_invalid_id` |
| Any | Missing auth / insufficient caps | 401/403 | `woocommerce_rest_cannot_*` |

**Source evidence:**
- `includes/class-wc-coupon.php:600-633` (setter validation errors)
- `includes/class-wc-coupon.php:806-829` (max amount, email validation)

---

## REQ-COUP-023: Integration Boundary — Cart System

**Layer:** Integration
**Confidence:** `tested` — cart + coupon interaction tested
**Criticality:** critical
**Criticality reason:** Core commerce flow; coupon application changes order totals.
**Status:** confirmed

**Contract:**

**Apply flow:**
1. Customer submits coupon code
2. Store API normalizes code (lowercase, trim)
3. `WC_Cart::apply_coupon()` called → creates `WC_Discounts` object from cart
4. Validation pipeline runs (REQ-COUP-003)
5. If valid: discount calculation runs per-item (REQ-COUP-002)
6. Cart totals recalculated
7. Cart response returned with updated prices

**Remove flow:**
1. Customer requests removal
2. Coupon existence re-validated (prevents removing phantom coupons)
3. `WC_Cart::remove_coupon()` → removes from applied list
4. Cart totals recalculated

**Cart recalculation trigger:** Any coupon add/remove triggers full cart total recalculation. This includes tax recalculation, shipping recalculation, and cross-coupon interaction.

**Individual-use interaction:** When an individual-use coupon is applied, the cart controller removes all previously-applied coupons before adding the new one.

**Source evidence:**
- `src/StoreApi/Routes/V1/CartApplyCoupon.php:65-79`
- `includes/class-wc-discounts.php:249-284` (`apply_coupon` in discounts engine)

---

## REQ-COUP-024: Integration Boundary — Order System

**Layer:** Integration
**Confidence:** `observed` — lifecycle hooks visible; exact trigger unclear
**Criticality:** critical
**Criticality reason:** Usage tracking correctness depends on order status transitions.
**Status:** confirmed

**Contract:**

**On order payment (checkout completes):**
- `increase_usage_count($used_by, $order)` called
- Tentative hold converted to permanent `_used_by` record
- Global `usage_count` meta incremented atomically

**On order cancellation/failure:**
- `decrease_usage_count($used_by)` called
- Single `_used_by` row removed (LIMIT 1)
- Global `usage_count` meta decremented atomically

**On order refund:**
- Same as cancellation — usage count decremented

**Order-item-coupon:** Each coupon applied to an order is stored as an `WC_Order_Item_Coupon` line item, recording:
- Coupon code
- Discount amount (per-coupon total)
- Discount tax amount

**Source evidence:**
- `includes/class-wc-coupon.php:917-945` (increase/decrease methods)
- `includes/data-stores/class-wc-coupon-data-store-cpt.php:332-348` (increase with order hold conversion)
- `includes/class-wc-order-item-coupon.php` (order line item)

---

## REQ-COUP-025: Integration Boundary — Shipping System

**Layer:** Integration
**Confidence:** `observed` — flag exists; shipping integration is external
**Criticality:** medium
**Criticality reason:** Affects shipping cost but is a simple boolean flag.
**Status:** confirmed

**Contract:**
- When coupon has `free_shipping = true` AND coupon passes validation: shipping methods offering "free shipping" become available
- The coupon system sets the flag; the shipping method system reads it
- Coupon amount (if any) and free shipping are independent — a coupon can grant both discount + free shipping
- If coupon is removed or invalidated, free shipping eligibility is removed on next cart calculation

**Source evidence:**
- `includes/class-wc-coupon.php:44` (data field default)
- Cross-system: shipping method checks `WC()->cart->get_coupons()` for free_shipping flag

---

## REQ-COUP-026: Security — Coupon Code as Bearer Token

**Layer:** Security
**Confidence:** `observed` — architectural design
**Criticality:** high
**Criticality reason:** Coupon code is the sole access credential for discounts.
**Status:** confirmed

**Contract:**
- Coupon codes function as bearer tokens — possession of the code grants the discount
- No additional authentication required for Store API (public endpoints)
- No rate limiting on apply attempts (brute-force risk for short codes)
- No audit log of failed apply attempts (only successful applications tracked via `_used_by`)
- Code length/complexity is not enforced by the system

**Mitigation available:**
- `email_restrictions` limits which customers can use a code
- `usage_limit` and `usage_limit_per_user` bound total exposure
- External plugins can add rate limiting via `woocommerce_coupon_is_valid` filter

**Source evidence:**
- `src/StoreApi/Routes/V1/CartApplyCoupon.php:46` (`permission_callback => '__return_true'`)

---

## REQ-COUP-027: Extensibility — Filter/Action Hooks

**Layer:** Integration
**Confidence:** `observed` — hooks documented inline
**Criticality:** medium
**Criticality reason:** Plugin ecosystem depends on these hooks for customization.
**Status:** confirmed

**Contract — Key extension points:**

| Hook | Type | Purpose |
|------|------|---------|
| `woocommerce_get_shop_coupon_data` | filter | Inject virtual coupons (REQ-COUP-010) |
| `woocommerce_coupon_is_valid` | filter | Final validation gate — return false to reject |
| `woocommerce_coupon_error` | filter | Modify error messages before display |
| `woocommerce_coupon_get_discount_amount` | filter | Override calculated discount amount |
| `woocommerce_coupon_discount_types` | filter | Register custom discount types |
| `woocommerce_product_coupon_types` | filter | Define which types apply per-product |
| `woocommerce_cart_coupon_types` | filter | Define which types apply to cart |
| `woocommerce_coupons_enabled` | filter | Override global enable/disable |
| `woocommerce_coupon_validate_*` | filter | Per-validator override (minimum_amount, maximum_amount, expiry_date, user_usage_limit) |
| `woocommerce_coupon_is_valid_for_product` | filter | Override per-product eligibility |
| `woocommerce_coupon_hold_minutes` | filter | Override tentative hold duration |
| `woocommerce_new_coupon` | action | Fired after coupon creation |
| `woocommerce_update_coupon` | action | Fired after coupon update |
| `woocommerce_delete_coupon` | action | Fired after permanent delete |
| `woocommerce_trash_coupon` | action | Fired after trash |
| `woocommerce_increase_coupon_usage_count` | action | Fired after usage increment |
| `woocommerce_decrease_coupon_usage_count` | action | Fired after usage decrement |
| `woocommerce_coupon_loaded` | action | Fired after coupon read from DB |
| `woocommerce_coupon_object_updated_props` | action | Fired after meta save with changed props list |

**Source evidence:** Distributed across all coupon source files (grep for `apply_filters\|do_action` in coupon files).

---

## Open Questions

1. **Which order status transitions trigger increase vs decrease?** The hooks are in the order system, not the coupon system. Likely: payment_complete → increase; cancelled/failed/refunded → decrease. Exact transitions need order system analysis.
2. **Rate limiting:** No built-in rate limiting for coupon apply attempts. Is this acceptable for the target system?

---

## Amendments to Prior Artifacts

- **REQ-COUP-011 [AMENDMENT]:** Free shipping is confirmed as a cross-system flag. The coupon system sets it; shipping methods consume it. It does NOT bypass coupon validation — coupon must be fully valid for free_shipping to take effect.

---

## Risk Tags

- `[UNTESTED SIDE EFFECT]` — REQ-COUP-024: Exact order status transitions that trigger usage count changes are in the order system, not directly tested in coupon tests.
- `[CONCURRENCY CONTRACT]` — REQ-COUP-016 (from Pass 2): Confirmed. Deadlock retry is limited to 3 attempts.
- `[ENVIRONMENTAL CONTRACT]` — REQ-COUP-014: Depends on MySQL `FOR UPDATE` row locking behavior. Different DB engines may behave differently.
