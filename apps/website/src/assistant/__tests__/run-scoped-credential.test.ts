import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import ts from "typescript";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor, type RunLifecycle } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute, registerRunRoutes, runCancelRoute, runStatusRoute, type RunStartHandler } from "@jini-ai/daemon/http";
import { type AdapterContext } from "@jini-ai/http-kit";

import { AGENT_DAEMON_TOKEN_ENV_VAR, DELEGATED_TOOL_CALLS_PATH, requireAgentDaemonToken } from "../daemon-auth.js";
import {
  createOwnedRunListHandler,
  createRunOwnerRegistry,
  requireRunOwnership,
  RUN_PRINCIPAL_HEADER,
} from "../run-ownership.js";
import { createRunScopedCredentials, type RunScopedCredentials } from "../run-scoped-credential.js";

/**
 * @file The run-scoped credential a spawned `jini-mcp` bridge presents to the agent daemon
 * (`assistant/run-scoped-credential.ts`), exercised over a real socket through the same
 * composition `agent-daemon-server.ts` mounts: the bearer gate, `express.json()`, the ownership
 * middleware, the owner-scoped list handler and the REAL `@jini-ai/http-kit` run routes.
 *
 * The defect this closes (2026-10-01): `get_run`/`cancel_run` from a run's own `jini-mcp` bridge
 * answered `401 UNAUTHENTICATED: x-tovu-principal-id is required on run-scoped requests`. The bridge
 * held the boot-wide proxy token, so the gate let it through, but the ownership check only knew a
 * principal through the header the proxy asserts — which the bridge never sends, and must never be
 * trusted to send. The principal now comes from the credential itself: minted per run, resolved
 * server-side to the run's own principal, overwriting any header the caller supplied.
 */

const PROXY_TOKEN = "p".repeat(64);
const ALICE = "principal-alice";
const BOB = "principal-bob";

function contextRefFor(principalId: string, prompt: string): string {
  return JSON.stringify({ prompt, principalId });
}

interface Harness {
  baseUrl: string;
  lifecycle: RunLifecycle;
  credentials: RunScopedCredentials;
  /** Ends a run's live window the way `onStarted`'s terminal hook does: its principal stops being tracked. */
  endLive: (runId: string) => void;
  close: () => Promise<void>;
}

async function bootDaemon(): Promise<Harness> {
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const owners = createRunOwnerRegistry();
  /** Twin of `agent-daemon-server.ts`'s `principalByRunId`: live runs only. */
  const livePrincipals = new Map<string, string>();
  const credentials = createRunScopedCredentials({ principalOfLiveRun: (runId) => livePrincipals.get(runId) });

  const recordOwnerOnStart: RunStartHandler = ({ request, run }) => {
    const { principalId } = JSON.parse(request.contextRef) as { principalId: string };
    livePrincipals.set(run.id, principalId);
    owners.record(run.id, principalId);
  };

  const app = express();
  app.use(
    requireAgentDaemonToken({
      env: { [AGENT_DAEMON_TOKEN_ENV_VAR]: PROXY_TOKEN },
      exemptPaths: [DELEGATED_TOOL_CALLS_PATH],
      runScopedCallers: credentials,
    }),
  );
  app.use(express.json());
  app.use("/api/runs/:runId", requireRunOwnership(owners, lifecycle));
  app.get("/api/runs", createOwnedRunListHandler({ lifecycle, registry: owners }));
  app.post("/api/federation/reload", (_req, res) => void res.json({ reloaded: true }));
  const adapter: AdapterContext = { resolvedPortRef: { current: 0 }, env: {},
    // Same origin-config env names `agent-daemon-server.ts` passes; an empty `env` keeps the guard
    // hermetic (no ambient JINI_* var can widen or narrow what counts as same-origin here).
    allowedOriginsEnvVar: "JINI_ALLOWED_ORIGINS", webPortEnvVar: "JINI_WEB_PORT", bindHostEnvVar: "JINI_BIND_HOST" };
  registerRunRoutes({ app, deps: { lifecycle, onStarted: recordOwnerOnStart }, adapter });

  const server: Server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  adapter.resolvedPortRef.current = port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    lifecycle,
    credentials,
    endLive: (runId) => void livePrincipals.delete(runId),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Starts a run the way Tovu's proxy does: proxy token plus the session-verified principal. */
async function startRunAsProxy(harness: Harness, principalId: string): Promise<string> {
  const res = await fetch(`${harness.baseUrl}/api/runs`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${PROXY_TOKEN}`,
      "content-type": "application/json",
      [RUN_PRINCIPAL_HEADER]: principalId,
    },
    body: JSON.stringify({ contextRef: contextRefFor(principalId, "hello") }),
  });
  assert.equal(res.status, 201);
  return ((await res.json()) as { run: { id: string } }).run.id;
}

/** Exactly the headers `jini-mcp` sends: its `JINI_DAEMON_TOKEN` as a bearer, nothing else. */
function asBridge(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${token}`, ...extra };
}

test("get_run: a run's own bridge reads its own run", async (t) => {
  const harness = await bootDaemon();
  t.after(harness.close);
  const runId = await startRunAsProxy(harness, ALICE);
  const token = harness.credentials.mint(runId);

  const res = await fetch(`${harness.baseUrl}/api/runs/${runId}`, { headers: asBridge(token) });

  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { run: { id: string } }).run.id, runId);
});

