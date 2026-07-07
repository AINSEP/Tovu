# Pipeline State: FEAT-005-plugin-system

| Field | Value |
|-------|-------|
| spec_id | SPEC-005 |
| spec_provider | speckit |
| provider_output_root | ADS-project-knowledge/specs/005-plugin-system/ |
| spec_version | 1.0.0 |
| spec_hash | sha256:0464c86642d343d3633cf6ee204af7b96d7b0716b1af17b49cdc99f236266c68 |
| spec_hash_history | sha256:894425c4fd51fb2656cab38349411fdbff8652656fc7346ee7101df54a14a096 (pre-audit) — external audit 20260707T043122Z applied F1/F3 (ext-under-revert BR-08/AC-17/REQ-06; error-code envelope namespace); re-validated `--update-hash` PASS 2026-07-07 + Red-Team re-affirmed 0 BLOCKING |

## Stage Ledger

| Stage | Status | Date | Notes |
|-------|--------|------|-------|
| Spec | APPROVED | 2026-07-07 | Written this session (persona-loaded); thin walking-skeleton slice; deferred surface = OQ-01…OQ-09b |
| Human Spec Checkpoint | **APPROVED** | 2026-07-07 | Owner approved all v1 specs 001–005 for Red-Team |
| Red-Team | COMPLETE | 2026-07-07 | 1 BLOCKING · 4 ADVISORY · 1 CONSTITUTION_FLAG → `red-team-findings.md` |
| Spec revision (R2) | **COMPLETE** | 2026-07-07 | RT-001 resolved — `content.entry.beforeSave` now returns an `ext`-delta only (cannot mutate core fields); RT-002 (`engine` required), RT-003 (version → latest, AC-09 softened + OQ-09b), RT-004 (recovery path), RT-005 (word-count tokenization) applied. Re-validated PASS. Core-field mutation deferred to OQ-09. |
| Software Architect | PENDING | | Cleared — awaiting Coordinator Planning Preflight |
