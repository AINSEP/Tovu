# Jini J1–J4

Base: `de4e555b9` on `codex/jx-ci` (dispatch-provided). Git state is read-only; coordinator stages and commits. Scope is the four READY sheets in `r62t-cicd.md`.

Tests first: the sheet proof cases below were recorded before workflow edits. No test files are named by these sheets. No tests, builds, installs, typechecks or linters may run in this clone; RED/GREEN and mutations are owed to the combine. Before edits, CI watches every push branch, has no PR branch filter, and neither new workflow exists.

## J1

- Status: done (workflow edits); land with J2. Cloud verification remains owed.
- Files: `.github/workflows/ci.yml`, `COMMIT-PLAN.md`, `REFRESH.md`.
- Tests: cloud main-push/main-PR scheduling and topic-push exclusion. The topic-push exclusion fails on the original all-branch trigger; PR targeting is originally unrestricted.
- Mutation owed to the combine: force `guard:drift` to exit 1; the preserved outcome summary must fail the job.
- API-baseline delta: none; workflow only.
- Look owed: none. Coordinator must confirm required-check settings and rollout to `main`.
- Deletions at diff re-read: only audit and four report-only quality steps moved verbatim to J2, including their existing rollout comment. No unrelated edits found.

## J2

- Status: done (workflow edits); cloud verification remains owed.
- Files: `.github/workflows/nightly.yml`, `COMMIT-PLAN.md`, `REFRESH.md`.
- Tests: cloud dispatch reports recursive workspace tests, Vitest scripts and Node scripts independently. Before the change there is no nightly workflow; the root script chain prevents Node execution after Vitest fails.
- Mutation owed to the combine: fail the Vitest command; Node scripts must still execute and the job must remain red.
- API-baseline delta: none; no package script changes.
- Look owed: none. Record the known duplicate Node-file collection error in Vitest.
- Deletions at diff re-read: none. Existing report-only status and moved text preserved.

## J3

- Status: done (workflow edits); cloud verification remains owed.
- Files: `.github/workflows/release-candidate.yml`, `COMMIT-PLAN.md`, `REFRESH.md`.
- Tests: cloud dispatch at the selected committed ref reports pending, published and never-published versions and runs all three blocking plugin guards. Before the change there is no release-candidate workflow.
- Mutation owed to the combine: remove a shipped export target before the packed guard; the guard must fail.
- API-baseline delta: none; publishing workflow and package manifests remain untouched.
- Look owed: none.
- Deletions at diff re-read: none. No publish credential, npm upgrade, or publishing step copied.

## J4

- Status: done (workflow edits); cloud verification remains owed.
- Files: `.github/workflows/release-candidate.yml`, `COMMIT-PLAN.md`, `REFRESH.md`.
- Tests: cloud discovery includes `packages/cms/forms` and 41 public archives at this base; generated consumer lock resolves every Jini entry to a candidate archive with no links; consumer imports CMS HTML and Cloudflare forms. These steps do not exist before the change.
- Mutations owed to the combine: omit the forms archive and require resolution rejection; remove the CMS HTML export target from a disposable archive and require import failure.
- API-baseline delta: none; only inline workflow consumers are added.
- Look owed: none; full paired Tovu proof belongs to X1. Record commit and per-run archive digests, disk use, and any dependency/peer override requirement as a STOP.
- Deletions at diff re-read: only generated candidate `dist` source maps on the runner, as required by the sheet; no tracked source deletion or surplus code removed.

Static review: all three nightly suites use `!cancelled()` plus the successful-build outcome, without suppressing suite exits. Release-candidate permissions are read-only and checkout credentials are not persisted. Raw packing uses the existing discovery/publication helpers without edits; generated consumer lock assertions have plain-words messages, and an explicit presence assertion covers the named omitted-forms mutation. No new named function, cast, dependency, API, pad change, debt entry or file above 500 lines. Function-quality evidence is inconclusive until cloud execution; only inline top-level runner logic and short anonymous callbacks are new. No checks were executed locally.
