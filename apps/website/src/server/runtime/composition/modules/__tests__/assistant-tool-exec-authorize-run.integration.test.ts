import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import express from "express";
import { ensureToolExecToken } from "../../../../../assistant/daemon-access.js";
import { registerAssistantToolExecRoutes } from "../assistant-tool-exec.js";

/**
 * @file Who may run a tool over the daemon's tool RPC, recorded from today's router on a real
 * socket: the real caller gate, the real body parser, the real `requireSiteToolRun` and the real
 * execution handler, with only the run store, the tool executor and the plugin controller replaced
 * by recorders. Each case names the one condition of the check it depends on, so a change that
 * drops that condition turns exactly that case red. The check must keep these answers when the
 * route stops being an Express handler.
 */

const WORKSPACE = "workspace-1";
const OWNER = "principal-recorded";
const REFUSAL = { error: { code: "FORBIDDEN", message: "a live site run with its recorded principal is required" } };

type StoredRun = { runId: string; workspaceId: string; principalId: string; cancelReason?: string; message: { runStatus: string }; request: { contextRef: string } };
const liveRun = (overrides: Partial<StoredRun> = {}): StoredRun => ({ runId: "run-1", workspaceId: WORKSPACE, principalId: OWNER, message: { runStatus: "running" }, request: { contextRef: "{}" }, ...overrides });

interface Rpc {
  readonly executed: Array<{ principal: unknown; run: unknown; toolId: string; input: unknown }>;
  readonly listedFor: string[];
  readonly forgotten: Array<{ runId: string; preservePending: unknown }>;
  execute(body: unknown): Promise<{ status: number; text: string }>;
  catalog(query: Record<string, string>): Promise<{ status: number; text: string }>;
}

