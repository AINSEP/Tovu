import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { createNoopObservabilityPort, instrumentStorageKernel, isNoopObservabilityPort, type ObservabilityPort } from "#src/platform/observability/index";
import { createSiteRouteDeps, type CreateSiteRouteDepsOverrides } from "#src/server/runtime/composition/deps";

/**
 * @file The real composition root (`deps.ts`) decorates its storage kernels with the observability
 * port that provider-plugin selection returns (`provider-plugins.ts`). Configured (a fake selection
 * here; no vendor): the content and chat kernels' queries reach that port, and its teardown runs
 * with the store. Nothing configured (the real selection, no provider plugin installed): the port is
 * the no-op one and the content kernel is left undecorated.
 *
 * "Undecorated" is read through `instrumentStorageKernel`'s own contract — a kernel that is already
 * decorated is left alone — by decorating it again with a recording probe port: the probe records
 * queries only when nothing decorated the kernel first.
 */

async function siteDeps(t: TestContext, overrides: Partial<CreateSiteRouteDepsOverrides> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-deps-otel-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const deps = await createSiteRouteDeps(path.join(dir, "content.db"), overrides);
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

test("a configured provider selection: content and chat kernels are decorated with its port, which RouteDeps carries", async (t) => {
  const tables = new Set<string>();
  const noop = createNoopObservabilityPort({});
  const port: ObservabilityPort = { ...noop, trackDbQuery: (input) => {
    const tracker = noop.trackDbQuery(input);
    return { ...tracker, end: (outcome) => { if (outcome.table) tables.add(outcome.table); tracker.end(outcome); } };
  } };
  let disposed = 0;
  const deps = await siteDeps(t, { bootProviderPlugins: async () => ({ observability: port, productAnalytics: { capture() {}, identify() {} }, aiTraceSink: undefined, reapply: async () => "now", appliesAt: () => "now", dispose: async () => { disposed += 1; } }) });

  assert.equal(deps.observability, port);
  assert.equal(isNoopObservabilityPort(deps.observability), false);
  const probe = probePort();
  const kernel = deps.contentKernel;
  assert.ok(kernel, "site deps carry a content kernel");
  instrumentStorageKernel({ kernel, observability: probe.port });
  await kernel.run((db) => db.selectFrom("posts").select("id").limit(1).execute());
  assert.equal(probe.queries(), 0, "the content kernel was already decorated by the composition root");
  await deps.chatRunLedger.unlessSettled({ conversationId: "conv-otel", messageId: "msg-otel", runId: "run-otel" }, async () => undefined);
  assert.ok(tables.has("posts"), `content kernel query tracked: ${[...tables].join(", ")}`);
  assert.ok(tables.has("ai_chat_messages"), `chat kernel query tracked: ${[...tables].join(", ")}`);
  assert.equal(disposed, 0);
});

test("no provider plugin installed: the port is the no-op one and the content kernel is left undecorated", async (t) => {
  const deps = await siteDeps(t);

  assert.equal(isNoopObservabilityPort(deps.observability), true);
  const probe = probePort();
  const kernel = deps.contentKernel;
  assert.ok(kernel, "site deps carry a content kernel");
  instrumentStorageKernel({ kernel, observability: probe.port });
  await kernel.run((db) => db.selectFrom("posts").select("id").limit(1).execute());
  // Only the probe decorated the kernel, so it saw the query (a `run` may issue more than one).
  assert.ok(probe.queries() >= 1, "only the probe decorated the content kernel");
});
