import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { HumanConfirmOutcome } from "@jini-ai/daemon/surface-exchanges/human-confirm";

/**
 * @file The admin assistant switch's resume hold (owner decision 11-23, H4).
 *
 * Turning the assistant off (`TOVU_ADMIN_ASSISTANT=off`) pauses only what an AGENT created. The
 * switch is an env var read once per process, so "turning it back on" is a restart; without a
 * persisted hold, that restart would resume every agent-made webhook, send and publish with nobody
 * having looked at them. So: whenever agent work is checked while the switch is off, a hold row
 * (`agent_pause_holds`, migration 0044) is written; it outlives restarts, and only an approved
 * resume card deletes it. Person-created work never consults this gate.
 */

/** One hold per workspace: when agent work was first seen paused, or null when nothing is held. */
export interface AgentPauseHoldStore {
  heldSince(required: { workspaceId: string }): Promise<string | null>;
  hold(required: { workspaceId: string; sinceIso: string }): Promise<void>;
  release(required: { workspaceId: string }): Promise<void>;
}

/** The SQL store over the content kernel (SQLite and Postgres share the DDL and these statements). */
export function sqlAgentPauseHoldStore(required: { kernel: KyselyKernel<unknown> }, _optional: Record<string, never> = {}): AgentPauseHoldStore {
  const { kernel } = required;
  return {
    heldSince: async ({ workspaceId }) =>
      (await kernel.query<{ held_since: string }>(sql`SELECT held_since FROM agent_pause_holds WHERE workspace_id = ${workspaceId}`))[0]?.held_since ?? null,
    // DO NOTHING on conflict: the first sighting is when the pause began; later ticks must not move it.
    hold: async ({ workspaceId, sinceIso }) => {
      await kernel.execute(sql`INSERT INTO agent_pause_holds (workspace_id, held_since) VALUES (${workspaceId}, ${sinceIso}) ON CONFLICT (workspace_id) DO NOTHING`);
    },
    release: async ({ workspaceId }) => { await kernel.execute(sql`DELETE FROM agent_pause_holds WHERE workspace_id = ${workspaceId}`); },
  };
}

/** The in-memory store for the memory composition and unit rigs. */
export function createMemoryAgentPauseHoldStore(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): AgentPauseHoldStore {
  const holds = new Map<string, string>();
  return {
    heldSince: async ({ workspaceId }) => holds.get(workspaceId) ?? null,
    hold: async ({ workspaceId, sinceIso }) => { if (!holds.has(workspaceId)) holds.set(workspaceId, sinceIso); },
    release: async ({ workspaceId }) => { holds.delete(workspaceId); },
  };
}

export type AgentResumeResult =
  | { resumed: true }
  | { resumed: false; reason: "assistant-off" | "not-held" | Extract<HumanConfirmOutcome, { confirmed: false }>["reason"] };

export interface AgentPauseGate {
  /**
   * Records the hold NOW if the switch is off, without waiting for a worker to ask. The composition
   * calls it at boot: the switch is read once per process, so boot IS the off-transition, and the
   * public reads filter on the hold row — an agent post scheduled before the first webhook tick
   * must not slip live in the gap before something happens to call `isAgentWorkAllowed()`.
   */
  recordSwitchState(): Promise<void>;
  /** False while the switch is off (recording the hold) or while an unapproved hold remains. */
  isAgentWorkAllowed(): Promise<boolean>;
  /** Releases the hold only after `confirm` (the approval card) says yes, and only with the switch on. */
  resume(required: { confirm: () => Promise<HumanConfirmOutcome> }): Promise<AgentResumeResult>;
}

/**
 * Builds the gate every agent-created-work loop consults.
 * @example createAgentPauseGate({ store, workspaceId, assistantEnabled: () => enabled, clock })
 * @complexity O(1) store calls per check.
 */
export function createAgentPauseGate(
  required: { store: AgentPauseHoldStore; workspaceId: string; assistantEnabled: () => boolean; clock: { nowIso(): string } },
  _optional: Record<string, never> = {},
): AgentPauseGate {
  const { store, workspaceId, assistantEnabled, clock } = required;
  return {
    async recordSwitchState() {
      if (!assistantEnabled()) await store.hold({ workspaceId, sinceIso: clock.nowIso() });
    },
    async isAgentWorkAllowed() {
      if (!assistantEnabled()) {
        await store.hold({ workspaceId, sinceIso: clock.nowIso() });
        return false;
      }
      return (await store.heldSince({ workspaceId })) === null;
    },
    async resume({ confirm }) {
      // No card while the switch is off: approving would release work the switch still forbids.
      if (!assistantEnabled()) return { resumed: false, reason: "assistant-off" };
      if ((await store.heldSince({ workspaceId })) === null) return { resumed: false, reason: "not-held" };
      const outcome = await confirm();
      if (!outcome.confirmed) return { resumed: false, reason: outcome.reason };
      await store.release({ workspaceId });
      return { resumed: true };
    },
  };
}
