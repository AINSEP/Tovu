/** Visitor-only bridge over Jini's expiring exchanges. Never shares the admin exchange store. */
import type { SurfaceExchangeStore } from "@jini-ai/core";
import type { ClientDirective } from "./client-directives.js";

export const VISITOR_CONFIRMATION_WAIT_MS = 60_000;
export type ToolConfirmationDirective = Extract<ClientDirective, { kind: "tool_confirmation" }>;
export interface VisitorConfirmationRequest {
  readonly binding: { readonly runId: string; readonly executionId: string; readonly ip: string };
  readonly title: string;
  readonly summary: string;
  readonly emit: (directive: ToolConfirmationDirective) => void;
  readonly validate: () => Promise<boolean>;
  readonly signal?: AbortSignal;
}
export interface VisitorConfirmations {
  request(required: VisitorConfirmationRequest, optional?: Record<string, never>): Promise<boolean>;
  confirm(required: { challengeId: string; allow: boolean }, optional?: Record<string, never>): Promise<boolean>;
}

/** The random exchange ID is a single-use bearer delivered only on its owning SSE response.
 * Jini owns expiry, buffering, abandonment and timer disposal. This map only routes the visitor's
 * reply to the server-held binding; no browser/model field can retarget a pending execution.
 * @complexity O(1) routing; at most 20 held site prompts, two per IP and one per turn.
 */
export function createVisitorConfirmations({ exchanges, nowMs }: { exchanges: SurfaceExchangeStore; nowMs: () => number }, _options = {}): VisitorConfirmations {
  const pending = new Map<string, { validate: VisitorConfirmationRequest["validate"]; expiresAtMs: number; deliver: (allow: boolean) => boolean }>();
  const turns = new Set<string>();
  const ipCounts = new Map<string, number>();

  /** Claimed replies are still held streams until finally, so count turns rather than live bearers. */
  function atCapacity({ binding }: { binding: VisitorConfirmationRequest["binding"] }, _optional = {}): boolean {
    return turns.size >= 20 || turns.has(binding.runId) || (ipCounts.get(binding.ip) ?? 0) >= 2;
  }

  return {
    async request(required, _optional = {}) {
      const { binding, emit, signal } = required;
      const ipCount = ipCounts.get(binding.ip) ?? 0;
      if (signal?.aborted || atCapacity({ binding })) return false;
      // Unlike the admin channel, identity here is the unguessable human-only exchange ID.
      // The server retains the full plan binding; caller input can supply none of these fields.
      const exchange = exchanges.open({ binding: { principalId: "anonymous-visitor", toolId: binding.executionId, channel: "visitor-tool-confirmation" },
        emit: async ({ payload }) => { emit(payload as unknown as ToolConfirmationDirective); } });
      turns.add(binding.runId);
      ipCounts.set(binding.ip, ipCount + 1);
      pending.set(exchange.id, { validate: required.validate, expiresAtMs: exchange.expiresAtMs(),
        deliver: allow => exchanges.deliver({ exchangeId: exchange.id, principalId: "anonymous-visitor", params: { allow } },
          { toolId: binding.executionId, channel: "visitor-tool-confirmation" }).ok });
      const abandon = () => exchange.close({});
      signal?.addEventListener("abort", abandon, { once: true });
      try {
        await exchange.send({ emission: { channel: "client_directive", payload: {
          kind: "tool_confirmation", challengeId: exchange.id, title: required.title, summary: required.summary,
        } } });
        const answer = await exchange.receive({});
        return answer.status === "received" && answer.params.allow === true;
      } finally {
        pending.delete(exchange.id);
        turns.delete(binding.runId);
        const remaining = ipCounts.get(binding.ip)! - 1;
        if (remaining === 0) ipCounts.delete(binding.ip);
        else ipCounts.set(binding.ip, remaining);
        signal?.removeEventListener("abort", abandon);
        exchange.close({});
      }
    },
    async confirm({ challengeId, allow }, _optional = {}) {
      const held = pending.get(challengeId);
      if (!held) return false;
      // Claim before any await: simultaneous clicks/replays cannot queue a second answer.
      pending.delete(challengeId);
      let valid = false;
      let delivered = false;
      try { valid = nowMs() < held.expiresAtMs && await held.validate(); }
      finally {
        valid = valid && nowMs() < held.expiresAtMs;
        delivered = held.deliver(valid && allow);
      }
      return valid && delivered;
    },
  };
}
