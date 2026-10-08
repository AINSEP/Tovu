import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmission } from "@jini-ai/core";

import {
  DEFAULT_SURFACE_IDLE_TTL_MS,
  DEFAULT_SURFACE_MAX_LIFETIME_MS,
  askOnce,
  askThenReport,
  SURFACE_TYPED_ANSWER_PARAM,
  classifyConfirmationAnswer,
  createSurfaceExchangeStore,
  resolveConfirmationDecision,
} from "@jini-ai/daemon/surface-exchanges";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


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
 * These deliberately exercise a different property from the former token-store tests. An exchange id is a
 * correlation handle, not a secret, so nothing here concerns hashing, constant-time comparison, or
 * probing resistance — asserting those would imply a security property this handle does not carry.
 * pending-confirmations.test.ts (apps/website/src/assistant/__tests__/pending-confirmations.test.ts) was deleted 2026-10-03: unused; see development/DELETED-CODE.md.
 */

/** Records what a handler sent, standing in for the daemon's run event stream. */
function recordingEmitter() {
  const sent: SurfaceEmission[] = [];
  return { sent, emit: async (emission: SurfaceEmission) => void sent.push(emission) };
}

const FORM: SurfaceEmission = { channel: "mcp-ui", payload: { resource: { type: "resource" } } };

test("a message reaches the exchange it names, carrying the human's params to the waiting call", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });

  const waiting = exchange.receive({});
  const delivered = store.deliver({ exchangeId: exchange.id, principalId: "p", params: { plan: "pro", extras: ["a"] } }, { toolId: "t" });

  assert.deepEqual(delivered, { ok: true });
  assert.deepEqual(await waiting, { status: "received", params: { plan: "pro", extras: ["a"] } });
});

test("receive() does not settle before a message arrives", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });

  // The whole design rests on this: the agent's call stays open. A receive that resolved eagerly
  // would hand the model an empty answer and look exactly like the bug this replaces.
  const settled = await Promise.race([exchange.receive({}), Promise.resolve("still-waiting" as const)]);
  assert.equal(settled, "still-waiting");
});

test("BUFFER: a message delivered before anyone is listening is queued, not dropped", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });

  // The human answers while the handler is still composing its next send. With no buffer this
  // message is lost and the following receive() hangs until the deadline — a deadlock on an answer
  // that was actually given.
  store.deliver({ exchangeId: exchange.id, principalId: "p", params: { plan: "pro" } }, { toolId: "t" });

  assert.deepEqual(await exchange.receive({}), { status: "received", params: { plan: "pro" } });
});

test("BUFFER: several early messages are replayed in arrival order, one per receive", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });

  store.deliver({ exchangeId: exchange.id, principalId: "p", params: { n: 1 } }, { toolId: "t" });
  store.deliver({ exchangeId: exchange.id, principalId: "p", params: { n: 2 } }, { toolId: "t" });

  assert.deepEqual(await exchange.receive({}), { status: "received", params: { n: 1 } });
  assert.deepEqual(await exchange.receive({}), { status: "received", params: { n: 2 } });
  assert.equal(
    await Promise.race([exchange.receive({}), Promise.resolve("drained" as const)]),
    "drained",
    "the queue is drained, not replayed"
  );
});

test("MULTI-TURN: send/receive can alternate any number of times on one call", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const { sent, emit } = recordingEmitter();
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit });

  const answers: unknown[] = [];
  const conversation = (async () => {
    for (let turn = 0; turn < 3; turn += 1) {
      await exchange.send({ emission: { channel: "a2ui", payload: { message: { updateComponents: { turn } } } } });
      const message = await exchange.receive({});
      answers.push(message.status === "received" ? message.params : message.status);
    }
    exchange.close({});
  })();

  // Drive the human's side: one answer per turn, awaiting a tick so the handler sends first.
  for (let turn = 0; turn < 3; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    store.deliver({ exchangeId: exchange.id, principalId: "p", params: { turn } }, { toolId: "t" });
  }
  await conversation;

  // This is the shape a one-shot park cannot express, and the reason A2UI's `createSurface` ->
  // action -> `updateComponents` loop is reachable from a tool call at all.
  assert.equal(sent.length, 3);
  assert.deepEqual(answers, [{ turn: 0 }, { turn: 1 }, { turn: 2 }]);
});

