Codex(Peer Review): I adopt Gemini’s reconcile-on-ambiguity and Sonnet’s durable inbox retries. Opus’s single accounting writer remains essential; retrieval is an evidence source feeding that writer. This is a proposed architecture, not implemented or tested code.

**1. High-level picture**

Arrows mean “depends on”; plugins never import another plugin.

```text
Host composition → plugin system → dynamically loaded entrypoints
Host composition → commerce factory + infrastructure adapters
Stripe / PayPal / LiPay plugins → commerce/provider contracts
Donations / Shopify importer plugins → commerce/consumer contracts
commerce services → injected repository, registry, clock, outbox,
                    approval service and reconciliation ports
Provider adapters → injected HTTP + scoped credentials
Generic payments agent tools → PaymentsPort + approval requests
Host admin container → PaymentsPort
Admin React components → props only

Tovu → host integration ports; commerce stays outside Tovu core.
```

**2. Target files**

`K` keep responsibility; `R` rewrite; `M` move; `D` remove after migration.

```text
packages/commerce/
  src/index.ts
  src/money.ts                         R: shared currency/exponent rules
  src/payments/
    ports.ts                           R
    provider.ts                        R: vendor-neutral contract
    registry.ts                        K: host-controlled registrations
    credentials.ts                     K: scoped credential port
    rows.ts
    repository.ts
    service.ts
    operations.ts
    refund-accounting.ts
    evidence.ts
    webhook-ingest.ts
    inbox-worker.ts
    reconciler.ts
    outbox-worker.ts
    state-machine.ts                   R: independent dimensions
    migrations/001-ledger.sql
    testing/fakes.ts
    testing/provider-conformance.ts
    __tests__/<one test file per module>.test.ts
  src/http/payments-webhook.ts          K: raw-body transport
  src/tools/refund.ts                   R
  src/react/Payments.tsx                R: props only
  src/catalog/{types,checkout}.ts       R: shared Money
  src/catalog/storefront.ts             K
  src/catalog/webhook-inbox.ts          D
  src/store/store-plugin.ts            D
  src/payments/lipay-plugin.ts          D: replaced by kernel modules

plugins/plugin-payments-stripe/
  plugin.json
  src/{entry,adapter,mapping,verify-webhook}.ts
  src/__tests__/{adapter,mapping,verify-webhook}.test.ts
  fixtures/refunds.json

plugins/plugin-donations/
  plugin.json
  src/{entry,service,tools}.ts
  src/react/DonationForm.tsx
  src/__tests__/{service,tools}.test.ts
```

Move `payments/providers/lipay-gateway.ts` into the corresponding LiPay plugin; rewrite its ambiguous refund mapping. Preserve useful tests while replacing obsolete assertions. Every production file requires 100% coverage with fakes; every function complexity ≤10.

**3. Composition and registration**

Proposed extension API; existing plugin-system support still needs proof.

```ts
function compose(r: HostDependencies, o = {}) {
  const registry = makeRegistry({ trust: r.trust });
  const payments = makePayments({
    repo: makeRepository({ db: r.db }),
    clock: r.clock, registry, outbox: r.outbox,
    approvals: r.approvals
  });
  r.plugins.provide({ key: "commerce.payments", value: payments });
  r.plugins.extension({
    key: "commerce.providers",
    activate: async (x: ProviderContribution, o = {}) => {
      await r.trust.authorize({ plugin: x.plugin, scope: x.scope });
      return registry.register({
        scope: x.scope,
        provider: x.build({
          http: r.http,
          credentials: r.credentials.scoped({ scope: x.scope })
        })
      }); // returns disposer; dispatch also checks current revocation
    }
  });
  return payments;
}

// Stripe entrypoint: host discovers this through its manifest.
function activateStripe(r: PluginContext, o = {}) {
  return r.contribute({
    key: "commerce.providers", build: makeStripe
  });
}

function activateDonations(r: PluginContext, o = {}) {
  return makeDonations({
    payments: r.require<PaymentsPort>({ key: "commerce.payments" })
  });
}
```

**4. Contracts and kernel**

Interface options are optional; implementations use `(requiredObj, optionalObj = {})`.

