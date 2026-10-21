import type { DeliveryEnvelopeStore, HttpClientPort, WebhookDeliveryRepoPort, WebhookSubscriptionRepoPort } from "#src/features/webhooks/index";
import { processDueDeliveries } from "#src/features/webhooks/delivery";
import type { WebhookSigner } from "#src/features/webhooks/signing";
import { createDefaultHttpClient } from "#src/platform/http/client";
import { SINGLE_HOP_HTTPS_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import type { ObservabilityPort } from "#src/platform/observability/index";
import { webhookEnvelopeStoreFor } from "./modules/integrations.js";

/**
 * @file The outbound webhook delivery loop: every {@link WEBHOOK_DELIVERY_INTERVAL_MS} it runs
 * `processDueDeliveries` once, which claims a bounded batch of due deliveries, signs and POSTs them,
 * and records each outcome (retry with backoff, or dead-letter).
 *
 * Why it exists: the integrations module's fan-out (`modules/integrations.ts`) only ENQUEUES. Until
 * this loop, nothing ever called `processDueDeliveries` outside tests, so every webhook delivery sat
 * `pending` forever.
 *
 * Only `createServingApp` starts it, for the outbox drainer's reason: this is the one process pair
 * that serves a site. A delivery loop in the exporter, the agent daemon or `app.ts`'s eager app
 * would POST a site's data from a process nobody is watching.
 *
 * Single flight: a tick that finds the previous one still running does nothing, so a slow receiver
 * (up to the per-request timeout times the batch) never stacks claims on top of each other.
 */

/** Idle wait between ticks. Short enough that a delivery leaves within seconds, long enough that
 * an idle site costs one indexed `SELECT` per interval. */
export const WEBHOOK_DELIVERY_INTERVAL_MS = 15_000;

/**
 * How long `stop` waits for a running tick. Shutdown closes the site store at most 4 s after a
 * signal (`closeStoreOnShutdown`), shared with the other loops' stops, so a tick gets 1 s. A tick
 * still running then is abandoned, not awaited.
 */
export const WEBHOOK_DELIVERY_STOP_GRACE_MS = 1_000;

/** Prefix of the one line logged for a failed tick; the loop keeps running after it. */
export const WEBHOOK_DELIVERY_FAILED_LINE = "[webhooks] delivery tick failed; retrying after the interval";

/** Logged when `stop` gives up waiting on a running tick. */
export const WEBHOOK_DELIVERY_STOP_LATE_LINE = "[webhooks] a delivery tick was still running at shutdown; it was abandoned";

const MAX_LOGGED_MESSAGE_CHARS = 200;
/** Bounds the scan of a pathological message before URLs are removed. */
const MAX_SCANNED_MESSAGE_CHARS = 2_000;

/** A cancellable timer. The default implementation never keeps the process alive. */
export interface WebhookDeliveryTimer {
  cancel(): void;
}

/** Timer port, injected so tests drive ticks with a fake clock. */
export interface WebhookDeliveryScheduler {
  every(required: { ms: number; run: () => void }): WebhookDeliveryTimer;
  after(required: { ms: number; run: () => void }): WebhookDeliveryTimer;
}

/** Node timers, unref'd: like the outbox drainer's, the loop must never hold a stopping process open. */
export const nodeWebhookDeliveryScheduler: WebhookDeliveryScheduler = {
  every: ({ ms, run }) => {
    const handle = setInterval(run, ms);
    handle.unref();
    return { cancel: () => clearInterval(handle) };
  },
  after: ({ ms, run }) => {
    const handle = setTimeout(run, ms);
    handle.unref();
    return { cancel: () => clearTimeout(handle) };
  },
};

export interface WebhookDeliveryWorker {
  /** Runs one tick now, unless one is already running (then resolves with that one). Never rejects. */
  tick(): Promise<void>;
  /** Stops scheduling ticks and waits up to {@link WEBHOOK_DELIVERY_STOP_GRACE_MS} for a running one. Idempotent. */
  stop(): Promise<void>;
}

export interface WebhookDeliveryWorkerOptional {
  intervalMs?: number;
  scheduler?: WebhookDeliveryScheduler;
  log?: (line: string) => void;
}

/**
 * One log line for a failed tick: the error's name, message (URLs removed, length capped) and
 * `code`. Never the error object itself, its `cause`, stack or extra fields: a repo or transport
 * error can carry a receiver URL with credentials, request headers or a payload.
 *
 * @complexity O(message length).
 */
export function describeWebhookTickError(required: { error: unknown }, _optional = {}): string {
  const { error } = required;
  if (!(error instanceof Error)) return `${WEBHOOK_DELIVERY_FAILED_LINE}: a non-Error value was thrown`;
  // Any space-separated word holding "://" is dropped whole (scheme, userinfo, host, query alike).
  const words = error.message.slice(0, MAX_SCANNED_MESSAGE_CHARS).split(" ");
  const message = words.map((word) => (word.includes("://") ? "[url]" : word)).join(" ").slice(0, MAX_LOGGED_MESSAGE_CHARS);
  const code = (error as { code?: unknown }).code;
  const codeSuffix = typeof code === "string" || typeof code === "number" ? ` (code ${code})` : "";
  return `${WEBHOOK_DELIVERY_FAILED_LINE}: ${error.name}: ${message}${codeSuffix}`;
}

/**
 * Starts the loop. The first tick runs one interval after start.
 *
 * @param required.processDue one delivery pass (`processDueDeliveries` bound to its ports).
 * @param optional.intervalMs idle wait between ticks; default {@link WEBHOOK_DELIVERY_INTERVAL_MS}.
 * @throws RangeError when `intervalMs` is not a positive finite number.
 * @example const worker = startWebhookDeliveryWorker({ processDue }); await worker.stop();
 * @complexity O(1) per tick, beyond `processDue`.
 */
export function startWebhookDeliveryWorker(
  required: { processDue: () => Promise<unknown> },
  optional: WebhookDeliveryWorkerOptional = {},
): WebhookDeliveryWorker {
  const { intervalMs = WEBHOOK_DELIVERY_INTERVAL_MS, scheduler = nodeWebhookDeliveryScheduler, log = (line: string) => console.error(line) } = optional;
  if (!(Number.isFinite(intervalMs) && intervalMs > 0)) throw new RangeError("webhook delivery intervalMs must be a positive finite number");
  let running: Promise<void> | undefined;
  let stopped = false;

  const tick = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    running ??= required.processDue().then(
      () => undefined,
      (error: unknown) => log(describeWebhookTickError({ error })),
    ).finally(() => { running = undefined; });
    return running;
  };

  const timer = scheduler.every({ ms: intervalMs, run: () => { void tick(); } });

  const stop = async (): Promise<void> => {
    stopped = true;
    timer.cancel();
    if (running === undefined) return;
    let grace!: WebhookDeliveryTimer;
    const late = new Promise<"late">((resolve) => { grace = scheduler.after({ ms: WEBHOOK_DELIVERY_STOP_GRACE_MS, run: () => resolve("late") }); });
    const outcome = await Promise.race([running, late]);
    grace.cancel();
    if (outcome === "late") log(WEBHOOK_DELIVERY_STOP_LATE_LINE);
  };

  return { tick, stop };
}

