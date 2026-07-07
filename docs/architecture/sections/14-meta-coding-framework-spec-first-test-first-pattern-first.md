## 14. Meta-Coding Framework (Spec-First + Test-First + Pattern-First)

Tovu adopts a Meta-Coding workflow: AI is an execution engine, while humans own intent, constraints, and acceptance quality.
This is mandatory for core packages and strongly recommended for plugins/themes.

### 14.1 Delivery Stages

| Stage | Goal | Required Artifacts | Exit Gate |
|---|---|---|---|
| M0: Problem Framing | Clarify why this work exists | Problem statement, user impact, non-goals | Scope is explicit and testable |
| M1: Blueprint Spec | Define what must be built | Spec with functional requirements, constraints, acceptance criteria | No ambiguous requirements remain |
| M2: Foreman Selection | Define how it must be built | Pattern selection (ports/adapters, DDD boundaries, slice ownership), ADR | Dependency direction and module seams are fixed |
| M3: Test Contracting | Define proof before implementation | Contract tests for ports, integration tests for critical flows, failure-mode tests | Tests fail for missing behavior and pass for baseline |
| M4: Thin Vertical Slice | Build smallest production-valid path | One slice implementation + observability + rollback path | Slice passes tests and deploy checks |
| M5: Incremental Expansion | Extend safely by slice | Additional slices, migration notes, updated risk log | No architecture boundary regressions |
| M6: Hardening and Review | Stabilize and operationalize | Performance/security checks, runbooks, docs updates | Release readiness approved |

### 14.2 Non-Negotiable Rules

- No code generation before M1 (spec) and M2 (architecture decision) are written.
- No adapter merge without contract tests for the target port.
- No core dependency inversion violations (enforced by lint + project references).
- No critical feature ships without rollback or safe-disable path.
- No "temporary" direct dependency on provider SDKs inside core/domain packages.

### 14.3 Vibe-Coding Policy

Vibe-coding is allowed only for bounded exploration:

- Use vibe spikes to explore UX, API shapes, and algorithm feasibility.
- Keep spikes isolated under `experiments/` and out of core runtime paths.
- Promote spike code only by rewriting against the approved spec and tests.
- If spike behavior cannot be specified and tested, it does not graduate.

### 14.4 Architecture Pattern Guidance

Pattern selection must be problem-matched, not trend-matched:

- Default: Modular Monolith + Ports/Adapters + DDD boundaries + Vertical Slices.
- Add CQRS when read/write pressures diverge materially.
- Add Event Sourcing only where auditability/time-travel is a hard requirement.
- Extract microservices only when a module has distinct scaling/deployability needs.
- Prefer replacing adapters over rewriting domain logic when new tools emerge.

### 14.5 Recommended Tooling Posture

- Use Spec Kit (or equivalent) to standardize spec artifacts and implementation plans.
- Keep ADRs in-repo and linked from each major module.
- Maintain a contract-test suite per port (`AuthPort`, `StoragePort`, `SearchPort`, etc.).
- Treat architecture checks as CI gates, not code review suggestions.

---

