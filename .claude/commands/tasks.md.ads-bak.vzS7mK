You are the Coordinator generating the task list for the approved feature.

$ARGUMENTS

The ADR has been human-approved. Generate the task list:

1. Read `<AI_DEV_SHOP_ROOT>/framework/spec-providers/active-provider.md` and the matching provider profile for planning-surface context.
2. Identify the active feature from `<ADS_PROJECT_KNOWLEDGE_ROOT>/reports/pipeline/` (most recently updated `<NNN>-<feature-name>/` folder with approved ADR, or from $ARGUMENTS).
3. Read `<ADS_PROJECT_KNOWLEDGE_ROOT>/reports/pipeline/<NNN>-<feature-name>/adr.md` for the parallel delivery plan and module boundaries.
4. Read the provider-defined planning surface from `spec_entrypoint_path` in `<ADS_PROJECT_KNOWLEDGE_ROOT>/reports/pipeline/<NNN>-<feature-name>/pipeline-state.md` for AC priorities or their provider equivalent.
5. Apply the task-generation read set and coverage rules from `<AI_DEV_SHOP_ROOT>/framework/spec-providers/<active-provider>/compatibility.md`.
6. Write `<ADS_PROJECT_KNOWLEDGE_ROOT>/reports/pipeline/<NNN>-<feature-name>/tasks.md` using `<AI_DEV_SHOP_ROOT>/framework/templates/tasks-template.md`:
   - Phase 0: Setup (tooling, directory structure)
   - Phase 1: Foundational infrastructure (blocks all stories)
   - Phase 2+: One phase per user story, ordered P1 first
   - Phase N: Polish
   - Mark tasks [P] that touch different files with no shared mutable state
   - Add checkpoint annotations after Phase 1 and after each story phase
7. Output: tasks.md path, total task count, parallelizable task count, phase structure summary, explicit coverage summary against the provider's acceptance criteria and requirements, recommended next command (`/implement`).
