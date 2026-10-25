import { withAiTracing, type RunLifecycle } from "@jini-ai/daemon";
import type { AiTraceSink } from "@jini-ai/agent-runtime/ai-trace";

/**
 * Assistant runs → AI trace (provider wave 2, 2026-10-25). Only when an AI-trace provider plugin is
 * installed, enabled and configured does `RouteDeps` carry a sink; otherwise the lifecycle is
 * returned untouched, so a default install adds no wrapper frame. Tracing failures are reported by
 * error class only (never the message, which may carry prompt or credential text) and never change a
 * run's own result: that containment is the daemon decorator's (`withAiTracing`).
 * @param required The daemon's run lifecycle and the configured sink, if any.
 * @param optional `warn` for sink failures (default: console).
 * @returns The lifecycle to serve runs through and its teardown (call before the store closes).
 * @complexity O(1); per-event cost is the decorator's.
 */
export function traceRunLifecycle(
  required: { lifecycle: RunLifecycle; sink: AiTraceSink | undefined },
  optional: { warn?: (message: string) => void } = {},
): { lifecycle: RunLifecycle; dispose: () => void } {
  if (!required.sink) return { lifecycle: required.lifecycle, dispose: () => {} };
  const warn = optional.warn ?? ((message: string) => console.warn(message));
  const traced = withAiTracing({ lifecycle: required.lifecycle, sink: required.sink }, {
    onSinkError: (error: unknown) => warn(`[agent-daemon] AI trace sink failed: ${error instanceof Error ? error.name : typeof error}`),
  });
  return { lifecycle: traced, dispose: () => traced.dispose() };
}