test("cancel_run: a run's own bridge cancels its own run, and only that run", async (t) => {
  const harness = await bootDaemon();
  t.after(harness.close);
  const runId = await startRunAsProxy(harness, ALICE);
  const token = harness.credentials.mint(runId);
  const cancelled: string[] = [];
  t.after(harness.lifecycle.onCancelRequested({ runId, listener: () => cancelled.push(runId) }));

  const res = await fetch(`${harness.baseUrl}/api/runs/${runId}/cancel`, {
    method: "POST",
    headers: asBridge(token, { "content-type": "application/json" }),
    body: JSON.stringify({}),
  });

  assert.equal(res.status, 200);
  assert.deepEqual(cancelled, [runId]);
});

test("another principal's run is denied with the unknown-run body, for both read and cancel", async (t) => {
  const harness = await bootDaemon();
  t.after(harness.close);
  const aliceRun = await startRunAsProxy(harness, ALICE);
  const bobRun = await startRunAsProxy(harness, BOB);
  const aliceToken = harness.credentials.mint(aliceRun);
  const cancelled: unknown[] = [];
  t.after(harness.lifecycle.onCancelRequested({ runId: bobRun, listener: (request) => cancelled.push(request) }));

  const read = await fetch(`${harness.baseUrl}/api/runs/${bobRun}`, { headers: asBridge(aliceToken) });
  const cancel = await fetch(`${harness.baseUrl}/api/runs/${bobRun}/cancel`, {
    method: "POST",
    headers: asBridge(aliceToken, { "content-type": "application/json" }),
    body: JSON.stringify({}),
  });

  assert.equal(read.status, 404);
  assert.deepEqual(await read.json(), { error: { code: "NOT_FOUND", message: `run "${bobRun}" was not found` } });
  assert.equal(cancel.status, 404);
  assert.deepEqual(await cancel.json(), { error: { code: "NOT_FOUND", message: `run "${bobRun}" was not found` } });
  assert.equal((await harness.lifecycle.get({ runId: bobRun }))?.state, "running");
  assert.deepEqual(cancelled, []);
});

test("no credential is a 401, even with a principal header", async (t) => {
  const harness = await bootDaemon();
  t.after(harness.close);
  const runId = await startRunAsProxy(harness, ALICE);

  const res = await fetch(`${harness.baseUrl}/api/runs/${runId}`, { headers: { [RUN_PRINCIPAL_HEADER]: ALICE } });

  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), {
    error: `Authorization: Bearer <${AGENT_DAEMON_TOKEN_ENV_VAR}> is required`,
    code: "UNAUTHENTICATED",
  });
});

