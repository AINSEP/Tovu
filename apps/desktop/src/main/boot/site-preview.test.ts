/**
 * @file Behaviour of the card-preview Electron half (`site-preview.ts`) through live-guest, store
 * and lease ports. Replaces the cut-out-eval and source-regex checks in `main-preview-wiring.test.ts`
 * for `captureSitePreview`, `requestListedSitePreview`, the scheduler's lease fallback and
 * `sweepSitePreviewsOnBoot`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  createListedPreviewRequests, createPreviewTargetResolver, createSitePreviewCapture, sweepSitePreviewsOnBoot,
  PREVIEW_WIDTH_PX,
  type PreviewCapturePorts,
} from "./site-preview.ts";

const target = { siteDir: '/sites/alpha', port: 8123, partition: 'persist:alpha' };
function captureHarness(failure?: 'capture' | 'store' | 'store-null') {
  let url = 'http://127.0.0.1:8123/about';
  let current = true;
  let eligible = true;
  let afterCapture = () => {};
  const writes: unknown[] = [];
  const resizes: unknown[] = [];
  const warnings: string[] = [];
  let captureCalls = 0;
  const guest = {
    partition: target.partition,
    getURL: () => url,
    isCurrent: () => current,
    capturePage: async () => {
      captureCalls++;
      if (failure === 'capture') throw new Error('capture failed');
      afterCapture();
      return { resize: (options: { width: number }) => { resizes.push(options); return { toPNG: () => Buffer.from('png') }; } };
    },
  };
  const ports: PreviewCapturePorts = {
    liveGuest: () => eligible ? guest : undefined,
    writePreview: input => {
      if (failure === 'store') throw new Error('store failed');
      if (failure === 'store-null') return null;
      writes.push(input); return 123;
    },
    warn: message => warnings.push(message),
  };
  return { capture: createSitePreviewCapture({ ports }), writes, resizes, warnings,
    url: (value: string) => { url = value; }, stale: () => { current = false; },
    noGuest: () => { eligible = false; }, afterCapture: (work: () => void) => { afterCapture = work; },
    captureCalls: () => captureCalls,
  };
}

test('capture uses the eligible live public guest and writes its resized image', async () => {
  const h = captureHarness();
  assert.equal(await h.capture(target), true);
  assert.deepEqual(h.resizes, [{ width: PREVIEW_WIDTH_PX }]);
  assert.deepEqual(h.writes, [{ siteDir: target.siteDir, png: Buffer.from('png') }]);
});

test('admin redirect during capture preserves the old thumbnail', async () => {
  const h = captureHarness();
  h.afterCapture(() => h.url('http://127.0.0.1:8123/admin'));
  assert.equal(await h.capture(target), false);
  assert.deepEqual(h.writes, []);
});

test('no eligible guest creates no window and does not capture', async () => {
  const h = captureHarness();
  h.noGuest();
  assert.equal(await h.capture(target), false);
  assert.equal(h.captureCalls(), 0);
});

test('failed capture or storage preserves the prior thumbnail and permits retry', async () => {
  for (const failure of ['capture', 'store', 'store-null'] as const) {
    const h = captureHarness(failure);
    assert.equal(await h.capture(target), false);
    assert.deepEqual(h.writes, []);
    assert.equal(h.warnings.length, failure === 'store-null' ? 0 : 1);
  }
});

test('a hung live capture times out without writing or closing the guest', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const capture = createSitePreviewCapture({ ports: {
    liveGuest: () => ({ partition: target.partition, getURL: () => 'http://127.0.0.1:8123/',
      isCurrent: () => true, capturePage: () => new Promise(() => {}),
    }),
    writePreview: () => assert.fail('hung captures cannot write'), warn: () => {},
  } });
  const pending = capture(target);
  t.mock.timers.tick(10_000);
  assert.equal(await pending, false);
});

test('admin API auth errors query strings and foreign origins never reach capturePage', async () => {
  for (const path of ['/admin', '/api/posts', '/%61dmin/', '/auth/callback', '/login', '/account', '/404', '/about?token=secret', '/about#private']) {
    const h = captureHarness();
    h.url(`http://127.0.0.1:8123${path}`);
    assert.equal(await h.capture(target), false, path);
    assert.equal(h.captureCalls(), 0, path);
  }
  const h = captureHarness();
  h.url('https://foreign.example/about');
  assert.equal(await h.capture(target), false);
  assert.equal(h.captureCalls(), 0);
});

test('release navigation and scheduler cancellation invalidate in-flight captures', async () => {
  for (const change of ['release', 'route', 'cancel'] as const) {
    const h = captureHarness();
    let current = true;
    h.afterCapture(() => {
      if (change === 'release') h.stale();
      if (change === 'route') h.url('http://127.0.0.1:8123/another-public-page');
      if (change === 'cancel') current = false;
    });
    assert.equal(await h.capture(target, { isCurrent: () => current }), false, change);
    assert.deepEqual(h.writes, []);
  }
});

function resolver(openSite?: { server: { port: number } }, lease?: { port: number; scheme: "http" | "https" } | null) {
  const reads: string[] = [];
  const resolve = createPreviewTargetResolver({ ports: {
    openSite: () => openSite,
    readLease: ({ siteDir }) => { reads.push(siteDir); return lease; },
    partitionFor: ({ siteDir }) => `persist:${siteDir}`,
  } });
  return { resolve, reads };
}

test("the target is this launch's own server first, without consulting any lease", () => {
  const r = resolver({ server: { port: 4100 } }, { port: 9999, scheme: "https" });
  assert.deepEqual(r.resolve({ siteDir: "/a" }), { port: 4100, partition: "persist:/a" });
  assert.deepEqual(r.reads, []);
});

// REGRESSION: fails if a site another app runs never gets a card preview (owner 2026-10-13).
test("a site another app runs is captured through its lease's port and scheme", () => {
  assert.deepEqual(resolver(undefined, { port: 3000, scheme: "https" }).resolve({ siteDir: "/dev" }),
    { port: 3000, partition: "persist:/dev", scheme: "https" });
});

test("no own server and no lease, or a lease still starting (port 0), means nothing to capture", () => {
  assert.equal(resolver(undefined, null).resolve({ siteDir: "/a" }), undefined);
  assert.equal(resolver(undefined, undefined).resolve({ siteDir: "/a" }), undefined);
  assert.equal(resolver(undefined, { port: 0, scheme: "http" }).resolve({ siteDir: "/a" }), undefined);
});

test('list polling never schedules a thumbnail capture', () => {
  const request = createListedPreviewRequests({ schedule: () => assert.fail('only public visits schedule captures') });
  request({ siteDir: '/a', port: 8123 });
  request({ siteDir: '/a', port: 8124 });
});

test("the boot sweep hands every tracked site dir to the store's sweep", () => {
  const swept: unknown[] = [];
  sweepSitePreviewsOnBoot({
    projectsPath: "/ud/projects.json",
    readTrackedSites: (p) => { assert.equal(p, "/ud/projects.json"); return [{ siteDir: "/a" }, { siteDir: "/b" }]; },
    sweepOrphanedPreviews: (input) => swept.push(input),
    warn: () => assert.fail("no warning on success"),
  });
  assert.deepEqual(swept, [{ trackedDirs: ["/a", "/b"] }]);
});

test("a failing read or sweep is reported, never thrown — hygiene must not fail a launch", () => {
  for (const failing of ["read", "sweep"] as const) {
    const warnings: string[] = [];
    assert.doesNotThrow(() => sweepSitePreviewsOnBoot({
      projectsPath: "/p",
      readTrackedSites: () => { if (failing === "read") throw new Error("torn file"); return []; },
      sweepOrphanedPreviews: () => { throw new Error("readdir denied"); },
      warn: (message) => warnings.push(message),
    }));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, failing === "read" ? /torn file/ : /readdir denied/);
  }
});
