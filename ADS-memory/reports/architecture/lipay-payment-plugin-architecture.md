# Lipay Payment Plugin — Architecture Recommendation

- **Agent:** Software Architect (Agent Direct Mode), AI Dev Shop framework
- **Date:** 2026-07-30
- **Status:** RECOMMENDATION — design review only. No code was written, no git operation performed.
- **Primary optimization target (user's explicit ask):** *maximally flexible and scalable for adding
  more payment providers later — PayPal, Stripe, and other regional payment systems — without a
  redesign each time.* Every decision below is justified against that requirement first and
  "does lipay work" second.
- **Personas loaded:** `AI-Dev-Shop/AGENTS.md`, `AI-Dev-Shop/agents/software-architect/skills.md`
- **Prior work:** the earlier WooCommerce/OpenSaaS synthesis was never durably saved and a
  follow-up review pass was killed mid-run. This document was produced from scratch; nothing from
  either prior run was consumed.

---

## 0. Method and evidence standard

Per `AI-Dev-Shop`'s anti-hallucination policy, claims below are labeled:

- **VERIFIED** — read directly from source (upstream repo file, official doc page, or a file in
  this repository).
- **INFERRED** — my reading of verified evidence, marked as such.

Upstream research was performed against WooCommerce `trunk` (≥ 10.9, source files on
`github.com/woocommerce/woocommerce`) and a shallow clone of `wasp-lang/open-saas` at HEAD
`9ee052af` (2026-07-24). Tovu-side claims were read from the working tree at
`/Users/la/Programming/Tovu` on 2026-07-30.

Files read in this repository:
`src/features/plugins/data-module.ts`, `src/features/plugins/store/store-plugin.ts`,
`src/features/plugins/deploy/deploy-plugin.ts`, `src/http/ports.ts`, `src/http/client.ts`,
`src/integrations/ports.ts`, `src/server/routes/types.ts`, `src/server/app.ts`,
`src/server/modules/plugins.ts`, `src/server/routes/site/store.ts`,
`ADS-memory/reports/architecture/ADR-026-core-mediated-atomic-multi-write.md`.

---

## 1. Research findings

### 1.1 WooCommerce — what it actually does

**The gateway base class.** VERIFIED —
[`abstract-wc-payment-gateway.php`](https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/includes/abstracts/abstract-wc-payment-gateway.php):

```php
abstract class WC_Payment_Gateway extends WC_Settings_API {
```

It is `abstract` but declares **no abstract methods** — every method has a default body. A gateway
that overrides nothing is syntactically valid and silently does nothing. `$id` is not even declared
on the gateway class; it is inherited from `WC_Settings_API`, because the gateway ID doubles as the
settings-option-name fragment. That coupling is load-bearing and is why a gateway cannot be renamed
without orphaning its credentials.

**The result contract is stringly-typed.** VERIFIED — the doc comment *is* the contract:

```php
public function process_payment( $order_id ) {
    return array();   // base implementation
}
// documented shape: array( 'result' => 'success', 'redirect' => $this->get_return_url( $order ) )
```

Three incompatible result shapes exist on one class: `process_payment` returns an `array`,
`process_refund` returns `bool|WP_Error`, `add_payment_method` returns an `array` with a *different*
redirect semantic.

**Off-site vs direct is a single string.** VERIFIED — the only difference between a Stripe-style
direct gateway and PayPal-style off-site gateway is whether `redirect` points at
`get_return_url($order)` or at `paypal.com`. For the off-site case `'result' => 'success'` does not
mean "payment succeeded" — it means "I successfully produced a URL." VERIFIED in
`class-wc-checkout.php`:

```php
if ( isset( $result['result'] ) && 'success' === $result['result'] ) {
    wp_redirect( $result['redirect'] ); exit;   // no else branch
}
```

No `else` — a gateway returning the base class's own `array()` produces a silent no-op checkout.

**WooCommerce later admitted the shape was wrong.** VERIFIED —
[`src/StoreApi/Payments/PaymentResult.php`](https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/src/StoreApi/Payments/PaymentResult.php)
declares `protected $valid_statuses = [ 'success', 'failure', 'pending', 'error' ];` and
`set_status()` **throws** on an invalid value. Four statuses, including `pending` — precisely the
state off-site gateways actually occupy and that `'success'|'failure'` could never express.

**The single best idea: `$supports` capability declaration.** VERIFIED —
[`PaymentGatewayFeature.php`](https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/src/Enums/PaymentGatewayFeature.php)
enumerates 20 capability strings (`products`, `refunds`, `tokenization`, `subscriptions`,
`add_payment_method`, `default_credit_card_form`, `pre-orders`, `agentic_commerce`, …). Core
consults it exactly where behavior must diverge:

```php
public function can_refund_order( $order ) {
    return $order && $this->supports( PaymentGatewayFeature::REFUNDS );
}   // "If false, the automatic refund button is hidden in the UI."
```

INFERRED: this is why a 2011 offline-cheque gateway and a 2026 tokenizing card gateway coexist
behind one interface after 15 years. Core does not assume gateways are interchangeable; it asks, and
hides the affordances a gateway cannot back. **This is the mechanism that made WooCommerce's gateway
model survive, and it is the single most important thing to copy.**

Its execution is poor, though, and the flaws are instructive. VERIFIED: capabilities are untyped
strings in a flat array with no namespacing (core, the Subscriptions extension, and any third party
write into the same list — Subscriptions documents `gateway_scheduled_payments`, which core has
never heard of); a typo fails silently and merely hides a button; `pre-orders` uses a hyphen while
all 19 siblings use underscores, which is direct evidence these accreted rather than being designed;
there is no way to express partial support ("refunds, but only full refunds, within 90 days"); and
`apply_filters( 'woocommerce_payment_gateway_supports', … )` lets arbitrary code lie about any
gateway's capabilities.

**Registration.** VERIFIED — `WC_Payment_Gateways::init()` applies the
`woocommerce_payment_gateways` filter to an **array of class-name strings** and does
`new $gateway()`. No DI, no constructor arguments, no validation feedback (a missing class is
skipped with a bare `continue`), and core's own registry contains a hard-coded branch for one
gateway (`should_load_paypal_standard()`). Ordering comes from a separate `wp_options` row and is a
merchant drag-and-drop preference, not a routing concept.

The one genuinely right thing here: **core never enumerates the set of gateways.** Providers add
themselves. Contrast this with a closed union — see §1.2.

**Webhooks got a hook, not an API.** VERIFIED — the modern dispatcher lives in
[`LegacyRestApiStub.php`](https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/src/Internal/Utilities/LegacyRestApiStub.php):

```php
ob_start();                                        // "Buffer, we won't want any output here."
$api_request = strtolower( wc_clean( $wp->query_vars['wc-api'] ) );
WC()->payment_gateways();
do_action( 'woocommerce_api_request', $api_request );
status_header( has_action( 'woocommerce_api_' . $api_request ) ? 200 : 400 );
do_action( 'woocommerce_api_' . $api_request );
ob_end_clean();
die( '-1' );
```

A gateway registers with `add_action( 'woocommerce_api_wc_gateway_paypal', … )` — the hook suffix is
the lowercased class name. There is **no authentication, no signature verification, no routing
table, no retry/dedupe machinery, no delivery log**; the response body is hard-coded `die('-1')` and
all handler output is discarded by `ob_end_clean()`. Every gateway reimplements verification itself
(PayPal posts back to PayPal in `validate_ipn()`).

INFERRED and load-bearing: **the synchronous path got a first-class method; the asynchronous path —
the other half of every real payment integration — got a naming convention over a global action
hook.** That asymmetry is the largest structural defect in the whole model.

**Idempotency is a status guard, not a key.** VERIFIED — `WC_Order::payment_complete()`:

```php
$valid_completed_statuses = apply_filters( 'woocommerce_valid_order_statuses_for_payment_complete',
    OrderStatus::PAYMENT_COMPLETE_STATUSES, $this );   // [ on-hold, pending, failed, cancelled ]
if ( $this->has_status( $valid_completed_statuses ) ) { … }
```

Plus PayPal's own guard, applied twice more, at two other layers, with two different status sets.
There is no idempotency key, no dedupe on provider event ID, no row lock, no check-and-set, and the
guard set itself is third-party-filterable. `_transaction_id` is overwritten, never compared —
storing it is a side effect of completion, not a precondition for it. Read-status → branch → write,
across three layers, with no transaction spanning them: a textbook TOCTOU under concurrent
PDT-return + IPN delivery.

INFERRED: the one genuinely good idempotency mechanism in the codebase — `cart_hash` +
`order_awaiting_payment` order resumption — is scoped to *order creation from a cart* and never
applied to *payment capture*.

**Storage.** VERIFIED — the HPOS `wc_orders` table has exactly **three** payment columns:
`payment_method varchar(100)`, `payment_method_title text`, `transaction_id varchar(100)` (indexed,
prefix 20), plus `date_paid_gmt`/`cart_hash`/`order_key` on `wc_order_operational_data`. There is no
authorization ID, no capture ID, no provider event ID, no payment-attempt table, no
capture/void state, and no idempotency-key column. A payment with an auth-then-capture lifecycle, a
3DS challenge, and two webhook retries has nowhere structured to live — it all lands in
`wc_orders_meta` as untyped gateway-specific keys. Core itself does this:
`$order->add_meta_data( 'PayPal Transaction Fee', … )` — meta keys with spaces and capitals.

Notably, `transaction_id` **is** indexed for provider-ref → order lookup, but VERIFIED there is no
`wc_get_order_id_by_transaction_id()` in core — only `wc_get_order_id_by_order_key()`. The schema is
indexed for the query every gateway needs and no public API exposes it, so each gateway
reimplements correlation its own way (PayPal round-trips a JSON blob through PayPal's `custom` field
and re-validates with `hash_equals()` on `order_key`).

**Credentials.** VERIFIED — `WC_Settings_API::get_option_key()` returns
`"woocommerce_{$this->id}_settings"`, and the write path is
`update_option( $option_key, …, 'yes' )`. Every gateway's settings — including live secret keys and
webhook signing secrets — are one PHP-serialized array in a single `wp_options` row, **in
plaintext**, with `autoload = 'yes'`, meaning they are `SELECT`ed and unserialized into PHP memory
on **every WordPress request**. A filter (`woocommerce_settings_api_sanitized_fields_{$id}`) sits
between the data and the database on every save. WooCommerce's own
[July 2021 advisory](https://woocommerce.com/posts/critical-vulnerability-detected-july-2021/) told
merchants to rotate "public/private keys for payment gateways" after a DB-exposure bug — an implicit
concession that a database read is total credential compromise.

**The double-integration problem — the strongest evidence of all.** VERIFIED, verbatim from
[`payment-method-integration.md`](https://github.com/woocommerce/woocommerce/blob/trunk/docs/block-development/extensible-blocks/cart-and-checkout-blocks/checkout-payment-methods/payment-method-integration.md):

> "This class is the server side representation of your payment method… **It is not the same as the
> Payment Gateway API that you need to implement separately for payment processing.**"

> "**Payments are still handled via the Payment Gateway API. This is a separate API from the one
> used for the payment methods integration above.**"

A modern WooCommerce gateway needs up to **three** artifacts registered through three unrelated
mechanisms: a `WC_Payment_Gateway` subclass, an `AbstractPaymentMethodType` subclass, and a JS module
calling `registerPaymentMethod()`. The two are reunited only by a string — `paymentMethodId` in JS
must match `$gateway->id` in PHP, with nothing enforcing it. The Blocks class even re-reads the same
`wp_options` row by hard-coded name because there is no shared settings abstraction:

```php
public function initialize() {
    $this->settings = get_option( 'woocommerce_my_payment_method_settings', [] );
}
```

The bridge that keeps legacy gateways alive is the most instructive file in the system. VERIFIED,
[`src/StoreApi/Legacy.php`](https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/src/StoreApi/Legacy.php):
to run a REST/React checkout through a 2011-era gateway, WooCommerce **overwrites the `$_POST`
superglobal**, calls the gateway, restores `$_POST`, defines a global `WOOCOMMERCE_CHECKOUT`
constant, converts the global notice queue into exceptions, calls `wc_clear_notices()` to clean up
leaked side effects, coerces an untyped array key into a typed status with a `'failure'` fallback,
and hooks itself at priority 999.

INFERRED, and this is the design lesson worth the most: **the parts of WooCommerce's interface that
expressed *domain facts* — the `$supports` capability declarations and the order status lifecycle —
survived the transport change intact and are reused verbatim by the Blocks API. The parts that
expressed *presentation and transport* — `payment_fields()`, `admin_options()`, the notice queue,
`$_POST`, redirect URLs — all had to be rebuilt.** A payment abstraction should contain only the
former.

WooCommerce has conceded the principle in its own repo. VERIFIED,
[Curated Extensibility Principles #41304](https://github.com/woocommerce/woocommerce/discussions/41304):
> **"Favor explicit interfaces for integrations over action and filter hooks"** — "This approach
> enables typing, clear expectations, hiding implementation details, better test coverage, and
> simpler future deprecation."

### 1.2 Open SaaS — the multi-provider refactor

VERIFIED, `template/app/src/payment/paymentProcessor.ts` (complete, 39 lines):

```ts
export interface PaymentProcessor {
  id: "stripe" | "lemonsqueezy" | "polar";
  createCheckoutSession: (args: CreateCheckoutSessionArgs) => Promise<{ session: { id: string; url: string } }>;
  fetchCustomerPortalUrl: (args: FetchCustomerPortalUrlArgs) => Promise<string | null>;
  webhook: PaymentsWebhook;
  webhookMiddlewareConfigFn: MiddlewareConfigFn;
  fetchTotalRevenue: () => Promise<number>;
}

/** Choose which payment processor you'd like to use, then delete the
 *  other payment processor code that you're not using from `/src/payment` */
export const paymentProcessor: PaymentProcessor = stripePaymentProcessor;
// export const paymentProcessor: PaymentProcessor = lemonSqueezyPaymentProcessor;
```

It is **four providers now, not two** — Stripe, Lemon Squeezy and Polar are merged on `main` (Polar
via [PR #461](https://github.com/wasp-lang/open-saas/pull/461), 2025-11-21); Paddle is an open PR
([#714](https://github.com/wasp-lang/open-saas/pull/714), 2026-07-20).

**The abstraction and the second provider landed together.** VERIFIED —
[PR #246](https://github.com/wasp-lang/open-saas/pull/246) ("add lemon squeezy as payment provider",
merged 2024-09-09) created `paymentProcessor.ts` for the first time *and* renamed the schema column
in the same diff:

```diff
-  stripeId                  String?         @unique
+  paymentProcessorUserId    String?         @unique
+  lemonSqueezyCustomerPortalUrl String?     // You can delete this if you're not using Lemon Squeezy…
```

Rule of Three, arrived at on the second instance.

**What Open SaaS gets right — and Tovu should steal.**

1. **Provider-neutral plan-ID indirection.** VERIFIED, `payment/paymentProcessorPlans.ts`:

```ts
export const paymentProcessorPlanIds = {
  [PaymentPlanId.Hobby]:     env.PAYMENTS_HOBBY_SUBSCRIPTION_PLAN_ID,
  [PaymentPlanId.Pro]:       env.PAYMENTS_PRO_SUBSCRIPTION_PLAN_ID,
  [PaymentPlanId.Credits10]: env.PAYMENTS_CREDITS_10_PLAN_ID,
} as const satisfies Record<PaymentPlanId, string>;
```

The env var names are `PAYMENTS_*`, not `STRIPE_*`. The same three variables hold Stripe price IDs,
Lemon Squeezy variant IDs, Polar product IDs, or Paddle price IDs. Swapping providers changes config
*values*, never config *keys*. And `as const satisfies Record<PaymentPlanId, string>` makes adding a
plan a compile error until its processor ID is supplied.

2. **A domain-level effect union instead of provider vocabulary.** VERIFIED, `payment/plans.ts`:
`type PaymentPlanEffect = { kind: "subscription" } | { kind: "credits"; amount: number }`. The
domain never learns the words "price" or "variant"; each adapter translates (Stripe:
`"subscription"` vs `"payment"` mode).

3. **Exhaustive mapping tables with `undefined` = ignore.** VERIFIED, `stripe/webhook.ts`:

```ts
const stripeToOpenSaasSubscriptionStatus: Record<Stripe.Subscription.Status, SubscriptionStatus | undefined> = {
  trialing: SubscriptionStatus.Active,   active: SubscriptionStatus.Active,
  past_due: SubscriptionStatus.PastDue,  canceled: SubscriptionStatus.Deleted,
  unpaid: SubscriptionStatus.Deleted,    incomplete_expired: SubscriptionStatus.Deleted,
  paused: undefined,                     incomplete: undefined,
};
```

Because it is a `Record` over the SDK's own union, a new provider status is a compile error rather
than a silent fallthrough.

**Where Open SaaS breaks — and each break is a concrete warning for lipay.**

1. **`id` is a closed union, so the abstraction is not open for extension.** VERIFIED: PR #714 must
   patch `| "paddle"` into the core interface file to add a provider. This is the single most
   important negative finding in the entire research corpus, because it is exactly the shape
   `deploy-plugin.ts`'s `DeployTarget` already has.

2. **`{ session: { id, url } }` hard-codes redirect-to-hosted-checkout, and it broke.** VERIFIED
   from PR #714's own description: *"Hosted checkouts in Paddle are only available for mobile app
   companies, so the `generateCheckoutSession` action creates a Paddle transaction and returns its
   ID, then `PricingPage` opens the overlay for Paddle while the other three providers keep their
   existing redirect path."* The fix leaked the provider identity into the client-facing type:

```diff
 export type CheckoutSession = {
   sessionUrl: string | null;
   sessionId: string;
+  // Lets the client decide how to open checkout (e.g. redirect vs. Paddle.js overlay).
+  paymentProcessorId: PaymentProcessor["id"];
 };
```

   …plus a literal `if (checkoutSession.paymentProcessorId === "paddle")` branch in `PricingPage.tsx`,
   and a Paddle adapter returning `url: transaction.checkout?.url ?? ""` — an empty string to satisfy
   a contract it cannot honor. **When the fourth provider arrived, the interface stopped being an
   interface and the caller started switching on the tag.**

3. **No idempotency anywhere.** VERIFIED by exhaustive grep across the repo for
   `idempot|deduplicat|dedupe|replay|already processed|processedEvent`: one hit, in a cookie-consent
   file about gtag. No event-log model in `schema.prisma`; no provider `event.id` is ever read or
   persisted; no Stripe `Idempotency-Key` header on any outbound call. And `updateUserCredits` uses
   `credits: { increment: numOfCreditsPurchased }` — **a replayed `invoice.paid` double-grants
   credits.** The docs do not acknowledge this as a known limitation; it is simply absent.

4. **`fetchTotalRevenue(): Promise<number>` has no defined semantics.** VERIFIED: Stripe returns
   gross all-time charges; Lemon Squeezy sums all order totals; Polar sums paid orders; Paddle
   returns **net** revenue over a **3-year rolling window**. Same signature, four different numbers,
   no currency, no period, plotted interchangeably on one dashboard. A cautionary tale about
   under-specified interface methods.

5. **The interface is Stripe-shaped, and the code says so.** VERIFIED, `lemonSqueezy/webhook.ts`
   comments: *"`cancel_at_period_end` is the Stripe equivalent of LemonSqueezy's cancelled"*,
   *"deleted is the Stripe equivalent of LemonSqueezy's expired"*. The `SubscriptionStatus` enum is
   Stripe's vocabulary verbatim. Polar integrated smoothly largely *because* Polar's API is a Stripe
   clone; Lemon Squeezy needed a bespoke `lemonSqueezyCustomerPortalUrl` column in the shared `User`
   model, documented as "delete this if you're not using Lemon Squeezy" — manual cleanup as
   architecture. INFERRED: the abstraction generalizes over Stripe-alikes, not over payment
   providers.

6. **`webhookMiddlewareConfigFn` exists for a real reason but has never varied.** VERIFIED: the hook
   exists because Stripe needs raw bytes for HMAC verification —

```ts
/** Stripe requires a raw request to construct events successfully. */
export const stripeMiddlewareConfigFn: MiddlewareConfigFn = (middlewareConfig) => {
  middlewareConfig.delete("express.json");
  middlewareConfig.set("express.raw", express.raw({ type: "application/json" }));
  return middlewareConfig;
};
```

   …but all three merged implementations (and Paddle's fourth) are **byte-identical**; only the
   comments differ. INFERRED: HMAC-over-raw-body is near-universal across payment providers, so the
   raw-body need is a property of *webhooks*, not of *a provider*. It should be solved once, in core.

7. **Selection is a hand-edited module-level const.** VERIFIED: no env var, no registry, no factory.
   The docs instruct you to edit the line, delete the other provider directories, `npm uninstall`
   their SDKs, and strip their env schemas. Because all provider env schemas are spread
   unconditionally in `src/env.ts`, the out-of-the-box template **refuses to boot** unless you supply
   credentials for all four providers. This is a template-time choice, not a runtime one.

### 1.3 Comparison point — Medusa v2

Secondary, less deeply verified (from
[Medusa's official provider reference](https://docs.medusajs.com/resources/references/payment/provider);
I did not read Medusa source). `AbstractPaymentProvider` carries ~10 methods —
`initiatePayment`, `authorizePayment`, `capturePayment`, `refundPayment`, `cancelPayment`,
`updatePayment`, `deletePayment`, `retrievePayment`, `getPaymentStatus`, plus `validateOptions` and
`getWebhookActionAndData`.

Three differences matter here:

- **Runtime registry, not a hardcoded const.** Providers register as modules; multiple can be active
  simultaneously and selected per-cart.
- **`getWebhookActionAndData` inverts webhook control.** Medusa's *single core route* receives the
  webhook and hands the provider `{ data, rawData, headers }`; the provider returns a normalized
  `{ action, data }` and **Medusa performs the state transition.** The raw-body problem is solved
  once in core, so there is no per-provider middleware hook at all — a direct, better answer to
  Open SaaS's `webhookMiddlewareConfigFn`.
- **Explicit authorize/capture lifecycle**, rather than collapsing everything into
  "checkout happened, then webhooks fire."

INFERRED: Medusa's inversion is the single choice that would have prevented Open SaaS critique items
2, 3, 6 and 7 simultaneously. **Lipay should adopt it.**

### 1.4 Distilled design lessons

| # | Lesson | Evidence |
|---|---|---|
| L1 | Capability declaration is what makes heterogeneous providers coexist long-term. | Woo `$supports`, 15 years, survived the Blocks rewrite intact |
| L2 | Make it a **typed** declaration, not a flat string array. | Woo's silent typos, unnamespaced vocabulary, `pre-orders` hyphen, no partial support |
| L3 | Never close the provider set in a type. | Open SaaS `id: "stripe"\|"lemonsqueezy"\|"polar"`; Paddle PR must patch it |
| L4 | Separate *"the call succeeded"* from *"money moved"* from *"what the shopper must do next."* | Woo's `'success'` meaning "I made a URL"; Store API adding `pending` as a 4th status |
| L5 | The async path needs a first-class contract, not a hook. | Woo's `do_action('woocommerce_api_…')`, `die('-1')`, no auth |
| L6 | Normalize webhooks at the core boundary; the provider returns a domain event, core writes. | Medusa `getWebhookActionAndData` vs Open SaaS handing over the Express handler |
| L7 | Idempotency needs real keys, inbound and outbound — not status guards. | Woo's TOCTOU `has_status()`; Open SaaS's `credits: { increment }` double-grant |
| L8 | Payment attempts and provider events need first-class tables from day one. | Woo's 3 payment columns → everything real lands in untyped meta |
| L9 | Provider-specific IDs stay behind a neutral indirection; neutral env-var *names*. | Open SaaS `PAYMENTS_*_PLAN_ID` (good) vs `lemonSqueezyCustomerPortalUrl` in the shared model (bad) |
| L10 | Credentials never live in the portable content database. | Woo's plaintext `autoload=yes` `wp_options` row + 2021 advisory |
| L11 | An abstraction only generalizes over the providers you tested it against. | Open SaaS's own comments: *"the Stripe equivalent of…"* |

---

## 2. Tovu constraints this design must satisfy (all VERIFIED from the working tree)

**C1 — `declareDataModule()` grammar.** `src/features/plugins/data-module.ts:123` defines
`IDENT = /^[a-z][a-z0-9_]*$/` and `TYPES = { TEXT, INTEGER, REAL, BLOB }`. Supported per column:
`primaryKey`, `notNull`. Supported per table: `indexes` (multi-column, optional `unique`).
**Not supported:** `DEFAULT`, `CHECK`, composite primary keys, foreign keys (deliberately — see the
`IndexDecl` doc comment citing ADR-031 §2: referential integrity is "chokepoint-validated, not
FK-enforced (v1)"). Tables are physically named `p_{pluginId}__{table}`; core alone runs the DDL.

**C2 — a live grammar conflict between ADR-023 and ADR-026.** ADR-026's round-11 fix mandates that
both `pluginId` and every plugin-registered `tableName` match `^[a-z0-9]+(-[a-z0-9]+)*$` —
"lowercase ASCII alphanumerics and internal hyphens only, **no underscore anywhere**" — to keep the
`p_{pluginId}__{tableName}` encoding injective and prevent a cross-plugin isolation bypass. But
`data-module.ts`'s `IDENT` **permits underscores and forbids hyphens**. The two grammars are
mutually exclusive except on their intersection: `^[a-z][a-z0-9]*$` — single-segment, no separator
of any kind.

`data-module.ts` does not enforce ADR-026's grammar today, and existing plugins already violate it —
VERIFIED by grep: `p_comments__moderation_log`, `p_newsletter__audience_snapshots`,
`p_newsletter__confirmation_tokens`. Store (`products`, `orders`) and Deploy (`deploys`)
accidentally comply.

**Design consequence: lipay's table short names must be single words with no separators.** This
costs a greenfield plugin nothing and is the only way to satisfy both ADRs. Comments/Newsletter would
need a migration to comply; lipay would not.

**C3 — the guarded outbound-HTTP seam is mandatory.** `src/http/client.ts`'s `createHttpClient` is
the only production `HttpClientPort` constructor (ADR-038 §2) and enforces scheme checks,
credentials-in-URL rejection, DNS resolution with address-family-complete private/loopback/
link-local/metadata classification, peer pinning, redirect re-verification, and auth-header
stripping on cross-origin hops. `deploy-plugin.ts` already routes Vercel calls through it. Lipay must
too — **never a raw `fetch`.**

**C4 — a blanket JSON body parser destroys the bytes webhook HMAC verification needs.** VERIFIED,
`src/server/app.ts:444`:

```ts
app.use(express.json({ limit: "15mb" }));
```

This is mounted globally, ahead of all route registration. By the time any handler sees the request,
`req.body` is a parsed object and the original bytes are gone. This is the exact problem Open SaaS
papers over with `webhookMiddlewareConfigFn`, and it is a **real, verified blocker** that must be
solved in core — see §6 and Risk R1.

**C5 — Tovu is multi-workspace.** `RouteDeps.workspaceId` exists and `src/integrations/ports.ts`
notes ADR-007 §1: "Every method carries `workspaceId`." Every lipay row must be workspace-scoped.
Note that `store-plugin.ts` and `deploy-plugin.ts` — both spikes — do *not* carry `workspaceId`.
Lipay should not copy that.

**C6 — Tier-2 with a direct DB handle is the established precedent.** Both `activateStore` and
`activateDeploy` receive `{ db, dbPath }`, declare through core, then hold the handle. Multi-write
atomicity comes from `db.transaction()`. ADR-026's core-mediated atomic-write primitive is **not
implemented** (VERIFIED by grep — the hits are unrelated OCC code in `comments/`), so this is the
only atomicity mechanism available today.

**C7 — the bootstrap pattern.** Both plugins open a dedicated `better-sqlite3` connection with
`journal_mode = WAL` and `busy_timeout = 5000`, the latter added after a live multi-boot smoke test
found deterministic `SQLITE_BUSY` failures. Copy this verbatim.

**C8 — `clock` and `idGen` ports exist** on `RouteDeps` (`src/server/routes/types.ts:115-116`) but
neither plugin spike uses them; both call `Date.now()` and `Math.random().toString(36)` inline. For
money, ordering and idempotency keys, that is worse than for deploys. Lipay should take them as
injected dependencies.

---

## 3. Recommended table schema

Three tables. Namespaced per C1, single-word names per C2, workspace-scoped per C5.

```ts
export const LIPAY_PLUGIN_ID = "lipay";   // satisfies both IDENT and ADR-026's grammar

export const LIPAY_MANIFEST: DataModuleDecl = {
  pluginId: LIPAY_PLUGIN_ID,
  pluginTier: "tier-2",
  provenance: { sourceUrl: "builtin://lipay", publisher: "tovu-core" },
  tables: [
    {
      // p_lipay__payments — one row per payment attempt (the "intent"), provider-agnostic.
      name: "payments",
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        { name: "workspace_id", type: "TEXT", notNull: true },
        { name: "provider_id", type: "TEXT", notNull: true },
        // Caller-supplied. The outbound idempotency guard (L7).
        { name: "idempotency_key", type: "TEXT", notNull: true },
        // pending | succeeded | failed | refunded | partially_refunded | canceled
        { name: "status", type: "TEXT", notNull: true },
        // Integer minor units. NEVER a float, NEVER "cents" — see §3.1.
        { name: "amount_minor", type: "INTEGER", notNull: true },
        { name: "currency", type: "TEXT", notNull: true },
        { name: "amount_refunded_minor", type: "INTEGER", notNull: true },
        // The provider's own charge/transaction id. Null until the provider responds.
        { name: "provider_ref", type: "TEXT" },
        // The CALLER's domain reference (order id, invoice id, membership id, …).
        // Lipay deliberately does not know what it points at — see §3.2.
        { name: "reference", type: "TEXT" },
        { name: "created_at", type: "INTEGER", notNull: true },
        { name: "updated_at", type: "INTEGER", notNull: true },
        { name: "last_error", type: "TEXT" },
      ],
      indexes: [
        // Outbound replay protection: a retried charge with the same key hits this, not the provider.
        { name: "idem", columns: ["workspace_id", "idempotency_key"], unique: true },
        // Webhook -> payment correlation. This is the lookup WooCommerce indexed but never exposed.
        { name: "ref", columns: ["provider_id", "provider_ref"] },
        { name: "wsstatus", columns: ["workspace_id", "status", "created_at"] },
      ],
    },
    {
      // p_lipay__events — every inbound provider notification, verified and normalized.
      name: "events",
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        { name: "workspace_id", type: "TEXT", notNull: true },
        { name: "provider_id", type: "TEXT", notNull: true },
        // The provider's own event id. THE inbound idempotency key.
        { name: "provider_event_id", type: "TEXT", notNull: true },
        // Null when the event arrives before its payment row can be correlated.
        { name: "payment_id", type: "TEXT" },
        { name: "kind", type: "TEXT", notNull: true },
        { name: "occurred_at", type: "INTEGER", notNull: true },
        { name: "received_at", type: "INTEGER", notNull: true },
        // 0/1 — no BOOLEAN in the allowed type set (C1).
        { name: "applied", type: "INTEGER", notNull: true },
        { name: "payload", type: "TEXT", notNull: true },
      ],
      indexes: [
        // Replay of an already-seen event is a no-op at the INSERT, not a code branch (L7).
        { name: "dedupe", columns: ["provider_id", "provider_event_id"], unique: true },
        { name: "bypayment", columns: ["payment_id", "occurred_at"] },
      ],
    },
    {
      // p_lipay__refunds
      name: "refunds",
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        { name: "workspace_id", type: "TEXT", notNull: true },
        { name: "payment_id", type: "TEXT", notNull: true },
        { name: "idempotency_key", type: "TEXT", notNull: true },
        { name: "provider_ref", type: "TEXT" },
        { name: "amount_minor", type: "INTEGER", notNull: true },
        { name: "currency", type: "TEXT", notNull: true },
        { name: "status", type: "TEXT", notNull: true },
        { name: "reason", type: "TEXT" },
        { name: "created_at", type: "INTEGER", notNull: true },
        { name: "updated_at", type: "INTEGER", notNull: true },
      ],
      indexes: [
        { name: "idem", columns: ["workspace_id", "idempotency_key"], unique: true },
        { name: "bypayment", columns: ["payment_id"] },
      ],
    },
  ],
};
```

**Deliberately absent, and why:**

- **No `providers` table.** Providers are code plus environment credentials, never rows. This is the
  direct inverse of WooCommerce's `woocommerce_{id}_settings` option row (L10), and it means a
  provider cannot be enabled by a database write.
- **No card data, no PAN, no tokens.** If tokenization is ever added it gets its own table holding
  *provider* tokens only. WooCommerce's `woocommerce_payment_tokens` (`token text NOT NULL`, no
  index, no unique constraint, no encryption, no FK) is the anti-pattern.
- **No `orders` table.** Lipay is a payments plugin, not a commerce plugin — see §3.2.

### 3.1 Money representation

`amount_minor INTEGER` + `currency TEXT` (ISO-4217 alpha-3, uppercase), never a float, never a bare
"cents" integer.

This matters specifically because of the user's requirement about *"other regional payment systems in
other parts of the world."* `store-plugin.ts` uses `price: number // cents` with **no currency
field at all** — fine for a spike, wrong here. JPY and KRW have zero decimal places; KWD, BHD and
JOD have three. "Cents" is not a universal unit, so the minor-unit scale is a property of the
currency code and must be derived from it, not assumed to be 100.

### 3.2 What lipay deliberately does not model

`payments.reference` is an opaque caller-owned string. Lipay never learns what it points at.

This is the Open SaaS `PaymentPlanEffect` lesson (L9) generalized: keep provider vocabulary out of
the domain, and keep *domain* vocabulary out of the payments layer. If lipay grows an `order_id`
column it becomes coupled to one commerce model, and the store plugin, a membership plugin, and a
donations plugin can no longer all use it. WooCommerce's inseparability of "gateway" from "WC_Order"
is precisely why its payment code cannot be reused for anything that is not a WooCommerce order.

---

## 4. The provider abstraction — core deliverable

Design intent, stated as a testable property:

> **Adding a payment provider must require creating exactly one new file and one registration line,
> with zero edits to lipay's tables, public API, error union, webhook route, or admin UI.**

Everything below exists to make that property true. §7 tests it against Stripe.

### 4.1 Money, provider identity, capabilities

```ts
export interface Money {
  /** Integer amount in the currency's minor unit. Never a float, never assumed to be /100. */
  readonly minorUnits: number;
  /** ISO-4217 alpha-3, uppercase. */
  readonly currency: string;
}

/**
 * Opaque, registry-keyed. DELIBERATELY NOT a closed string union (L3).
 *
 * This is the single most important line in the design. `deploy-plugin.ts`'s
 * `DeployTarget = "vercel" | "netlify" | "github-pages" | "aws"` and Open SaaS's
 * `id: "stripe" | "lemonsqueezy" | "polar"` are the same mistake: the core type
 * enumerates the extension set, so every new provider is a core edit. Open SaaS's
 * Paddle PR (#714) has to patch `| "paddle"` into the interface file to proceed.
 */
export type PaymentProviderId = string;
```

Capabilities are a **typed object**, not WooCommerce's flat string array — this keeps L1's mechanism
and fixes L2's execution. A typo is a compile error rather than a silently hidden button, and
partial support is expressible.

```ts
export type ChargeNextActionKind =
  /** Captured synchronously (card-on-file, stored token). Rare. */
  | "none"
  /** Off-site hosted checkout: PayPal Standard, Stripe Checkout, Paystack redirect. */
  | "redirect"
  /** In-page SDK takes over: Paddle overlay, Stripe 3DS/Elements, Razorpay/Paystack inline. */
  | "client_action"
  /**
   * Shopper acts somewhere else entirely and the provider calls back later — minutes to days.
   * M-Pesa STK push, PIX, boleto bancário, bank transfer, USSD, agent/cash networks.
   *
   * This case is why lipay cannot use WooCommerce's or Open SaaS's shape. It is the DEFAULT
   * mode for large parts of Africa, LATAM and South/Southeast Asia — precisely the "regional
   * payment systems in other parts of the world" the requirement names.
   */
  | "out_of_band";

export interface PaymentProviderCapabilities {
  /** WooCommerce's boolean `refunds` cannot express the middle value; this can (L2). */
  readonly refunds: "none" | "full" | "partial";
  readonly tokenization: boolean;
  readonly recurring: boolean;
  /** Which completion shapes this provider can return from `createCharge`. */
  readonly confirmation: readonly ChargeNextActionKind[];
  /** ISO-4217 codes, or "any" when the provider accepts whatever the merchant account holds. */
  readonly currencies: readonly string[] | "any";
  /** False = this provider has no async callback; its charge result is final. */
  readonly webhooks: boolean;
}
```

### 4.2 The provider port

```ts
/**
 * One payment provider. Implemented once per provider, in its own file, and registered.
 * Core NEVER enumerates implementations of this interface.
 *
 * Discipline, inherited from `deploy-plugin.ts` and non-negotiable:
 *   - no method throws; every failure is a typed `PaymentError`
 *   - no method touches the database; core owns all persistence and all idempotency
 *   - all outbound HTTP goes through `ctx.httpClient` (ADR-038), never a raw `fetch`
 */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly displayName: string;
  readonly capabilities: PaymentProviderCapabilities;

  /**
   * Credential slot names this provider needs, e.g. ["secretKey", "webhookSecret"].
   * Core resolves them and injects the resolved bundle via `ctx.credentials` (§5).
   * Declaring them as data — rather than reading env vars inline — is what lets core
   * report a misconfigured provider uniformly, before any provider code runs.
   */
  readonly credentialKeys: readonly string[];

  createCharge(input: ProviderChargeInput, ctx: ProviderContext): Promise<ProviderChargeResult>;

  /** Present only when `capabilities.refunds !== "none"`. Core checks before calling. */
  refund?(input: ProviderRefundInput, ctx: ProviderContext): Promise<ProviderRefundResult>;

  /**
   * Verify and normalize an inbound webhook. Returns DOMAIN EVENTS; core writes them.
   *
   * This is Medusa's `getWebhookActionAndData` inversion (L6), and it is deliberately NOT
   * Open SaaS's `webhook: PaymentsWebhook` (which hands the provider an entire Express
   * handler and lets it write to the database directly). Consequences of the inversion:
   *   - the raw-body problem is solved ONCE in core, so no per-provider middleware hook
   *     is needed — Open SaaS's `webhookMiddlewareConfigFn` is byte-identical across all
   *     four of its providers, i.e. a hook that has never varied
   *   - idempotency is enforced by core, not by each provider author's discipline
   *   - a provider physically cannot write a row core did not authorize
   *
   * Async and given `ctx.httpClient` because some providers verify out-of-band rather than
   * by local HMAC — WooCommerce's PayPal IPN handler posts the notification back to PayPal
   * in `validate_ipn()`. A synchronous signature would have excluded PayPal.
   */
  parseWebhook(input: ProviderWebhookInput, ctx: ProviderContext): Promise<ProviderWebhookResult>;
}
```

### 4.3 Context, inputs and results

```ts
export interface ProviderContext {
  /**
   * Already resolved by core from `credentialKeys`, and scoped to THIS provider.
   *
   * Deliberate deviation from `DeployTokenPort` (§8): deploy hands every call site a port
   * that can fetch ANY target's token (`getToken(target)`). Pre-resolving means (a) core
   * performs the "not configured" check once, uniformly, before entering provider code,
   * and (b) a provider cannot read another provider's credentials.
   */
  readonly credentials: Readonly<Record<string, string>>;
  /** The ADR-038 guarded seam. There is no other way to make an outbound call. */
  readonly httpClient: HttpClientPort;
  readonly now: () => number;
  /** Absolute, externally reachable URL this provider's webhooks arrive on. */
  readonly webhookUrl: string;
  /** Where the shopper returns after an off-site redirect. */
  readonly returnUrl: string;
}

export interface ProviderChargeInput {
  readonly amount: Money;
  /** Core-generated, stable across retries. Providers that support it MUST forward it. */
  readonly idempotencyKey: string;
  /** Caller's own domain reference — opaque to lipay and to the provider (§3.2). */
  readonly reference?: string;
  readonly customer?: { readonly email?: string; readonly name?: string };
  /**
   * Provider-specific extras (M-Pesa needs a phone number; Razorpay a method hint).
   * The escape hatch that keeps rare provider needs OUT of the core input type —
   * this is the seam that stops `lemonSqueezyCustomerPortalUrl` from ever appearing
   * in a shared type (L9).
   */
  readonly providerOptions?: Readonly<Record<string, unknown>>;
}

/**
 * THREE SEPARATE FACTS, three separate fields (L4). This is the direct fix for
 * WooCommerce's `'result' => 'success'` meaning "I successfully produced a URL":
 *   - `ok`     : did the provider accept the request?
 *   - `status` : has money moved?
 *   - `next`   : what must the shopper do?
 * WooCommerce collapsed all three into one string and its own Store API later had to
 * reintroduce `pending` as a fourth status to express what off-site gateways actually are.
 */
export type ProviderChargeResult =
  | {
      readonly ok: true;
      readonly providerRef: string;
      readonly status: "succeeded" | "pending";
      readonly next: ChargeNextAction;
    }
  | { readonly ok: false; readonly error: PaymentError };

export type ChargeNextAction =
  | { readonly kind: "none" }
  | { readonly kind: "redirect"; readonly url: string }
  | {
      readonly kind: "client_action";
      readonly providerId: PaymentProviderId;
      /** Opaque blob handed to that provider's client SDK. */
      readonly payload: Readonly<Record<string, unknown>>;
    }
  | { readonly kind: "out_of_band"; readonly instructions?: string };

/** Mirrors `DeployError`'s shape exactly — typed, never thrown — plus `retryable`. */
export interface PaymentError {
  readonly code: PaymentErrorCode;
  readonly message: string;
  readonly providerStatus?: number;
  /** True = retrying with the SAME idempotency key may succeed. */
  readonly retryable: boolean;
}

export type PaymentErrorCode =
  | "NO_CREDENTIALS_CONFIGURED"     // ← deploy's NO_TOKEN_CONFIGURED
  | "PROVIDER_NOT_REGISTERED"       // ← deploy's TARGET_NOT_IMPLEMENTED, but registry-driven
  | "CAPABILITY_UNSUPPORTED"        // new: the `$supports` check core performs before dispatch
  | "CURRENCY_UNSUPPORTED"          // new: regional providers are currency-bound
  | "INVALID_REQUEST"               // ← deploy's INVALID_CONFIG
  | "DECLINED"                      // new: a payment-specific terminal outcome
  | "TRANSPORT_ERROR"               // ← deploy, verbatim
  | "PROVIDER_ERROR"                // ← deploy, verbatim
  | "IDEMPOTENCY_CONFLICT"          // new: same key, different amount/currency
  | "SIGNATURE_INVALID";            // new: webhook verification failed
```

### 4.4 Normalized inbound events

```ts
export interface ProviderWebhookInput {
  /** EXACT bytes as received. HMAC is computed over these — see C4 and Risk R1. */
  readonly rawBody: Buffer;
  readonly headers: Readonly<Record<string, string>>;
}

export type ProviderWebhookResult =
  | { readonly ok: true; readonly events: readonly NormalizedPaymentEvent[] }
  | { readonly ok: false; readonly error: PaymentError };

export interface NormalizedPaymentEvent {
  /**
   * The provider's own event id. REQUIRED — this is core's inbound idempotency key and
   * the reason Open SaaS's double-credit-grant bug cannot occur here (L7).
   * A provider whose payloads genuinely carry no event id MUST synthesize a deterministic
   * one (e.g. a hash of the raw body); it may not omit this field.
   */
  readonly providerEventId: string;
  /** Correlates to `p_lipay__payments.provider_ref` via the `ref` index. */
  readonly providerRef: string;
  readonly kind: "succeeded" | "failed" | "pending" | "refunded" | "chargeback" | "expired";
  readonly amount?: Money;
  /** Provider-reported event time. Used for out-of-order rejection (§6). */
  readonly occurredAt: number;
}
```

### 4.5 Registry and the plugin's public API

```ts
/**
 * Providers add themselves; core never enumerates them. This is the one thing
 * WooCommerce's `woocommerce_payment_gateways` filter got right, minus its
 * class-name-strings-and-`new $gateway()` execution.
 */
export interface PaymentProviderRegistry {
  register(provider: PaymentProvider): void;
  get(id: PaymentProviderId): PaymentProvider | null;
  list(): readonly PaymentProvider[];
}

export interface LipayApi {
  /** Drives the checkout picker and the admin screen — from capabilities, never a hardcoded list. */
  listProviders(): readonly PaymentProviderSummary[];

  charge(input: ChargeRequest): Promise<ChargeResult>;
  refund(input: RefundRequest): Promise<RefundResult>;

  /** Called by the one core-owned webhook route. Provider-agnostic. */
  handleWebhook(input: {
    readonly providerId: PaymentProviderId;
    readonly rawBody: Buffer;
    readonly headers: Readonly<Record<string, string>>;
  }): Promise<WebhookAck>;

  getPayment(required: { workspaceId: string; id: string }): PaymentRecord | null;
  listPayments(required: { workspaceId: string }, optional?: { limit?: number }): readonly PaymentRecord[];
}

export interface ChargeRequest {
  readonly workspaceId: string;
  readonly providerId: PaymentProviderId;
  readonly amount: Money;
  /** Caller-supplied. Replaying the same key returns the ORIGINAL result, never a second charge. */
  readonly idempotencyKey: string;
  readonly reference?: string;
  readonly customer?: { readonly email?: string; readonly name?: string };
  readonly providerOptions?: Readonly<Record<string, unknown>>;
}

/** 2xx-fast, per WooCommerce's and Open SaaS's shared (correct) instinct — see §6. */
export interface WebhookAck {
  readonly accepted: boolean;
  readonly processed: number;
  readonly duplicates: number;
  readonly error?: PaymentError;
}
```

### 4.6 Activation, mirroring the existing Tier-2 precedent

```ts
export async function activateLipay(
  required: {
    db: Database.Database;
    dbPath: string;
    workspaceId: string;
    httpClient: HttpClientPort;
    credentials: PaymentCredentialsPort;
    providers: readonly PaymentProvider[];
    clock: { now(): number };
    idGen: { newId(): string };
  },
  _optional: Record<string, never> = {}
): Promise<LipayApi> { /* declareDataModule(LIPAY_MANIFEST) → build registry → return API */ }
```

Structurally identical to `activateDeploy`, with `providers` as an injected list rather than a
compiled-in switch, and `clock`/`idGen` injected per C8.

---

## 5. Credentials

```ts
/**
 * Resolves the full credential BUNDLE for one provider.
 *
 * Deliberate deviation from `DeployTokenPort.getToken(target): Promise<string | null>`:
 * a single opaque string cannot hold what a payment provider needs. Stripe needs a secret
 * key AND a webhook signing secret; Lemon Squeezy needs an API key, a webhook secret and a
 * store ID; M-Pesa needs a consumer key, consumer secret, shortcode and passkey. Returning
 * one string would force every provider to invent its own delimiter-packing convention.
 *
 * Also note this returns a bundle for ONE provider rather than exposing a
 * `getToken(anyProvider)` accessor: core resolves it and injects it as `ctx.credentials`,
 * so provider code never holds the port and cannot request a peer's secrets.
 */
export interface PaymentCredentialsPort {
  getCredentials(
    providerId: PaymentProviderId,
    keys: readonly string[]
  ): Promise<Readonly<Record<string, string>> | null>;
}
```

Two adapters, mirroring `EnvDeployTokenKeyring` / `InMemoryDeployTokenKeyring` exactly — the
rule-of-two shape `deploy-plugin.ts`'s header explicitly credits to
`integrations/keyring.env.ts` / `keyring.memory.ts`:

```ts
/** Production: TOVU_PAYMENT_{PROVIDER_ID}_{KEY}, e.g. TOVU_PAYMENT_STRIPE_SECRET_KEY. */
export class EnvPaymentCredentials implements PaymentCredentialsPort { /* … */ }

/** Test/dev double. Holds credentials only in memory, settable per test. */
export class InMemoryPaymentCredentials implements PaymentCredentialsPort { /* … */ }
```

**Why the env var name is *derived*, not mapped.** `deploy-plugin.ts` hardcodes
`ENV_VAR_BY_TARGET: Record<DeployTarget, string>` — a second place that must be edited for every new
target, and a second closed-union leak. Deriving `TOVU_PAYMENT_{PROVIDER}_{KEY}` mechanically from
the provider's declared `credentialKeys` means **adding a provider adds env vars without touching
any code**. This is Open SaaS's `PAYMENTS_*` neutral-naming lesson (L9) applied to the naming
*scheme* rather than to individual names.

**Why not `KeyringPort`.** `src/integrations/ports.ts`'s `KeyringPort` derives secrets via HKDF from
a root key — correct for *outbound webhook signing secrets Tovu itself mints*, wrong for
*externally-issued provider credentials that must round-trip verbatim*. `deploy-plugin.ts`'s header
makes exactly this distinction and points at `SecretSealerPort`'s framing ("unlike signing secrets,
these must round-trip"). Lipay inherits that reasoning unchanged.

**Why credentials never touch `content.db`.** ADR-024's secret invariant plus ADR-012's install-dir
portability: the portable folder must never carry usable secret material. This is the direct
avoidance of L10 / WooCommerce's plaintext `autoload=yes` option row. If per-workspace merchant
credentials are eventually needed (a real multi-tenant requirement — see Risk R6), they go through
`SecretSealerPort` as sealed ciphertext, never plaintext columns.

---

## 6. Webhooks, async confirmation and idempotency

### 6.1 One core-owned route, not one per provider

```
POST /payments/webhook/:providerId
```

A single public, unauthenticated route registered by core. Authentication *is* the provider's
signature verification — that is what `parseWebhook` does, and it is why the route must be
unauthenticated (the provider has no Tovu session).

This is the deliberate inverse of WooCommerce's `do_action('woocommerce_api_' . $api_request)` (L5),
where the hook suffix is a lowercased class name, two plugins can trivially collide on it, and there
is no verification, no routing table, no delivery log. Here `:providerId` is a registry lookup, and a
miss is a typed `PROVIDER_NOT_REGISTERED`.

### 6.2 The raw-body problem must be solved in core — VERIFIED blocker

Per C4, `src/server/app.ts:444` mounts `express.json({ limit: "15mb" })` globally before any route.
HMAC signatures are computed over exact bytes; a parse-then-reserialize round trip changes key order
and whitespace and **will** produce signature mismatches.

Two viable fixes, both requiring a core change outside the plugin (Risk R1):

1. **Mount the webhook route before the blanket parser**, with
   `express.raw({ type: "application/json", limit: "1mb" })`. Cleanest, but requires the route to be
   registered ahead of line 444, which inverts the current module-registration order.
2. **Capture raw bytes in `express.json`'s `verify` hook** —
   `express.json({ limit: "15mb", verify: (req, _res, buf) => { (req as …).rawBody = buf; } })` —
   and let the webhook route read `req.rawBody`. Less invasive, one line, but stashes a buffer on
   every request in the process, and `src/server/middleware/body-size-limit.ts`'s header already
   documents that `body-parser` marks parsed requests so a second `express.json()` silently no-ops —
   worth confirming the interaction before choosing.

Solving this once in core is the direct application of L6: Open SaaS's per-provider
`webhookMiddlewareConfigFn` is byte-identical across all four of its providers, because raw-body
access is a property of webhooks, not of any one provider.

### 6.3 Inbound idempotency: an index, not a code branch

Core's `handleWebhook` sequence:

1. Look up the provider in the registry → `PROVIDER_NOT_REGISTERED` on a miss.
2. Resolve credentials → `NO_CREDENTIALS_CONFIGURED` on a miss.
3. `provider.parseWebhook({ rawBody, headers }, ctx)` → `SIGNATURE_INVALID` on failure.
4. For each returned `NormalizedPaymentEvent`, inside **one** `db.transaction()`:
   - `INSERT` into `p_lipay__events`. The unique index on
     `(provider_id, provider_event_id)` makes a replay fail here. Catch the constraint violation,
     count it as a duplicate, and **stop** — no state transition, no side effect.
   - Correlate `providerRef` → `p_lipay__payments` via the `ref` index.
   - Reject out-of-order application: if `occurred_at` is older than the last applied event for that
     payment, record the row with `applied = 0` and do not transition.
   - Apply the status transition and set `applied = 1`.
5. Return `WebhookAck` and a 2xx, always — including for unrecognized event types.

Contrast with the two studied systems:

- **WooCommerce** guards with `has_status()` at three separate layers, with no transaction spanning
  them and a third-party-filterable guard set. Read-then-write TOCTOU (L7).
- **Open SaaS** has no guard at all, and `credits: { increment: n }` makes replay actively harmful.

Here, replay protection is a database constraint inside a transaction. It cannot be forgotten by a
provider author, because provider authors do not write the persistence code at all (L6).

**Return 2xx even for unhandled event types.** Both studied systems reached this conclusion —
Open SaaS's Stripe handler comments *"We must return a 2XX status code, otherwise Stripe will keep
retrying the event"* — and it is correct. Log-and-accept beats an infinite provider retry storm.

### 6.4 Outbound idempotency

`ChargeRequest.idempotencyKey` is caller-supplied and unique-indexed on
`(workspace_id, idempotency_key)`. Core checks it **before** calling the provider:

- Key exists, same amount/currency → return the stored result. The provider is never called.
- Key exists, different amount/currency → `IDEMPOTENCY_CONFLICT`. This is the case a naive
  "return the stored row" implementation gets wrong.
- Key is new → insert `status = 'pending'`, call the provider, update from the result.

The key is also forwarded to providers that support it (Stripe's `Idempotency-Key` header). VERIFIED:
Open SaaS sets no idempotency header on any outbound call.

### 6.5 The state machine

```
                    ┌──────────────► canceled
                    │
  (charge) ──► pending ──► succeeded ──► partially_refunded ──► refunded
                    │           │
                    └──────► failed
```

Terminal states (`refunded`, `canceled`, `failed`) reject further transitions. `succeeded` never
returns to `pending`. Enforced in code, since `declareDataModule()` supports no `CHECK` constraint
(C1) — see Risk R3.

---

## 7. The flexibility test: adding Stripe

The concrete test of the requirement.

### Does NOT change

| Surface | Why |
|---|---|
| All 3 tables — zero DDL, zero migration | Nothing in the schema names a provider; `provider_id` is a value |
| `LipayApi` — `charge`/`refund`/`handleWebhook`/`listProviders` | Provider-agnostic by construction |
| `PaymentProvider` interface | Stripe is one implementation among N |
| `PaymentProviderId` | An opaque string, not a union to extend (L3) |
| `PaymentError` / `PaymentErrorCode` | Already covers decline, transport, provider, signature |
| `ChargeNextAction` | `client_action` already covers 3DS; `redirect` covers Stripe Checkout |
| The webhook route and its raw-body handling | Registry lookup on `:providerId` |
| Idempotency machinery, inbound and outbound | Core-owned; Stripe's `event.id` populates the same unique index |
| `PaymentCredentialsPort` and both adapters | Env names are derived from `credentialKeys`, not mapped |
| Checkout UI and admin screen | Driven by `listProviders()` + capabilities, never a hardcoded list |

### DOES change

| Change | Size |
|---|---|
| New file `providers/stripe.ts` implementing `PaymentProvider` | 1 new file |
| One `providers: [...]` entry in the composition root | 1 line |
| Two env vars: `TOVU_PAYMENT_STRIPE_SECRET_KEY`, `TOVU_PAYMENT_STRIPE_WEBHOOK_SECRET` | config only, no code |
| Register the webhook URL in the Stripe dashboard | operational |

**One new file, one line.**

### The same test applied to the two studied systems

- **Open SaaS adding Paddle** (VERIFIED from PR #714): patch `| "paddle"` into the core interface's
  closed union; add `paymentProcessorId` to the *client-facing* `CheckoutSession` type; add
  `if (checkoutSession.paymentProcessorId === "paddle")` to `PricingPage.tsx`; return
  `url: transaction.checkout?.url ?? ""` — an empty string to satisfy a contract Paddle cannot honor;
  add a fourth byte-identical `webhookMiddlewareConfigFn`. **Five edits to shared code, one of them
  in the UI.**

- **`deploy-plugin.ts` adding Netlify** (VERIFIED by inspection): edit the `DeployTarget` union; edit
  the `ENV_VAR_BY_TARGET` record; edit the `if (target === "vercel")` dispatch in `deploy()`.
  **Three edits to core plugin code**, plus every `Record<DeployTarget, …>` in the file becomes a
  compile error until updated. Fine for four fixed hosting targets; not fine for an open-ended set of
  regional payment providers.

- **WooCommerce adding a gateway:** one filter callback, no core edits — the registry model is
  genuinely open. But three separate artifacts are needed for a modern checkout (§1.1, L-evidence
  G), reunited only by an unchecked string.

Lipay takes WooCommerce's open registry, Open SaaS's typed interface and neutral indirection, and
Medusa's webhook inversion — while avoiding each one's specific failure.

---

## 8. Verdict on mirroring `deploy-plugin.ts`

The task asked explicitly whether lipay should mirror `DeployApi.deploy(target, config)` with
`PaymentProvider` in place of `DeployTarget`. **Answer: keep four things, deviate on three.**

### Keep verbatim

1. **Typed result/error union, never throw out of the public API.** `DeployResult` / `DeployError` /
   `DeployErrorCode` is the right shape and lipay copies it directly. The header's own discipline —
   *"every failure mode … is a typed `DeployError`, never a thrown exception out of `deploy()`"* — is
   exactly right for payments, where an uncaught throw mid-charge is a lost transaction.
2. **The guarded `HttpClientPort` seam, never a raw `fetch`.** Non-negotiable (C3).
3. **The rule-of-two credential shape**: an env-var-backed production adapter plus an in-memory test
   double behind one small port. Lipay changes the port's *signature*, not this shape.
4. **`declareDataModule()` + dedicated connection + `journal_mode = WAL` + `busy_timeout = 5000`**
   (C7) — the busy-timeout was added after a real, reproducible boot failure. Copy it.

### Deviate

1. **Replace the closed `DeployTarget` union and the `if (target === "vercel")` dispatch with a
   registry.** This is the entire flexibility requirement. A closed union means every provider is a
   core edit, and Open SaaS's Paddle PR is the empirical proof of where that ends. `deploy-plugin.ts`
   is *right* for four fixed hosting targets Tovu chose in advance; payments are an open-ended set
   the user has explicitly said will grow with regional providers.

2. **Replace `DeployTokenPort.getToken(target): Promise<string | null>` with a per-provider
   credential bundle, pre-resolved by core.** Three reasons: one opaque string cannot carry
   `{secretKey, webhookSecret, merchantId, passkey}`; the hardcoded `ENV_VAR_BY_TARGET` map is a
   second closed-union leak; and handing provider code a port that can fetch *any* provider's token
   is a needless isolation weakness when core can resolve and inject just the one bundle (§5).

3. **Payments need a materially different lifecycle shape, which deploy does not model at all.**
   Deploy is fire-and-forget: one call, one typed result, a two-state (`triggered`/`failed`) history
   row, and Vercel's eventual build outcome is simply never learned. For payments the *authoritative*
   answer arrives asynchronously and may contradict the synchronous one. Four things follow that
   deploy has no analogue for:
   - **Async confirmation** — the `pending` status and the `out_of_band` next-action are the normal
     case for M-Pesa, PIX, boleto and bank transfer, not an edge case.
   - **Idempotency on charge attempts** — deploy triggering twice wastes a build; charging twice takes
     someone's money twice.
   - **An inbound event log** — `p_lipay__events` has no deploy counterpart, and it is what makes
     replay protection a constraint rather than a convention.
   - **Capability variance** — deploy targets are near-interchangeable; payment providers are not,
     which is why the `capabilities` object exists (L1).

So: same *idioms*, different *shape*. `deploy-plugin.ts` is the right stylistic template and the
wrong structural one.

---

## 9. Open risks and unresolved questions

Flagged honestly rather than glossed, per the anti-hallucination policy.

**R1 — The raw-body blocker is real and unresolved, and it requires a core change.** VERIFIED at
`src/server/app.ts:444`. Neither fix in §6.2 is free: option 1 inverts module registration order;
option 2 stashes a buffer on every request and interacts with
`src/server/middleware/body-size-limit.ts`'s documented `body-parser` re-parse no-op, which I did not
test. **This needs a human decision before implementation starts.** Without it, HMAC verification is
impossible and lipay cannot securely accept a webhook from any provider.

**R2 — The ADR-023 / ADR-026 grammar conflict is real, unenforced, and already violated.** VERIFIED:
`data-module.ts`'s `IDENT` permits underscores and forbids hyphens; ADR-026 mandates
`^[a-z0-9]+(-[a-z0-9]+)*$` (no underscore, hyphens allowed) for both `pluginId` and every
`tableName`, to preserve namespace injectivity against a cross-plugin isolation bypass. Existing
plugins already violate it (`p_comments__moderation_log`, `p_newsletter__audience_snapshots`,
`p_newsletter__confirmation_tokens`). My §3 recommendation complies with both by using single-word
names, which is free for a greenfield plugin. **Unresolved:** is ADR-026's grammar ever going to be
enforced in `data-module.ts`, and if so, what happens to the existing violators? Not my call to make
here, but lipay should not add to the pile.

**R3 — `declareDataModule()` cannot enforce the invariants that matter most.** No `CHECK`, no
`DEFAULT`, no composite primary key, no foreign keys (C1). So `amount_minor >= 0`,
`amount_refunded_minor <= amount_minor`, currency-code validity, and the §6.5 status machine are all
code-enforced only. This is safe *today* because lipay is the single writer through one connection,
matching the ADR-031 §2 "chokepoint-validated, not FK-enforced (v1)" precedent — but it is a real
ceiling, and it is money.

**R4 — ADR-026's atomic multi-write primitive is not implemented.** VERIFIED by grep. Lipay's
atomicity therefore rests on holding a direct handle and calling `db.transaction()`, exactly as
`store-plugin.ts` does. `store-plugin.ts`'s own comment states the constraint precisely: *"A real
Tier-3 plugin behind the frozen async ABI (ADR-024 §3) CANNOT hold a transaction across the seam."*
If lipay is ever sandboxed or moved behind that ABI, its webhook-apply transaction breaks and it will
need the ADR-026 primitive. **This design assumes Tier-2 with a direct handle for the foreseeable
future.**

**R5 — What *is* "lipay", exactly? I resolved an ambiguity and want it confirmed.** The brief says
lipay is a payment plugin, and separately that "lipay itself, then paypal/stripe" would be added as
new cases. I have treated `lipay` as **the payments framework plugin** (registry, tables, webhook
route, idempotency), with any first-party "lipay" gateway being simply *one registered
`PaymentProvider` among N*, structurally identical to Stripe. If instead lipay is meant to be a
single specific gateway with no framework role, most of §4 is over-built. **This is the one design
question I could not resolve from available evidence.**

**R6 — Per-workspace merchant credentials are not designed.** §5 resolves credentials per *provider*
from environment variables — install-wide. A genuinely multi-tenant Tovu where each workspace holds
its own Stripe account needs per-workspace credentials, which means sealed storage via
`SecretSealerPort` and a `(workspace_id, provider_id)` credential lookup. `EnvPaymentCredentials`
cannot express that. **Deferred deliberately, but the `PaymentCredentialsPort` signature would need a
`workspaceId` parameter to accommodate it later — worth adding now while it is free**, since
ADR-005's semver promise makes it expensive afterwards.

**R7 — Currency handling is specified but not fully solved.** §3.1 fixes the representation
(minor units + ISO-4217). Unresolved: where the minor-unit scale table lives (zero-decimal JPY/KRW,
three-decimal KWD/BHD/JOD); whether `amount_minor` is presentment or settlement currency; and what
happens when a provider settles in a different currency than it was charged in. FX is entirely out of
scope and would need its own design.

**R8 — PCI scope is asserted, not verified.** Every `ChargeNextActionKind` I recommend keeps card
data out of Tovu — redirect, client-side SDK, or out-of-band. No PAN ever transits a Tovu process,
which should keep the install in SAQ-A / SAQ-A-EP territory. **I have not verified this against any
compliance requirement the user actually has**, and the design would change materially if direct PAN
capture were ever required (it should not be).

**R9 — Webhook endpoint hardening is unspecified.** The route is public and unauthenticated by
necessity. It needs a body-size cap well below 15 MB, rate limiting (`RouteDeps.formsRateLimiter`
shows the existing pattern), and a decision on retention/redaction for `p_lipay__events.payload`,
which stores raw provider bodies. No existing Tovu route is an exact precedent —
`newsletter-confirm.ts` is token-in-URL, which is a different trust model.

**R10 — Out-of-order webhook rejection is designed but unvalidated.** §6.3 rejects events whose
`occurredAt` predates the last applied event. Open SaaS has no ordering guard at all, so there is no
prior art to copy here. I have not validated this against any specific provider's actual delivery and
timestamp semantics, and a provider that emits coarse or non-monotonic timestamps would break it.

**R11 — `parseWebhook` returning multiple events is speculative.** I typed it as
`readonly NormalizedPaymentEvent[]` to accommodate batched deliveries. I did not verify that any
target provider actually batches. If none do, this is unnecessary surface — though it is cheap and
narrowing it later is a breaking change, so I would keep it.

**R12 — Research currency and provenance.** Upstream findings are from WooCommerce `trunk` (≥ 10.9)
and `wasp-lang/open-saas` HEAD `9ee052af` (2026-07-24), both read on 2026-07-30. Three specific
items I could not verify: WordPress Trac #61706 (HTTP 403 on fetch — title from search metadata
only); the claim that `manage_woocommerce` exposes gateway secrets in the admin UI (sourced to
Snicco's blog, not confirmed in code); and Medusa's internals (docs only, no source read). The Saleor
comparison was dropped from §1.3 for exactly this reason. Note also that Open SaaS's Paddle PR #714
is authored by a Paddle employee and was written with Claude Code — weight it accordingly, though its
*diff* is direct evidence regardless of authorship.

---

## 10. Handoff contract

**Inputs used**
- `AI-Dev-Shop/AGENTS.md`; `AI-Dev-Shop/agents/software-architect/skills.md`
- Repository files listed in §0
- `ADS-memory/reports/architecture/ADR-026-core-mediated-atomic-multi-write.md`
- Upstream: WooCommerce `trunk` source + developer.woocommerce.com; `wasp-lang/open-saas`
  `9ee052af` + docs.opensaas.sh; Medusa v2 provider reference (docs only)

**Output summary**
A provider-registry architecture for lipay: three namespaced tables
(`p_lipay__payments` / `events` / `refunds`), a `PaymentProvider` port with typed capability
declaration and an open (non-union) provider ID, core-owned webhook normalization and idempotency,
and per-provider credential bundles resolved from derived environment variable names. Adding Stripe
costs one new file and one registration line.

**Not produced (and why)**
No ADR was written — this is a review/research deliverable, not a Pipeline Mode ADR stage, and no
approved spec exists to anchor a Constitution Check or Planning Preflight against. If this
recommendation is accepted, the natural next artifact is a spec, then a pipeline ADR under
`ADS-memory/reports/pipeline/`. No Implementation Outline or Critical Internal Constraints record
was produced for the same reason; note that §6.3's idempotency-and-ordering sequence and §6.5's
state machine would both be strong `critical-internal-constraints` candidates at that stage.

**Risks** — see §9. **R1 (raw body) and R5 (what lipay is) are blocking for implementation.**

**Suggested next assignee** — Coordinator, to (a) get R5 answered by the user, (b) route R1 to a
core decision on body parsing, then (c) dispatch Spec Agent for the lipay feature spec.

**Compliance** — No code changed. No git operation performed. Read-only inspection of the working
tree; no files written outside this document.
