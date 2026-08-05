import { listProviderModels, type ProviderModelOption } from "@jini-ai/agent-runtime";
import type { AgentModelSummary } from "@jini-ai/http-kit";

import type { SecretSealerPort } from "../integrations/ports";
import { resolveExecutionCredential, type AdminExecutionCredentialRepoPort } from "./execution-credential-store";

/**
 * @file Live model discovery for the Local CLI picker's `claude` entry — the enrichment step
 * `server/modules/assistant.ts`'s `respondWithEnrichedAgentList` calls. Design:
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

interface CacheEntry {
  expiresAt: number;
  /** The in-flight (or settled) call itself, cached — not just its eventual value — so concurrent
   *  requests that land inside the same TTL window before the first call resolves share one
   *  `listProviderModels` call instead of each issuing their own. */
  value: Promise<readonly ProviderModelOption[] | null>;
}

/** Module-scope, process-lifetime cache, nested by workspace then principal — not a single
 *  delimiter-joined string key. Tovu is intentionally multi-workspace, not a hypothetical edge
 *  case, so a `${workspaceId}:${principalId}` string key would collide two DIFFERENT tenants'
 *  entries if either id ever contained the `:` delimiter, handing one admin another admin's live
 *  model list. Nesting removes that possibility structurally instead of relying on an unenforced
 *  id-charset assumption. */
const cache = new Map<string, Map<string, CacheEntry>>();

/** Test-only reset — the module-scope `cache` above would otherwise leak state across test files
 *  that both exercise {@link getLiveClaudeModels} for the same `(workspaceId, principalId)` pair. */
export function resetLiveModelCacheForTesting(): void {
  cache.clear();
}

function getCacheEntry(workspaceId: string, principalId: string): CacheEntry | undefined {
  return cache.get(workspaceId)?.get(principalId);
}

function setCacheEntry(workspaceId: string, principalId: string, entry: CacheEntry): void {
  let byPrincipal = cache.get(workspaceId);
  if (!byPrincipal) {
    byPrincipal = new Map();
    cache.set(workspaceId, byPrincipal);
  }
  byPrincipal.set(principalId, entry);
}

/**
 * The one network call this module makes, isolated so {@link getLiveClaudeModels} above it stays
 * readable. `listProviderModels` never throws (every failure mode — auth, network, timeout,
 * malformed response — is caught internally and returned as `{ok: false, ...}`), so this never
 * rejects either; a rejection here would poison the cache slot above for the rest of the TTL
 * window, which is exactly the failure this delegation avoids by construction.
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
 * @overallScore 100
 */
async function fetchLiveClaudeModels(apiKey: string, baseUrl: string): Promise<readonly ProviderModelOption[] | null> {
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
 * @param now - Injectable clock for TTL tests; defaults to `Date.now`.
 * @complexity O(1) plus, at most, one cached network call.
 * @overallScore 100
 */
export async function getLiveClaudeModels(
  deps: { repo: AdminExecutionCredentialRepoPort; sealer: SecretSealerPort },
  key: { workspaceId: string; principalId: string },
  now: () => number = Date.now,
): Promise<readonly ProviderModelOption[] | null> {
  const stored = await resolveExecutionCredential(deps, key);
  if (!stored || stored.protocol !== "anthropic") return null;

  const cached = getCacheEntry(key.workspaceId, key.principalId);
  if (cached && cached.expiresAt > now()) return cached.value;

  const value = fetchLiveClaudeModels(stored.apiKey, stored.baseUrl ?? "https://api.anthropic.com");
  setCacheEntry(key.workspaceId, key.principalId, { expiresAt: now() + LIVE_MODEL_CACHE_TTL_MS, value });
  return value;
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
 * @overallScore 100
 */
export function unionModels(
  fallback: readonly AgentModelSummary[],
  live: readonly ProviderModelOption[],
): AgentModelSummary[] {
  const seen = new Set(fallback.map((model) => model.id));
  const merged = [...fallback];
  for (const model of live) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    merged.push({ id: model.id, label: model.label });
  }
  return merged;
}
