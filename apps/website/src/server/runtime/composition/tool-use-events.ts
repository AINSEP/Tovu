import type { ProductAnalyticsPort } from "@jini-ai/analytics/product";
import type { ToolAttemptAuditSink } from "@jini-ai/daemon/tool-audit";

/**
 * @file `assistant_tool_used` product events (provider wave 2, 2026-10-25), read off the tool-attempt
 * audit trail: every assistant tool call (admin chat, daemon, site visitor) already passes through
 * this one sink, so decorating it covers them all without touching any executor. One event per
 * settled attempt (the `requested` row is skipped), carrying the tool id and its outcome phase only —
 * never input, output or error text. A tool the model invented is labelled `unknown`, since its
 * name is model text.
 */

/**
 * Wraps `sink` so each settled attempt is also captured on the (consent-gated) product-analytics port.
 * @returns A sink with the same audit behavior; capture never blocks or fails the audit write.
 * @complexity O(1) per attempt on top of the wrapped sink.
 */
export function withToolUseEvents({ sink, productAnalytics }: { sink: ToolAttemptAuditSink; productAnalytics: ProductAnalyticsPort }): ToolAttemptAuditSink {
  return {
    append: (required, optional) => {
      if (required.phase !== "requested") {
        const toolId = required.phase === "unknown-tool" ? "unknown" : required.toolId;
        productAnalytics.capture({ name: "assistant_tool_used", userId: required.principalId, properties: { toolId, outcome: required.phase } });
      }
      return sink.append(required, optional);
    },
  };
}
