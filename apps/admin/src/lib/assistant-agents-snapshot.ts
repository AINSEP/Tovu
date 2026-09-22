import type { ChatPaneAgent } from "@jini-ai/chat/react";

/**
 * @file The assistant picker's instant placeholder: the last `/api/agents` inventory this browser
 * saw, kept in `localStorage` so the Local CLI picker has something real to show while a cold
 * daemon re-probes every installed CLI (~4s after a daemon restart).
 *
 * Why the last live answer rather than a static list shipped in the bundle: the only source of
 * agent defs is `@jini-ai/agent-runtime`, which is Node-only, so a bundled list would be a
 * hand-maintained duplicate that drifts from the daemon's registry — and `agents.ts` on the
 * website side warns that a hardcoded client list offers agents whose run then fails. The last live
 * answer is the same machine's own probe result, usually still exact. It is only ever a placeholder:
 * `ChatPane` swaps it for the live list the moment `listAgents` resolves.
 *
 * Every access is wrapped: `localStorage` throws in some privacy modes and on quota exhaustion, and
 * a missing placeholder only costs the pre-existing "Loading available CLIs" state.
 */

/** Versioned so a future change to the stored shape can ignore old entries instead of misreading them. */
const STORAGE_KEY = "tovu.admin.assistant-agents.v1";

function isAgentShape(value: unknown): value is ChatPaneAgent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { id?: unknown; name?: unknown };
  return typeof candidate.id === "string" && typeof candidate.name === "string";
}

/** The last stored inventory, or `undefined` when there is none, it is empty, or it is unreadable.
 *  @complexity Time/space: O(n) in stored agents. */
export function readAgentsSnapshot(): readonly ChatPaneAgent[] | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isAgentShape)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/** Stores a live inventory for the next cold load. An empty list is not stored: it would replace a
 *  useful placeholder with one that shows nothing. Silent no-op on any storage failure.
 *  @complexity Time/space: O(n) for the one `JSON.stringify`. */
export function writeAgentsSnapshot(agents: readonly ChatPaneAgent[]): void {
  if (agents.length === 0) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
  } catch {
    // Best-effort — the live list is already on screen; only the next cold load loses its placeholder.
  }
}
