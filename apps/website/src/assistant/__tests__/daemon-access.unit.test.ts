import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_DAEMON_TOKEN_ENV_VAR, createOwnedRunListHandler, createRunOwnerRegistry, createRunScopedCredentials,
  DELEGATED_TOOL_CALLS_PATH, ensureAgentDaemonToken, isRunScopedRoute, requireAgentDaemonToken, requireRunOwnership,
  RUN_PRINCIPAL_HEADER,
} from "../daemon-access.js";

/**
 * @file `isRunScopedRoute` — which daemon routes a run-scoped credential (as opposed to the host's
 * full daemon token) may reach. The allow-list is method + exact path shape, so a matching path
 * under the wrong method, a deeper path, or an unlisted route must all be refused.
 */

test("each allow-listed run-scoped route is accepted for its own method", () => {
  for (const [method, path] of [
    ["GET", "/api/runs/run-1"],
    ["POST", "/api/runs/run-1/cancel"],
    ["GET", "/api/tools/some_tool"],
    ["GET", "/api/components/recharts.bar-chart"],
    ["GET", "/api/active"],
    ["GET", "/api/agents"],
    ["POST", DELEGATED_TOOL_CALLS_PATH],
  ] as const) {
    assert.equal(isRunScopedRoute({ method, path }), true, `${method} ${path}`);
  }
});

test("a listed path under another method, a deeper path, and an unlisted route are refused", () => {
  for (const [method, path] of [
    ["DELETE", "/api/runs/run-1"],
    ["GET", "/api/runs/run-1/cancel"],
    ["GET", "/api/tools/a/b"],
    ["POST", "/api/runs"],
    ["GET", "/api/settings"],
  ] as const) {
    assert.equal(isRunScopedRoute({ method, path }), false, `${method} ${path}`);
  }
});

// L11 Stryker: dropping `^` or `$` from any allow-list regex survived — pin every anchor with a
// prefixed, suffixed and extra-segment path per route.
test("each allow-listed route refuses a prefixed path, a suffixed path and an extra segment", () => {
  for (const [method, path] of [
    ["GET", "/x/api/runs/run-1"], ["GET", "/api/runs/run-1/"], ["GET", "/api/runs/run-1/other"],
    ["POST", "/x/api/runs/run-1/cancel"], ["POST", "/api/runs/run-1/cancel/extra"], ["POST", "/api/runs/a/b/cancel"],
    ["GET", "/x/api/tools/t"], ["GET", "/api/tools/t/"], ["GET", "/api/tools/"],
    ["GET", "/x/api/components/c"], ["GET", "/api/components/c/extra"], ["GET", "/api/components/"],
    ["GET", "/x/api/active"], ["GET", "/api/active/extra"], ["GET", "/api/activeX"],
    ["GET", "/x/api/agents"], ["GET", "/api/agents/extra"], ["GET", "/api/agentsX"],
    ["POST", `/x${DELEGATED_TOOL_CALLS_PATH}`], ["POST", `${DELEGATED_TOOL_CALLS_PATH}/extra`], ["POST", `${DELEGATED_TOOL_CALLS_PATH}X`],
    ["GET", "/api/runs/"],
  ] as const) {
    assert.equal(isRunScopedRoute({ method, path }), false, `${method} ${path}`);
  }
});

test("each allow-listed route is refused under the wrong method", () => {
  for (const [method, path] of [
    ["POST", "/api/runs/run-1"], ["GET", "/api/runs/run-1/cancel"], ["POST", "/api/tools/t"], ["POST", "/api/components/c"],
    ["POST", "/api/active"], ["POST", "/api/agents"], ["GET", DELEGATED_TOOL_CALLS_PATH], ["get", "/api/active"],
  ] as const) {
    assert.equal(isRunScopedRoute({ method, path }), false, `${method} ${path}`);
  }
});

test("ensureAgentDaemonToken keeps an operator token and mints exactly once into the Tovu env var", () => {
  const preset = { [AGENT_DAEMON_TOKEN_ENV_VAR]: "operator-token" };
  assert.equal(ensureAgentDaemonToken({ env: preset }), "operator-token");
  const env: NodeJS.ProcessEnv = {};
  const minted = ensureAgentDaemonToken({ env });
  assert.equal(AGENT_DAEMON_TOKEN_ENV_VAR, "TOVU_AGENT_DAEMON_TOKEN");
  assert.equal(env.TOVU_AGENT_DAEMON_TOKEN, minted);
  assert.ok(minted.length >= 32, "minted token is long");
  assert.equal(ensureAgentDaemonToken({ env }), minted, "a repeat call never rotates the token");
});

