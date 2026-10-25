Code Inspection(Review): Personas used: code-inspection + security + tdd.

Reviewed branch tip `08f5dac9ff4e2ca8366f875361b6c84cee70afac` through Git objects only. No edits or test execution. Reported coverage remains unverified; the referenced design commit was unavailable.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| HIGH | `jini:packages/commerce/src/payments/accounting/plan-evidence.ts:179` | Amount matching can release an unrelated refund’s hold. An unknown reservation binds to a dashboard refund’s same-amount `pending` evidence; that dashboard refund later failing changes the reservation to `failed`, releasing money while the original dispatch remains unresolved. | Require verified correlation before replacing an unknown reservation. Keep unrelated evidence separate and preserve the original hold. Add an unknown → foreign pending → foreign failed regression case. |
| MED | `jini:packages/commerce/src/payments/ledger/repo.sql.ts:312` | Outbox reads sort by timestamp, then arbitrary ID. Events written within one millisecond can deliver `refund.succeeded` before `payment.succeeded`, contradicting `apply-evidence.ts:201`. The ordering test at `accounting/__tests__/apply-evidence.vitest.test.ts:429` checks only the returned array. | Persist an ordering sequence and read by it. Test persisted ordering with a fixed clock and IDs whose lexical order reverses insertion order (testing catalog F6.3). |
| MED | `jini:packages/commerce/src/payments/accounting/apply-evidence.ts:112` | Evidence is inserted before validation. Fractional or unsafe amounts throw in the integer encoder, rolling back the observation instead of recording the promised `bad-amount` quarantine. Payment and dispute observations have the same ordering defect. | Validate before inserting numeric evidence. Preserve malformed observations in quarantine without putting invalid values into integer columns. Test through both ledger adapters. |
| MED | `jini:packages/commerce/src/payments/accounting/plan-evidence.ts:256` | Captured totals use the strictly-positive amount validator. Valid authorization evidence containing `captured: { minorUnits: 0, currency: "USD" }` is quarantined, preventing the authorization from being applied. | Allow zero for captured totals while retaining positive charge/refund validation. Add an authorization-with-zero-captured test. |
| MED | `jini:packages/commerce/src/payments/accounting/apply-evidence.ts:197` | A redirect action survives successful completion when success evidence omits `next`. A stale action-bearing observation can also overwrite the action after the intent status has already become `succeeded`. | Derive action updates alongside the merged status; clear actions on completion and prevent stale evidence from restoring them. Test both delivery orders. |
| MED | `jini:packages/commerce/src/payments/accounting/apply-evidence.ts:141` | Dispute deadlines are stored only on insertion. A later observation supplying or correcting `dueBy` is discarded—even when status changes—leaving consumers with a missing or obsolete response deadline. | Include deadline changes in dispute planning and persistence, including updates where status stays unchanged. |
| MED | `jini:packages/commerce/src/payments/ledger/rows.ts:39` | New public APIs violate the mandated two-object signature: `decodeMinor(value)`, the other integer codecs, `constraintKindOf(error)`, and `PaymentsLedger.transaction(fn)` accept positional values/callbacks. | Change these boundaries to required objects such as `{ value }`, `{ error }`, and `{ fn }`, retaining the optional object default. |

**Rules check**

- Plugins never import each other: **OK** in changed production code.
- Generic code in Jini; site-specific code in Tovu: **OK**.
- Two-object API signatures: **violated** — `ledger/rows.ts:39`, `ledger/repo.ts:161`.
- Dependencies injected as ports: **OK** — writer, clock, IDs, risk port, and storage kernel are injected.
- React components receive data through props: **OK** — no component changes.
- Cyclomatic complexity ≤10: no breach identified by source inspection; **mechanical verification unavailable** under the execution prohibition.
- Existing “why” comments preserved: **OK** for retained behavior.
- ADR-066 TypeScript migrations; no new Drizzle migrations: **OK** — `ledger/migrations/0001_payments_ledger.ts:198`.
- No data loss: **violated** for malformed-observation retention — `accounting/apply-evidence.ts:112`.
- No unflagged `TEMP: replaced by shared helper`: **OK** — none found in reviewed modules.

**Verdict: MERGEABLE AFTER FIXES** — refund reconciliation can release unresolved money, and the evidence and outbox paths need the corrections above.
