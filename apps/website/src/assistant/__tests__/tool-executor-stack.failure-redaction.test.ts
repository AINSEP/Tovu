import assert from "node:assert/strict";
import { getEffective, InMemorySettingsRepo } from "@jini-ai/core/settings";
import test from "node:test";

import express from "express";

import { createToolRegistry, isReadOnlyTool, type Principal, type RunRef, type SurfaceEmitter, type ToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/daemon/http";
import { ForbiddenError } from "@jini-ai/cms/core";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createInMemoryToolAttemptAuditSink } from "@jini-ai/diagnostics/tool-audit/repo.memory";
import { forbiddenRule, withModelFacingErrors } from "@jini-ai/core/model-facing-tool-errors";
import { RUN_PRINCIPAL_HEADER } from "../daemon-access.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";
import { constrainPrincipalToReadOnlyTools, readOnlyRemedyRefusalMessage, refuseNonReadOnlyDispatch } from "../read-only-tool-constraint.js";
import { createByokToolSurface, type ByokToolSurfaceDeps } from "../byok-tool-surface.js";
import { createAssistantToolExecutor } from "../tool-recovery-preset.js";
import { isRedactedToolFailure, readToolErrorId, TOOL_ERROR_ID_PATTERN } from "../tool-recovery-preset.js";
import { createRecordingReporter } from "@jini-ai/core/errors/testing";
import type { LogDiagnosticRecord } from "@jini-ai/core/primitives";
import { issueToolFailureDiagnostic } from "@jini-ai/daemon/tool-recovery";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { nodeIntervalScheduler } from "#src/platform/express/jini-routes";
import { createReporterRouteInternalError } from "@jini-ai/http-kit";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";


/**
 * @file Drives `createAssistantToolExecutor` — the REAL, production-composed decorator stack — end
 * to end through every surface a failed tool's error reaches, proving `withRedactedToolFailures`
 * (wired in `tool-executor-stack.ts`) actually closes every path `tool-executor-stack.ts`'s own
 * header maps, not just the unit-level contract `tool-failure-redaction.test.ts` already covers.
 */

const WORKSPACE_ID = "ws-failure-redaction";
const RUN: RunRef = { id: "run-failure-redaction" };
const PRINCIPAL: Principal = { id: "principal-failure-redaction" };
const FIXED_ID = "ERR-1111-2222-3333-4444";

const STRIPE_KEY = ["sk", "live", ""].join("_") + "Ab3".repeat(8);
const GHP_TOKEN = "ghp_" + "a1".repeat(18);
const SECRET_TEXT = `upstream call failed: key=${STRIPE_KEY} (Authorization: Bearer ${GHP_TOKEN})`;

/** A real reporter over recording ports — the one host record sink the production stack writes to. */
function recordingReporter() {
  return createRecordingReporter({ ids: Array.from({ length: 8 }, () => FIXED_ID), iso: "2026-01-01T00:00:00.000Z" });
}

/** The ERR- ids the reporter's host log entries were written under, in order. */
function hostRecordIds(entries: readonly LogDiagnosticRecord[]): unknown[] {
  return entries.map((entry) => entry.meta?.["errorId"]);
}

function containsNoSecret(text: string): void {
  assert.equal(text.includes(STRIPE_KEY), false, `leaked the Stripe key: ${text}`);
  assert.equal(text.includes(GHP_TOKEN), false, `leaked the ghp_ token: ${text}`);
}

/** A tool whose handler always throws `SECRET_TEXT` as an internal (non-`ToolInputError`) failure. */
function registerThrowingTool(registry: ToolRegistry, id = "throws_secret"): void {
  registry.register({
    descriptor: { id, inputSchema: { type: "object", properties: {} } },
    policy: { authorize: () => "allow" },
    handler: () => {
      throw new Error(SECRET_TEXT);
    },
  });
}

// ---------------------------------------------------------------------------
// 1. The executor itself.
// ---------------------------------------------------------------------------

