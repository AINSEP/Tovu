import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";

import { getExportRunSnapshot, startExportRun, type ExportRunReportLike } from "../export-run.js";

function deps() {
  let calls = 0;
  return { exportOutputRootDir: "/tmp/b08-export", clock: { nowMs: () => Date.parse(++calls === 1 ? "2026-10-01T10:00:00.000Z" : "2026-10-01T10:01:00.000Z") } };
}
const report = (): ExportRunReportLike => ({ routes: { succeeded: ["/", "/about"], failed: [] }, assets: { succeeded: ["logo"], failed: [{ url: "/missing.png", reason: "404" }] }, skippedManifestEntries: [{ reason: "unsupported", detail: "private" }], unreferencedThemeFiles: ["unused.css"], basePath: "/docs", basePathRewriteWarning: "absolute URL retained" });

test("a held export exposes running state, forwards exact options and reports asset failures without failing route completeness", async () => {
  const d = deps();
  let resolve!: (value: ExportRunReportLike) => void;
  const held = new Promise<ExportRunReportLike>((done) => { resolve = done; });
  const calls: unknown[] = [];
  const running = startExportRun({ routeDeps: d, runExportSite: (options) => { calls.push(options); return held; }, clean: false }, { basePath: "/docs" });
  try {
    assert.deepEqual(running, { status: "running", startedAtIso: "2026-10-01T10:00:00.000Z", finishedAtIso: null, outputDir: "/tmp/b08-export" });
    assert.deepEqual(getExportRunSnapshot(), running);
    assert.deepEqual(calls, [{ routeDeps: d, outputDir: "/tmp/b08-export", clean: false, basePath: "/docs" }]);
  } finally { resolve(report()); await setImmediate(); }
  assert.deepEqual(getExportRunSnapshot(), {
    status: "completed", startedAtIso: "2026-10-01T10:00:00.000Z", finishedAtIso: "2026-10-01T10:01:00.000Z", outputDir: "/tmp/b08-export", basePath: "/docs", ok: true,
    counts: { routesSucceeded: 2, routesFailed: 0, assetsSucceeded: 1, assetsFailed: 1 },
    failedRoutes: [], failedAssets: [{ url: "/missing.png", reason: "404" }], skippedManifestEntries: [{ reason: "unsupported", detail: "private" }], unreferencedThemeFiles: ["unused.css"], basePathRewriteWarning: "absolute URL retained",
  });
});

test("failed routes make a completed export incomplete and retain every failure detail", async () => {
  startExportRun({ routeDeps: deps(), runExportSite: async () => ({ ...report(), routes: { succeeded: [], failed: [{ path: "/article", kind: "post", reason: "render failed" }] } }), clean: true });
  await setImmediate();
  const snapshot = getExportRunSnapshot();
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.ok, false);
  assert.deepEqual(snapshot.failedRoutes, [{ path: "/article", kind: "post", reason: "render failed" }]);
  assert.deepEqual(snapshot.counts, { routesSucceeded: 0, routesFailed: 1, assetsSucceeded: 1, assetsFailed: 1 });
});

for (const failure of [new Error("disk full"), "export refused"]) {
  test(`a rejected export records ${String(failure)} and a subsequent run clears the error`, async () => {
    // F6.2/F7.1/F7.5: each test creates and settles its own run, then tests recovery.
    startExportRun({ routeDeps: deps(), runExportSite: async () => { throw failure; }, clean: true });
    await setImmediate();
    assert.deepEqual(getExportRunSnapshot(), { status: "errored", startedAtIso: "2026-10-01T10:00:00.000Z", finishedAtIso: "2026-10-01T10:01:00.000Z", outputDir: "/tmp/b08-export", error: failure instanceof Error ? "disk full" : "export refused" });
    startExportRun({ routeDeps: deps(), runExportSite: async () => ({ routes: { succeeded: ["/"], failed: [] }, assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [] }), clean: true });
    await setImmediate();
    assert.deepEqual(getExportRunSnapshot(), { status: "completed", startedAtIso: "2026-10-01T10:00:00.000Z", finishedAtIso: "2026-10-01T10:01:00.000Z", outputDir: "/tmp/b08-export", ok: true, counts: { routesSucceeded: 1, routesFailed: 0, assetsSucceeded: 0, assetsFailed: 0 }, failedRoutes: [], failedAssets: [], skippedManifestEntries: [], unreferencedThemeFiles: [] });
  });
}
