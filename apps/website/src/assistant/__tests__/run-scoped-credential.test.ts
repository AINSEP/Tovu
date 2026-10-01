import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { createInMemoryEventLog, createRunLifecycle, type RunLifecycle } from "@jini-ai/daemon";
import { registerRunRoutes, type AdapterContext, type RunStartHandler } from "@jini-ai/http-kit";

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
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog() });
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
  const adapter: AdapterContext = { resolvedPortRef: { current: 0 } };
  registerRunRoutes(app, { lifecycle, onStarted: recordOwnerOnStart }, adapter);

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
  t.after(harness.lifecycle.onCancelRequested(runId, () => cancelled.push(runId)));

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
  t.after(harness.lifecycle.onCancelRequested(bobRun, (request) => cancelled.push(request)));

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
  assert.equal((await harness.lifecycle.get(bobRun))?.state, "running");
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
  assert.equal((await harness.lifecycle.get(bobRun))?.state, "running");
  // The forged header did not demote the caller either: its own run still reads.
  assert.equal(forgedList.status, 200);
});

test("start_run: a run credential cannot start runs, so it cannot start one as another principal", async (t) => {
  const harness = await bootDaemon();
  t.after(harness.close);
  const aliceRun = await startRunAsProxy(harness, ALICE);
  const aliceToken = harness.credentials.mint(aliceRun);
  const before = (await harness.lifecycle.list()).length;

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
  assert.equal((await harness.lifecycle.list()).length, before, "no run may be created");
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
