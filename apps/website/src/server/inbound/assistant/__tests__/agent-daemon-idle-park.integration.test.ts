import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Request, Response } from "express";
import { createInMemoryEventLog, createRunLifecycle } from "@jini-ai/daemon";
import { createDiskAttachmentStore } from "@jini-ai/daemon/http";
import { AGENT_DAEMON_EXIT_CODE } from "@tovu/contracts/daemon-exit-codes";
import { createAgentDaemonIdlePark, daemonIdleMs } from "../agent-daemon-idle-park.js";
import { captureDaemonRun } from "./helpers/daemon-source.js";

function harness(value = "1") {
  let now = 0; let exchanges = 0;
  const exitCodes: number[] = [];
  const jobs = new Set<{ at: number; run: () => void }>();
  const park = createAgentDaemonIdlePark({ isBusy: () => exchanges > 0, exit: ({ code }) => { exitCodes.push(code); } }, {
    env: { TOVU_AGENT_DAEMON_IDLE_MINUTES: value }, clock: { nowMs: () => now },
    scheduler: { schedule: ({ delayMs, callback }) => {
      const job = { at: now + delayMs, run: callback }; jobs.add(job); return () => { jobs.delete(job); };
    } },
  });
  park.start({}, {});
  function advance(ms: number) {
    const target = now + ms;
    for (;;) {
      const next = [...jobs].sort((a, b) => a.at - b.at)[0];
      if (!next || next.at > target) break;
      now = next.at; jobs.delete(next); next.run();
    }
    now = target;
  }
  function request(path: string, method = "GET", { headersSent = true, disconnectedWriter = false } = {}) {
    const chunks: string[] = []; let ended = false; let status = 200; let body: unknown;
    const emitter = new EventEmitter();
    const headers = new Map<string, string>();
    const res = Object.assign(emitter, {
      headersSent,
      setHeader(name: string, value: string) { headers.set(name.toLowerCase(), value); },
      write(chunk: string) {
        if (disconnectedWriter) throw new Error("stream write failed");
        if (ended) throw new Error("write after end");
        chunks.push(chunk); return true;
      },
      end() { ended = true; emitter.emit("finish"); emitter.emit("close"); },
      status(code: number) { status = code; return res; }, json(input: unknown) { body = input; res.end(); },
    });
    let admitted = false;
    park.middleware({ path, method } as Request, res as unknown as Response, () => { admitted = true; });
    return { headers, chunks, end: () => res.end(), ended: () => ended, status: () => status, body: () => body, admitted: () => admitted };
  }
  return { park, request, advance, exitCodes, exits: () => exitCodes.length, exchanges: (count: number) => { exchanges = count; } };
}

test("open passive streams do not prevent park", () => {
  const h = harness();
  const frontend = h.request("/api/frontend-sessions/stream");
  const replay = h.request("/api/runs/finished/events");
  h.advance(60_000);
  assert.equal(h.exits(), 1);
  assert.equal(frontend.ended(), true); assert.equal(replay.ended(), true);
  const refused = h.request("/api/runs", "POST");
  assert.equal(refused.status(), 503); assert.equal(refused.admitted(), false);
  assert.equal((refused.body() as { code: string }).code, "AGENT_DAEMON_PARKED");
});

test("run without conversationId prevents park", async () => {
  const h = harness();
  let finish!: () => void;
  const terminal = new Promise<void>(resolve => { finish = resolve; });
  await captureDaemonRun({}, { lifecycle: { waitForTerminal: () => terminal }, bindings: {
    idlePark: h.park, runOwners: { record() {}, forget() {} }, runCredentials: { revoke() {} },
    RUN_OWNER_RETENTION_MS: 1, attachmentStore: undefined,
  } });
  await new Promise<void>(resolve => setImmediate(resolve));
  h.advance(180_000); assert.equal(h.exits(), 0);
  finish(); await new Promise<void>(resolve => setImmediate(resolve));
  h.advance(59_999); assert.equal(h.exits(), 0);
  h.advance(1); assert.equal(h.exits(), 1);
});

test("delegated call approval upload and cleanup prevent premature park", () => {
  const h = harness();
  const delegated = h.request("/api/delegated-tool-calls", "POST");
  const upload = h.request("/api/attachments", "POST");
  const cleanup = h.park.hold({}, {});
  h.exchanges(1);
  h.advance(120_000); assert.equal(h.exits(), 0);
  delegated.end(); delegated.end(); upload.end();
  h.advance(120_000); assert.equal(h.exits(), 0);
  cleanup(); h.advance(120_000); assert.equal(h.exits(), 0);
  h.exchanges(0); h.advance(61_000); assert.equal(h.exits(), 1);
});

