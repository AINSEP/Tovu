# Artifact 2 — Data, Access & Atomicity: WooCommerce Coupons

**Pass:** 2 (Data & Access)
**Module:** WooCommerce Coupons
**Reads:** artifact-1-core-logic.md

---

## REQ-COUP-014: Storage Schema (Custom Post Type)

**Layer:** Data
**Confidence:** `tested` — `tests/legacy/unit-tests/coupon/data-store.php`
**Criticality:** high
**Criticality reason:** All coupon persistence depends on this schema; migration target must replicate semantics.
**Status:** confirmed

**Contract:**

Coupons are stored as WordPress Custom Post Type `shop_coupon`:

**Posts table (`wp_posts`):**

| Column | Maps to | Notes |
|--------|---------|-------|
| ID | coupon ID | Auto-increment integer |
| post_title | `code` | Case-normalized (lowercase) |
| post_excerpt | `description` | |
| post_status | `status` | publish, draft, pending, trash |
| post_date / post_date_gmt | `date_created` | |
| post_modified / post_modified_gmt | `date_modified` | |
| post_type | always `shop_coupon` | |
| post_author | creating user ID | |

**Post meta table (`wp_postmeta`) — internal meta keys:**

| Meta key | Domain field | Storage format |
|----------|-------------|----------------|
| `discount_type` | discount_type | string enum |
| `coupon_amount` | amount | decimal string |
| `date_expires` | date_expires | Unix timestamp (int) |
| `usage_count` | usage_count | integer string |
| `individual_use` | individual_use | 'yes'/'no' |
| `product_ids` | product_ids | comma-separated int string |
| `exclude_product_ids` | excluded_product_ids | comma-separated int string |
| `usage_limit` | usage_limit | integer string |
| `usage_limit_per_user` | usage_limit_per_user | integer string |
| `limit_usage_to_x_items` | limit_usage_to_x_items | integer string or absent |
| `free_shipping` | free_shipping | 'yes'/'no' |
| `product_categories` | product_categories | serialized int array |
| `exclude_product_categories` | excluded_product_categories | serialized int array |
| `exclude_sale_items` | exclude_sale_items | 'yes'/'no' |
| `minimum_amount` | minimum_amount | decimal string |
| `maximum_amount` | maximum_amount | decimal string |
| `customer_email` | email_restrictions | serialized string array |
| `_used_by` | used_by | Multiple rows — one per usage (user ID or email) |

**Backwards compatibility:**
- `expiry_date` meta key checked as fallback if `date_expires` doesn't exist (legacy migration)
- `product_ids` stored as comma-separated string, but some plugins may have written it as serialized array — data store handles both via `get_coupon_meta_as_array()`

**Source evidence:**
- `includes/data-stores/class-wc-coupon-data-store-cpt.php:33-55` (internal_meta_keys)
- `includes/data-stores/class-wc-coupon-data-store-cpt.php:112-152` (read method)
- `includes/data-stores/class-wc-coupon-data-store-cpt.php:265-320` (update_post_meta mapping)

---

## REQ-COUP-015: Access Control Matrix

**Layer:** Access-Control
**Confidence:** `observed` — WordPress capability system; CPT registration clear
**Criticality:** high
**Criticality reason:** Unauthorized coupon creation = direct financial exposure.
**Status:** confirmed

**Contract:**

Coupons use WordPress capability type `shop_coupon` with `map_meta_cap = true`. WordPress auto-maps these capabilities:

| Action | Required Capability | Who Has It |
|--------|-------------------|------------|
| Create coupon | `edit_shop_coupons` | Shop Manager, Administrator |
| Read own coupons | `read_private_shop_coupons` | Shop Manager, Administrator |
| Edit own coupons | `edit_shop_coupons` | Shop Manager, Administrator |
| Edit others' coupons | `edit_others_shop_coupons` | Shop Manager, Administrator |
| Delete coupons | `delete_shop_coupons` | Shop Manager, Administrator |
| Publish coupons | `publish_shop_coupons` | Shop Manager, Administrator |
| List coupons (REST) | `manage_woocommerce` | Shop Manager, Administrator |
| Apply coupon (Store API) | **None — public** | Any visitor/customer |
| Remove coupon (Store API) | **None — public** | Any visitor/customer |

