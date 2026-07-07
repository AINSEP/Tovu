# ADR Index

Decisions are numbered and immutable once accepted; supersede rather than edit.
Context for ADR-002…009: `tovu-v1-design.md` §8 (weaknesses review) and the
2026-07-01 design session.

| ADR | Decision | Status |
|---|---|---|
| [001](ADR-001-agentic-commerce-platform.md) | Agent-native commerce platform: modular monolith, OperationRegistry, plan/execute | Accepted |
| [002](ADR-002-blessed-rendering-target.md) | React is the blessed v1 rendering target; contracts stay renderer-agnostic; Vue shell → contract test | Accepted |
| [003](ADR-003-plugins-never-get-ddl.md) | Plugins never run DDL; extension fields in namespaced JSON with indexing/promotion policy | Accepted |
| [004](ADR-004-plugin-artifact-format.md) | Plugin artifact: prebuilt ESM + signed manifest, versioned side-by-side in the install dir | Accepted |
| [005](ADR-005-sdk-compatibility-promise.md) | SDK public-API surface, semver, deprecation ladder, API snapshot tests | Accepted |
| [006](ADR-006-ports-rule-of-two.md) | A port requires two plausible adapters, one being built now | Accepted |
| [007](ADR-007-structural-workspace-scoping.md) | `workspaceId` required in every event, repo port, job, cache key (implemented) | Accepted |
| [008](ADR-008-change-sets.md) | Change-set vocabulary (actorId/changeSetId/tables) in v1; full propose/preview/apply/revert later | Accepted |
| [009](ADR-009-decoupling-strategy.md) | Hybrid decoupling: typed calls (sync), outbox events (async), hooks (extension), compensation (multi-step) | Accepted |
| [010](ADR-010-declarative-themes-by-default.md) | Themes are declarative (no code) by default for the third-party library; code themes = trusted mode | Accepted (amends 002) |
| [011](ADR-011-deployment-topologies-open-design-host.md) | Two topologies: standalone single binary (primary) + open-design Electron desktop as multi-site AI host; arrow points open-design → Tovu only | Accepted |
| [012](ADR-012-site-template-and-instantiation.md) | New sites instantiate a versioned template into the install-dir; runtime is shared, not copied per site; full copy only at binary export (implements 011's fork/export) | Accepted |
| [013](ADR-013-assistant-copilotkit-agui-tool-surface.md) | Assistant = one CopilotKit client + one AG-UI daemon agent; `tools.ts` registry with an execution `surface` (frontend/data) is the seam; agent detection ported from OD; composer rebuilt headless, not ported | Accepted |
| [014](ADR-014-assistant-profiles-layered-capability-manifest.md) | One assistant engine + N declarative Profiles (consumer/admin/operator); registry entry adds `contexts`/`scope`/`auth`/`effect` axes; manifest layered across Tovu (site tools) + Tovu-Runner (operator tools); filter enforced server-side | Accepted (extends 013) |