/** Minimal Express doubles: only what the Jini adapters read and write. */
function fakeReq(init: { method?: string; path: string; headers?: Record<string, string>; params?: Record<string, string>; query?: Record<string, unknown>; body?: unknown }) {
  const headers: Record<string, string | undefined> = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return { method: init.method ?? "GET", path: init.path, headers, params: init.params ?? {}, query: init.query ?? {}, body: init.body,
    get: (name: string) => headers[name.toLowerCase()] } as never;
}
function fakeRes() {
  const res = { statusCode: 200, body: undefined as unknown,
    status(code: number) { res.statusCode = code; return res; }, json(body: unknown) { res.body = body; return res; } };
  return res;
}
async function run(handler: (req: never, res: never, next: (err?: unknown) => void) => unknown, req: never) {
  const res = fakeRes();
  let nextCalls = 0; let nextError: unknown;
  await handler(req, res as never, (err?: unknown) => { nextCalls += 1; nextError = err; });
  return { res, nextCalls, nextError };
}

test("requireAgentDaemonToken: unset env refuses with 503, a wrong bearer with 401, the proxy token passes", async () => {
  const unset = await run(requireAgentDaemonToken({ env: {} }), fakeReq({ path: "/api/settings", headers: { authorization: "Bearer x" } }));
  assert.equal(unset.res.statusCode, 503);
  assert.equal((unset.res.body as { code: string }).code, "AGENT_DAEMON_UNCONFIGURED");
  assert.equal(unset.nextCalls, 0);
  const env = { [AGENT_DAEMON_TOKEN_ENV_VAR]: "proxy-token" };
  const wrong = await run(requireAgentDaemonToken({ env }), fakeReq({ path: "/api/settings", headers: { authorization: "Bearer nope" } }));
  assert.equal(wrong.res.statusCode, 401);
  assert.deepEqual(wrong.res.body, { error: "Authorization: Bearer <TOVU_AGENT_DAEMON_TOKEN> is required", code: "UNAUTHENTICATED" });
  const missing = await run(requireAgentDaemonToken({ env }), fakeReq({ path: "/api/settings" }));
  assert.equal(missing.res.statusCode, 401);
  const ok = await run(requireAgentDaemonToken({ env }), fakeReq({ path: "/api/settings", headers: { authorization: "Bearer proxy-token" } }));
  assert.equal(ok.nextCalls, 1);
  assert.equal(ok.nextError, undefined);
});

test("requireAgentDaemonToken: exempt paths pass only without a credential and only when configured as exempt", async () => {
  const env = { [AGENT_DAEMON_TOKEN_ENV_VAR]: "proxy-token" };
  const exempt = await run(requireAgentDaemonToken({ env, exemptPaths: ["/health"] }), fakeReq({ path: "/health" }));
  assert.equal(exempt.nextCalls, 1);
  const notExempt = await run(requireAgentDaemonToken({ env }), fakeReq({ path: "/health" }));
  assert.equal(notExempt.res.statusCode, 401);
  const withBadCredential = await run(requireAgentDaemonToken({ env, exemptPaths: ["/health"] }), fakeReq({ path: "/health", headers: { authorization: "Bearer bad" } }));
  assert.equal(withBadCredential.res.statusCode, 401);
});

test("requireAgentDaemonToken: a run credential sets the Tovu principal header, is bound to its run and its allow-list", async () => {
  const env = { [AGENT_DAEMON_TOKEN_ENV_VAR]: "proxy-token" };
  const credentials = createRunScopedCredentials({ principalOfLiveRun: ({ runId }) => (runId === "run-1" ? "principal-a" : undefined) });
  const token = credentials.mint({ runId: "run-1" });
  const gate = requireAgentDaemonToken({ env, runScopedCallers: credentials });
  const req = fakeReq({ path: "/api/runs/run-1", headers: { authorization: `Bearer ${token}`, [RUN_PRINCIPAL_HEADER]: "spoofed" } });
  const own = await run(gate, req);
  assert.equal(own.nextCalls, 1);
  assert.equal((req as { headers: Record<string, string> }).headers["x-tovu-principal-id"], "principal-a");
  const foreign = await run(gate, fakeReq({ path: "/api/runs/run-2", headers: { authorization: `Bearer ${token}` } }));
  assert.equal(foreign.res.statusCode, 404);
  const offList = await run(gate, fakeReq({ path: "/api/settings", headers: { authorization: `Bearer ${token}` } }));
  assert.equal(offList.res.statusCode, 403);
  // Without the resolver the run token is just an unknown bearer.
  const noResolver = await run(requireAgentDaemonToken({ env }), fakeReq({ path: "/api/runs/run-1", headers: { authorization: `Bearer ${token}` } }));
  assert.equal(noResolver.res.statusCode, 401);
});

