import assert from "node:assert/strict";
import test from "node:test";
import { confirmationFixture } from "./visitor-confirmations.fixture.js";

for (const allow of [true, false]) test(`only a single live ID can deliver allow=${allow}`, async () => {
  const f = confirmationFixture();
  const waiting = f.confirmations.request(f.request);
  const challengeId = f.directives[0].challengeId;
  assert.equal(await f.confirmations.confirm({ challengeId: "forged", allow: true }), false);
  assert.equal(f.exchanges.size(), 1);
  assert.equal(await f.confirmations.confirm({ challengeId, allow }), true);
  assert.equal(await f.confirmations.confirm({ challengeId, allow: true }), false);
  assert.equal(await waiting, allow);
  assert.equal(f.exchanges.size(), 0);
  assert.equal(f.jobs.size, 0);
});

test("60-second expiry and disconnect deny, close and dispose every timer", async () => {
  for (const end of ["timeout", "disconnect"] as const) {
    const f = confirmationFixture();
    const waiting = f.confirmations.request(f.request);
    if (end === "timeout") { f.advance(59_999); assert.equal(f.exchanges.size(), 1); f.advance(1); }
    else f.abort.abort();
    assert.equal(await waiting, false);
    assert.equal(await f.confirmations.confirm({ challengeId: f.directives[0].challengeId, allow: true }), false);
    assert.equal(f.exchanges.size(), 0);
    assert.equal(f.jobs.size, 0);
  }
});

test("changed plan, validation error, expiry during validation and simultaneous replay never allow", async () => {
  for (const reason of ["changed", "error", "expires"] as const) {
    const f = confirmationFixture();
    const waiting = f.confirmations.request({ ...f.request, validate: async () => {
      if (reason === "error") throw new Error("storage failed");
      if (reason === "expires") f.advance(60_000);
      return reason !== "changed";
    } });
    const challengeId = f.directives[0].challengeId;
    const decision = f.confirmations.confirm({ challengeId, allow: true });
    assert.equal(await f.confirmations.confirm({ challengeId, allow: true }), false);
    if (reason === "error") await assert.rejects(decision, /storage failed/);
    else assert.equal(await decision, false);
    assert.equal(await waiting, false);
    assert.equal(f.jobs.size, 0);
  }
});

test("headless emission failure, pre-abort, one per turn and bounded site prompts fail closed", async () => {
  const failed = confirmationFixture();
  await assert.rejects(failed.confirmations.request({ ...failed.request, emit: () => { throw new Error("closed stream"); } }), /closed stream/);
  assert.equal(failed.exchanges.size(), 0);
  assert.equal(failed.jobs.size, 0);
  failed.abort.abort();
  assert.equal(await failed.confirmations.request(failed.request), false);
  const f = confirmationFixture();
  const turns = Array.from({ length: 20 }, (_, n) => f.confirmations.request({ ...f.request, binding: { ...f.request.binding, runId: `run-${n}`, ip: `ip-${n}` } }));
  assert.equal(f.directives.length, 20);
  assert.equal(await f.confirmations.request(f.request), false);
  f.abort.abort();
  assert.ok((await Promise.all(turns)).every(value => !value));
  const one = confirmationFixture();
  const waiting = one.confirmations.request(one.request);
  assert.equal(await one.confirmations.request(one.request), false);
  one.abort.abort();
  assert.equal(await waiting, false);
});

test("two pending prompts per IP leave capacity for other visitors and release slots on every terminal path", async () => {
  for (const end of ["timeout", "abort", "allow", "deny"] as const) {
    const f = confirmationFixture();
    let signal = end === "abort" ? f.abort.signal : undefined;
    const request = (runId: string, ip = "ip") => f.confirmations.request({ ...f.request,
      binding: { ...f.request.binding, runId, ip }, signal });
    const first = request("one"), second = request("two");
    assert.equal(await request("three"), false);
    const other = request("other", "another-ip");
    assert.equal(f.directives.length, 3, "another IP still gets a prompt");
    if (end === "timeout") f.advance(60_000);
    else if (end === "abort") f.abort.abort();
    else for (const { challengeId } of f.directives) {
      assert.equal(await f.confirmations.confirm({ challengeId, allow: end === "allow" }), true);
    }
    await Promise.all([first, second, other]);
    signal = undefined;
    const renewed = [request("four"), request("five")];
    assert.equal(f.directives.length, 5, "both slots on the original IP were released");
    assert.equal(await request("six"), false);
    f.advance(60_000);
    await Promise.all(renewed);
    assert.equal(f.exchanges.size(), 0);
    assert.equal(f.jobs.size, 0);
  }
});

test("an abort after the claim but before delivery is not accepted", async () => {
  const f = confirmationFixture();
  let validate!: (valid: boolean) => void;
  const validation = new Promise<boolean>(resolve => { validate = resolve; });
  const waiting = f.confirmations.request({ ...f.request, validate: () => validation });
  const decision = f.confirmations.confirm({ challengeId: f.directives[0].challengeId, allow: true });
  f.abort.abort();
  assert.equal(await waiting, false);
  validate(true);
  assert.equal(await decision, false);
  assert.equal(f.exchanges.size(), 0);
  assert.equal(f.jobs.size, 0);
});

test("claimed replies still count toward site capacity while validation is pending", async () => {
  const f = confirmationFixture();
  let validate!: (valid: boolean) => void;
  const validation = new Promise<boolean>(resolve => { validate = resolve; });
  const waiting = Array.from({ length: 20 }, (_, n) => f.confirmations.request({ ...f.request,
    binding: { ...f.request.binding, runId: `run-${n}`, ip: `ip-${n}` }, validate: () => validation }));
  const decisions = f.directives.map(({ challengeId }) => f.confirmations.confirm({ challengeId, allow: true }));
  assert.equal(await f.confirmations.request(f.request), false);
  assert.equal(f.exchanges.size(), 20);
  validate(true);
  assert.ok((await Promise.all(decisions)).every(Boolean));
  assert.ok((await Promise.all(waiting)).every(Boolean));
  assert.equal(f.exchanges.size(), 0);
  assert.equal(f.jobs.size, 0);
});

test("two visitors remain independent and a restarted process refuses every old ID", async () => {
  const f = confirmationFixture();
  const first = f.confirmations.request(f.request);
  const second = f.confirmations.request({ ...f.request, binding: { ...f.request.binding, runId: "another-turn", executionId: "another-execution" } });
  const [a, b] = f.directives;
  assert.notEqual(a.challengeId, b.challengeId);
  assert.equal(await confirmationFixture().confirmations.confirm({ challengeId: a.challengeId, allow: true }), false);
  assert.equal(await f.confirmations.confirm({ challengeId: b.challengeId, allow: false }), true);
  assert.equal(await second, false);
  assert.equal(f.exchanges.size(), 1);
  assert.equal(await f.confirmations.confirm({ challengeId: a.challengeId, allow: true }), true);
  assert.equal(await first, true);
});
