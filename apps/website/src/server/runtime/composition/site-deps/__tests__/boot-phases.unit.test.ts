import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { providerPluginOf } from "@jini-ai/user-management/project-keys/service";
import { readOutboxTraceParent } from "../../../../../contracts/core/events/outbox-trace-parent.js";

/**
 * @file The boot phases' own wiring: every sibling composer is replaced by a recorder, so each test can call the
 * lazy getters and ports a phase hands on and check they read the right late-built value (the injected getter's,
 * or the sibling output composed further down the same phase), and that the phase's own effects (disposal order,
 * revision watch, lifecycle flush, kernel instrumentation, refusal logging) do what they say.
 */

const seen = new Map<string, Record<string, unknown>>();
const parts = new Map<string, object>();
/** The stable stand-in for output `key` of `composer`, so identity checks can name where a value came from. */
const part = (composer: string, key: string): object => {
  const id = `${composer}.${key}`;
  if (!parts.has(id)) parts.set(id, { part: id });
  return parts.get(id) as object;
};
const recorder = (composer: string) => (required: Record<string, unknown>) => {
  seen.set(composer, required);
  return new Proxy({}, { get: (_target, key) => typeof key === "string" ? part(composer, key) : undefined });
};
const required = (composer: string): Record<string, unknown> => {
  const value = seen.get(composer);
  assert.ok(value, `${composer} was not composed`);
  return value;
};
const call = (composer: string, key: string): unknown => (required(composer)[key] as () => unknown)();

const SIBLINGS: Record<string, string> = {
  "agent-plugin-bootstrap": "composeAgentPluginBootstrap", "media-storage": "composeMediaStorage", "store-basics": "composeStoreBasics",
  "plugin-runtime": "composeSitePluginRuntime", "identity-settings": "composeIdentitySettings", "boot-data": "startBootData",
  "events-origin": "composeEventsOrigin", "trash-stores": "composeTrashStores", "trash-follow-up-hooks": "composeTrashFollowUpHooks",
  "trash-adapters": "composeTrashAdapters", "trash-service": "composeTrashService", redirects: "composeRedirects",
  "database-journal": "composeDatabaseJournal", "content-repos": "composeContentRepos", "content-resolvers-comments": "composeContentResolversComments",
  "site-keys-members": "composeSiteKeysMembers", "mail-http": "composeMailHttp",
  "content-stores": "composeContentStores", "publishing-stores-themes": "composePublishingStoresThemes", "publish-apply": "composePublishContentApplyPort",
  "outbound-connections": "composeOutboundConnections",
};
for (const [file, name] of Object.entries(SIBLINGS)) mock.module(new URL(`../${file}.js`, import.meta.url).href, { namedExports: { [name]: recorder(name) } });
const projectKeys = { projectKeys: "composed" };
mock.module(new URL("../project-keys.js", import.meta.url).href, { namedExports: { compositionProjectKeys: (input: Record<string, unknown>) => { seen.set("compositionProjectKeys", input); return projectKeys; } } });

const watches: { spec: Record<string, (input?: unknown) => unknown>; options: { readSite: () => unknown } }[] = [];
const watchRegistration = async () => undefined;
const host = await import("@jini-ai/plugins/host");
mock.module("@jini-ai/plugins/host", { namedExports: { ...host, watchProviderRevisions: (spec: (typeof watches)[number]["spec"], options: (typeof watches)[number]["options"]) => { watches.push({ spec, options }); return watchRegistration; } } });
const siteRevisionReads: unknown[] = [];
mock.module(new URL("../../provider-revision-watch.js", import.meta.url).href, { namedExports: { siteProviderRevisions: (input: unknown) => { siteRevisionReads.push(input); return Promise.resolve(["site-rev"]); } } });
const instrumented: unknown[] = [];
const diagnostics = await import("@jini-ai/diagnostics/observability");
mock.module("@jini-ai/diagnostics/observability", { namedExports: { ...diagnostics, instrumentStorageKernel: (input: unknown) => { instrumented.push(input); } } });

const phases = await import("../boot-phases.js");
type Phase<K extends keyof typeof phases> = Parameters<(typeof phases)[K]>[0];
const TRACEPARENT = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";

