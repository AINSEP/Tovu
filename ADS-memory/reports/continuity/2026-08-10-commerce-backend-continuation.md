# Commerce Backend Continuation — Provider-Neutral Operational Status

- Date: 2026-08-10
- Status: Implemented bounded read-only slice
- Architecture: ADR-001, ADR-006, ADR-009; `tovu-architecture.md` §§13–14
- Scope: Commerce status contracts, pure read model, authenticated admin route, focused tests
- Explicitly excluded: provider SDKs, secrets, money movement, Plugins, AgentPlugins, Jini Chat/UI,
  Commerce UI changes, fabricated metrics

## Input and graph evidence

- Codebase Memory capability validator: enabled; binary
  `/Users/la/.local/bin/codebase-memory-mcp`, version `0.9.0`.
- Graphify capability validator: enabled; binary `/Users/la/.local/bin/graphify`, version `0.8.50`.
- Codebase Memory indexes refreshed in fast mode:
  - Tovu: 35,028 nodes / 55,887 edges at discovery time.
  - Jini: 35,134 nodes / 69,519 edges at discovery time.
- Tovu graph paths:
  - `RouteDeps.lipay` is the only existing host payment-runtime seam.
  - `createPaymentProviderRegistry → activateLipay → bootstrapLipay` owns provider registration.
  - `registerPaymentsWebhookRoute → LipayApi.handleWebhook` owns the existing raw-body webhook path.
  - `registerAdminConnectorsStatusesRoute → createConnectorsModule → createApp` supplied the
    workspace/auth/status-route precedent.
- Tovu Graphify was refreshed under
  `AI-Dev-Shop/ADS-memory/reports/graphify-out/Tovu-c00bde99`. Its freshness check remained stale
  because concurrent agents continued changing source after extraction; source validation governs.
  Its Commerce query found only the existing admin `Payments.tsx` community and no Commerce backend
  module.
- Open SaaS Graphify query over its existing `graphify-out/graph.json` traversed the payment
  processor, Stripe/Lemon Squeezy/Polar processor adapters, pricing page, plans and processor-plan
  mapping, account portal, provider webhooks, subscription update functions, and revenue cards as
  one connected capability journey. CBM supplied the exact symbols/line locations listed below.
- Jini Codebase Memory found `PaymentsProvider` and `StripePaymentsProvider`; inbound tracing found
  no runtime consumer of `StripePaymentsProvider`. Source confirms the package calls this port
  speculative and the Stripe adapter performs real charge/refund HTTP calls, so neither was wired
  into this read-only slice.
- A bounded Jini Graphify refresh was stopped at 10% of 7,316 uncached files because it exceeded the
  discovery budget. Its partial output directory was removed; conclusions use the fresh Jini CBM
  index plus source.

## Open SaaS concepts reused

- `template/app/src/payment/paymentProcessor.ts` groups checkout-session creation, customer-portal
  lookup, webhook handling, and total-revenue fetching behind one selected processor.
- `template/app/src/payment/{stripe,lemonSqueezy,polar}/paymentProcessor.ts` demonstrates that the
  same user journey can sit over different vendors, but each implementation remains vendor/API
  coupled and the root processor selection is not a runtime multi-provider registry.
- `template/app/src/payment/operations.ts` supplies the checkout and customer-portal orchestration;
  `plans.ts`/`paymentProcessorPlans.ts` map product plans to provider plan IDs.
- Provider webhooks update subscription state, while
  `admin/dashboards/analytics/TotalRevenueCard.tsx` renders processor-sourced revenue.
- Adaptation decision: port the understandable capability/status journey and open-provider summary,
  not the provider-coupled backend methods. Checkout, portal/account state, subscriptions, webhook
  reconciliation, and revenue each require their own Tovu contract and authoritative data owner.

## Source-validated architecture facts

- `src/features/plugins/lipay/ports.ts` already defines an open provider identifier and typed
  capability object. The new Commerce contract mirrors only the safe summary fields and does not
  import the Plugin module.
- `src/features/plugins/lipay/lipay-plugin.ts` exposes `listProviders`, charge/refund, webhook, and
  payment reads through `LipayApi`. Only `listProviders` structurally satisfies the new narrow
  Commerce read port.
- `src/server/routes/types.ts` makes `lipay` optional. Source search found no production
  `bootstrapLipay` composition call, so the default and SQLite compositions honestly report the
  payment runtime as unavailable today.
- The existing payment runtime does not expose credential slots or safe configuration field
  metadata through `LipayApi`. The Commerce response therefore returns `configuration.schema: null`
  instead of inspecting environment variables or leaking Plugin/provider details.
