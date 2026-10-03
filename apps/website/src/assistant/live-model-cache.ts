import { createHash } from "node:crypto";
import { listProviderModels, type ProviderModelOption } from "@jini-ai/agent-runtime";
import { ModelCatalogCache, unionModels as unionModelCatalog } from "@jini-ai/agent-runtime/model-catalog/cache";
import type { Clock } from "@jini-ai/core/primitives";
import type { AgentModelSummary } from "@jini-ai/daemon/http";

import type { SecretSealerPort } from "../features/webhooks/index.js";
import { resolveExecutionCredential, type AdminExecutionCredentialRepoPort } from "./execution-credential-store.js";

/**
 * @file Live model discovery for the Local CLI picker's `claude` entry — the enrichment step
 * `server/runtime/composition/modules/assistant.ts`'s `respondWithEnrichedAgentList` calls. Design:
 * `ADS-memory/reports/local-cli-live-model-discovery-design-2026-08-05.md` §3.1/§3.5.
 *
 * Two independent concerns, deliberately not folded into one function:
 * - {@link getLiveClaudeModels} — the "never a gate" credential branch. Resolves the admin's own
 *   `admin_execution_credentials` row and returns immediately, with NO network call, whenever
 *   there is no row, no key, or a protocol other than `anthropic`. Only a resolved `anthropic`
 *   credential reaches the cache/network path below.
 * - The in-memory TTL cache — wraps ONLY the `listProviderModels` call, not the credential check
 *   (that check is a single cheap repo read + decrypt, per `resolveExecutionCredential`'s own
 *   `@complexity O(1)` contract, so caching it buys nothing and would only obscure the "zero
 *   network calls" property under a cache hit/miss branch). Sized so a busy admin dock (mount, tab
 *   switch back to the dock) doesn't reissue a live HTTPS call on every `/api/agents` load — see
 *   the design doc's Risks §5 for the accepted staleness window this trades for that.
 *
 * {@link unionModels} is the §3.5 merge policy: fallback entries (including the `sonnet`/`opus`/
 * `haiku` aliases and the `'default'` sentinel) are ALWAYS present, unconditionally — this function
 * has no code path that can drop one. Live-discovered ids are appended only when not already
 * present, deduped by `id`.
 */

/** How long one successful-or-failed live call is trusted before the next request re-issues it.
 *  Deliberately minutes, not seconds: installing/rotating a stored key is a deliberate admin
 *  action, not one that needs sub-minute staleness (design doc §3.1's own reasoning). */
const LIVE_MODEL_CACHE_TTL_MS = 5 * 60_000;

interface LiveModelHostDependencies {
  readonly repo: AdminExecutionCredentialRepoPort;
  readonly sealer: SecretSealerPort;
}
interface DiscoveryOutcome {
  readonly models: readonly ProviderModelOption[];
}
export interface LiveModelDiscovery {
  getLiveClaudeModels(key: { workspaceId: string; principalId: string }): Promise<readonly ProviderModelOption[] | null>;
}

/** Creates one host-owned discovery/cache instance; generic cache and its rationale now live in
 * `@jini-ai/agent-runtime/model-catalog/cache`. The in-flight call itself is shared so concurrent
 * requests in a TTL window issue one provider call, rather than caching only its eventual value.
 * Successes and failures keep the same five-minute TTL; credentials are resolved before each read.
 * Tovu is multi-workspace: delimiter-joined `${workspaceId}:${principalId}` keys would alias tenants
 * if either ID contained `:`. The package encodes the full tuple structurally, including credential
 * and endpoint scope. SHA-256 fingerprints invalidate rotation without retaining a raw key in cache
 * keys. A result wrapper preserves the distinction between a successful empty catalog and failure.
 */
export function createLiveModelDiscovery(
  { repo, sealer, clock, discover }: LiveModelHostDependencies & {
    clock: Clock;
    discover: (required: { apiKey: string; baseUrl: string }) => Promise<readonly ProviderModelOption[] | null>;
  },
  { ttlMs = LIVE_MODEL_CACHE_TTL_MS }: { ttlMs?: number } = {},
): LiveModelDiscovery {
  const cache = new ModelCatalogCache<DiscoveryOutcome>({
    clock,
    // Each get supplies a discovery closure AFTER resolving that principal's credential. This
    // required default is fail-closed if a future caller forgets that closure; it never does I/O.
    discover: async () => null,
    merge: ({ live }) => live,
  }, { ttlMs });
  return {
    async getLiveClaudeModels(key) {
      const stored = await resolveExecutionCredential({ repo, sealer }, key);
      if (!stored || stored.protocol !== "anthropic" || !stored.apiKey.trim()) return null;
      const baseUrl = stored.baseUrl ?? "https://api.anthropic.com";
      const credentialFingerprint = createHash("sha256").update(stored.apiKey).digest("hex");
      const outcomes = await cache.get({
        cacheKey: [key.workspaceId, key.principalId, stored.protocol, stored.providerId ?? "", baseUrl, credentialFingerprint],
        fallback: [],
      }, {
        discover: async () => {
          const models = await discover({ apiKey: stored.apiKey, baseUrl });
          return models === null ? null : [{ models }];
        },
      });
      return outcomes[0]?.models ?? null;
    },
  };
}

