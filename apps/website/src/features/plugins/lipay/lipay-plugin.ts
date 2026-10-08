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
 * `fetch`; the rule-of-two credential shape; and `declareDataModule()` on the storage kernel it is
 * handed, every statement through `kernel.run` so one body serves SQLite and Postgres.
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
import { activateLipay as activateRuntime, type LipayApi } from "@jini-ai/commerce/payments";
import { declareDataModule } from "../data-module.js";
import { type PluginStore, pluginKernel } from "../plugin-store.js";
import type { HttpClientPort } from "#src/platform/http/index";
export type { LipayApi, PaymentRecord, RefundRecord, ChargeRequest, ChargeResult, RefundRequest, RefundResult, WebhookAck, PaymentProviderSummary } from "@jini-ai/commerce/payments";
export { LIPAY_PLUGIN_ID, webhookUrlFor } from "@jini-ai/commerce/payments";

import { LIPAY_MANIFEST } from "./manifest.js";
export { LIPAY_MANIFEST } from "./manifest.js";

/** CMS adapter: preserve provenance and snapshot/journal guarantees before constructing Jini's runtime.
 * This adapter is deliberately absent from Tovu's boot, routes and tool catalog. */
export async function activateLipay(
  required: Omit<Parameters<typeof activateRuntime>[0], "kernel" | "prepareStorage" | "httpClient"> & {
    db: PluginStore; dbPath: string; httpClient: HttpClientPort;
  },
  optional: Record<string, never> = {}
): Promise<LipayApi> {
  const kernel = pluginKernel(required.db);
  return activateRuntime({
    ...required, kernel: kernel as unknown as Parameters<typeof activateRuntime>[0]["kernel"],
    httpClient: { send: ({ request }) => required.httpClient.send(request) },
    prepareStorage: async () => {
      const declaration = await declareDataModule({ db: kernel, dbPath: required.dbPath, decl: LIPAY_MANIFEST });
      if (!declaration.ok) {
        throw new Error(`lipay dataModule declaration failed: ${declaration.error?.code} — ${declaration.error?.message}`);
      }
    },
  }, optional);
}
