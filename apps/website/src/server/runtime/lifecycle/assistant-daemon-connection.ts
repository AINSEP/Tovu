/** Private inherited-IPC grammar and site server's current endpoint capability. Never persisted. */
import { z } from "zod";
import { currentAgentDaemonToken } from "#src/assistant/daemon-access";

export const daemonSiteRegistration = z.object({
  siteId: z.string().min(1).max(1024), env: z.record(z.string().optional()), token: z.string().min(1),
}).strict();
export type DaemonSiteRegistration = z.infer<typeof daemonSiteRegistration>;
export const daemonControlRequest = z.discriminatedUnion("operation", [
  daemonSiteRegistration.extend({ operation: z.literal("register") }),
  z.object({ operation: z.literal("withdraw"), siteId: z.string().min(1) }).strict(),
  z.object({ operation: z.literal("ready") }).strict(),
  z.object({ operation: z.literal("parking"), pid: z.number().int().positive() }).strict(),
  z.object({ operation: z.literal("unavailable"), pid: z.number().int().positive() }).strict(),
]);
export const daemonEndpoint = z.object({ url: z.string().url(), pid: z.number().int().positive() });
export const daemonConnection = daemonEndpoint.extend({ token: z.string().min(1) });
export type AssistantDaemonConnection = Readonly<z.infer<typeof daemonConnection>>;

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
