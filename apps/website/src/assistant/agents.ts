/**
 * @file ADR-049 Decision 5: probe the full `@jini-ai/agent-runtime` AGENT_DEFS registry.
 * Every def reports its own availability and diagnostic, preventing a picker from offering a CLI
 * whose run would fail. The host owns discovery, timeouts, caching and PATH/environment policy;
 * the transport serializes safe summaries.
 *
 * PATH probing performs filesystem I/O. Cache it across session-lifetime health polls because
 * installed CLIs do not change each turn; explicit rescan refreshes that fact.
 */
import { AGENT_DEFS, probeAgentModels, resolveAgentLaunch, runtimeSupportsExternalTools } from "@jini-ai/agent-runtime";
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
 * Fetches one available def's model list — `@jini-ai/agent-runtime`'s `probeAgentModels`, which runs
 * the def's own `fetchModels`/`listModels` (e.g. `claude`'s credential-free `initialize` probe,
 * `codex debug models`) and falls back to `fallbackModels` on any failure. Live discovery keeps
 * the Local CLI picker current. Swappable so tests never spawn real CLIs.
 */
type AgentModelProber = typeof probeAgentModels;
let agentModelProber: AgentModelProber = probeAgentModels;

/** Test-only: install a fake model prober (or `null` to restore the real one) and drop the cache. */
export function setAgentModelProberForTesting(prober: AgentModelProber | null): void {
  agentModelProber = prober ?? probeAgentModels;
  cachedAgents = null;
}

/**
 * The actual probe — one PATH check per `AGENT_DEFS` entry, plus one model-listing call per
 * AVAILABLE def (see {@link agentModelProber}). Never called directly by a route; only through
 * {@link listAssistantAgents}/{@link rescanAssistantAgents} below, which own when it re-runs.
 * `force` bypasses Jini's catalog cache on rescan; structured default evidence travels with
 * the catalog so the picker can show and dispatch the same concrete model.
 *
 * @complexity Time: O(d) in `AGENT_DEFS.length` (24 today): a PATH walk each, and for installed
 * defs a concurrent model-listing spawn bounded by that def's own timeout. Space: O(d).
 * @overallScore 100
 */
async function probeAssistantAgents({ force = false }: { force?: boolean } = {}): Promise<AssistantAgentSummary[]> {
  return Promise.all(
    AGENT_DEFS.filter((def) => !UNSUPPORTED_AGENT_IDS.has(def.id)).map(async (def): Promise<AssistantAgentSummary> => {
      const launch = resolveAgentLaunch({ def });
      const available = Boolean(launch.launchPath);
      const { failureHints } = def as typeof def & Pick<AssistantAgentSummary, "failureHints">;
      const modelResult: Awaited<ReturnType<AgentModelProber>> = available
        ? await agentModelProber({ def }, { force })
        : { models: def.fallbackModels, source: "fallback" as const };
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
    }),
  );
}

/**
 * Memoized across every caller for the life of this daemon process. `null` means "nothing cached
 * and no probe in flight"; any other value is the current probe — in flight or already settled —
 * that every concurrent/subsequent {@link listAssistantAgents} call reuses instead of starting a
 * second one.
 */
let cachedAgents: Promise<AssistantAgentSummary[]> | null = null;

/**
 * Starts a fresh probe and installs it as the cache, returning it.
 *
 * A rejected probe is NOT left cached: the `.catch` below drops the cache back to `null` first, so
 * the next call retries from scratch instead of replaying the same failure forever (a transient
 * PATH-read hiccup must not permanently break agent listing until process restart). Guarded by an
 * identity check against `cachedAgents` — a value read at schedule time is a claim about the cache
 * that may already be false by the time this `.catch` runs, the same hazard
 * `use-settings-slice.hooks.ts` documents for its own async ordering: if a NEWER probe (a rescan
 * that started while this one was still in flight) has already replaced the cache, this one failing
 * must not clobber that newer entry back to `null`.
 *
 * @complexity Time/space: O(1) beyond the O(d) probe itself (see {@link probeAssistantAgents}).
 * @overallScore 100
 */
function refreshAssistantAgentsCache({ force = false }: { force?: boolean } = {}): Promise<AssistantAgentSummary[]> {
  const probe: Promise<AssistantAgentSummary[]> = probeAssistantAgents({ force }).catch((error: unknown) => {
    if (cachedAgents === probe) cachedAgents = null;
    throw error;
  });
  cachedAgents = probe;
  return probe;
}

/**
 * The host's cached-or-fresh agent inventory — wired as `@jini-ai/daemon/http`'s
 * `AgentsHttpDeps.listAgents`, backing `GET /api/agents`. Probes once per process and reuses the
 * result for every caller afterward; see {@link rescanAssistantAgents} for the explicit invalidation
 * path.
 *
 * @complexity Time: O(1) after the first call (O(d) once, per {@link probeAssistantAgents}). Space:
 * O(1) beyond the cached O(d) result.
 * @overallScore 100
 *
 * Deliberately NOT `async`: an `async function` always wraps its return value in a freshly
 * allocated `Promise`, even when the body just returns an existing one — which would silently
 * defeat the memoization this function exists for (every caller would still trigger only ONE real
 * probe, but each would get back a distinct wrapper promise, making "did this reuse the cache"
 * unobservable and unnecessarily allocating on every call). Returning `cachedAgents`/the refresh
 * call's own promise directly keeps the exact same object identity flowing to every caller.
 */
export function listAssistantAgents(): Promise<AssistantAgentSummary[]> {
  return cachedAgents ?? refreshAssistantAgentsCache();
}

/**
 * Forces a fresh probe and replaces the cache — the host side of `POST /api/agents/rescan`
 * (`@jini-ai/daemon/http`'s `AgentsHttpDeps.rescanAgents`; see that package's own doc: "asks the host
 * to invalidate its discovery cache and probe again"). The one deliberate way an operator who just
 * installed or removed a CLI mid-session sees that change without restarting the daemon.
 *
 * @complexity Time/space: same as {@link refreshAssistantAgentsCache}.
 * @overallScore 100
 *
 * Deliberately NOT `async`, same reasoning as {@link listAssistantAgents}.
 */
export function rescanAssistantAgents(): Promise<AssistantAgentSummary[]> {
  return refreshAssistantAgentsCache({ force: true });
}
