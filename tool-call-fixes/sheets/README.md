# Sheets: rules every executor follows

One sheet = one Sonnet run = one branch = small commits. Read `../DESIGN.md` section named in the sheet first.

## Setup (before reading source)
- Jini checkout must be named exactly `Jini`, next to `Tovu`. Base branch: the newest of `integ/merge-final-2026-11-16`,
  `integ/merge-a-2026-11-16`; say which in the report.
- Jini: `pnpm install && pnpm -r build`, then record a green baseline: `pnpm guard`, `pnpm typecheck`, and
  `npm --prefix packages/<pkg> run test` for each package the sheet touches. Tovu: `npm ci`, `npm run typecheck`, and
  the test files the sheet names (use the exact runner line of the `test` script in `package.json`, with the file path).
- Record the **test count** of every touched test file before and after. A lower count needs a written reason.

## Order inside every sheet
1. Find each cited symbol by name (`rg`), because line numbers drift. If a symbol is gone or already changed, stop and report.
2. Write the characterization test. It must pass on the unmodified tree and pin today's behaviour.
3. Write the red-first test. Run it. It must **fail for the reason the sheet names**. Paste the failure in the report.
4. Make it pass with the smallest change. Flip the characterization test to the new behaviour in the same commit.
5. Run the package tests, `pnpm guard` / `pnpm typecheck` (Jini) or `npm run typecheck` + `npm run check:size` + `npm run check:complexity` (Tovu).
6. Commit and push every logical unit. Never gate a commit on green; report failures as they are. `git pull --rebase` before each push. Never force-push.

## Owner rules (acceptance criteria in every sheet)
- Functions ≤ 50 lines, complexity ≤ 10, files ≤ 500 lines. Check the file you add to **before** adding; use the sibling file the sheet names.
- Exported functions take `(required, optional = {})`. Dependencies (clock, ids, scheduler, fetch, logger) come in as typed ports; tests use fakes of those interfaces, never module mocks of project code.
- A Jini package imports only itself, `@jini-ai/core`, `@jini-ai/protocol`. No Tovu or vendor tool names in `packages/**`.
- No re-export shells. No new barrel files.
- Errors: plain words, exact text asserted with `assert.equal` / `toBe`. Never a status or code alone. Never mask a tool id, an input name or a slug. Never print a secret.
- Do not skip, weaken or delete a test to get green. Do not add coverage-ignore comments or widen exclude lists.
- Tools first: nothing here adds a reason for an in-app agent to use Bash.

## Stop and report instead of guessing when
- a gate (auth, origin, run credential, read-only check, confirmation, deny-by-default executor) would move or run in a different order than `../DESIGN.md` M1 states;
- a prerequisite named in the sheet has not landed;
- the red-first test passes without a change (the bug is already fixed: report it, do not invent work);
- a measured fact contradicts the design (for example the named set does not fit the direct limit).

## Report (end of run)
Branch, every pushed SHA, files changed, test counts before/after, the pasted red failure, anything not verified.
