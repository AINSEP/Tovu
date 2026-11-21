J1–J4 workflow edits are done. Cloud verification remains pending.

- **J1:** Updated `.github/workflows/ci.yml` triggers and moved the five report-only steps to nightly. Preserved blocking gates and summary.
- **J2:** Added `.github/workflows/nightly.yml` with the specified schedule, 60-minute cap, and separate workspace, Vitest, and Node runs.
- **J3:** Added `.github/workflows/release-candidate.yml` with read-only permissions, release planning, and blocking plugin guards.
- **J4:** Added raw archive packing, SHA logging, candidate lock checks, nested-forms presence assertion, and both import checks.

Proof cases were recorded before workflow edits. No test files were added; the nightly and candidate checks were previously absent. **No tests, builds, installs, typechecks, linters, or mutations were run**, per dispatch.

`COMMIT-PLAN.md` contains one entry per sheet with files, baseline gaps, mutations owed, API delta, and looks owed. `REFRESH.md` records rollout checks, the known Vitest collection issue, disk/install verification, and X1 follow-up.

Final diff review found only the required audit/report-step moves as tracked deletions. No unrelated cleanup, manifest changes, secrets, paid services, or Git writes.
