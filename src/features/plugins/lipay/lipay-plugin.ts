/**
 * @file lipay — the payments framework plugin (architecture review §3/§4/§6).
 *
 * Role: what WooCommerce is, not what one gateway is. lipay owns the tables, the public API, the
 * idempotency machinery and the webhook normalization; concrete gateways — including the
 * first-party `lipay` gateway in `providers/lipay-gateway.ts` — are `PaymentProvider`
 * implementations registered into it. The design property this file exists to make true:
 *
 *   Adding a payment provider requires exactly ONE new file and ONE registration line, with zero
 *   edits to lipay's tables, public API, error union, or webhook route.
 *
 * Kept verbatim from `deploy-plugin.ts` (the established Tier-2 template): typed result/error
 * unions that never throw out of the public API; the guarded `HttpClientPort` seam, never a raw
 * `fetch`; the rule-of-two credential shape; and `declareDataModule()` + a dedicated connection +
 * `journal_mode = WAL` + `busy_timeout = 5000` (that last pragma was added there after a live
 * multi-boot smoke test found deterministic `SQLITE_BUSY` failures — see `store-plugin.ts`'s
 * `bootstrapStore` header).
 *
 * Deviating from it on three points, deliberately. (1) An open registry replaces the closed
 * `DeployTarget` union and its `if (target === "vercel")` dispatch — a closed union makes every
 * provider a core edit. (2) A per-provider credential BUNDLE replaces `getToken(target)`, since one
 * opaque string cannot carry `{secretKey, webhookSecret, merchantId, passkey}`. (3) Payments need a
 * lifecycle deploy does not model at all: deploy is fire-and-forget with a two-state history row
 * and never learns the eventual build outcome, whereas for payments the AUTHORITATIVE answer
 * arrives asynchronously and may contradict the synchronous one. Hence `pending`, the inbound event
 * log, and idempotency on both directions — deploy triggering twice wastes a build; charging twice
 * takes someone's money twice.
 *
 * Observability: this repo has no logger/telemetry port for feature code to depend on (verified —
 * neither `store-plugin.ts` nor `deploy-plugin.ts` has one either). `p_lipay__events` and
 * `p_lipay__payments`/`p_lipay__refunds` ARE the durable record: every inbound provider
 * notification is persisted verbatim with its verification outcome, and every outbound attempt is a
 * row. Wiring a real telemetry seam is left for when one exists.
 */
import Database from "better-sqlite3";

import type { HttpClientPort } from "#src/http/index";
import { declareDataModule, type DataModuleDecl } from "../data-module.js";
import { createPaymentProviderRegistry } from "./registry.js";
import { canTransition, isTerminalPaymentStatus, statusForEventKind, type PaymentStatus } from "./state-machine.js";
import type {
  ChargeNextAction,
  Money,
  NormalizedPaymentEvent,
  PaymentCredentialsPort,
  PaymentError,
  PaymentProvider,
  PaymentProviderCapabilities,
  PaymentProviderId,
  ProviderChargeInput,
  ProviderContext,
} from "./ports.js";

export const LIPAY_PLUGIN_ID = "lipay";

const PAYMENTS = `p_${LIPAY_PLUGIN_ID}__payments`;
const EVENTS = `p_${LIPAY_PLUGIN_ID}__events`;
const REFUNDS = `p_${LIPAY_PLUGIN_ID}__refunds`;

/** The public path the core-owned webhook route is mounted on. One route, every provider. */
export const WEBHOOK_ROUTE_PATH = "/payments/webhook/:providerId";

export const webhookUrlFor = (baseUrl: string, providerId: PaymentProviderId): string =>
  `${baseUrl.replace(/\/+$/, "")}/payments/webhook/${providerId}`;

/**
 * Three tables, namespaced by core as `p_lipay__*`. Single-word short names deliberately: ADR-023's
 * `data-module.ts` grammar permits underscores and forbids hyphens, while ADR-026 mandates
 * `^[a-z0-9]+(-[a-z0-9]+)*$` with no underscore anywhere. The two are mutually exclusive except on
 * their intersection — single-segment names with no separator — which is free for a greenfield
 * plugin and is the only shape that satisfies both (review R2).
 *
 * Deliberately absent: no `providers` table (providers are code plus environment credentials, never
 * rows — a provider must not be enablable by a database write, the direct inverse of WooCommerce's
 * `woocommerce_{id}_settings` option row); no card data, PAN or tokens; and no `orders` table,
 * because lipay is a payments plugin, not a commerce plugin.
 */