test("a forged principal header on a run credential is overwritten, never trusted", async (t) => {
  const harness = await bootDaemon();
  t.after(harness.close);
  const aliceRun = await startRunAsProxy(harness, ALICE);
  const bobRun = await startRunAsProxy(harness, BOB);
  const aliceToken = harness.credentials.mint(aliceRun);

  const forgedRead = await fetch(`${harness.baseUrl}/api/runs/${bobRun}`, {
    headers: asBridge(aliceToken, { [RUN_PRINCIPAL_HEADER]: BOB }),
  });
  const forgedCancel = await fetch(`${harness.baseUrl}/api/runs/${bobRun}/cancel`, {
    method: "POST",
    headers: asBridge(aliceToken, { [RUN_PRINCIPAL_HEADER]: BOB, "content-type": "application/json" }),
    body: JSON.stringify({}),
  });
  const forgedList = await fetch(`${harness.baseUrl}/api/runs/${aliceRun}`, {
    headers: asBridge(aliceToken, { [RUN_PRINCIPAL_HEADER]: BOB }),
  });

  assert.equal(forgedRead.status, 404);
  assert.deepEqual(await forgedRead.json(), { error: { code: "NOT_FOUND", message: `run "${bobRun}" was not found` } });
  assert.equal(forgedCancel.status, 404);
  assert.equal((await harness.lifecycle.get({ runId: bobRun }))?.state, "running");
  // The forged header did not demote the caller either: its own run still reads.
  assert.equal(forgedList.status, 200);
});

test("start_run: a run credential cannot start runs, so it cannot start one as another principal", async (t) => {
  const harness = await bootDaemon();
  t.after(harness.close);
  const aliceRun = await startRunAsProxy(harness, ALICE);
  const aliceToken = harness.credentials.mint(aliceRun);
  const before = (await harness.lifecycle.list({})).length;

  const res = await fetch(`${harness.baseUrl}/api/runs`, {
    method: "POST",
    headers: asBridge(aliceToken, { "content-type": "application/json" }),
    body: JSON.stringify({ contextRef: contextRefFor(BOB, "act as bob") }),
  });

  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), {
    error: "a run-scoped credential cannot call POST /api/runs",
    code: "FORBIDDEN",
  });
  assert.equal((await harness.lifecycle.list({})).length, before, "no run may be created");
});

test("a run credential reaches only the bridge's own routes, never proxy-only ones", async (t) => {
  const harness = await bootDaemon();
  t.after(harness.close);
  const runId = await startRunAsProxy(harness, ALICE);
  const token = harness.credentials.mint(runId);

  const reload = await fetch(`${harness.baseUrl}/api/federation/reload`, { method: "POST", headers: asBridge(token) });
  const events = await fetch(`${harness.baseUrl}/api/runs/${runId}/events`, { headers: asBridge(token) });
  const list = await fetch(`${harness.baseUrl}/api/runs`, { headers: asBridge(token) });

  assert.equal(reload.status, 403);
  assert.deepEqual(await reload.json(), {
    error: "a run-scoped credential cannot call POST /api/federation/reload",
    code: "FORBIDDEN",
  });
  assert.equal(events.status, 403);
  await events.body?.cancel();
  assert.equal(list.status, 403);
});

test("a run credential stops working once its run is no longer live", async (t) => {
  const harness = await bootDaemon();
  t.after(harness.close);
  const runId = await startRunAsProxy(harness, ALICE);
  const token = harness.credentials.mint(runId);
  harness.endLive(runId);

  const res = await fetch(`${harness.baseUrl}/api/runs/${runId}`, { headers: asBridge(token) });

  assert.equal(res.status, 401);
});

test("a revoked run credential is a 401", async (t) => {
  const harness = await bootDaemon();
  t.after(harness.close);
  const runId = await startRunAsProxy(harness, ALICE);
  const token = harness.credentials.mint(runId);
  harness.credentials.revoke(runId);

  const res = await fetch(`${harness.baseUrl}/api/runs/${runId}`, { headers: asBridge(token) });

  assert.equal(res.status, 401);
});

