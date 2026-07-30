/**
 * @file Ambient declarations for `@jini-ai/core`, `@jini-ai/daemon`, and `@jini-ai/http`.
 *
 * WHY THIS EXISTS: same reason as the former `src/agent-chat/jini-agent-runtime.d.ts` (ADR-049
 * carries the pattern forward, this file replaces it). Tovu's root tsconfig uses
 * `moduleResolution: "Node"` (node10), which ignores a package's `exports` field, so `import type
 * ... from "@jini-ai/core"` fails with TS2307 even though `require()` resolves the real package
 * fine at runtime. Declares only the surface `src/assistant/` actually uses.
 *
 * Delete once Tovu moves to `moduleResolution: "NodeNext"`, or once these packages ship a
 * `main`/`types` field readable under node10 resolution.
 */
declare module "@jini-ai/core" {
  export interface Principal {
    readonly id: string;
    readonly roles?: readonly string[];
  }

  export interface RunRef {
    readonly id: string;
  }

  export interface ToolDescriptor {
    readonly id: string;
    readonly description?: string;
    readonly inputSchema?: unknown;
    readonly requiresConfirmation?: boolean;
    readonly timeoutMs?: number;
    readonly maxOutputBytes?: number;
  }

  export interface ToolExecutionContext {
    readonly executionId: string;
    readonly principal: Principal;
    readonly run: RunRef;
    readonly input: unknown;
    readonly signal: AbortSignal;
  }

  export type ToolHandler = (ctx: ToolExecutionContext) => Promise<unknown>;
  export type AuthorizationDecision = "allow" | "deny";

  export interface ToolAuthorizationContext {
    readonly principal: Principal;
    readonly run: RunRef;
    readonly tool: ToolDescriptor;
    readonly input: unknown;
  }

  export interface ToolPolicy {
    authorize(ctx: ToolAuthorizationContext): AuthorizationDecision | Promise<AuthorizationDecision>;
  }

  export interface ToolRegistration {
    readonly descriptor: ToolDescriptor;
    readonly handler: ToolHandler;
    readonly policy: ToolPolicy;
  }

  export interface ToolRegistry {
    register(registration: ToolRegistration): void;
    has(toolId: string): boolean;
    list(): readonly ToolDescriptor[];
  }

  export function createToolRegistry(): ToolRegistry;
}

declare module "@jini-ai/protocol" {
  export const RUN_PROTOCOL_VERSION: 1;

  export interface RunEvent<Name extends string, Payload> {
    runId: string;
    eventId: string;
    opaqueCursor: string;
    readonly protocolVersion: 1;
    ts: number;
    kind: Name;
    payload: Payload;
    durability: "durable" | "ephemeral";
  }

  export const RUN_STATES: readonly string[];
  export type RunState = "pending" | "running" | "succeeded" | "failed" | "cancelled";
  export interface RunStatus {
    id: string;
    state: RunState;
    label?: string;
    detail?: string;
    startedAt?: number;
    updatedAt?: number;
    endedAt?: number;
  }
  export interface RunCancelRequest {
    runId: string;
    reason?: string;
  }

  export interface RunStartPayload {
    runId: string;
    contextRef: string;
    agentId?: string;
    idempotencyKey?: string;
  }
  export interface RunChunkPayload {
    chunk: string;
  }
  export interface RunEndPayload {
    code: number | null;
    signal?: string | null;
    status?: "succeeded" | "failed" | "canceled";
    resumable?: boolean;
    sessionRef?: string;
  }
  export interface RunErrorPayload {
    message: string;
    code?: string;
  }
  export type RunAgentPayload =
    | { type: "status"; label: string; model?: string; ttftMs?: number; detail?: string }
    | { type: "text_delta"; delta: string }
    | { type: "thinking_start" }
    | { type: "thinking_delta"; delta: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
    | { type: "tool_input_delta"; id: string; name: string; delta: string }
    | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean }
    | { type: "usage"; usage?: { input_tokens?: number; output_tokens?: number }; costUsd?: number; durationMs?: number }
    | { type: "raw"; line: string }
    | { type: "stage_start"; stageId: string; label?: string; iteration?: number }
    | { type: "stage_end"; stageId: string; iteration?: number }
    | { type: "surface_request"; surfaceId: string; surfaceKind: "form" | "choice" | "confirmation" | "oauth-prompt"; payload: unknown }
    | { type: "surface_response"; surfaceId: string; value: unknown; respondedBy: "user" | "agent" | "auto" | "cache" }
    | { type: "a2ui"; message: unknown };

