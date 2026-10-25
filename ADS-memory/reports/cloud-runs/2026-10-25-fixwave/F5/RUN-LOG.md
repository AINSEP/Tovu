# F5 run log (Jini: Stryker L10 + RUN 2 — agent-plugins + cms plugin-export)

## 2026-10-25T21:34Z — STARTED
Jini branch cloud/fixwave-1025-F5 from origin/cloud/overnight-1024-jini 3e2fbae8 + cherry-pick of run-2 Part 0 test commit 9fa38851 (exports.ts tests). Node 24.22, pnpm install + pnpm -r build OK (exit 0). Plan: run-2 security musts first (host-validator, plugin-export '//', package-paths containment), then capability-declarations regex tables, memoisation identity tests, then coverage + CCN + Stryker --force re-score.
