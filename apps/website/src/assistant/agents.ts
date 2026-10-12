/**
 * @file ADR-049 Decision 5: probe the full `@jini-ai/agent-runtime` AGENT_DEFS registry.
 * Every def reports its own availability and diagnostic, preventing a picker from offering a CLI
 * whose run would fail. The host owns discovery, timeouts, caching and PATH/environment policy;
 * the transport serializes safe summaries.
 *
 * PATH probing performs filesystem I/O. Cache it across session-lifetime health polls because
 * installed CLIs do not change each turn; explicit rescan refreshes that fact.
 */
import { AGENT_DEFS, detectAgents, probeAgentModels, type DetectedAgent, resolveAgentLaunch, runtimeSupportsExternalTools } from "@jini-ai/agent-runtime";
import { createCliProbeCache } from "./cli-probe-cache.js";
import type { AgentSummary } from "@jini-ai/daemon/http";

/**
 * `AgentSummary` plus one extra, Tovu-only field the shared `@jini-ai/daemon/http` wire type doesn't
 * declare — added here rather than upstream because it is a Tovu-side transport decision
 * (`assistant-transport.ts`'s prompt-assembly gate), not a `@jini-ai/daemon/http` transport concern.
 * The extra key rides the same JSON body `AgentSummary` already serializes to; a consumer that only
 * knows `AgentSummary` (e.g. `@jini-ai/chat`'s `ChatPaneAgent`) simply never reads it.
 *
 * @see {@link probeAssistantAgents} for where `carriesOwnMemory` is derived.
 */
export type AssistantAgentSummary = AgentSummary & {
  readonly discoveryPending?: boolean;
  /** Structural bridge until @jini-ai/agent-runtime publishes declarative failure hints. */
  readonly failureHints?: readonly {
    readonly category: "auth" | "unsupported-client";
    readonly patterns: readonly string[];
    readonly hint: string;
    readonly suggestedAgentId?: string;
  }[];
  /**
   * True when this def's own CLI/ACP session already carries its multi-turn conversation memory
   * across spawns — the client-safe projection of `@jini-ai/agent-runtime`'s
   * `resumesSessionViaCli`/`resumesSessionViaAcpLoad` (`types.ts`), whose own doc says a caller
   * "should skip resending the rendered transcript on follow-up turns and send just the latest user
   * message" for such a def. `apps/admin/src/lib/assistant-transport.ts`'s `startRun` reads this to
   * decide whether a turn needs the full transcript or just the newest message.
   */
  readonly carriesOwnMemory: boolean;
};

/** Defs the executor cannot drive stay out of the picker. Keep this list aligned with the
 * runtime's compatibility rules; its compatibility predicate is not publicly exported. */
const UNSUPPORTED_AGENT_IDS = new Set<string>([]);

/**
 * Test port for one available def's model list — `@jini-ai/agent-runtime`'s `probeAgentModels`, which runs
 * the def's own `fetchModels`/`listModels` (e.g. `claude`'s credential-free `initialize` probe,
 * `codex debug models`) and falls back to `fallbackModels` on any failure. Live discovery keeps
 * the Local CLI picker current. Swappable so tests never spawn real CLIs.
 */
type AgentModelProber = typeof probeAgentModels;
let agentModelProber: AgentModelProber | null = null;

/** Test-only: install a fake model prober (or `null` to restore the real one) and drop the cache. */
export function setAgentModelProberForTesting(prober: AgentModelProber | null): void {
  agentModelProber = prober;
  cachedAgents = createAssistantDetectionCache({});
  projectedSource = undefined;
}

/**
 * The actual probe — one PATH check per `AGENT_DEFS` entry, plus one model-listing call per
 * AVAILABLE def, plus its version/capability/auth checks. Never called directly by a route; only through
 * {@link listAssistantAgents}/{@link rescanAssistantAgents} below, which own when it re-runs.
 * `force` bypasses Jini's catalog cache on rescan; structured default evidence travels with
 * the catalog so the picker can show and dispatch the same concrete model.
 *
 * @complexity Time: O(d) in `AGENT_DEFS.length` (24 today): a PATH walk each, and for installed
 * defs read-only metadata processes bounded by each def's timeout and the shared process queue. Space: O(d).
 * @overallScore 100
 */
async function probeAssistantAgents({ force = false }: { force?: boolean } = {}, { modelProber = agentModelProber }: { modelProber?: AgentModelProber | null } = {}): Promise<DetectedAgent[]> {
  // The full detector owns version, capabilities, auth and models. Both HTTP inventories share
  // this result instead of launching a separate model-only sweep for the chat picker.
  if (!modelProber) return detectAgents({}, { force });
  const results: DetectedAgent[] = [];
  for (const def of AGENT_DEFS.filter((candidate) => !UNSUPPORTED_AGENT_IDS.has(candidate.id))) {
    const launch = resolveAgentLaunch({ def });
    const modelResult = launch.launchPath
      ? await modelProber({ def }, { force })
      : { models: def.fallbackModels, source: "fallback" as const };
    results.push({ ...def, available: Boolean(launch.launchPath), models: modelResult.models,
      modelsSource: modelResult.source, ...(launch.selectedPath ? { path: launch.selectedPath } : {}),
      ...(modelResult.catalog ? { modelCatalog: modelResult.catalog } : {}),
      ...(modelResult.defaultModelResolution ? { defaultModelResolution: modelResult.defaultModelResolution } : {}) });
  }
  return results;
}