test("the proxy token still trusts the proxy's principal header", async (t) => {
  const harness = await bootDaemon();
  t.after(harness.close);
  const runId = await startRunAsProxy(harness, ALICE);

  const res = await fetch(`${harness.baseUrl}/api/runs/${runId}`, {
    headers: { authorization: `Bearer ${PROXY_TOKEN}`, [RUN_PRINCIPAL_HEADER]: ALICE },
  });

  assert.equal(res.status, 200);
});

test("mint refuses a run that is not live, rather than issuing an orphan credential", () => {
  const credentials = createRunScopedCredentials({ principalOfLiveRun: () => undefined });

  assert.throws(() => credentials.mint("run-gone"), { message: 'cannot mint a credential for run "run-gone": it is not live' });
});

test("each run gets its own 256-bit token, and minting twice for one run returns the same token", () => {
  const credentials = createRunScopedCredentials({ principalOfLiveRun: () => ALICE });

  const first = credentials.mint("run-1");
  const second = credentials.mint("run-2");

  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
  assert.equal(credentials.mint("run-1"), first);
  assert.equal(credentials.resolvePrincipal(first), ALICE);
  assert.equal(credentials.resolvePrincipal("f".repeat(64)), undefined);
});

/**
 * Socket-free boundary tests: real credential store, ownership gate, lifecycle and http-kit
 * handlers. Only Express request/response transport is faked; denied requests never execute
 * a route. A sibling owned by ALICE distinguishes run isolation from principal isolation (F4.4).
 */
async function scopeHarness({ exempt = false } = {}) {
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const owners = createRunOwnerRegistry();
  const live = new Map<string, string>();
  const credentials = createRunScopedCredentials({ principalOfLiveRun: (runId) => live.get(runId) });
  async function start(principalId: string) {
    const { run } = await lifecycle.start({ contextRef: contextRefFor(principalId, "scope-test") });
    live.set(run.id, principalId);
    owners.record(run.id, principalId);
    return run.id;
  }
  const own = await start(ALICE);
  const sibling = await start(ALICE);
  const other = await start(BOB);
  const token = credentials.mint(own);
  const cancellations: string[] = [];
  const unsubscribe = [own, sibling, other].map((id) => lifecycle.onCancelRequested({ runId: id, listener: () => cancellations.push(id) }));
  const executions: { runId: string; principalId: string }[] = [];
  const registry = createToolRegistry({});
  registry.register({
    descriptor: { id: "scope_probe" },
    policy: { authorize: () => "allow" },
    handler: async ({ run, principal }) => {
      const effect = { runId: run.id, principalId: principal.id };
      executions.push(effect);
      return effect;
    },
  });
  const toolExecutor = createToolExecutor({ registry });
  const gateOptions = {
    env: { [AGENT_DAEMON_TOKEN_ENV_VAR]: PROXY_TOKEN },
    runScopedCallers: credentials,
    ...(exempt ? { exemptPaths: [DELEGATED_TOOL_CALLS_PATH] } : {}),
  };
  const authenticate = requireAgentDaemonToken(gateOptions);
  // Mounted after express.json in production; authentication itself remains before parsing.
  const bindDelegatedRun = requireAgentDaemonToken({ ...gateOptions, validateDelegatedRunId: true });

  async function request(method: string, path: string, options: { body?: unknown; headers?: Record<string, string> } = {}) {
    const headers = { ...asBridge(token), ...options.headers };
    const match = /^\/api\/runs\/([^/]+)/.exec(path);
    const req = {
      method, path, headers,
      params: {},
      get: (name: string) => headers[name.toLowerCase()],
    } as unknown as Request;
    const answer = { status: 200, body: undefined as unknown, headers };
    const res = {
      status(code: number) { answer.status = code; return this; },
      json(body: unknown) { answer.body = body; return this; },
    } as unknown as Response;
    async function passes(middleware: (req: Request, res: Response, next: NextFunction) => unknown) {
      let advances = 0;
      await middleware(req, res, ((error?: unknown) => {
        assert.equal(error, undefined);
        advances += 1;
      }) as NextFunction);
      assert.equal(advances === 0 || advances === 1, true, "a gate advances at most once");
      return advances === 1;
    }
    if (!await passes(authenticate)) return answer;
    // Express decodes route parameters only after the global bearer middleware.
    req.params = match ? { runId: decodeURIComponent(match[1]!) } : {};
    req.body = options.body; // The JSON parser's seam: the bearer gate must run first.
    if (path === DELEGATED_TOOL_CALLS_PATH) {
      if (!await passes(bindDelegatedRun)) return answer;
      const parsed = delegatedToolExecuteRoute.parse({ body: req.body, params: {}, query: {} });
      if (!parsed.ok) {
        answer.status = 400;
        answer.body = { error: parsed.error };
        return answer;
      }
      const result = await delegatedToolExecuteRoute.handle({ input: parsed.value, deps: {
        lifecycle, toolExecutor,
        resolvePrincipal: ({ request: { runId } }) => {
          const id = live.get(runId);
          assert.notEqual(id, undefined, "the route must resolve a live run");
          return { id: id! };
        },
      } });
      assert.equal(result.ok, true, "an admitted probe must execute successfully");
      assert.equal(result.ok && result.value.result !== undefined, true);
      answer.body = result.ok ? result.value : undefined;
      return answer;
    }
    if (!await passes(requireRunOwnership(owners, lifecycle))) return answer;
    const runId = String(req.params.runId);
    const result = method === "POST"
      ? await runCancelRoute.handle({ input: { runId }, deps: { lifecycle } })
      : await runStatusRoute.handle({ input: runId, deps: { lifecycle } });
    answer.status = result.ok ? 200 : 404;
    answer.body = result.ok ? result.value : { error: result.error };
    return answer;
  }
  return { own, sibling, other, token, credentials, lifecycle, live, executions, cancellations, request,
    close: () => unsubscribe.forEach((stop) => stop()) };
}

