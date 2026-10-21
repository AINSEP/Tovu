import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SurfaceEmission } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { askThenReport } from "@jini-ai/daemon/surface-exchanges";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { InMemoryCustomCredentialSetRepo } from "../../../custom-credentials/repo.memory.js";
import { forceRemove } from "../../../agent-plugins/__tests__/fixtures/force-remove.js";
import { loadDeployOpsRegistryFromSource } from "../registry.js";
import { collectTypedDeploySecret } from "../typed-secret-card.js";
import { fixture, execution } from "./ops-fixture.js";

/**
 * Direct contract of the typed-secret card: the card's failure, recovery and adapter-less branches,
 * driven through a real surface-exchange store and the bundled Fly adapter over a scripted HTTP fake.
 */
const API = "https://api.machines.dev/v1/apps/shop/secrets";
const STORAGE = "The credential could not be saved or unlocked. Check the site credential store.";
type Route = { status: number; body: unknown };

async function harness(table: Record<string, Route>) {
  const f = await fixture();
  const calls: string[] = [];
  f.deps.deployOpsHttpClient = { send: async (request: { method: string; url: string }) => {
    calls.push(`${request.method} ${request.url}`);
    const route = table[`${request.method} ${request.url}`];
    assert.ok(route, `unexpected ${request.method} ${request.url}`);
    return { status: route.status, headers: {}, bodyText: JSON.stringify(route.body) };
  } } as never;
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  return { f, calls, store, surfaces: { surfaceExchanges: store, askThenReport, assertChatDeleteAllowed: async () => {} } };
}

