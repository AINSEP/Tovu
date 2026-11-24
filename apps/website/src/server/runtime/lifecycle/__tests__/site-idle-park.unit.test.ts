import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { Request, Response } from "express";
import { createSiteIdlePark } from "../site-idle-park.js";
import { SITE_SLEEP_EXIT_CODE } from "@tovu/contracts/daemon-exit-codes";

/**
 * @file The express adapter over `@jini-ai/server/shutdown/idle-park`: finish/close release once,
 * the fenced 503 copy, and the site sleep exit code. The park's own veto/fence/recheck logic is
 * covered in Jini's `idle-park.test.ts`.
 */

function fixture({ hasActiveRuns = async () => false, activeCount = () => 0, hasBackgroundWork = async () => false }: Partial<Pick<Parameters<typeof createSiteIdlePark>[0], 'hasActiveRuns' | 'activeCount' | 'hasBackgroundWork'>> = {}) {
  const stops: number[] = [];
  const park = createSiteIdlePark({ hasActiveRuns, activeCount, hasBackgroundWork, stop: ({ exitCode }) => { stops.push(exitCode); } });
  function request() {
    const response = Object.assign(new EventEmitter(), {
      writableFinished: false,
      status(code: number) { assert.equal(code, 503); return response; },
      json(_body: unknown) { return response; },
    });
    let entered = false;
    park.middleware({} as Request, response as unknown as Response, () => { entered = true; });
    return { response, entered };
  }
  return { park, stops, request };
}

test("queued/running rows, finalizer watches and every HTTP request independently veto sleep", async () => {
  for (const deps of [{ hasActiveRuns: async () => true }, { activeCount: () => 1 }]) {
    const f = fixture(deps);
    assert.deepEqual(await f.park.stopIfIdle({}, {}), { idle: false });
    assert.deepEqual(f.stops, []);
  }
  const f = fixture();
  const { response } = f.request();
  assert.deepEqual(await f.park.stopIfIdle(), { idle: false });
  response.emit('finish');
  assert.deepEqual(await f.park.stopIfIdle(), { idle: true });
  assert.deepEqual(f.stops, [SITE_SLEEP_EXIT_CODE]);
});

test("errors and concurrent probes are busy; fencing precedes shutdown and prevents new intake", async () => {
  const broken = fixture({ hasActiveRuns: async () => { throw new Error('unavailable'); } });
  assert.deepEqual(await broken.park.stopIfIdle(), { idle: false });
  assert.equal(broken.request().entered, true);
  let park!: ReturnType<typeof createSiteIdlePark>;
  const calls: number[] = [];
  park = createSiteIdlePark({ hasActiveRuns: async () => false, hasBackgroundWork: async () => false, activeCount: () => 0,
    stop: ({ exitCode }) => {
      const sent: Array<[number, unknown]> = [];
      let code = 0;
      const res = { status: (c: number) => { code = c; return res; }, json: (body: unknown) => { sent.push([code, body]); return res; } };
      park.middleware({} as Request, res as unknown as Response, () => assert.fail('fence must precede stop'));
      assert.deepEqual(sent, [[503, { error: "This site is restarting. Try again in a moment." }]]);
      calls.push(exitCode);
    },
  });
  const first = park.stopIfIdle();
  assert.deepEqual(await park.stopIfIdle(), { idle: false });
  assert.deepEqual(await first, { idle: true });
  assert.deepEqual(await park.stopIfIdle(), { idle: false });
  assert.deepEqual(calls, [SITE_SLEEP_EXIT_CODE]);
});


test("a failing watch probe or shutdown effect leaves intake open and returns busy", async () => {
  const watches = fixture({ activeCount: () => { throw new Error('unknown watches'); } });
  assert.deepEqual(await watches.park.stopIfIdle(), { idle: false });
  assert.equal(watches.request().entered, true);
  const park = createSiteIdlePark({ hasActiveRuns: async () => false, hasBackgroundWork: async () => false, activeCount: () => 0,
    stop: () => { throw new Error('shutdown unavailable'); },
  });
  assert.deepEqual(await park.stopIfIdle(), { idle: false });
  let accepted = false;
  const response = new EventEmitter() as Response;
  park.middleware({} as Request, response, () => { accepted = true; });
  assert.equal(accepted, true);
});

for (const label of ['aborted fetch', 'closed SSE stream']) {
  for (const first of ['close', 'finish']) {
    test(`${label} releases once on ${first}, even when both events fire`, async () => {
      const f = fixture();
      const a = f.request();
      const b = f.request();
      a.response.emit(first);
      a.response.emit(first === 'close' ? 'finish' : 'close');
      assert.deepEqual(await f.park.stopIfIdle(), { idle: false }, 'second request still holds intake');
      b.response.emit('close');
      assert.deepEqual(await f.park.stopIfIdle(), { idle: true }, 'close-only response releases');
      assert.deepEqual(f.stops, [SITE_SLEEP_EXIT_CODE]);
    });
  }
}
