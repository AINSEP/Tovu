# medusa_specs

Extracted research specs from Medusa's open-source commerce platform.

Medusa is mostly inspectable at the source level in this workspace because the core platform is open source and mirrored locally under `../other-repos/medusa/`.

The useful distinction is still important:

- Public and inspectable:
  - the Medusa monorepo in `../other-repos/medusa/`
  - package READMEs and published package boundaries
  - official docs at `docs.medusajs.com`
  - official package contracts exposed through `packages/core/*`, `packages/modules/*`, `packages/admin/*`, `packages/cli/*`, and `packages/plugins/*`
- Observable but not the focus of this extraction:
  - generated admin bundles
  - generated HTTP types / OAS artifacts
  - integration-test behavior
- Opaque or proprietary:
  - Medusa Cloud's hosted control plane and internal operations
  - any hosted telemetry, SaaS orchestration, or internal deployment systems not present in the repo

## Why This Matters To Tovu

Medusa matters to Tovu because it is a strong open reference for:

- modular commerce primitives
- a composed runtime built from swappable modules and providers
- workflows as a first-class coordination layer
- explicit cross-module linking instead of one giant implicit domain graph
- separate store, admin, auth, and hook-facing HTTP surfaces
- admin extensibility with routes, widgets, forms, displays, and i18n contributions

It is especially useful as a contrast to Shopify:

- Shopify shows hosted public-surface discipline
- Medusa shows how a modular open implementation can actually be assembled

## What Tovu May Want To Keep

- domain modules that own their own records and service contracts
- explicit seams for provider adapters such as payment, file, notification, locking, caching, analytics, and auth
- workflow orchestration that coordinates modules without collapsing everything into one service
- a public/store surface separate from privileged operator/admin surfaces
- extension entrypoints that are constrained and discoverable rather than arbitrary code injection
- link definitions for cross-domain relationships instead of hidden ORM coupling

## What Tovu Should Not Copy Blindly

- Medusa's exact package explosion or folder breakdown
- Medusa's exact commerce graph as if it were a universal product model
- provider package names, runtime stack, or Node-specific implementation choices
- route-per-folder conventions as a required Tovu architecture rule
- the assumption that every Tovu subsystem should become a Medusa-style module

The lesson to extract is boundary design, not folder mimicry.

## Current Contents

Interpretation docs:

- [overview.md](overview.md)
- [monorepo-map.md](monorepo-map.md)
- [runtime/runtime-bootstrap-and-module-loading.md](runtime/runtime-bootstrap-and-module-loading.md)
- [runtime/query-graph-and-linking.md](runtime/query-graph-and-linking.md)
- [runtime/workflows-and-orchestration.md](runtime/workflows-and-orchestration.md)
- [runtime/workflow-compensation-and-rollback.md](runtime/workflow-compensation-and-rollback.md)
- [runtime/http-surfaces.md](runtime/http-surfaces.md)
- [runtime/http-contracts-and-route-conventions.md](runtime/http-contracts-and-route-conventions.md)
- [commerce/commerce-primitives.md](commerce/commerce-primitives.md)
- [commerce/product-catalog-module.md](commerce/product-catalog-module.md)
- [commerce/order-lifecycle-module.md](commerce/order-lifecycle-module.md)
- [commerce/payment-module.md](commerce/payment-module.md)
- [commerce/fulfillment-module.md](commerce/fulfillment-module.md)
- [commerce/pricing-module.md](commerce/pricing-module.md)
- [commerce/promotion-module.md](commerce/promotion-module.md)
- [commerce/inventory-module.md](commerce/inventory-module.md)
- [commerce/tax-module.md](commerce/tax-module.md)
- [admin/admin-dashboard-and-extension-surface.md](admin/admin-dashboard-and-extension-surface.md)
- [extensibility/plugins-providers-and-links.md](extensibility/plugins-providers-and-links.md)
- [extensibility/plugin-case-studies-draft-order-and-loyalty.md](extensibility/plugin-case-studies-draft-order-and-loyalty.md)
- [tooling/cli-and-dev-workflow.md](tooling/cli-and-dev-workflow.md)

Corpus navigation and status:

- [index.md](index.md)
- [coverage-audit.md](coverage-audit.md)
- [TODO.md](TODO.md)

Curated evidence inventories:

- [raw-evidence/package-inventory.md](raw-evidence/package-inventory.md)
- [raw-evidence/module-model-inventory.md](raw-evidence/module-model-inventory.md)
- [raw-evidence/api-and-extension-entrypoints.md](raw-evidence/api-and-extension-entrypoints.md)

## Official Source Map

Start with these official Medusa surfaces:

- Root repo and overview:
  - `../other-repos/medusa/README.md`
  - https://github.com/medusajs/medusa
- Main docs:
  - https://docs.medusajs.com
- Architecture:
  - https://docs.medusajs.com/learn/advanced-development/architecture/overview
- Commerce modules:
  - https://docs.medusajs.com/resources/commerce-modules
- Admin extensions:
  - https://docs.medusajs.com
- CLI and project setup:
  - https://docs.medusajs.com/learn

## Recommended Reading Order

1. [overview.md](overview.md)
2. [monorepo-map.md](monorepo-map.md)
3. [commerce/commerce-primitives.md](commerce/commerce-primitives.md)
4. [commerce/product-catalog-module.md](commerce/product-catalog-module.md)
5. [commerce/order-lifecycle-module.md](commerce/order-lifecycle-module.md)
6. [commerce/payment-module.md](commerce/payment-module.md)
7. [commerce/fulfillment-module.md](commerce/fulfillment-module.md)
8. [commerce/pricing-module.md](commerce/pricing-module.md)
9. [commerce/promotion-module.md](commerce/promotion-module.md)
10. [commerce/inventory-module.md](commerce/inventory-module.md)
11. [commerce/tax-module.md](commerce/tax-module.md)
12. [runtime/runtime-bootstrap-and-module-loading.md](runtime/runtime-bootstrap-and-module-loading.md)
13. [runtime/query-graph-and-linking.md](runtime/query-graph-and-linking.md)
14. [runtime/workflows-and-orchestration.md](runtime/workflows-and-orchestration.md)
15. [runtime/workflow-compensation-and-rollback.md](runtime/workflow-compensation-and-rollback.md)
16. [runtime/http-surfaces.md](runtime/http-surfaces.md)
17. [runtime/http-contracts-and-route-conventions.md](runtime/http-contracts-and-route-conventions.md)
18. [admin/admin-dashboard-and-extension-surface.md](admin/admin-dashboard-and-extension-surface.md)
19. [extensibility/plugins-providers-and-links.md](extensibility/plugins-providers-and-links.md)
20. [extensibility/plugin-case-studies-draft-order-and-loyalty.md](extensibility/plugin-case-studies-draft-order-and-loyalty.md)
21. [tooling/cli-and-dev-workflow.md](tooling/cli-and-dev-workflow.md)

Then validate details against:

- [raw-evidence/package-inventory.md](raw-evidence/package-inventory.md)
- [raw-evidence/module-model-inventory.md](raw-evidence/module-model-inventory.md)
- [raw-evidence/api-and-extension-entrypoints.md](raw-evidence/api-and-extension-entrypoints.md)

## Next Decomposition Pass

If we go deeper later, the highest-value follow-ons are:

1. admin extension ergonomics from real plugin examples
2. a DTO-level HTTP parity pass only if Tovu needs route-by-route Medusa compatibility
3. what Medusa solves well for commerce that Tovu should intentionally keep outside core CMS primitives
4. telemetry and operations surfaces if Tovu needs them
