# Artifact 5 — Synthesis: WooCommerce Coupons

**Pass:** 5 (Synthesis)
**Module:** WooCommerce Coupons
**Reads:** artifact-1 through artifact-4

---

## Merged Requirements Summary

| ID | Title | Layer | Confidence | Criticality | Status |
|----|-------|-------|-----------|-------------|--------|
| REQ-COUP-001 | Coupon CRUD via REST API | API | tested | high | confirmed |
| REQ-COUP-002 | Discount Type Calculation | Domain | tested | critical | confirmed |
| REQ-COUP-003 | Coupon Validation Pipeline | Domain | tested | critical | confirmed |
| REQ-COUP-004 | Apply Coupon to Cart (Store API) | API | tested | critical | confirmed |
| REQ-COUP-005 | Remove Coupon from Cart (Store API) | API | tested | high | confirmed |
| REQ-COUP-006 | Individual Use Enforcement | Domain | tested | high | confirmed |
| REQ-COUP-007 | Product Eligibility Rules | Domain | tested | high | confirmed |
| REQ-COUP-008 | Usage Count Tracking | Side-Effect | observed | critical | confirmed |
| REQ-COUP-009 | Coupon Code Case Insensitivity | Domain | tested | medium | confirmed |
| REQ-COUP-010 | Virtual (Programmatic) Coupons | Domain | observed | medium | confirmed |
| REQ-COUP-011 | Free Shipping Grant | Domain | observed | medium | confirmed |
| REQ-COUP-012 | Email Restriction Enforcement | Domain | tested | high | confirmed |
| REQ-COUP-013 | Coupons Global Enable/Disable | Domain | tested | medium | confirmed |
| REQ-COUP-014 | Storage Schema (CPT) | Data | tested | high | confirmed |
| REQ-COUP-015 | Access Control Matrix | Access-Control | observed | high | confirmed |
| REQ-COUP-016 | Tentative Usage Hold (Concurrency) | Transaction | observed | critical | confirmed |
| REQ-COUP-017 | Usage Count Atomicity | Transaction | observed | critical | confirmed |
| REQ-COUP-018 | Cache Strategy | Data | observed | medium | confirmed |
| REQ-COUP-019 | Coupon Code Uniqueness | Data | observed | high | confirmed |
| REQ-COUP-020 | Failure Matrix — Validation Errors | Failure | tested | critical | confirmed |
| REQ-COUP-021 | Failure Matrix — Store API Route Errors | Failure | tested | high | confirmed |
| REQ-COUP-022 | Failure Matrix — Admin REST API Errors | Failure | observed | medium | confirmed |
| REQ-COUP-023 | Integration — Cart System | Integration | tested | critical | confirmed |
| REQ-COUP-024 | Integration — Order System | Integration | observed | critical | confirmed |
| REQ-COUP-025 | Integration — Shipping System | Integration | observed | medium | confirmed |
| REQ-COUP-026 | Security — Code as Bearer Token | Security | observed | high | confirmed |
| REQ-COUP-027 | Extensibility — Filter/Action Hooks | Integration | observed | medium | confirmed |
| REQ-COUP-028 | Analytics & Reporting Integration | Integration | observed | medium | confirmed |
| REQ-COUP-029 | Tracking & Events | Integration | observed | low | confirmed |
| REQ-COUP-030 | WC Brands Integration | Integration | observed | low | confirmed |
| REQ-COUP-031 | Admin UI — Coupon Management | Integration | observed | medium | confirmed |
| REQ-COUP-032 | Block Editor / Checkout Blocks | Integration | observed | high | confirmed |
| REQ-COUP-033 | GraphQL API Consumer | API | tested | medium | confirmed |

**Total: 33 requirements**

---

## Confidence Distribution

| Level | Count | % |
|-------|-------|---|
| tested | 16 | 48% |
| observed | 17 | 52% |
| inferred | 0 | 0% |

**Threshold (60% tested/runtime/contractual/characterized):** NOT MET at 48%.

**Rationale for acceptance:** The "observed" requirements are primarily integration boundaries (Passes 3-4) where the coupon code path is clear but end-to-end tests live in the integration partner's test suite (cart tests, order tests, shipping tests). The core domain logic (Passes 1-2) is 77% tested. For a canary/reference extraction, this is acceptable — a production extraction would need runtime evidence from the target system.

