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
 *
 * 2026-10-21: Jini's legacy lipay runtime (`@jini-ai/commerce/payments`: `activateLipay`, the
 * `p_lipay__*` read/write paths, `LipayApi`) was replaced by the generic payments kernel
 * (`@jini-ai/commerce/payments/kernel`: `createPaymentsService` over the `commerce_payments*`
 * ledger). This adapter now assembles that kernel on the plugin store instead. The legacy
 * `p_lipay__*` tables are still DECLARED (never dropped: they hold money history), and the kernel's
 * migration history copies their rows into the new ledger (step `0005`), so the declaration must run
 * before the migrations. Gateways are now kernel `PaymentProvider`s registered through
 * `providers`; credentials and per-account context come from `contexts`.
 */
import {
  createPaymentsService,
  type PaymentsPort,
  type PaymentsServiceOptional,
  type PaymentsServiceRequired,
} from "@jini-ai/commerce/payments/kernel";
import { migrateCommercePayments, sqlPaymentsLedger } from "@jini-ai/commerce/payments/ledger/sql";
import { declareDataModule } from "../data-module.js";
import { type PluginStore, pluginKernel } from "../plugin-store.js";

import { LIPAY_MANIFEST } from "./manifest.js";
export { LIPAY_MANIFEST } from "./manifest.js";

/** The plugin id the legacy `p_lipay__*` tables are namespaced under. */
export const LIPAY_PLUGIN_ID = "lipay";

type MigrationKernel = Parameters<typeof migrateCommercePayments>[0]["kernel"];

/** CMS adapter: preserve provenance and snapshot/journal guarantees before constructing Jini's runtime.
 * This adapter is deliberately absent from Tovu's boot, routes and tool catalog.
 * Rows the retired runtime left in `p_lipay__*` are never imported: the owner ruled that legacy
 * code and data wrong (2026-10-21), so only the new payments kernel's ledger is used. */
export async function activateLipay(
  required: Omit<PaymentsServiceRequired, "ledger"> & { db: PluginStore; dbPath: string },
  optional: PaymentsServiceOptional = {}
): Promise<PaymentsPort> {
  const { db, dbPath, ...service } = required;
  const kernel = pluginKernel(db);
  const declaration = await declareDataModule({ db: kernel, dbPath, decl: LIPAY_MANIFEST });
  if (!declaration.ok) {
    throw new Error(`lipay dataModule declaration failed: ${declaration.error?.code} — ${declaration.error?.message}`);
  }
  // The plugin store's kernel is the same storage-kernel shape `@jini-ai/db` defines (the legacy
  // runtime took it through the same cast).
  const storage = kernel as unknown as MigrationKernel;
  await migrateCommercePayments({ kernel: storage });
  return createPaymentsService({ ...service, ledger: sqlPaymentsLedger({ kernel: storage }) }, optional);
}
