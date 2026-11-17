# S6 (revision 3) — change-set, outbox, webhook and form-delivery SQL repos

Template: T-SQLREPO rev 2. Facts: `S6-changeset-outbox-webhook-formdelivery-sql.facts.md` (13 files, 1,364 lines, 40 test files).
Revision 2 fixes judge finding 7 (S6c lost its stored-row mapper across the package boundary) and schedules the shared
test file (finding 14). Three independent runs in three packages.

```
id: S6a-changeset-outbox-sql (~200k) -> @jini-ai/db NEW ./events (node): change-set-repo.sql.ts, outbox-repo.sql.ts, index.ts
      ports: core/contracts/events `ChangeSetRepoPort`, `OutboxPort`            needs OD-1, OD-6 = (a); successor_of S5c (db manifest)
    S6b-webhook-sql (~190k) -> @jini-ai/integrations NEW ./webhooks/sql (node)   needs xpkg R11b-3 landed (it owns integrations in wave 3)
      ports: integrations/webhooks `WebhookSubscriptionRepoPort`, `WebhookDeliveryRepoPort` (`packages/integrations/src/webhooks/ports.ts`)
    S6c-form-delivery-sql (~170k) -> @jini-ai/cms existing ./forms/sql (add files)   needs xpkg R6-R9 landed; successor_of S8b (cms manifest)
prerequisites (all): S0 DONE (P1 `outbox_events:claim`, `webhook_deliveries:claim`, the two JSON-array form keys; P7; P8 outbox row N-1).
```

## S6a — change sets and the outbox
- `change-set-repo.ts` (178) `SqlChangeSetRepo` MOVE; `sqlite/change-set-repo.sqlite.ts` STAY-WIRING. (Revision 3: the
  merge-a / merge-b difference noted in revision 2 is gone. merge-final `232764af5` contains both, and its blob is the one
  in the facts file, which differs from merge-a only in a comment. The facts check of T-SQLREPO §3 applies as for every file.)
  The compensating rollback that uses change sets stays in Tovu; do not touch the `InMemoryChangeSetRepo` import that
  already comes from `@jini-ai/cms`.
- `outbox-repo.ts` (156): `SqlOutboxAdapter` MOVE; `outboxEventValues` (:58) MOVE and is exported from `@jini-ai/db/events`:
  it is the ONE definition of the stored outbox row (P8). `DEFAULT_OUTBOX_CLAIM_LEASE_MS` (imported at :5 from Tovu's
  events barrel) becomes a REQUIRED constructor field `claimLeaseMs` (db may not import infra); Tovu passes the constant.
- Importers of `outboxEventValues` after T1 (all repoint to `@jini-ai/db/events`): `features/identity/user-purge.ts` and
  `features/trash/adapters/user.ts` (type-only; they already RECEIVE the mapper by injection), `form-delivery-repo.ts`
  (until S6c), `server/runtime/composition/deps.ts`, and **`platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts:2`
  — S6a is the only sheet that edits that shared test** (T-SQLREPO §3).
- `contracts/core/events/{enqueue-only-outbox,jini-outbox-adapter,outbox-drainer,outbox-retry-policies,outbox-worker}.ts`:
  NOT this sheet (`sheets/move-events.md`, blocked on OD-6).
| Risk | Test (T0, fixed clock) | Mutation -> RED |
|---|---|---|
| Two workers claim one event | two concurrent `claimPending`: disjoint ids; an expired lease is re-claimable, a live one is not; recording kernel: `lockKey("outbox_events:claim")` first | remove the lock; ignore the lease |
| The claim lease silently changes | adapter built with the Tovu constant: stored lease expiry = `now + constant` exactly | pass another number in the binding |
| Enqueue escapes the caller's transaction | `enqueue` inside a transaction that then throws: no row | run it on a fresh connection |
| Stored row format | P8 (S0) + `markDelivered` / `markFailed` column effects pinned | change a mapped column |
| A caller builds the adapter without a lease | compile-time (required field) + `rg -n "new Sql(ite)?OutboxAdapter\(" apps/website/src` lists every site, each passes it | - |
| Change-set rows and their outbox row in one transaction | failing second write rolls the first back | split the transaction |