test("a message for the wrong tool is refused AND leaves the exchange open", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });

  const wrongTool = store.deliver({ exchangeId: exchange.id, principalId: "p", params: { plan: "pro" } }, { toolId: "other" });
  assert.deepEqual(wrongTool, { ok: false, reason: "binding-mismatch" });

  // The load-bearing half: consuming the exchange on a mismatch would let a wrong-binding post
  // disrupt a conversation the right human is still having.
  assert.equal(store.size(), 1);
  store.deliver({ exchangeId: exchange.id, principalId: "p", params: { plan: "pro" } }, { toolId: "t" });
  assert.deepEqual(await exchange.receive({}), { status: "received", params: { plan: "pro" } });
});

test("a message for the wrong principal is refused — one human's answer cannot land in another's call", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "t", principalId: "alice" }, emit: recordingEmitter().emit });

  assert.deepEqual(
    store.deliver({ exchangeId: exchange.id, principalId: "mallory", params: { plan: "pro" } }, { toolId: "t" }),
    { ok: false, reason: "binding-mismatch" }
  );
  assert.equal(store.size(), 1);

  store.deliver({ exchangeId: exchange.id, principalId: "alice", params: { plan: "basic" } }, { toolId: "t" });
  assert.deepEqual(await exchange.receive({}), { status: "received", params: { plan: "basic" } });
});

test("an unknown or closed exchange id is refused rather than silently accepted", () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });
  exchange.close({});

  assert.deepEqual(store.deliver({ exchangeId: exchange.id, principalId: "p", params: {} }, { toolId: "t" }), {
    ok: false,
    reason: "unknown-or-closed",
  });
  assert.deepEqual(store.deliver({ exchangeId: "never-opened", principalId: "p", params: {} }, { toolId: "t" }), {
    ok: false,
    reason: "unknown-or-closed",
  });
});

test("a channel with no toolId to offer (e.g. A2UI, correlating by its own surfaceId) can still deliver by exchangeId + principalId alone", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "assistant_demo_a2ui", principalId: "p" }, emit: recordingEmitter().emit });

  const delivered = store.deliver({ exchangeId: exchange.id, principalId: "p", params: { message: { action: {} } } });

  assert.deepEqual(delivered, { ok: true });
  assert.deepEqual(await exchange.receive({}), { status: "received", params: { message: { action: {} } } });
});

for (const channel of ["a2ui", "mcp-ui"] as const) {
  test(`${channel}: the other answer channel cannot consume its exchange`, async () => {
    const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
    const exchange = store.open({ binding: { toolId: "t", principalId: "p", channel }, emit: recordingEmitter().emit });
    const pending = exchange.receive({});
    const other = channel === "a2ui" ? "mcp-ui" : "a2ui";
    assert.deepEqual(store.deliver({ exchangeId: exchange.id, principalId: "p", params: { wrong: true } }, { channel: other }), { ok: false, reason: "binding-mismatch" });
    assert.equal(store.size(), 1);
    assert.equal(await Promise.race([pending, Promise.resolve("waiting")]), "waiting");
    assert.deepEqual(store.deliver({ exchangeId: exchange.id, principalId: "p", params: { answer: "right" } }, { channel }), { ok: true });
    assert.deepEqual(await pending, { status: "received", params: { answer: "right" } });
    exchange.close({});
  });
}

test("omitting toolId does not relax the principal check — it is still the wrong human's answer", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "assistant_demo_a2ui", principalId: "alice" }, emit: recordingEmitter().emit });

  const delivered = store.deliver({ exchangeId: exchange.id, principalId: "mallory", params: {} });

  assert.deepEqual(delivered, { ok: false, reason: "binding-mismatch" });
  assert.equal(store.size(), 1, "a mismatched delivery must not consume alice's still-open exchange");
});

test("a supplied toolId is still checked exactly, even though it is now optional to supply at all", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "assistant_demo_a2ui", principalId: "p" }, emit: recordingEmitter().emit });

  const delivered = store.deliver({ exchangeId: exchange.id, principalId: "p", params: {} }, { toolId: "some_other_tool" });

  assert.deepEqual(delivered, { ok: false, reason: "binding-mismatch" });
});

