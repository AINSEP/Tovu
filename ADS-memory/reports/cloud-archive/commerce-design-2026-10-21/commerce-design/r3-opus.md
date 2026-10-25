ACK_PACKET_RECEIVED CTX-commerce-debate-2026-10-21-R3 -- I received the packet and will work on it.

**What changed:**
- I'm dropping mandatory fetch-on-notify. All three objections hold: the provider's read API can lag behind its webhooks, rate limits, PayPal splits authorization, capture and refund into separate resources, and out-of-band rails may have no lookup.
- I keep my core point that there must be one write path. Sync responses, webhooks and snapshots are all turned into `RefundEvidence` and pass through one function.
- `retrieve` becomes optional. It is used only for unknown outcomes, webhooks that carry no ids, and a scheduled reconcile.
- A stale or partial snapshot cannot do harm. Each refund's status only moves forward, and a refund missing from a snapshot is never deleted.
- **Adopted from the others:**
  - Sonnet: reserved and succeeded money tracked separately, with a sweep for stale reservations.
  - Codex: disputes as a separate dimension, and services enforce approval themselves.
  - Gemini: `next_action_json` persisted, uppercase currency.

## 1. Packages and dependencies (`A ──▶ B` means A imports B)

```
 Tovu host (composition root) ──▶ @jini-ai/commerce, core, db, agent-plugins
     │ loads plugins via contribution loader; injects ports at runtime
     ▼
 ┌──────────── @jini-ai/commerce ─────────────┐
 │ money · payments(kernel/ledger/ingest)     │──▶ @jini-ai/core (tools, approval, gated-mutations)
 │ catalog · orders · tools · react(props)    │──▶ @jini-ai/db (StorageKernel)
 │ exports TYPES: PaymentProvider, PaymentsPort, CommerceEvent
 └──────▲───────────────────────▲─────────────┘
        │ type-only             │ type-only
 plugin-payments-{stripe,       plugin-{donations,shopify-import}
   paypal,lipay}                  (receive PaymentsPort + event subscriber at activation)
 admin UI (Jini admin-surfaces) ──▶ commerce/react; agent tools come from commerce/tools via core registry
```

These dependencies never exist: plugin ▶ plugin, commerce ▶ any plugin, provider ▶ the ledger.

## 2. File structure

```
packages/commerce/src/
  money/money.ts                      NEW  (Money from ports.ts:30 + exponents)
  payments/
    contract/provider.ts              REWRITE ports.ts
    contract/payments-port.ts         NEW  (replaces LipayApi, lipay-plugin.ts:162)
    registry.ts                       KEEP
    credentials.ts                    KEEP (+ sealed per-workspace adapter later)
    state/payment-status.ts           KEEP state-machine.ts, extend
    state/refund-status.ts            NEW
    ledger/rows.ts  ledger/repo.sql.ts  ledger/repo.memory.ts   NEW (selects lifted from lipay-plugin.ts:540-561)
    accounting/refund-totals.ts       NEW pure
    accounting/apply-evidence.ts      NEW (the only ledger writer)
    ops/intent.ts  ops/refund.ts      REWRITE lipay-plugin.ts:613-879
    ingest/ingest-webhook.ts  ingest/inbox-worker.ts   REWRITE :885-1009
    reconcile/reconciler.ts  outbox/outbox.ts           NEW
    kernel.ts                         NEW createPaymentsKernel (replaces activateLipay :505)
    testkit/provider-conformance.ts   NEW, exported as ./payments/testkit
    lipay-plugin.ts                   DELETE after split
    providers/lipay-gateway.ts        MOVE → plugin-payments-lipay
  http/payments-webhook.ts            KEEP (route gains account → workspace; fixes B5)
  catalog/{repo,repo.rows,storefront,status}.ts  KEEP; types.ts, checkout.ts REWRITE to Money
  catalog/webhook-inbox.ts            DELETE   store/store-plugin.ts  DELETE
  tools/status.ts (= tools.ts KEEP)   tools/payments-refund.ts NEW
plugin-payments-stripe/
  plugin.json  (extensions["ai.jini.commerce"]: { provider: "dist/provider.js" })
  src/provider.ts  src/map-evidence.ts  src/verify.ts  src/errors.ts
  src/__tests__/conformance.test.ts  fixtures/*.json (recorded in sandbox)
plugin-donations/
  plugin.json  (extensions["ai.jini.commerce"]: { consumer: "dist/activate.js", needs: ["payments"] })
  src/activate.ts  src/donate.ts  src/on-payment-succeeded.ts  src/tools.ts
```