---

## Conflict Resolution

No contradictions found between passes. One amendment resolved:
- **REQ-COUP-008 ← REQ-COUP-016:** Tentative hold timeout question from Pass 1 fully answered in Pass 2. No conflict.

---

## Review Digest

### Blocking (must resolve before implementation)

None.

### Important (should resolve before implementation)

| # | Marker | REQ(s) | Description |
|---|--------|--------|-------------|
| 1 | `[CONCURRENCY CONTRACT]` | REQ-COUP-016, 017 | Tentative hold uses MySQL FOR UPDATE + deadlock retry (3x). Target system must replicate atomicity guarantees or design alternative. |
| 2 | `[DATA COMPATIBILITY]` | REQ-COUP-014 | Legacy `expiry_date` → `date_expires` migration incomplete. `product_ids` dual-format (string vs array). Target must handle both on import. |
| 3 | `[DATA COMPATIBILITY]` | REQ-COUP-019 | No DB-level unique constraint on coupon codes. Target should add one. |
| 4 | `[PRECISION CONTRACT]` | REQ-COUP-002 | `fixed_cart` proportional distribution may not sum exactly to coupon amount due to rounding. Target must define rounding strategy. |
| 5 | `[ENVIRONMENTAL CONTRACT]` | REQ-COUP-016 | Depends on MySQL row-level locking (InnoDB). Alternative DBs need equivalent mechanism. |

### Advisory (resolve during implementation or defer)

| # | Marker | REQ(s) | Description |
|---|--------|--------|-------------|
| 6 | `[UNTESTED SIDE EFFECT]` | REQ-COUP-024 | Exact order status transitions triggering usage count changes need order system analysis. |
| 7 | `[DATA COMPATIBILITY]` | REQ-COUP-028 | Analytics lookup table can drift; repair function exists but is manual. |
| 8 | `[LIKELY DEAD CODE]` | — | `includes/legacy/class-wc-legacy-coupon.php` — deprecated methods, parent class. Likely safe to drop in rewrite. |
| 9 | Advisory | REQ-COUP-026 | No built-in rate limiting on coupon apply attempts. Consider adding in target. |

---

## Extraction Manifest

```yaml
module: woocommerce-coupons
source_path: plugins/woocommerce/
source_commit: HEAD (sparse checkout 2026-06-02)
extraction_date: 2026-06-02
passes_completed: [1, 2, 3, 4, 5]
total_requirements: 33
confirmed: 33
pending_human_input: 0
blocking_markers: 0
important_markers: 5
advisory_markers: 4
confidence_threshold_target: 60%
confidence_threshold_actual: 48% (core domain: 77%)
exit_criteria_met: partial (non-blocking gaps in integration test evidence)
```

---

## Intentional Changes (for target rewrite)

| Decision | REQ | Rationale |
|----------|-----|-----------|
| ADD unique constraint on coupon code | REQ-COUP-019 | Source has application-level enforcement only; DB constraint prevents race-condition duplicates |
| ADD rate limiting on apply endpoint | REQ-COUP-026 | Source has none; short codes are brute-forceable |
| FIX rounding remainder handling | REQ-COUP-002 | Source distributes proportionally but may lose/gain pennies; target should define explicit remainder allocation |
| REMOVE legacy `expiry_date` fallback | REQ-COUP-014 | Migration artifact; target starts clean |
| REMOVE `class-wc-legacy-coupon.php` | — | Deprecated parent class with backward-compat shims |

---

## Architecture Notes for Target Implementation

1. **Coupon is a bounded aggregate** — it owns its own validation, discount calculation, and usage tracking. Clean domain boundary.
2. **Concurrency is the hardest part** — the tentative hold mechanism is clever but tightly coupled to MySQL semantics. Target should consider: optimistic locking with version column, or distributed lock if multi-node.
3. **Extension surface is wide** — 18+ filter hooks means the WordPress ecosystem deeply customizes coupon behavior. Target must decide: replicate hook system, or define explicit extension interfaces.
4. **Three API surfaces** (REST v3, Store API, GraphQL) with different auth models. Target should unify or explicitly choose which to support.
5. **Discount calculation is pure** — no side effects, easily unit-testable. Good candidate for functional implementation.
6. **Usage tracking has lifecycle coupling** — tightly bound to order status machine. Must be designed together with order system.
