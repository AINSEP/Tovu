# P-APPLY2 handoff (applier v2)

Files: `untangle/scripts/apply-repoint.mjs`, `untangle/scripts/__tests__/apply-repoint.test.mjs` (28 tests, all pass).
Test command: `node --test --test-concurrency=1 untangle/scripts/__tests__/apply-repoint.test.mjs`

## Job 1 (done)
Tovu commit `fd90d9c72` on refactor/terra (delete-routing, reduce form). No Jini commit. Pending coordinator follow-up (C4 TSV):
- row 240 `names` becomes `checkSitePathname as sharedCheckSitePathname,checkSiteRelativeTarget as sharedCheckSiteRelativeTarget,type SitePathCheck as SharedSitePathCheck,type SiteRelativeTargetCheck as SharedSiteRelativeTargetCheck`
- new row: `tovu  apps/website/src/features/site-inspection/published-page.ts  @jini-ai/http-kit/verified-origin  hasControlCharacter  @jini-ai/core/contracts/server/verified-origin  (rename empty)  wave`

## v2 grammar
rename column:
- `Old->New[, ...]`, each part may carry one `(note)`; `(... as ...)` keeps the old local name as alias. Same specifier (`new_spec == old_spec`) = in-place rename (import, export-from, inline `import('spec').Old`).
- `Old<X> => Old<...X...>` : every `Old<T>` use (exactly one type arg, else STALE) becomes the template with X := T.
- `Old => Old<...>` : every bare `Old` use becomes the template; uses that already have type args are left.
- Templates cover type references and extends/implements. Nested use inside its own type arg = STALE.
- Optional trailing `( clause ; clause )`: `add import [type] { A, B } from "spec"` (or `add/merge import ...`) merges into an existing import of that spec, else new statement after the last import; conflict with a binding of the same name from another module = STALE. Notes accepted and ignored: `core`, `every bare type use`, `X from core`.
- Any other identifier the template needs (not Old, not X, not a builtin like unknown) must already be bound in the file (import or top-level decl) or be named by an add-import clause, else STALE.
- Anything else = GrammarError (printed `ERROR row ...`, nothing written, exit 1). Template with new_spec == old_spec = GrammarError.
action column: must be an UPPER-CASE label (`SK-CORE+MOVE`); else GrammarError.
Summary line now has `STALE n, ERROR n`; run() returns `errors`.
Regression: v1 and v2 give identical counts on every other TSV (--phase all --dry-run).

## Dry-run results (Jini jini-terra-base, Tovu tovu-codex-trial-terra at fd90d9c72)
| TSV | phase | rows in phase | apply | already | stale | error |
|---|---|---|---|---|---|---|
| C3 | c3-rewrite | 128 | 119 | 0 | 9 | 0 |
| C3t | c3-rewrite | 57 | 57 | 0 | 0 | 0 |
| C3 | all | 496 | 487 | 0 | 9 | 0 |
| C3t | all | 298 | 284 (+3 manual) | 0 | 0 | 11 |
Nothing is written while any stale/error row exists, so C3 cannot be applied until the 9 are fixed.

## Ambiguous rows (TSV edits needed, not done by me)
### 9 stale C3 rows (C3.repoint.tsv line: what is missing)
MigrationStep template rows whose rename names an identifier but not where it is imported from. Fix: add `add import type {X} from "<spec>"` to the rename clause, or make sure an earlier row binds the identifier in that file.
- 3  jini packages/commerce/src/payments/ledger/migrations/0004_payments_attempt_recovery.ts : `Kysely` not bound (rename says only `(core)`; template `MigrationStep<StorageKernel<Kysely<unknown>>>`)
- 5  .../migrations/0001_payments_ledger.ts : `Kysely` not bound (same)
- 7  .../migrations/0002_payments_operator_actions.ts : `Kysely` not bound (same)
- 11 .../migrations/0005_payments_intent_replay.ts : `Kysely` not bound (same)
  (the four above: probably `add import type {Kysely} from "kysely"`; also check StorageKernel is bound in each)
- 9   jini packages/commerce/src/payments/ledger/migrations/index.ts : `KyselyKernel` not bound (rename says "KyselyKernel from db"; spec likely `@jini-ai/db/kernel`)
- 186 jini packages/db/src/owner-store/migrations/0000_owner_store.ts : `KyselyKernel` not bound (inside packages/db, spec is probably relative `../../kernel/index.js`)
- 202 jini packages/db/src/migrate/legacy-ledger.ts : `KyselyKernel` not bound (relative spec, probably `../kernel/index.js` or `../kernel/port.js`)
- 233 jini packages/db/src/__tests__/migrate/opt-in-runner.test.ts : `KyselyKernel` not bound (relative spec)
- 302 tovu apps/website/src/platform/db/migrations/runner.ts : `KyselyKernel` not bound (spec likely `@jini-ai/db/kernel`)
Note: an in-place `StorageKernel->KyselyKernel` row earlier in the same file would bind it; row order matters (rows apply in TSV order per file).

### 11 C3t grammar errors (phase wave, under --phase all; not in c3-rewrite)
Free text in the rename column, which v1 silently ignored. Move the text to `note` (or turn it into a real clause). Lines:
- T-ERR rows ("the Jini class (Tovu subclass deleted; runner passes appName "Tovu", ...)"): 59, 211, 236, 262, 270, 289
- T-LEGACY rows ("class moves verbatim into migrations/legacy-sqlite.ts (C3t step 3)"): 81, 194, 221, 255, 271
(T-ERR+MANUAL row is among the T-ERR ones; confirm its new_spec before moving the text.)

## Other notes
- Template rows are order-dependent with in-place rename rows of the same file; keep the MigrationStep move/template row before any row that needs its result.
- Internal bug found and fixed in testing: add-import insert at the end of a statement the same row deletes caused "overlapping edits"; handled by `settleInserts` (test added).
- Not covered: value-position uses of a template name (e.g. `typeof`), inline `import('x').Old<..>` templates, scope shadowing for templates.
- No test processes left running.
