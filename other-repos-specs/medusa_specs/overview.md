# Medusa Overview

## 1. Summary

Medusa is an open-source commerce platform assembled from many packages rather than one dominant application core.

The repo shows five major surfaces:

- an assembled runtime app in `packages/medusa`
- reusable framework and orchestration packages in `packages/core`
- domain modules in `packages/modules`
- operator UI and admin extension tooling in `packages/admin`
- CLI, plugins, tests, and development tooling in `packages/cli`, `packages/plugins`, and `integration-tests`

The main architectural move is not "monorepo" by itself. It is:

- domain ownership is pushed into modules
- runtime composition happens through loaders and config
- provider-specific behavior lives in provider packages
- workflows coordinate cross-module operations
- explicit link definitions stitch modules together

## 2. Key Primitives / Contracts

Medusa's primitive families, visible from package names and model inventories, include:

- catalog:
  - product
  - product variant
  - product option
  - category
  - collection
  - tag
  - type
  - image
- pricing and merchandising:
  - price set
  - price
  - price list
  - price rules
  - promotion
  - campaign
- commerce execution:
  - cart
  - line item
  - shipping method
  - payment collection
  - payment session
  - payment
  - order
  - order change
  - return
  - claim
  - exchange
- operators and access:
  - auth identity
  - user
  - invite
  - api key
  - RBAC role and policy
- fulfillment and inventory:
  - inventory item
  - inventory level
  - reservation
  - stock location
  - fulfillment set
  - shipping option
  - shipping profile
  - fulfillment provider
- configuration and localization:
  - region
  - currency
  - locale
  - store
  - translation
  - settings
  - user preference

These primitives are intentionally spread across many module packages rather than hidden under one central commerce ORM model.

## 3. Boundaries and Constraints

The repo structure makes several constraints visible:

- `packages/medusa` is the assembled application, not the whole architecture.
- `packages/core/*` exports generic runtime machinery such as framework, modules SDK, workflows SDK, orchestration, utilities, and types.
- `packages/modules/*` owns domain state and services.
- `packages/modules/providers/*` owns provider-specific adapters such as Stripe, SendGrid, S3, Redis, Postgres advisory locks, and OAuth providers.
- `packages/plugins/*` proves the platform can extend itself with feature packages that contribute APIs, admin UI, modules, jobs, links, subscribers, and workflows.
- `packages/admin/*` shows that the operator surface is treated as its own extensible product surface rather than just another backend concern.

The important consequence is that Medusa is not organized around one inseparable "commerce core." It is organized around composition points.

## 4. Operational Implications

- The platform is highly adaptable because providers and plugins are split out cleanly.
- The platform is also cognitively heavier than a smaller modular monolith because understanding behavior often requires tracing module, workflow, and link boundaries.
- Cross-domain behavior is deliberately mediated by workflows, links, and query abstractions rather than one giant relational model.
- Admin customization is controlled through explicit extension types rather than full host takeover.

## 5. Tovu Reconstruction Notes

### Why this exists

This overview exists to keep Tovu focused on Medusa's architectural posture: modular composition, swappable adapters, and explicit coordination layers.

### What Tovu should preserve

- domain ownership by bounded subsystem
- explicit composition roots
- clear separation between domain modules, provider adapters, and operator UI
- first-class extension seams instead of ad hoc hacks in the core

### What Tovu can simplify

- fewer packages if the same seam can be preserved with less structural overhead
- less commerce-specific naming in the core if Tovu wants broader platform primitives
- a smaller number of extension types if that improves reliability and comprehension

### Possible Tovu seams

- `CommerceModulePort`
- `WorkflowOrchestratorPort`
- `ExtensionContributionRegistry`
- `AdminExtensionSurface`
- `CrossModuleLinkPort`

### Suggested priority

- `V1`: preserve the modular posture
- `Later`: decide how much package granularity is actually justified in Tovu
