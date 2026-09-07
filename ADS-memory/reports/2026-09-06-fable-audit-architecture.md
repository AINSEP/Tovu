# Fable audit — ARCHITECTURE lens — 2026-09-06

- Auditor: Fable 5.1 (dispatched subagent, `fable-arch`), skills file `AI-Dev-Shop/agents/software-architect/skills.md` v2.3.0 loaded.
- Repo `/Users/la/Programming/Tovu`, branch `restructure/apps-website-phased`.
- Frozen audit HEAD: `efc6847ed4490d0f57cd94d16b8cf46a6489a88a`. Window `4b89cd09..efc6847e` = 243 commits, all 2026-09-06, ~12 parallel agents.
- Post-freeze commits seen at start (`git log efc6847e..HEAD`): `f682eff2` (assistant: chat run death diagnosable), `a82f6135` (bugs-lens header). Anything reported here as unfixed was re-checked against those.
- Method: read-only. Code read at the frozen SHA (`git show efc6847e:<path>`); no tests, builds, typechecks, servers, graph indexing. Load at start: 7.42.
- Lens: duplicated abstractions, divergent copies of one concept, layering, lifecycle ownership, complexity ceiling (9), hook-vs-component logic placement.
- Every finding: **CONFIRMED** (imports and call sites read and named) or **PLAUSIBLE** (inferred). Every codex D-xx claim re-verified from source, not trusted.
- Findings are appended incrementally and committed at least every 30 minutes. If this file ends abruptly, the session was killed; the ledger at the bottom says what was and was not covered.

## Findings

