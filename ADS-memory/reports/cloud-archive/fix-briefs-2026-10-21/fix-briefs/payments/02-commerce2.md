Code Inspection(Review): Personas used: **code-inspection + security + tdd**.

Static review of `db6606fe`. No files changed; no tests, builds, or metrics executed.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| HIGH | `jini-int:packages/commerce/src/payments/ops/grants.ts:74` | Grant storage copies the binding shallowly, retaining its `amount` object. An adapter that changes that amount in place also changes the stored approval, allowing a larger refund/capture to redeem successfully. | Copy the nested Money value when minting. Test mutation of the original amount after minting; the existing copy test only changes `paymentId`. |
| HIGH | `jini-int:packages/payments-stripe/src/objects.ts:84` | Stripe authorizations emit `captured: 0`, but `accounting/plan-evidence.ts:126,278` rejects zero amounts. Manual authorizations—including risk-review holds—are quarantined instead of becoming capturable. Provider-only tests miss this integration failure. | Allow zero for captured amounts while retaining positive payment/refund validation. Add a Stripe → service → ledger authorization/capture test. |
| HIGH | `jini-int:packages/commerce/src/payments/ops/reconciler.ts:120` | Refund reconciliation ignores whether the snapshot applied successfully. A quarantined snapshot with empty refunds still reaches the absence rule and releases an unknown refund’s hold. | Stop judgment when snapshot application fails. Test a rejected snapshot with no refunds and assert the hold remains. |
| HIGH | `jini-int:packages/commerce/src/payments/ops/capture-void.ts:127` | An ambiguous capture/void only updates its attempt; the payment remains authorized/pending. The reconciler scans only `intent_status = 'unknown'` (`ledger/repo.sql.ts:350`), and operator resolution also requires an unknown intent. Lost responses therefore have no recovery path without a webhook. | Reconcile stale dispatched/unknown capture and void attempts using their payment reference, and prevent conflicting dispatches until resolved. |
| HIGH | `jini-int:packages/commerce/src/payments/ingest/worker.ts:137` | Exhausted retries call `deadInbox`, which erases `facts_json` (`ledger/repo.sql.ts:291`) without retaining the fact elsewhere. The deduplication key remains, so later verified redelivery is ignored. Temporary provider/storage failures can permanently discard payment events. | Preserve replayable facts for dead letters and provide recovery/requeue behavior. Test provider restoration followed by redelivery. |
| HIGH | `jini-int:packages/commerce/package.json:40` | Deleted `./payments` and `./store` exports still have Tovu importers: `apps/website/src/features/plugins/lipay/lipay-plugin.ts:33` and `store/store-plugin.ts:17`, plus public-route types. The next dependency upgrade breaks their compilation. | Retain compatibility exports until Tovu’s adapters, route types, and tests migrate together. |
| HIGH | `jini-int:packages/commerce/src/payments/ledger/repo.sql.ts:115` | Replacement idempotency lookups read only `commerce_payments`. The deleted implementation used `p_lipay__payments`, refunds, and events; neither registered migration transfers those records. Existing histories and idempotency protection become inaccessible after switching. | Supply an explicit legacy-data migration or compatibility bridge, including verified site/account/mode mappings and preservation of refund holds and keys. |
| MEDIUM | `jini-int:packages/commerce/src/payments/ops/capture-void.ts:89` | Capture replay checks payment identity but never the requested amount. Reusing a key for a different capture amount returns successful replay instead of `IDEMPOTENCY_CONFLICT`. | Persist and compare the capture amount/currency for each operation key. Add a same-payment, different-amount replay test. |
| MEDIUM | `jini-int:packages/commerce/src/payments/ops/reconciler.ts:144` | Every pass selects the oldest limited batch. Unresolvable rows retain their ordering timestamp, so `limit` old payments without provider references can indefinitely starve all newer payments. | Add cursor-based progress or a separate reconciliation scheduling timestamp. Test consecutive limited passes containing permanently unresolved rows. |
| MEDIUM | `jini-int:packages/commerce/src/payments/ops/common.ts:26` | New exported helpers violate the required two-object signature: examples include `fail(code, message)`, `owned(record, scope)` at line 70, and `dispatch(call)` at line 89. | Convert these boundaries and their callers to `(requiredObj, optionalObj = {})`. |

**Rules check**

- Plugins never import each other: **OK** — Stripe imports the commerce kernel (`payments-stripe/src/provider.ts:20`).
- Generic code in Jini; site-specific code in Tovu: **OK** — host behavior is injected (`commerce/src/payments/ops/deps.ts:13`).
- Two-object API signatures: **violated** — `commerce/src/payments/ops/common.ts:26,70,89`.
- Dependencies injected as ports: **OK** — ledger, providers, contexts, grants, clock, and IDs are injected (`ops/deps.ts:13`).
- React components receive data through props: **OK / not applicable** — no React component changes.
- Cyclomatic complexity ≤10: **unverified** — no measured violation established; the report’s lint claim was not independently rerun.
- Existing “why” comments preserved: **OK for retained behavior inspected** — raw-body ordering rationale remains (`http/payments-webhook.ts:20`).
- ADR-066 TypeScript migrations; no new Drizzle migrations: **OK** — appended migration `0002_payments_operator_actions.ts:56`.
- No data loss: **violated** — dead-letter fact deletion (`ledger/repo.sql.ts:291`) and missing legacy-data transition.
- `// TEMP: replaced by shared helper`: **OK** — no matches in the reviewed packages.

**Verdict: MERGEABLE AFTER FIXES** — approval binding, authorization, reconciliation, event retention, and legacy migration defects must be resolved before merge.
