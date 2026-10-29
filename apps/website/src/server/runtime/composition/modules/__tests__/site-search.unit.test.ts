import assert from "node:assert/strict";
import test from "node:test";

import { InMemorySettingsRepo, type AuthorizeFn } from "@jini-ai/core/settings";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import {
  createSearchProviderRegistry, searchIndexName, type SearchDocument, type SearchDocumentSource, type SearchProvider, type SearchProviderContext,
  type SearchSourceRecord, type SearchStatus,
} from "@jini-ai/search";
import { createInMemorySearchProvider, createInMemorySearchState, createStaticAccessPort } from "@jini-ai/search/testkit";

import type { LoadedSearchProviders } from "#src/features/agent-plugins/search-provider-registry";
import type { LoadPluginContributions } from "#src/features/agent-plugins/lifecycle";
import { createSettingsPrincipalLookup } from "#src/features/settings/index";
import { ensureSearchProviderSetting } from "#src/features/site-search/settings";
import type { KeyringPort } from "#src/features/webhooks/index";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { HttpRequest, HttpResponse } from "#src/platform/http/index";
import {
  bindSiteSearchPorts, createSearchContextResolver, createSiteSearchRuntime, SEARCH_CREDENTIAL_LABEL_PREFIX, SEARCH_PROVIDER_TIMEOUT_MS, searchCredentialLabel,
  startSiteSearchMaintenance, subscribeSiteSearchIndexer, type MaintenanceTimers, type SiteSearchPorts, type SiteSearchRuntime,
} from "../site-search.js";

/**
 * @file `modules/site-search.ts` with DI fakes only: the runtime (registry seeding, plugin
 * contributions, per-provider context), the bus subscription, the maintenance loop and the concrete
 * port binding. Providers are the Jini testkit's in-memory reference provider; no network, no DB.
 */

const WS = "ws-1";
const NOW = 1_760_000_000_000;

const post = (id: string, title: string): SearchDocument => ({
  key: { siteId: WS, workspaceId: WS, collection: "post", documentId: id }, revision: 1, url: `/blog/${id}`,
  title, body: `${title} body text`, visibility: { kind: "public" },
});

/** A one-collection source over a fixed record list. */
function source(records: readonly SearchSourceRecord[]): SearchDocumentSource {
  return {
    collection: "post", events: ["entry.published", "entry.updated"],
    documentIdOf: ({ event }) => event.aggregateId ?? null,
    load: async ({ documentId }) => records.find(record => record.key.documentId === documentId)
      ?? { key: { siteId: WS, workspaceId: WS, collection: "post", documentId }, revision: 2, document: null },
    scan: async () => ({ records }),
  };
}

interface Harness {
  ports: SiteSearchPorts;
  logs: string[];
  sent: HttpRequest[];
  credentialLabels: string[];
}

function harness(overrides: Partial<SiteSearchPorts> = {}, options: { active?: { providerId: string } } = {}): Harness {
  const state = createInMemorySearchState({}, options.active ? { active: [{ siteId: WS, providerId: options.active.providerId, generation: 1 }] } : {});
  const sent: HttpRequest[] = [];
  const credentialLabels: string[] = [];
  const docs = [post("p1", "Hello world"), post("p2", "Another story")];
  const ports: SiteSearchPorts = {
    workspaceId: WS, siteId: WS,
    sources: [source(docs.map(document => ({ key: document.key, revision: document.revision, document })))],
    indexState: state.indexState, targets: state.targets,
    access: createStaticAccessPort({ visible: docs.map(document => document.key) }),
    installId: async () => "Inst-ID",
    resolveCredential: async ({ label }) => { credentialLabels.push(label); return null; },
    httpClient: { send: async (request: HttpRequest): Promise<HttpResponse> => { sent.push(request); return { status: 204, headers: {}, body: new Uint8Array() } as unknown as HttpResponse; } },
    loadPluginProviders: async () => ({ items: [], refusals: [] }),
    isPluginActive: async () => true,
    audiencesForSession: async ({ sessionToken }) => (sessionToken ? ["members"] : []),
    readProviderSetting: async () => "builtin",
    writeProviderSetting: async () => undefined,
    now: () => NOW,
    ...overrides,
  };
  return { ports, logs: [], sent, credentialLabels };
}

