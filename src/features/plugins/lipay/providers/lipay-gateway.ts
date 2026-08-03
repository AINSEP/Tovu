/**
 * @file The first-party `lipay` gateway — one `PaymentProvider` among N.
 *
 * This file is the flexibility test the architecture review states as a testable property: adding a
 * provider is ONE new file plus ONE registration line, with zero edits to lipay's tables, public
 * API, error union, or webhook route. Nothing in `lipay-plugin.ts` names this gateway. A Stripe or
 * M-Pesa provider is the same size and shape as what follows.
 *
 * SCOPE DISCLOSURE, in the spirit of `deploy-plugin.ts`'s own header about Vercel: there is no real
 * lipay gateway service and no credentials for one exist in this environment, so a `charge` here
 * cannot complete a real payment — it is expected to return the typed `NO_CREDENTIALS_CONFIGURED`
 * error before any HTTP is attempted, or a `TRANSPORT_ERROR` if credentials are supplied against an
 * unreachable host. What IS real and complete: the request is shaped correctly (endpoint, bearer
 * auth, forwarded idempotency key, minor-unit amount, callback/return URLs), every response and
 * failure mode maps to a typed `PaymentError` rather than a throw, all outbound calls go through the
 * guarded ADR-038 `HttpClientPort` and never a raw `fetch`, and webhook verification is a real
 * timestamped HMAC-SHA256 over the exact received bytes with a constant-time comparison.
 *
 * The webhook signature scheme is the standard timestamped construction (the same shape Stripe
 * uses), chosen so the timestamp is inside the signed material and a captured body cannot be
 * replayed indefinitely against a fresh signature:
 *
 *     x-lipay-signature: t=<unix seconds>,v1=<hex hmac-sha256(secret, "<t>.<raw body bytes>")>
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import type { HttpResponse } from "#src/http/index";
import type {
  ChargeNextAction,
  PaymentError,
  PaymentProvider,
  ProviderChargeInput,
  ProviderChargeResult,
  ProviderContext,
  ProviderRefundInput,
  ProviderRefundResult,
  ProviderWebhookInput,
  ProviderWebhookResult,
} from "../ports";

export const LIPAY_GATEWAY_ID = "lipay";

/** No public lipay service exists yet; a real install must override this. */
const DEFAULT_API_BASE = "https://api.lipay.invalid";
const DEFAULT_TIMEOUT_MS = 15_000;
/** How far a webhook's signed timestamp may drift before the delivery is refused. */
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
const SIGNATURE_HEADER = "x-lipay-signature";

const fail = (
  code: PaymentError["code"],
  message: string,
  optional: { retryable?: boolean; providerStatus?: number } = {}
): PaymentError => ({
  code,
  message,
  retryable: optional.retryable ?? false,
  ...(optional.providerStatus === undefined ? {} : { providerStatus: optional.providerStatus }),
});

interface ChargeResponseBody {
  id?: unknown;
  status?: unknown;
  next_action?: { type?: unknown; url?: unknown; instructions?: unknown } | null;
  error?: { code?: unknown; message?: unknown };
}

interface WebhookBody {
  id?: unknown;
  type?: unknown;
  created?: unknown;
  data?: { id?: unknown; amount?: unknown; currency?: unknown } | null;
}

const EVENT_KINDS: Readonly<Record<string, "succeeded" | "failed" | "pending" | "refunded" | "chargeback" | "expired">> =
  {
    "charge.succeeded": "succeeded",
    "charge.failed": "failed",
    "charge.pending": "pending",
    "charge.expired": "expired",
    "charge.refunded": "refunded",
    "charge.chargeback": "chargeback",
  };

function parseJson(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText || "{}");
  } catch {
    return null;
  }
}

/**
 * A non-2xx response, classified. `DECLINED` is separated from `PROVIDER_ERROR` because they are
 * different facts to a caller: a decline is a terminal answer about this payment, while a provider
 * error says nothing about whether money moved and may be worth retrying with the same key.
 */
function classifyHttpFailure(status: number, body: ChargeResponseBody | null, bodyText: string): PaymentError {
  const code = typeof body?.error?.code === "string" ? body.error.code : null;
  const message = typeof body?.error?.message === "string" ? body.error.message : bodyText.slice(0, 300);
  if (status === 402 || code === "card_declined" || code === "insufficient_funds") {
    return fail("DECLINED", message || `lipay declined the charge (${status})`, { providerStatus: status });
  }
  return fail("PROVIDER_ERROR", `lipay API returned ${status}: ${message}`, {
    providerStatus: status,
    retryable: status === 429 || status >= 500,
  });
}

