Completed C1–C5. No items stopped.

- Restored both wave-a3 splits; C2 retains `b17df641c`’s credential imports.
- C3 uses `orFallback`; added the rejecting-binding case. Mutation: rethrow makes it fail.
- C4 preserves the caught cause; extended the oversized-input test. Mutation: omit `{ cause: e }` makes it fail.
- C5 restored 10 comments and added 39 justified debt rows covering 40 removed-code occurrences.
- Removed the three named size-debt rows. No external callers repointed.
- Restored files exceed 500 code lines: `dev-auth.ts` 507; `assistant-byok.ts` 531.

Created [COMMIT-PLAN.md](SCR/c-tv-c6fix/COMMIT-PLAN.md) with per-item paths and commit messages.

Tests and gates remain unrun per dispatch. `.git` was not modified; changes are ready for coordinator review and commit.
