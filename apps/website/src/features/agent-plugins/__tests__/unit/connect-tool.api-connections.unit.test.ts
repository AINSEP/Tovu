/**
 * @file `agent_plugin_connect`'s API-connection branch (C4b): a plugin that declares no OAuth MCP
 * server but one plugin-declared API connection connects through the REAL
 * `composeAgentPluginConnections` host (the shared acme-office fake provider and public callback,
 * all on 127.0.0.1), showing the same waiting card and returning only a status and the opaque
 * `connectionRef`. Also the refusals (none / several declared, no interactive channel, an
 * unconfigured client), the bounded wait, abort, and a failed final card update.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import type { SurfaceEmission, ToolExecutionContext } from "@jini-ai/core";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";

import { testSiteLayoutContext } from "#src/__tests__/fixtures/site-layout-context";
import { InMemoryExternalMcpServerRepo } from "#src/assistant/index";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import {
  PLUGIN, PUBLIC_URL, WORKSPACE, accessToken, compose, followConsent, providerUrlOf, mountCallback, refreshToken, startAcmeProvider, stopAcmeProvider, type AcmeComposition,
} from "#src/server/runtime/composition/__tests__/fixtures/acme-provider";
import { runAgentPluginConnect, type AgentPluginConnectToolDeps } from "../../connect-tool.js";

before(startAcmeProvider);
after(stopAcmeProvider);

const surfaces = (): AssistantSurfaceDeps => ({ surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) });

function ctxFor(signal: AbortSignal = new AbortController().signal): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: "admin-1" }, run: { id: "run-1" }, input: { pluginId: PLUGIN }, signal };
}

/** Route deps for a plugin with no MCP servers, connecting through `apiConnections` when given (`null` wait: the tool's built-in defaults). The
 *  external-MCP store is real but stays empty: this branch never provisions an MCP row. */
function depsFor(apiConnections: AgentPluginConnectToolDeps["apiConnections"], waitTimeoutMs: number | null = 5_000): AgentPluginConnectToolDeps {
  const keyring = new InMemoryKeyring();
  return testSiteLayoutContext({
    workspaceId: WORKSPACE, clock: { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() },
    externalMcpServerRepo: new InMemoryExternalMcpServerRepo(), siteAssistantSecretKeyring: keyring, siteAssistantSecretSealer: new AesGcmSecretSealer(keyring), authorize: async () => ({ allowed: true, reason: "test" }), ...(waitTimeoutMs === null ? {} : { pollIntervalMs: 5, waitTimeoutMs }),
    resolveInstalledPlugin: async () => ({ servers: {} }), ...(apiConnections ? { apiConnections } : {}),
  });
}

const htmlOf = (emission: SurfaceEmission) => (emission.payload.resource as { resource: { text: string } }).resource.text;
/** The card's sign-in link, as the card's script hands it to the host page's link opener. */
function signInUrlOf(html: string): string {
  const literal = /var OPEN_URL = ("(?:[^"\\]|\\.)*");/.exec(html)?.[1];
  assert.ok(literal, "the waiting card carries a sign-in link");
  return JSON.parse(literal) as string;
}

/** Runs the tool; `onCard` sees each emitted card (by default the "browser" consents on the waiting card). */
async function connect(composition: AcmeComposition, options: { readonly onCard?: (html: string, index: number) => Promise<void>; readonly signal?: AbortSignal; readonly waitTimeoutMs?: number; readonly pluginId?: string } = {}) {
  mountCallback(composition);
  const cards: string[] = [];
  const onCard = options.onCard ?? (async (html: string, index: number) => { if (index === 0) assert.equal((await followConsent(signInUrlOf(html))).status, 200); });
  const result = await runAgentPluginConnect({ routeDeps: depsFor(composition.apiConnections, options.waitTimeoutMs), surfaces: surfaces(), ctx: ctxFor(options.signal), pluginId: options.pluginId ?? PLUGIN }, {
    emitSurface: async (emission) => { const html = htmlOf(emission); cards.push(html); await onCard(html, cards.length - 1); },
  });
  return { result, cards };
}

