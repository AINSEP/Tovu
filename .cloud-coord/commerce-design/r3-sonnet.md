ACK_PACKET_RECEIVED CTX-commerce-debate-2026-10-21-R3 -- I received the packet and will work on it.

I read `agent-plugins/src/lifecycle/contribution-loader.ts:85-150` for the registration seam and ran nothing. Other file:line claims are from the evidence in the packet, and I did not re-verify them. This round I adopt Gemini's hybrid: a resource-keyed ledger, with `retrieve` used only to reconcile. I also take Codex's durable operation record with an `unknown` outcome.

**1. Picture (arrows point from dependent to dependency)**
```
 host (Tovu)  ──composes──►  @jini-ai/commerce ◄── @jini-ai/agent-plugins (loader)
   │ reads plugin manifests, validates export, calls registry.register(provider)
   ▼
 plugin-payments-stripe ──types only──► @jini-ai/commerce/contracts
 plugin-payments-paypal ──types only──►        (same)
 plugin-payments-lipay  ──types only──►        (same)
 plugin-donations / plugin-shopify-import ──types only──► commerce/contracts
        (receive PaymentsPort + OrderPort injected by host; never import a provider or each other)
 commerce/tools ──► commerce services + core approval;  commerce/react ──props only──► HTTP read models
```
`contracts` is a zero-runtime subpath. Plugins depend on it for types and never on each other.

**2. File tree**
```
packages/commerce/src/
  contracts/   money.ts  provider.ts  payments-port.ts  orders-port.ts  events.ts   (keep ports.ts; split + extend)
  payments/    ledger.rows.ts  repo.ts  refunds.ts  apply-event.ts  operations.ts
               reconcile.ts  inbox.ts  outbox.ts  state-machine.ts(keep)  registry.ts(keep)
               credentials.ts(keep)  service.ts   (all new, split out of lipay-plugin.ts: rewrite)
  catalog/     keep storefront.ts status.ts; rewrite checkout.ts types.ts (Money, uppercase ISO)
               delete webhook-inbox.ts (duplicate inbox)
  http/        payments-webhook.ts (keep, add per-workspace route)
  tools/       refund-tool.ts  read-tools.ts  approval-binding.ts   (tools.ts rewritten)
  react/       props-only read models (keep)
  store/       delete store-plugin.ts (spike)
plugin-payments-stripe/  manifest.json  src/provider.ts  src/webhook.ts  src/map.ts  src/__tests__/ (conformance kit)
plugin-donations/        manifest.json  src/donate.ts  src/on-payment.ts   (uses injected PaymentsPort)
```
`lipay-gateway.ts` moves to `plugin-payments-lipay`. `lipay-plugin.ts` is deleted after the split.