export const LIPAY_MANIFEST: DataModuleDecl = {
  pluginId: LIPAY_PLUGIN_ID,
  pluginTier: "tier-2",
  provenance: { sourceUrl: "builtin://lipay", publisher: "tovu-core" },
  tables: [
    {
      // One row per payment attempt (the "intent"), provider-agnostic.
      name: "payments",
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        { name: "workspace_id", type: "TEXT", notNull: true },
        { name: "provider_id", type: "TEXT", notNull: true },
        // Caller-supplied. The outbound idempotency guard.
        { name: "idempotency_key", type: "TEXT", notNull: true },
        { name: "status", type: "TEXT", notNull: true },
        // Integer minor units. NEVER a float, NEVER "cents": JPY/KRW have zero decimal places,
        // KWD/BHD/JOD have three, so the scale is a property of the currency, not a constant 100.
        { name: "amount_minor", type: "INTEGER", notNull: true },
        { name: "currency", type: "TEXT", notNull: true },
        { name: "amount_refunded_minor", type: "INTEGER", notNull: true },
        // The provider's own charge id. Null until the provider responds.
        { name: "provider_ref", type: "TEXT" },
        // The CALLER's domain reference (order id, invoice id, membership id, …). lipay
        // deliberately never learns what it points at — an `order_id` column would couple
        // payments to one commerce model and lock out a membership or donations plugin.
        { name: "reference", type: "TEXT" },
        { name: "created_at", type: "INTEGER", notNull: true },
        { name: "updated_at", type: "INTEGER", notNull: true },
        { name: "last_error", type: "TEXT" },
      ],
      indexes: [
        // Outbound replay protection: a retried charge with the same key hits this, not the provider.
        { name: "idem", columns: ["workspace_id", "idempotency_key"], unique: true },
        // Webhook → payment correlation. This is the lookup WooCommerce indexed but never exposed,
        // leaving every gateway to reimplement correlation its own way.
        { name: "ref", columns: ["provider_id", "provider_ref"] },
        { name: "wsstatus", columns: ["workspace_id", "status", "created_at"] },
      ],
    },
    {
      // Every inbound provider notification, verified and normalized.
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
        // 0/1 — the declared type set has no BOOLEAN.
        { name: "applied", type: "INTEGER", notNull: true },
        { name: "payload", type: "TEXT", notNull: true },
      ],
      indexes: [
        // Replay of an already-seen event fails at the INSERT, not in a code branch a provider
        // author could forget to write.
        { name: "dedupe", columns: ["provider_id", "provider_event_id"], unique: true },
        { name: "bypayment", columns: ["payment_id", "occurred_at"] },
      ],
    },
    {
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

export interface PaymentRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly providerId: PaymentProviderId;
  readonly idempotencyKey: string;
  readonly status: PaymentStatus;
  readonly amount: Money;
  readonly amountRefundedMinor: number;
  readonly providerRef: string | null;
  readonly reference: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lastError: string | null;
}

export type RefundStatus = "pending" | "succeeded" | "failed";

export interface RefundRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly paymentId: string;
  readonly idempotencyKey: string;
  readonly providerRef: string | null;
  readonly amount: Money;
  readonly status: RefundStatus;
  readonly reason: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** What a checkout picker or admin screen renders from — never a hardcoded provider list. */