**Critical invariant:** Customer-facing coupon operations (apply/remove) require NO authentication. This is by design — guest checkout must work with coupons. The coupon code itself acts as the access token.

**Source evidence:**
- `includes/class-wc-post-types.php:487-525` (CPT registration with `capability_type => 'shop_coupon'`)
- `src/StoreApi/Routes/V1/CartApplyCoupon.php:46` (`permission_callback => '__return_true'`)

---

## REQ-COUP-016: Tentative Usage Hold (Concurrency Control)

**Layer:** Transaction
**Confidence:** `observed` — code is explicit, atomicity proven by `FOR UPDATE` locks
**Criticality:** critical
**Criticality reason:** Without this, concurrent checkouts can exceed usage limits (over-discounting).
**Status:** confirmed

**Contract:**

**Mechanism:** Optimistic locking via temporary post_meta rows with expiring keys.

**Global usage hold (`check_and_hold_coupon`):**
1. If `usage_limit = 0` (unlimited) → skip, return null
2. Calculate hold time: `woocommerce_coupon_hold_minutes` filter (default = `woocommerce_hold_stock_minutes` option, minimum 1 minute)
3. Generate key: `_coupon_held_{db_timestamp + hold_seconds}_{random_6_chars}`
4. Execute atomic INSERT...SELECT with `FOR UPDATE` lock:
   - Reads `usage_count` meta + count of non-expired `_coupon_held_*` keys
   - Only inserts if `usage_count + tentative_count < usage_limit`
5. Retry up to 3 times on deadlock
6. Returns meta key on success (used later to convert to permanent `_used_by`)

**Per-user usage hold (`check_and_hold_coupon_for_user`):**
1. If `usage_limit_per_user = 0` → skip, return null
2. Same hold time mechanism
3. Generate key: `_maybe_used_by_{db_timestamp + hold_seconds}_{random_6_chars}`
4. Atomic INSERT...SELECT checking `_used_by` count + tentative count for this user < per-user limit
5. Retry up to 3 times on deadlock

**Hold expiration:** Keys contain their own expiry timestamp. `get_tentative_usage_query` only counts keys where `meta_key > '_coupon_held_{current_time}'` — expired holds are naturally excluded from count without cleanup.

**Hold-to-permanent conversion:** On `increase_usage_count($used_by, $order)`, if order has a held key for this coupon, UPDATE that meta row from `_coupon_held_*` → `_used_by` instead of inserting new.

**Source evidence:**
- `includes/data-stores/class-wc-coupon-data-store-cpt.php:549-613` (`check_and_hold_coupon`)
- `includes/data-stores/class-wc-coupon-data-store-cpt.php:649-700` (`check_and_hold_coupon_for_user`)
- `includes/data-stores/class-wc-coupon-data-store-cpt.php:622-638` (`get_tentative_usage_query` with FOR UPDATE)
- `includes/data-stores/class-wc-coupon-data-store-cpt.php:524-539` (`get_tentative_held_time`)

---

## REQ-COUP-017: Usage Count Atomicity

**Layer:** Transaction
**Confidence:** `observed` — direct SQL with atomic increment
**Criticality:** critical
**Criticality reason:** Non-atomic increment under concurrency = lost updates = over-discounting.
**Status:** confirmed

**Contract:**
- Usage count increment/decrement is done via raw SQL: `UPDATE wp_postmeta SET meta_value = meta_value +/- 1`
- This is atomic at the MySQL level (single-row update with arithmetic)
- Fresh count is re-read from DB after update (bypasses WP meta cache)
- `_used_by` record deletion uses `LIMIT 1` to remove only one entry when a user has multiple uses

