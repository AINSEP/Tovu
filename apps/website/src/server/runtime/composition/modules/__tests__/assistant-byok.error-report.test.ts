import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import { createTracker } from "@jini-ai/diagnostics/observability/node";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";
import { createNoopObservabilityPort, type ErrorReport, type ObservabilityPort } from "@jini-ai/diagnostics/observability";
import { createAiGenerationSink, withProductAnalyticsGuards, type ProductAiGeneration } from "@jini-ai/analytics/product";

import { createRouteDeps } from "../../app.js";
import { createByokToolSurface } from "#src/assistant/index";
import { registerAuthRoutes } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { BYOK_TURN_PATH, createAssistantByokModule } from "../assistant-byok.js";

/** @file A failed admin BYOK turn reaches `ObservabilityPort.reportError` once, without the key or chat text. */

// Built at runtime so no secret-shaped literal sits in the repo.
const secret = ["sk", "ant", "T".repeat(12) + "u".repeat(12)].join("-");

for (const throwAfterError of [false, true]) {
test(`a failed BYOK turn reports once, including a throw after its error event (${throwAfterError})`, async (t) => {
  // A provider that drops every connection: the turn streams an error event.
  const provider = createServer((req) => { req.socket.destroy(); });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  t.after(() => provider.close());
  const reports: ErrorReport[] = [];
  const observability: ObservabilityPort = { ...createNoopObservabilityPort({}), reportError: (report) => { reports.push(report); } };
  const generations: ProductAiGeneration[] = [];
  const analytics = withProductAnalyticsGuards({ inner: { capture() {}, identify() {}, captureAiGeneration: (event) => { generations.push(event); } }, consent: () => true });
  const deps = { ...createRouteDeps(), tracker: createTracker({ observability }), observability, aiTraceSink: createAiGenerationSink({ analytics, userId: "site:fixture" })! };
  const app = express();
  app.use(express.json());
  let thrownAfterError = false;
  app.use((req, res, next) => {
    if (throwAfterError && req.path === BYOK_TURN_PATH) {
      const write = res.write.bind(res);
      res.write = ((...args: Parameters<typeof res.write>) => {
        if (!thrownAfterError && String(args[0]).includes('event: error')) {
          thrownAfterError = true;
          throw new Error('response write failed after provider error');
        }
        return write(...args);
      }) as typeof res.write;
    }
    next();
  });
  registerAuthRoutes(app, deps);
  createAssistantByokModule(deps, createByokToolSurface(deps, { installExtensions: false })).registerRoutes?.(app);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const response = await fetch(`${baseUrl}${BYOK_TURN_PATH}`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({
    messages: [{ role: "user", content: "my private question" }],
    byok: { protocol: "anthropic", apiKey: secret, model: "fixture", baseUrl: `http://127.0.0.1:${(provider.address() as AddressInfo).port}` },
  }) });
  await response.text();
  assert.equal(thrownAfterError, throwAfterError);
  assert.equal(reports.length, 1, JSON.stringify(reports.map(({ context }) => context)));
  assert.equal(reports[0]!.context.operation, "assistant.run");
  assert.deepEqual(Object.keys(reports[0]!.context.attributes ?? {}).sort(), ["agent", "runId"]);
  const error = reports[0]!.error as Error;
  const sent = JSON.stringify({ context: reports[0]!.context, message: error.message, stack: error.stack });
  assert.ok(!sent.includes(secret) && !sent.includes("private question"));
  assert.equal(generations.length, 1);
  assert.equal(generations[0]!.properties.isError, true);
  assert.equal(generations[0]!.properties.provider, "anthropic");
  assert.ok(!JSON.stringify(generations).includes(secret));
  assert.ok(!JSON.stringify(generations).includes("private question"));
});

}
