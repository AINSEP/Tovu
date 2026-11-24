/** Binds the engine's daemon-connection registry to this site server: the one instance, and the legacy standalone credential fallback. Never persisted. */
import { createDaemonConnectionRegistry } from "@jini-ai/sidecar/daemon-connection";

import { currentAgentDaemonToken } from "#src/assistant/daemon-access";
import type { AssistantDaemonConnection } from "@tovu/contracts/daemon-connection";

/** The site server's one current/previous endpoint capability; the inherited-IPC registration in the daemon supervisor drives it. */
const connections = createDaemonConnectionRegistry<AssistantDaemonConnection>({}, {});

/** Capture the endpoint and its credential together; old-run probes must retain both. */
export function setAssistantDaemonConnection(required: { connection: AssistantDaemonConnection | undefined }, optional = {}): void {
  connections.set(required, optional);
}
export function delegatedAssistantDaemonConnection(_required = {}, _optional = {}): AssistantDaemonConnection | undefined { return connections.current({}, {}); }
export function previousAssistantDaemonConnection(_required = {}, _optional = {}): AssistantDaemonConnection | undefined { return connections.previous({}, {}); }
/** Reset the existing process-lifecycle test seam without retaining a previous test's capability. */
export function resetAssistantDaemonConnectionForTests(_required = {}, _optional = {}): void { connections.reset({}, {}); }
/** Legacy standalone credential remains per-server; delegated callers use the IPC capability. */
export function assistantDaemonToken(_required = {}, { env = process.env }: { env?: NodeJS.ProcessEnv } = {}): string | undefined {
  return connections.current({}, {})?.token ?? currentAgentDaemonToken({ env }, {});
}
