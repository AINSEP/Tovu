import { ToolInputError, createToolRegistry, type Principal } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/daemon/http";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/core/primitives";
import { createNoopObservabilityPort, type ObservabilityPort, type OperationAttributes } from "#src/platform/observability/index";
import { createAssistantToolExecutor, delegatedToolErrorDisclosure, withToolCallObservability } from "../../tool-recovery-preset.js";

/**
 * @file One scripted assistant tool-call scenario, driven through the REAL delegated-tool route and
 * the REAL Tovu executor stack, against whatever `ObservabilityPort` a test injects. The same
 * scenario runs against the fake, OpenTelemetry and Sentry adapters, which is what proves they are
 * swappable: same feature code, same calls, equivalent observations.
 */

export const SCENARIO_SECRET = ["sk", "live", ""].join("_") + "Ab3".repeat(8);
const PRINCIPAL: Principal = { id: "principal-observability" };

/** Four calls: a success, a model input mistake, a handler crash carrying a secret, an unknown tool. */
export const SCENARIO_CALLS = ["pages_list", "theme_set", "deploy_run", "no_such_tool"] as const;

/** Runs every scenario call in order and returns the HTTP-facing result kinds the route produced. */
export async function runToolCallScenario({ observability }: { observability: ObservabilityPort }): Promise<string[]> {
  const registry = createToolRegistry({});
  const allow = { authorize: () => "allow" as const };
  registry.register({ descriptor: { id: "pages_list" }, policy: allow, handler: async () => ({ pages: 3 }) });
  registry.register({ descriptor: { id: "theme_set" }, policy: allow, handler: () => { throw new ToolInputError({ message: "themeId is required" }); } });
  registry.register({ descriptor: { id: "deploy_run" }, policy: allow, handler: () => { throw new Error(`deploy failed: key=${SCENARIO_SECRET}`); } });
  const toolFailures = { mintErrorId: () => "ERR-AAAA-1111-BBBB-2222", onFailure: () => undefined };
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const toolExecutor = withToolCallObservability({ inner: createAssistantToolExecutor({ registry, surfaceExchanges, toolFailures }, {}), observability }, {});
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "ctx-observability" });
  const kinds: string[] = [];
  for (const [index, toolId] of SCENARIO_CALLS.entries()) {
    const response = await delegatedToolExecuteRoute.handle({ input: { runId: run.id, toolUseId: `tu-${index}`, toolId, input: {} }, deps: {
      lifecycle, toolExecutor, resolvePrincipal: () => PRINCIPAL, onInternalError: () => undefined, ...delegatedToolErrorDisclosure({}, toolFailures),
    } }, {});
    kinds.push(response.ok ? "ok" : response.error.code);
  }
  return kinds;
}

/** What every adapter must agree on, per operation, once vendor detail is stripped. */
export interface NormalizedOperation {
  name: string; toolId: string; outcome: string; failed: boolean; errorKind?: string;
  /** Error types reported inside this operation, in order. */
  reported: string[];
}

interface FakeOperation { name: string; attributes: OperationAttributes; end?: { outcome: string; failed: boolean; attributes?: OperationAttributes }; errors: unknown[]; }

/** A recording port: operations with their start attributes, settled outcome and in-scope error reports. */
export function createRecordingObservabilityPort(): { port: ObservabilityPort; operations: FakeOperation[]; normalized(): NormalizedOperation[] } {
  const operations: FakeOperation[] = [];
  let active: FakeOperation | undefined;
  // A fresh object, so isNoopObservabilityPort() is false and the decorator really wraps.
  const port: ObservabilityPort = { ...createNoopObservabilityPort({}),
    trackOperation: ({ name, attributes = {} }) => {
      const op: FakeOperation = { name, attributes, errors: [] };
      operations.push(op);
      return { run: (fn) => { const prev = active; active = op; try { return fn(); } finally { active = prev; } }, end: (outcome) => { op.end ??= outcome; } };
    },
    reportError: ({ error }) => { active?.errors.push(error); },
  };
  const normalized = () => operations.map((op) => ({
    name: op.name, toolId: String(op.attributes["tool.id"]), outcome: op.end?.outcome ?? "open", failed: op.end?.failed ?? false,
    ...(op.end?.attributes?.["tool.error_kind"] ? { errorKind: String(op.end.attributes["tool.error_kind"]) } : {}),
    reported: op.errors.map((error) => (error instanceof Error ? error.name : typeof error)),
  }));
  return { port, operations, normalized };
}

/** The observation every adapter must reproduce for {@link SCENARIO_CALLS}. */
export const EXPECTED_OPERATIONS: NormalizedOperation[] = [
  { name: "tool.call", toolId: "pages_list", outcome: "completed", failed: false, reported: [] },
  { name: "tool.call", toolId: "theme_set", outcome: "failed", failed: true, errorKind: "validation", reported: [] },
  { name: "tool.call", toolId: "deploy_run", outcome: "failed", failed: true, errorKind: "internal", reported: ["ToolExecutionFailure"] },
  { name: "tool.call", toolId: "no_such_tool", outcome: "threw", failed: true, errorKind: "validation", reported: [] },
];
