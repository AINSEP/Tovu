/** Tovu's anonymous execution adapter. No admin registry, catalog, invoker or plugin port exists. */
import { createToolRegistry } from "@jini-ai/core";
import { createToolExecutor, type ToolExecutionResult } from "@jini-ai/daemon";
import { withToolAttemptAudit, type ToolAttemptAuditSink } from "@jini-ai/daemon/tool-audit";
import { EMPTY_VISITOR_TOOL_POLICY, resolveVisitorToolChoice, VISITOR_TOOL_CALLS_PER_TURN, type VisitorToolPolicy } from "../../contracts/site-assistant/visitor-tools.js";
import type { ClientDirective } from "./client-directives.js";
import type { VisitorToolBudgets } from "./visitor-tool-budgets.js";
import type { VisitorToolPresentation } from "../../contracts/site-assistant/visitor-tools-management.js";
import type { VisitorConfirmations, ToolConfirmationDirective } from "./visitor-confirmations.js";
import { createVisitorConfirmationGate, VisitorPlanRefused } from "./visitor-confirmation-gate.js";

export interface VisitorCapabilityContract extends VisitorToolPresentation {
  readonly name: string;
  /** A site grant never adds eligibility: the reviewed contract must explicitly opt in. */
  readonly visitorOfferable: true;
  readonly execute: (required: { input: unknown }, optional?: Record<string, never>) => Promise<{ readonly result: unknown; readonly directive?: ClientDirective }>;
}
export interface VisitorExecutionPorts {
  readonly initialPolicy: VisitorToolPolicy | null;
  /** Re-read at each invocation, including Off changes during a running model turn. */
  readonly readPolicy: () => Promise<VisitorToolPolicy | null>;
  /** Value-row revision from the settings owner; required to execute Ask, optional for legacy Auto. */
  readonly readSnapshot?: () => Promise<{ policy: VisitorToolPolicy | null; revision: string }>;
  readonly confirmation?: VisitorConfirmations & { readonly emit: (directive: ToolConfirmationDirective) => void };
  readonly budgets: VisitorToolBudgets;
  readonly ip: string;
  readonly workspaceId: string;
  readonly runId: string;
  readonly clock: { nowMs(): number; nowIso(): string };
  readonly ids: { newId(): string };
  readonly sink: ToolAttemptAuditSink;
  readonly reportError: (error: unknown) => void;
  readonly signal?: AbortSignal;
}

export const VISITOR_TOOL_REFUSAL = "This tool is unavailable.";

export type VisitorToolOutcome =
  | { readonly kind: "ok"; readonly result: unknown; readonly directive?: ClientDirective }
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "error"; readonly error: unknown };
export interface VisitorExecutor {
  availableToolNames(required: Record<string, never>, optional?: Record<string, never>): Promise<readonly string[]>;
  isAdvertised(required: { toolId: string }, optional?: Record<string, never>): boolean;
  invoke(required: { name: string; input: unknown; caller: string }, optional?: Record<string, never>): Promise<VisitorToolOutcome>;
}

/** Create a request-lifetime executor over reviewed CMS handlers only. Registration is private.
 * Rollback omits policy ports and retains the literal capability surface. The attempt increment
 * and check are synchronous, so parallel calls cannot exceed four even after the audit append.
 * @complexity O(t) registration, O(1) gate plus the CMS handler and two limiter checks per call.
 * @example createVisitorExecutor({ capabilities }, { ports });
 */
