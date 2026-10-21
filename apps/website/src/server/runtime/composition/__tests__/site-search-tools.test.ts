import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmission, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/core/primitives";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM, type SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { derivedRisk } from "@jini-ai/search/tools";
import { createInMemorySearchProvider, createInMemorySearchState, createStaticAccessPort } from "@jini-ai/search/testkit";

import type { UIResource } from "#src/assistant/index";
import { nativeToolMetadata } from "#src/contracts/core/tool-metadata/index";
import { toolMetadata } from "#src/contracts/core/tool-metadata/search";
import type { HttpResponse } from "#src/platform/http/index";
import { createSiteSearchRuntime, type SiteSearchRuntime } from "../modules/site-search.js";
import {
  buildSiteSearchToolRegistrations, contributeSiteSearchTools, SEARCH_REINDEX_TOOL_ID, SEARCH_SET_PROVIDER_TOOL_ID, searchApprovalDialog,
} from "../site-search-tools.js";

/**
 * @file The site-search tool contributor over a real search runtime (in-memory state and the
 * reference provider as `builtin`), Tovu's permission adapter and the real held-open confirmation
 * exchange: reads check `settings.read`, the two writes ask under their own tool id and act only on a
 * confirm click, and the provider switch is recorded under the calling principal.
 */

const WS = "ws-search-tools";
const PRINCIPAL = "agent-1";

interface Harness {
  runtime: SiteSearchRuntime;
  tools: Map<string, ToolRegistration>;
  store: SurfaceExchangeStore;
  permissions: string[];
  writes: unknown[];
}

function harness(options: { deny?: boolean } = {}): Harness {
  const state = createInMemorySearchState({}, { active: [{ siteId: WS, providerId: "builtin", generation: 1 }] });
  const writes: unknown[] = [];
  const runtime = createSiteSearchRuntime({
    workspaceId: WS, siteId: WS, sources: [], indexState: state.indexState, targets: state.targets,
    access: createStaticAccessPort({ visible: [] }), installId: async () => "inst", resolveCredential: async () => null,
    httpClient: { send: async () => ({}) as HttpResponse }, loadPluginProviders: async () => ({ items: [], refusals: [] }),
    isPluginActive: async () => true, audiencesForSession: async () => [], readProviderSetting: async () => "builtin",
    writeProviderSetting: async input => { writes.push(input); }, now: () => 0,
  }, { builtinProvider: createInMemorySearchProvider({}, { id: "builtin", label: "Built-in", acceptsRestricted: true }), log: () => undefined });
  const permissions: string[] = [];
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const registrations = buildSiteSearchToolRegistrations({
    workspaceId: WS, siteSearch: runtime,
    authorize: async ({ permission }) => { permissions.push(permission); return { allowed: !options.deny, reason: "test" }; },
  }, { surfaceExchanges: store });
  return { runtime, tools: new Map(registrations.map(r => [r.descriptor.id, r])), store, permissions, writes };
}

const ctx = (input: unknown): ToolExecutionContext => ({ executionId: "e1", principal: { id: PRINCIPAL }, run: { id: "r1" }, input, signal: new AbortController().signal });

