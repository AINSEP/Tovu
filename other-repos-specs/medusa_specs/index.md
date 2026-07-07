# Medusa Specs — Corpus Index

## Navigational docs

- [README.md](README.md) — what this corpus is, why Medusa matters to Tovu, what to keep, what not to copy
- [coverage-audit.md](coverage-audit.md) — current coverage, partial areas, and follow-on gaps
- [TODO.md](TODO.md) — operational next steps only
- [index.md](index.md) — this file

## Synthesized interpretation docs

- [overview.md](overview.md) — Medusa's major surfaces, system shape, and primitive families
- [monorepo-map.md](monorepo-map.md) — top-level package map and how responsibilities are split
- [commerce/commerce-primitives.md](commerce/commerce-primitives.md) — commerce entities, module ownership, and link relationships
- [commerce/product-catalog-module.md](commerce/product-catalog-module.md) — deeper breakdown of catalog ownership, variant structure, and externalized pricing/inventory/channel links
- [commerce/order-lifecycle-module.md](commerce/order-lifecycle-module.md) — deeper breakdown of order state, edits, returns, claims, exchanges, and post-checkout workflows
- [commerce/payment-module.md](commerce/payment-module.md) — payment collections, sessions, providers, webhooks, and payment-side workflow boundaries
- [commerce/fulfillment-module.md](commerce/fulfillment-module.md) — shipping topology, option policy, provider loading, and fulfillment execution boundaries
- [commerce/pricing-module.md](commerce/pricing-module.md) — price sets, price lists, contextual resolution, and why pricing stays separate from promotions and tax
- [commerce/promotion-module.md](commerce/promotion-module.md) — promotions, campaigns, budgets, rule targeting, and cart adjustment computation
- [commerce/inventory-module.md](commerce/inventory-module.md) — inventory items, location levels, reservation accounting, and stock validation boundaries
- [commerce/tax-module.md](commerce/tax-module.md) — tax regions, rates, provider loading, and tax-line calculation boundaries
- [runtime/runtime-bootstrap-and-module-loading.md](runtime/runtime-bootstrap-and-module-loading.md) — container init, module loading, entrypoints, worker modes
- [runtime/query-graph-and-linking.md](runtime/query-graph-and-linking.md) — joiner configs, remote query, link modules, and cross-module composition
- [runtime/workflows-and-orchestration.md](runtime/workflows-and-orchestration.md) — workflows SDK, orchestration layer, workflow engines, and cross-module coordination
- [runtime/workflow-compensation-and-rollback.md](runtime/workflow-compensation-and-rollback.md) — explicit compensation handlers, rollback payloads, durable execution states, and async step failure/success reporting
- [runtime/http-surfaces.md](runtime/http-surfaces.md) — admin/store/auth/cloud/hooks HTTP surfaces and route patterns
- [runtime/http-contracts-and-route-conventions.md](runtime/http-contracts-and-route-conventions.md) — validators, query configs, workflow-backed writes, and route-level contract discipline
- [admin/admin-dashboard-and-extension-surface.md](admin/admin-dashboard-and-extension-surface.md) — dashboard shell, extension zones, admin bundling
- [extensibility/plugins-providers-and-links.md](extensibility/plugins-providers-and-links.md) — providers, plugins, links, remote query, and external modules
- [extensibility/plugin-case-studies-draft-order-and-loyalty.md](extensibility/plugin-case-studies-draft-order-and-loyalty.md) — contrast between an admin-first workflow plugin and a fuller vertical plugin with modules, links, APIs, workflows, and subscribers
- [tooling/cli-and-dev-workflow.md](tooling/cli-and-dev-workflow.md) — project creation, migrations, link sync, plugin build loop, integration tests

## Curated evidence inventories

- [raw-evidence/package-inventory.md](raw-evidence/package-inventory.md) — package groups, package names, and package descriptions from the local mirror
- [raw-evidence/module-model-inventory.md](raw-evidence/module-model-inventory.md) — model files present in each commerce/runtime module
- [raw-evidence/api-and-extension-entrypoints.md](raw-evidence/api-and-extension-entrypoints.md) — visible API zones, admin routes, plugin entrypoint types, and test surfaces
