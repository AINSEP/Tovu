/** Private inherited-IPC grammar and site server's current endpoint capability. Never persisted. */
import type { AssistantDaemonConnection } from "@tovu/host-shared/daemon-connection";
import { currentAgentDaemonToken } from "#src/assistant/daemon-access";

let delegated: AssistantDaemonConnection | undefined;
let previous: AssistantDaemonConnection | undefined;

/** Capture the endpoint and its credential together; old-run probes must retain both.
 * @complexity O(1), memory only. The caller owns readiness and inherited-channel authentication.
 */
export function setAssistantDaemonConnection(
  { connection }: { connection: AssistantDaemonConnection | undefined }, _optional = {},
): void {
  if (delegated && (connection?.url !== delegated.url || connection.token !== delegated.token)) previous = delegated;
  delegated = connection ? Object.freeze({ ...connection }) : undefined;
}
export function delegatedAssistantDaemonConnection(_required = {}, _optional = {}): AssistantDaemonConnection | undefined { return delegated; }
export function previousAssistantDaemonConnection(_required = {}, _optional = {}): AssistantDaemonConnection | undefined { return previous; }
/** Reset the existing process-lifecycle test seam without retaining a previous test's capability. */
export function resetAssistantDaemonConnectionForTests(_required = {}, _optional = {}): void { delegated = undefined; previous = undefined; }
/** Legacy standalone credential remains per-server; delegated callers use the IPC capability. */
export function assistantDaemonToken(_required = {}, { env = process.env }: { env?: NodeJS.ProcessEnv } = {}): string | undefined {
  return delegated?.token ?? currentAgentDaemonToken({ env }, {});
}