test("EXECUTOR: a real handler throw is redacted and ID-tagged by the production composition", async () => {
  const registry = createToolRegistry({});
  registerThrowingTool(registry);
  const { reporter, entries } = recordingReporter();
  const executor = createAssistantToolExecutor({
    registry, reporter,
    surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }),
    toolAttemptAudit: { sink: createInMemoryToolAttemptAuditSink(), workspaceId: WORKSPACE_ID },
    toolFailures: { mintErrorId: () => FIXED_ID },
  }, {});

  const result = await executor.execute({ principal: PRINCIPAL, run: RUN, toolId: "throws_secret", input: {} });

  assert.equal(result.status, "failed");
  assert.match(result.error!, new RegExp(`^Error ${FIXED_ID}: `));
  containsNoSecret(result.error!);
  // One host record, under the very id the model was shown, and no secret in it.
  assert.deepEqual(hostRecordIds(entries), [FIXED_ID]);
  containsNoSecret(JSON.stringify(entries));
});

// ---------------------------------------------------------------------------
// 2. The delegated-tool bridge: the persisted event and the card text (P3, P7-P9), plus http-kit's
//    own server log (P5).
// ---------------------------------------------------------------------------

// The delegated route reuses the tool's stamped ID without writing (J4): the one record is the reporter's
// host record, so the operator correlation moved from the http-kit console line to that record.
test("BRIDGE: the persisted tool_result event, the route reply and the one host record carry the ID with no secret", async (t) => {
  const registry = createToolRegistry({});
  const recording = recordingReporter();
  registerThrowingTool(registry);
  const toolExecutor = createAssistantToolExecutor({
    registry, reporter: recording.reporter,
    surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }),
    toolFailures: { mintErrorId: () => FIXED_ID },
  }, {});
  const eventLog = createInMemoryEventLog({});
  const lifecycle = createRunLifecycle({ eventLog });
  const { run } = await lifecycle.start({ contextRef: "ctx-failure-redaction" });

  const loggedArgs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => void loggedArgs.push(args));

  const result = await delegatedToolExecuteRoute.handle({ input: { runId: run.id, toolUseId: "tu-1", toolId: "throws_secret", input: {} }, deps: { reportInternalError: createReporterRouteInternalError({ reporter: recording.reporter }), lifecycle, toolExecutor, resolvePrincipal: () => PRINCIPAL } }
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "INTERNAL_ERROR");

  const replayed = await eventLog.replay({ runId: run.id, afterCursor: null });
  assert.equal(replayed.kind, "ok");
  const toolResult = replayed.kind === "ok" ? replayed.entries.find((e) => (e.data as { type?: string }).type === "tool_result") : undefined;
  assert.ok(toolResult, "a tool_result event must have been persisted");
  const content = (toolResult!.data as { content: string }).content;
  assert.match(content, new RegExp(`^Error ${FIXED_ID}: `));
  containsNoSecret(content);

  if (!result.ok) assert.equal(result.error.requestId, FIXED_ID, "the reply reuses the stamped ID");
  assert.equal(loggedArgs.length, 0, "no console line: the reporter owns the record");
  assert.equal(recording.entries.length, 1, "exactly one host record");
  assert.equal(recording.entries[0]!.meta?.errorId, FIXED_ID);
  containsNoSecret(JSON.stringify(recording.entries));
});

