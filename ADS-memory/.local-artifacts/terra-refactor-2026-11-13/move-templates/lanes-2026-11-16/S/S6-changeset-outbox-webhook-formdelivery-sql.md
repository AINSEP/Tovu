> **REVISION 2 HOLD (2026-11-17): do NOT dispatch this sheet as written.** The Codex judge's finding(s) below were checked against the code and accepted; the redesign is not written yet (INDEX §7 and "Revision 2 - judge response"). Until this banner is removed the sheet is input for the next planning run, not an executor brief.
> Finding 7 (S6c only; S6a/S6b are not affected by it): `platform/db/repos/form-delivery-repo.ts:12,131` calls `outboxEventValues` inside the plan transaction; S6a moves that mapper to `@jini-ai/db/events` and cms may not import db, so S6c needs a host-injected mapper port that inserts in the caller's transaction, with rollback and exact stored-row tests. Prerequisites renamed by the xpkg revision: S6b waits for xpkg `R11b-3` (integrations), S6c for xpkg `R6-R9`.

# S6 — change-set, outbox, webhook and form-delivery SQL repos

Template: T-SQLREPO. Facts: `S6-changeset-outbox-webhook-formdelivery-sql.facts.md` (13 files, 1,364 lines, 40 test files).

```
id: S6a-changeset-outbox-sql (~200k) -> @jini-ai/db NEW ./events (node): {change-set-repo.sql.ts, outbox-repo.sql.ts, index.ts}
      ports: core/contracts/events `ChangeSetRepoPort` (change-set.ts:84), `OutboxPort` (ports.ts:111)   (OD-1)
    S6b-webhook-sql (~190k) -> @jini-ai/integrations NEW ./webhooks/sql (node)      needs P-DEP (kysely in integrations)
      ports: integrations/webhooks `WebhookSubscriptionRepoPort` (ports.ts:36), `WebhookDeliveryRepoPort` (:46)
    S6c-form-delivery-sql (~170k) -> @jini-ai/cms existing ./forms/sql (add files)
prerequisites: S0 green (P1 `outbox_events:claim`, `webhook_deliveries:claim`, the two JSON-array form keys; P7; P8 outbox row N-1).
  S6a: OD-6 answered (the outbox shape decision recorded in `sheets/move-events.md`, plan/w1-sheets-f: core-contract `OutboxPort`
  everywhere vs two shapes). S6a assumes answer (a) (core-contract shape). With (b): SKIP, re-plan.
  S6b: R11 (integrations) landed or no TSV row on its package.json/webhooks index. S6c: R9 landed.
```

## split
- `change-set-repo.ts` `SqlChangeSetRepo` MOVE; `sqlite/change-set-repo.sqlite.ts` STAY-WIRING (2 prod + 6 tests). The compensating rollback that uses change sets STAYS in Tovu (plan-v6 S6); `repoint-commands` (done on moves/r2-a) already took `InMemoryChangeSetRepo` from `@jini-ai/cms`: do not touch that import.
- `outbox-repo.ts`: `SqlOutboxAdapter` MOVE. `outboxEventValues` (row mapping used by `SqlUserPurge` and `trash/adapters/user.ts` to insert an event inside THEIR transaction): MOVE and export — it is the one definition of the stored row format (P8); both Tovu callers import it from `@jini-ai/db/events`. `DEFAULT_OUTBOX_CLAIM_LEASE_MS` comes from Tovu's `contracts/core/events/index` (re-export of infra's): Jini's adapter takes `claimLeaseMs` as a REQUIRED option (db may not import infra); Tovu passes the constant. 7 prod + 20 test importers.
- `contracts/core/events/{enqueue-only-outbox,jini-outbox-adapter,outbox-drainer,outbox-retry-policies,outbox-worker}.ts` (286 lines): NOT this sheet — `move-events.md` owns them and is blocked on OD-6.
- `webhook-repo.ts` (`SqlWebhookSubscriptionRepo`, `SqlWebhookDeliveryRepo`) MOVE; it imports three type groups from the Tovu barrel `features/webhooks/index` (lines 7, 8, 17): resolve each to `@jini-ai/integrations/webhooks`; `DeliveryEnvelopeStore` — find its declaration; if it is Tovu-only it MOVES with the repo as a port type. Sealed secrets pass through opaque: the repo never unseals.
- `form-delivery-repo.ts` (`SqlFormDeliveryRepo`, `SqlFormPullLeaseRepo`) MOVE; imports `DELIVERY_STATUS_MAX_LIMIT`, `FormDeliveryStatusRow` from Tovu `contracts/headless/index` (-> required option `statusMaxLimit` + a Jini-local row type; the headless contract STAYS Tovu). `form-submission-receipt-repo.ts` (24) MOVE with it; its port type comes from the Tovu forms barrel: resolve to cms/forms or move the type.

## Characterization (T0)
| Risk | Test | Mutation -> RED |
|---|---|---|
| Two workers claim the same outbox event / webhook delivery | two concurrent `claimPending` with a fixed clock: disjoint results; an expired lease is re-claimable, a live one is not | remove the claim lock; ignore the lease |
| Claim lease silently changes | the adapter built with the Tovu constant claims with that lease (assert stored `claimed_until`) | pass a different number in the binding |
| Event enqueued outside the caller's transaction | enqueue inside a transaction that then throws: no row | run enqueue on the base handle |
| No-op change produces an event (LESSONS 17) | pin today's behaviour for an unchanged save in one representative writer | - |
| Webhook delivery retried after terminal state; subscription version conflict | terminal delivery is never returned by claim; stale subscription update -> conflict (file imports `core/optimistic-concurrency`) | drop the status/version predicate |
| Form delivery plan executed twice; pull lease stolen | the two JSON-array lock keys recorded; a second pull for the same receiver within the lease gets nothing | remove a lock |
| Webhook signing secret leaves sealed form | fixture plaintext never appears in any written row | n/a |

## stops
- A caller constructs `SqlOutboxAdapter` without a lease (after the move it is required: the census lists every constructor call).
- The error-system design (its CODEX-JUDGE names `jini-outbox-adapter.ts`) or the publish-engine design schedules edits to a file here: they go first.
Not verified while planning: bodies; `DeliveryEnvelopeStore`'s owner; whether infra's and core's `OutboxPort` differ in member shape (move-events.md says positional `enqueue(event)` / `claimPending({batchSize, nowIso})`).
