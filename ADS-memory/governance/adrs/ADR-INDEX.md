# Governance ADR Index

Machine-scannable registry of active cross-cutting rules. Implementation agents read this file to determine which governance ADRs apply to their current working set by matching target file paths against scope globs.

| ID | Title | Enforcement | Scope Globs | Status | File |
|---|---|---|---|---|---|
| GOV-ADR-001 | Gated-Mutation Gateway and Watermark Chokepoint Are Shared, Not Reimplemented | MANDATORY | `src/features/**; src/core/gated-mutations/**` | ACCEPTED | `GOV-ADR-001-gated-mutation-gateway-and-watermark-chokepoint.md` |
| GOV-ADR-002 | Site-Wide Gated Operations Share One In-Flight Lock | MANDATORY | `src/features/storage/**; src/features/recovery/**; src/core/operation-lock.ts` | ACCEPTED | `GOV-ADR-002-shared-operation-in-flight-lock.md` |
| GOV-ADR-003 | DDL Generation Never Interpolates Operator-Supplied Input | MANDATORY | `src/features/content-types/**; src/infra/**` | ACCEPTED | `GOV-ADR-003-ddl-generation-never-interpolates-operator-input.md` |

<!-- Add new entries above this line. Keep sorted by ID. -->

<!--
Example row (do not leave uncommented without a real ADR file):
| GOV-ADR-001 | No direct DB access from rendering layer | DEFAULT | `src/templates/**; src/views/**` | ACCEPTED | `GOV-ADR-001-no-db-in-templates.md` |
-->
