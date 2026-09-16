import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createToolRegistry, isReadOnlyTool, type Principal, type RunRef, type SurfaceEmitter, type ToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/http-kit";
import { ForbiddenError } from "@jini-ai/cms/core";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";
import { createInMemoryToolAttemptAuditSink } from "../../features/tool-audit/repo.memory.js";
import { forbiddenRule, withModelFacingErrors } from "../../contracts/core/model-facing-tool-errors.js";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";
import { constrainPrincipalToReadOnlyTools, readOnlyRemedyRefusalMessage, refuseNonReadOnlyDispatch } from "../read-only-tool-constraint.js";
import { createByokToolSurface, type ByokToolSurfaceDeps } from "../byok-tool-surface.js";
import { createAssistantToolExecutor } from "../tool-executor-stack.js";
import { readToolErrorId, TOOL_ERROR_ID_PATTERN, type ToolFailureRecord } from "../tool-failure-redaction.js";

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
  const registry = createToolRegistry();
  registerThrowingTool(registry);
  const records: ToolFailureRecord[] = [];
  const executor = createAssistantToolExecutor({
    registry,
    surfaceExchanges: createSurfaceExchangeStore(),
    toolAttemptAudit: { sink: createInMemoryToolAttemptAuditSink(), workspaceId: WORKSPACE_ID },
    toolFailures: { mintErrorId: () => FIXED_ID, onFailure: (r) => records.push(r) },
  });

  const result = await executor.execute(PRINCIPAL, RUN, "throws_secret", {});

  assert.equal(result.status, "failed");
  assert.match(result.error!, new RegExp(`^Error ${FIXED_ID}: `));
  containsNoSecret(result.error!);
  assert.equal(records.length, 1);
  assert.equal(records[0].errorId, FIXED_ID);
});

// ---------------------------------------------------------------------------
// 2. The delegated-tool bridge: the persisted event and the card text (P3, P7-P9), plus http-kit's
//    own server log (P5).
// ---------------------------------------------------------------------------

test("BRIDGE: the persisted tool_result event and http-kit's internal-error log both carry the ID with no secret", async (t) => {
  const registry = createToolRegistry();
  registerThrowingTool(registry);
  const toolExecutor = createAssistantToolExecutor({
    registry,
    surfaceExchanges: createSurfaceExchangeStore(),
    toolFailures: { mintErrorId: () => FIXED_ID },
  });
  const eventLog = createInMemoryEventLog();
  const lifecycle = createRunLifecycle({ eventLog });
  const { run } = await lifecycle.start({ contextRef: "ctx-failure-redaction" });

  const loggedArgs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => void loggedArgs.push(args));

  const result = await delegatedToolExecuteRoute.handle(
    { runId: run.id, toolUseId: "tu-1", toolId: "throws_secret", input: {} },
    { lifecycle, toolExecutor, resolvePrincipal: () => PRINCIPAL },
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "INTERNAL_ERROR");

  const replayed = await eventLog.replay(run.id, null);
  assert.equal(replayed.kind, "ok");
  const toolResult = replayed.kind === "ok" ? replayed.entries.find((e) => (e.data as { type?: string }).type === "tool_result") : undefined;
  assert.ok(toolResult, "a tool_result event must have been persisted");
  const content = (toolResult!.data as { content: string }).content;
  assert.match(content, new RegExp(`^Error ${FIXED_ID}: `));
  containsNoSecret(content);

  const loggedText = loggedArgs.map((args) => args.map(String).join(" ")).join("\n");
  containsNoSecret(loggedText);
  assert.match(loggedText, new RegExp(FIXED_ID));
});

// ---------------------------------------------------------------------------
// 4. The durable audit row links to the SAME id, never the redacted text — commit 3.
// ---------------------------------------------------------------------------

test("AUDIT LINK: the failed attempt row's detail is exactly errorId=<ID>, never the message", async () => {
  const registry = createToolRegistry();
  registerThrowingTool(registry);
  const sink = createInMemoryToolAttemptAuditSink();
  const executor = createAssistantToolExecutor({
    registry,
    surfaceExchanges: createSurfaceExchangeStore(),
    toolAttemptAudit: { sink, workspaceId: WORKSPACE_ID },
    toolFailures: { mintErrorId: () => FIXED_ID },
  });

  await executor.execute(PRINCIPAL, RUN, "throws_secret", {});

  const failedEvent = sink.events.find((e) => e.phase === "failed");
  assert.ok(failedEvent, "a failed attempt row must have been appended");
  assert.equal(failedEvent!.detail, `errorId=${FIXED_ID}`);
  containsNoSecret(String(failedEvent!.detail));
});

// ---------------------------------------------------------------------------
// 3. The MCP-UI redemption route (P6) — the legacy, no-exchangeId shape.
// ---------------------------------------------------------------------------