/** The same projection serves cheap PATH-only snapshots and completed live discovery. */
function projectAssistantAgent({ def, launch, modelResult }: {
  def: (typeof AGENT_DEFS)[number];
  launch: { launchPath?: string; diagnostic?: string };
  modelResult: Awaited<ReturnType<AgentModelProber>>;
}): AssistantAgentSummary {
  const available = Boolean(launch.launchPath);
  const { failureHints } = def as typeof def & Pick<AssistantAgentSummary, "failureHints">;
  const { models, source, catalog, defaultModelResolution } = modelResult;
  return {
    id: def.id,
    name: def.name,
    ...(failureHints ? { failureHints } : {}),
    available,
    supportsCustomModel: def.supportsCustomModel,
    models,
    modelsSource: source,
    ...(catalog ? { modelCatalog: catalog } : {}),
    ...(defaultModelResolution ? { defaultModelResolution } : {}),
    ...(def.supportsConcreteModelSelection !== undefined ? { supportsConcreteModelSelection: def.supportsConcreteModelSelection } : {}),
    // See `runtimeSupportsExternalTools`'s own doc (`@jini-ai/agent-runtime`'s `registry.ts`):
    // the single derivation point for "can this runtime receive Tovu/Jini tools at all,"
    // keyed off the def's own `externalMcpInjection` declaration rather than a hardcoded
    // runtime-id list here.
    supportsTools: runtimeSupportsExternalTools({ def }),
    // See `AssistantAgentSummary.carriesOwnMemory`'s own doc — either resume mechanism means
    // the CLI itself, not this transport, owns the def's multi-turn memory.
    carriesOwnMemory: Boolean(def.resumesSessionViaCli) || Boolean(def.resumesSessionViaAcpLoad),
    ...(def.reasoningOptions ? { reasoningOptions: def.reasoningOptions } : {}),
    ...(available ? {} : { diagnostic: launch.diagnostic ?? `${def.name} CLI not found on PATH` }),
  };
}

/** The runtime owns discovery; this host owns the shared snapshot consumed by both HTTP routes.
 * An injected detector supplies an isolated inventory for embedding hosts and route tests. */
export function createAssistantDetectionCache(
  { detector }: { detector?: typeof detectAgents },
  _options: Record<string, never> = {},
) {
  const modelProber = agentModelProber;
  const detect: typeof detectAgents = detector ?? ((_input, options = {}) => probeAssistantAgents({ force: options.force }, { modelProber }));
  return createCliProbeCache({
    initial: (): DetectedAgent[] => AGENT_DEFS.filter((def) => !UNSUPPORTED_AGENT_IDS.has(def.id)).map((def) => {
      const launch = resolveAgentLaunch({ def });
      return { ...def, available: Boolean(launch.launchPath), models: def.fallbackModels.filter(model => model.id !== "default"),
        modelsSource: "fallback", ...(launch.selectedPath ? { path: launch.selectedPath } : {}) };
    }),
    probe: ({ force }) => detect({}, { force }),
  });
}
let cachedAgents = createAssistantDetectionCache({});
let projectedSource: Promise<DetectedAgent[]> | undefined;
let projectedPending = false;
let projectedAgents: Promise<AssistantAgentSummary[]> | undefined;

/** Admin detection and the chat picker read one settled inventory. No request waits for probes. */
export function listDetectedAssistantAgents({ force = false }: { force?: boolean } = {}, _options = {}): Promise<DetectedAgent[]> {
  return cachedAgents.read({ force });
}

export function assistantAgentDiscoveryPending(_input = {}, _options = {}): boolean { return cachedAgents.isPending({}); }

/** Preserve promise identity until the runtime snapshot changes, including while a scan runs. */
export function listAssistantAgents(_input = {}, { waitForProbe = false } = {}): Promise<AssistantAgentSummary[]> {
  const source = listDetectedAssistantAgents();
  if (waitForProbe) return cachedAgents.settled({}).then(() => listAssistantAgents());
  const discoveryPending = cachedAgents.isPending({});
  if (source !== projectedSource || discoveryPending !== projectedPending) {
    projectedPending = discoveryPending;
    projectedSource = source;
    projectedAgents = source.then(agents => agents.map(agent => {
      const registered = AGENT_DEFS.find(candidate => candidate.id === agent.id)!;
      const def = { ...registered, ...(agent.reasoningOptions ? { reasoningOptions: agent.reasoningOptions } : {}) };
      return { ...projectAssistantAgent({ def, launch: { launchPath: agent.available ? agent.path : undefined }, modelResult: {
        models: agent.models, source: agent.modelsSource,
        ...(agent.modelCatalog ? { catalog: agent.modelCatalog } : {}),
        ...(agent.defaultModelResolution ? { defaultModelResolution: agent.defaultModelResolution } : {}),
      } }), discoveryPending,
        ...(agent.version ? { version: agent.version } : {}),
        ...(agent.authStatus ? { authStatus: agent.authStatus } : {}),
      };
    }));
  }
  return projectedAgents!;
}

/** Explicit Rescan schedules a forced refresh while retaining the previous inventory.
 * The optional completion port is for diagnostics/tests; HTTP never opts into waiting. */
export function rescanAssistantAgents(_input = {}, { waitForProbe = false } = {}): Promise<AssistantAgentSummary[]> {
  listDetectedAssistantAgents({ force: true });
  return waitForProbe ? cachedAgents.settled({}).then(() => listAssistantAgents()) : listAssistantAgents();
}