## 3. Composition root

The host owns this file. Each `plugin.json` already passes through `defineExecutablePluginContribution` (`agent-plugins/src/lifecycle/contribution-loader.ts:108-125`). The `loader.load` shape is an assumption that L0 must prove; the manifest itself grants no trust (`manifest.ts:10`).

```ts
const providerContribution = defineExecutablePluginContribution<CommerceDescriptor, PaymentProvider>({
  filename: "plugin.json", contribution: "payment providers", parse: parseCommerceDescriptor,
  modulePath: ({ descriptor }) => descriptor.provider,
  validate: ({ exported }) => (isPaymentProvider({ value: exported }) ? exported : "not a PaymentProvider"),
  refusal: ({ plugin, reason }) => `payment provider '${plugin.pluginId}' refused: ${reason}`,
});

export async function composeCommerce(
  required: { kernel: StorageKernel<unknown>; http: HttpClientPort; clock: Clock; ids: IdGenerator;
    credentials: PaymentCredentialsPort; loader: ContributionLoader; approvals: ApprovalTransport;
    grants: TokenStorePort; baseUrl: string },
  optional: { onRefusal?: (r: { reason: string }) => void } = {},
): Promise<CommerceRuntime> {
  const providers = await required.loader.load({ definition: providerContribution }, optional);
  const ledger = createSqlLedger({ kernel: required.kernel });
  const outbox = createOutbox({ ledger, clock: required.clock });
  const payments = createPaymentsKernel({
    ledger, outbox, grants: required.grants, http: required.http, clock: required.clock, ids: required.ids,
    credentials: required.credentials, baseUrl: required.baseUrl,
    registry: createPaymentProviderRegistry({ providers: providers.items }),
  });
  await required.loader.load({ definition: consumerContribution },
    { activate: ({ module }) => module.activate({ payments: payments.port, events: outbox.subscriber }) });
  return { payments, tools: [buildRefundTool({ payments: payments.port, approvals: required.approvals })] };
}
```

## 4. Low-level types and code

