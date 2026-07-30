# Pipeline State: FEAT-003-site-install-dir

| Field | Value |
|-------|-------|
| spec_id | SPEC-003 |
| spec_provider | speckit |
| provider_output_root | ADS-memory/specs/003-site-install-dir/ |
| spec_version | 1.0.0 |
| spec_hash | sha256:c2547dc39b9e12bc7fb199d3c32e472804a3fea9690014a8000f421db1846142 |
| spec_hash_history | sha256:99cf109ec2959ab286e7e6bdcd379a1a1f8b3425f4aacf0f2d4d389390bba899 (pre-audit) — external audit 20260707T043122Z applied F2 (schemaVersion+schemaTag atomic, REQ-05/INV-04/BR-05/BR-06/AC-07); re-validated `--update-hash` PASS 2026-07-07 + Red-Team re-affirmed 0 BLOCKING |

## Stage Ledger

| Stage | Status | Date | Notes |
|-------|--------|------|-------|
| Spec | APPROVED | 2026-07-07 | Written + validated; revision R1 (Drizzle reconciliation); persona-audited sign-off |
| Human Spec Checkpoint | **APPROVED** | 2026-07-07 | Owner approved all v1 specs 001–005 for Red-Team |
| Red-Team | COMPLETE | 2026-07-07 | 0 BLOCKING · 5 ADVISORY · 1 CONSTITUTION_FLAG → `red-team-findings.md`. Cleared for Architect. |
| RT fixes | **APPLIED** | 2026-07-07 | All 5 ADVISORY resolved (RT-001 behavior.spec Drizzle cleanup, RT-002 present-but-corrupt-db→SITE_CORRUPT, RT-003 ENOSPC/EACCES EC-10, RT-004 shutdown drain, **RT-005 schemaVersion now index+tag** for divergence detection — new `.site-meta.json.schemaTag`, noted in ADR-015). Re-validated PASS. RT-006 (Art. I CLI framework growth) remains an Architect note. |
| Software Architect | **DRAFTED (v1.1.0)** | 2026-07-28 | `adr.md` (ADR-PIPE-003), `implementation-outline.md`, and `critical-internal-constraints.md` produced, then revised to v1.1.0 at owner direction: `commander` adopted in v1 (not deferred behind the original two-tier growth trigger), justified by SPEC-005's committed subcommand growth + Tovu-Runner's planned programmatic CLI invocation. Article I re-derived as COMPLIES (was EXCEPTION). |
| Architecture Sign-Off | **APPROVED** | 2026-07-28 | Owner Leon Aburime approved ADR-PIPE-003 v1.1.0. Cleared for TDD dispatch. |
