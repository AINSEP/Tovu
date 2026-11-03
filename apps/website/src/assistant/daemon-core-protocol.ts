/** Tovu's private retained-state RPC. The site owns acceptance and provider configuration;
 * this protocol exposes neither acceptance/recovery writes nor a provider settings secret. */
import type { AiTraceEvent } from "@jini-ai/agent-runtime/ai-trace";
import { z } from "zod";
import type { DurableRunStore, DurableRunHead } from "./durable-runs/ports.js";

/** Only fields the daemon's start/liveness gates read; the daemon already owns its event log.
 * Read afresh at every gate. This is neither a cached acceptance nor a second attempt ledger. */
export type DaemonAttemptHead = Pick<DurableRunHead, "runId" | "workspaceId" | "principalId" | "messageId" | "conversationId" | "cancelReason" | "request">
  & { readonly message: Pick<DurableRunHead["message"], "runStatus"> };
export interface DaemonDurableRunStore extends Pick<DurableRunStore, "captureSession" | "clearSession" | "guardTool" | "completeTool"> {
  find(required: { runId: string; principalId?: string }, optional: Record<string, never>): Promise<DaemonAttemptHead | null>;
}

const id = z.string().min(1).max(1024);
const runId = { runId: id };
const operation = <N extends string, S extends z.ZodType>(name: N, input: S) => z.object({ operation: z.literal(name), input }).strict();
const primitiveAttributes = z.record(z.union([z.string(), z.number(), z.boolean()]));
// The wire grammar mirrors Jini's trace event contract, never its provider implementation.
const captured = z.object({ chars: z.number(), text: z.string().optional(), truncated: z.boolean().optional(), redactions: z.record(z.number()).optional() }).nullable();
const nullableNumber = z.number().nullable();
const aiTraceEvent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("run_started"), traceId: id, runId: id, at: z.number(), agentId: id, provider: z.string().nullable(), model: z.string().nullable(), sessionId: z.string().nullable(), input: captured, tags: z.array(z.string()) }),
  z.object({ kind: z.literal("model_turn"), traceId: id, turnId: id, index: z.number(), startedAt: z.number(), endedAt: z.number(), model: z.string().nullable(),
    input: captured, output: captured, reasoning: captured, usage: z.object({ inputTokens: nullableNumber, outputTokens: nullableNumber, cacheReadTokens: nullableNumber, cacheWriteTokens: nullableNumber, reasoningTokens: nullableNumber }).nullable(),
    costUsd: nullableNumber, costSource: z.enum(["provider", "estimated"]).nullable(), ttftMs: nullableNumber, stopReason: z.string().nullable(), error: z.string().nullable(),
    errorContent: captured.optional(), errorCode: z.string().nullable().optional(), toolCallCount: z.number().optional() }),
  z.object({ kind: z.literal("tool_call"), traceId: id, toolCallId: id, turnId: id, name: z.string(), input: captured, output: captured, isError: z.boolean(),
    errorClass: z.enum(["input_validation", "execution", "denied", "timeout"]).nullable(), startedAt: z.number(), endedAt: nullableNumber }),
  z.object({ kind: z.literal("run_finished"), traceId: id, at: z.number(), outcome: z.enum(["succeeded", "failed", "cancelled"]),
    error: z.object({ message: z.string(), code: z.string().nullable(), content: captured.optional() }).nullable(),
    totals: z.object({ turns: z.number(), toolCalls: z.number(), toolErrors: z.number(), inputTokens: nullableNumber, outputTokens: nullableNumber, costUsd: nullableNumber }) }),
]);
export const daemonCoreRequest = z.discriminatedUnion("operation", [
  operation("bootstrap", z.object({}).strict()),
  operation("sessionForAttempt", z.object(runId).strict()),
  operation("find", z.object({ ...runId, principalId: id.optional() }).strict()),
  operation("captureSession", z.object({ ...runId, sessionId: id, confirmed: z.boolean().optional(),
    child: z.object({ pid: z.number().int().positive(), startedAt: id }).strict().optional() }).strict()),
  operation("clearSession", z.object({ ...runId, sessionId: id }).strict()),
  operation("guardTool", z.object({ ...runId, toolId: id, input: z.unknown(), toolUseId: id.optional() }).strict()),
  operation("completeTool", z.object({ ...runId, toolUseId: id, content: z.string() }).strict()),
  operation("getEffective", z.object({ namespace: z.enum(["core.instructions", "core.interface", "core.assistant-full-cli"]), key: id,
    scopeContext: z.object({ workspaceId: id, principalId: id.optional() }).strict() }).strict()),
  operation("telemetryCapture", z.object({ name: id, userId: id, properties: primitiveAttributes.optional() }).strict()),
  operation("telemetryError", z.object({ name: id, message: z.string(), stack: z.string().optional(),
    operation: id, attributes: z.record(z.union([z.string(), z.number()])).optional(), level: z.enum(["warning", "error"]).optional() }).strict()),
  operation("telemetryTrace", aiTraceEvent),
  operation("telemetryFlush", z.object({}).strict()),
]);
export type DaemonCoreRequest = Exclude<z.infer<typeof daemonCoreRequest>, { operation: "telemetryTrace" }>
  | { operation: "telemetryTrace"; input: AiTraceEvent };
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