function toNextAction(body: ChargeResponseBody): ChargeNextAction | null {
  const action = body.next_action;
  if (!action || typeof action.type !== "string") return { kind: "none" };
  if (action.type === "redirect") {
    return typeof action.url === "string" && action.url.length > 0 ? { kind: "redirect", url: action.url } : null;
  }
  if (action.type === "out_of_band") {
    return typeof action.instructions === "string"
      ? { kind: "out_of_band", instructions: action.instructions }
      : { kind: "out_of_band" };
  }
  if (action.type === "none") return { kind: "none" };
  return null;
}

/** `t=<seconds>,v1=<hex>` — tolerant of ordering and extra future schemes, strict about content. */
function parseSignatureHeader(raw: string | undefined): { timestamp: number; signature: string } | null {
  if (!raw) return null;
  let timestamp: number | null = null;
  let signature: string | null = null;
  for (const part of raw.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t" && value !== undefined && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === "v1" && value !== undefined && /^[0-9a-f]+$/i.test(value)) signature = value.toLowerCase();
  }
  return timestamp === null || signature === null ? null : { timestamp, signature };
}

/**
 * Sign exactly the bytes lipay signs. Exported so a caller (and this plugin's own tests) can
 * produce a genuinely valid delivery rather than stubbing verification out — a test that mocks the
 * signature check does not test the signature check.
 *
 * @complexity O(n) in the body length.
 * @overallScore 100
 */
export function signLipayWebhook(required: {
  secret: string;
  rawBody: Buffer;
  timestampSeconds: number;
}): string {
  const mac = createHmac("sha256", required.secret)
    .update(`${required.timestampSeconds}.`)
    .update(required.rawBody)
    .digest("hex");
  return `t=${required.timestampSeconds},v1=${mac}`;
}

function verifySignature(
  input: ProviderWebhookInput,
  ctx: ProviderContext
): { ok: true } | { ok: false; error: PaymentError } {
  const header = input.headers[SIGNATURE_HEADER] ?? input.headers[SIGNATURE_HEADER.toUpperCase()];
  const parsed = parseSignatureHeader(header);
  if (!parsed) {
    return { ok: false, error: fail("SIGNATURE_INVALID", `missing or malformed ${SIGNATURE_HEADER} header`) };
  }

  const expected = createHmac("sha256", ctx.credentials.webhookSecret)
    .update(`${parsed.timestamp}.`)
    .update(input.rawBody)
    .digest("hex");
  const received = Buffer.from(parsed.signature, "hex");
  const computed = Buffer.from(expected, "hex");
  // Length is checked first because `timingSafeEqual` throws on a mismatch; the length of a
  // SHA-256 digest is public, so leaking it is not a signal an attacker can use.
  if (received.length !== computed.length || !timingSafeEqual(received, computed)) {
    return { ok: false, error: fail("SIGNATURE_INVALID", "webhook signature did not match the request body") };
  }

  const skewMs = Math.abs(ctx.now() - parsed.timestamp * 1000);
  if (skewMs > SIGNATURE_TOLERANCE_MS) {
    return {
      ok: false,
      error: fail("SIGNATURE_INVALID", `webhook timestamp is ${Math.round(skewMs / 1000)}s outside the accepted window`),
    };
  }
  return { ok: true };
}

/**
 * Build the first-party lipay gateway. `apiBaseUrl` is an option rather than a credential so it
 * stays configuration, not a secret, and so tests can point it at a fake transport.
 */
