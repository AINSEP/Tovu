import type { Tracker } from "@jini-ai/diagnostics/observability";
import type { ToolAttemptAuditSink } from "@jini-ai/daemon/tool-audit";

/**
 * @file `assistant_tool_used` product events (provider wave 2, 2026-10-25), read off the tool-attempt
 * audit trail: every assistant tool call (admin chat, daemon, site visitor) already passes through
 * this one sink, so decorating it covers them all without touching any executor. One event per
 * settled attempt (the `requested` row is skipped), carrying the tool id and its outcome phase only —
 * never input, output or error text. A tool the model invented is labelled `unknown`, since its
 * name is model text.
 */

/** A commit-aware sink keeps audit failure containment while exposing actual insertion evidence. */
export interface CommittedToolAttemptAuditSink extends ToolAttemptAuditSink {
  appendCommitted(required: Parameters<ToolAttemptAuditSink["append"]>[0], optional?: Parameters<ToolAttemptAuditSink["append"]>[1]): Promise<boolean>;
}

/** Capture committed settled attempts through the consent-gated product port. A sink without
 * insertion evidence retains audit behavior but cannot authorize a product event.
 * @returns The original audit failure behavior plus commit evidence for request-scoped observers.
 * @example withToolUseEvents({ sink: persistedAudit, tracker }, {});
 * @complexity O(1) time and space per attempt beyond the wrapped sink.
 */
export function withToolUseEvents({ sink, tracker }: { sink: ToolAttemptAuditSink & Partial<CommittedToolAttemptAuditSink>; tracker: Tracker }, _optional = {}): CommittedToolAttemptAuditSink {
  async function appendCommitted(required: Parameters<ToolAttemptAuditSink["append"]>[0], optional?: Parameters<ToolAttemptAuditSink["append"]>[1]): Promise<boolean> {
    const committed = sink.appendCommitted ? await sink.appendCommitted(required, optional) : (await sink.append(required, optional), false);
    // Public attempts need a request-scoped visitor decision; operator consent cannot authorize them.
    if (!committed || required.phase === "requested" || required.principalId === "anonymous-visitor") return committed;
    const toolId = required.phase === "unknown-tool" ? "unknown" : required.toolId;
    tracker.capture({ name: "assistant_tool_used", userId: required.principalId }, { properties: {
      toolId, outcome: required.phase, chatSurface: "admin", attemptId: required.attemptId,
      eventId: `assistant-tool:${required.attemptId}`,
    } });
    return committed;
  }
  return { append: async (required, optional) => { await appendCommitted(required, optional); }, appendCommitted };
}