- ADR-006 permits this port because two implementations exist in the current slice: the null
  fallback and the structurally compatible optional payment runtime. The port has one read method
  and cannot reach charge/refund/webhook/credential operations.

## Implemented now

- `CommercePaymentRuntimePort`: provider-neutral, read-only `listProviders()` boundary.
- `readCommerceStatus()`: detached response snapshot with open provider IDs and typed declared
  capabilities. Both provider and capability objects are copied through an explicit allowlist, so
  future adapter-private fields cannot leak into the HTTP response through structural typing.
- Null fallback: reports `paymentRuntime.status = "unavailable"` with no providers.
- Runtime-present behavior: reports provider discovery as available and copies only provider
  declarations.
- Configuration schema, checkout, subscriptions, webhook reconciliation, and revenue remain
  explicitly `"unavailable"` in both states.
- `GET /api/admin/v1/workspaces/:workspaceId/commerce/status`:
  - authenticated by the existing `/api/admin` session middleware;
  - returns 404 for a non-composed workspace;
  - requires `admin.integrations.manage` with `entityType: "integration"`;
  - returns 403 with the established error contract on denial;
  - performs no writes, provider calls, payment reads, webhook processing, or secret reads.

## Next adapter boundaries and follow-on slices

1. **Provider configuration schema/status** — define a host-owned configuration read/write contract
   only alongside a real adapter. Return public field metadata and opaque sealed-secret references;
   never secret values. Extend the runtime summary rather than importing provider SDK types into
   Commerce core.
2. **Checkout** — define the first ADR-001 OperationRegistry operation with `plan()` + `execute()`,
   idempotency, plan hash, receipt, and an injected payment-intent adapter. A LiPay or Jini bridge is
   an adapter decision after contract reconciliation; neither current charge API is silently adopted.
3. **Subscriptions** — add product/price/plan and subscription lifecycle aggregates/repositories
   before enabling recurring provider affordances. Provider `recurring: true` is capability data,
   not an account/subscription lifecycle.
4. **Webhook reconciliation** — preserve the existing provider signature/idempotency boundary, then
   publish normalized accepted events through the outbox to an idempotent Commerce reconciler. Do
   not let provider callbacks mutate orders or subscriptions directly.
5. **Orders** — establish a Commerce-owned order aggregate and repository before correlating payment
   records. LiPay intentionally owns payments, not orders.
6. **Revenue** — build an async projection from authoritative Commerce order/payment events. Do not
   copy Open SaaS's provider-level `fetchTotalRevenue()` into core and do not show totals until the
   projection contract and reconciliation rules are approved.
7. **Account status/customer portal** — define a provider-neutral account/subscription status read
   model and a portal-session adapter only after tenant-scoped customer identity mapping exists.

## Verification

- Focused Commerce tests: 7/7 pass.
- Expanded Commerce + existing payment webhook + server-module tests: 17/17 pass.
- Root typecheck, including E2E typecheck: pass.
- Root production build: pass.
- Focused Biome: pass.
- Focused ESLint/complexity: pass.
- Dependency-cruiser: 0 errors; 49 existing warnings, none in Commerce.
- Architecture ratchet: warning, not baseline-updated. The intentional new `features/commerce`
  public surface increases exposed API files by one (220 → 221). The reported SCC growth 33 → 34
  does not contain `features/commerce` and comes from concurrent source state; masking it by updating
  the baseline was intentionally avoided.
- Node coverage for `src/features/commerce/status.ts`: 100% lines, 88.89% V8 branches, 100%
  functions, no uncovered lines. Both semantic runtime states and both currency declaration shapes
  are directly tested. Raw `NODE_V8_COVERAGE` shows every `readCommerceStatus`/`copyProvider` block
  executed; the only zero-count ranges belong to tsx-generated `__copyProps`/module wrapper code.
  The repository-wide default 98% branch profile is therefore not met by native V8 accounting, and
  the compiler/generated-code exception still requires human approval; none was self-approved.

## Risks and handoff

- The new API is not yet consumed by the Commerce UI, by explicit scope instruction.
- The API reports runtime composition and provider declarations only; it is not a health probe for a
  provider account or proof that credentials work.
- No telemetry framework was added for this pure in-process read. Existing HTTP/session middleware
  remains the owning request-observability boundary.
- Suggested next assignee: System Design + TDD for provider-configuration contract/schema, followed
  by a provider-adapter Programmer only after that contract is approved.