/** Start a confirmed call, wait for its card, and return a function that answers it. */
async function raise(h: Harness, toolId: string, input: unknown) {
  const emitted: SurfaceEmission[] = [];
  let didEmit!: () => void;
  const emission = new Promise<void>(resolve => { didEmit = resolve; });
  const pending = h.tools.get(toolId)!.handler(ctx(input), { emitSurface: async surface => { emitted.push(surface); didEmit(); } });
  await Promise.race([emission, pending.then(result => { throw new Error(`${toolId} finished without a card: ${JSON.stringify(result)}`); })]);
  const html = (emitted[0]!.payload as { resource: UIResource }).resource.resource.text;
  const exchangeId = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`))![1]!;
  return { pending, html, answer: (decision: string) => h.store.deliver({ exchangeId, principalId: PRINCIPAL, params: { decision } }, { toolId }) };
}

test("a composition without a search runtime contributes no tools", () => {
  assert.deepEqual(buildSiteSearchToolRegistrations({ workspaceId: WS, authorize: async () => ({ allowed: true, reason: "" }) }, { surfaceExchanges: {} as SurfaceExchangeStore }), []);
});

test("the contributor is the 'search' domain with Jini's derived risk; every registration carries its reviewed metadata", () => {
  const contributor = contributeSiteSearchTools();
  assert.equal(contributor.domain, "search");
  assert.equal(contributor.risk, derivedRisk);
  assert.equal(contributor.build, buildSiteSearchToolRegistrations);
  const h = harness();
  assert.deepEqual([...h.tools.keys()].sort(), ["search_query", "search_reindex", "search_set_provider", "search_status"]);
  for (const [id, registration] of h.tools) {
    assert.deepEqual(registration.descriptor.metadata, toolMetadata[id as keyof typeof toolMetadata], id);
    assert.deepEqual(registration.descriptor.metadata, nativeToolMetadata.byId[id], id);
  }
  // The writes park on their own handler's card, so the MCP-UI route must admit their clicks.
  assert.equal(nativeToolMetadata.redeemableIds.has(SEARCH_REINDEX_TOOL_ID), true);
  assert.equal(nativeToolMetadata.redeemableIds.has(SEARCH_SET_PROVIDER_TOOL_ID), true);
});

test("reads check settings.read through Tovu's authorize; a denial refuses the call", async () => {
  const h = harness();
  const status = await h.tools.get("search_status")!.handler(ctx({}), {});
  assert.deepEqual((status as { active: { providerId: string } }).active.providerId, "builtin");
  assert.deepEqual(await h.tools.get("search_query")!.handler(ctx({ text: "hello" }), {}), { status: "unavailable", reason: "provider_error" },
    "the active index was never created, so the reference provider refuses (not_found); the tool reports it");
  assert.deepEqual(h.permissions, ["settings.read", "settings.read"]);
  await assert.rejects(harness({ deny: true }).tools.get("search_status")!.handler(ctx({}), {}));
});

test("without an interactive channel the two writes refuse under their own tool id and change nothing", async () => {
  const h = harness();
  await assert.rejects(h.tools.get("search_reindex")!.handler(ctx({}), {}), /^ToolInputError: SEARCH_NO_CONFIRMATION_CHANNEL: search_reindex:/);
  await assert.rejects(h.tools.get("search_set_provider")!.handler(ctx({ providerId: "builtin" }), {}), /SEARCH_NO_CONFIRMATION_CHANNEL: search_set_provider:/);
  assert.equal((await h.runtime.service.status({ siteId: WS })).building, null);
  assert.deepEqual(h.writes, []);
});

test("search_reindex: cancel changes nothing; confirm starts a new generation of the active provider", async () => {
  const h = harness();
  const first = await raise(h, "search_reindex", {});
  assert.match(first.html, /Rebuild the site search index\?/);
  first.answer("cancel");
  assert.deepEqual(await first.pending, { started: false, reason: "declined" });
  assert.equal((await h.runtime.service.status({ siteId: WS })).building, null);
  const second = await raise(h, "search_reindex", {});
  second.answer("confirm");
  assert.deepEqual(await second.pending, { started: true, providerId: "builtin", generation: 2 });
  assert.equal((await h.runtime.service.status({ siteId: WS })).building?.generation, 2);
  assert.deepEqual(h.writes, [], "a reindex never touches the provider setting");
});

test("search_set_provider: confirm persists the setting under the calling principal, then rebuilds", async () => {
  const h = harness();
  const call = await raise(h, "search_set_provider", { providerId: "builtin" });
  assert.match(call.html, /Switch the site search provider\?/);
  call.answer("confirm");
  assert.deepEqual(await call.pending, { started: true, providerId: "builtin", generation: 2 });
  assert.deepEqual(h.writes, [{ principalId: PRINCIPAL, providerId: "builtin" }]);
});

test("the approval dialog names the provider, the current one (or none) and the site", () => {
  const dialog = searchApprovalDialog({ description: { action: "set_provider", siteId: WS, providerId: "meilisearch", fromProviderId: null, summary: "Switch it." } });
  assert.equal(dialog.title, "Switch the site search provider?");
  assert.equal(dialog.confirmLabel, "Switch provider");
  assert.equal(dialog.description, "Switch it.");
  assert.equal(dialog.errorCode, "SEARCH");
  assert.deepEqual(dialog.details, [{ label: "Provider", value: "meilisearch" }, { label: "Current provider", value: "none" }, { label: "Site", value: WS }]);
  const reindex = searchApprovalDialog({ description: { action: "reindex", siteId: WS, providerId: "builtin", fromProviderId: "builtin", summary: "Rebuild." } });
  assert.equal(reindex.confirmLabel, "Rebuild index");
  assert.deepEqual(reindex.details[1], { label: "Current provider", value: "builtin" });
  assert.match(reindex.warning!, /may charge/);
});