**Invariant:** The domain object's in-memory count is updated from the DB return value, not from PHP arithmetic. This prevents stale cache issues.

**Source evidence:**
- `includes/data-stores/class-wc-coupon-data-store-cpt.php:425-443` (`update_usage_count_meta`)
- `includes/data-stores/class-wc-coupon-data-store-cpt.php:391-415` (`decrease_usage_count` with LIMIT 1)

---

## REQ-COUP-018: Cache Strategy

**Layer:** Data
**Confidence:** `observed` — cache operations visible in data store
**Criticality:** medium
**Criticality reason:** Cache inconsistency could serve stale coupon data but is self-healing.
**Status:** confirmed

**Contract:**
- Coupon lookup by code uses WP object cache: key = `{prefix}coupon_id_from_code_{md5(lowercase_code)}`
- Cache group: `coupons`
- Cache invalidated on:
  - Coupon create/update/delete (`delete_transient('rest_api_coupons_type_count')`)
  - Status change to non-publish (explicit cache delete by hashed code)
  - Usage count change (`refresh_coupon_data` clears post meta cache)
- `wp_cache_flush_group('coupons')` called during bulk repair operations

**Source evidence:**
- `includes/wc-coupon-functions.php:117-131` (lookup cache)
- `includes/data-stores/class-wc-coupon-data-store-cpt.php:214-217` (invalidation on unpublish)
- `includes/data-stores/class-wc-coupon-data-store-cpt.php:99,211` (transient deletion)

---

## REQ-COUP-019: Coupon Code as Unique Identifier

**Layer:** Data
**Confidence:** `observed` — data store lookup logic
**Criticality:** high
**Criticality reason:** Duplicate codes = ambiguous application; financial impact.
**Status:** confirmed

**Contract:**
- Coupon code is stored as `post_title` — WordPress does NOT enforce uniqueness on post_title
- `wc_get_coupon_id_by_code()` returns the first matching ID from `get_ids_by_code()` (can return multiple)
- Duplicate codes are possible at the DB level but undefined behavior at the application level
- The `$exclude` parameter allows checking "does another coupon with this code exist?" during creation
- Code lookup uses case-insensitive matching (`wc_strtolower`)

**Risk:** No DB-level unique constraint. Uniqueness is enforced at the application layer (admin UI validation), but direct DB inserts or API race conditions could create duplicates.

**Source evidence:**
- `includes/wc-coupon-functions.php:109-132` (`wc_get_coupon_id_by_code`)
- `includes/data-stores/class-wc-coupon-data-store-cpt.php:76` (stored as post_title)

---

## Open Questions

1. **[Answered from Pass 1 open question]** Tentative hold timeout defaults to `woocommerce_hold_stock_minutes` (typically 60 minutes), minimum 1 minute, filterable via `woocommerce_coupon_hold_minutes`.
2. **Cleanup of expired holds:** Expired `_coupon_held_*` meta rows are never explicitly deleted — they accumulate as dead rows in postmeta. Only excluded by timestamp comparison in queries. Potential table bloat for high-traffic stores.

---

## Amendments to Prior Artifacts

- **REQ-COUP-008 [AMENDMENT]:** Tentative usage timeout is now documented: defaults to `woocommerce_hold_stock_minutes` option (typically 60 min), minimum 1 min, filterable. Close open question 1 from artifact-1.

---

## Risk Tags

- `[CONCURRENCY CONTRACT]` — REQ-COUP-016: Deadlock retry (3 attempts) may still fail under extreme load. FOR UPDATE locks create serialization points.
- `[DATA COMPATIBILITY]` — REQ-COUP-014: `expiry_date` → `date_expires` migration is incomplete (legacy fallback still in read path). `product_ids` stored in two possible formats (string vs array).
- `[DATA COMPATIBILITY]` — REQ-COUP-019: No DB-level unique constraint on coupon codes; duplicates possible via race conditions.