  export type RunProtocolEvent =
    | RunEvent<"start", RunStartPayload>
    | RunEvent<"agent", RunAgentPayload>
    | RunEvent<"stdout", RunChunkPayload>
    | RunEvent<"stderr", RunChunkPayload>
    | RunEvent<"error", RunErrorPayload>
    | RunEvent<"end", RunEndPayload>;
}

declare module "@jini-ai/daemon" {
  import type { Principal, RunRef, ToolDescriptor, ToolRegistry, AuthorizationDecision } from "@jini-ai/core";
  import type { RunCancelRequest, RunStatus } from "@jini-ai/protocol";

  // --- event-log.ts ---
  export interface EventLogEntry<Payload = unknown> {
    readonly id: string;
    readonly event: string;
    readonly data: Payload;
    readonly recordedAt: number;
  }
  export interface EventLogAppendInput<Payload = unknown> {
    readonly runId: string;
    readonly event: string;
    readonly data: Payload;
    readonly dedupeKey?: string;
  }
  export type EventLogReplayResult<Payload = unknown> =
    | { readonly kind: "ok"; readonly entries: readonly EventLogEntry<Payload>[]; readonly truncated?: true }
    | { readonly kind: "replay-gap"; readonly requestedCursor: string; readonly oldestAvailableCursor: string | null }
    | { readonly kind: "invalid-cursor"; readonly requestedCursor: string }
    | { readonly kind: "unknown-run" };
  export interface EventLog {
    append<Payload>(input: EventLogAppendInput<Payload>): Promise<EventLogEntry<Payload>>;
    replay(runId: string, afterCursor: string | null): Promise<EventLogReplayResult>;
    listRunIds(): Promise<readonly string[]>;
    drop(runId: string): Promise<void>;
  }
  export function createInMemoryEventLog(options?: { maxEntriesPerRun?: number }): EventLog;

  // --- run-lifecycle.ts ---
  export interface StartRunInput {
    readonly contextRef: string;
    readonly agentId?: string;
    readonly idempotencyKey?: string;
    readonly runId?: string;
    readonly inactivityTimeoutMs?: number;
  }
  export interface StartRunResult {
    readonly run: RunStatus;
    readonly started: boolean;
  }
  export type DriverEmittableInput =
    | { readonly event: "agent"; readonly data: import("@jini-ai/protocol").RunAgentPayload }
    | { readonly event: "stdout"; readonly data: import("@jini-ai/protocol").RunChunkPayload }
    | { readonly event: "stderr"; readonly data: import("@jini-ai/protocol").RunChunkPayload }
    | { readonly event: "error"; readonly data: import("@jini-ai/protocol").RunErrorPayload };
  export interface FinishRunInput {
    readonly runId: string;
    readonly status: "succeeded" | "failed" | "cancelled";
    readonly code: number | null;
    readonly signal: string | null;
    readonly resumable: boolean;
    readonly sessionRef?: string;
  }
  export type Unsubscribe = () => void;
  export interface RunLifecycle {
    rehydrate(): Promise<void>;
    start(input: StartRunInput): Promise<StartRunResult>;
    get(runId: string): Promise<RunStatus | undefined>;
    list(contextRef?: string): Promise<readonly RunStatus[]>;
    cancel(request: RunCancelRequest): Promise<RunStatus>;
    onCancelRequested(runId: string, listener: (request: RunCancelRequest) => void): Unsubscribe;
    emit(runId: string, input: DriverEmittableInput): Promise<import("@jini-ai/protocol").RunProtocolEvent>;
    finish(input: FinishRunInput): Promise<RunStatus>;
    resume(runId: string): Promise<{ run: RunStatus; resumed: boolean }>;
    waitForTerminal(runId: string): Promise<RunStatus>;
    stream(
      runId: string,
      onEvent: (event: import("@jini-ai/protocol").RunProtocolEvent) => void,
      options?: { afterCursor?: string | null },
    ): Promise<{ readonly kind: "ok"; readonly unsubscribe: Unsubscribe } | { readonly kind: "replay-gap" | "invalid-cursor" | "unknown-run" }>;
  }
  export function createRunLifecycle(input: { eventLog: EventLog; onInternalError?: (context: unknown) => void }): RunLifecycle;

