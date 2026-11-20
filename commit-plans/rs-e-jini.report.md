- **K05-fix — done.** Updated `taxonomy-trash-follow-ups.ts`, `trash-term.ts`, and their two test files to use object-shaped repo arguments. Strengthened existing tests first; no cases deleted or exports added.
- **S2-J — done.** Updated `subscriptions.ts`, `tools/tool-handlers.ts`, and their named test files. Added conditional saves, version advancement, and confirmed-delete conflict mapping without retries. Added the three service race cases and one tool-mapping case. No exports added.
- **S12-J — stopped under the owner’s size rule.** Its named `indexer.ts` is already 540 lines and `indexer.test.ts` is 598, exceeding the 500-line limit. No search files, tests, or exports changed.

Each sheet is recorded in `COMMIT-PLAN.md`, including the blocker and diff review. Changes remain uncommitted. No tests, builds, installs, type-checks, or linters ran. Dropped sheets remain untouched.
