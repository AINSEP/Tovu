import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { createInMemoryEventLog, createRunLifecycle, type RunLifecycle } from "@jini-ai/daemon";
import { registerRunRoutes, type AdapterContext, type RunStartHandler } from "@jini-ai/http-kit";

import {
  createOwnedRunListHandler,
  createRunOwnerRegistry,
  requireRunOwnership,
  RUN_PRINCIPAL_HEADER,
} from "../run-ownership.js";

/**
 * @file Cross-principal authorization coverage for the agent daemon's `/api/runs` surface
 * (`assistant/run-ownership.ts`).
 *
 * The app under test mounts the ownership middleware and the owner-scoped list handler ahead of
 * the REAL `@jini-ai/http-kit` `registerRunRoutes`, against a REAL `RunLifecycle` — the same
 * composition `agent-daemon-server.ts` performs. That matters for more than realism: the central
 * claim of the 404-over-403 decision is that a non-owner's refusal is indistinguishable from a
 * genuinely unknown run, and only a test that provokes both responses from the same server can
 * show it. A fake http-kit would let this file assert its own assumptions about someone else's
 * error text and pass forever after that text changed.
 *
 * `agent-daemon-server.ts` itself is a top-level side-effecting script (it opens a real port and a
 * real `content.db` connection on import), so — exactly as `daemon-auth.test.ts` documents for the
 * bearer gate — the composition is reproduced here rather than imported. {@link recordOwnerOnStart}
 * is the two-line twin of its `onStarted` owner-recording step.
 */

const ALICE = "principal-alice";
const BOB = "principal-bob";

function contextRefFor(principalId: string, prompt: string): string {
  return JSON.stringify({ prompt, principalId });
}

interface Harness {
  baseUrl: string;
  lifecycle: RunLifecycle;
  close: () => Promise<void>;
}

async function bootDaemonRoutes(): Promise<Harness> {
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog() });
  const registry = createRunOwnerRegistry();

  /** Mirrors `agent-daemon-server.ts`'s `onStarted`: decode the proxy's `contextRef`, record the owner. */
  const recordOwnerOnStart: RunStartHandler = ({ request, run }) => {
    const { principalId } = JSON.parse(request.contextRef) as { principalId: string };
    registry.record(run.id, principalId);
  };

  const app = express();
  app.use(express.json());
  app.use("/api/runs/:runId", requireRunOwnership(registry));
  app.get("/api/runs", createOwnedRunListHandler({ lifecycle, registry }));
  const adapter: AdapterContext = { resolvedPortRef: { current: 0 } };
  registerRunRoutes(app, { lifecycle, onStarted: recordOwnerOnStart }, adapter);

  const server: Server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  // http-kit's `requireSameOrigin` routes (run start, run cancel) compare the request's `Host`
  // against this ref, so it has to hold the ephemeral port the OS just handed out — the real
  // daemon sets it to its own fixed port for the same reason.
  adapter.resolvedPortRef.current = port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    lifecycle,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Starts a run through the real `POST /api/runs`, in the exact wire shape Tovu's proxy sends. */
