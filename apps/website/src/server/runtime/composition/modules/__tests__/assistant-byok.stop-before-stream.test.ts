import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createRouteDeps } from "../../app.js";
import { createByokToolSurface } from "#src/assistant/index";
import { registerAuthRoutes } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { startStubProviderServer } from "#src/server/__tests__/helpers/stub-provider-server";
import { BYOK_TURN_PATH, createAssistantByokModule } from "../assistant-byok.js";

/** @file B141: an owner's Stop (the browser closing the request) that lands while the turn is still
 * awaiting its pre-stream setup must stop the turn before the paid provider call, not after it. */

/** Polls `check` across macrotasks; resolves true as soon as it holds, false after `timeoutMs`. */
async function eventually({ check, timeoutMs }: { check: () => boolean; timeoutMs: number }): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return check();
}

test("a Stop during the pre-stream awaits never reaches the provider", async (t) => {
  const deps = createRouteDeps();
  const app = express();
  app.use(express.json());
  let serverClosed = false;
  app.use((req, res, next) => { if (req.path === BYOK_TURN_PATH) res.on("close", () => { serverClosed = true; }); next(); });
  registerAuthRoutes({ app, deps });
  // The turn's pre-stream await is held open by a deferred `ready`, so the Stop lands while it is pending.
  let releaseReady!: () => void;
  let readyRequested = false;
  const surface = createByokToolSurface(deps, { installExtensions: false });
  const ready = new Promise<void>(resolve => { releaseReady = resolve; });
  let federationAwaited = false;
  const deferredSurface = { ...surface,
    get ready() { readyRequested = true; return ready; },
    awaitFederation: (...args: Parameters<typeof surface.awaitFederation>) => { federationAwaited = true; return surface.awaitFederation(...args); } };
  createAssistantByokModule({ routeDeps: deps }, { toolSurface: deferredSurface }).registerRoutes?.({ app });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  let providerCalls = 0;
  const providerUrl = await startStubProviderServer(t, () => { providerCalls += 1; return { status: 200, body: "" }; });

  const browser = new AbortController();
  const pending = fetch(`${baseUrl}${BYOK_TURN_PATH}`, { method: "POST", signal: browser.signal, headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({
    messages: [{ role: "user", content: "Hello" }], byok: { protocol: "anthropic", apiKey: ["fixture", "key"].join("-"), model: "fixture-model", baseUrl: providerUrl },
  }) }).catch(() => undefined);
  assert.ok(await eventually({ check: () => readyRequested, timeoutMs: 5000 }), "turn never reached its pre-stream await");
  browser.abort();
  await pending;
  assert.ok(await eventually({ check: () => serverClosed, timeoutMs: 5000 }), "server never observed the closed request");
  releaseReady();

  // Negative assertion: a local stub answers in milliseconds, so an unstopped turn calls it well within this window.
  assert.equal(await eventually({ check: () => providerCalls > 0 || federationAwaited, timeoutMs: 1500 }), false,
    `stopped turn kept going (provider calls ${providerCalls}, federation awaited ${federationAwaited})`);
});