const runtimeOf = (h: Harness, optional: Parameters<typeof createSiteSearchRuntime>[1] = {}) =>
  createSiteSearchRuntime(h.ports, { log: message => h.logs.push(message), ...optional });

/** A provider whose `query` records the context it was called with. */
function capturing(base: SearchProvider): { provider: SearchProvider; contexts: SearchProviderContext[] } {
  const contexts: SearchProviderContext[] = [];
  return {
    contexts,
    provider: { ...base, query: (ctx, required) => { contexts.push(ctx); return base.query(ctx, required); } },
  };
}

const vendor = (credentialKeys: readonly string[] = ["host", "apiKey"]): SearchProvider =>
  ({ ...createInMemorySearchProvider({}, { id: "vendor", label: "Vendor Search" }), credentialKeys });

const loaded = (...items: { id: string; pluginId: string; provider: SearchProvider }[]): LoadedSearchProviders => ({
  items: items.map(({ id, pluginId, provider }) => ({ contract: "search", pluginId, definition: { id, provider } })),
  refusals: [],
});

/** Run every queued timer callback, then let the pass it started finish. */
async function settle(): Promise<void> {
  for (let i = 0; i < 30; i += 1) await new Promise<void>(resolve => { setImmediate(resolve); });
}

function manualTimers(): { timers: MaintenanceTimers; queue: { run: () => void; ms: number; id: number }[]; cleared: unknown[]; fire(): Promise<void> } {
  const queue: { run: () => void; ms: number; id: number }[] = [];
  const cleared: unknown[] = [];
  let next = 0;
  return {
    queue, cleared,
    timers: {
      set: (run, ms) => { next += 1; queue.push({ run, ms, id: next }); return next; },
      clear: handle => { cleared.push(handle); const at = queue.findIndex(item => item.id === handle); if (at >= 0) queue.splice(at, 1); },
    },
    async fire() { queue.shift()!.run(); await settle(); },
  };
}

test("the credential label is the fixed prefix plus the provider label", () => {
  assert.equal(SEARCH_CREDENTIAL_LABEL_PREFIX, "Tovu Search — ");
  assert.equal(searchCredentialLabel({ providerLabel: "Meilisearch" }), "Tovu Search — Meilisearch");
});

test("with no built-in provider and no plugins, search is not configured and the default 'builtin' shows as unregistered", async () => {
  const h = harness();
  const runtime = runtimeOf(h);
  await runtime.ready;
  assert.equal(runtime.registry.has({ id: "builtin" }), false);
  assert.deepEqual(await runtime.service.query({ siteId: WS, workspaceId: WS, query: { text: "hello" } }), { status: "unavailable", reason: "not_configured" });
  const { timers, fire } = manualTimers();
  const loop = startSiteSearchMaintenance({ runtime }, { timers, log: message => h.logs.push(message) });
  await fire();
  await loop.stop();
  const status: SearchStatus = await runtime.service.status({ siteId: WS });
  assert.equal(status.active, null);
  assert.deepEqual(status.building, { providerId: "builtin", generation: 1, registered: false, counts: { pending: 0, indexed: 0, unknown: 0, failed: 0 } });
  assert.deepEqual(h.logs, []);
});

