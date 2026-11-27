import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { createTracker } from "@jini-ai/diagnostics/observability/node";
import { createNoopObservabilityPort, type ObservabilityPort } from "@jini-ai/core/contracts/observability";
import type { DomainEvent } from "@jini-ai/core/contracts/events";
import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";

import { bootAuthenticated } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { createServingApp } from "../../runtime/composition/serving-app.js";

/**
 * @file Regression proof that an event from a route which never drains the outbox still reaches its
 * subscriber (2026-09-14).
 *
 * Taxonomy create enqueues `taxonomy.created` through `@jini-ai/cms/taxonomy`'s write service and,
 * like comments, menus, widgets, redirects, form definitions, plugin enable and change-set revert,
 * never calls `processOutbox`. Before the background drainer that event sat `pending` until some
 * unrelated post/page/entry route drained. The request goes through the real admin route that
 * `createApp` mounts, inside `createServingApp`, the function both site-serving boot paths call
 * (pinned by `server/__tests__/unit/serving-app-boot-wiring.unit.test.ts`). The subscriber is a test
 * spy: no product code subscribes to taxonomy events yet, and the property under test is delivery.
 */

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return predicate();
}

test("taxonomy create, a route that never drains inline, reaches its bus subscriber through the serving app's background drainer", async (t) => {
  const deps = createRouteDeps();
  const received: string[] = [];
  await deps.bus.subscribe({ eventName: "taxonomy.created", handler: async (event) => {
    received.push(event.name);
  } });

  const { app, outboxDrainer } = createServingApp(deps, { outboxDrainIntervalMs: 20 });
  t.after(() => outboxDrainer.stop());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "category", hierarchical: true }),
  });
  assert.equal(res.status, 201);

  const delivered = await waitFor(() => received.length > 0, 2_000);
  assert.ok(delivered, "taxonomy.created was enqueued but never delivered: nothing drained the outbox after a route that does not drain inline");
  assert.deepEqual(received, ["taxonomy.created"]);
});

/** One span the recording port opened: its W3C ids, its parent and whether its owner ended it. */
interface RecordedSpan { name: string; traceId: string; spanId: string; parentSpanId?: string; ended: boolean; }

/**
 * A recording trace adapter in the shape a real tracing provider has: request and operation spans
 * carry W3C trace/span ids, a span's `run` makes it the active scope (so a span started inside it is
 * its child), and an explicit `traceparent` parents an operation instead of the ambient scope.
 */
function recordingObservability(): { port: ObservabilityPort; spans: RecordedSpan[] } {
  const scope = new AsyncLocalStorage<RecordedSpan>();
  const spans: RecordedSpan[] = [];
  const start = ({ name, parent }: { name: string; parent: { traceId: string; spanId: string } | undefined }) => {
    const span: RecordedSpan = { name, traceId: parent?.traceId ?? randomBytes(16).toString("hex"), spanId: randomBytes(8).toString("hex"), ended: false, ...(parent ? { parentSpanId: parent.spanId } : {}) };
    spans.push(span);
    return { run: <T>(fn: () => T) => scope.run(span, fn), end: () => { span.ended = true; } };
  };
  const parsed = (traceparent: string | undefined) => {
    const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/.exec(traceparent ?? "");
    return match ? { traceId: match[1]!, spanId: match[2]! } : undefined;
  };
  const port: ObservabilityPort = { ...createNoopObservabilityPort({}),
    activeTraceparent: () => { const active = scope.getStore(); return active && `00-${active.traceId}-${active.spanId}-01`; },
    trackRequest: (input) => start({ name: `${input.method} ${input.path}`, parent: scope.getStore() }),
    trackOperation: (input) => start({ name: input.name, parent: parsed(input.traceparent) ?? scope.getStore() }) };
  return { port, spans };
}

