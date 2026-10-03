import assert from "node:assert/strict";
import test from "node:test";
import { firstExportFailure } from "../export-failure-summary.js";
import type { ExportReport } from "../site-exporter.js";

// F4.3/F4.1: different collection sizes catch a combined count on the mixed-failure path.
test("route precedence reports the route collection count even when more assets also failed", () => {
  const report = {
    routes: { failed: [{ path: "/first", reason: "first route broke" }, { path: "/second", reason: "second route broke" }] },
    assets: { failed: [{ url: "/one.css", reason: "first asset broke" }, { url: "/two.png", reason: "second asset broke" }, { url: "/three.js", reason: "third asset broke" }] },
  } as ExportReport;
  assert.deepEqual(firstExportFailure(report), { kind: "route", identifier: "/first", reason: "first route broke", count: 2 });
  report.routes.failed = [];
  assert.deepEqual(firstExportFailure(report), { kind: "asset", identifier: "/one.css", reason: "first asset broke", count: 3 });
  report.assets.failed = [];
  assert.equal(firstExportFailure(report), undefined);
});