test("a registered built-in is seeded as core, filled by the boot rebuild, promoted, and queried with its full context", async () => {
  const h = harness();
  const { provider, contexts } = capturing(createInMemorySearchProvider({}, { id: "builtin", label: "Built-in", acceptsRestricted: true }));
  const storage = { kind: "content-kernel" };
  const runtime = runtimeOf(h, { builtinProvider: provider, storage });
  assert.equal(runtime.registry.get({ id: "builtin" })?.origin, "core");
  assert.equal(runtime.siteId, WS);
  assert.equal(runtime.workspaceId, WS);
  const { timers, fire } = manualTimers();
  const loop = startSiteSearchMaintenance({ runtime }, { timers });
  await fire();
  await loop.stop();
  const status = await runtime.service.status({ siteId: WS });
  assert.equal(status.active?.providerId, "builtin");
  assert.equal(status.active?.counts.indexed, 2);
  const result = await runtime.service.query({ siteId: WS, workspaceId: WS, query: { text: "hello" } }, { audiences: ["members"] });
  assert.equal(result.status, "ok");
  assert.deepEqual(result.status === "ok" ? result.page.hits.map(hit => hit.url) : [], ["/blog/p1"]);
  const ctx = contexts[0]!;
  assert.equal(ctx.indexName, searchIndexName({ installId: "Inst-ID", siteId: WS, providerId: "builtin", generation: 1 }));
  assert.deepEqual({ workspaceId: ctx.workspaceId, siteId: ctx.siteId, mode: ctx.mode, timeoutMs: ctx.timeoutMs, credentials: ctx.credentials, storage: ctx.storage },
    { workspaceId: WS, siteId: WS, mode: "live", timeoutMs: SEARCH_PROVIDER_TIMEOUT_MS, credentials: {}, storage });
  assert.equal(ctx.now(), NOW);
  // The provider-facing client is Jini's object-shaped port over Tovu's guarded request-first client.
  const request = { method: "GET", url: "https://search.example/health", headers: {} } as unknown as HttpRequest;
  assert.equal((await ctx.httpClient.send({ request })).status, 204);
  assert.deepEqual(h.sent, [request]);
});

test("no storage handle means the context carries none; timeoutMs is overridable", async () => {
  const h = harness({}, { active: { providerId: "builtin" } });
  const { provider, contexts } = capturing(createInMemorySearchProvider({}, { id: "builtin" }));
  const runtime = runtimeOf(h, { builtinProvider: provider, timeoutMs: 500 });
  await runtime.service.query({ siteId: WS, workspaceId: WS, query: { text: "hello" } });
  assert.equal("storage" in contexts[0]!, false);
  assert.equal(contexts[0]!.timeoutMs, 500);
});

test("plugin providers join after settingsReady; loader, reserved-id and registry refusals are all logged", async () => {
  const order: string[] = [];
  let release!: () => void;
  const settingsReady = new Promise<void>(resolve => { release = resolve; }).then(() => { order.push("settings"); });
  const h = harness({
    loadPluginProviders: async () => {
      order.push("plugins");
      const result = loaded(
        { id: "vendor", pluginId: "meili", provider: vendor() },
        { id: "builtin", pluginId: "squatter", provider: createInMemorySearchProvider({}, { id: "builtin" }) },
        { id: "vendor", pluginId: "copycat", provider: vendor() },
      );
      return { ...result, refusals: ["search provider 'x' from 'bad' was not loaded: its module is missing"] };
    },
  });
  const runtime = runtimeOf(h, { settingsReady });
  await settle();
  assert.deepEqual(order, []);
  release();
  await runtime.ready;
  assert.deepEqual(order, ["settings", "plugins"]);
  assert.equal(runtime.registry.get({ id: "vendor" })?.origin, "plugin");
  assert.equal(runtime.registry.has({ id: "builtin" }), false, "a plugin can never claim the built-in id");
  assert.equal(h.logs[0], "[site-search] search provider 'x' from 'bad' was not loaded: its module is missing");
  assert.equal(h.logs[1], "[site-search] search provider 'builtin' from 'squatter' was not loaded: that id is reserved for the owner's built-in provider");
  assert.match(h.logs[2]!, /^\[site-search\] .*vendor.*copycat/);
  assert.equal(h.logs.length, 3);
});

test("a failed settings chain still lets plugin providers load, and ready still resolves", async () => {
  const h = harness({ loadPluginProviders: async () => loaded({ id: "vendor", pluginId: "meili", provider: vendor() }) });
  const runtime = runtimeOf(h, { settingsReady: Promise.reject(new Error("settings boot failed")) });
  await runtime.ready;
  assert.equal(runtime.registry.has({ id: "vendor" }), true);
  assert.deepEqual(h.logs, []);
});

test("a loader that throws is logged and leaves only the built-in; ready still resolves", async () => {
  const h = harness({ loadPluginProviders: async () => { throw new Error("disk gone"); } });
  const runtime = runtimeOf(h);
  await runtime.ready;
  assert.deepEqual(h.logs, ["[site-search] plugin search providers could not be loaded (disk gone); only the built-in provider is available"]);
  const h2 = harness({ loadPluginProviders: () => Promise.reject("plain") });
  await runtimeOf(h2).ready;
  assert.match(h2.logs[0]!, /\(plain\)/);
});

