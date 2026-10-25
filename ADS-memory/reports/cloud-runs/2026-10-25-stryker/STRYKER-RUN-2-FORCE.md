# StrykerJS run 2 — FORCED re-run (measure-only)

Status: IN PROGRESS. Progress log (append-only) is at the bottom; final report replaces this header when done.

## Progress log
### 2026-10-25T21:43Z — STARTED
Tovu `cloud/stryker-1025-tovu` @ origin tip; Jini detached at **`9fa38851`** (= `3e2fbae8` + run-2's Part-0 `exports.ts` test commit — run 2's Parts 1–3 were measured on this tree, so this is the comparable one; ASSUMPTION, see report). Plan: pnpm install + build, plain `vitest run` baseline counts, dry-run count check, then Parts 1/2/3a/3b with `--force`.