/** The real SQLite composition root on a disposable site, with the recording port as its provider selection. */
async function durableSiteDeps(t: TestContext, { port }: { port: ObservabilityPort }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-outbox-trace-"));
  let close = async () => {};
  const deps = await createSiteRouteDeps({}, { dbPath: path.join(dir, "content.db"), overrides: {
    siteBinding: { dir, name: "outbox-trace-fixture", dirOverridden: true, switcherCompatible: false },
    onStoreOpened: ({ store }, _optional = {}) => { close = () => store.close(); },
    bootProviderPlugins: async () => ({ observability: port, tracker: createTracker({ observability: port }), paymentProviders: () => [],
      telemetryStatus: () => [], sendTelemetryTest: async () => ({ providers: [] }), aiTraceSink: undefined,
      reapply: async () => "now", appliesAt: () => "now", dispose: async () => {} }),
  } });
  t.after(async () => {
    try { await deps.pluginRuntimeReady; await close(); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  await deps.identityReady;
  return deps;
}

/** The outbox, except no row can be claimed until `open()` holds: the worker cannot deliver early. */
function gatedOutbox<T extends { claimPending: (...args: never[]) => unknown }>({ outbox, open }: { outbox: T; open: () => boolean }): T {
  const gated = Object.create(outbox) as T;
  return Object.assign(gated, { claimPending: (...args: never[]) => (open() ? outbox.claimPending(...args) : Promise.resolve([])) });
}

function testEvent({ name, workspaceId }: { name: string; workspaceId: string }): DomainEvent {
  return { id: randomUUID(), name, workspaceId, occurredAt: new Date().toISOString(), payload: {} };
}

test("a background taxonomy subscriber span is a descendant of the producing request trace", async (t) => {
  const { port, spans } = recordingObservability();
  const deps = await durableSiteDeps(t, { port });
  const delivered: string[] = [];
  for (const eventName of ["taxonomy.created", "test.legacy-without-context", "test.command-path"]) {
    await deps.bus.subscribe({ eventName, handler: async (event) => {
      await deps.tracker.trace({ name: `subscriber:${event.name}`, run: () => { delivered.push(event.name); } });
    } });
  }
  // Command path: the change-set write that co-persists its event, inside a producing span.
  const command = port.trackRequest({ method: "POST", path: "/command-path" });
  assert.ok(command.run, "the recording request tracker must scope work (RequestTracker.run is optional on the port)");
  const actor = { id: "command-operator", kind: "user" } as const;
  const commandEvent = { ...testEvent({ name: "test.command-path", workspaceId: deps.workspaceId }), actor, actorId: actor.id };
  const { changeSets } = deps;
  assert.ok(changeSets.insert, "the durable root must support atomic change-set inserts");
  const insert = changeSets.insert.bind(changeSets);
  await command.run(() => insert({ record: { id: randomUUID(), workspaceId: deps.workspaceId, actor, actorId: actor.id, status: "applied", summary: "trace witness", createdAt: commandEvent.occurredAt }, items: [] }, { event: commandEvent }));
  command.end({ statusCode: 201, routePattern: "/command-path" });
  // A legacy row: enqueued outside any trace, so it carries no producer context at all.
  await deps.outbox.enqueue(testEvent({ name: "test.legacy-without-context", workspaceId: deps.workspaceId }));

  const requestEnded = () => spans.some((span) => span.name === "POST /api/admin/v1/taxonomy" && span.ended);
  const serving = createServingApp({ ...deps, outbox: gatedOutbox({ outbox: deps.outbox, open: requestEnded }) }, { outboxDrainIntervalMs: 20 });
  t.after(async () => {
    for (const handle of [serving.outboxDrainer, serving.trashSweeper, serving.themeWatcher, serving.formPullTrigger, serving.postGoLiveSweep, serving.webhookDeliveryWorker, serving.domainBindingSweeper, serving.siteSearchMaintenance]) {
      await (handle as { stop?: () => unknown }).stop?.();
    }
    await Promise.allSettled(serving.bootWork);
  });
  const { baseUrl, cookie } = await bootAuthenticated(serving.app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ name: "category", hierarchical: true }) });
  assert.equal(res.status, 201);
  assert.ok(await waitFor(() => delivered.length >= 3, 5_000), `delivered only ${JSON.stringify(delivered)}`);
  assert.deepEqual([...delivered].sort(), ["taxonomy.created", "test.command-path", "test.legacy-without-context"]);

  const only = (predicate: (span: RecordedSpan) => boolean) => { const found = spans.filter(predicate); assert.equal(found.length, 1, JSON.stringify(found)); return found[0]!; };
  const deliveryFor = (eventName: string) => only((span) => span.name === "outbox.deliver" && spans.some((child) => child.name === `subscriber:${eventName}` && child.parentSpanId === span.spanId && child.traceId === span.traceId));
  for (const [eventName, producer] of [["taxonomy.created", only((span) => span.name === "POST /api/admin/v1/taxonomy")], ["test.command-path", only((span) => span.name === "POST /command-path")]] as const) {
    const delivery = deliveryFor(eventName);
    assert.equal(delivery.traceId, producer.traceId, `${eventName}: the worker delivery is not in the producing request's trace`);
    assert.equal(delivery.parentSpanId, producer.spanId, `${eventName}: the worker delivery's parent is not the producing span`);
  }
  const legacy = deliveryFor("test.legacy-without-context");
  assert.equal(legacy.parentSpanId, undefined, "an event with no persisted context starts its own trace");
  assert.ok(spans.every((span) => span.name === "outbox.deliver" || span.traceId !== legacy.traceId || span.name.startsWith("subscriber:")));
});

test("a metric-capable observability provider receives the durable outbox depth as a gauge after each drain", async (t) => {
  const metrics: Array<{ name: string; value: number; kind: unknown }> = [];
  const port: ObservabilityPort = { ...createNoopObservabilityPort({}), supportsMetric: true,
    metric: (input, options = {}) => { metrics.push({ name: input.name, value: input.value, kind: options.kind }); } };
  const deps = await durableSiteDeps(t, { port });
  const { outboxDrainer } = createServingApp(deps, { outboxDrainIntervalMs: 20 });
  t.after(() => outboxDrainer.stop());
  // Once boot-time events have drained, the durable queue the gauge reads is empty.
  assert.ok(await waitFor(() => metrics.some(metric => metric.value === 0), 2_000), `no empty-queue depth gauge was sampled: ${JSON.stringify(metrics)}`);
  assert.deepEqual([...new Set(metrics.map(({ name, kind }) => `${name}:${String(kind)}`))], ["outbox.queue_depth:gauge"]);
});

test("an observability provider without metric support gets no outbox depth sampling", async (t) => {
  let metricCalls = 0;
  const port: ObservabilityPort = { ...createNoopObservabilityPort({}), supportsMetric: false, metric: () => { metricCalls++; } };
  const deps = await durableSiteDeps(t, { port });
  const { outboxDrainer } = createServingApp(deps, { outboxDrainIntervalMs: 20 });
  t.after(() => outboxDrainer.stop());
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(metricCalls, 0);
});
