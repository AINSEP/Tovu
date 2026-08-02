# Architecture Context Packet

This file is the compact shared context packet for future LLM sessions in this repo.

It is not the canonical architecture source. Its job is to compress the current architecture into a reliable starting packet, then point the reader to the exact authoritative files for deeper detail.

## Source Of Truth

1. [`../../tovu-architecture.md`](../../tovu-architecture.md)
2. verified extracts in [`sections/`](sections/) and [`appendices/`](appendices/)
3. [`MIGRATION-MAP.yaml`](MIGRATION-MAP.yaml) for exact lookup and integrity proof
4. human guidance docs in this folder: [`README.md`](README.md), [`CONTEXT-PACKET.md`](CONTEXT-PACKET.md), [`LLM-NAVIGATION.md`](LLM-NAVIGATION.md), [`READING-ORDER.md`](READING-ORDER.md), and [`HANDOFF-PROTOCOL.md`](HANDOFF-PROTOCOL.md)
5. machine-readable guidance: [`CONTEXT-PACKET.yaml`](CONTEXT-PACKET.yaml) and [`LLM-ROUTING.yaml`](LLM-ROUTING.yaml)
6. `reference/` as background only

## Current Repo Reality

- Tovu is still in architecture-and-scaffold stage, not full product build-out.
- [`../../tovu-architecture.md`](../../tovu-architecture.md) is the active architecture source.
- [`../../tovu/`](../../tovu/) is an implementation scaffold, not a finished platform.
- [`../../wordpress_specs/`](../../wordpress_specs/) stays top-level as a learning and reference set.
- [`../../other-repos/`](../../other-repos/) contains local external repos and is gitignored.

## What Tovu Is Trying To Be

Tovu is aiming at an AI-native CMS/platform with long-lived modular boundaries. The architecture is intentionally designed so infrastructure, adapters, and implementation libraries can change over time without forcing a rewrite of core domain logic.

The stable architectural direction in the current docs is:

- modular monolith, not premature microservices
- ports and adapters around every important external dependency
- domain-driven boundaries with strict dependency direction
- vertical slices inside modules for delivery
- plugin and theme support without letting extensions break core boundaries
- future-facing replaceability instead of provider-coupled shortcuts

Read for this:
- [`sections/01-architectural-foundation.md`](sections/01-architectural-foundation.md)
- [`sections/02-core-design-principle-dependency-inversion-everywhere.md`](sections/02-core-design-principle-dependency-inversion-everywhere.md)

## Core Boundary Rules

- Dependencies point inward only.
- Core packages never import adapters.
- No circular dependencies anywhere.
- No core dependency inversion violations; enforcement uses TypeScript project references, lint rules, and exports maps.
- No "temporary" direct dependency on provider SDKs inside core/domain packages.

Read for this:
- [`sections/02-core-design-principle-dependency-inversion-everywhere.md`](sections/02-core-design-principle-dependency-inversion-everywhere.md)
- [`sections/10-dependency-rules.md`](sections/10-dependency-rules.md)
- [`sections/11-architecture-enforcement.md`](sections/11-architecture-enforcement.md)

## Section 13 Friction Constraints

- Every user-friction capability should be implemented as a bounded module with a stable port contract.
- Keep policies/rules declarative and versioned, not hardcoded into adapters.
- Support multiple adapters per capability instead of provider-coupled fixes.
- Enforce contract tests so adapters are interchangeable by behavior, not naming.
- No friction fix should be added as a one-off special case inside kernel internals.
- If a fix cannot be expressed behind a stable interface and tested as a swappable module, redesign it before shipping.

Read for this:
- [`sections/13-user-friction-coverage-living-backlog.md`](sections/13-user-friction-coverage-living-backlog.md)

## Section 14 Delivery Rules

- No code generation before M1 (spec) and M2 (architecture decision) are written.
- No adapter merge without contract tests for the target port.
- No core dependency inversion violations (enforced by lint + project references).
- No critical feature ships without rollback or safe-disable path.
- No "temporary" direct dependency on provider SDKs inside core/domain packages.

Read for this:
- [`sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md`](sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md)

## Exploration Rules

- Vibe-coding is allowed only for bounded exploration.
- Keep spikes isolated under `experiments/` and out of core runtime paths.
- Promote spike code only by rewriting against the approved spec and tests.
- If spike behavior cannot be specified and tested, it does not graduate.

