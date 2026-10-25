<<SUBAGENT_DISPATCH>>
# Stage C — RE-VERIFY + MORNING REPORT (Sonnet). Read COMMON.md in this dir first.
HARD CAPS: 1 h wall clock (at 50 min write the report), ~0.5M tokens. REPORT ONLY — never edit source/tests.
SETUP from COMMON.md (latest of both branches). Read REPORT-A.md and REPORT-B.md (say if either is missing or lacks its DONE line).
Re-run ONLY: the test files and packages Stage B touched, tsc for those packages, and the Stage A NEW-failure tests. Then write MORNING-REPORT.md for the owner, terse, plain words: (1) one-line verdict, (2) table: area → status (green / fixed tonight / still failing / ENV), (3) what Stage B fixed (commit hashes), (4) still failing + why, (5) owner decisions needed (guard rules, coverage gaps policy, anything listed "needs owner"), (6) cost: wall time and rough tokens per stage A/B/C. End with "STAGE C DONE <UTC>". Commit + push.
