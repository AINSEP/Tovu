import assert from "node:assert/strict";
import test from "node:test";

import { EgressRefusedError, type HttpClientPort } from "#src/platform/http/index";
import { createPlaywrightPageCapture } from "../playwright-page-capture.js";
import { PageCaptureError } from "../web-screenshot.js";
import { captureFixture, captureRequest, watch, type CaptureFixture, type StepTimes } from "./capture-deadlines-fixture.js";

/**
 * @file Pins how the adapter's deadlines behave TODAY (one 20 s number for every owner), on one virtual
 * clock. Where a later change moves a number, that commit edits the assertion it moves.
 */

const httpClient: HttpClientPort = {
  async send() { throw new EgressRefusedError({ message: "private" }, { callerSafeMessage: "refused" }); },
};

function capturing({ times }: { times?: StepTimes } = {}): CaptureFixture & { capture: ReturnType<typeof createPlaywrightPageCapture> } {
  const fixture = captureFixture({ ...(times ? { times } : {}) });
  const capture = createPlaywrightPageCapture({ httpClient }, { loadLauncher: async () => fixture.launcher, clock: fixture.clock, deadlineMs: 20_000 });
  return { ...fixture, capture };
}

test("a navigation that commits at 3 s and a requested wait of 18 s is a 'timeout' with no image", async t => {
  const fixture = capturing({ times: { goto: 3_000 } });
  t.after(() => fixture.capture.close());
  const run = watch(fixture.capture.capture(captureRequest({ settleMs: 18_000 })));
  await fixture.clock.advance(19_999);
  assert.equal(run.outcome(), undefined, "still waiting one millisecond before the deadline");
  await fixture.clock.advance(1);
  const outcome = run.outcome();
  assert.ok(outcome && "failure" in outcome && outcome.failure instanceof PageCaptureError);
  assert.equal(outcome.failure.kind, "timeout");
  assert.equal(outcome.failure.message, "exceeded 20000ms");
  assert.deepEqual(fixture.screenshots, []);
});

test("a full-page scroll that takes 19 s is a 'timeout' with no image", async t => {
  const fixture = capturing({ times: { scroll: 19_000 } });
  t.after(() => fixture.capture.close());
  const run = watch(fixture.capture.capture(captureRequest({ fullPage: true })));
  await fixture.clock.advance(20_000);
  const outcome = run.outcome();
  assert.ok(outcome && "failure" in outcome && outcome.failure instanceof PageCaptureError);
  assert.equal(outcome.failure.kind, "timeout");
  assert.equal(outcome.failure.message, "exceeded 20000ms");
  assert.deepEqual(fixture.screenshots, []);
  assert.ok(fixture.events.includes("scroll-start") && !fixture.events.includes("scroll-end"));
});

test("a stable-frame screenshot that never settles returns the current frame with the still-animating note", async t => {
  const fixture = capturing({ times: { screenshots: [{ timeout: 16_000 }, 1_000] } });
  t.after(() => fixture.capture.close());
  const run = watch(fixture.capture.capture(captureRequest({ settleMs: 0 })));
  await fixture.clock.advance(20_000);
  const outcome = run.outcome();
  assert.ok(outcome && "image" in outcome);
  assert.equal(outcome.image.png.toString(), "frame-1");
  assert.equal(outcome.image.note, "page was still animating near the 20 s deadline; captured the current frame (it may show a mid-animation state).");
  assert.deepEqual(fixture.screenshots.map(call => [call.at, call.timeout, call.animations]), [[0, 16_000, "disabled"], [16_000, 4_000, "allow"]]);
});

test("a navigation that never commits is a 'timeout' at 20 s and the whole browser is closed", async t => {
  const fixture = capturing({ times: { goto: "never" } });
  t.after(() => fixture.capture.close());
  const run = watch(fixture.capture.capture(captureRequest()));
  await fixture.clock.advance(19_999);
  assert.equal(run.outcome(), undefined);
  await fixture.clock.advance(1);
  const outcome = run.outcome();
  assert.ok(outcome && "failure" in outcome && outcome.failure instanceof PageCaptureError);
  assert.equal(outcome.failure.kind, "timeout");
  assert.ok(fixture.events.includes("context-close"));
  assert.ok(fixture.events.includes("browser-close"));
});

test("the outer race and the render's hard stop use the same number today", async t => {
  const fixture = capturing();
  t.after(() => fixture.capture.close());
  const run = watch(fixture.capture.capture(captureRequest()));
  await fixture.clock.advance(2_000);
  assert.ok(run.outcome() && "image" in run.outcome()!);
  assert.deepEqual(fixture.clock.deadlineSignals, [20_000], "the render's hard stop");
  assert.equal(fixture.clock.timeouts[0], 20_000, "the outer race arms its own timer before anything else runs");
});