test("two concurrent exchanges settle independently, each with its own messages", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const a = store.open({ binding: { toolId: "t", principalId: "alice" }, emit: recordingEmitter().emit });
  const b = store.open({ binding: { toolId: "t", principalId: "bob" }, emit: recordingEmitter().emit });

  assert.notEqual(a.id, b.id, "ids must not collide or one human answers for both");
  store.deliver({ exchangeId: b.id, principalId: "bob", params: { plan: "team" } }, { toolId: "t" });

  assert.deepEqual(await b.receive({}), { status: "received", params: { plan: "team" } });
  assert.equal(await Promise.race([a.receive({}), Promise.resolve("still-waiting" as const)]), "still-waiting");
});

test("a waiting receive is released when the exchange expires, rather than hanging", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }, { idleTtlMs: 1 });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });

  // Resolves, never rejects: the handler must be able to return a result the model can read, which
  // is why ADR-055 Decision 6 specifies this path instead of leaving it to a throw.
  assert.deepEqual(await exchange.receive({}), { status: "expired" });
  assert.equal(store.size(), 0);
});

test("receive() after the exchange ended reports the terminal status instead of parking", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });
  exchange.close({});

  // What makes `while (…) await receive()` a terminating loop rather than one that waits out the
  // transport deadline on its second pass.
  assert.deepEqual(await exchange.receive({}), { status: "abandoned" });
});

test("the idle deadline resets on activity, so a slow conversation is not punished for its length", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }, { idleTtlMs: 300, maxLifetimeMs: 2000 });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });
  // Each gap is below 300 ms, but 600 ms total exceeds the original idle deadline.
  for (let turn = 0; turn < 3; turn += 1) {
    t.mock.timers.tick(200);
    assert.deepEqual(store.deliver({ exchangeId: exchange.id, principalId: "p", params: { turn } }, { toolId: "t" }), { ok: true });
    assert.deepEqual(await exchange.receive({}), { status: "received", params: { turn } });
  }
  assert.equal(store.size(), 1);
  const pending = exchange.receive({});
  t.mock.timers.tick(299);
  assert.equal(await Promise.race([pending, Promise.resolve("waiting")]), "waiting");
  t.mock.timers.tick(1);
  assert.deepEqual(await pending, { status: "expired" });
  assert.equal(store.size(), 0);
});

test("the total-lifetime ceiling ends an exchange that stays busy forever", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  // Idle cannot explain expiration at 260 ms, even without any activity.
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }, { idleTtlMs: 1000, maxLifetimeMs: 260 });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });
  for (let turn = 0; turn < 3; turn += 1) {
    t.mock.timers.tick(80);
    assert.deepEqual(store.deliver({ exchangeId: exchange.id, principalId: "p", params: { turn } }, { toolId: "t" }), { ok: true });
    assert.deepEqual(await exchange.receive({}), { status: "received", params: { turn } });
  }
  const pending = exchange.receive({});
  t.mock.timers.tick(19);
  assert.equal(store.size(), 1);
  assert.equal(await Promise.race([pending, Promise.resolve("waiting")]), "waiting");
  t.mock.timers.tick(1);
  assert.deepEqual(await pending, { status: "expired" });
  assert.equal(store.size(), 0);
});

test("expiresAtMs is the earlier of the idle and lifetime deadlines, and moves with activity", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let now = 10_000;
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: { nowMs: () => now }, idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }, { idleTtlMs: 300, maxLifetimeMs: 500 });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });
  // Opening arms the idle deadline, which comes first.
  assert.equal(exchange.expiresAtMs(), 10_300);
  now += 200;
  t.mock.timers.tick(200);
  await exchange.send({ emission: { channel: "mcp-ui", payload: {} } });
  // Sending re-arms idle to 10_500; the lifetime ceiling is also 10_500.
  assert.equal(exchange.expiresAtMs(), 10_500);
  now += 100;
  t.mock.timers.tick(100);
  assert.deepEqual(store.deliver({ exchangeId: exchange.id, principalId: "p", params: {} }, { toolId: "t" }), { ok: true });
  // Idle moved to 10_600, but the lifetime ceiling still ends it at 10_500.
  assert.equal(exchange.expiresAtMs(), 10_500);
  exchange.close({});
});

test("send() after the exchange ended is refused, matching the daemon emitter's own posture", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });
  exchange.close({});

  await assert.rejects(() => exchange.send({ emission: FORM }), /already ended/);
});

