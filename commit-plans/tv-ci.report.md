T1–T5 code edits are done; no sheets STOPPED. Verification remains pending under the machine rule.

- **T1:** Updated `.github/workflows/ci.yml` for fast CI, SDK build and blocking 8C. Standalone registry triggers remain until cloud proves parity. No new tests named.
- **T2:** Added `nightly.yml` and `route-coverage.yml`; updated `desktop.yml`. Moved full suites/reports, added PostgreSQL 16, commerce database, Chromium and admin tests. No new tests named.
- **T3:** Updated `desktop-release.yml` and `desktop-assistant-release-gate.unit.test.ts`. Added one rehearsal case first; expected RED because the input and four exclusion predicates were absent.
- **T4:** Updated `public-config.ts` and `surface-adapters.security.test.ts`. Extended the existing case first; expected RED because Picker names were refused. **DEPENDS:** selected Jini archives.
- **T5:** Updated `contribution.ts` and `contribution.unit.test.ts`. Added three cases first: canonical admission, foreign-owner refusal and old-name refusal. Before implementation, canonical admission failed, the foreign refusal had the old diagnostic, and old names were admitted. **DEPENDS:** the same archives.

[COMMIT-PLAN.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-tv-ci/COMMIT-PLAN.md) records each sheet’s files, expected RED, mutations, API delta and looks owed. [REFRESH.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-tv-ci/REFRESH.md) records archive, required-check and cloud/browser follow-ups; no importer repoints were needed.

Diff re-read found no unrelated additions to delete. Removals were the named workflow moves, desktop event triggers and fast admin-build summary entry. Existing pads and signatures remain.

No tests, builds, installs, typechecks or linters ran. `.git` stayed read-only; no paid services or secrets were added.