Read for this:
- [`sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md`](sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md)

## Active Architecture Areas

These are the main active architecture topics already defined in the canonical document:

- package/module structure
- port interfaces
- kernel / composition root
- configuration
- theme engine
- plugin SDK
- API layer
- dependency rules and enforcement
- swappability examples
- user-friction coverage backlog
- meta-coding workflow

Read for this:
- [`sections/03-package-structure.md`](sections/03-package-structure.md)
- [`sections/04-port-interfaces.md`](sections/04-port-interfaces.md)
- [`sections/05-the-kernel-ioc-container.md`](sections/05-the-kernel-ioc-container.md)
- [`sections/06-configuration.md`](sections/06-configuration.md)
- [`sections/07-theme-engine.md`](sections/07-theme-engine.md)
- [`sections/08-plugin-sdk.md`](sections/08-plugin-sdk.md)
- [`sections/09-api-layer.md`](sections/09-api-layer.md)

## User-Friction Backlog Matters

Section 13 is not just product thinking. It constrains architecture. Tovu should solve hard CMS pain in a modular, swappable way. The backlog already names the failure clusters and the expected seam shape for each one.

Examples include:

- update safety and rollback
- error diagnosis and recovery
- extension conflict isolation
- security trust and quarantine
- performance attribution
- authoring safety
- migration portability
- preview and environment parity

Any proposal that ignores these seams is not aligned with the current architecture.

Read for this:
- [`sections/13-user-friction-coverage-living-backlog.md`](sections/13-user-friction-coverage-living-backlog.md)

## What Appendix Material Means

The appendix is a pattern library, not an adoption ledger.

- A pattern appearing there does not mean Tovu has adopted it.
- Use appendices to evaluate future options.
- Always map appendix ideas back to the active sections before proposing adoption.

Start here:
- [`appendices/00-architectural-patterns-reference.md`](appendices/00-architectural-patterns-reference.md)

## Minimal Read Sets By Task

- Architecture proposal:
  [`sections/00-document-header.md`](sections/00-document-header.md),
  [`sections/01-architectural-foundation.md`](sections/01-architectural-foundation.md),
  [`sections/02-core-design-principle-dependency-inversion-everywhere.md`](sections/02-core-design-principle-dependency-inversion-everywhere.md),
  [`sections/10-dependency-rules.md`](sections/10-dependency-rules.md),
  [`sections/11-architecture-enforcement.md`](sections/11-architecture-enforcement.md),
  [`sections/13-user-friction-coverage-living-backlog.md`](sections/13-user-friction-coverage-living-backlog.md),
  [`sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md`](sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md)
- Package/layout question:
  [`sections/03-package-structure.md`](sections/03-package-structure.md),
  [`sections/04-port-interfaces.md`](sections/04-port-interfaces.md),
  [`sections/05-the-kernel-ioc-container.md`](sections/05-the-kernel-ioc-container.md),
  [`sections/10-dependency-rules.md`](sections/10-dependency-rules.md)
- Theme/plugin/extensibility question:
  [`sections/07-theme-engine.md`](sections/07-theme-engine.md),
  [`sections/08-plugin-sdk.md`](sections/08-plugin-sdk.md),
  [`sections/10-dependency-rules.md`](sections/10-dependency-rules.md),
  [`sections/13-user-friction-coverage-living-backlog.md`](sections/13-user-friction-coverage-living-backlog.md),
  [`sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md`](sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md)
- Planning or implementation sequencing:
  [`sections/13-user-friction-coverage-living-backlog.md`](sections/13-user-friction-coverage-living-backlog.md),
  [`sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md`](sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md)

## Safe Session Workflow

1. Start from this packet.
2. Confirm the question type.
3. Read the minimal read set for that question.
4. If proposing change, check Section 13 and Section 14 explicitly.
5. If exact wording matters, go back to [`../../tovu-architecture.md`](../../tovu-architecture.md) or the verified extracts.
6. If a pattern comes from the appendix or `reference/`, mark it as exploratory unless the active sections explicitly adopt it.

## Anti-Patterns

- treating this packet as canonical
- citing `reference/` as if it overrides the root architecture doc
- proposing provider-coupled core logic
- skipping Section 13 or Section 14 when making architecture or implementation proposals
- editing extracts instead of the canonical root when changing architecture