test("ROUTE: with the daemon's isModelSafeToolFailure wiring, the model gets 'Error <ID>: …' with no secret, not INTERNAL_ERROR", async (t) => {
  const registry = createToolRegistry({});
  registerThrowingTool(registry);
  const recording = recordingReporter();
  const toolExecutor = createAssistantToolExecutor({
    registry, reporter: recording.reporter,
    surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }),
    toolFailures: { mintErrorId: () => FIXED_ID },
  }, {});
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "ctx-model-safe-failure" });
  t.mock.method(console, "error", () => undefined);

  const result = await delegatedToolExecuteRoute.handle({ input: { runId: run.id, toolUseId: "tu-1", toolId: "throws_secret", input: {} }, deps: { reportInternalError: createReporterRouteInternalError({ reporter: recording.reporter }), lifecycle, toolExecutor, resolvePrincipal: () => PRINCIPAL, isModelSafeToolFailure: ({ result }) => isRedactedToolFailure({ result: result }, {}) } }
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "TOOL_EXECUTION_FAILED");
  assert.match(result.error.message, new RegExp(`^Error ${FIXED_ID}: upstream call failed`));
  containsNoSecret(result.error.message);
  // The tool's stamped id is reused: the route wrote no second record for the one failure.
  assert.deepEqual(hostRecordIds(recording.entries), [FIXED_ID]);
});

test("ROUTE: a failure with no minted ID stays the redacted INTERNAL_ERROR even with the wiring", async () => {
  const registry = createToolRegistry({});
  registerThrowingTool(registry);
  // The BARE executor — no redaction layer, so no ERR id — standing in for any path that skipped it.
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "ctx-unredacted-failure" });

  const incidents = createRouteIncidentReporter();

  const result = await delegatedToolExecuteRoute.handle({ input: { runId: run.id, toolUseId: "tu-1", toolId: "throws_secret", input: {} }, deps: { reportInternalError: incidents.reportInternalError,
      lifecycle,
      toolExecutor,
      resolvePrincipal: () => PRINCIPAL,
      isModelSafeToolFailure: ({ result }) => isRedactedToolFailure({ result: result }, {}),
    } }
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "INTERNAL_ERROR");
  containsNoSecret(JSON.stringify(result));
  // The route's one incident: exactly one host record, under the id the model was shown, with no secret in it.
  assert.match(result.error.requestId ?? "", /^ERR-[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
  assert.equal(incidents.entries.length, 1, "exactly one host record");
  assert.deepEqual(hostRecordIds(incidents.entries), [result.error.requestId]);
  containsNoSecret(JSON.stringify(incidents.entries));
  // The tracker report is handed the raw error by contract (its adapter redacts on export), so it is matched by id, not scanned for secrets.
  assert.deepEqual(incidents.reports.map((report) => report.context.incidentId), [result.error.requestId]);
});

// ---------------------------------------------------------------------------
// 4. The durable audit row links to the SAME id, never the redacted text — commit 3.
// ---------------------------------------------------------------------------

test("AUDIT LINK: the failed attempt row's detail is exactly errorId=<ID>, never the message", async () => {
  const registry = createToolRegistry({});
  registerThrowingTool(registry);
  const sink = createInMemoryToolAttemptAuditSink();
  const executor = createAssistantToolExecutor({
    registry, reporter: recordingReporter().reporter,
    surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }),
    toolAttemptAudit: { sink, workspaceId: WORKSPACE_ID },
    toolFailures: { mintErrorId: () => FIXED_ID },
  }, {});

  await executor.execute({ principal: PRINCIPAL, run: RUN, toolId: "throws_secret", input: {} });

  const failedEvent = sink.events.find((e) => e.phase === "failed");
  assert.ok(failedEvent, "a failed attempt row must have been appended");
  assert.equal(failedEvent!.detail, `errorId=${FIXED_ID}`);
  containsNoSecret(String(failedEvent!.detail));
});

// ---------------------------------------------------------------------------
// 3. The MCP-UI redemption route (P6) — the legacy, no-exchangeId shape.
// ---------------------------------------------------------------------------