test("close() is idempotent, because a cancelled run races a human who just clicked", () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });

  exchange.close({});
  exchange.close({});
  assert.equal(store.size(), 0);
});

test("askOnce sends once, waits once, and closes — the one-shot case as the shortest exchange", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const { sent, emit } = recordingEmitter();
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit });

  const asked = askOnce({ exchange, emission: FORM });
  await new Promise((resolve) => setImmediate(resolve));
  store.deliver({ exchangeId: exchange.id, principalId: "p", params: { plan: "pro" } }, { toolId: "t" });

  assert.deepEqual(await asked, { status: "received", params: { plan: "pro" } });
  assert.deepEqual(sent, [FORM]);
  assert.equal(store.size(), 0, "askOnce closes, so a one-shot tool leaks nothing");
});

test("askOnce closes the exchange even when no answer ever comes", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }, { idleTtlMs: 1 });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });

  assert.deepEqual(await askOnce({ exchange, emission: FORM }), { status: "expired" });
  assert.equal(store.size(), 0);
});

const OUTCOME: SurfaceEmission = { channel: "mcp-ui", payload: { resource: { type: "resource-outcome" } } };

test("askThenReport: sends the confirmation, then sends handle's outcome AFTER the answer — the exact defect askOnce cannot fix, since askOnce closes before a caller could send anything else", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const { sent, emit } = recordingEmitter();
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit });

  const asked = askThenReport({ exchange, confirmationEmission: FORM, handle: async (answer) => {
    assert.deepEqual(answer, { status: "received", params: { decision: "confirm" } });
    return { result: { published: true }, outcome: OUTCOME };
  } });
  await new Promise((resolve) => setImmediate(resolve));
  store.deliver({ exchangeId: exchange.id, principalId: "p", params: { decision: "confirm" } }, { toolId: "t" });

  assert.deepEqual(await asked, { published: true });
  // Both emissions reached the human, confirmation first — the sequence a real re-send-on-the-same-URI
  // replacement depends on.
  assert.deepEqual(sent, [FORM, OUTCOME]);
  assert.equal(store.size(), 0, "askThenReport closes once handle (and the outcome send) finish");
});

test("askThenReport: handle may omit outcome (e.g. a cancel) — no second send, exchange still closes", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const { sent, emit } = recordingEmitter();
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit });

  const asked = askThenReport({ exchange, confirmationEmission: FORM, handle: async () => ({ result: { published: false, cancelled: true } }) });
  await new Promise((resolve) => setImmediate(resolve));
  store.deliver({ exchangeId: exchange.id, principalId: "p", params: { decision: "cancel" } }, { toolId: "t" });

  assert.deepEqual(await asked, { published: false, cancelled: true });
  assert.deepEqual(sent, [FORM], "no outcome was supplied, so nothing beyond the confirmation was ever sent");
  assert.equal(store.size(), 0);
});

test("askThenReport: the model's result is unaffected even when the outcome send itself fails — the exchange having already ended is not a tool failure", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const { emit } = recordingEmitter();
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit });

  const asked = askThenReport({ exchange, confirmationEmission: FORM, handle: async () => {
    // Simulates the exchange ending out from under `handle` (a run abort, a teardown race) between
    // the answer arriving and the outcome being sent — `send()` on an ended exchange throws, per
    // `SurfaceExchange.send`'s own contract.
    exchange.close({});
    return { result: { published: true, reachable: true }, outcome: OUTCOME };
  } });
  await new Promise((resolve) => setImmediate(resolve));
  store.deliver({ exchangeId: exchange.id, principalId: "p", params: {} }, { toolId: "t" });

  // The REAL, true result must still come back — this is the whole point: a failed frame update must
  // never be reported to the model as a failed publish.
  assert.deepEqual(await asked, { published: true, reachable: true });
});

test("askThenReport: closes the exchange even when handle itself throws, matching askOnce's own finally-close discipline", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });

  const asked = askThenReport({ exchange, confirmationEmission: FORM, handle: async () => {
    throw new Error("real work blew up");
  } });
  await new Promise((resolve) => setImmediate(resolve));
  store.deliver({ exchangeId: exchange.id, principalId: "p", params: {} }, { toolId: "t" });

  await assert.rejects(asked, /real work blew up/);
  assert.equal(store.size(), 0, "a throwing handle must not leak the exchange");
});

