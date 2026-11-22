/** Private inherited-IPC grammar between the desktop agent service and the site server; both ends parse with these schemas. Never persisted. */
import { z } from "zod/v3";

// `siteId` is the site's workspace id and stays its data identity inside the scope. It is NOT
// unique: every local site is `workspace-local`. The shared desktop daemon routes scopes by
// `scopeKey` instead, which the desktop derives from the server it launched (never the server's claim).
const scopeKey = z.string().min(1).max(128).optional();
export const daemonSiteRegistration = z.object({
  siteId: z.string().min(1).max(1024), env: z.record(z.string().optional()), token: z.string().min(1), scopeKey,
}).strict();
export type DaemonSiteRegistration = z.infer<typeof daemonSiteRegistration>;
export const daemonControlRequest = z.discriminatedUnion("operation", [
  daemonSiteRegistration.extend({ operation: z.literal("register") }),
  z.object({ operation: z.literal("withdraw"), siteId: z.string().min(1), scopeKey }).strict(),
  z.object({ operation: z.literal("ready") }).strict(),
  z.object({ operation: z.literal("stopIfIdle") }).strict(),
  z.object({ operation: z.literal("parking"), pid: z.number().int().positive() }).strict(),
  z.object({ operation: z.literal("unavailable"), pid: z.number().int().positive() }).strict(),
]);
/** Only a strict idle result can acknowledge guarded shutdown; invalid replies mean busy. */
export const siteIdleStopReply = z.object({ idle: z.boolean() }).strict();
export const daemonEndpoint = z.object({ url: z.string().url(), pid: z.number().int().positive() });
export const daemonConnection = daemonEndpoint.extend({ token: z.string().min(1) });
export type AssistantDaemonConnection = Readonly<z.infer<typeof daemonConnection>>;