  // --- tool-executor.ts ---
  export type ConfirmationDecision = "confirm" | "deny";
  export interface ToolAuthorizationRequest {
    readonly principal: Principal;
    readonly run: RunRef;
    readonly tool: ToolDescriptor;
    readonly input: unknown;
  }
  export interface ToolConfirmationRequest {
    readonly executionId: string;
    readonly principal: Principal;
    readonly run: RunRef;
    readonly tool: ToolDescriptor;
    readonly input: unknown;
  }
  export interface ExecutionDelegate {
    onAuthorize?(request: ToolAuthorizationRequest): AuthorizationDecision | Promise<AuthorizationDecision>;
    onConfirm?(request: ToolConfirmationRequest): ConfirmationDecision | Promise<ConfirmationDecision> | void;
  }
  export type ToolExecutionStatus = "completed" | "denied" | "confirmation-denied" | "timed-out" | "cancelled" | "failed";
  export interface ToolExecutionResult {
    readonly executionId: string;
    readonly status: ToolExecutionStatus;
    readonly output?: unknown;
    readonly truncated?: boolean;
    readonly error?: string;
  }
  export interface ToolExecutionAuditRecord {
    readonly executionId: string;
    readonly toolId: string;
    readonly principalId: string;
    readonly runId: string;
    readonly events: readonly { readonly phase: string; readonly at: number; readonly detail?: string }[];
  }
  export interface ToolExecutor {
    execute(principal: Principal, run: RunRef, toolId: string, input: unknown, signal?: AbortSignal): Promise<ToolExecutionResult>;
    resumeConfirmation(executionId: string, decision: ConfirmationDecision): void;
    cancel(executionId: string): void;
    getAuditRecord(executionId: string): ToolExecutionAuditRecord | null;
  }
  export function createToolExecutor(options: { registry: ToolRegistry; delegate?: ExecutionDelegate; now?: () => number }): ToolExecutor;

  // --- delegated-tool-bridge.ts ---
  export interface DelegatedToolInvocation {
    readonly runId: string;
    readonly toolUseId: string;
    readonly toolId: string;
    readonly principal: Principal;
    readonly input: unknown;
    readonly signal?: AbortSignal;
  }
  export interface DelegatedToolBridge {
    execute(invocation: DelegatedToolInvocation): Promise<ToolExecutionResult>;
  }
  export function createDelegatedToolBridge(options: { lifecycle: RunLifecycle; toolExecutor: ToolExecutor }): DelegatedToolBridge;

  // --- agent-executor.ts ---
  export type AgentExecutorErrorCode =
    | "AGENT_NOT_FOUND"
    | "AGENT_RUNTIME_UNSUPPORTED"
    | "AGENT_BINARY_NOT_RESOLVED"
    | "AGENT_SPAWN_FAILED"
    | "AGENT_PROMPT_TOO_LARGE";
  export class AgentExecutorError extends Error {
    readonly code: AgentExecutorErrorCode;
    constructor(code: AgentExecutorErrorCode, message: string);
  }
  export interface AgentExecutorRunInput {
    readonly runId: string;
    readonly agentId: string;
    readonly prompt: string;
    readonly cwd: string;
    readonly model?: string;
    readonly reasoning?: string;
    readonly permissionMode?: "bypass" | "restricted";
    readonly imagePaths?: readonly string[];
    readonly extraAllowedDirs?: readonly string[];
    readonly uploadRoot?: string;
    readonly credentialEnv?: Record<string, string>;
    readonly env?: NodeJS.ProcessEnv;
  }
  export interface AgentExecutor {
    run(input: AgentExecutorRunInput): Promise<void>;
  }
  export interface McpJsonInjectionOptions {
    readonly command: string;
    readonly args?: readonly string[];
    readonly daemonUrl: string;
    readonly credential?: (runId: string) => string | Promise<string>;
    readonly readFile?: (path: string) => Promise<string>;
    readonly writeFile?: (path: string, content: string) => Promise<void>;
  }
  export interface ContinuationOptions {
    readonly toolExecutor: ToolExecutor;
    readonly principal: Principal;
    readonly autonomousToolNames: ReadonlySet<string>;
  }
  export interface FailureClassificationContext {
    readonly runId: string;
    readonly agentId: string;
    readonly code: number | null;
    readonly signal: string | null;
    readonly sideEffects: { readonly userVisibleOutputSeen: boolean; readonly toolCallSeen: boolean };
  }
  export type ClassifyFailure = (context: FailureClassificationContext) => boolean | Promise<boolean>;
  export interface CreateAgentExecutorOptions {
    readonly lifecycle: RunLifecycle;
    readonly continuation?: ContinuationOptions;
    readonly classifyFailure?: ClassifyFailure;
    readonly mcpJsonInjection?: McpJsonInjectionOptions;
    readonly onCleanupFailure?: (context: unknown) => void;
  }
  export function createAgentExecutor(options: CreateAgentExecutorOptions): AgentExecutor;
}

