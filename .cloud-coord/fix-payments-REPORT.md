# fix-payments REPORT (2026-10-21, 21:19-21:50 UTC)
Jini `cloud/fix-commerce-2026-10-21` (from build-commerce2, head c94e99d0) · Tovu `cloud/fix-commerce-2026-10-21` (from integration).
4 Opus subagents, 2 waves (≤3 at once). Shared tree; no rebase/force.

## 01-commerce.md (build-commerce)
| finding | result |
|---|---|
| F1 HIGH unknown reservation bound by foreign pending refund | fixed c2b8222b (only succeeded binds by amount; pending defers) |
| F2 MED outbox order | not reproduced: `seq` column (0002, 328bd72e, after reviewed tip) already orders; regression test a121db2e both adapters. Migration no. 0003 is unused |
| F3 MED evidence inserted before validation | fixed a84a6e6b (bad amount stored NULL + quarantined `bad-amount`, no rollback) |
| F4 MED captured zero rejected | fixed 08231d2b |
| F5 MED stale redirect action | fixed b8a1de5d (an existing assertion that encoded the bug now expects `none`) |
| F6 MED dispute dueBy not updated | fixed 4c88b241 |
| F7 MED two-object signatures (codecs, constraintKindOf, transaction) | fixed bb9f8aa8, c94e99d0 |

## 02-commerce2.md (build-commerce2)
| finding | result |
|---|---|
| F1 HIGH grant shallow copy | fixed 59e8be16 |
| F2 HIGH Stripe captured 0 quarantined | fixed 08231d2b + Stripe→service→ledger test e0a67a7f |
| F3 HIGH reconciler judges a quarantined snapshot | fixed 9fe4d3b6 |
| F4 HIGH ambiguous capture/void has no recovery | fixed b3ece837 (`listOpenAttempts`, reconcile-attempts.ts, conflicting dispatch refused before grant redeem) |
| F5 HIGH deadInbox erases facts | fixed 44c4f8f6 (facts kept; `reviveInbox`; redelivery revives; `InboxWorker.requeue`) |
| F6 HIGH deleted ./payments ./store exports | fixed Tovu-side 9977609b, 2697ea95, 29a2bc7f: lipay adapter is now on the kernel (`PaymentsPort`); the store spike runtime moved to Tovu `features/plugins/store/store-runtime.ts` unchanged |
| F7 HIGH legacy p_lipay__ data | fixed f2143104, 5dc6d7c4: ADR-066 step 0005 imports payments, refunds (with holds) and events (into inbox dedup), insert-or-ignore, legacy tables kept; unmappable fields read through `readLegacyLipayHistory` |
| F8 MED capture replay ignores amount | fixed 8fcd9806 (migration 0004 adds attempt amount/currency; pre-0004 rows still replay on payment match) |
| F9 MED reconciler starvation | fixed b3ece837 (`after` cursor per scope) |
| F10 MED ops helpers positional | fixed 46fc7ce1, 26b53f76 |
LOW: none in either review. Listed only: Tovu lockfile pins npm @jini-ai/commerce 0.1.1 (release order).

## Tests (cloud)
- Jini commerce kernel: 611 passed, 2 skipped (Postgres). Baseline was 546. tsc clean.
- payments-stripe: 145/145.
- Tovu lipay + store: 30/30. Site route tests and route-async-guards webhook: green per fixer C.
- Vitest `--maxWorkers=2` errors in this environment, so tests ran with `--pool=forks maxForks=2`.

## Coverage (lines/branches/functions)
100% on every touched source file: apply-evidence, plan-evidence, grants, common, capture-void, reconciler, reconcile-attempts, reconcile-snapshot, service, intent, refund, operator, worker, receive, outbox-relay, repo.memory, repo.sql, rows, migrations/0005 + index, Tovu lipay-plugin, store-plugin. Tovu store-runtime.ts is 99.3% lines / 94% branches; the misses are type-only lines (tsx source-map artifact).

## Complexity (eslint complexity + sonarjs cognitive, 10)
0 violations in touched functions. Highest: retrieveSnapshot cyclomatic 9 (moved unchanged); applyPaymentEvidence 8; intentAmountProblem cognitive 9; activateLipay 6.

## LOCAL-RUN NEEDED
- `packages/commerce/src/payments/ledger/__tests__/postgres.vitest.test.ts`: covers 0004 ALTER/INDEX, afterCursor, reviveInbox, listOpenAttempts, dispute due_by update, NULL evidence amount.
- Postgres variant of `legacy-lipay-import.vitest.test.ts` (COMMERCE_PG_URL).

## LOCAL VISUAL CHECK
- Site store and product pages (`routes/site/store.ts`, `products.ts`). The runtime body is unchanged, so output should be identical.

## Noticed, not fixed (out of scope)
1. Fractional settlement fee/net or a fractional dueBy still throws in the encoder (same class as R1-F3).
2. A foreign success bound by amount and later reversed still releases our hold.
3. Outbox orders by created_at before seq, so a clock stepping backward could reorder events.
4. The reconcile cursor is in memory only, so a restart scans from the oldest rows again. After the last rows, one pass is empty before it wraps.
5. `sql.ts` does not export the 0004 step id/factory. `encodeColumns(set)` and memory `attempt(fn)` are still positional (private).
6. Tovu typecheck: 46 errors outside touched files (ContentKernel vs StorageKernel etc.): integration vs linked-Jini drift, resolved at the big merge.

## Owner questions
1. Tovu lipay adapter is unmounted and no host passes a `legacyLipay` mapping (site id, provider account, mode). Step 0005 refuses to boot (rolls back) when legacy rows exist and no mapping is given. Which mapping should production sites use?
2. Lipay adapter API changed from `LipayApi` to `PaymentsPort` (nothing in Tovu used it). OK?
3. Grants are still in-memory (unchanged). Is a durable `MoneyGrantPort` the next lot?