test("a vendor without a saved credential is not configured; a saved one supplies exactly its declared keys", async () => {
  const saved = { baseUrl: "https://meili.example", token: "key-123" };
  let credential: typeof saved | null = null;
  const h = harness({ resolveCredential: async ({ label }) => { h.credentialLabels.push(label); return credential; } }, { active: { providerId: "vendor" } });
  const { provider, contexts } = capturing(vendor());
  const runtime = runtimeOf({ ...h, ports: { ...h.ports, loadPluginProviders: async () => loaded({ id: "vendor", pluginId: "meili", provider }) } });
  await runtime.ready;
  assert.deepEqual(await runtime.service.query({ siteId: WS, workspaceId: WS, query: { text: "hello" } }), { status: "unavailable", reason: "not_configured" });
  assert.deepEqual(h.credentialLabels, ["Tovu Search — Vendor Search"]);
  credential = saved;
  await runtime.service.query({ siteId: WS, workspaceId: WS, query: { text: "hello" } }, { audiences: ["members"] });
  assert.deepEqual(contexts[0]!.credentials, { host: "https://meili.example", apiKey: "key-123" });

  const hostOnly = capturing(vendor(["host"]));
  const h2 = harness({ resolveCredential: async () => saved, loadPluginProviders: async () => loaded({ id: "vendor", pluginId: "meili", provider: hostOnly.provider }) }, { active: { providerId: "vendor" } });
  const runtime2 = runtimeOf(h2);
  await runtime2.ready;
  await runtime2.service.query({ siteId: WS, workspaceId: WS, query: { text: "hello" } });
  assert.deepEqual(hostOnly.contexts[0]!.credentials, { host: "https://meili.example" }, "never more than declared");
});

test("a plugin provider disabled after boot is revoked at its next use, restored when re-enabled; an unreadable activation fails closed", async () => {
  const saved = { baseUrl: "https://meili.example", token: "key-123" };
  let activation: boolean | Error = true;
  const checked: string[] = [];
  const isPluginActive = async ({ pluginId }: { pluginId: string }) => {
    checked.push(pluginId);
    if (activation instanceof Error) throw activation;
    return activation;
  };
  const h = harness({ resolveCredential: async () => saved, isPluginActive }, { active: { providerId: "vendor" } });
  const { provider, contexts } = capturing(vendor());
  const writes: string[] = [];
  const tracked: SearchProvider = { ...provider, remove: (ctx, required) => { writes.push(required.tombstones[0]!.key.documentId); return provider.remove(ctx, required); } };
  const runtime = runtimeOf({ ...h, ports: { ...h.ports, loadPluginProviders: async () => loaded({ id: "vendor", pluginId: "meili", provider: tracked }) } });
  await runtime.ready;
  assert.equal((await runtime.indexer.backfill({ siteId: WS, workspaceId: WS })).done, true);
  const query = () => runtime.service.query({ siteId: WS, workspaceId: WS, query: { text: "hello" } });
  const publish = (id: string) => runtime.indexer.handleEvent({ event: { name: "entry.published", workspaceId: WS, occurredAt: new Date(NOW).toISOString(), aggregateId: id } });
  assert.equal((await query()).status, "ok");
  await publish("gone-1");
  assert.deepEqual([contexts.length, writes], [1, ["gone-1"]]);

  activation = false;
  assert.deepEqual(await query(), { status: "unavailable", reason: "not_configured" });
  await publish("gone-2");
  assert.deepEqual([contexts.length, writes], [1, ["gone-1"]], "no vendor query and no content upload once the plugin is disabled");
  assert.deepEqual(h.logs.filter(line => line.includes("plugin 'meili'")), ["[site-search] plugin 'meili' is no longer active; its search provider is revoked"], "the revocation is logged once");

  activation = true;
  assert.equal((await query()).status, "ok");
  assert.equal(contexts.length, 2);
  assert.equal(h.logs.at(-1), "[site-search] plugin 'meili' is active again; its search provider is restored");

  activation = new Error("activations.json is corrupt");
  assert.deepEqual(await query(), { status: "unavailable", reason: "not_configured" });
  assert.equal(contexts.length, 2);
  assert.ok(h.logs.some(line => line.includes("the activation of plugin 'meili' could not be read (activations.json is corrupt)")));
  assert.ok(checked.every(id => id === "meili") && checked.length >= 6, "re-read on every provider use");
});