test("a terminal run stays busy until its retained attachment cleanup finishes", async () => {
  const h = harness();
  let finish!: () => void; let cleaned!: () => void;
  const terminal = new Promise<void>(resolve => { finish = resolve; });
  const cleanup = new Promise<void>(resolve => { cleaned = resolve; });
  await captureDaemonRun({}, { lifecycle: { waitForTerminal: () => terminal }, bindings: {
    idlePark: h.park, runOwners: { record() {}, forget() {} }, runCredentials: { revoke() {} },
    RUN_OWNER_RETENTION_MS: 1, attachmentStore: { cleanupRun: () => cleanup },
  } });
  finish(); await new Promise<void>(resolve => setImmediate(resolve));
  h.advance(180_000); assert.equal(h.exits(), 0);
  cleaned(); await new Promise<void>(resolve => setImmediate(resolve));
  h.advance(60_000); assert.equal(h.exits(), 1);
});

test("park sends a frame before closing streams", () => {
  const h = harness(); const stream = h.request("/api/frontend-sessions/stream");
  h.advance(60_000);
  assert.deepEqual(stream.chunks, ['event: parked\ndata: {"type":"parked"}\n\n']);
  assert.equal(stream.ended(), true);
});

test("an unwritable passive observer neither strands other streams nor accepts new work after park", () => {
  const h = harness();
  h.request("/api/runs/stale/events", "GET", { disconnectedWriter: true });
  const unsent = h.request("/api/frontend-sessions/stream", "GET", { headersSent: false });
  const live = h.request("/api/runs/live/events");
  h.advance(60_000);
  assert.deepEqual(h.exitCodes, [AGENT_DAEMON_EXIT_CODE.IDLE_PARK]);
  assert.equal(unsent.ended(), true);
  assert.deepEqual(unsent.chunks, []);
  assert.equal(live.ended(), true);
  assert.deepEqual(live.chunks, ['event: parked\ndata: {"type":"parked"}\n\n']);
  const refused = h.request("/api/attachments", "POST");
  assert.equal(refused.status(), 503);
  assert.equal(refused.admitted(), false);
  assert.deepEqual(refused.body(), { error: "the agent daemon is parked", code: "AGENT_DAEMON_PARKED" });
  assert.deepEqual(Object.fromEntries(refused.headers), {
    connection: "close", "x-tovu-daemon-parked": "1", "x-tovu-daemon-pid": String(process.pid),
  });
});

test("idle zero never parks", () => {
  const h = harness("0"); h.request("/api/frontend-sessions/stream");
  h.advance(24 * 60 * 60_000); assert.equal(h.exits(), 0);
});

test("graceful shutdown fences intake while allowing already accepted cleanup to finish", () => {
  const h = harness(); const release = h.park.hold({}, {});
  h.park.stop({}, {});
  assert.doesNotThrow(() => { h.park.hold({}, {})(); release(); });
  assert.equal(h.request("/api/runs", "POST").admitted(), false);
  h.advance(180_000); assert.equal(h.exits(), 0, "shutdown must not become a second park exit");
});

test("staged attachment survives park wake", async t => {
  const root = await mkdtemp(join(tmpdir(), "idle-park-attachments-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const create = () => createDiskAttachmentStore({ uploadDirectory: root }, { retainAcrossRestarts: true });
  const before = await create();
  const batch = await before.createBatchDirectory({ batchId: "composer-batch" });
  const path = join(batch, "draft.txt");
  await writeFile(path, "retained");
  const attachment = await before.register({ input: { batchId: "composer-batch", path, name: "draft.txt", kind: "file", size: 8, ownerId: "owner" } });
  const h = harness(); h.advance(60_000); assert.equal(h.exits(), 1);
  const after = await create();
  assert.equal((await after.listPendingForOwner({ ownerId: "owner" }))[0]?.ref, attachment.path);
});

test("mid-run reload reattaches and replays without parking the run", async () => {
  const h = harness(); const releaseRun = h.park.hold({}, {});
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "headless" }, { runId: "current" });
  await lifecycle.emit({ runId: run.id, input: { event: "stdout", data: { chunk: "answer before reload" } } });
  h.request("/api/runs/current/events").end();
  h.advance(120_000); assert.equal(h.exits(), 0);
  assert.equal(h.request("/api/runs/current/events").admitted(), true);
  const replayed: string[] = [];
  const replay = await lifecycle.stream({ runId: run.id, onEvent: event => { if (event.kind === "stdout") replayed.push(event.payload.chunk); } });
  assert.deepEqual(replayed, ["answer before reload"]);
  if (replay.kind === "ok") replay.unsubscribe();
  h.advance(120_000); assert.equal(h.exits(), 0);
  await lifecycle.finish({ runId: run.id, status: "succeeded", code: 0, signal: null, resumable: false });
  releaseRun(); h.advance(60_000); assert.equal(h.exits(), 1);
});

test("default idle is fifteen minutes and invalid input warns without logging its value", () => {
  const warnings: string[] = [];
  assert.equal(daemonIdleMs({ value: undefined }, {}), 900_000);
  for (const value of ["", " ", "invalid-secret", "-1", "Infinity", "1e100"]) {
    assert.equal(daemonIdleMs({ value }, { warn: message => { warnings.push(message); } }), 900_000);
  }
  assert.equal(warnings.length, 6);
  assert.ok(warnings.every(message => !message.includes("invalid-secret")));
});