test("requireAgentDaemonToken: validateDelegatedRunId makes body.runId bind to the credential's run", async () => {
  const env = { [AGENT_DAEMON_TOKEN_ENV_VAR]: "proxy-token" };
  const credentials = createRunScopedCredentials({ principalOfLiveRun: () => "principal-a" });
  const token = credentials.mint({ runId: "run-1" });
  const headers = { authorization: `Bearer ${token}` };
  const strict = requireAgentDaemonToken({ env, runScopedCallers: credentials, validateDelegatedRunId: true });
  const mismatch = await run(strict, fakeReq({ method: "POST", path: DELEGATED_TOOL_CALLS_PATH, headers, body: { runId: "run-2" } }));
  assert.equal(mismatch.res.statusCode, 403);
  assert.equal((mismatch.res.body as { error: string }).error, "a run-scoped credential requires body.runId to match its own run");
  const match = await run(strict, fakeReq({ method: "POST", path: DELEGATED_TOOL_CALLS_PATH, headers, body: { runId: "run-1" } }));
  assert.equal(match.nextCalls, 1);
  const lax = requireAgentDaemonToken({ env, runScopedCallers: credentials, validateDelegatedRunId: false });
  assert.equal((await run(lax, fakeReq({ method: "POST", path: DELEGATED_TOOL_CALLS_PATH, headers, body: { runId: "run-2" } }))).nextCalls, 1);
  const unset = requireAgentDaemonToken({ env, runScopedCallers: credentials });
  assert.equal((await run(unset, fakeReq({ method: "POST", path: DELEGATED_TOOL_CALLS_PATH, headers, body: { runId: "run-2" } }))).nextCalls, 1);
});

test("requireRunOwnership: the owner passes, another principal gets the unknown-run 404, a missing principal 401", async () => {
  const registry = createRunOwnerRegistry({});
  registry.record({ runId: "run-1", principalId: "a" });
  const lifecycle = { get: async ({ runId }: { runId: string }) => (runId === "run-1" || runId === "unowned" ? ({ id: runId } as never) : undefined) };
  const gate = requireRunOwnership({ registry, lifecycle });
  const owner = await run(gate, fakeReq({ path: "/api/runs/run-1", params: { runId: "run-1" }, headers: { [RUN_PRINCIPAL_HEADER]: "a" } }));
  assert.equal(owner.nextCalls, 1);
  const other = await run(gate, fakeReq({ path: "/api/runs/run-1", params: { runId: "run-1" }, headers: { [RUN_PRINCIPAL_HEADER]: "b" } }));
  assert.equal(other.res.statusCode, 404);
  assert.deepEqual(other.res.body, { error: { code: "NOT_FOUND", message: 'run "run-1" was not found' } });
  const stream = await run(gate, fakeReq({ path: "/api/runs/run-1/events", params: { runId: "run-1" }, headers: { [RUN_PRINCIPAL_HEADER]: "b" } }));
  assert.deepEqual(stream.res.body, { error: { code: "NOT_FOUND", message: "run was not found" } });
  const unowned = await run(gate, fakeReq({ path: "/api/runs/unowned", params: { runId: "unowned" }, headers: { [RUN_PRINCIPAL_HEADER]: "a" } }));
  assert.equal(unowned.res.statusCode, 404, "an existing run with no recorded owner is denied");
  const absent = await run(gate, fakeReq({ path: "/api/runs/absent", params: { runId: "absent" }, headers: { [RUN_PRINCIPAL_HEADER]: "a" } }));
  assert.equal(absent.nextCalls, 1, "a genuinely absent run reaches the route's own 404");
  const anonymous = await run(gate, fakeReq({ path: "/api/runs/run-1", params: { runId: "run-1" } }));
  assert.equal(anonymous.res.statusCode, 401);
  assert.deepEqual(anonymous.res.body, { error: { code: "UNAUTHENTICATED", message: "x-tovu-principal-id is required on run-scoped requests" } });
});

test("createOwnedRunListHandler lists only the principal's runs and forwards contextRef", async () => {
  const registry = createRunOwnerRegistry({});
  registry.record({ runId: "r1", principalId: "a" });
  registry.record({ runId: "r2", principalId: "b" });
  registry.record({ runId: "r3", principalId: "a" });
  const calls: unknown[] = [];
  const lifecycle = { list: async (required: unknown, options: unknown) => { calls.push([required, options]); return [{ id: "r1" }, { id: "r2" }, { id: "r3" }, { id: "r4" }]; } } as never;
  const handler = createOwnedRunListHandler({ lifecycle, registry });
  const listed = await run(handler, fakeReq({ path: "/api/runs", headers: { [RUN_PRINCIPAL_HEADER]: "a" }, query: { contextRef: "chat-9" } }));
  assert.deepEqual(listed.res.body, { runs: [{ id: "r1" }, { id: "r3" }] });
  assert.deepEqual(calls, [[{}, { contextRef: "chat-9" }]]);
  const anonymous = await run(handler, fakeReq({ path: "/api/runs" }));
  assert.equal(anonymous.res.statusCode, 401);
  assert.equal(calls.length, 1, "the list port is not called without a principal");
});