test("a core (built-in) provider never consults plugin activation", async () => {
  let consulted = 0;
  const h = harness({ isPluginActive: async () => { consulted += 1; return false; } }, { active: { providerId: "builtin" } });
  const runtime = runtimeOf(h, { builtinProvider: createInMemorySearchProvider({}, { id: "builtin", label: "Built-in", acceptsRestricted: true }) });
  await runtime.ready;
  assert.equal((await runtime.indexer.backfill({ siteId: WS, workspaceId: WS })).written, 2);
  assert.equal((await runtime.service.query({ siteId: WS, workspaceId: WS, query: { text: "hello" } })).status, "ok");
  assert.equal(consulted, 0);
});

test("an unreadable credential and an unsupported credential key are logged and leave the vendor unconfigured", async () => {
  const h = harness({ resolveCredential: async () => { throw new Error("cannot decrypt"); }, loadPluginProviders: async () => loaded({ id: "vendor", pluginId: "meili", provider: vendor() }) }, { active: { providerId: "vendor" } });
  const runtime = runtimeOf(h);
  await runtime.ready;
  assert.deepEqual(await runtime.service.query({ siteId: WS, workspaceId: WS, query: { text: "hello" } }), { status: "unavailable", reason: "not_configured" });
  assert.deepEqual(h.logs, ['[site-search] the "Tovu Search — Vendor Search" credential could not be read (cannot decrypt)']);

  const h2 = harness({ resolveCredential: async () => ({ baseUrl: "https://x.example", token: "t" }), loadPluginProviders: async () => loaded({ id: "vendor", pluginId: "algolia", provider: vendor(["appId"]) }) }, { active: { providerId: "vendor" } });
  const runtime2 = runtimeOf(h2);
  await runtime2.ready;
  assert.deepEqual(await runtime2.service.query({ siteId: WS, workspaceId: WS, query: { text: "hello" } }), { status: "unavailable", reason: "not_configured" });
  assert.deepEqual(h2.logs, ["[site-search] search provider 'vendor' declares credential key 'appId', which a saved credential cannot supply (only host and apiKey)"]);
});

test("a missing install id is logged once and leaves every target unconfigured", async () => {
  let calls = 0;
  const h = harness({ installId: async () => { calls += 1; throw new Error("no site key"); } }, { active: { providerId: "builtin" } });
  const runtime = runtimeOf(h, { builtinProvider: createInMemorySearchProvider({}, { id: "builtin" }) });
  for (let i = 0; i < 2; i += 1) {
    assert.deepEqual(await runtime.service.query({ siteId: WS, workspaceId: WS, query: { text: "hello" } }), { status: "unavailable", reason: "not_configured" });
  }
  assert.equal(calls, 1);
  assert.deepEqual(h.logs, ["[site-search] this install has no id (no site key); search stays unconfigured until the site key is restored"]);
});

test("the context resolver answers null for a provider the registry does not hold, without touching the vault or install id", async () => {
  const touched: string[] = [];
  const resolve = createSearchContextResolver({
    registry: createSearchProviderRegistry(), isPluginActive: async () => true, log: message => touched.push(message),
    installId: async () => { touched.push("installId"); return "x"; },
    resolveCredential: async () => { touched.push("vault"); return null; },
    httpClient: { send: async () => ({}) as HttpResponse }, now: () => NOW,
  });
  assert.equal(await resolve({ target: { siteId: WS, providerId: "gone", generation: 1 }, workspaceId: WS }), null);
  assert.deepEqual(touched, []);
});

test("events are written only for this site's own workspace", async () => {
  const h = harness({}, { active: { providerId: "builtin" } });
  const runtime = runtimeOf(h, { builtinProvider: createInMemorySearchProvider({}, { id: "builtin" }) });
  const event = { name: "entry.published", occurredAt: new Date(NOW).toISOString(), aggregateId: "p1" };
  await runtime.indexer.handleEvent({ event: { ...event, workspaceId: "ws-other" } });
  const target = { siteId: WS, providerId: "builtin", generation: 1 };
  const key = { siteId: WS, workspaceId: WS, collection: "post", documentId: "p1" };
  assert.equal(await h.ports.indexState.get({ target, key }), null);
  await runtime.indexer.handleEvent({ event: { ...event, workspaceId: WS } });
  assert.equal((await h.ports.indexState.get({ target, key }))?.revision, 1, "written (the index was never created, so the provider refused it: a failed row)");
});