test("MCP-UI ROUTE: a redeemable tool's internal failure is redacted and ID-tagged in the 400 body", async (t) => {
  const registry = createToolRegistry({});
  // Any id `isMcpUiToolCallPermitted` admits WITHOUT an exchange will do. `content_post_delete` was
  // this test's id until 6eac86229 ("confirm destructive and protected actions only") took it off
  // the allowlist (moving to Trash no longer opens a dialog), after which the route refuses it with
  // 403 before the executor runs. Permanent-delete ids are no substitute: they may only answer a
  // parked exchange, never run through this legacy shape. `content_post_search` is a Shape 2 id.
  registerThrowingTool(registry, "content_post_search");
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const toolExecutor = createAssistantToolExecutor({ registry, reporter: recordingReporter().reporter, surfaceExchanges, toolFailures: { mintErrorId: () => FIXED_ID } }, {});

  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute({ app, errors: createRouteIncidentReporter().errors, deps: { scheduler: nodeIntervalScheduler, toolExecutor, surfaceExchanges } });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: "principal-1" },
    body: JSON.stringify({ toolName: "content_post_search", params: { id: "post-1", kind: "post" } }),
  });

  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "TOOL_CALL_FAILED");
  assert.match(body.error, new RegExp(`^Error ${FIXED_ID}: `));
  containsNoSecret(body.error);
});

// ---------------------------------------------------------------------------
// 5. Allowlisted validation errors pass through with secrets blanked, no ID minted.
// ---------------------------------------------------------------------------

test("ALLOWLIST: a reclassified ForbiddenError is redacted but keeps its exact code prefix, with no ID and no record", async () => {
  const registry = createToolRegistry({});
  const wrapped = withModelFacingErrors({
    handlers: { forbidden_tool: async () => { throw new ForbiddenError({ message: `no grant: ${STRIPE_KEY}`, permission: "x.manage", reason: "no_grant" }); } },
    rules: [forbiddenRule({ domainPrefix: "X", error: ForbiddenError })],
  });
  registry.register({
    descriptor: { id: "forbidden_tool", inputSchema: { type: "object", properties: {} } },
    policy: { authorize: () => "allow" },
    handler: wrapped.forbidden_tool,
  });
  const { reporter, entries } = recordingReporter();
  const executor = createAssistantToolExecutor({
    registry, reporter,
    surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }),
    toolFailures: { mintErrorId: () => FIXED_ID },
  }, {});

  const result = await executor.execute({ principal: PRINCIPAL, run: RUN, toolId: "forbidden_tool", input: {} });

  assert.equal(result.status, "failed");
  assert.equal(result.errorKind, "validation");
  assert.match(result.error!, /^X_FORBIDDEN: no grant: /);
  containsNoSecret(result.error!);
  assert.equal(readToolErrorId({ result: result }, {}), undefined);
  assert.equal(entries.length, 0);
});

// ---------------------------------------------------------------------------
// 6. The read-only recovery-remedy refusal message is untouched — it is set on a `completed` result,
//    outside this layer entirely.
// ---------------------------------------------------------------------------

