import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry, type Principal } from "@jini-ai/core";
import { createFixedClock, createRecordingLogger } from "@jini-ai/core/errors/testing";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/daemon/http";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createInMemoryToolAttemptAuditSink } from "@jini-ai/diagnostics/tool-audit/repo.memory";
import { reportRouteInternalError } from "@jini-ai/http-kit";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";

import { delegatedToolErrorDisclosure, TOOL_ERROR_ID_PATTERN } from "#src/assistant/tool-recovery-preset";
import { createTovuErrorReporter } from "#src/server/runtime/composition/error-reporter";
import { createScopeToolExecutor } from "../agent-daemon-scope-tools.js";

/**
 * @file P4-T3: one authorized site scope owns ONE reporter, and both its tool executor and its
 * delegated-route disclosure use it. The proof is the id: the `Error <ID>:` a model reads must be the
 * id of the host log line (and, with tracking on, of the tracker report) for the same failure. A
 * second reporter anywhere in `createScopeToolExecutor` would log through a different logger, so the
 * recording logger here would hold no line for the model's id and the equality below goes red.
 */

const PRINCIPAL: Principal = { id: "principal-scope" };
const TOOL_ID = "page_throws";

type ScopeSiteTools = Parameters<typeof createScopeToolExecutor>[0]["siteTools"];

/** A scope reporter over recording ports; `tracking: false` stands in for a site with no tracker sink. */
function scopeReporter({ tracking }: { tracking: boolean }) {
  const { logger, entries } = createRecordingLogger();
  const reports: unknown[] = [];
  const tracker = { error: tracking ? (_required: unknown, optional?: { context?: unknown }) => void reports.push(optional?.context) : () => {} };
  const reporter = createTovuErrorReporter({ logger, tracker: tracker as never, clock: createFixedClock({ iso: "2026-01-01T00:00:00.000Z" }), versions: { app: "0.0.0-test", jini: "0.0.0-test" } });
  return { reporter, entries, reports };
}

/** The scope's executor over one local tool that throws, plus the delegated route wired as the scope wires it. */
async function scopeCall({ tracking }: { tracking: boolean }) {
  const ports = scopeReporter({ tracking });
  const registry = createToolRegistry({});
  registry.register({ descriptor: { id: TOOL_ID }, policy: { authorize: () => "allow" }, handler: () => { throw new Error("frontend bridge went away"); } });
  const siteRegistry = createToolRegistry({});
  const siteTools = { remote: createToolExecutor({ registry: siteRegistry }), registry: siteRegistry } as unknown as ScopeSiteTools;
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const toolExecutor = createScopeToolExecutor({ routeDeps: { toolAttemptAuditSink: createInMemoryToolAttemptAuditSink(), workspaceId: "ws-scope" },
    registry, surfaceExchanges, siteTools, idlePark: { hold: () => () => {} }, reporter: ports.reporter });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "ctx-scope-reporter" });
  const result = await delegatedToolExecuteRoute.handle({ input: { runId: run.id, toolUseId: "tu-1", toolId: TOOL_ID, input: {} }, deps: {
    lifecycle, toolExecutor, resolvePrincipal: () => PRINCIPAL, reportInternalError: reportRouteInternalError,
    ...delegatedToolErrorDisclosure({ reporter: ports.reporter }, {}),
  } }, {});
  return { ...ports, result };
}

for (const tracking of [true, false]) {
  test(`a failed site tool shows the same ERR- id to the model and in the host log (tracking ${tracking ? "on" : "off"})`, async () => {
    const { result, entries, reports } = await scopeCall({ tracking });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "TOOL_EXECUTION_FAILED");
    const modelId = result.error.message.match(TOOL_ERROR_ID_PATTERN)?.[0];
    assert.ok(modelId, `the model must get an ERR- id, got: ${result.error.message}`);

    const hostIds = entries.filter((entry) => entry.level === "error").map((entry) => entry.meta?.["errorId"]);
    assert.deepEqual(hostIds, [modelId], "exactly one host record, under the id the model was shown");
    if (tracking) assert.deepEqual(reports.map((context) => (context as { attributes?: { incidentId?: string } }).attributes?.incidentId), [modelId]);
    else assert.deepEqual(reports, []);
  });
}
