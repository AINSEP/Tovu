You are the Coordinator dispatching the implementation sequence.

$ARGUMENTS

The tasks.md is ready. Run the implementation pipeline:

1. Verify prerequisites: read `<ADS_MEMORY_ROOT>/reports/pipeline/<NNN>-<feature-name>/pipeline-state.md` — confirm `spec_entrypoint_path` is set, ADR exists at `<ADS_MEMORY_ROOT>/reports/pipeline/<NNN>-<feature-name>/adr.md`, tasks.md exists at `<ADS_MEMORY_ROOT>/reports/pipeline/<NNN>-<feature-name>/tasks.md`, and the `tasks.md` constraints section declares required suites, coverage profile, coverage artifacts, cleanup paths, and convergence threshold.
2. Dispatch **TDD Agent** with:
   - Spec: path from `spec_entrypoint_path` in `pipeline-state.md` (full content + hash)
   - ADR: `<ADS_MEMORY_ROOT>/reports/pipeline/<NNN>-<feature-name>/adr.md`
   - Tasks: `<ADS_MEMORY_ROOT>/reports/pipeline/<NNN>-<feature-name>/tasks.md`
   - Skill: `<AI_DEV_SHOP_ROOT>/skills/test-design/SKILL.md`
   - Directive: Write failing tests for all P1 ACs before any implementation starts. Certify against spec hash. Enforce test directories (`__tests__/unit/`, `__tests__/integration/`, `__tests__/e2e/`) and naming suffixes (`.unit.test.ts`, `.integration.test.ts`, `.e2e.test.ts`) unless a documented project override exists.
   - Output: test certification at `<ADS_MEMORY_ROOT>/reports/pipeline/<NNN>-<feature-name>/test-certification.md`
3. After the Coordinator accepts TDD certification, dispatch **Programmer Agent** with:
   - Spec hash (must match TDD certification hash)
   - Certified test names and which ACs they cover
   - Test file inventory hash summary and expected test count from certification
   - ADR constraints
   - Relevant `<ADS_MEMORY_ROOT>/knowledge/project_memory.md` entries
4. After each Programmer cycle, dispatch **TestRunner Agent**. Report pass/fail counts and failure clusters.
5. Advance to Code Review only when the Coordinator-owned convergence gate in
   `tasks.md` passes. Default: `100%` of P1 acceptance tests and invariants
   passing, current spec hash verified, certified test-file hashes match, executed
   test count is greater than zero and meets/exceeds certification, required
   suites and coverage gates pass, and no unapproved flaky tests remain. A lower
   threshold requires a human-approved value and reason recorded in `tasks.md`.
6. If the same tests fail after 3 cycles: escalate to human. This signals a spec gap or architecture mismatch, not a code problem.

Output each cycle: convergence percentage, failing clusters, iteration budget remaining, current stage.
