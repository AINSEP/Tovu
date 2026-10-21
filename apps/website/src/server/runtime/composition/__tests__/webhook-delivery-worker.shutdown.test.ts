import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { HttpClientPort, HttpRequest, HttpResponse } from "#src/features/webhooks/index";
import { processDueDeliveries } from "#src/features/webhooks/delivery";
import { createFixedSecretSigner } from "#src/features/webhooks/signing";
import type { WebhookDeliveryRecord } from "#src/features/webhooks/types";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteWebhookDeliveryRepo, SqliteWebhookSubscriptionRepo } from "#src/platform/db/sqlite/webhook-repo.sqlite";
import { createHttpClient } from "#src/platform/http/client";
import { SINGLE_HOP_HTTPS_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import { createNoopObservabilityPort } from "#src/platform/observability/index";
import { startServingWebhookDeliveryWorker, type WebhookDeliveryScheduler } from "../webhook-delivery-worker.js";

/**
 * @file The serving webhook worker's shutdown against persistent SQLite: `stop` cancels the running
 * batch (the in-flight POST settles as a failed attempt, unattempted claims return to `pending`)
 * before the store closes, so a restarted process delivers them; a batch abandoned outright (crash)
 * is recovered once its claim lease expires; and a receiver that trickles bytes forever is cut off
 * by the request's total deadline rather than holding the worker.
 */

const T0 = "2026-10-21T00:00:00.000Z";
const idleScheduler: WebhookDeliveryScheduler = { every: () => ({ cancel: () => {} }), after: ({ ms, run }) => { const handle = setTimeout(run, ms); return { cancel: () => clearTimeout(handle) }; } };

function delivery(id: string): WebhookDeliveryRecord {
  return {
    id, workspaceId: "workspace-1", subscriptionId: "sub-1", eventId: `event-${id}`, topic: "form.submission.received",
    status: "pending", attempts: 0, nextAttemptAt: T0, lastResponseStatus: null, lastError: null,
    signedWithVersion: null, createdAt: T0, deliveredAt: null, deadAt: null,
  };
}

/** Opens the site store at `path` and binds the serving worker's deps to it at a settable time. */
function openSite(path: string) {
  const db = openContentDb(path);
  let now = T0;
  const deps = {
    webhookDeliveryRepo: new SqliteWebhookDeliveryRepo(db),
    webhookSubscriptionRepo: new SqliteWebhookSubscriptionRepo(db),
    webhookSigner: createFixedSecretSigner(new Map([["sub-1", Buffer.from("shared-secret")]])),
    clock: { nowIso: () => now },
    observability: createNoopObservabilityPort({}),
  };
  const statuses = async () => Promise.all(["d1", "d2", "d3"].map(async (id) => {
    const row = await deps.webhookDeliveryRepo.findById({ workspaceId: "workspace-1", id });
    return [id, row?.status, row?.attempts];
  }));
  return { db, deps, statuses, setNow: (iso: string) => { now = iso; }, close: () => db.$client.close() };
}

async function seed(site: ReturnType<typeof openSite>) {
  await site.deps.webhookSubscriptionRepo.save({
    id: "sub-1", workspaceId: "workspace-1", ownerPrincipalId: "principal-1", label: "Endpoint",
    targetUrl: "https://example.com/hooks", topics: ["form.submission.received"], secretVersion: 1,
    previousSecretVersion: null, status: "active", createdByPrincipalId: "principal-1", createdByPluginId: null,
    createdAt: T0, updatedAt: T0, disabledAt: null,
  });
  for (const id of ["d1", "d2", "d3"]) {
    const record = delivery(id);
    await site.deps.webhookDeliveryRepo.enqueue({ record }, { envelope: { deliveryId: id, eventId: record.eventId, topic: record.topic, workspaceId: "workspace-1", occurredAt: T0, data: {} } });
  }
}

const ok = (): HttpClientPort & { urls: string[] } => {
  const urls: string[] = [];
  return { urls, send: async (request) => { urls.push(request.headers["tovu-delivery-id"]!); return { status: 200, headers: {}, bodyText: "ok" }; } };
};

function withTempDir(run: (path: string) => Promise<void>) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), "tovu-webhook-shutdown-"));
    try { await run(join(dir, "content.db")); } finally { rmSync(dir, { recursive: true, force: true }); }
  };
}

