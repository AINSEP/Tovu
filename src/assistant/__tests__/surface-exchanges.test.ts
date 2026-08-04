import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmission } from "@jini-ai/core";

import {
  DEFAULT_SURFACE_IDLE_TTL_MS,
  DEFAULT_SURFACE_MAX_LIFETIME_MS,
  askOnce,
  createSurfaceExchangeStore,
} from "../surface-exchanges";

/**
 * @file Tests for the surface exchange — a two-way, multi-message conversation with a human held
 * open inside one agent tool call (ADR-055 Decision 1, generalized).
 *
 * Two properties carry most of the weight:
 *
 * 1. **The inbound buffer.** A message arriving while the handler is between `receive()` calls must
 *    queue, not vanish. Dropping it deadlocks the exchange on an answer the human already gave — the
 *    one failure that is genuinely painful to retrofit, so it is tested before any multi-turn channel
 *    is wired to need it.
 * 2. **A message reaches at most one waiting receive, on an exchange opened by the same tool for the
 *    same principal.** That is the whole correctness contract.
 *
 * These are deliberately NOT the tests `pending-confirmations.test.ts` runs. An exchange id is a
 * correlation handle, not a secret, so nothing here concerns hashing, constant-time comparison, or
 * probing resistance — asserting those would imply a security property this handle does not carry.
 */

/** Records what a handler sent, standing in for the daemon's run event stream. */
function recordingEmitter() {
  const sent: SurfaceEmission[] = [];
  return { sent, emit: async (emission: SurfaceEmission) => void sent.push(emission) };
}

const FORM: SurfaceEmission = { channel: "mcp-ui", payload: { resource: { type: "resource" } } };

test("a message reaches the exchange it names, carrying the human's params to the waiting call", async () => {
  const store = createSurfaceExchangeStore();
  const exchange = store.open({ toolId: "t", principalId: "p" }, recordingEmitter().emit);

  const waiting = exchange.receive();
  const delivered = store.deliver({
    exchangeId: exchange.id,
    toolId: "t",
    principalId: "p",
    params: { plan: "pro", extras: ["a"] },
  });

  assert.deepEqual(delivered, { ok: true });
  assert.deepEqual(await waiting, { status: "received", params: { plan: "pro", extras: ["a"] } });
});

test("receive() does not settle before a message arrives", async () => {
  const store = createSurfaceExchangeStore();
  const exchange = store.open({ toolId: "t", principalId: "p" }, recordingEmitter().emit);

  // The whole design rests on this: the agent's call stays open. A receive that resolved eagerly
  // would hand the model an empty answer and look exactly like the bug this replaces.
  const settled = await Promise.race([exchange.receive(), Promise.resolve("still-waiting" as const)]);
  assert.equal(settled, "still-waiting");
});

test("BUFFER: a message delivered before anyone is listening is queued, not dropped", async () => {
  const store = createSurfaceExchangeStore();
  const exchange = store.open({ toolId: "t", principalId: "p" }, recordingEmitter().emit);

  // The human answers while the handler is still composing its next send. With no buffer this
  // message is lost and the following receive() hangs until the deadline — a deadlock on an answer
  // that was actually given.
  store.deliver({ exchangeId: exchange.id, toolId: "t", principalId: "p", params: { plan: "pro" } });

  assert.deepEqual(await exchange.receive(), { status: "received", params: { plan: "pro" } });
});

test("BUFFER: several early messages are replayed in arrival order, one per receive", async () => {
  const store = createSurfaceExchangeStore();
  const exchange = store.open({ toolId: "t", principalId: "p" }, recordingEmitter().emit);

  store.deliver({ exchangeId: exchange.id, toolId: "t", principalId: "p", params: { n: 1 } });
  store.deliver({ exchangeId: exchange.id, toolId: "t", principalId: "p", params: { n: 2 } });

  assert.deepEqual(await exchange.receive(), { status: "received", params: { n: 1 } });
  assert.deepEqual(await exchange.receive(), { status: "received", params: { n: 2 } });
  assert.equal(
    await Promise.race([exchange.receive(), Promise.resolve("drained" as const)]),
    "drained",
    "the queue is drained, not replayed"
  );
});