async function startRun(harness: Harness, principalId: string, prompt = "hello"): Promise<string> {
  const res = await fetch(`${harness.baseUrl}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: principalId },
    body: JSON.stringify({ contextRef: contextRefFor(principalId, prompt) }),
  });
  assert.equal(res.status, 201, "run creation is not owner-scoped — a run has no owner until it exists");
  return ((await res.json()) as { run: { id: string } }).run.id;
}

function asPrincipal(principalId: string): Record<string, string> {
  return { [RUN_PRINCIPAL_HEADER]: principalId };
}

test("a non-owner cannot read another principal's run status", async (t) => {
  const harness = await bootDaemonRoutes();
  t.after(harness.close);
  const runId = await startRun(harness, ALICE);

  const owner = await fetch(`${harness.baseUrl}/api/runs/${runId}`, { headers: asPrincipal(ALICE) });
  const stranger = await fetch(`${harness.baseUrl}/api/runs/${runId}`, { headers: asPrincipal(BOB) });

  assert.equal(owner.status, 200, "the principal that started the run must still be able to read it");
  assert.equal(stranger.status, 404);
});

test("the non-owner refusal is byte-identical to a genuinely unknown run, so a runId cannot be confirmed", async (t) => {
  const harness = await bootDaemonRoutes();
  t.after(harness.close);
  const runId = await startRun(harness, ALICE);

  const refused = await fetch(`${harness.baseUrl}/api/runs/${runId}`, { headers: asPrincipal(BOB) });
  const nonexistent = await fetch(`${harness.baseUrl}/api/runs/${runId}-not-a-real-run`, { headers: asPrincipal(BOB) });

  assert.equal(refused.status, nonexistent.status);
  assert.deepEqual(
    await refused.json(),
    JSON.parse((await nonexistent.text()).replaceAll(`${runId}-not-a-real-run`, runId)),
    "http-kit writes the unknown-run body; a non-owner's must match it exactly, id substitution aside"
  );
});

test("a non-owner cannot subscribe to another principal's run event stream — the whole transcript", async (t) => {
  const harness = await bootDaemonRoutes();
  t.after(harness.close);
  const runId = await startRun(harness, ALICE, "a private prompt");

  const refused = await fetch(`${harness.baseUrl}/api/runs/${runId}/events`, { headers: asPrincipal(BOB) });
  const nonexistent = await fetch(`${harness.baseUrl}/api/runs/nope/events`, { headers: asPrincipal(BOB) });

  assert.equal(refused.status, 404);
  assert.equal(refused.headers.get("content-type")?.startsWith("application/json"), true, "a refusal is not an SSE stream");
  assert.deepEqual(
    await refused.json(),
    await nonexistent.json(),
    "the SSE route's unknown-run body omits the id — the refusal must omit it too"
  );
});

test("the owner can still stream their own run's events", async (t) => {
  const harness = await bootDaemonRoutes();
  t.after(harness.close);
  const runId = await startRun(harness, ALICE);
  // Terminal first: `createSseChannel` closes on the `end` event, so a finished run's stream
  // completes instead of holding the request open for the length of the test.
  await harness.lifecycle.finish({ runId, status: "succeeded", code: 0, signal: null, resumable: false });

  const res = await fetch(`${harness.baseUrl}/api/runs/${runId}/events`, { headers: asPrincipal(ALICE) });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type")?.startsWith("text/event-stream"), true);
  assert.match(await res.text(), /"end"/);
});

test("a non-owner cannot cancel another principal's in-flight run, and the run keeps running", async (t) => {
  const harness = await bootDaemonRoutes();
  t.after(harness.close);
  const runId = await startRun(harness, ALICE);

  const res = await fetch(`${harness.baseUrl}/api/runs/${runId}/cancel`, { method: "POST", headers: asPrincipal(BOB) });

  assert.equal(res.status, 404);
  assert.equal((await harness.lifecycle.get(runId))?.state, "running", "a refused cancel must have no side effect");
});

test("the owner can cancel their own run", async (t) => {
  const harness = await bootDaemonRoutes();
  t.after(harness.close);
  const runId = await startRun(harness, ALICE);

  const res = await fetch(`${harness.baseUrl}/api/runs/${runId}/cancel`, { method: "POST", headers: asPrincipal(ALICE) });

  assert.equal(res.status, 200);
});

test("ownership outlives the run — a finished run is still readable, so it must still be guarded", async (t) => {
  const harness = await bootDaemonRoutes();
  t.after(harness.close);
  const runId = await startRun(harness, ALICE);
  await harness.lifecycle.finish({ runId, status: "succeeded", code: 0, signal: null, resumable: false });

  const owner = await fetch(`${harness.baseUrl}/api/runs/${runId}`, { headers: asPrincipal(ALICE) });
  const stranger = await fetch(`${harness.baseUrl}/api/runs/${runId}`, { headers: asPrincipal(BOB) });

  assert.equal(owner.status, 200);
  assert.equal(stranger.status, 404, "the delegated-tool map is cleared on terminal; the ownership record must not be");
});

test("run-scoped routes fail closed when no principal is asserted", async (t) => {
  const harness = await bootDaemonRoutes();
  t.after(harness.close);
  const runId = await startRun(harness, ALICE);

  const status = await fetch(`${harness.baseUrl}/api/runs/${runId}`);
  const events = await fetch(`${harness.baseUrl}/api/runs/${runId}/events`);
  const cancel = await fetch(`${harness.baseUrl}/api/runs/${runId}/cancel`, { method: "POST" });
  const list = await fetch(`${harness.baseUrl}/api/runs`);

  for (const res of [status, events, cancel, list]) {
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, "UNAUTHENTICATED");
  }
  assert.equal((await harness.lifecycle.get(runId))?.state, "running", "the unauthenticated cancel must not have landed");
});

test("GET /api/runs lists only the caller's own runs, not every run on the daemon", async (t) => {
  const harness = await bootDaemonRoutes();
  t.after(harness.close);
  const aliceRun = await startRun(harness, ALICE);
  const bobRun = await startRun(harness, BOB);

  const res = await fetch(`${harness.baseUrl}/api/runs`, { headers: asPrincipal(ALICE) });

  assert.equal(res.status, 200);
  const { runs } = (await res.json()) as { runs: { id: string }[] };
  assert.deepEqual(
    runs.map((run) => run.id),
    [aliceRun],
    "enumerating other principals' run ids is what turns an unguessable id into a targetable one"
  );
  assert.equal(runs.some((run) => run.id === bobRun), false);
});

test("the ?contextRef= filter still applies, and stays owner-scoped underneath it", async (t) => {
  const harness = await bootDaemonRoutes();
  t.after(harness.close);
  await startRun(harness, ALICE, "first");
  const second = await startRun(harness, ALICE, "second");
  // Byte-identical contextRef, different principal — the filter alone would return both.
  const bobContextRef = contextRefFor(BOB, "second");
  await fetch(`${harness.baseUrl}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json", ...asPrincipal(BOB) },
    body: JSON.stringify({ contextRef: bobContextRef }),
  });

  const res = await fetch(
    `${harness.baseUrl}/api/runs?contextRef=${encodeURIComponent(contextRefFor(ALICE, "second"))}`,
    { headers: asPrincipal(ALICE) }
  );

  const { runs } = (await res.json()) as { runs: { id: string }[] };
  assert.deepEqual(
    runs.map((run) => run.id),
    [second]
  );
});
