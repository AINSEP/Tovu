# Artifact 1 — Core Logic Extraction: WooCommerce Coupons

**Pass:** 1 (Core Logic)
**Module:** WooCommerce Coupons
**Source:** `plugins/woocommerce/`

---

## REQ-COUP-001: Coupon CRUD via REST API

**Layer:** API
**Confidence:** `tested` — `tests/legacy/unit-tests/rest-api/Tests/Version3/coupons.php`, `tests/php/includes/rest-api/Controllers/Version3/class-wc-rest-coupons-controller-tests.php`
**Criticality:** high
**Criticality reason:** Core admin workflow; all coupon management depends on this.
**Status:** confirmed

**Contract:**
- `POST /wc/v3/coupons` — create coupon. Required field: `code`. Returns 201 with full coupon object.
- `GET /wc/v3/coupons` — list coupons. Supports filtering by `code` and `status`. Paginated.
- `GET /wc/v3/coupons/{id}` — retrieve single coupon by ID.
- `PUT/PATCH /wc/v3/coupons/{id}` — update coupon fields.
- `DELETE /wc/v3/coupons/{id}?force=true` — permanent delete. `force=false` (default) moves to trash.
- `POST /wc/v3/coupons/batch` — batch create/update/delete.
- All endpoints require `manage_woocommerce` capability.

**Source evidence:**
- `includes/rest-api/Controllers/Version2/class-wc-rest-coupons-v2-controller.php:52-134` (route registration)
- `includes/rest-api/Controllers/Version3/class-wc-rest-coupons-controller.php:34-50` (v3 overrides)

---

## REQ-COUP-002: Discount Type Calculation

**Layer:** Domain
**Confidence:** `tested` — `tests/legacy/unit-tests/coupon/coupon.php`
**Criticality:** critical
**Criticality reason:** Directly affects monetary calculations for every order using a coupon.
**Status:** confirmed

**Contract:**

Three discount types exist:

| Type | Calculation | Rounding |
|------|-------------|----------|
| `percent` | `amount% × item_price` per eligible item | Rounded to `wc_get_rounding_precision()` (store currency decimals) |
| `fixed_cart` | Total `amount` distributed proportionally: `(item_share / subtotal) × amount` per item | Same precision rounding |
| `fixed_product` | Flat `amount` per unit of eligible item; capped at item price | Same precision rounding |

**Invariants:**
- Discount per item NEVER exceeds item price (enforced by `min($discount, $discounting_amount)`)
- `fixed_cart` uses price-including-tax for proportion when `wc_prices_include_tax()` is true; price-excluding-tax otherwise
- `percent` amount is capped at 100 on set (validation rejects >100)
- Amount must be non-negative (rejects < 0)
- Final discount value passes through `woocommerce_coupon_get_discount_amount` filter

**Source evidence:**
- `includes/class-wc-coupon.php:499-535` (`get_discount_amount`)
- `includes/class-wc-coupon.php:617-633` (`set_amount` validation)
- `includes/class-wc-discounts.php:268-281` (type dispatch in `apply_coupon`)

---

## REQ-COUP-003: Coupon Validation Pipeline

**Layer:** Domain
**Confidence:** `tested` — `tests/legacy/unit-tests/coupon/coupon.php`, `tests/php/includes/class-wc-coupon-test.php`
**Criticality:** critical
**Criticality reason:** Prevents invalid discount application; money at stake.
**Status:** confirmed

**Contract:**

Validation executes as an ordered chain in `WC_Discounts::is_coupon_valid()`. ALL must pass; first failure short-circuits with WP_Error:

