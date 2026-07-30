# Pipeline State: FEAT-004-declarative-theme-system

| Field | Value |
|-------|-------|
| spec_id | SPEC-004 |
| spec_provider | speckit |
| provider_output_root | ADS-memory/specs/004-declarative-theme-system/ |
| spec_version | 1.1.0 |
| spec_hash | sha256:a5289e06b4a77fe00488ec5f2cd724a01f8b61401d59e94c8b78d45f641e74a3 |

## Stage Ledger

| Stage | Status | Date | Notes |
|-------|--------|------|-------|
| Spec | APPROVED | 2026-07-07 | `spec-dod.md` completed this session + validated (persona-loaded) |
| Human Spec Checkpoint | **APPROVED** | 2026-07-07 | Owner approved all v1 specs 001–005 for Red-Team |
| Red-Team | COMPLETE | 2026-07-07 | 0 BLOCKING · 4 ADVISORY · 1 CONSTITUTION_FLAG → `red-team-findings.md`. Cleared for Architect. |
| RT fixes | **APPLIED** | 2026-07-07 | All 4 ADVISORY resolved (**RT-001 CSS now positive-allowlist + `data:`/`@font-face` forbidden**, RT-002 pixel→token/structure wording, RT-003 last-resort shell if `paper` fails, RT-004 wrong-type props→default). RT-005 CONSTITUTION_FLAG folded into Agent Directives (parse-don't-regex + Architect build-vs-adopt). Re-validated PASS. |
| Spec annotation v1.1.0 | APPLIED | 2026-07-07 | Non-breaking: added OQ-06 + out-of-scope pointer for **theme bundles** (ADR-019). No REQ/AC changes. Then folded in **spec-drift corrections C1/C2** (built-in ids `paper/atlas/glassmorphic`→`tovu-official/column/signal` + `tovu-official` fallback across REQ-07/10, AC-01/09/11, behavior/state/traceability/spec-dod; added optional `fonts[]` to REQ-02 manifest schema). Re-hashed via validator (`--update-hash`, PASS, phase spec) → `a5289e06`. Drift report: `reports/pipeline/004-.../spec-drift-findings.md`. |
| Software Architect | PENDING | | Cleared — awaiting Coordinator Planning Preflight; CSS sanitizer build-vs-adopt is the top ADR decision |