test("askThenReport: an answer that never arrives (expired) still reaches handle, which can report a no-op result with no outcome to send", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }, { idleTtlMs: 1 });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });

  const result = await askThenReport({ exchange, confirmationEmission: FORM, handle: async (answer) => {
    assert.deepEqual(answer, { status: "expired" });
    return { result: { published: false, reason: "expired" } };
  } });
  assert.deepEqual(result, { published: false, reason: "expired" });
});

test("newExchangeId can be injected so caller controls generated exchange IDs", () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => "custom-id-123" }, defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });
  assert.equal(exchange.id, "custom-id-123");
  assert.equal(store.size(), 1);
});

// ---------------------------------------------------------------------------
// classifyConfirmationAnswer / resolveConfirmationDecision — the shared fail-closed
// confirm/cancel classification extracted from `content_post_delete` and its 3 forks (see this
// module's own doc on `ConfirmationOutcome`).
// ---------------------------------------------------------------------------

test("classifyConfirmationAnswer: an explicit decision:'confirm' is confirmed", () => {
  assert.deepEqual(classifyConfirmationAnswer({ answer: { status: "received", params: { decision: "confirm" } } }), { confirmed: true });
});

test("classifyConfirmationAnswer: a missing 'decision' field is declined, not confirmed — fail closed", () => {
  assert.deepEqual(classifyConfirmationAnswer({ answer: { status: "received", params: {} } }), { confirmed: false, reason: "declined" });
});

test("classifyConfirmationAnswer: a non-string 'decision' is declined, not confirmed — fail closed", () => {
  assert.deepEqual(classifyConfirmationAnswer({ answer: { status: "received", params: { decision: true } } }), {
    confirmed: false,
    reason: "declined",
  });
});

/**
 * The security boundary on {@link SURFACE_TYPED_ANSWER_PARAM}: it unblocks a QUESTION, never a
 * CONFIRMATION. A human who types "yes do it" into the chat composer while a delete/publish/
 * credential-save dialog is outstanding must not thereby consent to it — consent for an
 * externally-visible action comes from clicking the button on the surface that names what is about
 * to happen, and nothing else. This passes today only because `classifyConfirmationAnswer` reads a
 * literal `decision: "confirm"` and ignores everything else; pinning it means any future attempt to
 * add a prose-to-consent mapping has to delete this test on purpose.
 */
test("classifyConfirmationAnswer: a typed chat answer never confirms — even when the words say yes", () => {
  assert.deepEqual(
    classifyConfirmationAnswer({ answer: { status: "received", params: { [SURFACE_TYPED_ANSWER_PARAM]: "yes do it" } } }),
    { confirmed: false, reason: "declined" },
  );
});

test("classifyConfirmationAnswer: an unrecognised 'decision' string is declined, not confirmed", () => {
  assert.deepEqual(classifyConfirmationAnswer({ answer: { status: "received", params: { decision: "yes" } } }), {
    confirmed: false,
    reason: "declined",
  });
});

test("classifyConfirmationAnswer: an explicit cancel is declined", () => {
  assert.deepEqual(classifyConfirmationAnswer({ answer: { status: "received", params: { decision: "cancel" } } }), {
    confirmed: false,
    reason: "declined",
  });
});

test("classifyConfirmationAnswer: expired/abandoned pass their status through as the reason", () => {
  assert.deepEqual(classifyConfirmationAnswer({ answer: { status: "expired" } }), { confirmed: false, reason: "expired" });
  assert.deepEqual(classifyConfirmationAnswer({ answer: { status: "abandoned" } }), { confirmed: false, reason: "abandoned" });
});

test("resolveConfirmationDecision: asks once, then classifies the answer, and closes the exchange either way", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });

  const asked = resolveConfirmationDecision({ exchange, emission: FORM });
  await new Promise((resolve) => setImmediate(resolve));
  store.deliver({ exchangeId: exchange.id, principalId: "p", params: { decision: "confirm" } }, { toolId: "t" });

  assert.deepEqual(await asked, { confirmed: true });
  assert.equal(store.size(), 0, "askOnce's own close-on-settle discipline must still apply");
});

test("resolveConfirmationDecision: a declined answer classifies as declined, same as a direct classifyConfirmationAnswer call", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit });

  const asked = resolveConfirmationDecision({ exchange, emission: FORM });
  await new Promise((resolve) => setImmediate(resolve));
  store.deliver({ exchangeId: exchange.id, principalId: "p", params: {} }, { toolId: "t" });

  assert.deepEqual(await asked, { confirmed: false, reason: "declined" });
});

