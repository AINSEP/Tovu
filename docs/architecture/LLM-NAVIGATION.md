# LLM Navigation

Use this file as the compact routing layer for architecture questions in this repo.

## Start Here

1. Read [`CONTEXT-PACKET.md`](CONTEXT-PACKET.md) first.
2. Treat [`../../tovu-architecture.md`](../../tovu-architecture.md) as the canonical source.
3. Use `sections/` and `appendices/` for targeted reads after you know which part you need.
4. Use [`MIGRATION-MAP.yaml`](MIGRATION-MAP.yaml) only to prove location and integrity, not to infer new design.
5. Treat `reference/` as background material, not active architecture truth.

## Authority Order

1. [`../../tovu-architecture.md`](../../tovu-architecture.md)
2. verified extracts in [`sections/`](sections/) and [`appendices/`](appendices/)
3. [`MIGRATION-MAP.yaml`](MIGRATION-MAP.yaml)
4. human guidance docs in this folder: [`README.md`](README.md), [`CONTEXT-PACKET.md`](CONTEXT-PACKET.md), [`LLM-NAVIGATION.md`](LLM-NAVIGATION.md), [`READING-ORDER.md`](READING-ORDER.md), and [`HANDOFF-PROTOCOL.md`](HANDOFF-PROTOCOL.md)
5. machine-readable guidance: [`CONTEXT-PACKET.yaml`](CONTEXT-PACKET.yaml) and [`LLM-ROUTING.yaml`](LLM-ROUTING.yaml)
6. `reference/`

## Minimal Read Sets

- Any proposal that changes architecture, dependency direction, or platform modules:
  [`sections/00-document-header.md`](sections/00-document-header.md),
  [`sections/01-architectural-foundation.md`](sections/01-architectural-foundation.md),
  [`sections/02-core-design-principle-dependency-inversion-everywhere.md`](sections/02-core-design-principle-dependency-inversion-everywhere.md),
  [`sections/10-dependency-rules.md`](sections/10-dependency-rules.md),
  [`sections/11-architecture-enforcement.md`](sections/11-architecture-enforcement.md),
  [`sections/13-user-friction-coverage-living-backlog.md`](sections/13-user-friction-coverage-living-backlog.md),
  [`sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md`](sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md)
- Package layout or module ownership:
  [`sections/03-package-structure.md`](sections/03-package-structure.md),
  [`sections/04-port-interfaces.md`](sections/04-port-interfaces.md),
  [`sections/05-the-kernel-ioc-container.md`](sections/05-the-kernel-ioc-container.md),
  [`sections/10-dependency-rules.md`](sections/10-dependency-rules.md)
- Plugin, extension, or theme behavior:
  [`sections/07-theme-engine.md`](sections/07-theme-engine.md),
  [`sections/08-plugin-sdk.md`](sections/08-plugin-sdk.md),
  [`sections/10-dependency-rules.md`](sections/10-dependency-rules.md),
  [`sections/13-user-friction-coverage-living-backlog.md`](sections/13-user-friction-coverage-living-backlog.md),
  [`sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md`](sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md)
- Runtime config, transport, or API shape:
  [`sections/06-configuration.md`](sections/06-configuration.md),
  [`sections/09-api-layer.md`](sections/09-api-layer.md),
  [`sections/10-dependency-rules.md`](sections/10-dependency-rules.md)
- Implementation planning:
  target feature section plus
  [`sections/13-user-friction-coverage-living-backlog.md`](sections/13-user-friction-coverage-living-backlog.md) and
  [`sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md`](sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md)

## Question Routing

- “What are the non-negotiable architecture rules?”
  Read [`sections/01-architectural-foundation.md`](sections/01-architectural-foundation.md),
  [`sections/02-core-design-principle-dependency-inversion-everywhere.md`](sections/02-core-design-principle-dependency-inversion-everywhere.md),
  [`sections/10-dependency-rules.md`](sections/10-dependency-rules.md),
  and [`sections/11-architecture-enforcement.md`](sections/11-architecture-enforcement.md)
- “How should the repo or packages be structured?”
  Read [`sections/03-package-structure.md`](sections/03-package-structure.md),
  [`sections/04-port-interfaces.md`](sections/04-port-interfaces.md),
  and [`sections/05-the-kernel-ioc-container.md`](sections/05-the-kernel-ioc-container.md)
- “How do themes and plugins fit?”
  Read [`sections/07-theme-engine.md`](sections/07-theme-engine.md) and [`sections/08-plugin-sdk.md`](sections/08-plugin-sdk.md)
- “What user pain must the architecture solve?”
  Read [`sections/13-user-friction-coverage-living-backlog.md`](sections/13-user-friction-coverage-living-backlog.md)
- “What process constraints govern coding and planning?”
  Read [`sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md`](sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md)
- “What patterns are being considered but are not yet active commitments?”
  Read [`appendices/00-architectural-patterns-reference.md`](appendices/00-architectural-patterns-reference.md) and then the relevant appendix item

## Do Not Do This

- Do not cite `reference/` or appendices as if they override active architecture decisions.
- Do not hand-edit extracted section files if the real intent is to change architecture; update the canonical root first.
- Do not propose shortcuts that violate dependency inversion, swappability, or the Section 13 and 14 rules.
- Do not assume a pattern documented in the appendix is already adopted by Tovu.
