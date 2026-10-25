Code Inspection(Review Mode): Personas used: code-inspection + security + tdd.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| MEDIUM | `tovu-int:apps/website/src/cli/__tests__/unit/plugin-command.unit.test.ts:158` | The installer starts before the TTY skip at line 162. Skipping leaves its promise running without an await or rejection handler; it can race fixture removal or open a real consent prompt. Catalog: F7.1/F7.2. | Move the TTY skip before calling `runPluginInstallCommand`, preferably before fixture setup. |

**Rules check** — sampled test changes only; product hunks excluded.

- Plugin isolation: OK; no violation observed.
- Generic code owned by Jini: OK; no parallel runtime owner introduced by reviewed tests.
- Two-object public signatures: OK; no applicable public API additions.
- Dependencies injected as ports: OK in sampled desktop tests.
- React data through props: OK within reviewed test scope.
- Cyclomatic complexity ≤10: no breach observed; mechanical measurement not performed.
- Existing “why” comments preserved: OK in reviewed test edits.
- ADR-066 migrations only: OK; no migration additions in test scope.
- No data loss: OK in sampled persistence checks; product behavior remains outside this review.
- `// TEMP: replaced by shared helper`: OK; none added in test changes.

Tests and builds were not run. Reported coverage remains unverified.

**Verdict: MERGEABLE AFTER FIXES** — fix the installer task escaping its skipped test; no other verified findings emerged from the samples.