test("the deadlines are ordered so the exchange, not the transport, gives up first", () => {
  // `@jini-ai/mcp`'s delegated-tool request deadline is 6 minutes. If the total lifetime ever
  // exceeded it, a stalled exchange would surface as a transport timeout instead of an explicit
  // result the model can read — and the model would lose the ability to say anything true about
  // what happened. The idle deadline sits below the total for the same reason.
  assert.ok(DEFAULT_SURFACE_IDLE_TTL_MS <= DEFAULT_SURFACE_MAX_LIFETIME_MS);
  assert.ok(DEFAULT_SURFACE_MAX_LIFETIME_MS < 6 * 60 * 1000);
});

/**
 * `findTypedAnswerTarget` is the correlation a TYPED answer has to borrow. A human typing into the
 * chat composer names no exchange — they do not know exchanges exist — so the store, which is the
 * only thing that knows what is open, resolves it from the principal and the tool instead. See
 * `SURFACE_TYPED_ANSWER_PARAM`'s own doc for why typed text needed a route in at all.
 */
test("findTypedAnswerTarget: resolves the one open exchange a typed answer could be meant for", () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "assistant_ask_choice", principalId: "p" }, emit: recordingEmitter().emit });

  assert.equal(store.findTypedAnswerTarget({ principalId: "p", toolId: "assistant_ask_choice" }), exchange.id);
});

test("findTypedAnswerTarget: another principal's open question is never a target", () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  store.open({ binding: { toolId: "assistant_ask_choice", principalId: "someone-else" }, emit: recordingEmitter().emit });

  assert.equal(store.findTypedAnswerTarget({ principalId: "p", toolId: "assistant_ask_choice" }), undefined);
});

test("findTypedAnswerTarget: an exchange opened by a different tool is never a target", () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  // A confirmation-shaped tool's exchange, open for the same human at the same moment. Typed prose
  // must not reach it — see `classifyConfirmationAnswer`'s own fail-closed test above for the
  // second, independent guard on the same property.
  store.open({ binding: { toolId: "content_post_delete", principalId: "p" }, emit: recordingEmitter().emit });

  assert.equal(store.findTypedAnswerTarget({ principalId: "p", toolId: "assistant_ask_choice" }), undefined);
});

test("findTypedAnswerTarget: refuses to guess when the same human has two questions outstanding", () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  store.open({ binding: { toolId: "assistant_ask_choice", principalId: "p" }, emit: recordingEmitter().emit });
  store.open({ binding: { toolId: "assistant_ask_choice", principalId: "p" }, emit: recordingEmitter().emit });

  // Fail closed, deliberately. Delivering to the wrong one would silently answer a question the
  // human was not looking at, and the tool would report their words as an answer to it. "Click the
  // form you mean" is a worse experience and a correct one.
  assert.equal(store.findTypedAnswerTarget({ principalId: "p", toolId: "assistant_ask_choice" }), undefined);
});

test("findTypedAnswerTarget: a closed exchange stops being a target", async () => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = store.open({ binding: { toolId: "assistant_ask_choice", principalId: "p" }, emit: recordingEmitter().emit });
  exchange.close({});

  assert.equal(store.findTypedAnswerTarget({ principalId: "p", toolId: "assistant_ask_choice" }), undefined);
});


test("default exchange ids are distinct UUIDv4 values while multiple exchanges remain pending", (t) => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchanges = Array.from({ length: 32 }, () => store.open({ binding: { toolId: "t", principalId: "p" }, emit: recordingEmitter().emit }));
  t.after(() => exchanges.forEach((exchange) => exchange.close({})));
  const ids = exchanges.map(({ id }) => id);
  assert.equal(new Set(ids).size, exchanges.length);
  assert.equal(store.size(), exchanges.length);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  for (let n = 0; n < 30; n++) {
    const guessed = `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
    assert.deepEqual(store.deliver({ exchangeId: guessed, principalId: "p", params: {} }, { toolId: "t" }), { ok: false, reason: "unknown-or-closed" });
  }
  assert.equal(store.size(), exchanges.length, "guesses must leave every real pending exchange intact");
});
