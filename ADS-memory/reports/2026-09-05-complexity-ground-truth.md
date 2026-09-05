# 2026-09-05 — Complexity Ground Truth (skeleton, filling in)

Status: IN PROGRESS — measurement underway. This file is committed now, before all
sections are filled, per the standing rule that long dispatches persist reports
incrementally rather than risk losing work by writing only at the end.

## Question being settled

Three sources disagree about `src/`-scope complexity debt:
- `ADS-memory/reports/2026-09-03-OUTSTANDING-WORKLIST.md`: "68 violations / 43 files → 1
  ... Gate green: 0 new complexity violations (1 total, 1 in baseline)."
- `ADS-memory/reports/COMPLEXITY-DEBT-REMAINING-2026-09-03.md`: "70 violations remain
  across 41 files, none touched by this pass."
- `development/scripts/src-complexity-debt.json`: currently N entries (dispatcher counted 8).

Real question: what is the true current count, and is the gate green because
violations were fixed or because they were baselined?

## TODO
- [ ] Run `development/scripts/check-src-complexity-drift.ts` directly, capture stdout/rc to files.
- [ ] Read the script to determine exactly how the baseline participates in pass/fail.
- [ ] Reconcile the three sources against the live measurement.
- [ ] Ranked recommendations (measurement job — implement nothing).

(Sections below will be filled in as measurement completes.)
