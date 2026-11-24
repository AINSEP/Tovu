/** Site RPC adapter for the daemon. Remote descriptors never acquire executable registrations. */
import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod/v3";
import type { ToolDescriptor, ToolRegistry } from "@jini-ai/core";
import { createRemoteToolExecutor } from "@jini-ai/daemon";
import { fetchTextWithTimeout } from "@jini-ai/platform/fetch-with-timeout";
import { buildToolCatalogQuery } from "#src/assistant/tool-catalog-query";
import { createContentReadFamilyPort } from "#src/assistant/tool-family-port";
import { buildComponentCatalogQuery, chartCatalogManifests } from "#src/assistant/component-catalog-query";
import type { DaemonCallContext } from "#src/assistant/daemon-call-context";
import { withToolCatalogAudit } from "#src/assistant/tool-audit-preset";
import type { ToolAttemptAuditSink } from "@jini-ai/core/contracts/site/daemon-tool-audit";

const componentResponse = z.object({ snapshot: z.object({
  generation: z.string(), siteProvider: z.string(), providers: z.array(z.object({
    id: z.string(), kinds: z.array(z.string()), javascript: z.string(), stylesheet: z.string().optional(),
  }).strict()),
}).strict() }).strict();
const toolResponse = z.object({ tools: z.array(z.object({
  id: z.string().min(1), description: z.string().optional(), inputSchema: z.unknown().optional(),
  readOnly: z.boolean().optional(), requiresConfirmation: z.boolean().optional(),
  timeoutMs: z.number().optional(), maxOutputBytes: z.number().optional(),
}).passthrough()) });
const preflightResponse = z.object({ prefix: z.string().nullable(), refusalPrefix: z.string(), pluginIds: z.array(z.string()) }).strict();

type SiteCatalog = { tools: readonly ToolDescriptor[]; query: ReturnType<typeof buildToolCatalogQuery>; revision: number };
type LiveRun = { principalId: string; revision: number; components?: ReturnType<typeof buildComponentCatalogQuery> };

/** Compose Tovu's principal-scoped discovery over the site's own RPC, with bounded, uncached reads.
 * `start` must finish before CLI launch; `finish` releases the principal after its last run.
 * @throws Transport/schema errors propagate; absent/terminal identities always fail closed.
 * @complexity O(t) catalog storage per live principal (t tools); O(1) run identity lookup.
 * @example const host = createDaemonSiteTools({ baseUrl, token, localRegistry, contextFor });
 */
export function createDaemonSiteTools({ baseUrl, token, localRegistry, contextFor, audit }: {
  baseUrl: string; token: string; localRegistry: Pick<ToolRegistry, "list">;
  contextFor: (required: { runId: string }) => DaemonCallContext;
  audit?: { sink: ToolAttemptAuditSink; workspaceId: string };
}, optional: { fetch?: typeof fetch; buildCatalog?: typeof buildToolCatalogQuery } = {}) {
  const state = createDaemonSiteToolsState({ baseUrl, token, localRegistry, contextFor, audit }, optional);
  const registry: Pick<ToolRegistry, "list" | "has"> = { list: (_required = {}, _options = {}) => {
    const entry = live(state);
    const catalog = state.principals.get(entry.principalId);
    if (!catalog) throw new Error("site tool catalog is unavailable");
    const local = state.localRegistry.list({});
    const localIds = new Set(local.map(tool => tool.id));
    return [...local, ...catalog.tools.filter(tool => !localIds.has(tool.id))];
  }, has: ({ toolId }: { toolId: string }) => registry.list({}).some(tool => tool.id === toolId) };
  const catalog = {
    search: (required: Parameters<ReturnType<typeof buildToolCatalogQuery>["search"]>[0], optional?: Parameters<ReturnType<typeof buildToolCatalogQuery>["search"]>[1]) => scopedCatalog(state).search(required, optional),
    describe: (required: Parameters<ReturnType<typeof buildToolCatalogQuery>["describe"]>[0]) => scopedCatalog(state).describe(required),
  };
  return { start: start.bind(undefined, state), finish: finish.bind(undefined, state),
    withRun: <T>(input: { runId: string; fn: () => T }, options = {}) => withRun(state, input, options), registry, catalog, refreshComponents: refreshComponents.bind(undefined, state), preflight: preflight.bind(undefined, state), families: createContentReadFamilyPort({ registry }),
    components: {
      search: (required: Parameters<ReturnType<typeof buildComponentCatalogQuery>["search"]>[0], optional?: Parameters<ReturnType<typeof buildComponentCatalogQuery>["search"]>[1]) => components(state).search(required, optional),
      describe: (required: Parameters<ReturnType<typeof buildComponentCatalogQuery>["describe"]>[0]) => components(state).describe(required),
    },
    remote: createRemoteToolExecutor({ baseUrl: state.baseUrl, token: state.token }, { contextFor: ({ run }) => ({ ...state.contextFor({ runId: run.id }), localToolIds: state.localRegistry.list({}).map(tool => tool.id) }) }),
  };
}

