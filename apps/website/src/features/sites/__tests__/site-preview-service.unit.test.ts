import assert from "node:assert/strict";
import test from "node:test";

import { createSitePreviewService, type SitePreviewCapturePort, type SitePreviewTarget } from "../site-preview/site-preview-service.js";
import type { SitePreviewStore } from "../site-preview/site-preview-store.js";

/**
 * @file `site-preview-service.ts` — when a Sites card preview is captured. Fake store, browser,
 * clock and deferral; the drain runs only when the test flushes it, so "never on the request path"
 * is asserted directly.
 */

const T0 = Date.parse("2026-10-08T12:00:00.000Z");
const MIN = 60_000;
const SITES = [{ name: "alpha", createdAt: "2026-10-01T00:00:00.000Z" }, { name: "beta", createdAt: "2026-10-01T00:00:00.000Z" }];
const ALPHA: SitePreviewTarget = { name: "alpha", url: "https://localhost:3101/", lifecycle: "pid:10" };
const BETA: SitePreviewTarget = { name: "beta", url: "https://localhost:3102/", lifecycle: "pid:11" };

function fixture({ fail = new Set<string>(), versions = new Map<string, number>() } = {}) {
  let clock = T0;
  const deferred: Array<() => void> = [];
  const captured: string[] = [];
  let closes = 0;
  const store: SitePreviewStore = {
    version: ({ name }) => versions.get(name) ?? null,
    read: ({ name }) => (versions.has(name) ? Buffer.from(`img:${name}`) : null),
    write: ({ name }) => { versions.set(name, clock); return clock; },
  };
  const capture: SitePreviewCapturePort = {
    capture: async ({ url }) => { captured.push(url); return fail.has(url) ? null : Buffer.from("jpeg"); },
    close: async () => { closes += 1; },
  };
  const service = createSitePreviewService({ store, capture }, { now: () => clock, defer: (work) => { deferred.push(work); } });
  return {
    service, captured, versions,
    closes: () => closes,
    advance: (ms: number) => { clock += ms; },
    async flush() { while (deferred.length) deferred.shift()!(); await service.idle(); },
  };
}

test("versions returns immediately with no capture started, then one queued capture per due running site", async () => {
  const f = fixture();
  assert.deepEqual(f.service.versions({ sites: SITES, targets: [ALPHA, BETA] }), {});
  assert.deepEqual(f.captured, []);
  await f.flush();
  assert.deepEqual(f.captured, ["https://localhost:3101/", "https://localhost:3102/"]);
  assert.equal(f.closes(), 1);
  assert.deepEqual(f.service.versions({ sites: SITES, targets: [] }), { alpha: T0, beta: T0 });
});

test("repeated listings while a capture is queued or running do not queue it twice", async () => {
  const f = fixture();
  f.service.versions({ sites: SITES, targets: [ALPHA] });
  f.service.versions({ sites: SITES, targets: [ALPHA] });
  await f.flush();
  assert.deepEqual(f.captured, ["https://localhost:3101/"]);
});

test("once per lifecycle: the same run is not recaptured until refreshMs, a restart is recaptured at once", async () => {
  const f = fixture();
  f.service.versions({ sites: SITES, targets: [ALPHA] });
  await f.flush();
  f.advance(29 * MIN);
  f.service.versions({ sites: SITES, targets: [ALPHA] });
  await f.flush();
  assert.equal(f.captured.length, 1);
  f.service.versions({ sites: SITES, targets: [{ ...ALPHA, lifecycle: "pid:99" }] });
  await f.flush();
  assert.equal(f.captured.length, 2);
  f.advance(30 * MIN);
  f.service.versions({ sites: SITES, targets: [{ ...ALPHA, lifecycle: "pid:99" }] });
  await f.flush();
  assert.equal(f.captured.length, 3);
});

test("a failed capture is not retried for retryMs, then is retried", async () => {
  const f = fixture({ fail: new Set([ALPHA.url]) });
  f.service.versions({ sites: SITES, targets: [ALPHA] });
  await f.flush();
  f.advance(4 * MIN);
  f.service.versions({ sites: SITES, targets: [ALPHA] });
  await f.flush();
  assert.equal(f.captured.length, 1);
  f.advance(1 * MIN);
  f.service.versions({ sites: SITES, targets: [ALPHA] });
  await f.flush();
  assert.equal(f.captured.length, 2);
  assert.deepEqual(f.service.versions({ sites: SITES, targets: [] }), {});
});

test("a capture older than the site's createdAt belongs to a deleted namesake: hidden and recaptured", async () => {
  const versions = new Map([["alpha", Date.parse("2026-09-01T00:00:00.000Z")]]);
  const f = fixture({ versions });
  assert.deepEqual(f.service.versions({ sites: SITES, targets: [] }), {});
  f.service.versions({ sites: SITES, targets: [ALPHA] });
  await f.flush();
  assert.deepEqual(f.captured, [ALPHA.url]);
  assert.deepEqual(f.service.versions({ sites: SITES, targets: [] }), { alpha: T0 });
});

test("an unparseable createdAt keeps an existing capture; a target for an unlisted name is ignored", async () => {
  const f = fixture({ versions: new Map([["alpha", T0 - MIN]]) });
  assert.deepEqual(f.service.versions({ sites: [{ name: "alpha", createdAt: "" }], targets: [{ ...ALPHA, name: "ghost" }] }), { alpha: T0 - MIN });
  await f.flush();
  assert.deepEqual(f.captured, []);
});

test("read delegates to the store", () => {
  const f = fixture({ versions: new Map([["alpha", T0]]) });
  assert.equal(f.service.read({ name: "alpha" })?.toString(), "img:alpha");
  assert.equal(f.service.read({ name: "beta" }), null);
});