**3. Composition root.** The loader already provides what registration needs: `defineExecutablePluginContribution` parses the manifest, imports the plugin module, runs `validate`, and returns `{pluginId, module}` or a refusal (`contribution-loader.ts:108-148`). The host defines a `payment-provider` contribution; the core never imports plugin code.
```ts
export const paymentProviderContribution = defineExecutablePluginContribution<{ module: string }, PaymentProviderFactory>({
  filename: "payment-provider.json", contribution: "payment-provider",
  parse: parseDescriptor, modulePath: ({ descriptor }) => descriptor.module,
  validate: ({ exported }) => isProviderFactory(exported) ? exported : "export is not a PaymentProviderFactory",
  refusal: ({ plugin, reason }) => `${plugin.pluginId}: ${reason}`,
});

export async function composeCommerce(required: { host: HostPorts }, optional: { clock?: Clock } = {}) {
  const { host } = required;
  const registry = createPaymentProviderRegistry({ providers: [] });
  const loaded = await host.loadPluginContributions({ definition: paymentProviderContribution });
  for (const item of loaded.items) {
    registry.register({ provider: item.module({ httpClient: host.httpClient, pluginId: item.pluginId }) });
  }
  const repo = createLedgerRepo({ kernel: host.kernel });
  const payments = createPaymentsService({ repo, registry, credentials: host.credentials,
    clock: optional.clock ?? host.clock, idGen: host.idGen, outbox: createOutbox({ repo }) });
  return { payments, tools: buildCommerceTools({ payments, approvals: host.approvals }), loaded };
}
// consumer plugin: factory receives ports, no import of commerce internals
export const activate = ({ payments }: { payments: PaymentsPort }) => ({ donate: (r: DonateReq) => payments.createPayment(...) });
```
Trust and revocation are a host decision, taken before `register` (Codex's point). That proof is Lot 0.

**4. Low level**
```ts
export interface Money { readonly minorUnits: number; readonly currency: string }  // uppercase ISO, exponent table in money.ts
export type OpResult<T> = { outcome: "ok"; value: T } | { outcome: "rejected"; error: PaymentError } | { outcome: "unknown"; error: PaymentError };

export interface PaymentProvider {
  readonly id: string; readonly capabilities: PaymentProviderCapabilities; readonly credentialKeys: readonly string[];
  createIntent(r: IntentRequest, o?: CallOpts): Promise<OpResult<{ providerRef: string; next: ChargeNextAction; status: "succeeded" | "pending" | "requires_action" }>>;
  refund?(r: { providerRef: string; amount: Money; operationId: string; idempotencyKey: string }, o?: CallOpts): Promise<OpResult<{ providerRefundRef: string; status: RefundWire }>>;
  retrieve?(r: { providerRef: string }, o?: CallOpts): Promise<OpResult<PaymentSnapshot>>;   // optional: reconcile only
  parseWebhook(r: ProviderWebhookInput, o?: CallOpts): Promise<OpResult<readonly ProviderEvent[]>>;
}
export type ProviderEvent =
  | { kind: "payment"; providerEventId: string; providerRef: string; status: "succeeded" | "failed" | "expired" }
  | { kind: "refund"; providerEventId: string; providerRef: string; providerRefundRef: string; amount: Money; status: RefundWire }
  | { kind: "dispute"; providerEventId: string; providerRef: string; providerDisputeRef: string; state: "open" | "won" | "lost" };

export interface PaymentsPort {   // all a consumer sees
  createPayment(r: { workspaceId: string; amount: Money; providerId: string; reference: string; idempotencyKey: string }, o?: { customer?: Customer }): Promise<PaymentResult>;
  getPayment(r: { workspaceId: string; id: string }, o?: {}): Promise<PaymentRecord | null>;
  requestRefund(r: { workspaceId: string; paymentId: string; amount: Money; idempotencyKey: string }, o?: { reason?: string }): Promise<RefundRequestResult>;
}
// rows (workspace_id on every row)
interface PaymentRow { id; workspace_id; provider_id; provider_ref: string | null; amount_minor; currency; status; amount_refunded_minor; next_action_json: string | null }
interface AttemptRow { id; payment_id; operation_id; kind: "charge" | "refund"; fingerprint; state: "dispatched" | "ok" | "rejected" | "unknown"; created_at }
interface RefundRow { id; payment_id; provider_refund_ref: string | null; operation_id: string | null; amount_minor; state: "reserved" | "pending" | "succeeded" | "failed" | "unknown" }  // UNIQUE(provider_id, provider_refund_ref), UNIQUE(workspace_id, idempotency_key)
interface DisputeRow { id; payment_id; provider_dispute_ref; state: "open" | "won" | "lost" }
interface InboxRow { id; provider_id; provider_event_id; payload; state: "received" | "applied" | "parked" | "dead"; attempts; next_try_at }
interface OutboxRow { id; topic; payload; cursor_seq; delivered_at: number | null }
```
Refund accounting (pure; the two writers collapse to one):
```ts
export function refundTotals(required: { refunds: readonly RefundRow[] }, _o: Record<string, never> = {}) {
  let succeeded = 0, held = 0;
  for (const r of required.refunds) {
    if (r.state === "succeeded") succeeded += r.amount_minor;
    else if (r.state === "reserved" || r.state === "pending" || r.state === "unknown") held += r.amount_minor;
  }
  return { succeeded, held };   // refundable = payment.amount_minor - succeeded - held
}
export function mergeRefundEvidence(required: { rows: readonly RefundRow[]; ev: RefundEvent }, _o = {}): RefundRow[] {
  if (!(required.ev.amount.minorUnits > 0)) throw new RejectEvidence("non-positive");
  const hit = required.rows.find(r => r.provider_refund_ref === required.ev.providerRefundRef);
  const adopt = hit ?? required.rows.find(r => r.operation_id === required.ev.operationId && r.provider_refund_ref === null);
  return adopt ? replaceRow(required.rows, adopt, { ...adopt, provider_refund_ref: required.ev.providerRefundRef, state: required.ev.status })
               : [...required.rows, newRow(required.ev)];
}
```
The webhook ingest path:
```ts
export async function ingestWebhook(r: { providerId: string; workspaceId: string; rawBody: Buffer; headers: Headers }, o: { deps: Deps }) {
  const parsed = await o.deps.provider(r.providerId).parseWebhook(...);          // verify signature + freshness
  if (parsed.outcome !== "ok") return reject(parsed);
  for (const ev of parsed.value) await o.deps.inbox.enqueue({ ev, workspaceId: r.workspaceId });   // UNIQUE(provider,event_id); durable before ack
  return { accepted: true };
}
export async function drainInbox(r: { limit: number }, o: { deps: Deps }) {   // worker; also called inline after enqueue
  for (const row of await o.deps.inbox.due(r)) {
    const out = await applyEvent({ row }, o);                                  // locked payment, mergeRefundEvidence, derive totals/status, outbox, one tx
    await o.deps.inbox.mark({ row, out });   // "applied" | "parked" (payment unknown/state not ready; retried on payment change or TTL) | "dead"
  }
}
```
The money-moving tool with its approval binding:
```ts
export function refundTool(required: { payments: PaymentsPort; approvals: ApprovalService }, _o = {}): ToolRegistration {
  return { name: "payments_refund", sideEffects: "moves-money",
    handler: async (ctx, a: { paymentId: string; amountMinor: number; currency: string }) => {
      const plan = { workspaceId: ctx.workspaceId, paymentId: a.paymentId, amount: { minorUnits: a.amountMinor, currency: a.currency }, key: ctx.callId };
      const token = await required.approvals.request({ planHash: hashPlan(plan), display: describe(plan), remember: false });
      if (!token.approved) return { status: "declined" };
      return required.payments.requestRefund({ ...plan, paymentId: plan.paymentId, idempotencyKey: plan.key }, {});
    } };
}
```
The approval covers the plan hash (payment, amount, currency, key). Any changed amount fails the hash check.

**5. Worked flow (refund 300 of 1000)**
1. The agent calls `payments_refund`. The human sees "refund 3.00 USD on payment P" and approves, which yields a token bound to the plan hash.
2. `requestRefund` locks P and replays by key before validation (fixing `lipay-plugin.ts:856-863`). It inserts a `RefundRow(reserved, op=X)` and an `AttemptRow(dispatched)`, and commits.
3. The provider call goes out with `operationId=X` and the stable key.
4. The webhook echo arrives before the response. `parseWebhook` yields `{providerRefundRef: R1, amount: 300, status: succeeded}`. The inbox enqueues it, and `applyEvent` finds no row with `R1`, so it adopts the `reserved` row via `operation_id` (or the provider's reference echoing X). The row becomes `R1/succeeded`, the total is 300, and the outbox gets `refund.succeeded`.
5. The response arrives with `providerRefundRef=R1`. The row already has `R1`, so nothing is added.
6. If the call timed out: the attempt is `unknown`, the reservation is kept, and the reconciler resolves it through `retrieve`.
7. The total is derived, never `+=`.

**6. Open disagreements and cheapest settling tests**
- **Opus on mandatory `retrieve`:** I hold it optional. Test: PayPal sandbox, one refund plus a replay, check whether a single GET returns refund ref, amount and status without N+1 calls.
- **Gemini on `SUM(succeeded)` alone:** I hold that reserved, pending and unknown amounts must count as held (refundable = total minus succeeded minus held). Test: pending refund never confirmed, then a second refund request for the full balance should be refused.
- **Codex on nine operations and version negotiation in v1:** too much; I keep `createIntent`, `refund`, `parseWebhook`, and optional `retrieve`. `capture` and `void` are v1.1. Test: does any v1 consumer (donations, downloads) need manual capture?
- **Zero-tax defaults** (Codex vs Gemini): I side with Codex, fail closed unless the checkout is explicitly marked exempt. Test: checkout for a taxable item with no `TaxPort` must refuse.
- **Dispute modeling:** I side with Codex, keep disputes as a separate dimension and never roll back refunds. Test: refund, then dispute won, assert refunded total unchanged.

<<SWARM_END>>

---

ACK_PACKET_RECEIVED CTX-commerce-debate-2026-10-21-R3 -- addendum on `@jini-ai/capability-providers`.

I read `capability-providers/src/payments.ts`, `src/tokens.ts:1-14` and `src/adapters/stripe/index.ts:1-60` plus a grep of that file. I did not run anything.

**What it is.** It is a one-shot, throwing, charge-only port. Its limits:
- `ChargeInput` has `amountCents`, `currency` and `customerRef`, and no idempotency key, no reference, no `next` action (3DS or redirect), and no webhooks. This is the same `*Cents` naming problem the catalog has.
- `refund({id})` is full-only, so there are no partial refunds and no refund identity.
- `ChargeStatus` is `pending | succeeded | failed | refunded`, with no partially-refunded or disputed state, and no unknown outcome.
- The Stripe adapter calls the Charges and Refunds REST endpoints, which is the legacy API. Today's flows (PaymentIntents, SCA) are not covered.
- Failures throw `StripePaymentsProviderError`, which breaks the commerce rule that provider methods never throw.
- It uses raw `fetchFn` with a `globalThis.fetch` default (`:51`), not the guarded `HttpClientPort` seam, so it bypasses the ADR-038 outbound guard.
- The key is passed in the constructor. That is acceptable for an adapter, but it bypasses the credentials port and per-workspace resolution.
- `packages/commerce` does not reference it (grep over the sibling packages shows only capability-providers itself).

**Relation: do not reuse the contract; keep the pattern, deprecate the payments slice.**
- **Replace.** `PaymentsProvider` cannot carry the ledger's needs, so commerce's `PaymentProvider` stays the contract. I do not recommend widening `PaymentsProvider` into it. It is a generic charge-port for apps that want "just charge a card", and that use case is legitimate and different.
- **Deprecate, then absorb.** Mark `PaymentsProviderToken` and `adapters/stripe` deprecated in the capability-providers changelog, and publish a thin bridge: `PaymentsProvider` implemented on top of commerce's `PaymentsPort` (`charge` becomes `createPayment`, full `refund` becomes `requestRefund` for the remaining balance). Existing consumers keep working, and they gain the ledger. The Stripe plugin is then written once, in `plugin-payments-stripe`, against PaymentIntents.
- **Reuse the Stripe knowledge.** The adapter's request shape, form-encoded body, Basic auth and error-envelope parsing (`index.ts:1-20`) are verified against Stripe docs, so lift them into the plugin as test fixtures rather than rewrite from memory. Its `refunded` flag handling (`index.ts:56+`) is the same partial-refund trap discussed above (`refunded:true` wins), so it must not be ported as is.
- **Reuse the DI tokens.** `token<T>({ id })` from core (`tokens.ts:5-14`) is already the host's wiring idiom, so commerce should expose tokens for its own ports in the same style rather than ad hoc composition:
```ts
export const PaymentsPortToken = token<PaymentsPort>({ id: 'jini.commerce.payments' });
export const PaymentProviderRegistryToken = token<PaymentProviderRegistry>({ id: 'jini.commerce.providerRegistry' });
export const CommerceEventsToken = token<CommerceEvents>({ id: 'jini.commerce.events' });
// composeCommerce binds these; consumer plugins resolve PaymentsPortToken, nothing else
host.bind({ token: PaymentsPortToken, value: commerce.payments });
```
A consumer plugin asks the host for `PaymentsPortToken` and never imports commerce internals or a provider. Per `tokens.ts:1-2` hosts bind each port in their own composition, so this changes nothing about who owns wiring.

**Open points.**
- **Bridge direction.** capability-providers must not depend on commerce, since both are packages and the dependency would invert the layering. The bridge lives in commerce (`commerce/compat/capability-payments.ts`), implementing `PaymentsProvider` structurally.
- **Cheapest test.** A contract test that runs capability-providers' existing Stripe adapter tests (`adapters/stripe/__tests__`) against the bridge with a fake `PaymentsPort`, which shows whether the old surface is preserved.
- **Who uses it.** I did not search outside jini-int, so I cannot say whether Tovu or other apps depend on `PaymentsProviderToken`. That decides how long the deprecation window must be.

<<SWARM_END>>