import type { ExternalMcpOperations } from "#src/features/external-mcp/operations-tools";

/** Live in-process accounting. The federation transport owns remote errors and their tracing. */
export interface ServerAdmissionsReader {
  readonly awaitFederation?: (timeoutMs: number) => Promise<{ readonly settled: boolean }>;
  readonly readAdmissions?: () => Promise<{ readonly connections: unknown; readonly configFailures?: unknown }>;
}

/** One failure contract for missing composition, a connecting server or a failed read.
 * Keep the legacy code until the admin client's unavailable-state contract migrates too:
 * an unavailable report must never look like an empty admitted roster. */
function unavailable(): Awaited<ReturnType<ExternalMcpOperations["admissions"]>> {
  return { ok: false, body: { error: "the server's external MCP admissions are unavailable — try again shortly", code: "AGENT_DAEMON_UNAVAILABLE" } };
}

/** Read the server's single federation after its bounded admission wait; never wake a daemon.
 * @param required - The existing surface's wait and live-report ports; absent ports fail closed.
 * @returns Current reports, preserving optional config failures, or the legacy distinguishable failure.
 * @example readServerAdmissions({ awaitFederation: surface.awaitFederation, readAdmissions })
 * @complexity O(1) beyond federation startup and the report reader; the wait is bounded to 5 seconds.
 */
export async function readServerAdmissions(
  { awaitFederation, readAdmissions }: ServerAdmissionsReader,
  _options: Record<string, never> = {},
): ReturnType<ExternalMcpOperations["admissions"]> {
  if (!awaitFederation || !readAdmissions) return unavailable();
  try {
    if (!(await awaitFederation(5_000)).settled) return unavailable();
    const report = await readAdmissions();
    if (!Array.isArray(report.connections)) return unavailable();
    if (report.configFailures !== undefined && !Array.isArray(report.configFailures)) return unavailable();
    return report.configFailures === undefined
      ? { ok: true, connections: report.connections }
      : { ok: true, connections: report.connections, configFailures: report.configFailures };
  } catch {
    // Fixed metadata only: an opaque transport failure must not expose credentials to the client.
    console.error("external-mcp server admissions read failed");
    return unavailable();
  }
}
