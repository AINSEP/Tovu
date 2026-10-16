import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { getExportRunSnapshot, startExportRun, type ExportRunReportLike } from "../export-run.js";
import { deploymentsDerivedRisk, buildDeploymentsRegistrations, type DeploymentsToolDeps } from "../tool-registrations.js";
import { capabilityCard } from "../capability-card.js";

const report = (): ExportRunReportLike => ({
  routes: { succeeded: [{ data: "HTML must not enter the diagnostic result" }], failed: [{ path: "/broken", kind: "redirect", reason: "expected a 3xx redirect response, got 404" }] },
  assets: { succeeded: [Buffer.from("binary must not enter the diagnostic result")], failed: [{ url: "/m/missing.jpg", reason: "404" }] },
  skippedManifestEntries: [{ reason: "wildcard", detail: "/old/*" }],
  droppedReferences: [{ page: "/", url: "/missing", attribute: "href", reason: "not-exported" }],
  unreferencedThemeFiles: ["unused.jpg"],
});
function deps(exportSiteBound: DeploymentsToolDeps["exportSiteBound"]): DeploymentsToolDeps {
  return { workspaceId: "ws-diagnostics", clock: { nowMs: () => 0 }, exportOutputRootDir: "/unused/durable-export",
    authorize: async () => ({ allowed: true, reason: "test-grant" }), exportSiteBound };
}
function tools(d: DeploymentsToolDeps) {
  return new Map(buildDeploymentsRegistrations(d).map(tool => [tool.descriptor.id, tool]));
}
const ctx = () => ({ principal: { id: "admin-1", kind: "user" as const }, signal: new AbortController().signal, input: {} });

function alreadyRunning(error: unknown): boolean {
  assert.ok(error instanceof Error);
  assert.match(error.message, /an export is already running/);
  assert.equal((error as Error & { code?: string }).code, "ALREADY_RUNNING");
  return true;
}

test("deployment_diagnose_static_export uses read permission and the injected engine, removes its temp tree and returns all report diagnostics", async () => {
  const previous = getExportRunSnapshot();
  let outputDir = "";
  let calls = 0;
  const d = deps(async options => {
    calls++;
    outputDir = options.outputDir;
    assert.deepEqual(options, { outputDir, clean: false }, "never forwards the narrow routeDeps bag into the bound engine");
    assert.equal(path.dirname(outputDir), tmpdir());
    assert.notEqual(outputDir, d.exportOutputRootDir);
    assert.equal((await stat(outputDir)).isDirectory(), true);
    assert.equal(getExportRunSnapshot().status, "running");
    await writeFile(path.join(outputDir, "index.html"), "temporary diagnostic export");
    return report();
  });
  const permissions: string[] = [];
  const registered = tools({ ...d, authorize: async request => { permissions.push(request.permission); return { allowed: true, reason: "test-grant" }; } });
  const tool = registered.get("deployment_diagnose_static_export")!;
  assert.ok(tool, "diagnostics must be in the agent catalog");
  assert.equal(deploymentsDerivedRisk.get(tool.descriptor.id), "none");
  assert.ok(capabilityCard.pointers.some(pointer => "tool" in pointer && pointer.tool === tool.descriptor.id));
  const result = await tool.handler(ctx() as never);
  assert.equal(calls, 1);
  assert.deepEqual(permissions, ["system.read"]);
  assert.equal(existsSync(outputDir), false);
  assert.deepEqual(getExportRunSnapshot(), previous, "a read-only diagnostic preserves the prior durable export status");
  assert.deepEqual(result, {
    ok: false, counts: { routesSucceeded: 1, routesFailed: 1, assetsSucceeded: 1, assetsFailed: 1 },
    failedRoutes: report().routes.failed, failedAssets: report().assets.failed,
    skippedManifestEntries: report().skippedManifestEntries, droppedReferences: report().droppedReferences,
    unreferencedThemeFiles: report().unreferencedThemeFiles,
  });
});

test("deployment_diagnose_static_export removes the temp tree and releases single-flight after engine rejection", async () => {
  const previous = getExportRunSnapshot();
  let outputDir = "";
  const tool = tools(deps(async options => {
    outputDir = options.outputDir;
    await writeFile(path.join(outputDir, "partial.html"), "partial");
    throw new Error("diagnostic engine failed");
  })).get("deployment_diagnose_static_export")!;
  await assert.rejects(tool.handler(ctx() as never), /diagnostic engine failed/);
  assert.notEqual(outputDir, "");
  assert.equal(existsSync(outputDir), false);
  assert.deepEqual(getExportRunSnapshot(), previous);
});

test("deployment_diagnose_static_export refuses ALREADY_RUNNING while a trigger owns currentRun", async () => {
  let release!: (value: ExportRunReportLike) => void;
  const held = new Promise<ExportRunReportLike>(resolve => { release = resolve; });
  const d = deps(async () => { assert.fail("diagnostic engine must not start during an export"); });
  startExportRun({ routeDeps: d, runExportSite: async () => held, clean: false });
  const running = getExportRunSnapshot();
  try {
    const tool = tools(d).get("deployment_diagnose_static_export")!;
    await assert.rejects(tool.handler(ctx() as never), alreadyRunning);
    assert.equal(getExportRunSnapshot(), running);
  } finally { release(report()); await setImmediate(); }
});

test("an in-flight diagnostic refuses another diagnostic and deployment_trigger_export with ALREADY_RUNNING", async () => {
  const previous = getExportRunSnapshot();
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  let release!: (value: ExportRunReportLike) => void;
  const held = new Promise<ExportRunReportLike>(resolve => { release = resolve; });
  let calls = 0;
  const registered = tools(deps(async () => { calls++; entered(); return held; }));
  const diagnose = registered.get("deployment_diagnose_static_export")!;
  const running = diagnose.handler(ctx() as never);
  try {
    await started;
    await assert.rejects(diagnose.handler(ctx() as never), alreadyRunning);
    await assert.rejects(registered.get("deployment_trigger_export")!.handler(ctx() as never), alreadyRunning);
    assert.equal(calls, 1);
  } finally { release(report()); await running; }
  assert.deepEqual(getExportRunSnapshot(), previous);
});

test("deployment_diagnose_static_export rejects unauthorized callers without running the engine", async () => {
  const previous = getExportRunSnapshot();
  const d = deps(async () => { assert.fail("an unauthorized diagnostic must not export"); });
  const tool = tools({ ...d, authorize: async () => ({ allowed: false, reason: "no grant" }) }).get("deployment_diagnose_static_export")!;
  await assert.rejects(tool.handler(ctx() as never));
  assert.equal(getExportRunSnapshot(), previous);
});