/** Deliver `value` to the first card and record every emission (card, then outcome). */
function submitter(store: ReturnType<typeof createSurfaceExchangeStore>, value: string, beforeDeliver: () => void = () => {}) {
  const emitted: SurfaceEmission[] = [];
  const emitSurface = async (surface: SurfaceEmission) => {
    emitted.push(surface);
    if (emitted.length > 1) return;
    const text = (surface.payload as { resource: { resource: { text: string } } }).resource.resource.text;
    const exchangeId = text.match(/__exchangeId"\s*:\s*"([^"]+)"/)![1]!;
    beforeDeliver();
    assert.deepEqual(store.deliver({ exchangeId, principalId: "principal", params: { value } }, { toolId: "deployment_ops_set_secret" }), { ok: true });
  };
  return { emitted, emitSurface };
}
const outcomeText = (emission: SurfaceEmission | undefined) => (emission?.payload as { resource: { resource: { text: string } } } | undefined)?.resource.resource.text ?? "";

test("a vendor failure after submit returns fixed storage text and a failure outcome, never the value", async () => {
  const h = await harness({ [`GET ${API}`]: { status: 200, body: { secrets: [] } }, [`GET ${API}/STRIPE_KEY?show_secrets=true`]: { status: 404, body: {} }, [`POST ${API}/STRIPE_KEY`]: { status: 500, body: { error: "echo typed-canary-value" } } });
  const { emitted, emitSurface } = submitter(h.store, "typed-canary-value");
  const permits: number[] = [];
  const result = await collectTypedDeploySecret({ ctx: execution({}) as never, deps: h.f.deps as never, surfaces: h.surfaces as never, input: { platform: "fly", target: "shop", name: "STRIPE_KEY", source: { kind: "typed" } }, permit: async () => { permits.push(1); } }, { emitSurface });
  assert.deepEqual(result, { changed: false, message: STORAGE });
  assert.equal(permits.length, 1);
  assert.equal(h.calls.includes(`POST ${API}/STRIPE_KEY`), true);
  assert.equal(emitted.length, 2);
  assert.equal(JSON.stringify([result, emitted]).includes("typed-canary-value"), false);
  assert.match(outcomeText(emitted[1]), /failure/);
});

test("a credential removed while the card is open returns the credential-setup recovery and emits no outcome", async () => {
  const h = await harness({});
  const saved = h.f.deps.customCredentialSetRepo;
  let deleted = false;
  const deps = { ...h.f.deps };
  Object.defineProperty(deps, "customCredentialSetRepo", { get: () => (deleted ? new InMemoryCustomCredentialSetRepo() : saved) });
  const { emitted, emitSurface } = submitter(h.store, "typed-canary-value", () => { deleted = true; });
  const result = await collectTypedDeploySecret({ ctx: execution({}) as never, deps: deps as never, surfaces: h.surfaces as never, input: { platform: "fly", target: "shop", name: "STRIPE_KEY", source: { kind: "typed" }, credentialLabel: "ops" }, permit: async () => {} }, { emitSurface });
  assert.equal((result as { executed: boolean }).executed, false);
  assert.equal((result as { credentialSetup: { label?: string } }).credentialSetup !== undefined, true);
  assert.deepEqual(h.calls, []);
  assert.equal(emitted.length, 1, "a recovery replaces no card with an outcome");
  assert.equal(JSON.stringify(result).includes("typed-canary-value"), false);
});

test("a platform without a secrets adapter refuses before any card is shown", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-ops-no-secrets-"));
  try {
    await writeFile(path.join(root, "tovu-deploy-ops.json"), JSON.stringify({ schemaVersion: 1, platforms: [{ id: "plain", label: "Plain", module: "ops.mjs", hosts: ["api.machines.dev"] }] }));
    await writeFile(path.join(root, "ops.mjs"), "export default { status() {}, logs() {} };\n");
    const registry = await loadDeployOpsRegistryFromSource({ pluginId: "plain", packageRoot: root });
    const h = await harness({});
    const emitted: unknown[] = [];
    const result = await collectTypedDeploySecret({ ctx: execution({}) as never, deps: { ...h.f.deps, loadDeployOps: async () => registry } as never, surfaces: h.surfaces as never, input: { platform: "plain", target: "shop", name: "STRIPE_KEY", source: { kind: "typed" } }, permit: async () => { assert.fail("no permit without an adapter"); } }, { emitSurface: async surface => { emitted.push(surface); } }).catch((error: Error) => error);
    assert.equal(emitted.length, 0);
    assert.ok(result instanceof Error);
    assert.equal(result.message, "This platform has no secrets adapter.");
    assert.deepEqual(h.calls, []);
  } finally { await forceRemove(root); }
});

test("without surfaces the card refuses headless collection and options default to empty", async () => {
  const h = await harness({});
  await assert.rejects(collectTypedDeploySecret({ ctx: execution({}) as never, deps: h.f.deps as never, input: { platform: "fly", target: "shop", name: "STRIPE_KEY", source: { kind: "typed" } }, permit: async () => {} }), { message: "A typed deployment secret requires an interactive secure card. Nothing was changed." });
  assert.deepEqual(h.calls, []);
});

test("a typed dry run against an absent secret reports the comparison, changes nothing and shows a failure outcome", async () => {
  const h = await harness({ [`GET ${API}`]: { status: 200, body: { secrets: [] } }, [`GET ${API}/STRIPE_KEY?show_secrets=true`]: { status: 404, body: {} } });
  const { emitted, emitSurface } = submitter(h.store, "typed-canary-value");
  const result = await collectTypedDeploySecret({ ctx: execution({}) as never, deps: h.f.deps as never, surfaces: h.surfaces as never, input: { platform: "fly", target: "shop", name: "STRIPE_KEY", source: { kind: "typed" }, dryRun: true }, permit: async () => {} }, { emitSurface });
  assert.equal((result as { changed: boolean }).changed, false);
  assert.equal((result as { dryRun?: true }).dryRun, true);
  assert.equal(h.calls.some(call => call.startsWith("POST")), false);
  assert.equal(emitted.length, 2);
  assert.match(outcomeText(emitted[1]), /failure/);
  assert.equal(JSON.stringify([result, emitted]).includes("typed-canary-value"), false);
});
