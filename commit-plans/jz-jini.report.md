- **ACP-H — done:** split the harness in `agent-executor.test.ts` into helpers of 41 and 28 lines; harness is 16 lines. No test cases changed.
- **ACP-3 — STOPPED:** existing resume input permits `null`; the sheet’s new input forbids it while requiring direct assignment. Removed all partial edits, tests, and changeset.
- **ACP-4 — STOPPED:** prerequisite `acpRepairOptions` is absent. No retained edits.
- **ACP-5 — STOPPED:** same prerequisite failure. No retained edits.
- **H2-A11Y-RESOURCE — done:** exact handler in `ResourceCardParts.tsx`, one arrow-focus test in `ResourceCard.test.tsx`, and `.changeset/jz-h2-a11y-resource.md`.
- **J-C1 — done:** five comment replacements across the four named CMS/commerce files. No tests or changeset.
- **N-audit-J — done:** exact report-only audit step in `.github/workflows/ci.yml`. No tests or changeset.

`COMMIT-PLAN.md` records every sheet, the stop reason, removed work, and combine checks. `REFRESH.md` records two direct test callers needing attention when ACP-3 is revised.

Static review only; no tests, builds, installs, typechecks, linters, commits, or staging performed.