/** Mounts the real tool RPC over `find` (or no run store at all) and returns what reached each collaborator. */
async function startRpc(t: TestContext, find: ((required: { runId: string }) => Promise<StoredRun | null>) | "no-store"): Promise<Rpc> {
  const executed: Rpc["executed"] = [];
  const listedFor: string[] = [];
  const forgotten: Rpc["forgotten"] = [];
  const router = express.Router();
  const app = express().use(router);
  registerAssistantToolExecRoutes({
    router,
    workspaceId: WORKSPACE,
    runStore: find === "no-store" ? undefined : { find: find as never },
    toolSurface: { daemonCalls: {
      executor: { execute: async (call: Rpc["executed"][number]) => { executed.push(call); return { status: "completed", output: { ok: true } }; } },
      listToolsFor: async ({ principalId }: { principalId: string }) => { listedFor.push(principalId); return []; },
    } } as never,
    plugins: { controller: { forget: ({ runId }: { runId: string }, optional: { preservePending?: unknown } = {}) => { forgotten.push({ runId, preservePending: optional.preservePending }); } } } as never,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const authorization = `Bearer ${ensureToolExecToken({}, {})}`;
  const answer = async (response: Response): Promise<{ status: number; text: string }> => ({ status: response.status, text: await response.text() });
  return {
    executed, listedFor, forgotten,
    execute: async (body) => answer(await fetch(`${baseUrl}/internal/tool-executions`, { method: "POST", headers: { authorization, "content-type": "application/json" }, body: JSON.stringify(body) })),
    catalog: async (query) => answer(await fetch(`${baseUrl}/internal/tool-catalog?${new URLSearchParams(query).toString()}`, { headers: { authorization } })),
  };
}

const call = (principal: unknown, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({ executionId: "exec-1", principal, run: { id: "run-1" }, toolId: "site_read", input: { a: 1 }, ...overrides });
const refused = (answer: { status: number; text: string }): void => {
  assert.equal(answer.status, 403);
  assert.deepEqual(JSON.parse(answer.text), REFUSAL);
};

test("a caller naming another principal than the run's recorded one is refused, and nothing runs", async (t) => {
  const rpc = await startRpc(t, async () => liveRun());
  refused(await rpc.execute(call({ id: "principal-other" })));
  assert.deepEqual(rpc.executed, []);
  // The run itself is live and ours, so its plugin state is left alone.
  assert.deepEqual(rpc.forgotten, []);
});

test("the tool runs as the recorded principal only: every other field the caller put on the principal is dropped", async (t) => {
  const rpc = await startRpc(t, async () => liveRun());
  const answer = await rpc.execute(call({ id: OWNER, roles: ["admin"], toolAccess: "full", workspaceId: "elsewhere" }));
  assert.equal(answer.status, 200);
  assert.deepEqual(rpc.executed, [{ principal: { id: OWNER }, run: { id: "run-1" }, toolId: "site_read", input: { a: 1 } }]);
});

test("a caller may narrow itself to read-only, and that is the one thing kept from what it sent", async (t) => {
  const rpc = await startRpc(t, async () => liveRun());
  assert.equal((await rpc.execute(call({ id: OWNER, toolAccess: "read-only", roles: ["admin"] }))).status, 200);
  assert.deepEqual(rpc.executed.map((entry) => entry.principal), [{ id: OWNER, toolAccess: "read-only" }]);
});

for (const [label, stored] of [
  ["a run of another workspace", liveRun({ workspaceId: "workspace-2" })],
  ["a run whose answer already finished", liveRun({ message: { runStatus: "completed" } })],
  ["a run that was cancelled while still marked running", liveRun({ cancelReason: "user" })],
  ["a run the store does not know", null],
  ["a record the store returned under another run id", liveRun({ runId: "run-2" })],
] as const) {
  test(`${label} is refused even for its own principal, nothing runs, and its plugin state is forgotten`, async (t) => {
    const rpc = await startRpc(t, async () => stored);
    refused(await rpc.execute(call({ id: OWNER })));
    assert.deepEqual(rpc.executed, []);
    assert.deepEqual(rpc.forgotten, [{ runId: "run-1", preservePending: true }]);
  });
}

test("with no run store configured every call is refused", async (t) => {
  const rpc = await startRpc(t, "no-store");
  refused(await rpc.execute(call({ id: OWNER })));
  refused(await rpc.catalog({ runId: "run-1", principalId: OWNER }));
  assert.deepEqual(rpc.executed, []);
  assert.deepEqual(rpc.listedFor, []);
});

test("the run is checked before the shape of the call: a malformed call for a dead run is refused with 403, not 400", async (t) => {
  const rpc = await startRpc(t, async () => liveRun({ message: { runStatus: "completed" } }));
  refused(await rpc.execute(call({ id: OWNER }, { toolId: undefined })));
});

test("a malformed call for a live run of the right principal gets the route's own 400", async (t) => {
  const rpc = await startRpc(t, async () => liveRun());
  const answer = await rpc.execute(call({ id: OWNER }, { toolId: undefined }));
  assert.equal(answer.status, 400);
  assert.equal((JSON.parse(answer.text) as { error: { code: string } }).error.code, "BAD_REQUEST");
  assert.deepEqual(rpc.executed, []);
});

test("a call that names no run or no principal is refused before the store is asked", async (t) => {
  let asked = 0;
  const rpc = await startRpc(t, async () => { asked += 1; return liveRun(); });
  refused(await rpc.execute(call({ id: OWNER }, { run: {} })));
  refused(await rpc.execute(call({})));
  refused(await rpc.execute(call({ id: 42 })));
  assert.equal(asked, 0);
  assert.deepEqual(rpc.executed, []);
});

test("the tool catalog is held to the same check: a mismatched principal is refused and no tools are listed", async (t) => {
  const rpc = await startRpc(t, async () => liveRun());
  refused(await rpc.catalog({ runId: "run-1", principalId: "principal-other" }));
  refused(await rpc.catalog({ principalId: OWNER }));
  assert.deepEqual(rpc.listedFor, []);
  const allowed = await rpc.catalog({ runId: "run-1", principalId: OWNER });
  assert.equal(allowed.status, 200);
  assert.deepEqual(JSON.parse(allowed.text), { tools: [] });
  assert.deepEqual(rpc.listedFor, [OWNER]);
});

test("a run store that fails admits nothing: nothing runs and nothing is listed", async (t) => {
  const rpc = await startRpc(t, async () => { throw new Error("store unavailable"); });
  // A failing store is the host's error path on both routes (the route list throws it to the app's own error handler), so the
  // caller is never told its JSON was invalid. It used to be on the execution route: the failure went to the route's own
  // body-parser error handler, which answered 400 "request body must be valid JSON" (a changed answer, decided by the route sheet).
  const executed = await rpc.execute(call({ id: OWNER }));
  assert.equal(executed.status, 500);
  assert.doesNotMatch(executed.text, /valid JSON/);
  // The host's answers: 500, without the failure text in production mode.
  assert.equal((await rpc.catalog({ runId: "run-1", principalId: OWNER })).status, 500);
  assert.deepEqual(rpc.executed, []);
  assert.deepEqual(rpc.listedFor, []);
});