## S6b — webhooks
`webhook-repo.ts` (394): `SqlWebhookSubscriptionRepo`, `SqlWebhookDeliveryRepo` MOVE, one Jini file each
(`subscription-repo.ts`, `delivery-repo.ts`; neither over 500). Port types: `webhook-repo.ts:7-9` import them through
the Tovu barrel `features/webhooks/index`; step 0 resolves each to `packages/integrations/src/webhooks/ports.ts`.
`DeliveryEnvelopeStore` is declared in Tovu's `features/webhooks/repo.memory.ts`; Jini has `DeliveryEnvelopeStorePort`
(`ports.ts:99`): compare member by member; identical -> the class implements the Jini port; different -> SKIPPED, report.
`kysely`: `packages/integrations/package.json` does not declare it; J1 adds the optional peer the way cms does, with the
lockfile, in the same commit. Sealed signing secrets pass through opaque: the repo never unseals.
| Risk | Test (T0) | Mutation -> RED |
|---|---|---|
| Two workers claim one delivery; retry after a terminal state | concurrent claims disjoint under `webhook_deliveries:claim`; a terminal delivery is never returned | remove the lock; drop the status predicate |
| Stale subscription update | old version -> the conflict error from `@jini-ai/core/optimistic-concurrency` (`assertVersionedWrite`), row unchanged | drop the version predicate |
| Cross-workspace read of subscriptions or deliveries | two workspaces, same ids | drop a predicate |
| A signing secret leaves sealed form | the fixture plaintext appears in no written row | n/a (assert on rows) |

## S6c — form delivery (finding 7)
`form-delivery-repo.ts` (266): `SqlFormDeliveryRepo`, `SqlFormPullLeaseRepo`; `form-submission-receipt-repo.ts` (24).
**The mapper dependency.** `SqlFormDeliveryRepo.store` (:123-135) inserts each job into `outbox_events` with
`outboxEventValues(job)` (import at :12), inside the transaction `once` opened under the plan lock (:103). cms may not
import db, and the insert must stay in that transaction. So the repo takes the mapper as a required field, the same way
`SqlUserPurge` already does (`features/identity/user-purge.ts`: `eventValues: typeof outboxEventValues`):
```
FormDeliverySqlRequired = {
  kernel; tables: { plans: string; jobs: string; outboxEvents: string };
  outboxRow: (event: DomainEvent<object>) => Record<string, unknown>;   // the host's ONE stored-row mapper
  statusMaxLimit: number;                                             // today DELIVERY_STATUS_MAX_LIMIT from Tovu's headless contract
}
```
Tovu binds `outboxRow: outboxEventValues` (from wherever it lives when S6c runs:
`rg -n "export function outboxEventValues" apps/website/src packages -g '!**/node_modules/**'` in both repos; S6c does
NOT depend on S6a) and `statusMaxLimit: DELIVERY_STATUS_MAX_LIMIT`. No default for either. `FormDeliveryStatusRow`
becomes a Jini-local type in `forms/sql`; Tovu's `contracts/headless` keeps its own and the re-export at :30 is deleted
(importers repoint to the headless contract). The repo also READS `outbox_events` (`id`, `event_json`, the status columns
`formDeliveryStatusFromOutbox` needs): those columns are a Jini-local interface, compared by S0-P6.
| Risk | Test (T0, unmoved code) | Mutation -> RED |
|---|---|---|
| A plan's jobs are enqueued outside the plan transaction | `once` whose builder returns 2 jobs, with the second `form_delivery_jobs` insert made to fail (duplicate job id fixture): NO plan row, NO outbox row remains | move the outbox insert before the transaction; use a second kernel |
| Stored job row differs from what the outbox adapter reads | `once`, then `SqlOutboxAdapter.claimPending`: the claimed records deep-equal the planned job events (the P8 format, end to end) | change one mapped column in the mapper passed in |
| Plan executed twice | two concurrent `once` for one submission: the builder runs once, both return the same plan; recording kernel: the JSON-array plan key first | remove the lock |
| Identity mismatch between request and built plan | plan or child job naming another workspace / submission: throws as today, nothing written | remove `assertSameIdentity` |
| Pull lease stolen | second `claim` for one receiver inside the lease gets today's refusal; `release` with a wrong token does not release; the JSON-array pull key recorded | remove the lock; drop the token predicate |
| Purged answers survive in queued jobs | `scrubPurged`: payload blanked and unfinished jobs failed for exactly those submissions | widen / drop the submission predicate |
| Status list bound | `recentUnfinished` with `limit` above `statusMaxLimit` is clamped to it | ignore the option |
Binding test (T1): a recording `outboxRow` receives each job event once, in plan order, and its return value is the row
inserted (read back by `id`).

## commits / stops
Each run T0 -> J1 -> T1 (T-SQLREPO §5); the three runs share no source file.
- STOP (S6a): OD-6 is not answered (a): SKIPPED. STOP: the error-system or publish-engine design has a scheduled sheet on
  `jini-outbox-adapter.ts` or an outbox caller in this sheet: it goes first (`git log` on the integration branch).
- STOP (S6c): the outbox insert would need to leave `store`, or cms would import `@jini-ai/db` (`rg -n "@jini-ai/db" packages/cms/src/forms`; after R6-R9 it prints nothing and must stay so).
Not verified while planning: bodies of `change-set-repo.ts` and `webhook-repo.ts`; member-by-member port comparisons;
whether infra's and core's `OutboxPort` differ (move-events.md says positional `enqueue(event)` / `claimPending({ batchSize, nowIso })`, which matches `outbox-repo.ts:90,100`).
