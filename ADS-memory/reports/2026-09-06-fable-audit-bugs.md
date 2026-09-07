# Fable correctness audit — lens: BUGS — 2026-09-06

- Repo `/Users/la/Programming/Tovu`, branch `restructure/apps-website-phased`
- Audit HEAD (frozen): `efc6847ed4490d0f57cd94d16b8cf46a6489a88a`; window `4b89cd09..efc6847e` (243 commits)
- Read-only: no tests, builds, typechecks, servers. Code read at the frozen SHA; history used only to locate.
- Every finding: file:line, CONFIRMED (path read end to end, inputs -> wrong output stated) or PLAUSIBLE (inferred).
- Commits landing after `efc6847e` are checked (`git log efc6847e..HEAD`) before any finding is reported. At start: only `f682eff2` (chat run diagnosability).
- Codex claims (`ADS-memory/reports/codex-audit/`) are treated as CLAIMS; each is confirmed or refuted below with evidence. Already-fixed/in-flight and NOT re-reported: J01, MI-01, MI-02.

## Section 1 — Verification of codex claims

(appended as verified)

## Section 2 — Findings from commits codex left pending

(appended as confirmed)

## Section 3 — Rest of window

(appended as confirmed)

## Open questions

(recorded, not blocking)

## Ledger — all 243 commits

(filled at end; every commit reviewed or skipped-with-reason)