| Order | Check | Error Code | Error Condition |
|-------|-------|-----------|-----------------|
| 1 | `validate_coupon_exists` | 105 | No ID and not virtual, OR status = trash |
| 2 | `validate_coupon_usage_limit` | 106/115/116 | `usage_count + tentative_usage >= usage_limit` (when limit > 0) |
| 3 | `validate_coupon_user_usage_limit` | 106/115 | Per-user usage >= `usage_limit_per_user` (when limit > 0) |
| 4 | `validate_coupon_expiry_date` | 107 | `time() > date_expires` (when date set) |
| 5 | `validate_coupon_minimum_amount` | 108 | Cart subtotal < `minimum_amount` (when > 0) |
| 6 | `validate_coupon_maximum_amount` | 112 | Cart subtotal > `maximum_amount` (when > 0) |
| 7 | `validate_coupon_product_ids` | 109 | Product whitelist set but no cart items match |
| 8 | `validate_coupon_product_categories` | 109 | Category whitelist set but no cart items match |
| 9 | `validate_coupon_excluded_items` | 109 | For product-type coupons: all items excluded |
| 10 | `validate_coupon_eligible_items` | 110/113/114 | For cart-type coupons: sale item / excluded product / excluded category check |
| 11 | `validate_coupon_allowed_emails` | 102 | Email restrictions set and current user email doesn't match |
| 12 | `woocommerce_coupon_is_valid` filter | 100 | External code returns false |

**Side effects:** None (validation is pure check, no state mutation)

**Source evidence:**
- `includes/class-wc-discounts.php:1134-1179` (orchestration)
- `includes/class-wc-discounts.php:605-1084` (individual validators)

---

## REQ-COUP-004: Apply Coupon to Cart (Store API)

**Layer:** API
**Confidence:** `tested` — `tests/php/src/Blocks/StoreApi/Routes/CartApplyCoupon.php`
**Criticality:** critical
**Criticality reason:** Customer-facing checkout path; directly affects pricing.
**Status:** confirmed

**Contract:**
- `POST /wc/store/v1/cart/apply-coupon` with body `{"code": "<coupon_code>"}`
- Precondition: `wc_coupons_enabled()` must be true (404 if disabled)
- Code is normalized via `wc_format_coupon_code(wp_unslash(code))` — case-insensitive
- Delegates to `cart_controller->apply_coupon()` which runs full validation pipeline (REQ-COUP-003)
- On success: returns full cart response with coupon applied and totals recalculated
- On failure: throws RouteException with validation error message and HTTP 4xx

**Source evidence:**
- `src/StoreApi/Routes/V1/CartApplyCoupon.php:65-79`

---

## REQ-COUP-005: Remove Coupon from Cart (Store API)

**Layer:** API
**Confidence:** `tested` — `tests/php/src/Blocks/StoreApi/Routes/CartCoupons.php`
**Criticality:** high
**Criticality reason:** Customer-facing; incorrect removal could leave stale discounts.
**Status:** confirmed

**Contract:**
- `POST /wc/store/v1/cart/remove-coupon` with body `{"code": "<coupon_code>"}`
- Precondition: `wc_coupons_enabled()` must be true (404 if disabled)
- Validates coupon exists and is valid (re-validates the coupon object)
- If coupon not currently applied to cart → 409 Conflict
- On success: removes coupon, returns updated cart response

**Source evidence:**
- `src/StoreApi/Routes/V1/CartRemoveCoupon.php:65-87`

---

## REQ-COUP-006: Individual Use Enforcement

**Layer:** Domain
**Confidence:** `tested` — `tests/legacy/unit-tests/coupon/coupon.php`
**Criticality:** high
**Criticality reason:** Business rule preventing coupon stacking; revenue protection.
**Status:** confirmed

**Contract:**
- When `individual_use = true`: applying this coupon removes all other applied coupons from the cart
- When another coupon with `individual_use = true` is already applied: new coupons are rejected with error code 104 ("cannot be used in conjunction with other coupons")
- Enforcement happens at cart level during `WC_Cart::apply_coupon()`

**Source evidence:**
- `includes/class-wc-coupon.php:60` (error code constant)
- `includes/class-wc-coupon.php:1151-1157` (error message)

---

