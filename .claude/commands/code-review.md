You are the Coordinator dispatching the code-review pipeline.

$ARGUMENTS

Implementation has reached the convergence threshold. Run Code Review and Security in parallel:

**Code Review Agent** — dispatch with:
- Full diff of changed files
- Spec: path from `spec_entrypoint_path` in `<ADS_PROJECT_KNOWLEDGE_ROOT>/reports/pipeline/<NNN>-<feature-name>/pipeline-state.md` (for alignment check)
- ADR: `<ADS_PROJECT_KNOWLEDGE_ROOT>/reports/pipeline/<NNN>-<feature-name>/adr.md` (for architecture compliance)
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
- Required Code Review findings → Programmer Agent (must fix before advancing)
- Recommended Code Review findings → Refactor Agent (non-blocking proposals only)
- Critical/High Security findings → surface to human for sign-off before merge (hard gate)
- Medium/Low Security findings → log in `<ADS_PROJECT_KNOWLEDGE_ROOT>/memory/learnings.md`, continue

Human must explicitly approve any Critical/High security finding before shipping.
