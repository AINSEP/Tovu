import type { ChatPaneAgent } from "@jini-ai/chat/react";
import { createAgentInventorySnapshot } from "@jini-ai/chat/browser/agent-inventory";

/**
 * @file The assistant picker's instant placeholder: the last `/api/agents` inventory this browser
 * saw, kept in `localStorage` so the Local CLI picker has something real to show while a cold
 * daemon re-probes every installed CLI (~4s after a daemon restart).
 *
 * Why the last live answer rather than a static list shipped in the bundle: the only source of
 * agent defs is `@jini-ai/agent-runtime`, which is Node-only, and `agents.ts` on the website side
 * warns that a hardcoded client list offers agents whose run then fails. `ChatPane` swaps the
 * placeholder for the live list the moment `listAgents` resolves. Storage failures are absorbed by
 * the shared snapshot (`@jini-ai/chat/browser/agent-inventory`).
 */

/** Versioned so a future change to the stored shape can ignore old entries instead of misreading them. */
const STORAGE_KEY = "tovu.admin.assistant-agents.v1";

// Lazy property access: reading `localStorage` itself can throw in some privacy modes, and the shared
// snapshot only absorbs errors raised inside its own calls.
const snapshot = createAgentInventorySnapshot<ChatPaneAgent>({
  storage: {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  },
  key: STORAGE_KEY,
});

/** The last stored inventory, or `undefined` when there is none, it is empty, or it is unreadable. */
export function readAgentsSnapshot(): readonly ChatPaneAgent[] | undefined {
  return snapshot.read({});
}

/** Stores a live inventory for the next cold load (empty lists are ignored; never throws). */
export function writeAgentsSnapshot({ agents }: { agents: readonly ChatPaneAgent[] }, _optional: Record<string, never> = {}): void {
  snapshot.write({ agents });
}