export function createVisitorExecutor({ capabilities }: { capabilities: readonly VisitorCapabilityContract[] }, { ports }: { ports?: VisitorExecutionPorts } = {}): VisitorExecutor {
  const registry = createToolRegistry({});
  const confirmation = ports ? createVisitorConfirmationGate({ ports, resume: args => executor.resumeConfirmation(args) }) : undefined;
  registerCapabilities({ capabilities, registry, ports, confirmation });
  const executor = createToolExecutor({ registry }, { now: ports?.clock.nowMs.bind(ports.clock), delegate: confirmation?.delegate });
  const runId = ports?.runId ?? "visitor-turn";
  const signal = ports?.signal;
  let attempts = 0;

  /** Pre-gate unknown names without executor hints. Audit still observes the refused attempt. */
  const gated = { ...executor, execute: async (args: Parameters<typeof executor.execute>[0], options: Parameters<typeof executor.execute>[1] = {}): Promise<ToolExecutionResult> => {
    attempts++;
    if (!registry.has({ toolId: args.toolId }) || (ports && attempts > VISITOR_TOOL_CALLS_PER_TURN)) {
      return { executionId: ports?.ids.newId() ?? "refused", status: "denied" };
    }
    return executor.execute(args, options);
  } };
  const audited = ports ? withToolAttemptAudit({
    inner: gated, workspaceId: ports.workspaceId, now: ports.clock.nowIso.bind(ports.clock), newAttemptId: ports.ids.newId.bind(ports.ids),
    // MOVE: Arbitrary input keys and unknown tool ids can themselves contain secrets. Retain only
    // reviewed ids and fixed provenance; neither query values nor provider errors enter this sink.
    sink: { append: (event) => ports.sink.append(event, { detail: '{"audience":"visitor","source":"builtin"}' }) },
    readErrorId: () => undefined,
  }, { onSinkError: ports.reportError }) : gated;

  return {
    /** The guide uses a fresh grant snapshot, so its prose never advertises a disabled tool. */
    async availableToolNames(_required: Record<string, never>, _options = {}): Promise<readonly string[]> {
      const policy = ports ? await ports.readPolicy() : EMPTY_VISITOR_TOOL_POLICY;
      if (!policy) return [];
      return registry.list({}).filter(tool => visitorModeAdvertised({ policy, toolId: tool.id, ports })).map(tool => tool.id);
    },
    /** Eligibility and the upgrade grant are independent. Used for model advertisement too. */
    isAdvertised({ toolId }: { toolId: string }, _options = {}): boolean {
      const policy = ports ? ports.initialPolicy : EMPTY_VISITOR_TOOL_POLICY;
      return registry.has({ toolId }) && policy !== null && visitorModeAdvertised({ policy, toolId, ports });
    },
    /** Normalize all gate failures to the same safe status; the route owns error presentation. */
    async invoke({ name, input, caller }: { name: string; input: unknown; caller: string }, _options = {}) {
      try {
        const toolId = caller === "anonymous-visitor" && registry.has({ toolId: name }) ? name : "unavailable";
        const outcome = await audited.execute({ principal: { id: "anonymous-visitor" }, run: { id: runId }, toolId,
          input: structuredClone(input) }, { signal });
        confirmation?.forget({ executionId: outcome.executionId });
        // Caller classes are transport-owned. A forged class never reaches a public handler.
        if (isVisitorRefusal({ outcome })) return { kind: "refused" as const, reason: VISITOR_TOOL_REFUSAL };
        if (outcome.status !== "completed") return { kind: "error" as const, error: outcome.error ?? outcome.status };
        const output = outcome.output as { result: unknown; directive?: ClientDirective };
        return { kind: "ok" as const, result: output.result, directive: output.directive };
      } catch (error) {
        ports?.reportError(error);
        return { kind: "refused" as const, reason: VISITOR_TOOL_REFUSAL };
      }
    },
  };
}

/** Install only reviewed contracts; the policy/handler closures retain their existing owners.
 * @complexity O(t) registrations for the fixed visitor catalog.
 */
function registerCapabilities({ capabilities, registry, ports, confirmation }: {
  capabilities: readonly VisitorCapabilityContract[]; registry: ReturnType<typeof createToolRegistry>;
  ports?: VisitorExecutionPorts; confirmation?: ReturnType<typeof createVisitorConfirmationGate>;
}, _options = {}): void {
  for (const capability of capabilities) {
    if (capability.visitorOfferable !== true) continue;
    const ask = ports?.initialPolicy != null && resolveVisitorToolChoice({ policy: ports.initialPolicy, toolId: capability.name }).mode === "ask";
    registry.register({
      descriptor: { id: capability.name, readOnly: true, timeoutMs: 10_000, requiresConfirmation: ask },
      policy: { authorize: async () => {
        if (!ports) return "allow";
        try {
          const policy = await ports.readPolicy();
          if (!policy) return "deny";
          const choice = resolveVisitorToolChoice({ policy, toolId: capability.name });
          if (!visitorModeAllowed({ mode: choice.mode, ask, hasChannel: Boolean(ports.confirmation && ports.readSnapshot) })) return "deny";
          return await ports.budgets.charge({ workspaceId: ports.workspaceId, toolId: capability.name, ip: ports.ip, limits: choice.limits }) ? "allow" : "deny";
        } catch (error) {
          ports.reportError(error);
          return "deny";
        }
      } },
      handler: async ({ input, signal, executionId }) => {
        try {
          if (ask) await confirmation!.assertApproved({ executionId, input });
          return await capability.execute({ input });
        } catch (error) {
          // Jini returns a message string. Preserve the original stack server-side, while a
          // disconnected caller's aborted work needs no operational error report.
          if (!signal.aborted && !(error instanceof VisitorPlanRefused)) ports?.reportError(error);
          throw error;
        }
      },
    });
  }
}

/** An Auto snapshot cannot silently acquire Ask permission mid-turn; a fresh turn advertises it. */
function visitorModeAllowed({ mode, ask, hasChannel }: { mode: string; ask: boolean; hasChannel: boolean }, _options = {}): boolean {
  if (mode === "off") return false;
  if (ask) return mode === "ask" && hasChannel;
  return mode === "auto";
}

/** Without a human return path Ask keeps the fail-closed rollback behaviour. */
function visitorModeAdvertised({ policy, toolId, ports }: { policy: VisitorToolPolicy; toolId: string; ports?: VisitorExecutionPorts }, _options = {}): boolean {
  const mode = resolveVisitorToolChoice({ policy, toolId }).mode;
  return mode === "auto" || (mode === "ask" && Boolean(ports?.confirmation && ports.readSnapshot));
}

/** Decline, expiry and revoked plans share the same non-disclosing visitor result. */
function isVisitorRefusal({ outcome }: { outcome: ToolExecutionResult }, _options = {}): boolean {
  return ["denied", "cancelled", "confirmation-denied"].includes(outcome.status) || outcome.error === VISITOR_TOOL_REFUSAL;
}
