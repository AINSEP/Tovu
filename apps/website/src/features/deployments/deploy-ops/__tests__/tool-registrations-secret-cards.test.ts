import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { SurfaceEmitter } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { buildDeployOpsRegistrations, contributeDeployOpsTools } from "../tool-registrations.js";
import { fixture, execution } from "./example-ops-fixture.js";

/** The overwrite card's details, its decline/abandon outcomes, and the contributor's registry override. */
const SITE_KEY = "ab".repeat(32);
const API = "https://api.example-host.dev/v1/targets/shop/secrets";
type Route = { status: number; body: unknown };

async function harness(table: Record<string, Route>, onAuthorize: (permission: string) => void = () => {}) {
  const f = await fixture();
  const calls: string[] = [];
  f.deps.deployOpsHttpClient = { send: async (request: { method: string; url: string }) => {
    calls.push(`${request.method} ${request.url}`);
    const route = table[`${request.method} ${request.url}`];
    assert.ok(route, `unexpected ${request.method} ${request.url}`);
    return { status: route.status, headers: {}, bodyText: JSON.stringify(route.body) };
  } } as never;
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const deps: Parameters<typeof buildDeployOpsRegistrations>[0] = { ...f.deps, readSiteKey: () => SITE_KEY, authorize: async ({ permission }: { permission: string }) => { onAuthorize(permission); return { allowed: true, reason: "matched" }; } };
  const list = buildDeployOpsRegistrations(deps).find(r => r.descriptor.id === "deployment_ops_list_secrets")!;
  const set = buildDeployOpsRegistrations(deps, { surfaceExchanges: store, assertChatDeleteAllowed: async () => {} }).find(r => r.descriptor.id === "deployment_ops_set_secret")!;
  return { calls, store, set, list };
}
const listed = (...names: string[]): Route => ({ status: 200, body: { secrets: names.map(name => ({ name, digest: `d-${name}`, updated_at: "2026-10-05T00:00:00Z" })) } });

test("a different stored value opens a replace card naming the source; declining writes nothing", async () => {
  const h = await harness({ [`GET ${API}`]: listed("API_KEY"), [`GET ${API}/API_KEY?reveal=true`]: { status: 200, body: { name: "API_KEY", digest: "d", value: "older-value" } } });
  let payload = "";
  const emitSurface: SurfaceEmitter = async emission => {
    payload = JSON.stringify(emission.payload);
    const exchangeId = h.store.findTypedAnswerTarget({ principalId: "principal", toolId: "deployment_ops_set_secret" })!;
    assert.deepEqual(h.store.deliver({ exchangeId, principalId: "principal", params: { decision: "cancel" } }, { toolId: "deployment_ops_set_secret" }), { ok: true });
  };
  const result = await h.set.handler(execution({ platform: "example-host", target: "shop", name: "API_KEY", source: { kind: "site-key" } }), { emitSurface }) as Record<string, unknown>;
  assert.match(payload, /Replace secret API_KEY on shop\?/);
  assert.match(payload, /New value from/);
  assert.match(payload, /different from the new value/);
  assert.match(payload, /on the next deploy/);
  assert.equal(result.changed, false);
  assert.equal(result.cancelled, true);
  assert.equal(h.calls.some(call => call.startsWith("POST")), false);
  assert.equal(payload.includes("older-value") || payload.includes(SITE_KEY), false);
});

test("an unreadable stored value says it could not be compared; an abort while the click is re-authorized is abandoned", async () => {
  const controller = new AbortController();
  let writeChecks = 0;
  const h = await harness({ [`GET ${API}`]: listed("API_KEY"), [`GET ${API}/API_KEY?reveal=true`]: { status: 403, body: {} } }, permission => {
    if (permission === "custom-credentials.write" && ++writeChecks === 2) controller.abort();
  });
  let payload = "";
  const emitSurface: SurfaceEmitter = async emission => {
    payload = JSON.stringify(emission.payload);
    const exchangeId = h.store.findTypedAnswerTarget({ principalId: "principal", toolId: "deployment_ops_set_secret" })!;
    h.store.deliver({ exchangeId, principalId: "principal", params: { decision: "confirm" } }, { toolId: "deployment_ops_set_secret" });
  };
  const result = await h.set.handler({ ...execution({ platform: "example-host", target: "shop", name: "API_KEY", source: { kind: "site-key" } }), signal: controller.signal }, { emitSurface }) as Record<string, unknown>;
  assert.match(payload, /could not be read to compare/);
  assert.equal(writeChecks, 2);
  assert.equal(result.changed, false);
  assert.equal(result.reason, "abandoned");
  assert.equal(h.calls.some(call => call.startsWith("POST")), false);
});

test("contributeDeployOpsTools builds from the supplied registry, or from the deps' registry when none is given", async () => {
  const f = await fixture();
  const hostOnly = { ...f.registry, list: () => f.registry.list().filter(p => p.descriptor.id === "example-host") };
  const narrowed = contributeDeployOpsTools({ registry: hostOnly });
  assert.equal(narrowed.domain, "deploy-ops");
  const status = (registrations: ReturnType<typeof buildDeployOpsRegistrations>) => (registrations.find(r => r.descriptor.id === "deployment_ops_status")!.descriptor.inputSchema as { properties: { platform: { enum: string[] } } }).properties.platform.enum;
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) };
  assert.deepEqual(status(narrowed.build(f.deps as never, surfaces)), ["example-host"]);
  assert.deepEqual(status(contributeDeployOpsTools().build(f.deps as never, surfaces)), ["example-host", "example-observer", "example-pipeline"]);
});

test("copying from another secret on the target writes the source's value; list goes through the same handler", async () => {
  const h = await harness({
    [`GET ${API}/OLD_KEY?reveal=true`]: { status: 200, body: { name: "OLD_KEY", digest: "d", value: "copied-value" } },
    [`GET ${API}/NEW_KEY?reveal=true`]: { status: 404, body: {} },
    [`GET ${API}`]: listed("OLD_KEY"),
    [`POST ${API}/NEW_KEY`]: { status: 201, body: { version: 3 } },
  });
  const result = await h.set.handler(execution({ platform: "example-host", target: "shop", name: "NEW_KEY", source: { kind: "secret", name: "OLD_KEY" }, credentialLabel: "ops" })) as Record<string, unknown>;
  assert.equal(result.changed, true);
  assert.deepEqual(result.source, { kind: "secret", name: "OLD_KEY" });
  assert.equal(h.calls.includes(`POST ${API}/NEW_KEY`), true);
  assert.equal(JSON.stringify(result).includes("copied-value"), false);
  await assert.rejects(h.set.handler(execution({ platform: "example-host", target: "shop", name: "NEW_KEY", source: { kind: "secret", name: "OLD_KEY", value: "smuggled" } })), { message: "source must be {kind:'typed'}, {kind:'site-key'} or {kind:'secret', name}." });
  const listedResult = await h.list.handler(execution({ platform: "example-host", target: "shop" })) as { secrets: Array<{ name: string }> };
  assert.deepEqual(listedResult.secrets.map(secret => secret.name), ["OLD_KEY"]);
  await assert.rejects(h.set.handler(execution({ platform: "example-host", target: "shop", name: "NEW_KEY", source: { kind: "secret", name: 7 } })), { message: "source must be {kind:'typed'}, {kind:'site-key'} or {kind:'secret', name}." });
});
