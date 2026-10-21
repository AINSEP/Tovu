import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { getExportRunSnapshot, type ExportRunReportLike } from "../export-run.js";
import { buildDeploymentsRegistrations, contributeDeploymentsTools, deploymentsDerivedRisk, type DeploymentsToolDeps } from "../tool-registrations.js";

/** deployment_trigger_export's input contract and option forwarding, the Dockerfile conflict text
 *  for a missing file, and the contributor shape — through the registered handlers. */
const report = (): ExportRunReportLike => ({ routes: { succeeded: [], failed: [] }, assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], droppedReferences: [], unreferencedThemeFiles: [] });
function deps(root: string, exportSiteBound: DeploymentsToolDeps["exportSiteBound"]): DeploymentsToolDeps {
  return { workspaceId: "ws-trigger", clock: { nowMs: () => 0 }, exportOutputRootDir: root, authorize: async () => ({ allowed: true, reason: "test-grant" }), exportSiteBound };
}
const ctx = (input: unknown) => ({ principal: { id: "admin-1", kind: "user" as const }, signal: new AbortController().signal, input });
async function settled(): Promise<void> {
  for (let i = 0; i < 200 && getExportRunSnapshot().status === "running"; i++) await setImmediate();
}

test("deployment_trigger_export treats absent input as no options and forwards clean/basePath only when given", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "tovu-trigger-export-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const seen: Array<Record<string, unknown>> = [];
  const tool = buildDeploymentsRegistrations(deps(root, async options => { seen.push({ ...options }); return report(); })).find(r => r.descriptor.id === "deployment_trigger_export")!;
  await tool.handler(ctx(undefined) as never);
  await settled();
  await tool.handler(ctx({ clean: true, basePath: "/repo" }) as never);
  await settled();
  assert.equal(seen.length, 2);
  assert.deepEqual(Object.keys(seen[0]!).sort(), ["clean", "outputDir"]);
  assert.equal(seen[0]!.clean, false);
  assert.equal(seen[1]!.clean, true);
  assert.equal(seen[1]!.basePath, "/repo");
  assert.equal("routeDeps" in seen[1]!, false, "the narrow tool deps never reach exportSiteBound");
});

test("deployment_trigger_export refuses a non-object input before any permission check or export", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "tovu-trigger-export-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let authorized = 0;
  const d = { ...deps(root, async () => assert.fail("must not export")), authorize: async () => { authorized++; return { allowed: true, reason: "test-grant" }; } };
  const tool = buildDeploymentsRegistrations(d).find(r => r.descriptor.id === "deployment_trigger_export")!;
  for (const input of ["clean", 7, null]) await assert.rejects(tool.handler(ctx(input) as never), { name: "ToolInputError", message: "input must be an object" });
  assert.equal(authorized, 0);
});

test("deployment_set_dockerfile's conflict names a missing file as absent, with its current etag", async t => {
  const originalCwd = process.cwd();
  const root = mkdtempSync(path.join(tmpdir(), "tovu-dockerfile-tool-"));
  process.chdir(root);
  t.after(() => { process.chdir(originalCwd); rmSync(root, { recursive: true, force: true }); });
  const tool = buildDeploymentsRegistrations(deps(root, async () => report())).find(r => r.descriptor.id === "deployment_set_dockerfile")!;
  await assert.rejects(tool.handler(ctx({ contents: "FROM node:22\n", ifMatch: '"stale"' }) as never), (error: Error) => {
    assert.match(error.message, /\(the file does not exist\)/);
    assert.match(error.message, /ifMatch set to 'W\/"missing"'/);
    return true;
  });
});

test("contributeDeploymentsTools contributes the deployments registrations with their derived risk", () => {
  const contributor = contributeDeploymentsTools();
  assert.equal(contributor.domain, "deployments");
  assert.equal(contributor.build, buildDeploymentsRegistrations);
  assert.equal(contributor.risk, deploymentsDerivedRisk);
});