test("a declared API connection connects through the real host: waiting card, then connected card, status and connectionRef only", async () => {
  const { result, cards } = await connect(await compose());
  assert.equal(result.status, "connected");
  assert.equal(typeof result.connectionRef, "string");
  assert.deepEqual(Object.keys(result).sort(), ["connectionRef", "status"]);
  assert.equal(cards.length, 2);
  // F1: the card links to the host's sign-in link on the site's public address; the provider URL
  // (with its state) never reaches the transcript.
  assert.equal(new URL(signInUrlOf(cards[0]!)).origin, PUBLIC_URL);
  assert.doesNotMatch(cards[0]!, /auth\.acme\.test/);
  assert.ok(!cards[0]!.includes(providerUrlOf(signInUrlOf(cards[0]!)).searchParams.get("state")!), "the OAuth state is not on the card");
  assert.match(providerUrlOf(signInUrlOf(cards[0]!)).hostname, /^auth\.acme\.test$/);
  assert.doesNotMatch(cards[1]!, /var OPEN_URL/, "the connected card carries no sign-in link");
  const everything = JSON.stringify([result, cards]);
  assert.ok(!everything.includes(accessToken) && !everything.includes(refreshToken), "no token in the result or any card");
});

test('API sign-in displays only the declaring plugin oauth card copy', async () => {
  const composition = await compose();
  mountCallback(composition);
  const card = { pluginId: PLUGIN, providerId: 'office-sign-in', label: 'Office', saveKind: 'oauth' as const,
    category: 'general', baseUrl: 'https://api.acme.test', title: 'Connect your office account',
    intro: 'Use the files you choose.', permissions: 'Read selected files only.', keyHint: 'Account sign-in' };
  const cards: string[] = [];
  // Assign rather than spread: spreading would evaluate the fixture's lazy layout getters outside the test site.
  const result = await runAgentPluginConnect({ routeDeps: Object.assign(depsFor(composition.apiConnections), { loadPluginCredentialCards: async (workspaceId: string) => {
    assert.equal(workspaceId, WORKSPACE);
    return [{ ...card, pluginId: 'other-plugin', title: 'Wrong owner copy' }, { ...card, saveKind: 'api', title: 'Wrong kind copy' }, card];
  } }), surfaces: surfaces(), ctx: ctxFor(), pluginId: PLUGIN }, { emitSurface: async emission => {
    const html = htmlOf(emission); cards.push(html);
    if (cards.length === 1) assert.equal((await followConsent(signInUrlOf(html))).status, 200);
  } });
  assert.equal(result.status, 'connected');
  for (const copy of [card.title, card.intro, card.permissions]) assert.ok(cards[0]!.includes(copy));
  assert.doesNotMatch(cards[0]!, /Wrong owner copy|Wrong kind copy/);
  assert.equal(cards.length, 2);
});

test("a plugin that declares neither an OAuth MCP server nor an API connection is refused", async () => {
  await assert.rejects(connect(await compose(), { pluginId: "other-plugin" }), { name: "ToolInputError", message: "agent_plugin_connect: 'other-plugin' declares no OAuth-authenticated MCP server to connect." });
});

test("a plugin declaring more than one API connection is refused before any sign-in starts", async () => {
  const composition = await compose();
  const [declared] = await composition.apiConnections.host.listConnections({ pluginId: PLUGIN });
  const host = Object.assign(Object.create(Object.getPrototypeOf(composition.apiConnections.host)), composition.apiConnections.host, { listConnections: async () => [declared!, declared!] });
  const cards: string[] = [];
  await assert.rejects(
    runAgentPluginConnect({ routeDeps: depsFor({ host }), surfaces: surfaces(), ctx: ctxFor(), pluginId: PLUGIN }, { emitSurface: async (emission) => void cards.push(htmlOf(emission)) }),
    { name: "ToolInputError", message: `agent_plugin_connect: '${PLUGIN}' declares 2 API connections — this Tovu version connects one per plugin.` },
  );
  assert.deepEqual(cards, []);
});

test("without an interactive channel the sign-in card cannot be shown and the call fails with that reason", async () => {
  const composition = await compose();
  await assert.rejects(runAgentPluginConnect({ routeDeps: depsFor(composition.apiConnections), surfaces: surfaces(), ctx: ctxFor(), pluginId: PLUGIN }), {
    message: "agent_plugin_connect: this execution context has no interactive channel (no emitSurface), so no sign-in card can be shown.",
  });
});

// Encodes C3's fix: connect.ts's hosted branch used to call `host.serviceFor` outside its
// `asToolError` wrap, so this refusal escaped as a raw ApiConnectionError.
test("an unconfigured sign-in client refuses as a ToolInputError carrying the safe, actionable message under the tool prefix", async () => {
  // No client id configured for this runtime.
  await assert.rejects(connect(await compose({ TOVU_PUBLIC_URL: "https://site.acme-test.invalid" })), {
    name: "ToolInputError",
    message: "agent_plugin_connect: Acme Office is not set up on this site: its sign-in client is not configured. Ask the operator to configure it, then retry.",
  });
});

