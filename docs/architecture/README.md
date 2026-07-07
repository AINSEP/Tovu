# Architecture Hub

[`tovu-architecture.md`](../../tovu-architecture.md) remains the canonical architecture source. The files under `sections/` and `appendices/` are verified mechanical extracts created to improve navigation without changing content.

## Read First

- Shared packet for future sessions: [`CONTEXT-PACKET.md`](CONTEXT-PACKET.md)
- Humans: start here, then use [`READING-ORDER.md`](READING-ORDER.md)
- LLMs: start with [`LLM-NAVIGATION.md`](LLM-NAVIGATION.md)
- Tooling or retrieval pipelines: use [`LLM-ROUTING.yaml`](LLM-ROUTING.yaml)
- LLM handoffs and debate setup: [`HANDOFF-PROTOCOL.md`](HANDOFF-PROTOCOL.md)

## Source Precedence

1. [`tovu-architecture.md`](../../tovu-architecture.md)
2. verified extracts in `sections/` and `appendices/`
3. [`MIGRATION-MAP.yaml`](MIGRATION-MAP.yaml)
4. human guidance docs in this folder: [`README.md`](README.md), [`CONTEXT-PACKET.md`](CONTEXT-PACKET.md), [`LLM-NAVIGATION.md`](LLM-NAVIGATION.md), [`READING-ORDER.md`](READING-ORDER.md), and [`HANDOFF-PROTOCOL.md`](HANDOFF-PROTOCOL.md)
5. machine-readable guidance: [`CONTEXT-PACKET.yaml`](CONTEXT-PACKET.yaml) and [`LLM-ROUTING.yaml`](LLM-ROUTING.yaml)
6. `reference/`

## Ground Rules

- Edit the root canonical document first when architecture content changes.
- Re-run [`verify-architecture-split.sh`](../../scripts/verify-architecture-split.sh) after any canonical change.
- Do not treat `reference/` as the source of truth for active Tovu decisions.
- Do not hand-edit the extracted files unless you are intentionally regenerating the split from the canonical source.

## Fast Routes

- Architecture change or module boundary question:
  [`sections/00-document-header.md`](sections/00-document-header.md),
  [`sections/01-architectural-foundation.md`](sections/01-architectural-foundation.md),
  [`sections/02-core-design-principle-dependency-inversion-everywhere.md`](sections/02-core-design-principle-dependency-inversion-everywhere.md),
  [`sections/10-dependency-rules.md`](sections/10-dependency-rules.md),
  [`sections/11-architecture-enforcement.md`](sections/11-architecture-enforcement.md),
  [`sections/13-user-friction-coverage-living-backlog.md`](sections/13-user-friction-coverage-living-backlog.md),
  [`sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md`](sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md)
- Package and module layout:
  [`sections/03-package-structure.md`](sections/03-package-structure.md),
  [`sections/04-port-interfaces.md`](sections/04-port-interfaces.md),
  [`sections/05-the-kernel-ioc-container.md`](sections/05-the-kernel-ioc-container.md)
- Themes and plugins:
  [`sections/07-theme-engine.md`](sections/07-theme-engine.md),
  [`sections/08-plugin-sdk.md`](sections/08-plugin-sdk.md),
  [`sections/10-dependency-rules.md`](sections/10-dependency-rules.md)
- Runtime configuration and API surface:
  [`sections/06-configuration.md`](sections/06-configuration.md),
  [`sections/09-api-layer.md`](sections/09-api-layer.md)
- Future-pattern exploration:
  [`appendices/00-architectural-patterns-reference.md`](appendices/00-architectural-patterns-reference.md),
  then the specific appendix file you need

## Phase 1 Split

- `sections/`: the document header plus one extracted file per numbered top-level section from `tovu-architecture.md`
- `appendices/`: the appendix root heading plus one extracted file per appendix item
- `reference/`: supporting architecture references kept unchanged
- [`MIGRATION-MAP.yaml`](MIGRATION-MAP.yaml): source-line and hash ledger for every extracted file
- [`verify-architecture-split.sh`](../../scripts/verify-architecture-split.sh): byte-for-byte reassembly proof