test("stop cancels the running batch before the store closes; a restart delivers what it released", withTempDir(async (path) => {
  const first = openSite(path);
  await seed(first);
  let started!: () => void;
  const inFlight = new Promise<void>((resolve) => { started = resolve; });
  const hanging: HttpClientPort = {
    send: (request) => new Promise<HttpResponse>((_resolve, reject) => {
      request.signal?.addEventListener("abort", () => reject(request.signal!.reason as Error), { once: true });
      started();
    }),
  };
  const worker = startServingWebhookDeliveryWorker({ deps: first.deps }, { httpClient: hanging, scheduler: idleScheduler, log: () => {} });
  const tick = worker.tick();
  await inFlight;
  await worker.stop();
  await tick;
  assert.deepEqual(await first.statuses(), [["d1", "pending", 1], ["d2", "pending", 0], ["d3", "pending", 0]]);
  const interrupted = await first.deps.webhookDeliveryRepo.findById({ workspaceId: "workspace-1", id: "d1" });
  assert.equal(interrupted?.lastError, "webhook delivery worker stopped");
  first.close();

  const second = openSite(path);
  const client = ok();
  const restarted = startServingWebhookDeliveryWorker({ deps: second.deps }, { httpClient: client, scheduler: idleScheduler });
  await restarted.tick();
  assert.deepEqual(client.urls, ["d2", "d3"], "released claims are due at once; the interrupted attempt backs off");
  second.setNow("2026-10-21T01:00:00.000Z");
  await restarted.tick();
  assert.deepEqual(client.urls, ["d2", "d3", "d1"]);
  assert.deepEqual(await second.statuses(), [["d1", "delivered", 2], ["d2", "delivered", 1], ["d3", "delivered", 1]]);
  await restarted.stop();
  second.close();
}));

test("a batch abandoned without a stop (crash) is reclaimed after a restart once its lease expires", withTempDir(async (path) => {
  const first = openSite(path);
  await seed(first);
  // What a process that died mid-batch leaves behind: every row claimed under the default lease.
  await first.deps.webhookDeliveryRepo.claimPending({ batchSize: 20, nowIso: T0 }, { claimLeaseMs: 20 * 30_000 + 60_000 });
  first.close();

  const second = openSite(path);
  const client = ok();
  const worker = startServingWebhookDeliveryWorker({ deps: second.deps }, { httpClient: client, scheduler: idleScheduler });
  second.setNow("2026-10-21T00:10:59.999Z");
  await worker.tick();
  assert.deepEqual(client.urls, [], "a live lease is not reclaimed");
  second.setNow("2026-10-21T00:11:00.000Z");
  await worker.tick();
  assert.deepEqual(client.urls, ["d1", "d2", "d3"]);
  assert.deepEqual(await second.statuses(), [["d1", "delivered", 2], ["d2", "delivered", 2], ["d3", "delivered", 2]]);
  await worker.stop();
  second.close();
}));

test("a receiver trickling bytes forever is cut off by the total deadline through the guarded client", withTempDir(async (path) => {
  const site = openSite(path);
  await seed(site);
  let trickled = 0;
  const seen: HttpRequest[] = [];
  const httpClient = createHttpClient({
    policy: SINGLE_HOP_HTTPS_EGRESS_POLICY,
    // Never idle (a byte every 5 ms) and never complete: only a whole-request deadline ends it.
    transport: { requestPinned: (request) => new Promise<HttpResponse>((_resolve, reject) => {
      seen.push(request);
      const bytes = setInterval(() => { trickled += 1; }, 5);
      request.signal?.addEventListener("abort", () => { clearInterval(bytes); reject(request.signal!.reason as Error); }, { once: true });
    }) },
  }, { dns: { resolve: async () => ["93.184.216.34"] } });

  const startedAt = Date.now();
  const result = await processDueDeliveries({ deps: {
    deliveryRepo: site.deps.webhookDeliveryRepo,
    subscriptionRepo: site.deps.webhookSubscriptionRepo,
    envelopeStore: site.deps.webhookDeliveryRepo,
    httpClient,
    signer: site.deps.webhookSigner,
    clock: site.deps.clock,
  } }, { batchSize: 1, requestTotalDeadlineMs: 60 });

  assert.deepEqual(result, { processed: 1, delivered: 0, failed: 1, dead: 0 });
  assert.ok(trickled >= 3, "the receiver was still sending when it was cut off");
  assert.ok(Date.now() - startedAt < 5_000, "bounded by the total deadline, not the idle timeout");
  assert.equal(seen[0]?.totalDeadlineMs, 60);
  const row = await site.deps.webhookDeliveryRepo.findById({ workspaceId: "workspace-1", id: "d1" });
  assert.equal(row?.status, "pending");
  assert.equal(row?.lastError, "fetch timed out after 60ms: https://example.com/hooks");
  site.close();
}));
