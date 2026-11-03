/** Site RPC adapter for the daemon. Remote descriptors never acquire executable registrations. */
import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import type { ToolDescriptor, ToolRegistry } from "@jini-ai/core";
import { createRemoteToolExecutor } from "@jini-ai/daemon";
import { fetchTextWithTimeout } from "@jini-ai/platform/fetch-with-timeout";
import { buildToolCatalogQuery } from "#src/assistant/tool-catalog-query";
import { buildComponentCatalogQuery, chartCatalogManifests } from "#src/assistant/component-catalog-query";
import type { DaemonCallContext } from "#src/assistant/daemon-call-context";
import { withToolCatalogAudit } from "#src/assistant/tool-audit-preset";
import type { ToolAttemptAuditSink } from "@jini-ai/daemon/tool-audit";

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
const preflightResponse = z.object({ prefix: z.string().nullable(), refusalPrefix: z.string() }).strict();

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
  const scope = new AsyncLocalStorage<string>();
  const runs = new Map<string, LiveRun>();
  const principals = new Map<string, SiteCatalog>();
  let revision = 0;
  /** Native run scope covers synchronous package catalog/metadata ports across awaited calls.
   * A missing run is an error, never the last caller's snapshot. O(1). */
  function withRun<T>({ runId, fn }: { runId: string; fn: () => T }, _options = {}): T {
    live({ runId });
    return scope.run(runId, fn);
  }
  /** Resolve only an entry that is still live; never infer identity from an unscoped browser call. */
  function live({ runId = scope.getStore() }: { runId?: string } = {}): LiveRun {
    const entry = runId === undefined ? undefined : runs.get(runId);
    if (!entry) throw new Error("a live run is required for site discovery");
    return entry;
  }
  /** One timed, byte-bounded read. Redirects are refused so the private bearer cannot leave the site.
   * Uses Jini's existing body-limit/timeout owner and process TLS trust roots; never retries.
   * @complexity O(b) time/space, capped at 1 MiB components / 16 MiB tool descriptors. */
  async function read({ path, query, maxResponseBytes }: { path: string; query: Record<string, string>; maxResponseBytes: number }): Promise<unknown> {
    const url = new URL(path, baseUrl);
    url.search = new URLSearchParams(query).toString();
    try {
      const { response, text } = await fetchTextWithTimeout({ url, timeoutMs: 15_000,
        init: { headers: { authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error" } },
      { ...(optional.fetch ? { fetch: optional.fetch } : {}), maxResponseBytes, strictUtf8: true });
      if (!response.ok) throw new Error(`site catalog refused (${response.status})`);
      return JSON.parse(text) as unknown;
    } catch (error) {
      console.warn(`[agent-daemon] site catalog unavailable: ${path}`);
      throw error;
    }
  }
  const registry: Pick<ToolRegistry, "list" | "has"> = { list: (_required = {}, _options = {}) => {
    const entry = live();
    const catalog = principals.get(entry.principalId);
    if (!catalog) throw new Error("site tool catalog is unavailable");
    const local = localRegistry.list({});
    const localIds = new Set(local.map(tool => tool.id));
    return [...local, ...catalog.tools.filter(tool => !localIds.has(tool.id))];
  }, has: ({ toolId }: { toolId: string }) => registry.list({}).some(tool => tool.id === toolId) };
  /** Refresh on every start, retaining an existing entry only while another run of its principal
   * lives. A late response cannot resurrect a terminal run or overwrite a newer start. O(t). */
  async function start({ runId, principalId }: { runId: string; principalId: string }, _options = {}): Promise<void> {
    const previous = runs.get(runId);
    if (previous && previous.principalId !== principalId) throw new Error("a live run cannot change principal");
    const entry: LiveRun = { principalId, revision: ++revision };
    runs.set(runId, entry);
    try {
      const parsed = toolResponse.parse(await read({ path: "/internal/tool-catalog", query: { runId, principalId }, maxResponseBytes: 16 * 1024 * 1024 }));
      if (runs.get(runId) !== entry) throw new Error("a live run is required for site discovery");
      if ((principals.get(principalId)?.revision ?? 0) > entry.revision) return;
      const tools = parsed.tools as readonly ToolDescriptor[];
      const local = localRegistry.list({});
      const localIds = new Set(local.map(tool => tool.id));
      const query = (optional.buildCatalog ?? buildToolCatalogQuery)({ list: () => [...local, ...tools.filter(tool => !localIds.has(tool.id))] });
      principals.get(principalId)?.query.dispose();
      principals.set(principalId, { tools, query, revision: entry.revision });
    } catch (error) { if (runs.get(runId) === entry) finish({ runId }); throw error; }
  }
  /** Retain catalogs until this principal's final run ends; discard pending component state too.
   * @complexity O(r) scan of live runs; one bounded map per daemon, no background work. */
  function finish({ runId }: { runId: string }, _options = {}): void {
    const entry = runs.get(runId);
    runs.delete(runId);
    if (!entry || [...runs.values()].some(run => run.principalId === entry.principalId)) return;
    principals.get(entry.principalId)?.query.dispose();
    principals.delete(entry.principalId);
  }
  /** Refresh before each component request, clearing stale data before I/O. Only wire metadata is
   * accepted; executable/Zod manifests are reconstructed by the existing catalog owner. O(p+k). */
  async function refreshComponents({ runId }: { runId: string }, _options = {}): Promise<void> {
    const entry = live({ runId });
    entry.components = undefined;
    const { snapshot } = componentResponse.parse(await read({ path: "/internal/component-catalog", query: { runId }, maxResponseBytes: 1024 * 1024 }));
    if (runs.get(runId) !== entry) throw new Error("a live run is required for site discovery");
    const manifests = chartCatalogManifests({ snapshot });
    entry.components = buildComponentCatalogQuery({ getManifests: () => manifests });
  }
  /** Ask the sole plugin owner to prepare this attempt. Consent surfaces arrive as short callbacks
   * to the daemon log, so this response ends at preparation, never at run termination. The bound
   * wait allows a human to answer the existing consent exchange; cancellation closes it promptly.
   * @throws Transport/schema errors or a run ending during preparation. No retries.
   * @complexity O(prefix bytes), bounded to 1 MiB and ten minutes including human consent.
   */
  async function preflight({ runId, signal }: { runId: string; signal?: AbortSignal }, _options = {}): Promise<z.infer<typeof preflightResponse>> {
    const entry = live({ runId });
    const { response, text } = await fetchTextWithTimeout({ url: new URL("/internal/agent-plugin-preflight", baseUrl), timeoutMs: 10 * 60_000,
      init: { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ runId }), signal, cache: "no-store", redirect: "error" } },
    { ...(optional.fetch ? { fetch: optional.fetch } : {}), maxResponseBytes: 1024 * 1024, strictUtf8: true });
    if (!response.ok) throw new Error("site plugin preparation is unavailable");
    if (runs.get(runId) !== entry) throw new Error("a live run is required for site discovery");
    return preflightResponse.parse(JSON.parse(text));
  }
  /** Attribute discovery to this request's real identity, sharing only the principal's FTS index.
   * The audit wrapper owns recording; constructing it adds no index or background resource. O(1). */
  function scopedCatalog() {
    const entry = live();
    const query = principals.get(entry.principalId)?.query;
    if (!query) throw new Error("site tool catalog is unavailable");
    return audit ? withToolCatalogAudit({ catalog: query, sink: audit.sink, identity: {
      workspaceId: audit.workspaceId, runId: scope.getStore()!, principalId: entry.principalId,
    } }, {}) : query;
  }
  const catalog = {
    search: (...args: Parameters<ReturnType<typeof buildToolCatalogQuery>["search"]>) => scopedCatalog().search(...args),
    describe: (...args: Parameters<ReturnType<typeof buildToolCatalogQuery>["describe"]>) => scopedCatalog().describe(...args),
  };
  /** A failed refresh cannot expose either a previous principal's providers or the core fallback. */
  function components() {
    const query = live().components;
    if (!query) throw new Error("component catalog is unavailable");
    return query;
  }
  return { start, finish, withRun, registry, catalog, refreshComponents, preflight,
    components: {
      search: (...args: Parameters<ReturnType<typeof buildComponentCatalogQuery>["search"]>) => components().search(...args),
      describe: (...args: Parameters<ReturnType<typeof buildComponentCatalogQuery>["describe"]>) => components().describe(...args),
    },
    remote: createRemoteToolExecutor({ baseUrl, token }, { contextFor: ({ run }) => ({ ...contextFor({ runId: run.id }), localToolIds: localRegistry.list({}).map(tool => tool.id) }) }),
  };
}