test("audiences, provider-setting read and write delegate to the ports", async () => {
  const writes: unknown[] = [];
  const h = harness({ readProviderSetting: async () => "vendor", writeProviderSetting: async input => { writes.push(input); } });
  const runtime = runtimeOf(h);
  assert.deepEqual(await runtime.audiencesForSession({ sessionToken: "s" }), ["members"]);
  assert.deepEqual(await runtime.audiencesForSession({}), []);
  assert.equal(await runtime.readProviderSetting(), "vendor");
  await runtime.writeProviderSetting({ principalId: "agent", providerId: "builtin" });
  assert.deepEqual(writes, [{ principalId: "agent", providerId: "builtin" }]);
});

test("the default logger is console.error", async (t) => {
  const errors = t.mock.method(console, "error", () => undefined);
  const h = harness({ loadPluginProviders: async () => { throw new Error("boom"); } });
  await createSiteSearchRuntime(h.ports).ready;
  assert.equal(errors.mock.callCount(), 1);
  assert.match(String(errors.mock.calls[0]!.arguments[0]), /boom/);
});

test("subscribeSiteSearchIndexer subscribes once per source event, waits for ready, and propagates handler errors", async () => {
  const subscriptions: { eventName: string; handler: (event: never) => Promise<void> }[] = [];
  const bus = { subscribe: async (input: { eventName: string; handler: (event: never) => Promise<void> }) => { subscriptions.push(input); return () => undefined; } };
  subscribeSiteSearchIndexer({ bus });
  assert.equal(subscriptions.length, 0, "no runtime, no subscriptions");
  const handled: unknown[] = [];
  let ready = false;
  const runtime = {
    ready: settle().then(() => { ready = true; }),
    indexer: { eventNames: ["entry.published", "entry.unpublished"], handleEvent: async ({ event }: { event: unknown }) => {
      assert.equal(ready, true, "the handler waits for plugin providers");
      if ((event as { fail?: boolean }).fail) throw new Error("db locked");
      handled.push(event);
    } },
  } as unknown as SiteSearchRuntime;
  subscribeSiteSearchIndexer({ bus, runtime });
  assert.deepEqual(subscriptions.map(s => s.eventName), ["entry.published", "entry.unpublished"]);
  await subscriptions[0]!.handler({ name: "entry.published" } as never);
  assert.deepEqual(handled, [{ name: "entry.published" }]);
  await assert.rejects(subscriptions[1]!.handler({ fail: true } as never), /db locked/);
});

/** A maintenance-only runtime fake recording every call. */
function maintenanceRuntime(overrides: { status?: () => Promise<Pick<SearchStatus, "active" | "building">>; readProviderSetting?: () => Promise<string>; reconcile?: () => Promise<unknown>; backfill?: () => Promise<unknown>; ready?: Promise<void> } = {}) {
  const calls: unknown[] = [];
  const runtime = {
    siteId: WS, workspaceId: WS, ready: overrides.ready ?? Promise.resolve(),
    service: { status: async () => { calls.push("status"); return overrides.status ? overrides.status() : { siteId: WS, active: null, building: null }; } },
    readProviderSetting: overrides.readProviderSetting ?? (async () => "vendor"),
    indexer: {
      startRebuild: async (input: unknown) => { calls.push(["startRebuild", input]); },
      reconcile: async (scope: unknown, optional: unknown) => { calls.push(["reconcile", scope, optional]); return overrides.reconcile?.(); },
      backfill: async (scope: unknown, optional: unknown) => { calls.push(["backfill", scope, optional]); return overrides.backfill?.(); },
    },
  } as unknown as SiteSearchRuntime;
  return { runtime, calls };
}

test("maintenance: no runtime is a no-op handle", async () => {
  await startSiteSearchMaintenance({}).stop();
});

