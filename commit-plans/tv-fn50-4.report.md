Completed **A1–A7 and A10**. Static AST inspection confirms edited functions stay within **50 code lines and complexity 10**.

Stopped **A8–A9**, unchanged: Electron serializes the callback, making module-private helpers unavailable inside it. Direct evaluation requires two callback arguments, conflicting with the required single-object signature.

- Tests added/run: none; mutation N/A. No builds, installs, type checks, or linters run.
- Callers repointed within the two edited files; no imports changed.
- Debt rows removed/added: **0/0**; no matching rows.
- Over 500 lines: `assistant-live.pins.journey.ts` now **1,303** lines, previously 1,208.
- Created only [COMMIT-PLAN.md](SCR/c-tv-fn50-4/COMMIT-PLAN.md), containing per-item messages, paths, and deleted tentative wrappers.

No commits made; ready for coordinator verification and commit.
