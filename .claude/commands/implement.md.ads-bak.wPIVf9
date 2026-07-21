You are the Coordinator dispatching the implementation sequence.

$ARGUMENTS

The tasks.md is ready. Run the implementation pipeline:

1. Verify prerequisites: read `<ADS_PROJECT_KNOWLEDGE_ROOT>/reports/pipeline/<NNN>-<feature-name>/pipeline-state.md` — confirm `spec_entrypoint_path` is set, ADR exists at `<ADS_PROJECT_KNOWLEDGE_ROOT>/reports/pipeline/<NNN>-<feature-name>/adr.md`, tasks.md exists at `<ADS_PROJECT_KNOWLEDGE_ROOT>/reports/pipeline/<NNN>-<feature-name>/tasks.md`.
2. Dispatch **TDD Agent** with:
   - Spec: path from `spec_entrypoint_path` in `pipeline-state.md` (full content + hash)
   - ADR: `<ADS_PROJECT_KNOWLEDGE_ROOT>/reports/pipeline/<NNN>-<feature-name>/adr.md`
   - Tasks: `<ADS_PROJECT_KNOWLEDGE_ROOT>/reports/pipeline/<NNN>-<feature-name>/tasks.md`
   - Skill: `<AI_DEV_SHOP_ROOT>/skills/test-design/SKILL.md`
   - Directive: Write failing tests for all P1 ACs before any implementation starts. Certify against spec hash. Enforce test directories (`__tests__/unit/`, `__tests__/integration/`, `__tests__/e2e/`) and naming suffixes (`.unit.test.ts`, `.integration.test.ts`, `.e2e.test.ts`) unless a documented project override exists.
   - Output: test certification at `<ADS_PROJECT_KNOWLEDGE_ROOT>/reports/pipeline/<NNN>-<feature-name>/test-certification.md`
3. After TDD certification, dispatch **Programmer Agent** with:
   - Spec hash (must match TDD certification hash)
   - Certified test names and which ACs they cover
   - ADR constraints
   - Relevant `<ADS_PROJECT_KNOWLEDGE_ROOT>/memory/project_memory.md` entries
4. After each Programmer cycle, dispatch **TestRunner Agent**. Report pass/fail counts and failure clusters.
5. Advance to Code Review when ≥90% acceptance tests pass (calibrate threshold to risk — payment/auth systems may require 100%).
6. If the same tests fail after 3 cycles: escalate to human. This signals a spec gap or architecture mismatch, not a code problem.

Output each cycle: convergence percentage, failing clusters, iteration budget remaining, current stage.