test("nobody finishing within the bounded wait returns waiting-for-sign-in with the ref, and no connected card", async () => {
  const { result, cards } = await connect(await compose(), { onCard: async () => {}, waitTimeoutMs: 30 });
  assert.equal(result.status, "waiting-for-sign-in");
  assert.equal(typeof result.connectionRef, "string");
  assert.equal(cards.length, 1);
});

test("aborting while parked closes the card's exchange and returns waiting-for-sign-in promptly", async () => {
  const controller = new AbortController();
  const started = Date.now();
  const { result, cards } = await connect(await compose(), { signal: controller.signal, onCard: async () => { setImmediate(() => controller.abort()); } });
  assert.equal(result.status, "waiting-for-sign-in");
  assert.equal(cards.length, 1);
  assert.ok(Date.now() - started < 2_000, "the abort ends the 5 s wait early");
});

test("a failed connected-card update never turns a real connection into a tool failure", async () => {
  const { result, cards } = await connect(await compose(), {
    onCard: async (html, index) => {
      if (index === 0) return void (await followConsent(signInUrlOf(html)));
      throw new Error("card channel closed");
    },
  });
  assert.equal(result.status, "connected");
  assert.equal(cards.length, 2);
});

test("an abort before any card exists is harmless: the call still ends as waiting-for-sign-in", async () => {
  const composition = await compose();
  const controller = new AbortController();
  const real = composition.apiConnections.host;
  // Aborts while the host reads the connection's status, i.e. before the waiting card is opened.
  const host = Object.assign(Object.create(Object.getPrototypeOf(real)), real, {
    statusOf: (input: Parameters<typeof real.statusOf>[0]) => { controller.abort(); return real.statusOf(input); },
  });
  const cards: string[] = [];
  const result = await runAgentPluginConnect({ routeDeps: depsFor({ host }), surfaces: surfaces(), ctx: ctxFor(controller.signal), pluginId: PLUGIN }, { emitSurface: async (emission) => void cards.push(htmlOf(emission)) });
  assert.equal(result.status, "waiting-for-sign-in");
  assert.equal(cards.length, 1, "the card is still shown once, then the aborted wait ends at once");
});

/** A typed stand-in that delegates to `target` except for `overrides` (keeps class methods). */
function wrap<T extends object>(target: T, overrides: Partial<T>): T {
  return Object.assign(Object.create(Object.getPrototypeOf(target) as object) as T, target, overrides);
}

test("aborting closes the card at once, even while a status read is still in flight", async () => {
  const composition = await compose();
  const controller = new AbortController();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const real = composition.apiConnections.host;
  const host = wrap(real, {
    serviceFor: (input) => { const service = real.serviceFor(input); return wrap(service, { getStatus: async (status) => { await gate; return service.getStatus(status); } }); },
  });
  const store = surfaces().surfaceExchanges;
  let closes = 0;
  const transport: AssistantSurfaceDeps = { surfaceExchanges: wrap(store, { open: (input) => { const exchange = store.open(input); return wrap(exchange, { close: (options) => { closes += 1; return exchange.close(options); } }); } }) };
  let closedAtAbort = -1;
  const result = await runAgentPluginConnect({ routeDeps: depsFor({ host }), surfaces: transport, ctx: ctxFor(controller.signal), pluginId: PLUGIN }, {
    emitSurface: async () => { setImmediate(() => { controller.abort(); closedAtAbort = closes; release(); }); },
  });
  assert.equal(closedAtAbort, 1, "the card closed on the abort itself, not when the pending read returned");
  assert.equal(result.status, "waiting-for-sign-in");
});

test("with no poll interval or wait bound configured, the built-in defaults still let a finished sign-in connect", async () => {
  const composition = await compose();
  mountCallback(composition);
  let shown = 0;
  const result = await runAgentPluginConnect({ routeDeps: depsFor(composition.apiConnections, null), surfaces: surfaces(), ctx: ctxFor(), pluginId: PLUGIN }, {
    // The "browser" finishes before the first status read, so the default interval is never slept.
    emitSurface: async (emission) => { if (shown++ === 0) assert.equal((await followConsent(signInUrlOf(htmlOf(emission)))).status, 200); },
  });
  assert.equal(result.status, "connected");
});
