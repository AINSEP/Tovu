/**
 * @file Behaviour of the card-preview Electron half (`site-preview.ts`) through fake windows, store
 * and lease ports. Replaces the cut-out-eval and source-regex checks in `main-preview-wiring.test.ts`
 * for `captureSitePreview`, `requestListedSitePreview`, the scheduler's lease fallback and
 * `sweepSitePreviewsOnBoot`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  createListedPreviewRequests, createPreviewTargetResolver, createSitePreviewCapture, sweepSitePreviewsOnBoot,
  PREVIEW_CAPTURE_HEIGHT_PX, PREVIEW_CAPTURE_WIDTH_PX, PREVIEW_PAINT_SETTLE_MS, PREVIEW_WIDTH_PX,
  type PreviewCapturePorts,
} from "./site-preview.ts";

type FailAt = "create" | "load" | "capture" | "store" | "store-null" | "destroyed-during-settle";

function captureHarness(failAt?: FailAt) {
  const options: unknown[] = [];
  const urls: string[] = [];
  const delays: number[] = [];
  const writes: unknown[] = [];
  const warnings: string[] = [];
  const resizes: unknown[] = [];
  let destroyed = false;
  let destroyCalls = 0;
  const resizedBytes = Buffer.from("resized png");
  const ports: PreviewCapturePorts = {
    createHiddenWindow: (opts) => {
      if (failAt === "create") throw new Error("create failed");
      options.push(opts);
      return {
        loadURL: async (url) => { urls.push(url); if (failAt === "load") throw new Error("load failed"); },
        isDestroyed: () => destroyed,
        destroy: () => { destroyed = true; destroyCalls++; },
        webContents: { capturePage: async () => {
          if (failAt === "capture") throw new Error("capture failed");
          return { resize: (opts) => { resizes.push(opts); return { toPNG: () => resizedBytes }; } };
        } },
      };
    },
    delay: async (ms) => { delays.push(ms); if (failAt === "destroyed-during-settle") destroyed = true; },
    writePreview: (input) => {
      if (failAt === "store") throw new Error("store failed");
      if (failAt === "store-null") return null;
      writes.push(input);
      return 123;
    },
    warn: (message) => warnings.push(message),
  };
  return {
    capture: createSitePreviewCapture({ ports }), options, urls, delays, writes, warnings, resizes, resizedBytes,
    destroyCalls: () => destroyCalls,
  };
}

test("a capture loads the site's OWN public root in a hidden window on the site's partition", async () => {
  const h = captureHarness();
  assert.equal(await h.capture({ siteDir: "/sites/alpha", port: 8123, partition: "persist:alpha" }), true);
  assert.deepEqual(h.options, [{ show: false, width: PREVIEW_CAPTURE_WIDTH_PX, height: PREVIEW_CAPTURE_HEIGHT_PX, webPreferences: { partition: "persist:alpha" } }]);
  assert.deepEqual(h.urls, ["http://127.0.0.1:8123/"], "never /admin/, and http by default");
  assert.deepEqual(h.delays, [PREVIEW_PAINT_SETTLE_MS]);
});

// REGRESSION: an https dev server (`npm run dev` with dev TLS) has a localhost certificate.
test("an https lease loads through localhost, the name its certificate carries", async () => {
  const h = captureHarness();
  await h.capture({ siteDir: "/sites/dev", port: 3000, partition: "persist:dev", scheme: "https" });
  assert.deepEqual(h.urls, ["https://localhost:3000/"]);
});

test("an explicit http scheme still loads the loopback IP", async () => {
  const h = captureHarness();
  await h.capture({ siteDir: "/sites/dev", port: 3000, partition: "p", scheme: "http" });
  assert.deepEqual(h.urls, ["http://127.0.0.1:3000/"]);
});

test("the stored bytes are the resized capture, keyed by siteDir, and the window is destroyed", async () => {
  const h = captureHarness();
  await h.capture({ siteDir: "/sites/beta", port: 8124, partition: "persist:beta" });
  assert.deepEqual(h.resizes, [{ width: PREVIEW_WIDTH_PX }]);
  assert.deepEqual(h.writes, [{ siteDir: "/sites/beta", png: h.resizedBytes }]);
  assert.equal(h.destroyCalls(), 1);
});

test("every failure stage is caught, logged once, reports false, stores nothing and destroys the window", async () => {
  for (const stage of ["load", "capture", "store"] as const) {
    const h = captureHarness(stage);
    assert.equal(await h.capture({ siteDir: "/sites/failing", port: 8125, partition: "p" }), false, stage);
    assert.equal(h.warnings.length, 1, stage);
    assert.match(h.warnings[0]!, new RegExp(`preview for /sites/failing — ${stage} failed`));
    assert.equal(h.destroyCalls(), 1, stage);
    assert.deepEqual(h.writes, []);
  }
});

test("a window that cannot even be created is reported and nothing is destroyed", async () => {
  const h = captureHarness("create");
  assert.equal(await h.capture({ siteDir: "/sites/x", port: 1, partition: "p" }), false);
  assert.match(h.warnings[0]!, /create failed/);
  assert.equal(h.destroyCalls(), 0);
});

test("P1: a store that declines (null) reports an unsuccessful capture so it can be retried", async () => {
  const h = captureHarness("store-null");
  assert.equal(await h.capture({ siteDir: "/sites/x", port: 1, partition: "p" }), false);
  assert.deepEqual(h.warnings, []);
  assert.equal(h.destroyCalls(), 1);
});

test("a window destroyed while settling is not captured and not destroyed twice", async () => {
  const h = captureHarness("destroyed-during-settle");
  assert.equal(await h.capture({ siteDir: "/sites/x", port: 1, partition: "p" }), false);
  assert.deepEqual(h.resizes, []);
  assert.equal(h.destroyCalls(), 0);
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

// REGRESSION: the 4 s list poll must not open a hidden window per tick for a failing capture.
test("the list poll asks once per site and port; a new port earns a fresh attempt", () => {
  const schedules: unknown[][] = [];
  const request = createListedPreviewRequests({ schedule: (...args) => { schedules.push(args); } });
  request({ siteDir: "/sites/web", port: 3000 });
  request({ siteDir: "/sites/web", port: 3000 });
  request({ siteDir: "/sites/web", port: 3001 });
  request({ siteDir: "/sites/other", port: 3000 });
  assert.deepEqual(schedules, [[{ siteDir: "/sites/web" }, {}], [{ siteDir: "/sites/web" }, {}], [{ siteDir: "/sites/other" }, {}]]);
});

test("two request functions keep separate memories", () => {
  const counts = [0, 0];
  const first = createListedPreviewRequests({ schedule: () => { counts[0]!++; } });
  const second = createListedPreviewRequests({ schedule: () => { counts[1]!++; } });
  first({ siteDir: "/a", port: 1 });
  second({ siteDir: "/a", port: 1 });
  assert.deepEqual(counts, [1, 1]);
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