test("READ-ONLY: the recovery remedy-refusal message on a completed result is byte-for-byte unchanged", async () => {
  const registry = createToolRegistry({});
  let reads = 0;
  let writes = 0;
  registry.register({
    descriptor: { id: "ro_probe_read", readOnly: true, inputSchema: { type: "object", properties: {} } },
    policy: { authorize: () => "allow" },
    handler: async () => {
      reads += 1;
      return issueToolFailureDiagnostic({ diagnostic: { hint: "needs a write", remedyToolId: "ro_probe_write" } }, {});
    },
  });
  registry.register({
    descriptor: { id: "ro_probe_write", inputSchema: { type: "object", properties: {} } },
    policy: { authorize: () => "allow" },
    handler: async () => { writes += 1; return { saved: true }; },
  });
  assert.equal(isReadOnlyTool({ descriptor: registry.list({}).find((d) => d.id === "ro_probe_write") }), false, "PREMISE: the remedy must not itself be read-only");

  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const executor = createAssistantToolExecutor({
    registry, reporter: recordingReporter().reporter,
    surfaceExchanges,
    toolAttemptAudit: { sink: createInMemoryToolAttemptAuditSink(), workspaceId: WORKSPACE_ID },
  }, {});
  const readOnlyPrincipal = constrainPrincipalToReadOnlyTools(PRINCIPAL);
  const emitted: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (s) => void emitted.push(s);

  const result = await executor.execute({ principal: readOnlyPrincipal, run: RUN, toolId: "ro_probe_read", input: {} }, { emitSurface: emitSurface });

  const refusal = refuseNonReadOnlyDispatch({ principal: readOnlyPrincipal, toolId: "ro_probe_write", registry });
  assert.ok(refusal, "PREMISE: the remedy must actually be refused for a read-only principal");
  assert.equal(result.status, "completed", "the original read still completed — only the remedy is refused");
  assert.equal(result.error, readOnlyRemedyRefusalMessage({ refusal: refusal }), "the refusal message must be the exact, untouched text — never redacted");
  assert.equal(result.error,
    'this call failed and its automatic recovery was NOT attempted: tool "ro_probe_write" is not registered as read-only — this execution was started through a read-only gateway and may run only tools whose registration declares readOnly; call it through execute_delegated_tool instead. The failure reported alongside this message is unchanged — nothing was written. Retry through execute_delegated_tool if the write is intended.',
  );
  assert.equal(readToolErrorId({ result: result }, {}), undefined);
  assert.equal(reads, 1, "the original read must not be retried");
  assert.equal(writes, 0, "the remedy must never have run");
  assert.equal(emitted.length, 0, "no human should be asked to fill in a form whose answer would be refused");
  assert.equal(surfaceExchanges.size(), 0, "no recovery form exchange should have been opened");
});

// ---------------------------------------------------------------------------
// 7. BYOK's own meta-tool dispatch, through the PRODUCTION default minter/sink (no test seam).
// ---------------------------------------------------------------------------

function fakeByokRouteDeps(): ByokToolSurfaceDeps {
  const deps = {
    workspaceId: WORKSPACE_ID,
    settingsRepo: new InMemorySettingsRepo(),
    settingsUiTabsReady: Promise.resolve(),
    getEffective,
    clock: { nowMs() { return Date.parse(this.nowIso()); }, nowIso: () => "2026-09-16T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    authorize: async () => ({ allowed: true, reason: "matched" }),
    contentTypeRepo: {
      save: async () => {},
      appendRevision: async () => {},
      findByKey: async () => null,
      listByWorkspace: async () => [],
      transaction: async <T>(fn: () => Promise<T>) => fn(),
    },
    contentTypeIndexProvisioner: {
      provisionIndexesForNewContentType: async () => {},
      applyFieldIndexTransitions: async () => {},
      tearDownAllIndexesForContentType: async () => {},
    },
    outbox: { enqueue: async () => {} },
  };
  return deps as unknown as ByokToolSurfaceDeps;
}

test("BYOK: execute_delegated_tool's error carries the SAME ID as the reporter's host record, with no secret in either", async () => {
  const { reporter, entries } = recordingReporter();
  const s = createByokToolSurface({ ...fakeByokRouteDeps(), reporter });
  registerThrowingTool(s.registry as unknown as ToolRegistry, "throws_secret_byok");

  const result = await s.executeMetaTool({ principal: PRINCIPAL, run: RUN, call: { name: "execute_delegated_tool", input: { toolId: "throws_secret_byok", input: {} } } });

  assert.equal(result.isError, true);
  assert.ok(typeof result.content === "string", "execute_delegated_tool's error reply is plain text");
  const idMatch = result.content.match(TOOL_ERROR_ID_PATTERN);
  assert.ok(idMatch, `expected an ERR-… id in: ${result.content}`);
  containsNoSecret(result.content);

  // The composition's reporter, not a global console sink, holds the host record under that id.
  assert.ok(hostRecordIds(entries).includes(idMatch![0]), "the host record's id must match the one returned to the model");
  containsNoSecret(JSON.stringify(entries));
});