## REQ-COUP-007: Product Eligibility Rules

**Layer:** Domain
**Confidence:** `tested` — `tests/legacy/unit-tests/coupon/coupon.php`
**Criticality:** high
**Criticality reason:** Controls which items get discounted; incorrect logic = revenue loss.
**Status:** confirmed

**Contract (for product-type coupons — percent, fixed_product):**

Evaluation order in `is_valid_for_product()`:
1. If `product_ids` is set AND product (or parent) is in list → valid = true
2. If `product_categories` is set AND product's categories intersect → valid = true
3. If NEITHER `product_ids` NOR `product_categories` is set → valid = true (all products eligible)
4. If `excluded_product_ids` is set AND product (or parent) is in list → valid = false (overrides above)
5. If `excluded_product_categories` is set AND product's categories intersect → valid = false (overrides above)
6. If `exclude_sale_items = true` AND product is on sale → valid = false (overrides above)

**Invariant:** Exclusions always win over inclusions. Sale-item exclusion is the final gate.

**Variation handling:** Both product ID and parent ID are checked, so variations inherit parent's eligibility unless explicitly excluded.

**Source evidence:**
- `includes/class-wc-coupon.php:1007-1047` (`is_valid_for_product`)

---

## REQ-COUP-008: Usage Count Tracking

**Layer:** Side-Effect
**Confidence:** `observed` — code is clear, test coverage unclear for lifecycle hooks
**Criticality:** critical
**Criticality reason:** Usage limits depend on accurate counts; race conditions = over-discounting.
**Status:** confirmed

**Contract:**
- On order payment/completion: `increase_usage_count($used_by, $order)` — increments global count, records user ID or billing email
- On order cancellation/refund: `decrease_usage_count($used_by)` — decrements count, removes user record
- `used_by` list is lazy-loaded (not on construct) to avoid memory issues for high-usage coupons
- Data store handles persistence; the domain object bypasses `set_prop` to avoid dirty-marking

**Tentative usage (race condition protection):**
- During checkout, a "tentative" hold is placed before payment confirms
- `get_tentative_usage_count()` is added to `usage_count` during validation
- If checkout fails/times out, tentative hold is released
- This prevents two concurrent checkouts from both passing the usage limit check

**Source evidence:**
- `includes/class-wc-coupon.php:917-945` (increase/decrease)
- `includes/class-wc-discounts.php:628-663` (tentative usage in validation)

---

## REQ-COUP-009: Coupon Code Case Insensitivity

**Layer:** Domain
**Confidence:** `tested` — explicit `wc_is_same_coupon` function with tests
**Criticality:** medium
**Criticality reason:** UX concern; codes entered differently must match.
**Status:** confirmed

**Contract:**
- All coupon codes are compared case-insensitively via `wc_strtolower()`
- Codes are stored normalized via `wc_format_coupon_code()` (lowercased)
- `wc_is_same_coupon($a, $b)` is the canonical comparison function
- Cache keys use `md5(wc_strtolower($code))` for lookup

**Known bug (fixed 10.0):** WC 9.9 had a bug where case-different codes caused zero discount_amount in lookup table. Repair function `wc_repair_zero_discount_coupons_lookup_table()` exists.

**Source evidence:**
- `includes/wc-coupon-functions.php:85-87` (`wc_is_same_coupon`)
- `includes/wc-coupon-functions.php:109-132` (`wc_get_coupon_id_by_code` with hashed key)

---

## REQ-COUP-010: Virtual (Programmatic) Coupons

**Layer:** Domain
**Confidence:** `observed` — code path clear, limited test coverage
**Criticality:** medium
**Criticality reason:** Extension point; plugin ecosystem depends on this for custom coupon logic.
**Status:** confirmed