test("SCOPE: own run reads and cancels, ignoring a forged principal header", async (t) => {
  const h = await scopeHarness();
  t.after(h.close);
  const headers = { [RUN_PRINCIPAL_HEADER]: BOB };
  const read = await h.request("GET", `/api/runs/${h.own}`, { headers });
  assert.equal(read.status, 200);
  assert.equal((read.body as { run: { id: string } }).run.id, h.own);
  assert.equal(read.headers[RUN_PRINCIPAL_HEADER], ALICE);
  const cancel = await h.request("POST", `/api/runs/${h.own}/cancel`, { headers });
  assert.equal(cancel.status, 200);
  assert.deepEqual(h.cancellations, [h.own]);
  assert.equal((await h.lifecycle.get({ runId: h.sibling }))?.state, "running");
});

for (const target of ["sibling", "other", "nonexistent"] as const) {
  test(`SCOPE: ${target} run reads and cancels return the exact nonexistent-run body`, async (t) => {
    const h = await scopeHarness();
    t.after(h.close);
    const id = target === "nonexistent" ? "run-absent" : h[target];
    for (const [method, suffix] of [["GET", ""], ["POST", "/cancel"]]) {
      const answer = await h.request(method!, `/api/runs/${id}${suffix}`, { headers: { [RUN_PRINCIPAL_HEADER]: BOB } });
      assert.deepEqual({ status: answer.status, body: answer.body }, {
        status: 404, body: { error: { code: "NOT_FOUND", message: `run "${id}" was not found` } },
      });
    }
    assert.deepEqual(h.cancellations, []);
    assert.equal((await h.lifecycle.get({ runId: h.sibling }))?.state, "running");
    assert.equal((await h.lifecycle.get({ runId: h.other }))?.state, "running");
  });
}

test("SCOPE: other run-addressed routes hide siblings before the route allowlist", async (t) => {
  const h = await scopeHarness();
  t.after(h.close);
  for (const [suffix, message] of [["/events", "run was not found"], ["/future-route", `run "${h.sibling}" was not found`]]) {
    const answer = await h.request("GET", `/api/runs/${h.sibling}${suffix}`);
    assert.deepEqual({ status: answer.status, body: answer.body }, {
      status: 404, body: { error: { code: "NOT_FOUND", message } },
    });
  }
  const ownEvents = await h.request("GET", `/api/runs/${h.own}/events`);
  assert.deepEqual({ status: ownEvents.status, body: ownEvents.body }, {
    status: 403, body: { error: `a run-scoped credential cannot call GET /api/runs/${h.own}/events`, code: "FORBIDDEN" },
  });
});

