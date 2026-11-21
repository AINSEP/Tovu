# COMMIT-PLAN

## T1 — Tovu fast CI

- Base: `0973a5fdc8`; land with T2. Code edits done; runtime proof pending combine.
- Files: `.github/workflows/ci.yml`; standalone registry workflow intentionally retained until cloud parity proof.
- Tests first: no new test file is named. Combine must prove main push/PR scheduling without Postgres, 8C bootstrap/drift, and root-typecheck failure reaching the summary. Before the change, the fast job still has Postgres and broad suites, and lacks the SDK build prerequisite.
- Mutation owed to combine: fail root typecheck; change a registered declaration and registry value together without transition evidence.
- API-baseline delta: none. Look owed: none.
- Required-check settings and standalone registry-trigger callers: cloud confirmation owed; no status removal is authorized here.
- Deletions at diff re-read: only the named moved blocks leave fast CI, plus its admin-build summary line; no unrelated changes removed.

## T2 — Tovu full suites and route coverage

- Base: `0973a5fdc8`; depends on T1; land together. Code edits done; runtime proof pending combine.
- Files: `.github/workflows/nightly.yml`, `.github/workflows/desktop.yml`, `.github/workflows/route-coverage.yml`, `.github/workflows/ci.yml`.
- Tests first: no new test file is named. Combine must dispatch full root/admin/desktop suites, prove PostgreSQL manifest and Chromium form-layout execution, and exercise a route-changing PR against its event base. Before the change, there is no scheduled full workflow and desktop gates run on push/PR.
- Mutation owed to combine: fail route coverage floor; route job must be red.
- API-baseline delta: none. Look owed: broader browser journeys and serial real-Postgres chat remain cloud follow-ups.
- Required route/desktop status settings: cloud confirmation owed before enabling path-filtered checks or changing required-check configuration.
- Deletions at diff re-read: desktop push/PR trigger blocks replaced by the named schedule; route job moved verbatim out of fast CI. No unrelated changes removed.

## T3 — Desktop dry run

- Base: `0973a5fdc8`; after T2. Code edits done; runtime proof pending combine.
- Files: `.github/workflows/desktop-release.yml`, `development/scripts/__tests__/desktop-assistant-release-gate.unit.test.ts`.
- Tests first: one new case using the existing YAML load asserts Boolean/default-false input, valid-tag eligibility of both unsigned jobs, and an entire-condition dry-run exclusion for all four signing/Store/release jobs. Expected RED before implementation: the dispatch input is absent and no downstream condition has the predicate. Not executed here.
- Mutation owed to combine: remove only the dry-run predicate from `release`; the new case must fail.
- API-baseline delta: none. Look owed: dispatch a valid release candidate with `dry_run=true`, observe Linux and both packaged Electron journeys, and four skipped jobs; budget estimate 10–15 macOS minutes plus Linux. Real signed installer/update-feed evidence remains with release.
- Source review: all signing-environment jobs and the only release-write job are among the four guarded jobs; tag-version assertion and permissions remain unchanged.
- Deletions at diff re-read: none; existing conditions are retained inside the conjunction.

## T4 — Picker settings

- Base: `0973a5fdc8`; after T3. Code edits done; DEPENDS on the selected Jini candidate archives and combine verification.
- Files: `apps/website/src/features/agent-plugins/admin-surfaces/public-config.ts`, `apps/website/src/features/api-connections/__tests__/surface-adapters.security.test.ts`.
- Tests first: extend the existing public-config case with both configured/trimmed Picker settings, an absent allowed Picker setting, and a present unrelated public-shaped Jini setting; retain the present S3-key refusal. Expected RED before implementation: the exact Picker names are refused by the old pattern. Refusal controls already pass and prevent overly broad admission. Not executed here.
- Mutation owed to combine: remove both admissions, then separately broaden to public-shaped Jini names; acceptance and refusal assertions must fail respectively.
- DEPENDS: J3/J4's raw public archive set for selected Jini source `de4e555b9` (or coordinator-selected replacement), identified by SHA and archive digests within that run. No candidate archives were built or installed here. `lib/picker-flow.mjs` at the pinned source declares exactly these two names; recheck them if the selected source changes.
- API-baseline delta: none; imports, exports, secret-word refusal, exact lookup, trimming and the existing optional pad retained. No debt rows.
- Look owed: Sheets and Drive Picker open on an upgraded site in Chrome.
- Deletions at diff re-read: none. Only the pattern and named test case changed.

## T5 — Google Workspace OAuth

- Base: `0973a5fdc8`; after T4. Code edits done; DEPENDS on the same selected Jini candidate archives and combine verification.
- Files: `apps/website/src/features/api-connections/contribution.ts`, `apps/website/src/features/api-connections/__tests__/contribution.unit.test.ts`.
- Tests first: three cases use `acmeFixtureCopy` and the real source contribution loader: admit both canonical runtime clients under `google-workspace`; refuse those names under `acme-office`; refuse old Tovu runtime names under `google-workspace`. The existing Acme admission control is unchanged. Expected RED before implementation: canonical names are refused at parse, Acme gets the old parse refusal instead of the ownership refusal, and old Google Workspace names are admitted. Not executed here.
- Mutation owed to combine: remove the Jini parse attempt; separately remove ownership namespace selection. Canonical admission must fail in both mutations.
- DEPENDS: T4's exact candidate set. Pinned `packages/agent-plugins/google-workspace/jini-connections.json` has both JINI_GOOGLE_WORKSPACE_OAUTH runtime ID/SECRET pairs; pinned integrations `declarations.ts` checks the exact plugin/runtime ownership names. No Jini edit or persisted connection-ID change.
- API-baseline delta: none; both exported signatures and optional pads retained, host parser remains unchanged, original refusal retained if both parses reject, no repoints/exports/debt rows.
- Look owed: one existing-connection check each for Chrome web OAuth and Electron loopback callback.
- Deletions at diff re-read: none. Only the parse callback, ownership namespace argument and named cases changed.

## Handoff review

- Scope/requirements re-read and targeted source diff reviewed. No tests, builds, installs, typechecks, linters, paid-service enablement, new secrets, dependency/manifest/lockfile edits, git writes, commits or subagents.
- Architecture audit: source review PASS within the supplied sheets: Tovu host adapters call existing Jini parsers/checks; no new platform module, helper, package, export shell or cast. Runtime/required-check evidence remains INCONCLUSIVE until combine/cloud executes it.
- Coverage and self-validation not run: machine rule prohibits execution. New named cases cover the changed admissions/refusals and rehearsal wiring; existing parser/Acme controls remain. RED/GREEN and mutation outcomes are owed, not claimed.
- Function limits reviewed by source inspection: changed parser callback 6 lines, namespace-check loader 19 lines, public-config factory 11 lines; all below 50 lines and complexity 10. No changed file exceeds 500 lines.
- Function quality: public-config admission / contribution parser callback / namespace-check loader | INCONCLUSIVE | execution and mechanical verification unavailable under machine rule | no additional refactor authorized. Pure parsing and ownership selection retain existing effect boundaries; no new I/O.
- Reuse: public settings extend the existing host pattern/port; OAuth calls the existing Jini declaration parser and ownership check. Inspected only named source paths and targeted symbol importer searches. No new behavior owner.
- Pre-completion: assertions carry messages, existing pads and imports retained, no certified tests removed or weakened. Runtime acceptance, required-check settings and archive identity remain open in REFRESH.md.