test("maintenance: boot rebuild once for the configured provider, then bounded reconcile + backfill every pass", async () => {
  const { runtime, calls } = maintenanceRuntime();
  const { timers, queue, fire, cleared } = manualTimers();
  const loop = startSiteSearchMaintenance({ runtime }, { timers, intervalMs: 1000, reconcileLimit: 7, pageBudget: 3 });
  assert.equal(queue[0]!.ms, 0, "the first pass runs right away");
  await fire();
  const scope = { siteId: WS, workspaceId: WS };
  assert.deepEqual(calls, ["status", ["startRebuild", { siteId: WS, workspaceId: WS, providerId: "vendor" }], ["reconcile", scope, { limit: 7 }], ["backfill", scope, { pageBudget: 3 }]]);
  assert.equal(queue[0]!.ms, 1000);
  await fire();
  assert.deepEqual(calls.slice(4), [["reconcile", scope, { limit: 7 }], ["backfill", scope, { pageBudget: 3 }]], "the boot rebuild runs once");
  await loop.stop();
  assert.equal(cleared.length, 1);
});

test("maintenance: a site with an active or building target is not rebuilt; defaults are 50 rows and 5 pages", async () => {
  const target = { providerId: "builtin", generation: 1, registered: true, counts: { pending: 0, indexed: 0, unknown: 0, failed: 0 } };
  for (const status of [{ active: target, building: null }, { active: null, building: target }]) {
    const { runtime, calls } = maintenanceRuntime({ status: async () => status });
    const { timers, fire } = manualTimers();
    const loop = startSiteSearchMaintenance({ runtime }, { timers });
    await fire();
    await loop.stop();
    const scope = { siteId: WS, workspaceId: WS };
    assert.deepEqual(calls, ["status", ["reconcile", scope, { limit: 50 }], ["backfill", scope, { pageBudget: 5 }]]);
  }
});

test("maintenance: failures are logged, never thrown, and a failed boot rebuild is retried on the next pass", async () => {
  let settingFails = true;
  const { runtime, calls } = maintenanceRuntime({
    readProviderSetting: async () => { if (settingFails) throw new Error("bad setting"); return "builtin"; },
    reconcile: async () => { throw new Error("db busy"); },
  });
  const logs: [string, unknown][] = [];
  const { timers, fire } = manualTimers();
  const loop = startSiteSearchMaintenance({ runtime }, { timers, log: (message, error) => logs.push([message, (error as Error).message]) });
  await fire();
  assert.deepEqual(logs, [
    ["[site-search] boot rebuild failed; retrying after the idle interval", "bad setting"],
    ["[site-search] reconcile failed; retrying after the idle interval", "db busy"],
  ]);
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === "backfill"), "a failed step does not skip the next");
  settingFails = false;
  await fire();
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === "startRebuild"), "retried and succeeded");
  await loop.stop();
});

test("maintenance: stop during a pass skips the remaining steps and schedules nothing more", async () => {
  let releaseReconcile!: () => void;
  const { runtime, calls } = maintenanceRuntime({
    status: async () => ({ active: { providerId: "b", generation: 1, registered: true, counts: { pending: 0, indexed: 0, unknown: 0, failed: 0 } }, building: null }),
    reconcile: () => new Promise<void>(resolve => { releaseReconcile = resolve; }),
  });
  const { timers, queue } = manualTimers();
  const loop = startSiteSearchMaintenance({ runtime }, { timers });
  queue.shift()!.run();
  await settle();
  const stopping = loop.stop();
  releaseReconcile();
  await stopping;
  await settle();
  assert.equal(calls.some(call => Array.isArray(call) && call[0] === "backfill"), false);
  assert.equal(queue.length, 0);
});

test("maintenance: a pass whose ready rejects is logged and rescheduled; the default logger is console.error", async (t) => {
  const errors = t.mock.method(console, "error", () => undefined);
  const { runtime } = maintenanceRuntime({ ready: Promise.reject(new Error("never")) });
  const { timers, queue, fire } = manualTimers();
  const loop = startSiteSearchMaintenance({ runtime }, { timers });
  await fire();
  assert.equal(errors.mock.calls[0]!.arguments[0], "[site-search] maintenance pass failed; retrying after the idle interval");
  assert.equal(queue.length, 1);
  await loop.stop();
});

