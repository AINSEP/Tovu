import { sameFrontendOwner, type FrontendSessionOwner } from '@jini-ai/daemon';
/** Visitor-only binding of Jini's bound confirmations. Never shares the admin exchange store. */
import type { SurfaceExchangeStore } from "@jini-ai/core";
import { createBoundConfirmations } from "@jini-ai/daemon/surface-exchanges";
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

/** The bound exchange routing lives in `@jini-ai/daemon/surface-exchanges` (`createBoundConfirmations`).
 * Tovu binds: the visitor principal/channel (fc576483f: kept off the MCP-UI admin route), at most 20 held
 * site prompts and two per client IP, and the `tool_confirmation` client directive.
 */
export function createVisitorConfirmations({ exchanges, nowMs }: { exchanges: SurfaceExchangeStore; nowMs: () => number }, _options = {}): VisitorConfirmations {
  const bound = createBoundConfirmations<FrontendSessionOwner>({ exchanges, nowMs, sameOwner: sameFrontendOwner,
    principalId: "anonymous-visitor", channel: "visitor-tool-confirmation", limits: { maxHeld: 20, perQuotaKey: 2 } });
  return {
    request(required, _optional = {}) {
      const { binding } = required;
      return bound.request({
        binding: { runId: binding.runId, executionId: binding.executionId, quotaKey: binding.ip, owner: binding.owner },
        emission: ({ challengeId }) => ({ channel: "client_directive", payload: {
          kind: "tool_confirmation", challengeId, title: required.title, summary: required.summary,
        } }),
        emit: ({ payload }) => { required.emit(payload as unknown as ToolConfirmationDirective); },
        validate: required.validate, signal: required.signal,
      });
    },
    confirm: (required, _optional = {}) => bound.confirm(required),
  };
}
