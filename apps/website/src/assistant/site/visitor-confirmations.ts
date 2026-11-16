import { sameFrontendOwner, type FrontendSessionOwner } from '@jini-ai/daemon';
/** Visitor-only bridge over Jini's expiring exchanges. Never shares the admin exchange store. */
import type { SurfaceExchangeStore } from "@jini-ai/core";
import type { ClientDirective } from "./client-directives.js";

export const VISITOR_CONFIRMATION_WAIT_MS = 60_000;
export type ToolConfirmationDirective = Extract<ClientDirective, { kind: "tool_confirmation" }>;
export interface VisitorConfirmationRequest {
  readonly binding: { readonly runId: string; readonly executionId: string; readonly ip: string; readonly owner?: FrontendSessionOwner };
  readonly title: string;
  readonly summary: string;
  readonly emit: (directive: ToolConfirmationDirective) => void;
  readonly validate: () => Promise<boolean>;
  readonly signal?: AbortSignal;
}
export interface VisitorConfirmations {
  request(required: VisitorConfirmationRequest, optional?: Record<string, never>): Promise<boolean>;
  confirm(required: { challengeId: string; allow: boolean; owner?: FrontendSessionOwner }, optional?: Record<string, never>): Promise<boolean>;
}

type PendingConfirmation = { owner?: FrontendSessionOwner; validate: VisitorConfirmationRequest["validate"]; expiresAtMs: number; deliver: (required: { allow: boolean }, optional?: Record<string, never>) => boolean };
type ConfirmationState = {
  readonly exchanges: SurfaceExchangeStore;
  readonly nowMs: () => number;
  readonly pending: Map<string, PendingConfirmation>;
  readonly turns: Set<string>;
  readonly ipCounts: Map<string, number>;
};

/** Claimed replies are still held streams until finally, so count turns rather than live bearers. */
function atCapacity(required: { state: ConfirmationState; binding: VisitorConfirmationRequest["binding"] }, _optional = {}): boolean {
  const { state, binding } = required;
  return state.turns.size >= 20 || state.turns.has(binding.runId) || (state.ipCounts.get(binding.ip) ?? 0) >= 2;
}

async function requestConfirmation(required: VisitorConfirmationRequest & { state: ConfirmationState }, _optional = {}): Promise<boolean> {
  const { binding, emit, signal, state } = required;
  const { exchanges, pending, turns, ipCounts } = state;
  const ipCount = ipCounts.get(binding.ip) ?? 0;
  if (signal?.aborted || atCapacity({ state, binding })) return false;
  // Unlike the admin channel, identity here is the unguessable human-only exchange ID.
  // The server retains the full plan binding; caller input can supply none of these fields.
  const exchange = exchanges.open({ binding: { principalId: "anonymous-visitor", toolId: binding.executionId, channel: "visitor-tool-confirmation" },
    emit: async ({ payload }) => { emit(payload as unknown as ToolConfirmationDirective); } });
  turns.add(binding.runId);
  ipCounts.set(binding.ip, ipCount + 1);
  pending.set(exchange.id, { owner: binding.owner, validate: required.validate, expiresAtMs: exchange.expiresAtMs(),
    deliver: ({ allow }, _optional = {}) => exchanges.deliver({ exchangeId: exchange.id, principalId: "anonymous-visitor", params: { allow } },
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
}

async function confirmChallenge(required: { state: ConfirmationState; challengeId: string; allow: boolean; owner?: FrontendSessionOwner }, _optional = {}): Promise<boolean> {
  const { state, challengeId, allow, owner } = required;
  const { pending, nowMs } = state;
  const held = pending.get(challengeId);
  if (!held) return false;
  if (held.owner && !sameFrontendOwner({ expected: held.owner, actual: owner })) return false;
  // Claim before any await: simultaneous clicks/replays cannot queue a second answer.
  pending.delete(challengeId);
  let valid = false;
  let delivered = false;
  try { valid = nowMs() < held.expiresAtMs && await held.validate(); }
  finally {
    valid = valid && nowMs() < held.expiresAtMs;
    delivered = held.deliver({ allow: valid && allow });
  }
  return valid && delivered;
}

/** The random exchange ID is a single-use bearer delivered only on its owning SSE response.
 * Jini owns expiry, buffering, abandonment and timer disposal. This map only routes the visitor's
 * reply to the server-held binding; no browser/model field can retarget a pending execution.
 * @complexity O(1) routing; at most 20 held site prompts, two per IP and one per turn.
 */
export function createVisitorConfirmations({ exchanges, nowMs }: { exchanges: SurfaceExchangeStore; nowMs: () => number }, _options = {}): VisitorConfirmations {
  const state: ConfirmationState = { exchanges, nowMs, pending: new Map(), turns: new Set(), ipCounts: new Map() };
  return {
    request: (required, _optional = {}) => requestConfirmation({ ...required, state }),
    confirm: ({ challengeId, allow, owner }, _optional = {}) => confirmChallenge({ state, challengeId, allow, owner }),
  };
}
