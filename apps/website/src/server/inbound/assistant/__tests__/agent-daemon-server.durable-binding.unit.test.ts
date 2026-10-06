import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import type { Express, Request, Response, NextFunction } from "express";
import { createInMemoryEventLog, createRunLifecycle } from "@jini-ai/daemon";
import type { DurableRun, DurableRunStore } from "#src/assistant/durable-runs/ports";
import type { ChatRunLedger } from "#src/assistant/persistence/run-ledger";
import { registerDurableToolGuard } from "../durable-run-routes.js";
import { captureDaemonRun, daemonSource, evaluateDaemonExpression } from "./helpers/daemon-source.js";

type GuardDeps = Parameters<typeof registerDurableToolGuard>[0];

/** Evaluate the actual registration's dependencies: a test-written message-id resolver would
 * hide the public RunStatus/contextRef bug. Importing the entrypoint would boot its server. */
function guardDependencies(bindings: Record<string, unknown>): GuardDeps {
  const statement = daemonSource.statements.find((node) => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression) && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === "registerDurableToolGuard");
  assert.ok(statement && ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression),
    "the daemon must register its durable tool guard");
  const dependencies = statement.expression.arguments[0];
  assert.ok(dependencies, "the durable tool guard registration must provide dependencies");
  return evaluateDaemonExpression<GuardDeps>(dependencies, bindings);
}

test("the real durable guard binds live attempt message ids, fences deleted rows, and clears at terminal", { timeout: 3000 }, async () => {
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const durableMessageIdsByRunId = new Map<string, string>();
  const context = { prompt: "save this answer", principalId: "admin", assistantMessageId: "accepted-answer" };
  const { run } = await lifecycle.start({ contextRef: JSON.stringify(context) }, { runId: "daemon-test-run", agentId: "claude" });
  let stored: DurableRun | null = { message: { runStatus: "running" }, cancelReason: null } as DurableRun;
  let guarded = 0;
  const durable = { find: async () => stored, guardTool: async () => { guarded++; return "allowed"; } } as unknown as DurableRunStore;
  const ledger = { durable } as ChatRunLedger;
  let route: ((req: Request, res: Response, next: NextFunction) => void) | undefined;
  const app = { post: (path: string, handler: typeof route) => {
    assert.equal(path, "/api/delegated-tool-calls"); route = handler;
  } } as unknown as Express;
  const deps = guardDependencies({ app, routeDeps: { chatRunLedger: ledger }, lifecycle, durableMessageIdsByRunId,
    registry: {}, defaultDaemonMessages: { readOnly: {} },
    checkReadOnlyTool: ({ toolId }: { toolId: string }) => toolId === "read_state" ? null : "mutating",
  });
  registerDurableToolGuard(deps, {});

  const dispatch = (toolId: string): Promise<{ status: number; body?: unknown }> => new Promise((resolve, reject) => {
    let status = 200;
    const res = { status: (value: number) => { status = value; return res; },
      json: (body: unknown) => { resolve({ status, body }); return res; } } as unknown as Response;
    assert.ok(route);
    route({ body: { runId: run.id, toolId, input: {} } } as Request, res,
      ((error?: unknown) => { if (error) reject(error); else resolve({ status }); }) as NextFunction);
  });

  try {
    // Keep the real public status contract; never fake a contextRef on lifecycle.get().
    const status = await lifecycle.get({ runId: run.id });
    assert.ok(status);
    assert.equal("contextRef" in status, false);
    assert.equal(await deps.messageIdForAttempt({ runId: run.id }, {}), null, "no binding before onStarted");
    await captureDaemonRun(context, { lifecycle, bindings: {
      durableMessageIdsByRunId, routeDeps: { workspaceId: "ws-durable-binding", chatRunLedger: ledger },
      attachmentStore: undefined,
      runCredentials: { revoke() {} }, runOwners: { record() {}, forget() {} }, RUN_OWNER_RETENTION_MS: 0,
    } });
    assert.equal(await deps.messageIdForAttempt({ runId: run.id }, {}), context.assistantMessageId);
    assert.equal(await deps.messageIdForAttempt({ runId: "unbound" }, {}), null);
    assert.deepEqual(await dispatch("create_item"), { status: 200 });
    assert.equal(guarded, 1, "live mutations must reach the durable guard");

    // Deletion/attempt advancement removes the durable lookup while the old CLI is still live.
    // The actual start-time binding must distinguish that stale chat run from a non-chat client.
    stored = null;
    for (const toolId of ["create_item", "read_state"]) {
      assert.deepEqual(await dispatch(toolId), { status: 409, body: { error: {
        code: "STALE_RUN_ATTEMPT", message: "This execution attempt no longer owns the answer.",
      } } });
    }
    assert.equal(guarded, 1);
    await lifecycle.finish({ runId: run.id, status: "succeeded", code: 0, signal: null, resumable: false });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(durableMessageIdsByRunId.has(run.id), false, "terminal cleanup must release the durable binding");
    assert.equal(await deps.messageIdForAttempt({ runId: run.id }, {}), null);
  } finally {
    await lifecycle.finish({ runId: run.id, status: "failed", code: null, signal: null, resumable: false }).catch(() => {});
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
});