/** A late-built value read through a getter, counting reads so a test can tell lazy from eager. */
function late(name: string) {
  const value = { late: name };
  const getter = Object.assign(() => { getter.reads += 1; return value; }, { reads: 0 });
  return { value, getter };
}

test("composeStoragePhase reads every late-built input through its getter only when the bootstrap or media storage asks", () => {
  const [tracker, routeDeps, observability, workspaceId, settingsRepo] = ["tracker", "routeDeps", "observability", "workspaceId", "settingsRepo"].map(late);
  const store = { content: { kernel: "content-kernel" } };
  const result = phases.composeStoragePhase({
    dbPath: "/site/content.db", overrides: {}, onStoreClose: () => undefined, store,
    lifecycleTracker: tracker.getter, routeDeps: routeDeps.getter, observability: observability.getter, workspaceId: workspaceId.getter, settingsRepo: settingsRepo.getter,
  } as unknown as Phase<"composeStoragePhase">);
  assert.deepEqual([tracker, routeDeps, observability, workspaceId, settingsRepo].map(l => l.getter.reads), [0, 0, 0, 0, 0]);
  assert.equal(call("composeAgentPluginBootstrap", "lifecycleTracker"), tracker.value);
  assert.equal(call("composeAgentPluginBootstrap", "routeDeps"), routeDeps.value);
  assert.equal(call("composeMediaStorage", "observability"), observability.value);
  assert.equal(call("composeMediaStorage", "workspaceId"), workspaceId.value);
  assert.equal(call("composeMediaStorage", "settingsRepo"), settingsRepo.value);
  assert.equal(required("composeMediaStorage").resolvedSiteBinding, part("composeAgentPluginBootstrap", "resolvedSiteBinding"));
  assert.equal(result.kernel, store.content);
});

function composeServices(t: test.TestContext, observability: () => unknown) {
  const errors = t.mock.method(console, "error", () => undefined);
  const getters = Object.fromEntries(["tracker", "pluginHost", "forms", "assetBlobRepo", "mediaRepo", "postRepo", "mediaContentTypeStore", "routeDeps"].map(n => [n, late(n)]));
  phases.composeSiteServicesPhase({
    mediaAccessEvidence: {}, dbPath: "/site/content.db", overrides: {}, onStoreClose: () => undefined, consoleLogger: {},
    lifecycleTracker: getters.tracker.getter, routeDepsBuiltForPluginHost: getters.pluginHost.getter, formCollectionProviders: getters.forms.getter,
    agentPluginLayout: {}, resolvedSiteBinding: {}, kernel: {}, blobStore: {}, storeBound: {}, workspaceId: "ws-9",
    mediaProviders: { refusals: ["openai: no key", "fal: bad region"] },
    assetBlobRepo: getters.assetBlobRepo.getter, mediaRepo: getters.mediaRepo.getter, postRepo: getters.postRepo.getter,
    mediaContentTypeStore: getters.mediaContentTypeStore.getter, routeDeps: getters.routeDeps.getter, observability,
  } as unknown as Phase<"composeSiteServicesPhase">);
  const values = Object.fromEntries(Object.entries(getters).map(([n, l]) => [n, l.value]));
  return { errors, values, reads: () => Object.values(getters).reduce((sum, l) => sum + l.getter.reads, 0) };
}