test("maintenance: the default timers run a real unref'd pass and stop cleanly", async () => {
  const { runtime, calls } = maintenanceRuntime();
  const loop = startSiteSearchMaintenance({ runtime }, { intervalMs: 5 });
  for (let i = 0; i < 50 && calls.filter(call => Array.isArray(call) && call[0] === "backfill").length < 2; i += 1) {
    await new Promise<void>(resolve => { setTimeout(resolve, 5); });
  }
  await loop.stop();
  assert.ok(calls.filter(call => Array.isArray(call) && call[0] === "backfill").length >= 2);
});

test("bindSiteSearchPorts wires the CMS sources, the SQL stores, the vault, member sessions, settings and the plugin loader", async () => {
  const settingsRepo = new InMemorySettingsRepo();
  const clock = { nowIso: () => new Date(NOW).toISOString(), nowMs: () => NOW };
  let counter = 0;
  const ids = { newId: () => { counter += 1; return `setting-${counter}`; } };
  const principals = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) });
  const allowAll: AuthorizeFn = async () => ({ allowed: true, reason: "test" });
  await ensureSearchProviderSetting({ deps: { settingsRepo, clock, ids, principals }, systemPrincipalId: "system" });
  const memberCalls: unknown[] = [];
  const credentialCalls: unknown[] = [];
  const contributionCalls: unknown[] = [];
  const httpClient = { send: async () => ({ status: 200 }) as unknown as HttpResponse };
  const ports = bindSiteSearchPorts({
    workspaceId: WS, kernel: {} as ContentKernel, now: () => NOW,
    settingsRepo, settingsWriteDeps: { repo: settingsRepo, clock, ids, authorize: allowAll, principals },
    keyring: { derive: async () => new Uint8Array(32).fill(7) } as unknown as KeyringPort,
    resolveCredentialByLabel: async input => {
      credentialCalls.push(input);
      return input.label.endsWith("Meilisearch") ? { baseUrl: "https://meili.example", connection: { token: "k" } } : null;
    },
    resolveMemberContext: async input => {
      memberCalls.push(input);
      return input.sessionToken ? { isAuthenticated: true, activeTierIds: ["gold"], isPaid: true } : { isAuthenticated: false, activeTierIds: [], isPaid: false };
    },
    httpClient,
    loadContributions: (async (input: unknown) => { contributionCalls.push(input); return { items: [], refusals: [] }; }) as unknown as LoadPluginContributions,
    isPluginActive: async ({ pluginId }) => pluginId === "meilisearch",
  });
  assert.equal(await ports.isPluginActive({ pluginId: "meilisearch" }), true);
  assert.equal(await ports.isPluginActive({ pluginId: "other" }), false);
  assert.equal(ports.siteId, WS, "v1: the workspace id is the site id");
  assert.equal(ports.workspaceId, WS);
  assert.deepEqual(ports.sources.map(s => s.collection), ["post", "page"]);
  assert.equal(typeof ports.indexState.counts, "function");
  assert.equal(typeof ports.targets.promote, "function");
  assert.equal(typeof ports.access.visibleKeys, "function");
  assert.equal(ports.httpClient, httpClient);
  assert.equal(ports.now(), NOW);
  assert.match(await ports.installId(), /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(await ports.resolveCredential({ label: "Tovu Search — Meilisearch" }), { baseUrl: "https://meili.example", token: "k" });
  assert.equal(await ports.resolveCredential({ label: "Tovu Search — Other" }), null);
  assert.deepEqual(credentialCalls[0], { workspaceId: WS, label: "Tovu Search — Meilisearch" });
  assert.deepEqual(await ports.audiencesForSession({}), []);
  assert.deepEqual(await ports.audiencesForSession({ sessionToken: "tok" }), ["members", "paid", "tier:gold"]);
  assert.deepEqual(memberCalls, [
    { workspaceId: WS, nowIso: new Date(NOW).toISOString() },
    { workspaceId: WS, nowIso: new Date(NOW).toISOString(), sessionToken: "tok" },
  ]);
  assert.equal(await ports.readProviderSetting(), "builtin");
  await ports.writeProviderSetting({ principalId: "owner", providerId: "meilisearch" });
  assert.equal(await ports.readProviderSetting(), "meilisearch");
  assert.deepEqual(await ports.loadPluginProviders(), { items: [], refusals: [] });
  assert.equal((contributionCalls[0] as { workspaceId: string }).workspaceId, WS);
});