test("SCOPE: URL decoding uses the same target run identity as Express", async (t) => {
  const h = await scopeHarness();
  t.after(h.close);
  const encodeFirst = (id: string) => `%${id.charCodeAt(0).toString(16)}${id.slice(1)}`;
  const own = await h.request("GET", `/api/runs/${encodeFirst(h.own)}`);
  assert.equal(own.status, 200);
  const sibling = await h.request("GET", `/api/runs/${encodeFirst(h.sibling)}`);
  assert.deepEqual({ status: sibling.status, body: sibling.body }, {
    status: 404, body: { error: { code: "NOT_FOUND", message: `run "${h.sibling}" was not found` } },
  });
});

test("SCOPE: mixed-case run paths still hide sibling identities", async (t) => {
  const h = await scopeHarness();
  t.after(h.close);
  for (const [suffix, message] of [["", `run "${h.sibling}" was not found`], ["/EVENTS", "run was not found"], ["/events/", "run was not found"]]) {
    const answer = await h.request("GET", `/API/RUNS/${h.sibling}${suffix}`);
    assert.deepEqual({ status: answer.status, body: answer.body }, {
      status: 404, body: { error: { code: "NOT_FOUND", message } },
    });
  }
});

test("SCOPE: malformed encoded run ids fail closed before route parameter decoding", async (t) => {
  const h = await scopeHarness();
  t.after(h.close);
  const answer = await h.request("GET", "/api/runs/%ZZ");
  assert.deepEqual({ status: answer.status, body: answer.body }, {
    status: 400, body: { error: { code: "BAD_REQUEST", message: "runId is not valid URL encoding" } },
  });
  assert.deepEqual(h.cancellations, []);
});

test("SCOPE: delegated matching runId executes as the credential's principal", async (t) => {
  const h = await scopeHarness();
  t.after(h.close);
  const answer = await h.request("POST", DELEGATED_TOOL_CALLS_PATH, {
    body: { runId: h.own, toolId: "scope_probe", toolUseId: "tu-own", input: {} },
    headers: { [RUN_PRINCIPAL_HEADER]: BOB },
  });
  assert.equal(answer.status, 200);
  assert.deepEqual(Object.keys(answer.body as object), ["result"]);
  const result = (answer.body as { result: { executionId: string; status: string; output: unknown; truncated: boolean } }).result;
  assert.deepEqual(Object.keys(result).sort(), ["executionId", "output", "status", "truncated"]);
  assert.match(result.executionId, /^[0-9a-f-]{36}$/);
  assert.equal(result.status, "completed");
  assert.equal(result.truncated, false);
  assert.deepEqual(result.output, { runId: h.own, principalId: ALICE });
  assert.equal(answer.headers[RUN_PRINCIPAL_HEADER], ALICE);
  assert.deepEqual(h.executions, [{ runId: h.own, principalId: ALICE }]);
});

for (const exempt of [false, true]) {
  test(`SCOPE: delegated mismatches are 403 with no effects (exemptPaths=${exempt})`, async (t) => {
    const h = await scopeHarness({ exempt });
    t.after(h.close);
    for (const runId of [h.sibling, h.other, "run-absent"]) {
      const answer = await h.request("POST", DELEGATED_TOOL_CALLS_PATH, {
        body: { runId, toolId: "scope_probe", toolUseId: "tu-denied", input: {} },
        headers: { [RUN_PRINCIPAL_HEADER]: BOB },
      });
      assert.deepEqual({ status: answer.status, body: answer.body }, {
        status: 403, body: { error: "a run-scoped credential requires body.runId to match its own run", code: "FORBIDDEN" },
      });
    }
    assert.deepEqual(h.executions, []);
  });
}