function createDaemonSiteToolsState({ baseUrl, token, localRegistry, contextFor, audit }: {
  baseUrl: string; token: string; localRegistry: Pick<ToolRegistry, "list">;
  contextFor: (required: { runId: string }) => DaemonCallContext;
  audit?: { sink: ToolAttemptAuditSink; workspaceId: string };
}, optional: { fetch?: typeof fetch; buildCatalog?: typeof buildToolCatalogQuery } = {}) {

  const scope = new AsyncLocalStorage<string>();
  const runs = new Map<string, LiveRun>();
  const principals = new Map<string, SiteCatalog>();
  let revision = 0;
  return { baseUrl, token, localRegistry, contextFor, audit, optional, scope, runs, principals, revision };
}

type DaemonSiteToolsState = ReturnType<typeof createDaemonSiteToolsState>;

  /** Native run scope covers synchronous package catalog/metadata ports across awaited calls.
   * A missing run is an error, never the last caller's snapshot. O(1). */
  function withRun<T>(state: DaemonSiteToolsState, { runId, fn }: { runId: string; fn: () => T }, _options = {}): T {
    live(state, { runId });
    return state.scope.run(runId, fn);
  }

  /** Resolve only an entry that is still live; never infer identity from an unscoped browser call. */
  function live(state: DaemonSiteToolsState, { runId = state.scope.getStore() }: { runId?: string } = {}): LiveRun {
    const entry = runId === undefined ? undefined : state.runs.get(runId);
    if (!entry) throw new Error("a live run is required for site discovery");
    return entry;
  }

  /** One timed, byte-bounded read. Redirects are refused so the private bearer cannot leave the site.
   * Uses Jini's existing body-limit/timeout owner and process TLS trust roots; never retries.
   * @complexity O(b) time/space, capped at 1 MiB components / 16 MiB tool descriptors. */
  async function read(state: DaemonSiteToolsState, { path, query, maxResponseBytes }: { path: string; query: Record<string, string>; maxResponseBytes: number }): Promise<unknown> {
    const url = new URL(path, state.baseUrl);
    url.search = new URLSearchParams(query).toString();
    try {
      const { response, text } = await fetchTextWithTimeout({ url, timeoutMs: 15_000,
        init: { headers: { authorization: `Bearer ${state.token}` }, cache: "no-store", redirect: "error" } },
      { ...(state.optional.fetch ? { fetch: state.optional.fetch } : {}), maxResponseBytes, strictUtf8: true });
      if (!response.ok) throw new Error(`site catalog refused (${response.status})`);
      return JSON.parse(text) as unknown;
    } catch (error) {
      console.warn(`[agent-daemon] site catalog unavailable: ${path}`);
      throw error;
    }
  }

  /** Refresh on every start, retaining an existing entry only while another run of its principal
   * lives. A late response cannot resurrect a terminal run or overwrite a newer start. O(t). */
  async function start(state: DaemonSiteToolsState, { runId, principalId }: { runId: string; principalId: string }, _options = {}): Promise<void> {
    const previous = state.runs.get(runId);
    if (previous && previous.principalId !== principalId) throw new Error("a live run cannot change principal");
    const entry: LiveRun = { principalId, revision: ++state.revision };
    state.runs.set(runId, entry);
    try {
      const parsed = toolResponse.parse(await read(state, { path: "/internal/tool-catalog", query: { runId, principalId }, maxResponseBytes: 16 * 1024 * 1024 }));
      if (state.runs.get(runId) !== entry) throw new Error("a live run is required for site discovery");
      if ((state.principals.get(principalId)?.revision ?? 0) > entry.revision) return;
      installCatalog(state, { principalId, tools: parsed.tools as readonly ToolDescriptor[], revision: entry.revision });
    } catch (error) { if (state.runs.get(runId) === entry) finish(state, { runId }); throw error; }
  }

  /** Replace a principal's catalog: local tools first, site tools only where no local id exists. O(t). */
  function installCatalog(state: DaemonSiteToolsState, { principalId, tools, revision }: { principalId: string; tools: readonly ToolDescriptor[]; revision: number }, _options = {}): void {
    const local = state.localRegistry.list({});
    const localIds = new Set(local.map(tool => tool.id));
    const query = (state.optional.buildCatalog ?? buildToolCatalogQuery)({ list: () => [...local, ...tools.filter(tool => !localIds.has(tool.id))] });
    state.principals.get(principalId)?.query.dispose();
    state.principals.set(principalId, { tools, query, revision });
  }

  /** Retain catalogs until this principal's final run ends; discard pending component state too.
   * @complexity O(r) scan of live runs; one bounded map per daemon, no background work. */
  function finish(state: DaemonSiteToolsState, { runId }: { runId: string }, _options = {}): void {
    const entry = state.runs.get(runId);
    state.runs.delete(runId);
    if (!entry || [...state.runs.values()].some(run => run.principalId === entry.principalId)) return;
    state.principals.get(entry.principalId)?.query.dispose();
    state.principals.delete(entry.principalId);
  }

  /** Refresh before each component request, clearing stale data before I/O. Only wire metadata is
   * accepted; executable/Zod manifests are reconstructed by the existing catalog owner. O(p+k). */
  async function refreshComponents(state: DaemonSiteToolsState, { runId }: { runId: string }, _options = {}): Promise<void> {
    const entry = live(state, { runId });
    entry.components = undefined;
    const { snapshot } = componentResponse.parse(await read(state, { path: "/internal/component-catalog", query: { runId }, maxResponseBytes: 1024 * 1024 }));
    if (state.runs.get(runId) !== entry) throw new Error("a live run is required for site discovery");
    const manifests = chartCatalogManifests({ snapshot });
    entry.components = buildComponentCatalogQuery({ getManifests: () => manifests });
  }

  /** Ask the sole plugin owner to prepare this attempt. Consent surfaces arrive as short callbacks
   * to the daemon log, so this response ends at preparation, never at run termination. The bound
   * wait allows a human to answer the existing consent exchange; cancellation closes it promptly.
   * @throws Transport/schema errors or a run ending during preparation. No retries.
   * @complexity O(prefix bytes), bounded to 1 MiB and ten minutes including human consent.
   */
  async function preflight(state: DaemonSiteToolsState, { runId, signal }: { runId: string; signal?: AbortSignal }, _options = {}): Promise<z.infer<typeof preflightResponse>> {
    const entry = live(state, { runId });
    const { response, text } = await fetchTextWithTimeout({ url: new URL("/internal/agent-plugin-preflight", state.baseUrl), timeoutMs: 10 * 60_000,
      init: { method: "POST", headers: { authorization: `Bearer ${state.token}`, "content-type": "application/json" },
        body: JSON.stringify({ runId }), signal, cache: "no-store", redirect: "error" } },
    { ...(state.optional.fetch ? { fetch: state.optional.fetch } : {}), maxResponseBytes: 1024 * 1024, strictUtf8: true });
    if (!response.ok) throw new Error("site plugin preparation is unavailable");
    if (state.runs.get(runId) !== entry) throw new Error("a live run is required for site discovery");
    return preflightResponse.parse(JSON.parse(text));
  }

  /** Attribute discovery to this request's real identity, sharing only the principal's FTS index.
   * The audit wrapper owns recording; constructing it adds no index or background resource. O(1). */
  function scopedCatalog(state: DaemonSiteToolsState) {
    const entry = live(state);
    const runId = state.scope.getStore();
    if (runId === undefined) throw new Error("site tool catalog has no active run id");
    const query = state.principals.get(entry.principalId)?.query;
    if (!query) throw new Error("site tool catalog is unavailable");
    return state.audit ? withToolCatalogAudit({ catalog: query, sink: state.audit.sink, identity: {
      workspaceId: state.audit.workspaceId, runId, principalId: entry.principalId,
    } }, {}) : query;
  }

  /** A failed refresh cannot expose either a previous principal's providers or the core fallback. */
  function components(state: DaemonSiteToolsState) {
    const query = live(state).components;
    if (!query) throw new Error("component catalog is unavailable");
    return query;
  }