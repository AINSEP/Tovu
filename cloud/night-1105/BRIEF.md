# Cloud test + fix run 1 (11-05). HARD CAP 2 HOURS. Finish by pushing and reporting.
Repos: /workspace/Tovu and /workspace/Jini. Run `source /workspace/shared/dev-env.sh` and `/workspace/shared/start-postgres.sh` first. Governing rules: read /workspace/Jini/AI-Dev-Shop/agents/testrunner/skills.md and programmer/skills.md (this copy is the one to use; Tovu has none).
Branches: Tovu `night-1105`, Jini `integ/night-1105`. Fetch and check out both, rebuild Jini (build core first, then `pnpm --no-bail -r build`), `JINI_PACKAGES_DIR=/workspace/Jini/packages npm run link:jini`, `npm run build:preload` in apps/desktop.

## Do
1. Run the sections in cloud/night-1105/cloud-rerun-3.sh (TOVU_REPO, JINI_REPO set to the paths above). Also run the test commands printed in each cloud/night-1105/*-result.md, translating paths, and:
   `cd apps/desktop && node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test-concurrency=1 --test src/main/windows/last-window-quit.test.ts src/desktop-i18n.test.ts && npm run typecheck`
   Include the two Security page tests in apps/admin/src/features/security/__tests__/Security.unit.test.tsx, and federation-runtime-wiring. Run root and desktop tsc, and complexity lint on changed files (ceiling 9 in apps/desktop, 10 elsewhere).
   release-land-gates: expect failure until Tovu consumes published Jini; report, do not chase it.
2. Fix every real failure, using helper agents in parallel where files don't overlap. Failing test first for bugs; never weaken or delete a test to pass. If a test is stale, say why in the commit.
3. Re-run only what you changed, then the affected sections once.

## Rules
- NEVER push to main. No force-push. No deploys, no npm publish. Commit by explicit paths, push every 10 minutes to `night-1105` / `integ/night-1105`. If you can't push, keep commits and say so first thing in your report.
- Smallest change, no refactors, no new abstractions. No eslint-disable. Move "why" comments, never delete them. Generic logic stays in Jini. No generic user-facing errors. No secrets in files.
- Minor findings are LISTED, not fixed. Two fix attempts at the same failure with no progress: stop on that one and report it.
- Cap: 2 hours wall clock. On cap: push, report, END. Do not add follow-up work.

## Report: cloud/night-1105/RESULTS.md (committed and pushed)
Per section pass/fail/total; EVERY remaining failing test (file + name + first 20 error lines); every tsc error; what you fixed with commit shas; pushed branch names. Save raw output as raw/<section>.txt (not .log; .log is ignored).