test("composeSiteServicesPhase logs each media provider refusal and hands siblings getters for the values built later", t => {
  const { errors, values, reads } = composeServices(t, () => ({ activeTraceparent: () => TRACEPARENT }));
  assert.deepEqual(errors.mock.calls.map(c => c.arguments), [["[media-providers] openai: no key"], ["[media-providers] fal: bad region"]]);
  assert.equal(reads(), 0);
  const expected: [string, string, unknown][] = [
    ["composeSitePluginRuntime", "lifecycleTracker", values.tracker], ["composeSitePluginRuntime", "routeDepsBuiltForPluginHost", values.pluginHost],
    ["composeSitePluginRuntime", "contentTypeRepo", part("composeContentResolversComments", "contentTypeRepo")],
    ["composeSitePluginRuntime", "outbox", part("composeEventsOrigin", "outbox")],
    ["composeEventsOrigin", "activeTraceparent", TRACEPARENT],
    ["composeTrashFollowUpHooks", "mediaRepo", values.mediaRepo], ["composeTrashFollowUpHooks", "postRepo", values.postRepo],
    ["composeTrashFollowUpHooks", "assetBlobRepo", values.assetBlobRepo], ["composeTrashFollowUpHooks", "routeDeps", values.routeDeps],
    ["composeTrashFollowUpHooks", "entryRefsRepo", part("composeContentRepos", "entryRefsRepo")],
    ["composeTrashAdapters", "mediaRepo", values.mediaRepo], ["composeTrashAdapters", "postRepo", values.postRepo],
    ["composeTrashAdapters", "assetBlobRepo", values.assetBlobRepo], ["composeTrashAdapters", "entryRefsRepo", part("composeContentRepos", "entryRefsRepo")],
    ["composeTrashService", "postRepo", values.postRepo],
    ["composeContentResolversComments", "mediaRepo", values.mediaRepo], ["composeContentResolversComments", "postRepo", values.postRepo],
    ["composeContentResolversComments", "mediaContentTypeStore", values.mediaContentTypeStore],
    ["composeContentResolversComments", "formCollectionProviders", values.forms], ["composeContentResolversComments", "routeDeps", values.routeDeps],
  ];
  for (const [composer, key, value] of expected) assert.equal(call(composer, key), value, `${composer}.${key}`);
});

test("composeSiteServicesPhase's outbox trace parent is absent while the chosen observability has no active trace reader", t => {
  composeServices(t, () => ({}));
  assert.equal(call("composeEventsOrigin", "activeTraceparent"), undefined);
});

function composeLifecycle({ projectStore }: { projectStore: unknown }) {
  const order: string[] = [];
  const registrations: unknown[] = [];
  const bind = async () => undefined;
  const providerPlugins = {
    dispose: async (input: unknown) => { order.push(`providers ${JSON.stringify(input)}`); },
    reapply: async (input: unknown) => ({ reapplied: input }),
    observability: { obs: 1 }, tracker: { tr: 1 }, aiTraceSink: { sink: 1 },
  };
  const kernel = { kernel: "content" };
  const result = phases.composeProviderLifecyclePhase({
    onStoreClose: ({ registration }: { registration: unknown }) => { registrations.push(registration); }, bindSharedApiOAuth: () => bind,
    resolvedSiteBinding: {}, kernel, workspaceId: "ws-4", clock: {}, projectKeyReferences: {}, projectSiteId: "site-7", projectStore, providerConfigSource: {},
    pluginRuntime: { dispose: async (input: unknown) => { order.push(`plugins ${JSON.stringify(input)}`); } }, providerPlugins,
  } as unknown as Phase<"composeProviderLifecyclePhase">);
  return { order, registrations, bind, providerPlugins, kernel, result, watch: watches[watches.length - 1] };
}

test("composeProviderLifecyclePhase disposes provider plugins before the plugin runtime and returns the providers' observability", async () => {
  const { order, registrations, bind, providerPlugins, result } = composeLifecycle({ projectStore: undefined });
  assert.equal(registrations.length, 2);
  assert.deepEqual(order, []);
  await (registrations[0] as () => Promise<void>)();
  assert.deepEqual(order, ["providers {}", "plugins {}"]);
  assert.equal(registrations[1], watchRegistration);
  assert.equal(result.projectKeys, projectKeys);
  assert.equal(call("compositionProjectKeys", "bindSharedApiOAuth"), bind);
  assert.deepEqual([result.observability, result.tracker, result.aiTraceSink], [providerPlugins.observability, providerPlugins.tracker, providerPlugins.aiTraceSink]);
});

test("composeProviderLifecyclePhase watches the project's provider revisions for this site and reapplies through the provider plugins", async () => {
  const revisionReads: unknown[] = [];
  const projectStore = { providerRevisions: async (input: unknown) => { revisionReads.push(input); return ["project-rev"]; } };
  const { watch, kernel } = composeLifecycle({ projectStore });
  assert.deepEqual(await watch.spec.read(), ["project-rev"]);
  assert.deepEqual(revisionReads, [{ siteId: "site-7" }]);
  assert.equal(watch.spec.pluginIdOf, providerPluginOf);
  assert.deepEqual(await watch.spec.reapply({ pluginId: "p-1" }), { reapplied: { pluginId: "p-1" } });
  siteRevisionReads.length = 0;
  assert.deepEqual(await watch.options.readSite(), ["site-rev"]);
  assert.deepEqual(siteRevisionReads, [{ kernel, workspaceId: "ws-4" }]);
});