/** Compatibility at the existing host boundary, until composition injects createLiveModelDiscovery.
 * Each repo/sealer/clock tuple owns an instance; unrelated applications cannot share a process-wide
 * model slot. Weak ownership avoids retaining disposed hosts. The cache engine is entirely Jini's.
 */
let hostDiscoveries = new WeakMap<AdminExecutionCredentialRepoPort, WeakMap<SecretSealerPort, WeakMap<() => number, LiveModelDiscovery>>>();

/** Test-only reset: dependency-owned instances would otherwise survive tests using the same ports
 * and workspace/principal. Composition-owned factory instances do not depend on this registry. */
export function resetLiveModelCacheForTesting(): void {
  hostDiscoveries = new WeakMap();
}

/**
 * The one network call this module makes, isolated so {@link getLiveClaudeModels} above it stays
 * readable. `listProviderModels` returns expected auth, network, timeout and malformed-response failures
 * as `{ok: false, ...}`. The package cache also catches unexpected discovery rejections and records
 * a null result for the same TTL, so a rejected promise never poisons the slot.
 *
 * Logs on `!result.ok` — deliberately the ONLY log line in this module. A live call only reaches
 * this function once {@link getLiveClaudeModels} has already resolved a real `anthropic`
 * credential, so a failure here means an admin who set up BYOK for Claude is silently getting the
 * static fallback list instead of the live one they configured — worth an operator seeing, unlike
 * the no-credential/wrong-protocol paths (expected, quiet by design). One line, not a stack: the
 * `listProviderModels` result already redacts the key (`redactSecrets`), so `result.detail` is
 * safe to log as-is.
 *
 * @complexity O(1) local work; one outbound HTTPS call bounded by `listProviderModels`'s own
 *   12s timeout.
 */
export async function fetchLiveClaudeModels({ apiKey, baseUrl }: { apiKey: string; baseUrl: string }): Promise<readonly ProviderModelOption[] | null> {
  const result = await listProviderModels({ protocol: "anthropic", baseUrl, apiKey });
  if (!result.ok) {
    console.warn(
      `[assistant] live Claude model discovery failed (${result.kind}${result.detail ? `: ${result.detail}` : ""}) — falling back to the static model list`,
    );
    return null;
  }
  return result.models ?? null;
}

/**
 * Resolves the admin's stored execution credential for `(workspaceId, principalId)` and, only
 * when it is a usable `anthropic` credential, returns Claude's live model catalog (cached — see
 * this file's header). Returns `null` for every other outcome: no row, no key, wrong protocol, or
 * a failed/timed-out live call. `null` is not an error signal — the caller's contract
 * (`unionModels`) is to treat it as "nothing to enrich with" and leave the static fallback list
 * exactly as it was, which is what makes this a strict enrichment layer rather than a dependency
 * the picker can be blocked or degraded by.
 *
 * No network call is made at all on the `null`/wrong-protocol paths — verified directly by this
 * file's own tests stubbing `globalThis.fetch` to throw. That is the "never a gate" invariant a
 * Max-subscription admin with no stored key depends on: zero added latency, by construction, not
 * by a cache that merely answers fast.
 *
 * @param key.now - Injectable host clock for legacy TTL tests; defaults to `Date.now`.
 * New composition uses createLiveModelDiscovery with an explicit core Clock port.
 * @complexity O(1) plus, at most, one cached network call.
 */
export async function getLiveClaudeModels(
  deps: LiveModelHostDependencies,
  key: { workspaceId: string; principalId: string; now?: () => number },
): Promise<readonly ProviderModelOption[] | null> {
  const now = key.now ?? Date.now;
  let bySealer = hostDiscoveries.get(deps.repo);
  if (!bySealer) {
    bySealer = new WeakMap();
    hostDiscoveries.set(deps.repo, bySealer);
  }
  let byClock = bySealer.get(deps.sealer);
  if (!byClock) {
    byClock = new WeakMap();
    bySealer.set(deps.sealer, byClock);
  }
  let discovery = byClock.get(now);
  if (!discovery) {
    discovery = createLiveModelDiscovery({ ...deps, clock: { nowMs: now }, discover: fetchLiveClaudeModels });
    byClock.set(now, discovery);
  }
  return discovery.getLiveClaudeModels({ workspaceId: key.workspaceId, principalId: key.principalId });
}

/**
 * Merges a live-discovered model list into the static fallback list, per design doc §3.5: UNION,
 * never replace. `fallback` is always fully present in the result, in its original order — there
 * is no code path here that can drop the `'default'` sentinel or the bare `sonnet`/`opus`/`haiku`
 * aliases, because nothing is ever removed from it. `live` entries are appended in their given
 * order, skipping any `id` already present (from `fallback` or an earlier `live` entry).
 *
 * @complexity O(f + l) where f/l are the fallback/live list lengths — one `Set` built from
 *   `fallback`, one pass over `live`.
 */
export function unionModels(
  fallback: readonly AgentModelSummary[],
  live: readonly ProviderModelOption[],
): AgentModelSummary[] {
  // Preserve Tovu's client-safe projection: fallback metadata survives, while discovered entries
  // expose only the model ID and label. Deduplication/order belong to the package merger.
  return unionModelCatalog({ fallback, live: live.map(({ id, label }) => ({ id, label })) });
}