```ts
// money/money.ts
export interface Money { readonly minorUnits: number; readonly currency: string } // ISO-4217, UPPERCASE
const EXPONENT: Readonly<Record<string, 0 | 3>> = { JPY: 0, KRW: 0, KWD: 3, BHD: 3 }; // default 2
export const exponentOf = ({ currency }: { currency: string }, _o = {}) => EXPONENT[currency] ?? 2;

// contract/provider.ts
export type Outcome<T> =
  | { kind: "ok"; value: T }
  | { kind: "rejected"; error: PaymentError }   // provably no money moved
  | { kind: "unknown"; error: PaymentError };   // may have moved → reconcile; never "failed" (B4)
export interface RefundEvidence { providerRefundRef: string; correlationId?: string; amount: Money;
  status: "pending" | "succeeded" | "failed" }
export interface PaymentEvidence { providerRef: string; correlationId?: string;
  status: "pending" | "requires_action" | "authorized" | "succeeded" | "failed" | "canceled";
  captured?: Money; refunds: readonly RefundEvidence[]; disputes: readonly DisputeEvidence[] }
export interface WebhookFact { providerEventId: string; providerRef: string; evidence?: PaymentEvidence }
export interface ProviderCapabilities { refunds: "none" | "full" | "partial"; capture: "auto" | "manual";
  void: boolean; disputes: boolean; retrieve: "none" | "payment" | "payment+refunds";
  echoesCorrelation: boolean; confirmation: readonly NextActionKind[]; currencies: readonly string[] | "any" }
export interface PaymentProvider {
  readonly id: string; readonly displayName: string; readonly capabilities: ProviderCapabilities;
  readonly credentialKeys: readonly string[];
  createIntent(r: { req: IntentRequest; ctx: ProviderContext }, o?: { signal?: AbortSignal }): Promise<Outcome<{ evidence: PaymentEvidence; next: NextAction }>>;
  refund?(r: { req: { providerRef: string; amount: Money; idempotencyKey: string; correlationId: string }; ctx: ProviderContext }, o?: { reason?: string }): Promise<Outcome<RefundEvidence>>;
  capture?(r: { req: { providerRef: string; amount: Money; idempotencyKey: string }; ctx: ProviderContext }, o?: object): Promise<Outcome<PaymentEvidence>>;
  void?(r: { req: { providerRef: string; idempotencyKey: string }; ctx: ProviderContext }, o?: object): Promise<Outcome<PaymentEvidence>>;
  retrieve?(r: { providerRef: string; ctx: ProviderContext }, o?: object): Promise<Outcome<PaymentEvidence>>;
  verifyWebhook(r: { rawBody: Buffer; headers: Readonly<Record<string, string>>; ctx: ProviderContext }, o?: object): Promise<Outcome<readonly WebhookFact[]>>;
}

// contract/payments-port.ts (what consumers call)
export interface PaymentsPort {
  createIntent(r: { workspaceId: string; providerId: string; amount: Money; idempotencyKey: string; reference: string },
    o?: { captureMode?: "auto" | "manual"; customer?: Customer }): Promise<IntentResult>;
  refund(r: { workspaceId: string; paymentId: string; amount: Money; idempotencyKey: string; grant: string },
    o?: { reason?: string }): Promise<RefundResult>;
  getPayment(r: { workspaceId: string; paymentId: string }, o?: object): Promise<PaymentView | null>;
  listProviders(r?: object, o?: object): readonly ProviderSummary[];
}

// ledger/rows.ts
type RefundStatus = "reserved" | "unknown" | "pending" | "succeeded" | "failed";
interface PaymentRow { id: string; workspace_id: string; provider_id: string; idempotency_key: string; status: PaymentStatus;
  amount_minor: number; captured_minor: number; refunded_minor: number /* derived cache */; currency: string;
  provider_ref: string | null; reference: string; next_action_json: string | null; version: number; updated_at: number }
interface AttemptRow { id: string; payment_id: string; op: "intent" | "capture" | "void" | "refund"; operation_key: string;
  refund_id: string | null; outcome: "dispatched" | "ok" | "rejected" | "unknown"; error: string | null; updated_at: number }
interface RefundRow { id: string /* = correlationId */; payment_id: string; provider_refund_ref: string | null /* UNIQUE(provider_id,ref) */;
  operation_key: string | null /* UNIQUE(workspace_id,key) */; amount_minor: number; currency: string; status: RefundStatus; updated_at: number }
interface DisputeRow { id: string; payment_id: string; provider_dispute_ref: string /* UNIQUE */; amount_minor: number;
  status: "open" | "won" | "lost"; due_by: number | null }
interface InboxRow { id: string; provider_id: string; provider_event_id: string /* UNIQUE */; workspace_id: string | null;
  facts_json: string; state: "received" | "applied" | "parked" | "dead"; attempts: number; next_attempt_at: number; last_error: string | null }
interface OutboxRow { id: string; workspace_id: string; topic: "payment.succeeded" | "refund.succeeded" | "dispute.opened"; payload_json: string; created_at: number }

// accounting/refund-totals.ts
const RANK: Readonly<Record<RefundStatus, number>> = { reserved: 0, unknown: 1, pending: 2, succeeded: 3, failed: 4 };
export const mergeRefundStatus = ({ current, incoming }: { current: RefundStatus; incoming: RefundStatus }, _o = {}) =>
  (RANK[incoming] > RANK[current] ? incoming : current);   // never moves backward: a stale snapshot cannot regress a row
export function refundTotals({ refunds }: { refunds: readonly RefundRow[] }, _o = {}): { succeeded: number; held: number } {
  let succeeded = 0; let held = 0;
  for (const r of refunds) {
    if (r.status === "succeeded") succeeded += r.amount_minor;
    else if (r.status !== "failed") held += r.amount_minor;
  }
  return { succeeded, held };
}

// accounting/apply-evidence.ts: the ONLY writer of refunds/refunded_minor (ends the :825 vs :458 split)
export async function applyRefundEvidence(
  { tx, payment, evidence }: { tx: LedgerTx; payment: PaymentRow; evidence: RefundEvidence }, _o = {},
): Promise<{ kind: "applied" | "quarantined"; reason?: string }> {
  if (evidence.amount.minorUnits <= 0 || evidence.amount.currency !== payment.currency) return { kind: "quarantined", reason: "bad-amount" };
  const existing = await tx.findRefund({ paymentId: payment.id, ref: evidence.providerRefundRef, correlationId: evidence.correlationId });
  const row = existing
    ? { ...existing, provider_refund_ref: evidence.providerRefundRef, status: mergeRefundStatus({ current: existing.status, incoming: evidence.status }) }
    : newRefundRow({ payment, evidence });
  const others = (await tx.listRefunds({ paymentId: payment.id })).filter((r) => r.id !== row.id);
  const { succeeded } = refundTotals({ refunds: [...others, row] });
  if (succeeded > payment.captured_minor) return { kind: "quarantined", reason: "over-refund" };
  await tx.upsertRefund({ row });
  await tx.updatePayment({ id: payment.id, refunded_minor: succeeded, status: statusAfterRefunds({ payment, succeeded }) });
  if (row.status === "succeeded" && existing?.status !== "succeeded") await tx.enqueue({ topic: "refund.succeeded", row });
  return { kind: "applied" };
}

// ingest: verify → inbox → ack fast; worker applies or parks (fixes the early-event loss at :930/:908)
export async function ingestWebhook({ deps, providerId, rawBody, headers }: IngestInput, _o = {}): Promise<WebhookAck> {
  const provider = deps.registry.get({ id: providerId });
  if (!provider) return nack({ code: "PROVIDER_NOT_REGISTERED" });
  const ctx = await deps.contextFor({ provider, headers });
  if (!ctx) return nack({ code: "NO_CREDENTIALS_CONFIGURED" });
  const verified = await provider.verifyWebhook({ rawBody, headers, ctx });
  if (verified.kind !== "ok") return nack({ code: verified.error.code });
  const stored = await deps.inbox.insertMany({ providerId, facts: verified.value }); // ON CONFLICT DO NOTHING
  deps.worker.nudge({});
  return { accepted: true, received: stored.inserted, duplicates: stored.duplicates };
}
export async function processInboxRow({ deps, row }: { deps: WorkerDeps; row: InboxRow }, _o = {}): Promise<InboxRow["state"]> {
  const fact = parseFact({ row });
  const payment = await deps.ledger.findPaymentByRef({ providerId: row.provider_id, ref: fact.providerRef });
  if (!payment) return deps.inbox.park({ row, reason: "no-payment-yet" });    // backoff → "dead" after N, shown to operator
  const evidence = fact.evidence ?? (await deps.fetchEvidence({ payment }));  // retrieve only when the fact has no ids
  if (!evidence) return deps.inbox.park({ row, reason: "no-evidence" });
  if (await deps.mustWaitForAttempt({ payment, evidence })) return deps.inbox.park({ row, reason: "attempt-in-flight" });
  return deps.ledger.transaction(async (tx) => {
    await applyPaymentEvidence({ tx, payment: await tx.lockPayment({ id: payment.id }), evidence }); // → applyRefundEvidence per refund
    return deps.inbox.markApplied({ tx, row });
  });
}

// tools/payments-refund.ts: createApprovalHandler (core/src/approval.ts:55); no rememberKey, so the approval is never reused
export function buildRefundTool({ payments, approvals }: { payments: PaymentsPort; approvals: ApprovalTransport }, _o = {}): ToolRegistration {
  return {
    descriptor: { name: "payments_refund", sideEffects: "moves-money" /* new member, core/agent-tools.ts:15 */,
      authorization: { permission: "commerce.payments.refund" }, actorClassRule: "user-only", inputSchema: REFUND_SCHEMA },
    policy: MONEY_POLICY,
    handler: createApprovalHandler<PreparedRefund, RefundCard>({
      prepare: ({ ctx }) => prepareRefund({ payments, input: ctx.input, runId: ctx.run.id }), // fixes amount + idempotencyKey
      describe: ({ prepared }) => ({ ask: true, description: refundCard({ prepared }) }),
      askHuman: ({ ctx, description }) => approvals.ask({ ctx, description }),
      run: async ({ prepared, confirmer }) => payments.refund({ ...prepared.request,
        grant: await approvals.mintGrant({ planHash: hashRefundPlan({ request: prepared.request }), confirmerId: confirmer.id }) }),
      notConfirmed: ({ reason }) => ({ refunded: false, reason }),
    }),
  };
}
```

