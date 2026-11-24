/** Tovu's private retained-state RPC. The site owns acceptance and provider configuration;
 * this protocol exposes neither acceptance/recovery writes nor a provider settings secret. */
import { z } from "zod/v3";
import { ASSISTANT_CLI_CAPABILITIES } from "@tovu/contracts/assistant-subagents-policy";
import type { DurableRunStore, DurableRunHead } from "@jini-ai/chat/server/durable-runs";
import { createDaemonCoreRequestSchema } from "@jini-ai/daemon/core-rpc-schema";

/** Only fields the daemon's start/liveness gates read; the daemon already owns its event log.
 * Read afresh at every gate. This is neither a cached acceptance nor a second attempt ledger. */
export type DaemonAttemptHead = Pick<DurableRunHead, "runId" | "workspaceId" | "principalId" | "messageId" | "conversationId" | "cancelReason" | "request">
  & { readonly message: Pick<DurableRunHead["message"], "runStatus"> };
export interface DaemonDurableRunStore extends Pick<DurableRunStore, "captureSession" | "clearSession" | "guardTool" | "completeTool"> {
  find(required: { runId: string; principalId?: string }, optional: Record<string, never>): Promise<DaemonAttemptHead | null>;
}

const id = z.string().min(1).max(1024);
/** `enabled` plus every CLI capability key: the complete set a run may allow. */
const cliConsentKeys = ["enabled", ...ASSISTANT_CLI_CAPABILITIES.map(capability => capability.key)];
export const DAEMON_SETTINGS_NAMESPACES = ["core.instructions", "core.interface", "core.assistant-full-cli"] as const;
export type DaemonSettingsNamespace = (typeof DAEMON_SETTINGS_NAMESPACES)[number];
export const daemonCoreRequest = createDaemonCoreRequestSchema({ cliConsentKeys, settingsNamespaces: DAEMON_SETTINGS_NAMESPACES });

export const daemonCoreSnapshot = z.object({
  workspaceId: id, ownerPrincipalId: id,
  siteBinding: z.object({ dir: id, name: id }),
  siteStoragePaths: z.object({ contentDbPath: id, mediaUploadsDir: id, chatAttachmentsDir: id }),
  traceEnabled: z.boolean(), traceCapture: z.enum(["off", "metadata", "full"]),
});
export type DaemonCoreSnapshot = z.infer<typeof daemonCoreSnapshot>;

/** A refused/unavailable retained-state boundary; never contains a credential or owner payload. */
export class DaemonCoreError extends Error {
  readonly code = "DAEMON_CORE_UNAVAILABLE";
  constructor({ reason }: { reason: string }, _options: Record<string, never> = {}) {
    super(reason); this.name = "DaemonCoreError";
  }
}