declare module "@jini-ai/http-kit" {
  import type { Express, Request } from "express";
  import type { Principal } from "@jini-ai/core";
  import type { RunLifecycle, ToolExecutionResult, ToolExecutor } from "@jini-ai/daemon";
  import type { RunStatus } from "@jini-ai/protocol";

  export interface OriginContext {
    resolvedPortRef: { current: number };
  }
  export interface AdapterContext extends OriginContext {}

  // --- runs.ts ---
  export interface RunCreateRequest {
    readonly contextRef: string;
    readonly agentId?: string;
    readonly idempotencyKey?: string;
  }
  export interface RunStartContext {
    readonly request: RunCreateRequest;
    readonly run: RunStatus;
    readonly lifecycle: RunLifecycle;
  }
  export type RunStartHandler = (context: RunStartContext) => Promise<void> | void;
  export interface RunInternalErrorContext {
    readonly source: "run-start" | "run-stream";
    readonly runId: string;
    readonly correlationId: string;
    readonly error: unknown;
  }
  export interface RunHttpDeps {
    readonly lifecycle: RunLifecycle;
    readonly onStarted?: RunStartHandler;
    readonly onInternalError?: (context: RunInternalErrorContext) => void;
  }
  export function registerRunRoutes(app: Express, deps: RunHttpDeps, adapter: AdapterContext): void;

  // --- agents.ts ---
  export interface AgentModelSummary {
    readonly id: string;
    readonly label: string;
  }
  export interface AgentSummary {
    readonly id: string;
    readonly name: string;
    readonly available?: boolean;
    readonly version?: string | null;
    readonly authStatus?: "ok" | "missing" | "unknown";
    readonly models?: readonly AgentModelSummary[];
    readonly reasoningOptions?: readonly AgentModelSummary[];
    readonly modelsSource?: "live" | "fallback";
    readonly supportsCustomModel?: boolean;
    readonly diagnostic?: string;
  }
  export interface AgentsHttpDeps {
    readonly listAgents: () => Promise<readonly AgentSummary[]> | readonly AgentSummary[];
    readonly rescanAgents?: () => Promise<readonly AgentSummary[]> | readonly AgentSummary[];
  }
  export function registerAgentRoutes(app: Express, deps: AgentsHttpDeps, adapter: AdapterContext): void;

  // --- delegated-tools.ts ---
  export interface DelegatedToolExecuteRequest {
    readonly runId: string;
    readonly toolUseId: string;
    readonly toolId: string;
    readonly input?: unknown;
  }
  export interface DelegatedToolsInternalErrorContext {
    readonly source: "delegated-tool-execute" | "resolve-principal";
    readonly runId: string;
    readonly toolId: string;
    readonly correlationId: string;
    readonly error: unknown;
  }
  export interface DelegatedToolsHttpDeps {
    readonly lifecycle: RunLifecycle;
    readonly toolExecutor: ToolExecutor;
    readonly resolvePrincipal: (request: DelegatedToolExecuteRequest) => Principal | Promise<Principal>;
    readonly onInternalError?: (context: DelegatedToolsInternalErrorContext) => void;
  }
  export function registerDelegatedToolRoutes(app: Express, deps: DelegatedToolsHttpDeps, adapter: AdapterContext): void;

  // --- tool-catalog.ts ---
  export interface ToolCatalogSearchHit {
    readonly id: string;
    readonly description: string;
    readonly source: string;
    readonly score: number;
  }
  export interface ToolCatalogEntry {
    readonly id: string;
    readonly description: string;
    readonly inputSchema?: unknown;
    readonly source: string;
  }
  export interface ToolCatalogQuery {
    readonly search: (query: string, limit?: number) => readonly ToolCatalogSearchHit[];
    readonly describe: (id: string) => ToolCatalogEntry | null;
  }
  export interface ToolCatalogHttpDeps {
    readonly catalog: ToolCatalogQuery;
  }
  export function registerToolCatalogRoutes(app: Express, deps: ToolCatalogHttpDeps, adapter: AdapterContext): void;

  export function guardSameOrigin(req: Request, origin: OriginContext): unknown;
}
