import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { createNoopObservabilityPort, instrumentStorageKernel, isNoopObservabilityPort, type ObservabilityPort } from "#src/platform/observability/index";
import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";

/**
 * @file The real composition root (`deps.ts`) decorates its storage kernels with the observability
 * port only when an OTLP endpoint is configured. Set: the content and chat kernels' queries reach a
 * loopback stand-in OTLP collector as DB spans. Unset: the port is the no-op one and the content
 * kernel is left undecorated.
 *
 * "Undecorated" is read through `instrumentStorageKernel`'s own contract — a kernel that is already
 * decorated is left alone — by decorating it again with a recording probe port: the probe records
 * a query only when nothing decorated the kernel first.
 */

const OTEL_ENV = ["OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "OTEL_BSP_SCHEDULE_DELAY"] as const;

/** Sets (or, for `undefined`, deletes) the OTel env vars for the test, restoring them after. */
function withOtelEnv(t: TestContext, values: Partial<Record<(typeof OTEL_ENV)[number], string>>): void {
  const previous = Object.fromEntries(OTEL_ENV.map((name) => [name, process.env[name]]));
  for (const name of OTEL_ENV) {
    if (values[name] === undefined) delete process.env[name];
    else process.env[name] = values[name];
  }
  t.after(() => {
    for (const name of OTEL_ENV) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
}

async function siteDeps(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-deps-otel-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const deps = await createSiteRouteDeps(path.join(dir, "content.db"));
  await deps.identityReady;
  return deps;
}

/** A non-no-op port that only counts DB queries. */
function probePort(): { port: ObservabilityPort; queries: () => number } {
  let count = 0;
  const noop = createNoopObservabilityPort({});
  const port: ObservabilityPort = { ...noop, trackDbQuery: (input) => { count += 1; return noop.trackDbQuery(input); } };
  return { port, queries: () => count };
}

/** Every DB span's `db.collection.name` the stand-in collector has received, as OTLP/JSON. */
function dbCollections(bodies: readonly string[]): Set<string> {
  const names = new Set<string>();
  for (const body of bodies) {
    const parsed = JSON.parse(body) as { resourceSpans?: { scopeSpans?: { spans?: { attributes?: { key: string; value: { stringValue?: string } }[] }[] }[] }[] };
    for (const resource of parsed.resourceSpans ?? []) for (const scope of resource.scopeSpans ?? []) for (const span of scope.spans ?? []) {
      const attributes = span.attributes ?? [];
      if (!attributes.some((attribute) => attribute.key === "db.system.name")) continue;
      const collection = attributes.find((attribute) => attribute.key === "db.collection.name")?.value.stringValue;
      if (collection) names.add(collection);
    }
  }
  return names;
}

test("OTLP endpoint set: the content and chat kernels are decorated, and their queries reach the collector as DB spans", async (t) => {
  const bodies: string[] = [];
  const collector = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => { bodies.push(Buffer.concat(chunks).toString("utf8")); res.setHeader("content-type", "application/json"); res.end("{}"); });
  });
  collector.listen(0, "127.0.0.1");
  await once(collector, "listening");
  t.after(async () => { collector.closeAllConnections(); await new Promise<void>((resolve) => collector.close(() => resolve())); });
  withOtelEnv(t, { OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `http://127.0.0.1:${(collector.address() as AddressInfo).port}/v1/traces`, OTEL_BSP_SCHEDULE_DELAY: "20" });

  const deps = await siteDeps(t);

  assert.equal(isNoopObservabilityPort(deps.observability), false);
  const probe = probePort();
  instrumentStorageKernel({ kernel: deps.contentKernel, observability: probe.port });
  await deps.contentKernel.run((db) => db.selectFrom("posts").select("id").limit(1).execute());
  assert.equal(probe.queries(), 0, "the content kernel was already decorated by the composition root");
  await deps.chatRunLedger.unlessSettled({ conversationId: "conv-otel", messageId: "msg-otel", runId: "run-otel" }, async () => undefined);

  for (let waited = 0; waited < 5_000; waited += 25) {
    const collections = dbCollections(bodies);
    if (collections.has("posts") && collections.has("ai_chat_messages")) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const collections = dbCollections(bodies);
  assert.ok(collections.has("posts"), `content kernel query exported: ${[...collections].join(", ")}`);
  assert.ok(collections.has("ai_chat_messages"), `chat kernel query exported: ${[...collections].join(", ")}`);
});

test("no OTLP endpoint: the port is the no-op one and the content kernel is left undecorated", async (t) => {
  withOtelEnv(t, {});

  const deps = await siteDeps(t);

  assert.equal(isNoopObservabilityPort(deps.observability), true);
  const probe = probePort();
  instrumentStorageKernel({ kernel: deps.contentKernel, observability: probe.port });
  await deps.contentKernel.run((db) => db.selectFrom("posts").select("id").limit(1).execute());
  assert.equal(probe.queries(), 1, "only the probe decorated the content kernel");
});