`ops/refund.ts` runs its checks in this order:
1. Look up the idempotency key first (fixes the `:856-863` order).
2. `grants.tryRedeem` (`gated-mutations/token.ts`), after recomputing the plan hash from the request, so a changed amount fails.
3. Reserve under the payment lock, checking against `captured − succeeded − held`.
4. Dispatch the provider call with `correlationId = refund.id`.
5. Settle: `ok` → `applyRefundEvidence`, `rejected` → `failed`, `unknown` → `unknown` plus a reconcile job.

## 5. Worked flow: an agent refunds $30 of a $100 payment

1. The agent calls `payments_refund{pay_1, 3000 USD}`. `prepare` finds 10000 refundable and fixes the idempotency key k1.
2. The approval card reads "Refund $30.00 of $100.00 · pay_1". The human approves, and a grant bound to (pay_1, 3000, USD, k1) is minted.
3. The kernel finds no replay and redeems the grant. Under the lock it creates row r1 as `reserved` (3000 held) and an attempt marked `dispatched`. It calls `provider.refund(correlationId=r1)`.
4. **The webhook arrives first.** It is verified and stored in the inbox. The worker sees `{re_9, 3000, succeeded, correlationId r1}` and matches r1 by correlation id. The status merge gives `succeeded`, the sum is 3000, the payment becomes `partially_refunded`, and the outbox gets `refund.succeeded`.
5. **The response arrives.** Its `{re_9, 3000, succeeded}` matches r1 by ref. The merge leaves it `succeeded`, the sum stays **3000**, and nothing new goes to the outbox.
6. **Repeats:** a redelivered event is deduped by `provider_event_id`. A second event type for the same refund matches the same ref and merges with no effect. A timeout leaves r1 `unknown` (still held), and a later webhook or `retrieve` merges it to `succeeded`.
7. **A provider that cannot echo the correlation id:** its webhook parks as `attempt-in-flight` until the attempt settles, then matches by ref.

## 6. Open disagreements and the cheapest test for each

- **Vs Codex, contract size.** My minimal contract has optional capture and void, and no version negotiation. Test: build L0 sandbox adapters for Stripe and PayPal authorize-then-capture against it. Grow the contract only if one of them fails.
- **Vs Sonnet and Gemini, correlation.** I require an echoed correlation id, or else parking. Test: a PayPal sandbox refund with `custom_id` or `invoice_id`, checking whether the webhook echoes it.
- **Vs Gemini, a won dispute reverting the payment to `succeeded`.** I side with Codex. Test: a property test where winning a dispute after a partial refund keeps the refunded total.
- **Refund status ordering (`failed` outranks `succeeded`).** Test: a Stripe test-mode refund failure. Does the refund ever go from succeeded to failed?
- **Tax and shipping defaults.** I side with Codex: only explicit exemptions; a missing port blocks checkout. Test: a physical item with no `ShippingPort` returns a typed error.
- **Contribution loading** (I agree with Sonnet and Codex that it is unproven). Test: load a fake provider plugin through `createPluginContributionLoader` in the existing lifecycle tests.

<<SWARM_END>>