export interface PaymentProviderSummary {
  readonly id: PaymentProviderId;
  readonly displayName: string;
  readonly capabilities: PaymentProviderCapabilities;
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

export type ChargeResult =
  | {
      readonly ok: true;
      readonly payment: PaymentRecord;
      /**
       * What the shopper must do next — `null` on an idempotent replay. The next-action is
       * transport state, not payment state, and §3's schema has no column for it, so a replayed
       * request can return the authoritative payment record but not reconstruct the original
       * redirect URL or SDK payload. Disclosed rather than silently papered over; a caller that
       * needs replay-safe resumption must persist the first response itself.
       */
      readonly next: ChargeNextAction | null;
      /** True when the idempotency key matched an existing payment and no provider call was made. */
      readonly replayed: boolean;
    }
  | { readonly ok: false; readonly error: PaymentError; readonly payment: PaymentRecord | null };

export interface RefundRequest {
  readonly workspaceId: string;
  readonly paymentId: string;
  readonly idempotencyKey: string;
  /** Omitted = refund the full remaining amount. */
  readonly amount?: Money;
  readonly reason?: string;
}

export type RefundResult =
  | { readonly ok: true; readonly refund: RefundRecord; readonly payment: PaymentRecord; readonly replayed: boolean }
  | { readonly ok: false; readonly error: PaymentError };

/** 2xx-fast: log-and-accept beats an infinite provider retry storm. */
export interface WebhookAck {
  readonly accepted: boolean;
  readonly processed: number;
  readonly duplicates: number;
  readonly error?: PaymentError;
}

export interface LipayApi {
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

interface PaymentRow {
  id: string;
  workspace_id: string;
  provider_id: string;
  idempotency_key: string;
  status: string;
  amount_minor: number;
  currency: string;
  amount_refunded_minor: number;
  provider_ref: string | null;
  reference: string | null;
  created_at: number;
  updated_at: number;
  last_error: string | null;
}

interface RefundRow {
  id: string;
  workspace_id: string;
  payment_id: string;
  idempotency_key: string;
  provider_ref: string | null;
  amount_minor: number;
  currency: string;
  status: string;
  reason: string | null;
  created_at: number;
  updated_at: number;
}

const toPaymentRecord = (row: PaymentRow): PaymentRecord => ({
  id: row.id,
  workspaceId: row.workspace_id,
  providerId: row.provider_id,
  idempotencyKey: row.idempotency_key,
  status: row.status as PaymentStatus,
  amount: { minorUnits: row.amount_minor, currency: row.currency },
  amountRefundedMinor: row.amount_refunded_minor,
  providerRef: row.provider_ref,
  reference: row.reference,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastError: row.last_error,
});

const toRefundRecord = (row: RefundRow): RefundRecord => ({
  id: row.id,
  workspaceId: row.workspace_id,
  paymentId: row.payment_id,
  idempotencyKey: row.idempotency_key,
  providerRef: row.provider_ref,
  amount: { minorUnits: row.amount_minor, currency: row.currency },
  status: row.status as RefundStatus,
  reason: row.reason,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const error = (
  code: PaymentError["code"],
  message: string,
  optional: { retryable?: boolean; providerStatus?: number } = {}
): PaymentError => ({
  code,
  message,
  retryable: optional.retryable ?? false,
  ...(optional.providerStatus === undefined ? {} : { providerStatus: optional.providerStatus }),
});

const CURRENCY = /^[A-Z]{3}$/;

/** Structural money validation. Currency-specific minor-unit scale is out of scope (review R7). */
function invalidAmount(amount: Money): string | null {
  if (!CURRENCY.test(amount.currency)) return `currency must be an uppercase ISO-4217 alpha-3 code, got '${amount.currency}'`;
  if (!Number.isSafeInteger(amount.minorUnits)) return "amount.minorUnits must be a safe integer number of minor units";
  if (amount.minorUnits <= 0) return "amount.minorUnits must be greater than zero";
  return null;
}

function supportsCurrency(capabilities: PaymentProviderCapabilities, currency: string): boolean {
  return capabilities.currencies === "any" || capabilities.currencies.includes(currency);
}

/**
 * A UNIQUE-index collision, as opposed to any other SQLite failure. This is the whole inbound
 * idempotency mechanism: replay protection is a database constraint inside a transaction, not a
 * status guard a provider author has to remember to write.
 */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT");
}

/** The three request-shape checks `charge()` needs before it may touch the database at all. */
function validateChargeInput(provider: PaymentProvider, input: ChargeRequest): PaymentError | null {
  if (input.idempotencyKey.trim().length === 0) {
    return error("INVALID_REQUEST", "idempotencyKey must be a non-empty string");
  }
  const amountProblem = invalidAmount(input.amount);
  if (amountProblem) return error("INVALID_REQUEST", amountProblem);
  if (!supportsCurrency(provider.capabilities, input.amount.currency)) {
    return error("CURRENCY_UNSUPPORTED", `provider '${provider.id}' does not accept ${input.amount.currency}`);
  }
  return null;
}

/** Outbound idempotency: `undefined` when no row exists yet, otherwise the final `ChargeResult`
 * for the replay (a mismatched request is a conflict, a matching one is the original payment). */
function resolveExistingCharge(existing: PaymentRow | undefined, input: ChargeRequest): ChargeResult | undefined {
  if (!existing) return undefined;
  const sameRequest =
    existing.provider_id === input.providerId &&
    existing.amount_minor === input.amount.minorUnits &&
    existing.currency === input.amount.currency;
  if (!sameRequest) {
    return {
      ok: false,
      payment: toPaymentRecord(existing),
      error: error(
        "IDEMPOTENCY_CONFLICT",
        `idempotency key '${input.idempotencyKey}' was already used for a different provider/amount/currency`
      ),
    };
  }
  return { ok: true, payment: toPaymentRecord(existing), next: null, replayed: true };
}

/** Shapes the outbound `ProviderChargeInput`, dropping the optional fields the caller omitted
 * rather than forwarding them as `undefined`. */
function buildChargeProviderRequest(input: ChargeRequest): ProviderChargeInput {
  return {
    amount: input.amount,
    // The caller's key, forwarded verbatim to providers that support it (Stripe's
    // `Idempotency-Key` header), so a retry is deduplicated on BOTH sides of the seam.
    idempotencyKey: input.idempotencyKey,
    ...(input.reference === undefined ? {} : { reference: input.reference }),
    ...(input.customer === undefined ? {} : { customer: input.customer }),
    ...(input.providerOptions === undefined ? {} : { providerOptions: input.providerOptions }),
  };
}

/** A refund is only legal from a payment that has settled money to refund in the first place. */
function validateRefundStatus(payment: PaymentRecord): PaymentError | null {
  if (payment.status !== "succeeded" && payment.status !== "partially_refunded") {
    return error("INVALID_REQUEST", `a payment in status '${payment.status}' cannot be refunded`);
  }
  return null;
}

/**
 * Resolves the refund amount (defaulting to "everything still remaining") and every money
 * invariant it must satisfy: well-formed, same currency as the payment, not more than what
 * remains, and — for a "full refunds only" provider — not a partial amount at all.
 */
function resolveRefundAmount(
  input: RefundRequest,
  payment: PaymentRecord,
  provider: PaymentProvider
): { ok: true; amount: Money } | { ok: false; error: PaymentError } {
  const remaining = payment.amount.minorUnits - payment.amountRefundedMinor;
  const amount = input.amount ?? { minorUnits: remaining, currency: payment.amount.currency };

  const amountProblem = invalidAmount(amount);
  if (amountProblem) return { ok: false, error: error("INVALID_REQUEST", amountProblem) };
  if (amount.currency !== payment.amount.currency) {
    return {
      ok: false,
      error: error(
        "CURRENCY_UNSUPPORTED",
        `refund currency ${amount.currency} does not match the payment's ${payment.amount.currency}`
      ),
    };
  }
  // The aggregate invariant `amount_refunded_minor <= amount_minor`, which the schema itself
  // cannot express (no CHECK constraint in the declared grammar).
  if (amount.minorUnits > remaining) {
    return {
      ok: false,
      error: error(
        "INVALID_REQUEST",
        `refund of ${amount.minorUnits} exceeds the ${remaining} still refundable on payment ${payment.id}`
      ),
    };
  }
  if (provider.capabilities.refunds === "full" && amount.minorUnits !== payment.amount.minorUnits) {
    return { ok: false, error: error("CAPABILITY_UNSUPPORTED", `provider '${provider.id}' supports full refunds only`) };
  }
  return { ok: true, amount };
}

/** Inbound refund idempotency — same shape as `resolveExistingCharge`, one layer down. */
function resolveExistingRefund(
  existing: RefundRow | undefined,
  input: RefundRequest,
  amount: Money,
  payment: PaymentRecord
): RefundResult | undefined {
  if (!existing) return undefined;
  const sameRequest =
    existing.payment_id === input.paymentId && existing.amount_minor === amount.minorUnits && existing.currency === amount.currency;
  if (!sameRequest) {
    return {
      ok: false,
      error: error("IDEMPOTENCY_CONFLICT", `idempotency key '${input.idempotencyKey}' was already used for a different refund`),
    };
  }
  return { ok: true, refund: toRefundRecord(existing), payment, replayed: true };
}

/** How much of `event`'s refund applies — the event's own amount when it carries one, otherwise
 * "the whole charge" (a provider that reports refunds without a partial amount). */
function incomingRefundAmount(event: NormalizedPaymentEvent, paymentRow: PaymentRow): number {
  return event.amount?.minorUnits ?? paymentRow.amount_minor;
}

/**
 * Pure decision: given an already-persisted event, should it actually move the payment forward?
 * `apply: false` covers every reason it should not (stale ordering, a terminal payment, or a
 * transition the state machine itself rejects) — `applyEvent()` treats all three identically
 * (`"recorded"`), so this collapses them into one result shape instead of one branch each.
 */
function computeEventTransition(
  paymentRow: PaymentRow,
  event: NormalizedPaymentEvent,
  lastAppliedAt: number | null
): { apply: false } | { apply: true; next: PaymentStatus; refundedTotal: number } {
  if (lastAppliedAt !== null && event.occurredAt < lastAppliedAt) return { apply: false };

  const current = paymentRow.status as PaymentStatus;
  if (isTerminalPaymentStatus(current)) return { apply: false };

  const refundedTotal =
    event.kind === "refunded"
      ? Math.min(paymentRow.amount_refunded_minor + incomingRefundAmount(event, paymentRow), paymentRow.amount_minor)
      : paymentRow.amount_refunded_minor;

  const next = statusForEventKind(event.kind, { refundedMinor: refundedTotal, totalMinor: paymentRow.amount_minor });
  if (next === null || !canTransition(current, next)) return { apply: false };

  return { apply: true, next, refundedTotal };
}

/**
 * Declare lipay's tables through core (snapshot → DDL) and return the payments API.
 *
 * Structurally identical to `activateDeploy`, with `providers` injected as a list rather than
 * compiled into a switch, and `clock`/`idGen` injected rather than `Date.now()`/`Math.random()`
 * inline as both existing plugin spikes do — for money, ordering and idempotency keys, ambient
 * nondeterminism is worse than it is for deploys.
 *
 * `webhookBaseUrl` and `returnUrl` are required beyond the review's §4.6 parameter list because
 * §4.3's `ProviderContext` mandates both and neither can be derived inside the plugin: the
 * externally reachable origin is a deployment fact.
 */
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
    webhookBaseUrl: string;
    returnUrl: string;
  },
  _optional: Record<string, never> = {}
): Promise<LipayApi> {
  const { db, dbPath, workspaceId, httpClient, credentials, providers, clock, idGen, webhookBaseUrl, returnUrl } =
    required;

  const declaration = await declareDataModule({ db, dbPath, decl: LIPAY_MANIFEST });
  if (!declaration.ok) {
    throw new Error(`lipay dataModule declaration failed: ${declaration.error?.code} — ${declaration.error?.message}`);
  }

  const registry = createPaymentProviderRegistry(providers);

  const contextFor = (provider: PaymentProvider, resolved: Readonly<Record<string, string>>): ProviderContext => ({
    credentials: resolved,
    httpClient,
    now: () => clock.now(),
    webhookUrl: webhookUrlFor(webhookBaseUrl, provider.id),
    returnUrl,
  });

  const selectPaymentById = db.prepare(`SELECT * FROM "${PAYMENTS}" WHERE workspace_id = ? AND id = ?`);
  const selectPaymentByKey = db.prepare(`SELECT * FROM "${PAYMENTS}" WHERE workspace_id = ? AND idempotency_key = ?`);
  const selectPaymentByRef = db.prepare(
    `SELECT * FROM "${PAYMENTS}" WHERE provider_id = ? AND provider_ref = ? AND workspace_id = ?`
  );
  const selectRefundByKey = db.prepare(`SELECT * FROM "${REFUNDS}" WHERE workspace_id = ? AND idempotency_key = ?`);

  const selectPaymentByRowId = db.prepare(`SELECT * FROM "${PAYMENTS}" WHERE id = ?`);

  const readPayment = (id: string): PaymentRecord | null => {
    const row = selectPaymentByRowId.get(id) as PaymentRow | undefined;
    return row ? toPaymentRecord(row) : null;
  };

  async function resolveCredentials(
    provider: PaymentProvider,
    scope: string
  ): Promise<Readonly<Record<string, string>> | null> {
    return credentials.getCredentials({ workspaceId: scope, providerId: provider.id, keys: provider.credentialKeys });
  }

  /**
   * Inserts the pending payment row, absorbing the race where a concurrent request holding the
   * same idempotency key wins the UNIQUE index first (see the module-level idempotency contract).
   */
  function insertPendingPayment(
    id: string,
    input: ChargeRequest,
    createdAt: number
  ): { kind: "inserted" } | { kind: "raced"; row: PaymentRow } {
    try {
      db.prepare(
        `INSERT INTO "${PAYMENTS}" (id, workspace_id, provider_id, idempotency_key, status, amount_minor, currency,
           amount_refunded_minor, provider_ref, reference, created_at, updated_at, last_error)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, 0, NULL, ?, ?, ?, NULL)`
      ).run(
        id,
        input.workspaceId,
        input.providerId,
        input.idempotencyKey,
        input.amount.minorUnits,
        input.amount.currency,
        input.reference ?? null,
        createdAt,
        createdAt
      );
      return { kind: "inserted" };
    } catch (err) {
      // Lost the race to a concurrent request holding the same key — the unique index is the
      // arbiter, so re-read and treat it as the replay it is.
      if (isUniqueViolation(err)) {
        const raced = selectPaymentByKey.get(input.workspaceId, input.idempotencyKey) as PaymentRow | undefined;
        if (raced) return { kind: "raced", row: raced };
      }
      throw err;
    }
  }

  async function charge(input: ChargeRequest): Promise<ChargeResult> {
    const provider = registry.get(input.providerId);
    if (!provider) {
      return {
        ok: false,
        payment: null,
        error: error("PROVIDER_NOT_REGISTERED", `no payment provider registered for '${input.providerId}'`),
      };
    }

    const validationError = validateChargeInput(provider, input);
    if (validationError) {
      return { ok: false, payment: null, error: validationError };
    }

    // Outbound idempotency, checked BEFORE the provider is called. The case a naive
    // "just return the stored row" implementation gets wrong is the second branch.
    const existing = selectPaymentByKey.get(input.workspaceId, input.idempotencyKey) as PaymentRow | undefined;
    const existingResult = resolveExistingCharge(existing, input);
    if (existingResult) return existingResult;

    const resolved = await resolveCredentials(provider, input.workspaceId);
    if (!resolved) {
      // Nothing is persisted: a payment that could never be attempted is not a payment attempt.
      return {
        ok: false,
        payment: null,
        error: error("NO_CREDENTIALS_CONFIGURED", `no credentials configured for payment provider '${provider.id}'`),
      };
    }

    const id = idGen.newId();
    const createdAt = clock.now();
    const insertOutcome = insertPendingPayment(id, input, createdAt);
    if (insertOutcome.kind === "raced") {
      return { ok: true, payment: toPaymentRecord(insertOutcome.row), next: null, replayed: true };
    }

    const result = await provider.createCharge(buildChargeProviderRequest(input), contextFor(provider, resolved));

    const updatedAt = clock.now();
    if (!result.ok) {
      db.prepare(`UPDATE "${PAYMENTS}" SET status = 'failed', updated_at = ?, last_error = ? WHERE id = ?`).run(
        updatedAt,
        `${result.error.code}: ${result.error.message}`,
        id
      );
      return { ok: false, payment: readPayment(id), error: result.error };
    }

    db.prepare(`UPDATE "${PAYMENTS}" SET status = ?, provider_ref = ?, updated_at = ? WHERE id = ?`).run(
      result.status,
      result.providerRef,
      updatedAt,
      id
    );
    const payment = readPayment(id);
    if (!payment) throw new Error(`lipay: payment ${id} vanished immediately after write`);
    return { ok: true, payment, next: result.next, replayed: false };
  }

  /** Provider lookup plus its refund-capability gate — the two checks every refund needs before
   * anything else can be resolved. */
  function resolveRefundProvider(payment: PaymentRecord): { ok: true; provider: PaymentProvider } | { ok: false; error: PaymentError } {
    const provider = registry.get(payment.providerId);
    if (!provider) {
      return { ok: false, error: error("PROVIDER_NOT_REGISTERED", `no payment provider registered for '${payment.providerId}'`) };
    }
    if (provider.capabilities.refunds === "none" || typeof provider.refund !== "function") {
      return { ok: false, error: error("CAPABILITY_UNSUPPORTED", `provider '${provider.id}' does not support refunds`) };
    }
    return { ok: true, provider };
  }

  /** Credentials plus the provider-ref precondition — both must hold before a refund attempt can
   * be persisted and dispatched. */
  async function resolveRefundPrereqs(
    provider: PaymentProvider,
    payment: PaymentRecord,
    workspaceId: string
  ): Promise<{ ok: true; credentials: Readonly<Record<string, string>> } | { ok: false; error: PaymentError }> {
    const resolved = await resolveCredentials(provider, workspaceId);
    if (!resolved) {
      return { ok: false, error: error("NO_CREDENTIALS_CONFIGURED", `no credentials configured for payment provider '${provider.id}'`) };
    }
    if (!payment.providerRef) {
      return { ok: false, error: error("INVALID_REQUEST", `payment ${payment.id} has no provider reference to refund`) };
    }
    return { ok: true, credentials: resolved };
  }

  /**
   * Inserts the pending refund row, absorbing the same UNIQUE-index race `insertPendingPayment`
   * absorbs on the charge side.
   */
  function insertPendingRefund(
    refundId: string,
    input: RefundRequest,
    amount: Money,
    createdAt: number
  ): { kind: "inserted" } | { kind: "raced"; row: RefundRow } {
    try {
      db.prepare(
        `INSERT INTO "${REFUNDS}" (id, workspace_id, payment_id, idempotency_key, provider_ref, amount_minor,
           currency, status, reason, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, 'pending', ?, ?, ?)`
      ).run(
        refundId,
        input.workspaceId,
        input.paymentId,
        input.idempotencyKey,
        amount.minorUnits,
        amount.currency,
        input.reason ?? null,
        createdAt,
        createdAt
      );
      return { kind: "inserted" };
    } catch (err) {
      if (isUniqueViolation(err)) {
        const raced = selectRefundByKey.get(input.workspaceId, input.idempotencyKey) as RefundRow | undefined;
        if (raced) return { kind: "raced", row: raced };
      }
      throw err;
    }
  }

  /**
   * Everything from "the refund row now exists" onward: call the provider, mark the row on
   * failure, or move the refund row and the payment's refunded total together on success. Split
   * out of `refund()` because this is the one stretch that cannot be reduced to a single guard
   * clause — it is the actual attempt, not a precondition on it.
   */
  async function executeRefundAttempt(args: {
    refundId: string;
    input: RefundRequest;
    amount: Money;
    payment: PaymentRecord;
    provider: PaymentProvider;
    resolvedCredentials: Readonly<Record<string, string>>;
    createdAt: number;
  }): Promise<RefundResult> {
    const { refundId, input, amount, payment, provider, resolvedCredentials, createdAt } = args;

    const insertOutcome = insertPendingRefund(refundId, input, amount, createdAt);
    if (insertOutcome.kind === "raced") {
      return { ok: true, refund: toRefundRecord(insertOutcome.row), payment, replayed: true };
    }

    // `resolveRefundPrereqs` already rejected a payment with no `providerRef`, so this call is
    // reached only when one is set — the assertion documents that instead of re-deriving it.
    const result = await provider.refund!(
      {
        providerRef: payment.providerRef as string,
        amount,
        idempotencyKey: input.idempotencyKey,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      },
      contextFor(provider, resolvedCredentials)
    );

    const updatedAt = clock.now();
    if (!result.ok) {
      db.prepare(`UPDATE "${REFUNDS}" SET status = 'failed', updated_at = ? WHERE id = ?`).run(updatedAt, refundId);
      return { ok: false, error: result.error };
    }

    // The refund row and the payment's refunded total move together or not at all.
    db.transaction(() => {
      db.prepare(`UPDATE "${REFUNDS}" SET status = ?, provider_ref = ?, updated_at = ? WHERE id = ?`).run(
        result.status,
        result.providerRef,
        updatedAt,
        refundId
      );
      if (result.status !== "succeeded") return;
      const refundedTotal = payment.amountRefundedMinor + amount.minorUnits;
      const next = refundedTotal >= payment.amount.minorUnits ? "refunded" : "partially_refunded";
      // A second partial refund moves the money without moving the status, so the total is written
      // either way and the status only when the machine actually allows the step.
      if (canTransition(payment.status, next)) {
        db.prepare(`UPDATE "${PAYMENTS}" SET amount_refunded_minor = ?, status = ?, updated_at = ? WHERE id = ?`).run(
          refundedTotal,
          next,
          updatedAt,
          payment.id
        );
      } else {
        db.prepare(`UPDATE "${PAYMENTS}" SET amount_refunded_minor = ?, updated_at = ? WHERE id = ?`).run(
          refundedTotal,
          updatedAt,
          payment.id
        );
      }
    })();

    const refundRow = db.prepare(`SELECT * FROM "${REFUNDS}" WHERE id = ?`).get(refundId) as RefundRow;
    const after = readPayment(payment.id);
    if (!after) throw new Error(`lipay: payment ${payment.id} vanished immediately after refund`);
    return { ok: true, refund: toRefundRecord(refundRow), payment: after, replayed: false };
  }

  async function refund(input: RefundRequest): Promise<RefundResult> {
    const paymentRow = selectPaymentById.get(input.workspaceId, input.paymentId) as PaymentRow | undefined;
    if (!paymentRow) {
      return { ok: false, error: error("INVALID_REQUEST", `no payment '${input.paymentId}' in this workspace`) };
    }
    const payment = toPaymentRecord(paymentRow);

    const providerResolution = resolveRefundProvider(payment);
    if (!providerResolution.ok) return { ok: false, error: providerResolution.error };
    const { provider } = providerResolution;

    const statusError = validateRefundStatus(payment);
    if (statusError) return { ok: false, error: statusError };

    const amountResolution = resolveRefundAmount(input, payment, provider);
    if (!amountResolution.ok) return { ok: false, error: amountResolution.error };
    const { amount } = amountResolution;

    const existing = selectRefundByKey.get(input.workspaceId, input.idempotencyKey) as RefundRow | undefined;
    const existingResult = resolveExistingRefund(existing, input, amount, payment);
    if (existingResult) return existingResult;

    const prereqs = await resolveRefundPrereqs(provider, payment, input.workspaceId);
    if (!prereqs.ok) return { ok: false, error: prereqs.error };

    return executeRefundAttempt({
      refundId: idGen.newId(),
      input,
      amount,
      payment,
      provider,
      resolvedCredentials: prereqs.credentials,
      createdAt: clock.now(),
    });
  }

  /**
   * Inserts one inbound event row, absorbing the UNIQUE-index dedupe on `(provider_id,
   * provider_event_id)` — the whole inbound idempotency mechanism (see the module-level doc
   * comment on `isUniqueViolation`).
   */
  function insertPaymentEvent(
    providerId: PaymentProviderId,
    event: NormalizedPaymentEvent,
    payload: string,
    paymentId: string | null
  ): { kind: "duplicate" } | { kind: "inserted"; eventId: string; receivedAt: number } {
    const eventId = idGen.newId();
    const receivedAt = clock.now();
    try {
      db.prepare(
        `INSERT INTO "${EVENTS}" (id, workspace_id, provider_id, provider_event_id, payment_id, kind,
           occurred_at, received_at, applied, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
      ).run(eventId, workspaceId, providerId, event.providerEventId, paymentId, event.kind, event.occurredAt, receivedAt, payload);
      return { kind: "inserted", eventId, receivedAt };
    } catch (err) {
      if (isUniqueViolation(err)) return { kind: "duplicate" };
      throw err;
    }
  }

  /**
   * Apply one normalized event. Everything below the INSERT runs only because the INSERT succeeded,
   * i.e. only for an event this install has never seen — which is why no code path here needs its
   * own "have I already handled this?" branch.
   */
  function applyEvent(providerId: PaymentProviderId, event: NormalizedPaymentEvent, payload: string): "duplicate" | "applied" | "recorded" {
    return db.transaction((): "duplicate" | "applied" | "recorded" => {
      const paymentRow = selectPaymentByRef.get(providerId, event.providerRef, workspaceId) as PaymentRow | undefined;
      const inserted = insertPaymentEvent(providerId, event, payload, paymentRow === undefined ? null : paymentRow.id);
      if (inserted.kind === "duplicate") return "duplicate";

      if (!paymentRow) return "recorded";

      // Out-of-order rejection: an event older than the newest one already applied to this payment
      // is recorded for the audit trail but never allowed to move the state backwards.
      const lastApplied = db
        .prepare(`SELECT MAX(occurred_at) AS at FROM "${EVENTS}" WHERE payment_id = ? AND applied = 1`)
        .get(paymentRow.id) as { at: number | null };

      const transition = computeEventTransition(paymentRow, event, lastApplied.at);
      if (!transition.apply) return "recorded";

      db.prepare(
        `UPDATE "${PAYMENTS}" SET status = ?, amount_refunded_minor = ?, updated_at = ? WHERE id = ?`
      ).run(transition.next, transition.refundedTotal, inserted.receivedAt, paymentRow.id);
      db.prepare(`UPDATE "${EVENTS}" SET applied = 1 WHERE id = ?`).run(inserted.eventId);
      return "applied";
    })();
  }

  async function handleWebhook(input: {
    providerId: PaymentProviderId;
    rawBody: Buffer;
    headers: Readonly<Record<string, string>>;
  }): Promise<WebhookAck> {
    const provider = registry.get(input.providerId);
    if (!provider) {
      return {
        accepted: false,
        processed: 0,
        duplicates: 0,
        error: error("PROVIDER_NOT_REGISTERED", `no payment provider registered for '${input.providerId}'`),
      };
    }

    const resolved = await resolveCredentials(provider, workspaceId);
    if (!resolved) {
      return {
        accepted: false,
        processed: 0,
        duplicates: 0,
        error: error("NO_CREDENTIALS_CONFIGURED", `no credentials configured for payment provider '${provider.id}'`),
      };
    }

    const parsed = await provider.parseWebhook(
      { rawBody: input.rawBody, headers: input.headers },
      contextFor(provider, resolved)
    );
    if (!parsed.ok) {
      return { accepted: false, processed: 0, duplicates: 0, error: parsed.error };
    }

    const payload = input.rawBody.toString("utf8");
    let processed = 0;
    let duplicates = 0;
    for (const event of parsed.events) {
      const outcome = applyEvent(provider.id, event, payload);
      if (outcome === "duplicate") duplicates += 1;
      else processed += 1;
    }
    // Accepted even when no event matched a known payment or a known event type: log-and-accept
    // beats an infinite provider retry storm, which is the one instinct both studied systems share.
    return { accepted: true, processed, duplicates };
  }

  return {
    listProviders(): readonly PaymentProviderSummary[] {
      return registry.list().map((provider) => ({
        id: provider.id,
        displayName: provider.displayName,
        capabilities: provider.capabilities,
      }));
    },
    charge,
    refund,
    handleWebhook,
    getPayment(request: { workspaceId: string; id: string }): PaymentRecord | null {
      const row = selectPaymentById.get(request.workspaceId, request.id) as PaymentRow | undefined;
      return row ? toPaymentRecord(row) : null;
    },
    listPayments(request: { workspaceId: string }, optional: { limit?: number } = {}): readonly PaymentRecord[] {
      const limit = Math.min(Math.max(optional.limit ?? 50, 1), 500);
      const rows = db
        .prepare(`SELECT * FROM "${PAYMENTS}" WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`)
        .all(request.workspaceId, limit) as PaymentRow[];
      return rows.map(toPaymentRecord);
    },
  };
}

/**
 * Boot helper: open a dedicated connection to the site db and activate lipay on it. `busy_timeout`
 * is not optional — see `store-plugin.ts`'s `bootstrapStore` header for the live multi-boot smoke
 * test that made a missing one a deterministic `SQLITE_BUSY` boot failure.
 */
export async function bootstrapLipay(required: {
  dbPath: string;
  workspaceId: string;
  httpClient: HttpClientPort;
  credentials: PaymentCredentialsPort;
  providers: readonly PaymentProvider[];
  clock: { now(): number };
  idGen: { newId(): string };
  webhookBaseUrl: string;
  returnUrl: string;
}): Promise<LipayApi> {
  const db = new Database(required.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  return activateLipay({ ...required, db });
}
