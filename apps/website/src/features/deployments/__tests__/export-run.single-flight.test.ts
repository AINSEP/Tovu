import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";

import { assertExportNotRunning, diagnoseStaticExport, getExportRunSnapshot, startExportRun } from "../export-run-binding.js";
import type { ExportRunReportLike } from "@jini-ai/devops/deploy/site/export-run";

/** Pins the ONE-export-at-a-time contract the host's single export-run instance owns: the admin
 *  route, the trigger tool and the read-only diagnostic all share one slot. */
const clock = { nowMs: () => Date.parse("2026-10-01T10:00:00.000Z") };
const routeDeps = { clock, exportOutputRootDir: "/tmp/single-flight-export" };
const emptyReport = (): ExportRunReportLike => ({ routes: { succeeded: [], failed: [] }, assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] });
function alreadyRunning(error: unknown): boolean {
  assert.ok(error instanceof Error);
  assert.equal((error as Error & { code?: string }).code, "ALREADY_RUNNING");
  return true;
}

test("a running export refuses a second trigger and a diagnostic, and frees the slot once it settles", async () => {
  let resolve!: (value: ExportRunReportLike) => void;
  const held = new Promise<ExportRunReportLike>((done) => { resolve = done; });
  startExportRun({ routeDeps, runExportSite: () => held, clean: false });
  let diagnosticEngineCalls = 0;
  try {
    assert.throws(() => assertExportNotRunning({}), alreadyRunning);
    await assert.rejects(diagnoseStaticExport({ routeDeps, runExportSite: async () => { diagnosticEngineCalls++; return emptyReport(); } }), alreadyRunning);
    assert.equal(diagnosticEngineCalls, 0, "a refused diagnostic never reaches the export engine");
    assert.equal(getExportRunSnapshot().status, "running");
  } finally { resolve(emptyReport()); await setImmediate(); }
  assert.equal(getExportRunSnapshot().status, "completed");
  assert.doesNotThrow(() => assertExportNotRunning({}));
});

test("a diagnostic reserves the slot while it runs and restores the prior snapshot afterwards", async () => {
  const before = getExportRunSnapshot();
  let observedDuring: string | undefined;
  let refusedDuring = false;
  await diagnoseStaticExport({ routeDeps, runExportSite: async () => {
    observedDuring = getExportRunSnapshot().status;
    try { assertExportNotRunning({}); } catch (error) { refusedDuring = alreadyRunning(error); }
    return emptyReport();
  } });
  assert.equal(observedDuring, "running");
  assert.equal(refusedDuring, true, "a trigger arriving mid-diagnostic is refused");
  assert.deepEqual(getExportRunSnapshot(), before);
  assert.doesNotThrow(() => assertExportNotRunning({}));
});

test("a failing diagnostic still releases the slot", async () => {
  const before = getExportRunSnapshot();
  await assert.rejects(diagnoseStaticExport({ routeDeps, runExportSite: async () => { throw new Error("engine down"); } }), /engine down/);
  assert.deepEqual(getExportRunSnapshot(), before);
  assert.doesNotThrow(() => assertExportNotRunning({}));
});
