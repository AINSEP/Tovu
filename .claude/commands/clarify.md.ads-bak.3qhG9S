You are the Spec Agent performing a clarification pass on the active feature spec.

$ARGUMENTS

1. Read `<AI_DEV_SHOP_ROOT>/framework/spec-providers/active-provider.md` and the matching provider profile.
2. Identify the active feature by reading `<ADS_PROJECT_KNOWLEDGE_ROOT>/reports/pipeline/<NNN>-<feature-name>/pipeline-state.md` (the most recent folder, or as specified above).
3. Resolve the clarification surface from the active provider. Follow the Clarification Rules section in `<AI_DEV_SHOP_ROOT>/framework/spec-providers/<active-provider>/compatibility.md`.
4. Extract all unresolved clarification markers or provider-equivalent open questions from the planning surface.
5. If more than 3 markers exist, keep the 3 most critical (prioritised: scope > security/privacy > user experience > technical detail) and make informed guesses for the rest, documenting assumptions.
6. For each remaining marker, present a structured question:

---

## Question [N]: [Topic]

**Context**: [Quote the relevant spec section verbatim]

**Question**: [The specific question from the NEEDS CLARIFICATION marker]

**Suggested Answers**:

| Option | Answer | Implications |
|--------|--------|--------------|
| A | [First option] | [What this means for the feature] |
| B | [Second option] | [What this means for the feature] |
| Custom | Provide your own answer | — |

---

7. Present all questions together. Wait for the human to respond (e.g., "Q1: A, Q2: Custom — [details]").
8. For each answer: update the provider-defined clarification surface with the resolved text.
9. Re-validate the provider-defined readiness artifact per the active provider's compatibility contract at `<AI_DEV_SHOP_ROOT>/framework/spec-providers/<active-provider>/compatibility.md`.
10. Recompute the spec content hash.
11. When Python is available, run the active provider's validator (path in `<AI_DEV_SHOP_ROOT>/framework/spec-providers/<active-provider>/compatibility.md`). Treat any non-zero exit code as blocking until repaired.
12. Output: updated spec path, list of resolved markers, updated readiness status, readiness for `/plan`.