```ts
type Money = Readonly<{ minor: bigint; currency: string }>;
// Construct through validated ISO currency/exponent metadata;
// uppercase canonical currency; encode bigint as decimal strings at transport.

type Scope = {
  tenant: string; provider: string; account: string;
};
type State = "pending" | "succeeded" | "failed" | "unknown";
type Outcome<T> =
  | { outcome: "accepted"; value: T }
  | { outcome: "rejected"; code: string }
  | { outcome: "unknown"; correlation: string };
type Call = {
  scope: Scope; operationId: string; key: string; fingerprint: string;
};
type Options = { signal?: AbortSignal };

interface PaymentProvider {
  capabilities: {
    refund: boolean; webhook: boolean; lookup: boolean;
    recoverByKey: boolean;
  };
  create(r: Call & { amount: Money }, o?: Options):
    Promise<Outcome<PaymentEvidence>>;
  refund(r: Call & { paymentRef: string; amount: Money }, o?: Options):
    Promise<Outcome<RefundEvidence>>;
  verify(r: { raw: Uint8Array; headers: Headers }, o?: Options):
    Promise<VerifiedDelivery>;
  lookup?(r: { scope: Scope; ref: string; cursor?: string }, o?: Options):
    Promise<EvidencePage>;
  recover?(r: Call, o?: Options): Promise<Outcome<Evidence>>;
}
type EvidencePage = {
  items: Evidence[]; next?: string; complete: boolean;
};
// Evidence includes scoped resource identity, amount, state,
// correlation when available, and provider-specific ordering evidence.
// Missing resources never imply deletion; unorderable conflicts reconcile.

interface PaymentsPort {
  create(r: { tenant: string; key: string; amount: Money }, o?: Options):
    Promise<Operation>;
  refund(r: RefundCommand & { approval: string }, o?: Options):
    Promise<Operation>;
  get(r: { tenant: string; paymentId: string }, o?: Options):
    Promise<PaymentRow>;
}
type RefundCommand = {
  tenant: string; paymentId: string; amount: Money;
  key: string; actor: string;
};

type Base = { id: string; scope: Scope };
type PaymentRow = Base & {
  ref?: string; captured: Money; settlement: State;
};
type AttemptRow = Base & {
  paymentId: string; kind: "create" | "refund"; key: string;
  fingerprint: string; state: State; reserved: Money;
  providerRef?: string;
};
type RefundRow = Base & {
  paymentId: string; ref: string; operationId?: string;
  amount: Money; state: State;
};
type DisputeRow = Base & {
  paymentId: string; ref: string; amount: Money;
  state: "open" | "won" | "lost";
};
type InboxRow = Base & {
  eventRef: string; payload: Uint8Array;
  state: "ready" | "retry" | "applied" | "quarantined";
  attempts: number; nextAt: number;
};
type OutboxRow = Base & {
  aggregateId: string; revision: bigint;
  payload: string; deliveredAt?: number;
};

function refundedTotal(r: { rows: readonly RefundRow[] }, o = {}) {
  return r.rows.reduce(
    (sum, row) => sum + (row.state === "succeeded" ? row.amount.minor : 0n),
    0n
  );
}

async function ingest(r: IngestDependencies & RawDelivery, o = {}) {
  const verified = await r.provider.verify(r);
  await r.inbox.insertVerified({ verified }); // durable scoped unique key
  return { status: 200 }; // duplicate remains eligible for worker retry
}

async function applyInbox(r: WorkerDependencies & { id: string }, o = {}) {
  const delivery = await r.inbox.claim(r);
  try {
    const evidence = await r.resolve({ delivery });
    await r.writer.apply({ delivery, evidence });
  } catch (error) {
    await r.inbox.deferOrQuarantine({ delivery, error });
  }
}

async function refundTool(r: ToolDependencies & RefundCommand, o = {}) {
  const proposal = await r.approvals.request({
    action: "payments.refund", command: r.command,
    binding: r.canonicalFingerprint({ command: r.command }),
    expiresAt: r.clock.now() + 300_000
  });
  return { approvalRequestId: proposal.id };
}
```

The shared writer transaction locks the payment; validates scope, currency, positive amounts and evidence precedence; merges scoped refund identity; correlates reservations; derives totals; and commits inbox disposition plus outbox together. Over-refund evidence is quarantined, never silently capped.

Refund execution authenticates first, replays matching operations before balance validation, then atomically consumes the approval and reserves capacity. Approval binds actor, tenant, payment, amount, currency, provider/account, key and fingerprint. Unknown attempts retain reservations. Uncorrelated webhook refunds conservatively retain existing reservations until reconciliation.

**5. Worked flow**

1. Agent proposes refund 30 of 100; human approves the exact binding.
2. Execution persists operation/reservation before calling the provider with its stable key.
3. Webhook arrives first: writer inserts refund `R`, succeeded for 30, correlates the operation and releases its reservation.
4. Response reports `R`; the same writer merges the existing row.
5. Derived refunded total remains 30. Duplicate event IDs or different events referencing `R` add nothing. Missing correlation retains capacity conservatively.

**6. Remaining disagreements**

- **Opus:** mandatory retrieval remains unjustified. Cheapest test: stale, paginated retrieval following two refund events; assert no regression or undercount.
- **Sonnet:** aging an operation into unknown must not release its reservation. Test timeout, sweep, second refund, then late success.
- **Gemini:** explicit tax/shipping non-applicability is agreement. Any remaining implicit-default proposal is settled by testing that taxable checkout without its required port fails.

Next: host-registration proof and deterministic race/crash fixtures, then kernel implementation.

<<SWARM_END>>