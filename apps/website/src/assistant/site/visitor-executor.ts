/** Tovu's anonymous execution adapter. No admin registry, catalog, invoker or plugin port exists. */
import { createToolRegistry } from "@jini-ai/core";
import { createToolExecutor, type ToolExecutionResult } from "@jini-ai/daemon";
import { withToolAttemptAudit, type ToolAttemptAuditSink } from "@jini-ai/daemon/tool-audit";
import { EMPTY_VISITOR_TOOL_POLICY, resolveVisitorToolChoice, VISITOR_TOOL_CALLS_PER_TURN, type VisitorToolPolicy } from "../../contracts/site-assistant/visitor-tools.js";
import type { ClientDirective } from "./client-directives.js";
import type { VisitorToolBudgets } from "./visitor-tool-budgets.js";
import type { VisitorToolPresentation } from "../../contracts/site-assistant/visitor-tools-management.js";

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
  for (const capability of capabilities) {
    if (capability.visitorOfferable !== true) continue;
    registry.register({
      descriptor: { id: capability.name, readOnly: true, timeoutMs: 10_000 },
      policy: { authorize: async () => {
        if (!ports) return "allow";
        try {
          const policy = await ports.readPolicy();
          if (!policy) return "deny";
          const choice = resolveVisitorToolChoice({ policy, toolId: capability.name });
          if (choice.mode !== "auto") return "deny";
          return await ports.budgets.charge({ workspaceId: ports.workspaceId, toolId: capability.name, ip: ports.ip, limits: choice.limits }) ? "allow" : "deny";
        } catch (error) {
          ports.reportError(error);
          return "deny";
        }
      } },
      handler: async ({ input, signal }) => {
        try {
          return await capability.execute({ input });
        } catch (error) {
          // Jini returns a message string. Preserve the original stack server-side, while a
          // disconnected caller's aborted work needs no operational error report.
          if (!signal.aborted) ports?.reportError(error);
          throw error;
        }
      },
    });
  }
  const executor = createToolExecutor({ registry }, { now: ports?.clock.nowMs.bind(ports.clock) });
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
      return registry.list({}).filter(tool => resolveVisitorToolChoice({ policy, toolId: tool.id }).mode === "auto").map(tool => tool.id);
    },
    /** Eligibility and the upgrade grant are independent. Used for model advertisement too. */
    isAdvertised({ toolId }: { toolId: string }, _options = {}): boolean {
      const policy = ports ? ports.initialPolicy : EMPTY_VISITOR_TOOL_POLICY;
      return registry.has({ toolId }) && policy !== null && resolveVisitorToolChoice({ policy, toolId }).mode === "auto";
    },
    /** Normalize all gate failures to the same safe status; the route owns error presentation. */
    async invoke({ name, input, caller }: { name: string; input: unknown; caller: string }, _options = {}) {
      try {
        const toolId = caller === "anonymous-visitor" && registry.has({ toolId: name }) ? name : "unavailable";
        const outcome = await audited.execute({ principal: { id: "anonymous-visitor" }, run: { id: runId }, toolId,
          input }, { signal });
        // Caller classes are transport-owned. A forged class never reaches a public handler.
        if (outcome.status === "denied" || outcome.status === "cancelled") return { kind: "refused" as const, reason: VISITOR_TOOL_REFUSAL };
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