## Sections

- [Tovu Architecture](sections/00-document-header.md)
- [1. Architectural Foundation](sections/01-architectural-foundation.md)
- [2. Core Design Principle: Dependency Inversion Everywhere](sections/02-core-design-principle-dependency-inversion-everywhere.md)
- [3. Package Structure](sections/03-package-structure.md)
- [4. Port Interfaces](sections/04-port-interfaces.md)
- [5. The Kernel (IoC Container)](sections/05-the-kernel-ioc-container.md)
- [6. Configuration](sections/06-configuration.md)
- [7. Theme Engine](sections/07-theme-engine.md)
- [8. Plugin SDK](sections/08-plugin-sdk.md)
- [9. API Layer](sections/09-api-layer.md)
- [10. Dependency Rules](sections/10-dependency-rules.md)
- [11. Architecture Enforcement](sections/11-architecture-enforcement.md)
- [12. Swappability Examples](sections/12-swappability-examples.md)
- [13. User Friction Coverage (Living Backlog)](sections/13-user-friction-coverage-living-backlog.md)
- [14. Meta-Coding Framework (Spec-First + Test-First + Pattern-First)](sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md)

## Appendices

- [Appendix: Architectural Patterns Reference](appendices/00-architectural-patterns-reference.md)
- [A1. Vertical Slice Architecture (Jimmy Bogard)](appendices/A01-vertical-slice-architecture-jimmy-bogard.md)
- [A2. CQRS (Command Query Responsibility Segregation)](appendices/A02-cqrs-command-query-responsibility-segregation.md)
- [A3. Event Sourcing](appendices/A03-event-sourcing.md)
- [A4. Microservices](appendices/A04-microservices.md)
- [A5. Service Mesh](appendices/A05-service-mesh.md)
- [A6. Architecture Comparison Table](appendices/A06-architecture-comparison-table.md)
- [A7. Hybrid Approach: Modular Monolith + Event Sourcing + DDD + CQRS](appendices/A07-hybrid-approach-modular-monolith-event-sourcing-ddd-cqrs.md)
- [A8. MCP (Model Context Protocol)](appendices/A08-mcp-model-context-protocol.md)
- [A9. AG-UI (Agent-User Interaction Protocol)](appendices/A09-ag-ui-agent-user-interaction-protocol.md)
- [A10. Compound AI Systems](appendices/A10-compound-ai-systems.md)
- [A11. Agentic RAG](appendices/A11-agentic-rag.md)
- [A12. Tool-Use-First Architecture](appendices/A12-tool-use-first-architecture.md)
- [A13. Memory Architectures](appendices/A13-memory-architectures.md)
- [A14. Structured Outputs / Constrained Decoding](appendices/A14-structured-outputs-constrained-decoding.md)
- [A15. Prompt Caching](appendices/A15-prompt-caching.md)
- [A16. Local-First / Sync Engines (Electric SQL)](appendices/A16-local-first-sync-engines-electric-sql.md)
- [A17. HTAP (Hybrid Transactional/Analytical Processing)](appendices/A17-htap-hybrid-transactional-analytical-processing.md)
- [A18. Embedded Databases / SQLite Renaissance (Turso, D1)](appendices/A18-embedded-databases-sqlite-renaissance-turso-d1.md)
- [A19. Vector Databases Going Hybrid (pgvector in Postgres)](appendices/A19-vector-databases-going-hybrid-pgvector-in-postgres.md)
- [A20. Graph Capabilities in SQL (Apache AGE)](appendices/A20-graph-capabilities-in-sql-apache-age.md)
- [A21. Database Branching (Neon, PlanetScale)](appendices/A21-database-branching-neon-planetscale.md)
- [A22. Incremental View Maintenance](appendices/A22-incremental-view-maintenance.md)
- [A23. Edge-First Architecture](appendices/A23-edge-first-architecture.md)
- [A24. Islands Architecture](appendices/A24-islands-architecture.md)
- [A25. React Server Components](appendices/A25-react-server-components.md)
- [A26. Effect Systems (Effect-TS)](appendices/A26-effect-systems-effect-ts.md)
