import { getResumeCapableAgentIds as jiniGetResumeCapableAgentIds, resetResumeCapableAgentIds as jiniResetResumeCapableAgentIds, recordAgents as jiniRecordAgents, fetchAgents as jiniFetchAgents, replaceAgents as jiniReplaceAgents, rescanAgentsInto as jiniRescanAgentsInto, useAgentsLoader as jiniUseAgentsLoader, readDaemonOnline as jiniReadDaemonOnline, type AgentsLoader } from "@jini-ai/admin/shell/components/AssistantDock/hooks/agents-inventory.hooks";
import { type ChatPaneAgent } from "@jini-ai/chat/react";

import { ApiError, authenticatedAdminRequest } from "@/lib/admin-http/request";
import { writeAgentsSnapshot } from "@/lib/shell-collaborators";
import { useCachedLoader } from "@jini-ai/ui/fetch-query";
import { useAdminBootScope } from "@jini-ai/admin/shell/lib/admin-boot-scope";
import type { CachedLoader } from "@jini-ai/core/fetch";

/**
 * Mirrors `lib/api.ts`'s `DEFAULT_REQUEST_TIMEOUT_MS` (60s). `listAgents`/`rescanAgents`/
 * `daemonOnline` below bypass that shared `request()` seam entirely — `/api/agents` is not under
 * `request()`'s `/api/admin/v1` base path — so without their own bound they can hang forever under
 * the same per-origin connection-pool exhaustion `api.ts`'s own `REQUEST_TIMEOUT_CODE` doc
 * describes (every open admin tab keeps one `EventSource` connection open forever; see
 * `lib/settings-events.ts`).
 */
const AGENTS_URL = "/api/agents";
const AGENTS_FETCH_TIMEOUT_MS = 60_000;

/** This admin's resume-capable agentId set: what the inventory writes below record and what the
 *  assistant transport reads through {@link getResumeCapableAgentIds}. One instance per admin page,
 *  starting empty (every agent fails open to the full transcript until `/api/agents` answers). */
const resumeCapableAgentIds: { current: ReadonlySet<string> } = { current: new Set() };

/** The transport's `getResumeCapableAgentIds` option: the CURRENT set, read fresh per call. */
export function getResumeCapableAgentIds(
  _required: Record<string, never> = {}, _options: Record<string, never> = {},
): ReadonlySet<string> {
  return jiniGetResumeCapableAgentIds({ resumeCapableAgentIds });
}

/** Test seam: empties the set so a suite asserting on it starts cold. */
export function resetResumeCapableAgentIds(
  _required: Record<string, never> = {}, _options: Record<string, never> = {},
): void {
  jiniResetResumeCapableAgentIds({ resumeCapableAgentIds });
}

/** Records one fresh inventory everywhere that reads it: the resume-capable set the transport
 *  consults, and the localStorage placeholder for the next cold load. Called on what the cache
 *  settles on, not inside {@link fetchAgents}: a GET that was in flight across a rescan answers
 *  with the older list, which must not overwrite what the rescan recorded. */
export function recordAgents<T extends readonly ChatPaneAgent[]>(
  { agents }: { agents: T }, _options: Record<string, never> = {},
): T {
  return jiniRecordAgents({ agents, writeAgentsSnapshot, resumeCapableAgentIds });
}

async function fetchAgents(): Promise<ChatPaneAgent[]> {
  return jiniFetchAgents({ request: authenticatedAdminRequest, agentsUrl: AGENTS_URL, fetchTimeoutMs: AGENTS_FETCH_TIMEOUT_MS, ApiError });
}

/** Writes a fresh inventory into the cache and everything that reads it. */
export function replaceAgents({ loader, agents }: { loader: CachedLoader<ChatPaneAgent[]>; agents: ChatPaneAgent[] }, _options: Record<string, never> = {}): ChatPaneAgent[] {
  return jiniReplaceAgents({ loader, agents, clock: Date.now, writeAgentsSnapshot, resumeCapableAgentIds });
}

/** A rescan: the POST's answer replaces the cached list; when the POST gives no usable answer, a
 *  cache-bypassing GET does instead. When both fail it rejects without touching the cache, so a
 *  failed rescan never overwrites a good inventory (`ChatPane` keeps showing the last good list). */
export async function rescanAgentsInto(
  { loader }: { loader: CachedLoader<ChatPaneAgent[]> }, _options: Record<string, never> = {},
): Promise<ChatPaneAgent[]> {
  return jiniRescanAgentsInto({ loader, request: authenticatedAdminRequest, agentsUrl: AGENTS_URL, fetchTimeoutMs: AGENTS_FETCH_TIMEOUT_MS, ApiError, clock: Date.now, writeAgentsSnapshot, resumeCapableAgentIds });
}

/** Shares GET ownership through Jini's boot-scoped cache; accepted snapshot deadlines govern reads.
 * Structural sharing can publish a different array from the transport result. Overlapping readers
 * and late pre-Rescan GETs must not extend a newer snapshot's deadline. Exposes that same deadline
 * so pane retries can wait out a pending cooldown instead of spending their budget on cached reads. */
export function useAgentsLoader(
  _required: Record<string, never> = {},
  { useBootScope = useAdminBootScope, useLoader = useCachedLoader }: {
    useBootScope?: typeof useAdminBootScope;
    useLoader?: typeof useCachedLoader;
  } = {},
): AgentsLoader {
  return jiniUseAgentsLoader({ useBootScope, useLoader, fetchAgents, clock: Date.now });
}

/**
 * In-flight `daemonOnline()` reads share each runtime-access instance's pending probe so its
 * overlapping callers reuse one transport instead of each starting their own fetch. Health checks
 * bypass the provider's connectivity gate: the browser's internet flag says nothing about the local daemon.
 *
 * `@jini-ai/chat/react`'s `useChatPaneRuntimeInventory` polls `daemonOnline` on a bare
 * `window.setInterval` every 5s while the tab is visible (0.3.11+ pauses it while hidden), and its
 * own de-dup (`useLatestOperation`) only ignores a STALE RESULT — it never
 * aborts the underlying fetch. Under connection-pool exhaustion, a `fetch` that queues forever
 * previously meant a brand new permanently-stuck request was added on every single tick, an
 * unbounded leak for as long as the tab stayed open (see
 * `ADS-memory/reports/2026-08-17-vite-proxy-pool-saturation-investigation.md`). Reusing one
 * in-flight promise caps that cost at one connection per runtime-access instance, the same fixed
 * cost the settings-events SSE already holds, instead of growing without bound.
 */
export async function readDaemonOnline(
  _required: Record<string, never> = {}, _options: Record<string, never> = {},
): Promise<boolean> {
  return jiniReadDaemonOnline({ fetch, agentsUrl: AGENTS_URL, fetchTimeoutMs: AGENTS_FETCH_TIMEOUT_MS });
}
