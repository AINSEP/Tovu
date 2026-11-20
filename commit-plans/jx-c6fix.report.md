Completed J1–J4; none stopped.

- Added all eight exports, runtime tags and README listings after verifying imported names on both xd5 refs.
- Restored plugin id and safe error class/code in desktop sign-in warnings.
- Wrote J4 tests before the fix: 1 case became 2, covering `Error(SQLITE_BUSY)` and `Error`. Restoring the generic message would make both fail.
- Created four changesets and [COMMIT-PLAN.md](SCR/c-jx-c6fix/COMMIT-PLAN.md), with messages and exact paths.
- Callers repointed: none. Debt rows added/removed: none.
- Changed files over 500 lines: `packages/cms/package.json`, 695 → 725, recorded under the override.

No tests, builds, installs, typechecks or linters run. No commits made.
