# Medusa Spec Coverage Audit

**Audit date:** 2026-04-22

**Audit baseline:**

- Source tree: `other-repos/medusa/`
- Spec corpus: `other-repos-specs/medusa_specs/`

This file records the current Medusa extraction state after a fourth pass that added plugin case studies on top of the broader commerce/runtime decomposition.

---

## 1. Working Conclusion

The Medusa corpus is now extracted beyond the boundary-only level for its most important commerce slices.

The current pass covers the major product and system boundaries that matter most to Tovu:

- monorepo layout and package groups
- runtime bootstrap and module assembly
- query graph and link composition
- workflows and orchestration
- workflow compensation and rollback behavior
- public/admin/auth-facing HTTP surfaces
- deeper HTTP contract and route-convention patterns
- commerce primitives and cross-module relationships
- module-level deep dives for product, order, payment, fulfillment, pricing, promotion, inventory, and tax
- admin dashboard and extension boundaries
- providers, plugins, and link modules
- plugin case studies from `draft-order` and `loyalty`
- CLI and development workflow

This is enough to reason about Medusa's architectural seams and its main commerce-module posture without pretending the corpus is exhaustive at the package-internal level.

---

## 2. Area Matrix

### Top-level system shape

Status: `Covered`

Covered by:

- `README.md`
- `overview.md`
- `monorepo-map.md`

### Runtime bootstrap and composition

Status: `Covered`

Covered by:

- `runtime/runtime-bootstrap-and-module-loading.md`
- `extensibility/plugins-providers-and-links.md`

### Workflows and orchestration

Status: `Covered (coordination plus rollback/compensation level)`

Covered by:

- `runtime/workflows-and-orchestration.md`
- `runtime/workflow-compensation-and-rollback.md`
- `commerce/product-catalog-module.md`
- `commerce/order-lifecycle-module.md`
- `commerce/payment-module.md`
- `commerce/fulfillment-module.md`

### HTTP surfaces

Status: `Covered (zone-level plus route-contract level)`

Covered by:

- `runtime/http-surfaces.md`
- `runtime/http-contracts-and-route-conventions.md`
- `raw-evidence/api-and-extension-entrypoints.md`

### Commerce primitives and domain ownership

Status: `Covered (module-level across core commerce slices)`

Covered by:

- `commerce/commerce-primitives.md`
- `commerce/product-catalog-module.md`
- `commerce/order-lifecycle-module.md`
- `commerce/payment-module.md`
- `commerce/fulfillment-module.md`
- `commerce/pricing-module.md`
- `commerce/promotion-module.md`
- `commerce/inventory-module.md`
- `commerce/tax-module.md`
- `raw-evidence/module-model-inventory.md`

### Query graph and link semantics

Status: `Covered`

Covered by:

- `runtime/query-graph-and-linking.md`
- `extensibility/plugins-providers-and-links.md`

### Admin shell and admin extensibility

Status: `Covered (composition-level)`

Covered by:

- `admin/admin-dashboard-and-extension-surface.md`
- `extensibility/plugin-case-studies-draft-order-and-loyalty.md`

### Plugin case studies

Status: `Covered (two representative plugin shapes)`

Covered by:

- `extensibility/plugins-providers-and-links.md`
- `extensibility/plugin-case-studies-draft-order-and-loyalty.md`

### Tooling and developer workflow

Status: `Covered`

Covered by:

- `tooling/cli-and-dev-workflow.md`

### Curated evidence inventory layer

Status: `Covered (inventory-level)`

Covered by:

- `raw-evidence/package-inventory.md`
- `raw-evidence/module-model-inventory.md`
- `raw-evidence/api-and-extension-entrypoints.md`

Note:

- These files are curated evidence inventories derived from the local source tree, not verbatim schema dumps or exhaustive raw exports.

### Cloud / hosted operational internals

Status: `Intentionally out of scope`

Reason:

- Medusa Cloud operational internals are not present in the local repo mirror.
- This corpus is about open platform boundaries, not inferred SaaS internals.

### Design system internals

Status: `Partial`

Current state:

- the admin dashboard and extension surface are covered
- the standalone `@medusajs/ui` and design-system package internals are not decomposed deeply

### Telemetry / observability internals

Status: `Partial`

Current state:

- runtime bootstrap notes telemetry as a framework surface
- no dedicated telemetry deep dive exists yet

---

## 3. Residual Notes

- The corpus is stronger on architecture and boundary design than on every individual module service method.
- All major commerce modules that matter most to Tovu now have useful module-level decomposition.
- Workflow rollback is now covered explicitly, but this is still not the same thing as proving every workflow edge case through route-by-route test fixtures.
- HTTP contract conventions are now covered, but not every Medusa DTO or every route payload has been cataloged exhaustively.
- Admin extension behavior is covered at the composition level, and plugin case studies now exist, but a stricter authoring/SDK ergonomics pass still does not.
- The `draft-order` case study is partly bounded by generated package exports; its admin and HTTP surfaces are directly visible, but some server-side internals are more visible through package exports and Medusa's public writeups than through checked-in source files alone.

---

## 4. Current Assessment

Medusa should no longer be treated as "not yet extracted."

The current corpus is good enough for:

- comparing Medusa to Shopify and Directus at the architectural-boundary level
- reasoning about how Medusa decomposes catalog, pricing, promotion, inventory, tax, order, payment, and fulfillment responsibilities
- understanding how Medusa composes modules into one system without one giant commerce schema
- understanding how Medusa handles compensation-aware workflows and thin workflow-backed HTTP handlers
- understanding two real plugin shapes Medusa supports in practice
- identifying which Medusa patterns are portable to Tovu
- rejecting the patterns that would couple Tovu too tightly to Medusa's implementation style

Future work is optional refinement, not a blocker to using the corpus.

---

## Tovu Reconstruction Notes

### Why this exists

This audit exists so Medusa research does not become fake completeness. Tovu needs a clear statement of which Medusa surfaces are already captured and which areas remain intentionally broad or out of scope.

### What Tovu should preserve

- explicit `covered`, `partial`, and `out of scope` states
- a distinction between architecture coverage and package-internal completeness
- follow-on decomposition driven by Tovu needs, not by source-tree perfectionism

### What Tovu can simplify

- do not turn Medusa extraction into a package-by-package encyclopedia unless a Tovu slice actually needs it
- keep future audits lightweight and update them after meaningful new passes

### Possible Tovu seams

- `docs/research/medusa/coverage-audit.md` as the living state ledger
- future architecture decisions can cite this audit before opening another repo sweep

### Suggested priority

- `V1`: keep current while Medusa is serving as both a commerce-boundary and module-decomposition reference
- `Later`: deepen only plugin/runtime areas or DTO-level API details that map directly to Tovu platform seams
