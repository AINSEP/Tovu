## 13. User Friction Coverage (Living Backlog)

This section maps the major user-frustration clusters into architecture capabilities Tovu must support over time.
It is intentionally a living backlog, not a claim that everything below is already solved.

### 13.1 Main Issue Families to Solve

These are the primary clusters to keep in focus. The earlier "top 10" list was a priority cut, not the full main set.

| ID | User-Visible Failure Pattern | Required Capability (What Tovu Must Do) | Swappable Seam (Port/Module) |
|---|---|---|---|
| UF-01 | A routine core/plugin/theme update breaks production (500s, layout collapse, admin lockout). | Preflight checks, canary rollout, automatic rollback to last-known-good, and safe-mode boot path. | `UpdateSafetyPort` + `ReleasePolicyEngine` |
| UF-02 | Users see generic "critical error" messages and cannot identify root cause quickly. | Error fingerprinting, dependency blame, guided remediation steps, and one-click recovery actions. | `IncidentAnalysisPort` + `RecoveryOrchestrator` |
| UF-03 | Multiple extensions interact unpredictably, causing non-deterministic failures. | Deterministic dependency graph, conflict isolation, plugin capability boundaries, and temporary quarantine mode. | `ExtensionGraphPort` + `ConflictIsolationRuntime` |
| UF-04 | Vulnerable/compromised extensions lead to hacks, redirects, spam pages, and repeat infections. | Continuous risk scoring, integrity checks, auto-quarantine policies, and cleanup playbooks with audit trail. | `ExtensionTrustPort` + `SecurityPolicyEngine` |
| UF-05 | CWV/TTFB remain poor despite caching/plugins; teams cannot find the real bottleneck. | Bottleneck attribution across DB/app/assets/network, performance budgets, and regression blocking. | `PerfAnalysisPort` + `PerfBudgetPolicy` |
| UF-06 | Ecommerce updates or migrations break checkout, payment, or order integrity. | Checkout preflight harness, migration guardrails, transactional rollback, and post-deploy health verification. | `CommerceReliabilityPort` + `CheckoutHarness` |
| UF-07 | Editor/FSE changes are confusing; template edits break pages with unclear recovery path. | Template versioning, route-to-template explainers, UI guardrails, and one-click revert for theme/editor states. | `AuthoringSafetyPort` + `TemplateStateManager` |
| UF-08 | Content saves fail, revisions corrupt, or data disappears after operations. | Transactional writes, save-retry with clear error classes, integrity checks, and robust revision recovery. | `ContentIntegrityPort` + `RevisionEngine` |
| UF-09 | PHP/runtime/host config drift causes sudden runtime failures after upgrades. | Environment compatibility scanner, runtime policy profiles, and pre-upgrade validation gates. | `EnvironmentCompatPort` + `RuntimePolicyEngine` |
| UF-10 | Admin is cluttered with upsells/noise; operators miss critical alerts. | Unified notification center, strict notification API contracts, and priority-based alert channels. | `AdminSignalPort` + `NotificationPolicyEngine` |
| UF-11 | Ecosystem governance changes create trust risk around update provenance and policy shifts. | Verifiable update provenance, immutable change log, and explicit policy controls for trust boundaries. | `ProvenancePort` + `GovernancePolicyLayer` |
| UF-12 | Plugin/platform prices shift unexpectedly and blow up multi-site budgets. | Cost observability, renewal forecasting, and policy-based budget thresholds/alerts. | `CostControlPort` + `LicensingPolicyEngine` |
| UF-13 | Teams need to migrate in/out without SEO loss, broken URLs, or schema lock-in. | Canonical export contracts, redirect mapping, validation tooling, and reversible migration plans. | `MigrationPort` + `PortabilitySchema` |
| UF-14 | Multi-user editing is brittle ("locked post"), with poor collaboration ergonomics. | Robust concurrency model, presence/locking policy, and conflict-aware merge workflows. | `CollaborationPort` + `SyncConflictResolver` |
| UF-15 | Local/staging/prod drift causes "works in staging, fails in prod" releases. | First-class preview environments, environment parity checks, and declarative deployment workflows. | `DeliveryWorkflowPort` + `PreviewEnvManager` |
| UF-16 | Authoring quality suffers due to accessibility regressions and weak media workflows. | A11y linting in editor, contrast/semantic checks, media diagnostics, and transform safety rails. | `ContentQualityPort` + `MediaQualityPipeline` |

### 13.2 Architectural Requirement: Solve Friction in a Swappable Way

Every user-friction capability should be implemented as a bounded module with a stable port contract, so better solutions can replace old ones without rewiring the core.

Required shape for each capability:

- Define a dedicated port in core (`UpdateSafetyPort`, `IncidentAnalysisPort`, `PerfAnalysisPort`, etc.).
- Keep policies/rules declarative and versioned (not hardcoded into adapters).
- Support multiple adapters per capability (built-in engine, third-party service, hybrid).
- Enforce contract tests so adapters are interchangeable by behavior, not naming.
- Record decisions with explicit replaceability constraints (ADR per capability).
- Gate rollout behind feature flags and policy profiles for incremental adoption.

### 13.3 Planned Capability Tracks

These tracks organize implementation so the backlog is actionable and modular.

| Track | Primary Clusters | First Concrete Milestones |
|---|---|---|
| T1: Reliability Guardrails | UF-01, UF-02, UF-03, UF-08 | Preflight update runner, safe-mode boot, incident timeline, one-click rollback. |
| T2: Security and Trust | UF-04, UF-11 | Extension integrity scanner, quarantine flow, signed artifact verification, immutable change ledger. |
| T3: Performance and Scale | UF-05, UF-06, UF-09 | Runtime profiler with attribution, checkout health harness, environment compatibility gate. |
| T4: Authoring and UX | UF-07, UF-10, UF-14, UF-16 | Template revert system, route explainer, unified admin inbox, editor a11y/media checks. |
| T5: Platform Operations | UF-12, UF-13, UF-15 | License/cost dashboard, canonical export contract, preview-branch workflow with parity checks. |

### 13.4 Implementation Rule

No friction fix should be added as a one-off special case inside kernel internals.
If a fix cannot be expressed behind a stable interface and tested as a swappable module, redesign it before shipping.

---

