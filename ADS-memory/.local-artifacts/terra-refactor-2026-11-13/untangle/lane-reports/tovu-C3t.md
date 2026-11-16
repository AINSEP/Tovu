# C3t report: PARTIAL-free DONE (hand edits only; pass not run)

Branch `wave-b/C3t` (Tovu only; Jini untouched, bases: Tovu b28d38c6, Jini b7666092 on refactor/terra). Commits: 7cf601b2 (facade deletes + hand edits), e654a131 (source-digests + test), plus this report.

Done: deleted kernel/port.ts, kernel/dialect.ts, migrations/step.ts; dropped barrel lines (kernel/index.ts, migrations/index.ts:179); LegacyHistoryError moved verbatim into legacy-sqlite.ts (its ./step.js import removed); runner.ts wrapper for the Tovu error subclass removed (returns jiniRunMigrations directly); jini-db-facades test: shim test deleted, line-78 constructor gets "Tovu", unused imports removed; new migrations/source-digests.ts (51 ids); checksums.test.ts split (expectedSource = digest ?? ledger pin, new key-sanity test). checksums.ts untouched (git diff empty).

Digests: computed on a scratch copy after applying C3 + C3t rows (4 stale rows dropped). The script reproduced all 51 ledger pins on the unmodified tree (0 differing) and gave 51 differing after repoint, so the method matches sourceChecksum. Applier dry run on this branch: only the expected 4 stale rows.

STALE C3t.repoint.tsv rows after hand edits (list, do not fix): 56, 57 (facade test imports removed), 255 (legacy-sqlite ./step.js import removed, class local), 262 (runner ./step.js import removed). Pass will exit 1 on them: drop these 4 rows (or skip) before running.

NEEDS-APPLIER-PASS / EXPECTED: remaining importers of ./step.js, ../kernel/port.js, ../kernel/dialect.js (e.g. migrations/index.ts:29,57, legacy-sqlite.ts:8,10, kernel/sqlite-only.ts:3, all step files); Tovu typecheck against new core names expected to fail until merge; not run.
Order note: C5.repoint.tsv also edits migrations/0012_secrets_vault.ts (VaultKind import), so the 0012 digest must be recomputed after pass C5 (same script; scratchpad-only, recompute with sha256 of comment-stripped, whitespace-collapsed source).
Not run (ENV: no node_modules, needs pass + Jini links): checksums.test red/green/mutation check, typecheck. Debt entries retired: none. No package.json edits.
Context ~45k tokens, ~35 min.