/** The serving deps the loop reads (all on `RouteDeps`). */
export interface ServingWebhookDeliveryDeps {
  webhookDeliveryRepo: WebhookDeliveryRepoPort;
  webhookSubscriptionRepo: WebhookSubscriptionRepoPort;
  webhookSigner: WebhookSigner;
  clock: { nowIso(): string };
  observability: ObservabilityPort;
}

/**
 * Starts the loop over the serving process's own webhook ports. The envelope store is the one the
 * fan-out writes to ({@link webhookEnvelopeStoreFor}). Outbound POSTs go through a guarded client on
 * `SINGLE_HOP_HTTPS_EGRESS_POLICY`: https only, private/loopback addresses refused, no redirects
 * (a redirect would replay a signed body to a host the subscriber never named), 1 MB response cap.
 *
 * @param optional.httpClient replaces the guarded client (tests).
 * @complexity O(1); each tick's cost is `processDueDeliveries`'s.
 */
export function startServingWebhookDeliveryWorker(
  required: { deps: ServingWebhookDeliveryDeps },
  optional: WebhookDeliveryWorkerOptional & { httpClient?: HttpClientPort } = {},
): WebhookDeliveryWorker {
  const { deps } = required;
  const { httpClient = createDefaultHttpClient(SINGLE_HOP_HTTPS_EGRESS_POLICY, { observability: deps.observability }), ...workerOptional } = optional;
  const envelopeStore: DeliveryEnvelopeStore = webhookEnvelopeStoreFor({ deliveryRepo: deps.webhookDeliveryRepo });
  const processDue = () => processDueDeliveries({ deps: {
    deliveryRepo: deps.webhookDeliveryRepo,
    subscriptionRepo: deps.webhookSubscriptionRepo,
    envelopeStore,
    httpClient,
    signer: deps.webhookSigner,
    clock: deps.clock,
  } });
  return startWebhookDeliveryWorker({ processDue }, workerOptional);
}