test("composeProviderLifecyclePhase reads no project revisions when the site has no project store", async () => {
  const { watch } = composeLifecycle({ projectStore: undefined });
  assert.deepEqual(await watch.spec.read(), []);
});

function composeContent({ observability }: { observability: Record<string, unknown> }) {
  const captured: unknown[][] = [];
  const pending: unknown[][] = [[{ event: "a" }, { at: 1 }], [{ event: "b" }, undefined]];
  const kernel = { kernel: "content" };
  const chat = { kernel: "chat" };
  instrumented.length = 0;
  phases.composeInstrumentedContentPhase({
    mediaAccessEvidence: {}, overrides: {}, pendingLifecycleEvents: pending, agentPluginLifecycle: {}, kernel, workspaceId: "ws-2", chat,
    clock: {}, idGen: {}, identity: {}, settingsPrincipals: {}, settingsRepo: {}, siteTitleReady: {}, originRegistry: {}, runtimeMode: "local",
    siteAssistantSecretSealer: {}, externalMcpServerRepo: {}, customCredentialSetRepo: {}, observability,
    tracker: { capture: (input: unknown, options: unknown) => { captured.push([input, options]); return Promise.resolve(); } },
  } as unknown as Phase<"composeInstrumentedContentPhase">);
  const prepare = required("composeContentStores").prepareOutboxEvent as (input: { event: unknown }) => Parameters<typeof readOutboxTraceParent>[0]["event"];
  return { captured, pending, kernel, chat, prepare };
}

test("composeInstrumentedContentPhase flushes buffered lifecycle events in order, then instruments both kernels", () => {
  const observability = { activeTraceparent: () => TRACEPARENT };
  const { captured, pending, kernel, chat } = composeContent({ observability });
  assert.deepEqual(captured, [[{ event: "a" }, { at: 1 }], [{ event: "b" }, undefined]]);
  assert.deepEqual(pending, []);
  assert.equal(instrumented.length, 2);
  assert.deepEqual(instrumented, [{ kernel, observability }, { kernel: chat, observability }]);
  assert.equal((instrumented[1] as { kernel: unknown }).kernel, chat);
});

test("composeInstrumentedContentPhase's content stores stamp the active trace parent on outbox events, and none without a reader", () => {
  const event = { id: "evt-1", type: "post.published", payload: {} };
  const stamped = composeContent({ observability: { activeTraceparent: () => TRACEPARENT } }).prepare({ event });
  assert.equal(readOutboxTraceParent({ event: stamped }), TRACEPARENT);
  const plain = composeContent({ observability: {} }).prepare({ event });
  assert.deepEqual(plain, event);
});

test("composePublishingPhase hands the publishing stores' outputs to the apply port and returns each composer's ports", () => {
  const clock = { c: 1 };
  const result = phases.composePublishingPhase({ workspaceId: "ws-5", resolvedThemesDir: "/themes", clock, outbox: { o: 1 } } as unknown as Phase<"composePublishingPhase">);
  const apply = required("composePublishContentApplyPort");
  for (const key of ["publishContentBundleRepo", "publishContentBaselineRepo", "mediaContentTypeStore", "siteThemes", "publishContentSeedHash"]) {
    assert.equal(apply[key], part("composePublishingStoresThemes", key), key);
  }
  assert.deepEqual([apply.workspaceId, apply.resolvedThemesDir], ["ws-5", "/themes"]);
  assert.equal(required("composePublishingStoresThemes").resolvedThemesDir, "/themes");
  assert.deepEqual([required("composeOutboundConnections").clock, apply.clock].map(c => c === clock), [true, true]);
  assert.equal(result.publishContentApplyPort, part("composePublishContentApplyPort", "publishContentApplyPort"));
  assert.equal(result.guardedOutboundHttpClient, part("composeOutboundConnections", "guardedOutboundHttpClient"));
  assert.equal(result.removeTheme, part("composePublishingStoresThemes", "removeTheme"));
});