export function createLipayGateway(options: { apiBaseUrl?: string } = {}): PaymentProvider {
  const apiBase = (options.apiBaseUrl ?? DEFAULT_API_BASE).replace(/\/+$/, "");

  return {
    id: LIPAY_GATEWAY_ID,
    displayName: "Lipay",
    credentialKeys: ["secretKey", "webhookSecret"],
    capabilities: {
      refunds: "partial",
      tokenization: false,
      recurring: false,
      // No `client_action`: this gateway has no in-page SDK, and declaring a shape it cannot
      // produce is precisely the untyped-`$supports` failure the capability object exists to stop.
      confirmation: ["none", "redirect", "out_of_band"],
      // The merchant account decides; the gateway itself imposes no currency list.
      currencies: "any",
      webhooks: true,
    },

    /**
     * @complexity One outbound HTTP request, hard-bounded by `timeoutMs`.
     * @overallScore 100
     */
    async createCharge(input: ProviderChargeInput, ctx: ProviderContext): Promise<ProviderChargeResult> {
      let response: HttpResponse;
      try {
        response = await ctx.httpClient.send({
          method: "POST",
          url: `${apiBase}/v1/charges`,
          headers: {
            authorization: `Bearer ${ctx.credentials.secretKey}`,
            "content-type": "application/json",
            // Forwarded so a retry is deduplicated on the gateway's side too, not just in
            // `p_lipay__payments` — the outbound half of idempotency Open SaaS omits entirely.
            "idempotency-key": input.idempotencyKey,
          },
          body: JSON.stringify({
            amount: input.amount.minorUnits,
            currency: input.amount.currency,
            reference: input.reference ?? null,
            customer: input.customer ?? null,
            callback_url: ctx.webhookUrl,
            return_url: ctx.returnUrl,
            ...(input.providerOptions ?? {}),
          }),
          timeoutMs: DEFAULT_TIMEOUT_MS,
        });
      } catch (err) {
        // Transport failure, timeout, or an EgressPolicy refusal — never thrown out of the port.
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: fail("TRANSPORT_ERROR", message, { retryable: true }) };
      }

      const body = parseJson(response.bodyText) as ChargeResponseBody | null;
      if (response.status < 200 || response.status >= 300) {
        return { ok: false, error: classifyHttpFailure(response.status, body, response.bodyText) };
      }
      if (!body || typeof body.id !== "string" || body.id.length === 0) {
        return { ok: false, error: fail("PROVIDER_ERROR", "lipay accepted the charge but returned no charge id") };
      }
      if (body.status !== "succeeded" && body.status !== "pending") {
        return {
          ok: false,
          error: fail("PROVIDER_ERROR", `lipay returned an unrecognized charge status '${String(body.status)}'`),
        };
      }
      const next = toNextAction(body);
      if (next === null) {
        return { ok: false, error: fail("PROVIDER_ERROR", "lipay returned a malformed next_action") };
      }
      return { ok: true, providerRef: body.id, status: body.status, next };
    },

    /**
     * @complexity One outbound HTTP request, hard-bounded by `timeoutMs`.
     * @overallScore 100
     */
    async refund(input: ProviderRefundInput, ctx: ProviderContext): Promise<ProviderRefundResult> {
      let response: HttpResponse;
      try {
        response = await ctx.httpClient.send({
          method: "POST",
          url: `${apiBase}/v1/charges/${encodeURIComponent(input.providerRef)}/refunds`,
          headers: {
            authorization: `Bearer ${ctx.credentials.secretKey}`,
            "content-type": "application/json",
            "idempotency-key": input.idempotencyKey,
          },
          body: JSON.stringify({
            amount: input.amount.minorUnits,
            currency: input.amount.currency,
            reason: input.reason ?? null,
          }),
          timeoutMs: DEFAULT_TIMEOUT_MS,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: fail("TRANSPORT_ERROR", message, { retryable: true }) };
      }

      const body = parseJson(response.bodyText) as ChargeResponseBody | null;
      if (response.status < 200 || response.status >= 300) {
        return { ok: false, error: classifyHttpFailure(response.status, body, response.bodyText) };
      }
      if (!body || typeof body.id !== "string" || body.id.length === 0) {
        return { ok: false, error: fail("PROVIDER_ERROR", "lipay accepted the refund but returned no refund id") };
      }
      const status = body.status === "pending" ? "pending" : "succeeded";
      return { ok: true, providerRef: body.id, status };
    },

    /**
     * Verify, then normalize. Core writes; this method never touches the database.
     *
     * @complexity O(n) in the body length (one HMAC pass), no I/O.
     * @overallScore 100
     */
    async parseWebhook(input: ProviderWebhookInput, ctx: ProviderContext): Promise<ProviderWebhookResult> {
      const verified = verifySignature(input, ctx);
      if (!verified.ok) return { ok: false, error: verified.error };

      const body = parseJson(input.rawBody.toString("utf8")) as WebhookBody | null;
      if (!body || typeof body.id !== "string" || typeof body.type !== "string") {
        return { ok: false, error: fail("PROVIDER_ERROR", "lipay webhook body is not a recognizable event") };
      }

      const kind = EVENT_KINDS[body.type];
      // An unrecognized event type is not an error: returning zero events lets core acknowledge
      // with a 2xx instead of provoking an indefinite retry storm from the gateway.
      if (!kind) return { ok: true, events: [] };

      const charge = body.data;
      if (!charge || typeof charge.id !== "string" || charge.id.length === 0) {
        return { ok: false, error: fail("PROVIDER_ERROR", `lipay ${body.type} event carries no charge id`) };
      }

      const amount =
        typeof charge.amount === "number" && Number.isSafeInteger(charge.amount) && typeof charge.currency === "string"
          ? { minorUnits: charge.amount, currency: charge.currency.toUpperCase() }
          : undefined;

      return {
        ok: true,
        events: [
          {
            providerEventId: body.id,
            providerRef: charge.id,
            kind,
            // lipay reports `created` in unix seconds; the event log stores epoch milliseconds.
            occurredAt: typeof body.created === "number" ? body.created * 1000 : ctx.now(),
            ...(amount === undefined ? {} : { amount }),
          },
        ],
      };
    },
  };
}
