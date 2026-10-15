import type { McpBridgeProbeResult, RunLifecycle } from "@jini-ai/daemon";

type StreamEvent = Parameters<Parameters<RunLifecycle["stream"]>[0]["onEvent"]>[0];
type ErrorPayload = Extract<StreamEvent, { kind: "error" }>["payload"];
type EndPayload = Extract<StreamEvent, { kind: "end" }>["payload"];

/**
 * The `[agent-daemon] run <id> ended:` line; see its call site in `agent-daemon-server.ts` for why
 * it exists. Pure formatting, no I/O.
 */
export function formatRunEndLogLine(
  { runId, payload, agentId, conversationId, resumeAttempted }: {
    readonly runId: string;
    readonly payload: EndPayload;
    readonly agentId: string;
    readonly conversationId: string;
    readonly resumeAttempted: boolean;
  },
): string {
  return `[agent-daemon] run ${runId} ended: ${String(payload.status ?? "unknown")} (code=${String(payload.code ?? "none")}, signal=${String(payload.signal ?? "none")}, resumable=${String(payload.resumable ?? false)}, agent=${agentId}, conversation=${conversationId}, resumeAttempted=${resumeAttempted})`;
}

/**
 * Formats a protocol error and its optional bridge diagnostics as one daemon.log line.
 */
export function formatRunErrorLogLine(
  { runId, payload }: { readonly runId: string; readonly payload: ErrorPayload },
): string {
  const details = payload.error?.details;
  const stderrTail = details !== null && typeof details === "object" && "stderrTail" in details
    ? details.stderrTail : undefined;
  const diagnostic = typeof stderrTail === "string" && stderrTail.length > 0 ? ` | ${stderrTail}` : "";
  return `[agent-daemon] run ${runId} error: ${payload.error?.code ?? "unknown"}: ${payload.message}${diagnostic}`.replace(/\r\n|\r|\n/g, " | ");
}

/**
 * Formats the credential-free boot probe result for the daemon's stdout/stderr capture.
 */
export function formatBridgePreflightLogLine(
  { result }: { readonly result: McpBridgeProbeResult },
): string {
  if (result.ok) return `[agent-daemon] jini bridge preflight ok (${result.elapsedMs}ms)`;
  return `[agent-daemon] jini bridge preflight FAILED (exit=${result.exitCode}, signal=${result.signal}): ${result.stderrTail.replace(/\r\n|\r|\n/g, " | ")}`;
}