test("MULTI-TURN: send/receive can alternate any number of times on one call", async () => {
  const store = createSurfaceExchangeStore();
  const { sent, emit } = recordingEmitter();
  const exchange = store.open({ toolId: "t", principalId: "p" }, emit);

  const answers: unknown[] = [];
  const conversation = (async () => {
    for (let turn = 0; turn < 3; turn += 1) {
      await exchange.send({ channel: "a2ui", payload: { message: { updateComponents: { turn } } } });
      const message = await exchange.receive();
      answers.push(message.status === "received" ? message.params : message.status);
    }
    exchange.close();
  })();

  // Drive the human's side: one answer per turn, awaiting a tick so the handler sends first.
  for (let turn = 0; turn < 3; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    store.deliver({ exchangeId: exchange.id, toolId: "t", principalId: "p", params: { turn } });
  }
  await conversation;

  // This is the shape a one-shot park cannot express, and the reason A2UI's `createSurface` ->
  // action -> `updateComponents` loop is reachable from a tool call at all.
  assert.equal(sent.length, 3);
  assert.deepEqual(answers, [{ turn: 0 }, { turn: 1 }, { turn: 2 }]);
});

test("a message for the wrong tool is refused AND leaves the exchange open", async () => {
  const store = createSurfaceExchangeStore();
  const exchange = store.open({ toolId: "t", principalId: "p" }, recordingEmitter().emit);

  const wrongTool = store.deliver({ exchangeId: exchange.id, toolId: "other", principalId: "p", params: { plan: "pro" } });
  assert.deepEqual(wrongTool, { ok: false, reason: "binding-mismatch" });

  // The load-bearing half: consuming the exchange on a mismatch would let a wrong-binding post
  // disrupt a conversation the right human is still having.
  assert.equal(store.size(), 1);
  store.deliver({ exchangeId: exchange.id, toolId: "t", principalId: "p", params: { plan: "pro" } });
  assert.deepEqual(await exchange.receive(), { status: "received", params: { plan: "pro" } });
});

test("a message for the wrong principal is refused — one human's answer cannot land in another's call", async () => {
  const store = createSurfaceExchangeStore();
  const exchange = store.open({ toolId: "t", principalId: "alice" }, recordingEmitter().emit);

  assert.deepEqual(
    store.deliver({ exchangeId: exchange.id, toolId: "t", principalId: "mallory", params: { plan: "pro" } }),
    { ok: false, reason: "binding-mismatch" }
  );
  assert.equal(store.size(), 1);

  store.deliver({ exchangeId: exchange.id, toolId: "t", principalId: "alice", params: { plan: "basic" } });
  assert.deepEqual(await exchange.receive(), { status: "received", params: { plan: "basic" } });
});

test("an unknown or closed exchange id is refused rather than silently accepted", () => {
  const store = createSurfaceExchangeStore();
  const exchange = store.open({ toolId: "t", principalId: "p" }, recordingEmitter().emit);
  exchange.close();

  assert.deepEqual(store.deliver({ exchangeId: exchange.id, toolId: "t", principalId: "p", params: {} }), {
    ok: false,
    reason: "unknown-or-closed",
  });
  assert.deepEqual(store.deliver({ exchangeId: "never-opened", toolId: "t", principalId: "p", params: {} }), {
    ok: false,
    reason: "unknown-or-closed",
  });
});

test("two concurrent exchanges settle independently, each with its own messages", async () => {
  const store = createSurfaceExchangeStore();
  const a = store.open({ toolId: "t", principalId: "alice" }, recordingEmitter().emit);
  const b = store.open({ toolId: "t", principalId: "bob" }, recordingEmitter().emit);

  assert.notEqual(a.id, b.id, "ids must not collide or one human answers for both");
  store.deliver({ exchangeId: b.id, toolId: "t", principalId: "bob", params: { plan: "team" } });

  assert.deepEqual(await b.receive(), { status: "received", params: { plan: "team" } });
  assert.equal(await Promise.race([a.receive(), Promise.resolve("still-waiting" as const)]), "still-waiting");
});

test("a waiting receive is released when the exchange expires, rather than hanging", async () => {
  const store = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const exchange = store.open({ toolId: "t", principalId: "p" }, recordingEmitter().emit);

  // Resolves, never rejects: the handler must be able to return a result the model can read, which
  // is why ADR-055 Decision 6 specifies this path instead of leaving it to a throw.
  assert.deepEqual(await exchange.receive(), { status: "expired" });
  assert.equal(store.size(), 0);
});

