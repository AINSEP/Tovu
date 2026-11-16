import { readFederationAdmissions, type FederationAdmissionsPorts } from "@jini-ai/mcp/federation";
import { describeErrorForLog } from "#src/contracts/core/model-facing-tool-errors";
import type { ExternalMcpOperations } from "./operations-tools.js";

/** Live in-process accounting. The federation transport owns remote errors and their tracing. */
export type ServerAdmissionsReader = Omit<FederationAdmissionsPorts, "report">;

/** One failure contract for missing composition, a connecting server or a failed read.
 * Keep the legacy code until the admin client's unavailable-state contract migrates too:
 * an unavailable report must never look like an empty admitted roster. */
function unavailable(): Awaited<ReturnType<ExternalMcpOperations["admissions"]>> {
  return { ok: false, body: { error: "the server's external MCP admissions are unavailable — try again shortly", code: "AGENT_DAEMON_UNAVAILABLE" } };
}

/** Fixed metadata only: an opaque transport failure must not expose credentials to the client or the log. */
function reportAdmissionsFailure({ error }: { error: unknown }, _optional = {}): void {
  console.error("external-mcp server admissions read failed", describeErrorForLog({ err: error }));
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
  const result = await readFederationAdmissions({ ports: { awaitFederation, readAdmissions, report: reportAdmissionsFailure }, timeoutMs: 5_000 });
  if (!result.ok) return unavailable();
  return result.configFailures === undefined
    ? { ok: true, connections: result.connections }
    : { ok: true, connections: result.connections, configFailures: result.configFailures };
}