test("SCOPE: delegated calls require a credential, including forged, expired and revoked ones", async (t) => {
  const h = await scopeHarness();
  t.after(h.close);
  const body = { runId: h.own, toolId: "scope_probe", toolUseId: "tu-denied", input: {} };
  for (const authorization of ["", "Basic forged", "Bearer forged"]) {
    const answer = await h.request("POST", DELEGATED_TOOL_CALLS_PATH, { body, headers: { authorization, [RUN_PRINCIPAL_HEADER]: ALICE } });
    assert.deepEqual({ status: answer.status, body: answer.body }, {
      status: 401, body: { error: "Authorization: Bearer <TOVU_AGENT_DAEMON_TOKEN> is required", code: "UNAUTHENTICATED" },
    });
  }
  h.live.delete(h.own);
  assert.equal((await h.request("POST", DELEGATED_TOOL_CALLS_PATH, { body })).status, 401);
  h.live.set(h.own, ALICE);
  h.credentials.revoke(h.own);
  assert.equal((await h.request("POST", DELEGATED_TOOL_CALLS_PATH, { body })).status, 401);
  assert.deepEqual(h.executions, []);
});

test("SCOPE: missing or non-string delegated runId fails closed", async (t) => {
  const h = await scopeHarness();
  t.after(h.close);
  for (const body of [undefined, null, {}, [], { runId: 42 }, { runId: [h.own] }]) {
    const answer = await h.request("POST", DELEGATED_TOOL_CALLS_PATH, { body });
    assert.deepEqual({ status: answer.status, body: answer.body }, {
      status: 403, body: { error: "a run-scoped credential requires body.runId to match its own run", code: "FORBIDDEN" },
    });
  }
  assert.deepEqual(h.executions, []);
});

test("SCOPE: proxy credentials retain sibling-run access and delegated execution", async (t) => {
  const h = await scopeHarness();
  t.after(h.close);
  const headers = { authorization: `Bearer ${PROXY_TOKEN}`, [RUN_PRINCIPAL_HEADER]: ALICE };
  assert.equal((await h.request("GET", `/api/runs/${h.sibling}`, { headers })).status, 200);
  assert.equal((await h.request("POST", `/api/runs/${h.sibling}/cancel`, { headers })).status, 200);
  assert.deepEqual(h.cancellations, [h.sibling]);
  const answer = await h.request("POST", DELEGATED_TOOL_CALLS_PATH, {
    headers, body: { runId: h.other, toolId: "scope_probe", toolUseId: "tu-proxy", input: {} },
  });
  assert.equal(answer.status, 200);
  assert.deepEqual((answer.body as { result: { output: unknown } }).result.output, { runId: h.other, principalId: BOB });
  assert.deepEqual(h.executions, [{ runId: h.other, principalId: BOB }]);
});

test("SCOPE: production closes the exemption and binds delegated runId after parsing, before routes", () => {
  const source = readFileSync(new URL("../../server/inbound/assistant/agent-daemon-server.ts", import.meta.url), "utf8");
  const parsed = ts.createSourceFile("agent-daemon-server.ts", source, ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter({ removeComments: true });
  const statements = parsed.statements.map((node) => printer.printNode(ts.EmitHint.Unspecified, node, parsed).replace(/\s+/g, " ").trim());
  const auth = statements.indexOf("app.use(requireAgentDaemonToken({ runScopedCallers: runCredentials }));");
  const json = statements.indexOf('app.use(express.json({ limit: "6mb" }));');
  const binding = statements.indexOf("app.post(DELEGATED_TOOL_CALLS_PATH, requireAgentDaemonToken({ runScopedCallers: runCredentials, validateDelegatedRunId: true }));");
  const route = statements.indexOf("registerDelegatedToolRoutes({ app, deps: delegatedToolRouteDeps, adapter });");
  assert.notEqual(auth, -1, "production must authenticate delegated callers without exemptPaths");
  assert.equal(auth < json && json < binding && binding < route, true,
    "delegated run binding must execute after JSON parsing and before the real delegated route");
});