test("receive() after the exchange ended reports the terminal status instead of parking", async () => {
  const store = createSurfaceExchangeStore();
  const exchange = store.open({ toolId: "t", principalId: "p" }, recordingEmitter().emit);
  exchange.close();

  // What makes `while (…) await receive()` a terminating loop rather than one that waits out the
  // transport deadline on its second pass.
  assert.deepEqual(await exchange.receive(), { status: "abandoned" });
});

test("the idle deadline resets on activity, so a slow conversation is not punished for its length", async () => {
  const store = createSurfaceExchangeStore({ idleTtlMs: 40 });
  const exchange = store.open({ toolId: "t", principalId: "p" }, recordingEmitter().emit);

  // Three turns, each inside the idle window but summing past it. A non-resetting deadline would
  // kill this exchange partway through purely for having taken several turns.
  for (let turn = 0; turn < 3; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    store.deliver({ exchangeId: exchange.id, toolId: "t", principalId: "p", params: { turn } });
    assert.deepEqual(await exchange.receive(), { status: "received", params: { turn } });
  }
  assert.equal(store.size(), 1);
});

test("the total-lifetime ceiling ends an exchange that stays busy forever", async () => {
  const store = createSurfaceExchangeStore({ idleTtlMs: 30, maxLifetimeMs: 45 });
  const exchange = store.open({ toolId: "t", principalId: "p" }, recordingEmitter().emit);

  // Activity alone must not hold the call open indefinitely: the call is an HTTP request from the
  // agent's MCP server, and the transport gives up whether or not we are still talking.
  const keepBusy = setInterval(() => {
    store.deliver({ exchangeId: exchange.id, toolId: "t", principalId: "p", params: {} });
  }, 10);
  try {
    let message = await exchange.receive();
    while (message.status === "received") message = await exchange.receive();
    assert.equal(message.status, "expired");
  } finally {
    clearInterval(keepBusy);
  }
});

test("send() after the exchange ended is refused, matching the daemon emitter's own posture", async () => {
  const store = createSurfaceExchangeStore();
  const exchange = store.open({ toolId: "t", principalId: "p" }, recordingEmitter().emit);
  exchange.close();

  await assert.rejects(() => exchange.send(FORM), /already ended/);
});

test("close() is idempotent, because a cancelled run races a human who just clicked", () => {
  const store = createSurfaceExchangeStore();
  const exchange = store.open({ toolId: "t", principalId: "p" }, recordingEmitter().emit);

  exchange.close();
  exchange.close();
  assert.equal(store.size(), 0);
});

test("askOnce sends once, waits once, and closes — the one-shot case as the shortest exchange", async () => {
  const store = createSurfaceExchangeStore();
  const { sent, emit } = recordingEmitter();
  const exchange = store.open({ toolId: "t", principalId: "p" }, emit);

  const asked = askOnce(exchange, FORM);
  await new Promise((resolve) => setImmediate(resolve));
  store.deliver({ exchangeId: exchange.id, toolId: "t", principalId: "p", params: { plan: "pro" } });

  assert.deepEqual(await asked, { status: "received", params: { plan: "pro" } });
  assert.deepEqual(sent, [FORM]);
  assert.equal(store.size(), 0, "askOnce closes, so a one-shot tool leaks nothing");
});

test("askOnce closes the exchange even when no answer ever comes", async () => {
  const store = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const exchange = store.open({ toolId: "t", principalId: "p" }, recordingEmitter().emit);

  assert.deepEqual(await askOnce(exchange, FORM), { status: "expired" });
  assert.equal(store.size(), 0);
});

test("the deadlines are ordered so the exchange, not the transport, gives up first", () => {
  // `@jini-ai/mcp`'s delegated-tool request deadline is 6 minutes. If the total lifetime ever
  // exceeded it, a stalled exchange would surface as a transport timeout instead of an explicit
  // result the model can read — and the model would lose the ability to say anything true about
  // what happened. The idle deadline sits below the total for the same reason.
  assert.ok(DEFAULT_SURFACE_IDLE_TTL_MS <= DEFAULT_SURFACE_MAX_LIFETIME_MS);
  assert.ok(DEFAULT_SURFACE_MAX_LIFETIME_MS < 6 * 60 * 1000);
});
