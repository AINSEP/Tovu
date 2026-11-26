import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import express from "express";
import { createRouteDeps } from "../../app.js";
import { createByokToolSurface, type ByokToolSurface } from "#src/assistant/index";
import { setExecutionCredential } from "#src/assistant/execution-credential-store";
import { registerAuthRoutes } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { startStubProviderServer } from "#src/server/__tests__/helpers/stub-provider-server";
import { BYOK_TURN_PATH, createAssistantByokModule } from "../assistant-byok.js";

const REPLY = 'event: message_start\ndata: {"type":"message_start","message":{"id":"reply","role":"assistant","content":[],"model":"fixture","usage":{"input_tokens":1,"output_tokens":0}}}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":0}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n';

/** A promise the test resolves itself, so one setup await can be held open while the browser leaves. */
function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}

/** Real surface whose federation wait the test controls. Every live-run allocation lists the
 * registry first, so the counter is the witness that no live-tool-run entry was ever created. */
function heldFederationSurface({ deps, wait, t }: { deps: Parameters<typeof createByokToolSurface>[0]; wait?: () => Promise<void>; t: TestContext }) {
  const real = createByokToolSurface(deps, { installExtensions: false });
  const counts = { list: 0 };
  const list = real.registry.list.bind(real.registry);
  t.mock.method(real.registry, "list", (input: Parameters<typeof list>[0]) => { counts.list++; return list(input); });
  const surface: ByokToolSurface = {
    ...real,
    awaitFederation: wait ? async () => { await wait(); return { settled: true }; } : real.awaitFederation,
  };
  return { surface, counts };
}

for (const held of ["federation", "credential"] as const) {
  test(held === "federation" ? "closing during federation starts no paid BYOK turn" : "closing during the stored credential wait starts no paid BYOK turn", { timeout: 15_000 }, async t => {
  const routeErrors = createRouteIncidentReporter().errors;
    const gate = deferred();
    const reached = deferred();
    const serverClosed = deferred();
    const deps = createRouteDeps();
    await deps.identityReady;
    const { surface, counts } = heldFederationSurface({
      deps: { ...deps, reporter: routeErrors.reporter }, t,
      ...(held === "federation" ? { wait: async () => { reached.resolve(); await gate.promise; } } : {}),
    });
    let providerCalls = 0;
    const providerHit = deferred();
    const providerUrl = await startStubProviderServer(t, () => { providerCalls++; providerHit.resolve(); return { status: 200, body: REPLY }; });
    const headWrites: number[] = [];
    const app = express();
    app.use(express.json());
    registerAuthRoutes({ errors: routeErrors, app, deps });
    app.use(BYOK_TURN_PATH, (_req, res, next) => {
      const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => typeof res;
      (res as unknown as { writeHead: (...args: unknown[]) => typeof res }).writeHead = (...args: unknown[]) => { headWrites.push(Number(args[0])); return writeHead(...args); };
      res.on("close", () => serverClosed.resolve());
      next();
    });
    createAssistantByokModule({ routeDeps: deps, reporter: routeErrors.reporter }, { toolSurface: surface }).registerRoutes?.({ app });
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const byok = { protocol: "anthropic", apiKey: "fixture-key", model: "fixture", baseUrl: providerUrl };
    if (held === "credential") {
      const me = await (await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } })).json() as { user: { id: string } };
      const repo = deps.adminExecutionCredentialRepo;
      await setExecutionCredential({ repo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
        { workspaceId: deps.workspaceId, principalId: me.user.id, ...byok });
      // The module captured this repo object when it was built, so hold its vault read in place.
      const vault = (repo as unknown as { vault: { findOne: (...args: unknown[]) => Promise<unknown> } }).vault;
      const findOne = vault.findOne.bind(vault);
      vault.findOne = async (...args: unknown[]) => { reached.resolve(); await gate.promise; return findOne(...args); };
    }
    const listsBefore = counts.list;
    const browser = new AbortController();
    const response = fetch(`${baseUrl}${BYOK_TURN_PATH}`, { method: "POST", signal: browser.signal, headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }], ...(held === "federation" ? { byok } : {}) }) });
    response.catch(() => undefined);
    await reached.promise;
    browser.abort();
    await serverClosed.promise;
    gate.resolve();
    // The unfixed route reaches the local stub provider within a few event-loop turns of release.
    await Promise.race([providerHit.promise, new Promise(resolve => setTimeout(resolve, 750))]);
    assert.equal(providerCalls, 0, "a closed turn must not call the paid provider");
    assert.deepEqual(headWrites, [], "a closed turn must not open the SSE stream");
    assert.equal(counts.list - listsBefore, 0, "a closed turn must not allocate a live-tool-run entry");
  });
}
