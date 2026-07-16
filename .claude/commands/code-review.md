You are the Coordinator dispatching the code-review pipeline.

$ARGUMENTS

This command is a Coordinator-owned gate. Code Review and Security receive
scoped artifacts; they do not own upstream readiness checks.

## Subagent Default

Before the readiness gate dispatch, apply the Subagent Default Guard in `<AI_DEV_SHOP_ROOT>/framework/operations/routing-guards.md`.

If the current host resolves to `subagent-assisted` and the user has not requested `single-agent mode` or `disable subagents`, say:

`Coordinator(Pipeline Mode): Defaulting /code-review to spawned subagents for Code Review and Security, instead of running only the active agent in one context. Say "single-agent mode" or "disable subagents" to run this sequentially.`

After the readiness gate passes, spawn separate Code Review and Security subagents in parallel. Each spawned subagent must be explicitly bootstrapped with its repo persona file and must confirm that persona load before its output is treated as pipeline-valid. The Coordinator remains responsible for the readiness gate and for routing findings after both subagents report.

If subagent support is unavailable, unverified, disabled, or the delegated bootstrap cannot be satisfied, say:

`Coordinator(Pipeline Mode): Subagent default is not active for /code-review: <reason>. Running sequentially in this context instead.`

Implementation has reached the convergence threshold only when the Coordinator
verification packet is PASS for the active spec hash. Build or update it at
`<ADS_MEMORY_ROOT>/reports/pipeline/<NNN>-<feature-name>/verification-packet.md`
using `<AI_DEV_SHOP_ROOT>/framework/templates/verification-packet-template.md`.
Before dispatch, verify:

- The verification packet shows mechanical current-spec hash verification.
- Certified test-file hashes still match `test-certification.md`.
- Executed test count is greater than zero and meets or exceeds the expected
  certified count.
- Every suite required by `tasks.md` constraints passed. E2E is required only
  when `tasks.md`, the spec, or the Coordinator marks it required.
- Required coverage gates passed from machine-readable coverage artifacts.
- No unapproved flaky tests remain.

If any item fails, do not dispatch Code Review. Route stale certification,
semantic test gaps, missing test hashes, missing required coverage artifacts, or
test-quality defects to TDD; route valid failing tests to Programmer.

When the gate passes, run Code Review and Security in parallel when the Subagent Default is active; otherwise run the same scoped reviews sequentially in this context:

**Code Review Agent** — dispatch with:
- Full diff of changed files
- Spec: path from `spec_entrypoint_path` in `<ADS_MEMORY_ROOT>/reports/pipeline/<NNN>-<feature-name>/pipeline-state.md` (for alignment check)
- ADR: `<ADS_MEMORY_ROOT>/reports/pipeline/<NNN>-<feature-name>/adr.md` (for architecture compliance)
- Test certification: `<ADS_MEMORY_ROOT>/reports/pipeline/<NNN>-<feature-name>/test-certification.md`
- Test file source code for every path in the test-certification inventory that
  maps to changed behavior or P1/invariant coverage, so Code Review can perform
  semantic assertion review instead of trusting test names
- Programmer's most recent handoff table, including Function Quality Assessment
  summary
- Progress ledger: `<ADS_MEMORY_ROOT>/reports/pipeline/<NNN>-<feature-name>/progress-ledger.md`
  if present, especially when a debt-band fix cycle is claimed
- Coordinator verification packet:
  `<ADS_MEMORY_ROOT>/reports/pipeline/<NNN>-<feature-name>/verification-packet.md`
  with active spec hash, executed vs expected count, test-file hash status,
  required-suite status, coverage status, and flaky-test status
- Skills: `<AI_DEV_SHOP_ROOT>/skills/code-review/SKILL.md`, `<AI_DEV_SHOP_ROOT>/skills/security-review/SKILL.md`
- Previous Code Review findings (to detect recurrence)
- Output: findings classified as **Required** (blocks advance) or **Recommended** (non-blocking)

**Security Agent** — dispatch with:
- Full diff of changed files
- Spec (for business logic abuse vector analysis)
- List of changed auth/payment/data paths (Coordinator identifies these from the diff)
- Skill: `<AI_DEV_SHOP_ROOT>/skills/security-review/SKILL.md`
- Output: findings classified as Critical / High / Medium / Low with exploit scenarios

**After both complete:**
- Required implementation Code Review findings → Programmer Agent (must fix before advancing)
- Required test-quality/certification/hash/coverage-evidence findings → TDD Agent
- Recommended Code Review findings → Refactor Agent (non-blocking proposals only)
- Critical/High Security findings → surface to human for sign-off before merge (hard gate)
- Medium/Low Security findings → log in `<ADS_MEMORY_ROOT>/knowledge/learnings.md`, continue

Human must explicitly approve any Critical/High security finding before shipping.