test("MCP-UI ROUTE: a redeemable tool's internal failure is redacted and ID-tagged in the 400 body", async (t) => {
  const registry = createToolRegistry();
  registerThrowingTool(registry, "content_post_delete");
  const surfaceExchanges = createSurfaceExchangeStore();
  const toolExecutor = createAssistantToolExecutor({ registry, surfaceExchanges, toolFailures: { mintErrorId: () => FIXED_ID } });

  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: "principal-1" },
    body: JSON.stringify({ toolName: "content_post_delete", params: { id: "post-1", kind: "post" } }),
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
  const registry = createToolRegistry();
  const wrapped = withModelFacingErrors(
    { forbidden_tool: async () => { throw new ForbiddenError(`no grant: ${STRIPE_KEY}`, "x.manage", "no_grant"); } },
    [forbiddenRule("X")],
  );
  registry.register({
    descriptor: { id: "forbidden_tool", inputSchema: { type: "object", properties: {} } },
    policy: { authorize: () => "allow" },
    handler: wrapped.forbidden_tool,
  });
  const records: ToolFailureRecord[] = [];
  const executor = createAssistantToolExecutor({
    registry,
    surfaceExchanges: createSurfaceExchangeStore(),
    toolFailures: { mintErrorId: () => FIXED_ID, onFailure: (r) => records.push(r) },
  });

  const result = await executor.execute(PRINCIPAL, RUN, "forbidden_tool", {});

  assert.equal(result.status, "failed");
  assert.equal(result.errorKind, "validation");
  assert.match(result.error!, /^X_FORBIDDEN: no grant: /);
  containsNoSecret(result.error!);
  assert.equal(readToolErrorId(result), undefined);
  assert.equal(records.length, 0);
});

// ---------------------------------------------------------------------------
// 6. The read-only recovery-remedy refusal message is untouched — it is set on a `completed` result,
//    outside this layer entirely.
// ---------------------------------------------------------------------------

test("READ-ONLY: the recovery remedy-refusal message on a completed result is byte-for-byte unchanged", async () => {
  const registry = createToolRegistry();
  let reads = 0;
  registry.register({
    descriptor: { id: "ro_probe_read", readOnly: true, inputSchema: { type: "object", properties: {} } },
    policy: { authorize: () => "allow" },
    handler: () => {
      reads += 1;
      return { hint: "needs a write", remedyToolId: "ro_probe_write" };
    },
  });
  registry.register({
    descriptor: { id: "ro_probe_write", inputSchema: { type: "object", properties: {} } },
    policy: { authorize: () => "allow" },
    handler: () => ({ saved: true }),
  });
  assert.equal(isReadOnlyTool(registry.list().find((d) => d.id === "ro_probe_write")), false, "PREMISE: the remedy must not itself be read-only");

  const surfaceExchanges = createSurfaceExchangeStore();
  const executor = createAssistantToolExecutor({
    registry,
    surfaceExchanges,
    toolAttemptAudit: { sink: createInMemoryToolAttemptAuditSink(), workspaceId: WORKSPACE_ID },
  });
  const readOnlyPrincipal = constrainPrincipalToReadOnlyTools(PRINCIPAL);
  const emitted: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (s) => void emitted.push(s);

  const result = await executor.execute(readOnlyPrincipal, RUN, "ro_probe_read", {}, undefined, emitSurface);

  const refusal = refuseNonReadOnlyDispatch({ principal: readOnlyPrincipal, toolId: "ro_probe_write", registry });
  assert.ok(refusal, "PREMISE: the remedy must actually be refused for a read-only principal");
  assert.equal(result.status, "completed", "the original read still completed — only the remedy is refused");
  assert.equal(result.error, readOnlyRemedyRefusalMessage(refusal), "the refusal message must be the exact, untouched text — never redacted");
  assert.equal(readToolErrorId(result), undefined);
  assert.equal(reads, 1, "the remedy must never have run");
  assert.equal(emitted.length, 0, "no human should be asked to fill in a form whose answer would be refused");
});

// ---------------------------------------------------------------------------
// 7. BYOK's own meta-tool dispatch, through the PRODUCTION default minter/sink (no test seam).
// ---------------------------------------------------------------------------

function fakeByokRouteDeps(): ByokToolSurfaceDeps {
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => "2026-09-16T00:00:00.000Z" },
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

test("BYOK: execute_delegated_tool's error carries the SAME ID as the default [tool-failure] log line, with no secret in either", async (t) => {
  const loggedArgs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => void loggedArgs.push(args));

  const s = createByokToolSurface(fakeByokRouteDeps());
  registerThrowingTool(s.registry as unknown as ToolRegistry, "throws_secret_byok");

  const result = await s.executeMetaTool(PRINCIPAL, RUN, { name: "execute_delegated_tool", input: { toolId: "throws_secret_byok", input: {} } });

  assert.equal(result.isError, true);
  const idMatch = result.content.match(TOOL_ERROR_ID_PATTERN);
  assert.ok(idMatch, `expected an ERR-… id in: ${result.content}`);
  containsNoSecret(result.content);

  const loggedText = loggedArgs.map((args) => args.map(String).join(" ")).join("\n");
  assert.match(loggedText, /\[tool-failure\]/);
  assert.ok(loggedText.includes(idMatch![0]), "the server log's id must match the one returned to the model");
  containsNoSecret(loggedText);
});
