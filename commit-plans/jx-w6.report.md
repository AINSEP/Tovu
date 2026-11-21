J-RATCHET: done; verification owed to combine.

Files touched: `scripts/check-error-gate.mjs`, `scripts/__tests__/check-error-gate.test.ts`, `COMMIT-PLAN.md`, and `REFRESH.md`.

Added four tests first: growth refusal, scoped-shrink refusal, legitimate full shrink, and absent-ledger creation. All initially lack the new export; the first two also expose the previous unconditional overwrite. The latter two preserve successful behavior.

The update function now refuses scoped scans and debt growth before writing. Reporting moved verbatim; `--list` precedence and WARN/strict behavior remain unchanged. Checked-in ledger bytes were untouched.

No tests or other prohibited checks ran. Combine owes red/green and the named mutations. `REFRESH.md` records that `origin/integ/merge-10` was unavailable; the starting script matched `de4e555b9`.

Diff reread: no out-of-scope edits or cleanup deletions. No commits or `.git` writes.