**Contract:**
- Filter `woocommerce_get_shop_coupon_data` allows external code to inject coupon data without DB storage
- Virtual coupons have `id = 0` and `virtual = true`
- Virtual coupons bypass the "exists" check in validation (REQ-COUP-003 step 1)
- `read_manual_coupon()` parses the provided array into the coupon object with backwards-compat handling
- Virtual coupons do NOT track usage counts (no ID = no data store operations)

**Source evidence:**
- `includes/class-wc-coupon.php:122-127` (filter check in constructor)
- `includes/class-wc-coupon.php:868-908` (`read_manual_coupon`)
- `includes/class-wc-discounts.php:606` (virtual exemption)

---

## REQ-COUP-011: Free Shipping Grant

**Layer:** Domain
**Confidence:** `observed` — field exists, shipping integration is external
**Criticality:** medium
**Criticality reason:** Affects shipping cost calculation but not directly monetary coupon amount.
**Status:** confirmed

**Contract:**
- When `free_shipping = true` on a valid coupon: the shipping subsystem grants free shipping
- This is a flag — coupon validation doesn't enforce it; shipping methods check for it
- Can be combined with a discount amount (e.g., 10% off + free shipping)
- The coupon must still pass all other validation rules to be "applied"

**Source evidence:**
- `includes/class-wc-coupon.php:44` (data field)
- `includes/class-wc-coupon.php:383-385` (getter)

---

## REQ-COUP-012: Email Restriction Enforcement

**Layer:** Domain
**Confidence:** `tested` — `includes/class-wc-discounts.php:1050-1084`
**Criticality:** high
**Criticality reason:** Access control for targeted promotions; incorrect enforcement = unauthorized discounts.
**Status:** confirmed

**Contract:**
- When `email_restrictions` is non-empty: only customers whose email matches may use the coupon
- Checked against: current user email AND billing email (from cart customer or order)
- Matching done via `DiscountsUtil::is_coupon_emails_allowed()` — supports wildcards (e.g., `*@company.com`)
- Emails are sanitized and lowercased before comparison
- If no match: error code 102 ("not yours")

**Source evidence:**
- `includes/class-wc-discounts.php:1050-1084` (`validate_coupon_allowed_emails`)
- `includes/class-wc-coupon.php:822-829` (`set_email_restrictions` — sanitization)

---

## REQ-COUP-013: Coupons Global Enable/Disable

**Layer:** Domain
**Confidence:** `tested` — used as gate in Store API routes
**Criticality:** medium
**Criticality reason:** Store-wide kill switch for all coupon functionality.
**Status:** confirmed

**Contract:**
- `wc_coupons_enabled()` checks WordPress option `woocommerce_enable_coupons` = 'yes'
- Filterable via `woocommerce_coupons_enabled`
- When disabled: Store API returns 404 for apply/remove; cart coupon form hidden
- Admin API still allows CRUD (coupons can be managed even when disabled)

**Source evidence:**
- `includes/wc-coupon-functions.php:71-73`
- `src/StoreApi/Routes/V1/CartApplyCoupon.php:67` (gate check)
- `src/StoreApi/Routes/V1/CartRemoveCoupon.php:67` (gate check)

---

## Open Questions

1. **Tentative usage timeout:** How long are tentative holds maintained before release? (Data store implementation detail — not visible from domain code alone)
2. **Brand restrictions:** `class-wc-brands-coupons.php` adds brand-based restrictions — is this core or extension behavior?
3. **Order status transitions:** Which exact status transitions trigger increase vs decrease of usage count?

---

## Amendments to Prior Artifacts

None (this is Pass 1).

---

## Risk Tags

- `[PRECISION CONTRACT]` — REQ-COUP-002: `fixed_cart` proportional distribution relies on `wc_get_rounding_precision()`. Penny rounding across many items may not sum exactly to coupon amount.
- `[CONCURRENCY CONTRACT]` — REQ-COUP-008: Tentative usage prevents most race conditions, but timeout/cleanup mechanism is data-store-specific.

---

## Entrypoints Discovered

All entrypoints from inventory confirmed. No new entrypoints found during extraction.
